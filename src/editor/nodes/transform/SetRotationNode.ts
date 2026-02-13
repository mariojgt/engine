import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class SetRotationNode extends ClassicPreset.Node {
  constructor() {
    super('Set Actor Rotation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'Pitch'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Yaw'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Roll'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Actor Rotation', 'Transform', () => new SetRotationNode());
