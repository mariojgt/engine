import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class DeltaTimeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Delta Time');
    this.addOutput('dt', new ClassicPreset.Output(numSocket, 'Delta'));
  }
}

registerNode('Get Delta Time', 'Values', () => new DeltaTimeNode());
