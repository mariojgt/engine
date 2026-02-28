import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { NodeEditor, GetSchemes, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { ReactPlugin, Presets } from 'rete-react-plugin';
import { createRoot } from 'react-dom/client';
import type { GameObject } from '../engine/GameObject';
import { ScriptComponent } from '../engine/ScriptComponent';
import {
  type BlueprintVariable,
  type BlueprintFunction,
  type BlueprintMacro,
  type BlueprintCustomEvent,
  type BlueprintStruct,
  type VarType,
} from './BlueprintData';
import { iconHTML, Icons, ICON_COLORS } from './icons';

// Import all nodes
import {
  NODE_PALETTE,
  EventTickNode,
  EventBeginPlayNode,
  EventOnDestroyNode,
  SineNode,
  CosineNode,
  AbsNode,
  ClampNode,
  LerpNode,
  GreaterThanNode,
  MathAddNode,
  MathSubtractNode,
  MathMultiplyNode,
  MathDivideNode,
  TimeNode,
  DeltaTimeNode,
  FloatNode,
  IntegerNode,
  BooleanNode,
  BoolSelectControl,
  StringLiteralNode,
  Vector3LiteralNode,
  ColorNode,
  ColorPickerControl,
  SetPositionNode,
  GetPositionNode,
  GetRotationNode,
  SetRotationNode,
  GetScaleNode,
  SetScaleNode,
  BranchNode,
  SequenceNode,
  ForLoopNode,
  DelayNode,
  PrintStringNode,
  AddForceNode,
  AddImpulseNode,
  SetVelocityNode,
  // Physics (extended)
  GetMassNode,
  SetMassNode,
  GetVelocityNode,
  GetAngularVelocityNode,
  SetLinearVelocityNode,
  SetAngularVelocityNode,
  IsSimulatingPhysicsNode,
  SetSimulatePhysicsNode,
  IsGravityEnabledNode,
  SetGravityEnabledNode,
  GetGravityScaleNode,
  SetGravityScaleNode,
  SetLinearDampingNode,
  SetAngularDampingNode,
  SetPhysicsMaterialNode,
  GetPhysicsMaterialNode,
  AddTorqueNode,
  AddForceAtLocationNode,
  AddImpulseAtLocationNode,
  SetConstraintNode,
  OnComponentHitNode,
  OnComponentBeginOverlapNode,
  OnComponentEndOverlapNode,
  OnComponentWakeNode,
  OnComponentSleepNode,
  GetVariableNode,
  SetVariableNode,
  FunctionEntryNode,
  FunctionReturnNode,
  FunctionCallNode,
  MacroEntryNode,
  MacroExitNode,
  MacroCallNode,
  CustomEventNode,
  CallCustomEventNode,
  MakeStructNode,
  BreakStructNode,
  InputKeyEventNode,
  IsKeyDownNode,
  INPUT_KEYS,
  keyEventCode,
  inputType,
  KeySelectControl,
  InputActionMappingEventNode,
  InputAxisMappingEventNode,
  GetInputActionNode,
  GetInputAxisNode,
  AddActionMappingKeyNode,
  RemoveActionMappingKeyNode,
  ClearActionMappingNode,
  AddAxisMappingKeyNode,
  RemoveAxisMappingKeyNode,
  ClearAxisMappingNode,
  ActionMappingSelectControl,
  AxisMappingSelectControl,
  GetComponentLocationNode,
  SetComponentLocationNode,
  GetComponentRotationNode,
  SetComponentRotationNode,
  GetComponentScaleNode,
  SetComponentScaleNode,
  SetComponentVisibilityNode,
  SetStaticMeshNode,
  SetMeshMaterialNode,
  GetMeshMaterialNode,
  getComponentNodeEntries,
  // Light Component Nodes
  SetLightEnabledNode,
  GetLightEnabledNode,
  SetLightColorNode,
  GetLightColorNode,
  SetLightIntensityNode,
  GetLightIntensityNode,
  SetLightDistanceNode,
  SetLightPositionNode,
  GetLightPositionNode,
  SetLightTargetNode,
  SetCastShadowNode,
  SetSpotAngleNode,
  SetSpotPenumbraNode,
  // Trigger Component Nodes
  OnTriggerComponentBeginOverlapNode,
  OnTriggerComponentEndOverlapNode,
  SetTriggerEnabledNode,
  GetTriggerEnabledNode,
  IsTriggerOverlappingNode,
  // Deprecated trigger nodes (kept for deserialization)
  SetTriggerSizeNode,
  GetTriggerOverlapCountNode,
  GetTriggerShapeNode,
  // Collision / Trigger Event Nodes
  OnTriggerBeginOverlapNode,
  OnTriggerEndOverlapNode,
  OnActorBeginOverlapNode,
  OnActorEndOverlapNode,
  OnCollisionHitNode,
  IsOverlappingActorNode,
  GetOverlapCountNode,
  SetCollisionEnabledNode,
  // Character Movement Nodes
  AddMovementInputNode,
  JumpNode,
  StopJumpingNode,
  CrouchNode,
  UncrouchNode,
  StartFlyingNode,
  StopFlyingNode,
  StartSwimmingNode,
  StopSwimmingNode,
  SetMovementModeNode,
  SetMaxWalkSpeedNode,
  LaunchCharacterNode,
  SetCameraModeNode,
  SetCameraFOVNode,
  GetCharacterVelocityNode,
  GetMovementSpeedNode,
  IsGroundedNode,
  IsJumpingNode,
  IsCrouchingNode,
  IsFallingNode,
  IsFlyingNode,
  IsSwimmingNode,
  IsMovingNode,
  GetMovementModeNode,
  GetCameraLocationNode,
  InputAxisNode,
  // Camera Control Nodes
  AddControllerYawInputNode,
  AddControllerPitchInputNode,
  GetControllerRotationNode,
  SetControllerRotationNode,
  SetMouseLockEnabledNode,
  GetMouseLockStatusNode,
  // Player Controller Nodes
  GetPlayerControllerNode,
  SetShowMouseCursorNode,
  IsMouseCursorVisibleNode,
  SetInputModeGameOnlyNode,
  SetInputModeGameAndUINode,
  SetInputModeUIOnlyNode,
  MovementModeSelectControl,
  MOVEMENT_MODES,
  // Camera & Spring Arm Nodes
  SetSpringArmLengthNode,
  SetSpringArmTargetOffsetNode,
  SetSpringArmSocketOffsetNode,
  SetSpringArmCollisionNode,
  SetCameraCollisionEnabledNode,
  SetCameraLagNode,
  SetCameraRotationLagNode,
  GetSpringArmLengthNode,
  GetSpringArmTargetOffsetNode,
  GetSpringArmSocketOffsetNode,
  CameraModeLiteralNode,
  MovementModeLiteralNode,
  GetCameraRotationNode,
  // Player Controller Nodes
  PossessPawnNode,
  UnpossessPawnNode,
  GetControlledPawnNode,
  IsPossessingNode,
  // AI Controller Nodes
  AIMoveToNode,
  AIStopMovementNode,
  AISetFocalPointNode,
  AIClearFocalPointNode,
  AIStartPatrolNode,
  AIStopPatrolNode,
  AIStartFollowingNode,
  AIStopFollowingNode,
  GetAIStateNode,
  AIHasReachedTargetNode,
  AIGetDistanceToTargetNode,
  // Controller ↔ Pawn Nodes
  GetControllerNode,
  GetControllerTypeNode,
  GetPawnNode,
  IsPlayerControlledNode,
  IsAIControlledNode,
  // Casting & Reference Nodes
  CastToNode,
  GetSelfReferenceNode,
  GetPlayerPawnNode,
  GetActorByNameNode,
  GetAllActorsOfClassNode,
  IsValidNode,
  GetActorNameNode,
  GetActorVariableNode,
  SetActorVariableNode,
  GetOwnerNode,
  GetAnimInstanceNode,
  PureCastNode,
  CallActorFunctionNode,
  socketForType,
  objectSocket,
  getClassRefSocket,
  socketColor,
  socketsCompatible,
  getConversion,
  NODE_CATEGORY_COLORS,
  getCategoryIcon,
  execSocket,
  numSocket,
  boolSocket,
  vec3Socket,
  strSocket,
  colorSocket,
  BoolToNumberNode,
  NumberToBoolNode,
  BoolToStringNode,
  StringToBoolNode,
  NumberToStringNode,
  StringToNumberNode,
  ColorToStringNode,
  StringToColorNode,
  // Animation BP Nodes
  AnimUpdateEventNode,
  TryGetPawnOwnerNode,
  SetAnimVarNode,
  GetAnimVarNode,
  // Widget / UI Nodes
  WidgetBPSelectControl,
  WidgetSelectorControl,
  WidgetVariableSelectorControl,
  WidgetFunctionSelectorControl,
  WidgetEventSelectorControl,
  CreateWidgetNode,
  AddToViewportNode,
  RemoveFromViewportNode,
  SetWidgetTextNode,
  GetWidgetTextNode,
  SetWidgetVisibilityNode,
  SetWidgetColorNode,
  SetWidgetOpacityNode,
  SetProgressBarPercentNode,
  GetProgressBarPercentNode,
  SetSliderValueNode,
  GetSliderValueNode,
  SetCheckBoxStateNode,
  GetCheckBoxStateNode,
  IsWidgetVisibleNode,
  PlayWidgetAnimationNode,
  SetInputModeNode,
  ShowMouseCursorNode,
  // Widget Event Nodes
  ButtonOnClickedNode,
  ButtonOnPressedNode,
  ButtonOnReleasedNode,
  ButtonOnHoveredNode,
  ButtonOnUnhoveredNode,
  TextBoxOnTextChangedNode,
  TextBoxOnTextCommittedNode,
  SliderOnValueChangedNode,
  CheckBoxOnCheckStateChangedNode,
  // Widget Instance Interaction Nodes
  GetWidgetVariableNode,
  SetWidgetVariableNode,
  CallWidgetFunctionNode,
  CallWidgetEventNode,
  // Utility Nodes (Scene)
  OpenSceneNode,
  LoadSceneNode,
  SceneSelectControl,
  getSceneListProvider,
  // Game Instance Nodes
  GetGameInstanceNode,
  GetGameInstanceVariableNode,
  SetGameInstanceVariableNode,
  GameInstanceVarNameControl,
  TextureSelectControl,
  GetTextureIDNode,
  FindTextureByNameNode,
  GetTextureInfoNode,
  LoadTextureNode,
  SetImageTextureNode,
  SetButtonTextureNode,
  // Character Movement 2D Nodes
  AddMovementInput2DNode,
  Jump2DNode,
  StopJump2DNode,
  LaunchCharacter2DNode,
  SetMaxWalkSpeed2DNode,
  GetMaxWalkSpeed2DNode,
  IsGrounded2DNode,
  IsJumping2DNode,
  IsFalling2DNode,
  GetCharacterVelocity2DNode,
  AddCharacterImpulse2DNode,
  StopMovement2DNode,
  SetJumpHeight2DNode,
  SetMaxJumps2DNode,
  GetJumpsRemaining2DNode,
  SetGravityMultiplier2DNode,
  FlipSpriteDirection2DNode,
  SetAirControl2DNode,
  GetSpriteFacingDirection2DNode,
  GetCharacterSpeed2DNode,
  // Spawning nodes
  DestroyActorNode,
  SpawnActorFromClassNode,
  ActorClassSelectControl,
  RefreshNodesControl,
  // Audio nodes
  SoundCueSelectControl,
  PlaySound2DNode,
  PlaySoundAtLocationNode,
  // Save/Load nodes (UE-style)
  CreateSaveGameObjectNode,
  SaveGameSelectControl,
  SaveGameToSlotNode,
  LoadGameFromSlotNode,
  DeleteGameInSlotNode,
  // Flow Control (extended)
  ForEachLoopNode,
  ForEachLoopWithBreakNode,
  ForEachActorLoopNode,
  DoOnceNode,
  DoNNode,
  FlipFlopNode,
  GateNode,
  MultiGateNode,
  ForLoopWithBreakNode,
  WhileLoopNode,
  SwitchOnIntNode,
  SwitchOnStringNode,
  // Drag Selection nodes
  EnableDragSelectionNode,
  DisableDragSelectionNode,
  SetDragSelectionEnabledNode,
  OnDragSelectionCompleteNode,
  GetSelectedActorsNode,
  GetSelectedActorAtIndexNode,
  SetDragSelectionClassFilterNode,
  AddDragSelectionClassFilterNode,
  ClearDragSelectionClassFilterNode,
  SetDragSelectionStyleNode,
  IsDragSelectingNode,
  GetDragSelectionCountNode,
  // Event Bus Nodes
  EmitEventNode,
  OnEventNode,
  EventSelectControl,
  // AI Task / BT Nodes
  AIReceiveExecuteNode,
  AIReceiveTickNode,
  AIReceiveAbortNode,
  FinishExecuteNode,
  AIPerformConditionCheckNode,
  AIObserverActivatedNode,
  AIObserverDeactivatedNode,
  ReturnNode,
  AIServiceActivatedNode,
  AIServiceTickNode,
  AIServiceDeactivatedNode,
  OnPossessNode,
  OnUnpossessNode,
  OnMoveCompletedNode,
  OnPerceptionUpdatedNode,
  RunBehaviorTreeNode,
  BTSelectControl,
  MoveToLocationNode,
  GetBlackboardValueNode,
  SetBlackboardValueNode,
  ClearBlackboardValueNode,
  RotateToFaceNode,
  // NavMesh Nodes
  NavMeshBuildNode,
  NavMeshIsReadyNode,
  NavMeshFindPathNode,
  NavMeshFindClosestPointNode,
  NavMeshRandomPointNode,
  NavMeshAddAgentNode,
  NavMeshRemoveAgentNode,
  NavMeshAgentMoveToNode,
  NavMeshGetAgentPositionNode,
  NavMeshGetAgentVelocityNode,
  NavMeshAgentReachedTargetNode,
  NavMeshAddBoxObstacleNode,
  NavMeshAddCylinderObstacleNode,
  NavMeshRemoveObstacleNode,
  NavMeshToggleDebugNode,
} from './nodes';
import { SoundLibrary } from './SoundLibrary';
import { TextureLibrary } from './TextureLibrary';
import { EventAssetManager } from './EventAsset';
import type { NodeEntry, ComponentNodeEntry } from './nodes';
import type { ActorComponentData } from './ActorAsset';
import type { ActorAssetManager } from './ActorAsset';
import type { StructureAssetManager } from './StructureAsset';
import { InputMappingAssetManager } from './InputMappingAsset';
import type { WidgetBlueprintManager } from './WidgetBlueprintData';

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;

// ============================================================
//  Module-level reference to ProjectManager
// ============================================================
let _projectMgr: import('./ProjectManager').ProjectManager | null = null;

export function setProjectManager(mgr: import('./ProjectManager').ProjectManager): void {
  _projectMgr = mgr;
}

// ============================================================
//  Module-level reference to StructureAssetManager
//  (set once at startup from main.ts)
// ============================================================
let _structMgr: StructureAssetManager | null = null;

/** Call once at startup to wire project-level structs/enums into the node editor */
export function setStructureAssetManager(mgr: StructureAssetManager): void {
  _structMgr = mgr;
}

// ============================================================
//  Module-level reference to ActorAssetManager
//  (set once at startup from main.ts so context menu can list actor classes)
// ============================================================
let _actorAssetMgr: ActorAssetManager | null = null;

/** Call once at startup to wire actor asset browser data into the node editor */
export function setActorAssetManager(mgr: ActorAssetManager): void {
  _actorAssetMgr = mgr;
}

// ============================================================
//  Module-level flag: are we compiling an Animation Blueprint?
//  When true, SetVariable nodes skip _scriptVars sync to avoid
//  overwriting the pawn's own variables.
// ============================================================
let _isAnimBlueprint = false;

// ============================================================
//  Module-level reference to WidgetBlueprintManager
//  (set once at startup so Create Widget picker can list widgets)
// ============================================================
let _widgetBPMgr: WidgetBlueprintManager | null = null;

/** Call once at startup to wire widget blueprint data into the node editor */
export function setWidgetBPManager(mgr: WidgetBlueprintManager): void {
  _widgetBPMgr = mgr;
}

// ============================================================
//  Module-level reference to SaveGameAssetManager
//  (set once at startup so SaveGame dropdowns can populate)
// ============================================================
let _saveGameMgr: any = null;

export function setSaveGameManager(mgr: any): void {
  _saveGameMgr = mgr;
}

// ============================================================
//  Module-level reference to GameInstanceBlueprintManager
//  (set once at startup so GI variable dropdowns can populate)
// ============================================================
let _gameInstanceBPMgr: any = null;

/** Call once at startup to wire game-instance blueprint data into the node editor */
export function setGameInstanceBPManager(mgr: any): void {
  _gameInstanceBPMgr = mgr;
}

// ============================================================
//  Graph type identifier
// ============================================================
type GraphType = 'event' | 'function' | 'macro';
interface GraphTab {
  id: string;
  label: string;
  type: GraphType;
  refId?: string;
}

// ============================================================
//  Node Category Detection
// ============================================================
function getNodeCategory(node: ClassicPreset.Node): string {
  // Dynamic nodes not in NODE_PALETTE
  if (node instanceof GetVariableNode || node instanceof SetVariableNode) return 'Variables';
  if (node instanceof MakeStructNode || node instanceof BreakStructNode) return 'Structs';
  if (node instanceof FunctionEntryNode || node instanceof FunctionReturnNode) return 'Functions';
  if (node instanceof FunctionCallNode) return 'Functions';
  if (node instanceof MacroEntryNode || node instanceof MacroExitNode) return 'Macros';
  if (node instanceof MacroCallNode) return 'Macros';
  if (node instanceof CustomEventNode || node instanceof CallCustomEventNode) return 'Events';
  if (node instanceof InputKeyEventNode || node instanceof IsKeyDownNode || node instanceof InputAxisNode || node instanceof InputActionMappingEventNode || node instanceof InputAxisMappingEventNode || node instanceof GetInputActionNode || node instanceof GetInputAxisNode || node instanceof AddActionMappingKeyNode || node instanceof RemoveActionMappingKeyNode || node instanceof ClearActionMappingNode || node instanceof AddAxisMappingKeyNode || node instanceof RemoveAxisMappingKeyNode || node instanceof ClearAxisMappingNode) return 'Input';
  // Physics event nodes
  if (node instanceof OnComponentHitNode || node instanceof OnComponentBeginOverlapNode ||
      node instanceof OnComponentEndOverlapNode || node instanceof OnComponentWakeNode ||
      node instanceof OnComponentSleepNode) return 'Events';
  // Collision / trigger event & query nodes
  if (node instanceof OnTriggerBeginOverlapNode || node instanceof OnTriggerEndOverlapNode ||
      node instanceof OnActorBeginOverlapNode || node instanceof OnActorEndOverlapNode ||
      node instanceof OnCollisionHitNode) return 'Collision';
  if (node instanceof IsOverlappingActorNode || node instanceof GetOverlapCountNode ||
      node instanceof SetCollisionEnabledNode) return 'Collision';
  // Bound trigger overlap events (per-component, like UE)
  if (node instanceof OnTriggerComponentBeginOverlapNode ||
      node instanceof OnTriggerComponentEndOverlapNode) return 'Collision';
  // Trigger component utility nodes
  if (node instanceof SetTriggerEnabledNode || node instanceof GetTriggerEnabledNode ||
      node instanceof SetTriggerSizeNode || node instanceof GetTriggerOverlapCountNode ||
      node instanceof IsTriggerOverlappingNode || node instanceof GetTriggerShapeNode) return 'Components';
  // Light component nodes
  if (node instanceof SetLightEnabledNode || node instanceof GetLightEnabledNode ||
      node instanceof SetLightColorNode || node instanceof GetLightColorNode ||
      node instanceof SetLightIntensityNode || node instanceof GetLightIntensityNode ||
      node instanceof SetLightDistanceNode || node instanceof SetLightPositionNode ||
      node instanceof GetLightPositionNode || node instanceof SetLightTargetNode ||
      node instanceof SetCastShadowNode || node instanceof SetSpotAngleNode ||
      node instanceof SetSpotPenumbraNode) return 'Components';
  // Casting & Reference nodes
  if (node instanceof CastToNode || node instanceof PureCastNode ||
      node instanceof GetSelfReferenceNode || node instanceof GetPlayerPawnNode ||
      node instanceof GetActorByNameNode || node instanceof GetAllActorsOfClassNode ||
      node instanceof IsValidNode || node instanceof GetActorNameNode ||
      node instanceof GetActorVariableNode || node instanceof SetActorVariableNode ||
      node instanceof GetOwnerNode || node instanceof GetAnimInstanceNode ||
      node instanceof CallActorFunctionNode ||
      node instanceof GetGameInstanceNode || node instanceof GetGameInstanceVariableNode ||
      node instanceof SetGameInstanceVariableNode) return 'Casting';
  // Animation BP nodes
  if (node instanceof AnimUpdateEventNode) return 'Events';
  if (node instanceof TryGetPawnOwnerNode || node instanceof SetAnimVarNode ||
      node instanceof GetAnimVarNode) return 'Animation';
  // Widget / UI nodes
  if (node instanceof CreateWidgetNode || node instanceof AddToViewportNode ||
      node instanceof RemoveFromViewportNode || node instanceof SetWidgetTextNode ||
      node instanceof GetWidgetTextNode || node instanceof SetWidgetVisibilityNode ||
      node instanceof SetWidgetColorNode || node instanceof SetWidgetOpacityNode ||
      node instanceof SetProgressBarPercentNode || node instanceof GetProgressBarPercentNode ||
      node instanceof SetSliderValueNode || node instanceof GetSliderValueNode ||
      node instanceof SetCheckBoxStateNode || node instanceof GetCheckBoxStateNode ||
      node instanceof IsWidgetVisibleNode || node instanceof PlayWidgetAnimationNode ||
      node instanceof SetInputModeNode || node instanceof ShowMouseCursorNode ||
      node instanceof GetWidgetVariableNode || node instanceof SetWidgetVariableNode ||
      node instanceof CallWidgetFunctionNode || node instanceof CallWidgetEventNode) return 'UI';
  // Fallback: check NODE_PALETTE
  for (const entry of NODE_PALETTE) {
    if (entry.label === node.label) return entry.category;
  }
  return 'Utility';
}

// ============================================================
//  Comment Box helpers
// ============================================================
type CommentBox = import('./BlueprintData').BlueprintComment;
let _commentUid = 1;
function commentUid(): string {
  return 'cmt_' + (_commentUid++) + '_' + Math.random().toString(36).slice(2, 6);
}

// ============================================================
//  Undo / Redo — lightweight history stack
// ============================================================
interface HistoryState { graphJson: any; label: string; }
class UndoManager {
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

// ============================================================
//  Helpers
// ============================================================
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function varDefaultStr(v: BlueprintVariable, bp: import('./BlueprintData').BlueprintData): string {
  switch (v.type) {
    case 'Float': return String(v.defaultValue ?? 0);
    case 'Boolean': return String(v.defaultValue ?? false);
    case 'String': return JSON.stringify(String(v.defaultValue ?? ''));
    case 'Color': return JSON.stringify(String(v.defaultValue ?? '#ffffff'));
    case 'Vector3': {
      const d = v.defaultValue ?? { x: 0, y: 0, z: 0 };
      return `{ x: ${d.x ?? 0}, y: ${d.y ?? 0}, z: ${d.z ?? 0} }`;
    }
    default:
      if (v.type.startsWith('Struct:')) {
        const structId = v.type.slice(7);
        const fields = resolveStructFields(structId, bp);
        if (fields) {
          const parts = fields.map(f => {
            const tempVar: BlueprintVariable = { name: f.name, type: f.type, defaultValue: null, id: '' };
            return `${sanitizeName(f.name)}: ${varDefaultStr(tempVar, bp)}`;
          });
          return `{ ${parts.join(', ')} }`;
        }
      }
      if (v.type.startsWith('Enum:')) {
        return JSON.stringify(String(v.defaultValue ?? ''));
      }
      if (v.type === 'ObjectRef' || v.type === 'Widget' || v.type.startsWith('ClassRef:')) {
        return 'null';
      }
      return '0';
  }
}

// ============================================================
//  CODE GENERATOR — shared helpers
// ============================================================

/** Resolve struct fields from per-actor BlueprintData OR project-level StructureAssetManager */
function resolveStructFields(structId: string, bp: import('./BlueprintData').BlueprintData): { name: string; type: VarType }[] | undefined {
  // 1. Per-actor struct
  const bpStruct = bp.structs.find(s => s.id === structId);
  if (bpStruct) return bpStruct.fields;
  // 2. Project-level struct
  if (_structMgr) {
    const projStruct = _structMgr.getStructure(structId);
    if (projStruct) return projStruct.fields.map(f => ({ name: f.name, type: f.type }));
  }
  return undefined;
}

type NodeMap = Map<string, ClassicPreset.Node>;
type SrcMap  = Map<string, { nid: string; ok: string }>;
type DstMap  = Map<string, { nid: string; ik: string }[]>;

function buildMaps(editor: NodeEditor<Schemes>) {
  const nodes = editor.getNodes();
  const connections = editor.getConnections();
  const inputSrc: SrcMap = new Map();
  for (const c of connections) {
    inputSrc.set(`${c.target}.${c.targetInput}`, { nid: c.source, ok: c.sourceOutput });
  }
  const outputDst: DstMap = new Map();
  for (const c of connections) {
    const key = `${c.source}.${c.sourceOutput}`;
    const arr = outputDst.get(key) || [];
    arr.push({ nid: c.target, ik: c.targetInput });
    outputDst.set(key, arr);
  }
  const nodeMap: NodeMap = new Map(nodes.map(n => [n.id, n]));
  return { nodes, nodeMap, inputSrc, outputDst };
}

function fieldDefault(type: VarType): string {
  switch (type) {
    case 'Float':   return '0';
    case 'Boolean': return 'false';
    case 'String':  return '""';
    case 'Color':   return '"#ffffff"';
    case 'Vector3': return '{ x: 0, y: 0, z: 0 }';
    default:        return '{}';
  }
}

function resolveValue(
  nodeId: string, outputKey: string,
  nodeMap: NodeMap, inputSrc: SrcMap, bp: import('./BlueprintData').BlueprintData,
): string {
  const node = nodeMap.get(nodeId);
  if (!node) return '0';

  if (node instanceof GetVariableNode) {
    const vn = sanitizeName(node.varName);
    if (node.varType === 'Vector3') return `__var_${vn}.${outputKey}`;
    if (node.varType.startsWith('Struct:')) return `__var_${vn}.${outputKey}`;
    // Enum and other types — simple value
    return `__var_${vn}`;
  }
  if (node instanceof SetVariableNode) {
    const vn = sanitizeName(node.varName);
    if (node.varType === 'Vector3') return `__var_${vn}.${outputKey}`;
    if (node.varType.startsWith('Struct:')) return `__var_${vn}.${outputKey}`;
    // Enum and other types — simple value
    return `__var_${vn}`;
  }
  if (node instanceof MakeStructNode) {
    const fields = node.structFields;
    const parts = fields.map(f => {
      const s = inputSrc.get(`${nodeId}.${f.name}`);
      const val = s ? resolveValue(s.nid, s.ok, nodeMap, inputSrc, bp) : fieldDefault(f.type);
      return `${sanitizeName(f.name)}: ${val}`;
    });
    return `({ ${parts.join(', ')} })`;
  }
  if (node instanceof BreakStructNode) {
    const s = inputSrc.get(`${nodeId}.struct`);
    const structVal = s ? resolveValue(s.nid, s.ok, nodeMap, inputSrc, bp) : '{}';
    return `(${structVal}).${outputKey}`;
  }
  if (node instanceof FunctionCallNode) {
    return `__fn_result_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}.${sanitizeName(outputKey)}`;
  }
  // CallActorFunctionNode — remote function call outputs (resolved via temp var)
  if (node instanceof CallActorFunctionNode) {
    return `__rfn_result_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}.${sanitizeName(outputKey)}`;
  }

  // FunctionEntryNode — parameters
  if (node instanceof FunctionEntryNode) {
    if (outputKey === 'exec') return '0';
    return `__param_${sanitizeName(outputKey)}`;
  }

  // CustomEventNode — event parameter outputs
  if (node instanceof CustomEventNode) {
    if (outputKey === 'exec') return '0';
    return `__cev_param_${sanitizeName(outputKey)}`;
  }

  // IsKeyDownNode — poll key state
  if (node instanceof IsKeyDownNode) {
    const ikd = node as IsKeyDownNode;
    const keyCtrl = ikd.controls['key'] as KeySelectControl | undefined;
    const key = keyCtrl?.value ?? ikd.selectedKey;
    const itype = inputType(key);
    const kc = keyEventCode(key);
    if (itype === 'mouse') {
      return `(__inputKeys["__mouse${kc}"] || false)`;
    }
    if (itype === 'wheel') {
      return 'false'; // wheel has no "held" state
    }
    if (itype === 'axis') {
      return 'false'; // axis has no "held" state
    }
    if (itype === 'gamepad') {
      return `(__engine && __engine.input ? __engine.input.isKeyDown(${JSON.stringify(kc)}) : false)`;
    }
    return `(__inputKeys[${JSON.stringify(kc)}] || false)`;
  }

  if (node instanceof GetInputActionNode) {
    const n = node as GetInputActionNode;
    const ctrl = n.controls['action'] as ActionMappingSelectControl | undefined;
    const action = ctrl?.value ?? n.selectedAction;
    return `(__engine && __engine.input ? __engine.input.getAction(${JSON.stringify(action)}) : false)`;
  }

  if (node instanceof GetInputAxisNode) {
    const n = node as GetInputAxisNode;
    const ctrl = n.controls['axis'] as AxisMappingSelectControl | undefined;
    const axis = ctrl?.value ?? n.selectedAxis;
    return `(__engine && __engine.input ? __engine.input.getAxis(${JSON.stringify(axis)}) : 0)`;
  }

  if (node instanceof InputAxisMappingEventNode) {
    return `__axis_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  // InputAxisNode — two-key axis: positive key → +1, negative key → -1
  if (node instanceof InputAxisNode) {
    const ia = node as InputAxisNode;
    // Read from controls (user may have changed them via dropdown)
    const posCtrl = ia.controls['posKey'] as KeySelectControl | undefined;
    const negCtrl = ia.controls['negKey'] as KeySelectControl | undefined;
    const posKey = posCtrl?.value ?? ia.positiveKey;
    const negKey = negCtrl?.value ?? ia.negativeKey;
    const posCode = keyEventCode(posKey);
    const negCode = keyEventCode(negKey);
    const posType = inputType(posKey);
    const negType = inputType(negKey);
    
    const getVal = (code: string, type: string) => {
      if (type === 'mouse') return `(__inputKeys["__mouse${code}"] ? 1 : 0)`;
      if (type === 'wheel') return '0';
      if (type === 'axis') return `(__engine && __engine.input ? __engine.input.getAxis(${JSON.stringify(code)}) : 0)`;
      if (type === 'gamepad') return `(__engine && __engine.input && __engine.input.isKeyDown(${JSON.stringify(code)}) ? 1 : 0)`;
      return `(__inputKeys[${JSON.stringify(code)}] ? 1 : 0)`;
    };
    
    return `(${getVal(posCode, posType)} - ${getVal(negCode, negType)})`;
  }

  // 2D Collision / Trigger event output data (label-based since classes may not be imported)
  if (node.label === 'On Collision Begin 2D') {
    if (outputKey === 'otherActor')        return '__otherActor';
    if (outputKey === 'otherActorName')    return '__otherActorName';
    if (outputKey === 'otherActorId')      return '__otherActorId';
    if (outputKey === 'selfComponent')     return '__selfComponentName';
    if (outputKey === 'normalX')           return '__normalX';
    if (outputKey === 'normalY')           return '__normalY';
    return '0';
  }
  if (node.label === 'On Collision End 2D' || node.label === 'On Trigger Begin 2D' || node.label === 'On Trigger End 2D') {
    if (outputKey === 'otherActor')        return '__otherActor';
    if (outputKey === 'otherActorName')    return '__otherActorName';
    if (outputKey === 'otherActorId')      return '__otherActorId';
    if (outputKey === 'selfComponent')     return '__selfComponentName';
    return '0';
  }

  // Collision / Trigger event output data (variables set inside the callback closure)
  if (node instanceof OnTriggerBeginOverlapNode || node instanceof OnTriggerEndOverlapNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    if (outputKey === 'selfComponent') return '__selfComponent';
    return '0';
  }
  // Bound trigger component overlap event outputs (UE-style per-component)
  if (node instanceof OnTriggerComponentBeginOverlapNode || node instanceof OnTriggerComponentEndOverlapNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    return '0';
  }
  if (node instanceof OnActorBeginOverlapNode || node instanceof OnActorEndOverlapNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    return '0';
  }
  if (node instanceof OnCollisionHitNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    if (outputKey === 'selfComponent') return '__selfComponent';
    if (outputKey === 'impactX') return '__impactX';
    if (outputKey === 'impactY') return '__impactY';
    if (outputKey === 'impactZ') return '__impactZ';
    if (outputKey === 'normalX') return '__normalX';
    if (outputKey === 'normalY') return '__normalY';
    if (outputKey === 'normalZ') return '__normalZ';
    if (outputKey === 'velocityX') return '__velX';
    if (outputKey === 'velocityY') return '__velY';
    if (outputKey === 'velocityZ') return '__velZ';
    if (outputKey === 'impulse') return '__impulse';
    return '0';
  }

  // ── OnEventNode — dynamic payload field outputs ──
  if (node instanceof OnEventNode) {
    if (outputKey === 'exec') return '0';
    // Dynamic field outputs: field_VarName → __payload.VarName
    if (outputKey.startsWith('field_')) {
      const fieldName = outputKey.slice(6); // strip 'field_'
      return `(__payload && __payload[${JSON.stringify(fieldName)}] != null ? __payload[${JSON.stringify(fieldName)}] : null)`;
    }
    return '__payload';
  }

  // ============================================================
  //  Animation 2D Nodes
  // ============================================================
  if (node.label === 'Get Anim Owner 2D') {
    return `(gameObject.name)`;
  }
  if (node.label === 'Get Anim State 2D') {
    return `(__engine.anim2d.getCurrentState(this))`;
  }

  // ============================================================
  //  Sprite Nodes
  // ============================================================
  if (node.label === 'Get Anim Variable 2D') {
    const varName = resolveValue(nodeId, 'varName', nodeMap, inputSrc, bp);
    return `(__engine.anim2d.getVariable(this, ${varName}))`;
  }

  // ============================================================
  //  Timer Nodes
  // ============================================================
  if (node.label === 'Is Timer Active') {
    const handle = resolveValue(nodeId, 'handle', nodeMap, inputSrc, bp);
    return `(__engine.timers.isActive(${handle}))`;
  }
  if (node.label === 'Is Timer Paused') {
    const handle = resolveValue(nodeId, 'handle', nodeMap, inputSrc, bp);
    return `(__engine.timers.isPaused(${handle}))`;
  }
  if (node.label === 'Get Timer Remaining Time') {
    const handle = resolveValue(nodeId, 'handle', nodeMap, inputSrc, bp);
    return `(__engine.timers.getRemainingTime(${handle}))`;
  }

  const rv = (nid: string, ok: string) => resolveValue(nid, ok, nodeMap, inputSrc, bp);

  // Component getter nodes
  if (node instanceof GetComponentLocationNode) {
    const ref = (node as GetComponentLocationNode).compIndex === -1
      ? '(gameObject.group || gameObject.mesh)'  // 2D: SpriteActor.group; 3D: GameObject.mesh
      : `((gameObject._meshComponents || [])[${(node as GetComponentLocationNode).compIndex}] || {}).mesh`;
    return `(${ref} ? ${ref}.position.${outputKey} : 0)`;
  }
  if (node instanceof GetComponentRotationNode) {
    const ref = (node as GetComponentRotationNode).compIndex === -1
      ? '(gameObject.group || gameObject.mesh)'  // 2D: SpriteActor.group; 3D: GameObject.mesh
      : `((gameObject._meshComponents || [])[${(node as GetComponentRotationNode).compIndex}] || {}).mesh`;
    return `(${ref} ? ${ref}.rotation.${outputKey} : 0)`;
  }
  if (node instanceof GetComponentScaleNode) {
    const ref = (node as GetComponentScaleNode).compIndex === -1
      ? '(gameObject.group || gameObject.mesh)'  // 2D: SpriteActor.group; 3D: GameObject.mesh
      : `((gameObject._meshComponents || [])[${(node as GetComponentScaleNode).compIndex}] || {}).mesh`;
    return `(${ref} ? ${ref}.scale.${outputKey} : 1)`;
  }

  // Get Material node — returns the material asset ID on a specific slot
  if (node instanceof GetMeshMaterialNode) {
    const ci = (node as GetMeshMaterialNode).compIndex;
    const ref = ci === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const sS = inputSrc.get(`${nodeId}.slotIndex`);
    const slotExpr = sS ? rv(sS.nid, sS.ok) : '0';
    return `(function(){ const _ref = ${ref}; if (!_ref) return ""; const _ms = []; _ref.traverse(c => { if (c.isMesh) _ms.push(c); }); const _si = ${slotExpr}; return (_si >= 0 && _si < _ms.length && _ms[_si].material && _ms[_si].material.userData && _ms[_si].material.userData.__materialAssetId) ? _ms[_si].material.userData.__materialAssetId : ""; })()`;
  }

  // Trigger component getter nodes
  if (node instanceof GetTriggerEnabledNode) {
    return `(((gameObject._triggerComponents || [])[${(node as GetTriggerEnabledNode).compIndex}] || {}).config || {}).enabled ? 1 : 0`;
  }
  if (node instanceof GetTriggerOverlapCountNode) {
    return `(__physics.collision.getOverlappingCount(gameObject.id))`;
  }
  if (node instanceof IsTriggerOverlappingNode) {
    const idS = inputSrc.get(`${nodeId}.actorId`);
    return `(__physics.collision.isOverlapping(gameObject.id, ${idS ? rv(idS.nid, idS.ok) : '0'}) ? 1 : 0)`;
  }
  if (node instanceof GetTriggerShapeNode) {
    return `(((gameObject._triggerComponents || [])[${(node as GetTriggerShapeNode).compIndex}] || {}).config || {}).shape || 'box'`;
  }

  // Light component getter nodes
  if (node instanceof GetLightEnabledNode) {
    const ci = (node as GetLightEnabledNode).compIndex;
    return `((gameObject._lightComponents || [])[${ci}] ? (gameObject._lightComponents[${ci}].light.visible ? 1 : 0) : 0)`;
  }
  if (node instanceof GetLightColorNode) {
    const ci = (node as GetLightColorNode).compIndex;
    return `((gameObject._lightComponents || [])[${ci}] ? '#' + gameObject._lightComponents[${ci}].light.color.getHexString() : '#ffffff')`;
  }
  if (node instanceof GetLightIntensityNode) {
    const ci = (node as GetLightIntensityNode).compIndex;
    return `((gameObject._lightComponents || [])[${ci}] ? gameObject._lightComponents[${ci}].light.intensity : 0)`;
  }
  if (node instanceof GetLightPositionNode) {
    const ci = (node as GetLightPositionNode).compIndex;
    return `((gameObject._lightComponents || [])[${ci}] ? gameObject._lightComponents[${ci}].light.position.${outputKey} : 0)`;
  }
  // Collision query nodes
  if (node instanceof IsOverlappingActorNode) {
    const idS = inputSrc.get(`${nodeId}.actorId`);
    return `(__physics.collision.isOverlapping(gameObject.id, ${idS ? rv(idS.nid, idS.ok) : '0'}) ? 1 : 0)`;
  }
  if (node instanceof GetOverlapCountNode) {
    return `(__physics.collision.getOverlappingCount(gameObject.id))`;
  }

  // Character movement query nodes
  if (node instanceof GetCharacterVelocityNode) {
    const cc = `gameObject.characterController`;
    return `(${cc} ? ${cc}.getNormalizedSpeed() : 0)`;
  }
  if (node instanceof GetMovementSpeedNode) {
    return `(gameObject.characterController ? gameObject.characterController.getSpeed() : 0)`;
  }
  if (node instanceof IsGroundedNode) {
    return `(gameObject.characterController ? gameObject.characterController.isGrounded : false)`;
  }
  if (node instanceof IsJumpingNode) {
    return `(gameObject.characterController ? gameObject.characterController.isJumping : false)`;
  }
  if (node instanceof IsCrouchingNode) {
    return `(gameObject.characterController ? gameObject.characterController.isCrouching : false)`;
  }
  if (node instanceof IsFallingNode) {
    return `(gameObject.characterController ? gameObject.characterController.isFalling : false)`;
  }
  if (node instanceof IsFlyingNode) {
    return `(gameObject.characterController ? gameObject.characterController.movementMode === 'flying' : false)`;
  }
  if (node instanceof IsSwimmingNode) {
    return `(gameObject.characterController ? gameObject.characterController.movementMode === 'swimming' : false)`;
  }
  if (node instanceof IsMovingNode) {
    return `(gameObject.characterController ? gameObject.characterController.isMoving() : false)`;
  }
  if (node instanceof GetMovementModeNode) {
    return `(gameObject.characterController ? gameObject.characterController.movementMode : 'walking')`;
  }
  if (node instanceof GetCameraLocationNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'x') return `(${cc} ? ${cc}.camera.position.x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.camera.position.y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.camera.position.z : 0)`;
    return '0';
  }
  // Camera Control query nodes
  if (node instanceof GetControllerRotationNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'yaw') return `(${cc} ? ${cc}.yaw * 180 / Math.PI : 0)`;
    if (outputKey === 'pitch') return `(${cc} ? ${cc}.pitch * 180 / Math.PI : 0)`;
    return '0';
  }
  if (node instanceof GetMouseLockStatusNode) {
    return `(gameObject.characterController ? gameObject.characterController.isMouseLocked() : false)`;
  }
  // Player Controller query nodes
  if (node instanceof GetPlayerControllerNode) {
    // Returns a reference to the player controller
    return `(gameObject.scene.engine?.playerControllers.get(0) ?? null)`;
  }
  if (node instanceof IsMouseCursorVisibleNode) {
    return `(gameObject.scene.engine?.playerControllers.get(0)?.isMouseCursorVisible() ?? true)`;
  }
  // Camera & Spring Arm query nodes
  if (node instanceof GetSpringArmLengthNode) {
    return `(gameObject.characterController ? gameObject.characterController.getSpringArmLength() : 0)`;
  }
  if (node instanceof GetSpringArmTargetOffsetNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'x') return `(${cc} ? ${cc}.getSpringArmTargetOffset().x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.getSpringArmTargetOffset().y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.getSpringArmTargetOffset().z : 0)`;
    return '0';
  }
  if (node instanceof GetSpringArmSocketOffsetNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'x') return `(${cc} ? ${cc}.getSpringArmSocketOffset().x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.getSpringArmSocketOffset().y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.getSpringArmSocketOffset().z : 0)`;
    return '0';
  }
  if (node instanceof GetCameraRotationNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'x') return `(${cc} ? ${cc}.camera.rotation.x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.camera.rotation.y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.camera.rotation.z : 0)`;
    return '0';
  }
  // Player Controller query nodes
  if (node instanceof GetControlledPawnNode) {
    if (outputKey === 'name') return `(gameObject.characterController ? gameObject.characterController.gameObject.name : '')`;
    if (outputKey === 'hasPawn') return `(!!gameObject.characterController)`;
    return '""';
  }
  if (node instanceof IsPossessingNode) {
    return `(!!gameObject.characterController)`;
  }
  // AI Controller query nodes
  if (node instanceof GetAIStateNode) {
    return `(gameObject.aiController ? gameObject.aiController.state : 'idle')`;
  }
  if (node instanceof AIHasReachedTargetNode) {
    return `(gameObject.aiController ? gameObject.aiController.hasReachedTarget() : false)`;
  }
  if (node instanceof AIGetDistanceToTargetNode) {
    return `(gameObject.aiController ? gameObject.aiController.getDistanceToTarget() : 0)`;
  }
  // ── AI Task / BT node outputs ──
  if (node instanceof AIReceiveExecuteNode || node instanceof AIReceiveAbortNode ||
      node instanceof AIPerformConditionCheckNode || node instanceof AIObserverActivatedNode ||
      node instanceof AIObserverDeactivatedNode || node instanceof AIServiceActivatedNode ||
      node instanceof AIServiceDeactivatedNode) {
    if (outputKey === 'ownerController') return `__aiController`;
    if (outputKey === 'controlledPawn') return `gameObject`;
    return 'null';
  }
  if (node instanceof AIReceiveTickNode || node instanceof AIServiceTickNode) {
    if (outputKey === 'ownerController') return `__aiController`;
    if (outputKey === 'controlledPawn') return `gameObject`;
    if (outputKey === 'deltaTime') return `deltaTime`;
    return 'null';
  }
  if (node instanceof OnPossessNode) {
    if (outputKey === 'possessedPawn') return `gameObject`;
    return 'null';
  }
  if (node instanceof OnMoveCompletedNode) {
    if (outputKey === 'requestId') return `0`;
    if (outputKey === 'result') return `(gameObject.aiController ? (gameObject.aiController.state === 'idle' ? 'Success' : 'InProgress') : 'Failed')`;
    return 'null';
  }
  if (node instanceof OnPerceptionUpdatedNode) {
    if (outputKey === 'updatedActors') return `[]`;
    return 'null';
  }
  // Blackboard
  if (node instanceof GetBlackboardValueNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const key = kS ? resolveValue(kS.nid, kS.ok, nodeMap, inputSrc, bp) : "''";
    return `(gameObject.aiController ? gameObject.aiController.getBlackboardValue(${key}) : null)`;
  }
  // RunBehaviorTree / MoveToLocation / RotateToFace — result outputs (set by genAction temp vars)
  if (node instanceof RunBehaviorTreeNode) {
    if (outputKey === 'success') return `__rbt_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'controller') return `__rbt_ctrl_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'pawn') return `__rbt_pawn_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'null';
  }
  if (node instanceof MoveToLocationNode) {
    if (outputKey === 'success') return `__mtl_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof RotateToFaceNode) {
    if (outputKey === 'success') return `__rtf_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  // ── NavMesh expression nodes ──
  if (node instanceof NavMeshIsReadyNode) {
    return `(__engine && __engine.navMeshSystem ? __engine.navMeshSystem.isReady : false)`;
  }
  if (node instanceof NavMeshFindClosestPointNode) {
    const posS = inputSrc.get(`${nodeId}.position`);
    const pos = posS ? resolveValue(posS.nid, posS.ok, nodeMap, inputSrc, bp) : '{x:0,y:0,z:0}';
    if (outputKey === 'closestPoint') return `(__engine && __engine.navMeshSystem ? (__engine.navMeshSystem.findClosestPoint(${pos}) || {x:0,y:0,z:0}) : {x:0,y:0,z:0})`;
    if (outputKey === 'found') return `(__engine && __engine.navMeshSystem ? !!__engine.navMeshSystem.findClosestPoint(${pos}) : false)`;
    return 'null';
  }
  if (node instanceof NavMeshRandomPointNode) {
    const cS = inputSrc.get(`${nodeId}.center`);
    const rS = inputSrc.get(`${nodeId}.radius`);
    const center = cS ? resolveValue(cS.nid, cS.ok, nodeMap, inputSrc, bp) : '{x:0,y:0,z:0}';
    const radius = rS ? resolveValue(rS.nid, rS.ok, nodeMap, inputSrc, bp) : '10';
    if (outputKey === 'point') return `(__engine && __engine.navMeshSystem ? (__engine.navMeshSystem.findRandomPoint(${center}, ${radius}) || {x:0,y:0,z:0}) : {x:0,y:0,z:0})`;
    if (outputKey === 'found') return `(__engine && __engine.navMeshSystem ? !!__engine.navMeshSystem.findRandomPoint(${center}, ${radius}) : false)`;
    return 'null';
  }
  if (node instanceof NavMeshGetAgentPositionNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const agentId = idS ? resolveValue(idS.nid, idS.ok, nodeMap, inputSrc, bp) : "''";
    return `(__engine && __engine.navMeshSystem ? (__engine.navMeshSystem.getAgentPosition(${agentId}) || {x:0,y:0,z:0}) : {x:0,y:0,z:0})`;
  }
  if (node instanceof NavMeshGetAgentVelocityNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const agentId = idS ? resolveValue(idS.nid, idS.ok, nodeMap, inputSrc, bp) : "''";
    return `(__engine && __engine.navMeshSystem ? (__engine.navMeshSystem.getAgentVelocity(${agentId}) || {x:0,y:0,z:0}) : {x:0,y:0,z:0})`;
  }
  if (node instanceof NavMeshAgentReachedTargetNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const thS = inputSrc.get(`${nodeId}.threshold`);
    const agentId = idS ? resolveValue(idS.nid, idS.ok, nodeMap, inputSrc, bp) : "''";
    const threshold = thS ? resolveValue(thS.nid, thS.ok, nodeMap, inputSrc, bp) : '0.5';
    return `(__engine && __engine.navMeshSystem ? __engine.navMeshSystem.hasAgentReachedTarget(${agentId}, ${threshold}) : false)`;
  }
  // NavMesh exec+result nodes — temp vars set in genAction
  if (node instanceof NavMeshBuildNode) {
    if (outputKey === 'success') return `__nmb_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof NavMeshFindPathNode) {
    const v = `__nmfp_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'path') return `(${v}_path || [])`;
    if (outputKey === 'pathFound') return `(${v}_ok || false)`;
    return 'null';
  }
  if (node instanceof NavMeshAddAgentNode) {
    const v = `__nmaa_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'agentId') return `(${v}_id || '')`;
    if (outputKey === 'success') return `(${v}_ok || false)`;
    return 'null';
  }
  if (node instanceof NavMeshAgentMoveToNode) {
    if (outputKey === 'success') return `__nmamt_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof NavMeshAddBoxObstacleNode) {
    if (outputKey === 'success') return `__nmabo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof NavMeshAddCylinderObstacleNode) {
    if (outputKey === 'success') return `__nmaco_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof NavMeshRemoveObstacleNode) {
    if (outputKey === 'success') return `__nmro_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  // ── Controller ↔ Pawn bidirectional nodes ──
  if (node instanceof GetControllerNode) {
    if (outputKey === 'type') return `(gameObject.controller ? gameObject.controller.controllerType : 'None')`;
    if (outputKey === 'hasController') return `(!!gameObject.controller)`;
    return `'None'`;
  }
  if (node instanceof GetControllerTypeNode) {
    return `(gameObject.controller ? gameObject.controller.controllerType : 'None')`;
  }
  if (node instanceof GetPawnNode) {
    if (outputKey === 'name') return `(gameObject.controller && gameObject.controller.getPawn() ? gameObject.controller.getPawn().gameObject.name : '')`;
    if (outputKey === 'hasPawn') return `(gameObject.controller ? gameObject.controller.isPossessing() : false)`;
    return `''`;
  }
  if (node instanceof IsPlayerControlledNode) {
    return `(gameObject.controller ? gameObject.controller.controllerType === 'PlayerController' : false)`;
  }
  if (node instanceof IsAIControlledNode) {
    return `(gameObject.controller ? gameObject.controller.controllerType === 'AIController' : false)`;
  }
  if (node instanceof CameraModeLiteralNode) {
    const ctrl = node.controls['mode'] as ClassicPreset.InputControl<'text'>;
    return `'${ctrl?.value ?? 'thirdPerson'}'`;
  }
  if (node instanceof MovementModeLiteralNode) {
    const ctrl = node.controls['mode'] as MovementModeSelectControl;
    return `'${ctrl?.value ?? 'walking'}'`;
  }

  // ── Casting & Reference data nodes ──
  if (node instanceof GetSelfReferenceNode) {
    // Return the appropriate "Self" based on the context:
    // - Actor/Anim BP: gameObject
    // - Widget BP: __widgetHandle
    return '(typeof gameObject !== "undefined" ? gameObject : (typeof __widgetHandle !== "undefined" ? __widgetHandle : null))';
  }
  if (node instanceof GetPlayerPawnNode) {
    if (outputKey === 'pawn') return `(__scene ? __scene.gameObjects.find(function(g) { return g.actorType === 'characterPawn' && g.characterController; }) || null : null)`;
    if (outputKey === 'valid') return `(!!(__scene ? __scene.gameObjects.find(function(g) { return g.actorType === 'characterPawn' && g.characterController; }) : null))`;
    return 'null';
  }
  if (node instanceof GetActorByNameNode) {
    const nS = inputSrc.get(`${nodeId}.name`);
    const nameVal = nS ? rv(nS.nid, nS.ok) : '""';
    if (outputKey === 'actor') return `(__scene ? __scene.gameObjects.find(function(g) { return g.name === ${nameVal}; }) || null : null)`;
    if (outputKey === 'valid') return `(!!(__scene ? __scene.gameObjects.find(function(g) { return g.name === ${nameVal}; }) : null))`;
    return 'null';
  }
  if (node instanceof GetAllActorsOfClassNode) {
    const cn = node as GetAllActorsOfClassNode;
    if (outputKey === 'count') return `(__scene ? __scene.gameObjects.filter(function(g) { return g.actorAssetId === ${JSON.stringify(cn.targetClassId)}; }).length : 0)`;
    return '0';
  }
  if (node instanceof GetActorNameNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    return `(${objVal} ? ${objVal}.name : '')`;
  }
  if (node instanceof GetActorVariableNode) {
    const tS = inputSrc.get(`${nodeId}.target`);
    const targetVal = tS ? rv(tS.nid, tS.ok) : 'null';
    const vn = (node as GetActorVariableNode).varName;
    return `(${targetVal} && ${targetVal}._scriptVars ? ${targetVal}._scriptVars[${JSON.stringify(vn)}] : 0)`;
  }
  // ── Game Instance nodes ──
  if (node instanceof GetGameInstanceNode) {
    return `(__gameInstance || null)`;
  }
  if (node instanceof GetGameInstanceVariableNode) {
    const ctrl = node.controls['varName'] as GameInstanceVarNameControl;
    const varName = JSON.stringify(ctrl?.value ?? '');
    return `(__gameInstance ? __gameInstance.getVariable(${varName}) : undefined)`;
  }
  if (node instanceof SetGameInstanceVariableNode) {
    const ctrl = node.controls['varName'] as GameInstanceVarNameControl;
    const varName = JSON.stringify(ctrl?.value ?? '');
    return `(__gameInstance ? __gameInstance.getVariable(${varName}) : undefined)`;
  }
  if (node instanceof GetOwnerNode) {
    return '(typeof gameObject !== "undefined" ? (gameObject.owner || gameObject) : null)';
  }
  if (node instanceof GetAnimInstanceNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    if (outputKey === 'animInstance') return `(${objVal} && ${objVal}._animationInstances ? ${objVal}._animationInstances[0] || null : null)`;
    if (outputKey === 'valid') return `(!!(${objVal} && ${objVal}._animationInstances && ${objVal}._animationInstances[0]))`;
    return 'null';
  }
  // ── AnimBP-specific nodes ──
  if (node instanceof TryGetPawnOwnerNode) {
    if (outputKey === 'pawn') return 'gameObject';
    if (outputKey === 'valid') return '(!!gameObject)';
    return 'null';
  }
  if (node instanceof GetAnimVarNode) {
    const an = node as GetAnimVarNode;
    const defaultVal = an.varType === 'number' ? '0' : an.varType === 'boolean' ? 'false' : '""';
    return `(__animInstance ? __animInstance.variables.get(${JSON.stringify(an.varName)}) : (gameObject && gameObject._animationInstances && gameObject._animationInstances[0] ? gameObject._animationInstances[0].variables.get(${JSON.stringify(an.varName)}) : ${defaultVal}))`;
  }
  if (node instanceof AnimUpdateEventNode) {
    if (outputKey === 'dt') return 'deltaTime';
    return 'null';
  }
  // Create Widget node — the 'widget' output resolves to the temp variable set in genAction
  if (node instanceof CreateWidgetNode) {
    if (outputKey === 'widget') {
      return `__wh_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    return '""';
  }
  // Spawn Actor from Class — returnValue is a temp variable set in genAction
  if (node instanceof SpawnActorFromClassNode) {
    if (outputKey === 'returnValue') {
      return `__sa_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    return 'null';
  }
  // Play Sound 2D / Play Sound at Location — sourceId is set (async, reads -1 initially)
  if (node instanceof PlaySound2DNode || node instanceof PlaySoundAtLocationNode) {
    if (outputKey === 'sourceId') {
      return `__audioSrc_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    return '-1';
  }
  // Save/Load exec nodes — temp vars set in genAction (UE-style)
  if (node instanceof CreateSaveGameObjectNode) {
    if (outputKey === 'saveObject') return `__sgo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'null';
  }
  if (node instanceof SaveGameToSlotNode) {
    if (outputKey === 'success') return `__sts_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof LoadGameFromSlotNode) {
    if (outputKey === 'saveObject') return `__lgo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'success') return `__lgOk_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'null';
  }
  if (node instanceof DeleteGameInSlotNode) {
    if (outputKey === 'success') return `__dgs_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof PureCastNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    const cn = node as PureCastNode;
    if (outputKey === 'castedObject') return `(${objVal} && ${objVal}.actorAssetId === ${JSON.stringify(cn.targetClassId)} ? ${objVal} : null)`;
    if (outputKey === 'success') return `(!!(${objVal} && ${objVal}.actorAssetId === ${JSON.stringify(cn.targetClassId)}))`;
    return 'null';
  }
  if (node instanceof CastToNode) {
    // The castedObject output from a CastToNode — resolved via a temp variable set in genAction
    if (outputKey === 'castedObject') {
      const castVar = `__cast_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      return castVar;
    }
    return 'null';
  }
  if (node instanceof IsValidNode) {
    if (outputKey === 'result') {
      const oS = inputSrc.get(`${nodeId}.object`);
      return `(!!(${oS ? rv(oS.nid, oS.ok) : 'null'}))`;
    }
    return 'false';
  }

  switch (node.label) {
    case 'Get Actor Forward Vector': {
      // 3D: Use gameObject.quaternion. 2D: Check gameObject.group.quaternion. Fallback to identity.
      const code = `(function(){ var q = (gameObject.group && gameObject.group.quaternion) ? gameObject.group.quaternion : (gameObject.quaternion || new THREE.Quaternion()); const v = new THREE.Vector3(0,0,1); v.applyQuaternion(q); return v; })()`;
      if (outputKey === 'x') return `(${code}.x)`;
      if (outputKey === 'y') return `(${code}.y)`;
      if (outputKey === 'z') return `(${code}.z)`;
      return code;
    }
    case 'Get Actor Right Vector': {
      const code = `(function(){ var q = (gameObject.group && gameObject.group.quaternion) ? gameObject.group.quaternion : (gameObject.quaternion || new THREE.Quaternion()); const v = new THREE.Vector3(1,0,0); v.applyQuaternion(q); return v; })()`;
      if (outputKey === 'x') return `(${code}.x)`;
      if (outputKey === 'y') return `(${code}.y)`;
      if (outputKey === 'z') return `(${code}.z)`;
      return code;
    }
    case 'Get Actor Up Vector': {
      const code = `(function(){ var q = (gameObject.group && gameObject.group.quaternion) ? gameObject.group.quaternion : (gameObject.quaternion || new THREE.Quaternion()); const v = new THREE.Vector3(0,1,0); v.applyQuaternion(q); return v; })()`;
      if (outputKey === 'x') return `(${code}.x)`;
      if (outputKey === 'y') return `(${code}.y)`;
      if (outputKey === 'z') return `(${code}.z)`;
      return code;
    }
    case 'Get Actor Velocity':
      return `(gameObject.userData.velocity || new THREE.Vector3(0,0,0))`;
    case 'Actor Has Tag': {
      const tS = inputSrc.get(`${nodeId}.tag`);
      return `(gameObject.userData.tags || []).includes(${tS ? rv(tS.nid, tS.ok) : '""'})`;
    }
    case 'Float': {
      const ctrl = node.controls['value'] as ClassicPreset.InputControl<'number'>;
      return String(ctrl?.value ?? 0);
    }
    case 'Integer': {
      const ctrl = node.controls['value'] as ClassicPreset.InputControl<'number'>;
      return `Math.round(${ctrl?.value ?? 0})`;
    }
    case 'Boolean': {
      const ctrl = node.controls['value'] as BoolSelectControl;
      return (ctrl?.value ?? 0) ? 'true' : 'false';
    }
    case 'String Literal': {
      const ctrl = node.controls['value'] as ClassicPreset.InputControl<'text'>;
      return JSON.stringify(String(ctrl?.value ?? ''));
    }
    case 'Color Literal': {
      const ctrl = node.controls['value'] as ColorPickerControl;
      return JSON.stringify(String(ctrl?.value ?? '#ffffff'));
    }
    case 'Vector3 Literal': {
      const xCtrl = node.controls['x'] as ClassicPreset.InputControl<'number'>;
      const yCtrl = node.controls['y'] as ClassicPreset.InputControl<'number'>;
      const zCtrl = node.controls['z'] as ClassicPreset.InputControl<'number'>;
      if (outputKey === 'x') return String(xCtrl?.value ?? 0);
      if (outputKey === 'y') return String(yCtrl?.value ?? 0);
      if (outputKey === 'z') return String(zCtrl?.value ?? 0);
      return '0';
    }
    case 'Get Time': return 'elapsedTime';
    case 'Get Delta Time': return 'deltaTime';
    case 'Event Tick':
      return outputKey === 'dt' ? 'deltaTime' : '0';
    // For Loop / For Each Loop data outputs
    case 'For Loop':
      if (outputKey === 'index') return '__i';
      return '0';
    case 'For Loop with Break': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (outputKey === 'index') return `__flb_i_${uid}`;
      return '0';
    }
    case 'For Each Loop': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (outputKey === 'element') return `__fe_el_${uid}`;
      if (outputKey === 'index') return `__fe_i_${uid}`;
      return '0';
    }
    case 'For Each Loop with Break': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (outputKey === 'element') return `__fe_el_${uid}`;
      if (outputKey === 'index') return `__fe_i_${uid}`;
      return '0';
    }
    case 'For Each Actor': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (outputKey === 'element') return `__fe_el_${uid}`;
      if (outputKey === 'index') return `__fe_i_${uid}`;
      return '0';
    }
    // Stateful flow control data outputs
    case 'Flip Flop': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (outputKey === 'isA') return `(typeof __flipFlop_${uid} !== 'undefined' ? __flipFlop_${uid} : true)`;
      return '0';
    }
    case 'Do N': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (outputKey === 'counter') return `(typeof __doN_ctr_${uid} !== 'undefined' ? __doN_ctr_${uid} : 0)`;
      return '0';
    }
    // On Drag Selection Complete data outputs
    case 'On Drag Selection Complete': {
      if (outputKey === 'selectedActors') return '(__dragSelectedActors || [])';
      if (outputKey === 'count') return '(__dragSelectedCount || 0)';
      return '0';
    }
    case 'Get Actor Position': return `gameObject.position.${outputKey}`;
    case 'Get Actor Rotation': return `gameObject.rotation.${outputKey}`;
    case 'Get Actor Scale':    return `gameObject.scale.${outputKey}`;
    case 'Add': case 'Subtract': case 'Multiply': case 'Divide': {
      const ops: Record<string, string> = { 'Add':'+','Subtract':'-','Multiply':'*','Divide':'/' };
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : (node.label === 'Divide' ? '1' : '0');
      return `(${a} ${ops[node.label]} ${b})`;
    }
    case 'Sine': { const s = inputSrc.get(`${nodeId}.value`); return `Math.sin(${s ? rv(s.nid, s.ok) : '0'})`; }
    case 'Cosine': { const s = inputSrc.get(`${nodeId}.value`); return `Math.cos(${s ? rv(s.nid, s.ok) : '0'})`; }
    case 'Abs': { const s = inputSrc.get(`${nodeId}.value`); return `Math.abs(${s ? rv(s.nid, s.ok) : '0'})`; }
    case 'Clamp': {
      const v = inputSrc.get(`${nodeId}.value`);
      const mn = inputSrc.get(`${nodeId}.min`);
      const mx = inputSrc.get(`${nodeId}.max`);
      return `Math.min(Math.max(${v ? rv(v.nid, v.ok) : '0'}, ${mn ? rv(mn.nid, mn.ok) : '0'}), ${mx ? rv(mx.nid, mx.ok) : '1'})`;
    }
    case 'Lerp': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const al = inputSrc.get(`${nodeId}.alpha`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '1';
      const t = al ? rv(al.nid, al.ok) : '0.5';
      return `(${a} + (${b} - ${a}) * ${t})`;
    }
    case 'Greater Than': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(${aS ? rv(aS.nid, aS.ok) : '0'} > ${bS ? rv(bS.nid, bS.ok) : '0'})`;
    }
    case 'Modulo': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `(${a} % ${b})`;
    }
    case 'Power': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `(${a} ** ${b})`;
    }
    case 'Min': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `Math.min(${a}, ${b})`;
    }
    case 'Max': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `Math.max(${a}, ${b})`;
    }
    case 'Round': {
      const s = inputSrc.get(`${nodeId}.value`);
      return `Math.round(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'Floor': {
      const s = inputSrc.get(`${nodeId}.value`);
      return `Math.floor(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'Ceil': {
      const s = inputSrc.get(`${nodeId}.value`);
      return `Math.ceil(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'Sqrt': {
      const s = inputSrc.get(`${nodeId}.value`);
      return `Math.sqrt(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'Log': {
      const s = inputSrc.get(`${nodeId}.value`);
      return `Math.log(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'Tangent': {
      const s = inputSrc.get(`${nodeId}.value`);
      return `Math.tan(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'Normalize (Vector)': {
      const vS = inputSrc.get(`${nodeId}.vector`);
      const v = vS ? rv(vS.nid, vS.ok) : 'new THREE.Vector3()';
      return `(function(){ const _v = ${v}.clone(); return _v.normalize(); })()`;
    }
    case 'Dot Product': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : 'new THREE.Vector3()';
      const b = bS ? rv(bS.nid, bS.ok) : 'new THREE.Vector3()';
      return `(${a}.dot(${b}))`;
    }
    case 'Cross Product': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : 'new THREE.Vector3()';
      const b = bS ? rv(bS.nid, bS.ok) : 'new THREE.Vector3()';
      return `(function(){ const _v = ${a}.clone(); return _v.cross(${b}); })()`;
    }
    case 'Vector Length': {
      const vS = inputSrc.get(`${nodeId}.vector`);
      const v = vS ? rv(vS.nid, vS.ok) : 'new THREE.Vector3()';
      return `(${v}.length())`;
    }
    case 'Random Float': {
      return 'Math.random()';
    }
    case 'Random Float in Range': {
      const minS = inputSrc.get(`${nodeId}.min`);
      const maxS = inputSrc.get(`${nodeId}.max`);
      const min = minS ? rv(minS.nid, minS.ok) : '0';
      const max = maxS ? rv(maxS.nid, maxS.ok) : '1';
      return `(${min} + Math.random() * (${max} - ${min}))`;
    }
    case 'Random Int in Range': {
      const minS = inputSrc.get(`${nodeId}.min`);
      const maxS = inputSrc.get(`${nodeId}.max`);
      const min = minS ? rv(minS.nid, minS.ok) : '0';
      const max = maxS ? rv(maxS.nid, maxS.ok) : '1';
      return `(Math.floor(Math.random() * (${max} - ${min} + 1)) + ${min})`;
    }
    case 'Random Bool': {
      return '(Math.random() > 0.5)';
    }
    case 'Equal': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `(${a} === ${b})`;
    }
    case 'Not Equal': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `(${a} !== ${b})`;
    }
    case 'Less Than': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `(${a} < ${b})`;
    }
    case 'Greater or Equal': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `(${a} >= ${b})`;
    }
    case 'Less or Equal': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '0';
      const b = bS ? rv(bS.nid, bS.ok) : '0';
      return `(${a} <= ${b})`;
    }
    case 'AND': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : 'false';
      const b = bS ? rv(bS.nid, bS.ok) : 'false';
      return `(${a} && ${b})`;
    }
    case 'OR': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : 'false';
      const b = bS ? rv(bS.nid, bS.ok) : 'false';
      return `(${a} || ${b})`;
    }
    case 'NOT': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const a = aS ? rv(aS.nid, aS.ok) : 'false';
      return `(!${a})`;
    }
    case 'XOR': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : 'false';
      const b = bS ? rv(bS.nid, bS.ok) : 'false';
      return `(!!(${a} ^ ${b}))`;
    }
    case 'Append': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const a = aS ? rv(aS.nid, aS.ok) : '""';
      const b = bS ? rv(bS.nid, bS.ok) : '""';
      return `(String(${a}) + String(${b}))`;
    }
    case 'Format Text': {
      const formatS = inputSrc.get(`${nodeId}.format`);
      const format = formatS ? rv(formatS.nid, formatS.ok) : '""';
      // Format Text needs to replace {0}, {1}, etc. with inputs
      // For simplicity, we'll just return the format string if no args are provided
      return `(${format})`;
    }
    case 'Int to String': {
      const s = inputSrc.get(`${nodeId}.value`);
      return `String(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'Float to String': {
      const s = inputSrc.get(`${nodeId}.value`);
      return `String(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'Vec3 to String': {
      const s = inputSrc.get(`${nodeId}.value`);
      const v = s ? rv(s.nid, s.ok) : 'new THREE.Vector3()';
      return `("X=" + ${v}.x.toFixed(2) + " Y=" + ${v}.y.toFixed(2) + " Z=" + ${v}.z.toFixed(2))`;
    }
    case 'String Length': {
      const s = inputSrc.get(`${nodeId}.string`);
      return `(String(${s ? rv(s.nid, s.ok) : '""'}).length)`;
    }
    case 'Substring': {
      const s = inputSrc.get(`${nodeId}.string`);
      const startS = inputSrc.get(`${nodeId}.startIndex`);
      const lenS = inputSrc.get(`${nodeId}.length`);
      const str = s ? rv(s.nid, s.ok) : '""';
      const start = startS ? rv(startS.nid, startS.ok) : '0';
      const len = lenS ? rv(lenS.nid, lenS.ok) : '0';
      return `(String(${str}).substr(${start}, ${len}))`;
    }
    case 'String Contains': {
      const s = inputSrc.get(`${nodeId}.string`);
      const subS = inputSrc.get(`${nodeId}.substring`);
      const str = s ? rv(s.nid, s.ok) : '""';
      const sub = subS ? rv(subS.nid, subS.ok) : '""';
      return `(String(${str}).includes(String(${sub})))`;
    }
    case 'String Replace': {
      const s = inputSrc.get(`${nodeId}.string`);
      const fromS = inputSrc.get(`${nodeId}.from`);
      const toS = inputSrc.get(`${nodeId}.to`);
      const str = s ? rv(s.nid, s.ok) : '""';
      const from = fromS ? rv(fromS.nid, fromS.ok) : '""';
      const to = toS ? rv(toS.nid, toS.ok) : '""';
      return `(String(${str}).split(String(${from})).join(String(${to})))`;
    }
    case 'String Split': {
      const s = inputSrc.get(`${nodeId}.string`);
      const sepS = inputSrc.get(`${nodeId}.separator`);
      const str = s ? rv(s.nid, s.ok) : '""';
      const sep = sepS ? rv(sepS.nid, sepS.ok) : '""';
      return `(String(${str}).split(String(${sep})))`;
    }
    case 'Trim': {
      const s = inputSrc.get(`${nodeId}.string`);
      return `(String(${s ? rv(s.nid, s.ok) : '""'}).trim())`;
    }
    case 'To Upper': {
      const s = inputSrc.get(`${nodeId}.string`);
      return `(String(${s ? rv(s.nid, s.ok) : '""'}).toUpperCase())`;
    }
    case 'To Lower': {
      const s = inputSrc.get(`${nodeId}.string`);
      return `(String(${s ? rv(s.nid, s.ok) : '""'}).toLowerCase())`;
    }
    case 'Parse Int': {
      const s = inputSrc.get(`${nodeId}.string`);
      return `(parseInt(String(${s ? rv(s.nid, s.ok) : '""'}), 10) || 0)`;
    }
    case 'Parse Float': {
      const s = inputSrc.get(`${nodeId}.string`);
      return `(parseFloat(String(${s ? rv(s.nid, s.ok) : '""'})) || 0)`;
    }
    case 'Get Parent Class': {
      const cS = inputSrc.get(`${nodeId}.classId`);
      const classId = cS ? rv(cS.nid, cS.ok) : '""';
      return `(__actorAssetManager ? __actorAssetManager.getParentClass(${classId}) : "")`;
    }
    case 'Get Child Classes': {
      const cS = inputSrc.get(`${nodeId}.classId`);
      const classId = cS ? rv(cS.nid, cS.ok) : '""';
      return `(__actorAssetManager ? __actorAssetManager.getChildClasses(${classId}) : [])`;
    }
    case 'Is Child Of': {
      const cS = inputSrc.get(`${nodeId}.classId`);
      const pS = inputSrc.get(`${nodeId}.parentClassId`);
      const classId = cS ? rv(cS.nid, cS.ok) : '""';
      const parentId = pS ? rv(pS.nid, pS.ok) : '""';
      return `(__actorAssetManager ? __actorAssetManager.isChildOf(${classId}, ${parentId}) : false)`;
    }
    case 'Get Class Name': {
      const cS = inputSrc.get(`${nodeId}.classId`);
      const classId = cS ? rv(cS.nid, cS.ok) : '""';
      return `(__actorAssetManager ? (__actorAssetManager.getAsset(${classId})?.name || "") : "")`;
    }
    case 'Get Ancestry Chain': {
      const cS = inputSrc.get(`${nodeId}.classId`);
      const classId = cS ? rv(cS.nid, cS.ok) : '""';
      return `(__actorAssetManager ? __actorAssetManager.getAncestryChain(${classId}) : [])`;
    }

    // ── Physics getters ──────────────────────────────────────
    case 'Get Mass':
      return '(gameObject.rigidBody ? gameObject.rigidBody.mass() : 0)';
    case 'Get Velocity':
      return `(gameObject.rigidBody ? gameObject.rigidBody.linvel().${outputKey} : 0)`;
    case 'Get Angular Velocity':
      return `(gameObject.rigidBody ? gameObject.rigidBody.angvel().${outputKey} : 0)`;
    case 'Is Simulating Physics':
      return '(!!gameObject.rigidBody)';
    case 'Is Gravity Enabled':
      return '(gameObject.rigidBody ? gameObject.rigidBody.gravityScale() > 0 : false)';
    case 'Get Gravity Scale':
      return '(gameObject.rigidBody ? gameObject.rigidBody.gravityScale() : 1)';
    case 'Get Body Type': {
      return `(gameObject.rigidBody ? (gameObject.rigidBody.isDynamic() ? "dynamic" : gameObject.rigidBody.isKinematic() ? "kinematic" : "static") : "static")`;
    }
    case 'Get Center of Mass': {
      if (outputKey === 'x') return `(gameObject.rigidBody ? gameObject.rigidBody.translation().x : 0)`;
      if (outputKey === 'y') return `(gameObject.rigidBody ? gameObject.rigidBody.translation().y : 0)`;
      if (outputKey === 'z') return `(gameObject.rigidBody ? gameObject.rigidBody.translation().z : 0)`;
      return '0';
    }
    case 'Get Speed': {
      return `(gameObject.rigidBody ? Math.sqrt(gameObject.rigidBody.linvel().x**2 + gameObject.rigidBody.linvel().y**2 + gameObject.rigidBody.linvel().z**2) : 0)`;
    }
    case 'Get Velocity at Point': {
      const pS = inputSrc.get(`${nodeId}.point`);
      const p = pS ? rv(pS.nid, pS.ok) : 'new THREE.Vector3()';
      if (outputKey === 'x') return `(gameObject.rigidBody ? gameObject.rigidBody.linvel().x : 0)`;
      if (outputKey === 'y') return `(gameObject.rigidBody ? gameObject.rigidBody.linvel().y : 0)`;
      if (outputKey === 'z') return `(gameObject.rigidBody ? gameObject.rigidBody.linvel().z : 0)`;
      return '0';
    }
    case 'Get World Gravity': {
      if (outputKey === 'x') return `(__physics ? __physics.world.gravity.x : 0)`;
      if (outputKey === 'y') return `(__physics ? __physics.world.gravity.y : -9.81)`;
      if (outputKey === 'z') return `(__physics ? __physics.world.gravity.z : 0)`;
      return '0';
    }
    case 'Get Player Character': {
      const piS = inputSrc.get(`${nodeId}.playerIndex`);
      const pi = piS ? rv(piS.nid, piS.ok) : '0';
      return `(__scene ? __scene.gameObjects.find(function(g) { return g.actorType === 'characterPawn' && g.characterController; }) || null : null)`;
    }
    case 'Get Player Camera Manager': {
      const piS = inputSrc.get(`${nodeId}.playerIndex`);
      const pi = piS ? rv(piS.nid, piS.ok) : '0';
      return `(__scene && __scene.engine && __scene.engine.playerControllers.get(${pi}) ? __scene.engine.playerControllers.get(${pi}).cameraManager : null)`;
    }
    case 'Get World': {
      return `(__scene || null)`;
    }
    case 'Get Game Mode': {
      return `(__scene && __scene.engine ? __scene.engine.gameMode : null)`;
    }
    case 'Get Game State': {
      return `(__scene && __scene.engine ? __scene.engine.gameState : null)`;
    }
    case 'Get All Actors with Tag': {
      const tS = inputSrc.get(`${nodeId}.tag`);
      const tag = tS ? rv(tS.nid, tS.ok) : '""';
      return `(__scene ? __scene.gameObjects.filter(function(g) { return (g.userData.tags || []).includes(${tag}); }) : [])`;
    }
    case 'Get World Delta Seconds': {
      return `(typeof deltaTime !== 'undefined' ? deltaTime : 0)`;
    }
    case 'Get Real Time Seconds': {
      return `(typeof elapsedTime !== 'undefined' ? elapsedTime : 0)`;
    }
    case 'Get Game Time in Seconds': {
      return `(typeof elapsedTime !== 'undefined' ? elapsedTime : 0)`;
    }
    case 'Is Game Paused': {
      return `(__scene && __scene.engine ? __scene.engine.isPaused : false)`;
    }
    case 'Get Mouse Position': {
      if (outputKey === 'x') return `(__engine && __engine.input ? __engine.input.getMousePosition().x : 0)`;
      if (outputKey === 'y') return `(__engine && __engine.input ? __engine.input.getMousePosition().y : 0)`;
      return '0';
    }
    case 'Get Mouse Delta': {
      if (outputKey === 'x') return `(__engine && __engine.input ? __engine.input.getMouseDelta().x : 0)`;
      if (outputKey === 'y') return `(__engine && __engine.input ? __engine.input.getMouseDelta().y : 0)`;
      return '0';
    }
    case 'Is Timer Active': {
      const hS = inputSrc.get(`${nodeId}.handle`);
      const handle = hS ? rv(hS.nid, hS.ok) : 'null';
      return `(__engine && __engine.timerManager ? __engine.timerManager.isTimerActive(${handle}) : false)`;
    }
    case 'Is Timer Paused': {
      const hS = inputSrc.get(`${nodeId}.handle`);
      const handle = hS ? rv(hS.nid, hS.ok) : 'null';
      return `(__engine && __engine.timerManager ? __engine.timerManager.isTimerPaused(${handle}) : false)`;
    }
    case 'Get Timer Remaining Time': {
      const hS = inputSrc.get(`${nodeId}.handle`);
      const handle = hS ? rv(hS.nid, hS.ok) : 'null';
      return `(__engine && __engine.timerManager ? __engine.timerManager.getTimerRemainingTime(${handle}) : 0)`;
    }
    case 'Get Timer Elapsed Time': {
      const hS = inputSrc.get(`${nodeId}.handle`);
      const handle = hS ? rv(hS.nid, hS.ok) : 'null';
      return `(__engine && __engine.timerManager ? __engine.timerManager.getTimerElapsedTime(${handle}) : 0)`;
    }
    case 'Get Physics Material': {
      if (outputKey === 'friction')
        return '(gameObject.collider ? gameObject.collider.friction() : 0.5)';
      if (outputKey === 'restitution')
        return '(gameObject.collider ? gameObject.collider.restitution() : 0.3)';
      return '0';
    }

    // ── Type conversions ─────────────────────────────────────
    case 'Bool \u2192 Number': {
      const s = inputSrc.get(`${nodeId}.in`);
      return `(${s ? rv(s.nid, s.ok) : 'false'} ? 1 : 0)`;
    }
    case 'Number \u2192 Bool': {
      const s = inputSrc.get(`${nodeId}.in`);
      return `(!!(${s ? rv(s.nid, s.ok) : '0'}))`;
    }
    case 'Bool \u2192 String': {
      const s = inputSrc.get(`${nodeId}.in`);
      return `(${s ? rv(s.nid, s.ok) : 'false'} ? "true" : "false")`;
    }
    case 'String \u2192 Bool': {
      const s = inputSrc.get(`${nodeId}.in`);
      const v = s ? rv(s.nid, s.ok) : '""';
      return `(${v} !== "" && ${v} !== "0" && ${v} !== "false")`;
    }
    case 'Number \u2192 String': {
      const s = inputSrc.get(`${nodeId}.in`);
      return `String(${s ? rv(s.nid, s.ok) : '0'})`;
    }
    case 'String \u2192 Number': {
      const s = inputSrc.get(`${nodeId}.in`);
      return `(parseFloat(${s ? rv(s.nid, s.ok) : '"0"'}) || 0)`;
    }
    case 'Color \u2192 String': {
      const s = inputSrc.get(`${nodeId}.in`);
      return s ? rv(s.nid, s.ok) : '"#ffffff"';
    }
    case 'String \u2192 Color': {
      const s = inputSrc.get(`${nodeId}.in`);
      return s ? rv(s.nid, s.ok) : '"#ffffff"';
    }

    // ── Widget / UI getters ───────────────────────────────────
    case 'Get Widget Text': {
      const n = node as GetWidgetTextNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.getText(__widgetHandle, ${wName}) : '')`;
    }
    case 'Get Progress Bar Percent': {
      const n = node as GetProgressBarPercentNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.getProgressBarPercent(__widgetHandle, ${wName}) : 0)`;
    }
    case 'Get Slider Value': {
      const n = node as GetSliderValueNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.getSliderValue(__widgetHandle, ${wName}) : 0)`;
    }
    case 'Get CheckBox State': {
      const n = node as GetCheckBoxStateNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.getCheckBoxState(__widgetHandle, ${wName}) : false)`;
    }
    case 'Is Widget Visible': {
      const n = node as IsWidgetVisibleNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.isVisible(__widgetHandle, ${wName}) : false)`;
    }
    case 'Create Widget': {
      // Return the variable name that genAction creates, not an inline call
      // This prevents createWidget from being called multiple times
      return `__wh_${nodeId.replace(/[^a-zA-Z0-9]/g,'_')}`;
    }
    case 'Get Widget Variable': {
      const n = node as GetWidgetVariableNode;
      const wS = inputSrc.get(`${nodeId}.widget`);
      const widgetHandle = wS ? resolveValue(wS.nid, wS.ok, nodeMap, inputSrc, bp) : '""';
      const varName = JSON.stringify(n.getVariableName());
      return `(__uiManager ? __uiManager.getWidgetVariable(${widgetHandle}, ${varName}) : undefined)`;
    }

    // ── 2D Physics getters ────────────────────────────────────
    case 'Get Velocity 2D': {
      if (outputKey === 'x') return '(gameObject.getComponent && gameObject.getComponent("RigidBody2D") ? gameObject.getComponent("RigidBody2D").rigidBody.linvel().x : 0)';
      if (outputKey === 'y') return '(gameObject.getComponent && gameObject.getComponent("RigidBody2D") ? gameObject.getComponent("RigidBody2D").rigidBody.linvel().y : 0)';
      if (outputKey === 'speed') return '(function(){ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (!_rb) return 0; var _v = _rb.rigidBody.linvel(); return Math.sqrt(_v.x*_v.x + _v.y*_v.y); }())';
      return '0';
    }
    case 'Get Body Type 2D': {
      return '(function(){ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (!_rb) return "static"; if (_rb.rigidBody.isDynamic()) return "dynamic"; if (_rb.rigidBody.isKinematic()) return "kinematic"; return "static"; }())';
    }

    // ── 2D Character getters ────────────────────────────────
    case 'Is Grounded 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").isGrounded : false)';
    }
    case 'Is Jumping 2D': {
      return '(function(){ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (!_cm) return false; var _rb = gameObject.getComponent("RigidBody2D"); return _rb && _rb.rigidBody.linvel().y > 0.01 && !_cm.isGrounded; }())';
    }
    case 'Is Falling 2D': {
      return '(function(){ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (!_cm) return false; var _rb = gameObject.getComponent("RigidBody2D"); return _rb && _rb.rigidBody.linvel().y < -0.01 && !_cm.isGrounded; }())';
    }
    case 'Get Character Velocity 2D': {
      if (outputKey === 'x') return '(gameObject.getComponent && gameObject.getComponent("RigidBody2D") ? gameObject.getComponent("RigidBody2D").rigidBody.linvel().x : 0)';
      if (outputKey === 'y') return '(gameObject.getComponent && gameObject.getComponent("RigidBody2D") ? gameObject.getComponent("RigidBody2D").rigidBody.linvel().y : 0)';
      if (outputKey === 'speed') return '(function(){ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (!_rb) return 0; var _v = _rb.rigidBody.linvel(); return Math.sqrt(_v.x*_v.x + _v.y*_v.y); }())';
      return '0';
    }
    case 'Get Max Walk Speed 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.moveSpeed : 0)';
    }
    case 'Get Run Speed 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.runSpeed : 0)';
    }
    case 'Get Acceleration 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.acceleration : 0)';
    }
    case 'Get Deceleration 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.deceleration : 0)';
    }
    case 'Get Air Control 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.airControl : 0.8)';
    }
    case 'Get Jump Force 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.jumpForce : 600)';
    }
    case 'Get Coyote Time 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.coyoteTime : 0.1)';
    }
    case 'Get Jump Buffer Time 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.jumpBufferTime : 0.1)';
    }
    case 'Get Max Fall Speed 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.maxFallSpeed : -1200)';
    }
    case 'Get Jump Cut 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? !!gameObject.getComponent("CharacterMovement2D").properties.jumpCut : true)';
    }
    case 'Get Linear Drag 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.linearDrag : 0)';
    }
    case 'Get Freeze Rotation 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? !!gameObject.getComponent("CharacterMovement2D").properties.freezeRotation : true)';
    }
    case 'Get Gravity Multiplier 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").properties.gravityScale : 1)';
    }
    case 'Get Jumps Remaining 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? gameObject.getComponent("CharacterMovement2D").jumpsRemaining : 0)';
    }
    case 'Get Sprite Facing Direction 2D': {
      return '(gameObject.getComponent && gameObject.getComponent("CharacterMovement2D") ? !!gameObject.getComponent("CharacterMovement2D").facingRight : true)';
    }
    case 'Get Character Speed 2D': {
      if (outputKey === 'horizontalSpeed') return '(function(){ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (!_rb) return 0; return Math.abs(_rb.rigidBody.linvel().x); }())';
      return '(function(){ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (!_rb) return 0; var _v = _rb.rigidBody.linvel(); return Math.sqrt(_v.x*_v.x + _v.y*_v.y); }())';
    }

    // ── 2D Camera getters ───────────────────────────────────
    case 'Get Camera Zoom 2D': {
      return '(__engine && __engine.physics2D ? (__engine.scene2DManager ? __engine.scene2DManager.camera2D.zoom : 1) : 1)';
    }
    case 'Get Camera FOV 2D': {
      // FOV in 2D == zoom level (lower zoom = wider view)
      return '(__engine && __engine.scene2DManager && __engine.scene2DManager.camera2D ? __engine.scene2DManager.camera2D.zoom : 1)';
    }
    case 'Get Camera Pixels Per Unit 2D': {
      return '(__engine && __engine.scene2DManager && __engine.scene2DManager.camera2D ? __engine.scene2DManager.camera2D.pixelsPerUnit : 100)';
    }
    case 'Get Camera Position 2D': {
      if (outputKey === 'x') return '(__engine && __engine.scene2DManager && __engine.scene2DManager.camera2D ? __engine.scene2DManager.camera2D.camera.position.x : 0)';
      if (outputKey === 'y') return '(__engine && __engine.scene2DManager && __engine.scene2DManager.camera2D ? __engine.scene2DManager.camera2D.camera.position.y : 0)';
      return '0';
    }
    case 'Screen To World 2D': {
      const sxS = inputSrc.get(`${nodeId}.screenX`);
      const syS = inputSrc.get(`${nodeId}.screenY`);
      const sx = sxS ? rv(sxS.nid, sxS.ok) : '0';
      const sy = syS ? rv(syS.nid, syS.ok) : '0';
      if (outputKey === 'worldX') return `(__engine && __engine.scene2DManager && __engine.scene2DManager.camera2D ? __engine.scene2DManager.camera2D.screenToWorld(${sx}, ${sy}).x : 0)`;
      if (outputKey === 'worldY') return `(__engine && __engine.scene2DManager && __engine.scene2DManager.camera2D ? __engine.scene2DManager.camera2D.screenToWorld(${sx}, ${sy}).y : 0)`;
      return '0';
    }
    case 'World To Screen 2D': {
      const wxS = inputSrc.get(`${nodeId}.worldX`);
      const wyS = inputSrc.get(`${nodeId}.worldY`);
      const wx = wxS ? rv(wxS.nid, wxS.ok) : '0';
      const wy = wyS ? rv(wyS.nid, wyS.ok) : '0';
      if (outputKey === 'screenX') return `(__engine && __engine.scene2DManager && __engine.scene2DManager.camera2D ? __engine.scene2DManager.camera2D.worldToScreen(${wx}, ${wy}).x : 0)`;
      if (outputKey === 'screenY') return `(__engine && __engine.scene2DManager && __engine.scene2DManager.camera2D ? __engine.scene2DManager.camera2D.worldToScreen(${wx}, ${wy}).y : 0)`;
      return '0';
    }

    // ── 2D Sprite / Animation getters ───────────────────────
    case 'Get Anim Variable 2D': {
      const vnS = inputSrc.get(`${nodeId}.varName`);
      const varName = vnS ? rv(vnS.nid, vnS.ok) : '""';
      return `(gameObject.getComponent && gameObject.getComponent("SpriteAnimator") ? (gameObject.getComponent("SpriteAnimator").variables ? gameObject.getComponent("SpriteAnimator").variables.get(${varName}) : 0) : 0)`;
    }
    case 'Is Animation Playing 2D': {
      const anS = inputSrc.get(`${nodeId}.animName`);
      const animName = anS ? rv(anS.nid, anS.ok) : '""';
      return `(gameObject.getComponent && gameObject.getComponent("SpriteAnimator") ? gameObject.getComponent("SpriteAnimator").currentAnimation === ${animName} : false)`;
    }
    case 'Get Current Animation 2D': {
      if (outputKey === 'animName') return '(gameObject.getComponent && gameObject.getComponent("SpriteAnimator") ? gameObject.getComponent("SpriteAnimator").currentAnimation || "" : "")';
      if (outputKey === 'frame') return '(gameObject.getComponent && gameObject.getComponent("SpriteAnimator") ? gameObject.getComponent("SpriteAnimator").currentFrame || 0 : 0)';
      if (outputKey === 'progress') return '(gameObject.getComponent && gameObject.getComponent("SpriteAnimator") ? gameObject.getComponent("SpriteAnimator").progress || 0 : 0)';
      return '0';
    }
    case 'Get Sorting Layer': {
      if (outputKey === 'layerName') return '(gameObject.sortingLayer || "Default")';
      if (outputKey === 'orderInLayer') return '(gameObject.orderInLayer || 0)';
      return '""';
    }
    case 'Get Anim Float 2D': {
      const vnS = inputSrc.get(`${nodeId}.varName`);
      const varName = vnS ? rv(vnS.nid, vnS.ok) : '""';
      return `(gameObject._animationInstances && gameObject._animationInstances[0] ? (gameObject._animationInstances[0].variables.get(${varName}) || 0) : 0)`;
    }
    case 'Get Anim Bool 2D': {
      const vnS = inputSrc.get(`${nodeId}.varName`);
      const varName = vnS ? rv(vnS.nid, vnS.ok) : '""';
      return `(!!(gameObject._animationInstances && gameObject._animationInstances[0] ? gameObject._animationInstances[0].variables.get(${varName}) : false))`;
    }
    case 'Get Anim State 2D': {
      return '(gameObject._animationInstances && gameObject._animationInstances[0] ? gameObject._animationInstances[0].currentState || "" : "")';
    }
    case 'Get Anim Owner 2D': {
      return '(gameObject.name || "")';
    }

    // ── 2D Tilemap getters ──────────────────────────────────
    case 'Get Tile At Location': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const lS = inputSrc.get(`${nodeId}.layer`);
      const x = xS ? rv(xS.nid, xS.ok) : '0';
      const y = yS ? rv(yS.nid, yS.ok) : '0';
      const layer = lS ? rv(lS.nid, lS.ok) : '"Ground"';
      if (outputKey === 'tileId') return `(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return -1; var _tm = Array.from(_sm.tilemaps.values())[0]; if (!_tm) return -1; var _l = _tm.layers.find(function(l){ return l.name === ${layer}; }); if (!_l) return -1; return _l.tiles[${x}+","+${y}] != null ? _l.tiles[${x}+","+${y}] : -1; }())`;
      if (outputKey === 'exists') return `(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return false; var _tm = Array.from(_sm.tilemaps.values())[0]; if (!_tm) return false; var _l = _tm.layers.find(function(l){ return l.name === ${layer}; }); return _l ? _l.tiles[${x}+","+${y}] != null : false; }())`;
      return '-1';
    }
    case 'Has Tile At Location': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const lS = inputSrc.get(`${nodeId}.layer`);
      const x = xS ? rv(xS.nid, xS.ok) : '0';
      const y = yS ? rv(yS.nid, yS.ok) : '0';
      const layer = lS ? rv(lS.nid, lS.ok) : '"Ground"';
      return `(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return false; var _tm = Array.from(_sm.tilemaps.values())[0]; if (!_tm) return false; var _l = _tm.layers.find(function(l){ return l.name === ${layer}; }); return _l ? _l.tiles[${x}+","+${y}] != null : false; }())`;
    }
    case 'World To Tile': {
      const wxS = inputSrc.get(`${nodeId}.worldX`);
      const wyS = inputSrc.get(`${nodeId}.worldY`);
      const wx = wxS ? rv(wxS.nid, wxS.ok) : '0';
      const wy = wyS ? rv(wyS.nid, wyS.ok) : '0';
      if (outputKey === 'gridX') return `(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return 0; var _ts = Array.from(_sm.tilesets.values())[0]; if (!_ts) return 0; return Math.floor(${wx} / (_ts.tileWidth / _ts.pixelsPerUnit)); }())`;
      if (outputKey === 'gridY') return `(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return 0; var _ts = Array.from(_sm.tilesets.values())[0]; if (!_ts) return 0; return Math.floor(${wy} / (_ts.tileHeight / _ts.pixelsPerUnit)); }())`;
      return '0';
    }
    case 'Tile To World': {
      const gxS = inputSrc.get(`${nodeId}.gridX`);
      const gyS = inputSrc.get(`${nodeId}.gridY`);
      const gx = gxS ? rv(gxS.nid, gxS.ok) : '0';
      const gy = gyS ? rv(gyS.nid, gyS.ok) : '0';
      if (outputKey === 'worldX') return `(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return 0; var _ts = Array.from(_sm.tilesets.values())[0]; if (!_ts) return 0; return (${gx} + 0.5) * (_ts.tileWidth / _ts.pixelsPerUnit); }())`;
      if (outputKey === 'worldY') return `(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return 0; var _ts = Array.from(_sm.tilesets.values())[0]; if (!_ts) return 0; return (${gy} + 0.5) * (_ts.tileHeight / _ts.pixelsPerUnit); }())`;
      return '0';
    }
    case 'Get Tilemap Size': {
      if (outputKey === 'width') return '(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return 0; var _ts = Array.from(_sm.tilesets.values())[0]; return _ts ? _ts.columns : 0; }())';
      if (outputKey === 'height') return '(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return 0; var _ts = Array.from(_sm.tilesets.values())[0]; return _ts ? _ts.rows : 0; }())';
      if (outputKey === 'tileSize') return '(function(){ var _sm = __engine && __engine.scene2DManager; if (!_sm) return 0; var _ts = Array.from(_sm.tilesets.values())[0]; return _ts ? _ts.tileWidth : 0; }())';
      return '0';
    }

    // ── Audio (pure) ────────────────────────────────────────
    case 'Is Sound Playing': {
      const idS = inputSrc.get(`${nodeId}.sourceId`);
      const sid = idS ? rv(idS.nid, idS.ok) : '-1';
      return `(__engine && __engine.audio ? __engine.audio.isPlaying(${sid}) : false)`;
    }

    // ── Gamepad (pure) ──────────────────────────────────────
    case 'Is Gamepad Connected': {
      const giS = inputSrc.get(`${nodeId}.gamepadIndex`);
      const gi = giS ? rv(giS.nid, giS.ok) : '0';
      return `(__engine && __engine.input ? __engine.input.isGamepadConnected(${gi}) : false)`;
    }
    case 'Get Gamepad Axis': {
      const aiS = inputSrc.get(`${nodeId}.axisIndex`);
      const giS = inputSrc.get(`${nodeId}.gamepadIndex`);
      const ai = aiS ? rv(aiS.nid, aiS.ok) : '0';
      const gi = giS ? rv(giS.nid, giS.ok) : '0';
      return `(__engine && __engine.input ? __engine.input.getGamepadAxis(${ai}, ${gi}) : 0)`;
    }
    case 'Is Gamepad Button Down': {
      const biS = inputSrc.get(`${nodeId}.buttonIndex`);
      const giS = inputSrc.get(`${nodeId}.gamepadIndex`);
      const bi = biS ? rv(biS.nid, biS.ok) : '0';
      const gi = giS ? rv(giS.nid, giS.ok) : '0';
      return `(__engine && __engine.input ? __engine.input.isGamepadButtonDown(${bi}, ${gi}) : false)`;
    }
    case 'Is Gamepad Button Pressed': {
      const biS = inputSrc.get(`${nodeId}.buttonIndex`);
      const giS = inputSrc.get(`${nodeId}.gamepadIndex`);
      const bi = biS ? rv(biS.nid, biS.ok) : '0';
      const gi = giS ? rv(giS.nid, giS.ok) : '0';
      return `(__engine && __engine.input ? __engine.input.isGamepadButtonJustPressed(${bi}, ${gi}) : false)`;
    }
    case 'Is Gamepad Button Released': {
      const biS = inputSrc.get(`${nodeId}.buttonIndex`);
      const giS = inputSrc.get(`${nodeId}.gamepadIndex`);
      const bi = biS ? rv(biS.nid, biS.ok) : '0';
      const gi = giS ? rv(giS.nid, giS.ok) : '0';
      return `(__engine && __engine.input ? __engine.input.isGamepadButtonJustReleased(${bi}, ${gi}) : false)`;
    }
    case 'Get Gamepad Left Stick': {
      const giS = inputSrc.get(`${nodeId}.gamepadIndex`);
      const gi = giS ? rv(giS.nid, giS.ok) : '0';
      if (outputKey === 'x') return `(__engine && __engine.input ? __engine.input.getGamepadAxis(0, ${gi}) : 0)`;
      if (outputKey === 'y') return `(__engine && __engine.input ? __engine.input.getGamepadAxis(1, ${gi}) : 0)`;
      return '0';
    }
    case 'Get Gamepad Right Stick': {
      const giS = inputSrc.get(`${nodeId}.gamepadIndex`);
      const gi = giS ? rv(giS.nid, giS.ok) : '0';
      if (outputKey === 'x') return `(__engine && __engine.input ? __engine.input.getGamepadAxis(2, ${gi}) : 0)`;
      if (outputKey === 'y') return `(__engine && __engine.input ? __engine.input.getGamepadAxis(3, ${gi}) : 0)`;
      return '0';
    }

    case 'Get Child At': {
      const pS = inputSrc.get(`${nodeId}.parent`);
      const iS = inputSrc.get(`${nodeId}.index`);
      const p = pS ? rv(pS.nid, pS.ok) : 'null';
      const i = iS ? rv(iS.nid, iS.ok) : '0';
      return `(${p} && ${p}.children ? ${p}.children[${i}] : null)`;
    }
    case 'Get Child Count': {
      const pS = inputSrc.get(`${nodeId}.parent`);
      const p = pS ? rv(pS.nid, pS.ok) : 'null';
      return `(${p} && ${p}.children ? ${p}.children.length : 0)`;
    }
    case 'Get Widget from Name': {
      const nS = inputSrc.get(`${nodeId}.name`);
      const n = nS ? rv(nS.nid, nS.ok) : '""';
      return `(this.getWidgetByName ? this.getWidgetByName(${n}) : null)`;
    }
    case 'Get Parent Widget': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      return `(${w} ? ${w}.parent : null)`;
    }
    case 'Get Canvas Slot Position': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      if (outputKey === 'x') return `(${w} && ${w}.slot ? ${w}.slot.positionX : 0)`;
      if (outputKey === 'y') return `(${w} && ${w}.slot ? ${w}.slot.positionY : 0)`;
      return '0';
    }
    case 'Get Canvas Slot Size': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      if (outputKey === 'x') return `(${w} && ${w}.slot ? ${w}.slot.sizeX : 0)`;
      if (outputKey === 'y') return `(${w} && ${w}.slot ? ${w}.slot.sizeY : 0)`;
      return '0';
    }
    case 'Get Canvas Slot Anchors': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      if (outputKey === 'minX') return `(${w} && ${w}.slot && ${w}.slot.anchors ? ${w}.slot.anchors.minX : 0)`;
      if (outputKey === 'minY') return `(${w} && ${w}.slot && ${w}.slot.anchors ? ${w}.slot.anchors.minY : 0)`;
      if (outputKey === 'maxX') return `(${w} && ${w}.slot && ${w}.slot.anchors ? ${w}.slot.anchors.maxX : 0)`;
      if (outputKey === 'maxY') return `(${w} && ${w}.slot && ${w}.slot.anchors ? ${w}.slot.anchors.maxY : 0)`;
      return '0';
    }
    case 'Is In Viewport': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      return `(${w} ? ${w}.isInViewport : false)`;
    }
    case 'Get Is Enabled': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      return `(${w} ? ${w}.isEnabled : false)`;
    }
    case 'Get Scroll Offset': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      return `(${w} ? ${w}.scrollOffset : 0)`;
    }
    case 'Get Scroll Offset of End': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      return `(${w} ? ${w}.maxScrollOffset : 0)`;
    }
    case 'Is Anim Playing': {
      const nS = inputSrc.get(`${nodeId}.animName`);
      const n = nS ? rv(nS.nid, nS.ok) : '""';
      return `(this.isAnimPlaying ? this.isAnimPlaying(${n}) : false)`;
    }
    case 'Get Anim Time': {
      const nS = inputSrc.get(`${nodeId}.animName`);
      const n = nS ? rv(nS.nid, nS.ok) : '""';
      return `(this.getAnimTime ? this.getAnimTime(${n}) : 0)`;
    }
    case 'Get Active Widget Index': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      return `(${w} ? ${w}.activeIndex : 0)`;
    }
    case 'Get Active Widget': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      return `(${w} && ${w}.children ? ${w}.children[${w}.activeIndex] : null)`;
    }
    case 'Get Widget Position': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      if (outputKey === 'x') return `(${w} ? ${w}.positionX : 0)`;
      if (outputKey === 'y') return `(${w} ? ${w}.positionY : 0)`;
      return '0';
    }
    case 'Get Widget Size': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const w = wS ? rv(wS.nid, wS.ok) : 'null';
      if (outputKey === 'x') return `(${w} ? ${w}.sizeX : 0)`;
      if (outputKey === 'y') return `(${w} ? ${w}.sizeY : 0)`;
      return '0';
    }

    case 'Break Hit Result': {
      const hS = inputSrc.get(`${nodeId}.hit`);
      const h = hS ? rv(hS.nid, hS.ok) : 'null';
      if (outputKey === 'blockingHit') return `(${h} ? ${h}.blockingHit : false)`;
      if (outputKey === 'distance') return `(${h} ? ${h}.distance : 0)`;
      if (outputKey === 'location') return `(${h} ? ${h}.location : {x:0,y:0,z:0})`;
      if (outputKey === 'normal') return `(${h} ? ${h}.normal : {x:0,y:0,z:0})`;
      if (outputKey === 'actor') return `(${h} ? ${h}.actor : null)`;
      if (outputKey === 'component') return `(${h} ? ${h}.component : null)`;
      if (outputKey === 'boneName') return `(${h} ? ${h}.boneName : "")`;
      return 'null';
    }

    // ── Line Trace by Channel (3D) — output resolution ──
    case 'Line Trace by Channel': {
      const v = `__lt3d_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (outputKey === 'hit') return `(${v} ? !!${v}.hit : false)`;
      if (outputKey === 'hitX') return `(${v} && ${v}.point ? ${v}.point.x : 0)`;
      if (outputKey === 'hitY') return `(${v} && ${v}.point ? ${v}.point.y : 0)`;
      if (outputKey === 'hitZ') return `(${v} && ${v}.point ? ${v}.point.z : 0)`;
      if (outputKey === 'normalX') return `(${v} && ${v}.normal ? ${v}.normal.x : 0)`;
      if (outputKey === 'normalY') return `(${v} && ${v}.normal ? ${v}.normal.y : 0)`;
      if (outputKey === 'normalZ') return `(${v} && ${v}.normal ? ${v}.normal.z : 0)`;
      if (outputKey === 'hitActor') return `(${v} ? ${v}.hitActor : null)`;
      if (outputKey === 'distance') return `(${v} ? ${v}.distance : 0)`;
      return 'null';
    }
    // ── Sphere Trace by Channel (3D) — output resolution ──
    case 'Sphere Trace by Channel': {
      const v = `__st3d_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (outputKey === 'hit') return `(${v} ? !!${v}.hit : false)`;
      if (outputKey === 'hitX') return `(${v} && ${v}.point ? ${v}.point.x : 0)`;
      if (outputKey === 'hitY') return `(${v} && ${v}.point ? ${v}.point.y : 0)`;
      if (outputKey === 'hitZ') return `(${v} && ${v}.point ? ${v}.point.z : 0)`;
      if (outputKey === 'normalX') return `(${v} && ${v}.normal ? ${v}.normal.x : 0)`;
      if (outputKey === 'normalY') return `(${v} && ${v}.normal ? ${v}.normal.y : 0)`;
      if (outputKey === 'normalZ') return `(${v} && ${v}.normal ? ${v}.normal.z : 0)`;
      if (outputKey === 'hitActor') return `(${v} ? ${v}.hitActor : null)`;
      if (outputKey === 'distance') return `(${v} ? ${v}.distance : 0)`;
      return 'null';
    }
    // ── Box Trace (3D) — output resolution ──
    case 'Box Trace': {
      const v = `__bt3d_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (outputKey === 'hit') return `(${v} ? !!${v}.hit : false)`;
      if (outputKey === 'hitX') return `(${v} && ${v}.point ? ${v}.point.x : 0)`;
      if (outputKey === 'hitY') return `(${v} && ${v}.point ? ${v}.point.y : 0)`;
      if (outputKey === 'hitZ') return `(${v} && ${v}.point ? ${v}.point.z : 0)`;
      if (outputKey === 'hitActor') return `(${v} ? ${v}.hitActor : null)`;
      if (outputKey === 'distance') return `(${v} ? ${v}.distance : 0)`;
      return 'null';
    }
    // ── Line Trace 2D — output resolution ──
    case 'Line Trace 2D': {
      const v = `__lt2d_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (outputKey === 'hit') return `(${v} ? !!${v}.hit : false)`;
      if (outputKey === 'hitX') return `(${v} && ${v}.point ? ${v}.point.x : 0)`;
      if (outputKey === 'hitY') return `(${v} && ${v}.point ? ${v}.point.y : 0)`;
      if (outputKey === 'normalX') return `(${v} && ${v}.normal ? ${v}.normal.x : 0)`;
      if (outputKey === 'normalY') return `(${v} && ${v}.normal ? ${v}.normal.y : 0)`;
      if (outputKey === 'distance') return `(${v} ? ${v}.distance : 0)`;
      if (outputKey === 'hitActor') return `(${v} ? ${v}.hitActor : null)`;
      return 'null';
    }

    case 'Point Is Inside': {
      const pS = inputSrc.get(`${nodeId}.point`);
      const cS = inputSrc.get(`${nodeId}.collider`);
      const p = pS ? rv(pS.nid, pS.ok) : '{x:0,y:0,z:0}';
      const c = cS ? rv(cS.nid, cS.ok) : 'null';
      return `(__engine && __engine.physics ? __engine.physics.pointIsInside(${p}, ${c}) : false)`;
    }
    case 'Is Body Sleeping': {
      const bS = inputSrc.get(`${nodeId}.body`);
      const b = bS ? rv(bS.nid, bS.ok) : 'null';
      return `(${b} && ${b}.isSleeping ? ${b}.isSleeping() : false)`;
    }
    case 'Get Component by Class': {
      const aS = inputSrc.get(`${nodeId}.actor`);
      const cS = inputSrc.get(`${nodeId}.componentClass`);
      const a = aS ? rv(aS.nid, aS.ok) : 'gameObject';
      const c = cS ? rv(cS.nid, cS.ok) : '""';
      return `(${a} && ${a}.getComponentByClass ? ${a}.getComponentByClass(${c}) : null)`;
    }

    // ── Save/Load (pure — UE-style) ────────────────────────
    case 'Does Save Game Exist': {
      const slotS = inputSrc.get(`${nodeId}.slotName`);
      const uiS = inputSrc.get(`${nodeId}.userIndex`);
      const slot = slotS ? rv(slotS.nid, slotS.ok) : '"Slot1"';
      const ui = uiS ? rv(uiS.nid, uiS.ok) : '0';
      return `(__engine && __engine.saveLoad ? __engine.saveLoad.doesSaveGameExist(${slot}, ${ui}) : false)`;
    }
    case 'Get Save Game String': {
      const objS = inputSrc.get(`${nodeId}.saveObject`);
      const nameS = inputSrc.get(`${nodeId}.varName`);
      const defS = inputSrc.get(`${nodeId}.default`);
      const obj = objS ? rv(objS.nid, objS.ok) : 'null';
      const name = nameS ? rv(nameS.nid, nameS.ok) : '""';
      const def = defS ? rv(defS.nid, defS.ok) : '""';
      return `(${obj} ? ${obj}.getString(${name}, ${def}) : ${def})`;
    }
    case 'Get Save Game Int': {
      const objS = inputSrc.get(`${nodeId}.saveObject`);
      const nameS = inputSrc.get(`${nodeId}.varName`);
      const defS = inputSrc.get(`${nodeId}.default`);
      const obj = objS ? rv(objS.nid, objS.ok) : 'null';
      const name = nameS ? rv(nameS.nid, nameS.ok) : '""';
      const def = defS ? rv(defS.nid, defS.ok) : '0';
      return `(${obj} ? ${obj}.getInt(${name}, ${def}) : ${def})`;
    }
    case 'Get Save Game Float': {
      const objS = inputSrc.get(`${nodeId}.saveObject`);
      const nameS = inputSrc.get(`${nodeId}.varName`);
      const defS = inputSrc.get(`${nodeId}.default`);
      const obj = objS ? rv(objS.nid, objS.ok) : 'null';
      const name = nameS ? rv(nameS.nid, nameS.ok) : '""';
      const def = defS ? rv(defS.nid, defS.ok) : '0';
      return `(${obj} ? ${obj}.getFloat(${name}, ${def}) : ${def})`;
    }
    case 'Get Save Game Bool': {
      const objS = inputSrc.get(`${nodeId}.saveObject`);
      const nameS = inputSrc.get(`${nodeId}.varName`);
      const defS = inputSrc.get(`${nodeId}.default`);
      const obj = objS ? rv(objS.nid, objS.ok) : 'null';
      const name = nameS ? rv(nameS.nid, nameS.ok) : '""';
      const def = defS ? rv(defS.nid, defS.ok) : 'false';
      return `(${obj} ? ${obj}.getBool(${name}, ${def}) : ${def})`;
    }
    case 'Get Save Game Vector': {
      const objS = inputSrc.get(`${nodeId}.saveObject`);
      const nameS = inputSrc.get(`${nodeId}.varName`);
      const obj = objS ? rv(objS.nid, objS.ok) : 'null';
      const name = nameS ? rv(nameS.nid, nameS.ok) : '""';
      if (outputKey === 'x') return `(${obj} ? ${obj}.getVector(${name}).x : 0)`;
      if (outputKey === 'y') return `(${obj} ? ${obj}.getVector(${name}).y : 0)`;
      if (outputKey === 'z') return `(${obj} ? ${obj}.getVector(${name}).z : 0)`;
      return '0';
    }
    case 'Get All Save Slot Names': {
      return `(__engine && __engine.saveLoad ? __engine.saveLoad.getAllSaveSlotInfos().map(function(s){return s.slotName}).join(",") : "")`;
    }
    case 'Get Save Slot Count': {
      return `(__engine && __engine.saveLoad ? __engine.saveLoad.getSaveSlotCount() : 0)`;
    }

    // ── Drag Selection value nodes ───────────────────────────
    case 'Is Drag Selecting': {
      return '(gameObject.__dragSelection ? gameObject.__dragSelection.isDragging : false)';
    }
    case 'Get Drag Selection Count': {
      return '(gameObject.__dragSelection ? gameObject.__dragSelection.getSelectedCount() : 0)';
    }
    case 'Get Selected Actors': {
      if (outputKey === 'actors') return '(gameObject.__dragSelection ? gameObject.__dragSelection.getSelectedActors() : [])';
      if (outputKey === 'count') return '(gameObject.__dragSelection ? gameObject.__dragSelection.getSelectedCount() : 0)';
      return '[]';
    }
    case 'Get Selected Actor At Index': {
      const idxS = inputSrc.get(`${nodeId}.index`);
      const idx = idxS ? rv(idxS.nid, idxS.ok) : '0';
      if (outputKey === 'actor') return `(gameObject.__dragSelection ? gameObject.__dragSelection.getSelectedActorAt(${idx}) : null)`;
      if (outputKey === 'valid') return `(!!(gameObject.__dragSelection ? gameObject.__dragSelection.getSelectedActorAt(${idx}) : null))`;
      return 'null';
    }

    default: return '0';
  }
}

function walkExec(
  nodeId: string, execOut: string,
  nodeMap: NodeMap, inputSrc: SrcMap, outputDst: DstMap,
  bp: import('./BlueprintData').BlueprintData,
): string[] {
  const lines: string[] = [];
  const targets = outputDst.get(`${nodeId}.${execOut}`) || [];
  for (const t of targets) lines.push(...genAction(t.nid, nodeMap, inputSrc, outputDst, bp, t.ik));
  return lines;
}

function genAction(
  nodeId: string,
  nodeMap: NodeMap, inputSrc: SrcMap, outputDst: DstMap,
  bp: import('./BlueprintData').BlueprintData,
  triggerInput: string = 'exec',
): string[] {
  const node = nodeMap.get(nodeId);
  if (!node) return [];
  // Skip disabled nodes — just pass through to exec outputs
  if ((node as any).__disabled) {
    return walkExec(nodeId, 'exec', nodeMap, inputSrc, outputDst, bp);
  }
  const lines: string[] = [];

  // ── Profiler: emit a tracking call for every action node so the profiler
  //    can see which nodes executed. __pTrack is null when profiler is inactive
  //    so the short-circuit (&&) costs virtually nothing at runtime.
  //    The 3rd arg is the node's palette category, baked at codegen time so
  //    future nodes are automatically categorised without touching the profiler.
  const _safeLabel = node.label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const _nodeCategory = getNodeCategory(node);
  lines.push(`__pTrack && __pTrack("${_safeLabel}", "${nodeId}", "${_nodeCategory}");`);

  const rv = (nid: string, ok: string) => resolveValue(nid, ok, nodeMap, inputSrc, bp);
  const we = (nid: string, eo: string) => walkExec(nid, eo, nodeMap, inputSrc, outputDst, bp);

  if (node.label === 'Add Child to Vertical Box') {
    const wName = (node as any).getWidgetName ? (node as any).getWidgetName() : '""';
    const cS = inputSrc.get(`${nodeId}.child`);
    const c = cS ? rv(cS.nid, cS.ok) : 'null';
    lines.push(`{ var __p = this.getWidgetByName ? this.getWidgetByName("${wName}") : null; if(__p && ${c}) { __p.addChild(${c}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Add Child to Horizontal Box') {
    const wName = (node as any).getWidgetName ? (node as any).getWidgetName() : '""';
    const cS = inputSrc.get(`${nodeId}.child`);
    const c = cS ? rv(cS.nid, cS.ok) : 'null';
    lines.push(`{ var __p = this.getWidgetByName ? this.getWidgetByName("${wName}") : null; if(__p && ${c}) { __p.addChild(${c}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Add Child to Canvas Panel') {
    const wName = (node as any).getWidgetName ? (node as any).getWidgetName() : '""';
    const cS = inputSrc.get(`${nodeId}.child`);
    const c = cS ? rv(cS.nid, cS.ok) : 'null';
    lines.push(`{ var __p = this.getWidgetByName ? this.getWidgetByName("${wName}") : null; if(__p && ${c}) { __p.addChild(${c}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Add Child to Overlay') {
    const wName = (node as any).getWidgetName ? (node as any).getWidgetName() : '""';
    const cS = inputSrc.get(`${nodeId}.child`);
    const c = cS ? rv(cS.nid, cS.ok) : 'null';
    lines.push(`{ var __p = this.getWidgetByName ? this.getWidgetByName("${wName}") : null; if(__p && ${c}) { __p.addChild(${c}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Add Child to Grid Panel') {
    const wName = (node as any).getWidgetName ? (node as any).getWidgetName() : '""';
    const cS = inputSrc.get(`${nodeId}.child`);
    const c = cS ? rv(cS.nid, cS.ok) : 'null';
    lines.push(`{ var __p = this.getWidgetByName ? this.getWidgetByName("${wName}") : null; if(__p && ${c}) { __p.addChild(${c}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Remove Child') {
    const pS = inputSrc.get(`${nodeId}.parent`);
    const cS = inputSrc.get(`${nodeId}.child`);
    const p = pS ? rv(pS.nid, pS.ok) : 'null';
    const c = cS ? rv(cS.nid, cS.ok) : 'null';
    lines.push(`{ if(${p} && ${c}) { ${p}.removeChild(${c}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Remove from Parent') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.parent) { ${w}.parent.removeChild(${w}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Clear Children') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w}) { ${w}.clearChildren(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Canvas Slot Position') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const x = xS ? rv(xS.nid, xS.ok) : '0';
    const y = yS ? rv(yS.nid, yS.ok) : '0';
    lines.push(`{ if(${w} && ${w}.slot) { ${w}.slot.positionX = ${x}; ${w}.slot.positionY = ${y}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Canvas Slot Size') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const x = xS ? rv(xS.nid, xS.ok) : '0';
    const y = yS ? rv(yS.nid, yS.ok) : '0';
    lines.push(`{ if(${w} && ${w}.slot) { ${w}.slot.sizeX = ${x}; ${w}.slot.sizeY = ${y}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Canvas Slot Anchors') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const minXS = inputSrc.get(`${nodeId}.minX`);
    const minYS = inputSrc.get(`${nodeId}.minY`);
    const maxXS = inputSrc.get(`${nodeId}.maxX`);
    const maxYS = inputSrc.get(`${nodeId}.maxY`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const minX = minXS ? rv(minXS.nid, minXS.ok) : '0';
    const minY = minYS ? rv(minYS.nid, minYS.ok) : '0';
    const maxX = maxXS ? rv(maxXS.nid, maxXS.ok) : '0';
    const maxY = maxYS ? rv(maxYS.nid, maxYS.ok) : '0';
    lines.push(`{ if(${w} && ${w}.slot) { ${w}.slot.anchors = {minX:${minX}, minY:${minY}, maxX:${maxX}, maxY:${maxY}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Canvas Slot Alignment') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const x = xS ? rv(xS.nid, xS.ok) : '0';
    const y = yS ? rv(yS.nid, yS.ok) : '0';
    lines.push(`{ if(${w} && ${w}.slot) { ${w}.slot.alignment = {x:${x}, y:${y}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Slot Padding') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const lS = inputSrc.get(`${nodeId}.left`);
    const tS = inputSrc.get(`${nodeId}.top`);
    const rS = inputSrc.get(`${nodeId}.right`);
    const bS = inputSrc.get(`${nodeId}.bottom`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const l = lS ? rv(lS.nid, lS.ok) : '0';
    const t = tS ? rv(tS.nid, tS.ok) : '0';
    const r = rS ? rv(rS.nid, rS.ok) : '0';
    const b = bS ? rv(bS.nid, bS.ok) : '0';
    lines.push(`{ if(${w} && ${w}.slot) { ${w}.slot.padding = {left:${l}, top:${t}, right:${r}, bottom:${b}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Is Enabled') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const eS = inputSrc.get(`${nodeId}.enabled`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const e = eS ? rv(eS.nid, eS.ok) : 'true';
    lines.push(`{ if(${w}) { ${w}.isEnabled = ${e}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Keyboard Focus') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.setFocus) { ${w}.setFocus(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Render Translation') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const x = xS ? rv(xS.nid, xS.ok) : '0';
    const y = yS ? rv(yS.nid, yS.ok) : '0';
    lines.push(`{ if(${w}) { ${w}.renderTranslation = {x:${x}, y:${y}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Render Angle') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const aS = inputSrc.get(`${nodeId}.angle`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const a = aS ? rv(aS.nid, aS.ok) : '0';
    lines.push(`{ if(${w}) { ${w}.renderAngle = ${a}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Render Scale') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const x = xS ? rv(xS.nid, xS.ok) : '1';
    const y = yS ? rv(yS.nid, yS.ok) : '1';
    lines.push(`{ if(${w}) { ${w}.renderScale = {x:${x}, y:${y}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Render Opacity') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const oS = inputSrc.get(`${nodeId}.opacity`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const o = oS ? rv(oS.nid, oS.ok) : '1';
    lines.push(`{ if(${w}) { ${w}.renderOpacity = ${o}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Widget Tooltip') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const tS = inputSrc.get(`${nodeId}.tooltip`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const t = tS ? rv(tS.nid, tS.ok) : '""';
    lines.push(`{ if(${w}) { ${w}.tooltip = ${t}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Cursor Type') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const cS = inputSrc.get(`${nodeId}.cursor`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c = cS ? rv(cS.nid, cS.ok) : '""';
    lines.push(`{ if(${w}) { ${w}.cursor = ${c}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Force Layout Prepass') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.forceLayoutPrepass) { ${w}.forceLayoutPrepass(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Invalidate Layout') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.invalidateLayout) { ${w}.invalidateLayout(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Scroll to Start') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.scrollToStart) { ${w}.scrollToStart(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Scroll to End') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.scrollToEnd) { ${w}.scrollToEnd(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Scroll Offset') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const oS = inputSrc.get(`${nodeId}.offset`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const o = oS ? rv(oS.nid, oS.ok) : '0';
    lines.push(`{ if(${w} && ${w}.setScrollOffset) { ${w}.setScrollOffset(${o}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Scroll Widget Into View') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const cS = inputSrc.get(`${nodeId}.child`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c = cS ? rv(cS.nid, cS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.scrollWidgetIntoView) { ${w}.scrollWidgetIntoView(${c}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Stop Anim by Name') {
    const nS = inputSrc.get(`${nodeId}.animName`);
    const n = nS ? rv(nS.nid, nS.ok) : '""';
    lines.push(`{ if(this.stopAnim) { this.stopAnim(${n}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Pause Anim by Name') {
    const nS = inputSrc.get(`${nodeId}.animName`);
    const n = nS ? rv(nS.nid, nS.ok) : '""';
    lines.push(`{ if(this.pauseAnim) { this.pauseAnim(${n}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Reverse Widget Animation') {
    const nS = inputSrc.get(`${nodeId}.animName`);
    const n = nS ? rv(nS.nid, nS.ok) : '""';
    lines.push(`{ if(this.reverseAnim) { this.reverseAnim(${n}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Anim Time') {
    const nS = inputSrc.get(`${nodeId}.animName`);
    const tS = inputSrc.get(`${nodeId}.time`);
    const n = nS ? rv(nS.nid, nS.ok) : '""';
    const t = tS ? rv(tS.nid, tS.ok) : '0';
    lines.push(`{ if(this.setAnimTime) { this.setAnimTime(${n}, ${t}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Anim Play Rate') {
    const nS = inputSrc.get(`${nodeId}.animName`);
    const rS = inputSrc.get(`${nodeId}.rate`);
    const n = nS ? rv(nS.nid, nS.ok) : '""';
    const r = rS ? rv(rS.nid, rS.ok) : '1';
    lines.push(`{ if(this.setAnimPlayRate) { this.setAnimPlayRate(${n}, ${r}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Active Widget Index') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const iS = inputSrc.get(`${nodeId}.index`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const i = iS ? rv(iS.nid, iS.ok) : '0';
    lines.push(`{ if(${w} && ${w}.setActiveIndex) { ${w}.setActiveIndex(${i}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Active Widget') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const cS = inputSrc.get(`${nodeId}.child`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c = cS ? rv(cS.nid, cS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.setActiveWidget) { ${w}.setActiveWidget(${c}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Image Tint') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const cS = inputSrc.get(`${nodeId}.color`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c = cS ? rv(cS.nid, cS.ok) : '""';
    lines.push(`{ if(${w}) { ${w}.tint = ${c}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Image UV Rect') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const uS = inputSrc.get(`${nodeId}.u`);
    const vS = inputSrc.get(`${nodeId}.v`);
    const w_S = inputSrc.get(`${nodeId}.w`);
    const hS = inputSrc.get(`${nodeId}.h`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const u = uS ? rv(uS.nid, uS.ok) : '0';
    const v = vS ? rv(vS.nid, vS.ok) : '0';
    const w_ = w_S ? rv(w_S.nid, w_S.ok) : '1';
    const h = hS ? rv(hS.nid, hS.ok) : '1';
    lines.push(`{ if(${w}) { ${w}.uvRect = {u:${u}, v:${v}, w:${w_}, h:${h}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Play Image Flip Book') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const fS = inputSrc.get(`${nodeId}.fps`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const f = fS ? rv(fS.nid, fS.ok) : '10';
    lines.push(`{ if(${w} && ${w}.playFlipBook) { ${w}.playFlipBook(${f}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Text Color') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const cS = inputSrc.get(`${nodeId}.color`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c = cS ? rv(cS.nid, cS.ok) : '""';
    lines.push(`{ if(${w}) { ${w}.color = ${c}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Font') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const fS = inputSrc.get(`${nodeId}.font`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const f = fS ? rv(fS.nid, fS.ok) : '""';
    lines.push(`{ if(${w}) { ${w}.font = ${f}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Text Gradient') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const c1S = inputSrc.get(`${nodeId}.color1`);
    const c2S = inputSrc.get(`${nodeId}.color2`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c1 = c1S ? rv(c1S.nid, c1S.ok) : '""';
    const c2 = c2S ? rv(c2S.nid, c2S.ok) : '""';
    lines.push(`{ if(${w}) { ${w}.gradient = {color1:${c1}, color2:${c2}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Text Shadow') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const cS = inputSrc.get(`${nodeId}.color`);
    const xS = inputSrc.get(`${nodeId}.offsetX`);
    const yS = inputSrc.get(`${nodeId}.offsetY`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c = cS ? rv(cS.nid, cS.ok) : '""';
    const x = xS ? rv(xS.nid, xS.ok) : '0';
    const y = yS ? rv(yS.nid, yS.ok) : '0';
    lines.push(`{ if(${w}) { ${w}.shadow = {color:${c}, offsetX:${x}, offsetY:${y}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Button Tint') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const cS = inputSrc.get(`${nodeId}.color`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c = cS ? rv(cS.nid, cS.ok) : '""';
    lines.push(`{ if(${w}) { ${w}.tint = ${c}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Button Enabled') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const eS = inputSrc.get(`${nodeId}.enabled`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const e = eS ? rv(eS.nid, eS.ok) : 'true';
    lines.push(`{ if(${w}) { ${w}.isEnabled = ${e}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Widget Position') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const x = xS ? rv(xS.nid, xS.ok) : '0';
    const y = yS ? rv(yS.nid, yS.ok) : '0';
    lines.push(`{ if(${w}) { ${w}.positionX = ${x}; ${w}.positionY = ${y}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Widget Size') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const x = xS ? rv(xS.nid, xS.ok) : '0';
    const y = yS ? rv(yS.nid, yS.ok) : '0';
    lines.push(`{ if(${w}) { ${w}.sizeX = ${x}; ${w}.sizeY = ${y}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Widget Scale') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const x = xS ? rv(xS.nid, xS.ok) : '1';
    const y = yS ? rv(yS.nid, yS.ok) : '1';
    lines.push(`{ if(${w}) { ${w}.scaleX = ${x}; ${w}.scaleY = ${y}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Widget Rotation') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const aS = inputSrc.get(`${nodeId}.angle`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const a = aS ? rv(aS.nid, aS.ok) : '0';
    lines.push(`{ if(${w}) { ${w}.rotation = ${a}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Animate Widget Float') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const pS = inputSrc.get(`${nodeId}.property`);
    const tS = inputSrc.get(`${nodeId}.target`);
    const dS = inputSrc.get(`${nodeId}.duration`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const p = pS ? rv(pS.nid, pS.ok) : '""';
    const t = tS ? rv(tS.nid, tS.ok) : '0';
    const d = dS ? rv(dS.nid, dS.ok) : '1';
    lines.push(`{ if(${w} && ${w}.animateFloat) { ${w}.animateFloat(${p}, ${t}, ${d}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Animate Widget Color') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const pS = inputSrc.get(`${nodeId}.property`);
    const tS = inputSrc.get(`${nodeId}.target`);
    const dS = inputSrc.get(`${nodeId}.duration`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const p = pS ? rv(pS.nid, pS.ok) : '""';
    const t = tS ? rv(tS.nid, tS.ok) : '""';
    const d = dS ? rv(dS.nid, dS.ok) : '1';
    lines.push(`{ if(${w} && ${w}.animateColor) { ${w}.animateColor(${p}, ${t}, ${d}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Stop Widget Animation') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.stopAnimation) { ${w}.stopAnimation(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Pause Widget Animation') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    lines.push(`{ if(${w} && ${w}.pauseAnimation) { ${w}.pauseAnimation(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Widget Gradient') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const c1S = inputSrc.get(`${nodeId}.color1`);
    const c2S = inputSrc.get(`${nodeId}.color2`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const c1 = c1S ? rv(c1S.nid, c1S.ok) : '""';
    const c2 = c2S ? rv(c2S.nid, c2S.ok) : '""';
    lines.push(`{ if(${w}) { ${w}.gradient = {color1:${c1}, color2:${c2}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Widget Nine Slice') {
    const wS = inputSrc.get(`${nodeId}.widget`);
    const lS = inputSrc.get(`${nodeId}.left`);
    const tS = inputSrc.get(`${nodeId}.top`);
    const rS = inputSrc.get(`${nodeId}.right`);
    const bS = inputSrc.get(`${nodeId}.bottom`);
    const w = wS ? rv(wS.nid, wS.ok) : 'null';
    const l = lS ? rv(lS.nid, lS.ok) : '0';
    const t = tS ? rv(tS.nid, tS.ok) : '0';
    const r = rS ? rv(rS.nid, rS.ok) : '0';
    const b = bS ? rv(bS.nid, bS.ok) : '0';
    lines.push(`{ if(${w}) { ${w}.nineSlice = {left:${l}, top:${t}, right:${r}, bottom:${b}}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  if (node.label === 'Call Game Instance Function') {
    const fS = inputSrc.get(`${nodeId}.functionName`);
    const f = fS ? rv(fS.nid, fS.ok) : '""';
    lines.push(`{ if(__engine && __engine.gameInstance && typeof __engine.gameInstance[${f}] === 'function') { __engine.gameInstance[${f}](); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Call Game Instance Event') {
    const eS = inputSrc.get(`${nodeId}.eventName`);
    const e = eS ? rv(eS.nid, eS.ok) : '""';
    lines.push(`{ if(__engine && __engine.gameInstance && typeof __engine.gameInstance.triggerEvent === 'function') { __engine.gameInstance.triggerEvent(${e}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Line Trace by Channel') {
    const sxS = inputSrc.get(`${nodeId}.startX`), syS = inputSrc.get(`${nodeId}.startY`), szS = inputSrc.get(`${nodeId}.startZ`);
    const exS = inputSrc.get(`${nodeId}.endX`), eyS = inputSrc.get(`${nodeId}.endY`), ezS = inputSrc.get(`${nodeId}.endZ`);
    const dbgS = inputSrc.get(`${nodeId}.drawDebug`);
    const sx = sxS ? rv(sxS.nid, sxS.ok) : '0', sy = syS ? rv(syS.nid, syS.ok) : '0', sz = szS ? rv(szS.nid, szS.ok) : '0';
    const ex = exS ? rv(exS.nid, exS.ok) : '0', ey = eyS ? rv(eyS.nid, eyS.ok) : '0', ez = ezS ? rv(ezS.nid, ezS.ok) : '0';
    const _dbgCtrl = (node.inputs as any)['drawDebug']?.control;
    const dbg = dbgS ? rv(dbgS.nid, dbgS.ok) : (_dbgCtrl && typeof _dbgCtrl.value === 'number' ? (_dbgCtrl.value ? 'true' : 'false') : 'true');
    const hitVar = `__lt3d_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${hitVar} = (__engine && __engine.physics) ? __engine.physics.lineTraceSingle({x:${sx},y:${sy},z:${sz}}, {x:${ex},y:${ey},z:${ez}}, 0, __scene) : { hit: false, point:{x:0,y:0,z:0}, normal:{x:0,y:0,z:0}, distance:0, hitActor:null };`);
    lines.push(`if (${dbg} && __engine && __engine.drawDebugLine) { __engine.drawDebugLine({x:${sx},y:${sy},z:${sz}}, {x:${ex},y:${ey},z:${ez}}, ${hitVar}.hit ? 0xff0000 : 0x00ff00, 2.0); if (${hitVar}.hit && __engine.drawDebugPoint) __engine.drawDebugPoint(${hitVar}.point, 0.08, 0xff0000, 2.0); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Sphere Trace by Channel') {
    const sxS = inputSrc.get(`${nodeId}.startX`), syS = inputSrc.get(`${nodeId}.startY`), szS = inputSrc.get(`${nodeId}.startZ`);
    const exS = inputSrc.get(`${nodeId}.endX`), eyS = inputSrc.get(`${nodeId}.endY`), ezS = inputSrc.get(`${nodeId}.endZ`);
    const rS = inputSrc.get(`${nodeId}.radius`);
    const dbgS = inputSrc.get(`${nodeId}.drawDebug`);
    const sx = sxS ? rv(sxS.nid, sxS.ok) : '0', sy = syS ? rv(syS.nid, syS.ok) : '0', sz = szS ? rv(szS.nid, szS.ok) : '0';
    const ex = exS ? rv(exS.nid, exS.ok) : '0', ey = eyS ? rv(eyS.nid, eyS.ok) : '0', ez = ezS ? rv(ezS.nid, ezS.ok) : '0';
    const r = rS ? rv(rS.nid, rS.ok) : '0.5';
    const _dbgCtrl = (node.inputs as any)['drawDebug']?.control;
    const dbg = dbgS ? rv(dbgS.nid, dbgS.ok) : (_dbgCtrl && typeof _dbgCtrl.value === 'number' ? (_dbgCtrl.value ? 'true' : 'false') : 'true');
    const hitVar = `__st3d_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${hitVar} = (__engine && __engine.physics) ? __engine.physics.sphereTraceSingle({x:${sx},y:${sy},z:${sz}}, {x:${ex},y:${ey},z:${ez}}, ${r}, 0, __scene) : { hit: false, point:{x:0,y:0,z:0}, normal:{x:0,y:0,z:0}, distance:0, hitActor:null };`);
    lines.push(`if (${dbg} && __engine && __engine.drawDebugLine) { __engine.drawDebugLine({x:${sx},y:${sy},z:${sz}}, {x:${ex},y:${ey},z:${ez}}, ${hitVar}.hit ? 0xff0000 : 0x00ff00, 2.0); if (${hitVar}.hit && __engine.drawDebugPoint) __engine.drawDebugPoint(${hitVar}.point, 0.08, 0xff0000, 2.0); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Box Trace') {
    const sxS = inputSrc.get(`${nodeId}.startX`), syS = inputSrc.get(`${nodeId}.startY`), szS = inputSrc.get(`${nodeId}.startZ`);
    const exS = inputSrc.get(`${nodeId}.endX`), eyS = inputSrc.get(`${nodeId}.endY`), ezS = inputSrc.get(`${nodeId}.endZ`);
    const hxS = inputSrc.get(`${nodeId}.halfX`), hyS = inputSrc.get(`${nodeId}.halfY`), hzS = inputSrc.get(`${nodeId}.halfZ`);
    const dbgS = inputSrc.get(`${nodeId}.drawDebug`);
    const sx = sxS ? rv(sxS.nid, sxS.ok) : '0', sy = syS ? rv(syS.nid, syS.ok) : '0', sz = szS ? rv(szS.nid, szS.ok) : '0';
    const ex = exS ? rv(exS.nid, exS.ok) : '0', ey = eyS ? rv(eyS.nid, eyS.ok) : '0', ez = ezS ? rv(ezS.nid, ezS.ok) : '0';
    const hx = hxS ? rv(hxS.nid, hxS.ok) : '0.5', hy = hyS ? rv(hyS.nid, hyS.ok) : '0.5', hz = hzS ? rv(hzS.nid, hzS.ok) : '0.5';
    const _dbgCtrl = (node.inputs as any)['drawDebug']?.control;
    const dbg = dbgS ? rv(dbgS.nid, dbgS.ok) : (_dbgCtrl && typeof _dbgCtrl.value === 'number' ? (_dbgCtrl.value ? 'true' : 'false') : 'true');
    const hitVar = `__bt3d_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${hitVar} = (__engine && __engine.physics) ? __engine.physics.boxTraceSingle({x:${sx},y:${sy},z:${sz}}, {x:${ex},y:${ey},z:${ez}}, {x:${hx},y:${hy},z:${hz}}, {x:0,y:0,z:0,w:1}, 0, __scene) : { hit: false, point:{x:0,y:0,z:0}, normal:{x:0,y:0,z:0}, distance:0, hitActor:null };`);
    lines.push(`if (${dbg} && __engine && __engine.drawDebugLine) { __engine.drawDebugLine({x:${sx},y:${sy},z:${sz}}, {x:${ex},y:${ey},z:${ez}}, ${hitVar}.hit ? 0xff0000 : 0x00ff00, 2.0); if (${hitVar}.hit && __engine.drawDebugPoint) __engine.drawDebugPoint(${hitVar}.point, 0.08, 0xff0000, 2.0); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Add Angular Impulse') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const iS = inputSrc.get(`${nodeId}.impulse`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    const i = iS ? rv(iS.nid, iS.ok) : '{x:0,y:0,z:0}';
    lines.push(`{ if(${b} && ${b}.applyTorqueImpulse) { ${b}.applyTorqueImpulse(${i}, true); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Clamp Velocity') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const mS = inputSrc.get(`${nodeId}.max`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    const m = mS ? rv(mS.nid, mS.ok) : '0';
    lines.push(`{ if(${b} && ${b}.linvel) { var v = ${b}.linvel(); var len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z); if(len > ${m}) { var f = ${m}/len; ${b}.setLinvel({x:v.x*f, y:v.y*f, z:v.z*f}, true); } } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Line Trace Single') {
    const sS = inputSrc.get(`${nodeId}.start`);
    const eS = inputSrc.get(`${nodeId}.end`);
    const cS = inputSrc.get(`${nodeId}.channel`);
    const s = sS ? rv(sS.nid, sS.ok) : '{x:0,y:0,z:0}';
    const e = eS ? rv(eS.nid, eS.ok) : '{x:0,y:0,z:0}';
    const c = cS ? rv(cS.nid, cS.ok) : '0';
    lines.push(`{ var __hit = __engine && __engine.physics ? __engine.physics.lineTraceSingle(${s}, ${e}, ${c}) : null; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Line Trace Multi') {
    const sS = inputSrc.get(`${nodeId}.start`);
    const eS = inputSrc.get(`${nodeId}.end`);
    const cS = inputSrc.get(`${nodeId}.channel`);
    const s = sS ? rv(sS.nid, sS.ok) : '{x:0,y:0,z:0}';
    const e = eS ? rv(eS.nid, eS.ok) : '{x:0,y:0,z:0}';
    const c = cS ? rv(cS.nid, cS.ok) : '0';
    lines.push(`{ var __hits = __engine && __engine.physics ? __engine.physics.lineTraceMulti(${s}, ${e}, ${c}) : []; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Overlap Sphere') {
    const pS = inputSrc.get(`${nodeId}.pos`);
    const rS = inputSrc.get(`${nodeId}.radius`);
    const cS = inputSrc.get(`${nodeId}.channel`);
    const p = pS ? rv(pS.nid, pS.ok) : '{x:0,y:0,z:0}';
    const r = rS ? rv(rS.nid, rS.ok) : '0';
    const c = cS ? rv(cS.nid, cS.ok) : '0';
    lines.push(`{ var __overlaps = __engine && __engine.physics ? __engine.physics.overlapSphere(${p}, ${r}, ${c}) : []; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Overlap Box') {
    const pS = inputSrc.get(`${nodeId}.pos`);
    const hS = inputSrc.get(`${nodeId}.halfSize`);
    const oS = inputSrc.get(`${nodeId}.orientation`);
    const cS = inputSrc.get(`${nodeId}.channel`);
    const p = pS ? rv(pS.nid, pS.ok) : '{x:0,y:0,z:0}';
    const h = hS ? rv(hS.nid, hS.ok) : '{x:0,y:0,z:0}';
    const o = oS ? rv(oS.nid, oS.ok) : '{x:0,y:0,z:0,w:1}';
    const c = cS ? rv(cS.nid, cS.ok) : '0';
    lines.push(`{ var __overlaps = __engine && __engine.physics ? __engine.physics.overlapBox(${p}, ${h}, ${o}, ${c}) : []; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set CCD Enabled') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const eS = inputSrc.get(`${nodeId}.enabled`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    const e = eS ? rv(eS.nid, eS.ok) : 'true';
    lines.push(`{ if(${b} && ${b}.enableCcd) { ${b}.enableCcd(${e}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Add Radial Force') {
    const oS = inputSrc.get(`${nodeId}.origin`);
    const rS = inputSrc.get(`${nodeId}.radius`);
    const sS = inputSrc.get(`${nodeId}.strength`);
    const o = oS ? rv(oS.nid, oS.ok) : '{x:0,y:0,z:0}';
    const r = rS ? rv(rS.nid, rS.ok) : '0';
    const s = sS ? rv(sS.nid, sS.ok) : '0';
    lines.push(`{ if(__engine && __engine.physics) { __engine.physics.addRadialForce(${o}, ${r}, ${s}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Add Radial Impulse') {
    const oS = inputSrc.get(`${nodeId}.origin`);
    const rS = inputSrc.get(`${nodeId}.radius`);
    const sS = inputSrc.get(`${nodeId}.strength`);
    const o = oS ? rv(oS.nid, oS.ok) : '{x:0,y:0,z:0}';
    const r = rS ? rv(rS.nid, rS.ok) : '0';
    const s = sS ? rv(sS.nid, sS.ok) : '0';
    lines.push(`{ if(__engine && __engine.physics) { __engine.physics.addRadialImpulse(${o}, ${r}, ${s}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Reset Physics') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    lines.push(`{ if(${b} && ${b}.setLinvel) { ${b}.setLinvel({x:0,y:0,z:0}, true); ${b}.setAngvel({x:0,y:0,z:0}, true); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Body Type') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const tS = inputSrc.get(`${nodeId}.type`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    const t = tS ? rv(tS.nid, tS.ok) : '0';
    lines.push(`{ if(${b} && ${b}.setBodyType) { ${b}.setBodyType(${t}, true); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Physics Transform') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const pS = inputSrc.get(`${nodeId}.position`);
    const rS = inputSrc.get(`${nodeId}.rotation`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    const p = pS ? rv(pS.nid, pS.ok) : '{x:0,y:0,z:0}';
    const r = rS ? rv(rS.nid, rS.ok) : '{x:0,y:0,z:0,w:1}';
    lines.push(`{ if(${b} && ${b}.setTranslation) { ${b}.setTranslation(${p}, true); ${b}.setRotation(${r}, true); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set World Gravity') {
    const gS = inputSrc.get(`${nodeId}.gravity`);
    const g = gS ? rv(gS.nid, gS.ok) : '{x:0,y:-9.81,z:0}';
    lines.push(`{ if(__engine && __engine.physics) { __engine.physics.setGravity(${g}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Wake Physics Body') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    lines.push(`{ if(${b} && ${b}.wakeUp) { ${b}.wakeUp(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Sleep Physics Body') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    lines.push(`{ if(${b} && ${b}.sleep) { ${b}.sleep(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Teleport Physics Body') {
    const bS = inputSrc.get(`${nodeId}.body`);
    const pS = inputSrc.get(`${nodeId}.position`);
    const b = bS ? rv(bS.nid, bS.ok) : 'null';
    const p = pS ? rv(pS.nid, pS.ok) : '{x:0,y:0,z:0}';
    lines.push(`{ if(${b} && ${b}.setTranslation) { ${b}.setTranslation(${p}, true); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Open Level') {
    const nS = inputSrc.get(`${nodeId}.levelName`);
    const n = nS ? rv(nS.nid, nS.ok) : '""';
    lines.push(`{ if(__engine && __engine.sceneManager) { __engine.sceneManager.loadScene(${n}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Quit Game') {
    lines.push(`{ if(__engine && __engine.quit) { __engine.quit(); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Game Paused') {
    const pS = inputSrc.get(`${nodeId}.paused`);
    const p = pS ? rv(pS.nid, pS.ok) : 'true';
    lines.push(`{ if(__engine) { __engine.isPaused = ${p}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Spawn Emitter at Location') {
    const eS = inputSrc.get(`${nodeId}.emitter`);
    const lS = inputSrc.get(`${nodeId}.location`);
    const e = eS ? rv(eS.nid, eS.ok) : 'null';
    const l = lS ? rv(lS.nid, lS.ok) : '{x:0,y:0,z:0}';
    lines.push(`{ if(__engine && __engine.particleManager) { __engine.particleManager.spawnEmitterAtLocation(${e}, ${l}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Add Tag to Actor') {
    const aS = inputSrc.get(`${nodeId}.actor`);
    const tS = inputSrc.get(`${nodeId}.tag`);
    const a = aS ? rv(aS.nid, aS.ok) : 'gameObject';
    const t = tS ? rv(tS.nid, tS.ok) : '""';
    lines.push(`{ if(${a} && ${a}.tags) { if(!${a}.tags.includes(${t})) ${a}.tags.push(${t}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Remove Tag from Actor') {
    const aS = inputSrc.get(`${nodeId}.actor`);
    const tS = inputSrc.get(`${nodeId}.tag`);
    const a = aS ? rv(aS.nid, aS.ok) : 'gameObject';
    const t = tS ? rv(tS.nid, tS.ok) : '""';
    lines.push(`{ if(${a} && ${a}.tags) { const idx = ${a}.tags.indexOf(${t}); if(idx > -1) ${a}.tags.splice(idx, 1); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Actor Hidden in Game') {
    const aS = inputSrc.get(`${nodeId}.actor`);
    const hS = inputSrc.get(`${nodeId}.hidden`);
    const a = aS ? rv(aS.nid, aS.ok) : 'gameObject';
    const h = hS ? rv(hS.nid, hS.ok) : 'true';
    lines.push(`{ if(${a}) { ${a}.visible = !${h}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // ============================================================
  //  Animation 2D Nodes
  // ============================================================
  if (node.label === 'Anim Update 2D') {
    lines.push(`// Anim Update 2D Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'State Transition 2D') {
    const condition = resolveValue(nodeId, 'condition', nodeMap, inputSrc, bp);
    const fromState = resolveValue(nodeId, 'fromState', nodeMap, inputSrc, bp);
    const toState = resolveValue(nodeId, 'toState', nodeMap, inputSrc, bp);
    lines.push(`if (${condition}) { __engine.anim2d.transitionState(this, ${fromState}, ${toState}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'On State Enter 2D') {
    lines.push(`// On State Enter 2D Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'On State Exit 2D') {
    lines.push(`// On State Exit 2D Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // ============================================================
  //  Physics 2D Nodes
  // ============================================================
  if (node.label === 'On Collision End 2D') {
    lines.push(`// On Collision End 2D Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'On Trigger Begin 2D') {
    lines.push(`// On Trigger Begin 2D Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'On Trigger End 2D') {
    lines.push(`// On Trigger End 2D Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // ============================================================
  //  Sprite Nodes
  // ============================================================
  if (node.label === 'On Animation Event 2D') {
    lines.push(`// On Animation Event 2D Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'On Animation Finished 2D') {
    lines.push(`// On Animation Finished 2D Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // ============================================================
  //  UI Widget Blueprint Nodes
  // ============================================================
  if (node.label === 'Event Pre Construct') {
    lines.push(`// Event Pre Construct`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Event Construct') {
    lines.push(`// Event Construct`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Event Destruct') {
    lines.push(`// Event Destruct`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Event Widget Tick') {
    lines.push(`// Event Widget Tick`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Event On Initialized') {
    lines.push(`// Event On Initialized`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'On Anim Finished') {
    lines.push(`// On Anim Finished Event`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // ============================================================
  //  Timer Nodes
  // ============================================================
  if (node.label === 'Clear All Timers') {
    lines.push(`__engine.timers.clearAllTimers(this);`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // ============================================================
  //  Physics 3D Nodes
  // ============================================================
  if (node.label === 'Sphere Trace') {
    const startX = resolveValue(nodeId, 'startX', nodeMap, inputSrc, bp);
    const startY = resolveValue(nodeId, 'startY', nodeMap, inputSrc, bp);
    const startZ = resolveValue(nodeId, 'startZ', nodeMap, inputSrc, bp);
    const dirX = resolveValue(nodeId, 'dirX', nodeMap, inputSrc, bp);
    const dirY = resolveValue(nodeId, 'dirY', nodeMap, inputSrc, bp);
    const dirZ = resolveValue(nodeId, 'dirZ', nodeMap, inputSrc, bp);
    const radius = resolveValue(nodeId, 'radius', nodeMap, inputSrc, bp);
    const maxDist = resolveValue(nodeId, 'maxDist', nodeMap, inputSrc, bp);
    lines.push(`const _sphereTraceHit = __engine.physics.sphereTrace(${startX}, ${startY}, ${startZ}, ${dirX}, ${dirY}, ${dirZ}, ${radius}, ${maxDist});`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Component setter nodes
  if (node instanceof SetComponentLocationNode) {
    const ci = (node as SetComponentLocationNode).compIndex;
    const is2DRoot = ci === -1; // Root in 2D mode should also move the physics body
    const ref = ci === -1
      ? '(gameObject.group || gameObject.mesh)'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    const xExpr = xS ? rv(xS.nid, xS.ok) : `(${ref} ? ${ref}.position.x : 0)`;
    const yExpr = yS ? rv(yS.nid, yS.ok) : `(${ref} ? ${ref}.position.y : 0)`;
    const zExpr = zS ? rv(zS.nid, zS.ok) : `(${ref} ? ${ref}.position.z : 0)`;
    if (is2DRoot) {
      // 2D-aware: update group position, transform2D, AND physics body (teleport)
      lines.push(`{ var __slX=${xExpr},__slY=${yExpr},__slZ=${zExpr}; var __slRef=${ref}; if(__slRef){__slRef.position.set(__slX,__slY,__slZ);} if(gameObject.transform2D){gameObject.transform2D.position.x=__slX;gameObject.transform2D.position.y=__slY;} if(gameObject.physicsBody&&gameObject.physicsBody.rigidBody){gameObject.physicsBody.rigidBody.setTranslation({x:__slX,y:__slY},true);} }`);
    } else {
      lines.push(`{ var __slRef=${ref}; if(__slRef) __slRef.position.set(${xExpr},${yExpr},${zExpr}); }`);
    }
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetComponentRotationNode) {
    const ci = (node as SetComponentRotationNode).compIndex;
    const ref = ci === -1
      ? '(gameObject.group || gameObject.mesh)'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    const xExpr = xS ? rv(xS.nid, xS.ok) : `(${ref} ? ${ref}.rotation.x : 0)`;
    const yExpr = yS ? rv(yS.nid, yS.ok) : `(${ref} ? ${ref}.rotation.y : 0)`;
    const zExpr = zS ? rv(zS.nid, zS.ok) : `(${ref} ? ${ref}.rotation.z : 0)`;
    lines.push(`{ var __srRef=${ref}; if(__srRef) __srRef.rotation.set(${xExpr},${yExpr},${zExpr}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetComponentScaleNode) {
    const ci = (node as SetComponentScaleNode).compIndex;
    const ref = ci === -1
      ? '(gameObject.group || gameObject.mesh)'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    const xExpr = xS ? rv(xS.nid, xS.ok) : `(${ref} ? ${ref}.scale.x : 1)`;
    const yExpr = yS ? rv(yS.nid, yS.ok) : `(${ref} ? ${ref}.scale.y : 1)`;
    const zExpr = zS ? rv(zS.nid, zS.ok) : `(${ref} ? ${ref}.scale.z : 1)`;
    lines.push(`{ var __ssRef=${ref}; if(__ssRef) __ssRef.scale.set(${xExpr},${yExpr},${zExpr}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetComponentVisibilityNode) {
    const ci = (node as SetComponentVisibilityNode).compIndex;
    const ref = ci === -1
      ? '(gameObject.group || gameObject.mesh)'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const vS = inputSrc.get(`${nodeId}.visible`);
    lines.push(`{ var __svRef=${ref}; if(__svRef) __svRef.visible = ${vS ? `!!(${rv(vS.nid, vS.ok)})` : 'true'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Set Static Mesh — swap the mesh asset on a component at runtime
  if (node instanceof SetStaticMeshNode) {
    const ci = (node as SetStaticMeshNode).compIndex;
    const ref = ci === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const mS = inputSrc.get(`${nodeId}.meshAssetId`);
    const meshIdExpr = mS ? rv(mS.nid, mS.ok) : '""';
    lines.push(`{ const _ref = ${ref}; if (_ref) { const _mgr = __meshAssetManager; const _ma = _mgr && _mgr.getAsset(${meshIdExpr}); if (_ma) { while (_ref.children.length) _ref.remove(_ref.children[0]); __loadMeshFromAsset(_ma).then(({ scene: _ls }) => { while (_ls.children.length) { const _c = _ls.children[0]; _ls.remove(_c); _ref.add(_c); } _ref.updateMatrixWorld(true); }); } } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Set Material — change material on a mesh component slot at runtime
  if (node instanceof SetMeshMaterialNode) {
    const ci = (node as SetMeshMaterialNode).compIndex;
    const ref = ci === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const sS = inputSrc.get(`${nodeId}.slotIndex`);
    const mS = inputSrc.get(`${nodeId}.materialId`);
    const slotExpr = sS ? rv(sS.nid, sS.ok) : '0';

  if (node.label === 'Set Timer by Function Name') {
    const objS = inputSrc.get(`${nodeId}.object`);
    const fnS = inputSrc.get(`${nodeId}.functionName`);
    const timeS = inputSrc.get(`${nodeId}.time`);
    const loopS = inputSrc.get(`${nodeId}.looping`);
    const obj = objS ? rv(objS.nid, objS.ok) : 'gameObject';
    const fn = fnS ? rv(fnS.nid, fnS.ok) : '""';
    const time = timeS ? rv(timeS.nid, timeS.ok) : '1.0';
    const loop = loopS ? rv(loopS.nid, loopS.ok) : 'false';
    lines.push(`{ var __tObj=${obj}; var __tFn=${fn}; var __tTime=${time}; var __tLoop=${loop}; if(__engine && __engine.timerManager && __tObj && typeof __tObj[__tFn] === 'function') { var __tHandle = __engine.timerManager.setTimer(function(){__tObj[__tFn]();}, __tTime, __tLoop); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Set Timer by Event') {
    const timeS = inputSrc.get(`${nodeId}.time`);
    const loopS = inputSrc.get(`${nodeId}.looping`);
    const time = timeS ? rv(timeS.nid, timeS.ok) : '1.0';
    const loop = loopS ? rv(loopS.nid, loopS.ok) : 'false';
    lines.push(`{ var __tTime=${time}; var __tLoop=${loop}; if(__engine && __engine.timerManager) { var __tHandle = __engine.timerManager.setTimer(function(){ ${we(nodeId, 'event').join(' ')} }, __tTime, __tLoop); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Clear Timer') {
    const handleS = inputSrc.get(`${nodeId}.handle`);
    const handle = handleS ? rv(handleS.nid, handleS.ok) : 'null';
    lines.push(`{ var __tHandle=${handle}; if(__engine && __engine.timerManager && __tHandle) { __engine.timerManager.clearTimer(__tHandle); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Pause Timer') {
    const handleS = inputSrc.get(`${nodeId}.handle`);
    const handle = handleS ? rv(handleS.nid, handleS.ok) : 'null';
    lines.push(`{ var __tHandle=${handle}; if(__engine && __engine.timerManager && __tHandle) { __engine.timerManager.pauseTimer(__tHandle); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Unpause Timer') {
    const handleS = inputSrc.get(`${nodeId}.handle`);
    const handle = handleS ? rv(handleS.nid, handleS.ok) : 'null';
    lines.push(`{ var __tHandle=${handle}; if(__engine && __engine.timerManager && __tHandle) { __engine.timerManager.unpauseTimer(__tHandle); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node.label === 'Retriggerable Delay') {
    const durS = inputSrc.get(`${nodeId}.duration`);
    const dur = durS ? rv(durS.nid, durS.ok) : '0.2';
    lines.push(`{ var __rdDur=${dur}; if(!gameObject.__retriggerableDelays) gameObject.__retriggerableDelays = {}; if(gameObject.__retriggerableDelays["${nodeId}"]) clearTimeout(gameObject.__retriggerableDelays["${nodeId}"]); gameObject.__retriggerableDelays["${nodeId}"] = setTimeout(function(){ ${we(nodeId, 'completed').join(' ')} }, __rdDur * 1000); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
    const matIdExpr = mS ? rv(mS.nid, mS.ok) : '""';
    lines.push(`{ const _ref = ${ref}; if (_ref) { const _mgr = __meshAssetManager; const _matA = _mgr && _mgr.getMaterial(${matIdExpr}); if (_matA) { const _meshes = []; _ref.traverse(c => { if (c.isMesh) _meshes.push(c); }); const _si = ${slotExpr}; if (_si >= 0 && _si < _meshes.length) { const _old = _meshes[_si].material; if (Array.isArray(_old)) _old.forEach(x => x.dispose()); else _old.dispose(); _meshes[_si].material = __buildThreeMaterialFromAsset(_matA, _mgr); } } } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Trigger component setter nodes
  if (node instanceof SetTriggerEnabledNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _tc = (gameObject._triggerComponents || [])[${(node as SetTriggerEnabledNode).compIndex}]; if (_tc) _tc.config.enabled = ${eS ? rv(eS.nid, eS.ok) : 'true'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetTriggerSizeNode) {
    const ci = (node as SetTriggerSizeNode).compIndex;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _tc = (gameObject._triggerComponents || [])[${ci}]; if (_tc) { const d = _tc.config.dimensions; if (d.width !== undefined) { d.width = ${xS ? rv(xS.nid, xS.ok) : '1'}; d.height = ${yS ? rv(yS.nid, yS.ok) : '1'}; d.depth = ${zS ? rv(zS.nid, zS.ok) : '1'}; } else if (d.radius !== undefined) { d.radius = ${xS ? rv(xS.nid, xS.ok) : '1'}; } __physics.collision.resizeSensor(__physics, gameObject.id, ${ci}, _tc.config); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetCollisionEnabledNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _tcs = gameObject._triggerComponents || []; for (const _tc of _tcs) _tc.config.enabled = ${eS ? rv(eS.nid, eS.ok) : 'true'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Light component setter nodes
  if (node instanceof SetLightEnabledNode) {
    const ci = (node as SetLightEnabledNode).compIndex;
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.visible = !!(${eS ? rv(eS.nid, eS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetLightColorNode) {
    const ci = (node as SetLightColorNode).compIndex;
    const cS = inputSrc.get(`${nodeId}.color`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.color.set(${cS ? rv(cS.nid, cS.ok) : "'#ffffff'"}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetLightIntensityNode) {
    const ci = (node as SetLightIntensityNode).compIndex;
    const iS = inputSrc.get(`${nodeId}.intensity`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.intensity = ${iS ? rv(iS.nid, iS.ok) : '1'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetLightDistanceNode) {
    const ci = (node as SetLightDistanceNode).compIndex;
    const dS = inputSrc.get(`${nodeId}.distance`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc && _lc.light.distance !== undefined) _lc.light.distance = ${dS ? rv(dS.nid, dS.ok) : '0'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetLightPositionNode) {
    const ci = (node as SetLightPositionNode).compIndex;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.position.set(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetLightTargetNode) {
    const ci = (node as SetLightTargetNode).compIndex;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc && _lc.light.target) _lc.light.target.position.set(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '-1'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetCastShadowNode) {
    const ci = (node as SetCastShadowNode).compIndex;
    const cS = inputSrc.get(`${nodeId}.castShadow`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.castShadow = !!(${cS ? rv(cS.nid, cS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetSpotAngleNode) {
    const ci = (node as SetSpotAngleNode).compIndex;
    const aS = inputSrc.get(`${nodeId}.angle`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc && _lc.light.angle !== undefined) _lc.light.angle = (${aS ? rv(aS.nid, aS.ok) : '45'}) * Math.PI / 180; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetSpotPenumbraNode) {
    const ci = (node as SetSpotPenumbraNode).compIndex;
    const pS = inputSrc.get(`${nodeId}.penumbra`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc && _lc.light.penumbra !== undefined) _lc.light.penumbra = ${pS ? rv(pS.nid, pS.ok) : '0'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Character Movement action nodes
  if (node instanceof AddMovementInputNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    const sS = inputSrc.get(`${nodeId}.scale`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) { const _d = ({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}); _cc.addMovementInput(_d, ${sS ? rv(sS.nid, sS.ok) : '1'}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof JumpNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.jump(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof StopJumpingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.stopJumping(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof CrouchNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.crouch(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof UncrouchNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.uncrouch(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof StartFlyingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.startFlying(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof StopFlyingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.stopFlying(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof StartSwimmingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.startSwimming(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof StopSwimmingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.stopSwimming(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetMovementModeNode) {
    const ctrl = node.controls['mode'] as MovementModeSelectControl;
    const mode = ctrl?.value ?? 'walking';
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setMovementMode('${mode}'); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetMaxWalkSpeedNode) {
    const sS = inputSrc.get(`${nodeId}.speed`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setMaxWalkSpeed(${sS ? rv(sS.nid, sS.ok) : '6'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof LaunchCharacterNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    const oxyS = inputSrc.get(`${nodeId}.overrideXY`);
    const ozS = inputSrc.get(`${nodeId}.overrideZ`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.launchCharacter({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, ${oxyS ? rv(oxyS.nid, oxyS.ok) : 'true'}, ${ozS ? rv(ozS.nid, ozS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetCameraModeNode) {
    const mS = inputSrc.get(`${nodeId}.mode`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setCameraMode(${mS ? rv(mS.nid, mS.ok) : "'firstPerson'"}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetCameraFOVNode) {
    const fS = inputSrc.get(`${nodeId}.fov`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setFOV(${fS ? rv(fS.nid, fS.ok) : '75'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // Camera Control action nodes
  if (node instanceof AddControllerYawInputNode) {
    const vS = inputSrc.get(`${nodeId}.value`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.addControllerYawInput(${vS ? rv(vS.nid, vS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof AddControllerPitchInputNode) {
    const vS = inputSrc.get(`${nodeId}.value`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.addControllerPitchInput(${vS ? rv(vS.nid, vS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetControllerRotationNode) {
    const yS = inputSrc.get(`${nodeId}.yaw`);
    const pS = inputSrc.get(`${nodeId}.pitch`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setControllerRotation(${yS ? rv(yS.nid, yS.ok) : '0'}, ${pS ? rv(pS.nid, pS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetMouseLockEnabledNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setMouseLockEnabled(${eS ? rv(eS.nid, eS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // Player Controller cursor control nodes
  if (node instanceof SetShowMouseCursorNode) {
    const showS = inputSrc.get(`${nodeId}.show`);
    lines.push(`{ const _pc = gameObject.scene.engine?.playerControllers.get(0); if (_pc) _pc.setShowMouseCursor(${showS ? rv(showS.nid, showS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetInputModeGameOnlyNode) {
    lines.push(`{ const _pc = gameObject.scene.engine?.playerControllers.get(0); if (_pc) _pc.setInputModeGameOnly(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetInputModeGameAndUINode) {
    lines.push(`{ const _pc = gameObject.scene.engine?.playerControllers.get(0); if (_pc) _pc.setInputModeGameAndUI(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetInputModeUIOnlyNode) {
    lines.push(`{ const _pc = gameObject.scene.engine?.playerControllers.get(0); if (_pc) _pc.setInputModeUIOnly(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // Player Controller pawn control nodes
  if (node instanceof PossessPawnNode) {
    const nS = inputSrc.get(`${nodeId}.pawnName`);
    lines.push(`{ /* Possess Pawn — handled at engine level */ }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof UnpossessPawnNode) {
    lines.push(`{ /* Unpossess Pawn — handled at engine level */ }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // AI Controller action nodes
  if (node instanceof AIMoveToNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.moveTo(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof AIStopMovementNode) {
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.stopMovement(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof AISetFocalPointNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.setFocalPoint(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof AIClearFocalPointNode) {
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.clearFocalPoint(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof AIStartPatrolNode) {
    const loopS = inputSrc.get(`${nodeId}.loop`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.startPatrol(_ai.patrolPoints.length ? _ai.patrolPoints : [], ${loopS ? rv(loopS.nid, loopS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof AIStopPatrolNode) {
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.stopMovement(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof AIStartFollowingNode) {
    const tS = inputSrc.get(`${nodeId}.targetName`);
    const dS = inputSrc.get(`${nodeId}.distance`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) { const _tn = ${tS ? rv(tS.nid, tS.ok) : "''"}; const _tgo = __scene && __scene.gameObjects.find(g => g.name === _tn); if (_tgo) _ai.startFollowing(_tgo, ${dS ? rv(dS.nid, dS.ok) : '3'}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof AIStopFollowingNode) {
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.stopMovement(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // ── AI Task / BT exec action nodes ──
  if (node instanceof FinishExecuteNode) {
    const sS = inputSrc.get(`${nodeId}.success`);
    lines.push(`{ return ${sS ? rv(sS.nid, sS.ok) : 'true'} ? 'Success' : 'Failure'; }`);
    return lines;
  }
  if (node instanceof ReturnNode) {
    const cS = inputSrc.get(`${nodeId}.canExecute`);
    lines.push(`{ return ${cS ? rv(cS.nid, cS.ok) : 'true'} ? 'Success' : 'Failure'; }`);
    return lines;
  }
  if (node instanceof MoveToLocationNode) {
    const tS = inputSrc.get(`${nodeId}.target`);
    const rS = inputSrc.get(`${nodeId}.radius`);
    const target = tS ? rv(tS.nid, tS.ok) : '{x:0,y:0,z:0}';
    const radius = rS ? rv(rS.nid, rS.ok) : '0.5';
    const v = `__mtl_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`{ const _ai = gameObject.aiController; const _t = ${target}; if (_ai && _t) { _ai.config.acceptanceRadius = ${radius}; _ai.moveTo(_t.x || 0, _t.y || 0, _t.z || 0); ${v} = true; } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof SetBlackboardValueNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const vS = inputSrc.get(`${nodeId}.value`);
    const key = kS ? rv(kS.nid, kS.ok) : "''";
    const val = vS ? rv(vS.nid, vS.ok) : 'null';
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.setBlackboardValue(${key}, ${val}); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof ClearBlackboardValueNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const key = kS ? rv(kS.nid, kS.ok) : "''";
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.clearBlackboardValue(${key}); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof RunBehaviorTreeNode) {
    const btCtrl = node.controls['btSelect'] as any;
    const btId = btCtrl?.value || '';
    const v = `__rbt_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const ctrlVar = `__rbt_ctrl_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const pawnVar = `__rbt_pawn_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`var ${ctrlVar} = null;`);
    lines.push(`var ${pawnVar} = null;`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai && __engine && __engine.behaviorTreeManager) { const _btAsset = __engine.behaviorTreeManager.get('${btId}'); if (_btAsset) { const _bt = __engine.behaviorTreeManager.instantiate(_btAsset); _ai.runBehaviorTree(_bt); ${v} = true; ${ctrlVar} = _ai; ${pawnVar} = gameObject; } } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof RotateToFaceNode) {
    const tS = inputSrc.get(`${nodeId}.target`);
    const sS = inputSrc.get(`${nodeId}.speed`);
    const target = tS ? rv(tS.nid, tS.ok) : '{x:0,y:0,z:0}';
    const speed = sS ? rv(sS.nid, sS.ok) : '360';
    const v = `__rtf_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`{ const _ai = gameObject.aiController; const _t = ${target}; if (_ai && _t) { _ai.setFocalPoint(_t.x || 0, _t.y || 0, _t.z || 0); ${v} = true; } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  // ── NavMesh exec action nodes ──
  if (node instanceof NavMeshBuildNode) {
    const v = `__nmb_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    // Auto-detect 2D vs 3D: if scene2DManager exists and is in 2D mode, use generateFrom2DBounds
    lines.push(`{ if (__engine && __engine.navMeshSystem) {`);
    lines.push(`  if (__engine.scene2DManager && __engine.scene2DManager.is2D) {`);
    lines.push(`    var _bMin = {x:-10,y:-10}, _bMax = {x:10,y:10}, _obs = [];`);
    lines.push(`    var _mgr = __engine.scene2DManager;`);
    lines.push(`    if (_mgr.tilemaps && _mgr.tilesets) {`);
    lines.push(`      var _fMinX=Infinity,_fMinY=Infinity,_fMaxX=-Infinity,_fMaxY=-Infinity,_found=false;`);
    lines.push(`      _mgr.tilemaps.forEach(function(tm) {`);
    lines.push(`        var ts = _mgr.tilesets.get(tm.tilesetId); if (!ts) return;`);
    lines.push(`        var ppu = ts.pixelsPerUnit||100, tw = ts.tileWidth/ppu, th = ts.tileHeight/ppu;`);
    lines.push(`        tm.layers.forEach(function(layer) {`);
    lines.push(`          Object.keys(layer.tiles).forEach(function(k) {`);
    lines.push(`            var p = k.split(',').map(Number), cx=p[0], cy=p[1];`);
    lines.push(`            var x0=cx*tw, y0=cy*th, x1=x0+tw, y1=y0+th;`);
    lines.push(`            if(x0<_fMinX)_fMinX=x0; if(y0<_fMinY)_fMinY=y0; if(x1>_fMaxX)_fMaxX=x1; if(y1>_fMaxY)_fMaxY=y1; _found=true;`);
    lines.push(`            if(layer.hasCollision) _obs.push({min:{x:x0,y:y0},max:{x:x1,y:y1}});`);
    lines.push(`          });`);
    lines.push(`        });`);
    lines.push(`      });`);
    lines.push(`      if(_found){_bMin={x:_fMinX-1,y:_fMinY-1};_bMax={x:_fMaxX+1,y:_fMaxY+1};}`);
    lines.push(`    }`);
    lines.push(`    __engine.navMeshSystem.generateFrom2DBounds(_bMin,_bMax,_obs).then(function(r){${v}=!!r;});`);
    lines.push(`  } else {`);
    lines.push(`    __engine.navMeshSystem.generateFromScene(__engine.scene.threeScene).then(function(r){${v}=!!r;});`);
    lines.push(`  }`);
    lines.push(`} }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof NavMeshFindPathNode) {
    const sS = inputSrc.get(`${nodeId}.start`);
    const eS = inputSrc.get(`${nodeId}.end`);
    const start = sS ? rv(sS.nid, sS.ok) : '{x:0,y:0,z:0}';
    const end = eS ? rv(eS.nid, eS.ok) : '{x:0,y:0,z:0}';
    const v = `__nmfp_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v}_path = []; var ${v}_ok = false;`);
    lines.push(`{ if (__engine && __engine.navMeshSystem && __engine.navMeshSystem.isReady) { var _p = __engine.navMeshSystem.findPath(${start}, ${end}); if (_p && _p.length > 0) { ${v}_path = _p; ${v}_ok = true; } } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof NavMeshAddAgentNode) {
    const aS = inputSrc.get(`${nodeId}.actor`);
    const sS = inputSrc.get(`${nodeId}.speed`);
    const actor = aS ? rv(aS.nid, aS.ok) : 'null';
    const speed = sS ? rv(sS.nid, sS.ok) : '3.5';
    const v = `__nmaa_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v}_id = ''; var ${v}_ok = false;`);
    lines.push(`{ if (__engine && __engine.navMeshSystem && __engine.navMeshSystem.isReady && ${actor}) { var _pos = ${actor}.mesh ? ${actor}.mesh.position : {x:0,y:0,z:0}; var _aid = (${actor}.name || 'agent_' + Math.random().toString(36).substr(2,6)); var _result = __engine.navMeshSystem.addAgent(_aid, _pos, ${actor}, {maxSpeed: ${speed}}); if (_result) { ${v}_id = _aid; ${v}_ok = true; } } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof NavMeshRemoveAgentNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const agentId = idS ? rv(idS.nid, idS.ok) : "''";
    lines.push(`{ if (__engine && __engine.navMeshSystem) __engine.navMeshSystem.removeAgent(${agentId}); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof NavMeshAgentMoveToNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const tS = inputSrc.get(`${nodeId}.target`);
    const agentId = idS ? rv(idS.nid, idS.ok) : "''";
    const target = tS ? rv(tS.nid, tS.ok) : '{x:0,y:0,z:0}';
    const v = `__nmamt_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`{ if (__engine && __engine.navMeshSystem && __engine.navMeshSystem.isReady) { ${v} = __engine.navMeshSystem.requestMoveTarget(${agentId}, ${target}); } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof NavMeshAddBoxObstacleNode) {
    const idS = inputSrc.get(`${nodeId}.id`);
    const pS = inputSrc.get(`${nodeId}.position`);
    const hS = inputSrc.get(`${nodeId}.halfExtents`);
    const obsId = idS ? rv(idS.nid, idS.ok) : "''";
    const pos = pS ? rv(pS.nid, pS.ok) : '{x:0,y:0,z:0}';
    const half = hS ? rv(hS.nid, hS.ok) : '{x:1,y:1,z:1}';
    const v = `__nmabo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`{ if (__engine && __engine.navMeshSystem) { ${v} = __engine.navMeshSystem.addBoxObstacle(${obsId}, ${pos}, ${half}); } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof NavMeshAddCylinderObstacleNode) {
    const idS = inputSrc.get(`${nodeId}.id`);
    const pS = inputSrc.get(`${nodeId}.position`);
    const rS = inputSrc.get(`${nodeId}.radius`);
    const hS = inputSrc.get(`${nodeId}.height`);
    const obsId = idS ? rv(idS.nid, idS.ok) : "''";
    const pos = pS ? rv(pS.nid, pS.ok) : '{x:0,y:0,z:0}';
    const radius = rS ? rv(rS.nid, rS.ok) : '1';
    const height = hS ? rv(hS.nid, hS.ok) : '2';
    const v = `__nmaco_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`{ if (__engine && __engine.navMeshSystem) { ${v} = __engine.navMeshSystem.addCylinderObstacle(${obsId}, ${pos}, ${radius}, ${height}); } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof NavMeshRemoveObstacleNode) {
    const idS = inputSrc.get(`${nodeId}.id`);
    const obsId = idS ? rv(idS.nid, idS.ok) : "''";
    const v = `__nmro_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`{ if (__engine && __engine.navMeshSystem) { ${v} = __engine.navMeshSystem.removeObstacle(${obsId}); } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof NavMeshToggleDebugNode) {
    lines.push(`{ if (__engine && __engine.navMeshSystem) __engine.navMeshSystem.toggleDebug(__engine.scene.threeScene); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  // Camera & Spring Arm action nodes
  if (node instanceof SetSpringArmLengthNode) {
    const lS = inputSrc.get(`${nodeId}.length`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmLength(${lS ? rv(lS.nid, lS.ok) : '4'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetSpringArmTargetOffsetNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmTargetOffset(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0.9'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetSpringArmSocketOffsetNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmSocketOffset(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetSpringArmCollisionNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmCollision(${eS ? rv(eS.nid, eS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetCameraCollisionEnabledNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmCollision(${eS ? rv(eS.nid, eS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetCameraLagNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    const sS = inputSrc.get(`${nodeId}.speed`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setCameraLag(${eS ? rv(eS.nid, eS.ok) : 'false'}, ${sS ? rv(sS.nid, sS.ok) : '10'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetCameraRotationLagNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    const sS = inputSrc.get(`${nodeId}.speed`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setCameraRotationLag(${eS ? rv(eS.nid, eS.ok) : 'false'}, ${sS ? rv(sS.nid, sS.ok) : '10'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Variable Set
  if (node instanceof SetVariableNode) {
    const vn = sanitizeName(node.varName);
    if (node.varType === 'Vector3') {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`__var_${vn}.x = ${xS ? rv(xS.nid, xS.ok) : '0'};`);
      lines.push(`__var_${vn}.y = ${yS ? rv(yS.nid, yS.ok) : '0'};`);
      lines.push(`__var_${vn}.z = ${zS ? rv(zS.nid, zS.ok) : '0'};`);
    } else if (node.varType.startsWith('Struct:')) {
      const structId = node.varType.slice(7);
      const fields = resolveStructFields(structId, bp);
      if (fields && fields.length > 0) {
        for (const f of fields) {
          const fS = inputSrc.get(`${nodeId}.${f.name}`);
          lines.push(`__var_${vn}.${sanitizeName(f.name)} = ${fS ? rv(fS.nid, fS.ok) : fieldDefault(f.type)};`);
        }
      }
    } else {
      const vS = inputSrc.get(`${nodeId}.value`);
      const bpVar = bp.variables.find(x => x.name === node.varName);
      lines.push(`__var_${vn} = ${vS ? rv(vS.nid, vS.ok) : (bpVar ? varDefaultStr(bpVar, bp) : '0')};`);

      if (node.varType === 'Float' || node.varType === 'Boolean' || node.varType === 'String') {
        lines.push(`{ var _ai = __animInstance || (gameObject && gameObject._animationInstances && gameObject._animationInstances[0]); if (_ai) { _ai.variables.set(${JSON.stringify(node.varName)}, __var_${vn}); } }`);
      }
    }
    // Sync closure-local variable to _scriptVars so cross-actor GetActorVariable reads the latest value
    // For AnimBP: skip _scriptVars sync to avoid overwriting pawn's own variables
    if (!_isAnimBlueprint) {
      lines.push(`if (gameObject && gameObject._scriptVars) gameObject._scriptVars[${JSON.stringify(node.varName)}] = __var_${vn};`);
    }
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Function Call
  if (node instanceof FunctionCallNode) {
    const fn = bp.functions.find(f => f.id === node.funcId);
    if (fn) {
      const args = fn.inputs.map(inp => {
        const s = inputSrc.get(`${nodeId}.${inp.name}`);
        return s ? rv(s.nid, s.ok) : '0';
      });
      const resultVar = `__fn_result_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (fn.outputs.length > 0) {
        lines.push(`var ${resultVar} = __fn_${sanitizeName(fn.name)}(${args.join(', ')});`);
      } else {
        lines.push(`__fn_${sanitizeName(fn.name)}(${args.join(', ')});`);
      }
    }
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Call Actor Function (remote)
  if (node instanceof CallActorFunctionNode) {
    const tS = inputSrc.get(`${nodeId}.target`);
    const targetVal = tS ? rv(tS.nid, tS.ok) : 'null';
    const cafn = node as CallActorFunctionNode;
    const fnName = cafn.funcName;
    const resultVar = `__rfn_result_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    // Collect input args (skip exec and target)
    const argKeys = Object.keys(node.inputs).filter(k => k !== 'exec' && k !== 'target');
    const args = argKeys.map(k => {
      const s = inputSrc.get(`${nodeId}.${k}`);
      return s ? rv(s.nid, s.ok) : '0';
    });
    // Remote function call: look up the target's _scriptFunctions dictionary
    lines.push(`var ${resultVar} = {};`);
    lines.push(`{ var _rtgt = ${targetVal}; if (_rtgt && _rtgt._scriptFunctions && _rtgt._scriptFunctions[${JSON.stringify(fnName)}]) { ${resultVar} = _rtgt._scriptFunctions[${JSON.stringify(fnName)}](${args.join(', ')}) || {}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Function Return
  if (node instanceof FunctionReturnNode) {
    const fn = bp.functions.find(f => f.id === node.funcId);
    if (fn && fn.outputs.length > 0) {
      const retFields = fn.outputs.map(out => {
        const s = inputSrc.get(`${nodeId}.${out.name}`);
        return `${sanitizeName(out.name)}: ${s ? rv(s.nid, s.ok) : fieldDefault(out.type)}`;
      });
      lines.push(`return { ${retFields.join(', ')} };`);
    } else {
      lines.push('return;');
    }
    return lines;
  }

  // Macro Call — inline placeholder
  if (node instanceof MacroCallNode) {
    lines.push(`/* macro: ${node.macroName} */`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Custom Event Call
  if (node instanceof CallCustomEventNode) {
    const evt = bp.customEvents.find(e => e.id === node.eventId);
    const args: string[] = [];
    if (evt && evt.params.length > 0) {
      for (const p of evt.params) {
        const s = inputSrc.get(`${nodeId}.${p.name}`);
        args.push(s ? rv(s.nid, s.ok) : fieldDefault(p.type));
      }
    }
    const tS = inputSrc.get(`${nodeId}.target`);
    const targetVal = tS ? rv(tS.nid, tS.ok) : 'null';
    const evtName = sanitizeName(node.eventName);
    if (tS) {
      lines.push(`{ var _t = ${targetVal};`);
      lines.push(`  if (!_t) { console.warn('[CustomEvent] Target is null for ${node.eventName}'); }`);
      lines.push(`  else if (!_t._scriptEvents) { console.warn('[CustomEvent] Target has no _scriptEvents for ${node.eventName}', _t); }`);
      lines.push(`  else if (!_t._scriptEvents[${JSON.stringify(node.eventName)}]) { console.warn('[CustomEvent] Target missing event ${node.eventName}', _t); }`);
      lines.push(`  else { console.log('[CustomEvent] Calling target event ${node.eventName}'); _t._scriptEvents[${JSON.stringify(node.eventName)}](${args.join(', ')}); }`);
      lines.push(`}`);
    } else if ((node as CallCustomEventNode).targetActorId) {
      lines.push(`{ var _t = __scene ? __scene.findById(${JSON.stringify((node as CallCustomEventNode).targetActorId)}) : null;`);
      lines.push(`  if (!_t) { console.warn('[CustomEvent] Target id not found for ${node.eventName}'); }`);
      lines.push(`  else if (!_t._scriptEvents) { console.warn('[CustomEvent] Target has no _scriptEvents for ${node.eventName}', _t); }`);
      lines.push(`  else if (!_t._scriptEvents[${JSON.stringify(node.eventName)}]) { console.warn('[CustomEvent] Target missing event ${node.eventName}', _t); }`);
      lines.push(`  else { console.log('[CustomEvent] Calling target event ${node.eventName}'); _t._scriptEvents[${JSON.stringify(node.eventName)}](${args.join(', ')}); }`);
      lines.push(`}`);
    } else {
      lines.push(`console.log('[CustomEvent] Calling local event ${node.eventName}');`);
      lines.push(`__custom_evt_${evtName}(${args.join(', ')});`);
    }
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // ── Casting action nodes ──
  if (node instanceof CastToNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    const cn = node as CastToNode;
    const castVar = `__cast_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${castVar} = null;`);
    lines.push(`if (${objVal} && ${objVal}.actorAssetId === ${JSON.stringify(cn.targetClassId)}) {`);
    lines.push(`  ${castVar} = ${objVal};`);
    lines.push(...we(nodeId, 'success').map(l => '  ' + l));
    const failBody = we(nodeId, 'fail');
    if (failBody.length) { lines.push('} else {'); lines.push(...failBody.map(l => '  ' + l)); }
    lines.push('}');
    return lines;
  }
  if (node instanceof IsValidNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    const validBody = we(nodeId, 'valid');
    const invalidBody = we(nodeId, 'invalid');
    lines.push(`if (${objVal} != null) {`);
    lines.push(...validBody.map(l => '  ' + l));
    if (invalidBody.length) { lines.push('} else {'); lines.push(...invalidBody.map(l => '  ' + l)); }
    lines.push('}');
    return lines;
  }
  if (node instanceof SetActorVariableNode) {
    const tS = inputSrc.get(`${nodeId}.target`);
    const vS = inputSrc.get(`${nodeId}.value`);
    const targetVal = tS ? rv(tS.nid, tS.ok) : 'null';
    const valCode = vS ? rv(vS.nid, vS.ok) : '0';
    const vn = (node as SetActorVariableNode).varName;
    lines.push(`{ var _tgt = ${targetVal}; if (_tgt) { if (!_tgt._scriptVars) _tgt._scriptVars = {}; _tgt._scriptVars[${JSON.stringify(vn)}] = ${valCode}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // ── SetAnimVarNode — sets an animation variable on the anim instance ──
  if (node instanceof SetAnimVarNode) {
    const vS = inputSrc.get(`${nodeId}.value`);
    const an = node as SetAnimVarNode;
    const defaultVal = an.varType === 'number' ? '0' : an.varType === 'boolean' ? 'false' : '""';
    const valCode = vS ? rv(vS.nid, vS.ok) : defaultVal;
    lines.push(`{ var _ai = __animInstance || (gameObject && gameObject._animationInstances && gameObject._animationInstances[0]); if (_ai) { _ai.variables.set(${JSON.stringify(an.varName)}, ${valCode}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // ── EmitEventNode — emit a global event via the EventBus ──
  if (node instanceof EmitEventNode) {
    const eventId = (node.controls.eventId as any)?.value;
    let eventName = '';
    let payloadFields: { name: string; type: string }[] = [];
    if (eventId) {
      const mgr = EventAssetManager.getInstance();
      const eventAsset = mgr?.getAsset(eventId);
      if (eventAsset) {
        eventName = eventAsset.name;
        payloadFields = eventAsset.payloadFields || [];
      }
    }
    if (eventName) {
      if (payloadFields.length > 0) {
        // Build a payload object from the dynamic input pins
        const fieldParts: string[] = [];
        for (const field of payloadFields) {
          const key = `field_${field.name}`;
          const fS = inputSrc.get(`${nodeId}.${key}`);
          const expr = fS ? rv(fS.nid, fS.ok) : (field.type === 'String' ? '""' : field.type === 'Boolean' ? 'false' : '0');
          fieldParts.push(`${JSON.stringify(field.name)}: ${expr}`);
        }
        lines.push(`{ if (__engine && __engine.eventBus) { __engine.eventBus.emit(${JSON.stringify(eventName)}, { ${fieldParts.join(', ')} }); } }`);
      } else {
        lines.push(`{ if (__engine && __engine.eventBus) { __engine.eventBus.emit(${JSON.stringify(eventName)}, null); } }`);
      }
    }
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  switch (node.label) {
    case 'Add Actor World Offset': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`gameObject.position.add(new THREE.Vector3(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}));`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Actor Local Offset': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`gameObject.translateX(${xS ? rv(xS.nid, xS.ok) : '0'});`);
      lines.push(`gameObject.translateY(${yS ? rv(yS.nid, yS.ok) : '0'});`);
      lines.push(`gameObject.translateZ(${zS ? rv(zS.nid, zS.ok) : '0'});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Actor World Rotation': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`{ const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'})); gameObject.quaternion.premultiply(q); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Teleport Actor': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`gameObject.position.set(${xS ? rv(xS.nid, xS.ok) : 'gameObject.position.x'}, ${yS ? rv(yS.nid, yS.ok) : 'gameObject.position.y'}, ${zS ? rv(zS.nid, zS.ok) : 'gameObject.position.z'});`);
      lines.push(`if (__physics && __physics.collision) { __physics.collision.teleportBody(__physics, gameObject.id, gameObject.position); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Tag To Actor': {
      const tS = inputSrc.get(`${nodeId}.tag`);
      lines.push(`{ const t = ${tS ? rv(tS.nid, tS.ok) : '""'}; if (t && !(gameObject.userData.tags || []).includes(t)) { gameObject.userData.tags = gameObject.userData.tags || []; gameObject.userData.tags.push(t); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Remove Tag From Actor': {
      const tS = inputSrc.get(`${nodeId}.tag`);
      lines.push(`{ const t = ${tS ? rv(tS.nid, tS.ok) : '""'}; if (t && gameObject.userData.tags) { gameObject.userData.tags = gameObject.userData.tags.filter(x => x !== t); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Hidden In Game': {
      const hS = inputSrc.get(`${nodeId}.hidden`);
      lines.push(`gameObject.visible = !(${hS ? rv(hS.nid, hS.ok) : 'false'});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Enable Collision': {
      const eS = inputSrc.get(`${nodeId}.enabled`);
      lines.push(`if (__physics && __physics.collision) { __physics.collision.setBodyEnabled(__physics, gameObject.id, !!(${eS ? rv(eS.nid, eS.ok) : 'true'})); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Tick Enabled': {
      const eS = inputSrc.get(`${nodeId}.enabled`);
      lines.push(`gameObject.userData.tickEnabled = !!(${eS ? rv(eS.nid, eS.ok) : 'true'});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Destroy Component': {
      const cS = inputSrc.get(`${nodeId}.component`);
      lines.push(`{ const c = ${cS ? rv(cS.nid, cS.ok) : 'null'}; if (c && c.parent) { c.parent.remove(c); if (c.dispose) c.dispose(); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Position': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`gameObject.position.set(${xS ? rv(xS.nid, xS.ok) : 'gameObject.position.x'}, ${yS ? rv(yS.nid, yS.ok) : 'gameObject.position.y'}, ${zS ? rv(zS.nid, zS.ok) : 'gameObject.position.z'});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Rotation': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`gameObject.rotation.set(${xS ? rv(xS.nid, xS.ok) : 'gameObject.rotation.x'}, ${yS ? rv(yS.nid, yS.ok) : 'gameObject.rotation.y'}, ${zS ? rv(zS.nid, zS.ok) : 'gameObject.rotation.z'});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Scale': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`gameObject.scale.set(${xS ? rv(xS.nid, xS.ok) : 'gameObject.scale.x'}, ${yS ? rv(yS.nid, yS.ok) : 'gameObject.scale.y'}, ${zS ? rv(zS.nid, zS.ok) : 'gameObject.scale.z'});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Spawn Actor from Class': {
      const san = node as SpawnActorFromClassNode;
      const classId = JSON.stringify(san.targetClassId || '');
      const className = JSON.stringify(san.targetClassName || '');
      const lxS = inputSrc.get(`${nodeId}.locX`), lyS = inputSrc.get(`${nodeId}.locY`), lzS = inputSrc.get(`${nodeId}.locZ`);
      const rxS = inputSrc.get(`${nodeId}.rotX`), ryS = inputSrc.get(`${nodeId}.rotY`), rzS = inputSrc.get(`${nodeId}.rotZ`);
      const sxS = inputSrc.get(`${nodeId}.scaleX`), syS = inputSrc.get(`${nodeId}.scaleY`), szS = inputSrc.get(`${nodeId}.scaleZ`);
      const owS = inputSrc.get(`${nodeId}.owner`);
      const locX = lxS ? rv(lxS.nid, lxS.ok) : '0';
      const locY = lyS ? rv(lyS.nid, lyS.ok) : '0';
      const locZ = lzS ? rv(lzS.nid, lzS.ok) : '0';
      const rotX = rxS ? rv(rxS.nid, rxS.ok) : '0';
      const rotY = ryS ? rv(ryS.nid, ryS.ok) : '0';
      const rotZ = rzS ? rv(rzS.nid, rzS.ok) : '0';
      const scX = sxS ? rv(sxS.nid, sxS.ok) : '1';
      const scY = syS ? rv(syS.nid, syS.ok) : '1';
      const scZ = szS ? rv(szS.nid, szS.ok) : '1';
      const owner = owS ? rv(owS.nid, owS.ok) : 'null';
      // Build expose-on-spawn overrides object
      const overrideFields = san.exposedVars.map(v => {
        const eS = inputSrc.get(`${nodeId}.exposed_${v.varId}`);
        return eS ? `${JSON.stringify(v.name)}: ${rv(eS.nid, eS.ok)}` : null;
      }).filter(Boolean);
      const overrides = overrideFields.length > 0 ? `{${overrideFields.join(', ')}}` : 'null';
      const saVar = `__sa_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${saVar} = null;`);
      // Try unified engine.spawnActor first (global handler), then 2D (only if 2D is playing), then 3D fallback
      lines.push(`{ var __pos = {x:${locX},y:${locY},z:${locZ}}; var __rot = {x:${rotX},y:${rotY},z:${rotZ}}; var __sc = {x:${scX},y:${scY},z:${scZ}};`);
      lines.push(`  if (__engine && typeof __engine.spawnActor === 'function') { ${saVar} = __engine.spawnActor(${classId}, ${className}, __pos, __rot, __sc, ${owner}, ${overrides}); }`);
      lines.push(`  else {`);
      lines.push(`    if (__engine && __engine.scene2DManager && __engine.scene2DManager.isPlaying && typeof __engine.scene2DManager.spawnActorFromClassId === 'function') { ${saVar} = __engine.scene2DManager.spawnActorFromClassId(${classId}, __pos, ${overrides}); }`);
      lines.push(`    if (${saVar} == null && __scene && typeof __scene.spawnActorFromClass === 'function') { ${saVar} = __scene.spawnActorFromClass(${classId}, ${className}, __pos, __rot, __sc, ${owner}, ${overrides}); }`);
      lines.push(`  }`);
      lines.push(`  if (${saVar} == null) { print('[SpawnActor] Warning: Spawn Actor from Class failed for class ' + ${className} + ' (id=' + ${classId} + ')'); }`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Destroy Actor': {
      const tS = inputSrc.get(`${nodeId}.target`);
      // Default to "Self" (context-aware) when no Target pin is connected
      const targetExpr = tS ? rv(tS.nid, tS.ok) : '(typeof gameObject !== "undefined" ? gameObject : (typeof __widgetHandle !== "undefined" ? __widgetHandle : null))';
      // Support destroying Widgets (UI), 2D SpriteActors, and 3D GameObjects
      lines.push(`{ var __destroyTarget = ${targetExpr}; if (__destroyTarget) { if (typeof __uiManager !== 'undefined' && typeof __destroyTarget === 'string' && __destroyTarget.startsWith('__widget_')) { __uiManager.removeFromViewport(__destroyTarget); } else if (__engine && __engine.scene2DManager && typeof __engine.scene2DManager.despawnSpriteActor2D === 'function' && __engine.scene2DManager.spriteActors && __engine.scene2DManager.spriteActors.includes(__destroyTarget)) { __engine.scene2DManager.despawnSpriteActor2D(__destroyTarget); } else if (__scene && typeof __scene.destroyActor === 'function') { __scene.destroyActor(__destroyTarget); } else if (__engine && __engine.scene && typeof __engine.scene.destroyActor === 'function') { __engine.scene.destroyActor(__destroyTarget); } else { print("Warning: Destroy Actor failed - could not determine context"); } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Print String': {
      const vS = inputSrc.get(`${nodeId}.value`);
      let v: string;
      if (vS) { v = rv(vS.nid, vS.ok); }
      else {
        const ctrl = node.controls['text'] as ClassicPreset.InputControl<'text'> | undefined;
        v = JSON.stringify(String(ctrl?.value ?? 'Hello'));
      }
      lines.push(`print(${v});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Action Mapping Key': {
      const action = JSON.stringify((node as any).selectedAction || '');
      const keyS = inputSrc.get(`${nodeId}.key`);
      const keyVal = keyS ? rv(keyS.nid, keyS.ok) : '""';
      lines.push(`if (__engine && __engine.input) {`);
      lines.push(`  var __keys = __engine.input.getActionKeys(${action});`);
      lines.push(`  if (!__keys.includes(${keyVal})) {`);
      lines.push(`    __engine.input.addAction(${action}, [...__keys, ${keyVal}]);`);
      lines.push(`  }`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Remove Action Mapping Key': {
      const action = JSON.stringify((node as any).selectedAction || '');
      const keyS = inputSrc.get(`${nodeId}.key`);
      const keyVal = keyS ? rv(keyS.nid, keyS.ok) : '""';
      lines.push(`if (__engine && __engine.input) {`);
      lines.push(`  var __keys = __engine.input.getActionKeys(${action});`);
      lines.push(`  var __newKeys = __keys.filter(function(k) { return k !== ${keyVal}; });`);
      lines.push(`  __engine.input.addAction(${action}, __newKeys);`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear Action Mapping': {
      const action = JSON.stringify((node as any).selectedAction || '');
      lines.push(`if (__engine && __engine.input) {`);
      lines.push(`  __engine.input.removeAction(${action});`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Axis Mapping Key': {
      const axis = JSON.stringify((node as any).selectedAxis || '');
      const keyS = inputSrc.get(`${nodeId}.key`);
      const keyVal = keyS ? rv(keyS.nid, keyS.ok) : '""';
      const scaleS = inputSrc.get(`${nodeId}.scale`);
      const scaleVal = scaleS ? rv(scaleS.nid, scaleS.ok) : '1';
      lines.push(`if (__engine && __engine.input) {`);
      lines.push(`  var __mappings = __engine.input.getAxisMappings(${axis});`);
      lines.push(`  var __exists = false;`);
      lines.push(`  for (var i = 0; i < __mappings.length; i++) {`);
      lines.push(`    if (__mappings[i].key === ${keyVal}) { __mappings[i].scale = ${scaleVal}; __exists = true; break; }`);
      lines.push(`  }`);
      lines.push(`  if (!__exists) { __engine.input.addAxis(${axis}, ${keyVal}, ${scaleVal}); }`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Remove Axis Mapping Key': {
      const axis = JSON.stringify((node as any).selectedAxis || '');
      const keyS = inputSrc.get(`${nodeId}.key`);
      const keyVal = keyS ? rv(keyS.nid, keyS.ok) : '""';
      lines.push(`if (__engine && __engine.input) {`);
      lines.push(`  var __mappings = __engine.input.getAxisMappings(${axis});`);
      lines.push(`  var __newMappings = __mappings.filter(function(m) { return m.key !== ${keyVal}; });`);
      lines.push(`  __engine.input.removeAxis(${axis});`);
      lines.push(`  for (var i = 0; i < __newMappings.length; i++) {`);
      lines.push(`    __engine.input.addAxis(${axis}, __newMappings[i].key, __newMappings[i].scale);`);
      lines.push(`  }`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear Axis Mapping': {
      const axis = JSON.stringify((node as any).selectedAxis || '');
      lines.push(`if (__engine && __engine.input) {`);
      lines.push(`  __engine.input.removeAxis(${axis});`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Force': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.addForce({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Impulse': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.applyImpulse({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Velocity': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.setLinvel({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Physics (extended) setters / actions ─────────────────
    case 'Set Mass': {
      const mS = inputSrc.get(`${nodeId}.mass`);
      const massVal = mS ? rv(mS.nid, mS.ok) : '1';
      lines.push(`if (gameObject.rigidBody) { var __m = ${massVal}; gameObject.rigidBody.setAdditionalMass(Math.max(0, __m - 1), true); if (gameObject.physicsConfig) gameObject.physicsConfig.mass = __m; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Linear Velocity': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.setLinvel({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Angular Velocity': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.setAngvel({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Simulate Physics': {
      const eS = inputSrc.get(`${nodeId}.enabled`);
      const enabled = eS ? rv(eS.nid, eS.ok) : 'true';
      lines.push(`if (__physics) {`);
      lines.push(`  if (${enabled}) {`);
      lines.push(`    if (!gameObject.physicsConfig) gameObject.physicsConfig = { enabled: true, simulatePhysics: true, mass: 1, gravityEnabled: true, gravityScale: 1, linearDamping: 0.01, angularDamping: 0.05, friction: 0.5, restitution: 0.3, lockPositionX: false, lockPositionY: false, lockPositionZ: false, lockRotationX: false, lockRotationY: false, lockRotationZ: false, collisionEnabled: true, collisionChannel: 'WorldDynamic' };`);
      lines.push(`    gameObject.physicsConfig.enabled = true;`);
      lines.push(`    gameObject.physicsConfig.simulatePhysics = true;`);
      lines.push(`    if (!gameObject.rigidBody) __physics.addPhysicsBody(gameObject);`);
      lines.push(`  } else {`);
      lines.push(`    if (gameObject.physicsConfig) { gameObject.physicsConfig.simulatePhysics = false; }`);
      lines.push(`    if (gameObject.rigidBody) __physics.removePhysicsBody(gameObject);`);
      lines.push(`  }`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Gravity Enabled': {
      const eS = inputSrc.get(`${nodeId}.enabled`);
      const enabledVal = eS ? rv(eS.nid, eS.ok) : 'true';
      // Auto-create physics body if not present (like Set Simulate Physics)
      lines.push(`(function() {`);
      lines.push(`  if (!gameObject.rigidBody && __physics) {`);
      lines.push(`    if (!gameObject.physicsConfig) gameObject.physicsConfig = { enabled: true, simulatePhysics: true, mass: 1, gravityEnabled: true, gravityScale: 1, linearDamping: 0.01, angularDamping: 0.05, friction: 0.5, restitution: 0.3, lockPositionX: false, lockPositionY: false, lockPositionZ: false, lockRotationX: false, lockRotationY: false, lockRotationZ: false, collisionEnabled: true, collisionChannel: 'WorldDynamic' };`);
      lines.push(`    gameObject.physicsConfig.enabled = true;`);
      lines.push(`    gameObject.physicsConfig.simulatePhysics = true;`);
      lines.push(`    __physics.addPhysicsBody(gameObject);`);
      lines.push(`  }`);
      lines.push(`  if (gameObject.rigidBody) {`);
      lines.push(`    var __ge = !!(${enabledVal});`);
      lines.push(`    var __gs = (gameObject.physicsConfig ? gameObject.physicsConfig.gravityScale : 1) || 1;`);
      lines.push(`    gameObject.rigidBody.setGravityScale(__ge ? __gs : 0, true);`);
      lines.push(`    if (gameObject.physicsConfig) gameObject.physicsConfig.gravityEnabled = __ge;`);
      lines.push(`  }`);
      lines.push(`})();`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Gravity Scale': {
      const sS = inputSrc.get(`${nodeId}.scale`);
      const scaleVal = sS ? rv(sS.nid, sS.ok) : '1';
      // Auto-create physics body if not present
      lines.push(`(function() {`);
      lines.push(`  if (!gameObject.rigidBody && __physics) {`);
      lines.push(`    if (!gameObject.physicsConfig) gameObject.physicsConfig = { enabled: true, simulatePhysics: true, mass: 1, gravityEnabled: true, gravityScale: 1, linearDamping: 0.01, angularDamping: 0.05, friction: 0.5, restitution: 0.3, lockPositionX: false, lockPositionY: false, lockPositionZ: false, lockRotationX: false, lockRotationY: false, lockRotationZ: false, collisionEnabled: true, collisionChannel: 'WorldDynamic' };`);
      lines.push(`    gameObject.physicsConfig.enabled = true;`);
      lines.push(`    gameObject.physicsConfig.simulatePhysics = true;`);
      lines.push(`    __physics.addPhysicsBody(gameObject);`);
      lines.push(`  }`);
      lines.push(`  if (gameObject.rigidBody) {`);
      lines.push(`    var __gsv = ${scaleVal};`);
      lines.push(`    gameObject.rigidBody.setGravityScale(__gsv, true);`);
      lines.push(`    if (gameObject.physicsConfig) gameObject.physicsConfig.gravityScale = __gsv;`);
      lines.push(`  }`);
      lines.push(`})();`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Linear Damping': {
      const dS = inputSrc.get(`${nodeId}.damping`);
      const dampVal = dS ? rv(dS.nid, dS.ok) : '0.01';
      lines.push(`if (gameObject.rigidBody) { var __ld = ${dampVal}; gameObject.rigidBody.setLinearDamping(__ld); if (gameObject.physicsConfig) gameObject.physicsConfig.linearDamping = __ld; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Angular Damping': {
      const dS = inputSrc.get(`${nodeId}.damping`);
      const dampVal = dS ? rv(dS.nid, dS.ok) : '0.05';
      lines.push(`if (gameObject.rigidBody) { var __ad = ${dampVal}; gameObject.rigidBody.setAngularDamping(__ad); if (gameObject.physicsConfig) gameObject.physicsConfig.angularDamping = __ad; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Physics Material': {
      const fS = inputSrc.get(`${nodeId}.friction`);
      const rS = inputSrc.get(`${nodeId}.restitution`);
      const fricVal = fS ? rv(fS.nid, fS.ok) : '0.5';
      const restVal = rS ? rv(rS.nid, rS.ok) : '0.3';
      lines.push(`if (gameObject.collider) { var __fr = ${fricVal}; var __re = ${restVal}; gameObject.collider.setFriction(__fr); gameObject.collider.setRestitution(__re); if (gameObject.physicsConfig) { gameObject.physicsConfig.friction = __fr; gameObject.physicsConfig.restitution = __re; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Torque': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.addTorque({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Force at Location': {
      const fxS = inputSrc.get(`${nodeId}.forceX`); const fyS = inputSrc.get(`${nodeId}.forceY`); const fzS = inputSrc.get(`${nodeId}.forceZ`);
      const pxS = inputSrc.get(`${nodeId}.pointX`); const pyS = inputSrc.get(`${nodeId}.pointY`); const pzS = inputSrc.get(`${nodeId}.pointZ`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.addForceAtPoint({x:${fxS ? rv(fxS.nid, fxS.ok) : '0'}, y:${fyS ? rv(fyS.nid, fyS.ok) : '0'}, z:${fzS ? rv(fzS.nid, fzS.ok) : '0'}}, {x:${pxS ? rv(pxS.nid, pxS.ok) : '0'}, y:${pyS ? rv(pyS.nid, pyS.ok) : '0'}, z:${pzS ? rv(pzS.nid, pzS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Impulse at Location': {
      const ixS = inputSrc.get(`${nodeId}.impulseX`); const iyS = inputSrc.get(`${nodeId}.impulseY`); const izS = inputSrc.get(`${nodeId}.impulseZ`);
      const pxS = inputSrc.get(`${nodeId}.pointX`); const pyS = inputSrc.get(`${nodeId}.pointY`); const pzS = inputSrc.get(`${nodeId}.pointZ`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.applyImpulseAtPoint({x:${ixS ? rv(ixS.nid, ixS.ok) : '0'}, y:${iyS ? rv(iyS.nid, iyS.ok) : '0'}, z:${izS ? rv(izS.nid, izS.ok) : '0'}}, {x:${pxS ? rv(pxS.nid, pxS.ok) : '0'}, y:${pyS ? rv(pyS.nid, pyS.ok) : '0'}, z:${pzS ? rv(pzS.nid, pzS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Constraint': {
      const lx = inputSrc.get(`${nodeId}.lockPosX`); const ly = inputSrc.get(`${nodeId}.lockPosY`); const lz = inputSrc.get(`${nodeId}.lockPosZ`);
      const rx = inputSrc.get(`${nodeId}.lockRotX`); const ry = inputSrc.get(`${nodeId}.lockRotY`); const rz = inputSrc.get(`${nodeId}.lockRotZ`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.setEnabledTranslations(!${lx ? rv(lx.nid, lx.ok) : 'false'}, !${ly ? rv(ly.nid, ly.ok) : 'false'}, !${lz ? rv(lz.nid, lz.ok) : 'false'}, true); gameObject.rigidBody.setEnabledRotations(!${rx ? rv(rx.nid, rx.ok) : 'false'}, !${ry ? rv(ry.nid, ry.ok) : 'false'}, !${rz ? rv(rz.nid, rz.ok) : 'false'}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Branch': {
      const cS = inputSrc.get(`${nodeId}.condition`);
      const cond = cS ? rv(cS.nid, cS.ok) : 'false';
      const trueLines = we(nodeId, 'true');
      const falseLines = we(nodeId, 'false');
      lines.push(`if (${cond}) {`);
      lines.push(...trueLines.map(l => '  ' + l));
      if (falseLines.length) { lines.push('} else {'); lines.push(...falseLines.map(l => '  ' + l)); }
      lines.push('}');
      break;
    }
    case 'Sequence': {
      lines.push(...we(nodeId, 'then0'));
      lines.push(...we(nodeId, 'then1'));
      break;
    }
    case 'For Loop': {
      const cS = inputSrc.get(`${nodeId}.count`);
      const count = cS ? rv(cS.nid, cS.ok) : '10';
      lines.push(`for (let __i = 0; __i < ${count}; __i++) {`);
      lines.push(...we(nodeId, 'body').map(l => '  ' + l));
      lines.push('}');
      lines.push(...we(nodeId, 'done'));
      break;
    }
    case 'For Each Loop': {
      const arrS = inputSrc.get(`${nodeId}.array`);
      const arr = arrS ? rv(arrS.nid, arrS.ok) : '[]';
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`{ var __arr_${uid} = ${arr} || []; for (var __fe_i_${uid} = 0; __fe_i_${uid} < __arr_${uid}.length; __fe_i_${uid}++) {`);
      lines.push(`  var __fe_el_${uid} = __arr_${uid}[__fe_i_${uid}]; var __i = __fe_i_${uid};`);
      lines.push(...we(nodeId, 'body').map(l => '  ' + l));
      lines.push('} }');
      lines.push(...we(nodeId, 'done'));
      break;
    }
    case 'For Each Loop with Break': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (triggerInput === 'break') {
        lines.push(`__fe_brk_${uid} = true;`);
      } else {
        const arrS = inputSrc.get(`${nodeId}.array`);
        const arr = arrS ? rv(arrS.nid, arrS.ok) : '[]';
        lines.push(`{ var __arr_${uid} = ${arr} || []; var __fe_brk_${uid} = false; for (var __fe_i_${uid} = 0; __fe_i_${uid} < __arr_${uid}.length && !__fe_brk_${uid}; __fe_i_${uid}++) {`);
        lines.push(`  var __fe_el_${uid} = __arr_${uid}[__fe_i_${uid}]; var __i = __fe_i_${uid};`);
        lines.push(...we(nodeId, 'body').map(l => '  ' + l));
        lines.push('} }');
        lines.push(...we(nodeId, 'done'));
      }
      break;
    }
    case 'For Each Actor': {
      const arrS = inputSrc.get(`${nodeId}.array`);
      const arr = arrS ? rv(arrS.nid, arrS.ok) : '[]';
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`{ var __arr_${uid} = ${arr} || []; for (var __fe_i_${uid} = 0; __fe_i_${uid} < __arr_${uid}.length; __fe_i_${uid}++) {`);
      lines.push(`  var __fe_el_${uid} = __arr_${uid}[__fe_i_${uid}]; var __i = __fe_i_${uid};`);
      lines.push(...we(nodeId, 'body').map(l => '  ' + l));
      lines.push('} }');
      lines.push(...we(nodeId, 'done'));
      break;
    }
    case 'Delay': {
      const dS = inputSrc.get(`${nodeId}.duration`);
      const duration = dS ? rv(dS.nid, dS.ok) : '1';
      const completedLines = we(nodeId, 'completed');
      lines.push(`setTimeout(function() {`);
      lines.push(...completedLines.map(l => '  ' + l));
      lines.push(`}, (${duration}) * 1000);`);
      break;
    }

    // ── Stateful flow control nodes ──────────────────────────
    case 'Do Once': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (triggerInput === 'reset') {
        lines.push(`__doOnce_${uid} = false;`);
      } else {
        lines.push(`if (typeof __doOnce_${uid} === 'undefined') __doOnce_${uid} = false;`);
        lines.push(`if (!__doOnce_${uid}) { __doOnce_${uid} = true;`);
        lines.push(...we(nodeId, 'completed').map(l => '  ' + l));
        lines.push(`}`);
      }
      break;
    }
    case 'Flip Flop': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`if (typeof __flipFlop_${uid} === 'undefined') __flipFlop_${uid} = true;`);
      lines.push(`if (__flipFlop_${uid}) {`);
      lines.push(...we(nodeId, 'a').map(l => '  ' + l));
      lines.push(`} else {`);
      lines.push(...we(nodeId, 'b').map(l => '  ' + l));
      lines.push(`}`);
      lines.push(`__flipFlop_${uid} = !__flipFlop_${uid};`);
      break;
    }
    case 'Do N': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      const nS = inputSrc.get(`${nodeId}.n`);
      const nVal = nS ? rv(nS.nid, nS.ok) : '1';
      if (triggerInput === 'reset') {
        lines.push(`__doN_ctr_${uid} = 0;`);
      } else {
        lines.push(`if (typeof __doN_ctr_${uid} === 'undefined') __doN_ctr_${uid} = 0;`);
        lines.push(`if (__doN_ctr_${uid} < (${nVal})) { __doN_ctr_${uid}++;`);
        lines.push(...we(nodeId, 'exec').map(l => '  ' + l));
        lines.push(`}`);
      }
      break;
    }
    case 'While Loop': {
      const condS = inputSrc.get(`${nodeId}.condition`);
      const cond = condS ? rv(condS.nid, condS.ok) : 'false';
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`{ var __wl_itr_${uid} = 0; while ((${cond}) && __wl_itr_${uid} < 10000) { __wl_itr_${uid}++;`);
      lines.push(...we(nodeId, 'body').map(l => '  ' + l));
      lines.push(`} }`);
      lines.push(...we(nodeId, 'completed'));
      break;
    }
    case 'For Loop with Break': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      if (triggerInput === 'break') {
        lines.push(`__flb_brk_${uid} = true;`);
      } else {
        const fiS = inputSrc.get(`${nodeId}.firstIndex`);
        const liS = inputSrc.get(`${nodeId}.lastIndex`);
        const fi = fiS ? rv(fiS.nid, fiS.ok) : '0';
        const li = liS ? rv(liS.nid, liS.ok) : '10';
        lines.push(`{ var __flb_brk_${uid} = false; for (var __flb_i_${uid} = (${fi}); __flb_i_${uid} <= (${li}) && !__flb_brk_${uid}; __flb_i_${uid}++) {`);
        lines.push(`  var __i = __flb_i_${uid};`);
        lines.push(...we(nodeId, 'body').map(l => '  ' + l));
        lines.push(`} }`);
        lines.push(...we(nodeId, 'completed'));
      }
      break;
    }
    case 'Gate': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      const scS = inputSrc.get(`${nodeId}.startClosed`);
      const startClosed = scS ? rv(scS.nid, scS.ok) : 'false';
      if (triggerInput === 'open') {
        lines.push(`__gate_${uid} = true;`);
      } else if (triggerInput === 'close') {
        lines.push(`__gate_${uid} = false;`);
      } else if (triggerInput === 'toggle') {
        lines.push(`if (typeof __gate_${uid} === 'undefined') __gate_${uid} = !(${startClosed});`);
        lines.push(`__gate_${uid} = !__gate_${uid};`);
      } else {
        // 'enter' input
        lines.push(`if (typeof __gate_${uid} === 'undefined') __gate_${uid} = !(${startClosed});`);
        lines.push(`if (__gate_${uid}) {`);
        lines.push(...we(nodeId, 'exit').map(l => '  ' + l));
        lines.push(`}`);
      }
      break;
    }
    case 'Multi Gate': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      const isRndS = inputSrc.get(`${nodeId}.isRandom`);
      const loopS = inputSrc.get(`${nodeId}.loop`);
      const siS = inputSrc.get(`${nodeId}.startIndex`);
      const isRandom = isRndS ? rv(isRndS.nid, isRndS.ok) : 'false';
      const loop = loopS ? rv(loopS.nid, loopS.ok) : 'false';
      const startIdx = siS ? rv(siS.nid, siS.ok) : '0';
      if (triggerInput === 'reset') {
        lines.push(`__mg_idx_${uid} = (${startIdx}); __mg_done_${uid} = false;`);
      } else {
        lines.push(`if (typeof __mg_idx_${uid} === 'undefined') { __mg_idx_${uid} = (${startIdx}); __mg_done_${uid} = false; }`);
        lines.push(`if (!__mg_done_${uid}) {`);
        lines.push(`  var __mg_cnt_${uid} = 3;`);
        lines.push(`  var __mg_cur_${uid} = (${isRandom}) ? Math.floor(Math.random() * __mg_cnt_${uid}) : __mg_idx_${uid};`);
        const out0Lines = we(nodeId, 'out0');
        const out1Lines = we(nodeId, 'out1');
        const out2Lines = we(nodeId, 'out2');
        lines.push(`  if (__mg_cur_${uid} === 0) {`);
        lines.push(...out0Lines.map(l => '    ' + l));
        lines.push(`  } else if (__mg_cur_${uid} === 1) {`);
        lines.push(...out1Lines.map(l => '    ' + l));
        lines.push(`  } else if (__mg_cur_${uid} === 2) {`);
        lines.push(...out2Lines.map(l => '    ' + l));
        lines.push(`  }`);
        lines.push(`  if (!(${isRandom})) {`);
        lines.push(`    __mg_idx_${uid}++;`);
        lines.push(`    if (__mg_idx_${uid} >= __mg_cnt_${uid}) {`);
        lines.push(`      if (${loop}) { __mg_idx_${uid} = 0; } else { __mg_done_${uid} = true; }`);
        lines.push(`    }`);
        lines.push(`  }`);
        lines.push(`}`);
      }
      break;
    }
    case 'Switch on Int': {
      const selS = inputSrc.get(`${nodeId}.selection`);
      const sel = selS ? rv(selS.nid, selS.ok) : '0';
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`{ var __sw_${uid} = Math.floor(${sel});`);
      lines.push(`  if (__sw_${uid} === 0) {`);
      lines.push(...we(nodeId, 'case0').map(l => '    ' + l));
      lines.push(`  } else if (__sw_${uid} === 1) {`);
      lines.push(...we(nodeId, 'case1').map(l => '    ' + l));
      lines.push(`  } else if (__sw_${uid} === 2) {`);
      lines.push(...we(nodeId, 'case2').map(l => '    ' + l));
      lines.push(`  } else {`);
      lines.push(...we(nodeId, 'default').map(l => '    ' + l));
      lines.push(`  }`);
      lines.push(`}`);
      break;
    }
    case 'Switch on String': {
      const selS = inputSrc.get(`${nodeId}.selection`);
      const sel = selS ? rv(selS.nid, selS.ok) : '""';
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      const swNode = node as any;
      const cv0 = swNode.caseValues?.[0] ?? 'Case 0';
      const cv1 = swNode.caseValues?.[1] ?? 'Case 1';
      const cv2 = swNode.caseValues?.[2] ?? 'Case 2';
      lines.push(`{ var __sw_${uid} = String(${sel});`);
      lines.push(`  if (__sw_${uid} === ${JSON.stringify(cv0)}) {`);
      lines.push(...we(nodeId, 'case0').map(l => '    ' + l));
      lines.push(`  } else if (__sw_${uid} === ${JSON.stringify(cv1)}) {`);
      lines.push(...we(nodeId, 'case1').map(l => '    ' + l));
      lines.push(`  } else if (__sw_${uid} === ${JSON.stringify(cv2)}) {`);
      lines.push(...we(nodeId, 'case2').map(l => '    ' + l));
      lines.push(`  } else {`);
      lines.push(...we(nodeId, 'default').map(l => '    ' + l));
      lines.push(`  }`);
      lines.push(`}`);
      break;
    }

    // ── Widget / UI action nodes ─────────────────────────────
    case 'Create Widget': {
      const wn = node as CreateWidgetNode;
      const bpId = JSON.stringify(wn.widgetBPId || '');
      lines.push(`var __wh_${nodeId.replace(/[^a-zA-Z0-9]/g,'_')} = __uiManager ? __uiManager.createWidget(${bpId}) : '';`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add to Viewport': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const widgetHandle = wS ? rv(wS.nid, wS.ok) : '""';
      lines.push(`if (__uiManager) __uiManager.addToViewport(${widgetHandle});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Remove from Viewport': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const widgetHandle = wS ? rv(wS.nid, wS.ok) : '""';
      lines.push(`if (__uiManager) __uiManager.removeFromViewport(${widgetHandle});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Widget Text': {
      const n = node as SetWidgetTextNode;
      const tS = inputSrc.get(`${nodeId}.text`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const text = tS ? rv(tS.nid, tS.ok) : '""';
      lines.push(`if (__uiManager) __uiManager.setText(__widgetHandle, ${wName}, ${text});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Widget Visibility': {
      const n = node as SetWidgetVisibilityNode;
      const vS = inputSrc.get(`${nodeId}.visible`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const vis = vS ? rv(vS.nid, vS.ok) : 'true';
      lines.push(`if (__uiManager) __uiManager.setVisibility(__widgetHandle, ${wName}, ${vis});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Widget Color': {
      const n = node as SetWidgetColorNode;
      const cS = inputSrc.get(`${nodeId}.color`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const color = cS ? rv(cS.nid, cS.ok) : '"#ffffff"';
      lines.push(`if (__uiManager) __uiManager.setColor(__widgetHandle, ${wName}, ${color});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Widget Opacity': {
      const n = node as SetWidgetOpacityNode;
      const oS = inputSrc.get(`${nodeId}.opacity`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const opacity = oS ? rv(oS.nid, oS.ok) : '1';
      lines.push(`if (__uiManager) __uiManager.setOpacity(__widgetHandle, ${wName}, ${opacity});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Progress Bar Percent': {
      const n = node as SetProgressBarPercentNode;
      const pS = inputSrc.get(`${nodeId}.percent`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const pct = pS ? rv(pS.nid, pS.ok) : '0';
      lines.push(`if (__uiManager) __uiManager.setProgressBarPercent(__widgetHandle, ${wName}, ${pct});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Slider Value': {
      const n = node as SetSliderValueNode;
      const vS = inputSrc.get(`${nodeId}.value`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const val = vS ? rv(vS.nid, vS.ok) : '0';
      lines.push(`if (__uiManager) __uiManager.setSliderValue(__widgetHandle, ${wName}, ${val});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set CheckBox State': {
      const n = node as SetCheckBoxStateNode;
      const cS = inputSrc.get(`${nodeId}.checked`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const checked = cS ? rv(cS.nid, cS.ok) : 'false';
      lines.push(`if (__uiManager) __uiManager.setCheckBoxState(__widgetHandle, ${wName}, ${checked});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Play Widget Animation': {
      const wS = inputSrc.get(`${nodeId}.widget`);
      const aS = inputSrc.get(`${nodeId}.animName`);
      const aCtrl = node.controls['fallbackAnim'] as ClassicPreset.InputControl<'text'>;
      const wh = wS ? rv(wS.nid, wS.ok) : '""';
      const animName = aS ? rv(aS.nid, aS.ok) : JSON.stringify(String(aCtrl?.value ?? ''));
      lines.push(`if (__uiManager) __uiManager.playAnimation(${wh}, ${animName});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Input Mode': {
      const uS = inputSrc.get(`${nodeId}.uiOnly`);
      const uiOnly = uS ? rv(uS.nid, uS.ok) : 'false';
      lines.push(`if (__uiManager) __uiManager.setInputMode(${uiOnly});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Show Mouse Cursor': {
      const sS = inputSrc.get(`${nodeId}.show`);
      const show = sS ? rv(sS.nid, sS.ok) : 'true';
      lines.push(`if (__uiManager) __uiManager.showMouseCursor(${show});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Widget Instance Interaction Nodes ───────────────────────────
    case 'Set Widget Variable': {
      const n = node as SetWidgetVariableNode;
      const wS = inputSrc.get(`${nodeId}.widget`);
      const vS = inputSrc.get(`${nodeId}.value`);
      const widgetHandle = wS ? rv(wS.nid, wS.ok) : '""';
      const value = vS ? rv(vS.nid, vS.ok) : 'undefined';
      const varName = JSON.stringify(n.getVariableName());
      lines.push(`if (__uiManager) __uiManager.setWidgetVariable(${widgetHandle}, ${varName}, ${value});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Call Widget Function': {
      const n = node as CallWidgetFunctionNode;
      const wS = inputSrc.get(`${nodeId}.widget`);
      const widgetHandle = wS ? rv(wS.nid, wS.ok) : '""';
      const funcName = JSON.stringify(n.getFunctionName());
      // Collect dynamic parameters based on function signature
      const params: string[] = [];
      for (const input of n.functionInputs) {
        const pS = inputSrc.get(`${nodeId}.in_${input.name}`);
        if (pS) {
          params.push(rv(pS.nid, pS.ok));
        } else {
          params.push('undefined');
        }
      }
      const paramsStr = params.length > 0 ? ', ' + params.join(', ') : '';
      lines.push(`if (__uiManager) __uiManager.callWidgetFunction(${widgetHandle}, ${funcName}${paramsStr});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Call Widget Event': {
      const n = node as CallWidgetEventNode;
      const wS = inputSrc.get(`${nodeId}.widget`);
      const widgetHandle = wS ? rv(wS.nid, wS.ok) : '""';
      const eventName = JSON.stringify(n.getEventName());
      // Collect dynamic parameters based on event signature
      const params: string[] = [];
      for (const param of n.eventParams) {
        const pS = inputSrc.get(`${nodeId}.param_${param.name}`);
        if (pS) {
          params.push(rv(pS.nid, pS.ok));
        } else {
          params.push('undefined');
        }
      }
      const paramsStr = params.length > 0 ? ', ' + params.join(', ') : '';
      lines.push(`if (__uiManager) __uiManager.callWidgetEvent(${widgetHandle}, ${eventName}${paramsStr});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Open Scene': {
      const ctrl = node.controls['scene'] as SceneSelectControl;
      const sceneName = JSON.stringify(ctrl?.value ?? '');
      lines.push(`if (__projectManager && ${sceneName}) { __projectManager.openScene(${sceneName}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Load Scene': {
      const ctrl = node.controls['scene'] as SceneSelectControl;
      const sceneName = JSON.stringify(ctrl?.value ?? '');
      lines.push(`if (__projectManager && ${sceneName}) { __projectManager.loadSceneRuntime(${sceneName}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Get Game Instance': {
      // Pure node — value resolved inline via rv()
      break;
    }
    case 'Get Game Instance Variable': {
      const ctrl = node.controls['varName'] as GameInstanceVarNameControl;
      const varName = JSON.stringify(ctrl?.value ?? '');
      // Pure node — value resolved inline via rv()
      break;
    }
    case 'Set Game Instance Variable': {
      const ctrl = node.controls['varName'] as GameInstanceVarNameControl;
      const varName = JSON.stringify(ctrl?.value ?? '');
      const valSrc = inputSrc.get(`${nodeId}.value`);
      const val = valSrc ? rv(valSrc.nid, valSrc.ok) : 'undefined';
      lines.push(`if (__gameInstance) { __gameInstance.setVariable(${varName}, ${val}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  2D PHYSICS ACTION NODES
    // ══════════════════════════════════════════════════════════
    case 'Line Trace 2D': {
      const sxS = inputSrc.get(`${nodeId}.startX`); const syS = inputSrc.get(`${nodeId}.startY`);
      const exS = inputSrc.get(`${nodeId}.endX`); const eyS = inputSrc.get(`${nodeId}.endY`);
      const dbgS = inputSrc.get(`${nodeId}.drawDebug`);
      const sx = sxS ? rv(sxS.nid, sxS.ok) : '0'; const sy = syS ? rv(syS.nid, syS.ok) : '0';
      const ex = exS ? rv(exS.nid, exS.ok) : '0'; const ey = eyS ? rv(eyS.nid, eyS.ok) : '0';
      const _dbgCtrl = (node.inputs as any)['drawDebug']?.control;
      const dbg = dbgS ? rv(dbgS.nid, dbgS.ok) : (_dbgCtrl && typeof _dbgCtrl.value === 'number' ? (_dbgCtrl.value ? 'true' : 'false') : 'true');
      const hitVar = `__lt2d_${nodeId.replace(/[^a-zA-Z0-9]/g,'_')}`;
      // Access physics2D via scene2DManager (engine shim) or direct engine reference
      lines.push(`var ${hitVar} = (function(){ var _p2d = (__engine && __engine.scene2DManager) ? __engine.scene2DManager.physics2D : (__engine ? __engine.physics2D : null); return _p2d ? _p2d.lineTrace(${sx}, ${sy}, ${ex}, ${ey}) : { hit: false }; }());`);
      lines.push(`if (${dbg} && __engine && __engine.scene2DManager && __engine.scene2DManager.debugDraw) { var _dd = __engine.scene2DManager.debugDraw; _dd.drawLine({x:${sx},y:${sy}}, {x:${ex},y:${ey}}, ${hitVar}.hit ? 0xff0000 : 0x00ff00, 2.0); if (${hitVar}.hit && ${hitVar}.point) _dd.drawCircle(${hitVar}.point, 0.15, 0xff0000, 2.0); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Box Overlap 2D': {
      const cxS = inputSrc.get(`${nodeId}.centerX`); const cyS = inputSrc.get(`${nodeId}.centerY`);
      const hwS = inputSrc.get(`${nodeId}.halfW`); const hhS = inputSrc.get(`${nodeId}.halfH`);
      lines.push(`/* Box Overlap 2D — placeholder: Rapier2D intersection test */`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Circle Overlap 2D': {
      const cxS = inputSrc.get(`${nodeId}.centerX`); const cyS = inputSrc.get(`${nodeId}.centerY`);
      const rS = inputSrc.get(`${nodeId}.radius`);
      lines.push(`/* Circle Overlap 2D — placeholder: Rapier2D intersection test */`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Simulate Physics 2D': {
      const eS = inputSrc.get(`${nodeId}.enable`);
      const enable = eS ? rv(eS.nid, eS.ok) : 'true';
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { if (${enable}) { _rb.rigidBody.setBodyType(1, true); } else { _rb.rigidBody.setBodyType(0, true); } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Force 2D': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.addForce({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Impulse 2D': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.applyImpulse({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Velocity 2D': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.setLinvel({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Gravity Scale 2D': {
      const sS = inputSrc.get(`${nodeId}.scale`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.setGravityScale(${sS ? rv(sS.nid, sS.ok) : '1'}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Torque 2D': {
      const tS = inputSrc.get(`${nodeId}.torque`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.addTorque(${tS ? rv(tS.nid, tS.ok) : '0'}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Lock Rotation 2D': {
      const lS = inputSrc.get(`${nodeId}.lock`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.lockRotations(${lS ? rv(lS.nid, lS.ok) : 'true'}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Linear Damping 2D': {
      const dS = inputSrc.get(`${nodeId}.damping`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.setLinearDamping(${dS ? rv(dS.nid, dS.ok) : '0'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Body Type 2D': {
      const tS = inputSrc.get(`${nodeId}.type`);
      const t = tS ? rv(tS.nid, tS.ok) : '"dynamic"';
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { var _bt = ${t}; if (_bt === "dynamic") _rb.rigidBody.setBodyType(1, true); else if (_bt === "kinematic") _rb.rigidBody.setBodyType(2, true); else _rb.rigidBody.setBodyType(0, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  2D CHARACTER MOVEMENT ACTION NODES
    // ══════════════════════════════════════════════════════════
    case 'Add Movement Input 2D': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      const scS = inputSrc.get(`${nodeId}.scale`);
      const x = xS ? rv(xS.nid, xS.ok) : '0'; const y = yS ? rv(yS.nid, yS.ok) : '0';
      const scale = scS ? rv(scS.nid, scS.ok) : '1';
      // decelerateVertical is now a no-op when gravity > 0 (handled inside CharacterMovement2D)
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { var _sx = (${x}) * (${scale}); var _sy = (${y}) * (${scale}); if (Math.abs(_sx) > 0.001) _cm.moveHorizontal(_sx, deltaTime); else _cm.decelerate(deltaTime); if (Math.abs(_sy) > 0.001) _cm.moveVertical(_sy, deltaTime); else if (_cm.decelerateVertical) _cm.decelerateVertical(deltaTime); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Jump 2D': {
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.jump(); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Stop Jump 2D': {
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.stopJump(); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Launch Character 2D': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { var _ppu = gameObject.pixelsPerUnit || 100; _rb.rigidBody.setLinvel({x:${xS ? rv(xS.nid, xS.ok) : '0'}/_ppu, y:${yS ? rv(yS.nid, yS.ok) : '0'}/_ppu}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Max Walk Speed 2D': {
      const sS = inputSrc.get(`${nodeId}.speed`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.moveSpeed = ${sS ? rv(sS.nid, sS.ok) : '300'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Character Impulse 2D': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.applyImpulse({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Stop Movement 2D': {
      lines.push(`{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.setLinvel({x:0, y:0}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Jump Height 2D': {
      const hS = inputSrc.get(`${nodeId}.height`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.jumpForce = ${hS ? rv(hS.nid, hS.ok) : '600'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Max Jumps 2D': {
      const cS = inputSrc.get(`${nodeId}.count`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.maxJumps = ${cS ? rv(cS.nid, cS.ok) : '2'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Gravity Multiplier 2D': {
      const mS = inputSrc.get(`${nodeId}.multiplier`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.gravityScale = ${mS ? rv(mS.nid, mS.ok) : '1'}; } var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.setGravityScale(${mS ? rv(mS.nid, mS.ok) : '1'}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Flip Sprite Direction 2D': {
      const fS = inputSrc.get(`${nodeId}.faceRight`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.facingRight = ${fS ? rv(fS.nid, fS.ok) : 'true'}; } var _sr = gameObject.getComponent && gameObject.getComponent("SpriteRenderer"); if (_sr && _sr.setFlipX) { _sr.setFlipX(!(${fS ? rv(fS.nid, fS.ok) : 'true'})); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Air Control 2D': {
      const aS = inputSrc.get(`${nodeId}.airControl`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.airControl = ${aS ? rv(aS.nid, aS.ok) : '0.8'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Run Speed 2D': {
      const rsS = inputSrc.get(`${nodeId}.speed`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.runSpeed = ${rsS ? rv(rsS.nid, rsS.ok) : '600'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Acceleration 2D': {
      const accS = inputSrc.get(`${nodeId}.accel`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.acceleration = ${accS ? rv(accS.nid, accS.ok) : '2000'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Deceleration 2D': {
      const decS = inputSrc.get(`${nodeId}.decel`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.deceleration = ${decS ? rv(decS.nid, decS.ok) : '2000'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Jump Force 2D': {
      const jfS = inputSrc.get(`${nodeId}.force`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.jumpForce = ${jfS ? rv(jfS.nid, jfS.ok) : '600'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Coyote Time 2D': {
      const ctS = inputSrc.get(`${nodeId}.time`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.coyoteTime = ${ctS ? rv(ctS.nid, ctS.ok) : '0.1'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Jump Buffer Time 2D': {
      const jbtS = inputSrc.get(`${nodeId}.time`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.jumpBufferTime = ${jbtS ? rv(jbtS.nid, jbtS.ok) : '0.1'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Max Fall Speed 2D': {
      const mfsS = inputSrc.get(`${nodeId}.speed`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.maxFallSpeed = ${mfsS ? rv(mfsS.nid, mfsS.ok) : '-1200'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Jump Cut 2D': {
      const jcS = inputSrc.get(`${nodeId}.enabled`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.jumpCut = !!(${jcS ? rv(jcS.nid, jcS.ok) : 'true'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Linear Drag 2D': {
      const ldS = inputSrc.get(`${nodeId}.drag`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.linearDrag = ${ldS ? rv(ldS.nid, ldS.ok) : '0'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Freeze Rotation 2D': {
      const frS = inputSrc.get(`${nodeId}.frozen`);
      lines.push(`{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm) { _cm.properties.freezeRotation = !!(${frS ? rv(frS.nid, frS.ok) : 'true'}); var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (_rb && _rb.rigidBody) { _rb.rigidBody.lockRotations(!!(${frS ? rv(frS.nid, frS.ok) : 'true'}), true); } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  2D CAMERA ACTION NODES
    // ══════════════════════════════════════════════════════════
    case 'Set Camera Follow Target 2D': {
      const tnS = inputSrc.get(`${nodeId}.targetName`);
      const smS = inputSrc.get(`${nodeId}.smoothing`);
      const targetName = tnS ? rv(tnS.nid, tnS.ok) : '""';
      const smoothing = smS ? rv(smS.nid, smS.ok) : '0.1';
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { var _tgo = __scene && __scene.gameObjects.find(function(g) { return g.name === ${targetName}; }); if (_tgo) { _cam.followTarget = _tgo; _cam.followSmoothing = ${smoothing}; } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear Camera Follow 2D': {
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { _cam.followTarget = null; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Camera Zoom 2D': {
      const zS = inputSrc.get(`${nodeId}.zoom`);
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { _cam.setZoom(${zS ? rv(zS.nid, zS.ok) : '1'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Camera Shake 2D': {
      const iS = inputSrc.get(`${nodeId}.intensity`);
      const dS = inputSrc.get(`${nodeId}.duration`);
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { _cam.shake(${iS ? rv(iS.nid, iS.ok) : '5'}, ${dS ? rv(dS.nid, dS.ok) : '0.3'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Camera Position 2D': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam && _cam.camera) { _cam.camera.position.x = ${xS ? rv(xS.nid, xS.ok) : '0'}; _cam.camera.position.y = ${yS ? rv(yS.nid, yS.ok) : '0'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Camera Bounds 2D': {
      const mnxS = inputSrc.get(`${nodeId}.minX`); const mnyS = inputSrc.get(`${nodeId}.minY`);
      const mxxS = inputSrc.get(`${nodeId}.maxX`); const mxyS = inputSrc.get(`${nodeId}.maxY`);
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { _cam.bounds = { minX: ${mnxS ? rv(mnxS.nid, mnxS.ok) : '-Infinity'}, minY: ${mnyS ? rv(mnyS.nid, mnyS.ok) : '-Infinity'}, maxX: ${mxxS ? rv(mxxS.nid, mxxS.ok) : 'Infinity'}, maxY: ${mxyS ? rv(mxyS.nid, mxyS.ok) : 'Infinity'} }; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear Camera Bounds 2D': {
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { _cam.bounds = null; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Camera Dead Zone 2D': {
      const wS = inputSrc.get(`${nodeId}.width`); const hS = inputSrc.get(`${nodeId}.height`);
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { _cam.deadZone = { width: ${wS ? rv(wS.nid, wS.ok) : '0.1'}, height: ${hS ? rv(hS.nid, hS.ok) : '0.1'} }; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Camera FOV 2D': {
      // In 2D, FOV is equivalent to zoom level. Lower zoom = wider visible area.
      const fovZS = inputSrc.get(`${nodeId}.zoom`);
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { _cam.setZoom(${fovZS ? rv(fovZS.nid, fovZS.ok) : '1'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Camera Pixels Per Unit 2D': {
      const ppuS = inputSrc.get(`${nodeId}.ppu`);
      lines.push(`{ var _cam = __engine && __engine.scene2DManager && __engine.scene2DManager.camera2D; if (_cam) { _cam.setPixelsPerUnit(${ppuS ? rv(ppuS.nid, ppuS.ok) : '100'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  2D SPRITE / ANIMATION ACTION NODES
    // ══════════════════════════════════════════════════════════
    case 'Play Animation 2D': {
      const anS = inputSrc.get(`${nodeId}.animName`);
      const loopS = inputSrc.get(`${nodeId}.loop`);
      const spS = inputSrc.get(`${nodeId}.speed`);
      const animName = anS ? rv(anS.nid, anS.ok) : '""';
      lines.push(`{ var _sa = gameObject.getComponent && gameObject.getComponent("SpriteAnimator"); if (_sa && _sa.play) { _sa.play(${animName}, ${loopS ? rv(loopS.nid, loopS.ok) : 'true'}, ${spS ? rv(spS.nid, spS.ok) : '1'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Stop Animation 2D': {
      lines.push(`{ var _sa = gameObject.getComponent && gameObject.getComponent("SpriteAnimator"); if (_sa && _sa.stop) { _sa.stop(); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Sprite Frame': {
      const snS = inputSrc.get(`${nodeId}.spriteName`);
      lines.push(`{ var _sr = gameObject.getComponent && gameObject.getComponent("SpriteRenderer"); if (_sr && _sr.setFrame) { _sr.setFrame(${snS ? rv(snS.nid, snS.ok) : '0'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Anim Variable 2D': {
      const vnS = inputSrc.get(`${nodeId}.varName`);
      const vS = inputSrc.get(`${nodeId}.value`);
      lines.push(`{ var _sa = gameObject.getComponent && gameObject.getComponent("SpriteAnimator"); if (_sa && _sa.variables) { _sa.variables.set(${vnS ? rv(vnS.nid, vnS.ok) : '""'}, ${vS ? rv(vS.nid, vS.ok) : '0'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Sprite Flip': {
      const fxS = inputSrc.get(`${nodeId}.flipX`); const fyS = inputSrc.get(`${nodeId}.flipY`);
      lines.push(`{ var _sr = gameObject.getComponent && gameObject.getComponent("SpriteRenderer"); if (_sr) { if (_sr.setFlipX) _sr.setFlipX(${fxS ? rv(fxS.nid, fxS.ok) : 'false'}); if (_sr.setFlipY) _sr.setFlipY(${fyS ? rv(fyS.nid, fyS.ok) : 'false'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Sprite Color': {
      const rS = inputSrc.get(`${nodeId}.r`); const gS = inputSrc.get(`${nodeId}.g`);
      const bS = inputSrc.get(`${nodeId}.b`); const aS = inputSrc.get(`${nodeId}.a`);
      lines.push(`{ var _sr = gameObject.getComponent && gameObject.getComponent("SpriteRenderer"); if (_sr && _sr.mesh && _sr.mesh.material) { _sr.mesh.material.color.setRGB(${rS ? rv(rS.nid, rS.ok) : '1'}, ${gS ? rv(gS.nid, gS.ok) : '1'}, ${bS ? rv(bS.nid, bS.ok) : '1'}); _sr.mesh.material.opacity = ${aS ? rv(aS.nid, aS.ok) : '1'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Sprite Opacity': {
      const oS = inputSrc.get(`${nodeId}.opacity`);
      lines.push(`{ var _sr = gameObject.getComponent && gameObject.getComponent("SpriteRenderer"); if (_sr && _sr.mesh && _sr.mesh.material) { _sr.mesh.material.opacity = ${oS ? rv(oS.nid, oS.ok) : '1'}; _sr.mesh.material.transparent = true; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Sorting Layer': {
      const lnS = inputSrc.get(`${nodeId}.layerName`);
      const oiS = inputSrc.get(`${nodeId}.orderInLayer`);
      lines.push(`{ gameObject.sortingLayer = ${lnS ? rv(lnS.nid, lnS.ok) : '"Default"'}; gameObject.orderInLayer = ${oiS ? rv(oiS.nid, oiS.ok) : '0'}; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Playback Speed 2D': {
      const sS = inputSrc.get(`${nodeId}.speed`);
      lines.push(`{ var _sa = gameObject.getComponent && gameObject.getComponent("SpriteAnimator"); if (_sa) { _sa.playbackSpeed = ${sS ? rv(sS.nid, sS.ok) : '1'}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── 2D Anim Blueprint nodes ─────────────────────────────
    case 'Set Anim State 2D': {
      const snS = inputSrc.get(`${nodeId}.stateName`);
      lines.push(`{ var _ai = __animInstance || (gameObject._animationInstances && gameObject._animationInstances[0]); if (_ai && _ai.setState) { _ai.setState(${snS ? rv(snS.nid, snS.ok) : '""'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Anim Float 2D': {
      const vnS = inputSrc.get(`${nodeId}.varName`);
      const vS = inputSrc.get(`${nodeId}.value`);
      lines.push(`{ var _ai = __animInstance || (gameObject._animationInstances && gameObject._animationInstances[0]); if (_ai) { _ai.variables.set(${vnS ? rv(vnS.nid, vnS.ok) : '""'}, ${vS ? rv(vS.nid, vS.ok) : '0'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Anim Bool 2D': {
      const vnS = inputSrc.get(`${nodeId}.varName`);
      const vS = inputSrc.get(`${nodeId}.value`);
      lines.push(`{ var _ai = __animInstance || (gameObject._animationInstances && gameObject._animationInstances[0]); if (_ai) { _ai.variables.set(${vnS ? rv(vnS.nid, vnS.ok) : '""'}, ${vS ? rv(vS.nid, vS.ok) : 'false'}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  2D TILEMAP ACTION NODES
    // ══════════════════════════════════════════════════════════
    case 'Set Tile At Location': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      const lS = inputSrc.get(`${nodeId}.layer`); const tS = inputSrc.get(`${nodeId}.tileId`);
      const x = xS ? rv(xS.nid, xS.ok) : '0'; const y = yS ? rv(yS.nid, yS.ok) : '0';
      const layer = lS ? rv(lS.nid, lS.ok) : '"Ground"'; const tileId = tS ? rv(tS.nid, tS.ok) : '0';
      lines.push(`{ var _sm = __engine && __engine.scene2DManager; if (_sm) { var _tm = Array.from(_sm.tilemaps.values())[0]; if (_tm) { var _l = _tm.layers.find(function(l){ return l.name === ${layer}; }); if (_l) { _l.tiles[${x}+","+${y}] = ${tileId}; } } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear Tile At Location': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`);
      const lS = inputSrc.get(`${nodeId}.layer`);
      const x = xS ? rv(xS.nid, xS.ok) : '0'; const y = yS ? rv(yS.nid, yS.ok) : '0';
      const layer = lS ? rv(lS.nid, lS.ok) : '"Ground"';
      lines.push(`{ var _sm = __engine && __engine.scene2DManager; if (_sm) { var _tm = Array.from(_sm.tilemaps.values())[0]; if (_tm) { var _l = _tm.layers.find(function(l){ return l.name === ${layer}; }); if (_l) { delete _l.tiles[${x}+","+${y}]; } } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Fill Tiles': {
      const fxS = inputSrc.get(`${nodeId}.fromX`); const fyS = inputSrc.get(`${nodeId}.fromY`);
      const txS = inputSrc.get(`${nodeId}.toX`); const tyS = inputSrc.get(`${nodeId}.toY`);
      const lS = inputSrc.get(`${nodeId}.layer`); const tS = inputSrc.get(`${nodeId}.tileId`);
      const fx = fxS ? rv(fxS.nid, fxS.ok) : '0'; const fy = fyS ? rv(fyS.nid, fyS.ok) : '0';
      const tx = txS ? rv(txS.nid, txS.ok) : '0'; const ty = tyS ? rv(tyS.nid, tyS.ok) : '0';
      const layer = lS ? rv(lS.nid, lS.ok) : '"Ground"'; const tileId = tS ? rv(tS.nid, tS.ok) : '0';
      lines.push(`{ var _sm = __engine && __engine.scene2DManager; if (_sm) { var _tm = Array.from(_sm.tilemaps.values())[0]; if (_tm) { var _l = _tm.layers.find(function(l){ return l.name === ${layer}; }); if (_l) { for (var _fx = Math.min(${fx},${tx}); _fx <= Math.max(${fx},${tx}); _fx++) for (var _fy = Math.min(${fy},${ty}); _fy <= Math.max(${fy},${ty}); _fy++) _l.tiles[_fx+","+_fy] = ${tileId}; } } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear Tile Layer': {
      const lS = inputSrc.get(`${nodeId}.layer`);
      const layer = lS ? rv(lS.nid, lS.ok) : '"Ground"';
      lines.push(`{ var _sm = __engine && __engine.scene2DManager; if (_sm) { var _tm = Array.from(_sm.tilemaps.values())[0]; if (_tm) { var _l = _tm.layers.find(function(l){ return l.name === ${layer}; }); if (_l) { _l.tiles = {}; } } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Rebuild Tilemap Collision': {
      lines.push(`{ /* Rebuild tilemap collision — handled by editor on scene save */ }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Audio Nodes ─────────────────────────────────────────
    case 'Play Sound 2D': {
      const sS = inputSrc.get(`${nodeId}.sound`);
      const _scCtrl2D = node.controls['soundCue'] as SoundCueSelectControl | undefined;
      const volS = inputSrc.get(`${nodeId}.volume`);
      const pitS = inputSrc.get(`${nodeId}.pitch`);
      const loopS = inputSrc.get(`${nodeId}.loop`);
      const busS = inputSrc.get(`${nodeId}.bus`);
      const stS = inputSrc.get(`${nodeId}.startTime`);
      const fiS = inputSrc.get(`${nodeId}.fadeIn`);
      const sound = sS ? rv(sS.nid, sS.ok) : JSON.stringify(_scCtrl2D?.value || '');
      const vol = volS ? rv(volS.nid, volS.ok) : '1';
      const pit = pitS ? rv(pitS.nid, pitS.ok) : '1';
      const loop = loopS ? rv(loopS.nid, loopS.ok) : 'false';
      const bus = busS ? rv(busS.nid, busS.ok) : '"SFX"';
      const st = stS ? rv(stS.nid, stS.ok) : '0';
      const fi = fiS ? rv(fiS.nid, fiS.ok) : '0';
      const varName = `__audioSrc_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${varName} = -1; if (__engine && __engine.audio) { __engine.audio.playSoundCue2D(${sound}, { volume: ${vol}, pitch: ${pit}, loop: ${loop}, bus: ${bus}, startTime: ${st}, fadeInDuration: ${fi} }).then(function(id) { ${varName} = id; }); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Play Sound at Location': {
      const sS = inputSrc.get(`${nodeId}.sound`);
      const _scCtrlLoc = node.controls['soundCue'] as SoundCueSelectControl | undefined;
      const lxS = inputSrc.get(`${nodeId}.locX`);
      const lyS = inputSrc.get(`${nodeId}.locY`);
      const lzS = inputSrc.get(`${nodeId}.locZ`);
      const volS = inputSrc.get(`${nodeId}.volume`);
      const pitS = inputSrc.get(`${nodeId}.pitch`);
      const loopS = inputSrc.get(`${nodeId}.loop`);
      const busS = inputSrc.get(`${nodeId}.bus`);
      const mdS = inputSrc.get(`${nodeId}.maxDistance`);
      const stS = inputSrc.get(`${nodeId}.startTime`);
      const sound = sS ? rv(sS.nid, sS.ok) : JSON.stringify(_scCtrlLoc?.value || '');
      const lx = lxS ? rv(lxS.nid, lxS.ok) : '0';
      const ly = lyS ? rv(lyS.nid, lyS.ok) : '0';
      const lz = lzS ? rv(lzS.nid, lzS.ok) : '0';
      const vol = volS ? rv(volS.nid, volS.ok) : '1';
      const pit = pitS ? rv(pitS.nid, pitS.ok) : '1';
      const loop = loopS ? rv(loopS.nid, loopS.ok) : 'false';
      const bus = busS ? rv(busS.nid, busS.ok) : '"SFX"';
      const md = mdS ? rv(mdS.nid, mdS.ok) : '50';
      const st = stS ? rv(stS.nid, stS.ok) : '0';
      const varName = `__audioSrc_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${varName} = -1; if (__engine && __engine.audio) { __engine.audio.playSoundCueAtLocation(${sound}, {x:${lx},y:${ly},z:${lz}}, { volume: ${vol}, pitch: ${pit}, loop: ${loop}, bus: ${bus}, maxDistance: ${md}, startTime: ${st} }).then(function(id) { ${varName} = id; }); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Spawn Sound at Location': {
      // Legacy node — map to the same code as Play Sound at Location
      const sS = inputSrc.get(`${nodeId}.sound`);
      const _scCtrlSpawn = node.controls['soundCue'] as SoundCueSelectControl | undefined;
      const lxS = inputSrc.get(`${nodeId}.locX`);
      const lyS = inputSrc.get(`${nodeId}.locY`);
      const lzS = inputSrc.get(`${nodeId}.locZ`);
      const volS = inputSrc.get(`${nodeId}.volume`);
      const pitS = inputSrc.get(`${nodeId}.pitch`);
      const stS = inputSrc.get(`${nodeId}.startTime`);
      const sound = sS ? rv(sS.nid, sS.ok) : JSON.stringify(_scCtrlSpawn?.value || '');
      const lx = lxS ? rv(lxS.nid, lxS.ok) : '0';
      const ly = lyS ? rv(lyS.nid, lyS.ok) : '0';
      const lz = lzS ? rv(lzS.nid, lzS.ok) : '0';
      const vol = volS ? rv(volS.nid, volS.ok) : '1';
      const pit = pitS ? rv(pitS.nid, pitS.ok) : '1';
      const st = stS ? rv(stS.nid, stS.ok) : '0';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.playSoundCueAtLocation(${sound}, {x:${lx},y:${ly},z:${lz}}, { volume: ${vol}, pitch: ${pit}, startTime: ${st} }); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Stop Sound': {
      const idS = inputSrc.get(`${nodeId}.sourceId`);
      const foS = inputSrc.get(`${nodeId}.fadeOut`);
      const sid = idS ? rv(idS.nid, idS.ok) : '-1';
      const fo = foS ? rv(foS.nid, foS.ok) : '0';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.stopSource(${sid}, ${fo}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Stop All Sounds': {
      const foS = inputSrc.get(`${nodeId}.fadeOut`);
      const fo = foS ? rv(foS.nid, foS.ok) : '0';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.stopAll(${fo}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Pause Sound': {
      const idS = inputSrc.get(`${nodeId}.sourceId`);
      const sid = idS ? rv(idS.nid, idS.ok) : '-1';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.pauseSource(${sid}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Resume Sound': {
      const idS = inputSrc.get(`${nodeId}.sourceId`);
      const sid = idS ? rv(idS.nid, idS.ok) : '-1';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.resumeSource(${sid}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Sound Volume': {
      const idS = inputSrc.get(`${nodeId}.sourceId`);
      const volS = inputSrc.get(`${nodeId}.volume`);
      const sid = idS ? rv(idS.nid, idS.ok) : '-1';
      const vol = volS ? rv(volS.nid, volS.ok) : '1';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.setSourceVolume(${sid}, ${vol}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Sound Pitch': {
      const idS = inputSrc.get(`${nodeId}.sourceId`);
      const pitS = inputSrc.get(`${nodeId}.pitch`);
      const sid = idS ? rv(idS.nid, idS.ok) : '-1';
      const pit = pitS ? rv(pitS.nid, pitS.ok) : '1';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.setSourcePitch(${sid}, ${pit}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Bus Volume': {
      const busS = inputSrc.get(`${nodeId}.bus`);
      const volS = inputSrc.get(`${nodeId}.volume`);
      const bus = busS ? rv(busS.nid, busS.ok) : '"SFX"';
      const vol = volS ? rv(volS.nid, volS.ok) : '1';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.setBusVolume(${bus}, ${vol}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Master Volume': {
      const volS = inputSrc.get(`${nodeId}.volume`);
      const vol = volS ? rv(volS.nid, volS.ok) : '1';
      lines.push(`if (__engine && __engine.audio) { __engine.audio.masterVolume = ${vol}; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Pause All Sounds': {
      lines.push(`if (__engine && __engine.audio) { __engine.audio.pauseAll(); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Resume All Sounds': {
      lines.push(`if (__engine && __engine.audio) { __engine.audio.resumeAll(); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Gamepad Nodes (exec-based) ──────────────────────────
    case 'Set Gamepad Vibration': {
      const wmS = inputSrc.get(`${nodeId}.weakMagnitude`);
      const smS = inputSrc.get(`${nodeId}.strongMagnitude`);
      const durS = inputSrc.get(`${nodeId}.duration`);
      const giS = inputSrc.get(`${nodeId}.gamepadIndex`);
      const wm = wmS ? rv(wmS.nid, wmS.ok) : '0.5';
      const sm = smS ? rv(smS.nid, smS.ok) : '0.5';
      const dur = durS ? rv(durS.nid, durS.ok) : '200';
      const gi = giS ? rv(giS.nid, giS.ok) : '0';
      lines.push(`if (__engine && __engine.input) { __engine.input.setGamepadVibration(${wm}, ${sm}, ${dur}, ${gi}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Save/Load Nodes (exec-based — UE-style) ──────────────
    case 'Create Save Game Object': {
      const varName = `__sgo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const n = node as CreateSaveGameObjectNode;
      let defaultsStr = '{}';
      if (n.saveGameId && _saveGameMgr) {
        const asset = _saveGameMgr.getAsset(n.saveGameId);
        if (asset) {
          defaultsStr = JSON.stringify(asset.getDefaults());
        }
      }
      lines.push(`var ${varName} = null; if (__engine && __engine.saveLoad) { ${varName} = __engine.saveLoad.createSaveGameObject(); var _defs = ${defaultsStr}; for (var _k in _defs) { ${varName}.setVariable(_k, _defs[_k]); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Save Game to Slot': {
      const objS = inputSrc.get(`${nodeId}.saveObject`);
      const slotS = inputSrc.get(`${nodeId}.slotName`);
      const uiS = inputSrc.get(`${nodeId}.userIndex`);
      const obj = objS ? rv(objS.nid, objS.ok) : 'null';
      const slot = slotS ? rv(slotS.nid, slotS.ok) : '"Slot1"';
      const ui = uiS ? rv(uiS.nid, uiS.ok) : '0';
      const varName = `__sts_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${varName} = false; if (__engine && __engine.saveLoad && ${obj}) { var _gi = __engine.gameInstance; var _giVars = _gi ? _gi.variables : {}; var _sceneId = __engine.projectManager ? (__engine.projectManager.currentSceneId || "") : ""; var _pt = typeof elapsedTime !== 'undefined' ? elapsedTime : 0; ${varName} = __engine.saveLoad.saveGameToSlot(${obj}, ${slot}, ${ui}, ${slot}, _sceneId, _pt, _giVars); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Load Game from Slot': {
      const slotS = inputSrc.get(`${nodeId}.slotName`);
      const uiS = inputSrc.get(`${nodeId}.userIndex`);
      const slot = slotS ? rv(slotS.nid, slotS.ok) : '"Slot1"';
      const ui = uiS ? rv(uiS.nid, uiS.ok) : '0';
      const varObj = `__lgo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const varOk = `__lgOk_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${varObj} = null; var ${varOk} = false; if (__engine && __engine.saveLoad) { ${varObj} = __engine.saveLoad.loadGameFromSlot(${slot}, ${ui}); if (${varObj}) { ${varOk} = true; var _fullData = __engine.saveLoad.getFullSaveData(${slot}, ${ui}); if (_fullData && _fullData.gameInstanceVars) { var _gi = __engine.gameInstance; if (_gi) { for (var _k in _fullData.gameInstanceVars) { _gi.variables[_k] = _fullData.gameInstanceVars[_k]; } } } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Delete Game in Slot': {
      const slotS = inputSrc.get(`${nodeId}.slotName`);
      const uiS = inputSrc.get(`${nodeId}.userIndex`);
      const slot = slotS ? rv(slotS.nid, slotS.ok) : '"Slot1"';
      const ui = uiS ? rv(uiS.nid, uiS.ok) : '0';
      const varName = `__dgs_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${varName} = false; if (__engine && __engine.saveLoad) { ${varName} = __engine.saveLoad.deleteSaveGameInSlot(${slot}, ${ui}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Save Game Variable': {
      const objS = inputSrc.get(`${nodeId}.saveObject`);
      const nameS = inputSrc.get(`${nodeId}.varName`);
      const valS = inputSrc.get(`${nodeId}.value`);
      const obj = objS ? rv(objS.nid, objS.ok) : 'null';
      const name = nameS ? rv(nameS.nid, nameS.ok) : '""';
      const val = valS ? rv(valS.nid, valS.ok) : '""';
      lines.push(`if (${obj}) { ${obj}.setVariable(${name}, ${val}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Drag Selection action nodes ──────────────────────────
    case 'Enable Drag Selection': {
      const mbS = inputSrc.get(`${nodeId}.mouseButton`);
      const mbC = node.controls['mouseButton'] as ClassicPreset.InputControl<'number'> | undefined;
      const mb = mbS ? rv(mbS.nid, mbS.ok) : (mbC ? String(mbC.value ?? 0) : '0');
      lines.push(`{ if (!gameObject.__dragSelection) { var _DSC = __engine && __engine._DragSelectionComponent; if (_DSC) { gameObject.__dragSelection = new _DSC(); } else { console.warn('[DragSelection] DragSelectionComponent class not found on engine — drag selection will not work'); gameObject.__dragSelection = { enabled: true, mouseButton: 0, classFilter: [], selectionColor: 'rgba(0,120,215,0.25)', selectionBorderColor: 'rgba(0,120,215,0.8)', selectionBorderWidth: 1, selectionBorderStyle: 'solid', selectionBorderRadius: 0, selectionOpacity: 1, onSelectionComplete: null, _lastResult: null, isDragging: false, getSelectedCount: function(){ return this._lastResult ? this._lastResult.actors.length : 0; }, getSelectedActors: function(){ return this._lastResult ? this._lastResult.actors : []; }, getSelectedActorAt: function(i){ return this._lastResult ? (this._lastResult.actors[i] || null) : null; }, init: function(){}, destroy: function(){}, setClassFilter: function(c){ this.classFilter = Array.isArray(c) ? c : [c]; }, addClassFilter: function(c){ if (this.classFilter.indexOf(c) < 0) this.classFilter.push(c); }, clearClassFilter: function(){ this.classFilter = []; } }; } } if (gameObject.__dragSelection) { gameObject.__dragSelection.mouseButton = ${mb}; var _canvas = __engine && __engine._playCanvas; if (_canvas && typeof gameObject.__dragSelection.init === 'function') { gameObject.__dragSelection.init(_canvas, __scene, __engine); } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Disable Drag Selection': {
      lines.push(`{ if (gameObject.__dragSelection) { gameObject.__dragSelection.destroy(); gameObject.__dragSelection = null; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Drag Selection Enabled': {
      const enS = inputSrc.get(`${nodeId}.enabled`);
      const en = enS ? rv(enS.nid, enS.ok) : 'true';
      lines.push(`{ if (gameObject.__dragSelection) { gameObject.__dragSelection.enabled = ${en}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Drag Selection Class Filter': {
      const cnS = inputSrc.get(`${nodeId}.className`);
      const actorCtrl = node.controls['actorClass'] as any;
      // If the string pin is wired, use the dynamic value (with runtime lookup).
      // Otherwise, if the dropdown was used, the control value IS the actorAssetId.
      if (cnS) {
        const cn = rv(cnS.nid, cnS.ok);
        lines.push(`{ if (gameObject.__dragSelection) { var _cn = ${cn}; if (_cn && typeof _cn === 'string') { if (__scene) { var _a = __scene.gameObjects.find(function(g){return g.name === _cn || g.actorAssetId === _cn;}); gameObject.__dragSelection.setClassFilter(_a && _a.actorAssetId ? [_a.actorAssetId] : [_cn]); } else { gameObject.__dragSelection.setClassFilter([_cn]); } } else { gameObject.__dragSelection.setClassFilter([]); } } }`);
      } else if (actorCtrl && actorCtrl.value) {
        lines.push(`{ if (gameObject.__dragSelection) { gameObject.__dragSelection.setClassFilter(["${actorCtrl.value}"]); } }`);
      } else {
        lines.push(`{ if (gameObject.__dragSelection) { gameObject.__dragSelection.setClassFilter([]); } }`);
      }
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Drag Selection Class Filter': {
      const cnS = inputSrc.get(`${nodeId}.className`);
      const actorCtrl = node.controls['actorClass'] as any;
      if (cnS) {
        const cn = rv(cnS.nid, cnS.ok);
        lines.push(`{ if (gameObject.__dragSelection) { var _cn = ${cn}; if (__scene) { var _a = __scene.gameObjects.find(function(g){return g.name === _cn || g.actorAssetId === _cn;}); gameObject.__dragSelection.addClassFilter(_a && _a.actorAssetId ? _a.actorAssetId : _cn); } else { gameObject.__dragSelection.addClassFilter(_cn); } } }`);
      } else if (actorCtrl && actorCtrl.value) {
        lines.push(`{ if (gameObject.__dragSelection) { gameObject.__dragSelection.addClassFilter("${actorCtrl.value}"); } }`);
      }
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear Drag Selection Class Filter': {
      lines.push(`{ if (gameObject.__dragSelection) { gameObject.__dragSelection.clearClassFilter(); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Drag Selection Style': {
      const fcS = inputSrc.get(`${nodeId}.fillColor`);
      const bcS = inputSrc.get(`${nodeId}.borderColor`);
      const bwS = inputSrc.get(`${nodeId}.borderWidth`);
      const bsS = inputSrc.get(`${nodeId}.borderStyle`);
      const brS = inputSrc.get(`${nodeId}.borderRadius`);
      const opS = inputSrc.get(`${nodeId}.opacity`);
      const fc = fcS ? rv(fcS.nid, fcS.ok) : '"rgba(0, 120, 215, 0.25)"';
      const bc = bcS ? rv(bcS.nid, bcS.ok) : '"rgba(0, 120, 215, 0.8)"';
      const bw = bwS ? rv(bwS.nid, bwS.ok) : '1';
      const bs = bsS ? rv(bsS.nid, bsS.ok) : '"solid"';
      const br = brS ? rv(brS.nid, brS.ok) : '0';
      const op = opS ? rv(opS.nid, opS.ok) : '1';
      lines.push(`{ if (gameObject.__dragSelection) { var _ds = gameObject.__dragSelection; _ds.selectionColor = ${fc}; _ds.selectionBorderColor = ${bc}; _ds.selectionBorderWidth = ${bw}; _ds.selectionBorderStyle = ${bs}; _ds.selectionBorderRadius = ${br}; _ds.selectionOpacity = ${op}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
  }
  return lines;
}

// ============================================================
//  Full code generator
// ============================================================
function generateFullCode(
  eventEditor: NodeEditor<Schemes>,
  bp: import('./BlueprintData').BlueprintData,
  functionEditors: Map<string, NodeEditor<Schemes>>,
  isWidgetBlueprint: boolean = false,
  isAnimBlueprint: boolean = false,
): string {
  _isAnimBlueprint = isAnimBlueprint;
  const parts: string[] = [];

  // Variable declarations
  const varDecls: string[] = [];
  const varNames: string[] = [];
  for (const v of bp.variables) {
    const sName = sanitizeName(v.name);
    varDecls.push(`let __var_${sName} = ${varDefaultStr(v, bp)};`);
    varNames.push(`"${v.name}": __var_${sName}`);
  }
  if (varDecls.length > 0) parts.push(varDecls.join('\n'));
  parts.push(`function __getVars() { return { ${varNames.join(', ')} }; }`);

  // Function bodies
  for (const fn of bp.functions) {
    const fnEditor = functionEditors.get(fn.id);
    if (!fnEditor) continue;
    const { nodes, nodeMap, inputSrc, outputDst } = buildMaps(fnEditor);
    const entryNode = nodes.find(n => n instanceof FunctionEntryNode);
    if (!entryNode) continue;

    const params = fn.inputs.map(i => `__param_${sanitizeName(i.name)}`).join(', ');
    const localDecls: string[] = [];
    for (const lv of fn.localVariables) {
      localDecls.push(`  let __var_${sanitizeName(lv.name)} = ${varDefaultStr(lv, bp)};`);
    }
    const body = walkExec(entryNode.id, 'exec', nodeMap, inputSrc, outputDst, bp);
    const fnBody = [...localDecls, ...body.map(l => '  ' + l)].join('\n');
    parts.push(`function __fn_${sanitizeName(fn.name)}(${params}) {\n${fnBody}\n}`);
  }

  // Event graph lifecycle code
  const { nodes, nodeMap, inputSrc, outputDst } = buildMaps(eventEditor);

  // Custom event function bodies (placed in preamble so they're shared)
  const customEvtNodes = nodes.filter(n => n instanceof CustomEventNode);
  for (const evNode of customEvtNodes) {
    const ce = evNode as CustomEventNode;
    const name = sanitizeName(ce.eventName);
    const evt = bp.customEvents.find(e => e.id === ce.eventId);
    const params = evt && evt.params.length > 0
      ? evt.params.map(p => `__cev_param_${sanitizeName(p.name)}`).join(', ')
      : '';
    const body = walkExec(ce.id, 'exec', nodeMap, inputSrc, outputDst, bp);
    parts.push(`function __custom_evt_${name}(${params}) {\n${body.map(l => '  ' + l).join('\n')}\n}`);
  }

  // Input key event nodes & IsKeyDown nodes
  const inputKeyNodes = nodes.filter(n => n instanceof InputKeyEventNode) as InputKeyEventNode[];
  const isKeyDownNodes = nodes.filter(n => n instanceof IsKeyDownNode);
  const inputAxisNodes = nodes.filter(n => n instanceof InputAxisNode);
  const hasInputNodes = inputKeyNodes.length > 0 || isKeyDownNodes.length > 0 || inputAxisNodes.length > 0;
  if (hasInputNodes) {
    parts.push('var __inputKeys = {};');
    parts.push('var __inputCleanup = [];');
  }

  // ── Pre-declare stateful flow-control variables at factory (preamble) scope ──
  // Without `var`, the `typeof __xxx === 'undefined'` pattern inside lifecycle
  // closures would create implicit globals that persist across play sessions.
  // Declaring them here ensures they're factory-scoped and properly reset on recompile.
  for (const n of nodes) {
    const uid = n.id.replace(/[^a-zA-Z0-9]/g, '_');
    if (n instanceof DoOnceNode)            parts.push(`var __doOnce_${uid};`);
    if (n instanceof FlipFlopNode)          parts.push(`var __flipFlop_${uid};`);
    if (n instanceof DoNNode)               parts.push(`var __doN_ctr_${uid};`);
    if (n instanceof GateNode)              parts.push(`var __gate_${uid};`);
    if (n instanceof MultiGateNode)         parts.push(`var __mg_idx_${uid}; var __mg_done_${uid};`);
  }

  // Collect lifecycle code
  const beginPlayCode: string[] = [];
  const tickCode: string[] = [];
  const onDestroyCode: string[] = [];

  const bpEvts = nodes.filter(n => n.label === 'Event BeginPlay');
  for (const ev of bpEvts) beginPlayCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));
  const tkEvts = nodes.filter(n => n.label === 'Event Tick' || n.label === 'Anim Update Event' || n.label === 'Anim Update 2D');
  for (const ev of tkEvts) tickCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));
  const odEvts = nodes.filter(n => n.label === 'Event OnDestroy');
  for (const ev of odEvts) onDestroyCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));

  // ── AI Task lifecycle events (mapped to standard lifecycles) ──
  // AI Receive Execute / Service Activated / Observer Activated / On Possess → beginPlay
  const aiBeginEvts = nodes.filter(n =>
    n instanceof AIReceiveExecuteNode || n instanceof AIServiceActivatedNode ||
    n instanceof AIObserverActivatedNode || n instanceof OnPossessNode
  );
  for (const ev of aiBeginEvts) beginPlayCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));

  // AI Receive Tick / Service Tick / Condition Check / On Move Completed / On Perception → tick
  const aiTickEvts = nodes.filter(n =>
    n instanceof AIReceiveTickNode || n instanceof AIServiceTickNode ||
    n instanceof AIPerformConditionCheckNode || n instanceof OnPerceptionUpdatedNode
  );
  for (const ev of aiTickEvts) tickCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));

  // On Move Completed — poll each tick: fire when AI state transitions to idle
  const onMoveCompletedEvts = nodes.filter(n => n instanceof OnMoveCompletedNode);
  if (onMoveCompletedEvts.length > 0) {
    parts.push('var __omc_prevState = "idle";');
    for (const ev of onMoveCompletedEvts) {
      const body = walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length) {
        tickCode.push(`{ var _aiS = gameObject.aiController ? gameObject.aiController.state : 'idle'; if (__omc_prevState !== 'idle' && _aiS === 'idle') { ${body.join(' ')} } __omc_prevState = _aiS; }`);
      }
    }
  }

  // AI Receive Abort / Service Deactivated / Observer Deactivated / On Unpossess → onDestroy
  const aiEndEvts = nodes.filter(n =>
    n instanceof AIReceiveAbortNode || n instanceof AIServiceDeactivatedNode ||
    n instanceof AIObserverDeactivatedNode || n instanceof OnUnpossessNode
  );
  for (const ev of aiEndEvts) onDestroyCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));

  // Input Action/Axis Mapping Events (polled in Tick)
  const inputActionNodes = nodes.filter(n => n instanceof InputActionMappingEventNode) as InputActionMappingEventNode[];
  for (const iaNode of inputActionNodes) {
    const ctrl = iaNode.controls['action'] as ActionMappingSelectControl | undefined;
    const action = ctrl?.value ?? iaNode.selectedAction;
    const pressedBody = walkExec(iaNode.id, 'pressed', nodeMap, inputSrc, outputDst, bp);
    const releasedBody = walkExec(iaNode.id, 'released', nodeMap, inputSrc, outputDst, bp);
    if (pressedBody.length) {
      tickCode.push(`if (__engine && __engine.input && __engine.input.isActionJustPressed(${JSON.stringify(action)})) { ${pressedBody.join(' ')} }`);
    }
    if (releasedBody.length) {
      tickCode.push(`if (__engine && __engine.input && __engine.input.isActionJustReleased(${JSON.stringify(action)})) { ${releasedBody.join(' ')} }`);
    }
  }

  const inputAxisMappingNodes = nodes.filter(n => n instanceof InputAxisMappingEventNode) as InputAxisMappingEventNode[];
  for (const iaxNode of inputAxisMappingNodes) {
    const ctrl = iaxNode.controls['axis'] as AxisMappingSelectControl | undefined;
    const axis = ctrl?.value ?? iaxNode.selectedAxis;
    const execBody = walkExec(iaxNode.id, 'exec', nodeMap, inputSrc, outputDst, bp);
    if (execBody.length) {
      tickCode.push(`if (__engine && __engine.input) { var __axis_${iaxNode.id.replace(/[^a-zA-Z0-9]/g, '_')} = __engine.input.getAxis(${JSON.stringify(axis)}); ${execBody.join(' ')} }`);
    }
  }

  // Input key event listeners — inject into beginPlay & onDestroy
  if (hasInputNodes) {
    // Global key state tracking for IsKeyDown polling (keyboard + mouse buttons)
    beginPlayCode.push('var __kd_global = function(e) { __inputKeys[e.key] = true; };');
    beginPlayCode.push('var __ku_global = function(e) { __inputKeys[e.key] = false; };');
    beginPlayCode.push('document.addEventListener("keydown", __kd_global);');
    beginPlayCode.push('document.addEventListener("keyup", __ku_global);');
    beginPlayCode.push('var __md_global = function(e) { __inputKeys["__mouse" + e.button] = true; };');
    beginPlayCode.push('var __mu_global = function(e) { __inputKeys["__mouse" + e.button] = false; };');
    beginPlayCode.push('document.addEventListener("mousedown", __md_global);');
    beginPlayCode.push('document.addEventListener("mouseup", __mu_global);');
    beginPlayCode.push('__inputCleanup.push(function() { document.removeEventListener("keydown", __kd_global); document.removeEventListener("keyup", __ku_global); document.removeEventListener("mousedown", __md_global); document.removeEventListener("mouseup", __mu_global); });');

    // Per InputKeyEventNode listeners
    for (const ikNode of inputKeyNodes) {
      const keyCtrl = ikNode.controls['key'] as KeySelectControl | undefined;
      const key = keyCtrl?.value ?? ikNode.selectedKey;
      const kc = keyEventCode(key);
      const itype = inputType(key);
      const pressedBody = walkExec(ikNode.id, 'pressed', nodeMap, inputSrc, outputDst, bp);
      const releasedBody = walkExec(ikNode.id, 'released', nodeMap, inputSrc, outputDst, bp);

      if (itype === 'keyboard') {
        if (pressedBody.length) {
          beginPlayCode.push(`(function() { var _kd = function(e) { if (e.key === ${JSON.stringify(kc)}) { ${pressedBody.join(' ')} } }; document.addEventListener("keydown", _kd); __inputCleanup.push(function() { document.removeEventListener("keydown", _kd); }); })();`);
        }
        if (releasedBody.length) {
          beginPlayCode.push(`(function() { var _ku = function(e) { if (e.key === ${JSON.stringify(kc)}) { ${releasedBody.join(' ')} } }; document.addEventListener("keyup", _ku); __inputCleanup.push(function() { document.removeEventListener("keyup", _ku); }); })();`);
        }
      } else if (itype === 'mouse') {
        if (pressedBody.length) {
          beginPlayCode.push(`(function() { var _md = function(e) { if (e.button === ${kc}) { ${pressedBody.join(' ')} } }; document.addEventListener("mousedown", _md); __inputCleanup.push(function() { document.removeEventListener("mousedown", _md); }); })();`);
        }
        if (releasedBody.length) {
          beginPlayCode.push(`(function() { var _mu = function(e) { if (e.button === ${kc}) { ${releasedBody.join(' ')} } }; document.addEventListener("mouseup", _mu); __inputCleanup.push(function() { document.removeEventListener("mouseup", _mu); }); })();`);
        }
      } else if (itype === 'wheel') {
        // Wheel: "pressed" fires on scroll in that direction, "released" not applicable but supported
        const dir = kc === 'up' ? '< 0' : '> 0';
        if (pressedBody.length) {
          beginPlayCode.push(`(function() { var _wh = function(e) { if (e.deltaY ${dir}) { ${pressedBody.join(' ')} } }; document.addEventListener("wheel", _wh); __inputCleanup.push(function() { document.removeEventListener("wheel", _wh); }); })();`);
        }
        if (releasedBody.length) {
          beginPlayCode.push(`(function() { var _wh2 = function(e) { if (e.deltaY ${dir}) { ${releasedBody.join(' ')} } }; document.addEventListener("wheel", _wh2); __inputCleanup.push(function() { document.removeEventListener("wheel", _wh2); }); })();`);
        }
      } else if (itype === 'gamepad') {
        if (pressedBody.length) {
          tickCode.push(`if (__engine && __engine.input && __engine.input.isKeyJustPressed(${JSON.stringify(kc)})) { ${pressedBody.join(' ')} }`);
        }
        if (releasedBody.length) {
          tickCode.push(`if (__engine && __engine.input && __engine.input.isKeyJustReleased(${JSON.stringify(kc)})) { ${releasedBody.join(' ')} }`);
        }
      }
    }

    // Cleanup in onDestroy
    onDestroyCode.push('__inputCleanup.forEach(function(fn) { fn(); }); __inputCleanup = []; __inputKeys = {};');
  }

  // ── OnEvent / EmitEvent (EventBus) nodes ────────────────────
  const onEventNodes = nodes.filter(n => n instanceof OnEventNode) as InstanceType<typeof OnEventNode>[];
  if (onEventNodes.length > 0) {
    // Declare cleanup array at preamble (factory) scope so both __bp and __od can access it
    parts.push('var __eventBusCleanup = [];');
    // Reset the array each beginPlay so handlers from previous sessions are not re-cleaned
    beginPlayCode.push('__eventBusCleanup = [];');
    for (const evNode of onEventNodes) {
      const eventId = (evNode.controls.eventId as any)?.value;
      let eventName = '';
      if (eventId) {
        const mgr = EventAssetManager.getInstance();
        const eventAsset = mgr?.getAsset(eventId);
        if (eventAsset) eventName = eventAsset.name;
      }
      if (!eventName) continue;
      const body = walkExec(evNode.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length === 0) continue;
      const safeId = evNode.id.replace(/[^a-zA-Z0-9]/g, '_');
      beginPlayCode.push(`(function() { var __evtHandler_${safeId} = function(__payload) { ${body.join(' ')} }; if (__engine && __engine.eventBus) { __engine.eventBus.on(${JSON.stringify(eventName)}, __evtHandler_${safeId}); __eventBusCleanup.push(function() { __engine.eventBus.off(${JSON.stringify(eventName)}, __evtHandler_${safeId}); }); } })();`);
    }
    // Cleanup in onDestroy
    onDestroyCode.push('__eventBusCleanup.forEach(function(fn) { fn(); }); __eventBusCleanup = [];');
  }

  // ── Drag Selection Complete event nodes ─────────────────────
  const dragSelCompleteNodes = nodes.filter(n => n.label === 'On Drag Selection Complete');
  if (dragSelCompleteNodes.length > 0) {
    for (const dsEvt of dragSelCompleteNodes) {
      const body = walkExec(dsEvt.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        // Wire the onSelectionComplete callback — the DragSelectionComponent
        // will call this when a drag selection finishes.
        beginPlayCode.push(`(function() { var __ds_cb_${dsEvt.id.replace(/[^a-zA-Z0-9]/g,'_')} = function(__dsResult) { var __dragSelectedActors = __dsResult ? __dsResult.actors : []; var __dragSelectedCount = __dragSelectedActors.length; ${body.join(' ')} }; if (!gameObject.__dragSelCallbacks) gameObject.__dragSelCallbacks = []; gameObject.__dragSelCallbacks.push(__ds_cb_${dsEvt.id.replace(/[^a-zA-Z0-9]/g,'_')}); })();`);
      }
    }
    // In beginPlay, wire callbacks to the component when it's initialised
    beginPlayCode.push(`(function() { var _wireDSCB = function() { if (gameObject.__dragSelection && gameObject.__dragSelCallbacks) { gameObject.__dragSelection.onSelectionComplete = function(result) { for (var _ci = 0; _ci < gameObject.__dragSelCallbacks.length; _ci++) { gameObject.__dragSelCallbacks[_ci](result); } }; } }; _wireDSCB(); var _origInit = gameObject.__origDSInit; if (!_origInit) { gameObject.__origDSInit = true; var _intv = setInterval(function() { if (gameObject.__dragSelection) { _wireDSCB(); clearInterval(_intv); } }, 100); __inputCleanup = __inputCleanup || []; __inputCleanup.push(function() { clearInterval(_intv); }); } })();`);
    // Cleanup drag selection on destroy
    onDestroyCode.push('if (gameObject.__dragSelection) { gameObject.__dragSelection.destroy(); gameObject.__dragSelection = null; }');
  }

  // ── 2D Collision / Trigger / Animation event nodes ──────────
  const collBegin2D = nodes.filter(n => n.label === 'On Collision Begin 2D');
  const collEnd2D = nodes.filter(n => n.label === 'On Collision End 2D');
  const trigBegin2D = nodes.filter(n => n.label === 'On Trigger Begin 2D');
  const trigEnd2D = nodes.filter(n => n.label === 'On Trigger End 2D');
  const animEvent2D = nodes.filter(n => n.label === 'On Animation Event 2D');
  const animFinished2D = nodes.filter(n => n.label === 'On Animation Finished 2D');
  const has2DEvents = collBegin2D.length > 0 || collEnd2D.length > 0 || trigBegin2D.length > 0 || trigEnd2D.length > 0 || animEvent2D.length > 0 || animFinished2D.length > 0;

  if (has2DEvents) {
    // Register listeners via SpriteActor.on()
    for (const n of collBegin2D) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`if (gameObject.on) { gameObject.on('collisionBegin2D', function(__evt) { var __otherActor = __evt.otherActor || null; var __otherActorName = __evt.otherName || ''; var __otherActorId = (__evt.otherActor && __evt.otherActor.id) || 0; var __selfComponentName = __evt.selfComponentName || ''; var __normalX = __evt.normalX || 0; var __normalY = __evt.normalY || 0; ${body.join(' ')} }); }`);
      }
    }
    for (const n of collEnd2D) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`if (gameObject.on) { gameObject.on('collisionEnd2D', function(__evt) { var __otherActor = __evt.otherActor || null; var __otherActorName = __evt.otherName || ''; var __otherActorId = (__evt.otherActor && __evt.otherActor.id) || 0; var __selfComponentName = __evt.selfComponentName || ''; ${body.join(' ')} }); }`);
      }
    }
    for (const n of trigBegin2D) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`if (gameObject.on) { gameObject.on('triggerBegin2D', function(__evt) { var __otherActor = __evt.otherActor || null; var __otherActorName = __evt.otherName || ''; var __otherActorId = (__evt.otherActor && __evt.otherActor.id) || 0; var __selfComponentName = __evt.selfComponentName || ''; ${body.join(' ')} }); }`);
      }
    }
    for (const n of trigEnd2D) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`if (gameObject.on) { gameObject.on('triggerEnd2D', function(__evt) { var __otherActor = __evt.otherActor || null; var __otherActorName = __evt.otherName || ''; var __otherActorId = (__evt.otherActor && __evt.otherActor.id) || 0; var __selfComponentName = __evt.selfComponentName || ''; ${body.join(' ')} }); }`);;
      }
    }
    for (const n of animEvent2D) {
      const evNameCtrl = n.controls['eventNameCtrl'] as any;
      const evNameStr = evNameCtrl?.value ?? '';
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        if (evNameStr) {
          beginPlayCode.push(`if (gameObject.on) { gameObject.on('animEvent_${evNameStr}', function(__evt) { var __animName = __evt && __evt.animName || ''; var __frame = __evt && __evt.frame || 0; ${body.join(' ')} }); }`);
        } else {
          beginPlayCode.push(`if (gameObject.on) { gameObject.on('animEvent', function(__evt) { var __animName = __evt && __evt.animName || ''; var __frame = __evt && __evt.frame || 0; ${body.join(' ')} }); }`);
        }
      }
    }
    for (const n of animFinished2D) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`if (gameObject.on) { gameObject.on('animFinished', function(__evt) { var __animName = __evt && __evt.animName || ''; ${body.join(' ')} }); }`);
      }
    }
  }

  // ── Collision / Trigger event nodes ─────────────────────────
  const triggerBeginNodes = nodes.filter(n => n instanceof OnTriggerBeginOverlapNode);
  const triggerEndNodes = nodes.filter(n => n instanceof OnTriggerEndOverlapNode);
  const actorBeginNodes = nodes.filter(n => n instanceof OnActorBeginOverlapNode);
  const actorEndNodes = nodes.filter(n => n instanceof OnActorEndOverlapNode);
  const collisionHitNodes = nodes.filter(n => n instanceof OnCollisionHitNode);
  // UE-style per-component bound overlap events
  const boundBeginNodes = nodes.filter(n => n instanceof OnTriggerComponentBeginOverlapNode) as OnTriggerComponentBeginOverlapNode[];
  const boundEndNodes   = nodes.filter(n => n instanceof OnTriggerComponentEndOverlapNode)   as OnTriggerComponentEndOverlapNode[];
  const hasCollisionEvents = triggerBeginNodes.length > 0 || triggerEndNodes.length > 0 ||
    actorBeginNodes.length > 0 || actorEndNodes.length > 0 || collisionHitNodes.length > 0 ||
    boundBeginNodes.length > 0 || boundEndNodes.length > 0;

  if (hasCollisionEvents) {
    beginPlayCode.push('var __collCb = __physics.collision.registerCallbacks(gameObject.id);');

    // UE-style bound Begin Overlap — filter by selfComponentName
    for (const n of boundBeginNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onBeginOverlap.push(function(__ovEvt) { if (__ovEvt.selfComponentName !== ${JSON.stringify(n.compName)}) return; var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; ${body.join(' ')} });`);
      }
    }
    // UE-style bound End Overlap — filter by selfComponentName
    for (const n of boundEndNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onEndOverlap.push(function(__ovEvt) { if (__ovEvt.selfComponentName !== ${JSON.stringify(n.compName)}) return; var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; ${body.join(' ')} });`);
      }
    }

    // Generic trigger overlap events (fire for ANY trigger)
    for (const n of triggerBeginNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onBeginOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; var __selfComponent = __ovEvt.selfComponentName; ${body.join(' ')} });`);
      }
    }
    for (const n of triggerEndNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onEndOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; var __selfComponent = __ovEvt.selfComponentName; ${body.join(' ')} });`);
      }
    }
    for (const n of actorBeginNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onBeginOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; ${body.join(' ')} });`);
      }
    }
    for (const n of actorEndNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onEndOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; ${body.join(' ')} });`);
      }
    }
    for (const n of collisionHitNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onHit.push(function(__hitEvt) { var __otherActorName = __hitEvt.otherActorName; var __otherActorId = __hitEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; var __selfComponent = __hitEvt.selfComponentName; var __impactX = __hitEvt.impactPoint ? __hitEvt.impactPoint.x : 0; var __impactY = __hitEvt.impactPoint ? __hitEvt.impactPoint.y : 0; var __impactZ = __hitEvt.impactPoint ? __hitEvt.impactPoint.z : 0; var __normalX = __hitEvt.impactNormal ? __hitEvt.impactNormal.x : 0; var __normalY = __hitEvt.impactNormal ? __hitEvt.impactNormal.y : 0; var __normalZ = __hitEvt.impactNormal ? __hitEvt.impactNormal.z : 0; var __velX = __hitEvt.hitVelocity ? __hitEvt.hitVelocity.x : 0; var __velY = __hitEvt.hitVelocity ? __hitEvt.hitVelocity.y : 0; var __velZ = __hitEvt.hitVelocity ? __hitEvt.hitVelocity.z : 0; var __impulse = __hitEvt.impulse || 0; ${body.join(' ')} });`);
      }
    }
  }

  // ── Widget Event Nodes (ButtonOnClicked, etc.) ─────────────
  const buttonClickedNodes = nodes.filter(n => n instanceof ButtonOnClickedNode) as ButtonOnClickedNode[];
  const buttonPressedNodes = nodes.filter(n => n instanceof ButtonOnPressedNode) as ButtonOnPressedNode[];
  const buttonReleasedNodes = nodes.filter(n => n instanceof ButtonOnReleasedNode) as ButtonOnReleasedNode[];
  const buttonHoveredNodes = nodes.filter(n => n instanceof ButtonOnHoveredNode) as ButtonOnHoveredNode[];
  const buttonUnhoveredNodes = nodes.filter(n => n instanceof ButtonOnUnhoveredNode) as ButtonOnUnhoveredNode[];
  const textBoxChangedNodes = nodes.filter(n => n instanceof TextBoxOnTextChangedNode) as TextBoxOnTextChangedNode[];
  const textBoxCommittedNodes = nodes.filter(n => n instanceof TextBoxOnTextCommittedNode) as TextBoxOnTextCommittedNode[];
  const sliderChangedNodes = nodes.filter(n => n instanceof SliderOnValueChangedNode) as SliderOnValueChangedNode[];
  const checkBoxChangedNodes = nodes.filter(n => n instanceof CheckBoxOnCheckStateChangedNode) as CheckBoxOnCheckStateChangedNode[];

  const hasWidgetEvents = buttonClickedNodes.length > 0 || buttonPressedNodes.length > 0 ||
    buttonReleasedNodes.length > 0 || buttonHoveredNodes.length > 0 || buttonUnhoveredNodes.length > 0 ||
    textBoxChangedNodes.length > 0 || textBoxCommittedNodes.length > 0 ||
    sliderChangedNodes.length > 0 || checkBoxChangedNodes.length > 0;

  if (hasWidgetEvents) {
    // For Widget Blueprints: generate a setup function that registers event handlers
    // This function is called from UIManager.createWidget() with the widget handle
    parts.push('function __setupWidgetEvents(__widgetHandle, __uiManager) {');

    for (const n of buttonClickedNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnClicked", function() { ${body.join(' ')} });`);
      }
    }

    for (const n of buttonPressedNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnPressed", function() { ${body.join(' ')} });`);
      }
    }

    for (const n of buttonReleasedNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnReleased", function() { ${body.join(' ')} });`);
      }
    }

    for (const n of buttonHoveredNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnHovered", function() { ${body.join(' ')} });`);
      }
    }

    for (const n of buttonUnhoveredNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnUnhovered", function() { ${body.join(' ')} });`);
      }
    }

    for (const n of textBoxChangedNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnTextChanged", function(__text) { ${body.join(' ')} });`);
      }
    }

    for (const n of textBoxCommittedNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnTextCommitted", function(__text) { ${body.join(' ')} });`);
      }
    }

    for (const n of sliderChangedNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnValueChanged", function(__value) { ${body.join(' ')} });`);
      }
    }

    for (const n of checkBoxChangedNodes) {
      const widgetName = n.getWidgetName();
      if (!widgetName) continue;
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        parts.push(`  __uiManager.registerEventHandler(__widgetHandle, ${JSON.stringify(widgetName)}, "OnCheckStateChanged", function(__isChecked) { ${body.join(' ')} });`);
      }
    }

    parts.push('}');
  }

  // For Actor Blueprints: Expose functions & variables on gameObject for remote access
  // For Widget Blueprints: Skip this section (no gameObject in widget context)
  // For Anim Blueprints: Skip _scriptVars/_scriptFunctions/_scriptEvents export to avoid
  //   overwriting the pawn's own variables (gameObject IS the pawn in AnimBP context)
  if (!isWidgetBlueprint && !isAnimBlueprint) {
    if (bp.functions.length > 0) {
      const fnExports: string[] = [];
      for (const fn of bp.functions) {
        fnExports.push(`${JSON.stringify(fn.name)}: __fn_${sanitizeName(fn.name)}`);
      }
      beginPlayCode.push(`if (!gameObject._scriptFunctions) gameObject._scriptFunctions = {};`);
      beginPlayCode.push(`Object.assign(gameObject._scriptFunctions, { ${fnExports.join(', ')} });`);
    }
    if (bp.variables.length > 0) {
      beginPlayCode.push(`if (!gameObject._scriptVars) gameObject._scriptVars = {};`);
      for (const v of bp.variables) {
        beginPlayCode.push(`gameObject._scriptVars[${JSON.stringify(v.name)}] = __var_${sanitizeName(v.name)};`);
      }
    }
    if (bp.customEvents.length > 0) {
      beginPlayCode.push(`if (!gameObject._scriptEvents) gameObject._scriptEvents = {};`);
      for (const evt of bp.customEvents) {
        beginPlayCode.push(`gameObject._scriptEvents[${JSON.stringify(evt.name)}] = __custom_evt_${sanitizeName(evt.name)};`);
      }
    }

    const sections: string[] = [];
    if (beginPlayCode.length) sections.push(`// __beginPlay__\n${beginPlayCode.join('\n')}`);
    if (tickCode.length) sections.push(`// __tick__\n${tickCode.join('\n')}`);
    if (onDestroyCode.length) sections.push(`// __onDestroy__\n${onDestroyCode.join('\n')}`);
    if (sections.length) parts.push(sections.join('\n'));
  }

  // For Animation Blueprints: Variables live in the AnimBP's own closure,
  // NOT on the pawn's _scriptVars. The AnimBP can read the pawn's variables
  // via CastTo → GetActorVariable (which reads pawn._scriptVars correctly).
  if (isAnimBlueprint) {
    const sections: string[] = [];
    if (beginPlayCode.length) sections.push(`// __beginPlay__\n${beginPlayCode.join('\n')}`);
    if (tickCode.length) sections.push(`// __tick__\n${tickCode.join('\n')}`);
    if (onDestroyCode.length) sections.push(`// __onDestroy__\n${onDestroyCode.join('\n')}`);
    if (sections.length) parts.push(sections.join('\n'));
  }

  // For Widget Blueprints: also emit lifecycle sections so that EventBus
  // listeners, input handlers, etc. registered during beginPlay are active.
  if (isWidgetBlueprint) {
    const sections: string[] = [];
    if (beginPlayCode.length) sections.push(`// __beginPlay__\n${beginPlayCode.join('\n')}`);
    if (tickCode.length) sections.push(`// __tick__\n${tickCode.join('\n')}`);
    if (onDestroyCode.length) sections.push(`// __onDestroy__\n${onDestroyCode.join('\n')}`);
    if (sections.length) parts.push(sections.join('\n'));
  }

  _isAnimBlueprint = false;
  return parts.join('\n');
}

// ============================================================
//  "My Blueprint" Sidebar Builder
// ============================================================
function buildMyBlueprintPanel(
  container: HTMLElement,
  bp: import('./BlueprintData').BlueprintData,
  callbacks: {
    onSwitchGraph: (tab: GraphTab) => void;
    onAddVariable: () => void;
    onAddFunction: () => void;
    onAddMacro: () => void;
    onAddCustomEvent: () => void;
    onAddLocalVariable: (funcId: string) => void;
    onAddStruct: () => void;
    onDeleteVariable: (id: string) => void;
    onDeleteFunction: (id: string) => void;
    onDeleteMacro: (id: string) => void;
    onDeleteCustomEvent: (id: string) => void;
    onDeleteLocalVariable: (funcId: string, varId: string) => void;
    onDeleteStruct: (id: string) => void;
    onEditVariable: (v: BlueprintVariable) => void;
    onEditStruct: (s: BlueprintStruct) => void;
    onEditFunction: (fn: BlueprintFunction) => void;
    onEditCustomEvent: (evt: BlueprintCustomEvent) => void;
    activeGraphId: string;
    graphTabs: GraphTab[];
  },
): void {
  container.innerHTML = '';
  container.className = 'my-blueprint-panel';

  // Title
  const title = document.createElement('div');
  title.className = 'mybp-title';
  title.textContent = 'MY BLUEPRINT';
  container.appendChild(title);

  // --- Graphs ---
  const graphBody = addSection(container, 'Graphs', null);
  for (const tab of callbacks.graphTabs) {
    const item = document.createElement('div');
    item.className = 'mybp-item' + (tab.id === callbacks.activeGraphId ? ' active' : '');
    const icon = tab.type === 'event' ? iconHTML(Icons.Zap, 'xs', ICON_COLORS.warning) : tab.type === 'function' ? iconHTML(Icons.Code, 'xs', ICON_COLORS.blueprint) : iconHTML(Icons.Diamond, 'xs');
    item.innerHTML = `<span class="mybp-item-icon">${icon}</span><span>${tab.label}</span>`;
    item.addEventListener('click', () => callbacks.onSwitchGraph(tab));
    graphBody.appendChild(item);
  }

  // --- Functions ---
  const fnBody = addSection(container, 'Functions', callbacks.onAddFunction);
  for (const fn of bp.functions) {
    const fnItem = makeDeletableItem(fn.name, iconHTML(Icons.Code, 'xs', ICON_COLORS.blueprint), 'mybp-fn',
      () => callbacks.onSwitchGraph({ id: fn.id, label: fn.name, type: 'function', refId: fn.id }),
      () => callbacks.onDeleteFunction(fn.id),
      { dragType: 'function', funcId: fn.id, funcName: fn.name, inputs: JSON.stringify(fn.inputs), outputs: JSON.stringify(fn.outputs) },
    );
    // Add edit button for parameters (insert before delete in the actions container)
    const actionsEl = fnItem.querySelector('.mybp-item-actions')!;
    const editBtn = document.createElement('span');
    editBtn.className = 'mybp-edit-btn';
    editBtn.innerHTML = iconHTML(Icons.Settings, 'xs', ICON_COLORS.muted);
    editBtn.title = 'Edit Parameters';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onEditFunction(fn); });
    actionsEl.insertBefore(editBtn, actionsEl.firstChild);
    fnBody.appendChild(fnItem);
  }

  // --- Macros ---
  const macroBody = addSection(container, 'Macros', callbacks.onAddMacro);
  for (const m of bp.macros) {
    macroBody.appendChild(makeDeletableItem(m.name, iconHTML(Icons.Diamond, 'xs', ICON_COLORS.secondary), 'mybp-macro',
      () => callbacks.onSwitchGraph({ id: m.id, label: m.name, type: 'macro', refId: m.id }),
      () => callbacks.onDeleteMacro(m.id),
      { dragType: 'macro', macroId: m.id, macroName: m.name },
    ));
  }

  // --- Variables ---
  const varBody = addSection(container, 'Variables', callbacks.onAddVariable);
  for (const v of bp.variables) {
    const item = document.createElement('div');
    item.className = 'mybp-item mybp-var';
    item.draggable = true;

    const dot = document.createElement('span');
    dot.className = `mybp-var-dot ${typeDotClass(v.type)}`;
    item.appendChild(dot);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'mybp-var-name';
    nameSpan.textContent = v.name;
    item.appendChild(nameSpan);

    const typeSpan = document.createElement('span');
    typeSpan.className = 'mybp-var-type';
    typeSpan.textContent = typeDisplayName(v.type, bp);
    item.appendChild(typeSpan);

    const actions = document.createElement('span');
    actions.className = 'mybp-item-actions';
    const del = document.createElement('span');
    del.className = 'mybp-delete';
    del.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
    del.title = 'Delete';
    del.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onDeleteVariable(v.id); });
    actions.appendChild(del);
    item.appendChild(actions);

    item.addEventListener('click', () => callbacks.onEditVariable(v));
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData('text/plain', JSON.stringify({ varId: v.id, varName: v.name, varType: v.type }));
    });

    varBody.appendChild(item);
  }

  // --- Local Variables (when viewing a function graph) ---
  const activeTab = callbacks.graphTabs.find(t => t.id === callbacks.activeGraphId);
  if (activeTab && activeTab.type === 'function' && activeTab.refId) {
    const fn = bp.getFunction(activeTab.refId);
    if (fn) {
      const localBody = addSection(container, 'Local Variables', () => callbacks.onAddLocalVariable(fn.id));
      for (const lv of fn.localVariables) {
        const item = document.createElement('div');
        item.className = 'mybp-item mybp-var mybp-local-var';
        item.draggable = true;

        const dot = document.createElement('span');
        dot.className = `mybp-var-dot ${typeDotClass(lv.type)}`;
        item.appendChild(dot);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'mybp-var-name';
        nameSpan.textContent = lv.name;
        item.appendChild(nameSpan);

        const typeSpan = document.createElement('span');
        typeSpan.className = 'mybp-var-type';
        typeSpan.textContent = `${typeDisplayName(lv.type, bp)} (local)`;
        item.appendChild(typeSpan);

        const actions = document.createElement('span');
        actions.className = 'mybp-item-actions';
        const del = document.createElement('span');
        del.className = 'mybp-delete';
        del.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
        del.title = 'Delete';
        del.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onDeleteLocalVariable(fn.id, lv.id); });
        actions.appendChild(del);
        item.appendChild(actions);

        item.addEventListener('click', () => callbacks.onEditVariable(lv));
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer!.setData('text/plain', JSON.stringify({ varId: lv.id, varName: lv.name, varType: lv.type, isLocal: true, funcId: fn.id }));
        });

        localBody.appendChild(item);
      }
    }
  }

  // --- Custom Events ---
  const evtBody = addSection(container, 'Custom Events', callbacks.onAddCustomEvent);
  for (const evt of bp.customEvents) {
    const evtItem = makeDeletableItem(evt.name, iconHTML(Icons.Circle, 'xs', ICON_COLORS.secondary), 'mybp-evt',
      () => callbacks.onSwitchGraph(callbacks.graphTabs[0]),
      () => callbacks.onDeleteCustomEvent(evt.id),
      { dragType: 'customEvent', eventId: evt.id, eventName: evt.name, params: JSON.stringify(evt.params) },
    );
    // Add edit button for parameters (insert before delete in the actions container)
    const actionsEl = evtItem.querySelector('.mybp-item-actions')!;
    const editBtn = document.createElement('span');
    editBtn.className = 'mybp-edit-btn';
    editBtn.innerHTML = iconHTML(Icons.Settings, 'xs', ICON_COLORS.muted);
    editBtn.title = 'Edit Parameters';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onEditCustomEvent(evt); });
    actionsEl.insertBefore(editBtn, actionsEl.firstChild);
    evtBody.appendChild(evtItem);
  }

  // --- Structs ---
  const structBody = addSection(container, 'Structs', callbacks.onAddStruct);
  for (const s of bp.structs) {
    const item = document.createElement('div');
    item.className = 'mybp-item mybp-struct';

    const sIcon = document.createElement('span');
    sIcon.className = 'mybp-item-icon';
    sIcon.innerHTML = iconHTML(Icons.Diamond, 12, ICON_COLORS.blue);
    item.appendChild(sIcon);

    const sName = document.createElement('span');
    sName.className = 'mybp-item-name';
    sName.textContent = s.name;
    item.appendChild(sName);

    const sType = document.createElement('span');
    sType.className = 'mybp-var-type';
    sType.textContent = `${s.fields.length} fields`;
    item.appendChild(sType);

    const actions = document.createElement('span');
    actions.className = 'mybp-item-actions';
    const del = document.createElement('span');
    del.className = 'mybp-delete';
    del.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
    del.title = 'Delete';
    del.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onDeleteStruct(s.id); });
    actions.appendChild(del);
    item.appendChild(actions);
    item.addEventListener('click', () => callbacks.onEditStruct(s));
    structBody.appendChild(item);
  }
}

function addSection(parent: HTMLElement, title: string, onAdd: (() => void) | null): HTMLElement {
  const section = document.createElement('div');
  section.className = 'mybp-section';
  const header = document.createElement('div');
  header.className = 'mybp-section-header';
  const span = document.createElement('span');
  span.textContent = title;
  header.appendChild(span);
  if (onAdd) {
    const btn = document.createElement('span');
    btn.className = 'mybp-add-btn';
    btn.textContent = '+';
    btn.title = `Add ${title.slice(0, -1)}`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onAdd(); });
    header.appendChild(btn);
  }
  section.appendChild(header);
  const body = document.createElement('div');
  body.className = 'mybp-section-body';
  section.appendChild(body);
  parent.appendChild(section);
  return body;
}

function makeDeletableItem(
  name: string, icon: string, cls: string,
  onClick: () => void, onDelete: () => void,
  dragData?: Record<string, any>,
): HTMLElement {
  const item = document.createElement('div');
  item.className = `mybp-item ${cls}`;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'mybp-item-icon';
  iconSpan.innerHTML = icon;
  item.appendChild(iconSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'mybp-item-name';
  nameSpan.textContent = name;
  item.appendChild(nameSpan);

  // Actions container (right side)
  const actions = document.createElement('span');
  actions.className = 'mybp-item-actions';
  item.appendChild(actions);

  const del = document.createElement('span');
  del.className = 'mybp-delete';
  del.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
  del.title = 'Delete';
  del.addEventListener('click', (e) => { e.stopPropagation(); onDelete(); });
  actions.appendChild(del);

  item.addEventListener('click', onClick);
  if (dragData) {
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData('text/plain', JSON.stringify(dragData));
    });
  }
  return item;
}

// ============================================================
//  Graph Tab Bar
// ============================================================
function buildGraphTabBar(
  container: HTMLElement, tabs: GraphTab[], activeId: string,
  onSwitch: (tab: GraphTab) => void,
): void {
  container.innerHTML = '';
  container.className = 'graph-tab-bar';
  for (const tab of tabs) {
    const btn = document.createElement('div');
    btn.className = 'graph-tab' + (tab.id === activeId ? ' active' : '');
    const icon = tab.type === 'event' ? iconHTML(Icons.Zap, 'xs', ICON_COLORS.warning) : tab.type === 'function' ? iconHTML(Icons.Code, 'xs', ICON_COLORS.blueprint) : iconHTML(Icons.Diamond, 'xs');
    btn.innerHTML = `${icon} ${tab.label}`;
    btn.addEventListener('click', () => onSwitch(tab));
    container.appendChild(btn);
  }
}

// ============================================================
//  Drag-from-Pin Context Menu (UE-style)
//  Shows only nodes compatible with the dragged socket type.
//  For ClassRef pins, shows target actor's variables, functions,
//  component nodes, and actor-type-specific nodes (character, camera, etc.)
// ============================================================
function showDragPinContextMenu(
  container: HTMLElement,
  x: number, y: number,
  draggedSocket: ClassicPreset.Socket,
  initial: { nodeId: string; side: 'input' | 'output'; key: string },
  targetActorId: string | null,
  targetActorName: string | null,
  targetBp: import('./BlueprintData').BlueprintData | null,
  isObjectPin: boolean,
  currentBp: import('./BlueprintData').BlueprintData,
  graphType: GraphType,
  onCreateNode: (node: ClassicPreset.Node, connectToKey: string | null) => void,
  targetActorType?: string,
  targetComponents?: ActorComponentData[],
  targetRootMeshType?: string,
) {
  const existing = container.querySelector('.bp-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'bp-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const header = document.createElement('div');
  header.className = 'bp-context-header';
  if (targetActorName) {
    header.textContent = `${targetActorName} Members`;
  } else if (isObjectPin) {
    header.textContent = 'Object Actions';
  } else {
    header.textContent = `${draggedSocket.name} Actions`;
  }
  menu.appendChild(header);

  const searchInput = document.createElement('input');
  searchInput.className = 'bp-context-search';
  searchInput.placeholder = 'Search...';
  searchInput.type = 'text';
  menu.appendChild(searchInput);

  const listEl = document.createElement('div');
  listEl.className = 'bp-context-list';
  menu.appendChild(listEl);

  // Determine which side we're coming from to pick the right connect key
  const dragSide = initial.side; // 'output' = dragged from output, need to connect to input
  const dragSocketName = draggedSocket.name;

  function renderList(filter: string) {
    listEl.innerHTML = '';
    const lf = filter.toLowerCase();
    const categories = new Map<string, { label: string; action: () => void }[]>();

    // --- Target actor variables (Get / Set) ---
    if (targetBp && targetActorId) {
      const items: { label: string; action: () => void }[] = [];
      for (const v of targetBp.variables) {
        const getLabel = `Get ${v.name}`;
        const setLabel = `Set ${v.name}`;
        if (!lf || getLabel.toLowerCase().includes(lf) || 'variables'.includes(lf)) {
          items.push({ label: getLabel, action: () => {
            const node = new GetActorVariableNode(v.name, v.type, targetActorId!);
            // If dragged from output, connect to 'target' input
            const connectKey = dragSide === 'output' ? 'target' : 'value';
            onCreateNode(node, connectKey);
            menu.remove();
          }});
        }
        if (!lf || setLabel.toLowerCase().includes(lf) || 'variables'.includes(lf)) {
          items.push({ label: setLabel, action: () => {
            const node = new SetActorVariableNode(v.name, v.type, targetActorId!);
            const connectKey = dragSide === 'output' ? 'target' : 'exec';
            onCreateNode(node, connectKey);
            menu.remove();
          }});
        }
      }
      if (items.length) categories.set(`${targetActorName} Variables`, items);
    }

    // --- Target actor functions (Call) ---
    if (targetBp && targetActorId) {
      const items: { label: string; action: () => void }[] = [];
      for (const fn of targetBp.functions) {
        const label = `Call ${fn.name}`;
        if (!lf || label.toLowerCase().includes(lf) || 'functions'.includes(lf)) {
          items.push({ label, action: () => {
            const node = new CallActorFunctionNode(fn.id, fn.name, targetActorId!, fn.inputs, fn.outputs);
            const connectKey = dragSide === 'output' ? 'target' : 'exec';
            onCreateNode(node, connectKey);
            menu.remove();
          }});
        }
      }
      if (items.length) categories.set(`ƒ ${targetActorName} Functions`, items);
    }

    // --- Target actor custom events (Call remotely) ---
    if (targetBp && targetActorId) {
      const items: { label: string; action: () => void }[] = [];
      for (const evt of targetBp.customEvents) {
        const label = `Call ${evt.name}`;
        if (!lf || label.toLowerCase().includes(lf) || 'events'.includes(lf)) {
          items.push({ label, action: () => {
            // For simplicity, create a CallCustomEventNode — remote event call
            // Note: this fires the event on the target actor
            const node = new CallCustomEventNode(evt.id, evt.name, evt.params, targetActorId || undefined);
            onCreateNode(node, null);
            menu.remove();
          }});
        }
      }
      if (items.length) categories.set(`${targetActorName} Events`, items);
    }

    // --- Target actor component nodes (light, trigger, mesh, etc.) ---
    if (targetActorId && targetComponents && targetRootMeshType) {
      const compEntries = getComponentNodeEntries(targetComponents, targetRootMeshType);
      if (compEntries.length > 0) {
        const items: { label: string; action: () => void }[] = [];
        for (const ce of compEntries) {
          if (!lf || ce.label.toLowerCase().includes(lf) || 'components'.includes(lf)) {
            items.push({ label: ce.label, action: () => {
              const node = ce.factory();
              onCreateNode(node, null);
              menu.remove();
            }});
          }
        }
        if (items.length) categories.set(`${targetActorName || ''} Components`, items);
      }
    }

    // --- Actor-type-specific nodes (Character, Camera, Physics, Transform) ---
    if (targetActorId && isObjectPin) {
      const isCharacter = targetActorType === 'characterPawn';
      const isCharacter2D = targetActorType === 'characterPawn2D';

      // Collect relevant NODE_PALETTE categories for this actor type
      const relevantCategories = new Set(['Physics', 'Transform', 'Collision']);
      if (isCharacter) {
        relevantCategories.add('Character');
      }
      if (isCharacter2D) {
        relevantCategories.add('Movement 2D');
        relevantCategories.add('Camera 2D');
        relevantCategories.add('Animation 2D');
      }

      for (const cat of relevantCategories) {
        const items: { label: string; action: () => void }[] = [];
        for (const entry of NODE_PALETTE) {
          if (entry.category !== cat) continue;
          if (lf && !entry.label.toLowerCase().includes(lf) && !cat.toLowerCase().includes(lf)) continue;
          items.push({ label: entry.label, action: () => {
            const node = entry.factory();
            onCreateNode(node, null);
            menu.remove();
          }});
        }
        if (items.length) {
          categories.set(cat, items);
        }
      }
    }

    // --- Generic object actions (for any ObjectRef / ClassRef pin) ---
    if (isObjectPin) {
      const objItems: { label: string; action: () => void }[] = [];

      // Get Actor Name
      if (!lf || 'get actor name'.includes(lf)) {
        objItems.push({ label: 'Get Actor Name', action: () => {
          const node = new GetActorNameNode();
          onCreateNode(node, dragSide === 'output' ? 'object' : 'name');
          menu.remove();
        }});
      }
      // Is Valid
      if (!lf || 'is valid'.includes(lf)) {
        objItems.push({ label: 'Is Valid', action: () => {
          const node = new IsValidNode();
          onCreateNode(node, dragSide === 'output' ? 'object' : null);
          menu.remove();
        }});
      }

      // Cast To entries — only for generic ObjectRef (ClassRef already know the type)
      if (dragSocketName === 'ObjectRef' && _actorAssetMgr) {
        for (const asset of _actorAssetMgr.assets) {
          if (!lf || `cast to ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf)) {
            objItems.push({ label: `Cast to ${asset.name}`, action: () => {
              const node = new CastToNode(asset.id, asset.name);
              onCreateNode(node, dragSide === 'output' ? 'object' : 'castedObject');
              menu.remove();
            }});
          }
          if (!lf || `pure cast to ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf)) {
            objItems.push({ label: `Pure Cast to ${asset.name}`, action: () => {
              const node = new PureCastNode(asset.id, asset.name);
              onCreateNode(node, dragSide === 'output' ? 'object' : 'castedObject');
              menu.remove();
            }});
          }
        }
      }

      if (objItems.length) categories.set('Object Actions', objItems);
    }

    // --- Standard palette nodes filtered by socket compatibility ---
    if (!isObjectPin) {
      const stdItems: { label: string; action: () => void }[] = [];
      for (const entry of NODE_PALETTE) {
        if (graphType !== 'event' && entry.category === 'Events') continue;
        if (!lf && !entry.label.toLowerCase().includes(lf) && lf) continue;
        if (lf && !entry.label.toLowerCase().includes(lf) && !entry.category.toLowerCase().includes(lf)) continue;

        // Create a temp node to check socket compatibility
        const tempNode = entry.factory();
        let compatKey: string | null = null;
        if (dragSide === 'output') {
          // Find an input on the new node that's compatible with our dragged socket
          for (const [key, inp] of Object.entries(tempNode.inputs)) {
            if (inp?.socket && socketsCompatible(draggedSocket, inp.socket)) {
              compatKey = key;
              break;
            }
          }
        } else {
          // Find an output on the new node that's compatible
          for (const [key, out] of Object.entries(tempNode.outputs)) {
            if (out?.socket && socketsCompatible(draggedSocket, out.socket)) {
              compatKey = key;
              break;
            }
          }
        }
        if (compatKey !== null) {
          const ck = compatKey;
          stdItems.push({ label: entry.label, action: () => {
            const node = entry.factory();
            onCreateNode(node, ck);
            menu.remove();
          }});
        }
      }
      if (stdItems.length) categories.set('Compatible Nodes', stdItems);
    }

    // Render categories
    for (const [cat, entries] of categories) {
      const catEl = document.createElement('div');
      catEl.className = 'bp-context-category';
      catEl.textContent = cat;
      listEl.appendChild(catEl);
      for (const e of entries) {
        const item = document.createElement('div');
        item.className = 'bp-context-item';
        item.textContent = e.label;
        item.addEventListener('click', e.action);
        listEl.appendChild(item);
      }
    }
    if (categories.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'bp-context-empty';
      empty.textContent = 'No matching nodes';
      listEl.appendChild(empty);
    }
  }

  renderList('');
  searchInput.addEventListener('input', () => renderList(searchInput.value));

  // Keyboard navigation
  let _selectedIdx = -1;
  searchInput.addEventListener('keydown', (e) => {
    const items = listEl.querySelectorAll('.bp-context-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _selectedIdx = Math.min(_selectedIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === _selectedIdx));
      items[_selectedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _selectedIdx = Math.max(_selectedIdx - 1, 0);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === _selectedIdx));
      items[_selectedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_selectedIdx >= 0 && _selectedIdx < items.length) {
        (items[_selectedIdx] as HTMLElement).click();
      }
    } else if (e.key === 'Escape') {
      menu.remove();
    } else {
      _selectedIdx = -1;
    }
  });

  container.appendChild(menu);
  menu.addEventListener('wheel', (e) => { e.stopPropagation(); }, true);
  requestAnimationFrame(() => searchInput.focus());

  const closeHandler = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}

// ============================================================
//  Context Menu (palette) — includes variables, functions, macros
// ============================================================
function showContextMenu(
  container: HTMLElement, x: number, y: number,
  bp: import('./BlueprintData').BlueprintData,
  graphType: GraphType,
  currentFuncId: string | null,
  onSelect: (entry: NodeEntry) => void,
  onAddVarNode: (v: BlueprintVariable, mode: 'get' | 'set') => void,
  onAddFnCallNode: (fn: BlueprintFunction) => void,
  onAddMacroCallNode: (m: BlueprintMacro) => void,
  onAddCustomEventCallNode: (evt: BlueprintCustomEvent) => void,
  onAddLocalVarNode: (v: BlueprintVariable, mode: 'get' | 'set') => void,
  onAddStructNode: (s: BlueprintStruct, mode: 'make' | 'break') => void,
  onAddInputKeyNode: (type: 'event' | 'isdown' | 'axis') => void,
  componentEntries?: ComponentNodeEntry[],
) {
  const existing = container.querySelector('.bp-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'bp-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const header = document.createElement('div');
  header.className = 'bp-context-header';
  header.textContent = 'All Actions';
  menu.appendChild(header);

  const searchInput = document.createElement('input');
  searchInput.className = 'bp-context-search';
  searchInput.placeholder = 'Search...';
  searchInput.type = 'text';
  menu.appendChild(searchInput);

  const listEl = document.createElement('div');
  listEl.className = 'bp-context-list';
  menu.appendChild(listEl);

  function renderList(filter: string) {
    listEl.innerHTML = '';
    const lf = filter.toLowerCase();
    const categories = new Map<string, { label: string; action: () => void }[]>();

    // Standard nodes
    for (const entry of NODE_PALETTE) {
      if (graphType !== 'event' && entry.category === 'Events') continue;
      if (lf && !entry.label.toLowerCase().includes(lf) && !entry.category.toLowerCase().includes(lf)) continue;
      const arr = categories.get(entry.category) || [];
      arr.push({ label: entry.label, action: () => { onSelect(entry); menu.remove(); } });
      categories.set(entry.category, arr);
    }

    // Variables — Get / Set
    if (bp.variables.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const v of bp.variables) {
        if (!lf || `get ${v.name}`.toLowerCase().includes(lf) || 'variables'.includes(lf))
          items.push({ label: `Get ${v.name}`, action: () => { onAddVarNode(v, 'get'); menu.remove(); } });
        if (!lf || `set ${v.name}`.toLowerCase().includes(lf) || 'variables'.includes(lf))
          items.push({ label: `Set ${v.name}`, action: () => { onAddVarNode(v, 'set'); menu.remove(); } });
      }
      if (items.length) categories.set('Variables', items);
    }

    // Local Variables — Get / Set (only in function graphs)
    if (currentFuncId) {
      const fn = bp.getFunction(currentFuncId);
      if (fn && fn.localVariables.length > 0) {
        const items: { label: string; action: () => void }[] = [];
        for (const lv of fn.localVariables) {
          if (!lf || `get ${lv.name}`.toLowerCase().includes(lf) || 'local variables'.includes(lf))
            items.push({ label: `Get ${lv.name} (local)`, action: () => { onAddLocalVarNode(lv, 'get'); menu.remove(); } });
          if (!lf || `set ${lv.name}`.toLowerCase().includes(lf) || 'local variables'.includes(lf))
            items.push({ label: `Set ${lv.name} (local)`, action: () => { onAddLocalVarNode(lv, 'set'); menu.remove(); } });
        }
        if (items.length) categories.set('Local Variables', items);
      }
    }

    // Functions
    if (bp.functions.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const fn of bp.functions) {
        if (!lf || fn.name.toLowerCase().includes(lf) || 'functions'.includes(lf))
          items.push({ label: fn.name, action: () => { onAddFnCallNode(fn); menu.remove(); } });
      }
      if (items.length) categories.set('Functions', items);
    }

    // Macros
    if (bp.macros.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const m of bp.macros) {
        if (!lf || m.name.toLowerCase().includes(lf) || 'macros'.includes(lf))
          items.push({ label: m.name, action: () => { onAddMacroCallNode(m); menu.remove(); } });
      }
      if (items.length) categories.set('Macros', items);
    }

    // Custom Events — Call
    if (bp.customEvents.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const evt of bp.customEvents) {
        if (!lf || `call ${evt.name}`.toLowerCase().includes(lf) || 'custom events'.includes(lf))
          items.push({ label: `Call ${evt.name}`, action: () => { onAddCustomEventCallNode(evt); menu.remove(); } });
      }
      if (items.length) categories.set('Custom Events', items);
    }

    // Structs — Make / Break (per-actor + project-level)
    {
      const items: { label: string; action: () => void }[] = [];
      // Per-actor structs
      for (const s of bp.structs) {
        if (!lf || `make ${s.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
          items.push({ label: `Make ${s.name}`, action: () => { onAddStructNode(s, 'make'); menu.remove(); } });
        if (!lf || `break ${s.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
          items.push({ label: `Break ${s.name}`, action: () => { onAddStructNode(s, 'break'); menu.remove(); } });
      }
      // Project-level structures
      if (_structMgr) {
        for (const ps of _structMgr.structures) {
          // Skip if already listed from per-actor structs
          if (bp.structs.some(bs => bs.id === ps.id)) continue;
          const fields = ps.fields.map(f => ({ name: f.name, type: f.type }));
          const pseudoStruct = { id: ps.id, name: ps.name, fields };
          if (!lf || `make ${ps.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
            items.push({ label: `Make ${ps.name}`, action: () => { onAddStructNode(pseudoStruct as any, 'make'); menu.remove(); } });
          if (!lf || `break ${ps.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
            items.push({ label: `Break ${ps.name}`, action: () => { onAddStructNode(pseudoStruct as any, 'break'); menu.remove(); } });
        }
      }
      if (items.length) categories.set('Structs', items);
    }

    // Input — Key Event / Is Key Down / Input Axis (event graph only for Key Event)
    {
      const items: { label: string; action: () => void }[] = [];
      if (graphType === 'event') {
        if (!lf || 'input key event'.includes(lf) || 'input'.includes(lf))
          items.push({ label: 'Input Key Event', action: () => { menu.remove(); onAddInputKeyNode('event'); } });
      }
      if (!lf || 'is key down'.includes(lf) || 'input'.includes(lf))
        items.push({ label: 'Is Key Down', action: () => { menu.remove(); onAddInputKeyNode('isdown'); } });
      if (!lf || 'input axis'.includes(lf) || 'input'.includes(lf))
        items.push({ label: 'Input Axis', action: () => { menu.remove(); onAddInputKeyNode('axis'); } });
      if (items.length) categories.set('Input', items);
    }

    // Components — dynamic entries from ComponentNodeRules
    if (componentEntries && componentEntries.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const ce of componentEntries) {
        if (!lf || ce.label.toLowerCase().includes(lf) || 'components'.includes(lf))
          items.push({ label: ce.label, action: () => { onSelect({ label: ce.label, category: 'Components', factory: ce.factory }); menu.remove(); } });
      }
      if (items.length) categories.set('Components', items);
    }

    // Casting — dynamic "Cast to <ClassName>" entries per actor asset
    if (_actorAssetMgr) {
      const castItems: { label: string; action: () => void }[] = [];
      for (const asset of _actorAssetMgr.assets) {
        // Cast To (exec-based)
        if (!lf || `cast to ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf))
          castItems.push({ label: `Cast to ${asset.name}`, action: () => {
            onSelect({ label: `Cast to ${asset.name}`, category: 'Casting', factory: () => new CastToNode(asset.id, asset.name) });
            menu.remove();
          }});
        // Pure Cast (data-only)
        if (!lf || `pure cast to ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf))
          castItems.push({ label: `Pure Cast to ${asset.name}`, action: () => {
            onSelect({ label: `Pure Cast to ${asset.name}`, category: 'Casting', factory: () => new PureCastNode(asset.id, asset.name) });
            menu.remove();
          }});
        // Get All Actors Of Class
        if (!lf || `get all actors of class ${asset.name}`.toLowerCase().includes(lf) || 'casting'.includes(lf))
          castItems.push({ label: `Get All ${asset.name}`, action: () => {
            onSelect({ label: `Get All ${asset.name}`, category: 'Casting', factory: () => new GetAllActorsOfClassNode(asset.id, asset.name) });
            menu.remove();
          }});
      }
      if (castItems.length) {
        const existing = categories.get('Casting') || [];
        categories.set('Casting', [...existing, ...castItems]);
      }
    }

    for (const [cat, entries] of categories) {
      const catEl = document.createElement('div');
      catEl.className = 'bp-context-category';
      const catIcon = getCategoryIcon(cat);
      catEl.innerHTML = `<span class="bp-cat-icon">${catIcon}</span> ${cat}`;
      listEl.appendChild(catEl);
      for (const e of entries) {
        const item = document.createElement('div');
        item.className = 'bp-context-item';
        item.textContent = e.label;
        item.addEventListener('click', e.action);
        listEl.appendChild(item);
      }
    }
    if (categories.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'bp-context-empty';
      empty.textContent = 'No matching nodes';
      listEl.appendChild(empty);
    }
  }

  renderList('');
  searchInput.addEventListener('input', () => renderList(searchInput.value));

  // Keyboard navigation in context menu
  let _selectedIdx = -1;
  searchInput.addEventListener('keydown', (e) => {
    const items = listEl.querySelectorAll('.bp-context-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _selectedIdx = Math.min(_selectedIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === _selectedIdx));
      items[_selectedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _selectedIdx = Math.max(_selectedIdx - 1, 0);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === _selectedIdx));
      items[_selectedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_selectedIdx >= 0 && _selectedIdx < items.length) {
        (items[_selectedIdx] as HTMLElement).click();
      }
    } else if (e.key === 'Escape') {
      menu.remove();
    } else {
      _selectedIdx = -1;
    }
  });

  container.appendChild(menu);
  // Prevent scroll inside menu from zooming the canvas
  menu.addEventListener('wheel', (e) => { e.stopPropagation(); }, true);
  requestAnimationFrame(() => searchInput.focus());

  const closeHandler = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}

// ============================================================
//  Dialogs — Add Variable, Add Function/Macro, Edit Variable, Struct
// ============================================================
function buildTypeOptions(bp: import('./BlueprintData').BlueprintData, selected?: VarType): string {
  const base = ['Float', 'Boolean', 'Vector3', 'String', 'Color', 'ObjectRef', 'Widget'] as const;
  let html = '';
  for (const t of base) {
    html += `<option value="${t}"${selected === t ? ' selected' : ''}>${t}</option>`;
  }
  // Per-actor (legacy) structs
  for (const s of bp.structs) {
    const val = `Struct:${s.id}`;
    html += `<option value="${val}"${selected === val ? ' selected' : ''}>${s.name}</option>`;
  }
  // Project-level structures
  if (_structMgr) {
    for (const s of _structMgr.structures) {
      const val: VarType = `Struct:${s.id}`;
      // Skip if already listed from per-actor structs
      if (bp.structs.some(bs => bs.id === s.id)) continue;
      html += `<option value="${val}"${selected === val ? ' selected' : ''}>${s.name} (Struct)</option>`;
    }
    // Project-level enums
    for (const e of _structMgr.enums) {
      const val: VarType = `Enum:${e.id}`;
      html += `<option value="${val}"${selected === val ? ' selected' : ''}>${e.name} (Enum)</option>`;
    }
  }
  // Actor class references — for storing typed actor/object refs as variables
  if (_actorAssetMgr) {
    for (const asset of _actorAssetMgr.assets) {
      const val: VarType = `ClassRef:${asset.id}`;
      html += `<option value="${val}"${selected === val ? ' selected' : ''}>${asset.name} (Actor Ref)</option>`;
    }
  }
  return html;
}

/** Returns the display name for a VarType (resolving struct IDs to names) */
function typeDisplayName(type: VarType, bp: import('./BlueprintData').BlueprintData): string {
  if (type.startsWith('Struct:')) {
    const structId = type.slice(7);
    const struct = bp.structs.find(s => s.id === structId);
    if (struct) return struct.name;
    // Try project-level
    if (_structMgr) {
      const projStruct = _structMgr.getStructure(structId);
      if (projStruct) return projStruct.name;
    }
    return 'Struct?';
  }
  if (type.startsWith('Enum:')) {
    const enumId = type.slice(5);
    if (_structMgr) {
      const projEnum = _structMgr.getEnum(enumId);
      if (projEnum) return projEnum.name;
    }
    return 'Enum?';
  }
  if (type.startsWith('ClassRef:')) {
    const actorId = type.slice(9);
    if (_actorAssetMgr) {
      const asset = _actorAssetMgr.assets.find(a => a.id === actorId);
      if (asset) return `${asset.name} Ref`;
    }
    return 'Actor Ref?';
  }
  return type;
}

/** CSS class suffix for type dot color */
function typeDotClass(type: VarType): string {
  if (type.startsWith('Struct:')) return 'mybp-var-struct';
  if (type.startsWith('Enum:'))   return 'mybp-var-enum';
  if (type.startsWith('ClassRef:')) return 'mybp-var-objectref';
  return `mybp-var-${type.toLowerCase()}`;
}

function showAddVariableDialog(parent: HTMLElement, bp: import('./BlueprintData').BlueprintData, onAdd: (name: string, type: VarType) => void) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog';
  dialog.innerHTML = `
    <div class="mybp-dialog-title">New Variable</div>
    <label class="mybp-dialog-label">Name</label>
    <input class="mybp-dialog-input" type="text" value="NewVar" id="dlg-var-name" />
    <label class="mybp-dialog-label">Type</label>
    <select class="mybp-dialog-select" id="dlg-var-type">
      ${buildTypeOptions(bp)}
    </select>
    <div class="mybp-dialog-actions">
      <button class="mybp-dialog-btn cancel" id="dlg-cancel">Cancel</button>
      <button class="mybp-dialog-btn ok" id="dlg-ok">Add</button>
    </div>`;
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  const nameInput = dialog.querySelector('#dlg-var-name') as HTMLInputElement;
  nameInput.select(); nameInput.focus();
  const close = () => overlay.remove();
  dialog.querySelector('#dlg-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  dialog.querySelector('#dlg-ok')!.addEventListener('click', () => {
    onAdd(nameInput.value.trim() || 'NewVar', (dialog.querySelector('#dlg-var-type') as HTMLSelectElement).value as VarType);
    close();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dialog.querySelector<HTMLButtonElement>('#dlg-ok')!.click();
    if (e.key === 'Escape') close();
  });
}

function showAddNameDialog(parent: HTMLElement, title: string, defaultName: string, onAdd: (name: string) => void) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog';
  dialog.innerHTML = `
    <div class="mybp-dialog-title">${title}</div>
    <label class="mybp-dialog-label">Name</label>
    <input class="mybp-dialog-input" type="text" value="${defaultName}" id="dlg-name" />
    <div class="mybp-dialog-actions">
      <button class="mybp-dialog-btn cancel" id="dlg-cancel">Cancel</button>
      <button class="mybp-dialog-btn ok" id="dlg-ok">Add</button>
    </div>`;
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  const nameInput = dialog.querySelector('#dlg-name') as HTMLInputElement;
  nameInput.select(); nameInput.focus();
  const close = () => overlay.remove();
  dialog.querySelector('#dlg-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  dialog.querySelector('#dlg-ok')!.addEventListener('click', () => {
    onAdd(nameInput.value.trim() || defaultName);
    close();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dialog.querySelector<HTMLButtonElement>('#dlg-ok')!.click();
    if (e.key === 'Escape') close();
  });
}

function showKeySelectDialog(parent: HTMLElement, title: string, onSelect: (key: string) => void) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog';
  const options = INPUT_KEYS.map(k => `<option value="${k}">${k}</option>`).join('');
  dialog.innerHTML = `
    <div class="mybp-dialog-title">${title}</div>
    <label class="mybp-dialog-label">Key</label>
    <select class="mybp-dialog-input" id="dlg-key">${options}</select>
    <div class="mybp-dialog-actions">
      <button class="mybp-dialog-btn cancel" id="dlg-cancel">Cancel</button>
      <button class="mybp-dialog-btn ok" id="dlg-ok">Add</button>
    </div>`;
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  const close = () => overlay.remove();
  dialog.querySelector('#dlg-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  dialog.querySelector('#dlg-ok')!.addEventListener('click', () => {
    const sel = dialog.querySelector('#dlg-key') as HTMLSelectElement;
    onSelect(sel.value);
    close();
  });
}

// ============================================================
//  Parameter Editor Dialog — edit inputs/outputs for functions
//  or params for custom events (reusable, struct-field-like UI)
// ============================================================
function showParamEditorDialog(
  parent: HTMLElement,
  bp: import('./BlueprintData').BlueprintData,
  title: string,
  inputParams: { name: string; type: VarType }[],
  outputParams: { name: string; type: VarType }[] | null, // null = custom events (no outputs)
  onSave: (inputs: { name: string; type: VarType }[], outputs: { name: string; type: VarType }[] | null) => void,
) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog mybp-struct-dialog';

  const inputs = inputParams.map(p => ({ ...p }));
  const outputs = outputParams ? outputParams.map(p => ({ ...p })) : null;

  function render() {
    dialog.innerHTML = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'mybp-dialog-title';
    titleEl.textContent = title;
    dialog.appendChild(titleEl);

    // --- Inputs ---
    const inLabel = document.createElement('label');
    inLabel.className = 'mybp-dialog-label';
    inLabel.textContent = outputs !== null ? 'Inputs' : 'Parameters';
    dialog.appendChild(inLabel);

    const inList = document.createElement('div');
    inList.className = 'mybp-struct-field-list';
    dialog.appendChild(inList);

    for (let i = 0; i < inputs.length; i++) {
      const p = inputs[i];
      const row = document.createElement('div');
      row.className = 'mybp-struct-field-row';

      const pName = document.createElement('input');
      pName.className = 'mybp-dialog-input mybp-struct-field-name';
      pName.type = 'text';
      pName.value = p.name;
      pName.placeholder = 'Param name';
      pName.addEventListener('input', () => { p.name = pName.value; });
      row.appendChild(pName);

      const pType = document.createElement('select');
      pType.className = 'mybp-dialog-select mybp-struct-field-type';
      pType.innerHTML = buildTypeOptions(bp, p.type);
      pType.addEventListener('change', () => { p.type = pType.value as VarType; });
      row.appendChild(pType);

      const delBtn = document.createElement('span');
      delBtn.className = 'mybp-struct-field-del';
      delBtn.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
      delBtn.title = 'Remove';
      delBtn.addEventListener('click', () => { inputs.splice(i, 1); render(); });
      row.appendChild(delBtn);

      inList.appendChild(row);
    }

    const addInBtn = document.createElement('button');
    addInBtn.className = 'mybp-dialog-btn mybp-struct-add-field';
    addInBtn.textContent = outputs !== null ? '+ Add Input' : '+ Add Parameter';
    addInBtn.addEventListener('click', () => { inputs.push({ name: 'NewParam', type: 'Float' }); render(); });
    dialog.appendChild(addInBtn);

    // --- Outputs (functions only) ---
    if (outputs !== null) {
      const outLabel = document.createElement('label');
      outLabel.className = 'mybp-dialog-label';
      outLabel.style.marginTop = '12px';
      outLabel.textContent = 'Outputs';
      dialog.appendChild(outLabel);

      const outList = document.createElement('div');
      outList.className = 'mybp-struct-field-list';
      dialog.appendChild(outList);

      for (let i = 0; i < outputs.length; i++) {
        const p = outputs[i];
        const row = document.createElement('div');
        row.className = 'mybp-struct-field-row';

        const pName = document.createElement('input');
        pName.className = 'mybp-dialog-input mybp-struct-field-name';
        pName.type = 'text';
        pName.value = p.name;
        pName.placeholder = 'Output name';
        pName.addEventListener('input', () => { p.name = pName.value; });
        row.appendChild(pName);

        const pType = document.createElement('select');
        pType.className = 'mybp-dialog-select mybp-struct-field-type';
        pType.innerHTML = buildTypeOptions(bp, p.type);
        pType.addEventListener('change', () => { p.type = pType.value as VarType; });
        row.appendChild(pType);

        const delBtn = document.createElement('span');
        delBtn.className = 'mybp-struct-field-del';
        delBtn.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
        delBtn.title = 'Remove';
        delBtn.addEventListener('click', () => { outputs.splice(i, 1); render(); });
        row.appendChild(delBtn);

        outList.appendChild(row);
      }

      const addOutBtn = document.createElement('button');
      addOutBtn.className = 'mybp-dialog-btn mybp-struct-add-field';
      addOutBtn.textContent = '+ Add Output';
      addOutBtn.addEventListener('click', () => { outputs.push({ name: 'ReturnValue', type: 'Float' }); render(); });
      dialog.appendChild(addOutBtn);
    }

    // --- Actions ---
    const actions = document.createElement('div');
    actions.className = 'mybp-dialog-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mybp-dialog-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(cancelBtn);
    const okBtn = document.createElement('button');
    okBtn.className = 'mybp-dialog-btn ok';
    okBtn.textContent = 'Save';
    okBtn.addEventListener('click', () => {
      const validInputs = inputs.filter(p => p.name.trim());
      const validOutputs = outputs ? outputs.filter(p => p.name.trim()) : null;
      onSave(validInputs, validOutputs);
      overlay.remove();
    });
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
  }

  render();
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function showVariableEditor(parent: HTMLElement, v: BlueprintVariable, bp: import('./BlueprintData').BlueprintData, onChange: () => void) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog';

  function buildDefaultValueInput(type: VarType, dv: any): string {
    if (type === 'Float') return `<input class="mybp-dialog-input" type="number" step="0.1" value="${dv ?? 0}" id="dlg-val" />`;
    if (type === 'Boolean') return `<label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="dlg-val" ${dv ? 'checked' : ''} /> Default</label>`;
    if (type === 'String') return `<input class="mybp-dialog-input" type="text" value="${dv ?? ''}" id="dlg-val" />`;
    if (type === 'Color') return `<input class="mybp-dialog-input" type="color" value="${dv ?? '#ffffff'}" id="dlg-val" style="height:32px;padding:2px;cursor:pointer;" />`;
    if (type === 'Vector3') {
      const d = dv || { x: 0, y: 0, z: 0 };
      return `<div style="display:flex;gap:4px;"><input class="mybp-dialog-input" type="number" step="0.1" value="${d.x}" id="dlg-vx" style="flex:1" placeholder="X"/><input class="mybp-dialog-input" type="number" step="0.1" value="${d.y}" id="dlg-vy" style="flex:1" placeholder="Y"/><input class="mybp-dialog-input" type="number" step="0.1" value="${d.z}" id="dlg-vz" style="flex:1" placeholder="Z"/></div>`;
    }
    if (type.startsWith('Struct:')) {
      return `<span style="color:#888;font-size:11px;">Struct — set field defaults via Set nodes</span>`;
    }
    if (type.startsWith('Enum:')) {
      const enumId = type.slice(5);
      const enumAsset = _structMgr?.getEnum(enumId);
      if (enumAsset && enumAsset.values.length > 0) {
        let html = `<select class="mybp-dialog-select" id="dlg-val">`;
        for (const ev of enumAsset.values) {
          html += `<option value="${ev.name}"${dv === ev.name ? ' selected' : ''}>${ev.displayName}</option>`;
        }
        html += `</select>`;
        return html;
      }
      return `<span style="color:#888;font-size:11px;">Enum — no values defined</span>`;
    }
    if (type === 'ObjectRef' || type === 'Widget') {
      return `<span style="color:#888;font-size:11px;">None — assigned at runtime via Cast/Get nodes</span>`;
    }
    if (type.startsWith('ClassRef:')) {
      const actorId = type.slice(9);
      const actorName = _actorAssetMgr?.assets.find(a => a.id === actorId)?.name ?? 'Actor';
      return `<span style="color:#888;font-size:11px;">None (${actorName} Ref) — assigned at runtime via Cast nodes</span>`;
    }
    return '';
  }

  function defaultForType(type: VarType): any {
    switch (type) {
      case 'Float': return 0;
      case 'Boolean': return false;
      case 'Vector3': return { x: 0, y: 0, z: 0 };
      case 'Color': return '#ffffff'
      case 'String': return '';
      default:
        if (type.startsWith('Struct:')) {
          const fields = resolveStructFields(type.slice(7), bp);
          if (fields) {
            const obj: any = {};
            for (const f of fields) obj[f.name] = defaultForType(f.type);
            return obj;
          }
        }
        if (type.startsWith('Enum:')) {
          const enumAsset = _structMgr?.getEnum(type.slice(5));
          return enumAsset?.values[0]?.name ?? '';
        }
        return null;
    }
  }

  function renderDialog() {
    const displayType = typeDisplayName(v.type, bp);
    dialog.innerHTML = `
      <div class="mybp-dialog-title">Edit: ${v.name} (${displayType})</div>
      <label class="mybp-dialog-label">Name</label>
      <input class="mybp-dialog-input" type="text" value="${v.name}" id="dlg-var-name" />
      <label class="mybp-dialog-label">Type</label>
      <select class="mybp-dialog-select" id="dlg-var-type">
        ${buildTypeOptions(bp, v.type)}
      </select>
      <label class="mybp-dialog-label">Default Value</label>
      <div id="dlg-default-container">${buildDefaultValueInput(v.type, v.defaultValue)}</div>
      <div class="mybp-dialog-actions">
        <button class="mybp-dialog-btn cancel" id="dlg-cancel">Cancel</button>
        <button class="mybp-dialog-btn ok" id="dlg-ok">Save</button>
      </div>`;

    // When type changes, update default value input and reset defaultValue
    const typeSelect = dialog.querySelector('#dlg-var-type') as HTMLSelectElement;
    typeSelect.addEventListener('change', () => {
      const newType = typeSelect.value as VarType;
      v.type = newType;
      v.defaultValue = defaultForType(newType);
      const container = dialog.querySelector('#dlg-default-container')!;
      container.innerHTML = buildDefaultValueInput(newType, v.defaultValue);
    });

    const close = () => overlay.remove();
    dialog.querySelector('#dlg-cancel')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    dialog.querySelector('#dlg-ok')!.addEventListener('click', () => {
      v.name = (dialog.querySelector('#dlg-var-name') as HTMLInputElement).value.trim() || v.name;
      v.type = (dialog.querySelector('#dlg-var-type') as HTMLSelectElement).value as VarType;
      if (v.type === 'Float') v.defaultValue = parseFloat((dialog.querySelector('#dlg-val') as HTMLInputElement).value) || 0;
      else if (v.type === 'Color') v.defaultValue = (dialog.querySelector('#dlg-val') as HTMLInputElement).value;
      else if (v.type === 'Boolean') v.defaultValue = (dialog.querySelector('#dlg-val') as HTMLInputElement).checked;
      else if (v.type === 'String') v.defaultValue = (dialog.querySelector('#dlg-val') as HTMLInputElement).value;
      else if (v.type === 'Vector3') {
        v.defaultValue = {
          x: parseFloat((dialog.querySelector('#dlg-vx') as HTMLInputElement).value) || 0,
          y: parseFloat((dialog.querySelector('#dlg-vy') as HTMLInputElement).value) || 0,
          z: parseFloat((dialog.querySelector('#dlg-vz') as HTMLInputElement).value) || 0,
        };
      } else if (v.type.startsWith('Struct:')) {
        v.defaultValue = defaultForType(v.type);
      } else if (v.type.startsWith('Enum:')) {
        const valEl = dialog.querySelector('#dlg-val') as HTMLSelectElement | null;
        v.defaultValue = valEl?.value ?? '';
      } else if (v.type === 'ObjectRef' || v.type === 'Widget' || v.type.startsWith('ClassRef:')) {
        v.defaultValue = null; // Object references are always null by default, assigned at runtime
      }
      onChange();
      close();
    });
  }

  renderDialog();
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
}

// ============================================================
//  Struct Dialog — Create / Edit struct with field editor
// ============================================================
function showStructDialog(
  parent: HTMLElement,
  bp: import('./BlueprintData').BlueprintData,
  existing: BlueprintStruct | null,
  onSave: (name: string, fields: { name: string; type: VarType }[]) => void,
) {
  const overlay = document.createElement('div');
  overlay.className = 'mybp-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mybp-dialog mybp-struct-dialog';

  let structName = existing ? existing.name : 'ST_NewStruct';
  let fields: { name: string; type: VarType }[] = existing
    ? existing.fields.map(f => ({ ...f }))
    : [{ name: 'Value', type: 'Float' as VarType }];

  function render() {
    dialog.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'mybp-dialog-title';
    title.textContent = existing ? `Edit Struct: ${structName}` : 'New Struct';
    dialog.appendChild(title);

    // Name
    const nameLbl = document.createElement('label');
    nameLbl.className = 'mybp-dialog-label';
    nameLbl.textContent = 'Struct Name';
    dialog.appendChild(nameLbl);
    const nameInput = document.createElement('input');
    nameInput.className = 'mybp-dialog-input';
    nameInput.type = 'text';
    nameInput.value = structName;
    nameInput.addEventListener('input', () => { structName = nameInput.value; });
    dialog.appendChild(nameInput);

    // Fields header
    const fieldsLbl = document.createElement('label');
    fieldsLbl.className = 'mybp-dialog-label';
    fieldsLbl.textContent = 'Fields';
    dialog.appendChild(fieldsLbl);

    const fieldList = document.createElement('div');
    fieldList.className = 'mybp-struct-field-list';
    dialog.appendChild(fieldList);

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const row = document.createElement('div');
      row.className = 'mybp-struct-field-row';

      const fName = document.createElement('input');
      fName.className = 'mybp-dialog-input mybp-struct-field-name';
      fName.type = 'text';
      fName.value = f.name;
      fName.placeholder = 'Field name';
      fName.addEventListener('input', () => { f.name = fName.value; });
      row.appendChild(fName);

      const fType = document.createElement('select');
      fType.className = 'mybp-dialog-select mybp-struct-field-type';
      fType.innerHTML = buildTypeOptions(bp, f.type);
      fType.addEventListener('change', () => { f.type = fType.value as VarType; });
      row.appendChild(fType);

      const delBtn = document.createElement('span');
      delBtn.className = 'mybp-struct-field-del';
      delBtn.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted);
      delBtn.title = 'Remove field';
      delBtn.addEventListener('click', () => { fields.splice(i, 1); render(); });
      row.appendChild(delBtn);

      fieldList.appendChild(row);
    }

    // Add field button
    const addFieldBtn = document.createElement('button');
    addFieldBtn.className = 'mybp-dialog-btn mybp-struct-add-field';
    addFieldBtn.textContent = '+ Add Field';
    addFieldBtn.addEventListener('click', () => {
      fields.push({ name: 'NewField', type: 'Float' });
      render();
    });
    dialog.appendChild(addFieldBtn);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'mybp-dialog-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mybp-dialog-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(cancelBtn);
    const okBtn = document.createElement('button');
    okBtn.className = 'mybp-dialog-btn ok';
    okBtn.textContent = existing ? 'Save' : 'Create';
    okBtn.addEventListener('click', () => {
      const validFields = fields.filter(f => f.name.trim());
      onSave(structName.trim() || 'ST_NewStruct', validFields);
      overlay.remove();
    });
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
  }

  render();
  overlay.appendChild(dialog);
  parent.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ============================================================
//  Graph Serialization / Deserialization
// ============================================================

/** Map a node instance to a serializable type string */
function getNodeTypeName(node: ClassicPreset.Node): string {
  // Events
  if (node instanceof EventTickNode) return 'EventTickNode';
  if (node instanceof EventBeginPlayNode) return 'EventBeginPlayNode';
  if (node instanceof EventOnDestroyNode) return 'EventOnDestroyNode';
  if (node instanceof CustomEventNode) return 'CustomEventNode';
  if (node instanceof CallCustomEventNode) return 'CallCustomEventNode';
  if (node instanceof InputKeyEventNode) return 'InputKeyEventNode';
  if (node instanceof IsKeyDownNode) return 'IsKeyDownNode';
  if (node instanceof InputActionMappingEventNode) return 'InputActionMappingEventNode';
  if (node instanceof InputAxisMappingEventNode) return 'InputAxisMappingEventNode';
  if (node instanceof GetInputActionNode) return 'GetInputActionNode';
  if (node instanceof GetInputAxisNode) return 'GetInputAxisNode';
  if (node instanceof AddActionMappingKeyNode) return 'AddActionMappingKeyNode';
  if (node instanceof RemoveActionMappingKeyNode) return 'RemoveActionMappingKeyNode';
  if (node instanceof ClearActionMappingNode) return 'ClearActionMappingNode';
  if (node instanceof AddAxisMappingKeyNode) return 'AddAxisMappingKeyNode';
  if (node instanceof RemoveAxisMappingKeyNode) return 'RemoveAxisMappingKeyNode';
  if (node instanceof ClearAxisMappingNode) return 'ClearAxisMappingNode';
  // Variables & Structs
  if (node instanceof GetVariableNode) return 'GetVariableNode';
  if (node instanceof SetVariableNode) return 'SetVariableNode';
  if (node instanceof MakeStructNode) return 'MakeStructNode';
  if (node instanceof BreakStructNode) return 'BreakStructNode';
  // Functions & Macros
  if (node instanceof FunctionEntryNode) return 'FunctionEntryNode';
  if (node instanceof FunctionReturnNode) return 'FunctionReturnNode';
  if (node instanceof FunctionCallNode) return 'FunctionCallNode';
  if (node instanceof MacroEntryNode) return 'MacroEntryNode';
  if (node instanceof MacroExitNode) return 'MacroExitNode';
  if (node instanceof MacroCallNode) return 'MacroCallNode';
  // Math
  if (node instanceof MathAddNode) return 'MathAddNode';
  if (node instanceof MathSubtractNode) return 'MathSubtractNode';
  if (node instanceof MathMultiplyNode) return 'MathMultiplyNode';
  if (node instanceof MathDivideNode) return 'MathDivideNode';
  if (node instanceof SineNode) return 'SineNode';
  if (node instanceof CosineNode) return 'CosineNode';
  if (node instanceof AbsNode) return 'AbsNode';
  if (node instanceof ClampNode) return 'ClampNode';
  if (node instanceof LerpNode) return 'LerpNode';
  if (node instanceof GreaterThanNode) return 'GreaterThanNode';
  // Values
  if (node instanceof ColorNode) return 'ColorNode';
  if (node instanceof FloatNode) return 'FloatNode';
  if (node instanceof IntegerNode) return 'IntegerNode';
  if (node instanceof BooleanNode) return 'BooleanNode';
  if (node instanceof StringLiteralNode) return 'StringLiteralNode';
  if (node instanceof Vector3LiteralNode) return 'Vector3LiteralNode';
  if (node instanceof TimeNode) return 'TimeNode';
  if (node instanceof DeltaTimeNode) return 'DeltaTimeNode';
  // Transform
  if (node instanceof SetPositionNode) return 'SetPositionNode';
  if (node instanceof GetPositionNode) return 'GetPositionNode';
  if (node instanceof SetRotationNode) return 'SetRotationNode';
  if (node instanceof GetRotationNode) return 'GetRotationNode';
  if (node instanceof SetScaleNode) return 'SetScaleNode';
  if (node instanceof GetScaleNode) return 'GetScaleNode';
  // Flow Control
  if (node instanceof BranchNode) return 'BranchNode';
  if (node instanceof SequenceNode) return 'SequenceNode';
  if (node instanceof ForLoopNode) return 'ForLoopNode';
  if (node instanceof DelayNode) return 'DelayNode';
  if (node instanceof DoOnceNode) return 'DoOnceNode';
  if (node instanceof DoNNode) return 'DoNNode';
  if (node instanceof FlipFlopNode) return 'FlipFlopNode';
  if (node instanceof GateNode) return 'GateNode';
  if (node instanceof MultiGateNode) return 'MultiGateNode';
  if (node instanceof ForLoopWithBreakNode) return 'ForLoopWithBreakNode';
  if (node instanceof WhileLoopNode) return 'WhileLoopNode';
  if (node instanceof SwitchOnIntNode) return 'SwitchOnIntNode';
  if (node instanceof SwitchOnStringNode) return 'SwitchOnStringNode';
  // Utility
  if (node instanceof PrintStringNode) return 'PrintStringNode';
  // Physics
  if (node instanceof AddForceNode) return 'AddForceNode';
  if (node instanceof AddImpulseNode) return 'AddImpulseNode';
  if (node instanceof SetVelocityNode) return 'SetVelocityNode';
  // Physics (extended)
  if (node instanceof GetMassNode) return 'GetMassNode';
  if (node instanceof SetMassNode) return 'SetMassNode';
  if (node instanceof GetVelocityNode) return 'GetVelocityNode';
  if (node instanceof GetAngularVelocityNode) return 'GetAngularVelocityNode';
  if (node instanceof SetLinearVelocityNode) return 'SetLinearVelocityNode';
  if (node instanceof SetAngularVelocityNode) return 'SetAngularVelocityNode';
  if (node instanceof IsSimulatingPhysicsNode) return 'IsSimulatingPhysicsNode';
  if (node instanceof SetSimulatePhysicsNode) return 'SetSimulatePhysicsNode';
  if (node instanceof IsGravityEnabledNode) return 'IsGravityEnabledNode';
  if (node instanceof SetGravityEnabledNode) return 'SetGravityEnabledNode';
  if (node instanceof GetGravityScaleNode) return 'GetGravityScaleNode';
  if (node instanceof SetGravityScaleNode) return 'SetGravityScaleNode';
  if (node instanceof SetLinearDampingNode) return 'SetLinearDampingNode';
  if (node instanceof SetAngularDampingNode) return 'SetAngularDampingNode';
  if (node instanceof SetPhysicsMaterialNode) return 'SetPhysicsMaterialNode';
  if (node instanceof GetPhysicsMaterialNode) return 'GetPhysicsMaterialNode';
  if (node instanceof AddTorqueNode) return 'AddTorqueNode';
  if (node instanceof AddForceAtLocationNode) return 'AddForceAtLocationNode';
  if (node instanceof AddImpulseAtLocationNode) return 'AddImpulseAtLocationNode';
  if (node instanceof SetConstraintNode) return 'SetConstraintNode';
  // Physics events
  if (node instanceof OnComponentHitNode) return 'OnComponentHitNode';
  if (node instanceof OnComponentBeginOverlapNode) return 'OnComponentBeginOverlapNode';
  if (node instanceof OnComponentEndOverlapNode) return 'OnComponentEndOverlapNode';
  if (node instanceof OnComponentWakeNode) return 'OnComponentWakeNode';
  if (node instanceof OnComponentSleepNode) return 'OnComponentSleepNode';
  // Component nodes
  if (node instanceof GetComponentLocationNode) return 'GetComponentLocationNode';
  if (node instanceof SetComponentLocationNode) return 'SetComponentLocationNode';
  if (node instanceof GetComponentRotationNode) return 'GetComponentRotationNode';
  if (node instanceof SetComponentRotationNode) return 'SetComponentRotationNode';
  if (node instanceof GetComponentScaleNode) return 'GetComponentScaleNode';
  if (node instanceof SetComponentScaleNode) return 'SetComponentScaleNode';
  if (node instanceof SetComponentVisibilityNode) return 'SetComponentVisibilityNode';
  if (node instanceof SetStaticMeshNode) return 'SetStaticMeshNode';
  if (node instanceof SetMeshMaterialNode) return 'SetMeshMaterialNode';
  if (node instanceof GetMeshMaterialNode) return 'GetMeshMaterialNode';
  // Light component nodes
  if (node instanceof SetLightEnabledNode) return 'SetLightEnabledNode';
  if (node instanceof GetLightEnabledNode) return 'GetLightEnabledNode';
  if (node instanceof SetLightColorNode) return 'SetLightColorNode';
  if (node instanceof GetLightColorNode) return 'GetLightColorNode';
  if (node instanceof SetLightIntensityNode) return 'SetLightIntensityNode';
  if (node instanceof GetLightIntensityNode) return 'GetLightIntensityNode';
  if (node instanceof SetLightDistanceNode) return 'SetLightDistanceNode';
  if (node instanceof SetLightPositionNode) return 'SetLightPositionNode';
  if (node instanceof GetLightPositionNode) return 'GetLightPositionNode';
  if (node instanceof SetLightTargetNode) return 'SetLightTargetNode';
  if (node instanceof SetCastShadowNode) return 'SetCastShadowNode';
  if (node instanceof SetSpotAngleNode) return 'SetSpotAngleNode';
  if (node instanceof SetSpotPenumbraNode) return 'SetSpotPenumbraNode';
  // Conversions
  if (node instanceof BoolToNumberNode) return 'BoolToNumberNode';
  if (node instanceof NumberToBoolNode) return 'NumberToBoolNode';
  if (node instanceof BoolToStringNode) return 'BoolToStringNode';
  if (node instanceof StringToBoolNode) return 'StringToBoolNode';
  if (node instanceof NumberToStringNode) return 'NumberToStringNode';
  if (node instanceof StringToNumberNode) return 'StringToNumberNode';
  if (node instanceof ColorToStringNode) return 'ColorToStringNode';
  if (node instanceof StringToColorNode) return 'StringToColorNode';
  // Collision / Trigger event nodes
  if (node instanceof OnTriggerBeginOverlapNode) return 'OnTriggerBeginOverlapNode';
  if (node instanceof OnTriggerEndOverlapNode) return 'OnTriggerEndOverlapNode';
  if (node instanceof OnActorBeginOverlapNode) return 'OnActorBeginOverlapNode';
  if (node instanceof OnActorEndOverlapNode) return 'OnActorEndOverlapNode';
  if (node instanceof OnCollisionHitNode) return 'OnCollisionHitNode';
  if (node instanceof IsOverlappingActorNode) return 'IsOverlappingActorNode';
  if (node instanceof GetOverlapCountNode) return 'GetOverlapCountNode';
  if (node instanceof SetCollisionEnabledNode) return 'SetCollisionEnabledNode';
  // Trigger component nodes
  if (node instanceof OnTriggerComponentBeginOverlapNode) return 'OnTriggerComponentBeginOverlapNode';
  if (node instanceof OnTriggerComponentEndOverlapNode) return 'OnTriggerComponentEndOverlapNode';
  if (node instanceof SetTriggerEnabledNode) return 'SetTriggerEnabledNode';
  if (node instanceof GetTriggerEnabledNode) return 'GetTriggerEnabledNode';
  if (node instanceof SetTriggerSizeNode) return 'SetTriggerSizeNode';
  if (node instanceof GetTriggerOverlapCountNode) return 'GetTriggerOverlapCountNode';
  if (node instanceof IsTriggerOverlappingNode) return 'IsTriggerOverlappingNode';
  if (node instanceof GetTriggerShapeNode) return 'GetTriggerShapeNode';
  // Character Movement nodes
  if (node instanceof AddMovementInputNode) return 'AddMovementInputNode';
  if (node instanceof JumpNode) return 'JumpNode';
  if (node instanceof StopJumpingNode) return 'StopJumpingNode';
  if (node instanceof CrouchNode) return 'CrouchNode';
  if (node instanceof UncrouchNode) return 'UncrouchNode';
  if (node instanceof SetMovementModeNode) return 'SetMovementModeNode';
  if (node instanceof SetMaxWalkSpeedNode) return 'SetMaxWalkSpeedNode';
  if (node instanceof LaunchCharacterNode) return 'LaunchCharacterNode';
  if (node instanceof SetCameraModeNode) return 'SetCameraModeNode';
  if (node instanceof SetCameraFOVNode) return 'SetCameraFOVNode';
  if (node instanceof AddControllerYawInputNode) return 'AddControllerYawInputNode';
  if (node instanceof AddControllerPitchInputNode) return 'AddControllerPitchInputNode';
  if (node instanceof GetControllerRotationNode) return 'GetControllerRotationNode';
  if (node instanceof SetControllerRotationNode) return 'SetControllerRotationNode';
  if (node instanceof SetMouseLockEnabledNode) return 'SetMouseLockEnabledNode';
  if (node instanceof GetMouseLockStatusNode) return 'GetMouseLockStatusNode';
  if (node instanceof GetPlayerControllerNode) return 'GetPlayerControllerNode';
  if (node instanceof SetShowMouseCursorNode) return 'SetShowMouseCursorNode';
  if (node instanceof IsMouseCursorVisibleNode) return 'IsMouseCursorVisibleNode';
  if (node instanceof SetInputModeGameOnlyNode) return 'SetInputModeGameOnlyNode';
  if (node instanceof SetInputModeGameAndUINode) return 'SetInputModeGameAndUINode';
  if (node instanceof SetInputModeUIOnlyNode) return 'SetInputModeUIOnlyNode';
  if (node instanceof GetCharacterVelocityNode) return 'GetCharacterVelocityNode';
  if (node instanceof GetMovementSpeedNode) return 'GetMovementSpeedNode';
  if (node instanceof IsGroundedNode) return 'IsGroundedNode';
  if (node instanceof IsJumpingNode) return 'IsJumpingNode';
  if (node instanceof IsCrouchingNode) return 'IsCrouchingNode';
  if (node instanceof IsFallingNode) return 'IsFallingNode';
  if (node instanceof IsFlyingNode) return 'IsFlyingNode';
  if (node instanceof IsSwimmingNode) return 'IsSwimmingNode';
  if (node instanceof StartFlyingNode) return 'StartFlyingNode';
  if (node instanceof StopFlyingNode) return 'StopFlyingNode';
  if (node instanceof StartSwimmingNode) return 'StartSwimmingNode';
  if (node instanceof StopSwimmingNode) return 'StopSwimmingNode';
  if (node instanceof IsMovingNode) return 'IsMovingNode';
  if (node instanceof GetMovementModeNode) return 'GetMovementModeNode';
  if (node instanceof GetCameraLocationNode) return 'GetCameraLocationNode';
  if (node instanceof InputAxisNode) return 'InputAxisNode';
  // Camera & Spring Arm nodes
  if (node instanceof SetSpringArmLengthNode) return 'SetSpringArmLengthNode';
  if (node instanceof SetSpringArmTargetOffsetNode) return 'SetSpringArmTargetOffsetNode';
  if (node instanceof SetSpringArmSocketOffsetNode) return 'SetSpringArmSocketOffsetNode';
  if (node instanceof SetSpringArmCollisionNode) return 'SetSpringArmCollisionNode';
  if (node instanceof SetCameraCollisionEnabledNode) return 'SetCameraCollisionEnabledNode';
  if (node instanceof SetCameraLagNode) return 'SetCameraLagNode';
  if (node instanceof SetCameraRotationLagNode) return 'SetCameraRotationLagNode';
  if (node instanceof GetSpringArmLengthNode) return 'GetSpringArmLengthNode';
  if (node instanceof GetSpringArmTargetOffsetNode) return 'GetSpringArmTargetOffsetNode';
  if (node instanceof GetSpringArmSocketOffsetNode) return 'GetSpringArmSocketOffsetNode';
  if (node instanceof CameraModeLiteralNode) return 'CameraModeLiteralNode';
  if (node instanceof MovementModeLiteralNode) return 'MovementModeLiteralNode';
  if (node instanceof GetCameraRotationNode) return 'GetCameraRotationNode';
  // Player Controller nodes
  if (node instanceof PossessPawnNode) return 'PossessPawnNode';
  if (node instanceof UnpossessPawnNode) return 'UnpossessPawnNode';
  if (node instanceof GetControlledPawnNode) return 'GetControlledPawnNode';
  if (node instanceof IsPossessingNode) return 'IsPossessingNode';
  // AI Controller nodes
  if (node instanceof AIMoveToNode) return 'AIMoveToNode';
  if (node instanceof AIStopMovementNode) return 'AIStopMovementNode';
  if (node instanceof AISetFocalPointNode) return 'AISetFocalPointNode';
  if (node instanceof AIClearFocalPointNode) return 'AIClearFocalPointNode';
  if (node instanceof AIStartPatrolNode) return 'AIStartPatrolNode';
  if (node instanceof AIStopPatrolNode) return 'AIStopPatrolNode';
  if (node instanceof AIStartFollowingNode) return 'AIStartFollowingNode';
  if (node instanceof AIStopFollowingNode) return 'AIStopFollowingNode';
  if (node instanceof GetAIStateNode) return 'GetAIStateNode';
  if (node instanceof AIHasReachedTargetNode) return 'AIHasReachedTargetNode';
  if (node instanceof AIGetDistanceToTargetNode) return 'AIGetDistanceToTargetNode';
  // Controller ↔ Pawn nodes
  if (node instanceof GetControllerNode) return 'GetControllerNode';
  if (node instanceof GetControllerTypeNode) return 'GetControllerTypeNode';
  if (node instanceof GetPawnNode) return 'GetPawnNode';
  if (node instanceof IsPlayerControlledNode) return 'IsPlayerControlledNode';
  if (node instanceof IsAIControlledNode) return 'IsAIControlledNode';
  // Casting & Reference nodes
  if (node instanceof CastToNode) return 'CastToNode';
  if (node instanceof GetSelfReferenceNode) return 'GetSelfReferenceNode';
  if (node instanceof GetPlayerPawnNode) return 'GetPlayerPawnNode';
  if (node instanceof GetActorByNameNode) return 'GetActorByNameNode';
  if (node instanceof GetAllActorsOfClassNode) return 'GetAllActorsOfClassNode';
  if (node instanceof IsValidNode) return 'IsValidNode';
  if (node instanceof GetActorNameNode) return 'GetActorNameNode';
  if (node instanceof GetActorVariableNode) return 'GetActorVariableNode';
  if (node instanceof SetActorVariableNode) return 'SetActorVariableNode';
  if (node instanceof GetOwnerNode) return 'GetOwnerNode';
  if (node instanceof GetAnimInstanceNode) return 'GetAnimInstanceNode';
  if (node instanceof PureCastNode) return 'PureCastNode';
  if (node instanceof CallActorFunctionNode) return 'CallActorFunctionNode';
  // Animation BP nodes
  if (node instanceof AnimUpdateEventNode) return 'AnimUpdateEventNode';
  if (node instanceof TryGetPawnOwnerNode) return 'TryGetPawnOwnerNode';
  if (node instanceof SetAnimVarNode) return 'SetAnimVarNode';
  if (node instanceof GetAnimVarNode) return 'GetAnimVarNode';
  // Widget / UI nodes
  if (node instanceof CreateWidgetNode) return 'CreateWidgetNode';
  if (node instanceof AddToViewportNode) return 'AddToViewportNode';
  if (node instanceof RemoveFromViewportNode) return 'RemoveFromViewportNode';
  if (node instanceof SetWidgetTextNode) return 'SetWidgetTextNode';
  if (node instanceof GetWidgetTextNode) return 'GetWidgetTextNode';
  if (node instanceof SetWidgetVisibilityNode) return 'SetWidgetVisibilityNode';
  if (node instanceof SetWidgetColorNode) return 'SetWidgetColorNode';
  if (node instanceof SetWidgetOpacityNode) return 'SetWidgetOpacityNode';
  if (node instanceof SetProgressBarPercentNode) return 'SetProgressBarPercentNode';
  if (node instanceof GetProgressBarPercentNode) return 'GetProgressBarPercentNode';
  if (node instanceof SetSliderValueNode) return 'SetSliderValueNode';
  if (node instanceof GetSliderValueNode) return 'GetSliderValueNode';
  if (node instanceof SetCheckBoxStateNode) return 'SetCheckBoxStateNode';
  if (node instanceof GetCheckBoxStateNode) return 'GetCheckBoxStateNode';
  if (node instanceof IsWidgetVisibleNode) return 'IsWidgetVisibleNode';
  if (node instanceof PlayWidgetAnimationNode) return 'PlayWidgetAnimationNode';
  if (node instanceof SetInputModeNode) return 'SetInputModeNode';
  if (node instanceof ShowMouseCursorNode) return 'ShowMouseCursorNode';
  // Widget Instance Interaction Nodes
  if (node instanceof GetWidgetVariableNode) return 'GetWidgetVariableNode';
  if (node instanceof SetWidgetVariableNode) return 'SetWidgetVariableNode';
  if (node instanceof CallWidgetFunctionNode) return 'CallWidgetFunctionNode';
  if (node instanceof CallWidgetEventNode) return 'CallWidgetEventNode';
  // Widget Event Nodes
  if (node instanceof ButtonOnClickedNode) return 'ButtonOnClickedNode';
  if (node instanceof ButtonOnPressedNode) return 'ButtonOnPressedNode';
  if (node instanceof ButtonOnReleasedNode) return 'ButtonOnReleasedNode';
  if (node instanceof ButtonOnHoveredNode) return 'ButtonOnHoveredNode';
  if (node instanceof ButtonOnUnhoveredNode) return 'ButtonOnUnhoveredNode';
  if (node instanceof TextBoxOnTextChangedNode) return 'TextBoxOnTextChangedNode';
  if (node instanceof TextBoxOnTextCommittedNode) return 'TextBoxOnTextCommittedNode';
  if (node instanceof SliderOnValueChangedNode) return 'SliderOnValueChangedNode';
  if (node instanceof CheckBoxOnCheckStateChangedNode) return 'CheckBoxOnCheckStateChangedNode';

  // Scene & Game Instance nodes
  if (node instanceof OpenSceneNode) return 'OpenSceneNode';
  if (node instanceof LoadSceneNode) return 'LoadSceneNode';
  if (node instanceof GetGameInstanceNode) return 'GetGameInstanceNode';
  if (node instanceof GetGameInstanceVariableNode) return 'GetGameInstanceVariableNode';
  if (node instanceof SetGameInstanceVariableNode) return 'SetGameInstanceVariableNode';

  // Character Movement 2D nodes
  if (node instanceof AddMovementInput2DNode) return 'AddMovementInput2DNode';
  if (node instanceof Jump2DNode) return 'Jump2DNode';
  if (node instanceof StopJump2DNode) return 'StopJump2DNode';
  if (node instanceof LaunchCharacter2DNode) return 'LaunchCharacter2DNode';
  if (node instanceof SetMaxWalkSpeed2DNode) return 'SetMaxWalkSpeed2DNode';
  if (node instanceof GetMaxWalkSpeed2DNode) return 'GetMaxWalkSpeed2DNode';
  if (node instanceof IsGrounded2DNode) return 'IsGrounded2DNode';
  if (node instanceof IsJumping2DNode) return 'IsJumping2DNode';
  if (node instanceof IsFalling2DNode) return 'IsFalling2DNode';
  if (node instanceof GetCharacterVelocity2DNode) return 'GetCharacterVelocity2DNode';
  if (node instanceof AddCharacterImpulse2DNode) return 'AddCharacterImpulse2DNode';
  if (node instanceof StopMovement2DNode) return 'StopMovement2DNode';
  if (node instanceof SetJumpHeight2DNode) return 'SetJumpHeight2DNode';
  if (node instanceof SetMaxJumps2DNode) return 'SetMaxJumps2DNode';
  if (node instanceof GetJumpsRemaining2DNode) return 'GetJumpsRemaining2DNode';
  if (node instanceof SetGravityMultiplier2DNode) return 'SetGravityMultiplier2DNode';
  if (node instanceof FlipSpriteDirection2DNode) return 'FlipSpriteDirection2DNode';
  if (node instanceof SetAirControl2DNode) return 'SetAirControl2DNode';
  if (node instanceof GetSpriteFacingDirection2DNode) return 'GetSpriteFacingDirection2DNode';
  if (node instanceof GetCharacterSpeed2DNode) return 'GetCharacterSpeed2DNode';
  // Spawning nodes
  if (node instanceof SpawnActorFromClassNode) return 'SpawnActorFromClassNode';

  // ForEachLoop nodes
  if (node instanceof ForEachLoopNode) return 'ForEachLoopNode';
  if (node instanceof ForEachLoopWithBreakNode) return 'ForEachLoopWithBreakNode';
  if (node instanceof ForEachActorLoopNode) return 'ForEachActorLoopNode';

  // Drag Selection nodes
  if (node instanceof EnableDragSelectionNode) return 'EnableDragSelectionNode';
  if (node instanceof DisableDragSelectionNode) return 'DisableDragSelectionNode';
  if (node instanceof SetDragSelectionEnabledNode) return 'SetDragSelectionEnabledNode';
  if (node instanceof OnDragSelectionCompleteNode) return 'OnDragSelectionCompleteNode';
  if (node instanceof GetSelectedActorsNode) return 'GetSelectedActorsNode';
  if (node instanceof GetSelectedActorAtIndexNode) return 'GetSelectedActorAtIndexNode';
  if (node instanceof SetDragSelectionClassFilterNode) return 'SetDragSelectionClassFilterNode';
  if (node instanceof AddDragSelectionClassFilterNode) return 'AddDragSelectionClassFilterNode';
  if (node instanceof ClearDragSelectionClassFilterNode) return 'ClearDragSelectionClassFilterNode';
  if (node instanceof SetDragSelectionStyleNode) return 'SetDragSelectionStyleNode';
  if (node instanceof IsDragSelectingNode) return 'IsDragSelectingNode';
  if (node instanceof GetDragSelectionCountNode) return 'GetDragSelectionCountNode';

  // Event Bus nodes
  if (node instanceof EmitEventNode) return 'EmitEventNode';
  if (node instanceof OnEventNode) return 'OnEventNode';

  // AI Blueprint nodes
  if (node instanceof AIReceiveExecuteNode) return 'AIReceiveExecuteNode';
  if (node instanceof AIReceiveTickNode) return 'AIReceiveTickNode';
  if (node instanceof AIReceiveAbortNode) return 'AIReceiveAbortNode';
  if (node instanceof FinishExecuteNode) return 'FinishExecuteNode';
  if (node instanceof AIPerformConditionCheckNode) return 'AIPerformConditionCheckNode';
  if (node instanceof AIObserverActivatedNode) return 'AIObserverActivatedNode';
  if (node instanceof AIObserverDeactivatedNode) return 'AIObserverDeactivatedNode';
  if (node instanceof ReturnNode) return 'ReturnNode';
  if (node instanceof AIServiceActivatedNode) return 'AIServiceActivatedNode';
  if (node instanceof AIServiceTickNode) return 'AIServiceTickNode';
  if (node instanceof AIServiceDeactivatedNode) return 'AIServiceDeactivatedNode';
  if (node instanceof OnPossessNode) return 'OnPossessNode';
  if (node instanceof OnUnpossessNode) return 'OnUnpossessNode';
  if (node instanceof OnMoveCompletedNode) return 'OnMoveCompletedNode';
  if (node instanceof OnPerceptionUpdatedNode) return 'OnPerceptionUpdatedNode';
  if (node instanceof RunBehaviorTreeNode) return 'RunBehaviorTreeNode';
  if (node instanceof MoveToLocationNode) return 'MoveToLocationNode';
  if (node instanceof GetBlackboardValueNode) return 'GetBlackboardValueNode';
  if (node instanceof SetBlackboardValueNode) return 'SetBlackboardValueNode';
  if (node instanceof ClearBlackboardValueNode) return 'ClearBlackboardValueNode';
  if (node instanceof RotateToFaceNode) return 'RotateToFaceNode';

  // Fallback: use the node label for any NODE_PALETTE-registered node
  const paletteEntry = NODE_PALETTE.find(e => e.label === (node as any).label);
  if (paletteEntry) return (node as any).label;

  return 'Unknown';
}

/** Extract custom data from a node for serialization */
function getNodeSerialData(node: ClassicPreset.Node): any {
  const data: any = {};

  // Always save the label so palette-based deserialization can find the factory
  if ((node as any).label) data.label = (node as any).label;

  // Save InputControl values
  const controls: any = {};
  for (const [key, ctrl] of Object.entries(node.controls)) {
    if (ctrl instanceof BoolSelectControl) {
      controls[key] = (ctrl as BoolSelectControl).value;
    } else if (ctrl instanceof WidgetBPSelectControl) {
      controls[key] = { id: (ctrl as WidgetBPSelectControl).value, name: (ctrl as WidgetBPSelectControl).displayName };
    } else if (ctrl instanceof SaveGameSelectControl) {
      controls[key] = { id: (ctrl as SaveGameSelectControl).value, name: (ctrl as SaveGameSelectControl).displayName };
    } else if (ctrl instanceof WidgetSelectorControl) {
      const value = (ctrl as WidgetSelectorControl).value;
      controls[key] = value;
      console.log(`[Serialize] Node "${(node as any).label}" (${node.id}) control "${key}" = "${value}"`, ctrl);
    } else if (ctrl instanceof MovementModeSelectControl) {
      controls[key] = (ctrl as MovementModeSelectControl).value;
    } else if (ctrl instanceof KeySelectControl) {
      controls[key] = (ctrl as KeySelectControl).value;
    } else if (ctrl instanceof ActionMappingSelectControl) {
      controls[key] = (ctrl as ActionMappingSelectControl).value;
    } else if (ctrl instanceof AxisMappingSelectControl) {
      controls[key] = (ctrl as AxisMappingSelectControl).value;
    } else if (ctrl instanceof EventSelectControl) {
      controls[key] = (ctrl as EventSelectControl).value;
    } else if (ctrl instanceof BTSelectControl) {
      controls[key] = { id: (ctrl as BTSelectControl).value, name: (ctrl as BTSelectControl).displayName };
    } else if (ctrl instanceof ColorPickerControl) {
      controls[key] = (ctrl as ColorPickerControl).value;
    } else if (ctrl instanceof TextureSelectControl) {
      controls[key] = { id: (ctrl as TextureSelectControl).value, name: (ctrl as TextureSelectControl).displayName };
    } else if (ctrl instanceof SoundCueSelectControl) {
      controls[key] = { id: (ctrl as SoundCueSelectControl).value, name: (ctrl as SoundCueSelectControl).displayName };
    } else if (ctrl instanceof ActorClassSelectControl) {
      controls[key] = { id: (ctrl as ActorClassSelectControl).value, name: (ctrl as ActorClassSelectControl).displayName };
    } else if (ctrl instanceof ClassicPreset.InputControl) {
      controls[key] = (ctrl as ClassicPreset.InputControl<'number' | 'text'>).value;
    }
  }
  if (Object.keys(controls).length > 0) data.controls = controls;

  // Save controls on input pins (e.g. drawDebug BoolSelectControl)
  const inputControls: any = {};
  for (const [key, inp] of Object.entries(node.inputs)) {
    const ctrl = (inp as any)?.control;
    if (ctrl instanceof BoolSelectControl) {
      inputControls[key] = ctrl.value;
    }
  }
  if (Object.keys(inputControls).length > 0) data.inputControls = inputControls;

  // Custom fields per node type
  if (node instanceof GetVariableNode || node instanceof SetVariableNode) {
    data.varId = node.varId;
    data.varName = node.varName;
    data.varType = node.varType;
    if (node.structFields) data.structFields = node.structFields;
    if ((node as any).__isLocal) data.isLocal = true;
  } else if (node instanceof CustomEventNode) {
    data.eventId = node.eventId;
    data.eventName = node.eventName;
    data.eventParams = node.eventParams;
  } else if (node instanceof CallCustomEventNode) {
    data.eventId = node.eventId;
    data.eventName = node.eventName;
    data.eventParams = node.eventParams;
    if ((node as CallCustomEventNode).targetActorId) {
      data.targetActorId = (node as CallCustomEventNode).targetActorId;
    }
  } else if (node instanceof InputKeyEventNode) {
    const keyCtrl = (node as InputKeyEventNode).controls['key'] as KeySelectControl | undefined;
    data.selectedKey = keyCtrl?.value ?? (node as InputKeyEventNode).selectedKey;
  } else if (node instanceof IsKeyDownNode) {
    const keyCtrl = (node as IsKeyDownNode).controls['key'] as KeySelectControl | undefined;
    data.selectedKey = keyCtrl?.value ?? (node as IsKeyDownNode).selectedKey;
  } else if (node instanceof InputActionMappingEventNode) {
    const ctrl = (node as InputActionMappingEventNode).controls['action'] as ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as InputActionMappingEventNode).selectedAction;
  } else if (node instanceof InputAxisMappingEventNode) {
    const ctrl = (node as InputAxisMappingEventNode).controls['axis'] as AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as InputAxisMappingEventNode).selectedAxis;
  } else if (node instanceof GetInputActionNode) {
    const ctrl = (node as GetInputActionNode).controls['action'] as ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as GetInputActionNode).selectedAction;
  } else if (node instanceof GetInputAxisNode) {
    const ctrl = (node as GetInputAxisNode).controls['axis'] as AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as GetInputAxisNode).selectedAxis;
  } else if (node instanceof AddActionMappingKeyNode) {
    const ctrl = (node as AddActionMappingKeyNode).controls['action'] as ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as AddActionMappingKeyNode).selectedAction;
  } else if (node instanceof RemoveActionMappingKeyNode) {
    const ctrl = (node as RemoveActionMappingKeyNode).controls['action'] as ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as RemoveActionMappingKeyNode).selectedAction;
  } else if (node instanceof ClearActionMappingNode) {
    const ctrl = (node as ClearActionMappingNode).controls['action'] as ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as ClearActionMappingNode).selectedAction;
  } else if (node instanceof AddAxisMappingKeyNode) {
    const ctrl = (node as AddAxisMappingKeyNode).controls['axis'] as AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as AddAxisMappingKeyNode).selectedAxis;
  } else if (node instanceof RemoveAxisMappingKeyNode) {
    const ctrl = (node as RemoveAxisMappingKeyNode).controls['axis'] as AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as RemoveAxisMappingKeyNode).selectedAxis;
  } else if (node instanceof ClearAxisMappingNode) {
    const ctrl = (node as ClearAxisMappingNode).controls['axis'] as AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as ClearAxisMappingNode).selectedAxis;
  } else if (node instanceof InputAxisNode) {
    const ia = node as InputAxisNode;
    const posCtrl = ia.controls['posKey'] as KeySelectControl | undefined;
    const negCtrl = ia.controls['negKey'] as KeySelectControl | undefined;
    data.positiveKey = posCtrl?.value ?? ia.positiveKey;
    data.negativeKey = negCtrl?.value ?? ia.negativeKey;
  } else if (node instanceof RunBehaviorTreeNode) {
    const btCtrl = node.controls['btSelect'] as BTSelectControl | undefined;
    data.selectedBTId = btCtrl?.value ?? (node as RunBehaviorTreeNode).selectedBTId;
    data.selectedBTName = btCtrl?.displayName ?? (node as RunBehaviorTreeNode).selectedBTName;
  } else if (node instanceof FunctionEntryNode) {
    data.funcId = node.funcId;
  } else if (node instanceof FunctionReturnNode) {
    data.funcId = node.funcId;
  } else if (node instanceof FunctionCallNode) {
    data.funcId = node.funcId;
    data.funcName = node.funcName;
  } else if (node instanceof MacroEntryNode) {
    data.macroId = node.macroId;
  } else if (node instanceof MacroExitNode) {
    data.macroId = node.macroId;
  } else if (node instanceof MacroCallNode) {
    data.macroId = node.macroId;
    data.macroName = node.macroName;
  } else if (node instanceof MakeStructNode) {
    data.structId = node.structId;
    data.structName = node.structName;
    data.structFields = node.structFields;
  } else if (node instanceof BreakStructNode) {
    data.structId = node.structId;
    data.structName = node.structName;
    data.structFields = node.structFields;
  } else if (
    node instanceof GetComponentLocationNode || node instanceof SetComponentLocationNode ||
    node instanceof GetComponentRotationNode || node instanceof SetComponentRotationNode ||
    node instanceof GetComponentScaleNode || node instanceof SetComponentScaleNode ||
    node instanceof SetComponentVisibilityNode ||
    node instanceof SetStaticMeshNode || node instanceof SetMeshMaterialNode ||
    node instanceof GetMeshMaterialNode
  ) {
    data.compName = (node as any).compName;
    data.compIndex = (node as any).compIndex;
  } else if (
    node instanceof SetLightEnabledNode || node instanceof GetLightEnabledNode ||
    node instanceof SetLightColorNode || node instanceof GetLightColorNode ||
    node instanceof SetLightIntensityNode || node instanceof GetLightIntensityNode ||
    node instanceof SetLightDistanceNode || node instanceof SetLightPositionNode ||
    node instanceof GetLightPositionNode || node instanceof SetLightTargetNode ||
    node instanceof SetCastShadowNode || node instanceof SetSpotAngleNode ||
    node instanceof SetSpotPenumbraNode
  ) {
    data.compName = (node as any).compName;
    data.compIndex = (node as any).compIndex;
  } else if (
    node instanceof OnTriggerComponentBeginOverlapNode || node instanceof OnTriggerComponentEndOverlapNode ||
    node instanceof SetTriggerEnabledNode || node instanceof GetTriggerEnabledNode ||
    node instanceof SetTriggerSizeNode || node instanceof GetTriggerOverlapCountNode ||
    node instanceof IsTriggerOverlappingNode || node instanceof GetTriggerShapeNode
  ) {
    data.compName = (node as any).compName;
    data.compIndex = (node as any).compIndex;
  }
  // Casting & Reference nodes — dynamic data
  if (node instanceof CastToNode || node instanceof PureCastNode) {
    data.targetClassId = (node as any).targetClassId;
    data.targetClassName = (node as any).targetClassName;
  } else if (node instanceof GetAllActorsOfClassNode) {
    data.targetClassId = (node as any).targetClassId;
    data.targetClassName = (node as any).targetClassName;
  } else if (node instanceof GetActorVariableNode || node instanceof SetActorVariableNode) {
    data.varName = (node as any).varName;
    data.varType = (node as any).varType;
    data.targetActorId = (node as any).targetActorId;
  } else if (node instanceof CallActorFunctionNode) {
    data.funcId = (node as any).funcId;
    data.funcName = (node as any).funcName;
    data.targetActorId = (node as any).targetActorId;
    // Serialize input/output definitions so we can reconstruct with correct sockets
    const inputs: { name: string; type: string }[] = [];
    const outputs: { name: string; type: string }[] = [];
    for (const [key, inp] of Object.entries(node.inputs)) {
      if (key === 'exec' || key === 'target') continue;
      inputs.push({ name: key, type: (inp as any)?.socket?.name ?? 'Number' });
    }
    for (const [key, out] of Object.entries(node.outputs)) {
      if (key === 'exec') continue;
      outputs.push({ name: key, type: (out as any)?.socket?.name ?? 'Number' });
    }
    data.fnInputs = inputs;
    data.fnOutputs = outputs;
  }

  // Animation BP nodes
  if (node instanceof SetAnimVarNode || node instanceof GetAnimVarNode) {
    data.varName = (node as any).varName;
    data.varType = (node as any).varType;
  }

  // Widget nodes
  if (node instanceof CreateWidgetNode) {
    data.widgetBPId = (node as CreateWidgetNode).widgetBPId;
    data.widgetBPName = (node as CreateWidgetNode).widgetBPName;
  }
  // SaveGame nodes
  if (node instanceof CreateSaveGameObjectNode) {
    data.saveGameId = (node as CreateSaveGameObjectNode).saveGameId;
    data.saveGameName = (node as CreateSaveGameObjectNode).saveGameName;
  }
  // Spawning nodes
  if (node instanceof SpawnActorFromClassNode) {
    data.targetClassId = (node as SpawnActorFromClassNode).targetClassId;
    data.targetClassName = (node as SpawnActorFromClassNode).targetClassName;
    data.exposedVars = (node as SpawnActorFromClassNode).exposedVars;
  }

  // Widget instance interaction nodes
  if (node instanceof GetWidgetVariableNode) {
    data.widgetBPId = (node as GetWidgetVariableNode).widgetBPId;
    data.widgetBPName = (node as GetWidgetVariableNode).widgetBPName;
    data.variableName = (node as GetWidgetVariableNode).getVariableName();
  }
  if (node instanceof SetWidgetVariableNode) {
    data.widgetBPId = (node as SetWidgetVariableNode).widgetBPId;
    data.widgetBPName = (node as SetWidgetVariableNode).widgetBPName;
    data.variableName = (node as SetWidgetVariableNode).getVariableName();
  }

  // Scene & Game Instance nodes
  if (node instanceof OpenSceneNode || node instanceof LoadSceneNode) {
    const sceneCtrl = node.controls['scene'] as SceneSelectControl;
    if (sceneCtrl) data.sceneName = sceneCtrl.value;
  }
  if (node instanceof GetGameInstanceVariableNode || node instanceof SetGameInstanceVariableNode) {
    const varCtrl = node.controls['varName'] as GameInstanceVarNameControl;
    if (varCtrl) data.varName = varCtrl.value;
  }
  if (node instanceof CallWidgetFunctionNode) {
    const n = node as CallWidgetFunctionNode;
    data.widgetBPId = n.widgetBPId;
    data.widgetBPName = n.widgetBPName;
    data.functionName = n.getFunctionName();
    data.functionInputs = n.functionInputs;
    data.functionOutputs = n.functionOutputs;
  }
  if (node instanceof CallWidgetEventNode) {
    const n = node as CallWidgetEventNode;
    data.widgetBPId = n.widgetBPId;
    data.widgetBPName = n.widgetBPName;
    data.eventName = n.getEventName();
    data.eventParams = n.eventParams;
  }

  // SwitchOnString custom case values
  if (node instanceof SwitchOnStringNode) {
    data.caseValues = (node as SwitchOnStringNode).caseValues;
  }

  return data;
}

/** Serialize the entire graph (nodes + connections + positions) */
function serializeGraph(editor: NodeEditor<Schemes>, area: AreaPlugin<Schemes, any>): any {
  const nodes = editor.getNodes();
  const connections = editor.getConnections();

  const serializedNodes = nodes.map(node => {
    const view = area.nodeViews.get(node.id);
    const position = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 };
    return {
      id: node.id,
      type: getNodeTypeName(node),
      position,
      data: getNodeSerialData(node),
    };
  });

  const serializedConnections = connections.map(c => ({
    id: c.id,
    source: c.source,
    sourceOutput: c.sourceOutput,
    target: c.target,
    targetInput: c.targetInput,
  }));

  return { nodes: serializedNodes, connections: serializedConnections };
}

/** Create a node instance from serialized data */
function createNodeFromData(
  nd: { type: string; data: any },
  bp: import('./BlueprintData').BlueprintData,
): ClassicPreset.Node | null {
  const d = nd.data || {};

  switch (nd.type) {
    // Events
    case 'EventTickNode':      return new EventTickNode();
    case 'EventBeginPlayNode': return new EventBeginPlayNode();
    case 'EventOnDestroyNode': return new EventOnDestroyNode();
    case 'CustomEventNode':
      return new CustomEventNode(d.eventId, d.eventName, d.eventParams || []);
    case 'CallCustomEventNode':
      return new CallCustomEventNode(d.eventId, d.eventName, d.eventParams || [], d.targetActorId);
    case 'InputKeyEventNode':
      return new InputKeyEventNode(d.selectedKey || 'Space');
    case 'IsKeyDownNode':
      return new IsKeyDownNode(d.selectedKey || 'Space');
    case 'InputActionMappingEventNode':
      return new InputActionMappingEventNode(d.selectedAction || '');
    case 'InputAxisMappingEventNode':
      return new InputAxisMappingEventNode(d.selectedAxis || '');
    case 'GetInputActionNode':
      return new GetInputActionNode(d.selectedAction || '');
    case 'GetInputAxisNode':
      return new GetInputAxisNode(d.selectedAxis || '');
    case 'AddActionMappingKeyNode':
      return new AddActionMappingKeyNode(d.selectedAction || '');
    case 'RemoveActionMappingKeyNode':
      return new RemoveActionMappingKeyNode(d.selectedAction || '');
    case 'ClearActionMappingNode':
      return new ClearActionMappingNode(d.selectedAction || '');
    case 'AddAxisMappingKeyNode':
      return new AddAxisMappingKeyNode(d.selectedAxis || '');
    case 'RemoveAxisMappingKeyNode':
      return new RemoveAxisMappingKeyNode(d.selectedAxis || '');
    case 'ClearAxisMappingNode':
      return new ClearAxisMappingNode(d.selectedAxis || '');
    case 'InputAxisNode':
      return new InputAxisNode(d.positiveKey || 'D', d.negativeKey || 'A');

    // Variables
    case 'GetVariableNode': {
      const sf = d.structFields || (d.varType?.startsWith('Struct:') ? resolveStructFields(d.varType.slice(7), bp) : undefined);
      const n = new GetVariableNode(d.varId, d.varName, d.varType, sf);
      if (d.isLocal) (n as any).__isLocal = true;
      return n;
    }
    case 'SetVariableNode': {
      const sf = d.structFields || (d.varType?.startsWith('Struct:') ? resolveStructFields(d.varType.slice(7), bp) : undefined);
      const n = new SetVariableNode(d.varId, d.varName, d.varType, sf);
      if (d.isLocal) (n as any).__isLocal = true;
      return n;
    }
    case 'MakeStructNode':
      return new MakeStructNode(d.structId, d.structName, d.structFields || []);
    case 'BreakStructNode':
      return new BreakStructNode(d.structId, d.structName, d.structFields || []);

    // Functions
    case 'FunctionEntryNode': {
      const fn = bp.getFunction(d.funcId);
      return new FunctionEntryNode(d.funcId, fn?.name || 'Function', fn?.inputs || []);
    }
    case 'FunctionReturnNode': {
      const fn = bp.getFunction(d.funcId);
      return new FunctionReturnNode(d.funcId, fn?.name || 'Function', fn?.outputs || []);
    }
    case 'FunctionCallNode': {
      const fn = bp.getFunction(d.funcId);
      return new FunctionCallNode(d.funcId, d.funcName || fn?.name || 'Function', fn?.inputs || [], fn?.outputs || []);
    }

    // Macros
    case 'MacroEntryNode': {
      const m = bp.getMacro(d.macroId);
      return new MacroEntryNode(d.macroId, m?.name || 'Macro', m?.inputs || []);
    }
    case 'MacroExitNode': {
      const m = bp.getMacro(d.macroId);
      return new MacroExitNode(d.macroId, m?.name || 'Macro', m?.outputs || []);
    }
    case 'MacroCallNode': {
      const m = bp.getMacro(d.macroId);
      return new MacroCallNode(d.macroId, d.macroName || m?.name || 'Macro', m?.inputs || [], m?.outputs || []);
    }

    // Math
    case 'MathAddNode':      return new MathAddNode();
    case 'MathSubtractNode': return new MathSubtractNode();
    case 'MathMultiplyNode': return new MathMultiplyNode();
    case 'MathDivideNode':   return new MathDivideNode();
    case 'SineNode':         return new SineNode();
    case 'CosineNode':       return new CosineNode();
    case 'AbsNode':          return new AbsNode();
    case 'ClampNode':        return new ClampNode();
    case 'LerpNode':         return new LerpNode();
    case 'GreaterThanNode':  return new GreaterThanNode();

    // Values
    case 'FloatNode':           return new FloatNode(d.controls?.value ?? 0);
    case 'IntegerNode':          return new IntegerNode(d.controls?.value ?? 0);
    case 'BooleanNode': {
      const n = new BooleanNode();
      if (d.controls?.value != null) {
        const ctrl = n.controls['value'] as BoolSelectControl;
        if (ctrl) ctrl.setValue(d.controls.value);
      }
      return n;
    }
    case 'ColorNode':           return new ColorNode(d.controls?.value ?? '#ffffff');
    case 'StringLiteralNode':   return new StringLiteralNode(d.controls?.value ?? '');
    case 'Vector3LiteralNode':  return new Vector3LiteralNode(d.controls?.x ?? 0, d.controls?.y ?? 0, d.controls?.z ?? 0);
    case 'TimeNode':            return new TimeNode();
    case 'DeltaTimeNode':       return new DeltaTimeNode();

    // Conversions
    case 'BoolToNumberNode':    return new BoolToNumberNode();
    case 'NumberToBoolNode':    return new NumberToBoolNode();
    case 'BoolToStringNode':    return new BoolToStringNode();
    case 'StringToBoolNode':    return new StringToBoolNode();
    case 'NumberToStringNode':  return new NumberToStringNode();
    case 'StringToNumberNode':  return new StringToNumberNode();
    case 'ColorToStringNode':   return new ColorToStringNode();
    case 'StringToColorNode':   return new StringToColorNode();

    // Transform
    case 'SetPositionNode': return new SetPositionNode();
    case 'GetPositionNode': return new GetPositionNode();
    case 'SetRotationNode': return new SetRotationNode();
    case 'GetRotationNode': return new GetRotationNode();
    case 'SetScaleNode':    return new SetScaleNode();
    case 'GetScaleNode':    return new GetScaleNode();

    // Flow Control
    case 'BranchNode':   return new BranchNode();
    case 'SequenceNode': return new SequenceNode();
    case 'ForLoopNode':  return new ForLoopNode();
    case 'DelayNode':    return new DelayNode();
    case 'DoOnceNode':   return new DoOnceNode();
    case 'DoNNode':      return new DoNNode();
    case 'FlipFlopNode': return new FlipFlopNode();
    case 'GateNode':     return new GateNode();
    case 'MultiGateNode': return new MultiGateNode();
    case 'ForLoopWithBreakNode': return new ForLoopWithBreakNode();
    case 'WhileLoopNode': return new WhileLoopNode();
    case 'SwitchOnIntNode': return new SwitchOnIntNode();
    case 'SwitchOnStringNode': {
      const n = new SwitchOnStringNode();
      if (d.caseValues) n.caseValues = d.caseValues;
      return n;
    }

    // Utility
    case 'PrintStringNode': {
      const n = new PrintStringNode();
      if (d.controls?.text != null) {
        const ctrl = n.controls['text'] as ClassicPreset.InputControl<'text'>;
        if (ctrl) ctrl.setValue(d.controls.text);
      }
      return n;
    }

    // Physics
    case 'AddForceNode':    return new AddForceNode();
    case 'AddImpulseNode':  return new AddImpulseNode();
    case 'SetVelocityNode': return new SetVelocityNode();
    // Physics (extended)
    case 'GetMassNode':              return new GetMassNode();
    case 'SetMassNode':              return new SetMassNode();
    case 'GetVelocityNode':          return new GetVelocityNode();
    case 'GetAngularVelocityNode':   return new GetAngularVelocityNode();
    case 'SetLinearVelocityNode':    return new SetLinearVelocityNode();
    case 'SetAngularVelocityNode':   return new SetAngularVelocityNode();
    case 'IsSimulatingPhysicsNode':  return new IsSimulatingPhysicsNode();
    case 'SetSimulatePhysicsNode':   return new SetSimulatePhysicsNode();
    case 'IsGravityEnabledNode':     return new IsGravityEnabledNode();
    case 'SetGravityEnabledNode':    return new SetGravityEnabledNode();
    case 'GetGravityScaleNode':      return new GetGravityScaleNode();
    case 'SetGravityScaleNode':      return new SetGravityScaleNode();
    case 'SetLinearDampingNode':     return new SetLinearDampingNode();
    case 'SetAngularDampingNode':    return new SetAngularDampingNode();
    case 'SetPhysicsMaterialNode':   return new SetPhysicsMaterialNode();
    case 'GetPhysicsMaterialNode':   return new GetPhysicsMaterialNode();
    case 'AddTorqueNode':            return new AddTorqueNode();
    case 'AddForceAtLocationNode':   return new AddForceAtLocationNode();
    case 'AddImpulseAtLocationNode': return new AddImpulseAtLocationNode();
    case 'SetConstraintNode':        return new SetConstraintNode();
    // Physics events
    case 'OnComponentHitNode':          return new OnComponentHitNode();
    case 'OnComponentBeginOverlapNode': return new OnComponentBeginOverlapNode();
    case 'OnComponentEndOverlapNode':   return new OnComponentEndOverlapNode();
    case 'OnComponentWakeNode':         return new OnComponentWakeNode();
    case 'OnComponentSleepNode':        return new OnComponentSleepNode();

    // Component nodes
    case 'GetComponentLocationNode':  return new GetComponentLocationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentLocationNode':  return new SetComponentLocationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetComponentRotationNode':  return new GetComponentRotationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentRotationNode':  return new SetComponentRotationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetComponentScaleNode':     return new GetComponentScaleNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentScaleNode':     return new SetComponentScaleNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentVisibilityNode': return new SetComponentVisibilityNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetStaticMeshNode':          return new SetStaticMeshNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetMeshMaterialNode':        return new SetMeshMaterialNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetMeshMaterialNode':        return new GetMeshMaterialNode(d.compName || 'Root', d.compIndex ?? -1);

    // Light component nodes
    case 'SetLightEnabledNode':    return new SetLightEnabledNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'GetLightEnabledNode':    return new GetLightEnabledNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightColorNode':      return new SetLightColorNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'GetLightColorNode':      return new GetLightColorNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightIntensityNode':  return new SetLightIntensityNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'GetLightIntensityNode':  return new GetLightIntensityNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightDistanceNode':   return new SetLightDistanceNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightPositionNode':   return new SetLightPositionNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'GetLightPositionNode':   return new GetLightPositionNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightTargetNode':     return new SetLightTargetNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetCastShadowNode':      return new SetCastShadowNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetSpotAngleNode':       return new SetSpotAngleNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetSpotPenumbraNode':    return new SetSpotPenumbraNode(d.compName || 'Light', d.compIndex ?? 0);

    // Trigger component nodes
    case 'OnTriggerComponentBeginOverlapNode': return new OnTriggerComponentBeginOverlapNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'OnTriggerComponentEndOverlapNode':   return new OnTriggerComponentEndOverlapNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'SetTriggerEnabledNode':       return new SetTriggerEnabledNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'GetTriggerEnabledNode':       return new GetTriggerEnabledNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'SetTriggerSizeNode':          return new SetTriggerSizeNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'GetTriggerOverlapCountNode':  return new GetTriggerOverlapCountNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'IsTriggerOverlappingNode':    return new IsTriggerOverlappingNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'GetTriggerShapeNode':         return new GetTriggerShapeNode(d.compName || 'Trigger', d.compIndex ?? 0);

    // Collision / Trigger event nodes
    case 'OnTriggerBeginOverlapNode':   return new OnTriggerBeginOverlapNode();
    case 'OnTriggerEndOverlapNode':     return new OnTriggerEndOverlapNode();
    case 'OnActorBeginOverlapNode':     return new OnActorBeginOverlapNode();
    case 'OnActorEndOverlapNode':       return new OnActorEndOverlapNode();
    case 'OnCollisionHitNode':          return new OnCollisionHitNode();
    case 'IsOverlappingActorNode':      return new IsOverlappingActorNode();
    case 'GetOverlapCountNode':         return new GetOverlapCountNode();
    case 'SetCollisionEnabledNode':     return new SetCollisionEnabledNode();

    // Character Movement nodes
    case 'AddMovementInputNode':        return new AddMovementInputNode();
    case 'JumpNode':                    return new JumpNode();
    case 'StopJumpingNode':             return new StopJumpingNode();
    case 'CrouchNode':                  return new CrouchNode();
    case 'UncrouchNode':                return new UncrouchNode();
    case 'SetMovementModeNode':         return new SetMovementModeNode(d.controls?.mode ?? 'walking');
    case 'SetMaxWalkSpeedNode':         return new SetMaxWalkSpeedNode();
    case 'LaunchCharacterNode':         return new LaunchCharacterNode();
    case 'SetCameraModeNode':           return new SetCameraModeNode();
    case 'SetCameraFOVNode':            return new SetCameraFOVNode();
    case 'AddControllerYawInputNode':   return new AddControllerYawInputNode();
    case 'AddControllerPitchInputNode': return new AddControllerPitchInputNode();
    case 'GetControllerRotationNode':   return new GetControllerRotationNode();
    case 'SetControllerRotationNode':   return new SetControllerRotationNode();
    case 'SetMouseLockEnabledNode':     return new SetMouseLockEnabledNode();
    case 'GetMouseLockStatusNode':      return new GetMouseLockStatusNode();
    case 'GetPlayerControllerNode':     return new GetPlayerControllerNode();
    case 'SetShowMouseCursorNode':      return new SetShowMouseCursorNode();
    case 'IsMouseCursorVisibleNode':    return new IsMouseCursorVisibleNode();
    case 'SetInputModeGameOnlyNode':    return new SetInputModeGameOnlyNode();
    case 'SetInputModeGameAndUINode':   return new SetInputModeGameAndUINode();
    case 'SetInputModeUIOnlyNode':      return new SetInputModeUIOnlyNode();
    case 'GetCharacterVelocityNode':    return new GetCharacterVelocityNode();
    case 'GetMovementSpeedNode':        return new GetMovementSpeedNode();
    case 'IsGroundedNode':              return new IsGroundedNode();
    case 'IsJumpingNode':               return new IsJumpingNode();
    case 'IsCrouchingNode':             return new IsCrouchingNode();
    case 'IsFallingNode':               return new IsFallingNode();
    case 'IsFlyingNode':                 return new IsFlyingNode();
    case 'IsSwimmingNode':               return new IsSwimmingNode();
    case 'StartFlyingNode':              return new StartFlyingNode();
    case 'StopFlyingNode':               return new StopFlyingNode();
    case 'StartSwimmingNode':            return new StartSwimmingNode();
    case 'StopSwimmingNode':             return new StopSwimmingNode();
    case 'IsMovingNode':                 return new IsMovingNode();
    case 'GetMovementModeNode':         return new GetMovementModeNode();
    case 'GetCameraLocationNode':       return new GetCameraLocationNode();
    // Camera & Spring Arm nodes
    case 'SetSpringArmLengthNode':          return new SetSpringArmLengthNode();
    case 'SetSpringArmTargetOffsetNode':    return new SetSpringArmTargetOffsetNode();
    case 'SetSpringArmSocketOffsetNode':    return new SetSpringArmSocketOffsetNode();
    case 'SetSpringArmCollisionNode':       return new SetSpringArmCollisionNode();
    case 'SetCameraCollisionEnabledNode':    return new SetCameraCollisionEnabledNode();
    case 'SetCameraLagNode':                return new SetCameraLagNode();
    case 'SetCameraRotationLagNode':        return new SetCameraRotationLagNode();
    case 'GetSpringArmLengthNode':          return new GetSpringArmLengthNode();
    case 'GetSpringArmTargetOffsetNode':    return new GetSpringArmTargetOffsetNode();
    case 'GetSpringArmSocketOffsetNode':    return new GetSpringArmSocketOffsetNode();
    case 'CameraModeLiteralNode':           return new CameraModeLiteralNode();
    case 'MovementModeLiteralNode':         return new MovementModeLiteralNode(d.controls?.mode ?? 'walking');
    case 'GetCameraRotationNode':           return new GetCameraRotationNode();
    // Player Controller nodes
    case 'PossessPawnNode':                 return new PossessPawnNode();
    case 'UnpossessPawnNode':               return new UnpossessPawnNode();
    case 'GetControlledPawnNode':           return new GetControlledPawnNode();
    case 'IsPossessingNode':                return new IsPossessingNode();
    // AI Controller nodes
    case 'AIMoveToNode':                    return new AIMoveToNode();
    case 'AIStopMovementNode':              return new AIStopMovementNode();
    case 'AISetFocalPointNode':             return new AISetFocalPointNode();
    case 'AIClearFocalPointNode':           return new AIClearFocalPointNode();
    case 'AIStartPatrolNode':               return new AIStartPatrolNode();
    case 'AIStopPatrolNode':                return new AIStopPatrolNode();
    case 'AIStartFollowingNode':            return new AIStartFollowingNode();
    case 'AIStopFollowingNode':             return new AIStopFollowingNode();
    case 'GetAIStateNode':                  return new GetAIStateNode();
    case 'AIHasReachedTargetNode':          return new AIHasReachedTargetNode();
    case 'AIGetDistanceToTargetNode':       return new AIGetDistanceToTargetNode();
    // Controller ↔ Pawn
    case 'GetControllerNode':               return new GetControllerNode();
    case 'GetControllerTypeNode':           return new GetControllerTypeNode();
    case 'GetPawnNode':                     return new GetPawnNode();
    case 'IsPlayerControlledNode':          return new IsPlayerControlledNode();
    case 'IsAIControlledNode':              return new IsAIControlledNode();

    // Casting & Reference nodes
    case 'CastToNode':                      return new CastToNode(d.targetClassId || '', d.targetClassName || 'Unknown');
    case 'GetSelfReferenceNode':            return new GetSelfReferenceNode();
    case 'GetPlayerPawnNode':               return new GetPlayerPawnNode();
    case 'GetActorByNameNode':              return new GetActorByNameNode();
    case 'GetAllActorsOfClassNode':         return new GetAllActorsOfClassNode(d.targetClassId || '', d.targetClassName || 'Unknown');
    case 'IsValidNode':                     return new IsValidNode();
    case 'GetActorNameNode':                return new GetActorNameNode();
    case 'GetActorVariableNode':            return new GetActorVariableNode(d.varName || 'Unknown', d.varType || 'Float', d.targetActorId || '');
    case 'SetActorVariableNode':            return new SetActorVariableNode(d.varName || 'Unknown', d.varType || 'Float', d.targetActorId || '');
    case 'GetOwnerNode':                    return new GetOwnerNode();
    case 'GetAnimInstanceNode':             return new GetAnimInstanceNode();
    case 'PureCastNode':                    return new PureCastNode(d.targetClassId || '', d.targetClassName || 'Unknown');
    case 'CallActorFunctionNode': {
      // Reconstruct inputs/outputs from serialized data
      const fnInputs = (d.fnInputs || []).map((i: any) => ({ name: i.name, type: i.type as VarType }));
      const fnOutputs = (d.fnOutputs || []).map((o: any) => ({ name: o.name, type: o.type as VarType }));
      return new CallActorFunctionNode(d.funcId || '', d.funcName || 'Unknown', d.targetActorId || '', fnInputs, fnOutputs);
    }

    // Animation BP nodes
    case 'AnimUpdateEventNode':             return new AnimUpdateEventNode();
    case 'TryGetPawnOwnerNode':             return new TryGetPawnOwnerNode();
    case 'SetAnimVarNode':                  return new SetAnimVarNode(d.varName || 'speed', d.varType || 'number');
    case 'GetAnimVarNode':                  return new GetAnimVarNode(d.varName || 'speed', d.varType || 'number');
    // Widget / UI nodes
    case 'CreateWidgetNode':                return new CreateWidgetNode(d.widgetBPId || '', d.widgetBPName || '(none)');
    case 'AddToViewportNode':               return new AddToViewportNode();
    case 'RemoveFromViewportNode':          return new RemoveFromViewportNode();
    case 'SetWidgetTextNode': {
      const n = new SetWidgetTextNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetWidgetTextNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'GetWidgetTextNode': {
      const n = new GetWidgetTextNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] GetWidgetTextNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetWidgetVisibilityNode': {
      const n = new SetWidgetVisibilityNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetWidgetVisibilityNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetWidgetColorNode': {
      const n = new SetWidgetColorNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetWidgetColorNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetWidgetOpacityNode': {
      const n = new SetWidgetOpacityNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetWidgetOpacityNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetProgressBarPercentNode': {
      const n = new SetProgressBarPercentNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetProgressBarPercentNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'GetProgressBarPercentNode': {
      const n = new GetProgressBarPercentNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] GetProgressBarPercentNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetSliderValueNode': {
      const n = new SetSliderValueNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetSliderValueNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'GetSliderValueNode': {
      const n = new GetSliderValueNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] GetSliderValueNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetCheckBoxStateNode': {
      const n = new SetCheckBoxStateNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetCheckBoxStateNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'GetCheckBoxStateNode': {
      const n = new GetCheckBoxStateNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] GetCheckBoxStateNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'IsWidgetVisibleNode': {
      const n = new IsWidgetVisibleNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] IsWidgetVisibleNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'PlayWidgetAnimationNode':         return new PlayWidgetAnimationNode();
    case 'SetInputModeNode':                return new SetInputModeNode();
    case 'ShowMouseCursorNode':             return new ShowMouseCursorNode();
    // Widget Instance Interaction Nodes
    case 'GetWidgetVariableNode': {
      const n = new GetWidgetVariableNode(d.widgetBPId || '', d.widgetBPName || '(none)', d.variableName || '');
      // Populate available variables from widget blueprint
      if (d.widgetBPId && _widgetBPMgr) {
        const widgetBP = _widgetBPMgr.getAsset(d.widgetBPId);
        if (widgetBP && n.variableControl) {
          const variables = (widgetBP.blueprintData.variables || []).map((v: any) => ({
            name: v.name,
            type: v.type,
          }));
          n.variableControl.setAvailableVariables(variables);
        }
      }
      return n;
    }
    case 'SetWidgetVariableNode': {
      const n = new SetWidgetVariableNode(d.widgetBPId || '', d.widgetBPName || '(none)', d.variableName || '');
      // Populate available variables from widget blueprint
      if (d.widgetBPId && _widgetBPMgr) {
        const widgetBP = _widgetBPMgr.getAsset(d.widgetBPId);
        if (widgetBP && n.variableControl) {
          const variables = (widgetBP.blueprintData.variables || []).map((v: any) => ({
            name: v.name,
            type: v.type,
          }));
          n.variableControl.setAvailableVariables(variables);
        }
      }
      return n;
    }
    case 'CallWidgetFunctionNode': {
      const n = new CallWidgetFunctionNode(
        d.widgetBPId || '',
        d.widgetBPName || '(none)',
        d.functionName || '',
        d.functionInputs || [],
        d.functionOutputs || []
      );
      // Populate available functions from widget blueprint
      if (d.widgetBPId && _widgetBPMgr) {
        const widgetBP = _widgetBPMgr.getAsset(d.widgetBPId);
        if (widgetBP && n.functionControl) {
          const functions = (widgetBP.blueprintData.functions || []).map((f: any) => ({
            name: f.name,
            inputs: f.inputs || [],
            outputs: f.outputs || [],
          }));
          n.functionControl.setAvailableFunctions(functions);
        }
      }
      return n;
    }
    case 'CallWidgetEventNode': {
      const n = new CallWidgetEventNode(
        d.widgetBPId || '',
        d.widgetBPName || '(none)',
        d.eventName || '',
        d.eventParams || []
      );
      // Populate available events from widget blueprint
      if (d.widgetBPId && _widgetBPMgr) {
        const widgetBP = _widgetBPMgr.getAsset(d.widgetBPId);
        if (widgetBP && n.eventControl) {
          const events = (widgetBP.blueprintData.customEvents || []).map((e: any) => ({
            name: e.name,
            params: e.params || [],
          }));
          n.eventControl.setAvailableEvents(events);
        }
      }
      return n;
    }
    // Widget Event Nodes
    case 'ButtonOnClickedNode': {
      const widgetValue = d.controls?.widgetSelector || '';
      console.log(`[Deserialize] ButtonOnClickedNode widgetSelector from saved data: "${widgetValue}"`);
      const n = new ButtonOnClickedNode(widgetValue);
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
        console.log(`[Deserialize] Set widgetSelector to: "${d.controls.widgetSelector}"`);
      }
      return n;
    }
    case 'ButtonOnPressedNode': {
      const n = new ButtonOnPressedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'ButtonOnReleasedNode': {
      const n = new ButtonOnReleasedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'ButtonOnHoveredNode': {
      const n = new ButtonOnHoveredNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'ButtonOnUnhoveredNode': {
      const n = new ButtonOnUnhoveredNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'TextBoxOnTextChangedNode': {
      const n = new TextBoxOnTextChangedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'TextBoxOnTextCommittedNode': {
      const n = new TextBoxOnTextCommittedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'SliderOnValueChangedNode': {
      const n = new SliderOnValueChangedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'CheckBoxOnCheckStateChangedNode': {
      const n = new CheckBoxOnCheckStateChangedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }

    // Scene & Game Instance nodes
    case 'OpenSceneNode': {
      const n = new OpenSceneNode();
      if (d.sceneName) (n.controls['scene'] as SceneSelectControl)?.setValue(d.sceneName);
      return n;
    }
    case 'LoadSceneNode': {
      const n = new LoadSceneNode();
      if (d.sceneName) (n.controls['scene'] as SceneSelectControl)?.setValue(d.sceneName);
      return n;
    }
    case 'GetGameInstanceNode':              return new GetGameInstanceNode();
    case 'GetGameInstanceVariableNode': {
      const n = new GetGameInstanceVariableNode();
      if (d.varName) (n.controls['varName'] as GameInstanceVarNameControl)?.setValue(d.varName);
      return n;
    }
    case 'SetGameInstanceVariableNode': {
      const n = new SetGameInstanceVariableNode();
      if (d.varName) (n.controls['varName'] as GameInstanceVarNameControl)?.setValue(d.varName);
      return n;
    }

    // Texture reference nodes
    case 'GetTextureIDNode': {
      const n = new GetTextureIDNode(
        d.controls?.textureSelect?.id || '',
        d.controls?.textureSelect?.name || '(none)'
      );
      return n;
    }
    case 'FindTextureByNameNode':            return new FindTextureByNameNode();
    case 'GetTextureInfoNode':               return new GetTextureInfoNode();
    case 'LoadTextureNode':                  return new LoadTextureNode();

    // Widget enhanced nodes with texture pickers
    case 'SetImageTextureNode': {
      const n = new SetImageTextureNode(
        d.controls?.textureSelect?.id || '',
        d.controls?.textureSelect?.name || '(none)'
      );
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        n.widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'SetButtonTextureNode': {
      const n = new SetButtonTextureNode(
        d.controls?.textureSelect?.id || '',
        d.controls?.textureSelect?.name || '(none)'
      );
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        n.widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }

    // Spawning nodes
    case 'SpawnActorFromClassNode': {
      const n = new SpawnActorFromClassNode(d.targetClassId || '', d.targetClassName || '');
      if (Array.isArray(d.exposedVars) && d.exposedVars.length > 0) {
        n.setExposedVars(d.exposedVars);
      }
      return n;
    }

    // Character Movement 2D nodes
    case 'AddMovementInput2DNode':           return new AddMovementInput2DNode();
    case 'Jump2DNode':                       return new Jump2DNode();
    case 'StopJump2DNode':                   return new StopJump2DNode();
    case 'LaunchCharacter2DNode':            return new LaunchCharacter2DNode();
    case 'SetMaxWalkSpeed2DNode':            return new SetMaxWalkSpeed2DNode();
    case 'GetMaxWalkSpeed2DNode':            return new GetMaxWalkSpeed2DNode();
    case 'IsGrounded2DNode':                 return new IsGrounded2DNode();
    case 'IsJumping2DNode':                  return new IsJumping2DNode();
    case 'IsFalling2DNode':                  return new IsFalling2DNode();
    case 'GetCharacterVelocity2DNode':       return new GetCharacterVelocity2DNode();
    case 'AddCharacterImpulse2DNode':        return new AddCharacterImpulse2DNode();
    case 'StopMovement2DNode':               return new StopMovement2DNode();
    case 'SetJumpHeight2DNode':              return new SetJumpHeight2DNode();
    case 'SetMaxJumps2DNode':                return new SetMaxJumps2DNode();
    case 'GetJumpsRemaining2DNode':          return new GetJumpsRemaining2DNode();
    case 'SetGravityMultiplier2DNode':       return new SetGravityMultiplier2DNode();
    case 'FlipSpriteDirection2DNode':        return new FlipSpriteDirection2DNode();
    case 'SetAirControl2DNode':              return new SetAirControl2DNode();
    case 'GetSpriteFacingDirection2DNode':   return new GetSpriteFacingDirection2DNode();
    case 'GetCharacterSpeed2DNode':          return new GetCharacterSpeed2DNode();

    // Save/Load nodes (UE-style)
    case 'CreateSaveGameObjectNode': {
      const n = new CreateSaveGameObjectNode(d.saveGameId || '', d.saveGameName || '(none)');
      return n;
    }
    case 'SaveGameToSlotNode':               return new SaveGameToSlotNode();
    case 'LoadGameFromSlotNode':             return new LoadGameFromSlotNode();
    case 'DeleteGameInSlotNode':             return new DeleteGameInSlotNode();

    // ForEachLoop nodes
    case 'ForEachLoopNode':                    return new ForEachLoopNode();
    case 'ForEachLoopWithBreakNode':           return new ForEachLoopWithBreakNode();
    case 'ForEachActorLoopNode':               return new ForEachActorLoopNode();

    // Drag Selection nodes
    case 'EnableDragSelectionNode':            return new EnableDragSelectionNode();
    case 'DisableDragSelectionNode':           return new DisableDragSelectionNode();
    case 'SetDragSelectionEnabledNode':        return new SetDragSelectionEnabledNode();
    case 'OnDragSelectionCompleteNode':        return new OnDragSelectionCompleteNode();
    case 'GetSelectedActorsNode':              return new GetSelectedActorsNode();
    case 'GetSelectedActorAtIndexNode':        return new GetSelectedActorAtIndexNode();
    case 'SetDragSelectionClassFilterNode': {
      const n = new SetDragSelectionClassFilterNode();
      const ac = n.controls['actorClass'] as ActorClassSelectControl | undefined;
      if (ac && d.controls?.actorClass) { ac.setValue(d.controls.actorClass.id || '', d.controls.actorClass.name || ''); }
      return n;
    }
    case 'AddDragSelectionClassFilterNode': {
      const n = new AddDragSelectionClassFilterNode();
      const ac = n.controls['actorClass'] as ActorClassSelectControl | undefined;
      if (ac && d.controls?.actorClass) { ac.setValue(d.controls.actorClass.id || '', d.controls.actorClass.name || ''); }
      return n;
    }
    case 'ClearDragSelectionClassFilterNode':  return new ClearDragSelectionClassFilterNode();
    case 'SetDragSelectionStyleNode':          return new SetDragSelectionStyleNode();
    case 'IsDragSelectingNode':                return new IsDragSelectingNode();
    case 'GetDragSelectionCountNode':          return new GetDragSelectionCountNode();

    // Event Bus nodes
    case 'EmitEventNode': {
      const n = new EmitEventNode();
      if (d.controls?.eventId) {
        const ctrl = n.controls['eventId'] as EventSelectControl | undefined;
        if (ctrl) ctrl.setValue(d.controls.eventId);
      }
      n.syncPayloadPins();
      return n;
    }
    case 'OnEventNode': {
      const n = new OnEventNode();
      if (d.controls?.eventId) {
        const ctrl = n.controls['eventId'] as EventSelectControl | undefined;
        if (ctrl) ctrl.setValue(d.controls.eventId);
      }
      n.syncPayloadPins();
      return n;
    }

    // ── AI Blueprint Nodes (explicit entries for deserialization) ──
    case 'AIReceiveExecuteNode':
    case 'AI Receive Execute':              return new AIReceiveExecuteNode();
    case 'AIReceiveTickNode':
    case 'AI Receive Tick':                 return new AIReceiveTickNode();
    case 'AIReceiveAbortNode':
    case 'AI Receive Abort':                return new AIReceiveAbortNode();
    case 'FinishExecuteNode':
    case 'Finish Execute':                  return new FinishExecuteNode();
    case 'AIPerformConditionCheckNode':
    case 'AI Perform Condition Check':      return new AIPerformConditionCheckNode();
    case 'AIObserverActivatedNode':
    case 'AI Observer Activated':           return new AIObserverActivatedNode();
    case 'AIObserverDeactivatedNode':
    case 'AI Observer Deactivated':         return new AIObserverDeactivatedNode();
    case 'ReturnNode':
    case 'Return':                          return new ReturnNode();
    case 'AIServiceActivatedNode':
    case 'AI Service Activated':            return new AIServiceActivatedNode();
    case 'AIServiceTickNode':
    case 'AI Service Tick':                 return new AIServiceTickNode();
    case 'AIServiceDeactivatedNode':
    case 'AI Service Deactivated':          return new AIServiceDeactivatedNode();
    case 'OnPossessNode':
    case 'On Possess':                      return new OnPossessNode();
    case 'OnUnpossessNode':
    case 'On Unpossess':                    return new OnUnpossessNode();
    case 'OnMoveCompletedNode':
    case 'On Move Completed':               return new OnMoveCompletedNode();
    case 'OnPerceptionUpdatedNode':
    case 'On Perception Updated':           return new OnPerceptionUpdatedNode();
    case 'RunBehaviorTreeNode':
    case 'Run Behavior Tree': {
      const n = new RunBehaviorTreeNode();
      if (d.selectedBTId) {
        const btCtrl = n.controls['btSelect'] as BTSelectControl | undefined;
        if (btCtrl) btCtrl.setValue(d.selectedBTId);
        n.selectedBTId = d.selectedBTId;
        n.selectedBTName = d.selectedBTName || '';
      }
      return n;
    }
    case 'MoveToLocationNode':
    case 'Move To Location':                return new MoveToLocationNode();
    case 'GetBlackboardValueNode':
    case 'Get Blackboard Value':            return new GetBlackboardValueNode();
    case 'SetBlackboardValueNode':
    case 'Set Blackboard Value':            return new SetBlackboardValueNode();
    case 'ClearBlackboardValueNode':
    case 'Clear Blackboard Value':          return new ClearBlackboardValueNode();
    case 'RotateToFaceNode':
    case 'Rotate To Face':                  return new RotateToFaceNode();

    default: {
      // Fallback: try NODE_PALETTE factory for registered nodes (trace nodes, physics 2D, etc.)
      const paletteEntry = NODE_PALETTE.find(e => e.label === nd.type || e.label === d.label);
      if (paletteEntry && paletteEntry.factory) {
        const n = paletteEntry.factory();
        // Restore input-level controls (e.g. drawDebug BoolSelectControl)
        if (d.inputControls) {
          for (const [key, val] of Object.entries(d.inputControls)) {
            const ctrl = (n.inputs as any)?.[key]?.control;
            if (ctrl && typeof ctrl.setValue === 'function') ctrl.setValue(val as number);
          }
        }
        // Restore BTSelectControl values (e.g. RunBehaviorTreeNode)
        if (n instanceof RunBehaviorTreeNode && d.selectedBTId) {
          const btCtrl = n.controls['btSelect'] as BTSelectControl | undefined;
          if (btCtrl) btCtrl.setValue(d.selectedBTId);
          n.selectedBTId = d.selectedBTId;
          n.selectedBTName = d.selectedBTName || '';
        }
        // Restore general controls saved as { id, name } or simple values
        if (d.controls) {
          for (const [key, val] of Object.entries(d.controls)) {
            const ctrl = n.controls[key];
            if (ctrl instanceof BTSelectControl && val && typeof val === 'object' && 'id' in (val as any)) {
              ctrl.setValue((val as any).id);
            } else if (ctrl && typeof (ctrl as any).setValue === 'function' && typeof val !== 'object') {
              (ctrl as any).setValue(val);
            }
          }
        }
        return n;
      }
      console.warn(`[deserialize] Unknown node type: ${nd.type}`);
      return null;
    }
  }
}

/** Populate widget selectors in all event nodes with available widgets */
async function populateWidgetSelectors(
  editor: NodeEditor<Schemes>,
  widgetList: Array<{ name: string; type: string }>,
  area?: AreaPlugin<Schemes, any>,
): Promise<void> {
  console.log('[NodeEditor] populateWidgetSelectors called with', widgetList.length, 'widgets:', widgetList);
  let populated = 0;
  for (const node of editor.getNodes()) {
    // Check if the node has a widgetSelector control
    if ((node as any).widgetSelector && (node as any).widgetSelector instanceof WidgetSelectorControl) {
      const selector = (node as any).widgetSelector as WidgetSelectorControl;
      console.log(`[NodeEditor] Populating widget selector for node "${node.label}"`);
      selector.setAvailableWidgets(widgetList);
      console.log(`[NodeEditor] After setAvailableWidgets, selector has ${selector.availableWidgets.length} widgets`);
      populated++;
      // Trigger re-render of the node
      if (area) {
        await area.update('node', node.id);
      }
    }
  }
  console.log(`[NodeEditor] Populated ${populated} widget selectors out of ${editor.getNodes().length} total nodes`);
}

/** Restore a graph from serialized data */
async function deserializeGraph(
  editor: NodeEditor<Schemes>,
  area: AreaPlugin<Schemes, any>,
  graphData: any,
  bp: import('./BlueprintData').BlueprintData,
): Promise<void> {
  if (!graphData || !Array.isArray(graphData.nodes)) return;

  // Map old serialized IDs → new Rete node IDs
  const idMap = new Map<string, string>();

  for (const nd of graphData.nodes) {
    const node = createNodeFromData(nd, bp);
    if (!node) continue;

    await editor.addNode(node);
    idMap.set(nd.id, node.id);

    if (nd.position) {
      await area.translate(node.id, { x: nd.position.x, y: nd.position.y });
    }
  }

  // Restore connections (remapping IDs)
  for (const conn of graphData.connections || []) {
    const newSource = idMap.get(conn.source);
    const newTarget = idMap.get(conn.target);
    if (!newSource || !newTarget) continue;

    const sourceNode = editor.getNode(newSource);
    const targetNode = editor.getNode(newTarget);
    if (!sourceNode || !targetNode) continue;

    try {
      await editor.addConnection(
        new ClassicPreset.Connection(sourceNode, conn.sourceOutput, targetNode, conn.targetInput),
      );
    } catch { /* skip invalid connections */ }
  }
}

// ============================================================
//  Rete editor factory — sets up a single graph editor in a container
// ============================================================
async function createGraphEditor(
  container: HTMLElement,
  bp: import('./BlueprintData').BlueprintData,
  graphType: GraphType,
  currentFuncId: string | null,
  onChanged: () => void,
  onNodeDoubleClick?: (node: ClassicPreset.Node) => void,
  componentEntries?: ComponentNodeEntry[],
  widgetList?: Array<{ name: string; type: string }>,
) {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, any>(container);
  const connection = new ConnectionPlugin<Schemes, any>();
  const reactPlugin = new ReactPlugin<Schemes, any>({ createRoot });

  reactPlugin.addPreset(Presets.classic.setup({
    customize: {
      node(context) {
        const node = context.payload;

        const category = getNodeCategory(node);
        const color = NODE_CATEGORY_COLORS[category] || '#546E7A';
        const icon = getCategoryIcon(category);
        return (props: any) => {
          return React.createElement('div', {
            className: 'fe-node',
            'data-category': category,
            style: { '--node-color': color } as any,
          },
            React.createElement('div', { className: 'fe-node-cat-strip' },
              React.createElement('span', { className: 'fe-node-cat-icon', dangerouslySetInnerHTML: { __html: icon } }),
              React.createElement('span', { className: 'fe-node-cat-label' }, category),
            ),
            React.createElement(Presets.classic.Node, props),
          );
        };
      },
      socket(data) {
        const sock = data.payload as ClassicPreset.Socket;
        const color = socketColor(sock);
        return (props: any) => {
          const isExec = sock.name === 'Exec';
          const isArray = sock.name === 'ActorArray';
          const isActorRef = sock.name === 'ActorRef';

          // Array sockets render as a diamond (rotated square) like UE
          if (isArray) {
            return React.createElement('div', {
              className: 'socket socket-array',
              title: 'Actor Array',
              'data-socket-type': sock.name,
              style: {
                background: color,
                width: 10,
                height: 10,
                borderRadius: '2px',
                border: '2px solid rgba(0,0,0,0.35)',
                display: 'inline-block',
                cursor: 'pointer',
                boxSizing: 'border-box' as const,
                transform: 'rotate(45deg)',
                transition: 'box-shadow 0.15s ease, transform 0.1s ease',
              },
            });
          }

          // Actor ref sockets render as a slightly larger circle with a ring
          if (isActorRef) {
            return React.createElement('div', {
              className: 'socket socket-actor-ref',
              title: 'Actor Reference',
              'data-socket-type': sock.name,
              style: {
                background: color,
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)',
                display: 'inline-block',
                cursor: 'pointer',
                boxSizing: 'border-box' as const,
                transition: 'box-shadow 0.15s ease, transform 0.1s ease',
              },
            });
          }

          return React.createElement('div', {
            className: `socket${isExec ? ' socket-exec' : ''}`,
            title: sock.name,
            'data-socket-type': sock.name,
            style: {
              background: color,
              width: isExec ? 14 : 12,
              height: isExec ? 14 : 12,
              borderRadius: isExec ? '2px' : '50%',
              border: `2px solid ${isExec ? '#666' : 'rgba(0,0,0,0.35)'}`,
              display: 'inline-block',
              cursor: 'pointer',
              boxSizing: 'border-box' as const,
              transition: 'box-shadow 0.15s ease, transform 0.1s ease',
            },
          });
        };
      },
      control(data) {
        if (data.payload instanceof ColorPickerControl) {
          const ctrl = data.payload as ColorPickerControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('input', {
              type: 'color',
              value: val,
              onChange: (e: any) => { const v = e.target.value; ctrl.setValue(v); setVal(v); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                height: 28,
                padding: 2,
                background: '#1e1e2e',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                cursor: 'pointer',
                boxSizing: 'border-box' as const,
              },
            });
          };
        }
        if (data.payload instanceof BoolSelectControl) {
          const ctrl = data.payload as BoolSelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { const v = Number(e.target.value); ctrl.setValue(v); setVal(v); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: val ? '#4caf50' : '#e74c3c',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { value: 1, style: { color: '#4caf50' } }, 'True'),
              React.createElement('option', { value: 0, style: { color: '#e74c3c' } }, 'False'),
            );
          };
        }
        if (data.payload instanceof MovementModeSelectControl) {
          const ctrl = data.payload as MovementModeSelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#64b5f6',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              ...MOVEMENT_MODES.map(m =>
                React.createElement('option', { key: m, value: m }, m.charAt(0).toUpperCase() + m.slice(1)),
              ),
            );
          };
        }
        if (data.payload instanceof SceneSelectControl) {
          const ctrl = data.payload as SceneSelectControl;
          return (_props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const [scenes, setScenes] = React.useState<string[]>([]);

            React.useEffect(() => {
              const provider = getSceneListProvider();
              if (provider) {
                provider().then(list => setScenes(list));
              }
            }, []);

            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#64b5f6',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 120,
              },
            },
              React.createElement('option', { value: '', disabled: true }, '-- Select Scene --'),
              ...scenes.map(s =>
                React.createElement('option', { key: s, value: s }, s),
              ),
            );
          };
        }
        if (data.payload instanceof ActorClassSelectControl) {
          const ctrl = data.payload as ActorClassSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            const actors: { id: string; name: string }[] = _actorAssetMgr
              ? _actorAssetMgr.assets.map((a: any) => ({ id: a.id, name: a.name }))
              : [];
            const filtered = search
              ? actors.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
              : actors;

            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            const onSelectActor = (id: string, name: string) => {
              ctrl.setValue(id, name);
              setSelected(name || '(none)');
              setOpen(false);
              setSearch('');
              // Populate Expose on Spawn input pins automatically
              const parentNode = (ctrl as any).__parentNode as SpawnActorFromClassNode | undefined;
              if (parentNode) {
                const asset = _actorAssetMgr?.getAsset(id);
                const expVars = ((asset?.blueprintData?.variables ?? []) as any[])
                  .filter((v: any) => v.exposeOnSpawn)
                  .map((v: any) => ({ name: v.name, type: v.type, varId: v.id }));
                parentNode.setExposedVars(expVars);
                area.update('node', parentNode.id);
              }
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 140 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#ff9800',
                  border: open ? '1px solid #ff9800' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              open && React.createElement('div', {
                style: {
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: 180,
                  overflowY: 'auto' as const,
                  background: '#1a1a2e',
                  border: '1px solid #ff9800',
                  borderRadius: '0 0 4px 4px',
                  zIndex: 9999,
                },
              },
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search actors...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                ...filtered.map(a =>
                  React.createElement('div', {
                    key: a.id,
                    onClick: () => onSelectActor(a.id, a.name),
                    style: {
                      padding: '5px 8px',
                      fontSize: 11,
                      color: a.id === ctrl.value ? '#ff9800' : '#e0e0e0',
                      fontWeight: a.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    React.createElement('span', { style: { marginRight: 4, fontSize: 9, color: '#ff9800' }, dangerouslySetInnerHTML: { __html: iconHTML(Icons.Diamond, 'xs', '#ff9800') } }),
                    a.name,
                  ),
                ),
                filtered.length === 0 && actors.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching actors'),
                actors.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No actor assets yet'),
              ),
            );
          };
        }
        if (data.payload instanceof RefreshNodesControl) {
          const ctrl = data.payload as RefreshNodesControl;
          return (_props: any) => React.createElement('button', {
            onPointerDown: (e: any) => e.stopPropagation(),
            onClick: () => {
              const parentNode = (ctrl as any).__parentNode as SpawnActorFromClassNode | undefined;
              if (parentNode && parentNode.targetClassId && _actorAssetMgr) {
                const asset = _actorAssetMgr.getAsset(parentNode.targetClassId);
                const expVars = ((asset?.blueprintData?.variables ?? []) as any[])
                  .filter((v: any) => v.exposeOnSpawn)
                  .map((v: any) => ({ name: v.name, type: v.type, varId: v.id }));
                parentNode.setExposedVars(expVars);
                area.update('node', parentNode.id);
              }
            },
            style: {
              width: '100%',
              padding: '3px 6px',
              background: '#1a2a1a',
              color: '#66bb6a',
              border: '1px solid #2e7d32',
              borderRadius: 4,
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'center' as const,
              marginTop: 2,
            },
          }, '\u21bb Refresh Exposed Pins');
        }
        if (data.payload instanceof GameInstanceVarNameControl) {
          const ctrl = data.payload as GameInstanceVarNameControl;
          return (_props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('input', {
              type: 'text',
              value: val,
              placeholder: 'Variable Name',
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#81c784',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                outline: 'none',
                minWidth: 100,
              },
            });
          };
        }
        if (data.payload instanceof SaveGameSelectControl) {
          const ctrl = data.payload as SaveGameSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Gather save game classes from the manager
            const saveGames: { id: string; name: string }[] = [];
            if (_saveGameMgr) {
              for (const asset of _saveGameMgr.assets) {
                saveGames.push({ id: asset.id, name: asset.name });
              }
            }
            const filtered = search
              ? saveGames.filter(sg => sg.name.toLowerCase().includes(search.toLowerCase()))
              : saveGames;

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            const dropdownStyle: any = {
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 160,
              overflowY: 'auto',
              background: '#1a1a2e',
              border: '1px solid #4a9eff',
              borderRadius: '0 0 4px 4px',
              zIndex: 9999,
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 140 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Button showing current selection
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#e0e0e0',
                  border: open ? '1px solid #4a9eff' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown panel
              open && React.createElement('div', { style: dropdownStyle },
                // Search input
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search save games...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                // Option: (none)
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '(none)');
                    setSelected('(none)');
                    setOpen(false);
                    setSearch('');
                    // Sync node fields
                    const parentNode = (ctrl as any)._parentNode;
                    if (parentNode) {
                      parentNode.saveGameId = '';
                      parentNode.saveGameName = '(none)';
                    }
                  },
                  style: {
                    padding: '5px 8px',
                    fontSize: 11,
                    color: '#888',
                    fontStyle: 'italic' as const,
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                // SaveGame options
                ...filtered.map(sg =>
                  React.createElement('div', {
                    key: sg.id,
                    onClick: () => {
                      ctrl.setValue(sg.id, sg.name);
                      setSelected(sg.name);
                      setOpen(false);
                      setSearch('');
                      // Sync node fields
                      const parentNode = (ctrl as any)._parentNode;
                      if (parentNode) {
                        parentNode.saveGameId = sg.id;
                        parentNode.saveGameName = sg.name;
                      }
                    },
                    style: {
                      padding: '5px 8px',
                      fontSize: 11,
                      color: sg.id === ctrl.value ? '#4a9eff' : '#e0e0e0',
                      fontWeight: sg.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    React.createElement('span', { style: { marginRight: 6, fontSize: 10 } }, ''),
                    sg.name,
                  ),
                ),
                filtered.length === 0 && saveGames.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching save games'),
                saveGames.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No save game classes yet'),
              ),
            );
          };
        }

        if (data.payload instanceof WidgetBPSelectControl) {
          const ctrl = data.payload as WidgetBPSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Gather widget blueprints from the manager
            const widgets: { id: string; name: string }[] = [];
            if (_widgetBPMgr) {
              for (const asset of _widgetBPMgr.assets) {
                widgets.push({ id: asset.id, name: asset.name });
              }
            }
            const filtered = search
              ? widgets.filter(w => w.name.toLowerCase().includes(search.toLowerCase()))
              : widgets;

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            const dropdownStyle: any = {
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 160,
              overflowY: 'auto',
              background: '#1a1a2e',
              border: '1px solid #4a9eff',
              borderRadius: '0 0 4px 4px',
              zIndex: 9999,
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 140 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Button showing current selection
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#e0e0e0',
                  border: open ? '1px solid #4a9eff' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown panel
              open && React.createElement('div', { style: dropdownStyle },
                // Search input
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search widgets...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                // Option: (none)
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '(none)');
                    setSelected('(none)');
                    setOpen(false);
                    setSearch('');
                    // Sync node fields and clear dropdowns
                    const parentNode = (ctrl as any)._parentNode;
                    if (parentNode) {
                      parentNode.widgetBPId = '';
                      parentNode.widgetBPName = '(none)';
                      // Clear variable/function/event selectors
                      if (parentNode.variableControl) {
                        parentNode.variableControl.setAvailableVariables([]);
                      }
                      if (parentNode.functionControl) {
                        parentNode.functionControl.setAvailableFunctions([]);
                      }
                      if (parentNode.eventControl) {
                        parentNode.eventControl.setAvailableEvents([]);
                      }
                    }
                  },
                  style: {
                    padding: '5px 8px',
                    fontSize: 11,
                    color: '#888',
                    fontStyle: 'italic' as const,
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                // Widget options
                ...filtered.map(w =>
                  React.createElement('div', {
                    key: w.id,
                    onClick: () => {
                      ctrl.setValue(w.id, w.name);
                      setSelected(w.name);
                      setOpen(false);
                      setSearch('');
                      // Sync node fields
                      const parentNode = (ctrl as any)._parentNode;
                      if (parentNode) {
                        parentNode.widgetBPId = w.id;
                        parentNode.widgetBPName = w.name;

                        // Populate variable/function selectors from widget blueprint data
                        if (_widgetBPMgr) {
                          const widgetBP = _widgetBPMgr.getAsset(w.id);
                          if (widgetBP) {
                            // Populate variables for GetWidgetVariableNode and SetWidgetVariableNode
                            if (parentNode.variableControl) {
                              const variables = (widgetBP.blueprintData.variables || []).map((v: any) => ({
                                name: v.name,
                                type: v.type,
                              }));
                              parentNode.variableControl.setAvailableVariables(variables);
                              console.log(`[NodeEditor] Populated ${variables.length} variables for widget "${w.name}"`);
                            }

                            // Populate functions for CallWidgetFunctionNode
                            if (parentNode.functionControl) {
                              const functions = (widgetBP.blueprintData.functions || []).map((f: any) => ({
                                name: f.name,
                                inputs: f.inputs || [],
                                outputs: f.outputs || [],
                              }));
                              parentNode.functionControl.setAvailableFunctions(functions);
                              console.log(`[NodeEditor] Populated ${functions.length} functions for widget "${w.name}"`);
                            }

                            // Populate events for CallWidgetEventNode
                            if (parentNode.eventControl) {
                              const events = (widgetBP.blueprintData.customEvents || []).map((e: any) => ({
                                name: e.name,
                                params: e.params || [],
                              }));
                              parentNode.eventControl.setAvailableEvents(events);
                              console.log(`[NodeEditor] Populated ${events.length} events for widget "${w.name}"`);
                            }
                          }
                        }
                      }
                    },
                    style: {
                      padding: '5px 8px',
                      fontSize: 11,
                      color: w.id === ctrl.value ? '#4a9eff' : '#e0e0e0',
                      fontWeight: w.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    React.createElement('span', { style: { marginRight: 6, fontSize: 10 } }, ''),
                    w.name,
                  ),
                ),
                filtered.length === 0 && widgets.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching widgets'),
                widgets.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No widget blueprints yet'),
              ),
            );
          };
        }

        // ── Texture Select Control (searchable dropdown) ──────────
        if (data.payload instanceof TextureSelectControl) {
          const ctrl = data.payload as TextureSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Gather textures from the TextureLibrary singleton
            const textures: { id: string; name: string; thumbnail: string; width: number; height: number }[] = [];
            const lib = TextureLibrary.instance;
            if (lib) {
              for (const t of lib.allTextures) {
                textures.push({
                  id: t.assetId,
                  name: t.assetName,
                  thumbnail: t.thumbnail || '',
                  width: t.metadata?.width ?? 0,
                  height: t.metadata?.height ?? 0,
                });
              }
            }
            const filtered = search
              ? textures.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
              : textures;

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            // Sync display if the control value changes externally (e.g. deserialization)
            React.useEffect(() => {
              setSelected(ctrl.displayName || '(none)');
            }, [ctrl.displayName]);

            const dropdownStyle: any = {
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 200,
              overflowY: 'auto',
              background: '#1a1a2e',
              border: '1px solid #4a9eff',
              borderRadius: '0 0 4px 4px',
              zIndex: 9999,
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 160 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Button showing current selection
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#e0e0e0',
                  border: open ? '1px solid #4a9eff' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown panel
              open && React.createElement('div', { style: dropdownStyle },
                // Search input
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search textures...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                // Option: (none)
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '(none)');
                    setSelected('(none)');
                    setOpen(false);
                    setSearch('');
                  },
                  style: {
                    padding: '5px 8px',
                    fontSize: 11,
                    color: '#888',
                    fontStyle: 'italic' as const,
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                // Texture options with thumbnails
                ...filtered.map(tex =>
                  React.createElement('div', {
                    key: tex.id,
                    onClick: () => {
                      ctrl.setValue(tex.id, tex.name);
                      setSelected(tex.name);
                      setOpen(false);
                      setSearch('');
                    },
                    style: {
                      padding: '4px 8px',
                      fontSize: 11,
                      color: tex.id === ctrl.value ? '#4a9eff' : '#e0e0e0',
                      fontWeight: tex.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    // Thumbnail
                    tex.thumbnail
                      ? React.createElement('img', {
                          src: tex.thumbnail,
                          style: {
                            width: 24,
                            height: 24,
                            objectFit: 'cover' as const,
                            borderRadius: 2,
                            border: '1px solid #333',
                            flexShrink: 0,
                          },
                        })
                      : React.createElement('div', {
                          style: {
                            width: 24,
                            height: 24,
                            background: '#333',
                            borderRadius: 2,
                            border: '1px solid #444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            color: '#666',
                            flexShrink: 0,
                          },
                        }, React.createElement('span', { dangerouslySetInnerHTML: { __html: iconHTML(Icons.Image, 10, '#666') } })),
                    // Name + dimensions
                    React.createElement('div', { style: { display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' } },
                      React.createElement('span', {
                        style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
                      }, tex.name),
                      tex.width > 0 && React.createElement('span', {
                        style: { fontSize: 9, color: '#666' },
                      }, `${tex.width}×${tex.height}`),
                    ),
                  ),
                ),
                filtered.length === 0 && textures.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching textures'),
                textures.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No textures imported yet'),
              ),
            );
          };
        }

        // ── Sound Cue Select Control ────────────────────────────────
        if (data.payload instanceof SoundCueSelectControl) {
          const ctrl = data.payload as SoundCueSelectControl;
          return (_props: any) => {
            const [search, setSearch] = React.useState('');
            const [open, setOpen] = React.useState(false);
            const [selected, setSelected] = React.useState(ctrl.displayName || '(none)');
            const containerRef = React.useRef<HTMLDivElement>(null);

            // Gather Sound Cues from the SoundLibrary singleton
            const cues: { id: string; name: string; info: string }[] = [];
            const lib = SoundLibrary.instance;
            if (lib) {
              for (const cue of lib.allCues) {
                const wpCount = (cue.nodes || []).filter((nd: any) => nd.type === 'wavePlayer').length;
                const nodeCount = (cue.nodes || []).length;
                cues.push({
                  id: cue.assetId,
                  name: cue.assetName,
                  info: `${wpCount} sound${wpCount !== 1 ? 's' : ''} · ${nodeCount} nodes`,
                });
              }
            }
            const filtered = search
              ? cues.filter(cu => cu.name.toLowerCase().includes(search.toLowerCase()))
              : cues;

            // Close on outside click
            React.useEffect(() => {
              if (!open) return;
              const handler = (e: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                  setOpen(false);
                  setSearch('');
                }
              };
              document.addEventListener('mousedown', handler, true);
              return () => document.removeEventListener('mousedown', handler, true);
            }, [open]);

            React.useEffect(() => {
              setSelected(ctrl.displayName || '(none)');
            }, [ctrl.displayName]);

            const dropdownStyle: any = {
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 200,
              overflowY: 'auto',
              background: '#1a1a2e',
              border: '1px solid #4a9eff',
              borderRadius: '0 0 4px 4px',
              zIndex: 9999,
            };

            return React.createElement('div', {
              ref: containerRef,
              style: { position: 'relative', width: '100%', minWidth: 160 },
              onPointerDown: (e: any) => e.stopPropagation(),
            },
              // Button showing current selection
              React.createElement('div', {
                onClick: () => setOpen(!open),
                style: {
                  width: '100%',
                  padding: '4px 6px',
                  background: '#1e1e2e',
                  color: selected === '(none)' ? '#888' : '#e0e0e0',
                  border: open ? '1px solid #4a9eff' : '1px solid #3a3a5c',
                  borderRadius: open ? '4px 4px 0 0' : 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box' as const,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none' as const,
                },
              },
                React.createElement('span', {
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
                }, selected),
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' }, dangerouslySetInnerHTML: { __html: open ? iconHTML(Icons.ChevronUp, 'xs') : iconHTML(Icons.ChevronDown, 'xs') } }),
              ),
              // Dropdown panel
              open && React.createElement('div', { style: dropdownStyle },
                // Search input
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search sound cues...',
                  value: search,
                  autoFocus: true,
                  onChange: (e: any) => setSearch(e.target.value),
                  onPointerDown: (e: any) => e.stopPropagation(),
                  onKeyDown: (e: any) => e.stopPropagation(),
                  style: {
                    width: '100%',
                    padding: '5px 8px',
                    background: '#141422',
                    color: '#e0e0e0',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    fontSize: 11,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  },
                }),
                // Option: (none)
                React.createElement('div', {
                  onClick: () => {
                    ctrl.setValue('', '(none)');
                    setSelected('(none)');
                    setOpen(false);
                    setSearch('');
                    // Sync parent node soundCueId
                    const parentNode = (ctrl as any).__parentNode;
                    if (parentNode) parentNode.soundCueId = '';
                  },
                  style: {
                    padding: '5px 8px',
                    fontSize: 11,
                    color: '#888',
                    fontStyle: 'italic' as const,
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                }, '(none)'),
                // Sound Cue options
                ...filtered.map(cue =>
                  React.createElement('div', {
                    key: cue.id,
                    onClick: () => {
                      ctrl.setValue(cue.id, cue.name);
                      setSelected(cue.name);
                      setOpen(false);
                      setSearch('');
                      // Sync parent node soundCueId
                      const parentNode = (ctrl as any).__parentNode;
                      if (parentNode) parentNode.soundCueId = cue.id;
                    },
                    style: {
                      padding: '4px 8px',
                      fontSize: 11,
                      color: cue.id === ctrl.value ? '#4a9eff' : '#e0e0e0',
                      fontWeight: cue.id === ctrl.value ? 700 : 400,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    },
                    onMouseEnter: (e: any) => { e.currentTarget.style.background = '#2a2a4a'; },
                    onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
                  },
                    // Sound icon
                    React.createElement('span', {
                      style: { flexShrink: 0, display: 'flex', alignItems: 'center' },
                      dangerouslySetInnerHTML: { __html: iconHTML(Icons.Volume2, 14, cue.id === ctrl.value ? '#4a9eff' : '#888') },
                    }),
                    // Name + info
                    React.createElement('div', { style: { display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' } },
                      React.createElement('span', {
                        style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
                      }, cue.name),
                      React.createElement('span', {
                        style: { fontSize: 9, color: '#666' },
                      }, cue.info),
                    ),
                  ),
                ),
                filtered.length === 0 && cues.length > 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No matching sound cues'),
                cues.length === 0 &&
                  React.createElement('div', { style: { padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' as const } }, 'No sound cues created yet'),
              ),
            );
          };
        }

        // ── Widget Variable Selector Control ────────────────────────
        if (data.payload instanceof WidgetVariableSelectorControl) {
          const ctrl = data.payload as WidgetVariableSelectorControl;
          return (_props: any) => {
            const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

            // Sync React re-renders when control value changes externally
            React.useEffect(() => {
              const checkValue = () => forceUpdate();
              const timer = setInterval(checkValue, 100);
              return () => clearInterval(timer);
            }, []);

            const variables = ctrl.availableVariables || [];
            const currentValue = ctrl.value || '';

            return React.createElement('select', {
              value: currentValue,
              onChange: (e: any) => {
                const newValue = e.target.value;
                ctrl.setValue(newValue);
                console.log(`[WidgetVariableSelector] Selected variable: "${newValue}"`);
                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: currentValue ? '#e0e0e0' : '#888',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select variable)'),
              ...variables.map((v: any) =>
                React.createElement('option', { key: v.name, value: v.name }, `${v.name} (${v.type})`),
              ),
              variables.length === 0 && React.createElement('option', { key: '__empty', value: '', disabled: true }, 'No variables available'),
            );
          };
        }

        // ── Widget Function Selector Control ────────────────────────
        if (data.payload instanceof WidgetFunctionSelectorControl) {
          const ctrl = data.payload as WidgetFunctionSelectorControl;
          return (_props: any) => {
            const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

            // Sync React re-renders when control value changes externally
            React.useEffect(() => {
              const checkValue = () => forceUpdate();
              const timer = setInterval(checkValue, 100);
              return () => clearInterval(timer);
            }, []);

            const functions = ctrl.availableFunctions || [];
            const currentValue = ctrl.value || '';

            return React.createElement('select', {
              value: currentValue,
              onChange: (e: any) => {
                const newValue = e.target.value;
                ctrl.setValue(newValue);
                console.log(`[WidgetFunctionSelector] Selected function: "${newValue}"`);

                // Rebuild node pins when function changes
                const parentNode = (ctrl as any)._parentNode;
                if (parentNode && parentNode instanceof CallWidgetFunctionNode) {
                  const selectedFunc = functions.find((f: any) => f.name === newValue);
                  if (selectedFunc) {
                    parentNode.rebuildPins(selectedFunc.inputs || [], selectedFunc.outputs || []);
                    console.log(`[WidgetFunctionSelector] Rebuilt pins for function "${newValue}"`);
                    area.update('node', parentNode.id);
                  }
                }

                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: currentValue ? '#e0e0e0' : '#888',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select function)'),
              ...functions.map((f: any) =>
                React.createElement('option', { key: f.name, value: f.name }, f.name),
              ),
              functions.length === 0 && React.createElement('option', { key: '__empty', value: '', disabled: true }, 'No functions available'),
            );
          };
        }

        // ── Widget Event Selector Control ──────────────────────────
        if (data.payload instanceof WidgetEventSelectorControl) {
          const ctrl = data.payload as WidgetEventSelectorControl;
          return (_props: any) => {
            const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

            // Sync React re-renders when control value changes externally
            React.useEffect(() => {
              const checkValue = () => forceUpdate();
              const timer = setInterval(checkValue, 100);
              return () => clearInterval(timer);
            }, []);

            const events = ctrl.availableEvents || [];
            const currentValue = ctrl.value || '';

            return React.createElement('select', {
              value: currentValue,
              onChange: (e: any) => {
                const newValue = e.target.value;
                ctrl.setValue(newValue);
                console.log(`[WidgetEventSelector] Selected event: "${newValue}"`);

                // Rebuild node pins when event changes
                const parentNode = (ctrl as any)._parentNode;
                if (parentNode && parentNode instanceof CallWidgetEventNode) {
                  const selectedEvent = events.find((ev: any) => ev.name === newValue);
                  if (selectedEvent) {
                    parentNode.rebuildPins(selectedEvent.params || []);
                    console.log(`[WidgetEventSelector] Rebuilt pins for event "${newValue}"`);
                    area.update('node', parentNode.id);
                  }
                }

                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: currentValue ? '#e0e0e0' : '#888',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select event)'),
              ...events.map((ev: any) =>
                React.createElement('option', { key: ev.name, value: ev.name }, ev.name),
              ),
              events.length === 0 && React.createElement('option', { key: '__empty', value: '', disabled: true }, 'No events available'),
            );
          };
        }

        if (data.payload instanceof ActionMappingSelectControl) {
          const ctrl = data.payload as ActionMappingSelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const mappings = React.useMemo(() => {
              const mgr = InputMappingAssetManager.getInstance();
              const allActions = new Set<string>();
              for (const asset of mgr.assets) {
                for (const m of asset.actionMappings) allActions.add(m.name);
              }
              return Array.from(allActions);
            }, []);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select action)'),
              ...mappings.map(m =>
                React.createElement('option', { key: m, value: m }, m),
              ),
            );
          };
        }

        if (data.payload instanceof AxisMappingSelectControl) {
          const ctrl = data.payload as AxisMappingSelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const mappings = React.useMemo(() => {
              const mgr = InputMappingAssetManager.getInstance();
              const allAxes = new Set<string>();
              for (const asset of mgr.assets) {
                for (const m of asset.axisMappings) allAxes.add(m.name);
              }
              return Array.from(allAxes);
            }, []);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { key: '__none', value: '' }, '(select axis)'),
              ...mappings.map(m =>
                React.createElement('option', { key: m, value: m }, m),
              ),
            );
          };
        }

        if (data.payload instanceof KeySelectControl) {
          const ctrl = data.payload as KeySelectControl;
          return (props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => { ctrl.setValue(e.target.value); setVal(e.target.value); },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              ...INPUT_KEYS.map(k =>
                React.createElement('option', { key: k, value: k }, k),
              ),
            );
          };
        }
        if (data.payload instanceof EventSelectControl) {
          const ctrl = data.payload as EventSelectControl;
          return (_props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
            const options = ctrl.getOptions();
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => {
                const newVal = e.target.value;
                const parentNode = (ctrl as any)._parentNode;
                if (parentNode) {
                  // Capture connections to dynamic pins before sync removes them
                  const conns = editor.getConnections().filter(
                    (c: any) => c.source === parentNode.id || c.target === parentNode.id
                  );
                  // setValue triggers syncPayloadPins() which rebuilds dynamic pins
                  ctrl.setValue(newVal);
                  setVal(newVal);
                  // Remove stale connections whose pins no longer exist
                  (async () => {
                    for (const c of conns) {
                      if (c.source === parentNode.id && !parentNode.outputs[c.sourceOutput]) {
                        try { await editor.removeConnection(c.id); } catch { /* ok */ }
                      }
                      if (c.target === parentNode.id && !parentNode.inputs[c.targetInput]) {
                        try { await editor.removeConnection(c.id); } catch { /* ok */ }
                      }
                    }
                    area.update('node', parentNode.id);
                  })();
                } else {
                  ctrl.setValue(newVal);
                  setVal(newVal);
                }
                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: val ? '#ef4444' : '#666',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 120,
              },
            },
              React.createElement('option', { value: '' }, '-- Select Event --'),
              ...options.map(o =>
                React.createElement('option', { key: o.id, value: o.id }, o.name),
              ),
            );
          };
        }
        if (data.payload instanceof BTSelectControl) {
          const ctrl = data.payload as BTSelectControl;
          return (_props: any) => {
            const [val, setVal] = React.useState(ctrl.value);
            const options = ctrl.getOptions();
            return React.createElement('select', {
              value: val,
              onChange: (e: any) => {
                const newVal = e.target.value;
                ctrl.setValue(newVal);
                setVal(newVal);
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: val ? '#4fc3f7' : '#666',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 140,
              },
            },
              React.createElement('option', { value: '' }, '-- Select Behavior Tree --'),
              ...options.map(o =>
                React.createElement('option', { key: o.id, value: o.id }, o.name),
              ),
            );
          };
        }
        if (data.payload instanceof WidgetSelectorControl) {
          const ctrl = data.payload as WidgetSelectorControl;
          return (props: any) => {
            // Use the control value directly as the source of truth, not local state
            // This ensures we always reflect the actual control value
            const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

            // Sync React re-renders when control value changes externally
            React.useEffect(() => {
              const checkValue = () => forceUpdate();
              const timer = setInterval(checkValue, 100);
              return () => clearInterval(timer);
            }, []);

            const widgets = ctrl.availableWidgets || [];
            const currentValue = ctrl.value || '';

            return React.createElement('select', {
              value: currentValue,
              onChange: (e: any) => {
                const newValue = e.target.value;
                ctrl.setValue(newValue);
                console.log(`[WidgetSelector] Control value set to: "${newValue}"`);
                forceUpdate();
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: widgets.length === 0 ? '#666' : (currentValue ? '#e0e0e0' : '#999'),
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              },
            },
              React.createElement('option', { value: '' }, widgets.length === 0 ? '(No widgets)' : '(Select Widget)'),
              ...widgets.map(w =>
                React.createElement('option', { key: w.name, value: w.name },
                  ctrl.widgetType ? `${w.name}` : `${w.name} (${w.type})`
                ),
              ),
            );
          };
        }
        if (data.payload instanceof ClassicPreset.InputControl) {
          const ctrl = data.payload as ClassicPreset.InputControl<'number' | 'text'>;
          return (props: any) => {
            const [val, setVal] = React.useState<string | number>(ctrl.value ?? (ctrl.type === 'number' ? 0 : ''));
            return React.createElement('input', {
              type: ctrl.type === 'number' ? 'number' : 'text',
              value: val,
              onChange: (e: any) => {
                const raw = e.target.value;
                const parsed = ctrl.type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
                ctrl.setValue(parsed as any);
                setVal(raw);
              },
              onPointerDown: (e: any) => e.stopPropagation(),
              onDoubleClick: (e: any) => e.stopPropagation(),
              onKeyDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box' as const,
              },
            });
          };
        }
        return null;
      },
    },
  }));
  connection.addPreset(ConnectionPresets.classic.setup());
  editor.use(area);
  area.use(connection);
  area.use(reactPlugin);

  // ── Track last pointer position for connectiondrop menu placement ──
  let _lastPointerX = 0;
  let _lastPointerY = 0;
  container.addEventListener('pointermove', (e) => {
    const rect = container.getBoundingClientRect();
    _lastPointerX = e.clientX - rect.left;
    _lastPointerY = e.clientY - rect.top;
  }, true);

  // ── Drag-from-pin context menu (UE-style) ──
  // When user drags a wire from a pin and drops on empty space,
  // show a context menu filtered to compatible nodes.
  // For ClassRef_<id> pins, show the target actor's variables, functions, events.
  connection.addPipe((ctx) => {
    if (ctx.type !== 'connectiondrop') return ctx;
    const { initial, socket, created } = ctx.data as {
      initial: { nodeId: string; side: 'input' | 'output'; key: string; element: HTMLElement };
      socket: { nodeId: string; side: string; key: string } | null;
      created: boolean;
    };
    // Only handle drops on empty space (no target socket, no connection created)
    if (socket || created) return ctx;

    // Find the source node and its socket
    const srcNode = editor.getNode(initial.nodeId);
    if (!srcNode) return ctx;

    let srcSocket: ClassicPreset.Socket | null = null;
    if (initial.side === 'output') {
      const out = srcNode.outputs[initial.key];
      srcSocket = out?.socket ?? null;
    } else {
      const inp = srcNode.inputs[initial.key];
      srcSocket = inp?.socket ?? null;
    }
    if (!srcSocket) return ctx;

    // Don't show menu for exec pins — they just want to wire to execution
    if (srcSocket.name === 'Exec') return ctx;

    // Determine screen position for the context menu
    const cx = _lastPointerX;
    const cy = _lastPointerY;

    // Determine if this is a typed class reference pin
    let targetActorId: string | null = null;
    let targetActorName: string | null = null;
    if (srcSocket.name.startsWith('ClassRef_')) {
      targetActorId = srcSocket.name.replace('ClassRef_', '');
    }
    // If it's a generic ObjectRef, we can still offer generic casting options
    const isObjectPin = srcSocket.name === 'ObjectRef' || srcSocket.name.startsWith('ClassRef_');

    // Look up the target actor's blueprint data if we have a class ref
    let targetBp: import('./BlueprintData').BlueprintData | null = null;
    let targetActorType: string | undefined;
    let targetComponents: ActorComponentData[] | undefined;
    let targetRootMeshType: string | undefined;
    if (targetActorId && _actorAssetMgr) {
      const asset = _actorAssetMgr.assets.find(a => a.id === targetActorId);
      if (asset) {
        targetBp = asset.blueprintData;
        targetActorName = asset.name;
        targetActorType = asset.actorType;
        targetComponents = asset.components;
        targetRootMeshType = asset.rootMeshType;
      }
    }

    // Show the drag-from-pin context menu
    setTimeout(() => {
      showDragPinContextMenu(
        container, cx, cy,
        srcSocket!,
        initial,
        targetActorId,
        targetActorName,
        targetBp,
        isObjectPin,
        bp,
        graphType,
        async (node, connectToKey) => {
          // Add the node and position it
          await editor.addNode(node);
          const t = area.area.transform;
          await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });

          // Auto-connect: wire the new node to the original pin
          if (connectToKey) {
            try {
              if (initial.side === 'output') {
                // Dragged from an output — connect to the new node's input
                await editor.addConnection(
                  new ClassicPreset.Connection(srcNode, initial.key, node, connectToKey)
                );
              } else {
                // Dragged from an input — connect new node's output to the original input
                await editor.addConnection(
                  new ClassicPreset.Connection(node, connectToKey, srcNode, initial.key)
                );
              }
            } catch (e) {
              // Connection might fail if sockets are incompatible — that's OK
            }
          }
          onChanged();
        },
        targetActorType,
        targetComponents,
        targetRootMeshType,
      );
    }, 10);

    return ctx;
  });

  // ── Selection state (declared early so area pipes can reference it) ──
  const selectedNodeIds = new Set<string>();
  let _lastPointerEvent: PointerEvent | null = null;
  container.addEventListener('pointerdown', (e) => {
    _lastPointerEvent = e;
  }, true);

  // ── UE-style controls: block Rete's default left-click area pan ──
  let _leftMouseDown = false;
  container.addEventListener('pointerdown', (e) => {
    if (e.button === 0) _leftMouseDown = true;
  }, true);
  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) _leftMouseDown = false;
  });

  // Right-click pan state (declared early so contextmenu handler can reference _rcMoved)
  let _rcDown = false;
  let _rcMoved = false;
  let _rcStartX = 0, _rcStartY = 0;
  let _rcStartTx = 0, _rcStartTy = 0;

  // ── Connection wire coloring by socket type ──
  area.addPipe((ctx) => {
    if (ctx.type === 'rendered') {
      const d = ctx.data as any;
      if (d.type === 'connection' && d.data && d.element) {
        const conn = d.data;
        const el = d.element as HTMLElement;
        const srcNode = editor.getNode(conn.source);
        if (srcNode) {
          const output = srcNode.outputs[conn.sourceOutput];
          if (output?.socket) {
            const wireColor = socketColor(output.socket);
            const isExec = output.socket.name === 'Exec';
            const path = el.querySelector('path');
            if (path) {
              path.setAttribute('stroke', wireColor);
              path.setAttribute('stroke-width', isExec ? '3.5' : '2');
              if (isExec) path.classList.add('fe-exec-wire');
            }
          }
        }
      }
      // Add category + ID attributes to rendered node elements
      if (d.type === 'node' && d.data && d.element) {
        const nodeObj = d.data;
        const outerEl = d.element as HTMLElement;
        const cat = getNodeCategory(nodeObj);
        // Stamp on outer wrapper (NodeView.element)
        outerEl.setAttribute('data-node-category', cat);
        outerEl.setAttribute('data-node-id', nodeObj.id);
        // Also stamp on inner [data-testid="node"] React element
        const innerEl = outerEl.querySelector('[data-testid="node"]') as HTMLElement | null;
        if (innerEl) {
          innerEl.setAttribute('data-node-id', nodeObj.id);
        }
        // Apply initial selection state on BOTH elements
        const isSel = selectedNodeIds.has(nodeObj.id);
        outerEl.classList.toggle('fe-selected', isSel);
        outerEl.setAttribute('data-selected', isSel ? 'true' : 'false');
        if (innerEl) {
          innerEl.classList.toggle('fe-selected', isSel);
          innerEl.classList.toggle('selected', isSel);
        }
      }
    }
    return ctx;
  });

  // ── Socket type-safety: auto-insert conversion nodes or block incompatible ──
  editor.addPipe((ctx) => {
    if (ctx.type === 'connectioncreate') {
      const { data } = ctx as any;
      const srcNode = editor.getNode(data.source);
      const tgtNode = editor.getNode(data.target);
      if (srcNode && tgtNode) {
        const srcOutput = srcNode.outputs[data.sourceOutput];
        const tgtInput  = tgtNode.inputs[data.targetInput];
        if (srcOutput?.socket && tgtInput?.socket) {
          if (!socketsCompatible(srcOutput.socket, tgtInput.socket)) {
            // Check for an auto-conversion
            const conv = getConversion(srcOutput.socket.name, tgtInput.socket.name);
            if (conv) {
              // Schedule auto-insertion asynchronously (pipe must return synchronously)
              setTimeout(async () => {
                try {
                  const convNode = conv.factory();
                  await editor.addNode(convNode);

                  // Position the conversion node between source and target
                  const srcView = area.nodeViews.get(srcNode.id);
                  const tgtView = area.nodeViews.get(tgtNode.id);
                  const sx = srcView?.position.x ?? 0;
                  const sy = srcView?.position.y ?? 0;
                  const tx = tgtView?.position.x ?? sx + 300;
                  const ty = tgtView?.position.y ?? sy;
                  await area.translate(convNode.id, {
                    x: (sx + tx) / 2,
                    y: (sy + ty) / 2,
                  });

                  const ca = new ClassicPreset.Connection(srcNode, data.sourceOutput, convNode, 'in');
                  await editor.addConnection(ca as any);
                  const cb = new ClassicPreset.Connection(convNode, 'out', tgtNode, data.targetInput);
                  await editor.addConnection(cb as any);
                } catch (err) {
                  console.error('[Feather] Auto-conversion failed:', err);
                }
              }, 0);

              return undefined as any; // block the original (incompatible) connection
            }

            console.warn(
              `[Feather] Blocked connection: ${srcOutput.socket.name} → ${tgtInput.socket.name}`,
            );
            return undefined as any;           // block the connection
          }
        }
      }
    }
    return ctx;
  });

  // ── Block Rete's built-in left-click area pan (UE-style: only right-click pans) ──
  area.addPipe((ctx) => {
    if (ctx.type === 'translate') {
      // Block area translate when left mouse is held (Rete's default drag-to-pan).
      // Programmatic translates (zoomAt, etc.) happen without mouse down so are allowed.
      if (_leftMouseDown) return undefined;
    }
    return ctx;
  });

  // Right-click context menu + pan
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // If the user was right-click-dragging to pan, don't show the menu
    if (_rcMoved) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Check if right-click is on a node — show node actions menu
    const targetEl = e.target as HTMLElement;
    const nodeEl = targetEl.closest('[data-testid="node"]') as HTMLElement | null;
    if (nodeEl) {
      // Find which node was right-clicked
      const clickedNode = editor.getNodes().find(n => {
        const view = area.nodeViews.get(n.id);
        if (!view) return false;
        const nodeContainer = (view as any).element as HTMLElement | undefined;
        return nodeContainer === nodeEl || nodeEl.contains(nodeContainer as Node) || (nodeContainer && nodeContainer.contains(nodeEl));
      });
      if (clickedNode || selectedNodeIds.size > 0) {
        const existingMenu = container.querySelector('.bp-context-menu');
        if (existingMenu) existingMenu.remove();
        const menu = document.createElement('div');
        menu.className = 'bp-context-menu fe-node-action-menu';
        menu.style.left = cx + 'px';
        menu.style.top = cy + 'px';
        const header = document.createElement('div');
        header.className = 'bp-context-header';
        header.textContent = 'Node Actions';
        menu.appendChild(header);
        // Disable/Enable
        const isDisabled = clickedNode ? (clickedNode as any).__disabled : false;
        const disableItem = document.createElement('div');
        disableItem.className = 'bp-context-item';
        disableItem.innerHTML = isDisabled ? iconHTML(Icons.Check, 12, ICON_COLORS.success) + ' Enable Node' : iconHTML(Icons.XCircle, 12, ICON_COLORS.warning) + ' Disable Node';
        disableItem.addEventListener('click', () => {
          const targets = selectedNodeIds.size > 0 ? editor.getNodes().filter(n => selectedNodeIds.has(n.id)) : (clickedNode ? [clickedNode] : []);
          for (const n of targets) {
            (n as any).__disabled = !(n as any).__disabled;
            // Update visual
            const view = area.nodeViews.get(n.id);
            if (view) {
              const el = (view as any).element as HTMLElement | undefined;
              if (el) el.classList.toggle('fe-node-disabled', !!(n as any).__disabled);
            }
          }
          menu.remove();
          onChanged();
        });
        menu.appendChild(disableItem);
        // Delete
        const deleteItem = document.createElement('div');
        deleteItem.className = 'bp-context-item';
        deleteItem.innerHTML = iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete';
        deleteItem.addEventListener('click', () => {
          const targets = selectedNodeIds.size > 0 ? [...selectedNodeIds] : (clickedNode ? [clickedNode.id] : []);
          pushUndo('Delete nodes');
          (async () => {
            for (const nid of targets) {
              const node = editor.getNode(nid);
              const conns = editor.getConnections().filter(c => c.source === nid || c.target === nid);
              for (const c of conns) { try { await editor.removeConnection(c.id); } catch { /* ok */ } }
              try { await editor.removeNode(nid); } catch { /* ok */ }
            }
          })();
          selectedNodeIds.clear();
          menu.remove();
        });
        menu.appendChild(deleteItem);
        // Duplicate
        const dupItem = document.createElement('div');
        dupItem.className = 'bp-context-item';
        dupItem.innerHTML = iconHTML(Icons.Copy, 12, ICON_COLORS.muted) + ' Duplicate';
        dupItem.addEventListener('click', () => {
          const targets = selectedNodeIds.size > 0 ? editor.getNodes().filter(n => selectedNodeIds.has(n.id)) : (clickedNode ? [clickedNode] : []);
          (async () => {
            const idMap = new Map<string, string>();
            for (const sn of targets) {
              const sd = { type: getNodeTypeName(sn), data: getNodeSerialData(sn) };
              const node = createNodeFromData(sd, bp);
              if (!node) continue;
              await editor.addNode(node);
              idMap.set(sn.id, node.id);
              const v = area.nodeViews.get(sn.id);
              await area.translate(node.id, { x: (v?.position.x ?? 0) + 40, y: (v?.position.y ?? 0) + 40 });
            }
          })();
          menu.remove();
        });
        menu.appendChild(dupItem);
        container.appendChild(menu);
        const closeHandler = (ev: MouseEvent) => { if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('mousedown', closeHandler); } };
        setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
        return;
      }
    }

    showContextMenu(container, cx, cy, bp, graphType, currentFuncId,
      async (entry) => {
        const node = entry.factory();
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (v, mode) => {
        const sf = v.type.startsWith('Struct:') ? bp.structs.find(s => s.id === v.type.slice(7))?.fields : undefined;
        const node = mode === 'get'
          ? new GetVariableNode(v.id, v.name, v.type, sf)
          : new SetVariableNode(v.id, v.name, v.type, sf);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (fn) => {
        const node = new FunctionCallNode(fn.id, fn.name, fn.inputs, fn.outputs);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (m) => {
        const node = new MacroCallNode(m.id, m.name, m.inputs, m.outputs);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (evt) => {
        const node = new CallCustomEventNode(evt.id, evt.name, evt.params);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (lv, mode) => {
        const sf = lv.type.startsWith('Struct:') ? bp.structs.find(s => s.id === lv.type.slice(7))?.fields : undefined;
        const node = mode === 'get'
          ? new GetVariableNode(lv.id, lv.name, lv.type, sf)
          : new SetVariableNode(lv.id, lv.name, lv.type, sf);
        (node as any).__isLocal = true;
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      async (s, mode) => {
        const node = mode === 'make'
          ? new MakeStructNode(s.id, s.name, s.fields)
          : new BreakStructNode(s.id, s.name, s.fields);
        await editor.addNode(node);
        const t = area.area.transform;
        await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
      },
      (type) => {
        if (type === 'axis') {
          // Input Axis — create directly with default keys (user can modify in properties)
          (async () => {
            const node = new InputAxisNode('D', 'A');
            await editor.addNode(node);
            const t = area.area.transform;
            await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
          })();
        } else {
          const title = type === 'event' ? 'Input Key Event' : 'Is Key Down';
          showKeySelectDialog(container, title, async (key) => {
            const node = type === 'event'
              ? new InputKeyEventNode(key)
              : new IsKeyDownNode(key);
            await editor.addNode(node);
            const t = area.area.transform;
            await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
          });
        }
      },
      componentEntries,
    );
  });

  // Drop items from sidebar (variables, functions, macros, custom events)
  // Use capture phase so events fire before Rete's internal elements can block them
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, true);
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const raw = e.dataTransfer!.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      const rect = container.getBoundingClientRect();
      const t = area.area.transform;
      const dropX = (e.clientX - rect.left - t.x) / t.k;
      const dropY = (e.clientY - rect.top - t.y) / t.k;

      if (data.varId) {
        // Variable drop (global or local)
        const mode = e.ctrlKey ? 'set' : 'get';
        const vType: VarType = data.varType;
        const sf = vType.startsWith('Struct:') ? bp.structs.find(s => s.id === vType.slice(7))?.fields : undefined;
        const node = mode === 'get'
          ? new GetVariableNode(data.varId, data.varName, vType, sf)
          : new SetVariableNode(data.varId, data.varName, vType, sf);
        if (data.isLocal) (node as any).__isLocal = true;
        await editor.addNode(node);
        await area.translate(node.id, { x: dropX, y: dropY });
      } else if (data.dragType === 'function') {
        // Function drop — create FunctionCallNode
        const fn = bp.getFunction(data.funcId);
        if (fn) {
          const node = new FunctionCallNode(fn.id, fn.name, fn.inputs, fn.outputs);
          await editor.addNode(node);
          await area.translate(node.id, { x: dropX, y: dropY });
        }
      } else if (data.dragType === 'macro') {
        // Macro drop — create MacroCallNode
        const m = bp.getMacro(data.macroId);
        if (m) {
          const node = new MacroCallNode(m.id, m.name, m.inputs, m.outputs);
          await editor.addNode(node);
          await area.translate(node.id, { x: dropX, y: dropY });
        }
      } else if (data.dragType === 'customEvent') {
        // Custom event drop — create CallCustomEventNode
        const evt = bp.customEvents.find(e => e.id === data.eventId);
        const params = evt ? evt.params : [];
        const node = new CallCustomEventNode(data.eventId, data.eventName, params);
        await editor.addNode(node);
        await area.translate(node.id, { x: dropX, y: dropY });
      }
    } catch { /* not a drag item */ }
  }, true);

  // ── Clipboard for copy/paste ──
  let _clipboard: { nodes: any[]; connections: any[]; offset: { x: number; y: number } } | null = null;

  // ── Comment boxes ──
  const comments: CommentBox[] = [];
  const commentEls = new Map<string, HTMLElement>();
  const commentLayer = document.createElement('div');
  commentLayer.className = 'fe-comment-layer';
  container.appendChild(commentLayer);

  function createCommentEl(c: CommentBox): HTMLElement {
    const el = document.createElement('div');
    el.className = 'fe-comment-box';
    el.setAttribute('data-comment-id', c.id);
    el.style.cssText = `left:${c.position.x}px;top:${c.position.y}px;width:${c.size.width}px;height:${c.size.height}px;border-color:${c.color};`;
    el.innerHTML = `<div class="fe-comment-header" style="background:${c.color}"><span class="fe-comment-text" contenteditable="true">${c.text}</span><span class="fe-comment-close">${iconHTML(Icons.X, 'xs', ICON_COLORS.muted)}</span></div><div class="fe-comment-body"></div><div class="fe-comment-resize"></div>`;
    // Make header draggable
    const header = el.querySelector('.fe-comment-header')!;
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    header.addEventListener('pointerdown', (ev: any) => {
      if ((ev.target as HTMLElement).classList.contains('fe-comment-close') || (ev.target as HTMLElement).isContentEditable) return;
      dragging = true; startX = ev.clientX; startY = ev.clientY;
      origX = c.position.x; origY = c.position.y;
      const onMove = (me: PointerEvent) => {
        if (!dragging) return;
        c.position.x = origX + (me.clientX - startX) / (area.area.transform.k);
        c.position.y = origY + (me.clientY - startY) / (area.area.transform.k);
        el.style.left = c.position.x + 'px';
        el.style.top = c.position.y + 'px';
      };
      const onUp = () => { dragging = false; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); onChanged(); };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    // Resize handle
    const resizeHandle = el.querySelector('.fe-comment-resize')!;
    resizeHandle.addEventListener('pointerdown', (ev: any) => {
      ev.stopPropagation();
      const rStartX = ev.clientX, rStartY = ev.clientY;
      const rOrigW = c.size.width, rOrigH = c.size.height;
      const onMove = (me: PointerEvent) => {
        c.size.width = Math.max(150, rOrigW + (me.clientX - rStartX) / (area.area.transform.k));
        c.size.height = Math.max(80, rOrigH + (me.clientY - rStartY) / (area.area.transform.k));
        el.style.width = c.size.width + 'px';
        el.style.height = c.size.height + 'px';
      };
      const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); onChanged(); };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    // Edit text
    const textEl = el.querySelector('.fe-comment-text') as HTMLElement;
    textEl.addEventListener('blur', () => { c.text = textEl.textContent || 'Comment'; onChanged(); });
    textEl.addEventListener('keydown', (e: any) => { if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); } });
    // Close button
    el.querySelector('.fe-comment-close')!.addEventListener('click', () => {
      const idx = comments.findIndex(x => x.id === c.id);
      if (idx >= 0) comments.splice(idx, 1);
      el.remove(); commentEls.delete(c.id); onChanged();
    });
    commentLayer.appendChild(el);
    commentEls.set(c.id, el);
    return el;
  }

  function addComment(x: number, y: number) {
    const t = area.area.transform;
    const c: CommentBox = { id: commentUid(), text: 'Comment', position: { x: (x - t.x) / t.k, y: (y - t.y) / t.k }, size: { width: 300, height: 150 }, color: '#4455aa' };
    comments.push(c);
    createCommentEl(c);
    onChanged();
  }

  // ── Undo / Redo Manager ──
  const undoMgr = new UndoManager();
  let _undoThrottle: ReturnType<typeof setTimeout> | null = null;
  function pushUndo(label: string) {
    if (_undoThrottle) clearTimeout(_undoThrottle);
    _undoThrottle = setTimeout(() => {
      const snap = serializeGraph(editor, area);
      undoMgr.push({ graphJson: snap, label });
    }, 100);
  }

  // ── Snap to Grid (20px increments, always on — hold Alt to disable) ──
  const GRID_SIZE = 20;
  area.addPipe((ctx) => {
    if (ctx.type === 'nodetranslate') {
      const d = ctx.data as any;
      if (!(_lastPointerEvent?.altKey)) {
        d.position.x = Math.round(d.position.x / GRID_SIZE) * GRID_SIZE;
        d.position.y = Math.round(d.position.y / GRID_SIZE) * GRID_SIZE;
      }
    }
    return ctx;
  });

  // Sync comment layer transform with area pan/zoom
  area.addPipe((ctx) => {
    if (ctx.type === 'translated' || ctx.type === 'zoomed' || ctx.type === 'resized') {
      const t = area.area.transform;
      commentLayer.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    }
    return ctx;
  });

  // ── Right-click drag pan (UE-style) ──
  container.addEventListener('pointerdown', (e) => {
    if (e.button === 2) {
      _rcDown = true;
      _rcMoved = false;
      _rcStartX = e.clientX;
      _rcStartY = e.clientY;
      _rcStartTx = area.area.transform.x;
      _rcStartTy = area.area.transform.y;
    }
  }, true);
  container.addEventListener('pointermove', (e) => {
    if (!_rcDown) return;
    const dx = e.clientX - _rcStartX;
    const dy = e.clientY - _rcStartY;
    if (!_rcMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      _rcMoved = true;
    }
    if (_rcMoved) {
      // Directly update the area transform and DOM for smooth panning
      const t = area.area.transform;
      t.x = _rcStartTx + dx;
      t.y = _rcStartTy + dy;
      // Update the area's content element (first child of container is the rete area content)
      const areaContent = container.querySelector(':scope > div') as HTMLElement;
      if (areaContent) {
        areaContent.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
      }
      // Sync comment layer
      commentLayer.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 2 && _rcDown) {
      _rcDown = false;
    }
  });

  // ── Box Select (drag rectangle on empty canvas) ──
  let _boxSelecting = false;
  let _boxStart = { x: 0, y: 0 };
  const boxSelRect = document.createElement('div');
  boxSelRect.className = 'fe-box-select';
  boxSelRect.style.display = 'none';
  container.appendChild(boxSelRect);

  container.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const isOnNode = target.closest('[data-testid="node"]') || target.closest('.node') || target.closest('[data-node-id]');
    const isOnComment = target.closest('.fe-comment-box');
    const isOnUI = target.closest('.bp-context-menu') || target.closest('.mybp-dialog-overlay') || target.closest('.fe-minimap');
    if (!isOnNode && !isOnComment && !isOnUI && e.button === 0) {
      // Left-click on empty canvas
      if (!e.shiftKey && !e.ctrlKey) { selectedNodeIds.clear(); syncSelectionVisuals(); }
      // Start box select
      _boxSelecting = true;
      const rect = container.getBoundingClientRect();
      _boxStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      boxSelRect.style.left = _boxStart.x + 'px';
      boxSelRect.style.top = _boxStart.y + 'px';
      boxSelRect.style.width = '0px';
      boxSelRect.style.height = '0px';
      boxSelRect.style.display = 'none';
    }
  });
  container.addEventListener('pointermove', (e) => {
    if (!_boxSelecting) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const x = Math.min(cx, _boxStart.x);
    const y = Math.min(cy, _boxStart.y);
    const w = Math.abs(cx - _boxStart.x);
    const h = Math.abs(cy - _boxStart.y);
    if (w > 4 || h > 4) {
      boxSelRect.style.display = 'block';
      boxSelRect.style.left = x + 'px';
      boxSelRect.style.top = y + 'px';
      boxSelRect.style.width = w + 'px';
      boxSelRect.style.height = h + 'px';
    }
  });
  container.addEventListener('pointerup', (e) => {
    if (!_boxSelecting) return;
    _boxSelecting = false;
    boxSelRect.style.display = 'none';
    // Select nodes within the rectangle
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const bx1 = Math.min(cx, _boxStart.x);
    const by1 = Math.min(cy, _boxStart.y);
    const bx2 = Math.max(cx, _boxStart.x);
    const by2 = Math.max(cy, _boxStart.y);
    if (bx2 - bx1 < 5 && by2 - by1 < 5) { syncSelectionVisuals(); return; } // too small, just sync
    const t = area.area.transform;
    for (const n of editor.getNodes()) {
      const v = area.nodeViews.get(n.id);
      if (!v) continue;
      // Convert node position to screen coords
      const nx = v.position.x * t.k + t.x;
      const ny = v.position.y * t.k + t.y;
      if (nx >= bx1 && nx <= bx2 && ny >= by1 && ny <= by2) {
        selectedNodeIds.add(n.id);
      }
    }
    syncSelectionVisuals();
    requestAnimationFrame(() => syncSelectionVisuals());
  });
  function syncSelectionVisuals() {
    // Apply .fe-selected on the outer wrapper (NodeView.element that has data-node-id).
    // Use the area's nodeViews to get ALL node outer elements reliably.
    // Also stamp data-selected attribute so CSS attribute selectors work even if
    // styled-components doesn't generate a .node class.
    for (const node of editor.getNodes()) {
      const view = area.nodeViews.get(node.id);
      if (!view) continue;
      const outerEl = view.element as HTMLElement;
      const isSel = selectedNodeIds.has(node.id);
      outerEl.classList.toggle('fe-selected', isSel);
      outerEl.setAttribute('data-selected', isSel ? 'true' : 'false');
      // Also mark the inner [data-testid="node"] element (styled-components node body)
      const innerEl = outerEl.querySelector('[data-testid="node"]') as HTMLElement | null;
      if (innerEl) {
        innerEl.classList.toggle('fe-selected', isSel);
        innerEl.classList.toggle('selected', isSel);
      }
    }
  }

  // ── Prevent wheel events on UI overlays from zooming the canvas ──
  container.addEventListener('wheel', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.bp-context-menu') || target.closest('.fe-minimap') || target.closest('.mybp-dialog-overlay') || target.closest('.fe-node-action-menu')) {
      e.stopPropagation();
    }
  }, true);

  // ── Keyboard shortcut handler ──
  function handleKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;

    // Delete / Backspace — delete selected nodes
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
      if (selectedNodeIds.size > 0) {
        e.preventDefault();
        pushUndo('Delete nodes');
        const ids = [...selectedNodeIds];
        selectedNodeIds.clear();
        syncSelectionVisuals();
        (async () => {
          for (const nodeId of ids) {
            const node = editor.getNode(nodeId);
            const conns = editor.getConnections().filter(c => c.source === nodeId || c.target === nodeId);
            for (const c of conns) { try { await editor.removeConnection(c.id); } catch { /* ok */ } }
            try { await editor.removeNode(nodeId); } catch { /* ok */ }
          }
        })();
      }
    }

    // Ctrl+Z — undo
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !inInput) {
      e.preventDefault();
      const state = undoMgr.undo();
      if (state) {
        (async () => {
          // Clear current graph
          for (const c of editor.getConnections()) { try { await editor.removeConnection(c.id); } catch { /* ok */ } }
          for (const n of editor.getNodes()) { try { await editor.removeNode(n.id); } catch { /* ok */ } }
          // Restore from snapshot
          await deserializeGraph(editor, area, state.graphJson, bp);
        })();
      }
    }

    // Ctrl+Y or Ctrl+Shift+Z — redo
    if (((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) && !inInput) {
      e.preventDefault();
      const state = undoMgr.redo();
      if (state) {
        (async () => {
          for (const c of editor.getConnections()) { try { await editor.removeConnection(c.id); } catch { /* ok */ } }
          for (const n of editor.getNodes()) { try { await editor.removeNode(n.id); } catch { /* ok */ } }
          await deserializeGraph(editor, area, state.graphJson, bp);
        })();
      }
    }

    // Ctrl+A — select all
    if (e.key === 'a' && (e.ctrlKey || e.metaKey) && !inInput) {
      e.preventDefault();
      for (const n of editor.getNodes()) selectedNodeIds.add(n.id);
      syncSelectionVisuals();
    }

    // F — frame selection (zoom to fit selected or all)
    if (e.key === 'f' && !inInput && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const selected = editor.getNodes().filter(n => selectedNodeIds.has(n.id));
      const targets = selected.length > 0 ? selected : editor.getNodes();
      if (targets.length > 0) AreaExtensions.zoomAt(area, targets);
    }

    // Ctrl+C — copy
    if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !inInput) {
      if (selectedNodeIds.size > 0) {
        e.preventDefault();
        const selNodes = editor.getNodes().filter(n => selectedNodeIds.has(n.id));
        const selConns = editor.getConnections().filter(c => selectedNodeIds.has(c.source) && selectedNodeIds.has(c.target));
        // Find center of selection for offset
        let cx = 0, cy = 0;
        for (const n of selNodes) {
          const v = area.nodeViews.get(n.id);
          if (v) { cx += v.position.x; cy += v.position.y; }
        }
        cx /= selNodes.length; cy /= selNodes.length;
        _clipboard = {
          nodes: selNodes.map(n => ({ type: getNodeTypeName(n), data: getNodeSerialData(n), position: area.nodeViews.get(n.id)?.position || { x: 0, y: 0 } })),
          connections: selConns.map(c => ({ source: c.source, sourceOutput: c.sourceOutput, target: c.target, targetInput: c.targetInput })),
          offset: { x: cx, y: cy },
        };
      }
    }

    // Ctrl+V — paste
    if (e.key === 'v' && (e.ctrlKey || e.metaKey) && !inInput) {
      if (_clipboard && _clipboard.nodes.length > 0) {
        e.preventDefault();
        (async () => {
          const idMap = new Map<string, string>();
          const newIds: string[] = [];
          // Get viewport center as paste target
          const rect = container.getBoundingClientRect();
          const t = area.area.transform;
          const vcx = (rect.width / 2 - t.x) / t.k;
          const vcy = (rect.height / 2 - t.y) / t.k;
          for (const nd of _clipboard!.nodes) {
            const node = createNodeFromData(nd, bp);
            if (!node) continue;
            const oldPos = nd.position || { x: 0, y: 0 };
            await editor.addNode(node);
            idMap.set(nd.type + '_' + JSON.stringify(nd.data), node.id);
            const nx = vcx + (oldPos.x - _clipboard!.offset.x) + 30;
            const ny = vcy + (oldPos.y - _clipboard!.offset.y) + 30;
            await area.translate(node.id, { x: nx, y: ny });
            newIds.push(node.id);
          }
          selectedNodeIds.clear();
          for (const id of newIds) selectedNodeIds.add(id);
          syncSelectionVisuals();
        })();
      }
    }

    // Ctrl+D — duplicate
    if (e.key === 'd' && (e.ctrlKey || e.metaKey) && !inInput) {
      if (selectedNodeIds.size > 0) {
        e.preventDefault();
        (async () => {
          const selNodes = editor.getNodes().filter(n => selectedNodeIds.has(n.id));
          const selConns = editor.getConnections().filter(c => selectedNodeIds.has(c.source) && selectedNodeIds.has(c.target));
          const idMap = new Map<string, string>();
          const newIds: string[] = [];
          for (const sn of selNodes) {
            const serialData = { type: getNodeTypeName(sn), data: getNodeSerialData(sn) };
            const node = createNodeFromData(serialData, bp);
            if (!node) continue;
            await editor.addNode(node);
            idMap.set(sn.id, node.id);
            const v = area.nodeViews.get(sn.id);
            const pos = v ? { x: v.position.x + 40, y: v.position.y + 40 } : { x: 40, y: 40 };
            await area.translate(node.id, pos);
            newIds.push(node.id);
          }
          // Restore internal connections
          for (const c of selConns) {
            const ns = idMap.get(c.source);
            const nt = idMap.get(c.target);
            if (ns && nt) {
              const sn = editor.getNode(ns);
              const tn = editor.getNode(nt);
              if (sn && tn) { try { await editor.addConnection(new ClassicPreset.Connection(sn, c.sourceOutput, tn, c.targetInput)); } catch { /* ok */ } }
            }
          }
          selectedNodeIds.clear();
          for (const id of newIds) selectedNodeIds.add(id);
          syncSelectionVisuals();
        })();
      }
    }

    // Spacebar or Ctrl+F — quick search / node menu
    if ((e.key === ' ' || (e.key === 'f' && (e.ctrlKey || e.metaKey))) && !inInput) {
      if (e.key === ' ') {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        showContextMenu(container, rect.width / 2 - 140, rect.height / 2 - 210, bp, graphType, currentFuncId,
          async (entry) => {
            const node = entry.factory();
            await editor.addNode(node);
            const t = area.area.transform;
            await area.translate(node.id, { x: (-t.x + rect.width / 2) / t.k, y: (-t.y + rect.height / 2) / t.k });
          },
          async () => {}, async () => {}, async () => {}, async () => {}, async () => {},
          async (s, mode) => {
            const node = mode === 'make' ? new MakeStructNode(s.id, s.name, s.fields) : new BreakStructNode(s.id, s.name, s.fields);
            await editor.addNode(node); const t = area.area.transform;
            await area.translate(node.id, { x: (-t.x + rect.width / 2) / t.k, y: (-t.y + rect.height / 2) / t.k });
          },
          () => {},
          componentEntries,
        );
      }
    }

    // C — add comment box (when not in input)
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !inInput) {
      const rect = container.getBoundingClientRect();
      addComment(rect.width / 2, rect.height / 2);
    }
  }
  container.setAttribute('tabindex', '0');
  container.style.outline = 'none';
  container.addEventListener('keydown', handleKeyDown);
  // Focus the container when clicking on it so key events work
  container.addEventListener('mousedown', () => {
    if (document.activeElement !== container) container.focus();
  });

  // Auto-compile on changes + push undo on structural changes
  editor.addPipe((ctx) => {
    if (['connectioncreated','connectionremoved','nodecreated','noderemoved'].includes(ctx.type)) {
      setTimeout(onChanged, 50);
      if (ctx.type === 'nodecreated' || ctx.type === 'noderemoved') pushUndo(ctx.type);
      if (ctx.type === 'connectioncreated' || ctx.type === 'connectionremoved') pushUndo(ctx.type);

      // Populate widget selectors for newly created nodes
      if (ctx.type === 'nodecreated' && widgetList && widgetList.length > 0) {
        const nodeData = ctx.data as { id: string };
        const node = editor.getNode(nodeData.id);
        if (node && (node as any).widgetSelector && (node as any).widgetSelector instanceof WidgetSelectorControl) {
          const selector = (node as any).widgetSelector as WidgetSelectorControl;
          selector.setAvailableWidgets(widgetList);
          // Trigger re-render
          setTimeout(() => area.update('node', node.id), 0);
        }
      }
    }
    return ctx;
  });

  // ── Tooltips on nodes — show description on hover ──
  area.addPipe((ctx) => {
    if (ctx.type === 'rendered') {
      const d = ctx.data as any;
      if (d.type === 'node' && d.data && d.element) {
        const nodeObj = d.data as ClassicPreset.Node;
        const el = d.element as HTMLElement;
        const cat = getNodeCategory(nodeObj);
        const inputNames = Object.keys(nodeObj.inputs).filter(k => nodeObj.inputs[k]).map(k => `${k}: ${nodeObj.inputs[k]!.socket.name}`);
        const outputNames = Object.keys(nodeObj.outputs).filter(k => nodeObj.outputs[k]).map(k => `${k}: ${nodeObj.outputs[k]!.socket.name}`);
        const tipLines = [`${nodeObj.label} [${cat}]`];
        if (inputNames.length) tipLines.push(`In: ${inputNames.join(', ')}`);
        if (outputNames.length) tipLines.push(`Out: ${outputNames.join(', ')}`);
        el.title = tipLines.join('\n');
        // Apply disabled styling if node is marked disabled
        if ((nodeObj as any).__disabled) {
          el.classList.add('fe-node-disabled');
        }
      }
    }
    return ctx;
  });

  // Save positions when nodes are moved (debounced) + push undo on move
  let _positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  area.addPipe((ctx) => {
    if (ctx.type === 'nodetranslated') {
      if (_positionSaveTimer) clearTimeout(_positionSaveTimer);
      _positionSaveTimer = setTimeout(() => { onChanged(); pushUndo('move'); }, 300);
    }
    return ctx;
  });

  // Double-click detection on nodes
  {
    let lastPickedId: string | null = null;
    let lastPickedTime = 0;
    area.addPipe((ctx) => {
      if (ctx.type === 'nodepicked') {
        const now = Date.now();
        const nodeId = (ctx.data as any).id as string;
        if (onNodeDoubleClick && nodeId === lastPickedId && now - lastPickedTime < 400) {
          const node = editor.getNode(nodeId);
          if (node) onNodeDoubleClick(node);
          lastPickedId = null;
          lastPickedTime = 0;
        } else {
          lastPickedId = nodeId;
          lastPickedTime = now;
        }

        // Update selection tracking — Shift/Ctrl = multi-select, otherwise single select
        const isMulti = _lastPointerEvent?.shiftKey || _lastPointerEvent?.ctrlKey;
        if (!isMulti) selectedNodeIds.clear();
        selectedNodeIds.add(nodeId);
        syncSelectionVisuals();
        // Re-sync after a frame in case Rete re-renders the picked node (z-order change)
        requestAnimationFrame(() => syncSelectionVisuals());
      }
      return ctx;
    });
  }

  // Cleanup helper
  const _cleanup = () => {
    container.removeEventListener('keydown', handleKeyDown);
    commentLayer.remove();
    boxSelRect.remove();
  };
  (area as any).__cleanup = _cleanup;

  return { editor, area, comments, createCommentEl };
}

// ============================================================
//  React Component
// ============================================================
interface NodeEditorViewProps {
  gameObject: GameObject;
  components?: ActorComponentData[];
  rootMeshType?: string;
  widgetList?: Array<{ name: string; type: string }>;
  isAnimBlueprint?: boolean;
}

function NodeEditorView({ gameObject, components, rootMeshType, widgetList, isAnimBlueprint }: NodeEditorViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    const bp = gameObject.blueprintData;

    // Storage for editors per graph id
    const editorStore = new Map<string, { editor: NodeEditor<Schemes>; area: AreaPlugin<Schemes, any>; el: HTMLElement; comments?: CommentBox[]; createCommentEl?: (c: CommentBox) => HTMLElement }>();
    const functionEditors = new Map<string, NodeEditor<Schemes>>();
    const macroEditors = new Map<string, NodeEditor<Schemes>>();

    // Graph tabs
    const graphTabs: GraphTab[] = [
      { id: 'eventgraph', label: 'EventGraph', type: 'event' },
    ];
    for (const fn of bp.functions) graphTabs.push({ id: fn.id, label: fn.name, type: 'function', refId: fn.id });
    for (const m of bp.macros) graphTabs.push({ id: m.id, label: m.name, type: 'macro', refId: m.id });
    let activeGraphId = 'eventgraph';

    // Build component node entries from the rules system
    const compEntries: ComponentNodeEntry[] = (components && rootMeshType)
      ? getComponentNodeEntries(components, rootMeshType)
      : [];

    // DOM structure
    const root = containerRef.current!;
    root.innerHTML = '';

    const sidebar = document.createElement('div');
    sidebar.className = 'my-blueprint-sidebar';
    root.appendChild(sidebar);

    const rightArea = document.createElement('div');
    rightArea.className = 'graph-right-area';
    root.appendChild(rightArea);

    const tabBarEl = document.createElement('div');
    rightArea.appendChild(tabBarEl);

    const graphContainer = document.createElement('div');
    graphContainer.className = 'graph-editor-area';
    rightArea.appendChild(graphContainer);

    // Minimap
    const minimap = document.createElement('div');
    minimap.className = 'fe-minimap';
    minimap.innerHTML = '<div class="fe-minimap-title">MINIMAP</div><canvas class="fe-minimap-canvas" width="160" height="100"></canvas>';
    rightArea.appendChild(minimap);
    const minimapCanvas = minimap.querySelector('.fe-minimap-canvas') as HTMLCanvasElement;
    function updateMinimap() {
      const data = editorStore.get(activeGraphId);
      if (!data || !minimapCanvas) return;
      const ctx = minimapCanvas.getContext('2d');
      if (!ctx) return;
      const nodes = data.editor.getNodes();
      if (nodes.length === 0) return;
      ctx.clearRect(0, 0, 160, 100);
      // Find bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        const v = data.area.nodeViews.get(n.id);
        if (v) { minX = Math.min(minX, v.position.x); minY = Math.min(minY, v.position.y); maxX = Math.max(maxX, v.position.x + 160); maxY = Math.max(maxY, v.position.y + 40); }
      }
      const rangeX = Math.max(maxX - minX, 1);
      const rangeY = Math.max(maxY - minY, 1);
      const pad = 10;
      const sx = (160 - pad * 2) / rangeX;
      const sy = (100 - pad * 2) / rangeY;
      const s = Math.min(sx, sy);
      for (const n of nodes) {
        const v = data.area.nodeViews.get(n.id);
        if (!v) continue;
        const x = pad + (v.position.x - minX) * s;
        const y = pad + (v.position.y - minY) * s;
        const cat = getNodeCategory(n);
        ctx.fillStyle = NODE_CATEGORY_COLORS[cat] || '#555';
        ctx.fillRect(x, y, Math.max(4, 160 * s * 0.08), Math.max(2, 40 * s * 0.08));
      }
      // Draw viewport rect
      const t = data.area.area.transform;
      const el = data.el;
      const vx = pad + (-t.x / t.k - minX) * s;
      const vy = pad + (-t.y / t.k - minY) * s;
      const vw = (el.clientWidth / t.k) * s;
      const vh = (el.clientHeight / t.k) * s;
      ctx.strokeStyle = '#5b8af566';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx, vy, vw, vh);
    }
    setInterval(() => { if (!destroyed) updateMinimap(); }, 500);

    // Compile & save
    function compileAndSave() {
      if (destroyed) return;
      const evData = editorStore.get('eventgraph');
      if (!evData) {
        console.warn('[NodeEditor] compileAndSave: No event graph data found');
        return;
      }
      console.log('[NodeEditor] Compiling widget blueprint event graph...');
      const code = generateFullCode(evData.editor, bp, functionEditors, !!widgetList, !!isAnimBlueprint);
      console.log('[NodeEditor] Generated code length:', code.length, 'characters');
      if (gameObject.scripts.length === 0) gameObject.scripts.push(new ScriptComponent());
      gameObject.scripts[0].code = code;
      gameObject.scripts[0].compile();
      console.log('[NodeEditor] Compilation complete');

      // Expose compile function on the container DOM element so external callers
      // (e.g. ActorEditorPanel Compile button) can trigger it without destroying the graph.
      if (containerRef.current) {
        (containerRef.current as any).__compileAndSave = compileAndSave;
      }

      // ── Persist graph node data into BlueprintData ──
      // Event graph
      bp.eventGraph.nodeData = serializeGraph(evData.editor, evData.area);
      bp.eventGraph.comments = evData.comments ? evData.comments.map(c => ({ ...c, position: { ...c.position }, size: { ...c.size } })) : [];
      // Function graphs
      for (const [id, fnEditor] of functionEditors) {
        const fn = bp.getFunction(id);
        const fnData = editorStore.get(id);
        if (fn && fnData) {
          fn.graph.nodeData = serializeGraph(fnEditor, fnData.area);
          fn.graph.comments = fnData.comments ? fnData.comments.map(c => ({ ...c, position: { ...c.position }, size: { ...c.size } })) : [];
        }
      }
      // Macro graphs
      for (const [id, mEditor] of macroEditors) {
        const m = bp.getMacro(id);
        const mData = editorStore.get(id);
        if (m && mData) {
          m.graph.nodeData = serializeGraph(mEditor, mData.area);
          m.graph.comments = mData.comments ? mData.comments.map(c => ({ ...c, position: { ...c.position }, size: { ...c.size } })) : [];
        }
      }
    }

    // Switch graph
    async function switchToGraph(tab: GraphTab) {
      activeGraphId = tab.id;

      // Hide all editor elements
      for (const [, data] of editorStore) {
        data.el.style.display = 'none';
      }

      let data = editorStore.get(tab.id);
      if (!data) {
        // Create new editor
        const el = document.createElement('div');
        el.className = 'graph-editor-canvas';
        graphContainer.appendChild(el);

        const funcId = tab.type === 'function' ? (tab.refId || null) : null;
        const { editor, area, comments: graphComments, createCommentEl: createCmtEl } = await createGraphEditor(el, bp, tab.type, funcId, compileAndSave, (node) => {
          if (node instanceof FunctionCallNode) {
            const funcTab = graphTabs.find(t => t.refId === (node as FunctionCallNode).funcId);
            if (funcTab) switchToGraph(funcTab);
          }
        }, compEntries, widgetList);
        data = { editor, area, el, comments: graphComments, createCommentEl: createCmtEl };
        editorStore.set(tab.id, data);

        if (tab.type === 'function') functionEditors.set(tab.id, editor);
        if (tab.type === 'macro') macroEditors.set(tab.id, editor);

        // Initialize graph
        if (tab.type === 'event') {
          await initEventGraph(editor, area);
        } else if (tab.type === 'function' && tab.refId) {
          const fn = bp.getFunction(tab.refId);
          if (fn) {
            // Restore saved graph if available
            if (fn.graph.nodeData && Array.isArray(fn.graph.nodeData.nodes) && fn.graph.nodeData.nodes.length > 0) {
              await deserializeGraph(editor, area, fn.graph.nodeData, bp);
            } else {
              const entry = new FunctionEntryNode(fn.id, fn.name, fn.inputs);
              const ret = new FunctionReturnNode(fn.id, fn.name, fn.outputs);
              await editor.addNode(entry);
              await editor.addNode(ret);
              await area.translate(entry.id, { x: 0, y: 0 });
              await area.translate(ret.id, { x: 400, y: 0 });
            }
          }
        } else if (tab.type === 'macro' && tab.refId) {
          const m = bp.getMacro(tab.refId);
          if (m) {
            // Restore saved graph if available
            if (m.graph.nodeData && Array.isArray(m.graph.nodeData.nodes) && m.graph.nodeData.nodes.length > 0) {
              await deserializeGraph(editor, area, m.graph.nodeData, bp);
            } else {
              const entry = new MacroEntryNode(m.id, m.name, m.inputs);
              const exit = new MacroExitNode(m.id, m.name, m.outputs);
              await editor.addNode(entry);
              await editor.addNode(exit);
              await area.translate(entry.id, { x: 0, y: 0 });
              await area.translate(exit.id, { x: 400, y: 0 });
            }
          }
        }

        compileAndSave();

        // Restore saved comments
        const graphDataSource =
          tab.type === 'event' ? bp.eventGraph :
          tab.type === 'function' && tab.refId ? bp.getFunction(tab.refId)?.graph :
          tab.type === 'macro' && tab.refId ? bp.getMacro(tab.refId)?.graph :
          null;
        if (graphDataSource?.comments && data.comments && data.createCommentEl) {
          for (const saved of graphDataSource.comments) {
            const c: CommentBox = { ...saved, position: { ...saved.position }, size: { ...saved.size } };
            data.comments.push(c);
            data.createCommentEl(c);
          }
        }

        setTimeout(() => {
          if (!destroyed) AreaExtensions.zoomAt(area, editor.getNodes());
        }, 100);
      }

      data.el.style.display = '';
      refreshUI();
    }

    async function initEventGraph(editor: NodeEditor<Schemes>, area: AreaPlugin<Schemes, any>) {
      // If we have saved graph data, restore it
      if (bp.eventGraph.nodeData && Array.isArray(bp.eventGraph.nodeData.nodes) && bp.eventGraph.nodeData.nodes.length > 0) {
        await deserializeGraph(editor, area, bp.eventGraph.nodeData, bp);
      } else {
        // Default demo graph for brand-new blueprints
        const evTick = new EventTickNode();
        const sine = new SineNode();
        const time = new TimeNode();
        const setPos = new SetPositionNode();
        const getPos = new GetPositionNode();

        await editor.addNode(evTick);
        await editor.addNode(time);
        await editor.addNode(sine);
        await editor.addNode(setPos);
        await editor.addNode(getPos);

        await area.translate(evTick.id, { x: 0, y: 0 });
        await area.translate(time.id, { x: 20, y: 200 });
        await area.translate(sine.id, { x: 250, y: 200 });
        await area.translate(setPos.id, { x: 500, y: 0 });
        await area.translate(getPos.id, { x: 20, y: 400 });

        await editor.addConnection(new ClassicPreset.Connection(evTick, 'exec', setPos, 'exec'));
        await editor.addConnection(new ClassicPreset.Connection(time, 'time', sine, 'value'));
        await editor.addConnection(new ClassicPreset.Connection(sine, 'result', setPos, 'x'));
        await editor.addConnection(new ClassicPreset.Connection(getPos, 'y', setPos, 'y'));
        await editor.addConnection(new ClassicPreset.Connection(getPos, 'z', setPos, 'z'));
      }

      // Populate widget selectors if widgetList is provided
      if (widgetList && widgetList.length > 0) {
        await populateWidgetSelectors(editor, widgetList, area);
      }
    }

    function refreshUI() {
      buildGraphTabBar(tabBarEl, graphTabs, activeGraphId, (tab) => switchToGraph(tab));
      buildMyBlueprintPanel(sidebar, bp, {
        activeGraphId,
        graphTabs,
        onSwitchGraph: (tab) => switchToGraph(tab),
        onAddVariable: () => {
          showAddVariableDialog(root, bp, (name, type) => {
            bp.addVariable(name, type);
            refreshUI();
            compileAndSave();
          });
        },
        onAddFunction: () => {
          showAddNameDialog(root, 'New Function', 'NewFunction', (name) => {
            const fn = bp.addFunction(name);
            const tab: GraphTab = { id: fn.id, label: fn.name, type: 'function', refId: fn.id };
            graphTabs.push(tab);
            switchToGraph(tab);
          });
        },
        onAddMacro: () => {
          showAddNameDialog(root, 'New Macro', 'NewMacro', (name) => {
            const m = bp.addMacro(name);
            const tab: GraphTab = { id: m.id, label: m.name, type: 'macro', refId: m.id };
            graphTabs.push(tab);
            switchToGraph(tab);
          });
        },
        onAddCustomEvent: () => {
          showAddNameDialog(root, 'New Custom Event', 'CustomEvent', async (name) => {
            const evt = bp.addCustomEvent(name);
            const evData = editorStore.get('eventgraph');
            if (evData) {
              const node = new CustomEventNode(evt.id, evt.name);
              await evData.editor.addNode(node);
              await evData.area.translate(node.id, { x: 0, y: 300 });
            }
            refreshUI();
            compileAndSave();
          });
        },
        onAddLocalVariable: (funcId: string) => {
          showAddVariableDialog(root, bp, (name, type) => {
            bp.addFunctionLocalVariable(funcId, name, type);
            refreshUI();
            compileAndSave();
          });
        },
        onDeleteVariable: (id) => { bp.removeVariable(id); refreshUI(); compileAndSave(); },
        onDeleteFunction: (id) => {
          bp.removeFunction(id);
          const idx = graphTabs.findIndex(t => t.refId === id);
          if (idx !== -1) graphTabs.splice(idx, 1);
          const data = editorStore.get(id);
          if (data) { data.el.remove(); editorStore.delete(id); }
          functionEditors.delete(id);
          if (activeGraphId === id) switchToGraph(graphTabs[0]);
          else refreshUI();
          compileAndSave();
        },
        onDeleteMacro: (id) => {
          bp.removeMacro(id);
          const idx = graphTabs.findIndex(t => t.refId === id);
          if (idx !== -1) graphTabs.splice(idx, 1);
          const data = editorStore.get(id);
          if (data) { data.el.remove(); editorStore.delete(id); }
          macroEditors.delete(id);
          if (activeGraphId === id) switchToGraph(graphTabs[0]);
          else refreshUI();
          compileAndSave();
        },
        onDeleteCustomEvent: (id) => {
          const evData = editorStore.get('eventgraph');
          if (evData) {
            const nodes = evData.editor.getNodes();
            const evtNode = nodes.find(n => n instanceof CustomEventNode && (n as CustomEventNode).eventId === id);
            if (evtNode) evData.editor.removeNode(evtNode.id);
          }
          bp.removeCustomEvent(id);
          refreshUI();
          compileAndSave();
        },
        onDeleteLocalVariable: (funcId: string, varId: string) => {
          bp.removeFunctionLocalVariable(funcId, varId);
          refreshUI();
          compileAndSave();
        },
        onEditVariable: (v) => {
          showVariableEditor(root, v, bp, () => { refreshUI(); compileAndSave(); });
        },
        onAddStruct: () => {
          showStructDialog(root, bp, null, (name, fields) => {
            bp.addStruct(name, fields);
            refreshUI();
            compileAndSave();
          });
        },
        onDeleteStruct: (id) => {
          bp.removeStruct(id);
          refreshUI();
          compileAndSave();
        },
        onEditStruct: (s) => {
          showStructDialog(root, bp, s, (name, fields) => {
            s.name = name;
            s.fields = fields;
            refreshUI();
            compileAndSave();
          });
        },
        onEditFunction: (fn) => {
          showParamEditorDialog(root, bp, `Edit Function: ${fn.name}`, fn.inputs, fn.outputs,
            async (newInputs, newOutputs) => {
              fn.inputs = newInputs;
              fn.outputs = newOutputs || [];

              // Rebuild entry/return nodes in the function graph
              const fnData = editorStore.get(fn.id);
              if (fnData) {
                const nodes = fnData.editor.getNodes();
                // Remove old entry & return nodes
                for (const n of nodes) {
                  if (n instanceof FunctionEntryNode || n instanceof FunctionReturnNode) {
                    await fnData.editor.removeNode(n.id);
                  }
                }
                // Add new ones with updated params
                const entry = new FunctionEntryNode(fn.id, fn.name, fn.inputs);
                const ret = new FunctionReturnNode(fn.id, fn.name, fn.outputs);
                await fnData.editor.addNode(entry);
                await fnData.editor.addNode(ret);
                await fnData.area.translate(entry.id, { x: 0, y: 0 });
                await fnData.area.translate(ret.id, { x: 400, y: 0 });
              }

              // Rebuild all FunctionCallNodes referencing this function across all editors
              for (const [, data] of editorStore) {
                const nodes = data.editor.getNodes();
                for (const n of nodes) {
                  if (n instanceof FunctionCallNode && (n as FunctionCallNode).funcId === fn.id) {
                    // Save position
                    const view = data.area.nodeViews.get(n.id);
                    const pos = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 };
                    await data.editor.removeNode(n.id);
                    const newCall = new FunctionCallNode(fn.id, fn.name, fn.inputs, fn.outputs);
                    await data.editor.addNode(newCall);
                    await data.area.translate(newCall.id, pos);
                  }
                }
              }

              refreshUI();
              compileAndSave();
            },
          );
        },
        onEditCustomEvent: (evt) => {
          showParamEditorDialog(root, bp, `Edit Event: ${evt.name}`, evt.params, null,
            async (newParams) => {
              evt.params = newParams;

              // Rebuild CustomEventNode in the event graph
              const evData = editorStore.get('eventgraph');
              if (evData) {
                const nodes = evData.editor.getNodes();
                for (const n of nodes) {
                  if (n instanceof CustomEventNode && (n as CustomEventNode).eventId === evt.id) {
                    const view = evData.area.nodeViews.get(n.id);
                    const pos = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 300 };
                    await evData.editor.removeNode(n.id);
                    const newNode = new CustomEventNode(evt.id, evt.name, evt.params);
                    await evData.editor.addNode(newNode);
                    await evData.area.translate(newNode.id, pos);
                  }
                }

                // Rebuild all CallCustomEventNodes referencing this event
                for (const n of evData.editor.getNodes()) {
                  if (n instanceof CallCustomEventNode && (n as CallCustomEventNode).eventId === evt.id) {
                    const view = evData.area.nodeViews.get(n.id);
                    const pos = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 };
                    const targetActorId = (n as CallCustomEventNode).targetActorId;
                    await evData.editor.removeNode(n.id);
                    const newCall = new CallCustomEventNode(evt.id, evt.name, evt.params, targetActorId);
                    await evData.editor.addNode(newCall);
                    await evData.area.translate(newCall.id, pos);
                  }
                }
              }

              refreshUI();
              compileAndSave();
            },
          );
        },
      });
    }

    // Init - Pre-load ALL graphs (event, functions, macros) to populate editors before compilation
    (async () => {
      // Load event graph first
      await switchToGraph(graphTabs[0]);

      // Pre-load all function and macro graphs to populate functionEditors and macroEditors maps
      // This is critical so generateFullCode can compile them into the output
      for (const tab of graphTabs) {
        if (tab.type === 'function' || tab.type === 'macro') {
          await switchToGraph(tab);
        }
      }

      // Switch back to event graph for display
      await switchToGraph(graphTabs[0]);

      // Trigger initial compilation now that all editors are loaded
      // This ensures compiled code includes all functions/macros
      setTimeout(() => compileAndSave(), 100);
    })();

    return () => {
      destroyed = true;
      for (const [, data] of editorStore) {
        try { data.area.destroy(); } catch { /* ok */ }
      }
    };
  }, [gameObject]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%',
        background: '#1a1a2e',
        position: 'relative',
        display: 'flex',
      }}
    />
  );
}

// ============================================================
//  Mount function for vanilla TS
// ============================================================
export function mountNodeEditor(
  container: HTMLElement,
  gameObject: GameObject,
): () => void {
  const root = createRoot(container);
  root.render(React.createElement(NodeEditorView, { gameObject }));
  return () => root.unmount();
}

/**
 * Mount the node editor for an ActorAsset.
 * We create a lightweight proxy GameObject that wraps the asset's blueprintData.
 * The onCompile callback is called every time the code is compiled,
 * so the caller can sync instances in the scene.
 */
export function mountNodeEditorForAsset(
  container: HTMLElement,
  blueprintData: import('./BlueprintData').BlueprintData,
  assetName: string,
  onCompile?: (code: string) => void,
  components?: ActorComponentData[],
  rootMeshType?: string,
  widgetList?: Array<{ name: string; type: string }>,
  isAnimBlueprint?: boolean,
): () => void {
  // Create a virtual GameObject that shares the asset's blueprint data
  const dummyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );

  const proxyGO: GameObject = {
    id: -1,
    name: assetName,
    mesh: dummyMesh,
    scripts: [new ScriptComponent()],
    rigidBody: null,
    collider: null,
    hasPhysics: false,
    blueprintData,
    actorAssetId: null,
    get position() { return dummyMesh.position; },
    get rotation() { return dummyMesh.rotation; },
    get scale() { return dummyMesh.scale; },
  } as any;

  // Hook into ScriptComponent compile to notify the caller
  if (onCompile) {
    const origCompile = proxyGO.scripts[0].compile.bind(proxyGO.scripts[0]);
    proxyGO.scripts[0].compile = function () {
      const result = origCompile();
      onCompile(proxyGO.scripts[0].code);
      return result;
    };
  }

  const root = createRoot(container);
  root.render(React.createElement(NodeEditorView, {
    gameObject: proxyGO,
    components: components,
    rootMeshType: rootMeshType,
    widgetList: widgetList,
    isAnimBlueprint: isAnimBlueprint,
  }));
  return () => root.unmount();
}
