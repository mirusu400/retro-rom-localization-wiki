---
title: "GB/GBC Cartridge Header"
description: "Complete Game Boy / Game Boy Color cartridge header format: offset table, cartridge type codes, ROM/RAM sizes, checksum algorithms, and localization-relevant fields."
sidebar:
  order: 2
---

The cartridge header occupies bytes `0x0100`-`0x014F` in every Game Boy ROM. The boot
ROM reads and validates parts of this header on startup. For localization work, the
header determines ROM size, MBC type, and checksum -- all of which may need updating
when expanding a ROM for translated content.

Reference: [Pan Docs -- The Cartridge Header](https://gbdev.io/pandocs/The_Cartridge_Header.html) (CC0)

## Complete Header Map

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x0100`-`0x0103` | 4 bytes | Entry point | Startup code; typically `nop` + `jp $0150` |
| `0x0104`-`0x0133` | 48 bytes | Nintendo logo | Bitmap checked by boot ROM; must match exactly |
| `0x0134`-`0x0143` | 16 bytes | Title | Game name in upper-case ASCII, padded with `0x00` |
| `0x013F`-`0x0142` | 4 bytes | Manufacturer code | 4-char code; overlaps title (newer games only) |
| `0x0143` | 1 byte | CGB flag | Color Game Boy compatibility mode |
| `0x0144`-`0x0145` | 2 bytes | New licensee code | Two ASCII characters identifying the publisher |
| `0x0146` | 1 byte | SGB flag | Super Game Boy enhancement support |
| `0x0147` | 1 byte | Cartridge type | MBC type and hardware features |
| `0x0148` | 1 byte | ROM size | Total ROM capacity |
| `0x0149` | 1 byte | RAM size | External (cartridge) SRAM capacity |
| `0x014A` | 1 byte | Destination code | Target market region |
| `0x014B` | 1 byte | Old licensee code | Legacy publisher identifier |
| `0x014C` | 1 byte | ROM version | Mask ROM version number (usually `0x00`) |
| `0x014D` | 1 byte | Header checksum | Complement check over `0x0134`-`0x014C` |
| `0x014E`-`0x014F` | 2 bytes | Global checksum | 16-bit sum of all ROM bytes (big-endian) |

## Field Details

### Entry Point (`0x0100`-`0x0103`)

The boot ROM jumps to `0x0100` after validation. Nearly all games use:

```
0x0100: 00        nop
0x0101: C3 50 01  jp $0150
```

The `nop` + `jp` occupies exactly 4 bytes. The actual game code begins at `0x0150`.
This field rarely needs modification for localization.

### Nintendo Logo (`0x0104`-`0x0133`)

48 bytes encoding the Nintendo logo bitmap displayed during boot. The boot ROM
compares this data byte-for-byte; a mismatch causes the boot to lock up.

**Never modify these bytes.** Any ROM expansion, patch, or header edit must leave
the logo untouched.

On GBC, the boot ROM also uses the logo data to determine the default palette for
DMG-mode games, so changing it would affect display even if the check passed.

### Title (`0x0134`-`0x0143`)

Game title in upper-case ASCII, right-padded with `0x00` bytes.

The field size depends on the ROM's era:

| Era | Title bytes | Notes |
|-----|------------|-------|
| Early DMG | 16 (`0x0134`-`0x0143`) | Full 16 characters available |
| Late DMG / early CGB | 15 (`0x0134`-`0x0142`) | Byte `0x0143` repurposed as CGB flag |
| Late CGB | 11 (`0x0134`-`0x013E`) | Bytes `0x013F`-`0x0142` used for manufacturer code |

For localization, you may update the title to reflect the translated name, but keep
it within the available byte count and use only ASCII. This field is cosmetic and
does not affect gameplay.

### CGB Flag (`0x0143`)

| Value | Meaning |
|-------|---------|
| `0x00` | DMG-only (no GBC features) |
| `0x80` | CGB-enhanced, backward-compatible with DMG |
| `0xC0` | CGB-only (will not run on DMG) |

The hardware only checks bit 7 (`0x80`); bit 6 (`0x40`) combined with bit 7 signals
CGB-only. Other values of this byte are treated as DMG-only.

**Localization relevance:** If you need GBC features (VRAM Bank 1 for more font tiles,
double-speed mode for VWF), set this to `0x80` or `0xC0`. Changing a DMG game to
CGB-enhanced requires adding GBC initialization code.

### SGB Flag (`0x0146`)

Set to `0x03` to indicate Super Game Boy support (custom borders, palettes, sound).
Any other value disables SGB features. Rarely relevant for localization unless the
SGB border contains text.

### Cartridge Type (`0x0147`)

This byte specifies the MBC type and any additional hardware on the cartridge.
**This is the most important header byte for ROM expansion.**

| Code | Type | Code | Type |
|------|------|------|------|
| `0x00` | ROM ONLY | `0x13` | MBC3+RAM+BATTERY |
| `0x01` | MBC1 | `0x19` | MBC5 |
| `0x02` | MBC1+RAM | `0x1A` | MBC5+RAM |
| `0x03` | MBC1+RAM+BATTERY | `0x1B` | MBC5+RAM+BATTERY |
| `0x05` | MBC2 | `0x1C` | MBC5+RUMBLE |
| `0x06` | MBC2+BATTERY | `0x1D` | MBC5+RUMBLE+RAM |
| `0x08` | ROM+RAM | `0x1E` | MBC5+RUMBLE+RAM+BATTERY |
| `0x09` | ROM+RAM+BATTERY | `0x20` | MBC6 |
| `0x0B` | MMM01 | `0x22` | MBC7+SENSOR+RUMBLE+RAM+BATTERY |
| `0x0C` | MMM01+RAM | `0xFC` | POCKET CAMERA |
| `0x0D` | MMM01+RAM+BATTERY | `0xFD` | BANDAI TAMA5 |
| `0x0F` | MBC3+TIMER+BATTERY | `0xFE` | HuC3 |
| `0x10` | MBC3+TIMER+RAM+BATTERY | `0xFF` | HuC1+RAM+BATTERY |
| `0x11` | MBC3 | | |
| `0x12` | MBC3+RAM | | |

#### MBC upgrade for localization

A common localization technique is upgrading the MBC type to allow more ROM banks:

- **ROM ONLY -> MBC5:** Change `0x0147` from `0x00` to `0x19`, then expand the ROM
  and update the ROM size byte at `0x0148`.
- **MBC1 -> MBC5:** Change `0x0147` from `0x01`/`0x02`/`0x03` to `0x19`/`0x1A`/`0x1B`.
  MBC5 is simpler (no banking mode quirks) and supports up to 8 MB.
- **MBC3 -> MBC5:** Change `0x0147` from `0x11`/`0x12`/`0x13` to `0x19`/`0x1A`/`0x1B`.
  Note: if the game uses the MBC3 RTC, you cannot switch to MBC5 (it has no RTC).

Always preserve the RAM and BATTERY flags when upgrading. A game with
`MBC1+RAM+BATTERY` (`0x03`) should become `MBC5+RAM+BATTERY` (`0x1B`), not plain
`MBC5` (`0x19`), or save data will be lost.

### ROM Size (`0x0148`)

| Value | Size | Banks | Notes |
|-------|------|-------|-------|
| `0x00` | 32 KB | 2 | No banking (bank 0 + bank 1) |
| `0x01` | 64 KB | 4 | |
| `0x02` | 128 KB | 8 | |
| `0x03` | 256 KB | 16 | |
| `0x04` | 512 KB | 32 | |
| `0x05` | 1 MB | 64 | |
| `0x06` | 2 MB | 128 | MBC1 / MBC3 max |
| `0x07` | 4 MB | 256 | MBC5 only |
| `0x08` | 8 MB | 512 | MBC5 only |

The formula is: `size = 32 KB << value`, and `banks = 2 << value`.

**When expanding a ROM for localization:**
1. Pad the ROM file with `0xFF` bytes to the new size
2. Update this byte to match the new size
3. Update the cartridge type byte if upgrading MBC
4. Recompute both checksums

### RAM Size (`0x0149`)

| Value | Size | Banks | Notes |
|-------|------|-------|-------|
| `0x00` | None | 0 | Also used for MBC2 (which has built-in 512x4-bit RAM) |
| `0x01` | -- | -- | Listed in headers but unused; do not use |
| `0x02` | 8 KB | 1 | Single bank, no switching needed |
| `0x03` | 32 KB | 4 | Four 8 KB banks |
| `0x04` | 128 KB | 16 | Sixteen 8 KB banks |
| `0x05` | 64 KB | 8 | Eight 8 KB banks |

Note that `0x04` (128 KB) and `0x05` (64 KB) are out of size order.

### Destination Code (`0x014A`)

| Value | Market |
|-------|--------|
| `0x00` | Japan (and possibly overseas) |
| `0x01` | Overseas only |

This byte is cosmetic and has no effect on hardware behavior. Japanese games being
localized for overseas release sometimes update this, but it is not required.

### Old Licensee Code (`0x014B`)

Legacy publisher identifier. If this byte is `0x33`, the **new licensee code** at
`0x0144`-`0x0145` should be used instead. This is the case for all GBC-era games.

The SGB boot ROM also checks this byte; SGB features only work if the old licensee
code is `0x33` and the SGB flag at `0x0146` is `0x03`.

### ROM Version (`0x014C`)

Mask ROM version number, usually `0x00`. Incremented for revised releases. You may
leave this unchanged or increment it to distinguish your patched ROM.

## Checksums

### Header Checksum (`0x014D`) -- **REQUIRED**

The boot ROM validates this checksum. If it fails, **the game will not boot.**

Algorithm (computed over bytes `0x0134` through `0x014C`):

```
uint8_t checksum = 0;
for (uint16_t addr = 0x0134; addr <= 0x014C; addr++) {
    checksum = checksum - rom[addr] - 1;
}
// Store result at 0x014D
```

Equivalently, in Python:

```python
checksum = 0
for byte in rom[0x0134:0x014D]:
    checksum = (checksum - byte - 1) & 0xFF
rom[0x014D] = checksum
```

**You must recompute this checksum after modifying any header byte in the range
`0x0134`-`0x014C`.** This includes the cartridge type, ROM size, and RAM size --
all commonly changed during localization.

The RGBDS tool `rgbfix` can recompute this automatically:

```bash
rgbfix -v rom.gb        # validate checksums
rgbfix -f rom.gb        # fix header checksum (leaves global alone)
```

### Global Checksum (`0x014E`-`0x014F`) -- **not enforced**

A 16-bit big-endian sum of every byte in the ROM, excluding the two checksum bytes
themselves. The boot ROM does **not** verify this value, so an incorrect global
checksum will not prevent booting.

However, some software (notably Pokemon Stadium's built-in GB emulator) does check
the global checksum and will refuse to run the game if it is wrong.

```python
global_sum = 0
for i, byte in enumerate(rom):
    if i not in (0x014E, 0x014F):
        global_sum = (global_sum + byte) & 0xFFFF
rom[0x014E] = (global_sum >> 8) & 0xFF   # high byte first (big-endian)
rom[0x014F] = global_sum & 0xFF
```

`rgbfix -F` will recompute the global checksum as well.

## Localization Workflow: Header Modifications

When expanding a ROM for a translation patch, the typical header changes are:

1. **Update cartridge type** (`0x0147`): Upgrade MBC if needed (e.g., MBC1 -> MBC5)
2. **Update ROM size** (`0x0148`): Match the new expanded ROM size
3. **Optionally update RAM size** (`0x0149`): If adding SRAM for save data
4. **Optionally update title** (`0x0134`+): Reflect the translated game name
5. **Recompute header checksum** (`0x014D`): **Mandatory** or the game won't boot
6. **Recompute global checksum** (`0x014E`-`0x014F`): Recommended for compatibility

### Quick reference: hex editing a ROM expansion

Example: expanding a 256 KB MBC1+RAM+BATTERY game to 512 KB MBC5+RAM+BATTERY:

```
Offset  Before  After   Meaning
0x0147  0x03    0x1B    MBC1+RAM+BATTERY -> MBC5+RAM+BATTERY
0x0148  0x03    0x04    256 KB (16 banks) -> 512 KB (32 banks)
0x014D  (old)   (new)   Recompute header checksum
0x014E  (old)   (new)   Recompute global checksum (high byte)
0x014F  (old)   (new)   Recompute global checksum (low byte)
```

Then pad the ROM file from 256 KB to 512 KB with `0xFF` bytes. The new banks
(`0x10`-`0x1F`) are now available for translated text, expanded font tiles, or
relocated data.
