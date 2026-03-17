// ============================================================
//  Shared state, types, and manager references for the node editor.
//  All module-level singletons live here so every sub-module can
//  import them without circular dependencies.
// ============================================================

import { NodeEditor, GetSchemes, ClassicPreset } from 'rete';
import { AreaPlugin } from 'rete-area-plugin';
import type { StructureAssetManager } from '../StructureAsset';
import type { ActorAssetManager } from '../ActorAsset';
import type { WidgetBlueprintManager } from '../WidgetBlueprintData';
import * as N from '../nodes';

// ── Rete type aliases ────────────────────────────────────────
export type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;

// ── Graph type identifier ────────────────────────────────────
export type GraphType = 'event' | 'function' | 'macro';

export interface GraphTab {
  id: string;
  label: string;
  type: GraphType;
  refId?: string;
}

// ── Wire / node convenience maps ─────────────────────────────
export type NodeMap = Map<string, ClassicPreset.Node>;
export type SrcMap  = Map<string, { nid: string; ok: string }>;
export type DstMap  = Map<string, { nid: string; ik: string }[]>;

// ── Comment box alias ────────────────────────────────────────
export type CommentBox = import('../BlueprintData').BlueprintComment;

// ── Undo / Redo ──────────────────────────────────────────────
export interface HistoryState { graphJson: any; label: string; }

export class UndoManager {
  private stack: HistoryState[] = [];
  private pointer = -1;
  private _limit = 50;

  push(state: HistoryState) {
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(state);
    if (this.stack.length > this._limit) this.stack.shift();
    this.pointer = this.stack.length - 1;
  }

  undo(): HistoryState | null {
    if (this.pointer <= 0) return null;
    this.pointer--;
    return this.stack[this.pointer];
  }

  redo(): HistoryState | null {
    if (this.pointer >= this.stack.length - 1) return null;
    this.pointer++;
    return this.stack[this.pointer];
  }

  current(): HistoryState | null { return this.stack[this.pointer] ?? null; }
}

// ── Comment UID generator ────────────────────────────────────
let _commentUid = 1;
export function commentUid(): string {
  return 'cmt_' + (_commentUid++) + '_' + Math.random().toString(36).slice(2, 6);
}

// ============================================================
//  Module-level manager references
//  Set once at startup from main.ts; accessed by sub-modules.
// ============================================================

let _projectMgr: import('../ProjectManager').ProjectManager | null = null;
export function getProjectMgr() { return _projectMgr; }
export function setProjectManager(mgr: import('../ProjectManager').ProjectManager): void {
  _projectMgr = mgr;
}

let _structMgr: StructureAssetManager | null = null;
export function getStructMgr() { return _structMgr; }
export function setStructureAssetManager(mgr: StructureAssetManager): void {
  _structMgr = mgr;
}

let _actorAssetMgr: ActorAssetManager | null = null;
export function getActorAssetMgr() { return _actorAssetMgr; }
export function setActorAssetManager(mgr: ActorAssetManager): void {
  _actorAssetMgr = mgr;
}

let _isAnimBlueprint = false;
export function getIsAnimBlueprint() { return _isAnimBlueprint; }
export function setIsAnimBlueprint(v: boolean) { _isAnimBlueprint = v; }

let _widgetBPMgr: WidgetBlueprintManager | null = null;
export function getWidgetBPMgr() { return _widgetBPMgr; }
export function setWidgetBPManager(mgr: WidgetBlueprintManager): void {
  _widgetBPMgr = mgr;
}

let _saveGameMgr: any = null;
export function getSaveGameMgr() { return _saveGameMgr; }
export function setSaveGameManager(mgr: any): void {
  _saveGameMgr = mgr;
}

let _dataTableMgr: import('../DataTableAsset').DataTableAssetManager | null = null;
export function getDataTableMgr() { return _dataTableMgr; }
export function setDataTableAssetManager(mgr: import('../DataTableAsset').DataTableAssetManager): void {
  _dataTableMgr = mgr;
}

let _gameInstanceBPMgr: any = null;
export function getGameInstanceBPMgr() { return _gameInstanceBPMgr; }
export function setGameInstanceBPManager(mgr: any): void {
  _gameInstanceBPMgr = mgr;
}

// ── Node Category classifier ────────────────────────────────
// Lives here (not in ui.ts) to avoid circular dependency with codeGen.ts
export function getNodeCategory(node: ClassicPreset.Node): string {
  if (node instanceof N.GetVariableNode || node instanceof N.SetVariableNode) return 'Variables';
  if (node instanceof N.MakeStructNode || node instanceof N.BreakStructNode) return 'Structs';
  if (node instanceof N.FunctionEntryNode || node instanceof N.FunctionReturnNode) return 'Functions';
  if (node instanceof N.FunctionCallNode) return 'Functions';
  if (node instanceof N.MacroEntryNode || node instanceof N.MacroExitNode) return 'Macros';
  if (node instanceof N.MacroCallNode) return 'Macros';
  if (node instanceof N.CustomEventNode || node instanceof N.CallCustomEventNode) return 'Events';
  if (node instanceof N.InputKeyEventNode || node instanceof N.IsKeyDownNode || node instanceof N.InputAxisNode || node instanceof N.InputActionMappingEventNode || node instanceof N.InputAxisMappingEventNode || node instanceof N.GetInputActionNode || node instanceof N.GetInputAxisNode || node instanceof N.AddActionMappingKeyNode || node instanceof N.RemoveActionMappingKeyNode || node instanceof N.ClearActionMappingNode || node instanceof N.AddAxisMappingKeyNode || node instanceof N.RemoveAxisMappingKeyNode || node instanceof N.ClearAxisMappingNode) return 'Input';
  if (node instanceof N.OnComponentHitNode || node instanceof N.OnComponentBeginOverlapNode ||
      node instanceof N.OnComponentEndOverlapNode || node instanceof N.OnComponentWakeNode ||
      node instanceof N.OnComponentSleepNode) return 'Events';
  if (node instanceof N.OnTriggerBeginOverlapNode || node instanceof N.OnTriggerEndOverlapNode ||
      node instanceof N.OnActorBeginOverlapNode || node instanceof N.OnActorEndOverlapNode ||
      node instanceof N.OnCollisionHitNode) return 'Collision';
  if (node instanceof N.IsOverlappingActorNode || node instanceof N.GetOverlapCountNode ||
      node instanceof N.SetCollisionEnabledNode) return 'Collision';
  if (node instanceof N.OnTriggerComponentBeginOverlapNode ||
      node instanceof N.OnTriggerComponentEndOverlapNode) return 'Collision';
  if (node instanceof N.SetTriggerEnabledNode || node instanceof N.GetTriggerEnabledNode ||
      node instanceof N.SetTriggerSizeNode || node instanceof N.GetTriggerOverlapCountNode ||
      node instanceof N.IsTriggerOverlappingNode || node instanceof N.GetTriggerShapeNode) return 'Components';
  if (node instanceof N.SetLightEnabledNode || node instanceof N.GetLightEnabledNode ||
      node instanceof N.SetLightColorNode || node instanceof N.GetLightColorNode ||
      node instanceof N.SetLightIntensityNode || node instanceof N.GetLightIntensityNode ||
      node instanceof N.SetLightDistanceNode || node instanceof N.SetLightPositionNode ||
      node instanceof N.GetLightPositionNode || node instanceof N.SetLightTargetNode ||
      node instanceof N.SetCastShadowNode || node instanceof N.SetSpotAngleNode ||
      node instanceof N.SetSpotPenumbraNode) return 'Components';
  if (node instanceof N.GetProjectileConfigNode || node instanceof N.GetProjectileCompVelocityNode ||
      node instanceof N.IsProjectileActiveNode || node instanceof N.LaunchProjectileCompNode ||
      node instanceof N.SetProjectileSpeedNode || node instanceof N.SetProjectileGravityScaleNode ||
      node instanceof N.SetProjectileBounceNode || node instanceof N.SetProjectileCompHomingNode ||
      node instanceof N.DestroyProjectileCompNode || node instanceof N.SetProjectileLifetimeNode) return 'Projectile';
  if (node instanceof N.CastToNode || node instanceof N.PureCastNode ||
      node instanceof N.GetSelfReferenceNode || node instanceof N.GetPlayerPawnNode ||
      node instanceof N.GetActorByNameNode || node instanceof N.GetAllActorsOfClassNode ||
      node instanceof N.IsValidNode || node instanceof N.GetActorNameNode ||
      node instanceof N.GetActorVariableNode || node instanceof N.SetActorVariableNode ||
      node instanceof N.GetOwnerNode || node instanceof N.GetAnimInstanceNode ||
      node instanceof N.CallActorFunctionNode ||
      node instanceof N.GetGameInstanceNode || node instanceof N.GetGameInstanceVariableNode ||
      node instanceof N.SetGameInstanceVariableNode) return 'Casting';
  if (node instanceof N.AnimUpdateEventNode) return 'Events';
  if (node instanceof N.TryGetPawnOwnerNode || node instanceof N.SetAnimVarNode ||
      node instanceof N.GetAnimVarNode) return 'Animation';
  if (node instanceof N.CreateWidgetNode || node instanceof N.AddToViewportNode ||
      node instanceof N.RemoveFromViewportNode || node instanceof N.SetWidgetTextNode ||
      node instanceof N.GetWidgetTextNode || node instanceof N.SetWidgetVisibilityNode ||
      node instanceof N.SetWidgetColorNode || node instanceof N.SetWidgetOpacityNode ||
      node instanceof N.SetProgressBarPercentNode || node instanceof N.GetProgressBarPercentNode ||
      node instanceof N.SetSliderValueNode || node instanceof N.GetSliderValueNode ||
      node instanceof N.SetCheckBoxStateNode || node instanceof N.GetCheckBoxStateNode ||
      node instanceof N.IsWidgetVisibleNode || node instanceof N.PlayWidgetAnimationNode ||
      node instanceof N.SetInputModeNode || node instanceof N.ShowMouseCursorNode ||
      node instanceof N.GetWidgetVariableNode || node instanceof N.SetWidgetVariableNode ||
      node instanceof N.CallWidgetFunctionNode || node instanceof N.CallWidgetEventNode) return 'UI';
  if (node instanceof N.GetDataTableRowNode || node instanceof N.GetDataTableRowPureNode ||
      node instanceof N.GetAllDataTableRowsNode || node instanceof N.GetDataTableRowNamesNode ||
      node instanceof N.DoesDataTableRowExistNode || node instanceof N.GetDataTableRowCountNode ||
      node instanceof N.ForEachDataTableRowNode || node instanceof N.MakeDataTableRowHandleNode ||
      node instanceof N.ResolveDataTableRowHandleNode || node instanceof N.IsDataTableRowHandleValidNode ||
      node instanceof N.AddDataTableRowRuntimeNode || node instanceof N.RemoveDataTableRowRuntimeNode ||
      node instanceof N.UpdateDataTableRowRuntimeNode || node instanceof N.GetDataTableFieldNode ||
      node instanceof N.FindRowsByPredicateNode) return 'DataTable';
  for (const entry of N.NODE_PALETTE) {
    if (entry.label === node.label) return entry.category;
  }
  return 'Utility';
}
