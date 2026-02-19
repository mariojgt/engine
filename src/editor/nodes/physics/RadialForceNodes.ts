import { ClassicPreset } from 'rete';
import { execSocket, numSocket, strSocket, registerNode } from '../sockets';

// ============================================================
//  Add Radial Force — applies a force radiating from a point
// ============================================================
export class AddRadialForceNode extends ClassicPreset.Node {
  constructor() {
    super('Add Radial Force');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('ox', new ClassicPreset.Input(numSocket, 'Origin X'));
    this.addInput('oy', new ClassicPreset.Input(numSocket, 'Origin Y'));
    this.addInput('oz', new ClassicPreset.Input(numSocket, 'Origin Z'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addInput('strength', new ClassicPreset.Input(numSocket, 'Strength'));
    this.addInput('falloff', new ClassicPreset.Input(strSocket, 'Falloff'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Add Radial Force', 'Physics', () => new AddRadialForceNode());

// ============================================================
//  Add Radial Impulse — applies an impulse radiating from a point
// ============================================================
export class AddRadialImpulseNode extends ClassicPreset.Node {
  constructor() {
    super('Add Radial Impulse');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('ox', new ClassicPreset.Input(numSocket, 'Origin X'));
    this.addInput('oy', new ClassicPreset.Input(numSocket, 'Origin Y'));
    this.addInput('oz', new ClassicPreset.Input(numSocket, 'Origin Z'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addInput('strength', new ClassicPreset.Input(numSocket, 'Strength'));
    this.addInput('falloff', new ClassicPreset.Input(strSocket, 'Falloff'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Add Radial Impulse', 'Physics', () => new AddRadialImpulseNode());
