import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetWorldGravityNode extends ClassicPreset.Node {
  constructor() {
    super('Get World Gravity');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

registerNode('Get World Gravity', 'Physics', () => new GetWorldGravityNode());
