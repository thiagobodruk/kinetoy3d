// The stage: renderer, scene, lighting, ground and the frame loop.
// Everything that moves registers an update callback; the loop runs them in order and renders.
// The loop can run in real time (requestAnimationFrame) or be stepped manually with a fixed
// time step, which makes renders deterministic.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type UpdateFn = (dt: number) => void;

export interface StageOptions {
  background?: THREE.ColorRepresentation;
  /** Real-time loop (default) or manual stepping through `advance()`. */
  manual?: boolean;
}

// key light offset from the focus point; the light (and its tight shadow frustum) follows the focus
const KEY_OFFSET = new THREE.Vector3(2.5, 5, 4);
// on narrow screens (same breakpoint as the mobile HUD) the picture is shifted up by this
// fraction of the height, so the subject clears the toolbar at the bottom
const NARROW_WIDTH = 640, NARROW_SHIFT = 0.1;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;
  /** Point the key light and its shadow follow (usually the active character). */
  readonly focus = new THREE.Vector3();
  readonly manual: boolean;
  private updates: UpdateFn[] = [];
  private clock = new THREE.Clock();

  constructor(container: HTMLElement, { background = 0xf3f4f6, manual = false }: StageOptions = {}) {
    this.manual = manual;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = this.scene;
    scene.background = new THREE.Color(background);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.copy(KEY_OFFSET);
    key.castShadow = true;
    // tight shadow frustum around the focus → small texels, no aliasing
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.camera.left = -1.8; key.shadow.camera.right = 1.8;
    key.shadow.camera.top = 1.8; key.shadow.camera.bottom = -1.8;
    key.shadow.camera.near = 1; key.shadow.camera.far = 14;
    key.shadow.radius = 4;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.012;
    scene.add(key, key.target);
    this.keyLight = key;
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(-3, 3, -4);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    this.fitFraming();
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      this.fitFraming();
    });
  }

  // aspect + screen-space shift (moves the picture without changing where the camera looks)
  private fitFraming(): void {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    if (w <= NARROW_WIDTH) this.camera.setViewOffset(w, h, 0, h * NARROW_SHIFT, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Registers a per-frame callback (runs in registration order). */
  onUpdate(fn: UpdateFn): void { this.updates.push(fn); }

  /** Starts the real-time loop (does nothing in manual mode). */
  start(): void {
    if (this.manual) { this.render(); return; }
    const tick = () => {
      this.step(Math.min(this.clock.getDelta(), 0.05));
      requestAnimationFrame(tick);
    };
    this.clock.start();
    tick();
  }

  /** Advances the world by `dt` seconds and renders one frame. */
  step(dt: number): void {
    for (const fn of this.updates) fn(dt);
    this.render();
  }

  /** Advances `seconds` of time in fixed steps (manual mode, renders, tests). */
  advance(seconds: number, fps = 60): void {
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) for (const fn of this.updates) fn(1 / fps);
    this.render();
  }

  render(): void {
    this.keyLight.target.position.set(this.focus.x, 0.9, this.focus.z);
    this.keyLight.position.copy(this.keyLight.target.position).add(KEY_OFFSET);
    this.renderer.render(this.scene, this.camera);
  }
}
