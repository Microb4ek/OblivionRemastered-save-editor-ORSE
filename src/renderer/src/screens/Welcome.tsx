import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveFolderScan, SaveInfo } from '@shared/ipc';
import type { GameDb } from '../gamedata';
import { peekSave } from '../lib/editor';
import type { Peek } from '../lib/editor';
import { fmtDuration } from '../components/common';

/** details decoded from the saves themselves (name, level, location, thumbnail); persists across screen changes */
const peekCache = new Map<string, Peek | 'bad'>();

function fmtSize(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Welcome({ db, onOpen, notify }: { db: GameDb; onOpen: (path: string) => void; notify: (msg: string, kind?: 'ok' | 'err' | 'info') => void }): JSX.Element {
  const [scan, setScan] = useState<SaveFolderScan | null>(null);
  const [showBackups, setShowBackups] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setScan(await window.api.scanDefaultFolder());
    } catch (e) {
      notify('Could not scan the save folder', 'err');
      console.error(e);
    }
  }, [notify]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // decode the slot details of each listed save in the background, newest first
  const [, bump] = useState(0);
  const peeking = useRef(false);
  useEffect(() => {
    if (!scan || peeking.current) return;
    const todo = scan.saves.filter((s) => !s.isBackup && !peekCache.has(s.path)).map((s) => s.path);
    if (!todo.length) return;
    peeking.current = true;
    (async () => {
      for (const p of todo) {
        try {
          const key = `${p}`;
          peekCache.set(key, peekSave(await window.api.readFile(p)));
        } catch (e) {
          console.warn('peek failed', p, e);
          peekCache.set(p, 'bad');
        }
        bump((n) => n + 1);
      }
    })().finally(() => {
      peeking.current = false;
    });
  }, [scan]);

  const browse = async (): Promise<void> => {
    const p = await window.api.openDialog();
    if (p) onOpen(p);
  };

  const saves = (scan?.saves ?? []).filter((s) => showBackups || !s.isBackup);
  const isLinux = scan?.platform === 'linux';

  return (
    <div className="welcome">
      <div className="hero">
        <div className="logo">
          <img src="or://icons/clutter__icongold.png" alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
        </div>
        <div>
          <h1>Oblivion Remastered Save Editor</h1>
          <p>Level, attributes, skills, gold, inventory, spells, factions and world globals — edited straight inside the .sav container.</p>
        </div>
      </div>

      <div className="welcome-grid">
        <div className="card">
          <h3>Your saves</h3>
          <div className="path-box">
            <span title={scan?.roots.join('\n')}>{scan?.root ?? '…'}</span>
            <button className="btn small ghost" onClick={() => scan && window.api.openPath(scan.root)} disabled={!scan?.exists}>
              Open folder
            </button>
            <button className="btn small ghost" onClick={refresh}>
              Refresh
            </button>
          </div>
          {scan && !scan.exists && (
            <div className="notice warn" style={{ marginTop: 10 }}>
              The default save folder was not found. {isLinux ? 'On SteamOS the game keeps saves inside the Proton prefix (steamapps/compatdata/2623190/pfx/…).' : 'Start the game once so it creates its save folder, or open a .sav by hand.'}
            </div>
          )}
          <div className="crumbs" style={{ justifyContent: 'space-between' }}>
            <span className="hint">
              {saves.length} save{saves.length === 1 ? '' : 's'}
              {scan?.saves.some((s) => s.isBackup) && (
                <>
                  {' · '}
                  <a onClick={() => setShowBackups(!showBackups)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                    {showBackups ? 'hide backups' : 'show backups'}
                  </a>
                </>
              )}
            </span>
            <button className="btn small" onClick={browse}>
              Open a .sav file…
            </button>
          </div>
          <div className="saves-list" style={{ marginTop: 10, maxHeight: 'calc(100vh - 330px)', overflow: 'auto' }}>
            {saves.map((s) => (
              <SaveRow key={s.path} s={s} db={db} onOpen={onOpen} />
            ))}
            {scan && !saves.length && <div className="empty">No saves found here yet.</div>}
          </div>
        </div>

        <div className="card">
          <h3>How it works</h3>
          <div className="steps">
            <div className="step">
              <span className="n">1</span>
              <div className="body">
                <b>Quit the game</b>
                <p>Oblivion Remastered keeps its save list in memory; edits made while it runs get overwritten. Pick a save from the list on the left.</p>
              </div>
            </div>
            <div className="step">
              <span className="n">2</span>
              <div className="body">
                <b>Edit</b>
                <p>Character (level, attributes, skills, gold, bounty), Inventory with the real item icons, Spells, Factions and the game's Globals. Item counts, health and charges are all editable.</p>
              </div>
            </div>
            <div className="step">
              <span className="n">3</span>
              <div className="body">
                <b>Save</b>
                <p>
                  <kbd>Ctrl</kbd>+<kbd>S</kbd> re-packs the Oblivion save, recompresses the container with Oodle and writes it back. The original is copied to <b>ORSE-backups</b> next to it first.
                </p>
              </div>
            </div>
            <div className="step">
              <span className="n">4</span>
              <div className="body">
                <b>Load in-game</b>
                <p>The save keeps its name, thumbnail and slot. Skills raised here do not level you up by themselves — set the level directly if you want it changed.</p>
              </div>
            </div>
          </div>
          <div className="notice info" style={{ marginTop: 16 }}>
            {isLinux ? 'SteamOS / Steam Deck: switch to Desktop mode, run the AppImage, and the Proton save folder is found automatically.' : 'Works with Steam saves on Windows; on SteamOS the Proton prefix is scanned automatically.'}
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveRow({ s, db, onOpen }: { s: SaveInfo; db: GameDb; onOpen: (p: string) => void }): JSX.Element {
  const g = s.guess;
  const peek = peekCache.get(s.path);
  const p = peek && peek !== 'bad' ? peek : null;
  const bad = peek === 'bad';
  const title = p?.saveName || g?.title || s.fileName.replace(/\.sav$/i, '').replace(/ \([0-9a-f-]{36}\)$/i, '');
  const character = p?.displayName || g?.character || null;
  const level = p?.level || g?.level || 0;
  const location = p?.location || g?.location || '';
  const slot = /^autosave/i.test(s.fileName) ? 'AUTO' : /^quicksave/i.test(s.fileName) ? 'QUICK' : (/save\s*(\d+)/i.exec(s.fileName)?.[1] ?? '•');
  return (
    <button className={`save-row ${bad ? 'broken' : ''}`} onClick={() => !bad && onOpen(s.path)} title={s.path}>
      {p?.thumbUrl ? (
        <img className="slot thumb" src={p.thumbUrl} alt="" />
      ) : (
        <span className={`slot ${s.isAuto ? 'auto' : ''}`}>
          <small>SLOT</small>
          {slot}
        </span>
      )}
      <span className="info">
        <span className="name">
          {character ?? title}
          {level > 0 && <span className="tag gold">Level {level}</span>}
          {s.isAuto && <span className="tag">{slot}</span>}
          {s.isBackup && <span className="tag warn">backup</span>}
          {bad && <span className="tag warn">unreadable</span>}
        </span>
        <span className="meta">
          {location ? <span>{db.locationName(location)}</span> : null}
          {p ? <span>{fmtDuration(p.playTimeSeconds)} played</span> : null}
          <span>{fmtSize(s.size)}</span>
        </span>
      </span>
      <span className="right">
        <span>{fmtDate(s.modifiedMs)}</span>
        <span style={{ color: 'var(--text-3)' }}>{title.length > 30 ? `${title.slice(0, 30)}…` : title}</span>
      </span>
    </button>
  );
}
