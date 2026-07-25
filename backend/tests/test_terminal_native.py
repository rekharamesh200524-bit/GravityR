import asyncio
import os
from backend.terminal.manager import terminal_manager

async def main():
    print("--- Running Multi-Terminal Session & Lifecycle Verification ---")
    cwd = "d:\\GravityR"
    
    # 1. Test session creation and isolation
    print("Creating 3 independent terminal sessions...")
    session1 = terminal_manager.create_session(shell_type="powershell", cwd=cwd, cols=80, rows=24)
    session2 = terminal_manager.create_session(shell_type="powershell", cwd=cwd, cols=80, rows=24)
    session3 = terminal_manager.create_session(shell_type="powershell", cwd=cwd, cols=80, rows=24)

    assert session1.session_id != session2.session_id != session3.session_id
    assert session1.pid != session2.pid != session3.pid

    print(f"Session 1: {session1.session_id} (PID {session1.pid})")
    print(f"Session 2: {session2.session_id} (PID {session2.pid})")
    print(f"Session 3: {session3.session_id} (PID {session3.pid})")

    # 2. Test output callback registration
    out1_chunks = []
    async def sub1(data: str):
        out1_chunks.append(data)

    session1.register_subscriber(sub1)

    # Allow PTY startup
    await asyncio.sleep(2)

    # 3. Test independent write commands
    print("Sending unique commands to each terminal tab...")
    session1.write("echo TAB_1_OUTPUT_MARKER\r")
    session2.write("echo TAB_2_OUTPUT_MARKER\r")
    session3.write("echo TAB_3_OUTPUT_MARKER\r")

    # Wait for execution and output reading
    print("Waiting for outputs to process...")
    for _ in range(30):
        if (
            "TAB_1_OUTPUT_MARKER" in session1.stdout_buffer
            and "TAB_2_OUTPUT_MARKER" in session2.stdout_buffer
            and "TAB_3_OUTPUT_MARKER" in session3.stdout_buffer
        ):
            break
        await asyncio.sleep(0.5)

    print("Checking output isolation across sessions...")
    assert "TAB_1_OUTPUT_MARKER" in session1.stdout_buffer, "Session 1 output missing marker"
    assert "TAB_2_OUTPUT_MARKER" in session2.stdout_buffer, "Session 2 output missing marker"
    assert "TAB_3_OUTPUT_MARKER" in session3.stdout_buffer, "Session 3 output missing marker"

    assert "TAB_2_OUTPUT_MARKER" not in session1.stdout_buffer, "Cross-session contamination in Session 1"
    assert "TAB_1_OUTPUT_MARKER" not in session2.stdout_buffer, "Cross-session contamination in Session 2"

    print("Simulated subscriber unregistration for Session 1...")
    session1.unregister_subscriber(sub1)

    # 4. Test independent session termination
    print("Closing Session 2...")
    terminal_manager.close_session(session2.session_id)
    await asyncio.sleep(1)

    assert terminal_manager.get_session(session2.session_id) is None
    assert session1._is_alive() is True
    assert session3._is_alive() is True

    # Cleanup remaining sessions
    print("Closing Session 1 and Session 3...")
    terminal_manager.close_session(session1.session_id)
    terminal_manager.close_session(session3.session_id)
    await asyncio.sleep(1)

    assert terminal_manager.get_session(session1.session_id) is None
    assert terminal_manager.get_session(session3.session_id) is None

    print("All multi-terminal sessions closed cleanly and successfully!")

if __name__ == "__main__":
    asyncio.run(main())
