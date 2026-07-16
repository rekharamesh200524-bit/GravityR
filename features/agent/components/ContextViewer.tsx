'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import type { ContextBuildOutput, ContextFile } from '../types';

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-slate-600';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-slate-600 w-6 text-right">{pct}%</span>
    </div>
  );
}

function ContextFileRow({ file }: { file: ContextFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-900/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-slate-900/20 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-3 w-3 text-slate-600 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-slate-600 flex-shrink-0" />}
        <FileCode2 className="h-3 w-3 text-violet-400 flex-shrink-0" />
        <span className="flex-1 text-[10px] font-mono text-violet-400/80 truncate">{file.filePath}</span>
        <span className="text-[9px] text-slate-600 flex-shrink-0">{(file.sizeBytes / 1024).toFixed(1)}kb</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-slate-900/60 bg-slate-950/20">
          <div className="text-[9px] text-slate-600 pt-2">{file.reason}</div>
          <ConfidenceBar value={file.confidence} />
        </div>
      )}
    </div>
  );
}

interface ContextViewerProps {
  output: ContextBuildOutput;
}

export const ContextViewer: React.FC<ContextViewerProps> = ({ output }) => {
  if (output.files.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-850/60 bg-[#0b0d16]/40 overflow-hidden shadow-md">
      <div className="px-4 py-3 border-b border-slate-900 flex items-center justify-between">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Context Files</div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-600">{output.files.length} files</span>
          <span className="text-[9px] text-slate-700">·</span>
          <span className="text-[9px] text-slate-600">~{output.totalTokenEstimate.toLocaleString()} tokens</span>
          {output.truncated && (
            <span className="text-[9px] text-amber-400 bg-amber-950/20 border border-amber-500/20 px-1.5 py-0.5 rounded">
              TRUNCATED
            </span>
          )}
        </div>
      </div>
      <div className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
        {output.files.map((file) => (
          <ContextFileRow key={file.filePath} file={file} />
        ))}
      </div>
    </div>
  );
};
