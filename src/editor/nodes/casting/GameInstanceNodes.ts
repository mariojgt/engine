import { ClassicPreset } from 'rete';
import { objectSocket, execSocket, strSocket, registerNode } from '../sockets';

// ── Get Game Instance Node ──────────────────────────────────
// Returns the persistent Game Instance object so other nodes can
// read/write its variables. The Game Instance survives scene loads.
export class GetGameInstanceNode extends ClassicPreset.Node {
  constructor() {
    super('Get Game Instance');
    this.addOutput('instance', new ClassicPreset.Output(objectSocket, 'Instance'));
  }
}

registerNode('Get Game Instance', 'Casting', () => new GetGameInstanceNode());

// ── Get Game Instance Variable Node ─────────────────────────
// Reads a variable from the Game Instance by name.
export class GameInstanceVarNameControl extends ClassicPreset.Control {
  public value: string;
  constructor(initial = '') {
    super();
    this.value = initial;
  }
  setValue(v: string) {
    this.value = v;
  }
}

export class GetGameInstanceVariableNode extends ClassicPreset.Node {
  constructor() {
    super('Get Game Instance Variable');
    this.addControl('varName', new GameInstanceVarNameControl(''));
    this.addOutput('value', new ClassicPreset.Output(strSocket, 'Value'));
  }
}

registerNode('Get Game Instance Variable', 'Casting', () => new GetGameInstanceVariableNode());

// ── Set Game Instance Variable Node ─────────────────────────
// Writes a variable on the Game Instance by name.
export class SetGameInstanceVariableNode extends ClassicPreset.Node {
  constructor() {
    super('Set Game Instance Variable');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addControl('varName', new GameInstanceVarNameControl(''));
    this.addInput('value', new ClassicPreset.Input(strSocket, 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Game Instance Variable', 'Casting', () => new SetGameInstanceVariableNode());
