// Demo app: one character on the stage, driven by the HUD and the keyboard.
//
// URL parameters (used by tools/render.ts):
//   ?seed=N   repeatable random choices (blinks, glances, talk)
//   ?manual   no real-time loop; time only moves through __app.advance(seconds)
import '@phosphor-icons/web/regular/style.css';
import './library';
import { Animator } from './animation/animator';
import { expressions } from './animation/expressions';
import { gestures } from './animation/gestures';
import { Locomotion, MODES, type Mode } from './behaviors/locomotion';
import { createCharacterModel } from './character';
import { CameraRig, type ViewName } from './core/camera';
import { Keyboard } from './core/keyboard';
import { setSeed } from './core/random';
import { Stage } from './core/stage';
import { Hud, REST_ARMS, ZOOM_STEP } from './ui/hud';

const params = new URLSearchParams(location.search);
if (params.has('seed')) setSeed(Number(params.get('seed')));

// let the loading screen paint before the (blocking) model generation
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const stage = new Stage(document.body, { manual: params.has('manual') });
const cameraRig = new CameraRig(stage.camera, stage.renderer.domElement);
const keyboard = new Keyboard();

const character = createCharacterModel();
stage.scene.add(character);
const animator = new Animator(character);
const locomotion = new Locomotion(character, cameraRig, keyboard);

// ---------- actions ----------
function setMode(mode: Mode) { locomotion.setMode(mode); }
function setFace(name: string) {
  animator.setExpression(name);
  hud.showFace(name);
}
function playArm(name: string) {
  if (name === REST_ARMS) animator.stopGesture(); // the arm eases back to rest
  else animator.playGesture(name);
}
function setView(view: ViewName) {
  cameraRig.setView(view, character.position);
  hud.showView(view);
}
/** Front view, character at the origin, idle, neutral face, no gesture. */
function reset() {
  locomotion.reset();
  setFace('neutral');
  animator.stopGesture(true);
  if (animator.bodyState !== 'idle') animator.setBodyState('idle', 0.15);
  setView('front');
  cameraRig.controls.update();
}

const hud = new Hud(document.getElementById('hud')!,
  { modes: MODES, faces: expressions.list(), gestures: gestures.list() },
  { mode: (m) => setMode(m as Mode), face: setFace, arm: playArm, view: setView, zoom: (f) => cameraRig.zoom(f), reset });
locomotion.onModeChange((mode) => hud.showMode(mode));
cameraRig.onUserOrbit(() => hud.showView(null)); // dragging leaves the preset views
hud.showMode(locomotion.mode);
hud.showFace(animator.expression);
hud.showView('front');

// ---------- shortcuts (from the `ui.key` of each definition) ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.code;
  const gesture = gestures.list().find((g) => g.ui?.key === key);
  if (gesture) animator.playGesture(gesture.name);
  const face = expressions.list().find((x) => x.ui?.key === key);
  if (face) setFace(animator.expression === face.name ? 'neutral' : face.name); // face keys toggle
  const mode = MODES.find((m) => m.ui.key === key);
  if (mode) setMode(locomotion.mode === mode.name ? 'idle' : mode.name);   // mode keys toggle
  if (key === 'KeyH') hud.toggleCollapsed();
  if (key === 'Equal' || key === 'NumpadAdd') cameraRig.zoom(1 / ZOOM_STEP);
  if (key === 'Minus' || key === 'NumpadSubtract') cameraRig.zoom(ZOOM_STEP);
});

// ---------- frame loop ----------
stage.onUpdate((dt) => {
  animator.update(dt, locomotion.update(dt));
  hud.showArm(animator.activeGesture ?? REST_ARMS);
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
  character, animator, locomotion, setMode, setFace, reset, capture,
  /** Advances time in fixed steps (for ?manual). */
  advance: (seconds: number) => stage.advance(seconds),
};
declare global { interface Window { __app: typeof app } }
window.__app = app;
