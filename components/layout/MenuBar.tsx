'use client';

import React, { useState, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { terminalService } from '../../services/terminalService';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { CodeXml, ShieldAlert, Cpu } from 'lucide-react';

import { pickNativeFolder } from '../../utils/nativePicker';

declare global {
  interface Window {
    electronAPI?: {
      openDirectory: () => Promise<string | null>;
      watchDirectory: (path: string | null) => void;
      onWorkspaceChanged: (callback: (data: any) => void) => () => void;
    };
  }
}

export const MenuBar: React.FC = () => {
  const { currentProject, closeWorkspace, openTab, addNode, openWorkspace } = useWorkspaceStore();
  const { toggleTerminal, toggleInspector, toggleSidebar, setActiveSidebarView, setLeftPanelCollapsed } = useLayoutStore();
  const { sendMessage } = useChatStore();
  const { model } = useSettingsStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Close menus on Esc or click outside (Radix handles these automatically, but we sync our pointer-enter tracking states)
  useEffect(() => {
    if (openMenu === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openMenu]);

  // Terminal utility write helper
  const runTerminalCmd = (cmd: string) => {
    toggleTerminal();
    setTimeout(() => {
      terminalService.handleInput(cmd + '\r');
    }, 200);
  };

  const handleOpenFolder = async () => {
    const path = await pickNativeFolder();
    if (path) {
      await openWorkspace(path);
    }
  };

  const handleNewFile = () => {
    const name = prompt("Enter new file name (e.g. index.html):");
    if (!name) return;
    addNode("/", name, false);
    openTab("/" + name);
  };

  const handleNewFolder = () => {
    const name = prompt("Enter new folder name (e.g. src):");
    if (!name) return;
    addNode("/", name, true);
  };

  const handleAIQuery = (query: string) => {
    toggleInspector();
    sendMessage(query, model);
  };

  const menus = [
    {
      label: 'File',
      actions: [
        { label: 'New File...', shortcut: 'Ctrl+N', onClick: handleNewFile },
        { label: 'New Folder...', onClick: handleNewFolder },
        { label: 'Open Folder...', shortcut: 'Ctrl+O', onClick: handleOpenFolder },
        { label: 'Save Active Buffer', shortcut: 'Ctrl+S', onClick: () => alert('Workspace file buffers saved.') },
        { label: 'Close Workspace', onClick: () => closeWorkspace() },
      ]
    },
    {
      label: 'Edit',
      actions: [
        { label: 'Undo Typing', shortcut: 'Ctrl+Z', onClick: () => runTerminalCmd('echo "Undo Action"') },
        { label: 'Redo Change', shortcut: 'Ctrl+Y', onClick: () => runTerminalCmd('echo "Redo Action"') },
        { label: 'Cut Selection', shortcut: 'Ctrl+X' },
        { label: 'Copy Selection', shortcut: 'Ctrl+C' },
        { label: 'Paste Clipboard', shortcut: 'Ctrl+V' },
      ]
    },
    {
      label: 'Selection',
      actions: [
        { label: 'Select All', shortcut: 'Ctrl+A' },
        { label: 'Expand Active Region', shortcut: 'Shift+Alt+Right' },
        { label: 'Shrink Active Region', shortcut: 'Shift+Alt+Left' },
      ]
    },
    {
      label: 'View',
      actions: [
        { label: 'Toggle Sidebar Panel', onClick: () => toggleSidebar() },
        { label: 'Toggle Terminal Output', onClick: () => toggleTerminal() },
        { label: 'Toggle AI Co-Pilot Panel', onClick: () => toggleInspector() },
        { label: 'Settings & Appearance...', onClick: () => { setActiveSidebarView('settings'); setLeftPanelCollapsed(false); } },
      ]
    },
    {
      label: 'Go',
      actions: [
        { label: 'Go to File...', shortcut: 'Ctrl+P' },
        { label: 'Go to Symbol...', shortcut: 'Ctrl+Shift+O' },
        { label: 'Go to Line...', shortcut: 'Ctrl+G' },
      ]
    },
    {
      label: 'Run',
      actions: [
        { label: 'Start Debugging Client', shortcut: 'F5', onClick: () => runTerminalCmd('npm run dev') },
        { label: 'Run Local Integration Tests', shortcut: 'Ctrl+F5', onClick: () => runTerminalCmd('npm run test') },
      ]
    },
    {
      label: 'Terminal',
      actions: [
        { label: 'New Integrated Console', shortcut: "Ctrl+`", onClick: () => runTerminalCmd('clear') },
        { label: 'Check Git Branch Status', onClick: () => runTerminalCmd('git status') },
      ]
    },
    {
      label: 'AI',
      actions: [
        { label: 'Request Workspace Code Audit', shortcut: 'Ctrl+I', onClick: () => handleAIQuery('Auditing active repository structures...') },
        { label: 'Run Automated Test Planner', onClick: () => handleAIQuery('Analyze current workspace configuration and generate testing scripts.') },
      ]
    },
    {
      label: 'Git',
      actions: [
        { label: 'Stage All Changes', onClick: () => runTerminalCmd('git add .') },
        { label: 'Commit Staged Repository...', onClick: () => {
          const msg = prompt("Enter commit message:");
          if (msg) runTerminalCmd(`git commit -m "${msg}"`);
        }},
        { label: 'Push commits to origin', onClick: () => runTerminalCmd('git push') },
      ]
    },
    {
      label: 'Help',
      actions: [
        { label: 'Keyboard Shortcuts Map', shortcut: 'Ctrl+K Ctrl+S', onClick: () => setIsShortcutsOpen(true) },
        { label: 'About GravityX IDE', onClick: () => setIsAboutOpen(true) },
      ]
    }
  ];

  return (
    <div className="flex h-8 items-center bg-[var(--bg-menubar,#05070d)] border-b border-[var(--border-color,#1e293b)] px-3 select-none text-[11px] text-[var(--fg-secondary,#cbd5e1)] z-50 relative gap-1 transition-colors duration-200">
      {/* Brand logo mini */}
      <div className="flex items-center gap-1.5 mr-3 font-semibold text-slate-200">
        <CodeXml className="h-4 w-4 text-violet-500 animate-pulse" />
        <span className="tracking-tight text-[10px] uppercase font-bold text-violet-400">GravityX</span>
      </div>

      {/* Dropdown Menu Bars */}
      <div className="flex items-center gap-0.5">
        {menus.map((menu) => (
          <DropdownMenu.Root
            key={menu.label}
            open={openMenu === menu.label}
            onOpenChange={(open) => {
              if (open) setOpenMenu(menu.label);
              else if (openMenu === menu.label) setOpenMenu(null);
            }}
          >
            <DropdownMenu.Trigger asChild>
              <button
                onPointerEnter={() => {
                  if (openMenu !== null) setOpenMenu(menu.label);
                }}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer focus:outline-none ${
                  openMenu === menu.label
                    ? 'bg-slate-800 text-slate-100 font-medium'
                    : 'hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                {menu.label}
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={4}
                className="w-52 rounded-md bg-[#0a0c16] border border-slate-850 p-1 shadow-2xl z-50 text-[11px] text-slate-350 focus:outline-none animate-in fade-in slide-in-from-top-1 duration-100"
              >
                {menu.actions.map((act, index) => (
                  <DropdownMenu.Item
                    key={index}
                    onClick={act.onClick}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-violet-650/15 hover:text-violet-300 rounded transition-colors cursor-pointer focus:bg-violet-650/15 focus:text-violet-300 focus:outline-none"
                  >
                    <span>{act.label}</span>
                    {act.shortcut && (
                      <span className="font-mono text-[9px] text-slate-500 font-medium uppercase tracking-wider">
                        {act.shortcut}
                      </span>
                    )}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ))}
      </div>

      {/* Active Project Path title center */}
      {currentProject && (
        <div className="mx-auto font-mono text-[10px] text-slate-500 max-w-sm truncate hidden md:block">
          {currentProject.name} — {currentProject.path}
        </div>
      )}

      {/* About gravityx dialogue */}
      <Dialog
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        title="About GravityX IDE"
      >
        <div className="space-y-4 text-xs leading-relaxed text-slate-300 select-none">
          <div className="flex items-center gap-3 p-3 bg-violet-600/10 border border-violet-500/20 rounded-lg">
            <Cpu className="h-6 w-6 text-violet-400 flex-shrink-0 animate-pulse" />
            <div>
              <h4 className="font-bold text-slate-200">GravityX Platform</h4>
              <p className="text-[10px] text-slate-400 font-mono">v1.4.0-release (sqlite-crawler)</p>
            </div>
          </div>
          <p>
            GravityX is a high-performance AI-assisted software development platform. It integrates SQLite indices, background crawler scans, and multi-tab Monaco code editors to support frictionless project execution.
          </p>
          <div className="border-t border-slate-850 pt-3 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setIsAboutOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Shortcuts Map Dialogue */}
      <Dialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        title="IDE Keyboard Bindings Map"
      >
        <div className="space-y-4 text-xs select-none">
          <div className="space-y-2">
            <div className="flex justify-between border-b border-slate-850 py-1.5 font-mono">
              <span className="text-slate-450">Open File Finder</span>
              <span className="bg-slate-900 border border-slate-800 text-[10px] px-1.5 rounded font-medium text-slate-200">Ctrl+P</span>
            </div>
            <div className="flex justify-between border-b border-slate-850 py-1.5 font-mono">
              <span className="text-slate-450">Launch Agent Audit</span>
              <span className="bg-slate-900 border border-slate-800 text-[10px] px-1.5 rounded font-medium text-slate-200">Ctrl+I</span>
            </div>
            <div className="flex justify-between border-b border-slate-850 py-1.5 font-mono">
              <span className="text-slate-450">Toggle Terminal Console</span>
              <span className="bg-slate-900 border border-slate-800 text-[10px] px-1.5 rounded font-medium text-slate-200">Ctrl+`</span>
            </div>
            <div className="flex justify-between border-b border-slate-850 py-1.5 font-mono">
              <span className="text-slate-450">Trigger Run Debugger</span>
              <span className="bg-slate-900 border border-slate-800 text-[10px] px-1.5 rounded font-medium text-slate-200">F5</span>
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setIsShortcutsOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default MenuBar;
