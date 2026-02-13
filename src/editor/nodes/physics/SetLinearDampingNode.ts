import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class SetLinearDampingNode extends ClassicPreset.Node {
  constructor() {
    super('Set Linear Damping');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('damping', new ClassicPreset.Input(numSocket, 'Damping'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Linear Damping', 'Physics', () => new SetLinearDampingNode());
