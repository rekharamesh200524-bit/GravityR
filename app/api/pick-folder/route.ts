import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

async function pickWindowsFolder(): Promise<string | null> {
  // 1. Try Python Tkinter modern IFileOpenDialog (FOS_PICKFOLDERS)
  const tkScript = [
    'import os, tkinter as tk',
    'from tkinter import filedialog',
    'r = tk.Tk()',
    'r.withdraw()',
    'r.attributes("-topmost", True)',
    'r.update()',
    'p = filedialog.askdirectory(parent=r, title="Select Project Workspace Folder")',
    'r.destroy()',
    'print(os.path.abspath(p) if p else "")',
  ].join('; ');

  for (const pyBin of ['python', 'py']) {
    try {
      const { stdout } = await execFileAsync(pyBin, ['-c', tkScript], {
        timeout: 120_000,
        windowsHide: true,
      });
      const selected = stdout.trim();
      if (selected) {
        return path.resolve(selected);
      }
      return null;
    } catch {
      // Try next executable / fallback
    }
  }

  // 2. Fallback to PowerShell FolderBrowserDialog
  const psScript = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[System.Windows.Forms.Application]::EnableVisualStyles()',
    '$owner = New-Object System.Windows.Forms.Form -Property @{TopMost = $true; ShowInTaskbar = $false; Opacity = 0}',
    '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$f.Description = 'Select Project Workspace Folder'",
    '$f.ShowNewFolderButton = $true',
    'if ($f.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }',
    '$owner.Dispose()',
  ].join('; ');

  const { stdout } = await execFileAsync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-Command', psScript],
    { timeout: 120_000, windowsHide: true }
  );
  const selected = stdout.trim();
  return selected ? path.resolve(selected) : null;
}

export async function POST() {
  try {
    let selectedPath: string | null = null;

    if (process.platform === 'win32') {
      selectedPath = await pickWindowsFolder();
    } else if (process.platform === 'darwin') {
      try {
        const { stdout } = await execFileAsync(
          'osascript',
          ['-e', 'POSIX path of (choose folder with prompt "Select Project Workspace Folder")'],
          { timeout: 120_000 }
        );
        selectedPath = stdout.trim() || null;
      } catch {
        selectedPath = null;
      }
    } else {
      try {
        const { stdout } = await execFileAsync(
          'zenity',
          ['--file-selection', '--directory', '--title=Select Project Workspace Folder'],
          { timeout: 120_000 }
        );
        selectedPath = stdout.trim() || null;
      } catch {
        selectedPath = null;
      }
    }

    if (selectedPath) {
      return NextResponse.json({ status: 'success', path: selectedPath });
    }
    return NextResponse.json({ status: 'cancelled', path: null });
  } catch (error) {
    console.error('[PICK_FOLDER] Failed to launch OS File Explorer:', error);
    return NextResponse.json(
      { status: 'error', path: null, message: 'Failed to launch native folder picker' },
      { status: 500 }
    );
  }
}
