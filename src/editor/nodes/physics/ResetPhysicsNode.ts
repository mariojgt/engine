import { ClassicPreset } from 'rete';
import { execSocket, registerNode } from '../sockets';

export class ResetPhysicsNode extends ClassicPreset.Node {
  constructor() {
    super('Reset Physics');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Reset Physics', 'Physics', () => new ResetPhysicsNode());
