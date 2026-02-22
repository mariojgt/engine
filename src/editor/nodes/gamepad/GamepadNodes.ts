// ============================================================
//  GamepadNodes — Blueprint nodes for Gamepad input
//
//  All nodes are UI-only definitions.  Code generation is
//  handled centrally in NodeEditorPanel.tsx genAction()/resolveValue().
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  numSocket,
  boolSocket,
  registerNode,
} from '../sockets';

// ============================================================
//  Is Gamepad Connected
// ============================================================
export class IsGamepadConnectedNode extends ClassicPreset.Node {
  constructor() {
    super('Is Gamepad Connected');
    this.addInput('gamepadIndex', new ClassicPreset.Input(numSocket, 'Gamepad Index'));
    this.addOutput('connected', new ClassicPreset.Output(boolSocket, 'Connected'));
  }
}

registerNode('Is Gamepad Connected', 'Gamepad', () => new IsGamepadConnectedNode());

// ============================================================
//  Get Gamepad Axis — returns a float axis value (sticks, triggers)
// ============================================================
export class GetGamepadAxisNode extends ClassicPreset.Node {
  constructor() {
    super('Get Gamepad Axis');
    this.addInput('axisIndex', new ClassicPreset.Input(numSocket, 'Axis Index'));
    this.addInput('gamepadIndex', new ClassicPreset.Input(numSocket, 'Gamepad Index'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}

registerNode('Get Gamepad Axis', 'Gamepad', () => new GetGamepadAxisNode());

// ============================================================
//  Is Gamepad Button Down — true while held
// ============================================================
export class IsGamepadButtonDownNode extends ClassicPreset.Node {
  constructor() {
    super('Is Gamepad Button Down');
    this.addInput('buttonIndex', new ClassicPreset.Input(numSocket, 'Button Index'));
    this.addInput('gamepadIndex', new ClassicPreset.Input(numSocket, 'Gamepad Index'));
    this.addOutput('down', new ClassicPreset.Output(boolSocket, 'Is Down'));
  }
}

registerNode('Is Gamepad Button Down', 'Gamepad', () => new IsGamepadButtonDownNode());

// ============================================================
//  Is Gamepad Button Just Pressed — true only on press frame
// ============================================================
export class IsGamepadButtonJustPressedNode extends ClassicPreset.Node {
  constructor() {
    super('Is Gamepad Button Pressed');
    this.addInput('buttonIndex', new ClassicPreset.Input(numSocket, 'Button Index'));
    this.addInput('gamepadIndex', new ClassicPreset.Input(numSocket, 'Gamepad Index'));
    this.addOutput('pressed', new ClassicPreset.Output(boolSocket, 'Just Pressed'));
  }
}

registerNode('Is Gamepad Button Pressed', 'Gamepad', () => new IsGamepadButtonJustPressedNode());

// ============================================================
//  Is Gamepad Button Just Released — true only on release frame
// ============================================================
export class IsGamepadButtonJustReleasedNode extends ClassicPreset.Node {
  constructor() {
    super('Is Gamepad Button Released');
    this.addInput('buttonIndex', new ClassicPreset.Input(numSocket, 'Button Index'));
    this.addInput('gamepadIndex', new ClassicPreset.Input(numSocket, 'Gamepad Index'));
    this.addOutput('released', new ClassicPreset.Output(boolSocket, 'Just Released'));
  }
}

registerNode('Is Gamepad Button Released', 'Gamepad', () => new IsGamepadButtonJustReleasedNode());

// ============================================================
//  Set Gamepad Vibration — rumble / haptic feedback
// ============================================================
export class SetGamepadVibrationNode extends ClassicPreset.Node {
  constructor() {
    super('Set Gamepad Vibration');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('weakMagnitude', new ClassicPreset.Input(numSocket, 'Weak Magnitude'));
    this.addInput('strongMagnitude', new ClassicPreset.Input(numSocket, 'Strong Magnitude'));
    this.addInput('duration', new ClassicPreset.Input(numSocket, 'Duration (ms)'));
    this.addInput('gamepadIndex', new ClassicPreset.Input(numSocket, 'Gamepad Index'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Gamepad Vibration', 'Gamepad', () => new SetGamepadVibrationNode());

// ============================================================
//  Get Gamepad Left Stick — convenience (returns X,Y)
// ============================================================
export class GetGamepadLeftStickNode extends ClassicPreset.Node {
  constructor() {
    super('Get Gamepad Left Stick');
    this.addInput('gamepadIndex', new ClassicPreset.Input(numSocket, 'Gamepad Index'));
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
  }
}

registerNode('Get Gamepad Left Stick', 'Gamepad', () => new GetGamepadLeftStickNode());

// ============================================================
//  Get Gamepad Right Stick — convenience (returns X,Y)
// ============================================================
export class GetGamepadRightStickNode extends ClassicPreset.Node {
  constructor() {
    super('Get Gamepad Right Stick');
    this.addInput('gamepadIndex', new ClassicPreset.Input(numSocket, 'Gamepad Index'));
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
  }
}

registerNode('Get Gamepad Right Stick', 'Gamepad', () => new GetGamepadRightStickNode());
