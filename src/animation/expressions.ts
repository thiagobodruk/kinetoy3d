// Facial expressions as data: target weights for the face channels plus behavior flags.
// The face layer turns the channels into mouth morphs, brow motion, squint and posture.
import { Registry, type UiMeta } from './registry';

/**
 * Face channels the character's face can render (0..1):
 *   smile → smiling mouth, raised brows, squint
 *   sad   → drooping mouth, "roof"-shaped brows, head down
 *   surprise → "O" mouth, strongly arched brows
 *   angry → brows down and pulled together (inner ends low), tense frown, squint
 *   laugh → open smiling mouth bouncing in "ha-ha"s, eyes squeezed, head tilting back
 *   fear  → brows raised with inner ends up, small "O" mouth, trembling head
 */
export type FaceChannel = 'smile' | 'sad' | 'surprise' | 'angry' | 'laugh' | 'fear';

export interface ExpressionDef {
  name: string;
  channels?: Partial<Record<FaceChannel, number>>;
  /** Talks: syllable mouth, brow emphasis, hand gestures and head nods. */
  talk?: boolean;
  /** Allows the idle "life" layer (slow sway and glances) while standing still. */
  idleLife?: boolean;
  ui?: UiMeta;
}

export const expressions = new Registry<ExpressionDef>('expression');
export const defineExpression = (def: ExpressionDef) => expressions.define(def);
