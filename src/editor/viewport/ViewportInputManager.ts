/**
 * ViewportInputManager — Single source of truth for all viewport mouse input.
 *
 * Implements a state machine that ensures gizmo transforms, camera navigation,
 * box selection, and click selection are mutually exclusive.  This prevents the
 * critical bug where dragging a gizmo handle simultaneously triggers the
 * selection system.
 *
 * State transitions:
 *   IDLE ─→ TRANSFORMING  (pointerdown on gizmo handle)
 *   IDLE ─→ CAMERA_*      (RMB / MMB / Alt+LMB)
 *   IDLE ─→ SELECTING     (LMB on scene, no modifier)
 *   SELECTING ─→ BOX_SELECTING  (pointer moves > drag threshold)
 *
 * Only one state can be active at a time.  The state machine prevents
 * fall-through between gizmo hits and selection hits.
 */

import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { SelectionManager } from './SelectionManager';
import type { ViewportCameraController } from './ViewportCameraController';
import type { TransformGizmoSystem } from './TransformGizmoSystem';

// ── Input states ──

export const ViewportInputState = {
  IDLE:            'idle',
  SELECTING:       'selecting',
  BOX_SELECTING:   'boxSelecting',
  TRANSFORMING:    'transforming',
  CAMERA_ORBITING: 'cameraOrbiting',
  CAMERA_PANNING:  'cameraPanning',
  CAMERA_ZOOMING:  'cameraZooming',
  FLY_CAMERA:      'flyCamera',
} as const;

export type InputState = typeof ViewportInputState[keyof typeof ViewportInputState];

// ── Drag threshold (pixels) ──
const DRAG_THRESHOLD = 4;

export class ViewportInputManager {
  // ── Current state ──
  private _state: InputState = ViewportInputState.IDLE;

  // ── Drag tracking ──
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _hasDragged = false;

  // ── References ──
  private _gizmo: TransformGizmoSystem;
  private _selection: SelectionManager;
  private _camera: ViewportCameraController;
  private _gizmoControls: TransformControls;

  /**
   * Set to true when TransformControls fires 'dragging-changed' = true.
   * Cleared when 'dragging-changed' = false.
   */
  private _transformControlsDragging = false;

  /**
   * Set to true when a gizmo drag just finished and the mouse hasn't been
   * released yet.  Prevents the pointer-up from triggering selection.
   */
  private _transformJustEnded = false;

  // ── Public readonly state ──

  get state(): InputState { return this._state; }

  /** True while the gizmo is being dragged — external code can check this. */
  get isTransforming(): boolean {
    return this._state === ViewportInputState.TRANSFORMING || this._transformControlsDragging;
  }

  /** True while any camera navigation is active. */
  get isNavigating(): boolean {
    return (
      this._state === ViewportInputState.CAMERA_ORBITING ||
      this._state === ViewportInputState.CAMERA_PANNING ||
      this._state === ViewportInputState.CAMERA_ZOOMING ||
      this._state === ViewportInputState.FLY_CAMERA
    );
  }

  /** True while box selecting. */
  get isBoxSelecting(): boolean {
    return this._state === ViewportInputState.BOX_SELECTING;
  }

  constructor(
    gizmo: TransformGizmoSystem,
    selection: SelectionManager,
    camera: ViewportCameraController,
  ) {
    this._gizmo = gizmo;
    this._selection = selection;
    this._camera = camera;
    this._gizmoControls = gizmo.controls;

    // Set up gizmo handle layer separation.
    // THREE.TransformControls internal gizmo children are on layer 0 by default.
    // We need to detect gizmo hits via the controls' own dragging state instead,
    // because TransformControls manages its own pointerdown internally.

    // Listen for TransformControls dragging-changed to track state
    this._gizmoControls.addEventListener('dragging-changed', (event: any) => {
      const dragging: boolean = event.value;
      this._transformControlsDragging = dragging;

      if (dragging) {
        // Gizmo started dragging — transition to TRANSFORMING
        this._state = ViewportInputState.TRANSFORMING;
      } else {
        // Gizmo stopped dragging — mark that we need to suppress the next pointerup
        this._transformJustEnded = true;
        // Transition back to IDLE
        this._state = ViewportInputState.IDLE;
      }
    });
  }

  // ══════════════════════════════════════
  //  POINTER DOWN
  // ══════════════════════════════════════

  onPointerDown(e: MouseEvent): void {
    // TransformControls uses the 'pointerdown' event which fires
    // synchronously BEFORE our 'mousedown'.  If it detected a gizmo
    // handle hit, it will have set dragging=true already via
    // dragging-changed.  In that case, do nothing else.
    if (this._transformControlsDragging) {
      this._state = ViewportInputState.TRANSFORMING;
      return;
    }

    // ── Camera navigation (highest priority after gizmo) ──
    if (e.button === 2) {
      this._state = ViewportInputState.FLY_CAMERA;
      return;
    }
    if (e.button === 1) {
      this._state = ViewportInputState.CAMERA_PANNING;
      return;
    }
    if (e.button === 0 && e.altKey) {
      this._state = ViewportInputState.CAMERA_ORBITING;
      return;
    }

    // ── Selection (LMB, no alt, no gizmo hit) ──
    if (e.button === 0) {
      this._state = ViewportInputState.SELECTING;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this._hasDragged = false;

      // Start selection manager box-select tracking
      this._selection.onMouseDown(e, false);
    }
  }

  // ══════════════════════════════════════
  //  POINTER MOVE
  // ══════════════════════════════════════

  onPointerMove(e: MouseEvent): void {
    // ── TRANSFORMING: gizmo owns the input, do nothing else ──
    if (this._state === ViewportInputState.TRANSFORMING || this._transformControlsDragging) {
      return;
    }

    // ── Navigation states: camera owns the input ──
    if (this.isNavigating) {
      // Camera controller handles movement internally via its own listeners.
      // We suppress selection hover during navigation.
      this._selection.onMouseMove(e, true);
      return;
    }

    // ── SELECTING → check for box select transition ──
    if (this._state === ViewportInputState.SELECTING) {
      const dx = e.clientX - this._dragStartX;
      const dy = e.clientY - this._dragStartY;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        this._hasDragged = true;
        this._state = ViewportInputState.BOX_SELECTING;
      }
      // Pass to selection manager (it handles the drag threshold internally too)
      this._selection.onMouseMove(e, false);
      return;
    }

    // ── BOX_SELECTING ──
    if (this._state === ViewportInputState.BOX_SELECTING) {
      this._selection.onMouseMove(e, false);
      return;
    }

    // ── IDLE: hover detection ──
    const isNav = this._camera.isFlyMode ||
      (e.buttons & 4) !== 0 ||
      (e.altKey && (e.buttons & 1) !== 0);
    this._selection.onMouseMove(e, isNav);
  }

  // ══════════════════════════════════════
  //  POINTER UP
  // ══════════════════════════════════════

  onPointerUp(e: MouseEvent): void {
    // ── TRANSFORMING: suppress selection ──
    if (this._state === ViewportInputState.TRANSFORMING || this._transformJustEnded) {
      this._transformJustEnded = false;
      this._state = ViewportInputState.IDLE;
      return;
    }

    // ── Navigation end ──
    if (this.isNavigating) {
      this._state = ViewportInputState.IDLE;
      return;
    }

    // ── SELECTING or BOX_SELECTING: finalize ──
    if (this._state === ViewportInputState.SELECTING || this._state === ViewportInputState.BOX_SELECTING) {
      // Only fire click-selection if we didn't drag
      const wasNavigating = false;
      this._selection.onMouseUp(e, wasNavigating);
      this._state = ViewportInputState.IDLE;
      return;
    }

    // Fallback reset
    this._state = ViewportInputState.IDLE;
  }

  // ══════════════════════════════════════
  //  EXTERNAL STATE SYNC
  // ══════════════════════════════════════

  /**
   * Called by external code when camera fly mode starts/stops
   * (since the camera controller manages its own listeners).
   */
  syncFlyMode(active: boolean): void {
    if (active && this._state === ViewportInputState.IDLE) {
      this._state = ViewportInputState.FLY_CAMERA;
    } else if (!active && this._state === ViewportInputState.FLY_CAMERA) {
      this._state = ViewportInputState.IDLE;
    }
  }

  /**
   * Force-reset to IDLE (e.g. on focus loss, play mode start).
   */
  reset(): void {
    this._state = ViewportInputState.IDLE;
    this._transformControlsDragging = false;
    this._transformJustEnded = false;
    this._hasDragged = false;
  }
}
