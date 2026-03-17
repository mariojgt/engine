// ============================================================
//  TerrainActor — Scene composition actor for 3D terrain
//
//  Extends BaseSceneActor so it integrates with the existing
//  SceneCompositionManager, World Outliner, Properties Panel,
//  gizmo system, and scene serialization.
//
//  Owns:
//   • The heightmap Float32Array
//   • The splatmap Uint8Array(s)
//   • The Three.js PlaneGeometry (displaced by heightmap)
//   • The TerrainShaderMaterial (multi-layer splatting)
//   • Foliage type definitions + instance data
// ============================================================

import * as THREE from 'three';
import {
  type SceneActorType,
  type SceneActorJSON,
  type GizmoCapability,
  type PropertyDescriptor,
  BaseSceneActor,
} from './SceneActors';
import {
  type TerrainConfig,
  type TerrainLayerDef,
  type TerrainAssetJSON,
  type FoliageTypeDef,
  type FoliageInstance,
  type BrushSettings,
  type SculptTool,
  type BrushFalloff,
  defaultTerrainConfig,
  defaultTerrainLayer,
  createFlatHeightmap,
  createDefaultSplatmap,
  terrainUid,
  worldToGrid,
  gridToWorld,
  getHeight,
  setHeight,
  computeFalloff,
  noise2D,
  float32ToBase64,
  base64ToFloat32,
  uint8ToBase64,
  base64ToUint8,
} from '../../engine/TerrainData';
import { TerrainShaderMaterial, createDefaultGrayTexture } from '../../engine/TerrainShaderMaterial';
import type { MeshAssetManager } from '../MeshAsset';
import { loadMeshFromAsset } from '../MeshImporter';

// ============================================================
//  TerrainActor
// ============================================================

export class TerrainActor extends BaseSceneActor {
  readonly type: SceneActorType = 'Terrain' as SceneActorType;

  // ---- Core data ----
  public config: TerrainConfig;
  public heightmap: Float32Array;
  public layers: TerrainLayerDef[] = [];
  public splatmaps: Uint8Array[] = [];
  public foliageTypes: FoliageTypeDef[] = [];
  public foliageInstances: FoliageInstance[] = [];

  // ---- Three.js objects ----
  private _terrainMesh: THREE.Mesh | null = null;
  private _geometry: THREE.PlaneGeometry | null = null;
  private _material: TerrainShaderMaterial | null = null;
  private _wireframe: THREE.LineSegments | null = null;
  private _scene: THREE.Scene | null = null;

  // ---- Foliage rendering ----
  private _foliageMeshes: Map<string, THREE.InstancedMesh> = new Map();
  /** Loaded Three.js geometries + materials keyed by meshAssetId */
  private _foliageGeoCache: Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }> = new Map();
  /** MeshAssetManager reference for loading foliage GLBs */
  private _meshAssetManager: MeshAssetManager | null = null;

  // ---- Texture cache ----
  private _textureCache: Map<string, THREE.Texture> = new Map();

  // ---- Change listeners ----
  private _onTerrainChanged: (() => void)[] = [];

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'Terrain';

    // Config from props or defaults
    this.config = {
      resolution: props.resolution ?? 129,
      worldSizeX: props.worldSizeX ?? 200,
      worldSizeZ: props.worldSizeZ ?? 200,
      maxHeight: props.maxHeight ?? 50,
    };

    // Initialize heightmap
    this.heightmap = createFlatHeightmap(this.config.resolution);

    // Initialize with one default layer + splatmap
    this.layers = [defaultTerrainLayer(0)];
    this.splatmaps = [createDefaultSplatmap(this.config.resolution)];

    // Assign a default gray checkerboard texture to layer 0
    const defaultTex = createDefaultGrayTexture();
    const defaultTexId = '__terrain_default_gray';
    this.layers[0].albedoTextureId = defaultTexId;
    this._textureCache.set(defaultTexId, defaultTex);

    // Sync properties dict (used by PropertyDescriptors)
    this._syncProperties();
  }

  private _syncProperties(): void {
    this.properties = {
      worldSizeX: this.config.worldSizeX,
      worldSizeZ: this.config.worldSizeZ,
      maxHeight: this.config.maxHeight,
      resolution: this.config.resolution,
      showWireframe: false,
      hasCollision: true,
    };
  }

  // ---- Listeners ----

  onTerrainChanged(cb: () => void): void {
    this._onTerrainChanged.push(cb);
  }

  private _emitChanged(): void {
    for (const cb of this._onTerrainChanged) cb();
  }

  // ---- SceneActor interface ----

  getGizmoCapabilities(): GizmoCapability[] {
    return ['translate'];
  }

  addToScene(scene: THREE.Scene): void {
    this._scene = scene;
    scene.add(this.group);
    this._buildMesh();
  }

  removeFromScene(scene: THREE.Scene): void {
    this._disposeMesh();
    scene.remove(this.group);
    this._scene = null;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  setEditorVisible(visible: boolean): void {
    // Keep terrain visible during play — only hide wireframe
    if (this._wireframe) this._wireframe.visible = visible && this.properties.showWireframe;
  }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;

    switch (key) {
      case 'worldSizeX':
        this.config.worldSizeX = value;
        this._rebuildMesh();
        break;
      case 'worldSizeZ':
        this.config.worldSizeZ = value;
        this._rebuildMesh();
        break;
      case 'maxHeight':
        this.config.maxHeight = value;
        this._updateHeights();
        break;
      case 'resolution':
        this._changeResolution(value);
        break;
      case 'showWireframe':
        if (this._wireframe) this._wireframe.visible = value;
        break;
    }
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'worldSizeX', label: 'Size X', group: 'Terrain', type: 'number', min: 10, max: 10000, step: 10, value: this.config.worldSizeX },
      { key: 'worldSizeZ', label: 'Size Z', group: 'Terrain', type: 'number', min: 10, max: 10000, step: 10, value: this.config.worldSizeZ },
      { key: 'maxHeight', label: 'Max Height', group: 'Terrain', type: 'number', min: 1, max: 1000, step: 1, value: this.config.maxHeight },
      { key: 'resolution', label: 'Resolution', group: 'Terrain', type: 'select', value: this.config.resolution, options: [
        { label: '65 × 65', value: 65 },
        { label: '129 × 129', value: 129 },
        { label: '257 × 257', value: 257 },
        { label: '513 × 513', value: 513 },
      ]},
      { key: 'showWireframe', label: 'Show Wireframe', group: 'Display', type: 'boolean', value: this.properties.showWireframe },
      { key: 'hasCollision', label: 'Has Collision', group: 'Physics', type: 'boolean', value: this.properties.hasCollision },
    ];
  }

  dispose(): void {
    this._disposeMesh();
    this._textureCache.forEach(t => t.dispose());
    this._textureCache.clear();
    this._foliageMeshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
    this._foliageMeshes.clear();
  }

  // ============================================================
  //  Mesh Building
  // ============================================================

  private _buildMesh(): void {
    const { resolution, worldSizeX, worldSizeZ } = this.config;
    const segments = resolution - 1;

    // Create geometry
    this._geometry = new THREE.PlaneGeometry(worldSizeX, worldSizeZ, segments, segments);
    this._geometry.rotateX(-Math.PI / 2); // Y-up

    // Apply heightmap to vertex positions
    this._applyHeightmapToGeometry();

    // Create material
    this._material = new TerrainShaderMaterial(resolution);

    // Upload splatmap
    if (this.splatmaps[0]) {
      this._material.uploadSplatmap(0, this.splatmaps[0], resolution);
    }
    if (this.splatmaps[1]) {
      this._material.uploadSplatmap(1, this.splatmaps[1], resolution);
    }

    // Set layers
    this._material.setLayers(this.layers, this._textureCache);

    // Create mesh
    this._terrainMesh = new THREE.Mesh(this._geometry, this._material);
    this._terrainMesh.receiveShadow = true;
    this._terrainMesh.castShadow = true;
    this._terrainMesh.userData.__isTerrainMesh = true;
    this._terrainMesh.userData.__sceneActorId = this.id;
    this.group.add(this._terrainMesh);

    // Wireframe overlay (optional)
    const wireGeo = new THREE.WireframeGeometry(this._geometry);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x888888, opacity: 0.15, transparent: true });
    this._wireframe = new THREE.LineSegments(wireGeo, wireMat);
    this._wireframe.visible = this.properties.showWireframe;
    this._wireframe.raycast = () => {};
    this.group.add(this._wireframe);
  }

  private _disposeMesh(): void {
    if (this._terrainMesh) {
      this.group.remove(this._terrainMesh);
      this._terrainMesh = null;
    }
    if (this._wireframe) {
      this.group.remove(this._wireframe);
      this._wireframe.geometry.dispose();
      (this._wireframe.material as THREE.Material).dispose();
      this._wireframe = null;
    }
    if (this._geometry) {
      this._geometry.dispose();
      this._geometry = null;
    }
    if (this._material) {
      this._material.dispose();
      this._material = null;
    }
  }

  private _rebuildMesh(): void {
    this._disposeMesh();
    this._buildMesh();
    this._emitChanged();
  }

  private _changeResolution(newRes: number): void {
    const oldRes = this.config.resolution;
    if (newRes === oldRes) return;

    // Resample heightmap
    const newHeightmap = createFlatHeightmap(newRes);
    for (let z = 0; z < newRes; z++) {
      for (let x = 0; x < newRes; x++) {
        const srcX = (x / (newRes - 1)) * (oldRes - 1);
        const srcZ = (z / (newRes - 1)) * (oldRes - 1);
        // Bilinear interpolation
        const x0 = Math.floor(srcX);
        const x1 = Math.min(x0 + 1, oldRes - 1);
        const z0 = Math.floor(srcZ);
        const z1 = Math.min(z0 + 1, oldRes - 1);
        const fx = srcX - x0;
        const fz = srcZ - z0;
        const h00 = this.heightmap[z0 * oldRes + x0];
        const h10 = this.heightmap[z0 * oldRes + x1];
        const h01 = this.heightmap[z1 * oldRes + x0];
        const h11 = this.heightmap[z1 * oldRes + x1];
        newHeightmap[z * newRes + x] = (h00 * (1 - fx) * (1 - fz)) +
          (h10 * fx * (1 - fz)) +
          (h01 * (1 - fx) * fz) +
          (h11 * fx * fz);
      }
    }
    this.heightmap = newHeightmap;

    // Resample splatmaps
    for (let s = 0; s < this.splatmaps.length; s++) {
      const oldSplat = this.splatmaps[s];
      const newSplat = createDefaultSplatmap(newRes);
      for (let z = 0; z < newRes; z++) {
        for (let x = 0; x < newRes; x++) {
          const srcX = Math.round((x / (newRes - 1)) * (oldRes - 1));
          const srcZ = Math.round((z / (newRes - 1)) * (oldRes - 1));
          const srcIdx = (srcZ * oldRes + srcX) * 4;
          const dstIdx = (z * newRes + x) * 4;
          newSplat[dstIdx] = oldSplat[srcIdx];
          newSplat[dstIdx + 1] = oldSplat[srcIdx + 1];
          newSplat[dstIdx + 2] = oldSplat[srcIdx + 2];
          newSplat[dstIdx + 3] = oldSplat[srcIdx + 3];
        }
      }
      this.splatmaps[s] = newSplat;
    }

    this.config.resolution = newRes;
    this._rebuildMesh();
  }

  // ============================================================
  //  Heightmap ↔ Geometry sync
  // ============================================================

  private _applyHeightmapToGeometry(): void {
    if (!this._geometry) return;
    const posAttr = this._geometry.getAttribute('position') as THREE.BufferAttribute;
    const { resolution, maxHeight } = this.config;

    for (let i = 0; i < posAttr.count; i++) {
      const gz = Math.floor(i / resolution);
      const gx = i % resolution;
      const h = this.heightmap[gz * resolution + gx] * maxHeight;
      posAttr.setY(i, h);
    }
    posAttr.needsUpdate = true;
    this._geometry.computeVertexNormals();
  }

  /** Update only the Y positions (after sculpting) */
  private _updateHeights(): void {
    if (!this._geometry) return;
    this._applyHeightmapToGeometry();
    this._geometry.computeBoundingSphere();
    this._geometry.computeBoundingBox();
  }

  /** Update a region of vertex heights (efficient partial update) */
  updateHeightRegion(minGx: number, minGz: number, maxGx: number, maxGz: number): void {
    if (!this._geometry) return;
    const posAttr = this._geometry.getAttribute('position') as THREE.BufferAttribute;
    const { resolution, maxHeight } = this.config;

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const idx = gz * resolution + gx;
        if (idx >= 0 && idx < posAttr.count) {
          posAttr.setY(idx, this.heightmap[idx] * maxHeight);
        }
      }
    }
    posAttr.needsUpdate = true;
    this._geometry.computeVertexNormals();
  }

  // ============================================================
  //  Sculpting API
  // ============================================================

  /**
   * Apply a sculpt brush stroke at a world position.
   * Returns the affected grid bounds for incremental updates.
   */
  applySculptBrush(
    worldX: number, worldZ: number,
    tool: SculptTool,
    brush: BrushSettings,
    flattenTarget?: number, // used by flatten tool (height at click start)
  ): { minGx: number; minGz: number; maxGx: number; maxGz: number } {
    const { resolution } = this.config;
    const { gx: centerGx, gz: centerGz } = worldToGrid(worldX, worldZ, this.config);

    // Convert brush radius from world units to grid units
    const gridRadiusX = (brush.radius / this.config.worldSizeX) * (resolution - 1);
    const gridRadiusZ = (brush.radius / this.config.worldSizeZ) * (resolution - 1);
    const gridRadius = Math.max(gridRadiusX, gridRadiusZ);

    const minGx = Math.max(0, Math.floor(centerGx - gridRadius));
    const maxGx = Math.min(resolution - 1, Math.ceil(centerGx + gridRadius));
    const minGz = Math.max(0, Math.floor(centerGz - gridRadius));
    const maxGz = Math.min(resolution - 1, Math.ceil(centerGz + gridRadius));

    const dt = 1 / 60; // normalised timestep for consistent feel

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        // Compute world-space distance
        const { wx, wz } = gridToWorld(gx, gz, this.config);
        const dist = Math.sqrt((wx - worldX) ** 2 + (wz - worldZ) ** 2);
        const falloff = computeFalloff(dist, brush.radius, brush.falloff);
        if (falloff <= 0) continue;

        const idx = gz * resolution + gx;
        const current = this.heightmap[idx];

        switch (tool) {
          case 'raise':
            this.heightmap[idx] = Math.min(1, current + brush.strength * falloff * dt);
            break;
          case 'lower':
            this.heightmap[idx] = Math.max(0, current - brush.strength * falloff * dt);
            break;
          case 'smooth': {
            // Average of neighbours
            let sum = 0;
            let count = 0;
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = gx + dx;
                const nz = gz + dz;
                if (nx >= 0 && nx < resolution && nz >= 0 && nz < resolution) {
                  sum += this.heightmap[nz * resolution + nx];
                  count++;
                }
              }
            }
            const avg = sum / count;
            this.heightmap[idx] = current + (avg - current) * brush.strength * falloff * dt * 4;
            break;
          }
          case 'flatten': {
            const target = flattenTarget ?? current;
            this.heightmap[idx] = current + (target - current) * brush.strength * falloff * dt * 4;
            break;
          }
          case 'noise': {
            const n = noise2D(gx * 0.05, gz * 0.05);
            this.heightmap[idx] = Math.max(0, Math.min(1, current + n * brush.strength * falloff * dt * 0.5));
            break;
          }
        }
      }
    }

    // Update geometry
    this.updateHeightRegion(minGx, minGz, maxGx, maxGz);
    return { minGx, minGz, maxGx, maxGz };
  }

  // ============================================================
  //  Splatmap Painting API
  // ============================================================

  /**
   * Paint a texture layer at a world position.
   * `layerIndex` is the index in `this.layers` (0–7).
   */
  applySplatPaint(
    worldX: number, worldZ: number,
    layerIndex: number,
    brush: BrushSettings,
    erase: boolean = false,
  ): void {
    const { resolution } = this.config;
    const { gx: centerGx, gz: centerGz } = worldToGrid(worldX, worldZ, this.config);

    const gridRadiusX = (brush.radius / this.config.worldSizeX) * (resolution - 1);
    const gridRadiusZ = (brush.radius / this.config.worldSizeZ) * (resolution - 1);
    const gridRadius = Math.max(gridRadiusX, gridRadiusZ);

    const minGx = Math.max(0, Math.floor(centerGx - gridRadius));
    const maxGx = Math.min(resolution - 1, Math.ceil(centerGx + gridRadius));
    const minGz = Math.max(0, Math.floor(centerGz - gridRadius));
    const maxGz = Math.min(resolution - 1, Math.ceil(centerGz + gridRadius));

    // Determine which splatmap texture and channel
    const splatIndex = Math.floor(layerIndex / 4) as 0 | 1;
    const channel = layerIndex % 4;

    // Ensure splatmap exists
    while (this.splatmaps.length <= splatIndex) {
      this.splatmaps.push(createDefaultSplatmap(resolution));
    }
    const splatmap = this.splatmaps[splatIndex];

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const { wx, wz } = gridToWorld(gx, gz, this.config);
        const dist = Math.sqrt((wx - worldX) ** 2 + (wz - worldZ) ** 2);
        const falloff = computeFalloff(dist, brush.radius, brush.falloff);
        if (falloff <= 0) continue;

        const pixelIdx = (gz * resolution + gx) * 4;
        const amount = brush.strength * falloff * 8; // scale for visible effect

        if (erase) {
          // Reduce this channel, redistribute to others
          const current = splatmap[pixelIdx + channel];
          const reduction = Math.min(current, Math.round(amount));
          splatmap[pixelIdx + channel] = current - reduction;
        } else {
          // Increase this channel, decrease others proportionally
          const current = splatmap[pixelIdx + channel];
          const increase = Math.min(255 - current, Math.round(amount));
          splatmap[pixelIdx + channel] = current + increase;

          // Normalize: ensure all channels in this splatmap sum to ~255
          this._normalizeSplatPixel(splatmap, pixelIdx);
        }
      }
    }

    // Re-upload splatmap to GPU
    if (this._material) {
      this._material.uploadSplatmap(splatIndex, splatmap, resolution);
    }
  }

  /** Normalize RGBA channels at a pixel index so they sum to 255 */
  private _normalizeSplatPixel(splatmap: Uint8Array, pixelIdx: number): void {
    const sum = splatmap[pixelIdx] + splatmap[pixelIdx + 1] + splatmap[pixelIdx + 2] + splatmap[pixelIdx + 3];
    if (sum === 0) {
      splatmap[pixelIdx] = 255; // fallback to layer 0
      return;
    }
    if (sum === 255) return;
    const scale = 255 / sum;
    splatmap[pixelIdx] = Math.round(splatmap[pixelIdx] * scale);
    splatmap[pixelIdx + 1] = Math.round(splatmap[pixelIdx + 1] * scale);
    splatmap[pixelIdx + 2] = Math.round(splatmap[pixelIdx + 2] * scale);
    splatmap[pixelIdx + 3] = Math.round(splatmap[pixelIdx + 3] * scale);
  }

  // ============================================================
  //  Layer Management
  // ============================================================

  addLayer(): TerrainLayerDef | null {
    if (this.layers.length >= 8) return null;
    const layer = defaultTerrainLayer(this.layers.length);
    this.layers.push(layer);

    // If we go beyond 4 layers and don't have a second splatmap, create one
    if (this.layers.length > 4 && this.splatmaps.length < 2) {
      const splat = new Uint8Array(this.config.resolution * this.config.resolution * 4);
      this.splatmaps.push(splat);
      if (this._material) {
        this._material.uploadSplatmap(1, splat, this.config.resolution);
      }
    }

    this._refreshMaterialLayers();
    this._emitChanged();
    return layer;
  }

  removeLayer(index: number): void {
    if (index < 0 || index >= this.layers.length) return;
    if (this.layers.length <= 1) return; // must keep at least 1

    this.layers.splice(index, 1);

    // Clear the removed layer's splatmap channel and redistribute
    // (simplified: just rebuild splatmaps with layer 0 as dominant)
    this._refreshMaterialLayers();
    this._emitChanged();
  }

  updateLayer(index: number, updates: Partial<TerrainLayerDef>): void {
    if (index < 0 || index >= this.layers.length) return;
    Object.assign(this.layers[index], updates);
    this._refreshMaterialLayers();
  }

  /** Set a layer's albedo texture from a TextureLibrary texture */
  setLayerTexture(layerIndex: number, textureId: string, texture: THREE.Texture): void {
    if (layerIndex < 0 || layerIndex >= this.layers.length) return;
    this.layers[layerIndex].albedoTextureId = textureId;
    this._textureCache.set(textureId, texture);

    // Configure for terrain tiling
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;

    this._refreshMaterialLayers();
  }

  private _refreshMaterialLayers(): void {
    if (!this._material) return;
    this._material.setLayers(this.layers, this._textureCache);
  }

  // ============================================================
  //  Brush Visualization
  // ============================================================

  showBrush(worldPos: THREE.Vector3, radius: number, color?: THREE.Color): void {
    this._material?.showBrush(worldPos, radius, color);
  }

  hideBrush(): void {
    this._material?.hideBrush();
  }

  // ============================================================
  //  Public Accessors
  // ============================================================

  get terrainMesh(): THREE.Mesh | null {
    return this._terrainMesh;
  }

  get terrainMaterial(): TerrainShaderMaterial | null {
    return this._material;
  }

  get terrainGeometry(): THREE.PlaneGeometry | null {
    return this._geometry;
  }

  // ============================================================
  //  Foliage Management
  // ============================================================

  addFoliageType(type: FoliageTypeDef): void {
    this.foliageTypes.push(type);
    this._emitChanged();
  }

  /** Set reference to MeshAssetManager for loading foliage meshes */
  setMeshAssetManager(mgr: MeshAssetManager): void {
    this._meshAssetManager = mgr;
  }

  /** Public method to trigger a rebuild of a specific foliage type's instanced mesh */
  rebuildFoliageMeshForType(typeId: string): void {
    this._rebuildFoliageMesh(typeId);
    this._emitChanged();
  }

  removeFoliageType(id: string): void {
    this.foliageTypes = this.foliageTypes.filter(t => t.id !== id);
    this.foliageInstances = this.foliageInstances.filter(i => i.typeId !== id);

    // Remove instanced mesh
    const mesh = this._foliageMeshes.get(id);
    if (mesh) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this._foliageMeshes.delete(id);
    }
    this._emitChanged();
  }

  /** Add foliage instances and rebuild the InstancedMesh for that type */
  addFoliageInstances(instances: FoliageInstance[]): void {
    this.foliageInstances.push(...instances);
    // Rebuild instanced meshes for affected types
    const affectedTypes = new Set(instances.map(i => i.typeId));
    for (const typeId of affectedTypes) {
      this._rebuildFoliageMesh(typeId);
    }
    this._emitChanged();
  }

  /** Remove foliage instances within a world-space radius */
  eraseFoliageInstances(worldX: number, worldZ: number, radius: number): string[] {
    const removed: string[] = [];
    const affectedTypes = new Set<string>();
    this.foliageInstances = this.foliageInstances.filter(inst => {
      const dx = inst.position.x - worldX;
      const dz = inst.position.z - worldZ;
      if (dx * dx + dz * dz < radius * radius) {
        removed.push(inst.typeId);
        affectedTypes.add(inst.typeId);
        return false;
      }
      return true;
    });
    for (const typeId of affectedTypes) {
      this._rebuildFoliageMesh(typeId);
    }
    if (removed.length > 0) this._emitChanged();
    return removed;
  }

  /** Rebuild the InstancedMesh for a given foliage type */
  private _rebuildFoliageMesh(typeId: string): void {
    // Remove existing
    const existing = this._foliageMeshes.get(typeId);
    if (existing) {
      this.group.remove(existing);
      existing.geometry.dispose();
      // Don't dispose shared cached material
      this._foliageMeshes.delete(typeId);
    }

    const instances = this.foliageInstances.filter(i => i.typeId === typeId);
    if (instances.length === 0) return;

    // Find foliage type def to get meshAssetId
    const fType = this.foliageTypes.find(t => t.id === typeId);
    const meshAssetId = fType?.meshAssetId || '';

    // Try to use cached geometry from a loaded mesh asset
    const cached = meshAssetId ? this._foliageGeoCache.get(meshAssetId) : null;

    if (meshAssetId && !cached) {
      // Need to load the mesh asset asynchronously, then rebuild
      this._loadFoliageMeshAsset(meshAssetId).then(() => {
        // Re-trigger rebuild now that geometry is cached
        this._rebuildFoliageMeshSync(typeId, instances);
      });
      return;
    }

    this._rebuildFoliageMeshSync(typeId, instances);
  }

  /** Synchronous rebuild once geometry is available (or using placeholder) */
  private _rebuildFoliageMeshSync(
    typeId: string,
    instances: FoliageInstance[],
  ): void {
    // Remove existing (may have been placed by a prior call)
    const prev = this._foliageMeshes.get(typeId);
    if (prev) {
      this.group.remove(prev);
      prev.geometry.dispose();
      this._foliageMeshes.delete(typeId);
    }
    if (instances.length === 0) return;

    const fType = this.foliageTypes.find(t => t.id === typeId);
    const meshAssetId = fType?.meshAssetId || '';
    const cached = meshAssetId ? this._foliageGeoCache.get(meshAssetId) : null;

    let geo: THREE.BufferGeometry;
    let mat: THREE.Material;

    if (cached) {
      geo = cached.geometry;
      mat = cached.material;
    } else {
      // Placeholder box
      geo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
      mat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.9 });
    }

    const mesh = new THREE.InstancedMesh(geo, mat, instances.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    instances.forEach((inst, i) => {
      pos.set(inst.position.x, inst.position.y, inst.position.z);
      quat.setFromEuler(new THREE.Euler(inst.rotation.x, inst.rotation.y, inst.rotation.z));
      scl.set(inst.scale.x, inst.scale.y, inst.scale.z);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.__isFoliageMesh = true;

    this.group.add(mesh);
    this._foliageMeshes.set(typeId, mesh);
  }

  /** Load a GLB mesh asset and cache its geometry + material for instancing */
  private async _loadFoliageMeshAsset(meshAssetId: string): Promise<void> {
    if (this._foliageGeoCache.has(meshAssetId)) return;

    const mgr = this._meshAssetManager;
    if (!mgr) return;

    const asset = mgr.getAsset(meshAssetId);
    if (!asset || !asset.glbDataBase64) return;

    try {
      const { scene } = await loadMeshFromAsset(asset);

      // Extract the first mesh geometry + material from the loaded scene
      let foundGeo: THREE.BufferGeometry | null = null;
      let foundMat: THREE.Material | null = null;

      scene.traverse((child) => {
        if (!foundGeo && (child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          foundGeo = m.geometry.clone();

          // Apply the child's world transform into the geometry so
          // instancing doesn't need an extra parent transform.
          m.updateWorldMatrix(true, false);
          foundGeo.applyMatrix4(m.matrixWorld);

          foundMat = Array.isArray(m.material) ? m.material[0].clone() : m.material.clone();
        }
      });

      if (foundGeo && foundMat) {
        this._foliageGeoCache.set(meshAssetId, { geometry: foundGeo, material: foundMat });
      }
    } catch (err) {
      console.warn(`[TerrainActor] Failed to load foliage mesh asset ${meshAssetId}:`, err);
    }
  }

  /** Get terrain height at a world XZ position (interpolated) */
  getHeightAtWorld(worldX: number, worldZ: number): number {
    const { gx, gz } = worldToGrid(worldX, worldZ, this.config);
    const x0 = Math.floor(gx);
    const x1 = Math.min(x0 + 1, this.config.resolution - 1);
    const z0 = Math.floor(gz);
    const z1 = Math.min(z0 + 1, this.config.resolution - 1);
    const fx = gx - x0;
    const fz = gz - z0;
    const { resolution, maxHeight } = this.config;

    const h00 = this.heightmap[z0 * resolution + x0];
    const h10 = this.heightmap[z0 * resolution + x1];
    const h01 = this.heightmap[z1 * resolution + x0];
    const h11 = this.heightmap[z1 * resolution + x1];

    const h = (h00 * (1 - fx) * (1 - fz)) + (h10 * fx * (1 - fz)) + (h01 * (1 - fx) * fz) + (h11 * fx * fz);
    return h * maxHeight + this.group.position.y;
  }

  /** Get terrain normal at a world XZ position */
  getNormalAtWorld(worldX: number, worldZ: number): THREE.Vector3 {
    const { gx, gz } = worldToGrid(worldX, worldZ, this.config);
    const ix = Math.max(1, Math.min(this.config.resolution - 2, Math.round(gx)));
    const iz = Math.max(1, Math.min(this.config.resolution - 2, Math.round(gz)));
    const { resolution, maxHeight, worldSizeX, worldSizeZ } = this.config;

    const hL = this.heightmap[iz * resolution + (ix - 1)] * maxHeight;
    const hR = this.heightmap[iz * resolution + (ix + 1)] * maxHeight;
    const hD = this.heightmap[(iz - 1) * resolution + ix] * maxHeight;
    const hU = this.heightmap[(iz + 1) * resolution + ix] * maxHeight;

    const cellX = worldSizeX / (resolution - 1);
    const cellZ = worldSizeZ / (resolution - 1);
    const normal = new THREE.Vector3(
      (hL - hR) / (2 * cellX),
      1,
      (hD - hU) / (2 * cellZ),
    );
    return normal.normalize();
  }

  // ============================================================
  //  Serialization
  // ============================================================

  /** Override base serialize to embed full terrain data */
  override serialize(): SceneActorJSON {
    const json = super.serialize();
    // Embed terrain-specific data (heightmap, splatmap, foliage, layers) in properties
    json.properties.__terrainData = this.serializeTerrainData();
    return json;
  }

  serializeTerrainData(): TerrainAssetJSON {
    return {
      assetId: this.id,
      assetType: 'terrain',
      config: { ...this.config },
      heightmapBase64: float32ToBase64(this.heightmap),
      layers: this.layers.map(l => ({ ...l })),
      splatMapBase64: this.splatmaps.map(s => uint8ToBase64(s)),
      foliageTypes: this.foliageTypes.map(f => ({ ...f })),
      foliageInstances: this.foliageInstances.map(i => ({
        typeId: i.typeId,
        position: { ...i.position },
        rotation: { ...i.rotation },
        scale: { ...i.scale },
      })),
    };
  }

  /** Restore terrain state from serialized data */
  loadTerrainData(data: TerrainAssetJSON): void {
    this.config = { ...data.config };
    this.heightmap = base64ToFloat32(data.heightmapBase64);
    this.layers = data.layers.map(l => ({ ...l }));
    this.splatmaps = data.splatMapBase64.map(s => base64ToUint8(s));
    this.foliageTypes = data.foliageTypes?.map(f => ({ ...f })) ?? [];
    this.foliageInstances = data.foliageInstances?.map(i => ({
      typeId: i.typeId,
      position: { ...i.position },
      rotation: { ...i.rotation },
      scale: { ...i.scale },
    })) ?? [];

    this._syncProperties();
    this._rebuildMesh();

    // Rebuild foliage
    const typeIds = new Set(this.foliageInstances.map(i => i.typeId));
    for (const typeId of typeIds) {
      this._rebuildFoliageMesh(typeId);
    }
  }

  // ============================================================
  //  Heightmap Import
  // ============================================================

  /** Import a heightmap from a grayscale image (canvas) */
  importHeightmapFromImage(imageData: ImageData): void {
    const { resolution } = this.config;
    const srcW = imageData.width;
    const srcH = imageData.height;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const srcX = Math.round((x / (resolution - 1)) * (srcW - 1));
        const srcZ = Math.round((z / (resolution - 1)) * (srcH - 1));
        const srcIdx = (srcZ * srcW + srcX) * 4;
        // Use red channel as height (grayscale)
        this.heightmap[z * resolution + x] = imageData.data[srcIdx] / 255;
      }
    }

    this._updateHeights();
    this._emitChanged();
  }
}
