import os
from typing import Dict, Any, Optional


class GatewayConfig:
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    COLAB_ENDPOINT: str = os.getenv("GOOGLE_COLAB_ENDPOINT", "")
    OLLAMA_ENDPOINT: str = os.getenv("OLLAMA_ENDPOINT", "http://localhost:11434")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    CLAUDE_API_KEY: str = os.getenv("CLAUDE_API_KEY", "") or os.getenv("ANTHROPIC_API_KEY", "")
    RUNPOD_ENDPOINT: str = os.getenv("RUNPOD_ENDPOINT", "")
    RUNPOD_API_KEY: str = os.getenv("RUNPOD_API_KEY", "")

    ACTIVE_PROVIDER: str = os.getenv("ACTIVE_PROVIDER", "google_gemini")
    ACTIVE_MODEL: str = os.getenv("ACTIVE_MODEL", GEMINI_MODEL)
    REQUEST_TIMEOUT: int = int(os.getenv("REQUEST_TIMEOUT", "120"))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "3"))
    STREAM_ENABLED: bool = os.getenv("STREAM_ENABLED", "true").lower() in ("true", "1", "yes")

    def resolve_default_provider(self) -> str:
        explicit = os.getenv("ACTIVE_PROVIDER", "").strip()
        if explicit:
            return explicit
        if self.GEMINI_API_KEY.strip():
            return "google_gemini"
        if self.OPENAI_API_KEY.strip():
            return "openai"
        if self.CLAUDE_API_KEY.strip():
            return "claude"
        if self.COLAB_ENDPOINT.strip():
            return "google_colab"
        return "google_gemini"

    @staticmethod
    def _mask(secret: str) -> str:
        if not secret:
            return ""
        if len(secret) <= 8:
            return "*" * len(secret)
        return f"{secret[:4]}...{secret[-4:]}"

    def get_masked_config(self) -> Dict[str, Any]:
        return {
            "active_provider": self.ACTIVE_PROVIDER,
            "active_model": self.ACTIVE_MODEL,
            "request_timeout": self.REQUEST_TIMEOUT,
            "max_retries": self.MAX_RETRIES,
            "providers": {
                "google_gemini": {
                    "configured": bool(self.GEMINI_API_KEY.strip()),
                    "api_key_masked": self._mask(self.GEMINI_API_KEY),
                    "default_model": self.GEMINI_MODEL,
                },
                "openai": {
                    "configured": bool(self.OPENAI_API_KEY.strip()),
                    "api_key_masked": self._mask(self.OPENAI_API_KEY),
                    "base_url": self.OPENAI_BASE_URL,
                },
                "claude": {
                    "configured": bool(self.CLAUDE_API_KEY.strip()),
                    "api_key_masked": self._mask(self.CLAUDE_API_KEY),
                },
                "ollama": {
                    "configured": bool(self.OLLAMA_ENDPOINT.strip()),
                    "endpoint": self.OLLAMA_ENDPOINT,
                },
                "runpod": {
                    "configured": bool(self.RUNPOD_ENDPOINT.strip()),
                    "endpoint": self.RUNPOD_ENDPOINT,
                    "api_key_masked": self._mask(self.RUNPOD_API_KEY),
                },
                "google_colab": {
                    "configured": bool(self.COLAB_ENDPOINT.strip()),
                    "endpoint": self.COLAB_ENDPOINT,
                },
            },
        }

    def update_config(self, updates: Dict[str, Optional[str]]) -> Dict[str, Any]:
        if updates.get("gemini_api_key") is not None:
            self.GEMINI_API_KEY = updates["gemini_api_key"].strip()
        if updates.get("gemini_model") is not None and updates["gemini_model"].strip():
            self.GEMINI_MODEL = updates["gemini_model"].strip()
        if updates.get("openai_api_key") is not None:
            self.OPENAI_API_KEY = updates["openai_api_key"].strip()
        if updates.get("openai_base_url") is not None and updates["openai_base_url"].strip():
            self.OPENAI_BASE_URL = updates["openai_base_url"].strip().rstrip("/")
        if updates.get("claude_api_key") is not None:
            self.CLAUDE_API_KEY = updates["claude_api_key"].strip()
        if updates.get("ollama_endpoint") is not None and updates["ollama_endpoint"].strip():
            self.OLLAMA_ENDPOINT = updates["ollama_endpoint"].strip().rstrip("/")
        if updates.get("runpod_endpoint") is not None:
            self.RUNPOD_ENDPOINT = updates["runpod_endpoint"].strip().rstrip("/")
        if updates.get("runpod_api_key") is not None:
            self.RUNPOD_API_KEY = updates["runpod_api_key"].strip()
        if updates.get("colab_endpoint") is not None:
            self.COLAB_ENDPOINT = updates["colab_endpoint"].strip().rstrip("/")
        return self.get_masked_config()


gateway_config = GatewayConfig()
gateway_config.ACTIVE_PROVIDER = gateway_config.resolve_default_provider()
