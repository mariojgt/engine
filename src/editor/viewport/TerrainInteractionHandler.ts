// ============================================================
//  TerrainInteractionHandler — Viewport interaction for terrain
//  sculpting, texture painting, and foliage placement.
//
//  Manages:
//  • Raycasting mouse → terrain mesh
//  • Brush stroke application (per tick while LMB held)
//  • Brush cursor position updates
//  • Undo/redo snapshot management
// ============================================================

import * as THREE from 'three';
import { TerrainActor } from '../scene/TerrainActor';
import type {
  SculptTool,
  TerrainMode,
  BrushSettings,
  FoliageTypeDef,
  FoliageInstance,
} from '../../engine/TerrainData';
import { terrainUid, defaultFoliageType } from '../../engine/TerrainData';

// ---- Undo snapshot ----

interface HeightmapSnapshot {
  type: 'heightmap';
  heightmap: Float32Array;
}

interface SplatmapSnapshot {
  type: 'splatmap';
  splatmaps: Uint8Array[];
}

interface FoliageSnapshot {
  type: 'foliage';
  instances: { typeId: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }[];
}

type TerrainSnapshot = HeightmapSnapshot | SplatmapSnapshot | FoliageSnapshot;

// ============================================================

export class TerrainInteractionHandler {
  private _camera: THREE.PerspectiveCamera;
  private _domElement: HTMLElement;
  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();

  // ---- State ----
  private _active = false; // true when terrain editor panel is open
  private _painting = false; // true while LMB is held
  private _terrain: TerrainActor | null = null;

  // ---- Current tool settings ----
  private _mode: TerrainMode = 'sculpt';
  private _sculptTool: SculptTool = 'raise';
  private _activeLayerIndex = 0;
  private _activeFoliageTypeId: string | null = null;
  private _brush: BrushSettings = { radius: 10, strength: 0.3, falloff: 'smooth' };
  private _flattenTarget: number | null = null; // height at click start for flatten tool

  // ---- Brush cursor ----
  private _lastHitPoint: THREE.Vector3 | null = null;

  // ---- Undo stack ----
  private _undoStack: TerrainSnapshot[] = [];
  private _redoStack: TerrainSnapshot[] = [];
  private _maxUndo = 30;

  // ---- Tick ----
  private _tickId: number | null = null;
  private _tickRate = 1000 / 30; // 30 FPS brush tick

  // ---- Listeners ----
  private _onBrushMove: ((pos: THREE.Vector3 | null) => void)[] = [];

  // ---- Bound handlers ----
  private _boundMouseDown: (e: MouseEvent) => void;
  private _boundMouseMove: (e: MouseEvent) => void;
  private _boundMouseUp: (e: MouseEvent) => void;
  private _boundContextMenu: (e: MouseEvent) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this._camera = camera;
    this._domElement = domElement;

    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundContextMenu = (e) => { if (this._painting) e.preventDefault(); };
  }

  // ============================================================
  //  Public API
  // ============================================================

  /** Activate terrain interaction (called when terrain editor panel opens) */
  activate(terrain: TerrainActor): void {
    this._terrain = terrain;
    this._active = true;
    // Use capture phase so our handler fires BEFORE the ViewportPanel's
    // mousedown (which routes to the selection system).
    this._domElement.addEventListener('mousedown', this._boundMouseDown, true);
    this._domElement.addEventListener('mousemove', this._boundMouseMove);
    this._domElement.addEventListener('contextmenu', this._boundContextMenu);
  }

  /** Deactivate terrain interaction */
  deactivate(): void {
    this._active = false;
    this._painting = false;
    this._terrain?.hideBrush();
    this._terrain = null;
    this._domElement.removeEventListener('mousedown', this._boundMouseDown, true);
    this._domElement.removeEventListener('mousemove', this._boundMouseMove);
    this._domElement.removeEventListener('contextmenu', this._boundContextMenu);
    this._stopTick();
  }

  get isActive(): boolean { return this._active; }
  get isPainting(): boolean { return this._painting; }

  setMode(mode: TerrainMode): void { this._mode = mode; }
  setSculptTool(tool: SculptTool): void { this._sculptTool = tool; }
  setActiveLayerIndex(index: number): void { this._activeLayerIndex = index; }
  setActiveFoliageType(id: string | null): void { this._activeFoliageTypeId = id; }
  setBrush(settings: Partial<BrushSettings>): void { Object.assign(this._brush, settings); }
  getBrush(): BrushSettings { return { ...this._brush }; }
  get terrain(): TerrainActor | null { return this._terrain; }

  onBrushMove(cb: (pos: THREE.Vector3 | null) => void): void {
    this._onBrushMove.push(cb);
  }

  /** Undo last terrain operation */
  undo(): void {
    const snap = this._undoStack.pop();
    if (!snap || !this._terrain) return;

    // Save current state for redo
    this._redoStack.push(this._takeSnapshot(snap.type));

    // Restore
    this._applySnapshot(snap);
  }

  /** Redo last undone operation */
  redo(): void {
    const snap = this._redoStack.pop();
    if (!snap || !this._terrain) return;

    this._undoStack.push(this._takeSnapshot(snap.type));
    this._applySnapshot(snap);
  }

  // ============================================================
  //  Input Handlers
  // ============================================================

  private _updateMouse(e: MouseEvent): void {
    const rect = this._domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private _raycastTerrain(): THREE.Vector3 | null {
    if (!this._terrain?.terrainMesh) return null;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const hits = this._raycaster.intersectObject(this._terrain.terrainMesh, false);
    if (hits.length > 0) {
      // Convert hit to terrain's local space → world
      return hits[0].point.clone();
    }
    return null;
  }

  private _onMouseDown(e: MouseEvent): void {
    if (!this._active || !this._terrain) return;
    if (e.button !== 0) return; // Only LMB
    if (e.altKey || e.ctrlKey || e.metaKey) return; // Don't interfere with camera

    this._updateMouse(e);
    const hit = this._raycastTerrain();
    if (!hit) return;

    // Prevent the selection system and any other listeners from firing.
    // stopImmediatePropagation prevents other listeners on the SAME element;
    // preventDefault suppresses any browser default action.
    e.stopImmediatePropagation();
    e.preventDefault();

    // Save undo snapshot before starting stroke
    this._saveUndoSnapshot();

    this._painting = true;
    this._flattenTarget = null;

    // For flatten tool, record the height at the initial click point
    if (this._mode === 'sculpt' && this._sculptTool === 'flatten') {
      this._flattenTarget = this._terrain.getHeightAtWorld(hit.x, hit.z) / this._terrain.config.maxHeight;
    }

    // Start tick loop
    this._startTick();

    // Apply first stroke immediately
    this._applyBrush(hit);

    window.addEventListener('mouseup', this._boundMouseUp);
  }

  private _onMouseMove(e: MouseEvent): void {
    if (!this._active || !this._terrain) return;
    this._updateMouse(e);

    const hit = this._raycastTerrain();
    this._lastHitPoint = hit;

    // Update brush cursor
    if (hit) {
      this._terrain.showBrush(hit, this._brush.radius);
    } else {
      this._terrain.hideBrush();
    }

    // Notify listeners
    for (const cb of this._onBrushMove) cb(hit);
  }

  private _onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    this._painting = false;
    this._flattenTarget = null;
    this._stopTick();
    window.removeEventListener('mouseup', this._boundMouseUp);
  }

  // ============================================================
  //  Brush Tick Loop
  // ============================================================

  private _startTick(): void {
    if (this._tickId !== null) return;
    this._tickId = window.setInterval(() => {
      if (this._painting && this._lastHitPoint) {
        this._applyBrush(this._lastHitPoint);
      }
    }, this._tickRate);
  }

  private _stopTick(): void {
    if (this._tickId !== null) {
      clearInterval(this._tickId);
      this._tickId = null;
    }
  }

  // ============================================================
  //  Brush Application
  // ============================================================

  private _applyBrush(hitPoint: THREE.Vector3): void {
    if (!this._terrain) return;

    const worldX = hitPoint.x - this._terrain.group.position.x;
    const worldZ = hitPoint.z - this._terrain.group.position.z;

    switch (this._mode) {
      case 'sculpt':
        this._terrain.applySculptBrush(
          worldX, worldZ,
          this._sculptTool,
          this._brush,
          this._flattenTarget ?? undefined,
        );
        break;

      case 'paint':
        this._terrain.applySplatPaint(
          worldX, worldZ,
          this._activeLayerIndex,
          this._brush,
        );
        break;

      case 'foliage':
        this._applyFoliageBrush(worldX, worldZ);
        break;
    }
  }

  private _applyFoliageBrush(worldX: number, worldZ: number): void {
    if (!this._terrain || !this._activeFoliageTypeId) return;

    const foliageType = this._terrain.foliageTypes.find(t => t.id === this._activeFoliageTypeId);
    if (!foliageType) return;

    const count = Math.max(1, Math.round(foliageType.density * this._brush.radius * 0.2));
    const instances: FoliageInstance[] = [];

    for (let i = 0; i < count; i++) {
      // Random position within brush radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * this._brush.radius;
      const px = worldX + Math.cos(angle) * dist;
      const pz = worldZ + Math.sin(angle) * dist;

      // Get terrain height
      const py = this._terrain.getHeightAtWorld(px, pz);

      // Check slope
      const normal = this._terrain.getNormalAtWorld(px, pz);
      const slopeDeg = Math.acos(Math.max(0, Math.min(1, normal.y))) * (180 / Math.PI);
      if (slopeDeg < foliageType.slopeMin || slopeDeg > foliageType.slopeMax) continue;

      // Random scale
      const scale = foliageType.scaleMin + Math.random() * (foliageType.scaleMax - foliageType.scaleMin);

      // Random rotation
      const rotY = foliageType.randomRotationY ? Math.random() * Math.PI * 2 : 0;

      // Align to normal rotation
      let rotX = 0, rotZ = 0;
      if (foliageType.alignToNormal) {
        rotX = Math.atan2(normal.z, normal.y);
        rotZ = -Math.atan2(normal.x, normal.y);
      }

      instances.push({
        typeId: foliageType.id,
        position: { x: px, y: py, z: pz },
        rotation: { x: rotX, y: rotY, z: rotZ },
        scale: { x: scale, y: scale, z: scale },
      });
    }

    if (instances.length > 0) {
      this._terrain.addFoliageInstances(instances);
    }
  }

  // ============================================================
  //  Undo / Redo
  // ============================================================

  private _saveUndoSnapshot(): void {
    if (!this._terrain) return;

    let snapType: 'heightmap' | 'splatmap' | 'foliage';
    switch (this._mode) {
      case 'sculpt': snapType = 'heightmap'; break;
      case 'paint': snapType = 'splatmap'; break;
      case 'foliage': snapType = 'foliage'; break;
    }

    const snap = this._takeSnapshot(snapType);
    this._undoStack.push(snap);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack.length = 0; // Clear redo on new action
  }

  private _takeSnapshot(type: string): TerrainSnapshot {
    const t = this._terrain!;
    switch (type) {
      case 'heightmap':
        return { type: 'heightmap', heightmap: new Float32Array(t.heightmap) };
      case 'splatmap':
        return { type: 'splatmap', splatmaps: t.splatmaps.map(s => new Uint8Array(s)) };
      case 'foliage':
        return { type: 'foliage', instances: t.foliageInstances.map(i => ({ ...i, position: { ...i.position }, rotation: { ...i.rotation }, scale: { ...i.scale } })) };
      default:
        return { type: 'heightmap', heightmap: new Float32Array(t.heightmap) };
    }
  }

  private _applySnapshot(snap: TerrainSnapshot): void {
    if (!this._terrain) return;
    switch (snap.type) {
      case 'heightmap':
        this._terrain.heightmap.set(snap.heightmap);
        this._terrain.updateHeightRegion(0, 0, this._terrain.config.resolution - 1, this._terrain.config.resolution - 1);
        break;
      case 'splatmap':
        for (let i = 0; i < snap.splatmaps.length; i++) {
          if (this._terrain.splatmaps[i]) {
            this._terrain.splatmaps[i].set(snap.splatmaps[i]);
          }
        }
        // Re-upload to GPU
        if (this._terrain.terrainMaterial) {
          if (this._terrain.splatmaps[0]) this._terrain.terrainMaterial.uploadSplatmap(0, this._terrain.splatmaps[0], this._terrain.config.resolution);
          if (this._terrain.splatmaps[1]) this._terrain.terrainMaterial.uploadSplatmap(1, this._terrain.splatmaps[1], this._terrain.config.resolution);
        }
        break;
      case 'foliage':
        this._terrain.foliageInstances = snap.instances.map(i => ({ ...i, position: { ...i.position }, rotation: { ...i.rotation }, scale: { ...i.scale } }));
        // Rebuild all foliage meshes
        const typeIds = new Set(this._terrain.foliageInstances.map(i => i.typeId));
        for (const typeId of typeIds) {
          (this._terrain as any)._rebuildFoliageMesh(typeId);
        }
        break;
    }
  }

  // ============================================================
  //  Cleanup
  // ============================================================

  dispose(): void {
    this.deactivate();
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._onBrushMove.length = 0;
  }
}
