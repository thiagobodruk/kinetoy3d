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
| `npm run check` | Validates the content files: schemas plus links between files (part of `build`) |
| `npm run schema` | Regenerates the JSON Schemas of the content files from the TypeScript types |
| `npm run bake` | Pre-builds the character presets into `public/models/` (part of `build`) |
| `npm run render` | Headless renders of the character (see [Tools](#tools)) |
| `npm run diff` | Visual regression between two sets of renders |

## Controls

The HUD is a compact bar at the bottom center of the screen, with one button per group showing its active option. Clicking (or tapping) a group opens its options in a tray above the bar; picking an option or clicking outside closes it. Hover over a button to see its name and shortcut. The `‹` button collapses the bar into a small `›` button in the bottom-left corner. On phones the buttons are larger.

Order: **Actions · Face · Gestures** | **Camera · Scenes** | **Reset**.

The buttons are generated from the registered modes, expressions and gestures (see [Adding expressions and gestures](#adding-expressions-and-gestures)).

| Group | Buttons | Shortcuts |
| --- | --- | --- |
| **Scenes** | A menu with the scenes in `content/scenes/` | `Space` plays/pauses the open scene |
| **Actions** | Idle · Walk (in place) · Walk in circle · Dance · Bow · Look around | `G` toggles dance; `WASD` / arrow keys walk freely, relative to the camera |
| **Face** | Neutral · Smile · Talk · Sad · Surprise · Angry · Laugh · Scared | `Y` smile, `T` talk, `U` sad (each one toggles) |
| **Gestures** | No gesture · Thumbs up · Wave · Raise arm · Raise both arms · Shrug | `1` to `5` play the gestures |
| **Camera** | Views (Front / Side / Back / 3/4) · Zoom out · Zoom in | `+` / `−` zoom; drag to orbit; mouse wheel zooms |
| **Reset** | Restarts the open scene, or resets the stage | |
| **Panel** | Collapse / expand | `H` |

The HUD, the shortcuts and the camera views act on the **active actor**; a ring on the ground marks it when there's more than one. Click a character on the stage to make it active. The **Actors** group (one button per actor, add actor) is hidden for now, until scenes can be edited; `SHOW_ACTORS` in `src/ui/hud.ts` brings it back.

**Scenes** open in a player above the toolbar: play/pause, restart, a timeline to scrub, and close. While a scene plays, its camera cues drive the camera until you drag to orbit; the keyboard doesn't steer the actors. Closing it leaves the actors on stage for free play.

**Reset** restarts the open scene, or, without one, returns every actor to its home position, idle, with a neutral face and no gesture, and the camera to the front view.

The face, the arms and the actions are independent layers, so they can be combined. For example, the character can dance and talk with a thumbs up at the same time.

## Project structure

```
.
├── index.html              # Page shell (the HUD is generated)
├── content/
│   ├── characters/         # Character presets (JSON) + character.schema.json
│   └── scenes/             # Scene scripts (JSON) + scene.schema.json
├── src/
│   ├── main.ts             # Demo app: wires the stage, cast, HUD and keyboard
│   ├── sdf.ts              # SDF primitives/operators and Surface Nets polygonization
│   ├── rig/
│   │   └── rig.ts          # Rig contract: canonical humanoid bones, face parts, capabilities
│   ├── characters/
│   │   ├── registry.ts     # Character types (defineCharacter), assembly, colors
│   │   ├── presets.ts      # Loads content/characters/*.json
│   │   └── squid.ts        # Squid: skeleton, SDF fields, parts, palette, materials, rig
│   ├── director/
│   │   ├── scene.ts        # Scene script types (source of scene.schema.json)
│   │   ├── director.ts     # Runs a scene: tracks, markers, camera cues, seeking
│   │   ├── shots.ts        # Camera shots: wide, medium, close, over-the-shoulder
│   │   └── scenes.ts       # Loads content/scenes/*.json
│   ├── model/
│   │   ├── serialize.ts    # Model ⇄ binary (exact for workers, compact for baked files)
│   │   ├── worker.ts       # Builds a character's geometry off the main thread
│   │   └── loader.ts       # Baked file → Web Worker → main thread
│   ├── actor/
│   │   ├── actor.ts        # Actor: model + rig + animator + motion; async actions
│   │   ├── motion.ts       # Modes: idle, walk in place, circle, dance, free, walkTo
│   │   └── cast.ts         # Actors on the stage, the active one, selection ring
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
│   │   └── keyboard-control.ts  # WASD / arrows steer the active actor; the camera follows
│   └── ui/
│       ├── hud.ts          # Builds the toolbar from the registries; shows the active state
│       ├── scene-bar.ts    # Scene player: play/pause, restart, timeline, close
│       └── hud.css         # Page and toolbar styles (desktop toolbar, mobile trays)
├── tools/
│   ├── bake.ts             # Pre-builds the presets into public/models/
│   ├── check.ts            # Validates content/ (schemas + links)
│   ├── schema.ts           # Generates the content JSON Schemas from the TS types
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

### `rig/` and `characters/`: models

A character type builds a model in two steps:

1. **`build(options)`** makes the geometry, the skeleton and the hierarchy. It's pure (no DOM, no GPU), so it runs in a **Web Worker** or in Node. Meshes carry placeholder materials named after a material key.
2. The page adds the real **`materials(options)`** and finds the **`rig(root)`**, the contract the animation engine works with:
   - `bones`: the skeleton under the canonical humanoid names (`hips`, `spine`, `head`, `shoulderL`, `elbowL`, `fingersL`, `fingerTipsL`, `thumbL`, `legL`, `kneeL`, `footL` and the `R` side).
   - `face`: eye pivots (blink), mouth layers with the morph targets `0` smile · `1` open · `2` sad · `3` "O", and eyebrows. Any of them can be empty; the layers skip what's missing.
   - `fingers`: whether the fingers and thumbs can curl.

```ts
defineCharacter({ name: 'squid', build, materials, rig, accent, ui: { label: 'Squid', icon: 'user' } });
```

**Loading.** `loadCharacter` never blocks the page: in production it downloads the model baked at build time (≈3.4 MB per Squid, about 0.2 s locally); otherwise it builds it in a pool of Web Workers (≈5 s per Squid, several in parallel) while the scene keeps running at full frame rate.

**Model files.** `serialize.ts` flattens the object tree, geometry and skeleton into one binary. Worker transfers are exact. Baked files are compacted: repeated attributes are stored once, positions are quantized to 16 bits inside each mesh's box, normals, colors and skin weights become 16-bit integers, integer streams are delta-coded and the file is gzipped (13 MB → 3.4 MB). Renders from baked and generated models differ by a handful of pixels.

### Character presets (`content/characters/*.json`)

A preset is one character, ready to put on stage:

```json
{
  "id": "kelp",
  "name": "Kelp",
  "type": "squid",
  "options": {
    "palette": { "shirt": "#2f9e5b", "pants": "#7a6a4f", "skin": "#b9774f", "hair": "#1f1b18" },
    "parts": { "facialHair": "mustache" }
  }
}
```

Built-in presets: **Squid**, **Marlin**, **Kelp** and **Sunny**. Files load in name order; the first one is the actor the demo starts with. A preset with a mistake (unknown color, part or option) fails with a message that lists the valid values.

### `characters/squid.ts`: the Squid

| Option | Values |
| --- | --- |
| `palette` | Any of `skin`, `skinShade`, `nose`, `blush`, `lip`, `hair` (also beard and brows), `shirt`, `star`, `pants`, `shoe`, `sole`, `eye`, `mouth`, `tongue`, as `'#rrggbb'` |
| `parts.hair` | `classic` · `bald` |
| `parts.facialHair` | `beard` · `mustache` · `none` |
| `parts.decal` | `star` · `none` (chest print) |

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
- **Expressions** are data: target weights for the face channels (`smile`, `sad`, `surprise`, `angry`, `laugh`, `fear`) plus flags (`talk`, `idleLife`).

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

### `actor/`: actors and the cast

An **Actor** is one character on the stage: its model and rig, an `Animator` and a `Motion` controller. The **Cast** holds every actor, places new ones at the next home position along X and tracks the active one. `cast.add` loads the model without blocking (see [Loading](#rig-and-characters-models)); several adds can run at once.

```ts
const squid = await cast.add({ type: 'squid' });                          // the original
const blue = await cast.add({ type: 'squid', options: { palette: { shirt: '#2b6cd6' } } });
const kelp = await cast.add({ ...getPreset('kelp') });                    // from a preset

// immediate state
squid.setMode('dance');            // idle · walkInPlace · circle · dance
squid.setExpression('smile');

// actions: resolve when they finish (in stage time, so they also work in manual mode)
await blue.walkTo(0.8, 1.2);
await blue.gesture('wave');
await blue.face('surprise', 1.5);  // holds it, then back to neutral
await squid.act('dance', 3);       // dances for 3 s, then idles
await squid.wait(0.5);
```

### `director/`: scenes

A scene (`content/scenes/*.json`) says who is on stage, what each actor does and where the camera looks. Each actor has a **track**: steps that run one after the other. Tracks sync through **markers**.

```json
{
  "$schema": "./scene.schema.json",
  "id": "meeting",
  "title": "The meeting",
  "cast": [
    { "actor": "squid", "preset": "squid", "at": [-1.2, 0], "facing": 20 },
    { "actor": "kelp", "preset": "kelp", "at": [3.4, -1.2], "facing": "squid" }
  ],
  "camera": [
    { "t": 0, "shot": "wide", "from": "3q" },
    { "after": "kelp:arrived", "shot": "medium", "on": ["squid", "kelp"], "ease": 1.5 }
  ],
  "tracks": {
    "kelp": [
      { "do": "walkTo", "to": "squid", "mark": "kelp:arrived" },
      { "do": "gesture", "name": "thumbsUp" }
    ],
    "squid": [
      { "do": "lookAt", "at": "kelp" },
      { "do": "wait", "until": "kelp:arrived" },
      { "do": "turnTo", "to": "kelp" },
      { "do": "face", "name": "smile", "for": 2 }
    ]
  }
}
```

**Steps**

| Step | Fields | Finishes |
| --- | --- | --- |
| `walkTo` | `to`: actor id (stops in front of them) or `[x, z]` | on arrival |
| `turnTo` | `to`: actor id, `[x, z]` or degrees | when facing it |
| `lookAt` | `at`: actor id, `[x, z]` or `null` (look ahead) | right away (the head keeps following) |
| `gesture` | `name`: thumbsUp, wave, armUp, shrug… | when the gesture ends |
| `face` | `name`: neutral, smile, talk, sad, surprise…; `for` (s) | right away, or after `for` (then back to neutral) |
| `act` | `mode`: idle, walkInPlace, dance, circle; `for` (s) | right away, or after `for` (then back to idle) |
| `wait` | `for` (s) and/or `until` (marker) | when time is up or the marker is reached |
| `mark` | `name` | right away (reaches the marker) |

Every step also takes `mark` (a marker reached when it finishes) and `async` (start it and go on right away). Each track reaches `<actor>:end` when it finishes.

**Camera cues** start at `t` (seconds) or `after` a marker. `shot`: `wide`, `medium`, `close` or `overShoulder` (with `on: [from, toward]`); `on`: who to frame (default everyone); `from`: `front`, `side`, `3q`, `back` or degrees (relative to the actor's facing for one actor); `ease`: seconds to glide (0 = cut); `follow`: keep framing as they move. Single-actor shots move around anyone standing in the way, and on narrow screens the camera backs off until the group fits.

**Playback.** Steps run synchronously inside the frame loop, so a scene replays identically when time is stepped in fixed increments. Seeking starts over (fresh animation state and random sequence) and fast-forwards; moving forward continues from the current time. The scene's length is measured by a dry run when it loads.

**Editing.** The `$schema` line gives the editor validation, autocomplete and hints. `npm run check` validates every file and the links between them (actors, presets, gestures, expressions, markers, camera targets), with messages that point to the field and list the valid values:

```
✗ content/scenes/1-meeting.json: tracks.kelp[1].name: no gesture "salute" (known: thumbsUp, wave, armUp, shrug)
✗ content/scenes/1-meeting.json: tracks.squid[2].until: marker "kelp:arived" is never reached (known: kelp:arrived, …)
```

### Frame loop

`Stage` runs every registered update callback in order and then renders. The demo registers a single callback: the keyboard steers the active actor, every actor updates (motion, then its animator), the camera follows a steered actor, the HUD syncs and the camera eases. The key light follows `stage.focus` and its shadow grows to cover every actor.

Time can run in real time (`requestAnimationFrame`) or be stepped manually with a fixed time step (`stage.advance(seconds)`). Together with the seedable random source, manual time makes a render depend only on its inputs.

| URL parameter | Effect |
| --- | --- |
| `?seed=N` | Repeatable random choices (blinks, glances, talk syllables and gestures) |
| `?manual` | No real-time loop; time only moves through `__app.advance(seconds)` |
| `?cast=id,id` | Actors to start with (preset ids); default: the first preset |
| `?scene=id` | Opens a scene (plays it, unless `?manual`) |

### Debug hook

`window.__app` exposes these objects to the browser console (and to the tools):

| Name | What it is |
| --- | --- |
| `stage` | The stage (frame loop, lights) |
| `scene`, `camera`, `controls`, `renderer` | The Three.js scene objects |
| `cast` | The cast (`cast.actors`, `cast.add`, `cast.select`) |
| `active` | The active actor |
| `setMode`, `setFace`, `reset`, `select(name)` | HUD actions |
| `addActor(presetId?)` | Adds an actor (async); default: the next preset |
| `director`, `openScene(id)`, `closeScene()`, `seek(t)` | The scene player |
| `captureView()` | Renders the current camera as a PNG data URL |
| `capture(azimuthDeg, { dist, height, target })` | Renders a fixed view and returns it as a PNG data URL |
| `advance(seconds)` | Advances time in fixed 1/60 s steps and renders |

## Tools

Both tools run locally; they aren't part of the published site. Renders go to `renders/`, which is ignored by git.

**`render`** opens the app in headless Chrome (it uses the Chrome installed on the machine), optionally sets a pose, advances time and saves one PNG per view. Without `--url`, it starts its own Vite server. The page runs with `?manual&seed=1`, so the same arguments always produce the same pixels.

```bash
npm run render -- --name smile --face smile --views front,3q
npm run render -- --name dance --mode dance --wait 1.2
npm run render -- --name wave --gesture wave --wait 0.8 --views 0,45,120
npm run render -- --name trio --actors 3 --mode dance --wait 1
npm run render -- --name kelp --cast kelp --face smile
npm run render -- --name meet --scene meeting --at 2,6.5,10   # frames through the scene's camera
```

Options: `--views` (`front`, `side`, `back`, `3q` or an azimuth in degrees), `--face`, `--mode`, `--gesture`, `--wait` (seconds of animation before capturing), `--actors` (how many actors; the options apply to the first), `--cast` (preset ids to put on stage), `--scene` + `--at` (times in seconds), `--seed`, `--name`, `--size` (e.g. `900x1200`), `--dist`, `--url`.

**`diff`** compares two sets of renders and writes images with the changed pixels in red. It exits with an error when more than 0.5% of a view changed.

```bash
npm run render -- --name before
# …change the code…
npm run render -- --name after
npm run diff -- before after
```

## Deployment

Every push to `main` runs [`deploy.yml`](.github/workflows/deploy.yml), which builds the site (including the baked models) and publishes `dist/` to GitHub Pages. The build uses relative paths (`base: './'`), so it works from any subfolder.

## Tech notes

- **Stack:** TypeScript (strict), Vite, Three.js 0.160 (npm).
- **Icons:** [Phosphor Icons](https://phosphoricons.com/) 2.1.1 (regular weight), bundled from npm.
- **Load time:** generating a Squid takes about 5 s (the fine grids on the arms and hands account for most of it), which is why production uses baked models and development uses Web Workers.
- **Git:** `renders/`, `public/models/`, `dist/`, `node_modules/` and other local caches are ignored.

## License

[MIT](LICENSE) © 2026 Thiago Bodruk
