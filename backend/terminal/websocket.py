from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .manager import terminal_manager
from .session import log_lifecycle
from .security import is_command_safe
import asyncio
import json
import traceback

ws_router = APIRouter()

@ws_router.websocket("/ws/terminal/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str):
    log_lifecycle("WEBSOCKET_CONNECT_REQUEST", session_id, f"Client IP/host: {websocket.client}")
    
    session = terminal_manager.get_session(session_id)
    if not session:
        log_lifecycle("WEBSOCKET_REJECTED", session_id, "Session ID not found or dead in manager dictionary.")
        await websocket.close(code=1008, reason="Terminal session not found")
        return
        
    await websocket.accept()
    log_lifecycle("WEBSOCKET_ACCEPTED", session_id, f"WebSocket connected. Buffer size: {len(session.stdout_buffer)} bytes, Session status: '{session.status}'")

    send_queue: asyncio.Queue = asyncio.Queue()

    async def output_callback(data: str):
        await send_queue.put(data)

    async def ws_send_loop():
        log_lifecycle("WEBSOCKET_SEND_LOOP_RUNNING", session_id, "ws_send_loop is now running.")
        try:
            while True:
                data = await send_queue.get()
                log_lifecycle("WEBSOCKET_SEND_EXACT", session_id, f"websocket.send_text sending: length={len(data)}, repr={repr(data[:100])}")
                await websocket.send_text(data)
                send_queue.task_done()
        except asyncio.CancelledError:
            log_lifecycle("WEBSOCKET_SEND_LOOP_CANCELLED", session_id, "ws_send_loop task cancelled.")
        except Exception as send_err:
            log_lifecycle("WEBSOCKET_SEND_LOOP_ERROR", session_id, f"Exception in ws_send_loop: {type(send_err).__name__}: {send_err}")

    # Start the send loop task
    send_task = asyncio.create_task(ws_send_loop())

    # Yield control to the event loop so ws_send_loop can start executing
    # before we register the subscriber and flush the buffer
    await asyncio.sleep(0)
    log_lifecycle("WEBSOCKET_SEND_LOOP_YIELDED", session_id, "Event loop yielded - send loop is now active.")

    # IMPORTANT: Register subscriber BEFORE flushing stdout_buffer so we don't
    # lose any output emitted between buffer flush and subscriber registration
    session.register_subscriber(output_callback)
    log_lifecycle("WEBSOCKET_SUBSCRIBER_REGISTERED", session_id, f"Callback registered: {output_callback}, Current buffer size: {len(session.stdout_buffer)} bytes")

    # Flush existing stdout buffer to the client now that subscriber is registered
    # and the send loop is guaranteed to be running
    if session.stdout_buffer:
        log_lifecycle("WEBSOCKET_FLUSH_INITIAL_BUFFER", session_id, f"Flushing initial stdout buffer ({len(session.stdout_buffer)} bytes): {repr(session.stdout_buffer[:200])}")
        await send_queue.put(session.stdout_buffer)
    else:
        log_lifecycle("WEBSOCKET_FLUSH_INITIAL_BUFFER_EMPTY", session_id, "stdout_buffer is empty at connection time - banner will arrive via subscriber callback")

    line_buffer = ""

    try:
        while True:
            data = await websocket.receive_text()
            log_lifecycle("PIPELINE_8_RECEIVE_TEXT", session_id, f"Received websocket text frame ({len(data)} chars): {repr(data)}")
            
            is_json = False
            try:
                msg = json.loads(data)
                if isinstance(msg, dict) and msg.get("type") == "resize":
                    cols = msg.get("cols")
                    rows = msg.get("rows")
                    if cols and rows:
                        session.resize(cols, rows)
                    is_json = True
            except (json.JSONDecodeError, TypeError):
                pass
                
            if not is_json:
                safe = True
                for char in data:
                    if char in ('\r', '\n'):
                        if not is_command_safe(line_buffer):
                            safe = False
                            line_buffer = ""
                            break
                        line_buffer = ""
                    elif char in ('\x7f', '\x08'):
                        if len(line_buffer) > 0:
                            line_buffer = line_buffer[:-1]
                    elif len(char) == 1 and 32 <= ord(char) < 127:
                        line_buffer += char

                if safe:
                    log_lifecycle("PIPELINE_9_SESSION_WRITE", session_id, f"Routing input frame to session.write: {repr(data)}")
                    session.write(data)
                else:
                    log_lifecycle("WEBSOCKET_SECURITY_BLOCK", session_id, f"Blocked unsafe command buffer: {line_buffer}")
                    await websocket.send_text("\r\n\x1b[31m[Security Alert: Command blocked]\x1b[0m\r\n")
                    session.write("\u0003")

    except WebSocketDisconnect:
        log_lifecycle("WEBSOCKET_DISCONNECTED", session_id, "Client disconnected normally (WebSocketDisconnect).")
    except Exception as e:
        log_lifecycle("WEBSOCKET_ERROR", session_id, f"WebSocket error: {type(e).__name__}: {e}\n{traceback.format_exc()}")
        print(f"WebSocket error in session {session_id}: {e}")
    finally:
        log_lifecycle("WEBSOCKET_CLEANUP", session_id, "Cleaning up WebSocket connection and unregistering subscriber.")
        session.unregister_subscriber(output_callback)
        send_task.cancel()
