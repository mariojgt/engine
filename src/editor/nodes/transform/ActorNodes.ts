// ============================================================
//  ActorNodes — UE5-style Actor manipulation nodes
//  Get/Set location, rotation, scale, vectors, tags, etc.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, objectSocket, registerNode } from '../sockets';

// ── Get Actor Forward/Right/Up Vector ───────────────────────

export class GetActorForwardVectorNode extends ClassicPreset.Node {
  constructor() {
    super('Get Actor Forward Vector');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}
registerNode('Get Actor Forward Vector', 'Transform', () => new GetActorForwardVectorNode());

export class GetActorRightVectorNode extends ClassicPreset.Node {
  constructor() {
    super('Get Actor Right Vector');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}
registerNode('Get Actor Right Vector', 'Transform', () => new GetActorRightVectorNode());

export class GetActorUpVectorNode extends ClassicPreset.Node {
  constructor() {
    super('Get Actor Up Vector');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}
registerNode('Get Actor Up Vector', 'Transform', () => new GetActorUpVectorNode());

export class GetActorVelocityNode extends ClassicPreset.Node {
  constructor() {
    super('Get Actor Velocity');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}
registerNode('Get Actor Velocity', 'Transform', () => new GetActorVelocityNode());

// ── Add Offset / Rotation nodes ─────────────────────────────

export class AddActorWorldOffsetNode extends ClassicPreset.Node {
  constructor() {
    super('Add Actor World Offset');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('dx', new ClassicPreset.Input(numSocket, 'Delta X'));
    this.addInput('dy', new ClassicPreset.Input(numSocket, 'Delta Y'));
    this.addInput('dz', new ClassicPreset.Input(numSocket, 'Delta Z'));
    this.addInput('sweep', new ClassicPreset.Input(boolSocket, 'Sweep'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Actor World Offset', 'Transform', () => new AddActorWorldOffsetNode());

export class AddActorWorldRotationNode extends ClassicPreset.Node {
  constructor() {
    super('Add Actor World Rotation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('dx', new ClassicPreset.Input(numSocket, 'Delta Pitch'));
    this.addInput('dy', new ClassicPreset.Input(numSocket, 'Delta Yaw'));
    this.addInput('dz', new ClassicPreset.Input(numSocket, 'Delta Roll'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Actor World Rotation', 'Transform', () => new AddActorWorldRotationNode());

export class AddActorLocalOffsetNode extends ClassicPreset.Node {
  constructor() {
    super('Add Actor Local Offset');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('dx', new ClassicPreset.Input(numSocket, 'Delta X'));
    this.addInput('dy', new ClassicPreset.Input(numSocket, 'Delta Y'));
    this.addInput('dz', new ClassicPreset.Input(numSocket, 'Delta Z'));
    this.addInput('sweep', new ClassicPreset.Input(boolSocket, 'Sweep'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Actor Local Offset', 'Transform', () => new AddActorLocalOffsetNode());

export class TeleportActorNode extends ClassicPreset.Node {
  constructor() {
    super('Teleport Actor');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('locX', new ClassicPreset.Input(numSocket, 'Dest X'));
    this.addInput('locY', new ClassicPreset.Input(numSocket, 'Dest Y'));
    this.addInput('locZ', new ClassicPreset.Input(numSocket, 'Dest Z'));
    this.addInput('rotX', new ClassicPreset.Input(numSocket, 'Dest Pitch'));
    this.addInput('rotY', new ClassicPreset.Input(numSocket, 'Dest Yaw'));
    this.addInput('rotZ', new ClassicPreset.Input(numSocket, 'Dest Roll'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Teleport Actor', 'Transform', () => new TeleportActorNode());

// ── Tag nodes ───────────────────────────────────────────────

export class ActorHasTagNode extends ClassicPreset.Node {
  constructor() {
    super('Actor Has Tag');
    this.addInput('tag', new ClassicPreset.Input(strSocket, 'Tag'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Has Tag'));
  }
}
registerNode('Actor Has Tag', 'Actor', () => new ActorHasTagNode());

export class AddTagToActorNode extends ClassicPreset.Node {
  constructor() {
    super('Add Tag to Actor');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('tag', new ClassicPreset.Input(strSocket, 'Tag'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Tag to Actor', 'Actor', () => new AddTagToActorNode());

export class RemoveTagFromActorNode extends ClassicPreset.Node {
  constructor() {
    super('Remove Tag from Actor');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('tag', new ClassicPreset.Input(strSocket, 'Tag'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Remove Tag from Actor', 'Actor', () => new RemoveTagFromActorNode());

// ── Actor visibility / collision / tick ──────────────────────

export class SetActorHiddenNode extends ClassicPreset.Node {
  constructor() {
    super('Set Actor Hidden in Game');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('hidden', new ClassicPreset.Input(boolSocket, 'Hidden'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Actor Hidden in Game', 'Actor', () => new SetActorHiddenNode());

export class SetActorEnableCollisionNode extends ClassicPreset.Node {
  constructor() {
    super('Set Actor Enable Collision');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Actor Enable Collision', 'Actor', () => new SetActorEnableCollisionNode());

export class SetActorTickEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Set Actor Tick Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Actor Tick Enabled', 'Actor', () => new SetActorTickEnabledNode());

// ── Component access ────────────────────────────────────────

export class GetComponentByClassNode extends ClassicPreset.Node {
  constructor() {
    super('Get Component by Class');
    this.addInput('target', new ClassicPreset.Input(objectSocket, 'Target'));
    this.addInput('className', new ClassicPreset.Input(strSocket, 'Component Class'));
    this.addOutput('component', new ClassicPreset.Output(objectSocket, 'Component'));
  }
}
registerNode('Get Component by Class', 'Components', () => new GetComponentByClassNode());

export class DestroyComponentNode extends ClassicPreset.Node {
  constructor() {
    super('Destroy Component');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('component', new ClassicPreset.Input(objectSocket, 'Component'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Destroy Component', 'Components', () => new DestroyComponentNode());
