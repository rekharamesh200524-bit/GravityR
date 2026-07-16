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

router = APIRouter(tags=["tools"])

# Resolve workspace root as absolute path relative to this module's location:
# backend/api/tool_routes.py -> backend/api -> backend -> project root
_WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Initialize services with absolute workspace path to avoid CWD ambiguity
review_engine = ReviewEngine(workspace_path=_WORKSPACE_ROOT)
tool_executor = ToolExecutor(workspace_path=_WORKSPACE_ROOT)

# --- Pydantic Schemas ---

class ReviewRequest(BaseModel):
    task_id: str
    prompt: str
    ai_response: str

class DecisionRequest(BaseModel):
    task_id: str
    prompt: Optional[str] = ""
    ai_response: Optional[str] = ""
    files_changed: Optional[List[Dict[str, Any]]] = []

class WriteRequest(BaseModel):
    task_id: str
    path: str
    content: str

class ReadRequest(BaseModel):
    task_id: str
    path: str

class DeleteRequest(BaseModel):
    task_id: str
    path: str

class RenameRequest(BaseModel):
    task_id: str
    old_path: str
    new_path: str

class SearchRequest(BaseModel):
    task_id: str
    query: str

class TerminalRequest(BaseModel):
    task_id: str
    command: str

class GitRequest(BaseModel):
    task_id: str
    action: str
    params: Optional[List[str]] = []

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
    res = tool_executor.write_file(db, req.task_id, req.path, req.content)
    if res.get("status") == "error":
        raise HTTPException(status_code=500, detail=res.get("message"))
    return res

@router.post("/tools/read")
def tool_read(req: ReadRequest, db: Session = Depends(get_db)):
    """Safely read content from a workspace file."""
    res = tool_executor.read_file(db, req.task_id, req.path)
    if res.get("status") == "error":
        raise HTTPException(status_code=404, detail=res.get("message"))
    return res

@router.post("/tools/delete")
def tool_delete(req: DeleteRequest, db: Session = Depends(get_db)):
    """Safely delete a workspace file."""
    res = tool_executor.delete_file(db, req.task_id, req.path)
    if res.get("status") == "error":
        raise HTTPException(status_code=500, detail=res.get("message"))
    return res

@router.post("/tools/rename")
def tool_rename(req: RenameRequest, db: Session = Depends(get_db)):
    """Safely rename or move a workspace file."""
    res = tool_executor.rename_file(db, req.task_id, req.old_path, req.new_path)
    if res.get("status") == "error":
        raise HTTPException(status_code=500, detail=res.get("message"))
    return res

@router.post("/tools/search")
def tool_search(req: SearchRequest, db: Session = Depends(get_db)):
    """Search for a keyword inside files in the workspace."""
    t0 = time.time()
    try:
        results = []
        q = req.query.lower()
        # Scan workspace files using the absolute workspace root path
        for root, dirs, files_list in os.walk(_WORKSPACE_ROOT):
            # Prune excluded directories in-place to optimize traversal speed
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", ".gravityx_backups", ".next", "dist", "build")]
            for f in files_list:
                abs_file_path = os.path.join(root, f)
                rel_path = os.path.relpath(abs_file_path, _WORKSPACE_ROOT)
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/terminal")
def tool_terminal(req: TerminalRequest, db: Session = Depends(get_db)):
    """Run an approved terminal command."""
    res = tool_executor.execute_terminal(db, req.task_id, req.command)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@router.post("/tools/git")
def tool_git(req: GitRequest, db: Session = Depends(get_db)):
    """Perform a Git command inside the repository."""
    res = tool_executor.execute_git(db, req.task_id, req.action, req.params)
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
