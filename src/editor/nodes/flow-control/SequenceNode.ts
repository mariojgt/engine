import { ClassicPreset } from 'rete';
import { execSocket, registerNode } from '../sockets';

export class SequenceNode extends ClassicPreset.Node {
  constructor() {
    super('Sequence');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('then0', new ClassicPreset.Output(execSocket, 'Then 0'));
    this.addOutput('then1', new ClassicPreset.Output(execSocket, 'Then 1'));
  }
}

registerNode('Sequence', 'Flow Control', () => new SequenceNode());
