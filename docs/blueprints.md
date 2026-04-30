# Blueprints

A **blueprint** is a visual graph of nodes that defines what an actor (or widget, or animation) does. You author it in the [Blueprint Editor](/editor#blueprint-editor); Feather compiles it to JavaScript; the engine runs that JavaScript in Play mode.

This page covers how blueprints work. For the full inventory of available nodes, see the [Node catalog](/nodes).

## Anatomy of a graph

A graph is made of three things:

<ConceptBox icon="📦" title="Nodes" tone="purple">
Boxes you drop on the canvas. Each one has <strong>pins</strong> (inputs and outputs). A node represents a single operation — fire an event, do math, move an actor, play a sound.
</ConceptBox>

<ConceptBox icon="🔌" title="Pins" tone="cyan">
The connection points on a node. Two flavors: <strong>exec pins</strong> (white triangles, control flow) and <strong>data pins</strong> (colored circles, values).
</ConceptBox>

<ConceptBox icon="➰" title="Connections" tone="mint">
Lines between pins. You connect compatible pins by dragging from one to another. Exec only connects to exec; data only connects to data of a matching type.
</ConceptBox>

## Pin colors

| Color | Type | Examples |
|-------|------|----------|
| ⚪ White triangle | **Exec** (execution flow) | BeginPlay → Print → Set Position |
| 🔴 Red circle | Boolean | `isAlive`, `wasHit`, `> Greater Than` |
| 🔵 Cyan circle | Number (float) | speed, deltaTime, distance |
| 🟣 Purple circle | Vector3 | position, velocity, scale |
| 🟢 Mint circle | Color | RGBA values |
| 🟡 Pink circle | String | names, messages, labels |
| ⚫ Grey circle | Any / Generic | wildcard pins on cast / variable nodes |

Mismatched data types won't connect. The editor highlights compatible pins as you drag a connection.

## Node kinds

Every node falls into one of six kinds. The neo-brutalist tag in the top-right of each card on the [Node catalog](/nodes) tells you which:

<NodeCard
  name="Event Begin Play"
  kind="event"
  desc="Fires once when Play starts. The entry point for setup logic."
  :outputs='[{"name":"Then","type":"exec"}]'
/>

<NodeCard
  name="Branch"
  kind="flow"
  desc="If/else. Routes execution down True or False based on a boolean condition."
  :inputs='[{"name":"In","type":"exec"},{"name":"Condition","type":"bool"}]'
  :outputs='[{"name":"True","type":"exec"},{"name":"False","type":"exec"}]'
/>

<NodeCard
  name="Set Position"
  kind="action"
  desc="Move an actor to a world position. Has an exec input — runs only when execution reaches it."
  :inputs='[{"name":"In","type":"exec"},{"name":"Target","type":"any"},{"name":"Location","type":"vec3"}]'
  :outputs='[{"name":"Then","type":"exec"}]'
/>

<NodeCard
  name="Multiply (float)"
  kind="pure"
  desc="No exec pins. Pure math — outputs A × B whenever a downstream node reads it."
  :inputs='[{"name":"A","type":"num"},{"name":"B","type":"num"}]'
  :outputs='[{"name":"Result","type":"num"}]'
/>

<NodeCard
  name="Float Literal"
  kind="value"
  desc="A constant. Type a number into the node and it shows up on its output pin."
  :outputs='[{"name":"Value","type":"num"}]'
/>

<NodeCard
  name="Number To String"
  kind="convert"
  desc="Coerces one type into another. Drop these in to bridge mismatched pin types."
  :inputs='[{"name":"In","type":"num"}]'
  :outputs='[{"name":"Out","type":"str"}]'
/>

The distinction that matters most: **action nodes have exec pins, pure nodes don't.** Pure nodes evaluate on demand whenever their output is read. Action nodes only run when execution flow reaches them.

## How a graph becomes code

When you save a blueprint, Feather walks the graph and emits a JavaScript source string. That source has three parts:

```js
// 1. Variable preamble — your declared variables, custom events, helper functions
let speed = 5;
function shoot() { /* ... */ }

// 2. Lifecycle handlers — one function per Event node you placed
function beginPlay() {
  print("Hello Feather");
}

function tick(deltaTime) {
  const input = getInputAxis("Horizontal");
  addMovementInput(gameObject, input * speed * deltaTime);
}

function onDestroy() {
  stopSound("background_music");
}
```

The [`ScriptComponent`](../src/engine/ScriptComponent.ts) compiles that source via `new Function(...)` and stores `beginPlay`, `tick`, and `onDestroy` as live closures. The [`Engine`](../src/engine/Engine.ts) calls them on each frame's lifecycle.

::: info Read the deep dive
The full compilation pipeline (debouncing, codegen, exec/data traversal, shared closure scope) is documented in [src/editor/nodeEditor/codeGen.ts](../src/editor/nodeEditor/codeGen.ts) — for engine contributors who want to extend it.
:::

## Variables

Blueprints support typed variables — number, bool, string, vector3, color, plus custom struct types. Each variable shows up as a pair of nodes:

- **Get \<Name\>** — pure node, reads the current value.
- **Set \<Name\>** — action node, writes a new value.

Variables are scoped to the blueprint instance. If two actors share the same blueprint asset, they each get their own copies.

## Custom events &amp; functions

For larger logic, split work into reusable pieces:

<ConceptBox icon="📣" title="Custom Events" tone="amber">
Like <code>BeginPlay</code> / <code>Tick</code>, but you create them. Add a <strong>Custom Event</strong> node, give it a name, and call it from anywhere with a <strong>Call Event</strong> node. Useful for "Damage", "Spawn", "OnHit"-style hooks that fire from multiple places.
</ConceptBox>

<ConceptBox icon="🧮" title="Custom Functions" tone="cyan">
Pure mini-graphs. Take inputs, do work, return outputs. Compile to JS functions. Useful for any expression you'd want to reuse — distance checks, damage formulas, state predicates.
</ConceptBox>

## Flow control

The most-used flow nodes:

| Node | Purpose |
|------|---------|
| **Branch** | If/else on a boolean. |
| **Sequence** | Fire multiple exec outputs in order. |
| **For Loop** | Iterate from N to M. |
| **For Loop with Break** | Same, but you can early-exit. |
| **While Loop** | Run while a condition holds. |
| **Do Once** | Only ever fire downstream once per actor lifetime. |
| **Do N** | Fire downstream N times, then stop. |
| **Gate** | Open / close a flow path with `Open` / `Close` exec pins. |
| **FlipFlop** | Alternate between A and B every time it's hit. |
| **Multi Gate** | Round-robin across multiple exec outputs. |
| **Switch on Int / String** | Route execution by value. |
| **Delay** | Wait N seconds before continuing. |

See the full list on the [Node catalog](/nodes#flow-control).

## Casting &amp; inheritance

Some nodes return a generic `Actor` reference. To call subclass-specific behavior, drop a **Cast** node. If the cast succeeds, the typed reference flows out and you can call its specialized nodes (e.g. cast `Actor` → `Character` to get movement-component access).

## Best practices

- **Start from an event.** Every action chain begins at a `BeginPlay`, `Tick`, `Custom Event`, `OnHit`, or input event.
- **Keep `Tick` lean.** Code in `Tick` runs every frame. Cache references in `BeginPlay`, do conditional work in `Tick`.
- **Use `Sequence` instead of long single chains.** Easier to read, easier to add steps later.
- **Pull repeating logic into custom functions.** A blueprint is harder to read at 50 nodes than at 10 nodes that call 5 helpers.
- **Use variables for state.** Don't try to compute the same value twice in `Tick` — store it.

## Next

- [Node catalog](/nodes) — every built-in node, grouped by category.
- [Runtime systems](/systems) — the engine modules nodes hook into.
- [Extending Feather](/extending) — write your own nodes.
