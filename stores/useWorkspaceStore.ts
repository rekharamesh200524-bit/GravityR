import { create } from 'zustand';
import { FileNode } from '../types';

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
  updateFileContent: (filePath: string, content: string) => void;
  addNode: (parentPath: string | null, name: string, isFolder: boolean) => void;
  renameNode: (path: string, newName: string) => void;
  deleteNode: (path: string) => void;
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
  errorMessage: null,
  openTabs: [],
  activeTab: null,
  editedFiles: {},

  clearError: () => set({ errorMessage: null }),

  closeWorkspace: () => {
    if (scanPollInterval) {
      clearInterval(scanPollInterval);
      scanPollInterval = null;
    }
    set({
      currentProject: null,
      fileTree: [],
      selectedFilePath: null,
      selectedFileContent: null,
      isScanning: false,
      scanProcessedFiles: 0,
      errorMessage: null,
      openTabs: [],
      activeTab: null,
      editedFiles: {}
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

  openWorkspace: async (path: string) => {
    if (scanPollInterval) {
      clearInterval(scanPollInterval);
      scanPollInterval = null;
    }

    set({ isScanning: true, scanProcessedFiles: 0, errorMessage: null });

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
        set({ currentProject: project });
        
        // Start polling scanner progress
        scanPollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/workspace/scan-status?path=${encodeURIComponent(path)}`);
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            
            if (statusData.status === "success" && statusData.scan) {
              const scan = statusData.scan;
              set({ scanProcessedFiles: scan.processed_files });
              
              if (scan.status === "completed") {
                if (scanPollInterval) {
                  clearInterval(scanPollInterval);
                  scanPollInterval = null;
                }
                
                // Scan complete: Refresh details and load tree
                set({ isScanning: false });
                
                // Fetch updated project metadata
                const infoRes = await fetch(`${API_BASE}/workspace/info?project_id=${project.id}`);
                if (infoRes.ok) {
                  const infoData = await infoRes.json();
                  if (infoData.status === "success") {
                    set({ currentProject: infoData.info });
                  }
                }
                
                // Fetch new tree structure
                const store = useWorkspaceStore.getState();
                await store.fetchTree();
                await store.fetchRecents();
              } else if (scan.status === "failed") {
                if (scanPollInterval) {
                  clearInterval(scanPollInterval);
                  scanPollInterval = null;
                }
                set({ isScanning: false, errorMessage: scan.error || "Workspace scanning failed." });
              }
            }
          } catch (pollErr) {
            console.error("Polling error:", pollErr);
          }
        }, 1000);

        // Fetch initial tree and recents immediately
        const store = useWorkspaceStore.getState();
        await store.fetchTree();
        await store.fetchRecents();
      }
    } catch (err: any) {
      set({ isScanning: false, errorMessage: err.message });
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
      return {
        editedFiles: updated,
        selectedFileContent: selectedContent,
        selectedFileSize: selectedContent ? selectedContent.length : 0
      };
    });
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

  renameNode: (path, newName) => {
    const { fileTree, openTabs, activeTab, editedFiles } = get();
    const parts = path.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    const updateTree = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(n => {
        if (n.path === path) {
          const updatePaths = (node: FileNode, oldPrefix: string, newPrefix: string): FileNode => {
            const relativePath = node.path.substring(oldPrefix.length);
            const updatedNodePath = newPrefix + relativePath;
            return {
              ...node,
              path: updatedNodePath,
              children: node.children ? node.children.map(c => updatePaths(c, oldPrefix, newPrefix)) : undefined
            };
          };
          return updatePaths({ ...n, name: newName }, path, newPath);
        }
        if (n.children) {
          return { ...n, children: updateTree(n.children) };
        }
        return n;
      });
    };

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
      fileTree: updateTree(fileTree),
      openTabs: newTabs,
      activeTab: newActive,
      editedFiles: newEditedFiles,
      selectedFilePath: get().selectedFilePath === path ? newPath : get().selectedFilePath
    });
  },

  deleteNode: (path) => {
    const { fileTree, openTabs, activeTab, editedFiles } = get();
    const updateTree = (nodes: FileNode[]): FileNode[] => {
      return nodes
        .filter(n => n.path !== path)
        .map(n => {
          if (n.children) {
            return { ...n, children: updateTree(n.children) };
          }
          return n;
        });
    };

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
      fileTree: updateTree(fileTree),
      openTabs: newTabs,
      activeTab: newActive,
      editedFiles: newEditedFiles,
      selectedFilePath: get().selectedFilePath === path ? null : get().selectedFilePath
    });
  },

  cursorLine: 1,
  cursorCol: 1,
  setCursorPos: (line, col) => set({ cursorLine: line, cursorCol: col })
}));
