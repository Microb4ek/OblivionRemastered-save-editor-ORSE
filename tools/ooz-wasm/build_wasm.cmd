@echo off
cd /d "%~dp0"
"D:\save editors\.tools\zig14\zig.exe" c++ -target wasm32-wasi -O2 -std=c++14 -w -Dmain=ooz_main -DNDEBUG -mbulk-memory -msimd128 -fno-exceptions -mexec-model=reactor -o ooz.wasm wasm_api.cpp kraken.cpp bitknit.cpp lzna.cpp compress.cpp compr_entropy.cpp compr_kraken.cpp compr_leviathan.cpp compr_match_finder.cpp compr_mermaid.cpp compr_multiarray.cpp compr_tans.cpp stdafx.cpp "-Wl,--export=ooz_alloc" "-Wl,--export=ooz_free" "-Wl,--export=ooz_decompress" "-Wl,--export=ooz_compress" "-Wl,--export-memory"
