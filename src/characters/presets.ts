// Character presets: JSON files in content/characters/, one character each.
//
//   { "id": "squid-blue", "name": "Blue", "type": "squid",
//     "options": { "palette": { "shirt": "#2b6cd6" }, "parts": { "facialHair": "mustache" } } }
//
// `options` is passed to the character type (see its Options interface).
export interface CharacterPreset {
  id: string;
  name?: string;
  type: string;
  options?: Record<string, unknown>;
}

const files = import.meta.glob<CharacterPreset>('../../content/characters/*.json', { eager: true, import: 'default' });

/** Every preset, sorted by file name. */
export const presets: CharacterPreset[] = Object.keys(files).sort().map((path) => {
  const p = files[path];
  if (!p.id || !p.type) throw new Error(`${path}: a preset needs "id" and "type"`);
  return p;
});

export function getPreset(id: string): CharacterPreset {
  const p = presets.find((x) => x.id === id);
  if (!p) throw new Error(`No character preset "${id}" (known: ${presets.map((x) => x.id).join(', ')})`);
  return p;
}
