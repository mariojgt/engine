import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class SetWorldGravityNode extends ClassicPreset.Node {
  constructor() {
    super('Set World Gravity');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set World Gravity', 'Physics', () => new SetWorldGravityNode());
