import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class MathDivideNode extends ClassicPreset.Node {
  constructor() {
    super('Divide');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Divide', 'Math', () => new MathDivideNode());
