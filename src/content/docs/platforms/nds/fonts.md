---
title: "NDS Fonts (NFTR)"
description: "NFTR (NitroFont Resource) format: header, FINF font info, PLGC/CGLP glyph bitmaps, HDWC/CWDH character widths, and PAMC/CMAP character mapping -- how to add glyphs for new scripts."
sidebar:
  order: 3
---

Many NDS games use the **NFTR (Nitro Font Resource)** format for bitmap fonts.
NFTR files are part of the NitroSDK and are loaded by the system's font rendering
library. For localization, NFTR is critical: to display a new script (e.g., Korean
Hangul, Cyrillic, additional Latin characters), you must add glyph bitmaps and
character mappings to the game's NFTR font files.

NFTR files are typically found in the NitroFS filesystem with `.nftr` or `.NFTR`
extensions, though some games rename them or embed them inside NARC archives.

Source: Structure documented via Tinke source code
([GitHub](https://github.com/pleonex/tinke)) and community reverse engineering.

## File Structure Overview

An NFTR file uses the standard Nitro container format: a file header followed by
multiple tagged sections (blocks). The sections appear in this order:

```
+------------------+
| NFTR Header      |  Generic Nitro file header
+------------------+
| FINF Section     |  Font Information (encoding, dimensions, offsets)
+------------------+
| CGLP Section     |  Character Glyph (bitmap data for all glyphs)
+------------------+
| CWDH Section     |  Character Width Data (per-glyph spacing)
+------------------+
| CMAP Section(s)  |  Character Map (character code -> glyph index)
+------------------+  (may repeat multiple times)
```

The section names in the binary are stored **reversed** (a Nitro convention):
`FINF` appears as `"FNIF"`, `CGLP` as `"PLGC"`, `CWDH` as `"HDWC"`, and `CMAP`
as `"PAMC"` in the raw bytes.

## NFTR Header

The generic Nitro file header appears at the start of every NFTR file:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | Magic | `"RTFN"` (NFTR reversed). Identifies this as an NFTR file. |
| `0x04` | 2 | BOM | Byte Order Mark. `0xFEFF` = little-endian (standard on NDS). |
| `0x06` | 2 | Version | Format version. Common values: `0x0100`, `0x0101`. |
| `0x08` | 4 | File Size | Total file size in bytes. |
| `0x0C` | 2 | Header Size | Size of this header, typically `0x10`. |
| `0x0E` | 2 | Num Sections | Number of sections that follow (FINF + CGLP + CWDH + N * CMAP). |

## FINF: Font Information

The FINF section contains global font parameters and offsets to the other sections.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | Magic | `"FNIF"` (FINF reversed). |
| `0x04` | 4 | Section Size | Total size of this section in bytes. |
| `0x08` | 1 | Unknown | Usually `0x00`. |
| `0x09` | 1 | Height | Font line height in pixels. |
| `0x0A` | 2 | Null Char Index | Glyph index used for unmapped characters (fallback/default glyph). |
| `0x0C` | 1 | Unknown | Usually `0x00`. |
| `0x0D` | 1 | Default Width | Default glyph advance width in pixels. |
| `0x0E` | 1 | Default Width (alt) | Sometimes a duplicate or related width value. |
| `0x0F` | 1 | Encoding | Character encoding used by CMAP sections: |
|        |   |          | `0` = UTF-8 |
|        |   |          | `1` = UTF-16 |
|        |   |          | `2` = Shift-JIS |
|        |   |          | `3` = CP1252 (Windows Latin-1) |
| `0x10` | 4 | CGLP Offset | Offset to the CGLP section (relative to NFTR start). |
| `0x14` | 4 | CWDH Offset | Offset to the CWDH section (relative to NFTR start). |
| `0x18` | 4 | CMAP Offset | Offset to the first CMAP section (relative to NFTR start). |

If the section size is `0x20` (instead of the minimum `0x1C`), four additional
fields are present:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x1C` | 1 | Font Height | Actual rendered font height (may differ from line height). |
| `0x1D` | 1 | Font Width | Actual rendered font width. |
| `0x1E` | 1 | Bearing Y | Vertical offset from baseline. |
| `0x1F` | 1 | Bearing X | Horizontal offset from left edge. |

### Encoding Notes for Localization

The encoding field determines how the game interprets character codes when looking
up glyphs via the CMAP:

- **UTF-16 (1)** is the most common for Japanese NDS games. Character codes in
  text data are 16-bit values that map directly to Unicode code points.
- **Shift-JIS (2)** is used by some Japanese games, especially those ported from
  older platforms.
- **CP1252 (3)** appears in some Western-region releases.
- **UTF-8 (0)** is rare on NDS but supported.

When localizing to a new script, the encoding must support the target characters.
UTF-16 can represent any Unicode character; Shift-JIS and CP1252 cannot represent
Korean, Cyrillic, or many other scripts. If the game uses Shift-JIS, you may need
to either remap character codes (treating Shift-JIS code points as arbitrary glyph
indices) or patch the game to use UTF-16.

## CGLP: Character Glyph Data

The CGLP section contains the bitmap data for every glyph in the font.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | Magic | `"PLGC"` (CGLP reversed). |
| `0x04` | 4 | Section Size | Total size of this section including header and all glyph data. |
| `0x08` | 1 | Tile Width | Width of each glyph bitmap in pixels. |
| `0x09` | 1 | Tile Height | Height of each glyph bitmap in pixels. |
| `0x0A` | 2 | Tile Size | Size of each glyph bitmap in bytes. |
| `0x0C` | 2 | Unknown | Usually `0x00`. |
| `0x0E` | 1 | Depth (BPP) | Bits per pixel: `1` (monochrome), `2`, `4`, or `8`. |
| `0x0F` | 1 | Rotation Mode | Tile rotation/arrangement. Usually `0x00`. |
| `0x10` | ... | Glyph Data | Array of glyph bitmaps, each `Tile Size` bytes. |

### Glyph Bitmap Format

Each glyph is a `Tile Width` x `Tile Height` pixel bitmap packed at `Depth` bits
per pixel:

- **1 bpp (monochrome):** Each pixel is 1 bit. 0 = transparent, 1 = opaque.
  An 8x12 glyph at 1 bpp = 12 bytes.
- **2 bpp:** 4 levels of opacity (anti-aliasing). An 8x12 glyph = 24 bytes.
- **4 bpp:** 16 levels. Allows smooth anti-aliased text. An 8x12 glyph = 48 bytes.
- **8 bpp:** 256 levels. Rare, very large. An 8x12 glyph = 96 bytes.

Pixels are packed left-to-right, top-to-bottom, with the most significant bits
first within each byte. The formula for tile size is:

```
tile_size = ceil(tile_width * tile_height * depth / 8)
```

The total number of glyphs in the font is:

```
num_glyphs = (section_size - header_size) / tile_size
```

### Adding Glyphs

To add new glyphs (e.g., for Korean Hangul):

1. Design the glyph bitmaps at the font's `Tile Width` x `Tile Height` and `Depth`.
2. Append the new glyph bitmaps to the CGLP glyph data array.
3. Update the CGLP section size.
4. Add corresponding entries in CWDH (width data) and CMAP (character mapping).
5. Update the NFTR file size in the header.

## CWDH: Character Width Data

The CWDH section specifies the horizontal spacing for each glyph, enabling
proportional (variable-width) text rendering.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | Magic | `"HDWC"` (CWDH reversed). |
| `0x04` | 4 | Section Size | Total size of this section. |
| `0x08` | 2 | First Code | First glyph index covered by this table. |
| `0x0A` | 2 | Last Code | Last glyph index covered by this table. |
| `0x0C` | 4 | Unknown | Usually `0x00000000`. |
| `0x10` | ... | Width Entries | Array of 3-byte entries, one per glyph from First to Last. |

### Width Entry (3 bytes per glyph)

| Byte | Field | Description |
|------|-------|-------------|
| 0 | Left Spacing | Signed. Pixels to skip before the glyph (can be negative for overlap/kerning). |
| 1 | Glyph Width | Unsigned. Width of the visible glyph in pixels. |
| 2 | Advance Width | Unsigned. Total horizontal advance: left_spacing + glyph_width + right_spacing. The cursor moves this many pixels after drawing. |

**Example:** A glyph with left spacing `1`, glyph width `6`, advance width `8`
has 1 pixel of left padding, 6 pixels of visible glyph, and 1 pixel of right
padding before the next character.

For a fixed-width font, all entries will have the same advance width. For a
proportional font (common in NDS games), each glyph has its own advance width.

When adding new glyphs, append width entries to the CWDH array and update the
Last Code field and section size.

## CMAP: Character Map

CMAP sections map **character codes** (the values used in the game's text data)
to **glyph indices** (positions in the CGLP bitmap array). Multiple CMAP sections
can exist in a single NFTR file, chained together; each covers a range of
character codes.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 4 | Magic | `"PAMC"` (CMAP reversed). |
| `0x04` | 4 | Section Size | Total size of this section. |
| `0x08` | 2 | First Char | First character code in this CMAP's range. |
| `0x0A` | 2 | Last Char | Last character code in this CMAP's range. |
| `0x0C` | 4 | Mapping Type | `0` = Direct, `1` = Table, `2` = Scan. |
| `0x10` | 4 | Next CMAP Offset | Offset to the next CMAP section (relative to NFTR start), or `0x00000000` if this is the last CMAP. |
| `0x14` | ... | Mapping Data | Type-specific data (see below). |

### Type 0: Direct Mapping

The simplest mapping. A single value specifies the glyph index for `First Char`;
subsequent character codes map to consecutive glyph indices.

| Offset | Size | Field |
|--------|------|-------|
| `0x14` | 2 | First Glyph Index |

Character code `C` maps to glyph index `First Glyph Index + (C - First Char)`.

This is efficient for contiguous ranges (e.g., mapping ASCII `0x20`--`0x7E` to
glyphs 0--94).

### Type 1: Table Mapping

An explicit lookup table. Each character code in the range has a 2-byte glyph
index entry.

| Offset | Size | Field |
|--------|------|-------|
| `0x14` | 2 * (Last - First + 1) | Array of glyph indices |

Entry `i` gives the glyph index for character code `First Char + i`. A value of
`0xFFFF` means the character is unmapped (uses the null/default glyph).

This is used when the character code range is contiguous but the glyph indices
are not sequential.

### Type 2: Scan Mapping

A sparse mapping for non-contiguous character codes.

| Offset | Size | Field |
|--------|------|-------|
| `0x14` | 2 | Number of Pairs |
| `0x16` | 4 * N | Array of (char_code, glyph_index) pairs |

Each pair is two 16-bit values: the character code and its glyph index. Only
the specific listed codes are mapped.

This is efficient when adding a scattered set of characters (e.g., a few hundred
Korean syllables out of the 11,172 possible).

## Adding a New Script: Walkthrough

To add Korean Hangul support to an NFTR font (high-level steps):

### 1. Determine the Glyph Set

Decide which characters to add. For Korean, options range from a precomposed
subset (e.g., the 2,350 KS X 1001 syllables) to a jamo-composition approach.
See the [Korean language page](/retro-rom-localization-wiki/languages/korean/)
for details on syllable counts and strategies.

### 2. Create Glyph Bitmaps

Design each new glyph at the font's existing `Tile Width` x `Tile Height` and
`Depth`. For readable Korean at 8x8 pixels (1 bpp), quality will be poor -- at
least 10x10 or 12x12 at 2+ bpp is recommended. If the existing font is too small,
you may need to increase `Tile Width` and `Tile Height` and re-render all existing
glyphs at the new size as well.

### 3. Append to CGLP

Add the new glyph bitmaps to the end of the CGLP data array. Record the starting
glyph index (= previous glyph count).

### 4. Add CWDH Entries

Append 3-byte width entries for each new glyph. Update the Last Code field and
section size.

### 5. Add a CMAP Section

Create a new CMAP section that maps the target character codes (e.g., Unicode
Hangul Syllables `0xAC00`--`0xD7A3` for the subset you are including) to the
new glyph indices. Use Type 0 (Direct) if the subset is contiguous, Type 1
(Table) if it is contiguous but maps to non-sequential glyphs, or Type 2 (Scan)
if the subset is sparse.

Chain the new CMAP by setting the previous last CMAP's `Next CMAP Offset` to
point to the new section.

### 6. Update Headers

- Update the CGLP, CWDH section sizes.
- Update the NFTR header's file size and section count.
- Rewrite the file.

### 7. Update the Game's Text Data

Change the game's text/script files to use the new character codes. If the game
uses Shift-JIS encoding, you will need to either reinterpret codes or patch the
game to use UTF-16.

## NFTR binary walkthrough

Below is an annotated hex dump of a minimal NFTR file containing a tiny 8x8
monochrome (1 bpp) font with four ASCII glyphs: space (`0x20`), `!` (`0x21`),
`A` (`0x41`), and `B` (`0x42`). The file uses two CMAP sections (one Type 0
for the contiguous `0x20`--`0x21` range, one Type 2 scan for the scattered
`0x41`/`0x42` pair) and a single CWDH block. Total file size: `0xB0` (176
bytes).

The hex is broken into logical sections. All multi-byte integers are
little-endian (standard NDS byte order). Offsets in the left column are
relative to the start of the file.

### NFTR header (16 bytes)

```
Offset  Bytes                           Field
------  ------------------------------  -------------------------
0x00    52 54 46 4E                     Magic "RTFN"
0x04    FF FE                           BOM (little-endian)
0x06    01 01                           Version 1.1 (0x0101)
0x08    B0 00 00 00                     File size = 0xB0 (176)
0x0C    10 00                           Header size = 0x10 (16)
0x0E    05 00                           Section count = 5
                                        (FINF + CGLP + CWDH + 2 CMAPs)
```

`0x0E` section count: always `3 + N` where N is the number of CMAP sections.
Here we have two CMAPs, so 5.

### FINF section (offset 0x10, 28 bytes)

```
Offset  Bytes                           Field
------  ------------------------------  -------------------------
0x10    46 4E 49 46                     Magic "FNIF" (FINF reversed)
0x14    1C 00 00 00                     Section size = 0x1C (28)
0x18    00                              (unknown, zero)
0x19    08                              Line height = 8 px
0x1A    00                              (unknown)
0x1B    00 00                           Null-char glyph index = 0
0x1D    08                              Default width = 8 px
0x1E    08                              Default width (alt) = 8
0x1F    01                              Encoding = 1 (UTF-16)
0x20    34 00 00 00                     CGLP offset = 0x2C + 8 = 0x34
0x24    64 00 00 00                     CWDH offset = 0x5C + 8 = 0x64
0x28    80 00 00 00                     First CMAP offset = 0x78 + 8 = 0x80
```

The offset fields in FINF point **8 bytes into** the target section (past
the section magic and size), matching the GBATEK specification: "offset + 8"
relative to NFTR start. To find the true start of each section, subtract 8:

| Field | Stored value | Section start |
|-------|-------------|---------------|
| CGLP offset | `0x34` | `0x2C` |
| CWDH offset | `0x64` | `0x5C` |
| First CMAP offset | `0x80` | `0x78` |

### CGLP section (offset 0x2C, 48 bytes)

This section holds four 8-byte glyph bitmaps (8x8 at 1 bpp = 8 bytes each).

```
Offset  Bytes                           Field
------  ------------------------------  -------------------------
0x2C    50 4C 47 43                     Magic "PLGC" (CGLP reversed)
0x30    30 00 00 00                     Section size = 0x30 (48)
                                        = 0x10 header + 4 glyphs * 8 bytes
0x34    08                              Tile width = 8 px
0x35    08                              Tile height = 8 px
0x36    08 00                           Tile size = 8 bytes
0x38    00                              Underline position
0x39    08                              Max proportional width
0x3A    01                              Depth = 1 bpp
0x3B    00                              Rotation = none
```

Glyph bitmap data immediately follows at `0x3C`. Each glyph is 8 bytes
(one byte per row, MSB = leftmost pixel):

```
Offset  Bytes                           Glyph
------  ------------------------------  -------------------------
0x3C    00 00 00 00 00 00 00 00         [0] space (all blank)
0x44    18 18 18 18 18 00 18 00         [1] '!' (vertical line + dot)
0x4C    7C C6 C6 FE C6 C6 C6 00        [2] 'A'
0x54    FC C6 C6 FC C6 C6 FC 00        [3] 'B'
```

The glyph index is simply its position in this array: space = 0, `!` = 1,
`A` = 2, `B` = 3.

### CWDH section (offset 0x5C, 28 bytes)

```
Offset  Bytes                           Field
------  ------------------------------  -------------------------
0x5C    48 44 57 43                     Magic "HDWC" (CWDH reversed)
0x60    1C 00 00 00                     Section size = 0x1C (28)
                                        = 0x10 header + 4 * 3 bytes
0x64    00 00                           First tile index = 0
0x66    03 00                           Last tile index = 3
0x68    00 00 00 00                     (unused, zero)
```

Width entries begin at `0x6C`, three bytes per glyph:

```
Offset  Bytes     Left  Width  Advance   Glyph
------  --------  ----  -----  -------   -----
0x6C    00 04 08   0     4      8        [0] space
0x6F    01 06 08   1     6      8        [1] '!'
0x72    00 08 08   0     8      8        [2] 'A'
0x75    00 08 08   0     8      8        [3] 'B'
```

For a fixed-width 8-pixel font, every glyph has advance = 8. The space
glyph is only 4 pixels wide in the bitmap, but the advance is still 8,
producing the expected blank gap.

### CMAP section 1 -- Type 0 direct (offset 0x78, 24 bytes)

Maps the contiguous range `0x0020`--`0x0021` (space and `!`) to glyph
indices starting at 0.

```
Offset  Bytes                           Field
------  ------------------------------  -------------------------
0x78    50 41 4D 43                     Magic "PAMC" (CMAP reversed)
0x7C    18 00 00 00                     Section size = 0x18 (24)
0x80    20 00                           First char = 0x0020
0x82    21 00                           Last char = 0x0021
0x84    00 00 00 00                     Mapping type = 0 (Direct)
0x88    90 00 00 00                     Next CMAP offset = 0x90
                                        (points to second CMAP)
0x8C    00 00                           First glyph index = 0
0x8E    00 00                           (padding to 4-byte boundary)
```

Type 0 means: character `0x0020` maps to glyph `0`, and `0x0021` maps to
glyph `0 + (0x0021 - 0x0020) = 1`. Simple and compact for contiguous ranges.

### CMAP section 2 -- Type 2 scan (offset 0x90, 32 bytes)

Maps the non-contiguous characters `A` (`0x0041`) and `B` (`0x0042`) using
explicit (character, glyph) pairs.

```
Offset  Bytes                           Field
------  ------------------------------  -------------------------
0x90    50 41 4D 43                     Magic "PAMC" (CMAP reversed)
0x94    20 00 00 00                     Section size = 0x20 (32)
                                        = 0x14 header + 2 (count) + 2*4 (pairs)
                                          + 2 (padding) = 0x20
0x98    41 00                           First char = 0x0041
0x9A    42 00                           Last char = 0x0042
0x9C    02 00 00 00                     Mapping type = 2 (Scan)
0xA0    00 00 00 00                     Next CMAP offset = 0 (last CMAP)
0xA4    02 00                           Number of pairs = 2
0xA6    41 00 02 00                     0x0041 ('A') -> glyph 2
0xAA    42 00 03 00                     0x0042 ('B') -> glyph 3
0xAE    00 00                           (padding to 4-byte boundary)
```

A next-offset of `0x00000000` signals the end of the CMAP chain.

### How the pieces connect

When the NDS font renderer receives a character code (e.g., `0x0041` for 'A'):

1. **CMAP lookup** -- walk the CMAP linked list. CMAP 1 (Type 0) covers
   `0x0020`--`0x0021`; `0x0041` is out of range, skip. CMAP 2 (Type 2,
   scan) contains the pair `(0x0041, 2)` -- glyph index is **2**.
2. **CGLP fetch** -- read 8 bytes starting at `glyph_data_start + 2 * 8`
   (tile size 8, index 2) to get the 'A' bitmap.
3. **CWDH fetch** -- read the 3-byte width entry at index 2: left spacing 0,
   glyph width 8, advance 8. The renderer draws the bitmap and advances the
   cursor by 8 pixels.

For localization, new glyphs (e.g., Korean syllables) follow the same flow:
append bitmaps to CGLP, add width entries to CWDH, and create a new CMAP
section chained after the last existing one.

### Verifying with a hex editor

After editing an NFTR file, always check:

- **File size** at `0x08` matches the actual byte count.
- **Section count** at `0x0E` reflects the total number of sections.
- **FINF offsets** (`0x20`, `0x24`, `0x28`) each point 8 bytes into the
  correct section.
- **CMAP chain** -- every CMAP's next-offset field either points to the next
  CMAP or is `0x00000000` for the last one.
- **Section sizes** are internally consistent (e.g., CGLP size =
  `0x10 + num_glyphs * tile_size`, padded to 4 bytes).

Note: the hex dump above is a constructed minimal example for illustration.
Real game fonts are much larger (hundreds or thousands of glyphs) and
typically use 2 or 4 bpp for anti-aliased rendering.

## Tools

| Tool | Use |
|------|-----|
| **Custom Python (CLI)** | Recommended for batch operations (adding hundreds of glyphs). Parse the binary format documented above, append glyph data, and regenerate the file. The `struct` module is sufficient. |
| **ndspy (Python)** | Programmatic NitroFS and NARC access (`pip install ndspy`). Use to extract NFTR files from NARC archives and manipulate ROM contents in scripts. |
| **Tinke (GUI alternative)** | Can open NFTR files, view glyphs, edit widths, and export/import glyph bitmaps. Useful for visual inspection. |
| **NFTREdit (GUI alternative)** | Community tool specifically for NFTR editing (if available for your target game's format version). |
| **NitroExplorer2 (GUI alternative)** | Can extract NFTR files from NARC archives for editing. |

## References

- GBATEK -- Nitro Font Resource format (byte-level spec):
  [https://problemkaputt.de/gbatek-ds-cartridge-nitro-font-resource-format.htm](https://problemkaputt.de/gbatek-ds-cartridge-nitro-font-resource-format.htm)
- Tinke source code (NFTR parser):
  [https://github.com/pleonex/tinke](https://github.com/pleonex/tinke)
- NintyFont (open-source NFTR editor, supports GameFreak variant):
  [https://github.com/hadashisora/NintyFont](https://github.com/hadashisora/NintyFont)
- GBATEK -- DS Files (general reference):
  [https://problemkaputt.de/gbatek.htm](https://problemkaputt.de/gbatek.htm)
