'use client';

import React from 'react';
import { Cpu, Scale, FileText, ChevronRight, ShieldAlert, Sparkles, Terminal } from 'lucide-react';

interface OptimizedContextFile {
  path: string;
  filePath?: string;
  fileName?: string;
  content: string;
  language: string;
  original_size?: number;
  optimized_size?: number;
}

interface PromptPreviewProps {
  optimizedPrompt: {
    system_prompt: string;
    user_prompt: string;
    context_files: OptimizedContextFile[];
    compression_summary: string;
    metrics: {
      prompt_tokens: number;
      context_tokens: number;
      history_tokens: number;
      current_tokens: number;
      max_tokens: number;
      remaining_tokens: number;
      estimated_cost_usd: number;
      overflow: boolean;
      requires_compression: boolean;
      compression_ratio_pct: number;
      optimized_char_count: number;
    };
  } | null;
}

export const PromptPreview: React.FC<PromptPreviewProps> = ({ optimizedPrompt }) => {
  if (!optimizedPrompt) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Sparkles className="h-8 w-8 text-violet-500/20 mb-3" />
        <p className="text-xs text-slate-500">Prompt optimization metrics will appear once an instruction begins execution.</p>
      </div>
    );
  }

  const { system_prompt, user_prompt, context_files, compression_summary, metrics } = optimizedPrompt;

  return (
    <div className="space-y-4 text-slate-350">
      
      {/* ─── Metric Dashboard Cards ─── */}
      <div className="grid grid-cols-2 gap-2.5">
        
        {/* Token Count Budget */}
        <div className="bg-[#0b0c16] border border-slate-900 rounded-lg p-3 relative overflow-hidden">
          <div className="absolute top-2 right-2 text-violet-400/20">
            <Cpu className="h-4 w-4" />
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Token Budget</div>
          <div className="text-lg font-bold text-slate-100 mt-1 font-mono">
            {metrics.current_tokens.toLocaleString()} <span className="text-xs text-slate-500 font-normal">/ {metrics.max_tokens.toLocaleString()}</span>
          </div>
          <div className="text-[9px] text-slate-400 mt-1.5 flex items-center gap-1 font-mono">
            Remaining: <strong className="text-emerald-400">{(metrics.remaining_tokens).toLocaleString()}</strong>
          </div>
        </div>

        {/* Compression metrics */}
        <div className="bg-[#0b0c16] border border-slate-900 rounded-lg p-3 relative overflow-hidden">
          <div className="absolute top-2 right-2 text-fuchsia-400/20">
            <Scale className="h-4 w-4" />
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Compression Ratio</div>
          <div className="text-lg font-bold text-fuchsia-400 mt-1 font-mono">
            {metrics.compression_ratio_pct > 0 ? `${metrics.compression_ratio_pct}%` : '0%'}
          </div>
          <div className="text-[9px] text-slate-400 mt-1.5 flex items-center gap-1 font-mono">
            Size: <strong className="text-slate-200">{(metrics.optimized_char_count / 1000).toFixed(1)}k</strong> chars
          </div>
        </div>

      </div>

      {/* ─── Additional Info Panel ─── */}
      <div className="bg-[#090b11] border border-slate-900 rounded-lg p-3 space-y-1.5 text-[10px] font-mono leading-relaxed">
        <div className="flex justify-between">
          <span className="text-slate-500">Prompt Tokens:</span>
          <span className="text-slate-300">{metrics.prompt_tokens}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Context Tokens:</span>
          <span className="text-slate-300">{metrics.context_tokens}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">History Tokens:</span>
          <span className="text-slate-300">{metrics.history_tokens}</span>
        </div>
        <div className="flex justify-between border-t border-slate-900/60 pt-1.5 mt-1">
          <span className="text-slate-500">Estimated Cost:</span>
          <span className="text-emerald-400">${metrics.estimated_cost_usd.toFixed(6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Expected Response Size:</span>
          <span className="text-slate-300">~2,048 tokens</span>
        </div>
      </div>

      {/* ─── Compression Summary ─── */}
      <div className="bg-[#0b0c16]/50 border border-slate-900 rounded-lg p-3 flex gap-2">
        <ShieldAlert className="h-4 w-4 text-violet-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-300">Compression Summary</div>
          <p className="text-[9px] text-slate-500 leading-normal">{compression_summary}</p>
        </div>
      </div>

      {/* ─── Context File Nodes List ─── */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Optimized Context Files ({context_files.length})</div>
        <div className="space-y-1.5">
          {context_files.map((file, idx) => {
            const ratio = file.original_size && file.optimized_size
              ? Math.round((1.0 - (file.optimized_size / file.original_size)) * 100) 
              : 0;
            return (
              <div key={idx} className="flex items-center justify-between bg-[#0a0b12] border border-slate-900/60 hover:border-slate-800 rounded-lg p-2.5 transition-all">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                  <div className="truncate text-xs font-semibold text-slate-200">
                    {file.fileName || file.path.split('/').pop()}
                    <span className="block text-[8px] text-slate-500 font-mono mt-0.5 truncate">{file.filePath || file.path}</span>
                  </div>
                </div>
                <div className="text-right text-[10px] font-mono flex-shrink-0 ml-4 space-y-0.5">
                  <div className="text-slate-300">{((file.optimized_size || 0) / 1000).toFixed(1)}kb</div>
                  {ratio > 0 && (
                    <div className="text-[8px] text-fuchsia-400">-{ratio}% compressed</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Prompt Text Previews ─── */}
      <div className="space-y-3">
        
        {/* System Prompt */}
        <div className="border border-slate-900 rounded-lg overflow-hidden bg-[#07080e]">
          <div className="bg-[#0b0c16] px-3 py-2 border-b border-slate-900 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 flex items-center gap-1.5">
              <Terminal className="h-3 w-3 text-violet-400" /> System Prompt Instructions
            </span>
          </div>
          <pre className="p-3 text-[10px] font-mono leading-relaxed overflow-x-auto text-slate-400 max-h-48 whitespace-pre-wrap select-text">
            {system_prompt}
          </pre>
        </div>

        {/* User Prompt */}
        <div className="border border-slate-900 rounded-lg overflow-hidden bg-[#07080e]">
          <div className="bg-[#0b0c16] px-3 py-2 border-b border-slate-900 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-violet-400" /> User Request & Planning context
            </span>
          </div>
          <pre className="p-3 text-[10px] font-mono leading-relaxed overflow-x-auto text-slate-400 max-h-36 whitespace-pre-wrap select-text">
            {user_prompt}
          </pre>
        </div>

      </div>

    </div>
  );
};
