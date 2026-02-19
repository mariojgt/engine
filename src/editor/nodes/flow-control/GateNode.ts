import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

/**
 * Gate — controls flow of execution.
 * When open, Enter → Exit passes through.
 * When closed, Enter is blocked.
 * Open/Close/Toggle control the gate state.
 */
export class GateNode extends ClassicPreset.Node {
  constructor() {
    super('Gate');
    this.addInput('enter', new ClassicPreset.Input(execSocket, 'Enter'));
    this.addInput('open', new ClassicPreset.Input(execSocket, 'Open'));
    this.addInput('close', new ClassicPreset.Input(execSocket, 'Close'));
    this.addInput('toggle', new ClassicPreset.Input(execSocket, 'Toggle'));
    this.addInput('startClosed', new ClassicPreset.Input(boolSocket, 'Start Closed'));
    this.addOutput('exit', new ClassicPreset.Output(execSocket, 'Exit'));
  }
}

registerNode('Gate', 'Flow Control', () => new GateNode());
