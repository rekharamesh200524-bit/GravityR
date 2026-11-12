import os
import json
import difflib
from typing import Dict, Any, List, Tuple

class ReviewEngine:
    """
    Review Engine parses AI responses, compares proposed files with the current workspace,
    calculates precise diff lines added/removed, generates Monaco diff representations,
    detects risky actions, and evaluates overall task complexity.
    """
    def __init__(self, workspace_path: str = "."):
        self.workspace_path = workspace_path
        # Files that require warnings/protection when touched
        self.protected_files = {
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
            "workspace.db",
            ".env",
            ".env.local"
        }

    def _safe_path(self, path: str) -> str:
        """Resolve absolute path and ensure it lies within the workspace."""
        full_path = os.path.abspath(os.path.join(self.workspace_path, path))
        workspace_abs = os.path.abspath(self.workspace_path)
        if not full_path.startswith(workspace_abs):
            raise PermissionError(f"Access Denied: Path '{path}' is outside workspace boundary.")
        return full_path

    def calculate_diff_metrics(self, original_text: str, modified_text: str) -> Tuple[int, int]:
        """Calculate lines added and lines removed using difflib."""
        added = 0
        removed = 0
        original_lines = original_text.splitlines()
        modified_lines = modified_text.splitlines()
        
        matcher = difflib.SequenceMatcher(None, original_lines, modified_lines)
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'replace':
                removed += (i2 - i1)
                added += (j2 - j1)
            elif tag == 'delete':
                removed += (i2 - i1)
            elif tag == 'insert':
                added += (j2 - j1)
        return added, removed

    def generate_unified_diff(self, file_path: str, original_text: str, modified_text: str) -> str:
        """Generate a standard unified diff string between original and modified contents."""
        orig_lines = original_text.splitlines(keepends=True)
        mod_lines = modified_text.splitlines(keepends=True)
        diff_lines = difflib.unified_diff(
            orig_lines,
            mod_lines,
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
        )
        return "".join(diff_lines)

    def review_response(self, task_id: str, prompt: str, ai_response_str: str) -> Dict[str, Any]:
        """
        Parse raw AI response JSON, identify changed files,
        calculate metrics, evaluate safety warnings, and estimate complexity.
        """
        warnings = []
        files_changed = []
        
        # 1. Parse JSON response
        try:
            ai_data = json.loads(ai_response_str)
        except json.JSONDecodeError:
            # Fallback if the AI returned raw text
            ai_data = {
                "summary": "Could not parse AI response as structured JSON. Raw output wrapped.",
                "files": [],
                "review": "Malformed JSON structure.",
                "confidence": 0.0,
                "warnings": ["Response was not valid JSON."]
            }

        summary = ai_data.get("summary", "No summary provided.")
        confidence = ai_data.get("confidence", 0.7)
        ai_warnings = ai_data.get("warnings", [])
        review_notes = ai_data.get("review", "")
        proposed_files = ai_data.get("files", [])

        # Add explicit warnings from AI response
        for w in ai_warnings:
            warnings.append({
                "id": f"ai-warn-{len(warnings)}",
                "severity": "warning",
                "message": w
            })

        total_added = 0
        total_removed = 0

        # 2. Match each proposed file to workspace to detect mutations
        for file_entry in proposed_files:
            rel_path = file_entry.get("path", file_entry.get("filePath", ""))
            proposed_content = file_entry.get("content", "")
            
            if not rel_path:
                continue

            # Verify safe path
            try:
                abs_path = self._safe_path(rel_path)
            except PermissionError as e:
                warnings.append({
                    "id": f"security-warn-{len(warnings)}",
                    "severity": "error",
                    "message": str(e)
                })
                continue

            # Check protected file rules
            basename = os.path.basename(abs_path)
            if basename in self.protected_files:
                warnings.append({
                    "id": f"protect-warn-{len(warnings)}",
                    "severity": "warning",
                    "message": f"Modifying protected configuration file: {rel_path}"
                })

            # Detect change types: created, modified, deleted
            original_content = ""
            change_type = "modified"
            
            if not os.path.exists(abs_path):
                change_type = "created"
            else:
                try:
                    with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                        original_content = f.read()
                except Exception as exc:
                    original_content = ""
                    warnings.append({
                        "id": f"read-warn-{len(warnings)}",
                        "severity": "warning",
                        "message": f"Could not read original file for comparison: {rel_path} ({exc})"
                    })

            # If proposed content is empty but file existed, it might represent a delete request
            # Let's see: usually delete is explicitly marked, or we assume empty means clear/delete
            if change_type == "modified" and proposed_content == "":
                change_type = "deleted"

            added, removed = self.calculate_diff_metrics(original_content, proposed_content)
            total_added += added
            total_removed += removed

            files_changed.append({
                "filePath": rel_path,
                "linesAdded": added,
                "linesRemoved": removed,
                "changeType": change_type,
                "originalContent": original_content,
                "modifiedContent": proposed_content
            })

        # 3. Estimate complexity
        if len(files_changed) > 5 or total_added + total_removed > 300:
            complexity = "complex"
        elif len(files_changed) > 2 or total_added + total_removed > 100:
            complexity = "moderate"
        else:
            complexity = "simple"

        # If security warnings exist, flag critical risk
        has_errors = any(w["severity"] == "error" for w in warnings)
        requires_human_approval = len(files_changed) > 0 or has_errors

        return {
            "taskId": task_id,
            "summary": summary,
            "confidence": confidence,
            "complexity": complexity,
            "filesChanged": files_changed,
            "warnings": warnings,
            "reviewNotes": review_notes,
            "requiresHumanApproval": requires_human_approval,
            "metrics": {
                "totalFilesAffected": len(files_changed),
                "totalLinesAdded": total_added,
                "totalLinesRemoved": total_removed
            }
        }
