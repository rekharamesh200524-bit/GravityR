'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GravityX] Root error boundary caught:', error);
  }, [error]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#04060a] text-slate-100 gap-4">
      <div className="text-2xl font-bold text-red-400">Something went wrong</div>
      <p className="text-sm text-slate-400 max-w-md text-center">{error.message}</p>
      <button
        onClick={reset}
        className="mt-2 px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
