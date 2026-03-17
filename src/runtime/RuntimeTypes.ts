// ============================================================
//  RuntimeTypes — Shared type definitions extracted from editor
//
//  These types were previously defined in editor modules and
//  imported by engine modules, creating a hard coupling.
//  Now they live here in the runtime layer, importable by both
//  engine and editor without circular dependencies.
// ============================================================

// ── Actor Types ─────────────────────────────────────────────

export type ActorType =
  | 'actor'
  | 'characterPawn'
  | 'spectatorPawn'
  | 'playerController'
  | 'aiController'
  | 'spriteActor'
  | 'characterPawn2D'
  | 'tilemapActor'
  | 'parallaxLayer';

// ── Physics Types ───────────────────────────────────────────

export type PhysicsBodyType = 'static' | 'dynamic' | 'kinematic';
export type ColliderShapeType = 'box' | 'sphere' | 'capsule' | 'cylinder' | 'convexHull' | 'triangleMesh';
export type CombineMode = 'average' | 'min' | 'multiply' | 'max';

export type CollisionChannel =
  | 'Default'
  | 'WorldStatic'
  | 'WorldDynamic'
  | 'Pawn'
  | 'Projectile'
  | 'Custom1'
  | 'Custom2'
  | 'Custom3';

export type CollisionResponse = 'block' | 'overlap' | 'ignore';

export interface CollisionConfig {
  objectType: CollisionChannel;
  responses: Record<CollisionChannel, CollisionResponse>;
}

export interface PhysicsConfig {
  /** Master on/off for the physics component */
  enabled: boolean;
  simulatePhysics: boolean;
  bodyType: PhysicsBodyType;
  mass: number;
  /** Whether gravity affects this body */
  gravityEnabled: boolean;
  linearDamping: number;
  angularDamping: number;
  friction: number;
  restitution: number;
  frictionCombine: CombineMode;
  restitutionCombine: CombineMode;
  colliderShape: ColliderShapeType;
  /** Auto-fit collider to mesh bounding box */
  autoFitCollider: boolean;
  /** Manual box half extents (when autoFit off + shape=Box) */
  boxHalfExtents: { x: number; y: number; z: number };
  /** @deprecated Use boxHalfExtents instead */
  boxExtents?: { x: number; y: number; z: number };
  sphereRadius: number;
  capsuleRadius: number;
  capsuleHalfHeight: number;
  cylinderRadius: number;
  cylinderHalfHeight: number;
  colliderOffset: { x: number; y: number; z: number };
  colliderRotation: { x: number; y: number; z: number };
  gravityScale: number;
  lockPositionX: boolean;
  lockPositionY: boolean;
  lockPositionZ: boolean;
  lockRotationX: boolean;
  lockRotationY: boolean;
  lockRotationZ: boolean;
  autoMass: boolean;
  ccdEnabled: boolean;
  /** Enable collision detection */
  collisionEnabled: boolean;
  /** Collision channel preset */
  collisionChannel?: string;
  /** Which channels this body blocks */
  blocksChannels?: string[];
  /** Which channels this body overlaps */
  overlapsChannels?: string[];
  enableOverlapEvents: boolean;
  enableHitEvents: boolean;
  /** Generate overlap events (alias) */
  generateOverlapEvents?: boolean;
  /** Generate hit events (alias) */
  generateHitEvents?: boolean;
  /** Collision channels */
  collision?: CollisionConfig;
  /** Sensor/trigger mode (no physics response, only events) */
  isTrigger?: boolean;
}

export const defaultPhysicsConfig: PhysicsConfig = {
  enabled: false,
  simulatePhysics: false,
  bodyType: 'static',
  mass: 1,
  gravityEnabled: true,
  linearDamping: 0.01,
  angularDamping: 0.05,
  friction: 0.5,
  restitution: 0.3,
  frictionCombine: 'average',
  restitutionCombine: 'average',
  colliderShape: 'box',
  autoFitCollider: true,
  boxHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
  sphereRadius: 0.5,
  capsuleRadius: 0.3,
  capsuleHalfHeight: 0.5,
  cylinderRadius: 0.3,
  cylinderHalfHeight: 0.5,
  colliderOffset: { x: 0, y: 0, z: 0 },
  colliderRotation: { x: 0, y: 0, z: 0 },
  gravityScale: 1,
  lockPositionX: false,
  lockPositionY: false,
  lockPositionZ: false,
  lockRotationX: false,
  lockRotationY: false,
  lockRotationZ: false,
  autoMass: false,
  ccdEnabled: false,
  collisionEnabled: true,
  enableOverlapEvents: false,
  enableHitEvents: false,
};

// ── Light Types ─────────────────────────────────────────────

export type LightType = 'directional' | 'point' | 'spot' | 'hemisphere' | 'area';

export interface LightConfig {
  lightType: LightType;
  enabled: boolean;
  color: string;
  intensity: number;
  // Point / Spot
  distance: number;
  decay: number;
  // Spot only
  angle: number;
  penumbra: number;
  // Directional / Spot target
  target: { x: number; y: number; z: number };
  // Hemisphere
  groundColor: string;
  // Shadows
  castShadow: boolean;
  shadowMapSize: number;
  shadowBias: number;
}

/** Creates a default LightConfig for the given light type. */
export function defaultLightConfig(lightType: LightType = 'point'): LightConfig {
  return {
    lightType,
    enabled: true,
    color: '#ffffff',
    intensity: 1.0,
    distance: 20,
    decay: 2,
    angle: Math.PI / 6,
    penumbra: 0.2,
    target: { x: 0, y: 0, z: 0 },
    groundColor: '#8b4513',
    castShadow: true,
    shadowMapSize: 1024,
    shadowBias: -0.0001,
  };
}

// ── Component Types ─────────────────────────────────────────

export type ActorComponentType =
  | 'mesh'
  | 'trigger'
  | 'light'
  | 'camera'
  | 'characterMovement'
  | 'springArm'
  | 'spriteRenderer'
  | 'rigidbody2d'
  | 'collider2d'
  | 'characterMovement2d'
  | 'tilemap'
  | 'camera2d'
  | 'navMeshBounds'
  | 'audio'
  | 'particle'
  | 'skeletal'
  | 'projectileMovement';

export interface ActorComponentData {
  type: ActorComponentType;
  name: string;
  /** Parent component name for attachment hierarchy */
  parentName?: string;
  /** Component-specific properties */
  [key: string]: any;
}

// ── Blueprint Types ─────────────────────────────────────────

export type VarType =
  | 'Float'
  | 'Boolean'
  | 'Vector3'
  | 'String'
  | 'Color'
  | 'ObjectRef'
  | 'Widget'
  | 'BlackboardKeySelector'
  | string; // For Struct:id, Enum:id, ClassRef:id

export interface BlueprintVariable {
  name: string;
  type: VarType;
  defaultValue: any;
  id: string;
  exposeOnSpawn?: boolean;
  instanceEditable?: boolean;
  description?: string;
  tooltip?: string;
}

export interface BlueprintGraphData {
  nodeData?: any;
  comments?: any[];
}

export interface BlueprintFunction {
  name: string;
  id: string;
  inputs: { name: string; type: VarType; defaultValue?: any }[];
  outputs: { name: string; type: VarType }[];
  localVariables: BlueprintVariable[];
  graph: BlueprintGraphData;
}

export interface BlueprintCustomEvent {
  name: string;
  id: string;
  params: { name: string; type: VarType }[];
}

export interface BlueprintStruct {
  name: string;
  id: string;
  fields: { name: string; type: VarType; defaultValue?: any }[];
}

// ── Animation Blueprint Types ───────────────────────────────

export type AnimStateOutputType =
  | 'singleAnimation'
  | 'blendSpace1D'
  | 'blendSpace2D'
  | 'spriteAnimation'
  | 'blendSprite1D';

export interface AnimStateData {
  id: string;
  name: string;
  outputType: AnimStateOutputType;
  animationName?: string;
  looping?: boolean;
  playRate?: number;
  startTime?: number;
  spriteAnimationId?: string;
  blendSpace1DId?: string;
  blendSprite1DId?: string;
  blendSpace2DId?: string;
  isDefault?: boolean;
  [key: string]: any;
}

// ── Widget Types ────────────────────────────────────────────

export type WidgetType =
  | 'CanvasPanel'
  | 'VerticalBox'
  | 'HorizontalBox'
  | 'Overlay'
  | 'GridPanel'
  | 'WrapBox'
  | 'SizeBox'
  | 'ScaleBox'
  | 'ScrollBox'
  | 'Border'
  | 'Button'
  | 'Text'
  | 'Image'
  | 'ProgressBar'
  | 'Slider'
  | 'TextBox'
  | 'CheckBox'
  | 'ComboBox'
  | 'Spacer'
  | 'NamedSlot'
  | 'WidgetSwitcher'
  | 'CircularThrobber'
  | 'Throbber';

export type WidgetVisibility =
  | 'Visible'
  | 'Collapsed'
  | 'Hidden'
  | 'HitTestInvisible'
  | 'SelfHitTestInvisible';

// ── Skeletal Mesh Types ─────────────────────────────────────

export interface SkeletalMeshConfig {
  meshAssetId: string;
  animationName: string;
  loopAnimation: boolean;
  animationSpeed: number;
  strictSkeletonMatching?: boolean;
  animationBlueprintId?: string;
}

// ── Animation Blueprint Types (extended) ────────────────────

export type TransitionRuleOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
export type TransitionGroupOp = 'AND' | 'OR';
export type TransitionGroupLogic = 'AND' | 'OR';
export type TransitionRuleKind = 'compare' | 'expr';

export interface AnimTransitionRuleBase {
  id: string;
  kind: TransitionRuleKind;
}

export interface AnimTransitionCompareRule extends AnimTransitionRuleBase {
  kind: 'compare';
  varName: string;
  op: TransitionRuleOp;
  value: number | boolean | string;
  valueType: 'Float' | 'Boolean' | 'String';
}

export interface AnimTransitionExprRule extends AnimTransitionRuleBase {
  kind: 'expr';
  expr: string;
}

export type AnimTransitionRule = AnimTransitionCompareRule | AnimTransitionExprRule;

export interface AnimTransitionRuleGroup {
  id: string;
  op: TransitionGroupOp;
  rules: AnimTransitionRule[];
}

export interface AnimTransitionData {
  id: string;
  fromStateId: string;
  toStateId: string;
  ruleGroups?: AnimTransitionRuleGroup[];
  /** Flat rules array (legacy format, some assets use this) */
  rules?: AnimTransitionRuleGroup[];
  ruleLogic?: TransitionGroupLogic;
  blendDuration: number;
  blendProfile?: string;
  priority?: number;
}

export interface BlendSpaceSample1D {
  animationName: string;
  position: number;
  rangeMin: number;
  rangeMax: number;
  spriteAnimationName?: string;
}

export interface BlendSpace1D {
  id: string;
  name: string;
  axisLabel: string;
  axisMin: number;
  axisMax: number;
  drivingVariable: string;
  blendMargin: number;
  samples: BlendSpaceSample1D[];
}

export interface TransitionBlendProfile {
  time: number;
  curve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface AnimStateMachineData {
  entryStateId: string;
  states: AnimStateData[];
  transitions: AnimTransitionData[];
}

/** Runtime-facing shape of an AnimBlueprintAsset (mirrors the editor class) */
export interface AnimBlueprintAssetData {
  id: string;
  name: string;
  targetSkeletonMeshAssetId: string;
  targetSkeletonId: string;
  stateMachine: AnimStateMachineData;
  blendSpaces1D: BlendSpace1D[];
  blendSpaces2D?: any[];
  blendSprites1D?: any[];
  eventGraph: BlueprintGraphData | null;
  blueprintData: any;
  compiledCode: string;
  is2D: boolean;
  targetSpriteSheetId?: string;
}

// ── Behavior Tree Types ─────────────────────────────────────

export type BTNodeType =
  | 'root'
  | 'composite'
  | 'decorator'
  | 'task'
  | 'service';

export type CompositeType =
  | 'selector'
  | 'sequence'
  | 'parallelSync'
  | 'parallelSelect'
  | 'simpleParallel';

export interface BTNodeData {
  id: string;
  type: BTNodeType;
  label: string;
  compositeType?: CompositeType;
  assetRef?: string;
  builtinId?: string;
  x: number;
  y: number;
  children: string[];
  decorators: string[];
  services: string[];
  properties: Record<string, any>;
  _execStatus?: 'inactive' | 'running' | 'success' | 'failure';
}

export interface BehaviorTreeAsset {
  id: string;
  name: string;
  blackboardId: string | null;
  rootNodeId: string;
  nodes: Record<string, BTNodeData>;
  createdAt: number;
  modifiedAt: number;
}

// ── Game Instance Types ─────────────────────────────────────

export interface GameInstanceBlueprintJSON {
  gameInstanceVersion?: number;
  gameInstanceId: string;
  gameInstanceName: string;
  eventGraph: BlueprintGraphData | null;
  compiledCode?: string;
  blueprintGraphNodeData?: any;
}

// ── Scene Types ─────────────────────────────────────────────

export interface GameObjectJSON {
  name: string;
  meshType?: string;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  hasPhysics?: boolean;
  physicsConfig?: Partial<PhysicsConfig>;
  actorAssetId?: string;
  actorType?: ActorType;
  controllerClass?: string;
  controllerBlueprintId?: string;
  customMeshAssetId?: string;
  blueprintData?: any;
  materialOverrides?: any;
  tags?: string[];
  sortingLayer?: string;
  orderInLayer?: number;
  spriteSheetId?: string;
  characterPawnConfig?: any;
  characterMovement2DConfig?: any;
  compiledCode?: string;
  components?: ActorComponentData[];
  [key: string]: any;
}

export interface SceneJSON {
  version?: number;
  gameObjects: GameObjectJSON[];
  is2D?: boolean;
  metadata?: {
    sceneName?: string;
    [key: string]: any;
  };
}
