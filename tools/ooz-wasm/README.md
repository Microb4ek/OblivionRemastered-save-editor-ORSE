# ooz → WebAssembly

`resources/wasm/ooz.wasm` is the open-source Oodle Kraken codec [ooz](https://github.com/rarten/ooz) (Powzix) compiled to
`wasm32-wasi` with zig 0.14.1. Oblivion Remastered's saves are `FArchive::SerializeCompressed` Kraken streams, and ooz's
compressor reproduces the game's own output bit for bit (level 4), so an untouched save re-saves byte-identically.

Recipe:

1. Clone ooz next to these files (`compr_multiarray.cpp`, `stdafx.h` here replace the upstream ones:
   `std::basic_string<uint8>` → `std::vector<uint8>`, SSE intrinsics → `sse_wasm.h` shim on `wasm_simd128`).
2. `wasm_api.cpp` exports `ooz_alloc / ooz_free / ooz_decompress(src, srcLen, dst, dstLen) / ooz_compress(codec=8, src, len, dst, level)`.
3. Run `build_wasm.cmd` (adjust the zig path). Flags that matter: `-mexec-model=reactor` (no main), `-fno-exceptions`,
   `-msimd128 -mbulk-memory`, `-Wl,--export-memory`.

`src/shared/oodle.ts` loads the module with a minimal WASI shim (`fd_prestat_get` must return 8 / EBADF or libc loops forever).
