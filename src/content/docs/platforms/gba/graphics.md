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
