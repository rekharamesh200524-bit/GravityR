import time
from typing import Dict, Any, Optional

class ProviderCache:
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}

    def set(self, key: str, value: Any, ttl_seconds: int = 60):
        self._cache[key] = {
            "value": value,
            "expires_at": time.time() + ttl_seconds
        }

    def get(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if not entry:
            return None
        if time.time() > entry["expires_at"]:
            del self._cache[key]
            return None
        return entry["value"]

    def invalidate(self, key: str):
        if key in self._cache:
            del self._cache[key]

    def clear(self):
        self._cache.clear()

provider_cache = ProviderCache()
