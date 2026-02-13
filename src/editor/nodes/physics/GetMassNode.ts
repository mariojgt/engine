import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetMassNode extends ClassicPreset.Node {
  constructor() {
    super('Get Mass');
    this.addOutput('mass', new ClassicPreset.Output(numSocket, 'Mass'));
  }
}

registerNode('Get Mass', 'Physics', () => new GetMassNode());
