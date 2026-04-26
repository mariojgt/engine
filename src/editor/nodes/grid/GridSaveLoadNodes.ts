// ============================================================
//  Grid Save/Load Nodes — pack/unpack the grid into a SaveGame
//
//  These do NOT spawn or destroy actors. They serialize cell
//  metadata (gx, gz, dir, classId, className, actorName) into a
//  variable on the save object, and read it back as a JSON
//  string the user can iterate with their own spawn logic.
//  Keeps the engine free of game-specific spawn policy.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket, numSocket, strSocket, objectSocket, registerNode,
} from '../sockets';

/**
 * Save Grid State — writes a JSON-encoded grid layout into
 * `saveObject[varName]`. Must be followed by Save Game To Slot.
 */
export class SaveGridStateNode extends ClassicPreset.Node {
  constructor() {
    super('Save Grid State');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Var Name'));
    this.addControl('defaultVarName', new ClassicPreset.InputControl('text', { initial: 'gridState' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}

/**
 * Load Grid State — reads the JSON-encoded grid layout from
 * `saveObject[varName]` and outputs it as a string. The user
 * iterates and re-spawns with Spawn Actor From Class.
 */
export class LoadGridStateNode extends ClassicPreset.Node {
  constructor() {
    super('Load Grid State');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Var Name'));
    this.addControl('defaultVarName', new ClassicPreset.InputControl('text', { initial: 'gridState' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('json', new ClassicPreset.Output(strSocket, 'JSON'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}

registerNode('Save Grid State', 'Grid', () => new SaveGridStateNode());
registerNode('Load Grid State', 'Grid', () => new LoadGridStateNode());
