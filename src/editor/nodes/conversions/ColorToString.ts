import { ClassicPreset } from 'rete';
import { colorSocket, strSocket, registerNode, registerConversion } from '../sockets';

export class ColorToStringNode extends ClassicPreset.Node {
  constructor() {
    super('Color → String');
    this.addInput('in', new ClassicPreset.Input(colorSocket, 'Color'));
    this.addOutput('out', new ClassicPreset.Output(strSocket, 'String'));
  }
}

registerNode('Color → String', 'Conversions', () => new ColorToStringNode());
registerConversion('Color', 'String', () => new ColorToStringNode());
