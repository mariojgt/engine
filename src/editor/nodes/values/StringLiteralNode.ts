import { ClassicPreset } from 'rete';
import { strSocket, registerNode } from '../sockets';

export class StringLiteralNode extends ClassicPreset.Node {
  constructor(initial: string = '') {
    super('String Literal');
    this.addControl('value', new ClassicPreset.InputControl('text', { initial }));
    this.addOutput('out', new ClassicPreset.Output(strSocket, 'Value'));
  }
}

registerNode('String Literal', 'Values', () => new StringLiteralNode(''));
