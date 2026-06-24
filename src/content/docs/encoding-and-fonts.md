---
title: Encoding and Fonts
description: The glyph-slot problem — mapping a target script's character repertoire into a retro console's limited font and encoding space.
---

The central technical challenge of retro-game localization is fitting a new script into a
system that was designed for a much smaller character set. Japanese games typically allocate
around 100–200 slots for hiragana, katakana, and a few hundred kanji. Latin localizations fit
even fewer. A target script like Hangul, Devanagari, or full Chinese may need thousands.

This page covers the **language-agnostic** encoding and font problems. For script-specific
glyph counts and strategies, see the [Languages](/retro-rom-localization-wiki/languages/korean/) pages.

## The glyph-slot problem

A retro game's text engine assigns one byte value (or a short multi-byte sequence) to each
printable character. The number of available values — the **glyph slots** — is hard-limited by:

1. **The encoding width.** A single-byte encoding has at most 256 values, minus control codes.
   Practical limit: 200–240 printable slots.
2. **Font storage space.** Each slot needs a tile (typically 8x8 or 8x16 pixels) stored in ROM
   or VRAM. More tiles = more ROM space consumed.
3. **VRAM tile budget.** Consoles like the NES and GB have limited VRAM for tiles (NES: 256
   tiles per pattern table, shared with sprites and backgrounds). Fonts must share this space.

If the target script requires more glyphs than slots available, you must use one or more of the
expansion strategies described below.

## Tile-based fonts

Retro consoles render text by placing **tiles** — small fixed-size bitmaps — on the background
layer. The tile is the fundamental unit of font rendering.

### Common tile sizes and bit-depths

| System | Tile size | Bit-depth | Colors per tile | Bytes per tile |
|--------|-----------|-----------|-----------------|----------------|
| NES | 8x8 | 2bpp | 4 (from a 4-color palette) | 16 |
| GB/GBC | 8x8 | 2bpp | 4 | 16 |
| SNES | 8x8 | 2bpp / 4bpp | 4 / 16 | 16 / 32 |
| GBA | 8x8 | 4bpp / 8bpp | 16 / 256 | 32 / 64 |
| NDS | 8x8 | 4bpp / 8bpp | 16 / 256 | 32 / 64 |

### 8x8 tiles

The standard text tile. Sufficient for Latin and kana at low resolution. Most games use one
tile per character with fixed-width spacing (8 pixels wide).

For scripts requiring wider or taller characters, games sometimes combine multiple tiles:

- **8x16** — two vertically-stacked 8x8 tiles per glyph (common for kanji on GB/NES).
- **16x16** — four 8x8 tiles per glyph (used for larger kanji on SNES).

### Glyph atlases (GBA/NDS)

On GBA and NDS, games often allocate a region of VRAM and render glyphs as bitmapped graphics
rather than hardware tiles. The "font" is a contiguous block of pixel data in ROM — a
**glyph atlas**. The text engine copies individual glyph bitmaps to a compositing buffer in
WRAM, then transfers the buffer to VRAM. This approach is more flexible but requires more
custom code in the text engine. NDS games frequently use the **NFTR** (Nitro Font Resource)
format for glyph atlases.

## Fixed-width vs variable-width fonts

### Fixed-width (monospace)

The default on most retro platforms. Every character occupies the same number of pixels
(usually 8). The text engine simply advances the cursor by one tile width after each character.

**Pros:** Simple rendering; no custom code needed.
**Cons:** Wasted space for narrow characters (i, l, 1); text boxes hold fewer characters;
characters that need more width (W, M, CJK) look cramped.

### Variable-width fonts (VWF)

A VWF renders each glyph at its natural width and advances the cursor by that glyph's
specific width in pixels. This requires modifying the text engine to:

1. Maintain a **pixel-level cursor** (not tile-level).
2. Look up each glyph's width from a **width table** in ROM.
3. Render glyphs by **bit-shifting and ORing** pixel data into a compositing buffer, because
   glyph boundaries no longer align with tile boundaries.
4. Flush the buffer to VRAM tiles periodically.

VWF is almost mandatory for scripts with many wide characters or where readability requires
larger glyphs (12x12, 16x16). It is also beneficial for Latin, as it allows more text per
line.

#### VWF implementation sketch (pseudocode)

```
render_glyph(glyph_id):
    glyph_data = font_rom[glyph_id * glyph_size]
    glyph_width = width_table[glyph_id]
    bit_offset = cursor_x % 8          ; pixel offset within the current tile

    for each row in glyph_data:
        shifted = row << bit_offset     ; may span two tiles
        buffer[cursor_tile][row] |= shifted & 0xFF
        buffer[cursor_tile + 1][row] |= shifted >> 8

    cursor_x += glyph_width
    if cursor_x / 8 > cursor_tile:
        flush cursor_tile to VRAM
        cursor_tile = cursor_x / 8
```

This is the routine that replaces the original fixed-width rendering. On NES and GB it is
written in 6502/SM83 assembly; on GBA/NDS it may be C compiled with devkitARM.

## Single-byte vs multi-byte encoding

### Single-byte encoding (up to 256 slots)

The simplest scheme. One byte = one character. Sufficient for Latin and kana. Maximum ~240
printable characters after reserving bytes for control codes.

### Multi-byte encoding

When more than 256 characters are needed, games use multi-byte encodings. Common approaches:

- **Two-byte fixed width:** every character is two bytes. Simple but doubles text size.
  Typical on SNES and GBA games with kanji.
- **Lead-byte switching:** byte values `0x00`–`0x7F` are single-byte (Latin/kana); values
  `0x80`–`0xFF` are lead bytes followed by a second byte, giving 128 x 256 = 32,768 extra
  slots. Similar to Shift-JIS in structure.
- **Escape-byte prefix:** a single escape byte (e.g., `0xFE`) switches the engine to a
  secondary table for the next byte, doubling the effective character set with minimal
  overhead.

The text engine must be modified (or already support) multi-byte decoding. On older platforms
(NES, GB), this requires careful assembly work. On GBA/NDS, the engine may already handle
Shift-JIS and can be adapted.

## Expanding the character set

When the target script needs more slots than the original encoding provides, several
strategies apply. They can be combined.

### Reclaiming DTE/MTE slots

Many games use [DTE/MTE](/retro-rom-localization-wiki/text-engine/#dtemte-compression) — byte
values that expand to common character pairs or words in the source language. These pairs are
useless in the target language. By removing the DTE/MTE expansion logic and reassigning those
byte values as direct glyph slots, you gain 50–120 additional characters for free.

**Trade-off:** text that previously benefited from DTE compression will now be larger, so you
may need more ROM space.

### Adding a second encoding page

Add an escape byte that switches the decoder to a second 256-character table. This is a
relatively small code change (a few dozen bytes of assembly) but requires inserting the escape
byte throughout all translated text.

### ROM expansion

If more font tile space is needed, the ROM itself can be expanded:

- **NES:** Add extra CHR-ROM banks (if using CHR-ROM, not CHR-RAM) or switch to a mapper that
  supports more PRG-ROM for software-rendered fonts.
- **GB/GBC:** Expand the ROM by adding banks (requires updating the header's ROM-size byte and
  possibly the MBC type). Font tiles go in a new bank; the text engine bank-switches to load
  them.
- **SNES:** Add ROM space and update the internal header's ROM-size field.
- **GBA/NDS:** Simply append data to the ROM; the address space is large enough. GBA ROM is
  mapped at `0x08000000`, so new data at offset `0xN` in the file is at address `0x08000000+N`.

See [Pointers](/retro-rom-localization-wiki/pointers/) for how expansion affects pointer tables
and [platform pages](/retro-rom-localization-wiki/platforms/nes/) for system-specific details.

### Composition / jamo rendering

For scripts like Hangul, where characters are composed from sub-components (jamo), you can
store only the components (~67 jamo for Korean) and compose full syllable glyphs at render
time. This dramatically reduces storage but requires a composition routine in the text engine.
See [Korean / Hangul](/retro-rom-localization-wiki/languages/korean/) for details.

## Font design considerations

- **Readability threshold.** Most scripts have a minimum pixel size below which they become
  illegible. Latin is readable at 5x7; CJK/Hangul typically needs at least 10x10 or 12x12.
  VWF is usually necessary at these sizes to avoid wasting horizontal space.
- **Hinting.** At very low resolutions (8x8), every pixel matters. Hand-tuned pixel fonts
  dramatically outperform algorithmically scaled fonts. Design each glyph individually.
- **Consistency.** All glyphs in the set should share consistent stroke weight, baseline, and
  x-height/cap-height. Even one misaligned glyph breaks immersion.
- **Testing on hardware.** CRT scanlines, LCD ghosting, and non-square pixels (NES/SNES) all
  affect readability. Test on real hardware or in an accurate emulator with the correct aspect
  ratio.

## Further reading

- [Text Engine RE](/retro-rom-localization-wiki/text-engine/) — recovering the encoding and
  DTE/MTE tables
- [Pointers](/retro-rom-localization-wiki/pointers/) — handling text-length changes from
  encoding changes
- [Tools](/retro-rom-localization-wiki/tools/) — tile editors, font converters, emulators
- [Korean / Hangul](/retro-rom-localization-wiki/languages/korean/) — Hangul-specific glyph
  repertoire and composition strategies
