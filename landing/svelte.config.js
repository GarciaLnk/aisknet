import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	vitePlugin: {
		inspector: true
	},
	kit: {
		adapter: adapter({ routes: { include: ['/*'], exclude: ['<all>', '/sitemap.xml'] } })
	}
};

export default config;
