import { ClassicPreset } from 'rete';
import { numSocket, boolSocket, vec3Socket, strSocket, execSocket, registerNode } from '../sockets';
import type { VarType } from '../../BlueprintData';

// ============================================================
//  Socket helpers for variable types
// ============================================================
export function socketForType(type: VarType): ClassicPreset.Socket {
  switch (type) {
    case 'Float':   return numSocket;
    case 'Boolean': return boolSocket;
    case 'Vector3': return vec3Socket;
    case 'String':  return strSocket;
  }
}

// ============================================================
//  Get Variable Node
// ============================================================
export class GetVariableNode extends ClassicPreset.Node {
  public varId: string;
  public varName: string;
  public varType: VarType;

  constructor(varId: string, varName: string, varType: VarType) {
    super(`Get ${varName}`);
    this.varId = varId;
    this.varName = varName;
    this.varType = varType;

    if (varType === 'Vector3') {
      this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
      this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
      this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
    } else {
      this.addOutput('value', new ClassicPreset.Output(socketForType(varType), varName));
    }
  }
}

// ============================================================
//  Set Variable Node
// ============================================================
export class SetVariableNode extends ClassicPreset.Node {
  public varId: string;
  public varName: string;
  public varType: VarType;

  constructor(varId: string, varName: string, varType: VarType) {
    super(`Set ${varName}`);
    this.varId = varId;
    this.varName = varName;
    this.varType = varType;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));

    if (varType === 'Vector3') {
      this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
      this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
      this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    } else {
      this.addInput('value', new ClassicPreset.Input(socketForType(varType), varName));
    }

    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));

    if (varType === 'Vector3') {
      this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
      this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
      this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
    } else {
      this.addOutput('value', new ClassicPreset.Output(socketForType(varType), varName));
    }
  }
}
