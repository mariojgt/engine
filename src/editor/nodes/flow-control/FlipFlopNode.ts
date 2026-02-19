import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

/**
 * Flip Flop — alternates between A and B outputs on each call.
 * First call → A, second call → B, third → A, etc.
 * Also outputs "Is A" boolean.
 */
export class FlipFlopNode extends ClassicPreset.Node {
  constructor() {
    super('Flip Flop');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('a', new ClassicPreset.Output(execSocket, 'A'));
    this.addOutput('b', new ClassicPreset.Output(execSocket, 'B'));
    this.addOutput('isA', new ClassicPreset.Output(boolSocket, 'Is A'));
  }
}

registerNode('Flip Flop', 'Flow Control', () => new FlipFlopNode());
