---
title: "NES PPU & CHR System"
description: "NES PPU memory map, tile format (2bpp 8x8), pattern tables, nametables, palettes, CHR-ROM vs CHR-RAM, and how text rendering works on the NES."
sidebar:
  order: 4
---

The NES **Picture Processing Unit** (PPU, Ricoh 2C02 for NTSC / 2C07 for PAL) generates
all video output. It has its own 16 KB address space, separate from the CPU. Understanding
the PPU is essential for localization because **all NES text is rendered as tiles** ---
there are no built-in text or font primitives.

## PPU memory map

| Address range | Size | Contents |
|---|---|---|
| `$0000`--`$0FFF` | 4 KB | **Pattern table 0** (left) --- 256 tiles |
| `$1000`--`$1FFF` | 4 KB | **Pattern table 1** (right) --- 256 tiles |
| `$2000`--`$23BF` | 960 B | Nametable 0 --- tile indices |
| `$23C0`--`$23FF` | 64 B | Attribute table 0 --- palette select |
| `$2400`--`$27FF` | 1 KB | Nametable 1 (+ attribute table 1) |
| `$2800`--`$2BFF` | 1 KB | Nametable 2 (+ attribute table 2) |
| `$2C00`--`$2FFF` | 1 KB | Nametable 3 (+ attribute table 3) |
| `$3000`--`$3EFF` | --- | Mirror of `$2000`--`$2EFF` |
| `$3F00`--`$3F0F` | 16 B | Background palettes (4 palettes x 4 colors) |
| `$3F10`--`$3F1F` | 16 B | Sprite palettes (4 palettes x 4 colors) |
| `$3F20`--`$3FFF` | --- | Mirrors of `$3F00`--`$3F1F` |

The NES has only **2 KB of physical VRAM** (CIRAM) for nametables. The cartridge's
mirroring configuration determines which of the four logical nametables map to which
physical kilobyte.

*Source: [PPU memory map](https://www.nesdev.org/wiki/PPU_memory_map)*

## Tile format (2bpp, 8x8)

Every tile is **8x8 pixels, 2 bits per pixel, 16 bytes total**. The 16 bytes are
split into two **bitplanes** of 8 bytes each:

```
Byte   $0xx0 - $0xx7  :  Bitplane 0 (low bit of each pixel)
Byte   $0xx8 - $0xxF  :  Bitplane 1 (high bit of each pixel)
```

For each pixel row, the final 2-bit color index is:

```
pixel_color = (bitplane1_bit << 1) | bitplane0_bit
```

| Bitplane 0 | Bitplane 1 | Color index |
|---|---|---|
| 0 | 0 | 0 (transparent / background) |
| 1 | 0 | 1 |
| 0 | 1 | 2 |
| 1 | 1 | 3 |

### Example: encoding the letter "A"

Suppose we want an 8x8 letter "A" with a 1-pixel outline (color 1) filled with color 2:

```
Row 0:  . . # # # # . .     Bitplane 0: 00111100 = $3C    Bitplane 1: 00000000 = $00
Row 1:  . # # . . # # .     Bitplane 0: 01100110 = $66    Bitplane 1: 00000000 = $00
Row 2:  . # # . . # # .     Bitplane 0: 01100110 = $66    Bitplane 1: 00000000 = $00
Row 3:  . # # # # # # .     Bitplane 0: 01111110 = $7E    Bitplane 1: 00000000 = $00
Row 4:  . # # . . # # .     Bitplane 0: 01100110 = $66    Bitplane 1: 00000000 = $00
Row 5:  . # # . . # # .     Bitplane 0: 01100110 = $66    Bitplane 1: 00000000 = $00
Row 6:  . # # . . # # .     Bitplane 0: 01100110 = $66    Bitplane 1: 00000000 = $00
Row 7:  . . . . . . . .     Bitplane 0: 00000000 = $00    Bitplane 1: 00000000 = $00

Tile bytes (16 total):
  $3C $66 $66 $7E $66 $66 $66 $00   (bitplane 0, rows 0-7)
  $00 $00 $00 $00 $00 $00 $00 $00   (bitplane 1, rows 0-7)
```

This produces a single-color "A" using only color index 1.

### Address calculation

The PPU address for row `Y` of tile number `N` in pattern table half `H` is:

```
address = H * $1000 + N * 16 + plane * 8 + Y

Where:
  H     = 0 (left table) or 1 (right table)
  N     = tile number ($00-$FF)
  plane = 0 (bitplane 0) or 1 (bitplane 1)
  Y     = row within tile (0-7)
```

In binary: `0HNNNNNNNNPYYY` where H = half, N = tile number (8 bits), P = bitplane,
Y = fine Y (3 bits).

*Source: [PPU pattern tables](https://www.nesdev.org/wiki/PPU_pattern_tables)*

## Pattern tables

Each pattern table holds **256 tiles** (4 KB). The PPU has two:

- **Pattern table 0** (`$0000`--`$0FFF`): typically used for background tiles
  (including text characters)
- **Pattern table 1** (`$1000`--`$1FFF`): typically used for sprite tiles

The PPU control register (`$2000`, bit 4) selects which pattern table is used for
background rendering. Bit 3 selects the sprite pattern table. Games can use either
table for either purpose.

### Maximum tile count

With 256 tiles per table, a game has at most **512 unique tiles** across both tables.
In practice, the background pattern table is shared between font glyphs, terrain tiles,
UI elements, and other graphics. A typical NES game might allocate only 50--100 tiles
for text characters.

This is the fundamental constraint for localization: **you have at most 256 background
tile slots** (often fewer), and every character in your target script needs its own tile.
Latin alphabets (upper + lower + digits + punctuation) fit in ~70--90 tiles. Scripts
like Hangul (11,172 syllables), kanji, or Cyrillic (if upper + lower) may exceed the
available slots.

## Nametables (background tile map)

Each nametable is a **32 x 30 grid** of tile indices, representing one screen:

- **960 bytes** of tile indices (each byte = one 8x8 tile from the pattern table)
- **64 bytes** of attribute data (palette selection for 2x2 tile groups)
- **Total: 1024 bytes** per nametable

### Nametable addresses

| Nametable | Tile data | Attribute data | Position |
|---|---|---|---|
| 0 | `$2000`--`$23BF` | `$23C0`--`$23FF` | Top-left |
| 1 | `$2400`--`$27BF` | `$27C0`--`$27FF` | Top-right |
| 2 | `$2800`--`$2BBF` | `$2BC0`--`$2BFF` | Bottom-left |
| 3 | `$2C00`--`$2FBF` | `$2FC0`--`$2FFF` | Bottom-right |

### How text appears on screen

To display the word "HELLO" starting at row 5, column 3 of nametable 0:

1. The game looks up each character in its encoding table to get tile indices
   (e.g., H=`$11`, E=`$0E`, L=`$15`, L=`$15`, O=`$18`).
2. It writes these tile indices to nametable positions:
   - Address `$2000 + (5 * 32) + 3 = $20A3` gets `$11`
   - Address `$20A4` gets `$0E`
   - Address `$20A5` gets `$15`
   - Address `$20A6` gets `$15`
   - Address `$20A7` gets `$18`
3. The PPU reads these indices, fetches the corresponding tiles from the pattern table,
   and renders them on screen.

### Attribute table (palette assignment)

The attribute table assigns one of four background palettes to each **2x2 tile (16x16 pixel)
block**. Each byte covers a 4x4 tile (32x32 pixel) area:

```
Attribute byte layout:
7       0
---------
3333 2222
1111 0000

Bits 0-1: palette for top-left 2x2 tiles
Bits 2-3: palette for top-right 2x2 tiles
Bits 4-5: palette for bottom-left 2x2 tiles
Bits 6-7: palette for bottom-right 2x2 tiles
```

For text, this means you can only change text color in 16x16 pixel blocks, not per
character. Some games work around this by using sprites for colored text.

### Mirroring

The NES has only 2 KB of physical VRAM, enough for two nametables. The cartridge's
mirroring type determines how the four logical nametables map:

| Type | `$2000` | `$2400` | `$2800` | `$2C00` | Scroll direction |
|---|---|---|---|---|---|
| Vertical | A | B | A | B | Horizontal scrolling |
| Horizontal | A | A | B | B | Vertical scrolling |
| Single-screen | A | A | A | A | (mapper-controlled) |
| Four-screen | A | B | C | D | Both (extra VRAM on cart) |

*Source: [PPU nametables](https://www.nesdev.org/wiki/PPU_nametables)*

## Palettes

| Address | Contents |
|---|---|
| `$3F00` | Universal background color |
| `$3F01`--`$3F03` | Background palette 0 |
| `$3F05`--`$3F07` | Background palette 1 |
| `$3F09`--`$3F0B` | Background palette 2 |
| `$3F0D`--`$3F0F` | Background palette 3 |
| `$3F11`--`$3F13` | Sprite palette 0 |
| `$3F15`--`$3F17` | Sprite palette 1 |
| `$3F19`--`$3F1B` | Sprite palette 2 |
| `$3F1D`--`$3F1F` | Sprite palette 3 |

Color 0 of each palette (`$3F04`, `$3F08`, `$3F0C`, `$3F10`, `$3F14`, `$3F18`, `$3F1C`)
mirrors the universal background color at `$3F00`.

The NES master palette has 64 entries (though some are duplicates/black). Each palette
entry is a 6-bit index into this fixed master palette --- the NES does not use RGB
values directly.

*Source: [PPU palettes](https://www.nesdev.org/wiki/PPU_palettes)*

## CHR-ROM vs CHR-RAM

This is the most important distinction for localization font work:

### CHR-ROM

- Tile data is in a **read-only** ROM chip on the cartridge.
- The PPU reads tiles directly from CHR-ROM.
- Tiles **cannot be changed at runtime**.
- To modify the font, edit the CHR-ROM data in the ROM file directly using
  `superfamiconv` or a custom script (CLI), or a GUI tile editor like YY-CHR
  or Tile Molester if preferred.
- **Limitation:** You are restricted to the existing number of tile slots. If the
  original game uses 80 tiles for Japanese kana/kanji, you can replace those 80 tiles
  with your target script's characters --- but you cannot add more.
- Some mappers (MMC1, MMC3, CNROM) can switch CHR-ROM banks, giving access to more
  tiles over time (but not simultaneously).

### CHR-RAM

- The cartridge has **writable RAM** in place of CHR-ROM.
- The CPU copies tile data to CHR-RAM (via PPU registers `$2006`/`$2007`) during V-blank
  or forced blanking.
- Tiles **can be freely loaded and changed at runtime**.
- A translation patch can include entirely new font data and load it as needed.
- This is essential for scripts with large character sets (Hangul, CJK) --- the patch
  can implement a tile-caching system that loads only the glyphs needed for the
  current text.
- **Detection:** iNES header byte 5 = `$00` indicates CHR-RAM.

### Which games use which?

| CHR type | Typical games | Localization ease |
|---|---|---|
| CHR-ROM | Early games, CNROM, some MMC1 | Harder (fixed tiles, limited slots) |
| CHR-RAM | UxROM, many MMC1, some MMC3 | Easier (runtime font loading) |

Most text-heavy RPGs from the late 1980s onward use CHR-RAM because it gives the
game engine flexibility to load different tilesets for different screens.

## Sprite-based text

Some games render text using **sprites** (OAM objects) instead of background tiles:

- Sprites use a separate pattern table (or the same one, depending on PPU `$2000` bit 3).
- Each sprite is 8x8 or 8x16 pixels, positioned anywhere on screen.
- The NES supports **64 sprites** total, with a limit of **8 sprites per scanline**.
  Sprites beyond this limit flicker or disappear.
- Sprite text is rare for dialog (too many sprites needed) but common for:
  - Floating damage numbers
  - Character names above sprites
  - Score/status displays that need per-character coloring
  - Text that must overlap the background

For localization, sprite-based text requires different handling: you modify the sprite
tile assignments and OAM data rather than nametable writes.

### 8x16 sprite mode

When PPU register `$2000` bit 5 is set, sprites are 8x16 pixels (two tiles stacked).
The tile index selects a pair: even indices come from pattern table 0, odd from table 1.
Some games use 8x16 sprites for taller text characters.

## Practical: finding the font

### Method 1: tile dump (CLI) or tile editor (GUI)

1. Dump tiles to PNG with `superfamiconv` or a custom Python script, or inspect
   raw tile bytes with `xxd` (search for 16-byte-aligned blocks in 2bpp format).
   Alternatively, open the ROM in a GUI tile editor such as **YY-CHR** or
   **Tile Molester** if preferred.
2. Set the format to **NES 2bpp** (8x8 tiles).
3. Scroll through the ROM looking for recognizable character glyphs.
4. For **CHR-ROM** games: the font is typically near the end of the ROM file (in the
   CHR-ROM section, after PRG-ROM).
5. For **CHR-RAM** games: the font tiles are stored somewhere in PRG-ROM and copied
   to CHR-RAM at runtime. They can be anywhere --- look for blocks of 16-byte-aligned
   data that look like tiles when viewed in 2bpp mode.

### Method 2: emulator PPU viewer

1. Open the ROM in **Mesen2** or **FCEUX**.
2. Navigate to a screen that displays text.
3. Open the **PPU Viewer** / **Pattern Table Viewer**.
4. The currently loaded tiles (including font) are visible in the two pattern tables.
5. Note the tile indices used for each character.
6. For CHR-RAM games, set a **write breakpoint** on PPU address range `$0000`--`$1FFF`
   to find the code that loads tiles into CHR-RAM.

### Method 3: relative search

If the game uses a sequential encoding (A=`$0A`, B=`$0B`, C=`$0C`, ...), you can
find text strings by searching for the byte-difference pattern. For example, searching
for the relative values `+0 +4 +11 +11 +14` would find "HELLO" (differences between
H, E, L, L, O in a sequential encoding).

Tools like **Mesen2's memory search** or a hex editor with relative-search support
can do this.

## NES text rendering: V-blank constraint

The PPU does not allow simultaneous CPU access while rendering is active (scanlines
0--239). All PPU memory writes (including tile uploads and nametable writes) must happen
during **V-blank** (scanlines 241--260, approximately 2273 CPU cycles on NTSC) or
when rendering is manually disabled.

This means:

- **Nametable writes** (displaying text): limited by V-blank time. A text box that
  fills one row (32 tiles = 32 bytes) needs 32 writes, easily done in one V-blank.
  A full screen of text (960 bytes) needs multiple frames.
- **CHR-RAM uploads** (loading font tiles): each tile is 16 bytes. In one V-blank
  you can upload roughly 140 tiles (2273 cycles / ~16 cycles per byte), though real
  games transfer fewer due to overhead. Loading a full 256-tile font takes 2+ frames.
- **Games that disable rendering** during screen transitions can upload unlimited tile
  data (the entire pattern table) in a single load. Many RPGs do this between scenes.

For a localization that needs to swap in many new font tiles, check whether the game
disables rendering during text-box initialization --- if so, you have ample time to
load a full custom font.

## References

- [PPU](https://www.nesdev.org/wiki/PPU) --- NESdev Wiki
- [PPU memory map](https://www.nesdev.org/wiki/PPU_memory_map)
- [PPU pattern tables](https://www.nesdev.org/wiki/PPU_pattern_tables)
- [PPU nametables](https://www.nesdev.org/wiki/PPU_nametables)
- [PPU palettes](https://www.nesdev.org/wiki/PPU_palettes)
- [PPU rendering](https://www.nesdev.org/wiki/PPU_rendering)
