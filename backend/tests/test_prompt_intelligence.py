import unittest
import os
import json
import numpy as np
import faiss

# Import modules under test
from backend.prompt_intelligence.token_manager import TokenManager
from backend.prompt_intelligence.prompt_optimizer import PromptOptimizer
from backend.prompt_intelligence.prompt_validator import PromptValidator
from backend.prompt_intelligence.vector_search import VectorSearchEngine
from backend.prompt_intelligence.context_ranker import ContextRanker
from backend.prompt_intelligence.context_compressor import ContextCompressor
from backend.prompt_intelligence.rules_generator import RulesGenerator
from backend.prompt_intelligence.memory_manager import MemoryManager
from backend.prompt_intelligence.pipeline import PromptIntelligencePipeline

class TestTokenManager(unittest.TestCase):
    def test_estimate_tokens(self):
        manager = TokenManager()
        text = "Hello World"  # 11 chars
        self.assertEqual(manager.estimate_tokens(text), 2)
        self.assertEqual(manager.estimate_tokens(""), 0)

    def test_calculate_metrics(self):
        manager = TokenManager(max_tokens=100)
        # Total characters is approx 280, leading to approx 70 tokens
        metrics = manager.calculate_metrics(
            prompt_text="a" * 80,
            context_text="b" * 120,
            history_text="c" * 80,
            expected_response_tokens=10
        )
        self.assertEqual(metrics["overflow"], font_overflow := metrics["current_tokens"] > 100)
        self.assertTrue(metrics["estimated_cost_usd"] > 0)


class TestPromptOptimizer(unittest.TestCase):
    def test_compress_whitespace(self):
        optimizer = PromptOptimizer()
        raw = "Hello   \t  World  \n\n\n\n  Next"
        self.assertEqual(optimizer.compress_whitespace(raw), "Hello World\n\nNext")

    def test_strip_comments_python(self):
        optimizer = PromptOptimizer()
        code = "x = 42  # some comment\n# class line\ny = 'hello'"
        clean = optimizer.strip_comments(code, "python")
        self.assertNotIn("some comment", clean)
        self.assertNotIn("class line", clean)
        self.assertIn("x = 42", clean)

    def test_strip_comments_javascript(self):
        optimizer = PromptOptimizer()
        code = "const x = 10; // inline comment\n/* block \n comment */\nconst y = 20;"
        clean = optimizer.strip_comments(code, "javascript")
        self.assertNotIn("inline comment", clean)
        self.assertNotIn("block", clean)
        self.assertIn("const x = 10;", clean)


class TestPromptValidator(unittest.TestCase):
    def test_validator_basic(self):
        validator = PromptValidator(max_payload_chars=1000)
        
        # Valid prompt
        valid, issues = validator.validate("System", "User instructions", [{"path": "file.py", "content": "print(1)"}])
        self.assertTrue(valid)
        self.assertEqual(len(issues), 0)

        # Empty user prompt
        valid_empty, issues_empty = validator.validate("System", "", [])
        self.assertFalse(valid_empty)
        self.assertTrue(any("empty" in issue.lower() for issue in issues_empty))

        # Oversized payload
        valid_huge, issues_huge = validator.validate("System", "a" * 1200, [])
        self.assertFalse(valid_huge)
        self.assertTrue(any("oversized" in issue.lower() for issue in issues_huge))


class TestVectorSearch(unittest.TestCase):
    def test_search_and_merge(self):
        engine = VectorSearchEngine(embedding_dim=4)
        
        files = [
            {"path": "components/Button.tsx", "content": "import React from 'react'; export const Button = () => <button>Click</button>"},
            {"path": "backend/main.py", "content": "from fastapi import FastAPI; app = FastAPI()"},
            {"path": "package.json", "content": '{"dependencies": {"react": "18.2.0"}}'}
        ]
        
        engine.build_index(files)
        self.assertIsNotNone(engine.index)
        self.assertEqual(len(engine.file_paths), 3)
        
        # Search semantically for React Button
        results = engine.search("react button component design", top_k=2)
        self.assertTrue(len(results) > 0)
        # First file should be Button.tsx due to semantic term matches
        self.assertEqual(results[0][0], "components/Button.tsx")
        
        # Test merging
        kw_results = [{"filePath": "package.json", "confidence": 0.9}]
        merged = engine.merge_results(kw_results, results)
        self.assertTrue(len(merged) >= 2)


class TestContextRanker(unittest.TestCase):
    def test_rank_files(self):
        ranker = ContextRanker()
        files = [
            {"filePath": "a.py", "fileName": "a.py", "content": "class User: def login()", "confidence": 0.5},
            {"filePath": "b.py", "fileName": "b.py", "content": "import sys; print(sys.argv)", "confidence": 0.4}
        ]
        
        # Scoring with symbol matches: 'User' found in a.py
        ranked = ranker.rank_files(
            files=files,
            user_prompt="Authenticate the User using credentials",
            planner_priority_files=["b.py"],
            recent_files=[]
        )
        
        # b.py has planner priority bonus (+0.35), so it should rank first
        self.assertEqual(ranked[0]["filePath"], "b.py")
        self.assertTrue(ranked[0]["score"] > ranked[1]["score"])


class TestContextCompressor(unittest.TestCase):
    def test_compress_flow(self):
        compressor = ContextCompressor()
        
        # Test imports collapsing
        code = "import os\nfrom sys import exit\nimport numpy as np\n\nx = 10"
        self.assertEqual(compressor.collapse_imports(code).strip(), "x = 10")
        
        # Test signature extraction
        py_code = "class Calculator:\n    def add(self, a, b):\n        return a + b\n\ndef run():\n    print('Running')"
        sigs = compressor.extract_signatures(py_code, "python")
        self.assertIn("class Calculator:", sigs)
        self.assertIn("def add(self, a, b):", sigs)
        self.assertNotIn("return a + b", sigs)


class TestRulesGenerator(unittest.TestCase):
    def test_rules_generation(self):
        generator = RulesGenerator(workspace_path=".")
        rules = generator.generate_rules()
        self.assertTrue(len(rules) > 0)
        # Check that it generated some guidelines or context rules
        self.assertTrue(any("Conventions" in r or "Stack" in r for r in rules))


class TestMemoryManager(unittest.TestCase):
    def test_scrub_secrets(self):
        memory = MemoryManager()
        dirty_key = "OpenAI key: sk-abcdefghijklmnopqrstuvwxyz1234567890"
        dirty_pass = "DB_PASS='secret_pwd'"
        
        self.assertNotIn("sk-abcdef", memory._scrub_secrets(dirty_key))
        self.assertNotIn("secret_pwd", memory._scrub_secrets(dirty_pass))

    def test_history_limit(self):
        memory = MemoryManager(limit=2)
        memory.add_turn("Q1", "A1")
        memory.add_turn("Q2", "A2")
        memory.add_turn("Q3", "A3")
        
        self.assertEqual(len(memory.history), 2)
        self.assertEqual(memory.history[0]["prompt"], "Q2")
        self.assertEqual(memory.history[1]["prompt"], "Q3")


if __name__ == "__main__":
    unittest.main()
