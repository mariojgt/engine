// ============================================================
//  WorldNodes — UE5-style Player & World access nodes
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, objectSocket, registerNode } from '../sockets';

// ── Player references ───────────────────────────────────────
export class GetPlayerCharacterNode extends ClassicPreset.Node {
  constructor() {
    super('Get Player Character');
    this.addInput('playerIndex', new ClassicPreset.Input(numSocket, 'Player Index'));
    this.addOutput('character', new ClassicPreset.Output(objectSocket, 'Character'));
  }
}
registerNode('Get Player Character', 'Player', () => new GetPlayerCharacterNode());

export class GetPlayerCameraManagerNode extends ClassicPreset.Node {
  constructor() {
    super('Get Player Camera Manager');
    this.addOutput('cameraManager', new ClassicPreset.Output(objectSocket, 'Camera Manager'));
  }
}
registerNode('Get Player Camera Manager', 'Player', () => new GetPlayerCameraManagerNode());

// ── World references ────────────────────────────────────────
export class GetWorldNode extends ClassicPreset.Node {
  constructor() {
    super('Get World');
    this.addOutput('world', new ClassicPreset.Output(objectSocket, 'World'));
  }
}
registerNode('Get World', 'World', () => new GetWorldNode());

export class GetGameModeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Game Mode');
    this.addOutput('gameMode', new ClassicPreset.Output(objectSocket, 'Game Mode'));
  }
}
registerNode('Get Game Mode', 'World', () => new GetGameModeNode());

export class GetGameStateNode extends ClassicPreset.Node {
  constructor() {
    super('Get Game State');
    this.addOutput('gameState', new ClassicPreset.Output(objectSocket, 'Game State'));
  }
}
registerNode('Get Game State', 'World', () => new GetGameStateNode());

export class GetAllActorsWithTagNode extends ClassicPreset.Node {
  constructor() {
    super('Get All Actors with Tag');
    this.addInput('tag', new ClassicPreset.Input(strSocket, 'Tag'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}
registerNode('Get All Actors with Tag', 'World', () => new GetAllActorsWithTagNode());

// ── Time ────────────────────────────────────────────────────
export class GetWorldDeltaSecondsNode extends ClassicPreset.Node {
  constructor() {
    super('Get World Delta Seconds');
    this.addOutput('dt', new ClassicPreset.Output(numSocket, 'Delta Seconds'));
  }
}
registerNode('Get World Delta Seconds', 'World', () => new GetWorldDeltaSecondsNode());

export class GetRealTimeSecondsNode extends ClassicPreset.Node {
  constructor() {
    super('Get Real Time Seconds');
    this.addOutput('time', new ClassicPreset.Output(numSocket, 'Seconds'));
  }
}
registerNode('Get Real Time Seconds', 'World', () => new GetRealTimeSecondsNode());

export class GetGameTimeInSecondsNode extends ClassicPreset.Node {
  constructor() {
    super('Get Game Time in Seconds');
    this.addOutput('time', new ClassicPreset.Output(numSocket, 'Seconds'));
  }
}
registerNode('Get Game Time in Seconds', 'World', () => new GetGameTimeInSecondsNode());

// ── Game Control ────────────────────────────────────────────
export class OpenLevelNode extends ClassicPreset.Node {
  constructor() {
    super('Open Level');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('levelName', new ClassicPreset.Input(strSocket, 'Level Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Open Level', 'World', () => new OpenLevelNode());

export class QuitGameNode extends ClassicPreset.Node {
  constructor() {
    super('Quit Game');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
  }
}
registerNode('Quit Game', 'World', () => new QuitGameNode());

export class SetGamePausedNode extends ClassicPreset.Node {
  constructor() {
    super('Set Game Paused');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('paused', new ClassicPreset.Input(boolSocket, 'Paused'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Game Paused', 'World', () => new SetGamePausedNode());

export class IsGamePausedNode extends ClassicPreset.Node {
  constructor() {
    super('Is Game Paused');
    this.addOutput('paused', new ClassicPreset.Output(boolSocket, 'Paused'));
  }
}
registerNode('Is Game Paused', 'World', () => new IsGamePausedNode());

// ── Input ───────────────────────────────────────────────────
export class GetMousePositionNode extends ClassicPreset.Node {
  constructor() {
    super('Get Mouse Position');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
  }
}
registerNode('Get Mouse Position', 'Input', () => new GetMousePositionNode());

export class GetMouseDeltaNode extends ClassicPreset.Node {
  constructor() {
    super('Get Mouse Delta');
    this.addOutput('dx', new ClassicPreset.Output(numSocket, 'Delta X'));
    this.addOutput('dy', new ClassicPreset.Output(numSocket, 'Delta Y'));
  }
}
registerNode('Get Mouse Delta', 'Input', () => new GetMouseDeltaNode());
