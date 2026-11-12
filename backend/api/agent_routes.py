"""
GravityX AI Agent — FastAPI Routes & WebSocket Execution Stream
"""

import os
import time
import json
import asyncio
from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from ..database.connection import get_db
from ..services.workspace_manager import workspace_manager
from ..services.agent_runner import agent_runner
from ..services.tool_registry import TOOL_REGISTRY
from ..services.review_engine import ReviewEngine
from ..ai_gateway.config.gateway_config import gateway_config

router = APIRouter(prefix="/agent", tags=["agent"])
agent_ws_router = APIRouter()


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


class AgentRunRequest(BaseModel):
    task_id: str
    prompt: str
    workspace_id: Optional[str] = None
    workspace_root: Optional[str] = None
    active_file: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    mode: str = "agent"  # "ask" | "agent"
    max_iterations: Optional[int] = 8
    mock_steps: Optional[List[Dict[str, Any]]] = None


class AgentCancelRequest(BaseModel):
    task_id: str


@router.post("/plan")
def plan_task(req: PlanRequest, db: Session = Depends(get_db)):
    session = workspace_manager.get_session(req.workspace_id) or (
        workspace_manager.get_session(req.workspace_root) if req.workspace_root else None
    )
    wid = session.workspace_id if session else req.workspace_id
    wroot = session.root_path if session else req.workspace_root
    wname = session.project_name if session else req.workspace_name

    affected: List[str] = []
    if wid or wroot:
        try:
            ctx = agent_runner.retrieve_repository_context(db, req.prompt, wid or wroot, active_file=req.open_file, max_files=6)
            affected = [f.get("filePath") or f.get("path") for f in ctx.get("files", []) if f.get("filePath") or f.get("path")]
        except Exception:
            pass

    return {
        "task_id": req.task_id,
        "status": "planned",
        "workspace": {
            "workspace_id": wid,
            "project_name": wname,
            "root_path": wroot,
            "git_branch": req.git_branch,
        },
        "summary": f"Analyzed: {req.prompt[:80]}",
        "estimated_complexity": "moderate" if len(affected) <= 3 else "complex",
        "estimated_tokens": 4000,
        "risk_level": "medium",
        "execution_steps": [
            {"id": "1", "order": 1, "title": "Retrieve repository context", "description": f"Inspect {len(affected)} relevant file(s) in {wname}"},
            {"id": "2", "order": 2, "title": "Iterative tool execution", "description": "Read, edit, and verify source files"},
            {"id": "3", "order": 3, "title": "Validate changes", "description": "Run build/typecheck/tests"},
            {"id": "4", "order": 4, "title": "Generate diff review", "description": "Present unified diffs for approval"},
        ],
        "affected_files": affected,
        "warnings": [],
        "generated_at": int(time.time() * 1000),
    }


@router.post("/context")
def build_context(req: ContextRequest, db: Session = Depends(get_db)):
    session = workspace_manager.get_session(req.workspace_id) or (
        workspace_manager.get_session(req.workspace_root) if req.workspace_root else None
    )
    wid = session.workspace_id if session else req.workspace_id
    wroot = session.root_path if session else req.workspace_root
    wname = session.project_name if session else "Workspace"

    files_out = []
    if wid or wroot:
        ctx = agent_runner.retrieve_repository_context(db, req.prompt, wid or wroot, active_file=req.open_file)
        for f in ctx.get("files", []):
            p = f.get("filePath") or f.get("path") or ""
            files_out.append({
                "file_path": p,
                "file_name": os.path.basename(p),
                "language": f.get("language", "plaintext"),
                "confidence": f.get("confidence", 0.7),
                "reason": "Ranked by PromptIntelligencePipeline",
                "included": True,
                "size_bytes": len((f.get("content") or "").encode("utf-8")),
            })

    return {
        "task_id": req.task_id,
        "workspace": {
            "workspace_id": wid,
            "project_name": wname,
            "root_path": wroot,
            "git_branch": req.git_branch,
            "open_file": req.open_file,
        },
        "files": files_out,
        "total_token_estimate": sum(f["size_bytes"] // 4 for f in files_out),
        "truncated": False,
        "generated_at": int(time.time() * 1000),
    }


@router.post("/prompt")
def build_prompt(req: PromptRequest):
    session = workspace_manager.get_session(req.workspace_id)
    wid = session.workspace_id if session else req.workspace_id
    wroot = session.root_path if session else None

    sections = [
        {"role": "system", "label": "System Instructions", "token_count": 350},
        {"role": "context", "label": f"Workspace Metadata ({wid or 'default'})", "token_count": 80},
        {"role": "context", "label": "Memory Facts", "token_count": len(req.memory_facts) * 30},
        {"role": "user", "label": "User Instruction", "token_count": max(1, len(req.user_prompt) // 4)},
    ]
    return {
        "task_id": req.task_id,
        "workspace": {"workspace_id": wid, "root_path": wroot, "open_file": req.open_file},
        "sections": sections,
        "total_tokens": sum(s["token_count"] for s in sections),
        "model": gateway_config.ACTIVE_MODEL,
        "temperature": 0.1,
        "max_output_tokens": 8192,
        "generated_at": int(time.time() * 1000),
    }


@router.post("/review")
def review_response(req: ReviewRequest):
    session = workspace_manager.get_session(req.workspace_id)
    wroot = session.root_path if session else "."
    engine = ReviewEngine(workspace_path=wroot)
    return engine.review_response(req.task_id, "", req.model_response)


@router.get("/tools")
def list_agent_tools(mode: str = "agent"):
    """Return structured tool registry definitions."""
    tools = []
    for defn in TOOL_REGISTRY.values():
        if mode == "ask" and defn.mutating:
            continue
        tools.append({
            "name": defn.name,
            "category": defn.category,
            "description": defn.description,
            "input_schema": defn.input_schema,
            "output_schema": defn.output_schema,
            "mutating": defn.mutating,
            "requires_approval": defn.requires_approval,
        })
    return {"status": "success", "mode": mode, "tools": tools}


@router.post("/run")
def run_agent_loop(req: AgentRunRequest, db: Session = Depends(get_db)):
    """Execute the complete iterative agent tool loop (Ask or Agent mode)."""
    try:
        session = workspace_manager.get_session(req.workspace_id) or (
            workspace_manager.get_session(req.workspace_root) if req.workspace_root else None
        )
        if not session and req.workspace_root and os.path.isabs(req.workspace_root) and os.path.isdir(req.workspace_root):
            session = workspace_manager.open_session(req.workspace_root, req.workspace_id)
        wid = session.workspace_id if session else (req.workspace_id or req.workspace_root)
        if not wid:
            raise HTTPException(
                status_code=400,
                detail="Security Alert: No active workspace found. Please open a workspace before running an agent task.",
            )
        res = agent_runner.run(
            task_id=req.task_id,
            prompt=req.prompt,
            workspace_id=wid,
            mock_steps=req.mock_steps,
            db=db,
            provider=req.provider,
            model=req.model,
            mode=req.mode,
            active_file=req.active_file,
            max_iterations=req.max_iterations,
        )
        if res.get("status") == "failed" and res.get("http_status"):
            return JSONResponse(status_code=int(res["http_status"]), content=res)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel")
def cancel_agent_task(req: AgentCancelRequest):
    ok = agent_runner.cancel(req.task_id)
    return {"status": "success", "cancelled": ok, "task_id": req.task_id}


@router.get("/tasks/{task_id}")
def get_agent_task_state(task_id: str):
    state = agent_runner.get_task_state(task_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return state


@router.get("/status")
def agent_status():
    cfg = gateway_config.get_masked_config()
    any_configured = any(p.get("configured") for p in cfg["providers"].values())
    return {
        "status": "online",
        "service": "GravityX Agent Execution Engine",
        "version": "2.0.0",
        "providers_available": list(cfg["providers"].keys()),
        "model_connected": any_configured,
        "config": cfg,
        "timestamp": int(time.time() * 1000),
    }


@agent_ws_router.websocket("/ws/agent/{task_id}")
async def agent_stream_websocket(websocket: WebSocket, task_id: str):
    """Stream live agent execution events for a task_id over WebSocket."""
    await websocket.accept()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def on_event(evt: Dict[str, Any]):
        loop.call_soon_threadsafe(queue.put_nowait, evt)

    agent_runner.subscribe(task_id, on_event)
    try:
        # Send any already-recorded timeline events immediately
        existing = agent_runner.get_task_state(task_id)
        if existing and existing.get("timeline"):
            for evt in existing["timeline"]:
                await websocket.send_text(json.dumps(evt))

        while True:
            try:
                evt = await asyncio.wait_for(queue.get(), timeout=1.0)
                await websocket.send_text(json.dumps(evt))
                if evt.get("label") in ("COMPLETED", "FAILED", "CANCELLED"):
                    break
            except asyncio.TimeoutError:
                state = agent_runner.get_task_state(task_id)
                if state and state.get("status") in ("completed", "failed", "cancelled", "max_iterations_reached"):
                    break
    except WebSocketDisconnect:
        pass
    finally:
        agent_runner.unsubscribe(task_id, on_event)
