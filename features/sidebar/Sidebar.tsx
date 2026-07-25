import React, { useState, useEffect } from 'react';
import { 
  Menu, ChevronLeft, ChevronRight, Plus, FolderKanban, 
  MessageSquareCode, Bookmark, Database, Settings, LogOut, CodeXml
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useChatStore } from '../../stores/useChatStore';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

import { pickNativeFolder } from '../../utils/nativePicker';

export const Sidebar: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar } = useLayoutStore();
  const { recentProjects, currentProject, openWorkspace, fetchRecents } = useWorkspaceStore();
  const { sessions, activeSessionId, setActiveSession, createNewSession } = useChatStore();

  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [folderPath, setFolderPath] = useState('');

  useEffect(() => {
    fetchRecents();
  }, [fetchRecents]);

  const handleOpenWorkspace = async () => {
    const path = await pickNativeFolder();
    if (path) {
      await openWorkspace(path);
    }
  };

  const handleManualOpenWorkspace = async () => {
    if (!folderPath.trim()) return;
    await openWorkspace(folderPath.trim());
    setIsNewProjectOpen(false);
    setFolderPath('');
  };

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 60 : 256 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="flex flex-col h-full bg-[#060810]/95 border-r border-slate-900 overflow-hidden select-none"
    >
      {/* Sidebar Header */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-slate-900/60">
        {!sidebarCollapsed && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <CodeXml className="h-6 w-6 text-violet-500 animate-pulse" />
            <span className="font-bold text-base bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent tracking-tight">GravityX</span>
          </motion.div>
        )}
        {sidebarCollapsed && (
          <div className="mx-auto">
            <CodeXml className="h-6 w-6 text-violet-500" />
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Projects Area */}
      <div className="p-3 border-b border-slate-900/50">
        {!sidebarCollapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              <span>Workspaces</span>
              <button
                onClick={handleOpenWorkspace}
                className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
                title="Open Workspace"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {recentProjects.map((proj) => (
                <button
                  key={proj.path}
                  onClick={() => openWorkspace(proj.path)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-left transition-all ${
                    currentProject && proj.path === currentProject.path
                      ? 'bg-violet-650/15 border border-violet-500/20 text-violet-400 font-medium'
                      : 'text-slate-400 hover:bg-slate-850/60 hover:text-slate-200'
                  }`}
                >
                  <FolderKanban className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{proj.name}</span>
                </button>
              ))}
              {recentProjects.length === 0 && (
                <div className="text-[10px] text-slate-500 px-1 py-2 italic">
                  No local folders opened.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleOpenWorkspace}
              className="p-1.5 text-slate-400 hover:bg-slate-800 rounded-lg cursor-pointer"
              title="Open Workspace"
            >
              <Plus className="h-4 w-4" />
            </button>
            <div title="Workspaces"><FolderKanban className="h-4 w-4 text-slate-500" /></div>
          </div>
        )}
      </div>

      {/* Recents Chats Area */}
      <div className="flex-1 p-3 overflow-y-auto">
        {!sidebarCollapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              <span>Recent Sessions</span>
              <button
                onClick={() => createNewSession(currentProject?.id || 'default')}
                className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
                title="New Chat Session"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {sessions.map((sess) => (
                <button
                  key={sess.id}
                  onClick={() => setActiveSession(sess.id)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-left transition-all ${
                    sess.id === activeSessionId
                      ? 'bg-slate-800 text-slate-100 border border-slate-700/50'
                      : 'text-slate-450 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <MessageSquareCode className="h-3.5 w-3.5 flex-shrink-0 text-violet-400" />
                  <span className="truncate">{sess.title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => createNewSession(currentProject?.id || 'default')}
              className="p-1.5 text-slate-400 hover:bg-slate-800 rounded-lg cursor-pointer"
              title="New Chat Session"
            >
              <Plus className="h-4 w-4" />
            </button>
            <div title="Chat Sessions"><MessageSquareCode className="h-4 w-4 text-slate-500" /></div>
          </div>
        )}
      </div>

      {/* Saved Prompts / Extras */}
      {!sidebarCollapsed && (
        <div className="p-3 border-t border-slate-900/60 bg-slate-950/20">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">Saved Prompt Templates</div>
          <div className="space-y-1">
            <div className="text-[11px] p-2 rounded bg-slate-900/40 border border-slate-800/40 text-slate-400 hover:text-slate-200 cursor-pointer transition-colors truncate">
              💡 Optimize component state hooks
            </div>
            <div className="text-[11px] p-2 rounded bg-slate-900/40 border border-slate-800/40 text-slate-400 hover:text-slate-200 cursor-pointer transition-colors truncate">
              🛡️ Refactor validation wrappers
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-900 flex flex-col gap-1.5 bg-[#05070c]">
        {!sidebarCollapsed ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between p-2 text-xs rounded-md text-slate-450 hover:bg-slate-850 hover:text-slate-200 cursor-pointer">
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-550" />
                <span>Memory Banks</span>
              </span>
              <span className="bg-violet-600/20 border border-violet-500/20 text-[10px] text-violet-400 px-1.5 py-0.5 rounded font-mono font-medium">3 Facts</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div title="Memory Stats"><Database className="h-4 w-4 text-slate-500" /></div>
          </div>
        )}
      </div>

      {/* Open Project Folder Dialog */}
      <Dialog
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        title="Open Project Workspace Folder"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-1.5">Absolute Local Path</label>
            <input
              type="text"
              placeholder="e.g. D:\Flutter\my_app or C:\Projects\NextProject"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-850 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">Provide the local absolute directory path. The system will scan, detect frameworks, and load metadata.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-850">
            <Button variant="secondary" size="sm" onClick={() => setIsNewProjectOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleManualOpenWorkspace}>
              Open Workspace
            </Button>
          </div>
        </div>
      </Dialog>
    </motion.aside>
  );
};

export default Sidebar;
