import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Teach Vite to treat WASM files as URL assets so the ?url import works
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Keep WASM-heavy packages out of Vite's pre-bundling step
    exclude: ['@myriaddreamin/typst.ts', '@myriaddreamin/typst-ts-web-compiler'],
  },
});
