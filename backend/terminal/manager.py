import uuid
import os
import shutil
from typing import Dict, List, Optional
from .session import TerminalSession, log_lifecycle
from .process_manager import ProcessManager
from .shell_factory import ShellFactory

class TerminalSessionManager:
    def __init__(self):
        self.process_manager = ProcessManager()
        self.sessions: Dict[str, TerminalSession] = {}

    def create_session(self, shell_type: str, cwd: str, cols: int = 80, rows: int = 24) -> TerminalSession:
        log_lifecycle("MANAGER_CREATE_REQUEST", "N/A", f"shell_type={shell_type}, cwd={cwd}, cols={cols}, rows={rows}")
        
        # Validate CWD
        if not cwd:
            cwd = "."
        abs_cwd = os.path.abspath(cwd)
        if not os.path.exists(abs_cwd):
            raise FileNotFoundError(f"Working directory does not exist: {cwd}")
        if not os.path.isdir(abs_cwd):
            raise NotADirectoryError(f"Working directory is not a folder: {cwd}")

        # Validate shell executable
        appname, cmdline = ShellFactory.get_shell_config(shell_type)
        if not os.path.exists(appname) and not shutil.which(appname):
            raise FileNotFoundError(f"Shell executable not found: {appname}")

        session_id = str(uuid.uuid4())
        session = TerminalSession(
            session_id=session_id,
            shell_type=shell_type,
            cwd=abs_cwd,
            process_manager=self.process_manager
        )
        
        # Start the session (spawns subprocess and starts async read tasks)
        session.start(cols=cols, rows=rows)
        
        # Verify assertions
        if session is None:
            raise RuntimeError("Session initialization failed: session object is None.")
        if not session.session_id:
            raise RuntimeError("Session initialization failed: session_id was not generated.")
        if not session.working_directory:
            raise RuntimeError("Session initialization failed: working directory path is invalid.")
        if not session.created_at or not session.last_activity:
            raise RuntimeError("Session initialization failed: timestamps not initialized.")
        if session.stdin_history is None or session.stdout_buffer is None or session.stderr_buffer is None:
            raise RuntimeError("Session initialization failed: stream buffers not initialized.")
        if not session.pid:
            raise RuntimeError("Session initialization failed: process PID is not populated.")
            
        self.sessions[session_id] = session
        log_lifecycle("MANAGER_SESSION_ADDED", session_id, f"Session registered in manager dictionary. Total sessions: {len(self.sessions)}")
        return session

    def close_session(self, session_id: str) -> bool:
        log_lifecycle("MANAGER_CLOSE_REQUEST", session_id, f"Session present in manager: {session_id in self.sessions}")
        if session_id in self.sessions:
            session = self.sessions[session_id]
            session.close()
            del self.sessions[session_id]
            log_lifecycle("MANAGER_SESSION_REMOVED", session_id, f"Session closed & deleted from manager dictionary. Remaining sessions: {len(self.sessions)}")
            return True
        log_lifecycle("MANAGER_CLOSE_NOT_FOUND", session_id, "Session was not found in manager dictionary")
        return False

    def list_sessions(self) -> List[TerminalSession]:
        active_sessions = []
        for sid, session in list(self.sessions.items()):
            is_alive = session._is_alive()
            log_lifecycle("MANAGER_LIST_CHECK", sid, f"is_alive={is_alive}, status={session.status}")
            if is_alive:
                active_sessions.append(session)
            else:
                log_lifecycle("MANAGER_PURGE_DEAD_SESSION", sid, f"Purging dead session during list_sessions. Status={session.status}")
                session.close()
                if sid in self.sessions:
                    del self.sessions[sid]
        return active_sessions

    def get_session(self, session_id: str) -> Optional[TerminalSession]:
        session = self.sessions.get(session_id)
        if session:
            is_alive = session._is_alive()
            log_lifecycle("MANAGER_GET_CHECK", session_id, f"Found session. is_alive={is_alive}, status={session.status}")
            if not is_alive:
                log_lifecycle("MANAGER_PURGE_DEAD_SESSION", session_id, f"Purging dead session during get_session. Status={session.status}")
                session.close()
                if session_id in self.sessions:
                    del self.sessions[session_id]
                return None
            return session
        log_lifecycle("MANAGER_GET_NOT_FOUND", session_id, "Session ID not found in manager dictionary")
        return None

# Global instance of TerminalSessionManager
terminal_manager = TerminalSessionManager()
