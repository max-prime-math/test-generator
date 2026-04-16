import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// When running in GitHub Actions, GITHUB_REPOSITORY is set to "owner/repo".
// We extract the repo name to use as the base path for GitHub Pages.
// Locally (no env var) the base is '/' so dev mode works as normal.
const base = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : '/';

export default defineConfig({
  base,
  plugins: [svelte()],
  // Teach Vite to treat WASM files as URL assets so the ?url import works
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Keep WASM-heavy packages out of Vite's pre-bundling step
    exclude: ['@myriaddreamin/typst.ts', '@myriaddreamin/typst-ts-web-compiler'],
  },
});
