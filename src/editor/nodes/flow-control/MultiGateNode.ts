import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, registerNode } from '../sockets';

/**
 * Multi Gate — routes execution to one of N outputs in sequence or random.
 * Starts with 3 outputs (Out 0, Out 1, Out 2).
 * Has Loop and Random bool inputs.
 */
export class MultiGateNode extends ClassicPreset.Node {
  constructor() {
    super('Multi Gate');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('reset', new ClassicPreset.Input(execSocket, 'Reset'));
    this.addInput('isRandom', new ClassicPreset.Input(boolSocket, 'Is Random'));
    this.addInput('loop', new ClassicPreset.Input(boolSocket, 'Loop'));
    this.addInput('startIndex', new ClassicPreset.Input(numSocket, 'Start Index'));
    this.addOutput('out0', new ClassicPreset.Output(execSocket, 'Out 0'));
    this.addOutput('out1', new ClassicPreset.Output(execSocket, 'Out 1'));
    this.addOutput('out2', new ClassicPreset.Output(execSocket, 'Out 2'));
  }
}

registerNode('Multi Gate', 'Flow Control', () => new MultiGateNode());
