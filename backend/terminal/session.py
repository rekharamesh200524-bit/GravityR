import os
import sys
import asyncio
import datetime
import traceback
from typing import Callable, Optional, Set
from .shell_factory import ShellFactory
from .process_manager import ProcessManager
from ..services.workspace_manager import workspace_manager

def log_lifecycle(event_type: str, session_id: str, message: str):
    timestamp = datetime.datetime.utcnow().isoformat()
    log_msg = f"[TERMINAL LIFECYCLE] [{timestamp}] [{event_type}] [Session: {session_id}] {message}"
    print(log_msg, flush=True)

class TerminalSession:
    def __init__(
        self,
        session_id: str,
        shell_type: str = "powershell",
        cwd: Optional[str] = None,
        process_manager: Optional[ProcessManager] = None
    ):
        self.session_id = session_id
        self.shell_type = shell_type
        
        active_ws = workspace_manager.get_active_session()
        fallback_cwd = active_ws.root_path if active_ws else os.getcwd()
        self.working_directory = cwd if cwd and os.path.exists(cwd) else fallback_cwd
        
        self.created_at = datetime.datetime.utcnow()
        self.last_activity = datetime.datetime.utcnow()
        self.status = "created"  # created, running, closed, failed
        
        self.process = None
        self.pid = None
        self.process_manager = process_manager or ProcessManager()
        
        self.stdin_history = []
        self.stdout_buffer = ""
        self.stderr_buffer = ""

        self.subscribers: Set[Callable[[str], None]] = set()
        self.read_task = None
        self._loop = None
        self._last_alive_state = None

        log_lifecycle("INIT", self.session_id, f"Shell: {shell_type}, CWD: {self.working_directory}")

    def start(self, cols: int = 80, rows: int = 24):
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

        appname, cmdline = ShellFactory.get_shell_config(self.shell_type)
        target_cmdline = cmdline if cmdline else f'"{appname}"'
        log_lifecycle(
            "STARTUP_STAGE_1_SPAWN",
            self.session_id,
            f"Spawning shell executable '{appname}' with args '{target_cmdline}' in CWD '{self.working_directory}' (cols={cols}, rows={rows})..."
        )
        
        try:
            if sys.platform == "win32":
                import winpty
                argv = [appname]
                if cmdline:
                    argv.extend(cmdline.split())
                
                self.process = winpty.PtyProcess.spawn(
                    argv,
                    cwd=self.working_directory,
                    dimensions=(rows, cols)
                )
                self.pid = self.process.pid
                log_lifecycle("STARTUP_STAGE_2_WINPTY_READY", self.session_id, f"Winpty PtyProcess initialized. PID: {self.pid}")
            else:
                try:
                    import ptyprocess
                    self.process = ptyprocess.PtyProcess.spawn(
                        argv=[appname] + (cmdline.split() if cmdline else []),
                        cwd=self.working_directory
                    )
                    self.pid = self.process.pid
                except ImportError:
                    import pty
                    import select
                    pid, fd = pty.fork()
                    if pid == 0:  # Child
                        os.chdir(self.working_directory)
                        os.execvp(appname, [appname] + (cmdline.split() if cmdline else []))
                    else:  # Parent
                        class UnixPTY:
                            def __init__(self, fd, pid):
                                self.fd = fd
                                self.pid = pid
                            def isalive(self):
                                try:
                                    res, _ = os.waitpid(self.pid, os.WNOHANG)
                                    return res == 0
                                except ChildProcessError:
                                    return False
                            def read(self, length=1024, blocking=False):
                                if not blocking:
                                    r, _, _ = select.select([self.fd], [], [], 0)
                                    if not r:
                                        return ""
                                try:
                                    data = os.read(self.fd, length)
                                    return data.decode("utf-8", errors="ignore")
                                except OSError:
                                    return ""
                            def write(self, data):
                                return os.write(self.fd, data.encode("utf-8"))
                            def set_size(self, cols, rows):
                                import fcntl
                                import termios
                                import struct
                                size = struct.pack("HHHH", rows, cols, 0, 0)
                                fcntl.ioctl(self.fd, termios.TIOCSWINSZ, size)
                        
                        self.process = UnixPTY(fd, pid)
                        self.pid = pid

            if self.pid:
                self.process_manager.register_process(self.pid)
            
            alive = self._is_alive()
            log_lifecycle("SPAWN_SUCCESS", self.session_id, f"PID: {self.pid}, Process object created: {bool(self.process)}, _is_alive(): {alive}")
            print(f"[TERMINAL DEBUG] PTY created", flush=True)
            print(f"[TERMINAL DEBUG] PTY cwd={self.working_directory}", flush=True)

            self.status = "running"
            self.read_task = asyncio.create_task(self._read_loop())
            log_lifecycle("READ_TASK_CREATED", self.session_id, f"Read loop task started: {self.read_task}")
            
        except Exception as e:
            log_lifecycle("START_FAILED", self.session_id, f"Exception during launch: {type(e).__name__}: {str(e)}\n{traceback.format_exc()}")
            self.status = "failed"
            self.stdout_buffer += f"\nFailed to start terminal session: {str(e)}\n"
            raise RuntimeError(f"Subprocess launch failed: {str(e)}")

    async def _read_loop(self):
        log_lifecycle("READ_LOOP_STARTED", self.session_id, f"PID: {self.pid}, status: {self.status}, is_alive: {self._is_alive()}")
        try:
            while self.status == "running" and self.process and self._is_alive():
                try:
                    if hasattr(self.process, "read"):
                        data = await asyncio.to_thread(self.process.read, 1024, blocking=False)
                    else:
                        data = ""

                    if data:
                        log_lifecycle("PROCESS_READ_EXACT", self.session_id, f"process.read returned: length={len(data)}, repr={repr(data[:100])}")
                        self.last_activity = datetime.datetime.utcnow()
                        self.stdout_buffer += data
                        # Broadcast to subscribers
                        for subscriber in list(self.subscribers):
                            try:
                                log_lifecycle("STARTUP_STAGE_4_LOOP_BROADCAST", self.session_id, f"Dispatched {len(data)} chars to subscriber {subscriber}")
                                await subscriber(data)
                            except Exception as sub_err:
                                log_lifecycle("SUBSCRIBER_DISPATCH_ERROR", self.session_id, f"Subscriber error: {sub_err}")
                except EOFError:
                    log_lifecycle("READ_LOOP_EOF", self.session_id, "PTY process EOF reached.")
                    break
                except Exception as read_err:
                    log_lifecycle("PROCESS_READ_EXCEPTION", self.session_id, f"read_err: {type(read_err).__name__}: {read_err}")
                    if not self._is_alive() or self.status != "running":
                        log_lifecycle("READ_ERROR_PROCESS_DEAD", self.session_id, f"Process dead after read exception: {type(read_err).__name__}: {read_err}. Exiting read loop.")
                        break

                await asyncio.sleep(0.01)

            log_lifecycle(
                "READ_LOOP_EXIT_CONDITION",
                self.session_id,
                f"Loop while-condition evaluated false. status='{self.status}', process_exists={bool(self.process)}, is_alive={self._is_alive()}"
            )
        except asyncio.CancelledError:
            log_lifecycle("READ_LOOP_CANCELLED", self.session_id, "Read loop task was explicitly cancelled.")
        except Exception as e:
            log_lifecycle("READ_LOOP_UNHANDLED_ERROR", self.session_id, f"Read loop terminated unexpectedly: {type(e).__name__}: {e}\n{traceback.format_exc()}")
            self.stdout_buffer += f"\nError in read loop: {str(e)}\n"
        finally:
            log_lifecycle("READ_LOOP_FINALLY", self.session_id, f"Cleaning up read loop. Previous status='{self.status}'. Setting status='closed' & calling close()")
            self.status = "closed"
            for subscriber in list(self.subscribers):
                try:
                    await subscriber("\r\n[Terminal session disconnected]\r\n")
                except Exception:
                    pass
            self.close()

    def _is_alive(self) -> bool:
        if not self.process:
            alive = False
        else:
            try:
                alive = self.process.isalive()
            except Exception as e:
                log_lifecycle("IS_ALIVE_EXCEPTION", self.session_id, f"Error calling process.isalive(): {e}")
                alive = False

        if self._last_alive_state != alive:
            log_lifecycle("IS_ALIVE_STATE_CHANGED", self.session_id, f"PID: {self.pid}, Previous: {self._last_alive_state}, New: {alive}")
            self._last_alive_state = alive

        return alive

    def write(self, data: str):
        log_lifecycle("PIPELINE_10_PTY_WRITE", self.session_id, f"Writing {len(data)} chars to PTY stdin (repr: {repr(data)}). Status: {self.status}")
        if self.status != "running" or not self.process:
            log_lifecycle("SESSION_WRITE_IGNORED", self.session_id, f"Write ignored: status={self.status}, process={bool(self.process)}")
            return
        
        self.last_activity = datetime.datetime.utcnow()
        self.stdin_history.append(data)
        try:
            self.process.write(data)
            log_lifecycle("PIPELINE_10_PTY_WRITE_SUCCESS", self.session_id, f"Successfully wrote {len(data)} chars to process.write()")
        except Exception as e:
            log_lifecycle("SESSION_WRITE_ERROR", self.session_id, f"Error writing to process: {type(e).__name__}: {e}")

    def resize(self, cols: int, rows: int):
        log_lifecycle("SESSION_RESIZE", self.session_id, f"Resizing to cols={cols}, rows={rows}")
        if self.process:
            try:
                self.process.set_size(cols, rows)
            except Exception as e:
                log_lifecycle("SESSION_RESIZE_ERROR", self.session_id, f"Failed to resize terminal: {e}")

    def register_subscriber(self, callback: Callable[[str], None]):
        self.subscribers.add(callback)
        log_lifecycle("SUBSCRIBER_REGISTERED", self.session_id, f"Callback: {callback}, Total subscribers: {len(self.subscribers)}")

    def unregister_subscriber(self, callback: Callable[[str], None]):
        if callback in self.subscribers:
            self.subscribers.remove(callback)
            log_lifecycle("SUBSCRIBER_UNREGISTERED", self.session_id, f"Callback: {callback}, Remaining subscribers: {len(self.subscribers)}")

    def close(self):
        caller = traceback.extract_stack(limit=2)[0]
        log_lifecycle(
            "SESSION_CLOSE_CALLED",
            self.session_id,
            f"Called by {caller.filename}:{caller.lineno} in {caller.name}. Status before close: '{self.status}', PID: {self.pid}"
        )

        if self.status == "closed":
            log_lifecycle("SESSION_CLOSE_ALREADY_CLOSED", self.session_id, "Session is already closed. Skipping duplicate cleanup.")
            return

        self.status = "closed"

        if self.read_task and not self.read_task.done():
            log_lifecycle("SESSION_CLOSE_CANCEL_READ_TASK", self.session_id, f"Cancelling read_task {self.read_task}")
            self.read_task.cancel()

        if self.pid:
            log_lifecycle("SESSION_CLOSE_TERMINATE_PROCESS", self.session_id, f"Terminating process tree for PID {self.pid}")
            self.process_manager.terminate_process_tree(self.pid)
            self.pid = None

        if self.process:
            try:
                if hasattr(self.process, 'close'):
                    self.process.close()
            except Exception as e:
                log_lifecycle("SESSION_CLOSE_PROCESS_ERROR", self.session_id, f"Error calling process.close(): {e}")
            self.process = None

        self.subscribers.clear()
        log_lifecycle("SESSION_CLOSED_COMPLETE", self.session_id, "Session resources fully released.")
