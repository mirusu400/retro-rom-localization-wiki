---
title: Compression
description: Identifying and handling compressed data in retro ROMs — LZ77, Huffman, RLE, GBA BIOS SWIs, and NDS overlays.
---

Many retro games compress text, graphics, or both to fit more content into limited ROM space.
Before you can edit compressed data, you must decompress it; after editing, you must
recompress it (or bypass the compression). This page covers the common algorithms, how to
identify them, and the tools to handle them.

## Why compression matters for localization

Compressed data cannot be edited in place. You must:

1. **Identify** which data is compressed and which algorithm is used.
2. **Decompress** the data to get the raw bytes.
3. **Edit** the decompressed data (translate text, replace font tiles, etc.).
4. **Recompress** and reinsert — or bypass the decompression routine entirely.
5. **Fix pointers** — recompressed data is almost never the same size as the original,
   breaking any pointer or offset that references data after the compressed block.

Skipping the "fix pointers" step is the most common source of crashes after editing
compressed data.

## Common compression algorithms

### LZ77 (Lempel-Ziv 77)

The most common compression algorithm on GBA and NDS. LZ77 replaces repeated byte sequences
with back-references: "copy N bytes from M bytes ago."

**GBA BIOS LZ77** is a standardized variant used by the GBA's built-in decompression SWI
(`SWI 0x11` / `SWI 0x12`). It has a recognizable header:

```
Offset  Size  Description
0x00    1     Type byte: 0x10 (LZ77)
0x01    3     Decompressed size (24-bit little-endian)
0x04    ...   Compressed data (flag bytes + literals/references)
```

The type byte `0x10` at the start of a block is a strong signature. Search the ROM for `0x10`
followed by a plausible decompressed size (a few KB to a few hundred KB).

**NDS** uses the same LZ77 format for overlays and many assets. Additionally, NDS titles may
use an enhanced LZ variant (type byte `0x11`) called **LZ11**, which supports longer back-
references.

### Huffman

Huffman coding assigns shorter bit-strings to more frequent bytes. The GBA BIOS provides a
Huffman decompression SWI (`SWI 0x13`).

**Header format:**
```
Offset  Size  Description
0x00    1     Type byte: 0x20 (4-bit Huffman) or 0x28 (8-bit Huffman)
0x01    3     Decompressed size (24-bit little-endian)
0x04    ...   Huffman tree + compressed data
```

The Huffman tree is stored inline before the compressed data, making the compressed block
somewhat self-contained.

### RLE (Run-Length Encoding)

The simplest compression scheme: runs of identical bytes are encoded as (count, byte) pairs.
The GBA BIOS provides an RLE SWI (`SWI 0x14`).

**Header format:**
```
Offset  Size  Description
0x00    1     Type byte: 0x30 (RLE)
0x01    3     Decompressed size (24-bit little-endian)
0x04    ...   Compressed data (flag bytes + runs/literals)
```

RLE is most effective on tile graphics with large flat-colored areas and less effective on
text data.

### Summary of GBA/NDS BIOS compression signatures

| Type byte | Algorithm | GBA SWI | Notes |
|-----------|-----------|---------|-------|
| `0x10` | LZ77 (LZSS) | `SWI 0x11` (8-bit) / `SWI 0x12` (16-bit) | Most common |
| `0x11` | LZ11 (extended) | NDS only | Longer back-references |
| `0x20` | Huffman (4-bit) | `SWI 0x13` | Good for nibble-oriented data |
| `0x28` | Huffman (8-bit) | `SWI 0x13` | Good for byte-oriented data |
| `0x30` | RLE | `SWI 0x14` | Simplest, least effective |

### Custom / proprietary compression

Older platforms (NES, GB, SNES) predate standardized compression SWIs. Games on these systems
use **custom compression routines** -- there is no universal signature and each game (or
developer) may use a different scheme. You must reverse-engineer the decompression routine
per game.

#### NES compression patterns

NES games using CHR ROM store tiles uncompressed (the PPU reads CHR ROM directly). Games
using **CHR RAM** copy tile data from PRG ROM to CHR RAM at runtime and can decompress
during the copy. Common NES compression formats
([NESdev Wiki: Tile compression](https://www.nesdev.org/wiki/Tile_compression)):

- **Byte-level RLE** -- the simplest and most common. A flag byte distinguishes literal runs
  from repeated-byte runs. Konami NES titles use a well-known RLE variant. Nintendo's own
  "Stripe Image" RLE appears in their arcade ports and Mario games.
- **PackBits** -- Apple's RLE format, adapted for NES. A signed length byte encodes either a
  literal run (positive) or a repeated byte (negative). Worst-case expansion is 1 byte per
  128 bytes.
- **PB53** -- operates on fixed 16-byte (one tile plane) units rather than freeform runs,
  making it easy to feed the PPU during vblank in fixed-size packets.
- **Simple LZSS** -- rare on NES because the 6502 can only shift one bit per instruction,
  making bit-field parsing slow. Where it appears (e.g., Zelda: Oracle games on GBC), the
  match/offset layout is game-specific.

Bit-oriented compression is uncommon on NES/GB because the 6502 and SM83 lack a barrel
shifter; shifting bits is cycle-expensive.

#### SNES compression patterns

SNES games almost always store tile data in VRAM (no CHR ROM), so compression is widespread.
Many SNES titles use an LZSS variant with a 1-bit literal/match flag and a 16-bit code for
match offset and length, but the **bit layout within that 16-bit code varies per game**.
Common patterns:

- **HAL Laboratory format** -- an RLE/LZ77 hybrid used across HAL's NES, SNES, and GB titles
  (Kirby, EarthBound/Mother 2). Supports byte/bit reversal of sequences. Open-source
  tooling: [exhal / inhal](https://github.com/devinacker/exhal).
- **Konami SNES format** -- a proprietary LZ scheme used in titles like TMNT: Turtles in Time.
  Dedicated compressor/decompressor available on
  [RHDN](https://www.romhacking.net/utilities/1102/).
- **Koei format** -- used for graphics and some text in Koei strategy games (Romance of the
  Three Kingdoms III/IV, Genghis Khan II). Dedicated tool on
  [RHDN](https://www.romhacking.net/utilities/1083/).
- **S-DD1 on-the-fly decompression** -- a special cartridge chip (Star Ocean, Street Fighter
  Alpha 2) that decompresses data at DMA speed directly to the PPU. Patching S-DD1 compressed
  data requires understanding the chip's algorithm; most hackers decompress the full asset and
  bypass the chip.

Unlike GBA/NDS, there is **no standard header byte** to scan for. You must trace the code.

#### GB / GBC compression

GB games face the same constraints as NES CHR-RAM games: tile data is copied to VRAM and can
be decompressed during the transfer. RLE and simple LZ are common. The Zelda Oracle games
use a per-block format selector (uncompressed, short-word LZ, long-word LZ, or common-byte
bitmask).

#### How to trace a custom decompressor

When there is no standard signature to scan for, use an emulator debugger:

1. **Find the compressed data.** Look for high-entropy blocks adjacent to structured data in
   the ROM. If you know the decompressed result (e.g., a font tileset visible in VRAM), note
   its VRAM address.
2. **Set a write breakpoint** on the WRAM or VRAM destination where the decompressed data
   appears. On NES, this is often a write to `$2007` (PPUDATA) or a WRAM staging buffer. On
   SNES, watch DMA destination registers or the WRAM buffer address.
3. **Trigger the decompression** (load the relevant screen/scene). The debugger breaks inside
   the decompression routine.
4. **Set a read breakpoint** on the source address in ROM that the routine is reading from.
   This confirms exactly which ROM bytes are compressed input.
5. **Single-step through the routine** and pseudocode it. Key things to identify:
   - How does it distinguish literals from back-references (flag byte? flag bits?)?
   - What is the match-length and offset encoding (how many bits each, what bias)?
   - Is there an end-of-stream sentinel or does a header specify the output size?
   - Does it operate on bytes, nibbles, or bits?
6. **Write a matching decompressor** in Python (or similar) and verify that your output is
   byte-identical to what the game produces. Then write the inverse compressor.

Tools like **bsnes-plus** (SNES), **FCEUX** / **Mesen2** (NES), and **SameBoy** / **mGBA**
(GB/GBC) all support the memory breakpoints and trace logging needed for this workflow.

#### Existing game-specific compressor tools

The ROM hacking community has already reverse-engineered compression for many popular titles.
Before writing your own, check
[RHDN's compression utilities section](https://www.romhacking.net/?page=utilities&category=22)
for an existing tool. Notable examples:

| Tool | Games / Developer | Link |
|------|-------------------|------|
| **exhal / inhal** | HAL Laboratory titles (Kirby, EarthBound) | [github.com/devinacker/exhal](https://github.com/devinacker/exhal) |
| **Konami SNES Compressor** | Konami SNES titles | [romhacking.net/utilities/1102](https://www.romhacking.net/utilities/1102/) |
| **Koei Decompress** | Koei SNES strategy games | [romhacking.net/utilities/1083](https://www.romhacking.net/utilities/1083/) |
| **Chrono Compressor** | Chrono Trigger | [romhacking.net/utilities/1003](https://www.romhacking.net/utilities/1003/) |

## Identifying compressed data

### Scan for BIOS compression headers (GBA/NDS)

Search the ROM for bytes `0x10`, `0x20`, `0x28`, or `0x30` where the following three bytes
form a plausible decompressed size:

```python
import struct

def scan_lz77(rom: bytes) -> list[tuple[int, int]]:
    hits = []
    for i in range(len(rom) - 4):
        if rom[i] == 0x10:
            size = struct.unpack_from('<I', rom, i)[0] >> 8
            if 0x100 < size < 0x100000:  # plausible range
                hits.append((i, size))
    return hits
```

Not every hit is real — `0x10` appears in normal data too. Validate by attempting to
decompress and checking whether the decompressed size matches the header.

### Entropy analysis

Compressed data has higher entropy (more "random-looking") than uncompressed data. A simple
byte-frequency histogram of a ROM region can distinguish compressed blocks from structured
data like text or tile graphics.

### Breakpoint on the decompression SWI

On GBA, set a breakpoint on `SWI 0x11` (LZ77 decompression). When the game calls it, the
registers will tell you:
- **r0** — source address (the compressed data in ROM)
- **r1** — destination address (the WRAM buffer)

This directly reveals which ROM regions are LZ77-compressed.

## Decompressing for editing

### Using gbalzss (GBA/NDS LZ77)

[gbalzss](https://github.com/devkitPro/general-tools) from devkitPro handles GBA BIOS LZ77:

```bash
# Decompress
gbalzss d compressed.bin decompressed.bin

# Recompress
gbalzss e decompressed.bin recompressed.bin
```

To extract a compressed block from a ROM, carve it out with `dd` or a hex editor first:

```bash
dd if=game.gba of=compressed.bin bs=1 skip=$((0x1A000)) count=$((0x800))
gbalzss d compressed.bin decompressed.bin
# Edit decompressed.bin...
gbalzss e decompressed.bin recompressed.bin
```

Then reinsert `recompressed.bin` into the ROM at the original offset.

### Using DSDecmp (NDS)

[DSDecmp](https://github.com/Barubary/dsdecmp) handles LZ10, LZ11, Huffman (4-bit/8-bit),
and RLE — all the NDS BIOS formats:

```bash
# Decompress (auto-detects algorithm)
dsdecmp -d compressed.bin decompressed.bin

# Recompress with LZ10
dsdecmp -c lz10 decompressed.bin recompressed.bin
```

DSDecmp auto-detects the algorithm from the type byte header.

## Recompression strategies

### Same-algorithm recompression

The cleanest approach: decompress, edit, recompress with the same algorithm. The recompressed
block will almost certainly be a **different size** than the original — you must handle this.

### Bypass decompression entirely

If ROM space allows, replace the compressed block with uncompressed data and patch the game
code to skip the decompression call. This is often simpler than writing a perfect recompressor
for a custom algorithm:

1. Find the `JSR`/`BL`/`SWI` instruction that calls the decompression routine.
2. Replace it with a direct memory copy (or `NOP` it out if the data can be read in place from
   ROM — possible on GBA where ROM is memory-mapped).
3. Write the uncompressed data where the compressed block used to be (expanding the ROM if it
   does not fit).

**Trade-off:** uncompressed data is larger, so you may need
[ROM expansion](/retro-rom-localization-wiki/encoding-and-fonts/#rom-expansion).

### NDS overlay decompression

NDS ROMs use an **overlay table** (OVT) that lists code/data overlays loaded at runtime.
Overlays can be individually compressed (usually LZ10). The overlay table has a flag byte
indicating compression. To edit an overlay:

1. Decompress the overlay.
2. Edit it.
3. Either recompress and update the OVT compressed-size field, or mark the overlay as
   uncompressed in the OVT flag and store the raw data.
4. Rebuild the ROM with [ndstool](/retro-rom-localization-wiki/tools/#rom-unpack--build-nds-filesystem).

## The pointer problem

Recompressed blocks are rarely the same size. Every offset or pointer in the ROM that
references data **after** the modified block must be adjusted by the size difference. This
cascading effect is the main danger of editing compressed data.

### Mitigation strategies

- **Fixed-size slot:** if there is padding or free space after the original compressed block,
  and the recompressed block fits in the same slot, no pointers need to change.
- **Relocate to free space:** move the recompressed block to unused ROM space and update the
  single pointer that references it. This avoids cascading pointer changes.
- **ROM expansion:** append the recompressed data at the end of the ROM (especially easy on
  GBA/NDS) and update the pointer.

See [Pointers](/retro-rom-localization-wiki/pointers/) for detailed strategies.

## Compressed text vs compressed graphics

| Concern | Compressed text | Compressed graphics |
|---------|----------------|-------------------|
| Frequency | Less common (NES/GB rarely compress text) | Very common (tiles compress well) |
| Size change after edit | Usually grows (translations expand) | Varies (new font may be similar size) |
| Decompression timing | At text-display time | Often at scene/map load |
| Bypass feasibility | Usually feasible (text is small) | May require ROM expansion (tiles are large) |

On GBA and NDS, both text and graphics are commonly compressed. On NES and GB, graphics are
sometimes compressed but text rarely is (the ROM is small enough that compression is not
needed for text).

## Further reading

- [Text Engine RE](/retro-rom-localization-wiki/text-engine/) — finding whether text is
  compressed before reaching the text engine
- [Pointers](/retro-rom-localization-wiki/pointers/) — fixing pointers after recompression
  changes block sizes
- [Encoding & Fonts](/retro-rom-localization-wiki/encoding-and-fonts/) — ROM expansion when
  uncompressed data does not fit
- [Tools](/retro-rom-localization-wiki/tools/) — gbalzss, DSDecmp, and other utilities
