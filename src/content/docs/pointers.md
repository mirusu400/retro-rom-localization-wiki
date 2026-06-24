---
title: Pointer Tables
description: How retro games reference text strings via pointer tables, and strategies for relocating pointers when translated text changes length.
---

When a retro game displays a text string, the text engine reads bytes starting at an address
stored in a **pointer** — a value in ROM that says "the string lives at address X." When
translation changes the length of strings, these pointers must be updated or the engine will
read garbage. Pointer management is one of the most technically demanding parts of ROM
localization.

## What is a pointer?

A pointer is simply an address stored as data in the ROM. When the text engine needs to
display string #37, it looks up entry #37 in a **pointer table** — a contiguous array of
addresses — and reads text starting at the address it finds.

```
Pointer table at 0x1C000:
  [0]  0x1C100   -> "Hello!"
  [1]  0x1C107   -> "Goodbye."
  [2]  0x1C110   -> "Yes"
  [3]  0x1C114   -> "No"
```

If you translate "Hello!" (6 bytes + terminator = 7 bytes) into a 12-byte string, it
overwrites the start of "Goodbye." — unless you move strings around and update pointers.

## Pointer formats by platform

Different systems store pointers in different formats. The platform's CPU architecture and
memory map determine the format.

### Absolute pointers (GBA, NDS)

On GBA, the ROM is memory-mapped starting at `0x08000000`. A string at ROM file offset
`0x12345` has the CPU address `0x08012345`. Pointers in GBA ROMs are typically 32-bit
little-endian values:

```
File offset 0x4000:  45 23 01 08    -> pointer to 0x08012345 (file offset 0x12345)
```

To convert between pointer value and file offset:
```
file_offset = pointer - 0x08000000
pointer = file_offset + 0x08000000
```

NDS is similar, with ARM9 code/data loaded at addresses specified in the ROM header.

### 16-bit absolute pointers (NES, GB, SNES)

On 8-bit and 16-bit systems, pointers are usually 16-bit (two bytes, little-endian) and refer
to the CPU's address space, not the file offset directly.

**NES example:**
A pointer value of `0x8123` means CPU address `$8123`. The file offset depends on the mapper
and which PRG bank is active. For the simplest case (NROM, no banking), file offset =
CPU address - `0x8000` + header size (16 bytes for iNES).

**GB example:**
A pointer value of `0x4567` means address `$4567` in the current ROM bank. File offset =
(bank_number * `0x4000`) + (pointer - `0x4000`), for banks 1+.

### Banked pointers (NES, SNES, GB)

On banked systems, a 16-bit pointer only covers one bank (typically 16 KB or 32 KB). Text and
its pointer table usually live in the same bank. If they do not, or if you need to move text to
a different bank, you must also store or update the **bank number**.

**SNES** uses 24-bit "long" pointers (`bank:addr`) in some contexts, but most game text uses
16-bit pointers within a known bank. The memory mapping (LoROM vs HiROM) determines how the
bank byte and 16-bit address translate to a file offset:

- **LoROM:** bank `$xx`, addr `$8000`–`$FFFF`. File offset = (bank * `0x8000`) + (addr - `0x8000`).
- **HiROM:** bank `$xx`, addr `$0000`–`$FFFF`. File offset = (bank * `0x10000`) + addr - header offset.

See [SNES platform page](/retro-rom-localization-wiki/platforms/snes/) and
[fullsnes](https://problemkaputt.de/fullsnes.htm) for exact mapping formulas.

### Relative pointers

Some games use pointers relative to the start of the pointer table itself, or relative to the
start of the text block. This saves space (only a 1- or 2-byte offset needed) and avoids bank
issues. A relative pointer of `0x0045` with a base address of `0xC000` points to `0xC045`.

Relative pointers are common in games with tight ROM budgets (NES, GB).

## Detecting pointer tables

Pointer tables are not always obvious. Here are strategies for finding them:

### Back-trace from the text engine

The most reliable method. Once you have found the text engine (see
[Text Engine RE](/retro-rom-localization-wiki/text-engine/)), trace the code that loads the
string address. It will index into a pointer table. The base address of that table and the
index calculation reveal the table's location and format.

### Search for known addresses

If you know a string is at address `$C123` (CPU address on a 16-bit system), search the ROM
for the little-endian bytes `23 C1`. Multiple hits are expected; cross-reference with other
known string addresses to find the table — a cluster of sequential pointer values is the
table.

### Pattern recognition in hex

A pointer table looks like a sequence of similar 2-byte or 4-byte values, incrementing
irregularly. For a GBA text pointer table:

```
00 40 01 08  10 40 01 08  25 40 01 08  38 40 01 08 ...
```

The repeating `08` high byte and slowly incrementing values are a strong signal.

## Strategies for absorbing text-length changes

Translation almost always changes string lengths. Three strategies handle this, from cheapest
to most invasive.

### 1. In-place padding (no pointer change needed)

If the translated string is **shorter** than the original, pad the remainder with spaces or
end-of-string markers. No pointer update needed.

If the string is **longer**, this does not work — you cannot extend a string without
overwriting the next one.

**Use case:** small edits (e.g., changing "Fire" to "Fuego" where there is padding already).

### 2. Pointer recomputation (strings shift within the same bank)

Rewrite all strings contiguously from the start of the text block, then recompute every
pointer in the table. [Atlas](/retro-rom-localization-wiki/tools/#text-extract--insert) does
this automatically: you specify the pointer table location and format, and it writes strings
sequentially and emits corrected pointers.

**Constraints:**
- All strings must fit within the same bank. If the translated text is substantially longer
  than the original, you may exceed the bank boundary.
- Every pointer that references a moved string must be updated — including pointers that are
  not in the main table (e.g., hard-coded addresses in the game's assembly code).

### 3. Relocation to expanded ROM

Move strings to entirely new ROM space (either unused space in the original ROM or appended
space from [ROM expansion](/retro-rom-localization-wiki/encoding-and-fonts/#rom-expansion)).
Update pointers to the new addresses.

**NES:** Add a new PRG bank via mapper expansion. The text engine must be patched to
bank-switch to the new bank. This requires ASM hacking.

**GB/GBC:** Add new ROM banks (update the header ROM-size byte). Bank-switch to load text.

**GBA:** Append data beyond the original ROM end. Pointers are straightforward
(`0x08000000` + file offset), and the address space is flat — no banking.

**SNES:** Similar to NES but with LoROM/HiROM considerations. The internal header's ROM-size
byte must be updated.

## Hard-coded pointers

Not all string references go through a pointer table. Some are **hard-coded** in the game's
assembly — the address is an immediate operand in a `LDA`/`LDR` instruction:

```asm
; NES 6502 example
LDA #$23       ; low byte of string address
STA $00
LDA #$C1       ; high byte
STA $01
JSR print_text
```

These must be found and patched individually. A disassembler (radare2, Ghidra) or trace log
can help identify them. Search for immediate loads of the old address and replace with the
new address.

## Cross-referenced / shared pointers

Some strings are referenced by multiple pointers — for example, a common "Yes/No" string
used in several menus. If you move the string, **all** pointers to it must be updated. Failing
to find one produces a subtle bug that only appears in a specific menu.

Strategy: after finding the pointer table, also search the full ROM for the old address value
to catch stray references.

## Practical workflow with Atlas

[Atlas](/retro-rom-localization-wiki/tools/#text-extract--insert) automates pointer
recomputation. A typical Atlas script specifies:

```
#VAR(Table, TABLE)
#ADDTBL("game.tbl", Table)
#ACTIVETBL(Table)
#JMP($1C000, $1C100)        ; pointer table at $1C000, text block starts at $1C100
#W16($1C000)                 ; write 16-bit pointers

// String 0
Hello!<END>
// String 1
Goodbye.<END>
```

Atlas writes each string sequentially starting at the text-block address and emits a 16-bit
pointer for each string into the pointer table. The `#W16` directive specifies 16-bit
little-endian pointer output; `#W32` is available for GBA-style 32-bit pointers.

## Bank-boundary pitfalls

On banked systems, a string that crosses a bank boundary will be partially in one bank and
partially in the next — but the CPU may not have both banks mapped simultaneously. The text
engine reads garbage for the second half.

**Prevention:** when recomputing pointers, always verify that no string's end address exceeds
the bank size. If it does, move the string to a new bank or split the text block.

## Further reading

- [Text Engine RE](/retro-rom-localization-wiki/text-engine/) — finding the text engine to
  back-trace pointer tables
- [Encoding & Fonts](/retro-rom-localization-wiki/encoding-and-fonts/) — ROM expansion when
  text does not fit
- [Compression](/retro-rom-localization-wiki/compression/) — pointers to compressed blocks
  are especially fragile
- [Tools](/retro-rom-localization-wiki/tools/) — Atlas (pointer-aware inserter), Cartographer
  (pointer-aware dumper)
