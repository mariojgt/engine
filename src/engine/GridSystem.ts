// ============================================================
//  GridSystem — runtime tile grid for placing actors on a plane
//
//  Lives on a Scene (one instance per scene). Maps integer
//  cell coordinates (gx, gz) to a single GameObject + cardinal
//  direction. Conversion is on the X/Z plane with cell-center
//  alignment; Y is preserved from the actor (or `placementY`).
//
//  Responsibilities:
//    - world ↔ grid coordinate conversion
//    - occupancy: at most one actor per cell
//    - per-cell direction (N/E/S/W) + automatic yaw on placement
//    - neighbor lookup by cardinal direction
//    - serialize/deserialize cell state for save games
//
//  Not responsible for:
//    - spawning actors (caller decides what to place)
//    - movement of items along a chain (game-side blueprint job)
//    - rendering/overlay (use Engine.drawDebugGridCell)
// ============================================================

import * as THREE from 'three';
import type { GameObject } from './GameObject';
import { dirNormalize, dirToVector, dirToYaw } from './Direction';

export interface GridCell {
  gx: number;
  gz: number;
  dir: number;
  gameObject: GameObject;
}

export interface SerializedGridCell {
  gx: number;
  gz: number;
  dir: number;
  /** Best-effort identifier for the actor — blueprint asset id, name, or tag. */
  classId: string | null;
  className: string | null;
  /** Actor name for round-trip lookups. */
  actorName: string;
}

const cellKey = (gx: number, gz: number) => `${gx | 0},${gz | 0}`;

export class GridSystem {
  /** World-space side length of one cell (square). */
  public cellSize: number = 1.0;
  /** World-space Y placed actors snap to (in addition to keeping their offset). */
  public placementY: number = 0;
  /** When true, placing on an occupied cell removes the existing actor first. */
  public replaceOnPlace: boolean = false;

  private _cells = new Map<string, GridCell>();
  private _byActor = new WeakMap<GameObject, GridCell>();

  // ── Coordinate conversion ──────────────────────────────────

  worldToGrid(x: number, z: number): { gx: number; gz: number } {
    return {
      gx: Math.floor(x / this.cellSize + 0.5),
      gz: Math.floor(z / this.cellSize + 0.5),
    };
  }

  gridToWorld(gx: number, gz: number): { x: number; y: number; z: number } {
    return {
      x: gx * this.cellSize,
      y: this.placementY,
      z: gz * this.cellSize,
    };
  }

  // ── Placement ──────────────────────────────────────────────

  /**
   * Bind an actor to (gx, gz) with a cardinal direction.
   * Updates the actor's position & Y-rotation to match the cell.
   * Returns false if the cell is already occupied (and replaceOnPlace is off).
   */
  place(go: GameObject, gx: number, gz: number, dir: number): boolean {
    if (!go) return false;
    const key = cellKey(gx, gz);
    const existing = this._cells.get(key);
    if (existing && existing.gameObject !== go) {
      if (!this.replaceOnPlace) return false;
      this.remove(existing.gameObject);
    }
    // Remove from previous cell if this actor was already on the grid.
    const prev = this._byActor.get(go);
    if (prev) this._cells.delete(cellKey(prev.gx, prev.gz));

    const d = dirNormalize(dir);
    const cell: GridCell = { gx: gx | 0, gz: gz | 0, dir: d, gameObject: go };
    this._cells.set(key, cell);
    this._byActor.set(go, cell);

    const w = this.gridToWorld(cell.gx, cell.gz);
    // Preserve actor's existing Y-offset above the placement plane.
    const prevY = (go as any).position?.y;
    const y = (typeof prevY === 'number' && prevY !== 0) ? prevY : w.y;
    if ((go as any).position) (go as any).position.set(w.x, y, w.z);
    if ((go as any).rotation) {
      // Only override yaw, keep pitch/roll the user authored.
      (go as any).rotation.y = dirToYaw(d);
    }
    return true;
  }

  /** Remove an actor from the grid. Returns true if it was bound. */
  remove(go: GameObject): boolean {
    if (!go) return false;
    const cell = this._byActor.get(go);
    if (!cell) return false;
    this._cells.delete(cellKey(cell.gx, cell.gz));
    this._byActor.delete(go);
    return true;
  }

  /** Remove whatever (if anything) is at (gx, gz). Returns the freed actor or null. */
  removeAt(gx: number, gz: number): GameObject | null {
    const cell = this._cells.get(cellKey(gx, gz));
    if (!cell) return null;
    this._cells.delete(cellKey(gx, gz));
    this._byActor.delete(cell.gameObject);
    return cell.gameObject;
  }

  // ── Queries ────────────────────────────────────────────────

  getAt(gx: number, gz: number): GameObject | null {
    return this._cells.get(cellKey(gx, gz))?.gameObject ?? null;
  }

  getCellOf(go: GameObject): GridCell | null {
    return go ? (this._byActor.get(go) ?? null) : null;
  }

  isOccupied(gx: number, gz: number): boolean {
    return this._cells.has(cellKey(gx, gz));
  }

  /** Walk one cell along `dir` from `go` and return whatever's there (or null). */
  getNeighbor(go: GameObject, dir: number): GameObject | null {
    const cell = this.getCellOf(go);
    if (!cell) return null;
    const v = dirToVector(dir);
    return this.getAt(cell.gx + Math.round(v.x), cell.gz + Math.round(v.z));
  }

  /** Walk one cell forward along the actor's *own* direction. */
  getForwardNeighbor(go: GameObject): GameObject | null {
    const cell = this.getCellOf(go);
    if (!cell) return null;
    return this.getNeighbor(go, cell.dir);
  }

  forEachCell(fn: (cell: GridCell) => void): void {
    for (const cell of this._cells.values()) fn(cell);
  }

  cellCount(): number { return this._cells.size; }

  clear(): void {
    this._cells.clear();
    // WeakMap entries fall away naturally.
  }

  // ── Serialization ──────────────────────────────────────────

  serialize(): SerializedGridCell[] {
    const out: SerializedGridCell[] = [];
    for (const cell of this._cells.values()) {
      const go: any = cell.gameObject;
      out.push({
        gx: cell.gx,
        gz: cell.gz,
        dir: cell.dir,
        classId: go?.actorAssetId ?? go?.blueprintId ?? null,
        className: go?.actorClassName ?? go?.name ?? null,
        actorName: go?.name ?? '',
      });
    }
    return out;
  }

  /**
   * Re-place actors after a load. The caller provides `spawn(entry)` which
   * returns a GameObject (typically by calling Scene.spawnActorFromClass).
   * The grid does NOT spawn actors itself — that's a game-policy decision.
   */
  deserialize(
    entries: SerializedGridCell[],
    spawn: (entry: SerializedGridCell) => GameObject | null,
  ): number {
    let placed = 0;
    for (const entry of entries) {
      const go = spawn(entry);
      if (!go) continue;
      if (this.place(go, entry.gx, entry.gz, entry.dir)) placed++;
    }
    return placed;
  }

  // ── Helpers ────────────────────────────────────────────────

  /** Snap a world position to the center of its containing cell. */
  snapToCell(x: number, z: number): THREE.Vector3 {
    const { gx, gz } = this.worldToGrid(x, z);
    const w = this.gridToWorld(gx, gz);
    return new THREE.Vector3(w.x, w.y, w.z);
  }
}
