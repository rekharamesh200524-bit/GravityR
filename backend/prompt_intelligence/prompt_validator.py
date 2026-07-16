import os
from typing import List, Dict, Any, Tuple

class PromptValidator:
    """
    Validates prompts and context payloads before forwarding to the inference providers.
    Ensures input safety, format compliance, and token limit constraints.
    """
    def __init__(self, max_payload_chars: int = 250_000):
        self.max_payload_chars = max_payload_chars

    def validate(
        self,
        system_prompt: str,
        user_prompt: str,
        context_files: List[Dict[str, Any]],
        project_path: str = ""
    ) -> Tuple[bool, List[str]]:
        """
        Validate prompt components.
        Returns:
            Tuple of (is_valid, list of warning/error messages)
        """
        issues = []
        
        # 1. Verify user prompt is not empty
        if not user_prompt or not user_prompt.strip():
            issues.append("Validation Error: User prompt instruction is empty.")
            
        # 2. Check payload size limit to prevent oversized request denial
        total_chars = len(system_prompt) + len(user_prompt) + sum(len(f.get("content", "")) for f in context_files)
        if total_chars > self.max_payload_chars:
            issues.append(f"Validation Error: Oversized payload. Total payload size ({total_chars} chars) exceeds safety limit ({self.max_payload_chars} chars).")
            
        # 3. Check for duplicate context files
        seen_paths = set()
        for file in context_files:
            path = file.get("filePath", file.get("path", ""))
            if not path:
                issues.append("Validation Warning: File node has missing path key.")
                continue
            if path in seen_paths:
                issues.append(f"Validation Warning: Duplicate file path found in context: {path}")
            seen_paths.add(path)
            
        # 4. Verify context files exist on disk (if project_path is supplied)
        if project_path and os.path.exists(project_path):
            for file in context_files:
                path = file.get("filePath", file.get("path", ""))
                if not path:
                    continue
                # Construct full absolute path
                full_path = path
                if not os.path.isabs(path):
                    full_path = os.path.join(project_path, path)
                    
                if not os.path.exists(full_path):
                    issues.append(f"Validation Warning: Context file referenced does not exist on disk: {path}")

        # Determine validity: Errors (e.g. empty prompt or extreme overflow) yield False,
        # warnings just report issues but might pass if minor.
        has_errors = any(issue.startswith("Validation Error:") for issue in issues)
        is_valid = not has_errors
        
        return is_valid, issues
