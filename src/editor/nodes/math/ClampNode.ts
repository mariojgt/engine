import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class ClampNode extends ClassicPreset.Node {
  constructor() {
    super('Clamp');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addInput('min', new ClassicPreset.Input(numSocket, 'Min'));
    this.addInput('max', new ClassicPreset.Input(numSocket, 'Max'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Clamp', 'Math', () => new ClampNode());
