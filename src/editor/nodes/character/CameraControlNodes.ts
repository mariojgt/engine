// ============================================================
//  Camera Control Nodes — UE-style controller input nodes
//  These allow blueprints to control camera rotation from any
//  input source (mouse, gamepad, keyboard, or custom logic).
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

// ---- Add Controller Yaw Input ----

export class AddControllerYawInputNode extends ClassicPreset.Node {
  constructor() {
    super('Add Controller Yaw Input');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Add Controller Yaw Input', 'Camera Control', () => new AddControllerYawInputNode());

// ---- Add Controller Pitch Input ----

export class AddControllerPitchInputNode extends ClassicPreset.Node {
  constructor() {
    super('Add Controller Pitch Input');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Add Controller Pitch Input', 'Camera Control', () => new AddControllerPitchInputNode());

// ---- Get Controller Rotation ----

export class GetControllerRotationNode extends ClassicPreset.Node {
  constructor() {
    super('Get Controller Rotation');
    this.addOutput('yaw', new ClassicPreset.Output(numSocket, 'Yaw (degrees)'));
    this.addOutput('pitch', new ClassicPreset.Output(numSocket, 'Pitch (degrees)'));
  }
}

registerNode('Get Controller Rotation', 'Camera Control', () => new GetControllerRotationNode());

// ---- Set Controller Rotation ----

export class SetControllerRotationNode extends ClassicPreset.Node {
  constructor() {
    super('Set Controller Rotation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('yaw', new ClassicPreset.Input(numSocket, 'Yaw (degrees)'));
    this.addInput('pitch', new ClassicPreset.Input(numSocket, 'Pitch (degrees)'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Controller Rotation', 'Camera Control', () => new SetControllerRotationNode());

// ---- Set Mouse Lock Enabled ----

export class SetMouseLockEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Set Mouse Lock Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(numSocket, 'Enabled')); // boolean treated as number
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Mouse Lock Enabled', 'Camera Control', () => new SetMouseLockEnabledNode());

// ---- Get Mouse Lock Status ----

export class GetMouseLockStatusNode extends ClassicPreset.Node {
  constructor() {
    super('Is Mouse Locked');
    this.addOutput('locked', new ClassicPreset.Output(numSocket, 'Locked'));
  }
}

registerNode('Is Mouse Locked', 'Camera Control', () => new GetMouseLockStatusNode());
