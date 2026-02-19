import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

/**
 * Do N — fires the output exec N times, then blocks.
 * Calling Reset resets the counter so it can fire N more times.
 */
export class DoNNode extends ClassicPreset.Node {
  constructor() {
    super('Do N');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('n', new ClassicPreset.Input(numSocket, 'N'));
    this.addInput('reset', new ClassicPreset.Input(execSocket, 'Reset'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('counter', new ClassicPreset.Output(numSocket, 'Counter'));
  }
}

registerNode('Do N', 'Flow Control', () => new DoNNode());
