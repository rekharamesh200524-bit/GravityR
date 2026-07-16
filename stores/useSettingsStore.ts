import { create } from 'zustand';
import { AIProvider, AIModel } from '../types';

export const AVAILABLE_MODELS: AIModel[] = [
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'google', contextWindow: 1048576, description: 'Fast, lightweight model optimized for developers.' },
  { id: 'gemini-3.5-pro', name: 'Gemini 3.5 Pro', provider: 'google', contextWindow: 2097152, description: 'Highly intelligent model for complex reasoning and coding.' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, description: 'State-of-the-art programming assistant with deep explanation.' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, description: 'Versatile, high-speed flagship reasoning model.' },
  { id: 'llama3-70b', name: 'Llama 3 (70B)', provider: 'ollama', contextWindow: 8192, description: 'Powerful local model running via Ollama integration.' },
];

interface SettingsState {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  theme: string;
  availableModels: AIModel[];
  setProvider: (provider: AIProvider) => void;
  setModel: (modelId: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setTheme: (theme: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  provider: 'google',
  model: 'gemini-3.5-pro',
  temperature: 0.2,
  maxTokens: 4096,
  theme: 'dark',
  availableModels: AVAILABLE_MODELS,
  setProvider: (provider) => {
    // Select first model of new provider by default
    const providerModels = AVAILABLE_MODELS.filter(m => m.provider === provider);
    const defaultModel = providerModels.length > 0 ? providerModels[0].id : '';
    set({ provider, model: defaultModel });
  },
  setModel: (model) => set({ model }),
  setTemperature: (temperature) => set({ temperature }),
  setMaxTokens: (maxTokens) => set({ maxTokens }),
  setTheme: (theme) => set({ theme }),
}));
