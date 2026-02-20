// ============================================================
//  AnimBlueprintData — UE-style Animation Blueprint Asset
//  Defines the data model for animation state machines,
//  blend spaces, transitions, and event graphs.
//
//  Pattern: JSON interface + runtime class + Manager,
//  identical to ActorAsset / StructureAsset / MeshAsset.
// ============================================================

import { BlueprintData, type BlueprintGraphData } from './BlueprintData';

// ---- Unique ID helper ----
let _uid = 0;
export function animUid(): string {
  return 'abp_' + Date.now().toString(36) + '_' + (++_uid).toString(36);
}

// ---- Blend Space Types ----

/** A single sample point in a 1D blend space (range-based, UE-style) */
export interface BlendSpaceSample1D {
  /** Unique ID for this sample */
  id: string;
  /** Animation asset ID (from MeshAssetManager) */
  animationId: string;
  /** Animation clip name within the asset */
  animationName: string;
  /** Start of the range on the axis where this animation is active */
  rangeMin: number;
  /** End of the range on the axis where this animation is active */
  rangeMax: number;
  /** Playback speed override for this sample (1 = normal) */
  playRate: number;
  /** Whether this sample loops */
  loop: boolean;
  /** Legacy: single position (for migration) */
  position?: number;
}

/** 1D Blend Space definition (UE-style: driven by a variable, ranges map to animations) */
export interface BlendSpace1D {
  id: string;
  name: string;
  /** Axis label (e.g., "Speed") */
  axisLabel: string;
  /** Min value on axis */
  axisMin: number;
  /** Max value on axis */
  axisMax: number;
  /** The event graph variable that drives this blend space */
  drivingVariable: string;
  /** Blend margin: crossfade width at range boundaries (in axis units) */
  blendMargin: number;
  /** Ordered sample ranges */
  samples: BlendSpaceSample1D[];
}

/** A single sample point in a 2D blend space */
export interface BlendSpaceSample2D {
  animationId: string;
  animationName: string;
  positionX: number;
  positionY: number;
}

/** 2D Blend Space definition */
export interface BlendSpace2D {
  id: string;
  name: string;
  axisLabelX: string;
  axisLabelY: string;
  axisMinX: number;
  axisMaxX: number;
  axisMinY: number;
  axisMaxY: number;
  samples: BlendSpaceSample2D[];
}

// ---- State Machine Types ----

/** What drives an animation state's output */
export type AnimStateOutputType = 'singleAnimation' | 'blendSpace1D' | 'blendSpace2D';

/** A single state in the animation state machine */
export interface AnimStateData {
  id: string;
  name: string;
  /** Visual position in the graph editor */
  posX: number;
  posY: number;
  /** Output type */
  outputType: AnimStateOutputType;
  /** For 'singleAnimation': animation asset ID */
  animationId: string;
  /** For 'singleAnimation': animation clip name */
  animationName: string;
  /** For 'singleAnimation': whether to loop */
  loop: boolean;
  /** For 'singleAnimation': playback speed multiplier */
  playRate: number;
  /** For 'blendSpace1D': blend space ID (references blendSpaces1D array) */
  blendSpace1DId: string;
  /** For 'blendSpace1D': the Event Graph variable that drives the axis */
  blendSpaceAxisVar: string;
  /** For 'blendSpace2D': blend space 2D ID */
  blendSpace2DId: string;
  /** For 'blendSpace2D': X axis variable name */
  blendSpaceAxisVarX: string;
  /** For 'blendSpace2D': Y axis variable name */
  blendSpaceAxisVarY: string;
  /** Override animation source per-state */
  useOverrideMesh?: boolean;
  overrideMeshAssetId?: string;
  overrideAnimationName?: string;
  /** Optional sync group name for UE-style sync */
  syncGroup?: string;
  /** Sync role within group */
  syncRole?: 'leader' | 'follower';
}

/** A transition between two states */
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

export interface TransitionBlendProfile {
  time: number;
  curve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface AnimTransitionData {
  id: string;
  /** Source state ID ('*' = any state / wildcard) */
  fromStateId: string;
  /** Target state ID */
  toStateId: string;
  /** Transition rules (UE-style rule groups) */
  rules?: AnimTransitionRuleGroup[];
  /** How to combine rule groups */
  ruleLogic?: TransitionGroupLogic;
  /** Legacy condition expression (migrated to rules) */
  conditionExpr?: string;
  /** Cross-fade duration in seconds (legacy) */
  blendTime: number;
  /** Blend profile for the transition */
  blendProfile?: TransitionBlendProfile;
  /** Priority (lower = higher priority; wildcard transitions auto +100) */
  priority: number;
  /** Visual control points for the edge in the graph editor */
  controlPoints?: Array<{ x: number; y: number }>;
}

/** The complete state machine graph */
export interface AnimStateMachineData {
  /** Entry state ID (which state starts by default) */
  entryStateId: string;
  /** All states */
  states: AnimStateData[];
  /** All transitions */
  transitions: AnimTransitionData[];
}

// ---- Animation Blueprint JSON (persistence) ----

export interface AnimBlueprintJSON {
  animBlueprintVersion?: number;
  animBlueprintId: string;
  animBlueprintName: string;
  /** Which skeleton/mesh this AnimBP targets */
  targetSkeletonMeshAssetId: string;
  /** Which skeleton this AnimBP targets (for compatibility checks) */
  targetSkeletonId?: string;
  /** State machine definition */
  stateMachine: AnimStateMachineData;
  /** 1D Blend Spaces owned by this AnimBP */
  blendSpaces1D: BlendSpace1D[];
  /** 2D Blend Spaces owned by this AnimBP */
  blendSpaces2D: BlendSpace2D[];
  /** Event graph variables (legacy; now stored in BlueprintData.variables) */
  eventVariables?: Array<{ name: string; type: 'number' | 'boolean' | 'string'; defaultValue: number | boolean | string }>;
  /** Event Graph node data (Rete-style, same format as actor blueprint graphs) */
  eventGraph: BlueprintGraphData | null;
  /** Compiled JS code from the event graph */
  compiledCode?: string;
  /** Serialized Rete node graph for the event graph editor */
  blueprintGraphNodeData?: any;
}

// ---- Default Helpers ----

export function defaultAnimState(name: string, x = 0, y = 0): AnimStateData {
  return {
    id: animUid(),
    name,
    posX: x,
    posY: y,
    outputType: 'singleAnimation',
    animationId: '',
    animationName: '',
    loop: true,
    playRate: 1,
    blendSpace1DId: '',
    blendSpaceAxisVar: '',
    blendSpace2DId: '',
    blendSpaceAxisVarX: '',
    blendSpaceAxisVarY: '',
    useOverrideMesh: false,
    overrideMeshAssetId: '',
    overrideAnimationName: '',
    syncGroup: '',
    syncRole: 'leader',
  };
}

export function defaultTransition(fromId: string, toId: string, condition = 'true'): AnimTransitionData {
  return {
    id: animUid(),
    fromStateId: fromId,
    toStateId: toId,
    conditionExpr: condition,
    blendTime: 0.25,
    blendProfile: { time: 0.25, curve: 'linear' },
    rules: [
      {
        id: animUid(),
        op: 'AND',
        rules: condition && condition !== 'true'
          ? [{ id: animUid(), kind: 'expr', expr: condition }]
          : [],
      },
    ],
    ruleLogic: 'AND',
    priority: fromId === '*' ? 100 : 0,
  };
}

export function defaultBlendSpace1D(name: string): BlendSpace1D {
  return {
    id: animUid(),
    name,
    axisLabel: 'Speed',
    axisMin: 0,
    axisMax: 600,
    drivingVariable: 'speed',
    blendMargin: 10,
    samples: [],
  };
}

export function defaultBlendSpace2D(name: string): BlendSpace2D {
  return {
    id: animUid(),
    name,
    axisLabelX: 'Direction',
    axisLabelY: 'Speed',
    axisMinX: -180,
    axisMaxX: 180,
    axisMinY: 0,
    axisMaxY: 600,
    samples: [],
  };
}

// ---- Animation Blueprint Asset Class ----

export class AnimBlueprintAsset {
  public id: string;
  public name: string;
  public targetSkeletonMeshAssetId: string;
  public targetSkeletonId: string;
  public stateMachine: AnimStateMachineData;
  public blendSpaces1D: BlendSpace1D[];
  public blendSpaces2D: BlendSpace2D[];
  public eventGraph: BlueprintGraphData | null;

  /** BlueprintData for the event graph Rete editor (variables, functions, graph data) */
  public blueprintData: BlueprintData;
  /** Compiled JS code string from the event graph (stored for runtime execution) */
  public compiledCode: string = '';

  private _dirty = false;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.targetSkeletonMeshAssetId = '';
    this.targetSkeletonId = '';

    // Create default state machine with Idle entry state
    const idleState = defaultAnimState('Idle', 100, 200);
    this.stateMachine = {
      entryStateId: idleState.id,
      states: [idleState],
      transitions: [],
    };

    this.blendSpaces1D = [];
    this.blendSpaces2D = [];
    this.eventGraph = null;

    // Create BlueprintData for the event graph Rete editor
    this.blueprintData = new BlueprintData();
    this.blueprintData.addVariable('speed', 'Float');
    this.blueprintData.addVariable('isInAir', 'Boolean');
    this.blueprintData.addVariable('isCrouching', 'Boolean');
  }

  touch(): void {
    this._dirty = true;
  }

  toJSON(): AnimBlueprintJSON {
    return {
      animBlueprintVersion: 2,
      animBlueprintId: this.id,
      animBlueprintName: this.name,
      targetSkeletonMeshAssetId: this.targetSkeletonMeshAssetId,
      targetSkeletonId: this.targetSkeletonId || undefined,
      stateMachine: structuredClone(this.stateMachine),
      blendSpaces1D: structuredClone(this.blendSpaces1D),
      blendSpaces2D: structuredClone(this.blendSpaces2D),
      eventVariables: [],
      eventGraph: this.eventGraph ? structuredClone(this.eventGraph) : null,
      compiledCode: this.compiledCode,
      blueprintGraphNodeData: this.blueprintData.eventGraph.nodeData ?? null,
    };
  }

  static fromJSON(json: AnimBlueprintJSON): AnimBlueprintAsset {
    const asset = new AnimBlueprintAsset(json.animBlueprintId, json.animBlueprintName);
    const version = json.animBlueprintVersion ?? 1;
    asset.targetSkeletonMeshAssetId = json.targetSkeletonMeshAssetId ?? '';
    asset.targetSkeletonId = json.targetSkeletonId ?? '';
    asset.stateMachine = json.stateMachine ?? {
      entryStateId: '',
      states: [],
      transitions: [],
    };
    asset.blendSpaces1D = json.blendSpaces1D ?? [];
    asset.blendSpaces2D = json.blendSpaces2D ?? [];
    asset.eventGraph = json.eventGraph ?? null;
    asset.compiledCode = (json as any).compiledCode ?? '';

    // Migrate legacy blend space samples (position → rangeMin/rangeMax)
    for (const bs of asset.blendSpaces1D) {
      if (!bs.drivingVariable) bs.drivingVariable = bs.axisLabel?.toLowerCase() || 'speed';
      if (bs.blendMargin === undefined) bs.blendMargin = 10;
      for (const s of bs.samples) {
        if (!s.id) s.id = animUid();
        if (s.playRate === undefined) s.playRate = 1;
        if (s.loop === undefined) s.loop = true;
        // Migrate point-based → range-based
        if (s.rangeMin === undefined || s.rangeMax === undefined) {
          const pos = (s as any).position ?? 0;
          s.rangeMin = pos;
          s.rangeMax = pos;
        }
      }
    }

    // Restore blueprint graph node data
    if ((json as any).blueprintGraphNodeData) {
      asset.blueprintData.eventGraph.nodeData = (json as any).blueprintGraphNodeData;
    }

    // Migrate legacy eventVariables into BlueprintData variables
    if (asset.blueprintData.variables.length === 0 && json.eventVariables && json.eventVariables.length > 0) {
      for (const v of json.eventVariables) {
        const type = v.type === 'number' ? 'Float' : v.type === 'boolean' ? 'Boolean' : 'String';
        const nv = asset.blueprintData.addVariable(v.name, type);
        nv.defaultValue = v.defaultValue;
      }
    }

    // Migrate transitions to rule groups + blend profiles
    if (version < 2) {
      for (const t of asset.stateMachine.transitions) {
        const legacyExpr = (t as any).conditionExpr || '';
        const parsedRule = parseLegacyTransitionRule(legacyExpr);
        t.rules = [
          {
            id: animUid(),
            op: 'AND',
            rules: parsedRule ? [parsedRule] : [],
          },
        ];
        t.ruleLogic = 'AND';
        const legacyBlend = (t as any).blendTime ?? 0.25;
        t.blendProfile = { time: legacyBlend, curve: 'linear' };
      }
    } else {
      for (const t of asset.stateMachine.transitions) {
        if (!t.rules) t.rules = [{ id: animUid(), op: 'AND', rules: [] }];
        if (!t.ruleLogic) t.ruleLogic = 'AND';
        if (!t.blendProfile) t.blendProfile = { time: t.blendTime ?? 0.25, curve: 'linear' };
      }
    }

    return asset;
  }
}

function parseLegacyTransitionRule(expr: string): AnimTransitionRule | null {
  const clean = (expr || '').trim();
  if (!clean || clean === 'true') return null;
  if (clean === 'false') {
    return { id: animUid(), kind: 'expr', expr: 'false' };
  }

  const neg = clean.startsWith('!') ? clean.slice(1).trim() : '';
  if (neg && /^\w+$/.test(neg)) {
    return {
      id: animUid(),
      kind: 'compare',
      varName: neg,
      op: '==',
      value: false,
      valueType: 'Boolean',
    };
  }

  const match = clean.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (match) {
    const [, varName, op, rawValue] = match;
    const trimVal = rawValue.trim();
    if (trimVal === 'true' || trimVal === 'false') {
      return {
        id: animUid(),
        kind: 'compare',
        varName,
        op: op as TransitionRuleOp,
        value: trimVal === 'true',
        valueType: 'Boolean',
      };
    }
    if (!isNaN(Number(trimVal))) {
      return {
        id: animUid(),
        kind: 'compare',
        varName,
        op: op as TransitionRuleOp,
        value: Number(trimVal),
        valueType: 'Float',
      };
    }
    return {
      id: animUid(),
      kind: 'compare',
      varName,
      op: op as TransitionRuleOp,
      value: trimVal.replace(/^['"]|['"]$/g, ''),
      valueType: 'String',
    };
  }

  return { id: animUid(), kind: 'expr', expr: clean };
}

// ---- Animation Blueprint Asset Manager ----

export class AnimBlueprintManager {
  private _assets: Map<string, AnimBlueprintAsset> = new Map();
  private _listeners: Array<() => void> = [];

  /** Global singleton instance for static access (like MeshAssetManager) */
  private static _instance: AnimBlueprintManager | null = null;

  constructor() {
    AnimBlueprintManager._instance = this;
  }

  /** Get the singleton instance */
  static get instance(): AnimBlueprintManager | null {
    return AnimBlueprintManager._instance;
  }

  /** Static accessor for looking up an AnimBP asset from anywhere */
  static getAsset(id: string): AnimBlueprintAsset | undefined {
    return AnimBlueprintManager._instance?.getAsset(id);
  }

  get assets(): AnimBlueprintAsset[] {
    return Array.from(this._assets.values());
  }

  getAsset(id: string): AnimBlueprintAsset | undefined {
    return this._assets.get(id);
  }

  createAsset(name: string): AnimBlueprintAsset {
    const id = animUid();
    const asset = new AnimBlueprintAsset(id, name);
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

  exportAll(): AnimBlueprintJSON[] {
    return this.assets.map(a => a.toJSON());
  }

  importAll(jsonArr: AnimBlueprintJSON[]): void {
    this._assets.clear();
    for (const json of jsonArr) {
      const asset = AnimBlueprintAsset.fromJSON(json);
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
      try { cb(); } catch (e) { console.error('[AnimBlueprintManager] listener error:', e); }
    }
  }
}
