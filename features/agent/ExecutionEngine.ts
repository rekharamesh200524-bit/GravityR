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
}

// ─── ExecutionEngine ──────────────────────────────────────────
export class ExecutionEngine {
  private planner = new Planner();
  private repoSearch = new RepositorySearch();
  private contextBuilder = new ContextBuilder();
  private promptBuilder = new PromptBuilder();
  private validator = new ResponseValidator();
  private reviewEngine = new ReviewEngine();

  private activeTaskId: string | null = null;
  private onTimelineUpdate?: (stages: TimelineStage[]) => void;

  // Allow external callback for Zustand updates
  setTimelineUpdateCallback(fn: (stages: TimelineStage[]) => void): void {
    this.onTimelineUpdate = fn;
  }

  private buildInitialTimeline(): TimelineStage[] {
    return TIMELINE_STAGES.map((s) => ({
      ...s,
      status: 'pending' as const,
    }));
  }

  private updateStage(
    stages: TimelineStage[],
    id: string,
    status: TimelineStage['status'],
    detail?: string,
  ): TimelineStage[] {
    const updated = stages.map((s): TimelineStage => {
      if (s.id === id) {
        const now = Date.now();
        return {
          ...s,
          status,
          detail,
          startedAt: status === 'running' ? now : s.startedAt,
          completedAt: status === 'completed' || status === 'failed' ? now : s.completedAt,
          durationMs: s.startedAt && (status === 'completed' || status === 'failed')
            ? now - s.startedAt
            : undefined,
        };
      }
      return s;
    });
    this.onTimelineUpdate?.(updated);
    return updated;
  }

  async run(
    task: AgentTask,
    fileTree: FileNode[],
    options: {
      provider?: ProviderName;
      workspaceName?: string;
      memoryFacts?: string[];
      projectRules?: string[];
    } = {},
  ): Promise<PipelineResult> {
    this.activeTaskId = task.id;
    let timeline = this.buildInitialTimeline();
    this.onTimelineUpdate?.(timeline);

    agentLogger.info('ExecutionEngine', `Starting pipeline for task: ${task.id}`, { prompt: task.prompt });

    // Inject workspace context
    this.repoSearch.setFileTree(fileTree);
    this.contextBuilder.setFileTree(fileTree);
    if (options.workspaceName) this.promptBuilder.setWorkspaceName(options.workspaceName);
    if (options.memoryFacts) this.promptBuilder.setMemoryFacts(options.memoryFacts);
    if (options.projectRules) this.promptBuilder.setProjectRules(options.projectRules);

    // ─── Stage 1: Planning
    timeline = this.updateStage(timeline, 'planning', 'running');
    agentLogger.info('Planner', 'Analyzing task prompt...');
    const plannerOutput = await this.planner.analyze(task);
    agentLogger.info('Planner', `Plan complete. Complexity: ${plannerOutput.estimatedComplexity}, Risk: ${plannerOutput.riskLevel}`, {
      steps: plannerOutput.executionSteps.length,
      estimatedTokens: plannerOutput.estimatedTokens,
    });
    timeline = this.updateStage(timeline, 'planning', 'completed', `${plannerOutput.executionSteps.length} steps · ${plannerOutput.estimatedComplexity}`);

    // ─── Stage 2: Repository Search
    timeline = this.updateStage(timeline, 'searching', 'running');
    agentLogger.info('RepositorySearch', 'Searching workspace for relevant files...');
    const searchOutput = await this.repoSearch.searchForPrompt(task.prompt);
    agentLogger.info('RepositorySearch', `Search complete. Found ${searchOutput.results.length} files in ${searchOutput.durationMs}ms.`);
    timeline = this.updateStage(timeline, 'searching', 'completed', `${searchOutput.results.length} files found`);

    // ─── Stage 3: Context Building
    timeline = this.updateStage(timeline, 'building-context', 'running');
    agentLogger.info('ContextBuilder', 'Assembling context from search results...');
    const contextOutput = await this.contextBuilder.build(task.id, searchOutput, plannerOutput);
    agentLogger.info('ContextBuilder', `Context built. ${contextOutput.files.length} files included. ~${contextOutput.totalTokenEstimate} tokens.`, {
      truncated: contextOutput.truncated,
    });
    timeline = this.updateStage(timeline, 'building-context', 'completed', `${contextOutput.files.length} files · ~${contextOutput.totalTokenEstimate} tokens`);

    // ─── Stage 4: Prompt Building
    timeline = this.updateStage(timeline, 'building-prompt', 'running');
    agentLogger.info('PromptBuilder', 'Constructing structured prompt...');
    const promptObject = this.promptBuilder.build(task.id, task.prompt, contextOutput, plannerOutput);
    
    // Call backend Prompt Intelligence build endpoint
    try {
      agentLogger.info('PromptBuilder', 'Invoking backend Prompt Intelligence Pipeline...');
      const apiBase = typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api')
        : 'http://localhost:8000/api';
      
      const response = await fetch(`${apiBase}/prompt/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: task.prompt,
          context_files: contextOutput.files.filter(f => f.included).map(f => ({
            filePath: f.filePath,
            fileName: f.fileName,
            content: f.content,
            language: f.language,
            confidence: f.confidence
          })),
          system_prompt: promptObject.systemPrompt
        })
      });
      
      if (response.ok) {
        const buildData = await response.json();
        agentLogger.info('PromptBuilder', 'Backend Prompt Intelligence build succeeded.', {
          compression: buildData.compression_summary,
          metrics: buildData.metrics
        });
        
        // Update promptObject with optimized values
        promptObject.systemPrompt = buildData.system_prompt;
        promptObject.userPrompt = buildData.user_prompt;
        promptObject.totalTokens = buildData.metrics.current_tokens;
        
        // Save optimized prompt state globally so the UI can display it
        const { useAgentStore } = await import('../../stores/useAgentStore');
        useAgentStore.setState({
          optimizedPrompt: buildData
        });
      } else {
        agentLogger.warn('PromptBuilder', 'Backend Prompt build endpoint returned error. Using fallback client prompt.');
      }
    } catch (e) {
      agentLogger.warn('PromptBuilder', `Backend Prompt build endpoint failed: ${e}. Using fallback client prompt.`);
    }

    agentLogger.info('PromptBuilder', `Prompt built. ${promptObject.sections.length} sections · ${promptObject.totalTokens} total tokens.`);
    timeline = this.updateStage(timeline, 'building-prompt', 'completed', `${promptObject.sections.length} sections · ${promptObject.totalTokens} tokens`);

    // ─── Stage 5: Model Provider
    timeline = this.updateStage(timeline, 'waiting-for-model', 'running');
    agentLogger.info('ExecutionEngine', `Calling model provider (streaming): ${options.provider ?? 'google'}...`);
    const provider = getProvider(options.provider ?? 'google');
    
    let modelResponse;
    try {
      modelResponse = await provider.stream(
        { prompt: promptObject, taskId: task.id, stream: true },
        () => {
          // Progress chunk is handled inside the provider to update Zustand/Timeline, 
          // but we can also log a heartbeat or progress indicator.
        }
      );
    } catch (e) {
      agentLogger.warn('ExecutionEngine', `Streaming call failed: ${e}. Falling back to generate.`);
      modelResponse = await provider.generate({ prompt: promptObject, taskId: task.id, stream: false });
    }
    
    agentLogger.info('ExecutionEngine', `Model responded. ${modelResponse.tokensUsed} tokens used in ${modelResponse.durationMs}ms.`);
    timeline = this.updateStage(timeline, 'waiting-for-model', 'completed', `${modelResponse.tokensUsed} tokens · ${modelResponse.durationMs}ms`);

    // ─── Stage 6: Validation
    timeline = this.updateStage(timeline, 'validating', 'running');
    agentLogger.info('ResponseValidator', 'Validating model response...');
    const validationResult = this.validator.validate(modelResponse);
    const issueCount = validationResult.issues.length;
    agentLogger.info('ResponseValidator', `Validation complete. Valid: ${validationResult.isValid}. Issues: ${issueCount}.`);
    timeline = this.updateStage(timeline, 'validating', validationResult.isValid ? 'completed' : 'failed', validationResult.isValid ? 'Valid' : `${issueCount} issue(s)`);

    // ─── Stage 7: Review
    timeline = this.updateStage(timeline, 'reviewing', 'running');
    agentLogger.info('ReviewEngine', 'Generating review report...');
    const reviewData = await this.reviewEngine.review(modelResponse, plannerOutput, validationResult);
    agentLogger.info('ReviewEngine', `Review complete. ${reviewData.filesChanged.length} file(s). Requires approval: ${reviewData.requiresHumanApproval}.`);
    timeline = this.updateStage(timeline, 'reviewing', 'completed', `${reviewData.filesChanged.length} file(s) changed`);

    // ─── Stage 8: Ready
    timeline = this.updateStage(timeline, 'ready', 'completed', 'Awaiting developer approval');
    agentLogger.info('ExecutionEngine', `Pipeline complete for task: ${task.id}`);

    this.activeTaskId = null;
    return { taskId: task.id, plannerOutput, contextOutput, promptObject, validationResult, reviewData, timeline };
  }

  cancel(): void {
    if (this.activeTaskId) {
      agentLogger.warn('ExecutionEngine', `Task ${this.activeTaskId} cancelled by user.`);
      this.activeTaskId = null;
    }
  }
}

// Singleton instance for use across the app
export const executionEngine = new ExecutionEngine();
