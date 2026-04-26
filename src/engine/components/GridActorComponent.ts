// ============================================================
//  GridActorComponent — marks an actor as grid-bound
//
//  Attach to any GameObject that should occupy a grid cell.
//  Auto-unbinds from the scene's GridSystem when the actor is
//  destroyed or this component is detached.
//
//  Use the blueprint nodes (Place On Grid / Remove From Grid /
//  Get Neighbor Grid Actor / etc.) to drive cell assignment;
//  this component is just the lifecycle hook.
// ============================================================

import { Component } from '../Component';
import type { GameObject } from '../GameObject';
import type { GridSystem } from '../GridSystem';

export class GridActorComponent extends Component {
  /** Optional gameplay tag to disambiguate actor roles inside a cell (e.g. 'belt', 'item'). */
  public role: string = '';

  onAttach(gameObject: GameObject): void {
    super.onAttach(gameObject);
  }

  onDetach(): void {
    const grid = findGrid(this.gameObject);
    if (grid) grid.remove(this.gameObject);
  }

  onDestroy?(): void {
    const grid = findGrid(this.gameObject);
    if (grid) grid.remove(this.gameObject);
  }
}

function findGrid(go: GameObject | undefined): GridSystem | null {
  const scene: any = (go as any)?.__scene ?? (go as any)?.scene ?? null;
  return scene?.gridSystem ?? null;
}
