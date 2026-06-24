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
						{
							label: 'Guide',
							description: 'Cross-cutting localization methodology — pipeline, text engines, encoding, pointers, compression, and tools',
							paths: ['pipeline', 'text-engine', 'encoding-and-fonts', 'pointers', 'compression', 'tools'],
						},
						{
							label: 'NES',
							description: 'NES / Famicom — 6502 CPU, iNES header, mappers, PPU/CHR tiles, text patterns',
							paths: ['platforms/nes/**'],
						},
						{
							label: 'SNES',
							description: 'SNES / Super Famicom — 65816 CPU, LoROM/HiROM, multi-bpp tiles, DMA, text patterns',
							paths: ['platforms/snes/**'],
						},
						{
							label: 'GB-GBC',
							description: 'Game Boy / Game Boy Color — SM83 CPU, MBC banking, 2bpp tiles, VRAM, text patterns',
							paths: ['platforms/gb-gbc/**'],
						},
						{
							label: 'GBA',
							description: 'Game Boy Advance — ARM7TDMI, flat ROM, BIOS decompression SWIs, graphics, text patterns',
							paths: ['platforms/gba/**'],
						},
						{
							label: 'NDS',
							description: 'Nintendo DS — dual ARM CPUs, NitroFS filesystem, NFTR fonts, overlays, compression',
							paths: ['platforms/nds/**'],
						},
						{
							label: 'Languages',
							description: 'Target-language specifics — glyph repertoire, encoding strategies, font design',
							paths: ['languages/**'],
						},
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
