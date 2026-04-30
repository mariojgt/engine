# Runtime Systems

The engine modules that nodes actually call into. This page is the "what's under the hood" reference — useful when a node's behavior surprises you, or when you want to know what's *possible* before authoring a graph.

All systems live under [src/engine/](../src/engine/) and are wired into [Engine.ts](../src/engine/Engine.ts) at startup.

## Physics

Two independent physics worlds, both backed by [Rapier](https://rapier.rs).

<ConceptBox icon="🧊" title="3D Physics" tone="purple">
<a href="../src/engine/PhysicsWorld.ts">PhysicsWorld.ts</a> wraps a Rapier3D world. Stepped each frame, with deterministic substepping under heavy contact loads. Drives <code>RigidbodyComponent</code>, <code>ColliderComponent</code>, <code>TriggerComponent</code>, character movement, and trace queries.
</ConceptBox>

<ConceptBox icon="📐" title="2D Physics" tone="cyan">
<a href="../src/engine/Physics2DWorld.ts">Physics2DWorld.ts</a> wraps a Rapier2D world for sprite / tilemap games. Independent timestep from the 3D world. Drives 2D characters, projectiles, and overlap events.
</ConceptBox>

### Rigidbody types

| Type | Behavior |
|------|----------|
| **Dynamic** | Fully simulated. Gravity, forces, impulses all apply. |
| **Kinematic** | Moved by code; pushes dynamics but isn't pushed. Use for moving platforms. |
| **Static** | Never moves. Walls, terrain, props that don't react. |

### Joints

[PhysicsJoints.ts](../src/engine/PhysicsJoints.ts) provides constraints between two bodies — fixed, hinge, ball-and-socket, prismatic, spring. Authored on either body via the inspector.

### Character movement

A trio of movement components for different gameplay shapes:

- [CharacterMovementComponent.ts](../src/engine/CharacterMovementComponent.ts) — walking, running, jumping with slope handling.
- [FloatingPawnMovement.ts](../src/engine/FloatingPawnMovement.ts) — free flight (spectators, drones).
- [ProjectileMovementComponent.ts](../src/engine/ProjectileMovementComponent.ts) — straight-line motion + gravity + lifespan, for bullets / arrows / thrown objects.

For 2D side-scrollers and top-down games: [CharacterMovement2D.ts](../src/engine/CharacterMovement2D.ts).

### Debug drawing

Both worlds ship a debug drawer that overlays colliders, contacts, and joints in the viewport — toggleable per-world from the toolbar.

- [PhysicsDebugDrawer.ts](../src/engine/PhysicsDebugDrawer.ts)
- [Physics2DDebugDraw.ts](../src/engine/Physics2DDebugDraw.ts)

---

## Animation

### Skeletal animation

Skeletal meshes are stored as **GLB binary** (base64-encoded) to preserve floating-point precision — never JSON. The engine builds a runtime [Skeleton](../src/engine/) for each loaded skeletal mesh, providing Unreal-like bone queries and socket attachments.

[AnimationInstance.ts](../src/engine/AnimationInstance.ts) is the runtime that drives one of these meshes. It reads an **Animation Blueprint** asset — a state machine of clips with transition rules — and blends animations frame-by-frame.

State transitions are decided by the same blueprint graph system used for gameplay scripts. You expose **AnimBP variables** (Speed, IsGrounded, IsAttacking) that gameplay scripts write into; the AnimBP reads them to choose the active state.

::: tip
Use **Anim Notifies** for gameplay hooks driven by animation timing — footstep sounds at frame 12, hit-impact at frame 20. They fire as events your gameplay graph can listen to.
:::

### Sprite animation

For 2D, sprites use frame-based flipbook animation — see [SpriteRenderer.ts](../src/engine/SpriteRenderer.ts) and the `animation2d/` node category.

### Montages

A **montage** is a single clip layered on top of locomotion — useful for one-shot reactions (hit react, attack swing) without full state-machine plumbing.

---

## Rendering

### Pipeline

[RenderPipeline.ts](../src/engine/RenderPipeline.ts) configures the Three.js renderer with Feather's defaults — tone mapping, color space, shadow settings, MSAA. The viewport reads from this pipeline, and so does the gameplay-only entry (`gameplay.html`).

### Camera

The active camera lives on a regular actor. Switching cameras = switching which camera actor is marked active. For 2D, [Camera2D.ts](../src/engine/Camera2D.ts) provides an orthographic camera with damping, follow targets, and bounds.

For third-person, a typical setup is **camera actor + spring-arm child + pawn target** — exposed through the `Camera Spring Arm` node category.

### Sky &amp; lighting

[Sky.ts](../src/engine/Sky.ts) renders an atmospheric sky dome. Combined with [DayNight.ts](../src/engine/DayNight.ts), it drives directional lighting (sun / moon angle, color temperature) from a single time-of-day variable.

::: tip
Adjust time-of-day from a blueprint variable to wire up dynamic day-night cycles, weather, or scripted dawn / dusk events.
:::

### Sprite rendering

2D sprite actors are billboarded quads with a custom material. [SortingLayers.ts](../src/engine/SortingLayers.ts) handles the draw order so foreground / background layers composite correctly.

### Terrain

[TerrainData.ts](../src/engine/TerrainData.ts) and [TerrainShaderMaterial.ts](../src/engine/TerrainShaderMaterial.ts) provide a heightmap-based terrain mesh with a shader that blends multiple textures by slope and altitude.

---

## AI

### Behavior trees

[BehaviorTreeManager.ts](../src/engine/BehaviorTreeManager.ts) ticks one or more behavior trees per frame. A tree is a hierarchy of selectors, sequences, decorators, and tasks — authored in a dedicated editor and assigned to an [AIController](../src/engine/AIController.ts).

A typical NPC setup: actor + mesh + collider + character movement + AIController + assigned behavior tree. The blueprint script on the actor exposes events the behavior tree consumes; the behavior tree exposes tasks the AI controller runs.

### Navigation

[Recast Navigation](https://recastnav.com/) integration via `@recast-navigation/three`. The [NavMeshPanel](../src/editor/NavMeshPanel.ts) bakes a navmesh from your scene's static geometry. Once baked, AI controllers can `AI Move To` any point — Recast computes the path, the controller follows the waypoints.

---

## UI &amp; Widgets

[UIManager.ts](../src/engine/UIManager.ts) renders widget blueprints as a **DOM overlay** above the Three.js canvas — not WebGL-rendered. Why DOM?

- Native text rendering (subpixel, all OS fonts, accessibility).
- Native input (clicks, touches, focus, IME).
- Cheap to update — no shader rebuilds, no texture atlases.

A widget blueprint compiles to a tree of HTML elements with handlers; gameplay nodes (`Set Text`, `Set Visibility`, `Create Widget`) call into UIManager's API to mutate that tree.

::: info
Widget *images* are texture-cached — same source URL = same HTMLImageElement reused. Mutations are dirty-flagged, so a widget only re-renders when its state actually changes.
:::

### Input modes

UIManager also owns input mode and cursor visibility:

- **Game** — cursor locked, all input goes to gameplay.
- **UI** — cursor visible, focus goes to widgets.
- **GameAndUI** — both, with click-through priority.

---

## Audio

[AudioSystem.ts](../src/engine/AudioSystem.ts) wraps the Web Audio API. Provides:

- 2D playback (volume, looping, fade).
- 3D positional playback (HRTF spatialization, distance attenuation).
- Master / category mixers.
- Pause / resume on Play / Stop transitions.

All exposed through the `Audio` node category.

---

## Save / Load &amp; Game Instance

### GameInstance

[GameInstance.ts](../src/engine/GameInstance.ts) is a singleton that lives across scene transitions. Use it for:

- player progression (XP, inventory, unlocks),
- save data,
- global settings (volume, language, controls).

It's authored as a blueprint asset like any other, but the engine only ever instantiates one of them.

### Save / Load

[SaveLoadSystem.ts](../src/engine/SaveLoadSystem.ts) serializes the GameInstance + scene-relevant state to a slot.

- **Web runtime** — slots stored in IndexedDB.
- **Desktop runtime** — slots written to disk (under the user's app-data directory) via Tauri filesystem APIs.

Exposed via `Save Game to Slot` / `Load Game from Slot` nodes.

---

## Particles

[ParticleSystem.ts](../src/engine/ParticleSystem.ts) drives particle emitters authored in [ParticleEditorPanel.ts](../src/editor/ParticleEditorPanel.ts). Each emitter is a runtime object that lives on an actor and ticks alongside it.

Properties: rate, lifetime, velocity (with curves), gravity, color over life, size over life, world / local emission space.

---

## Day / Night &amp; Sky

[DayNight.ts](../src/engine/DayNight.ts) holds a normalized `time` value (0–1, full cycle). Drives:

- sun direction (angle from horizon),
- ambient light color (blue at dusk, warm at dawn),
- directional light intensity,
- sky shader colors (via [Sky.ts](../src/engine/Sky.ts)).

Tying gameplay to time of day is just a variable read — `Get Time of Day` returns the current normalized value.

---

## Collision &amp; Triggers

[CollisionSystem.ts](../src/engine/CollisionSystem.ts) and [CollisionTypes.ts](../src/engine/CollisionTypes.ts) define collision channels, layers, and filtering rules.

- **ColliderComponent** — blocks movement and fires `OnHit` events.
- **TriggerComponent** — does not block; fires `OnOverlapBegin` / `OnOverlapEnd`.

Channels let you say "this collider blocks the player but ignores AI projectiles" without writing per-pair logic.

---

## Input

[InputManager.ts](../src/engine/InputManager.ts) provides:

- raw key/button state queries,
- axis values (`Horizontal` / `Vertical` / `MouseX` / `MouseY`),
- input mappings (named actions / axes authored in [InputMappingEditorPanel](../src/editor/InputMappingEditorPanel.ts)),
- gamepad support (see the `gamepad/` node category).

The mapping system means your gameplay graph reads `Action: Jump` rather than `Spacebar` — letting players rebind without touching scripts.

---

## Grid &amp; Tilemaps

[GridSystem.ts](../src/engine/GridSystem.ts) and [TilemapData.ts](../src/engine/TilemapData.ts) provide tile-based authoring for 2D games — multi-layer tile grids with per-tile collision, swap-at-runtime, and editor brush tools.

---

## Drag selection

[DragSelectionComponent.ts](../src/engine/DragSelectionComponent.ts) handles rectangle-drag selection in the viewport — Editor-only behavior, but useful to know about if you're customizing the editor.

---

## Event bus

[EventBus.ts](../src/engine/EventBus.ts) is a project-wide pub/sub channel for decoupling systems. Use it sparingly — most communication should go through nodes / components / direct references. The bus is for cases where many unrelated subscribers care about a single event (e.g. "GamePaused" → audio mutes, AI freezes, UI shows a menu).

---

## Next

- [Extending Feather](/extending) — add your own nodes, components, runtime systems.
- [Node catalog](/nodes) — the public-facing API to all of the above, exposed as nodes.
