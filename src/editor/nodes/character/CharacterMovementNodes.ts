// ============================================================
//  Character Movement Nodes — Blueprint nodes for controlling
//  Character Pawn movement, camera, and state queries.
//
//  At runtime, the CharacterController is accessible via:
//    gameObject.characterController
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, vec3Socket, strSocket } from '../sockets';
import { registerNode } from '../sockets';
import { KeySelectControl } from '../events/InputKeyNodes';

// ---- Movement Mode preset list (matches engine MovementMode type) ----
export const MOVEMENT_MODES = [
  'walking',
  'running',
  'crouching',
  'jumping',
  'falling',
  'flying',
  'swimming',
] as const;

/**
 * Custom control that stores a MovementMode string.
 * Rendered as a dropdown by the React preset customisation.
 */
export class MovementModeSelectControl extends ClassicPreset.Control {
  public value: string;

  constructor(initial: string = 'walking') {
    super();
    this.value = initial;
  }

  setValue(v: string) {
    this.value = v;
  }
}

// ================================================================
//  ACTION NODES (exec-flow)
// ================================================================

/** Add Movement Input — Adds scaled directional input (like UE's AddMovementInput) */
export class AddMovementInputNode extends ClassicPreset.Node {
  constructor() {
    super('Add Movement Input');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addInput('scale', new ClassicPreset.Input(numSocket, 'Scale'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Jump */
export class JumpNode extends ClassicPreset.Node {
  constructor() {
    super('Jump');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Stop Jumping */
export class StopJumpingNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Jumping');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Crouch */
export class CrouchNode extends ClassicPreset.Node {
  constructor() {
    super('Crouch');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Uncrouch */
export class UncrouchNode extends ClassicPreset.Node {
  constructor() {
    super('Uncrouch');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Movement Mode — UE-style dropdown selector */
export class SetMovementModeNode extends ClassicPreset.Node {
  constructor(mode: string = 'walking') {
    super('Set Movement Mode');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addControl('mode', new MovementModeSelectControl(mode));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Max Walk Speed */
export class SetMaxWalkSpeedNode extends ClassicPreset.Node {
  constructor() {
    super('Set Max Walk Speed');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Launch Character */
export class LaunchCharacterNode extends ClassicPreset.Node {
  constructor() {
    super('Launch Character');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addInput('overrideXY', new ClassicPreset.Input(boolSocket, 'Override XY'));
    this.addInput('overrideZ', new ClassicPreset.Input(boolSocket, 'Override Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Camera Mode */
export class SetCameraModeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Mode');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('mode', new ClassicPreset.Input(strSocket, 'Mode'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set Camera FOV */
export class SetCameraFOVNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera FOV');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('fov', new ClassicPreset.Input(numSocket, 'FOV'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ================================================================
//  QUERY NODES (pure — no exec pins)
// ================================================================

/** Get Character Velocity — normalised 0‒1 scalar (speed / maxSpeed) like UE */
export class GetCharacterVelocityNode extends ClassicPreset.Node {
  constructor() {
    super('Get Character Velocity');
    this.addOutput('velocity', new ClassicPreset.Output(numSocket, 'Velocity'));
  }
}

/** Get Movement Speed */
export class GetMovementSpeedNode extends ClassicPreset.Node {
  constructor() {
    super('Get Movement Speed');
    this.addOutput('speed', new ClassicPreset.Output(numSocket, 'Speed'));
  }
}

/** Is Grounded */
export class IsGroundedNode extends ClassicPreset.Node {
  constructor() {
    super('Is Grounded');
    this.addOutput('grounded', new ClassicPreset.Output(boolSocket, 'Grounded'));
  }
}

/** Is Jumping */
export class IsJumpingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Jumping');
    this.addOutput('jumping', new ClassicPreset.Output(boolSocket, 'Jumping'));
  }
}

/** Is Crouching */
export class IsCrouchingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Crouching');
    this.addOutput('crouching', new ClassicPreset.Output(boolSocket, 'Crouching'));
  }
}

/** Is Falling */
export class IsFallingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Falling');
    this.addOutput('falling', new ClassicPreset.Output(boolSocket, 'Falling'));
  }
}

/** Is Moving */
export class IsMovingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Moving');
    this.addOutput('moving', new ClassicPreset.Output(boolSocket, 'Moving'));
  }
}

/** Get Movement Mode */
export class GetMovementModeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Movement Mode');
    this.addOutput('mode', new ClassicPreset.Output(strSocket, 'Mode'));
  }
}

/** Get Camera Location */
export class GetCameraLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Get Camera Location');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

// ================================================================
//  FLYING & SWIMMING ACTION NODES
// ================================================================

/** Start Flying — enter flying movement mode (zero gravity, 6DOF) */
export class StartFlyingNode extends ClassicPreset.Node {
  constructor() {
    super('Start Flying');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Stop Flying — exit flying mode, resume gravity */
export class StopFlyingNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Flying');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Is Flying */
export class IsFlyingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Flying');
    this.addOutput('flying', new ClassicPreset.Output(boolSocket, 'Flying'));
  }
}

/** Start Swimming — enter swimming movement mode (buoyancy physics) */
export class StartSwimmingNode extends ClassicPreset.Node {
  constructor() {
    super('Start Swimming');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Stop Swimming — exit swimming mode, resume gravity */
export class StopSwimmingNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Swimming');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Is Swimming */
export class IsSwimmingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Swimming');
    this.addOutput('swimming', new ClassicPreset.Output(boolSocket, 'Swimming'));
  }
}

// ================================================================
//  INPUT AXIS NODE — UE-style axis mapping
//  Two key dropdowns: positive key → +1, negative key → -1
//  Outputs a Number: +1 if positive held, -1 if negative held, 0 if both/neither.
// ================================================================

export class InputAxisNode extends ClassicPreset.Node {
  public positiveKey: string;
  public negativeKey: string;

  constructor(positiveKey: string = 'D', negativeKey: string = 'A') {
    super('Input Axis');
    this.positiveKey = positiveKey;
    this.negativeKey = negativeKey;
    // Key dropdown controls so the user can change keys directly on the node
    this.addControl('posKey', new KeySelectControl(positiveKey));
    this.addControl('negKey', new KeySelectControl(negativeKey));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Axis Value'));
  }
}

// ================================================================
//  Register all nodes in the palette under "Character" category
// ================================================================

registerNode('Add Movement Input', 'Character', () => new AddMovementInputNode());
registerNode('Jump', 'Character', () => new JumpNode());
registerNode('Stop Jumping', 'Character', () => new StopJumpingNode());
registerNode('Crouch', 'Character', () => new CrouchNode());
registerNode('Uncrouch', 'Character', () => new UncrouchNode());
registerNode('Start Flying', 'Character', () => new StartFlyingNode());
registerNode('Stop Flying', 'Character', () => new StopFlyingNode());
registerNode('Start Swimming', 'Character', () => new StartSwimmingNode());
registerNode('Stop Swimming', 'Character', () => new StopSwimmingNode());
registerNode('Set Movement Mode', 'Character', () => new SetMovementModeNode());
registerNode('Set Max Walk Speed', 'Character', () => new SetMaxWalkSpeedNode());
registerNode('Launch Character', 'Character', () => new LaunchCharacterNode());
registerNode('Set Camera Mode', 'Character', () => new SetCameraModeNode());
registerNode('Set Camera FOV', 'Character', () => new SetCameraFOVNode());
registerNode('Get Character Velocity', 'Character', () => new GetCharacterVelocityNode());
registerNode('Get Movement Speed', 'Character', () => new GetMovementSpeedNode());
registerNode('Is Grounded', 'Character', () => new IsGroundedNode());
registerNode('Is Jumping', 'Character', () => new IsJumpingNode());
registerNode('Is Crouching', 'Character', () => new IsCrouchingNode());
registerNode('Is Falling', 'Character', () => new IsFallingNode());
registerNode('Is Flying', 'Character', () => new IsFlyingNode());
registerNode('Is Swimming', 'Character', () => new IsSwimmingNode());
registerNode('Is Moving', 'Character', () => new IsMovingNode());
registerNode('Get Movement Mode', 'Character', () => new GetMovementModeNode());
registerNode('Get Camera Location', 'Character', () => new GetCameraLocationNode());
registerNode('Input Axis', 'Character', () => new InputAxisNode());
