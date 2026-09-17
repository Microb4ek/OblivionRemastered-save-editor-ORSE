import { useMemo, useState } from 'react';
import { PROP } from '@shared/ess';
import type { InvEntry } from '@shared/ess';
import type { EditorProps } from '../App';
import { ITEM_TYPES, ITEM_TYPE_COLOR, ITEM_TYPE_LABEL, SOUL_LEVELS } from '../gamedata';
import type { GameDb, GameItem, ItemType } from '../gamedata';
import { ItemIcon, NumberField, Toggle } from '../components/common';
import { ItemPicker, itemSub } from '../components/ItemPicker';
import { addItem, ensureEntry, entryByte, entryFloat, entryHas, entryOpaqueProps, inventory, removeEntry, removeItem, setEntryByte, setEntryFlag, setEntryFloat, setItemCount } from '../lib/editor';
import type { InvRow } from '../lib/editor';

export function Inventory({ db, session, mutate, notify, tick }: EditorProps): JSX.Element {
  const [type, setType] = useState<ItemType | 'all'>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [showGone, setShowGone] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => inventory(session, db), [session, db, tick]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) {
      if (r.count <= 0) continue;
      const t = db.item(r.key)?.t ?? 'misc';
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [rows, db]);
  const weight = rows.reduce((a, r) => a + (db.item(r.key)?.w ?? 0) * Math.max(0, r.count), 0);

  const needle = q.trim().toLowerCase();
  const visible = rows.filter((r) => {
    const it = db.item(r.key);
    if (r.count <= 0 && !showGone) return false;
    if (type !== 'all' && (it?.t ?? 'misc') !== type) return false;
    if (needle) {
      const nm = (it?.n ?? r.key).toLowerCase();
      if (!nm.includes(needle) && !(it?.e ?? '').toLowerCase().includes(needle)) return false;
    }
    return true;
  });
  const groups = ITEM_TYPES.map((t) => ({ t, rows: visible.filter((r) => db.item(r.key)?.t === t) })).filter((g) => g.rows.length);
  const unknown = visible.filter((r) => !db.item(r.key));
  const selected = sel ? (rows.find((r) => r.key === sel) ?? null) : null;

  const pick = (key: string, count: number): void => {
    mutate((s) => {
      const row = addItem(s, db, key, count);
      setSel(row.key);
      setType('all');
      setQ('');
      notify(`Added ${count} × ${db.itemName(key)}`, 'ok');
    });
    setPicker(false);
  };

  return (
    <div className="inv">
      <div className="list">
        <button className={`cont-btn ${type === 'all' ? 'active' : ''}`} onClick={() => setType('all')}>
          Everything
          <span className="n">{rows.filter((r) => r.count > 0).length}</span>
        </button>
        <div className="group">Categories</div>
        {ITEM_TYPES.map((t) => (
          <button key={t} className={`cont-btn ${type === t ? 'active' : ''}`} onClick={() => setType(t)} disabled={!counts[t]} style={{ opacity: counts[t] ? 1 : 0.4 }}>
            <span className="dot" style={{ width: 8, height: 8, borderRadius: 2, background: ITEM_TYPE_COLOR[t] }} />
            {ITEM_TYPE_LABEL[t]}
            <span className="n">{counts[t] ?? 0}</span>
          </button>
        ))}
        <div className="group">Weight</div>
        <div className="hint" style={{ padding: '0 10px' }}>
          Carrying <b style={{ color: 'var(--text)' }}>{weight.toFixed(1)}</b> · the limit is 5 × Strength.
        </div>
        <div className="group">Removed starting items</div>
        <div style={{ padding: '0 10px' }}>
          <Toggle on={showGone} onChange={setShowGone} label="Show" />
        </div>
      </div>

      <div className="stage">
        <div className="stage-head">
          <h2>{type === 'all' ? 'Inventory' : ITEM_TYPE_LABEL[type]}</h2>
          <span className="hint">{visible.length} stacks</span>
          <div className="actions">
            <div className="search">
              <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn primary" onClick={() => setPicker(true)}>
              + Add item
            </button>
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.t}>
            <div className="section-title" style={{ color: ITEM_TYPE_COLOR[g.t] }}>
              {ITEM_TYPE_LABEL[g.t]} <span className="count">{g.rows.length}</span>
            </div>
            <div className="tiles">
              {g.rows.map((r) => (
                <Tile key={r.key} r={r} db={db} selected={sel === r.key} onClick={() => setSel(r.key)} />
              ))}
            </div>
          </div>
        ))}
        {unknown.length > 0 && (
          <div>
            <div className="section-title">
              Unknown forms <span className="count">{unknown.length}</span>
            </div>
            <div className="tiles">
              {unknown.map((r) => (
                <Tile key={r.key} r={r} db={db} selected={sel === r.key} onClick={() => setSel(r.key)} />
              ))}
            </div>
          </div>
        )}
        {!visible.length && <div className="empty">Nothing here.</div>}
      </div>

      <div className="side">{selected ? <Details r={selected} db={db} mutate={mutate} onRemoved={() => setSel(null)} /> : <div className="empty">Select an item to edit its count, condition or charge.</div>}</div>

      {picker && <ItemPicker db={db} title="Add an item" plugins={session.ess.plugins} onPick={pick} onClose={() => setPicker(false)} />}
    </div>
  );
}

function Tile({ r, db, selected, onClick }: { r: InvRow; db: GameDb; selected: boolean; onClick: () => void }): JSX.Element {
  const it = db.item(r.key);
  const equipped = r.entries.some((e) => entryHas(e, PROP.equipped) || entryHas(e, PROP.equippedRing));
  const maxH = it?.h ?? 0;
  const h = r.entries.length ? entryFloat(r.entries[0], PROP.health) : null;
  return (
    <button className={`tile ${selected ? 'selected' : ''} ${r.count <= 0 ? 'gone' : ''}`} onClick={onClick} title={`${it?.n ?? r.key}\n${r.count} in inventory`}>
      <ItemIcon db={db} itemKey={r.key} size={64} count={r.count} equipped={equipped} />
      {maxH > 0 && h !== null && (
        <span className="dura">
          <i style={{ width: `${Math.max(0, Math.min(100, (h / maxH) * 100))}%` }} />
        </span>
      )}
    </button>
  );
}

function Details({ r, db, mutate, onRemoved }: { r: InvRow; db: GameDb; mutate: EditorProps['mutate']; onRemoved: () => void }): JSX.Element {
  const it = db.item(r.key);
  const ench = db.enchantName(it?.ench);
  const enchDef = it?.ench ? db.data.enchantments[it.ench] : undefined;
  return (
    <>
      <div className="item-head">
        <ItemIcon db={db} itemKey={r.key} size={64} />
        <div>
          <h2>{it?.n ?? 'Unknown form'}</h2>
          <small>
            {it?.e ?? ''} · {r.key}
          </small>
        </div>
      </div>
      {it && (
        <div className="stat-row">
          <span>{itemSub(it)}</span>
          <b>{it.w ?? 0} wt</b>
        </div>
      )}
      {ench && (
        <div className="notice info">
          Enchanted: <b>{ench}</b>
          {enchDef?.charge ? ` · ${enchDef.charge} charge` : ''}
        </div>
      )}
      <label className="field">
        <span className="lbl">Count</span>
        <NumberField value={r.count} onChange={(v) => mutate((s) => setItemCount(s, r, v))} min={0} max={1_000_000} big />
        {r.base > 0 && <span className="hint">The base actor starts with {r.base}; the save stores the difference.</span>}
      </label>
      <div className="quick">
        {[5, 10, 100].map((n) => (
          <button key={n} className="chip" onClick={() => mutate((s) => setItemCount(s, r, r.count + n))}>
            +{n}
          </button>
        ))}
        <button className="chip" onClick={() => mutate((s) => setItemCount(s, r, 1))}>
          = 1
        </button>
      </div>

      <div className="section-title">
        Instances <span className="count">{r.entries.length}</span>
      </div>
      <div className="hint">Items with their own condition, charge, soul or equipped state get an entry each; the rest of the stack is pristine.</div>
      {r.entries.map((e, i) => (
        <EntryCard key={i} e={e} i={i} r={r} it={it} mutate={mutate} />
      ))}
      {!r.entries.length && r.count > 0 && (
        <button className="btn ghost block" onClick={() => mutate((s) => ensureEntry(s, r))}>
          Add a condition / charge entry
        </button>
      )}

      <div style={{ marginTop: 'auto' }}>
        <button
          className="btn danger block"
          onClick={() =>
            mutate((s) => {
              removeItem(s, r);
              onRemoved();
            })
          }
        >
          Remove from inventory
        </button>
      </div>
    </>
  );
}

function EntryCard({ e, i, r, it, mutate }: { e: InvEntry; i: number; r: InvRow; it: GameItem | undefined; mutate: EditorProps['mutate'] }): JSX.Element {
  const health = entryFloat(e, PROP.health);
  const charge = entryFloat(e, PROP.charge);
  const soul = entryByte(e, PROP.soul);
  const uses = entryByte(e, PROP.uses);
  const equipped = entryHas(e, PROP.equipped) || entryHas(e, PROP.equippedRing);
  // biped slots 0x40 (ring left) 0x80 (ring right) 0x100 (amulet) use the second "equipped" property code
  const isRing = it?.t === 'clothing' && !!(it.slots && it.slots & 0x1c0);
  const maxH = it?.h ?? 0;
  const opaque = entryOpaqueProps(e);
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="stat-row" style={{ paddingTop: 0 }}>
        <span>Instance {i + 1}</span>
        <Toggle
          on={equipped}
          onChange={(on) =>
            mutate(() => {
              setEntryFlag(e, isRing ? PROP.equippedRing : PROP.equipped, on);
              if (!on) setEntryFlag(e, isRing ? PROP.equipped : PROP.equippedRing, false);
            })
          }
          label="Equipped"
        />
      </div>
      {(it?.t === 'weapon' || it?.t === 'armor' || health !== null) && (
        <label className="field" style={{ marginTop: 8 }}>
          <span className="lbl">Condition {maxH ? `(max ${maxH})` : ''}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <NumberField value={health ?? maxH} onChange={(v) => mutate(() => setEntryFloat(e, PROP.health, v))} min={0} max={100000} float />
            <button className="chip" onClick={() => mutate(() => setEntryFloat(e, PROP.health, null))} title="Remove the override: the item is as new">
              Reset
            </button>
          </div>
          {health !== null && maxH > 0 && (
            <div className="meter">
              <i style={{ width: `${Math.min(100, (health / maxH) * 100)}%`, background: health / maxH < 0.3 ? 'var(--crimson-2)' : 'var(--green)' }} />
            </div>
          )}
        </label>
      )}
      {(it?.ench || charge !== null) && (
        <label className="field" style={{ marginTop: 8 }}>
          <span className="lbl">Enchantment charge spent</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <NumberField value={charge ?? 0} onChange={(v) => mutate(() => setEntryFloat(e, PROP.charge, v))} min={0} max={100000} float />
            <button className="chip" onClick={() => mutate(() => setEntryFloat(e, PROP.charge, null))} title="Full charge">
              Full
            </button>
          </div>
          <span className="hint">The save stores how much charge has been used; 0 or no entry means fully charged.</span>
        </label>
      )}
      {(it?.t === 'soulgem' || soul !== null) && (
        <label className="field" style={{ marginTop: 8 }}>
          <span className="lbl">Captured soul</span>
          <select className="text-input" value={soul ?? 0} onChange={(ev) => mutate(() => setEntryByte(e, PROP.soul, Number(ev.target.value) || null))}>
            {SOUL_LEVELS.map((n, k) => (
              <option key={n} value={k} disabled={!!it?.cap && k > it.cap}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      {uses !== null && (
        <label className="field" style={{ marginTop: 8 }}>
          <span className="lbl">Uses left</span>
          <NumberField value={uses} onChange={(v) => mutate(() => setEntryByte(e, PROP.uses, v))} min={0} max={255} />
        </label>
      )}
      {opaque.length > 0 && (
        <div className="hint" style={{ marginTop: 8 }}>
          Other properties kept as-is: {opaque.map((p) => `0x${p.code.toString(16)}`).join(', ')}
        </div>
      )}
      <button className="chip" style={{ marginTop: 10 }} onClick={() => mutate((s) => removeEntry(s, r, e))}>
        Drop this entry
      </button>
    </div>
  );
}
