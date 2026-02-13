import { ClassicPreset } from 'rete';
import { boolSocket, registerNode } from '../sockets';

/**
 * Custom control that stores a boolean as 0 | 1.
 * Rendered as a True / False dropdown by the React preset customisation.
 */
export class BoolSelectControl extends ClassicPreset.Control {
  public value: number;

  constructor(initial: number = 0) {
    super();
    this.value = initial ? 1 : 0;
  }

  setValue(v: number) {
    this.value = v ? 1 : 0;
  }
}

export class BooleanNode extends ClassicPreset.Node {
  constructor() {
    super('Boolean');
    this.addControl('value', new BoolSelectControl(0));
    this.addOutput('out', new ClassicPreset.Output(boolSocket, 'Value'));
  }
}

registerNode('Boolean', 'Values', () => new BooleanNode());
