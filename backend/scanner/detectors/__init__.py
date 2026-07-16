import os
from typing import Tuple
from .base import BaseDetector
from .package_json import PackageJsonDetector
from .composer import ComposerPHPDetector
from .pubspec import PubspecYamlDetector
from .generic import GenericWorkspaceDetector

# Register all framework detectors sequentially
DETECTORS = [
    PackageJsonDetector(),
    ComposerPHPDetector(),
    PubspecYamlDetector(),
    GenericWorkspaceDetector()
]

def detect_framework_and_language(root_path: str) -> Tuple[str, str]:
    """
    Applies plugins to detect the framework. Resolves the primary language 
    by scanning file counts in the root directory.
    """
    framework = "Unknown"
    
    # 1. Run all framework detectors
    for detector in DETECTORS:
        res = detector.detect(root_path)
        if res:
            framework = res
            break
            
    # 2. Determine primary language based on extension heuristics
    lang_counts = {}
    ext_to_lang = {
        ".ts": "TypeScript", ".tsx": "TypeScript",
        ".js": "JavaScript", ".jsx": "JavaScript",
        ".php": "PHP",
        ".py": "Python",
        ".cs": "C#",
        ".java": "Java",
        ".dart": "Dart",
        ".html": "HTML",
        ".css": "CSS",
        ".go": "Go",
        ".rs": "Rust"
    }

    try:
        for root, dirs, files in os.walk(root_path):
            # Ignore standard dependency modules and dot-folders
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "vendor", "bin", "obj", ".venv", "env")]
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in ext_to_lang:
                    lang = ext_to_lang[ext]
                    lang_counts[lang] = lang_counts.get(lang, 0) + 1
    except Exception:
        pass

    primary_lang = "Plaintext"
    if lang_counts:
        primary_lang = max(lang_counts, key=lang_counts.get)
        
    return framework, primary_lang
