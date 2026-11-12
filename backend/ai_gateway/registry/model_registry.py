from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class ModelMetadata(BaseModel):
    id: str
    displayName: str
    providerSupport: List[str]
    parameterSize: str  # e.g., "7B", "1.5B", "70B"
    contextWindow: int  # e.g., 32768
    supportsStreaming: bool
    codingOptimized: bool
    status: str  # e.g., "active", "deprecated", "experimental"

class ModelRegistry:
    def __init__(self):
        self._models: Dict[str, ModelMetadata] = {}
        self._register_default_models()

    def register(self, model: ModelMetadata):
        self._models[model.id] = model

    def get_model(self, model_id: str) -> Optional[ModelMetadata]:
        return self._models.get(model_id)

    def list_models(self) -> List[ModelMetadata]:
        return list(self._models.values())

    def list_models_for_provider(self, provider_name: str) -> List[ModelMetadata]:
        return [m for m in self._models.values() if provider_name in m.providerSupport]

    def _register_default_models(self):
        default_models = [
            ModelMetadata(
                id="gemini-2.5-flash",
                displayName="Gemini 2.5 Flash",
                providerSupport=["google_gemini"],
                parameterSize="Flash",
                contextWindow=1048576,
                supportsStreaming=True,
                codingOptimized=True,
                status="active"
            ),
            ModelMetadata(
                id="gemini-2.5-pro",
                displayName="Gemini 2.5 Pro",
                providerSupport=["google_gemini"],
                parameterSize="Pro",
                contextWindow=2097152,
                supportsStreaming=True,
                codingOptimized=True,
                status="active"
            ),
            ModelMetadata(
                id="gemini-2.0-flash",
                displayName="Gemini 2.0 Flash",
                providerSupport=["google_gemini"],
                parameterSize="Flash",
                contextWindow=1048576,
                supportsStreaming=True,
                codingOptimized=True,
                status="active"
            ),
            ModelMetadata(
                id="qwen2.5-coder-7b-instruct",
                displayName="Qwen 2.5 Coder 7B Instruct",
                providerSupport=["google_colab", "ollama", "runpod"],
                parameterSize="7B",
                contextWindow=32768,
                supportsStreaming=True,
                codingOptimized=True,
                status="active"
            ),
            ModelMetadata(
                id="deepseek-coder-6.7b-instruct",
                displayName="DeepSeek Coder 6.7B",
                providerSupport=["google_colab", "ollama", "runpod"],
                parameterSize="6.7B",
                contextWindow=16384,
                supportsStreaming=True,
                codingOptimized=True,
                status="active"
            ),
            ModelMetadata(
                id="codegemma-7b-it",
                displayName="CodeGemma 7B",
                providerSupport=["google_colab", "ollama", "runpod"],
                parameterSize="7B",
                contextWindow=8192,
                supportsStreaming=True,
                codingOptimized=True,
                status="active"
            ),
            ModelMetadata(
                id="starcoder2-7b",
                displayName="StarCoder 2 7B",
                providerSupport=["ollama", "runpod"],
                parameterSize="7B",
                contextWindow=16384,
                supportsStreaming=False,
                codingOptimized=True,
                status="active"
            ),
            ModelMetadata(
                id="llama-3.1-8b-instruct",
                displayName="Llama 3.1 8B Instruct",
                providerSupport=["openai", "claude", "ollama", "runpod"],
                parameterSize="8B",
                contextWindow=131072,
                supportsStreaming=True,
                codingOptimized=False,
                status="active"
            ),
            ModelMetadata(
                id="gpt-4o-mini",
                displayName="GPT-4o Mini",
                providerSupport=["openai"],
                parameterSize="unknown",
                contextWindow=128000,
                supportsStreaming=True,
                codingOptimized=True,
                status="active"
            ),
            ModelMetadata(
                id="claude-3-5-sonnet",
                displayName="Claude 3.5 Sonnet",
                providerSupport=["claude"],
                parameterSize="unknown",
                contextWindow=200000,
                supportsStreaming=True,
                codingOptimized=True,
                status="active"
            )
        ]
        for model in default_models:
            self.register(model)

model_registry = ModelRegistry()
