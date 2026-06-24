---
title: "Roundtrip Verification"
description: "Platform-specific checklists to prove extract → reinsert → byte-identical before modifying content."
---

Roundtrip verification is the single most important safety check in ROM localization work.
If you cannot extract data from a ROM and reinsert it to produce a byte-identical file, your
insertion toolchain has a bug — and that bug will silently corrupt every translation you apply.
Prove the roundtrip is clean **before** you change any content.

## Universal workflow

Regardless of platform, the procedure is the same:

1. **Hash the original ROM** (SHA-256). Record this value — it is your baseline.
2. **Extract** the data you intend to modify (text, graphics, compressed blocks, filesystem).
3. **Reinsert** the extracted data without making any changes.
4. **Hash the result** (SHA-256) and compare to step 1.
5. If the hashes match, your extract/insert pipeline is sound. If they differ, find and fix the
   discrepancy before touching any content.

### Hash comparison (shell)

```bash
# Compute SHA-256 of both files and compare
sha256sum original.rom rebuilt.rom
# Or on macOS:
shasum -a 256 original.rom rebuilt.rom
```

If both lines show the same hash, the roundtrip is clean.

### Hash comparison (Python)

```python
import hashlib, sys

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

a, b = sys.argv[1], sys.argv[2]
ha, hb = sha256_file(a), sha256_file(b)
if ha == hb:
    print(f"PASS  {ha}")
else:
    print(f"FAIL  {a}: {ha}")
    print(f"      {b}: {hb}")
    sys.exit(1)
```

### Binary diff for diagnosing mismatches

When hashes differ, locate the exact bytes that changed:

```bash
# Show first difference offset
cmp -l original.rom rebuilt.rom | head -20
# Or use Python:
python3 -c "
a=open('original.rom','rb').read(); b=open('rebuilt.rom','rb').read()
for i,(x,y) in enumerate(zip(a,b)):
    if x!=y: print(f'0x{i:06X}: {x:02X} -> {y:02X}')
if len(a)!=len(b): print(f'Size: {len(a)} vs {len(b)}')
" | head -20
```

Common difference locations point to specific problems: differences in the first few hundred
bytes usually mean a header or checksum was recalculated; differences at section boundaries
usually mean padding or alignment changed.

---

## NES / Famicom

### Tools

- **Hex editor** (xxd, ImHex) for manual text/graphics extraction.
- **[Cartographer](https://www.romhacking.net/utilities/647/)** / **[Atlas](https://www.romhacking.net/utilities/224/)** for `.tbl`-based text dump/insert with pointer recomputation.
- Custom Python scripts for project-specific extract/insert.

### Extract / reinsert cycle

NES ROMs are flat binary files (PRG-ROM + CHR-ROM) preceded by a 16-byte
[iNES header](https://www.nesdev.org/wiki/INES). The header is not part of the game data — it
was created by the dumper. For roundtrip purposes, you typically operate only on the data
portion (everything after byte `0x10`, or `0x210` if a 512-byte "trainer" is present).

**Text roundtrip:**

1. Dump text using Cartographer or a custom script with your `.tbl` file.
2. Reinsert the **unmodified** dump using Atlas or the same script.
3. Compare the full ROM (header included) with `sha256sum`.

### Known gotchas

| Issue | Detail |
|---|---|
| **Copier headers** | Some ROM dumps carry a 512-byte copier header before the iNES header. Tools may strip or add this, changing the file size. Always verify whether your ROM has one (`file_size % 0x4000 == 0x210` suggests a trainer; `file_size % 0x4000 == 0x200` suggests a copier header). Strip copier headers before any work. See [NESdev: iNES](https://www.nesdev.org/wiki/INES). |
| **iNES header edits** | Some tools "fix" the iNES header (mapper bits, mirroring) on load. Diff the first 16 bytes separately if the full-file hash differs. The iNES header is not checked by the console — only by emulators. |
| **PRG padding** | NES PRG-ROM must be a multiple of 16 KiB. If your insertion causes the file to end at a non-aligned boundary, the tool may have silently truncated or padded. |
| **CHR-ROM vs CHR-RAM** | Games using CHR-RAM (mapper writes tiles at runtime) have no CHR-ROM section in the file. Do not try to extract tiles from the file for these games — they exist only in PRG-ROM as data. |

### Success criteria

The SHA-256 of the full `.nes` file (header + PRG + CHR) must be identical before and after
the no-op reinsert.

---

## SNES / Super Famicom

### Tools

- **[asar](https://github.com/RPGHacker/asar)** for ASM patch assembly (patches ROM in place).
- **Hex editor** or custom scripts for text/graphics.
- **[Atlas](https://www.romhacking.net/utilities/224/)** / custom Python for text insert + pointer recompute.

### Extract / reinsert cycle

SNES ROMs are flat binary, either **LoROM** or **HiROM** layout. The internal header sits at
`$00:7FC0` (LoROM) or `$00:FFC0` (HiROM) in the SNES address space, which maps to file offset
`0x7FC0` or `0xFFC0` (headerless). See
[SNESdev Wiki: ROM header](https://snes.nesdev.org/wiki/ROM_header).

**Text roundtrip:** Same as NES — dump, reinsert unchanged, compare hashes.

### Known gotchas

| Issue | Detail |
|---|---|
| **Copier (SMC) headers** | A 512-byte (`0x200`) copier header may precede the ROM data. Detect: `file_size % 0x8000 == 0x200`. Strip it before work; add it back only for distribution to copier users. All internal ROM offsets assume a headerless file. See [SnesLab: SNES ROM Header](https://sneslab.net/wiki/SNES_ROM_Header). |
| **Internal checksum** | The SNES header contains a 16-bit checksum at `0x7FDE`-`0x7FDF` (LoROM) and its complement at `0x7FDC`-`0x7FDD`. If any ROM byte changes, these must be recalculated. For a no-op roundtrip they should not change — if they do, your tool is modifying data. See [fullsnes: SNES Cart](https://problemkaputt.de/fullsnes.htm). |
| **Non-power-of-2 sizes** | Some games are 3 MB (2 MB + 1 MB), 1.5 MB, etc. Emulators mirror the smaller bank to fill the address space. Your rebuild tool must preserve the exact file size — do not pad to the next power of 2 unless the original was already padded. |
| **LoROM/HiROM misdetection** | If your tool guesses the mapping mode wrong, every computed offset is incorrect. Verify the map-mode byte at internal header offset `0x15` (`$FFD5` HiROM / `$7FD5` LoROM): `$20` = LoROM, `$21` = HiROM, `$23` = SA-1, `$25` = ExHiROM. |

### Success criteria

SHA-256 of the full ROM (with or without copier header — be consistent) must match. Additionally,
verify the internal checksum bytes have not changed.

---

## GB / GBC

### Tools

- **[RGBDS](https://rgbds.gbdev.io/)** (`rgbasm`, `rgblink`, `rgbfix`, `rgbgfx`) for assembly and tile conversion.
- **Hex editor** or custom scripts for text extraction.

### Extract / reinsert cycle

Game Boy ROMs are flat binary. The cartridge header occupies `0x100`-`0x14F`.
See [Pan Docs: The Cartridge Header](https://gbdev.io/pandocs/The_Cartridge_Header.html).

**Graphics roundtrip (using rgbgfx):**

```bash
# Extract tiles from ROM region to PNG
rgbgfx -r 0,256 -o tiles.2bpp rom_region.bin
# Or: dd the tile region out, convert to PNG, convert back, dd back in
```

### Known gotchas

| Issue | Detail |
|---|---|
| **`rgbfix` recalculates checksums** | Running `rgbfix -v` overwrites the header checksum (`0x14D`) and global checksum (`0x14E`-`0x14F`), plus the Nintendo logo (`0x104`-`0x133`). **Never** run `rgbfix` as part of a roundtrip test on an existing commercial ROM — it will change these bytes. `rgbfix` is for building homebrew ROMs from scratch, not for patching existing ones. See [rgbfix(1)](https://rgbds.gbdev.io/docs/v0.5.0/rgbfix.1). |
| **Header checksum (`0x14D`)** | This is a simple sum: `x = 0; for i in 0x134..0x14C: x = x - mem[i] - 1`. The Game Boy boot ROM checks this — if it is wrong, the game will not boot on real hardware. If your tool modifies any byte in `0x134`-`0x14C`, it must recalculate this. For a no-op roundtrip, it must not change. |
| **Global checksum (`0x14E`-`0x14F`)** | Sum of all bytes in the ROM except `0x14E` and `0x14F` themselves, stored big-endian. The console does **not** check this, but it is useful for verification. If your roundtrip changes data anywhere, this value should reflect it. |
| **MBC banking** | Text or graphics may span bank boundaries (each bank is 16 KiB). Ensure your extract/insert tool handles bank-crossing correctly — a common bug is writing past the end of a bank and overwriting the next bank's first bytes. See [Pan Docs: MBCs](https://gbdev.io/pandocs/MBCs.html). |
| **ROM size padding** | Valid ROM sizes are powers of 2 times 32 KiB (32 KiB, 64 KiB, ..., 8 MiB). The ROM size byte at `0x148` must match the actual file size. `rgbfix -p 0xFF` pads to the next valid size — again, do not use this on an existing commercial ROM during roundtrip testing. |

### Success criteria

SHA-256 of the full `.gb` / `.gbc` file must match. Separately verify that bytes `0x14D`-`0x14F`
(header and global checksums) are unchanged.

---

## GBA

### Tools

- **Hex editor** or custom scripts for text and graphics extraction.
- **[gbalzss](https://github.com/devkitPro/general-tools)** for LZ77 decompression/recompression.
- **Custom Python** for project-specific pipelines.

### Extract / reinsert cycle

GBA ROMs are flat 32-bit ARM binaries, max 32 MiB. The header occupies `0x000`-`0x0BF`.
ROM data is mapped at `0x08000000` in the ARM address space, so a pointer value of
`0x08012345` refers to file offset `0x12345`. See
[GBATEK: GBA Cartridge Header](https://problemkaputt.de/gbatek.htm).

**Compressed-data roundtrip (LZ77):**

```bash
# Decompress a BIOS-LZ77 block (SWI 0x11 format)
gbalzss d compressed.bin decompressed.bin
# Recompress
gbalzss e decompressed.bin recompressed.bin
# Compare to original compressed block
sha256sum compressed.bin recompressed.bin
```

**Important:** LZ77 recompression is generally **not** byte-identical to the original because
multiple valid compressed representations exist. The roundtrip check for compression is:
decompress original, decompress your recompressed output, and verify the **decompressed** data
matches. Then verify the recompressed data fits in the original space (same size or smaller).

### Known gotchas

| Issue | Detail |
|---|---|
| **Header checksum (`0xBD`)** | A single-byte checksum over `0xA0`-`0xBB`. Formula: `chk = -(sum(rom[0xA0:0xBC]) + 0x19) & 0xFF`. The BIOS checks this — wrong value = white screen. For a no-op roundtrip, this byte must not change. |
| **No copier header** | GBA ROMs have no copier header tradition. If the file size is not a multiple of some expected alignment, the file may have been truncated or padded by a dumper. |
| **Compression is not bijective** | As noted above, LZ77/Huffman/RLE recompression will almost never produce the same bytes as the original compressor. Design your roundtrip test around the decompressed content, not the compressed bytes. |
| **Pointer format** | GBA pointers include the `0x08000000` base. A common insertion bug is writing file offsets instead of mapped addresses (or vice versa). If your rebuilt ROM runs but shows garbage text, check pointer byte order (little-endian) and base address. |
| **ROM padding** | Commercial ROMs are typically padded to a power-of-2 size with `0xFF`. If your tool truncates trailing `0xFF` bytes, the file size changes but the game still works. Compare hashes after ensuring consistent padding. |

### Success criteria

SHA-256 of the full `.gba` file must match for non-compressed-data roundtrips. For compressed
data, verify decompressed content matches and recompressed size fits the original allocation.

---

## NDS

### Tools

- **[ndstool](https://github.com/devkitPro/ndstool)** (devkitPro) for NitroFS extract/rebuild.
- **[Tinke](https://github.com/pleonex/tinke)** for GUI-based asset browsing and replacement.
- **[ndspy](https://ndspy.readthedocs.io/)** (Python library) for programmatic NDS ROM manipulation.
- **[DSDecmp](https://github.com/Barubary/dsdecmp)** for LZ/Huffman/RLE decompression.

### Extract / reinsert cycle

NDS ROMs contain a filesystem (NitroFS) defined by the FNT (File Name Table, header offset
`0x40`) and FAT (File Allocation Table, header offset `0x48`), plus ARM9/ARM7 binaries and
overlays. See [GBATEK: NDS Cartridge Header](https://problemkaputt.de/gbatek.htm).

**Filesystem roundtrip with ndstool:**

```bash
# Extract
ndstool -x game.nds \
  -9 arm9.bin -7 arm7.bin \
  -y9 y9.bin -y7 y7.bin \
  -d data -y overlay \
  -t banner.bin -h header.bin

# Rebuild (no changes)
ndstool -c rebuilt.nds \
  -9 arm9.bin -7 arm7.bin \
  -y9 y9.bin -y7 y7.bin \
  -d data -y overlay \
  -t banner.bin -h header.bin

# Compare
sha256sum game.nds rebuilt.nds
```

### Known gotchas — ndstool roundtrip is NOT byte-identical

This is the most important caveat on this page. **ndstool extract + rebuild does not produce a
byte-identical ROM** in the general case. Known causes of differences:

| Issue | Detail |
|---|---|
| **Padding byte mismatch** | The original ROM may use `0x00` padding in some gaps and `0xFF` in others. ndstool typically writes `0xFF` for all padding during rebuild. This alone causes hash mismatches. |
| **Section alignment** | ndstool may place ARM9, ARM7, overlays, and filesystem data at different aligned offsets than the original ROM used. The FAT entries change accordingly. |
| **Header CRC recalculation** | The secure-area CRC at header offset `0x06C` and the header checksum at `0x15E` are recalculated during rebuild. |
| **ROM size padding** | ndstool pads the rebuilt ROM to the nearest power-of-2 boundary, which may differ from the original's padding. |

**Workaround — file-level roundtrip instead:**

Since the full-ROM roundtrip fails, verify at the **individual file** level instead:

1. Extract the NitroFS filesystem.
2. Identify the specific files you will modify (text files, font files, graphic archives).
3. For each target file, extract its content, reinsert unchanged, and verify the **file** is
   byte-identical.
4. After modifying and reinserting your changed files, rebuild the ROM and test in an emulator.
   Accept that the rebuilt ROM will differ from the original at the binary level.

```python
#!/usr/bin/env python3
"""NDS file-level roundtrip check: verify individual NitroFS files survive
your extract/modify/reinsert pipeline."""
import os, hashlib

def hash_dir(path):
    """Return dict of {relative_path: sha256} for all files under path."""
    result = {}
    for root, _, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            rel = os.path.relpath(fp, path)
            h = hashlib.sha256()
            with open(fp, "rb") as fh:
                while chunk := fh.read(65536):
                    h.update(chunk)
            result[rel] = h.hexdigest()
    return result

# After two extractions (original and rebuilt):
orig = hash_dir("data_original")
rebuilt = hash_dir("data_rebuilt")

ok = True
for k in sorted(set(orig) | set(rebuilt)):
    if k not in orig:
        print(f"ADDED    {k}")
        ok = False
    elif k not in rebuilt:
        print(f"MISSING  {k}")
        ok = False
    elif orig[k] != rebuilt[k]:
        print(f"CHANGED  {k}")
        ok = False

print("PASS" if ok else "FAIL")
```

**Alternative tools:** [ndspy](https://ndspy.readthedocs.io/) provides Python-level control over
ROM packing and may allow closer-to-identical rebuilds by preserving original offsets. For
critical work, consider binary-patching individual files in place (updating FAT entries) rather
than doing a full ROM rebuild.

### Success criteria

- **Individual NitroFS files:** SHA-256 of each extracted file must match after a no-op
  reinsert cycle.
- **Full ROM:** Will differ from the original due to ndstool rebuild behavior. This is expected.
  Verify correctness by running the rebuilt ROM in
  [melonDS](https://melonds.kuribo64.net/) or [DeSmuME](https://desmume.org/) and confirming
  identical behavior.

---

## Automated roundtrip check script

The following shell script automates the universal roundtrip check for flat-binary ROMs
(NES, SNES, GB/GBC, GBA). It does not apply to NDS, where you should use the file-level
approach described above.

```bash
#!/usr/bin/env bash
# roundtrip-check.sh — verify an extract/insert cycle is byte-identical
# Usage: roundtrip-check.sh <original.rom> <rebuilt.rom>
set -euo pipefail

if [ $# -ne 2 ]; then
    echo "Usage: $0 <original.rom> <rebuilt.rom>"
    exit 1
fi

ORIG="$1"
REBUILT="$2"

# Pick the right sha256 command
if command -v sha256sum &>/dev/null; then
    SHA=sha256sum
elif command -v shasum &>/dev/null; then
    SHA="shasum -a 256"
else
    echo "ERROR: no sha256sum or shasum found" >&2
    exit 1
fi

HASH_ORIG=$($SHA "$ORIG" | awk '{print $1}')
HASH_REBUILT=$($SHA "$REBUILT" | awk '{print $1}')

echo "Original: $HASH_ORIG  $ORIG"
echo "Rebuilt:  $HASH_REBUILT  $REBUILT"

if [ "$HASH_ORIG" = "$HASH_REBUILT" ]; then
    echo "PASS — roundtrip is byte-identical"
    exit 0
else
    echo "FAIL — files differ"
    # Show first differences
    if command -v cmp &>/dev/null; then
        echo "First differences (offset, orig-byte, rebuilt-byte):"
        cmp -l "$ORIG" "$REBUILT" 2>/dev/null | head -10
    fi
    # Show size difference if any
    SIZE_ORIG=$(wc -c < "$ORIG")
    SIZE_REBUILT=$(wc -c < "$REBUILT")
    if [ "$SIZE_ORIG" -ne "$SIZE_REBUILT" ]; then
        echo "Size mismatch: $SIZE_ORIG vs $SIZE_REBUILT bytes"
    fi
    exit 1
fi
```

Save as `roundtrip-check.sh`, run `chmod +x roundtrip-check.sh`, and use it after every
extract/reinsert cycle.
