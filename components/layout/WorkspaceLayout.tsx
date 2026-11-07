'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, PanelImperativeHandle } from 'react-resizable-panels';
import { useLayoutStore, SidebarView } from '../../stores/useLayoutStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useMemoryStore } from '../../stores/useMemoryStore';
import { FileExplorer } from '../../features/explorer/FileExplorer';
import { SourceControlPanel } from '../../features/sidebar/SourceControlPanel';
import { DiffPanel as EditorPanel } from '../../features/diff/DiffPanel';
import { AiExecutionPanel } from '../../features/inspector/AiExecutionPanel';
import { BottomPanel } from '../../features/terminal/BottomPanel';
import { MenuBar } from './MenuBar';
import { Toolbar } from './Toolbar';
import { ActivityBar } from './ActivityBar';
import { StatusBar } from './StatusBar';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { SettingsPanel } from '../settings/SettingsPanel';
import { Database, Plus, Trash2, ShieldCheck, Search, GitBranch, Sparkles, Bookmark, Blocks, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { OpenWorkspaceModal } from '../workspace/OpenWorkspaceModal';

declare global {
  interface Window {
    electronAPI?: {
      openDirectory: () => Promise<string | null>;
      watchDirectory: (path: string | null) => void;
      onWorkspaceChanged: (callback: (data: any) => void) => () => void;
    };
  }
}

export const WorkspaceLayout: React.FC = () => {
  const { 
    activeSidebarView, 
    leftPanelCollapsed, 
    inspectorCollapsed, 
    terminalCollapsed,
    setLeftPanelCollapsed,
    setInspectorCollapsed,
    setTerminalCollapsed
  } = useLayoutStore();

  const { currentProject, openWorkspace, triggerRescan, initWorkspace } = useWorkspaceStore();
  const { initSettings } = useSettingsStore();
  const { memories, addMemory, removeMemory } = useMemoryStore();
  const [newMemoryText, setNewMemoryText] = useState('');
  const [isAddingFact, setIsAddingFact] = useState(false);
  
  const [savedHorizontalLayout, setSavedHorizontalLayout] = useState<any>(undefined);
  const [savedVerticalLayout, setSavedVerticalLayout] = useState<any>(undefined);

  // Auto-restore last workspace & settings on launch
  useEffect(() => {
    initSettings();
    initWorkspace();
  }, [initSettings, initWorkspace]);

  // 1. Dynamic Window Title Synchronization
  useEffect(() => {
    if (currentProject) {
      document.title = `${currentProject.name} — GravityX`;
    } else {
      document.title = "GravityX";
    }
  }, [currentProject]);

  // 2. Drag & Drop workspace imports
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        // In Electron, the dropped file object contains the absolute .path attribute
        const path = (file as any).path;
        if (path) {
          await openWorkspace(path);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [openWorkspace]);

  // 3. Electron File Watcher listener initialization
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      if (currentProject?.path) {
        window.electronAPI.watchDirectory(currentProject.path);
      } else {
        window.electronAPI.watchDirectory(null);
      }
    }
  }, [currentProject]);

  // 4. Handle workspace modification notifications
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      let timer: NodeJS.Timeout | null = null;
      const unsubscribe = window.electronAPI.onWorkspaceChanged((data: any) => {
        console.log("Workspace change event received:", data);
        // Debounce rescan triggers by 1s to prevent database locks
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          triggerRescan();
        }, 1000);
      });

      return () => {
        if (timer) clearTimeout(timer);
        if (unsubscribe) unsubscribe();
      };
    }
  }, [triggerRescan]);

  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const bottomPanelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    try {
      const savedH = localStorage.getItem('gravityx-horizontal-layout');
      if (savedH) setSavedHorizontalLayout(JSON.parse(savedH));
      
      const savedV = localStorage.getItem('gravityx-vertical-layout');
      if (savedV) setSavedVerticalLayout(JSON.parse(savedV));
    } catch (e) {
      // Ignored
    }
  }, []);

  // Drive panel collapse/expand from Zustand state imperatively
  useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (leftPanelCollapsed) {
      panel.collapse();
    } else {
      panel.expand();
      setTimeout(() => {
        if (panel.getSize().asPercentage === 0) panel.resize('20%');
      }, 50);
    }
  }, [leftPanelCollapsed]);

  useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (inspectorCollapsed) {
      panel.collapse();
    } else {
      panel.expand();
      setTimeout(() => {
        if (panel.getSize().asPercentage === 0) panel.resize('24%');
      }, 50);
    }
  }, [inspectorCollapsed]);

  useEffect(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (terminalCollapsed) {
      panel.collapse();
    } else {
      panel.expand();
      setTimeout(() => {
        if (panel.getSize().asPercentage === 0) panel.resize('26%');
      }, 50);
    }
  }, [terminalCollapsed]);

  const handleAddFact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    addMemory(newMemoryText.trim());
    setNewMemoryText('');
    setIsAddingFact(false);
  };

  const renderLeftPanelContent = () => {
    switch (activeSidebarView) {
      case 'explorer':
        return <FileExplorer />;
      case 'search':
        return (
          <div className="flex flex-col h-full bg-[#080a14]/60 p-4 select-none">
            <div className="text-xs font-semibold text-slate-455 uppercase tracking-wider mb-3">Search Files</div>
            <div className="relative">
              <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search text in workspace files..."
                className="w-full rounded bg-slate-900 border border-slate-855 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-4 leading-relaxed">
              Type keywords to locate code segments. Search performs indexed lookups via SQLite.
            </div>
          </div>
        );
      case 'git':
        return <SourceControlPanel />;
      case 'tasks':
        return (
          <div className="flex flex-col h-full bg-[#080a14]/60 p-4 select-none">
            <div className="text-xs font-semibold text-slate-455 uppercase tracking-wider mb-3">AI Tasks planner</div>
            <div className="space-y-2">
              <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-slate-200 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-violet-400" />
                  <span>Update Page layout layout grid</span>
                </div>
                <div className="text-[10px] text-slate-550">Status: Staged — 1 file modified</div>
              </div>
            </div>
          </div>
        );
      case 'memory':
        return (
          <div className="flex flex-col h-full bg-[#080a14]/60 p-3 select-none">
            <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-455 uppercase tracking-wider px-1">
              <span className="flex items-center gap-1.5">
                <Database className="h-4 w-4 text-slate-400" />
                <span>Memory Facts</span>
              </span>
              <button 
                onClick={() => setIsAddingFact(true)}
                className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {isAddingFact && (
              <form onSubmit={handleAddFact} className="mb-3 space-y-2 px-1">
                <textarea
                  autoFocus
                  value={newMemoryText}
                  onChange={(e) => setNewMemoryText(e.target.value)}
                  placeholder="Inject fact rule (e.g. 'Use modular export styles')"
                  className="w-full rounded bg-slate-900 border border-slate-800 p-2 text-xs text-slate-250 focus:outline-none focus:border-violet-500 h-16 resize-none"
                />
                <div className="flex justify-end gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setIsAddingFact(false)} className="h-6 text-[9px] px-2">
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" className="h-6 text-[9px] px-2">
                    Inject
                  </Button>
                </div>
              </form>
            )}

            <div className="space-y-2 overflow-y-auto max-h-[80%] pr-1">
              {memories.map((fact) => (
                <div 
                  key={fact.id} 
                  className="group/fact flex items-start gap-2 bg-[#0a0c14]/40 border border-slate-850/70 p-2.5 rounded-lg text-xs text-slate-355 hover:border-slate-800/80 transition-colors"
                >
                  <ShieldCheck className="h-4 w-4 text-violet-455 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 leading-relaxed text-slate-300">{fact.content}</div>
                  <button
                    onClick={() => removeMemory(fact.id)}
                    className="opacity-0 group-hover/fact:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-all cursor-pointer"
                    title="Remove fact"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'prompts':
        return (
          <div className="flex flex-col h-full bg-[#080a14]/60 p-4 select-none">
            <div className="text-xs font-semibold text-slate-455 uppercase tracking-wider mb-3">Saved Templates</div>
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-855 hover:border-slate-800 cursor-pointer text-xs transition-all text-slate-300">
                <div className="font-semibold text-slate-200">💡 Optimize React Context</div>
                <div className="text-[10px] text-slate-550 mt-1">Refactor providers to avoid wasteful client rendering.</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-855 hover:border-slate-800 cursor-pointer text-xs transition-all text-slate-300">
                <div className="font-semibold text-slate-200">🛡️ API Wrapper Validation</div>
                <div className="text-[10px] text-slate-550 mt-1">Add schemas sanitizing outputs.</div>
              </div>
            </div>
          </div>
        );
      case 'extensions':
        return (
          <div className="flex flex-col h-full bg-[#080a14]/60 p-4 select-none">
            <div className="text-xs font-semibold text-slate-455 uppercase tracking-wider mb-3">Extensions Catalog</div>
            <div className="text-[10px] text-slate-550 italic mt-2 text-center">No catalog packages active.</div>
          </div>
        );
      case 'settings':
        return <SettingsPanel />;
      default:
        return <FileExplorer />;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-app,#03050a)] text-[var(--fg-primary,#f8fafc)] antialiased font-sans transition-colors duration-200">
      {/* 1. Top IDE Menu Bar */}
      {/* 1. Top IDE Menu Bar */}
      <MenuBar />

      {/* 2. Intermediate Toolbar */}
      <Toolbar />

      {/* 3. Main Workspace Split Layout */}
      <div className="flex-grow flex min-h-0 w-full relative font-sans overflow-hidden bg-[#03050a]">
        {/* Left Vertical Activity Bar */}
        <ActivityBar />

        {/* Resizable panel grids */}
        <div className="flex flex-col flex-grow min-w-0 min-h-0 overflow-hidden h-full relative">
          <PanelGroup 
            orientation="horizontal" 
            className="h-full w-full" 
            id="workspace-horizontal-layout" 
            defaultLayout={savedHorizontalLayout}
            onLayoutChanged={(layout) => {
              // Only save to localStorage — do NOT sync Zustand from here
              // (causes circular collapse/expand loop). Collapse state is
              // driven exclusively by the ActivityBar → Zustand → useEffect.
              localStorage.setItem('gravityx-horizontal-layout', JSON.stringify(layout));
            }}
          >
            {/* Left Side Panel (Explorer / Search / Git / Memory) */}
            <Panel 
              panelRef={leftPanelRef}
              id="left-sidebar" 
              defaultSize="20"
              minSize="14"
              maxSize="35"
              collapsible={true}
              collapsedSize={0}
              className="overflow-hidden h-full"
              style={{ overflow: 'hidden' }}
              onResize={(size) => {
                const isNowCollapsed = size.asPercentage === 0;
                if (isNowCollapsed !== useLayoutStore.getState().leftPanelCollapsed) {
                  useLayoutStore.getState().setLeftPanelCollapsed(isNowCollapsed);
                }
              }}
            >
              <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: leftPanelCollapsed ? 'none' : 'flex', flexDirection: 'column' }}>
                {renderLeftPanelContent()}
              </div>
            </Panel>
            <PanelResizeHandle 
              disabled={leftPanelCollapsed}
              className={`bg-[#05070d] transition-colors cursor-col-resize duration-150 relative z-30 flex-shrink-0 ${
                leftPanelCollapsed ? 'hidden' : 'w-[4px] hover:bg-violet-600/60 active:bg-violet-500'
              }`} 
            />

            {/* Central Editor Pane + Bottom logs Panel */}
            <Panel id="center-workspace" minSize="30" className="h-full" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <PanelGroup 
                orientation="vertical" 
                className="h-full w-full" 
                id="workspace-vertical-layout" 
                defaultLayout={savedVerticalLayout}
                onLayoutChanged={(layout) => {
                  localStorage.setItem('gravityx-vertical-layout', JSON.stringify(layout));
                }}
              >
                {/* Monaco Editor tabs and preview frame */}
                <Panel id="monaco-editor" minSize="30" className="h-full w-full" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}>
                  <EditorPanel />
                </Panel>

                {/* Bottom Panel terminal */}
                <Panel 
                  panelRef={bottomPanelRef}
                  id="console-logs" 
                  defaultSize="26"
                  minSize="15"
                  maxSize="60" 
                  collapsible={true}
                  collapsedSize={0}
                  className="h-full"
                  style={{ overflow: 'hidden' }}
                  onResize={(size) => {
                    const isNowCollapsed = size.asPercentage === 0;
                    if (isNowCollapsed !== useLayoutStore.getState().terminalCollapsed) {
                      useLayoutStore.getState().setTerminalCollapsed(isNowCollapsed);
                    }
                  }}
                >
                  <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: terminalCollapsed ? 'none' : 'flex', flexDirection: 'column' }}>
                    <BottomPanel />
                  </div>
                </Panel>
                <PanelResizeHandle 
                  disabled={terminalCollapsed}
                  className={`bg-[#05070d] transition-colors cursor-row-resize duration-150 relative z-30 flex-shrink-0 ${
                    terminalCollapsed ? 'hidden' : 'h-[4px] hover:bg-violet-600/60 active:bg-violet-500'
                  }`} 
                />
              </PanelGroup>
            </Panel>

            {/* Right Panel: AI Review / Execution Planner */}
            <Panel 
              panelRef={rightPanelRef}
              id="right-sidebar" 
              defaultSize="24"
              minSize="18"
              maxSize="35" 
              collapsible={true}
              collapsedSize={0}
              className="h-full"
              style={{ overflow: 'hidden' }}
              onResize={(size) => {
                const isNowCollapsed = size.asPercentage === 0;
                if (isNowCollapsed !== useLayoutStore.getState().inspectorCollapsed) {
                  useLayoutStore.getState().setInspectorCollapsed(isNowCollapsed);
                }
              }}
            >
              <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: inspectorCollapsed ? 'none' : 'flex', flexDirection: 'column' }}>
                <AiExecutionPanel />
              </div>
            </Panel>
            <PanelResizeHandle 
              disabled={inspectorCollapsed}
              className={`bg-[#05070d] transition-colors cursor-col-resize duration-150 relative z-30 flex-shrink-0 ${
                inspectorCollapsed ? 'hidden' : 'w-[4px] hover:bg-violet-600/60 active:bg-violet-500'
              }`} 
            />
          </PanelGroup>
        </div>
      </div>

      {/* 4. Footer Status Bar */}
      <StatusBar />
      <OpenWorkspaceModal />
    </div>
  );
};

export default WorkspaceLayout;
