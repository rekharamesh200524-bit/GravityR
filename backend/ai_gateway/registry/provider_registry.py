from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from ..config.gateway_config import gateway_config

class ProviderMetadata(BaseModel):
    name: str
    displayName: str
    status: str  # e.g., "installed", "enabled", "disabled"
    isDefault: bool = False
    metadata: Dict[str, Any] = {}

class ProviderRegistry:
    def __init__(self):
        self._providers: Dict[str, ProviderMetadata] = {}
        self._current_provider_name: str = gateway_config.resolve_default_provider()
        self._register_default_providers()

    def register(self, metadata: ProviderMetadata):
        self._providers[metadata.name] = metadata

    def get_provider_metadata(self, name: str) -> Optional[ProviderMetadata]:
        return self._providers.get(name)

    def list_providers(self) -> List[ProviderMetadata]:
        return list(self._providers.values())

    def enable_provider(self, name: str):
        if name in self._providers:
            self._providers[name].status = "enabled"

    def disable_provider(self, name: str):
        if name in self._providers:
            self._providers[name].status = "disabled"

    def set_current_provider(self, name: str):
        if name in self._providers:
            self._current_provider_name = name

    def get_current_provider_name(self) -> str:
        return self._current_provider_name

    def _register_default_providers(self):
        default_name = self._current_provider_name
        defaults = [
            ProviderMetadata(
                name="google_gemini",
                displayName="Google Gemini API",
                status="enabled",
                isDefault=(default_name == "google_gemini"),
                metadata={"type": "commercial_api", "connection_check": "/v1beta/models"}
            ),
            ProviderMetadata(
                name="google_colab",
                displayName="Google Colab Notebook",
                status="enabled",
                isDefault=(default_name == "google_colab"),
                metadata={"type": "cloud_colab", "connection_check": "/health"}
            ),
            ProviderMetadata(
                name="ollama",
                displayName="Ollama Local",
                status="enabled",
                metadata={"type": "local", "connection_check": "/api/tags"}
            ),
            ProviderMetadata(
                name="runpod",
                displayName="RunPod Serverless",
                status="enabled",
                metadata={"type": "serverless"}
            ),
            ProviderMetadata(
                name="openai",
                displayName="OpenAI API Gateway",
                status="enabled",
                metadata={"type": "commercial_api"}
            ),
            ProviderMetadata(
                name="claude",
                displayName="Anthropic Claude API",
                status="enabled",
                metadata={"type": "commercial_api"}
            )
        ]
        for item in defaults:
            self.register(item)

provider_registry = ProviderRegistry()
