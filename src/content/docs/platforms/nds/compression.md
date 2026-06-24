---
title: "NDS Compression"
description: "NDS compression formats for localization: LZ77 (type 0x10), LZ11 (type 0x11), Huffman (type 0x20/0x28), RLE (type 0x30), and BLZ (Bottom-LZ for overlays) -- identification, decompression, and recompression."
sidebar:
  order: 6
---

NDS games make heavy use of compression to fit data onto the cartridge and into
RAM. Text, fonts, graphics, and overlay code are frequently compressed. For
localization, you must be able to identify which compression format is used,
decompress the data for editing, and recompress it before reinserting.

The NDS BIOS provides built-in decompression routines (SWIs) for several formats,
and many games use the NitroSDK's software implementations of the same algorithms.
[Overlays](./overlays/) use a special **BLZ (Bottom-LZ)** variant for in-place
decompression.

Source: [GBATEK -- BIOS Decompression Functions](https://problemkaputt.de/gbatek-bios-decompression-functions.htm),
[GBATEK -- LZ Decompression Functions](https://problemkaputt.de/gbatek-lz-decompression-functions.htm)

## Identifying Compressed Data

All standard NDS compression formats share a common **4-byte data header**:

```
Byte 0:       Type + flags
Bytes 1--3:   Decompressed size (24-bit, little-endian)
```

The type byte identifies the format:

| Type Byte | Format | Description |
|-----------|--------|-------------|
| `0x10` | LZ77 (LZSS) | Lempel-Ziv with sliding window |
| `0x11` | LZ11 | Extended LZ with larger match lengths |
| `0x20` | Huffman 4-bit | Huffman coding, 4-bit data units |
| `0x28` | Huffman 8-bit | Huffman coding, 8-bit data units |
| `0x30` | RLE | Run-Length Encoding |
| (no header) | BLZ | Bottom-LZ, identified by overlay table flag |

The low nibble of the type byte encodes the data unit size for Huffman (4 or 8),
while the high nibble identifies the algorithm class (1 = LZ, 2 = Huffman,
3 = RLE).

**Quick identification:** Open a file in a hex editor and check the first byte.
If it is `0x10`, `0x11`, `0x20`, `0x28`, or `0x30`, the data is likely compressed
with the corresponding format. The next 3 bytes give the decompressed size, which
should be a reasonable value (not zero, not absurdly large).

## LZ77 / LZSS (Type 0x10)

The most common compression format on NDS. Used for graphics, text data, and
general file compression. This is the same format used by GBA BIOS SWI `0x11`.

### Data Header

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 1 | Type | `0x10` (LZ77). |
| `0x01` | 3 | Decompressed Size | Little-endian 24-bit value. |

### Compressed Data Stream

After the 4-byte header, data is organized in groups of a **flag byte** followed
by **eight blocks**:

```
[flag byte] [block 0] [block 1] ... [block 7]
[flag byte] [block 0] [block 1] ... [block 7]
...
```

The flag byte is read MSB-first (bit 7 = block 0, bit 6 = block 1, ..., bit 0 =
block 7).

#### Flag bit = 0: Uncompressed (literal byte)

Copy 1 byte directly to the output.

```
[Dd]
```

- `Dd` = the literal byte to output.

#### Flag bit = 1: Compressed (reference)

Copy a sequence of bytes from already-decompressed output (a back-reference).

```
[NP] [pp]
```

- `N` (bits 7--4 of first byte) = length minus 3. Match length = `N + 3` (range: 3--18).
- `Ppp` (bits 3--0 of first byte, all 8 bits of second byte) = displacement minus 1. Displacement = `Ppp + 1` (range: 1--4,096).

The decompressor copies `N + 3` bytes from position `(output_position - displacement)`
in the output buffer.

### Example

```
Header:  10 00 08 00          -> LZ77, decompressed size = 0x000800 (2,048 bytes)
Data:    00 41 42 43 44 45 46 47 48   -> flag=0x00 (all literal),
                                         outputs: A B C D E F G H
         80 10 05 ...                  -> flag=0x80 (bit7=1, rest=0),
                                         block 0: compressed,
                                         N=1 -> length=4, Ppp=0x005 -> disp=6
                                         copies 4 bytes from output[-6]
```

## LZ11 (Type 0x11)

An extended LZ format that supports longer match lengths than LZ77. Used in some
NDS games and DSi software.

### Data Header

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 1 | Type | `0x11` (LZ11). |
| `0x01` | 3 | Decompressed Size | Little-endian 24-bit value. |

### Compressed Blocks

LZ11 uses the same flag-byte structure as LZ77 (8 blocks per flag, MSB first),
but compressed blocks have variable-length encoding based on the high nibble of
the first byte:

#### Short match (high nibble 0x0, but N != 0)

Same as LZ77:

```
[NP] [pp]
Length = N + 1  (if N >= 2, i.e., actual match of 3+)
Displacement = Ppp + 1
```

Wait -- LZ11 redefines encoding thresholds:

#### Encoding variant 1: 2-byte reference (high nibble != 0)

```
[NP] [pp]
Length = N + 1      (range 2--16 with N = 1..F)
Displacement = Ppp + 1   (range 1--4,096)
```

#### Encoding variant 2: 3-byte reference (high nibble = 0, second nibble != 0)

```
[0N] [nn] [Pp] [pp]
Length = (Nnn) + 0x11     (range 0x11--0x110 = 17--272)
Displacement = Pppp + 1  (range 1--4,096)
```

#### Encoding variant 3: 4-byte reference (first byte = 0x0N where N=1)

```
[1N] [nn] [nn] [Pp] [pp]
Length = (Nnnnn) + 0x111  (range 0x111--0x10110 = 273--65,808)
Displacement = Pppp + 1  (range 1--4,096)
```

LZ11 allows much longer back-references, improving compression ratio for
repetitive data.

## Huffman (Type 0x20 / 0x28)

Huffman compression replaces fixed-length codes with variable-length codes based
on frequency -- common values get shorter codes. The NDS BIOS supports two
variants:

- **Type 0x20:** 4-bit data units (each decompressed unit is a nibble)
- **Type 0x28:** 8-bit data units (each decompressed unit is a byte)

### Data Header

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 1 | Type | `0x20` (4-bit) or `0x28` (8-bit). Low nibble = data unit size in bits. |
| `0x01` | 3 | Decompressed Size | Little-endian 24-bit value. |

### Huffman Tree

Immediately after the header, a **tree size byte** gives the size of the tree
data in bytes: `(tree_size_byte + 1) * 2`. The tree is stored as a flattened
binary tree:

Each tree node is 1 byte:

| Bit | Field | Description |
|-----|-------|-------------|
| 0--5 | Offset | Offset to the next child node pair (relative). |
| 6 | Flag 0 | 1 = left child (bit=0 path) is a data node. |
| 7 | Flag 1 | 1 = right child (bit=1 path) is a data node. |

Data nodes contain the actual value (4-bit or 8-bit depending on type).

### Bitstream

After the tree, the compressed data is a bitstream packed into 32-bit words
(little-endian). Bits are read **MSB first** within each word. Each bit
traverses the Huffman tree: 0 = left child, 1 = right child. When a data node
is reached, output the value and restart from the root.

### Localization Note

Huffman is less common for text data but sometimes used for compressed graphics
or font bitmaps. If a game compresses its NFTR font file or text archive with
Huffman, you need to decompress, edit, and recompress.

## RLE (Type 0x30)

Run-Length Encoding -- the simplest compression format. Efficient for data with
long runs of repeated bytes (e.g., mostly-empty tile maps).

### Data Header

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| `0x00` | 1 | Type | `0x30`. |
| `0x01` | 3 | Decompressed Size | Little-endian 24-bit value. |

### Compressed Data

After the header, data consists of alternating flag bytes and data:

#### Flag Byte Format

| Bit | Field | Description |
|-----|-------|-------------|
| 7 | Compressed Flag | 0 = uncompressed run, 1 = compressed run. |
| 0--6 | Length | Run length (encoded differently for each type). |

#### Uncompressed Run (bit 7 = 0)

```
[0nnnnnnn] [byte 0] [byte 1] ... [byte N]
```

Length = `(nnnnnnn) + 1` (range 1--128). Copy the following `Length` bytes
directly to output.

#### Compressed Run (bit 7 = 1)

```
[1nnnnnnn] [byte]
```

Length = `(nnnnnnn) + 3` (range 3--130). Repeat `byte` for `Length` times in
the output.

The minimum compressed run is 3 because runs of 1--2 are more efficiently stored
as uncompressed.

## BLZ (Bottom-LZ)

BLZ is a special LZ variant used for **overlay compression** (and sometimes the
ARM9 binary). Unlike the other formats which decompress forward from the start,
BLZ decompresses **backward from the end of the data**. This allows in-place
decompression: the compressed overlay is loaded to its target RAM address, then
decompressed in place by expanding backward into the BSS region.

See the [Overlays](./overlays/) page for details on the BLZ footer structure
and decompression process.

### Key BLZ Properties

- **No type-byte header.** BLZ data does not start with `0x1x` or similar.
  Instead, it is identified by the overlay table's compressed flag (bit 24 of
  the flags field).
- **Footer, not header.** The metadata is at the end of the compressed data
  (last 8--12 bytes).
- **Backward processing.** Decompression starts at the end and works toward
  the beginning.
- **In-place.** Designed so the compressed data can be loaded directly to the
  overlay's RAM address and decompressed without a separate buffer.

### BLZ Footer (Last 8 Bytes of Compressed Data)

| Offset from EOF | Size | Field | Description |
|-----------------|------|-------|-------------|
| `-8` | 3 | Extra Size | Number of bytes the decompressed data extends beyond the compressed data. Decompressed size = compressed size + extra size. |
| `-5` | 1 | Header Length | Offset from the start of compressed payload to the footer. |
| `-4` | 4 | Reserved/Padding | May be zero. |

The exact footer layout varies slightly between implementations, but the core
concept is the same: the footer tells the decompressor how much additional space
is needed and where the compressed payload starts.

## Compression in Practice

### Workflow for Editing Compressed Data

```
Original ROM
    |
    v
[Extract with ndstool]
    |
    v
compressed_file.bin
    |
    v
[Decompress with DSDecmp / custom tool]
    |
    v
decompressed_file.bin   <-- EDIT THIS
    |
    v
[Recompress with DSDecmp / custom tool]
    |
    v
recompressed_file.bin
    |
    v
[Rebuild ROM with ndstool]
    |
    v
Modified ROM
```

### Identifying Compression in Unknown Files

1. **Check the first byte** of the file:
   - `0x10` -> LZ77
   - `0x11` -> LZ11
   - `0x20` or `0x28` -> Huffman
   - `0x30` -> RLE

2. **Verify the decompressed size** (bytes 1--3). It should be a reasonable value.
   If it is `0x000000` or unreasonably large, the file may not be compressed or
   may use a custom format.

3. **Try decompressing.** DSDecmp will auto-detect the format and report errors
   if the data is not valid compressed data.

4. **Check for custom compression.** Some games use proprietary compression
   algorithms. If none of the standard formats work, the game may use:
   - A modified LZ variant with different length/displacement encoding
   - LZSS with a custom header
   - zlib/deflate (rare on NDS)
   - Game-specific encoding

### Tools

| Tool | Formats | Notes |
|------|---------|-------|
| **DSDecmp** | LZ10, LZ11, Huffman (4/8), RLE, BLZ | Primary NDS decompression tool. CLI. Supports auto-detection. |
| **ndstool** | BLZ (overlay decompression during extract) | Integrated with ROM extract/rebuild. |
| **lzss3** | LZ77/LZSS | Simple standalone compressor/decompressor. |
| **gbalzss** | LZ77 (GBA BIOS variant) | From devkitPro general-tools. Works for NDS LZ10 too. |
| **CUE's BLZ** | BLZ only | Standalone BLZ compressor/decompressor. |
| **Custom Python** | Any | For custom or modified compression formats. |

### DSDecmp Usage Examples

```bash
# Auto-detect and decompress
dsdecmp -d compressed.bin -o decompressed.bin

# Decompress a specific format
dsdecmp -d -t lz10 compressed.bin -o decompressed.bin

# Compress with LZ10
dsdecmp -c lz10 data.bin -o compressed.bin

# Compress with BLZ (for overlays)
dsdecmp -c blz overlay_dec.bin -o overlay.bin
```

### Common Pitfalls

1. **Recompression size.** After editing, the recompressed file may be larger
   than the original. For NitroFS files, this is fine -- ndstool rebuilds the
   FAT with new offsets. For overlays, a larger compressed size may require
   updating the overlay table entry.

2. **Multiple compression layers.** Some games compress files inside NARC
   archives, which are themselves inside the NitroFS. You may need to extract
   the NARC, then decompress the individual file within it.

3. **Compression + pointer tables.** If a compressed file contains internal
   pointer tables (e.g., a script file with offsets to each line of dialogue),
   the pointers reference positions in the *decompressed* data. Edit the
   decompressed data, update pointers if the data shifted, then recompress.

4. **ARM9 binary BLZ.** Some ROMs compress the tail of the ARM9 binary with
   BLZ (the Secure Area at the start must remain uncompressed). This is
   separate from overlay BLZ. The ARM9's BLZ footer is at the end of the
   ARM9 binary file.

5. **Bit-exact recompression.** The standard decompression algorithms are
   well-defined, but compression is heuristic -- different compressors may
   produce different (but equally valid) compressed output. The game's
   decompressor will handle any valid compressed stream, so the recompressed
   output does not need to be byte-identical to the original.

## References

- GBATEK -- BIOS Decompression Functions:
  [https://problemkaputt.de/gbatek-bios-decompression-functions.htm](https://problemkaputt.de/gbatek-bios-decompression-functions.htm)
- GBATEK -- LZ Decompression Functions:
  [https://problemkaputt.de/gbatek-lz-decompression-functions.htm](https://problemkaputt.de/gbatek-lz-decompression-functions.htm)
- DSDecmp:
  [https://github.com/Barubary/dsdecmp](https://github.com/Barubary/dsdecmp)
- devkitPro general-tools (gbalzss):
  [https://github.com/devkitPro/general-tools](https://github.com/devkitPro/general-tools)
