# Quickstart

The fastest possible path from empty editor to running game. About five minutes.

By the end you'll have:

- a scene with a floor and a player cube,
- a blueprint that moves the cube with WASD,
- a print message firing on Play.

::: tip Prerequisites
You've already [installed Feather](/installation) and `npm run dev` is open in your browser.
:::

## 1. Make a scene

<!-- screenshot: blank editor, scene panel highlighted -->

In the editor toolbar, create a new scene (or open the default one). The viewport shows a blank world with grid + camera. The hierarchy panel is empty.

## 2. Add a floor

In the **Content Browser**, find the primitive meshes (Cube, Plane, Sphere). Drag a **Plane** into the viewport. Scale it up in the **Inspector** so it's a believable floor — `Scale: (10, 1, 10)` is a fine starting point.

::: info
Anything in the viewport is an *actor*. Selecting it in the viewport or the hierarchy shows its components in the Inspector — Mesh, Transform, and (if you add it) a Collider.
:::

## 3. Add a player cube

Drag a **Cube** into the viewport. Position it slightly above the plane so gravity gives it somewhere to fall.

In the Inspector, click **Add Component** and add:

- a **Box Collider** (so it interacts with physics),
- a **Rigidbody** (so it actually moves),
- a **Script** component (where the blueprint will live).

<!-- screenshot: inspector showing components on the cube -->

## 4. Open the blueprint editor

Select the cube. With the Script component highlighted, open the **Blueprint** panel. You'll see an empty graph with a tiny grid background.

Right-click anywhere on the canvas to open the node palette — that's how you'll add nodes.

## 5. Wire your first graph

Add these nodes by right-clicking and searching:

1. **Event BeginPlay** — fires once when Play starts.
2. **Print String** — prints a message.
3. **Event Tick** — fires every frame.
4. **Get Input Axis** (`Horizontal` / `Vertical`) — reads keyboard input.
5. **Add Movement Input** (or **Set Position** for a no-physics version).

Connect them like this:

```
[Event BeginPlay] ──exec──▶ [Print String "Hello Feather"]

[Event Tick] ──exec──▶ [Add Movement Input]
                          ▲
                          └── data ── [Get Input Axis Vec2]
```

<!-- screenshot: the wired blueprint graph -->

::: tip
White triangle pins are *exec* (execution flow). Colored circles are *data* — purple = vec3, cyan = number, red = bool, pink = string. You can only connect matching colors.
:::

## 6. Hit Play

Press the **Play** button in the toolbar (or `Ctrl+P`).

You should see:

- "Hello Feather" appears in the **Output Log**,
- moving WASD pushes your cube around,
- gravity keeps it on the floor,
- pressing **Stop** returns the editor to its pre-play state — no manual cleanup needed.

🎉 You just shipped a Feather game.

## What just happened

<ConceptBox icon="🧩" title="Your blueprint compiled" tone="purple">
When you wired those nodes, Feather generated JavaScript behind the scenes — a <code>beginPlay()</code> function that calls <code>print()</code>, and a <code>tick(deltaTime)</code> function that reads input and applies movement. The <code>ScriptComponent</code> on your cube wraps those generated functions as live closures.
</ConceptBox>

<ConceptBox icon="▶️" title="The lifecycle ran" tone="cyan">
On <strong>Play</strong>: the engine called <code>BeginPlay</code> on every script in the scene, then started ticking every frame at your monitor's refresh rate. On <strong>Stop</strong>: it called <code>OnDestroy</code> on each script and rolled the scene back to its authored state.
</ConceptBox>

<ConceptBox icon="⚙️" title="Physics did its part" tone="mint">
The engine stepped the Rapier 3D world each frame, and the cube's Rigidbody synced its world transform back into the actor's <code>Transform</code> component before <code>Tick</code> ran. That's why gravity worked without you wiring anything.
</ConceptBox>

## Next steps

- [Core concepts](/concepts) — actor, component, scene, script, lifecycle, in depth.
- [Editor tour](/editor) — every panel and what it's for.
- [Blueprints](/blueprints) — exec vs data pins, custom events, custom functions, variables.
- [Node catalog](/nodes) — the full list of nodes you can drop into a graph.
