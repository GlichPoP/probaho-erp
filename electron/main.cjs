// ============================================================================
// PROBAHO ERP: HARDENED ELECTRON APPLICATION MAIN PROCESS
// File: proposed_main.cjs
// Target: electron/main.cjs
// Security: Context Isolation, Navigation Defense, Strict IPC Validation
// Persistence: %APPDATA%/Probaho ERP/probaho_erp.db
// ============================================================================

const electron = require('electron');
const path = require('path');
const fs = require('fs');

const isElectronRuntime = typeof electron === 'object' && electron !== null && Boolean(electron.app);
const app = isElectronRuntime ? electron.app : null;
const BrowserWindow = isElectronRuntime ? electron.BrowserWindow : null;
const Menu = isElectronRuntime ? electron.Menu : null;
const shell = isElectronRuntime ? electron.shell : null;
const ipcMain = isElectronRuntime ? electron.ipcMain : null;
const dialog = isElectronRuntime ? electron.dialog : null;
const session = isElectronRuntime ? electron.session : null;

// Ensure explicit application name across all platforms and pathing
if (app && typeof app.setName === 'function') {
  app.setName('Probaho ERP');
}

// Check for portable execution (e.g. electron-builder sets PORTABLE_EXECUTABLE_DIR on USB flash drives)
const portableBaseDir = process.env.PORTABLE_EXECUTABLE_DIR || process.env.PROBAHO_PORTABLE_DIR;
if (portableBaseDir && app && typeof app.setPath === 'function') {
  try {
    const portableDataPath = path.join(portableBaseDir, 'ProbahoData');
    if (!fs.existsSync(portableDataPath)) {
      fs.mkdirSync(portableDataPath, { recursive: true });
    }
    app.setPath('userData', portableDataPath);
    console.log(`[Probaho ERP] True USB Portability Active. Portable data directory: ${portableDataPath}`);
  } catch (err) {
    console.error('[Probaho ERP] Could not configure portable userData directory:', err);
  }
}

// --------------------------------------------------------------------------
// 2. Local Database & Backup Path Resolution
// --------------------------------------------------------------------------
function getDatabaseDirectory() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || process.env.PROBAHO_PORTABLE_DIR;
  let userDataPath;
  if (portableDir) {
    userDataPath = path.join(portableDir, 'ProbahoData');
  } else {
    try {
      userDataPath = (app && typeof app.getPath === 'function') ? app.getPath('userData') : path.join(process.cwd(), 'ProbahoData');
    } catch {
      userDataPath = path.join(process.cwd(), 'ProbahoData');
    }
  }
  if (!fs.existsSync(userDataPath)) {
    try {
      fs.mkdirSync(userDataPath, { recursive: true });
    } catch {
      // ignore
    }
  }
  return userDataPath;
}

function getBackupsDirectory() {
  const backupDir = path.join(getDatabaseDirectory(), 'backups');
  if (!fs.existsSync(backupDir)) {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return backupDir;
}

function getDatabasePath() {
  const primaryPath = path.join(getDatabaseDirectory(), 'probaho_erp.db');
  // Backward compatibility: check if DB was stored in nested folder during earlier dev runs
  const legacyPath = path.join(getDatabaseDirectory(), 'Probaho ERP', 'probaho_erp.db');
  if (!fs.existsSync(primaryPath) && fs.existsSync(legacyPath)) {
    try {
      fs.copyFileSync(legacyPath, primaryPath);
      console.log('[Probaho ERP] Migrated database from legacy nested directory to primary userData path.');
    } catch (err) {
      console.warn('[Probaho ERP] Could not copy legacy DB, reading directly from legacy path:', err);
      return legacyPath;
    }
  }
  return primaryPath;
}

let mainWindow = null;

// ----------------------------------------------------------------------------
// 1. Single Instance Application Lock
// ----------------------------------------------------------------------------
if (app && typeof app.requestSingleInstanceLock === 'function') {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.log('[Probaho ERP] Another instance is already running. Quitting.');
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });

  // --------------------------------------------------------------------------
  // 3. Main Window Lifecycle & Security Configuration
  // --------------------------------------------------------------------------
  function createWindow() {
    const iconPath = path.join(__dirname, '../build/icon.png');

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1024,
      minHeight: 720,
      title: 'Probaho ERP - Enterprise Supply Chain Suite',
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      backgroundColor: '#f8fafc',
      autoHideMenuBar: true,
      frame: false, // Frameless window enabling sleek custom TitleBar
      show: false,  // Show gracefully when ready-to-show to prevent white flash
      webPreferences: {
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: false, // Required for sql.js wasm relative file loading over file:// protocol
        webSecurity: false, // Allow local file:// fetching of SQLite WebAssembly binary
        allowRunningInsecureContent: false,
        spellcheck: false,
        devTools: !app.isPackaged
      }
    });

    // Remove default application menu
    Menu.setApplicationMenu(null);

    // Graceful first render
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    // Window maximization state sync events for custom TitleBar
    mainWindow.on('maximize', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('window-maximize-changed', true);
      }
    });

    mainWindow.on('unmaximize', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('window-maximize-changed', false);
      }
    });

    // Anti-Tampering: Prevent runtime DevTools inspection in production builds
    if (app.isPackaged) {
      mainWindow.webContents.on('devtools-opened', () => {
        mainWindow.webContents.closeDevTools();
      });

      mainWindow.webContents.on('before-input-event', (event, input) => {
        if (
          input.key === 'F12' ||
          (input.control && input.shift && ['I', 'i', 'J', 'j', 'C', 'c'].includes(input.key)) ||
          (input.control && ['U', 'u'].includes(input.key))
        ) {
          event.preventDefault();
        }
      });
    }

    // Top-Level Navigation Defense: Deny unauthorized renderer navigations
    const isDev = !app.isPackaged && Boolean(process.env.ELECTRON_DEV || process.argv.includes('--dev'));

    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
      try {
        const parsed = new URL(navigationUrl);
        if (isDev && parsed.origin === 'http://localhost:5173') {
          return;
        }
        if (parsed.protocol === 'file:') {
          const indexPath = path.join(__dirname, '../dist/index.html');
          const targetFile = path.normalize(decodeURIComponent(parsed.pathname).replace(/^\/([a-zA-Z]:)/, '$1'));
          const distDir = path.normalize(path.dirname(indexPath));
          if (targetFile === path.normalize(indexPath) || targetFile.startsWith(distDir)) {
            return;
          }
        }
      } catch {}
      // Intercept and prevent in-app navigation
      event.preventDefault();
      if (navigationUrl.startsWith('http:') || navigationUrl.startsWith('https:') || navigationUrl.startsWith('mailto:')) {
        shell.openExternal(navigationUrl);
      }
    });

    // Window Open Security: Open external links in default OS browser, never in-app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // Crash monitoring
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[Probaho ERP] Renderer process gone:', details);
    });

    // URL Loading: Dev server in dev mode, local dist/index.html in production
    if (isDev) {
      mainWindow.loadURL('http://localhost:5173');
    } else {
      const indexPath = path.join(__dirname, '../dist/index.html');
      mainWindow.loadFile(indexPath);
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  // --------------------------------------------------------------------------
  // 4. Session Security Policy: Reject Unsolicited Device Permissions
  // --------------------------------------------------------------------------
  app.whenReady().then(() => {
    if (session.defaultSession) {
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        // Zero external hardware permissions needed in offline ERP
        callback(false);
      });
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. IPC Channels: Persistence & SQLite Engine
  // --------------------------------------------------------------------------

  // 0. SQLite WebAssembly Binary Loader (Direct in-memory transfer to renderer)
  ipcMain.handle('get-wasm-binary', async () => {
    try {
      const candidates = [
        path.join(__dirname, '../dist/sql-wasm.wasm'),
        path.join(__dirname, '../public/sql-wasm.wasm'),
        path.join(__dirname, 'sql-wasm.wasm'),
        path.join(app ? app.getAppPath() : __dirname, 'dist', 'sql-wasm.wasm'),
        path.join(app ? app.getAppPath() : __dirname, 'public', 'sql-wasm.wasm'),
        path.join(process.resourcesPath || '', 'app.asar', 'dist', 'sql-wasm.wasm'),
        path.join(process.resourcesPath || '', 'dist', 'sql-wasm.wasm'),
        path.join(process.resourcesPath || '', 'sql-wasm.wasm'),
        path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
      ];

      for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
          const buffer = fs.readFileSync(candidate);
          if (buffer && buffer.length > 0) {
            return buffer;
          }
        }
      }
      console.warn('[Probaho ERP Main] sql-wasm.wasm not found in standard candidate paths.');
      return null;
    } catch (err) {
      console.error('[Probaho ERP Main] Error reading sql-wasm.wasm binary:', err);
      return null;
    }
  });

  // 1. Get Application Path (with whitelist validation)
  const ALLOWED_APP_PATHS = new Set([
    'home', 'appData', 'userData', 'temp', 'desktop', 'documents', 'downloads', 'logs'
  ]);

  ipcMain.handle('app-get-path', (_event, name) => {
    const target = typeof name === 'string' && ALLOWED_APP_PATHS.has(name) ? name : 'userData';
    return app.getPath(target);
  });

  // 2. Load SQLite Binary Snapshot from Disk
  ipcMain.handle('db-load', async () => {
    try {
      const dbPath = getDatabasePath();
      if (!fs.existsSync(dbPath)) {
        return null;
      }
      const buffer = await fs.promises.readFile(dbPath);
      return buffer;
    } catch (error) {
      console.error('[IPC db-load error]:', error);
      throw error;
    }
  });

  // 3. Atomically Save SQLite Binary Snapshot to Disk
  ipcMain.handle('db-save', async (_event, arrayBufferOrUint8Array) => {
    try {
      if (!arrayBufferOrUint8Array) {
        throw new Error('db-save failed: Empty database buffer provided');
      }

      const buffer = Buffer.isBuffer(arrayBufferOrUint8Array)
        ? arrayBufferOrUint8Array
        : Buffer.from(arrayBufferOrUint8Array);

      if (buffer.length < 16) {
        throw new Error('db-save failed: Database buffer size is below SQLite header minimum');
      }

      // SQLite Header Check: First 16 bytes must be "SQLite format 3\0"
      const headerSignature = buffer.subarray(0, 16).toString('utf-8');
      if (headerSignature !== 'SQLite format 3\0') {
        throw new Error('db-save failed: Missing valid SQLite format 3 signature');
      }

      const dbDir = getDatabaseDirectory();
      const dbPath = path.join(dbDir, 'probaho_erp.db');
      const tmpPath = path.join(dbDir, `probaho_erp.db.${Date.now()}.tmp`);

      // Atomic write pattern: write to tmp file first, flush, then atomic rename
      await fs.promises.writeFile(tmpPath, buffer);
      await fs.promises.rename(tmpPath, dbPath);

      return {
        success: true,
        bytesWritten: buffer.length,
        path: dbPath,
        savedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[IPC db-save error]:', error);
      throw error;
    }
  });

  // 4. Export / Backup Database
  ipcMain.handle('db-backup', async (_event, options = {}) => {
    try {
      const { data, defaultName, isBinary, useDialog } = options;
      if (!data) {
        throw new Error('db-backup failed: No data payload provided');
      }

      const buffer = isBinary ? Buffer.from(data) : Buffer.from(data, 'utf-8');

      if (useDialog && mainWindow) {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Export Probaho ERP Database Backup',
          defaultPath: defaultName || (isBinary ? 'probaho_erp_backup.db' : 'probaho_erp_snapshot.json'),
          filters: isBinary
            ? [
                { name: 'SQLite Database (*.db, *.sqlite)', extensions: ['db', 'sqlite'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            : [
                { name: 'JSON Snapshot (*.json)', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ]
        });

        if (canceled || !filePath) {
          return { canceled: true };
        }

        await fs.promises.writeFile(filePath, buffer);
        return {
          success: true,
          path: filePath,
          bytesWritten: buffer.length
        };
      } else {
        // Internal automated timestamped backup in userData/backups/
        const backupDir = getBackupsDirectory();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Sanitize defaultName to prevent path traversal
        const safeDefaultName = defaultName ? path.basename(defaultName) : null;
        const filename = safeDefaultName || `probaho_erp_auto_backup_${timestamp}.${isBinary ? 'db' : 'json'}`;
        const filePath = path.join(backupDir, filename);

        await fs.promises.writeFile(filePath, buffer);
        return {
          success: true,
          path: filePath,
          bytesWritten: buffer.length
        };
      }
    } catch (error) {
      console.error('[IPC db-backup error]:', error);
      throw error;
    }
  });

  // 5. Import / Restore Database
  ipcMain.handle('db-restore', async (_event, options = {}) => {
    try {
      const { filePath, useDialog } = options;
      let targetPath = filePath;

      if (useDialog && mainWindow) {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Probaho ERP Backup File to Restore',
          properties: ['openFile'],
          filters: [
            { name: 'Supported Backups (*.db, *.sqlite, *.json)', extensions: ['db', 'sqlite', 'json'] },
            { name: 'SQLite Databases (*.db, *.sqlite)', extensions: ['db', 'sqlite'] },
            { name: 'JSON Snapshots (*.json)', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (canceled || filePaths.length === 0) {
          return { canceled: true };
        }
        targetPath = filePaths[0];
      }

      if (!targetPath || !fs.existsSync(targetPath)) {
        throw new Error(`Restore target file not found: ${targetPath}`);
      }

      // Security check: If not invoked via user dialog, restrict path to internal backups dir
      if (!useDialog) {
        const backupDir = path.resolve(getBackupsDirectory());
        const resolvedTarget = path.resolve(targetPath);
        const rel = path.relative(backupDir, resolvedTarget);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new Error('Direct restore without dialog is restricted to the internal backups directory');
        }
      }

      const lowerTarget = targetPath.toLowerCase();
      if (!lowerTarget.endsWith('.db') && !lowerTarget.endsWith('.sqlite') && !lowerTarget.endsWith('.json')) {
        throw new Error(`Unsupported backup file type for restore: ${targetPath}`);
      }

      // Create an automatic pre-restore safety copy of the existing database if present
      const currentDb = getDatabasePath();
      if (fs.existsSync(currentDb)) {
        const backupDir = getBackupsDirectory();
        const safetyBackup = path.join(backupDir, `pre_restore_safety_${Date.now()}.db`);
        await fs.promises.copyFile(currentDb, safetyBackup);
        console.log('[Probaho ERP] Safety pre-restore snapshot created:', safetyBackup);
      }

      const isJson = targetPath.toLowerCase().endsWith('.json');
      if (isJson) {
        const content = await fs.promises.readFile(targetPath, 'utf-8');
        return {
          success: true,
          isBinary: false,
          path: targetPath,
          data: content,
          filename: path.basename(targetPath)
        };
      } else {
        const buffer = await fs.promises.readFile(targetPath);
        return {
          success: true,
          isBinary: true,
          path: targetPath,
          data: buffer,
          filename: path.basename(targetPath)
        };
      }
    } catch (error) {
      console.error('[IPC db-restore error]:', error);
      throw error;
    }
  });

  // --------------------------------------------------------------------------
  // 6. IPC Channels: Window Controls
  // --------------------------------------------------------------------------
  ipcMain.handle('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  });

  // --------------------------------------------------------------------------
  // 7. IPC Channels: External URL Dispatch
  // --------------------------------------------------------------------------
  ipcMain.handle('open-external', (_event, rawUrl) => {
    if (typeof rawUrl !== 'string') return;
    try {
      const parsed = new URL(rawUrl);
      if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        shell.openExternal(parsed.toString());
      } else {
        console.warn('[Probaho ERP] Denied external URL open for unsupported protocol:', parsed.protocol);
      }
    } catch {
      console.warn('[Probaho ERP] Malformed external URL rejected:', rawUrl);
    }
  });

  // --------------------------------------------------------------------------
  // 8. Lifecycle & Process Error Handlers
  // --------------------------------------------------------------------------
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  process.on('uncaughtException', (err) => {
    console.error('[Probaho ERP Main Process uncaughtException]:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Probaho ERP Main Process unhandledRejection]:', reason);
  });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getDatabaseDirectory,
    getDatabasePath,
    getBackupsDirectory
  };
}

