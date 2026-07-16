import os
import shutil
import hashlib
import time
import subprocess
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from ..database.models import ExecutionLog, AuditLog
from ..ai_gateway.logging.gateway_logger import gateway_logger

class ToolExecutor:
    """
    ToolExecutor implements workspace mutations (write, delete, rename),
    command executions, and git interactions under strict approval constraints.
    Creates backups automatically and updates audit/execution logs database.
    """
    def __init__(self, workspace_path: str = ".", backup_dir: str = ".gravityx_backups"):
        self.workspace_path = os.path.abspath(workspace_path)
        self.backup_dir = os.path.abspath(os.path.join(self.workspace_path, backup_dir))
        os.makedirs(self.backup_dir, exist_ok=True)
        
        # Protected files that cannot be deleted or written outside workspace
        self.protected_basenames = {"workspace.db", ".git"}

    def _safe_path(self, path: str) -> str:
        """Resolve path and assert it stays within the workspace sandbox."""
        full_path = os.path.abspath(os.path.join(self.workspace_path, path))
        if not full_path.startswith(self.workspace_path):
            raise PermissionError(f"Security Alert: Attempted out-of-sandbox access at '{path}'")
        return full_path

    def _create_backup(self, rel_path: str) -> str:
        """Create a backup copy of a file before mutating or deleting it."""
        abs_path = self._safe_path(rel_path)
        if not os.path.exists(abs_path):
            return ""
            
        # Create unique name based on timestamp and filepath hashing
        sha = hashlib.sha256(rel_path.encode()).hexdigest()[:10]
        timestamp = int(time.time())
        backup_filename = f"backup_{timestamp}_{sha}_{os.path.basename(rel_path)}"
        backup_path = os.path.join(self.backup_dir, backup_filename)
        
        # Ensure backup folder exists dynamically
        os.makedirs(self.backup_dir, exist_ok=True)
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

    def read_file(self, db: Session, task_id: str, path: str) -> Dict[str, Any]:
        """Safely read a workspace file."""
        t0 = time.time()
        try:
            abs_path = self._safe_path(path)
            if not os.path.exists(abs_path):
                raise FileNotFoundError(f"File not found: {path}")
                
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "read", f"Read file: {path}", "success", elapsed)
            return {"status": "success", "content": content, "path": path}
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "read", f"Failed to read file: {path} ({e})", "error", elapsed)
            return {"status": "error", "message": str(e)}

    def write_file(self, db: Session, task_id: str, path: str, content: str) -> Dict[str, Any]:
        """Safely write/mutate a file, verifying path, permissions, backup, and checksums."""
        t0 = time.time()
        try:
            abs_path = self._safe_path(path)
            
            # Prevent direct modifications of workspace metadata db
            if os.path.basename(abs_path) in self.protected_basenames:
                raise PermissionError(f"Write Denied: Modifying protected metadata file '{os.path.basename(abs_path)}' is forbidden.")

            # Create backup if file already exists
            backup_file = ""
            if os.path.exists(abs_path):
                backup_file = self._create_backup(path)

            # Ensure parent directories exist
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)

            # Check encoding and write
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(content)

            # Verify checksum
            chk_ok = self._verify_checksum(abs_path, content)
            if not chk_ok:
                raise IOError("Checksum verification failed. Written content corrupted.")

            elapsed = time.time() - t0
            details = f"Wrote file: {path}"
            if backup_file:
                details += f" (Backup created: {os.path.basename(backup_file)})"
            
            self._log_execution(db, task_id, "write", details, "success", elapsed)
            return {"status": "success", "path": path, "backup": backup_file}
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "write", f"Failed to write file: {path} ({e})", "error", elapsed)
            return {"status": "error", "message": str(e)}

    def delete_file(self, db: Session, task_id: str, path: str) -> Dict[str, Any]:
        """Safely delete a workspace file (moves it to backup)."""
        t0 = time.time()
        try:
            abs_path = self._safe_path(path)
            if os.path.basename(abs_path) in self.protected_basenames:
                raise PermissionError(f"Delete Denied: Cannot delete protected metadata '{os.path.basename(abs_path)}'.")

            if not os.path.exists(abs_path):
                raise FileNotFoundError(f"File not found: {path}")

            # Backup before deletion
            backup_file = self._create_backup(path)
            os.remove(abs_path)

            elapsed = time.time() - t0
            self._log_execution(db, task_id, "delete", f"Deleted file: {path} (Backed up to {os.path.basename(backup_file)})", "success", elapsed)
            return {"status": "success", "path": path, "backup": backup_file}
        except Exception as e:
            elapsed = time.time() - t0
            self._log_execution(db, task_id, "delete", f"Failed to delete file: {path} ({e})", "error", elapsed)
            return {"status": "error", "message": str(e)}

    def rename_file(self, db: Session, task_id: str, old_path: str, new_path: str) -> Dict[str, Any]:
        """Safely rename or move a file within the workspace."""
        t0 = time.time()
        try:
            abs_old = self._safe_path(old_path)
            abs_new = self._safe_path(new_path)

            if os.path.basename(abs_old) in self.protected_basenames or os.path.basename(abs_new) in self.protected_basenames:
                raise PermissionError("Rename Denied: Protected file parameters.")

            if not os.path.exists(abs_old):
                raise FileNotFoundError(f"File not found: {old_path}")

            # Backup old file before moving
            self._create_backup(old_path)
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

    def execute_terminal(self, db: Session, task_id: str, command: str) -> Dict[str, Any]:
        """Execute a terminal command, capturing stdout, stderr, exit code, and execution time."""
        t0 = time.time()
        # White-listed command starts
        allowed_prefixes = ("npm", "composer", "php", "flutter", "git", "python", "pip")
        
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

        try:
            # Run command inside workspace root folder
            res = subprocess.run(
                command,
                shell=True,
                cwd=self.workspace_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=120 # 2 minute safety timeout
            )
            elapsed = time.time() - t0
            
            details = f"Executed terminal command: '{command}' (Exit Code: {res.returncode})"
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

    def execute_git(self, db: Session, task_id: str, action: str, params: Optional[List[str]] = None) -> Dict[str, Any]:
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
        try:
            res = subprocess.run(
                args,
                cwd=self.workspace_path,
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
