import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths: the build works from any subfolder (e.g. GitHub Pages /kinetoy3d/)
  base: './',
  server: { port: 5178 },
  // three.js alone is ~550 kB minified
  build: { chunkSizeWarningLimit: 800 },
});
