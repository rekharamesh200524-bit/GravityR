import { create } from 'zustand';
import type {
  AgentTask,
  PlannerOutput,
  ContextBuildOutput,
  PromptObject,
  ReviewData,
  ValidationResult,
  TimelineStage,
  QueueItem,
  AgentLogEntry,
  ProviderName,
  QueuePriority,
} from '../features/agent/types';
import { TIMELINE_STAGES } from '../features/agent/types';
import { executionEngine } from '../features/agent/ExecutionEngine';
import { agentLogger } from '../features/agent/AgentLogger';

export interface OptimizedContextFile {
  path: string;
  filePath?: string;
  fileName?: string;
  content: string;
  language: string;
  original_size?: number;
  optimized_size?: number;
}

// ─── Gateway concrete types ───────────────────────────────
export interface GatewayProvider {
  name: string;
  displayName: string;
  status: string;
  isDefault: boolean;
  metadata: Record<string, string>;
}

export interface GatewayModel {
  id: string;
  displayName: string;
  providerSupport: string[];
  parameterSize: string;
  contextWindow: number;
  supportsStreaming: boolean;
  codingOptimized: boolean;
  status: string;
}

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api')
  : 'http://127.0.0.1:8000/api';

// ─── State Interface ──────────────────────────────────────────
interface AgentState {
  // Active task & timeline
  currentTask: AgentTask | null;
  timeline: TimelineStage[];

  // Queue
  queue: QueueItem[];

  // Pipeline outputs
  plannerOutput: PlannerOutput | null;
  contextOutput: ContextBuildOutput | null;
  promptObject: PromptObject | null;
  validationResult: ValidationResult | null;
  reviewData: ReviewData | null;

  // Settings & Logs
  activeProvider: ProviderName;
  agentMode: 'ask' | 'agent';
  setAgentMode: (mode: 'ask' | 'agent') => void;
  logs: AgentLogEntry[];

  // Gateway status extensions
  gatewayStatus: 'online' | 'offline';
  currentProvider: string | null;
  currentModel: string | null;
  providerStatus: string | null;
  providerHealth: Record<string, unknown> | null;
  latencyMs: number | null;
  capabilities: string[];
  streamingSupport: boolean;
  connectionStatus: 'Connecting' | 'Sending Context' | 'Waiting' | 'Generating' | 'Receiving Tokens' | 'Completed' | null;
  availableProviders: GatewayProvider[];
  availableModels: GatewayModel[];
  optimizedPrompt: {
    system_prompt: string;
    user_prompt: string;
    context_files: OptimizedContextFile[];
    compression_summary: string;
    metrics: {
      prompt_tokens: number;
      context_tokens: number;
      history_tokens: number;
      current_tokens: number;
      max_tokens: number;
      remaining_tokens: number;
      estimated_cost_usd: number;
      overflow: boolean;
      requires_compression: boolean;
      compression_ratio_pct: number;
      optimized_char_count: number;
    };
  } | null;

  workspaceWarning: string | null;
  clearWorkspaceWarning: () => void;

  // Actions
  submitTask: (prompt: string, priority?: QueuePriority) => Promise<void>;
  processQueue: () => Promise<void>;
  cancelTask: (taskId: string) => void;
  clearQueue: () => void;
  setProvider: (provider: ProviderName) => void;
  clearLogs: () => void;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string) => Promise<void>;
  approveFile: (taskId: string, filePath: string) => Promise<void>;
  rejectFile: (taskId: string, filePath: string) => Promise<void>;

  // Gateway Actions
  fetchGatewayHealth: () => Promise<void>;
  fetchProviders: () => Promise<void>;
  fetchModels: () => Promise<void>;
  selectGatewayProvider: (provider: string) => Promise<void>;
  selectGatewayModel: (model: string) => Promise<void>;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initialTimeline(): TimelineStage[] {
  return TIMELINE_STAGES.map((s) => ({ ...s, status: 'pending' as const }));
}

const taskAbortControllers = new Map<string, AbortController>();
let isQueueProcessing = false;

const PRIORITY_RANK: Record<QueuePriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export const useAgentStore = create<AgentState>((set, get) => {
  // Wire ExecutionEngine timeline updates into Zustand
  executionEngine.setTimelineUpdateCallback((stages) => {
    set({ timeline: stages });
  });

  // Wire AgentLogger into Zustand
  agentLogger.onLog((entry) => {
    set((state) => ({
      logs: [...state.logs.slice(-499), entry],
    }));
  });

  return {
    currentTask: null,
    timeline: initialTimeline(),
    queue: [],
    plannerOutput: null,
    contextOutput: null,
    promptObject: null,
    validationResult: null,
    reviewData: null,
    activeProvider: 'google',
    agentMode: 'agent',
    setAgentMode: (mode) => set({ agentMode: mode }),
    logs: [],

    // Gateway states default
    gatewayStatus: 'offline',
    currentProvider: 'google_gemini',
    currentModel: 'gemini-2.5-flash',
    providerStatus: 'unknown',
    providerHealth: null,
    latencyMs: null,
    capabilities: ['code-generation', 'completion', 'refactoring'],
    streamingSupport: true,
    connectionStatus: null,
    availableProviders: [],
    availableModels: [],
    optimizedPrompt: null,
    workspaceWarning: null,
    clearWorkspaceWarning: () => set({ workspaceWarning: null }),

    submitTask: async (prompt: string, priority: QueuePriority = 'normal') => {
      // 1. Detect whether a valid workspace is loaded BEFORE starting an Agent Task
      const { useWorkspaceStore } = await import('./useWorkspaceStore');
      const workspaceState = useWorkspaceStore.getState();

      const workspaceRoot = workspaceState.workspaceRoot || workspaceState.currentProject?.path || null;
      const workspaceId = workspaceState.activeWorkspaceId || workspaceState.currentProject?.id || null;
      const hasWorkspace = Boolean(workspaceRoot && (workspaceId || workspaceRoot));

      if (!hasWorkspace) {
        const warningMsg = 'Please open a workspace before running an agent task.';
        set({ workspaceWarning: warningMsg });
        agentLogger.warn('AgentStore', `Execution halted: ${warningMsg}`);
        return;
      }

      // Clear any prior workspace warning
      set({ workspaceWarning: null });

      const task: AgentTask = {
        id: genId(),
        prompt,
        status: 'queued',
        priority,
        createdAt: Date.now(),
      };

      set((state) => ({
        queue: [...state.queue, { task, position: state.queue.length + 1 }],
      }));

      await get().processQueue();
    },

    processQueue: async () => {
      if (isQueueProcessing) return;
      isQueueProcessing = true;

      try {
        while (true) {
          const queuedItems = get().queue.filter((q) => q.task.status === 'queued');
          if (queuedItems.length === 0) break;

          queuedItems.sort(
            (a, b) =>
              (PRIORITY_RANK[a.task.priority] ?? 2) - (PRIORITY_RANK[b.task.priority] ?? 2) ||
              a.task.createdAt - b.task.createdAt,
          );
          const nextItem = queuedItems[0];
          const task = nextItem.task;
          const startedAt = Date.now();
          const controller = new AbortController();
          taskAbortControllers.set(task.id, controller);

          // Transition both currentTask and queue item from 'queued' -> 'planning' (displayed as Running)
          set((state) => ({
            currentTask: { ...task, status: 'planning', startedAt },
            queue: state.queue.map((q) =>
              q.task.id === task.id
                ? { ...q, task: { ...q.task, status: 'planning', startedAt } }
                : q
            ),
            timeline: initialTimeline(),
            plannerOutput: null,
            contextOutput: null,
            promptObject: null,
            validationResult: null,
            reviewData: null,
            connectionStatus: 'Sending Context',
            optimizedPrompt: null,
          }));

          try {
            const [{ useWorkspaceStore }, { useMemoryStore }] = await Promise.all([
              import('./useWorkspaceStore'),
              import('./useMemoryStore'),
            ]);
            const workspaceState = useWorkspaceStore.getState();
            const memoryState = useMemoryStore.getState();
            const workspaceRoot = workspaceState.workspaceRoot || workspaceState.currentProject?.path || null;
            const workspaceId = workspaceState.activeWorkspaceId || workspaceState.currentProject?.id || null;
            const activeFile = workspaceState.selectedFilePath || workspaceState.activeTab || null;

            // Refresh health in the background without blocking execution
            void get().fetchGatewayHealth();

            if (controller.signal.aborted) {
              throw new Error('Task cancelled by user.');
            }

            set({ connectionStatus: 'Waiting' });
            const startExecutionTime = Date.now();

            const result = await executionEngine.run(
              { ...task, status: 'planning', startedAt },
              workspaceState.fileTree,
              {
                provider: get().activeProvider,
                backendProvider: get().currentProvider || undefined,
                model: get().currentModel || undefined,
                mode: get().agentMode,
                workspaceName: workspaceState.currentProject?.name ?? 'GravityX Workspace',
                workspaceId: workspaceId || undefined,
                workspaceRoot: workspaceRoot || undefined,
                activeFile: activeFile || undefined,
                memoryFacts: memoryState.memories.map((m) => m.content),
                projectRules: [
                  'Use TypeScript strict mode.',
                  'Follow the existing file structure.',
                  'Preserve all existing functionality.',
                  'Use Tailwind CSS for styling.',
                ],
                signal: controller.signal,
              },
            );

            const latencyVal = Date.now() - startExecutionTime;
            const wasCancelled =
              controller.signal.aborted ||
              result.status === 'cancelled' ||
              get().queue.find((q) => q.task.id === task.id)?.task.status === 'cancelled';

            const finalStatus: AgentTask['status'] = wasCancelled
              ? 'cancelled'
              : result.status === 'completed'
                ? 'completed'
                : 'failed';
            const finalError =
              finalStatus === 'failed' ? (result.error || 'Task execution failed') : undefined;

            set((state) => ({
              connectionStatus: finalStatus === 'cancelled' ? null : 'Completed',
              latencyMs: latencyVal,
              plannerOutput: result.plannerOutput,
              contextOutput: result.contextOutput,
              promptObject: result.promptObject,
              validationResult: result.validationResult,
              reviewData: result.reviewData,
              timeline: result.timeline,
              currentTask:
                state.currentTask?.id === task.id
                  ? {
                      ...state.currentTask,
                      status: finalStatus,
                      completedAt: Date.now(),
                      errorMessage: finalError,
                    }
                  : state.currentTask,
              queue: state.queue.map((q) =>
                q.task.id === task.id
                  ? {
                      ...q,
                      task: {
                        ...q.task,
                        status: finalStatus,
                        completedAt: Date.now(),
                        errorMessage: finalError,
                      },
                    }
                  : q
              ),
            }));
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const wasCancelled =
              controller.signal.aborted ||
              get().queue.find((q) => q.task.id === task.id)?.task.status === 'cancelled';
            const errStatus: AgentTask['status'] = wasCancelled ? 'cancelled' : 'failed';

            if (!wasCancelled) {
              agentLogger.error('ExecutionEngine', `Task ${task.id} failed: ${errorMessage}`);
            }

            set((state) => ({
              connectionStatus: null,
              currentTask:
                state.currentTask?.id === task.id
                  ? {
                      ...state.currentTask,
                      status: errStatus,
                      completedAt: Date.now(),
                      errorMessage: wasCancelled ? undefined : errorMessage,
                    }
                  : state.currentTask,
              queue: state.queue.map((q) =>
                q.task.id === task.id
                  ? {
                      ...q,
                      task: {
                        ...q.task,
                        status: errStatus,
                        completedAt: Date.now(),
                        errorMessage: wasCancelled ? undefined : errorMessage,
                      },
                    }
                  : q
              ),
            }));
          } finally {
            taskAbortControllers.delete(task.id);
          }
        }
      } finally {
        isQueueProcessing = false;
      }
    },

    cancelTask: (taskId: string) => {
      const controller = taskAbortControllers.get(taskId);
      if (controller) {
        controller.abort();
        taskAbortControllers.delete(taskId);
      }
      executionEngine.cancel();
      set((state) => ({
        connectionStatus: state.currentTask?.id === taskId ? null : state.connectionStatus,
        currentTask: state.currentTask?.id === taskId
          ? { ...state.currentTask, status: 'cancelled', completedAt: Date.now() }
          : state.currentTask,
        queue: state.queue.map((q) =>
          q.task.id === taskId
            ? { ...q, task: { ...q.task, status: 'cancelled', completedAt: Date.now() } }
            : q
        ),
      }));
    },

    clearQueue: () => {
      set({ queue: [] });
    },

    setProvider: (provider: ProviderName) => {
      set({ activeProvider: provider });
      // Keep selected default synced with active Provider
      const map: Record<ProviderName, string> = {
        google: 'google_gemini',
        ollama: 'ollama',
        runpod: 'runpod',
        openai: 'openai',
        claude: 'claude',
      };
      void get().selectGatewayProvider(map[provider] || provider);
    },

    clearLogs: () => {
      agentLogger.clear();
      set({ logs: [] });
    },

    // ─── Gateway actions ───────────────────────────────────────
    fetchGatewayHealth: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(`${API_BASE}/gateway/health`, { signal: controller.signal });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const currentName = data.current_provider;
        const currentStatus = (data.providers as Record<string, unknown>[] | undefined)?.find((p) => (p as Record<string, unknown>).provider === currentName) as Record<string, unknown> | undefined;

        set({
          gatewayStatus: data.status === 'online' || data.status === 'degraded' ? 'online' : 'offline',
          currentProvider: currentName,
          providerStatus: currentStatus
            ? String(currentStatus.provider_status || currentStatus.status || 'offline')
            : 'offline',
          providerHealth: currentStatus || null,
          latencyMs: currentStatus ? (currentStatus.latency_ms as number) : null,
        });
      } catch {
        set({ gatewayStatus: 'offline', providerStatus: 'offline', providerHealth: null });
      } finally {
        clearTimeout(timeoutId);
      }
    },

    fetchProviders: async () => {
      try {
        const res = await fetch(`${API_BASE}/gateway/providers`);
        if (res.ok) {
          const list = await res.json();
          set({ availableProviders: list });
        }
      } catch {
        // Ignored
      }
    },

    fetchModels: async () => {
      try {
        const res = await fetch(`${API_BASE}/gateway/models`);
        if (res.ok) {
          const list = await res.json();
          set({ availableModels: list });
        }
      } catch {
        // Ignored
      }
    },

    selectGatewayProvider: async (provider: string) => {
      try {
        const res = await fetch(`${API_BASE}/gateway/provider/select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider })
        });
        if (res.ok) {
          set({ currentProvider: provider });
          void get().fetchGatewayHealth();
          // Update models lists depending on support rules
          void get().fetchModels();
        }
      } catch {
        // Ignored
      }
    },

    selectGatewayModel: async (model: string) => {
      try {
        const res = await fetch(`${API_BASE}/gateway/model/select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model })
        });
        if (res.ok) {
          set({ currentModel: model });
        }
      } catch {
        // Ignored
      }
    },

    approveTask: async (taskId: string) => {
      const state = get();
      if (!state.reviewData) return;
      
      set({ connectionStatus: 'Waiting' });
      
      try {
        // 1. Post to /approve
        const appRes = await fetch(`${API_BASE}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            prompt: state.currentTask?.prompt || "",
            ai_response: state.promptObject?.userPrompt || "",
            files_changed: state.reviewData.filesChanged
          })
        });

        if (!appRes.ok) {
          throw new Error("Backend approval failed.");
        }

        // 2. Write or delete file contents on disk using safe tools
        for (const file of state.reviewData.filesChanged) {
          if (file.changeType === 'deleted') {
            const delRes = await fetch(`${API_BASE}/tools/delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task_id: taskId,
                path: file.filePath
              })
            });
            if (!delRes.ok) {
              throw new Error(`Failed to delete file ${file.filePath}`);
            }
          } else {
            const writeRes = await fetch(`${API_BASE}/tools/write`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task_id: taskId,
                path: file.filePath,
                content: file.modifiedContent || ""
              })
            });
            if (!writeRes.ok) {
              throw new Error(`Failed to write file ${file.filePath}`);
            }
          }
        }

        // 3. Stage and commit changes to Git
        const filesToStage = state.reviewData.filesChanged.map(f => f.filePath);
        if (filesToStage.length > 0) {
          await fetch(`${API_BASE}/tools/git`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task_id: taskId,
              action: 'stage',
              params: filesToStage
            })
          });

          await fetch(`${API_BASE}/tools/git`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task_id: taskId,
              action: 'commit',
              params: [`Auto commit: ${state.currentTask?.prompt || "Task modifications"}`]
            })
          });
        }

        // 4. Update task completion status
        if (state.currentTask) {
          set({
            currentTask: { ...state.currentTask, status: 'completed' },
            connectionStatus: 'Completed'
          });
        }

        // 5. Trigger workspace refresh
        const { useWorkspaceStore } = await import('./useWorkspaceStore');
        void useWorkspaceStore.getState().triggerRescan();

      } catch (err) {
        console.error(err);
        if (state.currentTask) {
          set({
            currentTask: { ...state.currentTask, status: 'failed' },
            connectionStatus: null
          });
        }
      }
    },

    rejectTask: async (taskId: string) => {
      const state = get();
      try {
        const { useWorkspaceStore } = await import('./useWorkspaceStore');
        const ws = useWorkspaceStore.getState();
        await fetch(`${API_BASE}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            prompt: state.currentTask?.prompt || "",
            files_changed: state.reviewData?.filesChanged || [],
            workspace_id: ws.activeWorkspaceId || ws.currentProject?.id,
            workspace_root: ws.workspaceRoot || ws.currentProject?.path,
          })
        });
        await ws.triggerRescan();
        await ws.fetchTree();
        const { useGitStore } = await import('./useGitStore');
        await useGitStore.getState().fetchGitStatus();
        useGitStore.setState({ isDiffActive: false, activeDiff: null });
      } catch (e) {
        console.error(e);
      }

      set((s) => ({
        reviewData: s.reviewData
          ? {
              ...s.reviewData,
              filesChanged: s.reviewData.filesChanged.map((f) => ({ ...f, reviewStatus: 'rejected' })),
            }
          : null,
        currentTask: s.currentTask ? { ...s.currentTask, status: 'cancelled' } : null,
        connectionStatus: null,
      }));
    },

    approveFile: async (taskId: string, filePath: string) => {
      const state = get();
      const target = state.reviewData?.filesChanged.find((f) => f.filePath === filePath);
      if (!target) return;
      try {
        const { useWorkspaceStore } = await import('./useWorkspaceStore');
        const ws = useWorkspaceStore.getState();
        await fetch(`${API_BASE}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            prompt: state.currentTask?.prompt || '',
            files_changed: [target],
            workspace_id: ws.activeWorkspaceId || ws.currentProject?.id,
            workspace_root: ws.workspaceRoot || ws.currentProject?.path,
          }),
        });
      } catch (e) {
        console.error(e);
      }
      set((s) => ({
        reviewData: s.reviewData
          ? {
              ...s.reviewData,
              filesChanged: s.reviewData.filesChanged.map((f) =>
                f.filePath === filePath ? { ...f, reviewStatus: 'approved' } : f
              ),
            }
          : null,
      }));
    },

    rejectFile: async (taskId: string, filePath: string) => {
      const state = get();
      const target = state.reviewData?.filesChanged.find((f) => f.filePath === filePath);
      if (!target) return;
      try {
        const { useWorkspaceStore } = await import('./useWorkspaceStore');
        const ws = useWorkspaceStore.getState();
        await fetch(`${API_BASE}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            prompt: state.currentTask?.prompt || '',
            files_changed: [target],
            workspace_id: ws.activeWorkspaceId || ws.currentProject?.id,
            workspace_root: ws.workspaceRoot || ws.currentProject?.path,
          }),
        });
        await ws.triggerRescan();
        await ws.fetchTree();
        const { useGitStore } = await import('./useGitStore');
        await useGitStore.getState().fetchGitStatus();
      } catch (e) {
        console.error(e);
      }
      set((s) => ({
        reviewData: s.reviewData
          ? {
              ...s.reviewData,
              filesChanged: s.reviewData.filesChanged.map((f) =>
                f.filePath === filePath ? { ...f, reviewStatus: 'rejected' } : f
              ),
            }
          : null,
      }));
    }
  };
});
