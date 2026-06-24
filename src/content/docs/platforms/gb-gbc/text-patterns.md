---
title: "GB/GBC Text Engine Patterns"
description: "Common Game Boy / Game Boy Color text engine patterns for localization: tile-index encoding, DTE/MTE, pointer formats, control codes, VWF rendering, and practical reverse-engineering workflow."
sidebar:
  order: 5
---

Game Boy text engines vary enormously between games, but most follow recognizable
patterns. This page covers the common patterns you will encounter when localizing
GB/GBC games, along with practical techniques for reverse-engineering them.

For general (platform-independent) text engine concepts, see the
[text engine](/retro-rom-localization-wiki/text-engine) and
[encoding and fonts](/retro-rom-localization-wiki/encoding-and-fonts) pages.

## Text Encoding Patterns

### Pattern 1: Direct Tile-Index Encoding

The simplest and most common pattern on GB. Each text byte is a direct tile index
in VRAM -- the text engine reads a byte and writes it to the tile map.

```
Text byte 0x41 -> tile index 0x41 -> tile at VRAM 0x8000 + (0x41 * 16)
```

If the font tiles are loaded at VRAM starting from tile 0, and "A" is tile `0x41`,
then the text byte for "A" is `0x41`. This coincides with ASCII for many English
games, but Japanese games typically use custom orderings.

**How to identify:** Use a tile viewer to find the tile index for a known character,
then search the ROM for sequences of those indices. If "HELLO" appears on screen
using tiles `0x48 0x45 0x4C 0x4C 0x4F`, search the ROM for those bytes.

### Pattern 2: Table-Based Encoding (Offset Mapping)

The text byte is not a direct tile index; the engine adds an offset or uses a
lookup table to convert text codes to tile indices.

```
text_byte + offset = tile_index
```

Example: If font tiles start at tile 128 in VRAM, and the game stores "A" as `0x00`,
then the engine computes `0x00 + 0x80 = 0x80` to get the tile index.

**How to identify:** If relative search finds text but the byte values do not match
tile indices seen in the tile viewer, there is an offset or table involved.

### Pattern 3: Multi-Byte Encoding (Japanese Games)

Japanese GB games often use 2-byte encoding for kanji and kana. A typical scheme:

- Bytes `0x00`-`0x7F`: Single-byte characters (punctuation, numbers, basic kana)
- Bytes `0x80`-`0xFF` followed by a second byte: 2-byte character code

The 2-byte code maps to a tile (or pair of tiles for 16x16 kanji rendered as
four 8x8 tiles). This is not standard Shift-JIS -- it is a game-specific table.

### Pattern 4: DTE (Dual Tile Encoding) / MTE (Multiple Tile Encoding)

ROM space on GB cartridges is precious. DTE/MTE compresses text by mapping one byte
to two or more characters:

- **DTE:** One byte -> two characters (e.g., `0xF0` = "th", `0xF1` = "he", `0xF2` = "in")
- **MTE:** One byte -> a whole word or phrase (e.g., `0xE0` = "the ", `0xE1` = "you")

The game stores a DTE/MTE table in ROM that maps each code to its expansion.

**How to identify:** If you find text but some bytes produce character pairs or
whole words, the game uses DTE/MTE. Look for a table of 2-byte or variable-length
strings near the text data or the text engine code.

**Localization impact:** You can repurpose DTE/MTE codes for the target language's
common digrams/words. For example, a Korean translation might use MTE for common
particles (은/는, 이/가, 을/를) to save space.

## Control Codes

Every GB text engine has control codes -- special byte values that trigger actions
instead of displaying a character. There is no standard; each game defines its own.

### Common control code functions

| Function | Description |
|----------|-------------|
| End of string | Terminates the current text string |
| Line break | Advance to the next line in the text box |
| New page / scroll | Clear the text box or scroll up and continue |
| Wait for input | Pause until the player presses a button |
| Text speed | Change the character-by-character display speed |
| Name substitution | Insert the player's name or an NPC name |
| Item/number | Insert an item name or a number from a variable |
| Sound effect | Play a sound effect inline with text |
| Font change | Switch to a different tile set (e.g., bold, italic) |

### Pokemon Red/Blue text engine (case study)

The Pokemon Gen 1 text engine is one of the best-documented GB text engines
(thanks to the [pret/pokered](https://github.com/pret/pokered) disassembly):

| Byte | Meaning |
|------|---------|
| `0x00` | (padding/unused) |
| `0x49` | Page break (clear box, wait for input) |
| `0x4E` | Line break (next line) |
| `0x4F` | Line break (next line, variant) |
| `0x50` | String terminator |
| `0x51` | Paragraph break (scroll text up) |
| `0x52` | Player name substitution |
| `0x53` | Rival name substitution |
| `0x54` | "POKe" (POKE with accent) |
| `0x55` | Ellipsis "..." continuation |
| `0x57` | End of text (return to game) |
| `0x58` | Prompt and close text box |
| `0x59`-`0x5F` | Various name/text substitutions |
| `0x80`-`0xBF` | Character table (A-Z, a-z, numbers, punctuation) |

Note that `0x50` is the string terminator, **not** `0x00` as in C strings. This is
a common source of confusion. Many GB games use non-zero terminators.

### Finding control codes

1. Locate a known text string in ROM using relative search
2. Look at the bytes immediately before and after the string
3. The byte after the last visible character is likely the terminator
4. Bytes between visible text lines are likely line break codes
5. Use a debugger to trace the text engine and watch it process each byte

## Pointer Formats

### 16-bit bank-relative pointers (most common)

The most common pointer format on GB. Each pointer is a 2-byte little-endian value
in the range `0x4000`-`0x7FFF`, pointing to a location within the currently switched
ROM bank.

```
Pointer table (somewhere in the ROM):
  0x1234: C0 4A    -> pointer to 0x4AC0 in the current bank
  0x1236: 10 52    -> pointer to 0x5210 in the current bank
  0x1238: FF 7F    -> pointer to 0x7FFF (end of bank)
```

To find the actual ROM offset:
```
rom_offset = (bank * 0x4000) + (pointer - 0x4000)
```

### Bank:pointer pairs (3-byte)

Some games store the bank number alongside the pointer for cross-bank references:

```
Format: [bank] [pointer_low] [pointer_high]    (3 bytes, little-endian pointer)

Example: 06 C0 4A -> bank 6, address 0x4AC0
ROM offset = (6 * 0x4000) + (0x4AC0 - 0x4000) = 0x18000 + 0x0AC0 = 0x18AC0
```

Variant: some games reverse the order as `[pointer_low] [pointer_high] [bank]`.

### Pointers in Bank 0

Pointers in ROM bank 0 (`0x0000`-`0x3FFF`) reference the fixed bank directly:
```
rom_offset = pointer_value
```

Bank 0 pointers are in the range `0x0000`-`0x3FFF`. Many games store their main
pointer tables in bank 0 since it is always accessible.

### Finding pointer tables

1. Find a text string in ROM at a known offset
2. Compute what its bank-relative address would be
3. Search the ROM for that address as a little-endian 16-bit value
4. If found, check if it is part of a table (sequential pointers at regular intervals)
5. Verify by checking if adjacent table entries point to other text strings

Example:
```
Text "Hello" found at ROM offset 0x18AC0
Bank = 0x18AC0 / 0x4000 = 6
Address = (0x18AC0 % 0x4000) + 0x4000 = 0x4AC0

Search ROM for bytes: C0 4A (little-endian 0x4AC0)
Found at offset 0x1234 -- this might be in the pointer table
Check offset 0x1236 for another pointer -- if it points to another string, confirmed
```

## Variable-Width Font (VWF) on Game Boy

Standard GB text uses fixed-width characters (each character = one 8x8 tile = 8 pixels
wide). A VWF renders characters at different pixel widths, producing much more natural
and readable text -- especially important for scripts like Hangul, Chinese, or even
Latin text with proportional spacing.

### How VWF works on GB

The PPU only understands 8x8 tiles. A VWF engine works around this:

1. Maintain a pixel buffer in WRAM (or directly compose into tiles)
2. For each character, render its glyph pixels into the buffer at the current X position
3. The glyph width (in pixels, not tiles) determines how far to advance X
4. When a tile boundary is crossed, the previous tile is complete and can be written
   to VRAM
5. Transfer completed tiles to VRAM during VBlank (the PPU cannot be written to during
   active display on DMG)

### VWF implementation sketch (pseudocode)

```
vwf_state:
  current_tile_buffer[16]    ; 16 bytes = one 2bpp tile being composed
  pixel_x = 0               ; current X position within the tile (0-7)

render_char(char_code):
  glyph = font_data[char_code]
  width = glyph_widths[char_code]  ; e.g., "W" = 7px, "i" = 3px, "l" = 2px

  for each row (0-7):
    glyph_row = glyph.row[row]    ; 1 byte, up to 8 pixels
    shift glyph_row right by pixel_x
    OR into current_tile_buffer low byte for this row
    OR into current_tile_buffer high byte for this row

    if pixel_x + width > 8:
      ; overflow into next tile
      shift glyph_row left by (8 - pixel_x)
      OR into next_tile_buffer for this row

  pixel_x += width
  if pixel_x >= 8:
    ; current tile is complete, write to VRAM during VBlank
    write current_tile_buffer to VRAM
    current_tile_buffer = next_tile_buffer
    next_tile_buffer = clear
    pixel_x -= 8
    advance tile map position
```

### VWF performance considerations

- **DMG at 4 MHz:** VWF rendering is slow. Writing 16 bytes to VRAM per tile, plus
  the bit-shifting math, plus the VBlank timing constraint. Practical but limits
  text display speed.
- **GBC at 8 MHz (double speed):** Much more comfortable. Most GBC VWF
  implementations run smoothly. The double-speed mode is a major reason VWF is more
  common in GBC translations.
- **VBlank window:** VRAM can only be written during VBlank (~1.1 ms) or when the LCD
  is off. On DMG, this limits how many tiles you can update per frame. Strategies:
  - Buffer several tiles and write them all during VBlank
  - Render text one character per frame (slower but simpler)
  - Use HDMA on GBC to transfer tile data more efficiently

### VWF and tile consumption

VWF uses tiles differently from fixed-width text. Each displayed "line" of text
consumes 20 tiles (the screen width), regardless of how many characters are shown.
However, the tiles are dynamically generated, so the font itself does not need to
be in VRAM -- only the rendered output tiles.

This means a VWF engine can support an arbitrarily large character set by storing
font glyph data in ROM (not VRAM) and rendering on the fly. This is the key
advantage for scripts like Hangul that need hundreds or thousands of glyphs.

## Practical Workflow: Localizing a GB Game

### Step 1: Identify the text encoding

Use **relative search** to find text in the ROM. Relative search looks for sequences
of bytes with consistent differences matching the target alphabet:

```
If "HELLO" is encoded as sequential tile indices:
H=? E=? L=? L=? O=?
The differences are: E-H, L-E, L-L, O-L = -3, +7, 0, +3

Search the ROM for any 5-byte sequence with differences [-3, +7, 0, +3]
```

Tools that support relative search:
- **Monkey-Moore** / **Search R** / **TextAngel** (specialized relative search tools)
- Custom Python script (straightforward to implement)

### Step 2: Build the character table (.tbl)

Once you find text, map byte values to characters:

```
; Example .tbl file for a GB game
80=A
81=B
82=C
...
99=Z
9A=a
9B=b
...
```

Use [Cartographer](https://www.romhacking.net/utilities/647/) with the `.tbl` file
to dump all text from the ROM.

### Step 3: Trace the text engine in a debugger

Use [SameBoy](https://sameboy.github.io/), [mGBA](https://mgba.io/), or
[BGB](https://bgb.bircd.org/) (Windows):

1. Set a **read breakpoint** on a known text byte in ROM
2. The game breaks when the text engine reads that byte
3. Step through the code to understand:
   - How it reads bytes (loop structure)
   - Where it checks for control codes (`cp` instructions, jump tables)
   - How it converts text bytes to tile indices
   - Where it writes to the tile map in VRAM
   - Which bank it is reading from

### Step 4: Find the pointer table

1. Compute the bank-relative address of a known text string
2. Search the ROM for that address (little-endian)
3. Verify that adjacent entries point to other strings
4. Document the pointer table's location, size, and entry format

### Step 5: Plan the translation

Assess the constraints:
- **Tile budget:** How many tiles are available for font glyphs?
- **ROM space:** How much free space exists? Do you need ROM expansion?
- **Text box size:** How many characters fit per line? (usually 18-20 tiles)
- **String length:** Will translated strings be longer? Shorter?
- **Pointer updates:** If strings change length, pointers must be recomputed

### Step 6: Insert translated text

Use [Atlas](https://www.romhacking.net/utilities/224/) or a custom Python script:

1. Edit the dumped text file with translations
2. Insert using the `.tbl` file for encoding
3. Atlas can automatically recompute pointers if configured correctly

For manual insertion, update pointers using the formula:
```
new_pointer = (new_rom_offset % 0x4000) + 0x4000   (for banks 1+)
```

### Step 7: Fix the header

After any ROM modifications:

```bash
# Fix header checksum (required) and global checksum (recommended)
rgbfix -v -f rom.gb
```

Or use a hex editor to manually recompute using the algorithm in the
[header](./header) page.

### Step 8: Test

- Test in multiple emulators (SameBoy for accuracy, mGBA for scripting)
- Check every text string in the game (dialogue, menus, items, battle text)
- Verify on original hardware if possible (flashcart)
- Pay attention to:
  - Text that overflows the text box
  - Garbled characters (wrong tile indices)
  - Broken line breaks (control code mismatch)
  - Missing text (pointer errors)
  - Save/load still works (if you changed MBC or RAM settings)

## RGBDS Workflow for ASM Patches

[RGBDS](https://rgbds.gbdev.io/) is the standard SM83 assembler toolchain. For
localization patches that require code changes (VWF, encoding changes, bank
switching):

### Assembling a patch

```bash
# Assemble the patch source
rgbasm -o patch.o patch.asm

# Link into a binary
rgblink -o patch.gb patch.o

# Fix checksums
rgbfix -v -f patch.gb
```

### Common patch patterns

**Bank switch before text read:**
```asm
; Switch to bank 0x10 where translated text lives
ld a, $10
ld [$2000], a      ; MBC ROM bank register

; Read text from the new bank
ld hl, $4000       ; start of text in bank 0x10
call TextEngine
```

**Hook the text engine to add offset:**
```asm
; Original: ld a, [hl] / write to VRAM
; Patched: add an offset to support a larger character table
ld a, [hl]         ; read text byte
add a, $80         ; add offset to reach font tiles starting at tile 0x80
ld [de], a         ; write tile index to VRAM tile map
```

**Simple VWF width table:**
```asm
; Width table for proportional font (pixels per character)
CharWidths:
  db 6, 6, 6, 6, 6, 4, 6, 6  ; A B C D E F G H
  db 2, 5, 6, 5, 7, 6, 6, 6  ; I J K L M N O P
  db 6, 6, 5, 6, 6, 6, 7, 7  ; Q R S T U V W X
  db 6, 6                      ; Y Z
```

## References

- [Pan Docs](https://gbdev.io/pandocs/) -- GB/GBC technical reference (CC0)
- [pret/pokered](https://github.com/pret/pokered) -- Pokemon Red disassembly (text engine reference)
- [pret/pokecrystal](https://github.com/pret/pokecrystal) -- Pokemon Crystal disassembly
- [RGBDS](https://rgbds.gbdev.io/) -- SM83 assembler toolchain
- [Romhacking.net GB section](https://www.romhacking.net/) -- community tools and documents
