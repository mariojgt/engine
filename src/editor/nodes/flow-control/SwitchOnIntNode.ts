import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

/**
 * Switch on Int — routes execution to one of several outputs
 * based on an integer selection value.
 * Default outputs: 0, 1, 2 + Default.
 */
export class SwitchOnIntNode extends ClassicPreset.Node {
  constructor() {
    super('Switch on Int');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('selection', new ClassicPreset.Input(numSocket, 'Selection'));
    this.addOutput('case0', new ClassicPreset.Output(execSocket, '0'));
    this.addOutput('case1', new ClassicPreset.Output(execSocket, '1'));
    this.addOutput('case2', new ClassicPreset.Output(execSocket, '2'));
    this.addOutput('default', new ClassicPreset.Output(execSocket, 'Default'));
  }
}

registerNode('Switch on Int', 'Flow Control', () => new SwitchOnIntNode());
