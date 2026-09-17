/**
 * Unreal Engine 5 "GVAS" SaveGame serialization (tagged properties). Everything the editor does not
 * understand is kept as raw bytes so files round-trip byte for byte.
 */

export class GvasError extends Error {}

const utf8 = new TextDecoder('utf-8');
const utf16 = new TextDecoder('utf-16le');
const enc = new TextEncoder();

export class Reader {
  pos = 0;
  readonly dv: DataView;
  constructor(readonly d: Uint8Array) {
    this.dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  }
  u8(): number { return this.d[this.pos++]; }
  u16(): number { const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  i32(): number { const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
  u32(): number { const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  i64(): bigint { const v = this.dv.getBigInt64(this.pos, true); this.pos += 8; return v; }
  u64(): bigint { const v = this.dv.getBigUint64(this.pos, true); this.pos += 8; return v; }
  f32(): number { const v = this.dv.getFloat32(this.pos, true); this.pos += 4; return v; }
  f64(): number { const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v; }
  bytes(n: number): Uint8Array { const v = this.d.slice(this.pos, this.pos + n); this.pos += n; return v; }
  fstr(): FStr {
    const n = this.i32();
    if (n === 0) return { s: '', wide: false, empty: true };
    if (n < 0) {
      const len = -n;
      const s = utf16.decode(this.d.subarray(this.pos, this.pos + len * 2 - 2));
      this.pos += len * 2;
      return { s, wide: true };
    }
    const s = utf8.decode(this.d.subarray(this.pos, this.pos + n - 1));
    this.pos += n;
    return { s, wide: false };
  }
  str(): string { return this.fstr().s; }
}

export class Writer {
  buf = new Uint8Array(1 << 16);
  dv = new DataView(this.buf.buffer);
  len = 0;
  reserve(n: number): number {
    if (this.len + n > this.buf.length) {
      let cap = this.buf.length * 2;
      while (cap < this.len + n) cap *= 2;
      const nb = new Uint8Array(cap);
      nb.set(this.buf.subarray(0, this.len));
      this.buf = nb;
      this.dv = new DataView(nb.buffer);
    }
    const p = this.len;
    this.len += n;
    return p;
  }
  u8(v: number): void { const p = this.reserve(1); this.buf[p] = v; }
  u16(v: number): void { const p = this.reserve(2); this.dv.setUint16(p, v, true); }
  i32(v: number): void { const p = this.reserve(4); this.dv.setInt32(p, v, true); }
  u32(v: number): void { const p = this.reserve(4); this.dv.setUint32(p, v >>> 0, true); }
  i64(v: bigint): void { const p = this.reserve(8); this.dv.setBigInt64(p, v, true); }
  u64(v: bigint): void { const p = this.reserve(8); this.dv.setBigUint64(p, BigInt.asUintN(64, v), true); }
  f32(v: number): void { const p = this.reserve(4); this.dv.setFloat32(p, v, true); }
  f64(v: number): void { const p = this.reserve(8); this.dv.setFloat64(p, v, true); }
  bytes(b: Uint8Array): void { const p = this.reserve(b.length); this.buf.set(b, p); }
  fstr(s: FStr | string): void {
    const f: FStr = typeof s === 'string' ? { s, wide: /[^\x00-\x7f]/.test(s) } : s;
    if (f.empty || (f.s === '' && !f.wide)) { this.i32(0); return; }
    if (f.wide) {
      this.i32(-(f.s.length + 1));
      const p = this.reserve(f.s.length * 2 + 2);
      for (let i = 0; i < f.s.length; i++) this.dv.setUint16(p + i * 2, f.s.charCodeAt(i), true);
      this.dv.setUint16(p + f.s.length * 2, 0, true);
    } else {
      const b = enc.encode(f.s);
      this.i32(b.length + 1);
      this.bytes(b);
      this.u8(0);
    }
  }
  patchI32(at: number, v: number): void { this.dv.setInt32(at, v, true); }
  out(): Uint8Array { return this.buf.slice(0, this.len); }
}

export interface FStr { s: string; wide: boolean; empty?: boolean }

export interface GvasHeader {
  fileVersion: number;
  pkgVersion: [number, number];
  engine: { major: number; minor: number; patch: number; changelist: number; branch: FStr };
  customVersionFormat: number;
  customVersions: Array<[Uint8Array, number]>;
  className: FStr;
}

export type PropValue =
  | { kind: 'int'; value: number }
  | { kind: 'uint'; value: number }
  | { kind: 'int64'; value: bigint }
  | { kind: 'float'; value: number }
  | { kind: 'double'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'byte'; enumName: FStr; value: number | FStr }
  | { kind: 'enum'; enumName: FStr; value: FStr }
  | { kind: 'str'; value: FStr }
  | { kind: 'struct'; structName: FStr; guid: Uint8Array; props?: Prop[]; raw?: Uint8Array }
  | { kind: 'array'; innerType: FStr; bytes?: Uint8Array; ints?: number[]; strs?: FStr[]; structs?: StructArray; raw?: Uint8Array }
  | { kind: 'raw'; header: Uint8Array; raw: Uint8Array };

export interface StructArray {
  name: FStr;
  type: FStr;
  index: number;
  structName: FStr;
  guid: Uint8Array;
  items: Array<{ props?: Prop[]; raw?: Uint8Array }>;
}

export interface Prop {
  name: FStr;
  type: FStr;
  index: number;
  v: PropValue;
}

export interface GvasFile {
  header: GvasHeader;
  props: Prop[];
  /** bytes after the terminating None (e.g. a trailing u32 0) */
  trailer: Uint8Array;
}

const NATIVE_STRUCTS = new Set(['Vector', 'Rotator', 'Quat', 'Guid', 'DateTime', 'Timespan', 'LinearColor', 'Color', 'Vector2D', 'IntPoint', 'Transform', 'Vector4', 'Box', 'IntVector']);

export function parseGvas(d: Uint8Array): GvasFile {
  if (!(d[0] === 0x47 && d[1] === 0x56 && d[2] === 0x41 && d[3] === 0x53)) throw new GvasError('Not a GVAS file');
  const r = new Reader(d);
  r.pos = 4;
  const header: GvasHeader = {
    fileVersion: r.i32(),
    pkgVersion: [r.u32(), r.u32()],
    engine: { major: r.u16(), minor: r.u16(), patch: r.u16(), changelist: r.u32(), branch: r.fstr() },
    customVersionFormat: r.i32(),
    customVersions: [],
    className: { s: '', wide: false },
  };
  const n = r.i32();
  for (let i = 0; i < n; i++) header.customVersions.push([r.bytes(16), r.i32()]);
  header.className = r.fstr();
  const props = readProps(r, d.length);
  return { header, props, trailer: d.slice(r.pos) };
}

function readProps(r: Reader, end: number): Prop[] {
  const out: Prop[] = [];
  while (r.pos < end) {
    const name = r.fstr();
    if (name.s === 'None') return out;
    const type = r.fstr();
    const size = r.i32();
    const index = r.i32();
    out.push({ name, type, index, v: readValue(r, type.s, size) });
  }
  throw new GvasError('property list without None terminator');
}

function readValue(r: Reader, type: string, size: number): PropValue {
  switch (type) {
    case 'IntProperty': r.u8(); return { kind: 'int', value: r.i32() };
    case 'UInt32Property': r.u8(); return { kind: 'uint', value: r.u32() };
    case 'Int64Property': r.u8(); return { kind: 'int64', value: r.i64() };
    case 'UInt64Property': r.u8(); return { kind: 'int64', value: r.i64() };
    case 'FloatProperty': r.u8(); return { kind: 'float', value: r.f32() };
    case 'DoubleProperty': r.u8(); return { kind: 'double', value: r.f64() };
    case 'BoolProperty': { const v = r.u8(); r.u8(); return { kind: 'bool', value: !!v }; }
    case 'ByteProperty': {
      const enumName = r.fstr();
      r.u8();
      if (enumName.s === 'None') return { kind: 'byte', enumName, value: r.u8() };
      return { kind: 'byte', enumName, value: r.fstr() };
    }
    case 'EnumProperty': { const enumName = r.fstr(); r.u8(); return { kind: 'enum', enumName, value: r.fstr() }; }
    case 'StrProperty':
    case 'NameProperty':
    case 'ObjectProperty': r.u8(); return { kind: 'str', value: r.fstr() };
    case 'StructProperty': {
      const structName = r.fstr();
      const guid = r.bytes(16);
      r.u8();
      const start = r.pos;
      const raw = r.bytes(size);
      const props = tryProps(raw, structName.s);
      r.pos = start + size;
      return props ? { kind: 'struct', structName, guid, props } : { kind: 'struct', structName, guid, raw };
    }
    case 'ArrayProperty': {
      const innerType = r.fstr();
      r.u8();
      const start = r.pos;
      const count = r.u32();
      let v: PropValue;
      if (innerType.s === 'ByteProperty' && size === 4 + count) v = { kind: 'array', innerType, bytes: r.bytes(count) };
      else if (innerType.s === 'IntProperty' && size === 4 + count * 4) {
        const ints: number[] = [];
        for (let i = 0; i < count; i++) ints.push(r.i32());
        v = { kind: 'array', innerType, ints };
      } else if (innerType.s === 'StrProperty' || innerType.s === 'NameProperty') {
        const strs: FStr[] = [];
        for (let i = 0; i < count; i++) strs.push(r.fstr());
        if (r.pos !== start + size) { r.pos = start; v = { kind: 'array', innerType, raw: r.bytes(size) }; }
        else v = { kind: 'array', innerType, strs };
      } else if (innerType.s === 'StructProperty') {
        const sa: StructArray = { name: r.fstr(), type: r.fstr(), index: 0, structName: { s: '', wide: false }, guid: new Uint8Array(16), items: [] };
        r.i32(); // total size of all elements
        sa.index = r.i32();
        sa.structName = r.fstr();
        sa.guid = r.bytes(16);
        r.u8();
        const elemsEnd = start + size;
        let ok = !NATIVE_STRUCTS.has(sa.structName.s);
        for (let i = 0; i < count && ok; i++) {
          const props = readPropsOrNull(r, elemsEnd);
          if (!props || r.pos > elemsEnd) { ok = false; break; }
          sa.items.push({ props });
        }
        if (ok && r.pos === elemsEnd) v = { kind: 'array', innerType, structs: sa };
        else { r.pos = start; v = { kind: 'array', innerType, raw: r.bytes(size) }; }
      } else { r.pos = start; v = { kind: 'array', innerType, raw: r.bytes(size) }; }
      r.pos = start + size;
      return v;
    }
    case 'MapProperty': {
      const h0 = r.pos;
      r.fstr(); r.fstr(); r.u8();
      const header = r.d.slice(h0, r.pos);
      return { kind: 'raw', header, raw: r.bytes(size) };
    }
    case 'SetProperty': {
      const h0 = r.pos;
      r.fstr(); r.u8();
      const header = r.d.slice(h0, r.pos);
      return { kind: 'raw', header, raw: r.bytes(size) };
    }
    default: {
      // TextProperty, SoftObjectProperty, delegates, …: a single guid-flag byte precedes the payload
      const h0 = r.pos;
      r.u8();
      const header = r.d.slice(h0, r.pos);
      return { kind: 'raw', header, raw: r.bytes(size) };
    }
  }
}

function readPropsOrNull(r: Reader, end: number): Prop[] | null {
  const save = r.pos;
  try {
    return readProps(r, end);
  } catch {
    r.pos = save;
    return null;
  }
}

function tryProps(raw: Uint8Array, structName: string): Prop[] | null {
  if (NATIVE_STRUCTS.has(structName) || raw.length < 9) return null;
  const r = new Reader(raw);
  try {
    const props = readProps(r, raw.length);
    return r.pos === raw.length ? props : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- writer
export function serializeGvas(f: GvasFile): Uint8Array {
  const w = new Writer();
  w.bytes(enc.encode('GVAS'));
  w.i32(f.header.fileVersion);
  w.u32(f.header.pkgVersion[0]);
  w.u32(f.header.pkgVersion[1]);
  w.u16(f.header.engine.major);
  w.u16(f.header.engine.minor);
  w.u16(f.header.engine.patch);
  w.u32(f.header.engine.changelist);
  w.fstr(f.header.engine.branch);
  w.i32(f.header.customVersionFormat);
  w.i32(f.header.customVersions.length);
  for (const [g, v] of f.header.customVersions) { w.bytes(g); w.i32(v); }
  w.fstr(f.header.className);
  writeProps(w, f.props);
  w.bytes(f.trailer);
  return w.out();
}

function writeProps(w: Writer, props: Prop[]): void {
  for (const p of props) writeProp(w, p);
  w.fstr({ s: 'None', wide: false });
}

function writeProp(w: Writer, p: Prop): void {
  w.fstr(p.name);
  w.fstr(p.type);
  const sizeAt = w.reserve(4);
  w.i32(p.index);
  const v = p.v;
  let start: number;
  switch (v.kind) {
    case 'int': w.u8(0); start = w.len; w.i32(v.value); break;
    case 'uint': w.u8(0); start = w.len; w.u32(v.value); break;
    case 'int64': w.u8(0); start = w.len; w.i64(v.value); break;
    case 'float': w.u8(0); start = w.len; w.f32(v.value); break;
    case 'double': w.u8(0); start = w.len; w.f64(v.value); break;
    case 'bool': w.u8(v.value ? 1 : 0); w.u8(0); start = w.len; break;
    case 'byte':
      w.fstr(v.enumName); w.u8(0); start = w.len;
      if (typeof v.value === 'number') w.u8(v.value); else w.fstr(v.value);
      break;
    case 'enum': w.fstr(v.enumName); w.u8(0); start = w.len; w.fstr(v.value); break;
    case 'str': w.u8(0); start = w.len; w.fstr(v.value); break;
    case 'struct':
      w.fstr(v.structName); w.bytes(v.guid); w.u8(0); start = w.len;
      if (v.props) writeProps(w, v.props); else w.bytes(v.raw!);
      break;
    case 'array': {
      w.fstr(v.innerType); w.u8(0); start = w.len;
      if (v.raw) w.bytes(v.raw);
      else if (v.bytes) { w.u32(v.bytes.length); w.bytes(v.bytes); }
      else if (v.ints) { w.u32(v.ints.length); for (const x of v.ints) w.i32(x); }
      else if (v.strs) { w.u32(v.strs.length); for (const s of v.strs) w.fstr(s); }
      else if (v.structs) {
        const sa = v.structs;
        w.u32(sa.items.length);
        w.fstr(sa.name); w.fstr(sa.type);
        const totalAt = w.reserve(4);
        w.i32(sa.index); w.fstr(sa.structName); w.bytes(sa.guid); w.u8(0);
        const elemsStart = w.len;
        for (const it of sa.items) { if (it.props) writeProps(w, it.props); else w.bytes(it.raw!); }
        w.patchI32(totalAt, w.len - elemsStart);
      }
      break;
    }
    case 'raw': w.bytes(v.header); start = w.len; w.bytes(v.raw); break;
    default: throw new GvasError('cannot write property');
  }
  w.patchI32(sizeAt, w.len - start);
}

// ---------------------------------------------------------------- helpers
export function findProp(props: Prop[], name: string): Prop | undefined {
  return props.find((p) => p.name.s === name);
}
export function structProps(p: Prop | undefined): Prop[] | undefined {
  return p && p.v.kind === 'struct' ? p.v.props : undefined;
}
export function propInt(props: Prop[], name: string): number | undefined {
  const p = findProp(props, name);
  return p && (p.v.kind === 'int' || p.v.kind === 'uint' || p.v.kind === 'float') ? p.v.value : undefined;
}
export function propStr(props: Prop[], name: string): string | undefined {
  const p = findProp(props, name);
  return p && p.v.kind === 'str' ? p.v.value.s : undefined;
}
export function setPropInt(props: Prop[], name: string, value: number): void {
  const p = findProp(props, name);
  if (p && (p.v.kind === 'int' || p.v.kind === 'uint' || p.v.kind === 'float')) p.v.value = value;
}
export function setPropStr(props: Prop[], name: string, value: string): void {
  const p = findProp(props, name);
  if (p && p.v.kind === 'str') p.v.value = { s: value, wide: /[^\x00-\x7f]/.test(value) };
}
/** UE FText payload for a plain literal: flags u32, history type i8 (-1 = none) ... we only rewrite culture-invariant literals */
export function textPropString(p: Prop | undefined): string | null {
  if (!p || p.v.kind !== 'raw') return null;
  const r = new Reader(p.v.raw);
  try {
    r.u32(); // flags
    const ht = r.u8();
    if (ht === 0xff) { const has = r.u32(); if (!has) return ''; return r.str(); }
    return null;
  } catch {
    return null;
  }
}
