---
title: "Nintendo DS"
description: "Platform overview for NDS localization: dual ARM CPUs (ARM9 + ARM7), NitroFS filesystem, NFTR fonts, and overlay-based code loading."
sidebar:
  order: 1
---

## Overview

| Property | Value |
|----------|-------|
| **CPU** | ARM9 (main, 66 MHz) + ARM7TDMI (co-processor, 33 MHz) |
| **Architecture** | 32-bit ARM (ARMv5TE + ARMv4T) |
| **Endianness** | Little-endian |
| **ROM medium** | Cartridge with NitroFS filesystem |
| **Main RAM** | 4 MB (shared, at `0x02000000`) |
| **VRAM** | 656 KB total (bank-mapped) |
| **Display** | Two screens, each 256x192 pixels |
| **ROM capacity** | Up to 512 MB (128 MB typical for large games) |
| **Localization difficulty** | Medium -- file-based workflow simplifies data access; overlays and compression add complexity |

The Nintendo DS is architecturally very different from the cartridge-ROM platforms that
preceded it (NES, SNES, GB, GBA). While NDS games still ship on ROM cartridges, the
ROM contains a **NitroFS filesystem** with named files and directories -- much more like
working with a disc-based console than patching raw ROM offsets. This makes many
localization tasks more approachable: you unpack the ROM into files, edit the relevant
ones, and rebuild.

The trade-offs: game code is split between a main ARM9 binary and dynamically loaded
**overlays** (often compressed), text and font data may live in proprietary formats
(NFTR fonts, custom archives), and the dual-CPU architecture means some subsystems
run on the ARM7 co-processor.

## Dual-CPU Architecture

The NDS runs two ARM processors simultaneously:

- **ARM9** (ARMv5TE, 66 MHz) -- runs the game logic, graphics, and most code a
  localizer will interact with. The ARM9 binary and its overlays contain the text
  engine, font renderer, script data, and graphics routines.
- **ARM7** (ARMv4T, 33 MHz) -- handles sound, Wi-Fi, touchscreen input, and
  real-time clock. Localizers rarely need to touch ARM7 code unless the game routes
  text through the sound engine or uses ARM7 for some I/O processing.

Both CPUs share the 4 MB main RAM at `0x02000000`. The ARM9 also has fast
Instruction TCM (32 KB at `0x00000000`) and Data TCM (16 KB, configurable address)
for performance-critical routines.

## Localization Approach: File-Based vs Binary Patching

Unlike older cartridge platforms where you patch bytes at raw ROM offsets, NDS
localization typically follows a **file-based workflow**:

1. **Unpack** the ROM into its NitroFS directory tree using
   [ndstool](https://github.com/devkitPro/ndstool) or similar.
2. **Identify** the files containing text, fonts, and graphics. Common locations:
   - `.bin` or custom-extension files in data directories for script/dialogue
   - `.nftr` files for bitmap fonts
   - `.narc` archives (Nitro Archive) containing nested files
   - Overlay files (`overlay_XXXX.bin`) for code and embedded data
3. **Edit** the target files -- decompress if needed, modify text/fonts, recompress.
4. **Rebuild** the ROM with ndstool, which regenerates the FNT and FAT tables.
5. **Test** in an emulator (melonDS or DeSmuME) or on hardware via a flashcart.

For text embedded in the ARM9 binary or overlays, you still need traditional binary
patching techniques (pointer table adjustment, ASM hooks), but the filesystem layer
means most game data is in separate, replaceable files.

## Key Structures for Localization

| Structure | Purpose | Documentation |
|-----------|---------|---------------|
| [ROM Header](./header/) | Locates all major data sections (ARM9, ARM7, FNT, FAT, overlays, icon) | Header reference |
| [NitroFS Filesystem](./filesystem/) | Named files and directories inside the ROM; primary way to access game data | FNT + FAT walkthrough |
| [NFTR Fonts](./fonts/) | Bitmap font format used by many NDS games; must be extended for new scripts | Font format reference |
| [Overlays](./overlays/) | Dynamically loaded code/data; often contain text tables and rendering code | Overlay system guide |
| [Compression](./compression/) | LZ77, LZ11, Huffman, RLE, BLZ used on files and overlays | Compression formats |

## Memory Map Summary

### ARM9 Memory Regions

| Region | Address | Size | Notes |
|--------|---------|------|-------|
| Instruction TCM | `0x00000000` | 32 KB | Fast code memory |
| Data TCM | `0x0xxxx000` | 16 KB | Configurable base address |
| Main RAM | `0x02000000` | 4 MB | Shared with ARM7 |
| Shared WRAM | `0x03000000` | 0--32 KB | Configurable split with ARM7 |
| I/O Registers | `0x04000000` | -- | Hardware control |
| Palettes | `0x05000000` | 2 KB | BG + OBJ palettes (both engines) |
| VRAM (Engine A BG) | `0x06000000` | up to 512 KB | Background tile/bitmap data |
| VRAM (Engine B BG) | `0x06200000` | up to 128 KB | Second-screen backgrounds |
| VRAM (Engine A OBJ) | `0x06400000` | up to 256 KB | Sprite tile data |
| VRAM (Engine B OBJ) | `0x06600000` | up to 128 KB | Second-screen sprites |
| VRAM (LCDC) | `0x06800000` | up to 656 KB | Direct CPU access mode |
| OAM | `0x07000000` | 2 KB | Sprite attributes |
| GBA Slot ROM | `0x08000000` | up to 32 MB | GBA cartridge / Slot-2 |
| ARM9 BIOS | `0xFFFF0000` | 32 KB | Exception vectors, crypto, SWIs |

### ARM7 Memory Regions

| Region | Address | Size | Notes |
|--------|---------|------|-------|
| ARM7 BIOS | `0x00000000` | 16 KB | SWIs, crypto routines |
| Main RAM | `0x02000000` | 4 MB | Shared with ARM9 |
| Shared WRAM | `0x03000000` | 0--32 KB | Configurable split |
| ARM7 WRAM | `0x03800000` | 64 KB | ARM7-exclusive work RAM |
| I/O Registers | `0x04000000` | -- | Including sound, Wi-Fi |
| Wireless | `0x04800000` | 8 KB | Wi-Fi hardware |
| VRAM (as WRAM) | `0x06000000` | up to 256 KB | When mapped for ARM7 |

For localization, the critical region is **Main RAM at `0x02000000`**. The ARM9 binary
loads here (base address in the ROM header, typically `0x02000000` or `0x02000800`),
overlays load to their designated RAM addresses within this space, and most game data
ends up here at runtime. When debugging in an emulator, text buffers, font data, and
string tables will be found in this region.

## Typical Text Engine Patterns

NDS games vary widely in text engine design, but common patterns include:

- **Script files** in NitroFS containing dialogue as binary-encoded text with
  inline control codes (newline, wait, name substitution, color change).
- **Encoding** is often Shift-JIS for Japanese text, sometimes UTF-16 (the NFTR
  format supports both plus UTF-8 and CP1252). Some games use custom single-byte
  or dual-byte encodings with a `.tbl`-style mapping.
- **Fonts** stored as NFTR files in the filesystem, loaded by the NitroSDK font
  rendering library. Replacing or extending NFTR files is the primary way to add
  new glyphs.
- **Text pointers** may be simple offset tables within a script file, or more
  complex structures referencing text by ID. Since files can be resized during ROM
  rebuild, pointer adjustment is sometimes unnecessary -- but if pointers are
  hardcoded in overlays or the ARM9 binary, they must be patched.

## Tools

| Tool | Purpose | Link |
|------|---------|------|
| ndstool | Unpack/rebuild NDS ROMs (NitroFS) | [devkitPro](https://github.com/devkitPro/ndstool) |
| Tinke | GUI NDS file browser, NFTR/NARC editor | [GitHub](https://github.com/pleonex/tinke) |
| DSDecmp | Decompress/recompress LZ/Huffman/RLE | [GitHub](https://github.com/Barubary/dsdecmp) |
| CrystalTile2 | Hex/tile editor with NDS support | [romhacking.net](https://www.romhacking.net/utilities/818/) |
| melonDS | High-accuracy NDS emulator | [melonDS](https://melonds.kuribo64.net/) |
| DeSmuME | NDS emulator with Lua scripting, CLI | [DeSmuME](https://desmume.org/) |
| devkitARM | ARM cross-compiler (ASM patches, custom code) | [devkitPro](https://devkitpro.org/) |

## References

- GBATEK (Martin Korth): [https://problemkaputt.de/gbatek.htm](https://problemkaputt.de/gbatek.htm)
  -- the most comprehensive NDS hardware reference. Covers cartridge header, NitroFS,
  memory map, I/O registers, and everything else.
- devkitPro / ndstool: [https://github.com/devkitPro/ndstool](https://github.com/devkitPro/ndstool)
  -- source code is also useful documentation for the NitroFS format.
- NDS homebrew wiki: [https://wiki.ds-homebrew.com/](https://wiki.ds-homebrew.com/)
