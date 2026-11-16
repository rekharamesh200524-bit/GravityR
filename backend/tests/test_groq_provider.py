import unittest
from unittest.mock import MagicMock, patch
import requests

from backend.ai_gateway.config.gateway_config import gateway_config
from backend.ai_gateway.factory.provider_factory import provider_factory
from backend.ai_gateway.health.health_monitor import health_monitor
from backend.ai_gateway.interfaces.provider import GatewayResponse
from backend.ai_gateway.providers.groq import GroqProvider
from backend.ai_gateway.registry.model_registry import model_registry
from backend.ai_gateway.registry.provider_registry import provider_registry


class TestGroqProvider(unittest.TestCase):
    def setUp(self):
        self._orig_key = gateway_config.GROQ_API_KEY
        self._orig_model = gateway_config.GROQ_MODEL
        self._orig_provider = provider_registry.get_current_provider_name()
        gateway_config._suppress_env_reload = True
        provider_factory._instances.pop("groq", None)

    def tearDown(self):
        gateway_config.GROQ_API_KEY = self._orig_key
        gateway_config.GROQ_MODEL = self._orig_model
        provider_registry.set_current_provider(self._orig_provider)
        gateway_config._suppress_env_reload = False
        provider_factory._instances.pop("groq", None)

    def test_provider_registered_in_registry(self):
        providers = provider_registry.list_providers()
        names = [p.name for p in providers]
        self.assertIn("groq", names)
        meta = next(p for p in providers if p.name == "groq")
        self.assertIn("Groq Cloud", meta.displayName)

    def test_provider_factory_returns_groq_singleton(self):
        p1 = provider_factory.get_provider("groq")
        p2 = provider_factory.get_provider("groq")
        self.assertIsInstance(p1, GroqProvider)
        self.assertIs(p1, p2)

    def test_model_registry_lists_groq_models(self):
        models = model_registry.list_models_for_provider("groq")
        ids = {m.id for m in models}
        self.assertIn("openai/gpt-oss-120b", ids)
        self.assertIn("qwen/qwen3.8-27b", ids)
        self.assertIn("openai/gpt-oss-20b", ids)

    def test_generate_unconfigured(self):
        gateway_config.GROQ_API_KEY = ""
        provider = GroqProvider()
        res = provider.generate("hello", "openai/gpt-oss-120b")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "NOT_CONFIGURED")

    @patch("requests.post")
    def test_generate_success(self, mock_post):
        gateway_config.GROQ_API_KEY = "gsk_test1234567890abcdef"
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "chatcmpl-test",
            "model": "openai/gpt-oss-120b",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": '{"thought": "done", "tool": "terminal_execute", "arguments": {"command": "dir"}}'
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 15,
                "completion_tokens": 25,
                "total_tokens": 40
            }
        }
        mock_post.return_value = mock_resp

        provider = GroqProvider()
        res = provider.generate("hello", "openai/gpt-oss-120b")

        self.assertIsInstance(res, GatewayResponse)
        self.assertTrue(res.success)
        self.assertIn("terminal_execute", res.content)
        self.assertEqual(res.model, "openai/gpt-oss-120b")
        self.assertEqual(res.provider, "groq")
        self.assertEqual(res.usage.total_tokens, 40)

    @patch("requests.post")
    def test_stream_success(self, mock_post):
        gateway_config.GROQ_API_KEY = "gsk_test1234567890abcdef"
        lines = [
            b'data: {"choices": [{"delta": {"content": "Hello"}}]}',
            b'data: {"choices": [{"delta": {"content": " world"}}]}',
            b'data: [DONE]'
        ]
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.iter_lines.return_value = lines
        mock_post.return_value.__enter__.return_value = mock_resp

        provider = GroqProvider()
        events = list(provider.stream("hello", "openai/gpt-oss-120b"))
        content = "".join(e.get("content", "") for e in events)
        self.assertEqual(content, "Hello world")
        self.assertTrue(events[-1].get("done"))

    @patch("requests.post")
    def test_error_handling_401(self, mock_post):
        gateway_config.GROQ_API_KEY = "gsk_invalid"
        mock_resp = MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 401
        mock_resp.text = "Invalid API Key"
        mock_post.return_value = mock_resp

        provider = GroqProvider()
        res = provider.generate("hello", "openai/gpt-oss-120b")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "INVALID_CREDENTIALS")

    @patch("requests.post")
    def test_error_handling_429(self, mock_post):
        gateway_config.GROQ_API_KEY = "gsk_valid"
        mock_resp = MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 429
        mock_resp.text = "Rate limit reached"
        mock_post.return_value = mock_resp

        provider = GroqProvider()
        res = provider.generate("hello", "openai/gpt-oss-120b")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "RATE_LIMITED")

    @patch("requests.post")
    def test_tool_use_failed_recovery(self, mock_post):
        gateway_config.GROQ_API_KEY = "gsk_valid"
        mock_resp = MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 400
        mock_resp.json.return_value = {
            "error": {
                "message": "Tool choice is none, but model called a tool",
                "type": "invalid_request_error",
                "code": "tool_use_failed",
                "failed_generation": '{"name": "repo_browser.read_file", "arguments": {"path":"src/App.jsx"}}'
            }
        }
        mock_post.return_value = mock_resp

        provider = GroqProvider()
        res = provider.generate("Read src/App.jsx", "openai/gpt-oss-120b")
        self.assertTrue(res.success)
        self.assertIn("repo_browser.read_file", res.content)
        self.assertTrue(res.metadata.get("recovered_tool_call"))

    def test_masked_config_never_exposes_full_key(self):
        gateway_config.GROQ_API_KEY = "gsk_sensitive_secret_value_1234567890"
        masked = gateway_config.get_masked_config()
        self.assertIn("groq", masked["providers"])
        groq_cfg = masked["providers"]["groq"]
        self.assertTrue(groq_cfg["configured"])
        self.assertNotIn("sensitive_secret_value", groq_cfg["api_key_masked"])
        self.assertTrue(groq_cfg["api_key_masked"].startswith("gsk_"))
        self.assertTrue(groq_cfg["api_key_masked"].endswith("7890"))


if __name__ == "__main__":
    unittest.main()
