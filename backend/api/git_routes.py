from typing import List, Optional, Dict
import subprocess
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database.connection import get_db
from backend.database.models import Project

router = APIRouter(prefix="/git", tags=["git"])


# ── Pydantic request models ──────────────────────────────────────────────────

class GitStageRequest(BaseModel):
    project_id: str
    path: str = ""

class GitUnstageRequest(BaseModel):
    project_id: str
    path: str = ""

class GitCommitRequest(BaseModel):
    project_id: str
    message: str

class GitPushRequest(BaseModel):
    project_id: str
    remote: Optional[str] = "origin"
    branch: Optional[str] = None

class GitPullRequest(BaseModel):
    project_id: str
    remote: Optional[str] = "origin"
    branch: Optional[str] = None

class GitFetchRequest(BaseModel):
    project_id: str
    remote: Optional[str] = "origin"

class GitSyncRequest(BaseModel):
    project_id: str
    remote: Optional[str] = "origin"
    branch: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_project_path(project_id: str, db: Session) -> str:
    if db is None:
        if os.path.exists("D:\\GravityR"):
            return "D:\\GravityR"
        return os.getcwd()
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        if os.path.exists("D:\\GravityR"):
            return "D:\\GravityR"
        return os.getcwd()
    if not os.path.exists(project.path):
        return os.getcwd()
    return project.path


def _run_git(args: List[str], cwd: str, env: Optional[Dict[str, str]] = None) -> subprocess.CompletedProcess:
    try:
        run_env = env if env is not None else os.environ.copy()
        res = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=run_env
        )
        return res
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Git executable not found on host system.")


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/status")
def get_git_status(project_id: str = Query(...), db: Session = Depends(get_db)):
    cwd = _get_project_path(project_id, db)

    branch_res = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
    branch = branch_res.stdout.strip() if branch_res.returncode == 0 else "main"

    commit_res = _run_git(["rev-parse", "--short", "HEAD"], cwd)
    commit_hash = commit_res.stdout.strip() if commit_res.returncode == 0 else ""

    log_res = _run_git(["log", "-1", "--pretty=format:%an|%ar|%s"], cwd)
    author, last_modified, commit_message = "", "", ""
    if log_res.returncode == 0 and log_res.stdout.strip():
        parts = log_res.stdout.strip().split("|", 2)
        author = parts[0] if len(parts) > 0 else ""
        last_modified = parts[1] if len(parts) > 1 else ""
        commit_message = parts[2] if len(parts) > 2 else ""

    # Ahead/behind tracking
    ahead, behind = 0, 0
    try:
        _run_git(["fetch", "--dry-run"], cwd)
        ab_res = _run_git(["rev-list", "--count", "--left-right", "@{u}...HEAD"], cwd)
        if ab_res.returncode == 0 and "\t" in ab_res.stdout:
            parts = ab_res.stdout.strip().split("\t")
            behind = int(parts[0]) if parts[0].isdigit() else 0
            ahead = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    except Exception:
        pass

    # Staged and unstaged files
    status_res = _run_git(["status", "--porcelain", "-u"], cwd)
    staged: List[dict] = []
    unstaged: List[dict] = []

    if status_res.returncode == 0:
        for line in status_res.stdout.splitlines():
            if len(line) < 4:
                continue
            idx_status = line[0]
            work_status = line[1]
            path = line[3:].strip()
            if " -> " in path:
                path = path.split(" -> ")[-1]

            if idx_status != " " and idx_status != "?":
                staged.append({"path": path, "status": idx_status})
            if work_status != " " and work_status != "?" or (idx_status == "?" and work_status == "?"):
                unstaged.append({"path": path, "status": work_status if work_status != "?" else "?"})

    return {
        "status": "success",
        "branch": branch,
        "commit": commit_hash,
        "author": author,
        "last_modified": last_modified,
        "commit_message": commit_message,
        "ahead": ahead,
        "behind": behind,
        "staged": staged,
        "unstaged": unstaged,
    }


@router.get("/diff")
def get_git_diff(project_id: str = Query(...), db: Session = Depends(get_db)):
    cwd = _get_project_path(project_id, db)
    res = _run_git(["diff", "HEAD"], cwd)
    return {"status": "success", "diff": res.stdout}


@router.get("/file-content")
def get_git_file_content(
    project_id: str = Query(...),
    path: str = Query(...),
    ref: str = Query("HEAD"),
    db: Session = Depends(get_db)
):
    cwd = _get_project_path(project_id, db)
    rel_path = path.lstrip("/\\")

    head_res = _run_git(["show", f"{ref}:{rel_path}"], cwd)
    head_content = head_res.stdout if head_res.returncode == 0 else ""

    full_path = os.path.join(cwd, rel_path)
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            working_content = f.read()
    except Exception:
        working_content = head_content

    return {
        "status": "success",
        "path": rel_path,
        "ref": ref,
        "head_content": head_content,
        "working_content": working_content,
    }


@router.get("/file-history")
def get_git_file_history(
    project_id: str = Query(...),
    path: str = Query(...),
    db: Session = Depends(get_db)
):
    cwd = _get_project_path(project_id, db)
    rel_path = path.lstrip("/\\")
    res = _run_git(["log", "-n", "15", "--pretty=format:%h|%an|%ar|%s", "--", rel_path], cwd)

    history = []
    if res.returncode == 0 and res.stdout.strip():
        for line in res.stdout.splitlines():
            parts = line.split("|")
            if len(parts) >= 4:
                history.append({
                    "commit": parts[0],
                    "author": parts[1],
                    "date": parts[2],
                    "message": parts[3]
                })

    return {
        "status": "success",
        "history": history
    }


@router.post("/stage")
def stage_file(req: GitStageRequest, db: Session = Depends(get_db)):
    cwd = _get_project_path(req.project_id, db)
    target = req.path.lstrip("/\\") if req.path else "."
    print(f"[GIT_STAGE] [GIT_ADD_STARTED] project_id={req.project_id} target={target}", flush=True)
    res = _run_git(["add", target], cwd)
    if res.returncode != 0:
        err_msg = res.stderr.strip() or res.stdout.strip() or "Git add failed."
        print(f"[GIT_STAGE] [STAGE_FAILED] project_id={req.project_id} error={err_msg}", flush=True)
        raise HTTPException(status_code=400, detail=err_msg)
    print(f"[GIT_STAGE] [STAGE_SUCCESS] project_id={req.project_id} target={target}", flush=True)
    return {"status": "success", "message": f"Staged {target}"}


@router.post("/unstage")
def unstage_file(req: GitUnstageRequest, db: Session = Depends(get_db)):
    cwd = _get_project_path(req.project_id, db)
    if req.path:
        target = req.path.lstrip("/\\")
        res = _run_git(["restore", "--staged", target], cwd)
        if res.returncode != 0:
            res = _run_git(["reset", "HEAD", "--", target], cwd)
    else:
        res = _run_git(["restore", "--staged", "."], cwd)
        if res.returncode != 0:
            res = _run_git(["reset"], cwd)

    if res.returncode != 0:
        raise HTTPException(status_code=400, detail=res.stderr or "Git unstage failed.")
    return {"status": "success", "message": "Unstaged successfully"}


@router.post("/commit")
def commit_changes(req: GitCommitRequest, db: Session = Depends(get_db)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Commit message cannot be empty.")
    cwd = _get_project_path(req.project_id, db)

    print(f"[GIT_COMMIT] [COMMIT_STARTED] project_id={req.project_id} message={req.message.strip()}", flush=True)
    res = _run_git(["commit", "-m", req.message.strip()], cwd)

    if res.returncode != 0:
        err_msg = res.stderr.strip() or res.stdout.strip() or "Git commit failed."
        print(f"[GIT_COMMIT] [COMMIT_FAILED] project_id={req.project_id} error={err_msg}", flush=True)
        raise HTTPException(status_code=400, detail=err_msg)

    log_res = _run_git(["rev-parse", "--short", "HEAD"], cwd)
    commit_hash = log_res.stdout.strip() if log_res.returncode == 0 else ""
    print(f"[GIT_COMMIT] [COMMIT_SUCCESS] project_id={req.project_id} commit_hash={commit_hash} output={res.stdout.strip()}", flush=True)

    return {"status": "success", "commit_hash": commit_hash, "output": res.stdout}


@router.post("/push")
def push_changes(req: GitPushRequest, db: Session = Depends(get_db)):
    cwd = _get_project_path(req.project_id, db)
    remote = req.remote or "origin"
    branch = req.branch
    if not branch:
        b_res = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
        branch = b_res.stdout.strip() if b_res.returncode == 0 else "main"

    cmd_args = ["push", remote, branch]
    cmd_str = f"git {' '.join(cmd_args)}"

    print(f"[GIT_PUSH] [PUSH_STARTED] project_id={req.project_id} remote={remote} branch={branch}", flush=True)
    print(f"[GIT_PUSH] [COMMAND_EXECUTED] command='{cmd_str}' cwd='{cwd}'", flush=True)

    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    res = _run_git(cmd_args, cwd, env=env)

    stdout_clean = res.stdout.strip()
    stderr_clean = res.stderr.strip()

    print(f"[GIT_PUSH] [STDOUT] {stdout_clean}", flush=True)
    print(f"[GIT_PUSH] [STDERR] {stderr_clean}", flush=True)
    print(f"[GIT_PUSH] [EXIT_CODE] {res.returncode}", flush=True)

    if res.returncode != 0:
        err_msg = stderr_clean or stdout_clean or "Git push failed."
        print(f"[GIT_PUSH] [PUSH_FAILED] project_id={req.project_id} exit_code={res.returncode} error={err_msg}", flush=True)
        raise HTTPException(status_code=400, detail=err_msg)

    out_msg = stdout_clean or stderr_clean
    print(f"[GIT_PUSH] [PUSH_SUCCESS] project_id={req.project_id} remote={remote} branch={branch} output={out_msg}", flush=True)
    return {
        "status": "success",
        "message": f"Successfully pushed to {remote}/{branch}",
        "output": out_msg,
        "remote": remote,
        "branch": branch
    }


@router.post("/pull")
def pull_changes(req: GitPullRequest, db: Session = Depends(get_db)):
    cwd = _get_project_path(req.project_id, db)
    remote = req.remote or "origin"
    branch = req.branch
    if not branch:
        b_res = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
        branch = b_res.stdout.strip() if b_res.returncode == 0 else "main"

    print(f"[GIT_PULL] [PULL_STARTED] project_id={req.project_id} remote={remote} branch={branch}", flush=True)
    res = _run_git(["pull", remote, branch], cwd)

    if res.returncode != 0:
        err_msg = res.stderr.strip() or res.stdout.strip() or "Git pull failed."
        print(f"[GIT_PULL] [PULL_FAILED] project_id={req.project_id} error={err_msg}", flush=True)
        raise HTTPException(status_code=400, detail=err_msg)

    out_msg = res.stdout.strip() or res.stderr.strip()
    print(f"[GIT_PULL] [PULL_SUCCESS] project_id={req.project_id} remote={remote} branch={branch} output={out_msg}", flush=True)
    return {
        "status": "success",
        "message": f"Successfully pulled from {remote}/{branch}",
        "output": out_msg,
        "remote": remote,
        "branch": branch
    }


@router.post("/fetch")
def fetch_changes(req: GitFetchRequest, db: Session = Depends(get_db)):
    cwd = _get_project_path(req.project_id, db)
    remote = req.remote or "origin"
    res = _run_git(["fetch", remote], cwd)
    if res.returncode != 0:
        raise HTTPException(status_code=400, detail=res.stderr.strip() or "Git fetch failed.")
    return {"status": "success", "message": f"Fetched remote '{remote}'", "output": res.stdout.strip()}


@router.post("/sync")
def sync_changes(req: GitSyncRequest, db: Session = Depends(get_db)):
    cwd = _get_project_path(req.project_id, db)
    remote = req.remote or "origin"
    branch = req.branch
    if not branch:
        b_res = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
        branch = b_res.stdout.strip() if b_res.returncode == 0 else "main"

    pull_res = _run_git(["pull", remote, branch], cwd)
    if pull_res.returncode != 0:
        raise HTTPException(status_code=400, detail=f"Pull failed: {pull_res.stderr.strip()}")

    push_res = _run_git(["push", remote, branch], cwd)
    if push_res.returncode != 0:
        raise HTTPException(status_code=400, detail=f"Push failed: {push_res.stderr.strip()}")

    return {
        "status": "success",
        "message": f"Synchronized with {remote}/{branch}",
        "pull_output": pull_res.stdout.strip(),
        "push_output": push_res.stdout.strip()
    }
