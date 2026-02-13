import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetPhysicsMaterialNode extends ClassicPreset.Node {
  constructor() {
    super('Get Physics Material');
    this.addOutput('friction', new ClassicPreset.Output(numSocket, 'Friction'));
    this.addOutput('restitution', new ClassicPreset.Output(numSocket, 'Restitution'));
  }
}

registerNode('Get Physics Material', 'Physics', () => new GetPhysicsMaterialNode());
