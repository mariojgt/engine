import { ClassicPreset } from 'rete';
import { boolSocket, numSocket, registerNode, registerConversion } from '../sockets';

export class BoolToNumberNode extends ClassicPreset.Node {
  constructor() {
    super('Bool → Number');
    this.addInput('in', new ClassicPreset.Input(boolSocket, 'Bool'));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Number'));
  }
}

registerNode('Bool → Number', 'Conversions', () => new BoolToNumberNode());
registerConversion('Boolean', 'Number', () => new BoolToNumberNode());
