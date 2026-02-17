/**
 * Professional camera navigation controller — UE-style viewport camera.
 *
 * Modes:
 *  - Fly mode  (RMB + WASD/QE + mouse look)
 *  - Orbit mode (Alt + LMB drag)
 *  - Pan mode   (MMB drag, or Alt + MMB drag)
 *  - Zoom       (scroll wheel, Alt + RMB drag)
 *  - Focus      (F key — fly to selection)
 *  - Ortho views (numpad or menu)
 */

import * as THREE from 'three';

export type CameraViewMode = 'perspective' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

export interface CameraSettings {
  flySpeed: number;
  flySpeedMultiplier: number;
  mouseSensitivity: number;
  panSpeed: number;
  orbitSpeed: number;
  zoomSpeed: number;
  smoothing: boolean;
}

const DEFAULT_SETTINGS: CameraSettings = {
  flySpeed: 5.0,
  flySpeedMultiplier: 1.0,
  mouseSensitivity: 0.2,
  panSpeed: 0.8,
  orbitSpeed: 0.4,
  zoomSpeed: 1.0,
  smoothing: true,
};

export class ViewportCameraController {
  camera: THREE.PerspectiveCamera;
  private _domElement: HTMLElement;

  settings: CameraSettings = { ...DEFAULT_SETTINGS };

  /* Navigation state */
  private _isFlyMode = false;
  private _isOrbitMode = false;
  private _isPanMode = false;
  private _isAltZoom = false;
  private _rightMouseDown = false;
  private _middleMouseDown = false;
  private _leftMouseDown = false;
  private _altDown = false;
  private _shiftDown = false;
  private _ctrlDown = false;

  /* Input tracking */
  private _keys = new Set<string>();
  private _lastMouseX = 0;
  private _lastMouseY = 0;
  private _mouseDeltaX = 0;
  private _mouseDeltaY = 0;
  private _hasFirstMove = false;

  /* Orbit pivot */
  orbitTarget = new THREE.Vector3(0, 0.5, 0);

  /* Euler for fly-mode look (YXZ order avoids gimbal issues) */
  private _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  /* Animation */
  private _animating = false;
  private _animStartPos = new THREE.Vector3();
  private _animEndPos = new THREE.Vector3();
  private _animStartQuat = new THREE.Quaternion();
  private _animEndQuat = new THREE.Quaternion();
  private _animLookAt = new THREE.Vector3();
  private _animStartTime = 0;
  private _animDuration = 0.35;

  /* Orthographic state */
  private _viewMode: CameraViewMode = 'perspective';

  /* Callbacks */
  private _gizmoDragging = false;
  private _onCameraSpeedChanged: ((speed: number) => void) | null = null;

  /* Bound handlers for cleanup */
  private _boundMouseDown: (e: MouseEvent) => void;
  private _boundMouseUp: (e: MouseEvent) => void;
  private _boundMouseMove: (e: MouseEvent) => void;
  private _boundWheel: (e: WheelEvent) => void;
  private _boundContextMenu: (e: Event) => void;
  private _boundKeyDown: (e: KeyboardEvent) => void;
  private _boundKeyUp: (e: KeyboardEvent) => void;
  private _boundPointerLockChange: () => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this._domElement = domElement;

    this._boundMouseDown = (e) => this._onMouseDown(e);
    this._boundMouseUp = (e) => this._onMouseUp(e);
    this._boundMouseMove = (e) => this._onMouseMove(e);
    this._boundWheel = (e) => this._onWheel(e);
    this._boundContextMenu = (e) => e.preventDefault();
    this._boundKeyDown = (e) => this._onKeyDown(e);
    this._boundKeyUp = (e) => this._onKeyUp(e);
    this._boundPointerLockChange = () => this._onPointerLockChange();

    this._setupEvents();

    // Initialise euler from camera
    this._euler.setFromQuaternion(this.camera.quaternion);
  }

  /* -------- public API -------- */

  set gizmoDragging(v: boolean) {
    this._gizmoDragging = v;
  }

  get isFlyMode() {
    return this._isFlyMode;
  }

  get viewMode() {
    return this._viewMode;
  }

  set onCameraSpeedChanged(fn: ((speed: number) => void) | null) {
    this._onCameraSpeedChanged = fn;
  }

  /** Call once per frame from the render loop */
  update(deltaTime: number): void {
    if (this._animating) {
      this._updateAnimation();
      return;
    }

    if (this._isFlyMode) {
      this._updateFlyMovement(deltaTime);
    }
  }

  focusOnObjects(objects: THREE.Object3D[]): void {
    if (objects.length === 0) return;

    const box = new THREE.Box3();
    objects.forEach((obj) => box.expandByObject(obj));
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1) * 1.5;

    const dir = this.camera.position.clone().sub(center).normalize();
    if (dir.lengthSq() < 0.001) dir.set(0, 0.5, 1).normalize();

    const targetPos = center.clone().add(dir.multiplyScalar(radius));
    this._animateCamera(targetPos, center);
  }

  setViewMode(mode: CameraViewMode): void {
    this._viewMode = mode;
    const dist = this.orbitTarget.clone().sub(this.camera.position).length() || 10;
    const target = this.orbitTarget.clone();

    let pos: THREE.Vector3;
    switch (mode) {
      case 'top':
        pos = target.clone().add(new THREE.Vector3(0, dist, 0));
        break;
      case 'bottom':
        pos = target.clone().add(new THREE.Vector3(0, -dist, 0));
        break;
      case 'front':
        pos = target.clone().add(new THREE.Vector3(0, 0, dist));
        break;
      case 'back':
        pos = target.clone().add(new THREE.Vector3(0, 0, -dist));
        break;
      case 'left':
        pos = target.clone().add(new THREE.Vector3(-dist, 0, 0));
        break;
      case 'right':
        pos = target.clone().add(new THREE.Vector3(dist, 0, 0));
        break;
      default:
        // perspective — keep current position
        return;
    }

    this._animateCamera(pos, target);
  }

  getCameraState() {
    return {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.orbitTarget.x, y: this.orbitTarget.y, z: this.orbitTarget.z },
    };
  }

  applyCameraState(state: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }): void {
    this.camera.position.set(state.position.x, state.position.y, state.position.z);
    this.orbitTarget.set(state.target.x, state.target.y, state.target.z);
    this.camera.lookAt(this.orbitTarget);
    this._euler.setFromQuaternion(this.camera.quaternion);
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) {
      this._isFlyMode = false;
      this._isOrbitMode = false;
      this._isPanMode = false;
      this._isAltZoom = false;
      this._rightMouseDown = false;
      this._middleMouseDown = false;
      this._leftMouseDown = false;
      this._keys.clear();
      if (document.pointerLockElement === this._domElement) {
        document.exitPointerLock();
      }
    }
  }

  dispose(): void {
    this._domElement.removeEventListener('mousedown', this._boundMouseDown);
    this._domElement.removeEventListener('mouseup', this._boundMouseUp);
    this._domElement.removeEventListener('mousemove', this._boundMouseMove);
    this._domElement.removeEventListener('wheel', this._boundWheel);
    this._domElement.removeEventListener('contextmenu', this._boundContextMenu);
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
    document.removeEventListener('pointerlockchange', this._boundPointerLockChange);
    // Also remove the global mouseup/mousemove listeners (in case they got attached)
    window.removeEventListener('mouseup', this._boundMouseUp);
    window.removeEventListener('mousemove', this._boundMouseMove);
  }

  /* -------- private: events -------- */

  private _setupEvents(): void {
    const el = this._domElement;
    el.addEventListener('mousedown', this._boundMouseDown);
    el.addEventListener('wheel', this._boundWheel, { passive: false });
    el.addEventListener('contextmenu', this._boundContextMenu);

    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
    document.addEventListener('pointerlockchange', this._boundPointerLockChange);
  }

  private _onPointerLockChange(): void {
    if (document.pointerLockElement !== this._domElement) {
      // Lost pointer lock → exit fly mode
      this._isFlyMode = false;
      this._rightMouseDown = false;
      this._hasFirstMove = false;
    }
  }

  private _onMouseDown(e: MouseEvent): void {
    if (this._gizmoDragging) return;

    if (e.button === 2) {
      // Right mouse → fly mode
      this._rightMouseDown = true;
      this._isFlyMode = true;
      this._hasFirstMove = false;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
      // Request pointer lock for smooth FPS look
      this._domElement.requestPointerLock();
      // Listen globally for moves/up while pointer locked
      window.addEventListener('mousemove', this._boundMouseMove);
      window.addEventListener('mouseup', this._boundMouseUp);
      // Sync euler from camera
      this._euler.setFromQuaternion(this.camera.quaternion);
    }

    if (e.button === 1) {
      // Middle mouse → pan
      e.preventDefault();
      this._middleMouseDown = true;
      this._isPanMode = true;
      this._hasFirstMove = false;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
      window.addEventListener('mousemove', this._boundMouseMove);
      window.addEventListener('mouseup', this._boundMouseUp);
    }

    if (e.button === 0 && this._altDown) {
      // Alt + LMB → orbit
      this._leftMouseDown = true;
      if (this._shiftDown) {
        // Alt+Shift+LMB could be used for something else; for now → orbit
      }
      this._isOrbitMode = true;
      this._hasFirstMove = false;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
      window.addEventListener('mousemove', this._boundMouseMove);
      window.addEventListener('mouseup', this._boundMouseUp);
    }

    if (e.button === 2 && this._altDown) {
      // Already handled by fly mode, but treat as alt-zoom instead
      this._isFlyMode = false;
      this._isAltZoom = true;
    }
  }

  private _onMouseUp(e: MouseEvent): void {
    if (e.button === 2) {
      this._rightMouseDown = false;
      this._isFlyMode = false;
      this._isAltZoom = false;
      this._hasFirstMove = false;
      if (document.pointerLockElement === this._domElement) {
        document.exitPointerLock();
      }
      window.removeEventListener('mousemove', this._boundMouseMove);
      window.removeEventListener('mouseup', this._boundMouseUp);
    }

    if (e.button === 1) {
      this._middleMouseDown = false;
      this._isPanMode = false;
      this._hasFirstMove = false;
      window.removeEventListener('mousemove', this._boundMouseMove);
      window.removeEventListener('mouseup', this._boundMouseUp);
    }

    if (e.button === 0) {
      this._leftMouseDown = false;
      this._isOrbitMode = false;
      this._hasFirstMove = false;
      if (!this._rightMouseDown && !this._middleMouseDown) {
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('mouseup', this._boundMouseUp);
      }
    }
  }

  private _onMouseMove(e: MouseEvent): void {
    // Calculate delta
    if (document.pointerLockElement === this._domElement) {
      this._mouseDeltaX = e.movementX;
      this._mouseDeltaY = e.movementY;
    } else {
      if (!this._hasFirstMove) {
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        this._hasFirstMove = true;
        return;
      }
      this._mouseDeltaX = e.clientX - this._lastMouseX;
      this._mouseDeltaY = e.clientY - this._lastMouseY;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
    }

    if (this._isFlyMode && !this._isAltZoom) {
      this._handleFlyLook();
    }

    if (this._isOrbitMode) {
      this._handleOrbit();
    }

    if (this._isPanMode || (this._altDown && this._middleMouseDown)) {
      this._handlePan();
    }

    if (this._isAltZoom) {
      this._handleAltZoom();
    }
  }

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();

    if (this._isFlyMode) {
      // Adjust fly speed
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      this.settings.flySpeed = Math.max(0.1, Math.min(1000, this.settings.flySpeed * factor));
      this._onCameraSpeedChanged?.(this.settings.flySpeed);
    } else {
      // Zoom dolly
      let speedMod = 1.0;
      if (this._ctrlDown) speedMod = 0.25;
      if (this._shiftDown) speedMod = 3.0;

      const dist = this.camera.position.distanceTo(this.orbitTarget);
      const zoomAmount = e.deltaY * 0.001 * dist * this.settings.zoomSpeed * speedMod;

      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      this.camera.position.addScaledVector(forward, -zoomAmount);
    }
  }

  private _onKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Alt') { this._altDown = true; e.preventDefault(); }
    if (e.key === 'Shift') this._shiftDown = true;
    if (e.key === 'Control' || e.key === 'Meta') this._ctrlDown = true;

    this._keys.add(e.code);
  }

  private _onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Alt') this._altDown = false;
    if (e.key === 'Shift') this._shiftDown = false;
    if (e.key === 'Control' || e.key === 'Meta') this._ctrlDown = false;

    this._keys.delete(e.code);
  }

  /* -------- private: navigation -------- */

  private _handleFlyLook(): void {
    const sens = this.settings.mouseSensitivity;

    this._euler.y -= this._mouseDeltaX * sens * (Math.PI / 180);
    this._euler.x -= this._mouseDeltaY * sens * (Math.PI / 180);

    // Clamp pitch
    this._euler.x = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, this._euler.x));

    this.camera.quaternion.setFromEuler(this._euler);
  }

  private _updateFlyMovement(deltaTime: number): void {
    const speed =
      this.settings.flySpeed *
      this.settings.flySpeedMultiplier *
      (this._shiftDown ? 3.0 : 1.0) *
      deltaTime;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const worldUp = new THREE.Vector3(0, 1, 0);

    const movement = new THREE.Vector3();

    if (this._keys.has('KeyW')) movement.addScaledVector(forward, speed);
    if (this._keys.has('KeyS')) movement.addScaledVector(forward, -speed);
    if (this._keys.has('KeyA')) movement.addScaledVector(right, -speed);
    if (this._keys.has('KeyD')) movement.addScaledVector(right, speed);
    if (this._keys.has('KeyQ')) movement.addScaledVector(worldUp, -speed);
    if (this._keys.has('KeyE')) movement.addScaledVector(worldUp, speed);

    if (movement.lengthSq() > 0) {
      this.camera.position.add(movement);
      this.orbitTarget.add(movement);
    }
  }

  private _handleOrbit(): void {
    const speed = this.settings.orbitSpeed;

    const offset = new THREE.Vector3().copy(this.camera.position).sub(this.orbitTarget);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    spherical.theta -= this._mouseDeltaX * speed * (Math.PI / 180);
    spherical.phi -= this._mouseDeltaY * speed * (Math.PI / 180);

    // Clamp vertical
    spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi));

    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.orbitTarget).add(offset);
    this.camera.lookAt(this.orbitTarget);

    // Sync euler so fly mode is consistent
    this._euler.setFromQuaternion(this.camera.quaternion);
  }

  private _handlePan(): void {
    const speed = this.settings.panSpeed;
    const dist = this.camera.position.distanceTo(this.orbitTarget);
    const scale = dist * 0.001;

    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    right.setFromMatrixColumn(this.camera.matrix, 0);
    up.setFromMatrixColumn(this.camera.matrix, 1);

    const panOffset = new THREE.Vector3();
    panOffset.addScaledVector(right, -this._mouseDeltaX * speed * scale);
    panOffset.addScaledVector(up, this._mouseDeltaY * speed * scale);

    this.camera.position.add(panOffset);
    this.orbitTarget.add(panOffset);
  }

  private _handleAltZoom(): void {
    const dist = this.camera.position.distanceTo(this.orbitTarget);
    const zoomAmount = this._mouseDeltaY * 0.005 * dist;

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    this.camera.position.addScaledVector(forward, zoomAmount);
  }

  /* -------- private: animation -------- */

  private _animateCamera(targetPos: THREE.Vector3, lookAt: THREE.Vector3): void {
    this._animStartPos.copy(this.camera.position);
    this._animEndPos.copy(targetPos);

    // Compute end quaternion by looking at target
    const tmpCam = this.camera.clone();
    tmpCam.position.copy(targetPos);
    tmpCam.lookAt(lookAt);
    this._animStartQuat.copy(this.camera.quaternion);
    this._animEndQuat.copy(tmpCam.quaternion);

    this._animLookAt.copy(lookAt);
    this._animStartTime = performance.now();
    this._animating = true;
  }

  private _updateAnimation(): void {
    const elapsed = (performance.now() - this._animStartTime) / 1000;
    let t = Math.min(elapsed / this._animDuration, 1.0);

    // Ease in-out cubic
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.camera.position.lerpVectors(this._animStartPos, this._animEndPos, t);
    this.camera.quaternion.slerpQuaternions(this._animStartQuat, this._animEndQuat, t);

    if (t >= 1.0) {
      this._animating = false;
      this.orbitTarget.copy(this._animLookAt);
      this._euler.setFromQuaternion(this.camera.quaternion);
    }
  }
}
