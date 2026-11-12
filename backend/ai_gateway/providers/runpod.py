import json
import time
import threading
import requests
from typing import Dict, Any, Generator, List, Optional
from ..interfaces.provider import IInferenceProvider, GatewayResponse, ModelUsage
from ..logging.gateway_logger import gateway_logger
from ..config.gateway_config import gateway_config


class RunPodProvider(IInferenceProvider):
    """Real RunPod OpenAI-compatible vLLM / serverless endpoint provider."""

    def __init__(self) -> None:
        self._provider_name = "runpod"
        self._connected = False
        self._cancelled_tasks: set = set()
        self._lock = threading.Lock()

    def initialize(self) -> bool:
        gateway_logger.info("Initializing RunPodProvider", self._provider_name)
        return True

    def connect(self) -> bool:
        self._connected = bool(gateway_config.RUNPOD_ENDPOINT.strip())
        return self._connected

    def disconnect(self) -> bool:
        self._connected = False
        return True

    def _error_response(self, model_id: str, start: float, error_msg: str) -> GatewayResponse:
        return GatewayResponse(
            provider=self._provider_name,
            model=model_id,
            success=False,
            latency=time.time() - start,
            streaming=False,
            content="",
            metadata={"error": error_msg, "configured": bool(gateway_config.RUNPOD_ENDPOINT.strip())},
        )

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if gateway_config.RUNPOD_API_KEY.strip():
            headers["Authorization"] = f"Bearer {gateway_config.RUNPOD_API_KEY.strip()}"
        return headers

    def _build_messages(self, prompt: str, options: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
        if options and isinstance(options.get("messages"), list):
            return options["messages"]
        messages: List[Dict[str, str]] = []
        if options and options.get("system_prompt"):
            messages.append({"role": "system", "content": str(options["system_prompt"])})
        messages.append({"role": "user", "content": prompt})
        return messages

    def generate(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> GatewayResponse:
        start = time.time()
        options = options or {}
        endpoint = gateway_config.RUNPOD_ENDPOINT.strip().rstrip("/")
        if not endpoint:
            return self._error_response(
                model_id,
                start,
                "RunPod endpoint is not configured. Set RUNPOD_ENDPOINT or configure it in Provider Settings.",
            )

        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))
        url = endpoint if endpoint.endswith("/chat/completions") else f"{endpoint}/v1/chat/completions"
        payload = {
            "model": model_id,
            "messages": self._build_messages(prompt, options),
            "temperature": options.get("temperature", 0.1),
            "stream": False,
        }

        try:
            resp = requests.post(url, headers=self._headers(), json=payload, timeout=timeout)
            if not resp.ok:
                return self._error_response(model_id, start, f"RunPod API error (HTTP {resp.status_code}): {resp.text[:300]}")
            data = resp.json()
        except requests.exceptions.Timeout:
            return self._error_response(model_id, start, f"RunPod request timed out after {timeout}s.")
        except Exception as exc:
            return self._error_response(model_id, start, f"RunPod connection error: {exc}")

        choices = data.get("choices") or []
        content = ((choices[0].get("message") or {}).get("content", "")) if choices else data.get("output", "")
        usage_raw = data.get("usage") or {}
        return GatewayResponse(
            provider=self._provider_name,
            model=data.get("model", model_id),
            success=True,
            latency=time.time() - start,
            streaming=False,
            content=str(content),
            usage=ModelUsage(
                prompt_tokens=int(usage_raw.get("prompt_tokens", 0)),
                completion_tokens=int(usage_raw.get("completion_tokens", 0)),
                total_tokens=int(usage_raw.get("total_tokens", 0)),
            ),
        )

    def stream(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        options = options or {}
        task_id = options.get("task_id", "")
        endpoint = gateway_config.RUNPOD_ENDPOINT.strip().rstrip("/")
        if not endpoint:
            yield {"error": "RunPod endpoint is not configured.", "done": True}
            return

        url = endpoint if endpoint.endswith("/chat/completions") else f"{endpoint}/v1/chat/completions"
        payload = {
            "model": model_id,
            "messages": self._build_messages(prompt, options),
            "temperature": options.get("temperature", 0.1),
            "stream": True,
        }
        try:
            with requests.post(url, headers=self._headers(), json=payload, stream=True, timeout=gateway_config.REQUEST_TIMEOUT) as resp:
                if not resp.ok:
                    yield {"error": f"RunPod HTTP {resp.status_code}", "done": True}
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
            yield {"error": f"RunPod streaming error: {exc}", "done": True}

    def cancel(self, task_id: str) -> bool:
        if task_id:
            with self._lock:
                self._cancelled_tasks.add(task_id)
        return True

    def health(self) -> Dict[str, Any]:
        endpoint = gateway_config.RUNPOD_ENDPOINT.strip()
        if not endpoint:
            return {"provider": self._provider_name, "status": "unconfigured", "connected": False, "error": "RUNPOD_ENDPOINT is not set"}
        return {"provider": self._provider_name, "status": "online", "connected": True}

    def list_models(self) -> List[str]:
        return ["qwen2.5-coder-7b-instruct", "deepseek-coder-v2-16b"]
