---
title: "GB/GBC MBC Banking"
description: "Memory Bank Controllers for Game Boy / Game Boy Color: MBC1, MBC3, MBC5 register details, memory map, bank switching mechanics, and ROM expansion techniques for localization."
sidebar:
  order: 3
---

The Game Boy's 16-bit address bus can only address 64 KB at once. Memory Bank
Controllers (MBCs) on the cartridge expand this by mapping switchable ROM and RAM
banks into fixed address windows. Understanding MBC banking is essential for
localization -- it determines how text and font data are addressed, and whether
you can add new banks for translated content.

Reference: [Pan Docs -- MBCs](https://gbdev.io/pandocs/MBCs.html) (CC0)

## Game Boy Memory Map

| Address | Size | Region | Notes |
|---------|------|--------|-------|
| `0x0000`-`0x3FFF` | 16 KB | ROM Bank 0 | Fixed; always the first 16 KB of the ROM |
| `0x4000`-`0x7FFF` | 16 KB | ROM Bank N | Switchable via MBC registers |
| `0x8000`-`0x9FFF` | 8 KB | VRAM | Tile data + tile maps (2 banks on GBC) |
| `0xA000`-`0xBFFF` | 8 KB | External RAM | Cartridge SRAM, switchable if >8 KB |
| `0xC000`-`0xCFFF` | 4 KB | WRAM Bank 0 | Fixed work RAM |
| `0xD000`-`0xDFFF` | 4 KB | WRAM Bank 1-7 | Fixed on DMG; switchable 1-7 on GBC |
| `0xE000`-`0xFDFF` | ~8 KB | Echo RAM | Mirror of `0xC000`-`0xDDFF`; do not use |
| `0xFE00`-`0xFE9F` | 160 bytes | OAM | Sprite attribute table |
| `0xFEA0`-`0xFEFF` | 96 bytes | Unusable | Prohibited by Nintendo |
| `0xFF00`-`0xFF7F` | 128 bytes | I/O Registers | Hardware control registers |
| `0xFF80`-`0xFFFE` | 127 bytes | HRAM | High RAM (fast access, used by `LDH`) |
| `0xFFFF` | 1 byte | IE Register | Interrupt Enable |

### Key point for localization

Text data and font tiles are stored in ROM. When the game reads text, it switches
to the appropriate ROM bank, reads from `0x4000`-`0x7FFF`, and processes the data.
**Pointers in GB games are almost always 16-bit bank-relative addresses** -- they
reference locations within the `0x4000`-`0x7FFF` window, and a separate value (or
implicit context) determines which bank is active.

## ROM Offset Formula

To convert between a ROM file offset and the bank:address pair the CPU sees:

**Bank 0** (`0x0000`-`0x3FFF`):
```
rom_offset = address
```

**Banks 1+** (`0x4000`-`0x7FFF`):
```
rom_offset = (bank_number * 0x4000) + (address - 0x4000)
```

Or equivalently:
```
rom_offset = (bank_number - 1) * 0x4000 + address
```

**Reverse** (ROM offset to bank:address):
```
bank_number = rom_offset / 0x4000          (integer division)
address     = (rom_offset % 0x4000) + 0x4000   (for bank 1+)
            = rom_offset                        (for bank 0)
```

Examples:
| ROM offset | Bank | CPU address |
|-----------|------|-------------|
| `0x0000` | 0 | `0x0000` |
| `0x3FFF` | 0 | `0x3FFF` |
| `0x4000` | 1 | `0x4000` |
| `0x7FFF` | 1 | `0x7FFF` |
| `0x8000` | 2 | `0x4000` |
| `0x10000` | 4 | `0x4000` |
| `0x3C000` | 15 | `0x4000` |

## No MBC (ROM Only)

Cartridge type `0x00`. Maximum 32 KB ROM (two 16 KB "banks" mapped directly into
`0x0000`-`0x7FFF`). No bank switching, no external RAM.

Simplest case for localization -- all data is directly addressable with no banking
concerns. However, 32 KB is extremely tight and rare for text-heavy games. If you
need more space, you must add an MBC (change cartridge type and expand the ROM).

## MBC1

The original and most common MBC for DMG games. Supports up to 2 MB ROM and
32 KB RAM, but has quirks that make it less ideal than MBC5.

### MBC1 Registers

| Address | Register | Bits | Purpose |
|---------|----------|------|---------|
| `0x0000`-`0x1FFF` | RAM Enable | Low nibble | Write `0x0A` to enable; anything else disables |
| `0x2000`-`0x3FFF` | ROM Bank Number | Bits 0-4 | Select ROM bank for `0x4000`-`0x7FFF` (5-bit, 1-31) |
| `0x4000`-`0x5FFF` | RAM Bank / Upper ROM | Bits 0-1 | Dual-purpose: RAM bank OR ROM bits 5-6 |
| `0x6000`-`0x7FFF` | Banking Mode | Bit 0 | 0 = simple mode, 1 = advanced mode |

Registers are **write-only**. You select a bank by writing to the appropriate
address range; reading from these addresses returns ROM data.

### MBC1 Banking Modes

**Mode 0 (Simple, default):**
- `0x0000`-`0x3FFF` is always ROM Bank 0
- `0xA000`-`0xBFFF` is always RAM Bank 0
- The 2-bit register at `0x4000`-`0x5FFF` only affects ROM banking for `0x4000`-`0x7FFF`
- Effective ROM bank = `(upper_2bit << 5) | lower_5bit`

**Mode 1 (Advanced):**
- `0x0000`-`0x3FFF` can be remapped via the upper 2-bit register
- `0xA000`-`0xBFFF` can be switched to RAM banks 0-3
- Used by multi-game compilation carts and games needing >8 KB SRAM

### MBC1 Quirks

**Bank 0 inaccessibility in `0x4000`-`0x7FFF`:** Writing `0x00` to the ROM bank
register is treated as `0x01`. This means banks `0x00`, `0x20`, `0x40`, and `0x60`
cannot be accessed in the switchable window. The 5-bit register maps `0x00` -> `0x01`,
so with upper bits set to `0x01`, you get bank `0x21` instead of `0x20`.

This quirk has caused real localization bugs. If text data sits at the start of
bank `0x20` in ROM, it is inaccessible through the normal MBC1 switchable window
without Mode 1 tricks.

**Localization recommendation:** If working with an MBC1 cartridge and you need
more space, upgrade to MBC5 rather than fighting MBC1's banking modes.

### MBC1 Capacity

| ROM size byte | MBC1 max ROM | Banks |
|---------------|-------------|-------|
| `0x00`-`0x04` | 32 KB - 512 KB | 2-32 |
| `0x05` | 1 MB | 64 |
| `0x06` | 2 MB | 128 (with upper bits) |

RAM: up to 32 KB (4 banks of 8 KB) with Mode 1.

## MBC3

Common in late DMG and early GBC games (e.g., Pokemon Gold/Silver/Crystal). Supports
up to 2 MB ROM and 32 KB RAM. Optionally includes a Real Time Clock (RTC).

### MBC3 Registers

| Address | Register | Bits | Purpose |
|---------|----------|------|---------|
| `0x0000`-`0x1FFF` | RAM/Timer Enable | Any | Write `0x0A` to enable; `0x00` to disable |
| `0x2000`-`0x3FFF` | ROM Bank Number |7 bits | Select bank `0x01`-`0x7F` (writing 0 -> 1) |
| `0x4000`-`0x5FFF` | RAM Bank / RTC Select | Low nibble | `0x00`-`0x03` = RAM bank; `0x08`-`0x0C` = RTC register |
| `0x6000`-`0x7FFF` | Latch Clock | Any | Write `0x00` then `0x01` to latch RTC |

### MBC3 Advantages over MBC1

- Full 7-bit ROM bank register: banks `0x01`-`0x7F` are all directly accessible
  (no inaccessible banks like MBC1's `0x20`, `0x40`, `0x60` problem)
- Simpler banking model: no dual-mode confusion
- RTC support (irrelevant for localization but means you cannot freely swap to MBC5
  if the game uses the clock)

### MBC3 RTC Registers

When `0x08`-`0x0C` is written to the RAM bank register, reading/writing
`0xA000`-`0xBFFF` accesses RTC registers instead of RAM:

| Value | Register | Range |
|-------|----------|-------|
| `0x08` | Seconds | 0-59 |
| `0x09` | Minutes | 0-59 |
| `0x0A` | Hours | 0-23 |
| `0x0B` | Day counter (low 8 bits) | 0x00-0xFF |
| `0x0C` | Day counter high / flags | Bit 0: day MSB, Bit 6: halt, Bit 7: day carry |

**Localization note:** If the game uses the RTC, you generally must keep MBC3.
Upgrading to MBC5 would break time-based features (day/night cycles, berry growth,
etc.) unless you patch the RTC code out.

## MBC5

The most common MBC for GBC games and the **recommended target for ROM expansion**.
Supports up to 8 MB ROM and 128 KB RAM. Simple register layout with no quirks.

### MBC5 Registers

| Address | Register | Bits | Purpose |
|---------|----------|------|---------|
| `0x0000`-`0x1FFF` | RAM Enable | Any | Write `0x0A` to enable |
| `0x2000`-`0x2FFF` | ROM Bank Low | 8 bits | Low 8 bits of bank number |
| `0x3000`-`0x3FFF` | ROM Bank High | 1 bit | Bit 8 of bank number (9th bit) |
| `0x4000`-`0x5FFF` | RAM Bank | 4 bits | Select RAM bank `0x00`-`0x0F` |

### MBC5 Key Differences from MBC1/MBC3

1. **Writing 0 gives bank 0:** Unlike MBC1 and MBC3 (which remap 0 -> 1), MBC5
   correctly maps bank 0 when 0 is written. This means bank 0 is accessible in
   both `0x0000`-`0x3FFF` (always) and `0x4000`-`0x7FFF` (when bank 0 is selected).

2. **9-bit bank number:** Two registers combine for a 9-bit bank number
   (`0x000`-`0x1FF`), allowing up to 512 banks = 8 MB.

3. **No banking mode quirks:** No Mode 0/Mode 1 confusion like MBC1.

4. **GBC Double Speed compatible:** MBC5 is "the only MBC guaranteed by Nintendo
   to support the tighter timing of CGB Double Speed Mode." MBC1/MBC3 may have
   timing issues in double-speed mode, though most work in practice.

5. **Rumble support:** Cartridge types `0x1C`-`0x1E` include a rumble motor. In these
   variants, bit 3 of the RAM bank register controls the rumble motor instead of
   being part of the bank number (limiting RAM to 8 banks = 64 KB).

### MBC5 ROM Bank Selection Example

To switch to ROM bank `0x42` (decimal 66):

```asm
; Write low 8 bits of bank number
ld a, $42
ld [$2000], a    ; ROM Bank Low = 0x42

; Write high bit (bit 8) -- 0 in this case
xor a            ; a = 0
ld [$3000], a    ; ROM Bank High = 0
```

To switch to bank `0x100` (decimal 256):

```asm
ld a, $00
ld [$2000], a    ; ROM Bank Low = 0x00

ld a, $01
ld [$3000], a    ; ROM Bank High = 1
; Effective bank = (1 << 8) | 0x00 = 0x100
```

### MBC5 Capacity

| ROM banks | ROM size | ROM size byte |
|-----------|----------|---------------|
| 2 | 32 KB | `0x00` |
| 4 | 64 KB | `0x01` |
| 8 | 128 KB | `0x02` |
| 16 | 256 KB | `0x03` |
| 32 | 512 KB | `0x04` |
| 64 | 1 MB | `0x05` |
| 128 | 2 MB | `0x06` |
| 256 | 4 MB | `0x07` |
| 512 | 8 MB | `0x08` |

RAM: up to 128 KB (16 banks of 8 KB) or 64 KB (8 banks) with rumble variants.

## How Banking Affects Localization

### Finding text data

When you find text at a ROM file offset, convert it to a bank:address pair:

```python
def rom_offset_to_bank(offset):
    bank = offset // 0x4000
    if bank == 0:
        address = offset
    else:
        address = (offset % 0x4000) + 0x4000
    return bank, address

# Example: text found at ROM offset 0x1A3C0
bank, addr = rom_offset_to_bank(0x1A3C0)
# bank = 6, addr = 0x63C0
```

### Understanding pointer tables

GB pointers are typically 16-bit values in the range `0x4000`-`0x7FFF`, relative to
the current bank. A pointer table entry of `0x63C0` means "offset `0x63C0` within
whatever bank the game has switched to." The bank number is either:

- Hardcoded in the game's code (e.g., `ld a, 6 / ld [$2000], a` before reading text)
- Stored alongside the pointer (bank:pointer pair, 3 bytes total)
- Implicit from program context

When tracing text references in a debugger, set a breakpoint on MBC register writes
(`0x2000`-`0x3FFF`) to see which bank the game switches to before reading text.

### Adding new banks for translated content

The general ROM expansion workflow:

1. **Identify current ROM size** from header byte `0x0148`
2. **Choose new size** -- typically double the current size, or pick a size that
   gives enough free banks
3. **Pad the ROM** with `0xFF` to the new size
4. **Update the header:**
   - `0x0147`: Upgrade MBC type if needed (e.g., MBC1 -> MBC5)
   - `0x0148`: New ROM size code
   - `0x014D`: Recompute header checksum
   - `0x014E`-`0x014F`: Recompute global checksum
5. **Write translated text** into the new banks
6. **Patch the game code** to switch to the new bank and read from the new addresses

### MBC upgrade pattern

The safest upgrade path for localization:

| Original | Upgrade to | Change at `0x0147` |
|----------|------------|-------------------|
| ROM ONLY (`0x00`) | MBC5 (`0x19`) | `0x00` -> `0x19` |
| MBC1 (`0x01`) | MBC5 (`0x19`) | `0x01` -> `0x19` |
| MBC1+RAM (`0x02`) | MBC5+RAM (`0x1A`) | `0x02` -> `0x1A` |
| MBC1+RAM+BAT (`0x03`) | MBC5+RAM+BAT (`0x1B`) | `0x03` -> `0x1B` |
| MBC3 (`0x11`) | MBC5 (`0x19`) | `0x11` -> `0x19` |
| MBC3+RAM (`0x12`) | MBC5+RAM (`0x1A`) | `0x12` -> `0x1A` |
| MBC3+RAM+BAT (`0x13`) | MBC5+RAM+BAT (`0x1B`) | `0x13` -> `0x1B` |

**Do not upgrade MBC3+TIMER variants** (`0x0F`, `0x10`) to MBC5 unless you also
patch out the RTC code.

### Bank boundary considerations

When inserting translated text, be careful not to cross the `0x4000`-`0x7FFF`
boundary within a single string. The CPU will not automatically switch to the next
bank when the address wraps from `0x7FFF` to `0x4000`. Each string (or at minimum
each text-engine read) must fit within a single 16 KB bank.

If translated strings are significantly longer than the originals (common when
translating from Japanese to alphabetic scripts, or vice versa), you may need to:
- Spread strings across multiple banks with bank-switching code
- Use a more efficient encoding (DTE/MTE) for the target language
- Compress the translated text

## Practical Example: Tracing Bank Switches in mGBA

Using mGBA's debugger to find which bank contains text:

1. Open the ROM in mGBA with the debugger
2. Set a write watchpoint on `0x2000` (MBC ROM bank register):
   ```
   watch/w 0x2000
   ```
3. Trigger text display in the game
4. The debugger breaks when the game writes to `0x2000` -- the value written is
   the bank number
5. Once you know the bank, use the ROM offset formula to find the text in the
   ROM file

In SameBoy, use the memory viewer to watch VRAM tile updates and trace back to
the ROM bank that supplied the tile indices.
