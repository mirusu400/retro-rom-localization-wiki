---
title: Tools
description: CLI tools, assemblers, emulators, and utilities for retro-game ROM localization — organized by task.
---

This page collects the tools commonly used in retro-game localization projects. Preference is
given to cross-platform, CLI-scriptable tools. Each entry includes a one-line description and
an install/source link.

## Assemblers and toolchains

These are used to write ASM patches (VWF routines, pointer hacks, ROM expansion) and to
build modified ROMs.

| Platform | Tool | Description | Link |
|----------|------|-------------|------|
| NES | **cc65** (ca65 / ld65 / da65) | 6502 assembler, linker, and disassembler suite. The standard NES homebrew/hacking toolchain. | [cc65.github.io](https://cc65.github.io/) |
| NES / SNES | **64tass** | Multi-pass 6502/65816 assembler. Supports long addressing for SNES. | [sourceforge.net/projects/tass64](https://sourceforge.net/projects/tass64/) |
| SNES | **asar** | 65816 patch assembler that patches a ROM file directly (no separate linker step). The community standard for SNES ROM hacks. | [github.com/RPGHacker/asar](https://github.com/RPGHacker/asar) |
| GB / GBC | **RGBDS** (rgbasm / rgblink / rgbfix) | SM83 (Game Boy CPU) assembler, linker, and header-fixer. The standard GB toolchain. | [rgbds.gbdev.io](https://rgbds.gbdev.io/) |
| GBA / NDS | **devkitPro** (devkitARM) | ARM cross-compiler toolchain (`arm-none-eabi-gcc`). Ships `ndstool`, `gbalzss`, and other utilities. | [devkitpro.org](https://devkitpro.org/) |

### Install notes

- **cc65:** available via most package managers (`brew install cc65`, `apt install cc65`) or
  build from source.
- **RGBDS:** `brew install rgbds` on macOS; pre-built binaries on the releases page.
- **devkitPro:** use the [installer](https://devkitpro.org/wiki/Getting_Started) (pacman-based
  on Linux/macOS, MSys2-based on Windows). Install the `gba-dev` and/or `nds-dev` groups.
- **asar:** download a release binary from GitHub or build with CMake.

## ROM unpack / build (NDS filesystem)

NDS ROMs contain a **NitroFS** filesystem (FNT + FAT tables) that organizes game assets into
files and directories, much like a disc image.

| Tool | Description | Link |
|------|-------------|------|
| **ndstool** | CLI tool to unpack an NDS ROM into its NitroFS folder structure and rebuild it. Part of devkitPro. | [github.com/devkitPro/ndstool](https://github.com/devkitPro/ndstool) |
| **Tinke** | GUI NDS asset browser. Can view/replace individual files (graphics, fonts, text). Useful for exploration alongside ndstool. | [github.com/pleonex/tinke](https://github.com/pleonex/tinke) |

### ndstool usage

```bash
# Unpack an NDS ROM
ndstool -x game.nds -9 arm9.bin -7 arm7.bin -y9 y9.bin -y7 y7.bin \
  -d data -y overlay -t banner.bin -h header.bin

# Rebuild after editing files in data/
ndstool -c modified.nds -9 arm9.bin -7 arm7.bin -y9 y9.bin -y7 y7.bin \
  -d data -y overlay -t banner.bin -h header.bin
```

The `-d data` directory mirrors the NitroFS filesystem. Replace files inside `data/`, then
rebuild.

## Graphics, tiles, and fonts

Tools for converting between image formats (PNG) and the console's native tile format.

| Tool | Description | Link |
|------|-------------|------|
| **rgbgfx** | PNG to/from Game Boy 2bpp tile data. Part of RGBDS. Handles tile deduplication and palettes. | [rgbds.gbdev.io/docs/rgbgfx.1](https://rgbds.gbdev.io/docs/rgbgfx.1) |
| **superfamiconv** | CLI tile/palette/map converter for SNES and GB. Handles 2bpp/4bpp/8bpp, palette reduction, and tile-map generation. | [github.com/Optiroc/SuperFamiconv](https://github.com/Optiroc/SuperFamiconv) |
| **Tile Molester** | Java-based GUI tile editor. Opens any ROM and displays raw tile data at configurable bit-depths. Good for locating font tiles visually. | (use a current fork; original is unmaintained) |
| **YY-CHR** | Windows GUI tile/character editor. Popular in the NES/SNES hacking community for font editing. | (community builds available on RHDN) |

### rgbgfx usage

```bash
# Convert a PNG font sheet to GB 2bpp tiles
rgbgfx -o font.2bpp font.png

# Reverse: 2bpp tiles back to PNG (for inspection)
rgbgfx -r 16 -o font.png font.2bpp
```

The `-r 16` flag sets the output image width to 16 tiles (128 pixels).

### superfamiconv usage

```bash
# Convert a 4bpp SNES font from PNG
superfamiconv tiles -i font.png -o font.4bpp -d 4 -B 4
superfamiconv palette -i font.png -o font.pal -d 4
```

## Text extract / insert

These tools use `.tbl` files to decode and re-encode game text. See
[Text Engine RE](/retro-rom-localization-wiki/text-engine/) for how to build a `.tbl`.

| Tool | Description | Link |
|------|-------------|------|
| **Cartographer** | CLI text dumper. Reads a ROM with a `.tbl` and pointer-table definition, and dumps all strings to a script file. | [romhacking.net/utilities/647](https://www.romhacking.net/utilities/647/) |
| **Atlas** | CLI text inserter. Reads a translated script, writes strings to the ROM, and recomputes pointers automatically. The counterpart to Cartographer. | [romhacking.net/utilities/224](https://www.romhacking.net/utilities/224/) |
| **Custom Python** | For complex or unusual text engines, a custom extraction/insertion script is often the best option. You have full control over multi-byte encodings, pointer formats, and compression. | — |

### Atlas script example

```
#VAR(Table, TABLE)
#ADDTBL("game.tbl", Table)
#ACTIVETBL(Table)

// Pointer table at $1C000, text starts at $1C100
// Write 16-bit little-endian pointers
#JMP($1C000, $1C100)
#W16($1C000)

// String 0
Hello, world![end]
// String 1
Welcome to the game![end]
```

Atlas writes each string at sequential offsets starting from `$1C100` and writes the
corresponding 16-bit pointer to the table at `$1C000`. See
[Pointers](/retro-rom-localization-wiki/pointers/) for details on pointer formats.

## Compression

Tools for decompressing and recompressing data that uses standard GBA/NDS BIOS algorithms.
See [Compression](/retro-rom-localization-wiki/compression/) for identification and strategy.

| Tool | Description | Link |
|------|-------------|------|
| **gbalzss** | GBA BIOS LZ77 (LZSS) compressor/decompressor. Part of devkitPro's general-tools package. | [github.com/devkitPro/general-tools](https://github.com/devkitPro/general-tools) |
| **DSDecmp** | NDS (and GBA) decompressor/recompressor supporting LZ10, LZ11, Huffman (4-bit/8-bit), and RLE. Auto-detects the algorithm from the type byte. | [github.com/Barubary/dsdecmp](https://github.com/Barubary/dsdecmp) |

### Usage

```bash
# gbalzss: decompress
gbalzss d compressed.bin decompressed.bin

# gbalzss: recompress
gbalzss e raw.bin compressed.bin

# DSDecmp: decompress (auto-detect)
dsdecmp -d input.bin output.bin

# DSDecmp: recompress as LZ10
dsdecmp -c lz10 input.bin output.bin
```

## Patch create / apply

Patches are the distribution format for ROM hacks. **Never distribute modified ROMs** — only
distribute patch files that users apply to their own legally obtained dumps.

| Tool | Description | Link |
|------|-------------|------|
| **Flips** | Creates and applies IPS and BPS patches. BPS is preferred (includes source/target checksums). CLI and GUI modes. | [github.com/Alcaro/Flips](https://github.com/Alcaro/Flips) |
| **xdelta3** | Delta-based patching for large files. Better compression ratio than IPS/BPS for big changes (NDS ROMs). | [github.com/jmacd/xdelta](https://github.com/jmacd/xdelta) |

### Usage

```bash
# Create a BPS patch
flips --create original.gba patched.gba translation.bps

# Apply a BPS patch
flips --apply translation.bps original.gba patched.gba

# Create an xdelta patch
xdelta3 -e -s original.nds patched.nds translation.xdelta

# Apply an xdelta patch
xdelta3 -d -s original.nds translation.xdelta patched.nds
```

Always document the expected source ROM checksum (CRC32 or SHA-1) alongside the patch.

## Emulators (debugging and scripting)

Accurate emulators with debugging features are essential for reverse-engineering text engines,
testing font rendering, and verifying patches. Prefer emulators with memory breakpoints,
trace logging, and Lua scripting.

| Emulator | Targets | Key features | Link |
|----------|---------|-------------|------|
| **mGBA** | GB / GBC / GBA | Lua scripting, memory breakpoints, CLI mode. High accuracy. The go-to GBA debugger. | [mgba.io](https://mgba.io/) |
| **Mesen2** | NES / SNES / GB / GBC / GBA | Comprehensive debugger with Lua scripting, memory viewer, trace logger. Cross-platform. | [github.com/SourMesen/Mesen2](https://github.com/SourMesen/Mesen2) |
| **FCEUX** | NES | Lua scripting, PPU viewer, debugger. The classic NES RE tool. Linux CLI support. | [fceux.com](https://fceux.com/) |
| **bsnes-plus** | SNES | Enhanced debugger (breakpoints, trace, VRAM viewer). High accuracy. Best for SNES RE work. | [github.com/devinacker/bsnes-plus](https://github.com/devinacker/bsnes-plus) |
| **SameBoy** | GB / GBC | Very high accuracy. CLI tester mode. Useful for verifying rendering correctness. | [sameboy.github.io](https://sameboy.github.io/) |
| **DeSmuME** | NDS | `desmume-cli` for headless testing. Lua scripting. Adequate accuracy for text work. | [desmume.org](https://desmume.org/) |
| **melonDS** | NDS | Higher accuracy than DeSmuME. Local Wi-Fi emulation. Mostly GUI. | [melonds.kuribo64.net](https://melonds.kuribo64.net/) |

### Debugging workflow

1. **Load the ROM** in an emulator with breakpoint support.
2. **Set a write breakpoint** on the VRAM region where text appears (see
   [Text Engine RE](/retro-rom-localization-wiki/text-engine/#locating-the-font-render-routine)).
3. **Trigger a text box** in-game. The debugger breaks at the render routine.
4. **Trace** the code to understand the text engine's byte-reading loop, control-code
   dispatch, and pointer loading.
5. **Use Lua scripting** to automate repetitive tests (e.g., cycling through all strings,
   checking rendering of every glyph in the font).

## Binary analysis and reverse-engineering helpers

General-purpose tools for when you need to go deeper than the text engine.

| Tool | Description | Notes |
|------|-------------|-------|
| **radare2 / rizin** | CLI disassembler and binary analysis framework. Multi-arch: 6502, 65816, ARM, SM83 (GB). | `r2 -a arm -b 32 game.gba` for GBA; SM83 support via plugins. [radare.org](https://rada.re/) |
| **Ghidra** | NSA's open-source decompiler. Community loaders for SNES, GB/GBC, GBA, NDS. Excellent for understanding complex text engines. | [ghidra-sre.org](https://ghidra-sre.org/) |
| **xxd** | CLI hex dump / reverse. Built into most Unix systems. Useful for quick inspection and scripted binary edits. | `xxd -s 0x1C000 -l 0x100 game.rom` |
| **ImHex** | Modern hex editor with pattern language, data inspector, and visual diff. Cross-platform. | [imhex.werwolv.net](https://imhex.werwolv.net/) |

### Ghidra tips for ROM hacking

- Use the **GhidraBoy** loader for GB/GBC ROMs — it sets up the memory map with correct bank
  layout.
- For GBA, import as ARM little-endian, base address `0x08000000`.
- Define the text pointer table as an array of `pointer` types — Ghidra will auto-create
  cross-references to every string, making it easy to find all text.

## Tool selection by platform

Quick reference for which tools apply to each target platform.

| Task | NES | SNES | GB/GBC | GBA | NDS |
|------|-----|------|--------|-----|-----|
| Assembler | cc65, 64tass | asar, 64tass | RGBDS | devkitARM | devkitARM |
| Tile conversion | YY-CHR | superfamiconv, YY-CHR | rgbgfx | superfamiconv | Tinke |
| Text dump/insert | Cartographer/Atlas | Cartographer/Atlas | Cartographer/Atlas | Cartographer/Atlas | Cartographer/Atlas, custom |
| Compression | (custom) | (custom) | (custom) | gbalzss | DSDecmp, gbalzss |
| ROM unpack | — | — | — | — | ndstool |
| Debugger emu | FCEUX, Mesen2 | bsnes-plus, Mesen2 | mGBA, SameBoy, Mesen2 | mGBA, Mesen2 | DeSmuME, melonDS |
| Patching | Flips | Flips | Flips | Flips | xdelta3, Flips |
| RE / disasm | Ghidra, radare2 | Ghidra, radare2 | Ghidra (GhidraBoy), radare2 | Ghidra, radare2 | Ghidra, radare2 |
