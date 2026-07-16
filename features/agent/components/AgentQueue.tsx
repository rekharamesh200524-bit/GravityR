'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, Clock, X } from 'lucide-react';
import type { QueueItem, TaskStatus } from '../types';

interface AgentQueueProps {
  queue: QueueItem[];
  onCancel: (taskId: string) => void;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  queued:              { label: 'Queued',    color: 'text-amber-400 bg-amber-950/30 border-amber-500/20',  icon: <Clock className="h-3 w-3" /> },
  planning:            { label: 'Running',   color: 'text-violet-400 bg-violet-950/30 border-violet-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  searching:           { label: 'Running',   color: 'text-violet-400 bg-violet-950/30 border-violet-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  'building-context':  { label: 'Running',   color: 'text-violet-400 bg-violet-950/30 border-violet-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  'building-prompt':   { label: 'Running',   color: 'text-violet-400 bg-violet-950/30 border-violet-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  'waiting-for-model': { label: 'Running',   color: 'text-blue-400 bg-blue-950/30 border-blue-500/20',    icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  validating:          { label: 'Running',   color: 'text-violet-400 bg-violet-950/30 border-violet-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  reviewing:           { label: 'Running',   color: 'text-violet-400 bg-violet-950/30 border-violet-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed:           { label: 'Done',      color: 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20', icon: <CheckCircle2 className="h-3 w-3" /> },
  failed:              { label: 'Failed',    color: 'text-red-400 bg-red-950/30 border-red-500/20',         icon: <XCircle className="h-3 w-3" /> },
  cancelled:           { label: 'Cancelled', color: 'text-slate-500 bg-slate-900/30 border-slate-700/20',   icon: <X className="h-3 w-3" /> },
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-400',
  high:   'bg-amber-400',
  normal: 'bg-violet-400',
  low:    'bg-slate-500',
};

export const AgentQueue: React.FC<AgentQueueProps> = ({ queue, onCancel }) => {
  if (queue.length === 0) return null;

  const running = queue.filter((q) =>
    !['completed', 'failed', 'cancelled', 'queued'].includes(q.task.status),
  );
  const waiting = queue.filter((q) => q.task.status === 'queued');
  const done = queue.filter((q) => ['completed', 'failed', 'cancelled'].includes(q.task.status));

  return (
    <div className="rounded-xl border border-slate-850/60 bg-[#0b0d16]/40 shadow-md overflow-hidden">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest border-b border-slate-900 px-4 py-2.5">
        Task Queue ({queue.length})
      </div>

      <div className="divide-y divide-slate-900/60 max-h-48 overflow-y-auto">
        {[...running, ...waiting, ...done].map((item) => {
          const config = STATUS_CONFIG[item.task.status];
          const isActive = !['completed', 'failed', 'cancelled', 'queued'].includes(item.task.status);
          return (
            <motion.div
              key={item.task.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2.5 px-4 py-2.5"
            >
              {/* Priority dot */}
              <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[item.task.priority] ?? 'bg-slate-500'}`} />

              {/* Prompt preview */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-slate-300 truncate font-sans">
                  {item.task.prompt}
                </div>
                <div className="text-[9px] text-slate-600 mt-0.5">
                  {new Date(item.task.createdAt).toLocaleTimeString()}
                </div>
              </div>

              {/* Status badge */}
              <span className={`flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${config.color} flex-shrink-0`}>
                {config.icon}
                {config.label}
              </span>

              {/* Cancel button (only for active / queued) */}
              {(isActive || item.task.status === 'queued') && (
                <button
                  onClick={() => onCancel(item.task.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Cancel task"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
