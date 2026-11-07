import React from 'react';
import { GitBranch, Wifi, Cpu, Folder, CheckCircle2, Loader2, Info } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useGitStore } from '../../stores/useGitStore';

export const StatusBar: React.FC = () => {
  const { currentProject, selectedFilePath, selectedFileEncoding, workspaceStatus, cursorLine, cursorCol } = useWorkspaceStore();
  const { model, provider } = useSettingsStore();
  const { branch, stagedFiles, unstagedFiles } = useGitStore();

  const getLanguageLabel = (path: string | null) => {
    if (!path) return '';
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'ts' || ext === 'tsx') return 'TypeScript JSX';
    if (ext === 'js' || ext === 'jsx') return 'JavaScript JSX';
    if (ext === 'php') return 'PHP';
    if (ext === 'py') return 'Python';
    if (ext === 'cs') return 'C#';
    if (ext === 'java') return 'Java';
    if (ext === 'json') return 'JSON';
    if (ext === 'md') return 'Markdown';
    if (ext === 'css') return 'CSS';
    if (ext === 'html') return 'HTML';
    return 'Plain Text';
  };

  const stagedCount = stagedFiles?.length || 0;
  const unstagedCount = unstagedFiles?.length || 0;

  return (
    <footer className="flex h-6 items-center justify-between border-t border-[var(--border-color,#0f172a)] bg-[var(--bg-statusbar,#04050a)] px-3 select-none text-[10px] text-[var(--fg-muted,#64748b)] font-mono z-40">
      {/* Left items */}
      <div className="flex items-center gap-3">
        {/* Workspace Project Name & Path */}
        {currentProject ? (
          <div className="flex items-center gap-1.5 text-[var(--fg-primary,#f8fafc)] font-semibold" title={currentProject.path}>
            <Folder className="h-3 w-3 text-violet-400" />
            <span>{currentProject.name}</span>
            <span className="text-[9px] text-[var(--fg-muted,#64748b)] font-normal hidden lg:inline max-w-[200px] truncate">({currentProject.path})</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[var(--fg-muted,#64748b)]">
            <Folder className="h-3 w-3" />
            <span>No Workspace</span>
          </div>
        )}

        {/* Current Branch & Git Status */}
        {currentProject && (
          <div className="flex items-center gap-2 border-l border-[var(--border-color,#1e293b)] pl-2">
            <div className="flex items-center gap-1 text-[var(--fg-secondary,#cbd5e1)] hover:text-[var(--accent-color,#8b5cf6)] cursor-pointer" title={`Active Branch: ${branch || 'main'}`}>
              <GitBranch className="h-3 w-3 text-violet-400" />
              <span>{branch || 'main'}</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] font-mono">
              <span className="text-emerald-400 font-semibold" title="Staged files">+{stagedCount}</span>
              <span className="text-amber-400 font-semibold" title="Unstaged files">-{unstagedCount}</span>
            </div>
          </div>
        )}

        {/* Workspace Lifecycle Status */}
        <div className="flex items-center gap-1 border-l border-[var(--border-color,#1e293b)] pl-2 font-sans font-semibold">
          {workspaceStatus === 'loading' && (
            <div className="flex items-center gap-1 text-sky-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="uppercase text-[9px]">Loading...</span>
            </div>
          )}
          {workspaceStatus === 'indexing' && (
            <div className="flex items-center gap-1 text-violet-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="uppercase text-[9px]">Indexing...</span>
            </div>
          )}
          {workspaceStatus === 'ready' && (
            <div className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span className="uppercase text-[9px]">Ready</span>
            </div>
          )}
          {workspaceStatus === 'idle' && (
            <div className="flex items-center gap-1 text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              <span className="uppercase text-[9px]">Idle</span>
            </div>
          )}
        </div>
      </div>

      {/* Right items */}
      <div className="flex items-center gap-4">
        {selectedFilePath && (
          <>
            <div>{getLanguageLabel(selectedFilePath)}</div>
            <div>{selectedFileEncoding.toUpperCase()}</div>
            <div className="hidden sm:block">Ln {cursorLine}, Col {cursorCol}</div>
          </>
        )}
        
        {/* Model stats */}
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3 w-3 text-[var(--fg-muted,#64748b)]" />
          <span className="capitalize">{provider}: {model.split('-').slice(0, 3).join('-')}</span>
        </div>
      </div>
    </footer>
  );
};

export default StatusBar;
