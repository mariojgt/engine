import { ClassicPreset } from 'rete';
import { numSocket, strSocket, registerNode } from '../sockets';

export class NumberToStringNode extends ClassicPreset.Node {
  constructor() {
    super('Number → String');
    this.addInput('in', new ClassicPreset.Input(numSocket, 'Number'));
    this.addOutput('out', new ClassicPreset.Output(strSocket, 'String'));
  }
}

registerNode('Number → String', 'Conversions', () => new NumberToStringNode());
