import { useCallback, useEffect, useState } from 'react';
import { initOodle, oodleReady } from '@shared/oodle';
import { loadGameData } from './gamedata';
import type { GameDb } from './gamedata';
import { TitleBar } from './components/TitleBar';
import { Welcome } from './screens/Welcome';
import { Character } from './screens/Character';
import { Inventory } from './screens/Inventory';
import { Magic } from './screens/Magic';
import { Factions } from './screens/Factions';
import { World } from './screens/World';
import { buildBytes, details, gold, level, openSession, validate } from './lib/editor';
import type { Session } from './lib/editor';
import { fmt } from './gamedata';

type Screen = 'character' | 'inventory' | 'magic' | 'factions' | 'world';

interface Toast {
  id: number;
  msg: string;
  detail?: string;
  kind: 'ok' | 'err' | 'info';
}

export interface EditorProps {
  db: GameDb;
  session: Session;
  /** Mutate the session in place, then re-render everything. */
  mutate: (fn: (s: Session) => void) => void;
  notify: (msg: string, kind?: 'ok' | 'err' | 'info', detail?: string) => void;
  /** re-render counter; screens use it as a memo dependency */
  tick: number;
}

const NAV: Array<{ id: Screen; label: string; icon: string }> = [
  { id: 'character', label: 'Character', icon: 'clutter__iconelvenbust.png' },
  { id: 'inventory', label: 'Inventory', icon: 'clutter__iconbasket01.png' },
  { id: 'magic', label: 'Spells', icon: 'clutter__iconwelkyndstone.png' },
  { id: 'factions', label: 'Factions', icon: 'clutter__iconthornblademedallion.png' },
  { id: 'world', label: 'World', icon: 'clutter__iconhourglass.png' },
];

export default function App(): JSX.Element {
  const [db, setDb] = useState<GameDb | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tick, setTick] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [screen, setScreen] = useState<Screen>('character');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [gd, wasmUrl] = await Promise.all([loadGameData(), window.api.wasmUrl()]);
      if (!oodleReady()) {
        const res = await fetch(wasmUrl);
        if (!res.ok) throw new Error(`failed to load the Oodle codec: ${res.status}`);
        await initOodle(new Uint8Array(await res.arrayBuffer()));
      }
      setDb(gd);
    })().catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const notify = useCallback((msg: string, kind: 'ok' | 'err' | 'info' = 'info', detail?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, detail, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 9000 : 4500);
  }, []);

  const mutate = useCallback(
    (fn: (s: Session) => void) => {
      if (!session) return;
      try {
        fn(session);
        setDirty(true);
      } catch (e) {
        notify('Edit failed', 'err', e instanceof Error ? e.message : String(e));
      }
      setTick((t) => t + 1);
    },
    [session, notify],
  );

  const open = useCallback(
    async (path: string) => {
      try {
        const raw = await window.api.readFile(path);
        const scan = await window.api.scanDefaultFolder();
        const info = scan.saves.find((s) => s.path === path) ?? null;
        const s = openSession(raw, path, info);
        setSession(s);
        setDirty(false);
        setScreen('character');
      } catch (e) {
        notify('Could not open save', 'err', e instanceof Error ? e.message : String(e));
        console.error(e);
      }
    },
    [notify],
  );

  const save = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    try {
      const problems = validate(session);
      if (problems.length) throw new Error(`The game would reject this save:\n${problems.slice(0, 6).join('\n')}`);
      const bytes = buildBytes(session);
      const res = await window.api.writeSave(session.path, bytes);
      if (res.ok) {
        setDirty(false);
        notify('Save written', 'ok', res.backupPath ? `Backup: ${res.backupPath}` : undefined);
      } else notify('Save failed - file left untouched', 'err', res.error);
    } catch (e) {
      notify('Save failed - file left untouched', 'err', e instanceof Error ? e.message : String(e));
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [session, notify]);

  const close = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes. Close this save anyway?')) return;
    if (session?.thumbUrl) URL.revokeObjectURL(session.thumbUrl);
    setSession(null);
    setDirty(false);
  }, [dirty, session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  useEffect(() => {
    // automation hook used by the debug loop (ORSE_DEBUG_DIR) and handy in devtools
    (window as unknown as { __orse: unknown }).__orse = { open, session: () => session, mutate, save };
  }, [open, session, mutate, save]);

  if (loadError) {
    return (
      <div className="app">
        <TitleBar />
        <div className="loading">Game data could not be loaded: {loadError}</div>
      </div>
    );
  }
  if (!db) {
    return (
      <div className="app">
        <TitleBar />
        <div className="loading">Loading game data…</div>
      </div>
    );
  }

  const props: EditorProps | null = session ? { db, session, mutate, notify, tick } : null;
  const d = session ? details(session) : null;

  return (
    <div className="app">
      <TitleBar fileName={session ? session.path.split(/[\\/]/).pop() : undefined} dirty={dirty} />
      {!session || !props || !d ? (
        <div className="content">
          <Welcome db={db} onOpen={open} notify={(m, k) => notify(m, k ?? 'info')} />
        </div>
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <div className="save-card">
              {session.thumbUrl && <img className="thumb" src={session.thumbUrl} alt="" />}
              <div className="title">{d.displayName}</div>
              <div className="sub" title={session.path}>
                {d.saveName} · {db.locationName(d.location)}
              </div>
              <div className="stats">
                <span className="pill" title="Gold">
                  <img src={db.iconUrl('Oblivion.esm|00000f') ?? ''} alt="" />
                  {fmt(gold(session))}
                </span>
                <span className="pill">Level {level(session)}</span>
              </div>
            </div>
            <nav className="nav">
              {NAV.map((n) => (
                <button key={n.id} className={screen === n.id ? 'active' : ''} onClick={() => setScreen(n.id)}>
                  <span className="ico">
                    <img src={`or://icons/${n.icon}`} alt="" />
                  </span>
                  {n.label}
                </button>
              ))}
            </nav>
            <div className="bottom">
              <button className="btn primary block" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
              </button>
              <button className="btn ghost block" onClick={close}>
                Close save
              </button>
              <div className="hint">
                Ctrl+S saves. A copy of the original goes to <b>ORSE-backups</b> next to the save before every write. Close the game first.
              </div>
            </div>
          </aside>
          {screen === 'inventory' ? (
            <div className="content no-pad">
              <Inventory {...props} />
            </div>
          ) : (
            <div className="content">
              {screen === 'character' && <Character {...props} />}
              {screen === 'magic' && <Magic {...props} />}
              {screen === 'factions' && <Factions {...props} />}
              {screen === 'world' && <World {...props} />}
            </div>
          )}
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <b>{t.msg}</b>
            {t.detail && <small>{t.detail}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
