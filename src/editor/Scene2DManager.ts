// ============================================================
//  Scene2DManager — Orchestrates 2D scene mode
//  Manages switching between 2D/3D, holding 2D-specific state,
//  and coordinating 2D assets (sprite sheets, tilesets, tilemaps).
// ============================================================

import * as THREE from 'three';
import { Camera2D, type Camera2DSettings } from '../engine/Camera2D';
import { Physics2DWorld, type Physics2DSettings } from '../engine/Physics2DWorld';
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

  private _onChange: (() => void)[] = [];

  constructor() {
    this.sortingLayers = new SortingLayerManager();
    this.root2D = new THREE.Group();
    this.root2D.name = '__2D_Root__';
    this._gridGroup = new THREE.Group();
    this._gridGroup.name = '__2D_Grid__';
  }

  get is2D(): boolean { return this.sceneMode === '2D'; }

  // ---- Mode switching ----

  async switchTo2D(threeScene: THREE.Scene, domElement: HTMLElement, config?: Scene2DConfig): Promise<void> {
    this.sceneMode = '2D';
    this.config = config ?? defaultScene2DConfig();

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

    // Create 2D grid
    this._buildGrid(threeScene);

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
  }

  // ---- Serialization ----

  toJSON(): any {
    return {
      sceneMode: this.sceneMode,
      config: this.config ? structuredClone(this.config) : null,
      spriteSheets: Array.from(this.spriteSheets.values()).map(ss => ({
        ...ss,
        image: undefined, // Don't serialize HTMLImageElement
        texture: undefined, // Don't serialize THREE.Texture
      })),
      tilesets: Array.from(this.tilesets.values()).map(ts => ({
        ...ts,
        image: undefined,
      })),
      tilemaps: Array.from(this.tilemaps.values()),
    };
  }

  fromJSON(data: any): void {
    if (!data) return;
    this.sceneMode = data.sceneMode ?? '3D';
    this.config = data.config ?? null;
    if (this.config?.sortingLayers) {
      this.sortingLayers.setLayers(this.config.sortingLayers);
    }
    // Restore sprite sheets, tilesets, tilemaps
    if (data.spriteSheets) {
      for (const ss of data.spriteSheets) {
        this.spriteSheets.set(ss.assetId, ss);
      }
    }
    if (data.tilesets) {
      for (const ts of data.tilesets) {
        this.tilesets.set(ts.assetId, ts);
      }
    }
    if (data.tilemaps) {
      for (const tm of data.tilemaps) {
        this.tilemaps.set(tm.assetId, tm);
      }
    }
  }

  // ---- Cleanup ----

  cleanup(): void {
    this.camera2D?.dispose();
    this.camera2D = null;
    this.physics2D?.cleanup();
    this.physics2D = null;
    this.root2D.clear();
    this._gridGroup.clear();
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
