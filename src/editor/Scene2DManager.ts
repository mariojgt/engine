// ============================================================
//  Scene2DManager — Orchestrates 2D scene mode
//  Manages switching between 2D/3D, holding 2D-specific state,
//  and coordinating 2D assets (sprite sheets, tilesets, tilemaps).
// ============================================================

import * as THREE from 'three';
import { Camera2D, type Camera2DSettings } from '../engine/Camera2D';
import { Physics2DWorld, type Physics2DSettings } from '../engine/Physics2DWorld';
import { Physics2DDebugDraw } from '../engine/Physics2DDebugDraw';
import { SortingLayerManager, DEFAULT_SORTING_LAYERS, type SortingLayerData } from '../engine/SortingLayers';
import type { SpriteSheetAsset } from '../engine/SpriteRenderer';
import type { TilesetAsset, TilemapAsset } from '../engine/TilemapData';

export type SceneMode = '2D' | '3D';

export interface Scene2DConfig {
  sceneMode: SceneMode;
  renderSettings: {
    cameraType: 'orthographic' | 'perspective';
    pixelsPerUnit: number;
    referenceResolution: { width: number; height: number };
    backgroundColor: string;
  };
  worldSettings: {
    gravity: { x: number; y: number };
    physicsMode: '2D' | '3D';
    pixelsPerUnit: number;
  };
  sortingLayers: SortingLayerData[];
}

export function defaultScene2DConfig(): Scene2DConfig {
  return {
    sceneMode: '2D',
    renderSettings: {
      cameraType: 'orthographic',
      pixelsPerUnit: 100,
      referenceResolution: { width: 1920, height: 1080 },
      backgroundColor: '#1a1a2e',
    },
    worldSettings: {
      gravity: { x: 0, y: -980 },
      physicsMode: '2D',
      pixelsPerUnit: 100,
    },
    sortingLayers: structuredClone(DEFAULT_SORTING_LAYERS),
  };
}

export class Scene2DManager {
  public sceneMode: SceneMode = '3D';
  public camera2D: Camera2D | null = null;
  public physics2D: Physics2DWorld | null = null;
  public debugDraw: Physics2DDebugDraw;
  public sortingLayers: SortingLayerManager;
  public config: Scene2DConfig | null = null;

  // 2D Asset registries
  public spriteSheets = new Map<string, SpriteSheetAsset>();
  public tilesets = new Map<string, TilesetAsset>();
  public tilemaps = new Map<string, TilemapAsset>();

  // 2D Scene root group — all 2D actors go here
  public root2D: THREE.Group;

  // Grid overlay
  public gridHelper: THREE.GridHelper | null = null;
  private _gridGroup: THREE.Group;
  private _gridVisible = true;
  /** Reference to the THREE.Scene for grid rebuilds that happen after init */
  private _threeScene: THREE.Scene | null = null;
  /** Current tile-grid overlay (shown when pixel-perfect is on) */
  private _tileGridGroup: THREE.Group;
  private _tileGridVisible = false;

  private _onChange: (() => void)[] = [];

  constructor() {
    this.sortingLayers = new SortingLayerManager();
    this.debugDraw = new Physics2DDebugDraw();
    this.root2D = new THREE.Group();
    this.root2D.name = '__2D_Root__';
    this._gridGroup = new THREE.Group();
    this._gridGroup.name = '__2D_Grid__';
    this._tileGridGroup = new THREE.Group();
    this._tileGridGroup.name = '__2D_TileGrid__';
    this._tileGridGroup.visible = false;
  }

  get is2D(): boolean { return this.sceneMode === '2D'; }

  // ---- Mode switching ----

  async switchTo2D(threeScene: THREE.Scene, domElement: HTMLElement, config?: Scene2DConfig): Promise<void> {
    this.sceneMode = '2D';
    // Preserve config restored by fromJSON(); only use default for brand-new scenes
    if (config) {
      this.config = config;
    } else if (!this.config) {
      this.config = defaultScene2DConfig();
    }

    // Initialize Camera2D
    this.camera2D = new Camera2D(domElement, {
      pixelsPerUnit: this.config.renderSettings.pixelsPerUnit,
      referenceResolution: this.config.renderSettings.referenceResolution,
      backgroundColor: this.config.renderSettings.backgroundColor,
    });

    // Initialize Physics2D
    this.physics2D = new Physics2DWorld();
    await this.physics2D.init({
      gravity: this.config.worldSettings.gravity,
      pixelsPerUnit: this.config.worldSettings.pixelsPerUnit,
    });

    // Set sorting layers
    this.sortingLayers.setLayers(this.config.sortingLayers);

    // Add 2D root to scene
    if (!threeScene.children.includes(this.root2D)) {
      threeScene.add(this.root2D);
    }

    // Set background color
    threeScene.background = new THREE.Color(this.config.renderSettings.backgroundColor);

    // Attach debug draw overlay
    this.debugDraw.attach(this.physics2D);
    if (!threeScene.children.includes(this.debugDraw.group)) {
      threeScene.add(this.debugDraw.group);
    }

    // Store scene ref for later grid rebuilds
    this._threeScene = threeScene;

    // Create 2D grid
    this._buildGrid(threeScene);

    // Add tile grid overlay container
    if (!threeScene.children.includes(this._tileGridGroup)) {
      threeScene.add(this._tileGridGroup);
    }

    this._emit();
  }

  switchTo3D(threeScene: THREE.Scene): void {
    this.sceneMode = '3D';

    // Cleanup 2D resources
    if (this.camera2D) {
      this.camera2D.dispose();
      this.camera2D = null;
    }
    if (this.physics2D) {
      this.physics2D.cleanup();
      this.physics2D = null;
    }

    // Remove debug draw overlay
    this.debugDraw.detach();
    threeScene.remove(this.debugDraw.group);

    // Remove 2D root
    threeScene.remove(this.root2D);
    threeScene.remove(this._gridGroup);

    this.config = null;
    this._emit();
  }

  // ---- Grid ----

  private _buildGrid(scene: THREE.Scene): void {
    // Remove old
    scene.remove(this._gridGroup);
    this._gridGroup.clear();

    if (!this.config) return;

    const ppu = this.config.renderSettings.pixelsPerUnit;
    const gridSize = 100; // 100 units
    const gridLines = gridSize * 2;

    // Create line grid at z=-1 (behind all sprites)
    const material = new THREE.LineBasicMaterial({ color: 0x333366, transparent: true, opacity: 0.3, depthTest: false });
    const points: THREE.Vector3[] = [];

    for (let i = -gridSize; i <= gridSize; i++) {
      points.push(new THREE.Vector3(i, -gridSize, -1), new THREE.Vector3(i, gridSize, -1));
      points.push(new THREE.Vector3(-gridSize, i, -1), new THREE.Vector3(gridSize, i, -1));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const grid = new THREE.LineSegments(geometry, material);
    grid.name = '__2DGrid__';
    this._gridGroup.add(grid);

    // Axis lines
    const axisMat = new THREE.LineBasicMaterial({ color: 0x666688, depthTest: false });
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-gridSize, 0, -0.5), new THREE.Vector3(gridSize, 0, -0.5),
      new THREE.Vector3(0, -gridSize, -0.5), new THREE.Vector3(0, gridSize, -0.5),
    ]);
    const axisLines = new THREE.LineSegments(axisGeo, axisMat);
    axisLines.name = '__2DAxisLines__';
    this._gridGroup.add(axisLines);

    this._gridGroup.visible = this._gridVisible;
    scene.add(this._gridGroup);
  }

  toggleGrid(): void {
    this._gridVisible = !this._gridVisible;
    this._gridGroup.visible = this._gridVisible;
  }

  // ---- Pixel-perfect helpers ----

  /**
   * Change the scene and camera PPU to match a tileset, then
   * reconfigure the camera frustum so tiles render pixel-perfect.
   */
  setPixelsPerUnit(ppu: number): void {
    if (this.config) {
      this.config.renderSettings.pixelsPerUnit = ppu;
      this.config.worldSettings.pixelsPerUnit = ppu;
    }
    if (this.camera2D) {
      this.camera2D.setPixelsPerUnit(ppu);
    }
  }

  /**
   * Build (or rebuild) a tile-aligned grid overlay so the user can
   * clearly see cell boundaries while painting.
   *
   * @param tileWorldW  Tile width in world-units (tileWidth / ppu)
   * @param tileWorldH  Tile height in world-units (tileHeight / ppu)
   * @param visible     Whether to show the grid immediately
   */
  rebuildTileGrid(tileWorldW: number, tileWorldH: number, visible: boolean): void {
    this._tileGridGroup.clear();
    this._tileGridVisible = visible;
    this._tileGridGroup.visible = visible;

    if (!visible || tileWorldW <= 0 || tileWorldH <= 0) return;

    // Cover a generous area (±50 world-units) with tile-sized grid lines
    const extent = 60;
    const halfCols = Math.ceil(extent / tileWorldW);
    const halfRows = Math.ceil(extent / tileWorldH);

    const points: THREE.Vector3[] = [];

    // Vertical lines (along X axis at each tile column boundary)
    for (let c = -halfCols; c <= halfCols; c++) {
      const x = c * tileWorldW;
      points.push(
        new THREE.Vector3(x, -halfRows * tileWorldH, -0.9),
        new THREE.Vector3(x, halfRows * tileWorldH, -0.9),
      );
    }
    // Horizontal lines (along Y axis at each tile row boundary)
    for (let r = -halfRows; r <= halfRows; r++) {
      const y = r * tileWorldH;
      points.push(
        new THREE.Vector3(-halfCols * tileWorldW, y, -0.9),
        new THREE.Vector3(halfCols * tileWorldW, y, -0.9),
      );
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x89b4fa,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.name = '__TileGrid__';
    this._tileGridGroup.add(lines);
  }

  /** Show / hide the tile grid overlay */
  setTileGridVisible(visible: boolean): void {
    this._tileGridVisible = visible;
    this._tileGridGroup.visible = visible;
  }

  // ---- Asset management ----

  addSpriteSheet(asset: SpriteSheetAsset): void {
    this.spriteSheets.set(asset.assetId, asset);
    this._emit();
  }

  removeSpriteSheet(id: string): void {
    this.spriteSheets.delete(id);
    this._emit();
  }

  addTileset(asset: TilesetAsset): void {
    this.tilesets.set(asset.assetId, asset);
    this._emit();
  }

  removeTileset(id: string): void {
    this.tilesets.delete(id);
    this._emit();
  }

  addTilemap(asset: TilemapAsset): void {
    this.tilemaps.set(asset.assetId, asset);
    this._emit();
  }

  removeTilemap(id: string): void {
    this.tilemaps.delete(id);
    this._emit();
  }

  // ---- Update (called each frame) ----

  update(deltaTime: number): void {
    if (!this.is2D) return;
    this.camera2D?.update(deltaTime);
    this.physics2D?.step(deltaTime);
    this.debugDraw.update(deltaTime);
  }

  togglePhysicsDebug(): void {
    this.debugDraw.enabled = !this.debugDraw.enabled;
    if (this.debugDraw.enabled) this.debugDraw.markDirty();
  }

  // ---- Serialization ----

  toJSON(): any {
    const tilesetArr = Array.from(this.tilesets.values());
    const tilemapArr = Array.from(this.tilemaps.values());
    console.log(`[Scene2DManager.toJSON] mode=${this.sceneMode}, tilesets=${tilesetArr.length}, tilemaps=${tilemapArr.length}`);
    for (const ts of tilesetArr) {
      console.log(`  tileset "${ts.assetName}" id=${ts.assetId} hasImage=${!!ts.image} hasDataUrl=${!!ts.imageDataUrl} dataUrlLen=${ts.imageDataUrl?.length ?? 0}`);
    }
    for (const tm of tilemapArr) {
      const totalTiles = tm.layers.reduce((sum: number, l: any) => sum + Object.keys(l.tiles).length, 0);
      console.log(`  tilemap "${tm.assetName}" id=${tm.assetId} tilesetId=${tm.tilesetId} layers=${tm.layers.length} totalTiles=${totalTiles}`);
    }
    return {
      sceneMode: this.sceneMode,
      config: this.config ? structuredClone(this.config) : null,
      spriteSheets: Array.from(this.spriteSheets.values()).map(ss => ({
        ...ss,
        image: undefined, // Don't serialize HTMLImageElement
        texture: undefined, // Don't serialize THREE.Texture
      })),
      tilesets: tilesetArr.map(ts => ({
        ...ts,
        image: undefined,
      })),
      tilemaps: tilemapArr,
    };
  }

  fromJSON(data: any): void {
    if (!data) { console.warn('[Scene2DManager.fromJSON] No data provided!'); return; }
    console.log(`[Scene2DManager.fromJSON] mode=${data.sceneMode}, tilesets=${data.tilesets?.length ?? 0}, tilemaps=${data.tilemaps?.length ?? 0}, spriteSheets=${data.spriteSheets?.length ?? 0}, hasConfig=${!!data.config}`);
    this.sceneMode = data.sceneMode ?? '3D';
    this.config = data.config ?? null;
    if (this.config?.sortingLayers) {
      this.sortingLayers.setLayers(this.config.sortingLayers);
    }

    // Clear existing data before restoring (prevents stale data from previous scene)
    this.spriteSheets.clear();
    this.tilesets.clear();
    this.tilemaps.clear();

    // Track pending image loads so we can fire a second _emit() once
    // every image is ready (renderers need the HTMLImageElement).
    let pendingImages = 0;
    const onImageReady = () => {
      pendingImages--;
      if (pendingImages === 0) {
        console.log('[Scene2DManager] All tileset/spritesheet images restored');
        this._emit(); // re-notify — renderers can now build textures
      }
    };

    // Restore sprite sheets
    if (data.spriteSheets) {
      for (const ss of data.spriteSheets) {
        this.spriteSheets.set(ss.assetId, ss);
        if (ss.imageDataUrl && !ss.image) {
          pendingImages++;
          const img = new Image();
          img.onload = () => { ss.image = img; onImageReady(); };
          img.onerror = () => { console.warn(`[Scene2DManager] Failed to load spritesheet image: ${ss.assetName}`); onImageReady(); };
          img.src = ss.imageDataUrl;
        }
      }
    }

    // Restore tilesets
    if (data.tilesets) {
      for (const ts of data.tilesets) {
        console.log(`[Scene2DManager.fromJSON]   tileset "${ts.assetName}" id=${ts.assetId} hasImage=${!!ts.image} hasDataUrl=${!!ts.imageDataUrl} dataUrlLen=${ts.imageDataUrl?.length ?? 0}`);
        // Preserve existing HTMLImageElement if we already have one in memory
        const existing = this.tilesets.get(ts.assetId);
        if (existing?.image && !ts.image) {
          ts.image = existing.image;
        }
        this.tilesets.set(ts.assetId, ts);
        // If tileset still has no image but has a persisted data URL, restore it
        if (ts.imageDataUrl && !ts.image) {
          pendingImages++;
          const img = new Image();
          img.onload = () => { console.log(`[Scene2DManager] Tileset image loaded: "${ts.assetName}"`); ts.image = img; onImageReady(); };
          img.onerror = () => { console.warn(`[Scene2DManager] Failed to load tileset image: ${ts.assetName}`); onImageReady(); };
          img.src = ts.imageDataUrl;
        }
      }
    }

    if (data.tilemaps) {
      for (const tm of data.tilemaps) {
        const totalTiles = tm.layers?.reduce((sum: number, l: any) => sum + Object.keys(l.tiles || {}).length, 0) ?? 0;
        console.log(`[Scene2DManager.fromJSON]   tilemap "${tm.assetName}" id=${tm.assetId} tilesetId=${tm.tilesetId} layers=${tm.layers?.length ?? 0} totalTiles=${totalTiles}`);
        this.tilemaps.set(tm.assetId, tm);
      }
    }

    console.log(`[Scene2DManager.fromJSON] Restore complete: ${this.tilesets.size} tilesets, ${this.tilemaps.size} tilemaps, ${pendingImages} images pending`);
    // Emit immediately so panels receive structural data (names, layers, tile records).
    // A second _emit() fires after all images finish loading.
    this._emit();
  }

  // ---- Cleanup ----

  cleanup(): void {
    this.camera2D?.dispose();
    this.camera2D = null;
    this.physics2D?.cleanup();
    this.physics2D = null;
    this.debugDraw.dispose();
    this.root2D.clear();
    this._gridGroup.clear();
    this._tileGridGroup.clear();
    this.spriteSheets.clear();
    this.tilesets.clear();
    this.tilemaps.clear();
  }

  // ---- Events ----

  onChange(cb: () => void): void { this._onChange.push(cb); }

  private _emit(): void {
    for (const cb of this._onChange) cb();
  }
}
