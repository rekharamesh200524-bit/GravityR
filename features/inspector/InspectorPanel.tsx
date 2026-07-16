import React, { useState } from 'react';
import { 
  Database, Cpu, Layers, Activity, Plus, Trash2, ShieldCheck, 
  FolderGit, FileSpreadsheet, HardDrive, Binary, Sparkles
} from 'lucide-react';
import { useMemoryStore } from '../../stores/useMemoryStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useChatStore } from '../../stores/useChatStore';
import { Button } from '../../components/ui/button';

export const InspectorPanel: React.FC = () => {
  const { memories, addMemory, removeMemory, tokenEstimate } = useMemoryStore();
  const { provider, model, temperature } = useSettingsStore();
  const { currentProject } = useWorkspaceStore();
  const { sessions, activeSessionId } = useChatStore();

  const [newMemoryText, setNewMemoryText] = useState('');
  const [isAddingFact, setIsAddingFact] = useState(false);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const runningSteps = activeSession?.messages
    .filter(m => m.role === 'assistant' && m.steps)
    .flatMap(m => m.steps || []);

  const handleAddFact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    addMemory(newMemoryText.trim());
    setNewMemoryText('');
    setIsAddingFact(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full bg-[#070912]/80 border-l border-slate-900/60 backdrop-blur-md overflow-y-auto select-none">
      {/* Panel Header */}
      <div className="flex h-14 items-center px-4 border-b border-slate-900 justify-between">
        <span className="text-xs font-semibold text-slate-350 uppercase tracking-widest flex items-center gap-1.5">
          <Activity className="h-4.5 w-4.5 text-violet-400" />
          <span>GravityX Agent Monitor</span>
        </span>
      </div>

      {/* Real Project Information Panel */}
      {currentProject && (
        <div className="p-4 border-b border-slate-900 bg-violet-950/5">
          <div className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5" />
            <span>Workspace Metadata</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
              <span className="text-slate-450">Project Path</span>
              <span className="font-mono text-slate-300 truncate max-w-[150px]" title={currentProject.path}>
                {currentProject.path}
              </span>
            </div>
            
            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
              <span className="text-slate-450">Framework</span>
              <span className="font-semibold text-slate-200">{currentProject.framework}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
              <span className="text-slate-450">Language</span>
              <span className="font-semibold text-slate-200">{currentProject.language}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
              <span className="text-slate-450">Total Folders</span>
              <span className="font-mono text-slate-200">{currentProject.total_folders}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
              <span className="text-slate-450">Total Files</span>
              <span className="font-mono text-slate-200">{currentProject.total_files}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
              <span className="text-slate-450">Workspace Size</span>
              <span className="font-mono text-slate-200">{formatBytes(currentProject.size_bytes)}</span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>Last Scan Index</span>
              <span>{currentProject.last_opened || 'Just Now'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Model Spec Section */}
      <div className="p-4 border-b border-slate-900 bg-slate-950/20">
        <div className="text-[10px] font-semibold text-slate-450 uppercase tracking-wider mb-3 flex items-center gap-1">
          <Cpu className="h-3.5 w-3.5 text-slate-400" />
          <span>LLM Engine parameters</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-900/50 border border-slate-850 p-2.5">
            <div className="text-[9px] text-slate-500 font-semibold uppercase">Provider</div>
            <div className="font-semibold text-slate-200 mt-0.5 capitalize">{provider}</div>
          </div>
          <div className="rounded-lg bg-slate-900/50 border border-slate-850 p-2.5">
            <div className="text-[9px] text-slate-500 font-semibold uppercase">Model</div>
            <div className="font-semibold text-slate-200 mt-0.5 truncate">{model.split('-').slice(0, 3).join('-')}</div>
          </div>
          <div className="rounded-lg bg-slate-900/50 border border-slate-850 p-2.5">
            <div className="text-[9px] text-slate-500 font-semibold uppercase">Temperature</div>
            <div className="font-semibold text-slate-250 mt-0.5">{temperature}</div>
          </div>
          <div className="rounded-lg bg-slate-900/50 border border-slate-850 p-2.5">
            <div className="text-[9px] text-slate-500 font-semibold uppercase">Context Window</div>
            <div className="font-semibold text-violet-400 mt-0.5">~{tokenEstimate} T</div>
          </div>
        </div>
      </div>

      {/* Task Execution Planner steps */}
      <div className="p-4 border-b border-slate-900">
        <div className="text-[10px] font-semibold text-slate-450 uppercase tracking-wider mb-3 flex items-center gap-1">
          <Layers className="h-3.5 w-3.5 text-slate-400" />
          <span>Active Agent Workflow</span>
        </div>
        {runningSteps && runningSteps.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {runningSteps.map((step) => (
              <div 
                key={step.id} 
                className={`text-xs p-2 rounded-lg border ${
                  step.status === 'completed' 
                    ? 'bg-emerald-950/5 border-emerald-500/10 text-slate-350' 
                    : step.status === 'running' 
                    ? 'bg-violet-950/10 border-violet-500/20 text-slate-100 neon-glow' 
                    : 'bg-slate-900 border-slate-850 text-slate-450'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{step.title}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono font-medium capitalize ${
                    step.status === 'completed' 
                      ? 'bg-emerald-500/10 text-emerald-450' 
                      : step.status === 'running'
                      ? 'bg-violet-500/10 text-violet-400 animate-pulse'
                      : 'bg-slate-800 text-slate-500'
                  }`}>
                    {step.status}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">{step.description}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-6 border border-dashed border-slate-850 rounded-xl text-slate-500 text-xs">
            No active workflows. Ask GravityX a coding query in the chat panel to see updates.
          </div>
        )}
      </div>

      {/* Memory facts database */}
      <div className="p-4 flex-grow">
        <div className="flex items-center justify-between mb-3 text-[10px] font-semibold text-slate-455 uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <Database className="h-3.5 w-3.5 text-slate-400" />
            <span>Workspace Memory Facts</span>
          </span>
          <button 
            onClick={() => setIsAddingFact(true)}
            className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {isAddingFact && (
          <form onSubmit={handleAddFact} className="mb-3 space-y-2">
            <textarea
              autoFocus
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              placeholder="Inject fact rule (e.g. 'Use modular export styles')"
              className="w-full rounded bg-slate-900 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 h-16 resize-none"
            />
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setIsAddingFact(false)} className="h-7 text-[10px] px-2 py-0.5">
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" className="h-7 text-[10px] px-2 py-0.5">
                Inject
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {memories.map((fact) => (
            <div 
              key={fact.id} 
              className="group/fact flex items-start gap-2 bg-[#0a0c14]/40 border border-slate-850/70 p-2.5 rounded-lg text-xs text-slate-350 hover:border-slate-800/80 transition-colors"
            >
              <ShieldCheck className="h-4 w-4 text-violet-400/80 mt-0.5 flex-shrink-0" />
              <div className="flex-1 leading-relaxed text-slate-300">{fact.content}</div>
              <button
                onClick={() => removeMemory(fact.id)}
                className="opacity-0 group-hover/fact:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-all"
                title="Remove fact"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InspectorPanel;
