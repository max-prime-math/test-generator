import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

function stripTransformedContentLength() {
  return {
    name: 'strip-transformed-content-length',
    apply: 'serve' as const,
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const originalSetHeader = res.setHeader.bind(res);
        res.setHeader = (name: string, value: number | string | readonly string[]) => {
          if (
            name.toLowerCase() === 'content-length' &&
            req.url &&
            /\.(?:svelte|ts|tsx|js|jsx)(?:[?#].*)?$/.test(req.url)
          ) {
            return res;
          }
          return originalSetHeader(name, value);
        };
        next();
      });
    },
  };
}

// GitHub Pages project URLs need "/repo/", but custom domains are served at "/".
// Let the deploy workflow choose explicitly so local dev still works as normal.
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : '/');

export default defineConfig({
  base,
  plugins: [stripTransformedContentLength(), svelte()],
  // Teach Vite to treat WASM files as URL assets so the ?url import works
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Keep WASM-heavy packages out of Vite's pre-bundling step
    exclude: ['@myriaddreamin/typst.ts', '@myriaddreamin/typst-ts-web-compiler', '@myriaddreamin/typst-ts-renderer'],
  },
});
