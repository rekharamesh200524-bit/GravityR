'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Trash2, ChevronDown, Database, Cpu } from 'lucide-react';
import type { AgentLogEntry, LogLevel } from '../types';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-slate-600',
  info:  'text-slate-400',
  warn:  'text-amber-400',
  error: 'text-red-400',
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: '',
  info:  '',
  warn:  'bg-amber-950/10',
  error: 'bg-red-950/10',
};

const MODULE_COLOR: Record<string, string> = {
  Planner:           'text-violet-400',
  RepositorySearch:  'text-blue-400',
  ContextBuilder:    'text-cyan-400',
  PromptBuilder:     'text-emerald-400',
  ExecutionEngine:   'text-indigo-400',
  ResponseValidator: 'text-amber-400',
  ReviewEngine:      'text-pink-400',
};

interface AgentLogsProps {
  logs: AgentLogEntry[];
  onClear: () => void;
}

interface BackendExecutionLog {
  id: string;
  task_id: string;
  operation_type: string;
  details: string;
  status: string;
  execution_time: number;
  timestamp: string;
}

export const AgentLogs: React.FC<AgentLogsProps> = ({ logs, onClear }) => {
  const [logSource, setLogSource] = useState<'system' | 'execution'>('system');
  const [executionLogs, setExecutionLogs] = useState<BackendExecutionLog[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  // Fetch execution logs from backend API
  const fetchExecutionLogs = async () => {
    try {
      const apiBase = typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api')
        : 'http://localhost:8000/api';
        
      const res = await fetch(`${apiBase}/execution/logs`);
      if (res.ok) {
        const data = await res.json();
        setExecutionLogs(data);
      }
    } catch (e) {
      console.error("Failed to fetch tool execution logs:", e);
    }
  };

  useEffect(() => {
    if (logSource === 'execution') {
      void fetchExecutionLogs();
      // Poll every 3 seconds for live updates while on execution logs tab
      const interval = setInterval(fetchExecutionLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [logSource]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filtered.length, executionLogs.length, autoScroll]);

  return (
    <div className="rounded-xl border border-slate-850/60 bg-[#060810] overflow-hidden shadow-md">
      
      {/* ─── Log Source Selector Tab Header ─── */}
      <div className="flex border-b border-slate-950 bg-[#0b0c14]">
        <button
          onClick={() => setLogSource('system')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold tracking-wider uppercase border-none cursor-pointer transition-colors ${logSource === 'system' ? 'bg-[#060810] text-violet-400 border-b border-violet-500/30' : 'text-slate-550 hover:text-slate-300'}`}
        >
          <Cpu className="h-3.5 w-3.5" />
          System Process Logs
        </button>
        <button
          onClick={() => setLogSource('execution')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold tracking-wider uppercase border-none cursor-pointer transition-colors ${logSource === 'execution' ? 'bg-[#060810] text-violet-400 border-b border-violet-500/30' : 'text-slate-550 hover:text-slate-300'}`}
        >
          <Database className="h-3.5 w-3.5" />
          Tool Execution Logs
        </button>
      </div>

      {/* Header Controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-900 bg-[#07080e]/60">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
            {logSource === 'system' ? 'Live Agent Timeline' : 'Audit History Log'}
          </span>
          <span className="text-[9px] text-slate-700">
            ({logSource === 'system' ? logs.length : executionLogs.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {logSource === 'system' && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as LogLevel | 'all')}
              className="text-[9px] bg-slate-950 border border-slate-900 text-slate-400 rounded px-1.5 py-0.5 cursor-pointer outline-none font-mono"
            >
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="debug">Debug</option>
            </select>
          )}

          <button
            onClick={() => setAutoScroll((v) => !v)}
            title="Toggle auto-scroll"
            className={`p-1 rounded transition-colors ${autoScroll ? 'text-violet-400' : 'text-slate-600 hover:text-slate-400'}`}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          
          {logSource === 'system' && (
            <button
              onClick={onClear}
              title="Clear logs"
              className="p-1 rounded text-slate-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Log entries scroll container */}
      <div className="h-44 overflow-y-auto font-mono text-[9px] leading-relaxed">
        {logSource === 'system' ? (
          filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[10px] text-slate-700">
              No log entries
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-2 px-3 py-0.5 hover:bg-slate-950/40 ${LEVEL_BG[entry.level]}`}
                >
                  <span className="text-slate-700 flex-shrink-0 font-mono">
                    {new Date(entry.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={`font-semibold flex-shrink-0 w-10 ${LEVEL_COLORS[entry.level]}`}>
                    {entry.level.toUpperCase()}
                  </span>
                  <span className={`flex-shrink-0 ${MODULE_COLOR[entry.module] ?? 'text-slate-500'}`}>
                    [{entry.module}]
                  </span>
                  <span className="text-slate-400 flex-1 break-all leading-normal">
                    {entry.message}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )
        ) : (
          executionLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[10px] text-slate-700">
              No tool executions recorded yet
            </div>
          ) : (
            <div className="py-1 divide-y divide-slate-950">
              {executionLogs.map((entry) => (
                <div key={entry.id} className="px-3 py-1.5 hover:bg-slate-950/40 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[8px] px-1.5 py-0.2 border rounded uppercase font-bold tracking-wider ${
                        entry.status === 'success' ? 'text-emerald-400 border-emerald-500/10 bg-emerald-950/15' : 
                        entry.status === 'warning' ? 'text-amber-400 border-amber-500/10 bg-amber-950/15' : 
                        'text-red-400 border-red-500/10 bg-red-950/15'
                      }`}>
                        {entry.operation_type}
                      </span>
                      <span className="text-[8px] text-slate-650">{entry.timestamp}</span>
                    </div>
                    <div className="text-[10px] text-slate-350 truncate">{entry.details}</div>
                  </div>
                  <div className="text-right flex-shrink-0 text-slate-500 mt-0.5">
                    {entry.execution_time.toFixed(3)}s
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )
        )}
      </div>
    </div>
  );
};
