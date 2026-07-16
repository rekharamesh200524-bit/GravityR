import os
from typing import Optional
from .base import BaseDetector

class PubspecYamlDetector(BaseDetector):
    """
    Detects Flutter projects by inspecting pubspec.yaml.
    """
    def detect(self, root_path: str) -> Optional[str]:
        pubspec_path = os.path.join(root_path, "pubspec.yaml")
        if not os.path.exists(pubspec_path):
            return None

        try:
            with open(pubspec_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # YAML parser is avoided to skip installing pyyaml, simple substring check works reliably
            if "sdk: flutter" in content or "flutter:" in content:
                return "Flutter"
                
            return "Dart"
        except Exception:
            return "Dart"
