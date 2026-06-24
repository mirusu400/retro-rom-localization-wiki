---
title: "GBA Text Engine Patterns"
description: "Common GBA text engine patterns for localization: Shift-JIS and custom encodings, VWF implementation, pointer table structures, control codes, and practical techniques for finding and reverse-engineering text routines in ARM/Thumb code."
sidebar:
  order: 6
---

GBA text engines are more sophisticated than those on older consoles. The ARM7TDMI CPU's power
allows games to implement **variable-width font (VWF) rendering**, multi-byte encodings, and
script bytecode interpreters. This page documents the common patterns you will encounter when
reverse-engineering GBA text systems for localization.

## Encoding patterns

### Shift-JIS in Japanese games

Many Japanese GBA games use **Shift-JIS** encoding for text storage, especially games developed
with professional SDKs. Shift-JIS characteristics:

- **Single-byte range** (`0x20`-`0x7E`, `0xA1`-`0xDF`): ASCII and half-width katakana.
- **Double-byte range** (lead byte `0x81`-`0x9F` or `0xE0`-`0xEF`, trail byte `0x40`-`0x7E`
  or `0x80`-`0xFC`): full-width hiragana, katakana, kanji, symbols.
- **Terminator**: typically `0x00`.

To identify Shift-JIS text in a ROM:
1. Search for known Japanese strings in Shift-JIS. For example, the katakana "Pokemon" (ポケモン)
   in Shift-JIS is `83 7C 83 50 83 82 83 93`.
2. Use a hex editor with Shift-JIS display mode, or a tool like `iconv` to try decoding ranges.

### Custom single-byte encoding

Many games, especially earlier or simpler titles, use a **custom 1-byte encoding** where each
byte maps to a tile index in the font:

```
0x00 = end of string
0x01 = newline
0x02-0x0F = control codes (varies per game)
0x10+ = character tiles (game-specific mapping)
```

The mapping is not standardized — you must reverse-engineer it per game. Common approaches:

1. **Relative search**: Search the ROM for a known in-game string using a relative-offset pattern.
   For example, if the game displays "HELLO", search for five consecutive bytes where each pair
   has the same difference as H-E, E-L, L-L, L-O in ASCII.
   See [Text Engine](/retro-rom-localization-wiki/text-engine/) for the relative search method.

2. **Tile index correlation**: In the emulator's tile viewer, note the tile index of known
   characters. If "A" is at tile 0x41 in VRAM and the font is stored at charblock 2, the
   encoding value for "A" might be `0x41` (direct tile index) or `0x41 - base_tile`
   (offset from font start).

### Custom multi-byte encoding

Some games use a **2-byte encoding** for an expanded character set:

```
Lead byte 0x80-0xFF: signals a two-byte character
  0x80 XX = kanji block 1 (XX selects within block)
  0x81 XX = kanji block 2
  ...
Lead byte 0x01-0x7F: single-byte character (ASCII-like or custom)
```

This pattern is common in games with large kanji sets that exceed 256 characters. The multi-byte
scheme is usually custom (not standard Shift-JIS) with a game-specific lookup table.

### DTE/MTE (Dual/Multi-Tile Encoding)

Some games compress text by mapping a single byte to a **pair of characters** (DTE) or an entire
**common word or phrase** (MTE). For example:

```
0xF0 = "th"
0xF1 = "he"
0xF2 = "the"
0xF3 = "ing"
```

This is less common on GBA than on NES/SNES (since GBA has more ROM space), but still encountered
occasionally. See [Text Engine — DTE/MTE](/retro-rom-localization-wiki/text-engine/) for details.

## Control codes

GBA text engines typically reserve low byte values (or specific byte ranges) for control functions.
While every game is different, common patterns include:

| Code | Typical meaning | Notes |
|---|---|---|
| `0x00` | End of string | Almost universal |
| `0x01` | Line break | Move to next line in text box |
| `0x02` | New text box / page break | Clear box and wait for input |
| `0x03` | Wait for button press | Pause until A/B pressed |
| `0x04`-`0x05` | Text speed control | Set scroll speed or delay |
| `0x06`-`0x08` | Variable substitution | Insert player name, item name, number |
| `0x09`-`0x0A` | Color change | Switch text palette |
| `0x0B`-`0x0F` | Various | Sound effect trigger, portrait change, etc. |

### Parameterized control codes

Many GBA games use control codes with **parameters** following them:

```
0x06 [param_byte]        = insert variable #param_byte
0x09 [color_byte]        = set text color to palette #color_byte
0x0C [delay_hi] [delay_lo] = wait for delay frames
```

When dumping text, you must correctly parse these to avoid misinterpreting parameter bytes as
text characters. The text routine's code reveals the control code dispatch table.

## Text data structures

### Simple pointer table + string data

The most common structure: a table of 32-bit pointers followed by null-terminated strings.

```
Pointer table (at ROM offset 0x001A0000):
  0x001A0000: 20 00 1B 08    → string at 0x081B0020 (file offset 0x001B0020)
  0x001A0004: 45 00 1B 08    → string at 0x081B0045
  0x001A0008: 78 00 1B 08    → string at 0x081B0078
  ...

String data (at ROM offset 0x001B0020):
  0x001B0020: 48 45 4C 4C 4F 00   "HELLO\0"
  0x001B0026: ...
```

Remember: pointers are **little-endian 32-bit values** with the `0x08000000` base.

### Indexed string bank

Some games use an **index + offset** approach:

```
String bank header:
  [2-byte count] [2-byte offset to string 0] [2-byte offset to string 1] ...

Each offset is relative to the start of the string data block.
```

This uses 16-bit relative offsets instead of 32-bit absolute pointers, saving space.

### Script bytecode

More complex games (especially RPGs) embed text within a **script bytecode** format:

```
[opcode: show_dialogue] [pointer to text] [portrait_id] [flags]
[opcode: wait_input]
[opcode: close_box]
```

In this case, text pointers are embedded within script instructions rather than in a simple
pointer table. You need to reverse-engineer the script engine to find all text references.

## Variable-width font (VWF) implementation

VWF is **very common on GBA** because the CPU is fast enough to render glyphs pixel-by-pixel.
A typical VWF implementation:

### How it works

1. The game maintains a **pixel buffer** in WRAM (often 8 pixels tall x N pixels wide, matching
   a row of tiles).
2. For each character, the game:
   a. Looks up the glyph bitmap and width from a **font table** in ROM.
   b. Copies the glyph pixels into the buffer at the current X position.
   c. Advances the X position by the glyph's width (not a fixed 8 pixels).
3. When the buffer fills a complete 8-pixel-wide tile column, the tile is **DMA'd or copied
   to VRAM** and the buffer shifts.

### Font table format

A VWF font table typically contains, for each glyph:

```
struct GlyphEntry {
    uint8_t width;       // glyph width in pixels (e.g., 3-8)
    uint8_t data[];      // glyph bitmap (variable size based on height)
};
```

Or alternatively:

```
Width table:  [w0, w1, w2, w3, ...]    (1 byte per character)
Glyph data:  [tile0, tile1, tile2, ...]  (fixed-size tiles, e.g., 32 bytes each at 4bpp)
```

The width table is separate from the glyph pixel data. Some games store both together; others
keep them in separate arrays.

### Finding the VWF routine

Look for code that:
1. Reads a **width value** from a table (indexed by character code).
2. Performs **bit-shifting** and **OR operations** to merge glyph pixels into a buffer.
3. Writes to VRAM in **tile-sized chunks** (32 or 64 bytes at a time).

In ARM/Thumb disassembly, the pixel-merging loop typically involves:
- `LSL` / `LSR` (logical shift left/right) to position the glyph.
- `ORR` to merge it into the existing buffer.
- Comparison against 8 (tile width) to check for tile boundary.

### VWF and localization

If the game already has VWF, your job is easier — you just need to:
1. Replace or extend the glyph bitmaps in the font table.
2. Update the width table with correct widths for your target script's characters.
3. Possibly extend the encoding to support more characters.

If the game uses fixed-width rendering and you need VWF (e.g., for a script like Hangul or
Latin with variable widths), you must **write a VWF patch** — new ARM or Thumb code that hooks
into the text-rendering function and implements pixel-level rendering.

## ARM vs. Thumb code

GBA games use two instruction sets:

| Instruction set | Word size | Speed | Where used |
|---|---|---|---|
| **ARM** | 32-bit (4 bytes/instr) | Fast from IWRAM, slower from ROM | Performance-critical code |
| **Thumb** | 16-bit (2 bytes/instr) | Better code density, faster from ROM (16-bit bus) | Most game code |

**Text routines are almost always Thumb code** because they run from ROM and benefit from
Thumb's better code density on the 16-bit ROM bus.

### Identifying Thumb functions

- Function addresses in pointer tables have **bit 0 set** to indicate Thumb mode:
  `0x08012345` means ARM entry, `0x08012345 | 1 = 0x08012345` but stored as an odd address.
  Actually: `0x08012344` = ARM, `0x08012345` = Thumb (bit 0 = 1).
- In Ghidra, make sure to set the processor to ARM with Thumb support and mark code regions
  correctly.
- Thumb instructions are 2 bytes, so function starts are halfword-aligned (even addresses),
  but the call target has bit 0 set to signal Thumb mode.

### Common function call patterns

```
; Thumb: call function via BL (branch-and-link)
BL  text_render_function    ; calls the text renderer, LR = return address

; ARM: call function via BL or BX
BL  text_render_function
BX  r3                      ; branch-and-exchange, switches ARM/Thumb based on bit 0 of r3
```

When tracing text routines in the debugger, set breakpoints on `BL` instructions that target
the suspected text-rendering function.

## How to find text in a GBA ROM

### Method 1: relative search

The classic method — search for byte sequences where the **differences between consecutive
bytes** match the differences in a known displayed string.

```python
def relative_search(rom: bytes, text: str) -> list[int]:
    """Find positions where byte differences match the text's character differences."""
    if len(text) < 3:
        return []
    diffs = [ord(text[i+1]) - ord(text[i]) for i in range(len(text) - 1)]
    results = []
    for offset in range(len(rom) - len(text)):
        match = True
        for i, d in enumerate(diffs):
            if (rom[offset + i + 1] - rom[offset + i]) & 0xFF != d & 0xFF:
                match = False
                break
        if match:
            results.append(offset)
    return results
```

This works regardless of the encoding base offset — it finds the pattern by character spacing.

### Method 2: known string search

If you suspect Shift-JIS or ASCII, search for the raw encoded bytes:

```bash
# Search for ASCII "GAME OVER" in hex
xxd game.gba | grep -i "47414d45204f564552"

# Or use Python
with open("game.gba", "rb") as f:
    rom = f.read()
    pos = rom.find(b"GAME OVER")
    if pos >= 0:
        print(f"Found at 0x{pos:06X}")
```

### Method 3: pointer cross-reference

1. Find one string using methods 1 or 2.
2. Compute its pointer value: `pointer = offset + 0x08000000`.
3. Search the ROM for this pointer in little-endian format.
4. The location where you find the pointer is likely part of a pointer table.
5. Read adjacent pointers to find more strings.

```python
import struct

string_offset = 0x001B0020
pointer = string_offset + 0x08000000
pointer_bytes = struct.pack("<I", pointer)  # little-endian

# Search ROM for this pointer
positions = []
for i in range(0, len(rom) - 4):
    if rom[i:i+4] == pointer_bytes:
        positions.append(i)
        print(f"Pointer found at ROM offset 0x{i:06X}")
```

### Method 4: VRAM trace

1. Display text on screen in the emulator.
2. Find the tile indices in the BG screen map (tile viewer -> map viewer).
3. The tile indices correspond to encoding values (or offset from font base tile).
4. Search the ROM for these byte sequences.

### Method 5: text render breakpoint

1. In mGBA, identify the VRAM address where text tiles are written.
2. Set a write breakpoint on that VRAM address.
3. The game breaks in the text-rendering function.
4. Trace backward to find where the character code is read from ROM.
5. The source address in the character-reading instruction points to the text data.

## Practical tips

### Function prologue patterns (Thumb)

GBA Thumb functions often start with:

```
PUSH {r4-r7, lr}     ; save registers and return address
...
POP  {r4-r7, pc}     ; restore and return
```

Or for leaf functions (no nested calls):

```
PUSH {r4-r6}
...
POP  {r4-r6}
BX   lr
```

These patterns help you identify function boundaries in the disassembly.

### Common text routine structure

A typical GBA text-rendering function in pseudocode:

```c
void render_text(const char* text, int x, int y) {
    while (*text != 0x00) {          // loop until terminator
        uint8_t ch = *text++;
        if (ch < 0x10) {
            handle_control_code(ch);  // newline, color, wait, etc.
        } else {
            draw_glyph(ch, x, y);    // render one character
            x += get_glyph_width(ch); // advance cursor (VWF)
        }
    }
}
```

In the disassembly, look for:
1. A byte-load from a pointer that increments (`LDRB r0, [r1], #1` or equivalent).
2. A comparison against `0x00` (terminator check).
3. A comparison against a threshold (e.g., `CMP r0, #0x10`) to separate control codes from
   printable characters.
4. A branch to a glyph-drawing subroutine.

### Tools for GBA text hacking

| Tool | Use |
|---|---|
| **Cartographer** | `.tbl`-based text dumper — once you have the encoding table, dumps all text |
| **Atlas** | `.tbl`-based text inserter with pointer auto-recomputation |
| **Ghidra** (ARM module) | Disassemble and decompile text routines |
| **mGBA** (debugger + Lua) | Runtime breakpoints, memory inspection, scripted searches |
| **xxd / ImHex** | Hex-level inspection, relative search, pattern hunting |

## References

- [GBATEK (main)](https://problemkaputt.de/gbatek.htm)
- [Text Engine](/retro-rom-localization-wiki/text-engine/) — encoding tables, DTE/MTE, control
  codes (platform-agnostic)
- [Encoding and Fonts](/retro-rom-localization-wiki/encoding-and-fonts/) — charset expansion, VWF
  concepts
- [Pointers](/retro-rom-localization-wiki/pointers/) — pointer table relocation
- [Tools](/retro-rom-localization-wiki/tools/) — CLI tools and emulators
