// ============================================================
// GravityX AI Agent Framework — Core Domain Types
// ============================================================

export type AgentStateName =
  | 'PLANNING'
  | 'ANALYZING'
  | 'READING'
  | 'EDITING'
  | 'EXECUTING'
  | 'TESTING'
  | 'FIXING'
  | 'REVIEWING'
  | 'WAITING_FOR_APPROVAL'
  | 'COMPLETED'
  | 'FAILED';

export type TaskStatus =
  | 'queued'
  | 'planning'
  | 'searching'
  | 'building-context'
  | 'building-prompt'
  | 'waiting-for-model'
  | 'validating'
  | 'reviewing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | AgentStateName;

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'delete_file'
  | 'rename_file'
  | 'search_files'
  | 'run_terminal'
  | 'git_status'
  | 'git_diff';

export interface ToolCall {
  type: 'tool_call';
  tool: ToolName | string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  tool: string;
  path?: string;
  result?: any;
  error?: string;
  command?: string;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  backup?: string;
}

export interface AgentObservation {
  tool: string;
  arguments: Record<string, any>;
  result: ToolResult;
  timestamp: number;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex';

export type TimelineStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type QueuePriority = 'low' | 'normal' | 'high' | 'urgent';

// ─── Agent Task ─────────────────────────────────────────────
export interface AgentTask {
  id: string;
  prompt: string;
  status: TaskStatus;
  priority: QueuePriority;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
}

// ─── Planner Output ─────────────────────────────────────────
export interface ExecutionStep {
  id: string;
  order: number;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
}

export interface PlannerOutput {
  taskId: string;
  summary: string;
  executionSteps: ExecutionStep[];
  estimatedComplexity: ComplexityLevel;
  estimatedTokens: number;
  riskLevel: RiskLevel;
  affectedFiles: string[];
  warnings: string[];
  dependencies: string[];
  generatedAt: number;
}

// ─── Repository Search ─────────────────────────────────────
export type SearchType = 'filename' | 'folder' | 'extension' | 'keyword' | 'symbol';

export interface SearchQuery {
  term: string;
  types: SearchType[];
}

export interface SearchResult {
  filePath: string;
  fileName: string;
  matchType: SearchType;
  confidence: number; // 0–1
  reason: string;
  snippet?: string;
  lineNumber?: number;
}

export interface RepositorySearchOutput {
  query: SearchQuery;
  results: SearchResult[];
  totalScanned: number;
  durationMs: number;
}

// ─── Context Builder ────────────────────────────────────────
export interface ContextFile {
  filePath: string;
  fileName: string;
  language: string;
  content: string;
  sizeBytes: number;
  confidence: number;
  reason: string;
  included: boolean;
}

export interface ContextBuildOutput {
  taskId: string;
  files: ContextFile[];
  totalTokenEstimate: number;
  truncated: boolean;
  generatedAt: number;
}

// ─── Prompt Builder ─────────────────────────────────────────
export interface PromptSection {
  role: 'system' | 'user' | 'context' | 'instruction';
  label: string;
  content: string;
  tokenCount: number;
}

export interface PromptObject {
  taskId: string;
  sections: PromptSection[];
  totalTokens: number;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  systemPrompt: string;
  userPrompt: string;
  generatedAt: number;
}

// ─── Response Validator ─────────────────────────────────────
export type ValidationIssueType =
  | 'empty-response'
  | 'malformed-json'
  | 'missing-code'
  | 'missing-file-paths'
  | 'unsupported-operation'
  | 'token-limit-exceeded';

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'warning' | 'error';
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  validatedAt: number;
}

// ─── Review Engine ──────────────────────────────────────────
export interface ReviewWarning {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  filePath?: string;
  lineNumber?: number;
}

export interface FileDiffSummary {
  filePath: string;
  linesAdded: number;
  linesRemoved: number;
  changeType: 'created' | 'modified' | 'deleted' | 'renamed';
  originalContent?: string;
  modifiedContent?: string;
}

export interface ReviewData {
  taskId: string;
  summary: string;
  filesChanged: FileDiffSummary[];
  warnings: ReviewWarning[];
  complexity: ComplexityLevel;
  reviewNotes: string;
  requiresHumanApproval: boolean;
  reviewedAt: number;
  confidence?: number;
}

// ─── Timeline ────────────────────────────────────────────────
export interface TimelineStage {
  id: string;
  label: string;
  status: TimelineStageStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  detail?: string;
}

export const TIMELINE_STAGES: Pick<TimelineStage, 'id' | 'label'>[] = [
  { id: 'planning', label: 'Planning Task' },
  { id: 'searching', label: 'Searching Repository' },
  { id: 'building-context', label: 'Building Context' },
  { id: 'building-prompt', label: 'Building Prompt' },
  { id: 'waiting-for-model', label: 'Waiting for Model' },
  { id: 'validating', label: 'Validating Response' },
  { id: 'reviewing', label: 'Reviewing Changes' },
  { id: 'ready', label: 'Ready for Review' },
];

// ─── Agent Queue ─────────────────────────────────────────────
export interface QueueItem {
  task: AgentTask;
  position: number;
}

// ─── Agent Logs ──────────────────────────────────────────────
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AgentLogEntry {
  id: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// ─── Model Provider Interface ────────────────────────────────
export type ProviderName = 'google' | 'openai' | 'claude' | 'ollama' | 'runpod';

export interface GenerateRequest {
  prompt: PromptObject;
  taskId: string;
  stream: boolean;
}

export interface GenerateResponse {
  taskId: string;
  content: string;
  provider: ProviderName;
  model: string;
  tokensUsed: number;
  durationMs: number;
  finishReason: 'stop' | 'length' | 'error' | 'cancelled';
}

export interface ProviderHealth {
  provider: ProviderName;
  isOnline: boolean;
  latencyMs?: number;
  checkedAt: number;
}

export interface IModelProvider {
  readonly name: ProviderName;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: GenerateRequest, onChunk: (chunk: string) => void): Promise<GenerateResponse>;
  cancel(taskId: string): Promise<void>;
  health(): Promise<ProviderHealth>;
}
