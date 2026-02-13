import { ClassicPreset } from 'rete';
import { boolSocket, registerNode } from '../sockets';

export class IsGravityEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Is Gravity Enabled');
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}

registerNode('Is Gravity Enabled', 'Physics', () => new IsGravityEnabledNode());
