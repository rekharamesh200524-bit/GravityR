import React, { useState } from 'react';
import { GitBranch, Wifi, Bell, Shield, Settings, Cpu, HardDrive } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useSettingsStore, AVAILABLE_MODELS } from '../../stores/useSettingsStore';
import { Dropdown } from '../ui/dropdown';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';

export const Header: React.FC = () => {
  const { currentProject } = useWorkspaceStore();
  const { provider, model, setProvider, setModel, temperature, setTemperature, maxTokens, setMaxTokens } = useSettingsStore();
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Map providers for selection dropdown
  const providerOptions = [
    { value: 'google', label: 'Google Gemini' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'ollama', label: 'Ollama (Local)' },
  ];

  // Map models based on active provider
  const modelOptions = AVAILABLE_MODELS
    .filter(m => m.provider === provider)
    .map(m => ({ value: m.id, label: m.name }));

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-[#070913]/90 px-6 backdrop-blur-md z-40 select-none">
      {/* Workspace & Git Status */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4.5 w-4.5 text-violet-400" />
          <span className="text-sm font-semibold tracking-tight text-slate-100">
            {currentProject ? currentProject.name : 'No Workspace'}
          </span>
          {currentProject && (
            <span className="text-[10px] bg-violet-650/15 border border-violet-500/20 text-violet-400 px-2 py-0.5 rounded font-mono font-medium">
              {currentProject.framework} ({currentProject.language})
            </span>
          )}
        </div>

        <div className="h-4 w-px bg-slate-800" />

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-1.5 hover:text-slate-200 transition-colors cursor-pointer" title={currentProject?.path}>
            <GitBranch className="h-3.5 w-3.5 text-slate-500" />
            <span>local-fs</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold font-sans">connected</span>
          </div>
        </div>
      </div>

      {/* Model Configurations */}
      <div className="flex items-center gap-3">
        <Dropdown
          options={providerOptions}
          selectedValue={provider}
          onChange={(val) => setProvider(val as any)}
          className="w-36"
        />
        
        <Dropdown
          options={modelOptions}
          selectedValue={model}
          onChange={(val) => {
            setModel(val);
            void import('../../stores/useAgentStore').then(({ useAgentStore }) => {
              void useAgentStore.getState().selectGatewayModel(val);
            }).catch(() => {});
          }}
          className="w-48"
        />

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Action icons */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
          title="Open Settings"
        >
          <Settings className="h-4.5 w-4.5" />
        </button>

        <button className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors">
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-violet-500" />
        </button>

        <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center border border-violet-400/20 text-xs font-bold text-white shadow-md shadow-violet-600/25">
          U
        </div>
      </div>

      {/* Settings Dialog Modal */}
      <Dialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="GravityX IDE Configuration"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-3 bg-violet-600/10 border border-violet-500/20 rounded-lg">
            <Shield className="h-5 w-5 text-violet-400 flex-shrink-0" />
            <p className="text-xs text-violet-300 leading-relaxed">
              API Keys are managed locally. In production, these parameters connect dynamically through your FastAPI engine.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-2">Temperature</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-violet-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-mono text-slate-200 w-8 text-right">{temperature}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Lower values are more precise; higher values generate creative alternatives.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-2">Max Execution Tokens</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="512"
                  max="16384"
                  step="512"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full accent-violet-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-mono text-slate-200 w-12 text-right">{maxTokens}</span>
              </div>
            </div>

            <div className="border-t border-slate-850 pt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsSettingsOpen(false)}>
                Close
              </Button>
              <Button variant="primary" size="sm" onClick={() => setIsSettingsOpen(false)}>
                Apply Parameters
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </header>
  );
};

export default Header;
