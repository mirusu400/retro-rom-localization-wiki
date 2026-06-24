---
title: "NES / Famicom Overview"
description: "Overview of the Nintendo Entertainment System (Famicom) architecture for ROM localization: CPU, PPU, memory map, cartridge structure, and localization approach."
sidebar:
  order: 1
---

The **Nintendo Entertainment System** (NES), known in Japan as the **Family Computer**
(Famicom), is an 8-bit home console released by Nintendo in 1983 (JP) / 1985 (NA).
Its large library of RPGs, adventure games, and text-heavy titles makes it one of the
most common targets for fan translation. This page provides an architecture overview
oriented toward localization work.

## Hardware summary

| Property | Detail |
|---|---|
| **CPU** | Ricoh 2A03 (NTSC) / 2A07 (PAL) --- MOS 6502 core **without BCD mode** |
| **Clock** | ~1.79 MHz (NTSC) / ~1.66 MHz (PAL) |
| **PPU** | Ricoh 2C02 (NTSC) / 2C07 (PAL) --- generates video output |
| **Resolution** | 256 x 240 pixels (NTSC visible area ~256 x 224) |
| **Tile format** | 2 bpp, 8x8 pixels, 16 bytes per tile |
| **Palette** | 4 background palettes + 4 sprite palettes, 4 colors each (25 total on-screen) |
| **Internal RAM** | 2 KB (CPU), 2 KB (PPU VRAM) |
| **Cartridge ROM** | PRG ROM (code/data) + CHR ROM or CHR RAM (tile graphics) |
| **Endianness** | **Little-endian** (6502) |
| **Medium** | ROM cartridge with optional mapper chip |

## CPU memory map (quick reference)

| Address range | Size | Contents |
|---|---|---|
| `$0000`--`$07FF` | 2 KB | Internal RAM (zero page, stack, general) |
| `$0800`--`$1FFF` | --- | Mirrors of `$0000`--`$07FF` |
| `$2000`--`$2007` | 8 B | PPU registers |
| `$2008`--`$3FFF` | --- | Mirrors of PPU registers (every 8 bytes) |
| `$4000`--`$4017` | 24 B | APU and I/O registers |
| `$4018`--`$401F` | 8 B | Normally disabled APU test registers |
| `$4020`--`$5FFF` | --- | Cartridge expansion area (mapper-dependent) |
| `$6000`--`$7FFF` | 8 KB | Cartridge PRG RAM / save RAM (when present) |
| `$8000`--`$FFFF` | 32 KB | Cartridge PRG ROM (mapper may bank-switch) |

Interrupt vectors live in the topmost bytes of PRG ROM:

| Vector | Address | Purpose |
|---|---|---|
| NMI | `$FFFA`--`$FFFB` | Non-maskable interrupt (V-blank) |
| Reset | `$FFFC`--`$FFFD` | Power-on / reset entry point |
| IRQ/BRK | `$FFFE`--`$FFFF` | Maskable interrupt / BRK instruction |

Every cycle on the 6502 is either a read or a write cycle; the CPU cannot "idle" the
bus. This matters when timing-sensitive PPU writes are involved (font upload during
V-blank, for instance).

*Source: [NESdev Wiki -- CPU](https://www.nesdev.org/wiki/CPU),
[CPU memory map](https://www.nesdev.org/wiki/CPU_memory_map)*

## PPU and tile-based graphics

The PPU has its own 16 KB address space (separate from the CPU bus):

| PPU address | Contents |
|---|---|
| `$0000`--`$0FFF` | Pattern table 0 (left) --- 256 tiles |
| `$1000`--`$1FFF` | Pattern table 1 (right) --- 256 tiles |
| `$2000`--`$23BF` | Nametable 0 tile indices (960 bytes) |
| `$23C0`--`$23FF` | Attribute table 0 (64 bytes) |
| `$2400`--`$27FF` | Nametable 1 (+ attribute table 1) |
| `$2800`--`$2BFF` | Nametable 2 (+ attribute table 2) |
| `$2C00`--`$2FFF` | Nametable 3 (+ attribute table 3) |
| `$3F00`--`$3F0F` | Background palettes (4 x 4 colors) |
| `$3F10`--`$3F1F` | Sprite palettes (4 x 4 colors) |

The NES only has **2 KB of physical VRAM**, so only two nametables are real; the other
two are mirrors controlled by the cartridge's mirroring configuration (horizontal,
vertical, single-screen, or four-screen with extra VRAM on the cart).

**Text on the NES = tile indices.** A nametable entry is a single byte (`$00`--`$FF`)
that selects a tile from one of the two pattern tables. To display text, a game writes
tile indices corresponding to character glyphs into the nametable. The game's
"character encoding" is simply the mapping from internal text bytes to tile indices.

See [PPU & CHR System](./ppu-chr) for the full technical breakdown.

*Source: [NESdev Wiki -- PPU](https://www.nesdev.org/wiki/PPU),
[PPU pattern tables](https://www.nesdev.org/wiki/PPU_pattern_tables),
[PPU nametables](https://www.nesdev.org/wiki/PPU_nametables)*

## CHR-ROM vs CHR-RAM

This distinction is **the single most important factor** for NES font localization:

- **CHR-ROM**: Tile graphics are burned into a ROM chip on the cartridge. The PPU reads
  tiles directly from this ROM. You **cannot change tiles at runtime** --- the font is
  fixed. To localize, you must edit the CHR-ROM data in the ROM file itself, and you are
  limited to the existing number of tile slots.

- **CHR-RAM**: The cartridge has RAM instead of ROM for pattern tables. The CPU copies
  tile data into CHR-RAM during V-blank (or when rendering is off). This means the game
  **can load any tiles it wants at runtime**, and a translation patch can supply entirely
  new font data. CHR-RAM is essential for scripts that need more than the original glyph
  set (e.g., Hangul, CJK).

**How to tell:** Byte 5 of the iNES header. If it is `$00`, the cartridge uses CHR-RAM.
If non-zero, it specifies the CHR-ROM size in 8 KB units.

Many later NES games (especially RPGs) use CHR-RAM because it gives the game engine
flexibility to load tilesets on demand.

## Mappers and banking

The base NES address space only allows 32 KB of PRG ROM and 8 KB of CHR. **Mapper**
chips on the cartridge extend this by bank-switching --- swapping pages of ROM in and
out of the CPU/PPU address windows.

For localization, banking matters because:

1. **Text and font data live in specific banks.** You need to know which bank is active
   when a piece of text or a font tileset is accessed.
2. **Pointers are bank-relative.** A 16-bit pointer like `$A35C` means
   `$A35C` within the currently mapped bank, not an absolute file offset.
3. **ROM expansion** (adding more space for a larger script) usually means changing the
   mapper or adding banks, which requires understanding the mapper's register interface.

The most common mappers are NROM (0), MMC1 (1), UxROM (2), CNROM (3), and MMC3 (4).
See [Mappers & Banking](./mappers) for details.

*Source: [NESdev Wiki -- Mapper](https://www.nesdev.org/wiki/Mapper)*

## Typical localization difficulty

NES games range from trivial to very difficult to localize, depending on:

| Factor | Easy | Hard |
|---|---|---|
| CHR type | CHR-RAM (load any font) | CHR-ROM (fixed tile slots) |
| Mapper | Simple (NROM, UxROM) | Complex (MMC3, MMC5) |
| Text encoding | Direct tile index, no compression | DTE/MTE, custom compression |
| Pointer format | Flat 16-bit, one table | Bank-relative, scattered |
| Free space | Plenty of unused ROM | Tightly packed, needs expansion |
| VWF need | Target fits in 8x8 fixed-width | Target requires variable-width rendering |

### General approach

1. **Identify the mapper** (iNES header byte 6/7) and understand its banking.
2. **Find the font** in a tile editor (YY-CHR, Tile Molester, or Mesen2's PPU viewer).
3. **Determine CHR-ROM vs CHR-RAM** (header byte 5).
4. **Locate text data** using relative search or debugger tracing.
5. **Build a `.tbl` file** mapping byte values to characters.
6. **Extract text** (Cartographer or custom script), translate, reinsert (Atlas or
   custom script), and fix pointers if string lengths changed.
7. **If the target script needs more glyphs** than available tile slots, consider:
   - Reclaiming unused tiles or DTE entries.
   - Switching to CHR-RAM (if currently CHR-ROM).
   - Implementing a tile-swapping engine that loads glyphs on demand.
   - ROM expansion to hold more font/text data.
8. **Test in an accurate emulator** (Mesen2, FCEUX) with PPU debugging enabled.

See also the cross-cutting guides:
[Text Engine](/retro-rom-localization-wiki/text-engine/),
[Encoding & Fonts](/retro-rom-localization-wiki/encoding-and-fonts/),
[Pointers](/retro-rom-localization-wiki/pointers/),
[Tools](/retro-rom-localization-wiki/tools/).

## References

- [NESdev Wiki (main)](https://www.nesdev.org/wiki/Nesdev_Wiki)
- [NES reference guide](https://www.nesdev.org/wiki/NES_reference_guide)
- [CPU](https://www.nesdev.org/wiki/CPU) --
  [CPU memory map](https://www.nesdev.org/wiki/CPU_memory_map)
- [PPU](https://www.nesdev.org/wiki/PPU) --
  [PPU pattern tables](https://www.nesdev.org/wiki/PPU_pattern_tables) --
  [PPU nametables](https://www.nesdev.org/wiki/PPU_nametables) --
  [PPU palettes](https://www.nesdev.org/wiki/PPU_palettes)
- [iNES header](https://www.nesdev.org/wiki/INES) --
  [NES 2.0](https://www.nesdev.org/wiki/NES_2.0)
- [Mapper list](https://www.nesdev.org/wiki/Mapper)
