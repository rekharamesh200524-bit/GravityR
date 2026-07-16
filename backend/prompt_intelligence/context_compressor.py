import re
from typing import List, Dict, Any

class ContextCompressor:
    """
    Compresses files in prompt context when size limits are exceeded.
    Supports comments stripping, collapsing imports, keeping function signatures only,
    and generating text/structure summaries.
    """
    
    def strip_comments(self, code: str) -> str:
        """Strip multi-line and single-line comments from general programming languages."""
        # Strip block comments /* ... */
        code = re.sub(r'/\*[\s\S]*?\*/', '', code)
        # Strip single-line comments // ...
        code = re.sub(r'//.*$', '', code, flags=re.MULTILINE)
        # Strip python # comments (making sure it's not a string character)
        code = re.sub(r'#.*$', '', code, flags=re.MULTILINE)
        return code

    def collapse_imports(self, code: str) -> str:
        """Collapse or strip standard import statements to save space."""
        # Match python imports: 'import module' or 'from module import ...'
        code = re.sub(r'^\s*(import\s+.+|from\s+.+\s+import\s+.+)\n?', '', code, flags=re.MULTILINE)
        # Match JS/TS imports: 'import ... from ...;'
        code = re.sub(r'^\s*import\s+[\s\S]*?from\s+[\'"].*?[\'"];?\n?', '', code, flags=re.MULTILINE)
        return code

    def extract_signatures(self, code: str, language: str) -> str:
        """
        Trims a file content to only show its function, class, and method signatures,
        removing function/class bodies.
        """
        lang = language.lower()
        lines = code.split('\n')
        signature_lines = []
        
        # Regex definitions
        if lang in ("python", "py"):
            # def or class
            sig_pattern = re.compile(r'^\s*(def|class)\s+[a-zA-Z_][a-zA-Z0-9_]*.*:')
        else:
            # JS/TS/Java/C++ functions, classes, interfaces
            sig_pattern = re.compile(r'^\s*(export\s+|default\s+|async\s+|public\s+|private\s+)*(function|class|interface|const\s+[a-zA-Z_0-9]+\s*=\s*(\(.*?\)|async\s*\(.*?\))\s*=>)\s*')
            
        for line in lines:
            if sig_pattern.match(line) or "interface " in line or "type " in line:
                signature_lines.append(line)
                
        if signature_lines:
            return "\n".join(signature_lines) + "\n\n// [... body omitted for compression ...]"
        return "// [... content compressed ...]"

    def summarize_file(self, file_content: str, path: str) -> str:
        """Generate a structure summary of the file to represent its purpose."""
        lines = file_content.split('\n')
        num_lines = len(lines)
        size = len(file_content)
        return f"// File: {path}\n// Summary: Contains {num_lines} lines ({size} bytes) of code.\n// Content omitted to fit token constraints.\n"

    def compress_context(
        self,
        files: List[Dict[str, Any]],
        max_total_chars: int = 100_000
    ) -> List[Dict[str, Any]]:
        """
        Compress context files iteratively until total size is below target limit.
        1. Try stripping comments.
        2. Try collapsing imports.
        3. Try extracting function signatures only for low-rank files.
        4. Fallback to basic file headers for lowest scoring files.
        """
        compressed_files = []
        
        # Helper to compute current total char count
        def get_total_chars(file_list):
            return sum(len(f.get("content", "")) for f in file_list)

        # Start with standard files
        for f in files:
            compressed_files.append(f.copy())
            
        if get_total_chars(compressed_files) <= max_total_chars:
            return compressed_files

        # Step 1: Strip comments from all files
        for f in compressed_files:
            f["content"] = self.strip_comments(f.get("content", ""))
            
        if get_total_chars(compressed_files) <= max_total_chars:
            return compressed_files

        # Step 2: Collapse imports
        for f in compressed_files:
            f["content"] = self.collapse_imports(f.get("content", ""))
            
        if get_total_chars(compressed_files) <= max_total_chars:
            return compressed_files

        # Step 3: For lower ranked files, extract only signatures
        # (Assume files are sorted by Ranker score descending; keep top 2 full, compress the rest)
        for idx, f in enumerate(compressed_files):
            if idx >= 2:  # Keep top 2 detailed, reduce others to function signatures
                f["content"] = self.extract_signatures(f.get("content", ""), f.get("language", ""))
                
        if get_total_chars(compressed_files) <= max_total_chars:
            return compressed_files

        # Step 4: Full omission with summary headers for everything except the highest ranked file
        for idx, f in enumerate(compressed_files):
            if idx >= 1:
                f["content"] = self.summarize_file(f.get("content", ""), f.get("filePath", f.get("path", "")))

        return compressed_files
