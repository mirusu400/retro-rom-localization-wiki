---
title: "Game Boy / Game Boy Color"
description: "Platform overview for GB/GBC localization: Sharp LR35902 (SM83) CPU, 2bpp tile graphics, MBC banking, and key localization considerations."
sidebar:
  order: 1
---

## Overview

| Property | Value |
|----------|-------|
| **CPU** | Sharp LR35902 (SM83) -- an 8080/Z80 hybrid, 8-bit |
| **Clock** | 4.194304 MHz (DMG); 8.388608 MHz double-speed (GBC) |
| **Endianness** | Little-endian for 16-bit values |
| **ROM medium** | Cartridge (mask ROM or flash) |
| **Max addressable ROM** | 32 KB without MBC; up to 8 MB with MBC5 |
| **VRAM** | 8 KB (DMG); 16 KB / 2 banks (GBC) |
| **WRAM** | 8 KB (DMG); 32 KB / 8 banks (GBC) |
| **Tile format** | 2bpp, 8x8 pixels, 16 bytes per tile |
| **Available tiles** | Up to 384 (DMG) or 768 (GBC with VRAM Bank 1) |
| **Display** | 160x144 pixels, 20x18 tiles visible |

## The CPU: Sharp LR35902 (SM83)

The LR35902 is often called an "SM83" after the Sharp silicon. It combines features
from the Intel 8080 and Zilog Z80 instruction sets but is neither -- it has its own
unique opcode map. Key differences from Z80: no IX/IY index registers, no shadow
registers, no I/O port instructions. It does have the Z80's `CB`-prefixed bit
manipulation instructions.

Registers: `A` (accumulator), `F` (flags), `B`, `C`, `D`, `E`, `H`, `L`, `SP`
(stack pointer), `PC` (program counter). Registers pair as `AF`, `BC`, `DE`, `HL`
for 16-bit operations. `HL` is the primary memory pointer.

For localization, the CPU matters when:
- Writing ASM patches for variable-width font (VWF) rendering
- Hooking the text engine to change encoding or add control codes
- Understanding pointer arithmetic (16-bit, little-endian)

## Graphics at a Glance

The PPU (Pixel Processing Unit) renders from **tile data** in VRAM. All graphics --
background, window overlay, and sprites -- are composed of 8x8 pixel tiles at 2 bits
per pixel (4 shades on DMG, 4 colors per palette on GBC).

- **Background (BG):** A 256x256 pixel (32x32 tile) map, scrollable via `SCX`/`SCY`
  registers. The visible screen is a 160x144 viewport into this map.
- **Window:** An overlay layer positioned by `WX`/`WY`. Not scrollable. Commonly used
  for dialogue boxes, HUDs, and status bars.
- **Sprites (OBJ):** 8x8 or 8x16 pixels, up to 40 on screen (10 per scanline).

**For localization, fonts are tiles.** The game loads font tiles into VRAM and writes
tile indices to the BG or Window tile map to display text. Understanding tile data
format and VRAM layout is essential. See [Tiles and VRAM](./tiles-vram) for details.

## Memory Banking (MBC)

The Game Boy has only a 16-bit address bus (64 KB addressable), but cartridges can
hold much more ROM via Memory Bank Controllers (MBCs). The MBC maps switchable
16 KB ROM banks into the `0x4000`-`0x7FFF` address window.

Common MBC types:

| MBC | Max ROM | Max RAM | Notes |
|-----|---------|---------|-------|
| None | 32 KB | -- | Rare for text-heavy games |
| MBC1 | 2 MB | 32 KB | Older, complex banking modes |
| MBC3 | 2 MB | 32 KB | + RTC; common in late DMG / early GBC |
| MBC5 | 8 MB | 128 KB | Simple 9-bit bank register; **preferred for expansion** |

**MBC choice directly affects localization difficulty.** Adding translated text often
requires more ROM space. If the original cartridge uses MBC1 (max 2 MB), upgrading the
header's cartridge type byte to MBC5 allows up to 8 MB -- more than enough for any
translation. See [MBC Banking](./mbc-banking) for full details.

## Localization Difficulty

GB/GBC localization difficulty varies widely:

### Easier cases
- Games with uncompressed text using tile-index encoding
- Games with free ROM space in existing banks
- GBC games (more VRAM = more room for font tiles)
- MBC5 cartridges (simple banking, room to expand)

### Harder cases
- Games with compressed text or graphics (must decompress, modify, recompress)
- Games using DTE/MTE encoding (byte = digram/word; table must be rebuilt)
- DMG-only games with tight tile budgets (256 tiles shared with all graphics)
- Games using MBC1 with complex banking mode interactions
- Translating to scripts with large glyph sets (CJK, Hangul) on DMG

### GBC advantages over DMG
The Game Boy Color significantly eases localization:

- **Double tile capacity:** VRAM Bank 1 adds another 384 tiles (768 total), making
  room for larger character sets
- **Double-speed CPU:** 8 MHz mode makes VWF rendering feasible in real time
- **More palettes:** 8 BG palettes x 4 colors each, vs DMG's single 4-shade palette
- **More WRAM:** 32 KB (8 banks) for text buffers, decompression, etc.

## Key Addresses for Localization

| Address | Purpose |
|---------|---------|
| `0x0147` | Cartridge type (MBC) -- change this to upgrade MBC |
| `0x0148` | ROM size -- update when expanding |
| `0x014D` | Header checksum -- **must** recompute after any header change |
| `0x8000`-`0x97FF` | Tile data (font tiles live here) |
| `0x9800`-`0x9FFF` | Tile maps (text display happens here) |

## Tools

| Tool | Purpose |
|------|---------|
| [RGBDS](https://rgbds.gbdev.io/) | SM83 assembler/linker/fixer (rgbasm, rgblink, rgbfix) |
| [rgbgfx](https://rgbds.gbdev.io/docs/rgbgfx.1) | PNG to 2bpp tile conversion and back |
| [SameBoy](https://sameboy.github.io/) | High-accuracy GB/GBC emulator |
| [mGBA](https://mgba.io/) | GB/GBC/GBA emulator with Lua scripting and debugger |
| [Mesen2](https://github.com/SourMesen/Mesen2) | Multi-system emulator with strong debugger |
| [BGB](https://bgb.bircd.org/) | GB emulator with excellent debugger (Windows) |

## References

- [Pan Docs](https://gbdev.io/pandocs/) -- the comprehensive GB/GBC technical reference (CC0)
- [RGBDS documentation](https://rgbds.gbdev.io/) -- SM83 assembler toolchain
- [GBDev community](https://gbdev.io/) -- development resources and tools
- [Game Boy CPU Manual](http://marc.rawer.de/Gameboy/Docs/GBCPUman.pdf) -- instruction set reference

## Section index

- [Cartridge Header](./header) -- ROM header format, checksum, cartridge type table
- [MBC Banking](./mbc-banking) -- memory bank controllers, bank switching, ROM expansion
- [Tiles and VRAM](./tiles-vram) -- 2bpp tile format, VRAM layout, font storage
- [Text Engine Patterns](./text-patterns) -- common text encoding, DTE, pointers, VWF
