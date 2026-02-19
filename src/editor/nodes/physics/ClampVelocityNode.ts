import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class ClampVelocityNode extends ClassicPreset.Node {
  constructor() {
    super('Clamp Velocity');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('maxSpeed', new ClassicPreset.Input(numSocket, 'Max Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Clamp Velocity', 'Physics', () => new ClampVelocityNode());
