import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

/**
 * While Loop — executes the loop body while Condition is true.
 * When condition becomes false, fires Completed.
 */
export class WhileLoopNode extends ClassicPreset.Node {
  constructor() {
    super('While Loop');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('condition', new ClassicPreset.Input(boolSocket, 'Condition'));
    this.addOutput('body', new ClassicPreset.Output(execSocket, 'Loop Body'));
    this.addOutput('completed', new ClassicPreset.Output(execSocket, 'Completed'));
  }
}

registerNode('While Loop', 'Flow Control', () => new WhileLoopNode());
