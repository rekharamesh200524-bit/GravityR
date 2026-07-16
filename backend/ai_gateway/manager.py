import time
from typing import Dict, Any, Generator, Optional
from .interfaces.provider import GatewayResponse
from .factory.provider_factory import provider_factory
from .registry.provider_registry import provider_registry
from .registry.model_registry import model_registry
from .logging.gateway_logger import gateway_logger
from .config.gateway_config import gateway_config

class GatewayManager:
    def __init__(self):
        pass

    def _get_active_provider(self, override_provider: Optional[str] = None) -> str:
        prov = override_provider or provider_registry.get_current_provider_name()
        if not prov:
            prov = gateway_config.ACTIVE_PROVIDER
        return prov

    def _get_active_model(self, override_model: Optional[str] = None) -> str:
        model = override_model or gateway_config.ACTIVE_MODEL
        return model

    def generate(
        self, 
        prompt: str, 
        provider_name: Optional[str] = None, 
        model_id: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> GatewayResponse:
        prov = self._get_active_provider(provider_name)
        model = self._get_active_model(model_id)

        gateway_logger.info(f"GatewayManager generate request using provider: {prov}, model: {model}", "GatewayManager")
        
        # Validate that the selected provider supports this model
        model_meta = model_registry.get_model(model)
        if model_meta and prov not in model_meta.providerSupport:
            gateway_logger.warn(f"Model {model} is not officially supported by provider {prov}. Proceeding anyway.", "GatewayManager")

        provider_instance = provider_factory.get_provider(prov)
        
        retries = 0
        max_retries = gateway_config.MAX_RETRIES
        last_error: Optional[Exception] = None

        while retries <= max_retries:
            try:
                response = provider_instance.generate(prompt, model, options)
                return response
            except Exception as e:
                retries += 1
                last_error = e
                gateway_logger.warn(f"Retrying prompt execution (attempt {retries}/{max_retries}) due to error: {e}", "GatewayManager")
                time.sleep(0.5 * retries)

        gateway_logger.error(f"Failed to generate output after {max_retries} retries.", "GatewayManager", error=last_error)
        
        # Return fallback error gateway response schema
        return GatewayResponse(
            provider=prov,
            model=model,
            success=False,
            latency=0.0,
            streaming=False,
            content=f"Error generating response: {last_error}",
            metadata={"error": str(last_error)}
        )

    def stream(
        self, 
        prompt: str, 
        provider_name: Optional[str] = None, 
        model_id: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> Generator[Dict[str, Any], None, None]:
        prov = self._get_active_provider(provider_name)
        model = self._get_active_model(model_id)

        gateway_logger.info(f"GatewayManager streaming request using provider: {prov}, model: {model}", "GatewayManager")
        provider_instance = provider_factory.get_provider(prov)

        try:
            for chunk in provider_instance.stream(prompt, model, options):
                yield chunk
        except Exception as e:
            gateway_logger.error("Error encountered during streaming", "GatewayManager", error=e)
            yield {
                "error": str(e),
                "content": f"\n[Streaming error: {e}]"
            }

    def cancel(self, task_id: str, provider_name: Optional[str] = None) -> bool:
        prov = self._get_active_provider(provider_name)
        provider_instance = provider_factory.get_provider(prov)
        return provider_instance.cancel(task_id)

gateway_manager = GatewayManager()
