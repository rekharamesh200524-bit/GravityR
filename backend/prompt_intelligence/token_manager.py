from typing import Dict, Any

class TokenManager:
    """
    Manages and estimates token counts, checks for overflow,
    calculates metrics, and estimates API costs.
    """
    # 4 characters per token average
    CHAR_TO_TOKEN_RATIO = 4.0
    
    # Cost per 1K tokens (e.g. input $0.0015, output $0.0020)
    COST_PER_1K_INPUT = 0.0015
    COST_PER_1K_OUTPUT = 0.0020

    def __init__(self, max_tokens: int = 32768):
        self.max_tokens = max_tokens

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for a given text snippet."""
        if not text:
            return 0
        return max(1, int(len(text) / self.CHAR_TO_TOKEN_RATIO))

    def calculate_metrics(
        self,
        prompt_text: str,
        context_text: str,
        history_text: str = "",
        expected_response_tokens: int = 2048
    ) -> Dict[str, Any]:
        """
        Calculate metrics like current token usage, remaining tokens,
        and estimated costs.
        """
        prompt_tokens = self.estimate_tokens(prompt_text)
        context_tokens = self.estimate_tokens(context_text)
        history_tokens = self.estimate_tokens(history_text)
        
        current_tokens = prompt_tokens + context_tokens + history_tokens
        remaining_tokens = max(0, self.max_tokens - current_tokens)
        
        # Estimate cost in USD
        input_cost = (current_tokens / 1000.0) * self.COST_PER_1K_INPUT
        output_cost = (expected_response_tokens / 1000.0) * self.COST_PER_1K_OUTPUT
        estimated_cost = input_cost + output_cost

        overflow = current_tokens > self.max_tokens
        
        return {
            "prompt_tokens": prompt_tokens,
            "context_tokens": context_tokens,
            "history_tokens": history_tokens,
            "current_tokens": current_tokens,
            "max_tokens": self.max_tokens,
            "remaining_tokens": remaining_tokens,
            "estimated_cost_usd": round(estimated_cost, 6),
            "overflow": overflow,
            "requires_compression": overflow
        }
