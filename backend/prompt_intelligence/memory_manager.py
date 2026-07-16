import re
from typing import List, Dict, Any

class MemoryManager:
    """
    Manages short-term conversation context, previous prompts, responses,
    decisions, and workspace properties. Scrubs secrets before storing.
    """
    def __init__(self, limit: int = 5):
        self.limit = limit
        self.history: List[Dict[str, Any]] = []
        self.rules: List[str] = []

    def _scrub_secrets(self, text: str) -> str:
        """Mask potential API keys, auth tokens, or passwords to keep prompt safe."""
        if not text:
            return ""
        # Match common secret patterns (e.g. sk-..., bearer tokens, password=...)
        text = re.sub(r'(api_key|password|pass|token|secret|jwt)\s*[:=]\s*["\'][a-zA-Z0-9_\-\.\/]{6,}["\']', r'\1: "[REDACTED SECRET]"', text, flags=re.IGNORECASE)
        text = re.sub(r'sk-[a-zA-Z0-9]{32,}', '"[REDACTED OPENAI KEY]"', text)
        return text

    def add_turn(self, prompt: str, response: str):
        """Append a conversation turn to the memory stack."""
        clean_prompt = self._scrub_secrets(prompt)
        clean_response = self._scrub_secrets(response)
        
        self.history.append({
            "prompt": clean_prompt,
            "response": clean_response
        })
        
        # Enforce history limit
        if len(self.history) > self.limit:
            self.history.pop(0)

    def set_rules(self, rules: List[str]):
        """Register the project-wide repository rules."""
        self.rules = [self._scrub_secrets(r) for r in rules]

    def get_formatted_history(self) -> str:
        """Format short-term history for model prompt insertion."""
        if not self.history:
            return ""
            
        formatted = ["=== Conversation Memory Context ==="]
        for turn in self.history:
            formatted.append(f"User: {turn['prompt']}")
            # Simple content summary or preview if response is large
            resp = turn['response']
            if len(resp) > 300:
                resp = resp[:300] + "... [truncated in history]"
            formatted.append(f"Assistant: {resp}")
            
        return "\n".join(formatted) + "\n====================================\n"
        
    def clear(self):
        """Reset conversation memory."""
        self.history.clear()
