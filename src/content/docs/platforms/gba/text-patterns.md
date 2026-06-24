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

## Hooking with BL: patching branch-and-link instructions

The most common way to inject custom code into a GBA game is to **overwrite an existing `BL`
(branch-and-link) instruction** so it calls your routine instead of (or in addition to) the
original. This is how translators add VWF rendering, encoding conversion, or expanded font
loading without rewriting the entire text engine.

Source: [GBATEK — ARM/Thumb Opcode Summary](https://problemkaputt.de/gbatek.htm),
ARM7TDMI Technical Reference Manual.

### Thumb BL encoding

Since most GBA game code is Thumb, this is the encoding you will work with most often. Thumb
`BL` is unique: it is a **two-halfword instruction** (4 bytes total), where each halfword is
executed sequentially by the CPU.

```
First halfword  (H=0):  1111 0 [offset_hi:11]
Second halfword (H=1):  1111 1 [offset_lo:11]

  Bits 15-11 of first  halfword: 11110  (0xF000 mask)
  Bits 15-11 of second halfword: 11111  (0xF800 mask)
  Bits 10-0:  offset fragments
```

**How the CPU executes it:**

1. First halfword: `LR = PC + (offset_hi << 12)`. The CPU loads the upper part of the target
   offset into the link register. `offset_hi` is sign-extended (bit 10 is the sign bit).
2. Second halfword: `temp = LR + (offset_lo << 1); LR = (PC - 2) | 1; PC = temp`. The CPU
   computes the final target, saves the return address in LR (with bit 0 set for Thumb), and
   branches.

**Combined offset:** the two 11-bit fields form a 22-bit signed offset (in halfwords), giving
a range of **+/- 4 MB** from the `BL` instruction address. The target address is:

```
target = address_of_first_halfword + 4 + sign_extend(offset_hi << 12) + (offset_lo << 1)
```

(The `+ 4` accounts for the ARM pipeline: PC is 4 bytes ahead of the current instruction in
Thumb mode.)

### Computing a Thumb BL patch

Given the address of the `BL` instruction and the desired target:

```python
def encode_thumb_bl(bl_addr, target_addr):
    """Encode a Thumb BL instruction (two halfwords) for a given source and target."""
    offset = target_addr - (bl_addr + 4)  # account for pipeline
    assert -0x400000 <= offset < 0x400000, "target out of BL range (+/- 4 MB)"

    offset_hw = offset >> 1               # convert byte offset to halfword offset
    hi = (offset_hw >> 11) & 0x7FF        # upper 11 bits
    lo = offset_hw & 0x7FF                # lower 11 bits

    first  = 0xF000 | hi
    second = 0xF800 | lo
    return first, second

# Example: patch BL at ROM offset 0x1234 to call routine at ROM offset 0x80000
bl_addr     = 0x08001234              # ROM address of the BL instruction
target_addr = 0x08080001              # target (bit 0 set = Thumb; ignored in BL calc)
target_addr &= ~1                     # strip Thumb bit for offset calculation

first, second = encode_thumb_bl(bl_addr, target_addr)
# Write little-endian: rom[0x1234] = first & 0xFF, rom[0x1235] = first >> 8,
#                      rom[0x1236] = second & 0xFF, rom[0x1237] = second >> 8
```

### ARM BL encoding

ARM `BL` is a single 32-bit instruction used when the code is in ARM state (less common for
general game code but used in BIOS, IWRAM routines, and some SDK stubs):

```
Bits 31-28: condition (0xE = always)
Bits 27-25: 101
Bit 24:     1 (L flag: 1 = BL, 0 = B)
Bits 23-0:  24-bit signed offset (in words)

Encoding:  0xEB000000 | (offset_words & 0x00FFFFFF)
```

**Target address:**

```
target = address_of_BL + 8 + (sign_extend_24(offset) << 2)
```

The `+ 8` is the ARM pipeline offset (PC is 8 bytes ahead). The 24-bit signed word offset gives
a range of **+/- 32 MB**.

```python
def encode_arm_bl(bl_addr, target_addr):
    """Encode an ARM BL instruction (unconditional)."""
    offset = target_addr - (bl_addr + 8)
    assert offset % 4 == 0, "target must be word-aligned for ARM BL"
    offset_words = offset >> 2
    assert -0x800000 <= offset_words < 0x800000, "target out of ARM BL range (+/- 32 MB)"
    return 0xEB000000 | (offset_words & 0x00FFFFFF)
```

### Practical example: hooking the text render function

**Scenario:** A game has a Thumb text-rendering function at `0x08004A00` that processes one
character at a time. It calls a glyph-drawing subroutine via `BL draw_glyph` at address
`0x08004A2C`. You want to intercept every glyph draw to implement VWF or convert a multi-byte
encoding to tile indices.

**Step 1: Find free space.** GBA ROMs often have unused `0xFF`-filled regions near the end. If
the ROM is 8 MB but the game only uses 4 MB, addresses from `0x08400000` onward are available.
Alternatively, many ROMs have small pockets of `0x00` or `0xFF` padding between data sections.

**Step 2: Write your hook routine.** The hook must preserve the calling convention — the original
`BL` put the character code in a register (commonly `r0`) and expected the glyph-draw function
to return cleanly. Your hook can modify `r0` (encoding conversion), perform extra work (VWF
pixel merging), and then call the original function:

```
; Custom hook at 0x08400000 (Thumb)
; r0 = character code from the text engine

hook_draw_glyph:
    PUSH  {r1-r3, lr}        ; save registers

    ; --- your custom logic here ---
    ; Example: convert from custom 2-byte encoding to tile index
    CMP   r0, #0x80
    BLT   .single_byte
    ; handle multi-byte: read next byte, compute tile index
    ; ...
.single_byte:

    ; Call the original draw_glyph function
    BL    original_draw_glyph ; 0x08002E00 (the real glyph drawer)

    ; --- post-draw logic (e.g., advance VWF cursor) ---

    POP   {r1-r3, pc}        ; return to text engine
```

**Step 3: Patch the BL.** Overwrite the original `BL draw_glyph` at `0x08004A2C` with a
`BL hook_draw_glyph` pointing to `0x08400000`:

```python
# Original BL at 0x08004A2C called 0x08002E00
# New BL at 0x08004A2C should call 0x08400000

first, second = encode_thumb_bl(0x08004A2C, 0x08400000)
rom[0x4A2C] = first & 0xFF
rom[0x4A2D] = first >> 8
rom[0x4A2E] = second & 0xFF
rom[0x4A2F] = second >> 8
```

**Step 4: Verify round-trip.** Load the patched ROM in mGBA, trigger text display, and confirm
that:
1. The hook is reached (breakpoint at `0x08400000`).
2. The original glyph-draw function is still called correctly.
3. Text displays identically to the unpatched ROM (before adding your custom logic).

Only after this round-trip verification should you begin adding VWF or encoding changes.

### Common pitfalls

**Range limit.** Thumb `BL` can only reach +/- 4 MB. If your hook is in expanded ROM space far
from the call site, the `BL` may not reach. Solutions:
- Place the hook in a closer free-space region.
- Use a **trampoline**: patch the `BL` to a short stub in nearby free space, and the stub uses
  `LDR pc, [pc, #offset]` (or `BX rN` with the full 32-bit address loaded via `LDR`) to reach
  the distant hook. This costs 8-12 bytes of nearby space.

```
; Trampoline stub (Thumb, 8 bytes) — place in nearby free space
trampoline:
    LDR   r3, =hook_draw_glyph + 1   ; +1 for Thumb flag
    BX    r3                          ; long branch to hook
    .word hook_draw_glyph + 1         ; literal pool (the LDR reads this)
```

**ARM/Thumb interworking.** If the code around the `BL` is ARM but your hook is Thumb (or vice
versa), a plain `BL` will not switch state. Use `BLX` (available on ARMv5+; the GBA is ARMv4T
and does **not** have `BLX` as an instruction). On GBA, interwork manually:

```
; ARM code calling a Thumb hook:
    LDR   r12, =hook_addr + 1    ; load Thumb address (bit 0 set)
    MOV   lr, pc                  ; save return address manually
    BX    r12                     ; branch-and-exchange to Thumb
```

**Clobbered registers.** Your hook must save and restore any registers the caller expects to
survive. Check the original function's calling convention — `r0`-`r3` are caller-saved (scratch),
but `r4`-`r7` (Thumb) or `r4`-`r11` (ARM) are callee-saved. Always `PUSH {lr}` if you use `BL`
inside your hook (since `BL` overwrites LR).

**Alignment.** Thumb code must be halfword-aligned (even address). ARM code must be word-aligned
(4-byte boundary). If your free space starts at an odd address, pad with a `NOP` (`0x46C0` in
Thumb).

### Tools for BL patching

| Tool | Use |
|---|---|
| **Ghidra** (ARM/Thumb) | Disassemble to find the `BL` call site and original target; verify your offset calculation |
| **mGBA debugger** | Set breakpoints on the patched `BL` to confirm the hook is reached |
| **armips** | ARM/Thumb assembler that can patch ROMs directly; handles BL offset calculation for you |
| **Python + struct** | Manual BL encoding as shown above; good for build scripts |

## References

- [GBATEK (main)](https://problemkaputt.de/gbatek.htm)
- [Text Engine](/retro-rom-localization-wiki/text-engine/) — encoding tables, DTE/MTE, control
  codes (platform-agnostic)
- [Encoding and Fonts](/retro-rom-localization-wiki/encoding-and-fonts/) — charset expansion, VWF
  concepts
- [Pointers](/retro-rom-localization-wiki/pointers/) — pointer table relocation
- [Tools](/retro-rom-localization-wiki/tools/) — CLI tools and emulators
