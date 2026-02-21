// ============================================================
//  Character 2D Nodes — Blueprint nodes for 2D character
//  movement (platformer / top-down) at runtime.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, registerNode } from '../sockets';

// ================================================================
//  Add Movement Input 2D
// ================================================================
export class AddMovementInput2DNode extends ClassicPreset.Node {
  constructor() {
    super('Add Movement Input 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('scale', new ClassicPreset.Input(numSocket, 'Scale'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Movement Input 2D', 'Movement 2D', () => new AddMovementInput2DNode());

// ================================================================
//  Jump 2D
// ================================================================
export class Jump2DNode extends ClassicPreset.Node {
  constructor() {
    super('Jump 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Jump 2D', 'Movement 2D', () => new Jump2DNode());

// ================================================================
//  Stop Jump 2D
// ================================================================
export class StopJump2DNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Jump 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Stop Jump 2D', 'Movement 2D', () => new StopJump2DNode());

// ================================================================
//  Launch Character 2D
// ================================================================
export class LaunchCharacter2DNode extends ClassicPreset.Node {
  constructor() {
    super('Launch Character 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Launch Character 2D', 'Movement 2D', () => new LaunchCharacter2DNode());

// ================================================================
//  Set Max Walk Speed 2D
// ================================================================
export class SetMaxWalkSpeed2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Max Walk Speed 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Max Walk Speed 2D', 'Movement 2D', () => new SetMaxWalkSpeed2DNode());

// ================================================================
//  Get Max Walk Speed 2D
// ================================================================
export class GetMaxWalkSpeed2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Max Walk Speed 2D');
    this.addOutput('speed', new ClassicPreset.Output(numSocket, 'Speed'));
  }
}
registerNode('Get Max Walk Speed 2D', 'Movement 2D', () => new GetMaxWalkSpeed2DNode());

// ================================================================
//  Is Grounded 2D
// ================================================================
export class IsGrounded2DNode extends ClassicPreset.Node {
  constructor() {
    super('Is Grounded 2D');
    this.addOutput('grounded', new ClassicPreset.Output(boolSocket, 'Grounded'));
  }
}
registerNode('Is Grounded 2D', 'Movement 2D', () => new IsGrounded2DNode());

// ================================================================
//  Is Jumping 2D
// ================================================================
export class IsJumping2DNode extends ClassicPreset.Node {
  constructor() {
    super('Is Jumping 2D');
    this.addOutput('jumping', new ClassicPreset.Output(boolSocket, 'Jumping'));
  }
}
registerNode('Is Jumping 2D', 'Movement 2D', () => new IsJumping2DNode());

// ================================================================
//  Is Falling 2D
// ================================================================
export class IsFalling2DNode extends ClassicPreset.Node {
  constructor() {
    super('Is Falling 2D');
    this.addOutput('falling', new ClassicPreset.Output(boolSocket, 'Falling'));
  }
}
registerNode('Is Falling 2D', 'Movement 2D', () => new IsFalling2DNode());

// ================================================================
//  Get Character Velocity 2D
// ================================================================
export class GetCharacterVelocity2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Character Velocity 2D');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('speed', new ClassicPreset.Output(numSocket, 'Speed'));
  }
}
registerNode('Get Character Velocity 2D', 'Movement 2D', () => new GetCharacterVelocity2DNode());

// ================================================================
//  Add Impulse 2D (to character)
// ================================================================
export class AddCharacterImpulse2DNode extends ClassicPreset.Node {
  constructor() {
    super('Add Character Impulse 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Character Impulse 2D', 'Movement 2D', () => new AddCharacterImpulse2DNode());

// ================================================================
//  Stop Movement 2D
// ================================================================
export class StopMovement2DNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Movement 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Stop Movement 2D', 'Movement 2D', () => new StopMovement2DNode());

// ================================================================
//  Set Jump Height 2D
// ================================================================
export class SetJumpHeight2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Jump Height 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('height', new ClassicPreset.Input(numSocket, 'Height'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Jump Height 2D', 'Movement 2D', () => new SetJumpHeight2DNode());

// ================================================================
//  Set Max Jumps 2D
// ================================================================
export class SetMaxJumps2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Max Jumps 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('count', new ClassicPreset.Input(numSocket, 'Max Jumps'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Max Jumps 2D', 'Movement 2D', () => new SetMaxJumps2DNode());

// ================================================================
//  Get Jumps Remaining 2D
// ================================================================
export class GetJumpsRemaining2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Jumps Remaining 2D');
    this.addOutput('remaining', new ClassicPreset.Output(numSocket, 'Remaining'));
  }
}
registerNode('Get Jumps Remaining 2D', 'Movement 2D', () => new GetJumpsRemaining2DNode());

// ================================================================
//  Set Gravity Multiplier 2D
// ================================================================
export class SetGravityMultiplier2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Gravity Multiplier 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('multiplier', new ClassicPreset.Input(numSocket, 'Multiplier'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Gravity Multiplier 2D', 'Movement 2D', () => new SetGravityMultiplier2DNode());

// ================================================================
//  Flip Sprite Direction 2D
// ================================================================
export class FlipSpriteDirection2DNode extends ClassicPreset.Node {
  constructor() {
    super('Flip Sprite Direction 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('faceRight', new ClassicPreset.Input(boolSocket, 'Face Right'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Flip Sprite Direction 2D', 'Movement 2D', () => new FlipSpriteDirection2DNode());

// ================================================================
//  Set Air Control 2D
// ================================================================
export class SetAirControl2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Air Control 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('airControl', new ClassicPreset.Input(numSocket, 'Air Control'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Air Control 2D', 'Movement 2D', () => new SetAirControl2DNode());

// ================================================================
//  Get Sprite Facing Direction 2D
// ================================================================
export class GetSpriteFacingDirection2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Sprite Facing Direction 2D');
    this.addOutput('faceRight', new ClassicPreset.Output(boolSocket, 'Face Right'));
  }
}
registerNode('Get Sprite Facing Direction 2D', 'Movement 2D', () => new GetSpriteFacingDirection2DNode());

// ================================================================
//  Get Character Speed 2D
// ================================================================
export class GetCharacterSpeed2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Character Speed 2D');
    this.addOutput('speed', new ClassicPreset.Output(numSocket, 'Speed'));
    this.addOutput('horizontalSpeed', new ClassicPreset.Output(numSocket, 'Horizontal Speed'));
  }
}
registerNode('Get Character Speed 2D', 'Movement 2D', () => new GetCharacterSpeed2DNode());
