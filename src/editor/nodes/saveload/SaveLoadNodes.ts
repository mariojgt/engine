// ============================================================
//  SaveLoadNodes - UE-style blueprint nodes for Save/Load
//
//  Modeled after Unreal Engine's save game blueprint nodes:
//  - Create Save Game Object
//  - Save Game to Slot
//  - Load Game from Slot
//  - Does Save Game Exist
//  - Delete Game in Slot
//  - Set / Get Save Game Variable
//
//  All nodes are UI-only definitions.
//  Code generation is in NodeEditorPanel.tsx genAction()/resolveValue().
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  numSocket,
  boolSocket,
  strSocket,
  vec3Socket,
  objectSocket,
  registerNode,
} from '../sockets';

// ============================================================
//  Create Save Game Object - factory (like UGameplayStatics::CreateSaveGameObject)
// ============================================================
export class CreateSaveGameObjectNode extends ClassicPreset.Node {
  constructor() {
    super('Create Save Game Object');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '\u25B6'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '\u25B6'));
    this.addOutput('saveObject', new ClassicPreset.Output(objectSocket, 'Save Object'));
  }
}
registerNode('Create Save Game Object', 'Save/Load', () => new CreateSaveGameObjectNode());

// ============================================================
//  Save Game to Slot (like UGameplayStatics::SaveGameToSlot)
// ============================================================
export class SaveGameToSlotNode extends ClassicPreset.Node {
  constructor() {
    super('Save Game to Slot');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '\u25B6'));
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('slotName', new ClassicPreset.Input(strSocket, 'Slot Name'));
    this.addInput('userIndex', new ClassicPreset.Input(numSocket, 'User Index'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '\u25B6'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Save Game to Slot', 'Save/Load', () => new SaveGameToSlotNode());

// ============================================================
//  Load Game from Slot (like UGameplayStatics::LoadGameFromSlot)
// ============================================================
export class LoadGameFromSlotNode extends ClassicPreset.Node {
  constructor() {
    super('Load Game from Slot');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '\u25B6'));
    this.addInput('slotName', new ClassicPreset.Input(strSocket, 'Slot Name'));
    this.addInput('userIndex', new ClassicPreset.Input(numSocket, 'User Index'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '\u25B6'));
    this.addOutput('saveObject', new ClassicPreset.Output(objectSocket, 'Save Object'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Load Game from Slot', 'Save/Load', () => new LoadGameFromSlotNode());

// ============================================================
//  Does Save Game Exist (like UGameplayStatics::DoesSaveGameExist)
// ============================================================
export class DoesSaveGameExistNode extends ClassicPreset.Node {
  constructor() {
    super('Does Save Game Exist');
    this.addInput('slotName', new ClassicPreset.Input(strSocket, 'Slot Name'));
    this.addInput('userIndex', new ClassicPreset.Input(numSocket, 'User Index'));
    this.addOutput('exists', new ClassicPreset.Output(boolSocket, 'Exists'));
  }
}
registerNode('Does Save Game Exist', 'Save/Load', () => new DoesSaveGameExistNode());

// ============================================================
//  Delete Game in Slot (like UGameplayStatics::DeleteGameInSlot)
// ============================================================
export class DeleteGameInSlotNode extends ClassicPreset.Node {
  constructor() {
    super('Delete Game in Slot');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '\u25B6'));
    this.addInput('slotName', new ClassicPreset.Input(strSocket, 'Slot Name'));
    this.addInput('userIndex', new ClassicPreset.Input(numSocket, 'User Index'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '\u25B6'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Delete Game in Slot', 'Save/Load', () => new DeleteGameInSlotNode());

// ============================================================
//  Set Save Game Variable - sets a key/value on SaveGameObject
// ============================================================
export class SetSaveGameVariableNode extends ClassicPreset.Node {
  constructor() {
    super('Set Save Game Variable');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '\u25B6'));
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable Name'));
    this.addInput('value', new ClassicPreset.Input(strSocket, 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '\u25B6'));
  }
}
registerNode('Set Save Game Variable', 'Save/Load', () => new SetSaveGameVariableNode());

// ============================================================
//  Get Save Game String Variable
// ============================================================
export class GetSaveGameStringNode extends ClassicPreset.Node {
  constructor() {
    super('Get Save Game String');
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable Name'));
    this.addInput('default', new ClassicPreset.Input(strSocket, 'Default'));
    this.addOutput('value', new ClassicPreset.Output(strSocket, 'Value'));
  }
}
registerNode('Get Save Game String', 'Save/Load', () => new GetSaveGameStringNode());

// ============================================================
//  Get Save Game Int Variable
// ============================================================
export class GetSaveGameIntNode extends ClassicPreset.Node {
  constructor() {
    super('Get Save Game Int');
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable Name'));
    this.addInput('default', new ClassicPreset.Input(numSocket, 'Default'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}
registerNode('Get Save Game Int', 'Save/Load', () => new GetSaveGameIntNode());

// ============================================================
//  Get Save Game Float Variable
// ============================================================
export class GetSaveGameFloatNode extends ClassicPreset.Node {
  constructor() {
    super('Get Save Game Float');
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable Name'));
    this.addInput('default', new ClassicPreset.Input(numSocket, 'Default'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}
registerNode('Get Save Game Float', 'Save/Load', () => new GetSaveGameFloatNode());

// ============================================================
//  Get Save Game Bool Variable
// ============================================================
export class GetSaveGameBoolNode extends ClassicPreset.Node {
  constructor() {
    super('Get Save Game Bool');
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable Name'));
    this.addInput('default', new ClassicPreset.Input(boolSocket, 'Default'));
    this.addOutput('value', new ClassicPreset.Output(boolSocket, 'Value'));
  }
}
registerNode('Get Save Game Bool', 'Save/Load', () => new GetSaveGameBoolNode());

// ============================================================
//  Get Save Game Vector Variable
// ============================================================
export class GetSaveGameVectorNode extends ClassicPreset.Node {
  constructor() {
    super('Get Save Game Vector');
    this.addInput('saveObject', new ClassicPreset.Input(objectSocket, 'Save Object'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable Name'));
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}
registerNode('Get Save Game Vector', 'Save/Load', () => new GetSaveGameVectorNode());

// ============================================================
//  Get All Save Slot Names - comma-separated string of slot names
// ============================================================
export class GetAllSaveSlotNamesNode extends ClassicPreset.Node {
  constructor() {
    super('Get All Save Slot Names');
    this.addOutput('names', new ClassicPreset.Output(strSocket, 'Names'));
  }
}
registerNode('Get All Save Slot Names', 'Save/Load', () => new GetAllSaveSlotNamesNode());

// ============================================================
//  Get Save Slot Count
// ============================================================
export class GetSaveSlotCountNode extends ClassicPreset.Node {
  constructor() {
    super('Get Save Slot Count');
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}
registerNode('Get Save Slot Count', 'Save/Load', () => new GetSaveSlotCountNode());
