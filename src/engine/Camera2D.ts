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

  // Pan state
  private _isPanning = false;
  private _panStart = { x: 0, y: 0 };
  private _camStartPos = { x: 0, y: 0 };

  private _domElement: HTMLElement | null = null;
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
    const w = (this.referenceWidth / this.pixelsPerUnit) / this.zoom;
    const h = (this.referenceHeight / this.pixelsPerUnit) / this.zoom;
    return { w, h };
  }

  resize(containerWidth: number, containerHeight: number): void {
    const aspect = containerWidth / containerHeight;
    const refAspect = this.referenceWidth / this.referenceHeight;
    let w: number, h: number;

    if (aspect > refAspect) {
      h = (this.referenceHeight / this.pixelsPerUnit) / this.zoom;
      w = h * aspect;
    } else {
      w = (this.referenceWidth / this.pixelsPerUnit) / this.zoom;
      h = w / aspect;
    }

    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
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
    this.setZoom(this.zoom * (1 + zoomDelta));
    const worldAfter = this.screenToWorld(screenX, screenY);

    this.camera.position.x += worldBefore.x - worldAfter.x;
    this.camera.position.y += worldBefore.y - worldAfter.y;
  }

  resetZoom(): void {
    this.setZoom(1.0);
    this.camera.position.x = 0;
    this.camera.position.y = 0;
  }

  // ---- Coordinate conversion ----

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    if (!this._domElement) {
      const v = new THREE.Vector3(
        (sx / window.innerWidth) * 2 - 1,
        -((sy / window.innerHeight) * 2 - 1),
        0
      );
      v.unproject(this.camera);
      return { x: v.x, y: v.y };
    }

    const rect = this._domElement.getBoundingClientRect();
    const ndcX = ((sx - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((sy - rect.top) / rect.height) * 2 - 1);
    const v = new THREE.Vector3(ndcX, ndcY, 0);
    v.unproject(this.camera);
    return { x: v.x, y: v.y };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const v = new THREE.Vector3(wx, wy, 0);
    v.project(this.camera);
    if (this._domElement) {
      const rect = this._domElement.getBoundingClientRect();
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
    // Follow target
    if (this._followTarget) {
      let targetX: number, targetY: number;
      if (this._followTarget.group) {
        targetX = this._followTarget.group.position.x;
        targetY = this._followTarget.group.position.y;
      } else if (this._followTarget.transform2D) {
        targetX = this._followTarget.transform2D.position.x;
        targetY = this._followTarget.transform2D.position.y;
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

    // Shake
    if (this._shakeTimer < this._shakeDuration) {
      this._shakeTimer += deltaTime;
      const t = 1 - this._shakeTimer / this._shakeDuration;
      this._shakeOffset.x = (Math.random() * 2 - 1) * this._shakeIntensity * t;
      this._shakeOffset.y = (Math.random() * 2 - 1) * this._shakeIntensity * t;
    } else {
      this._shakeOffset.x = 0;
      this._shakeOffset.y = 0;
    }

    // Apply shake (position is already set by follow or pan)
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
      const rect = domElement.getBoundingClientRect();
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
