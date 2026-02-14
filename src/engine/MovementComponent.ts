// ============================================================
//  MovementComponent — Abstract base class for movement logic.
//  UE-style separation: movement computation is decoupled from
//  input, camera, and physics body management.
//
//  Subclasses:
//    CharacterMovementComponent — walk/run/jump/fly/swim
//    FloatingPawnMovement       — simple 6DOF floating
//    SpectatorPawnMovement      — noclip free-flight
// ============================================================

import * as THREE from 'three';
import type { MovementMode } from './CharacterPawnData';

/**
 * Abstract base class for all movement components.
 *
 * A MovementComponent computes per-frame displacement given an input
 * direction and delta-time. It owns the velocity, movement mode, and
 * ground/jump/crouch state — the owning controller delegates to it.
 */
export abstract class MovementComponent {
  // ---- Public state ----
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public movementMode: MovementMode = 'walking';
  public isGrounded: boolean = false;
  public isJumping: boolean = false;
  public isCrouching: boolean = false;
  public isFalling: boolean = false;

  // ---- Core API ----

  /**
   * Compute the desired displacement vector for this frame.
   *
   * @param dt         Frame delta-time (seconds)
   * @param inputDir   Normalised world-space movement direction from input
   * @param pending    Accumulated addMovementInput from blueprints
   * @param jumpInput  Whether the jump button is held this frame
   * @param crouchInput Whether the crouch button is held this frame
   * @param runInput   Whether the run button is held this frame
   * @returns Displacement vector to feed into the physics system
   */
  abstract computeDisplacement(
    dt: number,
    inputDir: THREE.Vector3,
    pending: THREE.Vector3,
    jumpInput: boolean,
    crouchInput: boolean,
    runInput: boolean,
  ): THREE.Vector3;

  /**
   * Called by the owning controller after the physics step reports
   * whether the character is on the ground.
   */
  abstract onGroundResult(grounded: boolean, runInput: boolean): void;

  /** Current effective movement speed */
  abstract getSpeed(): number;

  /** Current horizontal speed (XZ plane) */
  getHorizontalSpeed(): number {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
  }

  /** Is the character currently moving? */
  isMoving(): boolean {
    return this.getHorizontalSpeed() > 0.01;
  }

  // ---- Movement actions ----

  abstract jump(): void;
  abstract stopJumping(): void;
  abstract crouch(): void;
  abstract uncrouch(): void;
  abstract startFlying(): void;
  abstract stopFlying(): void;
  abstract startSwimming(): void;
  abstract stopSwimming(): void;
  abstract setMovementMode(mode: MovementMode): void;

  /** Launch character with a velocity impulse */
  abstract launch(velocity: { x: number; y: number; z: number }, overrideXY: boolean, overrideZ: boolean): void;

  /** Set the max walking speed at runtime */
  abstract setMaxWalkSpeed(speed: number): void;

  /** Get velocity clone (safe) */
  getVelocity(): THREE.Vector3 {
    return this.velocity.clone();
  }

  /** Clean up any resources */
  destroy(): void {
    // Base: nothing to clean up
  }
}
