'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { 
  FileText, Check, Undo2, Split, Columns, FileSignature, BookOpenText, CodeXml,
  GitBranch, Plus, Minus, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, ChevronUp, ChevronDown,
  X, EyeOff, Space, History, User, Clock, FileCode, FolderOpen, GitCommit,
  UploadCloud, Loader2, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useGitStore } from '../../stores/useGitStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { THEMES } from '../../utils/themeManager';
import { EditorTabs } from '../editor/EditorTabs';

export const DiffPanel: React.FC = () => {
  const { openTabs, activeTab, selectedFilePath, selectedFileContent, updateFileContent, saveFile, isSaving } = useWorkspaceStore();
  const { theme, editorOptions } = useSettingsStore();
  const activeThemeDef = THEMES[theme] || THEMES['dark'];
  const monacoThemeName = activeThemeDef.monacoBase;
  

  const {
    branch,
    commitHash,
    author,
    activeDiff,
    isDiffActive,
    renderSideBySide,
    ignoreWhitespace,
    fileHistory,
    isHistoryPanelOpen,
    isPushing,
    stagedFiles,
    toggleRenderSideBySide,
    toggleIgnoreWhitespace,
    toggleHistoryPanel,
    stageFile,
    unstageFile,
    stageAll,
    closeDiff,
    commitStaged,
    commitStagedAndPush,
    openDiffAtRef,
  } = useGitStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const navigatorRef = useRef<any>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [inlineCommitMsg, setInlineCommitMsg] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCommitAndPushing, setIsCommitAndPushing] = useState(false);

  const handleSave = useCallback(async () => {
    if (!selectedFilePath || isSaving || isDiffActive) return;
    await saveFile(selectedFilePath);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }, [selectedFilePath, isSaving, isDiffActive, saveFile]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (editorRef.current) editorRef.current.layout();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
        return;
      }
      if (e.key === 'F7') {
        e.preventDefault();
        if (e.shiftKey) navigatorRef.current?.previous?.();
        else navigatorRef.current?.next?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleSave]);

  const handleNextChange = () => navigatorRef.current?.next?.();
  const handlePrevChange = () => navigatorRef.current?.previous?.();
  const handleFirstChange = () => { for (let i = 0; i < 100; i++) navigatorRef.current?.previous?.(); navigatorRef.current?.next?.(); };
  const handleLastChange  = () => { for (let i = 0; i < 100; i++) navigatorRef.current?.next?.(); navigatorRef.current?.previous?.(); };

  const handleInlineCommit = async () => {
    if (!inlineCommitMsg.trim() || isCommitting) return;
    setIsCommitting(true);
    const ok = await commitStaged(inlineCommitMsg);
    if (ok) setInlineCommitMsg('');
    setIsCommitting(false);
  };

  const handleInlineCommitAndPush = async () => {
    if (!inlineCommitMsg.trim() || isCommitAndPushing) return;
    setIsCommitAndPushing(true);
    const ok = await commitStagedAndPush(inlineCommitMsg);
    if (ok) setInlineCommitMsg('');
    setIsCommitAndPushing(false);
  };

  const handleOpenFile = async () => {
    if (!activeDiff) return;
    const ws = useWorkspaceStore.getState();
    await ws.openTab(activeDiff.path);
    closeDiff();
  };

  const handleRevealInExplorer = () => {
    if (!activeDiff) return;
    const ws = useWorkspaceStore.getState();
    ws.revealInExplorer(activeDiff.path);
  };

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
      json: 'json', css: 'css', html: 'html', md: 'markdown',
      py: 'python', php: 'php', cs: 'csharp', java: 'java',
      rs: 'rust', go: 'go', sh: 'shell', bash: 'shell',
    };
    return ext ? (map[ext] || 'plaintext') : 'plaintext';
  };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { cls: string; label: string }> = {
      M: { cls: 'bg-amber-500/10 border-amber-500/30 text-amber-400', label: 'Modified' },
      A: { cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', label: 'Added' },
      D: { cls: 'bg-rose-500/10 border-rose-500/30 text-rose-400', label: 'Deleted' },
      R: { cls: 'bg-sky-500/10 border-sky-500/30 text-sky-400', label: 'Renamed' },
    };
    const s = cfg[status?.toUpperCase()] ?? { cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', label: 'Untracked' };
    return <span className={`text-[9px] border rounded px-1.5 py-0.5 font-mono font-semibold uppercase ${s.cls}`}>{s.label}</span>;
  };

  if (openTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#1e1e1e] text-slate-500 select-none space-y-6 font-sans w-full">
        <div className="flex flex-col items-center gap-2">
          <CodeXml className="h-12 w-12 text-violet-500/40 animate-pulse" />
          <h2 className="text-sm font-semibold text-slate-400 tracking-wide uppercase">GravityX Workbench</h2>
        </div>
        <div className="space-y-3 w-64 text-[11px] font-sans">
          {[['Show File Finder','Ctrl+P'],['Launch AI Agent Planner','Ctrl+I'],['Toggle Terminal Console','Ctrl+`']].map(([label, key]) => (
            <div key={key} className="flex items-center justify-between border-b border-slate-900 pb-1.5 gap-6">
              <span className="text-slate-450">{label}</span>
              <kbd className="bg-slate-900 border border-slate-800 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium text-slate-300">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const targetPath = activeDiff ? activeDiff.path : activeTab;
  const isViewingDiff = isDiffActive && activeDiff && activeDiff.path === activeTab;
  const stagedCount = stagedFiles.length;

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] w-full overflow-hidden min-w-0 font-sans">
      <EditorTabs />

      {/* -- Diff Header ---------------------------------------------------- */}
      <div className="flex h-10 items-center justify-between px-3 border-b border-slate-900 bg-[#181818] select-none text-[11px] text-slate-400 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isViewingDiff
            ? <FileSignature className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
            : <BookOpenText   className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />}

          <span className="text-[11px] font-semibold text-slate-200 font-mono truncate">{targetPath}</span>

          {isViewingDiff && activeDiff && getStatusBadge(activeDiff.status)}

          {isViewingDiff && (
            <div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l border-slate-800 text-[10px]">
              <span className="flex items-center gap-1 font-mono text-violet-300">
                <GitBranch className="h-3 w-3" />{branch}
              </span>
              {commitHash && (
                <span className="font-mono text-slate-400 bg-slate-900 border border-slate-800 px-1 rounded">
                  {commitHash.substring(0, 7)}
                </span>
              )}
              {author && <span className="flex items-center gap-1"><User className="h-3 w-3" />{author}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isViewingDiff ? (
            <>
              {/* Navigation */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 gap-0.5">
                {[['First Change', handleFirstChange, ChevronsUp],
                  ['Prev Change (Shift+F7)', handlePrevChange, ChevronUp],
                  ['Next Change (F7)', handleNextChange, ChevronDown],
                  ['Last Change', handleLastChange, ChevronsDown]].map(([title, fn, Icon]: any) => (
                  <button key={title} onClick={fn} title={title}
                    className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors cursor-pointer">
                    <Icon className="h-3 w-3" />
                  </button>
                ))}
              </div>

              {/* View mode */}
              <button onClick={toggleRenderSideBySide}
                className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded px-2 py-1 transition-colors cursor-pointer"
                title={renderSideBySide ? 'Switch to Inline' : 'Switch to Side-by-Side'}>
                {renderSideBySide
                  ? <><Columns className="h-3 w-3 text-violet-400" /><span className="hidden sm:inline">Side-by-Side</span></>
                  : <><Split   className="h-3 w-3 text-violet-400" /><span className="hidden sm:inline">Inline</span></>}
              </button>

              {/* Whitespace */}
              <button onClick={toggleIgnoreWhitespace}
                className={`flex items-center gap-1 text-[10px] rounded px-2 py-1 border transition-colors cursor-pointer ${ignoreWhitespace ? 'bg-violet-955/30 border-violet-500/50 text-violet-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-100'}`}
                title="Toggle Ignore Whitespace">
                <Space className="h-3 w-3" /><span className="hidden lg:inline">Whitespace</span>
              </button>

              <div className="h-4 w-px bg-slate-800 mx-0.5" />

              {/* Stage / Unstage */}
              {activeDiff?.staged ? (
                <button onClick={() => unstageFile(activeDiff.path)}
                  className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-950/20 border border-amber-500/30 rounded px-2 py-1 transition-colors cursor-pointer"
                  title="Unstage">
                  <Minus className="h-3 w-3" /><span>Unstage</span>
                </button>
              ) : (
                <button onClick={() => activeDiff && stageFile(activeDiff.path)}
                  className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-950/20 border border-emerald-500/30 rounded px-2 py-1 transition-colors cursor-pointer"
                  title="Stage">
                  <Plus className="h-3 w-3" /><span>Stage</span>
                </button>
              )}

              <button onClick={stageAll}
                className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded px-2 py-1 transition-colors cursor-pointer">
                <span>Stage All</span>
              </button>

              <div className="h-4 w-px bg-slate-800 mx-0.5" />

              {/* Open File */}
              <button onClick={handleOpenFile} title="Open File in Editor"
                className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors cursor-pointer">
                <FileCode className="h-3.5 w-3.5" />
              </button>

              {/* Reveal in Explorer */}
              <button onClick={handleRevealInExplorer} title="Reveal in Explorer"
                className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors cursor-pointer">
                <FolderOpen className="h-3.5 w-3.5" />
              </button>

              {/* History */}
              <button onClick={toggleHistoryPanel} title="Toggle Commit History"
                className={`p-1 rounded transition-colors cursor-pointer ${isHistoryPanelOpen ? 'text-violet-300 bg-violet-900/40' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}`}>
                <History className="h-3.5 w-3.5" />
              </button>

              {/* Close */}
              <button onClick={closeDiff} title="Close Diff"
                className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-mono">
              {isSaving ? (
                <span className="text-violet-400 animate-pulse">Saving...</span>
              ) : savedFlash ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1"><Check className="h-3 w-3" />Saved</span>
              ) : (
                <span className="text-slate-500 uppercase">Editable</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* -- Inline Commit Strip ------------------------------------------ */}
      {isViewingDiff && activeDiff && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-900 bg-[#13151f] flex-shrink-0">
          {activeDiff.staged ? (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-semibold flex-shrink-0">
              <CheckCircle2 className="h-3 w-3" />Staged
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono flex-shrink-0">
              <AlertCircle className="h-3 w-3" />Not staged
            </span>
          )}

          <div className="h-3 w-px bg-slate-800 flex-shrink-0" />

          <input
            type="text"
            value={inlineCommitMsg}
            onChange={(e) => setInlineCommitMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && activeDiff.staged) {
                e.preventDefault();
                handleInlineCommit();
              }
            }}
            placeholder={activeDiff.staged ? 'Commit message (Enter to commit)...' : 'Stage this file first to commit'}
            disabled={!activeDiff.staged}
            className="flex-1 min-w-0 bg-transparent text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none font-sans disabled:opacity-40"
          />

          <button
            onClick={handleInlineCommit}
            disabled={isCommitting || isCommitAndPushing || !inlineCommitMsg.trim() || !activeDiff.staged || stagedCount === 0}
            className="flex items-center gap-1 text-[10px] font-semibold text-white bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed rounded px-2.5 py-1 transition-colors cursor-pointer flex-shrink-0"
            title={`Commit ${stagedCount} staged file(s)`}
          >
            {isCommitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCommit className="h-3 w-3" />}
            <span>{isCommitting ? 'Committing...' : `Commit (${stagedCount})`}</span>
          </button>

          <button
            onClick={handleInlineCommitAndPush}
            disabled={isCommitting || isCommitAndPushing || !inlineCommitMsg.trim() || !activeDiff.staged || stagedCount === 0}
            className="flex items-center gap-1 text-[10px] font-semibold text-violet-200 bg-slate-900 hover:bg-slate-800 border border-violet-700/50 hover:border-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded px-2.5 py-1 transition-colors cursor-pointer flex-shrink-0"
            title="Commit and push to origin"
          >
            {isCommitAndPushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
            <span>{isCommitAndPushing ? 'Pushing...' : 'Commit & Push'}</span>
          </button>
        </div>
      )}

      {/* -- Main Area --------------------------------------------------- */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Monaco */}
        <div className="flex-grow min-w-0 bg-[#1e1e1e] relative overflow-hidden" ref={containerRef}>
          {isViewingDiff && activeDiff ? (
            <DiffEditor
              height="100%"
              language={getLanguage(targetPath || '')}
              theme={monacoThemeName}
              original={activeDiff.headContent}
              modified={activeDiff.workingContent}
              options={{
                renderSideBySide,
                ignoreTrimWhitespace: ignoreWhitespace,
                readOnly: true,
                minimap: { enabled: editorOptions.minimap },
                fontSize: editorOptions.fontSize,
                fontFamily: editorOptions.fontFamily,
                lineHeight: editorOptions.lineHeight,
                wordWrap: editorOptions.wordWrap,
                cursorStyle: editorOptions.cursorStyle as any,
                lineNumbers: editorOptions.lineNumbers as any,
                renderWhitespace: editorOptions.renderWhitespace as any,
                bracketPairColorization: { enabled: editorOptions.bracketPairColorization },
                automaticLayout: true,
                renderOverviewRuler: true,
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              } as any}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                try {
                  const nav = monaco.editor.createDiffNavigator(editor, {
                    followsCaret: true,
                    ignoreCharChanges: false,
                  });
                  navigatorRef.current = nav;
                  editor.addCommand(monaco.KeyCode.F7, () => nav.next());
                } catch (e) {
                  console.error('Monaco diff navigator error:', e);
                }
              }}
            />
          ) : (
            <Editor
              height="100%"
              language={getLanguage(targetPath || '')}
              theme={monacoThemeName}
              value={selectedFileContent || ''}
              onChange={(val) => {
                if (selectedFilePath && val !== undefined)
                  updateFileContent(selectedFilePath, val);
              }}
              options={{
                readOnly: false,
                minimap: { enabled: editorOptions.minimap },
                fontSize: editorOptions.fontSize,
                fontFamily: editorOptions.fontFamily,
                lineHeight: editorOptions.lineHeight,
                tabSize: editorOptions.tabSize,
                wordWrap: editorOptions.wordWrap,
                cursorStyle: editorOptions.cursorStyle as any,
                lineNumbers: editorOptions.lineNumbers as any,
                renderWhitespace: editorOptions.renderWhitespace as any,
                bracketPairColorization: { enabled: editorOptions.bracketPairColorization },
                automaticLayout: true,
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              }}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                editor.onDidChangeCursorPosition((e) => {
                  useWorkspaceStore.getState().setCursorPos(e.position.lineNumber, e.position.column);
                });
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handleSave());
              }}
            />
          )}
        </div>

        {/* -- History Drawer --------------------------------------------- */}
        {isViewingDiff && isHistoryPanelOpen && (
          <div className="w-72 flex-shrink-0 border-l border-slate-900 bg-[#0d0f1a] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-900 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-[11px] font-semibold text-slate-200">File History</span>
              </div>
              <button onClick={toggleHistoryPanel} className="p-0.5 text-slate-500 hover:text-slate-200 rounded cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-3 py-1.5 border-b border-slate-900/60 flex-shrink-0">
              <span className="text-[10px] font-mono text-slate-500 truncate block">{activeDiff?.path}</span>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {fileHistory.length === 0 ? (
                <p className="text-[10px] text-slate-600 italic px-3 py-4 text-center">No commit history found.</p>
              ) : (
                fileHistory.map((item, idx) => (
                  <button
                    key={`${item.commit}-${idx}`}
                    onClick={() => activeDiff && openDiffAtRef(activeDiff.path, item.commit)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-900/60 border-b border-slate-900/40 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-mono text-violet-400 group-hover:text-violet-300 font-semibold">{item.commit}</span>
                      <span className="text-[9px] text-slate-500 flex-shrink-0 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />{item.date}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-300 truncate">{item.message}</p>
                    <p className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <User className="h-2.5 w-2.5" />{item.author}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="px-3 py-2 border-t border-slate-900 flex-shrink-0">
              <button
                onClick={() => activeDiff && openDiffAtRef(activeDiff.path, 'HEAD')}
                className="w-full text-[10px] text-slate-300 hover:text-slate-100 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded py-1 transition-colors cursor-pointer"
              >
                Compare with HEAD
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiffPanel;
