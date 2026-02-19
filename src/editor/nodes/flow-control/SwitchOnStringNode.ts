import { ClassicPreset } from 'rete';
import { execSocket, strSocket, registerNode } from '../sockets';

/**
 * Switch on String — routes execution based on a string value.
 * Has 3 default case pins + Default.
 * Case values are editable inline.
 */
export class SwitchOnStringNode extends ClassicPreset.Node {
  public caseValues: string[] = ['Case 0', 'Case 1', 'Case 2'];

  constructor() {
    super('Switch on String');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('selection', new ClassicPreset.Input(strSocket, 'Selection'));
    this.addOutput('case0', new ClassicPreset.Output(execSocket, 'Case 0'));
    this.addOutput('case1', new ClassicPreset.Output(execSocket, 'Case 1'));
    this.addOutput('case2', new ClassicPreset.Output(execSocket, 'Case 2'));
    this.addOutput('default', new ClassicPreset.Output(execSocket, 'Default'));
  }
}

registerNode('Switch on String', 'Flow Control', () => new SwitchOnStringNode());
