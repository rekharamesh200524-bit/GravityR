import json
import time
import re
import threading
import requests
from typing import Dict, Any, Generator, List, Optional
from ..interfaces.provider import IInferenceProvider, GatewayResponse, ModelUsage
from ..logging.gateway_logger import gateway_logger
from ..config.gateway_config import gateway_config


VERIFIED_GROQ_MODELS: List[str] = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]


class GroqProvider(IInferenceProvider):
    """Direct Groq Cloud API provider hosting open-source models with high-speed LPU inference."""

    def __init__(self) -> None:
        self._provider_name = "groq"
        self._connected = False
        self._cancelled_tasks: set = set()
        self._lock = threading.Lock()

    def initialize(self) -> bool:
        gateway_logger.info("Initializing GroqProvider", self._provider_name)
        return True

    def _get_api_key(self) -> str:
        key = (gateway_config.GROQ_API_KEY or "").strip()
        if not key:
            gateway_config.reload_from_env()
            key = (gateway_config.GROQ_API_KEY or "").strip()
        return key

    def connect(self) -> bool:
        self._connected = bool(self._get_api_key())
        return self._connected

    def disconnect(self) -> bool:
        self._connected = False
        return True

    def _resolve_model(self, model_id: Optional[str]) -> str:
        cand = (model_id or gateway_config.GROQ_MODEL or "qwen/qwen3.8-27b").strip()
        if cand in VERIFIED_GROQ_MODELS:
            return cand
        low = cand.lower()
        if "gemini" in low or "claude" in low:
            return gateway_config.GROQ_MODEL or "qwen/qwen3.8-27b"
        if "qwen" in low or "27b" in low:
            return "qwen/qwen3.8-27b"
        if "20b" in low:
            return "openai/gpt-oss-20b"
        if "120b" in low or "gpt-oss-120b" in low:
            return "openai/gpt-oss-120b"
        return gateway_config.GROQ_MODEL or "qwen/qwen3.8-27b"

    def _parse_reset_time(self, resp: requests.Response, default: float = 3.5) -> float:
        """Extract exact cooldown time from Groq rate limit headers or error message."""
        reset_header = resp.headers.get("x-ratelimit-reset-tokens") or resp.headers.get("retry-after")
        if reset_header:
            h = reset_header.strip()
            if h.endswith("ms"):
                try:
                    return float(h[:-2]) / 1000.0 + 0.3
                except ValueError:
                    pass
            elif h.endswith("s"):
                try:
                    return float(h[:-1]) + 0.5
                except ValueError:
                    pass
            else:
                try:
                    return float(h) + 0.5
                except ValueError:
                    pass
        try:
            err_msg = resp.json().get("error", {}).get("message", "")
            match = re.search(r"try again in (\d+(\.\d+)?)s", err_msg)
            if match:
                return float(match.group(1)) + 0.5
        except Exception:
            pass
        return default

    def _build_messages(self, prompt: str, options: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
        if options and isinstance(options.get("messages"), list):
            return options["messages"]
        messages: List[Dict[str, str]] = []
        if options and options.get("system_prompt"):
            messages.append({"role": "system", "content": str(options["system_prompt"])})
        messages.append({"role": "user", "content": prompt})
        return messages

    def _error_response(
        self,
        model_id: str,
        start: float,
        error_msg: str,
        status_code: str = "ERROR",
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

    def generate(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> GatewayResponse:
        start = time.time()
        options = options or {}
        api_key = self._get_api_key()
        model = self._resolve_model(model_id)

        if not api_key:
            return self._error_response(
                model,
                start,
                "Groq API key is not configured. Set GROQ_API_KEY in .env or configure it in Settings.",
                status_code="NOT_CONFIGURED",
                http_status=400,
            )

        base_url = gateway_config.GROQ_BASE_URL.rstrip("/")
        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))

        payload: Dict[str, Any] = {
            "model": model,
            "messages": self._build_messages(prompt, options),
            "temperature": options.get("temperature", 0.1),
            "stream": False,
        }
        if options.get("response_mime_type") == "application/json":
            payload["response_format"] = {"type": "json_object"}
        if options.get("max_tokens"):
            payload["max_tokens"] = int(options["max_tokens"])

        max_retries = 4
        data = None
        for attempt in range(max_retries + 1):
            try:
                resp = requests.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=timeout,
                )

                # Automatic 429 exponential / header-directed backoff
                if resp.status_code == 429 and attempt < max_retries:
                    wait_time = self._parse_reset_time(resp)
                    gateway_logger.warn(
                        f"Groq TPM rate limit reached. Pausing {wait_time:.2f}s before automatic retry (attempt {attempt + 1}/{max_retries})...",
                        self._provider_name,
                    )
                    time.sleep(wait_time)
                    continue

                if not resp.ok:
                    try:
                        err_json = resp.json()
                        err_obj = err_json.get("error", {})
                        if err_obj.get("code") == "tool_use_failed" and err_obj.get("failed_generation"):
                            recovered = err_obj["failed_generation"].strip()
                            gateway_logger.info(f"Recovered tool call from Groq tool_use_failed: {recovered[:80]}", self._provider_name)
                            return GatewayResponse(
                                provider=self._provider_name,
                                model=model,
                                success=True,
                                latency=time.time() - start,
                                streaming=False,
                                content=recovered,
                                usage=ModelUsage(prompt_tokens=50, completion_tokens=30, total_tokens=80),
                                metadata={"provider_status": "CONNECTED", "recovered_tool_call": True},
                            )
                    except Exception:
                        pass

                    err_text = resp.text[:400]
                    code = resp.status_code
                    status_code = "INVALID_CREDENTIALS" if code in (401, 403) else ("RATE_LIMITED" if code == 429 else "ERROR")
                    return self._error_response(
                        model,
                        start,
                        f"Groq API error (HTTP {code}): {err_text}",
                        status_code=status_code,
                        http_status=code,
                    )

                data = resp.json()
                break
            except requests.exceptions.Timeout:
                if attempt < max_retries:
                    time.sleep(1.0)
                    continue
                return self._error_response(model, start, f"Groq request timed out after {timeout}s.", status_code="NETWORK_ERROR", http_status=504)
            except requests.exceptions.RequestException as exc:
                return self._error_response(model, start, f"Groq connection error: {exc}", status_code="NETWORK_ERROR", http_status=502)

        if not data:
            return self._error_response(model, start, "Groq response empty or retries exhausted.", status_code="RATE_LIMITED", http_status=429)

        choices = data.get("choices") or []
        content = ""
        if choices:
            content = (choices[0].get("message") or {}).get("content", "") or ""
        usage_raw = data.get("usage") or {}
        usage = ModelUsage(
            prompt_tokens=int(usage_raw.get("prompt_tokens", 0)),
            completion_tokens=int(usage_raw.get("completion_tokens", 0)),
            total_tokens=int(usage_raw.get("total_tokens", 0)),
        )
        return GatewayResponse(
            provider=self._provider_name,
            model=data.get("model", model),
            success=True,
            latency=time.time() - start,
            streaming=False,
            content=content,
            usage=usage,
            metadata={"provider_status": "CONNECTED"},
        )

    def stream(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        options = options or {}
        task_id = options.get("task_id", "")
        api_key = self._get_api_key()
        model = self._resolve_model(model_id)

        if not api_key:
            yield {
                "error": "Groq API key is not configured. Set GROQ_API_KEY in .env or configure it in Settings.",
                "provider_status": "NOT_CONFIGURED",
                "content": "",
                "done": True,
            }
            return

        base_url = gateway_config.GROQ_BASE_URL.rstrip("/")
        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))

        payload: Dict[str, Any] = {
            "model": model,
            "messages": self._build_messages(prompt, options),
            "temperature": options.get("temperature", 0.1),
            "stream": True,
        }
        if options.get("response_mime_type") == "application/json":
            payload["response_format"] = {"type": "json_object"}

        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                with requests.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=timeout,
                    stream=True,
                ) as resp:
                    if resp.status_code == 429 and attempt < max_retries:
                        wait_time = self._parse_reset_time(resp)
                        gateway_logger.warn(
                            f"Groq stream 429 rate limit hit. Pausing {wait_time:.2f}s before retry...",
                            self._provider_name,
                        )
                        time.sleep(wait_time)
                        continue

                    if not resp.ok:
                        try:
                            err_json = resp.json()
                            err_obj = err_json.get("error", {})
                            if err_obj.get("code") == "tool_use_failed" and err_obj.get("failed_generation"):
                                recovered = err_obj["failed_generation"].strip()
                                yield {"content": recovered, "done": True, "recovered_tool_call": True}
                                return
                        except Exception:
                            pass
                        err_text = resp.text[:300]
                        yield {
                            "error": f"Groq HTTP {resp.status_code}: {err_text}",
                            "provider_status": "INVALID_CREDENTIALS" if resp.status_code in (401, 403) else ("RATE_LIMITED" if resp.status_code == 429 else "ERROR"),
                            "done": True,
                        }
                        return

                    for line in resp.iter_lines():
                        if task_id and task_id in self._cancelled_tasks:
                            with self._lock:
                                self._cancelled_tasks.discard(task_id)
                            yield {"cancelled": True, "done": True}
                            return
                        if not line:
                            continue
                        decoded = line.decode("utf-8") if isinstance(line, bytes) else line
                        if not decoded.startswith("data:"):
                            continue
                        data_str = decoded[len("data:"):].strip()
                        if data_str == "[DONE]":
                            yield {"content": "", "done": True}
                            return
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        delta = (chunk.get("choices") or [{}])[0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield {"content": token, "done": False}
                return
            except requests.exceptions.Timeout:
                if attempt < max_retries:
                    time.sleep(1.0)
                    continue
                yield {"error": f"Groq request timed out after {timeout}s.", "provider_status": "NETWORK_ERROR", "done": True}
                return
            except requests.exceptions.RequestException as exc:
                yield {"error": f"Groq streaming connection error: {exc}", "provider_status": "NETWORK_ERROR", "done": True}
                return

    def cancel(self, task_id: str) -> bool:
        if task_id:
            with self._lock:
                self._cancelled_tasks.add(task_id)
        return True

    def health(self) -> Dict[str, Any]:
        api_key = self._get_api_key()
        if not api_key:
            return {
                "provider": self._provider_name,
                "status": "unconfigured",
                "provider_status": "NOT_CONFIGURED",
                "connected": False,
                "error": "GROQ_API_KEY is not set",
            }
        start = time.time()
        try:
            resp = requests.get(
                f"{gateway_config.GROQ_BASE_URL.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=4,
            )
            latency_ms = round((time.time() - start) * 1000, 1)
            if resp.ok:
                data = resp.json()
                models = [m.get("id") for m in data.get("data", []) if m.get("id")]
                return {
                    "provider": self._provider_name,
                    "status": "online",
                    "provider_status": "CONNECTED",
                    "connected": True,
                    "latency_ms": latency_ms,
                    "models": models[:10],
                }
            code = resp.status_code
            status_code = "INVALID_CREDENTIALS" if code in (401, 403) else ("RATE_LIMITED" if code == 429 else "ERROR")
            return {
                "provider": self._provider_name,
                "status": "offline",
                "provider_status": status_code,
                "connected": False,
                "error": f"HTTP {code}",
            }
        except Exception as exc:
            return {
                "provider": self._provider_name,
                "status": "offline",
                "provider_status": "NETWORK_ERROR",
                "connected": False,
                "error": f"Unreachable: {exc}",
            }

    def list_models(self) -> List[str]:
        return VERIFIED_GROQ_MODELS

