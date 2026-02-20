// ============================================================
//  TilemapRenderer — Renders TilemapAsset layers into THREE.js
//  meshes using instanced sprite quads from the tileset texture.
//  Attaches to Scene2DManager.root2D.
// ============================================================

import * as THREE from 'three';
import type { TilemapAsset, TilemapLayer, TilesetAsset } from '../engine/TilemapData';

/**
 * Manages THREE.js mesh objects for a single TilemapAsset.
 * Each visible layer gets its own Mesh with InstancedBufferGeometry
 * (or a simple PlaneGeometry per tile for simplicity / correctness).
 */
export class TilemapRenderer {
  private _root: THREE.Group;
  private _layerGroups = new Map<string, THREE.Group>();
  private _textureCache = new Map<string, THREE.Texture>();
  private _tilemap: TilemapAsset | null = null;
  private _tileset: TilesetAsset | null = null;

  constructor(parentGroup: THREE.Group) {
    this._root = new THREE.Group();
    this._root.name = '__TilemapRenderer__';
    parentGroup.add(this._root);
  }

  /** Set the active tilemap + tileset and rebuild all layers */
  setTilemap(tilemap: TilemapAsset | null, tileset: TilesetAsset | null): void {
    this._tilemap = tilemap;
    this._tileset = tileset;
    this.rebuildAll();
  }

  /** Full rebuild of all layer meshes */
  rebuildAll(): void {
    // Clear existing
    for (const [, group] of this._layerGroups) {
      this._root.remove(group);
      this._disposeGroup(group);
    }
    this._layerGroups.clear();

    if (!this._tilemap || !this._tileset) return;

    for (const layer of this._tilemap.layers) {
      this._buildLayer(layer);
    }
  }

  /** Rebuild a single layer (after painting) */
  rebuildLayer(layerId: string): void {
    if (!this._tilemap || !this._tileset) return;

    // Remove old
    const existing = this._layerGroups.get(layerId);
    if (existing) {
      this._root.remove(existing);
      this._disposeGroup(existing);
      this._layerGroups.delete(layerId);
    }

    const layer = this._tilemap.layers.find(l => l.layerId === layerId);
    if (layer) this._buildLayer(layer);
  }

  /** Build THREE.js meshes for one layer */
  private _buildLayer(layer: TilemapLayer): void {
    if (!this._tileset) return;

    const group = new THREE.Group();
    group.name = `TilemapLayer_${layer.name}`;
    group.visible = layer.visible;
    // Use layer.z for render ordering via position.z
    group.position.z = layer.z * 0.001; // Small z offset to separate layers

    const ts = this._tileset;
    const texture = this._getTexture(ts);
    if (!texture) {
      console.warn('[TilemapRenderer] No texture for tileset %s (image=%s)', ts.assetId, !!ts.image);
      this._layerGroups.set(layer.layerId, group);
      this._root.add(group);
      return;
    }

    const tileCount = Object.keys(layer.tiles).length;
    console.log('[TilemapRenderer] Building layer "%s" — %d tiles, texture=%dx%d, ppu=%d',
      layer.name, tileCount, ts.textureWidth, ts.textureHeight, ts.pixelsPerUnit);

    const ppu = ts.pixelsPerUnit || 100;
    const tileWorldW = ts.tileWidth / ppu;
    const tileWorldH = ts.tileHeight / ppu;

    // UV dimensions for a single tile in the atlas
    const uvTileW = ts.tileWidth / ts.textureWidth;
    const uvTileH = ts.tileHeight / ts.textureHeight;

    const tileKeys = Object.keys(layer.tiles);
    if (tileKeys.length === 0) {
      this._layerGroups.set(layer.layerId, group);
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

      // UV coordinates for this tile in the atlas
      const tileCol = tileId % ts.columns;
      const tileRow = Math.floor(tileId / ts.columns);
      const u0 = tileCol * uvTileW;
      const v0 = 1 - (tileRow + 1) * uvTileH; // Flip Y for THREE.js UV
      const u1 = u0 + uvTileW;
      const v1 = v0 + uvTileH;

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
    mesh.name = `tiles_${layer.name}`;
    mesh.renderOrder = layer.z;
    mesh.frustumCulled = false;
    group.add(mesh);

    this._layerGroups.set(layer.layerId, group);
    this._root.add(group);
  }

  /** Update layer visibility (when toggling in the layer list) */
  updateLayerVisibility(layerId: string, visible: boolean): void {
    const group = this._layerGroups.get(layerId);
    if (group) group.visible = visible;
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
