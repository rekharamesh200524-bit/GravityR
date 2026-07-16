import React, { useRef, useState, useEffect } from 'react';
import { 
  Send, Paperclip, X, StopCircle, CornerDownLeft, Sparkles, HelpCircle 
} from 'lucide-react';
import { useMemoryStore } from '../../stores/useMemoryStore';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';

interface ChatInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  onStop: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isStreaming, onStop }) => {
  const { contextFiles, removeContextFile, tokenEstimate } = useMemoryStore();
  const { model } = useSettingsStore();
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-grow input text box
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputText]);

  const handleSubmit = () => {
    if (!inputText.trim() || isStreaming) return;
    onSend(inputText.trim());
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Simulate attaching file to workspace memory/context
    const memoryStore = useMemoryStore.getState();
    for (let i = 0; i < files.length; i++) {
      memoryStore.addContextFile(`/${files[i].name}`);
    }
  };

  return (
    <div className="p-4 border-t border-slate-900 bg-[#070912] flex flex-col gap-2 select-none z-10">
      {/* Active context file tokens and status */}
      {contextFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[#090b14]/80 border border-slate-850 rounded-lg max-h-20 overflow-y-auto">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1.5">Context:</span>
          {contextFiles.map((file) => (
            <div 
              key={file} 
              className="flex items-center gap-1 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-mono px-2 py-0.5 rounded-md hover:border-red-500/30 transition-colors group/badge cursor-pointer"
              onClick={() => removeContextFile(file)}
            >
              <span>{file}</span>
              <X className="h-3 w-3 text-slate-500 group-hover/badge:text-red-400" />
            </div>
          ))}
          <span className="text-[9px] font-mono text-slate-500 ml-auto font-semibold uppercase">
            ~{tokenEstimate} tokens
          </span>
        </div>
      )}

      {/* Main Composer Box */}
      <div className="relative flex items-end rounded-xl border border-slate-800 bg-[#0c0e17] focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 px-3 py-2.5 transition-shadow">
        
        {/* Attach File Button */}
        <button
          onClick={handleAttachClick}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
          title="Attach files (adds to prompt context)"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          multiple 
        />

        {/* Text Input area */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask GravityX to edit code, generate refactorings, or describe algorithms..."
          className="flex-1 resize-none bg-transparent border-0 focus:outline-none focus:ring-0 text-slate-200 text-sm py-1.5 px-3 min-h-8 placeholder-slate-500 leading-relaxed font-sans"
        />

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              onClick={onStop}
              className="rounded-lg bg-red-650/15 border border-red-550/20 text-red-400 hover:bg-red-600 hover:text-white transition-all p-2 flex items-center justify-center gap-1.5 text-xs font-semibold"
            >
              <StopCircle className="h-4.5 w-4.5" />
              <span className="pr-1">Stop</span>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!inputText.trim()}
              className="rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:bg-slate-800/80 disabled:text-slate-500 disabled:border-slate-850 p-2 cursor-pointer shadow-lg shadow-violet-500/10 active:scale-95 transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Footer shortcut tips */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 font-sans">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-violet-400" />
          <span>Active: {model}</span>
        </span>
        <span className="flex items-center gap-1 font-mono">
          <span>Press Enter to send</span>
          <CornerDownLeft className="h-3 w-3 text-slate-600" />
        </span>
      </div>
    </div>
  );
};

export default ChatInput;
