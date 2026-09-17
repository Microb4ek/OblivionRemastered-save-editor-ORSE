// Thin C ABI for the WebAssembly build of ooz: raw Oodle LZ streams in, raw bytes out.
#include "stdafx.h"
#include <stdlib.h>
#include <string.h>

int Kraken_Decompress(const byte *src, size_t src_len, byte *dst, size_t dst_len);
int CompressBlock(int codec_id, uint8 *src_in, uint8 *dst_in, int src_size, int level,
                  const struct CompressOptions *compressopts, uint8 *src_window_base, struct LRMCascade *lrm);

extern "C" {

__attribute__((export_name("ooz_alloc"))) void *ooz_alloc(size_t n) { return malloc(n); }
__attribute__((export_name("ooz_free"))) void ooz_free(void *p) { free(p); }

// returns bytes written or -1
__attribute__((export_name("ooz_decompress"))) int ooz_decompress(const byte *src, int src_len, byte *dst, int dst_len) {
  // the decoder may write up to 64 bytes past the end; callers allocate dst_len + 64
  return Kraken_Decompress(src, src_len, dst, dst_len);
}

// codec: 8 kraken, 9 mermaid, 11 selkie, 13 leviathan; level -4..10. dst must hold src_len + 65536. returns bytes or -1
__attribute__((export_name("ooz_compress"))) int ooz_compress(int codec, byte *src, int src_len, byte *dst, int level) {
  return CompressBlock(codec, src, dst, src_len, level, 0, 0, 0);
}

}
