import json
import time
import threading
import requests
from typing import Dict, Any, Generator, List, Optional
from ..interfaces.provider import IInferenceProvider, GatewayResponse, ModelUsage
from ..logging.gateway_logger import gateway_logger
from ..config.gateway_config import gateway_config


class OpenAIProvider(IInferenceProvider):
    """Real OpenAI Chat Completions provider (supports OpenAI and OpenAI-compatible APIs)."""

    def __init__(self) -> None:
        self._provider_name = "openai"
        self._connected = False
        self._cancelled_tasks: set = set()
        self._lock = threading.Lock()

    def initialize(self) -> bool:
        gateway_logger.info("Initializing OpenAIProvider", self._provider_name)
        return True

    def connect(self) -> bool:
        self._connected = bool(gateway_config.OPENAI_API_KEY.strip())
        return self._connected

    def disconnect(self) -> bool:
        self._connected = False
        return True

    def _build_messages(self, prompt: str, options: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
        if options and isinstance(options.get("messages"), list):
            return options["messages"]
        messages: List[Dict[str, str]] = []
        if options and options.get("system_prompt"):
            messages.append({"role": "system", "content": str(options["system_prompt"])})
        messages.append({"role": "user", "content": prompt})
        return messages

    def _error_response(self, model_id: str, start: float, error_msg: str) -> GatewayResponse:
        return GatewayResponse(
            provider=self._provider_name,
            model=model_id,
            success=False,
            latency=time.time() - start,
            streaming=False,
            content="",
            metadata={"error": error_msg, "configured": bool(gateway_config.OPENAI_API_KEY.strip())},
        )

    def generate(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> GatewayResponse:
        start = time.time()
        options = options or {}
        api_key = gateway_config.OPENAI_API_KEY.strip()
        if not api_key:
            return self._error_response(
                model_id,
                start,
                "OpenAI API key is not configured. Set OPENAI_API_KEY or configure it in Provider Settings.",
            )

        base_url = gateway_config.OPENAI_BASE_URL.rstrip("/")
        model = model_id if model_id and "gpt" in model_id.lower() or model_id.startswith("o") else "gpt-4o-mini"
        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))

        payload: Dict[str, Any] = {
            "model": model,
            "messages": self._build_messages(prompt, options),
            "temperature": options.get("temperature", 0.1),
            "stream": False,
        }
        if options.get("max_tokens"):
            payload["max_tokens"] = int(options["max_tokens"])

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
            if not resp.ok:
                err_text = resp.text[:400]
                return self._error_response(model, start, f"OpenAI API error (HTTP {resp.status_code}): {err_text}")
            data = resp.json()
        except requests.exceptions.Timeout:
            return self._error_response(model, start, f"OpenAI request timed out after {timeout}s.")
        except requests.exceptions.RequestException as exc:
            return self._error_response(model, start, f"OpenAI connection error: {exc}")

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
        )

    def stream(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        options = options or {}
        task_id = options.get("task_id", "")
        api_key = gateway_config.OPENAI_API_KEY.strip()
        if not api_key:
            yield {
                "error": "OpenAI API key is not configured. Set OPENAI_API_KEY or configure it in Provider Settings.",
                "content": "",
                "done": True,
            }
            return

        base_url = gateway_config.OPENAI_BASE_URL.rstrip("/")
        model = model_id if model_id and ("gpt" in model_id.lower() or model_id.startswith("o")) else "gpt-4o-mini"
        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))

        payload: Dict[str, Any] = {
            "model": model,
            "messages": self._build_messages(prompt, options),
            "temperature": options.get("temperature", 0.1),
            "stream": True,
        }
        try:
            with requests.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                stream=True,
                timeout=timeout,
            ) as resp:
                if not resp.ok:
                    yield {"error": f"OpenAI API error (HTTP {resp.status_code}): {resp.text[:300]}", "done": True}
                    return

                for raw_line in resp.iter_lines(decode_unicode=True):
                    if task_id and task_id in self._cancelled_tasks:
                        with self._lock:
                            self._cancelled_tasks.discard(task_id)
                        yield {"cancelled": True, "done": True}
                        return
                    if not raw_line or not raw_line.startswith("data:"):
                        continue
                    data_str = raw_line[5:].strip()
                    if data_str == "[DONE]":
                        yield {"content": "", "done": True}
                        return
                    try:
                        chunk = json.loads(data_str)
                        delta = ((chunk.get("choices") or [{}])[0].get("delta") or {}).get("content")
                        if delta:
                            yield {"content": delta, "done": False}
                    except json.JSONDecodeError:
                        continue
        except Exception as exc:
            yield {"error": f"OpenAI streaming error: {exc}", "done": True}

    def cancel(self, task_id: str) -> bool:
        if task_id:
            with self._lock:
                self._cancelled_tasks.add(task_id)
        return True

    def health(self) -> Dict[str, Any]:
        api_key = gateway_config.OPENAI_API_KEY.strip()
        if not api_key:
            return {
                "provider": self._provider_name,
                "status": "unconfigured",
                "connected": False,
                "error": "OPENAI_API_KEY is not set",
            }
        start = time.time()
        try:
            resp = requests.get(
                f"{gateway_config.OPENAI_BASE_URL.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=8,
            )
            latency_ms = round((time.time() - start) * 1000, 1)
            if resp.ok:
                return {"provider": self._provider_name, "status": "online", "connected": True, "latency_ms": latency_ms}
            return {
                "provider": self._provider_name,
                "status": "offline",
                "connected": False,
                "latency_ms": latency_ms,
                "error": f"HTTP {resp.status_code}",
            }
        except Exception as exc:
            return {"provider": self._provider_name, "status": "offline", "connected": False, "error": str(exc)}

    def list_models(self) -> List[str]:
        return ["gpt-4o", "gpt-4o-mini", "o3-mini"]
