import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const backend = process.env.KHABSA_DEV_BACKEND ?? 'http://localhost:3000';

/**
 * `vite build --mode pages` produces the GitHub Pages edition: a static site
 * where the host's browser runs the game server (peer-to-peer). This plugin
 * swaps the two server-facing modules for their browser implementations.
 */
function pagesEdition(): Plugin {
  const swap: Record<string, [string, string]> = {
    './socketTransport.ts': ['/src/client/lib/socket.ts', 'src/client/p2p/transport.ts'],
    './localApi.ts': ['/src/client/lib/api.ts', 'src/client/p2p/localApi.ts'],
    '../lib/pagesExtras.ts': ['/src/client/pages/Room.tsx', 'src/client/p2p/extras.ts'],
  };
  return {
    name: 'khabsa-pages-edition',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'node:crypto') return resolve('src/client/p2p/cryptoShim.ts');
      const s = swap[source];
      if (s && importer?.endsWith(s[0])) return resolve(s[1]);
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  return {
    plugins: [react(), tailwindcss(), ...(pages ? [pagesEdition()] : [])],
    root: '.',
    publicDir: 'public',
    // GitHub Pages serves the site under /<repo>/
    base: pages ? (process.env.PAGES_BASE ?? '/khabsa/') : '/',
    define: pages ? { 'import.meta.env.VITE_KHABSA_PAGES': JSON.stringify('1') } : {},
    build: {
      outDir: pages ? 'dist-pages' : 'dist/client',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: 5173,
      proxy: pages
        ? undefined
        : {
            '/api': { target: backend, changeOrigin: false },
            '/media': { target: backend, changeOrigin: false },
            '/socket.io': { target: backend, ws: true, changeOrigin: false },
          },
    },
  };
});
