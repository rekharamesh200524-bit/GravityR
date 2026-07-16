'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XtermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { 
  Terminal as TerminalIcon, FileOutput, ShieldAlert, CircleX, Minimize2, 
  GitBranch, Server, Settings, Cpu 
} from 'lucide-react';
import { terminalService } from '../../services/terminalService';
import { useLayoutStore } from '../../stores/useLayoutStore';
import '@xterm/xterm/css/xterm.css';

type BottomTab = 'terminal' | 'problems' | 'output' | 'devlogs' | 'git' | 'ports' | 'ailogs';

export const BottomPanel: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XtermTerminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const { setTerminalCollapsed } = useLayoutStore();
  const [activeTab, setActiveTab] = useState<BottomTab>('terminal');

  useEffect(() => {
    if (activeTab !== 'terminal' || !terminalRef.current) return;

    // Instantiate Xterm (Client-side only)
    const term = new XtermTerminal({
      theme: {
        background: '#04060a',
        foreground: '#e2e8f0',
        cursor: '#8b5cf6',
        selectionBackground: 'rgba(139,92,246,0.3)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#cbd5e1',
      },
      fontFamily: 'var(--font-geist-mono), monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonInstance.current = fitAddon;

    // Connect Terminal data flow callbacks
    terminalService.subscribe((data) => {
      term.write(data);
    });

    term.onData((data) => {
      terminalService.handleInput(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (err) {
        // Ignored
      }
    });
    
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [activeTab]);

  return (
    <div className="flex flex-col h-full bg-[#04060a]/90 border-t border-slate-900 overflow-hidden select-none">
      {/* Tab Switcher Headers */}
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
          className="rounded p-1 text-slate-550 hover:bg-slate-900 hover:text-slate-300 transition-colors cursor-pointer"
          title="Minimize Panel"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-grow min-h-0 bg-[#04060a] relative">
        {/* Terminal Canvas */}
        <div 
          className={`h-full w-full p-2 font-mono ${activeTab === 'terminal' ? 'block' : 'hidden'}`}
          ref={terminalRef} 
        />
        
        {activeTab === 'problems' && (
          <div className="h-full overflow-y-auto flex flex-col items-center justify-center text-center text-slate-500 text-[11px] gap-1.5">
            <CircleX className="h-7 w-7 text-slate-700" />
            <span>No issues found in current project files.</span>
          </div>
        )}

        {activeTab === 'output' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-450 leading-relaxed">
            <div>[System] Launching GravityX compilation daemon...</div>
            <div>[System] Loaded Monaco components configuration context.</div>
            <div>[System] Ready for code execution inputs.</div>
          </div>
        )}

        {activeTab === 'devlogs' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-450 space-y-1">
            <div>[13:51:40] <span className="text-violet-400">[GravityX API]</span> Opening workspace...</div>
            <div>[13:51:41] <span className="text-violet-400">[GravityX API]</span> Loaded compiler indexes safely.</div>
            <div>[13:52:01] <span className="text-slate-500">[Git Sync]</span> Checking local repository states (clean working tree).</div>
          </div>
        )}

        {activeTab === 'git' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-450 leading-relaxed">
            <div>On branch main</div>
            <div>Your branch is up to date with 'origin/main'.</div>
            <div>nothing to commit, working tree clean</div>
          </div>
        )}

        {activeTab === 'ports' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-[11px] text-slate-450 space-y-2">
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
