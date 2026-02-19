# Feather Engine — Repository Deep Guide

This README is a practical, repo-specific explanation of how this engine works today:

- how to run it,
- what tech stack it uses,
- how the architecture is split,
- how Blueprint nodes become runtime code,
- how the Widget/UI system works,
- what “runtime differences” exist,
- and a full inventory of node modules currently in the repo.

---

## 1) What this repository is

Feather Engine is a **TypeScript + Three.js + Rapier + Rete** game engine/editor with:

- a dockable in-engine editor UI,
- Blueprint-style visual scripting,
- a runtime Play mode,
- a widget blueprint/UI runtime,
- optional desktop packaging through **Tauri (Rust shell + web frontend)**.

At a high level:

1. You edit scenes/actors/blueprints/widgets in the editor.
2. Node graphs compile into JavaScript code strings.
3. `ScriptComponent` compiles those strings into functions (`beginPlay`, `tick`, `onDestroy`).
4. Play mode runs lifecycle callbacks every frame, plus physics and controllers.

---

## 2) Tech stack

### Frontend / engine layer

- **TypeScript**
- **Vite** (dev server + build)
- **Three.js** (rendering)
- **@dimforge/rapier3d-compat** (physics)
- **Rete** + area/connection/react plugins (node graph editor)
- **React** + **React DOM** (parts of editor tooling/panels)
- **dockview-core** (dockable editor layout)

### Desktop shell layer

- **Tauri v2**
- **Rust** backend commands for project/file operations

---

## 3) How to run the engine

## Prerequisites

- Node.js 18+ recommended
- npm
- For desktop app mode: Rust toolchain + Tauri prerequisites for your OS

### A) Run in web/dev mode (fastest for development)

```bash
npm install
npm run dev
```

Then open: `http://localhost:5173`

### B) Build production frontend

```bash
npm run build
npm run preview
```

### C) Run as desktop app (Tauri)

```bash
npm install
npm run tauri dev
```

Tauri config points dev mode to Vite and production to `dist` output.

---

## 4) Entry points and major runtime split

There are two frontend entry points configured by Vite:

- `index.html` → `src/main.ts` (editor app)
- `gameplay.html` → `src/gameplay.ts` (gameplay/runtime page)

This is important: the repository supports both the **editor runtime** and a **gameplay-oriented runtime entry**.

---

## 5) Architecture map (high-level)

## Core engine runtime (`src/engine/*`)

Key modules include:

- `Engine.ts` — main orchestrator (init, update loop, play start/stop lifecycle)
- `Scene.ts` — scene/game object ownership
- `PhysicsWorld.ts` — physics stepping and world behavior
- `ScriptComponent.ts` — compiled script wrapper (`beginPlay`, `tick`, `onDestroy`)
- controller systems:
  - `PlayerController`, `AIController`, `SpectatorController`
  - movement modules (`MovementComponent`, `CharacterMovementComponent`, `FloatingPawnMovement`)
- `AnimationInstance.ts` — runtime animation blueprint behavior
- `UIManager.ts` — runtime widget blueprint system rendered as HTML overlay

## Editor layer (`src/editor/*`)

Contains panels and tooling for:

- scene editing,
- blueprint editing (node editor),
- actor/component authoring,
- widget blueprint authoring,
- asset/project management,
- viewport tools and gizmos.

`src/main.ts` wires everything together by constructing engine/editor managers, connecting asset managers, and connecting runtime resolvers (e.g., widget blueprint resolver into `UIManager`).

---

## 6) Blueprint compilation pipeline (how nodes become executable code)

The repo already documents this flow in detail (see `docs/How-Nodes-Become-Runtime-Code.md`). In practical terms:

1. **Graph changes detected** (node add/remove, connection add/remove).
2. Node editor debounces and calls compile pipeline.
3. Generator emits JS with:
   - variable preamble,
   - generated functions/custom events,
   - lifecycle sections for BeginPlay/Tick/OnDestroy.
4. `ScriptComponent` compiles code (via `new Function`) into callable handlers.
5. Engine calls handlers during Play lifecycle.

So visual graphs are effectively transformed into lifecycle JS closures with shared script state.

---

## 7) How code components interact (nodes → runtime)

A useful mental model:

1. **Node definitions** (`src/editor/nodes/**`) describe editor-facing behavior.
2. **Node editor panel** (`NodeEditorPanel.tsx`) handles context menus, graph state, and code generation.
3. Compiled source string is stored with actor/widget/blueprint asset data.
4. At runtime, **`ScriptComponent`** wraps the compiled functions.
5. **`Engine`** provides script context (`gameObject`, `deltaTime`, `elapsedTime`, print, physics/UI hooks) and runs script lifecycle.
6. For UI-specific scripts, **`UIManager`** manages widget instances and callable UI API.

---

## 8) Widget system ("widget/udget" explanation)

Widget blueprints are authored in editor panels and executed at runtime by `UIManager`:

- widgets are turned into a runtime blueprint tree,
- `UIManager` creates a DOM overlay container above the Three.js canvas,
- each widget instance tracks element maps (name/id lookup), state, handlers,
- blueprint-exposed API supports create/add/remove/set text/visibility/color/opacity/progress/slider/etc,
- widget animations and input mode/cursor visibility are also runtime-controlled.

### Widget performance/caching behavior

The widget render pipeline includes image caching behavior (e.g., cached texture/image lookups), plus dirty/refresh flow for updates.

In short: widget rendering is optimized by reusing loaded images and re-rendering when needed rather than rebuilding everything every frame.

---

## 9) Runtime differences you should know

There are multiple "runtime" distinctions in this repo:

## A) Editor mode vs Play mode

- **Editor mode**: manipulate scene/assets/blueprints; no gameplay lifecycle scripts ticking as in play.
- **Play mode**: engine calls script `beginPlay`, per-frame `tick`, and `onDestroy` when stopping.

## B) Web runtime vs Desktop runtime

- **Web runtime**: pure Vite/browser execution.
- **Desktop runtime**: same frontend, hosted by Tauri, with Rust commands for filesystem/project operations.

## C) Event lifecycle runtime differences inside scripts

- `Event BeginPlay`: one-time startup behavior
- `Event Tick`: per-frame behavior
- `Event OnDestroy`: shutdown/cleanup behavior

---

## 10) Node system overview

The node system is modular and category-based. `src/editor/nodes/index.ts` serves as a barrel file that exports node classes and triggers registration into palette/menus.

### Complete node module inventory (by file)

> This is the full list of node module files currently under `src/editor/nodes`.

```text
animation/AnimBPNodes.ts
casting/CastingNodes.ts
casting/GameInstanceNodes.ts
casting/InheritanceNodes.ts
character/AIControllerNodes.ts
character/CameraControlNodes.ts
character/CameraSpringArmNodes.ts
character/CharacterMovementNodes.ts
character/ControllerNodes.ts
character/PlayerControllerNodes.ts
collision/CollisionEventNodes.ts
collision/TraceNodes.ts
components/ComponentNodeRules.ts
components/LightComponentNodes.ts
components/MeshComponentNodes.ts
components/TriggerComponentNodes.ts
conversions/BoolToNumber.ts
conversions/BoolToString.ts
conversions/ColorToString.ts
conversions/NumberToBool.ts
conversions/NumberToString.ts
conversions/StringToBool.ts
conversions/StringToColor.ts
conversions/StringToNumber.ts
events/CustomEventNodes.ts
events/EventBeginPlayNode.ts
events/EventOnDestroyNode.ts
events/EventTickNode.ts
events/InputKeyNodes.ts
flow-control/BranchNode.ts
flow-control/DelayNode.ts
flow-control/DoNNode.ts
flow-control/DoOnceNode.ts
flow-control/FlipFlopNode.ts
flow-control/ForLoopNode.ts
flow-control/ForLoopWithBreakNode.ts
flow-control/GateNode.ts
flow-control/MultiGateNode.ts
flow-control/SequenceNode.ts
flow-control/SwitchOnIntNode.ts
flow-control/SwitchOnStringNode.ts
flow-control/WhileLoopNode.ts
functions/FunctionNodes.ts
math/AbsNode.ts
math/ClampNode.ts
math/CosineNode.ts
math/ExtendedMathNodes.ts
math/GreaterThanNode.ts
math/LerpNode.ts
math/MathAddNode.ts
math/MathDivideNode.ts
math/MathMultiplyNode.ts
math/MathSubtractNode.ts
math/SineNode.ts
physics/AddAngularImpulseNode.ts
physics/AddForceAtLocationNode.ts
physics/AddForceNode.ts
physics/AddImpulseAtLocationNode.ts
physics/AddImpulseNode.ts
physics/AddTorqueNode.ts
physics/ClampVelocityNode.ts
physics/CollisionQueryNodes.ts
physics/CollisionToggleNodes.ts
physics/GetAngularVelocityNode.ts
physics/GetBodyTypeNode.ts
physics/GetCenterOfMassNode.ts
physics/GetGravityScaleNode.ts
physics/GetMassNode.ts
physics/GetPhysicsMaterialNode.ts
physics/GetSpeedNode.ts
physics/GetVelocityAtPointNode.ts
physics/GetVelocityNode.ts
physics/GetWorldGravityNode.ts
physics/IsGravityEnabledNode.ts
physics/IsSimulatingPhysicsNode.ts
physics/PhysicsEventNodes.ts
physics/RadialForceNodes.ts
physics/ResetPhysicsNode.ts
physics/SetAngularDampingNode.ts
physics/SetAngularVelocityNode.ts
physics/SetBodyTypeNode.ts
physics/SetConstraintNode.ts
physics/SetGravityEnabledNode.ts
physics/SetGravityScaleNode.ts
physics/SetLinearDampingNode.ts
physics/SetLinearVelocityNode.ts
physics/SetMassNode.ts
physics/SetPhysicsMaterialNode.ts
physics/SetPhysicsTransformNode.ts
physics/SetSimulatePhysicsNode.ts
physics/SetVelocityNode.ts
physics/SetWorldGravityNode.ts
physics/SleepWakeNodes.ts
physics/TeleportPhysicsBodyNode.ts
player/PlayerControllerNodes.ts
player/WorldNodes.ts
spawning/SpawningNodes.ts
transform/ActorNodes.ts
transform/GetPositionNode.ts
transform/GetRotationNode.ts
transform/GetScaleNode.ts
transform/SetPositionNode.ts
transform/SetRotationNode.ts
transform/SetScaleNode.ts
ui/WidgetBlueprintNodes.ts
ui/WidgetEnhancedNodes.ts
ui/WidgetNodes.ts
utility/LoadSceneNode.ts
utility/OpenSceneNode.ts
utility/PrintStringNode.ts
utility/StringNodes.ts
utility/TimerNodes.ts
values/BooleanNode.ts
values/ColorNode.ts
values/DeltaTimeNode.ts
values/FloatNode.ts
values/StringLiteralNode.ts
values/TimeNode.ts
values/Vector3LiteralNode.ts
variables/StructNodes.ts
variables/VariableNodes.ts
```

---

## 11) Project structure (quick orientation)

- `src/engine` → runtime systems (render/physics/controllers/scripts/ui)
- `src/editor` → all editor tools and panels
- `src/editor/nodes` → Blueprint node declarations + category modules
- `docs/` → implementation guides (node compilation, adding node types)
- `src-tauri/` → desktop shell and filesystem commands

---

## 12) If you are onboarding as a developer

A practical first-read order:

1. `src/main.ts` (wiring and startup)
2. `src/engine/Engine.ts` (play lifecycle/update loop)
3. `src/engine/ScriptComponent.ts` (compiled script execution)
4. `docs/How-Nodes-Become-Runtime-Code.md`
5. `src/editor/NodeEditorPanel.tsx`
6. `src/engine/UIManager.ts` and widget editor files

This sequence gives you the full “authoring → compile → runtime execute” loop.

---

## 13) Notes and caveats

- The node inventory above is the **module-level list** (file modules), not a manually expanded list of every class symbol in each file.
- Some files (e.g., `ExtendedMathNodes.ts`, widget node files, controller node files) contain multiple node classes each.
- For an exhaustive class-level node catalog, a small script can be added later to extract all exported `*Node` classes.

