// ============================================================
//  NavMeshPanel — Navigation Mesh editor panel
//  Allows configuring NavMesh generation parameters, baking
//  the NavMesh from scene geometry, toggling debug visualization,
//  and managing NavMesh bounds volumes.
//
//  UE parity:
//  - RecastNavMesh-Default properties panel
//  - NavMesh Bounds Volume placement
//  - Build / Rebuild NavMesh
//  - Show Navigation (P key in UE)
// ============================================================

import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { NavMeshSystem, defaultNavMeshConfig, type NavMeshConfig } from '../engine/ai/NavMeshSystem';
import type { Scene2DManager } from './Scene2DManager';
import { iconHTML, Icons } from './icons';

export class NavMeshPanel {
  public container: HTMLElement;
  private _engine: Engine;
  private _config: NavMeshConfig;
  private _statusEl: HTMLElement | null = null;
  private _bakeBtn: HTMLButtonElement | null = null;
  private _scene2DManager: Scene2DManager | null = null;

  /** 2D-specific bounds override — if null, auto-computed from tilemaps + actors */
  private _boundsMin: { x: number; y: number; z?: number } = { x: -10, y: -10, z: -10 };
  private _boundsMax: { x: number; y: number; z?: number } = { x: 10, y: 10, z: 10 };
  private _useBounds: boolean = false;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this._engine = engine;
    this._config = { ...defaultNavMeshConfig() };
    // Sync from engine's navMeshSystem if it has a config
    if (engine.navMeshSystem) {
      this._config = { ...engine.navMeshSystem.config };
    }
    this._build();
  }

  /** Provide access to the Scene2DManager so the panel can detect 2D mode */
  setScene2DManager(manager: Scene2DManager): void {
    this._scene2DManager = manager;
  }

  /** Rebuild the panel UI */
  refresh(): void {
    this._build();
  }

  // ─── Build ────────────────────────────────────────────────────

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel navmesh-panel';

    const is2D = this._scene2DManager?.is2D ?? false;

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `${iconHTML(Icons.Map, 'sm', '#00cc88')} Navigation Mesh ${is2D ? '(2D)' : ''}`;
    this.container.appendChild(header);

    // ── Body ──
    const body = document.createElement('div');
    body.className = 'panel-body';
    body.style.overflowY = 'auto';
    body.style.padding = '8px';
    this.container.appendChild(body);

    // ── Status ──
    const statusRow = document.createElement('div');
    statusRow.className = 'navmesh-status';
    this._statusEl = document.createElement('span');
    this._updateStatus();
    statusRow.appendChild(this._statusEl);
    body.appendChild(statusRow);

    // ── Actions ──
    const actionsRow = document.createElement('div');
    actionsRow.className = 'navmesh-actions';

    // Bake button
    this._bakeBtn = document.createElement('button');
    this._bakeBtn.className = 'navmesh-btn navmesh-btn-bake';
    this._bakeBtn.innerHTML = `${iconHTML(Icons.Zap, 'sm', '#fff')} Build NavMesh`;
    this._bakeBtn.addEventListener('click', () => this._bakeNavMesh());
    actionsRow.appendChild(this._bakeBtn);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'navmesh-btn navmesh-btn-clear';
    clearBtn.innerHTML = `${iconHTML(Icons.Trash2, 'sm', '#fff')} Clear`;
    clearBtn.addEventListener('click', () => this._clearNavMesh());
    actionsRow.appendChild(clearBtn);

    // Debug toggle button
    const debugBtn = document.createElement('button');
    debugBtn.className = 'navmesh-btn navmesh-btn-debug';
    debugBtn.innerHTML = `${iconHTML(Icons.Eye, 'sm', '#fff')} Toggle Debug`;
    debugBtn.addEventListener('click', () => this._toggleDebug());
    actionsRow.appendChild(debugBtn);

    body.appendChild(actionsRow);

    // ── Bounds Settings (shown in both 2D and 3D) ──
    const autoBtn = document.createElement('button');
    autoBtn.className = 'navmesh-btn navmesh-btn-debug';
    autoBtn.innerHTML = `${iconHTML(Icons.Zap, 'sm', '#fff')} Auto-Detect Bounds`;
    autoBtn.addEventListener('click', () => {
      if (is2D) {
        this._autoDetect2DBounds();
      } else {
        this._autoDetect3DBounds();
      }
      this._useBounds = true;
      this._build(); // refresh inputs
    });
    const autoBtnRow = document.createElement('div');
    autoBtnRow.className = 'navmesh-actions';
    autoBtnRow.style.marginTop = '4px';
    autoBtnRow.appendChild(autoBtn);
    body.appendChild(autoBtnRow);

    // Checkbox to enable/disable bounds
    const useBoundsRow = document.createElement('div');
    useBoundsRow.className = 'navmesh-row';
    useBoundsRow.style.marginTop = '8px';
    const useBoundsLbl = document.createElement('label');
    useBoundsLbl.className = 'navmesh-label';
    useBoundsLbl.textContent = 'Use Custom Bounds';
    const useBoundsCb = document.createElement('input');
    useBoundsCb.type = 'checkbox';
    useBoundsCb.checked = this._useBounds;
    useBoundsCb.addEventListener('change', () => {
      this._useBounds = useBoundsCb.checked;
      this._build();
    });
    useBoundsRow.appendChild(useBoundsLbl);
    useBoundsRow.appendChild(useBoundsCb);
    body.appendChild(useBoundsRow);

    if (this._useBounds) {
      if (is2D) {
        body.appendChild(this._group('2D Walkable Bounds', [
          this._numberRow('Min X', this._boundsMin.x, -1000, 1000, 0.5, (v) => { this._boundsMin.x = v; }),
          this._numberRow('Min Y', this._boundsMin.y, -1000, 1000, 0.5, (v) => { this._boundsMin.y = v; }),
          this._numberRow('Max X', this._boundsMax.x, -1000, 1000, 0.5, (v) => { this._boundsMax.x = v; }),
          this._numberRow('Max Y', this._boundsMax.y, -1000, 1000, 0.5, (v) => { this._boundsMax.y = v; }),
        ]));
      } else {
        body.appendChild(this._group('3D Walkable Bounds', [
          this._numberRow('Min X', this._boundsMin.x, -1000, 1000, 0.5, (v) => { this._boundsMin.x = v; }),
          this._numberRow('Min Y', this._boundsMin.y, -1000, 1000, 0.5, (v) => { this._boundsMin.y = v; }),
          this._numberRow('Min Z', this._boundsMin.z ?? -10, -1000, 1000, 0.5, (v) => { this._boundsMin.z = v; }),
          this._numberRow('Max X', this._boundsMax.x, -1000, 1000, 0.5, (v) => { this._boundsMax.x = v; }),
          this._numberRow('Max Y', this._boundsMax.y, -1000, 1000, 0.5, (v) => { this._boundsMax.y = v; }),
          this._numberRow('Max Z', this._boundsMax.z ?? 10, -1000, 1000, 0.5, (v) => { this._boundsMax.z = v; }),
        ]));
      }
    }

    // ── Separator ──
    const sep = document.createElement('div');
    sep.className = 'navmesh-separator';
    body.appendChild(sep);

    // ── Agent Settings ──
    body.appendChild(this._group('Agent', [
      this._numberRow('Height', this._config.agentHeight, 0.1, 10, 0.1, (v) => { this._config.agentHeight = v; }),
      this._numberRow('Radius', this._config.agentRadius, 0.1, 5, 0.05, (v) => { this._config.agentRadius = v; }),
      this._numberRow('Max Climb', this._config.agentMaxClimb, 0, 5, 0.1, (v) => { this._config.agentMaxClimb = v; }),
      this._numberRow('Max Slope (°)', this._config.agentMaxSlope, 0, 90, 1, (v) => { this._config.agentMaxSlope = v; }),
    ]));

    // ── Cell Settings ──
    body.appendChild(this._group('Voxelization', [
      this._numberRow('Cell Size', this._config.cellSize, 0.05, 5, 0.05, (v) => { this._config.cellSize = v; }),
      this._numberRow('Cell Height', this._config.cellHeight, 0.05, 5, 0.05, (v) => { this._config.cellHeight = v; }),
    ]));

    // ── Region Settings ──
    body.appendChild(this._group('Region', [
      this._numberRow('Min Region Size', this._config.regionMinSize, 0, 100, 1, (v) => { this._config.regionMinSize = v; }),
      this._numberRow('Merge Size', this._config.regionMergeSize, 0, 100, 1, (v) => { this._config.regionMergeSize = v; }),
    ]));

    // ── Edge Settings ──
    body.appendChild(this._group('Edges', [
      this._numberRow('Max Edge Length', this._config.edgeMaxLen, 0, 100, 1, (v) => { this._config.edgeMaxLen = v; }),
      this._numberRow('Max Edge Error', this._config.edgeMaxError, 0, 10, 0.1, (v) => { this._config.edgeMaxError = v; }),
    ]));

    // ── Detail Mesh ──
    body.appendChild(this._group('Detail Mesh', [
      this._numberRow('Sample Distance', this._config.detailSampleDist, 0, 50, 1, (v) => { this._config.detailSampleDist = v; }),
      this._numberRow('Sample Max Error', this._config.detailSampleMaxError, 0, 10, 0.1, (v) => { this._config.detailSampleMaxError = v; }),
    ]));

    // ── Tiling ──
    body.appendChild(this._group('Tiling (0 = Solo)', [
      this._numberRow('Tile Size', this._config.tileSize, 0, 1024, 8, (v) => { this._config.tileSize = Math.round(v); }),
    ]));

    // ── Info ──
    const infoBox = document.createElement('div');
    infoBox.className = 'navmesh-info';
      if (is2D) {
      infoBox.innerHTML = `
        <p><strong>2D NavMesh Tips:</strong></p>
        <ul>
          <li>Use <em>Auto-Detect Bounds</em> to scan tilemaps + actors</li>
          <li>Collision tiles are automatically used as obstacles</li>
          <li>Adjust bounds manually if needed for your walkable area</li>
          <li>AI Controllers will auto-use NavMesh for pathfinding</li>
        </ul>
      `;
    } else {
      infoBox.innerHTML = `
        <p><strong>Tips:</strong></p>
        <ul>
          <li>Use <em>Auto-Detect Bounds</em> to limit generation area</li>
          <li>Lower <em>Cell Size</em> = more detail, slower build</li>
          <li>Set <em>Tile Size</em> &gt; 0 to enable dynamic obstacles</li>
          <li>Make sure scene has geometry (floors, walls) before baking</li>
          <li>AI Controllers will auto-use NavMesh for pathfinding</li>
        </ul>
      `;
    }
    body.appendChild(infoBox);
  }

  // ─── Actions ──────────────────────────────────────────────────

  private async _bakeNavMesh(): Promise<void> {
    if (this._bakeBtn) {
      this._bakeBtn.disabled = true;
      this._bakeBtn.textContent = 'Building...';
    }

    try {
      const navSys = this._engine.navMeshSystem;
      // Apply config
      navSys.config = { ...this._config };

      const is2D = this._scene2DManager?.is2D ?? false;
      let success = false;

      if (is2D) {
        // ── 2D Build: extract obstacles from tilemap collision layers ──
        const obstacles = this._extract2DObstacles();
        success = await navSys.generateFrom2DBounds(
          this._boundsMin,
          this._boundsMax,
          obstacles,
          this._config,
        );

        if (success) {
          this._setStatus('ready', `NavMesh built 2D (${obstacles.length} obstacles)`);
          // Show debug in 2D — rotate to XY plane
          navSys.showDebug2D(this._engine.scene.threeScene);
        } else {
          this._setStatus('error', 'Build failed — check 2D bounds');
        }
      } else {
        // ── 3D Build ──
        // Always ensure bounds are set for 3D to prevent Recast from trying to
        // voxelize enormous geometry (e.g. a 1000×1000 DevGroundPlane).
        // If user has custom bounds, use those; otherwise auto-detect from scene.
        if (this._useBounds) {
          this._config.boundsMin = { x: this._boundsMin.x, y: this._boundsMin.y, z: this._boundsMin.z ?? -10 };
          this._config.boundsMax = { x: this._boundsMax.x, y: this._boundsMax.y, z: this._boundsMax.z ?? 10 };
        } else {
          // Auto-detect bounds from all scene geometry including DevGroundPlane
          this._autoDetect3DBounds();
          this._config.boundsMin = { x: this._boundsMin.x, y: this._boundsMin.y, z: this._boundsMin.z ?? -10 };
          this._config.boundsMax = { x: this._boundsMax.x, y: this._boundsMax.y, z: this._boundsMax.z ?? 10 };
          console.log(`[NavMesh Panel] Auto-detected 3D bounds: (${this._boundsMin.x.toFixed(1)}, ${this._boundsMin.y.toFixed(1)}, ${(this._boundsMin.z ?? -10).toFixed(1)}) → (${this._boundsMax.x.toFixed(1)}, ${this._boundsMax.y.toFixed(1)}, ${(this._boundsMax.z ?? 10).toFixed(1)})`);
        }
        
        success = await navSys.generateFromScene(
          this._engine.scene.threeScene,
          this._config,
        );

        if (success) {
          this._setStatus('ready', `NavMesh built (${this._countPolys()} polys)`);
          // Auto-show debug visualization
          navSys.showDebug(this._engine.scene.threeScene);
        } else {
          this._setStatus('error', 'Build failed — no walkable geometry?');
        }
      }
    } catch (err) {
      console.error('[NavMesh Panel] Build error:', err);
      this._setStatus('error', `Build error: ${(err as Error).message}`);
    }

    if (this._bakeBtn) {
      this._bakeBtn.disabled = false;
      this._bakeBtn.innerHTML = `${iconHTML(Icons.Zap, 'sm', '#fff')} Build NavMesh`;
    }
  }

  private _clearNavMesh(): void {
    this._engine.navMeshSystem.destroy();
    this._engine.navMeshSystem = new NavMeshSystem(this._config);
    this._setStatus('none', 'No NavMesh');
  }

  private _toggleDebug(): void {
    const navSys = this._engine.navMeshSystem;
    if (!navSys.isReady) {
      this._setStatus('warning', 'Build NavMesh first');
      return;
    }
    const is2D = this._scene2DManager?.is2D ?? false;
    if (is2D) {
      navSys.toggleDebug2D(this._engine.scene.threeScene);
    } else {
      navSys.toggleDebug(this._engine.scene.threeScene);
    }
  }

  private _countPolys(): string {
    // Rough estimate from navmesh
    return '✓';
  }

  // ─── 2D Helpers ───────────────────────────────────────────────

  /**
   * Auto-detect 2D walkable bounds from tilemap extents + actor positions.
   * Adds a 1-unit margin around the detected area.
   */
  private _autoDetect2DBounds(): void {
    const mgr = this._scene2DManager;
    if (!mgr) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;

    // Scan tilemaps for placed tiles
    for (const tilemap of mgr.tilemaps.values()) {
      const tileset = mgr.tilesets.get(tilemap.tilesetId);
      if (!tileset) continue;
      const ppu = tileset.pixelsPerUnit || 100;
      const tw = tileset.tileWidth / ppu;
      const th = tileset.tileHeight / ppu;
      for (const layer of tilemap.layers) {
        for (const key of Object.keys(layer.tiles)) {
          const [cx, cy] = key.split(',').map(Number);
          const tileMinX = cx * tw;
          const tileMinY = cy * th;
          const tileMaxX = tileMinX + tw;
          const tileMaxY = tileMinY + th;
          if (tileMinX < minX) minX = tileMinX;
          if (tileMinY < minY) minY = tileMinY;
          if (tileMaxX > maxX) maxX = tileMaxX;
          if (tileMaxY > maxY) maxY = tileMaxY;
          found = true;
        }
      }
    }

    // Also consider game object positions (actors placed in the scene)
    if (this._engine.scene?.gameObjects) {
      for (const go of this._engine.scene.gameObjects) {
        const pos = go.mesh?.position ?? go.position;
        if (!pos) continue;
        // In 2D the editor stores actor positions using x,y
        const px = pos.x;
        const py = pos.y;
        if (px - 1 < minX) minX = px - 1;
        if (py - 1 < minY) minY = py - 1;
        if (px + 1 > maxX) maxX = px + 1;
        if (py + 1 > maxY) maxY = py + 1;
        found = true;
      }
    }

    if (!found) {
      // Fallback to a sensible default
      this._boundsMin = { x: -10, y: -10 };
      this._boundsMax = { x: 10, y: 10 };
      this._setStatus('warning', 'No tilemaps/actors found — using defaults');
    } else {
      // Add margin
      const margin = 1;
      this._boundsMin = { x: minX - margin, y: minY - margin };
      this._boundsMax = { x: maxX + margin, y: maxY + margin };
      this._setStatus('none', `Bounds: (${this._boundsMin.x.toFixed(1)}, ${this._boundsMin.y.toFixed(1)}) → (${this._boundsMax.x.toFixed(1)}, ${this._boundsMax.y.toFixed(1)})`);
    }
  }

  /**
   * Auto-detect 3D walkable bounds from scene geometry.
   */
  private _autoDetect3DBounds(): void {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let found = false;

    const scene = this._engine.scene.threeScene;
    const box = new THREE.Box3();
    
    scene.traverse((obj: any) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.geometry) return;
      if (obj.userData.__navmeshHelper) return;
      if (obj.userData.__crowdHelper) return;
      if (obj.visible === false) return;

      obj.geometry.computeBoundingBox();
      if (obj.geometry.boundingBox) {
        box.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
        if (box.min.x < minX) minX = box.min.x;
        if (box.min.y < minY) minY = box.min.y;
        if (box.min.z < minZ) minZ = box.min.z;
        if (box.max.x > maxX) maxX = box.max.x;
        if (box.max.y > maxY) maxY = box.max.y;
        if (box.max.z > maxZ) maxZ = box.max.z;
        found = true;
      }
    });

    if (!found) {
      this._boundsMin = { x: -10, y: -10, z: -10 };
      this._boundsMax = { x: 10, y: 10, z: 10 };
      this._setStatus('warning', 'No 3D geometry found — using defaults');
    } else {
      const margin = 1;
      this._boundsMin = { x: minX - margin, y: minY - margin, z: minZ - margin };
      this._boundsMax = { x: maxX + margin, y: maxY + margin, z: maxZ + margin };
      this._setStatus('none', `Bounds: (${this._boundsMin.x.toFixed(1)}, ${this._boundsMin.y.toFixed(1)}, ${this._boundsMin.z?.toFixed(1)}) → (${this._boundsMax.x.toFixed(1)}, ${this._boundsMax.y.toFixed(1)}, ${this._boundsMax.z?.toFixed(1)})`);
    }
  }

  /**
   * Extract 2D obstacle rectangles from tilemap collision layers.
   * Each collision tile becomes an obstacle box that the NavMesh will carve out.
   */
  private _extract2DObstacles(): Array<{ min: { x: number; y: number }; max: { x: number; y: number } }> {
    const obstacles: Array<{ min: { x: number; y: number }; max: { x: number; y: number } }> = [];
    const mgr = this._scene2DManager;
    if (!mgr) return obstacles;

    for (const tilemap of mgr.tilemaps.values()) {
      const tileset = mgr.tilesets.get(tilemap.tilesetId);
      if (!tileset) continue;
      const ppu = tileset.pixelsPerUnit || 100;
      const tw = tileset.tileWidth / ppu;
      const th = tileset.tileHeight / ppu;

      for (const layer of tilemap.layers) {
        if (!layer.hasCollision) continue; // only collision layers
        for (const key of Object.keys(layer.tiles)) {
          const [cx, cy] = key.split(',').map(Number);
          obstacles.push({
            min: { x: cx * tw, y: cy * th },
            max: { x: (cx + 1) * tw, y: (cy + 1) * th },
          });
        }
      }
    }

    console.log(`[NavMesh Panel] Extracted ${obstacles.length} obstacle tiles from collision layers`);
    return obstacles;
  }

  // ─── Status ───────────────────────────────────────────────────

  private _updateStatus(): void {
    if (!this._statusEl) return;
    const navSys = this._engine.navMeshSystem;
    if (navSys.isReady) {
      this._setStatus('ready', 'NavMesh ready');
    } else {
      this._setStatus('none', 'No NavMesh — click Build');
    }
  }

  private _setStatus(type: 'none' | 'ready' | 'error' | 'warning', text: string): void {
    if (!this._statusEl) return;
    const colorMap = {
      none: '#888',
      ready: '#4CAF50',
      error: '#f44336',
      warning: '#FF9800',
    };
    this._statusEl.style.color = colorMap[type];
    this._statusEl.textContent = text;
  }

  // ─── UI Helpers ───────────────────────────────────────────────

  private _group(title: string, rows: HTMLElement[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'navmesh-group';

    const heading = document.createElement('div');
    heading.className = 'navmesh-group-header';
    heading.textContent = title;
    wrapper.appendChild(heading);

    const content = document.createElement('div');
    content.className = 'navmesh-group-content';
    for (const row of rows) content.appendChild(row);
    wrapper.appendChild(content);

    return wrapper;
  }

  private _numberRow(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'navmesh-row';

    const lbl = document.createElement('label');
    lbl.className = 'navmesh-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const input = document.createElement('input');
    input.className = 'navmesh-input';
    input.type = 'number';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) onChange(v);
    });
    row.appendChild(input);

    return row;
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
