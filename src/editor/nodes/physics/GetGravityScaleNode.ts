import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetGravityScaleNode extends ClassicPreset.Node {
  constructor() {
    super('Get Gravity Scale');
    this.addOutput('scale', new ClassicPreset.Output(numSocket, 'Scale'));
  }
}

registerNode('Get Gravity Scale', 'Physics', () => new GetGravityScaleNode());
