// O projeto carrega o Three.js pela CDN (import map no HTML). O Vite não lê import maps e tentava
// resolver "three" em node_modules, que não existe. Estes aliases apontam para a MESMA URL do
// import map, então o Vite deixa o import intacto e o navegador resolve pela CDN.
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
