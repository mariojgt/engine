import { ClassicPreset } from 'rete';
import { execSocket, strSocket, registerNode } from '../sockets';

export class SetBodyTypeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Body Type');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('type', new ClassicPreset.Input(strSocket, 'Type'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Body Type', 'Physics', () => new SetBodyTypeNode());
