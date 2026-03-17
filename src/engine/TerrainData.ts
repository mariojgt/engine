// ============================================================
//  TerrainData — Core terrain data model
//
//  Defines heightmap storage, texture splat layers, foliage
//  instance data, and serialization helpers for the terrain system.
// ============================================================

// ---- Unique ID helper ----
let _terrainUid = 0;
export function terrainUid(): string {
  return 'terrain_' + Date.now().toString(36) + '_' + (++_terrainUid).toString(36);
}

// ============================================================
//  Terrain Configuration
// ============================================================

export interface TerrainConfig {
  /** Heightmap resolution (vertices per side, e.g. 129, 257, 513) */
  resolution: number;
  /** World-space width (X axis) in units */
  worldSizeX: number;
  /** World-space depth (Z axis) in units */
  worldSizeZ: number;
  /** Maximum height range in units */
  maxHeight: number;
}

export function defaultTerrainConfig(): TerrainConfig {
  return {
    resolution: 129,
    worldSizeX: 200,
    worldSizeZ: 200,
    maxHeight: 50,
  };
}

// ============================================================
//  Terrain Texture Layers (Splatmap-based)
// ============================================================

export interface TerrainLayerDef {
  id: string;
  name: string;
  /** Albedo texture asset ID (from TextureLibrary) */
  albedoTextureId: string;
  /** Normal map texture asset ID (optional) */
  normalTextureId: string;
  /** UV tiling per world unit */
  tilingU: number;
  tilingV: number;
  /** PBR properties */
  roughness: number;
  metalness: number;
}

export function defaultTerrainLayer(index: number): TerrainLayerDef {
  const names = ['Grass', 'Rock', 'Dirt', 'Sand', 'Snow', 'Gravel', 'Mud', 'Stone'];
  return {
    id: terrainUid(),
    name: names[index % names.length] || `Layer ${index}`,
    albedoTextureId: '',
    normalTextureId: '',
    tilingU: 10,
    tilingV: 10,
    roughness: 0.85,
    metalness: 0.0,
  };
}

// ============================================================
//  Foliage Types & Instances
// ============================================================

export interface FoliageTypeDef {
  id: string;
  name: string;
  /** MeshAsset ID (GLB reference) */
  meshAssetId: string;
  /** Instances per square unit when painting */
  density: number;
  /** Random scale range [min, max] */
  scaleMin: number;
  scaleMax: number;
  /** Randomise Y rotation */
  randomRotationY: boolean;
  /** Align mesh Z-up to terrain normal */
  alignToNormal: boolean;
  /** Min/max slope in degrees for placement */
  slopeMin: number;
  slopeMax: number;
}

export interface FoliageInstance {
  typeId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export function defaultFoliageType(): FoliageTypeDef {
  return {
    id: terrainUid(),
    name: 'Foliage',
    meshAssetId: '',
    density: 1.0,
    scaleMin: 0.8,
    scaleMax: 1.2,
    randomRotationY: true,
    alignToNormal: false,
    slopeMin: 0,
    slopeMax: 45,
  };
}

// ============================================================
//  Sculpt Brush Types
// ============================================================

export type SculptTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'noise';
export type PaintTool = 'paint' | 'erase';
export type FoliageTool = 'foliagePaint' | 'foliageErase';
export type TerrainMode = 'sculpt' | 'paint' | 'foliage';

export type BrushFalloff = 'linear' | 'smooth' | 'sphere' | 'tip';

export interface BrushSettings {
  radius: number;
  strength: number;
  falloff: BrushFalloff;
}

export function defaultBrushSettings(): BrushSettings {
  return {
    radius: 10,
    strength: 0.3,
    falloff: 'smooth',
  };
}

/** Compute brush falloff factor for a given distance within radius */
export function computeFalloff(distance: number, radius: number, falloff: BrushFalloff): number {
  if (distance >= radius) return 0;
  const t = distance / radius; // 0 at center, 1 at edge
  switch (falloff) {
    case 'linear':
      return 1 - t;
    case 'smooth':
      // Cosine falloff — smooth start and end
      return 0.5 * (1 + Math.cos(Math.PI * t));
    case 'sphere':
      // Spherical: sqrt(1 - t²)
      return Math.sqrt(1 - t * t);
    case 'tip':
      // Concentrated at centre — inverse quadratic
      return (1 - t) * (1 - t);
    default:
      return 1 - t;
  }
}

// ============================================================
//  Terrain Asset — Full serializable terrain data
// ============================================================

export interface TerrainAssetJSON {
  assetId: string;
  assetType: 'terrain';
  config: TerrainConfig;
  /** Base64-encoded Float32Array for the heightmap */
  heightmapBase64: string;
  /** Texture layers (max 8) */
  layers: TerrainLayerDef[];
  /** Base64-encoded Uint8Array splatmap data (RGBA channels, 4 layers per texture) */
  splatMapBase64: string[];
  /** Foliage types defined for this terrain */
  foliageTypes: FoliageTypeDef[];
  /** All foliage instances */
  foliageInstances: FoliageInstance[];
}

// ============================================================
//  Heightmap Helpers
// ============================================================

/** Create a flat heightmap filled with zeros */
export function createFlatHeightmap(resolution: number): Float32Array {
  return new Float32Array(resolution * resolution);
}

/** Create an empty splatmap (RGBA) with layer 0 fully painted */
export function createDefaultSplatmap(resolution: number): Uint8Array {
  const size = resolution * resolution * 4;
  const data = new Uint8Array(size);
  // Fill channel R (layer 0) with 255 — the base layer covers everything
  for (let i = 0; i < size; i += 4) {
    data[i] = 255;     // R = layer 0
    data[i + 1] = 0;   // G = layer 1
    data[i + 2] = 0;   // B = layer 2
    data[i + 3] = 0;   // A = layer 3
  }
  return data;
}

/** Get heightmap value at (x, z) grid coordinates */
export function getHeight(heightmap: Float32Array, resolution: number, x: number, z: number): number {
  const ix = Math.max(0, Math.min(resolution - 1, Math.round(x)));
  const iz = Math.max(0, Math.min(resolution - 1, Math.round(z)));
  return heightmap[iz * resolution + ix];
}

/** Set heightmap value at (x, z) grid coordinates */
export function setHeight(heightmap: Float32Array, resolution: number, x: number, z: number, value: number): void {
  const ix = Math.max(0, Math.min(resolution - 1, Math.round(x)));
  const iz = Math.max(0, Math.min(resolution - 1, Math.round(z)));
  heightmap[iz * resolution + ix] = Math.max(0, Math.min(1, value));
}

/** Convert world position to heightmap grid coordinates */
export function worldToGrid(
  worldX: number, worldZ: number,
  config: TerrainConfig,
): { gx: number; gz: number } {
  const halfX = config.worldSizeX / 2;
  const halfZ = config.worldSizeZ / 2;
  const gx = ((worldX + halfX) / config.worldSizeX) * (config.resolution - 1);
  const gz = ((worldZ + halfZ) / config.worldSizeZ) * (config.resolution - 1);
  return { gx, gz };
}

/** Convert heightmap grid coordinates to world position */
export function gridToWorld(
  gx: number, gz: number,
  config: TerrainConfig,
): { wx: number; wz: number } {
  const halfX = config.worldSizeX / 2;
  const halfZ = config.worldSizeZ / 2;
  const wx = (gx / (config.resolution - 1)) * config.worldSizeX - halfX;
  const wz = (gz / (config.resolution - 1)) * config.worldSizeZ - halfZ;
  return { wx, wz };
}

// ============================================================
//  Serialization Helpers (Base64 ↔ TypedArray)
// ============================================================

export function float32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

export function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================================
//  Simple 2D Perlin-like Noise (for noise sculpt tool)
// ============================================================

const _p: number[] = [];
for (let i = 0; i < 256; i++) _p[i] = i;
// Shuffle
for (let i = 255; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [_p[i], _p[j]] = [_p[j], _p[i]];
}
const _perm = [..._p, ..._p]; // duplicate for overflow

function _fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function _lerp(a: number, b: number, t: number): number { return a + t * (b - a); }
function _grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** Simple 2D Perlin noise — returns value in [-1, 1] */
export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = _fade(xf);
  const v = _fade(yf);

  const aa = _perm[_perm[X] + Y];
  const ab = _perm[_perm[X] + Y + 1];
  const ba = _perm[_perm[X + 1] + Y];
  const bb = _perm[_perm[X + 1] + Y + 1];

  return _lerp(
    _lerp(_grad(aa, xf, yf), _grad(ba, xf - 1, yf), u),
    _lerp(_grad(ab, xf, yf - 1), _grad(bb, xf - 1, yf - 1), u),
    v,
  );
}
