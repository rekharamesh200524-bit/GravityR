import React from 'react';
import { GitBranch, Wifi, Cpu, Layers } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useSettingsStore } from '../../stores/useSettingsStore';

export const StatusBar: React.FC = () => {
  const { currentProject, selectedFilePath, selectedFileEncoding, isScanning, cursorLine, cursorCol } = useWorkspaceStore();
  const { model, provider } = useSettingsStore();

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

  return (
    <footer className="flex h-6 items-center justify-between border-t border-slate-900 bg-[#04050a] px-3 select-none text-[10px] text-slate-500 font-mono z-40">
      {/* Left items */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-violet-650/10 border border-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded-sm text-[9px] font-sans font-semibold uppercase tracking-wider">
          gravityx
        </div>
        
        {currentProject && (
          <div className="flex items-center gap-1 hover:text-slate-350 cursor-pointer">
            <GitBranch className="h-3 w-3 text-slate-500" />
            <span>local-fs</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <span className="flex h-1.5 w-1.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-[9px] font-sans uppercase font-bold text-emerald-500">Connected</span>
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
          <Cpu className="h-3 w-3 text-slate-500" />
          <span className="capitalize">{provider}: {model.split('-').slice(0, 3).join('-')}</span>
        </div>
        
        {isScanning && (
          <div className="flex items-center gap-1 text-violet-400">
            <span className="animate-spin h-2 w-2 border border-violet-400 border-t-transparent rounded-full" />
            <span>Indexing...</span>
          </div>
        )}
      </div>
    </footer>
  );
};

export default StatusBar;
