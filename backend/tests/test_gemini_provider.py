import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.ai_gateway.config.gateway_config import gateway_config
from backend.ai_gateway.factory.provider_factory import provider_factory
from backend.ai_gateway.health.health_monitor import health_monitor
from backend.ai_gateway.interfaces.provider import GatewayResponse
from backend.ai_gateway.manager import gateway_manager
from backend.ai_gateway.providers.gemini import GoogleGeminiProvider
from backend.ai_gateway.registry.model_registry import model_registry
from backend.ai_gateway.registry.provider_registry import provider_registry
from backend.services.agent_runner import AgentRunner
from backend.services.tool_executor import ToolExecutor
from backend.services.workspace_manager import workspace_manager
from backend.database.connection import SessionLocal, Base, engine


class FakeGenAIError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class TestGoogleGeminiProvider(unittest.TestCase):
    def setUp(self):
        self._orig_key = gateway_config.GEMINI_API_KEY
        self._orig_model = gateway_config.GEMINI_MODEL
        self._orig_provider = provider_registry.get_current_provider_name()
        provider_factory._instances.pop("google_gemini", None)

    def tearDown(self):
        gateway_config.GEMINI_API_KEY = self._orig_key
        gateway_config.GEMINI_MODEL = self._orig_model
        provider_registry.set_current_provider(self._orig_provider)
        provider_factory._instances.pop("google_gemini", None)

    # 1. Provider registration
    def test_provider_registered_in_registry(self):
        providers = provider_registry.list_providers()
        names = [p.name for p in providers]
        self.assertIn("google_gemini", names)
        gemini_meta = next(p for p in providers if p.name == "google_gemini")
        self.assertEqual(gemini_meta.displayName, "Google Gemini API")

    # 2. ProviderFactory singleton creation
    def test_provider_factory_returns_gemini_singleton(self):
        p1 = provider_factory.get_provider("google_gemini")
        p2 = provider_factory.get_provider("google_gemini")
        self.assertIsInstance(p1, GoogleGeminiProvider)
        self.assertIs(p1, p2)

    # 3. ModelRegistry verified Gemini models
    def test_model_registry_lists_verified_gemini_models(self):
        models = model_registry.list_models_for_provider("google_gemini")
        ids = {m.id for m in models}
        self.assertIn("gemini-2.5-flash", ids)
        self.assertIn("gemini-2.5-pro", ids)
        self.assertIn("gemini-2.0-flash", ids)

    # 4. Missing API key -> NOT_CONFIGURED
    def test_missing_api_key_returns_not_configured(self):
        gateway_config.GEMINI_API_KEY = ""
        provider = GoogleGeminiProvider()
        res = provider.generate("hello", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "NOT_CONFIGURED")
        self.assertIn("GEMINI_API_KEY", res.metadata.get("error", ""))

        h = provider.health()
        self.assertEqual(h["status"], "unconfigured")
        self.assertEqual(h["provider_status"], "NOT_CONFIGURED")

    # 5. Invalid API key -> INVALID_CREDENTIALS
    def test_invalid_api_key_returns_invalid_credentials(self):
        gateway_config.GEMINI_API_KEY = "AIzaInvalidKey"
        provider = GoogleGeminiProvider()
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = FakeGenAIError("API_KEY_INVALID: API key not valid", 401)
        with patch.object(provider, "_build_client", return_value=mock_client):
            res = provider.generate("hello", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "INVALID_CREDENTIALS")
        self.assertEqual(res.metadata.get("http_status"), 401)

    # 6. Valid API key generate() + token usage
    def test_valid_generate_returns_text_and_usage(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()
        mock_response = SimpleNamespace(
            text="Hello from Gemini!",
            usage_metadata=SimpleNamespace(
                prompt_token_count=12,
                candidates_token_count=6,
                total_token_count=18,
            ),
            candidates=[],
        )
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        with patch.object(provider, "_build_client", return_value=mock_client):
            res = provider.generate("Say hi", "gemini-2.5-flash", {"temperature": 0.1})
        self.assertTrue(res.success)
        self.assertEqual(res.content, "Hello from Gemini!")
        self.assertEqual(res.provider, "google_gemini")
        self.assertEqual(res.model, "gemini-2.5-flash")
        self.assertEqual(res.usage.prompt_tokens, 12)
        self.assertEqual(res.usage.completion_tokens, 6)
        self.assertEqual(res.usage.total_tokens, 18)

    # 7. Streaming generation
    def test_stream_yields_tokens_and_done(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()
        chunk1 = SimpleNamespace(text="Hello ", usage_metadata=None)
        chunk2 = SimpleNamespace(text="world", usage_metadata=None)
        mock_client = MagicMock()
        mock_client.models.generate_content_stream.return_value = iter([chunk1, chunk2])
        with patch.object(provider, "_build_client", return_value=mock_client):
            events = list(provider.stream("Hi", "gemini-2.5-flash"))
        tokens = [e["content"] for e in events if not e.get("done")]
        self.assertEqual("".join(tokens), "Hello world")
        self.assertTrue(events[-1]["done"])

    # 8. Cancel streaming
    def test_cancel_stops_stream(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()

        def slow_chunks():
            yield SimpleNamespace(text="part1", usage_metadata=None)
            provider.cancel("req-1")
            yield SimpleNamespace(text="part2", usage_metadata=None)

        mock_client = MagicMock()
        mock_client.models.generate_content_stream.return_value = slow_chunks()
        with patch.object(provider, "_build_client", return_value=mock_client):
            events = list(provider.stream("Hi", "gemini-2.5-flash", {"task_id": "req-1"}))
        self.assertTrue(any(e.get("cancelled") is True and e.get("done") is True for e in events))

    # 9. Model unavailable (404)
    def test_model_unavailable_404(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = FakeGenAIError("models/bad-model is not found", 404)
        with patch.object(provider, "_build_client", return_value=mock_client):
            res = provider.generate("hi", "gemini-bad-model")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "MODEL_UNAVAILABLE")
        self.assertEqual(res.metadata.get("http_status"), 404)

    # 10. Rate limit (429)
    def test_rate_limited_429(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = FakeGenAIError("429 Too Many Requests: rate limit exceeded", 429)
        with patch.object(provider, "_build_client", return_value=mock_client):
            res = provider.generate("hi", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "RATE_LIMITED")
        self.assertEqual(res.metadata.get("http_status"), 429)

    # 11. Quota exceeded (429)
    def test_quota_exceeded_429(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = FakeGenAIError("429 RESOURCE_EXHAUSTED: Quota exceeded for billing", 429)
        with patch.object(provider, "_build_client", return_value=mock_client):
            res = provider.generate("hi", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "QUOTA_EXCEEDED")

    # 12. Timeout / Network error
    def test_network_timeout_error(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = TimeoutError("Request timed out")
        with patch.object(provider, "_build_client", return_value=mock_client):
            res = provider.generate("hi", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "NETWORK_ERROR")
        self.assertEqual(res.metadata.get("http_status"), 504)

    # 13. Service unavailable (503)
    def test_service_unavailable_503(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = FakeGenAIError("503 Service Unavailable", 503)
        with patch.object(provider, "_build_client", return_value=mock_client):
            res = provider.generate("hi", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "SERVICE_UNAVAILABLE")

    # 14. Malformed / empty API response
    def test_empty_response_returns_error(self):
        gateway_config.GEMINI_API_KEY = "AIzaValidTestKey"
        provider = GoogleGeminiProvider()
        mock_response = SimpleNamespace(text="", usage_metadata=None, candidates=[])
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        with patch.object(provider, "_build_client", return_value=mock_client):
            res = provider.generate("hi", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.metadata.get("provider_status"), "EMPTY_RESPONSE")

    # 15. Provider switching
    def test_provider_switching_between_gemini_colab_openai(self):
        provider_registry.set_current_provider("google_gemini")
        self.assertEqual(provider_registry.get_current_provider_name(), "google_gemini")
        provider_registry.set_current_provider("google_colab")
        self.assertEqual(provider_registry.get_current_provider_name(), "google_colab")
        provider_registry.set_current_provider("openai")
        self.assertEqual(provider_registry.get_current_provider_name(), "openai")

    # 16. HealthMonitor integration
    def test_health_monitor_reports_gemini_status(self):
        gateway_config.GEMINI_API_KEY = ""
        provider_registry.set_current_provider("google_gemini")
        from backend.ai_gateway.cache.provider_cache import provider_cache
        provider_cache.clear()
        report = health_monitor.check_gateway_health()
        gemini_health = next((p for p in report["providers"] if p.get("provider") == "google_gemini"), None)
        self.assertIsNotNone(gemini_health)
        self.assertEqual(gemini_health["provider_status"], "NOT_CONFIGURED")
        self.assertEqual(report["status"], "degraded")

    # 17. Masked config never exposes raw GEMINI_API_KEY
    def test_masked_config_hides_api_key(self):
        gateway_config.GEMINI_API_KEY = "AIzaSecret1234567890"
        masked = gateway_config.get_masked_config()
        gemini_cfg = masked["providers"]["google_gemini"]
        self.assertTrue(gemini_cfg["configured"])
        self.assertNotIn("AIzaSecret1234567890", str(masked))
        self.assertTrue(gemini_cfg["api_key_masked"].startswith("AIza"))
        self.assertTrue(gemini_cfg["api_key_masked"].endswith("7890"))

    # 18. Multi-step AgentRunner execution with mocked Gemini tool calling
    def test_agent_runner_executes_tool_calls_via_gemini_provider(self):
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = Path(tmpdir)
            (repo / "hello.txt").write_text("old content", encoding="utf-8")
            workspace_manager.open_session(str(repo), workspace_id="gemini-test-ws")

            provider_registry.set_current_provider("google_gemini")
            responses = [
                GatewayResponse(
                    success=True,
                    content='{"action":"tool_call","tool":"write_file","arguments":{"path":"hello.txt","content":"new content"}}',
                    provider="google_gemini",
                    model="gemini-2.5-flash",
                    latency=0.05,
                    streaming=False,
                ),
                GatewayResponse(
                    success=True,
                    content='{"action":"complete","summary":"Updated hello.txt","answer":"Updated hello.txt successfully."}',
                    provider="google_gemini",
                    model="gemini-2.5-flash",
                    latency=0.05,
                    streaming=False,
                ),
            ]

            executor = ToolExecutor(workspace_path=str(repo))
            runner = AgentRunner(tool_executor=executor, max_iterations=5)
            with patch.object(gateway_manager, "generate", side_effect=responses) as mock_gen:
                result = runner.run(
                    task_id="test-gemini-task-1",
                    prompt="Change hello.txt to new content",
                    workspace_id="gemini-test-ws",
                    mode="agent",
                    model="gemini-2.5-flash",
                    db=db,
                )

            db.close()
            self.assertEqual(result["status"], "completed")
            self.assertEqual((repo / "hello.txt").read_text(encoding="utf-8"), "new content")
            self.assertGreaterEqual(mock_gen.call_count, 2)
            # Ensure response_mime_type=application/json was passed in agent mode
            _, kwargs = mock_gen.call_args_list[0]
            self.assertEqual(kwargs.get("options", {}).get("response_mime_type"), "application/json")


if __name__ == "__main__":
    unittest.main()
