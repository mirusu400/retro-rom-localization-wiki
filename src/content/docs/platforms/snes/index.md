---
title: "SNES / Super Famicom"
description: "Overview of the Super Nintendo Entertainment System architecture for ROM localization and fan translation."
sidebar:
  order: 1
---

The **Super Nintendo Entertainment System** (SNES), known as the **Super Famicom** in Japan, is
a 16-bit console released in 1990 (JP) / 1991 (NA/EU). Its significantly expanded hardware
compared to the NES makes it one of the most favorable retro platforms for localization work:
larger ROM space, more CPU power, and a flexible PPU that can support variable-width fonts.

## Hardware summary

| Property | Detail |
|----------|--------|
| **CPU** | Ricoh 5A22 (65C816 core) -- 16-bit extension of 6502, little-endian |
| **Clock** | 3.58 MHz (SlowROM) / 2.68 MHz (FastROM mode ~3.58 MHz effective) |
| **WRAM** | 128 KB ($7E:0000--$7F:FFFF) |
| **VRAM** | 64 KB (word-addressed, accessed via PPU registers) |
| **ROM** | Up to 4 MB (LoROM) or 4 MB (HiROM); some mappers exceed this |
| **SRAM** | Typically 8--32 KB (battery-backed save) |
| **PPU** | 2 PPU chips, 8 BG modes, 2/4/8bpp tiles, 256 colors on screen from 32768 |
| **Sound** | SPC700 + DSP, 64 KB audio RAM |
| **Endianness** | Little-endian (low byte first) |
| **Medium** | ROM cartridge |

## CPU: 65C816

The 65C816 extends the 6502 with:

- **16-bit accumulator and index registers** (switchable between 8-bit and 16-bit via `REP`/`SEP`)
- **24-bit address bus** (bank byte + 16-bit address), enabling up to 16 MB address space
- **New addressing modes**: long addressing (`$BBHHLL`), stack-relative, block move (`MVN`/`MVP`)
- **Native mode** vs **emulation mode** (emulation mode mimics 6502 behavior)

For localization, the 16-bit capabilities mean text engines often use 16-bit pointers (within a
bank) or 24-bit long pointers (bank + offset). Understanding the bank byte is essential for
pointer table work.

## ROM mapping: LoROM vs HiROM

SNES cartridges use one of two primary memory mapping modes:

| Mode | Header byte ($FFD5) | ROM per bank | Max ROM | Header location |
|------|---------------------|-------------|---------|-----------------|
| **LoROM** | $20 ($30 = FastROM) | 32 KB ($8000--$FFFF) | 4 MB | $00:7FC0 (file offset $7FC0) |
| **HiROM** | $21 ($31 = FastROM) | 64 KB ($0000--$FFFF) | 4 MB | $00:FFC0 (file offset $FFC0) |

A few games use **ExHiROM** ($25) for ROMs larger than 4 MB, and special-chip mappers (SA-1,
SPC7110, S-DD1) have their own bank layouts.

The mapping mode is critical for localization: **pointer values in the ROM are CPU addresses,
not file offsets**. You must convert between the two. See [Memory Map](./memory-map/) for
the conversion formulas.

## Graphics (PPU)

The SNES PPU supports multiple background modes with varying bit depths:

- **Mode 1** (the most common for RPGs): two 4bpp backgrounds + one 2bpp background
- Tile formats: 2bpp (16 bytes/tile), 4bpp (32 bytes/tile), 8bpp (64 bytes/tile)
- Fonts are typically stored as 2bpp or 4bpp tiles in VRAM

Unlike the NES, the SNES has enough CPU power and VRAM bandwidth to implement
**variable-width fonts (VWF)**: render glyphs with bit-shifting in WRAM, then DMA the composed
line to VRAM during VBlank. This makes SNES an excellent platform for scripts that need
proportional rendering (CJK, Hangul jamo composition, Latin with kerning).

See [Graphics & Fonts](./graphics/) for the full tile format reference.

## Why SNES is good for localization

Compared to the NES, SNES localization has several advantages:

1. **More ROM space**: 1--4 MB is typical, and ROM expansion to 4 MB (or beyond with ExHiROM)
   is straightforward. There is usually room for expanded text and font data.

2. **VWF is practical**: the 65816 can perform the bit-shifting needed for variable-width
   rendering within the VBlank budget. Many commercial games already use VWF.

3. **Larger charset capacity**: 4bpp tiles give 16 colors per glyph, and 64 KB of VRAM can
   hold hundreds of tiles. With a multi-byte encoding and VWF, even large scripts like
   Hangul (11,172 syllables) become feasible.

4. **DMA**: hardware DMA transfers make it efficient to move rendered text from WRAM to VRAM
   each frame, which is the core of any SNES VWF implementation.

5. **Mature tooling**: `asar` (the standard SNES patch assembler), `bsnes-plus` (debugger),
   and `superfamiconv` (tile converter) form a solid workflow.

## Typical localization workflow

1. **Identify the mapping mode**: check the header byte at $FFD5 (LoROM or HiROM) to know
   how to convert CPU addresses to file offsets.
2. **Find the font tiles**: use a tile viewer (YY-CHR, Tile Molester, or the VRAM viewer in
   bsnes-plus) to locate the font in ROM.
3. **Find the text**: do a relative search for known strings, then build a `.tbl` file mapping
   byte values to characters.
4. **Trace the text engine**: set read breakpoints in bsnes-plus on the text data addresses
   to find the rendering routine. Identify control codes, pointer tables, and any DTE/MTE
   compression.
5. **Extract and translate**: dump text with Cartographer or a custom script, translate, and
   reinsert with Atlas or a custom inserter.
6. **Patch pointers**: if translated text is longer, relocate strings to expanded ROM space
   and update pointer tables.
7. **Implement VWF** (if needed): hook the font rendering routine to support variable-width
   glyphs. Render to a WRAM buffer and DMA to VRAM.
8. **Build patch**: use `asar` for ASM patches, `Flips` to create an IPS/BPS distribution
   patch.

## References

- fullsnes (nocash): <https://problemkaputt.de/fullsnes.htm> -- the most comprehensive SNES
  hardware reference
- SNESdev Wiki: <https://snes.nesdev.org/wiki/SNESdev_Wiki>
- Anomie's SNES docs (via RHDN)
- undisbeliever's register docs: <https://undisbeliever.net/snesdev/>
