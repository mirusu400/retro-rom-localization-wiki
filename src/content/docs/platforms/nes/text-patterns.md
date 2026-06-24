---
title: "NES Text Engine Patterns"
description: "Common NES text engine patterns for localization: encoding schemes, DTE/MTE compression, control codes, pointer tables, and practical workflow for finding and modifying text."
sidebar:
  order: 5
---

NES games do not have a standard text system. Every game implements its own text engine
with its own encoding, control codes, and storage format. However, decades of ROM
hacking have identified recurring patterns. This page catalogs them and provides a
practical workflow for reverse-engineering and modifying NES text.

## Text encoding schemes

### Direct tile-index encoding

The simplest approach: each byte in the text data stream is a **tile index** directly
written to the nametable. The "encoding" is just the tile layout in the pattern table.

```
Example:
  Pattern table has:  tile $00 = "A", tile $01 = "B", ... tile $19 = "Z"
  Text data:          $07 $04 $0B $0B $0E
  Rendered:           "H"  "E"  "L"  "L"  "O"
```

This is common in games with small text needs (action games, sports titles). The
mapping often starts at `$00` for the first letter and is sequential.

### Custom encoding table

Most text-heavy games use a custom mapping that differs from ASCII. Common patterns:

| Pattern | Example mapping | Notes |
|---|---|---|
| Sequential from `$00` | A=`$00`, B=`$01`, ... Z=`$19` | Simple, zero-based |
| Sequential from non-zero | A=`$0A`, B=`$0B`, ... Z=`$23` | Offset from some base |
| Japanese-first | Hiragana `$00`--`$4F`, katakana `$50`--`$9F`, Latin/numbers after | Common in JP games |
| Mixed | Letters, numbers, and punctuation interspersed with game-specific symbols | Requires careful mapping |

The `.tbl` file (table file) format maps byte values to characters:

```
00=A
01=B
02=C
...
19=Z
1A=
1B=.
1C=,
FE=\n
FF=<END>
```

### Discovering the encoding

**Relative search** is the standard technique:

1. Find a known text string displayed on screen (e.g., a character name like "HERO").
2. Compute the **relative differences** between consecutive characters:
   - H->E = -3, E->L = +7, L->O = +3 (using alphabet positions)
3. Search the ROM for any sequence of bytes with those same differences.
4. The found bytes reveal the encoding: if "HERO" is at bytes `$11 $0E $15 $18`,
   then H=`$11`, E=`$0E`, R=`$15`, O=`$18`.

Tools that support relative search:
- **Mesen2** memory search (manual calculation needed)
- **SearchR** or similar ROM hacking utilities
- Custom Python script (straightforward to write)

```python
# Simple relative search
def relative_search(rom_data, text, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ"):
    diffs = [alphabet.index(text[i+1]) - alphabet.index(text[i])
             for i in range(len(text)-1)]
    results = []
    for offset in range(len(rom_data) - len(text)):
        match = True
        for i, d in enumerate(diffs):
            if (rom_data[offset+i+1] - rom_data[offset+i]) & 0xFF != d & 0xFF:
                match = False
                break
        if match:
            results.append(offset)
    return results
```

## DTE (Dual-Tile Encoding)

DTE is a simple compression scheme: one byte in the text stream expands to **two**
tile indices. This effectively doubles the text capacity of a given ROM area.

```
DTE table example (stored in ROM):
  Entry $80 -> "th"  (tile $17, tile $07)
  Entry $81 -> "he"  (tile $07, tile $04)
  Entry $82 -> "in"  (tile $08, tile $0D)
  Entry $83 -> "er"  (tile $04, tile $11)
  ...

Text data: $80 $04   ->  "the"
           $80 $81   ->  "thhe"  (unlikely, just illustrating)
```

Typically, byte values `$00`--`$7F` are direct tile indices, and `$80`--`$FD` (or
similar) are DTE entries. The DTE table is a simple array of byte pairs stored
somewhere in ROM.

**For localization:**
- You can **reclaim DTE entries** that are no longer useful in the target language
  (e.g., Japanese-specific digraphs) and reassign them to common target-language
  bigrams.
- Building an optimal DTE table for the translated text can significantly reduce
  the space needed for the script.
- DTE entries can also be repurposed as extra character slots if you need more
  unique glyphs than the pattern table allows.

### Finding the DTE table

1. In the debugger, set a breakpoint on the text engine's "get next character" routine.
2. When a DTE byte is encountered, the engine will branch to a lookup routine that
   reads two bytes from the DTE table.
3. Follow the table address to find the full DTE table in ROM.

## MTE (Multi-Tile Encoding)

MTE extends DTE to **multiple characters** per byte --- a whole word or common phrase:

```
MTE table example:
  Entry $F0 -> "the "   (4 bytes: $17 $07 $04 $1D)
  Entry $F1 -> "HERO"   (4 bytes: $11 $0E $15 $18)
  Entry $F2 -> "you "   (4 bytes: $1E $14 $1A $1D)
```

MTE entries are variable-length, usually terminated by a special marker or stored
with a length prefix. They are most common in very text-heavy games that need to
fit large scripts into limited ROM space.

**For localization:** MTE tables must be completely rebuilt for the target language,
since the common words and phrases will be entirely different.

## Control codes

NES text engines use byte values outside the normal character range as **control codes**.
There is no standard --- every game defines its own. Common patterns:

| Code | Typical byte(s) | Function |
|---|---|---|
| End of string | `$FF` or `$00` | Terminates the text string |
| Line break | `$FE` or `$01` | Advance to next line in text box |
| New page | `$FD` | Clear text box and continue |
| Wait for input | `$FC` | Pause until player presses a button |
| Name substitution | `$F0`--`$F7` | Insert player/character name |
| Item name | `$F8`--`$FB` | Insert item name from a table |
| Speed change | `$FD` + param | Change text display speed |
| Color change | Various | Switch palette (limited by attribute table) |
| Pause | `$XX` + duration | Wait N frames |

### Identifying control codes

1. Open a text-heavy scene in the emulator.
2. Find the text data in ROM (via relative search or debugger).
3. Compare the raw bytes with what appears on screen:
   - Bytes that produce visible characters are the encoding.
   - Bytes at line breaks, pauses, or string ends are control codes.
4. Trace the text engine in the debugger to confirm each code's behavior.

### Example: typical text engine flow

```
Text engine pseudocode (common NES pattern):

read_next_byte:
    LDA (text_ptr), Y       ; read byte from text pointer
    INY                      ; advance to next byte
    CMP #$FF                 ; end of string?
    BEQ done
    CMP #$FE                 ; line break?
    BEQ do_linebreak
    CMP #$FD                 ; wait for input?
    BEQ do_wait
    CMP #$80                 ; DTE range?
    BCS do_dte               ; >= $80, look up DTE table
    ; otherwise, direct tile index
    STA nametable_buffer     ; queue tile for V-blank write
    JMP read_next_byte

do_dte:
    ; use byte as index into DTE table
    ASL A                    ; multiply by 2 (2 bytes per entry)
    TAX
    LDA dte_table, X         ; first tile
    STA nametable_buffer
    LDA dte_table+1, X       ; second tile
    STA nametable_buffer
    JMP read_next_byte
```

## Pointer tables

NES text is almost always referenced through **pointer tables** --- arrays of 16-bit
little-endian addresses pointing to each text string.

### Format

```
Pointer table (at ROM address $B000 in bank 3):
  $B000: $20 $B1    -> string 0 at $B120
  $B002: $4A $B1    -> string 1 at $B14A
  $B004: $8C $B1    -> string 2 at $B18C
  ...

Each pointer is 2 bytes, little-endian:
  Low byte first, high byte second
  $20 $B1 = address $B120
```

### Bank-relative pointers

On banked mappers, pointers are relative to the **bank's CPU address window**, not
the ROM file offset. If text is in a 16 KB bank mapped at `$8000`--`$BFFF`:

```
Pointer $B120 means:
  CPU address $B120 in the current bank
  ROM file offset = header_size + (bank_number * $4000) + ($B120 - $8000)
                   = $10 + (bank * $4000) + $3120
```

### Common pointer table patterns

| Pattern | Description |
|---|---|
| **Flat table** | All pointers in a single contiguous array, one per string |
| **Indexed table** | String ID used as index: `pointer = table_base + (id * 2)` |
| **Bank + pointer** | 3-byte entries: 1 byte bank number + 2 byte pointer |
| **Offset table** | Table of offsets relative to the table's own address |
| **Grouped tables** | Separate pointer tables for different text categories (dialog, menus, items) |

### Finding pointer tables

1. Locate a text string in ROM.
2. Compute what its pointer would be (CPU address, little-endian).
3. Search the ROM for those two bytes in sequence.
4. If you find them, check whether the surrounding bytes look like other valid
   pointers (addresses in the same range).
5. Verify by modifying one pointer and confirming the game reads different text.

### Pointer recalculation after translation

If translated strings are longer than originals, pointers must be updated:

```
Original:                      Translated:
  String 0 at $B120 (10 bytes)   String 0 at $B120 (14 bytes)  (+4)
  String 1 at $B12A (8 bytes)    String 1 at $B12E (12 bytes)  (+4, +4 = +8 shift)
  String 2 at $B132 (15 bytes)   String 2 at $B13A (15 bytes)  (+8 shift)

Pointer table must be updated:
  Original:  $20 $B1 / $2A $B1 / $32 $B1
  Patched:   $20 $B1 / $2E $B1 / $3A $B1
```

**Atlas** (the text insertion tool) can recalculate pointers automatically if configured
with the pointer table location and format.

## NES-specific challenges

### Limited tile slots

Each pattern table holds only **256 tiles**. A game typically uses one table for
background (including text) and one for sprites. After terrain, UI borders, icons,
and other graphics, there may be only 50--100 tiles left for text characters.

**Strategies for limited tile slots:**

| Strategy | Description |
|---|---|
| **Subset selection** | Use only the characters actually needed in the script (e.g., ~200 most common Hangul syllables) |
| **Tile swapping** | Load different tiles into CHR-RAM for each text box (requires CHR-RAM) |
| **DTE as extra slots** | Repurpose DTE entries to encode characters that don't fit in the pattern table |
| **8x16 tiles** | Use two vertically adjacent tiles for taller characters (doubles tile cost) |
| **Mapper CHR banking** | Switch CHR banks to access different font pages (CHR-ROM with banking) |

### No hardware VWF (variable-width font)

The NES has no built-in support for variable-width characters. Each tile is exactly
8 pixels wide. Implementing VWF requires:

1. **Software rendering:** The text engine pre-renders each character into a pixel
   buffer, handling sub-tile positioning.
2. **Dynamic tile generation:** The rendered pixels are packed into tiles and uploaded
   to CHR-RAM during V-blank.
3. **CPU cost:** This is expensive on the 1.79 MHz 6502. Each character requires
   bit-shifting and merging operations.
4. **V-blank budget:** Uploading dynamically generated tiles competes with other
   V-blank tasks (scrolling, sprite DMA, palette updates).

VWF on NES is possible but rare in commercial games. Some fan translations implement
it (e.g., translations of text-heavy RPGs that need proportional spacing for
readability). If your target script requires VWF (e.g., for Hangul readability at
8-pixel cell height), expect significant ASM work.

### Text rendering is CPU-driven

Unlike later systems with DMA or hardware text layers, all NES text rendering is
done by the CPU writing bytes to PPU registers. This means:

- The text engine is **6502 assembly code** that you must understand and potentially
  modify.
- Every text-engine modification requires ASM patching.
- Debugging is done at the instruction level using FCEUX or Mesen2 debuggers.

## Practical workflow

### Step 1: Identify the game's configuration

```
1. Read the iNES header:
   - Byte 4: PRG-ROM size
   - Byte 5: CHR type (0 = RAM, else ROM)
   - Bytes 6-7: mapper number
2. Note the mapper and plan for banking.
```

### Step 2: Find the font

```
1. Dump tiles with superfamiconv or xxd (CLI, 2bpp NES mode),
   or open ROM in a GUI tile editor (YY-CHR) if preferred.
2. For CHR-ROM: scroll to the CHR section (after PRG-ROM in the file).
3. For CHR-RAM: search through PRG-ROM for tile-like data.
4. Alternative: use Mesen2/FCEUX PPU viewer during gameplay.
```

### Step 3: Discover the encoding

```
1. Display text in the emulator; note a known word.
2. Perform a relative search in the ROM.
3. Build a .tbl file from the discovered mapping.
4. Verify by checking multiple strings.
```

### Step 4: Find the text engine and control codes

```
1. In the debugger, set a read breakpoint on the text data address.
2. The CPU will break in the text engine routine.
3. Trace the routine to identify:
   - How it reads bytes (direct pointer, indexed, etc.)
   - Where control code branching happens
   - The DTE/MTE lookup (if any)
   - Where tile indices are written to the nametable buffer
4. Document all control codes and their byte values.
```

### Step 5: Locate pointer tables

```
1. Take the CPU address of a known text string.
2. Convert to little-endian bytes.
3. Search the ROM for those bytes.
4. Verify the surrounding bytes are also valid pointers.
5. Map out the full pointer table (start address, entry count).
```

### Step 6: Extract, translate, reinsert

```
1. Extract text using Cartographer (with your .tbl file) or a custom script.
2. Translate the extracted text.
3. If strings changed length:
   a. Check if there's free space after the text block.
   b. If not, consider ROM expansion or DTE optimization.
4. Reinsert using Atlas (with pointer recalculation) or a custom script.
5. Update the .tbl file if you added new characters.
```

### Step 7: Modify the font (if needed)

```
For CHR-ROM:
  1. Edit tiles directly in the ROM file using a tile editor.
  2. Replace unused tiles with target-script characters.

For CHR-RAM:
  1. Find where the game loads font tiles into CHR-RAM.
  2. Replace the source tile data in PRG-ROM with your new font.
  3. If you need more tiles than the original font, modify the loading
     routine to copy more data (may require ASM patching).
```

### Step 8: Test

```
1. Load the patched ROM in Mesen2 or FCEUX.
2. Check all text screens for:
   - Correct character display
   - Proper line breaks and text box formatting
   - Control codes working (pauses, name substitution, etc.)
   - No graphical corruption (tile conflicts)
3. Test with PPU viewer open to verify font tiles are correct.
4. Test on multiple emulators and, if possible, real hardware.
```

## Compressed text and font data

Unlike the GBA (which has BIOS SWI routines for LZ77, Huffman, and RLE), NES
games have **no standard decompression API**. Every compression scheme is
custom, implemented in game-specific 6502 assembly. This makes identification
and reversal harder, but the limited NES hardware constrains what schemes are
practical.

### Why compression is used

- **CHR-RAM games** must copy tile data from PRG-ROM into CHR-RAM at runtime.
  Compressing those tiles frees PRG-ROM space for more graphics or text.
- **Nametable data** (screen layouts) is frequently RLE-compressed because
  backgrounds contain long horizontal runs of repeated tiles (e.g., blank sky,
  floor, UI borders).
- **Text-heavy games** sometimes compress the script itself using DTE/MTE
  (covered above) or, less commonly, byte-level schemes like RLE or simple
  LZ variants.
- CHR-ROM games **cannot** use compressed tile data --- the PPU reads CHR-ROM
  directly, so tiles must be stored in the native 2bpp format.

### Common NES compression schemes

| Scheme | Mechanism | Typical use | NES feasibility |
|---|---|---|---|
| **RLE** | Encode runs of identical bytes as (count, byte) | Nametable data, simple tile sets | Excellent --- trivial to decode, minimal RAM |
| **PackBits / Konami RLE** | Flag-byte RLE: flag + run or flag + literal block | Tile data, nametable data | Good --- slightly more flexible than raw RLE |
| **PB8 / PB53** | Bit-mask per 8- or 16-byte block selects repeat vs. literal | Tile data (CHR-RAM uploads) | Good --- operates on fixed-size blocks, easy to stream during V-blank |
| **Simple LZSS** | Bit flags select literal bytes vs. back-references into a sliding window | Larger data blocks (title screens, cutscene graphics) | Marginal --- the NES has only 2 KB work RAM, severely limiting the sliding window |
| **DTE / MTE** | Dictionary substitution (1 byte -> 2+ characters) | Text script | Excellent --- the dominant NES text compression |

Full LZ77 (with a large sliding window) is **rare** on the NES because the 2 KB
internal RAM cannot hold a useful history buffer without competing with the
stack, zero-page variables, and other runtime state. Games that do use LZ-family
compression typically limit the window to 256 bytes or less.

### Identifying compressed data in a ROM

**Entropy analysis.** Uncompressed text has recognizable byte patterns (runs of
values in the character-table range, terminated by `$FF`/`$00`). Compressed
regions look like high-entropy noise --- no obvious repeating structure when
viewed in a hex editor.

**Tile inspection.** Dump tiles with `superfamiconv` or `xxd` (CLI) and look
for recognizable 2bpp glyph patterns, or open the ROM in a GUI tile viewer
(YY-CHR, Tile Molester) in 2bpp NES mode. Uncompressed font tiles will be
visually recognizable. Compressed tile data appears as garbage.

**Decompressor tracing.** The most reliable method:

1. Identify *where* the game copies tile data to CHR-RAM (or where it writes
   decompressed nametable data). Set a **write breakpoint** on PPU register
   `$2007` (PPUDATA) or on the CHR-RAM destination range.
2. When the breakpoint hits, you are inside the decompression routine (or the
   V-blank tile-upload loop). Trace backwards to find where it reads the
   *source* data from PRG-ROM.
3. Examine the decompressor logic:
   - **RLE:** Look for a loop that reads a count byte, then a value byte, and
     writes the value *count* times.
   - **Flag-byte RLE (PackBits):** A flag byte is read first; its bits or
     value determines whether the next chunk is a literal run or a repeated
     run.
   - **LZSS:** A bit-mask byte is read; each bit selects whether the next
     datum is a literal byte or a (distance, length) back-reference pair.
   - **PB8/PB53:** A control byte is read, then 8 data bytes; each control
     bit says whether to use the corresponding data byte or repeat a
     previous value.
4. Once you understand the format, write a matching compressor so you can
   reinsert modified data (new font tiles, expanded nametable layouts).

### Compressed fonts in CHR-RAM games

Many CHR-RAM games store font tiles in a compressed block and decompress them
into pattern-table RAM during initialization or scene transitions. To modify
the font:

1. **Trace the decompressor** (as above) to locate the compressed font data
   in PRG-ROM and understand the format.
2. **Decompress** the original font data using a custom tool or script.
3. **Edit** the decompressed tiles (add target-script glyphs, adjust width).
4. **Recompress** using a compressor that produces output compatible with the
   game's decompressor. If the recompressed data is larger than the original,
   you may need to relocate it to free space or an expanded bank.
5. **Update the pointer** (source address) that the decompression routine reads
   from, if you moved the data.

If writing a matching compressor is impractical, an alternative is to
**patch out the decompression** entirely: replace the decompressor call with a
simple block copy (LDA/STA loop) and store the font tiles uncompressed in ROM.
This trades ROM space for simplicity and is viable when ROM expansion is
already planned.

### Compressed nametable / screen data

Title screens, menu layouts, and dialog-box borders are often stored as
compressed nametable data. If you need to edit these (e.g., to resize a text
box or change a title screen), the same trace-and-recompress workflow applies.
RLE is by far the most common format for nametable data because horizontal
tile runs compress extremely well.

## Recommended tools for NES text work

| Tool | Purpose |
|---|---|
| **Mesen2** | Debugger + PPU viewer + Lua scripting; best all-in-one for NES RE (CLI/GUI) |
| **FCEUX** | Debugger + PPU viewer + Lua; strong NES-specific tooling (CLI/GUI) |
| **superfamiconv** | Tile/palette/map conversion (CLI) |
| **xxd** | Hex inspection and raw tile-byte analysis (CLI) |
| **Cartographer** | `.tbl`-based text dumper (CLI) |
| **Atlas** | `.tbl`-based text inserter with pointer recalculation (CLI) |
| **ca65 / ld65** (cc65) | 6502 assembler/linker for ASM patches (CLI) |
| **Flips** | Create IPS/BPS patch files from modified ROMs (CLI) |
| **YY-CHR** | Tile editor --- view/edit fonts in 2bpp NES format (GUI) |
| **Tile Molester** | Alternative tile editor, Java, cross-platform (GUI) |

See [Tools](/retro-rom-localization-wiki/tools/) for installation details.

## References

- [NESdev Wiki](https://www.nesdev.org/wiki/Nesdev_Wiki)
- [PPU pattern tables](https://www.nesdev.org/wiki/PPU_pattern_tables)
- [PPU nametables](https://www.nesdev.org/wiki/PPU_nametables)
- [CPU](https://www.nesdev.org/wiki/CPU)
- [Tile compression](https://www.nesdev.org/wiki/Tile_compression) --- NESdev Wiki
- [Mapper list](https://www.nesdev.org/wiki/Mapper)
