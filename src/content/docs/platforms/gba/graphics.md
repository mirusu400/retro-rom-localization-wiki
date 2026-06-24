---
title: "GBA Graphics and Fonts"
description: "GBA graphics system for localization: BG modes, 4bpp/8bpp tile format, charblocks, screen entries, OBJ tiles, palettes, and practical techniques for finding and modifying font tiles."
sidebar:
  order: 4
---

Understanding the GBA graphics system is essential for localization because **fonts are stored as
tile graphics**. Modifying a game's character set means editing (or replacing) tile data in ROM
and potentially adjusting palette and tile-map entries.

Source: [GBATEK — LCD](https://problemkaputt.de/gbatek.htm), specifically the VRAM, character data,
and BG map sections.

## BG modes

The GBA supports six display modes, set via bits 0-2 of the DISPCNT register (`0x04000000`).
**Most text-heavy RPGs and adventure games use Mode 0**, which provides four tiled background
layers.

| Mode | Type | BG layers | Tile/Bitmap | Notes |
|---|---|---|---|---|
| **0** | Tiled | BG0, BG1, BG2, BG3 | Tiled (all text mode) | Most common for dialogue-heavy games |
| **1** | Tiled | BG0, BG1, BG2 | BG0-1 text, BG2 rotation/scaling | Common for overworld + effects |
| **2** | Tiled | BG2, BG3 | Rotation/scaling only | Mode 7-style effects |
| **3** | Bitmap | BG2 only | 240x160, 15-bit color | Full-screen bitmap, rare for text |
| **4** | Bitmap | BG2 only | 240x160, 8-bit indexed, double-buffered | Sometimes used for FMV or menus |
| **5** | Bitmap | BG2 only | 160x128, 15-bit color, double-buffered | Rare |

For localization, you will almost always be working with **Mode 0 or Mode 1** (tiled modes).
Bitmap modes (3-5) are occasionally used for title screens or special menus where text is
rendered as pixels rather than tiles.

## VRAM layout

VRAM occupies 96 KB at `0x06000000`-`0x06017FFF`. In tiled modes, it is divided between
background data and sprite (OBJ) data:

```
0x06000000  ┌──────────────────────────────┐
            │  BG Charblock 0 (16 KB)      │  Tile pixel data
0x06004000  ├──────────────────────────────┤
            │  BG Charblock 1 (16 KB)      │
0x06008000  ├──────────────────────────────┤
            │  BG Charblock 2 (16 KB)      │
0x0600C000  ├──────────────────────────────┤
            │  BG Charblock 3 (16 KB)      │
0x06010000  ├──────────────────────────────┤
            │  OBJ Charblock (32 KB)       │  Sprite tile data
0x06018000  └──────────────────────────────┘
```

- **BG charblocks 0-3** (`0x06000000`-`0x0600FFFF`, 64 KB total): store background tile
  pixel data. Each charblock is 16 KB.
- **OBJ charblock** (`0x06010000`-`0x06017FFF`, 32 KB): stores sprite tile pixel data.

BG screenblocks (tile maps) also live within the 64 KB BG area. Each screenblock is 2 KB,
and their addresses overlap with charblock space — a game must plan its layout so tile data
and map data do not collide.

### Which charblock holds the font?

The BGxCNT registers (`0x04000008`-`0x0400000E`) specify which charblock and screenblock each
background layer uses:

| Bits | Field | Values |
|---|---|---|
| 2-3 | Charblock base | 0-3 (charblock number, x `0x4000`) |
| 8-12 | Screenblock base | 0-31 (screenblock number, x `0x0800`) |
| 7 | Color mode | 0 = 4bpp (16 colors), 1 = 8bpp (256 colors) |

To find the font charblock, check which BG layer displays dialogue text, read its BGxCNT register,
and extract the charblock base. In mGBA's debugger, the tile viewer shows the contents of each
charblock visually.

## Tile pixel format

Each tile is **8x8 pixels**. The GBA supports two color depths:

### 4bpp tiles (16 colors, 32 bytes per tile)

Each row of 8 pixels occupies 4 bytes. Two pixels are packed per byte, with the lower nibble
being the left pixel and the upper nibble being the right pixel:

```
Byte layout for one 8-pixel row (4 bytes):

  Byte 0        Byte 1        Byte 2        Byte 3
  [px1|px0]     [px3|px2]     [px5|px4]     [px7|px6]
   hi  lo        hi  lo        hi  lo        hi  lo

Each nibble (4 bits) is a palette index 0-15.
Palette index 0 is transparent.
```

A complete 4bpp tile (8 rows x 4 bytes) = **32 bytes**.

At 4bpp, one charblock (16 KB) can hold 16384 / 32 = **512 tiles**.

### 8bpp tiles (256 colors, 64 bytes per tile)

Each pixel is one full byte, directly indexing the 256-color palette:

```
Byte layout for one 8-pixel row (8 bytes):

  Byte 0  Byte 1  Byte 2  Byte 3  Byte 4  Byte 5  Byte 6  Byte 7
  [px0]   [px1]   [px2]   [px3]   [px4]   [px5]   [px6]   [px7]

Each byte is a palette index 0-255.
Palette index 0 is transparent.
```

A complete 8bpp tile (8 rows x 8 bytes) = **64 bytes**.

At 8bpp, one charblock (16 KB) can hold 16384 / 64 = **256 tiles**.

### Localization implication

4bpp mode gives you **more tile slots** (512 per charblock) but only 16 colors per palette
sub-group. For most fonts (which are monochrome or use few colors), 4bpp is sufficient and
preferred because it leaves more room for glyph tiles.

8bpp mode gives better color variety but halves the available tile count. It is sometimes used
for anti-aliased or multi-colored fonts.

## BG screen entries (tile map)

The tile map tells the hardware which tile to display at each grid position. In text BG mode
(Mode 0/1), each screen entry is **16 bits (2 bytes)**:

```
Bit:  15 14 13 12  11  10  9  8  7  6  5  4  3  2  1  0
      [  palette ]  VF  HF [        tile number         ]

Bits 0-9:   Tile number (0-1023)
Bit 10:     Horizontal flip (0 = normal, 1 = flipped)
Bit 11:     Vertical flip (0 = normal, 1 = flipped)
Bits 12-15: Palette number (0-15, for 4bpp mode only; ignored in 8bpp)
```

For text rendering, the game writes tile indices into the screenblock to spell out text. Each
character in the game's encoding maps to a tile number. Understanding this mapping is key to
decoding the text engine.

### Rotation/scaling BG screen entries

In rotation/scaling mode (Mode 1 BG2, Mode 2), each screen entry is only **8 bits (1 byte)**:

```
Bits 0-7: Tile number (0-255)
```

No flip or palette fields — always 256 colors, no flip. This limits the charset to 256 tiles
maximum, which constrains localization for scripts with large character sets.

### Screenblock sizes

| BG size setting | Dimensions | Screenblock count | Total map size |
|---|---|---|---|
| 0 | 32 x 32 tiles (256x256 px) | 1 | 2 KB |
| 1 | 64 x 32 tiles (512x256 px) | 2 | 4 KB |
| 2 | 32 x 64 tiles (256x512 px) | 2 | 4 KB |
| 3 | 64 x 64 tiles (512x512 px) | 4 | 8 KB |

## OBJ (sprite) tiles

Some games render text using sprites (OBJ) rather than backgrounds — especially for floating
damage numbers, item names, or dialogue over a Mode 7-style background.

- OBJ tile data lives at `0x06010000`-`0x06017FFF` (32 KB).
- OBJ tiles can be 4bpp or 8bpp, controlled per-sprite in OAM.
- **1D mapping** (DISPCNT bit 6 = 1): tiles are addressed linearly by tile number. Most games
  use this mode.
- **2D mapping** (DISPCNT bit 6 = 0): tiles are laid out in a 32-tile-wide grid. Less common.

OBJ sprites can be various sizes (8x8 to 64x64), composed of multiple 8x8 tiles.

## Sprite-based (OAM) text rendering

Some GBA games render dialogue text using OBJ sprites instead of (or in addition to) background
tiles. This is more complex than BG-based text but gives the engine capabilities that BG layers
alone cannot provide.

Source: [GBATEK — LCD OBJ / OAM Attributes](https://problemkaputt.de/gbatek.htm)

### Why games use sprite text

- **Layering over multiple BGs.** A sprite text box can float above all four BG layers without
  consuming a BG layer for the dialogue window. This is valuable when Mode 0 already uses all
  four BGs for the game scene (e.g., parallax scrolling, HUD, map).
- **Per-character animation.** Each character can be an independent OBJ with its own position,
  enabling effects like typewriter reveals, bounce-in, shake, or wave — common in RPG and
  visual novel dialogue.
- **Positioning freedom.** BG text is locked to the 8x8 tile grid (or requires per-scanline
  scroll tricks). Sprites can be placed at arbitrary pixel coordinates, which is useful for
  name labels that track a character on screen or for floating damage numbers.
- **Semi-transparency.** OBJ attribute 0 bits 10-11 can set an OBJ to semi-transparent mode
  (mode 1), blending the text with whatever is behind it — used for ghost text, fade effects,
  and so on.

### OAM entry format

OAM (Object Attribute Memory) lives at `0x07000000`-`0x070003FF` and holds **128 entries**
of 8 bytes each. Each entry has three 16-bit attributes (the fourth halfword is used for
rotation/scaling parameters and is shared across entries).

**Attribute 0** (`0x07000000 + n*8 + 0`):

| Bits | Field | Values |
|---|---|---|
| 0-7 | Y coordinate | 0-255 (wraps at 256) |
| 8 | Rotation/scaling flag | 0 = off, 1 = on |
| 9 | Double-size (if rot/scale) / OBJ disable (if no rot/scale) | 0 = normal, 1 = double-size or hidden |
| 10-11 | OBJ mode | 0 = normal, 1 = semi-transparent, 2 = OBJ window, 3 = prohibited |
| 12 | Mosaic | 0 = off, 1 = on |
| 13 | Color mode | 0 = 4bpp (16 colors), 1 = 8bpp (256 colors) |
| 14-15 | Shape | 0 = square, 1 = horizontal, 2 = vertical, 3 = prohibited |

**Attribute 1** (`0x07000000 + n*8 + 2`):

| Bits | Field | Values |
|---|---|---|
| 0-8 | X coordinate | 0-511 (wraps at 512; values 240-511 appear off-screen left) |
| 9-13 | Rotation/scaling parameter (if rot/scale on) | Selects one of 32 parameter sets |
| 12 | Horizontal flip (if rot/scale off) | 0 = normal, 1 = mirrored |
| 13 | Vertical flip (if rot/scale off) | 0 = normal, 1 = mirrored |
| 14-15 | Size | 0-3 (combined with shape to determine pixel dimensions) |

**Attribute 2** (`0x07000000 + n*8 + 4`):

| Bits | Field | Values |
|---|---|---|
| 0-9 | Tile number | 0-1023 (index into OBJ VRAM) |
| 10-11 | Priority relative to BG | 0 = highest, 3 = lowest |
| 12-15 | Palette number | 0-15 (4bpp mode only; ignored in 8bpp) |

**OBJ size table** (shape x size determines pixel dimensions):

| Size | Square (0) | Horizontal (1) | Vertical (2) |
|---|---|---|---|
| 0 | 8x8 | 16x8 | 8x16 |
| 1 | 16x16 | 32x8 | 8x32 |
| 2 | 32x32 | 32x16 | 16x32 |
| 3 | 64x64 | 64x32 | 32x64 |

### OBJ tile addressing and the 1D/2D distinction

The tile number in attribute 2 (bits 0-9) indexes into OBJ VRAM at `0x06010000`. How that index
maps to memory depends on DISPCNT bit 6:

- **1D mapping** (bit 6 = 1): tiles for a multi-tile sprite are stored sequentially.
  A 16x16 4bpp sprite with tile number `T` uses tiles `T`, `T+1`, `T+2`, `T+3` (each 32 bytes
  apart). Address = `0x06010000 + T * 32` (4bpp) or `0x06010000 + T * 64` (8bpp, but tile
  number must be even).
- **2D mapping** (bit 6 = 0): tiles are arranged in a virtual 32-tile-wide grid. A 16x16 sprite
  uses tiles `T`, `T+1` (first row) and `T+32`, `T+33` (second row). This matters when you are
  trying to find which tile data corresponds to which displayed character.

Most GBA games use 1D mapping. Check DISPCNT to confirm.

### Tile budget for OBJ text

OBJ VRAM is 32 KB (`0x06010000`-`0x06017FFF`) in tiled modes 0-2, but only 16 KB
(`0x06014000`-`0x06017FFF`) in bitmap modes 3-5.

At 4bpp (32 bytes/tile): 32 KB holds **1024 tiles** (modes 0-2) or **512 tiles** (modes 3-5).

This budget is shared with all other sprites (characters, UI icons, cursors). In practice, a
text engine using OBJ rendering must carefully manage which glyph tiles are loaded into OBJ VRAM
at any given time — typically maintaining a small cache of recently used tiles and evicting old
ones. This is relevant for localization because a target script with more glyphs (e.g., Hangul or
CJK) puts more pressure on the OBJ tile cache.

### Identifying OAM-based text

Signs that a game renders text through sprites rather than BG tiles:

1. **mGBA's OBJ viewer** shows recognizable glyph tiles in OBJ VRAM (`0x06010000`+) while the
   BG tile viewers show no font data.
2. **The OAM viewer** shows many small sprites (8x8 or 8x16) arranged in a line where text
   appears on screen. Each sprite's tile number points to a different glyph tile.
3. **Setting a write breakpoint on OAM** (`0x07000000`) during text display — the game writes
   OAM entries to position each character sprite.
4. **Disabling OBJ display** (clear DISPCNT bit 12) causes dialogue text to vanish while
   backgrounds remain.

### Localization implications of OAM text

**Separate tile space.** OBJ tiles at `0x06010000` are independent from BG tiles. If you expand
the font for a new script, you must ensure the new glyph data is loaded into OBJ VRAM, not BG
VRAM. The DMA or copy routine that loads font tiles must target the correct region.

**128-sprite limit.** OAM holds only 128 entries total, shared with all game sprites. A dialogue
line of 30 characters uses 30 entries (assuming 8x8 per character), which can be a significant
fraction. Some engines mitigate this by pre-rendering text into larger tiles (e.g., one 32x8
sprite per word) to reduce entry count — but this changes how you hook the text renderer.

**Per-scanline OBJ limit.** The GBA can only render **128 OBJ pixels per scanline** (not 128
sprites — 128 pixels of sprite width). A full line of 8x8 character sprites spanning the screen
(240 pixels) exceeds this limit, causing sprites on the right to flicker or vanish. Games work
around this by rendering text into wider composite sprites or by using BG layers for the text
body and sprites only for effects. If your translation produces longer lines, watch for this
limit.

**Hooking the renderer.** To add VWF or change the encoding for OAM-based text, you must hook
the routine that writes OAM entries (not the BG map-writing routine). The hook point is
typically the function that iterates over the string, allocates an OAM slot per character, sets
the tile number and X position, and copies glyph data to OBJ VRAM.

## Palettes

- **BG palette**: `0x05000000`-`0x050001FF` (512 bytes, 256 colors).
  - In 4bpp mode, divided into 16 sub-palettes of 16 colors each.
  - In 8bpp mode, one single 256-color palette.
- **OBJ palette**: `0x05000200`-`0x050003FF` (512 bytes, 256 colors).
  - Same 4bpp/8bpp division as BG palette.

Each color is a **16-bit value** in BGR555 format:

```
Bit:  15    14 13 12 11 10    9  8  7  6  5    4  3  2  1  0
      [0]   [   blue (5)  ]  [ green (5)   ]  [  red (5)    ]
```

For font tiles, you typically only need 2-3 colors (background/transparent, font foreground,
and optionally a shadow/outline color). When adding a new font, you may need to assign a
palette sub-group or reuse an existing one that has suitable colors.

## How to find font tiles in a ROM

### Method 1: tile viewer in emulator

1. Open the game in **mGBA** or **Mesen2** with the tile viewer.
2. Navigate to a screen showing text (dialogue, menu).
3. In the tile viewer, look at the charblocks — you should see recognizable letter/glyph shapes.
4. Note the charblock number and the starting tile index.
5. The address in VRAM tells you where the font was loaded. Cross-reference this with DMA or
   `memcpy` calls to find the ROM source address.

### Method 2: search ROM for tile patterns

Font tiles often start with common characters (space, then A-Z or hiragana). In a hex editor:

- At 4bpp, a blank (space) tile is 32 bytes of `0x00`.
- Look for a sequence of 32-byte `0x00` followed by recognizable 4bpp patterns.
- Tools like **Tile Molester** or **YY-CHR** can open a ROM and display it as raw tile data
  — scrub through the ROM visually to find font graphics.

### Method 3: breakpoint on VRAM writes

1. In mGBA, set a write breakpoint on the VRAM address where font tiles appear.
2. The game will break when it copies font data to VRAM.
3. Examine the source register — it points to the font data in ROM (or to a decompression
   buffer in EWRAM if the font is compressed).

### Method 4: trace DMA transfers

Many games use DMA (especially DMA3) to copy font tiles from ROM to VRAM. Monitor DMA3
source/destination registers:

| Register | Address | Description |
|---|---|---|
| DMA3SAD | `0x040000D4` | Source address (often points to ROM) |
| DMA3DAD | `0x040000D8` | Destination address (often points to VRAM) |
| DMA3CNT | `0x040000DC` | Transfer count and control |

## Practical example: font tile layout

A typical Japanese GBA game might store its font as 4bpp 8x8 tiles starting at ROM offset
`0x001A0000` (pointer `0x081A0000`). The first tiles would be:

```
Tile 0x00: (space / blank)
Tile 0x01-0x50: Hiragana あ-ん + variants
Tile 0x51-0xA0: Katakana ア-ン + variants
Tile 0xA1-0xCA: ASCII digits + punctuation
Tile 0xCB+:     Kanji (if any)
```

For localization, you would:
1. Identify which tiles are unused or expendable.
2. Replace them with your target script's glyphs.
3. Update the text encoding table to map your characters to the new tile indices.
4. If the target script needs more tiles than available, consider expanding the charset
   (see [Encoding and Fonts](/retro-rom-localization-wiki/encoding-and-fonts/)).

## References

- [GBATEK — LCD VRAM Overview](https://problemkaputt.de/gbatek.htm)
- [GBATEK — LCD VRAM Character Data](https://problemkaputt.de/gbatek.htm)
- [GBATEK — LCD I/O Display Control](https://problemkaputt.de/gbatek.htm)
