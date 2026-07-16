import React, { useRef, useEffect } from 'react';
import { Sparkles, MessageSquare, CodeXml, ArrowRight } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ThinkingAnimation } from './ThinkingAnimation';

export const ChatArea: React.FC = () => {
  const { 
    sessions, activeSessionId, isStreaming, sendMessage, stopGeneration, 
    setInputPrompt, inputPrompt, recentPrompts 
  } = useChatStore();
  const { model } = useSettingsStore();

  const session = sessions.find((s) => s.id === activeSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages, isStreaming]);

  const handleSend = (text: string) => {
    sendMessage(text, model);
  };

  const handleQuickPromptClick = (prompt: string) => {
    sendMessage(prompt, model);
  };

  const isThinking = isStreaming && session?.messages.length && session.messages[session.messages.length - 1].status === 'thinking';

  return (
    <div className="flex flex-col h-full bg-[#04060b]/60 backdrop-blur-md relative overflow-hidden">
      {/* Messages Viewport */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto"
      >
        {session && session.messages.length > 0 ? (
          <div className="flex flex-col">
            {session.messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onEdit={(content) => {
                  // Put text back into composer input
                  const chatStore = useChatStore.getState();
                  chatStore.setInputPrompt(content);
                }}
                onRetry={() => {
                  if (session.messages.length >= 2) {
                    const lastUserMsg = session.messages[session.messages.length - 2];
                    if (lastUserMsg && lastUserMsg.role === 'user') {
                      sendMessage(lastUserMsg.content, model);
                    }
                  }
                }}
              />
            ))}
            
            {/* Show thinking status spinner */}
            {isThinking && (
              <div className="p-4 border-b border-slate-900/40 bg-slate-950/40">
                <ThinkingAnimation />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          /* Welcome dashboard if session is empty */
          <div className="flex flex-col items-center justify-center p-8 max-w-2xl mx-auto min-h-[75%] select-none text-center">
            <div className="h-12 w-12 rounded-xl bg-violet-650/15 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-6 neon-glow">
              <CodeXml className="h-6 w-6" />
            </div>
            
            <h2 className="text-2xl font-extrabold text-slate-100 mb-2 tracking-tight">
              GravityX AI Engineering Companion
            </h2>
            <p className="text-sm text-slate-450 leading-relaxed mb-8 max-w-md">
              Your autonomous software architecture pair programmer. Ask to refactor code, generate migrations, or write complex algorithms.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full text-left">
              {recentPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleQuickPromptClick(prompt)}
                  className="group flex items-start gap-2.5 rounded-xl bg-[#0b0d16] border border-slate-850 hover:border-violet-500/35 hover:bg-violet-950/5 p-4 text-xs text-slate-350 hover:text-slate-100 transition-all text-left shadow-sm cursor-pointer"
                >
                  <MessageSquare className="h-4 w-4 text-violet-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-200 group-hover:text-violet-400 transition-colors">
                      Try Template Prompt
                    </div>
                    <div className="text-[10px] text-slate-450 mt-1 leading-relaxed truncate-2-lines">
                      {prompt}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-600 group-hover:translate-x-0.5 transition-transform mt-0.5" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input composer wrapper */}
      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        onStop={stopGeneration}
      />
    </div>
  );
};

export default ChatArea;
