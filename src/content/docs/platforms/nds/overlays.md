---
title: "NDS Overlays"
description: "ARM9/ARM7 overlay system: overlay table structure, BLZ compression, how to find and edit text and code in overlays for NDS game localization."
sidebar:
  order: 5
---

NDS games use **overlays** -- dynamically loaded code and data segments that are
loaded into RAM on demand and can be swapped in and out during gameplay. Unlike
the main ARM9 binary, which is always present in RAM, overlays allow the game to
use more code and data than fits in memory at once.

For localization, overlays are critically important because:

- **Text tables and string data** are frequently stored in overlay data sections.
- **Text engine code** and **font rendering routines** may reside in overlays.
- **Script interpreters** for dialogue systems are often in overlays.
- Overlays are usually **compressed** (BLZ format), requiring decompression before
  editing and recompression afterward.

## What Are Overlays?

The NDS has 4 MB of main RAM at `0x02000000`. The ARM9 binary occupies a portion
of this space (loaded at boot). Overlays are additional code/data segments that
the game loads into specific RAM addresses when needed -- for example, loading
the battle system overlay when entering combat, or the menu overlay when opening
the inventory.

Each overlay has:
- A **file** in the NitroFS filesystem (referenced by file ID in the overlay table)
- A **target RAM address** where it is loaded
- A **size** (both the RAM footprint and BSS/uninitialized data)
- Optionally, a **static initializer** function range (C++ constructors, etc.)
- A **compression flag** indicating whether the file is BLZ-compressed

Most NDS games use only **ARM9 overlays**. ARM7 overlays exist in the format but
are rarely used in commercial games.

## Overlay Table Structure

The overlay table is a flat array of 32-byte entries. Its location and size are
specified in the [ROM header](./header/):

- ARM9 overlay table: header offset `0x050` (offset) and `0x054` (size)
- ARM7 overlay table: header offset `0x058` (offset) and `0x05C` (size)

Number of overlays = table size / 32.

### Overlay Table Entry (32 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | Overlay ID | Sequential identifier (0, 1, 2, ...). |
| `0x04` | 4 | RAM Address | Address in main RAM where this overlay is loaded. |
| `0x08` | 4 | RAM Size | Size of the initialized data/code (loaded from the file). |
| `0x0C` | 4 | BSS Size | Size of the uninitialized data section (zeroed at load time). Total RAM footprint = RAM Size + BSS Size. |
| `0x10` | 4 | Static Init Start | RAM address of the start of the static initializer table (C++ constructor pointers). `0` if none. |
| `0x14` | 4 | Static Init End | RAM address of the end of the static initializer table. |
| `0x18` | 4 | File ID | NitroFS file ID of the overlay data file. Look up the FAT entry at this ID to find the file's ROM offset. |
| `0x1C` | 4 | Compressed Size / Flags | Bits 0--23: compressed size (if compressed). Bit 24: compressed flag (1 = BLZ compressed). Bits 25--31: reserved. |

### Reading the Overlay Table

```python
import struct

with open('game.nds', 'rb') as f:
    header = f.read(0x200)

ovt_off  = struct.unpack_from('<I', header, 0x050)[0]
ovt_size = struct.unpack_from('<I', header, 0x054)[0]
num_overlays = ovt_size // 32

with open('game.nds', 'rb') as f:
    f.seek(ovt_off)
    ovt_data = f.read(ovt_size)

for i in range(num_overlays):
    entry = ovt_data[i*32 : (i+1)*32]
    ov_id      = struct.unpack_from('<I', entry, 0x00)[0]
    ram_addr   = struct.unpack_from('<I', entry, 0x04)[0]
    ram_size   = struct.unpack_from('<I', entry, 0x08)[0]
    bss_size   = struct.unpack_from('<I', entry, 0x0C)[0]
    init_start = struct.unpack_from('<I', entry, 0x10)[0]
    init_end   = struct.unpack_from('<I', entry, 0x14)[0]
    file_id    = struct.unpack_from('<I', entry, 0x18)[0]
    flags      = struct.unpack_from('<I', entry, 0x1C)[0]

    compressed  = bool(flags & (1 << 24))
    comp_size   = flags & 0x00FFFFFF

    print(f"Overlay {ov_id:3d}: RAM 0x{ram_addr:08X}, "
          f"size 0x{ram_size:X}, BSS 0x{bss_size:X}, "
          f"file ID {file_id}, compressed={compressed}")
```

## ARM9 Binary vs Overlays

| Aspect | ARM9 Binary | Overlays |
|--------|-------------|----------|
| **Loaded** | At boot, always in RAM | On demand, can be swapped |
| **Location** | Header fields `0x020`--`0x02F` | Overlay table + NitroFS file |
| **RAM address** | Fixed (usually `0x02000000`) | Per-overlay (from overlay table) |
| **Contains** | Core game loop, system init, always-needed code | Scene-specific code, level data, script tables |
| **Compression** | Sometimes (BLZ at the end of ARM9) | Usually BLZ-compressed |
| **Editable** | Direct binary patching | Decompress, edit, recompress |

Some games put nearly all game logic in overlays, with the ARM9 binary serving
only as a bootstrap loader. Others put most code in the ARM9 binary and use
overlays only for large data tables (including text).

## BLZ (Bottom-LZ) Compression

Most ARM9 overlays (and sometimes the ARM9 binary itself) are compressed with
**BLZ (Bottom-LZ)**, a variant of LZSS that decompresses backwards from the end
of the data. This is because overlays are decompressed in-place: the compressed
data is loaded to the target RAM address, and decompression expands it backward,
so the decompressor can work without a separate output buffer.

### BLZ Footer Structure

BLZ-compressed data has a footer at the very end of the file:

```
[compressed data ... ][ footer (12 bytes) ]
                      ^
                      End of file minus 12 bytes
```

| Offset from EOF | Size | Field | Description |
|-----------------|------|-------|-------------|
| `-12` | 4 | Buffer length | Size difference: decompressed_size - compressed_size. |
| `-8` | 4 | Header length | Offset from the start of the compressed region to the end. |
| `-4` | 4 | Additional size | Encoded size parameters for the decompressor. Byte at `-1` contains header length in the low byte. |

More precisely, the last 4 bytes of the file encode:

- Byte at (end - 5): flags/extra length info
- Last 3 bytes: combined header info

The decompression algorithm:
1. Read the footer to determine the compressed and decompressed sizes.
2. Start from the end of the compressed data, working backward.
3. Process flag bytes (8 blocks per flag, MSB first):
   - Flag bit = 0: copy one literal byte
   - Flag bit = 1: read a (length, displacement) pair and copy from already-
     decompressed data
4. Continue until all decompressed data is produced.

### BLZ Decompression/Recompression Tools

| Tool | Command | Notes |
|------|---------|-------|
| **BLZ** (standalone) | `blz -d overlay_0000.bin` | Part of some NDS toolkits |
| **ndstool** | Handles overlay decompression during extraction with `-w` flag | Integrated workflow |
| **DSDecmp** | `dsdecmp -d overlay_0000.bin` | Supports multiple NDS compression types |
| **Custom Python** | Various community scripts | For scripted batch processing |

ndstool can automatically decompress overlays during extraction:

```bash
# Extract with overlay decompression
ndstool -x game.nds -9 arm9.bin -7 arm7.bin -d data -y overlay -y9 y9.bin

# Overlays in overlay/ will still be compressed
# Use a separate tool to decompress individual overlays
```

## Finding Text in Overlays

### Step 1: Identify Which Overlay Contains Text

Multiple approaches:

1. **Text search:** Decompress all overlays and search for known text strings.
   For Japanese games, search for Shift-JIS-encoded text. For UTF-16 games,
   search for 16-bit character sequences.

   ```bash
   # Decompress all overlays, then search
   for f in overlay/overlay_*.bin; do
       dsdecmp -d "$f" -o "decompressed/$(basename $f)"
   done
   # Search for a known string (e.g., a menu option)
   grep -rl "some_text" decompressed/
   ```

2. **Runtime debugging:** Use DeSmuME's memory viewer or breakpoints. Set a
   read breakpoint on the text rendering function and note which RAM address
   the string comes from. Cross-reference with overlay RAM addresses from the
   overlay table.

3. **Cross-reference overlay RAM ranges:** Each overlay loads at a specific RAM
   address. If you find a string pointer in the ARM9 binary pointing to
   `0x021A5000`, check which overlay covers that address range.

### Step 2: Decompress the Overlay

```bash
dsdecmp -d overlay/overlay_0042.bin -o overlay_0042_dec.bin
```

### Step 3: Find and Edit Text

Open the decompressed overlay in a hex editor. Text may be:

- **Inline strings:** Null-terminated ASCII, Shift-JIS, or UTF-16 strings
  embedded directly in the data section.
- **Pointer + string table:** A table of pointers at one offset, pointing to
  strings at another offset within the same overlay.
- **Script bytecode:** Text embedded in a script/event system with control codes.

When editing:
- If the new text is **shorter or equal length**, pad with null bytes.
- If the new text is **longer**, you must either:
  - Relocate the string to unused space in the overlay
  - Expand the overlay (update the overlay table's RAM Size and recompress)
  - Move strings to an external file and patch the code to load from NitroFS

### Step 4: Recompress and Rebuild

```bash
# Recompress the overlay
dsdecmp -c blz overlay_0042_dec.bin -o overlay/overlay_0042.bin

# Rebuild the ROM
ndstool -c output.nds -9 arm9.bin -7 arm7.bin \
  -d data -y overlay -y9 y9.bin -y7 y7.bin \
  -t banner.bin -h header.bin
```

## Overlay Loading Patterns

Understanding how the game loads overlays helps identify which overlay contains
which data:

### NitroSDK Functions

Games built with the NitroSDK use these functions to load overlays:

- `FS_LoadOverlay(target, overlay_id)` -- loads and decompresses an overlay
- `FS_UnloadOverlay(target, overlay_id)` -- unloads an overlay
- `OS_GetOverlayAddress(overlay_id)` -- returns the overlay's RAM address

By setting breakpoints on these functions in a debugger, you can trace which
overlays are loaded during specific game scenes (title screen, dialogue,
battle, etc.).

### Common Patterns

| Game Phase | Typical Overlay Contents |
|------------|------------------------|
| Title screen / menus | UI strings, menu layout data |
| Overworld / exploration | NPC dialogue tables, map scripts |
| Battle / combat | Battle text, skill names, item descriptions |
| Cutscenes | Cinematic scripts, dialogue sequences |
| System / save | Save/load prompts, settings labels |

## Modifying Overlay Code (ASM Patches)

For more invasive localization changes (e.g., adding a variable-width font
renderer), you may need to patch ARM code within an overlay:

1. **Decompress** the target overlay.
2. **Disassemble** using an ARM disassembler (Ghidra, radare2/rizin with ARM
   support, or IDA). Set the base address to the overlay's RAM address from the
   overlay table.
3. **Write the patch** in ARM assembly, assemble with devkitARM's
   `arm-none-eabi-as` / `arm-none-eabi-gcc`.
4. **Insert the patch** into unused space within the overlay, or append it and
   increase the overlay's RAM Size in the overlay table.
5. **Hook the original code** by replacing an instruction with a branch (`BL`)
   to your patch.
6. **Recompress** and rebuild.

### Finding Free Space in Overlays

- Look for runs of `0x00` bytes or padding at the end of the overlay.
- The BSS section (specified by BSS Size in the overlay table) is zeroed at
  load time and may contain implicit padding.
- If no free space exists, increase the overlay size (but ensure it does not
  collide with another overlay's RAM range).

## Overlay Dependencies and Cross-References

NDS overlays have no dynamic linker and no symbol tables at runtime. Unlike
shared libraries on a PC, an overlay cannot import a function from another
overlay by name. All cross-overlay references are resolved **at compile time
as fixed addresses** or **at runtime through function pointer tables** that
the developer sets up manually. Understanding these patterns is important
for localization because text engines, font renderers, and script
interpreters are often split across multiple overlays or shared with the
ARM9 binary.

### Mutual exclusion (overlapping RAM ranges)

Two overlays that load to the same (or overlapping) RAM address range are
**mutually exclusive** -- the game never loads both at once. This is the NDS
equivalent of overlay "groups" in classic mainframe terminology.

To identify mutual-exclusion groups, dump the overlay table and sort by RAM
address:

```python
# After reading all overlay table entries (see code above):
overlays_by_addr = sorted(overlays, key=lambda o: o['ram_addr'])
for ov in overlays_by_addr:
    end = ov['ram_addr'] + ov['ram_size'] + ov['bss_size']
    print(f"OV{ov['id']:3d}  0x{ov['ram_addr']:08X}--0x{end:08X}")
```

If overlay 5 occupies `0x021A0000`--`0x021C0000` and overlay 12 occupies
`0x021A0000`--`0x021B8000`, they share the same base address and can never
coexist in RAM. The game loads one **or** the other depending on the current
scene (e.g., overworld vs. battle).

**Why this matters for localization:**

- If you expand an overlay (e.g., adding text or a VWF renderer), you must
  ensure the new size does not collide with any overlay that **can** be
  loaded simultaneously. Overlays in the same mutual-exclusion group do not
  matter -- they are never in RAM together.
- If you need to move strings or code between overlays, both overlays must
  be in the same group (so the addresses are valid) or you must use the
  ARM9 binary as an intermediary.

### How overlays call into the ARM9 binary

The ARM9 binary is always present in RAM. Overlays commonly call ARM9
functions directly via hardcoded addresses -- the compiler resolves these at
link time. In a disassembler you will see `BL 0x020XXXXX` instructions that
branch into the ARM9 address range. These calls are safe because the ARM9
binary never moves.

When localizing, if you hook or patch an ARM9 function (e.g., the main text
rendering call), every overlay that calls it will automatically use your
patched version. This makes the ARM9 binary a good place to install global
hooks such as a variable-width font renderer.

### How overlays reference each other

Because overlays can be swapped in and out, direct cross-overlay function
calls are fragile -- if overlay A calls an address in overlay B, but B is
not loaded, the game will crash or read garbage. Games handle this in
several ways:

**Pattern 1: Indirect calls through the ARM9 binary.** The ARM9 binary
contains a function pointer table or dispatch function. Overlays call the
ARM9 dispatcher, which checks whether the target overlay is loaded (loading
it if necessary) and then branches to the target function. This is the
safest and most common pattern in NitroSDK games.

```
Overlay 3 (battle)               ARM9 binary
  BL 0x020ABCDE  ──────────>   dispatch_text_render:
                                   load overlay 7 if needed
                                   BLX [overlay_7_render_ptr]
                                            │
                                            v
                                Overlay 7 (text engine)
                                   render_text_line:
                                   ...
```

**Pattern 2: Shared-address overlays with compatible entry points.** Some
games place overlays that serve the same role (e.g., different level
scripts) at the same RAM address with a known entry point at a fixed offset
from the overlay base. The ARM9 binary calls the entry point; whichever
overlay is currently loaded handles the call.

**Pattern 3: Runtime function pointer registration.** An overlay, on load,
writes its function pointers into a table in the ARM9 binary or in a
dedicated RAM region. Other code uses these pointers to call the overlay's
functions. When the overlay is unloaded, the pointers become invalid. This
pattern is common in games with plugin-style subsystems.

### Static initializers and overlay load/unload

Each overlay table entry has Static Init Start (`0x10`) and Static Init End
(`0x14`) fields. These bracket an array of function pointers in the
overlay's RAM space. When `FS_LoadOverlay` loads an overlay, the NitroSDK
iterates this array and calls each pointer -- these are C++ static
constructors (`sinit` functions) that initialize global objects.

There is no corresponding destructor table in the overlay table format.
Games that need cleanup on unload typically register a teardown function
manually (e.g., via a callback list in the ARM9 binary).

**Localization relevance:** If you add new global/static C++ objects to an
overlay (rare, but possible when injecting a complex text engine), you must
update the Static Init Start/End range to include your new constructor
pointer. If you only patch existing code or add plain C functions, the
static initializer fields can be left unchanged.

### Identifying cross-references in practice

When reverse-engineering a game's overlay structure for localization:

1. **Dump all overlays** and load them into Ghidra or IDA at their correct
   RAM addresses. Use the ARM9 binary as the base program, then add each
   overlay as a memory block at its specified address.

2. **Search for BL/BLX instructions** that target addresses outside the
   current overlay's range. These are cross-references -- note whether they
   point into the ARM9 binary or into another overlay's address range.

3. **Build an overlay dependency map.** For each overlay, list which ARM9
   functions it calls and which other overlay addresses it references. This
   map tells you which overlays share text-engine code and which ones you
   need to patch together.

4. **Trace FS_LoadOverlay calls** in the ARM9 binary. Each call site tells
   you which overlay is loaded during which game state. Set breakpoints on
   `FS_LoadOverlay` and `FS_UnloadOverlay` in DeSmuME or melonDS to build
   a runtime load sequence for each game scene.

5. **Watch for function pointer tables** in the ARM9 binary's data section.
   These are often arrays of 4-byte ARM addresses that change depending on
   which overlay is loaded. Strings like scene names or overlay ID
   constants nearby can help identify what each slot does.

## Practical Tips

1. **Map all overlays first.** Before starting localization, create a table of
   all overlays with their RAM addresses, sizes, and a brief description of
   what each contains (found through testing or disassembly). This saves time
   later.

2. **Watch for overlay conflicts.** Two overlays that load to overlapping RAM
   ranges are never loaded simultaneously. If you increase one overlay's size,
   ensure it does not overlap with a concurrently loaded overlay.

3. **ARM9 footer compression.** Some games compress the tail end of the ARM9
   binary with BLZ. The Secure Area at `0x02000000`--`0x02000800` must remain
   uncompressed. ndstool handles this during rebuild.

4. **Static initializers.** If you add C++-style static initialization to an
   overlay (rare in localization), update the Static Init Start/End fields in
   the overlay table entry.

5. **Batch decompression.** For games with dozens or hundreds of overlays, script
   the decompression to process all overlays at once and search them all for text.

## References

- GBATEK -- DS Cartridge Header (overlay table offsets):
  [https://problemkaputt.de/gbatek-ds-cartridge-header.htm](https://problemkaputt.de/gbatek-ds-cartridge-header.htm)
- GBATEK -- main reference for NDS hardware and data structures:
  [https://problemkaputt.de/gbatek.htm](https://problemkaputt.de/gbatek.htm)
- "Reverse Engineering a DS Game" (Starcube Labs) -- overlay loading and memory layout:
  [https://www.starcubelabs.com/reverse-engineering-ds/](https://www.starcubelabs.com/reverse-engineering-ds/)
- NitroPacker (overlay patching utility):
  [https://github.com/haroohie-club/NitroPacker](https://github.com/haroohie-club/NitroPacker)
- NTRGhidra (Ghidra loader for NDS binaries and overlays):
  [https://github.com/pedro-javierf/NTRGhidra](https://github.com/pedro-javierf/NTRGhidra)
- ndstool source (overlay handling):
  [https://github.com/devkitPro/ndstool](https://github.com/devkitPro/ndstool)
- DSDecmp (BLZ and other NDS compression):
  [https://github.com/Barubary/dsdecmp](https://github.com/Barubary/dsdecmp)
