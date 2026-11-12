import { create } from 'zustand';
import { AIProvider, AIModel } from '../types';
import { applyThemeToDOM } from '../utils/themeManager';

export const AVAILABLE_MODELS: AIModel[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', contextWindow: 1048576, description: 'Fast, reasoning-capable model optimized for coding agents.' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', contextWindow: 2097152, description: 'Flagship reasoning model for complex architecture & multi-file edits.' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', contextWindow: 1048576, description: 'Low-latency multimodal model for rapid iteration.' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, description: 'State-of-the-art programming assistant with deep explanation.' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, description: 'Fast, cost-efficient OpenAI coding model.' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, description: 'Versatile, high-speed flagship reasoning model.' },
  { id: 'qwen2.5-coder-7b-instruct', name: 'Qwen 2.5 Coder 7B', provider: 'ollama', contextWindow: 32768, description: 'Local coding model running via Ollama.' },
];

export interface EditorOptions {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
  minimap: boolean;
  lineNumbers: 'on' | 'off' | 'relative' | 'interval';
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
  bracketPairColorization: boolean;
}

const DEFAULT_EDITOR_OPTIONS: EditorOptions = {
  fontFamily: "'Consolas', 'Fira Code', 'JetBrains Mono', monospace",
  fontSize: 14,
  lineHeight: 20,
  tabSize: 2,
  wordWrap: 'off',
  cursorStyle: 'line',
  minimap: true,
  lineNumbers: 'on',
  renderWhitespace: 'selection',
  bracketPairColorization: true,
};

interface SettingsState {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  theme: string;
  editorOptions: EditorOptions;
  availableModels: AIModel[];
  setProvider: (provider: AIProvider) => void;
  setModel: (modelId: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setTheme: (themeId: string) => void;
  setEditorOption: <K extends keyof EditorOptions>(key: K, value: EditorOptions[K]) => void;
  initSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  provider: 'google',
  model: 'gemini-2.5-flash',
  temperature: 0.2,
  maxTokens: 4096,
  theme: 'dark',
  editorOptions: DEFAULT_EDITOR_OPTIONS,
  availableModels: AVAILABLE_MODELS,

  setProvider: (provider) => {
    const providerModels = AVAILABLE_MODELS.filter(m => m.provider === provider);
    const defaultModel = providerModels.length > 0 ? providerModels[0].id : '';
    set({ provider, model: defaultModel });
    const gatewayMap: Record<string, string> = {
      google: 'google_gemini',
      anthropic: 'claude',
      openai: 'openai',
      ollama: 'ollama',
    };
    const gwProv = gatewayMap[provider] || 'google_gemini';
    void import('./useAgentStore').then(({ useAgentStore }) => {
      const agent = useAgentStore.getState();
      void agent.selectGatewayProvider(gwProv);
      if (defaultModel) void agent.selectGatewayModel(defaultModel);
    }).catch(() => {});
  },

  setModel: (model) => set({ model }),
  setTemperature: (temperature) => set({ temperature }),
  setMaxTokens: (maxTokens) => set({ maxTokens }),

  setTheme: (themeId: string) => {
    set({ theme: themeId });
    if (typeof window !== 'undefined') {
      localStorage.setItem('gravityx_ide_theme', themeId);
      applyThemeToDOM(themeId);
    }
  },

  setEditorOption: (key, value) => {
    const updatedOptions = { ...get().editorOptions, [key]: value };
    set({ editorOptions: updatedOptions });
    if (typeof window !== 'undefined') {
      localStorage.setItem('gravityx_editor_options', JSON.stringify(updatedOptions));
    }
  },

  initSettings: () => {
    if (typeof window === 'undefined') return;
    const savedTheme = localStorage.getItem('gravityx_ide_theme');
    if (savedTheme) {
      set({ theme: savedTheme });
      applyThemeToDOM(savedTheme);
    } else {
      applyThemeToDOM('dark');
    }

    const savedOptions = localStorage.getItem('gravityx_editor_options');
    if (savedOptions) {
      try {
        const parsed = JSON.parse(savedOptions);
        set({ editorOptions: { ...DEFAULT_EDITOR_OPTIONS, ...parsed } });
      } catch (e) {
        // Ignored
      }
    }
  }
}));
