/**
 * Oodle Kraken codec via the open-source `ooz` compiled to WebAssembly (resources/wasm/ooz.wasm).
 * The compressor reproduces the game's own streams byte for byte, so saves round-trip exactly.
 */
interface OozExports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  ooz_alloc: (n: number) => number;
  ooz_free: (p: number) => void;
  ooz_decompress: (src: number, srcLen: number, dst: number, dstLen: number) => number;
  ooz_compress: (codec: number, src: number, srcLen: number, dst: number, level: number) => number;
}

let ex: OozExports | null = null;

export const KRAKEN = 8;

export async function initOodle(wasmBytes: Uint8Array | ArrayBuffer): Promise<void> {
  if (ex) return;
  const mod = await WebAssembly.compile(wasmBytes as BufferSource);
  let memory: WebAssembly.Memory | null = null;
  // the module is a WASI reactor; it only touches a handful of imports during start-up
  const wasi = {
    fd_close: () => 0,
    fd_prestat_get: () => 8,
    fd_prestat_dir_name: () => 8,
    fd_seek: () => 0,
    fd_write: (_fd: number, _iovs: number, _n: number, nw: number) => {
      if (memory) new DataView(memory.buffer).setUint32(nw, 0, true);
      return 0;
    },
    proc_exit: (code: number) => {
      throw new Error(`ooz exited with ${code}`);
    },
  };
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi });
  const e = inst.exports as unknown as OozExports;
  memory = e.memory;
  e._initialize?.();
  ex = e;
}

export function oodleReady(): boolean {
  return !!ex;
}

function need(): OozExports {
  if (!ex) throw new Error('Oodle codec not initialised');
  return ex;
}

export function oodleDecompress(src: Uint8Array, dstLen: number): Uint8Array {
  const e = need();
  const s = e.ooz_alloc(src.length + 16);
  const d = e.ooz_alloc(dstLen + 64);
  try {
    new Uint8Array(e.memory.buffer).set(src, s);
    const n = e.ooz_decompress(s, src.length, d, dstLen);
    if (n !== dstLen) throw new Error(`Oodle decompression failed (${n} of ${dstLen} bytes)`);
    return new Uint8Array(e.memory.buffer).slice(d, d + n);
  } finally {
    e.ooz_free(s);
    e.ooz_free(d);
  }
}

export function oodleCompress(src: Uint8Array, level = 4): Uint8Array {
  const e = need();
  const s = e.ooz_alloc(src.length + 16);
  const d = e.ooz_alloc(src.length + 65536);
  try {
    new Uint8Array(e.memory.buffer).set(src, s);
    const n = e.ooz_compress(KRAKEN, s, src.length, d, level);
    if (n < 0) throw new Error('Oodle compression failed');
    return new Uint8Array(e.memory.buffer).slice(d, d + n);
  } finally {
    e.ooz_free(s);
    e.ooz_free(d);
  }
}
