// ============================================================
//  SpectatorController — Free-flying camera with no collision
//  Like UE's SpectatorPawn: noclip movement with configurable
//  speed. Used for debug cameras, cinematic flythroughs, and
//  free-look editors.
// ============================================================

import * as THREE from 'three';
import type { GameObject } from './GameObject';
import type { Controller, Pawn } from './Controller';

// ---- Spectator Config ----

export interface SpectatorPawnConfig {
  /** Movement speed (units/sec) */
  moveSpeed: number;
  /** Fast movement speed (shift held) */
  fastMoveSpeed: number;
  /** Mouse sensitivity */
  mouseSensitivity: number;
  /** Field of view */
  fieldOfView: number;
  /** Near clip plane */
  nearClip: number;
  /** Far clip plane */
  farClip: number;
}

export function defaultSpectatorPawnConfig(): SpectatorPawnConfig {
  return {
    moveSpeed: 10,
    fastMoveSpeed: 25,
    mouseSensitivity: 0.15,
    fieldOfView: 90,
    nearClip: 0.1,
    farClip: 2000,
  };
}

// ============================================================
//  SpectatorController class
// ============================================================

export class SpectatorController implements Pawn {
  public gameObject: GameObject;
  public config: SpectatorPawnConfig;

  /** The controller that currently owns (possesses) this pawn */
  public controller: Controller | null = null;

  // ---- Camera ----
  public camera: THREE.PerspectiveCamera;
  public yaw: number = 0;
  public pitch: number = 0;

  // ---- Input state ----
  private _keysDown: Set<string> = new Set();
  private _pointerLocked = false;
  private _mouseDeltaX = 0;
  private _mouseDeltaY = 0;

  // ---- Bound handlers ----
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp: (e: KeyboardEvent) => void;
  private _onMouseMove: (e: MouseEvent) => void;
  private _onPointerLockChange: () => void;
  private _onClick: () => void;
  private _canvas: HTMLCanvasElement | null = null;

  constructor(go: GameObject, config: SpectatorPawnConfig, canvas: HTMLCanvasElement) {
    this.gameObject = go;
    this.config = config;
    this._canvas = canvas;

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      config.fieldOfView,
      canvas.clientWidth / canvas.clientHeight,
      config.nearClip,
      config.farClip,
    );

    // Initialize from gameObject position/rotation
    const pos = go.mesh.position;
    this.camera.position.copy(pos);
    this.yaw = go.mesh.rotation.y;
    this.pitch = go.mesh.rotation.x;

    // Hide mesh — spectator pawn is invisible
    go.mesh.visible = false;

    // ---- Bind input ----
    this._onKeyDown = (e: KeyboardEvent) => this._keysDown.add(e.code);
    this._onKeyUp = (e: KeyboardEvent) => this._keysDown.delete(e.code);
    this._onMouseMove = (e: MouseEvent) => {
      if (!this._pointerLocked) return;
      this._mouseDeltaX += e.movementX;
      this._mouseDeltaY += e.movementY;
    };
    this._onPointerLockChange = () => {
      this._pointerLocked = document.pointerLockElement === canvas;
    };
    this._onClick = () => {
      if (!this._pointerLocked) canvas.requestPointerLock();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    canvas.addEventListener('click', this._onClick);
  }

  // ---- Per-frame update ----

  update(dt: number): void {
    // Mouse look
    const sens = this.config.mouseSensitivity * 0.01;
    this.yaw -= this._mouseDeltaX * sens;
    this.pitch -= this._mouseDeltaY * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;

    // Movement direction (relative to camera orientation)
    const dir = new THREE.Vector3();
    if (this._keysDown.has('KeyW')) dir.z -= 1;
    if (this._keysDown.has('KeyS')) dir.z += 1;
    if (this._keysDown.has('KeyA')) dir.x -= 1;
    if (this._keysDown.has('KeyD')) dir.x += 1;
    if (this._keysDown.has('Space')) dir.y += 1;
    if (this._keysDown.has('ControlLeft') || this._keysDown.has('ControlRight')) dir.y -= 1;

    if (dir.lengthSq() > 0) {
      dir.normalize();
      // Rotate by yaw + pitch for full 3D flight
      const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
      const flatDir = new THREE.Vector3(dir.x, 0, dir.z);
      flatDir.applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));
      // Vertical is world-space
      flatDir.y = dir.y;
      if (flatDir.lengthSq() > 0) flatDir.normalize();

      const speed = this._keysDown.has('ShiftLeft') || this._keysDown.has('ShiftRight')
        ? this.config.fastMoveSpeed
        : this.config.moveSpeed;

      this.camera.position.add(flatDir.multiplyScalar(speed * dt));
    }

    // Apply rotation
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Sync mesh position (for debugging, even though invisible)
    this.gameObject.mesh.position.copy(this.camera.position);
  }

  // ---- Blueprint API ----

  setMoveSpeed(speed: number): void {
    this.config.moveSpeed = speed;
  }

  setFastMoveSpeed(speed: number): void {
    this.config.fastMoveSpeed = speed;
  }

  getCameraLocation(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  getCameraRotation(): THREE.Euler {
    return this.camera.rotation.clone();
  }

  /** Teleport spectator to a world position */
  teleportTo(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
    this.gameObject.mesh.position.set(x, y, z);
  }

  /** Look at a world position */
  lookAt(x: number, y: number, z: number): void {
    this.camera.lookAt(x, y, z);
    // Extract yaw/pitch from the resulting rotation
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = euler.y;
    this.pitch = euler.x;
  }

  // ---- Cleanup ----

  destroy(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onClick);
    }
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this._keysDown.clear();
  }
}

// ============================================================
//  SpectatorControllerManager
// ============================================================

export class SpectatorControllerManager {
  public controllers: SpectatorController[] = [];
  public activeSpectator: SpectatorController | null = null;

  createController(go: GameObject, config: SpectatorPawnConfig, canvas: HTMLCanvasElement): SpectatorController {
    const ctrl = new SpectatorController(go, config, canvas);
    go.characterController = ctrl; // Reuse the field (it's typed as any)
    this.controllers.push(ctrl);
    if (!this.activeSpectator) {
      this.activeSpectator = ctrl;
    }
    return ctrl;
  }

  update(dt: number): void {
    for (const ctrl of this.controllers) {
      ctrl.update(dt);
    }
  }

  getActiveCamera(): THREE.PerspectiveCamera | null {
    return this.activeSpectator?.camera ?? null;
  }

  destroyAll(): void {
    for (const ctrl of this.controllers) {
      ctrl.destroy();
    }
    this.controllers = [];
    this.activeSpectator = null;
  }
}
