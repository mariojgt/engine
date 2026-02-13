import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class Vector3LiteralNode extends ClassicPreset.Node {
  constructor(x: number = 0, y: number = 0, z: number = 0) {
    super('Vector3 Literal');
    this.addControl('x', new ClassicPreset.InputControl('number', { initial: x }));
    this.addControl('y', new ClassicPreset.InputControl('number', { initial: y }));
    this.addControl('z', new ClassicPreset.InputControl('number', { initial: z }));
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

registerNode('Vector3 Literal', 'Values', () => new Vector3LiteralNode());
