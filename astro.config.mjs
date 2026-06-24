// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
	site: 'https://mirusu400.github.io',
	base: '/retro-rom-localization-wiki',
	integrations: [
		starlight({
			title: 'Retro Game Localization Wiki',
			plugins: [
				starlightLlmsTxt({
					projectName: 'Retro Game Localization Wiki',
					customSets: [
						// --- Guide (cross-cutting docs) ---
						{ label: 'Localization Pipeline', description: 'End-to-end workflow for localizing a retro game ROM', paths: ['pipeline'] },
						{ label: 'Text Engine RE', description: 'Charset recovery, .tbl tables, DTE/MTE, control codes, render routine', paths: ['text-engine'] },
						{ label: 'Encoding and Fonts', description: 'Glyph-slot problem, tile-based vs VWF fonts, single/multi-byte encoding', paths: ['encoding-and-fonts'] },
						{ label: 'Pointer Tables', description: 'Pointer relocation strategies when translated text changes length', paths: ['pointers'] },
						{ label: 'Compression', description: 'LZ77, Huffman, RLE identification and handling in retro ROMs', paths: ['compression'] },
						{ label: 'Tools', description: 'Assemblers, tile editors, text inserters, emulators, patching utilities', paths: ['tools'] },
						// --- NES ---
						{ label: 'NES Overview', description: '6502 CPU, PPU, CHR-ROM/RAM, mapper banking', paths: ['platforms/nes', 'platforms/nes/index'] },
						{ label: 'NES Header', description: 'iNES / NES 2.0 header format, byte-by-byte layout', paths: ['platforms/nes/header'] },
						{ label: 'NES Mappers', description: 'NROM, MMC1, UxROM, MMC3, MMC5 bank switching', paths: ['platforms/nes/mappers'] },
						{ label: 'NES PPU and CHR', description: '2bpp tiles, pattern tables, nametables, CHR-ROM vs CHR-RAM', paths: ['platforms/nes/ppu-chr'] },
						{ label: 'NES Text Patterns', description: 'Encoding schemes, DTE/MTE, control codes, pointer tables', paths: ['platforms/nes/text-patterns'] },
						// --- SNES ---
						{ label: 'SNES Overview', description: '65816 CPU, LoROM/HiROM, DMA, VWF feasibility', paths: ['platforms/snes', 'platforms/snes/index'] },
						{ label: 'SNES Header', description: 'ROM header fields, map mode, checksum calculation', paths: ['platforms/snes/header'] },
						{ label: 'SNES Memory Map', description: 'LoROM/HiROM bank layouts, address conversion formulas', paths: ['platforms/snes/memory-map'] },
						{ label: 'SNES Graphics', description: '2/4/8bpp tiles, BG modes, VRAM, DMA, VWF implementation', paths: ['platforms/snes/graphics'] },
						{ label: 'SNES Text Patterns', description: 'Pointer formats, Shift-JIS, DTE/MTE, script bytecodes, asar patching', paths: ['platforms/snes/text-patterns'] },
						// --- GB/GBC ---
						{ label: 'GB-GBC Overview', description: 'SM83 CPU, 2bpp tiles, MBC banking overview', paths: ['platforms/gb-gbc', 'platforms/gb-gbc/index'] },
						{ label: 'GB-GBC Header', description: 'Cartridge header, type codes, checksum algorithms', paths: ['platforms/gb-gbc/header'] },
						{ label: 'GB-GBC MBC Banking', description: 'MBC1/3/5 registers, bank switching, ROM expansion', paths: ['platforms/gb-gbc/mbc-banking'] },
						{ label: 'GB-GBC Tiles and VRAM', description: '2bpp tile format, VRAM layout, addressing modes, GBC enhancements', paths: ['platforms/gb-gbc/tiles-vram'] },
						{ label: 'GB-GBC Text Patterns', description: 'Tile-index encoding, DTE/MTE, pointer formats, VWF', paths: ['platforms/gb-gbc/text-patterns'] },
						// --- GBA ---
						{ label: 'GBA Overview', description: 'ARM7TDMI, flat 32 MB ROM, BIOS SWIs', paths: ['platforms/gba', 'platforms/gba/index'] },
						{ label: 'GBA Header', description: 'ROM header format, fields, checksum algorithm', paths: ['platforms/gba/header'] },
						{ label: 'GBA Memory Map', description: 'All address regions, bus widths, ROM at 0x08000000', paths: ['platforms/gba/memory-map'] },
						{ label: 'GBA Graphics', description: 'BG modes, 4bpp/8bpp tiles, charblocks, OBJ, palettes', paths: ['platforms/gba/graphics'] },
						{ label: 'GBA BIOS Decompression', description: 'LZ77/Huffman/RLE SWI data formats and identification', paths: ['platforms/gba/bios-decompression'] },
						{ label: 'GBA Text Patterns', description: 'Shift-JIS, custom encodings, VWF, ARM/Thumb code patterns', paths: ['platforms/gba/text-patterns'] },
						// --- NDS ---
						{ label: 'NDS Overview', description: 'Dual ARM CPUs, NitroFS, overlay-based code loading', paths: ['platforms/nds', 'platforms/nds/index'] },
						{ label: 'NDS Header', description: 'ROM header 0x000-0x200, ARM9/ARM7, FNT/FAT offsets', paths: ['platforms/nds/header'] },
						{ label: 'NDS Filesystem', description: 'NitroFS FNT/FAT binary structures, directory walking', paths: ['platforms/nds/filesystem'] },
						{ label: 'NDS Fonts', description: 'NFTR format: FINF, CGLP, CWDH, CMAP sections', paths: ['platforms/nds/fonts'] },
						{ label: 'NDS Graphics', description: 'Dual 2D engines, VRAM banks A-I, BG/OBJ, extended palettes', paths: ['platforms/nds/graphics'] },
						{ label: 'NDS Overlays', description: 'Overlay table, BLZ compression, finding text in overlays', paths: ['platforms/nds/overlays'] },
						{ label: 'NDS Compression', description: 'LZ77/LZ11/Huffman/RLE/BLZ formats and tools', paths: ['platforms/nds/compression'] },
						{ label: 'NDS Text Patterns', description: 'File-based text, BMG format, Shift-JIS/UTF-16LE, NitroSDK', paths: ['platforms/nds/text-patterns'] },
						// --- Languages ---
						{ label: 'Korean Hangul', description: '11,172 syllable repertoire, slot overflow, 3 encoding strategies', paths: ['languages/korean'] },
					],
				}),
			],
			sidebar: [
				{
					label: 'Guide',
					items: [
						'pipeline',
						'text-engine',
						'encoding-and-fonts',
						'pointers',
						'compression',
						'tools',
						'roundtrip-verification',
					],
				},
				{
					label: 'Platforms',
					items: [
						{
							label: 'NES / Famicom',
							items: [{ autogenerate: { directory: 'platforms/nes' } }],
						},
						{
							label: 'SNES / Super Famicom',
							items: [{ autogenerate: { directory: 'platforms/snes' } }],
						},
						{
							label: 'Game Boy / GBC',
							items: [{ autogenerate: { directory: 'platforms/gb-gbc' } }],
						},
						{
							label: 'Game Boy Advance',
							items: [{ autogenerate: { directory: 'platforms/gba' } }],
						},
						{
							label: 'Nintendo DS',
							items: [{ autogenerate: { directory: 'platforms/nds' } }],
						},
					],
				},
				{ label: 'Languages', items: [{ autogenerate: { directory: 'languages' } }] },
			],
		}),
	],
});
