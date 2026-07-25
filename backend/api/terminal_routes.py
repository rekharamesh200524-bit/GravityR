from fastapi import APIRouter, HTTPException
import traceback
import sys
from ..terminal.manager import terminal_manager
from ..terminal.models import (
    TerminalCreateRequest,
    TerminalExecuteRequest,
    TerminalResizeRequest,
    TerminalSessionResponse
)
from ..terminal.security import is_command_safe
from ..terminal.shell_factory import ShellFactory

router = APIRouter(prefix="/terminal", tags=["Terminal"])

def log_creation_failure(e: Exception, cwd: str, shell_type: str, session_id: str = None, pid: int = None):
    """
    Exposes complete diagnostic details about process initialization failures.
    Logs exception type, message, exact failing line, target directory, and shell executable.
    """
    print("\n" + "="*50)
    print("TERMINAL CREATION FAILURE DETECTED")
    print("="*50)
    print(f"Exception Type: {type(e).__name__}")
    print(f"Exception Message: {str(e)}")
    print(f"CWD: {cwd}")
    print(f"Requested Shell Type: {shell_type}")
    try:
        appname, _ = ShellFactory.get_shell_config(shell_type)
        print(f"Resolved Shell Executable: {appname}")
    except Exception:
        print("Resolved Shell Executable: (Could not resolve)")
    
    if session_id:
        print(f"Session ID: {session_id}")
    if pid:
        print(f"PID: {pid}")

    # Extract exact failing line from traceback
    try:
        tb = e.__traceback__
        while tb and tb.tb_next:
            tb = tb.tb_next
        if tb:
            frame = tb.tb_frame
            code = frame.f_code
            print(f"Failing File: {code.co_filename}")
            print(f"Failing Line Number: {tb.tb_lineno}")
            print(f"Failing Function Name: {code.co_name}")
    except Exception as parse_err:
        print(f"Could not parse failing frame: {parse_err}")
        
    print("\nFull Stack Trace:")
    traceback.print_exc(file=sys.stdout)
    print("="*50 + "\n")

@router.post("/create", response_model=TerminalSessionResponse)
async def create_session(req: TerminalCreateRequest):
    cwd = req.cwd or "."
    shell_type = req.shell_type or "powershell"
    
    print("Creating terminal session...")
    print(f"Selected shell: {shell_type}")
    print(f"Working directory: {cwd}")
    
    session_id_ref = None
    pid_ref = None
    
    try:
        session = terminal_manager.create_session(
            shell_type=shell_type,
            cwd=cwd,
            cols=req.cols or 80,
            rows=req.rows or 24
        )
        session_id_ref = session.session_id
        pid_ref = session.pid
        
        print("Spawn successful!")
        print(f"PID: {session.pid}")
        print(f"Session created: {session.session_id}")
        
        return TerminalSessionResponse(
            session_id=session.session_id,
            shell_type=session.shell_type,
            working_directory=session.working_directory,
            created_at=session.created_at.isoformat(),
            last_activity=session.last_activity.isoformat(),
            status=session.status,
            pid=session.pid
        )
    except FileNotFoundError as e:
        log_creation_failure(e, cwd, shell_type, session_id_ref, pid_ref)
        raise HTTPException(status_code=404, detail=f"File not found: {str(e)}")
    except NotADirectoryError as e:
        log_creation_failure(e, cwd, shell_type, session_id_ref, pid_ref)
        raise HTTPException(status_code=400, detail=f"Invalid working directory: {str(e)}")
    except PermissionError as e:
        log_creation_failure(e, cwd, shell_type, session_id_ref, pid_ref)
        raise HTTPException(status_code=403, detail=f"Permission denied: {str(e)}")
    except RuntimeError as e:
        log_creation_failure(e, cwd, shell_type, session_id_ref, pid_ref)
        raise HTTPException(status_code=500, detail=f"Failed to spawn shell process: {str(e)}")
    except Exception as e:
        log_creation_failure(e, cwd, shell_type, session_id_ref, pid_ref)
        raise HTTPException(status_code=500, detail=f"Session initialization failed: {str(e)}")

@router.post("/{session_id}/execute")
async def execute_command(session_id: str, req: TerminalExecuteRequest):
    session = terminal_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Terminal session not found")
        
    if not is_command_safe(req.command):
        raise HTTPException(status_code=403, detail="Security Alert: Command is blocked.")
        
    try:
        session.write(req.command + "\r")
        return {"status": "success", "message": "Command sent to terminal session"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to execute command: {str(e)}")

@router.post("/{session_id}/resize")
async def resize_terminal(session_id: str, req: TerminalResizeRequest):
    session = terminal_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Terminal session not found")
        
    try:
        session.resize(req.cols, req.rows)
        return {"status": "success"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to resize terminal: {str(e)}")

@router.post("/{session_id}/close")
async def close_session(session_id: str):
    try:
        success = terminal_manager.close_session(session_id)
        if not success:
            raise HTTPException(status_code=404, detail="Terminal session not found or already closed")
        return {"status": "success", "message": "Terminal session closed"}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to close terminal session: {str(e)}")

@router.get("/list", response_model=list[TerminalSessionResponse])
async def list_sessions():
    try:
        sessions = terminal_manager.list_sessions()
        return [
            TerminalSessionResponse(
                session_id=s.session_id,
                shell_type=s.shell_type,
                working_directory=s.working_directory,
                created_at=s.created_at.isoformat(),
                last_activity=s.last_activity.isoformat(),
                status=s.status,
                pid=s.pid
            )
            for s in sessions
        ]
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list terminal sessions: {str(e)}")

@router.get("/{session_id}", response_model=TerminalSessionResponse)
async def get_session(session_id: str):
    try:
        session = terminal_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Terminal session not found")
        return TerminalSessionResponse(
            session_id=session.session_id,
            shell_type=session.shell_type,
            working_directory=session.working_directory,
            created_at=session.created_at.isoformat(),
            last_activity=session.last_activity.isoformat(),
            status=session.status,
            pid=session.pid
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to retrieve terminal session: {str(e)}")
