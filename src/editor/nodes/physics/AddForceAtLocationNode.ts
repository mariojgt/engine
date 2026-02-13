import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class AddForceAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Add Force at Location');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('fx', new ClassicPreset.Input(numSocket, 'Force X'));
    this.addInput('fy', new ClassicPreset.Input(numSocket, 'Force Y'));
    this.addInput('fz', new ClassicPreset.Input(numSocket, 'Force Z'));
    this.addInput('px', new ClassicPreset.Input(numSocket, 'Point X'));
    this.addInput('py', new ClassicPreset.Input(numSocket, 'Point Y'));
    this.addInput('pz', new ClassicPreset.Input(numSocket, 'Point Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Add Force at Location', 'Physics', () => new AddForceAtLocationNode());
