// ============================================================
//  TilemapData — Data structures for tilesets and tilemaps
// ============================================================

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
  image?: HTMLImageElement;
  /** Base-64 data URL of the source image — persisted so tilesets survive save/load */
  imageDataUrl?: string;
}

export interface TileDefData {
  tileId: number;
  tags: string[];
  collision: 'none' | 'full' | 'top' | 'bottom' | 'left' | 'right';
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

export function createDefaultTilemap(name: string, tilesetId: string): TilemapAsset {
  return {
    assetId: `tilemap-${Date.now().toString(36)}`,
    assetType: 'tilemap',
    assetName: name,
    tilesetId,
    pixelsPerUnit: 100,
    layers: [
      { layerId: 'layer-bg', name: 'Background', z: 0, visible: true, locked: false, hasCollision: false, tiles: {} },
      { layerId: 'layer-ground', name: 'Ground', z: 10, visible: true, locked: false, hasCollision: true, tiles: {} },
      { layerId: 'layer-deco', name: 'Decoration', z: 15, visible: true, locked: false, hasCollision: false, tiles: {} },
      { layerId: 'layer-fg', name: 'Foreground', z: 70, visible: true, locked: false, hasCollision: false, tiles: {} },
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
      const tileId = tiles[key];
      // When forceFullCollision is true (layer.hasCollision = true) every placed
      // tile is solid — no need to look up per-tile collision flags.
      // When false we respect individual TileDefData settings (used for
      // mixed-collision tilesets, one-way platforms, etc.).
      if (!forceFullCollision) {
        const tileDef = tileset.tiles.find(t => t.tileId === tileId) ?? tileset.tiles[tileId];
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
  }
}
