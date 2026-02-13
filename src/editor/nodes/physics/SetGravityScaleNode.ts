import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class SetGravityScaleNode extends ClassicPreset.Node {
  constructor() {
    super('Set Gravity Scale');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('scale', new ClassicPreset.Input(numSocket, 'Scale'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Gravity Scale', 'Physics', () => new SetGravityScaleNode());
