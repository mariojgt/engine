// ============================================================
//  BlueprintData — UE-style Blueprint state per GameObject
//  Stores variables, functions, macros, and graph data.
// ============================================================

export type VarType = 'Float' | 'Boolean' | 'Vector3' | 'String';

export interface BlueprintVariable {
  name: string;
  type: VarType;
  defaultValue: any;
  /** Unique id for referencing */
  id: string;
}

export interface BlueprintGraphData {
  /** Rete serialized node data (optional, for future persistence) */
  nodeData?: any;
}

export interface BlueprintFunction {
  name: string;
  id: string;
  /** Input parameters */
  inputs: { name: string; type: VarType }[];
  /** Output parameters */
  outputs: { name: string; type: VarType }[];
  /** The graph data for this function */
  graph: BlueprintGraphData;
}

export interface BlueprintMacro {
  name: string;
  id: string;
  /** Input parameters */
  inputs: { name: string; type: VarType }[];
  /** Output parameters */
  outputs: { name: string; type: VarType }[];
  /** The graph data for this macro */
  graph: BlueprintGraphData;
}

export interface BlueprintCustomEvent {
  name: string;
  id: string;
}

let _nextId = 1;
function uid(): string {
  return 'bp_' + (_nextId++) + '_' + Math.random().toString(36).slice(2, 6);
}

export class BlueprintData {
  public variables: BlueprintVariable[] = [];
  public functions: BlueprintFunction[] = [];
  public macros: BlueprintMacro[] = [];
  public customEvents: BlueprintCustomEvent[] = [];

  /** Event Graph is always present (index 0 in the graphs concept) */
  public eventGraph: BlueprintGraphData = {};

  // --- Variables ---
  addVariable(name: string, type: VarType): BlueprintVariable {
    const v: BlueprintVariable = {
      name,
      type,
      defaultValue: this._defaultForType(type),
      id: uid(),
    };
    this.variables.push(v);
    return v;
  }

  removeVariable(id: string): void {
    this.variables = this.variables.filter(v => v.id !== id);
  }

  getVariable(id: string): BlueprintVariable | undefined {
    return this.variables.find(v => v.id === id);
  }

  getVariableByName(name: string): BlueprintVariable | undefined {
    return this.variables.find(v => v.name === name);
  }

  // --- Functions ---
  addFunction(name: string): BlueprintFunction {
    const fn: BlueprintFunction = {
      name,
      id: uid(),
      inputs: [],
      outputs: [],
      graph: {},
    };
    this.functions.push(fn);
    return fn;
  }

  removeFunction(id: string): void {
    this.functions = this.functions.filter(f => f.id !== id);
  }

  getFunction(id: string): BlueprintFunction | undefined {
    return this.functions.find(f => f.id === id);
  }

  // --- Macros ---
  addMacro(name: string): BlueprintMacro {
    const m: BlueprintMacro = {
      name,
      id: uid(),
      inputs: [],
      outputs: [],
      graph: {},
    };
    this.macros.push(m);
    return m;
  }

  removeMacro(id: string): void {
    this.macros = this.macros.filter(m => m.id !== id);
  }

  getMacro(id: string): BlueprintMacro | undefined {
    return this.macros.find(m => m.id === id);
  }

  // --- Custom Events ---
  addCustomEvent(name: string): BlueprintCustomEvent {
    const evt: BlueprintCustomEvent = { name, id: uid() };
    this.customEvents.push(evt);
    return evt;
  }

  removeCustomEvent(id: string): void {
    this.customEvents = this.customEvents.filter(e => e.id !== id);
  }

  getCustomEvent(id: string): BlueprintCustomEvent | undefined {
    return this.customEvents.find(e => e.id === id);
  }

  // --- Helpers ---
  private _defaultForType(type: VarType): any {
    switch (type) {
      case 'Float': return 0;
      case 'Boolean': return false;
      case 'Vector3': return { x: 0, y: 0, z: 0 };
      case 'String': return '';
    }
  }
}
