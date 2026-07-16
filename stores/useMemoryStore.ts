import { create } from 'zustand';
import { MemoryFact } from '../types';

interface MemoryState {
  memories: MemoryFact[];
  contextFiles: string[];
  tokenEstimate: number;
  addMemory: (content: string) => void;
  removeMemory: (id: string) => void;
  addContextFile: (filePath: string) => void;
  removeContextFile: (filePath: string) => void;
  clearContextFiles: () => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  memories: [
    { id: '1', content: 'Preferred language is TypeScript.', createdAt: new Date().toISOString() },
    { id: '2', content: 'Styling standard: Tailwind CSS configuration.', createdAt: new Date().toISOString() },
    { id: '3', content: 'Architecture: feature-based directory structure.', createdAt: new Date().toISOString() },
  ],
  contextFiles: [],
  tokenEstimate: 0,
  addMemory: (content) => set((state) => {
    const newMemory: MemoryFact = {
      id: Math.random().toString(36).substring(7),
      content,
      createdAt: new Date().toISOString()
    };
    return { memories: [...state.memories, newMemory] };
  }),
  removeMemory: (id) => set((state) => ({
    memories: state.memories.filter((m) => m.id !== id)
  })),
  addContextFile: (filePath) => set((state) => {
    if (state.contextFiles.includes(filePath)) return {};
    const newFiles = [...state.contextFiles, filePath];
    // Mock token calculation: each file adds a randomized block of tokens
    const additionalTokens = Math.floor(Math.random() * 800) + 200;
    return {
      contextFiles: newFiles,
      tokenEstimate: state.tokenEstimate + additionalTokens
    };
  }),
  removeContextFile: (filePath) => set((state) => {
    const newFiles = state.contextFiles.filter((f) => f !== filePath);
    const subbedTokens = Math.floor(Math.random() * 800) + 200;
    return {
      contextFiles: newFiles,
      tokenEstimate: Math.max(0, state.tokenEstimate - subbedTokens)
    };
  }),
  clearContextFiles: () => set({ contextFiles: [], tokenEstimate: 0 }),
}));
