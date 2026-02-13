import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class PrintStringNode extends ClassicPreset.Node {
  constructor() {
    super('Print String');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addControl('text', new ClassicPreset.InputControl('text', { initial: 'Hello' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Print String', 'Utility', () => new PrintStringNode());
