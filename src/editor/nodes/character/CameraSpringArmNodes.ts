// ============================================================
//  Camera & Spring Arm Blueprint Nodes
//  Provides nodes for controlling the spring arm (camera boom)
//  and camera component at runtime via Blueprint graphs.
//
//  Runtime access: gameObject.characterController
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket } from '../sockets';
import { MovementModeSelectControl } from './CharacterMovementNodes';
import { registerNode } from '../sockets';

// ================================================================
//  SPRING ARM ACTION NODES (exec-flow)
// ================================================================

/** Set Spring Arm Length — Sets the arm length (camera distance) */
export class SetSpringArmLengthNode extends ClassicPreset.Node {
  constructor() {
    super('Set Spring Arm Length');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('length', new ClassicPreset.Input(numSocket, 'Length'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Spring Arm Target Offset — Sets the boom origin offset */
export class SetSpringArmTargetOffsetNode extends ClassicPreset.Node {
  constructor() {
    super('Set Spring Arm Target Offset');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Spring Arm Socket Offset — Sets the camera offset at end of arm */
export class SetSpringArmSocketOffsetNode extends ClassicPreset.Node {
  constructor() {
    super('Set Spring Arm Socket Offset');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Spring Arm Collision — Enable/disable collision test */
export class SetSpringArmCollisionNode extends ClassicPreset.Node {
  constructor() {
    super('Set Spring Arm Collision');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Camera Collision Enabled — Enable/disable the camera boom collision test.
 *  When disabled the camera will never retract — it passes through all geometry. */
export class SetCameraCollisionEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Collision Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Camera Lag — Enable/disable camera position lag */
export class SetCameraLagNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Lag');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Camera Rotation Lag — Enable/disable camera rotation lag */
export class SetCameraRotationLagNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Rotation Lag');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ================================================================
//  SPRING ARM QUERY NODES (pure — no exec pins)
// ================================================================

/** Get Spring Arm Length */
export class GetSpringArmLengthNode extends ClassicPreset.Node {
  constructor() {
    super('Get Spring Arm Length');
    this.addOutput('length', new ClassicPreset.Output(numSocket, 'Length'));
  }
}

/** Get Spring Arm Target Offset */
export class GetSpringArmTargetOffsetNode extends ClassicPreset.Node {
  constructor() {
    super('Get Spring Arm Target Offset');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

/** Get Spring Arm Socket Offset */
export class GetSpringArmSocketOffsetNode extends ClassicPreset.Node {
  constructor() {
    super('Get Spring Arm Socket Offset');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

// ================================================================
//  CAMERA MODE LITERAL NODE
// ================================================================

/** Camera Mode — Outputs a camera mode value (firstPerson / thirdPerson) */
export class CameraModeLiteralNode extends ClassicPreset.Node {
  constructor() {
    super('Camera Mode');
    this.addControl('mode', new ClassicPreset.InputControl('text', { initial: 'thirdPerson' }));
    this.addOutput('mode', new ClassicPreset.Output(strSocket, 'Mode'));
  }
}

/** Movement Mode Literal — Outputs a movement mode value */
export class MovementModeLiteralNode extends ClassicPreset.Node {
  constructor(mode: string = 'walking') {
    super('Movement Mode');
    this.addControl('mode', new MovementModeSelectControl(mode));
    this.addOutput('mode', new ClassicPreset.Output(strSocket, 'Mode'));
  }
}

// ================================================================
//  Get Camera Rotation as X/Y/Z
// ================================================================

export class GetCameraRotationNode extends ClassicPreset.Node {
  constructor() {
    super('Get Camera Rotation');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'Pitch'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Yaw'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Roll'));
  }
}

// ================================================================
//  Register all nodes under "Character" category
// ================================================================

registerNode('Set Spring Arm Length', 'Character', () => new SetSpringArmLengthNode());
registerNode('Set Spring Arm Target Offset', 'Character', () => new SetSpringArmTargetOffsetNode());
registerNode('Set Spring Arm Socket Offset', 'Character', () => new SetSpringArmSocketOffsetNode());
registerNode('Set Spring Arm Collision', 'Character', () => new SetSpringArmCollisionNode());
registerNode('Set Camera Collision Enabled', 'Character', () => new SetCameraCollisionEnabledNode());
registerNode('Set Camera Lag', 'Character', () => new SetCameraLagNode());
registerNode('Set Camera Rotation Lag', 'Character', () => new SetCameraRotationLagNode());
registerNode('Get Spring Arm Length', 'Character', () => new GetSpringArmLengthNode());
registerNode('Get Spring Arm Target Offset', 'Character', () => new GetSpringArmTargetOffsetNode());
registerNode('Get Spring Arm Socket Offset', 'Character', () => new GetSpringArmSocketOffsetNode());
registerNode('Camera Mode', 'Character', () => new CameraModeLiteralNode());
registerNode('Movement Mode', 'Character', () => new MovementModeLiteralNode());
registerNode('Get Camera Rotation', 'Character', () => new GetCameraRotationNode());
