// ============================================================
//  StructureAsset & EnumAsset — UE-style project-level types
//  Shared across all actors. Stored in Content Browser.
// ============================================================

import type { VarType } from './BlueprintData';

// ---- Structure Asset ----

export interface StructureFieldDef {
  /** Unique id within this struct */
  id: string;
  /** Field name (identifier) */
  name: string;
  /** Field type */
  type: VarType;
  /** Default value for this field */
  defaultValue: any;
  /** Optional tooltip / description */
  tooltip: string;
  /** Display order */
  sortOrder: number;
}

export interface StructureAssetJSON {
  structureId: string;
  structureName: string;
  description: string;
  category: string;
  fields: StructureFieldDef[];
  createdAt: number;
  modifiedAt: number;
}

// ---- Enum Asset ----

export interface EnumValueDef {
  /** Unique id within this enum */
  id: string;
  /** Internal name (identifier) */
  name: string;
  /** Display name (human-readable) */
  displayName: string;
  /** Optional description */
  description: string;
  /** Numeric value (auto-incremented) */
  value: number;
  /** Display order */
  sortOrder: number;
}

export interface EnumAssetJSON {
  enumId: string;
  enumName: string;
  description: string;
  category: string;
  values: EnumValueDef[];
  createdAt: number;
  modifiedAt: number;
}

// ---- Runtime Classes ----

let _nextStructId = 1;
function structUid(): string {
  return 'struct_' + (_nextStructId++) + '_' + Date.now().toString(36);
}

let _nextEnumId = 1;
function enumUid(): string {
  return 'enum_' + (_nextEnumId++) + '_' + Date.now().toString(36);
}

let _nextFieldId = 1;
function fieldUid(): string {
  return 'fld_' + (_nextFieldId++) + '_' + Math.random().toString(36).slice(2, 6);
}

let _nextValId = 1;
function valUid(): string {
  return 'val_' + (_nextValId++) + '_' + Math.random().toString(36).slice(2, 6);
}

/** Default value for a given VarType */
export function defaultForVarType(type: VarType): any {
  switch (type) {
    case 'Float': return 0;
    case 'Boolean': return false;
    case 'Vector3': return { x: 0, y: 0, z: 0 };
    case 'String': return '';
    default:
      if (type.startsWith('Struct:')) return {};
      if (type.startsWith('Enum:')) return '';
      return null;
  }
}

export class StructureAsset {
  public id: string;
  public name: string;
  public description: string = '';
  public category: string = 'Default';
  public fields: StructureFieldDef[] = [];
  public createdAt: number;
  public modifiedAt: number;

  constructor(name: string, id?: string) {
    this.id = id ?? structUid();
    this.name = name;
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
  }

  touch(): void {
    this.modifiedAt = Date.now();
  }

  addField(name: string, type: VarType = 'Float'): StructureFieldDef {
    const f: StructureFieldDef = {
      id: fieldUid(),
      name,
      type,
      defaultValue: defaultForVarType(type),
      tooltip: '',
      sortOrder: this.fields.length,
    };
    this.fields.push(f);
    this.touch();
    return f;
  }

  removeField(fieldId: string): void {
    this.fields = this.fields.filter(f => f.id !== fieldId);
    this.fields.forEach((f, i) => f.sortOrder = i);
    this.touch();
  }

  getField(fieldId: string): StructureFieldDef | undefined {
    return this.fields.find(f => f.id === fieldId);
  }

  reorderField(fieldId: string, newIndex: number): void {
    const idx = this.fields.findIndex(f => f.id === fieldId);
    if (idx < 0 || newIndex < 0 || newIndex >= this.fields.length) return;
    const [field] = this.fields.splice(idx, 1);
    this.fields.splice(newIndex, 0, field);
    this.fields.forEach((f, i) => f.sortOrder = i);
    this.touch();
  }

  toJSON(): StructureAssetJSON {
    return {
      structureId: this.id,
      structureName: this.name,
      description: this.description,
      category: this.category,
      fields: structuredClone(this.fields),
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }

  static fromJSON(json: StructureAssetJSON): StructureAsset {
    const sa = new StructureAsset(json.structureName, json.structureId);
    sa.description = json.description || '';
    sa.category = json.category || 'Default';
    sa.fields = (json.fields || []).map((f, i) => ({
      id: f.id || fieldUid(),
      name: f.name,
      type: f.type,
      defaultValue: f.defaultValue ?? defaultForVarType(f.type),
      tooltip: f.tooltip || '',
      sortOrder: f.sortOrder ?? i,
    }));
    sa.createdAt = json.createdAt || Date.now();
    sa.modifiedAt = json.modifiedAt || Date.now();
    return sa;
  }
}

export class EnumAsset {
  public id: string;
  public name: string;
  public description: string = '';
  public category: string = 'Default';
  public values: EnumValueDef[] = [];
  public createdAt: number;
  public modifiedAt: number;

  constructor(name: string, id?: string) {
    this.id = id ?? enumUid();
    this.name = name;
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
  }

  touch(): void {
    this.modifiedAt = Date.now();
  }

  addValue(name: string, displayName?: string): EnumValueDef {
    const v: EnumValueDef = {
      id: valUid(),
      name,
      displayName: displayName || name,
      description: '',
      value: this.values.length,
      sortOrder: this.values.length,
    };
    this.values.push(v);
    this.touch();
    return v;
  }

  removeValue(valueId: string): void {
    this.values = this.values.filter(v => v.id !== valueId);
    this.values.forEach((v, i) => { v.sortOrder = i; v.value = i; });
    this.touch();
  }

  getValue(valueId: string): EnumValueDef | undefined {
    return this.values.find(v => v.id === valueId);
  }

  reorderValue(valueId: string, newIndex: number): void {
    const idx = this.values.findIndex(v => v.id === valueId);
    if (idx < 0 || newIndex < 0 || newIndex >= this.values.length) return;
    const [val] = this.values.splice(idx, 1);
    this.values.splice(newIndex, 0, val);
    this.values.forEach((v, i) => { v.sortOrder = i; v.value = i; });
    this.touch();
  }

  toJSON(): EnumAssetJSON {
    return {
      enumId: this.id,
      enumName: this.name,
      description: this.description,
      category: this.category,
      values: structuredClone(this.values),
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }

  static fromJSON(json: EnumAssetJSON): EnumAsset {
    const ea = new EnumAsset(json.enumName, json.enumId);
    ea.description = json.description || '';
    ea.category = json.category || 'Default';
    ea.values = (json.values || []).map((v, i) => ({
      id: v.id || valUid(),
      name: v.name,
      displayName: v.displayName || v.name,
      description: v.description || '',
      value: v.value ?? i,
      sortOrder: v.sortOrder ?? i,
    }));
    ea.createdAt = json.createdAt || Date.now();
    ea.modifiedAt = json.modifiedAt || Date.now();
    return ea;
  }
}

// ============================================================
//  StructureAssetManager — In-memory registry for both types
// ============================================================

type ChangeCallback = () => void;

export class StructureAssetManager {
  private _structures: Map<string, StructureAsset> = new Map();
  private _enums: Map<string, EnumAsset> = new Map();
  private _onChanged: ChangeCallback[] = [];

  // ---- Structures ----

  get structures(): StructureAsset[] {
    return Array.from(this._structures.values());
  }

  getStructure(id: string): StructureAsset | undefined {
    return this._structures.get(id);
  }

  getStructureByName(name: string): StructureAsset | undefined {
    return this.structures.find(s => s.name === name);
  }

  createStructure(name: string): StructureAsset {
    const sa = new StructureAsset(name);
    this._structures.set(sa.id, sa);
    this._emitChanged();
    return sa;
  }

  removeStructure(id: string): void {
    this._structures.delete(id);
    this._emitChanged();
  }

  renameStructure(id: string, newName: string): void {
    const s = this._structures.get(id);
    if (s) {
      s.name = newName;
      s.touch();
      this._emitChanged();
    }
  }

  notifyStructureChanged(id: string): void {
    const s = this._structures.get(id);
    if (s) s.touch();
    this._emitChanged();
  }

  // ---- Enums ----

  get enums(): EnumAsset[] {
    return Array.from(this._enums.values());
  }

  getEnum(id: string): EnumAsset | undefined {
    return this._enums.get(id);
  }

  getEnumByName(name: string): EnumAsset | undefined {
    return this.enums.find(e => e.name === name);
  }

  createEnum(name: string): EnumAsset {
    const ea = new EnumAsset(name);
    this._enums.set(ea.id, ea);
    this._emitChanged();
    return ea;
  }

  removeEnum(id: string): void {
    this._enums.delete(id);
    this._emitChanged();
  }

  renameEnum(id: string, newName: string): void {
    const e = this._enums.get(id);
    if (e) {
      e.name = newName;
      e.touch();
      this._emitChanged();
    }
  }

  notifyEnumChanged(id: string): void {
    const e = this._enums.get(id);
    if (e) e.touch();
    this._emitChanged();
  }

  // ---- Change callback ----

  onChanged(cb: ChangeCallback): void {
    this._onChanged.push(cb);
  }

  // ---- Export / Import ----

  exportStructures(): StructureAssetJSON[] {
    return this.structures.map(s => s.toJSON());
  }

  exportEnums(): EnumAssetJSON[] {
    return this.enums.map(e => e.toJSON());
  }

  importStructures(data: StructureAssetJSON[]): void {
    this._structures.clear();
    for (const json of data) {
      const sa = StructureAsset.fromJSON(json);
      this._structures.set(sa.id, sa);
    }
    this._emitChanged();
  }

  importEnums(data: EnumAssetJSON[]): void {
    this._enums.clear();
    for (const json of data) {
      const ea = EnumAsset.fromJSON(json);
      this._enums.set(ea.id, ea);
    }
    this._emitChanged();
  }

  importAll(data: { structures?: StructureAssetJSON[]; enums?: EnumAssetJSON[] }): void {
    if (data.structures) {
      this._structures.clear();
      for (const json of data.structures) {
        const sa = StructureAsset.fromJSON(json);
        this._structures.set(sa.id, sa);
      }
    }
    if (data.enums) {
      this._enums.clear();
      for (const json of data.enums) {
        const ea = EnumAsset.fromJSON(json);
        this._enums.set(ea.id, ea);
      }
    }
    this._emitChanged();
  }

  private _emitChanged(): void {
    for (const cb of this._onChanged) cb();
  }
}
