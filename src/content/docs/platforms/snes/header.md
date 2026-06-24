---
title: "SNES ROM Header"
description: "Complete SNES internal ROM header format: field offsets, map mode, chipset types, checksum calculation, and interrupt vectors for LoROM and HiROM."
sidebar:
  order: 2
---

Every SNES ROM contains an **internal header** that identifies the game, its memory mapping
mode, ROM/RAM sizes, region, and interrupt vectors. Understanding this header is the first
step in any localization project: it tells you the mapping mode (which determines how CPU
addresses convert to file offsets) and whether the ROM uses special chips.

## Header location

The header occupies CPU addresses $FFB0--$FFFF (or equivalently $7FB0--$7FFF in LoROM file
addressing). The location in the **ROM file** depends on the mapping mode:

| Mapping | CPU address | ROM file offset | With 512-byte copier header |
|---------|-------------|-----------------|----------------------------|
| **LoROM** | $00:FFC0 | $007FC0 | $0081C0 |
| **HiROM** | $00:FFC0 | $00FFC0 | $0101C0 |
| **ExHiROM** | $00:FFC0 | $40FFC0 | $4101C0 |

:::note
Some ROM dumps include a 512-byte ($200) **copier header** prepended by backup devices
(Super Magicom, etc.). If the file size modulo $8000 equals $200, strip or account for this
offset. Modern tools and emulators usually handle this automatically.
:::

## Main header fields ($xFC0--$xFDF)

All offsets below are relative to the header base (CPU $FFC0, file $7FC0 for LoROM or
$FFC0 for HiROM). The header is 32 bytes ($20).

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| $00 | 21 | **Internal ROM Name** | ASCII ($20--$7E), padded with spaces ($20). Max 21 characters. |
| $15 | 1 | **Map Mode / Speed** | Bit format: `001smmmm`. See below. |
| $16 | 1 | **Chipset** | ROM + coprocessor configuration. See below. |
| $17 | 1 | **ROM Size** | Power of 2: actual size = `1 << N` kilobytes. $09 = 512 KB, $0A = 1 MB, $0B = 2 MB, $0C = 4 MB. |
| $18 | 1 | **RAM Size** | Power of 2: `1 << N` kilobytes. $00 = no RAM, $01 = 2 KB, $03 = 8 KB, $05 = 32 KB. |
| $19 | 1 | **Destination Code** | Region / video standard. See below. |
| $1A | 1 | **Developer ID (old)** | Licensee code. If $33, an extended header is present at $FFB0. |
| $1B | 1 | **ROM Version** | Revision number. $00 = initial release, $01 = rev 1, etc. |
| $1C | 2 | **Checksum Complement** | `checksum XOR $FFFF` (little-endian). |
| $1E | 2 | **Checksum** | 16-bit sum of all ROM bytes (little-endian). See calculation below. |

### Map mode byte ($FFD5) -- bit layout

```
  Bit 7-6: Always 0,0
  Bit 5:   Always 1
  Bit 4:   Speed flag (0 = SlowROM 2.68 MHz, 1 = FastROM 3.58 MHz)
  Bit 3-0: Map mode
```

| Value (low nibble) | Mapping |
|---------------------|---------|
| $0 | **LoROM** (32 KB banks) |
| $1 | **HiROM** (64 KB banks) |
| $2 | S-DD1 |
| $3 | SA-1 |
| $5 | ExHiROM (>4 MB) |
| $A | SPC7110 |

Common combined values:

| Byte | Meaning |
|------|---------|
| $20 | LoROM, SlowROM |
| $21 | HiROM, SlowROM |
| $30 | LoROM, FastROM |
| $31 | HiROM, FastROM |
| $35 | ExHiROM, FastROM |

### Chipset byte ($FFD6)

The chipset byte encodes both the coprocessor type and whether external RAM/battery is
present:

**Upper nibble -- coprocessor type:**

| Upper nibble | Coprocessor |
|-------------|-------------|
| $0x | DSP (DSP-1, DSP-2, DSP-3, DSP-4) |
| $1x | GSU (SuperFX) |
| $2x | OBC1 |
| $3x | SA-1 |
| $4x | S-DD1 |
| $5x | S-RTC |
| $Ex | Other (Game Boy / Satellaview) |
| $Fx | Custom |

**Lower nibble -- ROM/RAM/battery configuration:**

| Lower nibble | Configuration |
|-------------|---------------|
| $0 | ROM only |
| $1 | ROM + RAM |
| $2 | ROM + RAM + Battery |
| $3 | Coprocessor only |
| $4 | Coprocessor + RAM |
| $5 | Coprocessor + RAM + Battery |
| $6 | Coprocessor + Battery |

Common examples:

| Byte | Meaning |
|------|---------|
| $00 | ROM only (no SRAM, no coprocessor) |
| $01 | ROM + SRAM |
| $02 | ROM + SRAM + Battery (most RPGs with save files) |
| $13 | SuperFX (coprocessor only) |
| $15 | SuperFX + RAM + Battery |
| $35 | SA-1 + RAM + Battery |

### Destination / region code ($FFD9)

| Code | Region | Video |
|------|--------|-------|
| $00 | Japan | NTSC |
| $01 | North America | NTSC |
| $02 | Europe | PAL |
| $03 | Scandinavia | PAL |
| $06 | France | SECAM/PAL |
| $07 | Netherlands | PAL |
| $08 | Spain | PAL |
| $09 | Germany | PAL |
| $0A | Italy | PAL |
| $0B | China | NTSC |
| $0D | Korea | NTSC |
| $0E | International | varies |
| $0F | Canada | NTSC |
| $10 | Brazil | PAL-M |
| $11 | Australia | PAL |

## Extended header ($xFB0--$xFBF)

Present when the **Developer ID** byte at $FFDA equals $33. This 16-byte block sits
immediately before the main header.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| $FFB0 | 2 | **Maker Code** | Two uppercase ASCII characters (e.g., "01" = Nintendo) |
| $FFB2 | 4 | **Game Code** | Four uppercase ASCII characters (unique game ID) |
| $FFB6 | 6 | *Reserved* | Should be zero-filled |
| $FFBC | 1 | **Expansion Flash Size** | Power-of-2 encoding |
| $FFBD | 1 | **Expansion RAM Size** | $00=none, $01=16Kbit, $03=64Kbit, $05=256Kbit, $06=512Kbit, $07=1Mbit |
| $FFBE | 1 | **Special Version** | Special release flags |
| $FFBF | 1 | **Chipset Subtype** | Further specifies the coprocessor (e.g., DSP-1 vs DSP-4) |

## Interrupt vectors ($xFE0--$xFFF)

The 65816 has two sets of interrupt vectors: **native mode** (16-bit mode) and **emulation
mode** (6502 compatibility mode). Each vector is a 16-bit address (little-endian).

### Native mode vectors ($FFE0--$FFEF)

| Offset | Vector |
|--------|--------|
| $FFE0 | *unused* |
| $FFE2 | *unused* |
| $FFE4 | **COP** (co-processor interrupt) |
| $FFE6 | **BRK** (software break) |
| $FFE8 | **ABORT** (not used on SNES) |
| $FFEA | **NMI** (non-maskable interrupt -- VBlank) |
| $FFEC | *unused* |
| $FFEE | **IRQ** (maskable interrupt) |

### Emulation mode vectors ($FFF0--$FFFF)

| Offset | Vector |
|--------|--------|
| $FFF0 | *unused* |
| $FFF2 | *unused* |
| $FFF4 | **COP** |
| $FFF6 | *unused* |
| $FFF8 | **ABORT** |
| $FFFA | **NMI** |
| $FFFC | **RESET** (entry point -- execution starts here) |
| $FFFE | **IRQ / BRK** |

:::tip[For localization]
The **RESET** vector at $FFFC (emulation mode) is the game's entry point. The **NMI** vector
at $FFEA (native mode) points to the VBlank handler, which is where DMA transfers to VRAM
happen -- this is relevant if you need to hook VBlank for VWF rendering.
:::

## Checksum calculation

The SNES checksum is a simple 16-bit sum of every byte in the ROM:

1. Pad the ROM to a power-of-2 size (if it is not already).
2. Set the checksum field ($FFDE--$FFDF) to $0000 and the complement field ($FFDC--$FFDD)
   to $FFFF.
3. Sum all bytes in the ROM as unsigned 16-bit addition (carry wraps around).
4. Store the result at $FFDE--$FFDF (little-endian).
5. Store `$FFFF - checksum` at $FFDC--$FFDD.

After correct calculation: `checksum + complement == $FFFF`.

:::caution
If you expand the ROM (e.g., from 1 MB to 2 MB), you must **recalculate the checksum** and
update the **ROM size** byte at $FFD7. Emulators will often run with a bad checksum, but some
games check it at boot, and a correct checksum is good practice for distribution patches.
:::

### Checksum recalculation example (Python)

```python
def fix_snes_checksum(rom: bytearray, header_offset: int):
    """Recalculate and patch the SNES internal checksum.
    
    header_offset: $7FC0 for LoROM, $FFC0 for HiROM.
    """
    # Clear checksum fields
    rom[header_offset + 0x1C] = 0xFF  # complement low
    rom[header_offset + 0x1D] = 0xFF  # complement high
    rom[header_offset + 0x1E] = 0x00  # checksum low
    rom[header_offset + 0x1F] = 0x00  # checksum high
    
    # Sum all bytes
    checksum = sum(rom) & 0xFFFF
    complement = checksum ^ 0xFFFF
    
    # Write back (little-endian)
    rom[header_offset + 0x1C] = complement & 0xFF
    rom[header_offset + 0x1D] = (complement >> 8) & 0xFF
    rom[header_offset + 0x1E] = checksum & 0xFF
    rom[header_offset + 0x1F] = (checksum >> 8) & 0xFF
```

## Practical: reading the header with a hex editor

For a LoROM game, open the ROM in a hex editor and navigate to offset $7FC0:

```
Offset   00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19 1A 1B 1C 1D 1E 1F
$7FC0:   47 41 4D 45 20 4E 41 4D 45 20 20 20 20 20 20 20 20 20 20 20 20 20 02 0A 03 00 33 00 XX XX YY YY
         G  A  M  E     N  A  M  E  (spaces to 21 bytes)                    |  |  |  |  |  |  comp  chksum
                                                                             |  |  |  |  |  version
                                                                             |  |  |  |  dev ID ($33=ext)
                                                                             |  |  |  region
                                                                             |  |  RAM size
                                                                             |  ROM size ($0A=1MB)
                                                                             chipset ($02=ROM+SRAM+Bat)
                                                                        map mode ($20=LoROM)
```

## References

- SNESdev Wiki -- ROM header: <https://snes.nesdev.org/wiki/ROM_header>
- fullsnes -- SNES Cart chapter: <https://problemkaputt.de/fullsnes.htm>
- Anomie's register doc (header fields)
