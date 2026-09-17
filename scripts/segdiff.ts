import fs from 'node:fs';
import path from 'node:path';
import { initOodle, oodleCompress, oodleDecompress } from '../src/shared/oodle';
import { parseGvas, findProp, Reader } from '../src/shared/gvas';

async function main(): Promise<void> {
  await initOodle(fs.readFileSync(path.join(__dirname, '..', 'resources', 'wasm', 'ooz.wasm')));
  const d = new Uint8Array(fs.readFileSync(process.argv[2]));
  const outer = parseGvas(d);
  const arr = findProp(outer.props, 'AltarSaveData')!;
  const data = arr.v.kind === 'array' ? arr.v.bytes! : new Uint8Array();
  const r = new Reader(data);
  let i = 0;
  while (r.pos < data.length) {
    r.u64(); r.i64(); r.u8(); const sc = Number(r.i64()); const su = Number(r.i64()); r.i64(); r.i64();
    const src = data.subarray(r.pos, r.pos + sc);
    const dec = oodleDecompress(src, su);
    for (const level of [4]) {
      const c = oodleCompress(dec, level);
      const sameBytes = c.length === sc && Buffer.compare(Buffer.from(c), Buffer.from(src)) === 0;
      if (!sameBytes) console.log(`segment ${i}: game ${sc} bytes, ours L${level} ${c.length} bytes, unc ${su}, header byte ${src[0].toString(16)} ${src[1].toString(16)}`);
    }
    r.pos += sc;
    i++;
  }
  console.log('segments', i);
}
void main();
