// ============================================================
//  AnimBPNodes — Blueprint nodes specific to Animation Blueprints
//  These nodes are used in the AnimBP Event Graph (Rete editor)
//  to drive animation variables from character state, just like UE.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket as numberSocket, boolSocket, strSocket as stringSocket, objectSocket } from '../sockets';
import { registerNode } from '../index';

// ============================================================
//  Anim Update Event — fires every frame during animation update.
//  This is the AnimBP's equivalent of EventTick.
//  In UE this is "Event Blueprint Update Animation".
// ============================================================
export class AnimUpdateEventNode extends ClassicPreset.Node {
  constructor() {
    super('Anim Update Event');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('dt', new ClassicPreset.Output(numberSocket, 'Delta Time'));
  }
}
registerNode('Anim Update Event', 'Animation', () => new AnimUpdateEventNode());

// ============================================================
//  Try Get Pawn Owner — gets the character pawn that owns
//  this animation instance (via the CharacterController).
//  In UE this returns the pawn that owns the anim instance.
// ============================================================
export class TryGetPawnOwnerNode extends ClassicPreset.Node {
  constructor() {
    super('Try Get Pawn Owner');
    this.addOutput('pawn', new ClassicPreset.Output(objectSocket, 'Return Value'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Is Valid'));
  }
}
registerNode('Try Get Pawn Owner', 'Animation', () => new TryGetPawnOwnerNode());

// ============================================================
//  Set Anim Variable — sets a variable on the owning
//  AnimationInstance by name. Used in AnimBP event graphs to
//  drive state machine transitions.
// ============================================================
export class SetAnimVarNode extends ClassicPreset.Node {
  public varName: string;
  public varType: 'number' | 'boolean' | 'string';

  constructor(varName: string, varType: 'number' | 'boolean' | 'string' = 'number') {
    super(`Set ${varName}`);
    this.varName = varName;
    this.varType = varType;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    const valSocket = varType === 'number' ? numberSocket
      : varType === 'boolean' ? boolSocket
      : stringSocket;
    this.addInput('value', new ClassicPreset.Input(valSocket, varName));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ============================================================
//  Get Anim Variable — gets a variable from the owning
//  AnimationInstance by name. Pure (no exec pins).
// ============================================================
export class GetAnimVarNode extends ClassicPreset.Node {
  public varName: string;
  public varType: 'number' | 'boolean' | 'string';

  constructor(varName: string, varType: 'number' | 'boolean' | 'string' = 'number') {
    super(`Get ${varName}`);
    this.varName = varName;
    this.varType = varType;

    const valSocket = varType === 'number' ? numberSocket
      : varType === 'boolean' ? boolSocket
      : stringSocket;
    this.addOutput('value', new ClassicPreset.Output(valSocket, varName));
  }
}
