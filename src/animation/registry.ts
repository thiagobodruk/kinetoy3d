// Named definitions (clips, gestures, expressions) registered by the library or by user code.

/** How a definition shows up in the HUD. `key` is a KeyboardEvent.code (e.g. 'KeyY', 'Digit1'). */
export interface UiMeta { label: string; icon: string; key?: string }

/** Display form of a key code: 'KeyY' → 'Y', 'Digit1' → '1'. */
export const keyLabel = (code: string) => code.replace(/^(Key|Digit)/, '');

export class Registry<T extends { name: string }> {
  private items = new Map<string, T>();
  constructor(private kind: string) {}

  /** Adds (or replaces) a definition; later definitions override earlier ones. */
  define(def: T): T {
    this.items.set(def.name, def);
    return def;
  }
  has(name: string): boolean { return this.items.has(name); }
  get(name: string): T {
    const def = this.items.get(name);
    if (!def) throw new Error(`Unknown ${this.kind} "${name}" (registered: ${[...this.items.keys()].join(', ')})`);
    return def;
  }
  /** All definitions, in registration order. */
  list(): T[] { return [...this.items.values()]; }
}
