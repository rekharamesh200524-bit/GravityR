import os
from typing import Optional

class BaseDetector:
    """
    Base class representing a modular plugin for detecting frameworks and languages.
    """
    def detect(self, root_path: str) -> Optional[str]:
        """
        Scan files at root_path and return detected framework name (or None).
        """
        raise NotImplementedError("Subclasses must implement detect()")
