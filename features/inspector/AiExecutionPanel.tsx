'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Play, X, Settings2, Database, Wifi, Cpu, AlertTriangle } from 'lucide-react';
import { useAgentStore } from '../../stores/useAgentStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import type { GatewayProvider, GatewayModel } from '../../stores/useAgentStore';
import { AgentTimeline } from '../agent/components/AgentTimeline';
import { AgentQueue } from '../agent/components/AgentQueue';
import { PlannerOutputPanel } from '../agent/components/PlannerOutput';
import { ContextViewer } from '../agent/components/ContextViewer';
import { ReviewPanel } from '../agent/components/ReviewPanel';
import { AgentLogs } from '../agent/components/AgentLogs';
import { PromptPreview } from '../agent/components/PromptPreview';
import type { ProviderName } from '../agent/types';

type TabId = 'timeline' | 'planner' | 'context' | 'prompt' | 'review' | 'logs';

const TABS: { id: TabId; label: string }[] = [
  { id: 'timeline', label: 'Pipeline' },
  { id: 'planner',  label: 'Planner' },
  { id: 'context',  label: 'Context' },
  { id: 'prompt',   label: 'Prompt' },
  { id: 'review',   label: 'Review' },
  { id: 'logs',     label: 'Logs' },
];

export const AiExecutionPanel: React.FC = () => {
  const {
    currentTask,
    timeline,
    queue,
    plannerOutput,
    contextOutput,
    reviewData,
    logs,
    submitTask,
    cancelTask,
    clearQueue,
    setProvider,
    clearLogs,
    workspaceWarning,
    clearWorkspaceWarning,

    // Gateway states
    gatewayStatus,
    currentProvider,
    currentModel,
    providerStatus,
    providerHealth,
    latencyMs,
    connectionStatus,
    availableProviders,
    availableModels,
    fetchGatewayHealth,
    fetchProviders,
    fetchModels,
    selectGatewayProvider,
    selectGatewayModel,
    optimizedPrompt,
  } = useAgentStore();

  const [taskPrompt, setTaskPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('timeline');
  const [showSettings, setShowSettings] = useState(false);
  const [generationTime, setGenerationTime] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isRunning = currentTask?.status !== undefined &&
    !['completed', 'failed', 'cancelled', undefined].includes(currentTask.status as string);

  useEffect(() => {
    void fetchGatewayHealth();
    void fetchProviders();
    void fetchModels();
    const interval = setInterval(() => { void fetchGatewayHealth(); }, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // Timer to display generation speed — avoid setState-in-effect lint error
  // by resetting the value via ref during cleanup instead of inline setState.
  const generationTimeRef = useRef<number>(0);
  useEffect(() => {
    if (connectionStatus === 'Generating' || connectionStatus === 'Receiving Tokens') {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - start) / 10) / 100;
        generationTimeRef.current = elapsed;
        setGenerationTime(elapsed);
      }, 50);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Only reset when not just completed
      if (connectionStatus !== 'Completed' && generationTimeRef.current !== 0) {
        generationTimeRef.current = 0;
        setGenerationTime(0);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [connectionStatus]);

  const workspaceRoot = useWorkspaceStore((s) => s.workspaceRoot || s.currentProject?.path);
  const hasWorkspace = Boolean(workspaceRoot);

  const handleRunTask = async () => {
    if (!taskPrompt.trim() || isRunning) return;
    const prompt = taskPrompt.trim();
    if (!hasWorkspace) {
      await submitTask(prompt);
      return;
    }
    setTaskPrompt('');
    setActiveTab('timeline');
    await submitTask(prompt);
  };

  const tokensCount = reviewData?.summary ? Math.round(reviewData.summary.length / 4) : 150;
  const speed = generationTime > 0 ? Math.round(tokensCount / generationTime) : 0;

  return (
    <div className="flex flex-col h-full bg-[#070912]/80 border-l border-slate-900/60 backdrop-blur-md overflow-hidden select-none">

      {/* ── Panel Header ─────────────────────────────── */}
      <div className="flex h-12 items-center px-4 border-b border-slate-900 justify-between bg-[#070911] flex-shrink-0">
        <span className="text-[10px] font-semibold text-slate-350 uppercase tracking-widest flex items-center gap-1.5 font-sans">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span>GravityX AI Co-Pilot</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings((v: boolean) => !v)}
            className={`p-1.5 rounded transition-colors ${showSettings ? 'text-violet-400 bg-violet-950/20' : 'text-slate-600 hover:text-slate-300'}`}
            title="Provider settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="p-1.5 rounded text-slate-600 hover:text-red-400 transition-colors"
              title="Clear completed tasks"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Model Gateway Settings (collapsible) ────── */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-slate-900 bg-slate-950/30 space-y-2.5 flex-shrink-0 text-xs">
          
          {/* Provider Select List */}
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
            <span className="text-[10px] text-slate-500 w-16">Provider</span>
            <select
              value={currentProvider || ''}
              onChange={(e) => {
                const prov = e.target.value;
                void selectGatewayProvider(prov);
                // Also sync local activeProvider state representation
                const map: Record<string, ProviderName> = {
                  google_colab: 'google',
                  ollama: 'ollama',
                  runpod: 'runpod',
                  openai: 'openai',
                  claude: 'claude',
                };
                if (map[prov]) setProvider(map[prov]);
              }}
              className="flex-1 text-[10px] bg-slate-900 border border-slate-800 text-slate-300 rounded px-2 py-1 outline-none cursor-pointer"
            >
              {availableProviders.map((p: GatewayProvider) => (
                <option key={p.name} value={p.name}>{p.displayName}</option>
              ))}
            </select>
          </div>

          {/* Model Select List */}
          <div className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
            <span className="text-[10px] text-slate-500 w-16">Active Model</span>
            <select
              value={currentModel || ''}
              onChange={(e) => void selectGatewayModel(e.target.value)}
              className="flex-1 text-[10px] bg-slate-900 border border-slate-800 text-slate-300 rounded px-2 py-1 outline-none cursor-pointer"
            >
              {availableModels.map((m: GatewayModel) => (
                <option key={m.id} value={m.id}>{m.displayName} ({m.parameterSize})</option>
              ))}
            </select>
          </div>

          {/* Uptime & Monitoring status dashboard */}
          <div className="pt-2 border-t border-slate-900/60 flex items-center justify-between text-[9px] text-slate-500">
            <span className="flex items-center gap-1">
              <Wifi className={`h-2.5 w-2.5 ${gatewayStatus === 'online' ? 'text-emerald-400' : 'text-red-400'}`} />
              Gateway: <strong className="text-slate-400">{gatewayStatus.toUpperCase()}</strong>
            </span>
            <span className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${providerStatus === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`} />
              Provider: <strong className="text-slate-400">{(providerStatus || 'offline').toUpperCase()}</strong>
            </span>
            {latencyMs !== null && (
              <span>Ping: <strong className="text-slate-400">{latencyMs}ms</strong></span>
            )}
          </div>
          {!!providerHealth?.gpu_name && (
            <div className="text-[8px] text-slate-600 flex items-center gap-1 justify-end font-mono">
              GPU: {String(providerHealth?.gpu_name)} (VRAM: {String(providerHealth?.vram_allocated)}/{String(providerHealth?.vram_total)})
            </div>
          )}
        </div>
      )}

      {/* ── Task Composer ────────────────────────────── */}
      <div className="p-4 border-b border-slate-900 bg-slate-950/20 space-y-3 flex-shrink-0">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
          <span>Submit Instruction</span>
          {connectionStatus && (
            <span className="text-[9px] text-violet-400 bg-violet-950/40 border border-violet-850 px-1.5 py-0.5 rounded animate-pulse">
              {connectionStatus.toUpperCase()}
            </span>
          )}
        </div>
        {/* Workspace Warning Alert */}
        {workspaceWarning && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">{workspaceWarning}</span>
              <p className="text-[10px] text-amber-400/80 mt-0.5 leading-normal">
                Please open a project directory in the workspace before running an agent task.
              </p>
            </div>
            <button
              onClick={clearWorkspaceWarning}
              className="text-amber-400/60 hover:text-amber-200 transition-colors p-0.5"
              title="Dismiss warning"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-col rounded-lg border border-slate-800 bg-[#0c0e17] p-2 focus-within:border-violet-500/50">
          <textarea
            rows={2}
            value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleRunTask();
              }
            }}
            placeholder="e.g. Create a user dashboard with charts and filters..."
            className="w-full resize-none bg-transparent border-0 focus:outline-none focus:ring-0 text-slate-200 text-xs placeholder-slate-550 leading-relaxed min-h-12"
          />
          <div className="flex justify-end pt-1">
            {isRunning ? (
              <button
                onClick={() => currentTask && cancelTask(currentTask.id)}
                className="flex items-center gap-1.5 rounded bg-red-650/15 border border-red-500/20 text-red-400 hover:bg-red-600 hover:text-white transition-all px-2.5 py-1 text-[10px] font-semibold cursor-pointer"
              >
                <X className="h-3 w-3" />
                <span>Cancel</span>
              </button>
            ) : (
              <button
                onClick={() => void handleRunTask()}
                disabled={!taskPrompt.trim()}
                className="flex items-center gap-1.5 rounded bg-violet-650/80 hover:bg-violet-600 text-white disabled:bg-slate-800 disabled:text-slate-500 px-3 py-1.5 text-[10px] font-semibold transition-all shadow-md cursor-pointer"
              >
                <Play className="h-3 w-3" />
                <span>Run Agent Task</span>
              </button>
            )}
          </div>
        </div>

        {/* Live streaming performance metrics display */}
        {generationTime > 0 && (
          <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono bg-slate-950/40 p-2 rounded border border-slate-900/60">
            <span>Elapsed: <strong className="text-slate-350">{generationTime}s</strong></span>
            {speed > 0 && (
              <span>Tokens speed: <strong className="text-slate-350">{speed} t/s</strong></span>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────── */}
      <div className="flex border-b border-slate-900 bg-[#070911] flex-shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-[10px] font-semibold transition-colors whitespace-nowrap border-b-2 ${
              activeTab === tab.id
                ? 'text-violet-400 border-violet-500'
                : 'text-slate-600 hover:text-slate-400 border-transparent'
            }`}
          >
            {tab.label}
            {tab.id === 'logs' && logs.length > 0 && (
              <span className="ml-1 text-[8px] bg-violet-900/40 text-violet-400 px-1 py-0.5 rounded">
                {logs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* PIPELINE TAB */}
        {activeTab === 'timeline' && (
          <>
            <AgentTimeline stages={timeline} />
            {queue.length > 0 && (
              <AgentQueue queue={queue} onCancel={cancelTask} />
            )}
            {!isRunning && !currentTask && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles className="h-8 w-8 text-violet-400/30 mb-3" />
                <div className="text-xs text-slate-600">Submit an instruction above to start the agent pipeline.</div>
              </div>
            )}
          </>
        )}

        {/* PLANNER TAB */}
        {activeTab === 'planner' && (
          plannerOutput
            ? <PlannerOutputPanel output={plannerOutput} />
            : <EmptyTabState label="Planner output will appear here after the first task." />
        )}

        {/* CONTEXT TAB */}
        {activeTab === 'context' && (
          contextOutput
            ? <ContextViewer output={contextOutput} />
            : <EmptyTabState label="Context files will appear here after a task runs." />
        )}

        {/* REVIEW TAB */}
        {activeTab === 'review' && (
          reviewData
            ? <ReviewPanel review={reviewData} />
            : <EmptyTabState label="Review data will appear after the agent completes a task." />
        )}

        {/* PROMPT PREVIEW TAB */}
        {activeTab === 'prompt' && (
          <PromptPreview optimizedPrompt={optimizedPrompt} />
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <AgentLogs logs={logs} onClear={clearLogs} />
        )}
      </div>
    </div>
  );
};

// ─── Empty state helper ────────────────────────────────────────
function EmptyTabState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  );
}

export default AiExecutionPanel;
