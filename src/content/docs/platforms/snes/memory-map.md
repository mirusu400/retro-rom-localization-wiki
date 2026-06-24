---
title: "SNES Memory Map"
description: "SNES LoROM and HiROM memory maps with bank layouts, address conversion formulas, and practical examples for pointer table work in localization."
sidebar:
  order: 3
---

The SNES uses a **24-bit address bus** (bank byte + 16-bit offset), giving a 16 MB address
space. Cartridge ROM, WRAM, VRAM, SRAM, and I/O registers are all mapped into this space.
The two primary mapping modes -- **LoROM** and **HiROM** -- determine how ROM data is laid
out across banks.

For localization, this matters because **pointer values found in ROM are CPU addresses**, not
file offsets. Converting between the two is essential for understanding and patching pointer
tables.

## LoROM (map mode $20 / $30)

In LoROM, each bank maps **32 KB of ROM** into the upper half of the bank ($8000--$FFFF).
The lower half ($0000--$7FFF) contains system resources (WRAM mirror, I/O registers).

### Bank layout

| Banks | $0000--$1FFF | $2000--$20FF | $2100--$21FF | $2200--$5FFF | $6000--$7FFF | $8000--$FFFF |
|-------|-------------|-------------|-------------|-------------|-------------|-------------|
| $00--$3F | WRAM mirror (8 KB) | Unused | PPU I/O | CPU I/O / Expansion | SRAM (if present) or open bus | **ROM** (32 KB per bank) |
| $40--$6F | -- | -- | -- | -- | -- | **ROM** (32 KB per bank) |
| $70--$7D | SRAM | SRAM | SRAM | SRAM | SRAM | **ROM** (32 KB per bank) |
| $7E | **WRAM** (first 8 KB) | -- | -- | -- | -- | **WRAM** (upper portion) |
| $7F | **WRAM** (continued, full 64 KB bank) | | | | | |
| $80--$BF | Mirror of $00--$3F (FastROM region if bit 4 set) | | | | | **ROM** mirror |
| $C0--$FF | -- | -- | -- | -- | -- | **ROM** mirror |

Key points:
- Banks $00--$3F and $80--$BF have ROM at $8000--$FFFF only (32 KB per bank)
- Bank $7E--$7F: 128 KB of WRAM (work RAM), no ROM
- Banks $80--$FF are mirrors of $00--$7F; setting register $420D to 1 enables FastROM speed
  for accesses in banks $80--$FF
- SRAM typically appears at banks $70--$7D at $0000--$7FFF (up to 256 KB addressable), or
  at banks $30--$3F at $6000--$7FFF (8 KB per bank, up to 128 KB)

### LoROM address conversion

**CPU address to ROM file offset:**

```
rom_offset = (bank & 0x7F) * 0x8000 + (addr - 0x8000)
```

Where `bank` is the bank byte and `addr` is the 16-bit offset (must be >= $8000).

**ROM file offset to CPU address:**

```
bank = (rom_offset / 0x8000) & 0x7F
addr = (rom_offset % 0x8000) + 0x8000
cpu_address = (bank << 16) | addr
```

#### Examples

| CPU address | Calculation | ROM file offset |
|-------------|-------------|-----------------|
| $00:8000 | $(00 & 7F) * 8000 + (8000 - 8000)$ | $000000 |
| $00:FFFF | $(00) * 8000 + (FFFF - 8000)$ | $007FFF |
| $01:8000 | $(01) * 8000 + 0$ | $008000 |
| $01:9234 | $(01) * 8000 + (9234 - 8000)$ | $009234 |
| $0F:C000 | $(0F) * 8000 + (C000 - 8000)$ | $07C000 |
| $80:8000 | $(80 & 7F) * 8000 + 0$ = same as $00:8000 | $000000 |

:::note
In LoROM, `$00:8000` and `$80:8000` map to the same ROM byte. Pointers may use either form.
If FastROM is enabled, code typically uses banks $80+ for speed.
:::

## HiROM (map mode $21 / $31)

In HiROM, each bank maps **64 KB of ROM** (the full bank). Banks $40--$7D provide direct,
contiguous ROM access. Banks $00--$3F also have ROM at $8000--$FFFF, but $0000--$7FFF is
occupied by the system area.

### Bank layout

| Banks | $0000--$1FFF | $2000--$20FF | $2100--$21FF | $2200--$5FFF | $6000--$7FFF | $8000--$FFFF |
|-------|-------------|-------------|-------------|-------------|-------------|-------------|
| $00--$3F | WRAM mirror (8 KB) | Unused | PPU I/O | CPU I/O / Expansion | SRAM | **ROM** (upper 32 KB) |
| $40--$7D | **ROM** (full 64 KB per bank) | | | | | |
| $7E--$7F | **WRAM** (128 KB) | | | | | |
| $80--$BF | Mirror of $00--$3F (FastROM) | | | | | **ROM** mirror |
| $C0--$FF | **ROM** (full 64 KB per bank, mirror of $40--$7D) | | | | | |

Key points:
- Banks $40--$7D: ROM fills the entire 64 KB ($0000--$FFFF) -- no system area
- Banks $C0--$FF: FastROM mirror of $40--$7D
- Banks $00--$3F: only $8000--$FFFF has ROM (lower half is system area)
- SRAM at banks $30--$3F, $B0--$BF at $6000--$7FFF (8 KB per bank)

### HiROM address conversion

**CPU address to ROM file offset:**

For banks $40--$7D (or mirror $C0--$FF), where the full 64 KB is ROM:
```
rom_offset = ((bank & 0x3F) * 0x10000) + addr
```

For banks $00--$3F (or mirror $80--$BF), where only $8000--$FFFF is ROM:
```
rom_offset = ((bank & 0x3F) * 0x10000) + addr
```

(The formula is the same because banks $00--$3F map to the same ROM data as $40--$7D offset
by the bank difference -- HiROM is linear.)

**Simplified universal HiROM formula:**
```
rom_offset = ((bank & 0x3F) * 0x10000) + addr
```

**ROM file offset to CPU address:**
```
bank = (rom_offset / 0x10000) + 0xC0    # using FastROM mirror
addr = rom_offset % 0x10000
cpu_address = (bank << 16) | addr
```

Or for the $40--$7D range:
```
bank = (rom_offset / 0x10000) + 0x40
```

#### Examples

| CPU address | Calculation | ROM file offset |
|-------------|-------------|-----------------|
| $40:0000 | $(40 & 3F) * 10000 + 0000$ | $000000 |
| $40:FFFF | $(00) * 10000 + FFFF$ | $00FFFF |
| $41:0000 | $(01) * 10000 + 0000$ | $010000 |
| $00:8000 | $(00) * 10000 + 8000$ | $008000 |
| $C0:0000 | $(C0 & 3F) * 10000 + 0000$ | $000000 |
| $C1:4567 | $(01) * 10000 + 4567$ | $014567 |

## WRAM: 128 KB at $7E:0000--$7F:FFFF

The SNES has 128 KB of work RAM:

| Address range | Content |
|--------------|---------|
| $7E:0000--$7E:1FFF | First 8 KB (mirrored at $00-3F:0000-1FFF and $80-BF:0000-1FFF) |
| $7E:2000--$7E:FFFF | Remaining ~56 KB of first WRAM bank |
| $7F:0000--$7F:FFFF | Second 64 KB WRAM bank |

For localization, WRAM is where:
- Text decompression buffers live
- VWF rendering buffers are composed before DMA to VRAM
- Game variables (including text pointers loaded from ROM) are stored at runtime

## VRAM: 64 KB (word-addressed)

VRAM is **not** directly memory-mapped. It is accessed through PPU registers:

| Register | Purpose |
|----------|---------|
| $2116--$2117 | VRAM address (word address) |
| $2118--$2119 | VRAM data write |
| $2139--$213A | VRAM data read |

VRAM holds both **tile data** (character graphics) and **tilemaps** (the grid that references
tiles). The 64 KB is shared between all backgrounds and sprites. See
[Graphics & Fonts](./graphics/) for how font tiles occupy VRAM.

## ExHiROM (map mode $25 / $35)

ExHiROM extends HiROM to support ROMs larger than 4 MB (up to ~8 MB in theory):

- Banks $C0--$FF: first 4 MB of ROM (same as HiROM)
- Banks $40--$7D: next ~4 MB of ROM
- Banks $00--$3F at $8000--$FFFF: mirrors upper half of banks $40--$7D
- Banks $80--$BF: mirrors of $00--$3F

The address pin A23 is inverted to produce A22, effectively splitting the ROM across two
4 MB halves. The header is at file offset $40FFC0 (bank $40:FFC0 maps to the header
location $00:FFC0 after the inversion).

Only a handful of games use ExHiROM (e.g., _Tales of Phantasia_, _Star Ocean_).

## Special chip mappers

Some SNES games use coprocessors that modify the memory map:

| Chip | Map mode ($FFD5) | Notes |
|------|-----------------|-------|
| **SA-1** | $23 | Has its own 65C816 CPU; remaps banks, adds 2 KB I-RAM at $3000. ROM accessible through SA-1 registers. |
| **SPC7110** | $2A | Data decompression chip; ROM data accessed via port registers. |
| **S-DD1** | $22 | Decompression chip (used by _Star Ocean_). |
| **SuperFX (GSU)** | $20 (LoROM) | GSU has its own memory bus; ROM accessed through GSU cache. |

For localization, special-chip games require understanding how the chip mediates ROM access.
SA-1 games are especially common among Japanese RPGs and require special handling for pointer
tables and text access.

## Practical: working with pointers

### 16-bit pointers (within a single bank)

Many SNES text engines use **16-bit pointers** that reference addresses within the current
data bank. You need to know which bank the data lives in to convert to a file offset.

Example (LoROM, text data in bank $0C):
```
Pointer value: $A345 (little-endian in ROM: 45 A3)
Bank: $0C
CPU address: $0C:A345
ROM offset: (0x0C * 0x8000) + (0xA345 - 0x8000) = 0x60000 + 0x2345 = 0x62345
```

### 24-bit (long) pointers

Some games store full 24-bit pointers as three bytes (address low, address high, bank):

```
ROM bytes: 45 A3 0C  (little-endian: addr=$A345, bank=$0C)
CPU address: $0C:A345
```

### Pointer table patching workflow

1. Find the pointer table in the ROM (often near the text data).
2. Determine the pointer format: 16-bit (need to know the bank) or 24-bit.
3. Identify the mapping mode from the header.
4. Use the conversion formula to translate each pointer to a ROM file offset.
5. Verify by checking that the offset points to the expected text.
6. After inserting translated text (which may change string lengths), recalculate each
   pointer and write the new values back.

### Python conversion functions

```python
def lorom_to_file(bank: int, addr: int) -> int:
    """Convert LoROM CPU address to ROM file offset."""
    return (bank & 0x7F) * 0x8000 + (addr - 0x8000)

def file_to_lorom(offset: int) -> tuple[int, int]:
    """Convert ROM file offset to LoROM CPU address (bank, addr)."""
    bank = (offset // 0x8000) & 0x7F
    addr = (offset % 0x8000) + 0x8000
    return bank, addr

def hirom_to_file(bank: int, addr: int) -> int:
    """Convert HiROM CPU address to ROM file offset."""
    return (bank & 0x3F) * 0x10000 + addr

def file_to_hirom(offset: int) -> tuple[int, int]:
    """Convert ROM file offset to HiROM CPU address (bank, addr)."""
    bank = (offset // 0x10000) + 0xC0
    addr = offset % 0x10000
    return bank, addr
```

## References

- SNESdev Wiki -- Memory map: <https://snes.nesdev.org/wiki/Memory_map>
- fullsnes -- SNES Memory Map chapter: <https://problemkaputt.de/fullsnes.htm>
- SNESdev Wiki -- ROM header (mapping modes): <https://snes.nesdev.org/wiki/ROM_header>
