import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

// ============================================================
//  Delay Node — latent node that pauses execution flow.
//  Like UE's Delay node: fires the "Completed" exec output
//  after the specified Duration (in seconds).
//  Non-blocking — does not freeze the game loop.
// ============================================================
export class DelayNode extends ClassicPreset.Node {
  constructor() {
    super('Delay');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('duration', new ClassicPreset.Input(numSocket, 'Duration'));
    this.addOutput('completed', new ClassicPreset.Output(execSocket, 'Completed'));
  }
}

registerNode('Delay', 'Flow Control', () => new DelayNode());
