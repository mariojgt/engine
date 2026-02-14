// ============================================================
//  PlayerController Blueprint Nodes
//  Possess/Unpossess, GetPlayerController, GetControlledPawn
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket } from '../sockets';
import { registerNode } from '../sockets';

// ================================================================
//  ACTION NODES
// ================================================================

/** Possess — Possess a pawn by name */
export class PossessPawnNode extends ClassicPreset.Node {
  constructor() {
    super('Possess Pawn');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('pawnName', new ClassicPreset.Input(strSocket, 'Pawn Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Unpossess — Release the current pawn */
export class UnpossessPawnNode extends ClassicPreset.Node {
  constructor() {
    super('Unpossess Pawn');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ================================================================
//  QUERY NODES
// ================================================================

/** Get Controlled Pawn Name */
export class GetControlledPawnNode extends ClassicPreset.Node {
  constructor() {
    super('Get Controlled Pawn');
    this.addOutput('name', new ClassicPreset.Output(strSocket, 'Pawn Name'));
    this.addOutput('hasPawn', new ClassicPreset.Output(boolSocket, 'Has Pawn'));
  }
}

/** Is Possessing — check if the player controller has a pawn */
export class IsPossessingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Possessing');
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}

// ================================================================
//  Registration
// ================================================================

registerNode('Possess Pawn', 'Player Controller', () => new PossessPawnNode());
registerNode('Unpossess Pawn', 'Player Controller', () => new UnpossessPawnNode());
registerNode('Get Controlled Pawn', 'Player Controller', () => new GetControlledPawnNode());
registerNode('Is Possessing', 'Player Controller', () => new IsPossessingNode());
