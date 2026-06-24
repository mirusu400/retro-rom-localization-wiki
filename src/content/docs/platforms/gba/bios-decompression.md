---
title: "GBA BIOS Decompression"
description: "GBA BIOS decompression SWI functions (LZ77, Huffman, RLE) with detailed data format specifications, header identification, and practical techniques for decompressing and recompressing game data during localization."
sidebar:
  order: 5
---

Many GBA games use the BIOS's built-in decompression functions to compress graphics, fonts, and
sometimes text data. Understanding these formats is critical for localization: you must decompress
the data, modify it, and recompress it before reinserting.

The BIOS decompression functions are invoked via the ARM **SWI** (Software Interrupt) instruction.
Because these are standardized BIOS routines, the compressed data format is the same across all
GBA games that use them.

Source: [GBATEK — BIOS Decompression Functions](https://problemkaputt.de/gbatek-bios-decompression-functions.htm)

## Overview of decompression SWIs

| SWI | Name | Target | Compression |
|---|---|---|---|
| `0x11` | LZ77UnCompReadNormalWrite8bit | WRAM | LZ77 (sliding window) |
| `0x12` | LZ77UnCompReadNormalWrite16bit | VRAM | LZ77 (16-bit writes for VRAM) |
| `0x13` | HuffUnCompReadNormal | WRAM/VRAM | Huffman (4-bit or 8-bit) |
| `0x14` | RLUnCompReadNormalWrite8bit | WRAM | Run-Length Encoding |
| `0x15` | RLUnCompReadNormalWrite16bit | VRAM | RLE (16-bit writes for VRAM) |

The "Write8bit" variants write byte-by-byte and are used for WRAM destinations. The "Write16bit"
variants write in 16-bit halfwords, which is required for VRAM (VRAM does not support 8-bit
writes on GBA).

**Calling convention** (all decompression SWIs):
- `r0` = source address (pointer to compressed data in ROM or RAM)
- `r1` = destination address (pointer to output buffer in WRAM or VRAM)

## Common data header

All three compression types share a **4-byte header** at the start of the compressed data:

```
Byte 0 (bits 4-7): Compression type identifier
Byte 0 (bits 0-3): Reserved (usually 0)
Bytes 1-3:         Decompressed data size (24-bit, little-endian)

  Byte 0           Byte 1      Byte 2      Byte 3
  [type | 0000]    [size_lo]   [size_mid]  [size_hi]
```

| Type nibble | Byte 0 value | Compression |
|---|---|---|
| `0x1` | `0x10` | LZ77 |
| `0x2` | `0x20` | Huffman (8-bit symbols) |
| `0x2` | `0x28` | Huffman (4-bit symbols) |
| `0x3` | `0x30` | RLE |

The decompressed size in bytes is `(Byte3 << 16) | (Byte2 << 8) | Byte1`.

## LZ77 (SWI 0x11 / 0x12)

LZ77 is the **most common** compression used in GBA games. It uses a sliding window of up to
4096 bytes to reference previously decompressed data.

### Data format

```
[4-byte header: 0x10, size_lo, size_mid, size_hi]
[flag byte] [8 blocks] [flag byte] [8 blocks] ...
```

**Flag byte**: 8 bits, processed from MSB (bit 7) to LSB (bit 0). Each bit corresponds to one
of the following 8 data blocks:

- **Bit = 0**: Uncompressed block — copy 1 raw byte from source to destination.
- **Bit = 1**: Compressed block — 2 bytes encoding a back-reference.

### Compressed block format (2 bytes)

```
  Byte 1              Byte 2
  [len | disp_hi]     [disp_lo]

  Bits 4-7 of Byte 1: Length - 3    (value 0-15, actual length 3-18 bytes)
  Bits 0-3 of Byte 1: Displacement high nibble
  Bits 0-7 of Byte 2: Displacement low byte

  Displacement = (disp_hi << 8) | disp_lo    (range: 1-4095, stored as 0-4094)
  Length = (len_field) + 3                     (range: 3-18)
```

The match copies `Length` bytes from position `(current_output_position - Displacement - 1)` in
the already-decompressed output.

**Important**: The VRAM variant (SWI `0x12`) requires displacement >= `0x001` (not `0x000`).

### LZ77 decompression pseudocode

```python
def decompress_lz77(data: bytes) -> bytes:
    assert data[0] == 0x10, "Not LZ77 compressed"
    size = data[1] | (data[2] << 8) | (data[3] << 16)
    output = bytearray()
    pos = 4  # skip header

    while len(output) < size:
        flags = data[pos]; pos += 1

        for bit in range(7, -1, -1):  # MSB first
            if len(output) >= size:
                break

            if flags & (1 << bit):  # compressed block
                b1 = data[pos]; b2 = data[pos + 1]; pos += 2
                length = ((b1 >> 4) & 0x0F) + 3
                disp = ((b1 & 0x0F) << 8) | b2
                for _ in range(length):
                    output.append(output[-disp - 1])
            else:  # uncompressed block
                output.append(data[pos]); pos += 1

    return bytes(output[:size])
```

## Huffman (SWI 0x13)

Huffman compression is less common than LZ77 but used in some games for text or small data
blocks.

### Data format

```
[4-byte header: 0x20 or 0x28, size_lo, size_mid, size_hi]
[tree_size byte]
[tree_data: (tree_size * 2 + 1) bytes]
[compressed bitstream]
```

**Header byte**:
- `0x20` = 8-bit Huffman (each decoded symbol is one byte)
- `0x28` = 4-bit Huffman (each decoded symbol is one nibble; two symbols per output byte)

**Tree structure**:
- First byte: tree size (number of nodes = `(tree_size * 2 + 1)` bytes)
- Each node is 1 byte:
  - Bits 0-5: Offset to children (relative, in halfwords)
  - Bit 6: Right child is a leaf node (1 = leaf)
  - Bit 7: Left child is a leaf node (1 = leaf)

**Bitstream**:
- Processed 32 bits at a time, MSB first (bit 31 is the first bit read).
- Traverse the tree: bit 0 = go left, bit 1 = go right.
- When a leaf is reached, output the leaf's value and restart from the root.

## RLE (SWI 0x14 / 0x15)

Run-Length Encoding is the simplest compression type. It works well for data with long runs of
repeated bytes (e.g., mostly-blank tile graphics).

### Data format

```
[4-byte header: 0x30, size_lo, size_mid, size_hi]
[flag + data] [flag + data] ...
```

**Flag byte**:

```
Bit 7 = 0 (uncompressed run):
  Bits 0-6: Length - 1  (value 0-127, actual length 1-128)
  Followed by Length raw bytes to copy.

Bit 7 = 1 (compressed/repeated run):
  Bits 0-6: Length - 3  (value 0-127, actual length 3-130)
  Followed by 1 byte to repeat Length times.
```

### RLE decompression pseudocode

```python
def decompress_rle(data: bytes) -> bytes:
    assert data[0] == 0x30, "Not RLE compressed"
    size = data[1] | (data[2] << 8) | (data[3] << 16)
    output = bytearray()
    pos = 4

    while len(output) < size:
        flag = data[pos]; pos += 1

        if flag & 0x80:  # compressed run
            length = (flag & 0x7F) + 3
            value = data[pos]; pos += 1
            output.extend([value] * length)
        else:  # uncompressed run
            length = (flag & 0x7F) + 1
            output.extend(data[pos:pos + length])
            pos += length

    return bytes(output[:size])
```

## How to identify compressed data in a ROM

### Scan for header bytes

Search the ROM for candidate compression headers:

```python
import struct

def scan_for_compressed(rom: bytes, comp_type: int = 0x10):
    """Scan ROM for potential LZ77/Huffman/RLE compressed blocks."""
    results = []
    for offset in range(0, len(rom) - 4, 4):  # headers are word-aligned
        if rom[offset] == comp_type:
            size = rom[offset+1] | (rom[offset+2] << 8) | (rom[offset+3] << 16)
            if 0x20 <= size <= 0x40000:  # reasonable decompressed size (32 B - 256 KB)
                results.append((offset, size))
    return results

with open("game.gba", "rb") as f:
    rom = f.read()

# Scan for LZ77
for offset, size in scan_for_compressed(rom, 0x10):
    print(f"LZ77 candidate at 0x{offset:06X}, decompressed size: {size} bytes")

# Scan for RLE
for offset, size in scan_for_compressed(rom, 0x30):
    print(f"RLE candidate at 0x{offset:06X}, decompressed size: {size} bytes")
```

**Caveats**: Not every byte `0x10` in the ROM is an LZ77 header. Filter results by checking:
- The decompressed size is reasonable (not 0, not larger than available RAM).
- The data after the header parses correctly (flag bytes and blocks are valid).
- The offset is word-aligned (4-byte aligned) — BIOS SWIs require this.

### Breakpoint on SWI calls

The most reliable method: use an emulator's debugger to intercept BIOS calls.

**In mGBA**:
1. Open the debugger (Tools -> Debugger).
2. Set a breakpoint at the SWI handler or use mGBA's Lua scripting to hook SWI calls.
3. When the game calls SWI `0x11` (LZ77), examine registers:
   - `r0` = source address (compressed data in ROM, `0x08xxxxxx`)
   - `r1` = destination (decompressed output, usually EWRAM `0x02xxxxxx` or VRAM `0x06xxxxxx`)
4. Convert `r0` from CPU address to ROM file offset: `file_offset = r0 - 0x08000000`.

**In Mesen2** (GBA mode):
1. Use the debugger's breakpoint feature to break on SWI instructions.
2. Examine the call stack and registers.

This directly tells you **what data is compressed, where it lives in ROM, and where it is
decompressed to** — far more reliable than scanning.

### Identify the type from context

- **Font/tile graphics** are most often LZ77 compressed (SWI `0x11`/`0x12`).
- **Tilemaps** are sometimes RLE compressed (SWI `0x14`/`0x15`) because tile maps have long
  runs of the same tile index.
- **Huffman** (SWI `0x13`) is occasionally used for text data or small lookup tables.

## Tools for decompression and recompression

### gbalzss (devkitPro general-tools)

Part of devkitPro's general-tools package. Handles GBA BIOS-compatible LZ77:

```bash
# Decompress
gbalzss d compressed.bin decompressed.bin

# Compress (for reinsertion)
gbalzss e decompressed.bin recompressed.bin
```

Install via devkitPro's pacman: `dkp-pacman -S general-tools`.

### DSDecmp

Originally for NDS but handles GBA BIOS formats too (LZ77, Huffman, RLE):

```bash
# Decompress (auto-detects type from header)
dsdecmp -d compressed.bin decompressed.bin
```

Source: https://github.com/Barubary/dsdecmp

### Custom Python scripts

For full control, write your own using the pseudocode above. This is especially useful when:
- Compressed data has been slightly modified from the standard format.
- You need to handle recompression with specific constraints (output must fit in original space).
- You want to batch-process multiple compressed blocks.

## Workflow for modifying compressed data

1. **Locate** the compressed block in ROM (by scanning or SWI breakpoint).
2. **Extract** the raw compressed bytes from the ROM file.
3. **Decompress** with gbalzss or your own script.
4. **Modify** the decompressed data (edit font tiles, change text, etc.).
5. **Recompress** the modified data.
6. **Compare sizes**: if the recompressed data is the same size or smaller, overwrite in place.
   If larger, you need to relocate:
   - Append the new compressed data at the end of the ROM.
   - Update the pointer that references the compressed block to point to the new location.
   - See [Pointers](/retro-rom-localization-wiki/pointers/) for pointer relocation strategies.
7. **Test** in mGBA — verify the data decompresses correctly and displays as expected.

### Size constraint problem

Recompressed data is often **larger** than the original because:
- You added more glyph tiles (more unique data = worse compression ratio).
- You changed text that happened to compress well into text that does not.

Solutions:
- **Relocate** the compressed block to free space at the end of the ROM.
- **Expand the ROM** by padding it (GBA ROMs can be up to 32 MB).
- **Store data uncompressed** if there is enough space — change the game code to skip the SWI
  call and use a direct `memcpy` instead. This requires patching the ARM/Thumb code.

## References

- [GBATEK — BIOS Decompression Functions](https://problemkaputt.de/gbatek-bios-decompression-functions.htm)
- [GBATEK (main)](https://problemkaputt.de/gbatek.htm)
- [gbalzss / general-tools](https://github.com/devkitPro/general-tools)
- [DSDecmp](https://github.com/Barubary/dsdecmp)
