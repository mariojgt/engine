import { ClassicPreset } from 'rete';
import { execSocket, registerNode } from '../sockets';

/**
 * Do Once — fires the output exec exactly once.
 * Subsequent calls are ignored until the Reset input is fired.
 * Like UE's DoOnce node.
 */
export class DoOnceNode extends ClassicPreset.Node {
  constructor() {
    super('Do Once');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('reset', new ClassicPreset.Input(execSocket, 'Reset'));
    this.addOutput('completed', new ClassicPreset.Output(execSocket, 'Completed'));
  }
}

registerNode('Do Once', 'Flow Control', () => new DoOnceNode());
