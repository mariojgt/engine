import { ClassicPreset } from 'rete';
import { execSocket } from '../sockets';
import { registerNode } from '../sockets';

export class EventBeginPlayNode extends ClassicPreset.Node {
  constructor() {
    super('Event BeginPlay');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Event BeginPlay', 'Events', () => new EventBeginPlayNode());
