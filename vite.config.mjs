// The project loads Three.js from the CDN (import map in the HTML). Vite doesn't read import maps and
// tried to resolve "three" in node_modules, which doesn't exist. These aliases point to the SAME URL as
// the import map, so Vite leaves the import untouched and the browser resolves it from the CDN.
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0';

export default {
  resolve: {
    alias: [
      { find: /^three$/, replacement: `${THREE_CDN}/build/three.module.js` },
      { find: /^three\/addons\/(.*)$/, replacement: `${THREE_CDN}/examples/jsm/$1` },
    ],
  },
  server: { port: 5178 },
};
