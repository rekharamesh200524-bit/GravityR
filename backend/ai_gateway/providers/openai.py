import time
import json
from typing import Dict, Any, Generator, List, Optional
from ..interfaces.provider import IInferenceProvider, GatewayResponse, ModelUsage
from ..logging.gateway_logger import gateway_logger

class OpenAIProvider(IInferenceProvider):
    def __init__(self):
        self._connected = False
        self._provider_name = "openai"

    def initialize(self) -> bool:
        gateway_logger.info("Initializing OpenAIProvider", "OpenAIProvider")
        return True

    def connect(self) -> bool:
        self._connected = True
        return True

    def disconnect(self) -> bool:
        self._connected = False
        return True

    def _get_mock_json_content(self, prompt: str) -> str:
        mock_data = {
            "summary": f"OpenAI mock: {prompt[:40]}",
            "files": [
                {
                    "path": "features/openai/Mock.ts",
                    "reason": "Create OpenAI test component",
                    "language": "typescript",
                    "changes": "export const OPENAI_MOCK = true;\n"
                }
            ],
            "warnings": [],
            "review": "Mock review: Simple validation.",
            "confidence": 0.99
        }
        return json.dumps(mock_data)

    def generate(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> GatewayResponse:
        start_time = time.time()
        time.sleep(0.4)
        content = self._get_mock_json_content(prompt)
        latency = time.time() - start_time
        return GatewayResponse(
            provider=self._provider_name,
            model=model_id,
            success=True,
            latency=latency,
            streaming=False,
            content=content,
            usage=ModelUsage(prompt_tokens=100, completion_tokens=100, total_tokens=200)
        )

    def stream(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        content = self._get_mock_json_content(prompt)
        words = content.split(" ")
        for i, word in enumerate(words):
            time.sleep(0.01)
            chunk_content = word + (" " if i < len(words) - 1 else "")
            yield {
                "content": chunk_content,
                "usage": {"prompt_tokens": 100, "completion_tokens": i * 4, "total_tokens": 100 + i * 4}
            }

    def cancel(self, task_id: str) -> bool:
        return True

    def health(self) -> Dict[str, Any]:
        return {
            "provider": self._provider_name,
            "status": "online" if self._connected else "offline",
            "connected": self._connected,
            "latency_ms": 15.0
        }

    def list_models(self) -> List[str]:
        return ["llama-3.1-8b-instruct", "gpt-4o-mini"]
