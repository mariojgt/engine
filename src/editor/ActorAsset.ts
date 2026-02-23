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
import type { CharacterPawnConfig, SpringArmConfig, CameraComponentConfig, CharacterRotationConfig, CameraModeSettings, Camera2DConfig } from '../engine/CharacterPawnData';
import { defaultCharacterPawnConfig, defaultSpringArmConfig, defaultCameraConfig, defaultRotationConfig, defaultCameraModeSettings, defaultCamera2DConfig } from '../engine/CharacterPawnData';
import type { ControllerType } from '../engine/Controller';
import { platformer2DTemplate, topDown2DTemplate, characterPawn3DTemplate } from './pretemplates';

// ---- Actor type ----
export type ActorType = 'actor' | 'characterPawn' | 'spectatorPawn' | 'playerController' | 'aiController'
  | 'spriteActor' | 'characterPawn2D' | 'tilemapActor' | 'parallaxLayer';

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

export type CollisionChannel = 'WorldStatic' | 'WorldDynamic' | 'Pawn' | 'PhysicsBody' | 'Trigger' | 'Custom1' | 'Custom2' | 'Custom3' | 'Custom4';
export const ALL_COLLISION_CHANNELS: CollisionChannel[] = ['WorldStatic','WorldDynamic','Pawn','PhysicsBody','Trigger','Custom1','Custom2','Custom3','Custom4'];

export type PhysicsBodyType = 'Static' | 'Dynamic' | 'Kinematic';
export type ColliderShapeType = 'Box' | 'Sphere' | 'Capsule' | 'Cylinder' | 'ConvexHull' | 'Trimesh' | 'None';
export type CombineMode = 'Average' | 'Min' | 'Max' | 'Multiply';

export interface PhysicsConfig {
  /** Master enable — when false the component is purely kinematic */
  enabled: boolean;
  /** Actively simulate physics (rigid-body is dynamic) */
  simulatePhysics: boolean;
  /** Body type: Static / Dynamic / Kinematic */
  bodyType: PhysicsBodyType;
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
  /** Friction combine mode */
  frictionCombine: CombineMode;
  /** Restitution combine mode */
  restitutionCombine: CombineMode;
  /** Collision shape type */
  colliderShape: ColliderShapeType;
  /** Auto fit collider to mesh bounding box */
  autoFitCollider: boolean;
  /** Manual box half extents (when autoFit off + shape=Box) */
  boxHalfExtents: { x: number; y: number; z: number };
  /** Manual sphere radius (when autoFit off + shape=Sphere) */
  sphereRadius: number;
  /** Manual capsule radius */
  capsuleRadius: number;
  /** Manual capsule half height */
  capsuleHalfHeight: number;
  /** Manual cylinder radius */
  cylinderRadius: number;
  /** Manual cylinder half height */
  cylinderHalfHeight: number;
  /** Collider offset from actor pivot */
  colliderOffset: { x: number; y: number; z: number };
  /** If true, no physical response — only overlap events */
  isTrigger: boolean;
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
  /** Which channels this body blocks */
  blocksChannels: CollisionChannel[];
  /** Which channels this body overlaps */
  overlapsChannels: CollisionChannel[];
  /** Enable CCD (continuous collision detection) for fast objects */
  ccdEnabled: boolean;
  /** Generate overlap events */
  generateOverlapEvents: boolean;
  /** Generate hit events */
  generateHitEvents: boolean;
}

/** Returns a sensible default PhysicsConfig */
export function defaultPhysicsConfig(): PhysicsConfig {
  return {
    enabled: false,
    simulatePhysics: false,
    bodyType: 'Dynamic',
    mass: 1.0,
    gravityEnabled: true,
    gravityScale: 1.0,
    linearDamping: 0.0,
    angularDamping: 0.05,
    friction: 0.5,
    restitution: 0.3,
    frictionCombine: 'Average',
    restitutionCombine: 'Average',
    colliderShape: 'Box',
    autoFitCollider: true,
    boxHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    sphereRadius: 0.5,
    capsuleRadius: 0.5,
    capsuleHalfHeight: 1.0,
    cylinderRadius: 0.5,
    cylinderHalfHeight: 0.5,
    colliderOffset: { x: 0, y: 0, z: 0 },
    isTrigger: false,
    lockPositionX: false,
    lockPositionY: false,
    lockPositionZ: false,
    lockRotationX: false,
    lockRotationY: false,
    lockRotationZ: false,
    collisionEnabled: true,
    collisionChannel: 'WorldDynamic',
    blocksChannels: ['WorldStatic','WorldDynamic','Pawn','PhysicsBody'],
    overlapsChannels: ['Trigger'],
    ccdEnabled: false,
    generateOverlapEvents: true,
    generateHitEvents: true,
  };
}

// ---- Serialized JSON shape for persistence ----

export interface ActorComponentData {
  /** Unique id within this actor */
  id: string;
  type: 'mesh' | 'trigger' | 'light' | 'camera' | 'characterMovement' | 'springArm' | 'capsule' | 'skeletalMesh'
    | 'spriteRenderer' | 'rigidbody2d' | 'collider2d' | 'characterMovement2d' | 'tilemap' | 'camera2d';
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
  /** Collision / trigger configuration (for type='trigger' or type='mesh') */
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
  // ── 2D-specific fields ──
  /** Sprite sheet asset ID (for type='spriteRenderer') */
  spriteSheetId?: string;
  /** Default sprite name (for type='spriteRenderer') */
  defaultSprite?: string;
  /** Sorting layer name (for 2D actors) */
  sortingLayer?: string;
  /** Order within sorting layer */
  orderInLayer?: number;
  /** Flip sprite horizontally (for type='spriteRenderer') */
  flipX?: boolean;
  /** Flip sprite vertically (for type='spriteRenderer') */
  flipY?: boolean;
  /** Sprite visual scale multiplier (for type='spriteRenderer') — default {x:1,y:1} */
  spriteScale?: { x: number; y: number };
  /** Sprite visual offset in world units (for type='spriteRenderer') — default {x:0,y:0} */
  spriteOffset?: { x: number; y: number };
  /** 2D Animation Blueprint asset ID (for type='spriteRenderer') */
  animBlueprint2dId?: string;
  /** 2D collider shape (for type='collider2d') */
  collider2dShape?: 'box' | 'circle' | 'capsule';
  /** 2D collider dimensions */
  collider2dSize?: { width: number; height: number };
  collider2dRadius?: number;
  /** When true, acts as a sensor/trigger (no physical response, fires overlap events) */
  isTrigger?: boolean;
  /** 2D rigid body type (for type='rigidbody2d') */
  rigidbody2dType?: 'dynamic' | 'static' | 'kinematic';
  /** Tilemap asset ID (for type='tilemap') */
  tilemapAssetId?: string;
  /** Tileset asset ID (for type='tilemap') */
  tilesetAssetId?: string;
  /** Camera 2D configuration (for type='camera2d' on characterPawn2D) */
  camera2dConfig?: Camera2DConfig;
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
  // ── 2D-specific fields ──
  /** Scene mode this actor was designed for */
  sceneMode?: '2D' | '3D';
  /** Sprite sheet ID for 2D actors */
  spriteSheetId?: string;
  /** Default sprite name for 2D actors */
  defaultSprite?: string;
  /** Sorting layer for 2D actors */
  sortingLayer?: string;
  /** Order in sorting layer */
  orderInLayer?: number;
  /** Character movement 2D configuration */
  characterMovement2DConfig?: any;
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

let _compNextId = 1;
function compUid(): string {
  return 'comp_' + (_compNextId++) + '_' + Math.random().toString(36).slice(2, 6);
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

  /** Character Movement 2D configuration (only when actorType === 'characterPawn2D') */
  public characterMovement2DConfig: any = null;

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
    const json: ActorAssetJSON = {
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
      characterMovement2DConfig: this.characterMovement2DConfig ? structuredClone(this.characterMovement2DConfig) : undefined,
      controllerClass: this.controllerClass,
      controllerBlueprintId: this.controllerBlueprintId || undefined,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };

    // Include inheritance metadata if present
    const inhData = (this as any)._inheritance;
    if (inhData) {
      (json as any)._inheritance = structuredClone(inhData);
    }

    return json;
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
    asset.characterMovement2DConfig = json.characterMovement2DConfig
      ? structuredClone(json.characterMovement2DConfig)
      : null;
    asset.rootPhysics = json.rootPhysics ? { ...defaultPhysicsConfig(), ...json.rootPhysics } : defaultPhysicsConfig();
    asset.components = (json.components || []).map(c => ({
      ...c,
      physics: c.physics ? { ...defaultPhysicsConfig(), ...c.physics } : undefined,
      collision: c.collision ? { ...defaultCollisionConfig(), ...c.collision } : undefined,
      light: c.light ? { ...defaultLightConfig(c.light.lightType), ...c.light } : undefined,
      springArm: c.springArm ? { ...defaultSpringArmConfig(), ...c.springArm } : undefined,
      camera: c.camera ? { ...defaultCameraConfig(c.camera.cameraMode), ...c.camera } : undefined,
      camera2dConfig: c.camera2dConfig ? { ...defaultCamera2DConfig(), ...c.camera2dConfig } : undefined,
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

    // Restore inheritance metadata if present
    if ((json as any)._inheritance) {
      (asset as any)._inheritance = structuredClone((json as any)._inheritance);
    }

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

  createAsset(name: string, actorType: ActorType = 'actor', preset2D?: 'platformer' | 'topdown' | 'blank'): ActorAsset {
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

      // Pre-populate event graph from 3D character pawn pretemplate
      asset.blueprintData.eventGraph = structuredClone(characterPawn3DTemplate.eventGraph);
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
    // ── Character Pawn 2D — preset-based blueprint graphs ──
    if (actorType === 'characterPawn2D') {
      asset.rootMeshType = 'none';

      // Default 2D components: sprite renderer, rigidbody, collider, character movement
      const spriteId = 'comp_sprite_' + Date.now().toString(36);
      const rb2dId = 'comp_rb2d_' + Date.now().toString(36);
      const col2dId = 'comp_col2d_' + Date.now().toString(36);
      const cm2dId = 'comp_cm2d_' + Date.now().toString(36);
      asset.components = [
        {
          id: spriteId,
          type: 'spriteRenderer' as any,
          meshType: 'cube',
          name: 'SpriteRenderer',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        {
          id: rb2dId,
          type: 'rigidbody2d' as any,
          meshType: 'cube',
          name: 'RigidBody2D',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rigidbody2dType: 'dynamic',
        },
        {
          id: col2dId,
          type: 'collider2d' as any,
          meshType: 'cube',
          name: 'BoxCollider2D',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          collider2dShape: 'box',
          collider2dSize: { width: 0.8, height: 1.0 },
        },
        {
          id: cm2dId,
          type: 'characterMovement2d' as any,
          meshType: 'cube',
          name: 'CharacterMovement2D',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      ];

      if (preset2D === 'platformer') {
        // Platformer: horizontal movement (A/D), jump (Space), gravity enabled, flip sprite
        asset.blueprintData.eventGraph = structuredClone(platformer2DTemplate.eventGraph);

        // Platformer physics defaults (from pretemplate)
        asset.characterMovement2DConfig = { ...platformer2DTemplate.movementConfig };

        // Add built-in Camera 2D component so users can tweak FOV/zoom in the Actor Editor
        const cam2dComp: ActorComponentData = {
          id: compUid(),
          type: 'camera2d',
          meshType: 'cube',
          name: 'Camera2D',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          hiddenInGame: true,
          camera2dConfig: defaultCamera2DConfig(),
        };
        asset.components.push(cam2dComp);

      } else if (preset2D === 'topdown') {
        // Top-down: 4-directional movement (WASD), no gravity, no jump.
        // Gravity is disabled via characterMovement2DConfig.gravityScale = 0
        // which is applied at spawn time on the rigid body.
        asset.blueprintData.eventGraph = structuredClone(topDown2DTemplate.eventGraph);

        // Top-down physics defaults (from pretemplate)
        asset.characterMovement2DConfig = { ...topDown2DTemplate.movementConfig };

        // Add built-in Camera 2D component
        const cam2dCompTD: ActorComponentData = {
          id: compUid(),
          type: 'camera2d',
          meshType: 'cube',
          name: 'Camera2D',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          hiddenInGame: true,
          camera2dConfig: defaultCamera2DConfig(),
        };
        asset.components.push(cam2dCompTD);

      } else {
        // Blank: just BeginPlay + Tick
        asset.blueprintData.eventGraph = {
          nodeData: {
            nodes: [
              { id: 'b_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 }, data: {} },
              { id: 'b_tick',      type: 'EventTickNode',      position: { x: 80, y: 220 }, data: {} },
            ],
            connections: [],
          },
        };
        // Add built-in Camera 2D component for blank preset too
        const cam2dCompBlank: ActorComponentData = {
          id: compUid(),
          type: 'camera2d',
          meshType: 'cube',
          name: 'Camera2D',
          offset: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          hiddenInGame: true,
          camera2dConfig: defaultCamera2DConfig(),
        };
        asset.components.push(cam2dCompBlank);
      }
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
