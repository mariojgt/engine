// ============================================================
//  ActorAsset — UE-style Blueprint Actor Asset
//  A reusable actor template that can be placed in scenes.
//  Wraps BlueprintData + component list + metadata.
// ============================================================

import { BlueprintData, type VarType, type BlueprintVariable, type BlueprintFunction,
  type BlueprintMacro, type BlueprintCustomEvent, type BlueprintStruct,
  type BlueprintStructField, type BlueprintGraphData } from './BlueprintData';
import type { CollisionConfig } from '../engine/CollisionTypes';
import { defaultCollisionConfig } from '../engine/CollisionTypes';
import type { CharacterPawnConfig, SpringArmConfig, CameraComponentConfig, CharacterRotationConfig, CameraModeSettings } from '../engine/CharacterPawnData';
import { defaultCharacterPawnConfig, defaultSpringArmConfig, defaultCameraConfig, defaultRotationConfig, defaultCameraModeSettings } from '../engine/CharacterPawnData';
import type { ControllerType } from '../engine/Controller';

// ---- Actor type ----
export type ActorType = 'actor' | 'characterPawn' | 'spectatorPawn' | 'playerController' | 'aiController';

// ---- Light component configuration ----

export type LightType = 'directional' | 'point' | 'spot' | 'ambient' | 'hemisphere';

export interface LightConfig {
  lightType: LightType;
  enabled: boolean;
  color: string;            // hex e.g. '#ffffff'
  intensity: number;
  // Point / Spot
  distance: number;
  decay: number;
  // Spot only
  angle: number;            // radians
  penumbra: number;         // 0-1
  // Directional / Spot target
  target: { x: number; y: number; z: number };
  // Hemisphere
  groundColor: string;      // hex
  // Shadows
  castShadow: boolean;
  shadowMapSize: number;    // e.g. 512, 1024, 2048
  shadowBias: number;
}

export function defaultLightConfig(lightType: LightType = 'point'): LightConfig {
  return {
    lightType,
    enabled: true,
    color: '#ffffff',
    intensity: 1.0,
    distance: 20,
    decay: 2,
    angle: Math.PI / 6,     // 30 degrees
    penumbra: 0.2,
    target: { x: 0, y: 0, z: 0 },
    groundColor: '#8b4513',
    castShadow: true,
    shadowMapSize: 1024,
    shadowBias: -0.0001,
  };
}

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
  type: 'mesh' | 'trigger' | 'light' | 'camera' | 'characterMovement' | 'springArm' | 'capsule' | 'skeletalMesh';
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
  /** Collision / trigger configuration (for type='trigger') */
  collision?: CollisionConfig;
  /** Light configuration (for type='light') */
  light?: LightConfig;
  /** Spring Arm configuration (for type='springArm') */
  springArm?: SpringArmConfig;
  /** Camera configuration (for type='camera') */
  camera?: CameraComponentConfig;
  /** Parent component id (for nesting under spring arm, etc.) */
  parentId?: string;
  /** When true, this component mesh is hidden at runtime (default: true for capsule/springArm/camera/characterMovement) */
  hiddenInGame?: boolean;
  /** If set, this component uses an imported 3D mesh asset instead of a primitive */
  customMeshAssetId?: string;
  /** Skeletal Mesh configuration (for type='skeletalMesh') */
  skeletalMesh?: SkeletalMeshConfig;
  /** Per-slot material overrides: maps slot index (as string) → MaterialAssetJSON.assetId */
  materialOverrides?: Record<string, string>;
}

/** Configuration for skeletal mesh components */
export interface SkeletalMeshConfig {
  /** The mesh asset ID (references MeshAssetManager) */
  meshAssetId: string;
  /** Current animation name to play (empty = none) */
  animationName: string;
  /** Whether the animation should loop */
  loopAnimation: boolean;
  /** Animation playback speed multiplier */
  animationSpeed: number;
  /** Enforce skeleton compatibility checks at runtime */
  strictSkeletonMatching?: boolean;
  /** Animation Blueprint asset ID (when set, overrides animationName) */
  animationBlueprintId?: string;
}

export interface ActorAssetJSON {
  actorId: string;
  actorName: string;
  /** Actor type — 'actor' (default) or 'characterPawn' */
  actorType?: ActorType;
  /** Optional description / tooltip */
  description: string;
  /** Root mesh type for the actor */
  rootMeshType: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'none';
  /** If set, the root uses an imported mesh asset instead of a primitive */
  rootCustomMeshAssetId?: string;
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
  /** Character Pawn configuration (only when actorType === 'characterPawn') */
  characterPawnConfig?: CharacterPawnConfig;
  /** Controller class: 'PlayerController' | 'AIController' | 'None' */
  controllerClass?: ControllerType;
  /** ID of a controller blueprint asset to use (overrides controllerClass) */
  controllerBlueprintId?: string;
  /** Per-slot material overrides for the root mesh: maps slot index (as string) → MaterialAssetJSON.assetId */
  rootMaterialOverrides?: Record<string, string>;
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
  public actorType: ActorType = 'actor';
  public description: string = '';
  public rootMeshType: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'none' = 'cube';
  /** When set, root uses an imported mesh asset instead of a primitive */
  public rootCustomMeshAssetId: string = '';
  /** Per-slot material overrides for the root mesh: maps slot index (as string) → MaterialAssetJSON.assetId */
  public rootMaterialOverrides: Record<string, string> = {};
  public rootPhysics: PhysicsConfig = defaultPhysicsConfig();
  public components: ActorComponentData[] = [];
  public blueprintData: BlueprintData;
  public createdAt: number;
  public modifiedAt: number;
  /** Character Pawn configuration (only when actorType === 'characterPawn') */
  public characterPawnConfig: CharacterPawnConfig | null = null;

  /**
   * Which controller class this pawn uses at play time.
   * 'PlayerController' (default for characterPawn), 'AIController', or 'None'.
   */
  public controllerClass: ControllerType = 'None';

  /**
   * Optional: ID of a controller blueprint asset.
   * When set, this overrides controllerClass and the controller's
   * blueprint script runs alongside the pawn at play time.
   */
  public controllerBlueprintId: string = '';

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
      actorType: this.actorType,
      description: this.description,
      rootMeshType: this.rootMeshType,
      rootCustomMeshAssetId: this.rootCustomMeshAssetId || undefined,
      rootMaterialOverrides: Object.keys(this.rootMaterialOverrides).length > 0
        ? structuredClone(this.rootMaterialOverrides) : undefined,
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
      characterPawnConfig: this.characterPawnConfig ? structuredClone(this.characterPawnConfig) : undefined,
      controllerClass: this.controllerClass,
      controllerBlueprintId: this.controllerBlueprintId || undefined,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }

  static fromJSON(json: ActorAssetJSON): ActorAsset {
    const asset = new ActorAsset(json.actorName, json.actorId);
    asset.actorType = json.actorType || 'actor';
    asset.controllerClass = json.controllerClass || 'None';
    asset.controllerBlueprintId = json.controllerBlueprintId || '';
    asset.description = json.description || '';
    asset.rootMeshType = json.rootMeshType || 'cube';
    asset.rootCustomMeshAssetId = json.rootCustomMeshAssetId || '';
    asset.rootMaterialOverrides = json.rootMaterialOverrides ? structuredClone(json.rootMaterialOverrides) : {};
    asset.characterPawnConfig = json.characterPawnConfig
      ? {
          ...defaultCharacterPawnConfig(),
          ...json.characterPawnConfig,
          rotation: json.characterPawnConfig.rotation
            ? { ...defaultRotationConfig(), ...json.characterPawnConfig.rotation }
            : defaultRotationConfig(),
          cameraSettings: json.characterPawnConfig.cameraSettings
            ? { ...defaultCameraModeSettings(), ...json.characterPawnConfig.cameraSettings }
            : defaultCameraModeSettings(),
        }
      : null;
    asset.rootPhysics = json.rootPhysics ? { ...defaultPhysicsConfig(), ...json.rootPhysics } : defaultPhysicsConfig();
    asset.components = (json.components || []).map(c => ({
      ...c,
      physics: c.physics ? { ...defaultPhysicsConfig(), ...c.physics } : undefined,
      collision: c.collision ? { ...defaultCollisionConfig(), ...c.collision } : undefined,
      light: c.light ? { ...defaultLightConfig(c.light.lightType), ...c.light } : undefined,
      springArm: c.springArm ? { ...defaultSpringArmConfig(), ...c.springArm } : undefined,
      camera: c.camera ? { ...defaultCameraConfig(c.camera.cameraMode), ...c.camera } : undefined,
      skeletalMesh: c.skeletalMesh
        ? { strictSkeletonMatching: false, ...c.skeletalMesh }
        : undefined,
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

  createAsset(name: string, actorType: ActorType = 'actor'): ActorAsset {
    const asset = new ActorAsset(name);
    asset.actorType = actorType;
    if (actorType === 'characterPawn') {
      asset.rootMeshType = 'none';
      asset.controllerClass = 'PlayerController';   // default for character pawns
      asset.characterPawnConfig = defaultCharacterPawnConfig();
      // Create default pawn component hierarchy: Capsule → SpringArm → Camera
      const capsuleId = 'comp_cap_' + Date.now().toString(36);
      const springArmId = 'comp_sa_' + Date.now().toString(36);
      const cameraId = 'comp_cam_' + Date.now().toString(36);
      asset.components = [
        {
          id: capsuleId,
          type: 'capsule',
          meshType: 'cube',
          name: 'CapsuleComponent',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: springArmId,
          type: 'springArm',
          meshType: 'cube',
          name: 'SpringArm',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          springArm: defaultSpringArmConfig(),
          parentId: capsuleId,
        },
        {
          id: cameraId,
          type: 'camera',
          meshType: 'cube',
          name: 'Camera',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          camera: defaultCameraConfig('thirdPerson'),
          parentId: springArmId,
        },
        {
          id: 'comp_move_' + Date.now().toString(36),
          type: 'characterMovement',
          meshType: 'cube',
          name: 'CharacterMovement',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      ];

      // Pre-populate event graph with full movement logic (UE-style)
      // The graph provides: EventBeginPlay, EventTick → AddMovementInput,
      // InputAxis nodes for WASD, and InputKeyEvent(Space) → Jump / StopJumping
      asset.blueprintData.eventGraph = {
        nodeData: {
          nodes: [
            // ── Starter event ──
            { id: 'def_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 }, data: {} },

            // ── Tick → movement ──
            { id: 'def_tick', type: 'EventTickNode', position: { x: 80, y: 220 }, data: {} },
            { id: 'def_move', type: 'AddMovementInputNode', position: { x: 520, y: 220 }, data: {} },

            // ── Axis nodes (output Number: +1 / -1 / 0) ──
            { id: 'def_axis_lr', type: 'InputAxisNode', position: { x: 200, y: 400 }, data: { positiveKey: 'D', negativeKey: 'A' } },
            { id: 'def_axis_fb', type: 'InputAxisNode', position: { x: 200, y: 530 }, data: { positiveKey: 'W', negativeKey: 'S' } },

            // ── Jump: Space key ──
            { id: 'def_jump_key', type: 'InputKeyEventNode', position: { x: 80, y: 700 }, data: { selectedKey: 'Space' } },
            { id: 'def_jump', type: 'JumpNode', position: { x: 460, y: 680 }, data: {} },
            { id: 'def_stopjump', type: 'StopJumpingNode', position: { x: 460, y: 780 }, data: {} },
          ],
          connections: [
            // Tick → AddMovementInput exec
            { id: 'c1', source: 'def_tick', sourceOutput: 'exec', target: 'def_move', targetInput: 'exec' },
            // InputAxis D/A → X
            { id: 'c2', source: 'def_axis_lr', sourceOutput: 'value', target: 'def_move', targetInput: 'x' },
            // InputAxis W/S → Z (forward/back)
            { id: 'c3', source: 'def_axis_fb', sourceOutput: 'value', target: 'def_move', targetInput: 'z' },
            // Space pressed → Jump
            { id: 'c4', source: 'def_jump_key', sourceOutput: 'pressed', target: 'def_jump', targetInput: 'exec' },
            // Space released → StopJumping
            { id: 'c5', source: 'def_jump_key', sourceOutput: 'released', target: 'def_stopjump', targetInput: 'exec' },
          ],
        },
      };
    }
    if (actorType === 'spectatorPawn') {
      asset.rootMeshType = 'none';
      // Spectator pawn is a simple free-flying camera with no components needed
    }
    if (actorType === 'playerController') {
      asset.rootMeshType = 'none';
      asset.controllerClass = 'PlayerController';
      // Start with an empty Event Graph containing a BeginPlay event
      asset.blueprintData.eventGraph = {
        nodeData: {
          nodes: [
            { id: 'def_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 }, data: {} },
            { id: 'def_tick', type: 'EventTickNode', position: { x: 80, y: 220 }, data: {} },
          ],
          connections: [],
        },
      };
    }
    if (actorType === 'aiController') {
      asset.rootMeshType = 'none';
      asset.controllerClass = 'AIController';
      // Start with an empty Event Graph containing a BeginPlay event
      asset.blueprintData.eventGraph = {
        nodeData: {
          nodes: [
            { id: 'def_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 }, data: {} },
            { id: 'def_tick', type: 'EventTickNode', position: { x: 80, y: 220 }, data: {} },
          ],
          connections: [],
        },
      };
    }
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
