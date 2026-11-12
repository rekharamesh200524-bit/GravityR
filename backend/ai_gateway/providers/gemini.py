import time
import threading
from typing import Dict, Any, Generator, List, Optional

from google import genai
from google.genai import types
from google.genai import errors as genai_errors

from ..interfaces.provider import IInferenceProvider, GatewayResponse, ModelUsage
from ..logging.gateway_logger import gateway_logger
from ..config.gateway_config import gateway_config


VERIFIED_GEMINI_MODELS: List[str] = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
]


class GoogleGeminiProvider(IInferenceProvider):
    """Direct official Google Gemini API provider powered by google-genai SDK."""

    def __init__(self) -> None:
        self._provider_name = "google_gemini"
        self._connected = False
        self._cancelled_tasks: set = set()
        self._lock = threading.Lock()

    def initialize(self) -> bool:
        gateway_logger.info("Initializing GoogleGeminiProvider", self._provider_name)
        return True

    def _get_api_key(self) -> str:
        return (gateway_config.GEMINI_API_KEY or "").strip()

    def _build_client(self, timeout_seconds: Optional[int] = None) -> genai.Client:
        api_key = self._get_api_key()
        timeout_ms = int((timeout_seconds or gateway_config.REQUEST_TIMEOUT) * 1000)
        return genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=timeout_ms),
        )

    def connect(self) -> bool:
        self._connected = bool(self._get_api_key())
        return self._connected

    def disconnect(self) -> bool:
        self._connected = False
        return True

    def _resolve_model(self, model_id: Optional[str]) -> str:
        candidate = (model_id or gateway_config.GEMINI_MODEL or "gemini-2.5-flash").strip()
        if candidate.startswith("models/"):
            candidate = candidate[len("models/"):]
        if "gemini" in candidate.lower():
            return candidate
        return gateway_config.GEMINI_MODEL or "gemini-2.5-flash"

    def _classify_api_error(self, exc: Exception) -> tuple[str, str, int]:
        """Map SDK / network exceptions to safe status codes and messages without leaking secrets."""
        if isinstance(exc, genai_errors.APIError) or hasattr(exc, "code") or hasattr(exc, "status_code"):
            code = getattr(exc, "code", None) or getattr(exc, "status_code", None) or 500
            msg = str(getattr(exc, "message", "") or str(exc))
            low = msg.lower()
            if code in (401, 403) or "api key" in low or "permission_denied" in low or "unauthenticated" in low:
                return "INVALID_CREDENTIALS", "Invalid or unauthorized Google Gemini API key.", 401
            if code == 404 or "not found" in low or "not supported" in low:
                return "MODEL_UNAVAILABLE", f"Selected Gemini model is unavailable: {msg[:200]}", 404
            if code == 429:
                if "quota" in low or "billing" in low or "exhausted" in low:
                    return "QUOTA_EXCEEDED", "Google Gemini API quota exceeded. Check billing/quota.", 429
                return "RATE_LIMITED", "Google Gemini API rate limit exceeded. Please retry shortly.", 429
            if code >= 500:
                return "SERVICE_UNAVAILABLE", f"Google Gemini service unavailable (HTTP {code}).", 503
            return "SERVICE_UNAVAILABLE", f"Gemini API error (HTTP {code}): {msg[:200]}", int(code)

        low_err = str(exc).lower()
        if "timeout" in low_err or "timed out" in low_err:
            return "NETWORK_ERROR", "Request to Google Gemini API timed out.", 504
        return "NETWORK_ERROR", f"Network error reaching Google Gemini API: {type(exc).__name__}", 502

    def _error_response(
        self,
        model_id: str,
        start: float,
        status_code: str,
        error_msg: str,
        http_status: int = 500,
    ) -> GatewayResponse:
        return GatewayResponse(
            provider=self._provider_name,
            model=model_id,
            success=False,
            latency=time.time() - start,
            streaming=False,
            content="",
            metadata={
                "error": error_msg,
                "provider_status": status_code,
                "http_status": http_status,
                "configured": bool(self._get_api_key()),
            },
        )

    def _build_config_and_contents(self, prompt: str, options: Optional[Dict[str, Any]]) -> tuple[types.GenerateContentConfig, Any]:
        options = options or {}
        system_prompt = options.get("system_prompt")
        config_kwargs: Dict[str, Any] = {
            "temperature": float(options.get("temperature", 0.1)),
        }
        if options.get("max_tokens") or options.get("max_output_tokens"):
            config_kwargs["max_output_tokens"] = int(options.get("max_tokens") or options.get("max_output_tokens"))
        if system_prompt:
            config_kwargs["system_instruction"] = str(system_prompt)
        if options.get("response_mime_type"):
            config_kwargs["response_mime_type"] = str(options["response_mime_type"])
        if options.get("tools"):
            config_kwargs["tools"] = options["tools"]

        contents: Any = prompt
        if isinstance(options.get("messages"), list):
            formatted: List[types.Content] = []
            for m in options["messages"]:
                role = m.get("role", "user")
                if role == "system":
                    existing = config_kwargs.get("system_instruction", "")
                    config_kwargs["system_instruction"] = (f"{existing}\n{m.get('content', '')}").strip()
                    continue
                gemini_role = "model" if role == "assistant" else "user"
                formatted.append(
                    types.Content(
                        role=gemini_role,
                        parts=[types.Part.from_text(text=str(m.get("content", "")))],
                    )
                )
            if formatted:
                contents = formatted

        return types.GenerateContentConfig(**config_kwargs), contents

    def generate(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> GatewayResponse:
        start = time.time()
        options = options or {}
        model = self._resolve_model(model_id)

        if not self._get_api_key():
            return self._error_response(
                model,
                start,
                "NOT_CONFIGURED",
                "Google Gemini API key is not configured. Set GEMINI_API_KEY or configure it in Settings.",
                http_status=400,
            )

        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))
        try:
            client = self._build_client(timeout_seconds=timeout)
            gen_config, contents = self._build_config_and_contents(prompt, options)
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=gen_config,
            )
        except Exception as exc:
            status_code, err_msg, http_status = self._classify_api_error(exc)
            gateway_logger.error(f"Gemini generate error ({status_code}): {err_msg}", self._provider_name)
            return self._error_response(model, start, status_code, err_msg, http_status=http_status)

        text = getattr(response, "text", None) or ""
        if not text.strip():
            return self._error_response(
                model,
                start,
                "EMPTY_RESPONSE",
                "Google Gemini API returned an empty response.",
                http_status=502,
            )
        usage_meta = getattr(response, "usage_metadata", None)
        prompt_tok = int(getattr(usage_meta, "prompt_token_count", 0) or 0)
        comp_tok = int(getattr(usage_meta, "candidates_token_count", 0) or 0)
        total_tok = int(getattr(usage_meta, "total_token_count", 0) or (prompt_tok + comp_tok))

        return GatewayResponse(
            provider=self._provider_name,
            model=model,
            success=True,
            latency=time.time() - start,
            streaming=False,
            content=text,
            usage=ModelUsage(
                prompt_tokens=prompt_tok,
                completion_tokens=comp_tok,
                total_tokens=total_tok,
            ),
            metadata={"provider_status": "CONNECTED"},
        )

    def stream(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        options = options or {}
        task_id = options.get("task_id", "")
        model = self._resolve_model(model_id)

        if not self._get_api_key():
            yield {
                "error": "Google Gemini API key is not configured. Set GEMINI_API_KEY or configure it in Settings.",
                "provider_status": "NOT_CONFIGURED",
                "content": "",
                "done": True,
            }
            return

        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))
        try:
            client = self._build_client(timeout_seconds=timeout)
            gen_config, contents = self._build_config_and_contents(prompt, options)
            for chunk in client.models.generate_content_stream(
                model=model,
                contents=contents,
                config=gen_config,
            ):
                if task_id and task_id in self._cancelled_tasks:
                    with self._lock:
                        self._cancelled_tasks.discard(task_id)
                    yield {"cancelled": True, "done": True}
                    return
                text = getattr(chunk, "text", None) or ""
                if text:
                    yield {"content": text, "done": False}
            yield {"content": "", "done": True}
        except Exception as exc:
            status_code, err_msg, _ = self._classify_api_error(exc)
            yield {"error": err_msg, "provider_status": status_code, "done": True}

    def cancel(self, task_id: str) -> bool:
        if task_id:
            with self._lock:
                self._cancelled_tasks.add(task_id)
        return True

    def health(self) -> Dict[str, Any]:
        if not self._get_api_key():
            return {
                "provider": self._provider_name,
                "status": "unconfigured",
                "provider_status": "NOT_CONFIGURED",
                "connected": False,
                "error": "GEMINI_API_KEY is not set",
            }
        start = time.time()
        try:
            client = self._build_client(timeout_seconds=10)
            discovered: List[str] = []
            for m in client.models.list():
                name = getattr(m, "name", "") or ""
                short = name.replace("models/", "")
                if short.startswith("gemini-"):
                    discovered.append(short)
                if len(discovered) >= 10:
                    break
            latency_ms = round((time.time() - start) * 1000, 1)
            return {
                "provider": self._provider_name,
                "status": "online",
                "provider_status": "CONNECTED",
                "connected": True,
                "latency_ms": latency_ms,
                "models": discovered or VERIFIED_GEMINI_MODELS,
            }
        except Exception as exc:
            status_code, err_msg, _ = self._classify_api_error(exc)
            return {
                "provider": self._provider_name,
                "status": "offline",
                "provider_status": status_code,
                "connected": False,
                "error": err_msg,
            }

    def list_models(self) -> List[str]:
        if self._get_api_key():
            h = self.health()
            if h.get("models"):
                return h["models"]
        return list(VERIFIED_GEMINI_MODELS)

