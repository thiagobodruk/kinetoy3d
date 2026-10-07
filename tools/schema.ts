// Generates the JSON Schemas of the content files from their TypeScript types, so editors
// validate and autocomplete them ("$schema" at the top of each file).
//
//   npm run schema
import { writeFile } from 'node:fs/promises';
import { createGenerator } from 'ts-json-schema-generator';

export const SCHEMAS = [
  { type: 'Scene', path: 'src/director/scene.ts', out: 'content/scenes/scene.schema.json' },
  { type: 'CharacterPresetFile', path: 'src/characters/presets.ts', out: 'content/characters/character.schema.json' },
];

export function generate(type: string, path: string): string {
  const schema = createGenerator({ path, type, tsconfig: 'tsconfig.json', skipTypeCheck: true, additionalProperties: false }).createSchema(type);
  return JSON.stringify(schema, null, 2) + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const s of SCHEMAS) {
    await writeFile(s.out, generate(s.type, s.path));
    console.log(s.out);
  }
}
