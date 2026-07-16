export interface FileNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: FileNode[];
  content?: string;
  originalContent?: string;
  sizeBytes?: number;
  language?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  fileTree: FileNode[];
}

export interface CodeDiff {
  filePath: string;
  original: string;
  modified: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'thinking' | 'done' | 'streaming';
  steps?: PlannerStep[];
  diffs?: CodeDiff[];
}

export interface PlannerStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: number;
  durationMs?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  projectId: string;
  messages: ChatMessage[];
  createdAt: string;
}

export interface MemoryFact {
  id: string;
  content: string;
  createdAt: string;
}

export type AIProvider = 'google' | 'anthropic' | 'openai' | 'ollama';

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  contextWindow: number;
  description: string;
}
