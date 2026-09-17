/**
 * Round-trip every .sav in the default folder (or the files/folders given): container → Oodle → inner GVAS → ESS →
 * player records, then serialize everything back and compare with the original bytes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initOodle } from '../src/shared/oodle';
import { openSave, sealSave } from '../src/shared/orsave';
import { parseEss, serializeEss, findRecord, parseNpc, serializeNpc, parseAchr, serializeAchr, PLAYER_BASE, PLAYER_REF, irefToFormId, GOLD } from '../src/shared/ess';
import { defaultSaveRoots } from '../src/main/saves';

function same(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

async function main(): Promise<void> {
  await initOodle(fs.readFileSync(path.join(__dirname, '..', 'resources', 'wasm', 'ooz.wasm')));
  const args = process.argv.slice(2);
  const files: string[] = [];
  const dirs = args.length ? args : defaultSaveRoots();
  for (const a of new Set(dirs)) {
    if (!fs.existsSync(a)) continue;
    if (fs.statSync(a).isDirectory()) {
      for (const f of fs.readdirSync(a)) if (f.endsWith('.sav') && !/^(saves_meta|Save_Settings)/.test(f)) files.push(path.join(a, f));
    } else files.push(a);
  }
  let bad = 0;
  for (const file of files) {
    const t0 = Date.now();
    try {
      const bytes = new Uint8Array(fs.readFileSync(file));
      const save = openSave(bytes);
      const ess = parseEss(save.ess);
      const again = serializeEss(ess);
      const essDiff = same(again, save.ess);
      const npcRec = findRecord(ess, PLAYER_BASE, 35);
      const achrRec = findRecord(ess, PLAYER_REF, 50);
      let npcOk = 'no NPC_';
      let achrOk = 'no ACHR';
      if (npcRec) { const before = npcRec.data; const n = parseNpc(npcRec); serializeNpc(npcRec, n); npcOk = same(before, npcRec.data) < 0 ? `NPC_ ok (level ${n.baseData?.level}, skills ${n.skills?.length})` : 'NPC_ DIFFERS'; }
      if (achrRec) {
        const before = achrRec.data; const a = parseAchr(achrRec); serializeAchr(achrRec, a);
        const gold = a.inventory?.find((it) => irefToFormId(ess, it.iref) === GOLD);
        achrOk = same(before, achrRec.data) < 0 ? `ACHR ok (${a.inventory?.length ?? 0} items, gold ${gold?.count ?? 0}, tail ${a.tail.length})` : 'ACHR DIFFERS';
      }
      const rebuilt = sealSave(save, again);
      const diff = same(rebuilt, bytes);
      // the Kraken encoder occasionally picks a different (equally valid) encoding for a block: compare the decoded content then
      let fileState = diff < 0 ? 'identical' : `DIFF@${diff} (${rebuilt.length} vs ${bytes.length})`;
      let fileOk = diff < 0;
      if (!fileOk) {
        const re = openSave(rebuilt);
        const inner = same(re.ess, save.ess);
        fileOk = inner < 0;
        fileState = fileOk ? 'equivalent (re-encoded)' : `${fileState}, inner DIFF@${inner}`;
      }
      const ok = essDiff < 0 && fileOk && !npcOk.includes('DIFFERS') && !achrOk.includes('DIFFERS');
      if (!ok) bad++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${path.basename(file)}  ess=${save.ess.length}${essDiff >= 0 ? ` ESS DIFF@${essDiff}` : ''} records=${ess.records.length} formids=${ess.formIds.length} | ${npcOk} | ${achrOk} | file ${fileState} ${Date.now() - t0}ms`);
    } catch (e) {
      bad++;
      console.log(`FAIL ${path.basename(file)}: ${e instanceof Error ? e.stack : e}`);
    }
  }
  console.log(bad ? `${bad} failures` : 'all good');
  process.exit(bad ? 1 : 0);
}
void main();
