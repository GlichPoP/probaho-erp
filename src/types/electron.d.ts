export interface BackupOptions {
  data: Uint8Array | string;
  defaultName?: string;
  isBinary: boolean;
  useDialog?: boolean;
}

export interface BackupResult {
  canceled?: boolean;
  success?: boolean;
  path?: string;
  bytesWritten?: number;
}

export interface RestoreOptions {
  filePath?: string;
  useDialog?: boolean;
}

export interface RestoreResult {
  canceled?: boolean;
  success?: boolean;
  isBinary?: boolean;
  path?: string;
  data?: Uint8Array | string;
  filename?: string;
}

export interface SaveResult {
  success: boolean;
  bytesWritten: number;
  path: string;
  savedAt: string;
}

export interface IElectronAPI {
  platform: string;
  version: string;
  isElectron: boolean;

  dbLoad: () => Promise<Uint8Array | null>;
  dbSave: (buffer: Uint8Array | ArrayBuffer) => Promise<SaveResult>;
  dbBackup: (options: BackupOptions) => Promise<BackupResult>;
  dbRestore: (options: RestoreOptions) => Promise<RestoreResult>;
  appGetPath: (name?: string) => Promise<string>;

  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;

  print: () => void;
  openExternal: (url: string) => Promise<void>;
  onWindowMaximizedChange?: (callback: (maximized: boolean) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
    api?: IElectronAPI;
  }
}
