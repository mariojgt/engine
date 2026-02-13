import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class AbsNode extends ClassicPreset.Node {
  constructor() {
    super('Abs');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Input'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Abs', 'Math', () => new AbsNode());
