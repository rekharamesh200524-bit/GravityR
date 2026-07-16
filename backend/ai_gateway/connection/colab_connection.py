"""
Colab Connection Manager
Handles: connect, disconnect, reconnect, timeout, health-check, retry backoff.
"""
import time
import threading
import requests
from enum import Enum
from typing import Optional, Dict, Any
from ..logging.gateway_logger import gateway_logger

class ConnectionState(str, Enum):
    DISCONNECTED = "disconnected"
    CONNECTING   = "connecting"
    CONNECTED    = "connected"
    ERROR        = "error"
    SLEEPING     = "sleeping"  # Colab runtime sleeping


class ColabConnectionManager:
    def __init__(
        self,
        endpoint: str,
        timeout: int = 120,
        max_retries: int = 3,
        health_interval: int = 30,
    ):
        self.endpoint      = endpoint
        self.timeout       = timeout
        self.max_retries   = max_retries
        self.state         = ConnectionState.DISCONNECTED
        self.last_ping_ms: Optional[float] = None
        self.last_heartbeat: Optional[float] = None
        self._lock         = threading.Lock()
        self._health_timer: Optional[threading.Timer] = None
        self._health_interval = health_interval

    # ─── Public API ──────────────────────────────────────────────

    def connect(self) -> bool:
        with self._lock:
            if self.state == ConnectionState.CONNECTED:
                return True
            self.state = ConnectionState.CONNECTING

        gateway_logger.info(f"Connecting to Google Colab at {self._safe_url()}", "ColabConnection")

        if not self.endpoint:
            gateway_logger.warn("GOOGLE_COLAB_ENDPOINT is not set — running in offline mode.", "ColabConnection")
            with self._lock:
                self.state = ConnectionState.ERROR
            return False

        for attempt in range(1, self.max_retries + 1):
            try:
                t0 = time.time()
                resp = requests.get(
                    f"{self.endpoint}/health",
                    timeout=min(self.timeout, 10),
                )
                self.last_ping_ms = (time.time() - t0) * 1000

                if resp.status_code == 200:
                    with self._lock:
                        self.state = ConnectionState.CONNECTED
                        self.last_heartbeat = time.time()
                    gateway_logger.info(
                        f"Connected to Colab. Ping: {self.last_ping_ms:.1f}ms",
                        "ColabConnection"
                    )
                    self._start_heartbeat()
                    return True

                gateway_logger.warn(
                    f"Colab health check returned HTTP {resp.status_code} (attempt {attempt}/{self.max_retries})",
                    "ColabConnection"
                )
            except requests.exceptions.ConnectionError as exc:
                gateway_logger.warn(
                    f"Connection error (attempt {attempt}/{self.max_retries}): {exc}",
                    "ColabConnection"
                )
            except requests.exceptions.Timeout:
                gateway_logger.warn(
                    f"Connection timed out (attempt {attempt}/{self.max_retries})",
                    "ColabConnection"
                )

            if attempt < self.max_retries:
                backoff = 2 ** attempt
                gateway_logger.info(f"Retrying in {backoff}s...", "ColabConnection")
                time.sleep(backoff)

        with self._lock:
            self.state = ConnectionState.ERROR
        gateway_logger.error("Failed to connect to Google Colab after all retries.", "ColabConnection")
        return False

    def disconnect(self) -> bool:
        self._stop_heartbeat()
        with self._lock:
            self.state = ConnectionState.DISCONNECTED
        gateway_logger.info("Disconnected from Google Colab.", "ColabConnection")
        return True

    def is_connected(self) -> bool:
        return self.state == ConnectionState.CONNECTED

    def get_state(self) -> str:
        return self.state.value

    def ping(self) -> Optional[float]:
        """Returns round-trip latency in ms, or None on failure."""
        if not self.endpoint:
            return None
        try:
            t0 = time.time()
            requests.get(f"{self.endpoint}/health", timeout=5)
            self.last_ping_ms = (time.time() - t0) * 1000
            return self.last_ping_ms
        except Exception:
            return None

    def get_health(self) -> Dict[str, Any]:
        """Fetch detailed health from the Colab server."""
        if not self.is_connected() or not self.endpoint:
            return {
                "state": self.state.value,
                "connected": False,
                "endpoint": self._safe_url(),
                "last_ping_ms": self.last_ping_ms,
            }
        try:
            resp = requests.get(f"{self.endpoint}/health", timeout=10)
            data: Dict[str, Any] = resp.json()
            data["state"] = self.state.value
            data["endpoint"] = self._safe_url()
            data["last_ping_ms"] = self.last_ping_ms
            self.last_heartbeat = time.time()
            return data
        except Exception as exc:
            gateway_logger.error("Health check failed", "ColabConnection", error=exc)
            with self._lock:
                self.state = ConnectionState.ERROR
            return {
                "state": ConnectionState.ERROR.value,
                "connected": False,
                "error": str(exc),
            }

    # ─── Heartbeat ──────────────────────────────────────────────

    def _start_heartbeat(self) -> None:
        self._stop_heartbeat()
        self._schedule_heartbeat()

    def _stop_heartbeat(self) -> None:
        if self._health_timer:
            self._health_timer.cancel()
            self._health_timer = None

    def _schedule_heartbeat(self) -> None:
        def _beat() -> None:
            if self.state == ConnectionState.CONNECTED:
                p = self.ping()
                if p is None:
                    gateway_logger.warn("Heartbeat missed — connection may be lost.", "ColabConnection")
                    with self._lock:
                        self.state = ConnectionState.ERROR
                else:
                    self.last_heartbeat = time.time()
            self._schedule_heartbeat()  # reschedule

        self._health_timer = threading.Timer(self._health_interval, _beat)
        self._health_timer.daemon = True
        self._health_timer.start()

    # ─── Helpers ──────────────────────────────────────────────

    def _safe_url(self) -> str:
        """Return a URL safe to log (truncate any token params)."""
        if not self.endpoint:
            return "(not configured)"
        if "?" in self.endpoint:
            return self.endpoint.split("?")[0] + "?..."
        return self.endpoint
