import { ClassicPreset } from 'rete';
import { registerNode, numSocket, vec3Socket } from '../sockets';
export class MakeVectorNode extends ClassicPreset.Node {
  constructor() {
    super('Make Vector');
    const inX = new ClassicPreset.Input(numSocket, 'X');
    inX.addControl(new ClassicPreset.InputControl('number', { initial: 0 }));
    this.addInput('x', inX);

    const inY = new ClassicPreset.Input(numSocket, 'Y');
    inY.addControl(new ClassicPreset.InputControl('number', { initial: 0 }));
    this.addInput('y', inY);

    const inZ = new ClassicPreset.Input(numSocket, 'Z');
    inZ.addControl(new ClassicPreset.InputControl('number', { initial: 0 }));
    this.addInput('z', inZ);

    this.addOutput('vec', new ClassicPreset.Output(vec3Socket, 'Vector'));
  }
}
registerNode('Make Vector', 'Math', () => new MakeVectorNode());
export class BreakVectorNode extends ClassicPreset.Node { constructor() { super('Break Vector'); this.addInput('vec', new ClassicPreset.Input(vec3Socket, 'Vector')); this.addOutput('x', new ClassicPreset.Output(numSocket, 'X')); this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y')); this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z')); } }
registerNode('Break Vector', 'Math', () => new BreakVectorNode());
