import { ClassicPreset } from 'rete';
import { colorSocket, registerNode } from '../sockets';

/**
 * Custom control that stores a hex colour string (e.g. "#ff0000").
 * Rendered as a colour picker by the React preset customisation.
 */
export class ColorPickerControl extends ClassicPreset.Control {
  public value: string;

  constructor(initial: string = '#ffffff') {
    super();
    this.value = initial;
  }

  setValue(v: string) {
    this.value = v;
  }
}

export class ColorNode extends ClassicPreset.Node {
  constructor(initial: string = '#ffffff') {
    super('Color Literal');
    this.addControl('value', new ColorPickerControl(initial));
    this.addOutput('out', new ClassicPreset.Output(colorSocket, 'Color'));
  }
}

registerNode('Color Literal', 'Values', () => new ColorNode());
