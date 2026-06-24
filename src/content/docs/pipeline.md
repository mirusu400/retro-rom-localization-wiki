---
title: Localization Pipeline
description: End-to-end workflow for localizing a retro game ROM — from initial analysis through patch distribution.
---

A retro-game localization (fan-translation) project follows a predictable sequence of phases.
Skipping or reordering them is the most common cause of wasted work. This page lays out the
full pipeline and links to the detailed pages for each discipline.

## Guiding principles

Before diving into the steps, two rules save more time than any tool:

### Roundtrip first

For every data format you touch — text, graphics, compressed blocks — prove that you can
**extract the original data and reinsert it to produce a byte-identical ROM** before you change
anything. If the roundtrip is not clean, your insertion logic has a bug that will corrupt the
translation later.

### PoC gate

Do **not** begin expensive, hard-to-revert work (bulk translation, full pointer rebuild, ROM
expansion) until you have rendered **one glyph of the target script on the actual screen**
(real hardware or accurate emulator). This single milestone proves the font pipeline, encoding,
and text engine all work together. Everything before this point is cheap to redo; everything
after it is not.

## Phase 1 — ROM analysis and identification

1. **Identify the ROM format.** Check the header to confirm system, mapper/banking scheme, and
   region. Each platform has a well-defined header layout — see the relevant
   [platform page](/retro-rom-localization-wiki/platforms/nes/) for offsets.
2. **Compute and record checksums.** CRC32 and SHA-1 of the unmodified ROM. This is your
   "known-good" baseline; every tool and patch description should reference it.
3. **Inspect tiles** using a tile dump script, `superfamiconv`, or `rgbgfx` (CLI), or a GUI tile
   editor like YY-CHR / Tile Molester if preferred. Scan for the font tiles — they are usually
   visually obvious as rows of Latin glyphs. Note the offset and bit-depth (1bpp, 2bpp, 4bpp).
4. **Inspect hex data** with `xxd` or a Python hex-inspection script (CLI), or a GUI hex editor
   like ImHex / HxD if preferred. Search for known strings (game title, menu items) using both
   ASCII and the game's custom encoding. If ASCII fails, you will need a relative search
   (see Phase 2).

**Output of this phase:** ROM identity (system, mapper, checksum), font tile offset and format,
and a rough idea of where text lives.

## Phase 2 — Text-engine reverse engineering

This is typically the longest phase for an unfamiliar game.

1. **Relative search** to recover the character mapping when the game uses a non-ASCII encoding.
   The idea: search for a known word by its *byte-difference pattern* rather than absolute
   values. Tools like `findrel` or a custom Python script can do this. Full details in
   [Text Engine RE](/retro-rom-localization-wiki/text-engine/).
2. **Build a `.tbl` file** mapping each byte value to a character. Include control codes
   (line-break, end-of-string, text-box advance, name substitution, etc.).
3. **Identify DTE/MTE** — many games use dual-tile or multi-tile encoding where one byte value
   expands to a common pair or substring. These slots can later be reclaimed for extra glyphs.
   See [Text Engine RE — DTE/MTE](/retro-rom-localization-wiki/text-engine/#dtemte-compression).
4. **Locate the text-render routine** in a debugger. Set a write breakpoint on the tile map /
   OAM region that displays text, then trigger a text box. The call stack leads you to the
   routine that reads encoded bytes and writes tiles — the hook point for a
   [variable-width font (VWF)](/retro-rom-localization-wiki/encoding-and-fonts/#variable-width-fonts-vwf).

**Output:** a complete `.tbl`, control-code table, and the address of the text-render loop.

## Phase 3 — Font extraction and replacement

1. **Dump the original font tiles** to PNG (rgbgfx, superfamiconv, or a tile editor export).
   Verify a roundtrip: re-encode the PNG and confirm the ROM is byte-identical.
2. **Design the target-script font.** Pixel dimensions depend on the platform's tile format and
   the script's requirements. Latin fits easily in 8x8; CJK and Hangul typically need 12x12 or
   16x16, which may require a VWF or multi-tile composition. See
   [Encoding & Fonts](/retro-rom-localization-wiki/encoding-and-fonts/) for the general problem
   and [Languages](/retro-rom-localization-wiki/languages/korean/) for script-specific guidance.
3. **Insert the new font** and confirm at least one glyph renders correctly — this is the
   **PoC gate**.

## Phase 4 — Text extraction

1. Use [Cartographer](/retro-rom-localization-wiki/tools/#text-extract--insert) or a custom
   script with your `.tbl` to dump all game text into editable files (one string per line, with
   pointer metadata).
2. Roundtrip: reinsert the *original* text and confirm a byte-identical ROM.

## Phase 5 — Translation

This phase is largely outside the scope of ROM hacking, but a few technical constraints apply:

- **Line length limits.** Fixed-width fonts impose a hard character-per-line limit; VWF fonts
  impose a pixel-width limit. The translator must know both.
- **Control codes.** The translated script must preserve control codes (line breaks, pauses,
  name tokens) or the text engine will crash.
- **String length.** If the translated text is longer than the original, you will need pointer
  updates or relocation (Phase 6). Plan for this — most translations expand.

## Phase 6 — Text reinsertion with pointer updates

1. **Insert translated text** using [Atlas](/retro-rom-localization-wiki/tools/#text-extract--insert)
   or a custom inserter. The tool writes text at specified ROM offsets and updates pointers
   automatically.
2. **Handle length changes.** Three strategies, from cheapest to most invasive:
   - **In-place padding:** if the translation is shorter, pad with spaces or end-of-string.
   - **Pointer recomputation:** if the tool (Atlas) can recompute pointers, strings can shift
     within their original bank.
   - **Relocation to expanded ROM:** move text to free space (or expand the ROM) and rewrite
     pointers to the new addresses. See [Pointers](/retro-rom-localization-wiki/pointers/).
3. **Test every string** in-game. Edge cases: maximum-length lines, strings near bank
   boundaries, strings referenced by multiple pointers.

## Phase 7 — Compression handling

Some games compress text, graphics, or both. If the data you need to modify is compressed:

1. **Identify the algorithm** — GBA and NDS commonly use BIOS-standard LZ77, Huffman, or RLE
   with recognizable header bytes (`0x10`, `0x20`, `0x30`). Older systems use custom schemes.
2. **Decompress, edit, recompress.** Use [gbalzss or DSDecmp](/retro-rom-localization-wiki/tools/#compression)
   for standard algorithms. Custom compression may require writing your own codec.
3. **Beware pointer breakage.** Recompressed data is rarely the same size as the original.
   Every pointer or offset referencing data *after* the compressed block must be updated.

Full details in [Compression](/retro-rom-localization-wiki/compression/).

## Phase 8 — Patch creation and distribution

1. **Create a patch file** — never distribute a modified ROM. Use
   [Flips](/retro-rom-localization-wiki/tools/#patch-create--apply) to produce an IPS or BPS
   patch by diffing the original and modified ROMs:
   ```bash
   flips --create original.rom patched.rom patch.bps
   ```
   BPS is preferred over IPS because it includes checksums for both source and target.
2. **Document the expected source ROM** by CRC32 or SHA-1 so users apply the patch to the
   correct dump.
3. **Test the patch** by applying it to a clean ROM and playing through critical scenes.

## Quick-reference checklist

| # | Phase | Key deliverable | Gate |
|---|-------|----------------|------|
| 1 | ROM analysis | System ID, font offset, checksum | — |
| 2 | Text-engine RE | `.tbl` + control codes + render routine addr | — |
| 3 | Font replacement | Target-script font inserted | **PoC gate: one glyph on screen** |
| 4 | Text extraction | Full script dump, roundtrip verified | Roundtrip clean |
| 5 | Translation | Translated script with correct control codes | — |
| 6 | Reinsertion | Patched ROM with updated pointers | All strings display correctly |
| 7 | Compression | Recompressed blocks, offsets fixed | Roundtrip clean |
| 8 | Patch distribution | BPS/IPS patch + source ROM checksum | Patch applies and plays |

## Further reading

- [Text Engine RE](/retro-rom-localization-wiki/text-engine/) — Phase 2 deep-dive
- [Encoding & Fonts](/retro-rom-localization-wiki/encoding-and-fonts/) — Phase 3 deep-dive
- [Pointers](/retro-rom-localization-wiki/pointers/) — Phase 6 deep-dive
- [Compression](/retro-rom-localization-wiki/compression/) — Phase 7 deep-dive
- [Tools](/retro-rom-localization-wiki/tools/) — software for every phase
