---
title: "NDS ROM Header"
description: "Complete NDS cartridge header offset table (0x000--0x200): game title, ARM9/ARM7 binaries, FNT/FAT filesystem pointers, overlay tables, icon/title, and checksums."
sidebar:
  order: 2
---

The NDS ROM header occupies the first `0x200` bytes of the cartridge (with the full
header area extending to `0x4000` including padding and the Nintendo logo). It is the
starting point for locating every major data structure in the ROM: the ARM9 and ARM7
binaries, the NitroFS filesystem tables (FNT and FAT), overlay tables, and the
icon/title block.

Source: [GBATEK -- DS Cartridge Header](https://problemkaputt.de/gbatek-ds-cartridge-header.htm)

## Complete Header Offset Table

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x000` | 12 | Game Title | Uppercase ASCII, padded with `0x00`. Displayed in some menus. |
| `0x00C` | 4 | Gamecode | Uppercase ASCII. Full code is `NTR-XXXX` where XXXX is this field. First char = category, last char = region (J/E/P/K/etc). |
| `0x010` | 2 | Makercode | Uppercase ASCII. `"01"` = Nintendo. |
| `0x012` | 1 | Unitcode | `0x00` = NDS, `0x02` = NDS+DSi, `0x03` = DSi only. |
| `0x013` | 1 | Encryption Seed Select | Values `0x00`--`0x07`. Selects KEY1 encryption seed. |
| `0x014` | 1 | Device Capacity | ROM size = `128 KB << value`. E.g., `0x09` = 64 MB, `0x0A` = 128 MB. |
| `0x015` | 7 | Reserved | Zero-filled. |
| `0x01C` | 1 | Reserved | Zero. |
| `0x01D` | 1 | NDS Region | `0x00` = normal, `0x40` = Korea, `0x80` = China. |
| `0x01E` | 1 | ROM Version | Version number of the game (usually `0x00`). |
| `0x01F` | 1 | Autostart | Bit 2: skip Health & Safety screen. |
| `0x020` | 4 | **ARM9 ROM Offset** | Offset in the ROM file where the ARM9 binary starts. |
| `0x024` | 4 | **ARM9 Entry Address** | RAM address where ARM9 execution begins. |
| `0x028` | 4 | **ARM9 RAM Address** | RAM address where ARM9 binary is loaded. |
| `0x02C` | 4 | **ARM9 Size** | Size of the ARM9 binary in bytes. |
| `0x030` | 4 | **ARM7 ROM Offset** | Offset in the ROM file where the ARM7 binary starts. |
| `0x034` | 4 | **ARM7 Entry Address** | RAM address where ARM7 execution begins. |
| `0x038` | 4 | **ARM7 RAM Address** | RAM address where ARM7 binary is loaded. Typically `0x02380000` or `0x03800000`. |
| `0x03C` | 4 | **ARM7 Size** | Size of the ARM7 binary in bytes. |
| `0x040` | 4 | **FNT Offset** | File Name Table offset in ROM. Points to the NitroFS directory structure. |
| `0x044` | 4 | **FNT Size** | File Name Table size in bytes. |
| `0x048` | 4 | **FAT Offset** | File Allocation Table offset in ROM. Points to the file start/end offset pairs. |
| `0x04C` | 4 | **FAT Size** | File Allocation Table size in bytes. Number of files = size / 8. |
| `0x050` | 4 | **ARM9 Overlay Table Offset** | Offset of the ARM9 overlay table in ROM. |
| `0x054` | 4 | **ARM9 Overlay Table Size** | Size in bytes. Number of overlays = size / 32. |
| `0x058` | 4 | **ARM7 Overlay Table Offset** | Offset of the ARM7 overlay table in ROM (often `0x00` -- no ARM7 overlays). |
| `0x05C` | 4 | **ARM7 Overlay Table Size** | Size in bytes (often `0x00`). |
| `0x060` | 4 | Normal Card Control | Port `0x40001A4h` setting for normal (unencrypted) commands. |
| `0x064` | 4 | Secure Card Control | Port `0x40001A4h` setting for KEY1-encrypted commands. |
| `0x068` | 4 | **Icon/Title Offset** | Offset to the icon/title data block (game icon + multilingual titles). |
| `0x06C` | 2 | Secure Area Checksum | CRC-16 of the Secure Area (first 8 KB after header). |
| `0x06E` | 2 | Secure Area Delay | Delay in 131 kHz units for Secure Area access. |
| `0x070` | 4 | ARM9 Auto Load Hook | RAM address of the ARM9 auto-load list callback. |
| `0x074` | 4 | ARM7 Auto Load Hook | RAM address of the ARM7 auto-load list callback. |
| `0x078` | 8 | Secure Area Disable | 8-byte magic to disable Secure Area encryption. |
| `0x080` | 4 | **Total Used ROM Size** | Total size of used data in the ROM (excluding padding). |
| `0x084` | 4 | ROM Header Size | Size of the header area, typically `0x4000`. |
| `0x088` | 4 | Unknown | Sometimes a ROM offset, sometimes zero. |
| `0x08C` | 8 | Reserved | Zero-filled. |
| `0x094` | 2 | NAND End of ROM Area | DSi: end of ROM area on NAND. |
| `0x096` | 2 | NAND Start of RW Area | DSi: start of read-write area on NAND. |
| `0x098` | 24 | Reserved | Zero-filled. |
| `0x0B0` | 16 | Reserved | May contain fastboot signature on some carts. |
| `0x0C0` | 156 | Nintendo Logo | Compressed bitmap, identical across all licensed NDS carts. |
| `0x15C` | 2 | Nintendo Logo Checksum | CRC-16 of the logo data. Always `0xCF56`. |
| `0x15E` | 2 | **Header Checksum** | CRC-16 over bytes `0x000`--`0x15D`. Must be recalculated if any header field changes. |
| `0x160` | 4 | Debug ROM Offset | Offset of debug binary (only in debug carts). |
| `0x164` | 4 | Debug Size | Size of debug binary. |
| `0x168` | 4 | Debug RAM Address | RAM load address for debug binary. |
| `0x16C` | 4 | Reserved | Zero. |
| `0x170` | 144 | Reserved | Zero-filled, extends to `0x200`. |

## Fields That Matter for Localization

### FNT and FAT (0x040--0x04F)

These four fields define the NitroFS filesystem:

```
0x040: FNT Offset   -> points to the File Name Table (directory structure)
0x044: FNT Size     -> total bytes of the FNT
0x048: FAT Offset   -> points to the File Allocation Table (file locations)
0x04C: FAT Size     -> total bytes of the FAT (num_files = size / 8)
```

When you unpack a ROM with ndstool, it reads the FNT to reconstruct the directory
tree and the FAT to extract each file's data. When you rebuild, ndstool
regenerates both tables from the new file layout. You generally do not need to
edit these by hand -- ndstool handles it -- but understanding them helps when
debugging extraction failures or writing custom tools.

See [NitroFS Filesystem](./filesystem/) for the full FNT/FAT binary format.

### ARM9 Binary (0x020--0x02F)

```
0x020: ARM9 ROM Offset   -> where the ARM9 binary sits in the ROM file
0x024: ARM9 Entry Address -> execution starts here (RAM address)
0x028: ARM9 RAM Address   -> binary is loaded to this RAM address
0x02C: ARM9 Size          -> byte count to load
```

The ARM9 binary is the main game executable. Text engine code, font rendering
routines, and hardcoded string tables are often found here. If you need to apply
ASM patches (e.g., variable-width font hooks), you patch the ARM9 binary or
inject new code into it.

The ARM9 RAM address is typically `0x02000000` or `0x02000800`. When you see
pointers in the ARM9 binary or overlays referencing data, they use these RAM
addresses -- not ROM file offsets.

### Overlay Tables (0x050--0x05F)

```
0x050: ARM9 Overlay Table Offset
0x054: ARM9 Overlay Table Size    -> num_overlays = size / 32
0x058: ARM7 Overlay Table Offset  -> usually 0 (no ARM7 overlays)
0x05C: ARM7 Overlay Table Size    -> usually 0
```

Most NDS games use ARM9 overlays extensively. The overlay table tells the system
where each overlay file is (via a NitroFS file ID), where it loads in RAM, and
how large it is. Text data and rendering code are frequently located in overlays
rather than the main ARM9 binary.

See [Overlays](./overlays/) for the overlay table entry format.

### Icon/Title (0x068)

The icon/title block contains the game's icon (32x32 pixels, 16 colors) and the
game title in multiple languages. While not critical for gameplay localization,
you may want to update the title string for your target language.

#### Icon/Title Block Structure

The icon/title block (located at the ROM offset stored at `0x068`) has this layout:

| Offset | Size | Field |
|--------|------|-------|
| `0x000` | 2 | Version (`0x0001`, `0x0002`, `0x0003`, or `0x0103`) |
| `0x002` | 2 | CRC-16 of `0x020`--`0x83F` |
| `0x004` | 2 | CRC-16 of `0x020`--`0x93F` (version `0x0002`+) |
| `0x006` | 2 | CRC-16 of `0x020`--`0xA3F` (version `0x0003`+) |
| `0x008` | 22 | Reserved |
| `0x020` | 512 | Icon bitmap (32x32 pixels, 4bpp = 512 bytes) |
| `0x220` | 32 | Icon palette (16 colors, 15-bit RGB) |
| `0x240` | 256 | Title: Japanese (UTF-16LE, 128 chars max) |
| `0x340` | 256 | Title: English |
| `0x440` | 256 | Title: French |
| `0x540` | 256 | Title: German |
| `0x640` | 256 | Title: Italian |
| `0x740` | 256 | Title: Spanish |
| `0x840` | 256 | Title: Chinese (version `0x0002`+) |
| `0x940` | 256 | Title: Korean (version `0x0003`+) |

Title strings are null-terminated UTF-16LE. A newline (`0x000A`) separates the
short title from the subtitle/publisher line. The version field determines which
language slots are present.

### Header Checksum (0x15E)

The header checksum is a CRC-16 over bytes `0x000`--`0x15D`. If you modify any
header field (which you generally should not need to), this checksum must be
recalculated. ndstool handles this automatically during ROM rebuild.

## Reading the Header: Practical Example

To inspect a ROM's header with a hex editor or Python:

```python
import struct

with open('game.nds', 'rb') as f:
    header = f.read(0x200)

title      = header[0x000:0x00C].decode('ascii').rstrip('\x00')
gamecode   = header[0x00C:0x010].decode('ascii')
arm9_off   = struct.unpack_from('<I', header, 0x020)[0]
arm9_entry = struct.unpack_from('<I', header, 0x024)[0]
arm9_ram   = struct.unpack_from('<I', header, 0x028)[0]
arm9_size  = struct.unpack_from('<I', header, 0x02C)[0]
fnt_off    = struct.unpack_from('<I', header, 0x040)[0]
fnt_size   = struct.unpack_from('<I', header, 0x044)[0]
fat_off    = struct.unpack_from('<I', header, 0x048)[0]
fat_size   = struct.unpack_from('<I', header, 0x04C)[0]
ovt9_off   = struct.unpack_from('<I', header, 0x050)[0]
ovt9_size  = struct.unpack_from('<I', header, 0x054)[0]
icon_off   = struct.unpack_from('<I', header, 0x068)[0]
rom_size   = struct.unpack_from('<I', header, 0x080)[0]
hdr_crc    = struct.unpack_from('<H', header, 0x15E)[0]

print(f"Title:     {title}")
print(f"Gamecode:  {gamecode}")
print(f"ARM9:      ROM 0x{arm9_off:08X}, RAM 0x{arm9_ram:08X}, "
      f"entry 0x{arm9_entry:08X}, size 0x{arm9_size:X}")
print(f"FNT:       0x{fnt_off:08X} ({fnt_size} bytes)")
print(f"FAT:       0x{fat_off:08X} ({fat_size} bytes, "
      f"{fat_size // 8} files)")
print(f"OVT9:      0x{ovt9_off:08X} ({ovt9_size} bytes, "
      f"{ovt9_size // 32} overlays)")
print(f"Icon:      0x{icon_off:08X}")
print(f"ROM used:  0x{rom_size:08X} ({rom_size} bytes)")
print(f"Header CRC: 0x{hdr_crc:04X}")
```

## References

- GBATEK -- DS Cartridge Header:
  [https://problemkaputt.de/gbatek-ds-cartridge-header.htm](https://problemkaputt.de/gbatek-ds-cartridge-header.htm)
- GBATEK -- DS Cartridge Icon/Title:
  [https://problemkaputt.de/gbatek-ds-cartridge-icon-title.htm](https://problemkaputt.de/gbatek-ds-cartridge-icon-title.htm)
- ndstool source (header parsing):
  [https://github.com/devkitPro/ndstool](https://github.com/devkitPro/ndstool)
