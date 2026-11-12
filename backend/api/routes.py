import os
import sys
import asyncio
import subprocess
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from ..database.connection import get_db
from ..database.models import Project
from ..services.workspace import workspace_service
from ..services.workspace_manager import workspace_manager
from .agent_routes import router as agent_router
from .gateway_routes import router as gateway_router
from .prompt_routes import router as prompt_router
from .tool_routes import router as tool_router
from .terminal_routes import router as terminal_router
from .git_routes import router as git_router

router = APIRouter()
router.include_router(agent_router)
router.include_router(gateway_router)
router.include_router(prompt_router)
router.include_router(tool_router)
router.include_router(terminal_router)
router.include_router(git_router)


# Pydantic schemas
class OpenWorkspaceRequest(BaseModel):
    path: str

class CloseWorkspaceRequest(BaseModel):
    workspace_id: Optional[str] = None
    path: Optional[str] = None

class RescanWorkspaceRequest(BaseModel):
    project_id: str

class SaveFileRequest(BaseModel):
    project_id: str
    path: str
    content: str

class CreateFileRequest(BaseModel):
    project_id: str
    path: str
    content: str = ""

class CreateFolderRequest(BaseModel):
    project_id: str
    path: str

class RenameNodeRequest(BaseModel):
    project_id: str
    old_path: str
    new_name: str

class DeleteNodeRequest(BaseModel):
    project_id: str
    path: str

class MoveNodeRequest(BaseModel):
    project_id: str
    src_path: str
    dest_folder: str

class DuplicateFileRequest(BaseModel):
    project_id: str
    path: str

class RevealRequest(BaseModel):
    project_id: str
    path: str



@router.post("/workspace/pick-folder")
async def pick_folder_dialog():
    """
    Triggers a native Windows/OS directory selection dialog on the host system asynchronously.
    Ensures the dialog window is explicitly brought to the foreground immediately without blocking Uvicorn.
    Returns the absolute path of the selected folder.
    """
    def _run_picker():
        # Run tkinter in a fresh subprocess so Tcl/Tk always runs on a main STA thread
        try:
            tk_script = (
                "import os, tkinter as tk; from tkinter import filedialog; "
                "r = tk.Tk(); r.withdraw(); r.attributes('-topmost', True); r.update(); "
                "p = filedialog.askdirectory(parent=r, title='Select Project Workspace Folder'); "
                "r.destroy(); "
                "print(os.path.abspath(p) if p else '')"
            )
            res = subprocess.run(
                [sys.executable, "-c", tk_script],
                capture_output=True,
                text=True,
                timeout=120
            )
            selected_path = res.stdout.strip()
            if res.returncode == 0:
                return selected_path if selected_path else None
            if res.stderr:
                print(f"[PICK_FOLDER] Tkinter subprocess stderr: {res.stderr.strip()}", flush=True)
        except Exception as tk_err:
            print(f"[PICK_FOLDER] Tkinter dialog error, falling back to PowerShell: {tk_err}", flush=True)

        if os.name == 'nt':
            try:
                cmd = (
                    "Add-Type -AssemblyName System.Windows.Forms; "
                    "[System.Windows.Forms.Application]::EnableVisualStyles(); "
                    "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
                    "$f.Description = 'Select Project Workspace Folder'; "
                    "$f.ShowNewFolderButton = $true; "
                    "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath }"
                )
                res = subprocess.run(
                    ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-Command", cmd],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                path = res.stdout.strip()
                if path:
                    return os.path.abspath(path)
            except Exception as ps_err:
                print(f"[PICK_FOLDER] PowerShell error: {ps_err}", flush=True)
        return None

    path = await asyncio.to_thread(_run_picker)
    if path:
        return {"status": "success", "path": path}
    return {"status": "cancelled", "path": None}


@router.post("/workspace/open")
def open_workspace(req: OpenWorkspaceRequest, db: Session = Depends(get_db)):
    try:
        project = workspace_service.open_workspace(req.path, db)
        return {
            "status": "success",
            "workspace_id": project.id,
            "project": {
                "id": project.id,
                "name": project.name,
                "path": project.path,
                "framework": project.framework or "Detecting...",
                "language": project.language or "Detecting...",
                "total_files": project.total_files,
                "total_folders": project.total_folders,
                "size_bytes": project.size_bytes,
                "created_at": project.created_at,
                "last_opened": project.last_opened
            }
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=444, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open workspace: {str(e)}")


@router.post("/workspace/close")
def close_workspace_endpoint(req: CloseWorkspaceRequest, db: Session = Depends(get_db)):
    try:
        target_id = req.workspace_id or req.path
        if target_id:
            workspace_service.close_workspace(target_id, db)
        return {"status": "success", "message": "Workspace session closed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspace/recents")
def get_recents(db: Session = Depends(get_db)):
    try:
        recents = workspace_service.get_recent_projects(db)
        return {"status": "success", "projects": recents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspace/tree")
def get_file_tree(project_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        tree = workspace_service.get_file_tree(project_id, db)
        print(f"[SCANNER] [TREE_SENT_TO_FRONTEND] project_id={project_id} root_nodes={len(tree)}", flush=True)
        return {"status": "success", "tree": tree}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspace/file")
def get_file_content(
    project_id: str = Query(...), 
    path: str = Query(...), 
    db: Session = Depends(get_db)
):
    try:
        file_info = workspace_service.read_file_content(project_id, path, db)
        return {"status": "success", "file": file_info}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspace/info")
def get_workspace_info(project_id: str = Query(...), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Workspace metadata not found.")
    
    return {
        "status": "success",
        "info": {
            "id": project.id,
            "name": project.name,
            "path": project.path,
            "framework": project.framework or "Detecting...",
            "language": project.language or "Detecting...",
            "total_files": project.total_files,
            "total_folders": project.total_folders,
            "size_bytes": project.size_bytes,
            "last_opened": project.last_opened
        }
    }

@router.post("/workspace/rescan")
def rescan_workspace(req: RescanWorkspaceRequest, db: Session = Depends(get_db)):
    try:
        msg = workspace_service.trigger_rescan(req.project_id, db)
        return {"status": "success", "message": msg}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspace/scan-status")
def get_scan_status(path: str = Query(...)):
    try:
        status = workspace_service.get_scan_status(path)
        return {"status": "success", "scan": status}
    except Exception as e:
        print(f"[WORKSPACE] scan-status endpoint warning: {e}", flush=True)
        return {
            "status": "success",
            "scan": {"status": "completed", "processed_files": 0, "total_files": 0, "error": str(e)}
        }

@router.post("/workspace/file/save")
def save_file(req: SaveFileRequest, db: Session = Depends(get_db)):
    try:
        print(f"[WORKSPACE] [FILE_SAVE_STARTED] project_id={req.project_id} path={req.path}", flush=True)
        result = workspace_service.write_file_content(req.project_id, req.path, req.content, db)
        print(f"[WORKSPACE] [FILE_SAVE_SUCCESS] project_id={req.project_id} path={req.path}", flush=True)
        return {"status": "success", **result}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except IOError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspace/fs/create-file")
def create_file_endpoint(req: CreateFileRequest, db: Session = Depends(get_db)):
    try:
        res = workspace_service.create_file(req.project_id, req.path, req.content or "", db)
        return {"status": "success", **res}
    except FileExistsError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspace/fs/create-folder")
def create_folder_endpoint(req: CreateFolderRequest, db: Session = Depends(get_db)):
    try:
        res = workspace_service.create_folder(req.project_id, req.path, db)
        return {"status": "success", **res}
    except FileExistsError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspace/fs/rename")
def rename_node_endpoint(req: RenameNodeRequest, db: Session = Depends(get_db)):
    try:
        res = workspace_service.rename_node(req.project_id, req.old_path, req.new_name, db)
        return {"status": "success", **res}
    except (FileNotFoundError, FileExistsError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspace/fs/delete")
def delete_node_endpoint(req: DeleteNodeRequest, db: Session = Depends(get_db)):
    try:
        res = workspace_service.delete_node(req.project_id, req.path, db)
        return {"status": "success", **res}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspace/fs/move")
def move_node_endpoint(req: MoveNodeRequest, db: Session = Depends(get_db)):
    try:
        res = workspace_service.move_node(req.project_id, req.src_path, req.dest_folder, db)
        return {"status": "success", **res}
    except (FileNotFoundError, FileExistsError, NotADirectoryError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspace/fs/duplicate")
def duplicate_file_endpoint(req: DuplicateFileRequest, db: Session = Depends(get_db)):
    try:
        res = workspace_service.duplicate_file(req.project_id, req.path, db)
        return {"status": "success", **res}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspace/reveal")
def reveal_in_explorer_endpoint(req: RevealRequest, db: Session = Depends(get_db)):
    try:
        res = workspace_service.reveal_in_explorer(req.project_id, req.path, db)
        return {"status": "success", **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workspace/{workspace_id}")
def get_workspace_session(workspace_id: str):
    session = workspace_manager.get_session(workspace_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Workspace session not found: {workspace_id}")
    return {
        "status": "success",
        "workspace": session.to_dict()
    }


