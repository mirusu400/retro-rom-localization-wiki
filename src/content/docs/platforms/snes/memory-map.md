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
| **SA-1** | $23 | Has its own 65C816 CPU; remaps banks, adds 2 KB I-RAM and up to 256 KB BW-RAM. |
| **SPC7110** | $2A | Data decompression chip; ROM data accessed via port registers. |
| **S-DD1** | $22 | Decompression chip (entropy coding); intercepts DMA to decompress on-the-fly. |
| **SuperFX (GSU)** | $20 (LoROM) | GSU has its own memory bus; ROM accessed through GSU 512-byte cache. |

For localization, special-chip games require understanding how the chip mediates ROM access.
SA-1 games are especially common among Japanese RPGs and require special handling for pointer
tables and text access.

### SA-1

The SA-1 is a second 65C816 CPU clocked at ~10.74 MHz (roughly 4x the base SNES CPU speed).
It shares access to ROM, and adds two dedicated RAM regions: **I-RAM** (2 KB) and **BW-RAM**
(up to 256 KB, optionally battery-backed). The SA-1 is identified by ROM header bytes at
offset $007FD5/$007FD6 = `$23, $34` or `$23, $35`.

Notable SA-1 games relevant to localization: _Super Mario RPG_, _Kirby Super Star_,
_Kirby's Dream Land 3_, _Dragon Ball Z: Hyper Dimension_, _Marvelous: Mouhitotsu no
Takarajima_, _Jikkyo Oshaberi Parodius_.

#### SA-1 memory map (SNES CPU side)

The SA-1's Super MMC decoder remaps the standard LoROM layout. From the **SNES CPU's**
perspective, banks $00--$3F (and mirrors $80--$BF) are laid out as follows:

| Address range | Content |
|---------------|---------|
| $0000--$1FFF | WRAM mirror (8 KB, standard) |
| $2100--$21FF | PPU I/O (standard) |
| $2200--$22FF | **SA-1 MMIO registers** (inter-CPU communication, bank control) |
| $2300--$2FFF | SA-1 status / Address Bus A |
| **$3000--$37FF** | **I-RAM** (2 KB, shared between both CPUs) |
| $4000--$43FF | CPU I/O registers (standard) |
| **$6000--$7FFF** | **BW-RAM** (8 KB window, bank-switched via register $2224) |
| $8000--$FFFF | **ROM** (bank-switched via registers $2220--$2223) |

Banks $40--$4F map ROM across the full 64 KB per bank (similar to HiROM). Banks $60--$6F
can map BW-RAM in 128 KB blocks (controlled by register $2225 with S=1).

#### ROM bank registers ($2220--$2223)

Four write-only registers control which 1 MB ROM area is visible in each bank group.
Each register has the format `B----AAA`:

| Register | Bank range (SNES CPU) | Mirror range |
|----------|-----------------------|-------------|
| $2220 (CXB) | $00--$1F:$8000--$FFFF | $C0--$CF:$0000--$FFFF |
| $2221 (DXB) | $20--$3F:$8000--$FFFF | $D0--$DF:$0000--$FFFF |
| $2222 (EXB) | $80--$9F:$8000--$FFFF | $E0--$EF:$0000--$FFFF |
| $2223 (FXB) | $A0--$BF:$8000--$FFFF | $F0--$FF:$0000--$FFFF |

- **AAA** (bits 0--2): selects which 1 MB ROM page to map (0--7, supporting up to 8 MB).
- **B** (bit 7): bank projection mode. When B=0, the standard mapping applies and the
  mirror range (e.g., $C0--$CF) also maps the selected ROM area as full 64 KB banks.
  When B=1, the upper mirror range maps the selected area with a different offset
  calculation.

This means a single SA-1 ROM can be up to 8 MB, and the game dynamically switches which
1 MB slice is visible to each bank group.

#### I-RAM (2 KB)

I-RAM appears at **$3000--$37FF** from the SNES CPU side and at **$0000--$07FF** from the
SA-1 CPU side (with a mirror at $3000--$37FF). Both CPUs can read and write I-RAM, but
concurrent access causes a bus collision penalty.

Write protection is controlled per 256-byte block:
- Register $2229: protects I-RAM from **SA-1** writes (bit 0 = $3000--$30FF, ... bit 7 = $3700--$37FF).
- Register $222A: protects I-RAM from **SNES CPU** writes (same bit layout).

I-RAM is commonly used as a communication mailbox between the two CPUs and for small,
frequently-accessed data buffers.

#### BW-RAM (up to 256 KB)

BW-RAM (Bitmap / Work RAM) is the SA-1 cartridge's main work area. It appears as an 8 KB
window at **$6000--$7FFF** in banks $00--$3F and $80--$BF, bank-switched via register $2224
(format `---BBBBB`, selecting one of 32 x 8 KB pages). The SA-1 CPU can also see BW-RAM at
banks $60--$6F as a contiguous 128 KB area when register $2225 bit 7 (S) is set.

Write protection:
- Register $2226 (bit 7): protects BW-RAM from SNES CPU writes (0 = protected, 1 = writable).
- Register $2227 (bit 7): protects BW-RAM from SA-1 writes.

Games typically use BW-RAM for save data, large buffers (decompressed text, VWF rendering
scratch), and the SA-1's character-conversion DMA output (bitmap-to-tile conversion).

#### Bus conflict avoidance

Both CPUs share access to ROM, I-RAM, and BW-RAM. The SA-1 hardware arbitrates simultaneous
accesses, but each collision incurs a **wait-state penalty** that stalls the slower accessor.
The three collision types and their avoidance strategies:

| Collision | Both CPUs accessing... | Avoidance |
|-----------|----------------------|-----------|
| ROM--ROM | ROM simultaneously | Run SNES CPU code from WRAM or BW-RAM while SA-1 reads ROM. |
| BW-RAM--BW-RAM | BW-RAM simultaneously | Run SNES CPU code from WRAM, I-RAM, or ROM; access only WRAM/ROM/I-RAM. |
| I-RAM--I-RAM | I-RAM simultaneously | Run SNES CPU code from BW-RAM, ROM, or WRAM. |

The recommended pattern is to have the **SNES CPU** sit in a `WAI`/`JMP` loop in WRAM
(sleeping until an interrupt fires), acting as an event-driven "script processor" for PPU
updates and animation. The **SA-1** handles the heavy lifting (game logic, decompression,
text engine) from ROM at 4x speed. The SA-1 provides configurable interrupt vectors
($2205--$2208, $220C--$220F) that override the ROM vectors, enabling this model.

#### Localization implications (SA-1)

- **Pointer tables**: SA-1 games use the remapped bank layout. A pointer value like
  `$C0:1234` maps to ROM page 0 via the CXB register. You must know the current bank
  register state to convert SA-1 CPU addresses to file offsets.
- **Text in BW-RAM**: some SA-1 games decompress text into BW-RAM before display. Tracing
  the text requires checking both ROM reads and BW-RAM buffers.
- **SA-1 character conversion DMA** ($2230--$2237): this hardware feature converts
  bitmap-format graphics to SNES tiled format, which some games use for font rendering.
  The source/destination can be ROM, BW-RAM, or I-RAM.

([SA-1 overview -- Super Famicom Development Wiki](https://wiki.superfamicom.org/sa-1),
[SA-1 registers](https://wiki.superfamicom.org/sa-1-registers))

### S-DD1

The S-DD1 is a real-time decompression coprocessor using an **adaptive binary arithmetic
coding** algorithm (described as a "low-end ABS implementation"). Only two released games
use it: **_Star Ocean_** and **_Street Fighter Alpha 2_** (_SFA2_). Both are ExHiROM
(map mode $22/$32).

#### How it works

The S-DD1 **intercepts DMA transfers** from ROM. When the SNES CPU initiates a DMA whose
source address falls within the S-DD1-managed ROM banks, the chip transparently decompresses
the data before it reaches the destination (usually VRAM). The game code itself does not
explicitly call a decompression routine -- it simply sets up a standard DMA to VRAM, and the
S-DD1 handles the rest in hardware.

The compressed data stream begins with a **4-bit header** that selects one of 16 context
models. These models are designed to exploit the structure of SNES 8x8 tiles (especially
4bpp graphics, the dominant format in _Star Ocean_). When decompressing each bit, the chip
predicts the most probable symbol (MPS, 0 or 1) and its probability, then reads the
arithmetic-coded bitstream accordingly.

- Theoretical maximum compression ratio: 128:1.
- Worst-case ratio with a fixed header: approximately 2:3 (expansion rather than compression).

#### Registers

The S-DD1 maps registers at $4800--$4807 in banks $00/$80. The key registers enable or
disable decompression for specific DMA channels:

| Register | Purpose |
|----------|---------|
| $4800--$4801 | S-DD1 enable / status |
| $4804--$4807 | DMA channel intercept enable (one register per pair of channels) |

When a DMA channel is flagged for intercept, any transfer from ROM on that channel is
decompressed by the S-DD1 before reaching the destination.

#### Localization implications (S-DD1)

_Star Ocean_ compresses nearly all its graphics data through the S-DD1. If you need to
modify graphics (e.g., insert a new font), you must either:

1. **Decompress** the original data, modify it, and **recompress** using an S-DD1-compatible
   compressor (a C++ compressor/decompressor is available on the
   [Super Famicom Development Wiki](https://wiki.superfamicom.org/s-dd1)).
2. Store the modified data **uncompressed** in expanded ROM and patch the DMA setup to bypass
   the S-DD1 intercept for those transfers.

Text strings themselves are typically stored uncompressed in these games; only bulk graphics
data passes through the S-DD1.

([S-DD1 -- Super Famicom Development Wiki](https://wiki.superfamicom.org/s-dd1))

### SPC7110

The SPC7110 is a data decompression and memory-mapping coprocessor used by three Super
Famicom games: **_Tengai Makyou Zero_** (_Far East of Eden Zero_), **_Momotarou Densetsu
Happy_**, and **_Super Power League 4_**. These games have unusually large data ROMs --
_Tengai Makyou Zero_ has an 8 MB program ROM plus a 32 MB data ROM (40 MB total).

#### Memory map

The SPC7110 splits ROM into two chips:

| Chip | Content | Banks (SNES CPU side) |
|------|---------|----------------------|
| **U1** (program ROM) | Code + uncompressed data, up to 1 MB | $00--$0F / $80--$8F at $8000--$FFFF; $C0--$CF:$0000--$FFFF |
| **U2** (data ROM) | Compressed data, up to 32 MB | Accessed **only** through SPC7110 port registers |

The U2 data ROM has no direct CPU address mapping. Its address and data bus are wired
exclusively to the SPC7110 -- the only way to read U2 data is through the chip's
decompression port.

SRAM (up to 8 KB) is mapped at $00--$3F:$6000--$7FFF.

#### Decompression registers ($4800--$480B)

| Register | Purpose |
|----------|---------|
| **$4800** | Decompressed data read port -- returns one decompressed byte from virtual bank $50 and decrements the length counter |
| $4801--$4803 | Compressed data table pointer (24-bit: low, high, bank) |
| $4804 | Compressed data table index (selects a 32-bit pointer within the table, big-endian) |
| $4805--$4806 | Decompressed data offset within bank $50 (16-bit) |
| $4807 | DMA channel assignment for decompression |
| $4809--$480A | Length counter (16-bit, decremented on each $4800 read) |

The decompression workflow:

1. Write the compressed data table base address to $4801--$4803.
2. Write the table index to $4804 (selects which compressed block to decompress).
3. Write the destination offset to $4805--$4806.
4. Read decompressed bytes sequentially from **$4800**, or set up a DMA channel (identified
   in $4807) to transfer them to VRAM automatically.

The decompressed data appears in a virtual bank at **$50:0000--$50:FFFF**.

#### Board variants

| Board | Games | RTC |
|-------|-------|-----|
| SHVC-LDH3C-01 | _Tengai Makyou Zero_ | Yes (real-time clock) |
| SHVC-BDH3B-01 | _Super Power League 4_, _Momotarou Densetsu Happy_ | No |

_Tengai Makyou Zero_ is the only SPC7110 game with a battery-backed RTC, which drives
in-game events tied to real calendar dates.

#### Localization implications (SPC7110)

- Graphics, map data, and other large assets are stored compressed in the U2 data ROM.
  Modifying them requires understanding the compression table structure and either
  recompressing modified data or patching the table to point to uncompressed replacements.
- Text strings may be in either the program ROM (U1, directly addressable) or the data ROM
  (U2, accessed through the SPC7110 port). Check which ROM chip holds the text before
  planning your extraction workflow.
- The decompression algorithm was fully reverse-engineered in 2008. Open-source
  decompressors exist, but recompression tooling is less mature than for LZ77/Huffman.

([SPC7110 -- Super Famicom Development Wiki](https://wiki.superfamicom.org/spc7110))

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
