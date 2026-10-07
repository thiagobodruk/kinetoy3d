// Demo app: a cast of characters on the stage, driven by the HUD and the keyboard.
// The HUD, the keyboard and the camera views act on the active actor.
//
// URL parameters (used by tools/render.ts):
//   ?seed=N   repeatable random choices (blinks, glances, talk)
//   ?manual   no real-time loop; time only moves through __app.advance(seconds)
//   ?cast=a,b actors to start with (preset ids from content/characters/)
import '@phosphor-icons/web/regular/style.css';
import './library';
import './characters';
import type { Actor } from './actor/actor';
import { Cast } from './actor/cast';
import { MODES, type Mode } from './actor/motion';
import { expressions } from './animation/expressions';
import { gestures } from './animation/gestures';
import { KeyboardControl } from './behaviors/keyboard-control';
import { characters } from './characters/registry';
import { presets, getPreset } from './characters/presets';
import { CameraRig, type ViewName } from './core/camera';
import { Keyboard } from './core/keyboard';
import { setSeed } from './core/random';
import { Stage } from './core/stage';
import { Hud, REST_ARMS, ZOOM_STEP } from './ui/hud';

const params = new URLSearchParams(location.search);
if (params.has('seed')) setSeed(Number(params.get('seed')));

const loading = document.getElementById('loading')!;

const stage = new Stage(document.body, { manual: params.has('manual') });
const cameraRig = new CameraRig(stage.camera, stage.renderer.domElement);
const keyboardControl = new KeyboardControl(new Keyboard(), cameraRig);
const cast = new Cast(stage.scene);
const active = () => cast.active!;

const colors = new Map<string, string>();
/** Adds an actor from a preset (default: the next one in content/characters/). */
async function addActor(id?: string): Promise<Actor> {
  const preset = id ? getPreset(id) : presets[cast.actors.length % presets.length];
  const actor = await cast.add({ ...preset, options: preset.options ?? {} });
  colors.set(actor.name, characters.get(actor.type).accent?.(preset.options ?? {}) ?? '#6b7180');
  actor.motion.onModeChange((mode) => { if (actor === cast.active) hud.showMode(mode); });
  syncHud();
  return actor;
}
/** Adds an actor from the HUD and makes it active; the scene keeps running meanwhile. */
let adding = 0;
async function addActorFromHud() {
  adding++;
  loading.classList.add('toast');
  document.body.append(loading);
  try { cast.select(await addActor()); } finally { if (--adding === 0) loading.remove(); }
}

// ---------- actions (on the active actor) ----------
function setMode(mode: Mode) { active().setMode(mode); }
function setFace(name: string) {
  active().setExpression(name);
  hud.showFace(name);
}
function playArm(name: string) {
  if (name === REST_ARMS) active().stopGesture(); // the arm eases back to rest
  else void active().gesture(name);
}
function setView(view: ViewName) {
  cameraRig.setView(view, active().position);
  hud.showView(view);
}
/** Every actor home, idle, neutral face, no gesture; front view. */
function reset() {
  cast.actors.forEach((a) => a.reset());
  hud.showFace('neutral');
  setView('front');
  cameraRig.controls.update();
}
function select(name: string) { cast.select(cast.get(name)); }

// the HUD stays hidden until the first actor is on stage
const hudEl = document.getElementById('hud')!;
hudEl.style.visibility = 'hidden';
const hud = new Hud(hudEl,
  { modes: MODES, faces: expressions.list(), gestures: gestures.list() },
  {
    selectActor: select, addActor: () => void addActorFromHud(),
    mode: (m) => setMode(m as Mode), face: setFace, arm: playArm, view: setView, zoom: (f) => cameraRig.zoom(f), reset,
  });
function syncHud() {
  if (!cast.active) return;
  hud.setActors(cast.actors.map((a) => ({ name: a.name, color: colors.get(a.name)! })));
  hud.showActor(active().name);
  hud.showMode(active().mode);
  hud.showFace(active().expression);
}
cast.onChange(syncHud);
cameraRig.onUserOrbit(() => hud.showView(null)); // dragging leaves the preset views
hud.showView('front');

// click (not drag) on a character selects it
const canvas = stage.renderer.domElement;
const down = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
canvas.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY));
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const hit = stage.pick(e.clientX, e.clientY, cast.actors.map((a) => a.object));
  const actor = cast.actorOf(hit);
  if (actor && actor !== cast.active) cast.select(actor);
});

// ---------- shortcuts (from the `ui.key` of each definition) ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.code;
  const gesture = gestures.list().find((g) => g.ui?.key === key);
  if (gesture) void active().gesture(gesture.name);
  const face = expressions.list().find((x) => x.ui?.key === key);
  if (face) setFace(active().expression === face.name ? 'neutral' : face.name); // face keys toggle
  const mode = MODES.find((m) => m.ui.key === key);
  if (mode) setMode(active().mode === mode.name ? 'idle' : mode.name);    // mode keys toggle
  if (key === 'KeyH') hud.toggleCollapsed();
  if (key === 'Equal' || key === 'NumpadAdd') cameraRig.zoom(1 / ZOOM_STEP);
  if (key === 'Minus' || key === 'NumpadSubtract') cameraRig.zoom(ZOOM_STEP);
});

// ---------- frame loop ----------
stage.onUpdate((dt) => {
  keyboardControl.steer(cast.active);
  cast.update(dt);
  keyboardControl.follow(cast.active);
  hud.showArm(cast.active?.gestureName ?? REST_ARMS);
  cameraRig.update(dt);
  stage.focusRadius = cast.bounds(stage.focus).radius; // the shadow covers every actor
});
stage.start();

// first actors (?cast=id,id… or the first preset): the loading screen stays up until they're on stage
const initial = params.get('cast')?.split(',') ?? [presets[0].id];
const [first] = await Promise.all(initial.map((id) => addActor(id)));
cast.select(first);
hudEl.style.visibility = '';
hud.showView('front');
loading.remove();

// deterministic render of a view, returned as a PNG data URL (used by tools/render.ts)
function capture(azimuthDeg: number, opts: { dist?: number; height?: number; target?: number } = {}) {
  cameraRig.frame(active().position, azimuthDeg, opts);
  stage.render();
  return stage.renderer.domElement.toDataURL('image/png');
}

const app = {
  stage, scene: stage.scene, camera: stage.camera, renderer: stage.renderer, controls: cameraRig.controls, cast,
  /** The active actor. */
  get active() { return active(); },
  setMode, setFace, reset, capture, select,
  /** Adds an actor from a preset id (default: the next preset); resolves when it's on stage. */
  addActor,
  /** Advances time in fixed steps (for ?manual). */
  advance: (seconds: number) => stage.advance(seconds),
};
declare global { interface Window { __app: typeof app } }
window.__app = app;
