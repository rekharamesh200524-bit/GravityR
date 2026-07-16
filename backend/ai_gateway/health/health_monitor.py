import time
from typing import Dict, Any, List
from ..factory.provider_factory import provider_factory
from ..registry.provider_registry import provider_registry
from ..logging.gateway_logger import gateway_logger
from ..cache.provider_cache import provider_cache

class HealthMonitor:
    def __init__(self):
        self._last_heartbeat: float = time.time()

    def get_heartbeat(self) -> float:
        return self._last_heartbeat

    def check_gateway_health(self) -> Dict[str, Any]:
        """Collect status of all providers to build a global gateway health matrix."""
        self._last_heartbeat = time.time()
        
        cached_result = provider_cache.get("global_health_monitor")
        if cached_result:
            return cached_result

        providers_status: List[Dict[str, Any]] = []
        for prov in provider_registry.list_providers():
            try:
                factory_instance = provider_factory.get_provider(prov.name)
                health_status = factory_instance.health()
                providers_status.append(health_status)
            except Exception as e:
                gateway_logger.error(f"Error checking health for provider {prov.name}", "HealthMonitor", error=e)
                providers_status.append({
                    "provider": prov.name,
                    "status": "offline",
                    "connected": False,
                    "error": str(e)
                })

        overall_status = "online"
        # If the current selected provider is offline, signal warning/offline
        current_name = provider_registry.get_current_provider_name()
        current_status = next((p for p in providers_status if p["provider"] == current_name), None)
        if current_status and current_status.get("status") != "online":
            overall_status = "degraded"

        result = {
            "status": overall_status,
            "timestamp": time.time(),
            "heartbeat": self._last_heartbeat,
            "current_provider": current_name,
            "providers": providers_status
        }
        
        # Cache for 10 seconds to limit endpoint spamming
        provider_cache.set("global_health_monitor", result, ttl_seconds=10)
        return result

health_monitor = HealthMonitor()
