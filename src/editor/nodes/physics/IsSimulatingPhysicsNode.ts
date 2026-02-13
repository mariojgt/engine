import { ClassicPreset } from 'rete';
import { boolSocket, registerNode } from '../sockets';

export class IsSimulatingPhysicsNode extends ClassicPreset.Node {
  constructor() {
    super('Is Simulating Physics');
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}

registerNode('Is Simulating Physics', 'Physics', () => new IsSimulatingPhysicsNode());
