---
title: "Korean (Hangul)"
description: "Hangul syllable repertoire, the glyph-slot overflow problem, and three encoding strategies for localizing retro games into Korean."
---

Korean localization of retro games centers on one core challenge: **Hangul has far more
syllable glyphs than any classic console's font system was designed to hold.** This page
covers the syllable structure, the slot problem it creates, the three main strategies
translators use to solve it, and practical font-design considerations.

For the general encoding and font framework that applies to every target language, see
[Encoding & Fonts](/encoding-and-fonts/). For how text engines work (table files,
control codes, render hooks), see [Text Engine](/text-engine/).

---

## 1. Hangul syllable repertoire

Modern Korean writing uses **Hangul** (한글), an alphabetic script whose letters are
grouped into syllable blocks. Unicode encodes every possible syllable block in the
**Hangul Syllables** block, U+AC00 through U+D7A3 -- a total of **11,172 precomposed
syllables**.

Each syllable is composed of up to three _jamo_ (자모) components:

| Position | Name (Korean) | Count | Examples |
|----------|--------------|-------|---------|
| Initial consonant | 초성 (choseong) | 19 | ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ |
| Medial vowel | 중성 (jungseong) | 21 | ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ ㅗ ㅘ ㅙ ㅚ ㅛ ㅜ ㅝ ㅞ ㅟ ㅠ ㅡ ㅢ ㅣ |
| Final consonant | 종성 (jongseong) | 28 | (none) ㄱ ㄲ ㄳ ㄴ ㄵ ㄶ ㄷ ㄹ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅁ ㅂ ㅄ ㅅ ㅆ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ |

The 28 final-consonant values include index 0, which represents **no final consonant**
(e.g., 가 = ㄱ + ㅏ + none).

### The encoding formula

The Unicode code point of any precomposed Hangul syllable is computed as:

```
code = 0xAC00 + (cho * 21 + jung) * 28 + jong
```

where `cho` is the 0-based index of the initial consonant (0 = ㄱ, 1 = ㄲ, ..., 18 = ㅎ),
`jung` is the 0-based index of the medial vowel (0 = ㅏ, ..., 20 = ㅣ), and `jong` is
the 0-based index of the final consonant (0 = none, 1 = ㄱ, ..., 27 = ㅎ).

Total count: 19 x 21 x 28 = **11,172**.

---

## 2. The slot problem

Most retro consoles use **tile-based font systems** where each glyph occupies one tile
index. The tile index space is almost always limited:

| System | Typical glyph slots | Encoding width |
|--------|-------------------|----------------|
| NES | 256 (one CHR page) | 1 byte |
| SNES | 256-512 (BG tile map) | 1 byte (10-bit with palette bits) |
| GB/GBC | 256 per VRAM bank (384 with tricks) | 1 byte |
| GBA | 256-1024 (mode-dependent) | 1-2 bytes |
| NDS | flexible (NFTR font system) | 1-2 bytes |

The original Japanese game typically uses around 100-200 glyphs: ~80 katakana, ~80
hiragana, plus digits, punctuation, and a handful of kanji or abbreviations. That fits
comfortably in a single byte (≤256 slots).

**Korean does not fit.** Even a minimal game script -- short RPG, puzzle game, or
platformer with modest dialogue -- typically uses **500 to 2,000 unique Hangul syllables**.
A text-heavy RPG can easily reach 2,500+. This is 2x-10x more than the available slots
on any classic system.

This is the fundamental challenge of Korean retro localization. Every project must choose
a strategy to bridge this gap.

---

## 3. Three encoding strategies

### Strategy A: Precomposed subset

**Idea:** Extract the translated script, count every unique syllable that appears, and
assign each one a code in the game's font table. Only the syllables actually used get
a tile.

**How it works:**

1. Translate the full script into Korean.
2. Scan the text and collect all unique syllables. For example, a short game might use
   exactly 743 unique syllables out of the 11,172 possible.
3. Design a bitmap font tile for each syllable.
4. Assign a 1-byte or 2-byte code to each syllable in a `.tbl` file.
5. Insert the text and font data into the ROM.

**Pros:**
- Conceptually simple -- no render-hook changes needed.
- Each syllable is a single pre-rendered tile, so rendering is identical to the
  original game's text engine.

**Cons:**
- **Inflexible.** If you add or change dialogue later, new syllables may appear that
  were not in the original set. You must regenerate the font and potentially reassign
  codes.
- **Slot pressure.** If the count exceeds 256, you need multi-byte encoding or
  bank-switching for the font tiles, which starts requiring engine modifications anyway.
- For systems with only 256 slots (NES, GB), even 500 syllables require either
  multi-byte codes or dynamic tile loading (swapping tiles into VRAM per-screen).

**Best for:** GBA and NDS projects where tile slot counts are higher, or games with
very short scripts where the unique syllable count stays under the slot limit.

### Strategy B: Jamo composition

**Idea:** Instead of storing thousands of precomposed syllable tiles, store only the
individual jamo components (~68 pieces) and compose them into syllable blocks at render
time.

**How it works:**

1. Prepare jamo tiles: 19 initial consonant forms + 21 medial vowel forms + 27 final
   consonant forms (the "none" final needs no tile) = **67 tiles** minimum. In practice,
   jamo have different shapes depending on context (e.g., ㅏ is taller when there is no
   final consonant), so you may need **80-120 jamo variant tiles**.
2. Modify the game's text engine with a **render hook** that:
   - Reads a syllable code from the text stream.
   - Decomposes it into cho/jung/jong indices.
   - Looks up the appropriate jamo tile variant for each component.
   - Draws them in the correct positions within a character cell.
3. The decomposition formulas (given a syllable code offset from 0xAC00):

```
offset = code - 0xAC00
cho  = offset / (21 * 28)        // initial consonant index (0-18)
jung = (offset % (21 * 28)) / 28 // medial vowel index (0-20)
jong = offset % 28               // final consonant index (0-27; 0 = none)
```

**Pros:**
- Dramatically fewer tiles: ~80-120 instead of 500-2000+.
- **Fully flexible.** Any of the 11,172 syllables can be rendered without adding tiles.
- Well-suited to tile-constrained systems (NES, GB/GBC, SNES).

**Cons:**
- Requires **ASM-level modification** of the text rendering routine to add the
  composition logic.
- Jamo positioning is nontrivial: vowel shapes change depending on whether a final
  consonant is present, and some combinations need different tile variants for
  readability.
- Rendering is slower (3 tile lookups + draws per character instead of 1), which can
  matter on NES/GB where VBlank time is limited.

**Best for:** NES, GB/GBC, and SNES projects where tile slots are scarce and the
translator has ASM skills. This is the most common approach in the Korean fan-translation
community.

### Strategy C: VWF + full glyph atlas

**Idea:** Implement a **variable-width font (VWF)** renderer that draws Hangul glyphs
pixel-by-pixel from a large font atlas stored in expanded ROM, using multi-byte text
encoding.

**How it works:**

1. Expand the ROM (e.g., from 1 MB to 2 MB for a GBA game, or add extra banks for
   NES/SNES/GB).
2. Store a complete pre-rendered font atlas covering all needed syllables as raw pixel
   data (not individual tiles).
3. Implement a VWF render routine in ASM that:
   - Reads a multi-byte character code from the text stream.
   - Locates the glyph in the atlas.
   - Draws it pixel-by-pixel into a tile buffer, advancing the X cursor by the
     glyph's actual width.
   - Flushes completed tiles to VRAM.
4. Use 2-byte encoding for Hangul syllables (e.g., a direct mapping from a subset of
   the Unicode Hangul block, or a custom 2-byte table).

**Pros:**
- Best visual quality -- each syllable is individually designed at the desired resolution.
- Variable-width rendering produces natural-looking Korean text with proper spacing.
- Supports the full 11,172 syllable set (or any subset) without tile-slot concerns.

**Cons:**
- Most complex to implement: requires VWF rendering ASM, multi-byte text decoding,
  ROM expansion, and possibly pointer table rebuilds.
- Largest ROM space requirement for the font data.
- VWF rendering is the slowest approach (pixel-level operations).

**Best for:** GBA and NDS projects where ROM expansion is straightforward and CPU
headroom exists, or ambitious SNES projects. Also necessary when the game already uses
a VWF for the original language.

---

## 4. Strategy comparison

| Factor | A (Precomposed subset) | B (Jamo composition) | C (VWF + atlas) |
|--------|----------------------|---------------------|-----------------|
| Tile count | 500-2000+ | 80-120 | N/A (pixel atlas) |
| ROM overhead | Moderate (font tiles) | Low (jamo tiles) | High (full atlas + VWF code) |
| Engine changes | Minimal to moderate | Moderate (render hook) | Major (VWF + multi-byte) |
| Flexibility | Low (fixed set) | Full (any syllable) | Full (any syllable) |
| Visual quality | Good (at sufficient size) | Acceptable to good | Best |
| Difficulty | Low-medium | Medium-high | High |

---

## 5. Font design notes

### Minimum readable size

Hangul syllable blocks pack 2-3 jamo components into a square cell. At 8x8 pixels --
the standard tile size on NES, GB, and SNES -- individual jamo strokes become
indistinguishable, especially for complex syllables like 뷁 or , which have an initial
consonant, a compound vowel, and a compound final consonant all in one block.

**Practical minimum sizes for readable Hangul:**

| Size | Tiles per glyph | Notes |
|------|----------------|-------|
| 8x8 | 1 | Too small for most Hangul. Only usable for a handful of simple syllables. |
| 12x12 | Requires VWF | Acceptable with careful design. Common in GBA Korean patches. |
| 16x16 | 4 (2x2 tiles) | Comfortable and readable. Standard for SNES and NES Korean patches. |
| 16x12 | VWF or 2x2 partial | Good compromise on systems with limited vertical space. |

Most Korean fan translations target **16x16 or 12x12** character cells.

### Jamo positioning in composition (Strategy B)

When composing a syllable from jamo tiles, the position and size of each component
depends on the combination:

- **Syllables without a final consonant** (e.g., 가, 나, 미):
  The initial consonant occupies the top-left, and the medial vowel occupies the right
  or bottom, with both expanding to fill the full cell height.

- **Syllables with a final consonant** (e.g., 한, 글, 봄):
  The initial and medial are compressed into the upper portion, and the final consonant
  sits at the bottom.

- **Vertical vs. horizontal vowels:**
  Vowels like ㅏ, ㅓ, ㅣ are drawn to the right of the initial consonant (left-right
  layout). Vowels like ㅗ, ㅜ, ㅡ are drawn below the initial consonant (top-bottom
  layout). Compound vowels like ㅘ, ㅝ combine both directions.

A typical jamo-composition font needs **variant tiles** for each jamo in different
positional contexts. A common breakdown:

| Component | Base count | Variants needed | Typical total |
|-----------|-----------|----------------|--------------|
| Initial consonants (초성) | 19 | 2-4 shape variants (with/without jongseong, vowel direction) | 38-76 |
| Medial vowels (중성) | 21 | 2 variants (with/without jongseong) | 42 |
| Final consonants (종성) | 27 | 1-2 variants | 27-54 |
| **Total** | 67 | | **~107-172** |

Even at the high end, 172 jamo variant tiles is a fraction of the thousands of
precomposed syllable tiles that Strategy A would require.

---

## 6. Practical examples

### Decomposing example syllables

**한** (U+D55C) -- as in 한글 (Hangul):

```
offset = 0xD55C - 0xAC00 = 0x295C = 10588

cho  = 10588 / (21 * 28) = 10588 / 588 = 18  -> ㅎ
jung = (10588 % 588) / 28 = 16 / 28 = 0      -> ㅏ
jong = 10588 % 28 = 4                         -> ㄴ

Result: ㅎ + ㅏ + ㄴ = 한  ✓
```

**글** (U+AE00) -- as in 한글:

```
offset = 0xAE00 - 0xAC00 = 0x0200 = 512

cho  = 512 / 588 = 0   -> ㄱ
jung = (512 % 588) / 28 = 512 / 28 = 18  -> ㅡ
jong = 512 % 28 = 8     -> ㄹ

Result: ㄱ + ㅡ + ㄹ = 글  ✓
```

**가** (U+AC00) -- simplest syllable (first in the block, no final consonant):

```
offset = 0xAC00 - 0xAC00 = 0

cho  = 0 / 588 = 0   -> ㄱ
jung = 0 / 28 = 0     -> ㅏ
jong = 0 % 28 = 0     -> (none)

Result: ㄱ + ㅏ = 가  ✓
```

### Tile count comparison for a sample script

Suppose a translated RPG script contains **1,200 unique Hangul syllables** (a typical
mid-sized game):

| Strategy | Glyph tiles needed | Encoding | Engine changes |
|----------|-------------------|----------|---------------|
| A (subset) | 1,200 syllable tiles (at 16x16: 4,800 8x8 tiles) | 2-byte codes | Multi-byte decode |
| B (jamo) | ~120 jamo variant tiles (at 16x16: ~480 8x8 tiles) | 2-byte codes | Render hook + decomposition |
| C (VWF) | Pixel atlas (~1,200 glyphs x ~24 bytes each = ~28 KB) | 2-byte codes | Full VWF engine |

Strategy B uses roughly **10x fewer tiles** than Strategy A for the same coverage, which
is why it is the go-to approach on tile-constrained systems.

---

## 7. Platform-specific notes

### NES / Famicom
CHR ROM/RAM is very limited (typically 8 KB = 512 tiles for both backgrounds and sprites).
Strategy B (jamo composition) at 16x16 is the standard approach. The render hook must
carefully manage tile uploads during VBlank. Games with CHR-RAM (mapper-dependent) are
easier to work with since tiles can be written dynamically.

### GB / GBC
384 tiles available (with both VRAM banks on GBC). Strategy B works well. The 8x8 base
tile size means 16x16 characters use 4 tiles each; plan VRAM layout carefully. GBC's
second VRAM bank helps.

### SNES
More VRAM and a faster CPU make both Strategy B and C viable. The 4bpp tile format
means each 8x8 tile is 32 bytes; a 16x16 character at 4bpp costs 128 bytes of tile
data. DMA transfers simplify dynamic tile loading.

### GBA
ROM is large (up to 32 MB) and the CPU (ARM7TDMI) is fast enough for VWF rendering.
Strategy C is common and practical. The GBA's bitmap modes can also be leveraged for
direct pixel rendering. Many Korean GBA translations use 12x12 VWF.

### NDS
The NDS has a built-in font format (**NFTR**) that supports variable-width multi-byte
fonts natively. Korean localization on NDS often involves replacing or extending the
NFTR font resource and adjusting the text encoding. This is the most straightforward
platform for Korean support.

---

## 8. Hangul jamo index tables

For reference, the complete index mappings used in the decomposition formula:

**Initial consonants (초성), index 0-18:**

| Index | Jamo | Name |
|-------|------|------|
| 0 | ㄱ | giyeok |
| 1 | ㄲ | ssang-giyeok |
| 2 | ㄴ | nieun |
| 3 | ㄷ | digeut |
| 4 | ㄸ | ssang-digeut |
| 5 | ㄹ | rieul |
| 6 | ㅁ | mieum |
| 7 | ㅂ | bieup |
| 8 | ㅃ | ssang-bieup |
| 9 | ㅅ | siot |
| 10 | ㅆ | ssang-siot |
| 11 | ㅇ | ieung |
| 12 | ㅈ | jieut |
| 13 | ㅉ | ssang-jieut |
| 14 | ㅊ | chieut |
| 15 | ㅋ | kieuk |
| 16 | ㅌ | tieut |
| 17 | ㅍ | pieup |
| 18 | ㅎ | hieut |

**Final consonants (종성), index 0-27:**

| Index | Jamo | Note |
|-------|------|------|
| 0 | (none) | No final consonant |
| 1 | ㄱ | |
| 2 | ㄲ | |
| 3 | ㄳ | compound |
| 4 | ㄴ | |
| 5 | ㄵ | compound |
| 6 | ㄶ | compound |
| 7 | ㄷ | |
| 8 | ㄹ | |
| 9 | ㄺ | compound |
| 10 | ㄻ | compound |
| 11 | ㄼ | compound |
| 12 | ㄽ | compound |
| 13 | ㄾ | compound |
| 14 | ㄿ | compound |
| 15 | ㅀ | compound |
| 16 | ㅁ | |
| 17 | ㅂ | |
| 18 | ㅄ | compound |
| 19 | ㅅ | |
| 20 | ㅆ | |
| 21 | ㅇ | |
| 22 | ㅈ | |
| 23 | ㅊ | |
| 24 | ㅋ | |
| 25 | ㅌ | |
| 26 | ㅍ | |
| 27 | ㅎ | |

---

## Further reading

- [Encoding & Fonts](/encoding-and-fonts/) -- general framework for charset expansion,
  fixed vs. variable-width fonts, and multi-byte encoding across all target languages.
- [Text Engine](/text-engine/) -- `.tbl` files, control codes, DTE/MTE, and how to
  locate and hook the font render routine (essential for Strategy B and C).
- [Pointers](/pointers/) -- pointer table relocation needed when translated text changes
  length.
- [Compression](/compression/) -- identifying and handling compressed text/font data.
