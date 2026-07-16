'use client';

import React, { useState } from 'react';
import { AlertTriangle, Info, XCircle, FileDiff, CheckCircle2, ThumbsUp, ThumbsDown, Activity } from 'lucide-react';
import type { ReviewData } from '../types';
import ReactMarkdown from 'react-markdown';
import { useAgentStore } from '../../../stores/useAgentStore';
import { useProjectStore } from '../../../stores/useProjectStore';
import { useWorkspaceStore } from '../../../stores/useWorkspaceStore';

const SEVERITY_CONFIG = {
  info:    { icon: <Info className="h-3 w-3" />,          color: 'text-blue-400 bg-blue-950/20 border-blue-500/20' },
  warning: { icon: <AlertTriangle className="h-3 w-3" />, color: 'text-amber-400 bg-amber-950/20 border-amber-500/20' },
  error:   { icon: <XCircle className="h-3 w-3" />,       color: 'text-red-400 bg-red-950/20 border-red-500/20' },
};

const CHANGE_COLORS = {
  created:  'text-emerald-400',
  modified: 'text-amber-400',
  deleted:  'text-red-400',
  renamed:  'text-blue-400',
};

interface ReviewPanelProps {
  review: ReviewData;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ review }) => {
  const { approveTask, rejectTask } = useAgentStore();
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // Calculate stats
  const totalAdded = review.filesChanged?.reduce((acc, f) => acc + (f.linesAdded || 0), 0) || 0;
  const totalRemoved = review.filesChanged?.reduce((acc, f) => acc + (f.linesRemoved || 0), 0) || 0;
  const totalLines = totalAdded + totalRemoved;
  
  // Calculate impact
  const estimatedImpact = totalLines >= 150 ? 'High Impact' : totalLines >= 40 ? 'Medium Impact' : 'Low Impact';
  const impactColor = totalLines >= 150 ? 'text-red-400 border-red-500/20 bg-red-950/10' : totalLines >= 40 ? 'text-amber-400 border-amber-500/20 bg-amber-950/10' : 'text-emerald-400 border-emerald-500/20 bg-emerald-950/10';

  const handleFileClick = (f: any) => {
    // Open in Monaco Diff panel
    useProjectStore.setState({
      activeFilePath: f.filePath,
      activeFileOriginalContent: f.originalContent || "",
      activeFileContent: f.modifiedContent || "",
      isEditing: true
    });
    
    // Add to open tabs and set active
    void useWorkspaceStore.getState().openTab(f.filePath);
    void useWorkspaceStore.getState().setActiveTab(f.filePath);
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await approveTask(review.taskId);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await rejectTask(review.taskId);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="space-y-4">
      
      {/* ─── Metric & KPI Dashboard Cards ─── */}
      <div className="grid grid-cols-2 gap-2.5">
        
        {/* Confidence score */}
        <div className="bg-[#0b0c16] border border-slate-900 rounded-lg p-3 relative overflow-hidden">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">AI Confidence</div>
          <div className="text-lg font-bold text-slate-100 mt-1 font-mono">
            {Math.round((review.confidence || 0.95) * 100)}%
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 mt-2">
            <div 
              className="bg-violet-500 h-1.5 rounded-full" 
              style={{ width: `${Math.round((review.confidence || 0.95) * 100)}%` }}
            />
          </div>
        </div>

        {/* Estimated Impact */}
        <div className="bg-[#0b0c16] border border-slate-900 rounded-lg p-3 relative overflow-hidden">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Estimated Impact</div>
          <div className="text-lg font-bold mt-1">
            <span className={`text-xs px-2 py-0.5 border rounded font-mono font-bold uppercase tracking-wider ${impactColor}`}>
              {estimatedImpact}
            </span>
          </div>
          <div className="text-[9px] text-slate-400 mt-2 flex items-center gap-1 font-mono">
            <Activity className="h-3 w-3 text-violet-400" />
            Total delta: <strong className="text-slate-200">+{totalAdded} / -{totalRemoved}</strong> lines
          </div>
        </div>

      </div>

      {/* ─── Summary ─── */}
      <div className="rounded-lg border border-slate-900 bg-[#0b0d16]/40 p-4 shadow-md">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5">Review Summary</div>
        <p className="text-[11px] text-slate-350 leading-relaxed">{review.summary}</p>

        {/* Complexity + approval badge */}
        <div className="flex items-center gap-2 mt-3.5">
          <span className="text-[9px] text-slate-400 font-mono px-1.5 py-0.5 rounded border border-slate-900 bg-slate-950 uppercase">
            Complexity: {review.complexity}
          </span>
          {review.requiresHumanApproval ? (
            <span className="text-[9px] text-amber-400 bg-amber-950/20 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              Human Review Required
            </span>
          ) : (
            <span className="text-[9px] text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Auto-Approvable
            </span>
          )}
        </div>
      </div>

      {/* ─── Action Approval Bar ─── */}
      <div className="flex items-center gap-3 bg-[#0a0b13] border border-slate-900 p-3 rounded-lg shadow-inner">
        <button
          onClick={handleReject}
          disabled={isRejecting || isApproving}
          className="flex-1 flex items-center justify-center gap-2 text-[11px] font-bold text-red-400 hover:text-red-300 bg-red-950/20 border border-red-500/30 hover:border-red-500/50 rounded-lg py-2.5 transition-all cursor-pointer disabled:opacity-50"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          {isRejecting ? 'Rejecting...' : 'Reject All Changes'}
        </button>

        <button
          onClick={handleApprove}
          disabled={isApproving || isRejecting}
          className="flex-1 flex items-center justify-center gap-2 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg py-2.5 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-950/20"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          {isApproving ? 'Approving...' : 'Approve All Changes'}
        </button>
      </div>

      {/* ─── Files changed ─── */}
      {review.filesChanged && review.filesChanged.length > 0 && (
        <div className="rounded-lg border border-slate-900 bg-[#0b0d16]/40 overflow-hidden shadow-md">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-4 py-2.5 border-b border-slate-900 flex justify-between items-center">
            <span>Files Changed ({review.filesChanged.length})</span>
            <span className="text-[8px] text-slate-600 lowercase font-normal italic">click file to inspect diff</span>
          </div>
          <div className="divide-y divide-slate-950">
            {review.filesChanged.map((f, idx) => (
              <button 
                key={idx} 
                onClick={() => handleFileClick(f)}
                className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-[#07080e] transition-colors text-left border-none cursor-pointer"
              >
                <FileDiff className={`h-3.5 w-3.5 flex-shrink-0 ${CHANGE_COLORS[f.changeType || 'modified']}`} />
                <div className="flex-1 min-w-0">
                  <span className="block text-[11px] font-mono text-slate-200 truncate font-semibold">{f.filePath.split('/').pop()}</span>
                  <span className="block text-[8px] font-mono text-slate-500 truncate mt-0.5">{f.filePath}</span>
                </div>
                <div className="text-right text-[10px] font-mono flex-shrink-0 ml-4 space-x-1.5">
                  <span className="text-emerald-400">+{f.linesAdded}</span>
                  <span className="text-red-400">-{f.linesRemoved}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Warnings ─── */}
      {review.warnings && review.warnings.length > 0 && (
        <div className="rounded-lg border border-slate-900 bg-[#0b0d16]/40 overflow-hidden shadow-md">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-4 py-2.5 border-b border-slate-900">
            Warnings & Safety Warnings ({review.warnings.length})
          </div>
          <div className="p-3 space-y-2">
            {review.warnings.map((w) => {
              const cfg = SEVERITY_CONFIG[w.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.warning;
              return (
                <div key={w.id} className={`flex items-start gap-2 text-[10px] rounded-lg border px-3 py-2 ${cfg.color}`}>
                  <div className="mt-0.5 flex-shrink-0">{cfg.icon}</div>
                  <span>{w.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Review notes ─── */}
      {review.reviewNotes && (
        <div className="rounded-lg border border-violet-950/20 bg-violet-950/5 p-4 shadow-md">
          <div className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest mb-2.5">AI Engine Review Notes</div>
          <div className="text-[10px] text-slate-400 leading-relaxed prose prose-invert max-w-none prose-sm">
            <ReactMarkdown>{review.reviewNotes}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
