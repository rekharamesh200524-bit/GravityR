import os
import glob
from typing import Optional
from .base import BaseDetector

class GenericWorkspaceDetector(BaseDetector):
    """
    Detects Python, Java, and .NET configurations based on standard files.
    """
    def detect(self, root_path: str) -> Optional[str]:
        # 1. .NET check (looking for sln or csproj files)
        try:
            csproj_files = glob.glob(os.path.join(root_path, "*.csproj")) + glob.glob(os.path.join(root_path, "**", "*.csproj"), recursive=False)
            sln_files = glob.glob(os.path.join(root_path, "*.sln"))
            if csproj_files or sln_files:
                return ".NET"
        except Exception:
            pass

        # 2. Java check
        if os.path.exists(os.path.join(root_path, "pom.xml")):
            return "Java Maven"
        if os.path.exists(os.path.join(root_path, "build.gradle")):
            return "Java Gradle"

        # 3. Python check
        requirements_path = os.path.join(root_path, "requirements.txt")
        if os.path.exists(requirements_path):
            try:
                with open(requirements_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read().lower()
                if "fastapi" in content:
                    return "FastAPI"
                if "django" in content:
                    return "Django"
                if "flask" in content:
                    return "Flask"
                return "Python"
            except Exception:
                return "Python"

        if os.path.exists(os.path.join(root_path, "pyproject.toml")):
            return "Python"

        return None
