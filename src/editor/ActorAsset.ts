// ============================================================
//  ActorAsset — UE-style Blueprint Actor Asset
//  A reusable actor template that can be placed in scenes.
//  Wraps BlueprintData + component list + metadata.
// ============================================================

import { BlueprintData, type VarType, type BlueprintVariable, type BlueprintFunction,
  type BlueprintMacro, type BlueprintCustomEvent, type BlueprintStruct,
  type BlueprintStructField, type BlueprintGraphData } from './BlueprintData';

// ---- Physics configuration (UE-style per-component) ----

export type CollisionChannel = 'WorldStatic' | 'WorldDynamic' | 'Pawn' | 'PhysicsBody' | 'Trigger' | 'Custom';

export interface PhysicsConfig {
  /** Master enable — when false the component is purely kinematic */
  enabled: boolean;
  /** Actively simulate physics (rigid-body is dynamic) */
  simulatePhysics: boolean;
  /** Mass in kg */
  mass: number;
  /** Whether gravity affects this body */
  gravityEnabled: boolean;
  /** Multiplier on world gravity */
  gravityScale: number;
  /** Linear velocity damping (drag) */
  linearDamping: number;
  /** Angular velocity damping */
  angularDamping: number;
  /** Surface friction coefficient */
  friction: number;
  /** Bounciness / coefficient of restitution */
  restitution: number;
  /** Lock individual position axes */
  lockPositionX: boolean;
  lockPositionY: boolean;
  lockPositionZ: boolean;
  /** Lock individual rotation axes */
  lockRotationX: boolean;
  lockRotationY: boolean;
  lockRotationZ: boolean;
  /** Enable collision detection */
  collisionEnabled: boolean;
  /** Collision channel preset */
  collisionChannel: CollisionChannel;
}

/** Returns a sensible default PhysicsConfig */
export function defaultPhysicsConfig(): PhysicsConfig {
  return {
    enabled: false,
    simulatePhysics: false,
    mass: 1.0,
    gravityEnabled: true,
    gravityScale: 1.0,
    linearDamping: 0.01,
    angularDamping: 0.05,
    friction: 0.5,
    restitution: 0.3,
    lockPositionX: false,
    lockPositionY: false,
    lockPositionZ: false,
    lockRotationX: false,
    lockRotationY: false,
    lockRotationZ: false,
    collisionEnabled: true,
    collisionChannel: 'WorldDynamic',
  };
}

// ---- Serialized JSON shape for persistence ----

export interface ActorComponentData {
  /** Unique id within this actor */
  id: string;
  type: 'mesh';
  meshType: 'cube' | 'sphere' | 'cylinder' | 'plane';
  /** Display name */
  name: string;
  /** Local offset from actor root */
  offset: { x: number; y: number; z: number };
  /** Local rotation in degrees */
  rotation: { x: number; y: number; z: number };
  /** Local scale */
  scale: { x: number; y: number; z: number };
  /** Per-component physics configuration */
  physics?: PhysicsConfig;
}

export interface ActorAssetJSON {
  actorId: string;
  actorName: string;
  /** Optional description / tooltip */
  description: string;
  /** Root mesh type for the actor */
  rootMeshType: 'cube' | 'sphere' | 'cylinder' | 'plane';
  /** Physics configuration for the root component */
  rootPhysics: PhysicsConfig;
  /** Additional child components (future) */
  components: ActorComponentData[];
  /** Blueprint variables */
  variables: BlueprintVariable[];
  /** Blueprint functions */
  functions: Array<BlueprintFunction>;
  /** Blueprint macros */
  macros: Array<BlueprintMacro>;
  /** Blueprint custom events */
  customEvents: Array<BlueprintCustomEvent>;
  /** Blueprint structs */
  structs: Array<BlueprintStruct>;
  /** Event graph serialized node data */
  eventGraphData: any;
  /** Serialized node data per function graph */
  functionGraphData: Record<string, any>;
  /** Compiled JS code from the node editor */
  compiledCode: string;
  /** Created timestamp */
  createdAt: number;
  /** Last modified timestamp */
  modifiedAt: number;
}

// ---- Runtime ActorAsset class ----

let _assetNextId = 1;
function assetUid(): string {
  return 'actor_' + (_assetNextId++) + '_' + Date.now().toString(36);
}

export class ActorAsset {
  public id: string;
  public name: string;
  public description: string = '';
  public rootMeshType: 'cube' | 'sphere' | 'cylinder' | 'plane' = 'cube';
  public rootPhysics: PhysicsConfig = defaultPhysicsConfig();
  public components: ActorComponentData[] = [];
  public blueprintData: BlueprintData;
  public createdAt: number;
  public modifiedAt: number;

  /**
   * The latest compiled JS code from the node editor.
   * Updated each time the actor's blueprint is compiled in the editor.
   * Used to initialise ScriptComponents on instances at play time.
   */
  public compiledCode: string = '';

  constructor(name: string, id?: string) {
    this.id = id ?? assetUid();
    this.name = name;
    this.blueprintData = new BlueprintData();
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
  }

  /** Mark the asset as modified */
  touch(): void {
    this.modifiedAt = Date.now();
  }

  // ---- Serialization ----

  toJSON(): ActorAssetJSON {
    const bp = this.blueprintData;
    return {
      actorId: this.id,
      actorName: this.name,
      description: this.description,
      rootMeshType: this.rootMeshType,
      rootPhysics: structuredClone(this.rootPhysics),
      components: structuredClone(this.components),
      variables: structuredClone(bp.variables),
      functions: bp.functions.map(f => ({
        ...structuredClone(f),
        graph: { nodeData: f.graph.nodeData ?? null },
      })),
      macros: bp.macros.map(m => ({
        ...structuredClone(m),
        graph: { nodeData: m.graph.nodeData ?? null },
      })),
      customEvents: structuredClone(bp.customEvents),
      structs: structuredClone(bp.structs),
      eventGraphData: bp.eventGraph.nodeData ?? null,
      functionGraphData: Object.fromEntries(
        bp.functions.map(f => [f.id, f.graph.nodeData ?? null]),
      ),
      compiledCode: this.compiledCode,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }

  static fromJSON(json: ActorAssetJSON): ActorAsset {
    const asset = new ActorAsset(json.actorName, json.actorId);
    asset.description = json.description || '';
    asset.rootMeshType = json.rootMeshType || 'cube';
    asset.rootPhysics = json.rootPhysics ? { ...defaultPhysicsConfig(), ...json.rootPhysics } : defaultPhysicsConfig();
    asset.components = (json.components || []).map(c => ({
      ...c,
      physics: c.physics ? { ...defaultPhysicsConfig(), ...c.physics } : undefined,
    }));
    asset.createdAt = json.createdAt || Date.now();
    asset.modifiedAt = json.modifiedAt || Date.now();
    asset.compiledCode = json.compiledCode || '';

    const bp = asset.blueprintData;
    bp.variables = json.variables || [];
    bp.functions = (json.functions || []).map(f => ({
      ...f,
      localVariables: f.localVariables || [],
      graph: { nodeData: json.functionGraphData?.[f.id] ?? f.graph?.nodeData ?? null },
    }));
    bp.macros = json.macros || [];
    bp.customEvents = (json.customEvents || []).map(e => ({
      ...e,
      params: e.params || [],
    }));
    bp.structs = json.structs || [];
    bp.eventGraph = { nodeData: json.eventGraphData ?? null };

    return asset;
  }
}

// ============================================================
//  ActorAssetManager — In-memory asset registry
// ============================================================

type AssetChangeCallback = () => void;

export class ActorAssetManager {
  private _assets: Map<string, ActorAsset> = new Map();
  private _onChanged: AssetChangeCallback[] = [];

  get assets(): ActorAsset[] {
    return Array.from(this._assets.values());
  }

  getAsset(id: string): ActorAsset | undefined {
    return this._assets.get(id);
  }

  createAsset(name: string): ActorAsset {
    const asset = new ActorAsset(name);
    this._assets.set(asset.id, asset);
    this._emitChanged();
    return asset;
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

  /** Notify that asset content changed (e.g. after editing blueprint) */
  notifyAssetChanged(id: string): void {
    const a = this._assets.get(id);
    if (a) a.touch();
    this._emitChanged();
  }

  /** Register listener */
  onChanged(cb: AssetChangeCallback): void {
    this._onChanged.push(cb);
  }

  /** Export all assets as JSON array */
  exportAll(): ActorAssetJSON[] {
    return this.assets.map(a => a.toJSON());
  }

  /** Import assets from JSON array */
  importAll(data: ActorAssetJSON[]): void {
    this._assets.clear();
    for (const json of data) {
      const asset = ActorAsset.fromJSON(json);
      this._assets.set(asset.id, asset);
    }
    this._emitChanged();
  }

  private _emitChanged(): void {
    for (const cb of this._onChanged) cb();
  }
}
