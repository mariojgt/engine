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
  GetComponentLocationNode,
  SetComponentLocationNode,
  GetComponentRotationNode,
  SetComponentRotationNode,
  GetComponentScaleNode,
  SetComponentScaleNode,
  SetComponentVisibilityNode,
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
  // Camera & Spring Arm Nodes
  SetSpringArmLengthNode,
  SetSpringArmTargetOffsetNode,
  SetSpringArmSocketOffsetNode,
  SetSpringArmCollisionNode,
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
} from './nodes';
import type { NodeEntry, ComponentNodeEntry } from './nodes';
import type { ActorComponentData } from './ActorAsset';
import type { StructureAssetManager } from './StructureAsset';

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
    const itype = inputType(ikd.selectedKey);
    const kc = keyEventCode(ikd.selectedKey);
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
    // Read from controls (user may have edited them on the node)
    const posCtrl = ia.controls['posKey'] as ClassicPreset.InputControl<'text'> | undefined;
    const negCtrl = ia.controls['negKey'] as ClassicPreset.InputControl<'text'> | undefined;
    const posKey = posCtrl?.value as string || ia.positiveKey;
    const negKey = negCtrl?.value as string || ia.negativeKey;
    const posCode = keyEventCode(posKey);
    const negCode = keyEventCode(negKey);
    return `((__inputKeys[${JSON.stringify(posCode)}] ? 1 : 0) - (__inputKeys[${JSON.stringify(negCode)}] ? 1 : 0))`;
  }

  // Collision / Trigger event output data (variables set inside the callback closure)
  if (node instanceof OnTriggerBeginOverlapNode || node instanceof OnTriggerEndOverlapNode) {
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    if (outputKey === 'selfComponent') return '__selfComponent';
    return '0';
  }
  // Bound trigger component overlap event outputs (UE-style per-component)
  if (node instanceof OnTriggerComponentBeginOverlapNode || node instanceof OnTriggerComponentEndOverlapNode) {
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    return '0';
  }
  if (node instanceof OnActorBeginOverlapNode || node instanceof OnActorEndOverlapNode) {
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    return '0';
  }
  if (node instanceof OnCollisionHitNode) {
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
      : `gameObject.mesh.children[${(node as GetComponentLocationNode).compIndex}]`;
    return `${ref}.position.${outputKey}`;
  }
  if (node instanceof GetComponentRotationNode) {
    const ref = (node as GetComponentRotationNode).compIndex === -1
      ? 'gameObject.mesh'
      : `gameObject.mesh.children[${(node as GetComponentRotationNode).compIndex}]`;
    return `${ref}.rotation.${outputKey}`;
  }
  if (node instanceof GetComponentScaleNode) {
    const ref = (node as GetComponentScaleNode).compIndex === -1
      ? 'gameObject.mesh'
      : `gameObject.mesh.children[${(node as GetComponentScaleNode).compIndex}]`;
    return `${ref}.scale.${outputKey}`;
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
    if (outputKey === 'x') return `(${cc} ? ${cc}.velocity.x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.velocity.y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.velocity.z : 0)`;
    return '0';
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
  if (node instanceof CameraModeLiteralNode) {
    const ctrl = node.controls['mode'] as ClassicPreset.InputControl<'text'>;
    return `'${ctrl?.value ?? 'thirdPerson'}'`;
  }
  if (node instanceof MovementModeLiteralNode) {
    const ctrl = node.controls['mode'] as ClassicPreset.InputControl<'text'>;
    return `'${ctrl?.value ?? 'walking'}'`;
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
      : `gameObject.mesh.children[${(node as SetComponentLocationNode).compIndex}]`;
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
      : `gameObject.mesh.children[${(node as SetComponentRotationNode).compIndex}]`;
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
      : `gameObject.mesh.children[${(node as SetComponentScaleNode).compIndex}]`;
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
      : `gameObject.mesh.children[${(node as SetComponentVisibilityNode).compIndex}]`;
    const vS = inputSrc.get(`${nodeId}.visible`);
    lines.push(`${ref}.visible = ${vS ? rv(vS.nid, vS.ok) : 'true'};`);
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
    lines.push(`{ const _tc = (gameObject._triggerComponents || [])[${ci}]; if (_tc) { const d = _tc.config.dimensions; if (d.halfExtentX !== undefined) { d.halfExtentX = ${xS ? rv(xS.nid, xS.ok) : '1'}; d.halfExtentY = ${yS ? rv(yS.nid, yS.ok) : '1'}; d.halfExtentZ = ${zS ? rv(zS.nid, zS.ok) : '1'}; } else if (d.radius !== undefined) { d.radius = ${xS ? rv(xS.nid, xS.ok) : '1'}; } } }`);
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
    const mS = inputSrc.get(`${nodeId}.mode`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setMovementMode(${mS ? rv(mS.nid, mS.ok) : "'walking'"}); }`);
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
  // Player Controller action nodes
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
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) { const _tn = ${tS ? rv(tS.nid, tS.ok) : "''"}; const _tgo = scene.gameObjects.find(g => g.name === _tn); if (_tgo) _ai.startFollowing(_tgo, ${dS ? rv(dS.nid, dS.ok) : '3'}); } }`);
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
    lines.push(`__custom_evt_${sanitizeName(node.eventName)}(${args.join(', ')});`);
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
    case 'Delay': {
      const dS = inputSrc.get(`${nodeId}.duration`);
      const duration = dS ? rv(dS.nid, dS.ok) : '1';
      const completedLines = we(nodeId, 'completed');
      lines.push(`setTimeout(function() {`);
      lines.push(...completedLines.map(l => '  ' + l));
      lines.push(`}, (${duration}) * 1000);`);
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
  const tkEvts = nodes.filter(n => n.label === 'Event Tick');
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
      const kc = keyEventCode(ikNode.selectedKey);
      const itype = inputType(ikNode.selectedKey);
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
        beginPlayCode.push(`__collCb.onBeginOverlap.push(function(__ovEvt) { if (__ovEvt.selfComponentName !== ${JSON.stringify(n.compName)}) return; var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; ${body.join(' ')} });`);
      }
    }
    // UE-style bound End Overlap — filter by selfComponentName
    for (const n of boundEndNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onEndOverlap.push(function(__ovEvt) { if (__ovEvt.selfComponentName !== ${JSON.stringify(n.compName)}) return; var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; ${body.join(' ')} });`);
      }
    }

    // Generic trigger overlap events (fire for ANY trigger)
    for (const n of triggerBeginNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onBeginOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __selfComponent = __ovEvt.selfComponentName; ${body.join(' ')} });`);
      }
    }
    for (const n of triggerEndNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onEndOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __selfComponent = __ovEvt.selfComponentName; ${body.join(' ')} });`);
      }
    }
    for (const n of actorBeginNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onBeginOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; ${body.join(' ')} });`);
      }
    }
    for (const n of actorEndNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onEndOverlap.push(function(__ovEvt) { var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; ${body.join(' ')} });`);
      }
    }
    for (const n of collisionHitNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onHit.push(function(__hitEvt) { var __otherActorName = __hitEvt.otherActorName; var __otherActorId = __hitEvt.otherActorId; var __selfComponent = __hitEvt.selfComponentName; var __impactX = __hitEvt.impactPoint ? __hitEvt.impactPoint.x : 0; var __impactY = __hitEvt.impactPoint ? __hitEvt.impactPoint.y : 0; var __impactZ = __hitEvt.impactPoint ? __hitEvt.impactPoint.z : 0; var __normalX = __hitEvt.impactNormal ? __hitEvt.impactNormal.x : 0; var __normalY = __hitEvt.impactNormal ? __hitEvt.impactNormal.y : 0; var __normalZ = __hitEvt.impactNormal ? __hitEvt.impactNormal.z : 0; var __velX = __hitEvt.hitVelocity ? __hitEvt.hitVelocity.x : 0; var __velY = __hitEvt.hitVelocity ? __hitEvt.hitVelocity.y : 0; var __velZ = __hitEvt.hitVelocity ? __hitEvt.hitVelocity.z : 0; var __impulse = __hitEvt.impulse || 0; ${body.join(' ')} });`);
      }
    }
  }

  const sections: string[] = [];
  if (beginPlayCode.length) sections.push(`// __beginPlay__\n${beginPlayCode.join('\n')}`);
  if (tickCode.length) sections.push(`// __tick__\n${tickCode.join('\n')}`);
  if (onDestroyCode.length) sections.push(`// __onDestroy__\n${onDestroyCode.join('\n')}`);
  if (sections.length) parts.push(sections.join('\n'));

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
    const icon = tab.type === 'event' ? '📋' : tab.type === 'function' ? 'ƒ' : '⚡';
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
    macroBody.appendChild(makeDeletableItem(m.name, '⚡', 'mybp-macro',
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
    const evtItem = makeDeletableItem(evt.name, '🎯', 'mybp-evt',
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
    sIcon.textContent = '🔷';
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
    const icon = tab.type === 'event' ? '📋' : tab.type === 'function' ? 'ƒ' : '⚡';
    btn.textContent = `${icon} ${tab.label}`;
    btn.addEventListener('click', () => onSwitch(tab));
    container.appendChild(btn);
  }
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
  const base = ['Float', 'Boolean', 'Vector3', 'String', 'Color'] as const;
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
  // Component nodes
  if (node instanceof GetComponentLocationNode) return 'GetComponentLocationNode';
  if (node instanceof SetComponentLocationNode) return 'SetComponentLocationNode';
  if (node instanceof GetComponentRotationNode) return 'GetComponentRotationNode';
  if (node instanceof SetComponentRotationNode) return 'SetComponentRotationNode';
  if (node instanceof GetComponentScaleNode) return 'GetComponentScaleNode';
  if (node instanceof SetComponentScaleNode) return 'SetComponentScaleNode';
  if (node instanceof SetComponentVisibilityNode) return 'SetComponentVisibilityNode';
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
    } else if (ctrl instanceof ColorPickerControl) {
      controls[key] = (ctrl as ColorPickerControl).value;
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
  } else if (node instanceof InputKeyEventNode) {
    data.selectedKey = (node as InputKeyEventNode).selectedKey;
  } else if (node instanceof IsKeyDownNode) {
    data.selectedKey = (node as IsKeyDownNode).selectedKey;
  } else if (node instanceof InputAxisNode) {
    const ia = node as InputAxisNode;
    const posCtrl = ia.controls['posKey'] as ClassicPreset.InputControl<'text'> | undefined;
    const negCtrl = ia.controls['negKey'] as ClassicPreset.InputControl<'text'> | undefined;
    data.positiveKey = (posCtrl?.value as string) || ia.positiveKey;
    data.negativeKey = (negCtrl?.value as string) || ia.negativeKey;
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
    node instanceof SetComponentVisibilityNode
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
      return new CallCustomEventNode(d.eventId, d.eventName, d.eventParams || []);
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

    // Component nodes
    case 'GetComponentLocationNode':  return new GetComponentLocationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentLocationNode':  return new SetComponentLocationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetComponentRotationNode':  return new GetComponentRotationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentRotationNode':  return new SetComponentRotationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetComponentScaleNode':     return new GetComponentScaleNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentScaleNode':     return new SetComponentScaleNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentVisibilityNode': return new SetComponentVisibilityNode(d.compName || 'Root', d.compIndex ?? -1);

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
    case 'SetMovementModeNode':         return new SetMovementModeNode();
    case 'SetMaxWalkSpeedNode':         return new SetMaxWalkSpeedNode();
    case 'LaunchCharacterNode':         return new LaunchCharacterNode();
    case 'SetCameraModeNode':           return new SetCameraModeNode();
    case 'SetCameraFOVNode':            return new SetCameraFOVNode();
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
    case 'SetCameraLagNode':                return new SetCameraLagNode();
    case 'SetCameraRotationLagNode':        return new SetCameraRotationLagNode();
    case 'GetSpringArmLengthNode':          return new GetSpringArmLengthNode();
    case 'GetSpringArmTargetOffsetNode':    return new GetSpringArmTargetOffsetNode();
    case 'GetSpringArmSocketOffsetNode':    return new GetSpringArmSocketOffsetNode();
    case 'CameraModeLiteralNode':           return new CameraModeLiteralNode();
    case 'MovementModeLiteralNode':         return new MovementModeLiteralNode();
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

    default:
      console.warn(`[deserialize] Unknown node type: ${nd.type}`);
      return null;
  }
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
        if (innerEl) innerEl.classList.toggle('fe-selected', isSel);
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
        disableItem.textContent = isDisabled ? '✅ Enable Node' : '🚫 Disable Node';
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
        deleteItem.textContent = '🗑️ Delete';
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
        dupItem.textContent = '📋 Duplicate';
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
  });

  // ── Visual selection sync: apply/remove .fe-selected class on node elements ──
  function syncSelectionVisuals() {
    // We need to apply .fe-selected on BOTH:
    // 1. The outer wrapper div (NodeView.element) — has data-node-id from rendered pipe
    // 2. The inner [data-testid="node"] React element — for CSS selectors to match
    const outerEls = container.querySelectorAll('[data-node-id]');
    outerEls.forEach((outerEl) => {
      const nodeId = outerEl.getAttribute('data-node-id');
      if (!nodeId) return;
      const isSel = selectedNodeIds.has(nodeId);
      (outerEl as HTMLElement).classList.toggle('fe-selected', isSel);
      // Find the inner [data-testid="node"] inside this wrapper
      const innerEl = outerEl.querySelector('[data-testid="node"]') as HTMLElement | null;
      if (innerEl) {
        innerEl.classList.toggle('fe-selected', isSel);
        innerEl.classList.toggle('selected', isSel);
      }
    });
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
}

function NodeEditorView({ gameObject, components, rootMeshType }: NodeEditorViewProps) {
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
      if (!evData) return;
      const code = generateFullCode(evData.editor, bp, functionEditors);
      if (gameObject.scripts.length === 0) gameObject.scripts.push(new ScriptComponent());
      gameObject.scripts[0].code = code;
      gameObject.scripts[0].compile();

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
        }, compEntries);
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
                    await evData.editor.removeNode(n.id);
                    const newCall = new CallCustomEventNode(evt.id, evt.name, evt.params);
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

    // Init
    switchToGraph(graphTabs[0]);

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
  }));
  return () => root.unmount();
}
