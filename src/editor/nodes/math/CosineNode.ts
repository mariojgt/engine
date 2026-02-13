import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class CosineNode extends ClassicPreset.Node {
  constructor() {
    super('Cosine');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Input'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Cosine', 'Math', () => new CosineNode());
