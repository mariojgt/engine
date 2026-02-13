import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class LerpNode extends ClassicPreset.Node {
  constructor() {
    super('Lerp');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addInput('alpha', new ClassicPreset.Input(numSocket, 'Alpha'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Lerp', 'Math', () => new LerpNode());
