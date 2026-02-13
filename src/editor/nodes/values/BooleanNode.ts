import { ClassicPreset } from 'rete';
import { boolSocket, registerNode } from '../sockets';

export class BooleanNode extends ClassicPreset.Node {
  constructor() {
    super('Boolean');
    this.addControl('value', new ClassicPreset.InputControl('number', { initial: 0 }));
    this.addOutput('out', new ClassicPreset.Output(boolSocket, 'Value'));
  }
}

registerNode('Boolean', 'Values', () => new BooleanNode());
