import os
import time
import threading
from typing import Dict, Any, Optional

class WorkspaceSession:
    def __init__(self, workspace_id: str, root_path: str, project_name: str):
        self.workspace_id = workspace_id
        self.root_path = os.path.abspath(root_path)
        self.project_name = project_name
        self.created_at = time.strftime('%Y-%m-%d %H:%M:%S')

    def to_dict(self) -> Dict[str, Any]:
        return {
            "workspace_id": self.workspace_id,
            "root_path": self.root_path,
            "project_name": self.project_name,
            "created_at": self.created_at
        }

class WorkspaceManager:
    """
    Central Manager for active project workspace sessions.
    Maintains workspace_id -> workspace_root mappings and enforces path security.
    """
    def __init__(self):
        self._sessions: Dict[str, WorkspaceSession] = {}
        self._active_workspace_id: Optional[str] = None
        self._lock = threading.RLock()

    def open_session(self, root_path: str, workspace_id: Optional[str] = None, project_name: Optional[str] = None) -> WorkspaceSession:
        clean_path = root_path.strip().strip('"\'')
        normalized_root = os.path.abspath(clean_path)

        if not os.path.exists(normalized_root):
            raise FileNotFoundError(f"Directory path does not exist: {root_path}")
        if not os.path.isdir(normalized_root):
            raise NotADirectoryError(f"Path is not a folder: {root_path}")

        name = project_name or os.path.basename(normalized_root) or normalized_root.replace(os.path.sep, "_")
        wid = workspace_id or name.lower().replace(" ", "-").replace(":", "")

        with self._lock:
            previous_active = self._active_workspace_id
            session = WorkspaceSession(workspace_id=wid, root_path=normalized_root, project_name=name)
            self._sessions[wid] = session
            self._active_workspace_id = wid

            print(f"[WORKSPACE_OPENED] workspace_id={wid} root={normalized_root}", flush=True)
            print(f"[WORKSPACE_SESSION_CREATED] workspace_id={wid} name={name} root={normalized_root}", flush=True)
            if previous_active and previous_active != wid:
                print(f"[WORKSPACE_SESSION_SWITCHED] from={previous_active} to={wid}", flush=True)

        return session

    def get_session(self, workspace_id: Optional[str] = None) -> Optional[WorkspaceSession]:
        with self._lock:
            # 1. Direct ID lookup
            if workspace_id and workspace_id in self._sessions:
                session = self._sessions[workspace_id]
                print(f"[WORKSPACE_RESOLVED] workspace_id={workspace_id} root={session.root_path}", flush=True)
                return session

            # 2. Check if workspace_id matches any session root_path
            if workspace_id:
                norm_id = os.path.abspath(workspace_id) if os.path.exists(workspace_id) else None
                for sess in self._sessions.values():
                    if norm_id and sess.root_path == norm_id:
                        print(f"[WORKSPACE_RESOLVED] root_match={norm_id} workspace_id={sess.workspace_id}", flush=True)
                        return sess

            # 3. If workspace_id is an absolute directory path on disk, auto-open session
            if workspace_id and os.path.isabs(workspace_id) and os.path.isdir(workspace_id):
                session = self.open_session(workspace_id)
                return session

            # 4. Fallback: try looking up SQLite DB projects table
            if workspace_id:
                try:
                    from ..database.connection import SessionLocal
                    from ..database.models import Project
                    db = SessionLocal()
                    try:
                        proj = db.query(Project).filter((Project.id == workspace_id) | (Project.path == workspace_id)).first()
                        if proj and os.path.isdir(proj.path):
                            session = self.open_session(proj.path, proj.id, proj.name)
                            return session
                    finally:
                        db.close()
                except Exception as e:
                    print(f"[WORKSPACE_DB_LOOKUP_ERROR] {e}", flush=True)

            # 5. Fallback to current active session if available
            if self._active_workspace_id and self._active_workspace_id in self._sessions:
                session = self._sessions[self._active_workspace_id]
                print(f"[WORKSPACE_RESOLVED] default_active_workspace_id={session.workspace_id} root={session.root_path}", flush=True)
                return session

            return None

    def get_active_session(self) -> Optional[WorkspaceSession]:
        return self.get_session(None)

    def close_session(self, workspace_id: str):
        with self._lock:
            if workspace_id in self._sessions:
                session = self._sessions.pop(workspace_id)
                print(f"[WORKSPACE_CLOSED] workspace_id={workspace_id} root={session.root_path}", flush=True)
                if self._active_workspace_id == workspace_id:
                    self._active_workspace_id = list(self._sessions.keys())[-1] if self._sessions else None

    def validate_path(self, workspace_id_or_root: Optional[str], path: str) -> str:
        """
        Resolves path relative to the workspace root and verifies it remains
        strictly bounded inside the active workspace sandbox.
        """
        # Determine workspace root
        session = self.get_session(workspace_id_or_root)
        if session:
            workspace_root = session.root_path
        elif workspace_id_or_root and os.path.isabs(workspace_id_or_root) and os.path.isdir(workspace_id_or_root):
            workspace_root = os.path.abspath(workspace_id_or_root)
        else:
            active = self.get_active_session()
            if active:
                workspace_root = active.root_path
            else:
                raise PermissionError("Security Alert: Path is outside the active workspace. No active workspace session found.")

        normalized_workspace = os.path.realpath(os.path.abspath(workspace_root))

        # Check if path is an absolute system path with drive (Windows) or starts with workspace root (POSIX)
        clean_target = path.lstrip("/\\")
        is_system_abs = False
        if os.name == 'nt':
            target_drive, _ = os.path.splitdrive(path)
            is_system_abs = bool(target_drive) or path.startswith("\\\\")
        else:
            is_system_abs = path.startswith(normalized_workspace)

        if is_system_abs:
            full_path = os.path.realpath(os.path.abspath(path))
        else:
            full_path = os.path.realpath(os.path.abspath(os.path.join(normalized_workspace, clean_target)))

        # Check drive matching on Windows
        if os.name == 'nt':
            target_drive, _ = os.path.splitdrive(full_path)
            workspace_drive, _ = os.path.splitdrive(normalized_workspace)
            if target_drive.lower() != workspace_drive.lower():
                print(f"[TOOL_PATH_REJECTED] path={path} workspace={normalized_workspace} reason=Drive mismatch ({target_drive} vs {workspace_drive})", flush=True)
                raise PermissionError("Security Alert: Path is outside the active workspace.")

        # Canonical path containment check
        try:
            common = os.path.commonpath([full_path, normalized_workspace])
            is_inside = (os.path.realpath(common).lower() == normalized_workspace.lower())
        except ValueError:
            is_inside = False

        if not is_inside:
            print(f"[TOOL_PATH_REJECTED] path={path} workspace={normalized_workspace} resolved={full_path} reason=Out of bounds traversal", flush=True)
            raise PermissionError("Security Alert: Path is outside the active workspace.")

        print(f"[TOOL_PATH_VALIDATED] path={path} root={normalized_workspace} resolved={full_path}", flush=True)
        return full_path

workspace_manager = WorkspaceManager()
