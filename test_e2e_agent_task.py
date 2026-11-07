import os
import shutil
import json
import unittest
from backend.database.connection import SessionLocal, engine, Base
from backend.services.agent_runner import AgentRunner
from backend.services.tool_executor import ToolExecutor
from backend.services.review_engine import ReviewEngine
from backend.services.workspace_manager import workspace_manager


def run_e2e_test():
    print("==================================================")
    print("      RUNNING GRAVITY-R E2E CODING AGENT TEST     ")
    print("==================================================")

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    test_dir = os.path.abspath("test_e2e_workspace")

    if os.path.exists(test_dir):
        shutil.rmtree(test_dir, ignore_errors=True)
    os.makedirs(os.path.join(test_dir, "app"), exist_ok=True)
    os.makedirs(os.path.join(test_dir, "components"), exist_ok=True)

    # 1. Create package.json with validation command
    with open(os.path.join(test_dir, "package.json"), "w", encoding="utf-8") as f:
        json.dump({
            "name": "gravityx-app",
            "version": "0.1.0",
            "scripts": {
                "build": "node validate_build.js"
            }
        }, f, indent=2)

    # Create build validator script: checks if app/login/page.tsx exists and is valid syntax
    with open(os.path.join(test_dir, "validate_build.js"), "w", encoding="utf-8") as f:
        f.write("""
const fs = require('fs');
const path = './app/login/page.tsx';
if (!fs.existsSync(path)) {
    console.error("Build Error: Login page app/login/page.tsx not found");
    process.exit(1);
}
const content = fs.readFileSync(path, 'utf8');
if (content.includes("SYNTAX_ERROR")) {
    console.error("Build Error: Syntax error detected in app/login/page.tsx: unexpected token");
    process.exit(1);
}
if (!content.includes('type="email"') || !content.includes('type="password"')) {
    console.error("Build Error: Missing required email or password fields");
    process.exit(1);
}
console.log("Build Success: All checks passed!");
process.exit(0);
""")

    # Open workspace session
    session = workspace_manager.open_session(
        root_path=test_dir,
        workspace_id="e2e-agent-ws",
        project_name="gravityx-e2e-app"
    )

    tool_executor = ToolExecutor(workspace_path=test_dir)
    review_engine = ReviewEngine(workspace_path=test_dir)
    runner = AgentRunner(tool_executor=tool_executor, review_engine=review_engine, max_iterations=5)

    prompt = (
        "Create a simple login page in the existing frontend with email and password fields "
        "and a login button. Follow the project's existing styling and routing conventions. "
        "Run the appropriate validation/build command and fix any errors."
    )

    print(f"\n[USER PROMPT]: {prompt}")

    # Simulated realistic AI Agent steps:
    # 1. Read package.json to inspect dependencies and build script
    # 2. Write initial login page (with intentional syntax error to test error recovery)
    # 3. AI analyzes build error output and fixes app/login/page.tsx
    # 4. Completion
    mock_agent_steps = [
        # Step 1: Inspect package.json
        {
            "action": "tool_call",
            "tool": "read_file",
            "arguments": {"path": "package.json"}
        },
        # Step 2: Write initial code (with initial flaw to demonstrate auto-fix)
        {
            "action": "tool_call",
            "tool": "write_file",
            "arguments": {
                "path": "app/login/page.tsx",
                "content": """import React from 'react';

export default function LoginPage() {
  SYNTAX_ERROR_FLAG_HERE;
  return (
    <div className="login-container">
      <h2>Login to GravityR</h2>
      <input type="email" placeholder="Email" />
      <input type="password" placeholder="Password" />
      <button type="submit">Sign In</button>
    </div>
  );
}
"""
            }
        },
        # Step 3: AI Fix step upon receiving the validation failure
        {
            "action": "tool_call",
            "tool": "write_file",
            "arguments": {
                "path": "app/login/page.tsx",
                "content": """'use client';

import React, { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Logging in:', email);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070912] text-slate-100 p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-2xl backdrop-blur-xl">
        <h2 className="text-2xl font-bold text-center mb-6 bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
          Sign in to GravityR
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all shadow-lg shadow-violet-600/30"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
"""
            }
        },
        # Step 4: Completion
        {
            "action": "complete",
            "summary": "Created production-quality LoginPage with email, password fields and login button conforming to project styling."
        }
    ]

    # Run the Agent Tool Loop
    result = runner.run(
        task_id="e2e-task-login-1",
        prompt=prompt,
        workspace_id="e2e-agent-ws",
        mock_steps=mock_agent_steps,
        db=db
    )

    print("\n[AGENT TIMELINE STAGES]:")
    for stage in result["timeline"]:
        print(f"  [{stage['status'].upper()}] {stage['label']}: {stage.get('detail', '')}")

    print("\n[OBSERVATIONS]:")
    for obs in result["observations"]:
        st = "SUCCESS" if obs.get("success") else "FAILED"
        print(f"  Tool: {obs.get('tool')} -> {st}")

    print(f"\n[FINAL STATUS]: {result['status']}")
    print(f"[MODIFIED FILES]: {result['modified_files']}")
    print(f"[DIFF FILES]: {[f['filePath'] for f in result['files_changed']]}")

    # Assertions
    login_page_path = os.path.join(test_dir, "app", "login", "page.tsx")
    assert os.path.exists(login_page_path), "File app/login/page.tsx was NOT created on disk!"

    with open(login_page_path, "r", encoding="utf-8") as f:
        final_code = f.read()

    assert "SYNTAX_ERROR" not in final_code, "Syntax error was not fixed by the agent!"
    assert 'type="email"' in final_code, "Missing email field!"
    assert 'type="password"' in final_code, "Missing password field!"
    assert 'Sign In' in final_code, "Missing Sign In button!"

    # Verify backup exists
    backups_dir = os.path.join(test_dir, ".gravityx_backups")
    assert os.path.exists(backups_dir), "No backups directory created!"
    backups = os.listdir(backups_dir)
    assert len(backups) > 0, "No backup files found!"
    print(f"[BACKUPS CREATED]: {backups}")

    # Verify diff was generated
    assert len(result["files_changed"]) > 0, "No file diffs generated in review!"
    diff_item = result["files_changed"][0]
    print(f"[DIFF DELTA]: +{diff_item['linesAdded']} / -{diff_item['linesRemoved']} lines for {diff_item['filePath']}")
    assert diff_item["linesAdded"] > 20, "Diff lines added should be substantial for new login page!"

    print("\n==================================================")
    print("   [OK] E2E AGENT CODING LOOP TEST COMPLETED SUCCESSFULLY   ")
    print("==================================================")

    db.close()
    workspace_manager.close_session("e2e-agent-ws")
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    run_e2e_test()
