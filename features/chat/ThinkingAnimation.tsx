import React from 'react';

export const ThinkingAnimation: React.FC = () => {
  return (
    <div className="flex items-center gap-3 py-3 px-1 select-none">
      <div className="relative flex h-5 w-5 items-center justify-center">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-20"></span>
        <span className="relative flex h-3.5 w-3.5 rounded-full bg-gradient-to-tr from-violet-650 to-indigo-500 shadow-md shadow-violet-500/30"></span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-450 tracking-wider">GravityX is thinking</span>
        <span className="text-xs font-semibold text-violet-400 animate-pulse">...</span>
      </div>
    </div>
  );
};

export default ThinkingAnimation;
