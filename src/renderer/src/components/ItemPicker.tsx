import { useMemo, useState } from 'react';
import type { GameDb, GameItem, ItemType } from '../gamedata';
import { ITEM_TYPES, ITEM_TYPE_COLOR, ITEM_TYPE_LABEL } from '../gamedata';
import { ItemIcon, NumberField, useEscape } from './common';

const PAGE = 400;

export function ItemPicker({
  db,
  title,
  plugins,
  onPick,
  onClose,
}: {
  db: GameDb;
  title: string;
  /** the save's plugin list: items from other plugins cannot be referenced */
  plugins: string[];
  onPick: (key: string, count: number) => void;
  onClose: () => void;
}): JSX.Element {
  const [q, setQ] = useState('');
  const [type, setType] = useState<ItemType | 'all'>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [count, setCount] = useState(1);
  const [limit, setLimit] = useState(PAGE);
  useEscape(onClose);

  const available = useMemo(() => {
    const set = new Set(plugins.map((p) => p.toLowerCase()));
    return db.data.items.filter((it) => set.has(it.k.split('|')[0].toLowerCase()));
  }, [db, plugins]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return available
      .filter((it) => showHidden || (it.ic && !it.del && !/^(test|aaa|zz|xx|dev)/i.test(it.e) && !/\btest\b/i.test(it.n) && !it.n.startsWith('LOC_')))
      .filter((it) => type === 'all' || it.t === type)
      .filter((it) => !needle || it.n.toLowerCase().includes(needle) || it.e.toLowerCase().includes(needle) || it.k.includes(needle))
      .sort((a, b) => a.n.localeCompare(b.n) || (a.v ?? 0) - (b.v ?? 0));
  }, [available, q, type, showHidden]);

  const typesPresent = new Set(available.map((it) => it.t));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="head">
          <h2>{title}</h2>
          <div className="search">
            <input autoFocus placeholder="Search items… (name, editor id or form id)" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          </div>
          <label className="field" style={{ width: 140 }}>
            <span className="lbl">Count</span>
            <NumberField value={count} onChange={setCount} min={1} max={100000} />
          </label>
          <label className={`toggle ${showHidden ? 'on' : ''}`} onClick={() => setShowHidden(!showHidden)}>
            <span className="sw" /> Hidden / test
          </label>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="cats">
          <button className={`chip ${type === 'all' ? 'active' : ''}`} onClick={() => setType('all')}>
            All
          </button>
          {ITEM_TYPES.filter((t) => typesPresent.has(t)).map((t) => (
            <button key={t} className={`chip ${type === t ? 'active' : ''}`} onClick={() => { setType(t); setLimit(PAGE); }} style={{ borderColor: type === t ? ITEM_TYPE_COLOR[t] : undefined }}>
              <span className="dot" style={{ background: ITEM_TYPE_COLOR[t] }} />
              {ITEM_TYPE_LABEL[t]}
            </button>
          ))}
          <span className="hint" style={{ marginLeft: 'auto' }}>
            {list.length} items
          </span>
        </div>
        <div className="items">
          {list.slice(0, limit).map((it) => (
            <button key={it.k} className="pick" onClick={() => onPick(it.k, count)} title={`${it.e}\n${it.k}${itemStats(it)}`}>
              <ItemIcon db={db} itemKey={it.k} size={60} />
              <span>{it.n}</span>
              <span className="sz">{itemSub(it)}</span>
            </button>
          ))}
          {list.length > limit && (
            <button className="btn ghost block" style={{ gridColumn: '1 / -1' }} onClick={() => setLimit(limit + PAGE)}>
              Show more ({list.length - limit} left)
            </button>
          )}
          {!list.length && <div className="empty">Nothing matches.</div>}
        </div>
      </div>
    </div>
  );
}

export function itemSub(it: GameItem): string {
  if (it.t === 'weapon') return `${it.wt ?? 'Weapon'} · dmg ${it.d ?? '?'}`;
  if (it.t === 'armor') return `AR ${it.ar ?? '?'} · ${it.v ?? 0}g`;
  if (it.t === 'soulgem') return `${['—', 'Petty', 'Lesser', 'Common', 'Greater', 'Grand'][it.cap ?? 0] ?? ''} · ${it.v ?? 0}g`;
  return `${ITEM_TYPE_LABEL[it.t]} · ${it.v ?? 0}g`;
}

function itemStats(it: GameItem): string {
  const parts: string[] = [];
  if (it.v !== undefined) parts.push(`value ${it.v}`);
  if (it.w !== undefined) parts.push(`weight ${it.w}`);
  if (it.h !== undefined) parts.push(`health ${it.h}`);
  return parts.length ? `\n${parts.join(' · ')}` : '';
}
