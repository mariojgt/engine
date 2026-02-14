import { ClassicPreset } from 'rete';
import { strSocket, colorSocket, registerNode, registerConversion } from '../sockets';

export class StringToColorNode extends ClassicPreset.Node {
  constructor() {
    super('String → Color');
    this.addInput('in', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('out', new ClassicPreset.Output(colorSocket, 'Color'));
  }
}

registerNode('String → Color', 'Conversions', () => new StringToColorNode());
registerConversion('String', 'Color', () => new StringToColorNode());
