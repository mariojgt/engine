import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

export class SetSimulatePhysicsNode extends ClassicPreset.Node {
  constructor() {
    super('Set Simulate Physics');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Simulate Physics', 'Physics', () => new SetSimulatePhysicsNode());
