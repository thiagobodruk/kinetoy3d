# KineToy 3D

A framework for procedural 3D characters in the style of vinyl toys, built with [Three.js](https://threejs.org/) and no 3D modeling tool. Every surface is written in code as a signed distance field (SDF). The fields are joined with smooth unions, turned into meshes at load time, rigged to a skeleton and animated by stacked procedural layers.

Its first character is **Squid**. There's no model file to download: the whole character is generated in the browser when the page opens.

**Live demo:** <https://thiagobodruk.github.io/kinetoy3d/>

## Running locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open <http://localhost:5178>.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload (port 5178) |
| `npm run build` | Type-checks and builds the static site into `dist/` |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run typecheck` | Runs the TypeScript compiler without emitting |
| `npm run render` | Headless renders of the character (see [Tools](#tools)) |
| `npm run diff` | Visual regression between two sets of renders |

## Controls

The HUD is a single toolbar at the bottom center of the screen. Hover over a button to see its name and shortcut. The `‹` button collapses the toolbar into a small `›` button in the bottom-left corner.

On narrow screens (phones), the toolbar shows one large button per group, with the icon of the active option. Tapping a group opens its options in a tray above the bar; picking an option or tapping outside closes it.

The buttons are generated from the registered modes, expressions and gestures (see [Adding expressions and gestures](#adding-expressions-and-gestures)).

| Group | Buttons | Shortcuts |
| --- | --- | --- |
| **Actions** | Idle · Walk (in place) · Walk in circle · Dance | `G` toggles dance; `WASD` / arrow keys walk freely, relative to the camera |
| **Face** | Neutral · Smile · Talk · Sad · Surprise | `Y` smile, `T` talk, `U` sad (each one toggles) |
| **Arms** | Rest · Thumbs up · Wave · Raise arm · Shrug | `1` to `4` play the gestures |
| **Camera** | View menu (Front / Side / Back / 3/4) · Zoom out · Zoom in · Reset | `+` / `−` zoom; drag to orbit; mouse wheel zooms |
| **Panel** | Collapse / expand | `H` |

**Reset** returns to the front view and puts the character back at the origin, idle, with a neutral face and no gesture.

The face, the arms and the actions are independent layers, so they can be combined. For example, the character can dance and talk with a thumbs up at the same time.

## Project structure

```
.
├── index.html              # Page shell (the HUD is generated)
├── src/
│   ├── main.ts             # Demo app: wires the stage, character, animator, HUD and keyboard
│   ├── character.ts        # Procedural model: skeleton, SDF fields, meshes, skinning, materials
│   ├── sdf.ts              # SDF primitives/operators and Surface Nets polygonization
│   ├── animation/          # Animation engine (character-agnostic)
│   │   ├── animator.ts     # Stacks the layers for one character; public API
│   │   ├── layer.ts        # Layer interface and the state shared by the layers
│   │   ├── layers/         # body · blink · face · talk-gestures · idle-life · gesture
│   │   ├── registry.ts     # Named definitions + HUD metadata
│   │   ├── clips.ts        # Clip definitions (defineClip)
│   │   ├── gestures.ts     # Gesture definitions (defineGesture)
│   │   ├── expressions.ts  # Expression definitions (defineExpression)
│   │   └── pose.ts         # Rest pose, clip sampling, arm aiming helpers
│   ├── library/            # Built-in content: clips, gestures, expressions
│   ├── core/
│   │   ├── stage.ts        # Renderer, scene, lights, ground and the frame loop (real-time or manual)
│   │   ├── camera.ts       # Orbit camera: preset views, zoom steps, fixed shots for renders
│   │   ├── keyboard.ts     # Held-key tracking
│   │   └── random.ts       # Seedable random source for the animation layers
│   ├── behaviors/
│   │   └── locomotion.ts   # Idle, walk in place, walk in circle, dance and free (WASD) movement
│   └── ui/
│       ├── hud.ts          # Builds the toolbar from the registries; shows the active state
│       └── hud.css         # Page and toolbar styles (desktop toolbar, mobile trays)
├── tools/
│   ├── render.ts           # Deterministic headless renders through Chrome (Playwright)
│   └── diff.ts             # Pixel diff between two sets of renders
├── .github/workflows/
│   └── deploy.yml          # Builds and publishes the demo to GitHub Pages
├── vite.config.ts
└── tsconfig.json           # strict mode
```

### `sdf.ts`: modeling kernel

- **Primitives:** `sphere`, `ellipsoid`, `roundCone`, `torus`, `roundBox`.
- **Operators:**
  - `union(items, k)`: smooth union, where `k` is the blend radius.
  - `subtract`, `intersect`.
  - `custom(node, fn)`: post-processes the distance.
  - `transform(node, matrix)`: rigid transform.
- **`polygonize(node, { min, max, cell, smooth, color, weights })`:**
  - Turns a field into a `BufferGeometry` with Surface Nets.
  - Projects the vertices onto the surface and uses the field's gradient for normals.
  - Optionally smooths the mesh with Taubin smoothing (`smooth` iterations).
  - Optionally bakes per-vertex colors (`color`) and skin weights (`weights`, returning `[[boneIndex, weight], …]`).
- **`field(center, radius, fn)`:** a node from a world-space distance function.
- **`surfaceZ`:** finds the surface along +Z. Used to place decals (the mouth and the star).

### `character.ts`: the model

`createCharacterModel()` returns a `THREE.Group` whose `userData` holds the bones and the face meshes that the animation layer drives.

- **Coordinates:** Y up, front along +Z, the character's left along +X. The total height is about 2.0 units.
- **Skeleton (`BONES`):**
  - Body: `hips → spine → head`.
  - Each arm: `shoulder → elbow → fingers → fingerTips`, plus `thumb` on the elbow.
  - Each leg: `leg → knee → foot`.
  - The bind pose is the rest pose, so the idle pose doesn't deform anything.
- **Head:**
  - Skin, nose and ears are one field, with per-vertex colors for the nose, the blush and the inner ears.
  - Hair, beard and mustache are separate fields.
  - The eyebrows are tubes that pivot at their inner end.
  - The mouth is a set of thin layers (interior, teeth, tongue) with morph targets: `0` smile, `1` open (talk), `2` sad, `3` "O" (surprise).
- **Body:**
  - **Shirt:** the torso is a `SkinnedMesh` bound to `spine`.
  - **Sleeves:** rigid pieces bound to the shoulders. Each sleeve cap is a sphere centered on the shoulder pivot, so rotating the arm never stretches the shirt.
  - **Pants:** skinned to the hips, thighs and shins.
  - **Sneakers:** rigid on the feet.
- **Arms:**
  - Each arm, including the hand, is a single `SkinnedMesh`: a variable-radius tube (`tube()`) runs from the shoulder to the wrist, so the elbow has no seam or bump.
  - The weights shift from shoulder to elbow along the length of the arm.
  - The fingers are weighted to their own two joints.
  - The thumb is a separate rigid mesh on the `thumb` bone, so it can rotate without deforming the hand.

### `animation/`: motion

An `Animator` drives one character by stacking layers. Every frame, each layer writes on top of the pose left by the previous one:

| Order | Layer | What it does |
| --- | --- | --- |
| 1 | **body** | A small state machine (`idle`, `walk`, `dance`) that crossfades looping clips through an `AnimationMixer`. Transitions depend on `{ moving, speed, dancing }`. |
| 2 | **blink** | Periodic blinks over the eye scales, combined with the face squint. |
| 3 | **face** | Turns the current expression into mouth morphs, brow motion, squint and posture. Talking expressions open and close the mouth in random syllables. |
| 4 | **talk-gestures** | While talking, each arm moves toward a new random pose on every beat. |
| 5 | **idle-life** | In a calm idle: a slow sway and occasional glances. |
| 6 | **gesture** | One arm gesture at a time, blended in and out, overriding the arms. |

`Animator` API: `setExpression(name)`, `playGesture(name)`, `stopGesture(immediate?)`, `activeGesture`, `bodyState`, `setBodyState(name, fade?)`, `update(dt, motion)`.

- **Clips** are sampled by `sampleClip` as offsets over the `REST` pose, with harmonics that loop seamlessly.
- **Gestures** return an `ArmPose` for time `t`: absolute rotations (`q`, `r`), finger and thumb curls, additive rotations (`add`) and a shoulder `lift`. Arm poses are usually written as directions in torso space with `armQuats(side, upperArm, forearm, palm)`.
- **Expressions** are data: target weights for the face channels (`smile`, `sad`, `surprise`) plus flags (`talk`, `idleLife`).

### Adding expressions and gestures

Definitions live in registries. Defining one with `ui` metadata also adds its HUD button and, with `ui.key` (a `KeyboardEvent.code`), its shortcut. A definition with an existing name replaces it.

```ts
import { defineExpression } from './animation/expressions';
import { defineGesture } from './animation/gestures';
import { armQuats, dir } from './animation/pose';

defineExpression({
  name: 'amused',
  channels: { smile: 0.6, surprise: 0.3 },
  ui: { label: 'Amused', icon: 'smiley-wink', key: 'KeyI' },
});

defineGesture({
  name: 'point',
  duration: 2,
  pose: () => {
    const q = armQuats(-1, dir(-0.2, -0.3, 1), dir(0, 0.1, 1), [1, 0, 0]);
    return { q: { shoulderR: q.s, elbowR: q.e }, fingers: { fingersR: 1.2, fingerTipsR: 1.4 } };
  },
  ui: { label: 'Point', icon: 'hand-pointing', key: 'Digit5' },
});
```

Icons are [Phosphor](https://phosphoricons.com/) names. Built-in content is in `src/library/`.

### Frame loop

`Stage` runs every registered update callback in order and then renders. The demo registers a single callback that moves the character (`Locomotion`), feeds the result to the animator, syncs the HUD and eases the camera. The key light and its shadow follow `stage.focus`.

Time can run in real time (`requestAnimationFrame`) or be stepped manually with a fixed time step (`stage.advance(seconds)`). Together with the seedable random source, manual time makes a render depend only on its inputs.

| URL parameter | Effect |
| --- | --- |
| `?seed=N` | Repeatable random choices (blinks, glances, talk syllables and gestures) |
| `?manual` | No real-time loop; time only moves through `__app.advance(seconds)` |

### Debug hook

`window.__app` exposes these objects to the browser console (and to the tools):

| Name | What it is |
| --- | --- |
| `stage` | The stage (frame loop, lights) |
| `scene`, `camera`, `controls`, `renderer` | The Three.js scene objects |
| `character` | The character model |
| `animator` | The character's animator (layers, expressions, gestures) |
| `locomotion` | The movement controller |
| `setMode`, `setFace`, `reset` | HUD actions |
| `capture(azimuthDeg, { dist, height, target })` | Renders a fixed view and returns it as a PNG data URL |
| `advance(seconds)` | Advances time in fixed 1/60 s steps and renders |

## Tools

Both tools run locally; they aren't part of the published site. Renders go to `evidence/`, which is ignored by git.

**`render`** opens the app in headless Chrome (it uses the Chrome installed on the machine), optionally sets a pose, advances time and saves one PNG per view. Without `--url`, it starts its own Vite server. The page runs with `?manual&seed=1`, so the same arguments always produce the same pixels.

```bash
npm run render -- --name smile --face smile --views front,3q
npm run render -- --name dance --mode dance --wait 1.2
npm run render -- --name wave --gesture wave --wait 0.8 --views 0,45,120
```

Options: `--views` (`front`, `side`, `back`, `3q` or an azimuth in degrees), `--face`, `--mode`, `--gesture`, `--wait` (seconds of animation before capturing), `--seed`, `--name`, `--size` (e.g. `900x1200`), `--dist`, `--url`.

**`diff`** compares two sets of renders and writes images with the changed pixels in red. It exits with an error when more than 0.5% of a view changed.

```bash
npm run render -- --name before
# …change the code…
npm run render -- --name after
npm run diff -- before after
```

## Deployment

Every push to `main` runs [`deploy.yml`](.github/workflows/deploy.yml), which builds the site and publishes `dist/` to GitHub Pages. The build uses relative paths (`base: './'`), so it works from any subfolder.

## Tech notes

- **Stack:** TypeScript (strict), Vite, Three.js 0.160 (npm).
- **Icons:** [Phosphor Icons](https://phosphoricons.com/) 2.1.1 (regular weight), bundled from npm.
- **Load time:** the meshes are built when the page loads (the "Generating model…" screen). The fine grids on the arms and hands account for most of that time.
- **Git:** `evidence/` (renders), `dist/`, `node_modules/` and other local caches are ignored.

## License

[MIT](LICENSE) © 2026 Thiago Bodruk
