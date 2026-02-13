import { ClassicPreset } from 'rete';
import { strSocket, numSocket, registerNode } from '../sockets';

export class StringToNumberNode extends ClassicPreset.Node {
  constructor() {
    super('String → Number');
    this.addInput('in', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Number'));
  }
}

registerNode('String → Number', 'Conversions', () => new StringToNumberNode());
