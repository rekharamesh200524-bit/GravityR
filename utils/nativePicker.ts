const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const isAbsolutePath = (path: string): boolean => {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  // Windows drive path like C:\ or D:/ or network UNC path \\server
  if (/^[a-zA-Z]:[/\\]/.test(trimmed) || /^\\\\[^\\]+\\[^\\]+/.test(trimmed)) return true;
  // Unix absolute path starting with /
  if (trimmed.startsWith('/')) return true;
  return false;
};

/**
 * Triggers the native operating system File Explorer directory selection dialog.
 * Opens native OS File Explorer in Electron, Browser (File System Access / webkitdirectory), or Host Backend.
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

  // 2. Local Backend Host - Triggers Windows File Explorer via PowerShell/Tkinter
  try {
    // Quick 1s ping to verify backend is up before launching native dialog
    const pingController = new AbortController();
    const pingTimeout = setTimeout(() => pingController.abort(), 1000);
    const pingRes = await fetch(`${API_BASE}/workspace/recents`, { signal: pingController.signal }).catch(() => null);
    clearTimeout(pingTimeout);

    if (pingRes && pingRes.ok) {
      // Backend is online — call pick-folder endpoint (allow up to 120s for user interactions)
      const dialogController = new AbortController();
      const dialogTimeout = setTimeout(() => dialogController.abort(), 120000);

      const res = await fetch(`${API_BASE}/workspace/pick-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: dialogController.signal,
      });
      clearTimeout(dialogTimeout);

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.path) {
          return data.path;
        }
        if (data.status === 'cancelled') {
          return null;
        }
      }
    }
  } catch (err) {
    console.warn('Backend pick-folder endpoint offline or unreachable:', err);
  }

  // 3. Web Browser Native OS File Explorer via HTML5 webkitdirectory / showDirectoryPicker
  if (typeof window !== 'undefined') {
    // Try modern File System Access API if supported (Chrome/Edge/Brave)
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
        if (handle) {
          // If file path is exposed on handle (e.g. Chrome with local permissions)
          if ((handle as any).path && isAbsolutePath((handle as any).path)) {
            return (handle as any).path;
          }
          const selectedName = handle.name || '';
          if (selectedName) {
            const userPath = window.prompt(
              `Selected folder '${selectedName}'. Please enter the full path to this directory on disk:`,
              selectedName
            );
            if (userPath && isAbsolutePath(userPath.trim())) {
              return userPath.trim();
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return null; // User explicitly clicked Cancel
        }
      }
    }

    // Fallback: Invisible HTML input with webkitdirectory to trigger native OS File Explorer window
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      (input as any).webkitdirectory = true;
      (input as any).directory = true;
      input.style.display = 'none';

      input.onchange = (e: any) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          const firstFile = files[0];
          const fullPath = (firstFile as any).path;
          if (fullPath && isAbsolutePath(fullPath)) {
            const parts = fullPath.split(/[/\\]/);
            const relParts = (firstFile.webkitRelativePath || '').split('/');
            if (relParts.length > 1) {
              const rootFolderName = relParts[0];
              const folderIndex = parts.lastIndexOf(rootFolderName);
              if (folderIndex !== -1) {
                const folderPath = parts.slice(0, folderIndex + 1).join('\\');
                if (document.body.contains(input)) document.body.removeChild(input);
                resolve(folderPath);
                return;
              }
            }
            if (document.body.contains(input)) document.body.removeChild(input);
            resolve(fullPath);
            return;
          }
          const relPath = firstFile.webkitRelativePath || '';
          const rootFolder = relPath.split('/')[0] || '';
          if (document.body.contains(input)) document.body.removeChild(input);

          if (rootFolder) {
            const userPath = window.prompt(
              `Selected folder '${rootFolder}'. Please enter the full path to this directory on disk:`,
              rootFolder
            );
            if (userPath && isAbsolutePath(userPath.trim())) {
              resolve(userPath.trim());
              return;
            }
          }
          resolve(null);
          return;
        }
        if (document.body.contains(input)) document.body.removeChild(input);
        resolve(null);
      };

      input.oncancel = () => {
        if (document.body.contains(input)) document.body.removeChild(input);
        resolve(null);
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  return null;
};

