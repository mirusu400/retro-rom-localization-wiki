---
title: Text Engine Reverse Engineering
description: How to reverse-engineer a retro game's text engine — charset recovery, .tbl tables, DTE/MTE, control codes, and locating the render routine.
---

Every retro game has its own text engine: the code that reads encoded bytes from ROM, maps
them to font tiles, and draws them on screen. Understanding this engine is the foundation of
any localization project. This page covers the techniques for recovering the encoding, building
a table file, and finding the render routine you will eventually hook.

## Relative search — recovering the charset

Most retro games do **not** use ASCII. Characters are mapped to byte values in an order that
made sense to the original developer — often roughly alphabetical, but starting at an
arbitrary value. "A" might be `0x00`, `0x10`, `0x80`, or anything else.

A **relative search** exploits the fact that consecutive letters in the alphabet are usually
consecutive byte values. You search the ROM not for absolute bytes but for a *pattern of
differences* between adjacent bytes.

### How it works

Take a word you know appears in the game — for example, the title or a menu option like
`NEW GAME`. Compute the difference sequence:

```
N  E  W  _  G  A  M  E
 -9  +18  ?  ?  -6  +12  -8
```

The `?` entries are the space character, whose mapping you do not know yet. Search the ROM for
any sequence of bytes whose successive differences match `-9, +18, …, -6, +12, -8`. Each hit
is a candidate; cross-reference with the tile editor to confirm.

### Tools

- **findrel** — a classic relative-search utility from the ROM-hacking community.
- **Custom Python** — a simple script is often more flexible:

```python
def relative_search(rom: bytes, pattern: str) -> list[int]:
    diffs = [ord(pattern[i+1]) - ord(pattern[i]) for i in range(len(pattern)-1)]
    hits = []
    for offset in range(len(rom) - len(pattern)):
        if all(rom[offset+i+1] - rom[offset+i] & 0xFF == d & 0xFF for i, d in enumerate(diffs)):
            hits.append(offset)
    return hits
```

Once you find a match, the byte at the match offset maps to the first character in your
search string. From there, you can derive the rest of the alphabet.

## The `.tbl` file format

A `.tbl` (table) file is a plain-text mapping from byte values to characters, one entry per
line:

```
00=A
01=B
02=C
...
1A=0
1B=1
...
FE=[newline]
FF=[end]
```

The left side is a hex byte (or multi-byte sequence); the right side is the character or
control-code label. This format is used by [Cartographer and Atlas](/retro-rom-localization-wiki/tools/#text-extract--insert)
for automated text extraction and insertion.

### Building the table

1. Start with the letters recovered by relative search.
2. Open the font tiles in a tile editor and walk through them visually — the tile index often
   *is* the byte value (or differs by a constant).
3. Fill in digits, punctuation, and the space character.
4. Identify control codes by process of elimination — bytes that appear in text strings but
   have no corresponding font tile are likely control codes.
5. Test by dumping text with the table and reading it — mistranslated or garbled entries
   indicate wrong mappings.

### Multi-byte table entries

Some games use multi-byte encodings (common on GBA/NDS or when supporting CJK scripts):

```
8140=あ
8141=い
8142=う
```

Cartographer and Atlas support multi-byte left-hand sides. The byte length is inferred from
the hex string length.

## DTE/MTE compression

**DTE (Dual-Tile Encoding)** and **MTE (Multi-Tile Encoding)** are simple compression
techniques where a single byte value expands to two or more characters. They are extremely
common in NES and SNES games where ROM space is tight.

### How DTE works

A range of byte values (often `0x80`–`0xFE` or similar) is reserved. When the text engine
encounters one of these bytes, it looks up a two-character pair in an expansion table stored
in ROM and prints both characters.

For example:
```
80=th
81=he
82=in
83=er
84=re
```

The expansion table is usually a contiguous block of paired byte values somewhere in the same
bank as the text engine. To find it, set a read breakpoint on the byte value range and trace
the code — the engine will index into the table.

### MTE (Multi-Tile Encoding)

An extension of DTE where each entry expands to a full word or common substring:

```
80=the
81=and
82=you
```

MTE entries are variable-length and terminated (often by `0xFF` or by a length prefix).

### Reclaiming DTE/MTE slots

When localizing, DTE/MTE entries that are specific to the source language become useless.
These byte values can be **reclaimed** as direct glyph slots for the target script's
characters — a valuable source of extra encoding space. See
[Encoding & Fonts](/retro-rom-localization-wiki/encoding-and-fonts/#reclaiming-dtemte-slots).

## Control codes

Every text engine has control codes — byte values that do not print a character but instead
control text flow. Common control codes include:

| Function | Typical byte | Notes |
|----------|-------------|-------|
| End of string | `0xFF` or `0x00` | Terminates the current string |
| Line break | `0xFE` or `0x01` | Advances to the next line within the text box |
| New text box | varies | Clears the box and waits for input |
| Wait for input | varies | Pauses until the player presses a button |
| Name substitution | varies | Inserts the player's name or another variable |
| Text speed | varies | Changes the character-by-character display speed |
| Color change | varies + param | Followed by a color index byte |

### Identifying control codes

1. **By exclusion.** After mapping all printable characters, any remaining byte values that
   appear in text data are candidates.
2. **By context.** A byte that always appears at the end of a string is likely end-of-string.
   A byte that appears where you see a line break on screen is the line-break code.
3. **By tracing.** Set a breakpoint on the text engine's main loop. When it reads a
   non-printable byte, follow the branch — the code path reveals the function.

### Documenting control codes in `.tbl`

Convention for Cartographer/Atlas:

```
FE=\n
FF=*
```

Or with descriptive labels:

```
FA=[wait]
FB=[name]
FC=[color]
FD=[page]
FE=[line]
FF=[end]
```

The exact label syntax depends on the tool. Atlas uses `*` for end-of-string by default.

## Locating the font-render routine

The font-render routine is the code that takes an encoded byte, looks up the corresponding
font tile, and writes it to VRAM (or to a compositing buffer). This routine is the **hook
point** for a variable-width font (VWF) patch — you replace its fixed-width tile copy with
pixel-level glyph drawing.

### Strategy: write breakpoint on VRAM

1. Identify the VRAM address where text tiles appear. On NES, this is in the nametable
   (`0x2000`–`0x2FFF` via PPU). On GB, tile map at `0x9800`–`0x9BFF`. On GBA, in one of the
   background tile map entries. The [platform pages](/retro-rom-localization-wiki/platforms/nes/)
   have VRAM layout details.
2. Set a **write breakpoint** on that VRAM region in your debugger (mGBA, Mesen2, FCEUX, etc.).
3. Trigger a text box in-game.
4. The debugger breaks at the instruction writing to VRAM. Walk up the call stack to find the
   text engine's main loop.

### Strategy: read breakpoint on text data

If you already know where a string lives in ROM (from your `.tbl` work):

1. Set a **read breakpoint** on the first byte of the string.
2. Trigger the string in-game.
3. The debugger breaks at the instruction reading the encoded byte — you are inside the text
   engine.

### What to look for in the routine

The text engine's main loop typically follows this pattern:

```
loop:
    load byte from [text_pointer]
    increment text_pointer
    compare byte to end_marker
    branch if equal -> done
    compare byte to control_code_range
    branch if in range -> handle_control_code
    ; it's a printable character
    use byte as index into font_tile_table
    copy tile to VRAM at [cursor_x, cursor_y]
    advance cursor_x by tile_width      ; <-- THIS is what VWF replaces
    jump -> loop
```

The `advance cursor_x by tile_width` line is the fixed-width assumption. A VWF patch replaces
this with a per-glyph width lookup and pixel-level rendering. See
[Encoding & Fonts — VWF](/retro-rom-localization-wiki/encoding-and-fonts/#variable-width-fonts-vwf)
for implementation details.

## Debugger tips

- **Conditional breakpoints** save time: break only when a specific byte value is read, e.g.,
  `break on read 0x08040000 if value == 0x80`.
- **Trace logging** in Mesen2 and mGBA can dump every instruction executed during a text box
  display — useful for understanding the full engine, but generates large logs.
- **Save states** let you replay the same text box repeatedly while adjusting breakpoints.
- On NES, the PPU write register `$2007` is the choke point for all VRAM writes — break there
  and filter by nametable address.
- On GBA, DMA transfers may copy font tiles to VRAM in bulk; break on the DMA control
  register (`0x040000BA` for DMA3) as well as direct writes.

## Further reading

- [Encoding & Fonts](/retro-rom-localization-wiki/encoding-and-fonts/) — the glyph-slot
  problem and VWF implementation
- [Pointers](/retro-rom-localization-wiki/pointers/) — what happens when translated text
  changes length
- [Tools](/retro-rom-localization-wiki/tools/) — Cartographer, Atlas, emulators with Lua/debugger
