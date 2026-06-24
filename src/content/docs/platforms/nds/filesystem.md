---
title: "NitroFS Filesystem"
description: "NDS NitroFS filesystem internals: FNT (File Name Table) and FAT (File Allocation Table) binary structures, directory walking, and how ndstool extracts and rebuilds the filesystem."
sidebar:
  order: 3
---

NDS ROMs contain a **NitroFS filesystem** -- a hierarchical file and directory
structure embedded in the cartridge data. Unlike older cartridge platforms where
you work with raw ROM offsets, NDS games reference data by filename through the
NitroSDK file API. Understanding NitroFS is essential for localization because
text, fonts, graphics, and script files are stored as named files that you can
extract, modify, and reinsert.

The filesystem is defined by two structures pointed to from the
[ROM header](./header/):

- **FNT (File Name Table)** at header offset `0x040` -- the directory tree
  (directory entries, filenames, parent/child relationships).
- **FAT (File Allocation Table)** at header offset `0x048` -- maps each file ID
  to its start and end offset within the ROM.

Source: [GBATEK -- DS Cartridge NitroROM and NitroARC File Systems](https://problemkaputt.de/gbatek-ds-cartridge-nitrorom-and-nitroarc-file-systems.htm)

## High-Level Structure

```
ROM Header
  |
  +---> FNT (at header[0x040])
  |       |
  |       +--- Main Table: one 8-byte entry per directory
  |       |     Entry 0 = root directory (ID 0xF000)
  |       |     Entry 1 = first subdirectory (ID 0xF001)
  |       |     ...
  |       +--- Sub-Tables: filenames + subdirectory references per directory
  |
  +---> FAT (at header[0x048])
          |
          +--- 8 bytes per file: [start_offset, end_offset]
               File ID 0x0000 = first entry
               File ID 0x0001 = second entry
               ...
```

Directories do not have FAT entries -- only files do. Directories are identified
by IDs starting at `0xF000` (the root directory) through `0xFFFF`, supporting up
to 4,096 directories. Files are identified by IDs `0x0000` through `0xEFFF`,
supporting up to 61,440 files.

## FNT: File Name Table

The FNT consists of two parts: a **main table** (fixed-size entries, one per
directory) followed by **sub-tables** (variable-length, one per directory,
containing filenames and subdirectory references).

### FNT Main Table

The main table begins at the FNT offset. Each entry is 8 bytes:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `+0x00` | 4 | Sub-table Offset | Offset to this directory's sub-table, relative to FNT start. |
| `+0x04` | 2 | First File ID | The file ID of the first file listed in this directory's sub-table. Subsequent files in the sub-table have IDs that increment from this value. |
| `+0x06` | 2 | Parent ID / Total Dirs | **Root entry (entry 0):** total number of directories (1--4,096). **All other entries:** parent directory ID (`0xF000`+). |

The number of directories (and therefore main-table entries) is given by the value
at `FNT + 0x06` in the root entry. The total main-table size is
`num_directories * 8` bytes.

**Example main table (3 directories):**

```
Offset  Bytes                     Meaning
------  --------                  -------
0x000:  18 00 00 00  00 00 03 00  Root dir: sub-table at FNT+0x18,
                                   first file ID = 0x0000,
                                   total dirs = 3
0x008:  40 00 00 00  05 00 00 F0  Dir 0xF001: sub-table at FNT+0x40,
                                   first file ID = 0x0005,
                                   parent = 0xF000 (root)
0x010:  58 00 00 00  08 00 01 F0  Dir 0xF002: sub-table at FNT+0x58,
                                   first file ID = 0x0008,
                                   parent = 0xF001
```

### FNT Sub-Tables

Each directory has a sub-table at the offset specified in its main-table entry.
The sub-table is a sequence of entries terminated by a `0x00` byte:

#### File Entry

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `+0x00` | 1 | Type/Length | `0x01`--`0x7F`: file entry. Low 7 bits = filename length. |
| `+0x01` | *N* | Filename | ASCII filename, *N* bytes (no null terminator). Case-sensitive. |

File entries do not carry an explicit file ID. The first file in a sub-table has
the file ID from the parent directory's main-table entry (`First File ID`), and
each subsequent file entry increments the ID by one.

#### Subdirectory Entry

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `+0x00` | 1 | Type/Length | `0x81`--`0xFF`: subdirectory entry. Low 7 bits = name length. (Bit 7 set = directory.) |
| `+0x01` | *N* | Directory Name | ASCII directory name, *N* bytes (no null terminator). |
| `+*N*+1` | 2 | Directory ID | The directory ID of this subdirectory (`0xF001`--`0xFFFF`). Points to a main-table entry at index `(ID - 0xF000)`. |

#### Terminator

A single `0x00` byte ends the sub-table. The value `0x80` is reserved and should
not appear.

**Example sub-table for root directory:**

```
Byte(s)  Meaning
-------  -------
04       File entry, name length = 4
"data"   Filename -> file ID 0x0000 (first file in root)
06       File entry, name length = 6
"script" Filename -> file ID 0x0001
84       Subdirectory entry (0x80 | 4), name length = 4
"font"   Directory name
01 F0    Directory ID = 0xF001
83       Subdirectory entry (0x80 | 3), name length = 3
"gfx"    Directory name
02 F0    Directory ID = 0xF002
00       Terminator
```

In this example, the root directory contains two files (`data` with ID `0x0000`,
`script` with ID `0x0001`) and two subdirectories (`font` = `0xF001`,
`gfx` = `0xF002`).

## FAT: File Allocation Table

The FAT is a flat array of 8-byte entries, one per file. The entry index equals
the file ID. Each entry gives the file's location within the ROM:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `+0x00` | 4 | Start Offset | Byte offset from the start of the ROM where the file data begins. |
| `+0x04` | 4 | End Offset | Byte offset of the first byte past the end of the file. File size = End - Start. |

**Example FAT (3 files):**

```
File ID  Start       End         Size
-------  ----------  ----------  -----
0x0000   0x00012000  0x00012800  0x800 (2,048 bytes)
0x0001   0x00012800  0x00015C00  0x3400 (13,312 bytes)
0x0002   0x00015C00  0x00016000  0x400 (1,024 bytes)
```

Constraints:
- In NitroROM (normal NDS cartridges), file start offsets must be >= `0x8000`
  (after the Secure Area).
- Files are typically aligned to 512-byte or 4-byte boundaries, though this
  varies by game and build tool.
- Directories have no FAT entries -- they exist only in the FNT.

## Walking the Filesystem: Step-by-Step Example

To find and read a file named `msg/dialogue.bin` in an NDS ROM:

### Step 1: Read FNT and FAT Locations from Header

```python
import struct

with open('game.nds', 'rb') as f:
    header = f.read(0x200)

fnt_off  = struct.unpack_from('<I', header, 0x040)[0]
fnt_size = struct.unpack_from('<I', header, 0x044)[0]
fat_off  = struct.unpack_from('<I', header, 0x048)[0]
fat_size = struct.unpack_from('<I', header, 0x04C)[0]
```

### Step 2: Read the FNT Main Table

```python
with open('game.nds', 'rb') as f:
    f.seek(fnt_off)
    fnt_data = f.read(fnt_size)

# Root entry (directory 0xF000)
root_subtable_off = struct.unpack_from('<I', fnt_data, 0)[0]
root_first_file   = struct.unpack_from('<H', fnt_data, 4)[0]
num_dirs          = struct.unpack_from('<H', fnt_data, 6)[0]
```

### Step 3: Walk the Root Sub-Table to Find "msg" Directory

```python
pos = root_subtable_off
file_id = root_first_file

while fnt_data[pos] != 0x00:
    type_len = fnt_data[pos]
    pos += 1

    if type_len & 0x80:
        # Subdirectory entry
        name_len = type_len & 0x7F
        name = fnt_data[pos:pos+name_len].decode('ascii')
        pos += name_len
        dir_id = struct.unpack_from('<H', fnt_data, pos)[0]
        pos += 2

        if name == 'msg':
            # Found it! Now walk directory 'dir_id'
            dir_index = dir_id - 0xF000
            msg_subtable_off = struct.unpack_from('<I', fnt_data, dir_index * 8)[0]
            msg_first_file   = struct.unpack_from('<H', fnt_data, dir_index * 8 + 4)[0]
            break
    else:
        # File entry
        name_len = type_len & 0x7F
        pos += name_len
        file_id += 1
```

### Step 4: Walk the "msg" Sub-Table to Find "dialogue.bin"

```python
pos = msg_subtable_off
file_id = msg_first_file

while fnt_data[pos] != 0x00:
    type_len = fnt_data[pos]
    pos += 1

    if type_len & 0x80:
        name_len = type_len & 0x7F
        pos += name_len + 2  # skip name + dir ID
    else:
        name_len = type_len & 0x7F
        name = fnt_data[pos:pos+name_len].decode('ascii')
        pos += name_len

        if name == 'dialogue.bin':
            target_file_id = file_id
            break
        file_id += 1
```

### Step 5: Look Up the FAT Entry and Read the File

```python
with open('game.nds', 'rb') as f:
    f.seek(fat_off + target_file_id * 8)
    start, end = struct.unpack('<II', f.read(8))

    f.seek(start)
    file_data = f.read(end - start)

print(f"File ID 0x{target_file_id:04X}: "
      f"ROM 0x{start:08X}--0x{end:08X} ({end - start} bytes)")
```

## Using ndstool

In practice, you will rarely walk the FNT/FAT manually. The standard tool for
NDS filesystem operations is **ndstool** from devkitPro:

### Extracting a ROM

```bash
ndstool -x game.nds \
  -9 arm9.bin \
  -7 arm7.bin \
  -y9 y9.bin \
  -y7 y7.bin \
  -d data \
  -y overlay \
  -t banner.bin \
  -h header.bin
```

This extracts:
- `arm9.bin` / `arm7.bin` -- the main binaries
- `y9.bin` / `y7.bin` -- overlay tables
- `data/` -- the NitroFS directory tree (all game files)
- `overlay/` -- overlay binaries (named by file ID)
- `banner.bin` -- icon/title block
- `header.bin` -- the ROM header

### Rebuilding a ROM

```bash
ndstool -c output.nds \
  -9 arm9.bin \
  -7 arm7.bin \
  -y9 y9.bin \
  -y7 y7.bin \
  -d data \
  -y overlay \
  -t banner.bin \
  -h header.bin
```

ndstool regenerates the FNT and FAT from the `data/` directory tree, recalculates
the header checksum, and produces a valid ROM. If you added or resized files, the
new FAT entries will reflect the updated offsets and sizes automatically.

### Listing Files

```bash
ndstool -l game.nds
```

Prints the complete file tree with file IDs, sizes, and ROM offsets.

## NitroARC (.narc) Files

Many NDS games use **NARC (Nitro Archive)** files within the NitroFS filesystem.
A NARC is essentially a mini-NitroFS embedded in a single file -- it has its own
FNT and FAT sections, containing a set of sub-files.

NARC files are commonly used to group related assets:
- A set of map scripts
- All dialogue for a chapter
- Sprite animation frames

The NARC format wraps FNT + FAT + file data in a standard Nitro container with
a `"NARC"` magic signature. Tools like Tinke can browse and extract NARC contents.
To edit files inside a NARC, you extract the NARC, modify the inner files, and
rebuild the NARC before reinserting it into the ROM.

## Practical Tips for Localization

1. **File identification:** After unpacking with ndstool, search the `data/`
   directory for files that might contain text. Common patterns:
   - Files named `msg_*.bin`, `text_*.dat`, `script_*.bin`
   - Files with recognizable Shift-JIS or UTF-16 text when viewed in a hex editor
   - NARC archives in directories named `message/`, `script/`, `text/`

2. **File resizing:** When translated text is longer than the original, the file
   grows. ndstool handles this transparently -- the rebuilt ROM's FAT will have
   the new offsets. However, if the game has internal offset tables within a file
   (e.g., a script file with a pointer table at the start), those must be updated
   manually.

3. **Overlay files:** Overlays appear in the NitroFS with file IDs referenced by
   the overlay table, but they are loaded by the system, not the game's file API.
   ndstool extracts them to a separate `overlay/` directory.

4. **File alignment:** Some games expect files at specific alignments (often
   512 bytes or 4 KB). ndstool's `-a` flag controls alignment during rebuild.
   If a game crashes after rebuild, try increasing alignment.

## References

- GBATEK -- DS Cartridge NitroROM and NitroARC File Systems:
  [https://problemkaputt.de/gbatek-ds-cartridge-nitrorom-and-nitroarc-file-systems.htm](https://problemkaputt.de/gbatek-ds-cartridge-nitrorom-and-nitroarc-file-systems.htm)
- ndstool source code:
  [https://github.com/devkitPro/ndstool](https://github.com/devkitPro/ndstool)
