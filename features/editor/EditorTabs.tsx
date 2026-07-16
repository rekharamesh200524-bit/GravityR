'use client';

import React, { useState } from 'react';
import { X, File, FileJson, FileCode, BookOpen, Pin } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';

export const EditorTabs: React.FC = () => {
  const { openTabs, activeTab, setActiveTab, closeTab } = useWorkspaceStore();
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([]);

  if (openTabs.length === 0) return null;

  const getFileIcon = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'json') return <FileJson className="h-3.5 w-3.5 text-amber-500" />;
    if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') {
      return <FileCode className="h-3.5 w-3.5 text-blue-400" />;
    }
    if (ext === 'md') return <BookOpen className="h-3.5 w-3.5 text-emerald-450" />;
    return <File className="h-3.5 w-3.5 text-slate-400" />;
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path;
  };

  const handleDoubleClick = (path: string) => {
    if (pinnedTabs.includes(path)) {
      setPinnedTabs(pinnedTabs.filter(p => p !== path));
    } else {
      setPinnedTabs([...pinnedTabs, path]);
    }
  };

  const handleAuxClick = (e: React.MouseEvent, path: string) => {
    if (e.button === 1) { // Middle click
      e.preventDefault();
      e.stopPropagation();
      closeTab(path);
    }
  };

  return (
    <div className="flex h-9 bg-[#04060b] border-b border-slate-900 overflow-x-auto overflow-y-hidden select-none items-center scrollbar-none z-30 flex-shrink-0">
      {openTabs.map((tabPath) => {
        const isActive = activeTab === tabPath;
        const isPinned = pinnedTabs.includes(tabPath);
        return (
          <div
            key={tabPath}
            onClick={() => setActiveTab(tabPath)}
            onDoubleClick={() => handleDoubleClick(tabPath)}
            onAuxClick={(e) => handleAuxClick(e, tabPath)}
            className={`group flex items-center gap-2 h-full px-4 text-[11px] border-r border-slate-900 cursor-pointer transition-colors relative ${
              isActive 
                ? 'bg-[#1e1e1e] text-slate-100 border-t-2 border-t-violet-500' 
                : 'text-slate-450 hover:bg-slate-900/40 hover:text-slate-200 bg-[#07090e]'
            }`}
            title={`${tabPath} ${isPinned ? '(Pinned)' : '(Preview - Double click to Pin)'}`}
          >
            {/* File icon */}
            {getFileIcon(tabPath)}
            
            {/* Name - italicized if preview, bold if pinned */}
            <span className={`truncate max-w-[110px] ${isPinned ? 'font-semibold text-slate-200' : 'italic text-slate-400'}`}>
              {getFileName(tabPath)}
            </span>

            {/* Pin indicator */}
            {isPinned && <Pin className="h-2.5 w-2.5 text-violet-400 rotate-45" />}

            {/* Close tab */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tabPath);
              }}
              className="rounded p-0.5 hover:bg-slate-800 text-slate-500 hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default EditorTabs;
