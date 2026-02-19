import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class GetSpeedNode extends ClassicPreset.Node {
  constructor() {
    super('Get Speed');
    this.addOutput('speed', new ClassicPreset.Output(numSocket, 'Speed'));
  }
}

registerNode('Get Speed', 'Physics', () => new GetSpeedNode());
