import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class SetPhysicsMaterialNode extends ClassicPreset.Node {
  constructor() {
    super('Set Physics Material');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('friction', new ClassicPreset.Input(numSocket, 'Friction'));
    this.addInput('restitution', new ClassicPreset.Input(numSocket, 'Restitution'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Physics Material', 'Physics', () => new SetPhysicsMaterialNode());
