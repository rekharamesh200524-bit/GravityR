const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

/**
 * Triggers the native operating system File Explorer directory selection dialog.
 * Opens native OS File Explorer in Electron or Browser (via Next.js / Host Backend).
 * Returns the selected absolute folder path, or null if cancelled.
 */
export const pickNativeFolder = async (): Promise<string | null> => {
  // 1. Desktop Shell (Electron) - Native OS File Explorer
  if (typeof window !== 'undefined' && (window as any).electronAPI?.openDirectory) {
    try {
      const dir = await (window as any).electronAPI.openDirectory();
      return dir || null;
    } catch (e) {
      console.warn('Electron directory picker error:', e);
    }
  }

  // 2. Same-Origin Next.js Server Native OS File Explorer (Works in Firefox, Chrome, Edge, Safari)
  try {
    const res = await fetch('/api/pick-folder', {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && data.path) {
        return data.path;
      }
      if (data.status === 'cancelled') {
        return null;
      }
    }
  } catch (e) {
    console.warn('Next.js native picker unavailable, trying backend picker:', e);
  }

  // 3. Host Backend Native OS File Explorer fallback
  try {
    const res = await fetch(`${API_BASE}/workspace/pick-folder`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && data.path) {
        return data.path;
      }
      if (data.status === 'cancelled') {
        return null;
      }
    }
  } catch (e) {
    console.warn('Backend native picker unavailable:', e);
  }

  throw new Error('Native OS File Explorer picker is unavailable');
};
