# Node System (2D + 3D)

Feather’s node system is built on Rete and split by gameplay domains. Nodes are declared in category modules under `src/editor/nodes/*` and exported through `src/editor/nodes/index.ts`.

## How it works

1. You place and connect nodes in editor graphs.
2. The code generator traverses exec + data links.
3. A JavaScript source string is emitted.
4. `ScriptComponent` compiles it into lifecycle functions.
5. `Engine` executes it with runtime context each frame.

## Major node categories

- **Events / Flow Control** — game lifecycle and execution routing.
- **Math / Values / Variables** — data expressions and state.
- **Transform / Spawning / Selection** — object movement and creation.
- **Physics / Physics2D / Collision** — rigid body behavior and queries.
- **Character / Character2D / Camera2D** — pawn movement and camera logic.
- **Animation / Animation2D** — state/transition and animation playback.
- **AI / NavMesh** — behavior-tree and navigation nodes.
- **UI / Widget Blueprint** — runtime UI creation and mutation.
- **Audio / SaveLoad / DataTable** — game services and persistence.

## 2D-specific scripting surface

The repo includes explicit 2D-focused modules and runtime hooks:

- `src/editor/nodes/character2d/Character2DNodes.ts`
- `src/editor/nodes/camera2d/Camera2DNodes.ts`
- `src/editor/nodes/physics2d/Physics2DNodes.ts`
- `src/engine/Physics2DWorld.ts`
- `src/engine/Camera2D.ts`

This enables a dedicated 2D gameplay path while still sharing the broader engine/editor infrastructure.

## Practical guidance

- Start gameplay logic from event nodes (`BeginPlay`, `Tick`) and compose behavior using small pure nodes.
- Prefer pure-value nodes for reusable expressions; keep action chains focused and readable.
- For larger systems, split logic into custom functions/events and avoid monolithic event graphs.
- If you add nodes, always register them through category files and ensure codegen support is added.

