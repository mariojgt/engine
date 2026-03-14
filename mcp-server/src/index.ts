// ============================================================
//  Feather Engine MCP Server — Full Engine Control
//  ────────────────────────────────────────────────
//  Exposes every engine capability via Model Context Protocol:
//  - Project & scene management
//  - Actor/blueprint creation & modification
//  - Sprite sheets, animations & 2D characters
//  - Animation blueprints with state machines
//  - Widget/UI blueprints
//  - Texture management
//  - Game Instance & Data Tables
//  - Structures, Enums, Save Games
//  - Scene composition (lights, sky, fog)
//  - Physics settings
//  - Input mappings
//  - Blueprint variables & event graphs
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import * as http from 'node:http';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';

// ── WebSocket Bridge (engine ↔ MCP) ──────────────────────────
const WS_PORT = parseInt(process.env.MCP_BRIDGE_PORT || '9960', 10);
let wss: WebSocketServer | null = null;

// ── Pending bridge requests (MCP → Engine → response) ──────────
const _pendingRequests = new Map<string, { resolve: (data: any) => void; timer: ReturnType<typeof setTimeout> }>();
let _requestCounter = 0;

function startBridgeServer(): void {
  wss = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });
  wss.on('listening', () => {
    console.error(`[MCP Bridge] WebSocket server listening on ws://127.0.0.1:${WS_PORT}`);
  });
  wss.on('connection', (ws) => {
    console.error('[MCP Bridge] Engine client connected');
    ws.send(JSON.stringify({ type: 'connected', message: 'MCP Bridge active' }));
    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
        if (msg.type === 'bridge-response' && msg.requestId) {
          const pending = _pendingRequests.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            _pendingRequests.delete(msg.requestId);
            pending.resolve(msg);
          }
        }
      } catch { /* ignore */ }
    });
    ws.on('close', () => console.error('[MCP Bridge] Engine client disconnected'));
  });
  wss.on('error', (err: any) => {
    console.error('[MCP Bridge] WebSocket error:', err.message);
  });
}

/**
 * Send a request to the engine via WebSocket and wait for a response.
 * Returns the response data or null on timeout.
 */
function bridgeRequest(action: string, payload: Record<string, unknown> = {}, timeoutMs = 10000): Promise<any> {
  return new Promise((resolve) => {
    if (!wss || wss.clients.size === 0) { resolve(null); return; }
    const requestId = 'req_' + (++_requestCounter) + '_' + Date.now().toString(36);
    const msg = JSON.stringify({ type: 'bridge-request', action, requestId, ...payload });
    const timer = setTimeout(() => {
      _pendingRequests.delete(requestId);
      resolve(null);
    }, timeoutMs);
    _pendingRequests.set(requestId, { resolve, timer });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
        break; // Send to first connected engine client
      }
    }
  });
}

function broadcastChange(event: Record<string, unknown>): void {
  if (!wss) return;
  const msg = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// ── ID generation (matches engine patterns) ──────────────────
let _assetNextId = Date.now();
let _uid = 0;
function assetUid(): string { return 'actor_' + (++_assetNextId) + '_' + Date.now().toString(36); }
function animUid(): string { return 'abp_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function compUid(): string { return 'comp_' + (++_uid) + '_' + Math.random().toString(36).slice(2, 6); }
function spriteUid(): string { return 'ss_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function structUid(): string { return 'struct_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function widgetUid(): string { return 'wbp_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function giUid(): string { return 'gi_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function sgUid(): string { return 'sg_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function dtUid(): string { return 'dt_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function enumUid(): string { return 'enum_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function eventUid(): string { return 'evt_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function varUid(name: string): string { return `var_${name}_${Date.now().toString(36)}`; }
function nodeUid(): string { return 'node_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function soundUid(): string { return 'snd_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function cueUid(): string { return 'cue_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function cueNodeUid(): string { return 'scn_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function fontUid(): string { return 'font_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function inputMapUid(): string { return 'inputmapping_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function particleUid(): string { return 'ptcl_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function navUid(): string { return 'nav_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }
function shaderNodeUid(): string { return 'shn_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }

// ── File I/O helpers ─────────────────────────────────────────
function readJsonFile(filePath: string): any {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function writeJsonFile(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  // Auto-broadcast asset change to the engine bridge
  const normPath = filePath.replace(/\\/g, '/');
  const folderMatch = normPath.match(
    /\/(Actors|Scenes|Sprites|SpriteSheets|AnimBlueprints|Structures|Enums|Widgets|GameInstances|SaveGameClasses|DataTables|Config|Textures|Fonts|InputMappings|Events|Meshes|Sounds|SoundCues|Particles|NavMesh|Shaders)\//i
  );
  if (folderMatch) {
    broadcastChange({
      type: 'asset-changed',
      assetType: folderMatch[1].toLowerCase(),
      name: data.actorName || data.assetName || data.animBlueprintName || data.sceneName || data.name || path.basename(filePath, '.json'),
      assetId: data.actorId || data.assetId || data.animBlueprintId || data.id || path.basename(filePath, '.json'),
      path: filePath,
    });
  }
}

// ============================================================
//  compileGraphToCode — Generate runtime JS from a JSON graph
//  Handles the most common node types for actors.
// ============================================================
function compileGraphToCode(graph: any, actorData?: any): string {
  if (!graph || !graph.nodes || graph.nodes.length === 0) return '';
  const nodes: any[] = graph.nodes;
  const conns: any[] = graph.connections || [];

  // Build connection maps
  const outgoing = new Map<string, any[]>(); // sourceId.output -> [{target,targetInput}]
  const incoming = new Map<string, any>();   // targetId.input -> {source,sourceOutput}
  for (const c of conns) {
    const ok = c.source + '.' + c.sourceOutput;
    if (!outgoing.has(ok)) outgoing.set(ok, []);
    outgoing.get(ok)!.push({ target: c.target, targetInput: c.targetInput });
    incoming.set(c.target + '.' + c.targetInput, { source: c.source, sourceOutput: c.sourceOutput });
  }

  const nodeMap = new Map<string, any>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Find execution chains from an event node
  function execChain(startId: string, startOutput: string): string[] {
    const ids: string[] = [];
    let key = startId + '.' + startOutput;
    while (true) {
      const targets = outgoing.get(key);
      if (!targets || targets.length === 0) break;
      const t = targets[0];
      ids.push(t.target);
      key = t.target + '.exec'; // follow exec output
    }
    return ids;
  }

  // Resolve a data input value for a node
  function resolveInput(nodeId: string, inputName: string, fallback: string): string {
    const conn = incoming.get(nodeId + '.' + inputName);
    if (!conn) return fallback;
    const srcNode = nodeMap.get(conn.source);
    if (!srcNode) return fallback;
    return resolveNodeOutput(srcNode, conn.sourceOutput);
  }

  // Get a node's output expression
  function resolveNodeOutput(node: any, output: string): string {
    const t = node.type;
    const c = node.data?.controls || {};
    const d = node.data || {};

    // Math nodes
    if (t === 'AddNode') return '(' + resolveInput(node.id, 'a', '0') + ' + ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'SubtractNode') return '(' + resolveInput(node.id, 'a', '0') + ' - ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'MultiplyNode') return '(' + resolveInput(node.id, 'a', '0') + ' * ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'DivideNode') return '(' + resolveInput(node.id, 'a', '0') + ' / ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'SineNode') return 'Math.sin(' + resolveInput(node.id, 'value', '0') + ')';
    if (t === 'CosineNode') return 'Math.cos(' + resolveInput(node.id, 'value', '0') + ')';
    if (t === 'AbsoluteNode') return 'Math.abs(' + resolveInput(node.id, 'value', '0') + ')';
    if (t === 'ClampNode') return 'Math.min(Math.max(' + resolveInput(node.id, 'value', '0') + ', ' + resolveInput(node.id, 'min', '0') + '), ' + resolveInput(node.id, 'max', '1') + ')';
    if (t === 'LerpNode') { const a = resolveInput(node.id,'a','0'), b = resolveInput(node.id,'b','1'), al = resolveInput(node.id,'alpha','0'); return '(' + a + ' + (' + b + ' - ' + a + ') * ' + al + ')'; }
    if (t === 'ModuloNode') return '(' + resolveInput(node.id, 'a', '0') + ' % ' + resolveInput(node.id, 'b', '1') + ')';
    if (t === 'MinNode') return 'Math.min(' + resolveInput(node.id, 'a', '0') + ', ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'MaxNode') return 'Math.max(' + resolveInput(node.id, 'a', '0') + ', ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'SqrtNode') return 'Math.sqrt(' + resolveInput(node.id, 'value', '0') + ')';
    if (t === 'RandomFloatNode') return 'Math.random()';
    if (t === 'RandomFloatInRangeNode') { const mn = resolveInput(node.id,'min','0'), mx = resolveInput(node.id,'max','1'); return '(' + mn + ' + Math.random() * (' + mx + ' - ' + mn + '))'; }

    // Comparison nodes
    if (t === 'GreaterThanNode') return '(' + resolveInput(node.id, 'a', '0') + ' > ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'LessThanNode') return '(' + resolveInput(node.id, 'a', '0') + ' < ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'EqualNode') return '(' + resolveInput(node.id, 'a', '0') + ' == ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'NotEqualNode') return '(' + resolveInput(node.id, 'a', '0') + ' != ' + resolveInput(node.id, 'b', '0') + ')';
    if (t === 'BoolAndNode') return '(' + resolveInput(node.id, 'a', 'false') + ' && ' + resolveInput(node.id, 'b', 'false') + ')';
    if (t === 'BoolOrNode') return '(' + resolveInput(node.id, 'a', 'false') + ' || ' + resolveInput(node.id, 'b', 'false') + ')';
    if (t === 'BoolNotNode') return '(!' + resolveInput(node.id, 'value', 'false') + ')';

    // Value nodes
    if (t === 'FloatNode') return String(c.value ?? d.value ?? 0);
    if (t === 'BooleanNode') return String(c.value ?? d.value ?? false);
    if (t === 'StringLiteralNode') return JSON.stringify(c.value ?? d.value ?? '');
    if (t === 'TimeNode') return 'elapsedTime';
    if (t === 'DeltaTimeNode') return 'deltaTime';

    // Input nodes
    if (t === 'InputAxisNode') {
      const pos = (c.posKey || d.positiveKey || 'D').toLowerCase();
      const neg = (c.negKey || d.negativeKey || 'A').toLowerCase();
      return '((__inputKeys[' + JSON.stringify(pos) + '] ? 1 : 0) - (__inputKeys[' + JSON.stringify(neg) + '] ? 1 : 0))';
    }

    // Transform nodes
    if (t === 'GetPositionNode' || t === 'GetActorPositionNode') {
      if (output === 'x') return 'gameObject.position.x';
      if (output === 'y') return 'gameObject.position.y';
      if (output === 'z') return 'gameObject.position.z';
      return 'gameObject.position';
    }
    if (t === 'GetActorRotationNode') {
      if (output === 'x') return 'gameObject.rotation.x';
      if (output === 'y') return 'gameObject.rotation.y';
      if (output === 'z') return 'gameObject.rotation.z';
      return 'gameObject.rotation';
    }
    if (t === 'GetActorScaleNode') {
      if (output === 'x') return 'gameObject.scale.x';
      if (output === 'y') return 'gameObject.scale.y';
      if (output === 'z') return 'gameObject.scale.z';
      return 'gameObject.scale';
    }
    if (t === 'GetActorVelocityNode') {
      return '(function(){ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D"); return _rb && _rb.rigidBody ? _rb.rigidBody.linvel() : {x:0,y:0}; })().' + (output || 'x');
    }

    // Character nodes
    if (t === 'GetMovementSpeedNode' || t === 'GetCharacterVelocityNode') {
      return '(function(){ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); return _cm ? _cm.currentSpeed : 0; })()';
    }
    if (t === 'IsGroundedNode') return '(function(){ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); return _cm ? _cm.isGrounded : false; })()';
    if (t === 'IsMovingNode') return '(function(){ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); return _cm ? _cm.currentSpeed > 0.01 : false; })()';

    // Variable nodes
    if (t === 'GetVariableNode') {
      const varName = c.variableName || d.variableName || d.selectedVariable || '';
      return '__vars[' + JSON.stringify(varName) + ']';
    }

    // Self reference
    if (t === 'GetSelfReferenceNode') return 'gameObject';
    if (t === 'GetPlayerPawnNode') return 'gameObject'; // simplified

    return '0 /* unknown: ' + t + '.' + output + ' */';
  }

  // Generate code for a single exec node
  function genNodeCode(nodeId: string): string {
    const node = nodeMap.get(nodeId);
    if (!node) return '';
    const t = node.type;
    const c = node.data?.controls || {};
    const d = node.data || {};
    let code = '';

    // Print String
    if (t === 'PrintStringNode') {
      const text = resolveInput(nodeId, 'value', JSON.stringify(c.text ?? 'Hello'));
      code += 'print(' + text + ');\n';
    }

    // Set position
    else if (t === 'SetPositionNode' || t === 'SetActorPositionNode') {
      const x = resolveInput(nodeId, 'x', 'gameObject.position.x');
      const y = resolveInput(nodeId, 'y', 'gameObject.position.y');
      const z = resolveInput(nodeId, 'z', 'gameObject.position.z');
      code += 'gameObject.position.set(' + x + ', ' + y + ', ' + z + ');\n';
    }
    else if (t === 'SetActorRotationNode') {
      const x = resolveInput(nodeId, 'x', 'gameObject.rotation.x');
      const y = resolveInput(nodeId, 'y', 'gameObject.rotation.y');
      const z = resolveInput(nodeId, 'z', 'gameObject.rotation.z');
      code += 'gameObject.rotation.set(' + x + ', ' + y + ', ' + z + ');\n';
    }

    // Add Movement Input 2D
    else if (t === 'AddMovementInput2DNode') {
      const x = resolveInput(nodeId, 'x', '0');
      const y = resolveInput(nodeId, 'y', '0');
      const scale = resolveInput(nodeId, 'scale', '1');
      code += '{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D");';
      code += ' if (_cm) {';
      code += ' var _sx = (' + x + ') * (' + scale + ');';
      code += ' var _sy = (' + y + ') * (' + scale + ');';
      code += ' if (Math.abs(_sx) > 0.001) _cm.moveHorizontal(_sx, deltaTime); else _cm.decelerate(deltaTime);';
      code += ' if (Math.abs(_sy) > 0.001) _cm.moveVertical(_sy, deltaTime); else if (_cm.decelerateVertical) _cm.decelerateVertical(deltaTime);';
      code += ' } }\n';
    }

    // Jump
    else if (t === 'JumpNode') {
      code += '{ var _cm = gameObject.getComponent && gameObject.getComponent("CharacterMovement2D"); if (_cm && _cm.jump) _cm.jump(); }\n';
    }

    // Set Variable
    else if (t === 'SetVariableNode') {
      const varName = c.variableName || d.variableName || d.selectedVariable || '';
      const val = resolveInput(nodeId, 'value', '0');
      code += '__vars[' + JSON.stringify(varName) + '] = ' + val + ';\n';
    }

    // Branch
    else if (t === 'BranchNode') {
      const cond = resolveInput(nodeId, 'condition', 'false');
      const trueChain = execChain(nodeId, 'true');
      const falseChain = execChain(nodeId, 'false');
      code += 'if (' + cond + ') {\n';
      for (const id of trueChain) code += '  ' + genNodeCode(id);
      code += '} else {\n';
      for (const id of falseChain) code += '  ' + genNodeCode(id);
      code += '}\n';
    }

    // Spawn Actor
    else if (t === 'SpawnActorNode') {
      const cls = c.className || d.className || '';
      code += '/* SpawnActor: ' + cls + ' — requires runtime scene API */\n';
    }

    // Destroy Actor
    else if (t === 'DestroyActorNode') {
      code += 'if (typeof destroyActor === "function") destroyActor(gameObject);\n';
    }

    // Play Sound
    else if (t === 'PlaySoundNode') {
      const snd = resolveInput(nodeId, 'sound', JSON.stringify(c.sound || ''));
      code += 'if (typeof playSound === "function") playSound(' + snd + ');\n';
    }

    // Add Force / Impulse
    else if (t === 'AddForceNode' || t === 'AddImpulseNode') {
      const x = resolveInput(nodeId, 'x', '0');
      const y = resolveInput(nodeId, 'y', '0');
      const method = t === 'AddImpulseNode' ? 'applyImpulse' : 'applyForce';
      code += '{ var _rb = gameObject.getComponent && gameObject.getComponent("RigidBody2D");';
      code += ' if (_rb && _rb.rigidBody) _rb.rigidBody.' + method + '({x:' + x + ', y:' + y + '}, true); }\n';
    }

    // Sequence node — follow all outputs
    else if (t === 'SequenceNode') {
      for (let i = 0; i < 5; i++) {
        const chain = execChain(nodeId, 'then_' + i);
        if (chain.length === 0) {
          const chain2 = execChain(nodeId, String(i));
          for (const id of chain2) code += genNodeCode(id);
        } else {
          for (const id of chain) code += genNodeCode(id);
        }
      }
    }

    // ForLoop
    else if (t === 'ForLoopNode') {
      const start = resolveInput(nodeId, 'start', '0');
      const end = resolveInput(nodeId, 'end', '10');
      const body = execChain(nodeId, 'loopBody');
      code += 'for (var __i = ' + start + '; __i < ' + end + '; __i++) {\n';
      for (const id of body) code += '  ' + genNodeCode(id);
      code += '}\n';
    }

    // Default — just note it
    else {
      code += '/* ' + t + ' [' + nodeId + '] — not compiled */\n';
    }

    return code;
  }

  // ── Build the code sections ──
  const beginPlayNodes = nodes.filter(n => n.type === 'EventBeginPlayNode');
  const tickNodes = nodes.filter(n => n.type === 'EventTickNode');
  const destroyNodes = nodes.filter(n => n.type === 'EventOnDestroyNode');
  const inputKeyNodes = nodes.filter(n => n.type === 'InputKeyEventNode');

  // Collect variables
  const vars = actorData?.variables || [];
  let varDecls = '';
  const varDefaults: Record<string, string> = {};
  for (const v of vars) {
    const name = v.name || v.variableName;
    const def = v.defaultValue ?? (v.type === 'Float' ? 0 : v.type === 'Boolean' ? false : v.type === 'String' ? '' : null);
    varDefaults[name] = JSON.stringify(def);
  }

  // Start building code
  let out = '';

  // Variable getter
  out += 'function __getVars() { return { ';
  for (const [k, v] of Object.entries(varDefaults)) out += JSON.stringify(k) + ': __vars[' + JSON.stringify(k) + '], ';
  out += ' }; }\n';

  // Variable store
  if (Object.keys(varDefaults).length > 0) {
    out += 'var __vars = { ';
    for (const [k, v] of Object.entries(varDefaults)) out += JSON.stringify(k) + ': ' + v + ', ';
    out += '};\n';
  } else {
    out += 'var __vars = {};\n';
  }

  // Check if any input axis or key nodes are used
  const hasInputNodes = nodes.some(n =>
    n.type === 'InputAxisNode' || n.type === 'InputKeyEventNode' ||
    n.type === 'GetMousePositionNode' || n.type === 'GetMouseDeltaNode'
  );

  if (hasInputNodes) {
    out += 'var __inputKeys = {};\nvar __inputCleanup = [];\n';
  }

  // ── beginPlay ──
  let beginPlayCode = '';
  if (hasInputNodes) {
    beginPlayCode += 'var __kd_global = function(e) { __inputKeys[e.key] = true; };\n';
    beginPlayCode += 'var __ku_global = function(e) { __inputKeys[e.key] = false; };\n';
    beginPlayCode += 'document.addEventListener("keydown", __kd_global);\n';
    beginPlayCode += 'document.addEventListener("keyup", __ku_global);\n';
    beginPlayCode += 'var __md_global = function(e) { __inputKeys["__mouse" + e.button] = true; };\n';
    beginPlayCode += 'var __mu_global = function(e) { __inputKeys["__mouse" + e.button] = false; };\n';
    beginPlayCode += 'document.addEventListener("mousedown", __md_global);\n';
    beginPlayCode += 'document.addEventListener("mouseup", __mu_global);\n';
    beginPlayCode += '__inputCleanup.push(function() { document.removeEventListener("keydown", __kd_global); document.removeEventListener("keyup", __ku_global); document.removeEventListener("mousedown", __md_global); document.removeEventListener("mouseup", __mu_global); });\n';
  }

  // InputKeyEvent nodes → keydown listeners in beginPlay
  for (const ikn of inputKeyNodes) {
    const key = ikn.data?.selectedKey || ikn.data?.controls?.key || 'Space';
    // Map key names to event.key values
    let eventKey = key;
    if (key === 'Space') eventKey = ' ';
    else if (key === 'Enter') eventKey = 'Enter';
    else if (key === 'Escape') eventKey = 'Escape';
    else if (key === 'ArrowUp') eventKey = 'ArrowUp';
    else if (key === 'ArrowDown') eventKey = 'ArrowDown';
    else if (key === 'ArrowLeft') eventKey = 'ArrowLeft';
    else if (key === 'ArrowRight') eventKey = 'ArrowRight';
    else if (key === 'LeftShift' || key === 'RightShift') eventKey = 'Shift';
    else if (key === 'LeftControl' || key === 'RightControl') eventKey = 'Control';
    else if (key.length === 1) eventKey = key.toLowerCase();

    // Get exec chains from pressed/released outputs
    const pressedChain = execChain(ikn.id, 'pressed');
    const releasedChain = execChain(ikn.id, 'released');

    if (pressedChain.length > 0) {
      beginPlayCode += '(function() { var _kd = function(e) { if (e.key === ' + JSON.stringify(eventKey) + ') { ';
      for (const id of pressedChain) beginPlayCode += genNodeCode(id);
      beginPlayCode += '} }; document.addEventListener("keydown", _kd); __inputCleanup.push(function() { document.removeEventListener("keydown", _kd); }); })();\n';
    }
    if (releasedChain.length > 0) {
      beginPlayCode += '(function() { var _ku = function(e) { if (e.key === ' + JSON.stringify(eventKey) + ') { ';
      for (const id of releasedChain) beginPlayCode += genNodeCode(id);
      beginPlayCode += '} }; document.addEventListener("keyup", _ku); __inputCleanup.push(function() { document.removeEventListener("keyup", _ku); }); })();\n';
    }
  }

  // Follow exec chains from BeginPlay events
  for (const bp of beginPlayNodes) {
    const chain = execChain(bp.id, 'exec');
    for (const id of chain) beginPlayCode += genNodeCode(id);
  }

  if (beginPlayCode) out += '// __beginPlay__\n' + beginPlayCode;

  // ── tick ──
  let tickCode = '';
  for (const tn of tickNodes) {
    const chain = execChain(tn.id, 'exec');
    for (const id of chain) tickCode += genNodeCode(id);
  }
  if (tickCode) out += '// __tick__\n' + tickCode;

  // ── onDestroy ──
  let destroyCode = '';
  for (const dn of destroyNodes) {
    const chain = execChain(dn.id, 'exec');
    for (const id of chain) destroyCode += genNodeCode(id);
  }
  if (hasInputNodes) {
    destroyCode += '__inputCleanup.forEach(function(fn) { fn(); }); __inputCleanup = []; __inputKeys = {};\n';
  }
  destroyCode += 'if (gameObject.__pendingDelays) { gameObject.__pendingDelays.forEach(clearTimeout); gameObject.__pendingDelays = []; }\n';
  destroyCode += 'if (gameObject.__retriggerableDelays) { Object.values(gameObject.__retriggerableDelays).forEach(function(id) { clearTimeout(id); }); gameObject.__retriggerableDelays = {}; }\n';
  out += '// __onDestroy__\n' + destroyCode;

  return out;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function findProjectRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(current, 'project.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function listDirRecursive(dirPath: string, baseDir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      results.push(relPath + '/');
      listDirRecursive(fullPath, baseDir, results);
    } else {
      results.push(relPath);
    }
  }
  return results;
}

// ── Asset file finders ───────────────────────────────────────
function findActorFile(actorsDir: string, actorId: string): { filePath: string | null; data: any } {
  if (!fs.existsSync(actorsDir)) return { filePath: null, data: null };
  const files = fs.readdirSync(actorsDir).filter(f => f.endsWith('.json') && f !== '_index.json');
  for (const f of files) {
    const fullPath = path.join(actorsDir, f);
    const data = readJsonFile(fullPath);
    if (data.actorId === actorId) return { filePath: fullPath, data };
  }
  return { filePath: null, data: null };
}

function findAbpFile(abpDir: string, abpId: string): { filePath: string | null; data: any } {
  if (!fs.existsSync(abpDir)) return { filePath: null, data: null };
  const files = fs.readdirSync(abpDir).filter(f => f.endsWith('.json') && f !== '_index.json');
  for (const f of files) {
    const fullPath = path.join(abpDir, f);
    const data = readJsonFile(fullPath);
    if (data.animBlueprintId === abpId) return { filePath: fullPath, data };
  }
  return { filePath: null, data: null };
}

function findAssetFile(dir: string, idField: string, id: string): { filePath: string | null; data: any } {
  if (!fs.existsSync(dir)) return { filePath: null, data: null };
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_index.json');
  for (const f of files) {
    const fullPath = path.join(dir, f);
    const data = readJsonFile(fullPath);
    if (data[idField] === id) return { filePath: fullPath, data };
  }
  return { filePath: null, data: null };
}

function updateIndex(dir: string, idField: string, nameField: string): void {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_index.json');
  const index: any[] = [];
  for (const f of files) {
    const data = readJsonFile(path.join(dir, f));
    if (data[idField]) {
      index.push({ id: data[idField], name: data[nameField], file: f });
    }
  }
  writeJsonFile(path.join(dir, '_index.json'), index);
}

// ── Default configs ──────────────────────────────────────────
function defaultPhysicsConfig(): any {
  return {
    enabled: false, simulatePhysics: false, bodyType: 'Dynamic',
    mass: 1.0, gravityEnabled: true, gravityScale: 1.0,
    linearDamping: 0.0, angularDamping: 0.05, friction: 0.5,
    restitution: 0.3, frictionCombine: 'Average', restitutionCombine: 'Average',
    colliderShape: 'Box', autoFitCollider: true,
    boxHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    sphereRadius: 0.5, capsuleRadius: 0.5, capsuleHalfHeight: 1.0,
    cylinderRadius: 0.5, cylinderHalfHeight: 0.5,
    colliderOffset: { x: 0, y: 0, z: 0 },
    isTrigger: false,
    lockPositionX: false, lockPositionY: false, lockPositionZ: false,
    lockRotationX: false, lockRotationY: false, lockRotationZ: false,
    collisionEnabled: true, collisionChannel: 'WorldDynamic',
    blocksChannels: ['WorldStatic', 'WorldDynamic', 'Pawn', 'PhysicsBody'],
    overlapsChannels: ['Trigger'],
    ccdEnabled: false, generateOverlapEvents: true, generateHitEvents: true,
  };
}

function defaultCharacterMovement2DConfig(preset: string): any {
  if (preset === 'platformer') {
    return {
      groundAccel: 2800, groundDecel: 2000, maxGroundSpeed: 240,
      jumpForce: 180, jumpHoldTime: 0.1, coyoteTime: 0.08,
      airAccel: 1400, gravityScale: 1.0, freezeRotation: true, inputMode: 'platformer',
    };
  }
  if (preset === 'topdown') {
    return {
      moveSpeed: 240, rotateTowardMovement: false,
      gravityScale: 0, freezeRotation: true, inputMode: 'topdown',
    };
  }
  return null;
}

function defaultCamera2DConfig(): any {
  return {
    followSmoothing: 0.1, followDeadZone: { x: 0.5, y: 0.5 },
    followBounds: null, zoom: 1.0, pixelPerfect: false,
  };
}

function defaultEventGraph(): any {
  return {
    nodes: [
      { id: nodeUid(), type: 'EventBeginPlayNode', position: { x: 80, y: 40 }, data: {} },
      { id: nodeUid(), type: 'EventTickNode', position: { x: 80, y: 220 }, data: {} },
    ],
    connections: [],
  };
}

// ── Widget Node defaults (mirrors engine WidgetBlueprintData.ts) ──

function makeDefaultSlot(): any {
  return {
    anchor: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    offsetX: 0, offsetY: 0,
    sizeX: 200, sizeY: 50,
    alignment: { x: 0, y: 0 },
    autoSize: false,
    zOrder: 0,
    padding: { left: 0, top: 0, right: 0, bottom: 0 },
    fillWeight: 1,
    sizeMode: 'Auto',
  };
}

function makeDefaultWidgetNode(id: string, type: string, name: string): any {
  const node: any = {
    id, type, name,
    slot: makeDefaultSlot(),
    visibility: 'Visible',
    renderOpacity: 1,
    isEnabled: true,
    toolTip: '',
    renderTranslation: { x: 0, y: 0 },
    renderScale: { x: 1, y: 1 },
    renderAngle: 0,
    renderPivot: { x: 0.5, y: 0.5 },
    children: [],
  };

  // Apply type-specific defaults
  switch (type) {
    case 'Text':
    case 'RichText':
      node.textProps = {
        text: type === 'RichText' ? '<b>Rich</b> Text' : 'Text Block',
        fontSize: 16, fontFamily: 'Arial, sans-serif', color: '#ffffff',
        justification: 'Left', isBold: false, isItalic: false,
        shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: type === 'RichText',
      };
      node.slot.sizeX = type === 'RichText' ? 200 : 150;
      node.slot.sizeY = type === 'RichText' ? 50 : 30;
      if (type === 'Text') node.slot.autoSize = true;
      break;
    case 'Image':
      node.imageProps = { imageSource: '', tintColor: '#ffffff', stretch: 'ScaleToFit' };
      node.slot.sizeX = 100; node.slot.sizeY = 100;
      break;
    case 'Button':
      node.buttonProps = {
        normalColor: '#2a5db0', hoveredColor: '#3a6dc0',
        pressedColor: '#1a4da0', disabledColor: '#555555',
        borderRadius: 4, borderWidth: 0, borderColor: '#ffffff',
      };
      node.slot.sizeX = 120; node.slot.sizeY = 40;
      break;
    case 'ProgressBar':
      node.progressBarProps = {
        percent: 0.5, fillColor: '#2a9d8f', backgroundColor: '#333333',
        borderRadius: 2, fillDirection: 'LeftToRight',
      };
      node.slot.sizeX = 200; node.slot.sizeY = 20;
      break;
    case 'Slider':
      node.sliderProps = {
        value: 0.5, minValue: 0, maxValue: 1, stepSize: 0,
        trackColor: '#333333', fillColor: '#2a9d8f', handleColor: '#ffffff',
        orientation: 'Horizontal',
      };
      node.slot.sizeX = 200; node.slot.sizeY = 20;
      break;
    case 'TextBox':
      node.textBoxProps = {
        text: '', hintText: 'Enter text...', fontSize: 14,
        color: '#ffffff', backgroundColor: '#1a1a2e',
        borderColor: '#555555', isReadOnly: false, isMultiline: false,
      };
      node.slot.sizeX = 200; node.slot.sizeY = 32;
      break;
    case 'CheckBox':
      node.checkBoxProps = {
        isChecked: false, checkedColor: '#2a9d8f',
        uncheckedColor: '#666666', checkSize: 20,
      };
      node.slot.sizeX = 24; node.slot.sizeY = 24;
      break;
    case 'ComboBox':
      node.comboBoxProps = {
        options: ['Option 1', 'Option 2'], selectedIndex: 0,
        fontSize: 14, backgroundColor: '#1a1a2e', color: '#ffffff',
      };
      node.slot.sizeX = 200; node.slot.sizeY = 32;
      break;
    case 'Border':
      node.borderProps = {
        backgroundColor: '#333333', borderColor: '#555555',
        borderWidth: 1, borderRadius: 0,
      };
      node.slot.sizeX = 200; node.slot.sizeY = 100;
      break;
    case 'ScrollBox':
      node.scrollBoxProps = { orientation: 'Vertical', showScrollbar: true, scrollbarThickness: 8 };
      node.slot.sizeX = 300; node.slot.sizeY = 200;
      break;
    case 'GridPanel':
      node.gridPanelProps = { rows: 2, columns: 2, rowFill: [1, 1], columnFill: [1, 1] };
      node.slot.sizeX = 300; node.slot.sizeY = 200;
      break;
    case 'Spacer':
      node.spacerProps = { size: { x: 10, y: 10 } };
      node.slot.sizeX = 10; node.slot.sizeY = 10;
      break;
    case 'CircularThrobber':
      node.slot.sizeX = 32; node.slot.sizeY = 32;
      break;
    // Container types with no extra props: CanvasPanel, VerticalBox, HorizontalBox, Overlay, WrapBox, SizeBox, ScaleBox, WidgetSwitcher, NamedSlot
    default:
      break;
  }
  return node;
}

// ── 3D Character Pawn defaults (mirrors editor ActorAsset.ts) ──

function defaultCapsuleConfig(): any {
  return {
    radius: 0.35, height: 1.8,
    showInEditor: true, showInPlay: false,
    collisionProfile: {
      objectType: 'Pawn',
      collisionEnabled: true,
      collisionGroups: 0x0002,
      collisionMask: 0xFFFF,
    },
  };
}

function defaultCharacterMovementConfig(): any {
  return {
    walkSpeed: 6, runSpeed: 10, crouchSpeed: 3,
    jumpVelocity: 8, airControl: 0.2, groundFriction: 8.0,
    brakingDeceleration: 20, gravity: -20,
    maxStepHeight: 0.3, maxSlopeAngle: 45,
    canWalk: true, canRun: true, canJump: true, canCrouch: true,
    canSwim: false, canFly: false, flySpeed: 8, swimSpeed: 4,
  };
}

function defaultCameraConfig(mode: string = 'firstPerson'): any {
  return {
    cameraMode: mode, fieldOfView: 75,
    offset: mode === 'firstPerson' ? { x: 0, y: 0.8, z: 0 } : { x: 0, y: 1.0, z: 0 },
    nearClip: 0.1, farClip: 1000, postProcessEnabled: false,
    mouseSensitivity: 0.15, pitchMin: -89, pitchMax: 89,
  };
}

function defaultSpringArmConfig(): any {
  return {
    targetOffset: { x: 0, y: 0.9, z: 0 }, socketOffset: { x: 0, y: 0, z: 0 },
    armLength: 4.0, doCollisionTest: true, probeSize: 0.12,
    collisionProfile: { objectType: 'Camera', collisionEnabled: true, collisionGroups: 0x0040, collisionMask: 0xFFFF },
    enableCameraLag: false, cameraLagSpeed: 10,
    enableCameraRotationLag: false, cameraRotationLagSpeed: 10,
    inheritPitch: true, inheritYaw: true, inheritRoll: false,
  };
}

function defaultInputBindings(): any {
  return {
    moveForward: 'W', moveBackward: 'S', moveLeft: 'A', moveRight: 'D',
    jump: 'Space', crouch: 'ControlLeft', run: 'ShiftLeft', mouseLook: true,
  };
}

function defaultRotationConfig(): any {
  return {
    useControllerRotationPitch: false, useControllerRotationYaw: false, useControllerRotationRoll: false,
    orientRotationToMovement: true, rotationRate: 540,
  };
}

function defaultCameraModeSettings(): any {
  return { defaultMode: 'thirdPerson', allowModeSwitching: false };
}

function defaultTopDownCameraConfig(): any {
  return {
    cameraHeight: 15, zoomMin: 5, zoomMax: 50, zoomSpeed: 2,
    edgeScrollSpeed: 15, edgeScrollMargin: 20, cameraAngle: 0, panSpeed: 10, clickToMove: false,
  };
}

function defaultCharacterPawnConfig(): any {
  return {
    capsule: defaultCapsuleConfig(),
    movement: defaultCharacterMovementConfig(),
    camera: defaultCameraConfig('thirdPerson'),
    springArm: defaultSpringArmConfig(),
    inputBindings: defaultInputBindings(),
    rotation: defaultRotationConfig(),
    cameraSettings: defaultCameraModeSettings(),
    topDownCamera: defaultTopDownCameraConfig(),
    useBuiltInMovement: false,
    defaultMovementMode: 'walking',
  };
}

// ── 3D Character Pawn event graph template (WASD + Jump) ──

function characterPawn3DEventGraph(): any {
  return {
    nodeData: {
      nodes: [
        { id: 'def_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 }, data: {} },
        { id: 'def_tick', type: 'EventTickNode', position: { x: 80, y: 220 }, data: {} },
        { id: 'def_move', type: 'AddMovementInputNode', position: { x: 520, y: 220 }, data: {} },
        { id: 'def_axis_lr', type: 'InputAxisNode', position: { x: 200, y: 400 }, data: { positiveKey: 'D', negativeKey: 'A' } },
        { id: 'def_axis_fb', type: 'InputAxisNode', position: { x: 200, y: 530 }, data: { positiveKey: 'W', negativeKey: 'S' } },
        { id: 'def_jump_key', type: 'InputKeyEventNode', position: { x: 80, y: 700 }, data: { selectedKey: 'Space' } },
        { id: 'def_jump', type: 'JumpNode', position: { x: 460, y: 680 }, data: {} },
        { id: 'def_stopjump', type: 'StopJumpingNode', position: { x: 460, y: 780 }, data: {} },
      ],
      connections: [
        { id: 'c1', source: 'def_tick', sourceOutput: 'exec', target: 'def_move', targetInput: 'exec' },
        { id: 'c2', source: 'def_axis_lr', sourceOutput: 'value', target: 'def_move', targetInput: 'x' },
        { id: 'c3', source: 'def_axis_fb', sourceOutput: 'value', target: 'def_move', targetInput: 'z' },
        { id: 'c4', source: 'def_jump_key', sourceOutput: 'pressed', target: 'def_jump', targetInput: 'exec' },
        { id: 'c5', source: 'def_jump_key', sourceOutput: 'released', target: 'def_stopjump', targetInput: 'exec' },
      ],
    },
  };
}

// ── 2D Platformer event graph template (A/D + Space jump + sprite flip) ──

function platformer2DEventGraph(): any {
  return {
    nodeData: {
      nodes: [
        { id: 'p_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 }, data: {} },
        { id: 'p_tick', type: 'EventTickNode', position: { x: 80, y: 220 }, data: {} },
        { id: 'p_move', type: 'AddMovementInput2DNode', position: { x: 520, y: 220 }, data: {} },
        { id: 'p_axis_lr', type: 'InputAxisNode', position: { x: 200, y: 400 }, data: { positiveKey: 'D', negativeKey: 'A' } },
        { id: 'p_jump_key', type: 'InputKeyEventNode', position: { x: 80, y: 560 }, data: { selectedKey: 'Space' } },
        { id: 'p_jump', type: 'Jump2DNode', position: { x: 460, y: 540 }, data: {} },
        { id: 'p_stopjump', type: 'StopJump2DNode', position: { x: 460, y: 640 }, data: {} },
        { id: 'p_flip', type: 'FlipSpriteDirection2DNode', position: { x: 820, y: 220 }, data: {} },
      ],
      connections: [
        { id: 'pc1', source: 'p_tick', sourceOutput: 'exec', target: 'p_move', targetInput: 'exec' },
        { id: 'pc2', source: 'p_move', sourceOutput: 'exec', target: 'p_flip', targetInput: 'exec' },
        { id: 'pc3', source: 'p_axis_lr', sourceOutput: 'value', target: 'p_move', targetInput: 'x' },
        { id: 'pc4', source: 'p_jump_key', sourceOutput: 'pressed', target: 'p_jump', targetInput: 'exec' },
        { id: 'pc5', source: 'p_jump_key', sourceOutput: 'released', target: 'p_stopjump', targetInput: 'exec' },
      ],
    },
  };
}

// ── 2D Top-Down event graph template (WASD 4-directional, no jump) ──

function topDown2DEventGraph(): any {
  return {
    nodeData: {
      nodes: [
        { id: 'td_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 }, data: {} },
        { id: 'td_tick', type: 'EventTickNode', position: { x: 80, y: 220 }, data: {} },
        { id: 'td_move', type: 'AddMovementInput2DNode', position: { x: 520, y: 220 }, data: {} },
        { id: 'td_axis_lr', type: 'InputAxisNode', position: { x: 200, y: 400 }, data: { positiveKey: 'D', negativeKey: 'A' } },
        { id: 'td_axis_ud', type: 'InputAxisNode', position: { x: 200, y: 530 }, data: { positiveKey: 'W', negativeKey: 'S' } },
      ],
      connections: [
        { id: 'tc1', source: 'td_tick', sourceOutput: 'exec', target: 'td_move', targetInput: 'exec' },
        { id: 'tc2', source: 'td_axis_lr', sourceOutput: 'value', target: 'td_move', targetInput: 'x' },
        { id: 'tc3', source: 'td_axis_ud', sourceOutput: 'value', target: 'td_move', targetInput: 'y' },
      ],
    },
  };
}

// ── 2D event graph picker by preset ──

function eventGraph2DForPreset(preset: string): any {
  if (preset === 'platformer') return platformer2DEventGraph();
  if (preset === 'topdown') return topDown2DEventGraph();
  return defaultEventGraph();
}

// ============================================================
//  MCP Server
// ============================================================
function createServer(): McpServer {
const _server = new McpServer({
  name: 'feather-engine',
  version: '2.0.0',
});

// Wrap server.tool to auto-broadcast tool-completed events to the engine
const server = {
  tool: (name: string, ...rest: any[]) => {
    // The handler is always the last argument
    const handler = rest[rest.length - 1];
    rest[rest.length - 1] = async (...handlerArgs: any[]) => {
      const result = await handler(...handlerArgs);
      broadcastChange({ type: 'tool-completed', toolName: name });
      return result;
    };
    return (_server as any).tool(name, ...rest);
  },
  connect: (t: any) => _server.connect(t),
};

// ============================================================
//  1. PROJECT MANAGEMENT
// ============================================================

server.tool(
  'list_project_contents',
  'List all files and folders in the Feather Engine project. Use to browse the project structure.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder (must contain project.json)'),
    subfolder: z.string().optional().describe('Optional subfolder to list (e.g. "Textures", "Actors", "Scenes")'),
  },
  async ({ projectPath, subfolder }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const targetDir = subfolder ? path.join(projRoot, subfolder) : projRoot;
    if (!fs.existsSync(targetDir)) {
      return { content: [{ type: 'text', text: `Directory not found: ${targetDir}` }] };
    }
    const files = listDirRecursive(targetDir, targetDir);
    const projectJson = fs.existsSync(path.join(projRoot, 'project.json'))
      ? readJsonFile(path.join(projRoot, 'project.json')) : null;
    let result = `Project: ${projectJson?.name || 'Unknown'}\nPath: ${projRoot}\nListing: ${subfolder || '/'}\n\n`;
    result += files.join('\n');
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'read_project_file',
  'Read the contents of any file in the project. Works with JSON assets, scenes, configs.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    filePath: z.string().describe('Relative path within the project to the file to read'),
  },
  async ({ projectPath, filePath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const fullPath = path.join(projRoot, filePath);
    if (!fs.existsSync(fullPath)) {
      return { content: [{ type: 'text', text: `File not found: ${filePath}` }] };
    }
    const ext = path.extname(fullPath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)) {
      const data = fs.readFileSync(fullPath);
      const base64 = data.toString('base64');
      const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      return { content: [
        { type: 'text', text: `Binary image file: ${filePath} (${data.length} bytes)` },
        { type: 'image', data: base64, mimeType },
      ]};
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'write_project_file',
  'Write or overwrite a text file in the project. Use for JSON configs, scripts, etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    filePath: z.string().describe('Relative path within the project'),
    content: z.string().describe('File content to write'),
  },
  async ({ projectPath, filePath, content }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const fullPath = path.join(projRoot, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    // Broadcast change for real-time updates
    const normP = fullPath.replace(/\\\\/g, '/');
    const fm = normP.match(/\/(Actors|Scenes|Sprites|SpriteSheets|AnimBlueprints|Structures|Enums|Widgets|GameInstances|SaveGameClasses|DataTables|Config|Textures|Fonts|InputMappings|Events)\//i);
    if (fm) broadcastChange({ type: 'asset-changed', assetType: fm[1].toLowerCase(), name: path.basename(fullPath), path: fullPath });
    return { content: [{ type: 'text', text: `Written: ${filePath} (${content.length} bytes)` }] };
  }
);

server.tool(
  'get_project_info',
  'Get project metadata including name, active scene, engine version, and game instance class.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const projJsonPath = path.join(projRoot, 'project.json');
    if (!fs.existsSync(projJsonPath)) {
      return { content: [{ type: 'text', text: 'No project.json found. Not a Feather Engine project.' }] };
    }
    const proj = readJsonFile(projJsonPath);
    let result = `Project: ${proj.name}\n`;
    result += `Path: ${projRoot}\n`;
    result += `Active Scene: ${proj.activeScene || 'N/A'}\n`;
    result += `Engine Version: ${proj.engineVersion || '0.1.0'}\n`;
    result += `Game Instance Class: ${proj.gameInstanceClassId || '(None)'}\n`;
    // List all asset counts
    const dirs = ['Actors', 'Scenes', 'Textures', 'Sprites', 'AnimBlueprints', 'Widgets', 'Structures', 'Enums', 'GameInstances', 'SaveGameClasses', 'DataTables', 'Meshes', 'Fonts'];
    result += `\nAsset Counts:\n`;
    for (const d of dirs) {
      const dp = path.join(projRoot, d);
      if (fs.existsSync(dp)) {
        const count = fs.readdirSync(dp).filter(f => f.endsWith('.json') && f !== '_index.json').length;
        result += `  ${d}: ${count}\n`;
      }
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

// ============================================================
//  2. SCENE MANAGEMENT
// ============================================================

server.tool(
  'list_scenes',
  'List all scenes in the project with their mode (2D/3D) and object count.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenesDir = path.join(projRoot, 'Scenes');
    if (!fs.existsSync(scenesDir)) {
      return { content: [{ type: 'text', text: 'No Scenes folder found.' }] };
    }
    const files = fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'));
    let result = `Scenes (${files.length}):\n`;
    for (const f of files) {
      const scene = readJsonFile(path.join(scenesDir, f));
      const objCount = (scene.gameObjects || []).length;
      result += `  ${scene.name || f} — ${scene.sceneMode || '3D'} mode, ${objCount} objects\n`;
    }
    const projJsonPath = path.join(projRoot, 'project.json');
    if (fs.existsSync(projJsonPath)) {
      const proj = readJsonFile(projJsonPath);
      result += `\nActive scene: ${proj.activeScene || 'N/A'}`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_scene',
  'Create a new scene, either 2D or 3D. 2D scenes include physics, camera, and sorting layers.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Name for the scene'),
    sceneMode: z.enum(['2D', '3D']).optional().describe('Scene mode (default: "3D")'),
    setAsActive: z.boolean().optional().describe('Set this scene as the active/default scene'),
  },
  async ({ projectPath, sceneName, sceneMode, setAsActive }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenesDir = path.join(projRoot, 'Scenes');
    const sceneJson: any = {
      schemaVersion: 1, name: sceneName, gameObjects: [],
      camera: { position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } },
      sceneMode: sceneMode || '3D',
    };
    if (sceneMode === '2D') {
      sceneJson.scene2DConfig = {
        sceneMode: '2D',
        renderSettings: {
          cameraType: 'orthographic', pixelsPerUnit: 100,
          referenceResolution: { width: 1920, height: 1080 },
          backgroundColor: '#1a1a2e',
        },
        worldSettings: { gravity: { x: 0, y: -9.81 }, physicsMode: '2D', pixelsPerUnit: 100 },
        sortingLayers: [
          { id: 'default', name: 'Default', order: 0 },
          { id: 'background', name: 'Background', order: -10 },
          { id: 'foreground', name: 'Foreground', order: 10 },
        ],
        spriteSheets: [],
        tilesets: [],
        tilemaps: [],
      };
    }
    writeJsonFile(path.join(scenesDir, `${sceneName}.json`), sceneJson);
    if (setAsActive) {
      const projJsonPath = path.join(projRoot, 'project.json');
      if (fs.existsSync(projJsonPath)) {
        const proj = readJsonFile(projJsonPath);
        proj.activeScene = sceneName;
        writeJsonFile(projJsonPath, proj);
      }
    }
    return { content: [{ type: 'text', text: `Created ${sceneMode || '3D'} scene "${sceneName}"\nFile: Scenes/${sceneName}.json` }] };
  }
);

server.tool(
  'get_scene_details',
  'Get full details of a scene including all game objects, their transforms, and configurations.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json extension)'),
  },
  async ({ projectPath, sceneName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', `${sceneName}.json`);
    if (!fs.existsSync(scenePath)) {
      return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    }
    const scene = readJsonFile(scenePath);
    let result = `Scene: ${scene.name}\nMode: ${scene.sceneMode || '3D'}\n`;
    result += `Camera: pos(${scene.camera?.position?.x ?? 0}, ${scene.camera?.position?.y ?? 0}, ${scene.camera?.position?.z ?? 0})\n\n`;
    result += `Game Objects (${(scene.gameObjects || []).length}):\n`;
    for (const go of (scene.gameObjects || [])) {
      result += `  - ${go.name} [${go.meshType}]`;
      if (go.actorAssetId) result += ` (asset: ${go.actorAssetId})`;
      if (go.actorType) result += ` type: ${go.actorType}`;
      result += `\n    pos(${go.position?.x ?? 0}, ${go.position?.y ?? 0}, ${go.position?.z ?? 0})`;
      result += ` rot(${go.rotation?.x ?? 0}, ${go.rotation?.y ?? 0}, ${go.rotation?.z ?? 0})`;
      result += ` scale(${go.scale?.x ?? 1}, ${go.scale?.y ?? 1}, ${go.scale?.z ?? 1})\n`;
    }
    if (scene.scene2DConfig) {
      result += `\n2D Config:\n`;
      result += `  Gravity: (${scene.scene2DConfig.worldSettings?.gravity?.x ?? 0}, ${scene.scene2DConfig.worldSettings?.gravity?.y ?? -9.81})\n`;
      result += `  Sorting Layers: ${(scene.scene2DConfig.sortingLayers || []).map((l: any) => l.name).join(', ')}\n`;
      result += `  Sprite Sheets: ${(scene.scene2DConfig.spriteSheets || []).length}\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'add_actor_to_scene',
  'Place an actor asset instance in a scene at a specific position.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json extension)'),
    actorId: z.string().describe('ID of the actor asset to place'),
    name: z.string().optional().describe('Instance name in the scene'),
    positionX: z.number().optional().describe('X position (default: 0)'),
    positionY: z.number().optional().describe('Y position (default: 0)'),
    positionZ: z.number().optional().describe('Z position (default: 0)'),
    scaleX: z.number().optional().describe('X scale (default: 1)'),
    scaleY: z.number().optional().describe('Y scale (default: 1)'),
    scaleZ: z.number().optional().describe('Z scale (default: 1)'),
  },
  async ({ projectPath, sceneName, actorId, name, positionX, positionY, positionZ, scaleX, scaleY, scaleZ }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', `${sceneName}.json`);
    if (!fs.existsSync(scenePath)) {
      return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    }
    const actorsDir = path.join(projRoot, 'Actors');
    const { data: actor } = findActorFile(actorsDir, actorId);
    const actorName = actor?.actorName || 'Actor';
    const scene = readJsonFile(scenePath);
    scene.gameObjects = scene.gameObjects || [];
    scene.gameObjects.push({
      name: name || actorName,
      meshType: actor?.rootMeshType || 'none',
      position: { x: positionX ?? 0, y: positionY ?? 0, z: positionZ ?? 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: scaleX ?? 1, y: scaleY ?? 1, z: scaleZ ?? 1 },
      hasPhysics: false,
      actorAssetId: actorId,
      actorType: actor?.actorType || 'actor',
    });
    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: `Added "${name || actorName}" to scene "${sceneName}" at (${positionX ?? 0}, ${positionY ?? 0}, ${positionZ ?? 0})` }] };
  }
);

server.tool(
  'remove_object_from_scene',
  'Remove a game object from a scene by name or index.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json extension)'),
    objectName: z.string().optional().describe('Name of the object to remove'),
    objectIndex: z.number().optional().describe('Index of the object to remove (0-based)'),
  },
  async ({ projectPath, sceneName, objectName, objectIndex }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', `${sceneName}.json`);
    if (!fs.existsSync(scenePath)) {
      return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    }
    const scene = readJsonFile(scenePath);
    scene.gameObjects = scene.gameObjects || [];
    let removed: string;
    if (objectIndex !== undefined) {
      if (objectIndex < 0 || objectIndex >= scene.gameObjects.length) {
        return { content: [{ type: 'text', text: `Index ${objectIndex} out of range (0-${scene.gameObjects.length - 1})` }] };
      }
      removed = scene.gameObjects[objectIndex].name;
      scene.gameObjects.splice(objectIndex, 1);
    } else if (objectName) {
      const idx = scene.gameObjects.findIndex((o: any) => o.name === objectName);
      if (idx === -1) {
        return { content: [{ type: 'text', text: `Object "${objectName}" not found in scene "${sceneName}"` }] };
      }
      removed = scene.gameObjects[idx].name;
      scene.gameObjects.splice(idx, 1);
    } else {
      return { content: [{ type: 'text', text: 'Specify either objectName or objectIndex.' }] };
    }
    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: `Removed "${removed}" from scene "${sceneName}". ${scene.gameObjects.length} objects remaining.` }] };
  }
);

server.tool(
  'modify_scene_object',
  'Modify the transform (position/rotation/scale) or properties of an object already placed in a scene.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name'),
    objectName: z.string().describe('Name of the object in the scene'),
    positionX: z.number().optional(), positionY: z.number().optional(), positionZ: z.number().optional(),
    rotationX: z.number().optional(), rotationY: z.number().optional(), rotationZ: z.number().optional(),
    scaleX: z.number().optional(), scaleY: z.number().optional(), scaleZ: z.number().optional(),
    newName: z.string().optional().describe('Rename the object'),
  },
  async ({ projectPath, sceneName, objectName, positionX, positionY, positionZ, rotationX, rotationY, rotationZ, scaleX, scaleY, scaleZ, newName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', `${sceneName}.json`);
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    const scene = readJsonFile(scenePath);
    const obj = (scene.gameObjects || []).find((o: any) => o.name === objectName);
    if (!obj) return { content: [{ type: 'text', text: `Object "${objectName}" not found.` }] };
    if (positionX !== undefined) obj.position.x = positionX;
    if (positionY !== undefined) obj.position.y = positionY;
    if (positionZ !== undefined) obj.position.z = positionZ;
    if (rotationX !== undefined) obj.rotation.x = rotationX;
    if (rotationY !== undefined) obj.rotation.y = rotationY;
    if (rotationZ !== undefined) obj.rotation.z = rotationZ;
    if (scaleX !== undefined) obj.scale.x = scaleX;
    if (scaleY !== undefined) obj.scale.y = scaleY;
    if (scaleZ !== undefined) obj.scale.z = scaleZ;
    if (newName) obj.name = newName;
    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: `Updated "${objectName}" in scene "${sceneName}".` }] };
  }
);

// ============================================================
//  3. TEXTURE MANAGEMENT
// ============================================================

server.tool(
  'list_textures',
  'List all texture/image files in the project Textures folder.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const texDir = path.join(projRoot, 'Textures');
    if (!fs.existsSync(texDir)) return { content: [{ type: 'text', text: 'No Textures folder found.' }] };
    const files = fs.readdirSync(texDir).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext);
    });
    let result = `Textures (${files.length}):\n`;
    for (const f of files) {
      const stat = fs.statSync(path.join(texDir, f));
      result += `  ${f} (${(stat.size / 1024).toFixed(1)} KB)\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'import_texture',
  'Copy a texture/image into the project Textures folder for use in sprites, materials, etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sourcePath: z.string().describe('Absolute path to the source image file'),
    targetName: z.string().optional().describe('New filename (defaults to source filename)'),
  },
  async ({ projectPath, sourcePath, targetName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const texDir = path.join(projRoot, 'Textures');
    if (!fs.existsSync(sourcePath)) return { content: [{ type: 'text', text: `Source not found: ${sourcePath}` }] };
    if (!fs.existsSync(texDir)) fs.mkdirSync(texDir, { recursive: true });
    const fileName = targetName || path.basename(sourcePath);
    const targetPath = path.join(texDir, fileName);
    fs.copyFileSync(sourcePath, targetPath);
    const stat = fs.statSync(targetPath);
    return { content: [{ type: 'text', text: `Imported texture "${fileName}" (${(stat.size / 1024).toFixed(1)} KB)\nPath: Textures/${fileName}` }] };
  }
);

server.tool(
  'view_texture',
  'View a texture file from the project as an image. Useful for AI to analyze sprite sheets and textures.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    textureFile: z.string().describe('Filename in Textures folder (e.g. "player.png")'),
  },
  async ({ projectPath, textureFile }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const texPath = path.join(projRoot, 'Textures', textureFile);
    if (!fs.existsSync(texPath)) return { content: [{ type: 'text', text: `Texture not found: ${textureFile}` }] };
    const data = fs.readFileSync(texPath);
    const ext = path.extname(textureFile).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    return { content: [
      { type: 'text', text: `Texture: ${textureFile} (${data.length} bytes, ${mimeType})` },
      { type: 'image', data: data.toString('base64'), mimeType },
    ]};
  }
);

// ============================================================
//  4. ACTOR / BLUEPRINT MANAGEMENT
// ============================================================

server.tool(
  'list_actors',
  'List all actor assets in the project with types, names, and IDs.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    if (!fs.existsSync(actorsDir)) return { content: [{ type: 'text', text: 'No Actors folder found.' }] };
    const files = fs.readdirSync(actorsDir).filter(f => f.endsWith('.json') && f !== '_index.json');
    let result = `Actor Assets (${files.length}):\n`;
    for (const f of files) {
      const asset = readJsonFile(path.join(actorsDir, f));
      result += `  [${asset.actorType || 'actor'}] ${asset.actorName} (ID: ${asset.actorId})\n`;
      if (asset.components?.length) {
        result += `    Components: ${asset.components.map((c: any) => c.name).join(', ')}\n`;
      }
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'get_actor_details',
  'Get detailed info about an actor: components, variables, physics, controller, blueprint data.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor asset'),
  },
  async ({ projectPath, actorId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { data: actor } = findActorFile(path.join(projRoot, 'Actors'), actorId);
    if (!actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    let result = `Actor: ${actor.actorName}\nID: ${actor.actorId}\nType: ${actor.actorType || 'actor'}\n`;
    result += `Root Mesh: ${actor.rootMeshType}\nController: ${actor.controllerClass || 'None'}\n`;
    result += `\nComponents (${(actor.components || []).length}):\n`;
    for (const comp of (actor.components || [])) {
      result += `  - ${comp.name} [${comp.type}] (ID: ${comp.id})\n`;
      if (comp.spriteSheetId) result += `    Sprite Sheet: ${comp.spriteSheetId}\n`;
      if (comp.animBlueprint2dId) result += `    Anim Blueprint 2D: ${comp.animBlueprint2dId}\n`;
      if (comp.collider2dSize) result += `    Collider: ${comp.collider2dSize.width}x${comp.collider2dSize.height}\n`;
      if (comp.camera2dConfig) result += `    Camera2D: zoom=${comp.camera2dConfig.zoom}\n`;
    }
    result += `\nVariables (${(actor.variables || []).length}):\n`;
    for (const v of (actor.variables || [])) {
      result += `  - ${v.name} (${v.type}) = ${JSON.stringify(v.defaultValue)}\n`;
    }
    if (actor.characterMovement2DConfig) {
      result += `\nCharacterMovement2D Config:\n${JSON.stringify(actor.characterMovement2DConfig, null, 2)}\n`;
    }
    if (actor.eventGraphData) {
      const nodes = actor.eventGraphData.nodes || [];
      const conns = actor.eventGraphData.connections || [];
      result += `\nEvent Graph: ${nodes.length} nodes, ${conns.length} connections\n`;
      for (const n of nodes) result += `  - ${n.type} (${n.id})\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_actor',
  'Create a new actor asset. Types: actor, spriteActor, tilemapActor, parallaxLayer, characterPawn, playerController, aiController. For 2D characters use create_character_pawn_2d.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Name for the actor'),
    actorType: z.enum(['actor', 'spriteActor', 'tilemapActor', 'parallaxLayer', 'characterPawn', 'playerController', 'aiController']).describe('Type of actor'),
    rootMeshType: z.enum(['cube', 'sphere', 'cylinder', 'plane', 'none']).optional().describe('Root mesh type'),
    description: z.string().optional().describe('Description of this actor'),
  },
  async ({ projectPath, name, actorType, rootMeshType, description }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const actorId = assetUid();
    const now = Date.now();
    const ts = now.toString(36);
    const actorJson: any = {
      actorId, actorName: name, actorType,
      description: description || '',
      rootMeshType: rootMeshType || (actorType === 'actor' ? 'cube' : 'none'),
      rootPhysics: defaultPhysicsConfig(), components: [],
      variables: [], functions: [], macros: [], customEvents: [], structs: [],
      eventGraphData: defaultEventGraph(), functionGraphData: {},
      compiledCode: '',
      controllerClass: actorType === 'playerController' ? 'PlayerController' : actorType === 'aiController' ? 'AIController' : 'None',
      createdAt: now, modifiedAt: now,
    };
    if (actorType === 'spriteActor') {
      actorJson.components.push({
        id: compUid(), type: 'spriteRenderer', meshType: 'cube',
        name: 'SpriteRenderer',
        offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
      });
      actorJson.sceneMode = '2D';
    }
    // ── 3D Character Pawn: full setup matching the editor ──
    if (actorType === 'characterPawn') {
      const capsuleId = 'comp_cap_' + ts;
      const springArmId = 'comp_sa_' + ts;
      const cameraId = 'comp_cam_' + ts;
      const moveId = 'comp_move_' + ts;
      actorJson.controllerClass = 'PlayerController';
      actorJson.characterPawnConfig = defaultCharacterPawnConfig();
      actorJson.components = [
        { id: capsuleId, type: 'capsule', meshType: 'cube', name: 'CapsuleComponent',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        { id: springArmId, type: 'springArm', meshType: 'cube', name: 'SpringArm',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          springArm: defaultSpringArmConfig(), parentId: capsuleId },
        { id: cameraId, type: 'camera', meshType: 'cube', name: 'Camera',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          camera: defaultCameraConfig('thirdPerson'), parentId: springArmId },
        { id: moveId, type: 'characterMovement', meshType: 'cube', name: 'CharacterMovement',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      ];
      actorJson.eventGraphData = characterPawn3DEventGraph();
    }
    const fileName = `${safeName(name)}_${actorId}.json`;
    writeJsonFile(path.join(actorsDir, fileName), actorJson);
    updateIndex(actorsDir, 'actorId', 'actorName');
    return { content: [{ type: 'text', text: `Created ${actorType} "${name}" (ID: ${actorId})\nFile: Actors/${fileName}` }] };
  }
);

server.tool(
  'create_character_pawn_2d',
  'Create a 2D character pawn with sprite renderer, physics, movement, and camera components. Use for playable 2D characters.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Character name (e.g. "PlayerCharacter")'),
    preset: z.enum(['platformer', 'topdown', 'blank']).describe('Movement preset'),
    spriteSheetId: z.string().optional().describe('Sprite sheet ID to assign'),
    animBlueprint2dId: z.string().optional().describe('2D animation blueprint ID to wire'),
    colliderWidth: z.number().optional().describe('Collider width (default: 0.8)'),
    colliderHeight: z.number().optional().describe('Collider height (default: 1.0)'),
  },
  async ({ projectPath, name, preset, spriteSheetId, animBlueprint2dId, colliderWidth, colliderHeight }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const actorId = assetUid();
    const now = Date.now();
    const ts = now.toString(36);
    const components = [
      { id: `comp_sprite_${ts}`, type: 'spriteRenderer', meshType: 'cube', name: 'SpriteRenderer',
        offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
        spriteSheetId: spriteSheetId || undefined, animBlueprint2dId: animBlueprint2dId || undefined },
      { id: `comp_rb2d_${ts}`, type: 'rigidbody2d', meshType: 'cube', name: 'RigidBody2D',
        offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
        rigidbody2dType: 'dynamic' },
      { id: `comp_col2d_${ts}`, type: 'collider2d', meshType: 'cube', name: 'BoxCollider2D',
        offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
        collider2dShape: 'box', collider2dSize: { width: colliderWidth ?? 0.8, height: colliderHeight ?? 1.0 } },
      { id: `comp_cm2d_${ts}`, type: 'characterMovement2d', meshType: 'cube', name: 'CharacterMovement2D',
        offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      { id: compUid(), type: 'camera2d', meshType: 'cube', name: 'Camera2D',
        offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
        hiddenInGame: true, camera2dConfig: defaultCamera2DConfig() },
    ];
    const actorJson: any = {
      actorId, actorName: name, actorType: 'characterPawn2D',
      description: `2D Character Pawn — ${preset} preset`,
      rootMeshType: 'none', rootPhysics: defaultPhysicsConfig(),
      components, variables: [], functions: [], macros: [], customEvents: [], structs: [],
      eventGraphData: eventGraph2DForPreset(preset), functionGraphData: {},
      compiledCode: '',
      characterMovement2DConfig: defaultCharacterMovement2DConfig(preset),
      controllerClass: 'None', sceneMode: '2D',
      createdAt: now, modifiedAt: now,
    };
    const fileName = `${safeName(name)}_${actorId}.json`;
    writeJsonFile(path.join(actorsDir, fileName), actorJson);
    updateIndex(actorsDir, 'actorId', 'actorName');
    return { content: [{ type: 'text', text:
      `Created 2D Character Pawn "${name}" (ID: ${actorId})\nPreset: ${preset}\n` +
      `Components: SpriteRenderer, RigidBody2D, BoxCollider2D, CharacterMovement2D, Camera2D\n` +
      `Event Graph: ${preset} template (movement + ${preset === 'platformer' ? 'jump + sprite flip' : '4-directional WASD'})\n` +
      (spriteSheetId ? `Sprite Sheet: ${spriteSheetId}\n` : '') +
      (animBlueprint2dId ? `Anim Blueprint: ${animBlueprint2dId}\n` : '') +
      `File: Actors/${fileName}` }] };
  }
);

server.tool(
  'delete_actor',
  'Delete an actor asset from the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor to delete'),
  },
  async ({ projectPath, actorId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    fs.unlinkSync(filePath);
    updateIndex(actorsDir, 'actorId', 'actorName');
    return { content: [{ type: 'text', text: `Deleted actor "${actor.actorName}" (${actorId})` }] };
  }
);

server.tool(
  'rename_actor',
  'Rename an actor asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor'),
    newName: z.string().describe('New name for the actor'),
  },
  async ({ projectPath, actorId, newName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    const oldName = actor.actorName;
    actor.actorName = newName;
    actor.modifiedAt = Date.now();
    writeJsonFile(filePath, actor);
    updateIndex(actorsDir, 'actorId', 'actorName');
    return { content: [{ type: 'text', text: `Renamed actor "${oldName}" → "${newName}"` }] };
  }
);

// ============================================================
//  5. ACTOR COMPONENTS
// ============================================================

server.tool(
  'add_component_to_actor',
  'Add a component to an actor. Types: spriteRenderer, rigidbody2d, collider2d, characterMovement2d, camera2d, mesh, skeletalMesh, trigger, light, camera, characterMovement, springArm, tilemap, navMeshBounds.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor'),
    componentType: z.string().describe('Component type (e.g. "spriteRenderer", "rigidbody2d", "camera2d")'),
    componentName: z.string().optional().describe('Custom name for the component'),
    properties: z.record(z.string(), z.any()).optional().describe('Additional properties for the component'),
  },
  async ({ projectPath, actorId, componentType, componentName, properties }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    const comp: any = {
      id: compUid(), type: componentType,
      meshType: 'cube',
      name: componentName || componentType,
      offset: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      ...(properties || {}),
    };
    if (componentType === 'camera2d' && !comp.camera2dConfig) {
      comp.camera2dConfig = defaultCamera2DConfig();
    }
    if (componentType === 'skeletalMesh') {
      comp.skeletalMesh = {
        meshAssetId: (properties && properties.meshAssetId) || '',
        animationBlueprintId: (properties && properties.animationBlueprintId) || '',
      };
    }
    actor.components = actor.components || [];
    actor.components.push(comp);
    actor.modifiedAt = Date.now();
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Added ${componentType} "${comp.name}" to actor "${actor.actorName}" (comp ID: ${comp.id})` }] };
  }
);

server.tool(
  'modify_actor_component',
  'Modify properties of a component on an actor. Set sprite sheet, animation blueprint, collider size, etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor'),
    componentName: z.string().describe('Name of the component to modify'),
    properties: z.record(z.string(), z.any()).describe('Properties to set'),
  },
  async ({ projectPath, actorId, componentName, properties }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    const comp = (actor.components || []).find((c: any) => c.name === componentName);
    if (!comp) return { content: [{ type: 'text', text: `Component "${componentName}" not found. Available: ${(actor.components || []).map((c: any) => c.name).join(', ')}` }] };
    for (const [key, value] of Object.entries(properties)) comp[key] = value;
    actor.modifiedAt = Date.now();
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Updated "${componentName}" on "${actor.actorName}": ${Object.keys(properties).join(', ')}` }] };
  }
);

server.tool(
  'remove_component_from_actor',
  'Remove a component from an actor by name.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor'),
    componentName: z.string().describe('Name of the component to remove'),
  },
  async ({ projectPath, actorId, componentName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    const idx = (actor.components || []).findIndex((c: any) => c.name === componentName);
    if (idx === -1) return { content: [{ type: 'text', text: `Component "${componentName}" not found.` }] };
    actor.components.splice(idx, 1);
    actor.modifiedAt = Date.now();
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Removed "${componentName}" from "${actor.actorName}".` }] };
  }
);

// ============================================================
//  6. BLUEPRINT VARIABLES & LOGIC
// ============================================================

server.tool(
  'add_blueprint_variable',
  'Add a variable to an actor blueprint for gameplay logic.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor'),
    variableName: z.string().describe('Variable name (e.g. "Health", "Speed")'),
    variableType: z.enum(['Float', 'Boolean', 'String', 'Integer', 'Vector3', 'Color', 'Rotator', 'Transform', 'Object', 'Class', 'Array']).describe('Type'),
    defaultValue: z.any().optional().describe('Default value'),
    category: z.string().optional().describe('Category group name'),
    description: z.string().optional().describe('Variable description'),
  },
  async ({ projectPath, actorId, variableName, variableType, defaultValue, category, description }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, data: actor } = findActorFile(path.join(projRoot, 'Actors'), actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    actor.variables = actor.variables || [];
    if (actor.variables.some((v: any) => v.name === variableName)) {
      return { content: [{ type: 'text', text: `Variable "${variableName}" already exists.` }] };
    }
    const resolvedDefault = defaultValue ?? (variableType === 'Float' || variableType === 'Integer' ? 0 :
      variableType === 'Boolean' ? false : variableType === 'String' ? '' :
      variableType === 'Vector3' ? { x: 0, y: 0, z: 0 } : variableType === 'Color' ? '#ffffff' :
      variableType === 'Array' ? [] : null);
    actor.variables.push({ id: varUid(variableName), name: variableName, type: variableType, defaultValue: resolvedDefault, category, description });
    actor.modifiedAt = Date.now();
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Added variable "${variableName}" (${variableType}) to "${actor.actorName}"` }] };
  }
);

server.tool(
  'remove_blueprint_variable',
  'Remove a variable from an actor blueprint.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor'),
    variableName: z.string().describe('Variable name to remove'),
  },
  async ({ projectPath, actorId, variableName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, data: actor } = findActorFile(path.join(projRoot, 'Actors'), actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    actor.variables = actor.variables || [];
    const idx = actor.variables.findIndex((v: any) => v.name === variableName);
    if (idx === -1) return { content: [{ type: 'text', text: `Variable "${variableName}" not found.` }] };
    actor.variables.splice(idx, 1);
    actor.modifiedAt = Date.now();
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Removed variable "${variableName}" from "${actor.actorName}"` }] };
  }
);

server.tool(
  'set_actor_physics',
  'Configure physics on an actor. Enable/disable simulation, set body type, mass, collision, etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor'),
    physicsConfig: z.record(z.string(), z.any()).describe('Physics configuration properties to set/override'),
  },
  async ({ projectPath, actorId, physicsConfig }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, data: actor } = findActorFile(path.join(projRoot, 'Actors'), actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    actor.rootPhysics = { ...defaultPhysicsConfig(), ...(actor.rootPhysics || {}), ...physicsConfig };
    actor.modifiedAt = Date.now();
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Updated physics on "${actor.actorName}": ${Object.keys(physicsConfig).join(', ')}` }] };
  }
);

// ============================================================
//  7. SPRITE SHEET MANAGEMENT
// ============================================================

server.tool(
  'list_sprite_sheets',
  'List all sprite sheet assets with sprite counts and animation names.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const allSheets: any[] = [];
    for (const dir of ['Sprites', 'SpriteSheets']) {
      const dp = path.join(projRoot, dir);
      if (!fs.existsSync(dp)) continue;
      for (const f of fs.readdirSync(dp).filter(f => f.endsWith('.json'))) {
        const data = readJsonFile(path.join(dp, f));
        if (data.assetType === 'spriteSheet' || data.sprites) allSheets.push({ ...data, _file: `${dir}/${f}` });
      }
    }
    // Also check scenes for embedded sprite sheets
    const scenesDir = path.join(projRoot, 'Scenes');
    if (fs.existsSync(scenesDir)) {
      for (const f of fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'))) {
        const scene = readJsonFile(path.join(scenesDir, f));
        for (const ss of (scene.scene2DConfig?.spriteSheets || [])) {
          if (!allSheets.some(s => s.assetId === ss.assetId)) {
            allSheets.push({ ...ss, _file: `Scenes/${f} (embedded)` });
          }
        }
      }
    }
    if (allSheets.length === 0) return { content: [{ type: 'text', text: 'No sprite sheets found.' }] };
    let result = `Sprite Sheets (${allSheets.length}):\n`;
    for (const ss of allSheets) {
      result += `  ${ss.assetName || ss.name || 'Unnamed'} (ID: ${ss.assetId})\n`;
      result += `    File: ${ss._file}\n`;
      result += `    Sprites: ${(ss.sprites || []).length}, Size: ${ss.textureWidth || '?'}x${ss.textureHeight || '?'}\n`;
      result += `    Animations: ${(ss.animations || []).map((a: any) => a.animName).join(', ') || 'none'}\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_sprite_sheet',
  'Create a sprite sheet from a texture image with grid-based slicing.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Sprite sheet name (e.g. "PlayerSprites")'),
    textureFile: z.string().describe('Texture filename in Textures folder (e.g. "player.png")'),
    textureWidth: z.number().describe('Texture width in pixels'),
    textureHeight: z.number().describe('Texture height in pixels'),
    cellWidth: z.number().describe('Width of each cell in pixels'),
    cellHeight: z.number().describe('Height of each cell in pixels'),
    pixelsPerUnit: z.number().optional().describe('Pixels per world unit (default: 100)'),
    filterMode: z.enum(['point', 'linear']).optional().describe('Texture filter (default: "point")'),
  },
  async ({ projectPath, name, textureFile, textureWidth, textureHeight, cellWidth, cellHeight, pixelsPerUnit, filterMode }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const spritesDir = path.join(projRoot, 'Sprites');
    const cols = Math.floor(textureWidth / cellWidth);
    const rows = Math.floor(textureHeight / cellHeight);
    const sprites: any[] = [];
    let idx = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        sprites.push({
          spriteId: `sprite_${idx}`, name: `${name}_${idx}`,
          x: col * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight,
          pivot: { x: 0.5, y: 0.5 },
        });
        idx++;
      }
    }
    const texturePath = path.join(projRoot, 'Textures', textureFile);
    let imageDataUrl: string | undefined, imagePath: string | undefined;
    if (fs.existsSync(texturePath)) {
      const imageData = fs.readFileSync(texturePath);
      const ext = path.extname(textureFile).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      imageDataUrl = `data:${mime};base64,${imageData.toString('base64')}`;
      imagePath = `Textures/${textureFile}`;
    }
    const assetId = spriteUid();
    const spriteSheet = {
      assetId, assetType: 'spriteSheet', assetName: name,
      sourceTexture: textureFile, textureWidth, textureHeight,
      pixelsPerUnit: pixelsPerUnit || 100, filterMode: filterMode || 'point',
      sprites, animations: [], imageDataUrl, imagePath,
    };
    const fileName = `${safeName(name)}_${assetId}.json`;
    writeJsonFile(path.join(spritesDir, fileName), spriteSheet);
    // Register in 2D scenes
    const scenesDir = path.join(projRoot, 'Scenes');
    if (fs.existsSync(scenesDir)) {
      for (const sf of fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'))) {
        const sceneFilePath = path.join(scenesDir, sf);
        const scene = readJsonFile(sceneFilePath);
        if (scene.sceneMode === '2D' && scene.scene2DConfig) {
          scene.scene2DConfig.spriteSheets = scene.scene2DConfig.spriteSheets || [];
          if (!scene.scene2DConfig.spriteSheets.some((s: any) => s.assetId === assetId)) {
            scene.scene2DConfig.spriteSheets.push({ ...spriteSheet, imageDataUrl: undefined });
            writeJsonFile(sceneFilePath, scene);
          }
        }
      }
    }
    return { content: [{ type: 'text', text:
      `Created sprite sheet "${name}" (ID: ${assetId})\n` +
      `Grid: ${cols}x${rows} = ${sprites.length} sprites (${cellWidth}x${cellHeight} each)\n` +
      `File: Sprites/${fileName}` }] };
  }
);

server.tool(
  'add_sprite_animation',
  'Add an animation to a sprite sheet by selecting frame indices.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    spriteSheetId: z.string().describe('Sprite sheet asset ID'),
    animationName: z.string().describe('Animation name (e.g. "Idle", "Walk", "Attack")'),
    frameIndices: z.array(z.number()).describe('Sprite indices (0-based) as animation frames'),
    fps: z.number().optional().describe('Playback FPS (default: 12)'),
    loop: z.boolean().optional().describe('Loop animation (default: true)'),
  },
  async ({ projectPath, spriteSheetId, animationName, frameIndices, fps, loop }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const spritesDir = path.join(projRoot, 'Sprites');
    if (!fs.existsSync(spritesDir)) fs.mkdirSync(spritesDir, { recursive: true });
    // Find sprite sheet
    let ssFile: string | null = null, spriteSheet: any = null;
    for (const f of (fs.existsSync(spritesDir) ? fs.readdirSync(spritesDir).filter(f => f.endsWith('.json')) : [])) {
      const data = readJsonFile(path.join(spritesDir, f));
      if (data.assetId === spriteSheetId) { ssFile = f; spriteSheet = data; break; }
    }
    // Search scenes if not found
    if (!spriteSheet) {
      const scenesDir = path.join(projRoot, 'Scenes');
      if (fs.existsSync(scenesDir)) {
        for (const sf of fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'))) {
          const scene = readJsonFile(path.join(scenesDir, sf));
          const found = (scene.scene2DConfig?.spriteSheets || []).find((s: any) => s.assetId === spriteSheetId);
          if (found) {
            spriteSheet = found;
            ssFile = `${safeName(found.assetName || 'sheet')}_${spriteSheetId}.json`;
            writeJsonFile(path.join(spritesDir, ssFile), found);
            break;
          }
        }
      }
    }
    if (!spriteSheet) return { content: [{ type: 'text', text: `Sprite sheet not found: ${spriteSheetId}` }] };
    const frames = frameIndices.map(i => (i >= 0 && i < spriteSheet.sprites.length) ? spriteSheet.sprites[i].spriteId : `sprite_${i}`);
    const animId = `anim_${Date.now().toString(36)}_${(++_uid).toString(36)}`;
    const animation = { animId, animName: animationName, frames, fps: fps ?? 12, loop: loop ?? true, events: [] };
    spriteSheet.animations = spriteSheet.animations || [];
    spriteSheet.animations.push(animation);
    writeJsonFile(path.join(spritesDir, ssFile!), spriteSheet);
    // Update in scenes
    const scenesDir = path.join(projRoot, 'Scenes');
    if (fs.existsSync(scenesDir)) {
      for (const sf of fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'))) {
        const sceneFilePath = path.join(scenesDir, sf);
        const scene = readJsonFile(sceneFilePath);
        const sceneSheet = (scene.scene2DConfig?.spriteSheets || []).find((s: any) => s.assetId === spriteSheetId);
        if (sceneSheet) {
          sceneSheet.animations = sceneSheet.animations || [];
          sceneSheet.animations.push(animation);
          writeJsonFile(sceneFilePath, scene);
        }
      }
    }
    return { content: [{ type: 'text', text:
      `Added animation "${animationName}" to "${spriteSheet.assetName}"\n` +
      `ID: ${animId}, Frames: ${frameIndices.length} at ${fps ?? 12} FPS, Loop: ${loop ?? true}` }] };
  }
);

// ============================================================
//  8. ANIMATION BLUEPRINTS
// ============================================================

server.tool(
  'list_anim_blueprints',
  'List all animation blueprints with states, transitions, and mode (2D/3D).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const abpDir = path.join(projRoot, 'AnimBlueprints');
    if (!fs.existsSync(abpDir)) return { content: [{ type: 'text', text: 'No AnimBlueprints folder found.' }] };
    const files = fs.readdirSync(abpDir).filter(f => f.endsWith('.json') && f !== '_index.json');
    let result = `Animation Blueprints (${files.length}):\n`;
    for (const f of files) {
      const abp = readJsonFile(path.join(abpDir, f));
      const sm = abp.stateMachine || {};
      const states = sm.states || [];
      result += `  ${abp.animBlueprintName} (ID: ${abp.animBlueprintId})\n`;
      result += `    Mode: ${abp.is2D ? '2D Sprite' : '3D Skeletal'}\n`;
      result += `    States: ${states.map((s: any) => s.name).join(', ')}\n`;
      result += `    Transitions: ${(sm.transitions || []).length}\n`;
      result += `    Entry: ${states.find((s: any) => s.id === sm.entryStateId)?.name || 'N/A'}\n\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'get_anim_blueprint_details',
  'Get full details of an animation blueprint: states, transitions, variables, blend spaces.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    animBlueprintId: z.string().describe('Animation blueprint ID'),
  },
  async ({ projectPath, animBlueprintId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { data: abp } = findAbpFile(path.join(projRoot, 'AnimBlueprints'), animBlueprintId);
    if (!abp) return { content: [{ type: 'text', text: `Not found: ${animBlueprintId}` }] };
    const sm = abp.stateMachine || {};
    const states = sm.states || [];
    const transitions = sm.transitions || [];
    let result = `Animation Blueprint: ${abp.animBlueprintName}\nID: ${abp.animBlueprintId}\n`;
    result += `Mode: ${abp.is2D ? '2D' : '3D'}\nTarget Sprite Sheet: ${abp.targetSpriteSheetId || 'None'}\n\n`;
    result += `States (${states.length}):\n`;
    for (const s of states) {
      const isEntry = s.id === sm.entryStateId ? ' [ENTRY]' : '';
      result += `  - ${s.name}${isEntry} (ID: ${s.id})\n`;
      if (s.spriteAnimationName) result += `    Sprite Anim: ${s.spriteAnimationName}\n`;
      if (s.spriteSheetId) result += `    Sheet: ${s.spriteSheetId}\n`;
      result += `    Loop: ${s.loop ?? s.spriteAnimLoop}, Rate: ${s.playRate}\n`;
    }
    result += `\nTransitions (${transitions.length}):\n`;
    for (const t of transitions) {
      const fromName = t.fromStateId === '*' ? '*' : states.find((s: any) => s.id === t.fromStateId)?.name || t.fromStateId;
      const toName = states.find((s: any) => s.id === t.toStateId)?.name || t.toStateId;
      result += `  - ${fromName} → ${toName}`;
      if (t.rules?.length) {
        const descs = t.rules.flatMap((rg: any) => (rg.rules || []).map((r: any) => r.kind === 'compare' ? `${r.varName} ${r.op} ${r.value}` : r.expr));
        result += ` [${descs.join(' AND ')}]`;
      }
      result += `\n`;
    }
    result += `\nVariables (${(abp.eventVariables || []).length}):\n`;
    for (const v of (abp.eventVariables || [])) result += `  - ${v.name} (${v.type}) = ${v.defaultValue}\n`;
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_anim_blueprint_2d',
  'Create a 2D animation blueprint with a state machine. Start with an Idle state, then add more states and transitions.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Blueprint name (e.g. "PlayerAnimBP")'),
    spriteSheetId: z.string().optional().describe('Target sprite sheet ID'),
    variables: z.array(z.object({
      name: z.string(),
      type: z.enum(['Float', 'Boolean', 'String']),
      defaultValue: z.union([z.number(), z.boolean(), z.string()]).optional(),
    })).optional().describe('Variables for transition conditions'),
  },
  async ({ projectPath, name, spriteSheetId, variables }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const abpDir = path.join(projRoot, 'AnimBlueprints');
    const abpId = animUid();
    const idleStateId = animUid();
    const idleState: any = {
      id: idleStateId, name: 'Idle', posX: 200, posY: 200,
      outputType: 'spriteAnimation', animationId: '', animationName: '',
      loop: true, playRate: 1,
      blendSpace1DId: '', blendSpaceAxisVar: '',
      blendSpace2DId: '', blendSpaceAxisVarX: '', blendSpaceAxisVarY: '',
      spriteSheetId: spriteSheetId || '', spriteAnimationName: '',
      spriteAnimFPS: 0, spriteAnimLoop: true,
      blendSprite1DId: '', blendSpriteAxisVar: '',
    };
    // Merge default + user variables
    const bpVars: any[] = [];
    const defaults = [
      { name: 'speed', type: 'Float', defaultValue: 0 },
      { name: 'isInAir', type: 'Boolean', defaultValue: false },
    ];
    const userNames = new Set((variables || []).map(v => v.name));
    for (const dv of defaults) {
      if (!userNames.has(dv.name)) {
        bpVars.push({ id: varUid(dv.name), name: dv.name, type: dv.type, defaultValue: dv.defaultValue });
      }
    }
    for (const uv of (variables || [])) {
      bpVars.push({
        id: varUid(uv.name), name: uv.name, type: uv.type,
        defaultValue: uv.defaultValue ?? (uv.type === 'Float' ? 0 : uv.type === 'Boolean' ? false : ''),
      });
    }
    const abpJson = {
      animBlueprintVersion: 2, animBlueprintId: abpId, animBlueprintName: name,
      targetSkeletonMeshAssetId: '',
      stateMachine: { entryStateId: idleStateId, states: [idleState], transitions: [] },
      blendSpaces1D: [], blendSpaces2D: [], blendSprites1D: [],
      eventVariables: bpVars.map(v => ({
        name: v.name,
        type: v.type === 'Float' ? 'number' : v.type === 'Boolean' ? 'boolean' : 'string',
        defaultValue: v.defaultValue,
      })),
      eventGraph: null, compiledCode: '', blueprintGraphNodeData: null,
      is2D: true, targetSpriteSheetId: spriteSheetId || '',
    };
    const fileName = `${safeName(name)}_${abpId}.json`;
    writeJsonFile(path.join(abpDir, fileName), abpJson);
    updateIndex(abpDir, 'animBlueprintId', 'animBlueprintName');
    return { content: [{ type: 'text', text:
      `Created 2D Animation Blueprint "${name}" (ID: ${abpId})\n` +
      `Entry State: Idle (ID: ${idleStateId})\n` +
      `Variables: ${bpVars.map(v => `${v.name} (${v.type})`).join(', ')}\n` +
      (spriteSheetId ? `Target Sheet: ${spriteSheetId}\n` : '') +
      `File: AnimBlueprints/${fileName}\n\n` +
      `Next: add_anim_state, add_anim_transition, wire_anim_blueprint_to_actor` }] };
  }
);

server.tool(
  'add_anim_state',
  'Add a new state to an animation blueprint state machine. For 3D blueprints, set animationName to the clip name from the mesh (e.g. "Idle", "Run"). For 2D, set spriteAnimationName.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    animBlueprintId: z.string().describe('Animation blueprint ID'),
    stateName: z.string().describe('State name (e.g. "Walk", "Attack", "Jump")'),
    animationName: z.string().optional().describe('3D animation clip name from the mesh (e.g. "Idle", "Run", "Jump")'),
    spriteSheetId: z.string().optional().describe('Sprite sheet for this state (2D only)'),
    spriteAnimationName: z.string().optional().describe('Animation name within the sheet (2D only)'),
    loop: z.boolean().optional().describe('Loop animation (default: true)'),
    playRate: z.number().optional().describe('Playback rate (default: 1)'),
    posX: z.number().optional(), posY: z.number().optional(),
    setAsEntry: z.boolean().optional().describe('Make this the entry state'),
  },
  async ({ projectPath, animBlueprintId, stateName, animationName, spriteSheetId, spriteAnimationName, loop, playRate, posX, posY, setAsEntry }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, data: abp } = findAbpFile(path.join(projRoot, 'AnimBlueprints'), animBlueprintId);
    if (!abp) return { content: [{ type: 'text', text: `Not found: ${animBlueprintId}` }] };
    const is3D = abp.is2D === false;
    const count = abp.stateMachine.states.length;
    const stateId = animUid();
    const newState: any = {
      id: stateId, name: stateName,
      posX: posX ?? (200 + count * 250), posY: posY ?? 200,
      outputType: is3D ? 'singleAnimation' : 'spriteAnimation',
      animationId: '', animationName: is3D ? (animationName || stateName) : '',
      loop: loop ?? true, playRate: playRate ?? 1,
      blendSpace1DId: '', blendSpaceAxisVar: '',
      blendSpace2DId: '', blendSpaceAxisVarX: '', blendSpaceAxisVarY: '',
      spriteSheetId: spriteSheetId || abp.targetSpriteSheetId || '',
      spriteAnimationName: spriteAnimationName || '',
      spriteAnimFPS: 0, spriteAnimLoop: loop ?? true,
      blendSprite1DId: '', blendSpriteAxisVar: '',
    };
    abp.stateMachine.states.push(newState);
    if (setAsEntry) abp.stateMachine.entryStateId = stateId;
    writeJsonFile(filePath!, abp);
    return { content: [{ type: 'text', text: `Added ${is3D ? '3D' : '2D'} state "${stateName}" (ID: ${stateId}) to "${abp.animBlueprintName}". Type: ${newState.outputType}. Total: ${abp.stateMachine.states.length}` }] };
  }
);

server.tool(
  'add_anim_transition',
  'Add a conditional transition between two animation states.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    animBlueprintId: z.string().describe('Animation blueprint ID'),
    fromStateName: z.string().describe('Source state name (use "*" for any-state wildcard)'),
    toStateName: z.string().describe('Destination state name'),
    rules: z.array(z.object({
      variable: z.string().describe('Variable name'),
      operator: z.enum(['==', '!=', '>', '<', '>=', '<=']).describe('Comparison operator'),
      value: z.union([z.number(), z.boolean(), z.string()]).describe('Value to compare'),
    })).describe('Conditions (all must be true)'),
    blendTime: z.number().optional().describe('Cross-fade duration (default: 0.1s)'),
    blendCurve: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).optional(),
    priority: z.number().optional().describe('Priority (lower = higher)'),
  },
  async ({ projectPath, animBlueprintId, fromStateName, toStateName, rules, blendTime, blendCurve, priority }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, data: abp } = findAbpFile(path.join(projRoot, 'AnimBlueprints'), animBlueprintId);
    if (!abp) return { content: [{ type: 'text', text: `Not found: ${animBlueprintId}` }] };
    const fromState = fromStateName === '*' ? { id: '*', name: '*' } : abp.stateMachine.states.find((s: any) => s.name === fromStateName);
    const toState = abp.stateMachine.states.find((s: any) => s.name === toStateName);
    if (!fromState) return { content: [{ type: 'text', text: `State "${fromStateName}" not found. Available: ${abp.stateMachine.states.map((s: any) => s.name).join(', ')}` }] };
    if (!toState) return { content: [{ type: 'text', text: `State "${toStateName}" not found. Available: ${abp.stateMachine.states.map((s: any) => s.name).join(', ')}` }] };
    const transRules = rules.map(r => ({
      id: animUid(), kind: 'compare', varName: r.variable, op: r.operator, value: r.value,
      valueType: typeof r.value === 'boolean' ? 'Boolean' : typeof r.value === 'number' ? 'Float' : 'String',
    }));
    const transId = animUid();
    abp.stateMachine.transitions.push({
      id: transId, fromStateId: fromState.id, toStateId: toState.id,
      rules: [{ id: animUid(), op: 'AND', rules: transRules }],
      ruleLogic: 'AND', blendTime: blendTime ?? 0.1,
      blendProfile: { time: blendTime ?? 0.1, curve: blendCurve || 'linear' },
      priority: priority ?? (fromStateName === '*' ? 100 : 0),
    });
    writeJsonFile(filePath!, abp);
    const desc = rules.map(r => `${r.variable} ${r.operator} ${r.value}`).join(' AND ');
    return { content: [{ type: 'text', text: `Transition: ${fromStateName} → ${toStateName} [${desc}]\nBlend: ${blendTime ?? 0.1}s, ID: ${transId}` }] };
  }
);

server.tool(
  'wire_anim_blueprint_to_actor',
  'Connect a 2D animation blueprint to a character pawn\'s sprite renderer.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('Actor ID'),
    animBlueprintId: z.string().describe('2D animation blueprint ID'),
    spriteSheetId: z.string().optional().describe('Sprite sheet ID to also assign'),
  },
  async ({ projectPath, actorId, animBlueprintId, spriteSheetId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, data: actor } = findActorFile(path.join(projRoot, 'Actors'), actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    const spriteComp = (actor.components || []).find((c: any) => c.type === 'spriteRenderer');
    if (!spriteComp) return { content: [{ type: 'text', text: `No SpriteRenderer on "${actor.actorName}". Add one first.` }] };
    spriteComp.animBlueprint2dId = animBlueprintId;
    if (spriteSheetId) spriteComp.spriteSheetId = spriteSheetId;
    actor.modifiedAt = Date.now();
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Wired anim blueprint ${animBlueprintId} to "${actor.actorName}" (component: ${spriteComp.name})` }] };
  }
);

server.tool(
  'add_anim_blueprint_variable',
  'Add a variable to an animation blueprint for transition conditions.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    animBlueprintId: z.string().describe('Animation blueprint ID'),
    variableName: z.string(),
    variableType: z.enum(['Float', 'Boolean', 'String']),
    defaultValue: z.union([z.number(), z.boolean(), z.string()]).optional(),
  },
  async ({ projectPath, animBlueprintId, variableName, variableType, defaultValue }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, data: abp } = findAbpFile(path.join(projRoot, 'AnimBlueprints'), animBlueprintId);
    if (!abp) return { content: [{ type: 'text', text: `Not found: ${animBlueprintId}` }] };
    abp.eventVariables = abp.eventVariables || [];
    if (abp.eventVariables.some((v: any) => v.name === variableName)) {
      return { content: [{ type: 'text', text: `Variable "${variableName}" already exists.` }] };
    }
    abp.eventVariables.push({
      name: variableName,
      type: variableType === 'Float' ? 'number' : variableType === 'Boolean' ? 'boolean' : 'string',
      defaultValue: defaultValue ?? (variableType === 'Float' ? 0 : variableType === 'Boolean' ? false : ''),
    });
    writeJsonFile(filePath!, abp);
    return { content: [{ type: 'text', text: `Added "${variableName}" (${variableType}) to "${abp.animBlueprintName}"` }] };
  }
);

// ============================================================
//  9. WIDGET / UI BLUEPRINTS
// ============================================================

server.tool(
  'list_widgets',
  'List all widget blueprint assets (UI designs).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const wDir = path.join(projRoot, 'Widgets');
    if (!fs.existsSync(wDir)) return { content: [{ type: 'text', text: 'No Widgets folder found.' }] };
    const files = fs.readdirSync(wDir).filter(f => f.endsWith('.json') && f !== '_index.json');
    let result = `Widget Blueprints (${files.length}):\n`;
    for (const f of files) {
      const w = readJsonFile(path.join(wDir, f));
      const wId = w.widgetBlueprintId || w.id || 'unknown';
      const wName = w.widgetBlueprintName || w.name || f;
      const widgetCount = w.widgets ? Object.keys(w.widgets).length : 0;
      const animCount = (w.animations || []).length;
      result += `  ${wName} (ID: ${wId}) — ${widgetCount} widgets, ${animCount} animations\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_widget_blueprint',
  'Create a new UI widget blueprint with a root canvas panel. Uses engine-compatible flat widget map format.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Widget name (e.g. "HUD", "MainMenu", "HealthBar")'),
    rootWidgetType: z.enum(['CanvasPanel', 'VerticalBox', 'HorizontalBox', 'Overlay']).optional().describe('Root container type (default: CanvasPanel)'),
  },
  async ({ projectPath, name, rootWidgetType }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const wDir = path.join(projRoot, 'Widgets');
    const bpId = widgetUid();
    const rootId = nodeUid();
    const rootType = rootWidgetType || 'CanvasPanel';
    const rootWidget = makeDefaultWidgetNode(rootId, rootType, 'RootCanvas');
    // Root uses stretch-full anchor
    rootWidget.slot.anchor = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    rootWidget.slot.sizeX = 1920;
    rootWidget.slot.sizeY = 1080;

    const widgetJson: any = {
      widgetBlueprintId: bpId,
      widgetBlueprintName: name,
      rootWidgetId: rootId,
      widgets: { [rootId]: rootWidget },
      animations: [],
      eventGraph: { nodeData: null, comments: [] },
      compiledCode: '',
      blueprintGraphNodeData: null,
      designerState: { zoom: 0.5, panX: 0, panY: 0 },
      variables: [],
      functions: [],
      macros: [],
      customEvents: [],
      structs: [],
      functionGraphData: {},
    };
    const fileName = `${safeName(name)}_${bpId}.json`;
    writeJsonFile(path.join(wDir, fileName), widgetJson);
    updateIndex(wDir, 'widgetBlueprintId', 'widgetBlueprintName');
    return { content: [{ type: 'text', text: `Created widget "${name}" (ID: ${bpId})\nRoot: ${rootType} (${rootId})\nFile: Widgets/${fileName}` }] };
  }
);

server.tool(
  'add_widget_child',
  'Add a child widget element to an existing widget blueprint. Uses engine-compatible flat map format. Types: Text, RichText, Button, Image, ProgressBar, Slider, TextBox, CheckBox, ComboBox, CanvasPanel, VerticalBox, HorizontalBox, Overlay, GridPanel, ScrollBox, SizeBox, ScaleBox, WrapBox, Border, WidgetSwitcher, CircularThrobber, Spacer, NamedSlot.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    widgetId: z.string().describe('Widget blueprint ID (widgetBlueprintId)'),
    parentId: z.string().optional().describe('Parent widget ID. If omitted, adds to the root widget.'),
    widgetType: z.string().describe('Widget type (Text, Button, Image, ProgressBar, CanvasPanel, VerticalBox, etc.)'),
    widgetName: z.string().describe('Name for this widget element'),
    slot: z.object({
      anchorPreset: z.enum(['TopLeft', 'TopCenter', 'TopRight', 'CenterLeft', 'Center', 'CenterRight', 'BottomLeft', 'BottomCenter', 'BottomRight', 'StretchTop', 'StretchBottom', 'StretchLeft', 'StretchRight', 'StretchFull']).optional().describe('Anchor preset (default: TopLeft)'),
      offsetX: z.number().optional(), offsetY: z.number().optional(),
      sizeX: z.number().optional(), sizeY: z.number().optional(),
      alignmentX: z.number().optional(), alignmentY: z.number().optional(),
      zOrder: z.number().optional(),
      padding: z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() }).optional(),
    }).optional().describe('Layout slot overrides'),
    properties: z.record(z.string(), z.any()).optional().describe('Type-specific properties: textProps (text, fontSize, color, fontFamily, justification, isBold), imageProps (imageSource, tintColor, stretch), buttonProps (normalColor, hoveredColor, pressedColor, borderRadius), progressBarProps (percent, fillColor, backgroundColor), sliderProps (value, minValue, maxValue), etc.'),
  },
  async ({ projectPath, widgetId, parentId, widgetType, widgetName, slot, properties }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const r = readWidgetBP(projRoot, widgetId);
    if (!r) return { content: [{ type: 'text', text: `Widget blueprint not found: ${widgetId}` }] };
    const bp = r.data;
    const widgets: Record<string, any> = bp.widgets || {};

    // Find parent
    const pId = parentId || bp.rootWidgetId;
    const parent = widgets[pId];
    if (!parent) return { content: [{ type: 'text', text: `Parent widget not found: ${pId}` }] };

    // Create new widget node with proper defaults
    const childId = nodeUid();
    const child = makeDefaultWidgetNode(childId, widgetType, widgetName);

    // Apply slot overrides
    if (slot) {
      if (slot.anchorPreset) {
        const presets: Record<string, any> = {
          TopLeft: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          TopCenter: { minX: 0.5, minY: 0, maxX: 0.5, maxY: 0 },
          TopRight: { minX: 1, minY: 0, maxX: 1, maxY: 0 },
          CenterLeft: { minX: 0, minY: 0.5, maxX: 0, maxY: 0.5 },
          Center: { minX: 0.5, minY: 0.5, maxX: 0.5, maxY: 0.5 },
          CenterRight: { minX: 1, minY: 0.5, maxX: 1, maxY: 0.5 },
          BottomLeft: { minX: 0, minY: 1, maxX: 0, maxY: 1 },
          BottomCenter: { minX: 0.5, minY: 1, maxX: 0.5, maxY: 1 },
          BottomRight: { minX: 1, minY: 1, maxX: 1, maxY: 1 },
          StretchTop: { minX: 0, minY: 0, maxX: 1, maxY: 0 },
          StretchBottom: { minX: 0, minY: 1, maxX: 1, maxY: 1 },
          StretchLeft: { minX: 0, minY: 0, maxX: 0, maxY: 1 },
          StretchRight: { minX: 1, minY: 0, maxX: 1, maxY: 1 },
          StretchFull: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        };
        child.slot.anchor = presets[slot.anchorPreset] || child.slot.anchor;
      }
      if (slot.offsetX !== undefined) child.slot.offsetX = slot.offsetX;
      if (slot.offsetY !== undefined) child.slot.offsetY = slot.offsetY;
      if (slot.sizeX !== undefined) child.slot.sizeX = slot.sizeX;
      if (slot.sizeY !== undefined) child.slot.sizeY = slot.sizeY;
      if (slot.alignmentX !== undefined) child.slot.alignment.x = slot.alignmentX;
      if (slot.alignmentY !== undefined) child.slot.alignment.y = slot.alignmentY;
      if (slot.zOrder !== undefined) child.slot.zOrder = slot.zOrder;
      if (slot.padding) child.slot.padding = slot.padding;
    }

    // Apply type-specific properties
    if (properties) {
      for (const [key, val] of Object.entries(properties)) {
        child[key] = val;
      }
    }

    // Add to flat map and parent's children array
    widgets[childId] = child;
    parent.children = parent.children || [];
    parent.children.push(childId);
    bp.widgets = widgets;
    writeJsonFile(r.filePath, bp);
    return { content: [{ type: 'text', text: `Added ${widgetType} "${widgetName}" (${childId}) to "${parent.name}" in widget "${bp.widgetBlueprintName}"` }] };
  }
);

server.tool(
  'modify_widget_child',
  'Modify properties of an existing widget element in a widget blueprint. Update slot, type-specific props, visibility, opacity, transforms, etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    widgetId: z.string().describe('Widget blueprint ID (widgetBlueprintId)'),
    childId: z.string().describe('Widget element ID to modify'),
    updates: z.record(z.string(), z.any()).describe('Properties to update. Supports top-level fields (name, visibility, renderOpacity, isEnabled, toolTip, renderAngle) and nested objects (slot, textProps, imageProps, buttonProps, progressBarProps, sliderProps, renderTranslation, renderScale, renderPivot). Partial updates are merged.'),
  },
  async ({ projectPath, widgetId, childId, updates }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const r = readWidgetBP(projRoot, widgetId);
    if (!r) return { content: [{ type: 'text', text: `Widget blueprint not found: ${widgetId}` }] };
    const widgets: Record<string, any> = r.data.widgets || {};
    const target = widgets[childId];
    if (!target) return { content: [{ type: 'text', text: `Widget element not found: ${childId}` }] };

    // Merge updates — handle nested objects carefully
    for (const [key, val] of Object.entries(updates)) {
      if (val && typeof val === 'object' && !Array.isArray(val) && target[key] && typeof target[key] === 'object') {
        target[key] = { ...target[key], ...val };
      } else {
        target[key] = val;
      }
    }
    widgets[childId] = target;
    r.data.widgets = widgets;
    writeJsonFile(r.filePath, r.data);
    return { content: [{ type: 'text', text: `Modified widget "${target.name}" (${childId}) — updated: ${Object.keys(updates).join(', ')}` }] };
  }
);

server.tool(
  'remove_widget_child',
  'Remove a widget element from a widget blueprint. Also removes all descendants.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    widgetId: z.string().describe('Widget blueprint ID (widgetBlueprintId)'),
    childId: z.string().describe('Widget element ID to remove'),
  },
  async ({ projectPath, widgetId, childId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const r = readWidgetBP(projRoot, widgetId);
    if (!r) return { content: [{ type: 'text', text: `Widget blueprint not found: ${widgetId}` }] };
    const widgets: Record<string, any> = r.data.widgets || {};
    if (childId === r.data.rootWidgetId) return { content: [{ type: 'text', text: 'Cannot remove root widget.' }] };
    if (!widgets[childId]) return { content: [{ type: 'text', text: `Widget element not found: ${childId}` }] };

    // Collect all descendant IDs to remove
    const toRemove = new Set<string>();
    function collectDescendants(id: string) {
      toRemove.add(id);
      const w = widgets[id];
      if (w && w.children) {
        for (const cid of w.children) collectDescendants(cid);
      }
    }
    collectDescendants(childId);

    // Remove from parent's children array
    for (const w of Object.values(widgets) as any[]) {
      if (w.children && w.children.includes(childId)) {
        w.children = w.children.filter((c: string) => c !== childId);
      }
    }

    // Delete from flat map
    const removedName = widgets[childId]?.name || childId;
    for (const id of toRemove) delete widgets[id];
    r.data.widgets = widgets;
    writeJsonFile(r.filePath, r.data);
    return { content: [{ type: 'text', text: `Removed "${removedName}" and ${toRemove.size - 1} descendants from widget "${r.data.widgetBlueprintName}"` }] };
  }
);

server.tool(
  'duplicate_widget',
  'Duplicate a widget element (and all its children) within the same widget blueprint.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    widgetId: z.string().describe('Widget blueprint ID (widgetBlueprintId)'),
    sourceChildId: z.string().describe('Widget element ID to duplicate'),
    newName: z.string().optional().describe('Name for the duplicated widget (default: original + "_copy")'),
  },
  async ({ projectPath, widgetId, sourceChildId, newName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const r = readWidgetBP(projRoot, widgetId);
    if (!r) return { content: [{ type: 'text', text: `Widget blueprint not found: ${widgetId}` }] };
    const widgets: Record<string, any> = r.data.widgets || {};
    const source = widgets[sourceChildId];
    if (!source) return { content: [{ type: 'text', text: `Widget element not found: ${sourceChildId}` }] };

    // Deep-clone with new IDs
    const idMap = new Map<string, string>();
    function cloneWidget(origId: string, isRoot: boolean): string {
      const newId = nodeUid();
      idMap.set(origId, newId);
      const orig = widgets[origId];
      const clone = JSON.parse(JSON.stringify(orig));
      clone.id = newId;
      if (isRoot && newName) clone.name = newName;
      else if (isRoot) clone.name = orig.name + '_copy';
      clone.children = (orig.children || []).map((cid: string) => cloneWidget(cid, false));
      // Offset the clone slightly so it's visually distinct
      if (isRoot) {
        clone.slot.offsetX = (clone.slot.offsetX || 0) + 20;
        clone.slot.offsetY = (clone.slot.offsetY || 0) + 20;
      }
      widgets[newId] = clone;
      return newId;
    }
    const newRootId = cloneWidget(sourceChildId, true);

    // Add cloned root to the same parent as source
    for (const w of Object.values(widgets) as any[]) {
      if (w.children && w.children.includes(sourceChildId) && w.id !== newRootId) {
        w.children.push(newRootId);
        break;
      }
    }
    r.data.widgets = widgets;
    writeJsonFile(r.filePath, r.data);
    return { content: [{ type: 'text', text: `Duplicated "${source.name}" → "${widgets[newRootId].name}" (${newRootId}) with ${idMap.size} widgets total` }] };
  }
);

// ============================================================
//  10. STRUCTURES, ENUMS, DATA TABLES
// ============================================================

server.tool(
  'list_structures',
  'List all custom structure and enum assets.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    let result = '';
    for (const [dir, label] of [['Structures', 'Structures'], ['Enums', 'Enums']] as const) {
      const dp = path.join(projRoot, dir);
      if (!fs.existsSync(dp)) continue;
      const files = fs.readdirSync(dp).filter(f => f.endsWith('.json') && f !== '_index.json');
      result += `${label} (${files.length}):\n`;
      for (const f of files) {
        const data = readJsonFile(path.join(dp, f));
        result += `  ${data.name || data.structName || data.enumName || f} (ID: ${data.id || data.structId || data.enumId})\n`;
      }
    }
    return { content: [{ type: 'text', text: result || 'No structures or enums found.' }] };
  }
);

server.tool(
  'create_structure',
  'Create a custom data structure with typed fields.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Structure name'),
    fields: z.array(z.object({
      name: z.string(),
      type: z.enum(['Float', 'Integer', 'Boolean', 'String', 'Vector3', 'Color', 'Object']),
      defaultValue: z.any().optional(),
    })).describe('Structure fields'),
  },
  async ({ projectPath, name, fields }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'Structures');
    const id = structUid();
    const structJson = {
      structId: id, name,
      fields: fields.map(f => ({ id: varUid(f.name), name: f.name, type: f.type, defaultValue: f.defaultValue ?? null })),
    };
    const fileName = `${safeName(name)}_${id}.json`;
    writeJsonFile(path.join(dir, fileName), structJson);
    updateIndex(dir, 'structId', 'name');
    return { content: [{ type: 'text', text: `Created structure "${name}" (ID: ${id}) with ${fields.length} fields.\nFile: Structures/${fileName}` }] };
  }
);

server.tool(
  'create_enum',
  'Create a custom enum type with named values.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Enum name'),
    values: z.array(z.string()).describe('Enum value names'),
  },
  async ({ projectPath, name, values }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'Enums');
    const id = enumUid();
    const enumJson = {
      enumId: id, name,
      values: values.map((v, i) => ({ name: v, value: i })),
    };
    const fileName = `${safeName(name)}_${id}.json`;
    writeJsonFile(path.join(dir, fileName), enumJson);
    updateIndex(dir, 'enumId', 'name');
    return { content: [{ type: 'text', text: `Created enum "${name}" (ID: ${id}) with values: ${values.join(', ')}` }] };
  }
);

server.tool(
  'list_data_tables',
  'List all data table assets.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'DataTables');
    if (!fs.existsSync(dir)) return { content: [{ type: 'text', text: 'No DataTables folder.' }] };
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_index.json');
    let result = `Data Tables (${files.length}):\n`;
    for (const f of files) {
      const data = readJsonFile(path.join(dir, f));
      result += `  ${data.name || f} (ID: ${data.id || data.dataTableId})\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_data_table',
  'Create a data table with columns and rows.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Data table name'),
    columns: z.array(z.object({
      name: z.string(), type: z.enum(['Float', 'Integer', 'Boolean', 'String']),
    })).describe('Column definitions'),
    rows: z.array(z.record(z.string(), z.any())).optional().describe('Initial row data'),
  },
  async ({ projectPath, name, columns, rows }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'DataTables');
    const id = dtUid();
    const dtJson = {
      dataTableId: id, name,
      columns: columns.map(c => ({ id: varUid(c.name), name: c.name, type: c.type })),
      rows: (rows || []).map((r, i) => ({ id: `row_${i}`, ...r })),
    };
    const fileName = `${safeName(name)}_${id}.json`;
    writeJsonFile(path.join(dir, fileName), dtJson);
    updateIndex(dir, 'dataTableId', 'name');
    return { content: [{ type: 'text', text: `Created data table "${name}" (ID: ${id}) with ${columns.length} columns, ${(rows || []).length} rows.` }] };
  }
);

// ============================================================
//  11. GAME INSTANCE & SAVE GAMES
// ============================================================

server.tool(
  'list_game_instances',
  'List all Game Instance blueprint assets.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'GameInstances');
    if (!fs.existsSync(dir)) return { content: [{ type: 'text', text: 'No GameInstances folder.' }] };
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_index.json');
    let result = `Game Instances (${files.length}):\n`;
    for (const f of files) {
      const data = readJsonFile(path.join(dir, f));
      result += `  ${data.name || f} (ID: ${data.id})\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_game_instance',
  'Create a Game Instance blueprint for persistent game state across levels.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Game Instance name'),
    variables: z.array(z.object({
      name: z.string(), type: z.enum(['Float', 'Integer', 'Boolean', 'String', 'Array']),
      defaultValue: z.any().optional(),
    })).optional().describe('Initial variables'),
    setAsProjectDefault: z.boolean().optional().describe('Set as the project Game Instance class'),
  },
  async ({ projectPath, name, variables, setAsProjectDefault }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'GameInstances');
    const id = giUid();
    const giJson: any = {
      id, name,
      variables: (variables || []).map(v => ({ id: varUid(v.name), name: v.name, type: v.type, defaultValue: v.defaultValue ?? null })),
      functions: [], customEvents: [],
      eventGraphData: defaultEventGraph(), functionGraphData: {},
      compiledCode: '',
    };
    const fileName = `${safeName(name)}_${id}.json`;
    writeJsonFile(path.join(dir, fileName), giJson);
    updateIndex(dir, 'id', 'name');
    if (setAsProjectDefault) {
      const projJsonPath = path.join(projRoot, 'project.json');
      if (fs.existsSync(projJsonPath)) {
        const proj = readJsonFile(projJsonPath);
        proj.gameInstanceClassId = id;
        writeJsonFile(projJsonPath, proj);
      }
    }
    return { content: [{ type: 'text', text: `Created Game Instance "${name}" (ID: ${id})${setAsProjectDefault ? ' — Set as project default' : ''}` }] };
  }
);

server.tool(
  'list_save_game_classes',
  'List all Save Game class assets.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'SaveGameClasses');
    if (!fs.existsSync(dir)) return { content: [{ type: 'text', text: 'No SaveGameClasses folder.' }] };
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_index.json');
    let result = `Save Game Classes (${files.length}):\n`;
    for (const f of files) {
      const data = readJsonFile(path.join(dir, f));
      result += `  ${data.name || f} (ID: ${data.id})\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_save_game_class',
  'Create a Save Game class defining what data to persist.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Save Game class name'),
    variables: z.array(z.object({
      name: z.string(), type: z.enum(['Float', 'Integer', 'Boolean', 'String', 'Vector3', 'Array']),
      defaultValue: z.any().optional(),
    })).describe('Variables to persist'),
  },
  async ({ projectPath, name, variables }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'SaveGameClasses');
    const id = sgUid();
    const sgJson = {
      id, name,
      variables: variables.map(v => ({ id: varUid(v.name), name: v.name, type: v.type, defaultValue: v.defaultValue ?? null })),
    };
    const fileName = `${safeName(name)}_${id}.json`;
    writeJsonFile(path.join(dir, fileName), sgJson);
    updateIndex(dir, 'id', 'name');
    return { content: [{ type: 'text', text: `Created Save Game class "${name}" (ID: ${id}) with ${variables.length} variables.` }] };
  }
);

// ============================================================
//  12. SCENE COMPOSITION (Lights, Sky, Fog, Post-Processing)
// ============================================================

server.tool(
  'get_scene_composition',
  'Get the scene composition settings: lights, sky, fog, post-processing.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const configPath = path.join(projRoot, 'Config', 'composition.json');
    if (!fs.existsSync(configPath)) return { content: [{ type: 'text', text: 'No composition config found.' }] };
    const config = readJsonFile(configPath);
    return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
  }
);

server.tool(
  'set_scene_composition',
  'Update scene composition: lights, skybox, fog, ambient color, post-processing effects. Settings keys: lighting (color, intensity, castShadows, pitch, yaw), environment (turbidity, rayleigh, elevation, azimuth, skyColor, groundColor), fog (enabled, fogDensity, fogColor), postProcessing (toneMappingType, exposure, bloomEnabled, bloomIntensity, bloomThreshold, bloomRadius), ground (planeSize, textureScale, showGridOverlay, visible), playerStart (positionX, positionY, positionZ).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    settings: z.record(z.string(), z.any()).describe('Composition settings object with keys: lighting, environment, fog, postProcessing, ground, playerStart'),
  },
  async ({ projectPath, settings }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const configPath = path.join(projRoot, 'Config', 'composition.json');

    // Load existing composition or start fresh
    let config: any = { worldSettings: { gravity: -980, killZVolume: -500 }, actors: [] };
    if (fs.existsSync(configPath)) {
      const existing = readJsonFile(configPath);
      if (existing.worldSettings) config.worldSettings = existing.worldSettings;
      if (Array.isArray(existing.actors) && existing.actors.length > 0) config.actors = existing.actors;
    }

    // Helper to find or create an actor entry in the actors array
    function upsertActor(actorId: string, actorName: string, actorType: string, category: string, properties: Record<string, any>, visible = true): void {
      const idx = config.actors.findIndex((a: any) => a.actorId === actorId);
      const entry = {
        actorId, actorName, actorType, category,
        locked: false, visible,
        properties,
      };
      if (idx >= 0) {
        // Merge properties into existing actor
        config.actors[idx].properties = { ...config.actors[idx].properties, ...properties };
        if (visible !== undefined) config.actors[idx].visible = visible;
      } else {
        config.actors.push(entry);
      }
    }

    const updated: string[] = [];

    // Lighting → DirectionalLight_Sun actor
    if (settings.lighting) {
      const l = settings.lighting;
      upsertActor('default-sun', 'DirectionalLight_Sun', 'DirectionalLight', 'Lights', {
        color: l.color ?? l.directionalColor ?? '#FFF8F0',
        intensity: l.intensity ?? l.directionalIntensity ?? 1.0,
        castShadows: l.castShadows ?? l.shadows ?? true,
        shadowQuality: l.shadowQuality ?? 2048,
        pitch: l.pitch ?? -50,
        yaw: l.yaw ?? 30,
      });
      updated.push('lighting');
    }

    // Environment → SkyAtmosphere + SkyLight actors
    if (settings.environment) {
      const e = settings.environment;
      upsertActor('default-skyatmosphere', 'SkyAtmosphere', 'SkyAtmosphere', 'Sky', {
        turbidity: e.turbidity ?? 0.3,
        rayleigh: e.rayleigh ?? 0.2,
        elevation: e.elevation ?? 45,
        azimuth: e.azimuth ?? 180,
        generateEnvMap: e.generateEnvMap ?? true,
      });
      upsertActor('default-skylight', 'SkyLight', 'SkyLight', 'Lights', {
        intensity: e.skyLightIntensity ?? 0.4,
        skyColor: e.skyColor ?? '#B4D4F0',
        groundColor: e.groundColor ?? '#AB8860',
      });
      updated.push('environment');
    }

    // Fog → ExponentialHeightFog actor
    if (settings.fog) {
      const f = settings.fog;
      upsertActor('default-fog', 'ExponentialHeightFog', 'ExponentialHeightFog', 'Atmosphere', {
        enabled: f.enabled ?? false,
        fogDensity: f.fogDensity ?? 0.015,
        fogColor: f.fogColor ?? '#b9d5ff',
      }, f.enabled ?? false);
      updated.push('fog');
    }

    // Post-processing → PostProcessVolume actor
    if (settings.postProcessing) {
      const p = settings.postProcessing;
      upsertActor('default-postprocess', 'PostProcessVolume', 'PostProcessVolume', 'PostProcess', {
        isUnbound: true,
        toneMappingType: p.toneMappingType ?? 'ACES',
        exposure: p.exposure ?? p.toneMappingExposure ?? 1.0,
        bloomEnabled: p.bloomEnabled ?? p.bloom ?? true,
        bloomIntensity: p.bloomIntensity ?? 0.15,
        bloomThreshold: p.bloomThreshold ?? 0.85,
        bloomRadius: p.bloomRadius ?? 0.4,
      }, false);
      updated.push('postProcessing');
    }

    // Ground → DevGroundPlane actor
    if (settings.ground) {
      const g = settings.ground;
      upsertActor('default-devground', 'DevGroundPlane', 'DevGroundPlane', 'Geometry', {
        planeSize: g.planeSize ?? 100,
        textureScale: g.textureScale ?? 20,
        showGridOverlay: g.showGridOverlay ?? true,
      }, g.visible ?? false);
      updated.push('ground');
    }

    // PlayerStart
    if (settings.playerStart) {
      const ps = settings.playerStart;
      upsertActor('default-playerstart', 'PlayerStart', 'PlayerStart', 'Gameplay', {
        positionX: ps.positionX ?? 0,
        positionY: ps.positionY ?? 0,
        positionZ: ps.positionZ ?? 0,
      }, false);
      updated.push('playerStart');
    }

    writeJsonFile(configPath, config);
    return { content: [{ type: 'text', text: `Updated composition: ${updated.join(', ')} (${config.actors.length} actors)` }] };
  }
);

// ============================================================
//  12b. MATERIAL MANAGEMENT
// ============================================================

let _matNextId = Date.now();
function matUid(): string { return 'mat_' + (++_matNextId) + '_' + Date.now().toString(36); }

server.tool(
  'create_material',
  'Create a new PBR material asset. Returns the material asset ID for assignment to actors.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Material name (e.g. "M_Red", "M_Metal_Gold")'),
    baseColor: z.string().optional().describe('Base color hex (e.g. "#FF0000" for red). Default: "#CCCCCC"'),
    metalness: z.number().optional().describe('Metalness 0-1 (0=dielectric, 1=metal). Default: 0'),
    roughness: z.number().optional().describe('Roughness 0-1 (0=mirror, 1=matte). Default: 0.5'),
    emissive: z.string().optional().describe('Emissive color hex. Default: "#000000"'),
    emissiveIntensity: z.number().optional().describe('Emissive intensity 0-10. Default: 0'),
    opacity: z.number().optional().describe('Opacity 0-1. Default: 1'),
    doubleSided: z.boolean().optional().describe('Render both faces. Default: false'),
    alphaMode: z.enum(['OPAQUE', 'MASK', 'BLEND']).optional().describe('Alpha/blend mode. Default: "OPAQUE"'),
    type: z.enum(['PBR', 'Basic', 'Phong']).optional().describe('Shading model. Default: "PBR"'),
    clearcoat: z.number().optional().describe('Clearcoat intensity 0-1 (car paint, lacquer)'),
    clearcoatRoughness: z.number().optional().describe('Clearcoat roughness 0-1'),
    sheen: z.number().optional().describe('Sheen intensity 0-1 (fabric, velvet)'),
    sheenRoughness: z.number().optional().describe('Sheen roughness 0-1'),
    sheenColor: z.string().optional().describe('Sheen color hex'),
    transmission: z.number().optional().describe('Transmission 0-1 (glass, water)'),
    ior: z.number().optional().describe('Index of refraction 1.0-2.5 (glass=1.5, water=1.33)'),
    iridescence: z.number().optional().describe('Iridescence 0-1 (soap bubble, oil slick)'),
    flatShading: z.boolean().optional().describe('Use flat shading'),
    wireframe: z.boolean().optional().describe('Render as wireframe'),
    envMapIntensity: z.number().optional().describe('Environment map reflection intensity 0-5'),
  },
  async ({ projectPath, name, baseColor, metalness, roughness, emissive, emissiveIntensity,
    opacity, doubleSided, alphaMode, type, clearcoat, clearcoatRoughness, sheen, sheenRoughness,
    sheenColor, transmission, ior, iridescence, flatShading, wireframe, envMapIntensity }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const meshDir = path.join(projRoot, 'Meshes');
    const matId = matUid();

    const materialData: Record<string, any> = {
      type: type ?? 'PBR',
      baseColor: baseColor ?? '#CCCCCC',
      metalness: metalness ?? 0,
      roughness: roughness ?? 0.5,
      emissive: emissive ?? '#000000',
      emissiveIntensity: emissiveIntensity ?? 0,
      opacity: opacity ?? 1,
      doubleSided: doubleSided ?? false,
      alphaMode: alphaMode ?? 'OPAQUE',
      baseColorMap: null,
      normalMap: null,
      metallicRoughnessMap: null,
      emissiveMap: null,
      occlusionMap: null,
    };

    // Advanced PBR properties (only include if specified)
    if (clearcoat !== undefined) materialData.clearcoat = clearcoat;
    if (clearcoatRoughness !== undefined) materialData.clearcoatRoughness = clearcoatRoughness;
    if (sheen !== undefined) materialData.sheen = sheen;
    if (sheenRoughness !== undefined) materialData.sheenRoughness = sheenRoughness;
    if (sheenColor !== undefined) materialData.sheenColor = sheenColor;
    if (transmission !== undefined) materialData.transmission = transmission;
    if (ior !== undefined) materialData.ior = ior;
    if (iridescence !== undefined) materialData.iridescence = iridescence;
    if (flatShading !== undefined) materialData.flatShading = flatShading;
    if (wireframe !== undefined) materialData.wireframe = wireframe;
    if (envMapIntensity !== undefined) materialData.envMapIntensity = envMapIntensity;

    const matAsset = {
      assetId: matId,
      assetName: name,
      meshAssetId: '',
      materialData,
    };

    // Save to standalone materials file
    const standaloneFile = path.join(meshDir, '_standalone_materials.json');
    let standalone: any = { materials: [], textures: [] };
    if (fs.existsSync(standaloneFile)) {
      try { standalone = readJsonFile(standaloneFile); } catch { /* start fresh */ }
    }
    if (!standalone.materials) standalone.materials = [];
    if (!standalone.textures) standalone.textures = [];
    standalone.materials.push(matAsset);
    writeJsonFile(standaloneFile, standalone);

    return { content: [{ type: 'text', text: `Created material "${name}" (ID: ${matId})\nProperties: baseColor=${materialData.baseColor}, metalness=${materialData.metalness}, roughness=${materialData.roughness}` }] };
  }
);

server.tool(
  'list_materials',
  'List all material assets in the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const meshDir = path.join(projRoot, 'Meshes');
    if (!fs.existsSync(meshDir)) return { content: [{ type: 'text', text: 'No materials found (no Meshes folder).' }] };

    const allMaterials: any[] = [];

    // Collect from mesh bundles
    const files = fs.readdirSync(meshDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    for (const f of files) {
      try {
        const bundle = readJsonFile(path.join(meshDir, f));
        if (bundle.materials) allMaterials.push(...bundle.materials);
      } catch { /* skip */ }
    }

    // Collect from standalone materials
    const standaloneFile = path.join(meshDir, '_standalone_materials.json');
    if (fs.existsSync(standaloneFile)) {
      try {
        const standalone = readJsonFile(standaloneFile);
        if (standalone.materials) allMaterials.push(...standalone.materials);
      } catch { /* skip */ }
    }

    if (allMaterials.length === 0) return { content: [{ type: 'text', text: 'No materials found.' }] };

    let result = `Materials (${allMaterials.length}):\n`;
    for (const m of allMaterials) {
      const d = m.materialData || {};
      result += `  - "${m.assetName}" (ID: ${m.assetId}) — ${d.type || 'PBR'}, color=${d.baseColor}, metal=${d.metalness}, rough=${d.roughness}\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'update_material',
  'Update properties of an existing material asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    materialId: z.string().describe('Material asset ID'),
    properties: z.record(z.string(), z.any()).describe('Material properties to update (e.g. { baseColor: "#FF0000", metalness: 0.8, roughness: 0.2 })'),
  },
  async ({ projectPath, materialId, properties }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const meshDir = path.join(projRoot, 'Meshes');
    if (!fs.existsSync(meshDir)) return { content: [{ type: 'text', text: 'No Meshes folder found.' }] };

    // Search in mesh bundles
    const files = fs.readdirSync(meshDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const filePath = path.join(meshDir, f);
      try {
        const data = readJsonFile(filePath);
        const mats = f.startsWith('_standalone') ? data.materials : (data.materials || []);
        if (!mats) continue;
        const mat = mats.find((m: any) => m.assetId === materialId);
        if (mat) {
          if (!mat.materialData) mat.materialData = {};
          // Update name if provided
          if (properties.assetName) { mat.assetName = properties.assetName; delete properties.assetName; }
          Object.assign(mat.materialData, properties);
          writeJsonFile(filePath, data);
          return { content: [{ type: 'text', text: `Updated material "${mat.assetName}": ${Object.keys(properties).join(', ')}` }] };
        }
      } catch { /* skip */ }
    }

    return { content: [{ type: 'text', text: `Material not found: ${materialId}` }] };
  }
);

server.tool(
  'assign_material_to_actor',
  'Assign a material to an actor\'s root mesh or a specific component. The actor JSON stores material overrides as { "slotIndex": "materialAssetId" }.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('ID of the actor to assign material to'),
    materialId: z.string().describe('Material asset ID to assign'),
    componentName: z.string().optional().describe('Component name to assign to. If omitted, assigns to root mesh.'),
    slotIndex: z.number().optional().describe('Material slot index (default: 0 = primary material)'),
  },
  async ({ projectPath, actorId, materialId, componentName, slotIndex }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };

    const slot = String(slotIndex ?? 0);

    if (!componentName) {
      // Assign to root mesh
      if (!actor.rootMaterialOverrides) actor.rootMaterialOverrides = {};
      actor.rootMaterialOverrides[slot] = materialId;
      actor.modifiedAt = Date.now();
      writeJsonFile(filePath, actor);
      return { content: [{ type: 'text', text: `Assigned material "${materialId}" to root mesh slot ${slot} of "${actor.actorName}"` }] };
    } else {
      // Assign to component
      const comp = (actor.components || []).find((c: any) => c.name === componentName);
      if (!comp) return { content: [{ type: 'text', text: `Component "${componentName}" not found on "${actor.actorName}". Available: ${(actor.components || []).map((c: any) => c.name).join(', ')}` }] };
      if (!comp.materialOverrides) comp.materialOverrides = {};
      comp.materialOverrides[slot] = materialId;
      actor.modifiedAt = Date.now();
      writeJsonFile(filePath, actor);
      return { content: [{ type: 'text', text: `Assigned material "${materialId}" to component "${componentName}" slot ${slot} of "${actor.actorName}"` }] };
    }
  }
);

server.tool(
  'delete_material',
  'Delete a material asset by ID.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    materialId: z.string().describe('Material asset ID to delete'),
  },
  async ({ projectPath, materialId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const meshDir = path.join(projRoot, 'Meshes');
    if (!fs.existsSync(meshDir)) return { content: [{ type: 'text', text: 'No Meshes folder found.' }] };

    const files = fs.readdirSync(meshDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const filePath = path.join(meshDir, f);
      try {
        const data = readJsonFile(filePath);
        const mats = f.startsWith('_standalone') ? data.materials : (data.materials || []);
        if (!mats) continue;
        const idx = mats.findIndex((m: any) => m.assetId === materialId);
        if (idx >= 0) {
          const name = mats[idx].assetName;
          mats.splice(idx, 1);
          writeJsonFile(filePath, data);
          return { content: [{ type: 'text', text: `Deleted material "${name}" (${materialId})` }] };
        }
      } catch { /* skip */ }
    }

    return { content: [{ type: 'text', text: `Material not found: ${materialId}` }] };
  }
);

// ============================================================
//  13. INPUT MAPPINGS
// ============================================================

server.tool(
  'get_input_mappings',
  'Get the current input mapping configuration.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const dir = path.join(projRoot, 'Config');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.includes('input') && f.endsWith('.json')) : [];
    if (files.length === 0) return { content: [{ type: 'text', text: 'No input mapping config found.' }] };
    let result = '';
    for (const f of files) {
      result += `${f}:\n${JSON.stringify(readJsonFile(path.join(dir, f)), null, 2)}\n\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

// ============================================================
//  14. CLASS INHERITANCE
// ============================================================

server.tool(
  'get_class_hierarchy',
  'Get the class inheritance hierarchy showing parent/child relationships between actors.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const inheritancePath = path.join(projRoot, 'Config', 'inheritance.json');
    if (!fs.existsSync(inheritancePath)) return { content: [{ type: 'text', text: 'No inheritance config found.' }] };
    const inheritance = readJsonFile(inheritancePath);
    return { content: [{ type: 'text', text: JSON.stringify(inheritance, null, 2) }] };
  }
);

// ============================================================
//  15. BULK OPERATIONS
// ============================================================

server.tool(
  'setup_2d_character_complete',
  'One-shot tool: Create a complete 2D character setup from a sprite sheet texture. Creates the sprite sheet, defines animations (idle, walk, etc.), creates a 2D animation blueprint with states and transitions, creates the character pawn, and wires everything together.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    characterName: z.string().describe('Character name (e.g. "Player")'),
    textureFile: z.string().describe('Sprite sheet texture in Textures/ folder'),
    textureWidth: z.number().describe('Texture width in pixels'),
    textureHeight: z.number().describe('Texture height in pixels'),
    cellWidth: z.number().describe('Cell width in pixels'),
    cellHeight: z.number().describe('Cell height in pixels'),
    preset: z.enum(['platformer', 'topdown']).describe('Movement preset'),
    animations: z.array(z.object({
      name: z.string().describe('Animation name (e.g. "Idle", "Walk")'),
      frameIndices: z.array(z.number()).describe('Frame indices from the sprite sheet'),
      fps: z.number().optional().describe('FPS (default: 12)'),
      loop: z.boolean().optional().describe('Loop (default: true)'),
    })).describe('Animations to create'),
    transitions: z.array(z.object({
      from: z.string().describe('Source state name'),
      to: z.string().describe('Destination state name'),
      rules: z.array(z.object({
        variable: z.string(),
        operator: z.enum(['==', '!=', '>', '<', '>=', '<=']),
        value: z.union([z.number(), z.boolean(), z.string()]),
      }))
    })).optional().describe('Transitions between animation states'),
    sceneName: z.string().optional().describe('Scene to place the character in'),
  },
  async ({ projectPath, characterName, textureFile, textureWidth, textureHeight, cellWidth, cellHeight, preset, animations, transitions, sceneName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const log: string[] = [];

    // 1. Create Sprite Sheet
    const spritesDir = path.join(projRoot, 'Sprites');
    const cols = Math.floor(textureWidth / cellWidth);
    const rows = Math.floor(textureHeight / cellHeight);
    const sprites: any[] = [];
    let idx = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        sprites.push({
          spriteId: `sprite_${idx}`, name: `${characterName}_${idx}`,
          x: col * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight,
          pivot: { x: 0.5, y: 0.5 },
        });
        idx++;
      }
    }
    const texPath = path.join(projRoot, 'Textures', textureFile);
    let imageDataUrl: string | undefined, imagePath: string | undefined;
    if (fs.existsSync(texPath)) {
      const img = fs.readFileSync(texPath);
      const ext = path.extname(textureFile).toLowerCase();
      imageDataUrl = `data:${ext === '.png' ? 'image/png' : 'image/jpeg'};base64,${img.toString('base64')}`;
      imagePath = `Textures/${textureFile}`;
    }
    const ssId = spriteUid();
    const spriteSheet: any = {
      assetId: ssId, assetType: 'spriteSheet', assetName: `${characterName}Sprites`,
      sourceTexture: textureFile, textureWidth, textureHeight,
      pixelsPerUnit: 100, filterMode: 'point',
      sprites, animations: [], imageDataUrl, imagePath,
    };
    // Add animations to sheet
    for (const anim of animations) {
      const frames = anim.frameIndices.map(i => sprites[i]?.spriteId || `sprite_${i}`);
      spriteSheet.animations.push({
        animId: `anim_${Date.now().toString(36)}_${(++_uid).toString(36)}`,
        animName: anim.name, frames, fps: anim.fps ?? 12, loop: anim.loop ?? true, events: [],
      });
    }
    const ssFileName = `${safeName(characterName)}Sprites_${ssId}.json`;
    writeJsonFile(path.join(spritesDir, ssFileName), spriteSheet);
    log.push(`Created sprite sheet (ID: ${ssId}) with ${sprites.length} sprites, ${animations.length} animations`);

    // Register in 2D scenes
    const scenesDir = path.join(projRoot, 'Scenes');
    if (fs.existsSync(scenesDir)) {
      for (const sf of fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'))) {
        const sp = path.join(scenesDir, sf);
        const scene = readJsonFile(sp);
        if (scene.sceneMode === '2D' && scene.scene2DConfig) {
          scene.scene2DConfig.spriteSheets = scene.scene2DConfig.spriteSheets || [];
          if (!scene.scene2DConfig.spriteSheets.some((s: any) => s.assetId === ssId)) {
            scene.scene2DConfig.spriteSheets.push({ ...spriteSheet, imageDataUrl: undefined });
            writeJsonFile(sp, scene);
          }
        }
      }
    }

    // 2. Create Animation Blueprint 2D
    const abpDir = path.join(projRoot, 'AnimBlueprints');
    const abpId = animUid();
    const states: any[] = [];
    for (let i = 0; i < animations.length; i++) {
      states.push({
        id: animUid(), name: animations[i].name,
        posX: 200 + i * 250, posY: 200,
        outputType: 'spriteAnimation', animationId: '', animationName: '',
        loop: animations[i].loop ?? true, playRate: 1,
        blendSpace1DId: '', blendSpaceAxisVar: '',
        blendSpace2DId: '', blendSpaceAxisVarX: '', blendSpaceAxisVarY: '',
        spriteSheetId: ssId, spriteAnimationName: animations[i].name,
        spriteAnimFPS: animations[i].fps ?? 12, spriteAnimLoop: animations[i].loop ?? true,
        blendSprite1DId: '', blendSpriteAxisVar: '',
      });
    }
    const abpTransitions: any[] = [];
    if (transitions) {
      for (const t of transitions) {
        const fromState = t.from === '*' ? { id: '*' } : states.find(s => s.name === t.from);
        const toState = states.find(s => s.name === t.to);
        if (fromState && toState) {
          abpTransitions.push({
            id: animUid(), fromStateId: fromState.id, toStateId: toState.id,
            rules: [{ id: animUid(), op: 'AND', rules: t.rules.map(r => ({
              id: animUid(), kind: 'compare', varName: r.variable, op: r.operator, value: r.value,
              valueType: typeof r.value === 'boolean' ? 'Boolean' : typeof r.value === 'number' ? 'Float' : 'String',
            }))}],
            ruleLogic: 'AND', blendTime: 0.1,
            blendProfile: { time: 0.1, curve: 'linear' },
            priority: t.from === '*' ? 100 : 0,
          });
        }
      }
    }
    // Collect unique variable names from transitions
    const transVarNames = new Set<string>();
    for (const t of (transitions || [])) { for (const r of t.rules) transVarNames.add(r.variable); }
    transVarNames.add('speed'); transVarNames.add('isInAir');
    const eventVars = Array.from(transVarNames).map(name => ({
      name, type: name.startsWith('is') ? 'boolean' : 'number',
      defaultValue: name.startsWith('is') ? false : 0,
    }));
    const abpJson = {
      animBlueprintVersion: 2, animBlueprintId: abpId, animBlueprintName: `${characterName}AnimBP`,
      targetSkeletonMeshAssetId: '',
      stateMachine: { entryStateId: states[0]?.id || '', states, transitions: abpTransitions },
      blendSpaces1D: [], blendSpaces2D: [], blendSprites1D: [],
      eventVariables: eventVars, eventGraph: null, compiledCode: '',
      blueprintGraphNodeData: null, is2D: true, targetSpriteSheetId: ssId,
    };
    const abpFileName = `${safeName(characterName)}AnimBP_${abpId}.json`;
    writeJsonFile(path.join(abpDir, abpFileName), abpJson);
    updateIndex(abpDir, 'animBlueprintId', 'animBlueprintName');
    log.push(`Created anim blueprint (ID: ${abpId}) with ${states.length} states, ${abpTransitions.length} transitions`);

    // 3. Create Character Pawn 2D
    const actorsDir = path.join(projRoot, 'Actors');
    const actorId = assetUid();
    const ts = Date.now().toString(36);
    const actorJson: any = {
      actorId, actorName: characterName, actorType: 'characterPawn2D',
      description: `2D Character — ${preset} preset (auto-created)`,
      rootMeshType: 'none', rootPhysics: defaultPhysicsConfig(),
      components: [
        { id: `comp_sprite_${ts}`, type: 'spriteRenderer', meshType: 'cube', name: 'SpriteRenderer',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          spriteSheetId: ssId, animBlueprint2dId: abpId },
        { id: `comp_rb2d_${ts}`, type: 'rigidbody2d', meshType: 'cube', name: 'RigidBody2D',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          rigidbody2dType: 'dynamic' },
        { id: `comp_col2d_${ts}`, type: 'collider2d', meshType: 'cube', name: 'BoxCollider2D',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          collider2dShape: 'box', collider2dSize: { width: 0.8, height: 1.0 } },
        { id: `comp_cm2d_${ts}`, type: 'characterMovement2d', meshType: 'cube', name: 'CharacterMovement2D',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        { id: compUid(), type: 'camera2d', meshType: 'cube', name: 'Camera2D',
          offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          hiddenInGame: true, camera2dConfig: defaultCamera2DConfig() },
      ],
      variables: [], functions: [], macros: [], customEvents: [], structs: [],
      eventGraphData: eventGraph2DForPreset(preset), functionGraphData: {},
      compiledCode: '',
      characterMovement2DConfig: defaultCharacterMovement2DConfig(preset),
      controllerClass: 'None', sceneMode: '2D',
      createdAt: Date.now(), modifiedAt: Date.now(),
    };
    const actorFileName = `${safeName(characterName)}_${actorId}.json`;
    writeJsonFile(path.join(actorsDir, actorFileName), actorJson);
    updateIndex(actorsDir, 'actorId', 'actorName');
    log.push(`Created character pawn (ID: ${actorId}) with sprite→anim wired, ${preset} event graph`);

    // 4. Place in scene
    if (sceneName) {
      const scenePath = path.join(projRoot, 'Scenes', `${sceneName}.json`);
      if (fs.existsSync(scenePath)) {
        const scene = readJsonFile(scenePath);
        scene.gameObjects = scene.gameObjects || [];
        scene.gameObjects.push({
          name: characterName,
          meshType: 'none', position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          hasPhysics: false, actorAssetId: actorId, actorType: 'characterPawn2D',
        });
        writeJsonFile(scenePath, scene);
        log.push(`Placed in scene "${sceneName}"`);
      }
    }

    return { content: [{ type: 'text', text:
      `✅ Complete 2D Character Setup: "${characterName}"\n` +
      `─────────────────────────────────────\n` +
      log.map((l, i) => `${i + 1}. ${l}`).join('\n') + '\n\n' +
      `Asset IDs:\n` +
      `  Sprite Sheet: ${ssId}\n` +
      `  Anim Blueprint: ${abpId}\n` +
      `  Character Actor: ${actorId}\n\n` +
      `The engine will auto-reload when it detects these file changes.`
    }] };
  }
);

// ============================================================
//  16. SEARCH & QUERY
// ============================================================

server.tool(
  'search_assets',
  'Search for assets by name across all asset types (actors, sprites, animations, widgets, etc.).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    query: z.string().describe('Search query (partial name match)'),
  },
  async ({ projectPath, query }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const q = query.toLowerCase();
    const results: string[] = [];

    const searchDir = (dir: string, label: string, nameFields: string[]) => {
      const dp = path.join(projRoot, dir);
      if (!fs.existsSync(dp)) return;
      for (const f of fs.readdirSync(dp).filter(f => f.endsWith('.json') && f !== '_index.json')) {
        const data = readJsonFile(path.join(dp, f));
        for (const nf of nameFields) {
          if (data[nf] && data[nf].toLowerCase().includes(q)) {
            results.push(`[${label}] ${data[nf]} (ID: ${data.actorId || data.assetId || data.animBlueprintId || data.id || data.structId || data.enumId})`);
            break;
          }
        }
      }
    };

    searchDir('Actors', 'Actor', ['actorName']);
    searchDir('Sprites', 'Sprite Sheet', ['assetName', 'name']);
    searchDir('AnimBlueprints', 'Anim BP', ['animBlueprintName']);
    searchDir('Widgets', 'Widget', ['name', 'widgetName']);
    searchDir('Structures', 'Structure', ['name', 'structName']);
    searchDir('Enums', 'Enum', ['name', 'enumName']);
    searchDir('GameInstances', 'Game Instance', ['name']);
    searchDir('SaveGameClasses', 'Save Game', ['name']);
    searchDir('DataTables', 'Data Table', ['name']);
    searchDir('Scenes', 'Scene', ['name']);
    searchDir('Sounds', 'Sound', ['assetName', 'name']);
    searchDir('SoundCues', 'Sound Cue', ['assetName', 'name']);
    searchDir('Particles', 'Particle', ['assetName', 'name']);
    searchDir('BehaviorTrees', 'Behavior Tree', ['assetName', 'name']);
    searchDir('InputMappings', 'Input Mapping', ['name']);
    searchDir('Fonts', 'Font', ['displayName', 'assetName']);

    if (results.length === 0) return { content: [{ type: 'text', text: `No assets matching "${query}".` }] };
    return { content: [{ type: 'text', text: `Search results for "${query}" (${results.length}):\n${results.join('\n')}` }] };
  }
);

// ============================================================
//  16a. VIEWPORT SCREENSHOT
// ============================================================

server.tool(
  'capture_viewport',
  'Capture a screenshot of the engine viewport. Returns the current 3D/2D view as an image so AI can see what the user sees. Requires the engine editor to be open with the WebSocket bridge connected.',
  {
    maxWidth: z.number().optional().describe('Max image width in pixels (default: 1280, smaller = faster)'),
  },
  async ({ maxWidth }) => {
    const response = await bridgeRequest('capture_viewport', { maxWidth: maxWidth || 1280 });
    if (!response) return { content: [{ type: 'text', text: 'Could not capture viewport — is the engine editor running with the MCP bridge connected?' }] };
    if (!response.success) return { content: [{ type: 'text', text: 'Screenshot failed: ' + (response.error || 'unknown error') }] };
    const dataUrl: string = response.imageDataUrl || '';
    if (!dataUrl) return { content: [{ type: 'text', text: 'Screenshot returned empty image' }] };
    // Strip data:image/png;base64, prefix
    const commaIdx = dataUrl.indexOf(',');
    const base64 = commaIdx >= 0 ? dataUrl.substring(commaIdx + 1) : dataUrl;
    const mimeMatch = dataUrl.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    return { content: [
      { type: 'text', text: 'Viewport screenshot captured successfully.' },
      { type: 'image', data: base64, mimeType },
    ]};
  }
);

// ============================================================
//  16a2. 3D MESH IMPORT
// ============================================================

server.tool(
  'import_mesh',
  'Import a 3D mesh file (GLB, GLTF, FBX, OBJ) into the project. Copies the file into the Meshes folder and creates a mesh asset JSON with the binary data embedded as base64.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sourcePath: z.string().describe('Absolute path to the source 3D mesh file'),
    assetName: z.string().describe('Name for the mesh asset'),
    meshType: z.enum(['staticMesh', 'skeletalMesh']).optional().describe('Mesh type (default: staticMesh)'),
    targetName: z.string().optional().describe('Override filename in Meshes folder'),
  },
  async ({ projectPath, sourcePath, assetName, meshType, targetName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    if (!fs.existsSync(sourcePath)) return { content: [{ type: 'text', text: 'Source file not found: ' + sourcePath }] };
    const meshDir = path.join(projRoot, 'Meshes');
    if (!fs.existsSync(meshDir)) fs.mkdirSync(meshDir, { recursive: true });

    const fileName = targetName || path.basename(sourcePath);
    const ext = path.extname(fileName).toLowerCase();
    const supported = ['.glb', '.gltf', '.fbx', '.obj', '.dae', '.stl', '.ply'];
    if (!supported.includes(ext)) return { content: [{ type: 'text', text: 'Unsupported format "' + ext + '". Supported: ' + supported.join(', ') }] };

    // Copy mesh file
    const targetPath = path.join(meshDir, fileName);
    fs.copyFileSync(sourcePath, targetPath);

    // Read as base64 for GLB embedding
    const fileData = fs.readFileSync(sourcePath);
    const base64Data = fileData.toString('base64');

    // Create mesh asset JSON
    const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const assetId = 'mesh_' + uid;
    const mType = meshType || 'staticMesh';
    const meshAsset: any = {
      assetId: assetId,
      assetType: mType,
      assetName: assetName,
      sourceFile: fileName,
      importDate: new Date().toISOString(),
      importSettings: {
        meshSettings: { combineMeshes: true, generateNormals: true, generateTangents: false, uvChannels: 1 },
        skeletonSettings: { maxBoneInfluences: 4 },
        lodSettings: { generateLODs: false },
        collisionSettings: { generateCollision: false, collisionType: 'none' },
        animationSettings: { importAnimations: mType === 'skeletalMesh', sampleRate: 30 },
        materialSettings: { importMaterials: true },
      },
      meshData: {
        vertexCount: 0, triangleCount: 0, boundingBox: { min: [0,0,0], max: [1,1,1] },
        hasNormals: true, hasTangents: false, hasUVs: true, hasColors: false,
      },
      materials: [],
      textures: [],
      animations: [],
      skeleton: null,
      lods: [],
      collisionData: null,
      importReport: null,
      glbDataBase64: ext === '.glb' ? base64Data : '',
      rawFileBase64: ext !== '.glb' ? base64Data : '',
      thumbnail: '',
    };

    const jsonFileName = safeName(assetName) + '_' + assetId + '.json';
    writeJsonFile(path.join(meshDir, jsonFileName), meshAsset);
    updateIndex(meshDir, 'assetId', 'assetName');

    return { content: [{ type: 'text', text:
      'Imported mesh "' + assetName + '" (ID: ' + assetId + ')\n' +
      'Type: ' + mType + '\n' +
      'Format: ' + ext + ' (' + (fileData.length / 1024).toFixed(1) + ' KB)\n' +
      'File: Meshes/' + jsonFileName + '\n\n' +
      'Use add_component_to_actor with type "skeletalMesh" or "mesh" and property meshAssetId: "' + assetId + '" to attach to an actor.' }] };
  }
);

// ============================================================
//  16a3. LIST MESHES
// ============================================================

server.tool(
  'list_meshes',
  'List all imported 3D mesh assets in the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const meshDir = path.join(projRoot, 'Meshes');
    if (!fs.existsSync(meshDir)) return { content: [{ type: 'text', text: 'No Meshes folder found.' }] };
    const files = fs.readdirSync(meshDir).filter(f => f.endsWith('.json') && f !== '_index.json');
    if (files.length === 0) return { content: [{ type: 'text', text: 'No mesh assets found.' }] };
    let result = 'Mesh Assets (' + files.length + '):\n';
    for (const f of files) {
      const asset = readJsonFile(path.join(meshDir, f));
      result += '  [' + (asset.assetType || 'staticMesh') + '] ' + (asset.assetName || f) + ' (ID: ' + asset.assetId + ')';
      if (asset.sourceFile) result += ' — ' + asset.sourceFile;
      result += '\n';
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

// ============================================================
//  16a4. 3D ANIMATION BLUEPRINT
// ============================================================

server.tool(
  'create_anim_blueprint_3d',
  'Create a 3D animation blueprint (state machine) for a skeletal mesh. Links to a mesh asset and manages animation states, transitions, and blend spaces.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Animation blueprint name'),
    meshAssetId: z.string().describe('Target skeletal mesh asset ID'),
    variables: z.array(z.object({
      name: z.string(), type: z.enum(['Float', 'Integer', 'Boolean', 'String']),
      defaultValue: z.union([z.number(), z.boolean(), z.string()]).optional(),
    })).optional().describe('Variables for transition conditions'),
  },
  async ({ projectPath, name, meshAssetId, variables }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const abpDir = path.join(projRoot, 'AnimBlueprints');
    if (!fs.existsSync(abpDir)) fs.mkdirSync(abpDir, { recursive: true });

    const abpId = 'abp_' + Date.now().toString(36) + '_' + (++_uid).toString(36);
    const idleStateId = animUid();
    const bpVars = [
      { name: 'speed', type: 'Float', defaultValue: 0 },
      { name: 'isInAir', type: 'Boolean', defaultValue: false },
      { name: 'isGrounded', type: 'Boolean', defaultValue: true },
      { name: 'isCrouching', type: 'Boolean', defaultValue: false },
      ...(variables || []).map(v => ({ name: v.name, type: v.type, defaultValue: v.defaultValue ?? (v.type === 'Float' || v.type === 'Integer' ? 0 : v.type === 'Boolean' ? false : '') })),
    ];

    const idleState: any = {
      id: idleStateId, name: 'Idle',
      posX: 400, posY: 200,
      outputType: 'singleAnimation',
      animationId: '', animationName: 'Idle',
      loop: true, playRate: 1,
      blendSpace1DId: '', blendSpaceAxisVar: '',
      blendSpace2DId: '', blendSpaceAxisVarX: '', blendSpaceAxisVarY: '',
      spriteSheetId: '', spriteAnimationName: '',
      spriteAnimFPS: 0, spriteAnimLoop: true,
      blendSprite1DId: '', blendSpriteAxisVar: '',
    };

    const abpJson: any = {
      animBlueprintVersion: 2, animBlueprintId: abpId, animBlueprintName: name,
      targetSkeletonMeshAssetId: meshAssetId,
      stateMachine: { entryStateId: idleStateId, states: [idleState], transitions: [] },
      blendSpaces1D: [], blendSpaces2D: [],
      variables: bpVars,
      eventGraph: { nodes: [], connections: [] },
      is2D: false,
      targetSpriteSheetId: '',
      blendSprites1D: [],
    };

    const fileName = safeName(name) + '_' + abpId + '.json';
    writeJsonFile(path.join(abpDir, fileName), abpJson);
    updateIndex(abpDir, 'animBlueprintId', 'animBlueprintName');

    return { content: [{ type: 'text', text:
      'Created 3D Animation Blueprint "' + name + '" (ID: ' + abpId + ')\n' +
      'Target Mesh: ' + meshAssetId + '\n' +
      'Entry State: Idle\n' +
      'Variables: ' + bpVars.map(v => v.name + ' (' + v.type + ')').join(', ') + '\n' +
      'File: AnimBlueprints/' + fileName + '\n\n' +
      'Next: add_anim_state (use outputType "singleAnimation" for 3D), add_anim_transition, then add_component_to_actor with skeletalMesh + animationBlueprintId' }] };
  }
);

// ============================================================
//  16b. TEXTURE ANALYSIS
// ============================================================

server.tool(
  'analyze_texture',
  'Analyze a texture/sprite sheet image to detect dimensions and suggest cell sizes for slicing. Returns the image for visual inspection plus grid layout suggestions.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    textureFile: z.string().describe('Filename in Textures folder (e.g. "player.png")'),
  },
  async ({ projectPath, textureFile }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const texPath = path.join(projRoot, 'Textures', textureFile);
    if (!fs.existsSync(texPath)) return { content: [{ type: 'text', text: 'Texture not found: ' + textureFile }] };
    const data = fs.readFileSync(texPath);
    const ext = path.extname(textureFile).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';

    let width = 0, height = 0;
    if (ext === '.png' && data.length > 24) {
      width = data.readUInt32BE(16);
      height = data.readUInt32BE(20);
    } else if ((ext === '.jpg' || ext === '.jpeg') && data.length > 2) {
      let i = 2;
      while (i < data.length - 8) {
        if (data[i] === 0xFF) {
          const marker = data[i + 1];
          if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
            height = data.readUInt16BE(i + 5);
            width = data.readUInt16BE(i + 7);
            break;
          }
          const segLen = data.readUInt16BE(i + 2);
          i += 2 + segLen;
        } else { i++; }
      }
    } else if (ext === '.webp' && data.length > 30) {
      if (data.slice(12, 16).toString() === 'VP8 ') {
        width = data.readUInt16LE(26) & 0x3FFF;
        height = data.readUInt16LE(28) & 0x3FFF;
      }
    }

    const commonSizes = [8, 16, 24, 32, 48, 64, 96, 128, 256];
    const suggestions: string[] = [];
    if (width > 0 && height > 0) {
      for (const cw of commonSizes) {
        for (const ch of commonSizes) {
          if (width % cw === 0 && height % ch === 0) {
            const c = width / cw, r = height / ch, total = c * r;
            if (total >= 2 && total <= 1024 && c >= 1 && r >= 1) {
              suggestions.push('  ' + cw + 'x' + ch + ' -> ' + c + ' cols x ' + r + ' rows = ' + total + ' cells');
            }
          }
        }
      }
    }

    const info = [
      'Texture: ' + textureFile, 'Size: ' + (data.length / 1024).toFixed(1) + ' KB',
      'Format: ' + mimeType, 'Dimensions: ' + width + ' x ' + height + ' px', '',
      'Suggested Grid Layouts (cell sizes that divide evenly):',
      ...(suggestions.length > 0 ? suggestions.slice(0, 20) : ['  No perfect grid divisions found']),
    ].join('\n');
    return { content: [{ type: 'text', text: info }, { type: 'image', data: data.toString('base64'), mimeType }] };
  }
);

// ============================================================
//  16c. TILEMAP TOOLS
// ============================================================

server.tool(
  'create_tileset',
  'Create a tileset asset from a texture for tilemaps. Divides the image into a grid of tiles with optional collision.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Tileset name'),
    textureFile: z.string().describe('Texture filename in Textures folder'),
    textureWidth: z.number().describe('Texture width in pixels'),
    textureHeight: z.number().describe('Texture height in pixels'),
    tileWidth: z.number().describe('Width of each tile in pixels'),
    tileHeight: z.number().describe('Height of each tile in pixels'),
    pixelsPerUnit: z.number().optional().describe('Pixels per world unit (default: 100)'),
    collisionTileIds: z.array(z.number()).optional().describe('Tile IDs with full collision (solid tiles)'),
    sceneName: z.string().optional().describe('2D scene to register this tileset in (all 2D scenes if omitted)'),
  },
  async ({ projectPath, name, textureFile, textureWidth, textureHeight, tileWidth, tileHeight, pixelsPerUnit, collisionTileIds, sceneName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const ppu = pixelsPerUnit || 100;
    const cols = Math.floor(textureWidth / tileWidth);
    const rows = Math.floor(textureHeight / tileHeight);
    const totalTiles = cols * rows;
    const solidSet = new Set(collisionTileIds || []);
    const tiles: any[] = [];
    for (let i = 0; i < totalTiles; i++) {
      tiles.push({ tileId: i, tags: [], collision: solidSet.has(i) ? 'full' : 'none' });
    }
    const texPath = path.join(projRoot, 'Textures', textureFile);
    let imageDataUrl: string | undefined, imagePath: string | undefined;
    if (fs.existsSync(texPath)) {
      const imgData = fs.readFileSync(texPath);
      const e = path.extname(textureFile).toLowerCase();
      imageDataUrl = 'data:' + (e === '.png' ? 'image/png' : 'image/jpeg') + ';base64,' + imgData.toString('base64');
      imagePath = 'Textures/' + textureFile;
    }
    const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const assetId = 'tileset-' + uid;
    const tileset: any = {
      assetId, assetType: 'tileset', assetName: name,
      sourceTexture: textureFile, textureWidth, textureHeight,
      tileWidth, tileHeight, columns: cols, rows,
      pixelsPerUnit: ppu, tiles, animatedTiles: [],
      imageDataUrl, imagePath,
    };
    const scenesDir = path.join(projRoot, 'Scenes');
    if (fs.existsSync(scenesDir)) {
      const sceneFiles = sceneName ? [sceneName + '.json'] : fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'));
      for (const sf of sceneFiles) {
        const sp = path.join(scenesDir, sf);
        if (!fs.existsSync(sp)) continue;
        const scene = readJsonFile(sp);
        if (scene.sceneMode === '2D' || scene.scene2DConfig) {
          if (!scene.scene2DConfig) scene.scene2DConfig = {};
          scene.scene2DConfig.tilesets = scene.scene2DConfig.tilesets || [];
          if (!scene.scene2DConfig.tilesets.some((t: any) => t.assetId === assetId)) {
            scene.scene2DConfig.tilesets.push(tileset);
            writeJsonFile(sp, scene);
          }
        }
      }
    }
    return { content: [{ type: 'text', text: 'Created tileset "' + name + '" (ID: ' + assetId + ')\nGrid: ' + cols + 'x' + rows + ' = ' + totalTiles + ' tiles (' + tileWidth + 'x' + tileHeight + ' px each)\nCollision tiles: ' + solidSet.size + '\nPPU: ' + ppu }] };
  }
);

server.tool(
  'create_tilemap',
  'Create a tilemap asset with 4 default layers: Background (z:0), Ground (z:10, collision), Decoration (z:15), Foreground (z:70).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Tilemap name'),
    tilesetId: z.string().describe('ID of the tileset to use'),
    pixelsPerUnit: z.number().optional().describe('PPU (default: 100)'),
    sceneName: z.string().optional().describe('2D scene to register this tilemap in (all 2D scenes if omitted)'),
  },
  async ({ projectPath, name, tilesetId, pixelsPerUnit, sceneName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const ppu = pixelsPerUnit || 100;
    const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const tilemap: any = {
      assetId: 'tilemap-' + uid, assetType: 'tilemap', assetName: name, tilesetId, pixelsPerUnit: ppu,
      layers: [
        { layerId: 'layer-bg-' + uid, name: 'Background', z: 0, visible: true, locked: false, hasCollision: false, tiles: {} },
        { layerId: 'layer-ground-' + uid, name: 'Ground', z: 10, visible: true, locked: false, hasCollision: true, tiles: {} },
        { layerId: 'layer-deco-' + uid, name: 'Decoration', z: 15, visible: true, locked: false, hasCollision: false, tiles: {} },
        { layerId: 'layer-fg-' + uid, name: 'Foreground', z: 70, visible: true, locked: false, hasCollision: false, tiles: {} },
      ],
    };
    const scenesDir = path.join(projRoot, 'Scenes');
    if (fs.existsSync(scenesDir)) {
      const sceneFiles = sceneName ? [sceneName + '.json'] : fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'));
      for (const sf of sceneFiles) {
        const sp = path.join(scenesDir, sf);
        if (!fs.existsSync(sp)) continue;
        const scene = readJsonFile(sp);
        if (scene.sceneMode === '2D' || scene.scene2DConfig) {
          if (!scene.scene2DConfig) scene.scene2DConfig = {};
          scene.scene2DConfig.tilemaps = scene.scene2DConfig.tilemaps || [];
          if (!scene.scene2DConfig.tilemaps.some((t: any) => t.assetId === tilemap.assetId)) {
            scene.scene2DConfig.tilemaps.push(tilemap);
            writeJsonFile(sp, scene);
          }
        }
      }
    }
    const layerInfo = tilemap.layers.map((l: any) => '  ' + l.name + ' (z:' + l.z + (l.hasCollision ? ', collision' : '') + ')').join('\n');
    return { content: [{ type: 'text', text: 'Created tilemap "' + name + '" (ID: ' + tilemap.assetId + ')\nTileset: ' + tilesetId + '\nLayers:\n' + layerInfo }] };
  }
);

server.tool(
  'paint_tiles',
  'Paint tiles on a tilemap layer. Supports individual tiles, rectangular fill, and border painting (walls/floors). Used to procedurally build levels.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('2D scene name'),
    tilemapId: z.string().describe('Tilemap asset ID'),
    layerName: z.string().describe('Layer name (e.g. "Ground", "Background")'),
    tiles: z.array(z.object({
      x: z.number(), y: z.number(),
      tileId: z.number().describe('Tile ID from tileset (-1 to erase)'),
    })).optional().describe('Individual tiles to paint'),
    fillRect: z.object({
      x: z.number(), y: z.number(),
      width: z.number(), height: z.number(),
      tileId: z.number(),
    }).optional().describe('Fill a rectangle with a tile'),
    fillBorder: z.object({
      x: z.number(), y: z.number(),
      width: z.number(), height: z.number(),
      tileId: z.number().describe('Border tile'),
      fillTileId: z.number().optional().describe('Interior fill tile'),
    }).optional().describe('Paint a rectangular border'),
  },
  async ({ projectPath, sceneName, tilemapId, layerName, tiles, fillRect, fillBorder }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: 'Scene not found: ' + sceneName }] };
    const scene = readJsonFile(scenePath);
    const tilemaps = scene.scene2DConfig?.tilemaps || [];
    const tilemap = tilemaps.find((t: any) => t.assetId === tilemapId);
    if (!tilemap) return { content: [{ type: 'text', text: 'Tilemap not found: ' + tilemapId }] };
    const layer = tilemap.layers.find((l: any) => l.name === layerName);
    if (!layer) return { content: [{ type: 'text', text: 'Layer "' + layerName + '" not found. Available: ' + tilemap.layers.map((l: any) => l.name).join(', ') }] };
    let count = 0;
    if (tiles) {
      for (const t of tiles) {
        const key = t.x + ',' + t.y;
        if (t.tileId < 0) { delete layer.tiles[key]; } else { layer.tiles[key] = t.tileId; }
        count++;
      }
    }
    if (fillRect) {
      for (let dy = 0; dy < fillRect.height; dy++) {
        for (let dx = 0; dx < fillRect.width; dx++) {
          const key = (fillRect.x + dx) + ',' + (fillRect.y + dy);
          if (fillRect.tileId < 0) { delete layer.tiles[key]; } else { layer.tiles[key] = fillRect.tileId; }
          count++;
        }
      }
    }
    if (fillBorder) {
      const fb = fillBorder;
      for (let dy = 0; dy < fb.height; dy++) {
        for (let dx = 0; dx < fb.width; dx++) {
          const isBorder = dx === 0 || dx === fb.width - 1 || dy === 0 || dy === fb.height - 1;
          if (isBorder) { layer.tiles[(fb.x + dx) + ',' + (fb.y + dy)] = fb.tileId; count++; }
          else if (fb.fillTileId !== undefined && fb.fillTileId >= 0) { layer.tiles[(fb.x + dx) + ',' + (fb.y + dy)] = fb.fillTileId; count++; }
        }
      }
    }
    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: 'Painted ' + count + ' tiles on "' + layerName + '" in tilemap "' + tilemap.assetName + '"' }] };
  }
);

server.tool(
  'set_tile_collision',
  'Set collision types for tiles in a tileset. Controls which tiles are solid, platforms, slopes, etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('2D scene containing the tileset'),
    tilesetId: z.string().describe('Tileset asset ID'),
    tileCollisions: z.array(z.object({
      tileId: z.number(),
      collision: z.enum(['none', 'full', 'top', 'bottom', 'left', 'right', 'slope-left', 'slope-right', 'platform']),
    })).describe('Tile collision settings'),
  },
  async ({ projectPath, sceneName, tilesetId, tileCollisions }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: 'Scene not found: ' + sceneName }] };
    const scene = readJsonFile(scenePath);
    const tilesets = scene.scene2DConfig?.tilesets || [];
    const tileset = tilesets.find((t: any) => t.assetId === tilesetId);
    if (!tileset) return { content: [{ type: 'text', text: 'Tileset not found: ' + tilesetId }] };
    let updated = 0;
    for (const tc of tileCollisions) {
      const tile = tileset.tiles.find((t: any) => t.tileId === tc.tileId);
      if (tile) { tile.collision = tc.collision; updated++; }
    }
    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: 'Updated collision for ' + updated + ' tiles in "' + tileset.assetName + '"' }] };
  }
);

// ============================================================
//  16d. AUTO-SLICE SPRITE SHEET
// ============================================================

server.tool(
  'auto_slice_sprite_sheet',
  'One-shot: Create a sprite sheet from a raw image with auto grid slicing and optional animation definitions by row.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    textureFile: z.string().describe('Texture filename in Textures folder'),
    name: z.string().describe('Sprite sheet name'),
    cellWidth: z.number().describe('Cell width in pixels'),
    cellHeight: z.number().describe('Cell height in pixels'),
    animations: z.array(z.object({
      name: z.string().describe('Animation name (e.g. "Idle", "Walk")'),
      row: z.number().describe('Row index (0-based)'),
      startCol: z.number().optional().describe('Start column (default: 0)'),
      endCol: z.number().optional().describe('End column exclusive (default: all)'),
      fps: z.number().optional().describe('Frames per second (default: 12)'),
      loop: z.boolean().optional().describe('Loop (default: true)'),
    })).optional().describe('Define animations by row'),
    pixelsPerUnit: z.number().optional().describe('PPU (default: 100)'),
  },
  async ({ projectPath, textureFile, name, cellWidth, cellHeight, animations, pixelsPerUnit }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const texPath = path.join(projRoot, 'Textures', textureFile);
    if (!fs.existsSync(texPath)) return { content: [{ type: 'text', text: 'Texture not found: ' + textureFile }] };
    const imgBuf = fs.readFileSync(texPath);
    const ext = path.extname(textureFile).toLowerCase();
    let tw = 0, th = 0;
    if (ext === '.png' && imgBuf.length > 24) { tw = imgBuf.readUInt32BE(16); th = imgBuf.readUInt32BE(20); }
    else if ((ext === '.jpg' || ext === '.jpeg') && imgBuf.length > 2) {
      let i = 2;
      while (i < imgBuf.length - 8) {
        if (imgBuf[i] === 0xFF) {
          const marker = imgBuf[i + 1];
          if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) { th = imgBuf.readUInt16BE(i + 5); tw = imgBuf.readUInt16BE(i + 7); break; }
          i += 2 + imgBuf.readUInt16BE(i + 2);
        } else { i++; }
      }
    }
    if (tw === 0 || th === 0) return { content: [{ type: 'text', text: 'Could not read image dimensions for ' + textureFile }] };
    const cols = Math.floor(tw / cellWidth), rows = Math.floor(th / cellHeight);
    const ppu = pixelsPerUnit || 100;
    const sprites: any[] = [];
    let idx = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        sprites.push({ spriteId: 'sprite_' + idx, name: name + '_' + idx, x: col * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight, pivot: { x: 0.5, y: 0.5 } });
        idx++;
      }
    }
    const anims: any[] = [];
    if (animations) {
      for (const anim of animations) {
        const sc = anim.startCol ?? 0, ec = anim.endCol ?? cols;
        const frames: string[] = [];
        for (let c = sc; c < ec; c++) { const fi = anim.row * cols + c; frames.push(sprites[fi]?.spriteId || ('sprite_' + fi)); }
        anims.push({ animId: 'anim_' + Date.now().toString(36) + '_' + (++_uid).toString(36), animName: anim.name, frames, fps: anim.fps ?? 12, loop: anim.loop ?? true, events: [] });
      }
    }
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    const imageDataUrl = 'data:' + mime + ';base64,' + imgBuf.toString('base64');
    const assetId = spriteUid();
    const spriteSheet: any = {
      assetId, assetType: 'spriteSheet', assetName: name,
      sourceTexture: textureFile, textureWidth: tw, textureHeight: th,
      pixelsPerUnit: ppu, filterMode: 'point',
      sprites, animations: anims, imageDataUrl, imagePath: 'Textures/' + textureFile,
    };
    const spritesDir = path.join(projRoot, 'Sprites');
    if (!fs.existsSync(spritesDir)) fs.mkdirSync(spritesDir, { recursive: true });
    const fileName = safeName(name) + '_' + assetId + '.json';
    writeJsonFile(path.join(spritesDir, fileName), spriteSheet);
    const scenesDir = path.join(projRoot, 'Scenes');
    if (fs.existsSync(scenesDir)) {
      for (const sf of fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'))) {
        const sp = path.join(scenesDir, sf);
        const scene = readJsonFile(sp);
        if (scene.sceneMode === '2D' && scene.scene2DConfig) {
          scene.scene2DConfig.spriteSheets = scene.scene2DConfig.spriteSheets || [];
          if (!scene.scene2DConfig.spriteSheets.some((s: any) => s.assetId === assetId)) {
            scene.scene2DConfig.spriteSheets.push(JSON.parse(JSON.stringify({ ...spriteSheet, imageDataUrl: undefined })));
            writeJsonFile(sp, scene);
          }
        }
      }
    }
    return { content: [{ type: 'text', text: 'Created sprite sheet "' + name + '" (ID: ' + assetId + ')\nTexture: ' + textureFile + ' (' + tw + 'x' + th + ')\nGrid: ' + cols + 'x' + rows + ' = ' + sprites.length + ' sprites (' + cellWidth + 'x' + cellHeight + ' each)\nAnimations: ' + anims.length + ' (' + (anims.map(a => a.animName).join(', ') || 'none') + ')\nFile: Sprites/' + fileName }] };
  }
);

// ============================================================
//  16e. ONE-SHOT 2D WORLD BUILDER
// ============================================================

server.tool(
  'setup_2d_world',
  'One-shot: Create tileset + tilemap, paint a basic level layout with ground/walls/platforms, optionally create a character pawn and place it. Produces a fully playable 2D world in one call.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('2D scene name (created if missing)'),
    worldName: z.string().describe('World/level name'),
    preset: z.enum(['platformer', 'topdown']).describe('Game type'),
    tilesetTexture: z.string().describe('Tileset texture in Textures/ folder'),
    tilesetTextureWidth: z.number().describe('Tileset texture width px'),
    tilesetTextureHeight: z.number().describe('Tileset texture height px'),
    tileWidth: z.number().describe('Tile width px'),
    tileHeight: z.number().describe('Tile height px'),
    groundTileId: z.number().describe('Tile ID for ground/floor'),
    wallTileId: z.number().optional().describe('Tile ID for walls'),
    backgroundTileId: z.number().optional().describe('Tile ID for background fill'),
    worldWidth: z.number().optional().describe('World width in tiles (default: 40)'),
    worldHeight: z.number().optional().describe('World height in tiles (default: 25)'),
    characterSpriteSheet: z.string().optional().describe('Character sprite texture for auto character setup'),
    characterCellWidth: z.number().optional().describe('Character sprite cell width px'),
    characterCellHeight: z.number().optional().describe('Character sprite cell height px'),
    pixelsPerUnit: z.number().optional().describe('PPU (default: 100)'),
  },
  async ({ projectPath, sceneName, worldName, preset, tilesetTexture, tilesetTextureWidth, tilesetTextureHeight, tileWidth, tileHeight, groundTileId, wallTileId, backgroundTileId, worldWidth, worldHeight, characterSpriteSheet, characterCellWidth, characterCellHeight, pixelsPerUnit }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const ppu = pixelsPerUnit || 100;
    const ww = worldWidth || 40, wh = worldHeight || 25;
    const log: string[] = [];

    // 1. Ensure scene exists
    const scenesDir = path.join(projRoot, 'Scenes');
    if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true });
    const scenePath = path.join(scenesDir, sceneName + '.json');
    let scene: any;
    if (fs.existsSync(scenePath)) { scene = readJsonFile(scenePath); }
    else {
      scene = {
        schemaVersion: 1, name: sceneName, gameObjects: [],
        camera: { position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } },
        sceneMode: '2D',
        scene2DConfig: {
          sceneMode: '2D',
          renderSettings: { cameraType: 'orthographic', pixelsPerUnit: ppu, referenceResolution: { width: 1920, height: 1080 }, backgroundColor: '#1a1a2e' },
          worldSettings: { gravity: preset === 'platformer' ? { x: 0, y: -9.81 } : { x: 0, y: 0 }, physicsMode: '2D', pixelsPerUnit: ppu },
          sortingLayers: [{ id: 'background', name: 'Background', order: -10 }, { id: 'default', name: 'Default', order: 0 }, { id: 'foreground', name: 'Foreground', order: 10 }],
          spriteSheets: [], tilesets: [], tilemaps: [],
        },
      };
      log.push('Created 2D scene "' + sceneName + '" (' + preset + ')');
    }

    // 2. Create tileset
    const tilesetUid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const tilesetId = 'tileset-' + tilesetUid;
    const tsCols = Math.floor(tilesetTextureWidth / tileWidth), tsRows = Math.floor(tilesetTextureHeight / tileHeight);
    const totalTiles = tsCols * tsRows;
    const tilesDef: any[] = [];
    for (let i = 0; i < totalTiles; i++) {
      tilesDef.push({ tileId: i, tags: [], collision: (i === groundTileId || i === wallTileId) ? 'full' : 'none' });
    }
    const texPath = path.join(projRoot, 'Textures', tilesetTexture);
    let imageDataUrl: string | undefined;
    if (fs.existsSync(texPath)) {
      const imgBuf = fs.readFileSync(texPath);
      const ext2 = path.extname(tilesetTexture).toLowerCase();
      imageDataUrl = 'data:' + (ext2 === '.png' ? 'image/png' : 'image/jpeg') + ';base64,' + imgBuf.toString('base64');
    }
    const tileset: any = {
      assetId: tilesetId, assetType: 'tileset', assetName: worldName + 'Tiles',
      sourceTexture: tilesetTexture, textureWidth: tilesetTextureWidth, textureHeight: tilesetTextureHeight,
      tileWidth, tileHeight, columns: tsCols, rows: tsRows,
      pixelsPerUnit: ppu, tiles: tilesDef, animatedTiles: [],
      imageDataUrl, imagePath: 'Textures/' + tilesetTexture,
    };
    scene.scene2DConfig.tilesets = scene.scene2DConfig.tilesets || [];
    scene.scene2DConfig.tilesets.push(tileset);
    log.push('Created tileset (ID: ' + tilesetId + ') ' + tsCols + 'x' + tsRows + ' = ' + totalTiles + ' tiles');

    // 3. Create tilemap with painted level
    const tmUid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const tilemapId = 'tilemap-' + tmUid;
    const bgTiles: Record<string, number> = {};
    const groundTiles: Record<string, number> = {};
    if (preset === 'platformer') {
      for (let x = 0; x < ww; x++) { groundTiles[x + ',' + (wh - 1)] = groundTileId; groundTiles[x + ',' + (wh - 2)] = groundTileId; if (wallTileId !== undefined) groundTiles[x + ',0'] = wallTileId; }
      if (wallTileId !== undefined) { for (let y = 0; y < wh; y++) { groundTiles['0,' + y] = wallTileId; groundTiles[(ww - 1) + ',' + y] = wallTileId; } }
      for (let x = 8; x < 14; x++) groundTiles[x + ',' + (wh - 6)] = groundTileId;
      for (let x = 20; x < 28; x++) groundTiles[x + ',' + (wh - 10)] = groundTileId;
      for (let x = 14; x < 18; x++) groundTiles[x + ',' + (wh - 14)] = groundTileId;
    } else {
      for (let x = 0; x < ww; x++) { groundTiles[x + ',0'] = wallTileId ?? groundTileId; groundTiles[x + ',' + (wh - 1)] = wallTileId ?? groundTileId; }
      for (let y = 0; y < wh; y++) { groundTiles['0,' + y] = wallTileId ?? groundTileId; groundTiles[(ww - 1) + ',' + y] = wallTileId ?? groundTileId; }
    }
    if (backgroundTileId !== undefined) {
      for (let y = 0; y < wh; y++) { for (let x = 0; x < ww; x++) { bgTiles[x + ',' + y] = backgroundTileId; } }
    }
    const tilemap: any = {
      assetId: tilemapId, assetType: 'tilemap', assetName: worldName, tilesetId, pixelsPerUnit: ppu,
      layers: [
        { layerId: 'layer-bg-' + tmUid, name: 'Background', z: 0, visible: true, locked: false, hasCollision: false, tiles: bgTiles },
        { layerId: 'layer-ground-' + tmUid, name: 'Ground', z: 10, visible: true, locked: false, hasCollision: true, tiles: groundTiles },
        { layerId: 'layer-deco-' + tmUid, name: 'Decoration', z: 15, visible: true, locked: false, hasCollision: false, tiles: {} },
        { layerId: 'layer-fg-' + tmUid, name: 'Foreground', z: 70, visible: true, locked: false, hasCollision: false, tiles: {} },
      ],
    };
    scene.scene2DConfig.tilemaps = scene.scene2DConfig.tilemaps || [];
    scene.scene2DConfig.tilemaps.push(tilemap);
    log.push('Created tilemap "' + worldName + '" (ID: ' + tilemapId + ') ' + ww + 'x' + wh + ' tiles, ' + Object.keys(groundTiles).length + ' ground tiles');

    // 4. Create character if sprite sheet provided
    let charActorId = '';
    if (characterSpriteSheet && characterCellWidth && characterCellHeight) {
      const charTexPath = path.join(projRoot, 'Textures', characterSpriteSheet);
      if (fs.existsSync(charTexPath)) {
        const charImgBuf = fs.readFileSync(charTexPath);
        const charExt = path.extname(characterSpriteSheet).toLowerCase();
        let charW = 0, charH = 0;
        if (charExt === '.png' && charImgBuf.length > 24) { charW = charImgBuf.readUInt32BE(16); charH = charImgBuf.readUInt32BE(20); }
        if (charW > 0 && charH > 0) {
          const charCols = Math.floor(charW / characterCellWidth), charRows = Math.floor(charH / characterCellHeight);
          const charSprites: any[] = [];
          let ci = 0;
          for (let r = 0; r < charRows; r++) { for (let c = 0; c < charCols; c++) { charSprites.push({ spriteId: 'sprite_' + ci, name: 'Char_' + ci, x: c * characterCellWidth, y: r * characterCellHeight, width: characterCellWidth, height: characterCellHeight, pivot: { x: 0.5, y: 0.5 } }); ci++; } }
          const charMime = charExt === '.png' ? 'image/png' : 'image/jpeg';
          const charDataUrl = 'data:' + charMime + ';base64,' + charImgBuf.toString('base64');
          const charSsId = spriteUid();
          const charSS: any = { assetId: charSsId, assetType: 'spriteSheet', assetName: 'CharSprites', sourceTexture: characterSpriteSheet, textureWidth: charW, textureHeight: charH, pixelsPerUnit: ppu, filterMode: 'point', sprites: charSprites, animations: [], imageDataUrl: charDataUrl, imagePath: 'Textures/' + characterSpriteSheet };
          const spritesDir = path.join(projRoot, 'Sprites');
          if (!fs.existsSync(spritesDir)) fs.mkdirSync(spritesDir, { recursive: true });
          writeJsonFile(path.join(spritesDir, 'CharSprites_' + charSsId + '.json'), charSS);
          scene.scene2DConfig.spriteSheets = scene.scene2DConfig.spriteSheets || [];
          scene.scene2DConfig.spriteSheets.push(JSON.parse(JSON.stringify({ ...charSS, imageDataUrl: undefined })));
          log.push('Created character sprite sheet (ID: ' + charSsId + ') ' + charCols + 'x' + charRows + ' = ' + charSprites.length + ' sprites');

          charActorId = assetUid();
          const ts = Date.now().toString(36);
          const actorsDir = path.join(projRoot, 'Actors');
          if (!fs.existsSync(actorsDir)) fs.mkdirSync(actorsDir, { recursive: true });
          const charActor: any = {
            actorId: charActorId, actorName: 'Player', actorType: 'characterPawn2D',
            description: '2D Character ' + preset + ' (auto-created)',
            rootMeshType: 'none', rootPhysics: defaultPhysicsConfig(),
            components: [
              { id: 'comp_sprite_' + ts, type: 'spriteRenderer', meshType: 'cube', name: 'SpriteRenderer', offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, spriteSheetId: charSsId },
              { id: 'comp_rb2d_' + ts, type: 'rigidbody2d', meshType: 'cube', name: 'RigidBody2D', offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rigidbody2dType: 'dynamic' },
              { id: 'comp_col2d_' + ts, type: 'collider2d', meshType: 'cube', name: 'BoxCollider2D', offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, collider2dShape: 'box', collider2dSize: { width: 0.8, height: 1.0 } },
              { id: 'comp_cm2d_' + ts, type: 'characterMovement2d', meshType: 'cube', name: 'CharacterMovement2D', offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
              { id: compUid(), type: 'camera2d', meshType: 'cube', name: 'Camera2D', offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, hiddenInGame: true, camera2dConfig: defaultCamera2DConfig() },
            ],
            variables: [], functions: [], macros: [], customEvents: [], structs: [],
            eventGraphData: eventGraph2DForPreset(preset), functionGraphData: {},
            compiledCode: '', characterMovement2DConfig: defaultCharacterMovement2DConfig(preset),
            controllerClass: 'None', sceneMode: '2D',
            createdAt: Date.now(), modifiedAt: Date.now(),
          };
          writeJsonFile(path.join(actorsDir, 'Player_' + charActorId + '.json'), charActor);
          updateIndex(actorsDir, 'actorId', 'actorName');
          log.push('Created character "Player" (ID: ' + charActorId + ') ' + preset + ' movement');

          const spawnX = preset === 'platformer' ? 5 : Math.floor(ww / 2);
          const spawnY = preset === 'platformer' ? wh - 4 : Math.floor(wh / 2);
          scene.gameObjects = scene.gameObjects || [];
          scene.gameObjects.push({ name: 'Player', meshType: 'none', position: { x: spawnX, y: spawnY, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, hasPhysics: false, actorAssetId: charActorId, actorType: 'characterPawn2D' });
          log.push('Placed Player at (' + spawnX + ', ' + spawnY + ')');
        }
      }
    }

    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: '2D World Setup Complete: "' + worldName + '"\n' + log.map(function(l, i) { return (i + 1) + '. ' + l; }).join('\n') + '\n\nAsset IDs:\n  Tileset: ' + tilesetId + '\n  Tilemap: ' + tilemapId + (charActorId ? '\n  Character: ' + charActorId : '') }] };
  }
);

// ============================================================
//  17. ENGINE DOCUMENTATION (Resource)
// ============================================================

server.tool(
  'get_engine_docs',
  'Get documentation on how to use the Feather Engine MCP tools. Describes the complete workflow for common tasks.',
  {},
  async () => {
    const docs = `
# Feather Engine MCP — Tool Guide

## Common Workflows

### Create a Complete 2D World (One-Shot)
Use \`setup_2d_world\` — one call creates tileset, tilemap, paints ground/walls/platforms, optionally creates a character pawn and places it in the scene.

### Create a 2D Platformer Character (Quick)
Use \`setup_2d_character_complete\` — one call creates sprite sheet, animations, anim blueprint, character pawn, and wires everything.

### Analyze & Slice Sprite Sheets
1. \`analyze_texture\` — Detect image dimensions, see suggested grid cell sizes
2. \`auto_slice_sprite_sheet\` — One-shot: create sprite sheet with grid slicing + define animations by row

### Create a 2D Character (Step by Step)
1. \`import_texture\` — Import the sprite sheet image
2. \`create_sprite_sheet\` — Define grid cells from the texture  
3. \`add_sprite_animation\` (xN) — Define idle, walk, attack, etc.
4. \`create_anim_blueprint_2d\` — Create the animation state machine
5. \`add_anim_state\` (xN) — Add states for each animation
6. \`add_anim_transition\` (xN) — Wire transitions with conditions
7. \`create_character_pawn_2d\` — Create the character with components
8. \`wire_anim_blueprint_to_actor\` — Connect anim BP to sprite renderer
9. \`add_actor_to_scene\` — Place in a scene

### Build a Tilemap World (Step by Step)
1. \`import_texture\` — Import tileset image
2. \`analyze_texture\` — Detect tile dimensions
3. \`create_tileset\` — Create tileset from texture grid
4. \`set_tile_collision\` — Mark solid tiles
5. \`create_tilemap\` — Create tilemap with 4 layers
6. \`paint_tiles\` (xN) — Paint tiles on each layer (individual, fillRect, fillBorder)

### Create a 3D Actor
1. \`create_actor\` — Create with mesh type (cube, sphere, etc.)
2. \`add_blueprint_variable\` — Add variables (health, speed, etc.)
3. \`set_actor_physics\` — Enable physics simulation
4. \`add_actor_to_scene\` — Place in scene

### Create a 3D Character from a Mesh
1. \`import_mesh\` — Import GLB/GLTF/FBX/OBJ into project (creates mesh asset)
2. \`create_anim_blueprint_3d\` — Create 3D animation state machine linked to mesh
3. \`add_anim_state\` (xN) — Add Idle, Walk, Run, Jump states (uses animationName from mesh clips)
4. \`add_anim_transition\` (xN) — Wire transitions with conditions (speed > 0, isInAir, etc.)
5. \`create_actor\` with type "characterPawn" — Create playable character
6. \`add_component_to_actor\` with type "skeletalMesh" — Attach mesh + anim blueprint
7. \`add_actor_to_scene\` — Place in scene

### Viewport Screenshot (AI Vision)
- \`capture_viewport\` — Capture the current 3D/2D viewport as an image for AI review

### Mesh Management
- \`import_mesh\` — Import 3D mesh files (GLB, GLTF, FBX, OBJ)
- \`list_meshes\` — List all imported mesh assets

### Visual Scripting (Blueprint Nodes)
1. \`get_blueprint_graph\` — Read existing graph
2. \`list_node_types\` — See all available node types
3. \`add_blueprint_node\` — Add nodes to the graph
4. \`add_blueprint_connection\` — Wire nodes together
5. \`compile_blueprint\` — Compile to runtime code (auto-runs on graph mutations for actors)

### Create UI
1. \`create_widget_blueprint\` — Create with root canvas
2. \`add_widget_child\` (xN) — Add Text, Button, Image, ProgressBar, etc.

### Scene Management
- \`list_scenes\` / \`create_scene\` / \`get_scene_details\`
- \`add_actor_to_scene\` / \`remove_object_from_scene\` / \`modify_scene_object\`

### Data Management
- Structures: \`create_structure\` for custom data types
- Enums: \`create_enum\` for named constants
- Data Tables: \`create_data_table\` for grid data
- Save Games: \`create_save_game_class\` for persistence

## Tilemap Tools
- \`analyze_texture\` — Read image dimensions, suggest grid cell sizes
- \`create_tileset\` — Divide texture into tile grid with collision
- \`create_tilemap\` — 4-layer tilemap (Background, Ground, Decoration, Foreground)
- \`paint_tiles\` — Paint tiles, fill rectangles, paint borders
- \`set_tile_collision\` — Set per-tile collision (none/full/platform/slope)
- \`setup_2d_world\` — One-shot world builder

## Actor Types
- \`actor\` — Basic 3D actor with mesh
- \`spriteActor\` — 2D sprite actor
- \`characterPawn\` — 3D playable character (WASD + Jump + Camera)
- \`characterPawn2D\` — 2D playable character (use create_character_pawn_2d)
- \`tilemapActor\` — 2D tilemap
- \`parallaxLayer\` — 2D parallax background
- \`playerController\` — Input controller
- \`aiController\` — AI-driven controller

## Component Types
\`spriteRenderer\`, \`rigidbody2d\`, \`collider2d\`, \`characterMovement2d\`,
\`camera2d\`, \`mesh\`, \`skeletalMesh\`, \`trigger\`, \`light\`, \`camera\`, \`characterMovement\`,
\`springArm\`, \`tilemap\`, \`navMeshBounds\`, \`ParticleEmitterComponent\`, \`AudioSourceComponent\`,
\`AIControllerComponent\`

### skeletalMesh Properties
- \`meshAssetId\` — ID of the imported mesh asset (from import_mesh)
- \`animationBlueprintId\` — ID of the 3D animation blueprint (from create_anim_blueprint_3d)

### ParticleEmitterComponent Properties
- \`particleAssetId\` — ID of the particle emitter asset (from create_particle_emitter)
- \`autoPlay\` — Auto-play on spawn (default: true)
- \`offset\` — Local offset {x, y, z}

### AudioSourceComponent Properties
- \`soundAssetId\` — ID of a sound asset (from import_sound)
- \`soundCueId\` — ID of a sound cue asset (from create_sound_cue)
- \`spatial\` — 3D spatial audio (default: false)
- \`autoPlay\` — Auto-play on spawn (default: false)
- \`volume\` — Volume override (0-1)
- \`maxDistance\` — Max hearing distance for spatial audio

### AIControllerComponent Properties
- \`behaviorTreeId\` — ID of a behavior tree asset (from create_behavior_tree)

## Audio System
- \`import_sound\` — Import audio (MP3/WAV/OGG/FLAC/WEBM/AAC)
- \`list_sounds\` — List all sound assets
- \`set_sound_properties\` — Update volume, pitch, loop, bus, category
- \`delete_sound\` — Remove a sound asset
- \`create_sound_cue\` — Create Sound Cue (visual audio graph with WavePlayer, Random, Modulator, Mixer nodes)
- \`list_sound_cues\` — List all sound cues
- \`get_sound_cue_details\` — Inspect cue graph
- \`modify_sound_cue\` — Add/remove/update nodes and connections in a Sound Cue

## Particle System
- \`create_particle_emitter\` — Create particle effect (fire, smoke, sparks, rain, etc.)
- \`list_particle_emitters\` — List all particle assets
- \`modify_particle_emitter\` — Update particle properties
- \`delete_particle_emitter\` — Remove a particle asset
- \`add_particle_component\` — Attach particle to actor

## AI / Navigation
- \`configure_navmesh\` — Set up NavMesh bake params for a scene
- \`bake_navmesh\` — Trigger NavMesh generation (bridge)
- \`create_behavior_tree\` — Create a Behavior Tree for AI actors
- \`list_behavior_trees\` — List all BT assets
- \`assign_behavior_tree_to_actor\` — Wire a BT to an actor

## Input Mappings
- \`get_input_mappings\` — Read current bindings (read-only)
- \`create_input_mapping\` — Create new input mapping with action/axis bindings
- \`modify_input_mapping\` — Add, remove, or update individual bindings
- \`delete_input_mapping\` — Remove an input mapping asset

## Physics
- \`set_actor_physics\` — Per-actor physics settings
- \`set_world_physics\` — World-level gravity, timestep, solver, debug draw

## Scene Management (Extended)
- \`delete_scene\` — Remove a scene file
- \`duplicate_scene\` — Clone a scene
- \`rename_scene\` — Rename a scene (updates active scene ref)
- \`set_active_scene\` — Change project startup scene
- \`set_scene_2d_config\` — 2D scene settings (gravity, BG color, PPU, resolution)

## Font Management
- \`import_font\` — Import TTF/OTF/WOFF/WOFF2
- \`list_fonts\` — List imported + system fonts
- \`delete_font\` — Remove an imported font

## Sorting Layers (2D)
- \`set_sorting_layers\` — Define rendering layer stack
- \`get_sorting_layers\` — Read current sorting layers

## Class Inheritance
- \`set_actor_parent_class\` — Make an actor inherit from another
- \`create_child_actor\` — Create an actor inheriting from a parent
- \`sync_actor_with_parent\` — Pull parent changes into child

## Shader Graph
- \`create_shader\` — Create a custom shader node graph on a material

## LOD & Collision
- \`generate_lod\` — Generate LOD levels for mesh optimization
- \`generate_collision\` — Generate collision shapes for meshes

## Project Settings
- \`set_project_settings\` — Update project name, version, active scene, game instance

## Play/Stop Controls
- \`play_scene\` — Start play mode (bridge)
- \`stop_scene\` — Stop play mode (bridge)
- \`get_play_state\` — Check current engine mode

## Runtime/Bridge Tools
- \`get_runtime_errors\` — Read output log errors (bridge)
- \`reload_project\` — Force engine to reload assets (bridge)
- \`focus_viewport_on\` — Move camera to position/object (bridge)
- \`select_object\` — Select object in editor (bridge)
- \`get_game_object_state\` — Inspect live object state in play mode (bridge)

## Export/Build
- \`export_game\` — Trigger game build (web/desktop) (bridge)
- \`get_build_status\` — Check build progress (bridge)

## Variable Types
\`Float\`, \`Integer\`, \`Boolean\`, \`String\`, \`Vector3\`, \`Color\`,
\`Rotator\`, \`Transform\`, \`Object\`, \`Class\`, \`Array\`

## Tile Collision Types
\`none\`, \`full\`, \`top\`, \`bottom\`, \`left\`, \`right\`, \`slope-left\`, \`slope-right\`, \`platform\`

## Blueprint Graph Manipulation (§34)
- \`get_blueprint_graph\` — Read full graph (nodes + connections) from any asset
- \`add_blueprint_node\` — Add nodes with type, position, data (246 types available)
- \`remove_blueprint_node\` — Remove nodes + auto-cleanup connections
- \`connect_blueprint_nodes\` — Wire output pins to input pins
- \`disconnect_blueprint_nodes\` — Remove connections by ID or by node/pin
- \`move_blueprint_node\` — Reposition nodes
- \`set_node_value\` — Set control/data values on existing nodes
- \`clear_blueprint_graph\` — Remove all nodes and connections
- \`list_node_types\` — List all 246 node types grouped by category
- \`compile_blueprint\` — Trigger recompilation via live editor bridge

## Blueprint Introspection (§35)
- \`list_blueprint_variables\` — List all variables with types, defaults, IDs
- \`list_blueprint_functions\` — List functions with parameter signatures
- \`list_custom_events\` — List custom events with params
- \`add_blueprint_function\` — Add a custom function with entry/return nodes
- \`add_blueprint_custom_event\` — Add a custom event definition + node
- \`add_blueprint_macro\` — Add a reusable macro

## Debug & Print Log
- \`get_print_log\` — Read all print output (from PrintStringNode) with optional level/limit filter
- \`clear_print_log\` — Clear the print log entries

## Event System
- \`create_event_asset\` — Create a broadcast event asset
- \`list_event_assets\` — List all event assets

## Widget Extras
- \`add_widget_animation\` — Add keyframe animation to a widget blueprint
- \`get_widget_details\` — Detailed info about a widget (tree, animations, variables, graph)
`;
    return { content: [{ type: 'text', text: docs }] };
  }
);

// Helper: read widget blueprint
function readWidgetBP(projRoot: string, widgetId: string): { filePath: string; data: any } | null {
  const dir = path.join(projRoot, 'Widgets');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const fp = path.join(dir, f);
    const d = readJsonFile(fp);
    if (d && d.widgetBlueprintId === widgetId) return { filePath: fp, data: d };
  }
  return null;
}

// -- (legacy consolidated blueprint_graph tool removed — replaced by individual tools in §34/§35) --

// -- Tool: create_event_asset --
server.tool(
  'create_event_asset',
  'Create a new event asset (for the engine event system — broadcasts between actors/systems).',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    eventName: z.string().describe('Name for the event'),
    description: z.string().optional().describe('Description of the event'),
    category: z.string().optional().describe('Category grouping'),
    payloadFields: z.array(z.object({
      name: z.string(),
      type: z.string(),
      defaultValue: z.any().optional()
    })).optional().describe('Event payload fields [{name, type, defaultValue}]'),
  },
  async ({ projectPath, eventName, description, category, payloadFields }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const eventsDir = path.join(projRoot, 'Events');
    if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
    const eventId = 'event_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const now = Date.now();
    const eventJson = {
      id: eventId,
      name: eventName,
      description: description || '',
      category: category || 'Default',
      payloadFields: payloadFields || [],
      createdAt: now,
      modifiedAt: now,
    };
    const filePath = path.join(eventsDir, eventName + '_' + eventId + '.json');
    writeJsonFile(filePath, eventJson);
    return { content: [{ type: 'text', text: 'Created event "' + eventName + '" [' + eventId + ']' }] };
  }
);

// -- Tool: list_event_assets --
server.tool(
  'list_event_assets',
  'List all event assets in the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const eventsDir = path.join(projRoot, 'Events');
    if (!fs.existsSync(eventsDir)) return { content: [{ type: 'text', text: 'No Events folder found.' }] };
    const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return { content: [{ type: 'text', text: 'No event assets found.' }] };
    let result = 'Event Assets (' + files.length + '):\n';
    for (const f of files) {
      const d = readJsonFile(path.join(eventsDir, f));
      result += '  [' + d.id + '] ' + d.name;
      if (d.category) result += ' (category: ' + d.category + ')';
      if (d.payloadFields && d.payloadFields.length > 0) {
        result += ' � fields: ' + d.payloadFields.map((p: any) => p.name + ':' + p.type).join(', ');
      }
      result += '\n';
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: add_widget_animation --
server.tool(
  'add_widget_animation',
  'Add an animation to a widget blueprint with keyframe tracks.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    widgetId: z.string().describe('Widget blueprint ID'),
    animationName: z.string().describe('Name for the animation'),
    duration: z.number().optional().describe('Duration in seconds (default: 1.0)'),
    isLooping: z.boolean().optional().describe('Whether the animation loops (default: false)'),
    tracks: z.array(z.object({
      targetWidgetId: z.string().describe('ID of the widget to animate'),
      propertyPath: z.string().describe('Property to animate, e.g. "renderOpacity", "slot.offsetX", "textProps.fontSize"'),
      keys: z.array(z.object({
        time: z.number().describe('Time in seconds'),
        value: z.any().describe('Property value at this time'),
        easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).optional().describe('Easing (default: linear)')
      }))
    })).optional().describe('Animation tracks'),
  },
  async ({ projectPath, widgetId, animationName, duration, isLooping, tracks }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const r = readWidgetBP(projRoot, widgetId);
    if (!r) return { content: [{ type: 'text', text: 'Widget blueprint not found' }] };
    if (!r.data.animations) r.data.animations = [];
    const animId = 'wanim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const anim = {
      id: animId,
      name: animationName,
      duration: duration ?? 1.0,
      isLooping: isLooping ?? false,
      tracks: (tracks || []).map(t => ({
        targetWidgetId: t.targetWidgetId,
        propertyPath: t.propertyPath,
        keys: t.keys.map(k => ({ time: k.time, value: k.value, easing: k.easing || 'linear' }))
      }))
    };
    r.data.animations.push(anim);
    writeJsonFile(r.filePath, r.data);
    return { content: [{ type: 'text', text: 'Added widget animation "' + animationName + '" [' + animId + '] with ' + anim.tracks.length + ' tracks' }] };
  }
);

// -- Tool: get_widget_details --
server.tool(
  'get_widget_details',
  'Get detailed information about a widget blueprint including its widget tree, animations, variables, functions, and event graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    widgetId: z.string().describe('Widget blueprint ID'),
  },
  async ({ projectPath, widgetId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const r = readWidgetBP(projRoot, widgetId);
    if (!r) return { content: [{ type: 'text', text: 'Widget blueprint not found' }] };
    const d = r.data;
    let result = 'Widget Blueprint: ' + (d.widgetBlueprintName || widgetId) + '\n';
    result += 'ID: ' + d.widgetBlueprintId + '\n';
    result += 'Root Widget: ' + d.rootWidgetId + '\n\n';

    // Widget tree
    const widgets = d.widgets || {};
    const widgetKeys = Object.keys(widgets);
    result += 'Widgets (' + widgetKeys.length + '):\n';
    for (const wk of widgetKeys) {
      const w = widgets[wk];
      result += '  [' + w.id + '] ' + w.type + ' � "' + w.name + '"';
      if (w.children && w.children.length > 0) result += ' children: ' + w.children.join(', ');
      result += '\n';
    }

    // Animations
    if (d.animations && d.animations.length > 0) {
      result += '\nAnimations (' + d.animations.length + '):\n';
      for (const a of d.animations) {
        result += '  [' + a.id + '] ' + a.name + ' � ' + a.duration + 's' + (a.isLooping ? ' (looping)' : '') + ', ' + a.tracks.length + ' tracks\n';
      }
    }

    // Variables
    if (d.variables && d.variables.length > 0) {
      result += '\nVariables (' + d.variables.length + '):\n';
      for (const v of d.variables) result += '  ' + v.name + ' : ' + v.type + '\n';
    }

    // Functions
    if (d.functions && d.functions.length > 0) {
      result += '\nFunctions (' + d.functions.length + '):\n';
      for (const f of d.functions) result += '  ' + f.name + ' [' + f.id + ']\n';
    }

    // Event graph node count
    if (d.eventGraph && d.eventGraph.nodes) {
      result += '\nEvent Graph: ' + d.eventGraph.nodes.length + ' nodes, ' + (d.eventGraph.connections || []).length + ' connections\n';
    }

    return { content: [{ type: 'text', text: result }] };
  }
);

// ============================================================
//  §17  AUDIO / SOUND SYSTEM
// ============================================================

server.tool(
  'import_sound',
  'Import an audio file into the project Sounds folder. Supports MP3, WAV, OGG, FLAC, WEBM, AAC.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sourcePath: z.string().describe('Absolute path to the source audio file'),
    name: z.string().describe('Display name for the sound asset'),
    category: z.enum(['SFX', 'Music', 'Ambient', 'UI', 'Voice']).optional().describe('Sound category. Default: "SFX"'),
    volume: z.number().optional().describe('Playback volume 0-1. Default: 1.0'),
    pitch: z.number().optional().describe('Playback pitch 0.1-4. Default: 1.0'),
    loop: z.boolean().optional().describe('Whether to loop. Default: false'),
    bus: z.enum(['SFX', 'Music', 'Ambient', 'UI', 'Master']).optional().describe('Audio bus. Default: "SFX"'),
  },
  async ({ projectPath, sourcePath, name, category, volume, pitch, loop, bus }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const soundsDir = path.join(projRoot, 'Sounds');
    if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true });
    if (!fs.existsSync(sourcePath)) return { content: [{ type: 'text', text: `Source not found: ${sourcePath}` }] };
    const ext = path.extname(sourcePath).toLowerCase();
    const validExts = ['.mp3', '.wav', '.ogg', '.flac', '.webm', '.aac'];
    if (!validExts.includes(ext)) return { content: [{ type: 'text', text: `Unsupported format: ${ext}. Supported: ${validExts.join(', ')}` }] };
    const audioData = fs.readFileSync(sourcePath);
    const mimeMap: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm', '.aac': 'audio/aac' };
    const dataUrl = `data:${mimeMap[ext] || 'audio/mpeg'};base64,${audioData.toString('base64')}`;
    const id = soundUid();
    const asset = {
      assetId: id,
      assetName: name,
      sourceFile: path.basename(sourcePath),
      category: category ?? 'SFX',
      settings: { volume: volume ?? 1.0, pitch: pitch ?? 1.0, loop: loop ?? false, bus: bus ?? 'SFX' },
      metadata: { format: ext.replace('.', '').toUpperCase(), fileSize: audioData.length },
      storedData: dataUrl,
    };
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeJsonFile(path.join(soundsDir, `${safeName}_${id}.json`), asset);
    return { content: [{ type: 'text', text: `Imported sound "${name}" (ID: ${id}, ${(audioData.length / 1024).toFixed(1)} KB, ${ext.replace('.', '').toUpperCase()})\nCategory: ${asset.category}, Bus: ${asset.settings.bus}` }] };
  }
);

server.tool(
  'list_sounds',
  'List all sound assets in the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const soundsDir = path.join(projRoot, 'Sounds');
    if (!fs.existsSync(soundsDir)) return { content: [{ type: 'text', text: 'No sounds. Sounds/ folder does not exist.' }] };
    const files = fs.readdirSync(soundsDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    if (files.length === 0) return { content: [{ type: 'text', text: 'No sound assets found.' }] };
    const lines: string[] = [];
    for (const f of files) {
      try {
        const d = readJsonFile(path.join(soundsDir, f));
        lines.push(`[${d.category || 'SFX'}] ${d.assetName} (ID: ${d.assetId}) — ${d.settings?.bus || 'SFX'} bus, vol=${d.settings?.volume ?? 1}, loop=${d.settings?.loop ?? false}`);
      } catch { /* skip */ }
    }
    return { content: [{ type: 'text', text: `Sounds (${lines.length}):\n${lines.join('\n')}` }] };
  }
);

server.tool(
  'set_sound_properties',
  'Update properties of an existing sound asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    soundId: z.string().describe('Sound asset ID'),
    volume: z.number().optional().describe('Playback volume 0-1'),
    pitch: z.number().optional().describe('Playback pitch 0.1-4'),
    loop: z.boolean().optional().describe('Whether to loop'),
    bus: z.enum(['SFX', 'Music', 'Ambient', 'UI', 'Master']).optional().describe('Audio bus'),
    category: z.enum(['SFX', 'Music', 'Ambient', 'UI', 'Voice']).optional().describe('Sound category'),
  },
  async ({ projectPath, soundId, volume, pitch, loop, bus, category }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const soundsDir = path.join(projRoot, 'Sounds');
    if (!fs.existsSync(soundsDir)) return { content: [{ type: 'text', text: 'Sounds/ folder not found.' }] };
    for (const f of fs.readdirSync(soundsDir).filter(f => f.endsWith('.json'))) {
      const fp = path.join(soundsDir, f);
      const d = readJsonFile(fp);
      if (d.assetId === soundId) {
        if (!d.settings) d.settings = {};
        if (volume !== undefined) d.settings.volume = volume;
        if (pitch !== undefined) d.settings.pitch = pitch;
        if (loop !== undefined) d.settings.loop = loop;
        if (bus !== undefined) d.settings.bus = bus;
        if (category !== undefined) d.category = category;
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Updated sound "${d.assetName}" — vol=${d.settings.volume}, pitch=${d.settings.pitch}, loop=${d.settings.loop}, bus=${d.settings.bus}, category=${d.category}` }] };
      }
    }
    return { content: [{ type: 'text', text: `Sound not found: ${soundId}` }] };
  }
);

server.tool(
  'delete_sound',
  'Delete a sound asset from the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    soundId: z.string().describe('Sound asset ID to delete'),
  },
  async ({ projectPath, soundId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const soundsDir = path.join(projRoot, 'Sounds');
    if (!fs.existsSync(soundsDir)) return { content: [{ type: 'text', text: 'Sounds/ folder not found.' }] };
    for (const f of fs.readdirSync(soundsDir).filter(f => f.endsWith('.json'))) {
      const fp = path.join(soundsDir, f);
      const d = readJsonFile(fp);
      if (d.assetId === soundId) {
        fs.unlinkSync(fp);
        broadcastChange({ type: 'asset-deleted', assetType: 'sounds', assetId: soundId, name: d.assetName });
        return { content: [{ type: 'text', text: `Deleted sound "${d.assetName}" (${soundId})` }] };
      }
    }
    return { content: [{ type: 'text', text: `Sound not found: ${soundId}` }] };
  }
);

// ── Sound Cues ──
server.tool(
  'create_sound_cue',
  'Create a Sound Cue asset with a visual node graph for complex sound playback (randomization, modulation, mixing).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Sound Cue name'),
    bus: z.enum(['SFX', 'Music', 'Ambient', 'UI', 'Master']).optional().describe('Output bus. Default: "SFX"'),
    volume: z.number().optional().describe('Master volume 0-1. Default: 1'),
    pitch: z.number().optional().describe('Master pitch. Default: 1'),
    loop: z.boolean().optional().describe('Loop playback. Default: false'),
    soundAssetIds: z.array(z.string()).optional().describe('Sound asset IDs to add as WavePlayer nodes'),
  },
  async ({ projectPath, name, bus, volume, pitch, loop, soundAssetIds }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const cuesDir = path.join(projRoot, 'SoundCues');
    if (!fs.existsSync(cuesDir)) fs.mkdirSync(cuesDir, { recursive: true });
    const id = cueUid();
    const outputNode = {
      id: 'output_' + id,
      type: 'Output',
      x: 600, y: 200,
      data: { bus: bus ?? 'SFX', volume: volume ?? 1, pitch: pitch ?? 1, loop: loop ?? false, maxConcurrency: 1, fadeIn: 0, fadeOut: 0 },
    };
    const nodes: any[] = [outputNode];
    const connections: any[] = [];
    if (soundAssetIds && soundAssetIds.length > 0) {
      for (let i = 0; i < soundAssetIds.length; i++) {
        const wnId = cueNodeUid();
        nodes.push({
          id: wnId, type: 'WavePlayer',
          x: 200, y: 100 + i * 150,
          data: { soundAssetId: soundAssetIds[i], volume: 1, pitchMin: 1, pitchMax: 1 },
        });
        connections.push({ id: 'scc_' + (++_uid).toString(36), fromNodeId: wnId, toNodeId: outputNode.id, toInputIndex: i });
      }
    }
    const cue = { assetId: id, assetName: name, nodes, connections };
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeJsonFile(path.join(cuesDir, `${safeName}_${id}.json`), cue);
    return { content: [{ type: 'text', text: `Created Sound Cue "${name}" (ID: ${id}) with ${nodes.length} nodes, ${connections.length} connections` }] };
  }
);

server.tool(
  'list_sound_cues',
  'List all Sound Cue assets in the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const cuesDir = path.join(projRoot, 'SoundCues');
    if (!fs.existsSync(cuesDir)) return { content: [{ type: 'text', text: 'No sound cues. SoundCues/ folder does not exist.' }] };
    const files = fs.readdirSync(cuesDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    if (files.length === 0) return { content: [{ type: 'text', text: 'No sound cue assets found.' }] };
    const lines: string[] = [];
    for (const f of files) {
      try {
        const d = readJsonFile(path.join(cuesDir, f));
        const outputNode = (d.nodes || []).find((n: any) => n.type === 'Output');
        lines.push(`${d.assetName} (ID: ${d.assetId}) — ${(d.nodes || []).length} nodes, bus=${outputNode?.data?.bus || 'SFX'}`);
      } catch { /* skip */ }
    }
    return { content: [{ type: 'text', text: `Sound Cues (${lines.length}):\n${lines.join('\n')}` }] };
  }
);

server.tool(
  'get_sound_cue_details',
  'Get the detailed node graph and properties of a Sound Cue.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    cueId: z.string().describe('Sound Cue asset ID'),
  },
  async ({ projectPath, cueId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const cuesDir = path.join(projRoot, 'SoundCues');
    if (!fs.existsSync(cuesDir)) return { content: [{ type: 'text', text: 'SoundCues/ folder not found.' }] };
    for (const f of fs.readdirSync(cuesDir).filter(f => f.endsWith('.json'))) {
      const d = readJsonFile(path.join(cuesDir, f));
      if (d.assetId === cueId) {
        let result = `Sound Cue: ${d.assetName}\nID: ${d.assetId}\n\nNodes (${(d.nodes || []).length}):\n`;
        for (const n of (d.nodes || [])) {
          result += `  [${n.id}] ${n.type} at (${n.x}, ${n.y})`;
          if (n.data) result += ' ' + JSON.stringify(n.data);
          result += '\n';
        }
        result += `\nConnections (${(d.connections || []).length}):\n`;
        for (const c of (d.connections || [])) {
          result += `  ${c.fromNodeId} → ${c.toNodeId} (input ${c.toInputIndex})\n`;
        }
        return { content: [{ type: 'text', text: result }] };
      }
    }
    return { content: [{ type: 'text', text: `Sound Cue not found: ${cueId}` }] };
  }
);

server.tool(
  'modify_sound_cue',
  'Add, remove, or modify nodes and connections in a Sound Cue graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    cueId: z.string().describe('Sound Cue asset ID'),
    command: z.enum(['add_node', 'remove_node', 'update_node', 'add_connection', 'remove_connection']).describe('Operation to perform'),
    nodeType: z.enum(['WavePlayer', 'Random', 'Modulator', 'Mixer']).optional().describe('Node type for add_node'),
    nodeId: z.string().optional().describe('Node ID for remove_node / update_node'),
    nodeData: z.record(z.any()).optional().describe('Node data properties (soundAssetId, volume, pitchMin, pitchMax, weights, volumeMin, volumeMax)'),
    positionX: z.number().optional().describe('Node X position'),
    positionY: z.number().optional().describe('Node Y position'),
    fromNodeId: z.string().optional().describe('Source node ID for add_connection'),
    toNodeId: z.string().optional().describe('Target node ID for add_connection'),
    toInputIndex: z.number().optional().describe('Target input index for add_connection'),
    connectionId: z.string().optional().describe('Connection ID for remove_connection'),
  },
  async ({ projectPath, cueId, command, nodeType, nodeId, nodeData, positionX, positionY, fromNodeId, toNodeId, toInputIndex, connectionId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const cuesDir = path.join(projRoot, 'SoundCues');
    if (!fs.existsSync(cuesDir)) return { content: [{ type: 'text', text: 'SoundCues/ folder not found.' }] };
    for (const f of fs.readdirSync(cuesDir).filter(f => f.endsWith('.json'))) {
      const fp = path.join(cuesDir, f);
      const d = readJsonFile(fp);
      if (d.assetId !== cueId) continue;
      if (!d.nodes) d.nodes = [];
      if (!d.connections) d.connections = [];

      if (command === 'add_node') {
        const nid = cueNodeUid();
        d.nodes.push({ id: nid, type: nodeType, x: positionX ?? 200, y: positionY ?? 200, data: nodeData || {} });
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Added ${nodeType} node [${nid}] to Sound Cue "${d.assetName}"` }] };
      }
      if (command === 'remove_node') {
        const before = d.nodes.length;
        d.nodes = d.nodes.filter((n: any) => n.id !== nodeId);
        d.connections = d.connections.filter((c: any) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId);
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: (before - d.nodes.length) ? `Removed node ${nodeId}` : `Node not found: ${nodeId}` }] };
      }
      if (command === 'update_node') {
        const node = d.nodes.find((n: any) => n.id === nodeId);
        if (!node) return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }] };
        if (positionX !== undefined) node.x = positionX;
        if (positionY !== undefined) node.y = positionY;
        if (nodeData) node.data = { ...(node.data || {}), ...nodeData };
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Updated node ${nodeId}` }] };
      }
      if (command === 'add_connection') {
        const cid = 'scc_' + (++_uid).toString(36);
        d.connections.push({ id: cid, fromNodeId, toNodeId, toInputIndex: toInputIndex ?? 0 });
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Connected ${fromNodeId} → ${toNodeId} [${cid}]` }] };
      }
      if (command === 'remove_connection') {
        const before = d.connections.length;
        d.connections = d.connections.filter((c: any) => c.id !== connectionId);
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `${before - d.connections.length} connection(s) removed` }] };
      }
      return { content: [{ type: 'text', text: `Unknown command: ${command}` }] };
    }
    return { content: [{ type: 'text', text: `Sound Cue not found: ${cueId}` }] };
  }
);

// ============================================================
//  §18  PARTICLE SYSTEM
// ============================================================

server.tool(
  'create_particle_emitter',
  'Create a particle emitter asset that can be attached to actors as a ParticleComponent.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Particle emitter name (e.g. "Fire", "Smoke", "Sparks")'),
    emissionRate: z.number().optional().describe('Particles per second. Default: 50'),
    maxParticles: z.number().optional().describe('Max simultaneous particles. Default: 1000'),
    startLifetime: z.number().optional().describe('Particle lifetime in seconds. Default: 2'),
    lifetimeVariance: z.number().optional().describe('Random lifetime variance. Default: 0'),
    startSpeed: z.number().optional().describe('Initial speed. Default: 5'),
    speedVariance: z.number().optional().describe('Random speed variance. Default: 0'),
    startSize: z.number().optional().describe('Initial particle size. Default: 0.5'),
    endSize: z.number().optional().describe('End-of-life particle size. Default: 0'),
    sizeVariance: z.number().optional().describe('Random size variance. Default: 0'),
    startColor: z.string().optional().describe('Start color hex. Default: "#FFAA00"'),
    endColor: z.string().optional().describe('End color hex. Default: "#FF0000"'),
    gravityX: z.number().optional().describe('Gravity X. Default: 0'),
    gravityY: z.number().optional().describe('Gravity Y. Default: -9.8'),
    gravityZ: z.number().optional().describe('Gravity Z. Default: 0'),
    drag: z.number().optional().describe('Air drag 0-1. Default: 0'),
    shape: z.enum(['sphere', 'box', 'cone']).optional().describe('Emission shape. Default: "cone"'),
    shapeRadius: z.number().optional().describe('Emission shape radius. Default: 0.5'),
    shapeAngle: z.number().optional().describe('Cone emission angle in degrees. Default: 25'),
    blendMode: z.enum(['normal', 'additive', 'multiply']).optional().describe('Blend mode. Default: "additive"'),
    texture: z.string().optional().describe('Texture filename in Textures folder'),
    loop: z.boolean().optional().describe('Loop emission. Default: true'),
  },
  async ({ projectPath, name, emissionRate, maxParticles, startLifetime, lifetimeVariance, startSpeed, speedVariance, startSize, endSize, sizeVariance, startColor, endColor, gravityX, gravityY, gravityZ, drag, shape, shapeRadius, shapeAngle, blendMode, texture, loop }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const particlesDir = path.join(projRoot, 'Particles');
    if (!fs.existsSync(particlesDir)) fs.mkdirSync(particlesDir, { recursive: true });
    const id = particleUid();
    const asset = {
      assetId: id,
      assetName: name,
      emissionRate: emissionRate ?? 50,
      maxParticles: maxParticles ?? 1000,
      startLifetime: startLifetime ?? 2,
      lifetimeVariance: lifetimeVariance ?? 0,
      startSpeed: startSpeed ?? 5,
      speedVariance: speedVariance ?? 0,
      startSize: startSize ?? 0.5,
      endSize: endSize ?? 0,
      sizeVariance: sizeVariance ?? 0,
      startColor: startColor ?? '#FFAA00',
      endColor: endColor ?? '#FF0000',
      gravity: { x: gravityX ?? 0, y: gravityY ?? -9.8, z: gravityZ ?? 0 },
      drag: drag ?? 0,
      shape: shape ?? 'cone',
      shapeRadius: shapeRadius ?? 0.5,
      shapeAngle: shapeAngle ?? 25,
      blendMode: blendMode ?? 'additive',
      texture: texture || null,
      loop: loop ?? true,
      transparent: true,
      depthWrite: false,
    };
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeJsonFile(path.join(particlesDir, `${safeName}_${id}.json`), asset);
    return { content: [{ type: 'text', text: `Created particle emitter "${name}" (ID: ${id})\nRate: ${asset.emissionRate}/s, Max: ${asset.maxParticles}, Lifetime: ${asset.startLifetime}s\nShape: ${asset.shape}, Color: ${asset.startColor}→${asset.endColor}` }] };
  }
);

server.tool(
  'list_particle_emitters',
  'List all particle emitter assets in the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const particlesDir = path.join(projRoot, 'Particles');
    if (!fs.existsSync(particlesDir)) return { content: [{ type: 'text', text: 'No particles. Particles/ folder does not exist.' }] };
    const files = fs.readdirSync(particlesDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    if (files.length === 0) return { content: [{ type: 'text', text: 'No particle emitter assets found.' }] };
    const lines: string[] = [];
    for (const f of files) {
      try {
        const d = readJsonFile(path.join(particlesDir, f));
        lines.push(`${d.assetName} (ID: ${d.assetId}) — rate=${d.emissionRate}/s, shape=${d.shape}, color=${d.startColor}→${d.endColor}`);
      } catch { /* skip */ }
    }
    return { content: [{ type: 'text', text: `Particle Emitters (${lines.length}):\n${lines.join('\n')}` }] };
  }
);

server.tool(
  'modify_particle_emitter',
  'Update properties of an existing particle emitter asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    particleId: z.string().describe('Particle emitter asset ID'),
    emissionRate: z.number().optional().describe('Particles per second'),
    maxParticles: z.number().optional().describe('Max simultaneous particles'),
    startLifetime: z.number().optional().describe('Particle lifetime in seconds'),
    lifetimeVariance: z.number().optional().describe('Random lifetime variance'),
    startSpeed: z.number().optional().describe('Initial speed'),
    speedVariance: z.number().optional().describe('Random speed variance'),
    startSize: z.number().optional().describe('Initial particle size'),
    endSize: z.number().optional().describe('End-of-life particle size'),
    startColor: z.string().optional().describe('Start color hex'),
    endColor: z.string().optional().describe('End color hex'),
    gravityX: z.number().optional().describe('Gravity X'),
    gravityY: z.number().optional().describe('Gravity Y'),
    gravityZ: z.number().optional().describe('Gravity Z'),
    drag: z.number().optional().describe('Air drag 0-1'),
    shape: z.enum(['sphere', 'box', 'cone']).optional().describe('Emission shape'),
    shapeRadius: z.number().optional().describe('Emission shape radius'),
    shapeAngle: z.number().optional().describe('Cone emission angle in degrees'),
    blendMode: z.enum(['normal', 'additive', 'multiply']).optional().describe('Blend mode'),
    loop: z.boolean().optional().describe('Loop emission'),
  },
  async ({ projectPath, particleId, ...props }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const particlesDir = path.join(projRoot, 'Particles');
    if (!fs.existsSync(particlesDir)) return { content: [{ type: 'text', text: 'Particles/ folder not found.' }] };
    for (const f of fs.readdirSync(particlesDir).filter(f => f.endsWith('.json'))) {
      const fp = path.join(particlesDir, f);
      const d = readJsonFile(fp);
      if (d.assetId === particleId) {
        for (const [k, v] of Object.entries(props)) {
          if (v === undefined) continue;
          if (k === 'gravityX') { if (!d.gravity) d.gravity = {}; d.gravity.x = v; }
          else if (k === 'gravityY') { if (!d.gravity) d.gravity = {}; d.gravity.y = v; }
          else if (k === 'gravityZ') { if (!d.gravity) d.gravity = {}; d.gravity.z = v; }
          else (d as any)[k] = v;
        }
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Updated particle emitter "${d.assetName}"` }] };
      }
    }
    return { content: [{ type: 'text', text: `Particle emitter not found: ${particleId}` }] };
  }
);

server.tool(
  'delete_particle_emitter',
  'Delete a particle emitter asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    particleId: z.string().describe('Particle emitter asset ID'),
  },
  async ({ projectPath, particleId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const particlesDir = path.join(projRoot, 'Particles');
    if (!fs.existsSync(particlesDir)) return { content: [{ type: 'text', text: 'Particles/ folder not found.' }] };
    for (const f of fs.readdirSync(particlesDir).filter(f => f.endsWith('.json'))) {
      const fp = path.join(particlesDir, f);
      const d = readJsonFile(fp);
      if (d.assetId === particleId) {
        fs.unlinkSync(fp);
        broadcastChange({ type: 'asset-deleted', assetType: 'particles', assetId: particleId, name: d.assetName });
        return { content: [{ type: 'text', text: `Deleted particle emitter "${d.assetName}" (${particleId})` }] };
      }
    }
    return { content: [{ type: 'text', text: `Particle emitter not found: ${particleId}` }] };
  }
);

// ============================================================
//  §19  NAVMESH / AI PATHFINDING
// ============================================================

server.tool(
  'configure_navmesh',
  'Create or update NavMesh configuration for a scene. Sets agent and voxelization parameters.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json)'),
    cellSize: z.number().optional().describe('Voxel cell size. Default: 0.3'),
    cellHeight: z.number().optional().describe('Voxel cell height. Default: 0.2'),
    agentHeight: z.number().optional().describe('Agent height. Default: 2.0'),
    agentRadius: z.number().optional().describe('Agent radius. Default: 0.6'),
    agentMaxClimb: z.number().optional().describe('Max step height. Default: 0.9'),
    agentMaxSlope: z.number().optional().describe('Max walkable slope in degrees. Default: 45'),
    regionMinSize: z.number().optional().describe('Min region size. Default: 8'),
    regionMergeSize: z.number().optional().describe('Region merge size. Default: 20'),
    edgeMaxLen: z.number().optional().describe('Max edge length. Default: 12'),
    edgeMaxError: z.number().optional().describe('Max edge error. Default: 1.3'),
    detailSampleDist: z.number().optional().describe('Detail mesh sample distance. Default: 6'),
    detailSampleMaxError: z.number().optional().describe('Detail mesh max error. Default: 1'),
    tileSize: z.number().optional().describe('Tile size (0 = non-tiled). Default: 0'),
  },
  async ({ projectPath, sceneName, ...params }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    const scene = readJsonFile(scenePath);
    if (!scene.navMeshConfig) scene.navMeshConfig = {};
    const cfg = scene.navMeshConfig;
    cfg.cellSize = params.cellSize ?? cfg.cellSize ?? 0.3;
    cfg.cellHeight = params.cellHeight ?? cfg.cellHeight ?? 0.2;
    cfg.agentHeight = params.agentHeight ?? cfg.agentHeight ?? 2.0;
    cfg.agentRadius = params.agentRadius ?? cfg.agentRadius ?? 0.6;
    cfg.agentMaxClimb = params.agentMaxClimb ?? cfg.agentMaxClimb ?? 0.9;
    cfg.agentMaxSlope = params.agentMaxSlope ?? cfg.agentMaxSlope ?? 45;
    cfg.regionMinSize = params.regionMinSize ?? cfg.regionMinSize ?? 8;
    cfg.regionMergeSize = params.regionMergeSize ?? cfg.regionMergeSize ?? 20;
    cfg.edgeMaxLen = params.edgeMaxLen ?? cfg.edgeMaxLen ?? 12;
    cfg.edgeMaxError = params.edgeMaxError ?? cfg.edgeMaxError ?? 1.3;
    cfg.detailSampleDist = params.detailSampleDist ?? cfg.detailSampleDist ?? 6;
    cfg.detailSampleMaxError = params.detailSampleMaxError ?? cfg.detailSampleMaxError ?? 1;
    cfg.tileSize = params.tileSize ?? cfg.tileSize ?? 0;
    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: `NavMesh configured for scene "${sceneName}"\nAgent: h=${cfg.agentHeight} r=${cfg.agentRadius} climb=${cfg.agentMaxClimb} slope=${cfg.agentMaxSlope}°\nVoxel: cell=${cfg.cellSize} height=${cfg.cellHeight}` }] };
  }
);

server.tool(
  'bake_navmesh',
  'Trigger NavMesh baking for a scene via the engine bridge. Requires the engine to be running.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json)'),
  },
  async ({ projectPath, sceneName }) => {
    const result = await bridgeRequest('bake_navmesh', { sceneName }, 30000);
    if (!result) return { content: [{ type: 'text', text: 'NavMesh bake request sent but no response from engine. Is the engine running?' }] };
    if (result.error) return { content: [{ type: 'text', text: `NavMesh bake failed: ${result.error}` }] };
    return { content: [{ type: 'text', text: `NavMesh baked for scene "${sceneName}". ${result.triangles || '?'} triangles, ${result.vertices || '?'} vertices.` }] };
  }
);

server.tool(
  'create_behavior_tree',
  'Create a Behavior Tree asset for AI actor decision-making.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Behavior Tree name (e.g. "BT_EnemyPatrol")'),
    rootType: z.enum(['sequence', 'selector', 'parallel']).optional().describe('Root composite type. Default: "selector"'),
    nodes: z.array(z.object({
      type: z.enum(['sequence', 'selector', 'parallel', 'condition', 'action', 'wait', 'decorator', 'inverter']).describe('Node type'),
      name: z.string().describe('Node name'),
      parentIndex: z.number().optional().describe('Parent node index (0-based, -1 for root children). Default: -1'),
      data: z.record(z.any()).optional().describe('Node-specific data (e.g. waitTime, conditionKey, actionName)'),
    })).optional().describe('Child nodes to add under the root'),
  },
  async ({ projectPath, name, rootType, nodes }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const btDir = path.join(projRoot, 'BehaviorTrees');
    if (!fs.existsSync(btDir)) fs.mkdirSync(btDir, { recursive: true });
    const id = navUid();
    const rootNode = { id: 'bt_root_' + id, type: rootType ?? 'selector', name: 'Root', children: [] as any[] };
    const allNodes = [rootNode];
    if (nodes && nodes.length > 0) {
      for (const n of nodes) {
        const nid = 'bt_' + (++_uid).toString(36);
        const btNode: any = { id: nid, type: n.type, name: n.name, children: [], data: n.data || {} };
        allNodes.push(btNode);
        const parentIdx = n.parentIndex ?? -1;
        if (parentIdx === -1) {
          rootNode.children.push(btNode);
        } else if (parentIdx >= 0 && parentIdx < allNodes.length) {
          allNodes[parentIdx].children.push(btNode);
        }
      }
    }
    const btAsset = { assetId: id, assetName: name, rootNode };
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeJsonFile(path.join(btDir, `${safeName}_${id}.json`), btAsset);
    return { content: [{ type: 'text', text: `Created Behavior Tree "${name}" (ID: ${id}) with ${allNodes.length} nodes` }] };
  }
);

server.tool(
  'list_behavior_trees',
  'List all Behavior Tree assets in the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const btDir = path.join(projRoot, 'BehaviorTrees');
    if (!fs.existsSync(btDir)) return { content: [{ type: 'text', text: 'No behavior trees. BehaviorTrees/ folder does not exist.' }] };
    const files = fs.readdirSync(btDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    if (files.length === 0) return { content: [{ type: 'text', text: 'No behavior tree assets found.' }] };
    const lines: string[] = [];
    for (const f of files) {
      try {
        const d = readJsonFile(path.join(btDir, f));
        const countNodes = (n: any): number => { let c = 1; for (const ch of (n.children || [])) c += countNodes(ch); return c; };
        lines.push(`${d.assetName} (ID: ${d.assetId}) — ${countNodes(d.rootNode)} nodes, root=${d.rootNode.type}`);
      } catch { /* skip */ }
    }
    return { content: [{ type: 'text', text: `Behavior Trees (${lines.length}):\n${lines.join('\n')}` }] };
  }
);

server.tool(
  'assign_behavior_tree_to_actor',
  'Assign a Behavior Tree to an actor by adding an AIController component.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('Actor asset ID to assign the behavior tree to'),
    behaviorTreeId: z.string().describe('Behavior Tree asset ID'),
  },
  async ({ projectPath, actorId, behaviorTreeId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    if (!actor.components) actor.components = [];
    // Remove existing AI controller if present
    actor.components = actor.components.filter((c: any) => c.type !== 'AIControllerComponent');
    const cid = compUid();
    actor.components.push({
      id: cid, type: 'AIControllerComponent', name: 'AIController',
      behaviorTreeId,
    });
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Assigned Behavior Tree "${behaviorTreeId}" to actor "${actor.actorName}" via AIControllerComponent [${cid}]` }] };
  }
);

// ============================================================
//  §20  INPUT MAPPINGS (CREATE / MODIFY / DELETE)
// ============================================================

server.tool(
  'create_input_mapping',
  'Create a new input mapping configuration with action and axis bindings.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Input mapping name (e.g. "DefaultInput")'),
    actionMappings: z.array(z.object({
      name: z.string().describe('Action name (e.g. "Jump", "Fire", "Interact")'),
      keys: z.array(z.string()).describe('Key bindings (e.g. ["Space"], ["LeftMouseButton", "GamepadA"])'),
    })).optional().describe('Action mappings (binary on/off inputs)'),
    axisMappings: z.array(z.object({
      name: z.string().describe('Axis name (e.g. "MoveForward", "MoveRight", "LookUp")'),
      key: z.string().describe('Key binding'),
      scale: z.number().describe('Scale factor (-1 for negative direction, 1 for positive)'),
    })).optional().describe('Axis mappings (continuous -1 to 1 inputs)'),
  },
  async ({ projectPath, name, actionMappings, axisMappings }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const inputDir = path.join(projRoot, 'InputMappings');
    if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
    const id = inputMapUid();
    const asset = {
      id,
      name,
      actionMappings: actionMappings || [],
      axisMappings: axisMappings || [],
    };
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeJsonFile(path.join(inputDir, `${safeName}_${id}.json`), asset);
    return { content: [{ type: 'text', text: `Created input mapping "${name}" (ID: ${id})\n${(actionMappings || []).length} actions, ${(axisMappings || []).length} axes` }] };
  }
);

server.tool(
  'modify_input_mapping',
  'Add, remove, or update action/axis bindings in an existing input mapping.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    inputMappingId: z.string().describe('Input mapping asset ID'),
    command: z.enum(['add_action', 'remove_action', 'add_axis', 'remove_axis', 'update_action_keys']).describe('Operation to perform'),
    actionName: z.string().optional().describe('Action or axis name'),
    keys: z.array(z.string()).optional().describe('Key bindings for add_action / update_action_keys'),
    key: z.string().optional().describe('Key binding for add_axis'),
    scale: z.number().optional().describe('Scale factor for add_axis'),
  },
  async ({ projectPath, inputMappingId, command, actionName, keys, key, scale }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const inputDir = path.join(projRoot, 'InputMappings');
    if (!fs.existsSync(inputDir)) return { content: [{ type: 'text', text: 'InputMappings/ folder not found.' }] };
    for (const f of fs.readdirSync(inputDir).filter(f => f.endsWith('.json'))) {
      const fp = path.join(inputDir, f);
      const d = readJsonFile(fp);
      if (d.id !== inputMappingId) continue;
      if (!d.actionMappings) d.actionMappings = [];
      if (!d.axisMappings) d.axisMappings = [];

      if (command === 'add_action') {
        if (!actionName || !keys) return { content: [{ type: 'text', text: 'actionName and keys are required for add_action' }] };
        d.actionMappings.push({ name: actionName, keys });
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Added action "${actionName}" with keys [${keys.join(', ')}]` }] };
      }
      if (command === 'remove_action') {
        d.actionMappings = d.actionMappings.filter((a: any) => a.name !== actionName);
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Removed action "${actionName}"` }] };
      }
      if (command === 'add_axis') {
        if (!actionName || !key) return { content: [{ type: 'text', text: 'actionName (axis name) and key are required for add_axis' }] };
        d.axisMappings.push({ name: actionName, key, scale: scale ?? 1 });
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Added axis "${actionName}" key=${key} scale=${scale ?? 1}` }] };
      }
      if (command === 'remove_axis') {
        d.axisMappings = d.axisMappings.filter((a: any) => !(a.name === actionName && (key ? a.key === key : true)));
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Removed axis "${actionName}"${key ? ` key=${key}` : ''}` }] };
      }
      if (command === 'update_action_keys') {
        const action = d.actionMappings.find((a: any) => a.name === actionName);
        if (!action) return { content: [{ type: 'text', text: `Action not found: ${actionName}` }] };
        action.keys = keys || [];
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Updated action "${actionName}" keys to [${(keys || []).join(', ')}]` }] };
      }
      return { content: [{ type: 'text', text: `Unknown command: ${command}` }] };
    }
    return { content: [{ type: 'text', text: `Input mapping not found: ${inputMappingId}` }] };
  }
);

server.tool(
  'delete_input_mapping',
  'Delete an input mapping asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    inputMappingId: z.string().describe('Input mapping asset ID to delete'),
  },
  async ({ projectPath, inputMappingId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const inputDir = path.join(projRoot, 'InputMappings');
    if (!fs.existsSync(inputDir)) return { content: [{ type: 'text', text: 'InputMappings/ folder not found.' }] };
    for (const f of fs.readdirSync(inputDir).filter(f => f.endsWith('.json'))) {
      const fp = path.join(inputDir, f);
      const d = readJsonFile(fp);
      if (d.id === inputMappingId) {
        fs.unlinkSync(fp);
        broadcastChange({ type: 'asset-deleted', assetType: 'inputmappings', assetId: inputMappingId, name: d.name });
        return { content: [{ type: 'text', text: `Deleted input mapping "${d.name}" (${inputMappingId})` }] };
      }
    }
    return { content: [{ type: 'text', text: `Input mapping not found: ${inputMappingId}` }] };
  }
);

// ============================================================
//  §21  WORLD PHYSICS SETTINGS
// ============================================================

server.tool(
  'set_world_physics',
  'Configure world-level physics settings for a scene (gravity, timestep, solver).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json)'),
    gravityX: z.number().optional().describe('Gravity X component. Default: 0'),
    gravityY: z.number().optional().describe('Gravity Y component. Default: -9.8'),
    gravityZ: z.number().optional().describe('Gravity Z component. Default: 0'),
    fixedTimestep: z.number().optional().describe('Physics fixed timestep in seconds (0.001-0.1). Default: 0.016'),
    maxSubsteps: z.number().optional().describe('Max physics sub-steps per frame (1-32). Default: 4'),
    solverIterations: z.number().optional().describe('Physics solver iterations (1-32). Default: 4'),
    enableInterpolation: z.boolean().optional().describe('Enable transform interpolation. Default: true'),
    debugDraw: z.boolean().optional().describe('Show physics debug visualization. Default: false'),
  },
  async ({ projectPath, sceneName, gravityX, gravityY, gravityZ, fixedTimestep, maxSubsteps, solverIterations, enableInterpolation, debugDraw }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    const scene = readJsonFile(scenePath);
    if (!scene.physicsSettings) scene.physicsSettings = {};
    const ps = scene.physicsSettings;
    if (gravityX !== undefined || gravityY !== undefined || gravityZ !== undefined) {
      if (!ps.gravity) ps.gravity = { x: 0, y: -9.8, z: 0 };
      if (gravityX !== undefined) ps.gravity.x = gravityX;
      if (gravityY !== undefined) ps.gravity.y = gravityY;
      if (gravityZ !== undefined) ps.gravity.z = gravityZ;
    }
    if (fixedTimestep !== undefined) ps.fixedTimestep = Math.max(0.001, Math.min(0.1, fixedTimestep));
    if (maxSubsteps !== undefined) ps.maxSubsteps = Math.max(1, Math.min(32, maxSubsteps));
    if (solverIterations !== undefined) ps.solverIterations = Math.max(1, Math.min(32, solverIterations));
    if (enableInterpolation !== undefined) ps.enableInterpolation = enableInterpolation;
    if (debugDraw !== undefined) ps.debugDraw = debugDraw;
    writeJsonFile(scenePath, scene);
    const g = ps.gravity || { x: 0, y: -9.8, z: 0 };
    return { content: [{ type: 'text', text: `Physics settings updated for "${sceneName}"\nGravity: (${g.x}, ${g.y}, ${g.z})\nTimestep: ${ps.fixedTimestep ?? 0.016}s, SubSteps: ${ps.maxSubsteps ?? 4}, Solver: ${ps.solverIterations ?? 4}\nInterpolation: ${ps.enableInterpolation ?? true}, DebugDraw: ${ps.debugDraw ?? false}` }] };
  }
);

// ============================================================
//  §22  PLAY / STOP CONTROLS (via Bridge)
// ============================================================

server.tool(
  'play_scene',
  'Start play mode in the engine to test the game. Requires the engine to be running and connected.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().optional().describe('Scene to play. If omitted, plays the active scene.'),
  },
  async ({ projectPath, sceneName }) => {
    const result = await bridgeRequest('play_scene', { sceneName }, 10000);
    if (!result) return { content: [{ type: 'text', text: 'Play request sent but no response from engine. Is the engine running and connected via WebSocket?' }] };
    if (result.error) return { content: [{ type: 'text', text: `Failed to start play mode: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Play mode started${sceneName ? ` for scene "${sceneName}"` : ''}. ${result.message || ''}` }] };
  }
);

server.tool(
  'stop_scene',
  'Stop play mode and return to the editor. Requires the engine to be running and connected.',
  {},
  async () => {
    const result = await bridgeRequest('stop_scene', {}, 10000);
    if (!result) return { content: [{ type: 'text', text: 'Stop request sent but no response from engine. Is the engine running?' }] };
    if (result.error) return { content: [{ type: 'text', text: `Failed to stop play mode: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Play mode stopped. ${result.message || ''}` }] };
  }
);

server.tool(
  'get_play_state',
  'Check whether the engine is in play mode or editor mode.',
  {},
  async () => {
    const result = await bridgeRequest('get_play_state', {}, 5000);
    if (!result) return { content: [{ type: 'text', text: 'No response from engine. Is it running?' }] };
    return { content: [{ type: 'text', text: `Engine state: ${result.state || 'unknown'}${result.sceneName ? ` (scene: ${result.sceneName})` : ''}` }] };
  }
);

// ============================================================
//  §23  SCENE MANAGEMENT GAPS
// ============================================================

server.tool(
  'delete_scene',
  'Delete a scene file from the project.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json)'),
  },
  async ({ projectPath, sceneName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    fs.unlinkSync(scenePath);
    broadcastChange({ type: 'asset-deleted', assetType: 'scenes', assetId: sceneName, name: sceneName });
    return { content: [{ type: 'text', text: `Deleted scene "${sceneName}"` }] };
  }
);

server.tool(
  'duplicate_scene',
  'Clone an existing scene into a new scene with a different name.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sourceName: z.string().describe('Source scene name (without .json)'),
    newName: z.string().describe('New scene name'),
  },
  async ({ projectPath, sourceName, newName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const sourcePath = path.join(projRoot, 'Scenes', sourceName + '.json');
    if (!fs.existsSync(sourcePath)) return { content: [{ type: 'text', text: `Source scene not found: ${sourceName}` }] };
    const scene = readJsonFile(sourcePath);
    scene.sceneName = newName;
    scene.name = newName;
    const newPath = path.join(projRoot, 'Scenes', newName + '.json');
    if (fs.existsSync(newPath)) return { content: [{ type: 'text', text: `Scene "${newName}" already exists.` }] };
    writeJsonFile(newPath, scene);
    return { content: [{ type: 'text', text: `Duplicated scene "${sourceName}" → "${newName}"` }] };
  }
);

server.tool(
  'rename_scene',
  'Rename an existing scene.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    oldName: z.string().describe('Current scene name (without .json)'),
    newName: z.string().describe('New scene name'),
  },
  async ({ projectPath, oldName, newName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const oldPath = path.join(projRoot, 'Scenes', oldName + '.json');
    if (!fs.existsSync(oldPath)) return { content: [{ type: 'text', text: `Scene not found: ${oldName}` }] };
    const newPath = path.join(projRoot, 'Scenes', newName + '.json');
    if (fs.existsSync(newPath)) return { content: [{ type: 'text', text: `Scene "${newName}" already exists.` }] };
    const scene = readJsonFile(oldPath);
    scene.sceneName = newName;
    scene.name = newName;
    writeJsonFile(newPath, scene);
    fs.unlinkSync(oldPath);
    // Update project.json active scene if it was the active one
    const projFile = path.join(projRoot, 'project.json');
    if (fs.existsSync(projFile)) {
      const proj = readJsonFile(projFile);
      if (proj.activeScene && (proj.activeScene === oldName || proj.activeScene === `Scenes/${oldName}.json`)) {
        proj.activeScene = `Scenes/${newName}.json`;
        writeJsonFile(projFile, proj);
      }
    }
    broadcastChange({ type: 'asset-renamed', assetType: 'scenes', oldName, newName });
    return { content: [{ type: 'text', text: `Renamed scene "${oldName}" → "${newName}"` }] };
  }
);

server.tool(
  'set_active_scene',
  'Set the project\'s active/default scene that loads on startup.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json)'),
  },
  async ({ projectPath, sceneName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    const projFile = path.join(projRoot, 'project.json');
    if (!fs.existsSync(projFile)) return { content: [{ type: 'text', text: 'project.json not found' }] };
    const proj = readJsonFile(projFile);
    proj.activeScene = `Scenes/${sceneName}.json`;
    writeJsonFile(projFile, proj);
    return { content: [{ type: 'text', text: `Active scene set to "${sceneName}"` }] };
  }
);

server.tool(
  'set_scene_2d_config',
  'Configure 2D-specific scene settings (gravity, background color, reference resolution, pixels-per-unit).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json)'),
    gravityX: z.number().optional().describe('2D gravity X. Default: 0'),
    gravityY: z.number().optional().describe('2D gravity Y. Default: -9.8'),
    backgroundColor: z.string().optional().describe('Background color hex (e.g. "#1a1a2e")'),
    referenceWidth: z.number().optional().describe('Reference resolution width'),
    referenceHeight: z.number().optional().describe('Reference resolution height'),
    pixelsPerUnit: z.number().optional().describe('Pixels per world unit. Default: 100'),
  },
  async ({ projectPath, sceneName, gravityX, gravityY, backgroundColor, referenceWidth, referenceHeight, pixelsPerUnit }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    const scene = readJsonFile(scenePath);
    if (!scene.scene2DConfig) scene.scene2DConfig = {};
    const cfg = scene.scene2DConfig;
    if (gravityX !== undefined) cfg.gravityX = gravityX;
    if (gravityY !== undefined) cfg.gravityY = gravityY;
    if (backgroundColor !== undefined) cfg.backgroundColor = backgroundColor;
    if (referenceWidth !== undefined) cfg.referenceWidth = referenceWidth;
    if (referenceHeight !== undefined) cfg.referenceHeight = referenceHeight;
    if (pixelsPerUnit !== undefined) cfg.pixelsPerUnit = pixelsPerUnit;
    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: `2D scene config updated for "${sceneName}"\nGravity: (${cfg.gravityX ?? 0}, ${cfg.gravityY ?? -9.8}), PPU: ${cfg.pixelsPerUnit ?? 100}${backgroundColor ? `, BG: ${backgroundColor}` : ''}` }] };
  }
);

// ============================================================
//  §24  FONT MANAGEMENT
// ============================================================

server.tool(
  'import_font',
  'Import a font file (TTF/OTF/WOFF/WOFF2) into the project Fonts folder.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sourcePath: z.string().describe('Absolute path to the source font file'),
    displayName: z.string().optional().describe('Display name for the font (defaults to filename)'),
  },
  async ({ projectPath, sourcePath, displayName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const fontsDir = path.join(projRoot, 'Fonts');
    if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
    if (!fs.existsSync(sourcePath)) return { content: [{ type: 'text', text: `Source not found: ${sourcePath}` }] };
    const ext = path.extname(sourcePath).toLowerCase();
    const formatMap: Record<string, string> = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };
    if (!formatMap[ext]) return { content: [{ type: 'text', text: `Unsupported font format: ${ext}. Supported: .ttf, .otf, .woff, .woff2` }] };
    const fontData = fs.readFileSync(sourcePath);
    const mimeMap: Record<string, string> = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
    const dataUrl = `data:${mimeMap[ext]};base64,${fontData.toString('base64')}`;
    const baseName = path.basename(sourcePath, ext);
    const name = displayName || baseName;
    const id = fontUid();
    const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cssFamily = 'Custom_' + cleanName + '_' + id;
    const asset = {
      assetId: id,
      assetName: cleanName,
      displayName: name,
      sourceFile: path.basename(sourcePath),
      format: formatMap[ext],
      cssFamily,
      data: dataUrl,
    };
    writeJsonFile(path.join(fontsDir, `${cleanName}_${id}.json`), asset);
    // Update index
    const indexPath = path.join(fontsDir, '_index.json');
    let index: Record<string, string> = {};
    if (fs.existsSync(indexPath)) { try { index = readJsonFile(indexPath); } catch { /* start fresh */ } }
    index[id] = `${cleanName}_${id}.json`;
    writeJsonFile(indexPath, index);
    return { content: [{ type: 'text', text: `Imported font "${name}" (ID: ${id}, format: ${formatMap[ext]})\nCSS Family: ${cssFamily}` }] };
  }
);

server.tool(
  'list_fonts',
  'List all fonts available in the project (imported + system defaults).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
  },
  async ({ projectPath }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const fontsDir = path.join(projRoot, 'Fonts');
    const systemFonts = ['Arial', 'Georgia', 'Courier New', 'Verdana', 'Impact', 'Times New Roman', 'Comic Sans MS', 'Trebuchet MS', 'Lucida Console'];
    const lines: string[] = [];
    lines.push('System Fonts: ' + systemFonts.join(', '));
    if (fs.existsSync(fontsDir)) {
      const files = fs.readdirSync(fontsDir).filter(f => f.endsWith('.json') && f !== '_index.json');
      for (const f of files) {
        try {
          const d = readJsonFile(path.join(fontsDir, f));
          lines.push(`[Imported] ${d.displayName || d.assetName} (ID: ${d.assetId}, format: ${d.format}, CSS: ${d.cssFamily})`);
        } catch { /* skip */ }
      }
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

server.tool(
  'delete_font',
  'Delete an imported font asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    fontId: z.string().describe('Font asset ID to delete'),
  },
  async ({ projectPath, fontId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const fontsDir = path.join(projRoot, 'Fonts');
    if (!fs.existsSync(fontsDir)) return { content: [{ type: 'text', text: 'Fonts/ folder not found.' }] };
    for (const f of fs.readdirSync(fontsDir).filter(f => f.endsWith('.json') && f !== '_index.json')) {
      const fp = path.join(fontsDir, f);
      const d = readJsonFile(fp);
      if (d.assetId === fontId) {
        fs.unlinkSync(fp);
        // Update index
        const indexPath = path.join(fontsDir, '_index.json');
        if (fs.existsSync(indexPath)) {
          try {
            const index = readJsonFile(indexPath);
            delete index[fontId];
            writeJsonFile(indexPath, index);
          } catch { /* ok */ }
        }
        broadcastChange({ type: 'asset-deleted', assetType: 'fonts', assetId: fontId, name: d.displayName || d.assetName });
        return { content: [{ type: 'text', text: `Deleted font "${d.displayName || d.assetName}" (${fontId})` }] };
      }
    }
    return { content: [{ type: 'text', text: `Font not found: ${fontId}` }] };
  }
);

// ============================================================
//  §25  SORTING LAYERS (2D)
// ============================================================

server.tool(
  'set_sorting_layers',
  'Define the 2D sorting layer stack for a scene. Controls rendering order.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json)'),
    layers: z.array(z.object({
      name: z.string().describe('Layer name (e.g. "Background", "Characters", "UI")'),
      z: z.number().describe('Z-order value (higher = rendered on top)'),
      visible: z.boolean().optional().describe('Whether layer is visible. Default: true'),
      locked: z.boolean().optional().describe('Whether layer is locked. Default: false'),
    })).describe('Sorting layers from back to front'),
  },
  async ({ projectPath, sceneName, layers }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    const scene = readJsonFile(scenePath);
    // Ensure Default layer exists
    if (!layers.find(l => l.name === 'Default')) {
      layers.push({ name: 'Default', z: 20, visible: true, locked: false });
    }
    scene.sortingLayers = layers.map(l => ({ name: l.name, z: l.z, visible: l.visible ?? true, locked: l.locked ?? false }));
    writeJsonFile(scenePath, scene);
    return { content: [{ type: 'text', text: `Set ${layers.length} sorting layers for "${sceneName}":\n${layers.map(l => `  ${l.name} (z=${l.z})`).join('\n')}` }] };
  }
);

server.tool(
  'get_sorting_layers',
  'Get the current 2D sorting layers for a scene.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    sceneName: z.string().describe('Scene name (without .json)'),
  },
  async ({ projectPath, sceneName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const scenePath = path.join(projRoot, 'Scenes', sceneName + '.json');
    if (!fs.existsSync(scenePath)) return { content: [{ type: 'text', text: `Scene not found: ${sceneName}` }] };
    const scene = readJsonFile(scenePath);
    const layers = scene.sortingLayers || [
      { name: 'Background', z: 0 }, { name: 'Ground', z: 10 }, { name: 'Default', z: 20 },
      { name: 'Characters', z: 30 }, { name: 'Projectiles', z: 40 }, { name: 'Effects', z: 50 },
      { name: 'UI', z: 90 }, { name: 'Overlay', z: 100 },
    ];
    return { content: [{ type: 'text', text: `Sorting Layers for "${sceneName}" (${layers.length}):\n${layers.map((l: any) => `  ${l.name} (z=${l.z}, visible=${l.visible ?? true}, locked=${l.locked ?? false})`).join('\n')}` }] };
  }
);

// ============================================================
//  §26  CLASS INHERITANCE
// ============================================================

server.tool(
  'set_actor_parent_class',
  'Make an actor inherit from another actor. The child gets the parent\'s components, variables, and event graph as a base.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    childActorId: z.string().describe('Actor ID of the child class'),
    parentActorId: z.string().describe('Actor ID of the parent class'),
  },
  async ({ projectPath, childActorId, parentActorId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath: childPath, data: child } = findActorFile(actorsDir, childActorId);
    const { filePath: parentPath, data: parent } = findActorFile(actorsDir, parentActorId);
    if (!childPath || !child) return { content: [{ type: 'text', text: `Child actor not found: ${childActorId}` }] };
    if (!parentPath || !parent) return { content: [{ type: 'text', text: `Parent actor not found: ${parentActorId}` }] };
    // Mark parent as a parent class
    if (!parent._inheritance) parent._inheritance = {};
    parent._inheritance.isParentClass = true;
    if (!parent._inheritance.childClassIds) parent._inheritance.childClassIds = [];
    if (!parent._inheritance.childClassIds.includes(childActorId)) {
      parent._inheritance.childClassIds.push(childActorId);
    }
    parent._inheritance.classVersion = (parent._inheritance.classVersion || 0) + 1;
    writeJsonFile(parentPath, parent);
    // Set up child inheritance
    if (!child._inheritance) child._inheritance = {};
    child._inheritance.parentClassId = parentActorId;
    child._inheritance.parentVersion = parent._inheritance.classVersion;
    child._inheritance.lastSyncedWithParent = new Date().toISOString();
    child._inheritance.componentOverrides = child._inheritance.componentOverrides || [];
    child._inheritance.variableOverrides = child._inheritance.variableOverrides || [];
    writeJsonFile(childPath, child);
    return { content: [{ type: 'text', text: `Set "${child.actorName}" to inherit from "${parent.actorName}"\nParent class version: ${parent._inheritance.classVersion}` }] };
  }
);

server.tool(
  'create_child_actor',
  'Create a new actor that inherits from a parent actor class, copying its components, variables, and event graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    parentActorId: z.string().describe('Parent actor ID to inherit from'),
    childName: z.string().describe('Name for the new child actor'),
  },
  async ({ projectPath, parentActorId, childName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath: parentPath, data: parent } = findActorFile(actorsDir, parentActorId);
    if (!parentPath || !parent) return { content: [{ type: 'text', text: `Parent actor not found: ${parentActorId}` }] };
    const childId = assetUid();
    // Deep clone parent data
    const child = JSON.parse(JSON.stringify(parent));
    child.actorId = childId;
    child.actorName = childName;
    // Set up inheritance metadata
    if (!parent._inheritance) parent._inheritance = {};
    parent._inheritance.isParentClass = true;
    if (!parent._inheritance.childClassIds) parent._inheritance.childClassIds = [];
    parent._inheritance.childClassIds.push(childId);
    parent._inheritance.classVersion = (parent._inheritance.classVersion || 0) + 1;
    writeJsonFile(parentPath, parent);
    child._inheritance = {
      parentClassId: parentActorId,
      parentVersion: parent._inheritance.classVersion,
      lastSyncedWithParent: new Date().toISOString(),
      componentOverrides: [],
      variableOverrides: [],
    };
    // Regenerate component IDs to avoid collisions
    if (child.components) {
      for (const comp of child.components) {
        comp.id = compUid();
      }
    }
    const safeName = childName.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeJsonFile(path.join(actorsDir, `${safeName}_${childId}.json`), child);
    return { content: [{ type: 'text', text: `Created child actor "${childName}" (ID: ${childId}) inheriting from "${parent.actorName}" (${parentActorId})\nInherited ${(child.components || []).length} components, ${(child.variables || []).length} variables` }] };
  }
);

server.tool(
  'sync_actor_with_parent',
  'Synchronize a child actor with its parent class, applying any changes from the parent while preserving child overrides.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    childActorId: z.string().describe('Child actor ID to sync with its parent'),
  },
  async ({ projectPath, childActorId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath: childPath, data: child } = findActorFile(actorsDir, childActorId);
    if (!childPath || !child) return { content: [{ type: 'text', text: `Child actor not found: ${childActorId}` }] };
    if (!child._inheritance?.parentClassId) return { content: [{ type: 'text', text: `Actor "${child.actorName}" has no parent class.` }] };
    const { filePath: parentPath, data: parent } = findActorFile(actorsDir, child._inheritance.parentClassId);
    if (!parentPath || !parent) return { content: [{ type: 'text', text: `Parent actor not found: ${child._inheritance.parentClassId}` }] };
    // Track what changed
    const changes: string[] = [];
    // Sync components that child hasn't overridden
    const overriddenCompIds = new Set((child._inheritance.componentOverrides || []).map((o: any) => o.componentId));
    if (parent.components) {
      for (const pc of parent.components) {
        if (!overriddenCompIds.has(pc.id)) {
          const existingIdx = (child.components || []).findIndex((c: any) => c._parentCompId === pc.id);
          if (existingIdx >= 0) {
            child.components[existingIdx] = { ...JSON.parse(JSON.stringify(pc)), _parentCompId: pc.id };
            changes.push(`Updated component: ${pc.name || pc.type}`);
          }
        }
      }
    }
    // Sync variables that child hasn't overridden
    const overriddenVarIds = new Set((child._inheritance.variableOverrides || []).map((o: any) => o.variableId));
    if (parent.variables) {
      for (const pv of parent.variables) {
        if (!overriddenVarIds.has(pv.id)) {
          const existingIdx = (child.variables || []).findIndex((v: any) => v.id === pv.id);
          if (existingIdx >= 0) {
            child.variables[existingIdx] = JSON.parse(JSON.stringify(pv));
            changes.push(`Updated variable: ${pv.name}`);
          } else {
            if (!child.variables) child.variables = [];
            child.variables.push(JSON.parse(JSON.stringify(pv)));
            changes.push(`Added variable: ${pv.name}`);
          }
        }
      }
    }
    child._inheritance.parentVersion = parent._inheritance?.classVersion || 0;
    child._inheritance.lastSyncedWithParent = new Date().toISOString();
    writeJsonFile(childPath, child);
    return { content: [{ type: 'text', text: `Synced "${child.actorName}" with parent "${parent.actorName}"\n${changes.length ? changes.join('\n') : 'No changes needed (already in sync)'}` }] };
  }
);

// ============================================================
//  §27  SHADER GRAPH
// ============================================================

server.tool(
  'create_shader',
  'Create a custom shader with a node graph for advanced visual effects.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    materialId: z.string().describe('Material asset ID to attach the shader graph to'),
    nodes: z.array(z.object({
      type: z.enum(['Color', 'Float', 'Math', 'Time', 'UV', 'Texture2D', 'Vector2', 'Vector3']).describe('Shader node type'),
      positionX: z.number().optional().describe('Node X position'),
      positionY: z.number().optional().describe('Node Y position'),
      data: z.record(z.any()).optional().describe('Node-specific data (e.g. value for Float, hex for Color, operation for Math)'),
    })).optional().describe('Shader graph nodes to add'),
    connections: z.array(z.object({
      fromNodeIndex: z.number().describe('Source node index (0-based, within the nodes array)'),
      fromPort: z.number().describe('Source port index'),
      toNodeIndex: z.number().describe('Target node index (-1 for Output node)'),
      toPort: z.number().describe('Target port index (0=BaseColor, 1=Normal, 2=Roughness, 3=Metalness, 4=Emissive, 5=Opacity for Output)'),
    })).optional().describe('Connections between nodes'),
  },
  async ({ projectPath, materialId, nodes, connections }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const meshDir = path.join(projRoot, 'Meshes');
    // Find the material in standalone materials or mesh files
    const standaloneFile = path.join(meshDir, '_standalone_materials.json');
    let matAsset: any = null;
    let matFile: string | null = null;
    let matContainer: any = null;
    if (fs.existsSync(standaloneFile)) {
      const standalone = readJsonFile(standaloneFile);
      const found = (standalone.materials || []).find((m: any) => m.assetId === materialId);
      if (found) { matAsset = found; matFile = standaloneFile; matContainer = standalone; }
    }
    if (!matAsset) return { content: [{ type: 'text', text: `Material not found: ${materialId}` }] };

    // Build the Output node (always present)
    const outputNode = {
      id: 'output_' + shaderNodeUid(),
      type: 'Output', x: 600, y: 200, w: 180, h: 200,
      inputs: ['Base Color', 'Normal', 'Roughness', 'Metalness', 'Emissive', 'Opacity'],
      outputs: [],
      data: {},
    };
    const graphNodes: any[] = [outputNode];
    const graphConns: any[] = [];
    if (nodes && nodes.length > 0) {
      for (const n of nodes) {
        const nid = shaderNodeUid();
        graphNodes.push({
          id: nid,
          type: n.type,
          x: n.positionX ?? 200,
          y: n.positionY ?? 200,
          w: 150, h: 100,
          data: n.data || {},
        });
      }
    }
    if (connections && connections.length > 0) {
      for (const c of connections) {
        const fromNode = c.fromNodeIndex >= 0 && c.fromNodeIndex < nodes!.length ? graphNodes[c.fromNodeIndex + 1] : null; // +1 because output is at index 0
        const toNode = c.toNodeIndex === -1 ? outputNode : (c.toNodeIndex >= 0 && c.toNodeIndex < nodes!.length ? graphNodes[c.toNodeIndex + 1] : null);
        if (fromNode && toNode) {
          graphConns.push({
            id: shaderNodeUid(),
            fromNode: fromNode.id,
            fromPort: c.fromPort,
            toNode: toNode.id,
            toPort: c.toPort,
          });
        }
      }
    }
    if (!matAsset.materialData) matAsset.materialData = {};
    matAsset.materialData.shaderGraph = { nodes: graphNodes, connections: graphConns };
    if (matFile && matContainer) writeJsonFile(matFile, matContainer);
    return { content: [{ type: 'text', text: `Created shader graph for material "${matAsset.assetName}" (${materialId})\n${graphNodes.length} nodes, ${graphConns.length} connections` }] };
  }
);

// ============================================================
//  §28  LOD & COLLISION GENERATION
// ============================================================

server.tool(
  'generate_lod',
  'Generate LOD (Level of Detail) meshes for a mesh asset to optimize performance.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    meshId: z.string().describe('Mesh asset ID'),
    levels: z.number().optional().describe('Number of LOD levels to generate (2-5). Default: 3'),
    reductionPerLevel: z.number().optional().describe('Vertex reduction factor per level (0.3-0.8). Default: 0.5 (50% reduction each level)'),
  },
  async ({ projectPath, meshId, levels, reductionPerLevel }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const meshDir = path.join(projRoot, 'Meshes');
    if (!fs.existsSync(meshDir)) return { content: [{ type: 'text', text: 'Meshes/ folder not found.' }] };
    for (const f of fs.readdirSync(meshDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
      const fp = path.join(meshDir, f);
      const d = readJsonFile(fp);
      if (d.assetId === meshId || d.meshAssetId === meshId) {
        const numLevels = Math.max(2, Math.min(5, levels ?? 3));
        const reduction = Math.max(0.3, Math.min(0.8, reductionPerLevel ?? 0.5));
        const origVerts = d.vertexCount || d.meshData?.vertexCount || 1000;
        const lodLevels: any[] = [];
        let currentVerts = origVerts;
        for (let i = 0; i < numLevels; i++) {
          currentVerts = Math.round(currentVerts * reduction);
          lodLevels.push({
            level: i + 1,
            targetVertices: currentVerts,
            reductionFactor: Math.pow(reduction, i + 1),
            distance: (i + 1) * 20, // Auto-calculate switching distances
          });
        }
        d.lodConfig = { enabled: true, levels: lodLevels, algorithm: 'QEM' };
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Generated ${numLevels} LOD levels for mesh "${d.assetName || d.meshAssetId}"\nOriginal: ${origVerts} verts\n${lodLevels.map(l => `LOD${l.level}: ~${l.targetVertices} verts (${Math.round(l.reductionFactor * 100)}% reduction) at ${l.distance}m`).join('\n')}` }] };
      }
    }
    return { content: [{ type: 'text', text: `Mesh not found: ${meshId}` }] };
  }
);

server.tool(
  'generate_collision',
  'Generate collision shapes for a mesh asset (box, sphere, capsule, convex hull, or auto-decomposition).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    meshId: z.string().describe('Mesh asset ID'),
    shape: z.enum(['box', 'sphere', 'capsule', 'convex', 'auto']).describe('Collision shape type. "auto" uses convex decomposition for complex meshes'),
    maxConvexHulls: z.number().optional().describe('Max convex hulls for auto-decomposition (1-32). Default: 8'),
  },
  async ({ projectPath, meshId, shape, maxConvexHulls }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const meshDir = path.join(projRoot, 'Meshes');
    if (!fs.existsSync(meshDir)) return { content: [{ type: 'text', text: 'Meshes/ folder not found.' }] };
    for (const f of fs.readdirSync(meshDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
      const fp = path.join(meshDir, f);
      const d = readJsonFile(fp);
      if (d.assetId === meshId || d.meshAssetId === meshId) {
        d.collisionConfig = {
          shape,
          enabled: true,
          ...(shape === 'auto' ? { maxConvexHulls: Math.max(1, Math.min(32, maxConvexHulls ?? 8)), algorithm: 'V-HACD' } : {}),
        };
        writeJsonFile(fp, d);
        return { content: [{ type: 'text', text: `Generated ${shape} collision for mesh "${d.assetName || d.meshAssetId}"${shape === 'auto' ? ` (max ${d.collisionConfig.maxConvexHulls} hulls)` : ''}` }] };
      }
    }
    return { content: [{ type: 'text', text: `Mesh not found: ${meshId}` }] };
  }
);

// ============================================================
//  §29  PROJECT SETTINGS
// ============================================================

server.tool(
  'set_project_settings',
  'Update project-level settings (name, version, active scene, game instance class, etc.).',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().optional().describe('Project display name'),
    version: z.string().optional().describe('Project version string'),
    activeScene: z.string().optional().describe('Active scene name (without .json)'),
    gameInstanceClassId: z.string().optional().describe('Game Instance class actor ID for global state'),
  },
  async ({ projectPath, name, version, activeScene, gameInstanceClassId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const projFile = path.join(projRoot, 'project.json');
    if (!fs.existsSync(projFile)) return { content: [{ type: 'text', text: 'project.json not found' }] };
    const proj = readJsonFile(projFile);
    if (name !== undefined) proj.name = name;
    if (version !== undefined) proj.version = version;
    if (activeScene !== undefined) proj.activeScene = `Scenes/${activeScene}.json`;
    if (gameInstanceClassId !== undefined) proj.gameInstanceClassId = gameInstanceClassId;
    proj.modifiedAt = Date.now();
    writeJsonFile(projFile, proj);
    return { content: [{ type: 'text', text: `Project settings updated:\nName: ${proj.name}\nVersion: ${proj.version || '1.0.0'}\nActive Scene: ${proj.activeScene || 'none'}${proj.gameInstanceClassId ? `\nGame Instance: ${proj.gameInstanceClassId}` : ''}` }] };
  }
);

// ============================================================
//  §30  RUNTIME BRIDGE — Engine Interaction
// ============================================================

server.tool(
  'get_runtime_errors',
  'Get runtime errors and warnings from the engine output log. Requires the engine to be running.',
  {},
  async () => {
    const result = await bridgeRequest('get_runtime_errors', {}, 5000);
    if (!result) return { content: [{ type: 'text', text: 'No response from engine. Is it running?' }] };
    if (result.errors && result.errors.length > 0) {
      return { content: [{ type: 'text', text: `Runtime Errors (${result.errors.length}):\n${result.errors.map((e: any) => `[${e.level || 'ERROR'}] ${e.message}`).join('\n')}` }] };
    }
    return { content: [{ type: 'text', text: 'No runtime errors.' }] };
  }
);

server.tool(
  'get_print_log',
  'Get all Print String output from the running engine, including INFO/WARN/ERROR messages. Useful for debugging blueprint Print String nodes.',
  {
    limit: z.number().optional().describe('Max entries to return (default: 100)'),
    level: z.enum(['ERROR', 'WARN', 'INFO']).optional().describe('Filter by level'),
  },
  async ({ limit, level }: any) => {
    const result = await bridgeRequest('get_print_log', { limit: limit ?? 100, level }, 5000);
    if (!result) return { content: [{ type: 'text', text: 'No response from engine. Is it running?' }] };
    const entries = result.entries || [];
    if (entries.length === 0) return { content: [{ type: 'text', text: 'No print log entries.' }] };
    const lines = entries.map((e: any) => `[${e.level}] ${e.message}`).join('\n');
    return { content: [{ type: 'text', text: `Print Log (${entries.length}/${result.total || '?'}):\n${lines}` }] };
  }
);

server.tool(
  'clear_print_log',
  'Clear all accumulated print log entries in the running engine.',
  {},
  async () => {
    const result = await bridgeRequest('clear_print_log', {}, 5000);
    if (!result) return { content: [{ type: 'text', text: 'No response from engine.' }] };
    return { content: [{ type: 'text', text: result.message || 'Log cleared' }] };
  }
);

server.tool(
  'reload_project',
  'Force the engine to reload all assets from disk. Use after making changes via MCP tools.',
  {},
  async () => {
    const result = await bridgeRequest('reload_project', {}, 15000);
    if (!result) return { content: [{ type: 'text', text: 'Reload request sent but no response from engine.' }] };
    if (result.error) return { content: [{ type: 'text', text: `Reload failed: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Project reloaded successfully. ${result.message || ''}` }] };
  }
);

server.tool(
  'focus_viewport_on',
  'Move the editor viewport camera to focus on a specific position or object.',
  {
    x: z.number().optional().describe('World X position'),
    y: z.number().optional().describe('World Y position'),
    z: z.number().optional().describe('World Z position'),
    objectName: z.string().optional().describe('Name of a scene object to focus on (alternative to X/Y/Z)'),
  },
  async ({ x, y, z: zPos, objectName }) => {
    const payload: Record<string, unknown> = {};
    if (objectName) payload.objectName = objectName;
    else { payload.x = x ?? 0; payload.y = y ?? 0; payload.z = zPos ?? 0; }
    const result = await bridgeRequest('focus_viewport', payload, 5000);
    if (!result) return { content: [{ type: 'text', text: 'No response from engine.' }] };
    if (result.error) return { content: [{ type: 'text', text: `Focus failed: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Viewport focused${objectName ? ` on "${objectName}"` : ` on (${x ?? 0}, ${y ?? 0}, ${zPos ?? 0})`}` }] };
  }
);

server.tool(
  'select_object',
  'Select a game object in the editor (updates properties panel and viewport highlight).',
  {
    objectName: z.string().describe('Name of the object to select in the current scene'),
  },
  async ({ objectName }) => {
    const result = await bridgeRequest('select_object', { objectName }, 5000);
    if (!result) return { content: [{ type: 'text', text: 'No response from engine.' }] };
    if (result.error) return { content: [{ type: 'text', text: `Selection failed: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Selected "${objectName}"` }] };
  }
);

server.tool(
  'get_game_object_state',
  'Query a live game object\'s position, variable values, and component state during play mode.',
  {
    objectName: z.string().describe('Name of the game object to inspect'),
  },
  async ({ objectName }) => {
    const result = await bridgeRequest('get_object_state', { objectName }, 5000);
    if (!result) return { content: [{ type: 'text', text: 'No response from engine. Is it running and in play mode?' }] };
    if (result.error) return { content: [{ type: 'text', text: `Query failed: ${result.error}` }] };
    let text = `Object: ${objectName}\n`;
    if (result.position) text += `Position: (${result.position.x}, ${result.position.y}, ${result.position.z})\n`;
    if (result.rotation) text += `Rotation: (${result.rotation.x}, ${result.rotation.y}, ${result.rotation.z})\n`;
    if (result.scale) text += `Scale: (${result.scale.x}, ${result.scale.y}, ${result.scale.z})\n`;
    if (result.variables) text += `Variables: ${JSON.stringify(result.variables, null, 2)}\n`;
    if (result.components) text += `Components: ${JSON.stringify(result.components, null, 2)}\n`;
    return { content: [{ type: 'text', text }] };
  }
);

// ============================================================
//  §31  EXPORT / BUILD
// ============================================================

server.tool(
  'export_game',
  'Trigger a game export/build. Requires the engine to be running.',
  {
    platform: z.enum(['web', 'desktop', 'electron']).optional().describe('Target platform. Default: "web"'),
    outputPath: z.string().optional().describe('Output directory path'),
  },
  async ({ platform, outputPath }) => {
    const result = await bridgeRequest('export_game', { platform: platform ?? 'web', outputPath }, 60000);
    if (!result) return { content: [{ type: 'text', text: 'Export request sent but no response from engine. Is it running?' }] };
    if (result.error) return { content: [{ type: 'text', text: `Export failed: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Game exported successfully to ${result.outputPath || 'default location'}.\nPlatform: ${platform ?? 'web'}\n${result.message || ''}` }] };
  }
);

server.tool(
  'get_build_status',
  'Check the current build/export progress.',
  {},
  async () => {
    const result = await bridgeRequest('get_build_status', {}, 5000);
    if (!result) return { content: [{ type: 'text', text: 'No response from engine.' }] };
    return { content: [{ type: 'text', text: `Build status: ${result.status || 'unknown'}${result.progress !== undefined ? ` (${result.progress}%)` : ''}${result.message ? `\n${result.message}` : ''}` }] };
  }
);

// ============================================================
//  §32  ADD PARTICLE COMPONENT TO ACTOR  
// ============================================================

server.tool(
  'add_particle_component',
  'Add a ParticleEmitter component to an actor referencing a particle asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('Actor asset ID'),
    particleId: z.string().describe('Particle emitter asset ID'),
    name: z.string().optional().describe('Component name. Default: "ParticleEmitter"'),
    offsetX: z.number().optional().describe('Local offset X'),
    offsetY: z.number().optional().describe('Local offset Y'),
    offsetZ: z.number().optional().describe('Local offset Z'),
    autoPlay: z.boolean().optional().describe('Auto-play on spawn. Default: true'),
  },
  async ({ projectPath, actorId, particleId, name, offsetX, offsetY, offsetZ, autoPlay }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    if (!actor.components) actor.components = [];
    const cid = compUid();
    actor.components.push({
      id: cid, type: 'ParticleEmitterComponent', name: name ?? 'ParticleEmitter',
      particleAssetId: particleId,
      offset: { x: offsetX ?? 0, y: offsetY ?? 0, z: offsetZ ?? 0 },
      autoPlay: autoPlay ?? true,
    });
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Added ParticleEmitterComponent [${cid}] to actor "${actor.actorName}" referencing particle "${particleId}"` }] };
  }
);

// ============================================================
//  §33  ADD SOUND COMPONENT TO ACTOR
// ============================================================

server.tool(
  'add_sound_component',
  'Add an AudioSource component to an actor for playing sounds.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    actorId: z.string().describe('Actor asset ID'),
    soundId: z.string().optional().describe('Sound asset ID to assign'),
    soundCueId: z.string().optional().describe('Sound Cue asset ID to assign (alternative to soundId)'),
    name: z.string().optional().describe('Component name. Default: "AudioSource"'),
    spatial: z.boolean().optional().describe('3D spatial audio. Default: false'),
    autoPlay: z.boolean().optional().describe('Auto-play on spawn. Default: false'),
    volume: z.number().optional().describe('Volume override 0-1'),
    maxDistance: z.number().optional().describe('Max hearing distance for spatial audio. Default: 50'),
  },
  async ({ projectPath, actorId, soundId, soundCueId, name, spatial, autoPlay, volume, maxDistance }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const actorsDir = path.join(projRoot, 'Actors');
    const { filePath, data: actor } = findActorFile(actorsDir, actorId);
    if (!filePath || !actor) return { content: [{ type: 'text', text: `Actor not found: ${actorId}` }] };
    if (!actor.components) actor.components = [];
    const cid = compUid();
    const comp: any = {
      id: cid, type: 'AudioSourceComponent', name: name ?? 'AudioSource',
      spatial: spatial ?? false,
      autoPlay: autoPlay ?? false,
    };
    if (soundId) comp.soundAssetId = soundId;
    if (soundCueId) comp.soundCueId = soundCueId;
    if (volume !== undefined) comp.volume = volume;
    if (maxDistance !== undefined) comp.maxDistance = maxDistance;
    actor.components.push(comp);
    writeJsonFile(filePath, actor);
    return { content: [{ type: 'text', text: `Added AudioSourceComponent [${cid}] to actor "${actor.actorName}"${soundId ? ` (sound: ${soundId})` : ''}${soundCueId ? ` (cue: ${soundCueId})` : ''}` }] };
  }
);

// ════════════════════════════════════════════════════════════
//  §34  BLUEPRINT GRAPH MANIPULATION
//  Full programmatic control over blueprint event graphs:
//  add/remove nodes, connect/disconnect pins, read graphs,
//  set control values, and recompile.
// ════════════════════════════════════════════════════════════

// ── Helper: Resolve an asset and its graph by assetType + assetId ──
function resolveAssetGraph(
  projRoot: string,
  assetType: string,
  assetId: string,
  graphTarget?: string,
): { filePath: string; asset: any; graph: any; graphKey: string; error?: string } {
  let filePath: string | null = null;
  let asset: any = null;
  let graphKey = 'eventGraphData';

  if (assetType === 'actor') {
    const actorsDir = path.join(projRoot, 'Actors');
    const result = findActorFile(actorsDir, assetId);
    filePath = result.filePath;
    asset = result.data;
    if (graphTarget && graphTarget !== 'eventGraph') {
      graphKey = 'functionGraphData';
    }
  } else if (assetType === 'widget') {
    const dir = path.join(projRoot, 'Widgets');
    const result = findAssetFile(dir, 'id', assetId);
    filePath = result.filePath;
    asset = result.data;
    graphKey = 'eventGraph';
    if (asset?.eventGraph?.nodeData) {
      // Widget stores graph as eventGraph.nodeData
    }
  } else if (assetType === 'animBlueprint') {
    const dir = path.join(projRoot, 'AnimBlueprints');
    const result = findAbpFile(dir, assetId);
    filePath = result.filePath;
    asset = result.data;
    graphKey = 'eventGraphData';
  } else if (assetType === 'gameInstance') {
    const dir = path.join(projRoot, 'GameInstances');
    const result = findAssetFile(dir, 'id', assetId);
    filePath = result.filePath;
    asset = result.data;
    graphKey = 'eventGraphData';
  }

  if (!filePath || !asset) {
    return { filePath: '', asset: null, graph: null, graphKey, error: `Asset not found: ${assetType}/${assetId}` };
  }

  // Resolve the graph data
  let graph: any;
  if (assetType === 'widget') {
    graph = asset.eventGraph?.nodeData || { nodes: [], connections: [] };
  } else if (graphTarget && graphTarget !== 'eventGraph' && assetType === 'actor') {
    // Function graph
    const funcGraphs = asset.functionGraphData || {};
    graph = funcGraphs[graphTarget] || { nodes: [], connections: [] };
  } else {
    graph = asset[graphKey] || { nodes: [], connections: [] };
  }

  if (!graph.nodes) graph.nodes = [];
  if (!graph.connections) graph.connections = [];

  return { filePath, asset, graph, graphKey };
}

// ── Helper: Write back graph data to asset ──
function writeGraphBack(
  filePath: string,
  asset: any,
  assetType: string,
  graphKey: string,
  graph: any,
  graphTarget?: string,
): void {
  if (assetType === 'widget') {
    if (!asset.eventGraph) asset.eventGraph = {};
    asset.eventGraph.nodeData = graph;
  } else if (graphTarget && graphTarget !== 'eventGraph' && assetType === 'actor') {
    if (!asset.functionGraphData) asset.functionGraphData = {};
    asset.functionGraphData[graphTarget] = graph;
  } else {
    asset[graphKey] = graph;
  }
  asset.modifiedAt = Date.now();
  writeJsonFile(filePath, asset);
}

// ── Helper: Generate a Rete-compatible node ID ──
function graphNodeId(): string {
  return 'n_' + Date.now().toString(36) + '_' + (++_uid).toString(36);
}
function graphConnId(): string {
  return 'c_' + Date.now().toString(36) + '_' + (++_uid).toString(36);
}

// ────────────────────────────────────────────────────────────
//  get_blueprint_graph — Read the full graph (nodes + connections)
// ────────────────────────────────────────────────────────────
server.tool(
  'get_blueprint_graph',
  'Read the full blueprint event graph (nodes + connections) of an actor, widget, animBlueprint, or gameInstance. Returns all nodes with their types, positions, controls, and all connections between them.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    graphTarget: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID to read that function\'s graph'),
  },
  async ({ projectPath, assetType, assetId, graphTarget }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { graph, error } = resolveAssetGraph(projRoot, assetType, assetId, graphTarget);
    if (error) return { content: [{ type: 'text', text: error }] };
    return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
  }
);

// ────────────────────────────────────────────────────────────
//  add_blueprint_node — Add one or more nodes to a graph
// ────────────────────────────────────────────────────────────
server.tool(
  'add_blueprint_node',
  `Add one or more nodes to a blueprint event graph. Each node needs a type string and optional position/data.

Common node types (246 total):
  Events: EventBeginPlayNode, EventTickNode, EventOnDestroyNode, CustomEventNode, InputKeyEventNode
  Math: MathAddNode, MathSubtractNode, MathMultiplyNode, MathDivideNode, ClampNode, LerpNode, GreaterThanNode, AbsNode
  Values: FloatNode, BooleanNode, StringLiteralNode, Vector3LiteralNode, ColorNode, TimeNode, DeltaTimeNode
  Variables: GetVariableNode, SetVariableNode (need varId, varName, varType in data)
  Flow: BranchNode, SequenceNode, ForLoopNode, DelayNode
  Utility: PrintStringNode
  Transform: SetPositionNode, GetPositionNode, SetRotationNode, GetRotationNode, SetScaleNode, GetScaleNode
  Physics: AddForceNode, AddImpulseNode, SetVelocityNode
  Collision: OnTriggerBeginOverlapNode, OnActorBeginOverlapNode, OnCollisionHitNode
  UI: CreateWidgetNode, AddToViewportNode, SetWidgetTextNode, SetProgressBarPercentNode
  Casting: GetSelfReferenceNode, GetActorByNameNode, GetActorVariableNode, SetActorVariableNode, CastToNode
  Character: AddMovementInputNode, JumpNode, SetMaxWalkSpeedNode
  Spawning: SpawnActorFromClassNode

Node data fields vary by type:
  - FloatNode: { controls: { value: 42 } }
  - GetVariableNode/SetVariableNode: { varId, varName, varType }
  - InputKeyEventNode: { selectedKey: 'Space' }
  - CastToNode: { targetClassId, targetClassName }
  - GetActorVariableNode: { varName, varType, targetActorId }
  - CreateWidgetNode: { widgetBPId, widgetBPName }
  - CustomEventNode: { eventId, eventName, eventParams: [{name,type}] }
  - Component nodes: { compName, compIndex }
  - StringLiteralNode: { controls: { value: 'hello' } }
  - PrintStringNode: { controls: { text: 'Debug message' } }`,
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    graphTarget: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
    nodes: z.array(z.object({
      type: z.string().describe('Node type string (e.g. "EventBeginPlayNode", "FloatNode", "MathAddNode")'),
      position: z.object({
        x: z.number(),
        y: z.number(),
      }).optional().describe('Position in the graph editor canvas (default: {x:0, y:0})'),
      data: z.record(z.any()).optional().describe('Node-specific data (controls, varId, selectedKey, etc.)'),
      id: z.string().optional().describe('Custom node ID (auto-generated if omitted)'),
    })).describe('Array of nodes to add'),
  },
  async ({ projectPath, assetType, assetId, graphTarget, nodes }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, graph, graphKey, error } = resolveAssetGraph(projRoot, assetType, assetId, graphTarget);
    if (error) return { content: [{ type: 'text', text: error }] };

    const addedIds: string[] = [];
    for (const n of nodes) {
      const id = n.id || graphNodeId();
      graph.nodes.push({
        id,
        type: n.type,
        position: n.position || { x: 0, y: 0 },
        data: n.data || {},
      });
      addedIds.push(id);
    }

    writeGraphBack(filePath, asset, assetType, graphKey, graph, graphTarget);
    return { content: [{ type: 'text', text: `Added ${addedIds.length} node(s): ${addedIds.join(', ')}` }] };
  }
);

// ────────────────────────────────────────────────────────────
//  remove_blueprint_node — Remove nodes from a graph
// ────────────────────────────────────────────────────────────
server.tool(
  'remove_blueprint_node',
  'Remove one or more nodes from a blueprint graph by ID. Also removes all connections involving the removed nodes.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    graphTarget: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
    nodeIds: z.array(z.string()).describe('Array of node IDs to remove'),
  },
  async ({ projectPath, assetType, assetId, graphTarget, nodeIds }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, graph, graphKey, error } = resolveAssetGraph(projRoot, assetType, assetId, graphTarget);
    if (error) return { content: [{ type: 'text', text: error }] };

    const idSet = new Set(nodeIds);
    const beforeNodes = graph.nodes.length;
    const beforeConns = graph.connections.length;
    graph.nodes = graph.nodes.filter((n: any) => !idSet.has(n.id));
    graph.connections = graph.connections.filter((c: any) => !idSet.has(c.source) && !idSet.has(c.target));
    const removedNodes = beforeNodes - graph.nodes.length;
    const removedConns = beforeConns - graph.connections.length;

    writeGraphBack(filePath, asset, assetType, graphKey, graph, graphTarget);
    return { content: [{ type: 'text', text: `Removed ${removedNodes} node(s) and ${removedConns} connection(s)` }] };
  }
);

// ────────────────────────────────────────────────────────────
//  connect_blueprint_nodes — Connect two node pins
// ────────────────────────────────────────────────────────────
server.tool(
  'connect_blueprint_nodes',
  `Connect output pins to input pins between nodes. Creates one or more wired connections in the blueprint graph.

Common pin names:
  Execution: "exec" (both input and output for flow)
  Values: "value", "result", "a", "b"
  Math outputs: "result"
  Variable Get: "value" (or "x","y","z" for Vector3)
  Variable Set: input "value", output "value" + "exec"
  Branch: input "condition", outputs "true","false"
  ForLoop: inputs "firstIndex","lastIndex", outputs "loopBody","index","completed"
  GetPosition: outputs "x","y","z"
  SetPosition: inputs "x","y","z"
  Overlap events: outputs "exec","otherActor","otherActorName","otherActorId"
  PrintString: input "exec","text"
  CreateWidget: input "exec","owner", output "exec","widget"
  SetProgressBarPercent: input "exec","percent"
  CastTo: input "exec","object", output "exec","castFailed","asType"
  GetActorVariable: input "target", output "value"
  SetActorVariable: input "exec","target","value", output "exec"`,
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    graphTarget: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
    connections: z.array(z.object({
      sourceNodeId: z.string().describe('ID of the source node'),
      sourcePin: z.string().describe('Output pin name on the source node (e.g. "exec", "value", "result")'),
      targetNodeId: z.string().describe('ID of the target node'),
      targetPin: z.string().describe('Input pin name on the target node (e.g. "exec", "a", "value")'),
    })).describe('Array of connections to create'),
  },
  async ({ projectPath, assetType, assetId, graphTarget, connections }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, graph, graphKey, error } = resolveAssetGraph(projRoot, assetType, assetId, graphTarget);
    if (error) return { content: [{ type: 'text', text: error }] };

    const nodeIds = new Set(graph.nodes.map((n: any) => n.id));
    const added: string[] = [];
    const errors: string[] = [];

    for (const c of connections) {
      if (!nodeIds.has(c.sourceNodeId)) {
        errors.push(`Source node not found: ${c.sourceNodeId}`);
        continue;
      }
      if (!nodeIds.has(c.targetNodeId)) {
        errors.push(`Target node not found: ${c.targetNodeId}`);
        continue;
      }
      const id = graphConnId();
      graph.connections.push({
        id,
        source: c.sourceNodeId,
        sourceOutput: c.sourcePin,
        target: c.targetNodeId,
        targetInput: c.targetPin,
      });
      added.push(id);
    }

    writeGraphBack(filePath, asset, assetType, graphKey, graph, graphTarget);
    let msg = `Created ${added.length} connection(s)`;
    if (errors.length > 0) msg += `\nErrors: ${errors.join('; ')}`;
    return { content: [{ type: 'text', text: msg }] };
  }
);

// ────────────────────────────────────────────────────────────
//  disconnect_blueprint_nodes — Remove connections
// ────────────────────────────────────────────────────────────
server.tool(
  'disconnect_blueprint_nodes',
  'Remove connections from a blueprint graph by connection ID, or disconnect all connections on specific pins.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    graphTarget: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
    connectionIds: z.array(z.string()).optional().describe('Specific connection IDs to remove'),
    nodeId: z.string().optional().describe('Remove all connections on this node'),
    pin: z.string().optional().describe('If nodeId is set, only disconnect this specific pin'),
  },
  async ({ projectPath, assetType, assetId, graphTarget, connectionIds, nodeId, pin }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, graph, graphKey, error } = resolveAssetGraph(projRoot, assetType, assetId, graphTarget);
    if (error) return { content: [{ type: 'text', text: error }] };

    const before = graph.connections.length;

    if (connectionIds && connectionIds.length > 0) {
      const idSet = new Set(connectionIds);
      graph.connections = graph.connections.filter((c: any) => !idSet.has(c.id));
    } else if (nodeId) {
      graph.connections = graph.connections.filter((c: any) => {
        if (pin) {
          return !((c.source === nodeId && c.sourceOutput === pin) || (c.target === nodeId && c.targetInput === pin));
        }
        return c.source !== nodeId && c.target !== nodeId;
      });
    }

    const removed = before - graph.connections.length;
    writeGraphBack(filePath, asset, assetType, graphKey, graph, graphTarget);
    return { content: [{ type: 'text', text: `Removed ${removed} connection(s)` }] };
  }
);

// ────────────────────────────────────────────────────────────
//  move_blueprint_node — Reposition nodes in the graph
// ────────────────────────────────────────────────────────────
server.tool(
  'move_blueprint_node',
  'Move/reposition one or more nodes in the blueprint graph canvas. Useful for organizing node layout.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    graphTarget: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
    moves: z.array(z.object({
      nodeId: z.string().describe('Node ID to move'),
      x: z.number().describe('New X position'),
      y: z.number().describe('New Y position'),
    })).describe('Array of node repositions'),
  },
  async ({ projectPath, assetType, assetId, graphTarget, moves }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, graph, graphKey, error } = resolveAssetGraph(projRoot, assetType, assetId, graphTarget);
    if (error) return { content: [{ type: 'text', text: error }] };

    const nodeMap = new Map<string, any>();
    for (const n of graph.nodes) nodeMap.set(n.id, n);
    let moved = 0;
    for (const m of moves) {
      const node = nodeMap.get(m.nodeId);
      if (node) { node.position = { x: m.x, y: m.y }; moved++; }
    }

    writeGraphBack(filePath, asset, assetType, graphKey, graph, graphTarget);
    return { content: [{ type: 'text', text: `Moved ${moved} node(s)` }] };
  }
);

// ────────────────────────────────────────────────────────────
//  set_node_value — Set control values on a node
// ────────────────────────────────────────────────────────────
server.tool(
  'set_node_value',
  `Set control/data values on an existing blueprint node. For example, change a FloatNode's value, a PrintStringNode's text, or a variable node's varId.

Examples:
  FloatNode: { controls: { value: 42 } }
  StringLiteralNode: { controls: { value: "hello" } }
  PrintStringNode: { controls: { text: "Debug" } }
  BooleanNode: { controls: { value: true } }
  Vector3LiteralNode: { controls: { x: 1, y: 2, z: 3 } }
  GetVariableNode: { varId: "var_Health_xxx", varName: "Health", varType: "Float" }
  InputKeyEventNode: { selectedKey: "Space" }`,
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    graphTarget: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
    nodeId: z.string().describe('Node ID to modify'),
    data: z.record(z.any()).describe('Data fields to merge into the node (e.g. { controls: { value: 42 } })'),
  },
  async ({ projectPath, assetType, assetId, graphTarget, nodeId, data }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, graph, graphKey, error } = resolveAssetGraph(projRoot, assetType, assetId, graphTarget);
    if (error) return { content: [{ type: 'text', text: error }] };

    const node = graph.nodes.find((n: any) => n.id === nodeId);
    if (!node) return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }] };

    // Deep merge data into node.data
    if (!node.data) node.data = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'controls' && typeof v === 'object' && v !== null) {
        if (!node.data.controls) node.data.controls = {};
        Object.assign(node.data.controls, v);
      } else {
        node.data[k] = v;
      }
    }

    writeGraphBack(filePath, asset, assetType, graphKey, graph, graphTarget);
    return { content: [{ type: 'text', text: `Updated node ${nodeId} data` }] };
  }
);

// ────────────────────────────────────────────────────────────
//  clear_blueprint_graph — Remove all nodes and connections
// ────────────────────────────────────────────────────────────
server.tool(
  'clear_blueprint_graph',
  'Clear all nodes and connections from a blueprint graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    graphTarget: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
  },
  async ({ projectPath, assetType, assetId, graphTarget }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, graph, graphKey, error } = resolveAssetGraph(projRoot, assetType, assetId, graphTarget);
    if (error) return { content: [{ type: 'text', text: error }] };

    const nodeCount = graph.nodes.length;
    const connCount = graph.connections.length;
    graph.nodes = [];
    graph.connections = [];

    writeGraphBack(filePath, asset, assetType, graphKey, graph, graphTarget);
    return { content: [{ type: 'text', text: `Cleared ${nodeCount} nodes and ${connCount} connections` }] };
  }
);

// ────────────────────────────────────────────────────────────
//  list_node_types — List all available blueprint node types
// ────────────────────────────────────────────────────────────
server.tool(
  'list_node_types',
  'List all available blueprint node type strings grouped by category. Use these type strings with add_blueprint_node. Optionally filter by category name. When the editor is running, returns the live node registry; otherwise falls back to a static list.',
  {
    category: z.string().optional().describe('Filter to a specific category (e.g. "Math", "Events", "UI", "Collision")'),
  },
  async ({ category }: any) => {
    // Try live bridge first — this auto-discovers new nodes
    let allTypes: Record<string, string[]> | null = null;
    const resp = await bridgeRequest('list_node_types', {}, 5000);
    if (resp && resp.nodeTypes && typeof resp.nodeTypes === 'object' && Object.keys(resp.nodeTypes).length > 0) {
      allTypes = resp.nodeTypes as Record<string, string[]>;
    }

    // Fallback: static list (used when editor is not running)
    if (!allTypes) {
      allTypes = {
      'Events': ['EventBeginPlayNode', 'EventTickNode', 'EventOnDestroyNode', 'CustomEventNode', 'CallCustomEventNode', 'InputKeyEventNode', 'IsKeyDownNode', 'InputAxisNode'],
      'Variables': ['GetVariableNode', 'SetVariableNode'],
      'Structs': ['MakeStructNode', 'BreakStructNode'],
      'Functions': ['FunctionEntryNode', 'FunctionReturnNode', 'FunctionCallNode'],
      'Macros': ['MacroEntryNode', 'MacroExitNode', 'MacroCallNode'],
      'Math': ['MathAddNode', 'MathSubtractNode', 'MathMultiplyNode', 'MathDivideNode', 'SineNode', 'CosineNode', 'AbsNode', 'ClampNode', 'LerpNode', 'GreaterThanNode'],
      'Values': ['FloatNode', 'BooleanNode', 'StringLiteralNode', 'Vector3LiteralNode', 'ColorNode', 'TimeNode', 'DeltaTimeNode'],
      'Transform': ['SetPositionNode', 'GetPositionNode', 'SetRotationNode', 'GetRotationNode', 'SetScaleNode', 'GetScaleNode'],
      'Flow Control': ['BranchNode', 'SequenceNode', 'ForLoopNode', 'DelayNode'],
      'Utility': ['PrintStringNode'],
      'Physics': ['AddForceNode', 'AddImpulseNode', 'SetVelocityNode', 'GetMassNode', 'SetMassNode', 'GetVelocityNode', 'GetAngularVelocityNode', 'SetLinearVelocityNode', 'SetAngularVelocityNode', 'IsSimulatingPhysicsNode', 'SetSimulatePhysicsNode', 'IsGravityEnabledNode', 'SetGravityEnabledNode', 'GetGravityScaleNode', 'SetGravityScaleNode', 'SetLinearDampingNode', 'SetAngularDampingNode', 'SetPhysicsMaterialNode', 'GetPhysicsMaterialNode', 'AddTorqueNode', 'AddForceAtLocationNode', 'AddImpulseAtLocationNode', 'SetConstraintNode'],
      'Physics Events': ['OnComponentHitNode', 'OnComponentBeginOverlapNode', 'OnComponentEndOverlapNode', 'OnComponentWakeNode', 'OnComponentSleepNode'],
      'Components': ['GetComponentLocationNode', 'SetComponentLocationNode', 'GetComponentRotationNode', 'SetComponentRotationNode', 'GetComponentScaleNode', 'SetComponentScaleNode', 'SetComponentVisibilityNode', 'SetStaticMeshNode', 'SetMeshMaterialNode', 'GetMeshMaterialNode'],
      'Lights': ['SetLightEnabledNode', 'GetLightEnabledNode', 'SetLightColorNode', 'GetLightColorNode', 'SetLightIntensityNode', 'GetLightIntensityNode', 'SetLightDistanceNode', 'SetLightPositionNode', 'GetLightPositionNode', 'SetLightTargetNode', 'SetCastShadowNode', 'SetSpotAngleNode', 'SetSpotPenumbraNode'],
      'Conversions': ['BoolToNumberNode', 'NumberToBoolNode', 'BoolToStringNode', 'StringToBoolNode', 'NumberToStringNode', 'StringToNumberNode', 'ColorToStringNode', 'StringToColorNode'],
      'Collision': ['OnTriggerBeginOverlapNode', 'OnTriggerEndOverlapNode', 'OnActorBeginOverlapNode', 'OnActorEndOverlapNode', 'OnCollisionHitNode', 'IsOverlappingActorNode', 'GetOverlapCountNode', 'SetCollisionEnabledNode'],
      'Trigger Components': ['OnTriggerComponentBeginOverlapNode', 'OnTriggerComponentEndOverlapNode', 'SetTriggerEnabledNode', 'GetTriggerEnabledNode', 'SetTriggerSizeNode', 'GetTriggerOverlapCountNode', 'IsTriggerOverlappingNode', 'GetTriggerShapeNode'],
      'Character': ['AddMovementInputNode', 'JumpNode', 'StopJumpingNode', 'CrouchNode', 'UncrouchNode', 'SetMovementModeNode', 'SetMaxWalkSpeedNode', 'LaunchCharacterNode', 'SetCameraModeNode', 'SetCameraFOVNode', 'AddControllerYawInputNode', 'AddControllerPitchInputNode', 'GetControllerRotationNode', 'SetControllerRotationNode', 'SetMouseLockEnabledNode', 'GetMouseLockStatusNode', 'GetPlayerControllerNode', 'SetShowMouseCursorNode', 'IsMouseCursorVisibleNode', 'SetInputModeGameOnlyNode', 'SetInputModeGameAndUINode', 'SetInputModeUIOnlyNode', 'GetCharacterVelocityNode', 'GetMovementSpeedNode', 'IsGroundedNode', 'IsJumpingNode', 'IsCrouchingNode', 'IsFallingNode', 'IsFlyingNode', 'IsSwimmingNode', 'StartFlyingNode', 'StopFlyingNode', 'StartSwimmingNode', 'StopSwimmingNode', 'IsMovingNode', 'GetMovementModeNode', 'GetCameraLocationNode'],
      'Camera': ['SetSpringArmLengthNode', 'SetSpringArmTargetOffsetNode', 'SetSpringArmSocketOffsetNode', 'SetSpringArmCollisionNode', 'SetCameraCollisionEnabledNode', 'SetCameraLagNode', 'SetCameraRotationLagNode', 'GetSpringArmLengthNode', 'GetSpringArmTargetOffsetNode', 'GetSpringArmSocketOffsetNode', 'CameraModeLiteralNode', 'MovementModeLiteralNode', 'GetCameraRotationNode'],
      'Player Controller': ['PossessPawnNode', 'UnpossessPawnNode', 'GetControlledPawnNode', 'IsPossessingNode'],
      'AI': ['AIMoveToNode', 'AIStopMovementNode', 'AISetFocalPointNode', 'AIClearFocalPointNode', 'AIStartPatrolNode', 'AIStopPatrolNode', 'AIStartFollowingNode', 'AIStopFollowingNode', 'GetAIStateNode', 'AIHasReachedTargetNode', 'AIGetDistanceToTargetNode', 'GetControllerNode', 'GetControllerTypeNode', 'GetPawnNode', 'IsPlayerControlledNode', 'IsAIControlledNode'],
      'Casting': ['CastToNode', 'PureCastNode', 'GetSelfReferenceNode', 'GetPlayerPawnNode', 'GetActorByNameNode', 'GetAllActorsOfClassNode', 'IsValidNode', 'GetActorNameNode', 'GetActorVariableNode', 'SetActorVariableNode', 'GetOwnerNode', 'GetAnimInstanceNode', 'CallActorFunctionNode'],
      'Animation': ['AnimUpdateEventNode', 'TryGetPawnOwnerNode', 'SetAnimVarNode', 'GetAnimVarNode'],
      'UI': ['CreateWidgetNode', 'AddToViewportNode', 'RemoveFromViewportNode', 'SetWidgetTextNode', 'GetWidgetTextNode', 'SetWidgetVisibilityNode', 'SetWidgetColorNode', 'SetWidgetOpacityNode', 'SetProgressBarPercentNode', 'GetProgressBarPercentNode', 'SetSliderValueNode', 'GetSliderValueNode', 'SetCheckBoxStateNode', 'GetCheckBoxStateNode', 'IsWidgetVisibleNode', 'PlayWidgetAnimationNode', 'SetInputModeNode', 'ShowMouseCursorNode'],
      'Widget Interaction': ['GetWidgetVariableNode', 'SetWidgetVariableNode', 'CallWidgetFunctionNode', 'CallWidgetEventNode'],
      'Widget Events': ['ButtonOnClickedNode', 'ButtonOnPressedNode', 'ButtonOnReleasedNode', 'ButtonOnHoveredNode', 'ButtonOnUnhoveredNode', 'TextBoxOnTextChangedNode', 'TextBoxOnTextCommittedNode', 'SliderOnValueChangedNode', 'CheckBoxOnCheckStateChangedNode'],
      'Scene': ['OpenSceneNode', 'LoadSceneNode', 'GetGameInstanceNode', 'GetGameInstanceVariableNode', 'SetGameInstanceVariableNode'],
      'Spawning': ['SpawnActorFromClassNode'],
      'DataTable': ['GetDataTableRowNode', 'GetDataTableRowPureNode', 'GetAllDataTableRowsNode', 'GetDataTableRowNamesNode', 'DoesDataTableRowExistNode', 'GetDataTableRowCountNode', 'FindRowsByPredicateNode', 'ForEachDataTableRowNode', 'MakeDataTableRowHandleNode', 'ResolveDataTableRowHandleNode', 'IsDataTableRowHandleValidNode', 'AddDataTableRowNode', 'RemoveDataTableRowNode', 'UpdateDataTableRowNode'],
      'Character 2D': ['AddMovementInput2DNode', 'Jump2DNode', 'StopJump2DNode', 'LaunchCharacter2DNode', 'SetMaxWalkSpeed2DNode', 'GetMaxWalkSpeed2DNode', 'IsGrounded2DNode', 'IsJumping2DNode', 'IsFalling2DNode', 'GetCharacterVelocity2DNode', 'AddCharacterImpulse2DNode', 'StopMovement2DNode', 'SetJumpHeight2DNode', 'SetMaxJumps2DNode', 'GetJumpsRemaining2DNode', 'SetGravityMultiplier2DNode', 'FlipSpriteDirection2DNode', 'SetAirControl2DNode', 'GetSpriteFacingDirection2DNode', 'GetCharacterSpeed2DNode'],
      };
    }

    let source = resp?.nodeTypes ? '(live from engine)' : '(static fallback — editor not connected)';

    if (category) {
      const key = Object.keys(allTypes).find(k => k.toLowerCase() === category.toLowerCase());
      if (!key) return { content: [{ type: 'text', text: `Category "${category}" not found. Available: ${Object.keys(allTypes).join(', ')}` }] };
      return { content: [{ type: 'text', text: `${source}\n` + JSON.stringify({ [key]: allTypes[key] }, null, 2) }] };
    }
    return { content: [{ type: 'text', text: `${source}\n` + JSON.stringify(allTypes, null, 2) }] };
  }
);

// ────────────────────────────────────────────────────────────
//  compile_blueprint — Trigger recompilation of blueprint code
//  via bridge request to the live editor
// ────────────────────────────────────────────────────────────
server.tool(
  'compile_blueprint',
  'Trigger recompilation of a blueprint graph in the live editor. The editor will re-read the asset JSON, rebuild the Rete graph, and regenerate the compiled JavaScript code. Requires the editor to be running and the asset to be open.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
  },
  async ({ projectPath, assetType, assetId }: any) => {
    const result = await bridgeRequest('compile_blueprint', { assetType, assetId });
    if (!result) return { content: [{ type: 'text', text: 'Bridge not connected or editor not running. The graph data has been saved — open the actor in the editor to compile.' }] };
    if (result.error) return { content: [{ type: 'text', text: `Compile error: ${result.error}` }] };
    return { content: [{ type: 'text', text: result.message || 'Blueprint compiled successfully' }] };
  }
);

// ════════════════════════════════════════════════════════════
//  §35  BLUEPRINT VARIABLE MANAGEMENT (via graph tools)
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
//  list_blueprint_variables — Read all variables on an asset
// ────────────────────────────────────────────────────────────
server.tool(
  'list_blueprint_variables',
  'List all blueprint variables defined on an actor, widget, animBlueprint, or gameInstance asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
  },
  async ({ projectPath, assetType, assetId }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { asset, error } = resolveAssetGraph(projRoot, assetType, assetId);
    if (error) return { content: [{ type: 'text', text: error }] };
    const vars = asset.variables || [];
    if (vars.length === 0) return { content: [{ type: 'text', text: 'No variables defined on this asset' }] };
    const list = vars.map((v: any) => `• ${v.name} (${v.type}) = ${JSON.stringify(v.defaultValue)} [id: ${v.id}]${v.exposeOnSpawn ? ' [exposed]' : ''}${v.instanceEditable ? ' [editable]' : ''}`);
    return { content: [{ type: 'text', text: list.join('\n') }] };
  }
);

// ────────────────────────────────────────────────────────────
//  list_blueprint_functions — Read all functions on an asset
// ────────────────────────────────────────────────────────────
server.tool(
  'list_blueprint_functions',
  'List all blueprint functions defined on an actor, widget, or gameInstance asset, including their parameter signatures.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
  },
  async ({ projectPath, assetType, assetId }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { asset, error } = resolveAssetGraph(projRoot, assetType, assetId);
    if (error) return { content: [{ type: 'text', text: error }] };
    const funcs = asset.functions || [];
    if (funcs.length === 0) return { content: [{ type: 'text', text: 'No functions defined on this asset' }] };
    const list = funcs.map((f: any) => {
      const inputs = (f.inputs || []).map((i: any) => `${i.name}:${i.type}`).join(', ');
      const outputs = (f.outputs || []).map((o: any) => `${o.name}:${o.type}`).join(', ');
      return `• ${f.name}(${inputs})${outputs ? ` → (${outputs})` : ''} [id: ${f.id}]`;
    });
    return { content: [{ type: 'text', text: list.join('\n') }] };
  }
);

// ────────────────────────────────────────────────────────────
//  list_custom_events — Read all custom events on an asset
// ────────────────────────────────────────────────────────────
server.tool(
  'list_custom_events',
  'List all custom events defined on an actor, widget, or gameInstance asset.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint', 'gameInstance']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
  },
  async ({ projectPath, assetType, assetId }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { asset, error } = resolveAssetGraph(projRoot, assetType, assetId);
    if (error) return { content: [{ type: 'text', text: error }] };
    const events = asset.customEvents || [];
    if (events.length === 0) return { content: [{ type: 'text', text: 'No custom events defined' }] };
    const list = events.map((e: any) => {
      const params = (e.params || []).map((p: any) => `${p.name}:${p.type}`).join(', ');
      return `• ${e.name}(${params}) [id: ${e.id}]`;
    });
    return { content: [{ type: 'text', text: list.join('\n') }] };
  }
);

// ────────────────────────────────────────────────────────────
//  add_blueprint_function — Add a function to an asset
// ────────────────────────────────────────────────────────────
server.tool(
  'add_blueprint_function',
  'Add a custom function to an actor or widget blueprint. Creates FunctionEntry and FunctionReturn nodes in a new function graph automatically.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    functionName: z.string().describe('Name for the function'),
    inputs: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Input params [{name, type}]'),
    outputs: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Output params [{name, type}]'),
  },
  async ({ projectPath, assetType, assetId, functionName, inputs, outputs }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, error } = resolveAssetGraph(projRoot, assetType, assetId);
    if (error) return { content: [{ type: 'text', text: error }] };
    const funcId = 'func_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const funcObj = {
      name: functionName, id: funcId,
      inputs: (inputs || []).map((i: any) => ({ name: i.name, type: i.type, defaultValue: null })),
      outputs: (outputs || []).map((o: any) => ({ name: o.name, type: o.type })),
      localVariables: [], graph: {}
    };
    if (!asset.functions) asset.functions = [];
    asset.functions.push(funcObj);
    if (assetType === 'actor') {
      if (!asset.functionGraphData) asset.functionGraphData = {};
      asset.functionGraphData[funcId] = {
        nodes: [
          { id: graphNodeId(), type: 'FunctionEntryNode', position: { x: 80, y: 80 }, data: { label: functionName } },
          { id: graphNodeId(), type: 'FunctionReturnNode', position: { x: 500, y: 80 }, data: { label: 'Return' } }
        ],
        connections: []
      };
    }
    asset.modifiedAt = Date.now();
    writeJsonFile(filePath, asset);
    return { content: [{ type: 'text', text: `Added function "${functionName}" [${funcId}]` }] };
  }
);

// ────────────────────────────────────────────────────────────
//  add_blueprint_custom_event — Add a custom event to an asset
// ────────────────────────────────────────────────────────────
server.tool(
  'add_blueprint_custom_event',
  'Add a custom event definition to an actor or widget blueprint. For actors, also adds a CustomEventNode to the event graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    eventName: z.string().describe('Name for the custom event'),
    params: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Event params [{name, type}]'),
  },
  async ({ projectPath, assetType, assetId, eventName, params }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, graph, graphKey, error } = resolveAssetGraph(projRoot, assetType, assetId);
    if (error) return { content: [{ type: 'text', text: error }] };
    const eventId = 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const eventObj = { name: eventName, id: eventId, params: (params || []).map((p: any) => ({ name: p.name, type: p.type })) };
    if (!asset.customEvents) asset.customEvents = [];
    asset.customEvents.push(eventObj);
    if (assetType === 'actor') {
      const ceNodeId = graphNodeId();
      graph.nodes.push({ id: ceNodeId, type: 'CustomEventNode', position: { x: 80, y: (graph.nodes.length + 1) * 180 }, data: { label: eventName, eventId, eventName } });
      writeGraphBack(filePath, asset, assetType, graphKey, graph);
    } else {
      asset.modifiedAt = Date.now();
      writeJsonFile(filePath, asset);
    }
    return { content: [{ type: 'text', text: `Added custom event "${eventName}" [${eventId}]` }] };
  }
);

// ────────────────────────────────────────────────────────────
//  add_blueprint_macro — Add a macro to an asset
// ────────────────────────────────────────────────────────────
server.tool(
  'add_blueprint_macro',
  'Add a reusable macro to an actor or widget blueprint.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    assetType: z.enum(['actor', 'widget']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    macroName: z.string().describe('Name for the macro'),
    inputs: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Input params [{name, type}]'),
    outputs: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Output params [{name, type}]'),
  },
  async ({ projectPath, assetType, assetId, macroName, inputs, outputs }: any) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, asset, error } = resolveAssetGraph(projRoot, assetType, assetId);
    if (error) return { content: [{ type: 'text', text: error }] };
    const macroId = 'macro_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const macroObj = {
      name: macroName, id: macroId,
      inputs: (inputs || []).map((i: any) => ({ name: i.name, type: i.type })),
      outputs: (outputs || []).map((o: any) => ({ name: o.name, type: o.type })),
      graph: {}
    };
    if (!asset.macros) asset.macros = [];
    asset.macros.push(macroObj);
    asset.modifiedAt = Date.now();
    writeJsonFile(filePath, asset);
    return { content: [{ type: 'text', text: `Added macro "${macroName}" [${macroId}]` }] };
  }
);

return _server;
}


// ============================================================
//  SSE HTTP Server (for VS Code / Claude Desktop / LLM clients)
// ============================================================
const SSE_PORT = parseInt(process.env.MCP_SSE_PORT || '9961', 10);

function startSseServer(): void {
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/sse') {
      console.error('[MCP SSE] New SSE client connected');
      const sseServer = createServer();
      const transport = new SSEServerTransport('/messages', res);
      transports.set(transport.sessionId, transport);
      transport.onClose = () => {
        transports.delete(transport.sessionId);
        console.error('[MCP SSE] Client disconnected');
      };
      await sseServer.connect(transport);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      if (sessionId && transports.has(sessionId)) {
        await transports.get(sessionId)!.handlePostMessage(req, res);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid or missing sessionId');
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  httpServer.listen(SSE_PORT, '127.0.0.1', () => {
    console.error('[MCP SSE] HTTP server listening on http://127.0.0.1:' + SSE_PORT + '/sse');
  });
}
// ============================================================
//  Start Server
// ============================================================
async function main(): Promise<void> {
  startBridgeServer();
  startSseServer();
  const stdioServer = createServer();
  const transport = new StdioServerTransport();
  await stdioServer.connect(transport);
  console.error('Feather Engine MCP Server v2.0 running on stdio + SSE (port ' + SSE_PORT + ')');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
