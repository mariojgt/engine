// ============================================================
//  TriggerComponentNodes — UE-style trigger component event
//  binding & utility nodes.
//
//  Like Unreal Engine, each trigger component gets its own
//  OnBeginOverlap and OnEndOverlap event nodes that are
//  *bound* to that specific trigger.  This lets the developer
//  place a red "Event" header node per trigger and handle the
//  overlap directly in the graph — exactly like dragging a
//  trigger component in UE and selecting "Add Event →
//  On Component Begin Overlap".
//
//  Only the essential pins/lines are shown:
//    Event nodes:  ▶ exec, Other Actor Name, Other Actor ID
//    Utility:      Set Enabled, Is Enabled, Is Overlapping
//
//  At runtime the code generator filters overlap callbacks by
//  selfComponentName so only the bound trigger fires each node.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, objectSocket } from '../sockets';
import { registerComponentRule } from './ComponentNodeRules';
import type { ActorComponentData } from '../../ActorAsset';

// ============================================================
//  Event: On Begin Overlap (bound to a specific trigger)
//  Fires when another actor ENTERS this trigger volume.
//  Outputs:  ▶ exec, Other Actor Name, Other Actor ID
// ============================================================
export class OnTriggerComponentBeginOverlapNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`On Begin Overlap (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('exec',           new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherActor',     new ClassicPreset.Output(objectSocket, 'Other Actor'));
    this.addOutput('otherActorName', new ClassicPreset.Output(strSocket, 'Other Actor Name'));
    this.addOutput('otherActorId',   new ClassicPreset.Output(numSocket, 'Other Actor ID'));
  }
}

// ============================================================
//  Event: On End Overlap (bound to a specific trigger)
//  Fires when another actor LEAVES this trigger volume.
//  Outputs:  ▶ exec, Other Actor Name, Other Actor ID
// ============================================================
export class OnTriggerComponentEndOverlapNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`On End Overlap (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('exec',           new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherActor',     new ClassicPreset.Output(objectSocket, 'Other Actor'));
    this.addOutput('otherActorName', new ClassicPreset.Output(strSocket, 'Other Actor Name'));
    this.addOutput('otherActorId',   new ClassicPreset.Output(numSocket, 'Other Actor ID'));
  }
}

// ============================================================
//  Utility: Enable or disable a trigger at runtime
// ============================================================
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

// ============================================================
//  Utility: Check if a trigger is currently enabled
// ============================================================
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

// ============================================================
//  Utility: Check if this trigger is currently overlapping
// ============================================================
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

// ---- Backwards-compat: keep old classes around so saved graphs still load ----

/** @deprecated Use OnTriggerComponentBeginOverlapNode. Kept for deserialization. */
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

/** @deprecated Kept for deserialization. */
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

/** @deprecated Kept for deserialization. */
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

// ============================================================
//  Register the trigger component rule
//  Shows only the relevant event bindings + essential utilities
//  in the right-click palette, like UE's component context menu.
// ============================================================

registerComponentRule({
  componentTypes: ['trigger'],
  getEntries(comp: ActorComponentData, index: number) {
    const n = comp.name;
    return [
      // ── Event bindings (like UE "Add Event → On Component Begin/End Overlap") ──
      { label: `On Begin Overlap (${n})`,        factory: () => new OnTriggerComponentBeginOverlapNode(n, index) },
      { label: `On End Overlap (${n})`,          factory: () => new OnTriggerComponentEndOverlapNode(n, index) },
      // ── Essential utilities ──
      { label: `Set Trigger Enabled (${n})`,     factory: () => new SetTriggerEnabledNode(n, index) },
      { label: `Is Trigger Enabled (${n})`,      factory: () => new GetTriggerEnabledNode(n, index) },
      { label: `Is Overlapping (${n})`,          factory: () => new IsTriggerOverlappingNode(n, index) },
    ];
  },
});
