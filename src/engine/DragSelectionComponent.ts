// ============================================================
//  DragSelectionComponent — UE-style Marquee / Box Selection
//
//  Attach to a player camera (2D or 3D) to enable click-drag
//  rectangle selection of actors in the world.  Works like
//  Unreal Engine's "Get Actors in Selection Rectangle" node:
//
//    • Press & drag the mouse to draw a selection box
//    • On release, the rectangle is projected into the world
//      and all actors whose screen-space positions fall inside
//      are returned (optionally filtered by class)
//    • Visual feedback: an HTML overlay rectangle is drawn on
//      top of the canvas matching the selection area
//
//  Supports both 2D (Camera2D) and 3D (PerspectiveCamera)
//  projection. Can filter by one or more actor class IDs.
// ============================================================

import * as THREE from 'three';
import type { GameObject } from './GameObject';

export interface DragSelectionResult {
  /** Actors whose screen-space position falls inside the rect */
  actors: GameObject[];
  /** Screen-space rect (pixels, canvas-local) of the selection */
  rect: { x: number; y: number; width: number; height: number };
}

export class DragSelectionComponent {
  // ── Public API ──

  /** Master enable/disable toggle */
  public enabled: boolean = true;

  /** Mouse button index that triggers the selection drag (0 = left, 2 = right) */
  public mouseButton: number = 0;

  /** Minimum drag distance in pixels before a selection is considered (avoids accidental clicks) */
  public minDragDistance: number = 4;

  /** Actor class IDs to filter by (empty = select all actors) */
  public classFilter: string[] = [];

  /** Whether to only select actors fully inside the rect (true) or partially overlapping (false) */
  public requireFullyInside: boolean = false;

  // ── Visual style (UE-style customisable) ──

  /** Fill colour of the selection rectangle */
  public selectionColor: string = 'rgba(0, 120, 215, 0.25)';
  /** Border colour */
  public selectionBorderColor: string = 'rgba(0, 120, 215, 0.8)';
  /** Border width in pixels */
  public selectionBorderWidth: number = 1;
  /** Border style: 'solid', 'dashed', 'dotted' */
  public selectionBorderStyle: string = 'solid';
  /** Corner radius in pixels (0 = sharp corners) */
  public selectionBorderRadius: number = 0;
  /** Overall opacity (0–1, applied on top of colour alpha) */
  public selectionOpacity: number = 1;

  // ── Callbacks (wired by compiled blueprint code) ──

  /** Fires when a drag selection completes with the list of selected actors */
  public onSelectionComplete: ((result: DragSelectionResult) => void) | null = null;

  /** Fires every frame while dragging with the current rect */
  public onSelectionUpdated: ((rect: { x: number; y: number; width: number; height: number }) => void) | null = null;

  // ── Readonly state ──

  /** True while the user is actively dragging a selection box */
  public get isDragging(): boolean { return this._isDragging; }

  /** Last completed selection result (persists until the next selection) */
  public get lastResult(): DragSelectionResult | null { return this._lastResult; }

  // ── Internal state ──
  private _isDragging = false;
  private _mouseDown = false; // tracks whether the button is held before drag threshold
  private _startX = 0;
  private _startY = 0;
  private _currentX = 0;
  private _currentY = 0;
  private _canvas: HTMLCanvasElement | null = null;
  private _overlayEl: HTMLDivElement | null = null;
  private _lastResult: DragSelectionResult | null = null;
  private _destroyed = false;
  private _initialised = false;

  // Scene & camera refs (set at init)
  private _scene: any = null;       // engine Scene
  private _engine: any = null;      // engine Engine
  private _camera3D: THREE.PerspectiveCamera | null = null;

  // Bound listeners
  private _onMouseDown: ((e: MouseEvent) => void) | null = null;
  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onMouseUp: ((e: MouseEvent) => void) | null = null;

  // ================================================================
  //  Lifecycle
  // ================================================================

  /**
   * Initialise the component. Call once after Play starts.
   * @param canvas  The game viewport canvas element
   * @param scene   The engine Scene (has gameObjects[])
   * @param engine  The engine Engine (has scene2DManager, playerControllers)
   */
  init(canvas: HTMLCanvasElement, scene: any, engine: any): void {
    // If already initialised, tear down previous listeners first to avoid
    // leaking duplicate handlers (e.g. if init() is called more than once).
    if (this._initialised) {
      this._removeListeners();
    }

    this._destroyed = false;
    this._initialised = true;
    this._canvas = canvas;
    this._scene = scene;
    this._engine = engine;

    // Create the overlay element — append to document.body with fixed
    // positioning so it's always correctly placed over the canvas
    // regardless of the canvas's DOM hierarchy.
    if (!this._overlayEl) {
      this._overlayEl = document.createElement('div');
      this._overlayEl.style.position = 'fixed';
      this._overlayEl.style.pointerEvents = 'none';
      this._overlayEl.style.zIndex = '10000'; // above everything
      this._overlayEl.style.display = 'none';
      this._overlayEl.style.boxSizing = 'border-box';
      document.body.appendChild(this._overlayEl);
    }

    this._applyOverlayStyle();

    // Bind mouse events
    this._onMouseDown = (e: MouseEvent) => this._handleMouseDown(e);
    this._onMouseMove = (e: MouseEvent) => this._handleMouseMove(e);
    this._onMouseUp = (e: MouseEvent) => this._handleMouseUp(e);

    canvas.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  /** Call every frame (optional — used for live preview updates) */
  update(): void {
    // Currently no per-frame work needed; overlay is updated in mousemove
  }

  /** Tear down — remove listeners and overlay */
  destroy(): void {
    this._destroyed = true;
    this._initialised = false;
    this._isDragging = false;
    this._mouseDown = false;
    this._removeListeners();
    if (this._overlayEl) {
      this._overlayEl.style.display = 'none';
      if (this._overlayEl.parentElement) {
        this._overlayEl.parentElement.removeChild(this._overlayEl);
      }
    }
    this._overlayEl = null;
    this._canvas = null;
    this._scene = null;
    this._engine = null;
    this._camera3D = null;
    this._lastResult = null;
    this.onSelectionComplete = null;
    this.onSelectionUpdated = null;
  }

  /** Remove event listeners from canvas and document */
  private _removeListeners(): void {
    if (this._canvas && this._onMouseDown) {
      this._canvas.removeEventListener('mousedown', this._onMouseDown);
    }
    if (this._onMouseMove) {
      document.removeEventListener('mousemove', this._onMouseMove);
    }
    if (this._onMouseUp) {
      document.removeEventListener('mouseup', this._onMouseUp);
    }
    this._onMouseDown = null;
    this._onMouseMove = null;
    this._onMouseUp = null;
  }

  // ================================================================
  //  Public helpers
  // ================================================================

  /** Programmatically set the class filter from an array of actor class IDs */
  setClassFilter(classIds: string[]): void {
    this.classFilter = classIds.slice();
  }

  /** Add a single class ID to the filter */
  addClassFilter(classId: string): void {
    if (!this.classFilter.includes(classId)) {
      this.classFilter.push(classId);
    }
  }

  /** Remove a single class ID from the filter */
  removeClassFilter(classId: string): void {
    const idx = this.classFilter.indexOf(classId);
    if (idx >= 0) this.classFilter.splice(idx, 1);
  }

  /** Clear the filter (select all actors) */
  clearClassFilter(): void {
    this.classFilter = [];
  }

  /** Get the number of actors in the last selection */
  getSelectedCount(): number {
    return this._lastResult ? this._lastResult.actors.length : 0;
  }

  /** Get the selected actors array from the last selection */
  getSelectedActors(): GameObject[] {
    return this._lastResult ? this._lastResult.actors : [];
  }

  /** Get a specific selected actor by index */
  getSelectedActorAt(index: number): GameObject | null {
    if (!this._lastResult) return null;
    return this._lastResult.actors[index] ?? null;
  }

  // ================================================================
  //  Mouse handlers
  // ================================================================

  private _handleMouseDown(e: MouseEvent): void {
    if (this._destroyed || !this._initialised) return;
    if (!this.enabled) return;
    if (e.button !== this.mouseButton) return;

    const canvasRect = this._canvas!.getBoundingClientRect();
    this._startX = e.clientX - canvasRect.left;
    this._startY = e.clientY - canvasRect.top;
    this._currentX = this._startX;
    this._currentY = this._startY;
    this._mouseDown = true;
    this._isDragging = false; // Will become true once minDragDistance is exceeded
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (this._destroyed || !this._initialised) return;
    if (!this.enabled || !this._mouseDown) return;

    const canvasRect = this._canvas!.getBoundingClientRect();
    this._currentX = e.clientX - canvasRect.left;
    this._currentY = e.clientY - canvasRect.top;

    // Check minimum drag distance
    const dx = this._currentX - this._startX;
    const dy = this._currentY - this._startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this._isDragging && dist >= this.minDragDistance) {
      this._isDragging = true;
    }

    if (this._isDragging) {
      this._updateOverlay();

      // Fire update callback
      if (this.onSelectionUpdated) {
        this.onSelectionUpdated(this._getSelectionRect());
      }
    }
  }

  private _handleMouseUp(e: MouseEvent): void {
    if (this._destroyed || !this._initialised) return;
    if (!this.enabled) return;
    if (e.button !== this.mouseButton) return;

    if (this._isDragging) {
      // Perform the selection query
      const result = this._performSelection();
      this._lastResult = result;

      // Fire complete callback
      if (this.onSelectionComplete) {
        this.onSelectionComplete(result);
      }
    }

    this._isDragging = false;
    this._mouseDown = false;
    this._hideOverlay();
  }

  // ================================================================
  //  Selection logic
  // ================================================================

  private _performSelection(): DragSelectionResult {
    const selRect = this._getSelectionRect();
    const actors: GameObject[] = [];

    if (!this._scene || !this._canvas) return { actors, rect: selRect };

    const gameObjects: GameObject[] = this._scene.gameObjects || [];
    const canvasRect = this._canvas.getBoundingClientRect();
    const canvasW = canvasRect.width;
    const canvasH = canvasRect.height;

    for (const go of gameObjects) {
      // Apply class filter
      if (this.classFilter.length > 0) {
        // Match by actorAssetId OR by actor name (more forgiving)
        const matchesFilter = this.classFilter.some(
          f => (go.actorAssetId && go.actorAssetId === f)
            || (go.name && go.name === f)
        );
        if (!matchesFilter) continue;
      }

      // Get screen position of this actor (canvas-local coordinates)
      const screenPos = this._getScreenPosition(go, canvasW, canvasH, canvasRect);
      if (!screenPos) continue;

      // Check if inside selection rect
      if (this._pointInRect(screenPos.x, screenPos.y, selRect)) {
        actors.push(go);
      }
    }

    return { actors, rect: selRect };
  }

  /**
   * Project a GameObject's world position to CANVAS-LOCAL pixel coordinates.
   * Canvas-local means (0,0) = top-left corner of the canvas element.
   * Supports both 2D (Camera2D) and 3D (PerspectiveCamera).
   */
  private _getScreenPosition(
    go: GameObject,
    canvasW: number,
    canvasH: number,
    canvasRect: DOMRect,
  ): { x: number; y: number } | null {
    // ── 2D path (Camera2D) ──
    const s2d = this._engine?.scene2DManager;
    if (s2d && s2d.camera2D) {
      const cam = s2d.camera2D;
      if (!go.mesh) return null;

      // Use getWorldPosition to handle mesh-inside-group hierarchy
      // (SpriteActor stores mesh inside a THREE.Group, so mesh.position is local 0,0,0)
      const wp = new THREE.Vector3();
      go.mesh.getWorldPosition(wp);

      // Camera2D.worldToScreen returns PAGE-relative coordinates
      // (includes canvasRect.left/top). We need to convert to canvas-local.
      if (typeof cam.worldToScreen === 'function') {
        const sp = cam.worldToScreen(wp.x, wp.y);
        return {
          x: sp.x - canvasRect.left,
          y: sp.y - canvasRect.top,
        };
      }

      // Fallback: manual orthographic projection (already canvas-local)
      const vw = (cam.camera.right - cam.camera.left);
      const vh = (cam.camera.top - cam.camera.bottom);
      const relX = (wp.x - cam.camera.position.x + vw / 2) / vw;
      const relY = 1 - (wp.y - cam.camera.position.y + vh / 2) / vh;
      return { x: relX * canvasW, y: relY * canvasH };
    }

    // ── 3D path (PerspectiveCamera) ──
    const pc = this._engine?.playerControllers?.get(0);
    const cam3 = pc?.getActiveCamera?.();
    const camera = cam3 || this._camera3D;
    if (camera && go.mesh) {
      const worldPos = new THREE.Vector3();
      go.mesh.getWorldPosition(worldPos);
      const ndc = worldPos.project(camera);
      // NDC ranges from -1 to +1; convert to canvas-local pixels
      const x = (ndc.x * 0.5 + 0.5) * canvasW;
      const y = (-ndc.y * 0.5 + 0.5) * canvasH;
      // Behind camera check
      if (ndc.z > 1) return null;
      return { x, y };
    }

    return null;
  }

  // ================================================================
  //  Helpers
  // ================================================================

  private _getSelectionRect(): { x: number; y: number; width: number; height: number } {
    const x = Math.min(this._startX, this._currentX);
    const y = Math.min(this._startY, this._currentY);
    const w = Math.abs(this._currentX - this._startX);
    const h = Math.abs(this._currentY - this._startY);
    return { x, y, width: w, height: h };
  }

  private _pointInRect(
    px: number,
    py: number,
    rect: { x: number; y: number; width: number; height: number },
  ): boolean {
    return (
      px >= rect.x &&
      px <= rect.x + rect.width &&
      py >= rect.y &&
      py <= rect.y + rect.height
    );
  }

  // ================================================================
  //  Overlay rendering
  // ================================================================

  /** Apply the current style properties to the overlay element */
  private _applyOverlayStyle(): void {
    if (!this._overlayEl) return;
    this._overlayEl.style.backgroundColor = this.selectionColor;
    this._overlayEl.style.border = `${this.selectionBorderWidth}px ${this.selectionBorderStyle} ${this.selectionBorderColor}`;
    this._overlayEl.style.borderRadius = `${this.selectionBorderRadius}px`;
    this._overlayEl.style.opacity = String(this.selectionOpacity);
  }

  /** Position and show the overlay using fixed viewport coordinates */
  private _updateOverlay(): void {
    if (!this._overlayEl || !this._canvas) return;

    const selRect = this._getSelectionRect();
    const canvasRect = this._canvas.getBoundingClientRect();

    // Convert canvas-local rect to viewport (fixed) coordinates
    this._overlayEl.style.display = 'block';
    this._overlayEl.style.left = `${canvasRect.left + selRect.x}px`;
    this._overlayEl.style.top = `${canvasRect.top + selRect.y}px`;
    this._overlayEl.style.width = `${selRect.width}px`;
    this._overlayEl.style.height = `${selRect.height}px`;

    this._applyOverlayStyle();
  }

  private _hideOverlay(): void {
    if (this._overlayEl) {
      this._overlayEl.style.display = 'none';
    }
  }
}
