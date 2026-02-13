import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

// ============================================================
//  On Component Hit — fires when a physics collision occurs.
//  Outputs the normal and impulse of the hit.
// ============================================================
export class OnComponentHitNode extends ClassicPreset.Node {
  constructor() {
    super('On Component Hit');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('normalX', new ClassicPreset.Output(numSocket, 'Normal X'));
    this.addOutput('normalY', new ClassicPreset.Output(numSocket, 'Normal Y'));
    this.addOutput('normalZ', new ClassicPreset.Output(numSocket, 'Normal Z'));
    this.addOutput('impulse', new ClassicPreset.Output(numSocket, 'Impulse'));
  }
}

registerNode('On Component Hit', 'Physics Events', () => new OnComponentHitNode());

// ============================================================
//  On Component Begin Overlap — fires when overlap starts
// ============================================================
export class OnComponentBeginOverlapNode extends ClassicPreset.Node {
  constructor() {
    super('On Component Begin Overlap');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('On Component Begin Overlap', 'Physics Events', () => new OnComponentBeginOverlapNode());

// ============================================================
//  On Component End Overlap — fires when overlap ends
// ============================================================
export class OnComponentEndOverlapNode extends ClassicPreset.Node {
  constructor() {
    super('On Component End Overlap');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('On Component End Overlap', 'Physics Events', () => new OnComponentEndOverlapNode());

// ============================================================
//  On Component Wake — fires when physics body wakes up
// ============================================================
export class OnComponentWakeNode extends ClassicPreset.Node {
  constructor() {
    super('On Component Wake');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('On Component Wake', 'Physics Events', () => new OnComponentWakeNode());

// ============================================================
//  On Component Sleep — fires when physics body goes to sleep
// ============================================================
export class OnComponentSleepNode extends ClassicPreset.Node {
  constructor() {
    super('On Component Sleep');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('On Component Sleep', 'Physics Events', () => new OnComponentSleepNode());
