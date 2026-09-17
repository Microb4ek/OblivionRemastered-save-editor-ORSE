// SSE2 subset used by ooz, mapped onto WebAssembly SIMD128 (compile with -msimd128).
#pragma once
#include <wasm_simd128.h>
#include <stdint.h>

typedef v128_t __m128i;
typedef v128_t __m128;
typedef struct { uint64_t v; } __m64;
#define _MM_HINT_T0 0

static inline __m128i _mm_loadu_si128(const __m128i *p) { return wasm_v128_load(p); }
static inline __m128i _mm_load_si128(const __m128i *p) { return wasm_v128_load(p); }
static inline void _mm_storeu_si128(__m128i *p, __m128i a) { wasm_v128_store(p, a); }
static inline void _mm_store_si128(__m128i *p, __m128i a) { wasm_v128_store(p, a); }
static inline __m128i _mm_loadl_epi64(const __m128i *p) { return wasm_v128_load64_zero(p); }
static inline void _mm_storel_epi64(__m128i *p, __m128i a) { wasm_v128_store64_lane(p, a, 0); }
static inline void _mm_storeh_pi(__m64 *p, __m128 a) { wasm_v128_store64_lane(p, a, 1); }
static inline __m128 _mm_castsi128_ps(__m128i a) { return a; }
static inline __m128i _mm_cvtsi32_si128(int a) { return wasm_i32x4_make(a, 0, 0, 0); }
static inline void _mm_prefetch(const char *p, int hint) { (void)p; (void)hint; }

static inline __m128i _mm_set1_epi8(char a) { return wasm_i8x16_splat(a); }
static inline __m128i _mm_set1_epi16(short a) { return wasm_i16x8_splat(a); }
static inline __m128i _mm_set1_epi32(int a) { return wasm_i32x4_splat(a); }
static inline __m128i _mm_set_epi16(short e7, short e6, short e5, short e4, short e3, short e2, short e1, short e0) {
  return wasm_i16x8_make(e0, e1, e2, e3, e4, e5, e6, e7);
}

static inline __m128i _mm_add_epi8(__m128i a, __m128i b) { return wasm_i8x16_add(a, b); }
static inline __m128i _mm_sub_epi8(__m128i a, __m128i b) { return wasm_i8x16_sub(a, b); }
static inline __m128i _mm_add_epi16(__m128i a, __m128i b) { return wasm_i16x8_add(a, b); }
static inline __m128i _mm_sub_epi16(__m128i a, __m128i b) { return wasm_i16x8_sub(a, b); }
static inline __m128i _mm_add_epi32(__m128i a, __m128i b) { return wasm_i32x4_add(a, b); }
static inline __m128i _mm_sub_epi32(__m128i a, __m128i b) { return wasm_i32x4_sub(a, b); }
static inline __m128i _mm_and_si128(__m128i a, __m128i b) { return wasm_v128_and(a, b); }
static inline __m128i _mm_or_si128(__m128i a, __m128i b) { return wasm_v128_or(a, b); }
static inline __m128i _mm_xor_si128(__m128i a, __m128i b) { return wasm_v128_xor(a, b); }
static inline __m128i _mm_cmpeq_epi8(__m128i a, __m128i b) { return wasm_i8x16_eq(a, b); }
static inline __m128i _mm_cmpeq_epi16(__m128i a, __m128i b) { return wasm_i16x8_eq(a, b); }
static inline __m128i _mm_cmpeq_epi32(__m128i a, __m128i b) { return wasm_i32x4_eq(a, b); }
static inline __m128i _mm_cmpgt_epi16(__m128i a, __m128i b) { return wasm_i16x8_gt(a, b); }
static inline __m128i _mm_cmpgt_epi32(__m128i a, __m128i b) { return wasm_i32x4_gt(a, b); }
static inline __m128i _mm_max_epu8(__m128i a, __m128i b) { return wasm_u8x16_max(a, b); }
static inline __m128i _mm_min_epi16(__m128i a, __m128i b) { return wasm_i16x8_min(a, b); }
static inline int _mm_movemask_epi8(__m128i a) { return (int)wasm_i8x16_bitmask(a); }
static inline __m128i _mm_packs_epi16(__m128i a, __m128i b) { return wasm_i8x16_narrow_i16x8(a, b); }
static inline __m128i _mm_packs_epi32(__m128i a, __m128i b) { return wasm_i16x8_narrow_i32x4(a, b); }
static inline __m128i _mm_unpacklo_epi8(__m128i a, __m128i b) { return wasm_i8x16_shuffle(a, b, 0, 16, 1, 17, 2, 18, 3, 19, 4, 20, 5, 21, 6, 22, 7, 23); }
static inline __m128i _mm_unpackhi_epi8(__m128i a, __m128i b) { return wasm_i8x16_shuffle(a, b, 8, 24, 9, 25, 10, 26, 11, 27, 12, 28, 13, 29, 14, 30, 15, 31); }
static inline __m128i _mm_unpacklo_epi16(__m128i a, __m128i b) { return wasm_i16x8_shuffle(a, b, 0, 8, 1, 9, 2, 10, 3, 11); }

#define _mm_srai_epi16(a, imm) wasm_i16x8_shr((a), (imm))
#define _mm_srli_epi16(a, imm) wasm_u16x8_shr((a), (imm))
#define _mm_shuffle_epi32(a, imm) wasm_i32x4_shuffle((a), (a), ((imm) & 3), (((imm) >> 2) & 3), (((imm) >> 4) & 3), (((imm) >> 6) & 3))
#define _mm_shufflelo_epi16(a, imm) wasm_i16x8_shuffle((a), (a), ((imm) & 3), (((imm) >> 2) & 3), (((imm) >> 4) & 3), (((imm) >> 6) & 3), 4, 5, 6, 7)
#define _mm_shufflehi_epi16(a, imm) wasm_i16x8_shuffle((a), (a), 0, 1, 2, 3, 4 + ((imm) & 3), 4 + (((imm) >> 2) & 3), 4 + (((imm) >> 4) & 3), 4 + (((imm) >> 6) & 3))
// byte shift left: result[i] = i < imm ? 0 : a[i - imm]; lane 16.. come from the zero vector
#define _SSEW_L(i, imm) (((i) < (imm)) ? 16 : ((i) - (imm)))
#define _mm_slli_si128(a, imm) wasm_i8x16_shuffle((a), wasm_i8x16_splat(0), _SSEW_L(0, imm), _SSEW_L(1, imm), _SSEW_L(2, imm), _SSEW_L(3, imm), _SSEW_L(4, imm), _SSEW_L(5, imm), _SSEW_L(6, imm), _SSEW_L(7, imm), _SSEW_L(8, imm), _SSEW_L(9, imm), _SSEW_L(10, imm), _SSEW_L(11, imm), _SSEW_L(12, imm), _SSEW_L(13, imm), _SSEW_L(14, imm), _SSEW_L(15, imm))
