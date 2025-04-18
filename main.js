const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const robot = require('robotjs');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');

// Create a persistent storage for user preferences
const store = new Store();

// Declare mainWindow and tray in global scope
let mainWindow = null;
let tray = null;

function createWindow() {
  // Create the browser window if it doesn't exist
  if (mainWindow === null) {
    mainWindow = new BrowserWindow({
      width: 450,
      height: 680,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'assets/icon.png'),
      show: false, // We'll show manually when it's ready
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false, // Important for pop-up style!
    });

    // Load the index.html file
    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
      mainWindow.showInactive(); // ← this is the key!
    });

    // Handle window close event - hide instead of destroy
    mainWindow.on('close', function (event) {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
        return false;
      }
      return true;
    });

    // Set mainWindow to null when it's closed (for proper cleanup on exit)
    mainWindow.on('closed', function () {
      mainWindow = null;
    });
  }
  
  return mainWindow;
}

function setupTray() {
  // Create a tray icon
  let iconPath;
  
  // Try to use SVG icon first, then PNG if available
  if (process.platform === 'win32') {
    iconPath = path.join(__dirname, 'assets/icon.ico');
  } else if (process.platform === 'darwin') {
    iconPath = path.join(__dirname, 'assets/icon.icns');
  } else {
    iconPath = path.join(__dirname, 'assets/icon.png');
  }

  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'assets/icon.png');
  }
  
  console.log('Using icon:', iconPath);
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  
  tray = new Tray(icon);
  tray.setToolTip('PassMagic');
  
  // Create context menu for tray
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '✨ Generate Password', 
      click: () => {
        const win = createWindow();
        win.show();
        win.focus();
      } 
    },
    { type: 'separator' },
    { 
      label: '⚙️ Settings', 
      click: () => {
        // Could add settings functionality in the future
      } 
    },
    { type: 'separator' },
    { 
      label: '❌ Exit', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Show app on tray icon click (Windows/Linux behavior)
  tray.on('click', () => {
    const win = createWindow();
    if (!win.isVisible()) {
      win.show();
      win.focus();
    } else {
      win.hide();
    }
  });
}

// Create tray when the app is ready, but don't show window
app.whenReady().then(() => {
  setupTray();
  
  // Register F13 global shortcut
  globalShortcut.register('F13', () => {
    const win = createWindow();
    if (!win.isVisible()) {
      win.show();
      win.focus();
    } else {
      win.hide();
    }
  });

  app.on('activate', function () {
    createWindow();
  });
});

// Only quit when explicitly told to
app.on('window-all-closed', function () {
  // Don't quit the app when all windows are closed
  // This keeps the app running in the background with tray icon
});

// Handle before-quit event
app.on('before-quit', function () {
  app.isQuitting = true;
});

// Unregister shortcuts when app is going to exit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Handle IPC messages from renderer process
ipcMain.on('copy-and-paste', (event, password) => {
  if (!password) return;

  clipboard.writeText(password);

  if (mainWindow) {
    mainWindow.hide();
  }

  setTimeout(() => {
    const platform = os.platform();

    if (platform === 'darwin') {
      // macOS: Command + V
      robot.keyTap('v', 'command');
    } else {
      // Windows/Linux: Ctrl + V
      robot.keyTap('v', 'control');
    }
  }, 100); // Small delay to ensure clipboard is updated
});