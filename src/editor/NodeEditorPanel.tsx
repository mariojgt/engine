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
  StringLiteralNode,
  Vector3LiteralNode,
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
} from './nodes';
import type { NodeEntry, ComponentNodeEntry } from './nodes';
import type { ActorComponentData } from './ActorAsset';

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;

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
    case 'Vector3': {
      const d = v.defaultValue ?? { x: 0, y: 0, z: 0 };
      return `{ x: ${d.x ?? 0}, y: ${d.y ?? 0}, z: ${d.z ?? 0} }`;
    }
    default:
      if (v.type.startsWith('Struct:')) {
        const structId = v.type.slice(7);
        const struct = bp.structs.find(s => s.id === structId);
        if (struct) {
          const parts = struct.fields.map(f => {
            const tempVar: BlueprintVariable = { name: f.name, type: f.type, defaultValue: null, id: '' };
            return `${sanitizeName(f.name)}: ${varDefaultStr(tempVar, bp)}`;
          });
          return `{ ${parts.join(', ')} }`;
        }
      }
      return '0';
  }
}

// ============================================================
//  CODE GENERATOR — shared helpers
// ============================================================
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
    return `__var_${vn}`;
  }
  if (node instanceof SetVariableNode) {
    const vn = sanitizeName(node.varName);
    if (node.varType === 'Vector3') return `__var_${vn}.${outputKey}`;
    if (node.varType.startsWith('Struct:')) return `__var_${vn}.${outputKey}`;
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

  switch (node.label) {
    case 'Float': {
      const ctrl = node.controls['value'] as ClassicPreset.InputControl<'number'>;
      return String(ctrl?.value ?? 0);
    }
    case 'Boolean': {
      const ctrl = node.controls['value'] as ClassicPreset.InputControl<'number'>;
      return (ctrl?.value ?? 0) ? 'true' : 'false';
    }
    case 'String Literal': {
      const ctrl = node.controls['value'] as ClassicPreset.InputControl<'text'>;
      return JSON.stringify(String(ctrl?.value ?? ''));
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
      const struct = bp.structs.find(s => s.id === structId);
      if (struct && struct.fields.length > 0) {
        for (const f of struct.fields) {
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
  const hasInputNodes = inputKeyNodes.length > 0 || isKeyDownNodes.length > 0;
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
  onAddInputKeyNode: (type: 'event' | 'isdown') => void,
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

    // Structs — Make / Break
    if (bp.structs.length > 0) {
      const items: { label: string; action: () => void }[] = [];
      for (const s of bp.structs) {
        if (!lf || `make ${s.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
          items.push({ label: `Make ${s.name}`, action: () => { onAddStructNode(s, 'make'); menu.remove(); } });
        if (!lf || `break ${s.name}`.toLowerCase().includes(lf) || 'structs'.includes(lf))
          items.push({ label: `Break ${s.name}`, action: () => { onAddStructNode(s, 'break'); menu.remove(); } });
      }
      if (items.length) categories.set('Structs', items);
    }

    // Input — Key Event / Is Key Down (event graph only for Key Event)
    {
      const items: { label: string; action: () => void }[] = [];
      if (graphType === 'event') {
        if (!lf || 'input key event'.includes(lf) || 'input'.includes(lf))
          items.push({ label: 'Input Key Event', action: () => { menu.remove(); onAddInputKeyNode('event'); } });
      }
      if (!lf || 'is key down'.includes(lf) || 'input'.includes(lf))
        items.push({ label: 'Is Key Down', action: () => { menu.remove(); onAddInputKeyNode('isdown'); } });
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
  container.appendChild(menu);
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
  const base = ['Float', 'Boolean', 'Vector3', 'String'] as const;
  let html = '';
  for (const t of base) {
    html += `<option value="${t}"${selected === t ? ' selected' : ''}>${t}</option>`;
  }
  for (const s of bp.structs) {
    const val = `Struct:${s.id}`;
    html += `<option value="${val}"${selected === val ? ' selected' : ''}>${s.name}</option>`;
  }
  return html;
}

/** Returns the display name for a VarType (resolving struct IDs to names) */
function typeDisplayName(type: VarType, bp: import('./BlueprintData').BlueprintData): string {
  if (type.startsWith('Struct:')) {
    const struct = bp.structs.find(s => s.id === type.slice(7));
    return struct ? struct.name : 'Struct?';
  }
  return type;
}

/** CSS class suffix for type dot color */
function typeDotClass(type: VarType): string {
  if (type.startsWith('Struct:')) return 'mybp-var-struct';
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
    if (type === 'Vector3') {
      const d = dv || { x: 0, y: 0, z: 0 };
      return `<div style="display:flex;gap:4px;"><input class="mybp-dialog-input" type="number" step="0.1" value="${d.x}" id="dlg-vx" style="flex:1" placeholder="X"/><input class="mybp-dialog-input" type="number" step="0.1" value="${d.y}" id="dlg-vy" style="flex:1" placeholder="Y"/><input class="mybp-dialog-input" type="number" step="0.1" value="${d.z}" id="dlg-vz" style="flex:1" placeholder="Z"/></div>`;
    }
    if (type.startsWith('Struct:')) {
      return `<span style="color:#888;font-size:11px;">Struct — set field defaults via Set nodes</span>`;
    }
    return '';
  }

  function defaultForType(type: VarType): any {
    switch (type) {
      case 'Float': return 0;
      case 'Boolean': return false;
      case 'Vector3': return { x: 0, y: 0, z: 0 };
      case 'String': return '';
      default:
        if (type.startsWith('Struct:')) {
          const struct = bp.structs.find(s => s.id === type.slice(7));
          if (struct) {
            const obj: any = {};
            for (const f of struct.fields) obj[f.name] = defaultForType(f.type);
            return obj;
          }
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
  // Component nodes
  if (node instanceof GetComponentLocationNode) return 'GetComponentLocationNode';
  if (node instanceof SetComponentLocationNode) return 'SetComponentLocationNode';
  if (node instanceof GetComponentRotationNode) return 'GetComponentRotationNode';
  if (node instanceof SetComponentRotationNode) return 'SetComponentRotationNode';
  if (node instanceof GetComponentScaleNode) return 'GetComponentScaleNode';
  if (node instanceof SetComponentScaleNode) return 'SetComponentScaleNode';
  if (node instanceof SetComponentVisibilityNode) return 'SetComponentVisibilityNode';

  return 'Unknown';
}

/** Extract custom data from a node for serialization */
function getNodeSerialData(node: ClassicPreset.Node): any {
  const data: any = {};

  // Save InputControl values
  const controls: any = {};
  for (const [key, ctrl] of Object.entries(node.controls)) {
    if (ctrl instanceof ClassicPreset.InputControl) {
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

    // Variables
    case 'GetVariableNode': {
      const sf = d.structFields || (d.varType?.startsWith('Struct:') ? bp.structs.find(s => s.id === d.varType.slice(7))?.fields : undefined);
      const n = new GetVariableNode(d.varId, d.varName, d.varType, sf);
      if (d.isLocal) (n as any).__isLocal = true;
      return n;
    }
    case 'SetVariableNode': {
      const sf = d.structFields || (d.varType?.startsWith('Struct:') ? bp.structs.find(s => s.id === d.varType.slice(7))?.fields : undefined);
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
        const ctrl = n.controls['value'] as ClassicPreset.InputControl<'number'>;
        if (ctrl) ctrl.setValue(d.controls.value);
      }
      return n;
    }
    case 'StringLiteralNode':   return new StringLiteralNode(d.controls?.value ?? '');
    case 'Vector3LiteralNode':  return new Vector3LiteralNode(d.controls?.x ?? 0, d.controls?.y ?? 0, d.controls?.z ?? 0);
    case 'TimeNode':            return new TimeNode();
    case 'DeltaTimeNode':       return new DeltaTimeNode();

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

    // Component nodes
    case 'GetComponentLocationNode':  return new GetComponentLocationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentLocationNode':  return new SetComponentLocationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetComponentRotationNode':  return new GetComponentRotationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentRotationNode':  return new SetComponentRotationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetComponentScaleNode':     return new GetComponentScaleNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentScaleNode':     return new SetComponentScaleNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentVisibilityNode': return new SetComponentVisibilityNode(d.compName || 'Root', d.compIndex ?? -1);

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

  reactPlugin.addPreset(Presets.classic.setup());
  connection.addPreset(ConnectionPresets.classic.setup());
  editor.use(area);
  area.use(connection);
  area.use(reactPlugin);

  // Right-click
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
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
        const title = type === 'event' ? 'Input Key Event' : 'Is Key Down';
        showKeySelectDialog(container, title, async (key) => {
          const node = type === 'event'
            ? new InputKeyEventNode(key)
            : new IsKeyDownNode(key);
          await editor.addNode(node);
          const t = area.area.transform;
          await area.translate(node.id, { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k });
        });
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

  // ── Node selection & Delete key ──────────────────────────
  const selectedNodeIds = new Set<string>();
  let _lastPointerEvent: PointerEvent | null = null;
  container.addEventListener('pointerdown', (e) => {
    _lastPointerEvent = e;
  }, true);

  // Click on empty canvas = deselect all
  container.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    // Clear selection unless the user clicked on a node element
    const isOnNode = target.closest('[data-testid="node"]') || target.closest('.node');
    if (!isOnNode && !e.shiftKey && !e.ctrlKey) {
      selectedNodeIds.clear();
    }
  });

  // Delete key handler
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Don't delete if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (selectedNodeIds.size > 0) {
        e.preventDefault();
        const ids = [...selectedNodeIds];
        selectedNodeIds.clear();
        (async () => {
          for (const nodeId of ids) {
            // Remove all connections to/from this node first
            const conns = editor.getConnections().filter(
              c => c.source === nodeId || c.target === nodeId
            );
            for (const c of conns) {
              try { await editor.removeConnection(c.id); } catch { /* ok */ }
            }
            try { await editor.removeNode(nodeId); } catch { /* ok */ }
          }
        })();
      }
    }
  }
  container.setAttribute('tabindex', '0');
  container.style.outline = 'none';
  container.addEventListener('keydown', handleKeyDown);
  // Focus the container when clicking on it so key events work
  container.addEventListener('mousedown', () => {
    if (document.activeElement !== container) container.focus();
  });

  // Auto-compile on changes
  editor.addPipe((ctx) => {
    if (['connectioncreated','connectionremoved','nodecreated','noderemoved'].includes(ctx.type)) {
      setTimeout(onChanged, 50);
    }
    return ctx;
  });

  // Save positions when nodes are moved (debounced)
  let _positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  area.addPipe((ctx) => {
    if (ctx.type === 'nodetranslated') {
      if (_positionSaveTimer) clearTimeout(_positionSaveTimer);
      _positionSaveTimer = setTimeout(onChanged, 300);
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
      }
      return ctx;
    });
  }

  // Cleanup helper
  const _cleanup = () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
  (area as any).__cleanup = _cleanup;

  return { editor, area };
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
    const editorStore = new Map<string, { editor: NodeEditor<Schemes>; area: AreaPlugin<Schemes, any>; el: HTMLElement }>();
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
      // Function graphs
      for (const [id, fnEditor] of functionEditors) {
        const fn = bp.getFunction(id);
        const fnData = editorStore.get(id);
        if (fn && fnData) fn.graph.nodeData = serializeGraph(fnEditor, fnData.area);
      }
      // Macro graphs
      for (const [id, mEditor] of macroEditors) {
        const m = bp.getMacro(id);
        const mData = editorStore.get(id);
        if (m && mData) m.graph.nodeData = serializeGraph(mEditor, mData.area);
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
        const { editor, area } = await createGraphEditor(el, bp, tab.type, funcId, compileAndSave, (node) => {
          if (node instanceof FunctionCallNode) {
            const funcTab = graphTabs.find(t => t.refId === (node as FunctionCallNode).funcId);
            if (funcTab) switchToGraph(funcTab);
          }
        }, compEntries);
        data = { editor, area, el };
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
