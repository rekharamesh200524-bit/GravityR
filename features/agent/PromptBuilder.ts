import type {
  ContextBuildOutput,
  PlannerOutput,
  PromptObject,
  PromptSection,
} from './types';

const CHARS_PER_TOKEN = 4;
const DEFAULT_MODEL = 'gemini-2.5-pro';

function countTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── System prompt template ───────────────────────────────────
const SYSTEM_PROMPT = `You are GravityX, an expert AI software engineer embedded inside a professional IDE.

Your responsibilities:
1. Analyze the user's coding request carefully.
2. Produce precise, production-quality code changes.
3. Respect the existing architecture, coding style, and conventions.
4. Only modify what is necessary — do not over-engineer.
5. Always provide complete file contents for modified files.
6. Include TypeScript types, error handling, and comments where appropriate.
7. Flag any risks, breaking changes, or ambiguities in a "review_notes" field.

Output format must be valid JSON:
{
  "summary": "...",
  "files": [
    { "path": "...", "content": "..." }
  ],
  "review_notes": "...",
  "warnings": ["..."]
}`;

// ─── PromptBuilder ────────────────────────────────────────────
export class PromptBuilder {
  private workspaceName = 'GravityX Workspace';
  private projectRules: string[] = [];
  private memoryFacts: string[] = [];

  setWorkspaceName(name: string): void {
    this.workspaceName = name;
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
      `Workspace: ${this.workspaceName}`,
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
