---
title: "GBA ROM Header"
description: "Complete GBA cartridge ROM header format with all fields, offsets, and the header checksum algorithm. Covers which header fields matter for localization and patching."
sidebar:
  order: 2
---

The GBA ROM header occupies bytes `0x000`-`0x0BF` of the ROM (mapped at `0x08000000`-`0x080000BF`
in the CPU address space). The BIOS validates the Nintendo logo and header checksum during boot;
incorrect values prevent the game from starting on real hardware (most emulators skip this check).

Source: [GBATEK — GBA Cartridge Header](https://problemkaputt.de/gbatek-gba-cartridge-header.htm)

## Header field table

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x000` | 4 | Entry point | 32-bit ARM branch instruction (e.g., `B 0x080000C0`). Jumps past the header to the ROM's startup code. |
| `0x004` | 156 | Nintendo logo | Compressed bitmap of the Nintendo logo. Must match the BIOS's built-in copy exactly or the game will not boot on hardware. **Do not modify.** |
| `0x0A0` | 12 | Game title | Uppercase ASCII, padded with `0x00`. Up to 12 characters. Example: `"POKEMON FIRE"`. |
| `0x0AC` | 4 | Game code | 4-character uppercase ASCII. Format: `AxxxE` where the first letter indicates type (A = normal), the middle two are the game ID, and the last is the region (J/E/P/D/F/S/I). |
| `0x0B0` | 2 | Maker code | 2-character ASCII identifying the publisher. `"01"` = Nintendo. |
| `0x0B2` | 1 | Fixed value | Must be `0x96`. Required for BIOS validation. |
| `0x0B3` | 1 | Main unit code | Should be `0x00` for current GBA models. |
| `0x0B4` | 1 | Device type | Usually `0x00`. Bit 7 set indicates DACS (debug) hardware. |
| `0x0B5` | 7 | Reserved area | Should be zero-filled. |
| `0x0BC` | 1 | Software version | Version number of the game, usually `0x00`. |
| `0x0BD` | 1 | Complement check | Header checksum. See algorithm below. |
| `0x0BE` | 2 | Reserved | Should be zero-filled. |

**Total header size: 192 bytes (`0x0C0`).**

### Multiboot header extension

These fields are used when the ROM is transferred via link cable (multiboot). They occupy the space
immediately after the standard header.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x0C0` | 4 | RAM entry point | ARM branch opcode for Normal/Multiplay boot mode. Entry point in EWRAM (`0x02000000` region). |
| `0x0C4` | 1 | Boot mode | Overwritten by BIOS: `0x01` = Joybus, `0x02` = Normal, `0x03` = Multiplay. |
| `0x0C5` | 1 | Slave ID number | Set by BIOS in multiplay mode (1-3 for slaves). |
| `0x0C6` | 26 | Not used | Unused in multiboot context. |
| `0x0E0` | 4 | Joybus entry point | ARM branch opcode for Joybus boot mode. |

## Header checksum algorithm

The complement check at `0x0BD` is computed over bytes `0x0A0` through `0x0BC` (29 bytes). The
algorithm from GBATEK:

```
chk = 0
for i = 0x0A0 to 0x0BC:
    chk = chk - ROM[i]
chk = (chk - 0x19) AND 0xFF
```

In Python:

```python
def gba_header_checksum(rom_data: bytes) -> int:
    """Compute GBA header complement check over bytes 0x0A0-0x0BC."""
    chk = 0
    for i in range(0x0A0, 0x0BD):
        chk = chk - rom_data[i]
    chk = (chk - 0x19) & 0xFF
    return chk

# Verify:
with open("game.gba", "rb") as f:
    rom = f.read()
computed = gba_header_checksum(rom)
stored = rom[0x0BD]
print(f"Stored: 0x{stored:02X}, Computed: 0x{computed:02X}, Match: {computed == stored}")
```

If the checksum does not match, **real hardware will refuse to boot**. Most emulators (mGBA, etc.)
will still run the ROM but may display a warning.

## Which fields matter for localization

### Fields you should NOT modify

- **Nintendo logo** (`0x004`, 156 bytes) — must match exactly for hardware boot.
- **Fixed value** (`0x0B2`) — must be `0x96`.
- **Entry point** (`0x000`) — only change if you relocate startup code.

### Fields you MAY need to modify

| Field | When to modify |
|-------|----------------|
| **Game title** (`0x0A0`) | To indicate a translated version (e.g., `"POKEMON_FIRK"` for a Korean patch). Limited to 12 ASCII characters. |
| **Game code** (`0x0AC`) | Some tools use this for identification. Changing the region byte (last char) can affect save type detection. |
| **Software version** (`0x0BC`) | Increment to distinguish your patched version. |
| **Complement check** (`0x0BD`) | **Must be recomputed** whenever any byte in `0x0A0`-`0x0BC` changes. |

### Fixing the checksum after header edits

After changing the game title or any other field in the checksummed range, always recompute and
write the checksum at `0x0BD`. A simple script:

```python
def fix_gba_checksum(filepath: str):
    with open(filepath, "r+b") as f:
        rom = f.read()
        chk = 0
        for i in range(0x0A0, 0x0BD):
            chk = chk - rom[i]
        chk = (chk - 0x19) & 0xFF
        f.seek(0x0BD)
        f.write(bytes([chk]))
    print(f"Checksum fixed: 0x{chk:02X}")
```

## Game code format

The 4-byte game code at `0x0AC` follows a convention:

```
  A  x  x  R
  |  |  |  |
  |  |  |  +-- Region: J=Japan, E=USA, P=Europe, D=Germany, F=France, S=Spain, I=Italy
  |  +--+---- Game-specific identifier (2 chars)
  +----------- Category: A=normal game, B=some later titles, K/R=various
```

Examples:
- `AXVE` — Pokemon Ruby (USA)
- `BPRE` — Pokemon FireRed (USA)
- `A2YJ` — Mother 3 (Japan)

The game code can be useful for identifying which version of a ROM you are working with, especially
when multiple regional versions exist.

## Inspecting the header with CLI tools

```bash
# View header bytes with xxd
xxd -l 0x0C0 game.gba

# Extract just the game title (12 bytes at offset 0x0A0)
xxd -s 0x0A0 -l 12 game.gba

# Check the complement byte
xxd -s 0x0BD -l 1 game.gba
```

## References

- [GBATEK — GBA Cartridge Header](https://problemkaputt.de/gbatek-gba-cartridge-header.htm)
- [GBATEK — GBA Memory Map](https://problemkaputt.de/gbatek.htm)
