import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

export class SetConstraintNode extends ClassicPreset.Node {
  constructor() {
    super('Set Physics Constraints');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('lockPosX', new ClassicPreset.Input(boolSocket, 'Lock Pos X'));
    this.addInput('lockPosY', new ClassicPreset.Input(boolSocket, 'Lock Pos Y'));
    this.addInput('lockPosZ', new ClassicPreset.Input(boolSocket, 'Lock Pos Z'));
    this.addInput('lockRotX', new ClassicPreset.Input(boolSocket, 'Lock Rot X'));
    this.addInput('lockRotY', new ClassicPreset.Input(boolSocket, 'Lock Rot Y'));
    this.addInput('lockRotZ', new ClassicPreset.Input(boolSocket, 'Lock Rot Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Physics Constraints', 'Physics', () => new SetConstraintNode());
