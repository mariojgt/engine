/**
 * Professional viewport grid system — UE-style adaptive grid with axis indicators.
 *
 * Features:
 *  - Adaptive grid density based on camera distance
 *  - Coloured axis lines (X=red, Y=green, Z=blue)
 *  - World origin marker
 *  - Toggle show/hide
 */

import * as THREE from 'three';

export class ViewportGrid {
  private _scene: THREE.Scene;
  private _gridHelper: THREE.GridHelper | null = null;
  private _axisHelper: THREE.AxesHelper | null = null;
  private _originMarker: THREE.Mesh | null = null;

  private _enabled = false; // Disabled by default — DevGroundPlane is the primary floor visual
  private _showAxes = true;
  private _currentCellSize = 1;

  /* Settings */
  gridSize = 200;
  gridDivisions = 200;
  color1 = new THREE.Color('#333355');
  color2 = new THREE.Color('#222244');

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    this._create();
  }

  get enabled() { return this._enabled; }
  set enabled(v: boolean) {
    this._enabled = v;
    if (this._gridHelper) this._gridHelper.visible = v;
    if (this._originMarker) this._originMarker.visible = v;
  }

  get showAxes() { return this._showAxes; }
  set showAxes(v: boolean) {
    this._showAxes = v;
    if (this._axisHelper) this._axisHelper.visible = v;
  }

  /** Recreate the grid (called if settings change) */
  rebuild(): void {
    this._dispose();
    this._create();
  }

  /** Adaptive grid update — called per frame */
  update(cameraDistance: number): void {
    const newCellSize = this._adaptiveCellSize(cameraDistance);
    if (newCellSize !== this._currentCellSize) {
      this._currentCellSize = newCellSize;
      // Rebuild grid with new density
      const divisions = Math.round(this.gridSize / newCellSize);
      if (this._gridHelper) {
        this._scene.remove(this._gridHelper);
        this._gridHelper.dispose();
      }
      this._gridHelper = new THREE.GridHelper(this.gridSize, divisions, this.color1, this.color2);
      this._gridHelper.position.y = 0;
      this._gridHelper.visible = this._enabled;
      this._gridHelper.userData.__isViewportHelper = true;
      this._gridHelper.raycast = () => {}; // Un-pickable
      this._scene.add(this._gridHelper);
    }
  }

  dispose(): void {
    this._dispose();
  }

  /* -------- private -------- */

  private _create(): void {
    // Grid
    this._gridHelper = new THREE.GridHelper(this.gridSize, this.gridDivisions, this.color1, this.color2);
    this._gridHelper.position.y = 0;
    this._gridHelper.visible = this._enabled;
    this._gridHelper.userData.__isViewportHelper = true;
    this._gridHelper.raycast = () => {};
    this._scene.add(this._gridHelper);

    // Axis helper (X=red, Y=green, Z=blue)
    this._axisHelper = new THREE.AxesHelper(50);
    this._axisHelper.visible = this._showAxes;
    this._axisHelper.userData.__isViewportHelper = true;
    this._axisHelper.raycast = () => {};
    this._scene.add(this._axisHelper);

    // Origin marker
    const geo = new THREE.SphereGeometry(0.08, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this._originMarker = new THREE.Mesh(geo, mat);
    this._originMarker.userData.__isViewportHelper = true;
    this._originMarker.raycast = () => {};
    this._originMarker.visible = this._enabled;
    this._scene.add(this._originMarker);
  }

  private _adaptiveCellSize(distance: number): number {
    if (distance < 5) return 0.1;
    if (distance < 20) return 0.5;
    if (distance < 50) return 1;
    if (distance < 200) return 5;
    if (distance < 1000) return 10;
    return 50;
  }

  private _dispose(): void {
    if (this._gridHelper) {
      this._scene.remove(this._gridHelper);
      this._gridHelper.dispose();
      this._gridHelper = null;
    }
    if (this._axisHelper) {
      this._scene.remove(this._axisHelper);
      this._axisHelper.dispose();
      this._axisHelper = null;
    }
    if (this._originMarker) {
      this._scene.remove(this._originMarker);
      (this._originMarker.geometry as THREE.BufferGeometry).dispose();
      (this._originMarker.material as THREE.Material).dispose();
      this._originMarker = null;
    }
  }
}
