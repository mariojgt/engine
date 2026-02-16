// ============================================================
//  Player Controller Nodes — UE-style player controller nodes
//  These provide cursor control and input mode management
//  for player controllers in gameplay.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, registerNode } from '../sockets';

// ---- Get Player Controller ----

export class GetPlayerControllerNode extends ClassicPreset.Node {
  constructor() {
    super('Get Player Controller');
    this.addInput('playerIndex', new ClassicPreset.Input(numSocket, 'Player Index', true));
    this.addControl('playerIndex', new ClassicPreset.InputControl('number', { initial: 0, readonly: false }));
    this.addOutput('controller', new ClassicPreset.Output(numSocket, 'Controller')); // Returns player controller reference
  }
}

registerNode('Get Player Controller', 'Player Controller', () => new GetPlayerControllerNode());

// ---- Set Show Mouse Cursor ----

export class SetShowMouseCursorNode extends ClassicPreset.Node {
  constructor() {
    super('Set Show Mouse Cursor');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('show', new ClassicPreset.Input(boolSocket, 'Show'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Show Mouse Cursor', 'Player Controller', () => new SetShowMouseCursorNode());

// ---- Get Mouse Cursor Visible ----

export class IsMouseCursorVisibleNode extends ClassicPreset.Node {
  constructor() {
    super('Is Mouse Cursor Visible');
    this.addOutput('visible', new ClassicPreset.Output(boolSocket, 'Visible'));
  }
}

registerNode('Is Mouse Cursor Visible', 'Player Controller', () => new IsMouseCursorVisibleNode());

// ---- Set Input Mode Game Only ----

export class SetInputModeGameOnlyNode extends ClassicPreset.Node {
  constructor() {
    super('Set Input Mode Game Only');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Input Mode Game Only', 'Player Controller', () => new SetInputModeGameOnlyNode());

// ---- Set Input Mode Game And UI ----

export class SetInputModeGameAndUINode extends ClassicPreset.Node {
  constructor() {
    super('Set Input Mode Game And UI');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Input Mode Game And UI', 'Player Controller', () => new SetInputModeGameAndUINode());

// ---- Set Input Mode UI Only ----

export class SetInputModeUIOnlyNode extends ClassicPreset.Node {
  constructor() {
    super('Set Input Mode UI Only');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Input Mode UI Only', 'Player Controller', () => new SetInputModeUIOnlyNode());
