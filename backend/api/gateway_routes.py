from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ..ai_gateway.registry.provider_registry import provider_registry, ProviderMetadata
from ..ai_gateway.registry.model_registry import model_registry, ModelMetadata
from ..ai_gateway.health.health_monitor import health_monitor
from ..ai_gateway.manager import gateway_manager
from ..ai_gateway.config.gateway_config import gateway_config
from ..ai_gateway.factory.provider_factory import provider_factory
from fastapi.responses import StreamingResponse
import json

router = APIRouter(prefix="/gateway", tags=["gateway"])

class SelectProviderRequest(BaseModel):
    provider: str

class SelectModelRequest(BaseModel):
    model: str

class TestPromptRequest(BaseModel):
    prompt: str
    provider: Optional[str] = None
    model: Optional[str] = None

class ProviderCancelRequest(BaseModel):
    task_id: str

@router.get("/providers", response_model=List[ProviderMetadata])
def get_providers():
    """Retrieve all installed and configured inference providers."""
    return provider_registry.list_providers()

@router.get("/models", response_model=List[ModelMetadata])
def get_models(provider: Optional[str] = None):
    """Retrieve all available models, optionally filtered by provider support."""
    if provider:
        return model_registry.list_models_for_provider(provider)
    return model_registry.list_models()

@router.get("/health")
def get_health():
    """Return the global connection health matrix of the gateway and providers."""
    return health_monitor.check_gateway_health()

@router.post("/provider/select")
def select_provider(req: SelectProviderRequest):
    """Select the active default provider."""
    meta = provider_registry.get_provider_metadata(req.provider)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Provider '{req.provider}' not registered.")
    if meta.status != "enabled":
        raise HTTPException(status_code=400, detail=f"Provider '{req.provider}' is disabled.")
    
    provider_registry.set_current_provider(req.provider)
    # Sync with config manager
    gateway_config.ACTIVE_PROVIDER = req.provider
    return {
        "status": "success",
        "current_provider": req.provider
    }

@router.post("/model/select")
def select_model(req: SelectModelRequest):
    """Select the active default model."""
    meta = model_registry.get_model(req.model)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Model '{req.model}' not registered.")
    
    gateway_config.ACTIVE_MODEL = req.model
    return {
        "status": "success",
        "current_model": req.model
    }

@router.post("/test")
def test_gateway(req: TestPromptRequest):
    """Run a test prompt execution on the gateway to verify provider integrations."""
    try:
        response = gateway_manager.generate(
            prompt=req.prompt,
            provider_name=req.provider,
            model_id=req.model
        )
        return response.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stream")
def stream_gateway(req: TestPromptRequest):
    """Run a streaming prompt execution on the gateway yielding SSE token chunks."""
    def event_generator():
        for chunk in gateway_manager.stream(
            prompt=req.prompt,
            provider_name=req.provider,
            model_id=req.model
        ):
            yield f"data: {json.dumps(chunk)}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# ─── Colab Provider Specific Endpoints ─────────────────────

@router.post("/provider/generate")
def provider_generate(req: TestPromptRequest):
    """Generate content directly forwarding to GoogleColabProvider."""
    try:
        colab = provider_factory.get_provider("google_colab")
        # Ensure it's connected
        colab.connect()
        response = colab.generate(
            prompt=req.prompt,
            model_id=req.model or gateway_config.ACTIVE_MODEL
        )
        return response.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/provider/stream")
def provider_stream(req: TestPromptRequest):
    """Stream token chunks directly forwarding to GoogleColabProvider."""
    try:
        colab = provider_factory.get_provider("google_colab")
        def event_generator():
            for chunk in colab.stream(
                prompt=req.prompt,
                model_id=req.model or gateway_config.ACTIVE_MODEL
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
        return StreamingResponse(event_generator(), media_type="text/event-stream")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/provider/cancel")
def provider_cancel(req: ProviderCancelRequest):
    """Cancel direct task forwarding to GoogleColabProvider."""
    try:
        colab = provider_factory.get_provider("google_colab")
        success = colab.cancel(task_id=req.task_id)
        return {"status": "success" if success else "failed", "cancelled": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/provider/health")
def provider_health():
    """Retrieve detailed health check specifically for GoogleColabProvider."""
    try:
        colab = provider_factory.get_provider("google_colab")
        return colab.health()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/provider/models")
def provider_models():
    """Retrieve models supported specifically by GoogleColabProvider."""
    try:
        colab = provider_factory.get_provider("google_colab")
        return {"models": colab.list_models()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/provider/gpu")
def provider_gpu():
    """Retrieve current GPU resource allocation and information from GoogleColabProvider."""
    try:
        colab = provider_factory.get_provider("google_colab")
        h = colab.health()
        return {
            "gpu_available": h.get("gpu_available", False),
            "gpu_name": h.get("gpu_name", "Unknown"),
            "vram_allocated": h.get("vram_allocated", "?"),
            "vram_total": h.get("vram_total", "?")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


