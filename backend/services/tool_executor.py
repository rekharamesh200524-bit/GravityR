import os
import shutil
import hashlib
import time
import subprocess
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from ..database.models import ExecutionLog, AuditLog
from ..ai_gateway.logging.gateway_logger import gateway_logger
from .workspace_manager import workspace_manager

class ToolExecutor:
    """
    ToolExecutor implements workspace mutations (write, delete, rename),
    command executions, and git interactions under strict approval constraints.
    Creates backups automatically and updates audit/execution logs database.
    """
    def __init__(self, workspace_path: str = ".", backup_dir: str = ".gravityx_backups"):
        self.workspace_path = os.path.abspath(workspace_path)
        self.backup_dir_name = backup_dir
        
        # Protected files that cannot be deleted, written, or exposed as secrets
        self.protected_basenames = {"workspace.db", ".git"}
        self.secret_basenames = {".env", ".env.local", ".env.production", ".env.development", "id_rsa", "id_ed25519"}
        self.secret_extensions = {".pem", ".key", ".p12", ".pfx"}

    def _resolve_workspace_root(self, workspace_id: Optional[str] = None) -> str:
        """Resolve the active workspace root path dynamically."""
        session = workspace_manager.get_session(workspace_id)
        if session:
            return session.root_path
        if workspace_id and os.path.isabs(workspace_id) and os.path.isdir(workspace_id):
            return os.path.abspath(workspace_id)
        active = workspace_manager.get_active_session()
        if active:
            return active.root_path
        if self.workspace_path and self.workspace_path != "." and os.path.isdir(self.workspace_path):
            return os.path.abspath(self.workspace_path)
        raise PermissionError("Security Alert: No active workspace found. Please open a workspace before running tools.")

    def _safe_path(self, path: str, workspace_id: Optional[str] = None) -> str:
        """Resolve path and assert it stays within the workspace sandbox."""
        target_ws = workspace_id or (workspace_manager.get_active_session().root_path if workspace_manager.get_active_session() else self.workspace_path)
        return workspace_manager.validate_path(target_ws, path)

    def _get_backup_dir(self, workspace_id: Optional[str] = None) -> str:
        ws_root = self._resolve_workspace_root(workspace_id)
        b_dir = os.path.abspath(os.path.join(ws_root, self.backup_dir_name))
        os.makedirs(b_dir, exist_ok=True)
        return b_dir

    def _create_backup(self, rel_path: str, workspace_id: Optional[str] = None) -> str:
        """Create a backup copy of a file before mutating or deleting it."""
        abs_path = self._safe_path(rel_path, workspace_id)
        if not os.path.exists(abs_path):
            return ""
            
        b_dir = self._get_backup_dir(workspace_id)
        sha = hashlib.sha256(rel_path.encode()).hexdigest()[:10]
        timestamp = int(time.time())
        backup_filename = f"backup_{timestamp}_{sha}_{os.path.basename(rel_path)}"
        backup_path = os.path.join(b_dir, backup_filename)
        
        shutil.copy2(abs_path, backup_path)
        gateway_logger.info(f"Backup created for '{rel_path}' at '{backup_path}'", "ToolExecutor")
        return backup_path

    def _verify_checksum(self, filepath: str, expected_content: str) -> bool:
        """Verify the written file matches the expected md5 checksum."""
        if not os.path.exists(filepath):
            return False
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return hashlib.md5(content.encode()).hexdigest() == hashlib.md5(expected_content.encode()).hexdigest()

    def _log_execution(
        self,
        db: Session,
        task_id: str,
        op_type: str,
        details: str,
        status: str,
        elapsed: float
    ):
        """Append record to execution log SQLite table."""
        # Generate an execution log entry
        log_entry = ExecutionLog(
            id=f"exec-{int(time.time() * 1000)}",
            task_id=task_id,
            operation_type=op_type,
            details=details,
            status=status,
            execution_time=elapsed,
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S")
        )
        db.add(log_entry)
        db.commit()

    # ─── File Tools ─────────────────────────────────────────────

    def _is_secret_file(self, abs_path: str) -> bool:
        base = os.path.basename(abs_path).lower()
        ext = os.path.splitext(base)[1].lower()
        return base in self.secret_basenames or ext in self.secret_extensions

    def _atomic_write(self, abs_path: str, content: str) -> None:
        import tempfile
        parent = os.path.dirname(abs_path)
        os.makedirs(parent, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=parent, prefix=".gx_tmp_", text=True)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
            os.replace(tmp_path, abs_path)
        except Exception:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise

    def read_file(self, db: Session, task_id: str, path: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """Safely read a workspace file."""
        t0 = time.time()
        try:
            abs_path = self._safe_path(path, workspace_id)
            ws_root = self._resolve_workspace_root(workspace_id)
            if self._is_secret_file(abs_path):
                raise PermissionError(f"Security Alert: Reading secret/environment file '{os.path.basename(abs_path)}' is restricted.")
            if not os.path.exists(abs_path):
                raise FileNotFoundError(f"File not found: {path}")
                
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "read", f"Read file: {path}", "success", elapsed)
            print(f"[TOOL_EXEC_LOG] workspaceId={workspace_id} workspaceRoot={ws_root} requestedFile={path} toolName=read_file toolResult=SUCCESS", flush=True)
            return {"status": "success", "content": content, "path": path}
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "read", f"Failed to read file: {path} ({e})", "error", elapsed)
            print(f"[TOOL_EXEC_LOG] workspaceId={workspace_id} requestedFile={path} toolName=read_file toolResult=FAILED error={e}", flush=True)
            return {"status": "error", "message": str(e)}

    def write_file(self, db: Session, task_id: str, path: str, content: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """Safely write/mutate a file, verifying path, permissions, backup, and checksums."""
        t0 = time.time()
        try:
            abs_path = self._safe_path(path, workspace_id)
            ws_root = self._resolve_workspace_root(workspace_id)
            
            # Prevent direct modifications of workspace metadata db or secret files
            if os.path.basename(abs_path) in self.protected_basenames or self._is_secret_file(abs_path):
                raise PermissionError(f"Write Denied: Modifying protected file '{os.path.basename(abs_path)}' is forbidden.")

            # Create backup if file already exists
            backup_file = ""
            if os.path.exists(abs_path):
                backup_file = self._create_backup(path, workspace_id)

            # Atomic write
            self._atomic_write(abs_path, content)

            # Verify checksum
            chk_ok = self._verify_checksum(abs_path, content)
            if not chk_ok:
                raise IOError("Checksum verification failed. Written content corrupted.")

            elapsed = time.time() - t0
            details = f"Wrote file: {path}"
            if backup_file:
                details += f" (Backup created: {os.path.basename(backup_file)})"
            
            self._log_execution(db, task_id, "write", details, "success", elapsed)
            print(f"[TOOL_EXEC_LOG] workspaceId={workspace_id} workspaceRoot={ws_root} requestedFile={path} toolName=write_file toolResult=SUCCESS", flush=True)
            return {"status": "success", "path": path, "backup": backup_file}
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "write", f"Failed to write file: {path} ({e})", "error", elapsed)
            print(f"[TOOL_EXEC_LOG] workspaceId={workspace_id} requestedFile={path} toolName=write_file toolResult=FAILED error={e}", flush=True)
            return {"status": "error", "message": str(e)}

    def delete_file(self, db: Session, task_id: str, path: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """Safely delete a workspace file (moves it to backup)."""
        t0 = time.time()
        try:
            abs_path = self._safe_path(path, workspace_id)
            if os.path.basename(abs_path) in self.protected_basenames:
                raise PermissionError(f"Delete Denied: Cannot delete protected metadata '{os.path.basename(abs_path)}'.")

            if not os.path.exists(abs_path):
                raise FileNotFoundError(f"File not found: {path}")

            # Backup before deletion
            backup_file = self._create_backup(path, workspace_id)
            os.remove(abs_path)

            elapsed = time.time() - t0
            self._log_execution(db, task_id, "delete", f"Deleted file: {path} (Backed up to {os.path.basename(backup_file)})", "success", elapsed)
            return {"status": "success", "path": path, "backup": backup_file}
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "delete", f"Failed to delete file: {path} ({e})", "error", elapsed)
            return {"status": "error", "message": str(e)}

    def rename_file(self, db: Session, task_id: str, old_path: str, new_path: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """Safely rename or move a file within the workspace."""
        t0 = time.time()
        try:
            abs_old = self._safe_path(old_path, workspace_id)
            abs_new = self._safe_path(new_path, workspace_id)

            if os.path.basename(abs_old) in self.protected_basenames or os.path.basename(abs_new) in self.protected_basenames:
                raise PermissionError("Rename Denied: Protected file parameters.")

            if not os.path.exists(abs_old):
                raise FileNotFoundError(f"File not found: {old_path}")

            # Backup old file before moving
            self._create_backup(old_path, workspace_id)
            os.makedirs(os.path.dirname(abs_new), exist_ok=True)
            shutil.move(abs_old, abs_new)

            elapsed = time.time() - t0
            self._log_execution(db, task_id, "rename", f"Renamed file: {old_path} -> {new_path}", "success", elapsed)
            return {"status": "success", "old_path": old_path, "new_path": new_path}
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "rename", f"Failed to rename file: {old_path} ({e})", "error", elapsed)
            return {"status": "error", "message": str(e)}

    # ─── Terminal Tool ──────────────────────────────────────────

    def execute_terminal(self, db: Session, task_id: str, command: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """Execute a terminal command, capturing stdout, stderr, exit code, and execution time."""
        t0 = time.time()
        # White-listed command starts
        allowed_prefixes = ("npm", "npx", "node", "yarn", "pnpm", "tsc", "eslint", "prettier", "composer", "php", "flutter", "git", "python", "pip", "pytest")
        
        # Simple security parsing
        cmd_words = command.split()
        if not cmd_words:
            return {"status": "error", "message": "Command instruction is empty."}
            
        first_word = cmd_words[0]
        if first_word not in allowed_prefixes:
            # Block raw command injection attempts
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "terminal", f"Blocked unauthorized command: {command}", "warning", elapsed)
            return {"status": "error", "message": f"Security Alert: Command '{first_word}' is blocked. Only packages, testing, compiling, and git tools are approved."}

        # Check for dangerous / destructive patterns
        lower_cmd = command.lower()
        blocked_patterns = ["rm -rf", "format c:", "drop table", "drop database", "git push --force", "git push -f", "git reset --hard"]
        for pattern in blocked_patterns:
            if pattern in lower_cmd:
                elapsed = time.time() - t0
                self._log_execution(db, task_id, "terminal", f"Blocked destructive command pattern '{pattern}' in: {command}", "warning", elapsed)
                return {"status": "error", "message": f"Security Alert: Destructive command pattern '{pattern}' is blocked."}

        target_cwd = self._resolve_workspace_root(workspace_id)
        try:
            # Run command inside target workspace root folder
            res = subprocess.run(
                command,
                shell=True,
                cwd=target_cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=120 # 2 minute safety timeout
            )
            elapsed = time.time() - t0
            
            details = f"Executed terminal command: '{command}' in '{target_cwd}' (Exit Code: {res.returncode})"
            status = "success" if res.returncode == 0 else "error"
            self._log_execution(db, task_id, "terminal", details, status, elapsed)
            
            return {
                "status": "success" if res.returncode == 0 else "failed",
                "exit_code": res.returncode,
                "stdout": res.stdout,
                "stderr": res.stderr,
                "execution_time_sec": elapsed
            }
        except subprocess.TimeoutExpired:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "terminal", f"Command timed out: '{command}'", "error", elapsed)
            return {"status": "error", "message": "Execution timed out (120s limit exceeded)."}
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "terminal", f"Command error: '{command}' ({e})", "error", elapsed)
            return {"status": "error", "message": str(e)}

    # ─── Git Tool ───────────────────────────────────────────────

    def execute_git(self, db: Session, task_id: str, action: str, params: Optional[List[str]] = None, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """Interact with git index."""
        t0 = time.time()
        params = params or []
        
        # Git actions map
        git_cmds = {
            "status": ["status", "-s"],
            "diff":   ["diff"],
            "branch": ["branch"],
            "stage":  ["add"] + params,
            "unstage":["reset"] + params,
            "commit": ["commit", "-m"] + params,
            "pull":   ["pull"],
            "push":   ["push"]
        }
        
        if action not in git_cmds:
            return {"status": "error", "message": f"Unsupported git action: {action}"}
            
        args = ["git"] + git_cmds[action]
        target_cwd = self._resolve_workspace_root(workspace_id)
        try:
            res = subprocess.run(
                args,
                cwd=target_cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            elapsed = time.time() - t0
            
            status = "success" if res.returncode == 0 else "error"
            details = f"Git operation: {action} (Exit Code: {res.returncode})"
            self._log_execution(db, task_id, "git", details, status, elapsed)
            
            return {
                "status": "success" if res.returncode == 0 else "failed",
                "exit_code": res.returncode,
                "stdout": res.stdout,
                "stderr": res.stderr
            }
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "git", f"Git failed: {action} ({e})", "error", elapsed)
            return {"status": "error", "message": str(e)}

    # ─── Extended Repository & File Modification Tools ──────────

    _SKIP_DIRS = {"node_modules", ".git", ".gravityx_backups", ".next", "dist", "build", "__pycache__", ".venv", "venv"}

    def list_files(self, db: Session, task_id: str, directory: str = ".", extension: Optional[str] = None, max_results: int = 200, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.time()
        try:
            ws_root = self._resolve_workspace_root(workspace_id)
            target_dir = self._safe_path(directory or ".", workspace_id)
            if not os.path.isdir(target_dir):
                raise NotADirectoryError(f"Directory not found: {directory}")

            items: List[str] = []
            for root, dirs, files_list in os.walk(target_dir):
                dirs[:] = sorted(d for d in dirs if d not in self._SKIP_DIRS)
                for fname in sorted(files_list):
                    if extension and not fname.lower().endswith(extension.lower()):
                        continue
                    abs_p = os.path.join(root, fname)
                    rel_p = os.path.relpath(abs_p, ws_root).replace(os.path.sep, "/")
                    items.append(rel_p)
                    if len(items) >= max_results:
                        break
                if len(items) >= max_results:
                    break

            self._log_execution(db, task_id, "list_files", f"Listed {len(items)} files in '{directory}'", "success", time.time() - t0)
            return {"status": "success", "files": items, "count": len(items)}
        except Exception as e:
            self._log_execution(db, task_id, "list_files", f"list_files failed: {e}", "error", time.time() - t0)
            return {"status": "error", "message": str(e)}

    def search_code(self, db: Session, task_id: str, query: str, max_matches: int = 50, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.time()
        try:
            ws_root = self._resolve_workspace_root(workspace_id)
            q_lower = query.lower()
            matches: List[Dict[str, Any]] = []
            for root, dirs, files_list in os.walk(ws_root):
                dirs[:] = [d for d in dirs if d not in self._SKIP_DIRS]
                for fname in files_list:
                    abs_p = os.path.join(root, fname)
                    if self._is_secret_file(abs_p):
                        continue
                    rel_p = os.path.relpath(abs_p, ws_root).replace(os.path.sep, "/")
                    try:
                        with open(abs_p, "r", encoding="utf-8", errors="ignore") as f:
                            for idx, line in enumerate(f, start=1):
                                if q_lower in line.lower():
                                    matches.append({
                                        "filePath": rel_p,
                                        "line": idx,
                                        "preview": line.strip()[:200],
                                    })
                                    if len(matches) >= max_matches:
                                        break
                    except Exception:
                        continue
                    if len(matches) >= max_matches:
                        break
                if len(matches) >= max_matches:
                    break

            self._log_execution(db, task_id, "search_code", f"Searched '{query}': {len(matches)} match(es)", "success", time.time() - t0)
            return {"status": "success", "results": matches, "count": len(matches)}
        except Exception as e:
            self._log_execution(db, task_id, "search_code", f"search_code failed: {e}", "error", time.time() - t0)
            return {"status": "error", "message": str(e)}

    def find_references(self, db: Session, task_id: str, symbol: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        import re
        t0 = time.time()
        try:
            ws_root = self._resolve_workspace_root(workspace_id)
            pattern = re.compile(rf"\b{re.escape(symbol)}\b")
            refs: List[Dict[str, Any]] = []
            for root, dirs, files_list in os.walk(ws_root):
                dirs[:] = [d for d in dirs if d not in self._SKIP_DIRS]
                for fname in files_list:
                    abs_p = os.path.join(root, fname)
                    if self._is_secret_file(abs_p):
                        continue
                    rel_p = os.path.relpath(abs_p, ws_root).replace(os.path.sep, "/")
                    try:
                        with open(abs_p, "r", encoding="utf-8", errors="ignore") as f:
                            for idx, line in enumerate(f, start=1):
                                if pattern.search(line):
                                    refs.append({"filePath": rel_p, "line": idx, "code": line.strip()[:200]})
                                    if len(refs) >= 80:
                                        break
                    except Exception:
                        continue
                    if len(refs) >= 80:
                        break
                if len(refs) >= 80:
                    break

            self._log_execution(db, task_id, "find_references", f"Found {len(refs)} references to '{symbol}'", "success", time.time() - t0)
            return {"status": "success", "references": refs, "count": len(refs)}
        except Exception as e:
            self._log_execution(db, task_id, "find_references", f"find_references failed: {e}", "error", time.time() - t0)
            return {"status": "error", "message": str(e)}

    def get_project_structure(self, db: Session, task_id: str, max_depth: int = 4, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.time()
        try:
            ws_root = self._resolve_workspace_root(workspace_id)
            entries: List[str] = []
            for root, dirs, files_list in os.walk(ws_root):
                rel_root = os.path.relpath(root, ws_root).replace(os.path.sep, "/")
                depth = 0 if rel_root == "." else rel_root.count("/") + 1
                dirs[:] = sorted(d for d in dirs if d not in self._SKIP_DIRS)
                if depth > max_depth:
                    dirs[:] = []
                    continue
                prefix = "" if rel_root == "." else rel_root + "/"
                for d in dirs:
                    entries.append(f"{prefix}{d}/")
                for fname in sorted(files_list):
                    entries.append(f"{prefix}{fname}")
                if len(entries) >= 300:
                    break

            self._log_execution(db, task_id, "get_project_structure", f"Collected {len(entries)} entries", "success", time.time() - t0)
            return {"status": "success", "root": os.path.basename(ws_root), "entries": entries, "count": len(entries)}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def inspect_file(self, db: Session, task_id: str, path: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        import re
        t0 = time.time()
        try:
            read_res = self.read_file(db, task_id, path, workspace_id=workspace_id)
            if read_res.get("status") != "success":
                return read_res
            content = read_res["content"]
            lines = content.splitlines()
            symbols = re.findall(r"(?:export\s+(?:const|function|class|interface|type|enum)|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)", content)
            return {
                "status": "success",
                "path": path,
                "lines": len(lines),
                "size_bytes": len(content.encode("utf-8")),
                "symbols": list(dict.fromkeys(symbols)),
                "preview": "\n".join(lines[:40]),
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def create_file(self, db: Session, task_id: str, path: str, content: str, overwrite: bool = False, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        try:
            abs_path = self._safe_path(path, workspace_id)
            if os.path.exists(abs_path) and not overwrite:
                return {"status": "error", "message": f"File already exists: {path}. Use write_file or replace_in_file to modify it."}
            return self.write_file(db, task_id, path, content, workspace_id=workspace_id)
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def replace_in_file(self, db: Session, task_id: str, path: str, target: str, replacement: str, replace_all: bool = False, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.time()
        try:
            abs_path = self._safe_path(path, workspace_id)
            if os.path.basename(abs_path) in self.protected_basenames or self._is_secret_file(abs_path):
                raise PermissionError(f"Write Denied: Modifying protected file '{os.path.basename(abs_path)}' is forbidden.")
            if not os.path.exists(abs_path):
                raise FileNotFoundError(f"File not found: {path}")

            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                original = f.read()

            occurrences = original.count(target)
            if occurrences == 0:
                return {"status": "error", "message": f"Target snippet not found in '{path}'. Read the file first to verify exact text."}

            backup_file = self._create_backup(path, workspace_id)
            new_content = original.replace(target, replacement) if replace_all else original.replace(target, replacement, 1)
            self._atomic_write(abs_path, new_content)

            count = occurrences if replace_all else 1
            self._log_execution(db, task_id, "replace_in_file", f"Replaced {count} occurrence(s) in {path}", "success", time.time() - t0)
            return {
                "status": "success",
                "path": path,
                "replacements": count,
                "backup": backup_file,
                "original_content": original,
                "modified_content": new_content,
            }
        except Exception as e:
            self._log_execution(db, task_id, "replace_in_file", f"replace_in_file failed for {path}: {e}", "error", time.time() - t0)
            return {"status": "error", "message": str(e)}
