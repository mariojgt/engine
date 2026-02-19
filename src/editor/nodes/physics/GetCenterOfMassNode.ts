import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetCenterOfMassNode extends ClassicPreset.Node {
  constructor() {
    super('Get Center of Mass');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

registerNode('Get Center of Mass', 'Physics', () => new GetCenterOfMassNode());
