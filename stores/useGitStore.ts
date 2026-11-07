import { create } from 'zustand';
import { useWorkspaceStore } from './useWorkspaceStore';

export interface GitFileItem {
  path: string;
  status: string; // 'M' | 'A' | 'D' | 'R' | 'U'
}

export interface ActiveDiffDetails {
  path: string;
  status: string;
  headContent: string;
  workingContent: string;
  staged: boolean;
}

export interface GitCommitHistoryItem {
  commit: string;
  author: string;
  date: string;
  message: string;
}

interface GitState {
  branch: string;
  commitHash: string;
  author: string;
  lastModified: string;
  lastCommitMessage: string;
  stagedFiles: GitFileItem[];
  unstagedFiles: GitFileItem[];
  
  activeDiff: ActiveDiffDetails | null;
  isDiffActive: boolean;
  renderSideBySide: boolean;
  ignoreWhitespace: boolean;
  commitInput: string;

  fileHistory: GitCommitHistoryItem[];
  isLoadingGit: boolean;
  isPushing: boolean;
  isPulling: boolean;
  isFetching: boolean;
  isSyncing: boolean;
  gitNotification: { type: 'success' | 'error'; message: string } | null;
  ahead: number;
  behind: number;
  isHistoryPanelOpen: boolean;

  fetchGitStatus: () => Promise<void>;
  openDiff: (filePath: string, staged?: boolean) => Promise<void>;
  closeDiff: () => void;
  stageFile: (filePath: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commitStaged: (message: string) => Promise<boolean>;
  commitStagedAndPush: (message: string, remote?: string, branch?: string) => Promise<boolean>;
  pushRepo: (remote?: string, branch?: string) => Promise<boolean>;
  pullRepo: (remote?: string, branch?: string) => Promise<boolean>;
  fetchRepo: (remote?: string) => Promise<boolean>;
  syncRepo: (remote?: string, branch?: string) => Promise<boolean>;
  clearGitNotification: () => void;
  toggleRenderSideBySide: () => void;
  toggleIgnoreWhitespace: () => void;
  setCommitInput: (input: string) => void;
  fetchFileHistory: (filePath: string) => Promise<void>;
  toggleHistoryPanel: () => void;
  openDiffAtRef: (filePath: string, ref: string) => Promise<void>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export const useGitStore = create<GitState>((set, get) => ({
  branch: 'main',
  commitHash: '',
  author: '',
  lastModified: '',
  lastCommitMessage: '',
  stagedFiles: [],
  unstagedFiles: [],
  
  activeDiff: null,
  isDiffActive: false,
  renderSideBySide: typeof window !== 'undefined' ? (localStorage.getItem('gravityx_diff_sidebyside') !== 'false') : true,
  ignoreWhitespace: false,
  commitInput: '',
  fileHistory: [],
  isLoadingGit: false,
  isPushing: false,
  isPulling: false,
  isFetching: false,
  isSyncing: false,
  gitNotification: null,
  ahead: 0,
  behind: 0,
  isHistoryPanelOpen: false,

  clearGitNotification: () => set({ gitNotification: null }),
  toggleHistoryPanel: () => set((s) => ({ isHistoryPanelOpen: !s.isHistoryPanelOpen })),

  setCommitInput: (input: string) => set({ commitInput: input }),

  toggleRenderSideBySide: () => {
    const nextVal = !get().renderSideBySide;
    if (typeof window !== 'undefined') {
      localStorage.setItem('gravityx_diff_sidebyside', String(nextVal));
    }
    set({ renderSideBySide: nextVal });
  },

  toggleIgnoreWhitespace: () => {
    const nextVal = !get().ignoreWhitespace;
    set({ ignoreWhitespace: nextVal });
    const { activeDiff } = get();
    if (activeDiff) {
      get().openDiff(activeDiff.path, activeDiff.staged);
    }
  },

  fetchGitStatus: async () => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    set({ isLoadingGit: true });

    try {
      const res = await fetch(`${API_BASE}/git/status?project_id=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch git status");
      const data = await res.json();
      if (data.status === 'success') {
        set({
          branch: data.branch || 'main',
          commitHash: data.commit || '',
          author: data.author || '',
          lastModified: data.last_modified || '',
          lastCommitMessage: data.commit_message || '',
          stagedFiles: data.staged || [],
          unstagedFiles: data.unstaged || [],
          ahead: typeof data.ahead === 'number' ? data.ahead : 0,
          behind: typeof data.behind === 'number' ? data.behind : 0,
          isLoadingGit: false
        });
      }
    } catch (err) {
      console.error("Git status fetch error:", err);
      set({ isLoadingGit: false });
    }
  },

  openDiff: async (filePath: string, staged: boolean = false) => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    set({ isLoadingGit: true });

    try {
      const { stagedFiles, unstagedFiles } = get();
      const match = (staged ? stagedFiles : unstagedFiles).find(f => f.path === filePath) ||
                    unstagedFiles.find(f => f.path === filePath) ||
                    stagedFiles.find(f => f.path === filePath);

      const status = match ? match.status : 'M';

      const res = await fetch(`${API_BASE}/git/file-content?project_id=${projectId}&path=${encodeURIComponent(filePath)}&ref=HEAD`);
      if (!res.ok) throw new Error("Failed to fetch diff file content");
      const data = await res.json();

      if (data.status === 'success') {
        const activeDiffData: ActiveDiffDetails = {
          path: filePath,
          status,
          headContent: data.head_content,
          workingContent: data.working_content,
          staged
        };

        set({
          activeDiff: activeDiffData,
          isDiffActive: true,
          isLoadingGit: false
        });

        await workspaceStore.openTab(filePath);
        get().fetchFileHistory(filePath);
      }
    } catch (err) {
      console.error("Error opening diff:", err);
      set({ isLoadingGit: false });
    }
  },

  closeDiff: () => {
    set({ activeDiff: null, isDiffActive: false });
  },

  stageFile: async (filePath: string) => {
    await useWorkspaceStore.getState().saveAllDirtyFiles();
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    try {
      const res = await fetch(`${API_BASE}/git/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, path: filePath })
      });
      if (res.ok) {
        await get().fetchGitStatus();
        const { activeDiff } = get();
        if (activeDiff && activeDiff.path === filePath) {
          set({ activeDiff: { ...activeDiff, staged: true } });
        }
      }
    } catch (err) {
      console.error("Stage error:", err);
    }
  },

  unstageFile: async (filePath: string) => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    try {
      const res = await fetch(`${API_BASE}/git/unstage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, path: filePath })
      });
      if (res.ok) {
        await get().fetchGitStatus();
        const { activeDiff } = get();
        if (activeDiff && activeDiff.path === filePath) {
          set({ activeDiff: { ...activeDiff, staged: false } });
        }
      }
    } catch (err) {
      console.error("Unstage error:", err);
    }
  },

  stageAll: async () => {
    await useWorkspaceStore.getState().saveAllDirtyFiles();
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    try {
      const res = await fetch(`${API_BASE}/git/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, path: '' })
      });
      if (res.ok) {
        await get().fetchGitStatus();
      }
    } catch (err) {
      console.error("Stage all error:", err);
    }
  },

  unstageAll: async () => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    try {
      const res = await fetch(`${API_BASE}/git/unstage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, path: '' })
      });
      if (res.ok) {
        await get().fetchGitStatus();
      }
    } catch (err) {
      console.error("Unstage all error:", err);
    }
  },

  commitStaged: async (message: string) => {
    const savedPaths = await useWorkspaceStore.getState().saveAllDirtyFiles();
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    if (!message.trim()) return false;

    if (savedPaths && savedPaths.length > 0) {
      for (const p of savedPaths) {
        await fetch(`${API_BASE}/git/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId, path: p })
        });
      }
      await get().fetchGitStatus();
    }

    try {
      const res = await fetch(`${API_BASE}/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, message: message.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'success') {
        set({
          commitInput: '',
          gitNotification: { type: 'success', message: `Committed ${data.commit_hash || ''}: ${message.trim()}` }
        });
        await get().fetchGitStatus();
        get().closeDiff();
        return true;
      } else {
        set({ gitNotification: { type: 'error', message: data.detail || 'Commit failed.' } });
        return false;
      }
    } catch (err: any) {
      set({ gitNotification: { type: 'error', message: err.message || 'Commit network error.' } });
      return false;
    }
  },

  pushRepo: async (remote = 'origin', branch) => {
    await useWorkspaceStore.getState().saveAllDirtyFiles();
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    set({ isPushing: true, gitNotification: null });

    try {
      const targetBranch = branch || get().branch || 'main';
      const res = await fetch(`${API_BASE}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, remote, branch: targetBranch })
      });
      const data = await res.json().catch(() => ({}));
      set({ isPushing: false });

      if (res.ok && data.status === 'success') {
        set({ gitNotification: { type: 'success', message: data.message || `Successfully pushed to ${remote}/${targetBranch}` } });
        await get().fetchGitStatus();
        return true;
      } else {
        set({ gitNotification: { type: 'error', message: data.detail || 'Push failed.' } });
        await get().fetchGitStatus();
        return false;
      }
    } catch (err: any) {
      set({ isPushing: false, gitNotification: { type: 'error', message: err.message || 'Push failed due to network error.' } });
      await get().fetchGitStatus();
      return false;
    }
  },

  pullRepo: async (remote = 'origin', branch) => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    set({ isPulling: true, gitNotification: null });

    try {
      const res = await fetch(`${API_BASE}/git/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, remote, branch })
      });
      const data = await res.json().catch(() => ({}));
      set({ isPulling: false });

      if (res.ok && data.status === 'success') {
        set({ gitNotification: { type: 'success', message: data.message || `Successfully pulled from ${remote}/${branch || get().branch}` } });
        await get().fetchGitStatus();
        await workspaceStore.fetchTree();
        return true;
      } else {
        set({ gitNotification: { type: 'error', message: data.detail || 'Pull failed.' } });
        return false;
      }
    } catch (err: any) {
      set({ isPulling: false, gitNotification: { type: 'error', message: err.message || 'Pull failed due to network error.' } });
      return false;
    }
  },

  fetchRepo: async (remote = 'origin') => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    set({ isFetching: true, gitNotification: null });

    try {
      const res = await fetch(`${API_BASE}/git/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, remote })
      });
      const data = await res.json().catch(() => ({}));
      set({ isFetching: false });

      if (res.ok && data.status === 'success') {
        set({ gitNotification: { type: 'success', message: data.message || `Fetched from ${remote}` } });
        await get().fetchGitStatus();
        return true;
      } else {
        set({ gitNotification: { type: 'error', message: data.detail || 'Fetch failed.' } });
        return false;
      }
    } catch (err: any) {
      set({ isFetching: false, gitNotification: { type: 'error', message: err.message || 'Fetch error.' } });
      return false;
    }
  },

  syncRepo: async (remote = 'origin', branch) => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    set({ isSyncing: true, gitNotification: null });

    try {
      const res = await fetch(`${API_BASE}/git/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, remote, branch })
      });
      const data = await res.json().catch(() => ({}));
      set({ isSyncing: false });

      if (res.ok && data.status === 'success') {
        set({ gitNotification: { type: 'success', message: data.message || `Synchronized with ${remote}/${branch || get().branch}` } });
        await get().fetchGitStatus();
        await workspaceStore.fetchTree();
        return true;
      } else {
        set({ gitNotification: { type: 'error', message: data.detail || 'Sync failed.' } });
        return false;
      }
    } catch (err: any) {
      set({ isSyncing: false, gitNotification: { type: 'error', message: err.message || 'Sync error.' } });
      return false;
    }
  },

  fetchFileHistory: async (filePath: string) => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    try {
      const res = await fetch(`${API_BASE}/git/file-history?project_id=${projectId}&path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          set({ fileHistory: data.history || [] });
        }
      }
    } catch (err) {
      console.error("File history error:", err);
    }
  },

  openDiffAtRef: async (filePath: string, ref: string) => {
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    set({ isLoadingGit: true });

    try {
      const res = await fetch(`${API_BASE}/git/file-content?project_id=${projectId}&path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(ref)}`);
      if (!res.ok) throw new Error('Failed to fetch file at ref');
      const data = await res.json();

      if (data.status === 'success') {
        const { activeDiff } = get();
        if (activeDiff) {
          set({
            activeDiff: {
              ...activeDiff,
              headContent: data.head_content,
            },
            isLoadingGit: false
          });
        }
      }
    } catch (err) {
      console.error('openDiffAtRef error:', err);
      set({ isLoadingGit: false });
    }
  },

  commitStagedAndPush: async (message: string, remote = 'origin', branch?: string) => {
    const savedPaths = await useWorkspaceStore.getState().saveAllDirtyFiles();
    const workspaceStore = useWorkspaceStore.getState();
    const projectId = workspaceStore.currentProject?.id || 'gravityx-core';
    if (!message.trim()) return false;

    if (savedPaths && savedPaths.length > 0) {
      for (const p of savedPaths) {
        await fetch(`${API_BASE}/git/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId, path: p })
        });
      }
      await get().fetchGitStatus();
    }

    set({ gitNotification: null });
    try {
      const commitRes = await fetch(`${API_BASE}/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, message: message.trim() })
      });
      const commitData = await commitRes.json().catch(() => ({}));
      if (!commitRes.ok || commitData.status !== 'success') {
        set({ gitNotification: { type: 'error', message: commitData.detail || 'Commit failed.' } });
        return false;
      }

      const activeBranch = branch || get().branch || 'main';

      set({ isPushing: true });
      const pushRes = await fetch(`${API_BASE}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, remote, branch: activeBranch })
      });
      const pushData = await pushRes.json().catch(() => ({}));
      set({ isPushing: false });

      if (pushRes.ok && pushData.status === 'success') {
        set({
          commitInput: '',
          gitNotification: { type: 'success', message: `Committed & pushed to ${remote}/${activeBranch}` }
        });
        await get().fetchGitStatus();
        get().closeDiff();
        return true;
      } else {
        set({ gitNotification: { type: 'error', message: pushData.detail || 'Push failed after commit.' } });
        await get().fetchGitStatus();
        return false;
      }
    } catch (err: any) {
      set({ isPushing: false, gitNotification: { type: 'error', message: err.message || 'Commit & push error.' } });
      return false;
    }
  }
}));
