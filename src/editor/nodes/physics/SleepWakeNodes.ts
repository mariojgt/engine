import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

// ============================================================
//  Wake Physics Body
// ============================================================
export class WakeBodyNode extends ClassicPreset.Node {
  constructor() {
    super('Wake Physics Body');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Wake Physics Body', 'Physics', () => new WakeBodyNode());

// ============================================================
//  Sleep Physics Body
// ============================================================
export class SleepBodyNode extends ClassicPreset.Node {
  constructor() {
    super('Sleep Physics Body');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Sleep Physics Body', 'Physics', () => new SleepBodyNode());

// ============================================================
//  Is Body Sleeping — pure getter
// ============================================================
export class IsBodySleepingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Body Sleeping');
    this.addOutput('sleeping', new ClassicPreset.Output(boolSocket, 'Sleeping'));
  }
}

registerNode('Is Body Sleeping', 'Physics', () => new IsBodySleepingNode());
