const { app, BrowserWindow, Tray, Menu, dialog, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Set SQLite data directory to Electron's userData path (writable, persists across updates)
// Must be set before server/database modules are loaded
process.env.APP_DATA_DIR = app.getPath('userData');

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized() || !mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// Start the Express server (must come after APP_DATA_DIR is set)
const server = require('./server');

let mainWindow;
let tray;

// Resolve assets path — works in both dev and packaged (asarUnpack) modes
const assetsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'assets')
  : path.join(__dirname, 'assets');

function getIcon() {
  try {
    const img = nativeImage.createFromPath(path.join(assetsDir, 'icon.ico'));
    if (!img.isEmpty()) return img;
  } catch {}
  // Fallback: generate a 32x32 green square from raw RGBA if no icon file exists
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i]     = 34;   // R
    buf[i + 1] = 197;  // G
    buf[i + 2] = 94;   // B
    buf[i + 3] = 255;  // A
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'hconnect API Client',
    icon: getIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.setMenuBarVisibility(false);

  // Only show the window once the page has fully loaded
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Clicking X hides to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(getIcon());

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open hconnect API Client',
      click: () => { mainWindow.show(); mainWindow.focus(); }
    },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit(); }
    }
  ]);

  tray.setToolTip('hconnect API Client');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// Required for Windows notifications / taskbar grouping
app.setAppUserModelId('com.hconnect.api-poster');

app.whenReady().then(() => {
  server.start(PORT, () => {
    createWindow();
    createTray();

    // Only check for updates when running as a packaged app (not in dev mode)
    if (app.isPackaged) {
      setTimeout(() => autoUpdater.checkForUpdates(), 5000);
    }
  });
});

// Keep app alive in system tray even when all windows are closed
app.on('window-all-closed', () => { /* intentionally empty */ });

app.on('before-quit', () => {
  app.isQuitting = true;
});

// ===================== Auto-Updater =====================

autoUpdater.autoDownload = false;        // ask the user before downloading
autoUpdater.autoInstallOnAppQuit = true; // install on next quit if user deferred

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `hconnect API Client v${info.version} is available`,
    detail: `You are running v${app.getVersion()}.\n\nWould you like to download and install it now?`,
    buttons: ['Download Update', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then(({ response }) => {
    if (response === 0) autoUpdater.downloadUpdate();
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready to Install',
    message: 'Update downloaded successfully',
    detail: 'The application will restart to apply the update.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then(({ response }) => {
    if (response === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err.message);
});
