import { ClassicPreset } from 'rete';
import { numSocket, registerNode } from '../sockets';

export class TimeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Time');
    this.addOutput('time', new ClassicPreset.Output(numSocket, 'Seconds'));
  }
}

registerNode('Get Time', 'Values', () => new TimeNode());
