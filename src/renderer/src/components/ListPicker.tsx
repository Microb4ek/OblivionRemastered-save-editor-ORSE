import { useMemo, useState } from 'react';
import { useEscape } from './common';

export interface PickRow {
  key: string;
  name: string;
  sub?: string;
  /** chip filter group */
  group?: string;
  color?: string;
}

const PAGE = 300;

export function ListPicker({ title, rows, groups, onPick, onClose }: { title: string; rows: PickRow[]; groups?: string[]; onPick: (key: string) => void; onClose: () => void }): JSX.Element {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  useEscape(onClose);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (group === 'all' || r.group === group) && (!needle || r.name.toLowerCase().includes(needle) || (r.sub ?? '').toLowerCase().includes(needle) || r.key.includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, q, group]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="head">
          <h2>{title}</h2>
          <div className="search">
            <input autoFocus placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        {groups && (
          <div className="cats">
            <button className={`chip ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}>
              All
            </button>
            {groups.map((g) => (
              <button key={g} className={`chip ${group === g ? 'active' : ''}`} onClick={() => { setGroup(g); setLimit(PAGE); }}>
                {g}
              </button>
            ))}
            <span className="hint" style={{ marginLeft: 'auto' }}>
              {list.length} entries
            </span>
          </div>
        )}
        <div className="list-items">
          {list.slice(0, limit).map((r) => (
            <button key={r.key} className="row click" onClick={() => onPick(r.key)}>
              {r.color && <span className="dot" style={{ background: r.color }} />}
              <span className="t">
                {r.name}
                <small>{r.sub ?? r.key}</small>
              </span>
            </button>
          ))}
          {list.length > limit && (
            <button className="btn ghost block" onClick={() => setLimit(limit + PAGE)}>
              Show more ({list.length - limit} left)
            </button>
          )}
          {!list.length && <div className="empty">Nothing matches.</div>}
        </div>
      </div>
    </div>
  );
}
