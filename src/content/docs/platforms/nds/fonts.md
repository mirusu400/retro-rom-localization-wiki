---
title: "NDS Fonts (NFTR)"
description: "NFTR (NitroFont Resource) format: header, FINF font info, PLGC/CGLP glyph bitmaps, HDWC/CWDH character widths, and PAMC/CMAP character mapping -- how to add glyphs for new scripts."
sidebar:
  order: 4
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

## Tools

| Tool | Use |
|------|-----|
| **Tinke** | GUI tool that can open NFTR files, view glyphs, edit widths, and export/import glyph bitmaps. Most accessible option. |
| **NFTREdit** | Community tool specifically for NFTR editing (if available for your target game's format version). |
| **Custom Python** | For batch operations (adding hundreds of glyphs), scripted NFTR editing is often more practical. Parse the binary format, append glyph data, and regenerate the file. |
| **NitroExplorer2** | Can extract NFTR files from NARC archives for editing. |

## References

- Tinke source code (NFTR parser):
  [https://github.com/pleonex/tinke](https://github.com/pleonex/tinke)
- GBATEK -- DS Files:
  [https://problemkaputt.de/gbatek.htm](https://problemkaputt.de/gbatek.htm)
  (NitroFont is part of the NitroSDK file format family)
