import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

export class SetGravityEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Set Gravity Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Gravity Enabled', 'Physics', () => new SetGravityEnabledNode());
