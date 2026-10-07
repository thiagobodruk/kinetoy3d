import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths: the build works from any subfolder (e.g. GitHub Pages /kinetoy3d/)
  base: './',
  // the preview always runs on 5178 (fails instead of drifting to another port)
  server: { port: 5178, strictPort: true },
  // three.js alone is ~550 kB minified
  build: { chunkSizeWarningLimit: 800 },
});
