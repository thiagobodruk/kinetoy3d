// Demo app: one character on the stage, driven by the HUD and the keyboard.
//
// URL parameters (used by tools/render.ts):
//   ?seed=N   repeatable random choices (blinks, glances, talk)
//   ?manual   no real-time loop; time only moves through __app.advance(seconds)
import '@phosphor-icons/web/regular/style.css';
import { CharacterStateMachine, type Expression } from './animations';
import { Locomotion, type Mode } from './behaviors/locomotion';
import { createCharacterModel } from './character';
import { CameraRig, type ViewName } from './core/camera';
import { Keyboard } from './core/keyboard';
import { setSeed } from './core/random';
import { Stage } from './core/stage';
import { Hud, ZOOM_STEP } from './ui/hud';

const params = new URLSearchParams(location.search);
if (params.has('seed')) setSeed(Number(params.get('seed')));

// let the loading screen paint before the (blocking) model generation
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const stage = new Stage(document.body, { manual: params.has('manual') });
const cameraRig = new CameraRig(stage.camera, stage.renderer.domElement);
const keyboard = new Keyboard();

const character = createCharacterModel();
stage.scene.add(character);
const fsm = new CharacterStateMachine(character);
const locomotion = new Locomotion(character, cameraRig, keyboard);

// ---------- actions ----------
function setMode(mode: Mode) { locomotion.setMode(mode); }
function setFace(face: Expression) {
  fsm.setExpression(face);
  hud.showFace(face);
}
function playArm(name: string) {
  if (name === 'neutral') fsm.stopArmAction(); // the arm eases back to rest
  else fsm.playArmAction(name);
}
function setView(view: ViewName) {
  cameraRig.setView(view, character.position);
  hud.showView(view);
}
/** Front view, character at the origin, idle, neutral face, no gesture. */
function reset() {
  locomotion.reset();
  setFace('neutral');
  fsm.stopArmAction(true);
  if (fsm.current !== 'idle') fsm.set('idle', 0.15);
  setView('front');
  cameraRig.controls.update();
}

const hud = new Hud(document.getElementById('hud')!, {
  mode: setMode, face: setFace, arm: playArm, view: setView, zoom: (f) => cameraRig.zoom(f), reset,
});
locomotion.onModeChange((mode) => hud.showMode(mode));
cameraRig.onUserOrbit(() => hud.showView(null)); // dragging leaves the preset views

// ---------- shortcuts ----------
const ARM_KEYS: Record<string, string> = { Digit1: 'thumbsUp', Digit2: 'wave', Digit3: 'armUp', Digit4: 'shrug' };
const FACE_KEYS: Record<string, Expression> = { KeyT: 'talk', KeyY: 'smile', KeyU: 'sad' };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (ARM_KEYS[e.code]) fsm.playArmAction(ARM_KEYS[e.code]);
  const face = FACE_KEYS[e.code];
  if (face) setFace(fsm.expression === face ? 'neutral' : face); // each face key toggles
  if (e.code === 'KeyH') hud.toggleCollapsed();
  if (e.code === 'KeyG') setMode(locomotion.mode === 'dance' ? 'idle' : 'dance');
  if (e.code === 'Equal' || e.code === 'NumpadAdd') cameraRig.zoom(1 / ZOOM_STEP);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') cameraRig.zoom(ZOOM_STEP);
});

// ---------- frame loop ----------
stage.onUpdate((dt) => {
  fsm.update(dt, locomotion.update(dt));
  hud.showArm((!fsm.armAction?.stop && fsm.armAction?.name) || 'neutral');
  cameraRig.update(dt);
  stage.focus.copy(character.position);
});
stage.start();
document.getElementById('loading')?.remove();

// deterministic render of a view, returned as a PNG data URL (used by tools/render.ts)
function capture(azimuthDeg: number, opts: { dist?: number; height?: number; target?: number } = {}) {
  cameraRig.frame(character.position, azimuthDeg, opts);
  stage.render();
  return stage.renderer.domElement.toDataURL('image/png');
}

const app = {
  stage, scene: stage.scene, camera: stage.camera, renderer: stage.renderer, controls: cameraRig.controls,
  character, fsm, locomotion, setMode, setFace, reset, capture,
  /** Advances time in fixed steps (for ?manual). */
  advance: (seconds: number) => stage.advance(seconds),
};
declare global { interface Window { __app: typeof app } }
window.__app = app;
