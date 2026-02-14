// ============================================================
//  FloatingPawnMovement
//  Simple 6-DOF floating movement with no gravity, no
//  collision response, and configurable speed/deceleration.
//  Similar to UE's FloatingPawnMovement (used by DefaultPawn).
// ============================================================

import * as THREE from 'three';
import { MovementComponent } from './MovementComponent';
import type { MovementMode } from './CharacterPawnData';

export interface FloatingPawnConfig {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  /** If true, input axes freely move in 3D. If false, Y is locked. */
  freeVertical: boolean;
}

export function defaultFloatingPawnConfig(): FloatingPawnConfig {
  return {
    maxSpeed: 12,
    acceleration: 40,
    deceleration: 20,
    freeVertical: true,
  };
}

export class FloatingPawnMovement extends MovementComponent {
  public config: FloatingPawnConfig;

  constructor(config?: Partial<FloatingPawnConfig>) {
    super();
    this.config = { ...defaultFloatingPawnConfig(), ...config };
    this.movementMode = 'flying'; // always "flying" — no gravity
  }

  // ----------------------------------------------------------------
  //  Core displacement
  // ----------------------------------------------------------------

  computeDisplacement(
    dt: number,
    inputDir: THREE.Vector3,
    pending: THREE.Vector3,
    _jumpInput: boolean,
    _crouchInput: boolean,
    _runInput: boolean,
  ): THREE.Vector3 {
    const cfg = this.config;

    // Lock Y if configured
    const desiredDir = inputDir.clone();
    if (!cfg.freeVertical) desiredDir.y = 0;

    desiredDir.add(pending);

    if (desiredDir.lengthSq() > 0.001) {
      // Accelerate toward desired direction
      const targetVel = desiredDir.normalize().multiplyScalar(cfg.maxSpeed);
      const accel = cfg.acceleration * dt;
      this.velocity.lerp(targetVel, Math.min(1, accel / cfg.maxSpeed));
    } else {
      // Decelerate
      const decel = cfg.deceleration * dt;
      const speed = this.velocity.length();
      if (speed > 0.01) {
        const newSpeed = Math.max(0, speed - decel);
        this.velocity.normalize().multiplyScalar(newSpeed);
      } else {
        this.velocity.set(0, 0, 0);
      }
    }

    // Clamp to max speed
    if (this.velocity.length() > cfg.maxSpeed) {
      this.velocity.normalize().multiplyScalar(cfg.maxSpeed);
    }

    return this.velocity.clone().multiplyScalar(dt);
  }

  onGroundResult(_grounded: boolean, _runInput: boolean): void {
    // Floating pawn ignores ground
    this.isGrounded = false;
  }

  getSpeed(): number {
    return this.velocity.length();
  }

  // ---- Stubs (floating pawn doesn't support these) ----

  jump(): void { /* noop */ }
  stopJumping(): void { /* noop */ }
  crouch(): void { /* noop */ }
  uncrouch(): void { /* noop */ }
  startFlying(): void { /* already floating */ }
  stopFlying(): void { /* can't stop floating */ }
  startSwimming(): void { /* noop */ }
  stopSwimming(): void { /* noop */ }
  setMovementMode(_mode: MovementMode): void { /* always flying */ }
  setMaxWalkSpeed(speed: number): void { this.config.maxSpeed = speed; }

  launch(vel: { x: number; y: number; z: number }, overrideXY: boolean, overrideZ: boolean): void {
    if (overrideXY) { this.velocity.x = vel.x; this.velocity.z = vel.z; }
    else            { this.velocity.x += vel.x; this.velocity.z += vel.z; }
    if (overrideZ)  { this.velocity.y = vel.y; }
    else            { this.velocity.y += vel.y; }
  }
}
