import re
from typing import List, Dict, Any

class PromptOptimizer:
    """
    Optimizes prompts by compressing whitespace, stripping unnecessary comments,
    eliminating duplicate context, and prioritizing key content.
    """
    
    def compress_whitespace(self, text: str) -> str:
        """Collapse multiple consecutive newlines and spaces to save tokens."""
        if not text:
            return ""
        # Split into lines, trim each line, collapse spaces inside lines
        lines = [re.sub(r'[ \t]+', ' ', line.strip()) for line in text.split('\n')]
        # Collapse multiple empty lines (max 2 consecutive)
        compact_lines = []
        empty_count = 0
        for line in lines:
            if not line:
                empty_count += 1
                if empty_count <= 1:
                    compact_lines.append(line)
            else:
                empty_count = 0
                compact_lines.append(line)
        return "\n".join(compact_lines).strip()

    def strip_comments(self, code: str, language: str) -> str:
        """
        Strip comments from code while preserving structure.
        Supports JS, TS, Python, CSS, HTML.
        """
        if not code:
            return ""
            
        lang = language.lower()
        if lang in ("python", "py"):
            # Strip single-line comments (ignoring shebang or comments inside strings)
            # A simplified regex that covers most # comments:
            code = re.sub(r'#.*$', '', code, flags=re.MULTILINE)
        elif lang in ("javascript", "typescript", "typescriptreact", "javascriptreact", "js", "ts", "tsx", "jsx", "java", "c", "cpp"):
            # Strip block comments
            code = re.sub(r'/\*[\s\S]*?\*/', '', code)
            # Strip single-line comments
            code = re.sub(r'//.*$', '', code, flags=re.MULTILINE)
        elif lang in ("css", "scss"):
            code = re.sub(r'/\*[\s\S]*?\*/', '', code)
        elif lang in ("html", "xml"):
            code = re.sub(r'<!--[\s\S]*?-->', '', code)
            
        return code

    def optimize_files(self, files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Deduplicates context files, trims comments, compresses whitespace,
        and returns optimized file entries.
        """
        seen_paths = set()
        optimized = []
        
        for file in files:
            path = file.get("filePath", file.get("path", ""))
            if not path or path in seen_paths:
                continue
            seen_paths.add(path)
            
            content = file.get("content", "")
            language = file.get("language", "")
            
            # Trim comments
            clean_content = self.strip_comments(content, language)
            # Compress whitespace
            clean_content = self.compress_whitespace(clean_content)
            
            opt_file = file.copy()
            opt_file["content"] = clean_content
            # Keep track of original vs optimized sizes
            opt_file["original_size"] = len(content)
            opt_file["optimized_size"] = len(clean_content)
            
            optimized.append(opt_file)
            
        return optimized

    def optimize_prompt(self, system_prompt: str, user_prompt: str, context_files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Perform a full optimization of system prompt, user instructions, and context files.
        """
        opt_system = self.compress_whitespace(system_prompt)
        opt_user = self.compress_whitespace(user_prompt)
        opt_files = self.optimize_files(context_files)
        
        # Calculate compression ratio
        original_size = len(system_prompt) + len(user_prompt) + sum(len(f.get("content", "")) for f in context_files)
        optimized_size = len(opt_system) + len(opt_user) + sum(f["optimized_size"] for f in opt_files)
        
        ratio = round((1.0 - (optimized_size / original_size)) * 100.0, 2) if original_size > 0 else 0.0
        
        return {
            "system_prompt": opt_system,
            "user_prompt": opt_user,
            "context_files": opt_files,
            "metrics": {
                "original_char_count": original_size,
                "optimized_char_count": optimized_size,
                "compression_ratio_pct": ratio
            }
        }
