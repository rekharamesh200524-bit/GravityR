import React, { useState } from 'react';
import { Copy, Check, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([value], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `code-snippet.${language || 'txt'}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-slate-800 bg-[#0b0d16] font-sans shadow-md">
      {/* Code Header bar */}
      <div className="flex items-center justify-between bg-[#060810] px-4 py-2 border-b border-slate-900/60 select-none">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-400 font-mono">
          {language || 'text'}
        </span>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-450" />
                <span className="text-emerald-450 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            title="Download snippet"
          >
            <Download className="h-3 w-3" />
            <span>Download</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Code Content */}
      {isExpanded && (
        <pre className="overflow-x-auto p-4 text-xs font-mono leading-relaxed text-slate-300 max-h-96">
          <code className={`language-${language || 'text'}`}>{value}</code>
        </pre>
      )}
    </div>
  );
};

export default CodeBlock;
