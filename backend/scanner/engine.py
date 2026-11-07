import os
import time
import threading
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from ..database.models import Project, RepositoryIndex
from ..database.connection import SessionLocal
from .detectors import detect_framework_and_language

# Global in-memory scanner progress map
# Key: project_path, Value: {status, processed_files, total_files, error}
SCAN_STATUSES: Dict[str, Dict[str, Any]] = {}

IGNORED_FOLDERS = {
    "node_modules", "vendor", ".git", ".svn", ".next",
    ".venv", "venv", "env", "bin", "obj", "dist", "build",
    "__pycache__", ".agents", ".gemini", "coverage", ".cache",
    ".turbo", ".parcel-cache", ".yarn", "out", ".expo"
}

IGNORED_EXTENSIONS = {
    ".pyc", ".pyo", ".png", ".jpg", ".jpeg", ".gif", ".ico",
    ".pdf", ".zip", ".tar", ".gz", ".7z", ".exe", ".dll",
    ".so", ".dylib", ".woff", ".woff2", ".eot", ".ttf",
    ".otf", ".svg", ".webp", ".avif", ".mp4", ".mp3",
    ".lock", ".map", ".min.js",
}

# Maximum file size to index (skip binary/huge files)
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2 MB

def _log(tag: str, message: str):
    """Emit structured lifecycle log lines to stdout."""
    print(f"[SCANNER] [{tag}] {message}", flush=True)

def get_file_language(filepath: str) -> str:
    """Resolve language names from file extensions."""
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
        ".scss": "css",
        ".sass": "css",
        ".json": "json",
        ".md": "markdown",
        ".mdx": "markdown",
        ".go": "go",
        ".rs": "rust",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".sql": "sql",
        ".sh": "shell",
        ".bash": "shell",
        ".zsh": "shell",
        ".toml": "toml",
        ".xml": "xml",
        ".dart": "dart",
        ".kt": "kotlin",
        ".swift": "swift",
        ".rb": "ruby",
        ".c": "c",
        ".cpp": "cpp",
        ".h": "c",
        ".vue": "vue",
        ".svelte": "svelte",
    }
    return mapping.get(ext, "plaintext")

def detect_file_encoding_fast(filepath: str) -> str:
    """
    Detect file encoding by reading the first 256 bytes — fast heuristic
    that avoids chardet for common utf-8 text files.
    """
    try:
        with open(filepath, "rb") as f:
            raw = f.read(256)
        if not raw:
            return "utf-8"
        # BOM detection
        if raw[:3] == b"\xef\xbb\xbf":
            return "utf-8-sig"
        if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
            return "utf-16"
        # Try decoding as utf-8 directly (covers most modern files)
        try:
            raw.decode("utf-8")
            return "utf-8"
        except UnicodeDecodeError:
            return "latin-1"
    except Exception:
        return "utf-8"

def _should_ignore_file(filename: str, file_size: int) -> bool:
    """Return True if this file should be skipped during indexing."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in IGNORED_EXTENSIONS:
        return True
    # Skip lock files by name
    if filename in ("package-lock.json", "yarn.lock", "composer.lock", "Cargo.lock"):
        return True
    # Skip oversized files
    if file_size > MAX_FILE_SIZE:
        return True
    return False

def _set_scan_status(project_path: str, data: dict):
    norm_path = os.path.abspath(project_path)
    SCAN_STATUSES[project_path] = data
    SCAN_STATUSES[norm_path] = data

def run_scan(project_path: str, project_id: str):
    """
    Single-pass filesystem scanner. Walks the directory tree once, indexes
    all files into SQLite, and emits lifecycle logs throughout.
    """
    db: Session = SessionLocal()
    try:
        status_dict = {
            "status": "scanning",
            "processed_files": 0,
            "total_files": 0,
            "error": None
        }
        _set_scan_status(project_path, status_dict)
        _log("SCAN_STARTED", f"project_id={project_id} path={project_path}")

        # ── 1. Load existing DB cache ───────────────────────────────────────
        db_entries = db.query(RepositoryIndex).filter(
            RepositoryIndex.project_id == project_id
        ).all()
        db_cache: Dict[str, tuple] = {
            e.path: (e.modified_at, e.size_bytes, e.id) for e in db_entries
        }
        _log("SCAN_STARTED", f"Loaded {len(db_cache)} existing DB cache entries")

        # ── 2. Single-pass walk ─────────────────────────────────────────────
        scanned_paths: set = set()
        to_insert: List[RepositoryIndex] = []
        to_update_ids: List[str] = []  # db_ids that need metadata refresh

        total_folders = 0
        total_files = 0
        workspace_size = 0
        processed = 0

        BATCH_COMMIT_SIZE = 200  # commit every N new records to avoid huge transactions

        for root, dirs, files in os.walk(project_path, topdown=True):
            # Prune ignored folders IN-PLACE so os.walk does not recurse into them
            original_dir_count = len(dirs)
            dirs[:] = [d for d in dirs if d not in IGNORED_FOLDERS]
            pruned = original_dir_count - len(dirs)

            rel_root = os.path.relpath(root, project_path).replace(os.path.sep, "/")
            if rel_root == ".":
                rel_root = ""

            _log("DIRECTORY_ENTERED", f"root={rel_root or '/'} dirs={len(dirs)} files={len(files)} pruned={pruned}")
            total_folders += len(dirs)

            for filename in files:
                abs_path = os.path.join(root, filename)

                try:
                    stat_info = os.stat(abs_path)
                    file_size = stat_info.st_size
                    modified_at = stat_info.st_mtime
                except OSError:
                    continue

                if _should_ignore_file(filename, file_size):
                    continue

                # Build normalized relative path
                rel_path = ("/" + rel_root + "/" + filename).replace("//", "/")
                scanned_paths.add(rel_path)

                # Parent path for tree construction
                parent_path = ("/" + rel_root).rstrip("/") or "/"

                _log("FILE_DISCOVERED", f"path={rel_path} size={file_size}")
                total_files += 1
                workspace_size += file_size

                # ── Cache check ──────────────────────────────────────────
                if rel_path in db_cache:
                    db_mtime, db_size, db_id = db_cache[rel_path]
                    if abs(db_mtime - modified_at) < 0.01 and db_size == file_size:
                        # Cache hit — no DB write needed
                        processed += 1
                        status_dict["processed_files"] = processed
                        _set_scan_status(project_path, status_dict)
                        continue
                    else:
                        # File changed — queue for update (do lightweight update)
                        to_update_ids.append((db_id, file_size, modified_at,
                                              get_file_language(filename),
                                              detect_file_encoding_fast(abs_path)))
                else:
                    # New file — build insert record
                    ext = os.path.splitext(filename)[1].lower()
                    encoding = detect_file_encoding_fast(abs_path)
                    lang = get_file_language(filename)
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
                        parent_path=parent_path
                    )
                    to_insert.append(new_record)
                    _log("NODE_CREATED", f"path={rel_path} lang={lang}")

                processed += 1
                status_dict["processed_files"] = processed
                _set_scan_status(project_path, status_dict)
                _log("PROGRESS_UPDATED", f"processed={processed} total_files_so_far={total_files}")

                # Batch commit inserts periodically to keep memory footprint low
                if len(to_insert) >= BATCH_COMMIT_SIZE:
                    db.add_all(to_insert)
                    db.commit()
                    _log("PROGRESS_UPDATED", f"Batch committed {len(to_insert)} new records")
                    to_insert.clear()

        # ── 3. Commit remaining inserts ─────────────────────────────────────
        if to_insert:
            db.add_all(to_insert)
            db.commit()
            _log("PROGRESS_UPDATED", f"Final batch committed {len(to_insert)} new records")
            to_insert.clear()

        # ── 4. Apply queued updates ─────────────────────────────────────────
        if to_update_ids:
            for db_id, file_size, modified_at, lang, encoding in to_update_ids:
                db_record = db.query(RepositoryIndex).filter(
                    RepositoryIndex.id == db_id
                ).first()
                if db_record:
                    db_record.size_bytes = file_size
                    db_record.modified_at = modified_at
                    db_record.language = lang
                    db_record.encoding = encoding
            db.commit()
            _log("PROGRESS_UPDATED", f"Updated {len(to_update_ids)} changed records")

        # ── 5. Delete stale index entries ───────────────────────────────────
        deleted_paths = set(db_cache.keys()) - scanned_paths
        if deleted_paths:
            for del_path in deleted_paths:
                _, _, db_id = db_cache[del_path]
                db.query(RepositoryIndex).filter(RepositoryIndex.id == db_id).delete()
            db.commit()
            _log("SCAN_COMPLETED", f"Pruned {len(deleted_paths)} stale index entries")

        # ── 6. Framework / language detection (non-blocking separate pass) ──
        _log("SCAN_COMPLETED", "Detecting framework and language...")
        try:
            framework, lang = detect_framework_and_language(project_path)
        except Exception:
            framework, lang = "Unknown", "Plaintext"

        # ── 7. Update Project metadata ──────────────────────────────────────
        proj = db.query(Project).filter(Project.id == project_id).first()
        if proj:
            proj.framework = framework
            proj.language = lang
            proj.total_folders = total_folders
            proj.total_files = total_files
            proj.size_bytes = workspace_size
            proj.last_opened = time.strftime('%Y-%m-%d %H:%M:%S')
            db.commit()

        status_dict["status"] = "completed"
        status_dict["processed_files"] = processed
        status_dict["total_files"] = total_files
        _set_scan_status(project_path, status_dict)

        _log("SCAN_COMPLETED", (
            f"project_id={project_id} total_files={total_files} "
            f"total_folders={total_folders} size_bytes={workspace_size} "
            f"framework={framework} lang={lang}"
        ))

    except Exception as e:
        import traceback
        _log("SCAN_COMPLETED", f"ERROR: {type(e).__name__}: {e}\n{traceback.format_exc()}")
        db.rollback()
        status_dict["status"] = "failed"
        status_dict["error"] = str(e)
        _set_scan_status(project_path, status_dict)
    finally:
        db.close()

def start_workspace_scan(project_path: str, project_id: str):
    """
    Triggers an asynchronous scan in a background daemon thread to prevent API blocking.
    """
    _log("SCAN_STARTED", f"Spawning background scan thread for project_id={project_id}")
    thread = threading.Thread(target=run_scan, args=(project_path, project_id), daemon=True)
    thread.start()
