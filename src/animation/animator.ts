// Animator: drives one character by stacking animation layers, in this order:
//   body (looping clips) → blink → face → talk gestures → idle life → arm gesture
// Each layer writes on top of the pose left by the previous ones.
import type { CharacterModel } from '../character';
import { expressions } from './expressions';
import type { Layer, LayerState } from './layer';
import { BlinkLayer } from './layers/blink';
import { BodyLayer, type BodyStateName, type MotionContext } from './layers/body';
import { FaceLayer } from './layers/face';
import { GestureLayer } from './layers/gesture';
import { IdleLifeLayer } from './layers/idle-life';
import { TalkGestureLayer } from './layers/talk-gestures';

export class Animator {
  readonly body: BodyLayer;
  readonly face: FaceLayer;
  readonly gesture: GestureLayer;
  private layers: Layer[];
  private state: LayerState;

  constructor(readonly model: CharacterModel) {
    this.body = new BodyLayer(model);
    this.face = new FaceLayer(model);
    this.gesture = new GestureLayer();
    this.layers = [this.body, new BlinkLayer(), this.face, new TalkGestureLayer(), new IdleLifeLayer(), this.gesture];
    this.state = { model, bones: model.userData.bones, body: this.body.current, expression: expressions.get('neutral'), squint: 0 };
  }

  /** Name of the current expression. */
  get expression(): string { return this.state.expression.name; }
  setExpression(name: string): void { this.state.expression = expressions.get(name); }

  /** Name of the current body state (idle, walk, dance). */
  get bodyState(): BodyStateName | null { return this.body.current; }
  setBodyState(name: BodyStateName, fade?: number): void { this.body.set(name, fade); }

  playGesture(name: string): void { this.gesture.play(name); }
  stopGesture(immediate = false): void { this.gesture.stop(immediate); }
  /** Gesture playing (null when none, or once it starts easing out). */
  get activeGesture(): string | null { return this.gesture.active; }

  update(dt: number, ctx: MotionContext): void {
    this.body.ctx = ctx;
    for (const layer of this.layers) layer.update(dt, this.state);
  }
}

export type { MotionContext } from './layers/body';
