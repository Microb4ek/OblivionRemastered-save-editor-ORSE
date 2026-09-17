/**
 * Oblivion Remastered .sav container.
 *
 *   outer GVAS (VAltarSaveContainer)
 *     AltarSaveData: TArray<uint8>  = sequence of FArchive::SerializeCompressed segments, each:
 *        u64 0x222222229E2A83C1 tag, u64 chunkSize (0x20000), u8 flag (2), {i64 compressed, i64 uncompressed} summary,
 *        {i64,i64} per chunk, then the Oodle Kraken streams (one 128 KB block per segment)
 *     -> u32 length + inner GVAS (VAltarSaveGame)
 *          OblivionData: TArray<uint8>   the classic .ess (padded with zeros)
 *          SaveGameDetails: VSaveGameDetails  (name, level, location, play time, JPEG thumbnail)
 *          SerializedAltarSaveDataArray: UE-side extras (kept verbatim)
 */
import { findProp, parseGvas, Reader, serializeGvas, Writer, type GvasFile, type Prop } from './gvas';
import { oodleCompress, oodleDecompress } from './oodle';

export class SaveFormatError extends Error {}

const TAG = 0x222222229e2a83c1n;
const CHUNK = 0x20000;

export interface OrSave {
  outer: GvasFile;
  inner: GvasFile;
  /** the classic Oblivion save bytes (without the zero padding the game adds) */
  ess: Uint8Array;
  /** total length of the OblivionData array in the file, so we can pad back to it */
  essArrayLength: number;
  details: Prop[] | null;
}

function altarArray(outer: GvasFile): Prop {
  const p = findProp(outer.props, 'AltarSaveData');
  if (!p || p.v.kind !== 'array' || !p.v.bytes) throw new SaveFormatError('AltarSaveData byte array not found - is this an Oblivion Remastered save?');
  return p;
}

export function decodeSegments(data: Uint8Array): Uint8Array {
  const r = new Reader(data);
  const parts: Uint8Array[] = [];
  let total = 0;
  while (r.pos < data.length) {
    const tag = r.u64();
    if (tag !== TAG) throw new SaveFormatError(`bad compressed-archive tag at ${r.pos - 8}`);
    const chunk = Number(r.i64());
    r.u8(); // 2
    const sc = Number(r.i64());
    const su = Number(r.i64());
    const n = Math.ceil(su / chunk);
    const chunks: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) chunks.push([Number(r.i64()), Number(r.i64())]);
    let c = 0;
    for (const [cs, us] of chunks) {
      parts.push(oodleDecompress(data.subarray(r.pos, r.pos + cs), us));
      r.pos += cs;
      c += cs;
      total += us;
    }
    if (c !== sc) throw new SaveFormatError('compressed segment size mismatch');
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function encodeSegments(payload: Uint8Array): Uint8Array {
  const w = new Writer();
  for (let off = 0; off < payload.length; off += CHUNK) {
    const block = payload.subarray(off, Math.min(off + CHUNK, payload.length));
    const c = oodleCompress(block, 4);
    w.u64(TAG);
    w.i64(BigInt(CHUNK));
    w.u8(2);
    w.i64(BigInt(c.length));
    w.i64(BigInt(block.length));
    w.i64(BigInt(c.length));
    w.i64(BigInt(block.length));
    w.bytes(c);
  }
  return w.out();
}

export function openSave(file: Uint8Array): OrSave {
  const outer = parseGvas(file);
  const arr = altarArray(outer);
  const payload = decodeSegments(arr.v.kind === 'array' ? arr.v.bytes! : new Uint8Array());
  const r = new Reader(payload);
  const innerLen = r.u32();
  if (innerLen !== payload.length - 4) throw new SaveFormatError(`inner length ${innerLen} != ${payload.length - 4}`);
  const inner = parseGvas(payload.subarray(4));
  const od = findProp(inner.props, 'OblivionData');
  if (!od || od.v.kind !== 'array' || !od.v.bytes) throw new SaveFormatError('OblivionData not found in the save');
  const raw = od.v.bytes;
  // the game pads the ESS buffer with zeros; find the real end via the file's own structure later (ess.ts) - keep the array length
  const details = findProp(inner.props, 'SaveGameDetails');
  return { outer, inner, ess: raw, essArrayLength: raw.length, details: details && details.v.kind === 'struct' ? (details.v.props ?? null) : null };
}

/** Rebuilds the file with a new ESS; the inner/outer property trees are serialized from their (possibly edited) models. */
export function sealSave(save: OrSave, ess: Uint8Array): Uint8Array {
  const od = findProp(save.inner.props, 'OblivionData');
  if (!od || od.v.kind !== 'array') throw new SaveFormatError('OblivionData missing');
  let bytes = ess;
  if (ess.length < save.essArrayLength) {
    bytes = new Uint8Array(save.essArrayLength);
    bytes.set(ess);
  }
  od.v.bytes = bytes;
  const innerBytes = serializeGvas(save.inner);
  const payload = new Uint8Array(innerBytes.length + 4);
  new DataView(payload.buffer).setUint32(0, innerBytes.length, true);
  payload.set(innerBytes, 4);
  const arr = altarArray(save.outer);
  if (arr.v.kind === 'array') arr.v.bytes = encodeSegments(payload);
  return serializeGvas(save.outer);
}
