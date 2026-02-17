// ============================================================
//  GameInstanceData — UE-style Game Instance Blueprint Asset
//  A persistent object that survives scene loads, providing
//  shared variables and an event graph that runs at runtime.
//
//  Pattern: JSON interface + runtime class + Manager,
//  identical to AnimBlueprintData / WidgetBlueprintData.
// ============================================================

import { BlueprintData, type BlueprintGraphData } from './BlueprintData';

// ---- Unique ID helper ----
let _uid = 0;
function giUid(): string {
  return 'gi_' + Date.now().toString(36) + '_' + (++_uid).toString(36);
}

// ---- Game Instance Blueprint JSON (persistence) ----

export interface GameInstanceBlueprintJSON {
  gameInstanceVersion?: number;
  gameInstanceId: string;
  gameInstanceName: string;
  /** Event Graph node data (Rete-style, same format as actor blueprint graphs) */
  eventGraph: BlueprintGraphData | null;
  /** Compiled JS code from the event graph */
  compiledCode?: string;
  /** Serialized Rete node graph for the event graph editor */
  blueprintGraphNodeData?: any;
}

// ---- Game Instance Blueprint Asset Class ----

export class GameInstanceBlueprintAsset {
  public id: string;
  public name: string;
  public eventGraph: BlueprintGraphData | null;

  /** BlueprintData for the event graph Rete editor (variables, functions, graph data) */
  public blueprintData: BlueprintData;
  /** Compiled JS code string from the event graph (stored for runtime execution) */
  public compiledCode: string = '';

  private _dirty = false;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.eventGraph = null;

    // Create BlueprintData for the event graph Rete editor
    this.blueprintData = new BlueprintData();
  }

  touch(): void {
    this._dirty = true;
  }

  toJSON(): GameInstanceBlueprintJSON {
    return {
      gameInstanceVersion: 1,
      gameInstanceId: this.id,
      gameInstanceName: this.name,
      eventGraph: this.eventGraph ? structuredClone(this.eventGraph) : null,
      compiledCode: this.compiledCode,
      blueprintGraphNodeData: this.blueprintData.eventGraph.nodeData ?? null,
    };
  }

  static fromJSON(json: GameInstanceBlueprintJSON): GameInstanceBlueprintAsset {
    const asset = new GameInstanceBlueprintAsset(json.gameInstanceId, json.gameInstanceName);
    asset.eventGraph = json.eventGraph ?? null;
    asset.compiledCode = json.compiledCode ?? '';

    // Restore blueprint graph node data
    if (json.blueprintGraphNodeData) {
      asset.blueprintData.eventGraph.nodeData = json.blueprintGraphNodeData;
    }

    return asset;
  }
}

// ---- Game Instance Blueprint Asset Manager ----

export class GameInstanceBlueprintManager {
  private _assets: Map<string, GameInstanceBlueprintAsset> = new Map();
  private _listeners: Array<() => void> = [];

  /** Global singleton instance for static access */
  private static _instance: GameInstanceBlueprintManager | null = null;

  constructor() {
    GameInstanceBlueprintManager._instance = this;
  }

  /** Get the singleton instance */
  static get instance(): GameInstanceBlueprintManager | null {
    return GameInstanceBlueprintManager._instance;
  }

  /** Static accessor for looking up a Game Instance asset from anywhere */
  static getAsset(id: string): GameInstanceBlueprintAsset | undefined {
    return GameInstanceBlueprintManager._instance?.getAsset(id);
  }

  get assets(): GameInstanceBlueprintAsset[] {
    return Array.from(this._assets.values());
  }

  getAsset(id: string): GameInstanceBlueprintAsset | undefined {
    return this._assets.get(id);
  }

  createAsset(name: string): GameInstanceBlueprintAsset {
    const id = giUid();
    const asset = new GameInstanceBlueprintAsset(id, name);
    this._assets.set(id, asset);
    this._notify();
    return asset;
  }

  removeAsset(id: string): void {
    this._assets.delete(id);
    this._notify();
  }

  renameAsset(id: string, newName: string): void {
    const asset = this._assets.get(id);
    if (asset) {
      asset.name = newName;
      asset.touch();
      this._notify();
    }
  }

  notifyAssetChanged(id?: string): void {
    this._notify();
  }

  exportAll(): GameInstanceBlueprintJSON[] {
    return this.assets.map(a => a.toJSON());
  }

  importAll(jsonArr: GameInstanceBlueprintJSON[]): void {
    this._assets.clear();
    for (const json of jsonArr) {
      const asset = GameInstanceBlueprintAsset.fromJSON(json);
      this._assets.set(asset.id, asset);
    }
    this._notify();
  }

  clear(): void {
    this._assets.clear();
    this._notify();
  }

  onChanged(cb: () => void): void {
    this._listeners.push(cb);
  }

  private _notify(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[GameInstanceBlueprintManager] listener error:', e); }
    }
  }
}
