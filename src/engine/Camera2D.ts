// ============================================================
//  Camera2D — Orthographic camera for 2D scenes
//  Replaces PerspectiveCamera in 2D mode. Pan with middle mouse
//  or Alt+drag. Zoom toward cursor with scroll wheel.
// ============================================================

import * as THREE from 'three';

export interface Camera2DSettings {
  pixelsPerUnit?: number;
  referenceResolution?: { width: number; height: number };
  backgroundColor?: string;
}

export class Camera2D {
  public camera: THREE.OrthographicCamera;
  public pixelsPerUnit: number;
  public zoom = 1.0;
  public referenceWidth: number;
  public referenceHeight: number;

  private _followTarget: any = null;
  private _followSmoothing = 0.1;
  private _followDeadZone = { x: 0, y: 0 };
  private _followBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

  // Shake system
  private _shakeIntensity = 0;
  private _shakeDuration = 0;
  private _shakeTimer = 0;
  private _shakeOffset = { x: 0, y: 0 };

  // ── Public accessors for blueprint nodes ──
  get followTarget(): any { return this._followTarget; }
  set followTarget(v: any) { this._followTarget = v; }
  get followSmoothing(): number { return this._followSmoothing; }
  set followSmoothing(v: number) { this._followSmoothing = v; }
  get deadZone(): { x?: number; y?: number; width?: number; height?: number } { return this._followDeadZone; }
  set deadZone(v: { x?: number; y?: number; width?: number; height?: number } | null) {
    this._followDeadZone = v ? { x: v.width ?? v.x ?? 0, y: v.height ?? v.y ?? 0 } : { x: 0, y: 0 };
  }
  get bounds(): { minX: number; minY: number; maxX: number; maxY: number } | null { return this._followBounds; }
  set bounds(v: { minX: number; minY: number; maxX: number; maxY: number } | null) { this._followBounds = v; }

  // Pixel-perfect mode
  private _pixelPerfect = false;
  /** Allowed zoom steps in pixel-perfect mode: 1 tile-pixel = N screen-pixels */
  private static readonly PP_ZOOM_STEPS = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10];

  // Pan state
  private _isPanning = false;
  private _panStart = { x: 0, y: 0 };
  private _camStartPos = { x: 0, y: 0 };

  private _domElement: HTMLElement | null = null;
  /** Reference element used for coordinate conversions (may differ from _domElement for events) */
  private _refElement: HTMLElement | null = null;
  /** Last known container dimensions from resize() */
  private _containerWidth = 0;
  private _containerHeight = 0;
  private _boundHandlers: {
    mousedown?: (e: MouseEvent) => void;
    mousemove?: (e: MouseEvent) => void;
    mouseup?: (e: MouseEvent) => void;
    wheel?: (e: WheelEvent) => void;
    keydown?: (e: KeyboardEvent) => void;
  } = {};

  constructor(domElement?: HTMLElement, settings: Camera2DSettings = {}) {
    this.pixelsPerUnit = settings.pixelsPerUnit ?? 100;
    this.referenceWidth = settings.referenceResolution?.width ?? 1920;
    this.referenceHeight = settings.referenceResolution?.height ?? 1080;

    const { w, h } = this._viewSize();
    this.camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, -1000, 1000);
    this.camera.position.set(0, 0, 100);
    this.camera.lookAt(0, 0, 0);

    if (domElement) this._bindControls(domElement);
  }

  // ---- View calculations ----

  private _viewSize() {
    const cw = this._containerWidth || this.referenceWidth;
    const ch = this._containerHeight || this.referenceHeight;
    const w = (cw / this.pixelsPerUnit) / this.zoom;
    const h = (ch / this.pixelsPerUnit) / this.zoom;
    return { w, h };
  }

  resize(containerWidth: number, containerHeight: number): void {
    this._containerWidth = containerWidth;
    this._containerHeight = containerHeight;
    // Use actual viewport dimensions so 1 tile pixel = 1 screen pixel at zoom 1
    const w = (containerWidth / this.pixelsPerUnit) / this.zoom;
    const h = (containerHeight / this.pixelsPerUnit) / this.zoom;

    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Set the DOM element used for coordinate conversions (screenToWorld / worldToScreen).
   * Call this when the Camera2D's event binding element differs from the actual rendering canvas.
   */
  setReferenceElement(el: HTMLElement): void {
    this._refElement = el;
  }

  // ---- Zoom ----

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.05, Math.min(20, zoom));
    const { w, h } = this._viewSize();
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }

  zoomTowardCursor(zoomDelta: number, screenX: number, screenY: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY);

    if (this._pixelPerfect) {
      // Step to the next/previous pixel-perfect zoom level
      const steps = Camera2D.PP_ZOOM_STEPS;
      const idx = steps.indexOf(this.zoom);
      let nextIdx = idx;
      if (zoomDelta > 0 && idx < steps.length - 1) nextIdx = idx + 1;
      else if (zoomDelta < 0 && idx > 0) nextIdx = idx - 1;
      else if (idx === -1) {
        // Current zoom isn't on a step — snap to nearest
        this._snapZoomToNearestStep();
        return;
      }
      this.setZoom(steps[nextIdx]);
    } else {
      this.setZoom(this.zoom * (1 + zoomDelta));
    }

    const worldAfter = this.screenToWorld(screenX, screenY);
    this.camera.position.x += worldBefore.x - worldAfter.x;
    this.camera.position.y += worldBefore.y - worldAfter.y;
  }

  resetZoom(): void {
    this.setZoom(1.0);
    this.camera.position.x = 0;
    this.camera.position.y = 0;
  }

  // ---- Pixel-perfect mode ----

  get pixelPerfect(): boolean { return this._pixelPerfect; }

  /**
   * Enable / disable pixel-perfect mode.
   * When enabled, zoom is constrained to integer multiples so that
   * 1 tile pixel maps to exactly N screen pixels (no sub-pixel blurring).
   */
  setPixelPerfect(enabled: boolean): void {
    this._pixelPerfect = enabled;
    if (enabled) {
      this._snapZoomToNearestStep();
    }
  }

  /**
   * Dynamically change the camera's pixels-per-unit then recompute
   * the orthographic frustum so the view stays consistent.
   */
  setPixelsPerUnit(ppu: number): void {
    this.pixelsPerUnit = Math.max(1, ppu);
    // Recalculate frustum with current container dimensions
    if (this._containerWidth > 0 && this._containerHeight > 0) {
      this.resize(this._containerWidth, this._containerHeight);
    }
  }

  /** Snap the current zoom to the nearest pixel-perfect step */
  private _snapZoomToNearestStep(): void {
    const steps = Camera2D.PP_ZOOM_STEPS;
    let best = steps[0];
    let bestDist = Math.abs(this.zoom - best);
    for (const s of steps) {
      const d = Math.abs(this.zoom - s);
      if (d < bestDist) { best = s; bestDist = d; }
    }
    this.setZoom(best);
  }

  // ---- Coordinate conversion ----

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const el = this._refElement ?? this._domElement;
    if (!el) {
      const v = new THREE.Vector3(
        (sx / window.innerWidth) * 2 - 1,
        -((sy / window.innerHeight) * 2 - 1),
        0
      );
      v.unproject(this.camera);
      return { x: v.x, y: v.y };
    }

    const rect = el.getBoundingClientRect();
    const ndcX = ((sx - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((sy - rect.top) / rect.height) * 2 - 1);
    const v = new THREE.Vector3(ndcX, ndcY, 0);
    v.unproject(this.camera);
    return { x: v.x, y: v.y };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const v = new THREE.Vector3(wx, wy, 0);
    v.project(this.camera);
    const el = this._refElement ?? this._domElement;
    if (el) {
      const rect = el.getBoundingClientRect();
      return {
        x: ((v.x + 1) / 2) * rect.width + rect.left,
        y: ((-v.y + 1) / 2) * rect.height + rect.top,
      };
    }
    return {
      x: ((v.x + 1) / 2) * window.innerWidth,
      y: ((-v.y + 1) / 2) * window.innerHeight,
    };
  }

  // ---- Follow system ----

  follow(actor: any, smoothing = 0.1, deadZone = { x: 0, y: 0 }): void {
    this._followTarget = actor;
    this._followSmoothing = smoothing;
    this._followDeadZone = deadZone;
  }

  stopFollow(): void {
    this._followTarget = null;
  }

  setBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    this._followBounds = { minX, minY, maxX, maxY };
  }

  clearBounds(): void {
    this._followBounds = null;
  }

  // ---- Shake ----

  shake(intensity: number, duration: number): void {
    this._shakeIntensity = intensity;
    this._shakeDuration = duration;
    this._shakeTimer = 0;
  }

  // ---- Update (call each frame) ----

  update(deltaTime: number = 1 / 60): void {
    // Remove previous frame's shake offset FIRST to get the true base position
    this.camera.position.x -= this._shakeOffset.x;
    this.camera.position.y -= this._shakeOffset.y;

    // Follow target
    if (this._followTarget) {
      let targetX: number, targetY: number;
      if (this._followTarget.transform2D) {
        targetX = this._followTarget.transform2D.position.x;
        targetY = this._followTarget.transform2D.position.y;
      } else if (this._followTarget.group) {
        targetX = this._followTarget.group.position.x;
        targetY = this._followTarget.group.position.y;
      } else {
        targetX = this.camera.position.x;
        targetY = this.camera.position.y;
      }

      // Dead zone
      const dx = targetX - this.camera.position.x;
      const dy = targetY - this.camera.position.y;
      let moveX = 0, moveY = 0;
      if (Math.abs(dx) > this._followDeadZone.x) moveX = dx - Math.sign(dx) * this._followDeadZone.x;
      if (Math.abs(dy) > this._followDeadZone.y) moveY = dy - Math.sign(dy) * this._followDeadZone.y;

      this.camera.position.x += moveX * this._followSmoothing;
      this.camera.position.y += moveY * this._followSmoothing;
    }

    // Camera bounds
    if (this._followBounds) {
      const b = this._followBounds;
      const { w, h } = this._viewSize();
      this.camera.position.x = Math.max(b.minX + w / 2, Math.min(b.maxX - w / 2, this.camera.position.x));
      this.camera.position.y = Math.max(b.minY + h / 2, Math.min(b.maxY - h / 2, this.camera.position.y));
    }

    // Compute shake offset for this frame
    if (this._shakeTimer < this._shakeDuration) {
      this._shakeTimer += deltaTime;
      const t = Math.max(0, 1 - this._shakeTimer / this._shakeDuration);
      this._shakeOffset.x = (Math.random() * 2 - 1) * this._shakeIntensity * t;
      this._shakeOffset.y = (Math.random() * 2 - 1) * this._shakeIntensity * t;
    } else {
      this._shakeOffset.x = 0;
      this._shakeOffset.y = 0;
    }

    // Apply shake offset to the final camera position
    this.camera.position.x += this._shakeOffset.x;
    this.camera.position.y += this._shakeOffset.y;
  }

  // ---- Editor controls ----

  private _bindControls(domElement: HTMLElement): void {
    this._domElement = domElement;

    const onMouseDown = (e: MouseEvent) => {
      // Middle mouse button or Alt + left click → pan
      if (e.button === 1 || (e.altKey && e.button === 0)) {
        this._isPanning = true;
        this._panStart = { x: e.clientX, y: e.clientY };
        this._camStartPos = { x: this.camera.position.x, y: this.camera.position.y };
        e.preventDefault();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this._isPanning) return;
      const el = this._refElement ?? domElement;
      const rect = el.getBoundingClientRect();
      const viewW = (this.camera.right - this.camera.left);
      const viewH = (this.camera.top - this.camera.bottom);
      const dx = ((e.clientX - this._panStart.x) / rect.width) * viewW;
      const dy = ((e.clientY - this._panStart.y) / rect.height) * viewH;
      this.camera.position.x = this._camStartPos.x - dx;
      this.camera.position.y = this._camStartPos.y + dy;
    };

    const onMouseUp = () => {
      this._isPanning = false;
    };

    const onWheel = (e: WheelEvent) => {
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      this.zoomTowardCursor(zoomDelta, e.clientX, e.clientY);
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+0 → reset zoom
      if (e.ctrlKey && e.key === '0') {
        this.resetZoom();
        e.preventDefault();
      }
    };

    domElement.addEventListener('mousedown', onMouseDown);
    domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domElement.addEventListener('wheel', onWheel, { passive: false });
    domElement.addEventListener('keydown', onKeyDown);

    this._boundHandlers = { mousedown: onMouseDown, mousemove: onMouseMove, mouseup: onMouseUp, wheel: onWheel, keydown: onKeyDown };
  }

  dispose(): void {
    if (this._domElement && this._boundHandlers.mousedown) {
      this._domElement.removeEventListener('mousedown', this._boundHandlers.mousedown);
      this._domElement.removeEventListener('mousemove', this._boundHandlers.mousemove!);
      this._domElement.removeEventListener('wheel', this._boundHandlers.wheel!);
      this._domElement.removeEventListener('keydown', this._boundHandlers.keydown!);
    }
    if (this._boundHandlers.mouseup) {
      window.removeEventListener('mouseup', this._boundHandlers.mouseup);
    }
  }
}
