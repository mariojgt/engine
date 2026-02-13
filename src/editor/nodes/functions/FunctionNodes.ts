import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, vec3Socket, strSocket } from '../sockets';
import type { VarType } from '../../BlueprintData';

function socketForType(type: VarType): ClassicPreset.Socket {
  switch (type) {
    case 'Float':   return numSocket;
    case 'Boolean': return boolSocket;
    case 'Vector3': return vec3Socket;
    case 'String':  return strSocket;
  }
}

// ============================================================
//  Function Entry Node — placed inside function graphs
//  Has exec output + outputs matching function input params
// ============================================================
export class FunctionEntryNode extends ClassicPreset.Node {
  public funcId: string;

  constructor(funcId: string, funcName: string, inputs: { name: string; type: VarType }[]) {
    super(`${funcName}`);
    this.funcId = funcId;
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    for (const inp of inputs) {
      this.addOutput(inp.name, new ClassicPreset.Output(socketForType(inp.type), inp.name));
    }
  }
}

// ============================================================
//  Function Return Node — ends execution in a function graph
//  Has exec input + inputs matching function output params
// ============================================================
export class FunctionReturnNode extends ClassicPreset.Node {
  public funcId: string;

  constructor(funcId: string, _funcName: string, outputs: { name: string; type: VarType }[]) {
    super('Return Node');
    this.funcId = funcId;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    for (const out of outputs) {
      this.addInput(out.name, new ClassicPreset.Input(socketForType(out.type), out.name));
    }
  }
}

// ============================================================
//  Function Call Node — used in other graphs to call a function
// ============================================================
export class FunctionCallNode extends ClassicPreset.Node {
  public funcId: string;
  public funcName: string;

  constructor(
    funcId: string,
    funcName: string,
    inputs: { name: string; type: VarType }[],
    outputs: { name: string; type: VarType }[],
  ) {
    super(funcName);
    this.funcId = funcId;
    this.funcName = funcName;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    for (const inp of inputs) {
      this.addInput(inp.name, new ClassicPreset.Input(socketForType(inp.type), inp.name));
    }

    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    for (const out of outputs) {
      this.addOutput(out.name, new ClassicPreset.Output(socketForType(out.type), out.name));
    }
  }
}

// ============================================================
//  Macro Entry Node — placed inside macro graphs
// ============================================================
export class MacroEntryNode extends ClassicPreset.Node {
  public macroId: string;

  constructor(macroId: string, macroName: string, inputs: { name: string; type: VarType }[]) {
    super(`${macroName}`);
    this.macroId = macroId;
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    for (const inp of inputs) {
      this.addOutput(inp.name, new ClassicPreset.Output(socketForType(inp.type), inp.name));
    }
  }
}

// ============================================================
//  Macro Exit Node — ends a macro graph
// ============================================================
export class MacroExitNode extends ClassicPreset.Node {
  public macroId: string;

  constructor(macroId: string, _macroName: string, outputs: { name: string; type: VarType }[]) {
    super('Macro Exit');
    this.macroId = macroId;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    for (const out of outputs) {
      this.addInput(out.name, new ClassicPreset.Input(socketForType(out.type), out.name));
    }
  }
}

// ============================================================
//  Macro Call Node — used in other graphs to invoke a macro
// ============================================================
export class MacroCallNode extends ClassicPreset.Node {
  public macroId: string;
  public macroName: string;

  constructor(
    macroId: string,
    macroName: string,
    inputs: { name: string; type: VarType }[],
    outputs: { name: string; type: VarType }[],
  ) {
    super(macroName);
    this.macroId = macroId;
    this.macroName = macroName;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    for (const inp of inputs) {
      this.addInput(inp.name, new ClassicPreset.Input(socketForType(inp.type), inp.name));
    }

    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    for (const out of outputs) {
      this.addOutput(out.name, new ClassicPreset.Output(socketForType(out.type), out.name));
    }
  }
}
