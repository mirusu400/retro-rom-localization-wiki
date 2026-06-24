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
				starlightLlmsTxt({ projectName: 'Retro Game Localization Wiki' }),
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
