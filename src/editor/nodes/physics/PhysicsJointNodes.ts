// ============================================================
//  Physics Joint Nodes — Blueprint nodes for creating and
//  managing physics joints/constraints between actors.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, strSocket, boolSocket, registerNode } from '../sockets';

// ── Create Fixed Joint ──────────────────────────────────────

export class CreateFixedJointNode extends ClassicPreset.Node {
  constructor() {
    super('Create Fixed Joint');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actorA', new ClassicPreset.Input(numSocket, 'Actor A ID'));
    this.addInput('actorB', new ClassicPreset.Input(numSocket, 'Actor B ID'));
    this.addInput('anchorAx', new ClassicPreset.Input(numSocket, 'Anchor A X'));
    this.addInput('anchorAy', new ClassicPreset.Input(numSocket, 'Anchor A Y'));
    this.addInput('anchorAz', new ClassicPreset.Input(numSocket, 'Anchor A Z'));
    this.addInput('anchorBx', new ClassicPreset.Input(numSocket, 'Anchor B X'));
    this.addInput('anchorBy', new ClassicPreset.Input(numSocket, 'Anchor B Y'));
    this.addInput('anchorBz', new ClassicPreset.Input(numSocket, 'Anchor B Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('jointId', new ClassicPreset.Output(numSocket, 'Joint ID'));
  }
}

registerNode('Create Fixed Joint', 'Physics Joints', () => new CreateFixedJointNode());

// ── Create Ball Socket Joint ────────────────────────────────

export class CreateBallSocketJointNode extends ClassicPreset.Node {
  constructor() {
    super('Create Ball Socket Joint');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actorA', new ClassicPreset.Input(numSocket, 'Actor A ID'));
    this.addInput('actorB', new ClassicPreset.Input(numSocket, 'Actor B ID'));
    this.addInput('anchorAx', new ClassicPreset.Input(numSocket, 'Anchor A X'));
    this.addInput('anchorAy', new ClassicPreset.Input(numSocket, 'Anchor A Y'));
    this.addInput('anchorAz', new ClassicPreset.Input(numSocket, 'Anchor A Z'));
    this.addInput('anchorBx', new ClassicPreset.Input(numSocket, 'Anchor B X'));
    this.addInput('anchorBy', new ClassicPreset.Input(numSocket, 'Anchor B Y'));
    this.addInput('anchorBz', new ClassicPreset.Input(numSocket, 'Anchor B Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('jointId', new ClassicPreset.Output(numSocket, 'Joint ID'));
  }
}

registerNode('Create Ball Socket Joint', 'Physics Joints', () => new CreateBallSocketJointNode());

// ── Create Hinge Joint ──────────────────────────────────────

export class CreateHingeJointNode extends ClassicPreset.Node {
  constructor() {
    super('Create Hinge Joint');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actorA', new ClassicPreset.Input(numSocket, 'Actor A ID'));
    this.addInput('actorB', new ClassicPreset.Input(numSocket, 'Actor B ID'));
    this.addInput('anchorAx', new ClassicPreset.Input(numSocket, 'Anchor A X'));
    this.addInput('anchorAy', new ClassicPreset.Input(numSocket, 'Anchor A Y'));
    this.addInput('anchorAz', new ClassicPreset.Input(numSocket, 'Anchor A Z'));
    this.addInput('anchorBx', new ClassicPreset.Input(numSocket, 'Anchor B X'));
    this.addInput('anchorBy', new ClassicPreset.Input(numSocket, 'Anchor B Y'));
    this.addInput('anchorBz', new ClassicPreset.Input(numSocket, 'Anchor B Z'));
    this.addInput('axisX', new ClassicPreset.Input(numSocket, 'Axis X'));
    this.addInput('axisY', new ClassicPreset.Input(numSocket, 'Axis Y'));
    this.addInput('axisZ', new ClassicPreset.Input(numSocket, 'Axis Z'));
    this.addInput('limitMin', new ClassicPreset.Input(numSocket, 'Limit Min (rad)'));
    this.addInput('limitMax', new ClassicPreset.Input(numSocket, 'Limit Max (rad)'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('jointId', new ClassicPreset.Output(numSocket, 'Joint ID'));
  }
}

registerNode('Create Hinge Joint', 'Physics Joints', () => new CreateHingeJointNode());

// ── Create Prismatic Joint ──────────────────────────────────

export class CreatePrismaticJointNode extends ClassicPreset.Node {
  constructor() {
    super('Create Prismatic Joint');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actorA', new ClassicPreset.Input(numSocket, 'Actor A ID'));
    this.addInput('actorB', new ClassicPreset.Input(numSocket, 'Actor B ID'));
    this.addInput('anchorAx', new ClassicPreset.Input(numSocket, 'Anchor A X'));
    this.addInput('anchorAy', new ClassicPreset.Input(numSocket, 'Anchor A Y'));
    this.addInput('anchorAz', new ClassicPreset.Input(numSocket, 'Anchor A Z'));
    this.addInput('anchorBx', new ClassicPreset.Input(numSocket, 'Anchor B X'));
    this.addInput('anchorBy', new ClassicPreset.Input(numSocket, 'Anchor B Y'));
    this.addInput('anchorBz', new ClassicPreset.Input(numSocket, 'Anchor B Z'));
    this.addInput('axisX', new ClassicPreset.Input(numSocket, 'Axis X'));
    this.addInput('axisY', new ClassicPreset.Input(numSocket, 'Axis Y'));
    this.addInput('axisZ', new ClassicPreset.Input(numSocket, 'Axis Z'));
    this.addInput('limitMin', new ClassicPreset.Input(numSocket, 'Limit Min'));
    this.addInput('limitMax', new ClassicPreset.Input(numSocket, 'Limit Max'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('jointId', new ClassicPreset.Output(numSocket, 'Joint ID'));
  }
}

registerNode('Create Prismatic Joint', 'Physics Joints', () => new CreatePrismaticJointNode());

// ── Create Spring Joint ─────────────────────────────────────

export class CreateSpringJointNode extends ClassicPreset.Node {
  constructor() {
    super('Create Spring Joint');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actorA', new ClassicPreset.Input(numSocket, 'Actor A ID'));
    this.addInput('actorB', new ClassicPreset.Input(numSocket, 'Actor B ID'));
    this.addInput('anchorAx', new ClassicPreset.Input(numSocket, 'Anchor A X'));
    this.addInput('anchorAy', new ClassicPreset.Input(numSocket, 'Anchor A Y'));
    this.addInput('anchorAz', new ClassicPreset.Input(numSocket, 'Anchor A Z'));
    this.addInput('anchorBx', new ClassicPreset.Input(numSocket, 'Anchor B X'));
    this.addInput('anchorBy', new ClassicPreset.Input(numSocket, 'Anchor B Y'));
    this.addInput('anchorBz', new ClassicPreset.Input(numSocket, 'Anchor B Z'));
    this.addInput('restLength', new ClassicPreset.Input(numSocket, 'Rest Length'));
    this.addInput('stiffness', new ClassicPreset.Input(numSocket, 'Stiffness'));
    this.addInput('damping', new ClassicPreset.Input(numSocket, 'Damping'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('jointId', new ClassicPreset.Output(numSocket, 'Joint ID'));
  }
}

registerNode('Create Spring Joint', 'Physics Joints', () => new CreateSpringJointNode());

// ── Remove Joint ────────────────────────────────────────────

export class RemoveJointNode extends ClassicPreset.Node {
  constructor() {
    super('Remove Joint');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('jointId', new ClassicPreset.Input(numSocket, 'Joint ID'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}

registerNode('Remove Joint', 'Physics Joints', () => new RemoveJointNode());

// ── Set Hinge Motor ─────────────────────────────────────────

export class SetHingeMotorNode extends ClassicPreset.Node {
  constructor() {
    super('Set Hinge Motor');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('jointId', new ClassicPreset.Input(numSocket, 'Joint ID'));
    this.addInput('velocity', new ClassicPreset.Input(numSocket, 'Target Velocity'));
    this.addInput('maxForce', new ClassicPreset.Input(numSocket, 'Max Force'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Hinge Motor', 'Physics Joints', () => new SetHingeMotorNode());
