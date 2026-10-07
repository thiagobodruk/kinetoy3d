# KineToy 3D

A framework for procedural 3D characters in the style of vinyl toys, built with [Three.js](https://threejs.org/) and no 3D modeling tool. Every surface is written in code as a signed distance field (SDF). The fields are joined with smooth unions, turned into meshes at load time, rigged to a skeleton and animated by a small state machine.

Its first character is **Squid**. There's no build step and no model file to download. The whole character is generated in the browser when the page opens.

## Running locally

The project is plain ES modules. Three.js comes from a CDN through an import map, so `npm install` isn't needed.

**Vite** (recommended, serves on port 5178):

```bash
npx vite
```

**Python** (static server, plus the `/save` endpoint used for review captures):

```bash
python3 tools/dev_server.py
```

Then open <http://localhost:5178>.

## Controls

The HUD is a single toolbar at the bottom center of the screen. Hover over a button to see its name and shortcut. The `‹` button collapses the toolbar into a small `›` button in the bottom-left corner.

| Group | Buttons | Shortcuts |
| --- | --- | --- |
| **Actions** | Idle · Walk (in place) · Walk in circle · Dance | `G` toggles dance; `WASD` / arrow keys walk freely, relative to the camera |
| **Face** | Neutral · Smile · Talk · Sad · Doubt | `Y` smile, `T` talk, `U` sad (each one toggles) |
| **Arms** | Rest · Thumbs up · Wave · Raise arm · Shrug | `1` to `4` play the gestures |
| **Camera** | View menu (Front / Side / Back / 3/4) · Zoom out · Zoom in · Reset | `+` / `−` zoom; drag to orbit; mouse wheel zooms |
| **Panel** | Collapse / expand | `H` |

**Reset** returns to the front view and puts the character back at the origin, idle, with a neutral face and no gesture.

The face, the arms and the actions are independent layers, so they can be combined. For example, the character can dance and talk with a thumbs up at the same time.

## Project structure

```
.
├── index.html          # Page, HUD, scene setup (renderer, lights, camera), input and main loop
├── character.js        # Procedural model: skeleton, SDF fields, meshes, skinning, materials
├── animations.js       # Procedural clips, arm gestures, facial layers and the state machine
├── sdf.js              # SDF primitives/operators and Surface Nets polygonization
├── vite.config.mjs     # Vite aliases so "three" resolves to the same CDN URL as the import map
├── tools/
│   └── dev_server.py   # Static server + POST /save (writes PNG captures to evidence/)
└── capture_local.js    # Screenshot helper through the Chrome DevTools protocol (port 9222)
```

### `sdf.js`: modeling kernel

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
- **`surfaceZ`:** finds the surface along +Z. Used to place decals (the mouth and the star).

### `character.js`: the model

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
  - The mouth is a set of thin layers (interior, teeth, tongue) with morph targets: `0` smile, `1` open (talk), `2` sad, `3` "O" (doubt).
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

### `animations.js`: motion

- **Clips:** generated by `sampleClip` as offsets over the `REST` pose, with harmonics that loop seamlessly.
  - `createIdleClip()`: breathing and a subtle sway.
  - `createWalkClip()`: a stride with knee flexion, foot roll and an arm swing.
  - `createDanceClip()`: a 4-beat groove with knee dips, a hip sway and alternating arms. The free foot lifts slightly on each weight shift.
- **`CharacterStateMachine`:** crossfades between the `idle`, `walk` and `dance` states through an `AnimationMixer`. Transitions depend on `{ moving, speed, dancing }`, passed to `update(dt, ctx)` on every frame.
- **Procedural layers** on top of the mixer:
  - **Blinking:** an eye-scale layer that runs on its own.
  - **Facial expressions** (`setExpression`): `neutral`, `smile`, `talk` (random syllables), `sad`, `doubt`. Each one drives the mouth morphs, the eyebrows, the eye squint and the head and torso posture.
  - **Talk gestures:** while the character talks, each arm moves toward a new random pose on every beat.
  - **Idle life:** a slow sway and occasional glances, only in the neutral idle.
  - **Arm gestures** (`playArmAction(name)` / `stopArmAction(immediate)`): defined in `ARM_ACTIONS`.
    - The gestures are `thumbsUp`, `wave`, `armUp` and `shrug`.
    - Each one blends in, overrides the arm pose while it plays and blends out.
    - Their poses are written as directions in torso space (`armQuats`): upper arm, forearm and palm.

### Debug hook

`window.__app` exposes these objects to the browser console:

| Name | What it is |
| --- | --- |
| `scene`, `camera`, `controls`, `renderer` | The Three.js scene objects |
| `character` | The character model |
| `fsm` | The state machine |
| `setMode`, `setFace`, `reset` | HUD actions |
| `capture(name, azimuthDeg)` | Renders a fixed view and posts it to `/save` (works with `tools/dev_server.py`) |

## Tech notes

- **Three.js:** 0.160, loaded from jsDelivr.
- **Icons:** [Phosphor Icons](https://phosphoricons.com/) 2.1.1 (regular weight), loaded from unpkg.
- **Load time:** the meshes are built when the page loads (the "Generating model…" screen). The fine grids on the arms and hands account for most of that time.
- **Git:** `evidence/` (review captures), `.vite/` and other local caches are ignored.

## License

[MIT](LICENSE) © 2026 Thiago Bodruk
