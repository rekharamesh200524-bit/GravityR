import unittest
import os
import shutil
import json
from sqlalchemy.orm import Session
from backend.database.connection import SessionLocal, engine, Base
from backend.services.review_engine import ReviewEngine
from backend.services.tool_executor import ToolExecutor

class TestToolExecution(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create SQLite tables in memory/test db
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()
        cls.test_dir = "test_sandbox"
        os.makedirs(cls.test_dir, exist_ok=True)
        
        # Write dummy files to workspace test_sandbox
        with open(os.path.join(cls.test_dir, "hello.txt"), "w", encoding="utf-8") as f:
            f.write("Hello World\nLine 2")
            
        with open(os.path.join(cls.test_dir, ".env"), "w", encoding="utf-8") as f:
            f.write("SECRET_KEY=123")

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        # Clean up test sandbox
        if os.path.exists(cls.test_dir):
            shutil.rmtree(cls.test_dir)
        if os.path.exists(".gravityx_backups"):
            shutil.rmtree(".gravityx_backups")

    def test_review_engine(self):
        engine = ReviewEngine(workspace_path=self.test_dir)
        ai_response = json.dumps({
            "summary": "Implement greetings component",
            "confidence": 0.98,
            "warnings": ["Ensure path is valid"],
            "review": "Approved modifications.",
            "files": [
                {"path": "hello.txt", "content": "Hello World\nLine 2 changed\nLine 3 added"},
                {"path": "new_file.py", "content": "print('New file')"},
                {"path": ".env", "content": "SECRET_KEY=999"}
            ]
        })
        
        res = engine.review_response("task-001", "Update code", ai_response)
        
        self.assertEqual(res["taskId"], "task-001")
        self.assertEqual(res["confidence"], 0.98)
        self.assertEqual(res["complexity"], "moderate")
        
        files = res["filesChanged"]
        self.assertEqual(len(files), 3)
        
        # Verify hello.txt changed details
        hello_file = next(f for f in files if f["filePath"] == "hello.txt")
        self.assertEqual(hello_file["changeType"], "modified")
        self.assertTrue(hello_file["linesAdded"] > 0)
        self.assertTrue(hello_file["linesRemoved"] > 0)

        # Verify new_file.py creation details
        new_file = next(f for f in files if f["filePath"] == "new_file.py")
        self.assertEqual(new_file["changeType"], "created")

        # Verify safety warnings triggered
        warnings = res["warnings"]
        self.assertTrue(any("protected" in w["message"].lower() for w in warnings))

    def test_tool_executor_files(self):
        executor = ToolExecutor(workspace_path=self.test_dir)
        
        # 1. Read
        read_res = executor.read_file(self.db, "task-002", "hello.txt")
        self.assertEqual(read_res["status"], "success")
        self.assertIn("Hello World", read_res["content"])

        # 2. Write (should backup and write new contents)
        write_res = executor.write_file(self.db, "task-002", "hello.txt", "New hello content")
        self.assertEqual(write_res["status"], "success")
        # Verify backup was created
        self.assertTrue(os.path.exists(write_res["backup"]))
        
        # 3. Read mutated content
        mutated = executor.read_file(self.db, "task-002", "hello.txt")
        self.assertEqual(mutated["content"], "New hello content")

        # 4. Rename
        rename_res = executor.rename_file(self.db, "task-002", "hello.txt", "hello_moved.txt")
        self.assertEqual(rename_res["status"], "success")
        self.assertFalse(os.path.exists(os.path.join(self.test_dir, "hello.txt")))
        self.assertTrue(os.path.exists(os.path.join(self.test_dir, "hello_moved.txt")))

        # 5. Delete
        delete_res = executor.delete_file(self.db, "task-002", "hello_moved.txt")
        self.assertEqual(delete_res["status"], "success")
        self.assertFalse(os.path.exists(os.path.join(self.test_dir, "hello_moved.txt")))
        self.assertTrue(os.path.exists(delete_res["backup"]))

    def test_tool_executor_sandbox_security(self):
        executor = ToolExecutor(workspace_path=self.test_dir)
        
        # Traversal write should fail with PermissionError/Error response status
        write_res = executor.write_file(self.db, "task-003", "../../outside.txt", "payload")
        self.assertEqual(write_res["status"], "error")
        self.assertIn("Security Alert", write_res["message"])

        # Traversal read should fail
        read_res = executor.read_file(self.db, "task-003", "../../outside.txt")
        self.assertEqual(read_res["status"], "error")
        self.assertIn("Security Alert", read_res["message"])

        # Traversal delete should fail
        delete_res = executor.delete_file(self.db, "task-003", "../../outside.txt")
        self.assertEqual(delete_res["status"], "error")
        self.assertIn("Security Alert", delete_res["message"])

        # Traversal rename old should fail
        rename_res1 = executor.rename_file(self.db, "task-003", "../../outside.txt", "inside.txt")
        self.assertEqual(rename_res1["status"], "error")
        self.assertIn("Security Alert", rename_res1["message"])

        # Traversal rename new should fail
        rename_res2 = executor.rename_file(self.db, "task-003", "hello.txt", "../../outside.txt")
        self.assertEqual(rename_res2["status"], "error")
        self.assertIn("Security Alert", rename_res2["message"])

    def test_tool_executor_terminal(self):
        executor = ToolExecutor(workspace_path=".")
        
        # Block raw illegal command
        term_res = executor.execute_terminal(self.db, "task-004", "rm -rf /")
        self.assertEqual(term_res["status"], "error")
        self.assertIn("Security Alert", term_res["message"])

        # Execute safe allowed git status command
        git_res = executor.execute_terminal(self.db, "task-004", "git status")
        self.assertEqual(git_res["status"], "success")
        self.assertTrue(git_res["execution_time_sec"] > 0)


if __name__ == "__main__":
    unittest.main()
