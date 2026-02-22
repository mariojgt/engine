// ============================================================
//  TilemapRenderer — Renders TilemapAsset layers into THREE.js
//  meshes using instanced sprite quads from the tileset texture.
//  Attaches to Scene2DManager.root2D.
//
//  Supports rendering MULTIPLE tilemaps simultaneously so that
//  tiles from different tilesets coexist on the same scene.
//  Each tilemap/layer combination gets its own THREE.Group.
// ============================================================

import * as THREE from 'three';
import type { TilemapAsset, TilemapLayer, TilesetAsset } from '../engine/TilemapData';

/**
 * Manages THREE.js mesh objects for one or more TilemapAssets.
 * Each visible layer of each tilemap gets its own Mesh with merged
 * geometry for performance.
 */
export class TilemapRenderer {
  private _root: THREE.Group;

  /**
   * Layer groups keyed by a composite key: `${tilemapId}::${layerId}`.
   * This ensures layers from different tilemaps never collide.
   */
  private _layerGroups = new Map<string, THREE.Group>();
  private _textureCache = new Map<string, THREE.Texture>();

  /** All registered tilemaps (keyed by assetId) */
  private _tilemaps = new Map<string, TilemapAsset>();
  /** Tileset lookup (keyed by assetId) */
  private _tilesets = new Map<string, TilesetAsset>();

  constructor(parentGroup: THREE.Group) {
    this._root = new THREE.Group();
    this._root.name = '__TilemapRenderer__';
    parentGroup.add(this._root);
  }

  // ------------------------------------------------------------------
  //  Legacy single-tilemap API (backwards-compatible)
  // ------------------------------------------------------------------

  /** Set a single tilemap + tileset (clears everything else). */
  setTilemap(tilemap: TilemapAsset | null, tileset: TilesetAsset | null): void {
    this._tilemaps.clear();
    this._tilesets.clear();
    if (tilemap && tileset) {
      this._tilemaps.set(tilemap.assetId, tilemap);
      this._tilesets.set(tileset.assetId, tileset);
    }
    this.rebuildAll();
  }

  // ------------------------------------------------------------------
  //  Multi-tilemap API
  // ------------------------------------------------------------------

  /** Register / update all tilemaps and tilesets and rebuild the scene. */
  setAllTilemaps(tilemaps: TilemapAsset[], tilesets: TilesetAsset[]): void {
    this._tilemaps.clear();
    this._tilesets.clear();
    for (const tm of tilemaps) this._tilemaps.set(tm.assetId, tm);
    for (const ts of tilesets) this._tilesets.set(ts.assetId, ts);
    this.rebuildAll();
  }

  /** Add or update a single tilemap (and its tileset). Rebuilds only that tilemap. */
  addOrUpdateTilemap(tilemap: TilemapAsset, tileset: TilesetAsset): void {
    this._tilemaps.set(tilemap.assetId, tilemap);
    this._tilesets.set(tileset.assetId, tileset);
    this._rebuildTilemap(tilemap);
  }

  // ------------------------------------------------------------------
  //  Full rebuild
  // ------------------------------------------------------------------

  /** Full rebuild of all layer meshes for every registered tilemap. */
  rebuildAll(): void {
    console.log('[TilemapRenderer.rebuildAll] START — %d tilemaps, %d tilesets, %d cached textures, %d layer groups',
      this._tilemaps.size, this._tilesets.size, this._textureCache.size, this._layerGroups.size);

    // Clear existing layer geometry
    for (const [, group] of this._layerGroups) {
      this._root.remove(group);
      this._disposeGroup(group);
    }
    this._layerGroups.clear();

    // Selectively invalidate texture cache — only dispose textures whose
    // source image has changed (or whose tileset is no longer registered).
    // Previously the cache was flushed on every rebuild, which caused
    // tiles from other tilesets to vanish when their image couldn't be
    // immediately recreated (e.g. if the SM's tileset copy lacked .image).
    for (const [id, tex] of this._textureCache) {
      const ts = this._tilesets.get(id);
      if (!ts || !ts.image || (tex.image !== ts.image)) {
        console.log('[TilemapRenderer.rebuildAll]   disposing cached texture for %s (ts=%s, hasImage=%s, sameImage=%s)',
          id, !!ts, !!ts?.image, ts?.image ? tex.image === ts.image : 'N/A');
        tex.dispose();
        this._textureCache.delete(id);
      }
    }

    for (const [, tilemap] of this._tilemaps) {
      const tileset = this._tilesets.get(tilemap.tilesetId);
      if (!tileset) {
        console.warn('[TilemapRenderer.rebuildAll]   SKIP tilemap "%s" — no tileset found for id=%s', tilemap.assetName, tilemap.tilesetId);
        continue;
      }
      if (!tileset.image) {
        console.warn('[TilemapRenderer.rebuildAll]   SKIP tilemap "%s" — tileset "%s" has no .image', tilemap.assetName, tileset.assetName);
      }
      for (const layer of tilemap.layers) {
        this._buildLayer(tilemap, layer, tileset);
      }
    }

    console.log('[TilemapRenderer.rebuildAll] DONE — %d layer groups in scene', this._layerGroups.size);
  }

  /** Rebuild all layers for a specific tilemap. */
  private _rebuildTilemap(tilemap: TilemapAsset): void {
    // Remove old groups for this tilemap
    for (const layer of tilemap.layers) {
      const key = `${tilemap.assetId}::${layer.layerId}`;
      const existing = this._layerGroups.get(key);
      if (existing) {
        this._root.remove(existing);
        this._disposeGroup(existing);
        this._layerGroups.delete(key);
      }
    }

    const tileset = this._tilesets.get(tilemap.tilesetId);
    if (!tileset) return;

    for (const layer of tilemap.layers) {
      this._buildLayer(tilemap, layer, tileset);
    }
  }

  // ------------------------------------------------------------------
  //  Single-layer rebuild (after painting)
  // ------------------------------------------------------------------

  /**
   * Rebuild a single layer (after painting).
   * When tilemapId is provided, targets exactly that tilemap's layer.
   * Otherwise searches all registered tilemaps (legacy compat).
   */
  rebuildLayer(layerId: string, tilemapId?: string): void {
    const candidates = tilemapId
      ? [this._tilemaps.get(tilemapId)].filter(Boolean) as TilemapAsset[]
      : Array.from(this._tilemaps.values());

    for (const tilemap of candidates) {
      const layer = tilemap.layers.find(l => l.layerId === layerId);
      if (!layer) continue;

      const key = `${tilemap.assetId}::${layerId}`;
      const existing = this._layerGroups.get(key);
      if (existing) {
        this._root.remove(existing);
        this._disposeGroup(existing);
        this._layerGroups.delete(key);
      }

      const tileset = this._tilesets.get(tilemap.tilesetId);
      if (tileset) this._buildLayer(tilemap, layer, tileset);
      // If a specific tilemap was targeted, we're done
      if (tilemapId) return;
    }
  }

  // ------------------------------------------------------------------
  //  Layer building
  // ------------------------------------------------------------------

  /** Build THREE.js meshes for one layer of a specific tilemap. */
  private _buildLayer(tilemap: TilemapAsset, layer: TilemapLayer, ts: TilesetAsset): void {
    const compositeKey = `${tilemap.assetId}::${layer.layerId}`;

    const group = new THREE.Group();
    group.name = `TilemapLayer_${tilemap.assetName}_${layer.name}`;
    group.visible = layer.visible;
    // Use layer.z for render ordering via position.z
    group.position.z = layer.z * 0.001; // Small z offset to separate layers

    const texture = this._getTexture(ts);
    if (!texture) {
      console.warn('[TilemapRenderer] No texture for tileset %s (image=%s)', ts.assetId, !!ts.image);
      this._layerGroups.set(compositeKey, group);
      this._root.add(group);
      return;
    }

    // Use the ACTUAL image dimensions for UV calculations rather than the
    // stored textureWidth/textureHeight — this prevents stale values after
    // save/load from causing stretched tiles.
    const actualW = ts.image!.naturalWidth || ts.textureWidth;
    const actualH = ts.image!.naturalHeight || ts.textureHeight;
    const actualCols = Math.floor(actualW / ts.tileWidth) || ts.columns;

    const tileCount = Object.keys(layer.tiles).length;
    console.log('[TilemapRenderer] Building layer "%s" (tilemap "%s") — %d tiles, texture=%dx%d (actual %dx%d), ppu=%d',
      layer.name, tilemap.assetName, tileCount, ts.textureWidth, ts.textureHeight, actualW, actualH, ts.pixelsPerUnit);

    const ppu = ts.pixelsPerUnit || 100;
    const tileWorldW = ts.tileWidth / ppu;
    const tileWorldH = ts.tileHeight / ppu;

    // UV dimensions for a single tile in the atlas — based on actual image size
    const uvTileW = ts.tileWidth / actualW;
    const uvTileH = ts.tileHeight / actualH;

    // Half-texel inset to prevent atlas bleeding at tile edges.
    // Without this, GPU sampling can pick up slivers of adjacent tiles
    // causing visible seams and stretched-looking artifacts.
    const halfTexelU = 0.5 / actualW;
    const halfTexelV = 0.5 / actualH;

    const tileKeys = Object.keys(layer.tiles);
    if (tileKeys.length === 0) {
      this._layerGroups.set(compositeKey, group);
      this._root.add(group);
      return;
    }

    // Batch all tiles into a single merged geometry for performance
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (const key of tileKeys) {
      const tileId = layer.tiles[key];
      const [cx, cy] = key.split(',').map(Number);

      // World position of tile (bottom-left corner)
      const wx = cx * tileWorldW;
      const wy = cy * tileWorldH;

      // UV coordinates for this tile in the atlas (using actual dimensions)
      const tileCol = tileId % actualCols;
      const tileRow = Math.floor(tileId / actualCols);
      // Base UVs — flipY=true (THREE.js default): v=0→bottom, v=1→top of original
      const u0 = tileCol * uvTileW + halfTexelU;
      const v0 = 1 - (tileRow + 1) * uvTileH + halfTexelV;
      const u1 = (tileCol + 1) * uvTileW - halfTexelU;
      const v1 = 1 - tileRow * uvTileH - halfTexelV;

      // 4 vertices (quad)
      // Bottom-left
      positions.push(wx, wy, 0);
      uvs.push(u0, v0);
      // Bottom-right
      positions.push(wx + tileWorldW, wy, 0);
      uvs.push(u1, v0);
      // Top-right
      positions.push(wx + tileWorldW, wy + tileWorldH, 0);
      uvs.push(u1, v1);
      // Top-left
      positions.push(wx, wy + tileWorldH, 0);
      uvs.push(u0, v1);

      // Two triangles
      indices.push(
        vertexOffset, vertexOffset + 1, vertexOffset + 2,
        vertexOffset, vertexOffset + 2, vertexOffset + 3,
      );
      vertexOffset += 4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `tiles_${tilemap.assetName}_${layer.name}`;
    mesh.renderOrder = layer.z;
    mesh.frustumCulled = false;
    group.add(mesh);

    this._layerGroups.set(compositeKey, group);
    this._root.add(group);
  }

  /** Update layer visibility (when toggling in the layer list) */
  updateLayerVisibility(layerId: string, visible: boolean): void {
    // Check all tilemaps for this layer
    for (const [key, group] of this._layerGroups) {
      if (key.endsWith(`::${layerId}`)) {
        group.visible = visible;
      }
    }
  }

  /** Get or create a THREE.Texture from the tileset's HTMLImageElement */
  private _getTexture(ts: TilesetAsset): THREE.Texture | null {
    // Check cache FIRST — texture may have been created from a previous call
    // when ts.image was available (image can be lost after serialization)
    let tex = this._textureCache.get(ts.assetId);
    if (tex) return tex;

    if (!ts.image) return null;

    tex = new THREE.Texture(ts.image);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    // Explicit: flipY=true matches our UV math (v=0→bottom, v=1→top)
    tex.flipY = true;
    // Clamp to edge prevents wrapping artifacts at atlas border
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this._textureCache.set(ts.assetId, tex);
    return tex;
  }

  /** Dispose a group and its children's geometry/materials */
  private _disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        } else if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        }
      }
    });
  }

  /** Remove everything and detach from parent */
  dispose(): void {
    for (const [, group] of this._layerGroups) {
      this._root.remove(group);
      this._disposeGroup(group);
    }
    this._layerGroups.clear();
    for (const [, tex] of this._textureCache) tex.dispose();
    this._textureCache.clear();
    this._root.parent?.remove(this._root);
  }
}
