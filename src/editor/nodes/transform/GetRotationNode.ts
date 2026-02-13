import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetRotationNode extends ClassicPreset.Node {
  constructor() {
    super('Get Actor Rotation');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'Pitch'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Yaw'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Roll'));
  }
}

registerNode('Get Actor Rotation', 'Transform', () => new GetRotationNode());
