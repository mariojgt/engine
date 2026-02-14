import { ClassicPreset } from 'rete';
import { strSocket, boolSocket, registerNode, registerConversion } from '../sockets';

export class StringToBoolNode extends ClassicPreset.Node {
  constructor() {
    super('String → Bool');
    this.addInput('in', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('out', new ClassicPreset.Output(boolSocket, 'Bool'));
  }
}

registerNode('String → Bool', 'Conversions', () => new StringToBoolNode());
registerConversion('String', 'Boolean', () => new StringToBoolNode());
