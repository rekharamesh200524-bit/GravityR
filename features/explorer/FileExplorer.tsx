'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Folder, FolderOpen, File, Search, ChevronRight, ChevronDown, 
  RefreshCw, Loader2, FileCode, FileJson, BookOpen, Code, Braces,
  Image as ImageIcon, Terminal, FilePlus, FolderPlus, Edit3, Trash2,
  Copy, ExternalLink, CopyPlus, ChevronsUp, MoreVertical, X, Check
} from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useGitStore } from '../../stores/useGitStore';
import { FileNode } from '../../types';
import { Button } from '../../components/ui/button';
import { pickNativeFolder } from '../../utils/nativePicker';

// Reserved Windows filenames that cannot be used
const RESERVED_WIN_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

function validateFilename(name: string): string | null {
  if (!name || !name.trim()) return "Filename cannot be empty.";
  const trimmed = name.trim();
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    return 'Filename cannot contain \\ / : * ? " < > |';
  }
  const baseUpper = trimmed.split('.')[0].toUpperCase();
  if (RESERVED_WIN_NAMES.has(baseUpper)) {
    return `"${trimmed}" is a reserved system name on Windows.`;
  }
  return null;
}

// Map file extensions to specialized icons and color schemes
function getFileIcon(filename: string, isSelected: boolean, gitStatus: string | null) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (gitStatus === 'M') {
    // Return amber tinted file icon for modified
  }

  switch (ext) {
    case 'ts':
    case 'tsx':
      return <FileCode className="h-3.5 w-3.5 flex-shrink-0 text-sky-400" />;
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return <FileCode className="h-3.5 w-3.5 flex-shrink-0 text-amber-350 text-amber-400" />;
    case 'json':
      return <FileJson className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />;
    case 'html':
    case 'htm':
      return <Code className="h-3.5 w-3.5 flex-shrink-0 text-orange-400" />;
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return <Braces className="h-3.5 w-3.5 flex-shrink-0 text-pink-400" />;
    case 'py':
    case 'pyw':
      return <FileCode className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />;
    case 'md':
    case 'mdx':
      return <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'ico':
    case 'svg':
    case 'webp':
    case 'avif':
      return <ImageIcon className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />;
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'bat':
    case 'cmd':
    case 'ps1':
      return <Terminal className="h-3.5 w-3.5 flex-shrink-0 text-emerald-300" />;
    default:
      return <File className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-violet-400' : gitStatus ? 'text-amber-400/80' : 'text-slate-500'}`} />;
  }
}

interface InlineInputProps {
  initialValue: string;
  isFolder: boolean;
  onCommit: (val: string) => void;
  onCancel: () => void;
}

const InlineInput: React.FC<InlineInputProps> = ({ initialValue, isFolder, onCommit, onCancel }) => {
  const [val, setVal] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (!isFolder && initialValue.includes('.')) {
        const lastDot = initialValue.lastIndexOf('.');
        inputRef.current.setSelectionRange(0, lastDot);
      } else {
        inputRef.current.select();
      }
    }
  }, [initialValue, isFolder]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const err = validateFilename(val);
      if (err) {
        setError(err);
        return;
      }
      onCommit(val.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col w-full pr-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 w-full">
        {isFolder ? (
          <Folder className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
        ) : (
          <File className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!val.trim()) {
              onCancel();
            } else {
              const err = validateFilename(val);
              if (!err) onCommit(val.trim());
              else onCancel();
            }
          }}
          className={`w-full bg-slate-950 border px-1.5 py-0.5 text-xs text-slate-100 rounded focus:outline-none ${
            error ? 'border-red-500' : 'border-violet-500'
          }`}
        />
      </div>
      {error && <span className="text-[9px] text-red-400 pl-5 pt-0.5">{error}</span>}
    </div>
  );
};

interface FileNodeItemProps {
  node: FileNode;
  depth: number;
  searchFilter: string;
  expandedFolders: Set<string>;
  toggleExpandFolder: (path: string) => void;
  selectedPath: string | null;
  onSelectNode: (node: FileNode) => void;
  onContextMenu: (x: number, y: number, node: FileNode) => void;
  renamingPath: string | null;
  onCommitRename: (path: string, newName: string) => void;
  onCancelRename: () => void;
  creatingInFolder: { parentPath: string; isFolder: boolean } | null;
  onCommitCreate: (parentPath: string, name: string, isFolder: boolean) => void;
  onCancelCreate: () => void;
  onDragStartNode: (e: React.DragEvent, path: string) => void;
  onDropNode: (e: React.DragEvent, targetFolder: string) => void;
}

const FileNodeItem: React.FC<FileNodeItemProps> = ({
  node, depth, searchFilter, expandedFolders, toggleExpandFolder,
  selectedPath, onSelectNode, onContextMenu, renamingPath, onCommitRename, onCancelRename,
  creatingInFolder, onCommitCreate, onCancelCreate, onDragStartNode, onDropNode
}) => {
  const { openTab } = useWorkspaceStore();
  const { setDiffPanelVisible, setActiveTab } = useLayoutStore();
  const { unstagedFiles, stagedFiles, openDiff } = useGitStore();
  const [dragOver, setDragOver] = useState(false);

  const isFolder = node.isFolder;
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;

  // Resolve git status decoration
  const normalizedPath = node.path.startsWith('/') ? node.path.slice(1) : node.path;
  const unstagedMatch = unstagedFiles.find(f => f.path === normalizedPath);
  const stagedMatch = stagedFiles.find(f => f.path === normalizedPath);
  const gitStatus = unstagedMatch?.status || stagedMatch?.status || null;

  const getGitDecoration = (status: string | null) => {
    if (!status) return null;
    const colorMap: Record<string, string> = {
      M: 'text-amber-400',
      A: 'text-emerald-400',
      D: 'text-rose-400',
      R: 'text-sky-400',
      U: 'text-emerald-300',
    };
    const color = colorMap[status.toUpperCase()] || 'text-slate-400';
    return (
      <span className={`text-[10px] font-bold font-mono flex-shrink-0 ${color}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  // Search logic
  const matchesSearch = node.name.toLowerCase().includes(searchFilter.toLowerCase());
  const hasMatchingChildren = isFolder && node.children && node.children.some(child => 
    child.name.toLowerCase().includes(searchFilter.toLowerCase()) || 
    (child.isFolder && child.children && child.children.some(c => c.name.toLowerCase().includes(searchFilter.toLowerCase())))
  );

  if (searchFilter && !matchesSearch && !hasMatchingChildren) {
    return null;
  }

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectNode(node);
    if (isFolder) {
      toggleExpandFolder(node.path);
    } else {
      if (gitStatus && (gitStatus === 'M' || gitStatus === 'A')) {
        await openDiff(normalizedPath, false);
        setActiveTab('diff');
      } else {
        await openTab(node.path);
        setDiffPanelVisible(true);
        setActiveTab('diff');
      }
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectNode(node);
    onContextMenu(e.clientX, e.clientY, node);
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    onDropNode(e, node.path);
  };

  const isCreatingHere = creatingInFolder && creatingInFolder.parentPath === node.path;

  return (
    <div className="select-none">
      {/* Node Row */}
      <div
        draggable
        onDragStart={(e) => onDragStartNode(e, node.path)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`group flex items-center justify-between pr-2 py-1 text-xs cursor-pointer transition-colors relative ${
          isSelected 
            ? 'bg-violet-650/20 text-violet-300 font-medium border-l-2 border-violet-500' 
            : dragOver
            ? 'bg-violet-950/40 border-2 border-dashed border-violet-500 text-slate-100'
            : 'text-slate-350 hover:bg-slate-900/60 hover:text-slate-100'
        }`}
      >
        {isRenaming ? (
          <InlineInput
            initialValue={node.name}
            isFolder={isFolder}
            onCommit={(newName) => onCommitRename(node.path, newName)}
            onCancel={onCancelRename}
          />
        ) : (
          <>
            <span className="flex items-center gap-1.5 truncate flex-1 min-w-0">
              {isFolder ? (
                <>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-slate-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-slate-500 flex-shrink-0" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                  )}
                </>
              ) : (
                getFileIcon(node.name, isSelected, gitStatus)
              )}
              <span className={`truncate ${gitStatus && !isFolder ? 'text-amber-300' : ''}`}>
                {node.name}
              </span>
            </span>

            {/* Right side decorations */}
            <span className="flex items-center gap-1.5 flex-shrink-0 ml-1">
              {!isFolder && gitStatus && getGitDecoration(gitStatus)}
              {!isFolder && !gitStatus && node.sizeBytes !== undefined && (
                <span className="hidden group-hover:inline text-[9px] text-slate-500 font-mono">
                  {(node.sizeBytes / 1024).toFixed(1)} KB
                </span>
              )}
            </span>
          </>
        )}
      </div>

      {/* Children list */}
      {isFolder && isExpanded && (
        <div className="mt-0.5">
          {/* Phantom row for inline creation inside this folder */}
          {isCreatingHere && (
            <div style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }} className="py-1 pr-2">
              <InlineInput
                initialValue=""
                isFolder={creatingInFolder.isFolder}
                onCommit={(name) => onCommitCreate(node.path, name, creatingInFolder.isFolder)}
                onCancel={onCancelCreate}
              />
            </div>
          )}

          {node.children && node.children.map((childNode) => (
            <FileNodeItem
              key={childNode.path}
              node={childNode}
              depth={depth + 1}
              searchFilter={searchFilter}
              expandedFolders={expandedFolders}
              toggleExpandFolder={toggleExpandFolder}
              selectedPath={selectedPath}
              onSelectNode={onSelectNode}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              creatingInFolder={creatingInFolder}
              onCommitCreate={onCommitCreate}
              onCancelCreate={onCancelCreate}
              onDragStartNode={onDragStartNode}
              onDropNode={onDropNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileExplorer: React.FC = () => {
  const { 
    currentProject, fileTree = [], isScanning, scanProcessedFiles, scanTotalFiles,
    triggerRescan, errorMessage, clearError, openTab, openWorkspace,
    createFile, createFolder, renameNode, deleteNode, moveNode, duplicateFile, revealInExplorer, fetchTree
  } = useWorkspaceStore();

  const [searchFilter, setSearchFilter] = useState('');
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Inline rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  // Inline creation state
  const [creatingInFolder, setCreatingInFolder] = useState<{ parentPath: string; isFolder: boolean } | null>(null);

  // Custom Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);

  // Explorer root actions dropdown
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);

  // Container ref for keyboard navigation
  const explorerRef = useRef<HTMLDivElement>(null);

  // Toggle folder expansion
  const toggleExpandFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Collapse all folders
  const handleCollapseAll = () => {
    setExpandedFolders(new Set());
  };

  // Close context menu & dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      setContextMenu(null);
      setShowActionsDropdown(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Keyboard shortcuts (Ctrl+N, Ctrl+Shift+N, F2, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if explorer area or active document has focus
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return; // Don't trigger when typing in input
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const parent = selectedNode ? (selectedNode.isFolder ? selectedNode.path : selectedNode.path.split('/').slice(0, -1).join('/') || '/') : '/';
        if (e.shiftKey) {
          // Ctrl+Shift+N -> New Folder
          triggerNewFolder(parent);
        } else {
          // Ctrl+N -> New File
          triggerNewFile(parent);
        }
      } else if (e.key === 'F2' && selectedNode) {
        e.preventDefault();
        setRenamingPath(selectedNode.path);
      } else if (e.key === 'Delete' && selectedNode) {
        e.preventDefault();
        handleDeleteNode(selectedNode.path);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode]);

  const triggerNewFile = (parentPath: string) => {
    // Auto-expand parent folder if collapsed
    if (parentPath !== '/' && !expandedFolders.has(parentPath)) {
      setExpandedFolders(prev => new Set(prev).add(parentPath));
    }
    setCreatingInFolder({ parentPath, isFolder: false });
  };

  const triggerNewFolder = (parentPath: string) => {
    if (parentPath !== '/' && !expandedFolders.has(parentPath)) {
      setExpandedFolders(prev => new Set(prev).add(parentPath));
    }
    setCreatingInFolder({ parentPath, isFolder: true });
  };

  const handleCommitCreate = async (parentPath: string, name: string, isFolder: boolean) => {
    setCreatingInFolder(null);
    if (isFolder) {
      await createFolder(parentPath, name);
    } else {
      const createdPath = await createFile(parentPath, name);
      if (createdPath) {
        await openTab(createdPath);
      }
    }
  };

  const handleCommitRename = async (oldPath: string, newName: string) => {
    setRenamingPath(null);
    await renameNode(oldPath, newName);
  };

  const handleDeleteNode = async (path: string) => {
    if (confirm(`Are you sure you want to delete "${path.split('/').pop()}"?`)) {
      await deleteNode(path);
      if (selectedNode?.path === path) setSelectedNode(null);
    }
  };

  const handleDuplicate = async (filePath: string) => {
    const newPath = await duplicateFile(filePath);
    if (newPath) {
      await openTab(newPath);
    }
  };

  const handleCopyPath = (path: string, absolute: boolean = false) => {
    let copyText = path;
    if (absolute && currentProject) {
      copyText = (currentProject.path + path).replace(/\//g, '\\');
    }
    navigator.clipboard.writeText(copyText);
  };

  // Drag & Drop handlers
  const handleDragStartNode = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/plain', path);
  };

  const handleDropNode = async (e: React.DragEvent, targetFolder: string) => {
    const srcPath = e.dataTransfer.getData('text/plain');
    if (!srcPath || srcPath === targetFolder) return;
    if (targetFolder.startsWith(srcPath + '/')) return; // Prevent dropping parent into child
    await moveNode(srcPath, targetFolder);
  };

  const handleContextMenuTrigger = (x: number, y: number, node: FileNode) => {
    setContextMenu({ x, y, node });
  };

  return (
    <div 
      ref={explorerRef}
      tabIndex={0}
      className="flex flex-col h-full bg-[var(--bg-sidebar,#060810)] border-r border-[var(--border-color,#1e293b)] relative select-none focus:outline-none transition-colors duration-200"
    >
      {/* Header Bar */}
      <div className="p-3 border-b border-slate-900/50 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-450 uppercase tracking-wider">
          <span>Explorer</span>
          
          {/* Action Toolbar */}
          <div className="flex items-center gap-1 text-slate-400">
            {currentProject && (
              <>
                <button
                  onClick={() => triggerNewFile(selectedNode ? (selectedNode.isFolder ? selectedNode.path : selectedNode.path.split('/').slice(0, -1).join('/') || '/') : '/')}
                  className="p-1 hover:text-slate-100 hover:bg-slate-850 rounded transition-colors cursor-pointer"
                  title="New File (Ctrl+N)"
                >
                  <FilePlus className="h-3.5 w-3.5 text-violet-400" />
                </button>
                <button
                  onClick={() => triggerNewFolder(selectedNode ? (selectedNode.isFolder ? selectedNode.path : selectedNode.path.split('/').slice(0, -1).join('/') || '/') : '/')}
                  className="p-1 hover:text-slate-100 hover:bg-slate-850 rounded transition-colors cursor-pointer"
                  title="New Folder (Ctrl+Shift+N)"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-violet-400" />
                </button>
                <button
                  onClick={() => {
                    fetchTree();
                    useGitStore.getState().fetchGitStatus();
                  }}
                  disabled={isScanning}
                  className="p-1 hover:text-slate-100 hover:bg-slate-850 rounded transition-colors cursor-pointer disabled:opacity-50"
                  title="Refresh Explorer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin text-violet-400' : ''}`} />
                </button>
                <button
                  onClick={handleCollapseAll}
                  className="p-1 hover:text-slate-100 hover:bg-slate-850 rounded transition-colors cursor-pointer"
                  title="Collapse All"
                >
                  <ChevronsUp className="h-3.5 w-3.5" />
                </button>
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActionsDropdown(!showActionsDropdown);
                    }}
                    className="p-1 hover:text-slate-100 hover:bg-slate-850 rounded transition-colors cursor-pointer"
                    title="Explorer Actions"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                  {showActionsDropdown && (
                    <div className="absolute right-0 top-6 w-44 rounded-md bg-[#0a0c16] border border-slate-850 p-1 shadow-2xl z-50 text-[11px] text-slate-350 font-sans">
                      <button
                        onClick={() => triggerNewFile('/')}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer"
                      >
                        <FilePlus className="h-3.5 w-3.5 text-violet-400" />
                        <span>New File in Root</span>
                      </button>
                      <button
                        onClick={() => triggerNewFolder('/')}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer"
                      >
                        <FolderPlus className="h-3.5 w-3.5 text-violet-400" />
                        <span>New Folder in Root</span>
                      </button>
                      <button
                        onClick={() => triggerRescan()}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-violet-400" />
                        <span>Full Workspace Rescan</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute top-2 left-2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Filter files..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full rounded-md bg-slate-900/80 border border-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/55 transition-colors"
          />
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-red-950/20 border-b border-red-500/20 text-red-400 text-[10px] px-3 py-1.5 flex items-center justify-between animate-fade-in">
          <span className="truncate" title={errorMessage}>{errorMessage}</span>
          <button onClick={() => clearError()} className="font-semibold text-slate-400 hover:text-slate-100 ml-1 cursor-pointer">X</button>
        </div>
      )}

      {/* Scanning Progress Bar */}
      {isScanning && (() => {
        const pct = scanTotalFiles > 0 ? Math.round((scanProcessedFiles / scanTotalFiles) * 100) : null;
        return (
          <div className="px-3 py-2 border-b border-slate-900 bg-violet-950/10 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-violet-400 font-semibold">
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Scanning Repository...</span>
              </span>
              <span>{pct !== null ? `${pct}%` : `${scanProcessedFiles} files`}</span>
            </div>
            <div className="w-full h-1 bg-slate-900 rounded overflow-hidden">
              <div
                className={`h-full bg-violet-500 rounded transition-all duration-300 ${pct === null ? 'animate-[pulse_1s_infinite]' : ''}`}
                style={{ width: pct !== null ? `${pct}%` : '60%' }}
              />
            </div>
          </div>
        );
      })()}

      {/* File Tree List */}
      <div 
        className="flex-grow overflow-y-auto py-2"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, node: null });
          }
        }}
      >
        {currentProject ? (
          (fileTree?.length ?? 0) > 0 ? (
            <>
              {/* Phantom row for creation at root level */}
              {creatingInFolder && creatingInFolder.parentPath === '/' && (
                <div className="px-3 py-1">
                  <InlineInput
                    initialValue=""
                    isFolder={creatingInFolder.isFolder}
                    onCommit={(name) => handleCommitCreate('/', name, creatingInFolder.isFolder)}
                    onCancel={() => setCreatingInFolder(null)}
                  />
                </div>
              )}

              {(fileTree || []).map((node) => (
                <FileNodeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  searchFilter={searchFilter}
                  expandedFolders={expandedFolders}
                  toggleExpandFolder={toggleExpandFolder}
                  selectedPath={selectedNode?.path || null}
                  onSelectNode={(n) => setSelectedNode(n)}
                  onContextMenu={handleContextMenuTrigger}
                  renamingPath={renamingPath}
                  onCommitRename={handleCommitRename}
                  onCancelRename={() => setRenamingPath(null)}
                  creatingInFolder={creatingInFolder}
                  onCommitCreate={handleCommitCreate}
                  onCancelCreate={() => setCreatingInFolder(null)}
                  onDragStartNode={handleDragStartNode}
                  onDropNode={handleDropNode}
                />
              ))}
            </>
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
              onClick={() => {
                console.log('[WORKSPACE DEBUG] Open Folder clicked');
                useWorkspaceStore.getState().setFolderModalOpen(true);
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
          className="fixed rounded-md bg-[#0a0c16] border border-slate-850 p-1 shadow-2xl z-50 text-[11px] text-slate-350 w-48 font-sans select-none animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node ? (
            contextMenu.node.isFolder ? (
              /* Folder Context Menu */
              <>
                <button 
                  onClick={() => {
                    triggerNewFile(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <FilePlus className="h-3.5 w-3.5 text-violet-400" />
                  <span>New File...</span>
                </button>
                <button 
                  onClick={() => {
                    triggerNewFolder(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-violet-400" />
                  <span>New Folder...</span>
                </button>
                <div className="h-px bg-slate-900 my-1" />
                <button 
                  onClick={() => {
                    setRenamingPath(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5 text-violet-400" />
                  <span>Rename (F2)</span>
                </button>
                <button 
                  onClick={() => {
                    handleDeleteNode(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-red-400 rounded cursor-pointer transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  <span>Delete</span>
                </button>
                <div className="h-px bg-slate-900 my-1" />
                <button 
                  onClick={() => {
                    handleCopyPath(contextMenu.node!.path, false);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span>Copy Relative Path</span>
                </button>
                <button 
                  onClick={() => {
                    handleCopyPath(contextMenu.node!.path, true);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span>Copy Absolute Path</span>
                </button>
                <button 
                  onClick={() => {
                    revealInExplorer(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  <span>Reveal in Explorer</span>
                </button>
              </>
            ) : (
              /* File Context Menu */
              <>
                <button 
                  onClick={() => {
                    openTab(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <File className="h-3.5 w-3.5 text-violet-400" />
                  <span>Open in Editor</span>
                </button>
                <div className="h-px bg-slate-900 my-1" />
                <button 
                  onClick={() => {
                    setRenamingPath(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5 text-violet-400" />
                  <span>Rename (F2)</span>
                </button>
                <button 
                  onClick={() => {
                    handleDuplicate(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <CopyPlus className="h-3.5 w-3.5 text-violet-400" />
                  <span>Duplicate</span>
                </button>
                <button 
                  onClick={() => {
                    handleDeleteNode(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-red-400 rounded cursor-pointer transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  <span>Delete</span>
                </button>
                <div className="h-px bg-slate-900 my-1" />
                <button 
                  onClick={() => {
                    handleCopyPath(contextMenu.node!.path, false);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span>Copy Relative Path</span>
                </button>
                <button 
                  onClick={() => {
                    handleCopyPath(contextMenu.node!.path, true);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span>Copy Absolute Path</span>
                </button>
                <button 
                  onClick={() => {
                    revealInExplorer(contextMenu.node!.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  <span>Reveal in Explorer</span>
                </button>
              </>
            )
          ) : (
            /* Blank Area Context Menu */
            <>
              <button 
                onClick={() => {
                  triggerNewFile('/');
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
              >
                <FilePlus className="h-3.5 w-3.5 text-violet-400" />
                <span>New File</span>
              </button>
              <button 
                onClick={() => {
                  triggerNewFolder('/');
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded cursor-pointer transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5 text-violet-400" />
                <span>New Folder</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
