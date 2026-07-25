/**
 * Triggers the native operating system File Explorer directory selection dialog.
 * Supported in Electron and web browser environments (Chrome, Edge, Brave).
 */
export const pickNativeFolder = (): Promise<string | null> => {
  return new Promise((resolve) => {
    // 1. Desktop Shell (Electron)
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.openDirectory().then(resolve);
      return;
    }

    // 2. Web Browser Fallback: Use HTML5 webkitdirectory file input
    // Triggers native Windows File Explorer folder chooser dialog
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.multiple = true;

    input.onchange = (e: any) => {
      const files: FileList = e.target.files;
      if (!files || files.length === 0) {
        resolve(null);
        return;
      }

      const firstFile = files[0];
      const filePath = (firstFile as any).path;
      const relPath = firstFile.webkitRelativePath;

      if (filePath && relPath) {
        // Derive absolute root workspace path from file metadata
        const relParts = relPath.split('/');
        const rootDirName = relParts[0];

        const normalizedFile = filePath.replace(/\\/g, '/');
        const idx = normalizedFile.indexOf('/' + relPath);

        if (idx !== -1) {
          const rootParent = normalizedFile.substring(0, idx);
          const absFolder = rootParent + '/' + rootDirName;
          const isWindows = filePath.includes('\\');
          const finalFolder = isWindows ? absFolder.replace(/\//g, '\\') : absFolder;
          resolve(finalFolder);
          return;
        }
      }

      // If browser security strips absolute path, fallback to path prompt
      const fallbackPath = prompt("Enter absolute folder path to open:");
      resolve(fallbackPath || null);
    };

    input.oncancel = () => {
      resolve(null);
    };

    // Open native OS File Explorer window
    input.click();
  });
};
