// ============================================================
//  AI Asset Manager — manages all AI asset types
//  (Behavior Trees, Blackboards, Tasks, Decorators, Services,
//   AI Controllers, Perception Configs, EQS)
// ============================================================

import { BlueprintData, type BlueprintGraphData } from '../BlueprintData';

// ── BlueprintData serialization helpers ──
function serializeBlueprintData(bp: BlueprintData): any {
  return {
    variables: JSON.parse(JSON.stringify(bp.variables)),
    functions: JSON.parse(JSON.stringify(bp.functions)),
    macros: JSON.parse(JSON.stringify(bp.macros)),
    customEvents: JSON.parse(JSON.stringify(bp.customEvents)),
    structs: JSON.parse(JSON.stringify(bp.structs)),
    eventGraph: JSON.parse(JSON.stringify(bp.eventGraph)),
  };
}

function deserializeBlueprintData(json: any): BlueprintData {
  const bp = new BlueprintData();
  if (!json) return bp;
  if (json.variables) bp.variables = json.variables;
  if (json.functions) bp.functions = json.functions;
  if (json.macros) bp.macros = json.macros;
  if (json.customEvents) bp.customEvents = json.customEvents;
  if (json.structs) bp.structs = json.structs;
  if (json.eventGraph) bp.eventGraph = json.eventGraph;
  return bp;
}

// ── AI Asset Types ──

export type AIAssetType =
  | 'behaviorTree'
  | 'blackboard'
  | 'btTask'
  | 'btDecorator'
  | 'btService'
  | 'aiController'
  | 'perceptionConfig'
  | 'eqs';

// ── Blackboard Key Types ──

export type BlackboardKeyType = 'Object' | 'Vector' | 'Rotator' | 'Bool' | 'Float' | 'Int' | 'String' | 'Enum';

export const BLACKBOARD_KEY_COLORS: Record<BlackboardKeyType, string> = {
  Object:   '#0099ff',
  Vector:   '#f5a623',
  Rotator:  '#e74c3c',
  Bool:     '#4ade80',
  Float:    '#00bcd4',
  Int:      '#ff9800',
  String:   '#c678dd',
  Enum:     '#ff69b4',
};

export interface BlackboardKey {
  id: string;
  name: string;
  type: BlackboardKeyType;
  classFilter?: string;       // for Object type
  description: string;
  defaultValue: any;
  /** Runtime override value during play mode */
  _liveValue?: any;
  _lastChanged?: number;
}

export interface BlackboardAsset {
  id: string;
  name: string;
  keys: BlackboardKey[];
  createdAt: number;
  modifiedAt: number;
}

// ── Behavior Tree Node Types ──

export type BTNodeType = 'root' | 'composite' | 'task' | 'decorator' | 'service';
export type CompositeType = 'Sequence' | 'Selector' | 'SimpleParallel' | 'RandomSelector';

export interface BTNodeData {
  id: string;
  type: BTNodeType;
  label: string;
  /** For composite nodes */
  compositeType?: CompositeType;
  /** Reference to a task/decorator/service asset */
  assetRef?: string;
  /** Built-in node identifier (e.g. 'MoveTo', 'Wait', 'BlackboardCondition') */
  builtinId?: string;
  /** Position in the canvas */
  x: number;
  y: number;
  /** Children node IDs (ordered left-to-right = execution priority) */
  children: string[];
  /** Decorator IDs attached to this node */
  decorators: string[];
  /** Service IDs attached to this node */
  services: string[];
  /** Node-specific properties */
  properties: Record<string, any>;
  /** Execution status during play mode */
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

// ── Task / Decorator / Service Assets ──

export interface BTTaskAsset {
  id: string;
  name: string;
  blueprintData: BlueprintData;
  compiledCode: string;
  description: string;
  createdAt: number;
  modifiedAt: number;
}

export interface BTDecoratorAsset {
  id: string;
  name: string;
  blueprintData: BlueprintData;
  compiledCode: string;
  description: string;
  createdAt: number;
  modifiedAt: number;
}

export interface BTServiceAsset {
  id: string;
  name: string;
  blueprintData: BlueprintData;
  compiledCode: string;
  description: string;
  /** Tick interval in seconds */
  interval: number;
  /** Random deviation applied to interval */
  randomDeviation: number;
  createdAt: number;
  modifiedAt: number;
}

// ── AI Controller Asset ──

export interface AIControllerAsset {
  id: string;
  name: string;
  blueprintData: BlueprintData;
  compiledCode: string;
  behaviorTreeId: string | null;
  blackboardId: string | null;
  description: string;
  createdAt: number;
  modifiedAt: number;
}

// ── Perception Config ──

export type SenseType = 'Sight' | 'Hearing' | 'Damage' | 'Touch' | 'Prediction';

export interface PerceptionSense {
  id: string;
  type: SenseType;
  enabled: boolean;
  /** Sight-specific */
  sightRadius?: number;
  loseSightRadius?: number;
  peripheralVisionAngle?: number;
  /** Hearing-specific */
  hearingRange?: number;
  /** Common */
  maxAge: number;
}

export interface PerceptionConfigAsset {
  id: string;
  name: string;
  senses: PerceptionSense[];
  dominantSense: SenseType;
  createdAt: number;
  modifiedAt: number;
}

// ── Environment Query (EQS) ──

export interface EQSAsset {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  modifiedAt: number;
}

// ── Built-in Task/Decorator/Service definitions ──

export interface BuiltinNodeDef {
  id: string;
  label: string;
  category: 'task' | 'decorator' | 'service';
  description: string;
  properties: { name: string; type: string; default: any; description: string }[];
}

export const BUILTIN_TASKS: BuiltinNodeDef[] = [
  { id: 'bt_moveto', label: 'Move To', category: 'task', description: 'Move the AI pawn to a location or actor', properties: [
    { name: 'TargetKey', type: 'BlackboardKey', default: '', description: 'Blackboard key for the target' },
    { name: 'AcceptableRadius', type: 'Float', default: 50, description: 'How close to get to the target' },
  ]},
  { id: 'bt_wait', label: 'Wait', category: 'task', description: 'Wait for a specified time', properties: [
    { name: 'WaitTime', type: 'Float', default: 1.0, description: 'Time to wait in seconds' },
    { name: 'RandomDeviation', type: 'Float', default: 0, description: 'Random +/- deviation' },
  ]},
  { id: 'bt_playanim', label: 'Play Animation', category: 'task', description: 'Play an animation montage', properties: [
    { name: 'AnimationAsset', type: 'String', default: '', description: 'Animation to play' },
    { name: 'Loop', type: 'Bool', default: false, description: 'Loop the animation' },
  ]},
  { id: 'bt_setbb', label: 'Set Blackboard Value', category: 'task', description: 'Set a value on the blackboard', properties: [
    { name: 'Key', type: 'BlackboardKey', default: '', description: 'Key to set' },
    { name: 'Value', type: 'Any', default: null, description: 'Value to assign' },
  ]},
  { id: 'bt_rotateto', label: 'Rotate To Face Target', category: 'task', description: 'Rotate to face a target', properties: [
    { name: 'TargetKey', type: 'BlackboardKey', default: '', description: 'Blackboard key for the target to face' },
    { name: 'RotationSpeed', type: 'Float', default: 360, description: 'Degrees per second' },
  ]},
  { id: 'bt_investigate', label: 'Investigate Last Known Location', category: 'task', description: 'Move to and investigate the last known target location', properties: [
    { name: 'LocationKey', type: 'BlackboardKey', default: '', description: 'Blackboard key with the location' },
    { name: 'InvestigateTime', type: 'Float', default: 3.0, description: 'Time to investigate' },
  ]},
  { id: 'bt_searcharea', label: 'Search Area', category: 'task', description: 'Search the surrounding area', properties: [
    { name: 'SearchRadius', type: 'Float', default: 500, description: 'Radius to search' },
    { name: 'SearchPoints', type: 'Int', default: 4, description: 'Number of points to check' },
  ]},
];

export const BUILTIN_DECORATORS: BuiltinNodeDef[] = [
  { id: 'bt_bbcondition', label: 'Blackboard Condition', category: 'decorator', description: 'Check a blackboard key value', properties: [
    { name: 'Key', type: 'BlackboardKey', default: '', description: 'Key to check' },
    { name: 'Operator', type: 'String', default: 'IsSet', description: 'Comparison operator' },
    { name: 'Value', type: 'Any', default: null, description: 'Value to compare against' },
  ]},
  { id: 'bt_cooldown', label: 'Cooldown', category: 'decorator', description: 'Prevent branch from running too frequently', properties: [
    { name: 'CooldownTime', type: 'Float', default: 5.0, description: 'Cooldown duration in seconds' },
  ]},
  { id: 'bt_loop', label: 'Loop', category: 'decorator', description: 'Loop the subtree a number of times', properties: [
    { name: 'NumLoops', type: 'Int', default: 3, description: 'Number of loops (0 = infinite)' },
  ]},
  { id: 'bt_timelimit', label: 'Time Limit', category: 'decorator', description: 'Abort if subtree exceeds time', properties: [
    { name: 'TimeLimit', type: 'Float', default: 10.0, description: 'Max time in seconds' },
  ]},
  { id: 'bt_hastargetsight', label: 'Has Visible Target', category: 'decorator', description: 'Check if a target is visible', properties: [
    { name: 'TargetKey', type: 'BlackboardKey', default: '', description: 'Key with the actor to check visibility for' },
  ]},
];

export const BUILTIN_SERVICES: BuiltinNodeDef[] = [
  { id: 'bt_updatebb', label: 'Default Update Blackboard', category: 'service', description: 'Update blackboard values at an interval', properties: [
    { name: 'Interval', type: 'Float', default: 0.5, description: 'Update interval in seconds' },
    { name: 'RandomDeviation', type: 'Float', default: 0.1, description: 'Random +/- deviation on interval' },
  ]},
];

// ── AI Asset Icons & Colors ──

export const AI_ASSET_META: Record<AIAssetType, { color: string; label: string; prefix: string }> = {
  behaviorTree:    { color: '#1565C0', label: 'Behavior Tree',      prefix: 'BT_' },
  blackboard:      { color: '#2E7D32', label: 'Blackboard',         prefix: 'BB_' },
  btTask:          { color: '#E65100', label: 'Task',               prefix: 'BTTask_' },
  btDecorator:     { color: '#7B1FA2', label: 'Decorator',          prefix: 'BTDecorator_' },
  btService:       { color: '#546E7A', label: 'Service',            prefix: 'BTService_' },
  aiController:    { color: '#00838F', label: 'AI Controller',      prefix: 'AIC_' },
  perceptionConfig:{ color: '#6D4C41', label: 'Perception Config',  prefix: 'PC_' },
  eqs:             { color: '#795548', label: 'Environment Query',  prefix: 'EQS_' },
};

// ── UID generator ──
let _uidCounter = 0;
function aiUid(): string {
  return `ai_${++_uidCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

// ============================================================
//  AI Asset Manager
// ============================================================

export class AIAssetManager {
  // ── Singleton ──
  private static _instance: AIAssetManager | null = null;
  static getInstance(): AIAssetManager | null { return AIAssetManager._instance; }

  // ── Storage ──
  private _blackboards = new Map<string, BlackboardAsset>();
  private _behaviorTrees = new Map<string, BehaviorTreeAsset>();
  private _tasks = new Map<string, BTTaskAsset>();
  private _decorators = new Map<string, BTDecoratorAsset>();
  private _services = new Map<string, BTServiceAsset>();
  private _aiControllers = new Map<string, AIControllerAsset>();
  private _perceptionConfigs = new Map<string, PerceptionConfigAsset>();
  private _eqs = new Map<string, EQSAsset>();

  // ── Observers ──
  private _listeners: (() => void)[] = [];

  onChanged(cb: () => void): void { this._listeners.push(cb); }
  private _notify(): void { this._listeners.forEach(cb => cb()); }
  /** Public trigger for external rename or mutation */
  notifyChanged(): void { this._notify(); }

  // ── First-time guidance tracking ──
  private _dismissedHints = new Set<string>();
  isHintDismissed(hintKey: string): boolean { return this._dismissedHints.has(hintKey); }
  dismissHint(hintKey: string): void { this._dismissedHints.add(hintKey); }

  constructor() {
    AIAssetManager._instance = this;
  }

  // ── Recent nodes for search ──
  private _recentNodes: string[] = [];
  getRecentNodes(): string[] { return [...this._recentNodes]; }
  addRecentNode(label: string): void {
    this._recentNodes = [label, ...this._recentNodes.filter(n => n !== label)].slice(0, 5);
  }

  // ── Favorite nodes ──
  private _favoriteNodes = new Set<string>();
  getFavoriteNodes(): Set<string> { return new Set(this._favoriteNodes); }
  toggleFavorite(label: string): void {
    if (this._favoriteNodes.has(label)) this._favoriteNodes.delete(label);
    else this._favoriteNodes.add(label);
  }

  // ============================================================
  //  Blackboard CRUD
  // ============================================================

  createBlackboard(name: string): BlackboardAsset {
    const bb: BlackboardAsset = {
      id: aiUid(),
      name,
      keys: [],
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    this._blackboards.set(bb.id, bb);
    this._notify();
    return bb;
  }

  getBlackboard(id: string): BlackboardAsset | undefined { return this._blackboards.get(id); }
  getAllBlackboards(): BlackboardAsset[] { return [...this._blackboards.values()]; }

  addBlackboardKey(bbId: string, keyType: BlackboardKeyType, name?: string): BlackboardKey | null {
    const bb = this._blackboards.get(bbId);
    if (!bb) return null;
    const defaults: Record<BlackboardKeyType, any> = {
      Object: null, Vector: { x: 0, y: 0, z: 0 }, Rotator: { pitch: 0, yaw: 0, roll: 0 },
      Bool: false, Float: 0, Int: 0, String: '', Enum: '',
    };
    const key: BlackboardKey = {
      id: aiUid(),
      name: name || `New${keyType}Key`,
      type: keyType,
      description: '',
      defaultValue: defaults[keyType],
    };
    bb.keys.push(key);
    bb.modifiedAt = Date.now();
    this._notify();
    return key;
  }

  removeBlackboardKey(bbId: string, keyId: string): void {
    const bb = this._blackboards.get(bbId);
    if (!bb) return;
    bb.keys = bb.keys.filter(k => k.id !== keyId);
    bb.modifiedAt = Date.now();
    this._notify();
  }

  updateBlackboardKey(bbId: string, keyId: string, updates: Partial<BlackboardKey>): void {
    const bb = this._blackboards.get(bbId);
    if (!bb) return;
    const key = bb.keys.find(k => k.id === keyId);
    if (!key) return;
    Object.assign(key, updates);
    bb.modifiedAt = Date.now();
    this._notify();
  }

  removeBlackboard(id: string): void {
    this._blackboards.delete(id);
    this._notify();
  }

  // ============================================================
  //  Behavior Tree CRUD
  // ============================================================

  createBehaviorTree(name: string): BehaviorTreeAsset {
    const rootId = aiUid();
    const bt: BehaviorTreeAsset = {
      id: aiUid(),
      name,
      blackboardId: null,
      rootNodeId: rootId,
      nodes: {
        [rootId]: {
          id: rootId,
          type: 'root',
          label: 'ROOT',
          x: 400,
          y: 60,
          children: [],
          decorators: [],
          services: [],
          properties: {},
        },
      },
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    this._behaviorTrees.set(bt.id, bt);
    this._notify();
    return bt;
  }

  getBehaviorTree(id: string): BehaviorTreeAsset | undefined { return this._behaviorTrees.get(id); }
  getAllBehaviorTrees(): BehaviorTreeAsset[] { return [...this._behaviorTrees.values()]; }

  addBTNode(btId: string, node: BTNodeData, parentId?: string): BTNodeData | null {
    const bt = this._behaviorTrees.get(btId);
    if (!bt) return null;
    bt.nodes[node.id] = node;
    if (parentId && bt.nodes[parentId]) {
      bt.nodes[parentId].children.push(node.id);
    }
    bt.modifiedAt = Date.now();
    this._notify();
    return node;
  }

  removeBTNode(btId: string, nodeId: string): void {
    const bt = this._behaviorTrees.get(btId);
    if (!bt || nodeId === bt.rootNodeId) return;
    // Remove from parent's children
    for (const n of Object.values(bt.nodes)) {
      n.children = n.children.filter(c => c !== nodeId);
      n.decorators = n.decorators.filter(d => d !== nodeId);
      n.services = n.services.filter(s => s !== nodeId);
    }
    // Remove recursively
    const removeRecursive = (id: string) => {
      const node = bt.nodes[id];
      if (!node) return;
      for (const childId of [...node.children, ...node.decorators, ...node.services]) {
        removeRecursive(childId);
      }
      delete bt.nodes[id];
    };
    removeRecursive(nodeId);
    bt.modifiedAt = Date.now();
    this._notify();
  }

  updateBTNode(btId: string, nodeId: string, updates: Partial<BTNodeData>): void {
    const bt = this._behaviorTrees.get(btId);
    if (!bt || !bt.nodes[nodeId]) return;
    Object.assign(bt.nodes[nodeId], updates);
    bt.modifiedAt = Date.now();
    this._notify();
  }

  removeBehaviorTree(id: string): void {
    this._behaviorTrees.delete(id);
    this._notify();
  }

  // ============================================================
  //  Task CRUD
  // ============================================================

  createTask(name: string): BTTaskAsset {
    const bp = new BlueprintData();

    // ── Pre-populate with UE-style task template nodes ──
    // AIReceiveExecute → FinishExecute (success flow)
    // AIReceiveAbort (abort handling)
    const receiveExecId = 'tmpl_recv_exec_' + Date.now().toString(36);
    const finishExecId = 'tmpl_finish_exec_' + Date.now().toString(36);
    const receiveAbortId = 'tmpl_recv_abort_' + Date.now().toString(36);

    bp.eventGraph.nodeData = {
      nodes: [
        {
          id: receiveExecId,
          type: 'AI Receive Execute',
          position: { x: 100, y: 150 },
          data: { label: 'AI Receive Execute' },
        },
        {
          id: finishExecId,
          type: 'Finish Execute',
          position: { x: 550, y: 150 },
          data: { label: 'Finish Execute' },
        },
        {
          id: receiveAbortId,
          type: 'AI Receive Abort',
          position: { x: 100, y: 400 },
          data: { label: 'AI Receive Abort' },
        },
      ],
      connections: [
        {
          id: 'tmpl_conn_' + Date.now().toString(36),
          source: receiveExecId,
          sourceOutput: 'exec',
          target: finishExecId,
          targetInput: 'exec',
        },
      ],
    };

    const task: BTTaskAsset = {
      id: aiUid(),
      name,
      blueprintData: bp,
      compiledCode: '',
      description: '',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    this._tasks.set(task.id, task);
    this._notify();
    return task;
  }

  getTask(id: string): BTTaskAsset | undefined { return this._tasks.get(id); }
  getAllTasks(): BTTaskAsset[] { return [...this._tasks.values()]; }

  removeTask(id: string): void {
    this._tasks.delete(id);
    this._notify();
  }

  // ============================================================
  //  Decorator CRUD
  // ============================================================

  createDecorator(name: string): BTDecoratorAsset {
    const bp = new BlueprintData();

    // ── Pre-populate with UE-style decorator template ──
    // AIPerformConditionCheck → ReturnNode
    const condCheckId = 'tmpl_cond_check_' + Date.now().toString(36);
    const returnId = 'tmpl_return_' + Date.now().toString(36);

    bp.eventGraph.nodeData = {
      nodes: [
        {
          id: condCheckId,
          type: 'AI Perform Condition Check',
          position: { x: 100, y: 150 },
          data: { label: 'AI Perform Condition Check' },
        },
        {
          id: returnId,
          type: 'Return Node',
          position: { x: 550, y: 150 },
          data: { label: 'Return Node' },
        },
      ],
      connections: [
        {
          id: 'tmpl_conn_' + Date.now().toString(36),
          source: condCheckId,
          sourceOutput: 'exec',
          target: returnId,
          targetInput: 'exec',
        },
      ],
    };

    const dec: BTDecoratorAsset = {
      id: aiUid(),
      name,
      blueprintData: bp,
      compiledCode: '',
      description: '',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    this._decorators.set(dec.id, dec);
    this._notify();
    return dec;
  }

  getDecorator(id: string): BTDecoratorAsset | undefined { return this._decorators.get(id); }
  getAllDecorators(): BTDecoratorAsset[] { return [...this._decorators.values()]; }

  removeDecorator(id: string): void {
    this._decorators.delete(id);
    this._notify();
  }

  // ============================================================
  //  Service CRUD
  // ============================================================

  createService(name: string): BTServiceAsset {
    const bp = new BlueprintData();

    // ── Pre-populate with UE-style service template ──
    // AIServiceActivated, AIServiceTick, AIServiceDeactivated
    const activatedId = 'tmpl_svc_act_' + Date.now().toString(36);
    const tickId = 'tmpl_svc_tick_' + Date.now().toString(36);
    const deactivatedId = 'tmpl_svc_deact_' + Date.now().toString(36);

    bp.eventGraph.nodeData = {
      nodes: [
        {
          id: activatedId,
          type: 'AI Service Activated',
          position: { x: 100, y: 100 },
          data: { label: 'AI Service Activated' },
        },
        {
          id: tickId,
          type: 'AI Service Tick',
          position: { x: 100, y: 300 },
          data: { label: 'AI Service Tick' },
        },
        {
          id: deactivatedId,
          type: 'AI Service Deactivated',
          position: { x: 100, y: 500 },
          data: { label: 'AI Service Deactivated' },
        },
      ],
      connections: [],
    };

    const svc: BTServiceAsset = {
      id: aiUid(),
      name,
      blueprintData: bp,
      compiledCode: '',
      description: '',
      interval: 0.5,
      randomDeviation: 0.1,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    this._services.set(svc.id, svc);
    this._notify();
    return svc;
  }

  getService(id: string): BTServiceAsset | undefined { return this._services.get(id); }
  getAllServices(): BTServiceAsset[] { return [...this._services.values()]; }

  removeService(id: string): void {
    this._services.delete(id);
    this._notify();
  }

  // ============================================================
  //  AI Controller CRUD
  // ============================================================

  createAIController(name: string): AIControllerAsset {
    const bp = new BlueprintData();
    const ctrl: AIControllerAsset = {
      id: aiUid(),
      name,
      blueprintData: bp,
      compiledCode: '',
      behaviorTreeId: null,
      blackboardId: null,
      description: '',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    this._aiControllers.set(ctrl.id, ctrl);
    this._notify();
    return ctrl;
  }

  getAIController(id: string): AIControllerAsset | undefined { return this._aiControllers.get(id); }
  getAllAIControllers(): AIControllerAsset[] { return [...this._aiControllers.values()]; }

  removeAIController(id: string): void {
    this._aiControllers.delete(id);
    this._notify();
  }

  // ============================================================
  //  Perception Config CRUD
  // ============================================================

  createPerceptionConfig(name: string): PerceptionConfigAsset {
    const pc: PerceptionConfigAsset = {
      id: aiUid(),
      name,
      senses: [
        { id: aiUid(), type: 'Sight', enabled: true, sightRadius: 2000, loseSightRadius: 2500, peripheralVisionAngle: 90, maxAge: 5 },
      ],
      dominantSense: 'Sight',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    this._perceptionConfigs.set(pc.id, pc);
    this._notify();
    return pc;
  }

  getPerceptionConfig(id: string): PerceptionConfigAsset | undefined { return this._perceptionConfigs.get(id); }
  getAllPerceptionConfigs(): PerceptionConfigAsset[] { return [...this._perceptionConfigs.values()]; }

  removePerceptionConfig(id: string): void {
    this._perceptionConfigs.delete(id);
    this._notify();
  }

  // ============================================================
  //  EQS CRUD
  // ============================================================

  createEQS(name: string): EQSAsset {
    const eqs: EQSAsset = {
      id: aiUid(),
      name,
      description: '',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    this._eqs.set(eqs.id, eqs);
    this._notify();
    return eqs;
  }

  getEQS(id: string): EQSAsset | undefined { return this._eqs.get(id); }
  getAllEQS(): EQSAsset[] { return [...this._eqs.values()]; }

  removeEQS(id: string): void {
    this._eqs.delete(id);
    this._notify();
  }

  // ============================================================
  //  Validation & Warnings
  // ============================================================

  getWarnings(btId: string): { nodeId?: string; message: string; jumpTo?: { type: string; id: string } }[] {
    const bt = this._behaviorTrees.get(btId);
    if (!bt) return [];
    const warnings: { nodeId?: string; message: string; jumpTo?: { type: string; id: string } }[] = [];

    // Check no blackboard assigned
    if (!bt.blackboardId) {
      warnings.push({ message: 'No Blackboard assigned to this Behavior Tree.' });
    }

    // Check root has no children
    const root = bt.nodes[bt.rootNodeId];
    if (root && root.children.length === 0) {
      warnings.push({ nodeId: bt.rootNodeId, message: 'ROOT node has no children — tree will not execute.' });
    }

    // Check task assets have Finish Execute
    for (const node of Object.values(bt.nodes)) {
      if (node.type === 'task' && node.assetRef) {
        const task = this._tasks.get(node.assetRef);
        if (task && !task.compiledCode) {
          warnings.push({
            nodeId: node.id,
            message: `Task "${task.name}" has no compiled code — tree may hang.`,
            jumpTo: { type: 'btTask', id: task.id },
          });
        }
      }
    }

    return warnings;
  }

  /** Get all behavior trees that reference a given blackboard */
  getTreesUsingBlackboard(bbId: string): BehaviorTreeAsset[] {
    return this.getAllBehaviorTrees().filter(bt => bt.blackboardId === bbId);
  }

  // ============================================================
  //  Serialization
  // ============================================================

  exportAll(): any {
    return {
      version: 1,
      blackboards: [...this._blackboards.values()].map(bb => ({ ...bb })),
      behaviorTrees: [...this._behaviorTrees.values()].map(bt => ({
        ...bt,
        nodes: { ...bt.nodes },
      })),
      tasks: [...this._tasks.values()].map(t => ({
        ...t,
        blueprintData: serializeBlueprintData(t.blueprintData),
      })),
      decorators: [...this._decorators.values()].map(d => ({
        ...d,
        blueprintData: serializeBlueprintData(d.blueprintData),
      })),
      services: [...this._services.values()].map(s => ({
        ...s,
        blueprintData: serializeBlueprintData(s.blueprintData),
      })),
      aiControllers: [...this._aiControllers.values()].map(c => ({
        ...c,
        blueprintData: serializeBlueprintData(c.blueprintData),
      })),
      perceptionConfigs: [...this._perceptionConfigs.values()].map(pc => ({ ...pc })),
      eqs: [...this._eqs.values()].map(e => ({ ...e })),
      dismissedHints: [...this._dismissedHints],
      recentNodes: this._recentNodes,
      favoriteNodes: [...this._favoriteNodes],
    };
  }

  importAll(data: any): void {
    if (!data || data.version !== 1) return;

    this._blackboards.clear();
    this._behaviorTrees.clear();
    this._tasks.clear();
    this._decorators.clear();
    this._services.clear();
    this._aiControllers.clear();
    this._perceptionConfigs.clear();
    this._eqs.clear();

    for (const bb of (data.blackboards || [])) {
      this._blackboards.set(bb.id, bb);
    }
    for (const bt of (data.behaviorTrees || [])) {
      this._behaviorTrees.set(bt.id, bt);
    }
    for (const t of (data.tasks || [])) {
      const bp = deserializeBlueprintData(t.blueprintData);
      this._tasks.set(t.id, { ...t, blueprintData: bp });
    }
    for (const d of (data.decorators || [])) {
      const bp = deserializeBlueprintData(d.blueprintData);
      this._decorators.set(d.id, { ...d, blueprintData: bp });
    }
    for (const s of (data.services || [])) {
      const bp = deserializeBlueprintData(s.blueprintData);
      this._services.set(s.id, { ...s, blueprintData: bp });
    }
    for (const c of (data.aiControllers || [])) {
      const bp = deserializeBlueprintData(c.blueprintData);
      this._aiControllers.set(c.id, { ...c, blueprintData: bp });
    }
    for (const pc of (data.perceptionConfigs || [])) {
      this._perceptionConfigs.set(pc.id, pc);
    }
    for (const e of (data.eqs || [])) {
      this._eqs.set(e.id, e);
    }

    if (data.dismissedHints) {
      this._dismissedHints = new Set(data.dismissedHints);
    }
    if (data.recentNodes) {
      this._recentNodes = data.recentNodes;
    }
    if (data.favoriteNodes) {
      this._favoriteNodes = new Set(data.favoriteNodes);
    }

    this._notify();
  }
}
