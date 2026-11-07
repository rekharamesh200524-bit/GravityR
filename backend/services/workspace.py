import os
import time
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..database.models import Project, RecentProject, RepositoryIndex
from ..scanner.engine import start_workspace_scan, SCAN_STATUSES
from .workspace_manager import workspace_manager

class WorkspaceService:
    """
    Coordinates all workspace-related requests, folder selections, scans, and file retrievals.
    """
    
    def open_workspace(self, path: str, db: Session) -> Project:
        """
        Validates the path, inserts/updates project and recent project records,
        triggers workspace session registration, and triggers a background repo scan.
        """
        clean_path = path.strip().strip('"\'')
        normalized_path = os.path.abspath(clean_path)
        if not os.path.exists(normalized_path):
            raise FileNotFoundError(f"Directory path does not exist: {path}")
        if not os.path.isdir(normalized_path):
            raise NotADirectoryError(f"Path is not a folder: {path}")

        project_name = os.path.basename(normalized_path) or normalized_path.replace(os.path.sep, "_")
        project_id = project_name.lower().replace(" ", "-").replace(":", "")

        # Check if project metadata already exists by ID or Path
        project = db.query(Project).filter((Project.id == project_id) | (Project.path == normalized_path)).first()
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
            project.path = normalized_path
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

        # Register active workspace session
        workspace_manager.open_session(normalized_path, project.id, project.name)

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
        workspace_manager.close_session(path)

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
        Includes case-insensitive path matching for Windows compatibility and DB completion fallback.
        """
        if not path:
            return {"status": "completed", "processed_files": 0, "total_files": 0, "error": None}

        from ..database.connection import SessionLocal
        normalized_path = os.path.abspath(path)

        # 1. Direct lookup in memory
        status = SCAN_STATUSES.get(normalized_path) or SCAN_STATUSES.get(path)
        if status:
            return status

        # 2. Case-insensitive path lookup in memory (using list snapshot for thread safety)
        norm_lower = normalized_path.lower()
        for k, v in list(SCAN_STATUSES.items()):
            if os.path.abspath(k).lower() == norm_lower:
                return v

        # 3. Fallback: check if DB already indexed project files
        try:
            project_name = os.path.basename(normalized_path) or normalized_path.replace(os.path.sep, "_")
            project_id = project_name.lower().replace(" ", "-").replace(":", "")
            db: Session = SessionLocal()
            try:
                proj = db.query(Project).filter((Project.id == project_id) | (Project.path == normalized_path)).first()
                if proj and proj.total_files > 0:
                    return {
                        "status": "completed",
                        "processed_files": proj.total_files,
                        "total_files": proj.total_files,
                        "error": None
                    }
            finally:
                db.close()
        except Exception as err:
            print(f"[WORKSPACE] get_scan_status DB fallback error: {err}", flush=True)

        return {"status": "completed", "processed_files": 0, "total_files": 0, "error": None}

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

    def write_file_content(self, project_id: str, file_path: str, content: str, db: Session) -> Dict[str, Any]:
        """
        Writes content to the file on disk and updates the RepositoryIndex cache entry.
        Security: validates the resolved absolute path is inside the project root.
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        # Security: resolve and bound-check
        abs_path = os.path.abspath(os.path.join(project.path, file_path.lstrip("/")))
        if not abs_path.startswith(os.path.abspath(project.path)):
            raise PermissionError("Access denied: File is outside project directory bounds.")

        # Fetch existing encoding from index, default utf-8
        idx_entry = db.query(RepositoryIndex).filter(
            RepositoryIndex.project_id == project_id,
            RepositoryIndex.path == file_path
        ).first()
        encoding = idx_entry.encoding if idx_entry else "utf-8"

        # Write file to disk
        try:
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            with open(abs_path, "w", encoding=encoding, errors="replace", newline="") as f:
                f.write(content)
        except Exception as e:
            raise IOError(f"Failed to write file: {str(e)}")

        # Update RepositoryIndex cache so next scan is a cache-hit
        try:
            stat = os.stat(abs_path)
            new_mtime = stat.st_mtime
            new_size = stat.st_size
            if idx_entry:
                idx_entry.modified_at = new_mtime
                idx_entry.size_bytes = new_size
                db.commit()
        except Exception:
            pass  # Non-fatal: scanner will fix on next pass

        saved_at = time.strftime('%Y-%m-%d %H:%M:%S')
        return {
            "path": file_path,
            "size_bytes": os.path.getsize(abs_path),
            "saved_at": saved_at
        }

    def create_file(self, project_id: str, file_path: str, content: str = "", db: Session = None) -> Dict[str, Any]:
        """Creates a new file on disk and adds it to RepositoryIndex."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        clean_path = file_path.lstrip("/\\")
        abs_path = os.path.abspath(os.path.join(project.path, clean_path))
        if not abs_path.startswith(os.path.abspath(project.path)):
            raise PermissionError("Access denied: Path outside project bounds.")

        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "w", encoding="utf-8", errors="replace") as f:
            f.write(content)

        rel_path = "/" + clean_path.replace(os.path.sep, "/")
        parent_path = "/" + os.path.dirname(clean_path).replace(os.path.sep, "/")
        if parent_path == "/.":
            parent_path = "/"

        stat_info = os.stat(abs_path)
        ext = os.path.splitext(os.path.basename(abs_path))[1].lower()

        new_id = f"{project_id}:{rel_path}"
        existing_record = db.query(RepositoryIndex).filter(RepositoryIndex.id == new_id).first()
        if existing_record:
            existing_record.size_bytes = stat_info.st_size
            existing_record.modified_at = stat_info.st_mtime
            existing_record.encoding = "utf-8"
        else:
            new_record = RepositoryIndex(
                id=new_id,
                project_id=project_id,
                path=rel_path,
                name=os.path.basename(abs_path),
                is_folder=False,
                extension=ext,
                size_bytes=stat_info.st_size,
                modified_at=stat_info.st_mtime,
                encoding="utf-8",
                language="plaintext",
                parent_path=parent_path
            )
            db.add(new_record)
        db.commit()

        return {"path": rel_path, "abs_path": abs_path}

    def create_folder(self, project_id: str, folder_path: str, db: Session = None) -> Dict[str, Any]:
        """Creates a new directory on disk."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        clean_path = folder_path.lstrip("/\\")
        abs_path = os.path.abspath(os.path.join(project.path, clean_path))
        if not abs_path.startswith(os.path.abspath(project.path)):
            raise PermissionError("Access denied: Path outside project bounds.")

        os.makedirs(abs_path, exist_ok=True)
        rel_path = "/" + clean_path.replace(os.path.sep, "/")
        return {"path": rel_path, "abs_path": abs_path}

    def rename_node(self, project_id: str, old_path: str, new_name: str, db: Session = None) -> Dict[str, Any]:
        """Renames a file or folder on disk and updates RepositoryIndex entries."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        clean_old = old_path.lstrip("/\\")
        abs_old = os.path.abspath(os.path.join(project.path, clean_old))
        if not abs_old.startswith(os.path.abspath(project.path)):
            raise PermissionError("Access denied: Path outside project bounds.")

        if not os.path.exists(abs_old):
            raise FileNotFoundError(f"Path does not exist: {old_path}")

        parent_dir = os.path.dirname(abs_old)
        abs_new = os.path.join(parent_dir, new_name)
        if os.path.exists(abs_new):
            raise FileExistsError(f"Target name already exists: {new_name}")

        os.rename(abs_old, abs_new)

        rel_old = "/" + clean_old.replace(os.path.sep, "/")
        rel_parent = "/" + os.path.relpath(parent_dir, project.path).replace(os.path.sep, "/")
        if rel_parent == "/.":
            rel_parent = "/"
        rel_new = (rel_parent.rstrip("/") + "/" + new_name).replace("//", "/")

        # Update DB entries
        entries = db.query(RepositoryIndex).filter(
            RepositoryIndex.project_id == project_id,
            RepositoryIndex.path.startswith(rel_old)
        ).all()

        for entry in entries:
            old_entry_path = entry.path
            new_entry_path = rel_new + old_entry_path[len(rel_old):]
            entry.path = new_entry_path
            entry.id = f"{project_id}:{new_entry_path}"
            if old_entry_path == rel_old:
                entry.name = new_name
                entry.extension = os.path.splitext(new_name)[1].lower()

        db.commit()
        return {"old_path": rel_old, "new_path": rel_new}

    def delete_node(self, project_id: str, node_path: str, db: Session = None) -> Dict[str, Any]:
        """Deletes a file or directory recursively on disk and removes DB index records."""
        import shutil

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        clean_path = node_path.lstrip("/\\")
        abs_path = os.path.abspath(os.path.join(project.path, clean_path))
        if not abs_path.startswith(os.path.abspath(project.path)) or abs_path == os.path.abspath(project.path):
            raise PermissionError("Access denied: Invalid delete path.")

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"Path does not exist: {node_path}")

        if os.path.isdir(abs_path):
            shutil.rmtree(abs_path)
        else:
            os.remove(abs_path)

        rel_path = "/" + clean_path.replace(os.path.sep, "/")

        # Delete DB records
        db.query(RepositoryIndex).filter(
            RepositoryIndex.project_id == project_id,
            RepositoryIndex.path.startswith(rel_path)
        ).delete(synchronize_session=False)
        db.commit()

        return {"deleted_path": rel_path}

    def move_node(self, project_id: str, src_path: str, dest_folder: str, db: Session = None) -> Dict[str, Any]:
        """Moves a file or folder into dest_folder using shutil.move."""
        import shutil

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        clean_src = src_path.lstrip("/\\")
        clean_dest = dest_folder.lstrip("/\\")

        abs_src = os.path.abspath(os.path.join(project.path, clean_src))
        abs_dest_dir = os.path.abspath(os.path.join(project.path, clean_dest))

        if not abs_src.startswith(os.path.abspath(project.path)) or not abs_dest_dir.startswith(os.path.abspath(project.path)):
            raise PermissionError("Access denied: Path outside project bounds.")

        if not os.path.exists(abs_src):
            raise FileNotFoundError(f"Source does not exist: {src_path}")
        if not os.path.exists(abs_dest_dir) or not os.path.isdir(abs_dest_dir):
            raise NotADirectoryError(f"Destination folder does not exist: {dest_folder}")

        filename = os.path.basename(abs_src)
        abs_target = os.path.join(abs_dest_dir, filename)
        if os.path.exists(abs_target):
            raise FileExistsError(f"Destination already contains: {filename}")

        shutil.move(abs_src, abs_target)

        rel_src = "/" + clean_src.replace(os.path.sep, "/")
        rel_dest = ("/" + clean_dest + "/" + filename).replace("//", "/")

        # Update DB entries
        entries = db.query(RepositoryIndex).filter(
            RepositoryIndex.project_id == project_id,
            RepositoryIndex.path.startswith(rel_src)
        ).all()

        for entry in entries:
            old_entry_path = entry.path
            new_entry_path = rel_dest + old_entry_path[len(rel_src):]
            entry.path = new_entry_path
            entry.id = f"{project_id}:{new_entry_path}"

        db.commit()
        return {"src_path": rel_src, "dest_path": rel_dest}

    def duplicate_file(self, project_id: str, file_path: str, db: Session = None) -> Dict[str, Any]:
        """Duplicates a file by creating filename_copy.ext."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        clean_path = file_path.lstrip("/\\")
        abs_path = os.path.abspath(os.path.join(project.path, clean_path))
        if not abs_path.startswith(os.path.abspath(project.path)):
            raise PermissionError("Access denied: Path outside project bounds.")

        if not os.path.exists(abs_path) or os.path.isdir(abs_path):
            raise FileNotFoundError(f"File does not exist: {file_path}")

        dir_name = os.path.dirname(abs_path)
        base_name, ext = os.path.splitext(os.path.basename(abs_path))

        copy_idx = 1
        new_filename = f"{base_name}_copy{ext}"
        new_abs_path = os.path.join(dir_name, new_filename)
        while os.path.exists(new_abs_path):
            copy_idx += 1
            new_filename = f"{base_name}_copy{copy_idx}{ext}"
            new_abs_path = os.path.join(dir_name, new_filename)

        with open(abs_path, "r", encoding="utf-8", errors="replace") as src_f:
            content = src_f.read()

        with open(new_abs_path, "w", encoding="utf-8", errors="replace") as dest_f:
            dest_f.write(content)

        parent_rel = "/" + os.path.relpath(dir_name, project.path).replace(os.path.sep, "/")
        if parent_rel == "/.":
            parent_rel = "/"
        new_rel_path = (parent_rel.rstrip("/") + "/" + new_filename).replace("//", "/")

        stat_info = os.stat(new_abs_path)
        new_id = f"{project_id}:{new_rel_path}"
        new_record = RepositoryIndex(
            id=new_id,
            project_id=project_id,
            path=new_rel_path,
            name=new_filename,
            is_folder=False,
            extension=ext.lower(),
            size_bytes=stat_info.st_size,
            modified_at=stat_info.st_mtime,
            encoding="utf-8",
            language="plaintext",
            parent_path=parent_rel
        )
        db.add(new_record)
        db.commit()

        return {"new_path": new_rel_path}

    def reveal_in_explorer(self, project_id: str, file_path: str, db: Session = None) -> Dict[str, Any]:
        """Opens Windows Explorer with the file selected."""
        import subprocess

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise KeyError("Project workspace not initialized.")

        clean_path = file_path.lstrip("/\\")
        abs_path = os.path.abspath(os.path.join(project.path, clean_path))

        if not os.path.exists(abs_path):
            abs_path = os.path.abspath(project.path)

        subprocess.Popen(["explorer", "/select,", abs_path])
        return {"revealed": abs_path}


workspace_service = WorkspaceService()
