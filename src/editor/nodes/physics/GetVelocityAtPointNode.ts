import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetVelocityAtPointNode extends ClassicPreset.Node {
  constructor() {
    super('Get Velocity at Point');
    this.addInput('px', new ClassicPreset.Input(numSocket, 'Point X'));
    this.addInput('py', new ClassicPreset.Input(numSocket, 'Point Y'));
    this.addInput('pz', new ClassicPreset.Input(numSocket, 'Point Z'));
    this.addOutput('vx', new ClassicPreset.Output(numSocket, 'Vel X'));
    this.addOutput('vy', new ClassicPreset.Output(numSocket, 'Vel Y'));
    this.addOutput('vz', new ClassicPreset.Output(numSocket, 'Vel Z'));
  }
}

registerNode('Get Velocity at Point', 'Physics', () => new GetVelocityAtPointNode());
