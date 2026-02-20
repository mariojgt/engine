// ============================================================
//  Physics 2D Nodes — Blueprint nodes for Rapier2D physics
//  queries and body manipulation at runtime.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, vec3Socket, strSocket, registerNode } from '../sockets';

// ================================================================
//  Line Trace 2D
// ================================================================
export class LineTrace2DNode extends ClassicPreset.Node {
  constructor() {
    super('Line Trace 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('startX', new ClassicPreset.Input(numSocket, 'Start X'));
    this.addInput('startY', new ClassicPreset.Input(numSocket, 'Start Y'));
    this.addInput('endX', new ClassicPreset.Input(numSocket, 'End X'));
    this.addInput('endY', new ClassicPreset.Input(numSocket, 'End Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Hit'));
    this.addOutput('hitX', new ClassicPreset.Output(numSocket, 'Hit X'));
    this.addOutput('hitY', new ClassicPreset.Output(numSocket, 'Hit Y'));
    this.addOutput('normalX', new ClassicPreset.Output(numSocket, 'Normal X'));
    this.addOutput('normalY', new ClassicPreset.Output(numSocket, 'Normal Y'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
  }
}
registerNode('Line Trace 2D', 'Physics 2D', () => new LineTrace2DNode());

// ================================================================
//  Box Overlap 2D
// ================================================================
export class BoxOverlap2DNode extends ClassicPreset.Node {
  constructor() {
    super('Box Overlap 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('centerX', new ClassicPreset.Input(numSocket, 'Center X'));
    this.addInput('centerY', new ClassicPreset.Input(numSocket, 'Center Y'));
    this.addInput('halfW', new ClassicPreset.Input(numSocket, 'Half Width'));
    this.addInput('halfH', new ClassicPreset.Input(numSocket, 'Half Height'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Overlapping'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}
registerNode('Box Overlap 2D', 'Physics 2D', () => new BoxOverlap2DNode());

// ================================================================
//  Circle Overlap 2D
// ================================================================
export class CircleOverlap2DNode extends ClassicPreset.Node {
  constructor() {
    super('Circle Overlap 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('centerX', new ClassicPreset.Input(numSocket, 'Center X'));
    this.addInput('centerY', new ClassicPreset.Input(numSocket, 'Center Y'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Overlapping'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}
registerNode('Circle Overlap 2D', 'Physics 2D', () => new CircleOverlap2DNode());

// ================================================================
//  Set Simulate Physics 2D
// ================================================================
export class SetSimulatePhysics2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Simulate Physics 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enable', new ClassicPreset.Input(boolSocket, 'Enable'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Simulate Physics 2D', 'Physics 2D', () => new SetSimulatePhysics2DNode());

// ================================================================
//  Add Force 2D
// ================================================================
export class AddForce2DNode extends ClassicPreset.Node {
  constructor() {
    super('Add Force 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Force 2D', 'Physics 2D', () => new AddForce2DNode());

// ================================================================
//  Add Impulse 2D
// ================================================================
export class AddImpulse2DNode extends ClassicPreset.Node {
  constructor() {
    super('Add Impulse 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Impulse 2D', 'Physics 2D', () => new AddImpulse2DNode());

// ================================================================
//  Set Velocity 2D
// ================================================================
export class SetVelocity2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Velocity 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Velocity 2D', 'Physics 2D', () => new SetVelocity2DNode());

// ================================================================
//  Get Velocity 2D
// ================================================================
export class GetVelocity2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Velocity 2D');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('speed', new ClassicPreset.Output(numSocket, 'Speed'));
  }
}
registerNode('Get Velocity 2D', 'Physics 2D', () => new GetVelocity2DNode());

// ================================================================
//  Set Gravity Scale 2D
// ================================================================
export class SetGravityScale2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Gravity Scale 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('scale', new ClassicPreset.Input(numSocket, 'Scale'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Gravity Scale 2D', 'Physics 2D', () => new SetGravityScale2DNode());

// ================================================================
//  Add Torque 2D
// ================================================================
export class AddTorque2DNode extends ClassicPreset.Node {
  constructor() {
    super('Add Torque 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('torque', new ClassicPreset.Input(numSocket, 'Torque'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Torque 2D', 'Physics 2D', () => new AddTorque2DNode());

// ================================================================
//  Set Body Type 2D
// ================================================================
export class SetBodyType2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Body Type 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('type', new ClassicPreset.Input(strSocket, 'Type')); // dynamic | static | kinematic
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Body Type 2D', 'Physics 2D', () => new SetBodyType2DNode());

// ================================================================
//  Get Body Type 2D
// ================================================================
export class GetBodyType2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Body Type 2D');
    this.addOutput('type', new ClassicPreset.Output(strSocket, 'Type'));
  }
}
registerNode('Get Body Type 2D', 'Physics 2D', () => new GetBodyType2DNode());

// ================================================================
//  Lock Rotation 2D
// ================================================================
export class LockRotation2DNode extends ClassicPreset.Node {
  constructor() {
    super('Lock Rotation 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('lock', new ClassicPreset.Input(boolSocket, 'Lock'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Lock Rotation 2D', 'Physics 2D', () => new LockRotation2DNode());

// ================================================================
//  Set Linear Damping 2D
// ================================================================
export class SetLinearDamping2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Linear Damping 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('damping', new ClassicPreset.Input(numSocket, 'Damping'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Linear Damping 2D', 'Physics 2D', () => new SetLinearDamping2DNode());

// ================================================================
//  On Collision Begin 2D
// ================================================================
export class OnCollisionBegin2DNode extends ClassicPreset.Node {
  constructor() {
    super('On Collision Begin 2D');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherName', new ClassicPreset.Output(strSocket, 'Other Actor'));
    this.addOutput('normalX', new ClassicPreset.Output(numSocket, 'Normal X'));
    this.addOutput('normalY', new ClassicPreset.Output(numSocket, 'Normal Y'));
  }
}
registerNode('On Collision Begin 2D', 'Physics 2D', () => new OnCollisionBegin2DNode());

// ================================================================
//  On Collision End 2D
// ================================================================
export class OnCollisionEnd2DNode extends ClassicPreset.Node {
  constructor() {
    super('On Collision End 2D');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherName', new ClassicPreset.Output(strSocket, 'Other Actor'));
  }
}
registerNode('On Collision End 2D', 'Physics 2D', () => new OnCollisionEnd2DNode());

// ================================================================
//  On Trigger Begin 2D
// ================================================================
export class OnTriggerBegin2DNode extends ClassicPreset.Node {
  constructor() {
    super('On Trigger Begin 2D');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherName', new ClassicPreset.Output(strSocket, 'Other Actor'));
  }
}
registerNode('On Trigger Begin 2D', 'Physics 2D', () => new OnTriggerBegin2DNode());

// ================================================================
//  On Trigger End 2D
// ================================================================
export class OnTriggerEnd2DNode extends ClassicPreset.Node {
  constructor() {
    super('On Trigger End 2D');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('otherName', new ClassicPreset.Output(strSocket, 'Other Actor'));
  }
}
registerNode('On Trigger End 2D', 'Physics 2D', () => new OnTriggerEnd2DNode());
