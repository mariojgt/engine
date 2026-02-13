import { ClassicPreset } from 'rete';
import { numSocket, boolSocket, registerNode } from '../sockets';

export class GreaterThanNode extends ClassicPreset.Node {
  constructor() {
    super('Greater Than');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}

registerNode('Greater Than', 'Math', () => new GreaterThanNode());
