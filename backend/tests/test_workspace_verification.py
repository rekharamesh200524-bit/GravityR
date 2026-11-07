import os
import sys
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure repo root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.services.workspace_manager import WorkspaceManager, workspace_manager
from backend.services.tool_executor import ToolExecutor
from backend.database.models import Base


def test_workspace_manager_path_validation():
    wm = WorkspaceManager()
    with tempfile.TemporaryDirectory() as tmpdir:
        session = wm.open_session(tmpdir, "test-ws-id", "test_proj")
        ws_id = session.workspace_id
        root = session.root_path

        # 1. Normal relative path
        p1 = wm.validate_path(ws_id, "test.py")
        assert os.path.normcase(p1) == os.path.normcase(os.path.join(root, "test.py"))
        print("[PASS] Normal relative path validated", flush=True)

        # 2. Leading slash path (like /test.py)
        p2 = wm.validate_path(ws_id, "/test.py")
        assert os.path.normcase(p2) == os.path.normcase(os.path.join(root, "test.py"))
        print("[PASS] Leading slash path /test.py normalized within workspace", flush=True)

        # 3. Leading backslash path (like \test.py)
        p3 = wm.validate_path(ws_id, "\\test.py")
        assert os.path.normcase(p3) == os.path.normcase(os.path.join(root, "test.py"))
        print("[PASS] Leading backslash path \\test.py normalized within workspace", flush=True)

        # 4. Out-of-bounds relative path traversal
        try:
            wm.validate_path(ws_id, "../outside.py")
            assert False, "Should have raised PermissionError for ../outside.py"
        except PermissionError:
            print("[PASS] Directory traversal ../outside.py correctly rejected", flush=True)

        # 5. Out-of-bounds absolute path outside workspace
        other_dir = tempfile.gettempdir()
        try:
            wm.validate_path(ws_id, os.path.join(other_dir, "malicious.py"))
            if not os.path.commonpath([tmpdir, os.path.join(other_dir, "malicious.py")]).startswith(tmpdir):
                assert False, "Should have rejected absolute path outside workspace"
        except PermissionError:
            print("[PASS] Absolute path outside workspace correctly rejected", flush=True)

        # 6. Session lookup by root_path
        lookup = wm.get_session(root)
        assert lookup is not None and lookup.workspace_id == ws_id
        print("[PASS] Session lookup by root_path succeeded", flush=True)


def test_tool_executor():
    test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(test_engine)
    TestSession = sessionmaker(bind=test_engine)
    db = TestSession()

    executor = ToolExecutor()
    try:
        # 1. No workspace loaded -> failure
        res_fail = executor.read_file(db, "task-1", "test.py", workspace_id=None)
        assert res_fail["status"] == "error"
        assert "No active workspace" in res_fail["message"] or "Security Alert" in res_fail["message"] or "Denied" in res_fail["message"]
        print("[PASS] ToolExecutor cleanly fails when no workspace loaded", flush=True)

        with tempfile.TemporaryDirectory() as tmpdir:
            # Register session in global workspace_manager
            sess = workspace_manager.open_session(tmpdir, "ws-exec-test", "exec_proj")

            # 2. Workspace provided via workspace_root
            res_write = executor.write_file(
                db,
                "task-2",
                "/test.py",
                "my_list = [1, 2, 3, 4, 5]\n",
                workspace_id=tmpdir
            )
            assert res_write["status"] == "success", f"write_file failed: {res_write}"
            print("[PASS] ToolExecutor write_file succeeded with workspace_root", flush=True)

            # 3. Read back with leading slash
            res_read = executor.read_file(
                db,
                "task-3",
                "/test.py",
                workspace_id=tmpdir
            )
            assert res_read["status"] == "success", f"read_file failed: {res_read}"
            assert "[1, 2, 3, 4, 5]" in res_read["content"]
            print("[PASS] ToolExecutor read_file succeeded with content verification", flush=True)

            # 4. Security rejection in ToolExecutor
            res_sec = executor.write_file(
                db,
                "task-4",
                "../../escape.txt",
                "bad",
                workspace_id=tmpdir
            )
            assert res_sec["status"] == "error"
            assert "Denied" in res_sec["message"] or "bounds" in res_sec["message"]
            print("[PASS] ToolExecutor security containment enforced", flush=True)
    finally:
        db.close()


if __name__ == "__main__":
    test_workspace_manager_path_validation()
    test_tool_executor()
    print("\nALL BACKEND WORKSPACE AND TOOL TESTS PASSED SUCCESSFULLY!", flush=True)
