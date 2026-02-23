import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

/**
 * Integer literal node — outputs a whole number.
 * Internally stored as a JS number but always rounded to an integer
 * via Math.round() in codegen.
 */
export class IntegerNode extends ClassicPreset.Node {
  constructor(initial: number = 0) {
    super('Integer');
    this.addControl('value', new ClassicPreset.InputControl('number', { initial: Math.round(initial) }));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Value'));
  }
}

registerNode('Integer', 'Values', () => new IntegerNode(0));
