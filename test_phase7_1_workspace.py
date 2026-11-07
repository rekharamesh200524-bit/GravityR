import os
import shutil
import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000/api"

# Create two clean separate test project folders
PROJECT_A = os.path.abspath("D:\\GravityX-TestProjectA")
PROJECT_B = os.path.abspath("D:\\GravityX-TestProjectB")

def setup_directories():
    if os.path.exists(PROJECT_A):
        shutil.rmtree(PROJECT_A, ignore_errors=True)
    if os.path.exists(PROJECT_B):
        shutil.rmtree(PROJECT_B, ignore_errors=True)

    os.makedirs(os.path.join(PROJECT_A, "src"), exist_ok=True)
    os.makedirs(os.path.join(PROJECT_B, "src"), exist_ok=True)

    with open(os.path.join(PROJECT_A, "package.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps({"name": "test-project-a", "version": "1.0.0"}, indent=2))

    with open(os.path.join(PROJECT_B, "package.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps({"name": "test-project-b", "version": "1.0.0"}, indent=2))

def run_tests():
    print("==================================================")
    print("   RUNNING PHASE 7.1 WORKSPACE INTEGRATION TESTS  ")
    print("==================================================")

    setup_directories()

    # 1. Open Project A
    print("\n--- Test 1: Opening Project A ---")
    resp = requests.post(f"{BASE_URL}/workspace/open", json={"path": PROJECT_A})
    assert resp.status_code == 200, f"Failed to open Project A: {resp.text}"
    data_a = resp.json()
    wid_a = data_a["workspace_id"]
    print(f"Project A opened successfully. workspace_id: {wid_a}, root: {data_a['project']['path']}")

    # Check GET /workspace/{workspace_id}
    session_resp = requests.get(f"{BASE_URL}/workspace/{wid_a}")
    assert session_resp.status_code == 200, f"Failed to get session {wid_a}: {session_resp.text}"
    print(f"Session info verified for {wid_a}: {session_resp.json()['workspace']['root_path']}")

    # 2. Write file in Project A using tool_write
    print("\n--- Test 2: Write TestA.jsx in Project A ---")
    w_resp = requests.post(f"{BASE_URL}/tools/write", json={
        "task_id": "task-a1",
        "path": "src/TestA.jsx",
        "content": "// Project A Component\nexport const TestA = () => <div>A</div>;\n",
        "workspace_id": wid_a
    })
    assert w_resp.status_code == 200, f"Write failed: {w_resp.text}"
    assert os.path.exists(os.path.join(PROJECT_A, "src", "TestA.jsx")), "TestA.jsx was not created in Project A!"
    print("Successfully created src/TestA.jsx in Project A!")

    # 3. Read file in Project A using tool_read
    print("\n--- Test 3: Read src/TestA.jsx in Project A ---")
    r_resp = requests.post(f"{BASE_URL}/tools/read", json={
        "task_id": "task-a2",
        "path": "src/TestA.jsx",
        "workspace_id": wid_a
    })
    assert r_resp.status_code == 200, f"Read failed: {r_resp.text}"
    assert "Project A Component" in r_resp.json()["content"], "Read content mismatch!"
    print("Successfully read src/TestA.jsx content!")

    # 4. Search in Project A using tool_search
    print("\n--- Test 4: Search in Project A ---")
    s_resp = requests.post(f"{BASE_URL}/tools/search", json={
        "task_id": "task-a3",
        "query": "Project A Component",
        "workspace_id": wid_a
    })
    assert s_resp.status_code == 200, f"Search failed: {s_resp.text}"
    assert len(s_resp.json()["results"]) > 0, "Search yielded no results in Project A!"
    print(f"Search found match: {s_resp.json()['results'][0]['filePath']}")

    # 5. Path Security Tests (Traversal & Out-of-bounds attempts)
    print("\n--- Test 5: Path Security Traversal & Boundary Rejection ---")
    
    # Traversal attempt 1: ../file.txt
    bad_resp1 = requests.post(f"{BASE_URL}/tools/read", json={
        "task_id": "task-bad1",
        "path": "../secret.txt",
        "workspace_id": wid_a
    })
    assert bad_resp1.status_code in (403, 404, 500), f"Expected security error, got {bad_resp1.status_code}"
    print(f"Blocked relative traversal `../secret.txt`: {bad_resp1.json().get('detail')}")

    # Traversal attempt 2: ..\..\secret.txt
    bad_resp2 = requests.post(f"{BASE_URL}/tools/write", json={
        "task_id": "task-bad2",
        "path": "..\\..\\secret.txt",
        "content": "hacked",
        "workspace_id": wid_a
    })
    assert bad_resp2.status_code in (403, 500), f"Expected security error, got {bad_resp2.status_code}"
    print(f"Blocked relative traversal `..\\..\\secret.txt`: {bad_resp2.json().get('detail')}")

    # Absolute path out of workspace: C:\Windows\System32\drivers\etc\hosts
    bad_resp3 = requests.post(f"{BASE_URL}/tools/read", json={
        "task_id": "task-bad3",
        "path": "C:\\Windows\\System32\\drivers\\etc\\hosts",
        "workspace_id": wid_a
    })
    assert bad_resp3.status_code in (403, 500), f"Expected security error, got {bad_resp3.status_code}"
    print(f"Blocked out-of-bounds absolute path: {bad_resp3.json().get('detail')}")

    # 6. Switch to Project B
    print("\n--- Test 6: Switch to Project B ---")
    resp_b = requests.post(f"{BASE_URL}/workspace/open", json={"path": PROJECT_B})
    assert resp_b.status_code == 200, f"Failed to open Project B: {resp_b.text}"
    data_b = resp_b.json()
    wid_b = data_b["workspace_id"]
    print(f"Project B opened successfully. workspace_id: {wid_b}, root: {data_b['project']['path']}")

    # Ask tool_write to create TestB.jsx in Project B
    w_resp_b = requests.post(f"{BASE_URL}/tools/write", json={
        "task_id": "task-b1",
        "path": "TestB.jsx",
        "content": "// Project B Component\nexport const TestB = () => <div>B</div>;\n",
        "workspace_id": wid_b
    })
    assert w_resp_b.status_code == 200, f"Write TestB failed: {w_resp_b.text}"
    
    # Verification: TestB.jsx must exist in Project B and MUST NOT exist in Project A!
    assert os.path.exists(os.path.join(PROJECT_B, "TestB.jsx")), "TestB.jsx missing in Project B!"
    assert not os.path.exists(os.path.join(PROJECT_A, "TestB.jsx")), "SECURITY BUG: TestB.jsx was incorrectly created inside Project A!"
    print("Project switching isolation VERIFIED: TestB.jsx created in Project B only, not Project A!")

    # 7. Agent Context Verification
    print("\n--- Test 7: Verify AI Agent Context for Project B ---")
    agent_ctx_resp = requests.post(f"{BASE_URL}/agent/context", json={
        "task_id": "task-agent-ctx",
        "prompt": "List files",
        "workspace_id": wid_b,
        "file_paths": ["TestB.jsx", "package.json"]
    })
    assert agent_ctx_resp.status_code == 200, f"Agent context failed: {agent_ctx_resp.text}"
    agent_data = agent_ctx_resp.json()
    assert agent_data["workspace"]["workspace_id"] == wid_b, "Agent context workspace_id mismatch!"
    assert agent_data["workspace"]["root_path"] == PROJECT_B, "Agent context root_path mismatch!"
    print(f"Agent context verified for Project B: {agent_data['workspace']}")

    # 8. Terminal execution CWD check
    print("\n--- Test 8: Terminal tool execution CWD check ---")
    term_resp = requests.post(f"{BASE_URL}/tools/terminal", json={
        "task_id": "task-term",
        "command": "python -c \"import os; print(os.getcwd())\"",
        "workspace_id": wid_b
    })
    assert term_resp.status_code == 200, f"Terminal execution failed: {term_resp.text}"
    term_output = term_resp.json().get("stdout", "").strip()
    print(f"Terminal execution CWD output: '{term_output}'")
    assert PROJECT_B.lower() in term_output.lower(), f"Terminal tool did not run inside Project B! Output: {term_output}"
    print("Terminal execution CWD verified!")

    # 9. Clean close
    print("\n--- Test 9: Close sessions ---")
    close_resp = requests.post(f"{BASE_URL}/workspace/close", json={"workspace_id": wid_b})
    assert close_resp.status_code == 200, f"Close workspace failed: {close_resp.text}"
    print("Workspace closed successfully.")

    print("\n==================================================")
    print("   ALL PHASE 7.1 TESTS PASSED SUCCESSFULLY!       ")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
