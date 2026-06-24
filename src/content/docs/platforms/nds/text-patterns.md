---
title: "NDS Text Patterns"
description: "NDS text engine patterns for localization: file-based text in NitroFS, encodings (Shift-JIS, UTF-16LE, custom), BMG message format, control codes, pointer structures, NitroSDK conventions, and the practical extraction-to-reinsertion workflow."
sidebar:
  order: 7
---

NDS games store and render text in a wide variety of ways, but several common
patterns emerge from the NitroSDK conventions and the file-based architecture.
This page catalogs these patterns so you can quickly identify the text system
a game uses and plan a localization approach.

For font-level concerns (glyph bitmaps, character widths, character mapping),
see the [NFTR fonts page](./fonts/). For how text reaches the screen via the
graphics hardware, see the [graphics system page](./graphics/). For the
NitroFS filesystem that holds most text files, see the
[filesystem page](./filesystem/).

## File-Based Text (Most Common)

Unlike older cartridge platforms where text is embedded at raw ROM offsets, most
NDS games store text as **files in the NitroFS filesystem**. After
[extracting the ROM](./filesystem/) with ndstool, you search the extracted
files for text data rather than scanning the raw ROM.

Common file-based text storage patterns:

### Plain Text Files

The simplest case: text stored as readable strings in a file, one per line or
separated by null bytes. Rare on NDS but occasionally found in homebrew or
games with simple text needs.

### Binary Message Files (Very Common)

The most prevalent pattern in NDS games. A binary file contains:

```
+------------------------+
| Header                 |  Magic number, version, entry count, section offsets
+------------------------+
| Pointer/Offset Table   |  Array of 4-byte offsets to each string
+------------------------+
| String Data            |  Encoded text with control codes, null-terminated
+------------------------+
```

The pointer table entries are typically **file-relative offsets** (relative to
the start of the file or the start of the string data section), not ROM-absolute
addresses. This is a key difference from older cartridge platforms: you rarely
deal with ROM-absolute pointers on NDS.

### Example: Generic Binary Message File

```
Offset  Bytes           Description
------  --------------- -----------------------------------
0x00    4D 53 47 00     Magic: "MSG\0"
0x04    XX XX 00 00     Number of strings (16-bit LE)
0x06    ...             Padding or version info

0x08    OO OO OO OO     Offset to string 0 (relative to 0x08 + N*4)
0x0C    OO OO OO OO     Offset to string 1
0x10    OO OO OO OO     Offset to string 2
...

String data area:
        XX XX XX 00     String 0 (null-terminated, encoded)
        XX XX XX 00     String 1
        ...
```

The exact header magic, offset base, and string encoding vary per game. There
is no single standard -- each game (or SDK library) defines its own format.

## BMG Format (Nintendo First-Party)

Nintendo's own first-party NDS games (Pokemon, Zelda, Mario, etc.) frequently
use the **BMG (Binary Message Group)** format. BMG files follow the standard
Nitro container format and use UTF-16LE encoding.

### BMG File Structure

```
+------------------------+
| BMG Header             |  Nitro file header (magic, BOM, size, sections)
+------------------------+
| INF1 Section           |  Information: offset table for each string
+------------------------+
| DAT1 Section           |  Data: UTF-16LE string data
+------------------------+
| FLW1 Section (optional)|  Flow control data (dialogue trees, conditions)
+------------------------+
| FLI1 Section (optional)|  Flow info (additional flow metadata)
+------------------------+
```

### BMG Header

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 8 | Magic | `"MESGbmg1"` (8 bytes) |
| `0x08` | 4 | File Size | Total file size |
| `0x0C` | 4 | Num Sections | Number of sections (typically 2--4) |
| `0x10` | 1 | Encoding | `0x01` = CP1252, `0x02` = UTF-16LE, `0x03` = Shift-JIS, `0x04` = UTF-8 |
| `0x11` | 15 | Padding | Reserved/padding |

### INF1 Section (String Offsets)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | Magic | `"INF1"` |
| `0x04` | 4 | Section Size | Total section size |
| `0x08` | 2 | Num Entries | Number of strings |
| `0x0A` | 2 | Entry Size | Size of each entry (typically 8 bytes) |
| `0x0C` | ... | Entries | Array of entry structures |

Each INF1 entry (when entry size = 8):

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | String Offset | Offset into DAT1 data (relative to DAT1 data start) |
| `0x04` | 4 | Attributes | Game-specific attributes (e.g., text box type, speaker ID) |

### DAT1 Section (String Data)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | Magic | `"DAT1"` |
| `0x04` | 4 | Section Size | Total section size |
| `0x08` | ... | String Data | UTF-16LE encoded strings, null-terminated (`0x0000`) |

### BMG Control Codes (Escape Sequences)

BMG files embed control codes within the UTF-16LE text using an escape
mechanism. A typical escape sequence:

```
0x001A  SS  TT  PP PP ...

0x001A  = Escape marker (UTF-16LE)
SS      = Total size of this escape sequence (including the 0x001A and size byte)
TT      = Type/command
PP PP   = Parameters (variable length, depends on type)
```

Common BMG escape types (game-specific):

| Type | Typical Use | Example Parameters |
|------|------------|-------------------|
| `0x00` | Color change | 2-byte color ID |
| `0x01` | Variable insertion | Variable type + ID (player name, item, number) |
| `0x02` | Font size change | 1-byte size |
| `0x03` | Ruby text (furigana) | Text + base text length |
| `0xFF` | End of styled region | None |

The exact type assignments and parameter formats are **game-specific**. The
escape marker `0x001A` and the size-type header structure are consistent across
Nintendo BMG implementations, but the command set varies.

### Identifying BMG Files

Search extracted NitroFS files for the magic bytes `4D 45 53 47 62 6D 67 31`
("MESGbmg1"). Common file extensions include `.bmg`, `.bin`, or no extension.

## Encodings

### Shift-JIS (Most Common for Japanese Games)

The majority of Japanese NDS games use **Shift-JIS** encoding. Detect it by
looking for these byte patterns in text data:

| Byte Range | Meaning |
|-----------|---------|
| `0x20`--`0x7E` | ASCII (single-byte) |
| `0x81`--`0x9F` | Shift-JIS lead byte (first of a 2-byte sequence) |
| `0xA1`--`0xDF` | Half-width katakana (single-byte) |
| `0xE0`--`0xEF` | Shift-JIS lead byte (first of a 2-byte sequence) |
| `0x40`--`0x7E`, `0x80`--`0xFC` | Shift-JIS trail byte |

A practical detection heuristic: if you see frequent bytes in the `0x82`--`0x83`
range followed by bytes in `0x40`--`0xFC`, the text is almost certainly Shift-JIS.
The range `0x8260`--`0x8279` corresponds to full-width A--Z; `0x824F`--`0x8258`
to full-width 0--9; `0x829F`--`0x82F1` to hiragana.

### UTF-16LE

Used by some Nintendo SDK games, especially those with BMG text files. Detect
by looking for:

- Strings where ASCII characters appear as `XX 00` (e.g., `41 00` = 'A').
- A BOM (`0xFF 0xFE`) at the start of text data (not always present).
- The NFTR font's FINF encoding field set to `1` (UTF-16).

UTF-16LE is the most localization-friendly encoding on NDS because it can
represent any Unicode character, including Korean Hangul (`0xAC00`--`0xD7A3`),
Cyrillic, and CJK unified ideographs.

### UTF-8

Rare on NDS but found in some later or non-Japanese games. Standard UTF-8
multi-byte sequences. The NFTR font encoding field `0` indicates UTF-8.

### Custom Single-Byte Tables

Less common on NDS than on NES/SNES/GB, but some games -- especially ports
from older platforms -- use a custom single-byte encoding with a game-specific
character table. Identify these by:

- Text data using bytes in a narrow range (e.g., `0x00`--`0x80`) that do not
  decode as valid ASCII or Shift-JIS.
- The [relative search technique](/retro-rom-localization-wiki/text-engine/)
  (searching for a known string's byte-distance pattern) to recover the table.

## Control Codes

### Common Single-Byte Control Codes

These appear frequently across many NDS text formats:

| Code | Meaning | Notes |
|------|---------|-------|
| `0x00` | End of string | Null terminator (almost universal) |
| `0x0A` | Newline (LF) | Line feed within a text box |
| `0x0D` | Carriage return | Sometimes paired with `0x0A` |
| `0x01`--`0x09` | Game-specific | Often used as inline commands |

### Multi-Byte Control Codes (Common Pattern)

Many NDS games use a control code system where a specific lead byte signals
an inline command, followed by a command ID and parameters:

```
[Lead byte] [Command ID] [Param 1] [Param 2] ...

Examples:
  0xFF 0x01           = Wait for button press
  0xFF 0x02 XX        = Set text color to XX
  0xFF 0x03 XX XX     = Insert variable (2-byte variable ID)
  0xFF 0x04           = Clear text box
  0xFF 0x05 XX        = Text speed (XX = delay in frames)
  0xFF 0x10 XX XX     = Play sound effect (2-byte SE ID)
```

The lead byte and command set are entirely game-specific. Common lead bytes
include `0xFF`, `0xFE`, `0xFD`, `0x1A`, and `0x5C` (backslash in Shift-JIS
contexts). Document the game's control code table early in the localization
process.

### Documenting Control Codes

To reverse-engineer a game's control codes:

1. Dump all text strings from the game.
2. Look for non-printable bytes that appear in consistent patterns.
3. Test hypotheses by modifying control codes and observing behavior in
   an emulator (text color change? pause? variable substitution?).
4. Set breakpoints on the text rendering routine in the ARM9 binary or
   [overlays](./overlays/) to trace how each byte is interpreted.

## Text Location: ARM9 vs Overlays vs Files

NDS game text can live in three places, each requiring a different approach:

### NitroFS Files (Easiest)

Most dialogue, story text, and item descriptions reside in
[NitroFS](./filesystem/) files. Advantages:

- Files can be freely resized (ndstool regenerates FNT/FAT on rebuild).
- No ROM-absolute pointers to fix -- offsets are file-internal.
- Easy to iterate: extract, edit, rebuild, test.

Search strategy: after extracting with ndstool, use `grep -r` or a hex editor
to search all extracted files for known text strings.

### ARM9 Binary

System strings, error messages, menu labels, and format strings are often
embedded in the ARM9 binary (`arm9.bin`). These strings are at fixed offsets
within the binary and loaded to RAM at the ARM9 entry address.

To locate text in `arm9.bin`:

1. Open it in a hex editor or with `strings -e l arm9.bin` (for UTF-16LE)
   and `strings arm9.bin` (for ASCII/Shift-JIS).
2. Search for known strings (menu text you can read on screen).
3. If the string has a pointer, the pointer is typically a RAM address
   (e.g., `0x020XXXXX`), calculated as:
   ```
   RAM address = ARM9 load address + (file offset within arm9.bin)
   ```
   The ARM9 load address is in the [ROM header](./header/) at offset `0x28`.

Editing ARM9 strings is riskier: if the replacement is longer, you must either
find padding space, truncate, or relocate the string and patch the pointer.

### Overlays

[Overlays](./overlays/) contain dynamically loaded code and data. Text in
overlays is common for:

- Chapter-specific or event-specific dialogue.
- Mode-specific UI strings (battle mode, shop, crafting).
- Tutorial text.

Overlays are loaded to specific RAM addresses (defined in the overlay table).
Pointers to overlay text use RAM addresses, not file offsets. If you modify
overlay text, you may need to adjust pointers in the overlay's code.

Overlays are frequently [compressed](./compression/) (BLZ/LZ77), so decompress
before searching for text.

### Search Strategy

When beginning a localization project, search all three locations:

```bash
# Extract the ROM
ndstool -x game.nds -9 arm9.bin -7 arm7.bin -y9 y9.bin -y7 y7.bin \
        -d data -y overlay -t banner.bin -h header.bin

# Search NitroFS files for text (Shift-JIS example)
find data/ -type f -exec grep -l "known_ascii_text" {} \;

# Search ARM9 binary
strings arm9.bin | grep "known_text"
strings -e l arm9.bin | grep "known_text"  # UTF-16LE

# Search overlays (decompress first if needed)
for f in overlay/*.bin; do strings "$f" | grep "known_text"; done
```

## Pointer Structures in NDS Text

### File-Internal Offsets

The most common pointer type in NDS text files. Offsets are relative to:

- The **start of the file** (absolute file offset).
- The **start of the string data section** (section-relative).
- The **start of the offset table** (table-relative).

```
Example file layout:

Offset  Content
------  -------
0x00    Number of strings: 03 00
0x02    Padding: 00 00
0x04    Offset to string 0: 10 00 00 00   -> string at file offset 0x10
0x08    Offset to string 1: 1A 00 00 00   -> string at file offset 0x1A
0x0C    Offset to string 2: 28 00 00 00   -> string at file offset 0x28
0x10    "Hello!\0"                         (Shift-JIS or ASCII)
0x1A    "Good morning.\0"
0x28    "Goodbye!\0"
```

### Section-Relative Offsets

Some formats (including BMG) use offsets relative to a section start:

```
INF1 entry offset = 0x0C   (relative to DAT1 data start at 0x08 within DAT1)

Actual string position = DAT1 section offset + 0x08 + INF1 entry offset
```

### No ROM-Absolute Pointers (Usually)

Unlike NES/SNES/GB where pointers are absolute ROM addresses (or bank:offset),
NDS text pointers are almost always **within the file**. Since the NitroFS
filesystem and ndstool handle file placement automatically, you do not need to
worry about where in the ROM the file ends up.

The exception: text pointers in the ARM9 binary and overlays, which use
**RAM addresses** (`0x02XXXXXX`). These must be patched if the referenced
data moves.

## NitroSDK / NitroSystem Text Conventions

Games built with the official NitroSDK follow recognizable patterns:

### G2D Text Rendering

The NitroSDK's G2D library provides text rendering via NFTR fonts:

1. Load an NFTR font file with `NNS_G2dGetUnpackedFont()`.
2. Initialize a text canvas on a BG layer.
3. Call text rendering functions that:
   - Look up character codes in the NFTR CMAP to get glyph indices.
   - Read glyph bitmaps from CGLP and widths from CWDH.
   - Write glyph data as tiles into [VRAM](./graphics/) and update the
     BG tilemap.

### Identifying SDK Version

Look for SDK version strings in `arm9.bin`:

```
strings arm9.bin | grep "SDK"
```

Common results: `"NitroSDK - 4.2"`, `"IRIS SDK"` (later SDK versions).
The SDK version can hint at which text and font APIs are available.

### Message Archive Conventions

NitroSDK games often organize text in **NARC archives** (Nitro Archive,
magic `"NARC"`). A NARC file contains multiple sub-files, each being a
message file. Common patterns:

- One NARC per game area or chapter.
- Sub-files numbered sequentially (file 0 = NPC dialogue, file 1 = item
  names, file 2 = location names, etc.).
- Each sub-file uses the same binary message format.

Extract NARC archives with ndstool or Tinke, then process each sub-file
individually.

## Practical Localization Workflow

### Step-by-Step NDS Text Localization

**1. Extract the ROM:**

```bash
ndstool -x game.nds -9 arm9.bin -7 arm7.bin -y9 y9.bin -y7 y7.bin \
        -d data -y overlay -t banner.bin -h header.bin
```

**2. Search for text:**

Use `strings`, hex editors, or encoding-aware search tools to find text in
the extracted files. For Shift-JIS text, use a tool that understands the
encoding (e.g., `iconv` to convert to UTF-8, then `grep`).

```bash
# Convert Shift-JIS files to UTF-8 for searching
find data/ -type f -exec sh -c \
  'iconv -f SHIFT-JIS -t UTF-8 "$1" 2>/dev/null | grep -l "search_term"' _ {} \;
```

**3. Identify the text format:**

Examine the file in a hex editor. Look for:

- Magic bytes at the file header (e.g., `"MESGbmg1"` for BMG).
- An offset table near the start (a sequence of increasing 32-bit LE values).
- Null-terminated strings in Shift-JIS, UTF-16LE, or custom encoding.

**4. Write an extractor/inserter:**

Python with the `struct` module is the standard approach:

```python
import struct

def extract_messages(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()

    # Example: simple header with count + offset table
    count = struct.unpack_from('<H', data, 0x00)[0]
    offsets = []
    for i in range(count):
        off = struct.unpack_from('<I', data, 0x04 + i * 4)[0]
        offsets.append(off)

    strings = []
    for i, off in enumerate(offsets):
        # Find null terminator
        end = data.index(b'\x00', off)
        raw = data[off:end]
        text = raw.decode('shift_jis', errors='replace')
        strings.append(text)

    return strings
```

**5. Handle encoding conversion:**

If the game uses Shift-JIS and the target language requires Unicode
(e.g., Korean Hangul), you have two options:

- **Remap Shift-JIS codes:** Treat Shift-JIS byte sequences as arbitrary
  glyph indices. Map target-language characters to unused or repurposed
  Shift-JIS code points. Update the [NFTR CMAP](./fonts/) to map these
  code points to the new glyphs. This avoids patching the game's encoding
  logic but limits the available character slots.

- **Patch to UTF-16LE:** Modify the game's text loading code (in the ARM9
  binary or overlays) to read UTF-16LE instead of Shift-JIS. This gives
  full Unicode access but requires ARM assembly patching.

**6. Edit the NFTR font:**

Add glyphs for the target script to the game's [NFTR font](./fonts/).
See the font page for the detailed walkthrough (CGLP bitmaps, CWDH widths,
CMAP character mapping).

**7. Reinsert text and rebuild:**

Write the modified text back into the binary message files (updating the
offset table if string lengths changed), replace the files in the extracted
NitroFS tree, and rebuild:

```bash
ndstool -c game_patched.nds -9 arm9.bin -7 arm7.bin -y9 y9.bin -y7 y7.bin \
        -d data -y overlay -t banner.bin -h header.bin
```

**8. Test:**

Test in melonDS (higher accuracy) or DeSmuME (Lua scripting for automated
testing). Check:

- All text displays correctly on both screens.
- Control codes still function (color changes, name variables, pauses).
- Text does not overflow text boxes (especially with longer translations).
- No graphical glitches on the BG layer displaying text.

## Tools for NDS Text

| Tool | Purpose | Link |
|------|---------|------|
| **ndstool** | Extract/rebuild NDS ROMs (NitroFS) | [devkitPro](https://github.com/devkitPro/ndstool) |
| **CrystalTile2** | Hex editor with NDS-specific features: tile viewer, text search, palette viewer | [romhacking.net](https://www.romhacking.net/utilities/818/) |
| **Kuriimu2** | Multi-format game text editor with NDS support; handles BMG and many custom formats | [GitHub](https://github.com/FanTranslatorsInternational/Kuriimu2) |
| **kiwi.ds** | NDS text editor for common message formats | (community tool) |
| **Tinke** | GUI NDS file browser; can view text in some file types and edit NFTR fonts | [GitHub](https://github.com/pleonex/tinke) |
| **Custom Python** | Recommended for per-game binary format parsing (`struct` module), encoding conversion, and batch text extraction/insertion | -- |
| **melonDS** | High-accuracy NDS emulator for testing | [melonDS](https://melonds.kuribo64.net/) |
| **DeSmuME** | NDS emulator with Lua scripting and debugger for RE work | [DeSmuME](https://desmume.org/) |

## Quick Reference: Identifying Text Format

| Observation | Likely Format |
|-------------|--------------|
| File starts with `"MESGbmg1"` | BMG (Nintendo first-party) |
| File has a 4-byte magic + offset table | Custom binary message file |
| Strings contain `0x82XX` / `0x83XX` byte pairs | Shift-JIS encoded |
| ASCII characters appear as `XX 00` pairs | UTF-16LE encoded |
| NFTR FINF encoding field = `1` | Font expects UTF-16 character codes |
| NFTR FINF encoding field = `2` | Font expects Shift-JIS character codes |
| Bytes in range `0x00`--`0x80` with no valid ASCII | Custom single-byte table |
| Text found in `arm9.bin` at fixed offsets | Hardcoded strings (pointer patching needed) |
| Text found in `overlay_XXXX.bin` | Overlay-embedded (decompress first, pointer patching may be needed) |
| File inside a NARC archive (magic `"NARC"`) | Extract NARC first, then analyze sub-files |

## References

- GBATEK (Martin Korth):
  [https://problemkaputt.de/gbatek.htm](https://problemkaputt.de/gbatek.htm)
  -- NDS hardware and file format reference.
- BMG format documentation:
  Community reverse engineering; see Kuriimu2 source for format parsers.
- NitroSDK documentation:
  Available through devkitPro and leaked SDK documentation. The G2D text
  rendering API documentation describes the NFTR loading and rendering pipeline.
