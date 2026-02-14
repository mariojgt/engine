// ============================================================
//  TriggerComponentNodes — Get/Set properties for trigger
//  collision components (box, sphere, capsule).
//
//  These nodes let the blueprint graph manipulate trigger volumes
//  at runtime: enable/disable, change shape, resize, and read
//  the current overlap state.
//
//  At runtime trigger components live as sensor colliders managed
//  by CollisionSystem.  The component index stored on each node is
//  used by the code generator to address the correct trigger:
//    index === -1  →  root trigger (if the root has a trigger)
//    index >= 0    →  child trigger component at that index
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket } from '../sockets';
import { registerComponentRule } from './ComponentNodeRules';
import type { ActorComponentData } from '../../ActorAsset';

// ---- Node classes ----

/** Enable or disable a trigger component at runtime */
export class SetTriggerEnabledNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Trigger Enabled (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Check if a trigger component is currently enabled */
export class GetTriggerEnabledNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Is Trigger Enabled (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('enabled', new ClassicPreset.Output(boolSocket, 'Enabled'));
  }
}

/** Set the size/dimensions of a trigger at runtime */
export class SetTriggerSizeNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Trigger Size (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X / Radius'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y / Height'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Get how many actors are currently overlapping this trigger */
export class GetTriggerOverlapCountNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Overlap Count (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}

/** Check if this trigger is currently overlapping any actor */
export class IsTriggerOverlappingNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Is Overlapping (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Is Overlapping'));
  }
}

/** Get the shape type of this trigger component */
export class GetTriggerShapeNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Trigger Shape (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('shape', new ClassicPreset.Output(strSocket, 'Shape'));
  }
}

// ---- Register the trigger component rule ----

registerComponentRule({
  componentTypes: ['trigger'],
  getEntries(comp: ActorComponentData, index: number) {
    const n = comp.name;
    return [
      { label: `Set Trigger Enabled (${n})`,     factory: () => new SetTriggerEnabledNode(n, index) },
      { label: `Is Trigger Enabled (${n})`,      factory: () => new GetTriggerEnabledNode(n, index) },
      { label: `Set Trigger Size (${n})`,        factory: () => new SetTriggerSizeNode(n, index) },
      { label: `Get Overlap Count (${n})`,       factory: () => new GetTriggerOverlapCountNode(n, index) },
      { label: `Is Overlapping (${n})`,          factory: () => new IsTriggerOverlappingNode(n, index) },
      { label: `Get Trigger Shape (${n})`,       factory: () => new GetTriggerShapeNode(n, index) },
    ];
  },
});
