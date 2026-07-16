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
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api')
  : 'http://localhost:8000/api';

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

  // Actions
  submitTask: (prompt: string, priority?: QueuePriority) => Promise<void>;
  cancelTask: (taskId: string) => void;
  clearQueue: () => void;
  setProvider: (provider: ProviderName) => void;
  clearLogs: () => void;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string) => Promise<void>;

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
    logs: [],

    // Gateway states default
    gatewayStatus: 'offline',
    currentProvider: 'google_colab',
    currentModel: 'qwen2.5-coder-7b-instruct',
    providerStatus: 'unknown',
    providerHealth: null,
    latencyMs: null,
    capabilities: ['code-generation', 'completion', 'refactoring'],
    streamingSupport: true,
    connectionStatus: null,
    availableProviders: [],
    availableModels: [],
    optimizedPrompt: null,

    submitTask: async (prompt: string, priority: QueuePriority = 'normal') => {
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

      set({
        currentTask: { ...task, status: 'planning', startedAt: Date.now() },
        timeline: initialTimeline(),
        plannerOutput: null,
        contextOutput: null,
        promptObject: null,
        validationResult: null,
        reviewData: null,
        connectionStatus: 'Connecting',
        optimizedPrompt: null,
      });

      try {
        const { useWorkspaceStore } = await import('./useWorkspaceStore');
        const { useMemoryStore } = await import('./useMemoryStore');
        const workspaceState = useWorkspaceStore.getState();
        const memoryState = useMemoryStore.getState();

        // Transition states during run setup
        set({ connectionStatus: 'Sending Context' });
        
        // Fetch active provider config before execution
        await get().fetchGatewayHealth();

        set({ connectionStatus: 'Waiting' });
        const startExecutionTime = Date.now();

        const result = await executionEngine.run(
          { ...task, status: 'planning', startedAt: Date.now() },
          workspaceState.fileTree,
          {
            provider: get().activeProvider,
            workspaceName: workspaceState.currentProject?.name ?? 'GravityX Workspace',
            memoryFacts: memoryState.memories.map((m) => m.content),
            projectRules: [
              'Use TypeScript strict mode.',
              'Follow the existing file structure.',
              'Preserve all existing functionality.',
              'Use Tailwind CSS for styling.',
            ],
          },
        );

        const latencyVal = Date.now() - startExecutionTime;
        set({ 
          connectionStatus: 'Completed',
          latencyMs: latencyVal
        });

        set((state) => ({
          plannerOutput: result.plannerOutput,
          contextOutput: result.contextOutput,
          promptObject: result.promptObject,
          validationResult: result.validationResult,
          reviewData: result.reviewData,
          timeline: result.timeline,
          currentTask: state.currentTask
            ? { ...state.currentTask, status: 'completed', completedAt: Date.now() }
            : null,
          queue: state.queue.map((q) =>
            q.task.id === task.id ? { ...q, task: { ...q.task, status: 'completed' } } : q
          ),
        }));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        agentLogger.error('ExecutionEngine', `Task ${task.id} failed: ${errorMessage}`);
        set((state) => ({
          connectionStatus: null,
          currentTask: state.currentTask
            ? { ...state.currentTask, status: 'failed', errorMessage }
            : null,
          queue: state.queue.map((q) =>
            q.task.id === task.id ? { ...q, task: { ...q.task, status: 'failed', errorMessage } } : q
          ),
        }));
      }
    },

    cancelTask: (taskId: string) => {
      executionEngine.cancel();
      set((state) => ({
        connectionStatus: null,
        currentTask: state.currentTask?.id === taskId
          ? { ...state.currentTask, status: 'cancelled' }
          : state.currentTask,
        queue: state.queue.map((q) =>
          q.task.id === taskId ? { ...q, task: { ...q.task, status: 'cancelled' } } : q
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
        google: 'google_colab',
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
      try {
        const res = await fetch(`${API_BASE}/gateway/health`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const currentName = data.current_provider;
        const currentStatus = (data.providers as Record<string, unknown>[] | undefined)?.find((p) => (p as Record<string, unknown>).provider === currentName) as Record<string, unknown> | undefined;

        set({
          gatewayStatus: data.status === 'online' || data.status === 'degraded' ? 'online' : 'offline',
          currentProvider: currentName,
          providerStatus: currentStatus ? (currentStatus.status as string) : 'offline',
          providerHealth: currentStatus || null,
          latencyMs: currentStatus ? (currentStatus.latency_ms as number) : null,
        });
      } catch {
        set({ gatewayStatus: 'offline', providerStatus: 'offline', providerHealth: null });
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
        await fetch(`${API_BASE}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            prompt: state.currentTask?.prompt || "",
            files_changed: state.reviewData?.filesChanged || []
          })
        });
      } catch (e) {
        console.error(e);
      }

      if (state.currentTask) {
        set({
          currentTask: { ...state.currentTask, status: 'failed' },
          connectionStatus: null
        });
      }
    }
  };
});
