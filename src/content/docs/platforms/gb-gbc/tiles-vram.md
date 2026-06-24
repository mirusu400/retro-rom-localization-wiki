---
title: "GB/GBC Tiles and VRAM"
description: "Game Boy / Game Boy Color tile data format (2bpp), VRAM layout, tile addressing modes, BG/Window tile maps, GBC enhancements, and how fonts are stored and rendered for localization."
sidebar:
  order: 4
---

Every visual element on the Game Boy -- backgrounds, window overlays, sprites -- is
built from 8x8 pixel **tiles**. For localization, fonts are tiles: each character
glyph is one (or more) tiles stored in VRAM. Understanding the tile data format and
VRAM layout is fundamental to finding, editing, and expanding font data.

Reference: [Pan Docs -- Tile Data](https://gbdev.io/pandocs/Tile_Data.html),
[Pan Docs -- Tile Maps](https://gbdev.io/pandocs/Tile_Maps.html) (CC0)

## 2bpp Tile Data Format

Each tile is 8x8 pixels at 2 bits per pixel (2bpp), giving 4 possible color values
per pixel (color indices 0-3). One tile occupies **16 bytes** (8 rows x 2 bytes per row).

### Byte layout

Each row of 8 pixels is encoded as **2 bytes**: a low byte and a high byte. The bits
from both bytes combine to form the 2-bit color index for each pixel.

```
Row N:  [Low byte]  [High byte]
        bit 7..0    bit 7..0

Pixel 0 (leftmost):  color = (high_bit7 << 1) | low_bit7
Pixel 1:             color = (high_bit6 << 1) | low_bit6
Pixel 2:             color = (high_bit5 << 1) | low_bit5
  ...
Pixel 7 (rightmost): color = (high_bit0 << 1) | low_bit0
```

The **leftmost** pixel uses the **highest** bit (bit 7) of each byte. The rightmost
pixel uses bit 0.

### Color index values

| Color index | DMG shade | GBC |
|-------------|-----------|-----|
| 0 | White (lightest) | Palette color 0 |
| 1 | Light gray | Palette color 1 |
| 2 | Dark gray | Palette color 2 |
| 3 | Black (darkest) | Palette color 3 |

DMG shades are set by the BGP register (`0xFF47`); GBC uses programmable RGB palettes.

### Worked Example: The Letter "A"

Here is an 8x8 "A" glyph encoded as 2bpp tile data. Color 3 (black) for the letter,
color 0 (white) for background:

```
Pixel grid (. = color 0, # = color 3):

Row 0: . . # # # # . .
Row 1: . # # . . # # .
Row 2: # # . . . . # #
Row 3: # # . . . . # #
Row 4: # # # # # # # #
Row 5: # # . . . . # #
Row 6: # # . . . . # #
Row 7: . . . . . . . .
```

Encoding each row (color 3 = both bits set, color 0 = both bits clear):

```
Row  Pixels              Low byte    High byte   Hex
 0   ..####..             0b00111100  0b00111100  $3C $3C
 1   .##..##.             0b01100110  0b01100110  $66 $66
 2   ##....##             0b11000011  0b11000011  $C3 $C3
 3   ##....##             0b11000011  0b11000011  $C3 $C3
 4   ########             0b11111111  0b11111111  $FF $FF
 5   ##....##             0b11000011  0b11000011  $C3 $C3
 6   ##....##             0b11000011  0b11000011  $C3 $C3
 7   ........             0b00000000  0b00000000  $00 $00
```

The 16-byte tile in ROM/VRAM: `3C 3C 66 66 C3 C3 C3 C3 FF FF C3 C3 C3 C3 00 00`

### Important nuance: mixed colors

If the low byte and high byte have different bits, you get colors 1 or 2:

```
Low bit  High bit  Color index
   0        0         0  (white on DMG)
   1        0         1  (light gray)
   0        1         2  (dark gray)
   1        1         3  (black)
```

Most text fonts use only colors 0 and 3 (both bits same = simple on/off), but some
games use shading or anti-aliasing with colors 1 and 2.

## VRAM Tile Data Area (`0x8000`-`0x97FF`)

VRAM holds up to **384 tiles** (on DMG) in three 128-tile blocks:

| Block | Address | Tiles |
|-------|---------|-------|
| Block 0 | `0x8000`-`0x87FF` | Tiles 0-127 |
| Block 1 | `0x8800`-`0x8FFF` | Tiles 128-255 |
| Block 2 | `0x9000`-`0x97FF` | Tiles 0-127 (signed addressing) |

Note that Block 1 and Block 2 overlap in their tile numbering depending on which
addressing mode is active. The total unique tile storage is 6 KB = 384 tiles.

### Two Addressing Modes

The LCDC register bit 4 (`0xFF40` bit 4) controls which addressing mode the
background and window layers use:

#### `0x8000` method (LCDC bit 4 = 1, unsigned)

Tile indices are **unsigned** bytes (`0x00`-`0xFF`):
- Tile 0 = `0x8000` (Block 0 start)
- Tile 127 = `0x87F0` (Block 0 end)
- Tile 128 = `0x8800` (Block 1 start)
- Tile 255 = `0x8FF0` (Block 1 end)

This mode uses **Block 0 + Block 1** (tiles 0-255). Block 2 is inaccessible to
BG/Window in this mode (but sprites always use this mode).

#### `0x8800` method (LCDC bit 4 = 0, signed)

Tile indices are **signed** bytes (`-128` to `127`), with the zero point at `0x9000`:
- Tile 0 = `0x9000` (Block 2 start)
- Tile 127 = `0x97F0` (Block 2 end)
- Tile -128 (= unsigned 128) = `0x8800` (Block 1 start)
- Tile -1 (= unsigned 255) = `0x8FF0` (Block 1 end)

This mode uses **Block 1 + Block 2** (tiles 128-255 + 0-127 by unsigned index,
but numbered -128 to 127 by signed index). Block 0 is inaccessible to BG/Window
in this mode.

#### Sprites (OBJ) always use `0x8000` addressing

Regardless of LCDC bit 4, sprites always reference tiles using unsigned indices
starting at `0x8000`. This means:
- Sprites can only use tiles from Block 0 and Block 1 (`0x8000`-`0x8FFF`)
- If BG uses `0x8800` mode, Block 1 tiles are shared between BG and sprites
- Block 2 (`0x9000`-`0x97FF`) is BG/Window-exclusive in `0x8800` mode

### Addressing mode implications for localization

Most games use the `0x8000` method (unsigned). In this mode, up to 256 tiles are
available for BG/Window, shared with all background graphics. After reserving tiles
for the game's graphics (map tiles, UI elements, status icons), there might only be
60-100 tiles left for font glyphs.

**Tile budget is the primary constraint** for GB localization. If translating to a
script that needs more glyphs than available tile slots, you must use strategies
like:
- Swapping tile banks (load different font sets into VRAM as needed)
- Using DTE/MTE encoding to reduce the required glyph count
- Switching to GBC mode for VRAM Bank 1 (doubling available tiles)
- Implementing a VWF renderer that dynamically composes glyphs

## Tile Maps

Tile maps tell the PPU which tile to display at each screen position. Two tile maps
exist in VRAM:

| Map | Address | Size | LCDC control |
|-----|---------|------|-------------|
| BG Map 0 | `0x9800`-`0x9BFF` | 1024 bytes | LCDC bit 3 = 0 |
| BG Map 1 | `0x9C00`-`0x9FFF` | 1024 bytes | LCDC bit 3 = 1 |

Each map is a 32x32 grid of tile index bytes (32 x 32 = 1024 bytes). Each byte is a
tile index referencing the tile data area (using whichever addressing mode is active).

Only a 20x18 tile area (160x144 pixels) is visible on screen at any time, positioned
by the scroll registers `SCX` and `SCY`. The map wraps when scrolling past the edges.

### How text is displayed

Most GB text engines work like this:

1. Load font tiles into the tile data area (often done once at game start)
2. When displaying text, write tile indices into the tile map at the desired position
3. The tile index for each character comes from the game's character encoding table
   (`.tbl` file in localization terms)

For example, if the letter "A" is stored as tile 65 in VRAM:
```
; Display "A" at BG map position (2, 5)
; Map address = 0x9800 + (row * 32) + col = 0x9800 + (5 * 32) + 2 = 0x98A2
ld a, 65         ; tile index for "A"
ld [$98A2], a    ; write to BG map
```

### LCDC bits affecting tile maps

| Bit | Purpose | Values |
|-----|---------|--------|
| 3 | BG tile map select | 0 = `0x9800`, 1 = `0x9C00` |
| 4 | BG/Window tile data addressing | 0 = `0x8800` signed, 1 = `0x8000` unsigned |
| 5 | Window enable | 0 = off, 1 = on |
| 6 | Window tile map select | 0 = `0x9800`, 1 = `0x9C00` |

## Window Layer

The Window is an overlay layer that sits on top of the background. It is not
scrollable -- it always displays from its tile map's top-left corner. Its position
on screen is controlled by two registers:

| Register | Address | Purpose |
|----------|---------|---------|
| WY | `0xFF4A` | Window Y position (0 = top of screen) |
| WX | `0xFF4B` | Window X position + 7 (7 = left edge of screen) |

The window's visible top-left corner appears at screen coordinates `(WX - 7, WY)`.
Setting `WX = 7, WY = 0` places the window at the top-left of the screen, covering
the entire background.

### Window and text rendering

Many games use the Window layer for dialogue:

- Set `WY` to place the dialogue box at the bottom of the screen (e.g., `WY = 96`
  for a 6-tile-high text box)
- Set `WX = 7` for full-width text
- Write text tile indices to the Window's tile map area
- The BG continues to show the game world behind/above the window

This is cleaner than writing text directly to the BG map, because the dialogue text
does not interfere with the scrolling background.

## GBC Enhancements

The Game Boy Color significantly expands tile and color capabilities.

### VRAM Bank 1

GBC adds a second 8 KB VRAM bank, switchable via register `VBK` (`0xFF4F`):

| VBK value | VRAM bank | Address range |
|-----------|-----------|---------------|
| 0 | Bank 0 (default, same as DMG) | `0x8000`-`0x9FFF` |
| 1 | Bank 1 | `0x8000`-`0x9FFF` |

VRAM Bank 1 provides an additional 384 tiles of storage, for a total of **768 tiles**
across both banks. This is a massive improvement for localization:

- DMG: ~256 usable tiles for BG, shared with all game graphics
- GBC: ~512+ usable tiles for BG, with dedicated font tiles in Bank 1

### BG Map Attributes (VRAM Bank 1)

In VRAM Bank 1, the tile map addresses (`0x9800`-`0x9FFF`) hold per-tile **attribute
bytes** instead of tile indices (the tile indices remain in Bank 0):

| Bit | Purpose |
|-----|---------|
| 7 | BG-to-OBJ priority (1 = BG on top of sprites for colors 1-3) |
| 6 | Y flip (vertical mirror) |
| 5 | X flip (horizontal mirror) |
| 4 | (Not used) |
| 3 | Tile VRAM bank (0 = Bank 0, 1 = Bank 1) |
| 2-0 | BG palette number (0-7) |

**Bit 3** is key for localization: it selects whether the tile index references a tile
in VRAM Bank 0 or Bank 1. This is how you use the extra 384 tiles -- set bit 3 in the
attribute byte for tiles that reference font data stored in Bank 1.

### GBC Palettes

| Type | Count | Colors each |
|------|-------|-------------|
| BG palettes (BGP0-BGP7) | 8 | 4 colors (15-bit RGB) |
| OBJ palettes (OBP0-OBP7) | 8 | 3 colors + transparent |

Compare to DMG: 1 BG palette (4 shades), 2 OBJ palettes (3 shades + transparent).

For localization, GBC palettes allow colored text, text shadows, and other visual
enhancements not possible on DMG.

### GBC palette registers

BG palette data is written through:
- `BCPS` (`0xFF68`): Background palette index (auto-increment in bit 7)
- `BCPD` (`0xFF69`): Background palette data (write color bytes here)

Each color is 15-bit RGB: `0bbb bbgg gggr rrrr` (little-endian, 2 bytes per color).
Each palette has 4 colors = 8 bytes. All 8 palettes = 64 bytes total.

## HDMA: VRAM DMA Transfer (GBC Only)

On the original DMG, VRAM can only be written by the CPU during VBlank (~1.1 ms per
frame) or while the LCD is off. The GBC introduces a **VRAM DMA** (commonly called
HDMA) controller through registers `0xFF51`-`0xFF55` that can transfer data to VRAM
far more efficiently. This is critical for VWF implementations that need to stream
rendered tiles to VRAM every frame.

Reference: [Pan Docs -- CGB Registers](https://gbdev.io/pandocs/CGB_Registers.html) (CC0)

### Registers

| Register | Address | Purpose |
|----------|---------|---------|
| HDMA1 | `0xFF51` | Source high byte |
| HDMA2 | `0xFF52` | Source low byte (lower 4 bits ignored) |
| HDMA3 | `0xFF53` | Destination high byte (only bits 12-4 within `0x8000`-`0x9FF0`) |
| HDMA4 | `0xFF54` | Destination low byte (lower 4 bits ignored) |
| HDMA5 | `0xFF55` | Length / mode / start trigger |

Source must be in ROM, SRAM, or WRAM (`0x0000`-`0x7FF0` or `0xA000`-`0xDFF0`).
Destination is always within VRAM (`0x8000`-`0x9FF0`). Transfers are always aligned
to 16-byte boundaries.

### Two DMA Modes

**General-Purpose DMA** (HDMA5 bit 7 = 0): Transfers the entire block at once. The
CPU halts until the transfer completes. Best used during VBlank or with the LCD off.

**H-Blank DMA** (HDMA5 bit 7 = 1): Transfers **16 bytes ($10) per H-Blank** period
(one transfer per scanline during mode 0, for scanlines LY=0 through LY=143). No
transfer occurs during VBlank (LY=144-153); the transfer resumes at LY=0 on the
next frame. The CPU continues executing between transfers.

The transfer length is encoded in HDMA5 bits 6-0 as `(length / $10) - 1`. A value
of `0x00` transfers one block ($10 bytes = 1 tile); `0x7F` transfers 128 blocks
($800 bytes = 128 tiles).

Reading HDMA5 returns the remaining block count minus 1 in bits 6-0, or `0xFF` when
no transfer is active. Bit 7 reads as 0 while a transfer is active, 1 otherwise.

### H-Blank DMA transfer budget per frame

Each H-Blank transfer moves $10 bytes (exactly one 2bpp tile). With 144 visible
scanlines per frame, H-Blank DMA can transfer up to **144 tiles per frame** if a
transfer of sufficient length is configured. In practice, you typically need far
fewer: a VWF renderer producing one to three tiles per character only needs a handful
of transfers per text-advance frame.

Each 16-byte block transfer takes approximately 8 microseconds of real time (8 M-cycles in
normal speed, 16 "fast" M-cycles in double-speed mode), regardless of CPU speed.

### Localization relevance

H-Blank DMA is the preferred method for VWF tile streaming on GBC:

- **No VBlank bottleneck:** Instead of cramming all tile writes into the ~1.1 ms
  VBlank window, tiles trickle into VRAM across the frame via H-Blank transfers.
- **CPU stays free:** Between H-Blank transfers, the CPU can continue executing
  the VWF bit-shift compositing code, preparing the next tile while the previous
  one is being transferred.
- **Workflow:** The VWF renderer composes a tile in WRAM, sets HDMA1-4 to point
  from the WRAM buffer to the target VRAM tile slot, and writes HDMA5 with bit 7
  set and length = 0 (one block). The DMA completes at the next H-Blank.

Important caveats:
- Do not start an H-Blank DMA write to HDMA5 during an H-Blank period (STAT mode 0).
- Do not switch the VRAM bank (`0xFF4F`) or the source ROM/SRAM bank while a
  transfer is in progress.
- H-Blank DMA is GBC-only. DMG-target patches must fall back to CPU-driven VBlank
  writes.

## Font Storage Patterns in GB Games

### Pattern 1: Font in a contiguous ROM block

The most common pattern. Font tiles are stored sequentially in ROM and copied to VRAM
at initialization. The text engine uses a direct mapping: character code N = tile
index N (or N + offset).

To find the font:
1. Open a tile viewer in your emulator (mGBA, BGB, SameBoy all have one)
2. Display some text in the game
3. Note the tile indices used for text characters
4. Search the ROM for the corresponding 16-byte tile patterns

### Pattern 2: Font loaded per-scene

Some games load different tile sets for different scenes, including fonts. The font
tiles might share space with scene-specific graphics. This makes it harder to patch --
you need to ensure the font is loaded in every scene that displays text.

### Pattern 3: Compressed font

Some games compress tile data (LZ, RLE, or custom compression) and decompress into
VRAM. You must identify the compression format, decompress, modify the font tiles,
recompress, and reinsert. See the [compression](/retro-rom-localization-wiki/compression) page.

### Pattern 4: Dynamically generated tiles (VWF)

Variable-width font renderers generate tiles at runtime by compositing glyphs from
a master font bitmap into a tile buffer. Each "tile" in VRAM may contain parts of
multiple characters. This is the most complex pattern but enables proportional-width
text and larger character sets.

## Practical: Converting Tiles with rgbgfx

[rgbgfx](https://rgbds.gbdev.io/docs/rgbgfx.1) (part of RGBDS) converts between
PNG images and GB 2bpp tile data.

### PNG to 2bpp tiles

```bash
# Convert a PNG font sheet to 2bpp tile data
rgbgfx -o font.2bpp font.png

# With palette specification (4-shade grayscale)
rgbgfx -c '#ffffff,#aaaaaa,#555555,#000000' -o font.2bpp font.png
```

Requirements for the input PNG:
- Width must be a multiple of 8 pixels
- Height must be a multiple of 8 pixels
- Maximum 4 colors (matching the target palette)

### 2bpp tiles to PNG

```bash
# Convert extracted tile data back to PNG for editing
rgbgfx -r -o font.png font.2bpp

# Specify tile width (number of tiles per row in the output image)
rgbgfx -r -w 16 -o font.png font.2bpp
```

### Localization workflow

1. Dump the font tiles from ROM (find them via tile viewer, extract the bytes)
2. Convert to PNG: `rgbgfx -r -w 16 -o font.png font.2bpp`
3. Edit the PNG in a graphics editor (add/modify glyphs)
4. Convert back: `rgbgfx -o font_new.2bpp font.png`
5. Reinsert the bytes at the original ROM offset (or a new location if expanding)

## Tile Budget Planning

When planning a localization, estimate your tile budget:

| Component | Typical tile count |
|-----------|--------------------|
| Font (English A-Z, a-z, 0-9, punctuation) | 70-80 tiles |
| Font (accented Latin for European languages) | 90-120 tiles |
| Font (Hangul, subset strategy) | 200-400 tiles |
| Game UI elements | 30-60 tiles |
| Map/scene graphics | 100-200 tiles |
| **Total available (DMG, `0x8000` mode)** | **256 tiles** |
| **Total available (GBC, both VRAM banks)** | **768 tiles** |

If your target script needs more tiles than available, consider:
- [Encoding strategies](/retro-rom-localization-wiki/encoding-and-fonts) for reducing glyph count
- [Language-specific approaches](/retro-rom-localization-wiki/languages/korean) (e.g., jamo composition for Hangul)
- Dynamic tile loading (swap font tiles per dialogue scene)
- VWF rendering (see [text patterns](./text-patterns))
