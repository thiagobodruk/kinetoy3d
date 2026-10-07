// Scene scripts (content/scenes/*.json). These types are the source of the JSON Schema
// (npm run schema), so their comments show up as hints in the editor.

/** A scene: who is on stage, what each actor does (one track each) and where the camera looks. */
export interface Scene {
  $schema?: string;
  /** Unique id, used in URLs (?scene=id) and tools. */
  id: string;
  /** Name shown in the HUD. */
  title: string;
  /** Actors on stage when the scene starts. */
  cast: CastEntry[];
  /** One track per actor (key = actor id): steps that run one after the other. */
  tracks: Record<string, Step[]>;
  /** Camera cues, each starting at a time or when a marker is reached. Default: a wide shot of everyone. */
  camera?: CameraCue[];
  /** Start over when the scene ends. */
  loop?: boolean;
}

export interface CastEntry {
  /** Id used by the tracks, camera cues and targets (e.g. "squid"). */
  actor: string;
  /** Character preset id (content/characters/). */
  preset: string;
  /** Starting position on the ground: [x, z]. +x is the stage's left side seen from the front camera; +z comes toward the camera. */
  at?: Point;
  /** Starting heading: degrees (0 = toward the camera, 90 = toward +x) or another actor's id to face. */
  facing?: number | string;
}

/** A point on the ground: [x, z]. */
export type Point = [number, number];
/** Another actor's id, or a point on the ground. */
export type Target = string | Point;

/** Options every step accepts. */
export interface StepBase {
  /** Start the step and go on to the next one right away (it keeps running alongside). */
  async?: boolean;
  /** Marker reached when this step finishes (for `wait.until` and camera `after`). */
  mark?: string;
}

/** Walks to a point; walking to an actor stops a little in front of them. */
export interface WalkToStep extends StepBase { do: 'walkTo'; to: Target }
/** Turns in place toward a point or an actor, or to a heading in degrees. */
export interface TurnToStep extends StepBase { do: 'turnTo'; to: Target | number }
/** Turns the head toward a point or an actor and keeps looking; null looks ahead again. */
export interface LookAtStep extends StepBase { do: 'lookAt'; at: Target | null }
/** Plays an arm gesture (thumbsUp, wave, armUp, shrug…) and waits for it to end. */
export interface GestureStep extends StepBase { do: 'gesture'; name: string }
/** Sets a facial expression (neutral, smile, talk, sad, surprise…); with `for`, holds it that many seconds and returns to neutral. */
export interface FaceStep extends StepBase { do: 'face'; name: string; for?: number }
/** Switches the body mode; with `for`, keeps it that many seconds and returns to idle. */
export interface ActStep extends StepBase { do: 'act'; mode: 'idle' | 'walkInPlace' | 'circle' | 'dance' | 'bow' | 'lookAround'; for?: number }
/** Waits a number of seconds, or until a marker is reached (with both: whichever comes first). */
export interface WaitStep extends StepBase { do: 'wait'; for?: number; until?: string }
/** Reaches a marker right away. Every track also reaches "<actor>:end" when it finishes. */
export interface MarkStep extends StepBase { do: 'mark'; name: string }

export type Step = WalkToStep | TurnToStep | LookAtStep | GestureStep | FaceStep | ActStep | WaitStep | MarkStep;

/** How much the shot shows. overShoulder needs two actors in `on`: [from, toward]. */
export type ShotSize = 'wide' | 'medium' | 'close' | 'overShoulder';

export interface CameraCue {
  /** Start time in seconds (use this or `after`). */
  t?: number;
  /** Start when this marker is reached. */
  after?: string;
  shot: ShotSize;
  /** Who to frame: one actor id or several. Default: everyone. */
  on?: string | string[];
  /** Camera direction: front, side, 3q, back or degrees. With one actor it's relative to where they face; otherwise to the stage. */
  from?: 'front' | 'side' | '3q' | 'back' | number;
  /** Seconds to glide from the previous shot (0 = cut). Default 1.2. */
  ease?: number;
  /** Keep framing the actors as they move. */
  follow?: boolean;
}
