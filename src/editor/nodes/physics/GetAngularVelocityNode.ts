import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetAngularVelocityNode extends ClassicPreset.Node {
  constructor() {
    super('Get Angular Velocity');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

registerNode('Get Angular Velocity', 'Physics', () => new GetAngularVelocityNode());
