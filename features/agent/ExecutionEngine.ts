import type { FileNode } from '../../types';
import type {
  AgentTask,
  PlannerOutput,
  ContextBuildOutput,
  PromptObject,
  ValidationResult,
  ReviewData,
  ProviderName,
  TimelineStage,
  AgentStateName,
  ToolResult,
  AgentObservation,
} from './types';
import { TIMELINE_STAGES } from './types';
import { Planner } from './Planner';
import { RepositorySearch } from './RepositorySearch';
import { ContextBuilder } from './ContextBuilder';
import { PromptBuilder } from './PromptBuilder';
import { ResponseValidator } from './ResponseValidator';
import { ReviewEngine } from './ReviewEngine';
import { getProvider } from './providers';
import { agentLogger } from './AgentLogger';

export interface PipelineResult {
  taskId: string;
  plannerOutput: PlannerOutput;
  contextOutput: ContextBuildOutput;
  promptObject: PromptObject;
  validationResult: ValidationResult;
  reviewData: ReviewData;
  timeline: TimelineStage[];
  modifiedFiles: string[];
  iterations: number;
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
  answer?: string;
  mode?: 'ask' | 'agent';
}

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api')
  : 'http://127.0.0.1:8000/api';

const MAX_AGENT_ITERATIONS = 5;

// ─── ExecutionEngine ──────────────────────────────────────────
export class ExecutionEngine {
  private planner = new Planner();
  private repoSearch = new RepositorySearch();
  private contextBuilder = new ContextBuilder();
  private promptBuilder = new PromptBuilder();
  private validator = new ResponseValidator();
  private reviewEngine = new ReviewEngine();

  private activeTaskId: string | null = null;
  private isCancelled = false;
  private onTimelineUpdate?: (stages: TimelineStage[]) => void;

  // Allow external callback for Zustand updates
  setTimelineUpdateCallback(fn: (stages: TimelineStage[]) => void): void {
    this.onTimelineUpdate = fn;
  }

  private buildInitialTimeline(): TimelineStage[] {
    return [
      { id: 'planning', label: 'Planning Task', status: 'pending' },
      { id: 'analyzing', label: 'Inspecting Project', status: 'pending' },
      { id: 'executing', label: 'Executing Tools', status: 'pending' },
      { id: 'testing', label: 'Running Build/Test', status: 'pending' },
      { id: 'reviewing', label: 'Reviewing & Diff', status: 'pending' },
      { id: 'completed', label: 'Task Complete', status: 'pending' },
    ];
  }

  private updateStage(
    stages: TimelineStage[],
    id: string,
    status: TimelineStage['status'],
    detail?: string,
    label?: string
  ): TimelineStage[] {
    const existing = stages.find((s) => s.id === id);
    let updated: TimelineStage[];

    if (!existing) {
      updated = [
        ...stages,
        {
          id,
          label: label || id,
          status,
          detail,
          startedAt: status === 'running' ? Date.now() : undefined,
          completedAt: status === 'completed' || status === 'failed' ? Date.now() : undefined,
        },
      ];
    } else {
      updated = stages.map((s): TimelineStage => {
        if (s.id === id) {
          const now = Date.now();
          return {
            ...s,
            status,
            detail: detail !== undefined ? detail : s.detail,
            label: label || s.label,
            startedAt: status === 'running' ? (s.startedAt || now) : s.startedAt,
            completedAt: status === 'completed' || status === 'failed' ? now : s.completedAt,
            durationMs: s.startedAt && (status === 'completed' || status === 'failed')
              ? now - s.startedAt
              : undefined,
          };
        }
        return s;
      });
    }

    this.onTimelineUpdate?.(updated);
    return updated;
  }

  private logWorkspaceContext(data: {
    workspaceId?: string;
    workspaceRoot?: string;
    activeFile?: string | null;
    requestedFile?: string;
    toolName?: string;
    toolResult?: string;
    finalAgentState?: string;
    [key: string]: any;
  }) {
    console.log('[AGENT_WORKSPACE_CONTEXT]', JSON.stringify(data));
    agentLogger.info(
      'WorkspaceContext',
      `${data.toolName ? `Tool: ${data.toolName}` : `State: ${data.finalAgentState}`}`,
      data
    );
  }

  // ─── Tool Execution Client ─────────────────────────────────
  async executeToolCall(
    taskId: string,
    toolName: string,
    args: Record<string, any>,
    workspaceId?: string,
    workspaceRoot?: string,
    activeFile?: string | null
  ): Promise<ToolResult> {
    const t0 = Date.now();
    try {
      if (toolName === 'read_file') {
        const res = await fetch(`${API_BASE}/tools/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            path: args.path,
            workspace_id: workspaceId,
            workspace_root: workspaceRoot
          })
        });
        const data = await res.json();
        const success = res.ok && data.status === 'success';
        const result: ToolResult = success
          ? { success: true, tool: 'read_file', path: args.path, result: data.content, durationMs: Date.now() - t0 }
          : { success: false, tool: 'read_file', path: args.path, error: data.detail || data.message || 'Read failed', durationMs: Date.now() - t0 };

        this.logWorkspaceContext({
          workspaceId,
          workspaceRoot,
          activeFile,
          requestedFile: args.path,
          toolName: 'read_file',
          toolResult: success ? 'SUCCESS' : (result.error || 'FAILED'),
          finalAgentState: 'in_progress'
        });
        return result;
      }

      if (toolName === 'write_file') {
        const res = await fetch(`${API_BASE}/tools/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            path: args.path,
            content: args.content ?? '',
            workspace_id: workspaceId,
            workspace_root: workspaceRoot
          })
        });
        const data = await res.json();
        const success = res.ok && data.status === 'success';
        const result: ToolResult = success
          ? { success: true, tool: 'write_file', path: args.path, backup: data.backup, durationMs: Date.now() - t0 }
          : { success: false, tool: 'write_file', path: args.path, error: data.detail || data.message || 'Write failed', durationMs: Date.now() - t0 };

        this.logWorkspaceContext({
          workspaceId,
          workspaceRoot,
          activeFile,
          requestedFile: args.path,
          toolName: 'write_file',
          toolResult: success ? 'SUCCESS' : (result.error || 'FAILED'),
          finalAgentState: 'in_progress'
        });
        return result;
      }

      if (toolName === 'delete_file') {
        const res = await fetch(`${API_BASE}/tools/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            path: args.path,
            workspace_id: workspaceId,
            workspace_root: workspaceRoot
          })
        });
        const data = await res.json();
        const success = res.ok && data.status === 'success';
        const result: ToolResult = success
          ? { success: true, tool: 'delete_file', path: args.path, backup: data.backup, durationMs: Date.now() - t0 }
          : { success: false, tool: 'delete_file', path: args.path, error: data.detail || data.message || 'Delete failed', durationMs: Date.now() - t0 };

        this.logWorkspaceContext({
          workspaceId,
          workspaceRoot,
          activeFile,
          requestedFile: args.path,
          toolName: 'delete_file',
          toolResult: success ? 'SUCCESS' : (result.error || 'FAILED'),
          finalAgentState: 'in_progress'
        });
        return result;
      }

      if (toolName === 'rename_file') {
        const res = await fetch(`${API_BASE}/tools/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            old_path: args.old_path,
            new_path: args.new_path,
            workspace_id: workspaceId,
            workspace_root: workspaceRoot
          })
        });
        const data = await res.json();
        const success = res.ok && data.status === 'success';
        const result: ToolResult = success
          ? { success: true, tool: 'rename_file', result: data, durationMs: Date.now() - t0 }
          : { success: false, tool: 'rename_file', error: data.detail || data.message || 'Rename failed', durationMs: Date.now() - t0 };

        this.logWorkspaceContext({
          workspaceId,
          workspaceRoot,
          activeFile,
          requestedFile: args.old_path,
          toolName: 'rename_file',
          toolResult: success ? 'SUCCESS' : (result.error || 'FAILED'),
          finalAgentState: 'in_progress'
        });
        return result;
      }

      if (toolName === 'search_files') {
        const res = await fetch(`${API_BASE}/tools/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            query: args.query || '',
            workspace_id: workspaceId,
            workspace_root: workspaceRoot
          })
        });
        const data = await res.json();
        const success = res.ok && data.status === 'success';
        const result: ToolResult = success
          ? { success: true, tool: 'search_files', result: data.results, durationMs: Date.now() - t0 }
          : { success: false, tool: 'search_files', error: data.detail || data.message || 'Search failed', durationMs: Date.now() - t0 };

        this.logWorkspaceContext({
          workspaceId,
          workspaceRoot,
          activeFile,
          requestedFile: args.query || '',
          toolName: 'search_files',
          toolResult: success ? 'SUCCESS' : (result.error || 'FAILED'),
          finalAgentState: 'in_progress'
        });
        return result;
      }

      if (toolName === 'run_terminal') {
        const res = await fetch(`${API_BASE}/tools/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            command: args.command,
            workspace_id: workspaceId,
            workspace_root: workspaceRoot
          })
        });
        const data = await res.json();
        const isOk = res.ok && data.status === 'success';
        const result: ToolResult = {
          success: isOk,
          tool: 'run_terminal',
          command: args.command,
          exit_code: data.exit_code,
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          error: isOk ? undefined : (data.detail || data.message || data.stderr || 'Command failed'),
          durationMs: Date.now() - t0
        };

        this.logWorkspaceContext({
          workspaceId,
          workspaceRoot,
          activeFile,
          requestedFile: args.command || '',
          toolName: 'run_terminal',
          toolResult: isOk ? 'SUCCESS' : (result.error || 'FAILED'),
          finalAgentState: 'in_progress'
        });
        return result;
      }

      if (toolName === 'git_status') {
        const res = await fetch(`${API_BASE}/tools/git`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            action: 'status',
            params: [],
            workspace_id: workspaceId,
            workspace_root: workspaceRoot
          })
        });
        const data = await res.json();
        const isOk = res.ok && data.status === 'success';
        const result: ToolResult = {
          success: isOk,
          tool: 'git_status',
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          error: isOk ? undefined : (data.detail || data.message),
          durationMs: Date.now() - t0
        };

        this.logWorkspaceContext({
          workspaceId,
          workspaceRoot,
          activeFile,
          requestedFile: '',
          toolName: 'git_status',
          toolResult: isOk ? 'SUCCESS' : (result.error || 'FAILED'),
          finalAgentState: 'in_progress'
        });
        return result;
      }

      if (toolName === 'git_diff') {
        const res = await fetch(`${API_BASE}/tools/git`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            action: 'diff',
            params: [],
            workspace_id: workspaceId,
            workspace_root: workspaceRoot
          })
        });
        const data = await res.json();
        const isOk = res.ok && data.status === 'success';
        const result: ToolResult = {
          success: isOk,
          tool: 'git_diff',
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          error: isOk ? undefined : (data.detail || data.message),
          durationMs: Date.now() - t0
        };

        this.logWorkspaceContext({
          workspaceId,
          workspaceRoot,
          activeFile,
          requestedFile: '',
          toolName: 'git_diff',
          toolResult: isOk ? 'SUCCESS' : (result.error || 'FAILED'),
          finalAgentState: 'in_progress'
        });
        return result;
      }

      return {
        success: false,
        tool: toolName,
        error: `Security Alert: Unknown tool '${toolName}' is not allowed.`,
        durationMs: Date.now() - t0
      };
    } catch (err: any) {
      return {
        success: false,
        tool: toolName,
        error: `Tool execution error: ${err.message || String(err)}`,
        durationMs: Date.now() - t0
      };
    }
  }

  // ─── Inspect Project & Discover Validation Command ──────────
  async discoverValidationCommand(taskId: string, workspaceId?: string, workspaceRoot?: string): Promise<string | null> {
    try {
      const readPkg = await this.executeToolCall(taskId, 'read_file', { path: 'package.json' }, workspaceId, workspaceRoot);
      if (readPkg.success && typeof readPkg.result === 'string') {
        const pkg = JSON.parse(readPkg.result);
        const scripts = pkg.scripts || {};
        if (scripts.build) return 'npm run build';
        if (scripts.test) return 'npm test';
        if (scripts.lint) return 'npm run lint';
      }
    } catch {
      // ignore
    }
    return null;
  }

  // ─── Main Run Pipeline with Backend AgentRunner & Live WS Streaming ───
  async run(
    task: AgentTask,
    fileTree: FileNode[],
    options: {
      provider?: ProviderName;
      backendProvider?: string;
      model?: string;
      mode?: 'ask' | 'agent';
      workspaceName?: string;
      workspaceId?: string;
      workspaceRoot?: string;
      activeFile?: string | null;
      memoryFacts?: string[];
      projectRules?: string[];
      maxIterations?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<PipelineResult> {
    this.activeTaskId = task.id;
    this.isCancelled = false;
    const mode = options.mode || 'agent';
    let timeline = this.buildInitialTimeline();
    this.onTimelineUpdate?.(timeline);

    agentLogger.info('ExecutionEngine', `Starting ${mode.toUpperCase()} task: ${task.id}`, {
      prompt: task.prompt,
      provider: options.backendProvider || options.provider,
      model: options.model,
      workspaceId: options.workspaceId,
      workspaceRoot: options.workspaceRoot,
      activeFile: options.activeFile,
    });

    this.repoSearch.setFileTree(fileTree);
    this.contextBuilder.setFileTree(fileTree);
    if (options.workspaceName) this.promptBuilder.setWorkspaceName(options.workspaceName);
    if (options.workspaceRoot) this.promptBuilder.setWorkspaceRoot(options.workspaceRoot);
    if (options.activeFile) this.promptBuilder.setActiveFile(options.activeFile);
    if (options.memoryFacts) this.promptBuilder.setMemoryFacts(options.memoryFacts);
    if (options.projectRules) this.promptBuilder.setProjectRules(options.projectRules);

    const plannerOutput = await this.planner.analyze(task, options.activeFile);
    const searchOutput = await this.repoSearch.searchForPrompt(task.prompt);
    const contextOutput = await this.contextBuilder.build(task.id, searchOutput, plannerOutput);
    const promptObj = this.promptBuilder.build(task.id, task.prompt, contextOutput, plannerOutput);

    let agentSocket: WebSocket | null = null;
    if (typeof window !== 'undefined') {
      try {
        const rawHost = window.location.hostname || '127.0.0.1';
        const wsHost = rawHost === 'localhost' ? '127.0.0.1' : rawHost;
        agentSocket = new WebSocket(`ws://${wsHost}:8000/ws/agent/${task.id}`);
        agentSocket.onmessage = (event) => {
          try {
            const evt = JSON.parse(event.data);
            const stageId = (evt.id || evt.label || 'executing').toLowerCase();
            const status = evt.status === 'failed' ? 'failed' : evt.status === 'running' ? 'running' : 'completed';
            timeline = this.updateStage(timeline, stageId, status, evt.detail || '', evt.label || stageId);
            agentLogger.info(evt.label || 'Agent', evt.detail || status, evt);
          } catch {
            // Ignore malformed WS frame
          }
        };
      } catch {
        // Fallback cleanly if WS fails
      }
    }

    const requestTimeoutMs = 125_000;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(new Error('Agent execution request timed out after 125s.')), requestTimeoutMs);
    const onExternalAbort = () => timeoutController.abort(options.signal?.reason || new Error('Cancelled by user'));
    if (options.signal) {
      if (options.signal.aborted) {
        onExternalAbort();
      } else {
        options.signal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      const res = await fetch(`${API_BASE}/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: timeoutController.signal,
        body: JSON.stringify({
          task_id: task.id,
          prompt: task.prompt,
          workspace_id: options.workspaceId,
          workspace_root: options.workspaceRoot,
          active_file: options.activeFile,
          provider: options.backendProvider || options.provider,
          model: options.model,
          mode,
          max_iterations: options.maxIterations || 8,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errDetail = data?.detail || data?.error || `HTTP ${res.status}`;
        throw new Error(errDetail);
      }

      if (agentSocket && (agentSocket.readyState === WebSocket.OPEN || agentSocket.readyState === WebSocket.CONNECTING)) {
        agentSocket.close(1000, 'Task finished');
      }

      if (data.status === 'failed') {
        const errMsg = data.error || 'Agent execution failed';
        timeline = this.updateStage(timeline, 'completed', 'failed', errMsg, 'Task Failed');
        agentLogger.error('ExecutionEngine', `Task ${task.id} failed: ${errMsg}`);
        this.activeTaskId = null;
        return {
          taskId: task.id,
          status: 'failed',
          error: errMsg,
          mode,
          plannerOutput,
          contextOutput,
          promptObject: promptObj,
          validationResult: { isValid: false, issues: [{ type: 'provider_error', message: errMsg, severity: 'error' }], validatedAt: Date.now() },
          reviewData: {
            taskId: task.id,
            summary: errMsg,
            filesChanged: [],
            warnings: [{ id: 'err-0', severity: 'error', message: errMsg }],
            complexity: plannerOutput.estimatedComplexity,
            reviewNotes: errMsg,
            requiresHumanApproval: false,
            reviewedAt: Date.now(),
          },
          timeline,
          modifiedFiles: [],
          iterations: data.iterations || 0,
        };
      }

      const filesChanged = (data.files_changed || []) as ReviewData['filesChanged'];
      const reviewData: ReviewData = {
        taskId: task.id,
        summary: data.summary || data.review?.summary || `Completed ${mode} task.`,
        answer: data.answer || data.summary || '',
        mode,
        filesChanged,
        warnings: data.review?.warnings || [],
        complexity: data.review?.complexity || plannerOutput.estimatedComplexity,
        reviewNotes: data.review?.reviewNotes || `Iterations: ${data.iterations || 1}`,
        requiresHumanApproval: filesChanged.length > 0,
        reviewedAt: Date.now(),
      };

      if (filesChanged.length > 0) {
        const firstChanged = filesChanged[0];
        try {
          const { useGitStore } = await import('../../stores/useGitStore');
          const gitStore = useGitStore.getState();
          await gitStore.fetchGitStatus();
          useGitStore.setState({
            activeDiff: {
              path: firstChanged.filePath,
              status: firstChanged.changeType === 'created' ? 'A' : 'M',
              headContent: firstChanged.originalContent || '',
              workingContent: firstChanged.modifiedContent || '',
              staged: false,
            },
            isDiffActive: true,
          });
        } catch (err) {
          console.error('Error syncing diff panel:', err);
        }

        try {
          const { useWorkspaceStore } = await import('../../stores/useWorkspaceStore');
          const ws = useWorkspaceStore.getState();
          await ws.triggerRescan();
          await ws.fetchTree();
          await ws.openTab(firstChanged.filePath);
          await ws.selectFile(firstChanged.filePath);
        } catch (err) {
          console.error('Error syncing workspace store:', err);
        }
      }

      const finalStatus: PipelineResult['status'] =
        data.status === 'cancelled' ? 'cancelled' : 'completed';

      timeline = this.updateStage(timeline, 'completed', 'completed', reviewData.summary);
      this.activeTaskId = null;

      return {
        taskId: task.id,
        status: finalStatus,
        answer: data.answer,
        mode,
        plannerOutput,
        contextOutput,
        promptObject: promptObj,
        validationResult: { isValid: true, issues: [], validatedAt: Date.now() },
        reviewData,
        timeline,
        modifiedFiles: data.modified_files || [],
        iterations: data.iterations || 1,
      };
    } catch (err) {
      if (agentSocket && (agentSocket.readyState === WebSocket.OPEN || agentSocket.readyState === WebSocket.CONNECTING)) {
        agentSocket.close(1000, 'Task failed');
      }
      if (this.isCancelled || options.signal?.aborted) {
        const cancelMsg = 'Task cancelled by user.';
        timeline = this.updateStage(timeline, 'completed', 'failed', cancelMsg, 'Task Cancelled');
        this.activeTaskId = null;
        return {
          taskId: task.id,
          status: 'cancelled',
          error: cancelMsg,
          mode,
          plannerOutput,
          contextOutput,
          promptObject: promptObj,
          validationResult: { isValid: false, issues: [{ type: 'cancelled', message: cancelMsg, severity: 'warning' }], validatedAt: Date.now() },
          reviewData: {
            taskId: task.id,
            summary: cancelMsg,
            filesChanged: [],
            warnings: [],
            complexity: plannerOutput.estimatedComplexity,
            reviewNotes: cancelMsg,
            requiresHumanApproval: false,
            reviewedAt: Date.now(),
          },
          timeline,
          modifiedFiles: [],
          iterations: 0,
        };
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      timeline = this.updateStage(timeline, 'completed', 'failed', errMsg, 'Task Failed');
      this.activeTaskId = null;
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  cancel(): void {
    if (this.activeTaskId) {
      const tid = this.activeTaskId;
      this.isCancelled = true;
      agentLogger.warn('ExecutionEngine', `Task ${tid} cancelled by user.`);
      void fetch(`${API_BASE}/agent/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: tid }),
      }).catch(() => {});
      this.activeTaskId = null;
    }
  }
}

// Singleton instance for use across the app
export const executionEngine = new ExecutionEngine();
