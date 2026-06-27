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

const githubRepository = process.env.GITHUB_REPOSITORY;
const githubRepositoryName = githubRepository?.split('/')[1];
const githubRepositoryBase = githubRepositoryName ? `/${githubRepositoryName}/` : '/';
const requestedBase = process.env.VITE_BASE_PATH;

const base = requestedBase ?? githubRepositoryBase;

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
