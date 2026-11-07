import { create } from 'zustand';
import { FileNode } from '../types';
import { useGitStore } from './useGitStore';

export interface ProjectMetadata {
  id: string;
  name: string;
  path: string;
  framework: string;
  language: string;
  total_files: number;
  total_folders: number;
  size_bytes: number;
  created_at?: string;
  last_opened?: string;
}

export interface RecentProjectItem {
  name: string;
  path: string;
  last_opened: string;
}

interface WorkspaceState {
  currentProject: ProjectMetadata | null;
  recentProjects: RecentProjectItem[];
  fileTree: FileNode[];
  selectedFilePath: string | null;
  selectedFileContent: string | null;
  selectedFileEncoding: string;
  selectedFileSize: number;
  isScanning: boolean;
  scanProcessedFiles: number;
  errorMessage: string | null;
  openTabs: string[];
  activeTab: string | null;
  editedFiles: Record<string, string>;
  scanTotalFiles: number;
  workspaceStatus: 'idle' | 'loading' | 'indexing' | 'ready';
  initWorkspace: () => Promise<void>;
  openWorkspace: (path: string) => Promise<void>;
  fetchRecents: () => Promise<void>;
  fetchTree: () => Promise<void>;
  selectFile: (filePath: string | null) => Promise<void>;
  triggerRescan: () => Promise<void>;
  closeWorkspace: () => void;
  clearError: () => void;
  openTab: (filePath: string) => Promise<void>;
  closeTab: (filePath: string) => Promise<void>;
  setActiveTab: (filePath: string) => Promise<void>;
  dirtyFiles: Set<string>;
  isSaving: boolean;
  lastSavedPath: string | null;
  updateFileContent: (filePath: string, content: string) => void;
  saveFile: (filePath: string) => Promise<void>;
  saveAllDirtyFiles: () => Promise<string[]>;
  addNode: (parentPath: string | null, name: string, isFolder: boolean) => void;
  createFile: (parentPath: string | null, name: string) => Promise<string | null>;
  createFolder: (parentPath: string | null, name: string) => Promise<boolean>;
  renameNode: (path: string, newName: string) => Promise<boolean>;
  deleteNode: (path: string) => Promise<boolean>;
  moveNode: (srcPath: string, destFolder: string) => Promise<boolean>;
  duplicateFile: (filePath: string) => Promise<string | null>;
  revealInExplorer: (filePath: string) => Promise<void>;
  cursorLine: number;
  cursorCol: number;
  setCursorPos: (line: number, col: number) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

let scanPollInterval: NodeJS.Timeout | null = null;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentProject: null,
  recentProjects: [],
  fileTree: [],
  selectedFilePath: null,
  selectedFileContent: null,
  selectedFileEncoding: 'utf-8',
  selectedFileSize: 0,
  isScanning: false,
  scanProcessedFiles: 0,
  scanTotalFiles: 0,
  workspaceStatus: 'idle',
  errorMessage: null,
  openTabs: [],
  activeTab: null,
  editedFiles: {},
  dirtyFiles: new Set<string>(),
  isSaving: false,
  lastSavedPath: null,

  clearError: () => set({ errorMessage: null }),

  closeWorkspace: () => {
    if (scanPollInterval) {
      clearInterval(scanPollInterval);
      scanPollInterval = null;
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gravityx_last_workspace_path');
    }
    set({
      currentProject: null,
      fileTree: [],
      selectedFilePath: null,
      selectedFileContent: null,
      isScanning: false,
      workspaceStatus: 'idle',
      scanProcessedFiles: 0,
      scanTotalFiles: 0,
      errorMessage: null,
      openTabs: [],
      activeTab: null,
      editedFiles: {},
      dirtyFiles: new Set<string>(),
      isSaving: false,
      lastSavedPath: null,
    });
  },

  fetchRecents: async () => {
    try {
      const res = await fetch(`${API_BASE}/workspace/recents`);
      if (!res.ok) throw new Error("Failed to fetch recent workspaces.");
      const data = await res.json();
      if (data.status === "success") {
        set({ recentProjects: data.projects });
      }
    } catch (err: any) {
      console.error(err);
    }
  },

  fetchTree: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const res = await fetch(`${API_BASE}/workspace/tree?project_id=${currentProject.id}`);
      if (!res.ok) throw new Error("Failed to load file explorer tree.");
      const data = await res.json();
      if (data.status === "success") {
        set({ fileTree: data.tree });
      }
    } catch (err: any) {
      set({ errorMessage: err.message });
    }
  },

  selectFile: async (filePath) => {
    const { currentProject, editedFiles } = get();
    if (!currentProject || !filePath) {
      set({ selectedFilePath: null, selectedFileContent: null, selectedFileSize: 0 });
      return;
    }

    if (editedFiles[filePath] !== undefined) {
      set({
        selectedFilePath: filePath,
        selectedFileContent: editedFiles[filePath],
        selectedFileSize: editedFiles[filePath].length
      });
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/workspace/file?project_id=${currentProject.id}&path=${encodeURIComponent(filePath)}`
      );
      if (!res.ok) {
        if (res.status === 403) throw new Error("Access Denied: File is outside project bounds.");
        throw new Error("Failed to read file content.");
      }
      const data = await res.json();
      if (data.status === "success") {
        set({
          selectedFilePath: filePath,
          selectedFileContent: data.file.content,
          selectedFileEncoding: data.file.encoding,
          selectedFileSize: data.file.size_bytes
        });
      }
    } catch (err: any) {
      set({ errorMessage: err.message });
    }
  },

  triggerRescan: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const res = await fetch(`${API_BASE}/workspace/rescan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: currentProject.id })
      });
      if (!res.ok) throw new Error("Failed to trigger workspace rescan.");
      
      set({ isScanning: true, scanProcessedFiles: 0 });
      
      // Start polling status
      const store = useWorkspaceStore.getState();
      store.openWorkspace(currentProject.path); // Triggers polling loop
    } catch (err: any) {
      set({ errorMessage: err.message });
    }
  },

  initWorkspace: async () => {
    if (typeof window === 'undefined') return;
    const lastPath = localStorage.getItem('gravityx_last_workspace_path');
    if (lastPath && !get().currentProject) {
      await get().openWorkspace(lastPath);
    }
  },

  openWorkspace: async (path: string) => {
    if (scanPollInterval) {
      clearInterval(scanPollInterval);
      scanPollInterval = null;
    }

    set({ isScanning: true, workspaceStatus: 'loading', scanProcessedFiles: 0, errorMessage: null });

    try {
      const res = await fetch(`${API_BASE}/workspace/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
      });
      
      if (!res.ok) {
        const errorDetail = await res.json();
        throw new Error(errorDetail.detail || "Failed to open selected directory.");
      }

      const data = await res.json();
      if (data.status === "success") {
        const project = data.project as ProjectMetadata;
        set({ currentProject: project, workspaceStatus: 'indexing' });

        // Save last opened path for 1-click restore
        if (typeof window !== 'undefined') {
          localStorage.setItem('gravityx_last_workspace_path', path);
          // Dispatch CWD change event for Integrated Terminal
          window.dispatchEvent(new CustomEvent('workspace-cwd-changed', { detail: { path } }));
        }

        // Trigger Git Repository Detection automatically
        useGitStore.getState().fetchGitStatus().catch(() => {});
        
        // Start polling scanner progress — fetch tree on every poll so explorer populates in real-time
        let lastTreeFetch = 0;
        scanPollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/workspace/scan-status?path=${encodeURIComponent(path)}`);
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            
            if (statusData.status === "success" && statusData.scan) {
              const scan = statusData.scan;
              set({
                scanProcessedFiles: scan.processed_files || 0,
                scanTotalFiles: scan.total_files || 0
              });

              // Refresh tree every 2 seconds during scanning so explorer populates progressively
              const now = Date.now();
              if (scan.processed_files > 0 && now - lastTreeFetch > 2000) {
                lastTreeFetch = now;
                const store = useWorkspaceStore.getState();
                store.fetchTree().catch(() => {});
              }
              
              if (scan.status === "completed") {
                if (scanPollInterval) {
                  clearInterval(scanPollInterval);
                  scanPollInterval = null;
                }
                
                // Scan complete: mark scanning done & workspace ready
                set({ isScanning: false, workspaceStatus: 'ready' });
                
                // Fetch updated project metadata
                const infoRes = await fetch(`${API_BASE}/workspace/info?project_id=${project.id}`);
                if (infoRes.ok) {
                  const infoData = await infoRes.json();
                  if (infoData.status === "success") {
                    set({ currentProject: infoData.info });
                  }
                }
                
                // Final tree + recents fetch + git refresh
                const store = useWorkspaceStore.getState();
                await store.fetchTree();
                await store.fetchRecents();
                useGitStore.getState().fetchGitStatus().catch(() => {});
              } else if (scan.status === "failed") {
                if (scanPollInterval) {
                  clearInterval(scanPollInterval);
                  scanPollInterval = null;
                }
                set({ isScanning: false, workspaceStatus: 'ready', errorMessage: scan.error || "Workspace scanning failed." });
              }
            }
          } catch (pollErr) {
            console.error("Polling error:", pollErr);
          }
        }, 800);

        // Fetch initial tree and recents immediately
        const store = useWorkspaceStore.getState();
        await store.fetchTree();
        await store.fetchRecents();
      }
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('gravityx_last_workspace_path');
      }
      const msg = (err.message === 'Failed to fetch' || err.message?.includes('fetch'))
        ? 'Backend API server offline (http://localhost:8000). Starting backend...'
        : err.message;
      set({ isScanning: false, workspaceStatus: 'idle', errorMessage: msg, currentProject: null, fileTree: [] });
    }
  },

  openTab: async (filePath) => {
    const { openTabs } = get();
    if (!openTabs.includes(filePath)) {
      set({ openTabs: [...openTabs, filePath] });
    }
    set({ activeTab: filePath });
    await get().selectFile(filePath);
  },

  closeTab: async (filePath) => {
    const { openTabs, activeTab } = get();
    const newTabs = openTabs.filter(t => t !== filePath);
    set({ openTabs: newTabs });

    if (activeTab === filePath) {
      const nextActiveTab = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null;
      set({ activeTab: nextActiveTab });
      await get().selectFile(nextActiveTab);
    }
  },

  setActiveTab: async (filePath) => {
    set({ activeTab: filePath });
    await get().selectFile(filePath);
  },

  updateFileContent: (filePath, content) => {
    set((state) => {
      const updated = { ...state.editedFiles, [filePath]: content };
      const selectedContent = state.selectedFilePath === filePath ? content : state.selectedFileContent;
      const newDirty = new Set(state.dirtyFiles);
      newDirty.add(filePath);
      return {
        editedFiles: updated,
        selectedFileContent: selectedContent,
        selectedFileSize: selectedContent ? selectedContent.length : 0,
        dirtyFiles: newDirty,
      };
    });
  },

  saveFile: async (filePath: string) => {
    const state = get();
    const { currentProject, editedFiles, isSaving } = state;
    if (!currentProject || !filePath || isSaving) return;

    // Only save if there is edited content; fall back to selectedFileContent
    const content = editedFiles[filePath] ?? state.selectedFileContent;
    if (content === null || content === undefined) return;

    set({ isSaving: true });
    try {
      const res = await fetch(`${API_BASE}/workspace/file/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          path: filePath,
          content,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Save failed');
      }

      // Clear dirty state for this file
      set((state) => {
        const newDirty = new Set(state.dirtyFiles);
        newDirty.delete(filePath);
        // Clear from editedFiles so re-open reads from disk
        const { [filePath]: _removed, ...restEdited } = state.editedFiles;
        return {
          dirtyFiles: newDirty,
          editedFiles: restEdited,
          isSaving: false,
          lastSavedPath: filePath,
        };
      });

      // Refresh git status so Source Control updates immediately
      useGitStore.getState().fetchGitStatus();

      // Refresh file tree so explorer M decoration updates
      await get().fetchTree();
    } catch (err: any) {
      set({ isSaving: false, errorMessage: err.message });
    }
  },

  saveAllDirtyFiles: async () => {
    const { dirtyFiles, saveFile } = get();
    if (!dirtyFiles || dirtyFiles.size === 0) return [];
    
    const paths = Array.from(dirtyFiles);
    for (const filePath of paths) {
      await saveFile(filePath);
    }
    return paths;
  },

  addNode: (parentPath, name, isFolder) => {
    const { fileTree } = get();
    let nodePath = "";
    if (parentPath === "/" || !parentPath) {
      nodePath = "/" + name;
    } else {
      nodePath = parentPath.replace(/\/$/, "") + "/" + name;
    }

    const newNode: FileNode = {
      name,
      path: nodePath,
      isFolder,
      children: isFolder ? [] : undefined,
      sizeBytes: isFolder ? undefined : 0,
      language: isFolder ? undefined : name.split('.').pop() || 'plaintext'
    };

    const updateTree = (nodes: FileNode[]): FileNode[] => {
      if (!parentPath || parentPath === "/") {
        if (nodes.some(n => n.path === nodePath)) return nodes;
        return [...nodes, newNode];
      }
      return nodes.map(n => {
        if (n.path === parentPath && n.isFolder) {
          const children = n.children || [];
          if (children.some(c => c.path === nodePath)) return n;
          return { ...n, children: [...children, newNode] };
        }
        if (n.children) {
          return { ...n, children: updateTree(n.children) };
        }
        return n;
      });
    };

    set({ fileTree: updateTree(fileTree) });
  },

  createFile: async (parentPath, name) => {
    const { currentProject, fetchTree } = get();
    if (!currentProject) return null;

    let targetRelPath = "";
    if (!parentPath || parentPath === "/") {
      targetRelPath = "/" + name;
    } else {
      targetRelPath = parentPath.replace(/\/$/, "") + "/" + name;
    }

    try {
      const res = await fetch(`${API_BASE}/workspace/fs/create-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: currentProject.id, path: targetRelPath })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to create file.");
      }
      const data = await res.json();
      await fetchTree();
      useGitStore.getState().fetchGitStatus();
      return data.path || targetRelPath;
    } catch (err: any) {
      set({ errorMessage: err.message });
      return null;
    }
  },

  createFolder: async (parentPath, name) => {
    const { currentProject, fetchTree } = get();
    if (!currentProject) return false;

    let targetRelPath = "";
    if (!parentPath || parentPath === "/") {
      targetRelPath = "/" + name;
    } else {
      targetRelPath = parentPath.replace(/\/$/, "") + "/" + name;
    }

    try {
      const res = await fetch(`${API_BASE}/workspace/fs/create-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: currentProject.id, path: targetRelPath })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to create folder.");
      }
      await fetchTree();
      return true;
    } catch (err: any) {
      set({ errorMessage: err.message });
      return false;
    }
  },

  renameNode: async (path, newName) => {
    const { currentProject, fetchTree, openTabs, activeTab, editedFiles } = get();
    if (!currentProject) return false;

    try {
      const res = await fetch(`${API_BASE}/workspace/fs/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: currentProject.id, old_path: path, new_name: newName })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to rename.");
      }

      const data = await res.json();
      const newPath = data.new_path;

      // Update client state for tabs and edited files
      const newTabs = openTabs.map(t => t.startsWith(path) ? t.replace(path, newPath) : t);
      const newActive = activeTab && activeTab.startsWith(path) ? activeTab.replace(path, newPath) : activeTab;
      const newEditedFiles = { ...editedFiles };
      for (const key in editedFiles) {
        if (key.startsWith(path)) {
          const newKey = key.replace(path, newPath);
          newEditedFiles[newKey] = editedFiles[key];
          delete newEditedFiles[key];
        }
      }

      set({
        openTabs: newTabs,
        activeTab: newActive,
        editedFiles: newEditedFiles,
        selectedFilePath: get().selectedFilePath === path ? newPath : get().selectedFilePath
      });

      await fetchTree();
      useGitStore.getState().fetchGitStatus();
      return true;
    } catch (err: any) {
      set({ errorMessage: err.message });
      return false;
    }
  },

  deleteNode: async (path) => {
    const { currentProject, fetchTree, openTabs, activeTab, editedFiles } = get();
    if (!currentProject) return false;

    try {
      const res = await fetch(`${API_BASE}/workspace/fs/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: currentProject.id, path })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to delete.");
      }

      // Close open tabs matching deleted path
      const newTabs = openTabs.filter(t => !t.startsWith(path));
      let newActive = activeTab;
      if (activeTab && activeTab.startsWith(path)) {
        newActive = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null;
      }

      const newEditedFiles = { ...editedFiles };
      for (const key in editedFiles) {
        if (key.startsWith(path)) {
          delete newEditedFiles[key];
        }
      }

      set({
        openTabs: newTabs,
        activeTab: newActive,
        editedFiles: newEditedFiles,
        selectedFilePath: get().selectedFilePath === path ? null : get().selectedFilePath
      });

      await fetchTree();
      useGitStore.getState().fetchGitStatus();
      return true;
    } catch (err: any) {
      set({ errorMessage: err.message });
      return false;
    }
  },

  moveNode: async (srcPath, destFolder) => {
    const { currentProject, fetchTree } = get();
    if (!currentProject) return false;

    try {
      const res = await fetch(`${API_BASE}/workspace/fs/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: currentProject.id, src_path: srcPath, dest_folder: destFolder })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to move node.");
      }

      await fetchTree();
      useGitStore.getState().fetchGitStatus();
      return true;
    } catch (err: any) {
      set({ errorMessage: err.message });
      return false;
    }
  },

  duplicateFile: async (filePath) => {
    const { currentProject, fetchTree } = get();
    if (!currentProject) return null;

    try {
      const res = await fetch(`${API_BASE}/workspace/fs/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: currentProject.id, path: filePath })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to duplicate file.");
      }

      const data = await res.json();
      await fetchTree();
      useGitStore.getState().fetchGitStatus();
      return data.new_path || null;
    } catch (err: any) {
      set({ errorMessage: err.message });
      return null;
    }
  },

  revealInExplorer: async (filePath) => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      await fetch(`${API_BASE}/workspace/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: currentProject.id, path: filePath })
      });
    } catch (err: any) {
      console.error("Reveal error:", err);
    }
  },

  cursorLine: 1,
  cursorCol: 1,
  setCursorPos: (line, col) => set({ cursorLine: line, cursorCol: col })
}));
