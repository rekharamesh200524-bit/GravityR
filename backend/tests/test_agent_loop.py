import unittest
import os
import shutil
import json
from sqlalchemy.orm import Session
from backend.database.connection import SessionLocal, engine, Base
from backend.services.agent_runner import AgentRunner
from backend.services.tool_executor import ToolExecutor
from backend.services.review_engine import ReviewEngine
from backend.services.workspace_manager import workspace_manager


class TestAgentLoop(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()
        cls.test_dir = os.path.abspath("test_agent_sandbox")
        os.makedirs(cls.test_dir, exist_ok=True)
        os.makedirs(os.path.join(cls.test_dir, "src"), exist_ok=True)

        # Create package.json with build & test scripts
        cls.pkg_json = os.path.join(cls.test_dir, "package.json")
        with open(cls.pkg_json, "w", encoding="utf-8") as f:
            json.dump({
                "name": "agent-test-project",
                "version": "1.0.0",
                "scripts": {
                    "build": "node -e \"console.log('Build OK')\"",
                    "test": "node -e \"console.log('Test OK')\""
                }
            }, f, indent=2)

        # Register workspace session
        cls.session = workspace_manager.open_session(
            root_path=cls.test_dir,
            workspace_id="test-agent-ws",
            project_name="agent-test-project"
        )
        cls.tool_executor = ToolExecutor(workspace_path=cls.test_dir)
        cls.review_engine = ReviewEngine(workspace_path=cls.test_dir)
        cls.runner = AgentRunner(
            tool_executor=cls.tool_executor,
            review_engine=cls.review_engine,
            max_iterations=5
        )

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        workspace_manager.close_session("test-agent-ws")
        if os.path.exists(cls.test_dir):
            shutil.rmtree(cls.test_dir, ignore_errors=True)
        if os.path.exists(".gravityx_backups"):
            shutil.rmtree(".gravityx_backups", ignore_errors=True)

    def test_01_parse_tool_call(self):
        """1 & 2: AI returns a tool call, and Agent correctly parses it."""
        raw_json = json.dumps({
            "type": "tool_call",
            "tool": "read_file",
            "arguments": {"path": "package.json"}
        })
        parsed = self.runner.parse_ai_response(raw_json)
        self.assertEqual(parsed["action"], "tool_call")
        self.assertEqual(parsed["tool"], "read_file")
        self.assertEqual(parsed["arguments"]["path"], "package.json")

        # Also test markdown fenced JSON
        markdown_json = f"Here is my decision:\n```json\n{raw_json}\n```"
        parsed_md = self.runner.parse_ai_response(markdown_json)
        self.assertEqual(parsed_md["action"], "tool_call")
        self.assertEqual(parsed_md["tool"], "read_file")

    def test_02_execute_tool_and_return_observation(self):
        """3 & 4: ToolExecutor executes the tool, and result is returned to agent."""
        res = self.runner.execute_tool_call(
            self.db,
            "task-tool-1",
            "read_file",
            {"path": "package.json"},
            workspace_id="test-agent-ws"
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["tool"], "read_file")
        self.assertIn("agent-test-project", res["result"])

    def test_03_agent_continuation_and_completion(self):
        """5 & 6: Agent continues after tool execution and stops when task is complete."""
        mock_steps = [
            # Step 1: Read existing package.json
            {
                "action": "tool_call",
                "tool": "read_file",
                "arguments": {"path": "package.json"}
            },
            # Step 2: Write a new component
            {
                "action": "tool_call",
                "tool": "write_file",
                "arguments": {
                    "path": "src/App.jsx",
                    "content": "export default function App() { return <h1>Hello</h1>; }"
                }
            },
            # Step 3: Complete
            {
                "action": "complete",
                "summary": "Created App.jsx and verified dependencies."
            }
        ]

        result = self.runner.run(
            task_id="task-flow-1",
            prompt="Create App.jsx component",
            workspace_id="test-agent-ws",
            mock_steps=mock_steps,
            db=self.db
        )

        self.assertEqual(result["status"], "completed")
        self.assertIn("src/App.jsx", result["modified_files"])
        self.assertTrue(os.path.exists(os.path.join(self.test_dir, "src", "App.jsx")))
        self.assertTrue(len(result["observations"]) >= 2)
        self.assertTrue(any(obs["tool"] == "read_file" and obs["success"] for obs in result["observations"]))
        self.assertTrue(any(obs["tool"] == "write_file" and obs["success"] for obs in result["observations"]))

    def test_04_tool_failure_feedback(self):
        """7: Tool failure is captured and returned as an error observation."""
        res = self.runner.execute_tool_call(
            self.db,
            "task-tool-err",
            "read_file",
            {"path": "non_existent_file_12345.xyz"},
            workspace_id="test-agent-ws"
        )
        self.assertFalse(res["success"])
        self.assertIn("error", res)

    def test_05_iterative_error_fixing(self):
        """8: Agent can fix a build/test error iteratively."""
        # Create a file that will fail initially
        bad_component_path = os.path.join(self.test_dir, "src", "Failing.js")
        with open(bad_component_path, "w", encoding="utf-8") as f:
            f.write("syntax error here !!!")

        mock_steps = [
            # Agent replaces with corrected code
            {
                "action": "tool_call",
                "tool": "write_file",
                "arguments": {
                    "path": "src/Failing.js",
                    "content": "console.log('Fixed syntax!');"
                }
            },
            {
                "action": "complete",
                "summary": "Fixed syntax error in Failing.js"
            }
        ]

        result = self.runner.run(
            task_id="task-fix-1",
            prompt="Fix syntax error in Failing.js",
            workspace_id="test-agent-ws",
            mock_steps=mock_steps,
            db=self.db
        )

        self.assertEqual(result["status"], "completed")
        with open(bad_component_path, "r", encoding="utf-8") as f:
            self.assertIn("Fixed syntax!", f.read())

    def test_06_max_iterations_prevention(self):
        """9: Maximum iterations prevents infinite loops and stops safely."""
        infinite_steps = [
            {
                "action": "tool_call",
                "tool": "read_file",
                "arguments": {"path": "package.json"}
            }
            for _ in range(10)
        ]

        short_runner = AgentRunner(
            tool_executor=self.tool_executor,
            review_engine=self.review_engine,
            max_iterations=3
        )

        result = short_runner.run(
            task_id="task-loop-1",
            prompt="Infinite loop test",
            workspace_id="test-agent-ws",
            mock_steps=infinite_steps,
            db=self.db
        )

        self.assertLessEqual(result["iterations"], 3)
        self.assertIn(result["status"], ["completed", "max_iterations_reached"])

    def test_07_unauthorized_tools_rejected(self):
        """10: Unauthorized or malformed tools/actions are rejected with Security Alert."""
        # 1. Unknown tool
        res_unknown = self.runner.execute_tool_call(
            self.db,
            "task-sec-1",
            "malicious_tool",
            {"target": "/etc/passwd"},
            workspace_id="test-agent-ws"
        )
        self.assertFalse(res_unknown["success"])
        self.assertIn("Security Alert", res_unknown["error"])

        # 2. Blocked terminal command (destructive)
        res_destruct = self.runner.execute_tool_call(
            self.db,
            "task-sec-2",
            "run_terminal",
            {"command": "rm -rf /"},
            workspace_id="test-agent-ws"
        )
        self.assertFalse(res_destruct["success"])
        self.assertIn("Security Alert", res_destruct["error"])

        # 3. Path traversal write
        res_trav = self.runner.execute_tool_call(
            self.db,
            "task-sec-3",
            "write_file",
            {"path": "../../secret.txt", "content": "bad"},
            workspace_id="test-agent-ws"
        )
        self.assertFalse(res_trav["success"])
        self.assertIn("Security Alert", res_trav["error"])

    def test_08_review_diff_generation(self):
        """Verify that diffs and review summaries are accurately created."""
        result = self.runner.run(
            task_id="task-diff-1",
            prompt="Add component Header.jsx",
            workspace_id="test-agent-ws",
            mock_steps=[
                {
                    "action": "tool_call",
                    "tool": "write_file",
                    "arguments": {
                        "path": "src/Header.jsx",
                        "content": "export const Header = () => <header>Logo</header>;\n"
                    }
                },
                {
                    "action": "complete",
                    "summary": "Header component created."
                }
            ],
            db=self.db
        )

        self.assertEqual(result["status"], "completed")
        self.assertTrue(len(result["files_changed"]) >= 1)
        header_change = next(f for f in result["files_changed"] if f["filePath"] == "src/Header.jsx")
        self.assertEqual(header_change["changeType"], "created")
        self.assertTrue(header_change["linesAdded"] > 0)


if __name__ == "__main__":
    unittest.main()
