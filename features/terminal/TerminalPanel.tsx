'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as TerminalIcon, FileOutput, ShieldAlert, CircleX, Minimize2 } from 'lucide-react';
import { terminalService } from '../../services/terminalService';
import { useLayoutStore } from '../../stores/useLayoutStore';
import '@xterm/xterm/css/xterm.css';

export const TerminalPanel: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const { setTerminalCollapsed } = useLayoutStore();
  const [activeTab, setActiveTab] = useState<'terminal' | 'logs' | 'errors'>('terminal');

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create a new Terminal instance (Client side only)
    const term = new Terminal({
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

    // Connect Terminal instance to simulated terminal service
    terminalService.subscribe((data) => {
      term.write(data);
    });

    term.onData((data) => {
      terminalService.handleInput(data);
    });

    // Handle screen resizing
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (err) {
        // Suppress any layout engine errors
      }
    });
    
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#04060a]/90 border-t border-slate-900 overflow-hidden select-none">
      {/* Terminal Tab switcher header */}
      <div className="flex h-10 items-center justify-between px-4 border-b border-slate-900 bg-[#070911]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'terminal'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-450 hover:text-slate-200'
            }`}
          >
            <TerminalIcon className="h-3.5 w-3.5" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'logs'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-450 hover:text-slate-200'
            }`}
          >
            <FileOutput className="h-3.5 w-3.5" />
            <span>Developer Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('errors')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'errors'
                ? 'border-violet-500 text-violet-400 bg-slate-950/40'
                : 'border-transparent text-slate-450 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Problems</span>
            <span className="bg-red-950/40 border border-red-500/25 text-[10px] text-red-400 px-1 py-0.5 rounded-full font-mono font-medium leading-none">
              0
            </span>
          </button>
        </div>

        <button
          onClick={() => setTerminalCollapsed(true)}
          className="rounded p-1 text-slate-500 hover:bg-slate-900 hover:text-slate-300 transition-colors"
          title="Hide terminal"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 min-h-0 bg-[#04060a]">
        <div 
          className={`h-full w-full p-2 ${activeTab === 'terminal' ? 'block' : 'hidden'}`}
          ref={terminalRef} 
        />
        
        {activeTab === 'logs' && (
          <div className="h-full p-4 overflow-y-auto font-mono text-xs text-slate-400 space-y-1">
            <div>[13:51:40] <span className="text-violet-400">[GravityX API]</span> Connecting dev server...</div>
            <div>[13:51:41] <span className="text-violet-400">[GravityX API]</span> Workspace scanning successfully loaded.</div>
            <div>[13:51:42] <span className="text-emerald-400">[Compiler]</span> Hot Module Replacement connected.</div>
            <div>[13:52:01] <span className="text-slate-500">[Git Sync]</span> Checking repository states (0 modified files)</div>
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="h-full p-6 overflow-y-auto flex flex-col items-center justify-center text-center text-slate-500 text-xs gap-2">
            <CircleX className="h-8 w-8 text-slate-700" />
            <span>No compile errors in current workspace.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalPanel;
