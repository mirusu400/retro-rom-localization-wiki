---
title: "NES Mappers & Banking"
description: "NES mapper chips and bank switching explained for localization: NROM, MMC1, UxROM, CNROM, MMC3, MMC5, AxROM, MMC2, MMC4, VRC6, and VRC7 --- how they affect text, fonts, and pointer tables."
sidebar:
  order: 3
---

The base NES hardware provides a 32 KB PRG-ROM window (`$8000`--`$FFFF`) and an 8 KB
CHR window (`$0000`--`$1FFF` in PPU space). **Mapper** chips on the cartridge PCB
extend this by bank-switching --- swapping pages of ROM in and out of the address
windows. Over 400 mapper variants exist, but a handful cover the vast majority of the
commercial library.

Understanding the mapper is critical for localization because:

- **Text and font data live in specific banks.** You must know which bank is active
  when a string or tileset is accessed.
- **Pointers are bank-relative.** A 16-bit pointer like `$B42A` is an address within
  the currently mapped bank, not an absolute ROM file offset.
- **ROM expansion** for a larger translated script usually means adding banks and
  possibly changing the mapper.

## How mapper numbers are encoded

The mapper number is stored in the iNES header bytes 6 and 7:

```
mapper = (header[7] & 0xF0) | (header[6] >> 4)
```

NES 2.0 extends this to 12 bits using byte 8 (see [Header](./header)).

## Common mappers reference

### Mapper 0 --- NROM (no mapper)

| Property | Value |
|---|---|
| PRG-ROM | 16 KB or 32 KB (no switching) |
| CHR | 8 KB ROM (no switching) |
| PRG-RAM | None (no `$6000`--`$7FFF`) |
| Example games | *Super Mario Bros.*, *Donkey Kong*, *Excitebike* |

The simplest configuration. The entire PRG-ROM is visible at `$8000`--`$FFFF` (or
mirrored if only 16 KB). CHR-ROM is fixed at 8 KB.

**Localization notes:**
- No banking --- pointers are straightforward absolute addresses.
- File offset = `header_size (0x10) + (CPU_address - $8000)`.
- Very limited space. If the translated script is longer, you may need to upgrade
  to a banked mapper (e.g., UxROM) and rewrite the ROM layout.
- CHR is always ROM on NROM, so font changes are limited to editing existing tiles.

### Mapper 1 --- MMC1 (SxROM)

| Property | Value |
|---|---|
| PRG-ROM | Up to 256 KB (sixteen 16 KB banks) or 512 KB with extended banking |
| CHR | Up to 128 KB; switchable in 4 KB or 8 KB banks |
| PRG-RAM | 8 KB at `$6000`--`$7FFF` (battery-backed optional) |
| Example games | *The Legend of Zelda*, *Final Fantasy*, *Dragon Warrior III*, *Metroid* |

MMC1 uses a **serial register** --- the CPU writes one bit at a time (5 writes) to
configure the mapper. Registers are selected by address bits 14--13 of the write:

| Address range | Register | Function |
|---|---|---|
| `$8000`--`$9FFF` | Control | Mirroring, PRG mode, CHR mode |
| `$A000`--`$BFFF` | CHR Bank 0 | Selects 4 KB CHR bank for `$0000`--`$0FFF` |
| `$C000`--`$DFFF` | CHR Bank 1 | Selects 4 KB CHR bank for `$1000`--`$1FFF` |
| `$E000`--`$FFFF` | PRG Bank | Selects 16 KB PRG-ROM bank + RAM enable |

Writing any value with bit 7 set (`$80`--`$FF`) resets the shift register.

**PRG banking modes** (set in the Control register):

| Mode | Behavior |
|---|---|
| 0, 1 | 32 KB switching: swap all of `$8000`--`$FFFF` (low bit of bank number ignored) |
| 2 | Fix **first** bank at `$8000`; switch 16 KB bank at `$C000` |
| 3 | Switch 16 KB bank at `$8000`; fix **last** bank at `$C000` |

Mode 3 (fix last bank, switch first) is the most common arrangement.

**Localization notes:**
- Many classic RPGs use MMC1. Text is typically in one or more switchable PRG banks.
- The **fixed bank** (usually the last) often contains the text engine, pointer
  tables, and core routines. Text data itself may be in switchable banks.
- Trace the bank-switch writes to `$E000`--`$FFFF` to determine which bank is active
  when text is read.
- PRG-RAM at `$6000`--`$7FFF` (8 KB) can be used for expanded translation data if
  the game does not already use all of it for saves.
- CHR banking in 4 KB mode gives fine-grained control over which font tiles are
  visible --- useful if you need to swap between multiple font pages.

### Mapper 2 --- UxROM

| Property | Value |
|---|---|
| PRG-ROM | Up to 256 KB (sixteen 16 KB switchable banks + fixed last bank) |
| CHR | 8 KB **CHR-RAM** (most boards) |
| PRG-RAM | None standard |
| Example games | *Mega Man*, *Castlevania*, *Contra*, *DuckTales* |

UxROM switches 16 KB PRG banks at `$8000`--`$BFFF` and fixes the **last 16 KB bank**
at `$C000`--`$FFFF`. The bank register is the entire data bus written to `$8000`--`$FFFF`.

**Localization notes:**
- Almost always uses CHR-RAM, so you can freely load custom font tiles at runtime.
- The fixed last bank is an ideal location for a translation's text engine and
  pointer tables (always accessible regardless of which data bank is switched in).
- A common expansion strategy: double the PRG-ROM size (e.g., 128 KB to 256 KB) and
  place translated text in the new banks.
- Simple bank register: just write the bank number to any address in `$8000`--`$FFFF`.
  Some boards have bus conflicts (the written value must match the ROM byte at that
  address); use a lookup table in ROM.

### Mapper 3 --- CNROM

| Property | Value |
|---|---|
| PRG-ROM | 16 KB or 32 KB (no switching) |
| CHR | Up to 32 KB; switchable in 8 KB banks |
| PRG-RAM | None |
| Example games | *Solomon's Key*, *Gradius*, *Arkanoid* |

CNROM has no PRG banking --- all 16 or 32 KB is always visible. Instead, it switches
8 KB CHR-ROM banks, allowing more graphics variety.

**Localization notes:**
- PRG is not banked, so text pointers are simple absolute addresses.
- CHR is ROM and switched in 8 KB chunks. Font tiles must fit within the current
  CHR bank, but you can potentially use different CHR banks for different font sets.
- Limited PRG space (no expansion without mapper change).

### Mapper 4 --- MMC3 (TxROM)

| Property | Value |
|---|---|
| PRG-ROM | Up to 512 KB (8 KB switchable banks) |
| CHR | Up to 256 KB (2 KB + 1 KB switchable banks) |
| PRG-RAM | 8 KB at `$6000`--`$7FFF` (battery-backed optional) |
| Scanline IRQ | Yes (A12 rising-edge counter) |
| Example games | *Super Mario Bros. 3*, *Kirby's Adventure*, *Mega Man 3--6*, *Final Fantasy III (J)* |

MMC3 is the most sophisticated common mapper. It has **8 bank-select registers**
(R0--R7) accessed through a pair of addresses:

| Address (even/odd) | Register | Function |
|---|---|---|
| `$8000` (even) | Bank Select | Bits 0-2: target register, bit 6: PRG mode, bit 7: CHR mode |
| `$8001` (odd) | Bank Data | Value to load into selected register |
| `$A000` (even) | Mirroring | Bit 0: 0=vertical, 1=horizontal |
| `$A001` (odd) | PRG-RAM protect | Enable/disable, write-protect |
| `$C000` (even) | IRQ Latch | Scanline counter reload value |
| `$C001` (odd) | IRQ Reload | Trigger counter reload at next scanline |
| `$E000` (even) | IRQ Disable | Disable and acknowledge IRQ |
| `$E001` (odd) | IRQ Enable | Enable scanline counter IRQ |

**PRG banking layout:**

| Address | Mode 0 (bit 6 = 0) | Mode 1 (bit 6 = 1) |
|---|---|---|
| `$8000`--`$9FFF` | R6 (switchable) | Fixed: second-to-last bank |
| `$A000`--`$BFFF` | R7 (switchable) | R7 (switchable) |
| `$C000`--`$DFFF` | Fixed: second-to-last bank | R6 (switchable) |
| `$E000`--`$FFFF` | Fixed: last bank | Fixed: last bank |

`$E000`--`$FFFF` is **always** the last bank.

**CHR banking:**

Mode 0 (bit 7 = 0):
- `$0000`--`$07FF` : R0 (2 KB, even bank number)
- `$0800`--`$0FFF` : R1 (2 KB, even bank number)
- `$1000`--`$13FF` : R2 (1 KB)
- `$1400`--`$17FF` : R3 (1 KB)
- `$1800`--`$1BFF` : R4 (1 KB)
- `$1C00`--`$1FFF` : R5 (1 KB)

Mode 1 swaps the 2 KB and 1 KB regions.

**Localization notes:**
- 8 KB PRG granularity gives fine-grained control: text, font, and engine code can
  each be in separate small banks.
- The fixed last bank (`$E000`--`$FFFF`) typically holds the main engine, interrupt
  handlers, and bank-switching code. Pointer tables are often here.
- Text data is usually in switchable banks loaded via R6 or R7. Trace writes to
  `$8000`/`$8001` to find which bank is selected when text is read.
- PRG-RAM at `$6000`--`$7FFF` is available for extra translation data.
- The scanline IRQ is used for split-screen effects (status bars), not directly
  relevant to text, but be aware of it when timing CHR bank switches for fonts.
- Up to 512 KB PRG means plenty of room for expanded scripts.

### Mapper 5 --- MMC5 (ExROM)

| Property | Value |
|---|---|
| PRG-ROM | Up to 1 MB (various bank modes: 32/16/8 KB) |
| CHR | Up to 1 MB (1/2/4/8 KB bank modes) |
| PRG-RAM | Up to 64 KB |
| Extra features | ExRAM (1 KB), 8x16 sprite CHR banking, extra audio (Famicom) |
| Example games | *Castlevania III*, *Just Breed*, *Uchuu Keibitai SDF* |

MMC5 is the most complex NES mapper. Its ExRAM can serve as an extended attribute table
(per-tile palette) or as general-purpose RAM. It supports independent CHR bank sets
for background and sprite rendering.

**Localization notes:**
- Very few games use MMC5, but those that do (e.g., *Castlevania III*) are complex.
- ExRAM can potentially store extra font or text data.
- The flexible banking modes make ROM expansion straightforward in theory, but the
  mapper's complexity means more registers to understand.
- 8x16 sprite mode with separate CHR banking is useful if the game uses sprites for text.

### Mapper 9 --- MMC2 (PxROM)

| Property | Value |
|---|---|
| PRG-ROM | Up to 128 KB (8 KB switchable at `$8000`--`$9FFF`; last three 8 KB banks fixed at `$A000`--`$FFFF`) |
| CHR | Up to 128 KB; two 4 KB banks per PPU half, auto-switched via latch |
| PRG-RAM | None (8 KB on PlayChoice-10 version only) |
| Example games | *Mike Tyson's Punch-Out!!* |

MMC2's defining feature is its **CHR latch mechanism**. Each 4 KB PPU half
(`$0000`--`$0FFF` and `$1000`--`$1FFF`) has *two* CHR bank registers that are
switched automatically during rendering based on specific tile fetches.

**Registers:**

| Address range | Register | Function |
|---|---|---|
| `$A000`--`$AFFF` | PRG Bank | Bits 0--3: select 8 KB PRG bank at `$8000`--`$9FFF` |
| `$B000`--`$BFFF` | CHR Bank 0 FD | Bits 0--4: 4 KB CHR bank for `$0000`--`$0FFF` when latch 0 = `$FD` |
| `$C000`--`$CFFF` | CHR Bank 0 FE | Bits 0--4: 4 KB CHR bank for `$0000`--`$0FFF` when latch 0 = `$FE` |
| `$D000`--`$DFFF` | CHR Bank 1 FD | Bits 0--4: 4 KB CHR bank for `$1000`--`$1FFF` when latch 1 = `$FD` |
| `$E000`--`$EFFF` | CHR Bank 1 FE | Bits 0--4: 4 KB CHR bank for `$1000`--`$1FFF` when latch 1 = `$FE` |
| `$F000`--`$FFFF` | Mirroring | Bit 0: 0 = vertical, 1 = horizontal |

**CHR latch triggers:**

| PPU address read | Effect |
|---|---|
| `$0FD8` | Latch 0 set to `$FD` |
| `$0FE8` | Latch 0 set to `$FE` |
| `$1FD8`--`$1FDF` | Latch 1 set to `$FD` |
| `$1FE8`--`$1FEF` | Latch 1 set to `$FE` |

The latch updates *after* the tile at the trigger address is fetched, so the
trigger tile itself is drawn from the *old* bank. On reset, both latches
default to `$FE`.

**Localization notes:**
- Only one commercial game (Punch-Out!!) uses this mapper, but understanding
  the latch is essential if you need to modify its CHR layout.
- The latch doubles the effective CHR address space --- up to 512 visible
  background tiles instead of 256 --- by placing a trigger tile on-screen that
  switches from one 4 KB bank to another mid-scanline.
- PRG is mostly fixed: only 8 KB at `$8000`--`$9FFF` is switchable, with the
  remaining 24 KB pinned to the last three banks. Text and engine code almost
  certainly reside in the fixed region.
- 8x16 sprites can cause unexpected latch 1 switches because unused sprite
  slots fetch tile `$FF`, hitting the `$1FEx` range.

### Mapper 10 --- MMC4 (FxROM)

| Property | Value |
|---|---|
| PRG-ROM | Up to 256 KB (16 KB switchable at `$8000`--`$BFFF`; last 16 KB fixed at `$C000`--`$FFFF`) |
| CHR | Up to 128 KB; same dual-latch mechanism as MMC2 |
| PRG-RAM | 8 KB at `$6000`--`$7FFF` (battery-backed) |
| Example games | *Fire Emblem: Ankoku Ryuu to Hikari no Tsurugi* (Famicom), *Fire Emblem Gaiden* |

MMC4 is closely related to MMC2 but switches **16 KB PRG banks** (like MMC1
mode 3) instead of 8 KB, and provides PRG-RAM.

**Registers:**

| Address range | Register | Function |
|---|---|---|
| `$A000`--`$AFFF` | PRG Bank | Bits 0--3: select 16 KB PRG bank at `$8000`--`$BFFF` |
| `$B000`--`$BFFF` | CHR Bank 0 FD | Bits 0--4: 4 KB CHR bank for `$0000`--`$0FFF` when latch 0 = `$FD` |
| `$C000`--`$CFFF` | CHR Bank 0 FE | Bits 0--4: 4 KB CHR bank for `$0000`--`$0FFF` when latch 0 = `$FE` |
| `$D000`--`$DFFF` | CHR Bank 1 FD | Bits 0--4: 4 KB CHR bank for `$1000`--`$1FFF` when latch 1 = `$FD` |
| `$E000`--`$EFFF` | CHR Bank 1 FE | Bits 0--4: 4 KB CHR bank for `$1000`--`$1FFF` when latch 1 = `$FE` |
| `$F000`--`$FFFF` | Mirroring | Bit 0: 0 = vertical, 1 = horizontal |

**CHR latch triggers** (differs from MMC2 --- latch 0 also responds to a range):

| PPU address read | Effect |
|---|---|
| `$0FD8`--`$0FDF` | Latch 0 set to `$FD` |
| `$0FE8`--`$0FEF` | Latch 0 set to `$FE` |
| `$1FD8`--`$1FDF` | Latch 1 set to `$FD` |
| `$1FE8`--`$1FEF` | Latch 1 set to `$FE` |

**Localization notes:**
- Fire Emblem (Famicom) is the primary target for this mapper. It is a
  text-heavy strategy RPG, making it a common fan-translation project.
- 16 KB PRG banking provides a larger switchable window than MMC2. Text data
  likely lives in switchable banks, with the engine in the fixed last bank
  at `$C000`--`$FFFF`.
- 8 KB battery-backed PRG-RAM at `$6000`--`$7FFF` is used for save data, but
  any unused portion could store expanded translation data at runtime.
- The CHR latch works the same way as MMC2, doubling the effective tile count.
  This is helpful for localizations that need more font tiles.

### Mapper 24/26 --- VRC6 (Konami)

| Property | Value |
|---|---|
| PRG-ROM | Up to 256 KB (16 KB + 8 KB switchable banks; last 8 KB fixed) |
| CHR | Up to 256 KB (1 KB switchable banks, multiple modes) |
| PRG-RAM | 8 KB at `$6000`--`$7FFF` (battery-backed on mapper 26 boards) |
| Extra features | 3 extra audio channels (2 pulse + 1 sawtooth), scanline IRQ |
| Example games | *Akumajou Densetsu* (Castlevania III JP), *Madara*, *Esper Dream 2* |

Konami's VRC6 comes in two board variants that swap address lines A0 and A1:

| Variant | iNES mapper | Address line order | Notable game |
|---|---|---|---|
| VRC6a | 24 | A0, A1 (standard) | *Akumajou Densetsu* |
| VRC6b | 26 | A1, A0 (swapped) | *Madara*, *Esper Dream 2* |

To convert register addresses between variants: swap bits 0 and 1
(e.g., VRC6a `$x001` = VRC6b `$x002`).

**PRG banking (VRC6a addresses):**

| Address | Function |
|---|---|
| `$8000`--`$8003` | Select 16 KB PRG bank at `$8000`--`$BFFF` (value * 2 selects the 8 KB pair) |
| `$C000`--`$C003` | Select 8 KB PRG bank at `$C000`--`$DFFF` |
| (fixed) | Last 8 KB always at `$E000`--`$FFFF` |

**CHR banking** is configured through registers at `$D000`--`$E003` (8 registers,
R0--R7), with the mode set by bits in `$B003`. The default mode maps eight
1 KB CHR banks across `$0000`--`$1FFF`.

**Localization notes:**
- *Akumajou Densetsu* is the Japanese version of *Castlevania III*; the US
  release (*Dracula's Curse*) was converted to MMC5, losing the VRC6 audio.
  Localizing the JP ROM preserves the superior soundtrack.
- Fine-grained 1 KB CHR banking provides excellent font flexibility --- you can
  map different 1 KB font pages into the pattern table as needed.
- The 3 extra audio channels are Famicom-only (they use the cartridge audio
  expansion pins, which the NES lacks). Translations targeting NES hardware
  will not hear the extra audio without a hardware adapter.
- PRG-RAM (mapper 26 boards) is battery-backed and can supplement save data or
  hold translation buffers.
- The scanline IRQ (shared with VRC4/VRC7) uses a CPU-cycle-driven prescaler
  that divides by ~113.67 to approximate scanline timing.

### Mapper 85 --- VRC7 (Konami)

| Property | Value |
|---|---|
| PRG-ROM | Up to 512 KB (three 8 KB switchable banks; last 8 KB fixed) |
| CHR | Up to 256 KB (eight 1 KB switchable banks) |
| PRG-RAM | 8 KB at `$6000`--`$7FFF` (battery-backed) |
| Extra features | 6-channel FM synthesis audio (OPLL derivative), scanline IRQ |
| Example games | *Lagrange Point*, *Tiny Toon Adventures 2* (JP) |

VRC7 has two submapper variants differing in which address line selects the
register half:

| Variant | Submapper | Select line | Notable game |
|---|---|---|---|
| VRC7a | 2 | A4 (`$x010`) | *Lagrange Point* |
| VRC7b | 1 | A3 (`$x008`) | *Tiny Toon Adventures 2* |

**PRG banking:**

| Address (VRC7a) | Function |
|---|---|
| `$8000` | Select 8 KB PRG bank at `$8000`--`$9FFF` (6-bit register) |
| `$8010` | Select 8 KB PRG bank at `$A000`--`$BFFF` |
| `$9000` | Select 8 KB PRG bank at `$C000`--`$DFFF` |
| (fixed) | Last 8 KB always at `$E000`--`$FFFF` |

**CHR banking:** Eight 1 KB bank registers at `$A000`, `$A010`, `$B000`,
`$B010`, `$C000`, `$C010`, `$D000`, `$D010` map CHR across
`$0000`--`$1FFF`. *Lagrange Point* uses CHR-RAM with banking rather than
CHR-ROM.

**Localization notes:**
- *Lagrange Point* is the only game that uses VRC7's FM audio --- a sci-fi RPG
  with a substantial script, making it a high-value translation target.
- The 6-bit PRG bank register limits addressable PRG-ROM to 512 KB (64 banks
  of 8 KB). This cannot be expanded further on real VRC7 hardware.
- CHR-RAM with 1 KB banking (as in Lagrange Point) means you can dynamically
  load font tiles into any 1 KB CHR slot --- ideal for scripts that need many
  glyphs.
- The FM audio registers (`$9010`/`$9030`) require a minimum 42-cycle delay
  between writes. If your ASM patches add code near the audio driver, be
  careful not to violate this timing.
- The scanline IRQ is identical to VRC4/VRC6.

### Mapper 7 --- AxROM

| Property | Value |
|---|---|
| PRG-ROM | Up to 256 KB (32 KB switchable banks) |
| CHR | 8 KB CHR-RAM |
| Mirroring | Single-screen, selectable (bit 4 of bank register) |
| Example games | *Battletoads*, *Wizards & Warriors*, *Marble Madness* |

AxROM switches the entire 32 KB PRG space at once and uses single-screen mirroring.

**Localization notes:**
- Since the entire 32 KB switches, code and data must be self-contained per bank, or
  share a common bank via clever switching.
- CHR-RAM means full font flexibility.
- 32 KB granularity is coarse; if you need more fine-grained control, consider
  converting to a different mapper.

## Common mappers summary table

| Mapper | Name | PRG banks | CHR type | PRG-RAM | Games using it |
|---|---|---|---|---|---|
| 0 | NROM | None (32K fixed) | 8K ROM | No | ~240 |
| 1 | MMC1 | 16K switchable | 4K/8K ROM | 8K | ~390 |
| 2 | UxROM | 16K switch + 16K fixed | 8K RAM | No | ~270 |
| 3 | CNROM | None (32K fixed) | 8K switchable ROM | No | ~150 |
| 4 | MMC3 | 8K switchable | 2K+1K switchable | 8K | ~300+ |
| 5 | MMC5 | 8/16/32K modes | 1/2/4/8K modes | Up to 64K | ~10 |
| 7 | AxROM | 32K switchable | 8K RAM | No | ~60 |
| 9 | MMC2 | 8K switch + 24K fixed | 4K dual-latch ROM | No | 1 |
| 10 | MMC4 | 16K switch + 16K fixed | 4K dual-latch ROM | 8K | ~4 |
| 24/26 | VRC6 | 16K+8K switch + 8K fixed | 1K switchable | 8K (m26) | ~3 |
| 85 | VRC7 | 3x 8K switch + 8K fixed | 1K switchable | 8K | ~2 |

*Game counts are approximate, based on NesCartDB data.*

## Banking and pointer calculation

### Converting CPU address + bank to ROM file offset

For a 16 KB banked mapper (MMC1 mode 3, UxROM):

```
bank_size    = 0x4000        (16 KB = 16384 bytes)
bank_base    = $8000         (switchable bank start)
fixed_base   = $C000         (fixed bank start, = last bank)

# For an address in the switchable window ($8000-$BFFF):
file_offset = header_size + (bank_number * bank_size) + (address - $8000)

# For an address in the fixed window ($C000-$FFFF):
last_bank   = total_prg_banks - 1
file_offset = header_size + (last_bank * bank_size) + (address - $C000)

# header_size = 0x10 (no trainer) or 0x210 (with trainer)
```

For MMC3 (8 KB banks):

```
bank_size    = 0x2000        (8 KB = 8192 bytes)

# $E000-$FFFF is always the last 8 KB bank
# Other windows depend on which register (R6/R7) is loaded
file_offset = header_size + (bank_number * bank_size) + (address - window_base)
```

### Finding which bank is active

Use an emulator debugger (Mesen2 or FCEUX):

1. Set a **read breakpoint** on the address where text data is read.
2. When it breaks, check the mapper state / bank registers.
3. The debugger typically shows the current bank mapping.
4. Note: FCEUX's "Name Table Viewer" and "PPU Viewer" help verify which CHR banks
   hold the font tiles.

Alternatively, search for bank-switch code patterns:

```asm
; MMC1 serial write pattern (5 consecutive writes)
LDA #bank_number
STA $E000       ; bit 0
LSR A
STA $E000       ; bit 1
LSR A
STA $E000       ; bit 2
LSR A
STA $E000       ; bit 3
LSR A
STA $E000       ; bit 4 + latch

; UxROM simple bank switch
LDA #bank_number
STA $8000       ; or any $8000-$FFFF address

; MMC3 bank select + data
LDA #$06        ; select R6 (PRG bank at $8000)
STA $8000
LDA #bank_number
STA $8001
```

## ROM expansion strategies

| Original | Target | Approach |
|---|---|---|
| NROM 32K | UxROM 128K | Change mapper to 2, add PRG banks, add bank-switch code |
| UxROM 128K | UxROM 256K | Double PRG, update header byte 4 |
| MMC1 256K | MMC1 512K | May need MMC1A variant; or switch to MMC3 |
| MMC3 256K | MMC3 512K | Add PRG banks, update header byte 4 |

When expanding:
1. Update the PRG-ROM size in the iNES header (byte 4).
2. Append zero-filled banks to the ROM file.
3. Place translated text and new font data in the new banks.
4. Add bank-switch code to load the new banks when needed.
5. Update or add pointer tables to reference the new data.

## References

- [Mapper list](https://www.nesdev.org/wiki/Mapper) --- NESdev Wiki
- [MMC1](https://www.nesdev.org/wiki/MMC1) --- NESdev Wiki
- [UxROM](https://www.nesdev.org/wiki/UxROM) --- NESdev Wiki
- [MMC3](https://www.nesdev.org/wiki/MMC3) --- NESdev Wiki
- [MMC5](https://www.nesdev.org/wiki/MMC5) --- NESdev Wiki
- [MMC2](https://www.nesdev.org/wiki/MMC2) --- NESdev Wiki
- [MMC4](https://www.nesdev.org/wiki/MMC4) --- NESdev Wiki
- [VRC6](https://www.nesdev.org/wiki/VRC6) --- NESdev Wiki
- [VRC7](https://www.nesdev.org/wiki/VRC7) --- NESdev Wiki
