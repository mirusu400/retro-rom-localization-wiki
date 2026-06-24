---
title: "GBA Memory Map"
description: "Complete GBA memory map with all address regions, sizes, bus widths, and their significance for ROM localization — pointers, VRAM layout, and decompressed data buffers."
sidebar:
  order: 3
---

The GBA uses a **flat 32-bit address space** with no bank switching. This is one of the most
important differences from older Nintendo handhelds (GB/GBC) and consoles (NES, SNES) where
banking adds significant complexity to pointer management.

Source: [GBATEK — GBA Memory Map](https://problemkaputt.de/gbatek-gba-memory-map.htm)

## Memory region table

| Address range | Size | Bus | Wait | Region | Description |
|---|---|---|---|---|---|
| `0x00000000`-`0x00003FFF` | 16 KB | 32 | 0 | **BIOS** | System ROM. Contains boot code and SWI functions (including decompression). Not readable except via SWI calls. |
| `0x00004000`-`0x01FFFFFF` | — | — | — | *Unused* | Open bus (reads return prefetch). |
| `0x02000000`-`0x0203FFFF` | 256 KB | 16 | 2 | **EWRAM** | External Work RAM. General-purpose, slower access (2 wait states on 16-bit bus). |
| `0x02040000`-`0x02FFFFFF` | — | — | — | *EWRAM mirror* | Mirrors of `0x02000000` region. |
| `0x03000000`-`0x03007FFF` | 32 KB | 32 | 0 | **IWRAM** | Internal Work RAM. Fast, 32-bit bus, zero wait states. ARM code runs fastest here. |
| `0x03008000`-`0x03FFFFFF` | — | — | — | *IWRAM mirror* | Mirrors of `0x03000000` region. |
| `0x04000000`-`0x040003FE` | ~1 KB | 32 | 0 | **I/O** | Hardware I/O registers (LCD, sound, DMA, timers, serial, keypad, interrupts). |
| `0x05000000`-`0x050003FF` | 1 KB | 16 | 0 | **Palette RAM** | 512 bytes BG palettes + 512 bytes OBJ palettes. 256 colors each (15-bit RGB). |
| `0x05000400`-`0x05FFFFFF` | — | — | — | *Palette mirror* | Mirrors of palette RAM. |
| `0x06000000`-`0x06017FFF` | 96 KB | 16 | 0 | **VRAM** | Video RAM. BG tile/map data (`0x06000000`-`0x0600FFFF`, 64 KB) + OBJ tiles (`0x06010000`-`0x06017FFF`, 32 KB). |
| `0x06018000`-`0x06FFFFFF` | — | — | — | *VRAM mirror* | Mirrors (with some quirks due to 96 KB not being a power of 2). |
| `0x07000000`-`0x070003FF` | 1 KB | 32 | 0 | **OAM** | Object Attribute Memory. 128 OBJ entries (sprites) x 8 bytes = 1 KB. |
| `0x07000400`-`0x07FFFFFF` | — | — | — | *OAM mirror* | Mirrors of OAM. |
| `0x08000000`-`0x09FFFFFF` | 32 MB | 16 | 0* | **ROM WS0** | Game Pak ROM, Wait State 0. **Primary ROM access region.** |
| `0x0A000000`-`0x0BFFFFFF` | 32 MB | 16 | 1* | **ROM WS1** | Game Pak ROM mirror, Wait State 1. Same data, different timing. |
| `0x0C000000`-`0x0DFFFFFF` | 32 MB | 16 | 2* | **ROM WS2** | Game Pak ROM mirror, Wait State 2. Same data, different timing. |
| `0x0E000000`-`0x0E00FFFF` | 64 KB | 8 | 5 | **SRAM** | Cartridge save RAM. **8-bit bus only** — byte-wide access required. |

\* Wait state timing is configurable via the WAITCNT register at `0x04000204`.

All data is **little-endian**. One CPU cycle is approximately 59.59 nanoseconds.

## Memory map diagram

```
0x00000000  ┌──────────────────────┐
            │  BIOS (16 KB)        │  System ROM, SWI handlers
0x00004000  ├──────────────────────┤
            │  (unused)            │
0x02000000  ├──────────────────────┤
            │  EWRAM (256 KB)      │  General work RAM, decompressed buffers
0x02040000  ├──────────────────────┤
            │  (mirrors)           │
0x03000000  ├──────────────────────┤
            │  IWRAM (32 KB)       │  Fast RAM, stack, ARM code
0x03008000  ├──────────────────────┤
            │  (mirrors)           │
0x04000000  ├──────────────────────┤
            │  I/O Registers       │  Hardware control
0x05000000  ├──────────────────────┤
            │  Palette RAM (1 KB)  │  BG + OBJ color palettes
0x06000000  ├──────────────────────┤
            │  VRAM (96 KB)        │  Tile data + maps + bitmaps
0x07000000  ├──────────────────────┤
            │  OAM (1 KB)          │  Sprite attributes
0x08000000  ├──────────────────────┤
            │  ROM (up to 32 MB)   │  ← Game data, text, graphics
0x0A000000  ├──────────────────────┤
            │  ROM mirror (WS1)    │
0x0C000000  ├──────────────────────┤
            │  ROM mirror (WS2)    │
0x0E000000  ├──────────────────────┤
            │  SRAM (up to 64 KB)  │  Save data (8-bit bus)
0x10000000  └──────────────────────┘
```

## Why this matters for localization

### ROM pointers are absolute (`0x08xxxxxx`)

In GBA games, pointers to data in the ROM are **32-bit absolute addresses** with the `0x08000000`
base. To convert between a ROM file offset and a pointer value:

```
pointer = file_offset + 0x08000000
file_offset = pointer - 0x08000000
```

Examples:
- File offset `0x00012345` → pointer `0x08012345`
- Pointer `0x0812ABCD` → file offset `0x0012ABCD`

When searching for pointers in a hex editor, remember the little-endian byte order. A pointer to
file offset `0x00012345` is stored as bytes `45 23 01 08`.

This is much simpler than NES (where pointers are bank-relative 16-bit values) or SNES (where
you must account for LoROM/HiROM address translation).

### EWRAM is the decompression buffer

Games frequently decompress data from ROM into EWRAM (`0x02000000`, 256 KB). When debugging a
game in mGBA:

- Set a breakpoint on the BIOS decompression SWIs.
- After the SWI returns, examine the destination register (r0/r1) — it usually points into EWRAM.
- The decompressed data at that EWRAM address is what the game actually uses.

Text and font data are commonly decompressed into EWRAM before being processed.

### VRAM layout for fonts

Font tiles are stored in VRAM as 4bpp or 8bpp character data (see [Graphics](./graphics/)):

- **BG tiles**: `0x06000000`-`0x0600FFFF` (64 KB, four charblocks of 16 KB each)
- **OBJ tiles**: `0x06010000`-`0x06017FFF` (32 KB)

To find which charblock contains the font, examine the BG control registers (`BG0CNT`-`BG3CNT`
at `0x04000008`-`0x0400000E`) — they specify the charblock base for each background layer.

### SRAM is 8-bit only

The SRAM region at `0x0E000000` has an **8-bit bus**. Only `LDRB`/`STRB` (byte load/store)
instructions work correctly. DMA cannot access SRAM. This matters if your translation patch
needs to modify save data structures (e.g., to store a player name in a wider encoding).

### Access restrictions

Only **DMA3** (and the CPU) can access Game Pak ROM. DMA0-2 cannot. SRAM access is CPU-only;
no DMA channel can read from or write to it. These constraints affect how games copy data from
ROM to VRAM or EWRAM.

## Key I/O registers for localization work

| Address | Register | Relevance |
|---|---|---|
| `0x04000000` | DISPCNT | Display control: BG mode, which layers are enabled |
| `0x04000008` | BG0CNT | BG0 control: charblock base, screenblock base, color mode |
| `0x0400000A` | BG1CNT | BG1 control |
| `0x0400000C` | BG2CNT | BG2 control |
| `0x0400000E` | BG3CNT | BG3 control |
| `0x04000204` | WAITCNT | Wait state control for ROM access timing |

The BGxCNT registers tell you which charblock (tile data base) and screenblock (tile map base) a
background layer uses — essential for finding where the game stores its font and text map in VRAM.

## References

- [GBATEK — GBA Memory Map](https://problemkaputt.de/gbatek-gba-memory-map.htm)
- [GBATEK (main)](https://problemkaputt.de/gbatek.htm)
