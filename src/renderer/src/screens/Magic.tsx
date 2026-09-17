import { useMemo, useState } from 'react';
import type { EditorProps } from '../App';
import { SCHOOL_COLOR, SPELL_LEVELS } from '../gamedata';
import { PageHead } from '../components/common';
import { ListPicker } from '../components/ListPicker';
import { addSpell, removeSpell, spellKeys } from '../lib/editor';

const TYPE_ORDER = ['Spell', 'Power', 'Lesser Power', 'Ability', 'Disease', 'Poison'];
const TYPE_PLURAL: Record<string, string> = { Spell: 'Spells', Power: 'Greater powers', 'Lesser Power': 'Lesser powers', Ability: 'Abilities', Disease: 'Diseases', Poison: 'Poisons' };

export function Magic({ db, session, mutate, notify, tick }: EditorProps): JSX.Element {
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keys = useMemo(() => spellKeys(session), [session, tick]);
  const known = new Set(keys);
  const needle = q.trim().toLowerCase();
  const rows = keys
    .map((k) => ({ k, sp: db.spell(k) }))
    .filter((r) => !needle || (r.sp?.n ?? r.k).toLowerCase().includes(needle) || (r.sp?.e ?? '').toLowerCase().includes(needle));
  const groups = TYPE_ORDER.map((t) => ({ t, rows: rows.filter((r) => (r.sp?.st ?? 'Spell') === t) })).filter((g) => g.rows.length);
  const other = rows.filter((r) => r.sp && !TYPE_ORDER.includes(r.sp.st ?? 'Spell'));

  const plugins = new Set(session.ess.plugins.map((p) => p.toLowerCase()));
  const pickRows = useMemo(
    () =>
      db.data.spells
        .filter((s) => plugins.has(s.k.split('|')[0].toLowerCase()) && !known.has(s.k) && !s.n.startsWith('LOC_') && !/^(test|aaa|zz)/i.test(s.e))
        .map((s) => ({ key: s.k, name: s.n, sub: `${s.st ?? 'Spell'}${s.school ? ` · ${s.school}` : ''}${s.lvl !== undefined ? ` · ${SPELL_LEVELS[s.lvl] ?? ''}` : ''} · ${s.cost ?? 0} magicka · ${s.e}`, group: (s.st ?? 'Spell') === 'Spell' ? (s.school ?? 'Other') : (s.st ?? 'Other'), color: SCHOOL_COLOR[s.school ?? ''] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, tick, session],
  );

  const addAllOf = (pred: (s: import('../gamedata').GameSpell) => boolean, label: string): void => {
    mutate((s) => {
      let n = 0;
      for (const sp of db.data.spells) if (pred(sp) && plugins.has(sp.k.split('|')[0].toLowerCase()) && !known.has(sp.k)) { addSpell(s, sp.k); n++; }
      notify(`Added ${n} ${label}`, 'ok');
    });
  };

  return (
    <>
      <PageHead
        title="Spells & powers"
        sub={`${keys.length} known`}
        actions={
          <>
            <div className="search" style={{ width: 220 }}>
              <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn primary" onClick={() => setPicker(true)}>
              + Add spell
            </button>
          </>
        }
      />
      <div className="quick" style={{ marginBottom: 14 }}>
        {Object.keys(SCHOOL_COLOR).map((school) => (
          <button key={school} className="chip" style={{ color: SCHOOL_COLOR[school] }} onClick={() => addAllOf((s) => s.school === school && (s.st ?? 'Spell') === 'Spell' && !!s.n && !s.n.startsWith('LOC_') && !/^(test|aaa|zz)/i.test(s.e), `${school} spells`)}>
            + all {school}
          </button>
        ))}
      </div>
      <div className="grid auto">
        {groups.map((g) => (
          <div key={g.t} className="card">
            <h3>
              {TYPE_PLURAL[g.t] ?? g.t} <span className="right">{g.rows.length}</span>
            </h3>
            <div className="row-list">
              {g.rows.map((r) => (
                <SpellRow key={r.k} k={r.k} sp={r.sp} onRemove={() => mutate((s) => removeSpell(s, r.k))} />
              ))}
            </div>
          </div>
        ))}
        {other.length > 0 && (
          <div className="card">
            <h3>Other</h3>
            <div className="row-list">
              {other.map((r) => (
                <SpellRow key={r.k} k={r.k} sp={r.sp} onRemove={() => mutate((s) => removeSpell(s, r.k))} />
              ))}
            </div>
          </div>
        )}
        {rows.some((r) => !r.sp) && (
          <div className="card">
            <h3>Unknown forms</h3>
            <div className="row-list">
              {rows.filter((r) => !r.sp).map((r) => (
                <SpellRow key={r.k} k={r.k} sp={undefined} onRemove={() => mutate((s) => removeSpell(s, r.k))} />
              ))}
            </div>
          </div>
        )}
      </div>
      {picker && (
        <ListPicker
          title="Add a spell"
          rows={pickRows}
          groups={[...Object.keys(SCHOOL_COLOR), 'Power', 'Lesser Power', 'Ability', 'Disease']}
          onPick={(k) => {
            mutate((s) => addSpell(s, k));
            notify(`Learned ${db.spellName(k)}`, 'ok');
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}

function SpellRow({ k, sp, onRemove }: { k: string; sp: import('../gamedata').GameSpell | undefined; onRemove: () => void }): JSX.Element {
  return (
    <div className="row">
      <span className="dot" style={{ width: 8, height: 8, borderRadius: 2, background: SCHOOL_COLOR[sp?.school ?? ''] ?? '#777', flex: 'none' }} />
      <span className="t">
        {sp?.n ?? k}
        <small>
          {sp?.school ?? ''}
          {sp?.lvl !== undefined ? ` · ${SPELL_LEVELS[sp.lvl] ?? ''}` : ''}
          {sp?.cost !== undefined ? ` · ${sp.cost} magicka` : ''} · {sp?.e ?? k}
        </small>
      </span>
      <button className="icon-btn" title="Forget" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}
