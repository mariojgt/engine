import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

export class BranchNode extends ClassicPreset.Node {
  constructor() {
    super('Branch');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('condition', new ClassicPreset.Input(boolSocket, 'Condition'));
    this.addOutput('true', new ClassicPreset.Output(execSocket, 'True'));
    this.addOutput('false', new ClassicPreset.Output(execSocket, 'False'));
  }
}

registerNode('Branch', 'Flow Control', () => new BranchNode());
