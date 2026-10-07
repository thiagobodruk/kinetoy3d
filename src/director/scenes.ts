// Scenes: JSON files in content/scenes/ (see scene.ts for the format).
import type { Scene } from './scene';

const files = import.meta.glob<Scene>('../../content/scenes/*.json', { eager: true, import: 'default' });

/** Every scene, sorted by file name. */
export const scenes: Scene[] = Object.keys(files).filter((p) => !p.endsWith('.schema.json')).sort().map((p) => files[p]);

export function getScene(id: string): Scene {
  const s = scenes.find((x) => x.id === id);
  if (!s) throw new Error(`No scene "${id}" (known: ${scenes.map((x) => x.id).join(', ')})`);
  return s;
}
