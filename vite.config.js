import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { devLoadingCover } from './scripts/dev-loading-cover.mjs';

// Root is the verified npm game. game.html remains a compatible entry.
export default defineConfig({
  plugins: [devLoadingCover()],
  base: './',
  publicDir: false,
  server: {
    open: false,
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    open: false,
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    // Do not erase existing output during the staged migration.
    emptyOutDir: false,
    assetsDir: 'static',
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        game: fileURLToPath(new URL('./game.html', import.meta.url)),
      },
    },
  },
});
