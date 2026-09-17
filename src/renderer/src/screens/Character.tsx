import { useState } from 'react';
import { ATTRIBUTES, SKILLS } from '@shared/ess';
import type { EditorProps } from '../App';
import { Field, NumberField, PageHead, fmtDuration } from '../components/common';
import { ACTOR_VALUES, attributes, baseMods, bounty, details, gold, level, removeBaseMod, setAttribute, setBaseMod, setBounty, setGold, setLevel, setSaveName, setSkill, skills } from '../lib/editor';

const SKILL_GROUPS: Array<{ label: string; color: string; idx: number[] }> = [
  { label: 'Combat', color: '#d9865a', idx: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Magic', color: '#7fa8e8', idx: [7, 8, 9, 10, 11, 12, 13] },
  { label: 'Stealth', color: '#7fbf7f', idx: [14, 15, 16, 17, 18, 19, 20] },
];

function mastery(v: number): string {
  return v >= 100 ? 'Master' : v >= 75 ? 'Expert' : v >= 50 ? 'Journeyman' : v >= 25 ? 'Apprentice' : 'Novice';
}

export function Character({ db, session, mutate }: EditorProps): JSX.Element {
  const d = details(session);
  const attrs = attributes(session);
  const sk = skills(session);
  const mods = baseMods(session);
  const [addMod, setAddMod] = useState<number>(-1);

  return (
    <>
      <PageHead title="Character" sub={d.displayName} subtitle={<>{db.locationName(d.location)} · {fmtDuration(d.playTimeSeconds)} played · day {Math.floor(d.inGameDays)}</>} />

      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <div className="currency-card">
          <span className="glow" style={{ background: 'var(--gold)' }} />
          <div className="head">
            <img src={db.iconUrl('Oblivion.esm|00000f') ?? ''} alt="" style={{ width: 30, height: 30 }} />
            <div>
              <h4>Gold</h4>
              <small>Septims in the inventory</small>
            </div>
          </div>
          <NumberField big value={gold(session)} onChange={(v) => mutate((s) => setGold(s, v))} min={0} max={2_000_000_000} step={100} />
          <div className="quick">
            {[1000, 10000, 100000].map((n) => (
              <button key={n} className="chip" onClick={() => mutate((s) => setGold(s, gold(s) + n))}>
                +{n.toLocaleString('en-US')}
              </button>
            ))}
          </div>
        </div>
        <div className="currency-card">
          <span className="glow" style={{ background: 'var(--teal)' }} />
          <div className="head">
            <div>
              <h4>Level</h4>
              <small>Written to the actor, the save header and the slot details</small>
            </div>
          </div>
          <NumberField big value={level(session)} onChange={(v) => mutate((s) => setLevel(s, v))} min={1} max={255} />
          <div className="hint">Raising the level here does not raise attributes — edit them below. Level-ups from skill gains keep working afterwards.</div>
        </div>
        <div className="currency-card">
          <span className="glow" style={{ background: 'var(--crimson-2)' }} />
          <div className="head">
            <div>
              <h4>Bounty</h4>
              <small>Crime gold the guards want from you</small>
            </div>
          </div>
          <NumberField big value={bounty(session)} onChange={(v) => mutate((s) => setBounty(s, v))} min={0} max={1_000_000} step={10} />
          <div className="quick">
            <button className="chip" onClick={() => mutate((s) => setBounty(s, 0))}>
              Clear bounty
            </button>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', marginBottom: 14 }}>
        <div className="card">
          <h3>
            Attributes
            <span className="right">
              <button className="chip small" onClick={() => mutate((s) => ATTRIBUTES.forEach((_, i) => setAttribute(s, i, 100)))}>
                All 100
              </button>
            </span>
          </h3>
          <div className="row-list">
            {ATTRIBUTES.map((name, i) => (
              <div key={name} className="stat-line">
                <span className="nm">{name}</span>
                <div className="meter" style={{ flex: 1, marginTop: 0 }}>
                  <i style={{ width: `${Math.min(100, attrs[i])}%`, background: attrs[i] >= 100 ? 'var(--gold)' : 'var(--teal)' }} />
                </div>
                <NumberField value={attrs[i]} onChange={(v) => mutate((s) => setAttribute(s, i, v))} min={0} max={255} className="compact" />
              </div>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Base values. Health, magicka and fatigue are derived from these by the game (health also grows with level), so they update on load.
          </div>
        </div>

        <div className="card">
          <h3>
            Skills
            <span className="right">
              <button className="chip small" onClick={() => mutate((s) => SKILLS.forEach((_, i) => setSkill(s, i, 100)))}>
                All 100
              </button>
              <button className="chip small" onClick={() => mutate((s) => SKILLS.forEach((_, i) => setSkill(s, i, Math.max(sk[i], 75))))}>
                Min 75
              </button>
            </span>
          </h3>
          <div className="skill-groups">
            {SKILL_GROUPS.map((g) => (
              <div key={g.label} className="skill-group">
                <div className="section-title" style={{ color: g.color, marginTop: 0 }}>
                  {g.label}
                </div>
                {g.idx.map((i) => (
                  <div key={i} className="stat-line">
                    <span className="nm" title={mastery(sk[i])}>
                      {SKILLS[i]}
                      <small>{mastery(sk[i])}</small>
                    </span>
                    <div className="meter" style={{ flex: 1, marginTop: 0 }}>
                      <i style={{ width: `${Math.min(100, sk[i])}%`, background: sk[i] >= 100 ? 'var(--gold)' : g.color }} />
                    </div>
                    <NumberField value={sk[i]} onChange={(v) => mutate((s) => setSkill(s, i, v))} min={0} max={255} className="compact" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Save slot</h3>
          <Field label="Save name (shown in the load menu)">
            <input className="text-input" value={d.saveName} onChange={(e) => mutate((s) => setSaveName(s, e.target.value))} maxLength={60} />
          </Field>
          <div className="stat-row" style={{ marginTop: 10 }}>
            <span>Slot</span>
            <b>{d.slotName || '—'}</b>
          </div>
          <div className="stat-row">
            <span>Type</span>
            <b>{d.type || '—'}</b>
          </div>
          <div className="stat-row">
            <span>Save number</span>
            <b>{session.ess.saveNum}</b>
          </div>
          <div className="stat-row">
            <span>Plugins</span>
            <b>{session.ess.plugins.length}</b>
          </div>
          <div className="stat-row">
            <span>Change records / form ids</span>
            <b>
              {session.ess.records.length.toLocaleString('en-US')} / {session.ess.formIds.length.toLocaleString('en-US')}
            </b>
          </div>
        </div>

        <div className="card">
          <h3>
            Permanent modifiers
            <span className="right">
              <select className="text-input" style={{ width: 200, padding: '3px 6px' }} value={addMod} onChange={(e) => setAddMod(Number(e.target.value))}>
                <option value={-1}>Add a modifier…</option>
                {ACTOR_VALUES.map((n, i) => (
                  <option key={n} value={i} disabled={mods.some((m) => m.index === i)}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                className="chip small"
                disabled={addMod < 0}
                onClick={() => {
                  if (addMod >= 0) mutate((s) => setBaseMod(s, addMod, 10));
                  setAddMod(-1);
                }}
              >
                Add
              </button>
            </span>
          </h3>
          <div className="hint" style={{ marginBottom: 8 }}>
            Racial and birthsign bonuses live here as flat modifiers to actor values (e.g. Nord: Resist Frost 50). Adding <i>Health</i> or <i>Magicka</i> raises the maximum permanently.
          </div>
          {!mods.length && <div className="empty">No permanent modifiers.</div>}
          <div className="row-list">
            {mods.map((m) => (
              <div key={m.index} className="row">
                <span className="t">
                  {ACTOR_VALUES[m.index] ?? `Actor value ${m.index}`}
                  <small>index {m.index}</small>
                </span>
                <NumberField value={m.value} onChange={(v) => mutate((s) => setBaseMod(s, m.index, v))} min={-10000} max={100000} float />
                <button className="icon-btn" title="Remove" onClick={() => mutate((s) => removeBaseMod(s, m.index))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
