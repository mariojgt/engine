import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class SineNode extends ClassicPreset.Node {
  constructor() {
    super('Sine');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Input'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Sine', 'Math', () => new SineNode());
