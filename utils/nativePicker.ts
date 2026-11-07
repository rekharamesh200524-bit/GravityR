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

  // 2. Web Browser Native OS File Explorer via showDirectoryPicker (Chrome / Edge / Brave)
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      if (handle) {
        if ((handle as any).path && isAbsolutePath((handle as any).path)) {
          return (handle as any).path;
        }
        const folderName = handle.name || '';
        if (folderName) {
          const userPath = window.prompt(
            `Selected folder '${folderName}'.\n\nPlease confirm or enter the full disk path to this directory:\n(e.g., D:\\Projects\\${folderName} or D:\\${folderName})`,
            `D:\\${folderName}`
          );
          if (userPath && isAbsolutePath(userPath.trim())) {
            return userPath.trim();
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null; // User explicitly clicked Cancel in OS dialog
      }
      console.warn('showDirectoryPicker error, falling back:', err);
    }
  }

  // 3. Direct Prompt Fallback: Type or paste full folder path on disk
  if (typeof window !== 'undefined') {
    const manualPath = window.prompt(
      "Open Project Workspace Folder\n\nPlease enter or paste the full absolute path to your project folder on disk:\n(e.g., D:\\Projects\\MyReactApp or D:\\GravityR)",
      ""
    );
    if (manualPath && isAbsolutePath(manualPath.trim())) {
      return manualPath.trim();
    }
  }

  return null;
};

