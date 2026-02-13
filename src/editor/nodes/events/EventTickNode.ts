import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

export class EventTickNode extends ClassicPreset.Node {
  constructor() {
    super('Event Tick');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('dt', new ClassicPreset.Output(numSocket, 'Delta Time'));
  }
}

registerNode('Event Tick', 'Events', () => new EventTickNode());
