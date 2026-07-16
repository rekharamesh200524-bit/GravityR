import { create } from 'zustand';

export type SidebarView = 'explorer' | 'search' | 'git' | 'tasks' | 'memory' | 'prompts' | 'extensions' | 'settings';

interface LayoutState {
  sidebarCollapsed: boolean;
  terminalCollapsed: boolean;
  inspectorCollapsed: boolean;
  fileExplorerCollapsed: boolean;
  diffPanelVisible: boolean;
  activeTab: 'chat' | 'diff';
  
  // New IDE Layout States
  activeSidebarView: SidebarView;
  leftPanelCollapsed: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleTerminal: () => void;
  setTerminalCollapsed: (collapsed: boolean) => void;
  toggleInspector: () => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  toggleFileExplorer: () => void;
  setFileExplorerCollapsed: (collapsed: boolean) => void;
  setDiffPanelVisible: (visible: boolean) => void;
  setActiveTab: (tab: 'chat' | 'diff') => void;
  
  // New IDE Layout Actions
  setActiveSidebarView: (view: SidebarView) => void;
  setLeftPanelCollapsed: (collapsed: boolean) => void;
  toggleLeftPanel: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarCollapsed: false,
  terminalCollapsed: false,
  inspectorCollapsed: false,
  fileExplorerCollapsed: false,
  diffPanelVisible: false,
  activeTab: 'chat',
  
  // Defaults
  activeSidebarView: 'explorer',
  leftPanelCollapsed: false,

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleTerminal: () => set((state) => ({ terminalCollapsed: !state.terminalCollapsed })),
  setTerminalCollapsed: (collapsed) => set({ terminalCollapsed: collapsed }),
  toggleInspector: () => set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
  setInspectorCollapsed: (collapsed) => set({ inspectorCollapsed: collapsed }),
  toggleFileExplorer: () => set((state) => ({ fileExplorerCollapsed: !state.fileExplorerCollapsed })),
  setFileExplorerCollapsed: (collapsed) => set({ fileExplorerCollapsed: collapsed }),
  setDiffPanelVisible: (visible) => set({ diffPanelVisible: visible }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  setActiveSidebarView: (view) => set({ activeSidebarView: view }),
  setLeftPanelCollapsed: (collapsed) => set({ leftPanelCollapsed: collapsed }),
  toggleLeftPanel: () => set((state) => ({ leftPanelCollapsed: !state.leftPanelCollapsed })),
}));
