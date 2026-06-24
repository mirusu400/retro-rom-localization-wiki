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

## CLI tile dumping

GUI tile editors (Tile Molester, YY-CHR) are convenient for browsing, but a CLI script is
faster for batch work and integrates into scripted pipelines. The following Python script
converts raw tile data from a ROM into a PNG grid image using Pillow.

### tile_dump.py -- ROM tiles to PNG

```python
#!/usr/bin/env python3
"""Dump raw ROM tile data to a PNG grid. Supports 1/2/4/8 bpp."""
import argparse, struct, sys
from PIL import Image

BPP_MAP = {"1bpp": 1, "2bpp": 2, "4bpp": 4, "8bpp": 8}

def decode_tile(data: bytes, bpp: int) -> list[list[int]]:
    """Decode one 8x8 tile. Returns 8 rows of 8 pixel values."""
    tile = [[0]*8 for _ in range(8)]
    if bpp == 2:  # NES/GB interleaved: low byte, high byte per row
        for y in range(8):
            lo, hi = data[y], data[y + 8]
            for x in range(8):
                tile[y][7-x] = ((lo >> x) & 1) | (((hi >> x) & 1) << 1)
    elif bpp == 4:  # SNES/GBA: two 2bpp planes interleaved
        for y in range(8):
            b0, b1 = data[2*y], data[2*y+1]
            b2, b3 = data[16 + 2*y], data[16 + 2*y+1]
            for x in range(8):
                tile[y][7-x] = (((b0>>x)&1) | (((b1>>x)&1)<<1)
                    | (((b2>>x)&1)<<2) | (((b3>>x)&1)<<3))
    elif bpp == 8:  # GBA/NDS linear: one byte per pixel
        for y in range(8):
            for x in range(8):
                tile[y][x] = data[y*8 + x]
    elif bpp == 1:  # 1bpp linear: one bit per pixel
        for y in range(8):
            b = data[y]
            for x in range(8):
                tile[y][7-x] = (b >> x) & 1
    return tile

def main():
    p = argparse.ArgumentParser(description="Dump ROM tiles to PNG")
    p.add_argument("rom", help="ROM file path")
    p.add_argument("offset", help="Start offset in ROM (hex with 0x prefix)")
    p.add_argument("count", type=int, help="Number of tiles to dump")
    p.add_argument("bpp", choices=BPP_MAP, help="Bit depth: 1bpp 2bpp 4bpp 8bpp")
    p.add_argument("output", help="Output PNG path")
    p.add_argument("--cols", type=int, default=16, help="Tiles per row (default 16)")
    args = p.parse_args()

    bpp = BPP_MAP[args.bpp]
    tile_bytes = 8 * bpp  # bytes per 8x8 tile
    offset = int(args.offset, 16)
    scale = 255 // ((1 << bpp) - 1)  # map max pixel value to 255

    with open(args.rom, "rb") as f:
        f.seek(offset)
        raw = f.read(tile_bytes * args.count)

    cols = args.cols
    rows = (args.count + cols - 1) // cols
    img = Image.new("L", (cols * 8, rows * 8), 0)
    for i in range(args.count):
        chunk = raw[i*tile_bytes:(i+1)*tile_bytes]
        if len(chunk) < tile_bytes:
            break
        tile = decode_tile(chunk, bpp)
        tx, ty = (i % cols) * 8, (i // cols) * 8
        for y in range(8):
            for x in range(8):
                img.putpixel((tx+x, ty+y), tile[y][x] * scale)
    img.save(args.output)
    print(f"Wrote {args.output} ({cols*8}x{rows*8}, {args.count} tiles, {args.bpp})")

if __name__ == "__main__":
    main()
```

### Usage examples

```bash
# NES: dump 256 tiles (2bpp) from CHR-ROM at offset 0x20010
python tile_dump.py rom.nes 0x20010 256 2bpp nes_font.png

# GB: dump 128 tiles (2bpp) from a font bank
python tile_dump.py rom.gb 0x40000 128 2bpp gb_font.png

# SNES: dump 256 tiles (4bpp)
python tile_dump.py rom.sfc 0x100000 256 4bpp snes_font.png

# GBA: dump 256 tiles (4bpp) at ROM offset 0x3A000
python tile_dump.py rom.gba 0x3A000 256 4bpp gba_font.png

# NDS: dump 256 tiles (4bpp) from an extracted font file
python tile_dump.py font.bin 0x0 256 4bpp nds_font_4bpp.png

# NDS: dump 128 tiles (8bpp)
python tile_dump.py font.bin 0x0 128 8bpp nds_font_8bpp.png
```

### Reverse: PNG to raw tile data

The reverse operation (reinserting edited tiles) follows the same logic in reverse: read
each 8x8 block from the PNG, quantize pixel values back to the original bit-depth range,
and encode the bitplanes. A minimal reverse script:

```python
#!/usr/bin/env python3
"""Convert a PNG grid back to raw tile data. Counterpart to tile_dump.py."""
import argparse
from PIL import Image

BPP_MAP = {"1bpp": 1, "2bpp": 2, "4bpp": 4, "8bpp": 8}

def encode_tile(pixels: list[list[int]], bpp: int) -> bytes:
    """Encode one 8x8 tile from pixel values to raw bytes."""
    out = bytearray()
    if bpp == 2:
        lo_plane, hi_plane = bytearray(8), bytearray(8)
        for y in range(8):
            for x in range(8):
                v = pixels[y][x]
                lo_plane[y] |= ((v & 1) << (7 - x))
                hi_plane[y] |= (((v >> 1) & 1) << (7 - x))
        out = lo_plane + hi_plane
    elif bpp == 4:
        planes = [bytearray(8) for _ in range(4)]
        for y in range(8):
            for x in range(8):
                v = pixels[y][x]
                for p in range(4):
                    planes[p][y] |= (((v >> p) & 1) << (7 - x))
        out = bytearray()
        for y in range(8):
            out += bytes([planes[0][y], planes[1][y]])
        for y in range(8):
            out += bytes([planes[2][y], planes[3][y]])
    elif bpp == 8:
        for y in range(8):
            for x in range(8):
                out.append(pixels[y][x])
    elif bpp == 1:
        for y in range(8):
            b = 0
            for x in range(8):
                b |= ((pixels[y][x] & 1) << (7 - x))
            out.append(b)
    return bytes(out)

def main():
    p = argparse.ArgumentParser(description="PNG grid to raw tile data")
    p.add_argument("png", help="Input PNG path")
    p.add_argument("bpp", choices=BPP_MAP, help="Bit depth")
    p.add_argument("output", help="Output raw tile file")
    args = p.parse_args()

    bpp = BPP_MAP[args.bpp]
    scale = (1 << bpp) - 1
    img = Image.open(args.png).convert("L")
    w, h = img.size
    cols, rows = w // 8, h // 8

    with open(args.output, "wb") as f:
        for ty in range(rows):
            for tx in range(cols):
                pixels = []
                for y in range(8):
                    row = []
                    for x in range(8):
                        v = img.getpixel((tx*8+x, ty*8+y))
                        row.append(round(v * scale / 255))
                    pixels.append(row)
                f.write(encode_tile(pixels, bpp))
    print(f"Wrote {args.output} ({cols*rows} tiles, {args.bpp})")

if __name__ == "__main__":
    main()
```

Use `tile_dump.py` to extract, edit the PNG in any image editor, then `tile_repack.py` to
produce the raw binary for reinsertion. This roundtrip replaces GUI-only tile editors for
most font-editing workflows.

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
