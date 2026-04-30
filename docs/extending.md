# Extending Feather

You'll outgrow the built-in nodes eventually. This page covers how to add your own — nodes, components, and engine modules — without forking the core.

## Adding new nodes

Every node is a TypeScript file under [src/editor/nodes/\<category\>/](../src/editor/nodes/). The pattern is consistent:

1. **Create a node class** that extends `ClassicPreset.Node` (from Rete).
2. **Add input + output pins** using the shared sockets from [src/editor/nodes/sockets.ts](../src/editor/nodes/sockets.ts).
3. **Register the node** with `registerNode(displayName, category, factory)` so it shows up in the palette.
4. **Add codegen** so the visual node compiles to runtime JavaScript.
5. **Export** from [src/editor/nodes/index.ts](../src/editor/nodes/index.ts).

### Skeleton — a "Multiply by 10" node

```ts
// src/editor/nodes/math/MultiplyByTenNode.ts
import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class MultiplyByTenNode extends ClassicPreset.Node {
  width = 200;
  height = 110;

  constructor() {
    super('Multiply By 10');

    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Multiply By 10', 'Math', () => new MultiplyByTenNode());
```

### Codegen — making the node *do* something at runtime

The node graph is just data until [src/editor/nodeEditor/codeGen.ts](../src/editor/nodeEditor/codeGen.ts) walks it and emits JavaScript. To plug in a new pure node, register a code template that maps `(inputs) → outputExpression`. Action nodes (with exec pins) register a different shape — `(inputs) → statementBlock`.

The exact pattern depends on the version of `codeGen.ts` you're working against — check the existing nodes in your category for the matching shape and copy that.

::: tip
The fastest way to learn the codegen pattern: pick the closest-matching existing node (e.g. <code>MathMultiplyNode</code> for a pure math node) and copy its structure. The system rewards consistency over cleverness.
:::

### Available sockets

From [sockets.ts](../src/editor/nodes/sockets.ts):

| Socket | Pin type |
|--------|----------|
| `execSocket` | Execution flow (white triangle) |
| `boolSocket` | Boolean |
| `numSocket` | Number (float) |
| `strSocket` | String |
| `vec3Socket` | Vector3 |
| `colorSocket` | Color |

::: warning
The string socket is named <code>strSocket</code>, not <code>stringSocket</code>. Using the wrong name fails silently — you'll get a node that won't connect to anything.
:::

### Choosing between *pure* and *action*

| Use a **pure** node when... | Use an **action** node when... |
|------------------------------|-------------------------------|
| The output is a function of the inputs (`a + b`, `distance(p1, p2)`) | The node has a side effect (move an actor, play a sound, write a variable) |
| It can be evaluated multiple times safely | It should fire only when execution flow reaches it |
| No exec pins | Exec pin in, exec pin out |

If in doubt, action. Pure nodes' outputs evaluate every time they're read, which can be wasteful for expensive computation.

## Adding new components

Components live in [src/engine/](../src/engine/) (the implementation) and [src/editor/nodes/components/](../src/editor/nodes/components/) (the nodes to manipulate them from blueprints).

A minimal component:

```ts
// src/engine/MyCoolComponent.ts
import { Component } from './Component';
import type { GameObject } from './GameObject';

export class MyCoolComponent extends Component {
  pulseRate = 1.0;

  beginPlay(go: GameObject) {
    // setup
  }

  tick(go: GameObject, dt: number) {
    const t = performance.now() * 0.001;
    go.transform.scale.setScalar(1 + Math.sin(t * this.pulseRate) * 0.1);
  }

  onDestroy(go: GameObject) {
    // cleanup
  }
}
```

Then register the component so the inspector and blueprints can reference it. The exact registration mechanism depends on whether you want it inspector-visible, blueprint-spawnable, or both — see existing components like [LightComponent](../src/engine/) or [TriggerComponent](../src/engine/) for the established pattern in your codebase.

## Adding runtime systems

A "runtime system" is a singleton-ish module that ticks alongside [Engine.ts](../src/engine/Engine.ts) — physics, audio, particles are all systems.

The pattern:

1. Create a module that owns its state.
2. Expose `update(deltaTime)` (and any setup / teardown).
3. Wire it into [Engine.ts](../src/engine/Engine.ts) — instantiate at startup, call `update` from the engine's per-frame loop.
4. Expose its public API to scripts via the **script context** (the object containing `print`, `gameObject`, `playSound`, etc. — defined alongside `ScriptComponent`).
5. Add nodes that call into your new API.

Once the API is on the script context, blueprints can call your system's functions like any built-in.

## Adding an asset type

If you need a new authored asset (a new kind of data table, a custom config, a domain-specific blueprint variant):

1. Define the data shape — a TypeScript interface.
2. Add a panel under [src/editor/](../src/editor/) that authors that shape (look at [DataTableEditorPanel](../src/editor/DataTableEditorPanel.ts) or [EnumEditorPanel](../src/editor/EnumEditorPanel.ts) for templates).
3. Wire the panel into the Content Browser so it can be created and opened.
4. Optionally: add nodes that consume your asset type at runtime.

## Where to put things

| Adding... | Goes under |
|-----------|------------|
| A new node | `src/editor/nodes/<category>/MyNode.ts` |
| Codegen for a new node | `src/editor/nodeEditor/codeGen.ts` (or its plugin extension point) |
| A runtime component | `src/engine/MyComponent.ts` |
| An editor panel | `src/editor/MyEditorPanel.ts` |
| A runtime system | `src/engine/MySystem.ts` + wire into `Engine.ts` |
| A new asset type | data class in `src/engine/`, panel in `src/editor/` |
| A docs page | `docs/<page>.md` + add to `docs/.vitepress/config.ts` sidebar |

## Conventions worth following

- **Display names use Title Case With Spaces** — "Add Movement Input", not "addMovementInput". The display name is what shows in the palette.
- **Categories are flat strings** — `"Math"`, `"Physics"`, `"UI"`. They drive the palette's grouping; reusing existing names keeps the palette tidy.
- **Pins are named in lowerCamelCase internally**, but **labeled in Title Case** for the user.
- **Action nodes always pair an exec input ("In") with an exec output ("Then")** — even if it's just a single side effect.
- **Pure nodes are stateless** — same inputs, same output, every time. State belongs in components, not in pure nodes.

## Debugging your nodes

- **Output Log first.** A `Print String` near your new node tells you whether the graph reaches it.
- **Read the generated source.** The blueprint editor exposes the compiled JavaScript — useful when codegen isn't doing what you expect.
- **Check the palette filter.** If your node doesn't show up, you probably forgot the `registerNode` call or the export from `nodes/index.ts`.
- **Type the pins correctly.** A pin connected to a wrong-color socket will silently refuse — the editor highlights compatible pins as you drag, so use that as a sanity check.

## Contributing back

If you build something general-purpose (a new flow node, a new physics primitive, a new widget node), consider opening a PR. The criteria for "general enough":

- It addresses a use case multiple users will hit.
- The behavior is predictable and well-named.
- It doesn't conflict with the existing pattern in its category.
- It comes with a brief description for the [Node catalog](/nodes) page.

## Next

- [Node catalog](/nodes) — see what already exists before adding a duplicate.
- [Runtime systems](/systems) — understand the engine modules your nodes will likely call into.
