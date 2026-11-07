'use client';

import React from 'react';
import { Palette, Type, Sliders, Check, Sparkles } from 'lucide-react';
import { useSettingsStore, EditorOptions } from '../../stores/useSettingsStore';
import { THEMES } from '../../utils/themeManager';

export const SettingsPanel: React.FC = () => {
  const { theme, setTheme, editorOptions, setEditorOption } = useSettingsStore();

  return (
    <div className="flex flex-col h-full bg-[var(--bg-sidebar,#060810)] text-[var(--fg-primary,#f8fafc)] select-none overflow-y-auto p-4 space-y-6 scrollbar-thin">
      {/* 1. Header */}
      <div className="border-b border-[var(--border-color,#1e293b)] pb-3">
        <h2 className="text-sm font-bold flex items-center gap-2 text-[var(--fg-primary,#f8fafc)] uppercase tracking-wider">
          <Sliders className="h-4 w-4 text-[var(--accent-color,#8b5cf6)]" />
          <span>IDE Configuration</span>
        </h2>
        <p className="text-[11px] text-[var(--fg-muted,#64748b)] mt-1">
          Customize themes, visual aesthetics, and Monaco Editor behavior instantly.
        </p>
      </div>

      {/* 2. Theme System - Appearance Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--fg-secondary,#cbd5e1)] uppercase tracking-wider">
          <Palette className="h-3.5 w-3.5 text-violet-400" />
          <span>Appearance & Themes</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {Object.values(THEMES).map((t) => {
            const isSelected = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[var(--accent-color,#8b5cf6)] bg-[var(--selection-bg,rgba(139,92,246,0.2))] shadow-sm'
                    : 'border-[var(--border-color,#1e293b)] bg-[var(--bg-card,#0f1322)] hover:border-[var(--fg-muted,#64748b)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {/* Swatch Previews */}
                  <div className="flex items-center gap-1 p-1 rounded bg-slate-950/40 border border-slate-800">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.colors.bgEditor }} title="Editor BG" />
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.colors.bgSidebar }} title="Sidebar BG" />
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.colors.accentColor }} title="Accent" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[var(--fg-primary,#f8fafc)] flex items-center gap-1.5">
                      <span>{t.name}</span>
                      <span className="text-[9px] uppercase px-1 rounded bg-slate-800/60 text-slate-400">{t.type}</span>
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <Check className="h-4 w-4 text-[var(--accent-color,#8b5cf6)] flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Editor Options Section */}
      <div className="space-y-4 border-t border-[var(--border-color,#1e293b)] pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--fg-secondary,#cbd5e1)] uppercase tracking-wider">
          <Type className="h-3.5 w-3.5 text-violet-400" />
          <span>Editor Configuration</span>
        </div>

        <div className="space-y-3 text-xs">
          {/* Font Family */}
          <div>
            <label className="block text-[10px] font-semibold text-[var(--fg-muted,#64748b)] uppercase tracking-wide mb-1">Font Family</label>
            <select
              value={editorOptions.fontFamily}
              onChange={(e) => setEditorOption('fontFamily', e.target.value)}
              className="w-full bg-[var(--bg-card,#0f1322)] border border-[var(--border-color,#1e293b)] text-[var(--fg-primary,#f8fafc)] text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-[var(--accent-color,#8b5cf6)]"
            >
              <option value="'Consolas', 'Fira Code', 'JetBrains Mono', monospace">Consolas / Default Monospace</option>
              <option value="'Fira Code', monospace">Fira Code</option>
              <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
              <option value="'Courier New', monospace">Courier New</option>
            </select>
          </div>

          {/* Font Size & Line Height */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--fg-muted,#64748b)] uppercase tracking-wide mb-1">Font Size (px)</label>
              <input
                type="number"
                min={10}
                max={32}
                value={editorOptions.fontSize}
                onChange={(e) => setEditorOption('fontSize', parseInt(e.target.value) || 14)}
                className="w-full bg-[var(--bg-card,#0f1322)] border border-[var(--border-color,#1e293b)] text-[var(--fg-primary,#f8fafc)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent-color,#8b5cf6)]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--fg-muted,#64748b)] uppercase tracking-wide mb-1">Line Height (px)</label>
              <input
                type="number"
                min={14}
                max={48}
                value={editorOptions.lineHeight}
                onChange={(e) => setEditorOption('lineHeight', parseInt(e.target.value) || 20)}
                className="w-full bg-[var(--bg-card,#0f1322)] border border-[var(--border-color,#1e293b)] text-[var(--fg-primary,#f8fafc)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent-color,#8b5cf6)]"
              />
            </div>
          </div>

          {/* Tab Size & Word Wrap */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--fg-muted,#64748b)] uppercase tracking-wide mb-1">Tab Size</label>
              <select
                value={editorOptions.tabSize}
                onChange={(e) => setEditorOption('tabSize', parseInt(e.target.value) || 2)}
                className="w-full bg-[var(--bg-card,#0f1322)] border border-[var(--border-color,#1e293b)] text-[var(--fg-primary,#f8fafc)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent-color,#8b5cf6)]"
              >
                <option value={2}>2 Spaces</option>
                <option value={4}>4 Spaces</option>
                <option value={8}>8 Spaces</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--fg-muted,#64748b)] uppercase tracking-wide mb-1">Word Wrap</label>
              <select
                value={editorOptions.wordWrap}
                onChange={(e) => setEditorOption('wordWrap', e.target.value as any)}
                className="w-full bg-[var(--bg-card,#0f1322)] border border-[var(--border-color,#1e293b)] text-[var(--fg-primary,#f8fafc)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent-color,#8b5cf6)]"
              >
                <option value="off">Off</option>
                <option value="on">On</option>
                <option value="wordWrapColumn">Column</option>
                <option value="bounded">Bounded</option>
              </select>
            </div>
          </div>

          {/* Cursor Style & Line Numbers */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--fg-muted,#64748b)] uppercase tracking-wide mb-1">Cursor Style</label>
              <select
                value={editorOptions.cursorStyle}
                onChange={(e) => setEditorOption('cursorStyle', e.target.value as any)}
                className="w-full bg-[var(--bg-card,#0f1322)] border border-[var(--border-color,#1e293b)] text-[var(--fg-primary,#f8fafc)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent-color,#8b5cf6)]"
              >
                <option value="line">Line</option>
                <option value="block">Block</option>
                <option value="underline">Underline</option>
                <option value="line-thin">Line Thin</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--fg-muted,#64748b)] uppercase tracking-wide mb-1">Line Numbers</label>
              <select
                value={editorOptions.lineNumbers}
                onChange={(e) => setEditorOption('lineNumbers', e.target.value as any)}
                className="w-full bg-[var(--bg-card,#0f1322)] border border-[var(--border-color,#1e293b)] text-[var(--fg-primary,#f8fafc)] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent-color,#8b5cf6)]"
              >
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="relative">Relative</option>
              </select>
            </div>
          </div>

          {/* Render Whitespace */}
          <div>
            <label className="block text-[10px] font-semibold text-[var(--fg-muted,#64748b)] uppercase tracking-wide mb-1">Render Whitespace</label>
            <select
              value={editorOptions.renderWhitespace}
              onChange={(e) => setEditorOption('renderWhitespace', e.target.value as any)}
              className="w-full bg-[var(--bg-card,#0f1322)] border border-[var(--border-color,#1e293b)] text-[var(--fg-primary,#f8fafc)] text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-[var(--accent-color,#8b5cf6)]"
            >
              <option value="none">None</option>
              <option value="boundary">Boundary</option>
              <option value="selection">Selection</option>
              <option value="trailing">Trailing</option>
              <option value="all">All</option>
            </select>
          </div>

          {/* Toggles: Minimap & Bracket Pair Colorization */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-color,#1e293b)]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editorOptions.minimap}
                onChange={(e) => setEditorOption('minimap', e.target.checked)}
                className="accent-[var(--accent-color,#8b5cf6)] rounded"
              />
              <span className="text-xs text-[var(--fg-secondary,#cbd5e1)]">Show Minimap Bar</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editorOptions.bracketPairColorization}
                onChange={(e) => setEditorOption('bracketPairColorization', e.target.checked)}
                className="accent-[var(--accent-color,#8b5cf6)] rounded"
              />
              <span className="text-xs text-[var(--fg-secondary,#cbd5e1)]">Bracket Pair Colorization</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
