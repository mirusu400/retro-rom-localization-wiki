---
title: "SNES Graphics & Fonts"
description: "SNES PPU tile formats (2bpp/4bpp/8bpp), background modes, tilemap entries, VRAM layout, DMA, and VWF implementation for font localization."
sidebar:
  order: 4
---

The SNES PPU is far more capable than the NES PPU: it supports multiple background layers
with 2, 4, or 8 bits per pixel, 256 simultaneous colors from a 15-bit palette (32,768
colors), hardware scrolling, rotation (Mode 7), and DMA transfers. For localization, the
key topics are **tile formats** (how font glyphs are encoded), **tilemaps** (how tiles are
arranged on screen), and **DMA** (how data gets to VRAM -- critical for VWF).

## Tile formats

SNES tiles are always **8x8 pixels**. The bit depth determines how many colors each pixel
can use. The PPU uses a **planar** format: each pixel's color index is spread across
multiple bitplanes.

### 2bpp -- 16 bytes per tile, 4 colors

Used by: Mode 0 (all layers), Mode 1 (BG3), Mode 4 (BG2), Mode 5 (BG2).

Each row of 8 pixels is encoded in 2 bytes. The two bitplanes for each row are stored
consecutively (interleaved by row):

```
Byte layout (16 bytes total):
  Byte  0: Row 0, bitplane 0 (low bit of each pixel)
  Byte  1: Row 0, bitplane 1 (high bit of each pixel)
  Byte  2: Row 1, bitplane 0
  Byte  3: Row 1, bitplane 1
  ...
  Byte 14: Row 7, bitplane 0
  Byte 15: Row 7, bitplane 1
```

To decode pixel (x, y):
```
bit0 = (byte[y*2 + 0] >> (7 - x)) & 1
bit1 = (byte[y*2 + 1] >> (7 - x)) & 1
color_index = (bit1 << 1) | bit0
```

Color index 0 is transparent. Indices 1--3 select from the tile's assigned palette.

**This is the most common format for SNES fonts** -- simple and compact. A 256-character
font in 2bpp occupies only 4 KB ($1000 bytes).

### 4bpp -- 32 bytes per tile, 16 colors

Used by: Mode 1 (BG1, BG2), Mode 2, Mode 3 (BG2), Mode 5 (BG1), Mode 6, all sprites.

4bpp is structured as **two consecutive 2bpp blocks**. The first 16 bytes contain bitplanes
0--1 (identical layout to 2bpp), and the next 16 bytes contain bitplanes 2--3:

```
Byte layout (32 bytes total):
  Bytes  0-15: Bitplanes 0 and 1 (2bpp layout)
    Byte  0: Row 0, bitplane 0
    Byte  1: Row 0, bitplane 1
    Byte  2: Row 1, bitplane 0
    Byte  3: Row 1, bitplane 1
    ...
    Byte 14: Row 7, bitplane 0
    Byte 15: Row 7, bitplane 1
  Bytes 16-31: Bitplanes 2 and 3 (same interleaving)
    Byte 16: Row 0, bitplane 2
    Byte 17: Row 0, bitplane 3
    ...
    Byte 30: Row 7, bitplane 2
    Byte 31: Row 7, bitplane 3
```

To decode pixel (x, y):
```
bit0 = (byte[y*2 +  0] >> (7 - x)) & 1
bit1 = (byte[y*2 +  1] >> (7 - x)) & 1
bit2 = (byte[y*2 + 16] >> (7 - x)) & 1
bit3 = (byte[y*2 + 17] >> (7 - x)) & 1
color_index = (bit3 << 3) | (bit2 << 2) | (bit1 << 1) | bit0
```

4bpp fonts are used when games want colored or anti-aliased text. A 256-character 4bpp font
occupies 8 KB ($2000 bytes).

### 8bpp -- 64 bytes per tile, 256 colors

Used by: Mode 3 (BG1), Mode 4 (BG1).

8bpp extends the same pattern -- four consecutive 2bpp blocks for bitplanes 0--1, 2--3,
4--5, and 6--7:

```
Byte layout (64 bytes total):
  Bytes  0-15: Bitplanes 0, 1
  Bytes 16-31: Bitplanes 2, 3
  Bytes 32-47: Bitplanes 4, 5
  Bytes 48-63: Bitplanes 6, 7
```

8bpp is rarely used for fonts (it wastes space), but some games use it for stylized title
text or bitmap-rendered dialogue.

### Mode 7 -- 64 bytes per tile (chunky)

Mode 7 uses a fundamentally different format: **one byte per pixel** (chunky/linear), not
planar. The 64 bytes for an 8x8 tile are simply the 64 pixel values in left-to-right,
top-to-bottom order:

```
Byte  0: pixel (0,0)
Byte  1: pixel (1,0)
...
Byte  7: pixel (7,0)
Byte  8: pixel (0,1)
...
Byte 63: pixel (7,7)
```

Mode 7 is irrelevant for most text rendering (it is used for rotation/scaling effects like
SNES RPG world maps).

## Background modes

The SNES has 8 background modes, set via register $2105 (BGMODE). Each mode defines the
number of background layers and their bit depths:

| Mode | BG1 | BG2 | BG3 | BG4 | Notes |
|------|-----|-----|-----|-----|-------|
| 0 | 2bpp | 2bpp | 2bpp | 2bpp | 4 layers, 4 colors each. Palette divided into 4 groups of 32 colors. |
| **1** | **4bpp** | **4bpp** | **2bpp** | -- | **Most common for RPGs / text games.** BG3 has a priority bit. |
| 2 | 4bpp | 4bpp | (OPT) | -- | Offset-per-tile on BG3. |
| 3 | 8bpp | 4bpp | -- | -- | BG1 can use direct color. |
| 4 | 8bpp | 2bpp | (OPT) | -- | Direct color + offset-per-tile. |
| 5 | 4bpp | 2bpp | -- | -- | Hi-res (512-pixel wide). |
| 6 | 4bpp | (OPT) | -- | -- | Hi-res + offset-per-tile. |
| 7 | 8bpp | -- | -- | -- | Rotation/scaling (Mode 7). 128x128 tile map. |

:::tip[For localization]
**Mode 1** is the workhorse for dialogue-heavy games. Text typically renders on BG1 or BG2
(4bpp) or BG3 (2bpp). Identify which BG layer the game uses for text -- this tells you the
tile bit depth and palette assignment.
:::

## Tilemap entries

Each tilemap entry is a **16-bit word** (2 bytes) in VRAM:

```
  F E D C  B A 9 8  7 6 5 4  3 2 1 0
  V H P C  C C T T  T T T T  T T T T
  | | | |      |                     |
  | | | |      |                     +-- Tile number (bits 0-9, 1024 tiles)
  | | | +------+-- Palette number (bits 10-12, 0-7)
  | | +-- Priority (bit 13: 0=background, 1=foreground)
  | +-- Horizontal flip (bit 14)
  +-- Vertical flip (bit 15)
```

| Bits | Field | Range |
|------|-------|-------|
| 0--9 | Tile number | 0--1023 |
| 10--12 | Palette | 0--7 |
| 13 | Priority | 0 or 1 |
| 14 | H-flip | 0 or 1 |
| 15 | V-flip | 0 or 1 |

A single tilemap is **32x32 tiles** = 2 KB (1 Kword) in VRAM. The PPU can combine adjacent
tilemaps into 64x32, 32x64, or 64x64 tile areas via the BGnSC register.

### Tilemap VRAM addressing

The tilemap base address for each BG is set via registers:
- $2107 (BG1SC), $2108 (BG2SC), $2109 (BG3SC), $210A (BG4SC)

The tile character data base address is set via:
- $210B (BG12NBA): BG1 in low nibble, BG2 in high nibble
- $210C (BG34NBA): BG3 in low nibble, BG4 in high nibble

The nibble value is the VRAM word address >> 12 (i.e., the base address in 8 KB increments:
$0000, $2000, $4000, $6000, $8000, $A000, $C000, $E000).

## VRAM layout

The 64 KB of VRAM is shared between all tile data and tilemaps. A typical layout for a
Mode 1 RPG:

```
VRAM word address    Content
$0000-$0FFF          BG1 tileset (4bpp, up to 512 tiles = 16 KB)
$1000-$17FF          BG2 tileset (4bpp)
$1800-$1BFF          BG3 tileset (2bpp, up to 256 tiles = 4 KB)
$1C00-$1FFF          BG1 tilemap (2 KB)
$2000-$23FF          BG2 tilemap (2 KB)
$2400-$27FF          BG3 tilemap (2 KB)
$2800-$3FFF          Sprite tiles (4bpp)
```

(Actual layout varies per game -- check with bsnes-plus VRAM viewer.)

For a **256-character 2bpp font**, you need 256 * 16 = 4,096 bytes = 2,048 words of VRAM.
For a **512-character 4bpp font**, you need 512 * 32 = 16,384 bytes = 8,192 words.

## DMA transfers

The SNES has 8 DMA channels (0--7). General-purpose DMA is used during **VBlank** to
transfer data between the CPU bus (ROM, WRAM) and the PPU bus (VRAM, CGRAM, OAM).

Key registers per channel (channel `n`):

| Register | Purpose |
|----------|---------|
| $43n0 | DMA control (direction, transfer pattern) |
| $43n1 | PPU register target ($18/$19 for VRAM) |
| $43n2--$43n4 | Source address (24-bit: bank + offset) |
| $43n5--$43n6 | Transfer byte count |
| $420B | DMA enable (write bit n to start channel n) |

**Transfer patterns** (set in $43n0 bits 0--2):

| Pattern | Behavior | Use |
|---------|----------|-----|
| 0 | Write 1 byte to one register | CGRAM, OAM |
| 1 | Write 2 bytes to two registers (+0, +1) | **VRAM** ($2118/$2119) |
| 2 | Write 2 bytes to one register | Single-register pairs |
| 3 | Write 4 bytes to two registers (2x each) | |
| 4 | Write 4 bytes to four registers | |

For VRAM writes, use transfer pattern 1 targeting register $18 (VMDATA low/high).

### DMA and VWF

For a variable-width font, the typical approach is:

1. Render glyphs to a **WRAM buffer** (bit-shifting each glyph into position).
2. During VBlank, **DMA** the finished line(s) from WRAM to VRAM.
3. Update the tilemap to reference the newly written tiles.

The DMA transfer is fast enough to update several tiles per VBlank, which is why VWF is
practical on SNES but not on NES.

## HDMA

HDMA (Horizontal DMA) runs automatically during HBlank (between scanlines). It is used
for per-scanline register changes -- common uses relevant to localization:

- **Window masking**: creating dialogue box borders or shaped text windows
- **Color gradient effects**: changing the background color per scanline behind text
- **Scroll splitting**: scrolling different parts of the screen independently

HDMA is configured similarly to DMA but uses a table in WRAM/ROM that specifies values
per scanline or groups of scanlines.

## Finding font tiles in a ROM

### Method 1: CLI tile dump

Use `superfamiconv` (CLI) to decode raw tile data from a ROM region into a PNG for
inspection:

```bash
# Extract a region of ROM as 2bpp tiles and view the output PNG
dd if=game.sfc bs=1 skip=$((0x10000)) count=$((0x1000)) of=font_region.bin
superfamiconv tiles -i font_region.bin -o font_preview.png -B 2 -W 8 -H 8 --no-flip
```

Alternatively, open the ROM in a tile editor such as YY-CHR or Tile Molester (GUI) and set
the format to **2bpp SNES** (planar) or **4bpp SNES** (planar). Scroll through looking for
recognizable character shapes and note the file offset.

### Method 2: VRAM viewer in emulator

1. Load the game in **bsnes-plus** or **Mesen2**.
2. Trigger dialogue text to appear.
3. Open the VRAM/tile viewer.
4. Identify which tiles are the font and note their VRAM address.
5. Set a **write breakpoint** on that VRAM address to find the DMA transfer.
6. Trace back from the DMA source address to find where the font tiles are stored in ROM.

### Method 3: search for known glyph patterns

If you know the tile format, you can search the ROM for the binary pattern of a known
character (e.g., the letter "A" in 2bpp). This works best for standard Latin fonts.

## Tile format conversion

### superfamiconv

`superfamiconv` converts between PNG images and SNES tile/palette/tilemap data:

```bash
# Convert a font PNG to 2bpp SNES tiles
superfamiconv tiles -i font.png -o font.bin -B 2 -W 8 -H 8

# Convert 4bpp tiles
superfamiconv tiles -i font.png -o font.bin -B 4 -W 8 -H 8

# Extract palette
superfamiconv palette -i font.png -o font.pal -C 4  # 4 colors for 2bpp
```

### Manual tile encoding (Python)

```python
def encode_2bpp_tile(pixels: list[list[int]]) -> bytes:
    """Encode an 8x8 grid of pixel values (0-3) as a 16-byte SNES 2bpp tile."""
    data = bytearray(16)
    for y in range(8):
        bp0 = 0
        bp1 = 0
        for x in range(8):
            px = pixels[y][x] & 3
            bp0 |= ((px >> 0) & 1) << (7 - x)
            bp1 |= ((px >> 1) & 1) << (7 - x)
        data[y * 2 + 0] = bp0
        data[y * 2 + 1] = bp1
    return bytes(data)


def encode_4bpp_tile(pixels: list[list[int]]) -> bytes:
    """Encode an 8x8 grid of pixel values (0-15) as a 32-byte SNES 4bpp tile."""
    data = bytearray(32)
    for y in range(8):
        for bp_idx in range(4):
            val = 0
            for x in range(8):
                val |= (((pixels[y][x] >> bp_idx) & 1) << (7 - x))
            if bp_idx < 2:
                data[y * 2 + bp_idx] = val
            else:
                data[y * 2 + 16 + (bp_idx - 2)] = val
    return bytes(data)
```

## VWF implementation outline

A typical SNES variable-width font implementation:

1. **Width table**: a table in ROM, one byte per character, giving the pixel width of each
   glyph (e.g., "i" = 3px, "W" = 7px, "m" = 7px).

2. **Glyph data**: the font tiles in ROM (usually 2bpp or 4bpp, 8 pixels wide each).

3. **Render buffer**: a region in WRAM that accumulates the rendered line. For 2bpp, each
   tile in the buffer is 16 bytes. A typical buffer holds 32 tiles (256 pixels wide).

4. **Bit-shift compositing**: when rendering a glyph, the engine:
   - Reads the glyph tile data from ROM
   - Shifts each row right by `current_x_offset % 8` bits
   - ORs the shifted data into the current tile(s) in the WRAM buffer
   - Advances `current_x_offset` by the glyph width

5. **DMA to VRAM**: during NMI/VBlank, the engine DMAs the updated tiles from the WRAM
   buffer to VRAM. Typically only the tiles that changed are transferred.

6. **Tilemap update**: the engine writes sequential tile numbers into the BG tilemap for
   the text area.

### Identifying VWF in a ROM

Look for these 65816 patterns:
- **Width table lookups**: `LDA width_table,X` or `LDA width_table,Y` where the index is
  the character code
- **Bit shifting**: `LSR` / `ROR` in a loop, or `ASL` / `ROL` -- shifting glyph data
- **Byte masking**: `AND #$07` (to get sub-tile pixel offset from total X position)
- **DMA setup writes**: stores to $4300-$430A followed by a write to $420B

## Super FX (GSU) and ROM access

Games using the **Super FX** (Graphics Support Unit) coprocessor present a unique constraint:
while the GSU is executing, **the SNES CPU cannot access ROM**. The two processors share a
single ROM bus with no arbitration -- the GSU locks the bus entirely during its run. The GSU
has a small **512-byte instruction cache** to reduce ROM bus contention, but data fetches
still require bus access.

This matters for localization because:

- **Font data stored in ROM** is inaccessible to the SNES CPU while the GSU is active. If a
  Super FX game renders text during gameplay (not just during paused menus), the font tiles
  and text strings must be **pre-loaded into WRAM** before the GSU starts, or the GSU must
  be halted for the CPU to read ROM.
- Most Super FX games (_Star Fox_, _Yoshi's Island_, _Doom_, _Stunt Race FX_) are
  action-oriented with minimal in-game text, so this is rarely a practical barrier. However,
  if you are patching text rendering into a Super FX game, be aware that ROM reads during
  GSU-active frames will return open bus.
- The GSU also has its own **backup RAM** (up to 64 KB on some boards) that is accessible to
  both the GSU and the SNES CPU (when the GSU is stopped). Modified font data or expanded
  text could potentially be placed here.

([Super FX -- SNESdev Wiki](https://snes.nesdev.org/wiki/Super_FX),
[fullsnes -- Super FX chapter](https://problemkaputt.de/fullsnes.htm))

## References

- SNESdev Wiki -- Tiles: <https://snes.nesdev.org/wiki/Tiles>
- SNESdev Wiki -- Backgrounds: <https://snes.nesdev.org/wiki/Backgrounds>
- SNESdev Wiki -- Tilemaps: <https://snes.nesdev.org/wiki/Tilemaps>
- SNESdev Wiki -- DMA: <https://snes.nesdev.org/wiki/DMA>
- fullsnes -- PPU chapter: <https://problemkaputt.de/fullsnes.htm>
- superfamiconv: <https://github.com/Optiroc/SuperFamiconv>
