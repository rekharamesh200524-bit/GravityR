export interface ThemeDefinition {
  id: string;
  name: string;
  type: 'dark' | 'light';
  colors: {
    bgApp: string;
    bgSidebar: string;
    bgActivity: string;
    bgStatusbar: string;
    bgMenubar: string;
    bgEditor: string;
    bgCard: string;
    bgTabs: string;
    fgPrimary: string;
    fgSecondary: string;
    fgMuted: string;
    borderColor: string;
    accentColor: string;
    selectionBg: string;
    treeHover: string;
    terminalBg: string;
    terminalFg: string;
  };
  monacoBase: 'vs' | 'vs-dark' | 'hc-black';
  monacoRules?: any[];
  xtermTheme: {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
  };
}

export const THEMES: Record<string, ThemeDefinition> = {
  'dark': {
    id: 'dark',
    name: 'Dark (Default)',
    type: 'dark',
    colors: {
      bgApp: '#03050a',
      bgSidebar: '#060810',
      bgActivity: '#05060a',
      bgStatusbar: '#04050a',
      bgMenubar: '#05070d',
      bgEditor: '#0b0d17',
      bgCard: '#0f1322',
      bgTabs: '#080a12',
      fgPrimary: '#f8fafc',
      fgSecondary: '#94a3b8',
      fgMuted: '#64748b',
      borderColor: '#1e293b',
      accentColor: '#8b5cf6',
      selectionBg: 'rgba(139, 92, 246, 0.25)',
      treeHover: 'rgba(139, 92, 246, 0.1)',
      terminalBg: '#04060a',
      terminalFg: '#e2e8f0',
    },
    monacoBase: 'vs-dark',
    xtermTheme: {
      background: '#04060a',
      foreground: '#e2e8f0',
      cursor: '#8b5cf6',
      selectionBackground: 'rgba(139, 92, 246, 0.3)',
      black: '#000000',
      red: '#ef4444',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#8b5cf6',
      cyan: '#06b6d4',
      white: '#ffffff',
    }
  },
  'light': {
    id: 'light',
    name: 'Light',
    type: 'light',
    colors: {
      bgApp: '#f8fafc',
      bgSidebar: '#f1f5f9',
      bgActivity: '#e2e8f0',
      bgStatusbar: '#cbd5e1',
      bgMenubar: '#e2e8f0',
      bgEditor: '#ffffff',
      bgCard: '#ffffff',
      bgTabs: '#f1f5f9',
      fgPrimary: '#0f172a',
      fgSecondary: '#475569',
      fgMuted: '#94a3b8',
      borderColor: '#cbd5e1',
      accentColor: '#7c3aed',
      selectionBg: 'rgba(124, 58, 237, 0.15)',
      treeHover: 'rgba(124, 58, 237, 0.08)',
      terminalBg: '#f8fafc',
      terminalFg: '#0f172a',
    },
    monacoBase: 'vs',
    xtermTheme: {
      background: '#f8fafc',
      foreground: '#0f172a',
      cursor: '#7c3aed',
      selectionBackground: 'rgba(124, 58, 237, 0.2)',
      black: '#0f172a',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#d97706',
      blue: '#2563eb',
      magenta: '#7c3aed',
      cyan: '#0891b2',
      white: '#f8fafc',
    }
  },
  'vscode-dark': {
    id: 'vscode-dark',
    name: 'VS Code Dark+',
    type: 'dark',
    colors: {
      bgApp: '#1e1e1e',
      bgSidebar: '#252526',
      bgActivity: '#333333',
      bgStatusbar: '#007acc',
      bgMenubar: '#323233',
      bgEditor: '#1e1e1e',
      bgCard: '#252526',
      bgTabs: '#2d2d2d',
      fgPrimary: '#d4d4d4',
      fgSecondary: '#cccccc',
      fgMuted: '#858585',
      borderColor: '#3c3c3c',
      accentColor: '#007acc',
      selectionBg: 'rgba(0, 122, 204, 0.4)',
      treeHover: 'rgba(255, 255, 255, 0.08)',
      terminalBg: '#1e1e1e',
      terminalFg: '#cccccc',
    },
    monacoBase: 'vs-dark',
    xtermTheme: {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#007acc',
      selectionBackground: 'rgba(0, 122, 204, 0.5)',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a5c6',
      white: '#e5e5e5',
    }
  },
  'vscode-light': {
    id: 'vscode-light',
    name: 'VS Code Light+',
    type: 'light',
    colors: {
      bgApp: '#ffffff',
      bgSidebar: '#f3f3f3',
      bgActivity: '#2c2c2c',
      bgStatusbar: '#007acc',
      bgMenubar: '#dddddd',
      bgEditor: '#ffffff',
      bgCard: '#f3f3f3',
      bgTabs: '#ececec',
      fgPrimary: '#000000',
      fgSecondary: '#333333',
      fgMuted: '#767676',
      borderColor: '#e5e5e5',
      accentColor: '#007acc',
      selectionBg: 'rgba(0, 122, 204, 0.2)',
      treeHover: 'rgba(0, 0, 0, 0.05)',
      terminalBg: '#ffffff',
      terminalFg: '#333333',
    },
    monacoBase: 'vs',
    xtermTheme: {
      background: '#ffffff',
      foreground: '#333333',
      cursor: '#007acc',
      selectionBackground: 'rgba(0, 122, 204, 0.25)',
      black: '#000000',
      red: '#cd3131',
      green: '#14ce14',
      yellow: '#b5ba00',
      blue: '#0451a5',
      magenta: '#bc05bc',
      cyan: '#0598bc',
      white: '#555555',
    }
  },
  'dracula': {
    id: 'dracula',
    name: 'Dracula',
    type: 'dark',
    colors: {
      bgApp: '#282a36',
      bgSidebar: '#21222c',
      bgActivity: '#191a21',
      bgStatusbar: '#191a21',
      bgMenubar: '#21222c',
      bgEditor: '#282a36',
      bgCard: '#343746',
      bgTabs: '#21222c',
      fgPrimary: '#f8f8f2',
      fgSecondary: '#6272a4',
      fgMuted: '#6272a4',
      borderColor: '#44475a',
      accentColor: '#bd93f9',
      selectionBg: 'rgba(189, 147, 249, 0.3)',
      treeHover: 'rgba(68, 71, 90, 0.5)',
      terminalBg: '#282a36',
      terminalFg: '#f8f8f2',
    },
    monacoBase: 'vs-dark',
    xtermTheme: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
    }
  },
  'github-dark': {
    id: 'github-dark',
    name: 'GitHub Dark',
    type: 'dark',
    colors: {
      bgApp: '#0d1117',
      bgSidebar: '#161b22',
      bgActivity: '#010409',
      bgStatusbar: '#161b22',
      bgMenubar: '#161b22',
      bgEditor: '#0d1117',
      bgCard: '#161b22',
      bgTabs: '#010409',
      fgPrimary: '#c9d1d9',
      fgSecondary: '#8b949e',
      fgMuted: '#6e7681',
      borderColor: '#30363d',
      accentColor: '#58a6ff',
      selectionBg: 'rgba(56, 139, 253, 0.3)',
      treeHover: 'rgba(177, 186, 196, 0.12)',
      terminalBg: '#0d1117',
      terminalFg: '#c9d1d9',
    },
    monacoBase: 'vs-dark',
    xtermTheme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selectionBackground: '#1f6feb',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
    }
  },
  'github-light': {
    id: 'github-light',
    name: 'GitHub Light',
    type: 'light',
    colors: {
      bgApp: '#ffffff',
      bgSidebar: '#f6f8fa',
      bgActivity: '#eaeef2',
      bgStatusbar: '#f6f8fa',
      bgMenubar: '#f6f8fa',
      bgEditor: '#ffffff',
      bgCard: '#f6f8fa',
      bgTabs: '#eaeef2',
      fgPrimary: '#24292f',
      fgSecondary: '#57606a',
      fgMuted: '#8c959f',
      borderColor: '#d0d7de',
      accentColor: '#0969da',
      selectionBg: 'rgba(9, 105, 218, 0.15)',
      treeHover: 'rgba(208, 215, 222, 0.32)',
      terminalBg: '#ffffff',
      terminalFg: '#24292f',
    },
    monacoBase: 'vs',
    xtermTheme: {
      background: '#ffffff',
      foreground: '#24292f',
      cursor: '#0969da',
      selectionBackground: '#babbbd',
      black: '#24292f',
      red: '#cf222e',
      green: '#116329',
      yellow: '#4d2d00',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#1b7c83',
      white: '#6e7781',
    }
  },
  'monokai': {
    id: 'monokai',
    name: 'Monokai',
    type: 'dark',
    colors: {
      bgApp: '#272822',
      bgSidebar: '#1e1f1c',
      bgActivity: '#191917',
      bgStatusbar: '#1e1f1c',
      bgMenubar: '#1e1f1c',
      bgEditor: '#272822',
      bgCard: '#3e3d32',
      bgTabs: '#1e1f1c',
      fgPrimary: '#f8f8f2',
      fgSecondary: '#cfcfc2',
      fgMuted: '#75715e',
      borderColor: '#3e3d32',
      accentColor: '#f92672',
      selectionBg: 'rgba(249, 38, 114, 0.3)',
      treeHover: 'rgba(249, 38, 114, 0.15)',
      terminalBg: '#272822',
      terminalFg: '#f8f8f2',
    },
    monacoBase: 'vs-dark',
    xtermTheme: {
      background: '#272822',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      selectionBackground: '#49483e',
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#e6db74',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
    }
  },
  'one-dark-pro': {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    type: 'dark',
    colors: {
      bgApp: '#282c34',
      bgSidebar: '#21252b',
      bgActivity: '#1b1d23',
      bgStatusbar: '#21252b',
      bgMenubar: '#21252b',
      bgEditor: '#282c34',
      bgCard: '#2c313a',
      bgTabs: '#21252b',
      fgPrimary: '#abb2bf',
      fgSecondary: '#828997',
      fgMuted: '#5c6370',
      borderColor: '#181a1f',
      accentColor: '#61afef',
      selectionBg: 'rgba(97, 175, 239, 0.3)',
      treeHover: 'rgba(97, 175, 239, 0.12)',
      terminalBg: '#282c34',
      terminalFg: '#abb2bf',
    },
    monacoBase: 'vs-dark',
    xtermTheme: {
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#61afef',
      selectionBackground: '#3e4451',
      black: '#282c34',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
    }
  },
  'solarized-dark': {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    type: 'dark',
    colors: {
      bgApp: '#002b36',
      bgSidebar: '#073642',
      bgActivity: '#002129',
      bgStatusbar: '#073642',
      bgMenubar: '#073642',
      bgEditor: '#002b36',
      bgCard: '#073642',
      bgTabs: '#002129',
      fgPrimary: '#839496',
      fgSecondary: '#93a1a1',
      fgMuted: '#586e75',
      borderColor: '#073642',
      accentColor: '#268bd2',
      selectionBg: 'rgba(38, 139, 210, 0.3)',
      treeHover: 'rgba(38, 139, 210, 0.15)',
      terminalBg: '#002b36',
      terminalFg: '#839496',
    },
    monacoBase: 'vs-dark',
    xtermTheme: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#839496',
      selectionBackground: '#073642',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
    }
  },
  'solarized-light': {
    id: 'solarized-light',
    name: 'Solarized Light',
    type: 'light',
    colors: {
      bgApp: '#fdf6e3',
      bgSidebar: '#eee8d5',
      bgActivity: '#e0d8c3',
      bgStatusbar: '#eee8d5',
      bgMenubar: '#eee8d5',
      bgEditor: '#fdf6e3',
      bgCard: '#eee8d5',
      bgTabs: '#e0d8c3',
      fgPrimary: '#657b83',
      fgSecondary: '#586e75',
      fgMuted: '#93a1a1',
      borderColor: '#d3cbb7',
      accentColor: '#268bd2',
      selectionBg: 'rgba(38, 139, 210, 0.2)',
      treeHover: 'rgba(38, 139, 210, 0.1)',
      terminalBg: '#fdf6e3',
      terminalFg: '#657b83',
    },
    monacoBase: 'vs',
    xtermTheme: {
      background: '#fdf6e3',
      foreground: '#657b83',
      cursor: '#657b83',
      selectionBackground: '#eee8d5',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#fdf6e3',
    }
  }
};

export const applyThemeToDOM = (themeId: string) => {
  if (typeof document === 'undefined') return;
  const theme = THEMES[themeId] || THEMES['dark'];
  const root = document.documentElement;

  root.setAttribute('data-theme', theme.id);
  if (theme.type === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }

  // Set CSS Variables dynamically on root element
  root.style.setProperty('--bg-app', theme.colors.bgApp);
  root.style.setProperty('--bg-sidebar', theme.colors.bgSidebar);
  root.style.setProperty('--bg-activity', theme.colors.bgActivity);
  root.style.setProperty('--bg-statusbar', theme.colors.bgStatusbar);
  root.style.setProperty('--bg-menubar', theme.colors.bgMenubar);
  root.style.setProperty('--bg-editor', theme.colors.bgEditor);
  root.style.setProperty('--bg-card', theme.colors.bgCard);
  root.style.setProperty('--bg-tabs', theme.colors.bgTabs);
  root.style.setProperty('--fg-primary', theme.colors.fgPrimary);
  root.style.setProperty('--fg-secondary', theme.colors.fgSecondary);
  root.style.setProperty('--fg-muted', theme.colors.fgMuted);
  root.style.setProperty('--border-color', theme.colors.borderColor);
  root.style.setProperty('--accent-color', theme.colors.accentColor);
  root.style.setProperty('--selection-bg', theme.colors.selectionBg);
  root.style.setProperty('--tree-hover', theme.colors.treeHover);
  root.style.setProperty('--terminal-bg', theme.colors.terminalBg);
  root.style.setProperty('--terminal-fg', theme.colors.terminalFg);

  // Dispatch global event for subscribers (Monaco, Xterm)
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
};
