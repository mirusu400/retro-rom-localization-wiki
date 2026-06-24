---
title: "SNES Text Engine Patterns"
description: "Common SNES text engine patterns for localization: pointer formats, Shift-JIS and custom encodings, DTE/MTE compression, script bytecodes, VWF identification, and the asar-based patching workflow."
sidebar:
  order: 5
---

SNES games -- especially Japanese RPGs -- have some of the most sophisticated text engines
in retro gaming. Understanding the common patterns helps you reverse-engineer any game's
text system faster. This page covers encoding schemes, pointer formats, compression,
script bytecodes, VWF detection, and the end-to-end patching workflow.

## Text encoding schemes

### Custom single-byte encoding (most common)

The majority of SNES games use a **custom encoding table** where each byte value maps to a
tile index in the font. There is no universal standard -- every game defines its own mapping.

Typical layout for a Japanese game:
```
$00-$4F: Hiragana (80 characters)
$50-$9F: Katakana (80 characters)
$A0-$DF: Common kanji (64 characters)
$E0-$EF: Numbers, punctuation
$F0-$FE: Control codes
$FF:     End-of-string marker
```

For localized (English) releases, the table is usually simpler:
```
$00-$19: A-Z (uppercase)
$1A-$33: a-z (lowercase)
$34-$3D: 0-9
$3E-$4F: Punctuation and symbols
$F0-$FE: Control codes
$FF:     End marker
```

### Shift-JIS

Some later SNES games (and games with large kanji sets) use **Shift-JIS** encoding, a
two-byte encoding for Japanese. In Shift-JIS:

- Single-byte range $20--$7F: ASCII (Latin letters, digits, punctuation)
- Single-byte range $A1--$DF: half-width katakana
- Two-byte sequences: first byte $81--$9F or $E0--$EF, second byte $40--$7E or $80--$FC

Shift-JIS gives access to ~7,000 kanji (JIS X 0208) but requires a large font. Games using
Shift-JIS typically have a **kanji font** stored as compressed tile data loaded on demand.

For localization to other scripts (e.g., Korean Hangul), you may repurpose the Shift-JIS
two-byte ranges for your own encoding, mapping code pairs to target glyphs.

### Multi-byte custom encoding

Some games use a custom two-byte encoding (not Shift-JIS) to support large character sets.
A common scheme:

- $01--$EF: single-byte characters (Latin, kana, common kanji)
- $F0--$FE: first byte of a two-byte sequence (extended kanji or special characters)
- $00 or $FF: end-of-string

This gives up to $EF single-byte entries plus 15 * 256 = 3,840 two-byte entries.

## DTE / MTE compression

**Dual Tile Encoding (DTE)** and **Multiple Tile Encoding (MTE)** are extremely common on
SNES because games have large amounts of dialogue text and ROM space is valuable.

### DTE (digraph compression)

Each DTE code expands to **two characters**. The text engine checks if the byte falls in
the DTE range and, if so, looks up a two-entry table:

```
DTE table at $0E:8000 (example):
  Code $80 -> "th"
  Code $81 -> "he"
  Code $82 -> "in"
  Code $83 -> "er"
  Code $84 -> "an"
  ...
```

65816 pseudocode:
```asm
  LDA [text_ptr]        ; load next byte
  CMP #$80              ; DTE range start?
  BCC .normal           ; if < $80, it's a normal character
  SEC
  SBC #$80              ; index into DTE table
  ASL A                 ; * 2 (two bytes per entry)
  TAX
  LDA dte_table,X       ; first character
  JSR render_char
  LDA dte_table+1,X     ; second character
  JSR render_char
  BRA .next
.normal:
  JSR render_char
.next:
  ...
```

### MTE (word/phrase compression)

MTE extends DTE to entire **words or phrases**. Each MTE code references a pointer to a
string that is recursively expanded:

```
MTE entry $C0 -> pointer to "Kingdom" (7 bytes)
MTE entry $C1 -> pointer to "Princess" (8 bytes)
```

MTE can dramatically reduce text size (30--50% compression is common for RPGs).

### Implications for localization

- **DTE/MTE must be understood before text extraction.** If you dump bytes without expanding
  DTE/MTE, the text will be garbled.
- When inserting translated text, you can **create new DTE/MTE entries** for common target-
  language bigrams/words, keeping translated text compact.
- Alternatively, if you expand the ROM, you may have enough space to remove DTE/MTE
  entirely and use a simpler encoding.

## Pointer formats

### 16-bit pointers (bank-relative)

The most common format. A pointer table stores 16-bit values (little-endian) that are
offsets within a known bank:

```
; Pointer table for dialogue text (bank $0C)
; Located at $0C:8000 in CPU space (file offset $060000 in LoROM)
  dw $8100    ; string 0 at $0C:8100
  dw $8134    ; string 1 at $0C:8134
  dw $8167    ; string 2 at $0C:8167
  ...
```

The bank is implicit -- usually the same bank as the pointer table itself, or set by the
engine via the **data bank register (DB)** or a hardcoded bank byte.

### 24-bit (long) pointers

Some games store full 3-byte pointers (address low, address high, bank byte):

```
; 24-bit pointer table
  dl $0C8100  ; stored as: 00 81 0C (little-endian)
  dl $0C8134  ; stored as: 34 81 0C
  dl $0D8000  ; stored as: 00 80 0D (crosses to next bank)
```

24-bit pointers are more flexible but use 50% more space per entry.

### Indexed pointers

Some engines use a **base address plus offset table**:

```
; Base address: $0C:A000
; Offset table (16-bit offsets from base):
  dw $0000    ; string 0 at base + $0000 = $0C:A000
  dw $002B    ; string 1 at base + $002B = $0C:A02B
  dw $0057    ; string 2 at base + $0057 = $0C:A057
```

This is more compact and keeps offsets small, but strings cannot cross bank boundaries
without special handling.

### Embedded pointers

Some games store the text length (or next-string offset) inline before each string,
eliminating the need for a separate pointer table:

```
$0C:8000: 0F                    ; length = 15 bytes
$0C:8001: 48 65 6C 6C 6F ...   ; "Hello, world!\n\0"
$0C:8010: 12                    ; next string length = 18
$0C:8011: ...
```

## Script engine bytecodes

Many SNES RPGs have a **script engine** -- a bytecode interpreter that handles not just
text display but also NPC movement, event triggers, branching, and variables. Text
display is just one opcode in a larger system.

### Common text control codes

| Code | Typical meaning | Notes |
|------|----------------|-------|
| $00 or $FF | End of string | Terminates text processing |
| $01 | New line | Advance to next line in text box |
| $02 | New page / clear box | Wait for input, then clear the text box |
| $03 | Wait for button press | Pause until player presses a button |
| $04-$07 | Player/character name | Insert the player's name or a party member's name |
| $08 | Item name | Insert an item name from a table |
| $09 | Number | Insert a numeric value (gold, HP, etc.) |
| $0A | Color change | Next byte specifies palette index |
| $0B | Text speed | Next byte sets character display delay |
| $0C-$0F | Choice / branch | Present player with dialogue choices |

:::caution
Control code assignments vary between games. The above is a representative pattern, not a
universal standard. Always verify by tracing the text engine in a debugger.
:::

### Identifying the script engine

1. Set a **read breakpoint** on a known text string address in bsnes-plus.
2. When the breakpoint hits, you are inside the text engine's "fetch next byte" routine.
3. Step through to find the **dispatch table** -- typically a series of `CMP` / `BEQ`
   instructions or a jump table (`JMP (addr,X)`) that branches on the byte value.
4. Each branch handles a control code. Characters that are not control codes fall through
   to the "render glyph" path.

Example 65816 dispatch pattern:
```asm
fetch_byte:
  LDA [text_ptr]         ; load next byte from script
  INC text_ptr           ; advance pointer
  BEQ .end_of_string     ; $00 = end
  CMP #$01
  BEQ .newline
  CMP #$02
  BEQ .new_page
  CMP #$03
  BEQ .wait_button
  CMP #$04
  BEQ .insert_name
  CMP #$10
  BCC .control_code      ; anything < $10 is a control code
  ; Fall through: it's a printable character
  JSR render_glyph
  BRA fetch_byte
```

## VWF identification

Variable-width font rendering on SNES has distinctive code patterns. When examining a
game's text engine, look for:

### Width table lookup

The engine reads a **per-character width** from a table:
```asm
  LDA char_code
  TAX
  LDA width_table,X     ; width in pixels (e.g., 3-8)
  STA current_width
```

### Sub-tile offset calculation

The engine maintains a **pixel X position** and calculates the bit offset within the
current tile:
```asm
  LDA pixel_x
  AND #$07              ; bit offset within 8-pixel tile
  STA shift_amount
  LDA pixel_x
  LSR A
  LSR A
  LSR A                 ; divide by 8 = tile index
  STA tile_index
```

### Bit-shift compositing

The core of VWF: shifting glyph data right by the sub-tile offset and OR-ing into the
render buffer:
```asm
  ; For each row of the glyph (y = 0..7):
  LDA glyph_row         ; 8-bit row of glyph data
  LDX shift_amount
  BEQ .no_shift
.shift_loop:
  LSR A                 ; shift right (for bitplane 0)
  DEX
  BNE .shift_loop
.no_shift:
  ORA buffer_tile       ; merge into buffer
  STA buffer_tile
```

For 2bpp, this is done for both bitplanes. The overflow bits (shifted out of the first
tile) must be OR-ed into the adjacent tile.

### DMA to VRAM during NMI

After compositing, the rendered buffer is transferred to VRAM:
```asm
NMI_handler:
  LDA #$01              ; transfer pattern: 2 bytes to $2118/$2119
  STA $4300
  LDA #$18              ; PPU register: VRAM data
  STA $4301
  LDA #buffer_addr      ; source address (WRAM)
  STA $4302
  LDA #^buffer_addr     ; source bank
  STA $4304
  LDA #buffer_size      ; byte count
  STA $4305
  LDA #$01              ; enable channel 0
  STA $420B
```

## Special chips and text

### SA-1

The SA-1 is a second 65C816 CPU with its own memory mapping. In SA-1 games:
- The SA-1 CPU can access ROM at full speed (10.74 MHz)
- I-RAM (2 KB at $3000--$37FF in CPU space) is shared between the main CPU and SA-1
- Text processing may run on either CPU
- ROM banking is controlled by SA-1 registers ($2220--$2223)

SA-1 games include _Super Mario RPG_, _Kirby Super Star_, and several late-era RPGs.
Pointer tables may use SA-1's remapped addresses rather than standard LoROM/HiROM.

### S-DD1

The S-DD1 is a decompression chip used by _Star Ocean_ and _Street Fighter Alpha 2_.
Graphics and sometimes text data is compressed and decompressed on the fly by the chip.
Localization requires understanding the S-DD1 compression format to decompress, modify,
and recompress data.

### SPC7110

Used by _Far East of Eden Zero_ and _Momotaro Dentetsu Happy_. The SPC7110 provides
data decompression and extended ROM banking. Text data accessed through the chip's
port registers must be traced through the chip's configuration.

## asar: the standard SNES patch tool

[asar](https://github.com/RPGHacker/asar) is a 65816 assembler designed specifically for
SNES ROM patching. Unlike general-purpose assemblers, asar can **patch directly into a
ROM file**, making it the standard tool for SNES fan translations.

### Key features

- Writes assembled code directly into the ROM at specified addresses
- Understands LoROM and HiROM address mapping
- Supports `org` (set PC to a CPU address) and `base` (set assumed address for labels)
- Supports `freespace` / `freedata` commands for finding and using unused ROM space
- Macro support for repetitive patching
- Used by virtually all SNES ROM hacking projects

### Example: inserting a VWF hook with asar

```asm
; vwf_patch.asm -- Hook the text engine to use VWF
lorom                         ; declare mapping mode

; Hook the original render_char routine
org $00:8A34                  ; CPU address of the JSR render_char
  JSR vwf_render              ; redirect to our VWF routine

; New code in expanded ROM space
org $20:8000                  ; free space in bank $20
vwf_render:
  PHX
  TAX
  LDA.l width_table,X        ; load glyph width
  STA $7E0040                ; store in WRAM variable
  
  ; ... bit-shift compositing code ...
  
  PLX
  RTS

width_table:
  ; Width of each character in pixels
  db 6,6,6,5,6,5,3,6         ; A-H
  db 2,4,5,2,7,6,6,6         ; I-P
  db 6,5,5,5,6,6,7,6         ; Q-X
  db 6,5                      ; Y-Z
  ; ... continue for all characters
```

Apply the patch:
```bash
asar vwf_patch.asm game.smc
```

### ROM expansion with asar

To expand a ROM (e.g., from 1 MB to 2 MB) for extra text/font space:

```bash
# Pad the ROM file to 2 MB
truncate -s 2M game.smc
```

Then in the asar patch, update the header:
```asm
org $00:FFD7                  ; ROM size byte
  db $0B                      ; $0B = 2 MB (1 << $0B = 2048 KB)
```

After patching, recalculate the checksum (asar can do this automatically with the
`check title` or manual checksum code).

## End-to-end localization workflow

### 1. Identify the mapping mode

Read byte at file offset $7FD5 (LoROM) or $FFD5 (HiROM). If the value has bit 0 clear,
it is LoROM; if set, HiROM. Use this for all address conversions.

### 2. Find the text (relative search)

Use a **relative search** tool to find text strings. The idea: if "ATTACK" is in the ROM,
the byte values for A, T, T, A, C, K have consistent relative differences regardless of
the actual encoding.

```python
# Relative search: find "HELLO" pattern
target = "HELLO"
diffs = [ord(target[i+1]) - ord(target[i]) for i in range(len(target)-1)]
# diffs = [-3, 7, 0, 3]

# Search ROM for any sequence with these differences
for offset in range(len(rom) - len(target)):
    match = True
    for i, d in enumerate(diffs):
        if rom[offset + i + 1] - rom[offset + i] != d:
            match = False
            break
    if match:
        print(f"Possible match at ${offset:06X}, base byte ${rom[offset]:02X}")
```

### 3. Build the table file (.tbl)

Once you find the encoding, create a `.tbl` mapping file:
```
00=A
01=B
02=C
...
19=Z
1A=a
1B=b
...
F0=\n
FF=[END]
```

### 4. Trace the text engine

In bsnes-plus:
1. Set a **read breakpoint** on a text string address.
2. When it triggers, you are in the text engine. Step through to understand the byte
   dispatch, DTE/MTE expansion, and rendering.
3. Document all control codes.
4. Find the pointer table (trace where the text address was loaded from).

### 5. Extract, translate, reinsert

Use Cartographer (extract) and Atlas (insert) with your `.tbl` file, or write a custom
Python script for full control:

```python
# Extract all strings using pointer table
pointers = []
for i in range(num_strings):
    ptr = struct.unpack_from('<H', rom, ptr_table_offset + i * 2)[0]
    file_offset = lorom_to_file(text_bank, ptr)
    pointers.append(file_offset)

for i, offset in enumerate(pointers):
    text = decode_string(rom, offset, tbl)
    print(f"String {i:03d}: {text}")
```

### 6. Patch pointers and expand ROM

If translated strings are longer:
1. Expand the ROM if needed (pad to next power of 2).
2. Place translated text in the expanded area.
3. Update each pointer in the pointer table.
4. If using 16-bit pointers and the new text crosses bank boundaries, you may need to
   update bank references or switch to 24-bit pointers (requires an ASM patch).

### 7. Create distribution patch

```bash
# Create a BPS patch (preferred, includes checksum verification)
flips --create original.smc translated.smc translation_patch.bps

# Or IPS (simpler, no checksum)
flips --create --ips original.smc translated.smc translation_patch.ips
```

## Debugging tools

| Tool | Use |
|------|-----|
| **bsnes-plus** | Best SNES debugger: CPU trace, breakpoints, VRAM viewer, memory viewer. Essential for text engine RE. |
| **Mesen2** | Cross-platform debugger with SNES support, Lua scripting, strong memory/register views. |
| **asar** | 65816 patch assembler, patches directly into ROM. The standard for SNES hacking. |
| **superfamiconv** | CLI tile/palette/tilemap converter for SNES formats. |
| **ROMs with headers** | Use `python3 -c "import sys; d=open(sys.argv[1],'rb').read(); print('Copier header' if len(d)%0x8000==0x200 else 'No copier header')" game.smc` to check for copier headers. |

## References

- fullsnes (nocash): <https://problemkaputt.de/fullsnes.htm>
- SNESdev Wiki: <https://snes.nesdev.org/wiki/SNESdev_Wiki>
- asar assembler: <https://github.com/RPGHacker/asar>
- bsnes-plus debugger: <https://github.com/devinacker/bsnes-plus>
- Romhacking.net SNES documents section
- Data Crystal (game-specific text engine documentation)
