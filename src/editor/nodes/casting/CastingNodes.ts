// ============================================================
//  CastingNodes — UE-style Object Casting & Reference Nodes
//
//  Provides:
//    • Cast To <ClassName>      — Type-safe cast with success/fail flow
//    • Get Self Reference       — Returns this gameObject as ObjectRef
//    • Get Player Pawn          — Finds the player character pawn
//    • Get Actor By Name        — Finds any actor in the scene by name
//    • Get All Actors Of Class  — Returns all actors of a given class
//    • Is Valid                  — Null/validity check
//    • Get Actor Name           — Read the name of an actor reference
//    • Get Actor Variable       — Read a variable from another actor's blueprint
//    • Set Actor Variable       — Write a variable on another actor's blueprint
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  objectSocket,
  numSocket,
  boolSocket,
  strSocket,
  registerNode,
  getClassRefSocket,
} from '../sockets';
import { socketForType } from '../variables/VariableNodes';
import type { VarType } from '../../BlueprintData';

// ============================================================
//  Cast To Node (dynamic — created with target class info)
// ============================================================
export class CastToNode extends ClassicPreset.Node {
  /** ActorAsset ID of the target class to cast to */
  public targetClassId: string;
  /** Display name of the target class */
  public targetClassName: string;

  constructor(targetClassId: string, targetClassName: string) {
    super(`Cast to ${targetClassName}`);
    this.targetClassId = targetClassId;
    this.targetClassName = targetClassName;

    // Inputs
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('object', new ClassicPreset.Input(objectSocket, 'Object'));

    // Outputs
    this.addOutput('success', new ClassicPreset.Output(execSocket, 'Success ▶'));
    this.addOutput('fail', new ClassicPreset.Output(execSocket, 'Fail ▶'));
    // Typed output — uses a class-specific socket so downstream nodes know the type
    this.addOutput('castedObject', new ClassicPreset.Output(
      getClassRefSocket(targetClassId),
      `As ${targetClassName}`,
    ));
  }
}

// ============================================================
//  Get Self Reference — returns the current gameObject
// ============================================================
export class GetSelfReferenceNode extends ClassicPreset.Node {
  constructor() {
    super('Get Self Reference');
    this.addOutput('self', new ClassicPreset.Output(objectSocket, 'Self'));
  }
}
registerNode('Get Self Reference', 'Casting', () => new GetSelfReferenceNode());

// ============================================================
//  Get Player Pawn — finds the player-controlled character pawn
// ============================================================
export class GetPlayerPawnNode extends ClassicPreset.Node {
  constructor() {
    super('Get Player Pawn');
    this.addOutput('pawn', new ClassicPreset.Output(objectSocket, 'Player Pawn'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Is Valid'));
  }
}
registerNode('Get Player Pawn', 'Casting', () => new GetPlayerPawnNode());

// ============================================================
//  Get Actor By Name — find an actor in the scene by its name
// ============================================================
export class GetActorByNameNode extends ClassicPreset.Node {
  constructor() {
    super('Get Actor By Name');
    this.addInput('name', new ClassicPreset.Input(strSocket, 'Name'));
    this.addOutput('actor', new ClassicPreset.Output(objectSocket, 'Actor'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Is Valid'));
  }
}
registerNode('Get Actor By Name', 'Casting', () => new GetActorByNameNode());

// ============================================================
//  Get All Actors Of Class — returns all actors matching a class
// ============================================================
export class GetAllActorsOfClassNode extends ClassicPreset.Node {
  public targetClassId: string;
  public targetClassName: string;

  constructor(targetClassId: string, targetClassName: string) {
    super(`Get All Actors Of Class: ${targetClassName}`);
    this.targetClassId = targetClassId;
    this.targetClassName = targetClassName;

    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}

// ============================================================
//  Is Valid — checks if an object reference is not null
// ============================================================
export class IsValidNode extends ClassicPreset.Node {
  constructor() {
    super('Is Valid');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('object', new ClassicPreset.Input(objectSocket, 'Object'));
    this.addOutput('valid', new ClassicPreset.Output(execSocket, 'Is Valid ▶'));
    this.addOutput('invalid', new ClassicPreset.Output(execSocket, 'Is Not Valid ▶'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Valid'));
  }
}
registerNode('Is Valid', 'Casting', () => new IsValidNode());

// ============================================================
//  Get Actor Name — read the display name from an actor ref
// ============================================================
export class GetActorNameNode extends ClassicPreset.Node {
  constructor() {
    super('Get Actor Name');
    this.addInput('object', new ClassicPreset.Input(objectSocket, 'Object'));
    this.addOutput('name', new ClassicPreset.Output(strSocket, 'Name'));
  }
}
registerNode('Get Actor Name', 'Casting', () => new GetActorNameNode());

// ============================================================
//  Get Actor Variable — read a variable from another actor
// ============================================================
export class GetActorVariableNode extends ClassicPreset.Node {
  public varName: string;
  public varType: VarType;
  /** Actor asset ID of the target class (for context) */
  public targetActorId: string;

  constructor(varName: string, varType: VarType = 'Float', targetActorId: string = '') {
    super(`Get ${varName} (Remote)`);
    this.varName = varName;
    this.varType = varType;
    this.targetActorId = targetActorId;

    this.addInput('target', new ClassicPreset.Input(objectSocket, 'Target'));
    // Output uses the correct socket type for this variable
    this.addOutput('value', new ClassicPreset.Output(socketForType(varType), 'Value'));
  }
}

// ============================================================
//  Set Actor Variable — write a variable on another actor
// ============================================================
export class SetActorVariableNode extends ClassicPreset.Node {
  public varName: string;
  public varType: VarType;
  /** Actor asset ID of the target class (for context) */
  public targetActorId: string;

  constructor(varName: string, varType: VarType = 'Float', targetActorId: string = '') {
    super(`Set ${varName} (Remote)`);
    this.varName = varName;
    this.varType = varType;
    this.targetActorId = targetActorId;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('target', new ClassicPreset.Input(objectSocket, 'Target'));
    this.addInput('value', new ClassicPreset.Input(socketForType(varType), 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ============================================================
//  Get Owner — returns the owning actor (for component scripts)
// ============================================================
export class GetOwnerNode extends ClassicPreset.Node {
  constructor() {
    super('Get Owner');
    this.addOutput('owner', new ClassicPreset.Output(objectSocket, 'Owner'));
  }
}
registerNode('Get Owner', 'Casting', () => new GetOwnerNode());

// ============================================================
//  Get Animation Instance — gets the animation instance from
//  the pawn's skeletal mesh (for casting to specific AnimBP)
// ============================================================
export class GetAnimInstanceNode extends ClassicPreset.Node {
  constructor() {
    super('Get Anim Instance');
    this.addInput('object', new ClassicPreset.Input(objectSocket, 'Pawn'));
    this.addOutput('animInstance', new ClassicPreset.Output(objectSocket, 'Anim Instance'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Is Valid'));
  }
}
registerNode('Get Anim Instance', 'Casting', () => new GetAnimInstanceNode());

// ============================================================
//  Get Controlled Pawn — from a controller, gets its pawn
//  (already exists in Character nodes; re-exported for Casting)
// ============================================================

// ============================================================
// Pure Cast (no exec pins — data-only version)
// ============================================================
export class PureCastNode extends ClassicPreset.Node {
  public targetClassId: string;
  public targetClassName: string;

  constructor(targetClassId: string, targetClassName: string) {
    super(`Pure Cast to ${targetClassName}`);
    this.targetClassId = targetClassId;
    this.targetClassName = targetClassName;

    this.addInput('object', new ClassicPreset.Input(objectSocket, 'Object'));
    this.addOutput('castedObject', new ClassicPreset.Output(
      getClassRefSocket(targetClassId),
      `As ${targetClassName}`,
    ));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}

// ============================================================
//  Call Actor Function — call a function defined on another actor's blueprint
// ============================================================
export class CallActorFunctionNode extends ClassicPreset.Node {
  public funcId: string;
  public funcName: string;
  /** Actor asset ID of the target class (for context) */
  public targetActorId: string;

  constructor(
    funcId: string,
    funcName: string,
    targetActorId: string,
    inputs: { name: string; type: VarType }[],
    outputs: { name: string; type: VarType }[],
  ) {
    super(`${funcName} (Remote)`);
    this.funcId = funcId;
    this.funcName = funcName;
    this.targetActorId = targetActorId;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('target', new ClassicPreset.Input(objectSocket, 'Target'));
    for (const inp of inputs) {
      this.addInput(inp.name, new ClassicPreset.Input(socketForType(inp.type), inp.name));
    }

    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    for (const out of outputs) {
      this.addOutput(out.name, new ClassicPreset.Output(socketForType(out.type), out.name));
    }
  }
}
