# Adding New Blueprint Nodes

This guide walks you through creating a new node for the visual scripting system. Each node lives in its own file inside a category folder under `src/editor/nodes/`.

---

## Folder Structure

```
src/editor/nodes/
├── sockets.ts          ← shared sockets & registerNode()
├── index.ts            ← barrel re-exports (importing triggers registration)
├── events/             ← Event BeginPlay, Event Tick, Event OnDestroy
├── flow-control/       ← Branch, Sequence, For Loop
├── math/               ← Add, Subtract, Multiply, Divide, Sine, Cosine, etc.
├── values/             ← Float, Boolean, Time, Delta Time
├── transform/          ← Get/Set Position, Rotation, Scale
├── utility/            ← Print String
└── physics/            ← Add Force, Add Impulse, Set Velocity
```

---

## Step 1 — Create the Node File

Create a new `.ts` file in the appropriate category folder. For example, to add a **Power** node (raises A to the power of B) under **Math**:

**`src/editor/nodes/math/PowerNode.ts`**

```ts
import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class PowerNode extends ClassicPreset.Node {
  constructor() {
    super('Power');  // This label appears on the node in the editor
    this.addInput('base', new ClassicPreset.Input(numSocket, 'Base'));
    this.addInput('exp', new ClassicPreset.Input(numSocket, 'Exponent'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

// This call adds the node to the right-click palette
registerNode('Power', 'Math', () => new PowerNode());
```

### Key points

- **Class name** — any name you want, exported so other files can reference it.
- **`super('Power')`** — the label string is what the code generator uses to identify the node. It must be unique.
- **Sockets** — import from `../sockets`. Available sockets:
  | Socket       | Use for                  |
  |-------------|--------------------------|
  | `execSocket` | Execution flow (white ▶) |
  | `numSocket`  | Number values (green)    |
  | `boolSocket` | Boolean values (red)     |
  | `vec3Socket` | Vector3 values (yellow)  |
  | `strSocket`  | String values (magenta)  |
- **`registerNode(label, category, factory)`** — adds the node to `NODE_PALETTE` which powers the right-click context menu. The `category` string groups nodes together (e.g. `'Math'`, `'Physics'`, `'Events'`). You can use an existing category or create a new one — just pass any string.

---

## Step 2 — Register in the Barrel File

Open **`src/editor/nodes/index.ts`** and add one export line in the appropriate section:

```ts
// ── Math ────────────────────────────────────────────────────
export { MathAddNode }      from './math/MathAddNode';
export { MathSubtractNode } from './math/MathSubtractNode';
// ... existing nodes ...
export { PowerNode }        from './math/PowerNode';    // ← add this
```

> **Why?** Importing the file triggers the `registerNode()` side-effect at module load. Without this line the node won't appear in the palette.

---

## Step 3 — Add Code Generation

Open **`src/editor/NodeEditorPanel.tsx`** and add a case for your node inside the code generator. There are two places depending on node type:

### Pure value nodes (no exec pins)

Add a `case` inside the `resolveValue()` function. This function returns a **JavaScript expression string**:

```ts
// Inside resolveValue()
case 'Power': {
  const baseS = inputSrc.get(`${nodeId}.base`);
  const expS  = inputSrc.get(`${nodeId}.exp`);
  const base = baseS ? resolveValue(baseS.nid, baseS.ok) : '0';
  const exp  = expS  ? resolveValue(expS.nid, expS.ok)  : '1';
  return `Math.pow(${base}, ${exp})`;
}
```

### Action nodes (has exec input pin)

Add a `case` inside the `generateAction()` function. This function returns an **array of code lines**:

```ts
// Inside generateAction()
case 'My Action Node': {
  const vS = inputSrc.get(`${nodeId}.value`);
  const v = vS ? resolveValue(vS.nid, vS.ok) : '0';
  lines.push(`someAction(${v});`);
  lines.push(...walkExec(nodeId, 'exec'));  // continue the exec chain
  break;
}
```

> **Important:** For action nodes, always call `walkExec(nodeId, 'exec')` at the end to continue following the execution wire to the next node.

---

## Common Node Patterns

### Pure value node (no execution flow)

Nodes like **Sine**, **Float**, **Get Actor Position** — they compute a value but don't participate in exec flow.

```ts
import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class SineNode extends ClassicPreset.Node {
  constructor() {
    super('Sine');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Input'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Sine', 'Math', () => new SineNode());
```

### Action node (exec in + exec out)

Nodes like **Set Actor Position**, **Print String** — they do something and pass execution along.

```ts
import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class SetPositionNode extends ClassicPreset.Node {
  constructor() {
    super('Set Actor Position');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Actor Position', 'Transform', () => new SetPositionNode());
```

### Event node (exec out only)

Nodes like **Event BeginPlay**, **Event Tick** — they are entry points that start an execution chain.

```ts
import { ClassicPreset } from 'rete';
import { execSocket, registerNode } from '../sockets';

export class EventBeginPlayNode extends ClassicPreset.Node {
  constructor() {
    super('Event BeginPlay');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Event BeginPlay', 'Events', () => new EventBeginPlayNode());
```

### Node with inline control (user-editable field)

Nodes like **Float**, **Print String** — they have an inline input the user can type into.

```ts
import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class PrintStringNode extends ClassicPreset.Node {
  constructor() {
    super('Print String');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addControl('text', new ClassicPreset.InputControl('text', { initial: 'Hello' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Print String', 'Utility', () => new PrintStringNode());
```

In the code generator, read the control value like this:

```ts
const ctrl = node.controls['text'] as ClassicPreset.InputControl<'text'>;
const value = ctrl?.value ?? 'default';
```

---

## Step 4 — Available Variables in Generated Code

The code generator produces JavaScript that runs inside a function with these variables available:

| Variable       | Type         | Description                              |
|---------------|-------------|------------------------------------------|
| `gameObject`  | `GameObject` | The object the script is attached to     |
| `deltaTime`   | `number`     | Seconds since last frame                 |
| `elapsedTime` | `number`     | Total seconds since Play was pressed     |
| `print`       | `function`   | Output to the on-screen log (`print(v)`) |

Access the object's transform:
- `gameObject.position.x / .y / .z` and `gameObject.position.set(x, y, z)`
- `gameObject.rotation.x / .y / .z` and `gameObject.rotation.set(x, y, z)`
- `gameObject.scale.x / .y / .z` and `gameObject.scale.set(x, y, z)`

Access physics (if enabled):
- `gameObject.rigidBody.addForce({x, y, z}, true)`
- `gameObject.rigidBody.applyImpulse({x, y, z}, true)`
- `gameObject.rigidBody.setLinvel({x, y, z}, true)`

---

## Quick Checklist

- [ ] Created `src/editor/nodes/<category>/MyNode.ts`
- [ ] Class extends `ClassicPreset.Node`
- [ ] Called `registerNode('Label', 'Category', factory)` at module scope
- [ ] Added export line in `src/editor/nodes/index.ts`
- [ ] Added `case 'Label':` in `resolveValue()` or `generateAction()` in `NodeEditorPanel.tsx`
- [ ] Tested: node appears in right-click palette, wires connect, code generates correctly
