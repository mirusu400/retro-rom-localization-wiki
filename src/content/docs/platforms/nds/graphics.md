---
title: "NDS Graphics System"
description: "NDS dual-screen, dual-engine 2D/3D graphics for localization: Engine A and B, VRAM banks A-I and mapping, BG layers, tile formats, OBJ/sprites, extended palettes, 3D texture text, and how font data reaches the screen."
sidebar:
  order: 4
---

The NDS has a dual-screen, dual-engine graphics architecture that is significantly
more complex than the GBA's single-engine design. For localization, understanding
this system is essential: you need to know which engine and BG layer displays the
game's text, which VRAM bank holds the font tiles, and how the game's rendering
pipeline moves glyph data from [NFTR font files](./fonts/) (or custom font data)
onto the screen.

Source: [GBATEK -- DS Video](https://problemkaputt.de/gbatek.htm) (Martin Korth).

## Two 2D Engines

The NDS has two independent 2D rendering engines:

| Property | Engine A (main) | Engine B (sub) |
|----------|----------------|----------------|
| **Default screen** | Top | Bottom |
| **I/O base** | `0x04000000` | `0x04001000` |
| **Max BG VRAM** | 512 KB | 128 KB |
| **Max OBJ VRAM** | 256 KB | 128 KB |
| **3D support** | Yes (BG0) | No |
| **Display modes** | 0--3 | 0--1 |
| **Capture** | Yes | No |
| **Character base** | Configurable (64 KB steps) | Fixed |
| **Screen base** | Configurable (64 KB steps) | Fixed |

Both engines have their own set of BG layers, OBJ (sprite) layers, and palette
memory. They operate independently -- the game can display different BG modes on
each screen.

The screen assignment can be swapped at runtime via the POWCNT1 register
(`0x04000304`, bit 15): when set, Engine A drives the top screen; when clear,
Engine A drives the bottom screen. Many NDS games put gameplay on the top screen
(Engine A) and menus/text on the bottom screen (Engine B), but this is entirely
game-dependent.

### Localization Relevance

When debugging text display, **you must determine which engine renders the text**.
An emulator's VRAM/BG viewer (melonDS or DeSmuME) will show you which engine and
BG layer is active. If text appears on the bottom screen, it is typically Engine B;
if on the top screen, typically Engine A -- but check the POWCNT1 swap bit.

## Display Control: DISPCNT

Each engine has a DISPCNT (Display Control) register:

| Register | Address | Engine |
|----------|---------|--------|
| DISPCNT_A | `0x04000000` | Engine A |
| DISPCNT_B | `0x04001000` | Engine B |

### DISPCNT Bit Layout

| Bits | Field | Description |
|------|-------|-------------|
| 0--2 | BG Mode | Background mode (0--6 for A, 0--5 for B) |
| 3 | BG0 3D | Engine A only: `1` = BG0 uses 3D engine |
| 4 | Tile OBJ Mapping | `0` = 2D mapping, `1` = 1D mapping |
| 5 | Bitmap OBJ 2D Dim | Bitmap OBJ dimension control |
| 6 | Bitmap OBJ Mapping | `0` = 2D, `1` = 1D |
| 7 | Forced Blank | `1` = screen forced to white |
| 8--11 | Display Enable | Bit 8=BG0, 9=BG1, 10=BG2, 11=BG3 |
| 12--15 | Display Enable | Bit 12=OBJ, 13=Win0, 14=Win1, 15=OBJ Win |
| 16--17 | Display Mode | `0`=off, `1`=normal, `2`=VRAM display, `3`=main mem display (A only) |
| 18--19 | VRAM Block | Engine A only: VRAM block for display capture |
| 20--23 | Tile OBJ Boundary | Tile OBJ boundary setting |
| 24--26 | Char Base | Engine A only: character base in 64 KB steps |
| 27--29 | Screen Base | Engine A only: screen base in 64 KB steps |
| 30 | BG Ext Palette | `1` = enable BG extended palettes |
| 31 | OBJ Ext Palette | `1` = enable OBJ extended palettes |

### BG Modes

| Mode | BG0 | BG1 | BG2 | BG3 | Notes |
|------|-----|-----|-----|-----|-------|
| 0 | Text | Text | Text | Text | Most common for dialogue-heavy games |
| 1 | Text | Text | Text | Affine | |
| 2 | Text | Text | Affine | Affine | |
| 3 | Text | Text | Text | Extended | |
| 4 | Text | Text | Affine | Extended | |
| 5 | Text | Text | Extended | Extended | |
| 6 | -- | -- | Large Bitmap | -- | Engine A only (3D on BG0) |

**For localization, Mode 0 is the most common.** Games that display text with
tile-based fonts almost always use a Text BG layer. Text BGs use a tile/map
format: 8x8 pixel tiles stored in character data memory, referenced by a tilemap
(screen data) containing 16-bit map entries.

Engine B does not support Mode 6 and cannot use 3D on BG0.

### Display Modes (DISPCNT bits 16--17)

| Value | Mode | Description |
|-------|------|-------------|
| 0 | Off | Screen displays white |
| 1 | Normal | Standard BG + OBJ rendering (the usual mode) |
| 2 | VRAM Display | Engine A only: displays a VRAM bank directly as a 256x192 bitmap |
| 3 | Main Memory Display | Engine A only: displays from main RAM via DMA |

Normal mode (1) is what virtually all games use for text rendering. VRAM Display
mode (2) is occasionally used for cutscenes or static images.

## VRAM Banks (A--I)

Unlike the GBA's single contiguous VRAM region, the NDS splits its 656 KB of
VRAM across **nine independently mappable banks**. Each bank can be assigned to
different purposes via its VRAM Control register.

### Bank Sizes and Control Registers

| Bank | Size | Control Register | Notes |
|------|------|-----------------|-------|
| **A** | 128 KB | `0x04000240` | Large bank, typically Engine A BG or textures |
| **B** | 128 KB | `0x04000241` | Large bank, typically Engine A BG/OBJ or textures |
| **C** | 128 KB | `0x04000242` | Can serve Engine A, Engine B, textures, or ARM7 |
| **D** | 128 KB | `0x04000243` | Can serve Engine A, Engine B OBJ, textures, or ARM7 |
| **E** | 64 KB | `0x04000244` | Engine A BG/OBJ, extended palettes, or textures |
| **F** | 16 KB | `0x04000245` | Extended palettes, Engine A BG/OBJ, or texture palettes |
| **G** | 16 KB | `0x04000246` | Same options as F |
| **H** | 32 KB | `0x04000248` | Engine B BG or Engine B extended palettes |
| **I** | 16 KB | `0x04000249` | Engine B BG/OBJ or Engine B extended palettes |

**Total: 656 KB** (4 x 128 KB + 64 KB + 2 x 16 KB + 32 KB + 16 KB).

### VRAMCNT Register Format (8 bits per bank)

| Bit(s) | Field | Description |
|--------|-------|-------------|
| 0--2 | MST | Mapping mode (purpose assignment) |
| 3--4 | Offset | Address offset within the mapped region (0--3) |
| 5--6 | Unused | |
| 7 | Enable | `0` = bank disabled, `1` = bank enabled |

The MST field determines what purpose the bank serves. The Offset field selects
which slot within that purpose the bank occupies (not used by banks E, H, I).

### Bank Mapping Table

| MST | Banks | Purpose | ARM9 Address |
|-----|-------|---------|-------------|
| 0 | A--I | LCDC (direct CPU access) | `0x06800000` + bank offset |
| 1 | A,B,C,D | Engine A BG | `0x06000000` + (Offset x `0x20000`) |
| 1 | E | Engine A BG | `0x06000000` |
| 1 | F,G | Engine A BG | `0x06000000` + offset-dependent |
| 2 | A,B | Engine A OBJ | `0x06400000` + (Offset x `0x20000`) |
| 2 | E | Engine A OBJ | `0x06400000` |
| 2 | F,G | Engine A OBJ | `0x06400000` + offset-dependent |
| 2 | C,D | ARM7 WRAM | `0x06000000` (ARM7 bus) |
| 3 | A,B,C,D | 3D Texture Slot | Slot 0--3 |
| 4 | C | Engine B BG | `0x06200000` |
| 4 | D | Engine B OBJ | `0x06600000` |
| 4 | H | Engine B BG | `0x06200000` |
| 4 | I | Engine B BG | `0x06208000` |
| 5 | I | Engine B OBJ | `0x06600000` |
| 4 | E,F,G | Engine A BG Ext Palette | (not CPU-mapped while allocated) |
| 5 | E,F,G | Engine A OBJ Ext Palette | (not CPU-mapped while allocated) |
| 4 | H | Engine B BG Ext Palette | (not CPU-mapped while allocated) |
| 5 | I | Engine B OBJ Ext Palette | (not CPU-mapped while allocated) |

### Identifying Font VRAM in Practice

To find which bank holds font tile data during localization:

1. Open the game in **melonDS** or **DeSmuME** with the VRAM viewer.
2. Trigger a text box in-game so font tiles are loaded.
3. Check the VRAM viewer -- the bank containing recognizable glyph tiles is
   your target. Note its MST mapping (Engine A BG, Engine B BG, etc.).
4. Cross-reference with the VRAMCNT register values to confirm the mapping.
5. If the game uses [NFTR fonts](./fonts/), the NitroSDK font renderer loads
   glyph bitmaps into a VRAM bank mapped for the appropriate engine's BG tiles.

## BG Layers

Each engine has four BG layers (BG0--BG3), controlled by BGxCNT registers:

| Register | Engine A Address | Engine B Address |
|----------|-----------------|-----------------|
| BG0CNT | `0x04000008` | `0x04001008` |
| BG1CNT | `0x0400000A` | `0x0400100A` |
| BG2CNT | `0x0400000C` | `0x0400100C` |
| BG3CNT | `0x0400000E` | `0x0400100E` |

### BGxCNT Bit Layout (16 bits)

| Bit(s) | Field | Description |
|--------|-------|-------------|
| 0--1 | Priority | Rendering priority (0 = highest) |
| 2--5 | Char Base | Character data base block (in 16 KB steps) |
| 6 | Mosaic | Enable mosaic effect |
| 7 | Color Mode | `0` = 16 colors / 16 palettes (4bpp), `1` = 256 colors (8bpp) |
| 8--12 | Screen Base | Screen data (tilemap) base block (in 2 KB steps) |
| 13 | Ext Palette Slot | For BG0/BG1: `0` = slot 0/1, `1` = slot 2/3 |
| 14--15 | Screen Size | Tilemap size (see below) |

### Address Calculation

For Engine A, the final VRAM addresses combine BGxCNT and DISPCNT fields:

```
Char base address = BGxCNT.CharBase * 0x4000 + DISPCNT.CharBase * 0x10000
Screen base address = BGxCNT.ScreenBase * 0x0800 + DISPCNT.ScreenBase * 0x10000
```

For Engine B, DISPCNT does not contribute additional base offsets:

```
Char base address = BGxCNT.CharBase * 0x4000
Screen base address = BGxCNT.ScreenBase * 0x0800
```

### Text BG Screen Size (bits 14--15)

| Value | Size (tiles) | Size (pixels) |
|-------|-------------|---------------|
| 0 | 32x32 | 256x256 |
| 1 | 64x32 | 512x256 |
| 2 | 32x64 | 256x512 |
| 3 | 64x64 | 512x512 |

Most NDS games use 32x32 (256x256) text BGs since each screen is 256x192 pixels.

### Tilemap Entries (16 bits per tile)

| Bit(s) | Field | Description |
|--------|-------|-------------|
| 0--9 | Tile Number | Index into the character data (up to 1024 tiles) |
| 10 | H-Flip | Horizontal flip |
| 11 | V-Flip | Vertical flip |
| 12--15 | Palette | Palette number (4bpp mode only; ignored in 8bpp) |

For text rendering, the game writes tile numbers corresponding to font glyphs
into the tilemap. The text engine converts character codes to glyph indices
(via NFTR CMAP or a custom table), then writes the corresponding tile numbers
to the appropriate BG tilemap positions.

## Tile Formats

NDS tiles use the same formats as GBA:

| Format | Bits per pixel | Colors per tile | Palette |
|--------|---------------|-----------------|---------|
| 4bpp | 4 | 16 | One of 16 sub-palettes |
| 8bpp | 8 | 256 | Full 256-color palette |

Each tile is **8x8 pixels**. In 4bpp mode, each row is 4 bytes (32 pixels /
8 pixels per byte); a full tile is 32 bytes. In 8bpp mode, each row is 8 bytes;
a full tile is 64 bytes.

Pixel data is stored row by row, left to right, with the least significant bits
corresponding to the leftmost pixel:

```
4bpp tile byte: [pixel1 (low nibble)][pixel0 (high nibble)]

Example 4bpp row (8 pixels, 4 bytes):
  Byte 0: px0 | px1    (low nibble = px0, high nibble = px1)
  Byte 1: px2 | px3
  Byte 2: px4 | px5
  Byte 3: px6 | px7
```

For font tiles, most NDS games use either:
- **4bpp with a single palette** -- 16 colors, often just 2--3 used (background
  + text color + optional shadow/outline).
- **8bpp** -- rare for fonts, but allows anti-aliased rendering with more shades.

Note that [NFTR fonts](./fonts/) use their own bitmap format (1/2/4/8 bpp in CGLP)
which is distinct from the hardware tile format. The NitroSDK font renderer
converts NFTR glyph bitmaps into hardware tiles at runtime.

## OBJ / Sprites (OAM)

Each engine manages **128 sprites** via its Object Attribute Memory (OAM):

| OAM | Address | Engine |
|-----|---------|--------|
| Engine A OAM | `0x07000000` | 1 KB (128 entries x 8 bytes) |
| Engine B OAM | `0x07000400` | 1 KB (128 entries x 8 bytes) |

Each OAM entry is 8 bytes (4 attributes of 2 bytes each), defining position,
size, tile source, palette, priority, and transformation.

### Sprite Sizes

| Shape/Size bits | Square | Horizontal | Vertical |
|----------------|--------|------------|----------|
| 0 | 8x8 | 16x8 | 8x16 |
| 1 | 16x16 | 32x8 | 8x32 |
| 2 | 32x32 | 32x16 | 16x32 |
| 3 | 64x64 | 64x32 | 32x64 |

### Localization Relevance

Sprites are used in NDS games for:
- **Floating text** that must appear above BG layers (damage numbers, labels).
- **Cursor icons** and selection indicators in menus.
- **Character name tags** rendered as pre-drawn sprite graphics.
- **Text input keyboards** (touchscreen) where each key may be a sprite.

If a game renders text as sprites rather than BG tiles, you need to find the
OBJ tile data in VRAM (Engine A OBJ at `0x06400000` or Engine B OBJ at
`0x06600000`) and modify the tile graphics there. The OAM entries will tell
you which tile index each sprite uses.

## Extended Palettes

The NDS supports **extended palettes** for both BG and OBJ, providing
significantly more color variety than the GBA's standard palette memory.

### Standard vs Extended Palettes

| Type | Standard | Extended |
|------|----------|----------|
| BG | 256 colors (16 sub-palettes x 16 colors in 4bpp, or 1 x 256 in 8bpp) | 16 palettes x 256 colors = 4,096 colors per BG slot |
| OBJ | 16 sub-palettes x 16 colors (4bpp) or 1 x 256 (8bpp) | 16 palettes x 256 colors = 4,096 colors |

Extended palettes are enabled per-engine via DISPCNT bits 30 (BG) and 31 (OBJ).

### BG Extended Palette Memory

Each engine has 4 extended palette slots (one per BG layer), each holding
8 KB (16 palettes x 256 colors x 2 bytes). Total: 32 KB per engine.

- **Engine A BG ext palettes:** stored in VRAM banks E, F, or G (MST=4).
- **Engine B BG ext palettes:** stored in VRAM bank H (MST=4).

The tilemap entry's palette field (bits 12--15) selects which of the 16
sub-palettes within the slot to use for that tile.

### OBJ Extended Palette Memory

8 KB per engine (16 palettes x 256 colors x 2 bytes):

- **Engine A OBJ ext palettes:** stored in VRAM banks E, F, or G (MST=5).
- **Engine B OBJ ext palettes:** stored in VRAM bank I (MST=5).

### Key Constraint

Extended palette VRAM **is not CPU-accessible while mapped** for palette use.
To write or update extended palette data, the game must temporarily de-allocate
the VRAM bank (set VRAMCNT enable bit to 0), write to it in LCDC mode, then
re-allocate it. This means extended palette updates typically happen during
VBlank.

For localization, if the game uses extended palettes for text (e.g., colored
dialogue text using different palette indices), you may need to understand
which palette slots correspond to which text colors.

## 3D Engine and Text

Engine A can render 3D graphics on **BG0** (enabled via DISPCNT bit 3). The
3D engine supports polygon rendering with textures, and some NDS games use it
for text display.

### 3D Texture Formats

| Format | ID | Description | Bits/texel |
|--------|----|-------------|-----------|
| A3I5 | 1 | 3-bit alpha + 5-bit color index (32-color palette) | 8 |
| 4-Color | 2 | 2-bit palette index | 2 |
| 16-Color | 3 | 4-bit palette index | 4 |
| 256-Color | 4 | 8-bit palette index | 8 |
| Compressed 4x4 | 5 | Block compression, 2 bits/texel + interpolation | ~2 |
| A5I3 | 6 | 5-bit alpha + 3-bit color index (8-color palette) | 8 |
| Direct Color | 7 | 16-bit RGB555 + alpha | 16 |

### Text as 3D Quads

Some NDS games (particularly RPGs and visual novels) render text by drawing
textured quads on BG0's 3D layer. In this approach:

1. Font glyph data is loaded as a **3D texture** into texture VRAM slots
   (VRAM banks A--D mapped with MST=3).
2. Each character is rendered as a quad with texture coordinates pointing to
   the appropriate glyph region in the texture.
3. The 3D engine composites BG0 with the other 2D BG layers.

This technique allows smooth scaling, rotation, and alpha blending of text
that is not possible with tile-based 2D rendering. However, it makes
localization harder:

- You must identify the texture in VRAM that contains the font atlas.
- Glyph coordinates are defined in the game code, not in a simple tilemap.
- Adding new glyphs requires expanding the texture atlas and updating the
  coordinate lookup code or table.

## How Fonts Reach the Screen

Understanding the full pipeline from font file to screen pixels is essential
for diagnosing and solving localization issues.

### Tile-Based 2D Text (Most Common)

```
NFTR file (NitroFS)
    |
    v
NitroSDK font renderer (ARM9 code)
    |  Reads CGLP glyph bitmaps, CWDH widths, CMAP character mapping
    v
Converts glyph bitmap to hardware tile format (4bpp/8bpp, 8x8)
    |
    v
Writes tile data to VRAM bank (mapped as Engine BG)
    |
    v
Writes tile numbers to BG tilemap (screen data)
    |
    v
2D engine renders BG layer -> screen
```

### NitroSDK G2D Library

Games built with the NitroSDK typically use the **G2D (2D Graphics)** library,
which manages VRAM allocation automatically. The G2D library:

- Allocates VRAM banks for BG character data and screen data.
- Provides a text rendering API that takes character codes, looks them up in
  the NFTR font, and writes the resulting tiles and tilemap entries.
- Handles multi-line text layout, scrolling, and text box management.

When localizing such games, the NFTR font modification (adding glyphs and
CMAP entries) is usually sufficient -- the G2D library handles the rest.
See the [NFTR fonts page](./fonts/) for the font editing workflow.

### Custom Font Engines

Some games bypass NFTR and the NitroSDK font system entirely, using:

- **Pre-rendered tile graphics** stored as NCGR (Nitro Character Graphic)
  files loaded directly into VRAM. The game's text engine maps character
  codes to tile indices in the NCGR.
- **Bitmap font atlases** where glyphs are rendered from a large bitmap
  image rather than individual tiles. This is common in games with
  anti-aliased or styled text.
- **Hardcoded glyph data** embedded in the ARM9 binary or
  [overlays](./overlays/).

For custom engines, you must reverse-engineer the character-to-glyph mapping
and tile loading code. An emulator's memory viewer and breakpoints are
invaluable here.

### Dual-Screen Text Considerations

Many NDS games split text across both screens:

| Pattern | Top Screen (Engine A) | Bottom Screen (Engine B) |
|---------|----------------------|-------------------------|
| RPG dialogue | Gameplay / map | Text boxes / menus |
| Strategy game | Map / battle | Unit stats / dialogue |
| Visual novel | Character sprites | Dialogue text |
| Menu-heavy | Main content | Sub-menus / item descriptions |

When localizing, check both screens for text. Each screen uses a different
engine with its own VRAM mapping, so font tile data may need to be loaded
into VRAM banks for **both** engines. The NFTR font may be loaded twice
(once for each engine) or shared via careful VRAM mapping.

### Nitro Graphics File Formats

NDS games often store graphics in standardized Nitro SDK file formats:

| Format | Magic (reversed) | Purpose |
|--------|-----------------|---------|
| NCGR | `"RGCN"` | Character (tile) graphic data -- may contain font tiles |
| NSCR | `"RCSN"` | Screen (tilemap) data -- defines tile layout |
| NCLR | `"RLCN"` | Color palette data |
| NCER | `"RECN"` | Cell (metatile) data for sprites |
| NANR | `"RNAN"` | Animation sequences |

These files follow the same Nitro container format as [NFTR](./fonts/), with
a generic header followed by tagged sections. Use **ndstool** (CLI) to extract
them from the NitroFS filesystem, or **ndspy** (Python, `pip install ndspy`)
for programmatic access. **Tinke** (GUI alternative) can also browse and edit
these files within the [NitroFS filesystem](./filesystem/).

## Practical Localization Checklist

1. **Identify the text engine type:** Is the game using NFTR + NitroSDK G2D,
   custom tile-based fonts, 3D-rendered text, or sprite-based text?

2. **Find the active engine and BG layer:** Use an emulator's BG viewer to
   see which layer displays text. Note the engine (A or B) and layer number.

3. **Find the VRAM bank:** Check VRAMCNT register values to determine which
   bank is mapped for the text engine's BG (or OBJ). Use the VRAM viewer to
   locate font tile data.

4. **Trace the font data source:** Is it an NFTR file in [NitroFS](./filesystem/),
   an NCGR tile file, a bitmap in the ARM9 binary, or in an [overlay](./overlays/)?

5. **Check for compression:** Font and graphics data is frequently
   [compressed](./compression/) (LZ77, LZ11, Huffman). Decompress before editing.

6. **Modify and test:** Edit the font/graphics data, rebuild the ROM, and test
   on both screens in melonDS or DeSmuME.

## References

- GBATEK -- DS Video:
  [https://problemkaputt.de/gbatek.htm](https://problemkaputt.de/gbatek.htm)
  (comprehensive hardware register documentation for both 2D engines and 3D)
- GBATEK -- DS Memory Control / VRAM:
  [https://problemkaputt.de/gbatek-ds-memory-control-vram.htm](https://problemkaputt.de/gbatek-ds-memory-control-vram.htm)
- GBATEK -- DS 3D Texture Formats:
  [https://problemkaputt.de/gbatek-ds-3d-texture-formats.htm](https://problemkaputt.de/gbatek-ds-3d-texture-formats.htm)
