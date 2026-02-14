// ============================================================
//  Controller Blueprint Nodes
//  GetController, GetPawn, GetControllerType — bidirectional
//  Controller ↔ Pawn access (UE-style AController / APawn)
// ============================================================

import { ClassicPreset } from 'rete';
import { boolSocket, strSocket } from '../sockets';
import { registerNode } from '../sockets';

// ================================================================
//  QUERY NODES
// ================================================================

/**
 * Get Controller — returns the controller type assigned to this pawn.
 * Pure node (no exec pins).
 */
export class GetControllerNode extends ClassicPreset.Node {
  constructor() {
    super('Get Controller');
    this.addOutput('type', new ClassicPreset.Output(strSocket, 'Controller Type'));
    this.addOutput('hasController', new ClassicPreset.Output(boolSocket, 'Has Controller'));
  }
}

/**
 * Get Controller Type — returns the controller type as a string.
 * Outputs 'PlayerController', 'AIController', or 'None'.
 */
export class GetControllerTypeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Controller Type');
    this.addOutput('type', new ClassicPreset.Output(strSocket, 'Type'));
  }
}

/**
 * Get Pawn — from the controller, get the pawn's game object name.
 * Pure node (no exec pins).
 */
export class GetPawnNode extends ClassicPreset.Node {
  constructor() {
    super('Get Pawn');
    this.addOutput('name', new ClassicPreset.Output(strSocket, 'Pawn Name'));
    this.addOutput('hasPawn', new ClassicPreset.Output(boolSocket, 'Has Pawn'));
  }
}

/**
 * Is Player Controlled — returns true if the pawn has a PlayerController.
 */
export class IsPlayerControlledNode extends ClassicPreset.Node {
  constructor() {
    super('Is Player Controlled');
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}

/**
 * Is AI Controlled — returns true if the pawn has an AIController.
 */
export class IsAIControlledNode extends ClassicPreset.Node {
  constructor() {
    super('Is AI Controlled');
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}

// ================================================================
//  Registration
// ================================================================

registerNode('Get Controller',      'Controller', () => new GetControllerNode());
registerNode('Get Controller Type', 'Controller', () => new GetControllerTypeNode());
registerNode('Get Pawn',            'Controller', () => new GetPawnNode());
registerNode('Is Player Controlled','Controller', () => new IsPlayerControlledNode());
registerNode('Is AI Controlled',    'Controller', () => new IsAIControlledNode());
