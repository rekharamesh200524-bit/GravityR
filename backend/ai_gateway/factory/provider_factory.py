from typing import Dict
from ..interfaces.provider import IInferenceProvider
from ..providers.colab import GoogleColabProvider
from ..providers.ollama import OllamaProvider
from ..providers.runpod import RunPodProvider
from ..providers.openai import OpenAIProvider
from ..providers.claude import ClaudeProvider

class ProviderFactory:
    def __init__(self):
        self._instances: Dict[str, IInferenceProvider] = {}

    def get_provider(self, name: str) -> IInferenceProvider:
        """Resolve and return a singleton instance of the requested provider."""
        if name in self._instances:
            return self._instances[name]

        provider: IInferenceProvider
        if name == "google_colab":
            provider = GoogleColabProvider()
        elif name == "ollama":
            provider = OllamaProvider()
        elif name == "runpod":
            provider = RunPodProvider()
        elif name == "openai":
            provider = OpenAIProvider()
        elif name == "claude":
            provider = ClaudeProvider()
        else:
            raise ValueError(f"Unknown provider type: {name}")

        # Initialize the provider singleton
        provider.initialize()
        provider.connect()
        self._instances[name] = provider
        return provider

    def register_provider_instance(self, name: str, instance: IInferenceProvider):
        """Allows dependency injection of mock/stub provider instances."""
        self._instances[name] = instance

provider_factory = ProviderFactory()
