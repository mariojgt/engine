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
    /\/(Actors|Scenes|Sprites|SpriteSheets|AnimBlueprints|Structures|Enums|Widgets|GameInstances|SaveGameClasses|DataTables|Config|Textures|Fonts|InputMappings|Events)\//i
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
const server = new McpServer({
  name: 'feather-engine',
  version: '2.0.0',
});

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
      result += `  ${w.name || w.widgetName || f} (ID: ${w.id || w.widgetId})\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_widget_blueprint',
  'Create a new UI widget blueprint with a root canvas panel.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    name: z.string().describe('Widget name (e.g. "HUD", "MainMenu", "HealthBar")'),
    rootWidgetType: z.enum(['CanvasPanel', 'VerticalBox', 'HorizontalBox', 'Overlay']).optional().describe('Root container type (default: CanvasPanel)'),
  },
  async ({ projectPath, name, rootWidgetType }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const wDir = path.join(projRoot, 'Widgets');
    const id = widgetUid();
    const widgetJson = {
      id, name, rootWidgetType: rootWidgetType || 'CanvasPanel',
      widgetTree: {
        id: nodeUid(), type: rootWidgetType || 'CanvasPanel',
        name: 'RootCanvas', children: [],
        slot: { anchor: { minX: 0, maxX: 1, minY: 0, maxY: 1 }, offset: { left: 0, top: 0, right: 0, bottom: 0 }, alignment: { x: 0, y: 0 }, zOrder: 0 },
      },
      variables: [], functions: [], customEvents: [],
      eventGraphData: defaultEventGraph(), functionGraphData: {},
      compiledCode: '',
    };
    const fileName = `${safeName(name)}_${id}.json`;
    writeJsonFile(path.join(wDir, fileName), widgetJson);
    updateIndex(wDir, 'id', 'name');
    return { content: [{ type: 'text', text: `Created widget "${name}" (ID: ${id})\nRoot: ${rootWidgetType || 'CanvasPanel'}\nFile: Widgets/${fileName}` }] };
  }
);

server.tool(
  'add_widget_child',
  'Add a child widget element to an existing widget blueprint. Types: Text, Button, Image, ProgressBar, Slider, TextInput, CheckBox, etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    widgetId: z.string().describe('Widget blueprint ID'),
    parentName: z.string().optional().describe('Parent widget name (default: root)'),
    widgetType: z.string().describe('Widget type (Text, Button, Image, ProgressBar, etc.)'),
    widgetName: z.string().describe('Name for this widget element'),
    properties: z.record(z.string(), z.any()).optional().describe('Widget properties (text, fontSize, color, etc.)'),
  },
  async ({ projectPath, widgetId, parentName, widgetType, widgetName, properties }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const wDir = path.join(projRoot, 'Widgets');
    const { filePath, data: widget } = findAssetFile(wDir, 'id', widgetId);
    if (!filePath || !widget) return { content: [{ type: 'text', text: `Widget not found: ${widgetId}` }] };

    const child: any = {
      id: nodeUid(), type: widgetType, name: widgetName,
      children: [],
      slot: { anchor: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, offset: { left: 0, top: 0, right: 0, bottom: 0 }, alignment: { x: 0, y: 0 }, zOrder: 0 },
      ...(properties || {}),
    };

    // Find parent in tree
    function findNode(node: any, name: string): any {
      if (node.name === name) return node;
      for (const c of (node.children || [])) {
        const found = findNode(c, name);
        if (found) return found;
      }
      return null;
    }
    const parent = parentName ? findNode(widget.widgetTree, parentName) : widget.widgetTree;
    if (!parent) return { content: [{ type: 'text', text: `Parent "${parentName}" not found in widget tree.` }] };
    parent.children = parent.children || [];
    parent.children.push(child);
    writeJsonFile(filePath, widget);
    return { content: [{ type: 'text', text: `Added ${widgetType} "${widgetName}" to "${parent.name}" in widget "${widget.name}"` }] };
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
  'Update scene composition: lights, skybox, fog, ambient color, post-processing effects.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    settings: z.record(z.string(), z.any()).describe('Composition settings to merge'),
  },
  async ({ projectPath, settings }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const configPath = path.join(projRoot, 'Config', 'composition.json');
    let config: any = {};
    if (fs.existsSync(configPath)) config = readJsonFile(configPath);
    Object.assign(config, settings);
    writeJsonFile(configPath, config);
    return { content: [{ type: 'text', text: `Updated composition: ${Object.keys(settings).join(', ')}` }] };
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
5. \`compile_blueprint\` — Compile to runtime code

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
\`springArm\`, \`tilemap\`, \`navMeshBounds\`

### skeletalMesh Properties
- \`meshAssetId\` — ID of the imported mesh asset (from import_mesh)
- \`animationBlueprintId\` — ID of the 3D animation blueprint (from create_anim_blueprint_3d)

## Variable Types
\`Float\`, \`Integer\`, \`Boolean\`, \`String\`, \`Vector3\`, \`Color\`,
\`Rotator\`, \`Transform\`, \`Object\`, \`Class\`, \`Array\`

## Tile Collision Types
\`none\`, \`full\`, \`top\`, \`bottom\`, \`left\`, \`right\`, \`slope-left\`, \`slope-right\`, \`platform\`
`;
    return { content: [{ type: 'text', text: docs }] };
  }
);


// ============================================================
//  VISUAL SCRIPT EDITING TOOLS
// ============================================================

// Helper: generate a random hex ID like the engine does
function nodeUid(): string {
  return Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
}

// Helper: read an actor's eventGraphData
function readActorGraph(projRoot: string, actorId: string): { filePath: string; data: any; graph: any } | null {
  const actorsDir = path.join(projRoot, 'Actors');
  if (!fs.existsSync(actorsDir)) return null;
  const files = fs.readdirSync(actorsDir).filter(f => f.endsWith('.json') && f !== '_index.json');
  for (const f of files) {
    const fp = path.join(actorsDir, f);
    const d = readJsonFile(fp);
    if (d && d.actorId === actorId) {
      if (!d.eventGraphData) d.eventGraphData = { nodes: [], connections: [] };
      if (!d.eventGraphData.nodes) d.eventGraphData.nodes = [];
      if (!d.eventGraphData.connections) d.eventGraphData.connections = [];
      return { filePath: fp, data: d, graph: d.eventGraphData };
    }
  }
  return null;
}

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

// Helper: read anim blueprint
function readAnimBP(projRoot: string, animId: string): { filePath: string; data: any } | null {
  const dir = path.join(projRoot, 'AnimBlueprints');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const fp = path.join(dir, f);
    const d = readJsonFile(fp);
    if (d && d.animBlueprintId === animId) return { filePath: fp, data: d };
  }
  return null;
}

// -- Tool: get_blueprint_graph --
server.tool(
  'get_blueprint_graph',
  'Read the visual script graph (nodes + connections) from an actor, widget blueprint, or anim blueprint. Returns all nodes with their types, positions, data, and all connections.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID (actorId, widgetBlueprintId, or animBlueprintId)'),
    graphName: z.string().optional().describe('For actors: "eventGraph" (default), or a function/macro ID. For widgets/anim: "eventGraph"'),
  },
  async ({ projectPath, assetType, assetId, graphName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    let graph: any = null;
    let fGraphData: any = null;
    let assetName = '';

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found: ' + assetId }] };
      assetName = r.data.actorName || assetId;
      if (!graphName || graphName === 'eventGraph') {
        graph = r.graph;
      } else {
        fGraphData = r.data.functionGraphData || {};
        graph = fGraphData[graphName] || { nodes: [], connections: [] };
      }
    } else if (assetType === 'widget') {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget blueprint not found: ' + assetId }] };
      assetName = r.data.widgetBlueprintName || assetId;
      graph = r.data.eventGraph || { nodes: [], connections: [] };
      if (!graph.nodes) graph.nodes = [];
      if (!graph.connections) graph.connections = [];
    } else {
      const r = readAnimBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Anim blueprint not found: ' + assetId }] };
      assetName = assetId;
      graph = r.data.eventGraph || { nodes: [], connections: [] };
      if (!graph.nodes) graph.nodes = [];
      if (!graph.connections) graph.connections = [];
    }

    const nodes = graph.nodes || [];
    const conns = graph.connections || [];

    let result = assetName + ' � ' + assetType + ' graph';
    if (graphName && graphName !== 'eventGraph') result += ' (' + graphName + ')';
    result += '\n\nNodes (' + nodes.length + '):\n';
    for (const n of nodes) {
      result += '  [' + n.id + '] ' + n.type + ' at (' + n.position.x + ', ' + n.position.y + ')';
      if (n.data && n.data.label) result += ' � "' + n.data.label + '"';
      if (n.data && n.data.controls) result += ' controls=' + JSON.stringify(n.data.controls);
      result += '\n';
    }
    result += '\nConnections (' + conns.length + '):\n';
    for (const c of conns) {
      result += '  ' + c.source + '.' + c.sourceOutput + ' ? ' + c.target + '.' + c.targetInput + '\n';
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: add_blueprint_node --
server.tool(
  'add_blueprint_node',
  'Add a visual script node to an actor, widget, or anim blueprint event graph. Returns the new node ID. Common node types: EventBeginPlayNode, EventTickNode, BranchNode, PrintStringNode, AddMovementInputNode, JumpNode, InputKeyEventNode, InputAxisNode, SetVariableNode, GetVariableNode, AddNode, SubtractNode, MultiplyNode, etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    nodeType: z.string().describe('The node class name, e.g. "BranchNode", "PrintStringNode", "EventBeginPlayNode"'),
    positionX: z.number().optional().describe('X position in the graph (default: 200)'),
    positionY: z.number().optional().describe('Y position in the graph (default: 200)'),
    label: z.string().optional().describe('Display label for the node'),
    controls: z.record(z.any()).optional().describe('Control values, e.g. {"key": "Space"} for InputKeyEventNode, {"value": 42} for FloatNode'),
    data: z.record(z.any()).optional().describe('Additional data fields for the node'),
    graphName: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
  },
  async ({ projectPath, assetType, assetId, nodeType, positionX, positionY, label, controls, data, graphName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const nodeId = nodeUid();
    const nodeObj: any = {
      id: nodeId,
      type: nodeType,
      position: { x: positionX ?? 200, y: positionY ?? 200 },
      data: { label: label || nodeType.replace(/Node$/, '').replace(/([A-Z])/g, ' $1').trim(), ...(data || {}) }
    };
    if (controls) nodeObj.data.controls = controls;

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found: ' + assetId }] };
      if (!graphName || graphName === 'eventGraph') {
        r.graph.nodes.push(nodeObj);
        r.data.eventGraphData = r.graph;
      } else {
        if (!r.data.functionGraphData) r.data.functionGraphData = {};
        if (!r.data.functionGraphData[graphName]) r.data.functionGraphData[graphName] = { nodes: [], connections: [] };
        r.data.functionGraphData[graphName].nodes.push(nodeObj);
      }
      writeJsonFile(r.filePath, r.data);
    } else if (assetType === 'widget') {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget blueprint not found: ' + assetId }] };
      if (!r.data.eventGraph) r.data.eventGraph = { nodes: [], connections: [] };
      if (!r.data.eventGraph.nodes) r.data.eventGraph.nodes = [];
      r.data.eventGraph.nodes.push(nodeObj);
      writeJsonFile(r.filePath, r.data);
    } else {
      const r = readAnimBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Anim blueprint not found: ' + assetId }] };
      if (!r.data.eventGraph) r.data.eventGraph = { nodes: [], connections: [] };
      if (!r.data.eventGraph.nodes) r.data.eventGraph.nodes = [];
      r.data.eventGraph.nodes.push(nodeObj);
      writeJsonFile(r.filePath, r.data);
    }

    return { content: [{ type: 'text', text: 'Added node [' + nodeId + '] type=' + nodeType + ' at (' + (positionX ?? 200) + ', ' + (positionY ?? 200) + ')' }] };
  }
);

// -- Tool: remove_blueprint_node --
server.tool(
  'remove_blueprint_node',
  'Remove a visual script node and all its connections from an actor, widget, or anim blueprint graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    nodeId: z.string().describe('The node ID to remove'),
    graphName: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
  },
  async ({ projectPath, assetType, assetId, nodeId, graphName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;

    function removeFromGraph(graph: any) {
      const before = graph.nodes.length;
      graph.nodes = graph.nodes.filter((n: any) => n.id !== nodeId);
      graph.connections = graph.connections.filter((c: any) => c.source !== nodeId && c.target !== nodeId);
      return before - graph.nodes.length;
    }

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found: ' + assetId }] };
      let g = r.graph;
      if (graphName && graphName !== 'eventGraph') {
        g = (r.data.functionGraphData || {})[graphName] || { nodes: [], connections: [] };
      }
      const removed = removeFromGraph(g);
      if (graphName && graphName !== 'eventGraph') {
        r.data.functionGraphData[graphName] = g;
      } else {
        r.data.eventGraphData = g;
      }
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: removed ? 'Removed node ' + nodeId : 'Node not found: ' + nodeId }] };
    } else if (assetType === 'widget') {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      if (!r.data.eventGraph) return { content: [{ type: 'text', text: 'No event graph' }] };
      const removed = removeFromGraph(r.data.eventGraph);
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: removed ? 'Removed node ' + nodeId : 'Node not found' }] };
    } else {
      const r = readAnimBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Anim blueprint not found' }] };
      if (!r.data.eventGraph) return { content: [{ type: 'text', text: 'No event graph' }] };
      const removed = removeFromGraph(r.data.eventGraph);
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: removed ? 'Removed node ' + nodeId : 'Node not found' }] };
    }
  }
);

// -- Tool: add_blueprint_connection --
server.tool(
  'add_blueprint_connection',
  'Connect two nodes in a visual script graph. Execution pins use "exec"/"then"/"pressed"/"released" etc. Data pins use names like "value", "result", "x", "y", "z", "condition", etc.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    sourceNodeId: z.string().describe('ID of the source node'),
    sourceOutput: z.string().describe('Output pin name on source, e.g. "exec", "value", "result", "x"'),
    targetNodeId: z.string().describe('ID of the target node'),
    targetInput: z.string().describe('Input pin name on target, e.g. "exec", "a", "b", "condition", "x"'),
    graphName: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
  },
  async ({ projectPath, assetType, assetId, sourceNodeId, sourceOutput, targetNodeId, targetInput, graphName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const connId = nodeUid();
    const conn = { id: connId, source: sourceNodeId, sourceOutput, target: targetNodeId, targetInput };

    function addConn(graph: any) {
      if (!graph.connections) graph.connections = [];
      graph.connections.push(conn);
    }

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found: ' + assetId }] };
      if (!graphName || graphName === 'eventGraph') {
        addConn(r.graph);
        r.data.eventGraphData = r.graph;
      } else {
        if (!r.data.functionGraphData) r.data.functionGraphData = {};
        if (!r.data.functionGraphData[graphName]) r.data.functionGraphData[graphName] = { nodes: [], connections: [] };
        addConn(r.data.functionGraphData[graphName]);
      }
      writeJsonFile(r.filePath, r.data);
    } else if (assetType === 'widget') {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      if (!r.data.eventGraph) r.data.eventGraph = { nodes: [], connections: [] };
      addConn(r.data.eventGraph);
      writeJsonFile(r.filePath, r.data);
    } else {
      const r = readAnimBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Anim blueprint not found' }] };
      if (!r.data.eventGraph) r.data.eventGraph = { nodes: [], connections: [] };
      addConn(r.data.eventGraph);
      writeJsonFile(r.filePath, r.data);
    }

    return { content: [{ type: 'text', text: 'Connected ' + sourceNodeId + '.' + sourceOutput + ' ? ' + targetNodeId + '.' + targetInput + ' [' + connId + ']' }] };
  }
);

// -- Tool: remove_blueprint_connection --
server.tool(
  'remove_blueprint_connection',
  'Remove a connection between two nodes in a visual script graph, either by connection ID or by source/target pin specification.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    connectionId: z.string().optional().describe('The connection ID to remove'),
    sourceNodeId: z.string().optional().describe('Source node ID (alternative to connectionId)'),
    sourceOutput: z.string().optional().describe('Source output pin name'),
    targetNodeId: z.string().optional().describe('Target node ID'),
    targetInput: z.string().optional().describe('Target input pin name'),
    graphName: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
  },
  async ({ projectPath, assetType, assetId, connectionId, sourceNodeId, sourceOutput, targetNodeId, targetInput, graphName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;

    function removeConn(graph: any): number {
      if (!graph.connections) return 0;
      const before = graph.connections.length;
      if (connectionId) {
        graph.connections = graph.connections.filter((c: any) => c.id !== connectionId);
      } else if (sourceNodeId && targetNodeId) {
        graph.connections = graph.connections.filter((c: any) => {
          if (c.source !== sourceNodeId || c.target !== targetNodeId) return true;
          if (sourceOutput && c.sourceOutput !== sourceOutput) return true;
          if (targetInput && c.targetInput !== targetInput) return true;
          return false;
        });
      }
      return before - graph.connections.length;
    }

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found' }] };
      let g = (!graphName || graphName === 'eventGraph') ? r.graph : ((r.data.functionGraphData || {})[graphName as string] || { nodes: [], connections: [] });
      const removed = removeConn(g);
      if (!graphName || graphName === 'eventGraph') r.data.eventGraphData = g;
      else r.data.functionGraphData[graphName as string] = g;
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: removed + ' connection(s) removed' }] };
    } else if (assetType === 'widget') {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      if (!r.data.eventGraph) return { content: [{ type: 'text', text: 'No event graph' }] };
      const removed = removeConn(r.data.eventGraph);
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: removed + ' connection(s) removed' }] };
    } else {
      const r = readAnimBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Anim blueprint not found' }] };
      if (!r.data.eventGraph) return { content: [{ type: 'text', text: 'No event graph' }] };
      const removed = removeConn(r.data.eventGraph);
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: removed + ' connection(s) removed' }] };
    }
  }
);

// -- Tool: update_blueprint_node --
server.tool(
  'update_blueprint_node',
  'Update an existing visual script node - change its position, controls, data, or label.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    nodeId: z.string().describe('The node ID to update'),
    positionX: z.number().optional().describe('New X position'),
    positionY: z.number().optional().describe('New Y position'),
    label: z.string().optional().describe('New label'),
    controls: z.record(z.any()).optional().describe('Updated control values (merged with existing)'),
    data: z.record(z.any()).optional().describe('Additional data fields to merge'),
    graphName: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
  },
  async ({ projectPath, assetType, assetId, nodeId, positionX, positionY, label, controls, data, graphName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;

    function updateNode(graph: any): boolean {
      const node = graph.nodes.find((n: any) => n.id === nodeId);
      if (!node) return false;
      if (positionX !== undefined) node.position.x = positionX;
      if (positionY !== undefined) node.position.y = positionY;
      if (label) node.data.label = label;
      if (controls) node.data.controls = { ...(node.data.controls || {}), ...controls };
      if (data) Object.assign(node.data, data);
      return true;
    }

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found' }] };
      let g = (!graphName || graphName === 'eventGraph') ? r.graph : ((r.data.functionGraphData || {})[graphName as string] || { nodes: [], connections: [] });
      if (!updateNode(g)) return { content: [{ type: 'text', text: 'Node not found: ' + nodeId }] };
      if (!graphName || graphName === 'eventGraph') r.data.eventGraphData = g;
      else r.data.functionGraphData[graphName as string] = g;
      writeJsonFile(r.filePath, r.data);
    } else if (assetType === 'widget') {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      if (!r.data.eventGraph) return { content: [{ type: 'text', text: 'No event graph' }] };
      if (!updateNode(r.data.eventGraph)) return { content: [{ type: 'text', text: 'Node not found' }] };
      writeJsonFile(r.filePath, r.data);
    } else {
      const r = readAnimBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Anim blueprint not found' }] };
      if (!r.data.eventGraph) return { content: [{ type: 'text', text: 'No event graph' }] };
      if (!updateNode(r.data.eventGraph)) return { content: [{ type: 'text', text: 'Node not found' }] };
      writeJsonFile(r.filePath, r.data);
    }
    return { content: [{ type: 'text', text: 'Updated node ' + nodeId }] };
  }
);

// -- Tool: add_blueprint_function --
server.tool(
  'add_blueprint_function',
  'Add a custom function to an actor or widget blueprint. Creates function metadata and an empty function graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    functionName: z.string().describe('Name for the function'),
    inputs: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Input parameters [{name, type}]'),
    outputs: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Output parameters [{name, type}]'),
  },
  async ({ projectPath, assetType, assetId, functionName, inputs, outputs }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const funcId = 'func_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const funcObj = {
      name: functionName,
      id: funcId,
      inputs: (inputs || []).map(i => ({ name: i.name, type: i.type, defaultValue: null })),
      outputs: (outputs || []).map(o => ({ name: o.name, type: o.type })),
      localVariables: [],
      graph: {}
    };

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found' }] };
      if (!r.data.functions) r.data.functions = [];
      r.data.functions.push(funcObj);
      if (!r.data.functionGraphData) r.data.functionGraphData = {};
      r.data.functionGraphData[funcId] = {
        nodes: [
          { id: nodeUid(), type: 'FunctionEntryNode', position: { x: 80, y: 80 }, data: { label: functionName } },
          { id: nodeUid(), type: 'FunctionReturnNode', position: { x: 500, y: 80 }, data: { label: 'Return' } }
        ],
        connections: []
      };
      writeJsonFile(r.filePath, r.data);
    } else {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      if (!r.data.functions) r.data.functions = [];
      r.data.functions.push(funcObj);
      writeJsonFile(r.filePath, r.data);
    }
    return { content: [{ type: 'text', text: 'Added function "' + functionName + '" [' + funcId + ']' }] };
  }
);

// -- Tool: add_blueprint_custom_event --
server.tool(
  'add_blueprint_custom_event',
  'Add a custom event definition to an actor or widget blueprint.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    eventName: z.string().describe('Name for the custom event'),
    params: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Event parameters [{name, type}]'),
  },
  async ({ projectPath, assetType, assetId, eventName, params }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const eventId = 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const eventObj = {
      name: eventName,
      id: eventId,
      params: (params || []).map(p => ({ name: p.name, type: p.type }))
    };

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found' }] };
      if (!r.data.customEvents) r.data.customEvents = [];
      r.data.customEvents.push(eventObj);
      // Also add a CustomEventNode to the event graph
      const ceNodeId = nodeUid();
      r.graph.nodes.push({
        id: ceNodeId, type: 'CustomEventNode',
        position: { x: 80, y: (r.graph.nodes.length + 1) * 180 },
        data: { label: eventName, eventId: eventId, eventName: eventName }
      });
      r.data.eventGraphData = r.graph;
      writeJsonFile(r.filePath, r.data);
    } else {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      if (!r.data.customEvents) r.data.customEvents = [];
      r.data.customEvents.push(eventObj);
      writeJsonFile(r.filePath, r.data);
    }
    return { content: [{ type: 'text', text: 'Added custom event "' + eventName + '" [' + eventId + ']' }] };
  }
);

// -- Tool: add_blueprint_macro --
server.tool(
  'add_blueprint_macro',
  'Add a macro to an actor or widget blueprint. Macros are reusable graph snippets.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    macroName: z.string().describe('Name for the macro'),
    inputs: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Input parameters [{name, type}]'),
    outputs: z.array(z.object({ name: z.string(), type: z.string() })).optional().describe('Output parameters [{name, type}]'),
  },
  async ({ projectPath, assetType, assetId, macroName, inputs, outputs }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const macroId = 'macro_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const macroObj = {
      name: macroName,
      id: macroId,
      inputs: (inputs || []).map(i => ({ name: i.name, type: i.type })),
      outputs: (outputs || []).map(o => ({ name: o.name, type: o.type })),
      graph: {}
    };

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found' }] };
      if (!r.data.macros) r.data.macros = [];
      r.data.macros.push(macroObj);
      writeJsonFile(r.filePath, r.data);
    } else {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      if (!r.data.macros) r.data.macros = [];
      r.data.macros.push(macroObj);
      writeJsonFile(r.filePath, r.data);
    }
    return { content: [{ type: 'text', text: 'Added macro "' + macroName + '" [' + macroId + ']' }] };
  }
);

// -- Tool: set_blueprint_graph --
server.tool(
  'set_blueprint_graph',
  'Replace the entire visual script graph (nodes + connections) for an actor, widget, or anim blueprint. Use this for bulk graph construction or to import a complete graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
    nodes: z.array(z.object({
      id: z.string().optional(),
      type: z.string(),
      positionX: z.number(),
      positionY: z.number(),
      label: z.string().optional(),
      controls: z.record(z.any()).optional(),
      data: z.record(z.any()).optional()
    })).describe('Array of nodes to set'),
    connections: z.array(z.object({
      sourceNodeId: z.string().describe('ID or index reference of source node'),
      sourceOutput: z.string(),
      targetNodeId: z.string().describe('ID or index reference of target node'),
      targetInput: z.string()
    })).describe('Array of connections between nodes'),
    graphName: z.string().optional().describe('For actors: "eventGraph" (default) or a function ID'),
  },
  async ({ projectPath, assetType, assetId, nodes, connections, graphName }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;

    // Build nodes with auto-generated IDs if not provided
    const builtNodes = nodes.map(n => {
      const nid = n.id || nodeUid();
      const nodeObj: any = {
        id: nid,
        type: n.type,
        position: { x: n.positionX, y: n.positionY },
        data: { label: n.label || n.type.replace(/Node$/, '').replace(/([A-Z])/g, ' $1').trim(), ...(n.data || {}) }
      };
      if (n.controls) nodeObj.data.controls = n.controls;
      return nodeObj;
    });

    // Build connections
    const builtConns = connections.map(c => ({
      id: nodeUid(),
      source: c.sourceNodeId,
      sourceOutput: c.sourceOutput,
      target: c.targetNodeId,
      targetInput: c.targetInput
    }));

    const graph = { nodes: builtNodes, connections: builtConns };

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found' }] };
      if (!graphName || graphName === 'eventGraph') {
        r.data.eventGraphData = graph;
      } else {
        if (!r.data.functionGraphData) r.data.functionGraphData = {};
        r.data.functionGraphData[graphName] = graph;
      }
      writeJsonFile(r.filePath, r.data);
    } else if (assetType === 'widget') {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      r.data.eventGraph = graph;
      writeJsonFile(r.filePath, r.data);
    } else {
      const r = readAnimBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Anim blueprint not found' }] };
      r.data.eventGraph = graph;
      writeJsonFile(r.filePath, r.data);
    }

    return { content: [{ type: 'text', text: 'Set graph: ' + builtNodes.length + ' nodes, ' + builtConns.length + ' connections' }] };
  }
);

// -- Tool: compile_blueprint --
server.tool(
  'compile_blueprint',
  'Trigger a re-compile of an actor or widget blueprint by clearing the compiled code, so the engine will recompile it on next load.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    assetType: z.enum(['actor', 'widget', 'animBlueprint']).describe('Type of asset'),
    assetId: z.string().describe('The asset ID'),
  },
  async ({ projectPath, assetType, assetId }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;

    if (assetType === 'actor') {
      const r = readActorGraph(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Actor not found' }] };
      r.data.compiledCode = '';
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: 'Cleared compiled code for actor ' + (r.data.actorName || assetId) + '. Engine will recompile on next load.' }] };
    } else if (assetType === 'widget') {
      const r = readWidgetBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Widget not found' }] };
      r.data.compiledCode = '';
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: 'Cleared compiled code for widget ' + (r.data.widgetBlueprintName || assetId) }] };
    } else {
      const r = readAnimBP(projRoot, assetId);
      if (!r) return { content: [{ type: 'text', text: 'Anim blueprint not found' }] };
      r.data.compiledCode = '';
      writeJsonFile(r.filePath, r.data);
      return { content: [{ type: 'text', text: 'Cleared compiled code for anim blueprint ' + assetId }] };
    }
  }
);

// -- Tool: list_node_types --
server.tool(
  'list_node_types',
  'List available visual script node types by category. Useful for discovering what nodes can be used in blueprints.',
  {
    category: z.string().optional().describe('Filter by category: events, flow, math, transform, physics, character, camera, input, variables, ui, audio, ai, debug, cast, string, array, animation, gameInstance, saveLoad, collision, components, data. Leave empty for all.'),
  },
  async ({ category }) => {
    const allNodes: Record<string, string[]> = {
      events: ['EventBeginPlayNode', 'EventTickNode', 'EventOnDestroyNode', 'CustomEventNode', 'CallCustomEventNode', 'InputKeyEventNode'],
      flow: ['BranchNode', 'SequenceNode', 'ForLoopNode', 'ForLoopWithBreakNode', 'ForEachLoopNode', 'WhileLoopNode', 'DoOnceNode', 'DoNNode', 'FlipFlopNode', 'GateNode', 'MultiGateNode', 'DelayContinueNode', 'SwitchOnIntNode', 'SwitchOnStringNode'],
      math: ['AddNode', 'SubtractNode', 'MultiplyNode', 'DivideNode', 'SineNode', 'CosineNode', 'AbsoluteNode', 'ClampNode', 'LerpNode', 'GreaterThanNode', 'ModuloNode', 'PowerNode', 'MinNode', 'MaxNode', 'RoundNode', 'FloorNode', 'CeilNode', 'SqrtNode', 'LogNode', 'TangentNode', 'NormalizeNode', 'DotProductNode', 'CrossProductNode', 'VectorLengthNode', 'DistanceNode', 'RandomFloatNode', 'RandomFloatInRangeNode', 'RandomIntInRangeNode', 'RandomBoolNode', 'EqualNode', 'NotEqualNode', 'LessThanNode', 'GreaterOrEqualNode', 'LessOrEqualNode', 'BoolAndNode', 'BoolOrNode', 'BoolNotNode', 'BoolXorNode'],
      values: ['FloatNode', 'BooleanNode', 'TimeNode', 'DeltaTimeNode', 'StringLiteralNode', 'Vector3LiteralNode', 'ColorNode'],
      conversions: ['BoolToNumberNode', 'NumberToBoolNode', 'BoolToStringNode', 'StringToBoolNode', 'NumberToStringNode', 'StringToNumberNode', 'ColorToStringNode', 'StringToColorNode'],
      string: ['AppendNode', 'FormatTextNode', 'StringLengthNode', 'SubstringNode', 'StringContainsNode', 'StringReplaceNode', 'StringSplitNode', 'TrimNode', 'ToUpperNode', 'ToLowerNode'],
      transform: ['GetActorPositionNode', 'SetActorPositionNode', 'GetActorRotationNode', 'SetActorRotationNode', 'GetActorScaleNode', 'SetActorScaleNode', 'GetActorForwardVectorNode', 'GetActorRightVectorNode', 'GetActorUpVectorNode', 'GetActorVelocityNode', 'AddActorWorldOffsetNode', 'AddActorWorldRotationNode', 'AddActorLocalOffsetNode', 'TeleportActorNode'],
      physics: ['AddForceNode', 'AddImpulseNode', 'SetVelocityNode', 'GetMassNode', 'GetVelocityNode', 'GetAngularVelocityNode', 'SetMassNode', 'SetLinearVelocityNode', 'SetAngularVelocityNode', 'SetSimulatePhysicsNode', 'SetGravityEnabledNode', 'SetGravityScaleNode', 'AddTorqueNode', 'AddForceAtLocationNode', 'CastRayNode', 'LineTraceSingleNode', 'SphereTraceNode'],
      character: ['AddMovementInputNode', 'JumpNode', 'StopJumpingNode', 'CrouchNode', 'UncrouchNode', 'SetMovementModeNode', 'SetMaxWalkSpeedNode', 'LaunchCharacterNode', 'GetCharacterVelocityNode', 'GetMovementSpeedNode', 'IsGroundedNode', 'IsJumpingNode', 'IsCrouchingNode', 'IsFallingNode', 'IsFlyingNode', 'IsSwimmingNode', 'IsMovingNode', 'GetMovementModeNode'],
      input: ['InputKeyEventNode', 'InputAxisNode', 'GetMousePositionNode', 'GetMouseDeltaNode'],
      variables: ['GetVariableNode', 'SetVariableNode', 'MakeStructNode', 'BreakStructNode'],
      functions: ['FunctionEntryNode', 'FunctionReturnNode', 'FunctionCallNode', 'MacroEntryNode', 'MacroExitNode', 'MacroCallNode'],
      camera: ['SetSpringArmLengthNode', 'GetSpringArmLengthNode', 'SetSpringArmTargetOffsetNode', 'SetCameraModeNode', 'SetCameraFOVNode', 'GetCameraLocationNode', 'GetCameraRotationNode', 'AddControllerYawInputNode', 'AddControllerPitchInputNode', 'SetMouseLockEnabledNode'],
      ui: ['CreateWidgetNode', 'AddToViewportNode', 'RemoveFromViewportNode', 'SetWidgetTextNode', 'GetWidgetTextNode', 'SetWidgetVisibilityNode', 'SetWidgetColorNode', 'SetWidgetOpacityNode', 'SetProgressBarPercentNode', 'SetSliderValueNode', 'SetCheckBoxStateNode', 'PlayWidgetAnimationNode', 'SetInputModeNode', 'ShowMouseCursorNode', 'ButtonOnClickedNode', 'ButtonOnPressedNode', 'ButtonOnReleasedNode', 'GetWidgetVariableNode', 'SetWidgetVariableNode', 'CallWidgetFunctionNode'],
      audio: ['PlaySoundNode', 'StopSoundNode', 'SetVolumeNode', 'SetPitchNode'],
      ai: ['AIMoveToNode', 'AIStopMovementNode', 'AISetFocalPointNode', 'AIClearFocalPointNode', 'AIStartPatrolNode', 'AIStopPatrolNode', 'AIStartFollowingNode', 'AIStopFollowingNode', 'GetAIStateNode'],
      debug: ['PrintStringNode', 'DrawDebugLineNode', 'DrawDebugSphereNode', 'DrawDebugBoxNode'],
      cast: ['CastToNode', 'GetSelfReferenceNode', 'GetPlayerPawnNode', 'GetActorByNameNode', 'GetAllActorsOfClassNode', 'IsValidNode', 'GetActorNameNode', 'GetActorVariableNode', 'SetActorVariableNode', 'CallActorFunctionNode'],
      animation: ['PlayAnimationNode', 'StopAnimationNode', 'AnimUpdateEventNode', 'TryGetPawnOwnerNode', 'SetAnimVariableNode', 'GetAnimVariableNode'],
      gameInstance: ['GetGameInstanceNode', 'GetGameInstanceVariableNode', 'SetGameInstanceVariableNode', 'CallGameInstanceFunctionNode'],
      saveLoad: ['SaveGameNode', 'LoadGameNode', 'DoesSaveExistNode', 'DeleteSaveNode'],
      collision: ['OnTriggerBeginOverlapNode', 'OnTriggerEndOverlapNode', 'OnActorBeginOverlapNode', 'OnActorEndOverlapNode', 'OnCollisionHitNode', 'OnComponentHitNode', 'OnComponentBeginOverlapNode', 'OnComponentEndOverlapNode'],
      world: ['GetPlayerCharacterNode', 'OpenLevelNode', 'QuitGameNode', 'SetGamePausedNode', 'IsGamePausedNode', 'GetAllActorsWithTagNode', 'SpawnActorNode', 'DestroyActorNode'],
      array: ['GetArrayNode', 'SetArrayNode', 'ArrayLengthNode', 'ArrayAddNode', 'ArrayRemoveNode', 'ArrayContainsNode', 'ArrayClearNode'],
      data: ['GetDataTableRowNode', 'GetDataTableRowCountNode'],
    };

    let result = '';
    const cats = category ? [category] : Object.keys(allNodes);
    for (const cat of cats) {
      const nodes = allNodes[cat];
      if (!nodes) { result += 'Unknown category: ' + cat + '\n'; continue; }
      result += cat.toUpperCase() + ' (' + nodes.length + '):\n';
      for (const n of nodes) result += '  ' + n + '\n';
      result += '\n';
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: create_event_asset --
server.tool(
  'create_event_asset',
  'Create a new event asset (for the engine event system � broadcasts between actors/systems).',
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
return server;
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
