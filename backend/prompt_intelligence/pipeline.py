import os
from typing import List, Dict, Any, Tuple
from .token_manager import TokenManager
from .prompt_optimizer import PromptOptimizer
from .prompt_validator import PromptValidator
from .vector_search import VectorSearchEngine
from .context_ranker import ContextRanker
from .context_compressor import ContextCompressor
from .rules_generator import RulesGenerator
from .memory_manager import MemoryManager

class PromptIntelligencePipeline:
    """
    Coordinates semantic search, ranking, context compression,
    whitespace optimization, token tracking, and safety validation
    before forwarding prompts to the inference provider.
    """
    def __init__(self, workspace_path: str = ""):
        self.workspace_path = workspace_path
        self.token_manager = TokenManager()
        self.prompt_optimizer = PromptOptimizer()
        self.prompt_validator = PromptValidator()
        self.vector_search = VectorSearchEngine()
        self.context_ranker = ContextRanker()
        self.context_compressor = ContextCompressor()
        self.rules_generator = RulesGenerator(workspace_path)
        self.memory_manager = MemoryManager()

    def build_prompt_context(
        self,
        prompt: str,
        initial_context_files: List[Dict[str, Any]],
        system_prompt: str = "You are a professional software co-pilot."
    ) -> Dict[str, Any]:
        """
        Coordinates token budget estimation, rules generation, ranking,
        compression, and formatting of context files.
        """
        # 1. Generate repository rules dynamically
        rules = self.rules_generator.generate_rules()
        self.memory_manager.set_rules(rules)
        
        # Append rules and memory to system prompt
        rules_block = "\n".join(f"- {r}" for r in rules)
        system_prompt_with_rules = f"{system_prompt}\n\n=== Repository Guidelines ===\n{rules_block}\n"
        
        history_block = self.memory_manager.get_formatted_history()
        if history_block:
            system_prompt_with_rules = f"{system_prompt_with_rules}\n{history_block}"

        # 2. Extract planner priorities and recently modified files from prompt or context if any
        # Score files using the ContextRanker
        scored_files = self.context_ranker.rank_files(
            files=initial_context_files,
            user_prompt=prompt,
            planner_priority_files=[],
            recent_files=[]
        )

        # 3. Calculate preliminary token usage
        temp_context_text = "\n\n".join(f.get("content", "") for f in scored_files)
        metrics = self.token_manager.calculate_metrics(
            prompt_text=prompt,
            context_text=temp_context_text,
            history_text=history_block
        )

        # 4. Trigger Context Compression if budget is exceeded
        final_files = scored_files
        compression_summary = "No compression required."
        
        if metrics["overflow"]:
            orig_chars = len(temp_context_text)
            # Compress to standard target budget (approx 60,000 characters ~ 15K tokens)
            final_files = self.context_compressor.compress_context(
                files=scored_files,
                max_total_chars=60000
            )
            compressed_context_text = "\n\n".join(f.get("content", "") for f in final_files)
            new_chars = len(compressed_context_text)
            compression_summary = f"Compressed context files from {orig_chars} chars to {new_chars} chars."
            
            # Recalculate metrics
            metrics = self.token_manager.calculate_metrics(
                prompt_text=prompt,
                context_text=compressed_context_text,
                history_text=history_block
            )

        # 5. Optimize final output
        opt_data = self.prompt_optimizer.optimize_prompt(
            system_prompt=system_prompt_with_rules,
            user_prompt=prompt,
            context_files=final_files
        )

        return {
            "system_prompt": opt_data["system_prompt"],
            "user_prompt": opt_data["user_prompt"],
            "context_files": opt_data["context_files"],
            "compression_summary": compression_summary,
            "metrics": {
                **metrics,
                "compression_ratio_pct": opt_data["metrics"]["compression_ratio_pct"],
                "optimized_char_count": opt_data["metrics"]["optimized_char_count"]
            }
        }

    def validate_prompt(
        self,
        system_prompt: str,
        user_prompt: str,
        context_files: List[Dict[str, Any]]
    ) -> Tuple[bool, List[str]]:
        """Validate built prompt."""
        return self.prompt_validator.validate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            context_files=context_files,
            project_path=self.workspace_path
        )
