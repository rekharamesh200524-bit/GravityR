'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Loader2, AlertCircle, SkipForward
} from 'lucide-react';
import type { TimelineStage } from '../types';

interface AgentTimelineProps {
  stages: TimelineStage[];
}

const STATUS_ICONS: Record<TimelineStage['status'], React.ReactNode> = {
  pending:   <Circle className="h-3.5 w-3.5 text-slate-700 flex-shrink-0" />,
  running:   <Loader2 className="h-3.5 w-3.5 text-violet-400 animate-spin flex-shrink-0" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />,
  failed:    <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />,
  skipped:   <SkipForward className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />,
};

const STATUS_TEXT: Record<TimelineStage['status'], string> = {
  pending:   'text-slate-600',
  running:   'text-slate-100 font-semibold',
  completed: 'text-slate-400',
  failed:    'text-red-400',
  skipped:   'text-slate-600',
};

export const AgentTimeline: React.FC<AgentTimelineProps> = ({ stages }) => {
  const hasAnyActivity = stages.some((s) => s.status !== 'pending');
  if (!hasAnyActivity) return null;

  return (
    <div className="rounded-xl border border-slate-850/60 bg-[#0b0d16]/40 p-4 space-y-1 shadow-md">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2 mb-3">
        Execution Pipeline
      </div>
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {stages.map((stage) => (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2.5"
            >
              <div className="mt-0.5">{STATUS_ICONS[stage.status]}</div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs leading-none ${STATUS_TEXT[stage.status]}`}>
                  {stage.label}
                </div>
                {stage.detail && stage.status !== 'pending' && (
                  <div className="text-[10px] text-slate-600 mt-0.5 font-mono truncate">
                    {stage.detail}
                  </div>
                )}
                {stage.durationMs !== undefined && (
                  <div className="text-[9px] text-slate-700 mt-0.5">
                    {stage.durationMs < 1000
                      ? `${stage.durationMs}ms`
                      : `${(stage.durationMs / 1000).toFixed(1)}s`}
                  </div>
                )}
              </div>
              {stage.status === 'running' && (
                <motion.div
                  className="h-1 w-1 rounded-full bg-violet-400 mt-1.5 flex-shrink-0"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
