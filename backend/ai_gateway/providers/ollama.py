import json
import time
import threading
import requests
from typing import Dict, Any, Generator, List, Optional
from ..interfaces.provider import IInferenceProvider, GatewayResponse, ModelUsage
from ..logging.gateway_logger import gateway_logger
from ..config.gateway_config import gateway_config


class OllamaProvider(IInferenceProvider):
    """Real Ollama local inference provider using /api/chat and /api/tags."""

    def __init__(self) -> None:
        self._provider_name = "ollama"
        self._connected = False
        self._cancelled_tasks: set = set()
        self._lock = threading.Lock()

    def initialize(self) -> bool:
        gateway_logger.info("Initializing OllamaProvider", self._provider_name)
        return True

    def connect(self) -> bool:
        h = self.health()
        self._connected = h.get("connected", False)
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
            metadata={"error": error_msg},
        )

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
        endpoint = gateway_config.OLLAMA_ENDPOINT.rstrip("/")
        model = model_id or "qwen2.5-coder:7b"
        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))

        payload = {
            "model": model,
            "messages": self._build_messages(prompt, options),
            "stream": False,
            "options": {"temperature": options.get("temperature", 0.1)},
        }

        try:
            resp = requests.post(f"{endpoint}/api/chat", json=payload, timeout=timeout)
            if not resp.ok:
                return self._error_response(model, start, f"Ollama HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
        except requests.exceptions.ConnectionError:
            return self._error_response(model, start, f"Ollama server is not reachable at {endpoint}. Start Ollama and pull a model.")
        except requests.exceptions.Timeout:
            return self._error_response(model, start, f"Ollama request timed out after {timeout}s.")
        except Exception as exc:
            return self._error_response(model, start, f"Ollama error: {exc}")

        content = (data.get("message") or {}).get("content", "")
        in_tok = int(data.get("prompt_eval_count", 0))
        out_tok = int(data.get("eval_count", 0))
        return GatewayResponse(
            provider=self._provider_name,
            model=data.get("model", model),
            success=True,
            latency=time.time() - start,
            streaming=False,
            content=content,
            usage=ModelUsage(prompt_tokens=in_tok, completion_tokens=out_tok, total_tokens=in_tok + out_tok),
        )

    def stream(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        options = options or {}
        task_id = options.get("task_id", "")
        endpoint = gateway_config.OLLAMA_ENDPOINT.rstrip("/")
        model = model_id or "qwen2.5-coder:7b"
        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))

        payload = {
            "model": model,
            "messages": self._build_messages(prompt, options),
            "stream": True,
            "options": {"temperature": options.get("temperature", 0.1)},
        }

        try:
            with requests.post(f"{endpoint}/api/chat", json=payload, stream=True, timeout=timeout) as resp:
                if not resp.ok:
                    yield {"error": f"Ollama HTTP {resp.status_code}: {resp.text[:300]}", "done": True}
                    return
                for raw_line in resp.iter_lines(decode_unicode=True):
                    if task_id and task_id in self._cancelled_tasks:
                        with self._lock:
                            self._cancelled_tasks.discard(task_id)
                        yield {"cancelled": True, "done": True}
                        return
                    if not raw_line:
                        continue
                    try:
                        chunk = json.loads(raw_line)
                    except json.JSONDecodeError:
                        continue
                    text = (chunk.get("message") or {}).get("content", "")
                    done = bool(chunk.get("done", False))
                    if text or done:
                        yield {"content": text, "done": done}
                    if done:
                        return
        except requests.exceptions.ConnectionError:
            yield {"error": f"Ollama server is not reachable at {endpoint}.", "done": True}
        except Exception as exc:
            yield {"error": f"Ollama streaming error: {exc}", "done": True}

    def cancel(self, task_id: str) -> bool:
        if task_id:
            with self._lock:
                self._cancelled_tasks.add(task_id)
        return True

    def health(self) -> Dict[str, Any]:
        endpoint = gateway_config.OLLAMA_ENDPOINT.rstrip("/")
        start = time.time()
        try:
            resp = requests.get(f"{endpoint}/api/tags", timeout=3)
            latency_ms = round((time.time() - start) * 1000, 1)
            if resp.ok:
                models = [m.get("name") for m in resp.json().get("models", []) if m.get("name")]
                return {
                    "provider": self._provider_name,
                    "status": "online",
                    "connected": True,
                    "latency_ms": latency_ms,
                    "models": models,
                }
            return {"provider": self._provider_name, "status": "offline", "connected": False, "error": f"HTTP {resp.status_code}"}
        except Exception:
            return {"provider": self._provider_name, "status": "offline", "connected": False, "error": f"Unreachable at {endpoint}"}

    def list_models(self) -> List[str]:
        h = self.health()
        if h.get("models"):
            return h["models"]
        return ["qwen2.5-coder:7b", "deepseek-coder-v2:16b", "codellama:7b"]
