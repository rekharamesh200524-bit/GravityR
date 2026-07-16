import os
import time
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..database.models import Project, RecentProject, RepositoryIndex
from ..scanner.engine import start_workspace_scan, SCAN_STATUSES

class WorkspaceService:
    """
    Coordinates all workspace-related requests, folder selections, scans, and file retrievals.
    """
    
    def open_workspace(self, path: str, db: Session) -> Project:
        """
        Validates the path, inserts/updates project and recent project records,
        and triggers a background repo scan.
        """
        normalized_path = os.path.abspath(path)
        if not os.path.exists(normalized_path):
            raise FileNotFoundError(f"Directory path does not exist: {path}")
        if not os.path.isdir(normalized_path):
            raise NotADirectoryError(f"Path is not a folder: {path}")

        project_name = os.path.basename(normalized_path) or normalized_path.replace(os.path.sep, "_")
        project_id = project_name.lower().replace(" ", "-").replace(":", "")

        # Check if project metadata already exists
        project = db.query(Project).filter(Project.path == normalized_path).first()
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')

        if not project:
            project = Project(
                id=project_id,
                name=project_name,
                path=normalized_path,
                created_at=timestamp,
                last_opened=timestamp
            )
            db.add(project)
        else:
            project.last_opened = timestamp

        # Add to recent projects
        recent = db.query(RecentProject).filter(RecentProject.path == normalized_path).first()
        if not recent:
            recent = RecentProject(
                path=normalized_path,
                name=project_name,
                last_opened=timestamp
            )
            db.add(recent)
        else:
            recent.last_opened = timestamp

        db.commit()
        db.refresh(project)

        # Trigger background asynchronous scan
        start_workspace_scan(normalized_path, project.id)

        return project

    def get_recent_projects(self, db: Session) -> List[Dict[str, Any]]:
        """
        Retrieve recent project list sorted by last opened timestamp.
        """
        recents = db.query(RecentProject).order_by(RecentProject.last_opened.desc()).all()
        return [{"name": r.name, "path": r.path, "last_opened": r.last_opened} for r in recents]

    def close_workspace(self, path: str, db: Session):
        """
        Clean up workspace runtime variables.
        """
        pass

    def trigger_rescan(self, project_id: str, db: Session) -> str:
        """
        Forces a scan refresh on the active project.
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError(f"Project not found with ID: {project_id}")
        
        start_workspace_scan(project.path, project.id)
        return "Rescan triggered successfully"

    def get_scan_status(self, path: str) -> Dict[str, Any]:
        """
        Check background scanning progress of a given path.
        """
        normalized_path = os.path.abspath(path)
        status = SCAN_STATUSES.get(normalized_path)
        if not status:
            return {"status": "idle", "processed_files": 0}
        return status

    def get_file_tree(self, project_id: str, db: Session) -> List[Dict[str, Any]]:
        """
        Queries all flat RepositoryIndex nodes and groups them recursively into 
        folders and files sorted alphabetically with folders first.
        """
        entries = db.query(RepositoryIndex).filter(RepositoryIndex.project_id == project_id).all()
        
        root = {"name": "root", "path": "/", "isFolder": True, "children": []}
        lookup = {"/": root}

        for entry in entries:
            parts = [p for p in entry.path.split("/") if p]
            current_path = ""
            
            for i, part in enumerate(parts):
                parent_path = current_path if current_path else "/"
                current_path = current_path + "/" + part
                
                is_last = (i == len(parts) - 1)
                is_dir = not is_last or entry.is_folder

                if current_path not in lookup:
                    node = {
                        "name": part,
                        "path": current_path,
                        "isFolder": is_dir,
                        "children": [] if is_dir else None
                    }
                    if not is_dir:
                        node["sizeBytes"] = entry.size_bytes
                        node["language"] = entry.language

                    lookup[current_path] = node

                    if parent_path in lookup:
                        if lookup[parent_path]["children"] is None:
                            lookup[parent_path]["children"] = []
                        lookup[parent_path]["children"].append(node)

        def sort_node_children(node):
            if node.get("children") is not None:
                node["children"].sort(key=lambda x: (not x["isFolder"], x["name"].lower()))
                for child in node["children"]:
                    sort_node_children(child)

        sort_node_children(root)
        return root["children"]

    def read_file_content(self, project_id: str, file_path: str, db: Session) -> Dict[str, Any]:
        """
        Resolves file metadata from SQLite, reads content from the disk, 
        and detects encoding issues safely.
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        # Absolute file check
        abs_path = os.path.abspath(os.path.join(project.path, file_path.lstrip("/")))
        if not abs_path.startswith(os.path.abspath(project.path)):
            raise PermissionError("Access denied: File is outside project directory bounds.")

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found on disk: {file_path}")

        # Fetch index entry to get encoding and size metadata
        idx_entry = db.query(RepositoryIndex).filter(
            RepositoryIndex.project_id == project_id,
            RepositoryIndex.path == file_path
        ).first()

        encoding = idx_entry.encoding if idx_entry else "utf-8"

        try:
            with open(abs_path, "r", encoding=encoding, errors="replace") as f:
                content = f.read()
            return {
                "path": file_path,
                "content": content,
                "encoding": encoding,
                "size_bytes": os.path.getsize(abs_path)
            }
        except Exception as e:
            raise IOError(f"Failed to read file: {str(e)}")

workspace_service = WorkspaceService()
