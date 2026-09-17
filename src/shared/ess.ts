/**
 * Classic Oblivion save (.ess, format 0.127 as embedded by the Remaster) — parser/serializer that
 * keeps every byte it does not interpret. Layout after https://en.uesp.net/wiki/Oblivion_Mod:Save_File_Format
 */
import { Reader, Writer } from './gvas';

export class EssError extends Error {}

export interface ChangeRecord {
  formId: number;
  type: number;
  flags: number;
  version: number;
  data: Uint8Array;
}

export interface Ess {
  minorVersion: number;
  exeTime: Uint8Array;
  headerVersion: number;
  saveNum: number;
  pcName: string;
  pcLevel: number;
  pcLocation: string;
  gameDays: number;
  gameTicks: number;
  gameTime: Uint8Array;
  screenshot: Uint8Array;
  plugins: string[];
  nextObjectId: number;
  worldId: number;
  worldX: number;
  worldY: number;
  pcCell: number;
  pcX: number;
  pcY: number;
  pcZ: number;
  globals: Array<{ iref: number; value: number }>;
  tesClassSize: number;
  deathCounts: Array<{ iref: number; count: number }>;
  gameModeSeconds: number;
  processes: Uint8Array;
  specEvent: Uint8Array;
  weather: Uint8Array;
  playerCombatCount: number;
  /** createdNum + the created records, verbatim */
  created: Uint8Array;
  createdNum: number;
  quickKeys: Uint8Array;
  reticule: Uint8Array;
  interfaceData: Uint8Array;
  regions: Array<{ iref: number; unknown: number }>;
  records: ChangeRecord[];
  tempEffects: Uint8Array;
  formIds: number[];
  worldSpaces: number[];
  /** zero padding the game leaves after the data */
  padding: Uint8Array;
}

const latin1 = new TextDecoder('windows-1252');
function bz(r: Reader): string {
  const n = r.u8();
  const b = r.bytes(n);
  return latin1.decode(b.subarray(0, Math.max(0, n - 1)));
}
function bs(r: Reader): string {
  const n = r.u8();
  return latin1.decode(r.bytes(n));
}
function encLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
function wbz(w: Writer, s: string): void {
  const b = encLatin1(s);
  w.u8(b.length + 1);
  w.bytes(b);
  w.u8(0);
}
function wbs(w: Writer, s: string): void {
  const b = encLatin1(s);
  w.u8(b.length);
  w.bytes(b);
}

export function parseEss(d: Uint8Array): Ess {
  const r = new Reader(d);
  if (latin1.decode(r.bytes(12)) !== 'TES4SAVEGAME') throw new EssError('OblivionData does not start with TES4SAVEGAME');
  const major = r.u8();
  if (major !== 0) throw new EssError(`unexpected save major version ${major}`);
  const minorVersion = r.u8();
  const exeTime = r.bytes(16);
  const headerVersion = r.u32();
  r.u32(); // saveHeaderSize
  const saveNum = r.u32();
  const pcName = bz(r);
  const pcLevel = r.u16();
  const pcLocation = bz(r);
  const gameDays = r.f32();
  const gameTicks = r.u32();
  const gameTime = r.bytes(16);
  const ssSize = r.u32();
  const screenshot = r.bytes(ssSize);
  const nPlugins = r.u8();
  const plugins: string[] = [];
  for (let i = 0; i < nPlugins; i++) plugins.push(bs(r));
  const formIdsOffset = r.u32();
  const recordsNum = r.u32();
  const nextObjectId = r.u32();
  const worldId = r.u32();
  const worldX = r.u32();
  const worldY = r.u32();
  const pcCell = r.u32();
  const pcX = r.f32();
  const pcY = r.f32();
  const pcZ = r.f32();
  const gn = r.u16();
  const globals = [];
  for (let i = 0; i < gn; i++) globals.push({ iref: r.u32(), value: r.f32() });
  const tesClassSize = r.u16();
  const dn = r.u32();
  const deathCounts = [];
  for (let i = 0; i < dn; i++) deathCounts.push({ iref: r.u32(), count: r.u16() });
  const gameModeSeconds = r.f32();
  const processes = r.bytes(r.u16());
  const specEvent = r.bytes(r.u16());
  const weather = r.bytes(r.u16());
  const playerCombatCount = r.u32();
  const createdStart = r.pos;
  const createdNum = r.u32();
  for (let i = 0; i < createdNum; i++) {
    r.bytes(4);
    const size = r.u32();
    r.bytes(12 + size);
  }
  const created = d.slice(createdStart, r.pos);
  const quickKeys = r.bytes(r.u16());
  const reticule = r.bytes(r.u16());
  const interfaceData = r.bytes(r.u16());
  r.u16(); // regions size
  const rn = r.u16();
  const regions = [];
  for (let i = 0; i < rn; i++) regions.push({ iref: r.u32(), unknown: r.u32() });
  const records: ChangeRecord[] = [];
  for (let i = 0; i < recordsNum; i++) {
    const formId = r.u32();
    const type = r.u8();
    const flags = r.u32();
    const version = r.u8();
    const size = r.u16();
    records.push({ formId, type, flags, version, data: r.bytes(size) });
  }
  const tempEffects = r.bytes(r.u32());
  if (r.pos !== formIdsOffset) throw new EssError(`formIds expected at ${formIdsOffset}, parsed up to ${r.pos}`);
  const fn = r.u32();
  const formIds: number[] = [];
  for (let i = 0; i < fn; i++) formIds.push(r.u32());
  const wn = r.u32();
  const worldSpaces: number[] = [];
  for (let i = 0; i < wn; i++) worldSpaces.push(r.u32());
  const padding = d.slice(r.pos);
  return {
    minorVersion, exeTime, headerVersion, saveNum, pcName, pcLevel, pcLocation, gameDays, gameTicks, gameTime, screenshot, plugins,
    nextObjectId, worldId, worldX, worldY, pcCell, pcX, pcY, pcZ, globals, tesClassSize, deathCounts, gameModeSeconds, processes, specEvent, weather,
    playerCombatCount, created, createdNum, quickKeys, reticule, interfaceData, regions, records, tempEffects, formIds, worldSpaces, padding,
  };
}

export function serializeEss(e: Ess, keepPadding = true): Uint8Array {
  const w = new Writer();
  w.bytes(encLatin1('TES4SAVEGAME'));
  w.u8(0);
  w.u8(e.minorVersion);
  w.bytes(e.exeTime);
  w.u32(e.headerVersion);
  const sizeAt = w.reserve(4);
  const hdrStart = w.len;
  w.u32(e.saveNum);
  wbz(w, e.pcName);
  w.u16(e.pcLevel);
  wbz(w, e.pcLocation);
  w.f32(e.gameDays);
  w.u32(e.gameTicks);
  w.bytes(e.gameTime);
  w.u32(e.screenshot.length);
  w.bytes(e.screenshot);
  w.patchI32(sizeAt, w.len - hdrStart);
  w.u8(e.plugins.length);
  for (const p of e.plugins) wbs(w, p);
  const formIdsOffsetAt = w.reserve(4);
  w.u32(e.records.length);
  w.u32(e.nextObjectId);
  w.u32(e.worldId);
  w.u32(e.worldX);
  w.u32(e.worldY);
  w.u32(e.pcCell);
  w.f32(e.pcX);
  w.f32(e.pcY);
  w.f32(e.pcZ);
  w.u16(e.globals.length);
  for (const g of e.globals) { w.u32(g.iref); w.f32(g.value); }
  w.u16(e.tesClassSize);
  w.u32(e.deathCounts.length);
  for (const dc of e.deathCounts) { w.u32(dc.iref); w.u16(dc.count); }
  w.f32(e.gameModeSeconds);
  w.u16(e.processes.length); w.bytes(e.processes);
  w.u16(e.specEvent.length); w.bytes(e.specEvent);
  w.u16(e.weather.length); w.bytes(e.weather);
  w.u32(e.playerCombatCount);
  w.bytes(e.created);
  w.u16(e.quickKeys.length); w.bytes(e.quickKeys);
  w.u16(e.reticule.length); w.bytes(e.reticule);
  w.u16(e.interfaceData.length); w.bytes(e.interfaceData);
  w.u16(2 + e.regions.length * 8);
  w.u16(e.regions.length);
  for (const rg of e.regions) { w.u32(rg.iref); w.u32(rg.unknown); }
  for (const rec of e.records) {
    if (rec.data.length > 0xffff) throw new EssError(`change record ${rec.formId.toString(16)} exceeds 64 KB (${rec.data.length} bytes)`);
    w.u32(rec.formId); w.u8(rec.type); w.u32(rec.flags); w.u8(rec.version); w.u16(rec.data.length); w.bytes(rec.data);
  }
  w.u32(e.tempEffects.length); w.bytes(e.tempEffects);
  w.patchI32(formIdsOffsetAt, w.len);
  w.u32(e.formIds.length);
  for (const f of e.formIds) w.u32(f);
  w.u32(e.worldSpaces.length);
  for (const f of e.worldSpaces) w.u32(f);
  if (keepPadding) w.bytes(e.padding);
  return w.out();
}

// ---------------------------------------------------------------- form ids
export const PLAYER_BASE = 0x7;
export const PLAYER_REF = 0x14;
export const GOLD = 0xf;

export function irefToFormId(e: Ess, iref: number): number {
  if (iref >= 0xff000000) return iref;
  return e.formIds[iref] ?? 0;
}

/** Index of a form id in the save's table, adding it when needed. */
export function irefFor(e: Ess, formId: number): number {
  if (formId >= 0xff000000) return formId;
  const i = e.formIds.indexOf(formId);
  if (i >= 0) return i;
  e.formIds.push(formId);
  return e.formIds.length - 1;
}

/** "Oblivion.esm|00000f" style key used by gamedata, resolved through the save's plugin list. */
export function formKey(e: Ess, formId: number): string {
  const plugin = e.plugins[formId >>> 24] ?? `#${formId >>> 24}`;
  return `${plugin}|${(formId & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function formIdFromKey(e: Ess, key: string): number | null {
  const [plugin, hex] = key.split('|');
  const idx = e.plugins.findIndex((p) => p.toLowerCase() === plugin.toLowerCase());
  if (idx < 0) return null;
  return ((idx << 24) | parseInt(hex, 16)) >>> 0;
}

export function findRecord(e: Ess, formId: number, type?: number): ChangeRecord | undefined {
  return e.records.find((r) => r.formId === formId && (type === undefined || r.type === type));
}

// ---------------------------------------------------------------- NPC_ change record (player base, form 0x7)
export interface NpcRecord {
  formFlags?: number;
  attributes?: number[]; // 8
  baseData?: { flags: number; magicka: number; fatigue: number; barterGold: number; level: number; calcMin: number; calcMax: number };
  factions?: Array<{ iref: number; rank: number }>;
  spells?: number[];
  ai?: Uint8Array;
  baseHealth?: number;
  baseMods?: Array<{ index: number; value: number }>;
  fullName?: string;
  skills?: number[]; // 21
  combatStyle?: number;
  trailer: Uint8Array;
}

export const ATTRIBUTES = ['Strength', 'Intelligence', 'Willpower', 'Agility', 'Speed', 'Endurance', 'Personality', 'Luck'];
export const SKILLS = ['Armorer', 'Athletics', 'Blade', 'Block', 'Blunt', 'Hand to Hand', 'Heavy Armor', 'Alchemy', 'Alteration', 'Conjuration', 'Destruction', 'Illusion', 'Mysticism', 'Restoration', 'Acrobatics', 'Light Armor', 'Marksman', 'Mercantile', 'Security', 'Sneak', 'Speechcraft'];

export function parseNpc(rec: ChangeRecord): NpcRecord {
  const r = new Reader(rec.data);
  const f = rec.flags;
  const out: NpcRecord = { trailer: new Uint8Array() };
  if (f & 0x1) out.formFlags = r.u32();
  if (f & 0x8) out.attributes = [...r.bytes(8)];
  if (f & 0x10) out.baseData = { flags: r.u32(), magicka: r.u16(), fatigue: r.u16(), barterGold: r.u16(), level: r.dv.getInt16(r.pos, true), calcMin: 0, calcMax: 0 };
  if (out.baseData) { r.pos += 2; out.baseData.calcMin = r.u16(); out.baseData.calcMax = r.u16(); }
  if (f & 0x40) { const n = r.u16(); out.factions = []; for (let i = 0; i < n; i++) out.factions.push({ iref: r.u32(), rank: r.dv.getInt8(r.pos++) }); }
  if (f & 0x20) { const n = r.u16(); out.spells = []; for (let i = 0; i < n; i++) out.spells.push(r.u32()); }
  if (f & 0x100) out.ai = r.bytes(4);
  if (f & 0x4) out.baseHealth = r.u32();
  if (f & 0x10000000) { const n = r.u16(); out.baseMods = []; for (let i = 0; i < n; i++) out.baseMods.push({ index: r.u8(), value: r.f32() }); }
  if (f & 0x80) out.fullName = bs(r);
  if (f & 0x200) out.skills = [...r.bytes(21)];
  if (f & 0x400) out.combatStyle = r.u32();
  out.trailer = rec.data.slice(r.pos);
  return out;
}

export function serializeNpc(rec: ChangeRecord, n: NpcRecord): void {
  const w = new Writer();
  let f = rec.flags;
  const set = (bit: number, on: boolean): void => { f = on ? f | bit : f & ~bit; };
  set(0x1, n.formFlags !== undefined); if (n.formFlags !== undefined) w.u32(n.formFlags);
  set(0x8, !!n.attributes); if (n.attributes) w.bytes(new Uint8Array(n.attributes));
  set(0x10, !!n.baseData);
  if (n.baseData) { const b = n.baseData; w.u32(b.flags); w.u16(b.magicka); w.u16(b.fatigue); w.u16(b.barterGold); w.u16(b.level & 0xffff); w.u16(b.calcMin); w.u16(b.calcMax); }
  set(0x40, !!n.factions); if (n.factions) { w.u16(n.factions.length); for (const x of n.factions) { w.u32(x.iref); w.u8(x.rank & 0xff); } }
  set(0x20, !!n.spells); if (n.spells) { w.u16(n.spells.length); for (const s of n.spells) w.u32(s); }
  set(0x100, !!n.ai); if (n.ai) w.bytes(n.ai);
  set(0x4, n.baseHealth !== undefined); if (n.baseHealth !== undefined) w.u32(n.baseHealth);
  set(0x10000000, !!n.baseMods); if (n.baseMods) { w.u16(n.baseMods.length); for (const m of n.baseMods) { w.u8(m.index); w.f32(m.value); } }
  set(0x80, n.fullName !== undefined); if (n.fullName !== undefined) wbs(w, n.fullName);
  set(0x200, !!n.skills); if (n.skills) w.bytes(new Uint8Array(n.skills));
  set(0x400, n.combatStyle !== undefined); if (n.combatStyle !== undefined) w.u32(n.combatStyle);
  w.bytes(n.trailer);
  rec.flags = f >>> 0;
  rec.data = w.out();
}

// ---------------------------------------------------------------- ACHR change record (player reference, form 0x14)
export interface ItemProp { code: number; data: Uint8Array }
export interface InvEntry { props: ItemProp[] }
export interface InvItem { iref: number; count: number; entries: InvEntry[] }
export interface AchrRecord {
  head: Uint8Array; // cell changed / created / moved / oblivion flag blocks
  tempAttrs: Uint8Array | null; // 876 bytes, player only
  actorFlag: number;
  formFlags?: number;
  inventory: InvItem[] | null;
  props: ItemProp[];
  tail: Uint8Array;
}

export const PROP = {
  worldspace: 0x11, script: 0x12, equipped: 0x1b, equippedRing: 0x1c, disabled: 0x25, owner: 0x27, affectedCount: 0x2a, health: 0x2b, uses: 0x2c,
  time: 0x2d, charge: 0x2e, soul: 0x2f, lock: 0x31, teleport: 0x32, scale: 0x37, crimeGold: 0x3d, cantWear: 0x47, poison: 0x48, animation: 0x4a,
  bound: 0x50, investment: 0x52, hotkey: 0x55, essential: 0x5a,
} as const;

const PROP_SIZE: Record<number, number> = {
  0x11: 4, 0x1b: 0, 0x1c: 0, 0x1e: 20, 0x1f: 14, 0x20: 63, 0x22: 4, 0x25: 0, 0x27: 4, 0x2a: 2, 0x2b: 4, 0x2c: 1, 0x2d: 4, 0x2e: 4, 0x2f: 1,
  0x31: 6, 0x32: 28, 0x33: 1, 0x35: 0, 0x36: 5, 0x37: 4, 0x39: 12, 0x3c: 4, 0x3d: 4, 0x3e: 16, 0x41: 4, 0x47: 0, 0x48: 4, 0x4f: 4, 0x50: 0,
  0x52: 4, 0x53: 4, 0x55: 1, 0x5a: 1, 0x5c: 4,
};

function readProps(r: Reader): ItemProp[] {
  const n = r.u16();
  const out: ItemProp[] = [];
  for (let i = 0; i < n; i++) {
    const code = r.u8();
    const start = r.pos;
    if (code === 0x12) {
      r.u32();
      const nv = r.u16();
      for (let k = 0; k < nv; k++) { r.u16(); const t = r.u16(); r.pos += t === 0xf000 ? 4 : 8; }
      r.u8();
    } else if (code === 0x4a) r.pos += 1 + r.d[r.pos];
    else if (code === 0x21) { const c = r.u16(); r.pos += 5 * c; }
    else if (code === 0x23) { const c = r.u16(); r.pos += 4 * c; }
    else if (code === 0x4e) { const c = r.u16(); r.pos += 10 * c; }
    else if (code === 0x3a) { r.u32(); const c = r.u16(); r.pos += 61 * c; }
    else if (code === 0x59) { const sl = r.u8(); r.pos += sl; const c = r.u16(); r.pos += 13 * c; }
    else if (code in PROP_SIZE) r.pos += PROP_SIZE[code];
    else throw new EssError(`unknown item property 0x${code.toString(16)} at ${start}`);
    out.push({ code, data: r.d.slice(start, r.pos) });
  }
  return out;
}

function writeProps(w: Writer, props: ItemProp[]): void {
  w.u16(props.length);
  for (const p of props) { w.u8(p.code); w.bytes(p.data); }
}

export function parseAchr(rec: ChangeRecord): AchrRecord {
  const r = new Reader(rec.data);
  const f = rec.flags;
  let headLen = 0;
  if (f & 0x80000000) headLen += 16;
  if (f & 0x2) headLen += 36;
  else if (f & 0x4) headLen += 28;
  else if (f & 0x8) headLen += 28;
  else if (f & 0x800000) headLen += 4;
  const head = r.bytes(headLen);
  const tempAttrs = rec.formId === PLAYER_REF ? r.bytes(876) : null;
  const actorFlag = r.u8();
  const out: AchrRecord = { head, tempAttrs, actorFlag, inventory: null, props: [], tail: new Uint8Array() };
  if (f & 0x1) out.formFlags = r.u32();
  if (f & 0x08000000) {
    const n = r.u16();
    out.inventory = [];
    for (let i = 0; i < n; i++) {
      const iref = r.u32();
      const count = r.i32();
      const ne = r.i32();
      const entries: InvEntry[] = [];
      for (let k = 0; k < ne; k++) entries.push({ props: readProps(r) });
      out.inventory.push({ iref, count, entries });
    }
  }
  out.props = readProps(r);
  out.tail = rec.data.slice(r.pos);
  return out;
}

export function serializeAchr(rec: ChangeRecord, a: AchrRecord): void {
  const w = new Writer();
  w.bytes(a.head);
  if (a.tempAttrs) w.bytes(a.tempAttrs);
  w.u8(a.actorFlag);
  if (rec.flags & 0x1) w.u32(a.formFlags ?? 0);
  if (a.inventory) {
    rec.flags = (rec.flags | 0x08000000) >>> 0;
    w.u16(a.inventory.length);
    for (const it of a.inventory) {
      w.u32(it.iref);
      w.i32(it.count);
      w.i32(it.entries.length);
      for (const e of it.entries) writeProps(w, e.props);
    }
  }
  writeProps(w, a.props);
  w.bytes(a.tail);
  rec.data = w.out();
}

export function propFloat(p: ItemProp): number {
  return new DataView(p.data.buffer, p.data.byteOffset).getFloat32(0, true);
}
export function floatProp(code: number, v: number): ItemProp {
  const d = new Uint8Array(4);
  new DataView(d.buffer).setFloat32(0, v, true);
  return { code, data: d };
}
