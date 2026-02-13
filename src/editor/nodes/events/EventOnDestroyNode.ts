import { ClassicPreset } from 'rete';
import { execSocket, registerNode } from '../sockets';

export class EventOnDestroyNode extends ClassicPreset.Node {
  constructor() {
    super('Event OnDestroy');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Event OnDestroy', 'Events', () => new EventOnDestroyNode());
