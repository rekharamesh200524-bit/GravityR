'use client';

import React from 'react';
import { 
  Files, Search, GitBranch, Sparkles, Database, Bookmark, 
  Blocks, Settings 
} from 'lucide-react';
import { useLayoutStore, SidebarView } from '../../stores/useLayoutStore';
import { motion } from 'framer-motion';

interface BarIconProps {
  view: SidebarView;
  icon: React.ReactNode;
  label: string;
}

export const ActivityBar: React.FC = () => {
  const { activeSidebarView, leftPanelCollapsed, setActiveSidebarView, setLeftPanelCollapsed, toggleLeftPanel } = useLayoutStore();

  const handleIconClick = (view: SidebarView) => {
    if (activeSidebarView === view) {
      toggleLeftPanel();
    } else {
      setActiveSidebarView(view);
      setLeftPanelCollapsed(false);
    }
  };

  const BarIcon: React.FC<BarIconProps> = ({ view, icon, label }) => {
    const isActive = activeSidebarView === view && !leftPanelCollapsed;
    return (
      <button
        onClick={() => handleIconClick(view)}
        className={`group relative flex h-12 w-12 items-center justify-center cursor-pointer transition-all duration-200 outline-none ${
          isActive 
            ? 'text-violet-400 bg-violet-950/10 shadow-[inset_2px_0_0_0_#8b5cf6,0_0_12px_rgba(139,92,246,0.1)]' 
            : 'text-slate-500 hover:text-slate-200 hover:bg-slate-900/10'
        }`}
        title={label}
      >
        <div className={`transition-transform duration-150 ${isActive ? 'scale-105' : 'group-hover:scale-105 group-active:scale-95'}`}>
          {icon}
        </div>
        
        {/* Active side indicator with glow */}
        {isActive && (
          <motion.span 
            layoutId="activeIndicator"
            className="absolute left-0 h-8 w-[2px] bg-violet-500 rounded-r shadow-[0_0_8px_#a78bfa]"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
      </button>
    );
  };

  return (
    <div className="flex w-12 flex-col justify-between items-center bg-[var(--bg-activity,#05060a)] border-r border-[var(--border-color,#1e293b)] select-none py-2 z-30 flex-shrink-0 transition-colors duration-200">
      {/* Primary Shortcut Actions */}
      <div className="flex flex-col items-center w-full gap-0.5">
        <BarIcon 
          view="explorer" 
          icon={<Files className="h-4.5 w-4.5" />} 
          label="Explorer" 
        />
        <BarIcon 
          view="search" 
          icon={<Search className="h-4.5 w-4.5" />} 
          label="Search Workspace" 
        />
        <BarIcon 
          view="git" 
          icon={<GitBranch className="h-4.5 w-4.5" />} 
          label="Source Control" 
        />
        <BarIcon 
          view="tasks" 
          icon={<Sparkles className="h-4.5 w-4.5" />} 
          label="AI Planner Tasks" 
        />
        <BarIcon 
          view="memory" 
          icon={<Database className="h-4.5 w-4.5" />} 
          label="Workspace Memory" 
        />
        <BarIcon 
          view="prompts" 
          icon={<Bookmark className="h-4.5 w-4.5" />} 
          label="Prompt Template Library" 
        />
      </div>

      {/* Footer shortcut actions */}
      <div className="flex flex-col items-center w-full gap-0.5">
        <BarIcon 
          view="extensions" 
          icon={<Blocks className="h-4.5 w-4.5" />} 
          label="Extensions" 
        />
        <BarIcon 
          view="settings" 
          icon={<Settings className="h-4.5 w-4.5" />} 
          label="Settings" 
        />
      </div>
    </div>
  );
};

export default ActivityBar;
