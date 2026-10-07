import '@phosphor-icons/web/regular/style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCharacterModel } from './character';
import { CharacterStateMachine, type Expression } from './animations';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f4f6);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 6.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 16;

scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 0.8));
const key = new THREE.DirectionalLight(0xffffff, 1.9);
key.position.set(2.5, 5, 4);
key.castShadow = true;
// tight shadow frustum around the character (follows it in tick) → small texels, no aliasing
key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.left = -1.8; key.shadow.camera.right = 1.8;
key.shadow.camera.top = 1.8; key.shadow.camera.bottom = -1.8;
key.shadow.camera.near = 1; key.shadow.camera.far = 14;
key.shadow.radius = 4;
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.012;
const KEY_OFFSET = new THREE.Vector3(2.5, 5, 4);
scene.add(key);
scene.add(key.target);
const rim = new THREE.DirectionalLight(0xffffff, 0.6);
rim.position.set(-3, 3, -4);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const character = createCharacterModel();
scene.add(character);
const fsm = new CharacterStateMachine(character);

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); });
addEventListener('keyup', (e) => { keys.delete(e.code); });

// movement mode
type Mode = 'idle' | 'walkInPlace' | 'circle' | 'dance' | 'free';
let mode: Mode = 'idle';
const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-mode]');
function setMode(m: Mode) {
  mode = m;
  modeButtons.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
}
modeButtons.forEach((b) => b.onclick = () => setMode(b.dataset.mode as Mode));

// collapse/expand the HUD (remembered across reloads when the browser allows it)
const hud = $('hud'), hudToggle = $('hudToggle');
function setHudCollapsed(collapsed: boolean) {
  hud.classList.toggle('collapsed', collapsed);
  hudToggle.innerHTML = `<i class="ph ph-caret-${collapsed ? 'right' : 'left'}"></i>`;
  hudToggle.setAttribute('aria-label', `${collapsed ? 'Show' : 'Hide'} panel (H)`);
  try { localStorage.setItem('hudCollapsed', collapsed ? '1' : '0'); } catch (e) {}
}
try { setHudCollapsed(localStorage.getItem('hudCollapsed') === '1'); } catch (e) {}
hudToggle.onclick = () => setHudCollapsed(!hud.classList.contains('collapsed'));

const faceButtons = document.querySelectorAll<HTMLButtonElement>('[data-face]');
function setFace(name: Expression) {
  fsm.setExpression(name);
  faceButtons.forEach((b) => b.classList.toggle('on', b.dataset.face === name));
}
faceButtons.forEach((b) => b.onclick = () => setFace(b.dataset.face as Expression));

const armButtons = document.querySelectorAll<HTMLButtonElement>('[data-arm]');
// neutral = rest pose (stops the gesture; the arm eases back)
armButtons.forEach((b) => b.onclick = () => b.dataset.arm === 'neutral' ? fsm.stopArmAction() : fsm.playArmAction(b.dataset.arm!));
const ARM_KEYS: Record<string, string> = { Digit1: 'thumbsUp', Digit2: 'wave', Digit3: 'armUp', Digit4: 'shrug' };

// ---------- camera ----------
const views: Record<string, number[]> = { front: [0, 1.2, 6.2], side: [6.2, 1.2, 0], back: [0, 1.2, -6.2], '3q': [4.2, 1.8, 4.6] };
const viewButtons = document.querySelectorAll<HTMLButtonElement>('[data-view]');
const viewMenu = $('viewMenu'), viewMenuBtn = $('viewMenuBtn');
const setViewButton = (name: string | null) => viewButtons.forEach((b) => b.classList.toggle('on', b.dataset.view === name));
// dragging to orbit leaves the preset views
controls.addEventListener('start', () => setViewButton(null));
viewMenuBtn.onclick = (e) => { e.stopPropagation(); viewMenu.classList.toggle('open'); };
addEventListener('pointerdown', (e) => { if (!viewMenu.contains(e.target as Node) && e.target !== viewMenuBtn) viewMenu.classList.remove('open'); });
function setView(name: string) {
  setViewButton(name);
  const v = views[name];
  camera.position.set(character.position.x + v[0], v[1], character.position.z + v[2]);
  controls.target.set(character.position.x, 1.0, character.position.z);
  zoomGoal = null;
}
viewButtons.forEach((b) => b.onclick = () => { setView(b.dataset.view!); viewMenu.classList.remove('open'); });

// zoom: eases the camera distance toward a goal (each step is ±20%)
let zoomGoal: number | null = null;
function zoom(factor: number) {
  const dist = (zoomGoal ?? camera.position.distanceTo(controls.target)) * factor;
  zoomGoal = THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance);
}
$('zoomIn').onclick = () => zoom(1 / 1.25);
$('zoomOut').onclick = () => zoom(1.25);
renderer.domElement.addEventListener('wheel', () => { zoomGoal = null; }, { passive: true });

// reset: front view, character at the origin, standing still, neutral face, no gesture
function reset() {
  setMode('idle');
  setFace('neutral');
  fsm.stopArmAction(true);
  if (fsm.current !== 'idle') fsm.set('idle', 0.15);
  circleAngle = 0;
  character.position.set(0, 0, 0);
  character.rotation.set(0, 0, 0);
  setView('front');
  controls.update();
}
$('resetBtn').onclick = reset;

// ---------- shortcuts ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (ARM_KEYS[e.code]) fsm.playArmAction(ARM_KEYS[e.code]);
  if (e.code === 'KeyH') setHudCollapsed(!hud.classList.contains('collapsed'));
  if (e.code === 'KeyT') setFace(fsm.expression === 'talk' ? 'neutral' : 'talk');
  if (e.code === 'KeyY') setFace(fsm.expression === 'smile' ? 'neutral' : 'smile');
  if (e.code === 'KeyU') setFace(fsm.expression === 'sad' ? 'neutral' : 'sad');
  if (e.code === 'KeyG') setMode(mode === 'dance' ? 'idle' : 'dance');
  if (e.code === 'Equal' || e.code === 'NumpadAdd') zoom(1 / 1.25);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoom(1.25);
});

const SPEED = 1.1;
let circleAngle = 0;
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const move = new THREE.Vector3(
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), 0,
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0));
  if (move.lengthSq() > 0 && mode !== 'free') setMode('free');

  let moving = false, speed = 0;
  if (mode === 'walkInPlace') { moving = true; speed = SPEED; }
  else if (mode === 'circle') {
    moving = true; speed = SPEED;
    const R = 1.6;
    circleAngle += (SPEED / R) * dt;
    character.position.set(Math.sin(circleAngle) * R, 0, Math.cos(circleAngle) * R - R);
    character.rotation.y = circleAngle + Math.PI / 2;
  } else if (mode === 'free' && move.lengthSq() > 0) {
    // camera-relative movement
    const fwd = tmp.subVectors(controls.target, camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const dir = new THREE.Vector3().addScaledVector(right, move.x).addScaledVector(fwd, -move.z).normalize();
    moving = true; speed = SPEED;
    character.position.addScaledVector(dir, SPEED * dt);
    camera.position.addScaledVector(dir, SPEED * dt);
    controls.target.addScaledVector(dir, SPEED * dt);
    const targetYaw = Math.atan2(dir.x, dir.z);
    let d = targetYaw - character.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    character.rotation.y += d * Math.min(1, dt * 10);
  }
  fsm.update(dt, { moving, speed, dancing: mode === 'dance' });
  const armNow = (!fsm.armAction?.stop && fsm.armAction?.name) || 'neutral';
  armButtons.forEach((b) => b.classList.toggle('on', armNow === b.dataset.arm));
  if (zoomGoal !== null) {
    const offset = tmp.subVectors(camera.position, controls.target);
    const dist = offset.length();
    const next = THREE.MathUtils.lerp(dist, zoomGoal, Math.min(1, dt * 10));
    camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
    if (Math.abs(next - zoomGoal) < 1e-3) zoomGoal = null;
  }
  key.target.position.set(character.position.x, 0.9, character.position.z);
  key.position.copy(key.target.position).add(KEY_OFFSET);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// deterministic render of a view, returned as a PNG data URL (used by tools/render.ts)
function capture(azimuthDeg: number, { dist = 4.2, height = 1.1, target = 1.0 } = {}) {
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  const c = character.position;
  camera.position.set(c.x + Math.sin(a) * dist, height, c.z + Math.cos(a) * dist);
  controls.target.set(c.x, target, c.z);
  controls.update();
  key.target.position.set(c.x, 0.9, c.z);
  key.position.copy(key.target.position).add(KEY_OFFSET);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}
$('loading')?.remove();
const app = { scene, camera, controls, character, fsm, setMode, setFace, renderer, capture, reset };
declare global { interface Window { __app: typeof app } }
window.__app = app;
