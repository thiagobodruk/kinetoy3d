// Tracks which keys are held (by KeyboardEvent.code).
export class Keyboard {
  private held = new Set<string>();
  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.held.add(e.code));
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }
  has(code: string): boolean { return this.held.has(code); }
  /** 1 if any of `positive` is held, −1 if any of `negative`, 0 if both or neither. */
  axis(negative: string[], positive: string[]): number {
    return (positive.some((c) => this.held.has(c)) ? 1 : 0) - (negative.some((c) => this.held.has(c)) ? 1 : 0);
  }
}
