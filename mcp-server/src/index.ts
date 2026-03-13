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

function startBridgeServer(): void {
  wss = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });
  wss.on('listening', () => {
    console.error(`[MCP Bridge] WebSocket server listening on ws://127.0.0.1:${WS_PORT}`);
  });
  wss.on('connection', (ws) => {
    console.error('[MCP Bridge] Engine client connected');
    ws.send(JSON.stringify({ type: 'connected', message: 'MCP Bridge active' }));
    ws.on('close', () => console.error('[MCP Bridge] Engine client disconnected'));
  });
  wss.on('error', (err: any) => {
    console.error('[MCP Bridge] WebSocket error:', err.message);
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
      eventGraphData: defaultEventGraph(), functionGraphData: {},
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
  'Add a component to an actor. Types: spriteRenderer, rigidbody2d, collider2d, characterMovement2d, camera2d, mesh, trigger, light, camera, characterMovement, springArm, tilemap, navMeshBounds.',
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
  'Add a new state to an animation blueprint state machine.',
  {
    projectPath: z.string().describe('Absolute path to the project root folder'),
    animBlueprintId: z.string().describe('Animation blueprint ID'),
    stateName: z.string().describe('State name (e.g. "Walk", "Attack", "Jump")'),
    spriteSheetId: z.string().optional().describe('Sprite sheet for this state'),
    spriteAnimationName: z.string().optional().describe('Animation name within the sheet'),
    loop: z.boolean().optional().describe('Loop animation (default: true)'),
    playRate: z.number().optional().describe('Playback rate (default: 1)'),
    posX: z.number().optional(), posY: z.number().optional(),
    setAsEntry: z.boolean().optional().describe('Make this the entry state'),
  },
  async ({ projectPath, animBlueprintId, stateName, spriteSheetId, spriteAnimationName, loop, playRate, posX, posY, setAsEntry }) => {
    const projRoot = findProjectRoot(projectPath) || projectPath;
    const { filePath, data: abp } = findAbpFile(path.join(projRoot, 'AnimBlueprints'), animBlueprintId);
    if (!abp) return { content: [{ type: 'text', text: `Not found: ${animBlueprintId}` }] };
    const count = abp.stateMachine.states.length;
    const stateId = animUid();
    const newState: any = {
      id: stateId, name: stateName,
      posX: posX ?? (200 + count * 250), posY: posY ?? 200,
      outputType: 'spriteAnimation', animationId: '', animationName: '',
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
    return { content: [{ type: 'text', text: `Added state "${stateName}" (ID: ${stateId}) to "${abp.animBlueprintName}". Total: ${abp.stateMachine.states.length}` }] };
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
      eventGraphData: defaultEventGraph(), functionGraphData: {},
      compiledCode: '',
      characterMovement2DConfig: defaultCharacterMovement2DConfig(preset),
      controllerClass: 'None', sceneMode: '2D',
      createdAt: Date.now(), modifiedAt: Date.now(),
    };
    const actorFileName = `${safeName(characterName)}_${actorId}.json`;
    writeJsonFile(path.join(actorsDir, actorFileName), actorJson);
    updateIndex(actorsDir, 'actorId', 'actorName');
    log.push(`Created character pawn (ID: ${actorId}) with sprite→anim wired`);

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

### Create a 2D Platformer Character (Quick)
Use \`setup_2d_character_complete\` — one call creates the sprite sheet, animations, anim blueprint, character pawn, and wires everything.

### Create a 2D Character (Step by Step)
1. \`import_texture\` — Import the sprite sheet image
2. \`create_sprite_sheet\` — Define grid cells from the texture
3. \`add_sprite_animation\` (×N) — Define idle, walk, attack, etc.
4. \`create_anim_blueprint_2d\` — Create the animation state machine
5. \`add_anim_state\` (×N) — Add states for each animation
6. \`add_anim_transition\` (×N) — Wire transitions with conditions
7. \`create_character_pawn_2d\` — Create the character with components
8. \`wire_anim_blueprint_to_actor\` — Connect anim BP to sprite renderer
9. \`add_actor_to_scene\` — Place in a scene

### Create a 3D Actor
1. \`create_actor\` — Create with mesh type (cube, sphere, etc.)
2. \`add_blueprint_variable\` — Add variables (health, speed, etc.)
3. \`set_actor_physics\` — Enable physics simulation
4. \`add_actor_to_scene\` — Place in scene

### Create UI
1. \`create_widget_blueprint\` — Create with root canvas
2. \`add_widget_child\` (×N) — Add Text, Button, Image, ProgressBar, etc.

### Scene Management
- \`list_scenes\` / \`create_scene\` / \`get_scene_details\`
- \`add_actor_to_scene\` / \`remove_object_from_scene\` / \`modify_scene_object\`

### Data Management
- Structures: \`create_structure\` for custom data types
- Enums: \`create_enum\` for named constants
- Data Tables: \`create_data_table\` for grid data
- Save Games: \`create_save_game_class\` for persistence

## Actor Types
- \`actor\` — Basic 3D actor with mesh
- \`spriteActor\` — 2D sprite actor
- \`characterPawn\` — 3D playable character
- \`characterPawn2D\` — 2D playable character (use create_character_pawn_2d)
- \`tilemapActor\` — 2D tilemap
- \`parallaxLayer\` — 2D parallax background
- \`playerController\` — Input controller
- \`aiController\` — AI-driven controller

## Component Types
\`spriteRenderer\`, \`rigidbody2d\`, \`collider2d\`, \`characterMovement2d\`,
\`camera2d\`, \`mesh\`, \`trigger\`, \`light\`, \`camera\`, \`characterMovement\`,
\`springArm\`, \`tilemap\`, \`navMeshBounds\`

## Variable Types
\`Float\`, \`Integer\`, \`Boolean\`, \`String\`, \`Vector3\`, \`Color\`,
\`Rotator\`, \`Transform\`, \`Object\`, \`Class\`, \`Array\`
`;
    return { content: [{ type: 'text', text: docs }] };
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
