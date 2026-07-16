import os
import time
import threading
import chardet
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from ..database.models import Project, RepositoryIndex
from ..database.connection import SessionLocal
from .detectors import detect_framework_and_language

# Global in-memory scanner progress map
# Key: project_path, Value: {"status": "idle"|"scanning"|"completed"|"failed", "processed_files": int, "error": str}
SCAN_STATUSES: Dict[str, Dict[str, Any]] = {}

IGNORED_FOLDERS = {
    "node_modules", "vendor", ".git", ".svn", ".next", 
    ".venv", "venv", "env", "bin", "obj", "dist", "build",
    "__pycache__", ".agents", ".gemini"
}

IGNORED_EXTENSIONS = {
    ".pyc", ".png", ".jpg", ".jpeg", ".gif", ".ico", 
    ".pdf", ".zip", ".tar", ".gz", ".7z", ".exe", ".dll",
    ".so", ".dylib", ".woff", ".woff2", ".eot", ".ttf"
}

def get_file_language(filepath: str) -> str:
    """
    Resolve language names from file extensions.
    """
    ext = os.path.splitext(filepath)[1].lower()
    mapping = {
        ".php": "php",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".py": "python",
        ".java": "java",
        ".cs": "csharp",
        ".html": "html",
        ".css": "css",
        ".json": "json",
        ".md": "markdown",
        ".go": "go",
        ".rs": "rust",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".sql": "sql",
        ".sh": "shell"
    }
    return mapping.get(ext, "plaintext")

def detect_file_encoding(filepath: str) -> str:
    """
    Detect file encoding safely by reading the first 1KB and running chardet.
    Defaults to utf-8 if detection fails.
    """
    try:
        if not os.path.exists(filepath):
            return "utf-8"
        with open(filepath, "rb") as f:
            raw = f.read(1024)
        if not raw:
            return "utf-8"
        result = chardet.detect(raw)
        return result.get("encoding") or "utf-8"
    except Exception:
        return "utf-8"

def run_scan(project_path: str, project_id: str):
    """
    Core scanning routine that walks the filesystem, performs cache checks,
    and updates SQLite tables recursively.
    """
    db: Session = SessionLocal()
    try:
        SCAN_STATUSES[project_path] = {
            "status": "scanning",
            "processed_files": 0,
            "error": None
        }

        # 1. Count files on filesystem to provide basic tracking metrics
        total_files_estimate = 0
        for root, dirs, files in os.walk(project_path):
            dirs[:] = [d for d in dirs if d not in IGNORED_FOLDERS]
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext not in IGNORED_EXTENSIONS:
                    total_files_estimate += 1

        # 2. Query existing DB entries to construct our local cache dictionary
        # Cache mapping: filepath -> (modified_at, size_bytes, db_id)
        db_entries = db.query(RepositoryIndex).filter(RepositoryIndex.project_id == project_id).all()
        db_cache = {entry.path: (entry.modified_at, entry.size_bytes, entry.id) for entry in db_entries}

        # Sets to track directories and database operations
        scanned_paths = set()
        to_insert: List[RepositoryIndex] = []
        
        total_folders = 0
        total_files = 0
        workspace_size = 0

        # 3. Perform recursive folder walk
        for root, dirs, files in os.walk(project_path):
            # Prune directories in-place to avoid recursive checking of dependencies
            dirs[:] = [d for d in dirs if d not in IGNORED_FOLDERS]
            total_folders += len(dirs)

            for filename in files:
                ext = os.path.splitext(filename)[1].lower()
                if ext in IGNORED_EXTENSIONS:
                    continue

                abs_path = os.path.join(root, filename)
                rel_path = os.path.relpath(abs_path, project_path)
                
                # Normalize forward slashes for cross-platform consistency
                rel_path = "/" + rel_path.replace(os.path.sep, "/")
                scanned_paths.add(rel_path)
                total_files += 1

                try:
                    stat_info = os.stat(abs_path)
                    file_size = stat_info.st_size
                    modified_at = stat_info.st_mtime
                    workspace_size += file_size
                except Exception:
                    continue

                # Cache Check: Compare size and modification time
                cache_hit = False
                if rel_path in db_cache:
                    db_mtime, db_size, db_id = db_cache[rel_path]
                    if abs(db_mtime - modified_at) < 0.01 and db_size == file_size:
                        cache_hit = True
                
                if cache_hit:
                    # Unmodified file: Keep existing DB entry
                    pass
                else:
                    # Modified/New file: Scan metadata
                    encoding = detect_file_encoding(abs_path)
                    lang = get_file_language(filename)
                    parent = "/" + os.path.relpath(root, project_path).replace(os.path.sep, "/")
                    if parent == "/.":
                        parent = "/"
                    elif not parent.startswith("/"):
                        parent = "/" + parent

                    # If already in database, update it; otherwise insert
                    if rel_path in db_cache:
                        _, _, db_id = db_cache[rel_path]
                        db_record = db.query(RepositoryIndex).filter(RepositoryIndex.id == db_id).first()
                        if db_record:
                            db_record.size_bytes = file_size
                            db_record.modified_at = modified_at
                            db_record.encoding = encoding
                            db_record.language = lang
                    else:
                        new_id = f"{project_id}:{rel_path}"
                        new_record = RepositoryIndex(
                            id=new_id,
                            project_id=project_id,
                            path=rel_path,
                            name=filename,
                            is_folder=False,
                            extension=ext,
                            size_bytes=file_size,
                            modified_at=modified_at,
                            encoding=encoding,
                            language=lang,
                            parent_path=parent
                        )
                        to_insert.append(new_record)

                SCAN_STATUSES[project_path]["processed_files"] += 1

        # 4. Insert new items in batch transactions
        if to_insert:
            db.add_all(to_insert)
            db.commit()

        # 5. Clean up stale index files that no longer exist on the disk
        deleted_paths = set(db_cache.keys()) - scanned_paths
        if deleted_paths:
            for del_path in deleted_paths:
                _, _, db_id = db_cache[del_path]
                db.query(RepositoryIndex).filter(RepositoryIndex.id == db_id).delete()
            db.commit()

        # 6. Detect Framework & Primary language using plugins
        framework, lang = detect_framework_and_language(project_path)

        # 7. Update Project Metadata records
        proj = db.query(Project).filter(Project.id == project_id).first()
        if proj:
            proj.framework = framework
            proj.language = lang
            proj.total_folders = total_folders
            proj.total_files = total_files
            proj.size_bytes = workspace_size
            proj.last_opened = time.strftime('%Y-%m-%d %H:%M:%S')
            db.commit()

        SCAN_STATUSES[project_path]["status"] = "completed"

    except Exception as e:
        db.rollback()
        SCAN_STATUSES[project_path]["status"] = "failed"
        SCAN_STATUSES[project_path]["error"] = str(e)
    finally:
        db.close()

def start_workspace_scan(project_path: str, project_id: str):
    """
    Triggers an asynchronous scan in a background thread to prevent API blocking.
    """
    thread = threading.Thread(target=run_scan, args=(project_path, project_id))
    thread.daemon = True
    thread.start()
