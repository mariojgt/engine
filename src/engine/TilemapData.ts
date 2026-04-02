// ============================================================
//  TilemapData — Data structures for tilesets and tilemaps
// ============================================================

// ============================================================
//  Animated Tiles — A sequence of tile IDs that cycle at runtime.
//  Encoded in layer.tiles as negative IDs: -(animIndex + 1).
//  E.g. the first animated tile (index 0) is stored as -1.
// ============================================================

/** Minimum ID value used for animated tile encoding (negative). */
export const ANIMATED_TILE_OFFSET = -1;

/** Convert an animatedTiles array index to the value stored in layer.tiles */
export function encodeAnimatedTileId(animIndex: number): number {
  return -(animIndex + 1);
}

/** Convert a layer.tiles value back to an animatedTiles array index. Returns -1 if not animated. */
export function decodeAnimatedTileIndex(tileId: number): number {
  return tileId < 0 ? -(tileId + 1) : -1;
}

/** Returns true if the tile value represents an animated tile. */
export function isAnimatedTileId(tileId: number): boolean {
  return tileId < 0;
}

/** A single animated tile definition: a named sequence of frames from the tileset atlas. */
export interface AnimatedTileDef {
  /** Display name for the animated tile */
  name: string;
  /** Ordered list of regular tileIds from the tileset that form the animation frames */
  frames: number[];
  /** Duration of each frame in milliseconds */
  frameDurationMs: number;
  /** Whether the animation loops. Defaults to true. */
  loop: boolean;
}

// ============================================================
//  Tile Transform Encoding — flip & rotation packed into tileId
//
//  For normal (non-animated) tiles the stored integer packs:
//    Bits  0–20 : base tileId  (supports up to ~2 million tiles)
//    Bit  28    : flipX
//    Bit  29    : flipY
//    Bits 30–31 : rotation  (0=0°, 1=90°, 2=180°, 3=270°)
//
//  Animated tiles remain negative and have NO transform bits.
//  This is backward-compatible: old data has 0 in the high bits,
//  so decodeTileId returns the original ID unchanged.
// ============================================================

const TILE_ID_MASK   = 0x001FFFFF; // bits 0-20
const FLIP_X_BIT     = 1 << 28;
const FLIP_Y_BIT     = 1 << 29;
const ROTATION_SHIFT = 30;
const ROTATION_MASK  = 0x3; // 2 bits

/** Encode a tile value with optional flip/rotation transforms */
export function encodeTileValue(
  tileId: number,
  flipX = false,
  flipY = false,
  rotation = 0, // 0, 90, 180, 270
): number {
  // Animated tiles (negative) are stored as-is — no transforms
  if (tileId < 0) return tileId;
  let val = tileId & TILE_ID_MASK;
  if (flipX) val |= FLIP_X_BIT;
  if (flipY) val |= FLIP_Y_BIT;
  const rotIndex = Math.round(((rotation % 360) + 360) % 360 / 90) & ROTATION_MASK;
  val |= (rotIndex << ROTATION_SHIFT);
  return val;
}

/** Decode a stored tile value into its components */
export function decodeTileValue(val: number): {
  tileId: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number; // 0, 90, 180, 270
} {
  // Animated tiles (negative) — no transforms
  if (val < 0) return { tileId: val, flipX: false, flipY: false, rotation: 0 };
  return {
    tileId:   val & TILE_ID_MASK,
    flipX:    (val & FLIP_X_BIT) !== 0,
    flipY:    (val & FLIP_Y_BIT) !== 0,
    rotation: ((val >>> ROTATION_SHIFT) & ROTATION_MASK) * 90,
  };
}

/** Extract just the base tileId (strips transform bits) */
export function baseTileId(val: number): number {
  if (val < 0) return val; // animated
  return val & TILE_ID_MASK;
}

// ============================================================
//  Auto-Tile (Bitmask) System
//
//  Uses a simplified 4-bit bitmask for cardinal neighbors:
//    bit 0 = north, bit 1 = east, bit 2 = south, bit 3 = west
//  This gives 16 possible combinations (0–15), each mapping to
//  a specific tile in the auto-tile set.
//
//  For a 47-tile "blob" set, 8 bits (including diagonals) are used,
//  but we start with 16-tile for maximum compatibility.
// ============================================================

export interface AutoTileRule {
  /** Unique ID for this auto-tile rule set */
  id: string;
  /** Display name */
  name: string;
  /**
   * Mapping from 4-bit bitmask (0-15) to tileId in the tileset.
   * Index = bitmask value, value = tileId to render.
   * Example: index 0 = isolated tile (no neighbors), index 15 = surrounded on all 4 sides.
   */
  bitmaskToTileId: (number | null)[];
  /** The set of tileIds that are considered "same terrain" for neighbor matching */
  memberTileIds: number[];
}

export interface TilesetAsset {
  assetId: string;
  assetType: 'tileset';
  assetName: string;
  sourceTexture: string;
  textureWidth: number;
  textureHeight: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  pixelsPerUnit: number;
  tiles: TileDefData[];
  /** Animated tile definitions. Index in this array is used with encodeAnimatedTileId(). */
  animatedTiles?: AnimatedTileDef[];
  /** Auto-tile rule sets for bitmask-based auto-tiling */
  autoTileRules?: AutoTileRule[];
  image?: HTMLImageElement;
  /** Base-64 data URL of the source image — persisted so tilesets survive save/load */
  imageDataUrl?: string;
  /** Relative path to the image file in the project directory */
  imagePath?: string;
}

export interface TileDefData {
  tileId: number;
  tags: string[];
  /**
   * Collision shape for this tile:
   *   none        — no physics body
   *   full        — solid box covering the whole tile
   *   top/bottom/left/right — half-box on that edge (ledge/wall)
   *   slope-left  — ramp rising toward the LEFT  ( /| shape )
   *   slope-right — ramp rising toward the RIGHT ( |\ shape )
   *   platform    — one-way thin ledge at the TOP of the tile
   */
  collision: 'none' | 'full' | 'top' | 'bottom' | 'left' | 'right' | 'slope-left' | 'slope-right' | 'platform';
  /** Additional user-defined physics shape (overrides collision field when set) */
  physicsShape?: 'box' | 'slope-left' | 'slope-right' | 'platform';
}

export interface TilemapLayer {
  layerId: string;
  name: string;
  z: number;
  visible: boolean;
  locked: boolean;
  hasCollision: boolean;
  tiles: Record<string, number>; // "x,y" → tileId
}

export interface TilemapAsset {
  assetId: string;
  assetType: 'tilemap';
  assetName: string;
  tilesetId: string;
  pixelsPerUnit: number;
  layers: TilemapLayer[];
}

/**
 * Compute the 4-bit bitmask for a cell based on cardinal neighbors.
 * bit 0 (1) = north has same-terrain tile
 * bit 1 (2) = east  has same-terrain tile
 * bit 2 (4) = south has same-terrain tile
 * bit 3 (8) = west  has same-terrain tile
 */
export function computeAutoTileBitmask(
  x: number,
  y: number,
  tiles: Record<string, number>,
  memberSet: Set<number>,
): number {
  let mask = 0;
  // North (y-1 in screen coords where y increases downward)
  const n = tiles[`${x},${y - 1}`];
  if (n !== undefined && memberSet.has(baseTileId(n))) mask |= 1;
  // East
  const e = tiles[`${x + 1},${y}`];
  if (e !== undefined && memberSet.has(baseTileId(e))) mask |= 2;
  // South
  const s = tiles[`${x},${y + 1}`];
  if (s !== undefined && memberSet.has(baseTileId(s))) mask |= 4;
  // West
  const w = tiles[`${x - 1},${y}`];
  if (w !== undefined && memberSet.has(baseTileId(w))) mask |= 8;
  return mask;
}

/**
 * After painting/erasing at (cx, cy), re-evaluate auto-tile for
 * the painted cell and its 4 cardinal neighbors.
 * Returns the set of "x,y" keys that were modified.
 */
export function applyAutoTile(
  cx: number,
  cy: number,
  tiles: Record<string, number>,
  rule: AutoTileRule,
): Set<string> {
  const changed = new Set<string>();
  const memberSet = new Set(rule.memberTileIds);
  // Check the cell itself + 4 neighbors
  const toCheck = [
    [cx, cy], [cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy],
  ];
  for (const [x, y] of toCheck) {
    const key = `${x},${y}`;
    const existing = tiles[key];
    if (existing === undefined) continue;
    const base = baseTileId(existing);
    if (!memberSet.has(base)) continue;
    const mask = computeAutoTileBitmask(x, y, tiles, memberSet);
    const resolved = rule.bitmaskToTileId[mask];
    if (resolved == null) continue;
    // Preserve any existing flip/rotation transforms
    const { flipX, flipY, rotation } = decodeTileValue(existing);
    const newVal = encodeTileValue(resolved, flipX, flipY, rotation);
    if (tiles[key] !== newVal) {
      tiles[key] = newVal;
      changed.add(key);
    }
  }
  return changed;
}

export function createDefaultTilemap(name: string, tilesetId: string): TilemapAsset {
  // Generate unique layer IDs per tilemap so that multiple tilemaps can
  // coexist without layer-ID collisions (critical for rebuildLayer targeting).
  const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    assetId: `tilemap-${uid}`,
    assetType: 'tilemap',
    assetName: name,
    tilesetId,
    pixelsPerUnit: 100,
    layers: [
      { layerId: `layer-bg-${uid}`, name: 'Background', z: 0, visible: true, locked: false, hasCollision: false, tiles: {} },
      { layerId: `layer-ground-${uid}`, name: 'Ground', z: 10, visible: true, locked: false, hasCollision: true, tiles: {} },
      { layerId: `layer-deco-${uid}`, name: 'Decoration', z: 15, visible: true, locked: false, hasCollision: false, tiles: {} },
      { layerId: `layer-fg-${uid}`, name: 'Foreground', z: 70, visible: true, locked: false, hasCollision: false, tiles: {} },
    ],
  };
}

/**
 * Create a TilesetAsset from an already-loaded HTMLImageElement.
 * Generates TileDefData entries for every tile in the grid.
 */
export function createTilesetFromImage(
  name: string,
  image: HTMLImageElement,
  tileWidth: number,
  tileHeight: number,
  ppu = 100,
): TilesetAsset {
  const columns = Math.floor(image.naturalWidth / tileWidth);
  const rows = Math.floor(image.naturalHeight / tileHeight);
  const totalTiles = columns * rows;

  const tiles: TileDefData[] = [];
  for (let i = 0; i < totalTiles; i++) {
    tiles.push({ tileId: i, tags: [], collision: 'none' });
  }

  return {
    assetId: `tileset-${Date.now().toString(36)}`,
    assetType: 'tileset',
    assetName: name,
    sourceTexture: name,
    textureWidth: image.naturalWidth,
    textureHeight: image.naturalHeight,
    tileWidth,
    tileHeight,
    columns,
    rows,
    pixelsPerUnit: ppu,
    tiles,
    image,
  };
}

// ============================================================
//  TilemapCollisionBuilder — Greedy rect merge for fewest
//  possible Rapier2D static bodies.
// ============================================================

export interface MergedRect {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

export class TilemapCollisionBuilder {
  /**
   * Greedy rectangle merge: scans tiles left→right, top→bottom,
   * extends rectangles greedily to minimize collider count.
   *
   * @param forceFullCollision  When true, every tile in the layer is treated
   *   as solid regardless of its TileDefData.collision value.  Pass this when
   *   the layer's hasCollision flag is true — it avoids the need to mutate
   *   every TileDefData in the tileset just to make physics work.
   */
  mergeRects(tiles: Record<string, number>, tileset: TilesetAsset, forceFullCollision = false): MergedRect[] {
    const result: MergedRect[] = [];
    if (Object.keys(tiles).length === 0) return result;

    // Find bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const key of Object.keys(tiles)) {
      const [x, y] = key.split(',').map(Number);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    // Build grid of collidable tiles
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const used = new Array(w * h).fill(false);
    const solid = new Array(w * h).fill(false);

    for (const key of Object.keys(tiles)) {
      const [x, y] = key.split(',').map(Number);
      const rawVal = tiles[key];
      const tileId = baseTileId(rawVal);
      // Slopes and platforms are ALWAYS emitted individually in rebuild().
      // They must never enter the greedy-merge grid or they produce wrong box shapes.
      const tileDef = tileset.tiles.find(t => t.tileId === tileId) ?? tileset.tiles[tileId];
      const tileCol = tileDef?.physicsShape ?? tileDef?.collision;
      if (tileCol === 'slope-left' || tileCol === 'slope-right' || tileCol === 'platform') continue;

      // When forceFullCollision is true (layer.hasCollision = true) every placed
      // tile is solid — no need to look up per-tile collision flags.
      // When false we respect individual TileDefData settings (used for
      // mixed-collision tilesets, one-way platforms, etc.).
      if (!forceFullCollision) {
        if (!tileDef || tileDef.collision === 'none') continue;
      }
      const idx = (y - minY) * w + (x - minX);
      solid[idx] = true;
    }

    // Greedy merge
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const idx = gy * w + gx;
        if (!solid[idx] || used[idx]) continue;

        // Extend width
        let cols = 0;
        while (gx + cols < w && solid[gy * w + gx + cols] && !used[gy * w + gx + cols]) cols++;

        // Extend height
        let rows = 1;
        outer: while (gy + rows < h) {
          for (let c = 0; c < cols; c++) {
            const ci = (gy + rows) * w + gx + c;
            if (!solid[ci] || used[ci]) break outer;
          }
          rows++;
        }

        // Mark used
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            used[(gy + r) * w + gx + c] = true;
          }
        }

        result.push({ x: minX + gx, y: minY + gy, cols, rows });
      }
    }

    return result;
  }

  rebuild(layer: TilemapLayer, physics2DWorld: any, tileset: TilesetAsset): void {
    physics2DWorld.removeLayerBodies(layer.layerId);

    // Determine collision mode:
    //   layer.hasCollision = true  → every placed tile is solid (forceFullCollision)
    //   layer.hasCollision = false → only tiles whose TileDefData.collision !== 'none' get bodies
    //     This allows per-tile 'full' collision to work on any layer, including Background.
    //     Previously an early return here meant the Background layer ALWAYS produced zero
    //     Rapier bodies, making per-tile collision flags completely invisible to the engine.
    const forceAll = layer.hasCollision;
    const merged = this.mergeRects(layer.tiles, tileset, forceAll);

    if (merged.length === 0) {
      // Only log a warning when there are tiles but none ended up solid
      if (Object.keys(layer.tiles).length > 0) {
        console.log('[TilemapCollisionBuilder] Layer "%s" — 0 solid rects (hasCollision=%s, tiles=%d). ' +
          'Set layer hasCollision ON or set individual tile collision to \'full\' in the tile palette.',
          layer.name, layer.hasCollision, Object.keys(layer.tiles).length);
      }
      return;
    }

    const ppu = tileset.pixelsPerUnit || 100;
    console.log('[TilemapCollisionBuilder] Layer "%s" — merged %d rects from %d tiles (forceAll=%s, ppu=%d, tileW=%d, tileH=%d)',
      layer.name, merged.length, Object.keys(layer.tiles).length, forceAll, ppu, tileset.tileWidth, tileset.tileHeight);

    for (const rect of merged) {
      const w = rect.cols * (tileset.tileWidth / ppu);
      const h = rect.rows * (tileset.tileHeight / ppu);
      const cx = rect.x * (tileset.tileWidth / ppu) + w / 2;
      const cy = rect.y * (tileset.tileHeight / ppu) + h / 2;
      physics2DWorld.addStaticBox(layer.layerId, cx, cy, w, h);
    }

    // ---- Second pass: individual slope / platform tiles ----
    // These were excluded from greedy-merge and need their own shaped colliders.
    const tw = tileset.tileWidth  / ppu;
    const th = tileset.tileHeight / ppu;
    for (const [key, rawVal] of Object.entries(layer.tiles)) {
      const [tx, ty] = key.split(',').map(Number);
      const tileId = baseTileId(rawVal);
      const def = tileset.tiles.find(t => t.tileId === tileId) ?? tileset.tiles[tileId];
      if (!def) continue;
      const shape = def.physicsShape ?? def.collision;
      const bx = tx * tw;  // tile origin X (world units)
      const by = ty * th;  // tile origin Y (world units)

      if (shape === 'slope-left') {
        // Ramp rising toward left:  top-left vertex is the apex
        //   (bx, by)        ← apex
        //   (bx+tw, by+th)  ← bottom-right
        //   (bx,    by+th)  ← bottom-left
        physics2DWorld.addStaticTriangle(
          layer.layerId,
          bx,      by,
          bx + tw, by + th,
          bx,      by + th,
        );
      } else if (shape === 'slope-right') {
        // Ramp rising toward right: top-right vertex is the apex
        //   (bx,    by+th)  ← bottom-left
        //   (bx+tw, by)     ← apex
        //   (bx+tw, by+th)  ← bottom-right
        physics2DWorld.addStaticTriangle(
          layer.layerId,
          bx,      by + th,
          bx + tw, by,
          bx + tw, by + th,
        );
      } else if (shape === 'platform') {
        // One-way thin ledge at the top of the tile (15% height)
        const platH = th * 0.15;
        physics2DWorld.addStaticBox(
          layer.layerId,
          bx + tw / 2,
          by + platH / 2,
          tw,
          platH,
        );
      }
    }
  }
}
