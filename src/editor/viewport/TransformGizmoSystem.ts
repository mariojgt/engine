/**
 * Transform gizmo system — wraps Three.js TransformControls with UE-style features.
 *
 * Features:
 *  - W/E/R → Translate/Rotate/Scale mode
 *  - World vs Local space toggle
 *  - Grid snapping
 *  - Multi-select pivot transform
 *  - Undo integration
 */

import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { HistoryManager } from './HistoryManager';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';

export interface SnapSettings {
  translate: number;
  rotate: number; // degrees
  scale: number;
}

export class TransformGizmoSystem {
  private _scene: THREE.Scene;
  private _camera: THREE.PerspectiveCamera;
  private _renderer: THREE.WebGLRenderer;
  private _history: HistoryManager;

  controls: TransformControls;

  mode: TransformMode = 'translate';
  space: TransformSpace = 'world';
  snapEnabled = false;
  snapSettings: SnapSettings = {
    translate: 10,
    rotate: 15,
    scale: 0.25,
  };

  /* Multi-object pivot */
  private _pivot: THREE.Object3D | null = null;
  private _pivotChildren: THREE.Object3D[] = [];
  private _pivotOffsets: THREE.Vector3[] = [];

  /* Undo tracking */
  private _transformStartPositions: Map<THREE.Object3D, THREE.Vector3> = new Map();
  private _transformStartRotations: Map<THREE.Object3D, THREE.Euler> = new Map();
  private _transformStartScales: Map<THREE.Object3D, THREE.Vector3> = new Map();

  /* Callbacks */
  private _onDraggingChanged: ((dragging: boolean) => void) | null = null;
  private _onModeChanged: ((mode: TransformMode) => void) | null = null;
  private _onSpaceChanged: ((space: TransformSpace) => void) | null = null;
  private _onSnapChanged: ((snap: boolean) => void) | null = null;
  private _onTransformChanged: ((obj: THREE.Object3D) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    history: HistoryManager,
  ) {
    this._scene = scene;
    this._camera = camera;
    this._renderer = renderer;
    this._history = history;

    this.controls = new TransformControls(camera, renderer.domElement);
    this.controls.setSize(0.75);
    this.controls.setSpace('world');

    scene.add(this.controls.getHelper());

    // Events
    this.controls.addEventListener('dragging-changed', (event: any) => {
      const dragging: boolean = event.value;
      this._onDraggingChanged?.(dragging);

      if (dragging) {
        // Store start state for undo
        this._captureTransformStart();
      } else {
        // Record undo action
        this._recordTransformUndo();
      }
    });

    this.controls.addEventListener('objectChange', () => {
      const attached = this.controls.object;
      if (attached) {
        // If using pivot, apply delta to all children
        if (this._pivot && attached === this._pivot) {
          this._applyPivotTransform();
        }
        this._onTransformChanged?.(attached);
      }
    });
  }

  /* -------- public API -------- */

  set onDraggingChanged(fn: ((dragging: boolean) => void) | null) {
    this._onDraggingChanged = fn;
  }

  set onModeChanged(fn: ((mode: TransformMode) => void) | null) {
    this._onModeChanged = fn;
  }

  set onSpaceChanged(fn: ((space: TransformSpace) => void) | null) {
    this._onSpaceChanged = fn;
  }

  set onSnapChanged(fn: ((snap: boolean) => void) | null) {
    this._onSnapChanged = fn;
  }

  set onTransformChanged(fn: ((obj: THREE.Object3D) => void) | null) {
    this._onTransformChanged = fn;
  }

  setMode(mode: TransformMode): void {
    this.mode = mode;
    this.controls.setMode(mode);
    this._applySnap();
    this._onModeChanged?.(mode);
  }

  setSpace(space: TransformSpace): void {
    this.space = space;
    this.controls.setSpace(space);
    this._onSpaceChanged?.(space);
  }

  toggleSpace(): void {
    this.setSpace(this.space === 'world' ? 'local' : 'world');
  }

  toggleSnap(): void {
    this.snapEnabled = !this.snapEnabled;
    this._applySnap();
    this._onSnapChanged?.(this.snapEnabled);
  }

  setSnapEnabled(enabled: boolean): void {
    this.snapEnabled = enabled;
    this._applySnap();
    this._onSnapChanged?.(enabled);
  }

  attachToObjects(objects: THREE.Object3D[]): void {
    this._cleanupPivot();

    if (objects.length === 0) {
      this.controls.detach();
      return;
    }

    if (objects.length === 1) {
      this.controls.attach(objects[0]);
    } else {
      // Multi-object: create pivot at center
      this._createPivot(objects);
    }
  }

  /**
   * Swap the camera used by the TransformControls.
   * Used when switching between 3D (perspective) and 2D (orthographic) modes.
   */
  setCamera(camera: THREE.Camera): void {
    this._camera = camera as any;
    this.controls.camera = camera;
  }

  detach(): void {
    this._cleanupPivot();
    this.controls.detach();
  }

  dispose(): void {
    this._cleanupPivot();
    this.controls.dispose();
  }

  /* -------- private -------- */

  private _applySnap(): void {
    if (this.snapEnabled) {
      this.controls.setTranslationSnap(this.snapSettings.translate);
      this.controls.setRotationSnap(THREE.MathUtils.degToRad(this.snapSettings.rotate));
      this.controls.setScaleSnap(this.snapSettings.scale);
    } else {
      this.controls.setTranslationSnap(null);
      this.controls.setRotationSnap(null);
      this.controls.setScaleSnap(null);
    }
  }

  private _createPivot(objects: THREE.Object3D[]): void {
    // Compute center of all objects
    const center = new THREE.Vector3();
    objects.forEach((obj) => {
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      center.add(wp);
    });
    center.divideScalar(objects.length);

    this._pivot = new THREE.Object3D();
    this._pivot.position.copy(center);
    this._pivot.userData.__isTransformPivot = true;
    this._scene.add(this._pivot);

    this._pivotChildren = objects;
    this._pivotOffsets = objects.map((obj) => {
      return obj.position.clone().sub(center);
    });

    this.controls.attach(this._pivot);
  }

  private _applyPivotTransform(): void {
    if (!this._pivot) return;

    for (let i = 0; i < this._pivotChildren.length; i++) {
      const child = this._pivotChildren[i];
      const offset = this._pivotOffsets[i];

      if (this.mode === 'translate') {
        child.position.copy(this._pivot.position).add(offset);
      }
    }
  }

  private _cleanupPivot(): void {
    if (this._pivot) {
      this._scene.remove(this._pivot);
      this._pivot = null;
      this._pivotChildren = [];
      this._pivotOffsets = [];
    }
  }

  private _captureTransformStart(): void {
    this._transformStartPositions.clear();
    this._transformStartRotations.clear();
    this._transformStartScales.clear();

    const targets = this._pivot ? this._pivotChildren : 
      (this.controls.object ? [this.controls.object] : []);

    targets.forEach((obj) => {
      this._transformStartPositions.set(obj, obj.position.clone());
      this._transformStartRotations.set(obj, obj.rotation.clone());
      this._transformStartScales.set(obj, obj.scale.clone());
    });
  }

  private _recordTransformUndo(): void {
    const targets = this._pivot ? [...this._pivotChildren] : 
      (this.controls.object ? [this.controls.object] : []);

    if (targets.length === 0) return;

    const startPositions = new Map<THREE.Object3D, THREE.Vector3>();
    const startRotations = new Map<THREE.Object3D, THREE.Euler>();
    const startScales = new Map<THREE.Object3D, THREE.Vector3>();
    const endPositions = new Map<THREE.Object3D, THREE.Vector3>();
    const endRotations = new Map<THREE.Object3D, THREE.Euler>();
    const endScales = new Map<THREE.Object3D, THREE.Vector3>();

    let hasChange = false;

    targets.forEach((obj) => {
      const sp = this._transformStartPositions.get(obj);
      const sr = this._transformStartRotations.get(obj);
      const ss = this._transformStartScales.get(obj);

      if (!sp || !sr || !ss) return;

      if (!sp.equals(obj.position) || !sr.equals(obj.rotation) || !ss.equals(obj.scale)) {
        hasChange = true;
      }

      startPositions.set(obj, sp.clone());
      startRotations.set(obj, sr.clone());
      startScales.set(obj, ss.clone());
      endPositions.set(obj, obj.position.clone());
      endRotations.set(obj, obj.rotation.clone());
      endScales.set(obj, obj.scale.clone());
    });

    if (!hasChange) return;

    const modeName = this.mode.charAt(0).toUpperCase() + this.mode.slice(1);

    // Don't re-execute; the transform is already applied
    this._history.execute({
      name: `${modeName} ${targets.length} object(s)`,
      execute: () => {
        // Apply end state (for redo)
        targets.forEach((obj) => {
          const ep = endPositions.get(obj);
          const er = endRotations.get(obj);
          const es = endScales.get(obj);
          if (ep) obj.position.copy(ep);
          if (er) obj.rotation.copy(er);
          if (es) obj.scale.copy(es);
        });
      },
      undo: () => {
        targets.forEach((obj) => {
          const sp = startPositions.get(obj);
          const sr = startRotations.get(obj);
          const ss = startScales.get(obj);
          if (sp) obj.position.copy(sp);
          if (sr) obj.rotation.copy(sr);
          if (ss) obj.scale.copy(ss);
        });
      },
    });
  }
}
