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
   */
  mergeRects(tiles: Record<string, number>, tileset: TilesetAsset): MergedRect[] {
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
      const tileDef = tileset.tiles[tileId];
      if (!tileDef || tileDef.collision === 'none') continue;
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
    if (!layer.hasCollision) return;

    const merged = this.mergeRects(layer.tiles, tileset);
    const ppu = tileset.pixelsPerUnit || 100;

    for (const rect of merged) {
      const w = rect.cols * (tileset.tileWidth / ppu);
      const h = rect.rows * (tileset.tileHeight / ppu);
      const cx = rect.x * (tileset.tileWidth / ppu) + w / 2;
      const cy = rect.y * (tileset.tileHeight / ppu) + h / 2;
      physics2DWorld.addStaticBox(layer.layerId, cx, cy, w, h);
    }
  }
}
