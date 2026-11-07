'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  Terminal as TerminalIcon, FileOutput, ShieldAlert, CircleX, Minimize2, 
  GitBranch, Server, Settings, Cpu, Plus, X 
} from 'lucide-react';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTerminalStore, TerminalTab } from '../../stores/useTerminalStore';
import { terminalService } from '../../services/terminalService';
import { TerminalTabItem } from './TerminalTabItem';
import '@xterm/xterm/css/xterm.css';

type BottomTab = 'terminal' | 'problems' | 'output' | 'devlogs' | 'git' | 'ports' | 'ailogs';

export const BottomPanel: React.FC = () => {
  const { setTerminalCollapsed } = useLayoutStore();
  const [activeTab, setActiveTab] = useState<BottomTab>('terminal');
  
  const currentProject = useWorkspaceStore((state) => state.currentProject);
  const projectPath = currentProject?.path || null;

  const { tabs, activeTabId, addTab, removeTab, setActiveTabId, renameTab } = useTerminalStore();

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const isCreatingRef = useRef<boolean>(false);

  // Helper to spawn a new terminal tab.
  // Read nextTabNumber from store inside so this callback is stable (no nextTabNumber dep).
  const createNewTerminal = useCallback(async () => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;

    try {
      const cwd = projectPath || 'D:\\GravityR';
      const { nextTabNumber } = useTerminalStore.getState();
      const session = await terminalService.createBackendSession('powershell', cwd);

      const tabName = `PowerShell ${nextTabNumber}`;
      const newTab: TerminalTab = {
        id: session.session_id,
        sessionId: session.session_id,
        name: tabName,
        shellType: session.shell_type || 'powershell',
        cwd: session.working_directory || cwd,
      };

      addTab(newTab);
    } catch (err) {
      console.error('Failed to create new terminal session:', err);
    } finally {
      isCreatingRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, addTab]);

  // Listen for workspace CWD change events
  useEffect(() => {
    const handleCwdChange = (e: any) => {
      const newPath = e.detail?.path;
      if (newPath) {
        terminalService.handleInput(`cd "${newPath}"\r`);
      }
    };
    window.addEventListener('workspace-cwd-changed', handleCwdChange);
    return () => window.removeEventListener('workspace-cwd-changed', handleCwdChange);
  }, []);

  // Ensure at least one terminal tab exists on mount. Use a separate ref-based
  // guard so this never runs more than once per mount even in Strict Mode.
  const didAutoCreateRef = useRef(false);
  useEffect(() => {
    if (!didAutoCreateRef.current && useTerminalStore.getState().tabs.length === 0) {
      didAutoCreateRef.current = true;
      createNewTerminal();
    }
  // Run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle closing a tab
  const handleCloseTab = async (e: React.MouseEvent, tab: TerminalTab) => {
    e.stopPropagation();
    
    // Close backend session
    await terminalService.closeBackendSession(tab.sessionId);
    
    // Remove tab from store
    removeTab(tab.id);
  };

  // Handle starting tab rename on double click
  const handleStartRename = (e: React.MouseEvent, tab: TerminalTab) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingName(tab.name);
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  // Save rename
  const handleSaveRename = (tabId: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      renameTab(tabId, trimmed);
    }
    setEditingTabId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#04060a]/90 border-t border-slate-900 overflow-hidden select-none">
      {/* Primary Tab Switcher Headers */}
      <div className="flex h-9 items-center justify-between px-3 border-b border-slate-900 bg-[#070911]">
        <div className="flex items-center gap-1 scrollbar-none overflow-x-auto">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold transition-colors border-b-2 uppercase tracking-wider ${
              activeTab === 'terminal'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <TerminalIcon className="h-3 w-3" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('problems')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold transition-colors border-b-2 uppercase tracking-wider ${
              activeTab === 'problems'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <ShieldAlert className="h-3 w-3" />
            <span>Problems</span>
            <span className="bg-slate-800 text-[8px] text-slate-400 px-1 py-0.5 rounded-full font-mono leading-none">0</span>
          </button>

          <button
            onClick={() => setActiveTab('output')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold transition-colors border-b-2 uppercase tracking-wider ${
              activeTab === 'output'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <FileOutput className="h-3 w-3" />
            <span>Output</span>
          </button>

          <button
            onClick={() => setActiveTab('devlogs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold transition-colors border-b-2 uppercase tracking-wider ${
              activeTab === 'devlogs'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <Server className="h-3 w-3" />
            <span>Developer Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('git')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold transition-colors border-b-2 uppercase tracking-wider ${
              activeTab === 'git'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <GitBranch className="h-3 w-3" />
            <span>Git Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('ports')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold transition-colors border-b-2 uppercase tracking-wider ${
              activeTab === 'ports'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <Settings className="h-3 w-3" />
            <span>Ports</span>
          </button>

          <button
            onClick={() => setActiveTab('ailogs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold transition-colors border-b-2 uppercase tracking-wider ${
              activeTab === 'ailogs'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            <Cpu className="h-3 w-3" />
            <span>AI Logs</span>
          </button>
        </div>

        <button
          onClick={() => setTerminalCollapsed(true)}
          className="rounded p-1 text-slate-500 hover:bg-slate-900 hover:text-slate-300 transition-colors cursor-pointer"
          title="Minimize Panel"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terminal View / Sub-panel View */}
      <div className="flex-grow min-h-0 bg-[#04060a] relative flex flex-col">
        {/* Terminal Sessions Container */}
        <div className={`h-full w-full flex flex-col ${activeTab === 'terminal' ? 'flex' : 'hidden'}`}>
          {/* Terminal Session Tab Bar */}
          <div className="flex h-8 items-center px-2 bg-[#090b14] border-b border-slate-800/80 gap-1 overflow-x-auto scrollbar-none shrink-0">
            {tabs.map((tab) => {
              const isTabActive = tab.id === activeTabId;
              const isEditing = editingTabId === tab.id;

              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  onDoubleClick={(e) => handleStartRename(e, tab)}
                  className={`group flex items-center gap-2 px-3 py-1 text-xs font-mono rounded-t border-t border-x cursor-pointer transition-all max-w-[180px] shrink-0 ${
                    isTabActive
                      ? 'bg-[#04060a] border-slate-700/80 text-violet-300 font-medium border-t-violet-500'
                      : 'bg-[#0e111d]/60 border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#121625]/80'
                  }`}
                  title="Double-click to rename"
                >
                  <TerminalIcon className={`h-3 w-3 ${isTabActive ? 'text-violet-400' : 'text-slate-500'}`} />

                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(tab.id);
                        if (e.key === 'Escape') setEditingTabId(null);
                      }}
                      onBlur={() => handleSaveRename(tab.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-slate-900 text-violet-200 text-xs px-1 py-0.5 rounded outline-none border border-violet-500/50 w-full min-w-[60px]"
                    />
                  ) : (
                    <span className="truncate text-[11px]">{tab.name}</span>
                  )}

                  {/* Close Tab Button */}
                  <button
                    onClick={(e) => handleCloseTab(e, tab)}
                    className={`rounded p-0.5 hover:bg-red-500/20 hover:text-red-400 transition-colors ${
                      isTabActive ? 'text-slate-400 opacity-80 group-hover:opacity-100' : 'text-slate-500 opacity-0 group-hover:opacity-100'
                    }`}
                    title="Close terminal session"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}

            {/* Add New Terminal Tab Button */}
            <button
              onClick={() => createNewTerminal()}
              className="flex items-center justify-center h-6 w-6 rounded text-slate-400 hover:text-violet-300 hover:bg-slate-800/80 transition-colors ml-1 cursor-pointer"
              title="New Terminal"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Terminal Session Viewports */}
          <div className="flex-grow min-h-0 relative w-full h-full">
            {tabs.map((tab) => (
              <TerminalTabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
            ))}
          </div>
        </div>

        {/* Other Panel Views */}
        {activeTab === 'problems' && (
          <div className="h-full overflow-y-auto flex flex-col items-center justify-center text-center text-slate-500 text-[11px] gap-1.5">
            <CircleX className="h-7 w-7 text-slate-700" />
            <span>No issues found in current project files.</span>
          </div>
        )}

        {activeTab === 'output' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-400 leading-relaxed">
            <div>[System] Launching GravityX compilation daemon...</div>
            <div>[System] Loaded Monaco components configuration context.</div>
            <div>[System] Ready for code execution inputs.</div>
          </div>
        )}

        {activeTab === 'devlogs' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1">
            <div>[13:51:40] <span className="text-violet-400">[GravityX API]</span> Opening workspace...</div>
            <div>[13:51:41] <span className="text-violet-400">[GravityX API]</span> Loaded compiler indexes safely.</div>
            <div>[13:52:01] <span className="text-slate-500">[Git Sync]</span> Checking local repository states (clean working tree).</div>
          </div>
        )}

        {activeTab === 'git' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-400 leading-relaxed">
            <div>On branch main</div>
            <div>Your branch is up to date with 'origin/main'.</div>
            <div>nothing to commit, working tree clean</div>
          </div>
        )}

        {activeTab === 'ports' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-2">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-slate-200">Port 3000</span>
              <span className="text-slate-500">→</span>
              <span className="text-violet-400 hover:underline cursor-pointer">http://localhost:3000</span>
              <span className="bg-emerald-500/10 text-emerald-450 px-1 rounded text-[9px] font-sans font-medium">NextJS Dev App</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-semibold text-slate-200">Port 8000</span>
              <span className="text-slate-500">→</span>
              <span className="text-violet-400 hover:underline cursor-pointer">http://localhost:8000/api</span>
              <span className="bg-emerald-500/10 text-emerald-450 px-1 rounded text-[9px] font-sans font-medium">FastAPI Engine</span>
            </div>
          </div>
        )}

        {activeTab === 'ailogs' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-450 space-y-1 leading-relaxed">
            <div>[AI Engine] Agent initial state: IDLE</div>
            <div>[AI Engine] Memory facts injected: 3 rules loaded</div>
            <div>[AI Engine] Context builder cached: 0 context tokens active</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BottomPanel;
