import { ClassicPreset } from 'rete';
import { strSocket, registerNode } from '../sockets';

export class GetBodyTypeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Body Type');
    this.addOutput('type', new ClassicPreset.Output(strSocket, 'Type'));
  }
}

registerNode('Get Body Type', 'Physics', () => new GetBodyTypeNode());
