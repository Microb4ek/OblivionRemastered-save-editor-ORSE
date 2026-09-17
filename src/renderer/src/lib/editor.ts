/**
 * Editing session over an opened save: container + ESS + the player's NPC_ / ACHR change records.
 * Every mutation edits the parsed models in place; buildBytes() serializes the whole chain back.
 */
import { openSave, sealSave, type OrSave } from '@shared/orsave';
import { findProp, propInt, propStr, setPropInt, setPropStr, structProps, textPropString, type Prop } from '@shared/gvas';
import {
  parseEss, serializeEss, findRecord, parseNpc, serializeNpc, parseAchr, serializeAchr, irefToFormId, irefFor, formKey, formIdFromKey,
  PLAYER_BASE, PLAYER_REF, GOLD, PROP, propFloat, floatProp,
  type Ess, type ChangeRecord, type NpcRecord, type AchrRecord, type InvItem, type InvEntry, type ItemProp,
} from '@shared/ess';
import type { SaveInfo } from '@shared/ipc';
import type { GameDb } from '../gamedata';

export class EditError extends Error {}

export interface Session {
  path: string;
  info: SaveInfo | null;
  save: OrSave;
  ess: Ess;
  npcRec: ChangeRecord;
  npc: NpcRecord;
  achrRec: ChangeRecord;
  achr: AchrRecord;
  /** JPEG thumbnail from SaveGameDetails as an object URL */
  thumbUrl: string | null;
}

export function openSession(bytes: Uint8Array, path: string, info: SaveInfo | null): Session {
  const save = openSave(bytes);
  const ess = parseEss(save.ess);
  const npcRec = findRecord(ess, PLAYER_BASE, 35);
  const achrRec = findRecord(ess, PLAYER_REF, 50);
  if (!npcRec || !achrRec) throw new EditError('player records not found in the save');
  const npc = parseNpc(npcRec);
  const achr = parseAchr(achrRec);
  if (!achr.inventory) achr.inventory = [];
  let thumbUrl: string | null = null;
  const thumb = save.details ? findProp(save.details, 'SaveThumbnail') : undefined;
  if (thumb && thumb.v.kind === 'array' && thumb.v.bytes?.length) thumbUrl = URL.createObjectURL(new Blob([new Uint8Array(thumb.v.bytes).buffer as ArrayBuffer], { type: 'image/jpeg' }));
  return { path, info, save, ess, npcRec, npc, achrRec, achr, thumbUrl };
}

export interface Peek extends Details {
  thumbUrl: string | null;
}

/** Cheap-ish look at a save for the list: only the UE details block, no ESS parsing. */
export function peekSave(bytes: Uint8Array): Peek {
  const save = openSave(bytes);
  const d = save.details ?? [];
  const pt = findProp(d, 'PlayTime');
  let playTimeSeconds = 0;
  if (pt && pt.v.kind === 'struct' && pt.v.raw && pt.v.raw.length >= 8) playTimeSeconds = Number(new DataView(pt.v.raw.buffer, pt.v.raw.byteOffset).getBigInt64(0, true) / 10_000_000n);
  const type = findProp(d, 'Type');
  const thumb = findProp(d, 'SaveThumbnail');
  let thumbUrl: string | null = null;
  if (thumb && thumb.v.kind === 'array' && thumb.v.bytes?.length) thumbUrl = URL.createObjectURL(new Blob([new Uint8Array(thumb.v.bytes).buffer as ArrayBuffer], { type: 'image/jpeg' }));
  return {
    saveName: propStr(d, 'SaveName') ?? '',
    slotName: propStr(d, 'SlotName') ?? '',
    displayName: textPropString(findProp(d, 'DisplayPlayerName')) || '',
    level: propInt(d, 'PlayerLevel') ?? 0,
    location: propStr(d, 'PlayerLocation') ?? '',
    playTimeSeconds,
    inGameDays: propInt(d, 'InGameDate') ?? 0,
    type: type && type.v.kind === 'enum' ? type.v.value.s.replace(/^EVSaveType::/, '') : '',
    thumbUrl,
  };
}

/** Serialize everything back to a .sav; throws (before touching the disk) when the result does not re-open. */
export function buildBytes(s: Session): Uint8Array {
  serializeNpc(s.npcRec, s.npc);
  serializeAchr(s.achrRec, s.achr);
  const ess = serializeEss(s.ess, false);
  const check = parseEss(ess);
  if (check.records.length !== s.ess.records.length) throw new EditError('self-check failed: record count changed');
  const bytes = sealSave(s.save, ess);
  const re = openSave(bytes);
  if (re.ess.length < ess.length) throw new EditError('self-check failed: sealed save is shorter than the ESS');
  for (let i = 0; i < ess.length; i++) if (re.ess[i] !== ess[i]) throw new EditError(`self-check failed: byte ${i} differs after re-opening`);
  return bytes;
}

// ---------------------------------------------------------------- save details (UE side)
export interface Details {
  saveName: string;
  slotName: string;
  displayName: string;
  level: number;
  location: string;
  playTimeSeconds: number;
  inGameDays: number;
  type: string;
}

export function details(s: Session): Details {
  const d = s.save.details ?? [];
  const pt = findProp(d, 'PlayTime');
  let playTimeSeconds = 0;
  if (pt && pt.v.kind === 'struct' && pt.v.raw && pt.v.raw.length >= 8) playTimeSeconds = Number(new DataView(pt.v.raw.buffer, pt.v.raw.byteOffset).getBigInt64(0, true) / 10_000_000n);
  const type = findProp(d, 'Type');
  return {
    saveName: propStr(d, 'SaveName') ?? '',
    slotName: propStr(d, 'SlotName') ?? '',
    displayName: textPropString(findProp(d, 'DisplayPlayerName')) || s.ess.pcName,
    level: propInt(d, 'PlayerLevel') ?? s.ess.pcLevel,
    location: propStr(d, 'PlayerLocation') ?? s.ess.pcLocation,
    playTimeSeconds,
    inGameDays: propInt(d, 'InGameDate') ?? s.ess.gameDays,
    type: type && type.v.kind === 'enum' ? type.v.value.s.replace(/^EVSaveType::/, '') : '',
  };
}

export function setSaveName(s: Session, name: string): void {
  if (s.save.details) setPropStr(s.save.details, 'SaveName', name);
}

// ---------------------------------------------------------------- character
export function level(s: Session): number {
  return s.npc.baseData?.level ?? s.ess.pcLevel;
}

/** Level lives in three places: the NPC_ base data, the ESS header and the UE save details. */
export function setLevel(s: Session, lvl: number): void {
  const v = Math.max(1, Math.min(255, Math.round(lvl)));
  if (s.npc.baseData) s.npc.baseData.level = v;
  s.ess.pcLevel = v;
  if (s.save.details) setPropInt(s.save.details, 'PlayerLevel', v);
}

export function attributes(s: Session): number[] {
  return s.npc.attributes ?? new Array(8).fill(0);
}
export function setAttribute(s: Session, i: number, v: number): void {
  if (!s.npc.attributes) throw new EditError('this save has no attribute block on the player');
  s.npc.attributes[i] = Math.max(0, Math.min(255, Math.round(v)));
}
export function skills(s: Session): number[] {
  return s.npc.skills ?? new Array(21).fill(0);
}
export function setSkill(s: Session, i: number, v: number): void {
  if (!s.npc.skills) throw new EditError('this save has no skill block on the player');
  s.npc.skills[i] = Math.max(0, Math.min(255, Math.round(v)));
}

export function bounty(s: Session): number {
  const p = s.achr.props.find((x) => x.code === PROP.crimeGold);
  return p ? Math.round(propFloat(p)) : 0;
}
export function setBounty(s: Session, v: number): void {
  const idx = s.achr.props.findIndex((x) => x.code === PROP.crimeGold);
  if (v <= 0) {
    if (idx >= 0) s.achr.props.splice(idx, 1);
    return;
  }
  const p = floatProp(PROP.crimeGold, v);
  if (idx >= 0) s.achr.props[idx] = p;
  else s.achr.props.push(p);
}

/** Actor value indices used by the NPC_ base modifiers (race bonuses etc.). */
export const ACTOR_VALUES = [
  'Strength', 'Intelligence', 'Willpower', 'Agility', 'Speed', 'Endurance', 'Personality', 'Luck', 'Health', 'Magicka', 'Fatigue', 'Encumbrance',
  'Armorer', 'Athletics', 'Blade', 'Block', 'Blunt', 'Hand to Hand', 'Heavy Armor', 'Alchemy', 'Alteration', 'Conjuration', 'Destruction', 'Illusion', 'Mysticism', 'Restoration', 'Acrobatics', 'Light Armor', 'Marksman', 'Mercantile', 'Security', 'Sneak', 'Speechcraft',
  'Aggression', 'Confidence', 'Energy', 'Responsibility', 'Bounty', 'Fame', 'Infamy', 'Magicka Multiplier', 'Night-Eye Bonus', 'Attack Bonus', 'Defend Bonus', 'Casting Penalty', 'Blindness', 'Chameleon', 'Invisibility', 'Paralysis', 'Silence', 'Confusion', 'Detect Item Range', 'Spell Absorb Chance', 'Spell Reflect Chance', 'Swim Speed Multiplier', 'Water Breathing', 'Water Walking', 'Stunted Magicka', 'Detect Life Range', 'Reflect Damage', 'Telekinesis',
  'Resist Fire', 'Resist Frost', 'Resist Disease', 'Resist Magic', 'Resist Normal Weapons', 'Resist Paralysis', 'Resist Poison', 'Resist Shock', 'Vampirism', 'Darkness', 'Resist Water Damage',
];

export function baseMods(s: Session): Array<{ index: number; value: number }> {
  return s.npc.baseMods ?? [];
}
export function setBaseMod(s: Session, index: number, value: number): void {
  if (!s.npc.baseMods) s.npc.baseMods = [];
  const m = s.npc.baseMods.find((x) => x.index === index);
  if (m) m.value = value;
  else s.npc.baseMods.push({ index, value });
}
export function removeBaseMod(s: Session, index: number): void {
  if (s.npc.baseMods) s.npc.baseMods = s.npc.baseMods.filter((x) => x.index !== index);
}

// ---------------------------------------------------------------- inventory
export interface InvRow {
  /** index into achr.inventory */
  index: number;
  formId: number;
  key: string;
  /** actual number of items the player holds (base record count + the save's delta) */
  count: number;
  base: number;
  entries: InvEntry[];
}

function baseCount(db: GameDb, key: string): number {
  return db.data.playerBase?.[key] ?? 0;
}

export function inventory(s: Session, db: GameDb): InvRow[] {
  const out: InvRow[] = [];
  s.achr.inventory!.forEach((it, index) => {
    const formId = irefToFormId(s.ess, it.iref);
    const key = formKey(s.ess, formId);
    const base = baseCount(db, key);
    out.push({ index, formId, key, count: base + it.count, base, entries: it.entries });
  });
  return out;
}

export function gold(s: Session): number {
  const it = s.achr.inventory!.find((x) => irefToFormId(s.ess, x.iref) === GOLD);
  return it ? it.count : 0;
}
export function setGold(s: Session, v: number): void {
  const n = Math.max(0, Math.min(2_000_000_000, Math.round(v)));
  const it = s.achr.inventory!.find((x) => irefToFormId(s.ess, x.iref) === GOLD);
  if (it) it.count = n;
  else s.achr.inventory!.push({ iref: irefFor(s.ess, GOLD), count: n, entries: [] });
}

export function setItemCount(s: Session, row: InvRow, count: number): void {
  const it = s.achr.inventory![row.index];
  const n = Math.max(0, Math.min(1_000_000, Math.round(count)));
  it.count = n - row.base;
  if (it.entries.length > n) it.entries.length = n;
}

/** Adds `count` of an item to the player; stacks onto an existing row of the same form. */
export function addItem(s: Session, db: GameDb, key: string, count: number): InvRow {
  const formId = formIdFromKey(s.ess, key);
  if (formId === null) throw new EditError(`${key.split('|')[0]} is not in this save's plugin list`);
  const n = Math.max(1, Math.round(count));
  const inv = s.achr.inventory!;
  let it = inv.find((x) => irefToFormId(s.ess, x.iref) === formId);
  if (!it) {
    it = { iref: irefFor(s.ess, formId), count: -baseCount(db, key), entries: [] };
    inv.push(it);
  }
  it.count += n;
  const index = inv.indexOf(it);
  const base = baseCount(db, key);
  return { index, formId, key, count: base + it.count, base, entries: it.entries };
}

export function removeItem(s: Session, row: InvRow): void {
  const inv = s.achr.inventory!;
  if (row.base > 0) {
    inv[row.index].count = -row.base;
    inv[row.index].entries = [];
  } else inv.splice(row.index, 1);
}

// entry (per-instance) properties ------------------------------------------
export function entryFloat(e: InvEntry, code: number): number | null {
  const p = e.props.find((x) => x.code === code);
  return p ? propFloat(p) : null;
}
export function setEntryFloat(e: InvEntry, code: number, v: number | null): void {
  const idx = e.props.findIndex((x) => x.code === code);
  if (v === null) {
    if (idx >= 0) e.props.splice(idx, 1);
    return;
  }
  const p = floatProp(code, v);
  if (idx >= 0) e.props[idx] = p;
  else e.props.push(p);
}
export function entryByte(e: InvEntry, code: number): number | null {
  const p = e.props.find((x) => x.code === code);
  return p ? p.data[0] : null;
}
export function setEntryByte(e: InvEntry, code: number, v: number | null): void {
  const idx = e.props.findIndex((x) => x.code === code);
  if (v === null) {
    if (idx >= 0) e.props.splice(idx, 1);
    return;
  }
  const p: ItemProp = { code, data: new Uint8Array([v & 0xff]) };
  if (idx >= 0) e.props[idx] = p;
  else e.props.push(p);
}
export function entryHas(e: InvEntry, code: number): boolean {
  return e.props.some((x) => x.code === code);
}
export function setEntryFlag(e: InvEntry, code: number, on: boolean): void {
  const idx = e.props.findIndex((x) => x.code === code);
  if (on && idx < 0) e.props.push({ code, data: new Uint8Array() });
  if (!on && idx >= 0) e.props.splice(idx, 1);
}
/** Creates a per-instance entry (so health/charge can be set) on an item that has none. */
export function ensureEntry(s: Session, row: InvRow): InvEntry {
  const it: InvItem = s.achr.inventory![row.index];
  if (!it.entries.length) it.entries.push({ props: [] });
  return it.entries[0];
}
export function removeEntry(s: Session, row: InvRow, e: InvEntry): void {
  const it = s.achr.inventory![row.index];
  it.entries = it.entries.filter((x) => x !== e);
}
export function entryOpaqueProps(e: InvEntry): ItemProp[] {
  const known = new Set<number>([PROP.equipped, PROP.equippedRing, PROP.health, PROP.charge, PROP.soul, PROP.uses, PROP.hotkey]);
  return e.props.filter((p) => !known.has(p.code));
}

// ---------------------------------------------------------------- spells
export function spellKeys(s: Session): string[] {
  return (s.npc.spells ?? []).map((iref) => formKey(s.ess, irefToFormId(s.ess, iref)));
}
export function addSpell(s: Session, key: string): void {
  const formId = formIdFromKey(s.ess, key);
  if (formId === null) throw new EditError(`${key.split('|')[0]} is not in this save's plugin list`);
  if (!s.npc.spells) s.npc.spells = [];
  const iref = irefFor(s.ess, formId);
  if (!s.npc.spells.includes(iref)) s.npc.spells.push(iref);
}
export function removeSpell(s: Session, key: string): void {
  if (!s.npc.spells) return;
  s.npc.spells = s.npc.spells.filter((iref) => formKey(s.ess, irefToFormId(s.ess, iref)) !== key);
}

// ---------------------------------------------------------------- factions
export interface FactionRow { key: string; rank: number }
export function factions(s: Session): FactionRow[] {
  return (s.npc.factions ?? []).map((f) => ({ key: formKey(s.ess, irefToFormId(s.ess, f.iref)), rank: f.rank }));
}
export function setFactionRank(s: Session, key: string, rank: number): void {
  const f = (s.npc.factions ?? []).find((x) => formKey(s.ess, irefToFormId(s.ess, x.iref)) === key);
  if (f) f.rank = Math.max(-128, Math.min(127, Math.round(rank)));
}
export function addFaction(s: Session, key: string, rank = 0): void {
  const formId = formIdFromKey(s.ess, key);
  if (formId === null) throw new EditError(`${key.split('|')[0]} is not in this save's plugin list`);
  if (!s.npc.factions) s.npc.factions = [];
  const iref = irefFor(s.ess, formId);
  if (!s.npc.factions.some((x) => x.iref === iref)) s.npc.factions.push({ iref, rank });
}
export function removeFaction(s: Session, key: string): void {
  if (!s.npc.factions) return;
  s.npc.factions = s.npc.factions.filter((x) => formKey(s.ess, irefToFormId(s.ess, x.iref)) !== key);
}

// ---------------------------------------------------------------- world
export interface GlobalRow { key: string; name: string; value: number; type: string }
export function globals(s: Session, db: GameDb): GlobalRow[] {
  return s.ess.globals.map((g) => {
    const key = formKey(s.ess, irefToFormId(s.ess, g.iref));
    const def = db.data.globals[key];
    return { key, name: def?.e ?? key, value: g.value, type: def?.ty ?? 'f' };
  });
}
export function setGlobal(s: Session, key: string, value: number): void {
  const g = s.ess.globals.find((x) => formKey(s.ess, irefToFormId(s.ess, x.iref)) === key);
  if (g) g.value = value;
}

export function deathCounts(s: Session): Array<{ key: string; count: number }> {
  return s.ess.deathCounts.map((d) => ({ key: formKey(s.ess, irefToFormId(s.ess, d.iref)), count: d.count }));
}
export function setDeathCount(s: Session, key: string, count: number): void {
  const d = s.ess.deathCounts.find((x) => formKey(s.ess, irefToFormId(s.ess, x.iref)) === key);
  if (d) d.count = Math.max(0, Math.min(0xffff, Math.round(count)));
}

/** Game time as {days, hour} from the ESS header (gameDays is a float of days since the start). */
export function gameDays(s: Session): number {
  return s.ess.gameDays;
}
export function setGameDays(s: Session, days: number): void {
  s.ess.gameDays = Math.max(0, days);
  if (s.save.details) setPropInt(s.save.details, 'InGameDate', s.ess.gameDays);
}

/** Problems that would make the game reject or crash on the save. */
export function validate(s: Session): string[] {
  const problems: string[] = [];
  for (const it of s.achr.inventory!) {
    if (it.count > 1_000_000) problems.push(`item count ${it.count} is unreasonably large`);
  }
  if (s.npc.spells && s.npc.spells.length > 0xffff) problems.push('too many spells');
  return problems;
}

export function detailProps(s: Session): Prop[] | null {
  return s.save.details ? (structProps(findProp(s.save.inner.props, 'SaveGameDetails')) ?? null) : null;
}
