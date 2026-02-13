import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class AddImpulseAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Add Impulse at Location');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('fx', new ClassicPreset.Input(numSocket, 'Impulse X'));
    this.addInput('fy', new ClassicPreset.Input(numSocket, 'Impulse Y'));
    this.addInput('fz', new ClassicPreset.Input(numSocket, 'Impulse Z'));
    this.addInput('px', new ClassicPreset.Input(numSocket, 'Point X'));
    this.addInput('py', new ClassicPreset.Input(numSocket, 'Point Y'));
    this.addInput('pz', new ClassicPreset.Input(numSocket, 'Point Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Add Impulse at Location', 'Physics', () => new AddImpulseAtLocationNode());
