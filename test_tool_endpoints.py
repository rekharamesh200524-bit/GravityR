import requests
import json

base_url = "http://127.0.0.1:8000/api"

print("--- Testing /review ---")
review_payload = {
    "task_id": "test-task-1",
    "prompt": "Create layout component",
    "ai_response": json.dumps({
        "summary": "Implement dashboard component",
        "confidence": 0.99,
        "warnings": [],
        "review": "All changes look clean.",
        "files": [
            {"path": "package.json", "content": '{\n  "dependencies": {\n    "next": "13.0.0"\n  }\n}'}
        ]
    })
}
try:
    r = requests.post(f"{base_url}/review", json=review_payload)
    print("Status:", r.status_code)
    print("Requires Approval:", r.json().get("requiresHumanApproval"))
    print("Complexity:", r.json().get("complexity"))
except Exception as e:
    print("Error:", e)

print("\n--- Testing /tools/write ---")
write_payload = {
    "task_id": "test-task-1",
    "path": "temp_write_test.py",
    "content": "print('Written safely!')\n"
}
try:
    r = requests.post(f"{base_url}/tools/write", json=write_payload)
    print("Status:", r.status_code)
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print("Error:", e)

print("\n--- Testing /tools/read ---")
read_payload = {
    "task_id": "test-task-1",
    "path": "temp_write_test.py"
}
try:
    r = requests.post(f"{base_url}/tools/read", json=read_payload)
    print("Status:", r.status_code)
    print("Content:", repr(r.json().get("content")))
except Exception as e:
    print("Error:", e)

print("\n--- Testing /tools/search ---")
try:
    r = requests.post(f"{base_url}/tools/search", json={"task_id": "test-task-1", "query": "safely"})
    print("Status:", r.status_code)
    print("Results:", r.json().get("results"))
except Exception as e:
    print("Error:", e)

print("\n--- Testing /tools/terminal ---")
try:
    r = requests.post(f"{base_url}/tools/terminal", json={"task_id": "test-task-1", "command": "git status"})
    print("Status:", r.status_code)
    print("Stdout:", r.json().get("stdout")[:150] if r.json().get("stdout") else "")
except Exception as e:
    print("Error:", e)

print("\n--- Testing /execution/logs ---")
try:
    r = requests.get(f"{base_url}/execution/logs", params={"task_id": "test-task-1"})
    print("Status:", r.status_code)
    print(json.dumps(r.json()[:3], indent=2))
except Exception as e:
    print("Error:", e)
