// ============================================================
//  SaveGameAsset — UE-style Save Game class definitions
//
//  Equivalent to creating a "SaveGame" Blueprint in Unreal Engine.
//  Users define the variables (fields) they want to save, with
//  types, defaults, and categories.
//
//  At runtime, when a "Create Save Game Object" blueprint node
//  references one of these classes, the SaveGameObject is
//  pre-populated with the defined default values.
//
//  Stored in Content Browser under "SaveGames" folder on disk.
// ============================================================

import type { VarType } from './BlueprintData';
import { defaultForVarType } from './StructureAsset';

// ---- Interfaces ----

export interface SaveGameFieldDef {
  /** Unique id within this save game class */
  id: string;
  /** Variable name (identifier) */
  name: string;
  /** Variable type */
  type: VarType;
  /** Default value */
  defaultValue: any;
  /** Category (for grouping in the editor) */
  category: string;
  /** Optional tooltip / description */
  tooltip: string;
  /** Display order */
  sortOrder: number;
}

export interface SaveGameAssetJSON {
  saveGameId: string;
  saveGameName: string;
  description: string;
  fields: SaveGameFieldDef[];
  createdAt: number;
  modifiedAt: number;
}

// ---- UID helpers ----

let _nextSGId = 1;
function sgUid(): string {
  return 'savegame_' + (_nextSGId++) + '_' + Date.now().toString(36);
}

let _nextSGFieldId = 1;
function sgFieldUid(): string {
  return 'sgf_' + (_nextSGFieldId++) + '_' + Math.random().toString(36).slice(2, 6);
}

// ---- Runtime Class ----

/**
 * A Save Game class definition — defines which variables are stored.
 * Equivalent to a USaveGame Blueprint in UE.
 */
export class SaveGameAsset {
  public id: string;
  public name: string;
  public description: string = '';
  public fields: SaveGameFieldDef[] = [];
  public createdAt: number;
  public modifiedAt: number;

  constructor(name: string, id?: string) {
    this.id = id ?? sgUid();
    this.name = name;
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
  }

  touch(): void {
    this.modifiedAt = Date.now();
  }

  addField(name: string, type: VarType = 'Float', category: string = 'Default'): SaveGameFieldDef {
    const f: SaveGameFieldDef = {
      id: sgFieldUid(),
      name,
      type,
      defaultValue: defaultForVarType(type),
      category,
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

  getField(fieldId: string): SaveGameFieldDef | undefined {
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

  /** Get categories used by fields, in order of first appearance */
  getCategories(): string[] {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const f of this.fields) {
      if (!seen.has(f.category)) {
        seen.add(f.category);
        cats.push(f.category);
      }
    }
    return cats;
  }

  /** Get a map of default values for populating a SaveGameObject at runtime */
  getDefaults(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const f of this.fields) {
      result[f.name] = f.defaultValue;
    }
    return result;
  }

  toJSON(): SaveGameAssetJSON {
    return {
      saveGameId: this.id,
      saveGameName: this.name,
      description: this.description,
      fields: structuredClone(this.fields),
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }

  static fromJSON(json: SaveGameAssetJSON): SaveGameAsset {
    const sa = new SaveGameAsset(json.saveGameName, json.saveGameId);
    sa.description = json.description || '';
    sa.fields = (json.fields || []).map((f, i) => ({
      id: f.id || sgFieldUid(),
      name: f.name,
      type: f.type,
      defaultValue: f.defaultValue ?? defaultForVarType(f.type),
      category: f.category || 'Default',
      tooltip: f.tooltip || '',
      sortOrder: f.sortOrder ?? i,
    }));
    sa.createdAt = json.createdAt || Date.now();
    sa.modifiedAt = json.modifiedAt || Date.now();
    return sa;
  }
}

// ============================================================
//  SaveGameAssetManager — In-memory registry
// ============================================================

type ChangeCallback = () => void;

export class SaveGameAssetManager {
  private _assets: Map<string, SaveGameAsset> = new Map();
  private _onChanged: ChangeCallback[] = [];

  get assets(): SaveGameAsset[] {
    return Array.from(this._assets.values());
  }

  getAsset(id: string): SaveGameAsset | undefined {
    return this._assets.get(id);
  }

  getAssetByName(name: string): SaveGameAsset | undefined {
    return this.assets.find(a => a.name === name);
  }

  createAsset(name: string): SaveGameAsset {
    const sa = new SaveGameAsset(name);
    this._assets.set(sa.id, sa);
    this._emitChanged();
    return sa;
  }

  removeAsset(id: string): void {
    this._assets.delete(id);
    this._emitChanged();
  }

  renameAsset(id: string, newName: string): void {
    const a = this._assets.get(id);
    if (a) {
      a.name = newName;
      a.touch();
      this._emitChanged();
    }
  }

  notifyChanged(id: string): void {
    const a = this._assets.get(id);
    if (a) a.touch();
    this._emitChanged();
  }

  // ---- Change callback ----

  onChanged(cb: ChangeCallback): void {
    this._onChanged.push(cb);
  }

  // ---- Export / Import ----

  exportAll(): SaveGameAssetJSON[] {
    return this.assets.map(a => a.toJSON());
  }

  importAll(data: SaveGameAssetJSON[]): void {
    this._assets.clear();
    for (const json of data) {
      const a = SaveGameAsset.fromJSON(json);
      this._assets.set(a.id, a);
    }
    this._emitChanged();
  }

  private _emitChanged(): void {
    for (const cb of this._onChanged) cb();
  }
}
