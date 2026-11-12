import os
import sys
import json
import shutil
import tempfile
import unittest
from unittest.mock import patch, MagicMock

# Ensure backend package is importable
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.ai_gateway.config.gateway_config import gateway_config
from backend.ai_gateway.providers.openai import OpenAIProvider
from backend.ai_gateway.providers.claude import ClaudeProvider
from backend.ai_gateway.providers.ollama import OllamaProvider
from backend.ai_gateway.providers.runpod import RunPodProvider
from backend.services.agent_runner import AgentRunner
from backend.services.tool_executor import ToolExecutor
from backend.services.tool_registry import TOOL_REGISTRY, resolve_tool
from backend.services.workspace_manager import workspace_manager
from backend.database.connection import SessionLocal, Base, engine


class TestProviderIntegrations(unittest.TestCase):
    def test_unconfigured_providers_return_clear_errors_never_mock(self):
        orig_openai = gateway_config.OPENAI_API_KEY
        orig_claude = gateway_config.CLAUDE_API_KEY
        orig_runpod = gateway_config.RUNPOD_ENDPOINT
        try:
            gateway_config.OPENAI_API_KEY = ""
            gateway_config.CLAUDE_API_KEY = ""
            gateway_config.RUNPOD_ENDPOINT = ""

            res_o = OpenAIProvider().generate("hello", "gpt-4o-mini")
            self.assertFalse(res_o.success)
            self.assertIn("not configured", res_o.metadata.get("error", "").lower())

            res_c = ClaudeProvider().generate("hello", "claude-3-5-sonnet-latest")
            self.assertFalse(res_c.success)
            self.assertIn("not configured", res_c.metadata.get("error", "").lower())

            res_r = RunPodProvider().generate("hello", "qwen2.5-coder-7b-instruct")
            self.assertFalse(res_r.success)
            self.assertIn("not configured", res_r.metadata.get("error", "").lower())
        finally:
            gateway_config.OPENAI_API_KEY = orig_openai
            gateway_config.CLAUDE_API_KEY = orig_claude
            gateway_config.RUNPOD_ENDPOINT = orig_runpod

    def test_openai_provider_real_http_contract(self):
        orig_key = gateway_config.OPENAI_API_KEY
        gateway_config.OPENAI_API_KEY = "sk-test-12345"
        try:
            mock_resp = MagicMock()
            mock_resp.ok = True
            mock_resp.json.return_value = {
                "model": "gpt-4o-mini",
                "choices": [{"message": {"content": '{"type":"complete","summary":"ok"}'}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20},
            }
            with patch("requests.post", return_value=mock_resp) as post_mock:
                res = OpenAIProvider().generate("test", "gpt-4o-mini")
                self.assertTrue(res.success)
                self.assertEqual(res.usage.total_tokens, 20)
                self.assertIn("Authorization", post_mock.call_args.kwargs["headers"])
        finally:
            gateway_config.OPENAI_API_KEY = orig_key

    def test_claude_and_ollama_http_contract(self):
        orig_claude = gateway_config.CLAUDE_API_KEY
        gateway_config.CLAUDE_API_KEY = "sk-ant-test"
        try:
            mock_claude = MagicMock()
            mock_claude.ok = True
            mock_claude.json.return_value = {
                "model": "claude-3-5-sonnet-latest",
                "content": [{"type": "text", "text": '{"type":"complete","summary":"claude ok"}'}],
                "usage": {"input_tokens": 10, "output_tokens": 5},
            }
            with patch("requests.post", return_value=mock_claude):
                res = ClaudeProvider().generate("test", "claude-3-5-sonnet-latest")
                self.assertTrue(res.success)
                self.assertEqual(res.usage.total_tokens, 15)
        finally:
            gateway_config.CLAUDE_API_KEY = orig_claude

        mock_ollama = MagicMock()
        mock_ollama.ok = True
        mock_ollama.json.return_value = {
            "model": "qwen2.5-coder:7b",
            "message": {"content": "hello"},
            "prompt_eval_count": 7,
            "eval_count": 3,
        }
        with patch("requests.post", return_value=mock_ollama):
            res_ol = OllamaProvider().generate("test", "qwen2.5-coder:7b")
            self.assertTrue(res_ol.success)
            self.assertEqual(res_ol.usage.total_tokens, 10)


class TestAgentToolExecutionAndAcceptance(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.temp_dir = tempfile.mkdtemp(prefix="gravityx_sample_")
        os.makedirs(os.path.join(self.temp_dir, "src", "pages"), exist_ok=True)
        os.makedirs(os.path.join(self.temp_dir, "src", "components"), exist_ok=True)

        with open(os.path.join(self.temp_dir, "package.json"), "w", encoding="utf-8") as f:
            json.dump({"name": "sample-dashboard", "scripts": {}}, f)

        with open(os.path.join(self.temp_dir, ".env"), "w", encoding="utf-8") as f:
            f.write("SECRET_KEY=top_secret_value\n")

        self.dashboard_path = os.path.join(self.temp_dir, "src", "pages", "Dashboard.tsx")
        with open(self.dashboard_path, "w", encoding="utf-8") as f:
            f.write(
                "import React from 'react';\n\n"
                "export function Dashboard() {\n"
                "  return (\n"
                "    <div className=\"p-4 flex gap-2\">\n"
                "      <button className=\"px-3 py-1 bg-blue-600 text-white rounded\">Save</button>\n"
                "      <button className=\"px-3 py-1 bg-slate-700 text-white rounded\">Cancel</button>\n"
                "      <button className=\"px-3 py-1 bg-red-600 text-white rounded\">Delete</button>\n"
                "    </div>\n"
                "  );\n"
                "}\n"
            )

        self.session = workspace_manager.open_session(self.temp_dir, workspace_id="sample-ws")
        self.executor = ToolExecutor(workspace_path=self.temp_dir)
        self.runner = AgentRunner(tool_executor=self.executor, max_iterations=10)

    def tearDown(self):
        self.db.close()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_tool_registry_and_security(self):
        self.assertIsNotNone(resolve_tool("list_files"))
        self.assertIsNotNone(resolve_tool("replace_in_file"))
        self.assertIsNotNone(resolve_tool("search_files"))  # alias for search_code
        self.assertIn("git_commit", TOOL_REGISTRY)

        # Path traversal blocked
        trav = self.executor.read_file(self.db, "t-sec", "../outside.txt", workspace_id="sample-ws")
        self.assertEqual(trav["status"], "error")

        # Secret .env read blocked
        env_res = self.executor.read_file(self.db, "t-sec", ".env", workspace_id="sample-ws")
        self.assertEqual(env_res["status"], "error")
        self.assertIn("restricted", env_res["message"].lower())

        # Destructive command blocked
        cmd_res = self.executor.execute_terminal(self.db, "t-sec", "rm -rf /", workspace_id="sample-ws")
        self.assertEqual(cmd_res["status"], "error")

    def test_ask_mode_blocks_mutations(self):
        res = self.runner.run(
            task_id="task-ask-1",
            prompt="Explain Dashboard.tsx",
            workspace_id="sample-ws",
            mode="ask",
            mock_steps=[
                {"action": "tool_call", "tool": "read_file", "arguments": {"path": "src/pages/Dashboard.tsx"}},
                {"action": "tool_call", "tool": "write_file", "arguments": {"path": "src/pages/Dashboard.tsx", "content": "hacked"}},
                {"action": "complete", "summary": "Explained Dashboard.tsx", "answer": "Dashboard renders 3 buttons."},
            ],
            db=self.db,
        )
        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["modified_files"], [])
        # Second observation should be blocked by Ask Mode
        self.assertFalse(res["observations"][1]["result"]["success"])
        self.assertIn("Ask Mode", res["observations"][1]["result"]["error"])

    def test_acceptance_reusable_button_and_dashboard_modification(self):
        button_code = (
            "import React from 'react';\n\n"
            "interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {\n"
            "  variant?: 'primary' | 'secondary' | 'danger';\n"
            "}\n\n"
            "const VARIANT_CLASSES = {\n"
            "  primary: 'bg-blue-600 text-white',\n"
            "  secondary: 'bg-slate-700 text-white',\n"
            "  danger: 'bg-red-600 text-white',\n"
            "};\n\n"
            "export const Button: React.FC<ButtonProps> = ({ variant = 'primary', className = '', children, ...rest }) => (\n"
            "  <button className={`px-3 py-1 rounded ${VARIANT_CLASSES[variant]} ${className}`} {...rest}>\n"
            "    {children}\n"
            "  </button>\n"
            ");\n"
        )

        prompt = (
            "Create a reusable Button component with primary, secondary, and danger variants. "
            "Find the existing dashboard buttons and replace them with the reusable component. "
            "Ensure the component follows the existing project's styling conventions."
        )

        res = self.runner.run(
            task_id="task-accept-1",
            prompt=prompt,
            workspace_id="sample-ws",
            mode="agent",
            mock_steps=[
                {"action": "tool_call", "tool": "list_files", "arguments": {"directory": "."}},
                {"action": "tool_call", "tool": "search_code", "arguments": {"query": "<button"}},
                {"action": "tool_call", "tool": "read_file", "arguments": {"path": "src/pages/Dashboard.tsx"}},
                {"action": "tool_call", "tool": "create_file", "arguments": {"path": "src/components/Button.tsx", "content": button_code}},
                {
                    "action": "tool_call",
                    "tool": "replace_in_file",
                    "arguments": {
                        "path": "src/pages/Dashboard.tsx",
                        "target": "import React from 'react';\n\nexport function Dashboard() {\n  return (\n    <div className=\"p-4 flex gap-2\">\n      <button className=\"px-3 py-1 bg-blue-600 text-white rounded\">Save</button>\n      <button className=\"px-3 py-1 bg-slate-700 text-white rounded\">Cancel</button>\n      <button className=\"px-3 py-1 bg-red-600 text-white rounded\">Delete</button>\n    </div>\n  );\n}",
                        "replacement": "import React from 'react';\nimport { Button } from '../components/Button';\n\nexport function Dashboard() {\n  return (\n    <div className=\"p-4 flex gap-2\">\n      <Button variant=\"primary\">Save</Button>\n      <Button variant=\"secondary\">Cancel</Button>\n      <Button variant=\"danger\">Delete</Button>\n    </div>\n  );\n}",
                    },
                },
                {"action": "complete", "summary": "Created Button component and updated Dashboard.tsx"},
            ],
            db=self.db,
        )

        self.assertEqual(res["status"], "completed")
        self.assertIn("src/components/Button.tsx", res["modified_files"])
        self.assertIn("src/pages/Dashboard.tsx", res["modified_files"])

        # Verify actual files on disk changed!
        btn_abs = os.path.join(self.temp_dir, "src", "components", "Button.tsx")
        self.assertTrue(os.path.exists(btn_abs))
        with open(self.dashboard_path, "r", encoding="utf-8") as f:
            dash_disk = f.read()
        self.assertIn('<Button variant="primary">Save</Button>', dash_disk)
        self.assertIn('<Button variant="danger">Delete</Button>', dash_disk)

        # Verify unified diffs generated
        dash_diff = next(d for d in res["files_changed"] if d["filePath"] == "src/pages/Dashboard.tsx")
        self.assertIn("--- a/src/pages/Dashboard.tsx", dash_diff["unifiedDiff"])
        self.assertIn("+++ b/src/pages/Dashboard.tsx", dash_diff["unifiedDiff"])
        self.assertGreater(dash_diff["linesAdded"], 0)
        self.assertGreater(dash_diff["linesRemoved"], 0)


if __name__ == "__main__":
    unittest.main()

