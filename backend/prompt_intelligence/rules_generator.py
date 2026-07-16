import os
import json
from typing import List

class RulesGenerator:
    """
    Scans project workspace directories to identify framework configuration,
    styling models, languages, and patterns to auto-generate repository rules.
    """
    def __init__(self, workspace_path: str = ""):
        self.workspace_path = workspace_path

    def detect_frameworks(self) -> List[str]:
        """Detect language and framework indicators in the workspace."""
        frameworks = []
        if not self.workspace_path or not os.path.exists(self.workspace_path):
            return ["General Web Application Development"]

        # Check for package.json dependencies
        pkg_json_path = os.path.join(self.workspace_path, "package.json")
        if os.path.exists(pkg_json_path):
            try:
                with open(pkg_json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
                    
                    if "next" in deps:
                        frameworks.append("Next.js App Router framework (v13+ conventions)")
                    if "react" in deps:
                        frameworks.append("React UI library component structure")
                    if "tailwindcss" in deps:
                        frameworks.append("Tailwind CSS utility-first styling classes")
                    if "typescript" in deps:
                        frameworks.append("TypeScript strict typing and types safety")
                    if "lucide-react" in deps:
                        frameworks.append("Lucide React vector icon elements")
            except Exception:
                pass

        # Check for Python files
        requirements_path = os.path.join(self.workspace_path, "requirements.txt")
        if os.path.exists(requirements_path) or os.path.exists(os.path.join(self.workspace_path, "backend")):
            frameworks.append("FastAPI REST backend with Pydantic schemas")
            frameworks.append("SQLAlchemy relational database models & engines")
            frameworks.append("Uvicorn hosting layer")

        if not frameworks:
            frameworks.append("Vanilla HTML/JS/CSS structure")
            
        return frameworks

    def generate_rules(self) -> List[str]:
        """Generate repository guidelines for code style and naming conventions."""
        rules = [
            "Conventions: Write clean, modular, and DRY code conforming to SOLID principles.",
            "Type Safety: Require strict type check compliance; avoid 'any' variables in TypeScript.",
            "Formatting: Preserve standard tab spacings (e.g. 2 spaces for web UI, 4 spaces for Python backend).",
            "Functional Style: Prefer functional components and hooks over class components in React."
        ]

        frameworks = self.detect_frameworks()
        for fw in frameworks:
            rules.append(f"Stack Context: Adhere to {fw} paradigms.")

        # Folder structure specific hints
        if os.path.exists(os.path.join(self.workspace_path, "components")):
            rules.append("Folder Rules: Save custom reusable components to the 'components/ui/' directory.")
        if os.path.exists(os.path.join(self.workspace_path, "stores")):
            rules.append("State Management: Use Zustand stores ('stores/use*Store.ts') for client global state.")

        return rules
