# CLAUDE.md — Retro Game Localization Wiki

This repository is a **docgen wiki for retro-game localization / fan-translation patching**:
the ROM, filesystem, and game-structure knowledge needed to translate retro games into *any*
target language. It is published two ways from one source, and **both are hosted together on
GitHub Pages**:

- a **human wiki** — an Astro + Starlight documentation site, and
- a **machine/agent feed** — auto-generated `llms.txt`, `llms-full.txt`, and `llms-small.txt`
  served at the site root.

The core is **language-agnostic**; anything specific to one target language (glyph repertoire,
font count, composition rules) lives in its own page under `src/content/docs/languages/`.
Korean/Hangul is the first such page, not the framing of the whole wiki.

Claude Code uses this file to author/extend wiki content and to maintain the build/host pipeline.

## 0. Scope (initial experimental targets)

| Tag | System | CPU | Medium | Primary reference |
| --- | --- | --- | --- | --- |
| NES | Famicom / NES | 6502 (2A03) | ROM cart | NESdev Wiki |
| SNES | Super Famicom / SNES | 65816 | ROM cart | SNESdev Wiki + fullsnes |
| GB/GBC | Game Boy / Color | LR35902 (SM83) | ROM cart | Pan Docs |
| GBA | Game Boy Advance | ARM7TDMI | ROM cart | GBATEK |
| NDS | Nintendo DS | ARM9 + ARM7 | NitroFS cart | GBATEK |

Other systems are added later using the same page template.

## 1. Invariants (never violated, in any task)

1. **Never commit copyrighted artifacts.** Original ROMs, disc images, saves, and extracted game
   assets (graphics/audio/original script text) must never be in the repo. Commit only wiki docs,
   build config, translator-authored translation data, and patch files. Enforce with `.gitignore`.
2. **Methodology only.** This wiki documents *hardware facts and working methods*. Cite primary
   sources; reconstruct/summarize rather than copy verbatim. (Pan Docs is CC0 — free to reuse.)
3. **Roundtrip first.** For any data, prove "extract -> reinsert -> byte-identical to original"
   before changing its contents.
4. **PoC gate.** Do not start expensive, hard-to-revert work (bulk translation, full pointer
   rebuild, ROM expansion) until **one glyph of the target script renders on the real screen**.
5. **Verify against primary sources.** Take addresses, registers, header offsets, and formats from
   the references in section 4 — not from memory — and leave source links on the page.

## 2. Repository architecture (Astro + Starlight, dual hosting)

Static site generator: **Astro** with the **Starlight** docs theme. `llms.txt` files are produced
automatically at build time by the **`starlight-llms-txt`** plugin. One `pnpm build` emits the HTML
wiki *and* the llms files into `dist/`; one GitHub Pages deployment hosts both.

```
.
├── src/
│   └── content/
│       └── docs/                  # Wiki content (Markdown/MDX) — the single source of truth
│           ├── index.mdx          # Landing page
│           ├── pipeline.md        # End-to-end localization pipeline
│           ├── text-engine.md     # Text-engine RE (.tbl, DTE/MTE, control codes, render hook)
│           ├── encoding-and-fonts.md  # Language-AGNOSTIC: charset, fixed vs variable-width fonts
│           ├── pointers.md        # Pointer-table relocation
│           ├── compression.md     # Compression (LZ77/Huffman/RLE) identify & restore
│           ├── tools.md           # CLI tools & emulators (section 6)
│           ├── platforms/
│           │   └── nes.md  snes.md  gb-gbc.md  gba.md  nds.md
│           └── languages/
│               └── korean.md      # Language-SPECIFIC: Hangul repertoire, font count, strategies
├── astro.config.mjs               # Starlight + starlight-llms-txt + site/base + sidebar
├── package.json                   # astro, @astrojs/starlight, starlight-llms-txt
├── pnpm-lock.yaml
├── tsconfig.json
├── .github/workflows/deploy.yml
└── CLAUDE.md (this file)
```

### Hosting model (wiki + llms.txt together)

GitHub Pages serves a single deployment from `dist/`:

- Human wiki: `https://<USER>.github.io/<REPO>/` (Starlight UI: sidebar, search, dark mode).
- Agent feed at the site root: `/llms.txt` (curated index with links + descriptions),
  `/llms-full.txt` (all pages concatenated), `/llms-small.txt` (compact, for small context windows).

Both come from the same `src/content/docs/` Markdown, so they never drift. Each page's front-matter
`title` and `description` feed both the wiki UI and the llms.txt index.

### astro.config.mjs (essentials)

```js
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  site: 'https://YOUR_ID.github.io',
  base: '/retro-localization-wiki',          // = repo name, leading slash; needed for Pages links
  integrations: [
    starlight({
      title: 'Retro Game Localization Wiki',
      plugins: [
        starlightLlmsTxt({ projectName: 'Retro Game Localization Wiki' }),
        // optional: starlight-links-validator to fail the build on broken internal links
      ],
      sidebar: [
        { label: 'Guide', items: ['pipeline', 'text-engine', 'encoding-and-fonts', 'pointers', 'compression', 'tools'] },
        { label: 'Platforms', autogenerate: { directory: 'platforms' } },
        { label: 'Languages', autogenerate: { directory: 'languages' } },
      ],
    }),
  ],
});
```

`starlight-llms-txt` supports `description`, `details`, `optionalLinks`, and custom `docSet`s/
`promote`/`demote`/`exclude` (slugs or globs) to shape the generated files — use these to point the
agent feed's "References" section at the external primary docs (section 4) and to promote the index.

### Build / preview / deploy

- Install: `pnpm install`
- Preview: `pnpm dev` (http://localhost:4321)
- Build (wiki + llms files into `dist/`): `pnpm build`; inspect with `pnpm preview`
- Deploy: push to `main` -> GitHub Actions uses Astro's **official** GitHub Pages flow — a build job
  with `actions/checkout` + `withastro/action` (installs, builds, uploads the Pages artifact),
  then a deploy job with `actions/deploy-pages`. Permissions `pages: write`, `id-token: write`.
  Copy the current action versions from the official guide:
  https://docs.astro.build/en/guides/deploy/github/ . One-time: repo **Settings -> Pages ->
  Source = GitHub Actions**, and set `base` in `astro.config.mjs` to `/<REPO>`.

## 3. Platform page template (shared TOC for every platforms/*.md)

Follow these 9 sections (skip any that don't apply). Front-matter `title:` and `description:`
required (Starlight + llms.txt both use them). Keep everything **target-script-neutral**; link to
`languages/` for script specifics.

1. Overview — CPU / medium / endianness / typical localization difficulty
2. Cartridge / ROM header — offset table, checksum recomputation
3. Memory map / banking (or filesystem) — address space needed to interpret pointers
4. Graphics & fonts — tile bit-depth, how fonts are stored
5. Typical text engine — encoding, control codes, DTE/MTE tendencies
6. Localization notes — charset expansion / VWF feasibility / ROM-expansion conventions,
   with a link to the relevant `languages/*.md` for script-specific glyph concerns
7. Patch patterns — pointer relocation, ASM hooks, expansion conventions
8. Build / patch / verify — which CLI tools & emulators to use (section 6)
9. References — primary-source links (sections 4-5)

Cross-cutting docs (text-engine, encoding-and-fonts, pointers, compression) hold platform-neutral
strategy; platform pages link to them.

## 4. Per-platform primary references (verify & cite when writing pages)

### NES / Famicom
- NESdev Wiki (main): https://www.nesdev.org/wiki/Nesdev_Wiki
- NES reference guide (index): https://www.nesdev.org/wiki/NES_reference_guide
- Header: iNES https://www.nesdev.org/wiki/INES · NES 2.0 https://www.nesdev.org/wiki/NES_2.0
- Mappers (banking): https://www.nesdev.org/wiki/Mapper
- PPU (pattern tables / nametables / CHR): https://www.nesdev.org/wiki/PPU_programming
- 6502 CPU: https://www.nesdev.org/wiki/CPU
- Note: NES text is usually 2bpp 8x8 CHR tiles + nametable indices.

### SNES / Super Famicom
- SNESdev Wiki: https://snes.nesdev.org/wiki/SNESdev_Wiki
- fullsnes (nocash, most comprehensive): https://problemkaputt.de/fullsnes.htm
- Anomie's SNES docs (via RHDN community docs)
- undisbeliever register docs: https://undisbeliever.net/snesdev/
- Memory map: LoROM/HiROM; cartridge header at $FFC0/$FFD0 (title, mapping, checksum) — see the
  "SNES Cart" chapter in fullsnes. PPU tiles are 2/4/8bpp.

### GB / GBC — Pan Docs (CC0, free to reuse)
- Main: https://gbdev.io/pandocs/
- Cartridge header: https://gbdev.io/pandocs/The_Cartridge_Header.html
- MBC (banking): https://gbdev.io/pandocs/MBCs.html
- Tiles/maps: https://gbdev.io/pandocs/Tile_Data.html , https://gbdev.io/pandocs/Tile_Maps.html

### GBA — GBATEK
- Main: https://problemkaputt.de/gbatek.htm
- ROM header (0xA0 title, 0xBD checksum), memory map (ROM at 0x08000000), BIOS decompression SWIs
  (LZ77 / Huffman / RLE).

### NDS — GBATEK
- Main: https://problemkaputt.de/gbatek.htm
- Key: ROM header (FNT at 0x040 / FAT at 0x048), **NitroFS (FNT + FAT) filesystem**,
  ARM9/ARM7 + overlays, NFTR fonts.

## 5. Cross-cutting localization knowledge (language-agnostic pages)

- **text-engine.md** — relative search to recover the charset, `.tbl` tables, DTE/MTE (one byte =
  two chars / a word), control-code table (linebreak / box / name-substitution / end), and locating
  the font-render routine (the hook point for variable-width rendering).
- **encoding-and-fonts.md** — the general localization problem is *the target script's glyph
  repertoire vs the game's available glyph slots*. Covers: tile-based fonts vs glyph atlases,
  fixed-width vs **variable-width fonts (VWF)**, single-byte vs multi-byte encoding, expanding the
  charset / reclaiming DTE slots, and ROM-expansion trade-offs. Stays neutral; defers script-size
  and composition specifics to `languages/`.
- **pointers.md** — absorb translated-length changes (in-place / recompute / relocate), bank
  boundaries, absolute pointers (e.g. GBA 0x08xxxxxx).
- **compression.md** — identify LZ77/Huffman/RLE (esp. GBA BIOS SWIs, NDS), restore, recompress.

### Language-specific pages (`src/content/docs/languages/`)

Each target language gets one page with the same shape: *glyph repertoire & size, the slot problem
for this script, recommended encoding strategy, font-design notes, examples*. Currently:

- **korean.md (Hangul)** — the 11,172-syllable repertoire (initial 19 x medial 21 x final 28) and
  why it overflows typical <=256 slots; the three strategies — (A) precomposed subset of syllables
  actually used, (B) jamo composition (initial/medial/final, rendered/atlas-composed, needs a render
  hook), (C) VWF + full glyph atlas in expanded ROM with multi-byte codes; jamo decomposition
  (`code - 0xAC00` -> cho/jung/jong); Korean readability favoring ~12-16px (so VWF is usually needed).

## 6. CLI tools & emulators (collect into tools.md)

> Prefer cross-platform CLI / scriptable tools. Give each a one-line "what it's for" and install hint.

### Assemblers / toolchains

| Platform | Tool | Use | Link |
| --- | --- | --- | --- |
| NES | cc65 (ca65/ld65, da65) | 6502 assemble/link/disassemble | https://cc65.github.io/ |
| NES/SNES | 64tass | 6502/65816 multi-assembler | https://sourceforge.net/projects/tass64/ |
| SNES | asar | 65816 patch assembler (patches ROM directly; standard) | https://github.com/RPGHacker/asar |
| GB/GBC | RGBDS (rgbasm/rgblink/rgbfix) | SM83 assemble/link, header fix | https://rgbds.gbdev.io/ |
| GBA/NDS | devkitPro / devkitARM | arm-none-eabi toolchain, ships ndstool | https://devkitpro.org/ |

### ROM unpack / build (NDS filesystem)

| Tool | Use | Link |
| --- | --- | --- |
| ndstool | NDS ROM <-> NitroFS folder unpack/rebuild (CLI, devkitPro) | https://github.com/devkitPro/ndstool |
| Tinke | NDS asset browser/converter (GUI, helper) | https://github.com/pleonex/tinke |

### Graphics / tiles / fonts

| Tool | Use | Link |
| --- | --- | --- |
| rgbgfx | PNG <-> GB 2bpp tiles (RGBDS, CLI) | https://rgbds.gbdev.io/docs/rgbgfx.1 |
| superfamiconv | SNES/GB tile/palette/map conversion (CLI) | https://github.com/Optiroc/SuperFamiconv |
| Tile Molester / YY-CHR | general tile editing (GUI; find font location) | (use a current fork) |

### Text extract / insert

| Tool | Use | Link |
| --- | --- | --- |
| Cartographer | `.tbl`-based text dumper (CLI) | https://www.romhacking.net/utilities/647/ |
| Atlas | `.tbl`-based text inserter + pointer recompute (CLI) | https://www.romhacking.net/utilities/224/ |
| (custom) python + .tbl | roundtrip + project-specific extract/insert (recommended) | — |

### Compression

| Tool | Use | Link |
| --- | --- | --- |
| gbalzss | GBA BIOS LZ77 (de)compress (devkitPro general-tools) | https://github.com/devkitPro/general-tools |
| DSDecmp | NDS LZ/Huffman/RLE decompress & recompress (CLI) | https://github.com/Barubary/dsdecmp |

### Patch create / apply

| Tool | Use | Link |
| --- | --- | --- |
| Flips | IPS/BPS create & apply (`flips --create a.gba b.gba p.bps`) | https://github.com/Alcaro/Flips |
| xdelta3 | delta patches for large files (NDS etc.) | https://github.com/jmacd/xdelta |

### Emulators (debugging / scripting / CLI)

| Emulator | Targets | Notes | Link |
| --- | --- | --- | --- |
| mGBA | GB/GBC/GBA | Lua scripting, memory breakpoints, CLI; high accuracy | https://mgba.io/ |
| Mesen2 | NES/SNES/GB/GBC/GBA | strong debugger + Lua, cross-platform | https://github.com/SourMesen/Mesen2 |
| FCEUX | NES | Lua + debugger, Linux CLI | https://fceux.com/ |
| bsnes-plus | SNES | debugger / accuracy (RE work) | https://github.com/devinacker/bsnes-plus |
| SameBoy | GB/GBC | very accurate; `sameboy` / tester CLI | https://sameboy.github.io/ |
| DeSmuME | NDS | `desmume-cli`, Lua | https://desmume.org/ |
| melonDS | NDS | high accuracy (mostly GUI) | https://melonds.kuribo64.net/ |

### Binary / reverse-engineering helpers

| Tool | Use |
| --- | --- |
| radare2 / rizin | multi-arch disassembly & analysis (check 6502/65816/ARM/SM83 support level) |
| Ghidra | decompilation / RE (community SNES/GB/GBA loaders) |
| xxd / hexdump / ImHex | hex inspection, relative search, pattern hunting |

## 7. Work order

1. Bootstrap the site: scaffold Astro + Starlight (`pnpm create astro@latest -- --template starlight`),
   add `starlight-llms-txt`, set `site`/`base`/`sidebar` in `astro.config.mjs`, add the Pages workflow
   from Astro's official guide.
2. Write the cross-cutting docs + `tools.md` (sections 5 and 6).
3. Write platform pages from the section-3 template, verifying facts against section-4 primary
   sources. Start with NES and SNES, then GB/GBC, GBA, NDS.
4. Write `languages/korean.md` (Hangul specifics) as the first language page.
5. `pnpm build` clean -> confirm `dist/llms.txt`, `dist/llms-full.txt`, `dist/llms-small.txt` exist
   and the wiki renders -> check every page has `title:` + `description:` -> commit & push ->
   verify the Pages deploy serves both the wiki and `/llms.txt`.

## 8. Style

- **Write wiki content in English** (the localization audience is international). Language-specific
  pages may include examples in their target script.
- Hex for addresses/offsets; include a source link next to non-obvious facts.
- Separate confirmed facts from guesses (mark "unconfirmed" as such).
- Cross-reference pages with relative links so the build's link validation stays green; add
  `starlight-links-validator` if you want broken links to fail the build.