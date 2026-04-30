# Editor Tour

The Feather editor is a **single-page app made of dockable panels**. Every panel is a TypeScript module under [src/editor/](../src/editor/), wired together at startup by [main.ts](../src/main.ts) and laid out by [DockView](https://dockview.dev). You can drag, split, popout, and re-dock any panel.

This page is a tour of the panels you'll spend the most time in.

## The shell

<!-- screenshot: full editor with default layout -->

The editor opens with a default layout:

- a **Viewport** in the center,
- a **Hierarchy** + **Content Browser** on the left,
- an **Inspector** on the right,
- an **Output Log** at the bottom,
- a **Toolbar** across the top with Play / Stop and global tools.

You can rearrange anything. Layouts are persisted, so the editor reopens how you left it.

## Toolbar

The top bar holds:

- **Play / Stop** — enter or leave Play mode (`Ctrl+P` / `Esc`).
- **Save / Load Project** — writes scene + asset state. On desktop (Tauri) this hits the real filesystem; in the browser it uses IndexedDB.
- **Scene picker** — switch between scenes in your project.
- **Build** — open the build configuration panel.

## Viewport

<!-- screenshot: viewport with a selected actor and gizmo -->

The 3D rendering surface. It's a Three.js scene wired into the editor's selection, gizmo, and camera systems.

| Action | Default |
|--------|---------|
| Orbit | Right-mouse drag |
| Pan | Middle-mouse drag |
| Zoom | Mouse wheel |
| Frame selection | `F` |
| Translate / Rotate / Scale gizmo | `W` / `E` / `R` |
| Multi-select | `Shift+Click` or drag-rect |

::: tip
The viewport ships with a built-in `DragSelectionComponent` for rectangle-selecting actors. Hold `Ctrl` to add to the selection, `Alt` to subtract.
:::

There's also a separate **2D viewport mode** for sprite / tilemap work, which uses [Camera2D](../src/engine/Camera2D.ts) and the 2D physics debug drawer.

## Hierarchy

A tree view of every actor in the active scene. Drag-and-drop to re-parent. Right-click for the context menu (rename, delete, duplicate, add child).

Selecting an actor here mirrors into the viewport (and vice versa).

## Inspector

When an actor is selected, the Inspector lists:

- its **Transform** (position / rotation / scale),
- every **Component** attached to it,
- per-component properties (mesh, material, collider shape, script asset, etc.).

Click **Add Component** to extend an actor. Common components include:

- `MeshComponent` — render a mesh.
- `LightComponent` — directional / point / spot light.
- `RigidbodyComponent` — physics body.
- `ColliderComponent` — physics shape (Box, Sphere, Capsule, Mesh).
- `TriggerComponent` — non-blocking volume that fires overlap events.
- `ScriptComponent` — runs a blueprint.
- `CharacterMovementComponent` / `FloatingPawnMovement` / `ProjectileMovementComponent` — movement primitives.

## Content Browser

A grid of all your project assets — meshes, materials, animations, blueprints, sounds, data tables. Drag from here into the viewport to spawn actors, or into the inspector to assign properties.

The browser is folder-aware (driven by [ContentFolderManager.ts](../src/editor/ContentFolderManager.ts)) — you can group related assets under nested directories.

## Blueprint Editor

<!-- screenshot: blueprint editor with a graph open -->

The visual scripting graph. Built on [Rete](https://retejs.org).

- Right-click the canvas to open the **node palette**.
- Drag from a pin to the empty canvas to open a context-aware palette filtered by pin type.
- Connect compatible pins by dragging from one to another.
- Save the graph; the editor regenerates JavaScript and stores it on the asset.

::: info
Blueprints are explained in depth on the [Blueprints](/blueprints) page. The node-by-node reference is on the [Node catalog](/nodes) page.
:::

## Widget Editor

A second blueprint-style editor specifically for **UI widgets** — buttons, text, images, progress bars, sliders. It produces a runtime widget tree that the [UIManager](../src/engine/UIManager.ts) renders as a DOM overlay above the canvas.

You author the layout in a tree, set properties (colors, fonts, anchors), and wire interactivity through nodes the same way as gameplay blueprints.

## Animation Blueprint Editor

For skeletal meshes, you author **Animation Blueprints** — state machines that decide which clip plays based on variables (speed, isGrounded, isAttacking, etc.). Two editors:

- [AnimBlueprintEditorPanel.ts](../src/editor/AnimBlueprintEditorPanel.ts) for 3D skeletal animation.
- [AnimBlueprint2DEditorPanel.ts](../src/editor/AnimBlueprint2DEditorPanel.ts) for sprite animation.

State transitions are driven by the same node graph system as gameplay blueprints.

## Asset editors

Specialized panels for editing specific asset types:

| Panel | Edits |
|-------|-------|
| [ActorEditorPanel](../src/editor/ActorEditorPanel.ts) | Actor templates (Blueprints in the Unreal sense) |
| [MaterialEditorPanel](../src/editor/MaterialEditorPanel.ts) | Materials |
| [ParticleEditorPanel](../src/editor/ParticleEditorPanel.ts) | Particle effects |
| [DataTableEditorPanel](../src/editor/DataTableEditorPanel.ts) | Tabular data assets |
| [EnumEditorPanel](../src/editor/EnumEditorPanel.ts) | Enum types used by blueprints |
| [InputMappingEditorPanel](../src/editor/InputMappingEditorPanel.ts) | Action / axis input bindings |
| [GameInstanceEditorPanel](../src/editor/GameInstanceEditorPanel.ts) | Persistent game-instance state |
| [NavMeshPanel](../src/editor/NavMeshPanel.ts) | NavMesh bake settings |

## Output Log

Stdout for your game. `Print String` nodes show up here, along with engine-side warnings, errors, and physics / animation diagnostics.

Filter by level (Info / Warning / Error) and by source (Script / Engine / Physics / UI).

## Popout windows

Any panel can be detached into its own browser window via the popout button in its header. The popout window runs `popout.html` with [popout-entry.ts](../src/popout-entry.ts) and stays connected to the main editor — useful for multi-monitor setups.

## Editor vs Play mode

<ConceptBox icon="🛠️" title="Editor mode" tone="cyan">
Scripts <strong>do not tick</strong>. You're authoring — moving actors, editing graphs, tweaking properties. Physics is paused. Time is frozen.
</ConceptBox>

<ConceptBox icon="▶️" title="Play mode" tone="purple">
The engine runs your game. <code>BeginPlay</code> fires, <code>Tick</code> runs every frame, physics steps, audio plays, UI receives input. Pressing <strong>Stop</strong> calls <code>OnDestroy</code> on every active script and restores the scene to its authored state.
</ConceptBox>

::: warning
Changes you make to actors *while in Play mode* (positions, properties) are not saved. Stop, then edit. This is intentional — Play mode is a sandbox.
:::

## Next

- [Core concepts](/concepts) — actor / component / scene / script in depth.
- [Blueprints](/blueprints) — what the graph compiles into and how to use it.
