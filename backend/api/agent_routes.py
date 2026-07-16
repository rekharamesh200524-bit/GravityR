"""
GravityX AI Agent — Placeholder FastAPI Routes

These endpoints return mock JSON only.
No AI model is connected in this phase.
All heavy computation happens client-side via the TypeScript agent modules.
"""

import time
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/agent", tags=["agent"])


# ─── Request / Response Models ────────────────────────────────

class PlanRequest(BaseModel):
    task_id: str
    prompt: str
    workspace_name: Optional[str] = "GravityX Workspace"


class ContextRequest(BaseModel):
    task_id: str
    prompt: str
    file_paths: List[str] = []


class PromptRequest(BaseModel):
    task_id: str
    context_files: List[str] = []
    memory_facts: List[str] = []
    project_rules: List[str] = []
    user_prompt: str


class ReviewRequest(BaseModel):
    task_id: str
    model_response: str
    risk_level: Optional[str] = "medium"


# ─── POST /agent/plan ─────────────────────────────────────────

@router.post("/plan")
def plan_task(req: PlanRequest):
    """
    Analyze a user task and return a structured execution plan.
    Returns mock data — real Planner runs client-side in TypeScript.
    """
    return {
        "task_id": req.task_id,
        "status": "planned",
        "summary": f"Analyzed: {req.prompt[:80]}",
        "estimated_complexity": "moderate",
        "estimated_tokens": 4000,
        "risk_level": "medium",
        "execution_steps": [
            {"id": "1", "order": 1, "title": "Parse intent",        "description": "Extract goals from prompt"},
            {"id": "2", "order": 2, "title": "Search repository",   "description": "Locate relevant files"},
            {"id": "3", "order": 3, "title": "Build context",       "description": "Assemble file contents"},
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
    Build context for a task from workspace files.
    Returns mock data — real ContextBuilder runs client-side.
    """
    context_files = [
        {
            "file_path": path,
            "file_name": path.split("/")[-1],
            "language": "typescript",
            "confidence": 0.75,
            "reason": "Identified by RepositorySearch",
            "included": True,
            "size_bytes": 1024,
        }
        for path in req.file_paths[:10]
    ]
    return {
        "task_id": req.task_id,
        "files": context_files,
        "total_token_estimate": len(context_files) * 800,
        "truncated": False,
        "generated_at": int(time.time() * 1000),
    }


# ─── POST /agent/prompt ───────────────────────────────────────

@router.post("/prompt")
def build_prompt(req: PromptRequest):
    """
    Construct a structured prompt object.
    Returns mock data — real PromptBuilder runs client-side.
    """
    sections = [
        {"role": "system",      "label": "System Instructions",  "token_count": 350},
        {"role": "context",     "label": "Workspace Metadata",   "token_count": 80},
        {"role": "context",     "label": "Memory Facts",          "token_count": len(req.memory_facts) * 30},
        {"role": "user",        "label": "User Instruction",      "token_count": len(req.user_prompt) // 4},
    ]
    total = sum(s["token_count"] for s in sections)
    return {
        "task_id": req.task_id,
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
    Returns mock data — real ReviewEngine runs client-side.
    """
    return {
        "task_id": req.task_id,
        "summary": "Mock review: Response processed successfully.",
        "files_changed": [],
        "warnings": [],
        "complexity": "moderate",
        "review_notes": "No issues detected in mock mode.",
        "requires_human_approval": req.risk_level in ["high", "critical"],
        "reviewed_at": int(time.time() * 1000),
    }


# ─── GET /agent/status ────────────────────────────────────────

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
