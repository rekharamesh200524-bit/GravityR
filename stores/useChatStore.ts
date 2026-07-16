import { create } from 'zustand';
import { ChatSession, ChatMessage, PlannerStep, CodeDiff } from '../types';
import { useProjectStore } from './useProjectStore';

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string;
  isStreaming: boolean;
  inputPrompt: string;
  recentPrompts: string[];
  sendMessage: (content: string, modelId: string) => Promise<void>;
  stopGeneration: () => void;
  setInputPrompt: (prompt: string) => void;
  createNewSession: (projectId: string) => void;
  setActiveSession: (sessionId: string) => void;
}

const MOCK_SESSIONS: ChatSession[] = [
  {
    id: 'session-1',
    title: 'Update primary button hover styles',
    projectId: 'gravityx-core',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Can we edit components/Button.tsx to use a premium purple theme with cool hover effects and shadow glows?',
        timestamp: Date.now() - 3500000
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'I have updated `components/Button.tsx` to add a premium violet gradient design, micro-animations on hover and active click, and a sleek violet neon shadow glow. You can inspect the changes in the Diff Panel.',
        timestamp: Date.now() - 3400000,
        status: 'done',
        steps: [
          { id: 's1', title: 'Locate file', description: 'Found components/Button.tsx in project space.', status: 'completed', timestamp: Date.now() - 3480000 },
          { id: 's2', title: 'Generate violet styling diff', description: 'Applying glassmorphism borders and transition scale active values.', status: 'completed', timestamp: Date.now() - 3450000 },
        ],
        diffs: [
          {
            filePath: '/components/Button.tsx',
            original: `import React from 'react';\n\nexport const Button = () => {\n  return <button className="px-4 py-2 bg-blue-600 rounded">Click me</button>;\n};`,
            modified: `import React from 'react';\n\nexport const Button = () => {\n  return (\n    <button className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] text-white font-semibold rounded-lg shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 border border-violet-400/20 active:scale-95">\n      Click me\n    </button>\n  );\n};`
          }
        ]
      }
    ]
  }
];

let streamTimeout: NodeJS.Timeout | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: MOCK_SESSIONS,
  activeSessionId: 'session-1',
  isStreaming: false,
  inputPrompt: '',
  recentPrompts: [
    'How do I add a new Route in Next.js App Router?',
    'Configure Tailwind CSS glassmorphism styling tokens',
    'Write a mock API service class using TypeScript Promises',
    'Create an accessible overlay dialog layout with Framer Motion'
  ],
  setInputPrompt: (prompt) => set({ inputPrompt: prompt }),
  createNewSession: (projectId) => {
    const newSession: ChatSession = {
      id: `session-${Math.random().toString(36).substring(7)}`,
      title: 'New Chat Session',
      projectId,
      createdAt: new Date().toISOString(),
      messages: []
    };
    set(state => ({
      sessions: [newSession, ...state.sessions],
      activeSessionId: newSession.id
    }));
  },
  setActiveSession: (activeSessionId) => set({ activeSessionId }),
  sendMessage: async (content, modelId) => {
    const { sessions, activeSessionId } = get();
    const session = sessions.find(s => s.id === activeSessionId);
    if (!session) return;

    const userMessage: ChatMessage = {
      id: `msg-${Math.random().toString(36).substring(7)}`,
      role: 'user',
      content,
      timestamp: Date.now()
    };

    const assistantMessageId = `msg-${Math.random().toString(36).substring(7)}`;
    const initialAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'thinking',
      steps: [
        { id: 'step-1', title: 'Analyzing environment', description: 'Inspecting files and context elements.', status: 'running', timestamp: Date.now() },
        { id: 'step-2', title: 'Synthesizing changes', description: 'Generating the optimal code diff.', status: 'pending', timestamp: Date.now() }
      ]
    };

    const updatedMessages = [...session.messages, userMessage, initialAssistantMessage];
    
    set({
      inputPrompt: '',
      isStreaming: true,
      sessions: sessions.map(s => s.id === activeSessionId ? { ...s, messages: updatedMessages } : s)
    });

    // Simulate agent steps and SSE streaming
    let chars = 0;
    const fullText = `I've analyzed your project layout. To complete your request, I will generate a code optimization diff.

Here is the plan of action:
1. Review styling variables in the target component.
2. Edit CSS classes to achieve a rich developer-focused visual look.
3. Validate typography scale and rendering logic.

I have updated the target component to support smooth scaling transitions, rounded corners, and a border outline. You can inspect the modification inside the Diff editor. Let me know if you would like any further tuning!`;

    const simulatedDiff: CodeDiff = {
      filePath: '/app/page.tsx',
      original: `import React from 'react';\nimport { Dashboard } from '@/components/Dashboard';\n\nexport default function Page() {\n  return (\n    <main className="min-h-screen bg-slate-950 text-white p-6">\n      <h1 className="text-xl font-bold">Welcome to GravityX</h1>\n      <p>Let's build something epic.</p>\n    </main>\n  );\n}`,
      modified: `import React from 'react';\nimport { Dashboard } from '@/components/Dashboard';\nimport { GradientCard } from '@/components/GradientCard';\n\nexport default function Page() {\n  return (\n    <main className="min-h-screen bg-gradient-to-b from-[#080710] to-[#0f111a] text-slate-100 p-8 flex flex-col items-center justify-center font-sans antialiased overflow-hidden relative">\n      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(139,92,246,0.1),transparent_50%)] pointer-events-none" />\n      <GradientCard className="max-w-xl p-8 rounded-2xl border border-slate-800/60 bg-slate-900/50 backdrop-blur-xl shadow-2xl">\n        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-violet-400 via-fuchsia-300 to-indigo-400 bg-clip-text text-transparent mb-4 tracking-tight">GravityX AI Workspace</h1>\n        <p className="text-slate-400 leading-relaxed mb-6">Let's build something epic. Your professional workspace is ready and connected to the high-performance compiler.</p>\n      </GradientCard>\n    </main>\n  );\n}`
    };

    const runStream = () => {
      if (!get().isStreaming) return;

      const currentSession = get().sessions.find(s => s.id === activeSessionId);
      if (!currentSession) return;

      const currentMsgs = [...currentSession.messages];
      const assistantMsgIndex = currentMsgs.findIndex(m => m.id === assistantMessageId);
      
      if (assistantMsgIndex === -1) return;

      if (chars < 15) {
        // Still thinking, simulate step 1 completion
        const msg = currentMsgs[assistantMsgIndex];
        const steps = msg.steps ? [...msg.steps] : [];
        if (steps[0]) steps[0].status = 'completed';
        if (steps[1]) steps[1].status = 'running';
        
        currentMsgs[assistantMsgIndex] = {
          ...msg,
          status: 'streaming',
          steps
        };
        
        set({
          sessions: get().sessions.map(s => s.id === activeSessionId ? { ...s, messages: currentMsgs } : s)
        });
        chars += 2;
        streamTimeout = setTimeout(runStream, 200);
      } else if (chars < fullText.length) {
        // Stream text
        chars += Math.floor(Math.random() * 8) + 4;
        const streamedText = fullText.slice(0, chars);
        
        const msg = currentMsgs[assistantMsgIndex];
        currentMsgs[assistantMsgIndex] = {
          ...msg,
          content: streamedText,
          status: 'streaming'
        };

        set({
          sessions: get().sessions.map(s => s.id === activeSessionId ? { ...s, messages: currentMsgs } : s)
        });

        streamTimeout = setTimeout(runStream, 35);
      } else {
        // Finished streaming, complete steps and attach diffs
        const msg = currentMsgs[assistantMsgIndex];
        const steps = msg.steps ? [...msg.steps] : [];
        if (steps[1]) steps[1].status = 'completed';
        
        currentMsgs[assistantMsgIndex] = {
          ...msg,
          content: fullText,
          status: 'done',
          steps,
          diffs: [simulatedDiff]
        };

        // Also update file in the project store to match modified
        const projectStore = useProjectStore.getState();
        const activeProj = projectStore.projects.find(p => p.id === projectStore.activeProjectId);
        if (activeProj) {
          // Temporarily put the modified code in project active content so that Monaco Diff editor is automatically synced
          projectStore.updateFileContent(simulatedDiff.modified);
        }

        set({
          isStreaming: false,
          sessions: get().sessions.map(s => s.id === activeSessionId ? { ...s, messages: currentMsgs } : s)
        });
      }
    };

    streamTimeout = setTimeout(runStream, 800);
  },
  stopGeneration: () => {
    if (streamTimeout) {
      clearTimeout(streamTimeout);
    }
    const { sessions, activeSessionId } = get();
    const currentSession = sessions.find(s => s.id === activeSessionId);
    if (!currentSession) return;

    const currentMsgs = [...currentSession.messages];
    const streamMsg = currentMsgs.find(m => m.status === 'streaming' || m.status === 'thinking');
    if (streamMsg) {
      streamMsg.status = 'done';
      if (streamMsg.steps) {
        streamMsg.steps = streamMsg.steps.map(s => s.status === 'running' ? { ...s, status: 'completed' } : s);
      }
    }

    set({
      isStreaming: false,
      sessions: sessions.map(s => s.id === activeSessionId ? { ...s, messages: currentMsgs } : s)
    });
  }
}));
