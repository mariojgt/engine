import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class MathSubtractNode extends ClassicPreset.Node {
  constructor() {
    super('Subtract');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Subtract', 'Math', () => new MathSubtractNode());
