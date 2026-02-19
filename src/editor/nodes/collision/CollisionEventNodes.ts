// ============================================================
//  CollisionEventNodes — Blueprint event nodes for collision
//  and trigger overlap/hit detection.
//
//  These are placed in the Event Graph and fire when the runtime
//  CollisionSystem dispatches overlap begin/end or hit events.
//
//  Outputs expose full information about the collision:
//    • Other actor name
//    • Other actor ID
//    • Impact point, normal, velocity (hit events only)
//    • Self component name
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, objectSocket, registerNode } from '../sockets';

// ============================================================
//  On Trigger Begin Overlap
//  Fires when another actor enters this trigger volume.
// ============================================================
export class OnTriggerBeginOverlapNode extends ClassicPreset.Node {
  constructor() {
    super('On Trigger Begin Overlap');
    this.addOutput('exec',             new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherActor',       new ClassicPreset.Output(objectSocket, 'Other Actor'));
    this.addOutput('otherActorName',   new ClassicPreset.Output(strSocket, 'Other Actor Name'));
    this.addOutput('otherActorId',     new ClassicPreset.Output(numSocket, 'Other Actor ID'));
    this.addOutput('selfComponent',    new ClassicPreset.Output(strSocket, 'Self Component'));
  }
}

registerNode('On Trigger Begin Overlap', 'Collision', () => new OnTriggerBeginOverlapNode());

// ============================================================
//  On Trigger End Overlap
//  Fires when another actor leaves this trigger volume.
// ============================================================
export class OnTriggerEndOverlapNode extends ClassicPreset.Node {
  constructor() {
    super('On Trigger End Overlap');
    this.addOutput('exec',             new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherActor',       new ClassicPreset.Output(objectSocket, 'Other Actor'));
    this.addOutput('otherActorName',   new ClassicPreset.Output(strSocket, 'Other Actor Name'));
    this.addOutput('otherActorId',     new ClassicPreset.Output(numSocket, 'Other Actor ID'));
    this.addOutput('selfComponent',    new ClassicPreset.Output(strSocket, 'Self Component'));
  }
}

registerNode('On Trigger End Overlap', 'Collision', () => new OnTriggerEndOverlapNode());

// ============================================================
//  On Actor Begin Overlap
//  Fires when ANY component of this actor begins overlapping.
//  (Convenience node — same callback, just labelled differently)
// ============================================================
export class OnActorBeginOverlapNode extends ClassicPreset.Node {
  constructor() {
    super('On Actor Begin Overlap');
    this.addOutput('exec',             new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherActor',       new ClassicPreset.Output(objectSocket, 'Other Actor'));
    this.addOutput('otherActorName',   new ClassicPreset.Output(strSocket, 'Other Actor Name'));
    this.addOutput('otherActorId',     new ClassicPreset.Output(numSocket, 'Other Actor ID'));
  }
}

registerNode('On Actor Begin Overlap', 'Collision', () => new OnActorBeginOverlapNode());

// ============================================================
//  On Actor End Overlap
//  Fires when ANY component of this actor stops overlapping.
// ============================================================
export class OnActorEndOverlapNode extends ClassicPreset.Node {
  constructor() {
    super('On Actor End Overlap');
    this.addOutput('exec',             new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherActor',       new ClassicPreset.Output(objectSocket, 'Other Actor'));
    this.addOutput('otherActorName',   new ClassicPreset.Output(strSocket, 'Other Actor Name'));
    this.addOutput('otherActorId',     new ClassicPreset.Output(numSocket, 'Other Actor ID'));
  }
}

registerNode('On Actor End Overlap', 'Collision', () => new OnActorEndOverlapNode());

// ============================================================
//  On Collision Hit
//  Fires when a physics collision (blocking) occurs on this actor.
//  Provides full impact information.
// ============================================================
export class OnCollisionHitNode extends ClassicPreset.Node {
  constructor() {
    super('On Collision Hit');
    this.addOutput('exec',             new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherActor',       new ClassicPreset.Output(objectSocket, 'Other Actor'));
    this.addOutput('otherActorName',   new ClassicPreset.Output(strSocket, 'Other Actor Name'));
    this.addOutput('otherActorId',     new ClassicPreset.Output(numSocket, 'Other Actor ID'));
    this.addOutput('impactX',          new ClassicPreset.Output(numSocket, 'Impact X'));
    this.addOutput('impactY',          new ClassicPreset.Output(numSocket, 'Impact Y'));
    this.addOutput('impactZ',          new ClassicPreset.Output(numSocket, 'Impact Z'));
    this.addOutput('normalX',          new ClassicPreset.Output(numSocket, 'Normal X'));
    this.addOutput('normalY',          new ClassicPreset.Output(numSocket, 'Normal Y'));
    this.addOutput('normalZ',          new ClassicPreset.Output(numSocket, 'Normal Z'));
    this.addOutput('velocityX',        new ClassicPreset.Output(numSocket, 'Velocity X'));
    this.addOutput('velocityY',        new ClassicPreset.Output(numSocket, 'Velocity Y'));
    this.addOutput('velocityZ',        new ClassicPreset.Output(numSocket, 'Velocity Z'));
    this.addOutput('impulse',          new ClassicPreset.Output(numSocket, 'Impulse'));
    this.addOutput('selfComponent',    new ClassicPreset.Output(strSocket, 'Self Component'));
  }
}

registerNode('On Collision Hit', 'Collision', () => new OnCollisionHitNode());

// ============================================================
//  Is Overlapping Actor  (query node — pure, no exec)
//  Returns true if this actor is currently overlapping.
// ============================================================
export class IsOverlappingActorNode extends ClassicPreset.Node {
  constructor() {
    super('Is Overlapping Actor');
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Is Overlapping'));
  }
}

registerNode('Is Overlapping Actor', 'Collision', () => new IsOverlappingActorNode());

// ============================================================
//  Get Overlap Count  (query node — pure, no exec)
//  Returns the number of actors currently overlapping.
// ============================================================
export class GetOverlapCountNode extends ClassicPreset.Node {
  constructor() {
    super('Get Overlap Count');
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}

registerNode('Get Overlap Count', 'Collision', () => new GetOverlapCountNode());

// ============================================================
//  Set Collision Enabled  (control node — exec flow)
//  Enable or disable collision on this actor at runtime.
// ============================================================
export class SetCollisionEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Set Collision Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Collision Enabled', 'Collision', () => new SetCollisionEnabledNode());
