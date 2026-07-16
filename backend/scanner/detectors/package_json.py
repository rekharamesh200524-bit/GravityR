import os
import json
from typing import Optional
from .base import BaseDetector

class PackageJsonDetector(BaseDetector):
    """
    Detects Node-based web frameworks by parsing dependencies in package.json.
    """
    def detect(self, root_path: str) -> Optional[str]:
        pkg_path = os.path.join(root_path, "package.json")
        if not os.path.exists(pkg_path):
            return None

        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            deps = data.get("dependencies", {})
            dev_deps = data.get("devDependencies", {})
            all_deps = {**deps, **dev_deps}

            if "next" in all_deps:
                return "Next.js"
            if "@angular/core" in all_deps:
                return "Angular"
            if "react" in all_deps:
                return "React"
            if "vue" in all_deps:
                return "Vue"
            if "svelte" in all_deps:
                return "Svelte"
                
            return "Node"
        except Exception:
            return "Node"
