import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

/**
 * For Loop with Break — same as For Loop but with a Break input
 * that exits the loop early.
 */
export class ForLoopWithBreakNode extends ClassicPreset.Node {
  constructor() {
    super('For Loop with Break');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('firstIndex', new ClassicPreset.Input(numSocket, 'First Index'));
    this.addInput('lastIndex', new ClassicPreset.Input(numSocket, 'Last Index'));
    this.addInput('break', new ClassicPreset.Input(execSocket, 'Break'));
    this.addOutput('body', new ClassicPreset.Output(execSocket, 'Loop Body'));
    this.addOutput('index', new ClassicPreset.Output(numSocket, 'Index'));
    this.addOutput('completed', new ClassicPreset.Output(execSocket, 'Completed'));
  }
}

registerNode('For Loop with Break', 'Flow Control', () => new ForLoopWithBreakNode());
