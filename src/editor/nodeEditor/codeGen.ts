// ============================================================
//  Code Generation — resolveValue, walkExec, genAction, generateFullCode
//  Turns the visual node graph into a JavaScript string.
// ============================================================

import { NodeEditor, ClassicPreset } from 'rete';
import type { BlueprintVariable, VarType } from '../BlueprintData';
import * as N from '../nodes';
import { EventAssetManager } from '../EventAsset';
import { TextureLibrary } from '../TextureLibrary';
import {
  type Schemes,
  type NodeMap,
  type SrcMap,
  type DstMap,
  getStructMgr,
  getDataTableMgr,
  getSaveGameMgr,
  getNodeCategory,
} from './state';

// ── Anim-blueprint flag (local to code gen) ──────────────────
let _isAnimBlueprint = false;

// ============================================================
export function sanitizeName(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_]/g, '_');
  // If sanitization changed any characters, append a short hash of the original
  // to prevent collisions (e.g. "My Var" and "My-Var" both → "My_Var" without this).
  if (s !== name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    return s + '_' + (h >>> 0).toString(36);
  }
  return s;
}

export function varDefaultStr(v: BlueprintVariable, bp: import('../BlueprintData').BlueprintData): string {
  switch (v.type) {
    case 'Float': return String(v.defaultValue ?? 0);
    case 'Boolean': return String(v.defaultValue ?? false);
    case 'String': return JSON.stringify(String(v.defaultValue ?? ''));
    case 'Color': return JSON.stringify(String(v.defaultValue ?? '#ffffff'));
    case 'BlackboardKeySelector': return JSON.stringify(String(v.defaultValue ?? ''));
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
//  CODE GENERATOR â€” shared helpers
// ============================================================

/** Resolve struct fields from per-actor BlueprintData OR project-level StructureAssetManager */
export function resolveStructFields(structId: string, bp: import('../BlueprintData').BlueprintData): { name: string; type: VarType }[] | undefined {
  // 1. Per-actor struct
  const bpStruct = bp.structs.find(s => s.id === structId);
  if (bpStruct) return bpStruct.fields;
  // 2. Project-level struct
  if (getStructMgr()) {
    const projStruct = getStructMgr()!.getStructure(structId);
    if (projStruct) return projStruct.fields.map(f => ({ name: f.name, type: f.type }));
  }
  return undefined;
}

export function buildMaps(editor: NodeEditor<Schemes>) {
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

export function fieldDefault(type: VarType): string {
  switch (type) {
    case 'Float':   return '0';
    case 'Boolean': return 'false';
    case 'String':  return '""';
    case 'Color':   return '"#ffffff"';
    case 'Vector3': return '{ x: 0, y: 0, z: 0 }';
    default:        return '{}';
  }
}

// ── Cycle-detection stacks (module-level, cleaned via try/finally) ───────
const _resolveCycleStack = new Set<string>();
const _execCycleStack = new Set<string>();

function resolveValue(
  nodeId: string, outputKey: string,
  nodeMap: NodeMap, inputSrc: SrcMap, bp: import('../BlueprintData').BlueprintData,
): string {
  const node = nodeMap.get(nodeId);
  if (!node) return '0';

  // Cycle detection — prevent infinite recursion on circular data wires
  const _rvKey = `${nodeId}.${outputKey}`;
  if (_resolveCycleStack.has(_rvKey)) {
    console.warn(`[CodeGen] Data cycle detected at ${nodeId}.${outputKey}, returning 0`);
    return '0';
  }
  _resolveCycleStack.add(_rvKey);
  try {

  if (node instanceof N.GetVariableNode) {
    const vn = sanitizeName(node.varName);
    if (node.varType === 'Vector3') return `__var_${vn}.${outputKey}`;
    if (node.varType.startsWith('Struct:')) return `__var_${vn}.${outputKey}`;
    // Enum and other types â€” simple value
    return `__var_${vn}`;
  }
  if (node instanceof N.SetVariableNode) {
    const vn = sanitizeName(node.varName);
    if (node.varType === 'Vector3') return `__var_${vn}.${outputKey}`;
    if (node.varType.startsWith('Struct:')) return `__var_${vn}.${outputKey}`;
    // Enum and other types â€” simple value
    return `__var_${vn}`;
  }
  if (node instanceof N.MakeStructNode) {
    const fields = node.structFields;
    const parts = fields.map(f => {
      const s = inputSrc.get(`${nodeId}.${f.name}`);
      const val = s ? resolveValue(s.nid, s.ok, nodeMap, inputSrc, bp) : fieldDefault(f.type);
      return `${sanitizeName(f.name)}: ${val}`;
    });
    return `({ ${parts.join(', ')} })`;
  }
  if (node instanceof N.BreakStructNode) {
    const s = inputSrc.get(`${nodeId}.struct`);
    const structVal = s ? resolveValue(s.nid, s.ok, nodeMap, inputSrc, bp) : '{}';
    return `(${structVal}).${outputKey}`;
  }

  // ── DataTable node outputs ────────────────────────────────────────

  // GetDataTableRowNode (impure) — vars are set during exec (genAction)
  if (node instanceof N.GetDataTableRowNode) {
    const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    if (outputKey === 'rowFound') return `(typeof __dt_found_${uid} !== 'undefined' ? __dt_found_${uid} : false)`;
    if (outputKey === 'outRow')   return `(typeof __dt_row_${uid} !== 'undefined' ? __dt_row_${uid} : null)`;
    // Per-field access (when wired directly, e.g. via struct-split pins)
    return `(typeof __dt_row_${uid} !== 'undefined' && __dt_row_${uid} ? __dt_row_${uid}[${JSON.stringify(outputKey)}] : null)`;
  }

  // GetDataTableRowPureNode (pure) — inline lookup, no exec
  if (node instanceof N.GetDataTableRowPureNode) {
    const dtId = (node as N.GetDataTableRowPureNode).dataTableId;
    const safeDtId = dtId.replace(/[^a-zA-Z0-9]/g, '_');
    const rowNameSrc = inputSrc.get(`${nodeId}.rowName`);
    const rowNameExpr = rowNameSrc
      ? resolveValue(rowNameSrc.nid, rowNameSrc.ok, nodeMap, inputSrc, bp)
      : '""';
    const tbl = `(typeof __dt_${safeDtId} !== 'undefined' ? __dt_${safeDtId}.rows[String(${rowNameExpr})] : null)`;
    if (outputKey === 'rowFound') return `(${tbl} != null)`;
    if (outputKey === 'outRow')   return tbl;
    // Per-field
    return `(${tbl} ? (${tbl})[${JSON.stringify(outputKey)}] : null)`;
  }

  // Pure DataTable utility outputs
  if (node instanceof N.GetDataTableRowCountNode) {
    const dtId = (node as any).dataTableId;
    const safeDtId = dtId.replace(/[^a-zA-Z0-9]/g, '_');
    return `(typeof __dt_${safeDtId} !== 'undefined' ? Object.keys(__dt_${safeDtId}.rows).length : 0)`;
  }
  if (node instanceof N.GetDataTableRowNamesNode) {
    const dtId = (node as any).dataTableId;
    const safeDtId = dtId.replace(/[^a-zA-Z0-9]/g, '_');
    return `(typeof __dt_${safeDtId} !== 'undefined' ? Object.keys(__dt_${safeDtId}.rows) : [])`;
  }
  if (node instanceof N.GetAllDataTableRowsNode) {
    const dtId = (node as any).dataTableId;
    const safeDtId = dtId.replace(/[^a-zA-Z0-9]/g, '_');
    return `(typeof __dt_${safeDtId} !== 'undefined' ? Object.values(__dt_${safeDtId}.rows) : [])`;
  }
  if (node instanceof N.DoesDataTableRowExistNode) {
    const dtId = (node as any).dataTableId;
    const safeDtId = dtId.replace(/[^a-zA-Z0-9]/g, '_');
    const rowNameSrc = inputSrc.get(`${nodeId}.rowName`);
    const rowNameExpr = rowNameSrc
      ? resolveValue(rowNameSrc.nid, rowNameSrc.ok, nodeMap, inputSrc, bp)
      : '""';
    return `(typeof __dt_${safeDtId} !== 'undefined' && __dt_${safeDtId}.rows[String(${rowNameExpr})] != null)`;
  }

  // GetDataTableFieldNode — inline lookup of a single named field
  if (node instanceof N.GetDataTableFieldNode) {
    const n = node as N.GetDataTableFieldNode;
    const safeDtId = n.dataTableId.replace(/[^a-zA-Z0-9]/g, '_');
    const rowNameSrc = inputSrc.get(`${nodeId}.rowName`);
    const rowNameExpr = rowNameSrc
      ? resolveValue(rowNameSrc.nid, rowNameSrc.ok, nodeMap, inputSrc, bp)
      : '""';
    const fieldKey = n.fieldName ? JSON.stringify(n.fieldName) : '""';
    return `(typeof __dt_${safeDtId} !== 'undefined' && __dt_${safeDtId}.rows[String(${rowNameExpr})] != null ? __dt_${safeDtId}.rows[String(${rowNameExpr})][${fieldKey}] : null)`;
  }

  // ForEachDataTableRow — loop iteration outputs
  if (node instanceof N.ForEachDataTableRowNode) {
    const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    if (outputKey === 'row')      return `__fe_row_${uid}`;
    if (outputKey === 'rowName')  return `__fe_rowName_${uid}`;
    if (outputKey === 'rowIndex') return `__fe_ri_${uid}`;
    return '0';
  }

  // FindRowsByPredicateNode — matched rows and count
  if (node instanceof N.FindRowsByPredicateNode) {
    const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    if (outputKey === 'matchingRows') return `__frp_rows_${uid}`;
    if (outputKey === 'matchCount')   return `__frp_count_${uid}`;
    return '[]';
  }

  // ── Texture pure-node resolveValue ────────────────────────────────

  // GetTextureIDNode — selected texture baked into the node control
  if (node instanceof N.GetTextureIDNode) {
    const texId = (node as N.GetTextureIDNode).getTextureId?.() ?? '';
    if (outputKey === 'textureId') return JSON.stringify(texId);
    if (outputKey === 'name')      return `(__textureMeta[${JSON.stringify(texId)}] ? __textureMeta[${JSON.stringify(texId)}].name : '')`;
    if (outputKey === 'width')     return `(__textureMeta[${JSON.stringify(texId)}] ? __textureMeta[${JSON.stringify(texId)}].width : 0)`;
    if (outputKey === 'height')    return `(__textureMeta[${JSON.stringify(texId)}] ? __textureMeta[${JSON.stringify(texId)}].height : 0)`;
    return '0';
  }

  // FindTextureByNameNode — runtime name→id lookup via embedded map
  if (node instanceof N.FindTextureByNameNode) {
    const nameSrc = inputSrc.get(`${nodeId}.name`);
    const nameExpr = nameSrc ? resolveValue(nameSrc.nid, nameSrc.ok, nodeMap, inputSrc, bp) : '""';
    if (outputKey === 'textureId') return `(__textureNameMap[String(${nameExpr}).toLowerCase()] || '')`;
    if (outputKey === 'found')     return `(!!__textureNameMap[String(${nameExpr}).toLowerCase()])`;
    return '""';
  }

  // GetTextureInfoNode — runtime metadata lookup by texture ID
  if (node instanceof N.GetTextureInfoNode) {
    const idSrc = inputSrc.get(`${nodeId}.textureId`);
    const idExpr = idSrc ? resolveValue(idSrc.nid, idSrc.ok, nodeMap, inputSrc, bp) : '""';
    const meta = `__textureMeta[${idExpr}]`;
    if (outputKey === 'name')     return `(${meta} ? ${meta}.name : '')`;
    if (outputKey === 'width')    return `(${meta} ? ${meta}.width : 0)`;
    if (outputKey === 'height')   return `(${meta} ? ${meta}.height : 0)`;
    if (outputKey === 'hasAlpha') return `(${meta} ? ${meta}.hasAlpha : false)`;
    if (outputKey === 'format')   return `(${meta} ? ${meta}.format : '')`;
    return '""';
  }

  // LoadTextureNode — data outputs resolved via temp vars set in genAction
  if (node instanceof N.LoadTextureNode) {
    const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    if (outputKey === 'textureId') return `(typeof __loadTex_id_${uid} !== 'undefined' ? __loadTex_id_${uid} : '')`;
    if (outputKey === 'success')   return `(typeof __loadTex_ok_${uid} !== 'undefined' ? __loadTex_ok_${uid} : false)`;
    return '""';
  }

  if (node instanceof N.FunctionCallNode) {
    return `__fn_result_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}.${sanitizeName(outputKey)}`;
  }
  // CallActorFunctionNode â€” remote function call outputs (resolved via temp var)
  if (node instanceof N.CallActorFunctionNode) {
    return `__rfn_result_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}.${sanitizeName(outputKey)}`;
  }

  // FunctionEntryNode â€” parameters
  if (node instanceof N.FunctionEntryNode) {
    if (outputKey === 'exec') return '0';
    return `__param_${sanitizeName(outputKey)}`;
  }

  // CustomEventNode â€” event parameter outputs
  if (node instanceof N.CustomEventNode) {
    if (outputKey === 'exec') return '0';
    return `__cev_param_${sanitizeName(outputKey)}`;
  }

  // IsKeyDownNode â€” poll key state
  if (node instanceof N.IsKeyDownNode) {
    const ikd = node as N.IsKeyDownNode;
    const keyCtrl = ikd.controls['key'] as N.KeySelectControl | undefined;
    const key = keyCtrl?.value ?? ikd.selectedKey;
    const itype = N.inputType(key);
    const kc = N.keyEventCode(key);
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

  if (node instanceof N.GetInputActionNode) {
    const n = node as N.GetInputActionNode;
    const ctrl = n.controls['action'] as N.ActionMappingSelectControl | undefined;
    const action = ctrl?.value ?? n.selectedAction;
    return `(__engine && __engine.input ? __engine.input.getAction(${JSON.stringify(action)}) : false)`;
  }

  if (node instanceof N.GetInputAxisNode) {
    const n = node as N.GetInputAxisNode;
    const ctrl = n.controls['axis'] as N.AxisMappingSelectControl | undefined;
    const axis = ctrl?.value ?? n.selectedAxis;
    return `(__engine && __engine.input ? __engine.input.getAxis(${JSON.stringify(axis)}) : 0)`;
  }

  if (node instanceof N.InputAxisMappingEventNode) {
    return `__axis_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  // InputAxisNode â€” two-key axis: positive key â†’ +1, negative key â†’ -1
  if (node instanceof N.InputAxisNode) {
    const ia = node as N.InputAxisNode;
    // Read from controls (user may have changed them via dropdown)
    const posCtrl = ia.controls['posKey'] as N.KeySelectControl | undefined;
    const negCtrl = ia.controls['negKey'] as N.KeySelectControl | undefined;
    const posKey = posCtrl?.value ?? ia.positiveKey;
    const negKey = negCtrl?.value ?? ia.negativeKey;
    const posCode = N.keyEventCode(posKey);
    const negCode = N.keyEventCode(negKey);
    const posType = N.inputType(posKey);
    const negType = N.inputType(negKey);

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
  if (node instanceof N.OnTriggerBeginOverlapNode || node instanceof N.OnTriggerEndOverlapNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    if (outputKey === 'selfComponent') return '__selfComponent';
    return '0';
  }
  // Bound trigger component overlap event outputs (UE-style per-component)
  if (node instanceof N.OnTriggerComponentBeginOverlapNode || node instanceof N.OnTriggerComponentEndOverlapNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    return '0';
  }
  if (node instanceof N.OnActorBeginOverlapNode || node instanceof N.OnActorEndOverlapNode) {
    if (outputKey === 'otherActor') return '__otherActor';
    if (outputKey === 'otherActorName') return '__otherActorName';
    if (outputKey === 'otherActorId') return '__otherActorId';
    return '0';
  }
  if (node instanceof N.OnCollisionHitNode) {
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

  // â”€â”€ N.OnEventNode â€” dynamic payload field outputs â”€â”€
  if (node instanceof N.OnEventNode) {
    if (outputKey === 'exec') return '0';
    // Dynamic field outputs: field_VarName â†’ __payload.VarName
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
    return `(__engine.anim2d.getCurrentState(gameObject))`;
  }

  // ============================================================
  //  Sprite Nodes
  // ============================================================
  if (node.label === 'Get Anim Variable 2D') {
    const varName = resolveValue(nodeId, 'varName', nodeMap, inputSrc, bp);
    return `(__engine.anim2d.getVariable(gameObject, ${varName}))`;
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
  if (node instanceof N.GetComponentLocationNode) {
    const ref = (node as N.GetComponentLocationNode).compIndex === -1
      ? '(gameObject.group || gameObject.mesh)'  // 2D: SpriteActor.group; 3D: GameObject.mesh
      : `((gameObject._meshComponents || [])[${(node as N.GetComponentLocationNode).compIndex}] || {}).mesh`;
    return `(${ref} ? ${ref}.position.${outputKey} : 0)`;
  }
  if (node instanceof N.GetComponentRotationNode) {
    const ref = (node as N.GetComponentRotationNode).compIndex === -1
      ? '(gameObject.group || gameObject.mesh)'  // 2D: SpriteActor.group; 3D: GameObject.mesh
      : `((gameObject._meshComponents || [])[${(node as N.GetComponentRotationNode).compIndex}] || {}).mesh`;
    return `(${ref} ? ${ref}.rotation.${outputKey} : 0)`;
  }
  if (node instanceof N.GetComponentScaleNode) {
    const ref = (node as N.GetComponentScaleNode).compIndex === -1
      ? '(gameObject.group || gameObject.mesh)'  // 2D: SpriteActor.group; 3D: GameObject.mesh
      : `((gameObject._meshComponents || [])[${(node as N.GetComponentScaleNode).compIndex}] || {}).mesh`;
    return `(${ref} ? ${ref}.scale.${outputKey} : 1)`;
  }

  // Get Material node â€” returns the material asset ID on a specific slot
  if (node instanceof N.GetMeshMaterialNode) {
    const ci = (node as N.GetMeshMaterialNode).compIndex;
    const ref = ci === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const sS = inputSrc.get(`${nodeId}.slotIndex`);
    const slotExpr = sS ? rv(sS.nid, sS.ok) : '0';
    return `(function(){ const _ref = ${ref}; if (!_ref) return ""; const _ms = []; _ref.traverse(c => { if (c.isMesh) _ms.push(c); }); const _si = ${slotExpr}; return (_si >= 0 && _si < _ms.length && _ms[_si].material && _ms[_si].material.userData && _ms[_si].material.userData.__materialAssetId) ? _ms[_si].material.userData.__materialAssetId : ""; })()`;
  }

  // Trigger component getter nodes
  if (node instanceof N.GetTriggerEnabledNode) {
    return `(((gameObject._triggerComponents || [])[${(node as N.GetTriggerEnabledNode).compIndex}] || {}).config || {}).enabled ? 1 : 0`;
  }
  if (node instanceof N.GetTriggerOverlapCountNode) {
    return `(__physics.collision.getOverlappingCount(gameObject.id))`;
  }
  if (node instanceof N.IsTriggerOverlappingNode) {
    const idS = inputSrc.get(`${nodeId}.actorId`);
    return `(__physics.collision.isOverlapping(gameObject.id, ${idS ? rv(idS.nid, idS.ok) : '0'}) ? 1 : 0)`;
  }
  if (node instanceof N.GetTriggerShapeNode) {
    return `(((gameObject._triggerComponents || [])[${(node as N.GetTriggerShapeNode).compIndex}] || {}).config || {}).shape || 'box'`;
  }

  // Light component getter nodes
  if (node instanceof N.GetLightEnabledNode) {
    const ci = (node as N.GetLightEnabledNode).compIndex;
    return `((gameObject._lightComponents || [])[${ci}] ? (gameObject._lightComponents[${ci}].light.visible ? 1 : 0) : 0)`;
  }
  if (node instanceof N.GetLightColorNode) {
    const ci = (node as N.GetLightColorNode).compIndex;
    return `((gameObject._lightComponents || [])[${ci}] ? '#' + gameObject._lightComponents[${ci}].light.color.getHexString() : '#ffffff')`;
  }
  if (node instanceof N.GetLightIntensityNode) {
    const ci = (node as N.GetLightIntensityNode).compIndex;
    return `((gameObject._lightComponents || [])[${ci}] ? gameObject._lightComponents[${ci}].light.intensity : 0)`;
  }
  if (node instanceof N.GetLightPositionNode) {
    const ci = (node as N.GetLightPositionNode).compIndex;
    return `((gameObject._lightComponents || [])[${ci}] ? gameObject._lightComponents[${ci}].light.position.${outputKey} : 0)`;
  }
  // Collision query nodes
  if (node instanceof N.IsOverlappingActorNode) {
    const idS = inputSrc.get(`${nodeId}.actorId`);
    return `(__physics.collision.isOverlapping(gameObject.id, ${idS ? rv(idS.nid, idS.ok) : '0'}) ? 1 : 0)`;
  }
  if (node instanceof N.GetOverlapCountNode) {
    return `(__physics.collision.getOverlappingCount(gameObject.id))`;
  }

  // Character movement query nodes
  if (node instanceof N.GetCharacterVelocityNode) {
    const cc = `gameObject.characterController`;
    return `(${cc} ? ${cc}.getNormalizedSpeed() : 0)`;
  }
  if (node instanceof N.GetMovementSpeedNode) {
    return `(gameObject.characterController ? gameObject.characterController.getSpeed() : 0)`;
  }
  if (node instanceof N.IsGroundedNode) {
    return `(gameObject.characterController ? gameObject.characterController.isGrounded : false)`;
  }
  if (node instanceof N.IsJumpingNode) {
    return `(gameObject.characterController ? gameObject.characterController.isJumping : false)`;
  }
  if (node instanceof N.IsCrouchingNode) {
    return `(gameObject.characterController ? gameObject.characterController.isCrouching : false)`;
  }
  if (node instanceof N.IsFallingNode) {
    return `(gameObject.characterController ? gameObject.characterController.isFalling : false)`;
  }
  if (node instanceof N.IsFlyingNode) {
    return `(gameObject.characterController ? gameObject.characterController.movementMode === 'flying' : false)`;
  }
  if (node instanceof N.IsSwimmingNode) {
    return `(gameObject.characterController ? gameObject.characterController.movementMode === 'swimming' : false)`;
  }
  if (node instanceof N.IsMovingNode) {
    return `(gameObject.characterController ? gameObject.characterController.isMoving() : false)`;
  }
  if (node instanceof N.GetMovementModeNode) {
    return `(gameObject.characterController ? gameObject.characterController.movementMode : 'walking')`;
  }
  if (node instanceof N.GetCameraLocationNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'x') return `(${cc} ? ${cc}.camera.position.x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.camera.position.y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.camera.position.z : 0)`;
    return '0';
  }
  // Camera Control query nodes
  if (node instanceof N.GetControllerRotationNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'yaw') return `(${cc} ? ${cc}.yaw * 180 / Math.PI : 0)`;
    if (outputKey === 'pitch') return `(${cc} ? ${cc}.pitch * 180 / Math.PI : 0)`;
    return '0';
  }
  if (node instanceof N.GetMouseLockStatusNode) {
    return `(gameObject.characterController ? gameObject.characterController.isMouseLocked() : false)`;
  }
  // Player Controller query nodes
  if (node instanceof N.GetPlayerControllerNode) {
    // Returns a reference to the player controller
    return `(gameObject.scene.engine?.playerControllers.get(0) ?? null)`;
  }
  if (node instanceof N.IsMouseCursorVisibleNode) {
    return `(gameObject.scene.engine?.playerControllers.get(0)?.isMouseCursorVisible() ?? true)`;
  }
  // Camera & Spring Arm query nodes
  if (node instanceof N.GetSpringArmLengthNode) {
    return `(gameObject.characterController ? gameObject.characterController.getSpringArmLength() : 0)`;
  }
  if (node instanceof N.GetSpringArmTargetOffsetNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'x') return `(${cc} ? ${cc}.getSpringArmTargetOffset().x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.getSpringArmTargetOffset().y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.getSpringArmTargetOffset().z : 0)`;
    return '0';
  }
  if (node instanceof N.GetSpringArmSocketOffsetNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'x') return `(${cc} ? ${cc}.getSpringArmSocketOffset().x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.getSpringArmSocketOffset().y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.getSpringArmSocketOffset().z : 0)`;
    return '0';
  }
  if (node instanceof N.GetCameraRotationNode) {
    const cc = `gameObject.characterController`;
    if (outputKey === 'x') return `(${cc} ? ${cc}.camera.rotation.x : 0)`;
    if (outputKey === 'y') return `(${cc} ? ${cc}.camera.rotation.y : 0)`;
    if (outputKey === 'z') return `(${cc} ? ${cc}.camera.rotation.z : 0)`;
    return '0';
  }
  // Player Controller query nodes
  if (node instanceof N.GetControlledPawnNode) {
    if (outputKey === 'name') return `(gameObject.characterController ? gameObject.characterController.gameObject.name : '')`;
    if (outputKey === 'hasPawn') return `(!!gameObject.characterController)`;
    return '""';
  }
  if (node instanceof N.IsPossessingNode) {
    return `(!!gameObject.characterController)`;
  }
  // AI Controller query nodes
  if (node instanceof N.GetAIStateNode) {
    return `(gameObject.aiController ? gameObject.aiController.state : 'idle')`;
  }
  if (node instanceof N.AIHasReachedTargetNode) {
    return `(gameObject.aiController ? gameObject.aiController.hasReachedTarget() : false)`;
  }
  if (node instanceof N.AIGetDistanceToTargetNode) {
    return `(gameObject.aiController ? gameObject.aiController.getDistanceToTarget() : 0)`;
  }
  // â”€â”€ AI Task / BT node outputs â”€â”€
  if (node instanceof N.AIReceiveExecuteNode || node instanceof N.AIReceiveAbortNode ||
      node instanceof N.AIPerformConditionCheckNode || node instanceof N.AIObserverActivatedNode ||
      node instanceof N.AIObserverDeactivatedNode || node instanceof N.AIServiceActivatedNode ||
      node instanceof N.AIServiceDeactivatedNode) {
    if (outputKey === 'ownerController') return `__aiController`;
    if (outputKey === 'controlledPawn') return `gameObject`;
    return 'null';
  }
  if (node instanceof N.AIReceiveTickNode || node instanceof N.AIServiceTickNode) {
    if (outputKey === 'ownerController') return `__aiController`;
    if (outputKey === 'controlledPawn') return `gameObject`;
    if (outputKey === 'deltaTime') return `deltaTime`;
    return 'null';
  }
  if (node instanceof N.OnPossessNode) {
    if (outputKey === 'possessedPawn') return `gameObject`;
    return 'null';
  }
  if (node instanceof N.OnMoveCompletedNode) {
    if (outputKey === 'requestId') return `0`;
    if (outputKey === 'result') return `(gameObject.aiController ? (gameObject.aiController.state === 'idle' ? 'Success' : 'InProgress') : 'Failed')`;
    return 'null';
  }
  if (node instanceof N.OnPerceptionUpdatedNode) {
    if (outputKey === 'updatedActors') return `[]`;
    return 'null';
  }
  // Blackboard
  if (node instanceof N.GetBlackboardValueNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? resolveValue(kS.nid, kS.ok, nodeMap, inputSrc, bp) : JSON.stringify(String(keyCtrl));
    return `(gameObject.aiController ? gameObject.aiController.getBlackboardValue(${key}) : null)`;
  }
  if (node instanceof N.GetBlackboardValueAsBoolNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? resolveValue(kS.nid, kS.ok, nodeMap, inputSrc, bp) : JSON.stringify(String(keyCtrl));
    return `(gameObject.aiController ? (gameObject.aiController.getBlackboardValue(${key}) || false) : false)`;
  }
  if (node instanceof N.GetBlackboardValueAsFloatNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? resolveValue(kS.nid, kS.ok, nodeMap, inputSrc, bp) : JSON.stringify(String(keyCtrl));
    return `(gameObject.aiController ? (parseFloat(gameObject.aiController.getBlackboardValue(${key})) || 0) : 0)`;
  }
  if (node instanceof N.GetBlackboardValueAsVectorNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? resolveValue(kS.nid, kS.ok, nodeMap, inputSrc, bp) : JSON.stringify(String(keyCtrl));
    return `(gameObject.aiController ? (gameObject.aiController.getBlackboardValue(${key}) || {x:0, y:0, z:0}) : {x:0, y:0, z:0})`;
  }

  if (node instanceof N.MakeVectorNode) {
    const xs = inputSrc.get(`${nodeId}.x`);
    const ys = inputSrc.get(`${nodeId}.y`);
    const zs = inputSrc.get(`${nodeId}.z`);
    const cx = (node.inputs['x']?.control as any)?.value ?? 0;
    const cy = (node.inputs['y']?.control as any)?.value ?? 0;
    const cz = (node.inputs['z']?.control as any)?.value ?? 0;
    const x = xs ? resolveValue(xs.nid, xs.ok, nodeMap, inputSrc, bp) : cx;
    const y = ys ? resolveValue(ys.nid, ys.ok, nodeMap, inputSrc, bp) : cy;
    const z = zs ? resolveValue(zs.nid, zs.ok, nodeMap, inputSrc, bp) : cz;
    return `{ x: ${x}, y: ${y}, z: ${z} }`;
  }
  if (node instanceof N.BreakVectorNode) {
    const vecS = inputSrc.get(`${nodeId}.vec`);
    const vec = vecS ? resolveValue(vecS.nid, vecS.ok, nodeMap, inputSrc, bp) : "{ x: 0, y: 0, z: 0 }";
    return `(${vec}).${outputKey}`;
  }

  // RunBehaviorTree / MoveToLocation / RotateToFace â€” result outputs (set by genAction temp vars)
  if (node instanceof N.RunBehaviorTreeNode) {
    if (outputKey === 'success') return `__rbt_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'controller') return `__rbt_ctrl_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'pawn') return `__rbt_pawn_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'null';
  }
  if (node instanceof N.MoveToLocationNode) {
    if (outputKey === 'success') return `__mtl_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof N.RotateToFaceNode) {
    if (outputKey === 'success') return `__rtf_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  // â”€â”€ NavMesh expression nodes â”€â”€
  if (node instanceof N.NavMeshIsReadyNode) {
    return `(__engine && __engine.navMeshSystem ? __engine.navMeshSystem.isReady : false)`;
  }
  if (node instanceof N.NavMeshFindClosestPointNode) {
    const posS = inputSrc.get(`${nodeId}.position`);
    const pos = posS ? resolveValue(posS.nid, posS.ok, nodeMap, inputSrc, bp) : '{x:0,y:0,z:0}';
    if (outputKey === 'closestPoint') return `(__engine && __engine.navMeshSystem ? (__engine.navMeshSystem.findClosestPoint(${pos}) || {x:0,y:0,z:0}) : {x:0,y:0,z:0})`;
    if (outputKey === 'found') return `(__engine && __engine.navMeshSystem ? !!__engine.navMeshSystem.findClosestPoint(${pos}) : false)`;
    return 'null';
  }
  if (node instanceof N.NavMeshRandomPointNode) {
    // Result computed in genAction (exec flow); safe fallback if node has no exec connection
    const v = `__nmrp_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'point') return `(typeof ${v}_pt !== 'undefined' ? (${v}_pt || {x:0,y:0,z:0}) : {x:0,y:0,z:0})`;
    if (outputKey === 'found') return `(typeof ${v}_ok !== 'undefined' ? (${v}_ok || false) : false)`;
    return 'null';
  }
  if (node instanceof N.NavMeshGetAgentPositionNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const agentId = idS ? resolveValue(idS.nid, idS.ok, nodeMap, inputSrc, bp) : "''";
    return `(__engine && __engine.navMeshSystem ? (__engine.navMeshSystem.getAgentPosition(${agentId}) || {x:0,y:0,z:0}) : {x:0,y:0,z:0})`;
  }
  if (node instanceof N.NavMeshGetAgentVelocityNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const agentId = idS ? resolveValue(idS.nid, idS.ok, nodeMap, inputSrc, bp) : "''";
    return `(__engine && __engine.navMeshSystem ? (__engine.navMeshSystem.getAgentVelocity(${agentId}) || {x:0,y:0,z:0}) : {x:0,y:0,z:0})`;
  }
  if (node instanceof N.NavMeshAgentReachedTargetNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const thS = inputSrc.get(`${nodeId}.threshold`);
    const agentId = idS ? resolveValue(idS.nid, idS.ok, nodeMap, inputSrc, bp) : "''";
    const threshold = thS ? resolveValue(thS.nid, thS.ok, nodeMap, inputSrc, bp) : '0.5';
    return `(__engine && __engine.navMeshSystem ? __engine.navMeshSystem.hasAgentReachedTarget(${agentId}, ${threshold}) : false)`;
  }
  // NavMesh exec+result nodes â€” temp vars set in genAction
  if (node instanceof N.NavMeshBuildNode) {
    if (outputKey === 'success') return `__nmb_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof N.NavMeshFindPathNode) {
    const v = `__nmfp_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'path') return `(${v}_path || [])`;
    if (outputKey === 'pathFound') return `(${v}_ok || false)`;
    return 'null';
  }
  if (node instanceof N.NavMeshAddAgentNode) {
    const v = `__nmaa_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'agentId') return `(${v}_id || '')`;
    if (outputKey === 'success') return `(${v}_ok || false)`;
    return 'null';
  }
  if (node instanceof N.NavMeshAgentMoveToNode) {
    if (outputKey === 'success') return `__nmamt_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof N.NavMeshAddBoxObstacleNode) {
    if (outputKey === 'success') return `__nmabo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof N.NavMeshAddCylinderObstacleNode) {
    if (outputKey === 'success') return `__nmaco_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof N.NavMeshRemoveObstacleNode) {
    if (outputKey === 'success') return `__nmro_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  // â”€â”€ Controller â†” Pawn bidirectional nodes â”€â”€
  if (node instanceof N.GetControllerNode) {
    if (outputKey === 'type') return `(gameObject.controller ? gameObject.controller.controllerType : 'None')`;
    if (outputKey === 'hasController') return `(!!gameObject.controller)`;
    return `'None'`;
  }
  if (node instanceof N.GetControllerTypeNode) {
    return `(gameObject.controller ? gameObject.controller.controllerType : 'None')`;
  }
  if (node instanceof N.GetPawnNode) {
    if (outputKey === 'name') return `(gameObject.controller && gameObject.controller.getPawn() ? gameObject.controller.getPawn().gameObject.name : '')`;
    if (outputKey === 'hasPawn') return `(gameObject.controller ? gameObject.controller.isPossessing() : false)`;
    return `''`;
  }
  if (node instanceof N.IsPlayerControlledNode) {
    return `(gameObject.controller ? gameObject.controller.controllerType === 'PlayerController' : false)`;
  }
  if (node instanceof N.IsAIControlledNode) {
    return `(gameObject.controller ? gameObject.controller.controllerType === 'AIController' : false)`;
  }
  if (node instanceof N.CameraModeLiteralNode) {
    const ctrl = node.controls['mode'] as ClassicPreset.InputControl<'text'>;
    return `'${ctrl?.value ?? 'thirdPerson'}'`;
  }
  if (node instanceof N.MovementModeLiteralNode) {
    const ctrl = node.controls['mode'] as N.MovementModeSelectControl;
    return `'${ctrl?.value ?? 'walking'}'`;
  }

  // â”€â”€ Casting & Reference data nodes â”€â”€
  if (node instanceof N.GetSelfReferenceNode) {
    // Return the appropriate "Self" based on the context:
    // - Actor/Anim BP: gameObject
    // - Widget BP: __widgetHandle
    return '(typeof gameObject !== "undefined" ? gameObject : (typeof __widgetHandle !== "undefined" ? __widgetHandle : null))';
  }
  if (node instanceof N.GetPlayerPawnNode) {
    if (outputKey === 'pawn') return `(__scene ? __scene.gameObjects.find(function(g) { return g.actorType === 'characterPawn' && g.characterController; }) || null : null)`;
    if (outputKey === 'valid') return `(!!(__scene ? __scene.gameObjects.find(function(g) { return g.actorType === 'characterPawn' && g.characterController; }) : null))`;
    return 'null';
  }
  if (node instanceof N.GetActorByNameNode) {
    const nS = inputSrc.get(`${nodeId}.name`);
    const nameVal = nS ? rv(nS.nid, nS.ok) : '""';
    if (outputKey === 'actor') return `(__scene ? __scene.gameObjects.find(function(g) { return g.name === ${nameVal}; }) || null : null)`;
    if (outputKey === 'valid') return `(!!(__scene ? __scene.gameObjects.find(function(g) { return g.name === ${nameVal}; }) : null))`;
    return 'null';
  }
  if (node instanceof N.GetAllActorsOfClassNode) {
    const cn = node as N.GetAllActorsOfClassNode;
    if (outputKey === 'count') return `(__scene ? __scene.gameObjects.filter(function(g) { return g.actorAssetId === ${JSON.stringify(cn.targetClassId)}; }).length : 0)`;
    return '0';
  }
  if (node instanceof N.GetActorNameNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    return `(${objVal} ? ${objVal}.name : '')`;
  }
  if (node instanceof N.GetActorVariableNode) {
    const tS = inputSrc.get(`${nodeId}.target`);
    const targetVal = tS ? rv(tS.nid, tS.ok) : 'null';
    const vn = (node as N.GetActorVariableNode).varName;
    return `(${targetVal} && ${targetVal}._scriptVars ? ${targetVal}._scriptVars[${JSON.stringify(vn)}] : 0)`;
  }
  // â”€â”€ Game Instance nodes â”€â”€
  if (node instanceof N.GetGameInstanceNode) {
    return `(__gameInstance || null)`;
  }
  if (node instanceof N.GetGameInstanceVariableNode) {
    const ctrl = node.controls['varName'] as N.GameInstanceVarNameControl;
    const varName = JSON.stringify(ctrl?.value ?? '');
    return `(__gameInstance ? __gameInstance.getVariable(${varName}) : undefined)`;
  }
  if (node instanceof N.SetGameInstanceVariableNode) {
    const ctrl = node.controls['varName'] as N.GameInstanceVarNameControl;
    const varName = JSON.stringify(ctrl?.value ?? '');
    return `(__gameInstance ? __gameInstance.getVariable(${varName}) : undefined)`;
  }
  if (node instanceof N.GetOwnerNode) {
    return '(typeof __widgetOwner !== "undefined" && __widgetOwner ? __widgetOwner : (typeof gameObject !== "undefined" ? (gameObject.owner || gameObject) : null))';
  }
  if (node instanceof N.GetAnimInstanceNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    if (outputKey === 'animInstance') return `(${objVal} && ${objVal}._animationInstances ? ${objVal}._animationInstances[0] || null : null)`;
    if (outputKey === 'valid') return `(!!(${objVal} && ${objVal}._animationInstances && ${objVal}._animationInstances[0]))`;
    return 'null';
  }
  // â”€â”€ AnimBP-specific nodes â”€â”€
  if (node instanceof N.TryGetPawnOwnerNode) {
    if (outputKey === 'pawn') return 'gameObject';
    if (outputKey === 'valid') return '(!!gameObject)';
    return 'null';
  }
  if (node instanceof N.GetAnimVarNode) {
    const an = node as N.GetAnimVarNode;
    const defaultVal = an.varType === 'number' ? '0' : an.varType === 'boolean' ? 'false' : '""';
    return `(__animInstance ? __animInstance.variables.get(${JSON.stringify(an.varName)}) : (gameObject && gameObject._animationInstances && gameObject._animationInstances[0] ? gameObject._animationInstances[0].variables.get(${JSON.stringify(an.varName)}) : ${defaultVal}))`;
  }
  if (node instanceof N.AnimUpdateEventNode) {
    if (outputKey === 'dt') return 'deltaTime';
    return 'null';
  }
  // Create Widget node â€” the 'widget' output resolves to the temp variable set in genAction
  if (node instanceof N.CreateWidgetNode) {
    if (outputKey === 'widget') {
      return `__wh_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    return '""';
  }
  // Spawn Actor from Class â€” returnValue is a temp variable set in genAction
  if (node instanceof N.SpawnActorFromClassNode) {
    if (outputKey === 'returnValue') {
      return `__sa_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    return 'null';
  }
  // Play Sound 2D / Play Sound at Location â€” sourceId is set (async, reads -1 initially)
  if (node instanceof N.PlaySound2DNode || node instanceof N.PlaySoundAtLocationNode) {
    if (outputKey === 'sourceId') {
      return `__audioSrc_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    return '-1';
  }
  // Save/Load exec nodes â€” temp vars set in genAction (UE-style)
  if (node instanceof N.CreateSaveGameObjectNode) {
    if (outputKey === 'saveObject') return `__sgo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'null';
  }
  if (node instanceof N.SaveGameToSlotNode) {
    if (outputKey === 'success') return `__sts_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof N.LoadGameFromSlotNode) {
    if (outputKey === 'saveObject') return `__lgo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (outputKey === 'success') return `__lgOk_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'null';
  }
  if (node instanceof N.DeleteGameInSlotNode) {
    if (outputKey === 'success') return `__dgs_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return 'false';
  }
  if (node instanceof N.PureCastNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    const cn = node as N.PureCastNode;
    if (outputKey === 'castedObject') return `(${objVal} && (${objVal}.actorAssetId === ${JSON.stringify(cn.targetClassId)} || ${objVal}.blueprintId === ${JSON.stringify(cn.targetClassId)}) ? ${objVal} : null)`;
    if (outputKey === 'success') return `(!!(${objVal} && (${objVal}.actorAssetId === ${JSON.stringify(cn.targetClassId)} || ${objVal}.blueprintId === ${JSON.stringify(cn.targetClassId)})))`;
    return 'null';
  }
  if (node instanceof N.CastToNode) {
    // The castedObject output from a CastToNode â€” resolved via a temp variable set in genAction
    if (outputKey === 'castedObject') {
      const castVar = `__cast_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      return castVar;
    }
    return 'null';
  }
  if (node instanceof N.IsValidNode) {
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
      const ctrl = node.controls['value'] as N.BoolSelectControl;
      return (ctrl?.value ?? 0) ? 'true' : 'false';
    }
    case 'String Literal': {
      const ctrl = node.controls['value'] as ClassicPreset.InputControl<'text'>;
      return JSON.stringify(String(ctrl?.value ?? ''));
    }
    case 'Color Literal': {
      const ctrl = node.controls['value'] as N.ColorPickerControl;
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
    case 'Normalize (Vector)':
    case 'Normalize': {
      // NormalizeVec3Node has 3 scalar inputs: x, y, z
      const xS = inputSrc.get(`${nodeId}.x`);
      const yS = inputSrc.get(`${nodeId}.y`);
      const zS = inputSrc.get(`${nodeId}.z`);
      const x = xS ? rv(xS.nid, xS.ok) : '0';
      const y = yS ? rv(yS.nid, yS.ok) : '0';
      const z = zS ? rv(zS.nid, zS.ok) : '0';
      // Return the component requested or a normalized vector
      if (outputKey === 'nx' || outputKey === 'ny' || outputKey === 'nz') {
        return `(function(){ var _len = Math.sqrt((${x})*(${x})+(${y})*(${y})+(${z})*(${z})) || 1; return ${outputKey === 'nx' ? `(${x})/_len` : outputKey === 'ny' ? `(${y})/_len` : `(${z})/_len`}; })()`;
      }
      return `(function(){ var _len = Math.sqrt((${x})*(${x})+(${y})*(${y})+(${z})*(${z})) || 1; return (${x})/_len; })()`;
    }
    case 'Distance': {
      // DistanceNode has 6 scalar inputs: ax, ay, az, bx, by, bz
      const axS = inputSrc.get(`${nodeId}.ax`);
      const ayS = inputSrc.get(`${nodeId}.ay`);
      const azS = inputSrc.get(`${nodeId}.az`);
      const bxS = inputSrc.get(`${nodeId}.bx`);
      const byS = inputSrc.get(`${nodeId}.by`);
      const bzS = inputSrc.get(`${nodeId}.bz`);
      const ax = axS ? rv(axS.nid, axS.ok) : '0';
      const ay = ayS ? rv(ayS.nid, ayS.ok) : '0';
      const az = azS ? rv(azS.nid, azS.ok) : '0';
      const bx = bxS ? rv(bxS.nid, bxS.ok) : '0';
      const by = byS ? rv(byS.nid, byS.ok) : '0';
      const bz = bzS ? rv(bzS.nid, bzS.ok) : '0';
      return `Math.sqrt((${bx}-(${ax}))*(${bx}-(${ax}))+(${by}-(${ay}))*(${by}-(${ay}))+(${bz}-(${az}))*(${bz}-(${az})))`;
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

    // â”€â”€ Physics getters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Type conversions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Widget / UI getters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    case 'Get Widget Text': {
      const n = node as N.GetWidgetTextNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.getText(__widgetHandle, ${wName}) : '')`;
    }
    case 'Get Progress Bar Percent': {
      const n = node as N.GetProgressBarPercentNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.getProgressBarPercent(__widgetHandle, ${wName}) : 0)`;
    }
    case 'Get Slider Value': {
      const n = node as N.GetSliderValueNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.getSliderValue(__widgetHandle, ${wName}) : 0)`;
    }
    case 'Get CheckBox State': {
      const n = node as N.GetCheckBoxStateNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.getCheckBoxState(__widgetHandle, ${wName}) : false)`;
    }
    case 'Is Widget Visible': {
      const n = node as N.IsWidgetVisibleNode;
      const wName = JSON.stringify(n.widgetSelector.value || '');
      return `(__uiManager ? __uiManager.isVisible(__widgetHandle, ${wName}) : false)`;
    }
    case 'Create Widget': {
      // Return the variable name that genAction creates, not an inline call
      // This prevents createWidget from being called multiple times
      return `__wh_${nodeId.replace(/[^a-zA-Z0-9]/g,'_')}`;
    }
    case 'Get Widget Variable': {
      const n = node as N.GetWidgetVariableNode;
      const wS = inputSrc.get(`${nodeId}.widget`);
      const widgetHandle = wS ? resolveValue(wS.nid, wS.ok, nodeMap, inputSrc, bp) : '""';
      const varName = JSON.stringify(n.getVariableName());
      return `(__uiManager ? __uiManager.getWidgetVariable(${widgetHandle}, ${varName}) : undefined)`;
    }

    // â”€â”€ 2D Physics getters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    case 'Get Velocity 2D': {
      if (outputKey === 'x') return '(gameObject.getComponent && gameObject.getComponent("RigidBody2D") ? gameObject.getComponent("RigidBody2D").rigidBody.linvel().x : 0)';
      if (outputKey === 'y') return '(gameObject.getComponent && gameObject.getComponent("RigidBody2D") ? gameObject.getComponent("RigidBody2D").rigidBody.linvel().y : 0)';
      if (outputKey === 'speed') return '(function(){ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (!_rb) return 0; var _v = _rb.rigidBody.linvel(); return Math.sqrt(_v.x*_v.x + _v.y*_v.y); }())';
      return '0';
    }
    case 'Get Body Type 2D': {
      return '(function(){ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); if (!_rb) return "static"; if (_rb.rigidBody.isDynamic()) return "dynamic"; if (_rb.rigidBody.isKinematic()) return "kinematic"; return "static"; }())';
    }

    // â”€â”€ 2D Character getters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 2D Camera getters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 2D Sprite / Animation getters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 2D Tilemap getters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Audio (pure) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    case 'Is Sound Playing': {
      const idS = inputSrc.get(`${nodeId}.sourceId`);
      const sid = idS ? rv(idS.nid, idS.ok) : '-1';
      return `(__engine && __engine.audio ? __engine.audio.isPlaying(${sid}) : false)`;
    }

    // â”€â”€ Gamepad (pure) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Line Trace by Channel (3D) â€” output resolution â”€â”€
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
    // â”€â”€ Sphere Trace by Channel (3D) â€” output resolution â”€â”€
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
    // â”€â”€ Box Trace (3D) â€” output resolution â”€â”€
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
    // â”€â”€ Line Trace 2D â€” output resolution â”€â”€
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

    // â”€â”€ Save/Load (pure â€” UE-style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Drag Selection value nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  } finally { _resolveCycleStack.delete(_rvKey); }
}

function walkExec(
  nodeId: string, execOut: string,
  nodeMap: NodeMap, inputSrc: SrcMap, outputDst: DstMap,
  bp: import('../BlueprintData').BlueprintData,
): string[] {
  const lines: string[] = [];
  const targets = outputDst.get(`${nodeId}.${execOut}`) || [];
  for (const t of targets) lines.push(...genAction(t.nid, nodeMap, inputSrc, outputDst, bp, t.ik));
  return lines;
}

function genAction(
  nodeId: string,
  nodeMap: NodeMap, inputSrc: SrcMap, outputDst: DstMap,
  bp: import('../BlueprintData').BlueprintData,
  triggerInput: string = 'exec',
): string[] {
  const node = nodeMap.get(nodeId);
  if (!node) return [];
  // Skip disabled nodes â€” just pass through to exec outputs
  if ((node as any).__disabled) {
    return walkExec(nodeId, 'exec', nodeMap, inputSrc, outputDst, bp);
  }

  // Cycle detection — prevent infinite recursion on circular exec wires
  if (_execCycleStack.has(nodeId)) {
    console.warn(`[CodeGen] Exec cycle detected at node ${nodeId} ("${node.label}"), skipping`);
    return [`/* exec cycle: ${nodeId} */`];
  }
  _execCycleStack.add(nodeId);
  try {

  const lines: string[] = [];

  // â”€â”€ Profiler: emit a tracking call for every action node so the profiler
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
    lines.push(`{ if(__projectManager && ${n}) { if(__projectManager.loadSceneRuntime) __projectManager.loadSceneRuntime(${n}); else __projectManager.openScene(${n}); } else if(__engine && __engine.sceneManager) { __engine.sceneManager.loadScene(${n}); } }`);
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
    lines.push(`if (${condition}) { __engine.anim2d.transitionState(gameObject, ${fromState}, ${toState}); }`);
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
  if (node instanceof N.SetComponentLocationNode) {
    const ci = (node as N.SetComponentLocationNode).compIndex;
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
  if (node instanceof N.SetComponentRotationNode) {
    const ci = (node as N.SetComponentRotationNode).compIndex;
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
  if (node instanceof N.SetComponentScaleNode) {
    const ci = (node as N.SetComponentScaleNode).compIndex;
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
  if (node instanceof N.SetComponentVisibilityNode) {
    const ci = (node as N.SetComponentVisibilityNode).compIndex;
    const ref = ci === -1
      ? '(gameObject.group || gameObject.mesh)'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const vS = inputSrc.get(`${nodeId}.visible`);
    lines.push(`{ var __svRef=${ref}; if(__svRef) __svRef.visible = ${vS ? `!!(${rv(vS.nid, vS.ok)})` : 'true'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Set Static Mesh â€” swap the mesh asset on a component at runtime
  if (node instanceof N.SetStaticMeshNode) {
    const ci = (node as N.SetStaticMeshNode).compIndex;
    const ref = ci === -1
      ? 'gameObject.mesh'
      : `((gameObject._meshComponents || [])[${ci}] || {}).mesh`;
    const mS = inputSrc.get(`${nodeId}.meshAssetId`);
    const meshIdExpr = mS ? rv(mS.nid, mS.ok) : '""';
    lines.push(`{ const _ref = ${ref}; if (_ref) { const _mgr = __meshAssetManager; const _ma = _mgr && _mgr.getAsset(${meshIdExpr}); if (_ma) { while (_ref.children.length) _ref.remove(_ref.children[0]); __loadMeshFromAsset(_ma).then(({ scene: _ls }) => { while (_ls.children.length) { const _c = _ls.children[0]; _ls.remove(_c); _ref.add(_c); } _ref.updateMatrixWorld(true); }); } } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Set Material â€” change material on a mesh component slot at runtime
  if (node instanceof N.SetMeshMaterialNode) {
    const ci = (node as N.SetMeshMaterialNode).compIndex;
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

  // Trigger component setter nodes
  if (node instanceof N.SetTriggerEnabledNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _tc = (gameObject._triggerComponents || [])[${(node as N.SetTriggerEnabledNode).compIndex}]; if (_tc) _tc.config.enabled = ${eS ? rv(eS.nid, eS.ok) : 'true'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetTriggerSizeNode) {
    const ci = (node as N.SetTriggerSizeNode).compIndex;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _tc = (gameObject._triggerComponents || [])[${ci}]; if (_tc) { const d = _tc.config.dimensions; if (d.width !== undefined) { d.width = ${xS ? rv(xS.nid, xS.ok) : '1'}; d.height = ${yS ? rv(yS.nid, yS.ok) : '1'}; d.depth = ${zS ? rv(zS.nid, zS.ok) : '1'}; } else if (d.radius !== undefined) { d.radius = ${xS ? rv(xS.nid, xS.ok) : '1'}; } __physics.collision.resizeSensor(__physics, gameObject.id, ${ci}, _tc.config); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetCollisionEnabledNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _tcs = gameObject._triggerComponents || []; for (const _tc of _tcs) _tc.config.enabled = ${eS ? rv(eS.nid, eS.ok) : 'true'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Light component setter nodes
  if (node instanceof N.SetLightEnabledNode) {
    const ci = (node as N.SetLightEnabledNode).compIndex;
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.visible = !!(${eS ? rv(eS.nid, eS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetLightColorNode) {
    const ci = (node as N.SetLightColorNode).compIndex;
    const cS = inputSrc.get(`${nodeId}.color`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.color.set(${cS ? rv(cS.nid, cS.ok) : "'#ffffff'"}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetLightIntensityNode) {
    const ci = (node as N.SetLightIntensityNode).compIndex;
    const iS = inputSrc.get(`${nodeId}.intensity`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.intensity = ${iS ? rv(iS.nid, iS.ok) : '1'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetLightDistanceNode) {
    const ci = (node as N.SetLightDistanceNode).compIndex;
    const dS = inputSrc.get(`${nodeId}.distance`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc && _lc.light.distance !== undefined) _lc.light.distance = ${dS ? rv(dS.nid, dS.ok) : '0'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetLightPositionNode) {
    const ci = (node as N.SetLightPositionNode).compIndex;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.position.set(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetLightTargetNode) {
    const ci = (node as N.SetLightTargetNode).compIndex;
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc && _lc.light.target) _lc.light.target.position.set(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '-1'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetCastShadowNode) {
    const ci = (node as N.SetCastShadowNode).compIndex;
    const cS = inputSrc.get(`${nodeId}.castShadow`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc) _lc.light.castShadow = !!(${cS ? rv(cS.nid, cS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetSpotAngleNode) {
    const ci = (node as N.SetSpotAngleNode).compIndex;
    const aS = inputSrc.get(`${nodeId}.angle`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc && _lc.light.angle !== undefined) _lc.light.angle = (${aS ? rv(aS.nid, aS.ok) : '45'}) * Math.PI / 180; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetSpotPenumbraNode) {
    const ci = (node as N.SetSpotPenumbraNode).compIndex;
    const pS = inputSrc.get(`${nodeId}.penumbra`);
    lines.push(`{ const _lc = (gameObject._lightComponents || [])[${ci}]; if (_lc && _lc.light.penumbra !== undefined) _lc.light.penumbra = ${pS ? rv(pS.nid, pS.ok) : '0'}; }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Character Movement action nodes
  if (node instanceof N.AddMovementInputNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    const sS = inputSrc.get(`${nodeId}.scale`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) { const _d = ({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}); _cc.addMovementInput(_d, ${sS ? rv(sS.nid, sS.ok) : '1'}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.JumpNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.jump(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.StopJumpingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.stopJumping(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.CrouchNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.crouch(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.UncrouchNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.uncrouch(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.StartFlyingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.startFlying(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.StopFlyingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.stopFlying(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.StartSwimmingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.startSwimming(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.StopSwimmingNode) {
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.stopSwimming(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetMovementModeNode) {
    const ctrl = node.controls['mode'] as N.MovementModeSelectControl;
    const mode = ctrl?.value ?? 'walking';
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setMovementMode('${mode}'); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetMaxWalkSpeedNode) {
    const sS = inputSrc.get(`${nodeId}.speed`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setMaxWalkSpeed(${sS ? rv(sS.nid, sS.ok) : '6'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.LaunchCharacterNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    const oxyS = inputSrc.get(`${nodeId}.overrideXY`);
    const ozS = inputSrc.get(`${nodeId}.overrideZ`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.launchCharacter({x:${xS ? rv(xS.nid, xS.ok) : '0'}, y:${yS ? rv(yS.nid, yS.ok) : '0'}, z:${zS ? rv(zS.nid, zS.ok) : '0'}}, ${oxyS ? rv(oxyS.nid, oxyS.ok) : 'true'}, ${ozS ? rv(ozS.nid, ozS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetCameraModeNode) {
    const mS = inputSrc.get(`${nodeId}.mode`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setCameraMode(${mS ? rv(mS.nid, mS.ok) : "'firstPerson'"}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetCameraFOVNode) {
    const fS = inputSrc.get(`${nodeId}.fov`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setFOV(${fS ? rv(fS.nid, fS.ok) : '75'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // Camera Control action nodes
  if (node instanceof N.AddControllerYawInputNode) {
    const vS = inputSrc.get(`${nodeId}.value`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.addControllerYawInput(${vS ? rv(vS.nid, vS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AddControllerPitchInputNode) {
    const vS = inputSrc.get(`${nodeId}.value`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.addControllerPitchInput(${vS ? rv(vS.nid, vS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetControllerRotationNode) {
    const yS = inputSrc.get(`${nodeId}.yaw`);
    const pS = inputSrc.get(`${nodeId}.pitch`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setControllerRotation(${yS ? rv(yS.nid, yS.ok) : '0'}, ${pS ? rv(pS.nid, pS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetMouseLockEnabledNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setMouseLockEnabled(${eS ? rv(eS.nid, eS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // Player Controller cursor control nodes
  if (node instanceof N.SetShowMouseCursorNode) {
    const showS = inputSrc.get(`${nodeId}.show`);
    lines.push(`{ const _pc = gameObject.scene.engine?.playerControllers.get(0); if (_pc) _pc.setShowMouseCursor(${showS ? rv(showS.nid, showS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetInputModeGameOnlyNode) {
    lines.push(`{ const _pc = gameObject.scene.engine?.playerControllers.get(0); if (_pc) _pc.setInputModeGameOnly(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetInputModeGameAndUINode) {
    lines.push(`{ const _pc = gameObject.scene.engine?.playerControllers.get(0); if (_pc) _pc.setInputModeGameAndUI(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetInputModeUIOnlyNode) {
    lines.push(`{ const _pc = gameObject.scene.engine?.playerControllers.get(0); if (_pc) _pc.setInputModeUIOnly(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // Player Controller pawn control nodes
  if (node instanceof N.PossessPawnNode) {
    const nS = inputSrc.get(`${nodeId}.pawnName`);
    lines.push(`{ /* Possess Pawn â€” handled at engine level */ }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.UnpossessPawnNode) {
    lines.push(`{ /* Unpossess Pawn â€” handled at engine level */ }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // AI Controller action nodes
  if (node instanceof N.AIMoveToNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.moveTo(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AIMoveToVectorNode) {
    const locS = inputSrc.get(`${nodeId}.location`);
    lines.push(`{ const _ai = gameObject.aiController; const _loc = ${locS ? rv(locS.nid, locS.ok) : '{x:0,y:0,z:0}'}; if (_ai && _loc) _ai.moveTo(_loc.x, _loc.y, _loc.z); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AIStopMovementNode) {
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.stopMovement(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AISetFocalPointNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.setFocalPoint(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AIClearFocalPointNode) {
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.clearFocalPoint(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AIStartPatrolNode) {
    const loopS = inputSrc.get(`${nodeId}.loop`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.startPatrol(_ai.patrolPoints.length ? _ai.patrolPoints : [], ${loopS ? rv(loopS.nid, loopS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AIStopPatrolNode) {
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.stopMovement(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AIStartFollowingNode) {
    const tS = inputSrc.get(`${nodeId}.targetName`);
    const dS = inputSrc.get(`${nodeId}.distance`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) { const _tn = ${tS ? rv(tS.nid, tS.ok) : "''"}; const _tgo = __scene && __scene.gameObjects.find(g => g.name === _tn); if (_tgo) _ai.startFollowing(_tgo, ${dS ? rv(dS.nid, dS.ok) : '3'}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.AIStopFollowingNode) {
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.stopMovement(); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // â”€â”€ AI Task / BT exec action nodes â”€â”€
  if (node instanceof N.FinishExecuteNode) {
    const sS = inputSrc.get(`${nodeId}.success`);
    lines.push(`{ return ${sS ? rv(sS.nid, sS.ok) : 'true'} ? 'Success' : 'Failure'; }`);
    return lines;
  }
  if (node instanceof N.ReturnNode) {
    const cS = inputSrc.get(`${nodeId}.canExecute`);
    lines.push(`{ return ${cS ? rv(cS.nid, cS.ok) : 'true'} ? 'Success' : 'Failure'; }`);
    return lines;
  }
  if (node instanceof N.MoveToLocationNode) {
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
  if (node instanceof N.SetBlackboardValueNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const vS = inputSrc.get(`${nodeId}.value`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? rv(kS.nid, kS.ok) : JSON.stringify(String(keyCtrl));
    const val = vS ? rv(vS.nid, vS.ok) : 'null';
    lines.push(`{ const _ai = gameObject.aiController; console.log('[BB Set]', 'key=', ${key}, 'val=', ${val}, 'aiCtrl=', !!_ai); if (_ai) _ai.setBlackboardValue(${key}, ${val}); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof N.SetBlackboardValueAsBoolNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const vS = inputSrc.get(`${nodeId}.val`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? rv(kS.nid, kS.ok) : JSON.stringify(String(keyCtrl));
    const val = vS ? rv(vS.nid, vS.ok) : 'false';
    lines.push(`{ const _ai = gameObject.aiController; console.log('[BB SetBool]', 'key=', ${key}, 'val=', ${val}, 'aiCtrl=', !!_ai); if (_ai) _ai.setBlackboardValue(${key}, Boolean(${val} || false)); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof N.SetBlackboardValueAsFloatNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const vS = inputSrc.get(`${nodeId}.val`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? rv(kS.nid, kS.ok) : JSON.stringify(String(keyCtrl));
    const val = vS ? rv(vS.nid, vS.ok) : '0';
    lines.push(`{ const _ai = gameObject.aiController; console.log('[BB SetFloat]', 'key=', ${key}, 'val=', ${val}, 'aiCtrl=', !!_ai); if (_ai) _ai.setBlackboardValue(${key}, parseFloat(${val} || 0)); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof N.SetBlackboardValueAsVectorNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const vS = inputSrc.get(`${nodeId}.val`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? rv(kS.nid, kS.ok) : JSON.stringify(String(keyCtrl));
    const val = vS ? rv(vS.nid, vS.ok) : '{x:0, y:0, z:0}';
    lines.push(`{ const _ai = gameObject.aiController; console.log('[BB SetVec]', 'key=', ${key}, 'val=', ${val}, 'aiCtrl=', !!_ai); if (_ai) _ai.setBlackboardValue(${key}, ${val}); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof N.ClearBlackboardValueNode) {
    const kS = inputSrc.get(`${nodeId}.key`);
    const keyCtrl = (node.inputs['key']?.control as any)?.value ?? '';
    const key = kS ? rv(kS.nid, kS.ok) : JSON.stringify(String(keyCtrl));
    lines.push(`{ const _ai = gameObject.aiController; if (_ai) _ai.clearBlackboardValue(${key}); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof N.RunBehaviorTreeNode) {
    const btCtrl = node.controls['btSelect'] as any;
    const btId = btCtrl?.value || '';
    const v = `__rbt_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const ctrlVar = `__rbt_ctrl_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const pawnVar = `__rbt_pawn_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`var ${ctrlVar} = null;`);
    lines.push(`var ${pawnVar} = null;`);
    lines.push(`{ const _ai = gameObject.aiController; if (_ai && __engine && __engine.behaviorTreeManager) { const _btAsset = __engine.behaviorTreeManager.get('${btId}'); if (_btAsset) { const _bt = __engine.behaviorTreeManager.instantiate(_btAsset); if (_btAsset.blackboardId && __engine.aiAssetManager) { const _bbAsset = __engine.aiAssetManager.getBlackboard(_btAsset.blackboardId); if (_bbAsset && _bbAsset.keys && typeof _ai.initBlackboardDefaults === 'function') { _ai.initBlackboardDefaults(_bbAsset.keys); } } _ai.runBehaviorTree(_bt); ${v} = true; ${ctrlVar} = _ai; ${pawnVar} = gameObject; } } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof N.RotateToFaceNode) {
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
  // â”€â”€ NavMesh exec action nodes â”€â”€
  if (node instanceof N.NavMeshBuildNode) {
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
  if (node instanceof N.NavMeshFindPathNode) {
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
    if (node instanceof N.NavMeshRandomPointNode) {
    const cS = inputSrc.get(`${nodeId}.center`);
    const rS = inputSrc.get(`${nodeId}.radius`);
    const center = cS ? rv(cS.nid, cS.ok) : '{x:0,y:0,z:0}';
    const radius = rS ? rv(rS.nid, rS.ok) : '500';
    const v = `__nmrp_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v}_pt = {x:0,y:0,z:0}; var ${v}_ok = false;`);
    lines.push(`{ if (__engine && __engine.navMeshSystem && __engine.navMeshSystem.isReady) { var _nmrp = __engine.navMeshSystem.findRandomPoint(${center}, ${radius}); if (_nmrp) { ${v}_pt = _nmrp.point; ${v}_ok = true; } else { console.warn('[NavMesh] findRandomPoint returned null - navmesh not ready or radius too small'); } } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
if (node instanceof N.NavMeshAddAgentNode) {
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
  if (node instanceof N.NavMeshRemoveAgentNode) {
    const idS = inputSrc.get(`${nodeId}.agentId`);
    const agentId = idS ? rv(idS.nid, idS.ok) : "''";
    lines.push(`{ if (__engine && __engine.navMeshSystem) __engine.navMeshSystem.removeAgent(${agentId}); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof N.NavMeshAgentMoveToNode) {
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
  if (node instanceof N.NavMeshAddBoxObstacleNode) {
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
  if (node instanceof N.NavMeshAddCylinderObstacleNode) {
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
  if (node instanceof N.NavMeshRemoveObstacleNode) {
    const idS = inputSrc.get(`${nodeId}.id`);
    const obsId = idS ? rv(idS.nid, idS.ok) : "''";
    const v = `__nmro_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${v} = false;`);
    lines.push(`{ if (__engine && __engine.navMeshSystem) { ${v} = __engine.navMeshSystem.removeObstacle(${obsId}); } }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  if (node instanceof N.NavMeshToggleDebugNode) {
    lines.push(`{ if (__engine && __engine.navMeshSystem) __engine.navMeshSystem.toggleDebug(__engine.scene.threeScene); }`);
    lines.push(...we(nodeId, 'execOut'));
    return lines;
  }
  // Camera & Spring Arm action nodes
  if (node instanceof N.SetSpringArmLengthNode) {
    const lS = inputSrc.get(`${nodeId}.length`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmLength(${lS ? rv(lS.nid, lS.ok) : '4'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetSpringArmTargetOffsetNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmTargetOffset(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0.9'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetSpringArmSocketOffsetNode) {
    const xS = inputSrc.get(`${nodeId}.x`);
    const yS = inputSrc.get(`${nodeId}.y`);
    const zS = inputSrc.get(`${nodeId}.z`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmSocketOffset(${xS ? rv(xS.nid, xS.ok) : '0'}, ${yS ? rv(yS.nid, yS.ok) : '0'}, ${zS ? rv(zS.nid, zS.ok) : '0'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetSpringArmCollisionNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmCollision(${eS ? rv(eS.nid, eS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetCameraCollisionEnabledNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setSpringArmCollision(${eS ? rv(eS.nid, eS.ok) : 'true'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetCameraLagNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    const sS = inputSrc.get(`${nodeId}.speed`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setCameraLag(${eS ? rv(eS.nid, eS.ok) : 'false'}, ${sS ? rv(sS.nid, sS.ok) : '10'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  if (node instanceof N.SetCameraRotationLagNode) {
    const eS = inputSrc.get(`${nodeId}.enabled`);
    const sS = inputSrc.get(`${nodeId}.speed`);
    lines.push(`{ const _cc = gameObject.characterController; if (_cc) _cc.setCameraRotationLag(${eS ? rv(eS.nid, eS.ok) : 'false'}, ${sS ? rv(sS.nid, sS.ok) : '10'}); }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Variable Set
  if (node instanceof N.SetVariableNode) {
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
  if (node instanceof N.FunctionCallNode) {
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
  if (node instanceof N.CallActorFunctionNode) {
    const tS = inputSrc.get(`${nodeId}.target`);
    const targetVal = tS ? rv(tS.nid, tS.ok) : 'null';
    const cafn = node as N.CallActorFunctionNode;
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
  if (node instanceof N.FunctionReturnNode) {
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

  // Macro Call â€” inline placeholder
  if (node instanceof N.MacroCallNode) {
    lines.push(`/* macro: ${node.macroName} */`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // Custom Event Call
  if (node instanceof N.CallCustomEventNode) {
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
    } else if ((node as N.CallCustomEventNode).targetActorId) {
      lines.push(`{ var _t = __scene ? __scene.findById(${JSON.stringify((node as N.CallCustomEventNode).targetActorId)}) : null;`);
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

  // â”€â”€ Casting action nodes â”€â”€
  if (node instanceof N.CastToNode) {
    const oS = inputSrc.get(`${nodeId}.object`);
    const objVal = oS ? rv(oS.nid, oS.ok) : 'null';
    const cn = node as N.CastToNode;
    const castVar = `__cast_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`var ${castVar} = null;`);
    lines.push(`if (${objVal} && (${objVal}.actorAssetId === ${JSON.stringify(cn.targetClassId)} || ${objVal}.blueprintId === ${JSON.stringify(cn.targetClassId)})) {`);
    lines.push(`  ${castVar} = ${objVal};`);
    lines.push(...we(nodeId, 'success').map(l => '  ' + l));
    const failBody = we(nodeId, 'fail');
    if (failBody.length) { lines.push('} else {'); lines.push(...failBody.map(l => '  ' + l)); }
    lines.push('}');
    return lines;
  }
  if (node instanceof N.IsValidNode) {
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
  if (node instanceof N.SetActorVariableNode) {
    const tS = inputSrc.get(`${nodeId}.target`);
    const vS = inputSrc.get(`${nodeId}.value`);
    const targetVal = tS ? rv(tS.nid, tS.ok) : 'null';
    const valCode = vS ? rv(vS.nid, vS.ok) : '0';
    const vn = (node as N.SetActorVariableNode).varName;
    lines.push(`{ var _tgt = ${targetVal}; if (_tgt) { if (!_tgt._scriptVars) _tgt._scriptVars = {}; _tgt._scriptVars[${JSON.stringify(vn)}] = ${valCode}; } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }
  // â”€â”€ SetAnimVarNode â€” sets an animation variable on the anim instance â”€â”€
  if (node instanceof N.SetAnimVarNode) {
    const vS = inputSrc.get(`${nodeId}.value`);
    const an = node as N.SetAnimVarNode;
    const defaultVal = an.varType === 'number' ? '0' : an.varType === 'boolean' ? 'false' : '""';
    const valCode = vS ? rv(vS.nid, vS.ok) : defaultVal;
    lines.push(`{ var _ai = __animInstance || (gameObject && gameObject._animationInstances && gameObject._animationInstances[0]); if (_ai) { _ai.variables.set(${JSON.stringify(an.varName)}, ${valCode}); } }`);
    lines.push(...we(nodeId, 'exec'));
    return lines;
  }

  // â”€â”€ EmitEventNode â€” emit a global event via the EventBus â”€â”€
  if (node instanceof N.EmitEventNode) {
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
    case 'Add Tag to Actor': {
      const tS = inputSrc.get(`${nodeId}.tag`);
      lines.push(`{ const t = ${tS ? rv(tS.nid, tS.ok) : '""'}; if (t && !(gameObject.userData.tags || []).includes(t)) { gameObject.userData.tags = gameObject.userData.tags || []; gameObject.userData.tags.push(t); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Remove Tag from Actor': {
      const tS = inputSrc.get(`${nodeId}.tag`);
      lines.push(`{ const t = ${tS ? rv(tS.nid, tS.ok) : '""'}; if (t && gameObject.userData.tags) { gameObject.userData.tags = gameObject.userData.tags.filter(x => x !== t); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Actor Hidden in Game': {
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
      const san = node as N.SpawnActorFromClassNode;
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

    // â”€â”€ Physics (extended) setters / actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    case 'Set Physics Constraints': {
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
      // Dynamically handle all 'then<N>' outputs instead of hardcoding 2
      const outputKeys = Object.keys(node.outputs).filter(k => k.startsWith('then')).sort();
      for (const ok of outputKeys) {
        lines.push(...we(nodeId, ok));
      }
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
      lines.push(`{ if(!gameObject.__pendingDelays) gameObject.__pendingDelays = [];`);
      lines.push(`var __delayId = setTimeout(function() {`);
      lines.push(...completedLines.map(l => '  ' + l));
      lines.push(`}, (${duration}) * 1000);`);
      lines.push(`gameObject.__pendingDelays.push(__delayId); }`);
      break;
    }

    // â”€â”€ Stateful flow control nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Widget / UI action nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    case 'Create Widget': {
      const wn = node as N.CreateWidgetNode;
      const bpId = JSON.stringify(wn.widgetBPId || '');
      const ownerSrc = inputSrc.get(`${nodeId}.owner`);
      const ownerVal = ownerSrc ? rv(ownerSrc.nid, ownerSrc.ok) : '(typeof gameObject !== "undefined" ? gameObject : null)';
      lines.push(`var __wh_${nodeId.replace(/[^a-zA-Z0-9]/g,'_')} = __uiManager ? __uiManager.createWidget(${bpId}, null, ${ownerVal}) : '';`);
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
      const n = node as N.SetWidgetTextNode;
      const tS = inputSrc.get(`${nodeId}.text`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const text = tS ? rv(tS.nid, tS.ok) : '""';
      lines.push(`if (__uiManager) __uiManager.setText(__widgetHandle, ${wName}, ${text});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Widget Visibility': {
      const n = node as N.SetWidgetVisibilityNode;
      const vS = inputSrc.get(`${nodeId}.visible`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const vis = vS ? rv(vS.nid, vS.ok) : 'true';
      lines.push(`if (__uiManager) __uiManager.setVisibility(__widgetHandle, ${wName}, ${vis});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Widget Color': {
      const n = node as N.SetWidgetColorNode;
      const cS = inputSrc.get(`${nodeId}.color`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const color = cS ? rv(cS.nid, cS.ok) : '"#ffffff"';
      lines.push(`if (__uiManager) __uiManager.setColor(__widgetHandle, ${wName}, ${color});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Widget Opacity': {
      const n = node as N.SetWidgetOpacityNode;
      const oS = inputSrc.get(`${nodeId}.opacity`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const opacity = oS ? rv(oS.nid, oS.ok) : '1';
      lines.push(`if (__uiManager) __uiManager.setOpacity(__widgetHandle, ${wName}, ${opacity});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Progress Bar Percent': {
      const n = node as N.SetProgressBarPercentNode;
      const pS = inputSrc.get(`${nodeId}.percent`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const pct = pS ? rv(pS.nid, pS.ok) : '0';
      lines.push(`if (__uiManager) __uiManager.setProgressBarPercent(__widgetHandle, ${wName}, ${pct});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Slider Value': {
      const n = node as N.SetSliderValueNode;
      const vS = inputSrc.get(`${nodeId}.value`);
      const wName = JSON.stringify(n.widgetSelector.value || '');
      const val = vS ? rv(vS.nid, vS.ok) : '0';
      lines.push(`if (__uiManager) __uiManager.setSliderValue(__widgetHandle, ${wName}, ${val});`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set CheckBox State': {
      const n = node as N.SetCheckBoxStateNode;
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

    // ── Texture mutation nodes ──────────────────────────────────────
    case 'Set Image Texture': {
      const n = node as N.SetImageTextureNode;
      const wName = JSON.stringify(n.getWidgetName?.() || '');
      const texId = JSON.stringify(n.getTextureId?.() || '');
      const btS = inputSrc.get(`${nodeId}.blendTime`);
      const blendTime = btS ? rv(btS.nid, btS.ok) : '0';
      lines.push(`if (__uiManager && __uiManager.setImageTexture) __uiManager.setImageTexture(__widgetHandle, ${wName}, ${texId}, ${blendTime});`);
      lines.push(`else if (__uiManager) { var __texData = __textureMeta[${texId}]; if (__texData && __texData.storedData) { var __el = __uiManager._findByName ? __uiManager._findByName(__widgetHandle, ${wName}) : null; if (__el) { var __img = __el.querySelector('img') || __el; if (__img.src !== undefined) __img.src = __texData.storedData; } } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Set Button Texture': {
      const n = node as N.SetButtonTextureNode;
      const wName = JSON.stringify(n.getWidgetName?.() || '');
      const texId = JSON.stringify(n.getTextureId?.() || '');
      const stS = inputSrc.get(`${nodeId}.state`);
      const state = stS ? rv(stS.nid, stS.ok) : '"normal"';
      lines.push(`if (__uiManager && __uiManager.setButtonTexture) __uiManager.setButtonTexture(__widgetHandle, ${wName}, ${texId}, ${state});`);
      lines.push(`else if (__uiManager) { var __texData = __textureMeta[${texId}]; if (__texData && __texData.storedData) { var __el = __uiManager._findByName ? __uiManager._findByName(__widgetHandle, ${wName}) : null; if (__el) __el.style.backgroundImage = 'url(' + __texData.storedData + ')'; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Load Texture': {
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      const urlS = inputSrc.get(`${nodeId}.url`);
      const nameS = inputSrc.get(`${nodeId}.name`);
      const url = urlS ? rv(urlS.nid, urlS.ok) : '""';
      const assetName = nameS ? rv(nameS.nid, nameS.ok) : '""';
      // Generate a unique texture ID at runtime, store it in __textureMeta
      lines.push(`var __loadTex_id_${uid} = 'tex_rt_' + Math.random().toString(36).slice(2, 8);`);
      lines.push(`var __loadTex_ok_${uid} = false;`);
      lines.push(`try { var __ltUrl = ${url}; var __ltName = ${assetName} || __ltUrl;`);
      lines.push(`  __textureMeta[__loadTex_id_${uid}] = { name: __ltName, width: 0, height: 0, hasAlpha: false, format: '', storedData: __ltUrl };`);
      lines.push(`  __textureNameMap[__ltName.toLowerCase()] = __loadTex_id_${uid};`);
      lines.push(`  __loadTex_ok_${uid} = true;`);
      lines.push(`} catch(e) { console.warn('[LoadTexture] Failed:', e); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // â”€â”€ Widget Instance Interaction Nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    case 'Set Widget Variable': {
      const n = node as N.SetWidgetVariableNode;
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
      const n = node as N.CallWidgetFunctionNode;
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
      const n = node as N.CallWidgetEventNode;
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
      const ctrl = node.controls['scene'] as N.SceneSelectControl;
      const sceneName = JSON.stringify(ctrl?.value ?? '');
      lines.push(`if (__projectManager && ${sceneName}) { __projectManager.openScene(${sceneName}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Load Scene': {
      const ctrl = node.controls['scene'] as N.SceneSelectControl;
      const sceneName = JSON.stringify(ctrl?.value ?? '');
      lines.push(`if (__projectManager && ${sceneName}) { __projectManager.loadSceneRuntime(${sceneName}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Get Game Instance': {
      // Pure node â€” value resolved inline via rv()
      break;
    }
    case 'Get Game Instance Variable': {
      const ctrl = node.controls['varName'] as N.GameInstanceVarNameControl;
      const varName = JSON.stringify(ctrl?.value ?? '');
      // Pure node â€” value resolved inline via rv()
      break;
    }
    case 'Set Game Instance Variable': {
      const ctrl = node.controls['varName'] as N.GameInstanceVarNameControl;
      const varName = JSON.stringify(ctrl?.value ?? '');
      const valSrc = inputSrc.get(`${nodeId}.value`);
      const val = valSrc ? rv(valSrc.nid, valSrc.ok) : 'undefined';
      lines.push(`if (__gameInstance) { __gameInstance.setVariable(${varName}, ${val}); }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  2D PHYSICS ACTION NODES
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      lines.push(`/* Box Overlap 2D â€” placeholder: Rapier2D intersection test */`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }
    case 'Circle Overlap 2D': {
      const cxS = inputSrc.get(`${nodeId}.centerX`); const cyS = inputSrc.get(`${nodeId}.centerY`);
      const rS = inputSrc.get(`${nodeId}.radius`);
      lines.push(`/* Circle Overlap 2D â€” placeholder: Rapier2D intersection test */`);
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  2D CHARACTER MOVEMENT ACTION NODES
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  2D CAMERA ACTION NODES
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  2D SPRITE / ANIMATION ACTION NODES
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    // â”€â”€ 2D Anim Blueprint nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  2D TILEMAP ACTION NODES
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      lines.push(`{ /* Rebuild tilemap collision â€” handled by editor on scene save */ }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    // â”€â”€ Audio Nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    case 'Play Sound 2D': {
      const sS = inputSrc.get(`${nodeId}.sound`);
      const _scCtrl2D = node.controls['soundCue'] as N.SoundCueSelectControl | undefined;
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
      const _scCtrlLoc = node.controls['soundCue'] as N.SoundCueSelectControl | undefined;
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
      // Legacy node â€” map to the same code as Play Sound at Location
      const sS = inputSrc.get(`${nodeId}.sound`);
      const _scCtrlSpawn = node.controls['soundCue'] as N.SoundCueSelectControl | undefined;
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

    // â”€â”€ Gamepad Nodes (exec-based) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Save/Load Nodes (exec-based â€” UE-style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    case 'Create Save Game Object': {
      const varName = `__sgo_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const n = node as N.CreateSaveGameObjectNode;
      let defaultsStr = '{}';
      if (n.saveGameId && getSaveGameMgr()) {
        const asset = getSaveGameMgr().getAsset(n.saveGameId);
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

    // â”€â”€ Drag Selection action nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    case 'Enable Drag Selection': {
      const mbS = inputSrc.get(`${nodeId}.mouseButton`);
      const mbC = node.controls['mouseButton'] as ClassicPreset.InputControl<'number'> | undefined;
      const mb = mbS ? rv(mbS.nid, mbS.ok) : (mbC ? String(mbC.value ?? 0) : '0');
      lines.push(`{ if (!gameObject.__dragSelection) { var _DSC = __engine && __engine._DragSelectionComponent; if (_DSC) { gameObject.__dragSelection = new _DSC(); } else { console.warn('[DragSelection] DragSelectionComponent class not found on engine â€” drag selection will not work'); gameObject.__dragSelection = { enabled: true, mouseButton: 0, classFilter: [], selectionColor: 'rgba(0,120,215,0.25)', selectionBorderColor: 'rgba(0,120,215,0.8)', selectionBorderWidth: 1, selectionBorderStyle: 'solid', selectionBorderRadius: 0, selectionOpacity: 1, onSelectionComplete: null, _lastResult: null, isDragging: false, getSelectedCount: function(){ return this._lastResult ? this._lastResult.actors.length : 0; }, getSelectedActors: function(){ return this._lastResult ? this._lastResult.actors : []; }, getSelectedActorAt: function(i){ return this._lastResult ? (this._lastResult.actors[i] || null) : null; }, init: function(){}, destroy: function(){}, setClassFilter: function(c){ this.classFilter = Array.isArray(c) ? c : [c]; }, addClassFilter: function(c){ if (this.classFilter.indexOf(c) < 0) this.classFilter.push(c); }, clearClassFilter: function(){ this.classFilter = []; } }; } } if (gameObject.__dragSelection) { gameObject.__dragSelection.mouseButton = ${mb}; var _canvas = __engine && __engine._playCanvas; if (_canvas && typeof gameObject.__dragSelection.init === 'function') { gameObject.__dragSelection.init(_canvas, __scene, __engine); } } }`);
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

    // ── DataTable nodes (impure exec) ────────────────────────────────

    case 'Get Data Table Row': {
      const n = node as N.GetDataTableRowNode;
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      const safeDtId = n.dataTableId.replace(/[^a-zA-Z0-9]/g, '_');
      const rowNameSrc = inputSrc.get(`${nodeId}.rowName`);
      const rowNameExpr = rowNameSrc ? rv(rowNameSrc.nid, rowNameSrc.ok) : '""';
      lines.push(`var __dt_row_${uid} = null; var __dt_found_${uid} = false;`);
      lines.push(`if (typeof __dt_${safeDtId} !== 'undefined') {`);
      lines.push(`  var __rn_${uid} = String(${rowNameExpr});`);
      lines.push(`  var __r_${uid} = __dt_${safeDtId} ? __dt_${safeDtId}.rows[__rn_${uid}] : null;`);
      lines.push(`  if (__r_${uid} != null) { __dt_row_${uid} = __r_${uid}; __dt_found_${uid} = true; }`);
      lines.push(`}`);
      const thenLines    = we(nodeId, 'then');
      const notFoundLines = we(nodeId, 'notFound');
      if (thenLines.length || notFoundLines.length) {
        lines.push(`if (__dt_found_${uid}) {`);
        lines.push(...thenLines.map(l => '  ' + l));
        lines.push(`} else {`);
        lines.push(...notFoundLines.map(l => '  ' + l));
        lines.push(`}`);
      }
      break;
    }

    case 'For Each Data Table Row': {
      const n = node as N.ForEachDataTableRowNode;
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      const safeDtId = n.dataTableId.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`{ var __dt_entries_${uid} = (typeof __dt_${safeDtId} !== 'undefined' && __dt_${safeDtId}) ? Object.entries(__dt_${safeDtId}.rows) : [];`);
      lines.push(`  for (var __fe_ri_${uid} = 0; __fe_ri_${uid} < __dt_entries_${uid}.length; __fe_ri_${uid}++) {`);
      lines.push(`    var __fe_rowName_${uid} = __dt_entries_${uid}[__fe_ri_${uid}][0];`);
      lines.push(`    var __fe_row_${uid} = __dt_entries_${uid}[__fe_ri_${uid}][1];`);
      lines.push(...we(nodeId, 'loopBody').map(l => '    ' + l));
      lines.push(`  }`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'completed'));
      break;
    }

    case 'Add Data Table Row (Runtime)': {
      const n = node as any;
      const safeDtId = n.dataTableId.replace(/[^a-zA-Z0-9]/g, '_');
      const rowNameSrc = inputSrc.get(`${nodeId}.rowName`);
      const rowDataSrc = inputSrc.get(`${nodeId}.rowData`);
      const rowName = rowNameSrc ? rv(rowNameSrc.nid, rowNameSrc.ok) : '""';
      const rowData = rowDataSrc ? rv(rowDataSrc.nid, rowDataSrc.ok) : '{}';
      lines.push(`if (typeof __dt_${safeDtId} !== 'undefined' && __dt_${safeDtId}) { var __rnn = String(${rowName}); if (!__dt_${safeDtId}.rows[__rnn]) { __dt_${safeDtId}.rows[__rnn] = ${rowData}; } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    case 'Remove Data Table Row (Runtime)': {
      const n = node as any;
      const safeDtId = n.dataTableId.replace(/[^a-zA-Z0-9]/g, '_');
      const rowNameSrc = inputSrc.get(`${nodeId}.rowName`);
      const rowName = rowNameSrc ? rv(rowNameSrc.nid, rowNameSrc.ok) : '""';
      lines.push(`if (typeof __dt_${safeDtId} !== 'undefined' && __dt_${safeDtId}) { delete __dt_${safeDtId}.rows[String(${rowName})]; }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    case 'Update Data Table Row (Runtime)': {
      const n = node as any;
      const safeDtId = n.dataTableId.replace(/[^a-zA-Z0-9]/g, '_');
      const rowNameSrc = inputSrc.get(`${nodeId}.rowName`);
      const rowDataSrc = inputSrc.get(`${nodeId}.rowData`);
      const rowName = rowNameSrc ? rv(rowNameSrc.nid, rowNameSrc.ok) : '""';
      const rowData = rowDataSrc ? rv(rowDataSrc.nid, rowDataSrc.ok) : '{}';
      lines.push(`if (typeof __dt_${safeDtId} !== 'undefined' && __dt_${safeDtId}) { var __rnn = String(${rowName}); if (__dt_${safeDtId}.rows[__rnn]) { Object.assign(__dt_${safeDtId}.rows[__rnn], ${rowData}); } }`);
      lines.push(...we(nodeId, 'exec'));
      break;
    }

    case 'Find Rows By Predicate': {
      const n = node as N.FindRowsByPredicateNode;
      const uid = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
      const safeDtId = n.dataTableId.replace(/[^a-zA-Z0-9]/g, '_');
      const predSrc = inputSrc.get(`${nodeId}.predicate`);
      const predExpr = predSrc ? rv(predSrc.nid, predSrc.ok) : '""';
      lines.push(`var __frp_rows_${uid} = []; var __frp_count_${uid} = 0;`);
      lines.push(`if (typeof __dt_${safeDtId} !== 'undefined' && __dt_${safeDtId}) {`);
      lines.push(`  var __predFn = typeof ${predExpr} === 'function' ? ${predExpr} : (typeof window[${predExpr}] === 'function' ? window[${predExpr}] : null);`);
      lines.push(`  if (__predFn) {`);
      lines.push(`    var __entries = Object.entries(__dt_${safeDtId}.rows);`);
      lines.push(`    for (var __fri = 0; __fri < __entries.length; __fri++) {`);
      lines.push(`      if (__predFn(__entries[__fri][1], __entries[__fri][0])) { __frp_rows_${uid}.push(__entries[__fri][1]); }`);
      lines.push(`    }`);
      lines.push(`    __frp_count_${uid} = __frp_rows_${uid}.length;`);
      lines.push(`  }`);
      lines.push(`}`);
      lines.push(...we(nodeId, 'then'));
      break;
    }

  }
  return lines;

  } finally { _execCycleStack.delete(nodeId); }
}

// ============================================================
//  Full code generator
// ============================================================
export function generateFullCode(
  eventEditor: NodeEditor<Schemes>,
  bp: import('../BlueprintData').BlueprintData,
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

  // ── DataTable runtime constants ──────────────────────────────────
  // Embed all DataTable row data as plain JS objects so Get Data Table
  // Row nodes can look up rows at runtime without reaching back into editor state.
  if (getDataTableMgr()) {
    for (const dt of getDataTableMgr()!.tables) {
      const safeDtId = dt.id.replace(/[^a-zA-Z0-9]/g, '_');
      const rowsObj: Record<string, any> = {};
      for (const row of dt.rows) { rowsObj[row.rowName] = row.data; }
      parts.push(`var __dt_${safeDtId} = ${JSON.stringify({ rows: rowsObj })};`);
    }
  }

  // ── Texture metadata constants ───────────────────────────────────
  // Embed texture metadata so Get Texture ID, Find Texture by Name, and
  // Get Texture Info nodes can look up texture data at runtime.
  {
    const texLib = TextureLibrary.instance;
    if (texLib) {
      const metaMap: Record<string, any> = {};
      const nameMap: Record<string, string> = {};
      for (const tex of texLib.allTextures) {
        metaMap[tex.assetId] = {
          name: tex.assetName,
          width: tex.metadata?.width ?? 0,
          height: tex.metadata?.height ?? 0,
          hasAlpha: tex.metadata?.hasAlpha ?? false,
          format: tex.metadata?.format ?? '',
          storedData: tex.storedData ?? '',
        };
        nameMap[tex.assetName.toLowerCase()] = tex.assetId;
      }
      parts.push(`var __textureMeta = ${JSON.stringify(metaMap)};`);
      parts.push(`var __textureNameMap = ${JSON.stringify(nameMap)};`);
    } else {
      parts.push(`var __textureMeta = {};`);
      parts.push(`var __textureNameMap = {};`);
    }
  }

  // Function bodies
  for (const fn of bp.functions) {
    const fnEditor = functionEditors.get(fn.id);
    if (!fnEditor) continue;
    const { nodes, nodeMap, inputSrc, outputDst } = buildMaps(fnEditor);
    const entryNode = nodes.find(n => n instanceof N.FunctionEntryNode);
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
  const customEvtNodes = nodes.filter(n => n instanceof N.CustomEventNode);
  for (const evNode of customEvtNodes) {
    const ce = evNode as N.CustomEventNode;
    const name = sanitizeName(ce.eventName);
    const evt = bp.customEvents.find(e => e.id === ce.eventId);
    const params = evt && evt.params.length > 0
      ? evt.params.map(p => `__cev_param_${sanitizeName(p.name)}`).join(', ')
      : '';
    const body = walkExec(ce.id, 'exec', nodeMap, inputSrc, outputDst, bp);
    parts.push(`function __custom_evt_${name}(${params}) {\n${body.map(l => '  ' + l).join('\n')}\n}`);
  }

  // Input key event nodes & IsKeyDown nodes
  const inputKeyNodes = nodes.filter(n => n instanceof N.InputKeyEventNode) as N.InputKeyEventNode[];
  const isKeyDownNodes = nodes.filter(n => n instanceof N.IsKeyDownNode);
  const inputAxisNodes = nodes.filter(n => n instanceof N.InputAxisNode);
  const hasInputNodes = inputKeyNodes.length > 0 || isKeyDownNodes.length > 0 || inputAxisNodes.length > 0;
  if (hasInputNodes) {
    parts.push('var __inputKeys = {};');
    parts.push('var __inputCleanup = [];');
  }

  // â”€â”€ Pre-declare stateful flow-control variables at factory (preamble) scope â”€â”€
  // Without `var`, the `typeof __xxx === 'undefined'` pattern inside lifecycle
  // closures would create implicit globals that persist across play sessions.
  // Declaring them here ensures they're factory-scoped and properly reset on recompile.
  for (const n of nodes) {
    const uid = n.id.replace(/[^a-zA-Z0-9]/g, '_');
    if (n instanceof N.DoOnceNode)            parts.push(`var __doOnce_${uid};`);
    if (n instanceof N.FlipFlopNode)          parts.push(`var __flipFlop_${uid};`);
    if (n instanceof N.DoNNode)               parts.push(`var __doN_ctr_${uid};`);
    if (n instanceof N.GateNode)              parts.push(`var __gate_${uid};`);
    if (n instanceof N.MultiGateNode)         parts.push(`var __mg_idx_${uid}; var __mg_done_${uid};`);
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

  // â”€â”€ AI Task lifecycle events (mapped to standard lifecycles) â”€â”€
  // AI Receive Execute / Service Activated / Observer Activated / On Possess â†’ beginPlay
  const aiBeginEvts = nodes.filter(n =>
    n instanceof N.AIReceiveExecuteNode || n instanceof N.AIServiceActivatedNode ||
    n instanceof N.AIObserverActivatedNode || n instanceof N.OnPossessNode
  );
  for (const ev of aiBeginEvts) beginPlayCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));

  // AI Receive Tick / Service Tick / Condition Check / On Move Completed / On Perception â†’ tick
  const aiTickEvts = nodes.filter(n =>
    n instanceof N.AIReceiveTickNode || n instanceof N.AIServiceTickNode ||
    n instanceof N.AIPerformConditionCheckNode || n instanceof N.OnPerceptionUpdatedNode
  );
  for (const ev of aiTickEvts) tickCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));

  // On Move Completed â€” poll each tick: fire when AI state transitions to idle
  const onMoveCompletedEvts = nodes.filter(n => n instanceof N.OnMoveCompletedNode);
  if (onMoveCompletedEvts.length > 0) {
    parts.push('var __omc_prevState = "idle";');
    for (const ev of onMoveCompletedEvts) {
      const body = walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length) {
        tickCode.push(`{ var _aiS = gameObject.aiController ? gameObject.aiController.state : 'idle'; if (__omc_prevState !== 'idle' && _aiS === 'idle') { ${body.join(' ')} } __omc_prevState = _aiS; }`);
      }
    }
  }

  // AI Receive Abort / Service Deactivated / Observer Deactivated / On Unpossess â†’ onDestroy
  const aiEndEvts = nodes.filter(n =>
    n instanceof N.AIReceiveAbortNode || n instanceof N.AIServiceDeactivatedNode ||
    n instanceof N.AIObserverDeactivatedNode || n instanceof N.OnUnpossessNode
  );
  for (const ev of aiEndEvts) onDestroyCode.push(...walkExec(ev.id, 'exec', nodeMap, inputSrc, outputDst, bp));

  // Input Action/Axis Mapping Events (polled in Tick)
  const inputActionNodes = nodes.filter(n => n instanceof N.InputActionMappingEventNode) as N.InputActionMappingEventNode[];
  for (const iaNode of inputActionNodes) {
    const ctrl = iaNode.controls['action'] as N.ActionMappingSelectControl | undefined;
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

  const inputAxisMappingNodes = nodes.filter(n => n instanceof N.InputAxisMappingEventNode) as N.InputAxisMappingEventNode[];
  for (const iaxNode of inputAxisMappingNodes) {
    const ctrl = iaxNode.controls['axis'] as N.AxisMappingSelectControl | undefined;
    const axis = ctrl?.value ?? iaxNode.selectedAxis;
    const execBody = walkExec(iaxNode.id, 'exec', nodeMap, inputSrc, outputDst, bp);
    if (execBody.length) {
      tickCode.push(`if (__engine && __engine.input) { var __axis_${iaxNode.id.replace(/[^a-zA-Z0-9]/g, '_')} = __engine.input.getAxis(${JSON.stringify(axis)}); ${execBody.join(' ')} }`);
    }
  }

  // Input key event listeners â€” inject into beginPlay & onDestroy
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
      const keyCtrl = ikNode.controls['key'] as N.KeySelectControl | undefined;
      const key = keyCtrl?.value ?? ikNode.selectedKey;
      const kc = N.keyEventCode(key);
      const itype = N.inputType(key);
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

  // â”€â”€ OnEvent / EmitEvent (EventBus) nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const onEventNodes = nodes.filter(n => n instanceof N.OnEventNode) as InstanceType<typeof N.OnEventNode>[];
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

  // â”€â”€ Drag Selection Complete event nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dragSelCompleteNodes = nodes.filter(n => n.label === 'On Drag Selection Complete');
  if (dragSelCompleteNodes.length > 0) {
    for (const dsEvt of dragSelCompleteNodes) {
      const body = walkExec(dsEvt.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        // Wire the onSelectionComplete callback â€” the DragSelectionComponent
        // will call this when a drag selection finishes.
        beginPlayCode.push(`(function() { var __ds_cb_${dsEvt.id.replace(/[^a-zA-Z0-9]/g,'_')} = function(__dsResult) { var __dragSelectedActors = __dsResult ? __dsResult.actors : []; var __dragSelectedCount = __dragSelectedActors.length; ${body.join(' ')} }; if (!gameObject.__dragSelCallbacks) gameObject.__dragSelCallbacks = []; gameObject.__dragSelCallbacks.push(__ds_cb_${dsEvt.id.replace(/[^a-zA-Z0-9]/g,'_')}); })();`);
      }
    }
    // In beginPlay, wire callbacks to the component when it's initialised
    beginPlayCode.push(`(function() { var _wireDSCB = function() { if (gameObject.__dragSelection && gameObject.__dragSelCallbacks) { gameObject.__dragSelection.onSelectionComplete = function(result) { for (var _ci = 0; _ci < gameObject.__dragSelCallbacks.length; _ci++) { gameObject.__dragSelCallbacks[_ci](result); } }; } }; _wireDSCB(); var _origInit = gameObject.__origDSInit; if (!_origInit) { gameObject.__origDSInit = true; var _intv = setInterval(function() { if (gameObject.__dragSelection) { _wireDSCB(); clearInterval(_intv); } }, 100); __inputCleanup = __inputCleanup || []; __inputCleanup.push(function() { clearInterval(_intv); }); } })();`);
    // Cleanup drag selection on destroy
    onDestroyCode.push('if (gameObject.__dragSelection) { gameObject.__dragSelection.destroy(); gameObject.__dragSelection = null; }');
  }

  // â”€â”€ 2D Collision / Trigger / Animation event nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Collision / Trigger event nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const triggerBeginNodes = nodes.filter(n => n instanceof N.OnTriggerBeginOverlapNode);
  const triggerEndNodes = nodes.filter(n => n instanceof N.OnTriggerEndOverlapNode);
  const actorBeginNodes = nodes.filter(n => n instanceof N.OnActorBeginOverlapNode);
  const actorEndNodes = nodes.filter(n => n instanceof N.OnActorEndOverlapNode);
  const collisionHitNodes = nodes.filter(n => n instanceof N.OnCollisionHitNode);
  // UE-style per-component bound overlap events
  const boundBeginNodes = nodes.filter(n => n instanceof N.OnTriggerComponentBeginOverlapNode) as N.OnTriggerComponentBeginOverlapNode[];
  const boundEndNodes   = nodes.filter(n => n instanceof N.OnTriggerComponentEndOverlapNode)   as N.OnTriggerComponentEndOverlapNode[];
  const hasCollisionEvents = triggerBeginNodes.length > 0 || triggerEndNodes.length > 0 ||
    actorBeginNodes.length > 0 || actorEndNodes.length > 0 || collisionHitNodes.length > 0 ||
    boundBeginNodes.length > 0 || boundEndNodes.length > 0;

  if (hasCollisionEvents) {
    beginPlayCode.push('var __collCb = __physics.collision.registerCallbacks(gameObject.id);');

    // UE-style bound Begin Overlap â€” filter by selfComponentName
    for (const n of boundBeginNodes) {
      const body = walkExec(n.id, 'exec', nodeMap, inputSrc, outputDst, bp);
      if (body.length > 0) {
        beginPlayCode.push(`__collCb.onBeginOverlap.push(function(__ovEvt) { if (__ovEvt.selfComponentName !== ${JSON.stringify(n.compName)}) return; var __otherActorName = __ovEvt.otherActorName; var __otherActorId = __ovEvt.otherActorId; var __otherActor = __scene ? __scene.findById(__otherActorId) : null; ${body.join(' ')} });`);
      }
    }
    // UE-style bound End Overlap â€” filter by selfComponentName
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

  // â”€â”€ Widget Event Nodes (ButtonOnClicked, etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const buttonClickedNodes = nodes.filter(n => n instanceof N.ButtonOnClickedNode) as N.ButtonOnClickedNode[];
  const buttonPressedNodes = nodes.filter(n => n instanceof N.ButtonOnPressedNode) as N.ButtonOnPressedNode[];
  const buttonReleasedNodes = nodes.filter(n => n instanceof N.ButtonOnReleasedNode) as N.ButtonOnReleasedNode[];
  const buttonHoveredNodes = nodes.filter(n => n instanceof N.ButtonOnHoveredNode) as N.ButtonOnHoveredNode[];
  const buttonUnhoveredNodes = nodes.filter(n => n instanceof N.ButtonOnUnhoveredNode) as N.ButtonOnUnhoveredNode[];
  const textBoxChangedNodes = nodes.filter(n => n instanceof N.TextBoxOnTextChangedNode) as N.TextBoxOnTextChangedNode[];
  const textBoxCommittedNodes = nodes.filter(n => n instanceof N.TextBoxOnTextCommittedNode) as N.TextBoxOnTextCommittedNode[];
  const sliderChangedNodes = nodes.filter(n => n instanceof N.SliderOnValueChangedNode) as N.SliderOnValueChangedNode[];
  const checkBoxChangedNodes = nodes.filter(n => n instanceof N.CheckBoxOnCheckStateChangedNode) as N.CheckBoxOnCheckStateChangedNode[];

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

    // â"€â"€ Cleanup pending Delay timeouts and Retriggerable Delays on destroy â"€â"€
    onDestroyCode.push('if (gameObject.__pendingDelays) { gameObject.__pendingDelays.forEach(clearTimeout); gameObject.__pendingDelays = []; }');
    onDestroyCode.push('if (gameObject.__retriggerableDelays) { Object.values(gameObject.__retriggerableDelays).forEach(function(id) { clearTimeout(id); }); gameObject.__retriggerableDelays = {}; }');

    const sections: string[] = [];
    if (beginPlayCode.length) sections.push(`// __beginPlay__\n${beginPlayCode.join('\n')}`);
    if (tickCode.length) sections.push(`// __tick__\n${tickCode.join('\n')}`);
    if (onDestroyCode.length) sections.push(`// __onDestroy__\n${onDestroyCode.join('\n')}`);
    if (sections.length) parts.push(sections.join('\n'));
  }

  // For Animation Blueprints: Variables live in the AnimBP's own closure,
  // NOT on the pawn's _scriptVars. The AnimBP can read the pawn's variables
  // via CastTo â†’ GetActorVariable (which reads pawn._scriptVars correctly).
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


