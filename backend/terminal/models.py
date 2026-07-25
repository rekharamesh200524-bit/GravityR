from pydantic import BaseModel
from typing import Optional

class TerminalCreateRequest(BaseModel):
    shell_type: Optional[str] = None  # powershell, cmd, git_bash, bash, zsh
    cwd: Optional[str] = None
    cols: Optional[int] = 80
    rows: Optional[int] = 24

class TerminalExecuteRequest(BaseModel):
    command: str

class TerminalResizeRequest(BaseModel):
    cols: int
    rows: int

class TerminalSessionResponse(BaseModel):
    session_id: str
    shell_type: str
    working_directory: str
    created_at: str
    last_activity: str
    status: str
    pid: Optional[int] = None
