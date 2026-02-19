// ============================================================
//  BlueprintData — UE-style Blueprint state per GameObject
//  Stores variables, functions, macros, and graph data.
// ============================================================

export type VarType = 'Float' | 'Boolean' | 'Vector3' | 'String' | 'Color' | 'ObjectRef' | 'Widget' | `Struct:${string}` | `Enum:${string}` | `ClassRef:${string}`;

export interface BlueprintVariable {
  name: string;
  type: VarType;
  defaultValue: any;
  /** Unique id for referencing */
  id: string;
  /** When true, this variable appears as an input pin on Spawn Actor from Class nodes */
  exposeOnSpawn?: boolean;
  /** When true, this variable can be edited per-instance in the scene outliner */
  instanceEditable?: boolean;
}

export interface BlueprintStructField {
  name: string;
  type: VarType;
}

export interface BlueprintStruct {
  name: string;
  id: string;
  fields: BlueprintStructField[];
}

export interface BlueprintGraphData {
  /** Rete serialized node data (optional, for future persistence) */
  nodeData?: any;
  /** Comment boxes placed in the graph */
  comments?: BlueprintComment[];
}

export interface BlueprintComment {
  id: string;
  text: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  color: string;
}

export interface BlueprintFunction {
  name: string;
  id: string;
  /** Input parameters */
  inputs: { name: string; type: VarType }[];
  /** Output parameters */
  outputs: { name: string; type: VarType }[];
  /** Local variables scoped to this function */
  localVariables: BlueprintVariable[];
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
  /** Parameters passed to this event */
  params: { name: string; type: VarType }[];
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
  public structs: BlueprintStruct[] = [];

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
      localVariables: [],
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

  addFunctionLocalVariable(funcId: string, name: string, type: VarType): BlueprintVariable | undefined {
    const fn = this.getFunction(funcId);
    if (!fn) return undefined;
    const v: BlueprintVariable = { name, type, defaultValue: this._defaultForType(type), id: uid() };
    fn.localVariables.push(v);
    return v;
  }

  removeFunctionLocalVariable(funcId: string, varId: string): void {
    const fn = this.getFunction(funcId);
    if (fn) fn.localVariables = fn.localVariables.filter(v => v.id !== varId);
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
    const evt: BlueprintCustomEvent = { name, id: uid(), params: [] };
    this.customEvents.push(evt);
    return evt;
  }

  removeCustomEvent(id: string): void {
    this.customEvents = this.customEvents.filter(e => e.id !== id);
  }

  getCustomEvent(id: string): BlueprintCustomEvent | undefined {
    return this.customEvents.find(e => e.id === id);
  }

  // --- Structs ---
  addStruct(name: string, fields: BlueprintStructField[] = []): BlueprintStruct {
    const s: BlueprintStruct = { name, id: uid(), fields };
    this.structs.push(s);
    return s;
  }

  removeStruct(id: string): void {
    this.structs = this.structs.filter(s => s.id !== id);
  }

  getStruct(id: string): BlueprintStruct | undefined {
    return this.structs.find(s => s.id === id);
  }

  getStructByName(name: string): BlueprintStruct | undefined {
    return this.structs.find(s => s.name === name);
  }

  // --- Helpers ---
  private _defaultForType(type: VarType): any {
    switch (type) {
      case 'Float': return 0;
      case 'Boolean': return false;
      case 'Vector3': return { x: 0, y: 0, z: 0 };
      case 'String': return '';
      case 'Color': return '#ffffff';
      case 'Widget': return null;
      default:
        if (type.startsWith('Struct:')) {
          const structId = type.slice(7);
          const struct = this.structs.find(s => s.id === structId);
          if (struct) {
            const obj: any = {};
            for (const f of struct.fields) {
              obj[f.name] = this._defaultForType(f.type);
            }
            return obj;
          }
          return {};
        }
        if (type.startsWith('Enum:')) return '';
        if (type === 'ObjectRef' || type.startsWith('ClassRef:')) return null;
        return null;
    }
  }
}
