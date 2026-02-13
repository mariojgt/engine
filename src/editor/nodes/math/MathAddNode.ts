import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class MathAddNode extends ClassicPreset.Node {
  constructor() {
    super('Add');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}

registerNode('Add', 'Math', () => new MathAddNode());
