import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Deliberately independent of vite.config.js: the code under test (src/lib)
// is plain TS with no Svelte components, so we don't need the SvelteKit
// plugin here - just the $lib alias it would otherwise provide.
export default defineConfig({
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib')
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
