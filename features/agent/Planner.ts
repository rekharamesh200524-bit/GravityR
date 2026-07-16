import type {
  AgentTask,
  PlannerOutput,
  ExecutionStep,
  ComplexityLevel,
  RiskLevel,
} from './types';

// ─── Keyword-based heuristics ────────────────────────────────
const COMPLEXITY_KEYWORDS: Record<ComplexityLevel, string[]> = {
  trivial:      ['rename', 'typo', 'comment', 'format', 'indent'],
  simple:       ['add', 'update', 'fix', 'change', 'color', 'style', 'label'],
  moderate:     ['create', 'implement', 'integrate', 'refactor', 'migrate'],
  complex:      ['dashboard', 'auth', 'payment', 'api', 'database', 'system', 'architecture'],
  'very-complex': ['real-time', 'multi-tenant', 'distributed', 'machine learning', 'blockchain'],
};

const RISK_KEYWORDS: Record<RiskLevel, string[]> = {
  low:      ['comment', 'rename', 'style', 'format'],
  medium:   ['update', 'fix', 'add', 'change', 'create'],
  high:     ['delete', 'remove', 'migration', 'schema', 'auth', 'payment'],
  critical: ['deploy', 'production', 'drop', 'truncate', 'credentials', 'secret'],
};

function estimateComplexity(prompt: string): ComplexityLevel {
  const lower = prompt.toLowerCase();
  for (const [level, keywords] of Object.entries(COMPLEXITY_KEYWORDS) as [ComplexityLevel, string[]][]) {
    if (keywords.some((k) => lower.includes(k))) return level;
  }
  return 'moderate';
}

function estimateRisk(prompt: string): RiskLevel {
  const lower = prompt.toLowerCase();
  const levels: RiskLevel[] = ['critical', 'high', 'medium', 'low'];
  for (const level of levels) {
    if (RISK_KEYWORDS[level].some((k) => lower.includes(k))) return level;
  }
  return 'medium';
}

function estimateTokens(complexity: ComplexityLevel): number {
  const map: Record<ComplexityLevel, number> = {
    trivial:       500,
    simple:       1500,
    moderate:     4000,
    complex:      8000,
    'very-complex': 16000,
  };
  return map[complexity];
}

function buildExecutionSteps(prompt: string, complexity: ComplexityLevel): ExecutionStep[] {
  const lower = prompt.toLowerCase();
  const steps: Omit<ExecutionStep, 'id' | 'order' | 'status'>[] = [
    { title: 'Parse user intent', description: 'Extract goals, constraints, and scope from the prompt.' },
    { title: 'Search repository', description: 'Locate files and symbols relevant to the request.' },
    { title: 'Build context', description: 'Assemble source files, imports, and dependencies.' },
    { title: 'Construct prompt', description: 'Combine context, memory, and workspace rules into the final prompt.' },
    { title: 'Execute with model', description: 'Send the structured prompt to the active model provider.' },
    { title: 'Validate response', description: 'Check model output for completeness and correctness.' },
    { title: 'Generate diffs', description: 'Produce file-level change summaries for review.' },
  ];

  if (lower.includes('test') || lower.includes('spec')) {
    steps.push({ title: 'Generate tests', description: 'Create or update test files for the changed code.' });
  }

  if (complexity === 'complex' || complexity === 'very-complex') {
    steps.push({ title: 'Architecture review', description: 'Verify structural impact and cross-module compatibility.' });
  }

  return steps.map((s, i) => ({
    id: `step-${i + 1}`,
    order: i + 1,
    status: 'pending',
    ...s,
  }));
}

function guessAffectedFiles(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const files: string[] = [];

  const FILE_HINTS: [string, string][] = [
    ['dashboard', 'app/dashboard/page.tsx'],
    ['login', 'features/auth/LoginPage.tsx'],
    ['auth', 'features/auth/AuthService.ts'],
    ['api', 'app/api/route.ts'],
    ['layout', 'app/layout.tsx'],
    ['settings', 'features/settings/SettingsPage.tsx'],
    ['sidebar', 'components/layout/ActivityBar.tsx'],
    ['menu', 'components/layout/MenuBar.tsx'],
    ['terminal', 'features/terminal/BottomPanel.tsx'],
    ['editor', 'features/diff/DiffPanel.tsx'],
    ['explorer', 'features/explorer/FileExplorer.tsx'],
  ];

  for (const [keyword, file] of FILE_HINTS) {
    if (lower.includes(keyword)) files.push(file);
  }

  return files.length > 0 ? files : ['(to be determined by Repository Search)'];
}

// ─── Planner ────────────────────────────────────────────────
export class Planner {
  async analyze(task: AgentTask): Promise<PlannerOutput> {
    const start = Date.now();

    // Simulate planner thinking time
    await new Promise<void>((r) => setTimeout(r, 120));

    const complexity = estimateComplexity(task.prompt);
    const riskLevel = estimateRisk(task.prompt);
    const estimatedTokens = estimateTokens(complexity);
    const executionSteps = buildExecutionSteps(task.prompt, complexity);
    const affectedFiles = guessAffectedFiles(task.prompt);

    const warnings: string[] = [];
    if (riskLevel === 'high') warnings.push('This task touches high-risk areas. Proceed carefully.');
    if (riskLevel === 'critical') warnings.push('⚠ Critical operation detected. Human review mandatory before execution.');
    if (estimatedTokens > 8000) warnings.push('Estimated context may approach model token limits.');

    return {
      taskId: task.id,
      summary: `Analyzed: "${task.prompt.slice(0, 80)}${task.prompt.length > 80 ? '…' : ''}"`,
      executionSteps,
      estimatedComplexity: complexity,
      estimatedTokens,
      riskLevel,
      affectedFiles,
      warnings,
      dependencies: [],
      generatedAt: start,
    };
  }
}
