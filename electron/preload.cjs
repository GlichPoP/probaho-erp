// ============================================================================
// PROBAHO ERP: HARDENED ELECTRON PRELOAD BRIDGE
// File: proposed_preload.cjs
// Target: electron/preload.cjs
// Context Isolation Bridge with Strict API Surface & Window Event Listeners
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

const apiBridge = {
  platform: process.platform,
  version: process.versions.electron,
  isElectron: true,

  // --------------------------------------------------------------------------
  // Database Persistence
  // --------------------------------------------------------------------------
  getWasmBinary: () => ipcRenderer.invoke('get-wasm-binary'),
  dbLoad: () => ipcRenderer.invoke('db-load'),
  dbSave: (buffer) => ipcRenderer.invoke('db-save', buffer),
  dbBackup: (options) => ipcRenderer.invoke('db-backup', options),
  dbRestore: (options) => ipcRenderer.invoke('db-restore', options),
  appGetPath: (name) => ipcRenderer.invoke('app-get-path', name),

  // --------------------------------------------------------------------------
  // Window Controls & State Synchronization
  // --------------------------------------------------------------------------
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  
  /**
   * Subscribes to window maximize/unmaximize state transitions.
   * Returns a cleanup unsubscribe callback function.
   */
  onWindowMaximizedChange: (callback) => {
    if (typeof callback === 'function') {
      const handler = (_event, isMax) => callback(isMax);
      ipcRenderer.on('window-maximize-changed', handler);
      return () => {
        ipcRenderer.removeListener('window-maximize-changed', handler);
      };
    }
    return () => {};
  },

  // --------------------------------------------------------------------------
  // System Utilities
  // --------------------------------------------------------------------------
  print: () => window.print(),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
};

// Expose on both window.electronAPI and window.api for dual compatibility
contextBridge.exposeInMainWorld('electronAPI', apiBridge);
contextBridge.exposeInMainWorld('api', apiBridge);
