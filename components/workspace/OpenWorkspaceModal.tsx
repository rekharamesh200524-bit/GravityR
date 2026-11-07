'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { FolderOpen, HardDrive, History, ArrowRight, Loader2, Sparkles, Folder } from 'lucide-react';
import { pickNativeFolder } from '../../utils/nativePicker';

export const OpenWorkspaceModal: React.FC = () => {
  const { isFolderModalOpen, setFolderModalOpen, openWorkspace, recentProjects, fetchRecents } = useWorkspaceStore();
  const [folderPath, setFolderPath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isFolderModalOpen) {
      fetchRecents();
      setErrorMsg(null);
      const last = localStorage.getItem('gravityx_last_workspace_path') || 'd:\\GravityR';
      setFolderPath(last);
    }
  }, [isFolderModalOpen, fetchRecents]);

  const handleOpen = async (targetPath?: string) => {
    const path = (targetPath || folderPath).trim();
    if (!path) {
      setErrorMsg('Please enter or select a valid project directory path.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      await openWorkspace(path);
      setFolderModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to open specified workspace directory.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowseNative = async () => {
    try {
      const picked = await pickNativeFolder();
      if (picked) {
        setFolderPath(picked);
        await handleOpen(picked);
      }
    } catch (e: any) {
      console.warn('Native picker error:', e);
    }
  };

  const handleDirectoryInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const first = files[0];
      const absolutePath = (first as any).path;
      if (absolutePath) {
        const parts = absolutePath.split(/[/\\]/);
        const relParts = (first.webkitRelativePath || '').split('/');
        if (relParts.length > 1) {
          const rootFolder = relParts[0];
          const idx = parts.lastIndexOf(rootFolder);
          if (idx !== -1) {
            const rootPath = parts.slice(0, idx + 1).join('\\');
            setFolderPath(rootPath);
            handleOpen(rootPath);
            return;
          }
        }
        setFolderPath(absolutePath);
        handleOpen(absolutePath);
      } else if (first.webkitRelativePath) {
        const rootFolder = first.webkitRelativePath.split('/')[0];
        const userEntered = prompt(`Selected folder '${rootFolder}'. Please confirm full path on disk:`, `D:\\Projects\\${rootFolder}`);
        if (userEntered) {
          setFolderPath(userEntered);
          handleOpen(userEntered);
        }
      }
    }
  };

  if (!isFolderModalOpen) return null;

  return (
    <Dialog
      isOpen={isFolderModalOpen}
      onClose={() => setFolderModalOpen(false)}
      title="Open Project Workspace"
    >
      <div className="flex flex-col gap-4 py-2">
        <p className="text-xs text-slate-400">
          Enter or browse to the project folder on your host machine to activate AI tools and Explorer.
        </p>

        {/* Direct Path Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Workspace Folder Path</span>
            <span className="text-[10px] text-slate-500 font-normal">Windows/Unix absolute path</span>
          </label>
          <div className="relative flex items-center">
            <HardDrive className="absolute left-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
              placeholder="e.g. D:\Projects\MyReactApp or d:\GravityR"
              className="w-full rounded-lg bg-slate-900/90 border border-slate-800 pl-9 pr-24 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors font-mono"
            />
            <div className="absolute right-1 flex items-center gap-1">
              <label className="cursor-pointer px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] text-violet-300 rounded font-medium transition-colors">
                Browse
                <input
                  type="file"
                  //@ts-ignore
                  webkitdirectory=""
                  directory=""
                  className="hidden"
                  onChange={handleDirectoryInput}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Quick Action Native Launcher */}
        <button
          type="button"
          onClick={handleBrowseNative}
          className="flex items-center justify-between p-3 rounded-lg border border-violet-900/40 bg-violet-950/20 hover:bg-violet-950/40 transition-colors text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-violet-600/20 text-violet-400 group-hover:scale-105 transition-transform">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">Launch Browser OS Folder Picker</div>
              <div className="text-[10px] text-slate-400">Select directory natively using File Explorer</div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-violet-400 transition-colors" />
        </button>

        {/* Error Message */}
        {errorMsg && (
          <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 p-2.5 rounded-md">
            {errorMsg}
          </div>
        )}

        {/* Recent Workspaces */}
        {recentProjects.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-850">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="h-3 w-3 text-slate-500" />
              <span>Recent Projects</span>
            </span>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
              {recentProjects.slice(0, 5).map((project) => (
                <button
                  key={project.path}
                  onClick={() => {
                    setFolderPath(project.path);
                    handleOpen(project.path);
                  }}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-slate-850 text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-300 group-hover:text-violet-200 truncate">{project.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">{project.path}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-850">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFolderModalOpen(false)}
            disabled={isLoading}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpen()}
            disabled={isLoading || !folderPath.trim()}
            className="text-xs font-semibold px-4 flex items-center gap-1.5"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Opening...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Open Workspace</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
