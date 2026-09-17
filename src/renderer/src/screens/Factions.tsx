import { useMemo, useState } from 'react';
import type { EditorProps } from '../App';
import { PageHead } from '../components/common';
import { ListPicker } from '../components/ListPicker';
import { addFaction, factions, removeFaction, setFactionRank } from '../lib/editor';

export function Factions({ db, session, mutate, notify, tick }: EditorProps): JSX.Element {
  const [picker, setPicker] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => factions(session), [session, tick]);
  const known = new Set(rows.map((r) => r.key));
  const plugins = new Set(session.ess.plugins.map((p) => p.toLowerCase()));
  const pickRows = useMemo(
    () =>
      db.data.factions
        .filter((f) => plugins.has(f.k.split('|')[0].toLowerCase()) && !known.has(f.k))
        .map((f) => ({ key: f.k, name: f.n, sub: `${f.ranks.filter(Boolean).length ? f.ranks.filter(Boolean).join(' › ') : 'no ranks'} · ${f.e}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, tick, session],
  );

  return (
    <>
      <PageHead
        title="Factions"
        sub={`${rows.length} memberships`}
        subtitle="Rank -1 means expelled; ranks count from 0. Guilds unlock quests by rank, so jumping to the top can skip storylines."
        actions={
          <button className="btn primary" onClick={() => setPicker(true)}>
            + Join faction
          </button>
        }
      />
      <div className="grid auto">
        {rows.map((r) => {
          const f = db.faction(r.key);
          const ranks = f?.ranks ?? [];
          return (
            <div key={r.key} className="card">
              <h3>
                {f?.n ?? r.key}
                <span className="right">
                  <button className="icon-btn" title="Leave" onClick={() => mutate((s) => removeFaction(s, r.key))}>
                    ✕
                  </button>
                </span>
              </h3>
              <div className="hint" style={{ marginBottom: 8 }}>
                {f?.e ?? ''} · {r.key}
              </div>
              <select className="text-input" value={r.rank} onChange={(e) => mutate((s) => setFactionRank(s, r.key, Number(e.target.value)))}>
                <option value={-1}>Expelled (-1)</option>
                {(ranks.length ? ranks : new Array(10).fill('')).map((name, i) => (
                  <option key={i} value={i}>
                    {i}: {name || `Rank ${i}`}
                  </option>
                ))}
                {r.rank >= (ranks.length || 10) && <option value={r.rank}>{r.rank}</option>}
              </select>
            </div>
          );
        })}
        {!rows.length && <div className="empty">Not a member of anything yet.</div>}
      </div>
      {picker && (
        <ListPicker
          title="Join a faction"
          rows={pickRows}
          onPick={(k) => {
            mutate((s) => addFaction(s, k, 0));
            notify(`Joined ${db.factionName(k)}`, 'ok');
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}
