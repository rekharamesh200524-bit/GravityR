import type {
  ContextBuildOutput,
  PlannerOutput,
  PromptObject,
  PromptSection,
  AgentObservation,
} from './types';

const CHARS_PER_TOKEN = 4;
const DEFAULT_MODEL = 'gemini-2.5-pro';

function countTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── System prompt template ───────────────────────────────────
const SYSTEM_PROMPT = `You are GravityX, an expert autonomous AI coding agent embedded inside a professional IDE.

Your workflow:
USER PROMPT → PLAN → INSPECT FILES → DECIDE ACTION → EXECUTE TOOL → OBSERVE RESULT → TEST → FIX ERRORS → COMPLETE

Available Tools:
1. \`read_file\`: { "path": string } - Read file content
2. \`write_file\`: { "path": string, "content": string } - Create or overwrite a file with full content
3. \`delete_file\`: { "path": string } - Delete a file
4. \`rename_file\`: { "old_path": string, "new_path": string } - Move or rename a file
5. \`search_files\`: { "query": string } - Search text inside project workspace files
6. \`run_terminal\`: { "command": string } - Run build, test, lint or package commands (npm, npx, node, yarn, python, git)
7. \`git_status\`: {} - View git working tree status
8. \`git_diff\`: {} - View git diff of changes

When you need to execute a tool, respond with valid JSON:
{
  "type": "tool_call",
  "tool": "read_file" | "write_file" | "delete_file" | "rename_file" | "search_files" | "run_terminal" | "git_status" | "git_diff",
  "arguments": { ... }
}

When all changes are made and verified:
{
  "type": "complete",
  "summary": "...",
  "review_notes": "..."
}

If you need user clarification:
{
  "type": "clarification",
  "question": "..."
}`;

// ─── PromptBuilder ────────────────────────────────────────────
export class PromptBuilder {
  private workspaceName = 'GravityX Workspace';
  private workspaceRoot?: string;
  private activeFile?: string | null;
  private projectRules: string[] = [];
  private memoryFacts: string[] = [];

  setWorkspaceName(name: string): void {
    this.workspaceName = name;
  }

  setWorkspaceRoot(root?: string): void {
    this.workspaceRoot = root;
  }

  setActiveFile(file?: string | null): void {
    this.activeFile = file;
  }

  setProjectRules(rules: string[]): void {
    this.projectRules = rules;
  }

  setMemoryFacts(facts: string[]): void {
    this.memoryFacts = facts;
  }

  build(
    taskId: string,
    userPrompt: string,
    contextOutput: ContextBuildOutput,
    plannerOutput: PlannerOutput,
    observations: AgentObservation[] = [],
  ): PromptObject {
    const sections: PromptSection[] = [];

    // ─── System section
    sections.push({
      role: 'system',
      label: 'System Instructions',
      content: SYSTEM_PROMPT,
      tokenCount: countTokens(SYSTEM_PROMPT),
    });

    // ─── Workspace metadata section
    const workspaceMeta = [
      `Workspace Name: ${this.workspaceName}`,
      `Workspace Root: ${this.workspaceRoot || 'Not specified'}`,
      `Active Open File: ${this.activeFile || 'None'}`,
      `Complexity: ${plannerOutput.estimatedComplexity}`,
      `Risk Level: ${plannerOutput.riskLevel}`,
      `Files in context: ${contextOutput.files.length}`,
      `Estimated tokens: ${contextOutput.totalTokenEstimate}`,
    ].join('\n');

    sections.push({
      role: 'context',
      label: 'Workspace Metadata',
      content: workspaceMeta,
      tokenCount: countTokens(workspaceMeta),
    });

    // ─── Project rules section
    if (this.projectRules.length > 0) {
      const rulesContent = this.projectRules.map((r, i) => `${i + 1}. ${r}`).join('\n');
      sections.push({
        role: 'context',
        label: 'Project Rules',
        content: rulesContent,
        tokenCount: countTokens(rulesContent),
      });
    }

    // ─── Memory facts section
    if (this.memoryFacts.length > 0) {
      const memContent = this.memoryFacts.map((f) => `• ${f}`).join('\n');
      sections.push({
        role: 'context',
        label: 'Workspace Memory',
        content: memContent,
        tokenCount: countTokens(memContent),
      });
    }

    // ─── Context files section
    for (const file of contextOutput.files.filter((f) => f.included)) {
      const fileSection = `// FILE: ${file.filePath}\n// Language: ${file.language}\n\n${file.content}`;
      sections.push({
        role: 'context',
        label: `File: ${file.fileName}`,
        content: fileSection,
        tokenCount: countTokens(fileSection),
      });
    }

    // ─── Execution plan section
    const planContent = [
      `Task Summary: ${plannerOutput.summary}`,
      `Steps:`,
      ...plannerOutput.executionSteps.map((s) => `  ${s.order}. ${s.title}: ${s.description}`),
      plannerOutput.warnings.length > 0
        ? `Warnings:\n${plannerOutput.warnings.map((w) => `  ⚠ ${w}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n');

    sections.push({
      role: 'context',
      label: 'Execution Plan',
      content: planContent,
      tokenCount: countTokens(planContent),
    });

    // ─── Observations / Tool results history section
    if (observations.length > 0) {
      const obsContent = observations.map((o, idx) => {
        const status = o.result.success ? 'SUCCESS' : 'FAILED';
        return `[Step ${idx + 1}] Tool: ${o.tool}\nArguments: ${JSON.stringify(o.arguments)}\nStatus: ${status}\nResult: ${JSON.stringify(o.result.result || o.result.error || o.result.stdout || o.result.stderr || '')}`;
      }).join('\n\n');
      sections.push({
        role: 'context',
        label: 'Tool Execution History & Observations',
        content: obsContent,
        tokenCount: countTokens(obsContent),
      });
    }

    // ─── User instruction section
    sections.push({
      role: 'user',
      label: 'User Instruction',
      content: userPrompt,
      tokenCount: countTokens(userPrompt),
    });

    const totalTokens = sections.reduce((acc, s) => acc + s.tokenCount, 0);

    return {
      taskId,
      sections,
      totalTokens,
      model: DEFAULT_MODEL,
      temperature: 0.2,
      maxOutputTokens: 8192,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      generatedAt: Date.now(),
    };
  }
}
