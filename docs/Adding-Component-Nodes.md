# Adding New Component Node Types

This guide explains how to add new node types for components in the Blueprint editor.  
The system uses an **extensible rules registry** — you never need to touch the context menu, code generator plumbing, or editor wiring. Just follow the three steps below.

---

## Architecture Overview

```
ComponentNodeRules.ts   ← Registry: maps component types → node entries
        ↑
MeshComponentNodes.ts   ← Concrete nodes + rule for "mesh" components
(YourNewNodes.ts)       ← Your new nodes + rule for your component type
        ↑
nodes/index.ts          ← Barrel file: re-exports everything
        ↑
NodeEditorPanel.tsx     ← Context menu + code generation (auto-discovers entries)
```

**Key concepts:**

| Concept | Description |
|---|---|
| `ComponentRule` | Declares which component `type` strings it handles and a `getEntries()` function that returns the nodes available for each component instance. |
| `ComponentNodeEntry` | A single item in the right-click context menu: `{ label, factory }`. |
| `compIndex` | `-1` = root mesh (`gameObject.mesh`), `0+` = child mesh (`gameObject.mesh.children[i]`). Stored on each node for code generation. |

---

## Step 1 — Create node classes

Create a new file under `src/editor/nodes/components/`.  
Example: `CollisionComponentNodes.ts`

```ts
import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket } from '../sockets';
import { registerComponentRule } from './ComponentNodeRules';
import type { ActorComponentData } from '../../ActorAsset';

// ---- Node class ----

export class SetCollisionEnabledNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;

  constructor(compName: string, compIndex: number) {
    super(`Set Collision Enabled (${compName})`);
    this.compName  = compName;
    this.compIndex = compIndex;

    // Exec flow
    this.addInput ('exec', new ClassicPreset.Input(execSocket,  '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));

    // Data inputs
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
  }
}

// ---- Register the rule ----

registerComponentRule({
  componentTypes: ['collision'],          // ← matches ActorComponentData.type
  getEntries(comp: ActorComponentData, index: number) {
    const n = comp.name;
    return [
      {
        label:   `Set Collision Enabled (${n})`,
        factory: () => new SetCollisionEnabledNode(n, index),
      },
      // ... add more entries here
    ];
  },
});
```

### Conventions

- Class names: `<Get|Set><Property>(<compName>)` as the node label.
- Store `compName` and `compIndex` as public fields — the code generator needs them.
- **Getter** nodes: only outputs (no exec sockets needed).
- **Setter** nodes: exec in + exec out + data inputs.

---

## Step 2 — Export from the barrel file

Open `src/editor/nodes/index.ts` and add your exports at the bottom:

```ts
// ── Collision Component Nodes ───────────────────────────────
export { SetCollisionEnabledNode } from './components/CollisionComponentNodes';
```

> The barrel import is what triggers `registerComponentRule()` at module load time.  
> If you skip this step, the rule never registers and the nodes won't appear.

---

## Step 3 — Add code generation

Open `src/editor/NodeEditorPanel.tsx` and add cases in two places:

### 3a. Getter nodes → `resolveValue()`

Add an `if` block **before** the `switch (node.label)`:

```ts
if (node instanceof GetCollisionRadiusNode) {
  const ref = (node as GetCollisionRadiusNode).compIndex === -1
    ? 'gameObject.mesh'
    : `gameObject.mesh.children[${(node as GetCollisionRadiusNode).compIndex}]`;
  return `${ref}.collisionRadius`;
}
```

### 3b. Setter / action nodes → `genAction()`

Add an `if` block **before** the `// Variable Set` comment:

```ts
if (node instanceof SetCollisionEnabledNode) {
  const ref = (node as SetCollisionEnabledNode).compIndex === -1
    ? 'gameObject.mesh'
    : `gameObject.mesh.children[${(node as SetCollisionEnabledNode).compIndex}]`;
  const vS = inputSrc.get(`${nodeId}.enabled`);
  lines.push(`${ref}.collisionEnabled = ${vS ? rv(vS.nid, vS.ok) : 'true'};`);
  lines.push(...we(nodeId, 'exec'));
  return lines;
}
```

### Runtime reference pattern

| compIndex | Runtime expression |
|---|---|
| `-1` (root) | `gameObject.mesh` |
| `0` | `gameObject.mesh.children[0]` |
| `1` | `gameObject.mesh.children[1]` |
| … | … |

---

## Checklist

- [ ] Created `src/editor/nodes/components/<YourType>ComponentNodes.ts`
- [ ] Node classes store `compName` and `compIndex`
- [ ] Called `registerComponentRule({ componentTypes: [...], getEntries })` in the same file
- [ ] Exported new classes from `src/editor/nodes/index.ts`
- [ ] Added `resolveValue()` cases for getter nodes in `NodeEditorPanel.tsx`
- [ ] Added `genAction()` cases for setter nodes in `NodeEditorPanel.tsx`
- [ ] Imported new node classes at the top of `NodeEditorPanel.tsx`
- [ ] Ran `tsc --noEmit` — zero errors

---

## Existing component rules

| Component type | File | Nodes |
|---|---|---|
| `mesh` | `MeshComponentNodes.ts` | Get/Set Location, Get/Set Rotation, Get/Set Scale, Set Visibility |

---

## File reference

| File | Purpose |
|---|---|
| `src/editor/nodes/components/ComponentNodeRules.ts` | Registry: `registerComponentRule()`, `getComponentNodeEntries()` |
| `src/editor/nodes/components/MeshComponentNodes.ts` | Mesh nodes + mesh rule registration |
| `src/editor/nodes/index.ts` | Barrel exports (triggers rule registration) |
| `src/editor/NodeEditorPanel.tsx` | Context menu integration + code generation |
| `src/editor/ActorEditorPanel.ts` | Passes `components` & `rootMeshType` to the node editor |
| `src/editor/ActorAsset.ts` | `ActorComponentData` interface (`id, type, meshType, name, offset, rotation, scale`) |
