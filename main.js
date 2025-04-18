const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
} = require("electron");
const path = require("path");
const robot = require("robotjs");
const Store = require("electron-store");
const fs = require("fs");
const os = require("os");

// Create a persistent storage for user preferences
const store = new Store();

// Declare windows and tray in global scope
let mainWindow = null;
let settingsWindow = null;
let tray = null;

// Function to get system theme
function getSystemTheme() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

// Initialize default settings if not exist
function initializeSettings() {
  if (!store.get("settings")) {
    store.set("settings", {
      theme: "system",
      hotkey: "F13",
      autoStart: false,
    });
  }
}

// Apply theme to a window
function applyTheme(window) {
  const settings = store.get("settings");
  const theme = settings.theme === "system" ? getSystemTheme() : settings.theme;
  if (window && window.webContents) {
    window.webContents.send("apply-theme", theme);
  }
}

// Listen for system theme changes
nativeTheme.on("updated", () => {
  if (mainWindow) applyTheme(mainWindow);
  if (settingsWindow) applyTheme(settingsWindow);
});

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
        enableRemoteModule: true,
      },
      autoHideMenuBar: true,
      icon: path.join(__dirname, "assets/icon.png"),
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      type: "toolbar",
    });

    // Load the index.html file
    mainWindow.loadFile("index.html");

    // Apply theme to main window
    mainWindow.webContents.on("did-finish-load", () => {
      applyTheme(mainWindow);
    });

    mainWindow.once("ready-to-show", () => {
      mainWindow.setAlwaysOnTop(true, "screen-saver");
      mainWindow.showInactive();
    });

    // Handle window close event - hide instead of destroy
    mainWindow.on("close", function (event) {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
        return false;
      }
      return true;
    });

    // Set mainWindow to null when it's closed
    mainWindow.on("closed", function () {
      mainWindow = null;
    });
  }

  return mainWindow;
}

function createSettingsWindow() {
  if (settingsWindow === null) {
    settingsWindow = new BrowserWindow({
      width: 420,
      height: 700,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      autoHideMenuBar: true,
      icon: path.join(__dirname, "assets/icon.png"),
      transparent: true,
      backgroundColor: "#00000000",
      frame: false,
      alwaysOnTop: true,
    });

    settingsWindow.loadFile("settings.html");

    settingsWindow.webContents.on("did-finish-load", () => {
      applyTheme(settingsWindow);
    });

    settingsWindow.on("closed", () => {
      settingsWindow = null;
    });
  } else {
    if (!settingsWindow.isVisible()) {
      settingsWindow.show();
    }
    settingsWindow.focus();
  }
}

function setupTray() {
  let iconPath;

  if (process.platform === "win32") {
    iconPath = path.join(__dirname, "assets/icon.ico");
  } else if (process.platform === "darwin") {
    iconPath = path.join(__dirname, "assets/icon.icns");
  } else {
    iconPath = path.join(__dirname, "assets/icon.png");
  }

  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, "assets/icon.png");
  }

  console.log("Using icon:", iconPath);
  const icon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip("PassMagic");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "✨ Generate Password",
      click: () => {
        const win = createWindow();
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "⚙️ Settings",
      click: () => {
        createSettingsWindow();
      },
    },
    { type: "separator" },
    {
      label: "❌ Exit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
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
  const settings = store.get("settings");
  const hotkey = settings.hotkey || "F13";

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
      console.error("Failed to register hotkey:", hotkey);
    }
  } catch (error) {
    console.error("Failed to register hotkey:", error);
  }
}

// Initialize app
app.whenReady().then(() => {
  initializeSettings();
  setupTray();
  registerGlobalShortcut();

  // Set auto-start based on settings
  const settings = store.get("settings");
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart,
  });

  app.on("activate", function () {
    createWindow();
  });
});

// Only quit when explicitly told to
app.on("window-all-closed", function () {
  // Keep app running in background
});

app.on("before-quit", function () {
  app.isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// IPC handlers for settings
ipcMain.on("get-settings", (event) => {
  const settings = store.get("settings");
  event.reply("load-settings", settings);
});

ipcMain.on("save-settings", (event, newSettings) => {
  // Save settings
  store.set("settings", newSettings);

  // Apply theme immediately to both windows
  if (mainWindow) {
    const theme =
      newSettings.theme === "system" ? getSystemTheme() : newSettings.theme;
    mainWindow.webContents.send("apply-theme", theme);
  }
  if (settingsWindow) {
    const theme =
      newSettings.theme === "system" ? getSystemTheme() : newSettings.theme;
    settingsWindow.webContents.send("apply-theme", theme);
  }

  // Update auto-start
  app.setLoginItemSettings({
    openAtLogin: newSettings.autoStart,
  });

  // Update hotkey
  registerGlobalShortcut();

  // Confirm save
  event.reply("settings-saved");

  // Hide settings window after save
  if (settingsWindow) {
    settingsWindow.hide();
  }
});

// Handle settings window close
ipcMain.on("close-settings", () => {
  if (settingsWindow) {
    settingsWindow.close();
  }
});

// Handle IPC messages from renderer process
ipcMain.on("copy-and-paste", (event, password) => {
  if (!password) return;

  clipboard.writeText(password);

  if (mainWindow) {
    mainWindow.hide();
  }

  // Increase delay and add keyboard event simulation
  setTimeout(() => {
    const platform = os.platform();

    // Simulate a small delay between pressing and releasing modifier key
    if (platform === "darwin") {
      robot.keyToggle("command", "down");
      robot.keyTap("v");
      robot.keyToggle("command", "up");
    } else {
      robot.keyToggle("control", "down");
      robot.keyTap("v");
      robot.keyToggle("control", "up");
    }
  }, 300); // Increased delay
});

// Add IPC handler for hide-window
ipcMain.on("hide-window", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.hide();
  }
});

// Add IPC handler for opening settings
ipcMain.on("open-settings", () => {
  createSettingsWindow();
});
