// Animation layers: each one adds its part of the pose on top of the previous ones, every frame.
import type { Bones, Rig } from '../rig/rig';
import type { ExpressionDef } from './expressions';

/** State shared by the layers of one character. */
export interface LayerState {
  readonly rig: Rig;
  readonly bones: Bones;
  /** Current body state (idle, walk, dance…). */
  body: string | null;
  expression: ExpressionDef;
  /** Eye squint written by the face layer and applied by the blink layer (next frame). */
  squint: number;
}

export interface Layer {
  update(dt: number, s: LayerState): void;
}
