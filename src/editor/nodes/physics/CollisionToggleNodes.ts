import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

// ============================================================
//  Set Collision Enabled — enables/disables collision response
// ============================================================
export class SetCollisionEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Set Collision Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Collision Enabled', 'Physics', () => new SetCollisionEnabledNode());

// ============================================================
//  Set CCD Enabled — continuous collision detection toggle
// ============================================================
export class SetCCDEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Set CCD Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set CCD Enabled', 'Physics', () => new SetCCDEnabledNode());
