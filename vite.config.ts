import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// GitHub Pages project URLs need "/repo/", but custom domains are served at "/".
// Let the deploy workflow choose explicitly so local dev still works as normal.
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : '/');

export default defineConfig({
  base,
  plugins: [svelte()],
  // Teach Vite to treat WASM files as URL assets so the ?url import works
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Keep WASM-heavy packages out of Vite's pre-bundling step
    exclude: ['@myriaddreamin/typst.ts', '@myriaddreamin/typst-ts-web-compiler', '@myriaddreamin/typst-ts-renderer'],
  },
});
