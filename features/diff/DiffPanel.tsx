'use client';

import React, { useState, useEffect, useRef } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { 
  FileText, Check, Undo2, Split, Columns, FileSignature, BookOpenText, CodeXml
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { EditorTabs } from '../editor/EditorTabs';

export const DiffPanel: React.FC = () => {
  const { activeFilePath, activeFileContent, activeFileOriginalContent, saveFile } = useProjectStore();
  const { openTabs, activeTab, selectedFilePath, selectedFileContent, updateFileContent } = useWorkspaceStore();
  const { setDiffPanelVisible, setActiveTab } = useLayoutStore();
  
  const [renderSideBySide, setRenderSideBySide] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  // ResizeObserver to force Monaco to layout immediately when parent width/height changes
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver(() => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Check if we are viewing a file with pending diff changes
  const targetPath = activeTab;
  const isDiffMode = activeTab === activeFilePath && activeFileContent !== activeFileOriginalContent;

  if (openTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#1e1e1e] text-slate-500 select-none space-y-6 font-sans w-full">
        <div className="flex flex-col items-center gap-2">
          <CodeXml className="h-12 w-12 text-violet-500/40 animate-pulse" />
          <h2 className="text-sm font-semibold text-slate-350 tracking-wide uppercase">GravityX Workbench</h2>
        </div>
        
        <div className="space-y-3 w-64 text-[11px] font-sans">
          <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 gap-6">
            <span className="text-slate-450">Show File Finder</span>
            <kbd className="bg-slate-900 border border-slate-800 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium text-slate-300">Ctrl+P</kbd>
          </div>
          <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 gap-6">
            <span className="text-slate-450">Launch AI Agent Planner</span>
            <kbd className="bg-slate-900 border border-slate-800 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium text-slate-300">Ctrl+I</kbd>
          </div>
          <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 gap-6">
            <span className="text-slate-450">Toggle Terminal Console</span>
            <kbd className="bg-slate-900 border border-slate-800 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium text-slate-300">Ctrl+`</kbd>
          </div>
        </div>
      </div>
    );
  }

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'js' || ext === 'jsx') return 'javascript';
    if (ext === 'ts' || ext === 'tsx') return 'typescript';
    if (ext === 'json') return 'json';
    if (ext === 'css') return 'css';
    if (ext === 'md') return 'markdown';
    if (ext === 'py') return 'python';
    if (ext === 'php') return 'php';
    if (ext === 'cs') return 'csharp';
    if (ext === 'java') return 'java';
    return 'plaintext';
  };

  const handleApplyDiff = () => {
    saveFile();
  };

  const handleDiscardDiff = () => {
    const projectStore = useProjectStore.getState();
    projectStore.updateFileContent(activeFileOriginalContent);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] w-full overflow-hidden min-w-0">
      {/* Editor Tabs bar */}
      <EditorTabs />

      {/* Panel Header */}
      <div className="flex h-10 items-center justify-between px-4 border-b border-slate-900 bg-[#181818] select-none text-[11px] text-slate-400 flex-shrink-0">
        <div className="flex items-center gap-2">
          {isDiffMode ? (
            <FileSignature className="h-3.5 w-3.5 text-violet-400" />
          ) : (
            <BookOpenText className="h-3.5 w-3.5 text-violet-400" />
          )}
          <span className="text-[11px] font-semibold text-slate-300 font-mono">{targetPath}</span>
          
          {isDiffMode ? (
            <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-sans font-semibold uppercase tracking-wider">
              reviewing changes
            </span>
          ) : (
            <span className="text-[9px] bg-violet-500/10 border border-violet-500/20 text-violet-455 px-1.5 py-0.5 rounded font-sans font-semibold uppercase tracking-wider">
              editable
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDiffMode && (
            <>
              <button
                onClick={() => setRenderSideBySide(!renderSideBySide)}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 transition-colors cursor-pointer"
                title={renderSideBySide ? "Unified View" : "Split View"}
              >
                {renderSideBySide ? (
                  <>
                    <Split className="h-3 w-3 text-violet-400" />
                    <span>Unified</span>
                  </>
                ) : (
                  <>
                    <Columns className="h-3 w-3 text-violet-400" />
                    <span>Split</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDiscardDiff}
                className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 bg-red-955/15 border border-red-500/25 rounded px-2 py-0.5 transition-colors cursor-pointer"
              >
                <Undo2 className="h-3 w-3" />
                <span>Discard</span>
              </button>

              <button
                onClick={handleApplyDiff}
                className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-955/15 border border-emerald-500/25 rounded px-2 py-0.5 transition-colors cursor-pointer"
              >
                <Check className="h-3 w-3" />
                <span>Accept</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editor Body with absolute fill and ResizeObserver Ref */}
      <div className="flex-grow w-full bg-[#1e1e1e] min-h-0 relative overflow-hidden" ref={containerRef}>
        {isDiffMode ? (
          <DiffEditor
            height="100%"
            language={getLanguage(targetPath || '')}
            theme="vs-dark"
            original={activeFileOriginalContent}
            modified={activeFileContent}
            options={{
              renderSideBySide,
              readOnly: false,
              minimap: { enabled: true },
              fontSize: 12,
              fontFamily: "var(--font-geist-mono), monospace",
              lineNumbers: "on",
              automaticLayout: true,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6
              }
            }}
            onMount={(editor) => {
              editorRef.current = editor;
              const modifiedEditor = editor.getModifiedEditor();
              modifiedEditor.onDidChangeModelContent(() => {
                const value = modifiedEditor.getValue();
                const projectStore = useProjectStore.getState();
                projectStore.updateFileContent(value);
              });
            }}
          />
        ) : (
          <Editor
            height="100%"
            language={getLanguage(targetPath || '')}
            theme="vs-dark"
            value={selectedFileContent || ""}
            onChange={(val) => {
              if (selectedFilePath && val !== undefined) {
                updateFileContent(selectedFilePath, val);
              }
            }}
            options={{
              readOnly: false,
              minimap: { enabled: true },
              fontSize: 12,
              fontFamily: "var(--font-geist-mono), monospace",
              lineNumbers: "on",
              automaticLayout: true,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6
              }
            }}
            onMount={(editor) => {
              editorRef.current = editor;
              editor.onDidChangeCursorPosition((e) => {
                const store = useWorkspaceStore.getState();
                store.setCursorPos(e.position.lineNumber, e.position.column);
              });
            }}
          />
        )}
      </div>
    </div>
  );
};

export default DiffPanel;
