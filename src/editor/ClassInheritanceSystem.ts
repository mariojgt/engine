// ============================================================
//  ClassInheritanceSystem — UE-Style Inheritance Engine
//  Central propagation engine for Actor & Widget class hierarchies.
//  Handles parent→child propagation, override tracking,
//  version management, and real-time change notifications.
// ============================================================

import type { ActorAsset, ActorAssetJSON, ActorComponentData, ActorAssetManager } from './ActorAsset';
import type { WidgetBlueprintAsset, WidgetBlueprintJSON, WidgetNodeJSON, WidgetBlueprintManager } from './WidgetBlueprintData';
import type { BlueprintVariable, BlueprintFunction, BlueprintMacro, BlueprintCustomEvent, BlueprintStruct, BlueprintGraphData } from './BlueprintData';

// ============================================================
//  Inheritance Metadata Types
// ============================================================

/** Inheritance metadata added to ActorAssetJSON */
export interface ActorInheritanceData {
  parentClassId: string | null;
  childClassIds: string[];
  classVersion: number;
  parentVersion?: number;         // version of parent at last sync
  lastSyncedWithParent?: string;  // ISO timestamp
  isParentClass: boolean;
}

/** Inheritance metadata added to WidgetBlueprintJSON */
export interface WidgetInheritanceData {
  parentWidgetId: string | null;
  childWidgetIds: string[];
  classVersion: number;
  parentVersion?: number;
  lastSyncedWithParent?: string;
  isParentClass: boolean;
}

/** Track override state for a component / variable / element / node */
export interface InheritanceFlag {
  isInherited: boolean;
  inheritedFrom?: string;     // ID of the class that originally defined this
  overridden?: boolean;
  addedInChild?: boolean;
  canOverride?: boolean;
}

/** Override data for a component in a child */
export interface ComponentOverride extends InheritanceFlag {
  componentId: string;
  overrideData?: Partial<ActorComponentData>;
}

/** Override data for a variable in a child */
export interface VariableOverride extends InheritanceFlag {
  variableId: string;
  overrideValue?: any;
}

/** Override data for a widget element in a child */
export interface ElementOverride extends InheritanceFlag {
  elementId: string;
  overrideData?: Partial<WidgetNodeJSON>;
  slotContent?: WidgetNodeJSON;    // for named slots: what the child fills
}

/** Override data for a blueprint node in a child */
export interface NodeOverride extends InheritanceFlag {
  nodeId: string;
  overrideGraphData?: any;
}

/** Override data for custom events in a child */
export interface EventOverride extends InheritanceFlag {
  eventId: string;
  eventName: string;
}

/** Named Slot definition (Widget only) */
export interface NamedSlot {
  slotId: string;
  slotName: string;
  definedIn: string;       // widget ID that defined this slot
}

// ============================================================
//  Change Tracking — describes what changed in a parent save
// ============================================================

export type ChangeType =
  | 'add-component' | 'remove-component' | 'modify-component'
  | 'add-variable' | 'remove-variable' | 'modify-variable'
  | 'add-node' | 'remove-node' | 'modify-node'
  | 'add-function' | 'remove-function' | 'modify-function'
  | 'add-macro' | 'remove-macro' | 'modify-macro'
  | 'add-event' | 'remove-event' | 'modify-event'
  | 'add-element' | 'remove-element' | 'modify-element'
  | 'add-slot' | 'remove-slot'
  | 'modify-graph';

export interface PropagationChange {
  type: ChangeType;
  targetId: string;           // component, variable, element ID etc.
  targetName: string;         // human-readable name
  oldValue?: any;
  newValue?: any;
}

export interface PropagationPreview {
  parentId: string;
  parentName: string;
  changes: PropagationChange[];
  affectedChildren: Array<{
    childId: string;
    childName: string;
    changeCount: number;
    hasOverrides: boolean;
    /** Changes that will apply to this child */
    applicableChanges: PropagationChange[];
    /** Changes blocked by overrides in this child */
    blockedChanges: PropagationChange[];
  }>;
}

// ============================================================
//  Callbacks for warning dialogs
// ============================================================

export type PropagationDialogResult = 'save' | 'review' | 'cancel';
export type OutOfSyncResult = 'update' | 'review' | 'ignore';
export type ReparentResult = 'change' | 'cancel';

export interface InheritanceDialogs {
  /** Show warning when editing a parent class */
  showParentEditWarning(parentName: string, childNames: string[]): Promise<boolean>;
  /** Show propagation summary before saving */
  showPropagationPreview(preview: PropagationPreview): Promise<PropagationDialogResult>;
  /** Show out-of-sync alert */
  showOutOfSyncAlert(childName: string, parentName: string, changes: PropagationChange[]): Promise<OutOfSyncResult>;
  /** Show reparent warning */
  showReparentWarning(className: string, oldParentName: string, newParentName: string): Promise<ReparentResult>;
}

// ============================================================
//  InheritanceRegistry — Global registry for class hierarchies
// ============================================================

interface ActorEntry {
  kind: 'actor';
  id: string;
  name: string;
  parentId: string | null;
  childIds: string[];
  classVersion: number;
  parentVersion: number;
  lastSyncedWithParent: string | null;
  /** Per-component override flags (componentId → override data) */
  componentOverrides: Map<string, ComponentOverride>;
  /** Per-variable override flags (variableId → override data) */
  variableOverrides: Map<string, VariableOverride>;
  /** Per-graph/node override flags */
  nodeOverrides: Map<string, NodeOverride>;
  /** Per-function override flags */
  functionOverrides: Map<string, InheritanceFlag & { functionId: string }>;
  /** Per-custom-event override flags */
  eventOverrides: Map<string, EventOverride>;
}

interface WidgetEntry {
  kind: 'widget';
  id: string;
  name: string;
  parentId: string | null;
  childIds: string[];
  classVersion: number;
  parentVersion: number;
  lastSyncedWithParent: string | null;
  /** Per-element override flags (elementId → override data) */
  elementOverrides: Map<string, ElementOverride>;
  /** Per-variable override flags */
  variableOverrides: Map<string, VariableOverride>;
  /** Per-graph/node override flags */
  nodeOverrides: Map<string, NodeOverride>;
  /** Per-function override flags */
  functionOverrides: Map<string, InheritanceFlag & { functionId: string }>;
  /** Per-custom-event override flags */
  eventOverrides: Map<string, EventOverride>;
  /** Named slots defined in this class or inherited */
  namedSlots: Map<string, NamedSlot>;
}

type ClassEntry = ActorEntry | WidgetEntry;

type InheritanceChangeListener = (changedIds: string[], kind: 'actor' | 'widget') => void;

/** Suppress-warnings flag per session */
let _suppressParentWarning = false;

export class ClassInheritanceSystem {
  // ── Singleton ──
  private static _instance: ClassInheritanceSystem | null = null;
  static get instance(): ClassInheritanceSystem {
    if (!ClassInheritanceSystem._instance) {
      ClassInheritanceSystem._instance = new ClassInheritanceSystem();
    }
    return ClassInheritanceSystem._instance;
  }

  // ── Registries ──
  private _actors: Map<string, ActorEntry> = new Map();
  private _widgets: Map<string, WidgetEntry> = new Map();
  private _listeners: InheritanceChangeListener[] = [];

  // ── Asset Manager References (wired at init) ──
  private _actorMgr: ActorAssetManager | null = null;
  private _widgetMgr: WidgetBlueprintManager | null = null;

  // ── Dialog handler (set by UI layer) ──
  private _dialogs: InheritanceDialogs | null = null;

  // ── Setup ──

  setActorManager(mgr: ActorAssetManager): void {
    this._actorMgr = mgr;
  }

  setWidgetManager(mgr: WidgetBlueprintManager): void {
    this._widgetMgr = mgr;
  }

  setDialogs(dialogs: InheritanceDialogs): void {
    this._dialogs = dialogs;
  }

  onInheritanceChanged(cb: InheritanceChangeListener): void {
    this._listeners.push(cb);
  }

  private _notifyListeners(ids: string[], kind: 'actor' | 'widget'): void {
    for (const cb of this._listeners) {
      try { cb(ids, kind); } catch (e) { console.error('[Inheritance] listener error:', e); }
    }
  }

  // ============================================================
  //  Actor Registration
  // ============================================================

  /** Register/update an actor in the inheritance registry (called on load and on save) */
  registerActor(asset: ActorAsset): void {
    const inh = (asset as any)._inheritance as ActorInheritanceData | undefined;
    const existing = this._actors.get(asset.id);

    const entry: ActorEntry = {
      kind: 'actor',
      id: asset.id,
      name: asset.name,
      parentId: inh?.parentClassId ?? null,
      childIds: inh?.childClassIds ? [...inh.childClassIds] : (existing?.childIds ?? []),
      classVersion: inh?.classVersion ?? (existing?.classVersion ?? 1),
      parentVersion: inh?.parentVersion ?? (existing?.parentVersion ?? 0),
      lastSyncedWithParent: inh?.lastSyncedWithParent ?? (existing?.lastSyncedWithParent ?? null),
      componentOverrides: existing?.componentOverrides ?? new Map(),
      variableOverrides: existing?.variableOverrides ?? new Map(),
      nodeOverrides: existing?.nodeOverrides ?? new Map(),
      functionOverrides: existing?.functionOverrides ?? new Map(),
      eventOverrides: existing?.eventOverrides ?? new Map(),
    };

    // Rebuild override maps from the asset's tagged data
    this._rebuildActorOverrides(asset, entry);

    this._actors.set(asset.id, entry);
  }

  /** Unregister an actor */
  unregisterActor(id: string): void {
    const entry = this._actors.get(id);
    if (!entry) return;

    // Remove from parent's child list
    if (entry.parentId) {
      const parent = this._actors.get(entry.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter(c => c !== id);
      }
    }

    // Orphan children (set their parent to null or grandparent)
    for (const childId of entry.childIds) {
      const child = this._actors.get(childId);
      if (child) {
        child.parentId = entry.parentId; // reparent to grandparent
        if (entry.parentId) {
          const grandparent = this._actors.get(entry.parentId);
          if (grandparent && !grandparent.childIds.includes(childId)) {
            grandparent.childIds.push(childId);
          }
        }
      }
    }

    this._actors.delete(id);
  }

  /** Register/update a widget in the inheritance registry */
  registerWidget(asset: WidgetBlueprintAsset): void {
    const inh = (asset as any)._inheritance as WidgetInheritanceData | undefined;
    const existing = this._widgets.get(asset.id);

    const entry: WidgetEntry = {
      kind: 'widget',
      id: asset.id,
      name: asset.name,
      parentId: inh?.parentWidgetId ?? null,
      childIds: inh?.childWidgetIds ? [...inh.childWidgetIds] : (existing?.childIds ?? []),
      classVersion: inh?.classVersion ?? (existing?.classVersion ?? 1),
      parentVersion: inh?.parentVersion ?? (existing?.parentVersion ?? 0),
      lastSyncedWithParent: inh?.lastSyncedWithParent ?? (existing?.lastSyncedWithParent ?? null),
      elementOverrides: existing?.elementOverrides ?? new Map(),
      variableOverrides: existing?.variableOverrides ?? new Map(),
      nodeOverrides: existing?.nodeOverrides ?? new Map(),
      functionOverrides: existing?.functionOverrides ?? new Map(),
      eventOverrides: existing?.eventOverrides ?? new Map(),
      namedSlots: existing?.namedSlots ?? new Map(),
    };

    this._rebuildWidgetOverrides(asset, entry);
    this._widgets.set(asset.id, entry);
  }

  /** Unregister a widget */
  unregisterWidget(id: string): void {
    const entry = this._widgets.get(id);
    if (!entry) return;

    if (entry.parentId) {
      const parent = this._widgets.get(entry.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter(c => c !== id);
      }
    }

    for (const childId of entry.childIds) {
      const child = this._widgets.get(childId);
      if (child) {
        child.parentId = entry.parentId;
        if (entry.parentId) {
          const grandparent = this._widgets.get(entry.parentId);
          if (grandparent && !grandparent.childIds.includes(childId)) {
            grandparent.childIds.push(childId);
          }
        }
      }
    }

    this._widgets.delete(id);
  }

  // ============================================================
  //  Querying
  // ============================================================

  getActorEntry(id: string): ActorEntry | undefined { return this._actors.get(id); }
  getWidgetEntry(id: string): WidgetEntry | undefined { return this._widgets.get(id); }

  getActorParent(id: string): ActorEntry | undefined {
    const entry = this._actors.get(id);
    return entry?.parentId ? this._actors.get(entry.parentId) : undefined;
  }

  getWidgetParent(id: string): WidgetEntry | undefined {
    const entry = this._widgets.get(id);
    return entry?.parentId ? this._widgets.get(entry.parentId) : undefined;
  }

  getActorChildren(id: string): ActorEntry[] {
    const entry = this._actors.get(id);
    if (!entry) return [];
    return entry.childIds.map(cid => this._actors.get(cid)).filter(Boolean) as ActorEntry[];
  }

  getWidgetChildren(id: string): WidgetEntry[] {
    const entry = this._widgets.get(id);
    if (!entry) return [];
    return entry.childIds.map(cid => this._widgets.get(cid)).filter(Boolean) as WidgetEntry[];
  }

  /** Get ALL descendants (recursive) */
  getAllActorDescendants(id: string): ActorEntry[] {
    const result: ActorEntry[] = [];
    const stack = [...this.getActorChildren(id)];
    while (stack.length) {
      const entry = stack.pop()!;
      result.push(entry);
      stack.push(...this.getActorChildren(entry.id));
    }
    return result;
  }

  getAllWidgetDescendants(id: string): WidgetEntry[] {
    const result: WidgetEntry[] = [];
    const stack = [...this.getWidgetChildren(id)];
    while (stack.length) {
      const entry = stack.pop()!;
      result.push(entry);
      stack.push(...this.getWidgetChildren(entry.id));
    }
    return result;
  }

  /** Check if classId is a child of parentId (direct or indirect) */
  isChildOf(classId: string, parentId: string): boolean {
    let current = this._actors.get(classId) || this._widgets.get(classId);
    while (current && current.parentId) {
      if (current.parentId === parentId) return true;
      current = this._actors.get(current.parentId) || this._widgets.get(current.parentId);
    }
    return false;
  }

  /** Check if an actor/widget is a parent (has children) */
  isParentClass(id: string): boolean {
    const a = this._actors.get(id);
    if (a) return a.childIds.length > 0;
    const w = this._widgets.get(id);
    if (w) return w.childIds.length > 0;
    return false;
  }

  /** Check if a class is out of sync with its parent */
  isOutOfSync(id: string): boolean {
    const a = this._actors.get(id);
    if (a && a.parentId) {
      const parent = this._actors.get(a.parentId);
      if (parent) return a.parentVersion < parent.classVersion;
    }
    const w = this._widgets.get(id);
    if (w && w.parentId) {
      const parent = this._widgets.get(w.parentId);
      if (parent) return w.parentVersion < parent.classVersion;
    }
    return false;
  }

  /** Get the complete ancestry chain (from root to this class) */
  getAncestryChain(id: string): string[] {
    const chain: string[] = [];
    let current: ClassEntry | undefined = this._actors.get(id) || this._widgets.get(id);
    while (current) {
      chain.unshift(current.id);
      if (current.parentId) {
        current = this._actors.get(current.parentId) || this._widgets.get(current.parentId);
      } else {
        break;
      }
    }
    return chain;
  }

  /** Get full hierarchy tree for the Class Hierarchy panel */
  getActorHierarchyRoots(): ActorEntry[] {
    return Array.from(this._actors.values()).filter(a => !a.parentId);
  }

  getWidgetHierarchyRoots(): WidgetEntry[] {
    return Array.from(this._widgets.values()).filter(w => !w.parentId);
  }

  // ============================================================
  //  Child Class Creation
  // ============================================================

  /** Create a child Actor from a parent Actor */
  createChildActor(parentId: string, childName: string): ActorAsset | null {
    if (!this._actorMgr) return null;
    const parentAsset = this._actorMgr.getAsset(parentId);
    if (!parentAsset) return null;

    // Ensure the parent is registered in the inheritance system
    if (!this._actors.has(parentId)) {
      this.registerActor(parentAsset);
    }

    // Create the child asset
    const child = this._actorMgr.createAsset(childName, parentAsset.actorType);

    // Copy parent data as inherited
    child.rootMeshType = parentAsset.rootMeshType;
    child.rootCustomMeshAssetId = parentAsset.rootCustomMeshAssetId;
    child.rootPhysics = structuredClone(parentAsset.rootPhysics);
    child.rootMaterialOverrides = structuredClone(parentAsset.rootMaterialOverrides);
    child.characterPawnConfig = parentAsset.characterPawnConfig
      ? structuredClone(parentAsset.characterPawnConfig) : null;
    child.controllerClass = parentAsset.controllerClass;
    child.controllerBlueprintId = parentAsset.controllerBlueprintId;

    // Copy components — mark all as inherited
    child.components = parentAsset.components.map(comp => ({
      ...structuredClone(comp),
    }));

    // Copy blueprint data — variables, functions, macros, events, structs, graphs
    const parentBP = parentAsset.blueprintData;
    const childBP = child.blueprintData;
    childBP.variables = structuredClone(parentBP.variables);
    childBP.functions = parentBP.functions.map(f => ({
      ...structuredClone(f),
    }));
    childBP.macros = structuredClone(parentBP.macros);
    childBP.customEvents = structuredClone(parentBP.customEvents);
    childBP.structs = structuredClone(parentBP.structs);
    childBP.eventGraph = structuredClone(parentBP.eventGraph);
    child.compiledCode = parentAsset.compiledCode;

    // Set up inheritance metadata
    const parentEntry = this._actors.get(parentId);
    const parentVersion = parentEntry?.classVersion ?? 1;

    const childInh: ActorInheritanceData = {
      parentClassId: parentId,
      childClassIds: [],
      classVersion: 1,
      parentVersion: parentVersion,
      lastSyncedWithParent: new Date().toISOString(),
      isParentClass: false,
    };
    (child as any)._inheritance = childInh;

    // Set component override flags
    const compOverrides = new Map<string, ComponentOverride>();
    for (const comp of child.components) {
      compOverrides.set(comp.id, {
        componentId: comp.id,
        isInherited: true,
        inheritedFrom: parentId,
        overridden: false,
        addedInChild: false,
        canOverride: true,
      });
    }

    // Set variable override flags
    const varOverrides = new Map<string, VariableOverride>();
    for (const v of childBP.variables) {
      varOverrides.set(v.id, {
        variableId: v.id,
        isInherited: true,
        inheritedFrom: parentId,
        overridden: false,
        addedInChild: false,
        canOverride: true,
      });
    }

    // Set function override flags
    const funcOverrides = new Map<string, InheritanceFlag & { functionId: string }>();
    for (const fn of childBP.functions) {
      funcOverrides.set(fn.id, {
        functionId: fn.id,
        isInherited: true,
        inheritedFrom: parentId,
        overridden: false,
        addedInChild: false,
        canOverride: true,
      });
    }

    // Set event override flags
    const eventOverrides = new Map<string, EventOverride>();
    for (const evt of childBP.customEvents) {
      eventOverrides.set(evt.id, {
        eventId: evt.id,
        eventName: evt.name,
        isInherited: true,
        inheritedFrom: parentId,
        overridden: false,
        addedInChild: false,
        canOverride: true,
      });
    }

    // Register child
    this.registerActor(child);

    // Update child's override maps
    const childEntry = this._actors.get(child.id)!;
    childEntry.componentOverrides = compOverrides;
    childEntry.variableOverrides = varOverrides;
    childEntry.functionOverrides = funcOverrides;
    childEntry.eventOverrides = eventOverrides;

    // Update parent's child list
    if (parentEntry) {
      if (!parentEntry.childIds.includes(child.id)) {
        parentEntry.childIds.push(child.id);
      }
    }

    // Update parent inheritance data
    const parentInh = (parentAsset as any)._inheritance as ActorInheritanceData | undefined;
    if (parentInh) {
      if (!parentInh.childClassIds.includes(child.id)) {
        parentInh.childClassIds.push(child.id);
      }
      parentInh.isParentClass = true;
    } else {
      (parentAsset as any)._inheritance = {
        parentClassId: null,
        childClassIds: [child.id],
        classVersion: parentEntry?.classVersion ?? 1,
        isParentClass: true,
      } as ActorInheritanceData;
    }

    this._notifyListeners([parentId, child.id], 'actor');
    return child;
  }

  /** Create a child Widget from a parent Widget */
  createChildWidget(parentId: string, childName: string): WidgetBlueprintAsset | null {
    if (!this._widgetMgr) return null;
    const parentAsset = this._widgetMgr.getAsset(parentId);
    if (!parentAsset) return null;

    // Ensure the parent is registered in the inheritance system
    if (!this._widgets.has(parentId)) {
      this.registerWidget(parentAsset);
    }

    const child = this._widgetMgr.createAsset(childName);

    // Copy widget tree from parent
    child.widgets.clear();
    for (const [id, w] of parentAsset.widgets) {
      child.widgets.set(id, structuredClone(w));
    }
    child.rootWidgetId = parentAsset.rootWidgetId;
    child.animations = structuredClone(parentAsset.animations);

    // Copy blueprint data
    const parentBP = parentAsset.blueprintData;
    const childBP = child.blueprintData;
    childBP.variables = structuredClone(parentBP.variables);
    childBP.functions = parentBP.functions.map(f => structuredClone(f));
    childBP.macros = structuredClone(parentBP.macros);
    childBP.customEvents = structuredClone(parentBP.customEvents);
    childBP.structs = structuredClone(parentBP.structs);
    childBP.eventGraph = structuredClone(parentBP.eventGraph);
    child.compiledCode = parentAsset.compiledCode;

    // Set up inheritance metadata
    const parentEntry = this._widgets.get(parentId);
    const parentVersion = parentEntry?.classVersion ?? 1;

    const childInh: WidgetInheritanceData = {
      parentWidgetId: parentId,
      childWidgetIds: [],
      classVersion: 1,
      parentVersion: parentVersion,
      lastSyncedWithParent: new Date().toISOString(),
      isParentClass: false,
    };
    (child as any)._inheritance = childInh;

    // Set element override flags
    const elemOverrides = new Map<string, ElementOverride>();
    for (const [id, w] of child.widgets) {
      elemOverrides.set(id, {
        elementId: id,
        isInherited: true,
        inheritedFrom: parentId,
        overridden: false,
        addedInChild: false,
        canOverride: true,
      });
    }

    // Set variable override flags
    const varOverrides = new Map<string, VariableOverride>();
    for (const v of childBP.variables) {
      varOverrides.set(v.id, {
        variableId: v.id,
        isInherited: true,
        inheritedFrom: parentId,
        overridden: false,
        addedInChild: false,
        canOverride: true,
      });
    }

    // Set function override flags
    const funcOverrides = new Map<string, InheritanceFlag & { functionId: string }>();
    for (const fn of childBP.functions) {
      funcOverrides.set(fn.id, {
        functionId: fn.id,
        isInherited: true,
        inheritedFrom: parentId,
        overridden: false,
        addedInChild: false,
        canOverride: true,
      });
    }

    const eventOverrides = new Map<string, EventOverride>();
    for (const evt of childBP.customEvents) {
      eventOverrides.set(evt.id, {
        eventId: evt.id,
        eventName: evt.name,
        isInherited: true,
        inheritedFrom: parentId,
        overridden: false,
        addedInChild: false,
        canOverride: true,
      });
    }

    // Track named slots
    const namedSlots = new Map<string, NamedSlot>();
    for (const [id, w] of child.widgets) {
      if ((w as any).elementType === 'NamedSlot' || (w as any).slotName) {
        namedSlots.set(id, {
          slotId: id,
          slotName: (w as any).slotName || w.name,
          definedIn: parentId,
        });
      }
    }

    // Register child
    this.registerWidget(child);

    const childEntry = this._widgets.get(child.id)!;
    childEntry.elementOverrides = elemOverrides;
    childEntry.variableOverrides = varOverrides;
    childEntry.functionOverrides = funcOverrides;
    childEntry.eventOverrides = eventOverrides;
    childEntry.namedSlots = namedSlots;

    // Update parent
    if (parentEntry) {
      if (!parentEntry.childIds.includes(child.id)) {
        parentEntry.childIds.push(child.id);
      }
    }

    const parentInh = (parentAsset as any)._inheritance as WidgetInheritanceData | undefined;
    if (parentInh) {
      if (!parentInh.childWidgetIds.includes(child.id)) {
        parentInh.childWidgetIds.push(child.id);
      }
      parentInh.isParentClass = true;
    } else {
      (parentAsset as any)._inheritance = {
        parentWidgetId: null,
        childWidgetIds: [child.id],
        classVersion: parentEntry?.classVersion ?? 1,
        isParentClass: true,
      } as WidgetInheritanceData;
    }

    this._notifyListeners([parentId, child.id], 'widget');
    return child;
  }

  // ============================================================
  //  Propagation Engine — Real-time parent → child updates
  // ============================================================

  /**
   * Called when a parent Actor is saved. Detects changes, optionally shows
   * a propagation preview dialog, then propagates to ALL descendants in real time.
   * Returns true if propagation completed, false if cancelled.
   */
  async propagateActorChanges(parentId: string, showDialog: boolean = true): Promise<boolean> {
    if (!this._actorMgr) return false;
    const parentAsset = this._actorMgr.getAsset(parentId);
    if (!parentAsset) return false;

    const parentEntry = this._actors.get(parentId);
    if (!parentEntry || parentEntry.childIds.length === 0) return true; // No children to propagate to

    // Increment parent version
    parentEntry.classVersion++;
    const parentInh = (parentAsset as any)._inheritance as ActorInheritanceData | undefined;
    if (parentInh) parentInh.classVersion = parentEntry.classVersion;

    // Detect changes by comparing parent state against children
    const preview = this._buildActorPropagationPreview(parentAsset, parentEntry);

    // Optionally show dialog
    if (showDialog && this._dialogs && preview.changes.length > 0) {
      const result = await this._dialogs.showPropagationPreview(preview);
      if (result === 'cancel') {
        parentEntry.classVersion--; // revert version bump
        if (parentInh) parentInh.classVersion = parentEntry.classVersion;
        return false;
      }
    }

    // Propagate to all descendants (depth-first)
    this._propagateActorToDescendants(parentAsset, parentEntry);

    // Notify listeners for real-time UI updates
    const affectedIds = [parentId, ...this.getAllActorDescendants(parentId).map(d => d.id)];
    this._notifyListeners(affectedIds, 'actor');

    return true;
  }

  /** Propagate widget changes from parent to all descendants */
  async propagateWidgetChanges(parentId: string, showDialog: boolean = true): Promise<boolean> {
    if (!this._widgetMgr) return false;
    const parentAsset = this._widgetMgr.getAsset(parentId);
    if (!parentAsset) return false;

    const parentEntry = this._widgets.get(parentId);
    if (!parentEntry || parentEntry.childIds.length === 0) return true;

    parentEntry.classVersion++;
    const parentInh = (parentAsset as any)._inheritance as WidgetInheritanceData | undefined;
    if (parentInh) parentInh.classVersion = parentEntry.classVersion;

    const preview = this._buildWidgetPropagationPreview(parentAsset, parentEntry);

    if (showDialog && this._dialogs && preview.changes.length > 0) {
      const result = await this._dialogs.showPropagationPreview(preview);
      if (result === 'cancel') {
        parentEntry.classVersion--;
        if (parentInh) parentInh.classVersion = parentEntry.classVersion;
        return false;
      }
    }

    this._propagateWidgetToDescendants(parentAsset, parentEntry);

    const affectedIds = [parentId, ...this.getAllWidgetDescendants(parentId).map(d => d.id)];
    this._notifyListeners(affectedIds, 'widget');

    return true;
  }

  // ============================================================
  //  Internal — Actor Propagation
  // ============================================================

  private _propagateActorToDescendants(parentAsset: ActorAsset, parentEntry: ActorEntry): void {
    // Process direct children first (breadth-first)
    const queue = [...parentEntry.childIds];
    const processed = new Set<string>();

    while (queue.length > 0) {
      const childId = queue.shift()!;
      if (processed.has(childId)) continue;
      processed.add(childId);

      const childEntry = this._actors.get(childId);
      if (!childEntry) continue;

      const childAsset = this._actorMgr?.getAsset(childId);
      if (!childAsset) continue;

      this._propagateActorToChild(parentAsset, parentEntry, childAsset, childEntry);

      // Queue grandchildren
      for (const grandchildId of childEntry.childIds) {
        queue.push(grandchildId);
      }
    }
  }

  private _propagateActorToChild(
    parentAsset: ActorAsset,
    parentEntry: ActorEntry,
    childAsset: ActorAsset,
    childEntry: ActorEntry,
  ): void {
    // Only propagate directly from the child's direct parent
    // For grandchildren, the child itself acts as the "parent" after being updated
    const directParentId = childEntry.parentId;
    if (!directParentId) return;

    const directParent = this._actorMgr?.getAsset(directParentId);
    if (!directParent) return;

    // 1. Propagate components
    this._propagateActorComponents(directParent, childAsset, childEntry);

    // 2. Propagate variables
    this._propagateActorVariables(directParent, childAsset, childEntry);

    // 3. Propagate functions
    this._propagateActorFunctions(directParent, childAsset, childEntry);

    // 4. Propagate macros
    this._propagateActorMacros(directParent, childAsset, childEntry);

    // 5. Propagate custom events
    this._propagateActorCustomEvents(directParent, childAsset, childEntry);

    // 6. Propagate event graph (if not overridden)
    this._propagateActorEventGraph(directParent, childAsset, childEntry);

    // 7. Propagate root properties (if not overridden)
    if (!childEntry.componentOverrides.has('__root__')) {
      childAsset.rootMeshType = directParent.rootMeshType;
      childAsset.rootCustomMeshAssetId = directParent.rootCustomMeshAssetId;
      childAsset.rootPhysics = structuredClone(directParent.rootPhysics);
      childAsset.rootMaterialOverrides = structuredClone(directParent.rootMaterialOverrides);
    }

    // Update sync info
    const directParentEntry = this._actors.get(directParentId);
    childEntry.parentVersion = directParentEntry?.classVersion ?? parentEntry.classVersion;
    childEntry.lastSyncedWithParent = new Date().toISOString();
    childEntry.classVersion++; // bump child version too (cascading)

    // Update asset's inheritance metadata
    const childInh = (childAsset as any)._inheritance as ActorInheritanceData | undefined;
    if (childInh) {
      childInh.parentVersion = childEntry.parentVersion;
      childInh.lastSyncedWithParent = childEntry.lastSyncedWithParent!;
      childInh.classVersion = childEntry.classVersion;
    }

    childAsset.touch();

    // Notify the asset manager
    this._actorMgr?.notifyAssetChanged(childAsset.id);
  }

  private _propagateActorComponents(parent: ActorAsset, child: ActorAsset, childEntry: ActorEntry): void {
    const parentCompIds = new Set(parent.components.map(c => c.id));
    const childCompIds = new Set(child.components.map(c => c.id));

    // Add new components from parent
    for (const comp of parent.components) {
      if (!childCompIds.has(comp.id)) {
        child.components.push(structuredClone(comp));
        childEntry.componentOverrides.set(comp.id, {
          componentId: comp.id,
          isInherited: true,
          inheritedFrom: childEntry.parentId!,
          overridden: false,
          addedInChild: false,
          canOverride: true,
        });
      }
    }

    // Remove components that parent removed (but warn if child has override)
    const toRemove: string[] = [];
    for (const comp of child.components) {
      const override = childEntry.componentOverrides.get(comp.id);
      if (override?.isInherited && !override.addedInChild && !parentCompIds.has(comp.id)) {
        toRemove.push(comp.id);
      }
    }
    if (toRemove.length > 0) {
      child.components = child.components.filter(c => !toRemove.includes(c.id));
      for (const id of toRemove) {
        childEntry.componentOverrides.delete(id);
      }
    }

    // Update non-overridden inherited components with parent values
    for (const comp of child.components) {
      const override = childEntry.componentOverrides.get(comp.id);
      if (override?.isInherited && !override.overridden && !override.addedInChild) {
        const parentComp = parent.components.find(c => c.id === comp.id);
        if (parentComp) {
          Object.assign(comp, structuredClone(parentComp));
        }
      }
    }
  }

  private _propagateActorVariables(parent: ActorAsset, child: ActorAsset, childEntry: ActorEntry): void {
    const parentVarIds = new Set(parent.blueprintData.variables.map(v => v.id));
    const childVarIds = new Set(child.blueprintData.variables.map(v => v.id));

    // Add new variables from parent
    for (const v of parent.blueprintData.variables) {
      if (!childVarIds.has(v.id)) {
        child.blueprintData.variables.push(structuredClone(v));
        childEntry.variableOverrides.set(v.id, {
          variableId: v.id,
          isInherited: true,
          inheritedFrom: childEntry.parentId!,
          overridden: false,
          addedInChild: false,
          canOverride: true,
        });
      }
    }

    // Remove variables that parent removed
    const toRemove: string[] = [];
    for (const v of child.blueprintData.variables) {
      const override = childEntry.variableOverrides.get(v.id);
      if (override?.isInherited && !override.addedInChild && !parentVarIds.has(v.id)) {
        toRemove.push(v.id);
      }
    }
    if (toRemove.length > 0) {
      child.blueprintData.variables = child.blueprintData.variables.filter(v => !toRemove.includes(v.id));
      for (const id of toRemove) childEntry.variableOverrides.delete(id);
    }

    // Update non-overridden inherited variables
    for (const v of child.blueprintData.variables) {
      const override = childEntry.variableOverrides.get(v.id);
      if (override?.isInherited && !override.overridden && !override.addedInChild) {
        const parentVar = parent.blueprintData.variables.find(pv => pv.id === v.id);
        if (parentVar) {
          v.name = parentVar.name;
          v.type = parentVar.type;
          v.defaultValue = structuredClone(parentVar.defaultValue);
        }
      }
    }
  }

  private _propagateActorFunctions(parent: ActorAsset, child: ActorAsset, childEntry: ActorEntry): void {
    const parentFnIds = new Set(parent.blueprintData.functions.map(f => f.id));
    const childFnIds = new Set(child.blueprintData.functions.map(f => f.id));

    // Add new functions
    for (const fn of parent.blueprintData.functions) {
      if (!childFnIds.has(fn.id)) {
        child.blueprintData.functions.push(structuredClone(fn));
        childEntry.functionOverrides.set(fn.id, {
          functionId: fn.id,
          isInherited: true,
          inheritedFrom: childEntry.parentId!,
          overridden: false,
          addedInChild: false,
          canOverride: true,
        });
      }
    }

    // Remove functions that parent removed
    const toRemove: string[] = [];
    for (const fn of child.blueprintData.functions) {
      const override = childEntry.functionOverrides.get(fn.id);
      if (override?.isInherited && !override.addedInChild && !parentFnIds.has(fn.id)) {
        toRemove.push(fn.id);
      }
    }
    if (toRemove.length > 0) {
      child.blueprintData.functions = child.blueprintData.functions.filter(f => !toRemove.includes(f.id));
      for (const id of toRemove) childEntry.functionOverrides.delete(id);
    }

    // Update non-overridden inherited functions
    for (const fn of child.blueprintData.functions) {
      const override = childEntry.functionOverrides.get(fn.id);
      if (override?.isInherited && !override.overridden && !override.addedInChild) {
        const parentFn = parent.blueprintData.functions.find(f => f.id === fn.id);
        if (parentFn) {
          fn.name = parentFn.name;
          fn.inputs = structuredClone(parentFn.inputs);
          fn.outputs = structuredClone(parentFn.outputs);
          fn.localVariables = structuredClone(parentFn.localVariables);
          fn.graph = structuredClone(parentFn.graph);
        }
      }
    }
  }

  private _propagateActorMacros(parent: ActorAsset, child: ActorAsset, childEntry: ActorEntry): void {
    const parentIds = new Set(parent.blueprintData.macros.map(m => m.id));
    const childIds = new Set(child.blueprintData.macros.map(m => m.id));

    for (const m of parent.blueprintData.macros) {
      if (!childIds.has(m.id)) {
        child.blueprintData.macros.push(structuredClone(m));
      }
    }

    // Remove macros that parent removed (only inherited ones)
    child.blueprintData.macros = child.blueprintData.macros.filter(m => {
      return parentIds.has(m.id) || !this._isInheritedMacro(m.id, childEntry);
    });

    // Update non-overridden macros
    for (const m of child.blueprintData.macros) {
      if (this._isInheritedMacro(m.id, childEntry)) {
        const parentMacro = parent.blueprintData.macros.find(pm => pm.id === m.id);
        if (parentMacro) {
          m.name = parentMacro.name;
          m.inputs = structuredClone(parentMacro.inputs);
          m.outputs = structuredClone(parentMacro.outputs);
          m.graph = structuredClone(parentMacro.graph);
        }
      }
    }
  }

  private _propagateActorCustomEvents(parent: ActorAsset, child: ActorAsset, childEntry: ActorEntry): void {
    const parentEvtIds = new Set(parent.blueprintData.customEvents.map(e => e.id));
    const childEvtIds = new Set(child.blueprintData.customEvents.map(e => e.id));

    // Add new events
    for (const evt of parent.blueprintData.customEvents) {
      if (!childEvtIds.has(evt.id)) {
        child.blueprintData.customEvents.push(structuredClone(evt));
        childEntry.eventOverrides.set(evt.id, {
          eventId: evt.id,
          eventName: evt.name,
          isInherited: true,
          inheritedFrom: childEntry.parentId!,
          overridden: false,
          addedInChild: false,
          canOverride: true,
        });
      }
    }

    // Remove events that parent removed
    const toRemove: string[] = [];
    for (const evt of child.blueprintData.customEvents) {
      const override = childEntry.eventOverrides.get(evt.id);
      if (override?.isInherited && !override.addedInChild && !parentEvtIds.has(evt.id)) {
        toRemove.push(evt.id);
      }
    }
    if (toRemove.length > 0) {
      child.blueprintData.customEvents = child.blueprintData.customEvents.filter(e => !toRemove.includes(e.id));
      for (const id of toRemove) childEntry.eventOverrides.delete(id);
    }

    // Update non-overridden inherited events
    for (const evt of child.blueprintData.customEvents) {
      const override = childEntry.eventOverrides.get(evt.id);
      if (override?.isInherited && !override.overridden && !override.addedInChild) {
        const parentEvt = parent.blueprintData.customEvents.find(e => e.id === evt.id);
        if (parentEvt) {
          evt.name = parentEvt.name;
          evt.params = structuredClone(parentEvt.params);
        }
      }
    }
  }

  private _propagateActorEventGraph(parent: ActorAsset, child: ActorAsset, childEntry: ActorEntry): void {
    // Event graph propagation: only if child hasn't overridden the graph
    const graphOverride = childEntry.nodeOverrides.get('__eventGraph__');
    if (!graphOverride || !graphOverride.overridden) {
      child.blueprintData.eventGraph = structuredClone(parent.blueprintData.eventGraph);
      child.compiledCode = parent.compiledCode;
    }
  }

  // ============================================================
  //  Internal — Widget Propagation
  // ============================================================

  private _propagateWidgetToDescendants(parentAsset: WidgetBlueprintAsset, parentEntry: WidgetEntry): void {
    const queue = [...parentEntry.childIds];
    const processed = new Set<string>();

    while (queue.length > 0) {
      const childId = queue.shift()!;
      if (processed.has(childId)) continue;
      processed.add(childId);

      const childEntry = this._widgets.get(childId);
      if (!childEntry) continue;

      const childAsset = this._widgetMgr?.getAsset(childId);
      if (!childAsset) continue;

      this._propagateWidgetToChild(parentAsset, parentEntry, childAsset, childEntry);

      for (const grandchildId of childEntry.childIds) {
        queue.push(grandchildId);
      }
    }
  }

  private _propagateWidgetToChild(
    parentAsset: WidgetBlueprintAsset,
    parentEntry: WidgetEntry,
    childAsset: WidgetBlueprintAsset,
    childEntry: WidgetEntry,
  ): void {
    const directParentId = childEntry.parentId;
    if (!directParentId) return;

    const directParent = this._widgetMgr?.getAsset(directParentId);
    if (!directParent) return;

    // 1. Propagate elements (widget tree)
    this._propagateWidgetElements(directParent, childAsset, childEntry);

    // 2. Propagate variables
    this._propagateWidgetVariables(directParent, childAsset, childEntry);

    // 3. Propagate functions
    this._propagateWidgetFunctions(directParent, childAsset, childEntry);

    // 4. Propagate custom events
    this._propagateWidgetCustomEvents(directParent, childAsset, childEntry);

    // 5. Propagate event graph
    this._propagateWidgetEventGraph(directParent, childAsset, childEntry);

    // Update sync info
    const directParentEntry = this._widgets.get(directParentId);
    childEntry.parentVersion = directParentEntry?.classVersion ?? parentEntry.classVersion;
    childEntry.lastSyncedWithParent = new Date().toISOString();
    childEntry.classVersion++;

    const childInh = (childAsset as any)._inheritance as WidgetInheritanceData | undefined;
    if (childInh) {
      childInh.parentVersion = childEntry.parentVersion;
      childInh.lastSyncedWithParent = childEntry.lastSyncedWithParent!;
      childInh.classVersion = childEntry.classVersion;
    }

    childAsset.touch();
    this._widgetMgr?.notifyAssetChanged(childAsset.id);
  }

  private _propagateWidgetElements(parent: WidgetBlueprintAsset, child: WidgetBlueprintAsset, childEntry: WidgetEntry): void {
    const parentElementIds = new Set(parent.widgets.keys());

    // Add new elements from parent
    for (const [id, w] of parent.widgets) {
      if (!child.widgets.has(id)) {
        child.widgets.set(id, structuredClone(w));
        childEntry.elementOverrides.set(id, {
          elementId: id,
          isInherited: true,
          inheritedFrom: childEntry.parentId!,
          overridden: false,
          addedInChild: false,
          canOverride: true,
        });
      }
    }

    // Remove elements that parent removed (only inherited ones)
    const toRemove: string[] = [];
    for (const [id] of child.widgets) {
      const override = childEntry.elementOverrides.get(id);
      if (override?.isInherited && !override.addedInChild && !parentElementIds.has(id)) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      child.widgets.delete(id);
      childEntry.elementOverrides.delete(id);
    }

    // Update non-overridden inherited elements
    for (const [id, w] of child.widgets) {
      const override = childEntry.elementOverrides.get(id);
      if (override?.isInherited && !override.overridden && !override.addedInChild) {
        const parentWidget = parent.widgets.get(id);
        if (parentWidget) {
          // Preserve the child's widget ID but update everything else
          const cloned = structuredClone(parentWidget);
          child.widgets.set(id, cloned);
        }
      }
    }
  }

  private _propagateWidgetVariables(parent: WidgetBlueprintAsset, child: WidgetBlueprintAsset, childEntry: WidgetEntry): void {
    const parentVarIds = new Set(parent.blueprintData.variables.map(v => v.id));
    const childVarIds = new Set(child.blueprintData.variables.map(v => v.id));

    for (const v of parent.blueprintData.variables) {
      if (!childVarIds.has(v.id)) {
        child.blueprintData.variables.push(structuredClone(v));
        childEntry.variableOverrides.set(v.id, {
          variableId: v.id,
          isInherited: true,
          inheritedFrom: childEntry.parentId!,
          overridden: false,
          addedInChild: false,
          canOverride: true,
        });
      }
    }

    const toRemove: string[] = [];
    for (const v of child.blueprintData.variables) {
      const override = childEntry.variableOverrides.get(v.id);
      if (override?.isInherited && !override.addedInChild && !parentVarIds.has(v.id)) {
        toRemove.push(v.id);
      }
    }
    if (toRemove.length > 0) {
      child.blueprintData.variables = child.blueprintData.variables.filter(v => !toRemove.includes(v.id));
      for (const id of toRemove) childEntry.variableOverrides.delete(id);
    }

    for (const v of child.blueprintData.variables) {
      const override = childEntry.variableOverrides.get(v.id);
      if (override?.isInherited && !override.overridden && !override.addedInChild) {
        const parentVar = parent.blueprintData.variables.find(pv => pv.id === v.id);
        if (parentVar) {
          v.name = parentVar.name;
          v.type = parentVar.type;
          v.defaultValue = structuredClone(parentVar.defaultValue);
        }
      }
    }
  }

  private _propagateWidgetFunctions(parent: WidgetBlueprintAsset, child: WidgetBlueprintAsset, childEntry: WidgetEntry): void {
    const parentFnIds = new Set(parent.blueprintData.functions.map(f => f.id));
    const childFnIds = new Set(child.blueprintData.functions.map(f => f.id));

    for (const fn of parent.blueprintData.functions) {
      if (!childFnIds.has(fn.id)) {
        child.blueprintData.functions.push(structuredClone(fn));
        childEntry.functionOverrides.set(fn.id, {
          functionId: fn.id,
          isInherited: true,
          inheritedFrom: childEntry.parentId!,
          overridden: false,
          addedInChild: false,
          canOverride: true,
        });
      }
    }

    const toRemove: string[] = [];
    for (const fn of child.blueprintData.functions) {
      const override = childEntry.functionOverrides.get(fn.id);
      if (override?.isInherited && !override.addedInChild && !parentFnIds.has(fn.id)) {
        toRemove.push(fn.id);
      }
    }
    if (toRemove.length > 0) {
      child.blueprintData.functions = child.blueprintData.functions.filter(f => !toRemove.includes(f.id));
      for (const id of toRemove) childEntry.functionOverrides.delete(id);
    }

    for (const fn of child.blueprintData.functions) {
      const override = childEntry.functionOverrides.get(fn.id);
      if (override?.isInherited && !override.overridden && !override.addedInChild) {
        const parentFn = parent.blueprintData.functions.find(f => f.id === fn.id);
        if (parentFn) {
          fn.name = parentFn.name;
          fn.inputs = structuredClone(parentFn.inputs);
          fn.outputs = structuredClone(parentFn.outputs);
          fn.localVariables = structuredClone(parentFn.localVariables);
          fn.graph = structuredClone(parentFn.graph);
        }
      }
    }
  }

  private _propagateWidgetCustomEvents(parent: WidgetBlueprintAsset, child: WidgetBlueprintAsset, childEntry: WidgetEntry): void {
    const parentEvtIds = new Set(parent.blueprintData.customEvents.map(e => e.id));
    const childEvtIds = new Set(child.blueprintData.customEvents.map(e => e.id));

    for (const evt of parent.blueprintData.customEvents) {
      if (!childEvtIds.has(evt.id)) {
        child.blueprintData.customEvents.push(structuredClone(evt));
        childEntry.eventOverrides.set(evt.id, {
          eventId: evt.id,
          eventName: evt.name,
          isInherited: true,
          inheritedFrom: childEntry.parentId!,
          overridden: false,
          addedInChild: false,
          canOverride: true,
        });
      }
    }

    const toRemove: string[] = [];
    for (const evt of child.blueprintData.customEvents) {
      const override = childEntry.eventOverrides.get(evt.id);
      if (override?.isInherited && !override.addedInChild && !parentEvtIds.has(evt.id)) {
        toRemove.push(evt.id);
      }
    }
    if (toRemove.length > 0) {
      child.blueprintData.customEvents = child.blueprintData.customEvents.filter(e => !toRemove.includes(e.id));
      for (const id of toRemove) childEntry.eventOverrides.delete(id);
    }

    for (const evt of child.blueprintData.customEvents) {
      const override = childEntry.eventOverrides.get(evt.id);
      if (override?.isInherited && !override.overridden && !override.addedInChild) {
        const parentEvt = parent.blueprintData.customEvents.find(e => e.id === evt.id);
        if (parentEvt) {
          evt.name = parentEvt.name;
          evt.params = structuredClone(parentEvt.params);
        }
      }
    }
  }

  private _propagateWidgetEventGraph(parent: WidgetBlueprintAsset, child: WidgetBlueprintAsset, childEntry: WidgetEntry): void {
    const graphOverride = childEntry.nodeOverrides.get('__eventGraph__');
    if (!graphOverride || !graphOverride.overridden) {
      child.blueprintData.eventGraph = structuredClone(parent.blueprintData.eventGraph);
      child.compiledCode = parent.compiledCode;
    }
  }

  // ============================================================
  //  Override Management
  // ============================================================

  /** Mark a component as overridden in a child actor */
  setActorComponentOverride(childId: string, componentId: string, overrideData: Partial<ActorComponentData>): void {
    const entry = this._actors.get(childId);
    if (!entry) return;

    const existing = entry.componentOverrides.get(componentId);
    if (existing && existing.isInherited) {
      existing.overridden = true;
      existing.overrideData = overrideData;
    }
  }

  /** Reset a component override to parent value */
  resetActorComponentOverride(childId: string, componentId: string): void {
    const entry = this._actors.get(childId);
    if (!entry) return;

    const existing = entry.componentOverrides.get(componentId);
    if (existing && existing.isInherited) {
      existing.overridden = false;
      delete existing.overrideData;

      // Re-fetch parent value
      if (entry.parentId && this._actorMgr) {
        const parent = this._actorMgr.getAsset(entry.parentId);
        const child = this._actorMgr.getAsset(childId);
        if (parent && child) {
          const parentComp = parent.components.find(c => c.id === componentId);
          if (parentComp) {
            const idx = child.components.findIndex(c => c.id === componentId);
            if (idx >= 0) {
              child.components[idx] = structuredClone(parentComp);
            }
          }
        }
      }
    }

    this._notifyListeners([childId], 'actor');
  }

  /** Mark a variable as overridden in a child */
  setActorVariableOverride(childId: string, variableId: string, overrideValue: any): void {
    const entry = this._actors.get(childId);
    if (!entry) return;

    const existing = entry.variableOverrides.get(variableId);
    if (existing && existing.isInherited) {
      existing.overridden = true;
      existing.overrideValue = overrideValue;
    }
  }

  /** Reset a variable override to parent value */
  resetActorVariableOverride(childId: string, variableId: string): void {
    const entry = this._actors.get(childId);
    if (!entry) return;

    const existing = entry.variableOverrides.get(variableId);
    if (existing && existing.isInherited) {
      existing.overridden = false;
      delete existing.overrideValue;

      if (entry.parentId && this._actorMgr) {
        const parent = this._actorMgr.getAsset(entry.parentId);
        const child = this._actorMgr.getAsset(childId);
        if (parent && child) {
          const parentVar = parent.blueprintData.variables.find(v => v.id === variableId);
          const childVar = child.blueprintData.variables.find(v => v.id === variableId);
          if (parentVar && childVar) {
            childVar.defaultValue = structuredClone(parentVar.defaultValue);
          }
        }
      }
    }

    this._notifyListeners([childId], 'actor');
  }

  /** Mark event graph as overridden in a child */
  setEventGraphOverride(childId: string, kind: 'actor' | 'widget'): void {
    const entries = kind === 'actor' ? this._actors : this._widgets;
    const entry = entries.get(childId);
    if (!entry) return;

    entry.nodeOverrides.set('__eventGraph__', {
      nodeId: '__eventGraph__',
      isInherited: true,
      inheritedFrom: entry.parentId ?? undefined,
      overridden: true,
      addedInChild: false,
    });
  }

  /** Reset event graph override */
  resetEventGraphOverride(childId: string, kind: 'actor' | 'widget'): void {
    const entries = kind === 'actor' ? this._actors : this._widgets;
    const entry = entries.get(childId);
    if (!entry) return;

    entry.nodeOverrides.delete('__eventGraph__');

    // Re-fetch parent graph
    if (entry.parentId) {
      if (kind === 'actor' && this._actorMgr) {
        const parent = this._actorMgr.getAsset(entry.parentId);
        const child = this._actorMgr.getAsset(childId);
        if (parent && child) {
          child.blueprintData.eventGraph = structuredClone(parent.blueprintData.eventGraph);
          child.compiledCode = parent.compiledCode;
        }
      } else if (kind === 'widget' && this._widgetMgr) {
        const parent = this._widgetMgr.getAsset(entry.parentId);
        const child = this._widgetMgr.getAsset(childId);
        if (parent && child) {
          child.blueprintData.eventGraph = structuredClone(parent.blueprintData.eventGraph);
          child.compiledCode = parent.compiledCode;
        }
      }
    }

    this._notifyListeners([childId], kind);
  }

  /** Mark a widget element as overridden */
  setWidgetElementOverride(childId: string, elementId: string, overrideData?: Partial<WidgetNodeJSON>): void {
    const entry = this._widgets.get(childId);
    if (!entry) return;

    const existing = entry.elementOverrides.get(elementId);
    if (existing && existing.isInherited) {
      existing.overridden = true;
      if (overrideData) existing.overrideData = overrideData;
    }
  }

  /** Reset widget element override */
  resetWidgetElementOverride(childId: string, elementId: string): void {
    const entry = this._widgets.get(childId);
    if (!entry) return;

    const existing = entry.elementOverrides.get(elementId);
    if (existing && existing.isInherited) {
      existing.overridden = false;
      delete existing.overrideData;
      delete existing.slotContent;

      if (entry.parentId && this._widgetMgr) {
        const parent = this._widgetMgr.getAsset(entry.parentId);
        const child = this._widgetMgr.getAsset(childId);
        if (parent && child) {
          const parentWidget = parent.widgets.get(elementId);
          if (parentWidget) {
            child.widgets.set(elementId, structuredClone(parentWidget));
          }
        }
      }
    }

    this._notifyListeners([childId], 'widget');
  }

  /** Set widget variable override */
  setWidgetVariableOverride(childId: string, variableId: string, overrideValue: any): void {
    const entry = this._widgets.get(childId);
    if (!entry) return;

    const existing = entry.variableOverrides.get(variableId);
    if (existing && existing.isInherited) {
      existing.overridden = true;
      existing.overrideValue = overrideValue;
    }
  }

  /** Reset widget variable override */
  resetWidgetVariableOverride(childId: string, variableId: string): void {
    const entry = this._widgets.get(childId);
    if (!entry) return;

    const existing = entry.variableOverrides.get(variableId);
    if (existing && existing.isInherited) {
      existing.overridden = false;
      delete existing.overrideValue;

      if (entry.parentId && this._widgetMgr) {
        const parent = this._widgetMgr.getAsset(entry.parentId);
        const child = this._widgetMgr.getAsset(childId);
        if (parent && child) {
          const parentVar = parent.blueprintData.variables.find(v => v.id === variableId);
          const childVar = child.blueprintData.variables.find(v => v.id === variableId);
          if (parentVar && childVar) {
            childVar.defaultValue = structuredClone(parentVar.defaultValue);
          }
        }
      }
    }

    this._notifyListeners([childId], 'widget');
  }

  // ============================================================
  //  Reparenting
  // ============================================================

  /** Change the parent of an actor class */
  async reparentActor(childId: string, newParentId: string | null): Promise<boolean> {
    const childEntry = this._actors.get(childId);
    if (!childEntry) return false;

    const childAsset = this._actorMgr?.getAsset(childId);
    if (!childAsset) return false;

    const oldParentId = childEntry.parentId;
    const oldParentName = oldParentId ? (this._actors.get(oldParentId)?.name ?? 'Unknown') : 'None';
    const newParentName = newParentId ? (this._actors.get(newParentId)?.name ?? 'Unknown') : 'None';

    // Show warning
    if (this._dialogs) {
      const result = await this._dialogs.showReparentWarning(childEntry.name, oldParentName, newParentName);
      if (result === 'cancel') return false;
    }

    // Remove from old parent
    if (oldParentId) {
      const oldParent = this._actors.get(oldParentId);
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter(id => id !== childId);
        const oldParentAsset = this._actorMgr?.getAsset(oldParentId);
        if (oldParentAsset) {
          const inh = (oldParentAsset as any)._inheritance as ActorInheritanceData | undefined;
          if (inh) {
            inh.childClassIds = inh.childClassIds.filter(id => id !== childId);
            inh.isParentClass = inh.childClassIds.length > 0;
          }
        }
      }
    }

    // Clear old inheritance flags
    childEntry.componentOverrides.clear();
    childEntry.variableOverrides.clear();
    childEntry.nodeOverrides.clear();
    childEntry.functionOverrides.clear();
    childEntry.eventOverrides.clear();

    // Set new parent
    childEntry.parentId = newParentId;

    if (newParentId) {
      const newParent = this._actors.get(newParentId);
      if (newParent) {
        if (!newParent.childIds.includes(childId)) {
          newParent.childIds.push(childId);
        }
        childEntry.parentVersion = newParent.classVersion;
      }

      const newParentAsset = this._actorMgr?.getAsset(newParentId);
      if (newParentAsset) {
        const inh = (newParentAsset as any)._inheritance as ActorInheritanceData | undefined;
        if (inh) {
          if (!inh.childClassIds.includes(childId)) inh.childClassIds.push(childId);
          inh.isParentClass = true;
        } else {
          (newParentAsset as any)._inheritance = {
            parentClassId: null,
            childClassIds: [childId],
            classVersion: newParent?.classVersion ?? 1,
            isParentClass: true,
          } as ActorInheritanceData;
        }

        // Re-propagate from new parent
        this._propagateActorToChild(newParentAsset, this._actors.get(newParentId)!, childAsset, childEntry);
      }
    }

    // Update child's inheritance metadata
    const childInh = (childAsset as any)._inheritance as ActorInheritanceData | undefined;
    if (childInh) {
      childInh.parentClassId = newParentId;
    } else {
      (childAsset as any)._inheritance = {
        parentClassId: newParentId,
        childClassIds: childEntry.childIds,
        classVersion: childEntry.classVersion,
        isParentClass: childEntry.childIds.length > 0,
      } as ActorInheritanceData;
    }

    childEntry.lastSyncedWithParent = new Date().toISOString();

    const affectedIds = [childId];
    if (oldParentId) affectedIds.push(oldParentId);
    if (newParentId) affectedIds.push(newParentId);
    this._notifyListeners(affectedIds, 'actor');

    return true;
  }

  // ============================================================
  //  Propagation Preview
  // ============================================================

  private _buildActorPropagationPreview(parentAsset: ActorAsset, parentEntry: ActorEntry): PropagationPreview {
    const changes: PropagationChange[] = [];
    const affectedChildren: PropagationPreview['affectedChildren'] = [];

    // We compare parent state against each child to detect what will change
    for (const childId of parentEntry.childIds) {
      const childEntry = this._actors.get(childId);
      const childAsset = this._actorMgr?.getAsset(childId);
      if (!childEntry || !childAsset) continue;

      const applicableChanges: PropagationChange[] = [];
      const blockedChanges: PropagationChange[] = [];

      // Check components
      const parentCompIds = new Set(parentAsset.components.map(c => c.id));
      const childCompIds = new Set(childAsset.components.map(c => c.id));

      for (const comp of parentAsset.components) {
        if (!childCompIds.has(comp.id)) {
          const change: PropagationChange = { type: 'add-component', targetId: comp.id, targetName: comp.name };
          changes.push(change);
          applicableChanges.push(change);
        }
      }

      // Check variables
      for (const v of parentAsset.blueprintData.variables) {
        const childVar = childAsset.blueprintData.variables.find(cv => cv.id === v.id);
        if (!childVar) {
          const change: PropagationChange = { type: 'add-variable', targetId: v.id, targetName: v.name };
          changes.push(change);
          applicableChanges.push(change);
        } else if (JSON.stringify(v.defaultValue) !== JSON.stringify(childVar.defaultValue)) {
          const change: PropagationChange = {
            type: 'modify-variable', targetId: v.id, targetName: v.name,
            oldValue: childVar.defaultValue, newValue: v.defaultValue,
          };
          const override = childEntry.variableOverrides.get(v.id);
          if (override?.overridden) {
            blockedChanges.push(change);
          } else {
            changes.push(change);
            applicableChanges.push(change);
          }
        }
      }

      // Check functions
      for (const fn of parentAsset.blueprintData.functions) {
        if (!childAsset.blueprintData.functions.find(cf => cf.id === fn.id)) {
          const change: PropagationChange = { type: 'add-function', targetId: fn.id, targetName: fn.name };
          changes.push(change);
          applicableChanges.push(change);
        }
      }

      // Check custom events
      for (const evt of parentAsset.blueprintData.customEvents) {
        if (!childAsset.blueprintData.customEvents.find(ce => ce.id === evt.id)) {
          const change: PropagationChange = { type: 'add-event', targetId: evt.id, targetName: evt.name };
          changes.push(change);
          applicableChanges.push(change);
        }
      }

      affectedChildren.push({
        childId,
        childName: childEntry.name,
        changeCount: applicableChanges.length,
        hasOverrides: blockedChanges.length > 0,
        applicableChanges,
        blockedChanges,
      });
    }

    return {
      parentId: parentEntry.id,
      parentName: parentEntry.name,
      changes: [...new Map(changes.map(c => [c.targetId + c.type, c])).values()], // deduplicate
      affectedChildren,
    };
  }

  private _buildWidgetPropagationPreview(parentAsset: WidgetBlueprintAsset, parentEntry: WidgetEntry): PropagationPreview {
    const changes: PropagationChange[] = [];
    const affectedChildren: PropagationPreview['affectedChildren'] = [];

    for (const childId of parentEntry.childIds) {
      const childEntry = this._widgets.get(childId);
      const childAsset = this._widgetMgr?.getAsset(childId);
      if (!childEntry || !childAsset) continue;

      const applicableChanges: PropagationChange[] = [];
      const blockedChanges: PropagationChange[] = [];

      // Check elements
      for (const [id, w] of parentAsset.widgets) {
        if (!childAsset.widgets.has(id)) {
          const change: PropagationChange = { type: 'add-element', targetId: id, targetName: w.name };
          changes.push(change);
          applicableChanges.push(change);
        }
      }

      // Check variables
      for (const v of parentAsset.blueprintData.variables) {
        const childVar = childAsset.blueprintData.variables.find(cv => cv.id === v.id);
        if (!childVar) {
          const change: PropagationChange = { type: 'add-variable', targetId: v.id, targetName: v.name };
          changes.push(change);
          applicableChanges.push(change);
        } else if (JSON.stringify(v.defaultValue) !== JSON.stringify(childVar.defaultValue)) {
          const change: PropagationChange = {
            type: 'modify-variable', targetId: v.id, targetName: v.name,
            oldValue: childVar.defaultValue, newValue: v.defaultValue,
          };
          const override = childEntry.variableOverrides.get(v.id);
          if (override?.overridden) {
            blockedChanges.push(change);
          } else {
            changes.push(change);
            applicableChanges.push(change);
          }
        }
      }

      affectedChildren.push({
        childId,
        childName: childEntry.name,
        changeCount: applicableChanges.length,
        hasOverrides: blockedChanges.length > 0,
        applicableChanges,
        blockedChanges,
      });
    }

    return {
      parentId: parentEntry.id,
      parentName: parentEntry.name,
      changes: [...new Map(changes.map(c => [c.targetId + c.type, c])).values()],
      affectedChildren,
    };
  }

  // ============================================================
  //  Helpers
  // ============================================================

  private _rebuildActorOverrides(asset: ActorAsset, entry: ActorEntry): void {
    // Reconstruct override maps from what we know
    // Components added by child get addedInChild=true
    // Components matching parent get isInherited=true
    if (!entry.parentId || !this._actorMgr) return;

    const parent = this._actorMgr.getAsset(entry.parentId);
    if (!parent) return;

    const parentCompIds = new Set(parent.components.map(c => c.id));
    for (const comp of asset.components) {
      if (!entry.componentOverrides.has(comp.id)) {
        entry.componentOverrides.set(comp.id, {
          componentId: comp.id,
          isInherited: parentCompIds.has(comp.id),
          inheritedFrom: parentCompIds.has(comp.id) ? entry.parentId! : undefined,
          overridden: false,
          addedInChild: !parentCompIds.has(comp.id),
          canOverride: true,
        });
      }
    }

    const parentVarIds = new Set(parent.blueprintData.variables.map(v => v.id));
    for (const v of asset.blueprintData.variables) {
      if (!entry.variableOverrides.has(v.id)) {
        entry.variableOverrides.set(v.id, {
          variableId: v.id,
          isInherited: parentVarIds.has(v.id),
          inheritedFrom: parentVarIds.has(v.id) ? entry.parentId! : undefined,
          overridden: false,
          addedInChild: !parentVarIds.has(v.id),
          canOverride: true,
        });
      }
    }
  }

  private _rebuildWidgetOverrides(asset: WidgetBlueprintAsset, entry: WidgetEntry): void {
    if (!entry.parentId || !this._widgetMgr) return;

    const parent = this._widgetMgr.getAsset(entry.parentId);
    if (!parent) return;

    for (const [id] of asset.widgets) {
      if (!entry.elementOverrides.has(id)) {
        entry.elementOverrides.set(id, {
          elementId: id,
          isInherited: parent.widgets.has(id),
          inheritedFrom: parent.widgets.has(id) ? entry.parentId! : undefined,
          overridden: false,
          addedInChild: !parent.widgets.has(id),
          canOverride: true,
        });
      }
    }

    const parentVarIds = new Set(parent.blueprintData.variables.map(v => v.id));
    for (const v of asset.blueprintData.variables) {
      if (!entry.variableOverrides.has(v.id)) {
        entry.variableOverrides.set(v.id, {
          variableId: v.id,
          isInherited: parentVarIds.has(v.id),
          inheritedFrom: parentVarIds.has(v.id) ? entry.parentId! : undefined,
          overridden: false,
          addedInChild: !parentVarIds.has(v.id),
          canOverride: true,
        });
      }
    }
  }

  private _isInheritedMacro(macroId: string, childEntry: ActorEntry | WidgetEntry): boolean {
    // Check if the parent has this macro
    const parentId = childEntry.parentId;
    if (!parentId) return false;

    if (childEntry.kind === 'actor' && this._actorMgr) {
      const parent = this._actorMgr.getAsset(parentId);
      return parent?.blueprintData.macros.some(m => m.id === macroId) ?? false;
    }
    if (childEntry.kind === 'widget' && this._widgetMgr) {
      const parent = this._widgetMgr.getAsset(parentId);
      return parent?.blueprintData.macros.some(m => m.id === macroId) ?? false;
    }
    return false;
  }

  // ============================================================
  //  Serialization — Save/Load inheritance data to JSON
  // ============================================================

  /** Export all inheritance data for persistence */
  exportActorInheritance(): Record<string, any> {
    const data: Record<string, any> = {};
    for (const [id, entry] of this._actors) {
      data[id] = {
        parentId: entry.parentId,
        childIds: entry.childIds,
        classVersion: entry.classVersion,
        parentVersion: entry.parentVersion,
        lastSyncedWithParent: entry.lastSyncedWithParent,
        componentOverrides: Object.fromEntries(entry.componentOverrides),
        variableOverrides: Object.fromEntries(entry.variableOverrides),
        nodeOverrides: Object.fromEntries(entry.nodeOverrides),
        functionOverrides: Object.fromEntries(entry.functionOverrides),
        eventOverrides: Object.fromEntries(entry.eventOverrides),
      };
    }
    return data;
  }

  exportWidgetInheritance(): Record<string, any> {
    const data: Record<string, any> = {};
    for (const [id, entry] of this._widgets) {
      data[id] = {
        parentId: entry.parentId,
        childIds: entry.childIds,
        classVersion: entry.classVersion,
        parentVersion: entry.parentVersion,
        lastSyncedWithParent: entry.lastSyncedWithParent,
        elementOverrides: Object.fromEntries(entry.elementOverrides),
        variableOverrides: Object.fromEntries(entry.variableOverrides),
        nodeOverrides: Object.fromEntries(entry.nodeOverrides),
        functionOverrides: Object.fromEntries(entry.functionOverrides),
        eventOverrides: Object.fromEntries(entry.eventOverrides),
        namedSlots: Object.fromEntries(entry.namedSlots),
      };
    }
    return data;
  }

  /** Import inheritance data from saved JSON */
  importActorInheritance(data: Record<string, any>): void {
    for (const [id, d] of Object.entries(data)) {
      const existing = this._actors.get(id);
      if (existing) {
        existing.parentId = d.parentId ?? null;
        existing.childIds = d.childIds ?? [];
        existing.classVersion = d.classVersion ?? 1;
        existing.parentVersion = d.parentVersion ?? 0;
        existing.lastSyncedWithParent = d.lastSyncedWithParent ?? null;
        existing.componentOverrides = new Map(Object.entries(d.componentOverrides ?? {}));
        existing.variableOverrides = new Map(Object.entries(d.variableOverrides ?? {}));
        existing.nodeOverrides = new Map(Object.entries(d.nodeOverrides ?? {}));
        existing.functionOverrides = new Map(Object.entries(d.functionOverrides ?? {}));
        existing.eventOverrides = new Map(Object.entries(d.eventOverrides ?? {}));

        // Also set inheritance data on the asset
        if (this._actorMgr) {
          const asset = this._actorMgr.getAsset(id);
          if (asset) {
            (asset as any)._inheritance = {
              parentClassId: existing.parentId,
              childClassIds: existing.childIds,
              classVersion: existing.classVersion,
              parentVersion: existing.parentVersion,
              lastSyncedWithParent: existing.lastSyncedWithParent,
              isParentClass: existing.childIds.length > 0,
            } as ActorInheritanceData;
          }
        }
      }
    }
  }

  importWidgetInheritance(data: Record<string, any>): void {
    for (const [id, d] of Object.entries(data)) {
      const existing = this._widgets.get(id);
      if (existing) {
        existing.parentId = d.parentId ?? null;
        existing.childIds = d.childIds ?? [];
        existing.classVersion = d.classVersion ?? 1;
        existing.parentVersion = d.parentVersion ?? 0;
        existing.lastSyncedWithParent = d.lastSyncedWithParent ?? null;
        existing.elementOverrides = new Map(Object.entries(d.elementOverrides ?? {}));
        existing.variableOverrides = new Map(Object.entries(d.variableOverrides ?? {}));
        existing.nodeOverrides = new Map(Object.entries(d.nodeOverrides ?? {}));
        existing.functionOverrides = new Map(Object.entries(d.functionOverrides ?? {}));
        existing.eventOverrides = new Map(Object.entries(d.eventOverrides ?? {}));
        existing.namedSlots = new Map(Object.entries(d.namedSlots ?? {}));

        if (this._widgetMgr) {
          const asset = this._widgetMgr.getAsset(id);
          if (asset) {
            (asset as any)._inheritance = {
              parentWidgetId: existing.parentId,
              childWidgetIds: existing.childIds,
              classVersion: existing.classVersion,
              parentVersion: existing.parentVersion,
              lastSyncedWithParent: existing.lastSyncedWithParent,
              isParentClass: existing.childIds.length > 0,
            } as WidgetInheritanceData;
          }
        }
      }
    }
  }

  /** Register all loaded actors into the inheritance registry */
  registerAllActors(mgr: ActorAssetManager): void {
    for (const asset of mgr.assets) {
      this.registerActor(asset);
    }
  }

  /** Register all loaded widgets into the inheritance registry */
  registerAllWidgets(mgr: WidgetBlueprintManager): void {
    for (const asset of mgr.assets) {
      this.registerWidget(asset);
    }
  }

  /** Reset all data (for new project) */
  clear(): void {
    this._actors.clear();
    this._widgets.clear();
  }

  // ============================================================
  //  Suppress parent warning per session
  // ============================================================

  get suppressParentWarning(): boolean { return _suppressParentWarning; }
  set suppressParentWarning(v: boolean) { _suppressParentWarning = v; }
}
