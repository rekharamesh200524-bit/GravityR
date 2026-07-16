from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from ..database.connection import get_db
from ..database.models import Project
from ..services.workspace import workspace_service
from .agent_routes import router as agent_router
from .gateway_routes import router as gateway_router
from .prompt_routes import router as prompt_router
from .tool_routes import router as tool_router

router = APIRouter()
router.include_router(agent_router)
router.include_router(gateway_router)
router.include_router(prompt_router)
router.include_router(tool_router)


# Pydantic schemas
class OpenWorkspaceRequest(BaseModel):
    path: str

class RescanWorkspaceRequest(BaseModel):
    project_id: str

@router.post("/workspace/open")
def open_workspace(req: OpenWorkspaceRequest, db: Session = Depends(get_db)):
    try:
        project = workspace_service.open_workspace(req.path, db)
        return {
            "status": "success",
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
        raise HTTPException(status_code=500, detail=str(e))
