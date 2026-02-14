import { ClassicPreset } from 'rete';
import { boolSocket, strSocket, registerNode, registerConversion } from '../sockets';

export class BoolToStringNode extends ClassicPreset.Node {
  constructor() {
    super('Bool → String');
    this.addInput('in', new ClassicPreset.Input(boolSocket, 'Bool'));
    this.addOutput('out', new ClassicPreset.Output(strSocket, 'String'));
  }
}

registerNode('Bool → String', 'Conversions', () => new BoolToStringNode());
registerConversion('Boolean', 'String', () => new BoolToStringNode());
