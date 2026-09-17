import { useMemo, useState } from 'react';
import type { EditorProps } from '../App';
import { NumberField, PageHead } from '../components/common';
import { deathCounts, gameDays, globals, setDeathCount, setGameDays, setGlobal } from '../lib/editor';

const MONTHS = ["Morning Star", "Sun's Dawn", 'First Seed', "Rain's Hand", 'Second Seed', 'Midyear', "Sun's Height", 'Last Seed', 'Hearthfire', 'Frostfall', "Sun's Dusk", 'Evening Star'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function calendar(days: number): string {
  // the game starts on the 27th of Last Seed, 3E433; gameDays counts from 1.0 there
  const dayIdx = Math.floor(days) - 1;
  const start = MONTH_DAYS.slice(0, 7).reduce((a, b) => a + b, 0) + 26; // day-of-year of 27 Last Seed
  let doy = start + dayIdx;
  let year = 433;
  while (doy >= 365) { doy -= 365; year++; }
  let m = 0;
  while (doy >= MONTH_DAYS[m]) { doy -= MONTH_DAYS[m]; m++; }
  const hour = (days - Math.floor(days)) * 24;
  return `${doy + 1} ${MONTHS[m]}, 3E${year} · ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
}

export function World({ db, session, mutate, tick }: EditorProps): JSX.Element {
  const [q, setQ] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => globals(session, db), [session, db, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deaths = useMemo(() => deathCounts(session), [session, tick]);
  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.key.includes(needle));
  const days = gameDays(session);
  const t = session.ess;

  return (
    <>
      <PageHead title="World" sub={db.locationName(t.pcLocation)} subtitle={`Position ${t.pcX.toFixed(0)}, ${t.pcY.toFixed(0)}, ${t.pcZ.toFixed(0)} · ${t.deathCounts.length} kill counters · ${t.records.length.toLocaleString('en-US')} change records`} />
      <div className="grid" style={{ gridTemplateColumns: '360px 1fr' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Game time</h3>
            <div className="stat-row">
              <span>Calendar</span>
              <b>{calendar(days)}</b>
            </div>
            <label className="field" style={{ marginTop: 8 }}>
              <span className="lbl">Days since the start</span>
              <NumberField value={days} onChange={(v) => mutate((s) => setGameDays(s, v))} min={0} max={100000} float step={1} />
              <span className="hint">Fractional part is the time of day (0.5 = noon). Vendors restock and cells reset on their own timers relative to this.</span>
            </label>
            <div className="quick">
              <button className="chip" onClick={() => mutate((s) => setGameDays(s, Math.floor(gameDays(s)) + 0.25))}>
                06:00
              </button>
              <button className="chip" onClick={() => mutate((s) => setGameDays(s, Math.floor(gameDays(s)) + 0.5))}>
                Noon
              </button>
              <button className="chip" onClick={() => mutate((s) => setGameDays(s, gameDays(s) + 3))}>
                +3 days (respawn)
              </button>
            </div>
          </div>
          <div className="card">
            <h3>Kills</h3>
            <div className="hint" style={{ marginBottom: 6 }}>
              Death counters per base creature / NPC. Some quests and dialogue check these.
            </div>
            <div className="row-list" style={{ maxHeight: 420, overflow: 'auto' }}>
              {deaths
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((d) => (
                  <div key={d.key} className="stat-line">
                    <span className="nm" style={{ width: 'auto', flex: 1 }} title={d.key}>
                      {db.actorName(d.key)}
                      <small>{d.key}</small>
                    </span>
                    <NumberField value={d.count} onChange={(v) => mutate((s) => setDeathCount(s, d.key, v))} min={0} max={65535} className="compact" />
                  </div>
                ))}
            </div>
          </div>
        </div>
        <div className="card">
          <h3>
            Globals
            <span className="right">
              <div className="search" style={{ width: 240 }}>
                <input placeholder="Filter globals…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </span>
          </h3>
          <div className="hint" style={{ marginBottom: 8 }}>
            Global variables tracked by the save: quest stages and counters, timescale, prices. Names come from the plugins' editor ids.
          </div>
          <div style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Form</th>
                  <th style={{ width: 200 }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.key}>
                    <td className="name">{r.name}</td>
                    <td className="mono">{r.key}</td>
                    <td>
                      <NumberField value={r.value} onChange={(v) => mutate((s) => setGlobal(s, r.key, v))} float={r.type === 'f'} className="w" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
