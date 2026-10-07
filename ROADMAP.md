# KineToy 3D — Roadmap

## Done

| Phase | Scope |
|---|---|
| 0 | Base: procedural SDF character, Vite + TypeScript, render and diff tools |
| 1 | App split into Stage, CameraRig, Locomotion, Keyboard and Hud |
| 2 | Layered Animator, registries (clips, gestures, expressions) and generated HUD |
| 3 | Rig contract, character registry, actors and cast |
| 4 | Character kit, JSON presets, worker loading and baked models |
| 5 | Director: JSON scenes with per-actor tracks, markers, camera shots and scene player |

## Next

### Phase 6 — Lab
A local page (`/lab.html`) to create and tweak gestures and expressions live.
- Sliders for bones and face channels (smile, sad, surprise), with a keyframe timeline.
- Export the result as code/JSON ready for the library.
- Edit character presets (colors, parts) with instant preview.

### Phase 7 — Export PNG and WebM
- Capture a frame as PNG, or a whole scene as video, straight from the browser.
- The director is deterministic, so video renders frame by frame at a fixed rate, without stutter.

### Phase 8 — GLB
- Export characters as GLB (mesh, skeleton, colors) for Blender, games, etc.
- Import external characters (Blender, Mixamo, VRM), mapping their bones to the humanoid rig contract.

### Phase 9 — Speech
- A `say` step in scenes: speech bubble, audio and lip sync.
- Reuses the existing talk mouth and talk gestures.

### Phase 10 — Scenery and interaction
- Scenery and props: chairs, table, textured ground.
- Interactions beyond `lookAt`: handshake, handing over an object, sitting down.

## Small fixes (any phase)
- Kelp (no beard) shows a dark lower face and neck.
