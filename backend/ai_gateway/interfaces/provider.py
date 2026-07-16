from abc import ABC, abstractmethod
from typing import Dict, Any, Generator, List, Optional
from pydantic import BaseModel, Field

class ModelUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class GatewayResponse(BaseModel):
    provider: str
    model: str
    success: bool
    latency: float  # in seconds
    streaming: bool
    content: str
    usage: ModelUsage = Field(default_factory=ModelUsage)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class IInferenceProvider(ABC):
    @abstractmethod
    def initialize(self) -> bool:
        """Initialize provider connections and load default configs."""
        pass

    @abstractmethod
    def connect(self) -> bool:
        """Establish connection to the inference server."""
        pass

    @abstractmethod
    def disconnect(self) -> bool:
        """Gracefully close active connection tunnels or sockets."""
        pass

    @abstractmethod
    def generate(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> GatewayResponse:
        """Executes a full non-streaming inference request."""
        pass

    @abstractmethod
    def stream(self, prompt: str, model_id: str, options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        """Executes a streaming inference request yielding token chunks."""
        pass

    @abstractmethod
    def cancel(self, task_id: str) -> bool:
        """Cancel ongoing generation for a task."""
        pass

    @abstractmethod
    def health(self) -> Dict[str, Any]:
        """Check provider status, availability, and latency metrics."""
        pass

    @abstractmethod
    def list_models(self) -> List[str]:
        """List model IDs supported by this provider."""
        pass
