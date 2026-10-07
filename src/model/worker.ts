// Model worker: builds a character's geometry off the main thread and sends it back packed.
import '../characters';
import { characters } from '../characters/registry';
import { packModel, serializeModel } from './serialize';

self.onmessage = (e: MessageEvent<{ id: number; type: string; options: unknown }>) => {
  const { id, type, options } = e.data;
  try {
    const root = characters.get(type).build(options);
    const buffer = packModel(serializeModel(root));
    postMessage({ id, buffer }, { transfer: [buffer] });
  } catch (err) {
    postMessage({ id, error: String(err instanceof Error ? err.message : err) });
  }
};
