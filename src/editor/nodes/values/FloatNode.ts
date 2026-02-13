import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class FloatNode extends ClassicPreset.Node {
  constructor(initial: number = 0) {
    super('Float');
    this.addControl('value', new ClassicPreset.InputControl('number', { initial }));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Value'));
  }
}

registerNode('Float', 'Values', () => new FloatNode(0));
