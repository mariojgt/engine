// ============================================================
//  Mesh Component Nodes — Get/Set Location, Rotation, Scale,
//  Visibility for mesh components (root + children).
//
//  At runtime child meshes live at  gameObject.mesh.children[i]
//  and the root mesh is  gameObject.mesh  itself.
//  The index stored on each node is used by the code generator:
//    index === -1  →  gameObject.mesh  (root)
//    index >= 0    →  gameObject.mesh.children[<index>]
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket } from '../sockets';
import { registerComponentRule } from './ComponentNodeRules';
import type { ActorComponentData } from '../../ActorAsset';

// ---- Node classes ----

export class GetComponentLocationNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Location (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

export class SetComponentLocationNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Location (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class GetComponentRotationNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Rotation (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

export class SetComponentRotationNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Rotation (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class GetComponentScaleNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Scale (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

export class SetComponentScaleNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Scale (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetComponentVisibilityNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Visibility (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('visible', new ClassicPreset.Input(boolSocket, 'Visible'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ---- Register the mesh component rule ----

registerComponentRule({
  componentTypes: ['mesh'],
  getEntries(comp: ActorComponentData, index: number) {
    const n = comp.name;
    return [
      { label: `Get Location (${n})`,    factory: () => new GetComponentLocationNode(n, index) },
      { label: `Set Location (${n})`,    factory: () => new SetComponentLocationNode(n, index) },
      { label: `Get Rotation (${n})`,    factory: () => new GetComponentRotationNode(n, index) },
      { label: `Set Rotation (${n})`,    factory: () => new SetComponentRotationNode(n, index) },
      { label: `Get Scale (${n})`,       factory: () => new GetComponentScaleNode(n, index) },
      { label: `Set Scale (${n})`,       factory: () => new SetComponentScaleNode(n, index) },
      { label: `Set Visibility (${n})`,  factory: () => new SetComponentVisibilityNode(n, index) },
    ];
  },
});
