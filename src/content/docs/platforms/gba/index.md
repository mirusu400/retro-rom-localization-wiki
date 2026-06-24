---
title: "GBA Overview"
description: "Game Boy Advance platform overview for localization: ARM7TDMI CPU, flat 32 MB ROM space, BIOS decompression, and why GBA is one of the more accessible retro platforms for fan translation."
sidebar:
  order: 1
---

The **Game Boy Advance** (GBA) is a 32-bit handheld released by Nintendo in 2001. From a
localization perspective, the GBA is one of the **most accessible retro platforms** due to its
flat memory addressing, generous ROM space, and well-documented hardware.

## Hardware summary

| Property | Value |
|---|---|
| CPU | ARM7TDMI (32-bit ARM + 16-bit Thumb dual instruction set) |
| Clock | 16.78 MHz |
| Endianness | **Little-endian** |
| ROM space | Up to **32 MB**, mapped at `0x08000000`-`0x09FFFFFF` |
| Banking | **None** — flat address space, no bank switching |
| Work RAM | 256 KB external (EWRAM) + 32 KB internal (IWRAM) |
| VRAM | 96 KB |
| Display | 240 x 160 pixels, up to 32,768 colors |
| Tile format | 4bpp (32 bytes/tile) or 8bpp (64 bytes/tile), 8x8 pixels |
| BIOS | 16 KB with built-in decompression SWIs (LZ77, Huffman, RLE) |
| Save | SRAM (up to 64 KB), Flash, or EEPROM |

Source: [GBATEK](https://problemkaputt.de/gbatek.htm)

## Why GBA localization is easier than older consoles

1. **No banking.** The entire ROM is visible at `0x08000000` with no mapper/bank switching.
   Pointers are simple 32-bit absolute addresses. There is no need to worry about bank boundaries
   or short vs. long pointers — unlike NES (mappers), SNES (LoROM/HiROM banks), or GB (MBC).

2. **Generous ROM size.** 32 MB is far more than most GBA games use. Expanding a ROM to fit a
   larger character set or longer translated text is straightforward: just append data and point
   to it. No complex ROM expansion patches are typically needed.

3. **ARM + Thumb code.** Text-rendering routines are written in ARM or Thumb assembly (or
   compiled C), which is relatively easy to reverse-engineer with tools like Ghidra (with the
   ARM processor module) or radare2/rizin.

4. **BIOS decompression is standardized.** Many games use the BIOS's built-in LZ77, Huffman, or
   RLE SWIs to compress graphics and sometimes text. Because the format is standardized and
   documented, you can decompress, modify, and recompress data with existing tools.

5. **Variable-width fonts (VWF) are common.** Many GBA games already implement VWF, since the
   hardware has enough CPU power to render glyphs pixel-by-pixel into a tile buffer. This means
   the VWF infrastructure may already be present, making it easier to insert scripts that use
   non-fixed-width characters.

## Localization approach overview

A typical GBA localization follows this pipeline:

1. **Identify the ROM header** — confirm the game title, game code, and region.
   See [Header](./header/).

2. **Understand the memory map** — all ROM pointers use the `0x08xxxxxx` base address.
   See [Memory Map](./memory-map/).

3. **Locate font tiles** — find the 4bpp or 8bpp font tiles in ROM, typically visible in a tile
   viewer at their VRAM destination. See [Graphics](./graphics/).

4. **Check for compression** — if font or text data is compressed, identify the compression type
   (LZ77 header byte `0x10`, Huffman `0x20`/`0x28`, RLE `0x30`).
   See [BIOS Decompression](./bios-decompression/).

5. **Reverse the text engine** — locate the encoding table, control codes, pointer tables, and
   the text-rendering function. See [Text Patterns](./text-patterns/).

6. **Modify and reinsert** — expand the character set, insert translated text, update pointers,
   and recompress if necessary.

7. **Verify** — test in mGBA or on hardware, confirm rendering is correct.

## Key references

- **GBATEK** (primary): https://problemkaputt.de/gbatek.htm
- **mGBA** (emulator with Lua scripting and debugger): https://mgba.io/
- **Mesen2** (multi-system emulator with GBA support and debugger): https://github.com/SourMesen/Mesen2
- **devkitARM** (ARM cross-compiler toolchain): https://devkitpro.org/

## Related pages

- [Encoding and Fonts](/retro-rom-localization-wiki/encoding-and-fonts/) — charset expansion, VWF
  concepts (platform-agnostic)
- [Pointers](/retro-rom-localization-wiki/pointers/) — pointer relocation strategies
- [Compression](/retro-rom-localization-wiki/compression/) — compression identification and handling
- [Text Engine](/retro-rom-localization-wiki/text-engine/) — reverse-engineering text engines
- [Tools](/retro-rom-localization-wiki/tools/) — CLI tools and emulators
