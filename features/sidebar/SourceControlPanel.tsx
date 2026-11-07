'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  GitCommit, GitPullRequest, Upload, RefreshCw, RotateCcw,
  Plus, Minus, ChevronDown, ChevronRight, Loader2, X,
  ArrowUp, ArrowDown, CloudUpload, CheckCircle2
} from 'lucide-react';
import { useGitStore } from '../../stores/useGitStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';

export const SourceControlPanel: React.FC = () => {
  const {
    branch,
    commitHash,
    stagedFiles,
    unstagedFiles,
    commitInput,
    setCommitInput,
    commitStaged,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    pushRepo,
    pullRepo,
    fetchRepo,
    syncRepo,
    openDiff,
    fetchGitStatus,
    isPushing,
    isPulling,
    isFetching,
    isSyncing,
    gitNotification,
    clearGitNotification,
    ahead,
    behind,
  } = useGitStore();

  const { currentProject } = useWorkspaceStore();
  const dirtyCount = useWorkspaceStore((state) => state.dirtyFiles.size);
  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0 || dirtyCount > 0;

  const [isCommitting, setIsCommitting] = useState(false);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);

  // Poll git status every 10 seconds
  useEffect(() => {
    if (!currentProject) return;
    fetchGitStatus();
    const interval = setInterval(() => fetchGitStatus(), 10000);
    return () => clearInterval(interval);
  }, [fetchGitStatus, currentProject]);

  const handleCommit = async () => {
    if (!commitInput.trim() || !hasChanges) return;
    setIsCommitting(true);
    await commitStaged(commitInput);
    setIsCommitting(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'M': return 'text-amber-400';
      case 'A': return 'text-emerald-400';
      case 'D': return 'text-rose-400';
      case 'R': return 'text-sky-400';
      case 'U': return 'text-orange-400';
      case '?': return 'text-slate-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'M': return 'M';
      case 'A': return 'A';
      case 'D': return 'D';
      case 'R': return 'R';
      case 'U': return 'U';
      case '?': return '?';
      default: return status;
    }
  };

  const isOperating = isPushing || isPulling || isFetching || isSyncing;

  return (
    <div className="flex flex-col h-full bg-[#080a14]/60 text-slate-200 overflow-hidden select-none font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-900/60">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Source Control
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchGitStatus()}
            title="Refresh"
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => fetchRepo()}
            disabled={isFetching}
            title="Fetch"
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Branch info */}
      <div className="px-3 py-1.5 border-b border-slate-900/40 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <GitCommit className="h-3 w-3 text-violet-400" />
          <span className="font-mono text-violet-300">{branch}</span>
          {commitHash && (
            <span className="text-slate-600 font-mono">{commitHash}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          {ahead > 0 && (
            <span className="flex items-center gap-0.5 text-violet-400">
              <ArrowUp className="h-2.5 w-2.5" />{ahead}
            </span>
          )}
          {behind > 0 && (
            <span className="flex items-center gap-0.5 text-amber-400">
              <ArrowDown className="h-2.5 w-2.5" />{behind}
            </span>
          )}
        </div>
      </div>

      {/* Notification banner */}
      {gitNotification && (
        <div className={`px-3 py-2 border-b text-[11px] flex items-center justify-between gap-2 transition-all ${
          gitNotification.type === 'success'
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {gitNotification.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{gitNotification.message}</span>
          </div>
          <button onClick={clearGitNotification} className="shrink-0 text-current opacity-60 hover:opacity-100 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">

        {/* Commit message input */}
        <div className="p-3 border-b border-slate-900/50 space-y-2">
          <textarea
            value={commitInput}
            onChange={(e) => setCommitInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleCommit();
              }
            }}
            placeholder="Message (Ctrl+Enter to commit)"
            className="w-full h-16 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500/80 resize-none font-sans"
          />

          {/* Ahead hint */}
          {ahead > 0 && (
            <p className="text-[10px] text-violet-400/80 font-sans flex items-center gap-1">
              <span className="font-mono font-bold">↑ {ahead}</span>
              <span>{ahead === 1 ? 'commit' : 'commits'} ready to push</span>
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {/* Commit button */}
            <button
              onClick={handleCommit}
              disabled={isCommitting || !commitInput.trim() || !hasChanges}
              className={`w-full py-1.5 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                hasChanges && commitInput.trim()
                  ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <GitCommit className="h-3.5 w-3.5" />
              <span>
                {isCommitting
                  ? 'Committing...'
                  : `Commit (${stagedFiles.length > 0 ? stagedFiles.length : dirtyCount + unstagedFiles.length})`}
              </span>
            </button>

            {/* Push & Sync row */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => pushRepo()}
                disabled={isPushing || isOperating}
                title="Push to origin"
                className="py-1 px-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-200 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isPushing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                    <span>Pushing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3 w-3 text-violet-400" />
                    <span>Push</span>
                  </>
                )}
              </button>
              <button
                onClick={() => pullRepo()}
                disabled={isPulling || isOperating}
                title="Pull from origin"
                className="py-1 px-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-200 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isPulling ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
                    <span>Pulling...</span>
                  </>
                ) : (
                  <>
                    <GitPullRequest className="h-3 w-3 text-sky-400" />
                    <span>Pull</span>
                  </>
                )}
              </button>
            </div>

            {/* Sync button */}
            <button
              onClick={() => syncRepo()}
              disabled={isSyncing || isOperating}
              title="Pull then Push"
              className="w-full py-1 px-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-200 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <CloudUpload className="h-3 w-3 text-emerald-400" />
                  <span>Sync (Pull + Push)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Staged files */}
        <div>
          <div
            onClick={() => setStagedExpanded(!stagedExpanded)}
            className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-slate-900/40 transition-colors border-b border-slate-900/30"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {stagedExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>Staged Changes</span>
              <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full font-mono">
                {stagedFiles.length}
              </span>
            </div>
            {stagedFiles.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); unstageAll(); }}
                title="Unstage all"
                className="p-0.5 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Minus className="h-3 w-3" />
              </button>
            )}
          </div>
          {stagedExpanded && stagedFiles.map((file) => (
            <div
              key={file.path}
              onClick={() => openDiff(file.path, true)}
              className="flex items-center justify-between px-3 py-1 group hover:bg-slate-900/40 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] font-bold font-mono w-3 shrink-0 ${getStatusColor(file.status)}`}>
                  {getStatusLabel(file.status)}
                </span>
                <span className="text-[11px] text-slate-300 truncate">{file.path.split('/').pop()}</span>
                <span className="text-[10px] text-slate-600 truncate hidden group-hover:block">
                  {file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); unstageFile(file.path); }}
                title="Unstage"
                className="p-0.5 rounded text-slate-600 hover:text-rose-400 hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              >
                <Minus className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Unstaged files */}
        <div>
          <div
            onClick={() => setUnstagedExpanded(!unstagedExpanded)}
            className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-slate-900/40 transition-colors border-b border-slate-900/30 border-t border-slate-900/30"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {unstagedExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>Changes</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-mono">
                {unstagedFiles.length}
              </span>
            </div>
            {unstagedFiles.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); stageAll(); }}
                title="Stage all"
                className="p-0.5 rounded text-slate-600 hover:text-emerald-400 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
          {unstagedExpanded && unstagedFiles.map((file) => (
            <div
              key={file.path}
              onClick={() => openDiff(file.path, false)}
              className="flex items-center justify-between px-3 py-1 group hover:bg-slate-900/40 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] font-bold font-mono w-3 shrink-0 ${getStatusColor(file.status)}`}>
                  {getStatusLabel(file.status)}
                </span>
                <span className="text-[11px] text-slate-300 truncate">{file.path.split('/').pop()}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); stageFile(file.path); }}
                title="Stage"
                className="p-0.5 rounded text-slate-600 hover:text-emerald-400 hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {!hasChanges && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/40 mb-3" />
            <p className="text-xs text-slate-500">No changes</p>
            <p className="text-[10px] text-slate-600 mt-1">Working tree clean</p>
          </div>
        )}
      </div>
    </div>
  );
};
