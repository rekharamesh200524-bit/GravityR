from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import os
import time

from ..database.connection import get_db
from ..database.models import ExecutionLog, AuditLog
from ..services.review_engine import ReviewEngine
from ..services.tool_executor import ToolExecutor
from ..services.workspace_manager import workspace_manager

router = APIRouter(tags=["tools"])

# Initialize services
review_engine = ReviewEngine()
tool_executor = ToolExecutor()

# --- Pydantic Schemas ---

class ReviewRequest(BaseModel):
    task_id: str
    prompt: str
    ai_response: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

class DecisionRequest(BaseModel):
    task_id: str
    prompt: Optional[str] = ""
    ai_response: Optional[str] = ""
    files_changed: Optional[List[Dict[str, Any]]] = []
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

class WriteRequest(BaseModel):
    task_id: str
    path: str
    content: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

class ReadRequest(BaseModel):
    task_id: str
    path: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

class DeleteRequest(BaseModel):
    task_id: str
    path: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

class RenameRequest(BaseModel):
    task_id: str
    old_path: str
    new_path: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

class SearchRequest(BaseModel):
    task_id: str
    query: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

class TerminalRequest(BaseModel):
    task_id: str
    command: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

class GitRequest(BaseModel):
    task_id: str
    action: str
    params: Optional[List[str]] = []
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None

# --- API Endpoints ---

@router.post("/review")
def post_review(req: ReviewRequest):
    """Parse and generate a structured review of the AI modifications."""
    try:
        res = review_engine.review_response(req.task_id, req.prompt, req.ai_response)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/approve")
def post_approve(req: DecisionRequest, db: Session = Depends(get_db)):
    """Log approved changes to the database audit history."""
    try:
        audit = AuditLog(
            id=f"audit-{int(time.time() * 1000)}",
            task_id=req.task_id,
            prompt=req.prompt,
            ai_response=req.ai_response,
            files_changed=str(req.files_changed),
            approvals="approved_all",
            rejections="[]",
            execution_time=0.0,
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S")
        )
        db.add(audit)
        db.commit()
        return {"status": "success", "message": f"Task {req.task_id} approved."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reject")
def post_reject(req: DecisionRequest, db: Session = Depends(get_db)):
    """Log rejected changes to the database audit history."""
    try:
        audit = AuditLog(
            id=f"audit-{int(time.time() * 1000)}",
            task_id=req.task_id,
            prompt=req.prompt,
            ai_response=req.ai_response,
            files_changed=str(req.files_changed),
            approvals="[]",
            rejections="rejected_all",
            execution_time=0.0,
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S")
        )
        db.add(audit)
        db.commit()
        return {"status": "success", "message": f"Task {req.task_id} rejected."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/write")
def tool_write(req: WriteRequest, db: Session = Depends(get_db)):
    """Safely write contents to a workspace file."""
    session = workspace_manager.get_session(req.workspace_id) or (workspace_manager.get_session(req.workspace_root) if req.workspace_root else None)
    if not session and req.workspace_root and os.path.isabs(req.workspace_root) and os.path.isdir(req.workspace_root):
        session = workspace_manager.open_session(req.workspace_root, req.workspace_id)
    wid = session.workspace_id if session else (req.workspace_id or req.workspace_root)
    print(f"[TOOL_WORKSPACE_RESOLVED] tool=write workspace_id={wid} root={session.root_path if session else req.workspace_root or 'default'}", flush=True)
    res = tool_executor.write_file(db, req.task_id, req.path, req.content, workspace_id=wid)
    if res.get("status") == "error":
        msg = res.get("message", "")
        code = 403 if any(s in msg for s in ("Security Alert", "Denied", "outside the active workspace")) else 500
        raise HTTPException(status_code=code, detail=msg)
    return res

@router.post("/tools/read")
def tool_read(req: ReadRequest, db: Session = Depends(get_db)):
    """Safely read content from a workspace file."""
    session = workspace_manager.get_session(req.workspace_id) or (workspace_manager.get_session(req.workspace_root) if req.workspace_root else None)
    if not session and req.workspace_root and os.path.isabs(req.workspace_root) and os.path.isdir(req.workspace_root):
        session = workspace_manager.open_session(req.workspace_root, req.workspace_id)
    wid = session.workspace_id if session else (req.workspace_id or req.workspace_root)
    print(f"[TOOL_WORKSPACE_RESOLVED] tool=read workspace_id={wid} root={session.root_path if session else req.workspace_root or 'default'}", flush=True)
    res = tool_executor.read_file(db, req.task_id, req.path, workspace_id=wid)
    if res.get("status") == "error":
        msg = res.get("message", "")
        code = 403 if any(s in msg for s in ("Security Alert", "Denied", "outside the active workspace")) else 404
        raise HTTPException(status_code=code, detail=msg)
    return res

@router.post("/tools/delete")
def tool_delete(req: DeleteRequest, db: Session = Depends(get_db)):
    """Safely delete a workspace file."""
    session = workspace_manager.get_session(req.workspace_id) or (workspace_manager.get_session(req.workspace_root) if req.workspace_root else None)
    if not session and req.workspace_root and os.path.isabs(req.workspace_root) and os.path.isdir(req.workspace_root):
        session = workspace_manager.open_session(req.workspace_root, req.workspace_id)
    wid = session.workspace_id if session else (req.workspace_id or req.workspace_root)
    print(f"[TOOL_WORKSPACE_RESOLVED] tool=delete workspace_id={wid} root={session.root_path if session else req.workspace_root or 'default'}", flush=True)
    res = tool_executor.delete_file(db, req.task_id, req.path, workspace_id=wid)
    if res.get("status") == "error":
        msg = res.get("message", "")
        code = 403 if any(s in msg for s in ("Security Alert", "Denied", "outside the active workspace")) else 500
        raise HTTPException(status_code=code, detail=msg)
    return res

@router.post("/tools/rename")
def tool_rename(req: RenameRequest, db: Session = Depends(get_db)):
    """Safely rename or move a workspace file."""
    session = workspace_manager.get_session(req.workspace_id) or (workspace_manager.get_session(req.workspace_root) if req.workspace_root else None)
    if not session and req.workspace_root and os.path.isabs(req.workspace_root) and os.path.isdir(req.workspace_root):
        session = workspace_manager.open_session(req.workspace_root, req.workspace_id)
    wid = session.workspace_id if session else (req.workspace_id or req.workspace_root)
    print(f"[TOOL_WORKSPACE_RESOLVED] tool=rename workspace_id={wid} root={session.root_path if session else req.workspace_root or 'default'}", flush=True)
    res = tool_executor.rename_file(db, req.task_id, req.old_path, req.new_path, workspace_id=wid)
    if res.get("status") == "error":
        msg = res.get("message", "")
        code = 403 if any(s in msg for s in ("Security Alert", "Denied", "outside the active workspace")) else 500
        raise HTTPException(status_code=code, detail=msg)
    return res

@router.post("/tools/search")
def tool_search(req: SearchRequest, db: Session = Depends(get_db)):
    """Search for a keyword inside files in the active workspace."""
    t0 = time.time()
    try:
        session = workspace_manager.get_session(req.workspace_id)
        if not session:
            active = workspace_manager.get_active_session()
            if not active:
                raise HTTPException(status_code=400, detail="No active workspace session found for search.")
            session = active

        ws_root = session.root_path
        print(f"[TOOL_WORKSPACE_RESOLVED] tool=search workspace_id={session.workspace_id} root={ws_root}", flush=True)

        results = []
        q = req.query.lower()
        # Scan workspace files using the resolved workspace root path
        for root, dirs, files_list in os.walk(ws_root):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", ".gravityx_backups", ".next", "dist", "build", "__pycache__")]
            for f in files_list:
                abs_file_path = os.path.join(root, f)
                rel_path = os.path.relpath(abs_file_path, ws_root).replace(os.path.sep, "/")
                try:
                    with open(abs_file_path, "r", encoding="utf-8", errors="ignore") as file_read:
                        content = file_read.read()
                        if q in content.lower():
                            results.append({
                                "filePath": rel_path,
                                "fileName": f,
                                "matchCount": content.lower().count(q)
                            })
                except Exception:
                    pass
        elapsed = time.time() - t0
        tool_executor._log_execution(db, req.task_id, "search", f"Searched workspace for: '{req.query}' (Found {len(results)} matches)", "success", elapsed)
        return {"status": "success", "results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/terminal")
def tool_terminal(req: TerminalRequest, db: Session = Depends(get_db)):
    """Run an approved terminal command."""
    session = workspace_manager.get_session(req.workspace_id)
    wid = session.workspace_id if session else req.workspace_id
    print(f"[TOOL_WORKSPACE_RESOLVED] tool=terminal workspace_id={wid} root={session.root_path if session else 'default'}", flush=True)
    res = tool_executor.execute_terminal(db, req.task_id, req.command, workspace_id=wid)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@router.post("/tools/git")
def tool_git(req: GitRequest, db: Session = Depends(get_db)):
    """Perform a Git command inside the repository."""
    session = workspace_manager.get_session(req.workspace_id)
    wid = session.workspace_id if session else req.workspace_id
    print(f"[TOOL_WORKSPACE_RESOLVED] tool=git workspace_id={wid} root={session.root_path if session else 'default'}", flush=True)
    res = tool_executor.execute_git(db, req.task_id, req.action, req.params, workspace_id=wid)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@router.get("/execution/logs", response_model=List[Dict[str, Any]])
def get_execution_logs(task_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Fetch logs from the SQLite execution logs table."""
    try:
        query = db.query(ExecutionLog)
        if task_id:
            query = query.filter(ExecutionLog.task_id == task_id)
        logs = query.order_by(ExecutionLog.timestamp.desc()).all()
        return [
            {
                "id": log.id,
                "task_id": log.task_id,
                "operation_type": log.operation_type,
                "details": log.details,
                "status": log.status,
                "execution_time": log.execution_time,
                "timestamp": log.timestamp
            }
            for log in logs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
