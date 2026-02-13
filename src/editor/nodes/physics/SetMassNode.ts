import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class SetMassNode extends ClassicPreset.Node {
  constructor() {
    super('Set Mass');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('mass', new ClassicPreset.Input(numSocket, 'Mass'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Mass', 'Physics', () => new SetMassNode());
