import re
from typing import List, Dict, Any

class ContextRanker:
    """
    Ranks context files based on multi-factor scoring:
    semantic similarity, dependency linkage, modification status,
    symbol referencing, and planner priority.
    """
    def __init__(self):
        pass

    def _count_occurrences(self, word: str, text: str) -> int:
        """Count occurrences of a word in a text snippet using regex."""
        if not word or not text:
            return 0
        escaped = re.escape(word)
        return len(re.findall(r'\b' + escaped + r'\b', text))

    def rank_files(
        self,
        files: List[Dict[str, Any]],
        user_prompt: str,
        planner_priority_files: List[str] = None,
        recent_files: List[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Rank files based on multiple heuristic factors and return scored files.
        """
        scored_files = []
        planner_set = set(planner_priority_files or [])
        recent_set = set(recent_files or [])
        
        # Extract potential symbol names from the user prompt (CamelCase or snake_case words)
        symbols = re.findall(r'\b[A-Z_a-z][A-Za-z0-9_]*\b', user_prompt)
        # Filter typical keywords
        ignored = {"function", "class", "const", "let", "var", "import", "export", "return", "from", "create", "delete", "update", "new"}
        active_symbols = {sym for sym in symbols if sym not in ignored and len(sym) > 3}

        for file in files:
            path = file.get("filePath", file.get("path", ""))
            name = file.get("fileName", file.get("name", ""))
            content = file.get("content", "")
            confidence = file.get("confidence", 0.5)  # Similarity base score
            
            score = confidence * 0.4  # base similarity weight
            
            # 1. Planner priority bonus
            if path in planner_set or name in planner_set:
                score += 0.35
                
            # 2. Recency bonus
            if path in recent_set or name in recent_set:
                score += 0.15
                
            # 3. Referenced symbols matching
            symbol_matches = 0
            for sym in active_symbols:
                if self._count_occurrences(sym, content) > 0:
                    symbol_matches += 1
            if symbol_matches > 0:
                score += min(0.2, symbol_matches * 0.05)
                
            # 4. Dependency check: do other files reference this file, or does it reference other files?
            # If the filename is referenced inside other file contents, increase its score
            dep_references = 0
            name_base = name.split('.')[0] if '.' in name else name
            if len(name_base) > 2:
                for other_file in files:
                    other_path = other_file.get("filePath", other_file.get("path", ""))
                    if other_path != path:
                        other_content = other_file.get("content", "")
                        if name_base in other_content:
                            dep_references += 1
            if dep_references > 0:
                score += min(0.1, dep_references * 0.02)
                
            scored_file = file.copy()
            # Bound score between 0.0 and 1.0
            final_score = round(min(1.0, max(0.0, score)), 2)
            scored_file["score"] = final_score
            scored_files.append(scored_file)
            
        # Sort files by their final computed score descending
        scored_files.sort(key=lambda x: x.get("score", 0.0), reverse=True)
        return scored_files
