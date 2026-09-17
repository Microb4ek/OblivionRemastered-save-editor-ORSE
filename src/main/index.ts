import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC } from '../shared/ipc';
import { defaultSaveRoot, defaultSaveRoots, readSave, scanFolders, writeSave } from './saves';

// Game data (icons, metadata) and the Oodle wasm codec are served through a custom scheme so the
// renderer can reference them with plain <img src="or://icons/x.png"> / fetch('or://wasm/ooz.wasm').
protocol.registerSchemesAsPrivileged([{ scheme: 'or', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }]);

// AppImages on SteamOS cannot set up the SUID chrome sandbox.
if (process.platform === 'linux' && (process.env.APPIMAGE || process.env.ORSE_NO_SANDBOX)) app.commandLine.appendSwitch('no-sandbox');

function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#0d0f12',
    titleBarStyle: 'hidden',
    icon: join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true },
  });
  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('maximize', () => mainWindow?.webContents.send(IPC.winMaximizedChanged, true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send(IPC.winMaximizedChanged, false));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  if (process.env.ORSE_DEBUG_DIR) startDebugLoop(mainWindow, process.env.ORSE_DEBUG_DIR);
}

/** Dev automation: poll <dir>/cmd.json {js, shot, wait} -> result.json + screenshot. */
function startDebugLoop(win: BrowserWindow, dir: string): void {
  const fs = require('node:fs') as typeof import('node:fs');
  const cmdFile = join(dir, 'cmd.json');
  setInterval(async () => {
    if (!fs.existsSync(cmdFile) || win.isDestroyed()) return;
    let cmd: { js?: string; shot?: string; wait?: number };
    try {
      cmd = JSON.parse(fs.readFileSync(cmdFile, 'utf8'));
      fs.unlinkSync(cmdFile);
    } catch {
      return;
    }
    const result: Record<string, unknown> = { ok: true };
    try {
      if (cmd.js) result.value = await win.webContents.executeJavaScript(cmd.js, true);
      if (cmd.wait) await new Promise((r) => setTimeout(r, cmd.wait));
      if (cmd.shot) fs.writeFileSync(join(dir, cmd.shot), (await win.webContents.capturePage()).toPNG());
    } catch (e) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }
    fs.writeFileSync(join(dir, 'result.json'), JSON.stringify(result));
  }, 500);
}

app.whenReady().then(() => {
  const resDir = resourcesDir();
  protocol.handle('or', (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.hostname + url.pathname).replace(/\.\./g, '');
    // or://wasm/ooz.wasm -> resources/wasm/ooz.wasm, everything else -> resources/game/<rel>
    const file = rel.startsWith('wasm/') ? join(resDir, rel) : join(resDir, 'game', rel);
    return net.fetch(pathToFileURL(file).toString());
  });

  ipcMain.handle(IPC.scanDefaultFolder, () => scanFolders(defaultSaveRoots()));
  ipcMain.handle(IPC.readFile, (_e, p: string) => readSave(p));
  ipcMain.handle(IPC.openDialog, async (): Promise<string | null> => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open an Oblivion Remastered save',
      defaultPath: defaultSaveRoot(),
      filters: [{ name: 'Oblivion Remastered save', extensions: ['sav'] }, { name: 'All files', extensions: ['*'] }],
      properties: ['openFile'],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });
  ipcMain.handle(IPC.writeSave, (_e, p: string, data: Uint8Array) => writeSave(p, data));
  ipcMain.handle(IPC.revealInFolder, (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.handle(IPC.openPath, (_e, p: string) => shell.openPath(p));
  ipcMain.handle(IPC.gameDataUrl, () => 'or://data/gamedata.json');
  ipcMain.handle(IPC.wasmUrl, () => 'or://wasm/ooz.wasm');
  ipcMain.on(IPC.winMinimize, () => mainWindow?.minimize());
  ipcMain.on(IPC.winMaximize, () => (mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()));
  ipcMain.on(IPC.winClose, () => mainWindow?.close());
  ipcMain.handle(IPC.winIsMaximized, () => mainWindow?.isMaximized() ?? false);

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
