import React from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Copy, RotateCcw, Edit, User, Check, Play, AlertCircle, FileDiff
} from 'lucide-react';
import { ChatMessage as ChatMessageType, PlannerStep } from '../../types';
import { CodeBlock } from '../../components/CodeBlock';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useProjectStore } from '../../stores/useProjectStore';

interface ChatMessageProps {
  message: ChatMessageType;
  onEdit?: (content: string) => void;
  onRetry?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onEdit, onRetry }) => {
  const { setDiffPanelVisible, setActiveTab } = useLayoutStore();
  const { setActiveFile } = useProjectStore();
  
  const isUser = message.role === 'user';

  const handleCopyText = () => {
    navigator.clipboard.writeText(message.content);
  };

  const handleOpenDiff = (filePath: string) => {
    setActiveFile(filePath);
    setDiffPanelVisible(true);
    setActiveTab('diff');
  };

  // Markdown custom renderer components
  const renderers = {
    code: ({ className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');
      const isInline = !className;

      if (isInline) {
        return (
          <code className="bg-slate-900 px-1.5 py-0.5 rounded font-mono text-xs text-violet-400 border border-slate-800/40" {...props}>
            {children}
          </code>
        );
      }

      return <CodeBlock language={match ? match[1] : ''} value={codeString} />;
    },
    table: ({ children }: any) => (
      <div className="my-4 overflow-x-auto rounded-lg border border-slate-800 bg-[#080910]">
        <table className="min-w-full divide-y divide-slate-800 text-xs font-sans text-left">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => <thead className="bg-slate-900/60 font-semibold text-slate-200">{children}</thead>,
    tbody: ({ children }: any) => <tbody className="divide-y divide-slate-850 text-slate-350">{children}</tbody>,
    tr: ({ children }: any) => <tr className="hover:bg-slate-900/20 transition-colors">{children}</tr>,
    th: ({ children }: any) => <th className="px-4 py-2">{children}</th>,
    td: ({ children }: any) => <td className="px-4 py-2">{children}</td>,
    ul: ({ children }: any) => <ul className="list-disc pl-5 my-2 space-y-1 text-slate-300 text-sm">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-5 my-2 space-y-1 text-slate-300 text-sm">{children}</ol>,
    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
    p: ({ children }: any) => <p className="leading-relaxed text-slate-300 text-sm mb-3 last:mb-0">{children}</p>,
    h1: ({ children }: any) => <h1 className="text-xl font-bold text-slate-100 mt-4 mb-2">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-semibold text-slate-100 mt-4 mb-2">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-base font-medium text-slate-150 mt-3 mb-1.5">{children}</h3>,
  };

  const getStepIcon = (status: PlannerStep['status']) => {
    switch (status) {
      case 'completed':
        return <Check className="h-3.5 w-3.5 text-emerald-450" />;
      case 'running':
        return (
          <span className="relative flex h-3.5 w-3.5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
          </span>
        );
      case 'failed':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Play className="h-3 w-3 text-slate-500" />;
    }
  };

  return (
    <div className={`group flex gap-4 p-4 border-b border-slate-900/40 transition-colors ${isUser ? 'bg-slate-900/10' : 'bg-slate-950/40'}`}>
      {/* Avatar Container */}
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-medium text-sm">
            <User className="h-4.5 w-4.5 text-slate-400" />
          </div>
        ) : (
          <div className="h-8 w-8 rounded-lg bg-violet-950/70 border border-violet-900 flex items-center justify-center text-violet-400 font-semibold text-xs relative neon-glow">
            GX
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className="flex-1 overflow-hidden">
        {/* User name / Timestamp Header */}
        <div className="flex items-center gap-2 mb-1.5 select-none">
          <span className="text-xs font-semibold text-slate-200">
            {isUser ? 'You' : 'GravityX Assistant'}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* AI Action Execution Steps */}
        {!isUser && message.steps && message.steps.length > 0 && (
          <div className="mb-4 rounded-lg bg-slate-900/30 border border-slate-850/80 p-3 max-w-lg select-none">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 font-sans">Execution Sequence</div>
            <div className="space-y-2">
              {message.steps.map((step) => (
                <div key={step.id} className="flex items-start gap-2 text-xs">
                  <div className="mt-0.5 flex-shrink-0">{getStepIcon(step.status)}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-250 leading-none">{step.title}</div>
                    <div className="text-[10px] text-slate-450 mt-0.5 leading-relaxed">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Body */}
        <div className="prose prose-invert max-w-none text-slate-300 font-sans antialiased break-words">
          {message.content ? (
            <ReactMarkdown components={renderers}>{message.content}</ReactMarkdown>
          ) : (
            <div className="h-4 w-2 rounded bg-violet-400 animate-pulse mt-1" /> // Cursor typing indicator
          )}
        </div>

        {/* Diff Action Attachments */}
        {!isUser && message.diffs && message.diffs.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider select-none">Generated Modifications</div>
            {message.diffs.map((diff, index) => (
              <button
                key={index}
                onClick={() => handleOpenDiff(diff.filePath)}
                className="flex items-center gap-2 rounded-lg bg-[#0b0e17] border border-violet-500/20 hover:border-violet-500/40 p-2.5 w-full max-w-md text-left transition-all hover:bg-violet-950/5 group/diff shadow-md"
              >
                <FileDiff className="h-4.5 w-4.5 text-violet-400 group-hover/diff:scale-110 transition-transform" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-200 font-mono truncate">{diff.filePath}</div>
                  <div className="text-[10px] text-slate-450 mt-0.5">Click to view pull-request style changes</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message Hover Actions */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-start items-center gap-1.5 select-none">
        <button
          onClick={handleCopyText}
          className="rounded p-1 text-slate-450 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title="Copy contents"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>

        {isUser && onEdit && (
          <button
            onClick={() => onEdit(message.content)}
            className="rounded p-1 text-slate-450 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            title="Edit input"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
        )}

        {!isUser && onRetry && (
          <button
            onClick={onRetry}
            className="rounded p-1 text-slate-450 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            title="Regenerate reply"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
