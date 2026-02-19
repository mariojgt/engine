import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, registerNode } from '../sockets';

export class SetPhysicsTransformNode extends ClassicPreset.Node {
  constructor() {
    super('Set Physics Transform');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('px', new ClassicPreset.Input(numSocket, 'Pos X'));
    this.addInput('py', new ClassicPreset.Input(numSocket, 'Pos Y'));
    this.addInput('pz', new ClassicPreset.Input(numSocket, 'Pos Z'));
    this.addInput('rx', new ClassicPreset.Input(numSocket, 'Rot X'));
    this.addInput('ry', new ClassicPreset.Input(numSocket, 'Rot Y'));
    this.addInput('rz', new ClassicPreset.Input(numSocket, 'Rot Z'));
    this.addInput('teleport', new ClassicPreset.Input(boolSocket, 'Teleport'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Physics Transform', 'Physics', () => new SetPhysicsTransformNode());
