const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let watcher = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'GravityX',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the running Next.js dev server
  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler to open directory using OS file dialog
ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Workspace Folder'
  });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// IPC Handler to register workspace path watcher
ipcMain.on('watch-directory', (event, dirPath) => {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log("Stopped watching previous workspace");
  }

  if (!dirPath || !fs.existsSync(dirPath)) return;

  console.log(`Starting file watch on: ${dirPath}`);
  try {
    watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (mainWindow) {
        mainWindow.webContents.send('workspace-changed', { eventType, filename });
      }
    });
  } catch (err) {
    console.error('Failed to initialize file watcher:', err);
  }
});
