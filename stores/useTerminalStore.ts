import { create } from 'zustand';

export interface TerminalTab {
  id: string;          // Unique tab ID (e.g. backend session_id)
  sessionId: string;   // Backend session_id
  name: string;        // Display name, e.g. "PowerShell 1", "npm dev"
  shellType: string;   // "powershell"
  cwd: string;
}

interface TerminalStoreState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  nextTabNumber: number;

  addTab: (tab: TerminalTab) => void;
  removeTab: (id: string) => void;
  setActiveTabId: (id: string) => void;
  renameTab: (id: string, newName: string) => void;
  setTabs: (tabs: TerminalTab[]) => void;
}

export const useTerminalStore = create<TerminalStoreState>((set) => ({
  tabs: [],
  activeTabId: null,
  nextTabNumber: 1,

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      nextTabNumber: state.nextTabNumber + 1,
    })),

  removeTab: (id) =>
    set((state) => {
      const remainingTabs = state.tabs.filter((t) => t.id !== id);
      let newActiveTabId = state.activeTabId;

      if (state.activeTabId === id) {
        if (remainingTabs.length > 0) {
          const removedIndex = state.tabs.findIndex((t) => t.id === id);
          const nextIndex = Math.max(0, Math.min(removedIndex - 1, remainingTabs.length - 1));
          newActiveTabId = remainingTabs[nextIndex].id;
        } else {
          newActiveTabId = null;
        }
      }

      return {
        tabs: remainingTabs,
        activeTabId: newActiveTabId,
      };
    }),

  setActiveTabId: (id) => set({ activeTabId: id }),

  renameTab: (id, newName) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, name: newName } : t)),
    })),

  setTabs: (tabs) => set({ tabs }),
}));
