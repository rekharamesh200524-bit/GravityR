import os
import json
from typing import Optional
from .base import BaseDetector

class ComposerPHPDetector(BaseDetector):
    """
    Detects Laravel or CodeIgniter configurations in PHP projects.
    """
    def detect(self, root_path: str) -> Optional[str]:
        # 1. Laravel artisan file check
        if os.path.exists(os.path.join(root_path, "artisan")):
            return "Laravel"

        # 2. CodeIgniter 3 layout indicators
        system_dir = os.path.exists(os.path.join(root_path, "system", "core", "CodeIgniter.php"))
        app_config = os.path.exists(os.path.join(root_path, "application", "config", "config.php"))
        if system_dir or app_config:
            return "CodeIgniter 3"

        # 3. CodeIgniter 4 CLI spark check
        if os.path.exists(os.path.join(root_path, "spark")):
            return "CodeIgniter 4"

        # 4. Check composer.json contents
        composer_path = os.path.join(root_path, "composer.json")
        if os.path.exists(composer_path):
            try:
                with open(composer_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                reqs = data.get("require", {})
                if "laravel/framework" in reqs:
                    return "Laravel"
                if "codeigniter4/framework" in reqs:
                    return "CodeIgniter 4"
                
                return "PHP"
            except Exception:
                return "PHP"

        return None
