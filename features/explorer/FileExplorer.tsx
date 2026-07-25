'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, FolderOpen, File, Search, ChevronRight, ChevronDown, 
  RefreshCw, Loader2, HelpCircle, Edit3, Trash2, Plus, FolderPlus, FilePlus
} from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { FileNode } from '../../types';

import { Button } from '../../components/ui/button';
import { pickNativeFolder } from '../../utils/nativePicker';

interface FileNodeItemProps {
  node: FileNode;
  depth: number;
  searchFilter: string;
  onContextMenu: (x: number, y: number, path: string, isFolder: boolean) => void;
}

const FileNodeItem: React.FC<FileNodeItemProps> = ({ node, depth, searchFilter, onContextMenu }) => {
  const { selectedFilePath, openTab } = useWorkspaceStore();
  const { setDiffPanelVisible, setActiveTab } = useLayoutStore();
  const [isOpen, setIsOpen] = useState(false);

  const isFolder = node.isFolder;
  const isSelected = selectedFilePath === node.path;

  // Search logic
  const matchesSearch = node.name.toLowerCase().includes(searchFilter.toLowerCase());
  const hasMatchingChildren = isFolder && node.children && node.children.some(child => 
    child.name.toLowerCase().includes(searchFilter.toLowerCase()) || 
    (child.isFolder && child.children && child.children.some(c => c.name.toLowerCase().includes(searchFilter.toLowerCase())))
  );

  if (searchFilter && !matchesSearch && !hasMatchingChildren) {
    return null;
  }

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      setIsOpen(!isOpen);
    } else {
      await openTab(node.path);
      setDiffPanelVisible(true);
      setActiveTab('diff');
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e.clientX, e.clientY, node.path, node.isFolder);
  };

  return (
    <div className="select-none">
      {/* Node Row */}
      <div
        onClick={handleToggle}
        onContextMenu={handleRightClick}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`group flex items-center justify-between pr-2 py-1 text-xs cursor-pointer transition-colors relative ${
          isSelected 
            ? 'bg-violet-650/15 text-violet-400 font-medium border-l-2 border-violet-500' 
            : 'text-slate-350 hover:bg-slate-900/60 hover:text-slate-100'
        }`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {isFolder ? (
            <>
              {isOpen ? (
                <ChevronDown className="h-3 w-3 text-slate-500" />
              ) : (
                <ChevronRight className="h-3 w-3 text-slate-500" />
              )}
              {isOpen ? (
                <FolderOpen className="h-3.5 w-3.5 text-violet-400" />
              ) : (
                <Folder className="h-3.5 w-3.5 text-violet-400" />
              )}
            </>
          ) : (
            <File className={`h-3.5 w-3.5 ${isSelected ? 'text-violet-400' : 'text-slate-500'}`} />
          )}
          <span className="truncate">{node.name}</span>
        </span>
        
        {/* Render size for files on hover */}
        {!isFolder && node.sizeBytes !== undefined && (
          <span className="hidden group-hover:inline text-[9px] text-slate-500 font-mono">
            {(node.sizeBytes / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      {/* Children list */}
      {isFolder && isOpen && node.children && (
        <div className="mt-0.5">
          {node.children.map((childNode) => (
            <FileNodeItem
              key={childNode.path}
              node={childNode}
              depth={depth + 1}
              searchFilter={searchFilter}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileExplorer: React.FC = () => {
  const { 
    currentProject, fileTree, isScanning, scanProcessedFiles, 
    triggerRescan, errorMessage, clearError, addNode, renameNode, deleteNode, openTab, openWorkspace
  } = useWorkspaceStore();
  const [searchFilter, setSearchFilter] = useState('');
  
  // Custom right-click Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isFolder: boolean } | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleContextMenuTrigger = (x: number, y: number, path: string, isFolder: boolean) => {
    setContextMenu({ x, y, path, isFolder });
  };

  const handleCreateFile = () => {
    if (!contextMenu) return;
    const name = prompt("Enter file name (e.g. index.tsx):");
    if (!name) return;
    addNode(contextMenu.path, name, false);
    // If it was created, open it
    const newPath = contextMenu.path.replace(/\/$/, "") + "/" + name;
    openTab(newPath);
  };

  const handleCreateFolder = () => {
    if (!contextMenu) return;
    const name = prompt("Enter folder name (e.g. components):");
    if (!name) return;
    addNode(contextMenu.path, name, true);
  };

  const handleRename = () => {
    if (!contextMenu) return;
    const name = prompt("Enter new name:", contextMenu.path.split('/').pop());
    if (!name) return;
    renameNode(contextMenu.path, name);
  };

  const handleDelete = () => {
    if (!contextMenu) return;
    if (confirm(`Are you sure you want to delete ${contextMenu.path}?`)) {
      deleteNode(contextMenu.path);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#080a14]/60 border-r border-slate-900/60 backdrop-blur-md relative select-none">
      {/* Search Header */}
      <div className="p-3 border-b border-slate-900/50 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-450 uppercase tracking-wider">
          <span>Files</span>
          
          <div className="flex items-center gap-1.5">
            {currentProject && (
              <button
                onClick={() => triggerRescan()}
                disabled={isScanning}
                className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer disabled:opacity-50 transition-colors"
                title="Rescan Workspace"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin text-violet-400' : ''}`} />
              </button>
            )}
          </div>
        </div>
        
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute top-2 left-2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full rounded-md bg-slate-900/80 border border-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/55 transition-colors"
          />
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-red-950/20 border-b border-red-500/20 text-red-400 text-[10px] px-3 py-1.5 flex items-center justify-between animate-fade-in">
          <span className="truncate">{errorMessage}</span>
          <button onClick={() => clearError()} className="font-semibold text-slate-400 hover:text-slate-100 ml-1">X</button>
        </div>
      )}

      {/* Scanning Progress */}
      {isScanning && (
        <div className="px-3 py-2 border-b border-slate-900 bg-violet-950/10 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-violet-400 font-semibold">
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Scanning Repository...</span>
            </span>
            <span>{scanProcessedFiles} Nodes</span>
          </div>
          <div className="w-full h-1 bg-slate-900 rounded overflow-hidden">
            <div className="h-full bg-violet-500 rounded animate-[pulse_1s_infinite]" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {/* File Tree List */}
      <div className="flex-grow overflow-y-auto py-2">
        {currentProject ? (
          fileTree.length > 0 ? (
            fileTree.map((node) => (
              <FileNodeItem
                key={node.path}
                node={node}
                depth={0}
                searchFilter={searchFilter}
                onContextMenu={handleContextMenuTrigger}
              />
            ))
          ) : (
            !isScanning && (
              <div className="text-center p-6 text-slate-500 text-xs italic">
                Folder is empty. Right-click here to create a file.
              </div>
            )
          )
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500 text-xs gap-2 h-full">
            <FolderOpen className="h-8 w-8 text-slate-700 mb-1" />
            <span>No workspace loaded.</span>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                const path = await pickNativeFolder();
                if (path) await openWorkspace(path);
              }}
              className="mt-1 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 cursor-pointer"
            >
              <span>Open Folder...</span>
            </Button>
          </div>
        )}
      </div>

      {/* Right-click Context Menu overlay */}
      {contextMenu && (
        <div 
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed rounded-md bg-[#0a0c16] border border-slate-850 p-1 shadow-2xl z-50 text-[11px] text-slate-350 w-44 font-sans select-none animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isFolder && (
            <>
              <button 
                onClick={handleCreateFile}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
              >
                <FilePlus className="h-3.5 w-3.5 text-violet-400" />
                <span>New File...</span>
              </button>
              <button 
                onClick={handleCreateFolder}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5 text-violet-400" />
                <span>New Folder...</span>
              </button>
              <div className="h-px bg-slate-900 my-1" />
            </>
          )}
          <button 
            onClick={handleRename}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5 text-violet-400" />
            <span>Rename Node...</span>
          </button>
          <button 
            onClick={handleDelete}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-red-400 rounded cursor-pointer transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span>Delete Node</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
