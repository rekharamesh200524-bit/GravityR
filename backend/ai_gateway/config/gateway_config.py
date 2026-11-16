import os
from pathlib import Path
from typing import Dict, Any, Optional
from dotenv import load_dotenv

# Ensure .env from workspace root is loaded into os.environ
_root_env = Path(__file__).resolve().parent.parent.parent.parent / ".env"
_backend_env = Path(__file__).resolve().parent.parent.parent / ".env"
if _root_env.exists():
    load_dotenv(dotenv_path=_root_env, override=False)
if _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env, override=False)


class GatewayConfig:
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    GROQ_BASE_URL: str = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

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

    _suppress_env_reload: bool = False

    def reload_from_env(self) -> None:
        """Dynamically reload environment variables from .env on disk."""
        if self._suppress_env_reload:
            return
        if _root_env.exists():
            load_dotenv(dotenv_path=_root_env, override=True)
        if _backend_env.exists():
            load_dotenv(dotenv_path=_backend_env, override=True)

        groq = os.getenv("GROQ_API_KEY", "").strip()
        if groq:
            self.GROQ_API_KEY = groq
        groq_model = os.getenv("GROQ_MODEL", "").strip()
        if groq_model:
            self.GROQ_MODEL = groq_model

        gemini = (os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")).strip()
        if gemini:
            self.GEMINI_API_KEY = gemini
        gemini_model = os.getenv("GEMINI_MODEL", "").strip()
        if gemini_model:
            self.GEMINI_MODEL = gemini_model

        openai = os.getenv("OPENAI_API_KEY", "").strip()
        if openai:
            self.OPENAI_API_KEY = openai
        claude = (os.getenv("CLAUDE_API_KEY", "") or os.getenv("ANTHROPIC_API_KEY", "")).strip()
        if claude:
            self.CLAUDE_API_KEY = claude
        ollama = os.getenv("OLLAMA_ENDPOINT", "").strip()
        if ollama:
            self.OLLAMA_ENDPOINT = ollama
        colab = os.getenv("GOOGLE_COLAB_ENDPOINT", "").strip()
        if colab:
            self.COLAB_ENDPOINT = colab
        runpod = os.getenv("RUNPOD_ENDPOINT", "").strip()
        if runpod:
            self.RUNPOD_ENDPOINT = runpod
        runpod_key = os.getenv("RUNPOD_API_KEY", "").strip()
        if runpod_key:
            self.RUNPOD_API_KEY = runpod_key

    def resolve_default_provider(self) -> str:
        explicit = os.getenv("ACTIVE_PROVIDER", "").strip()
        if explicit:
            return explicit
        if self.GROQ_API_KEY.strip():
            return "groq"
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
        self.reload_from_env()
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
                "groq": {
                    "configured": bool(self.GROQ_API_KEY.strip()),
                    "api_key_masked": self._mask(self.GROQ_API_KEY),
                    "default_model": self.GROQ_MODEL,
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

    def _persist_to_env(self, key: str, val: str) -> None:
        target = _root_env if _root_env.exists() else _backend_env
        if not target.exists():
            return
        try:
            content = target.read_text(encoding="utf-8")
            import re
            pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
            if pattern.search(content):
                content = pattern.sub(f"{key}={val}", content)
            else:
                content = content + f"\n{key}={val}\n"
            target.write_text(content, encoding="utf-8")
        except Exception:
            pass

    def update_config(self, updates: Dict[str, Optional[str]]) -> Dict[str, Any]:
        if updates.get("groq_api_key") is not None:
            self.GROQ_API_KEY = updates["groq_api_key"].strip()
            self._persist_to_env("GROQ_API_KEY", self.GROQ_API_KEY)
        if updates.get("groq_model") is not None and updates["groq_model"].strip():
            self.GROQ_MODEL = updates["groq_model"].strip()
            self._persist_to_env("GROQ_MODEL", self.GROQ_MODEL)
        if updates.get("gemini_api_key") is not None:
            self.GEMINI_API_KEY = updates["gemini_api_key"].strip()
            self._persist_to_env("GEMINI_API_KEY", self.GEMINI_API_KEY)
        if updates.get("gemini_model") is not None and updates["gemini_model"].strip():
            self.GEMINI_MODEL = updates["gemini_model"].strip()
            self._persist_to_env("GEMINI_MODEL", self.GEMINI_MODEL)
        if updates.get("openai_api_key") is not None:
            self.OPENAI_API_KEY = updates["openai_api_key"].strip()
            self._persist_to_env("OPENAI_API_KEY", self.OPENAI_API_KEY)
        if updates.get("openai_base_url") is not None and updates["openai_base_url"].strip():
            self.OPENAI_BASE_URL = updates["openai_base_url"].strip().rstrip("/")
            self._persist_to_env("OPENAI_BASE_URL", self.OPENAI_BASE_URL)
        if updates.get("claude_api_key") is not None:
            self.CLAUDE_API_KEY = updates["claude_api_key"].strip()
            self._persist_to_env("CLAUDE_API_KEY", self.CLAUDE_API_KEY)
        if updates.get("ollama_endpoint") is not None and updates["ollama_endpoint"].strip():
            self.OLLAMA_ENDPOINT = updates["ollama_endpoint"].strip().rstrip("/")
            self._persist_to_env("OLLAMA_ENDPOINT", self.OLLAMA_ENDPOINT)
        if updates.get("runpod_endpoint") is not None:
            self.RUNPOD_ENDPOINT = updates["runpod_endpoint"].strip().rstrip("/")
            self._persist_to_env("RUNPOD_ENDPOINT", self.RUNPOD_ENDPOINT)
        if updates.get("runpod_api_key") is not None:
            self.RUNPOD_API_KEY = updates["runpod_api_key"].strip()
            self._persist_to_env("RUNPOD_API_KEY", self.RUNPOD_API_KEY)
        if updates.get("colab_endpoint") is not None:
            self.COLAB_ENDPOINT = updates["colab_endpoint"].strip().rstrip("/")
            self._persist_to_env("GOOGLE_COLAB_ENDPOINT", self.COLAB_ENDPOINT)
        return self.get_masked_config()


gateway_config = GatewayConfig()
gateway_config.ACTIVE_PROVIDER = gateway_config.resolve_default_provider()
