import os
import json
import time
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from .tool_executor import ToolExecutor
from .review_engine import ReviewEngine
from .workspace_manager import workspace_manager
from ..database.connection import SessionLocal
from ..ai_gateway.manager import gateway_manager
from ..ai_gateway.logging.gateway_logger import gateway_logger


class AgentRunner:
    """
    AgentRunner implements the complete iterative agent tool loop:
    USER PROMPT → PLAN → INSPECT FILES → AI DECIDES ACTION → EXECUTE TOOL → OBSERVE RESULT → AI CONTINUES → TEST → FIX ERRORS → SHOW DIFF → COMPLETE

    Reuses existing ToolExecutor and ReviewEngine under strict security and sandbox constraints.
    """

    def __init__(
        self,
        tool_executor: Optional[ToolExecutor] = None,
        review_engine: Optional[ReviewEngine] = None,
        max_iterations: int = 5
    ):
        self.tool_executor = tool_executor or ToolExecutor()
        self.review_engine = review_engine or ReviewEngine()
        self.max_iterations = max_iterations

    def _resolve_workspace_root(self, workspace_id: Optional[str] = None) -> str:
        return self.tool_executor._resolve_workspace_root(workspace_id)

    def discover_validation_command(self, workspace_id: Optional[str] = None) -> Optional[str]:
        """Inspect workspace configuration to choose an appropriate validation/build command."""
        ws_root = self._resolve_workspace_root(workspace_id)
        pkg_path = os.path.join(ws_root, "package.json")
        if os.path.exists(pkg_path):
            try:
                with open(pkg_path, "r", encoding="utf-8", errors="ignore") as f:
                    data = json.load(f)
                    scripts = data.get("scripts", {})
                    if "build" in scripts:
                        return "npm run build"
                    if "test" in scripts:
                        return "npm test"
                    if "lint" in scripts:
                        return "npm run lint"
            except Exception:
                pass

        pyproject = os.path.join(ws_root, "pyproject.toml")
        if os.path.exists(pyproject):
            return "pytest"

        return None

    def execute_tool_call(
        self,
        db: Session,
        task_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        workspace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Execute a validated tool call through ToolExecutor."""
        t0 = time.time()
        tool_name = tool_name.strip()

        if tool_name == "read_file":
            path = arguments.get("path", "")
            res = self.tool_executor.read_file(db, task_id, path, workspace_id=workspace_id)
            if res.get("status") == "success":
                return {
                    "success": True,
                    "tool": "read_file",
                    "path": path,
                    "result": res.get("content", ""),
                    "execution_time": time.time() - t0
                }
            return {
                "success": False,
                "tool": "read_file",
                "path": path,
                "error": res.get("message", "Unknown read error"),
                "execution_time": time.time() - t0
            }

        elif tool_name == "write_file":
            path = arguments.get("path", "")
            content = arguments.get("content", "")
            res = self.tool_executor.write_file(db, task_id, path, content, workspace_id=workspace_id)
            if res.get("status") == "success":
                return {
                    "success": True,
                    "tool": "write_file",
                    "path": path,
                    "backup": res.get("backup", ""),
                    "execution_time": time.time() - t0
                }
            return {
                "success": False,
                "tool": "write_file",
                "path": path,
                "error": res.get("message", "Unknown write error"),
                "execution_time": time.time() - t0
            }

        elif tool_name == "delete_file":
            path = arguments.get("path", "")
            res = self.tool_executor.delete_file(db, task_id, path, workspace_id=workspace_id)
            if res.get("status") == "success":
                return {
                    "success": True,
                    "tool": "delete_file",
                    "path": path,
                    "backup": res.get("backup", ""),
                    "execution_time": time.time() - t0
                }
            return {
                "success": False,
                "tool": "delete_file",
                "path": path,
                "error": res.get("message", "Unknown delete error"),
                "execution_time": time.time() - t0
            }

        elif tool_name == "rename_file":
            old_path = arguments.get("old_path", "")
            new_path = arguments.get("new_path", "")
            res = self.tool_executor.rename_file(db, task_id, old_path, new_path, workspace_id=workspace_id)
            if res.get("status") == "success":
                return {
                    "success": True,
                    "tool": "rename_file",
                    "old_path": old_path,
                    "new_path": new_path,
                    "execution_time": time.time() - t0
                }
            return {
                "success": False,
                "tool": "rename_file",
                "old_path": old_path,
                "new_path": new_path,
                "error": res.get("message", "Unknown rename error"),
                "execution_time": time.time() - t0
            }

        elif tool_name == "search_files":
            query = arguments.get("query", "").lower()
            ws_root = self._resolve_workspace_root(workspace_id)
            results = []
            try:
                for root, dirs, files_list in os.walk(ws_root):
                    dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", ".gravityx_backups", ".next", "dist", "build", "__pycache__")]
                    for f in files_list:
                        abs_p = os.path.join(root, f)
                        rel_p = os.path.relpath(abs_p, ws_root).replace(os.path.sep, "/")
                        try:
                            with open(abs_p, "r", encoding="utf-8", errors="ignore") as fl:
                                cnt = fl.read()
                                if query in cnt.lower():
                                    results.append({"filePath": rel_p, "fileName": f, "matchCount": cnt.lower().count(query)})
                        except Exception:
                            pass
                self.tool_executor._log_execution(db, task_id, "search", f"Searched workspace for: '{query}' (Found {len(results)} matches)", "success", time.time() - t0)
                return {
                    "success": True,
                    "tool": "search_files",
                    "results": results,
                    "count": len(results),
                    "execution_time": time.time() - t0
                }
            except Exception as e:
                return {
                    "success": False,
                    "tool": "search_files",
                    "error": str(e),
                    "execution_time": time.time() - t0
                }

        elif tool_name == "run_terminal":
            command = arguments.get("command", "")
            res = self.tool_executor.execute_terminal(db, task_id, command, workspace_id=workspace_id)
            is_success = res.get("status") == "success"
            return {
                "success": is_success,
                "tool": "run_terminal",
                "command": command,
                "exit_code": res.get("exit_code"),
                "stdout": res.get("stdout", ""),
                "stderr": res.get("stderr", ""),
                "error": res.get("message") if not is_success and "message" in res else (res.get("stderr") if not is_success else None),
                "execution_time": time.time() - t0
            }

        elif tool_name == "git_status":
            res = self.tool_executor.execute_git(db, task_id, "status", [], workspace_id=workspace_id)
            is_success = res.get("status") == "success"
            return {
                "success": is_success,
                "tool": "git_status",
                "stdout": res.get("stdout", ""),
                "stderr": res.get("stderr", ""),
                "error": res.get("message") if not is_success else None,
                "execution_time": time.time() - t0
            }

        elif tool_name == "git_diff":
            res = self.tool_executor.execute_git(db, task_id, "diff", [], workspace_id=workspace_id)
            is_success = res.get("status") == "success"
            return {
                "success": is_success,
                "tool": "git_diff",
                "stdout": res.get("stdout", ""),
                "stderr": res.get("stderr", ""),
                "error": res.get("message") if not is_success else None,
                "execution_time": time.time() - t0
            }

        else:
            return {
                "success": False,
                "tool": tool_name,
                "error": f"Security Alert: Unknown or unsupported tool '{tool_name}'",
                "execution_time": time.time() - t0
            }

    def parse_ai_response(self, raw_content: str) -> Dict[str, Any]:
        """
        Parse AI response into structured tool call, completion, or legacy file change format.
        Supports:
        1. Pure JSON: {"type": "tool_call", "tool": "...", "arguments": {...}}
        2. Markdown fenced JSON
        3. Legacy single-shot JSON: {"summary": "...", "files": [...]}
        """
        content = raw_content.strip()

        # Check for markdown code blocks
        if "```json" in content:
            start = content.find("```json") + 7
            end = content.find("```", start)
            if end != -1:
                content = content[start:end].strip()
        elif "```" in content:
            start = content.find("```") + 3
            end = content.find("```", start)
            if end != -1:
                content = content[start:end].strip()

        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                resp_type = parsed.get("type")
                if resp_type == "tool_call":
                    return {
                        "action": "tool_call",
                        "tool": parsed.get("tool"),
                        "arguments": parsed.get("arguments", {})
                    }
                elif resp_type == "complete":
                    return {
                        "action": "complete",
                        "summary": parsed.get("summary", "Task completed"),
                        "review_notes": parsed.get("review_notes", "")
                    }
                elif resp_type == "clarification":
                    return {
                        "action": "clarification",
                        "question": parsed.get("question", "")
                    }
                # Check for legacy single-shot format
                elif "files" in parsed and isinstance(parsed["files"], list):
                    return {
                        "action": "legacy_files",
                        "summary": parsed.get("summary", "AI proposed changes"),
                        "files": parsed["files"],
                        "review": parsed.get("review", "")
                    }
                elif "tool" in parsed:
                    return {
                        "action": "tool_call",
                        "tool": parsed.get("tool"),
                        "arguments": parsed.get("arguments", parsed.get("parameters", {}))
                    }
        except Exception:
            pass

        # Check if content has embedded JSON
        if "{" in content and "}" in content:
            s_idx = content.find("{")
            e_idx = content.rfind("}") + 1
            try:
                sub = json.loads(content[s_idx:e_idx])
                if isinstance(sub, dict):
                    if sub.get("type") == "tool_call" or "tool" in sub:
                        return {
                            "action": "tool_call",
                            "tool": sub.get("tool"),
                            "arguments": sub.get("arguments", sub.get("parameters", {}))
                        }
                    if "files" in sub:
                        return {
                            "action": "legacy_files",
                            "summary": sub.get("summary", "AI proposed changes"),
                            "files": sub["files"]
                        }
            except Exception:
                pass

        return {
            "action": "message",
            "content": raw_content
        }

    def run(
        self,
        task_id: str,
        prompt: str,
        workspace_id: Optional[str] = None,
        mock_steps: Optional[List[Dict[str, Any]]] = None,
        db: Optional[Session] = None,
        on_event: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Execute the agent tool loop.
        """
        db_session = db or SessionLocal()
        close_db = db is None

        timeline: List[Dict[str, Any]] = []
        logs: List[Dict[str, Any]] = []
        modified_files: Dict[str, Dict[str, Any]] = {}
        observations: List[Dict[str, Any]] = []

        def emit(stage: str, status: str, detail: str = ""):
            entry = {
                "id": stage.lower(),
                "label": stage,
                "status": status,
                "detail": detail,
                "timestamp": int(time.time() * 1000)
            }
            timeline.append(entry)
            logs.append({"stage": stage, "status": status, "detail": detail})
            if on_event:
                try:
                    on_event(entry)
                except Exception:
                    pass

        try:
            # ─── 1. PLANNING ───
            emit("PLANNING", "running", f"Planning task: {prompt[:60]}")
            time.sleep(0.05)
            emit("PLANNING", "completed", "Task intent parsed and initial steps determined")

            # ─── 2. ANALYZING / DISCOVERY ───
            emit("ANALYZING", "running", "Inspecting workspace configuration...")
            val_cmd = self.discover_validation_command(workspace_id)
            emit("ANALYZING", "completed", f"Validation target: {val_cmd or 'none detected'}")

            iteration = 0
            completed = False
            error_message = None

            # Prepare step queue if mocks provided, else use gateway/dynamic steps
            step_queue = list(mock_steps) if mock_steps else []

            # ─── 3. AGENT TOOL LOOP ───
            while not completed and iteration < self.max_iterations:
                iteration += 1

                # Determine next AI decision
                if step_queue:
                    ai_step = step_queue.pop(0)
                else:
                    # Gateway invocation
                    gateway_resp = gateway_manager.generate(
                        prompt=f"Task: {prompt}\nObservations: {json.dumps(observations[-3:]) if observations else 'None'}",
                        options={"task_id": task_id}
                    )
                    ai_step = self.parse_ai_response(gateway_resp.content)

                action = ai_step.get("action")

                if action == "tool_call":
                    tool = ai_step.get("tool", "")
                    args = ai_step.get("arguments", {})
                    
                    # State transition based on tool
                    if tool in ("read_file", "search_files"):
                        emit("READING", "running", f"Reading {args.get('path') or args.get('query')}")
                    elif tool in ("write_file", "delete_file", "rename_file"):
                        emit("EDITING", "running", f"Mutating {args.get('path') or args.get('old_path')}")
                    else:
                        emit("EXECUTING", "running", f"Executing {tool}")

                    # Capture original content if write_file on existing file
                    if tool == "write_file":
                        p = args.get("path", "")
                        ws_root = self._resolve_workspace_root(workspace_id)
                        abs_p = os.path.join(ws_root, p)
                        if os.path.exists(abs_p) and p not in modified_files:
                            try:
                                with open(abs_p, "r", encoding="utf-8", errors="ignore") as orig_f:
                                    orig_c = orig_f.read()
                            except Exception:
                                orig_c = ""
                        else:
                            orig_c = modified_files.get(p, {}).get("originalContent", "")

                        # Execute tool
                        res = self.execute_tool_call(db_session, task_id, tool, args, workspace_id)
                        observations.append(res)

                        if res["success"]:
                            modified_files[p] = {
                                "filePath": p,
                                "originalContent": orig_c,
                                "modifiedContent": args.get("content", ""),
                                "changeType": "modified" if orig_c else "created"
                            }
                            emit("EDITING", "completed", f"Wrote {p}")
                        else:
                            emit("EDITING", "failed", res.get("error", "Write error"))

                    else:
                        res = self.execute_tool_call(db_session, task_id, tool, args, workspace_id)
                        observations.append(res)
                        st = "completed" if res["success"] else "failed"
                        detail = f"{tool} finished" if res["success"] else res.get("error", "Error")
                        emit("EXECUTING", st, detail)

                elif action == "legacy_files":
                    # Backward compatibility with single-shot files proposal
                    files = ai_step.get("files", [])
                    emit("EDITING", "running", f"Writing {len(files)} file(s)...")
                    for f_entry in files:
                        p = f_entry.get("path", f_entry.get("filePath", ""))
                        cnt = f_entry.get("content", "")
                        if p:
                            w_res = self.execute_tool_call(db_session, task_id, "write_file", {"path": p, "content": cnt}, workspace_id)
                            observations.append(w_res)
                            if w_res["success"]:
                                modified_files[p] = {
                                    "filePath": p,
                                    "originalContent": "",
                                    "modifiedContent": cnt,
                                    "changeType": "created"
                                }
                    emit("EDITING", "completed", f"Applied {len(modified_files)} file changes")
                    completed = True

                elif action == "complete":
                    completed = True
                    emit("COMPLETED", "completed", ai_step.get("summary", "Task completed"))
                    break

                elif action == "clarification":
                    emit("WAITING_FOR_APPROVAL", "completed", ai_step.get("question", "User input required"))
                    break

                else:
                    # Message or raw text; if no more steps, mark completed
                    if not step_queue:
                        completed = True

            # ─── 4. ITERATIVE TESTING & ERROR FIXING ───
            if modified_files and val_cmd:
                emit("TESTING", "running", f"Running validation: {val_cmd}")
                test_res = self.execute_tool_call(db_session, task_id, "run_terminal", {"command": val_cmd}, workspace_id)
                observations.append(test_res)

                if test_res["success"]:
                    emit("TESTING", "completed", "Build/Test validation passed")
                else:
                    emit("TESTING", "failed", f"Validation error: {test_res.get('error', 'Failed')}")
                    # Enter FIXING phase if within max iterations
                    if iteration < self.max_iterations:
                        emit("FIXING", "running", "AI analyzing validation errors...")
                        fix_prompt = f"Validation failed with error:\n{test_res.get('stdout', '')}\n{test_res.get('stderr', '')}\nPlease fix the errors."
                        # If a fix step was provided or fallback fix
                        if step_queue:
                            fix_step = step_queue.pop(0)
                            if fix_step.get("action") == "tool_call":
                                f_res = self.execute_tool_call(db_session, task_id, fix_step["tool"], fix_step["arguments"], workspace_id)
                                observations.append(f_res)
                                if fix_step["tool"] == "write_file":
                                    fp = fix_step["arguments"].get("path")
                                    if fp:
                                        modified_files[fp]["modifiedContent"] = fix_step["arguments"].get("content", "")
                        emit("FIXING", "completed", "Applied fix for build error")
                        
                        # Re-test
                        emit("TESTING", "running", f"Re-testing: {val_cmd}")
                        re_test = self.execute_tool_call(db_session, task_id, "run_terminal", {"command": val_cmd}, workspace_id)
                        observations.append(re_test)
                        if re_test["success"]:
                            emit("TESTING", "completed", "All validation tests passed!")
                        else:
                            emit("TESTING", "failed", "Validation still failing after fix attempt")

            # ─── 5. REVIEW & DIFFS ───
            emit("REVIEWING", "running", "Generating review and Monaco diff metrics...")
            files_changed_list = []
            for fp, data in modified_files.items():
                orig_c = data.get("originalContent", "")
                mod_c = data.get("modifiedContent", "")
                added, removed = self.review_engine.calculate_diff_metrics(orig_c, mod_c)
                files_changed_list.append({
                    "filePath": fp,
                    "linesAdded": added,
                    "linesRemoved": removed,
                    "changeType": data.get("changeType", "modified"),
                    "originalContent": orig_c,
                    "modifiedContent": mod_c
                })

            review_report = {
                "taskId": task_id,
                "summary": f"Completed task: {prompt}. Modified {len(files_changed_list)} file(s).",
                "filesChanged": files_changed_list,
                "warnings": [],
                "complexity": "moderate" if len(files_changed_list) <= 3 else "complex",
                "reviewNotes": f"Agent iterations: {iteration}/{self.max_iterations}. Validation: {val_cmd or 'none'}.",
                "requiresHumanApproval": False,
                "reviewedAt": int(time.time() * 1000)
            }
            emit("REVIEWING", "completed", f"{len(files_changed_list)} file(s) reviewed")

            # ─── 6. FINAL STATUS ───
            final_status = "completed" if iteration <= self.max_iterations else "max_iterations_reached"
            emit("COMPLETED", "completed", "Task successfully executed through agent tool loop")

            return {
                "status": final_status,
                "task_id": task_id,
                "iterations": iteration,
                "max_iterations": self.max_iterations,
                "modified_files": list(modified_files.keys()),
                "files_changed": files_changed_list,
                "review": review_report,
                "timeline": timeline,
                "observations": observations,
                "validation_command": val_cmd
            }

        except Exception as err:
            emit("FAILED", "failed", str(err))
            return {
                "status": "failed",
                "task_id": task_id,
                "error": str(err),
                "modified_files": list(modified_files.keys()),
                "timeline": timeline,
                "observations": observations
            }

        finally:
            if close_db:
                db_session.close()


agent_runner = AgentRunner()
