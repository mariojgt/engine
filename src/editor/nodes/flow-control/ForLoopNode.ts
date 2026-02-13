import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class ForLoopNode extends ClassicPreset.Node {
  constructor() {
    super('For Loop');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('count', new ClassicPreset.Input(numSocket, 'Count'));
    this.addOutput('body', new ClassicPreset.Output(execSocket, 'Loop Body'));
    this.addOutput('index', new ClassicPreset.Output(numSocket, 'Index'));
    this.addOutput('done', new ClassicPreset.Output(execSocket, 'Completed'));
  }
}

registerNode('For Loop', 'Flow Control', () => new ForLoopNode());
