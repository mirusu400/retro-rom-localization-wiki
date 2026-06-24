---
title: "NES ROM Header (iNES / NES 2.0)"
description: "Complete iNES and NES 2.0 header format for NES ROMs: byte-by-byte layout, flag bits, ROM size calculation, and which fields matter for localization."
sidebar:
  order: 2
---

Every NES ROM image begins with a 16-byte header that describes the cartridge's
hardware configuration. Two header formats exist: the original **iNES** (1996) and
the backwards-compatible **NES 2.0** extension. Emulators and ROM tools use this
header to configure mapper emulation, memory sizes, and mirroring.

For localization work the header tells you three critical things:

1. **CHR-ROM size** (byte 5) --- `$00` means CHR-RAM, which allows runtime font loading.
2. **Mapper number** (bytes 6--7, extended in NES 2.0 byte 8) --- determines banking.
3. **PRG-ROM size** (byte 4) --- needed to calculate file offsets and plan ROM expansion.

## iNES header (16 bytes)

| Offset | Size | Field | Description |
|---|---|---|---|
| `$00`--`$03` | 4 B | Magic | ASCII `NES` followed by MS-DOS EOF (`$1A`): bytes `$4E $45 $53 $1A` |
| `$04` | 1 B | PRG ROM size | Number of 16 KB PRG-ROM banks |
| `$05` | 1 B | CHR ROM size | Number of 8 KB CHR-ROM banks. **`$00` = uses CHR-RAM** |
| `$06` | 1 B | Flags 6 | Mapper low nibble, mirroring, battery, trainer |
| `$07` | 1 B | Flags 7 | Mapper high nibble, console type, NES 2.0 identifier |
| `$08` | 1 B | Flags 8 | PRG-RAM size in 8 KB units (0 infers 8 KB for compatibility) |
| `$09` | 1 B | Flags 9 | TV system |
| `$0A` | 1 B | Flags 10 | TV system, PRG-RAM presence (unofficial, rarely used) |
| `$0B`--`$0F` | 5 B | Padding | Should be all zeros |

### Flags 6 (byte `$06`) -- bit layout

```
7       0
---------
NNNN FTBM

M : Nametable mirroring
    0 = vertical (horizontal arrangement)
    1 = horizontal (vertical arrangement)
B : 1 = Battery-backed PRG-RAM (or other persistent memory) at $6000-$7FFF
T : 1 = 512-byte trainer present at $7000-$71FF (stored after header in ROM file)
F : 1 = Alternative nametable layout (four-screen VRAM)
NNNN : Mapper number, lower nibble (D0-D3)
```

### Flags 7 (byte `$07`) -- bit layout

```
7       0
---------
NNNN TTPV

V : 1 = VS Unisystem
P : 1 = PlayChoice-10 (8 KB hint screen stored after CHR data)
TT: If equal to binary 10, flags 8-15 are in NES 2.0 format
NNNN : Mapper number, upper nibble (D4-D7)
```

The **mapper number** is assembled from the two nibbles:

```
mapper = (flags_7 & $F0) | (flags_6 >> 4)
```

For iNES 1.0, this gives mapper numbers 0--255.

### Flags 8 (byte `$08`)

PRG-RAM size in 8 KB units. A value of `$00` infers 8 KB for compatibility. This byte
is rarely set correctly in iNES 1.0 headers; NES 2.0 replaces it entirely.

### Flags 9 (byte `$09`)

```
7       0
---------
RRRR RRRT

T : TV system (0 = NTSC, 1 = PAL)
R : Reserved, should be zero
```

### Flags 10 (byte `$0A`) -- unofficial

```
7       0
---------
00PB RRTT

TT: TV system (0 = NTSC, 2 = PAL, 1 or 3 = dual-compatible)
RR: Reserved
B : 1 = Bus conflicts (ROM on bus during writes)
P : 0 = PRG-RAM present (board has PRG-RAM with battery)
```

This byte is unofficial and unreliable in practice. Most tools ignore it.

## NES 2.0 header

NES 2.0 is an extension that reinterprets bytes `$08`--`$0F` while remaining
backwards-compatible with iNES. A header is NES 2.0 if:

```
(header[7] & 0x0C) == 0x08      // bits 3-2 of flags 7 = binary "10"
```

Bytes `$00`--`$07` keep the same meaning as iNES (with Flags 7 bits 2-3 now serving
as the NES 2.0 identifier). Bytes `$08`--`$0F` are redefined:

| Offset | Field | Bit layout |
|---|---|---|
| `$08` | Mapper / Submapper | `SSSS MMMM` --- M = mapper D8--D11, S = submapper |
| `$09` | ROM size MSB | `CCCC PPPP` --- P = PRG-ROM size D8--D11, C = CHR-ROM size D8--D11 |
| `$0A` | PRG-RAM sizes | `nnnn vvvv` --- v = volatile (RAM) shift count, n = non-volatile (NVRAM) shift count |
| `$0B` | CHR-RAM sizes | `nnnn vvvv` --- v = volatile (CHR-RAM) shift count, n = non-volatile (CHR-NVRAM) shift count |
| `$0C` | CPU/PPU timing | `$00` = NTSC, `$01` = PAL, `$02` = Multi-region, `$03` = Dendy |
| `$0D` | Console-specific | VS System PPU type, or Extended Console type |
| `$0E` | Misc ROM count | Bits 1-0 = number of miscellaneous ROMs present |
| `$0F` | Expansion device | Default expansion port device identifier |

### Extended mapper number (NES 2.0)

The full 12-bit mapper number is:

```
mapper = (byte_8 & $0F) << 8 | (flags_7 & $F0) | (flags_6 >> 4)
```

This extends the mapper range from 0--255 (iNES) to 0--4095 (NES 2.0).

### Extended ROM sizes (NES 2.0)

PRG-ROM and CHR-ROM sizes combine the LSB (bytes 4/5) with MSB nibbles from byte 9:

```
prg_rom_size_value = (byte_9 & $0F) << 8 | byte_4
chr_rom_size_value = (byte_9 & $F0) << 4 | byte_5
```

If the MSB nibble is `$0`--`$E`, the total size is the value multiplied by the unit
(16 KB for PRG, 8 KB for CHR).

If the MSB nibble is `$F`, an **exponent-multiplier** notation is used:

```
size = 2^E * (MM * 2 + 1)
```

where `E` is the exponent and `MM` is the multiplier (producing odd multipliers 1, 3,
5, 7).

### RAM/NVRAM sizes (NES 2.0, bytes `$0A`--`$0B`)

Each nibble is a **shift count**. If the nibble is 0, that type of RAM is absent.
Otherwise, the size in bytes is `64 << shift_count`:

| Shift count | Size |
|---|---|
| 0 | not present |
| 1 | 128 bytes |
| 2 | 256 bytes |
| 3 | 512 bytes |
| 4 | 1 KB |
| 5 | 2 KB |
| 6 | 4 KB |
| 7 | 8 KB |
| 8 | 16 KB |
| 9 | 32 KB |
| 10 | 64 KB |
| ... | ... |

## Calculating ROM data offsets

The ROM file is laid out sequentially after the header:

```
Offset 0x0000 : Header          (16 bytes, always)
Offset 0x0010 : Trainer         (512 bytes, only if Flags 6 bit 2 is set)
                PRG-ROM data    (byte_4 * 16384 bytes)
                CHR-ROM data    (byte_5 * 8192 bytes)
                PlayChoice data (if Flags 7 bit 1 is set)
```

To find a PRG-ROM byte at CPU address `$ADDR` in a non-banked (NROM) ROM:

```
file_offset = 0x10 + ($ADDR - $8000)
```

For banked mappers, you must know which bank is mapped:

```
file_offset = 0x10 + (bank_number * bank_size) + ($ADDR - bank_base)
```

Where `bank_size` and `bank_base` depend on the mapper. See
[Mappers & Banking](./mappers) for per-mapper details.

If a 512-byte trainer is present (rare), add `0x200` to all PRG-ROM offsets:

```
file_offset = 0x10 + 0x200 + ...
```

## Fields that matter for localization

| Field | Why it matters |
|---|---|
| **Byte 4 (PRG-ROM size)** | Determines total code/data space. If you need to expand the ROM for a larger script, you increase this value and add more PRG banks. |
| **Byte 5 (CHR-ROM size)** | `$00` = CHR-RAM = you can load custom fonts at runtime. Non-zero = CHR-ROM = fonts are fixed in the ROM and limited to existing tile slots. |
| **Bytes 6--7 (mapper)** | The mapper number determines banking behavior, which affects how you locate text/font data and how pointers work. |
| **Byte 6 bit 1 (battery)** | Indicates save RAM at `$6000`--`$7FFF`. Some translation patches use this area for expanded text or font data. |
| **Byte 6 bit 2 (trainer)** | If set, a 512-byte block exists between the header and PRG-ROM, shifting all ROM offsets by `$200`. |

### Modifying the header for ROM expansion

When expanding a ROM (e.g., doubling PRG-ROM from 128 KB to 256 KB):

1. Update byte 4 to reflect the new PRG-ROM bank count.
2. If changing the mapper (e.g., from NROM to UxROM for banking), update the mapper
   nibbles in bytes 6 and 7.
3. Append the new PRG-ROM banks to the ROM file.
4. If the original game had CHR-ROM and you want CHR-RAM instead, set byte 5 to `$00`
   and remove the CHR-ROM data from the file (the game code must now load tiles into
   CHR-RAM manually --- this requires ASM patching).
5. Verify the total file size matches:
   `16 + (trainer ? 512 : 0) + PRG_size + CHR_size`.

## Quick identification checklist

```
$ xxd -l 16 game.nes

00000000: 4e45 531a 0802 1100 0000 0000 0000 0000

Bytes 0-3 : 4E 45 53 1A  -> valid iNES magic
Byte  4   : 08           -> 8 * 16 KB = 128 KB PRG-ROM
Byte  5   : 02           -> 2 * 8 KB  = 16 KB CHR-ROM (not CHR-RAM)
Byte  6   : 11           -> lower nibble mapper = 1, mirroring = vertical,
                            battery = no, trainer = no
Byte  7   : 00           -> upper nibble mapper = 0
                            Mapper = (0 << 4) | 1 = 1 (MMC1)
Byte 7 b3-2 : 00         -> iNES 1.0 (not NES 2.0)
```

## References

- [iNES header format](https://www.nesdev.org/wiki/INES) --- NESdev Wiki
- [NES 2.0 header format](https://www.nesdev.org/wiki/NES_2.0) --- NESdev Wiki
