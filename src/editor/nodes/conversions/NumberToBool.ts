import { ClassicPreset } from 'rete';
import { numSocket, boolSocket, registerNode, registerConversion } from '../sockets';

export class NumberToBoolNode extends ClassicPreset.Node {
  constructor() {
    super('Number → Bool');
    this.addInput('in', new ClassicPreset.Input(numSocket, 'Number'));
    this.addOutput('out', new ClassicPreset.Output(boolSocket, 'Bool'));
  }
}

registerNode('Number → Bool', 'Conversions', () => new NumberToBoolNode());
registerConversion('Number', 'Boolean', () => new NumberToBoolNode());
