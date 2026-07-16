'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, AlertTriangle, Zap, Coins } from 'lucide-react';
import type { PlannerOutput } from '../types';

const RISK_COLORS: Record<string, string> = {
  low:      'text-emerald-400 bg-emerald-950/20 border-emerald-500/20',
  medium:   'text-amber-400 bg-amber-950/20 border-amber-500/20',
  high:     'text-orange-400 bg-orange-950/20 border-orange-500/20',
  critical: 'text-red-400 bg-red-950/20 border-red-500/20',
};

const COMPLEXITY_COLORS: Record<string, string> = {
  trivial:        'text-slate-400',
  simple:         'text-emerald-400',
  moderate:       'text-amber-400',
  complex:        'text-orange-400',
  'very-complex': 'text-red-400',
};

interface PlannerOutputProps {
  output: PlannerOutput;
}

export const PlannerOutputPanel: React.FC<PlannerOutputProps> = ({ output }) => {
  const [stepsOpen, setStepsOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-850/60 bg-[#0b0d16]/40 overflow-hidden shadow-md">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-900 flex items-center justify-between">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Planner Output</div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${RISK_COLORS[output.riskLevel]}`}>
            {output.riskLevel.toUpperCase()} RISK
          </span>
          <span className={`text-[9px] font-semibold ${COMPLEXITY_COLORS[output.estimatedComplexity]}`}>
            {output.estimatedComplexity}
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 text-[11px] text-slate-300 leading-relaxed border-b border-slate-900/60">
        {output.summary}
      </div>

      {/* Stats row */}
      <div className="px-4 py-2.5 flex items-center gap-4 border-b border-slate-900/60">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <Zap className="h-3 w-3 text-violet-400" />
          <span>{output.executionSteps.length} steps</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <Coins className="h-3 w-3 text-amber-400" />
          <span>~{output.estimatedTokens.toLocaleString()} tokens</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <FileCode2 className="h-3 w-3 text-blue-400" />
          <span>{output.affectedFiles.length} file(s)</span>
        </div>
      </div>

      {/* Execution steps (collapsible) */}
      <button
        onClick={() => setStepsOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors border-b border-slate-900/60"
      >
        {stepsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Execution Steps
      </button>
      {stepsOpen && (
        <div className="px-4 pb-3 space-y-1.5 border-b border-slate-900/60">
          {output.executionSteps.map((step) => (
            <div key={step.id} className="flex items-start gap-2 text-[11px]">
              <span className="text-slate-600 font-mono flex-shrink-0 mt-0.5">{String(step.order).padStart(2, '0')}.</span>
              <div>
                <div className="text-slate-300">{step.title}</div>
                <div className="text-slate-600 text-[10px]">{step.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Affected files (collapsible) */}
      <button
        onClick={() => setFilesOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
      >
        {filesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Affected Files
      </button>
      {filesOpen && (
        <div className="px-4 pb-3 space-y-1">
          {output.affectedFiles.map((f, i) => (
            <div key={i} className="text-[10px] font-mono text-violet-400/80 truncate">{f}</div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {output.warnings.length > 0 && (
        <div className="px-4 pb-3 pt-2 border-t border-slate-900/60 space-y-1.5">
          {output.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] text-amber-400">
              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
