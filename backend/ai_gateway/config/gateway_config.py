import os

class GatewayConfig:
    ACTIVE_PROVIDER: str = os.getenv("ACTIVE_PROVIDER", "google_colab")
    ACTIVE_MODEL: str = os.getenv("ACTIVE_MODEL", "qwen2.5-coder-7b-instruct")
    REQUEST_TIMEOUT: int = int(os.getenv("REQUEST_TIMEOUT", "120"))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "3"))
    STREAM_ENABLED: bool = os.getenv("STREAM_ENABLED", "true").lower() in ("true", "1", "yes")

    # Additional endpoints/keys for mocks/future integration
    COLAB_ENDPOINT: str = os.getenv("GOOGLE_COLAB_ENDPOINT", "")
    OLLAMA_ENDPOINT: str = os.getenv("OLLAMA_ENDPOINT", "http://localhost:11434")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    CLAUDE_API_KEY: str = os.getenv("CLAUDE_API_KEY", "")
    RUNPOD_ENDPOINT: str = os.getenv("RUNPOD_ENDPOINT", "")

gateway_config = GatewayConfig()
