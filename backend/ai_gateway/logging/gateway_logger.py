import json
import logging
import time
from typing import Any, Dict, Optional

# Basic setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_gateway")

class GatewayLogger:
    @staticmethod
    def _log_json(level: str, event: str, module: str, data: Dict[str, Any]):
        log_entry = {
            "timestamp": time.time(),
            "level": level,
            "event": event,
            "module": module,
            **data
        }
        print(f"GATEWAY_LOG: {json.dumps(log_entry)}")
        logger.info(f"[{module}] {event} - {json.dumps(data)}")

    def info(self, event: str, module: str = "Gateway", data: Optional[Dict[str, Any]] = None):
        self._log_json("INFO", event, module, data or {})

    def warn(self, event: str, module: str = "Gateway", data: Optional[Dict[str, Any]] = None):
        self._log_json("WARN", event, module, data or {})

    def error(self, event: str, module: str = "Gateway", data: Optional[Dict[str, Any]] = None, error: Optional[Exception] = None):
        payload = data or {}
        if error:
            payload["error_msg"] = str(error)
            payload["error_type"] = error.__class__.__name__
        self._log_json("ERROR", event, module, payload)

gateway_logger = GatewayLogger()
