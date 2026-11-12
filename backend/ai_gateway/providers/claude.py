import json
import time
import threading
import requests
from typing import Dict, Any, Generator, List, Optional
from ..interfaces.provider import IInferenceProvider, GatewayResponse, ModelUsage
from ..logging.gateway_logger import gateway_logger
from ..config.gateway_config import gateway_config


class ClaudeProvider(IInferenceProvider):
    """Real Anthropic Claude Messages API provider."""

    ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
    ANTHROPIC_VERSION = "2023-06-01"

    def __init__(self) -> None:
        self._provider_name = "claude"
        self._connected = False
        self._cancelled_tasks: set = set()
        self._lock = threading.Lock()

    def initialize(self) -> bool:
        gateway_logger.info("Initializing ClaudeProvider", self._provider_name)
        return True

    def connect(self) -> bool:
        self._connected = bool(gateway_config.CLAUDE_API_KEY.strip())
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
            metadata={"error": error_msg, "configured": bool(gateway_config.CLAUDE_API_KEY.strip())},
        )

    def _resolve_model(self, model_id: str) -> str:
        if model_id and "claude" in model_id.lower():
            return model_id
        return "claude-3-5-sonnet-latest"

    def _build_payload(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]], stream: bool) -> Dict[str, Any]:
        options = options or {}
        system_prompt = options.get("system_prompt", "")
        raw_messages = options.get("messages")
        messages: List[Dict[str, str]] = []

        if isinstance(raw_messages, list):
            for m in raw_messages:
                if m.get("role") == "system":
                    system_prompt = (system_prompt + "\n" + m.get("content", "")).strip()
                elif m.get("role") in ("user", "assistant"):
                    messages.append({"role": m["role"], "content": str(m.get("content", ""))})
        else:
            messages.append({"role": "user", "content": prompt})

        payload: Dict[str, Any] = {
            "model": self._resolve_model(model_id),
            "max_tokens": int(options.get("max_tokens", 4096)),
            "temperature": options.get("temperature", 0.1),
            "messages": messages,
            "stream": stream,
        }
        if system_prompt:
            payload["system"] = system_prompt
        return payload

    def generate(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> GatewayResponse:
        start = time.time()
        options = options or {}
        api_key = gateway_config.CLAUDE_API_KEY.strip()
        if not api_key:
            return self._error_response(
                model_id,
                start,
                "Anthropic Claude API key is not configured. Set CLAUDE_API_KEY or configure it in Provider Settings.",
            )

        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))
        payload = self._build_payload(prompt, model_id, options, stream=False)

        try:
            resp = requests.post(
                self.ANTHROPIC_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": self.ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json=payload,
                timeout=timeout,
            )
            if not resp.ok:
                return self._error_response(
                    payload["model"],
                    start,
                    f"Claude API error (HTTP {resp.status_code}): {resp.text[:400]}",
                )
            data = resp.json()
        except requests.exceptions.Timeout:
            return self._error_response(payload["model"], start, f"Claude request timed out after {timeout}s.")
        except requests.exceptions.RequestException as exc:
            return self._error_response(payload["model"], start, f"Claude connection error: {exc}")

        blocks = data.get("content") or []
        text_parts = [b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"]
        content = "".join(text_parts)

        usage_raw = data.get("usage") or {}
        in_tok = int(usage_raw.get("input_tokens", 0))
        out_tok = int(usage_raw.get("output_tokens", 0))
        return GatewayResponse(
            provider=self._provider_name,
            model=data.get("model", payload["model"]),
            success=True,
            latency=time.time() - start,
            streaming=False,
            content=content,
            usage=ModelUsage(prompt_tokens=in_tok, completion_tokens=out_tok, total_tokens=in_tok + out_tok),
        )

    def stream(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        options = options or {}
        task_id = options.get("task_id", "")
        api_key = gateway_config.CLAUDE_API_KEY.strip()
        if not api_key:
            yield {
                "error": "Anthropic Claude API key is not configured. Set CLAUDE_API_KEY or configure it in Provider Settings.",
                "content": "",
                "done": True,
            }
            return

        timeout = int(options.get("timeout", gateway_config.REQUEST_TIMEOUT))
        payload = self._build_payload(prompt, model_id, options, stream=True)

        try:
            with requests.post(
                self.ANTHROPIC_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": self.ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json=payload,
                stream=True,
                timeout=timeout,
            ) as resp:
                if not resp.ok:
                    yield {"error": f"Claude API error (HTTP {resp.status_code}): {resp.text[:300]}", "done": True}
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
                    try:
                        evt = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    evt_type = evt.get("type")
                    if evt_type == "content_block_delta":
                        delta_text = (evt.get("delta") or {}).get("text")
                        if delta_text:
                            yield {"content": delta_text, "done": False}
                    elif evt_type == "message_stop":
                        yield {"content": "", "done": True}
                        return
        except Exception as exc:
            yield {"error": f"Claude streaming error: {exc}", "done": True}

    def cancel(self, task_id: str) -> bool:
        if task_id:
            with self._lock:
                self._cancelled_tasks.add(task_id)
        return True

    def health(self) -> Dict[str, Any]:
        api_key = gateway_config.CLAUDE_API_KEY.strip()
        if not api_key:
            return {
                "provider": self._provider_name,
                "status": "unconfigured",
                "connected": False,
                "error": "CLAUDE_API_KEY is not set",
            }
        return {"provider": self._provider_name, "status": "online", "connected": True}

    def list_models(self) -> List[str]:
        return ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"]
