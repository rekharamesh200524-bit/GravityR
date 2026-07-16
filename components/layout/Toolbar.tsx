import React, { useState } from 'react';
import { GitBranch, Bell, Settings, Shield, HardDrive, Search, Terminal } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useSettingsStore, AVAILABLE_MODELS } from '../../stores/useSettingsStore';
import { Dropdown } from '../ui/dropdown';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';

export const Toolbar: React.FC = () => {
  const { currentProject, isScanning } = useWorkspaceStore();
  const { toggleTerminal, toggleInspector } = useLayoutStore();
  const { provider, model, setProvider, setModel, temperature, setTemperature, maxTokens, setMaxTokens } = useSettingsStore();
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Map providers for selection dropdown
  const providerOptions = [
    { value: 'google', label: 'Google' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'ollama', label: 'Ollama (Local)' },
  ];

  // Map models based on active provider
  const modelOptions = AVAILABLE_MODELS
    .filter(m => m.provider === provider)
    .map(m => ({ value: m.id, label: m.name }));

  return (
    <div className="flex h-11 items-center justify-between border-b border-slate-900 bg-[#070913]/90 px-4 backdrop-blur-md select-none text-[11px] text-slate-350 z-40">
      {/* Workspace & Git Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 font-medium text-slate-200">
          <HardDrive className="h-3.5 w-3.5 text-violet-400" />
          <span className="truncate max-w-[130px] font-semibold text-slate-100">
            {currentProject ? currentProject.name : 'No Workspace'}
          </span>
        </div>

        <div className="h-3 w-px bg-slate-800" />

        {/* Git mock details */}
        <div className="flex items-center gap-1.5 hover:text-slate-200 cursor-pointer">
          <GitBranch className="h-3.5 w-3.5 text-slate-500" />
          <span>main</span>
        </div>

        <div className="h-3 w-px bg-slate-800" />

        {/* Build compiles */}
        <div className="flex items-center gap-1.5">
          <span className="flex h-1.5 w-1.5 relative">
            {isScanning ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            ) : (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isScanning ? 'bg-amber-450' : 'bg-emerald-500'}`}></span>
          </span>
          <span className={`text-[9px] uppercase tracking-wider font-semibold font-sans ${isScanning ? 'text-amber-400' : 'text-emerald-400'}`}>
            {isScanning ? 'indexing' : 'ready'}
          </span>
        </div>
      </div>

      {/* Global File Search Bar */}
      <div className="w-96 relative hidden lg:block">
        <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500" />
        <input
          type="text"
          placeholder="Go to file, class, or symbol (Ctrl+P)..."
          className="w-full rounded bg-slate-950 border border-slate-900 pl-8 pr-3 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 text-[10px] h-7"
        />
      </div>

      {/* Model Configurations */}
      <div className="flex items-center gap-2">
        <Dropdown
          options={providerOptions}
          selectedValue={provider}
          onChange={(val) => setProvider(val as any)}
          className="w-28"
        />
        
        <Dropdown
          options={modelOptions}
          selectedValue={model}
          onChange={(val) => setModel(val)}
          className="w-40"
        />

        <div className="h-3.5 w-px bg-slate-800 mx-1" />

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="rounded p-1.5 text-slate-450 hover:bg-slate-850 hover:text-slate-200 transition-colors cursor-pointer"
          title="IDE Options"
        >
          <Settings className="h-4 w-4" />
        </button>

        <button className="relative rounded p-1.5 text-slate-450 hover:bg-slate-850 hover:text-slate-200 transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-1 w-1 rounded-full bg-violet-500" />
        </button>

        <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center border border-violet-400/20 text-[10px] font-bold text-white shadow-md">
          U
        </div>
      </div>

      {/* Settings Dialog Modal */}
      <Dialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="GravityX IDE Settings"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-3 bg-violet-600/10 border border-violet-500/20 rounded-lg">
            <Shield className="h-5 w-5 text-violet-400 flex-shrink-0" />
            <p className="text-xs text-violet-300 leading-relaxed">
              Configure parameters of your compiler connection. These coordinate live index parameters of the scanner database.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-2">Model Temperature</label>
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
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => setIsSettingsOpen(false)}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default Toolbar;
