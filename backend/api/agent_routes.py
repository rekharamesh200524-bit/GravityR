"""
GravityX AI Agent — Placeholder FastAPI Routes

These endpoints return mock JSON only.
No AI model is connected in this phase.
All heavy computation happens client-side via the TypeScript agent modules.
"""

import time
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from ..database.connection import get_db
from ..services.workspace_manager import workspace_manager
from ..services.agent_runner import agent_runner

router = APIRouter(prefix="/agent", tags=["agent"])


# ─── Request / Response Models ────────────────────────────────

class PlanRequest(BaseModel):
    task_id: str
    prompt: str
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = "GravityX Workspace"
    workspace_root: Optional[str] = None
    git_branch: Optional[str] = "main"
    git_status: Optional[str] = "clean"
    open_file: Optional[str] = None


class ContextRequest(BaseModel):
    task_id: str
    prompt: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None
    file_paths: List[str] = []
    git_branch: Optional[str] = None
    git_status: Optional[str] = None
    open_file: Optional[str] = None
    selected_code: Optional[str] = None


class PromptRequest(BaseModel):
    task_id: str
    workspace_id: Optional[str] = None
    context_files: List[str] = []
    memory_facts: List[str] = []
    project_rules: List[str] = []
    user_prompt: str
    git_branch: Optional[str] = None
    open_file: Optional[str] = None


class ReviewRequest(BaseModel):
    task_id: str
    model_response: str
    workspace_id: Optional[str] = None
    risk_level: Optional[str] = "medium"


# ─── POST /agent/plan ─────────────────────────────────────────

@router.post("/plan")
def plan_task(req: PlanRequest):
    """
    Analyze a user task and return a structured execution plan.
    Incorporates active workspace context.
    """
    session = workspace_manager.get_session(req.workspace_id)
    wid = session.workspace_id if session else req.workspace_id
    wroot = session.root_path if session else req.workspace_root
    wname = session.project_name if session else req.workspace_name

    return {
        "task_id": req.task_id,
        "status": "planned",
        "workspace": {
            "workspace_id": wid,
            "project_name": wname,
            "root_path": wroot,
            "git_branch": req.git_branch
        },
        "summary": f"Analyzed: {req.prompt[:80]}",
        "estimated_complexity": "moderate",
        "estimated_tokens": 4000,
        "risk_level": "medium",
        "execution_steps": [
            {"id": "1", "order": 1, "title": "Parse intent",        "description": "Extract goals from prompt"},
            {"id": "2", "order": 2, "title": "Search repository",   "description": f"Locate relevant files in {wname}"},
            {"id": "3", "order": 3, "title": "Build context",       "description": "Assemble workspace context"},
            {"id": "4", "order": 4, "title": "Construct prompt",    "description": "Build structured prompt"},
            {"id": "5", "order": 5, "title": "Execute with model",  "description": "Send to provider"},
            {"id": "6", "order": 6, "title": "Validate response",   "description": "Check output quality"},
            {"id": "7", "order": 7, "title": "Generate diffs",      "description": "Produce change summary"},
        ],
        "affected_files": [],
        "warnings": [],
        "generated_at": int(time.time() * 1000),
    }


# ─── POST /agent/context ──────────────────────────────────────

@router.post("/context")
def build_context(req: ContextRequest):
    """
    Build context for a task from active workspace files.
    """
    session = workspace_manager.get_session(req.workspace_id)
    wid = session.workspace_id if session else req.workspace_id
    wroot = session.root_path if session else req.workspace_root
    wname = session.project_name if session else "Workspace"

    context_files = [
        {
            "file_path": path,
            "file_name": path.split("/")[-1],
            "language": "typescript",
            "confidence": 0.75,
            "reason": f"Identified inside project {wname}",
            "included": True,
            "size_bytes": 1024,
        }
        for path in req.file_paths[:10]
    ]
    return {
        "task_id": req.task_id,
        "workspace": {
            "workspace_id": wid,
            "project_name": wname,
            "root_path": wroot,
            "git_branch": req.git_branch,
            "open_file": req.open_file
        },
        "files": context_files,
        "total_token_estimate": len(context_files) * 800,
        "truncated": False,
        "generated_at": int(time.time() * 1000),
    }


# ─── POST /agent/prompt ───────────────────────────────────────

@router.post("/prompt")
def build_prompt(req: PromptRequest):
    """
    Construct a structured prompt object for active workspace.
    """
    session = workspace_manager.get_session(req.workspace_id)
    wid = session.workspace_id if session else req.workspace_id
    wroot = session.root_path if session else None

    sections = [
        {"role": "system",      "label": "System Instructions",  "token_count": 350},
        {"role": "context",     "label": f"Workspace Metadata ({wid or 'default'})", "token_count": 80},
        {"role": "context",     "label": "Memory Facts",          "token_count": len(req.memory_facts) * 30},
        {"role": "user",        "label": "User Instruction",      "token_count": len(req.user_prompt) // 4},
    ]
    total = sum(s["token_count"] for s in sections)
    return {
        "task_id": req.task_id,
        "workspace": {
            "workspace_id": wid,
            "root_path": wroot,
            "open_file": req.open_file
        },
        "sections": sections,
        "total_tokens": total,
        "model": "gemini-2.5-pro",
        "temperature": 0.2,
        "max_output_tokens": 8192,
        "generated_at": int(time.time() * 1000),
    }


# ─── POST /agent/review ───────────────────────────────────────

@router.post("/review")
def review_response(req: ReviewRequest):
    """
    Review a model response and produce a structured report.
    """
    session = workspace_manager.get_session(req.workspace_id)
    wid = session.workspace_id if session else req.workspace_id

    return {
        "task_id": req.task_id,
        "workspace_id": wid,
        "summary": "Mock review: Response processed successfully.",
        "files_changed": [],
        "warnings": [],
        "complexity": "moderate",
        "review_notes": "No issues detected in mock mode.",
        "requires_human_approval": req.risk_level in ["high", "critical"],
        "reviewed_at": int(time.time() * 1000),
    }


# ─── POST /agent/run ──────────────────────────────────────────
class AgentRunRequest(BaseModel):
    task_id: str
    prompt: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None
    active_file: Optional[str] = None
    max_iterations: Optional[int] = 5
    mock_steps: Optional[List[Dict[str, Any]]] = None

@router.post("/run")
def run_agent_loop(req: AgentRunRequest, db: Session = Depends(get_db)):
    """
    Execute the complete agent tool loop:
    Analyze -> Tools (Read/Write/Terminal) -> Test -> Fix -> Diff -> Review.
    """
    try:
        session = workspace_manager.get_session(req.workspace_id) or (workspace_manager.get_session(req.workspace_root) if req.workspace_root else None)
        if not session and req.workspace_root and os.path.isabs(req.workspace_root) and os.path.isdir(req.workspace_root):
            session = workspace_manager.open_session(req.workspace_root, req.workspace_id)
        wid = session.workspace_id if session else (req.workspace_id or req.workspace_root)
        if not wid:
            raise HTTPException(status_code=400, detail="Security Alert: No active workspace found. Please open a workspace before running an agent task.")
        res = agent_runner.run(
            task_id=req.task_id,
            prompt=req.prompt,
            workspace_id=wid,
            mock_steps=req.mock_steps,
            db=db
        )
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
def agent_status():
    """
    Return the current agent service status.
    """
    return {
        "status": "online",
        "service": "GravityX Agent Framework",
        "version": "1.0.0-alpha",
        "phase": "framework-only",
        "providers_available": ["google", "openai", "claude", "ollama", "runpod"],
        "model_connected": False,
        "note": "This phase implements the agent architecture. Model integration is Phase 2.",
        "timestamp": int(time.time() * 1000),
    }
