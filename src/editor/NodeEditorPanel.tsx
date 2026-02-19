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
  // Physics (new nodes)
  SetBodyTypeNode,
  GetBodyTypeNode,
  ResetPhysicsNode,
  GetSpeedNode,
  GetVelocityAtPointNode,
  ClampVelocityNode,
  SetWorldGravityNode,
  GetWorldGravityNode,
  SetPhysicsTransformNode,
  TeleportPhysicsBodyNode,
  AddAngularImpulseNode,
  AddRadialForceNode,
  AddRadialImpulseNode,
  WakeBodyNode,
  SleepBodyNode,
  IsBodySleepingNode,
  SetCollisionEnabledPhysicsNode,
  SetCCDEnabledNode,
  GetCenterOfMassNode,
  // Collision Queries (new)
  LineTraceSingleNode,
  LineTraceMultiNode,
  SphereTraceNode,
  BoxTraceSingleNode,
  OverlapSphereNode,
  OverlapBoxNode,
  PointIsInsideNode,
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
  ActorClassSelectControl,
  SpawnActorFromClassNode,
  // Flow control nodes
  DoNNode,
  FlipFlopNode,
  ForLoopWithBreakNode,
  WhileLoopNode,
  SwitchOnStringNode,
  GateNode,
  MultiGateNode,
  DoOnceNode,
  // Trace / collision nodes
  LineTraceByChannelNode,
  SphereTraceByChannelNode,
  BoxTraceNode,
  BreakHitResultNode,
  // Timer nodes
  SetTimerByFunctionNode,
  SetTimerByEventNode,
  RetriggerableDelayNode,
  // World / player nodes
  GetPlayerCharacterNode,
  GetPlayerCameraManagerNode,
  GetWorldNode,
  GetComponentByClassNode,
  // Refresh controls
  RefreshNodesControl,
  WidgetRefreshNodesControl,
} from './nodes';
import { TextureLibrary } from './TextureLibrary';
import type { NodeEntry, ComponentNodeEntry } from './nodes';
import type { ActorComponentData } from './ActorAsset';
import type { ActorAssetManager } from './ActorAsset';
import type { StructureAssetManager } from './StructureAsset';
import type { WidgetBlueprintManager } from './WidgetBlueprintData';

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;

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
//  Module-level reference to WidgetBlueprintManager
//  (set once at startup so Create Widget picker can list widgets)
// ============================================================
let _widgetBPMgr: WidgetBlueprintManager | null = null;

/** Call once at startup to wire widget blueprint data into the node editor */
export function setWidgetBPManager(mgr: WidgetBlueprintManager): void {
  _widgetBPMgr = mgr;
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
  if (node instanceof InputKeyEventNode || node instanceof IsKeyDownNode || node instanceof InputAxisNode) return 'Input';
  // Physics event nodes
  if (node instanceof OnComponentHitNode || node instanceof OnComponentBeginOverlapNode ||
      node instanceof OnComponentEndOverlapNode || node instanceof OnComponentWakeNode ||
      node instanceof OnComponentSleepNode) return 'Events';
  // New physics nodes
  if (node instanceof SetBodyTypeNode || node instanceof GetBodyTypeNode ||
      node instanceof ResetPhysicsNode || node instanceof GetSpeedNode ||
      node instanceof GetVelocityAtPointNode || node instanceof ClampVelocityNode ||
      node instanceof SetWorldGravityNode || node instanceof GetWorldGravityNode ||
      node instanceof SetPhysicsTransformNode || node instanceof TeleportPhysicsBodyNode ||
      node instanceof AddAngularImpulseNode || node instanceof AddRadialForceNode ||
      node instanceof AddRadialImpulseNode || node instanceof WakeBodyNode ||
      node instanceof SleepBodyNode || node instanceof IsBodySleepingNode ||
      node instanceof SetCollisionEnabledPhysicsNode || node instanceof SetCCDEnabledNode ||
      node instanceof GetCenterOfMassNode) return 'Physics';
  // Collision query nodes
  if (node instanceof LineTraceSingleNode || node instanceof LineTraceMultiNode ||
      node instanceof SphereTraceNode || node instanceof BoxTraceSingleNode ||
      node instanceof OverlapSphereNode || node instanceof OverlapBoxNode ||
      node instanceof PointIsInsideNode) return 'Collision Queries';
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
    return `(__inputKeys[${JSON.stringify(kc)}] || false)`;
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
    return `((__inputKeys[${JSON.stringify(posCode)}] ? 1 : 0) - (__inputKeys[${JSON.stringify(negCode)}] ? 1 : 0))`;
  }

  // SpawnActorFromClassNode — return the spawned game object reference
  if (node instanceof SpawnActorFromClassNode) {
    const spawnVarName = `__spawned_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return spawnVarName;
  }

  // Collision / Trigger event output data (variables set inside the callback closure)
  if (node instanceof OnTriggerBeginOverlapNode || node instanceof OnTriggerEndOverlapNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    if (outputKey === 'selfComponent') return '__selfComponent';
    return '0';
  }
  // Physics event output data — On Component Hit
  if (node instanceof OnComponentHitNode) {
    if (outputKey === 'normalX') return '__normalX';
    if (outputKey === 'normalY') return '__normalY';
    if (outputKey === 'normalZ') return '__normalZ';
    if (outputKey === 'impulse') return '__impulse';
    return '0';
  }
  // Physics event output data — On Component Begin/End Overlap
  if (node instanceof OnComponentBeginOverlapNode || node instanceof OnComponentEndOverlapNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
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

  const rv = (nid: string, ok: string) => resolveValue(nid, ok, nodeMap, inputSrc, bp);

  // Component getter nodes
  if (node instanceof GetComponentLocationNode) {
    const ref = (node as GetComponentLocationNode).compIndex === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${(node as GetComponentLocationNode).compIndex}] || {}).mesh`;
    return `${ref}.position.${outputKey}`;
  }
  if (node instanceof GetComponentRotationNode) {
    const ref = (node as GetComponentRotationNode).compIndex === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${(node as GetComponentRotationNode).compIndex}] || {}).mesh`;
    return `${ref}.rotation.${outputKey}`;
  }
  if (node instanceof GetComponentScaleNode) {
    const ref = (node as GetComponentScaleNode).compIndex === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${(node as GetComponentScaleNode).compIndex}] || {}).mesh`;
    return `${ref}.scale.${outputKey}`;
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

  // ── Trace node data outputs ──
  if (node instanceof LineTraceByChannelNode) {
    const trVar = `__trace_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'hit') return `(${trVar} ? ${trVar}.hit : false)`;
    if (outputKey === 'hitX') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitX : 0)`;
    if (outputKey === 'hitY') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitY : 0)`;
    if (outputKey === 'hitZ') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitZ : 0)`;
    if (outputKey === 'normalX') return `(${trVar} && ${trVar}.hit ? ${trVar}.normalX : 0)`;
    if (outputKey === 'normalY') return `(${trVar} && ${trVar}.hit ? ${trVar}.normalY : 0)`;
    if (outputKey === 'normalZ') return `(${trVar} && ${trVar}.hit ? ${trVar}.normalZ : 0)`;
    if (outputKey === 'hitActor') return `(${trVar} ? ${trVar}.hitActor : null)`;
    if (outputKey === 'distance') return `(${trVar} ? ${trVar}.distance : 0)`;
    return '0';
  }
  if (node instanceof SphereTraceByChannelNode) {
    const trVar = `__strace_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'hit') return `(${trVar} ? ${trVar}.hit : false)`;
    if (outputKey === 'hitX') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitX : 0)`;
    if (outputKey === 'hitY') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitY : 0)`;
    if (outputKey === 'hitZ') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitZ : 0)`;
    if (outputKey === 'normalX') return `(${trVar} && ${trVar}.hit ? ${trVar}.normalX : 0)`;
    if (outputKey === 'normalY') return `(${trVar} && ${trVar}.hit ? ${trVar}.normalY : 0)`;
    if (outputKey === 'normalZ') return `(${trVar} && ${trVar}.hit ? ${trVar}.normalZ : 0)`;
    if (outputKey === 'hitActor') return `(${trVar} ? ${trVar}.hitActor : null)`;
    if (outputKey === 'distance') return `(${trVar} ? ${trVar}.distance : 0)`;
    return '0';
  }
  if (node instanceof BoxTraceNode) {
    const trVar = `__btrace_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'hit') return `(${trVar} ? ${trVar}.hit : false)`;
    if (outputKey === 'hitX') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitX : 0)`;
    if (outputKey === 'hitY') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitY : 0)`;
    if (outputKey === 'hitZ') return `(${trVar} && ${trVar}.hit ? ${trVar}.hitZ : 0)`;
    if (outputKey === 'hitActor') return `(${trVar} ? ${trVar}.hitActor : null)`;
    if (outputKey === 'distance') return `(${trVar} ? ${trVar}.distance : 0)`;
    return '0';
  }
  if (node instanceof BreakHitResultNode) {
    const hS = inputSrc.get(`${nodeId}.hitResult`);
    const hitVal = hS ? rv(hS.nid, hS.ok) : 'null';
    if (outputKey === 'hit') return `(${hitVal} ? ${hitVal}.hit : false)`;
    if (outputKey === 'hitX') return `(${hitVal} ? ${hitVal}.hitX : 0)`;
    if (outputKey === 'hitY') return `(${hitVal} ? ${hitVal}.hitY : 0)`;
    if (outputKey === 'hitZ') return `(${hitVal} ? ${hitVal}.hitZ : 0)`;
    if (outputKey === 'normalX') return `(${hitVal} ? ${hitVal}.normalX : 0)`;
    if (outputKey === 'normalY') return `(${hitVal} ? ${hitVal}.normalY : 0)`;
    if (outputKey === 'normalZ') return `(${hitVal} ? ${hitVal}.normalZ : 0)`;
    if (outputKey === 'distance') return `(${hitVal} ? ${hitVal}.distance : 0)`;
    if (outputKey === 'hitActor') return `(${hitVal} ? ${hitVal}.hitActor : null)`;
    return '0';
  }

  // ── Flow control data outputs ──
  if (node instanceof FlipFlopNode) {
    const ffVar = `__flipFlop_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'isA') return ffVar;
    return '0';
  }
  if (node instanceof DoNNode) {
    const dnVar = `__doN_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'counter') return dnVar;
    return '0';
  }
  if (node instanceof ForLoopWithBreakNode) {
    const idxVar = `__idx_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'index') return idxVar;
    return '0';
  }

  // ── Timer data outputs ──
  if (node instanceof SetTimerByFunctionNode) {
    const handleVar = `__timerHandle_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'handle') return handleVar;
    return '0';
  }
  if (node instanceof SetTimerByEventNode) {
    const handleVar = `__timerHandle_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'handle') return handleVar;
    return '0';
  }

  // ── World / Player pure nodes ──
  if (node instanceof GetPlayerCharacterNode) {
    if (outputKey === 'character') return `(__scene ? __scene.gameObjects.find(function(g) { return g.actorType === 'characterPawn' && g.characterController; }) || null : null)`;
    if (outputKey === 'valid') return `(!!(__scene ? __scene.gameObjects.find(function(g) { return g.actorType === 'characterPawn' && g.characterController; }) : null))`;
    return 'null';
  }
  if (node instanceof GetPlayerCameraManagerNode) {
    return `(__scene && __scene.engine ? __scene.engine.camera : null)`;
  }
  if (node instanceof GetWorldNode) {
    return `__scene`;
  }
  if (node instanceof GetComponentByClassNode) {
    const cn = node as GetComponentByClassNode;
    const compType = (cn.controls['componentType'] as any)?.value ?? 'mesh';
    if (compType === 'mesh') return `(gameObject.mesh || null)`;
    if (compType === 'light') return `((gameObject._lightComponents || [])[0] || null)`;
    if (compType === 'trigger') return `((gameObject._triggerComponents || [])[0] || null)`;
    if (compType === 'audio') return `((gameObject._audioComponents || [])[0] || null)`;
    return 'null';
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
    return 'gameObject';
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
    return `(gameObject.owner || gameObject)`;
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
    case 'Float': {
      const ctrl = node.controls['value'] as ClassicPreset.InputControl<'number'>;
      return String(ctrl?.value ?? 0);
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
    case 'Get Physics Material': {
      if (outputKey === 'friction')
        return '(gameObject.collider ? gameObject.collider.friction() : 0.5)';
      if (outputKey === 'restitution')
        return '(gameObject.collider ? gameObject.collider.restitution() : 0.3)';
      return '0';
    }

    // ── Physics getters (new) ───────────────────────────────
    case 'Get Body Type':
      return '(gameObject.physicsConfig ? gameObject.physicsConfig.bodyType : "Dynamic")';
    case 'Get Speed':
      return '(gameObject.rigidBody ? Math.sqrt(Math.pow(gameObject.rigidBody.linvel().x,2)+Math.pow(gameObject.rigidBody.linvel().y,2)+Math.pow(gameObject.rigidBody.linvel().z,2)) : 0)';
    case 'Get Velocity at Point': {
      const pxS = inputSrc.get(`${nodeId}.px`); const pyS = inputSrc.get(`${nodeId}.py`); const pzS = inputSrc.get(`${nodeId}.pz`);
      const px = pxS ? rv(pxS.nid, pxS.ok) : '0'; const py = pyS ? rv(pyS.nid, pyS.ok) : '0'; const pz = pzS ? rv(pzS.nid, pzS.ok) : '0';
      return `(__physics.getVelocityAtPoint(gameObject, {x:${px},y:${py},z:${pz}}).${outputKey === 'vx' ? 'x' : outputKey === 'vy' ? 'y' : 'z'})`;
    }
    case 'Get World Gravity':
      return `(__physics.getWorldGravity().${outputKey})`;
    case 'Is Body Sleeping':
      return '(__physics.isBodySleeping(gameObject))';
    case 'Get Center of Mass':
      return `(__physics.getCenterOfMass(gameObject).${outputKey})`;
    case 'Point Is Inside': {
      const pxS = inputSrc.get(`${nodeId}.px`); const pyS = inputSrc.get(`${nodeId}.py`); const pzS = inputSrc.get(`${nodeId}.pz`);
      const px = pxS ? rv(pxS.nid, pxS.ok) : '0'; const py = pyS ? rv(pyS.nid, pyS.ok) : '0'; const pz = pzS ? rv(pzS.nid, pzS.ok) : '0';
      return `(__physics.pointIsInside({x:${px},y:${py},z:${pz}}, gameObject))`;
    }
    case 'Overlap Sphere': {
      const cxS = inputSrc.get(`${nodeId}.cx`); const cyS = inputSrc.get(`${nodeId}.cy`); const czS = inputSrc.get(`${nodeId}.cz`);
      const rS = inputSrc.get(`${nodeId}.radius`);
      return `(__physics.overlapSphere({x:${cxS ? rv(cxS.nid, cxS.ok) : '0'},y:${cyS ? rv(cyS.nid, cyS.ok) : '0'},z:${czS ? rv(czS.nid, czS.ok) : '0'}}, ${rS ? rv(rS.nid, rS.ok) : '1'}).length)`;
    }
    case 'Overlap Box': {
      const cxS = inputSrc.get(`${nodeId}.cx`); const cyS = inputSrc.get(`${nodeId}.cy`); const czS = inputSrc.get(`${nodeId}.cz`);
      const hxS = inputSrc.get(`${nodeId}.halfX`); const hyS = inputSrc.get(`${nodeId}.halfY`); const hzS = inputSrc.get(`${nodeId}.halfZ`);
      return `(__physics.overlapBox({x:${cxS ? rv(cxS.nid, cxS.ok) : '0'},y:${cyS ? rv(cyS.nid, cyS.ok) : '0'},z:${czS ? rv(czS.nid, czS.ok) : '0'}}, {x:${hxS ? rv(hxS.nid, hxS.ok) : '0.5'},y:${hyS ? rv(hyS.nid, hyS.ok) : '0.5'},z:${hzS ? rv(hzS.nid, hzS.ok) : '0.5'}}, {x:0,y:0,z:0}).length)`;
    }
    case 'Line Trace Single': {
      const sxS = inputSrc.get(`${nodeId}.startX`); const syS = inputSrc.get(`${nodeId}.startY`); const szS = inputSrc.get(`${nodeId}.startZ`);
      const dxS = inputSrc.get(`${nodeId}.dirX`); const dyS = inputSrc.get(`${nodeId}.dirY`); const dzS = inputSrc.get(`${nodeId}.dirZ`);
      const mdS = inputSrc.get(`${nodeId}.maxDist`);
      const castExpr = `__physics.castRay({x:${sxS ? rv(sxS.nid, sxS.ok) : '0'},y:${syS ? rv(syS.nid, syS.ok) : '0'},z:${szS ? rv(szS.nid, szS.ok) : '0'}}, {x:${dxS ? rv(dxS.nid, dxS.ok) : '0'},y:${dyS ? rv(dyS.nid, dyS.ok) : '-1'},z:${dzS ? rv(dzS.nid, dzS.ok) : '0'}}, ${mdS ? rv(mdS.nid, mdS.ok) : '1000'}, __scene)`;
      if (outputKey === 'hit') return `(${castExpr}.hit)`;
      if (outputKey === 'distance') return `(${castExpr}.distance)`;
      if (outputKey === 'hitX') return `(${castExpr}.point.x)`;
      if (outputKey === 'hitY') return `(${castExpr}.point.y)`;
      if (outputKey === 'hitZ') return `(${castExpr}.point.z)`;
      if (outputKey === 'normalX') return `(${castExpr}.normal.x)`;
      if (outputKey === 'normalY') return `(${castExpr}.normal.y)`;
      if (outputKey === 'normalZ') return `(${castExpr}.normal.z)`;
      if (outputKey === 'hitActorId') return `(${castExpr}.hitActorId)`;
      if (outputKey === 'hitActorName') return `(${castExpr}.hitActorName)`;
      return '0';
    }
    case 'Line Trace Multi': {
      const sxS = inputSrc.get(`${nodeId}.startX`); const syS = inputSrc.get(`${nodeId}.startY`); const szS = inputSrc.get(`${nodeId}.startZ`);
      const dxS = inputSrc.get(`${nodeId}.dirX`); const dyS = inputSrc.get(`${nodeId}.dirY`); const dzS = inputSrc.get(`${nodeId}.dirZ`);
      const mdS = inputSrc.get(`${nodeId}.maxDist`);
      const castExpr = `__physics.castRayMulti({x:${sxS ? rv(sxS.nid, sxS.ok) : '0'},y:${syS ? rv(syS.nid, syS.ok) : '0'},z:${szS ? rv(szS.nid, szS.ok) : '0'}}, {x:${dxS ? rv(dxS.nid, dxS.ok) : '0'},y:${dyS ? rv(dyS.nid, dyS.ok) : '-1'},z:${dzS ? rv(dzS.nid, dzS.ok) : '0'}}, ${mdS ? rv(mdS.nid, mdS.ok) : '1000'}, __scene)`;
      if (outputKey === 'hitCount') return `(${castExpr}.length)`;
      if (outputKey === 'closestHitX') return `((${castExpr}[0] || {point:{x:0}}).point.x)`;
      if (outputKey === 'closestHitY') return `((${castExpr}[0] || {point:{y:0}}).point.y)`;
      if (outputKey === 'closestHitZ') return `((${castExpr}[0] || {point:{z:0}}).point.z)`;
      if (outputKey === 'closestHitActorId') return `((${castExpr}[0] || {hitActorId:-1}).hitActorId)`;
      if (outputKey === 'closestHitActorName') return `((${castExpr}[0] || {hitActorName:''}).hitActorName)`;
      return '0';
    }
    case 'Sphere Trace': {
      const sxS = inputSrc.get(`${nodeId}.startX`); const syS = inputSrc.get(`${nodeId}.startY`); const szS = inputSrc.get(`${nodeId}.startZ`);
      const dxS = inputSrc.get(`${nodeId}.dirX`); const dyS = inputSrc.get(`${nodeId}.dirY`); const dzS = inputSrc.get(`${nodeId}.dirZ`);
      const rS = inputSrc.get(`${nodeId}.radius`); const mdS = inputSrc.get(`${nodeId}.maxDist`);
      const castExpr = `__physics.castShape('sphere', {radius:${rS ? rv(rS.nid, rS.ok) : '0.5'}}, {x:${sxS ? rv(sxS.nid, sxS.ok) : '0'},y:${syS ? rv(syS.nid, syS.ok) : '0'},z:${szS ? rv(szS.nid, szS.ok) : '0'}}, {x:${dxS ? rv(dxS.nid, dxS.ok) : '0'},y:${dyS ? rv(dyS.nid, dyS.ok) : '-1'},z:${dzS ? rv(dzS.nid, dzS.ok) : '0'}}, ${mdS ? rv(mdS.nid, mdS.ok) : '1000'}, __scene)`;
      if (outputKey === 'hit') return `(${castExpr}.hit)`;
      if (outputKey === 'distance') return `(${castExpr}.distance)`;
      if (outputKey === 'hitX') return `(${castExpr}.point.x)`;
      if (outputKey === 'hitY') return `(${castExpr}.point.y)`;
      if (outputKey === 'hitZ') return `(${castExpr}.point.z)`;
      if (outputKey === 'hitActorId') return `(${castExpr}.hitActorId)`;
      if (outputKey === 'hitActorName') return `(${castExpr}.hitActorName)`;
      return '0';
    }
    case 'Box Trace': {
      const sxS = inputSrc.get(`${nodeId}.startX`); const syS = inputSrc.get(`${nodeId}.startY`); const szS = inputSrc.get(`${nodeId}.startZ`);
      const dxS = inputSrc.get(`${nodeId}.dirX`); const dyS = inputSrc.get(`${nodeId}.dirY`); const dzS = inputSrc.get(`${nodeId}.dirZ`);
      const hxS = inputSrc.get(`${nodeId}.halfX`); const hyS = inputSrc.get(`${nodeId}.halfY`); const hzS = inputSrc.get(`${nodeId}.halfZ`);
      const mdS = inputSrc.get(`${nodeId}.maxDist`);
      const castExpr = `__physics.castShape('box', {halfExtents:{x:${hxS ? rv(hxS.nid, hxS.ok) : '0.5'},y:${hyS ? rv(hyS.nid, hyS.ok) : '0.5'},z:${hzS ? rv(hzS.nid, hzS.ok) : '0.5'}}}, {x:${sxS ? rv(sxS.nid, sxS.ok) : '0'},y:${syS ? rv(syS.nid, syS.ok) : '0'},z:${szS ? rv(szS.nid, szS.ok) : '0'}}, {x:${dxS ? rv(dxS.nid, dxS.ok) : '0'},y:${dyS ? rv(dyS.nid, dyS.ok) : '-1'},z:${dzS ? rv(dzS.nid, dzS.ok) : '0'}}, ${mdS ? rv(mdS.nid, mdS.ok) : '1000'}, __scene)`;
      if (outputKey === 'hit') return `(${castExpr}.hit)`;
      if (outputKey === 'distance') return `(${castExpr}.distance)`;
      if (outputKey === 'hitX') return `(${castExpr}.point.x)`;
      if (outputKey === 'hitY') return `(${castExpr}.point.y)`;
      if (outputKey === 'hitZ') return `(${castExpr}.point.z)`;
      if (outputKey === 'hitActorId') return `(${castExpr}.hitActorId)`;
      if (outputKey === 'hitActorName') return `(${castExpr}.hitActorName)`;
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

    // ── Extended Math Nodes ─────────────────────────────────
    case 'Modulo': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      const b = bS ? rv(bS.nid, bS.ok) : '1';
      return `(${b} !== 0 ? (${aS ? rv(aS.nid, aS.ok) : '0'} % ${b}) : 0)`;
    }
    case 'Power': {
      const bS = inputSrc.get(`${nodeId}.base`);
      const eS = inputSrc.get(`${nodeId}.exponent`);
      return `Math.pow(${bS ? rv(bS.nid, bS.ok) : '0'}, ${eS ? rv(eS.nid, eS.ok) : '1'})`;
    }
    case 'Min': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `Math.min(${aS ? rv(aS.nid, aS.ok) : '0'}, ${bS ? rv(bS.nid, bS.ok) : '0'})`;
    }
    case 'Max': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `Math.max(${aS ? rv(aS.nid, aS.ok) : '0'}, ${bS ? rv(bS.nid, bS.ok) : '0'})`;
    }
    case 'Round': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `Math.round(${vS ? rv(vS.nid, vS.ok) : '0'})`;
    }
    case 'Floor': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `Math.floor(${vS ? rv(vS.nid, vS.ok) : '0'})`;
    }
    case 'Ceil': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `Math.ceil(${vS ? rv(vS.nid, vS.ok) : '0'})`;
    }
    case 'Sqrt': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `Math.sqrt(Math.abs(${vS ? rv(vS.nid, vS.ok) : '0'}))`;
    }
    case 'Log': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `Math.log(Math.max(${vS ? rv(vS.nid, vS.ok) : '1'}, 0.0001))`;
    }
    case 'Tangent': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `Math.tan(${vS ? rv(vS.nid, vS.ok) : '0'})`;
    }
    case 'Normalize': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      const x = xS ? rv(xS.nid, xS.ok) : '0';
      const y = yS ? rv(yS.nid, yS.ok) : '0';
      const z = zS ? rv(zS.nid, zS.ok) : '0';
      const len = `Math.sqrt(${x}*${x}+${y}*${y}+${z}*${z})||1`;
      if (outputKey === 'nx') return `(${x}/(${len}))`;
      if (outputKey === 'ny') return `(${y}/(${len}))`;
      if (outputKey === 'nz') return `(${z}/(${len}))`;
      return '0';
    }
    case 'Dot Product': {
      const ax = inputSrc.get(`${nodeId}.ax`);
      const ay = inputSrc.get(`${nodeId}.ay`);
      const az = inputSrc.get(`${nodeId}.az`);
      const bx = inputSrc.get(`${nodeId}.bx`);
      const by = inputSrc.get(`${nodeId}.by`);
      const bz = inputSrc.get(`${nodeId}.bz`);
      return `(${ax?rv(ax.nid,ax.ok):'0'}*${bx?rv(bx.nid,bx.ok):'0'}+${ay?rv(ay.nid,ay.ok):'0'}*${by?rv(by.nid,by.ok):'0'}+${az?rv(az.nid,az.ok):'0'}*${bz?rv(bz.nid,bz.ok):'0'})`;
    }
    case 'Cross Product': {
      const ax = inputSrc.get(`${nodeId}.ax`);
      const ay = inputSrc.get(`${nodeId}.ay`);
      const az = inputSrc.get(`${nodeId}.az`);
      const bx = inputSrc.get(`${nodeId}.bx`);
      const by = inputSrc.get(`${nodeId}.by`);
      const bz = inputSrc.get(`${nodeId}.bz`);
      const _ax = ax?rv(ax.nid,ax.ok):'0', _ay = ay?rv(ay.nid,ay.ok):'0', _az = az?rv(az.nid,az.ok):'0';
      const _bx = bx?rv(bx.nid,bx.ok):'0', _by = by?rv(by.nid,by.ok):'0', _bz = bz?rv(bz.nid,bz.ok):'0';
      if (outputKey === 'rx') return `(${_ay}*${_bz}-${_az}*${_by})`;
      if (outputKey === 'ry') return `(${_az}*${_bx}-${_ax}*${_bz})`;
      if (outputKey === 'rz') return `(${_ax}*${_by}-${_ay}*${_bx})`;
      return '0';
    }
    case 'Vector Length': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      const x = xS ? rv(xS.nid, xS.ok) : '0';
      const y = yS ? rv(yS.nid, yS.ok) : '0';
      const z = zS ? rv(zS.nid, zS.ok) : '0';
      return `Math.sqrt(${x}*${x}+${y}*${y}+${z}*${z})`;
    }
    case 'Distance': {
      const ax = inputSrc.get(`${nodeId}.ax`);
      const ay = inputSrc.get(`${nodeId}.ay`);
      const az = inputSrc.get(`${nodeId}.az`);
      const bx = inputSrc.get(`${nodeId}.bx`);
      const by = inputSrc.get(`${nodeId}.by`);
      const bz = inputSrc.get(`${nodeId}.bz`);
      const dx = `(${ax?rv(ax.nid,ax.ok):'0'}-${bx?rv(bx.nid,bx.ok):'0'})`;
      const dy = `(${ay?rv(ay.nid,ay.ok):'0'}-${by?rv(by.nid,by.ok):'0'})`;
      const dz = `(${az?rv(az.nid,az.ok):'0'}-${bz?rv(bz.nid,bz.ok):'0'})`;
      return `Math.sqrt(${dx}*${dx}+${dy}*${dy}+${dz}*${dz})`;
    }
    case 'Random Float': return 'Math.random()';
    case 'Random Float in Range': {
      const mn = inputSrc.get(`${nodeId}.min`);
      const mx = inputSrc.get(`${nodeId}.max`);
      const a = mn ? rv(mn.nid, mn.ok) : '0';
      const b = mx ? rv(mx.nid, mx.ok) : '1';
      return `(${a} + Math.random() * (${b} - ${a}))`;
    }
    case 'Random Int in Range': {
      const mn = inputSrc.get(`${nodeId}.min`);
      const mx = inputSrc.get(`${nodeId}.max`);
      const a = mn ? rv(mn.nid, mn.ok) : '0';
      const b = mx ? rv(mx.nid, mx.ok) : '10';
      return `(Math.floor(${a} + Math.random() * (${b} - ${a} + 1)))`;
    }
    case 'Random Bool': return '(Math.random() < 0.5)';
    case 'Equal': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(${aS ? rv(aS.nid, aS.ok) : '0'} === ${bS ? rv(bS.nid, bS.ok) : '0'})`;
    }
    case 'Not Equal': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(${aS ? rv(aS.nid, aS.ok) : '0'} !== ${bS ? rv(bS.nid, bS.ok) : '0'})`;
    }
    case 'Less Than': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(${aS ? rv(aS.nid, aS.ok) : '0'} < ${bS ? rv(bS.nid, bS.ok) : '0'})`;
    }
    case 'Greater or Equal': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(${aS ? rv(aS.nid, aS.ok) : '0'} >= ${bS ? rv(bS.nid, bS.ok) : '0'})`;
    }
    case 'Less or Equal': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(${aS ? rv(aS.nid, aS.ok) : '0'} <= ${bS ? rv(bS.nid, bS.ok) : '0'})`;
    }
    case 'AND': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(!!(${aS ? rv(aS.nid, aS.ok) : 'false'}) && !!(${bS ? rv(bS.nid, bS.ok) : 'false'}))`;
    }
    case 'OR': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(!!(${aS ? rv(aS.nid, aS.ok) : 'false'}) || !!(${bS ? rv(bS.nid, bS.ok) : 'false'}))`;
    }
    case 'NOT': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `(!(${vS ? rv(vS.nid, vS.ok) : 'false'}))`;
    }
    case 'XOR': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(!!(${aS ? rv(aS.nid, aS.ok) : 'false'}) !== !!(${bS ? rv(bS.nid, bS.ok) : 'false'}))`;
    }

    // ── String Nodes ────────────────────────────────────────
    case 'Append': {
      const aS = inputSrc.get(`${nodeId}.a`);
      const bS = inputSrc.get(`${nodeId}.b`);
      return `(String(${aS ? rv(aS.nid, aS.ok) : '""'}) + String(${bS ? rv(bS.nid, bS.ok) : '""'}))`;
    }
    case 'Format Text': {
      const fS = inputSrc.get(`${nodeId}.format`);
      const a0 = inputSrc.get(`${nodeId}.arg0`);
      const a1 = inputSrc.get(`${nodeId}.arg1`);
      const a2 = inputSrc.get(`${nodeId}.arg2`);
      const fmt = fS ? rv(fS.nid, fS.ok) : '""';
      return `(${fmt}).replace("{0}", String(${a0 ? rv(a0.nid, a0.ok) : '""'})).replace("{1}", String(${a1 ? rv(a1.nid, a1.ok) : '""'})).replace("{2}", String(${a2 ? rv(a2.nid, a2.ok) : '""'}))`;
    }
    case 'Bool to String': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `(${vS ? rv(vS.nid, vS.ok) : 'false'} ? "true" : "false")`;
    }
    case 'Int to String':
    case 'Float to String': {
      const vS = inputSrc.get(`${nodeId}.value`);
      return `String(${vS ? rv(vS.nid, vS.ok) : '0'})`;
    }
    case 'Vec3 to String': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      return `("(" + ${xS ? rv(xS.nid, xS.ok) : '0'} + ", " + ${yS ? rv(yS.nid, yS.ok) : '0'} + ", " + ${zS ? rv(zS.nid, zS.ok) : '0'} + ")")`;
    }
    case 'String Length': {
      const sS = inputSrc.get(`${nodeId}.string`);
      return `(${sS ? rv(sS.nid, sS.ok) : '""'}).length`;
    }
    case 'Substring': {
      const sS = inputSrc.get(`${nodeId}.string`);
      const st = inputSrc.get(`${nodeId}.start`);
      const ln = inputSrc.get(`${nodeId}.length`);
      return `(${sS ? rv(sS.nid, sS.ok) : '""'}).substr(${st ? rv(st.nid, st.ok) : '0'}, ${ln ? rv(ln.nid, ln.ok) : '0'})`;
    }
    case 'String Contains': {
      const sS = inputSrc.get(`${nodeId}.string`);
      const sub = inputSrc.get(`${nodeId}.substring`);
      return `(${sS ? rv(sS.nid, sS.ok) : '""'}).includes(${sub ? rv(sub.nid, sub.ok) : '""'})`;
    }
    case 'String Replace': {
      const sS = inputSrc.get(`${nodeId}.string`);
      const from = inputSrc.get(`${nodeId}.from`);
      const to = inputSrc.get(`${nodeId}.to`);
      return `(${sS ? rv(sS.nid, sS.ok) : '""'}).replaceAll(${from ? rv(from.nid, from.ok) : '""'}, ${to ? rv(to.nid, to.ok) : '""'})`;
    }
    case 'String Split': {
      const sS = inputSrc.get(`${nodeId}.string`);
      const dS = inputSrc.get(`${nodeId}.delimiter`);
      return `(${sS ? rv(sS.nid, sS.ok) : '""'}).split(${dS ? rv(dS.nid, dS.ok) : '","'}).length`;
    }
    case 'Trim': {
      const sS = inputSrc.get(`${nodeId}.string`);
      return `(${sS ? rv(sS.nid, sS.ok) : '""'}).trim()`;
    }
    case 'To Upper': {
      const sS = inputSrc.get(`${nodeId}.string`);
      return `(${sS ? rv(sS.nid, sS.ok) : '""'}).toUpperCase()`;
    }
    case 'To Lower': {
      const sS = inputSrc.get(`${nodeId}.string`);
      return `(${sS ? rv(sS.nid, sS.ok) : '""'}).toLowerCase()`;
    }
    case 'Parse Int': {
      const sS = inputSrc.get(`${nodeId}.string`);
      const val = sS ? rv(sS.nid, sS.ok) : '""';
      if (outputKey === 'value') return `(parseInt(${val}, 10) || 0)`;
      if (outputKey === 'success') return `(!isNaN(parseInt(${val}, 10)))`;
      return '0';
    }
    case 'Parse Float': {
      const sS = inputSrc.get(`${nodeId}.string`);
      const val = sS ? rv(sS.nid, sS.ok) : '""';
      if (outputKey === 'value') return `(parseFloat(${val}) || 0)`;
      if (outputKey === 'success') return `(!isNaN(parseFloat(${val})))`;
      return '0';
    }

    // ── Actor direction/velocity getters ────────────────────
    case 'Get Actor Forward Vector': {
      if (outputKey === 'x') return '(gameObject.mesh ? Math.sin(gameObject.mesh.rotation.y) : 0)';
      if (outputKey === 'y') return '0';
      if (outputKey === 'z') return '(gameObject.mesh ? Math.cos(gameObject.mesh.rotation.y) : 0)';
      return '0';
    }
    case 'Get Actor Right Vector': {
      if (outputKey === 'x') return '(gameObject.mesh ? Math.cos(gameObject.mesh.rotation.y) : 0)';
      if (outputKey === 'y') return '0';
      if (outputKey === 'z') return '(gameObject.mesh ? -Math.sin(gameObject.mesh.rotation.y) : 0)';
      return '0';
    }
    case 'Get Actor Up Vector': {
      if (outputKey === 'x') return '0';
      if (outputKey === 'y') return '1';
      if (outputKey === 'z') return '0';
      return '0';
    }
    case 'Get Actor Velocity': {
      if (outputKey === 'x') return '(gameObject.rigidBody ? gameObject.rigidBody.linvel().x : 0)';
      if (outputKey === 'y') return '(gameObject.rigidBody ? gameObject.rigidBody.linvel().y : 0)';
      if (outputKey === 'z') return '(gameObject.rigidBody ? gameObject.rigidBody.linvel().z : 0)';
      return '0';
    }

    // ── Tag queries ─────────────────────────────────────────
    case 'Actor Has Tag': {
      const tS = inputSrc.get(`${nodeId}.tag`);
      return `(!!(gameObject.tags && gameObject.tags.includes(${tS ? rv(tS.nid, tS.ok) : '""'})))`;
    }

    // ── Timer queries ───────────────────────────────────────
    case 'Is Timer Active': {
      const hS = inputSrc.get(`${nodeId}.handle`);
      return `(typeof __timers !== 'undefined' && __timers[${hS ? rv(hS.nid, hS.ok) : '0'}] && __timers[${hS ? rv(hS.nid, hS.ok) : '0'}].active)`;
    }
    case 'Is Timer Paused': {
      const hS = inputSrc.get(`${nodeId}.handle`);
      return `(typeof __timers !== 'undefined' && __timers[${hS ? rv(hS.nid, hS.ok) : '0'}] && __timers[${hS ? rv(hS.nid, hS.ok) : '0'}].paused)`;
    }
    case 'Get Timer Remaining Time': {
      const hS = inputSrc.get(`${nodeId}.handle`);
      return `(typeof __timers !== 'undefined' && __timers[${hS ? rv(hS.nid, hS.ok) : '0'}] ? __timers[${hS ? rv(hS.nid, hS.ok) : '0'}].remaining : 0)`;
    }
    case 'Get Timer Elapsed Time': {
      const hS = inputSrc.get(`${nodeId}.handle`);
      return `(typeof __timers !== 'undefined' && __timers[${hS ? rv(hS.nid, hS.ok) : '0'}] ? __timers[${hS ? rv(hS.nid, hS.ok) : '0'}].elapsed : 0)`;
    }

    // ── World / Time getters ────────────────────────────────
    case 'Get World Delta Seconds': return '__dt';
    case 'Get Real Time Seconds': return '(performance.now() / 1000)';
    case 'Get Game Time in Seconds': return '(typeof __gameTime !== "undefined" ? __gameTime : 0)';
    case 'Is Game Paused': return '(typeof __gamePaused !== "undefined" ? __gamePaused : false)';

    // ── Mouse getters ───────────────────────────────────────
    case 'Get Mouse Position': {
      if (outputKey === 'x') return '(typeof __mouseX !== "undefined" ? __mouseX : 0)';
      if (outputKey === 'y') return '(typeof __mouseY !== "undefined" ? __mouseY : 0)';
      return '0';
    }
    case 'Get Mouse Delta': {
      if (outputKey === 'dx') return '(typeof __mouseDX !== "undefined" ? __mouseDX : 0)';
      if (outputKey === 'dy') return '(typeof __mouseDY !== "undefined" ? __mouseDY : 0)';
      return '0';
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
  for (const t of targets) lines.push(...genAction(t.nid, nodeMap, inputSrc, outputDst, bp));
  return lines;
}

function genAction(
  nodeId: string,
  nodeMap: NodeMap, inputSrc: SrcMap, outputDst: DstMap,
  bp: import('./BlueprintData').BlueprintData,
): string[] {
  const node = nodeMap.get(nodeId);
  if (!node) return [];
  // Skip disabled nodes — just pass through to exec outputs
  if ((node as any).__disabled) {
    return walkExec(nodeId, 'exec', nodeMap, inputSrc, outputDst, bp);
  }
  const lines: string[] = [];
  const rv = (nid: string, ok: string) => resolveValue(nid, ok, nodeMap, inputSrc, bp);
  const we = (nid: string, eo: string) => walkExec(nid, eo, nodeMap, inputSrc, outputDst, bp);

  // Component setter nodes
  if (node instanceof SetComponentLocationNode) {
    const ref = (node as SetComponentLocationNode).compIndex === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${(node as SetComponentLocationNode).compIndex}] || {}).mesh`;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`${ref}.position.set(${xS ? rv(xS.nid, xS.ok) : `${ref}.position.x`}, ${yS ? rv(yS.nid, yS.ok) : `${ref}.position.y`}, ${zS ? rv(zS.nid, zS.ok) : `${ref}.position.z`});`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetComponentRotationNode) {
    const ref = (node as SetComponentRotationNode).compIndex === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${(node as SetComponentRotationNode).compIndex}] || {}).mesh`;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`${ref}.rotation.set(${xS ? rv(xS.nid, xS.ok) : `${ref}.rotation.x`}, ${yS ? rv(yS.nid, yS.ok) : `${ref}.rotation.y`}, ${zS ? rv(zS.nid, zS.ok) : `${ref}.rotation.z`});`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetComponentScaleNode) {
    const ref = (node as SetComponentScaleNode).compIndex === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${(node as SetComponentScaleNode).compIndex}] || {}).mesh`;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`${ref}.scale.set(${xS ? rv(xS.nid, xS.ok) : `${ref}.scale.x`}, ${yS ? rv(yS.nid, yS.ok) : `${ref}.scale.y`}, ${zS ? rv(zS.nid, zS.ok) : `${ref}.scale.z`});`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof SetComponentVisibilityNode) {
    const ref = (node as SetComponentVisibilityNode).compIndex === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${(node as SetComponentVisibilityNode).compIndex}] || {}).mesh`;
    const vS = inputSrc.get(`${nodeId}.visible`);
    lines.push(`${ref}.visible = ${vS ? rv(vS.nid, vS.ok) : 'true'};`);
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

  switch (node.label) {
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
      const fxS = inputSrc.get(`${nodeId}.fx`); const fyS = inputSrc.get(`${nodeId}.fy`); const fzS = inputSrc.get(`${nodeId}.fz`);
      const pxS = inputSrc.get(`${nodeId}.px`); const pyS = inputSrc.get(`${nodeId}.py`); const pzS = inputSrc.get(`${nodeId}.pz`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.addForceAtPoint({x:${fxS ? rv(fxS.nid, fxS.ok) : '0'}, y:${fyS ? rv(fyS.nid, fyS.ok) : '0'}, z:${fzS ? rv(fzS.nid, fzS.ok) : '0'}}, {x:${pxS ? rv(pxS.nid, pxS.ok) : '0'}, y:${pyS ? rv(pyS.nid, pyS.ok) : '0'}, z:${pzS ? rv(pzS.nid, pzS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Impulse at Location': {
      const ixS = inputSrc.get(`${nodeId}.fx`); const iyS = inputSrc.get(`${nodeId}.fy`); const izS = inputSrc.get(`${nodeId}.fz`);
      const pxS = inputSrc.get(`${nodeId}.px`); const pyS = inputSrc.get(`${nodeId}.py`); const pzS = inputSrc.get(`${nodeId}.pz`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.applyImpulseAtPoint({x:${ixS ? rv(ixS.nid, ixS.ok) : '0'}, y:${iyS ? rv(iyS.nid, iyS.ok) : '0'}, z:${izS ? rv(izS.nid, izS.ok) : '0'}}, {x:${pxS ? rv(pxS.nid, pxS.ok) : '0'}, y:${pyS ? rv(pyS.nid, pyS.ok) : '0'}, z:${pzS ? rv(pzS.nid, pzS.ok) : '0'}}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Physics Constraints': {
      const lx = inputSrc.get(`${nodeId}.lockPosX`); const ly = inputSrc.get(`${nodeId}.lockPosY`); const lz = inputSrc.get(`${nodeId}.lockPosZ`);
      const rx = inputSrc.get(`${nodeId}.lockRotX`); const ry = inputSrc.get(`${nodeId}.lockRotY`); const rz = inputSrc.get(`${nodeId}.lockRotZ`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.setEnabledTranslations(!${lx ? rv(lx.nid, lx.ok) : 'false'}, !${ly ? rv(ly.nid, ly.ok) : 'false'}, !${lz ? rv(lz.nid, lz.ok) : 'false'}, true); gameObject.rigidBody.setEnabledRotations(!${rx ? rv(rx.nid, rx.ok) : 'false'}, !${ry ? rv(ry.nid, ry.ok) : 'false'}, !${rz ? rv(rz.nid, rz.ok) : 'false'}, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── New Physics Action Nodes ──────────────────────────────
    case 'Set Body Type': {
      const tS = inputSrc.get(`${nodeId}.type`);
      const tVal = tS ? rv(tS.nid, tS.ok) : '"Dynamic"';
      lines.push(`if (__physics && gameObject.rigidBody) { __physics.queueChange({type:'changeBodyType', go:gameObject, newType:${tVal}}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Reset Physics': {
      lines.push(`if (__physics) { __physics.removePhysicsBody(gameObject); __physics.addPhysicsBody(gameObject); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clamp Velocity': {
      const msS = inputSrc.get(`${nodeId}.maxSpeed`);
      const ms = msS ? rv(msS.nid, msS.ok) : '1000';
      lines.push(`if (gameObject.rigidBody) { var __v = gameObject.rigidBody.linvel(); var __spd = Math.sqrt(__v.x*__v.x + __v.y*__v.y + __v.z*__v.z); if (__spd > ${ms}) { var __sc = ${ms} / __spd; gameObject.rigidBody.setLinvel({x:__v.x*__sc, y:__v.y*__sc, z:__v.z*__sc}, true); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set World Gravity': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (__physics) { __physics.setWorldGravity({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '-9.81'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Physics Transform': {
      const pxS = inputSrc.get(`${nodeId}.px`); const pyS = inputSrc.get(`${nodeId}.py`); const pzS = inputSrc.get(`${nodeId}.pz`);
      const rxS = inputSrc.get(`${nodeId}.rx`); const ryS = inputSrc.get(`${nodeId}.ry`); const rzS = inputSrc.get(`${nodeId}.rz`);
      const tpS = inputSrc.get(`${nodeId}.teleport`);
      const tp = tpS ? rv(tpS.nid, tpS.ok) : 'true';
      lines.push(`if (__physics) { __physics.setPhysicsTransform(gameObject, {x:${pxS ? rv(pxS.nid, pxS.ok) : 'gameObject.mesh.position.x'}, y:${pyS ? rv(pyS.nid, pyS.ok) : 'gameObject.mesh.position.y'}, z:${pzS ? rv(pzS.nid, pzS.ok) : 'gameObject.mesh.position.z'}}, {x:${rxS ? rv(rxS.nid, rxS.ok) : '0'}, y:${ryS ? rv(ryS.nid, ryS.ok) : '0'}, z:${rzS ? rv(rzS.nid, rzS.ok) : '0'}}, !!(${tp})); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Teleport Physics Body': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (__physics) { __physics.setPhysicsTransform(gameObject, {x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, null, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Angular Impulse': {
      const xS = inputSrc.get(`${nodeId}.x`); const yS = inputSrc.get(`${nodeId}.y`); const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`if (__physics) { __physics.addAngularImpulse(gameObject, {x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, false); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Radial Force': {
      const oxS = inputSrc.get(`${nodeId}.ox`); const oyS = inputSrc.get(`${nodeId}.oy`); const ozS = inputSrc.get(`${nodeId}.oz`);
      const rS = inputSrc.get(`${nodeId}.radius`); const strS = inputSrc.get(`${nodeId}.strength`); const foS = inputSrc.get(`${nodeId}.falloff`);
      lines.push(`if (__physics && __scene) { __physics.addRadialForce({x:${oxS ? rv(oxS.nid, oxS.ok) : '0'}, y:${oyS ? rv(oyS.nid, oyS.ok) : '0'}, z:${ozS ? rv(ozS.nid, ozS.ok) : '0'}}, ${rS ? rv(rS.nid, rS.ok) : '10'}, ${strS ? rv(strS.nid, strS.ok) : '1000'}, ${foS ? rv(foS.nid, foS.ok) : '"Linear"'}, __scene); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Radial Impulse': {
      const oxS = inputSrc.get(`${nodeId}.ox`); const oyS = inputSrc.get(`${nodeId}.oy`); const ozS = inputSrc.get(`${nodeId}.oz`);
      const rS = inputSrc.get(`${nodeId}.radius`); const strS = inputSrc.get(`${nodeId}.strength`); const foS = inputSrc.get(`${nodeId}.falloff`);
      lines.push(`if (__physics && __scene) { __physics.addRadialImpulse({x:${oxS ? rv(oxS.nid, oxS.ok) : '0'}, y:${oyS ? rv(oyS.nid, oyS.ok) : '0'}, z:${ozS ? rv(ozS.nid, ozS.ok) : '0'}}, ${rS ? rv(rS.nid, rS.ok) : '10'}, ${strS ? rv(strS.nid, strS.ok) : '500'}, ${foS ? rv(foS.nid, foS.ok) : '"Linear"'}, false, __scene); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Wake Physics Body': {
      lines.push(`if (__physics) { __physics.wakeBody(gameObject); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Sleep Physics Body': {
      lines.push(`if (__physics) { __physics.sleepBody(gameObject); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Collision Enabled': {
      const eS = inputSrc.get(`${nodeId}.enabled`);
      const eVal = eS ? rv(eS.nid, eS.ok) : 'true';
      lines.push(`if (gameObject.collider) { gameObject.collider.setSensor(!!(${eVal}) ? false : true); if (gameObject.physicsConfig) gameObject.physicsConfig.collisionEnabled = !!(${eVal}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set CCD Enabled': {
      const eS = inputSrc.get(`${nodeId}.enabled`);
      const eVal = eS ? rv(eS.nid, eS.ok) : 'true';
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.enableCcd(!!(${eVal})); if (gameObject.physicsConfig) gameObject.physicsConfig.ccdEnabled = !!(${eVal}); }`);
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
    case 'Delay': {
      const dS = inputSrc.get(`${nodeId}.duration`);
      const duration = dS ? rv(dS.nid, dS.ok) : '1';
      const completedLines = we(nodeId, 'completed');
      lines.push(`setTimeout(function() {`);
      lines.push(...completedLines.map(l => '  ' + l));
      lines.push(`}, (${duration}) * 1000);`);
      break;
    }

    // ── Widget / UI action nodes ─────────────────────────────
    case 'Create Widget': {
      const wn = node as CreateWidgetNode;
      const bpId = JSON.stringify(wn.widgetBPId || '');
      // Build Expose on Spawn overrides for widget variables
      const wOverrides: string[] = [];
      for (const ev of (wn.exposedVars || [])) {
        const evSrc = inputSrc.get(`${nodeId}.exposed_${ev.varId}`);
        if (evSrc) {
          wOverrides.push(`${JSON.stringify(ev.name)}: ${rv(evSrc.nid, evSrc.ok)}`);
        }
      }
      const wOverridesObj = wOverrides.length > 0 ? `{ ${wOverrides.join(', ')} }` : 'null';
      lines.push(`var __wh_${nodeId.replace(/[^a-zA-Z0-9]/g,'_')} = __uiManager ? __uiManager.createWidget(${bpId}, ${wOverridesObj}) : '';`);
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

    // ── Extended Flow Control Nodes ─────────────────────────
    case 'Do Once': {
      const stateVar = `__doOnce_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`if (typeof ${stateVar} === 'undefined') { ${stateVar} = false; }`);
      lines.push(`if (!${stateVar}) { ${stateVar} = true;`);
      lines.push(...we(nodeId, 'completed'));
      lines.push(`}`);
      break;
    }
    case 'Reset Do Once': {
      const handleS = inputSrc.get(`${nodeId}.handle`);
      if (handleS) {
        const stateVar = `__doOnce_${handleS.nid.replace(/[^a-zA-Z0-9]/g, '_')}`;
        lines.push(`${stateVar} = false;`);
      }
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Do N': {
      const nS = inputSrc.get(`${nodeId}.n`);
      const n = nS ? rv(nS.nid, nS.ok) : '1';
      const stateVar = `__doN_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`if (typeof ${stateVar} === 'undefined') { ${stateVar} = 0; }`);
      lines.push(`if (${stateVar} < ${n}) { ${stateVar}++;`);
      lines.push(...we(nodeId, 'exec'));
      lines.push(`}`);
      break;
    }
    case 'Flip Flop': {
      const stateVar = `__flipFlop_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`if (typeof ${stateVar} === 'undefined') { ${stateVar} = true; }`);
      lines.push(`if (${stateVar}) {`);
      lines.push(...we(nodeId, 'a'));
      lines.push(`} else {`);
      lines.push(...we(nodeId, 'b'));
      lines.push(`}`);
      lines.push(`${stateVar} = !${stateVar};`);
      break;
    }
    case 'Gate': {
      const stateVar = `__gate_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const startClosedS = inputSrc.get(`${nodeId}.startClosed`);
      const startClosed = startClosedS ? rv(startClosedS.nid, startClosedS.ok) : 'false';
      lines.push(`if (typeof ${stateVar} === 'undefined') { ${stateVar} = !${startClosed}; }`);
      // Check which exec input triggered
      lines.push(`if (${stateVar}) {`);
      lines.push(...we(nodeId, 'exit'));
      lines.push(`}`);
      break;
    }
    case 'Open Gate': {
      const handleS = inputSrc.get(`${nodeId}.handle`);
      if (handleS) {
        const stateVar = `__gate_${handleS.nid.replace(/[^a-zA-Z0-9]/g, '_')}`;
        lines.push(`${stateVar} = true;`);
      }
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Close Gate': {
      const handleS = inputSrc.get(`${nodeId}.handle`);
      if (handleS) {
        const stateVar = `__gate_${handleS.nid.replace(/[^a-zA-Z0-9]/g, '_')}`;
        lines.push(`${stateVar} = false;`);
      }
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Toggle Gate': {
      const handleS = inputSrc.get(`${nodeId}.handle`);
      if (handleS) {
        const stateVar = `__gate_${handleS.nid.replace(/[^a-zA-Z0-9]/g, '_')}`;
        lines.push(`${stateVar} = !${stateVar};`);
      }
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Multi Gate': {
      const isRandomS = inputSrc.get(`${nodeId}.isRandom`);
      const loopS = inputSrc.get(`${nodeId}.loop`);
      const startIdxS = inputSrc.get(`${nodeId}.startIndex`);
      const isRandom = isRandomS ? rv(isRandomS.nid, isRandomS.ok) : 'false';
      const loop = loopS ? rv(loopS.nid, loopS.ok) : 'false';
      const startIdx = startIdxS ? rv(startIdxS.nid, startIdxS.ok) : '0';
      const stateVar = `__multiGate_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`if (typeof ${stateVar} === 'undefined') { ${stateVar} = ${startIdx}; }`);
      lines.push(`{ const _mg_max = 3;`);
      lines.push(`if (${isRandom}) { ${stateVar} = Math.floor(Math.random() * _mg_max); }`);
      lines.push(`switch (${stateVar}) {`);
      lines.push(`case 0:`);
      lines.push(...we(nodeId, 'out0'));
      lines.push(`break;`);
      lines.push(`case 1:`);
      lines.push(...we(nodeId, 'out1'));
      lines.push(`break;`);
      lines.push(`case 2:`);
      lines.push(...we(nodeId, 'out2'));
      lines.push(`break;`);
      lines.push(`}`);
      lines.push(`if (!${isRandom}) { ${stateVar}++; if (${loop} && ${stateVar} >= _mg_max) { ${stateVar} = 0; } }`);
      lines.push(`}`);
      break;
    }
    case 'For Loop with Break': {
      const firstS = inputSrc.get(`${nodeId}.firstIndex`);
      const lastS = inputSrc.get(`${nodeId}.lastIndex`);
      const first = firstS ? rv(firstS.nid, firstS.ok) : '0';
      const last = lastS ? rv(lastS.nid, lastS.ok) : '0';
      const idxVar = `__idx_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const breakVar = `__brk_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${breakVar} = false;`);
      lines.push(`for (var ${idxVar} = ${first}; ${idxVar} <= ${last} && !${breakVar}; ${idxVar}++) {`);
      lines.push(...we(nodeId, 'body'));
      lines.push(`}`);
      lines.push(`if (!${breakVar}) {`);
      lines.push(...we(nodeId, 'completed'));
      lines.push(`}`);
      break;
    }
    case 'While Loop': {
      const condS = inputSrc.get(`${nodeId}.condition`);
      const cond = condS ? rv(condS.nid, condS.ok) : 'false';
      lines.push(`{ var __whileGuard = 0; while ((${cond}) && __whileGuard++ < 10000) {`);
      lines.push(...we(nodeId, 'body'));
      lines.push(`}}`);
      lines.push(...we(nodeId, 'completed'));
      break;
    }
    case 'Switch on Int': {
      const selS = inputSrc.get(`${nodeId}.selection`);
      const sel = selS ? rv(selS.nid, selS.ok) : '0';
      lines.push(`switch (${sel}) {`);
      lines.push(`case 0:`);
      lines.push(...we(nodeId, 'case0'));
      lines.push(`break;`);
      lines.push(`case 1:`);
      lines.push(...we(nodeId, 'case1'));
      lines.push(`break;`);
      lines.push(`case 2:`);
      lines.push(...we(nodeId, 'case2'));
      lines.push(`break;`);
      lines.push(`default:`);
      lines.push(...we(nodeId, 'default'));
      lines.push(`}`);
      break;
    }
    case 'Switch on String': {
      const selS = inputSrc.get(`${nodeId}.selection`);
      const sel = selS ? rv(selS.nid, selS.ok) : '""';
      const switchNode = node as SwitchOnStringNode;
      const caseVals = switchNode.caseValues || ['Case 0', 'Case 1', 'Case 2'];
      lines.push(`switch (${sel}) {`);
      for (let ci = 0; ci < caseVals.length; ci++) {
        lines.push(`case ${JSON.stringify(caseVals[ci])}:`);
        lines.push(...we(nodeId, `case${ci}`));
        lines.push(`break;`);
      }
      lines.push(`default:`);
      lines.push(...we(nodeId, 'default'));
      lines.push(`}`);
      break;
    }

    // ── Spawning Nodes ──────────────────────────────────────
    case 'Spawn Actor from Class': {
      const spawnNode = node as SpawnActorFromClassNode;
      const classId = JSON.stringify(spawnNode.targetClassId || '');
      const className = JSON.stringify(spawnNode.targetClassName || '');
      const locXS = inputSrc.get(`${nodeId}.locX`);
      const locYS = inputSrc.get(`${nodeId}.locY`);
      const locZS = inputSrc.get(`${nodeId}.locZ`);
      const rotXS = inputSrc.get(`${nodeId}.rotX`);
      const rotYS = inputSrc.get(`${nodeId}.rotY`);
      const rotZS = inputSrc.get(`${nodeId}.rotZ`);
      const scaleXS = inputSrc.get(`${nodeId}.scaleX`);
      const scaleYS = inputSrc.get(`${nodeId}.scaleY`);
      const scaleZS = inputSrc.get(`${nodeId}.scaleZ`);
      const ownerS = inputSrc.get(`${nodeId}.owner`);
      const lx = locXS ? rv(locXS.nid, locXS.ok) : '0';
      const ly = locYS ? rv(locYS.nid, locYS.ok) : '0';
      const lz = locZS ? rv(locZS.nid, locZS.ok) : '0';
      const rx = rotXS ? rv(rotXS.nid, rotXS.ok) : '0';
      const ry = rotYS ? rv(rotYS.nid, rotYS.ok) : '0';
      const rz = rotZS ? rv(rotZS.nid, rotZS.ok) : '0';
      const sx = scaleXS ? rv(scaleXS.nid, scaleXS.ok) : '1';
      const sy = scaleYS ? rv(scaleYS.nid, scaleYS.ok) : '1';
      const sz = scaleZS ? rv(scaleZS.nid, scaleZS.ok) : '1';
      const ownerExpr = ownerS ? rv(ownerS.nid, ownerS.ok) : 'null';
      const spawnVar = `__spawned_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Build Expose on Spawn overrides object
      const overrides: string[] = [];
      for (const ev of spawnNode.exposedVars) {
        const evSrc = inputSrc.get(`${nodeId}.exposed_${ev.varId}`);
        if (evSrc) {
          overrides.push(`${JSON.stringify(ev.name)}: ${rv(evSrc.nid, evSrc.ok)}`);
        }
      }
      const overridesObj = overrides.length > 0 ? `{ ${overrides.join(', ')} }` : 'null';

      lines.push(`var ${spawnVar} = __scene ? __scene.spawnActorFromClass(`);
      lines.push(`  ${classId}, ${className},`);
      lines.push(`  { x: ${lx}, y: ${ly}, z: ${lz} },`);
      lines.push(`  { x: ${rx}, y: ${ry}, z: ${rz} },`);
      lines.push(`  { x: ${sx}, y: ${sy}, z: ${sz} },`);
      lines.push(`  ${ownerExpr}, ${overridesObj}`);
      lines.push(`) : null;`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Destroy Actor': {
      const target = inputSrc.get(`${nodeId}.target`);
      const targetExpr = target ? rv(target.nid, target.ok) : 'gameObject';
      // Remove physics body first, then remove from scene
      lines.push(`(function() {`);
      lines.push(`  var __da = ${targetExpr};`);
      lines.push(`  if (__da && __scene) {`);
      lines.push(`    if (__physics) { __physics.removePhysicsBody(__da); }`);
      lines.push(`    __scene.removeGameObject(__da);`);
      lines.push(`  }`);
      lines.push(`})();`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Spawn Emitter at Location': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      lines.push(`// Spawn emitter at (${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}) - needs particle system implementation`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Spawn Sound at Location': {
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      const volS = inputSrc.get(`${nodeId}.volume`);
      lines.push(`// Spawn sound at (${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}) volume ${volS ? rv(volS.nid, volS.ok) : '1'} - needs audio system implementation`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Actor Manipulation Nodes ────────────────────────────
    case 'Add Actor World Offset':
    case 'Add World Offset': {
      const dxS = inputSrc.get(`${nodeId}.dx`);
      const dyS = inputSrc.get(`${nodeId}.dy`);
      const dzS = inputSrc.get(`${nodeId}.dz`);
      lines.push(`gameObject.position.x += ${dxS ? rv(dxS.nid, dxS.ok) : '0'};`);
      lines.push(`gameObject.position.y += ${dyS ? rv(dyS.nid, dyS.ok) : '0'};`);
      lines.push(`gameObject.position.z += ${dzS ? rv(dzS.nid, dzS.ok) : '0'};`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Actor World Rotation':
    case 'Add World Rotation': {
      const dxS = inputSrc.get(`${nodeId}.dx`);
      const dyS = inputSrc.get(`${nodeId}.dy`);
      const dzS = inputSrc.get(`${nodeId}.dz`);
      lines.push(`gameObject.rotation.x += ${dxS ? rv(dxS.nid, dxS.ok) : '0'};`);
      lines.push(`gameObject.rotation.y += ${dyS ? rv(dyS.nid, dyS.ok) : '0'};`);
      lines.push(`gameObject.rotation.z += ${dzS ? rv(dzS.nid, dzS.ok) : '0'};`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Actor Local Offset':
    case 'Add Local Offset': {
      const dxS = inputSrc.get(`${nodeId}.dx`);
      const dyS = inputSrc.get(`${nodeId}.dy`);
      const dzS = inputSrc.get(`${nodeId}.dz`);
      const dx = dxS ? rv(dxS.nid, dxS.ok) : '0';
      const dy = dyS ? rv(dyS.nid, dyS.ok) : '0';
      const dz = dzS ? rv(dzS.nid, dzS.ok) : '0';
      // Apply offset in local space using mesh's quaternion
      lines.push(`{ const _q = gameObject.mesh ? gameObject.mesh.quaternion : new THREE.Quaternion();`);
      lines.push(`const _v = new THREE.Vector3(${dx}, ${dy}, ${dz}).applyQuaternion(_q);`);
      lines.push(`gameObject.position.x += _v.x; gameObject.position.y += _v.y; gameObject.position.z += _v.z; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Teleport Actor': {
      const xS = inputSrc.get(`${nodeId}.locX`);
      const yS = inputSrc.get(`${nodeId}.locY`);
      const zS = inputSrc.get(`${nodeId}.locZ`);
      const rxS = inputSrc.get(`${nodeId}.rotX`);
      const ryS = inputSrc.get(`${nodeId}.rotY`);
      const rzS = inputSrc.get(`${nodeId}.rotZ`);
      lines.push(`gameObject.position.set(${xS ? rv(xS.nid, xS.ok) : 'gameObject.position.x'}, ${yS ? rv(yS.nid, yS.ok) : 'gameObject.position.y'}, ${zS ? rv(zS.nid, zS.ok) : 'gameObject.position.z'});`);
      lines.push(`gameObject.rotation.set(${rxS ? rv(rxS.nid, rxS.ok) : 'gameObject.rotation.x'}, ${ryS ? rv(ryS.nid, ryS.ok) : 'gameObject.rotation.y'}, ${rzS ? rv(rzS.nid, rzS.ok) : 'gameObject.rotation.z'});`);
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.setTranslation(gameObject.position, true); gameObject.rigidBody.setRotation(gameObject.mesh.quaternion, true); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Add Tag to Actor':
    case 'Add Tag': {
      const tagS = inputSrc.get(`${nodeId}.tag`);
      const tag = tagS ? rv(tagS.nid, tagS.ok) : '""';
      lines.push(`if (!gameObject.tags) { gameObject.tags = []; }`);
      lines.push(`if (!gameObject.tags.includes(${tag})) { gameObject.tags.push(${tag}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Remove Tag from Actor':
    case 'Remove Tag': {
      const tagS = inputSrc.get(`${nodeId}.tag`);
      const tag = tagS ? rv(tagS.nid, tagS.ok) : '""';
      lines.push(`if (gameObject.tags) { const _i = gameObject.tags.indexOf(${tag}); if (_i >= 0) gameObject.tags.splice(_i, 1); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Hidden in Game':
    case 'Set Actor Hidden': {
      const hiddenS = inputSrc.get(`${nodeId}.hidden`);
      lines.push(`if (gameObject.mesh) { gameObject.mesh.visible = !${hiddenS ? rv(hiddenS.nid, hiddenS.ok) : 'false'}; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Enable Collision': {
      const enabledS = inputSrc.get(`${nodeId}.enabled`);
      const enabled = enabledS ? rv(enabledS.nid, enabledS.ok) : 'true';
      lines.push(`if (gameObject.rigidBody) { gameObject.rigidBody.setEnabled(${enabled}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Tick Enabled': {
      const enabledS = inputSrc.get(`${nodeId}.enabled`);
      lines.push(`gameObject.__tickEnabled = ${enabledS ? rv(enabledS.nid, enabledS.ok) : 'true'};`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Destroy Component': {
      // Needs component reference system
      lines.push(`// Destroy component - needs component reference`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Timer Nodes ─────────────────────────────────────────
    case 'Set Timer by Function Name': {
      const fnS = inputSrc.get(`${nodeId}.functionName`);
      const timeS = inputSrc.get(`${nodeId}.time`);
      const loopS = inputSrc.get(`${nodeId}.looping`);
      const fnName = fnS ? rv(fnS.nid, fnS.ok) : '""';
      const time = timeS ? rv(timeS.nid, timeS.ok) : '1';
      const loop = loopS ? rv(loopS.nid, loopS.ok) : 'false';
      const handleVar = `__timerHandle_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`if (typeof __timers === 'undefined') { var __timers = {}; var __timerIdCounter = 0; }`);
      lines.push(`var ${handleVar} = ++__timerIdCounter; __timers[${handleVar}] = { active: true, paused: false, remaining: ${time}, elapsed: 0, fn: ${fnName}, interval: ${time}, loop: ${loop} };`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Timer by Event': {
      const timeS = inputSrc.get(`${nodeId}.time`);
      const loopS = inputSrc.get(`${nodeId}.looping`);
      const time = timeS ? rv(timeS.nid, timeS.ok) : '1';
      const loop = loopS ? rv(loopS.nid, loopS.ok) : 'false';
      const handleVar = `__timerHandle_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const eventCode = we(nodeId, 'event');
      lines.push(`if (typeof __timers === 'undefined') { var __timers = {}; var __timerIdCounter = 0; }`);
      lines.push(`var ${handleVar} = ++__timerIdCounter; __timers[${handleVar}] = { active: true, paused: false, remaining: ${time}, elapsed: 0, interval: ${time}, loop: ${loop}, callback: function() { ${eventCode.join('\n')} } };`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear Timer': {
      const handleS = inputSrc.get(`${nodeId}.handle`);
      const handle = handleS ? rv(handleS.nid, handleS.ok) : '0';
      lines.push(`if (typeof __timers !== 'undefined' && __timers[${handle}]) { __timers[${handle}].active = false; delete __timers[${handle}]; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Clear All Timers': {
      lines.push(`if (typeof __timers !== 'undefined') { __timers = {}; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Pause Timer': {
      const handleS = inputSrc.get(`${nodeId}.handle`);
      const handle = handleS ? rv(handleS.nid, handleS.ok) : '0';
      lines.push(`if (typeof __timers !== 'undefined' && __timers[${handle}]) { __timers[${handle}].paused = true; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Unpause Timer': {
      const handleS = inputSrc.get(`${nodeId}.handle`);
      const handle = handleS ? rv(handleS.nid, handleS.ok) : '0';
      lines.push(`if (typeof __timers !== 'undefined' && __timers[${handle}]) { __timers[${handle}].paused = false; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Retriggerable Delay': {
      const durationS = inputSrc.get(`${nodeId}.duration`);
      const duration = durationS ? rv(durationS.nid, durationS.ok) : '1';
      const delayVar = `__delay_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const completedCode = we(nodeId, 'completed');
      lines.push(`if (typeof ${delayVar} === 'undefined') { var ${delayVar} = { active: false, timer: null }; }`);
      lines.push(`if (${delayVar}.timer) { clearTimeout(${delayVar}.timer); }`);
      lines.push(`${delayVar}.active = true; ${delayVar}.timer = setTimeout(function() { ${delayVar}.active = false; ${completedCode.join('\n')} }, (${duration}) * 1000);`);
      break;
    }

    // ── String Exec Nodes ───────────────────────────────────
    case 'Print Warning': {
      const msgS = inputSrc.get(`${nodeId}.message`);
      lines.push(`console.warn(${msgS ? rv(msgS.nid, msgS.ok) : '""'});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Print Error': {
      const msgS = inputSrc.get(`${nodeId}.message`);
      lines.push(`console.error(${msgS ? rv(msgS.nid, msgS.ok) : '""'});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── World / Game State Nodes ────────────────────────────
    case 'Open Level': {
      const levelS = inputSrc.get(`${nodeId}.levelName`);
      lines.push(`if (__projectManager) { __projectManager.loadSceneRuntime(${levelS ? rv(levelS.nid, levelS.ok) : '""'}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Quit Game': {
      lines.push(`if (typeof __quitGame === 'function') { __quitGame(); } else { console.log('Quit game requested'); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Game Paused': {
      const pausedS = inputSrc.get(`${nodeId}.paused`);
      lines.push(`__gamePaused = ${pausedS ? rv(pausedS.nid, pausedS.ok) : 'true'};`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // ── Trace / Collision Nodes ─────────────────────────────
    case 'Line Trace by Channel':
    case 'Line Trace By Channel': {
      const sxS = inputSrc.get(`${nodeId}.startX`);
      const syS = inputSrc.get(`${nodeId}.startY`);
      const szS = inputSrc.get(`${nodeId}.startZ`);
      const exS = inputSrc.get(`${nodeId}.endX`);
      const eyS = inputSrc.get(`${nodeId}.endY`);
      const ezS = inputSrc.get(`${nodeId}.endZ`);
      const resultVar = `__trace_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${resultVar} = __physics ? __physics.castRay(`);
      lines.push(`  { x: ${sxS ? rv(sxS.nid, sxS.ok) : '0'}, y: ${syS ? rv(syS.nid, syS.ok) : '0'}, z: ${szS ? rv(szS.nid, szS.ok) : '0'} },`);
      lines.push(`  { x: ${exS ? rv(exS.nid, exS.ok) : '0'} - ${sxS ? rv(sxS.nid, sxS.ok) : '0'}, y: ${eyS ? rv(eyS.nid, eyS.ok) : '0'} - ${syS ? rv(syS.nid, syS.ok) : '0'}, z: ${ezS ? rv(ezS.nid, ezS.ok) : '0'} - ${szS ? rv(szS.nid, szS.ok) : '0'} }, 100) : null;`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Sphere Trace by Channel':
    case 'Sphere Trace By Channel': {
      const sxS = inputSrc.get(`${nodeId}.startX`);
      const syS = inputSrc.get(`${nodeId}.startY`);
      const szS = inputSrc.get(`${nodeId}.startZ`);
      const exS = inputSrc.get(`${nodeId}.endX`);
      const eyS = inputSrc.get(`${nodeId}.endY`);
      const ezS = inputSrc.get(`${nodeId}.endZ`);
      const radiusS = inputSrc.get(`${nodeId}.radius`);
      const resultVar = `__strace_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${resultVar} = __physics ? __physics.castShape(`);
      lines.push(`  'sphere', { radius: ${radiusS ? rv(radiusS.nid, radiusS.ok) : '0.5'} },`);
      lines.push(`  { x: ${sxS ? rv(sxS.nid, sxS.ok) : '0'}, y: ${syS ? rv(syS.nid, syS.ok) : '0'}, z: ${szS ? rv(szS.nid, szS.ok) : '0'} },`);
      lines.push(`  { x: ${exS ? rv(exS.nid, exS.ok) : '0'} - ${sxS ? rv(sxS.nid, sxS.ok) : '0'}, y: ${eyS ? rv(eyS.nid, eyS.ok) : '0'} - ${syS ? rv(syS.nid, syS.ok) : '0'}, z: ${ezS ? rv(ezS.nid, ezS.ok) : '0'} - ${szS ? rv(szS.nid, szS.ok) : '0'} }, 100) : null;`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Box Trace': {
      const sxS = inputSrc.get(`${nodeId}.startX`);
      const syS = inputSrc.get(`${nodeId}.startY`);
      const szS = inputSrc.get(`${nodeId}.startZ`);
      const exS = inputSrc.get(`${nodeId}.endX`);
      const eyS = inputSrc.get(`${nodeId}.endY`);
      const ezS = inputSrc.get(`${nodeId}.endZ`);
      const hxS = inputSrc.get(`${nodeId}.halfX`);
      const hyS = inputSrc.get(`${nodeId}.halfY`);
      const hzS = inputSrc.get(`${nodeId}.halfZ`);
      const resultVar = `__btrace_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`var ${resultVar} = __physics ? __physics.castShape(`);
      lines.push(`  'box', { halfExtents: { x: ${hxS ? rv(hxS.nid, hxS.ok) : '0.5'}, y: ${hyS ? rv(hyS.nid, hyS.ok) : '0.5'}, z: ${hzS ? rv(hzS.nid, hzS.ok) : '0.5'} } },`);
      lines.push(`  { x: ${sxS ? rv(sxS.nid, sxS.ok) : '0'}, y: ${syS ? rv(syS.nid, syS.ok) : '0'}, z: ${szS ? rv(szS.nid, szS.ok) : '0'} },`);
      lines.push(`  { x: ${exS ? rv(exS.nid, exS.ok) : '0'} - ${sxS ? rv(sxS.nid, sxS.ok) : '0'}, y: ${eyS ? rv(eyS.nid, eyS.ok) : '0'} - ${syS ? rv(syS.nid, syS.ok) : '0'}, z: ${ezS ? rv(ezS.nid, ezS.ok) : '0'} - ${szS ? rv(szS.nid, szS.ok) : '0'} }, 100) : null;`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Break Hit Result': {
      // Pure node — result values accessed via resolveValue
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
): string {
  const parts: string[] = [];

  // Variable declarations
  const varDecls: string[] = [];
  for (const v of bp.variables) {
    varDecls.push(`let __var_${sanitizeName(v.name)} = ${varDefaultStr(v, bp)};`);
  }
  if (varDecls.length > 0) parts.push(varDecls.join('\n'));

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

  // Collect lifecycle code
  const beginPlayCode: string[] = [];
  const tickCode: string[] = [];
  const onDestroyCode: string[] = [];

  const bpEvts = nodes.filter(n => n.label === 'Event BeginPlay');
  for (const ev of bpEvts) beginPlayCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));
  const tkEvts = nodes.filter(n => n.label === 'Event Tick' || n.label === 'Anim Update Event');
  for (const ev of tkEvts) tickCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));
  const odEvts = nodes.filter(n => n.label === 'Event OnDestroy');
  for (const ev of odEvts) onDestroyCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));

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
      }
    }

    // Cleanup in onDestroy
    onDestroyCode.push('__inputCleanup.forEach(function(fn) { fn(); }); __inputCleanup = []; __inputKeys = {};');
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

  // ── Physics Event Nodes (OnComponentHit/Wake/Sleep) ─────────────
  const physHitNodes = nodes.filter(n => n instanceof OnComponentHitNode);
  const physBeginOverlapNodes = nodes.filter(n => n instanceof OnComponentBeginOverlapNode);
  const physEndOverlapNodes = nodes.filter(n => n instanceof OnComponentEndOverlapNode);
  const physWakeNodes = nodes.filter(n => n instanceof OnComponentWakeNode);
  const physSleepNodes = nodes.filter(n => n instanceof OnComponentSleepNode);
  const hasPhysicsEvents = physHitNodes.length > 0 || physBeginOverlapNodes.length > 0 ||
    physEndOverlapNodes.length > 0 || physWakeNodes.length > 0 || physSleepNodes.length > 0;

  if (hasPhysicsEvents) {
    if (!hasCollisionEvents) {
      beginPlayCode.push('var __collCb = __physics.collision.registerCallbacks(gameObject.id);');
    }
    for (const n of physHitNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onHit.push(function(__hitEvt) { var __normalX = __hitEvt.impactNormal ? __hitEvt.impactNormal.x : 0; var __normalY = __hitEvt.impactNormal ? __hitEvt.impactNormal.y : 0; var __normalZ = __hitEvt.impactNormal ? __hitEvt.impactNormal.z : 0; var __impulse = __hitEvt.impulse || 0; ${body.join(' ')} });`);
      }
    }
    for (const n of physBeginOverlapNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onBeginOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; ${body.join(' ')} });`);
      }
    }
    for (const n of physEndOverlapNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onEndOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; ${body.join(' ')} });`);
      }
    }
    for (const n of physWakeNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onWake = __collCb.onWake || []; __collCb.onWake.push(function() { ${body.join(' ')} });`);
      }
    }
    for (const n of physSleepNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onSleep = __collCb.onSleep || []; __collCb.onSleep.push(function() { ${body.join(' ')} });`);
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
  if (!isWidgetBlueprint) {
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
    const icon = tab.type === 'event' ? '◆' : tab.type === 'function' ? 'ƒ' : '◇';
    item.innerHTML = `<span class="mybp-item-icon">${icon}</span><span>${tab.label}</span>`;
    item.addEventListener('click', () => callbacks.onSwitchGraph(tab));
    graphBody.appendChild(item);
  }

  // --- Functions ---
  const fnBody = addSection(container, 'Functions', callbacks.onAddFunction);
  for (const fn of bp.functions) {
    const fnItem = makeDeletableItem(fn.name, 'ƒ', 'mybp-fn',
      () => callbacks.onSwitchGraph({ id: fn.id, label: fn.name, type: 'function', refId: fn.id }),
      () => callbacks.onDeleteFunction(fn.id),
      { dragType: 'function', funcId: fn.id, funcName: fn.name, inputs: JSON.stringify(fn.inputs), outputs: JSON.stringify(fn.outputs) },
    );
    // Add edit button for parameters (insert before delete in the actions container)
    const actionsEl = fnItem.querySelector('.mybp-item-actions')!;
    const editBtn = document.createElement('span');
    editBtn.className = 'mybp-edit-btn';
    editBtn.textContent = '⚙';
    editBtn.title = 'Edit Parameters';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onEditFunction(fn); });
    actionsEl.insertBefore(editBtn, actionsEl.firstChild);
    fnBody.appendChild(fnItem);
  }

  // --- Macros ---
  const macroBody = addSection(container, 'Macros', callbacks.onAddMacro);
  for (const m of bp.macros) {
    macroBody.appendChild(makeDeletableItem(m.name, '◇', 'mybp-macro',
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

    // Show Expose on Spawn / Instance Editable badges
    if (v.exposeOnSpawn || v.instanceEditable) {
      const badges = document.createElement('span');
      badges.style.cssText = 'display:inline-flex;gap:2px;margin-left:4px;align-items:center;';
      if (v.exposeOnSpawn) {
        const badge = document.createElement('span');
        badge.innerHTML = iconHTML(Icons.Zap, 10, '#ff9800');
        badge.title = 'Expose on Spawn';
        badges.appendChild(badge);
      }
      if (v.instanceEditable) {
        const badge = document.createElement('span');
        badge.innerHTML = iconHTML(Icons.Eye, 10, '#64b5f6');
        badge.title = 'Instance Editable';
        badges.appendChild(badge);
      }
      item.appendChild(badges);
    }

    const actions = document.createElement('span');
    actions.className = 'mybp-item-actions';
    const del = document.createElement('span');
    del.className = 'mybp-delete';
    del.textContent = '✕';
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
        del.textContent = '✕';
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
    const evtItem = makeDeletableItem(evt.name, '○', 'mybp-evt',
      () => callbacks.onSwitchGraph(callbacks.graphTabs[0]),
      () => callbacks.onDeleteCustomEvent(evt.id),
      { dragType: 'customEvent', eventId: evt.id, eventName: evt.name, params: JSON.stringify(evt.params) },
    );
    // Add edit button for parameters (insert before delete in the actions container)
    const actionsEl = evtItem.querySelector('.mybp-item-actions')!;
    const editBtn = document.createElement('span');
    editBtn.className = 'mybp-edit-btn';
    editBtn.textContent = '⚙';
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
    del.textContent = '✕';
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
  iconSpan.textContent = icon;
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
  del.textContent = '✕';
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
    const icon = tab.type === 'event' ? '◆' : tab.type === 'function' ? 'ƒ' : '◇';
    btn.textContent = `${icon} ${tab.label}`;
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

      // Collect relevant NODE_PALETTE categories for this actor type
      const relevantCategories = new Set(['Physics', 'Transform', 'Collision']);
      if (isCharacter) {
        relevantCategories.add('Character');
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
  return type;
}

/** CSS class suffix for type dot color */
function typeDotClass(type: VarType): string {
  if (type.startsWith('Struct:')) return 'mybp-var-struct';
  if (type.startsWith('Enum:'))   return 'mybp-var-enum';
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
      delBtn.textContent = '✕';
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
        delBtn.textContent = '✕';
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
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#b0b0d0;cursor:pointer;">
          <input type="checkbox" id="dlg-instance-editable" ${v.instanceEditable ? 'checked' : ''} />
          Instance Editable
          <span style="color:#666;font-size:10px;" title="Allow this variable to be edited per-instance in the Details panel">(?)</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#b0b0d0;cursor:pointer;">
          <input type="checkbox" id="dlg-expose-on-spawn" ${v.exposeOnSpawn ? 'checked' : ''} />
          Expose on Spawn
          <span style="color:#666;font-size:10px;" title="Show this variable as an input pin on Spawn Actor from Class nodes">(?)</span>
        </label>
      </div>
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
      v.instanceEditable = (dialog.querySelector('#dlg-instance-editable') as HTMLInputElement).checked;
      v.exposeOnSpawn = (dialog.querySelector('#dlg-expose-on-spawn') as HTMLInputElement).checked;
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
      delBtn.textContent = '✕';
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
  // Physics (new nodes)
  if (node instanceof SetBodyTypeNode) return 'SetBodyTypeNode';
  if (node instanceof GetBodyTypeNode) return 'GetBodyTypeNode';
  if (node instanceof ResetPhysicsNode) return 'ResetPhysicsNode';
  if (node instanceof GetSpeedNode) return 'GetSpeedNode';
  if (node instanceof GetVelocityAtPointNode) return 'GetVelocityAtPointNode';
  if (node instanceof ClampVelocityNode) return 'ClampVelocityNode';
  if (node instanceof SetWorldGravityNode) return 'SetWorldGravityNode';
  if (node instanceof GetWorldGravityNode) return 'GetWorldGravityNode';
  if (node instanceof SetPhysicsTransformNode) return 'SetPhysicsTransformNode';
  if (node instanceof TeleportPhysicsBodyNode) return 'TeleportPhysicsBodyNode';
  if (node instanceof AddAngularImpulseNode) return 'AddAngularImpulseNode';
  if (node instanceof AddRadialForceNode) return 'AddRadialForceNode';
  if (node instanceof AddRadialImpulseNode) return 'AddRadialImpulseNode';
  if (node instanceof WakeBodyNode) return 'WakeBodyNode';
  if (node instanceof SleepBodyNode) return 'SleepBodyNode';
  if (node instanceof IsBodySleepingNode) return 'IsBodySleepingNode';
  if (node instanceof SetCollisionEnabledPhysicsNode) return 'SetCollisionEnabledPhysicsNode';
  if (node instanceof SetCCDEnabledNode) return 'SetCCDEnabledNode';
  if (node instanceof GetCenterOfMassNode) return 'GetCenterOfMassNode';
  // Collision Queries (new)
  if (node instanceof LineTraceSingleNode) return 'LineTraceSingleNode';
  if (node instanceof LineTraceMultiNode) return 'LineTraceMultiNode';
  if (node instanceof SphereTraceNode) return 'SphereTraceNode';
  if (node instanceof BoxTraceSingleNode) return 'BoxTraceSingleNode';
  if (node instanceof OverlapSphereNode) return 'OverlapSphereNode';
  if (node instanceof OverlapBoxNode) return 'OverlapBoxNode';
  if (node instanceof PointIsInsideNode) return 'PointIsInsideNode';
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
  // Spawning
  if (node instanceof SpawnActorFromClassNode) return 'SpawnActorFromClassNode';

  return 'Unknown';
}

/** Extract custom data from a node for serialization */
function getNodeSerialData(node: ClassicPreset.Node): any {
  const data: any = {};

  // Save InputControl values
  const controls: any = {};
  for (const [key, ctrl] of Object.entries(node.controls)) {
    if (ctrl instanceof BoolSelectControl) {
      controls[key] = (ctrl as BoolSelectControl).value;
    } else if (ctrl instanceof WidgetBPSelectControl) {
      controls[key] = { id: (ctrl as WidgetBPSelectControl).value, name: (ctrl as WidgetBPSelectControl).displayName };
    } else if (ctrl instanceof WidgetSelectorControl) {
      const value = (ctrl as WidgetSelectorControl).value;
      controls[key] = value;
      console.log(`[Serialize] Node "${(node as any).label}" (${node.id}) control "${key}" = "${value}"`, ctrl);
    } else if (ctrl instanceof MovementModeSelectControl) {
      controls[key] = (ctrl as MovementModeSelectControl).value;
    } else if (ctrl instanceof KeySelectControl) {
      controls[key] = (ctrl as KeySelectControl).value;
    } else if (ctrl instanceof ColorPickerControl) {
      controls[key] = (ctrl as ColorPickerControl).value;
    } else if (ctrl instanceof TextureSelectControl) {
      controls[key] = { id: (ctrl as TextureSelectControl).value, name: (ctrl as TextureSelectControl).displayName };
    } else if (ctrl instanceof ActorClassSelectControl) {
      controls[key] = { id: (ctrl as ActorClassSelectControl).value, name: (ctrl as ActorClassSelectControl).displayName };
    } else if (ctrl instanceof ClassicPreset.InputControl) {
      controls[key] = (ctrl as ClassicPreset.InputControl<'number' | 'text'>).value;
    }
  }
  if (Object.keys(controls).length > 0) data.controls = controls;

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
  } else if (node instanceof InputAxisNode) {
    const ia = node as InputAxisNode;
    const posCtrl = ia.controls['posKey'] as KeySelectControl | undefined;
    const negCtrl = ia.controls['negKey'] as KeySelectControl | undefined;
    data.positiveKey = posCtrl?.value ?? ia.positiveKey;
    data.negativeKey = negCtrl?.value ?? ia.negativeKey;
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
    data.exposedVars = (node as CreateWidgetNode).exposedVars;
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

  // Spawn Actor from Class
  if (node instanceof SpawnActorFromClassNode) {
    const spawnNode = node as SpawnActorFromClassNode;
    data.targetClassId = spawnNode.targetClassId;
    data.targetClassName = spawnNode.targetClassName;
    data.exposedVars = spawnNode.exposedVars.map(v => ({ name: v.name, type: v.type, varId: v.varId }));
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
    // Physics (new nodes)
    case 'SetBodyTypeNode':              return new SetBodyTypeNode();
    case 'GetBodyTypeNode':              return new GetBodyTypeNode();
    case 'ResetPhysicsNode':             return new ResetPhysicsNode();
    case 'GetSpeedNode':                 return new GetSpeedNode();
    case 'GetVelocityAtPointNode':       return new GetVelocityAtPointNode();
    case 'ClampVelocityNode':            return new ClampVelocityNode();
    case 'SetWorldGravityNode':          return new SetWorldGravityNode();
    case 'GetWorldGravityNode':          return new GetWorldGravityNode();
    case 'SetPhysicsTransformNode':      return new SetPhysicsTransformNode();
    case 'TeleportPhysicsBodyNode':      return new TeleportPhysicsBodyNode();
    case 'AddAngularImpulseNode':        return new AddAngularImpulseNode();
    case 'AddRadialForceNode':           return new AddRadialForceNode();
    case 'AddRadialImpulseNode':         return new AddRadialImpulseNode();
    case 'WakeBodyNode':                 return new WakeBodyNode();
    case 'SleepBodyNode':                return new SleepBodyNode();
    case 'IsBodySleepingNode':           return new IsBodySleepingNode();
    case 'SetCollisionEnabledPhysicsNode': return new SetCollisionEnabledPhysicsNode();
    case 'SetCCDEnabledNode':            return new SetCCDEnabledNode();
    case 'GetCenterOfMassNode':          return new GetCenterOfMassNode();
    // Collision Queries (new)
    case 'LineTraceSingleNode':          return new LineTraceSingleNode();
    case 'LineTraceMultiNode':           return new LineTraceMultiNode();
    case 'SphereTraceNode':              return new SphereTraceNode();
    case 'BoxTraceSingleNode':           return new BoxTraceSingleNode();
    case 'OverlapSphereNode':            return new OverlapSphereNode();
    case 'OverlapBoxNode':               return new OverlapBoxNode();
    case 'PointIsInsideNode':            return new PointIsInsideNode();

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
    case 'CreateWidgetNode': {
      const n = new CreateWidgetNode(d.widgetBPId || '', d.widgetBPName || '(none)');
      // Restore exposed vars (Expose on Spawn pins)
      if (d.exposedVars && Array.isArray(d.exposedVars)) {
        n.setExposedVars(d.exposedVars);
      } else if (d.widgetBPId && _widgetBPMgr) {
        const wAsset = _widgetBPMgr.getAsset(d.widgetBPId);
        if (wAsset) {
          const exposed = (wAsset.blueprintData.variables || [])
            .filter((v: any) => v.exposeOnSpawn)
            .map((v: any) => ({ name: v.name, type: v.type, varId: v.id }));
          if (exposed.length > 0) n.setExposedVars(exposed);
        }
      }
      return n;
    }
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
      const classId = d.targetClassId || d.controls?.actorClass?.id || '';
      const className = d.targetClassName || d.controls?.actorClass?.name || '';
      const n = new SpawnActorFromClassNode(classId, className);
      // Restore exposed vars (Expose on Spawn pins)
      if (d.exposedVars && Array.isArray(d.exposedVars)) {
        n.setExposedVars(d.exposedVars);
      } else if (classId && _actorAssetMgr) {
        // Try to rebuild from the actor asset's current blueprint data
        const asset = _actorAssetMgr.getAsset(classId);
        if (asset) {
          const exposed = asset.blueprintData.variables
            .filter(v => v.exposeOnSpawn)
            .map(v => ({ name: v.name, type: v.type, varId: v.id }));
          if (exposed.length > 0) n.setExposedVars(exposed);
        }
      }
      return n;
    }

    default:
      console.warn(`[deserialize] Unknown node type: ${nd.type}`);
      return null;
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
              React.createElement('span', { className: 'fe-node-cat-icon' }, icon),
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
            const [val, setVal] = React.useState(ctrl.value);
            const [actors, setActors] = React.useState<{ id: string; name: string }[]>([]);

            React.useEffect(() => {
              if (_actorAssetMgr) {
                const list = _actorAssetMgr.assets.map(a => ({ id: a.id, name: a.name }));
                list.sort((a, b) => a.name.localeCompare(b.name));
                setActors(list);
              }
            }, []);

            const handleChange = (e: any) => {
              const selectedId = e.target.value;
              const actor = actors.find(a => a.id === selectedId);
              ctrl.setValue(selectedId, actor?.name ?? '');
              setVal(selectedId);

              // ------- Expose on Spawn: rebuild pins -------
              const parentNode = (ctrl as any).__parentNode as SpawnActorFromClassNode | undefined;
              if (parentNode && _actorAssetMgr) {
                const asset = _actorAssetMgr.getAsset(selectedId);
                if (asset) {
                  const exposed = asset.blueprintData.variables
                    .filter(v => v.exposeOnSpawn)
                    .map(v => ({ name: v.name, type: v.type, varId: v.id }));
                  parentNode.setExposedVars(exposed);
                  parentNode.targetClassId = selectedId;
                  parentNode.targetClassName = actor?.name ?? '';
                } else {
                  parentNode.setExposedVars([]);
                }
                // Force node re-render
                area.update('node', parentNode.id);
              }
            };

            return React.createElement('select', {
              value: val,
              onChange: handleChange,
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%',
                padding: '4px 6px',
                background: '#1e1e2e',
                color: '#ff9800',
                border: '1px solid #3a3a5c',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 140,
              },
            },
              React.createElement('option', { value: '', disabled: true }, '-- Select Actor Class --'),
              ...actors.map(a =>
                React.createElement('option', { key: a.id, value: a.id }, a.name),
              ),
            );
          };
        }
        // ── Refresh Nodes button (Actor Spawn) ──
        if (data.payload instanceof RefreshNodesControl) {
          const ctrl = data.payload as RefreshNodesControl;
          return (_props: any) => {
            const handleClick = (e: any) => {
              e.stopPropagation();
              const parentNode = (ctrl as any).__parentNode as SpawnActorFromClassNode | undefined;
              if (parentNode && _actorAssetMgr && parentNode.targetClassId) {
                const asset = _actorAssetMgr.getAsset(parentNode.targetClassId);
                if (asset) {
                  const exposed = asset.blueprintData.variables
                    .filter((v: any) => v.exposeOnSpawn)
                    .map((v: any) => ({ name: v.name, type: v.type, varId: v.id }));
                  parentNode.setExposedVars(exposed);
                  area.update('node', parentNode.id);
                }
              }
            };
            return React.createElement('button', {
              onClick: handleClick,
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%', padding: '4px 8px', background: '#2a4a6a',
                color: '#7ecbff', border: '1px solid #4a9eff', borderRadius: 4,
                fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              },
            },
              React.createElement('svg', {
                width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
              },
                React.createElement('path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' }),
                React.createElement('path', { d: 'M21 3v5h-5' }),
              ),
              'Refresh Nodes',
            );
          };
        }
        // ── Refresh Nodes button (Widget Create) ──
        if (data.payload instanceof WidgetRefreshNodesControl) {
          const ctrl = data.payload as WidgetRefreshNodesControl;
          return (_props: any) => {
            const handleClick = (e: any) => {
              e.stopPropagation();
              const parentNode = (ctrl as any).__parentNode as CreateWidgetNode | undefined;
              if (parentNode && _widgetBPMgr && parentNode.widgetBPId) {
                const widgetBP = _widgetBPMgr.getAsset(parentNode.widgetBPId);
                if (widgetBP) {
                  const exposed = (widgetBP.blueprintData.variables || [])
                    .filter((v: any) => v.exposeOnSpawn)
                    .map((v: any) => ({ name: v.name, type: v.type, varId: v.id }));
                  parentNode.setExposedVars(exposed);
                  area.update('node', parentNode.id);
                }
              }
            };
            return React.createElement('button', {
              onClick: handleClick,
              onPointerDown: (e: any) => e.stopPropagation(),
              style: {
                width: '100%', padding: '4px 8px', background: '#2a4a6a',
                color: '#7ecbff', border: '1px solid #4a9eff', borderRadius: 4,
                fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              },
            },
              React.createElement('svg', {
                width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
              },
                React.createElement('path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' }),
                React.createElement('path', { d: 'M21 3v5h-5' }),
              ),
              'Refresh Nodes',
            );
          };
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
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' } }, open ? '▲' : '▼'),
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
                      // Clear Expose on Spawn pins
                      if (typeof parentNode.setExposedVars === 'function') {
                        parentNode.setExposedVars([]);
                        area.update('node', parentNode.id);
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

                            // Expose on Spawn: rebuild dynamic pins
                            if (typeof parentNode.setExposedVars === 'function') {
                              const exposed = (widgetBP.blueprintData.variables || [])
                                .filter((v: any) => v.exposeOnSpawn)
                                .map((v: any) => ({ name: v.name, type: v.type, varId: v.id }));
                              parentNode.setExposedVars(exposed);
                              area.update('node', parentNode.id);
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
                React.createElement('span', { style: { marginLeft: 4, fontSize: 10, color: '#888' } }, open ? '▲' : '▼'),
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
                        }, '🖼'),
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
    el.innerHTML = `<div class="fe-comment-header" style="background:${c.color}"><span class="fe-comment-text" contenteditable="true">${c.text}</span><span class="fe-comment-close">✕</span></div><div class="fe-comment-body"></div><div class="fe-comment-resize"></div>`;
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
}

function NodeEditorView({ gameObject, components, rootMeshType, widgetList }: NodeEditorViewProps) {
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
      const code = generateFullCode(evData.editor, bp, functionEditors, !!widgetList);
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
  }));
  return () => root.unmount();
}
