import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SaveFolderScan, SaveInfo, WriteResult } from '../shared/ipc';

const STEAM_APP_ID = '2623190';
const SAVE_SUBDIR = ['Documents', 'My Games', 'Oblivion Remastered', 'Saved', 'SaveGames'];
export const BACKUP_DIR = 'ORSE-backups';

function linuxSteamRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(home, '.steam', 'root'),
  ];
}

function steamLibraries(steamRoot: string): string[] {
  const libs = new Set<string>([steamRoot]);
  try {
    const text = fs.readFileSync(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  } catch {
    /* no vdf */
  }
  return [...libs];
}

/**
 * Windows: %USERPROFILE%\Documents\My Games\Oblivion Remastered\Saved\SaveGames
 * Linux/SteamOS (Proton): <library>/steamapps/compatdata/2623190/pfx/drive_c/users/steamuser/Documents/My Games/Oblivion Remastered/Saved/SaveGames
 */
export function defaultSaveRoots(): string[] {
  if (process.platform === 'win32') {
    const roots = [path.join(os.homedir(), ...SAVE_SUBDIR)];
    try {
      // Documents may be redirected (OneDrive); ask the shell folder from the registry
      const { execSync } = require('node:child_process') as typeof import('node:child_process');
      const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal', { encoding: 'utf8', windowsHide: true });
      const m = /Personal\s+REG_\w+\s+(.+)/.exec(out);
      if (m) {
        const docs = m[1].trim().replace(/%USERPROFILE%/i, os.homedir());
        const p = path.join(docs, 'My Games', 'Oblivion Remastered', 'Saved', 'SaveGames');
        if (!roots.includes(p)) roots.unshift(p);
      }
    } catch {
      /* registry not available */
    }
    return roots.sort((a, b) => Number(fs.existsSync(b)) - Number(fs.existsSync(a)));
  }
  if (process.platform === 'linux') {
    const out: string[] = [];
    for (const root of linuxSteamRoots()) {
      if (!fs.existsSync(root)) continue;
      for (const lib of steamLibraries(root)) {
        const p = path.join(lib, 'steamapps', 'compatdata', STEAM_APP_ID, 'pfx', 'drive_c', 'users', 'steamuser', ...SAVE_SUBDIR);
        if (!out.includes(p)) out.push(p);
      }
    }
    if (!out.length) out.push(path.join(os.homedir(), '.steam', 'steam', 'steamapps', 'compatdata', STEAM_APP_ID, 'pfx', 'drive_c', 'users', 'steamuser', ...SAVE_SUBDIR));
    return out.sort((a, b) => Number(fs.existsSync(b)) - Number(fs.existsSync(a)));
  }
  return [path.join(os.homedir(), ...SAVE_SUBDIR)];
}

export function defaultSaveRoot(): string {
  return defaultSaveRoots()[0];
}

function describe(file: string): SaveInfo {
  const st = fs.statSync(file);
  const name = path.basename(file);
  const m = /^(.*?)(?: - (.+?))? - (LOC_\w+|[^-]+?), Level (\d+)\.sav$/i.exec(name);
  return {
    path: file,
    fileName: name,
    folder: path.dirname(file),
    size: st.size,
    modifiedMs: st.mtimeMs,
    isAuto: /^(autosave|quicksave)/i.test(name),
    isBackup: file.includes(`${path.sep}${BACKUP_DIR}${path.sep}`),
    guess: m ? { title: m[1], character: m[2] ?? null, location: m[3], level: Number(m[4]) } : null,
  };
}

export function scanFolders(roots: string[]): SaveFolderScan {
  const saves: SaveInfo[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.sav') && !/^(saves_meta|Save_Settings)\.sav$/i.test(entry.name)) saves.push(describe(path.join(root, entry.name)));
    }
  }
  saves.sort((a, b) => b.modifiedMs - a.modifiedMs);
  const existing = roots.filter((r) => fs.existsSync(r));
  return { root: existing[0] ?? roots[0], roots, exists: existing.length > 0, saves, platform: process.platform };
}

export function readSave(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(file));
}

function backupPathFor(filePath: string): string {
  const dir = path.join(path.dirname(filePath), BACKUP_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `${path.basename(filePath, '.sav')}.${stamp}.sav`);
}

export function writeSave(filePath: string, data: Uint8Array): WriteResult {
  try {
    const backupPath = fs.existsSync(filePath) ? backupPathFor(filePath) : undefined;
    if (backupPath) fs.copyFileSync(filePath, backupPath);
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, filePath);
    return { ok: true, backupPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
