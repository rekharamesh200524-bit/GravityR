"""
GoogleColabProvider – Real Implementation
Replaces the mock provider and communicates with an actual Colab notebook
served via ngrok/cloudflared tunnel.

Environment variables:
    GOOGLE_COLAB_ENDPOINT   – Full base URL of the Colab notebook server
                              e.g. https://abc123.ngrok-free.app
    GOOGLE_COLAB_TIMEOUT    – HTTP timeout in seconds (default: 120)
    MAX_RETRIES             – Connection retry attempts (default: 3)
"""
import time
import json
import os
import requests
from typing import Dict, Any, Generator, List, Optional

from ..interfaces.provider import IInferenceProvider, GatewayResponse, ModelUsage
from ..logging.gateway_logger import gateway_logger
from ..config.gateway_config import gateway_config
from ..connection.colab_connection import ColabConnectionManager, ConnectionState


_COLAB_TIMEOUT = int(os.getenv("GOOGLE_COLAB_TIMEOUT", str(gateway_config.REQUEST_TIMEOUT)))


class GoogleColabProvider(IInferenceProvider):
    """
    Production Google Colab provider.
    Delegates inference to a FastAPI server running inside a Colab notebook.
    Falls back to an informative error response when the endpoint is not configured.
    """

    def __init__(self) -> None:
        self._provider_name = "google_colab"
        self._endpoint: str = gateway_config.COLAB_ENDPOINT.rstrip("/")
        self._connection = ColabConnectionManager(
            endpoint=self._endpoint,
            timeout=_COLAB_TIMEOUT,
            max_retries=gateway_config.MAX_RETRIES,
            health_interval=30,
        )

    # ─── Lifecycle ───────────────────────────────────────────────

    def initialize(self) -> bool:
        gateway_logger.info("Initializing GoogleColabProvider", self._provider_name)
        return True

    def _sync_endpoint(self) -> None:
        latest = gateway_config.COLAB_ENDPOINT.rstrip("/")
        if latest != self._endpoint:
            self._endpoint = latest
            self._connection = ColabConnectionManager(
                endpoint=self._endpoint,
                timeout=_COLAB_TIMEOUT,
                max_retries=gateway_config.MAX_RETRIES,
                health_interval=30,
            )

    def connect(self) -> bool:
        self._sync_endpoint()
        return self._connection.connect()

    def disconnect(self) -> bool:
        return self._connection.disconnect()

    # ─── Core inference ──────────────────────────────────────────

    def generate(
        self,
        prompt: str,
        model_id: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> GatewayResponse:
        start = time.time()
        options = options or {}
        self._sync_endpoint()

        gateway_logger.info(
            f"generate() → model={model_id}, prompt_len={len(prompt)}",
            self._provider_name,
        )

        # Ensure connected
        if not self._connection.is_connected():
            ok = self.connect()
            if not ok:
                return self._offline_response(prompt, model_id, start)

        payload = {
            "prompt": prompt,
            "model": model_id,
            "max_new_tokens": options.get("max_new_tokens", 1024),
            "temperature": options.get("temperature", 0.1),
            "top_p": options.get("top_p", 0.95),
            "stream": False,
        }

        try:
            resp = requests.post(
                f"{self._endpoint}/generate",
                json=payload,
                timeout=_COLAB_TIMEOUT,
            )
            resp.raise_for_status()
            data: Dict[str, Any] = resp.json()
        except requests.exceptions.ConnectionError as exc:
            gateway_logger.error("Connection error during generate()", self._provider_name, error=exc)
            self._connection.disconnect()
            return self._error_response(prompt, model_id, start, f"Connection error: {exc}")
        except requests.exceptions.Timeout:
            gateway_logger.error("Timeout during generate()", self._provider_name)
            return self._error_response(prompt, model_id, start, "Request timed out.")
        except requests.exceptions.HTTPError as exc:
            gateway_logger.error(f"HTTP {resp.status_code} during generate()", self._provider_name, error=exc)
            return self._error_response(prompt, model_id, start, f"HTTP {resp.status_code}")
        except Exception as exc:
            gateway_logger.error("Unexpected error during generate()", self._provider_name, error=exc)
            return self._error_response(prompt, model_id, start, str(exc))

        latency = time.time() - start
        raw_content = data.get("content", "")

        # Validate structured JSON
        content, valid = self._validate_json_response(raw_content)

        usage = ModelUsage(
            prompt_tokens=data.get("prompt_tokens", len(prompt) // 4),
            completion_tokens=data.get("completion_tokens", len(raw_content) // 4),
            total_tokens=data.get("total_tokens", (len(prompt) + len(raw_content)) // 4),
        )

        gpu_info = data.get("gpu", {})
        metadata: Dict[str, Any] = {
            "colab_status": "active",
            "valid_json": valid,
            "gpu_name":         gpu_info.get("name", "Unknown"),
            "vram_allocated":   gpu_info.get("allocated", "?"),
            "vram_total":       gpu_info.get("total", "?"),
            "tokens_per_second": data.get("tokens_per_second", 0.0),
            "time_to_first_token": data.get("time_to_first_token", 0.0),
        }

        gateway_logger.info(
            "generate() completed",
            self._provider_name,
            {"latency": latency, "tokens": usage.total_tokens, "valid_json": valid},
        )

        return GatewayResponse(
            provider=self._provider_name,
            model=model_id,
            success=True,
            latency=latency,
            streaming=False,
            content=content,
            usage=usage,
            metadata=metadata,
        )

    def stream(
        self,
        prompt: str,
        model_id: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        options = options or {}

        gateway_logger.info(
            f"stream() → model={model_id}, prompt_len={len(prompt)}",
            self._provider_name,
        )

        if not self._connection.is_connected():
            ok = self.connect()
            if not ok:
                yield {
                    "content": json.dumps(self._offline_dict(prompt, model_id)),
                    "done": True,
                    "error": "Colab endpoint not configured or unreachable.",
                }
                return

        payload = {
            "prompt": prompt,
            "model": model_id,
            "max_new_tokens": options.get("max_new_tokens", 1024),
            "temperature": options.get("temperature", 0.1),
            "top_p": options.get("top_p", 0.95),
            "stream": True,
        }

        t_start = time.time()
        t_first_token: Optional[float] = None
        accumulated = ""

        try:
            with requests.post(
                f"{self._endpoint}/stream",
                json=payload,
                stream=True,
                timeout=_COLAB_TIMEOUT,
            ) as resp:
                resp.raise_for_status()

                for raw_line in resp.iter_lines():
                    if not raw_line:
                        continue

                    line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line

                    # SSE format: "data: {...}"
                    if line.startswith("data:"):
                        line = line[5:].strip()

                    if line == "[DONE]" or line == "":
                        continue

                    try:
                        chunk: Dict[str, Any] = json.loads(line)
                    except json.JSONDecodeError:
                        # Forward raw token chunks that aren't JSON
                        accumulated += line
                        if t_first_token is None:
                            t_first_token = time.time() - t_start
                        yield {
                            "content": line,
                            "done": False,
                            "time_to_first_token": t_first_token,
                        }
                        continue

                    token = chunk.get("token", chunk.get("content", ""))
                    done  = chunk.get("done", False)
                    accumulated += token

                    if t_first_token is None and token:
                        t_first_token = time.time() - t_start

                    elapsed = time.time() - t_start
                    total_tokens = max(len(accumulated.split()), 1)
                    tps = round(total_tokens / elapsed, 2) if elapsed > 0 else 0.0

                    yield {
                        "content":  token,
                        "done":     done,
                        "usage": {
                            "prompt_tokens":     len(prompt) // 4,
                            "completion_tokens": total_tokens,
                            "total_tokens":      (len(prompt) // 4) + total_tokens,
                        },
                        "metrics": {
                            "time_to_first_token": t_first_token or 0.0,
                            "total_time":          elapsed,
                            "tokens_per_second":   tps,
                        },
                        "gpu": chunk.get("gpu", {}),
                    }

                    if done:
                        break

        except requests.exceptions.ConnectionError as exc:
            gateway_logger.error("Stream connection error", self._provider_name, error=exc)
            self._connection.disconnect()
            yield {"content": "", "done": True, "error": f"Connection lost: {exc}"}
        except requests.exceptions.Timeout:
            gateway_logger.error("Stream timed out", self._provider_name)
            yield {"content": "", "done": True, "error": "Stream timed out."}
        except Exception as exc:
            gateway_logger.error("Unexpected stream error", self._provider_name, error=exc)
            yield {"content": "", "done": True, "error": str(exc)}

    # ─── Control ────────────────────────────────────────────────

    def cancel(self, task_id: str) -> bool:
        gateway_logger.info(f"cancel() task={task_id}", self._provider_name)
        if not self._endpoint:
            return True
        try:
            requests.post(
                f"{self._endpoint}/cancel",
                json={"task_id": task_id},
                timeout=5,
            )
            return True
        except Exception:
            return False

    # ─── Health & Models ────────────────────────────────────────

    def health(self) -> Dict[str, Any]:
        if not self._endpoint:
            return {
                "provider": self._provider_name,
                "status": "offline",
                "connected": False,
                "reason": "GOOGLE_COLAB_ENDPOINT not configured.",
                "state": ConnectionState.DISCONNECTED.value,
            }

        raw = self._connection.get_health()
        gpu = raw.get("gpu", {})

        return {
            "provider":       self._provider_name,
            "status":         "online" if raw.get("state") == ConnectionState.CONNECTED.value else "offline",
            "connected":      raw.get("state") == ConnectionState.CONNECTED.value,
            "state":          raw.get("state", "unknown"),
            "latency_ms":     raw.get("last_ping_ms"),
            "gpu_available":  raw.get("gpu_available", False),
            "gpu_name":       gpu.get("name", raw.get("gpu_name", "Unknown")),
            "vram_allocated": gpu.get("allocated", raw.get("vram_allocated", "?")),
            "vram_total":     gpu.get("total", raw.get("vram_total", "?")),
            "current_model":  raw.get("model_loaded", raw.get("current_model", "")),
            "endpoint":       self._connection._safe_url(),
            "last_heartbeat": self._connection.last_heartbeat,
        }

    def list_models(self) -> List[str]:
        if not self._endpoint or not self._connection.is_connected():
            return ["qwen2.5-coder-7b-instruct"]
        try:
            resp = requests.get(f"{self._endpoint}/models", timeout=10)
            return resp.json().get("models", ["qwen2.5-coder-7b-instruct"])
        except Exception:
            return ["qwen2.5-coder-7b-instruct"]

    # ─── Helpers ────────────────────────────────────────────────

    def _validate_json_response(self, raw: str) -> tuple[str, bool]:
        """Try to parse the content as structured JSON. Returns (content, is_valid)."""
        try:
            parsed = json.loads(raw)
            # Ensure required keys are present
            required = {"summary", "files"}
            if required.issubset(parsed.keys()):
                return raw, True
            # Wrap partial JSON in required structure
            wrapped = {
                "summary": parsed.get("summary", raw[:120]),
                "files":   parsed.get("files", []),
                "warnings": parsed.get("warnings", ["Response was partially structured."]),
                "review":  parsed.get("review", ""),
                "confidence": parsed.get("confidence", 0.7),
                "metadata": parsed.get("metadata", {}),
            }
            return json.dumps(wrapped), False
        except (json.JSONDecodeError, TypeError):
            # Wrap raw text in minimum valid structure
            wrapped = {
                "summary": raw[:200] if raw else "No response content received.",
                "files":   [],
                "warnings": ["Response was not valid JSON. Raw text wrapped."],
                "review":  "",
                "confidence": 0.0,
                "metadata": {},
            }
            return json.dumps(wrapped), False

    def _offline_response(self, prompt: str, model_id: str, start: float) -> GatewayResponse:
        content = json.dumps(self._offline_dict(prompt, model_id))
        return GatewayResponse(
            provider=self._provider_name,
            model=model_id,
            success=False,
            latency=time.time() - start,
            streaming=False,
            content=content,
            usage=ModelUsage(),
            metadata={"error": "Colab endpoint not configured or unreachable."},
        )

    def _error_response(self, prompt: str, model_id: str, start: float, reason: str) -> GatewayResponse:
        content = json.dumps({
            "summary": f"Gateway error: {reason}",
            "files": [],
            "warnings": [reason],
            "review": "",
            "confidence": 0.0,
            "metadata": {"error": reason},
        })
        return GatewayResponse(
            provider=self._provider_name,
            model=model_id,
            success=False,
            latency=time.time() - start,
            streaming=False,
            content=content,
            usage=ModelUsage(),
            metadata={"error": reason},
        )

    def _offline_dict(self, prompt: str, model_id: str) -> Dict[str, Any]:
        return {
            "summary": "Google Colab is not connected. Set GOOGLE_COLAB_ENDPOINT.",
            "files": [],
            "warnings": [
                "GOOGLE_COLAB_ENDPOINT is not set.",
                "Open GravityX-Colab.ipynb in Google Colab, run all cells, then paste the ngrok URL into your .env.",
            ],
            "review": "Offline mode — no inference performed.",
            "confidence": 0.0,
            "metadata": {
                "provider": "google_colab",
                "model": model_id,
                "status": "offline",
            },
        }
