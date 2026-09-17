export interface SaveInfo {
  path: string;
  fileName: string;
  folder: string;
  size: number;
  modifiedMs: number;
  isAuto: boolean;
  isBackup: boolean;
  /** parsed from the file name ("Save 2, Playing Time 01.37.13 - Brumba - LOC_FN_KvatchPlaza, Level 2.sav") */
  guess: { title: string; character: string | null; location: string; level: number } | null;
}

export interface SaveFolderScan {
  root: string;
  roots: string[];
  exists: boolean;
  saves: SaveInfo[];
  platform: NodeJS.Platform;
}

export interface WriteResult {
  ok: boolean;
  backupPath?: string;
  error?: string;
}

export interface Api {
  scanDefaultFolder(): Promise<SaveFolderScan>;
  openDialog(): Promise<string | null>;
  readFile(path: string): Promise<Uint8Array>;
  /** Backs up the original next to it, then writes atomically. */
  writeSave(path: string, data: Uint8Array): Promise<WriteResult>;
  revealInFolder(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  gameDataUrl(): Promise<string>;
  wasmUrl(): Promise<string>;
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(cb: (isMax: boolean) => void): () => void;
  };
}

export const IPC = {
  scanDefaultFolder: 'save:scanDefaultFolder',
  openDialog: 'save:openDialog',
  readFile: 'save:read',
  writeSave: 'save:write',
  revealInFolder: 'shell:reveal',
  openPath: 'shell:openPath',
  gameDataUrl: 'game:dataUrl',
  wasmUrl: 'game:wasmUrl',
  winMinimize: 'win:minimize',
  winMaximize: 'win:maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:isMaximized',
  winMaximizedChanged: 'win:maximizedChanged',
} as const;
