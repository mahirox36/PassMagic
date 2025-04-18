const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const robot = require('robotjs');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');

// Create a persistent storage for user preferences
const store = new Store();

// Declare windows and tray in global scope
let mainWindow = null;
let settingsWindow = null;
let tray = null;

// Initialize default settings if not exist
function initializeSettings() {
    if (!store.get('settings')) {
        store.set('settings', {
            theme: 'light',
            hotkey: 'F13',
            autoStart: false
        });
    }
}

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
            show: false,
            frame: false,
            transparent: true,
            backgroundColor: '#00000000',
            skipTaskbar: true,
            alwaysOnTop: true,
            focusable: false
        });

        // Load the index.html file
        mainWindow.loadFile('index.html');

        // Send theme to renderer
        mainWindow.webContents.on('did-finish-load', () => {
            const settings = store.get('settings');
            mainWindow.webContents.send('apply-theme', settings.theme);
        });

        mainWindow.once('ready-to-show', () => {
            mainWindow.showInactive();
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

        // Set mainWindow to null when it's closed
        mainWindow.on('closed', function () {
            mainWindow = null;
        });
    }
    
    return mainWindow;
}

function createSettingsWindow() {
    if (settingsWindow === null) {
        settingsWindow = new BrowserWindow({
            width: 420,
            height: 600,
            resizable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            autoHideMenuBar: true,
            icon: path.join(__dirname, 'assets/icon.png'),
            parent: mainWindow,
            modal: true,
            transparent: true,
            backgroundColor: '#00000000',
            frame: false,
        });

        settingsWindow.loadFile('settings.html');

        settingsWindow.on('closed', () => {
            settingsWindow = null;
        });
    } else {
        settingsWindow.focus();
    }
}

function setupTray() {
    let iconPath;
    
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
                createSettingsWindow();
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

function registerGlobalShortcut() {
    // Unregister existing shortcuts
    globalShortcut.unregisterAll();
    
    // Get hotkey from settings
    const settings = store.get('settings');
    const hotkey = settings.hotkey || 'F13';
    
    try {
        const success = globalShortcut.register(hotkey, () => {
            const win = createWindow();
            if (!win.isVisible()) {
                win.show();
                win.focus();
            } else {
                win.hide();
            }
        });
        
        if (!success) {
            console.error('Failed to register hotkey:', hotkey);
        }
    } catch (error) {
        console.error('Failed to register hotkey:', error);
    }
}

// Initialize app
app.whenReady().then(() => {
    initializeSettings();
    setupTray();
    registerGlobalShortcut();
    
    // Set auto-start based on settings
    const settings = store.get('settings');
    app.setLoginItemSettings({
        openAtLogin: settings.autoStart
    });

    app.on('activate', function () {
        createWindow();
    });
});

// Only quit when explicitly told to
app.on('window-all-closed', function () {
    // Keep app running in background
});

app.on('before-quit', function () {
    app.isQuitting = true;
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// IPC handlers for settings
ipcMain.on('get-settings', (event) => {
    const settings = store.get('settings');
    event.reply('load-settings', settings);
});

ipcMain.on('save-settings', (event, newSettings) => {
    // Save settings
    store.set('settings', newSettings);
    
    // Update auto-start
    app.setLoginItemSettings({
        openAtLogin: newSettings.autoStart
    });
    
    // Update hotkey
    registerGlobalShortcut();
    
    // Update theme in main window
    if (mainWindow) {
        mainWindow.webContents.send('apply-theme', newSettings.theme);
    }
    
    // Confirm save
    event.reply('settings-saved');
});

// Handle settings window close
ipcMain.on('close-settings', () => {
    if (settingsWindow) {
        settingsWindow.close();
    }
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
            robot.keyTap('v', 'command');
        } else {
            robot.keyTap('v', 'control');
        }
    }, 100);
});

// Add IPC handler for hide-window
ipcMain.on('hide-window', () => {
    if (mainWindow) {
        mainWindow.hide();
    }
});