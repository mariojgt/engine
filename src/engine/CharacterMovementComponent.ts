// ============================================================
//  CharacterMovementComponent
//  Extracted from CharacterController — handles all movement
//  computation: gravity, jumping, crouching, flying, swimming,
//  buoyancy, speed determination, mode transitions.
//
//  The owning CharacterController calls computeDisplacement()
//  each frame with the input direction and gets back a
//  displacement vector to feed into Rapier.
// ============================================================

import * as THREE from 'three';
import { MovementComponent } from './MovementComponent';
import type { CharacterMovementConfig, MovementMode } from './CharacterPawnData';

export class CharacterMovementComponent extends MovementComponent {
  public config: CharacterMovementConfig;

  constructor(config: CharacterMovementConfig) {
    super();
    this.config = config;
    this.movementMode = 'falling'; // start in air, ground detection will correct
  }

  // ----------------------------------------------------------------
  //  Core: computeDisplacement
  // ----------------------------------------------------------------

  computeDisplacement(
    dt: number,
    inputDir: THREE.Vector3,
    pending: THREE.Vector3,
    jumpInput: boolean,
    crouchInput: boolean,
    runInput: boolean,
  ): THREE.Vector3 {

    // 1. Speed
    const speed = this._currentSpeed(runInput);

    // 2. Horizontal movement velocity
    const moveVel = inputDir.clone().multiplyScalar(speed);

    // 3. Add pending blueprint movement
    moveVel.add(pending);

    // 4. Gravity / vertical physics
    if (this.movementMode !== 'flying' && this.movementMode !== 'swimming') {
      this._applyGravity(dt);
    }

    // 5. Jumping
    if (this.movementMode === 'flying') {
      // Flying: vertical axes handled by inputDir (see CharacterController._calculateMovementDirection)
    } else if (this.movementMode === 'swimming') {
      this._applyBuoyancy(dt);
    } else if (jumpInput && this.isGrounded && this.config.canJump) {
      this.velocity.y = this.config.jumpVelocity;
      this.isJumping = true;
      this.isGrounded = false;
      this.movementMode = 'jumping';
    }

    // 6. Crouch (not while flying/swimming)
    if (this.movementMode !== 'flying' && this.movementMode !== 'swimming') {
      if (crouchInput && this.isGrounded && this.config.canCrouch) {
        this.isCrouching = true;
        this.movementMode = 'crouching';
      } else if (this.isCrouching && !crouchInput) {
        this.isCrouching = false;
        if (this.isGrounded) this.movementMode = 'walking';
      }
    }

    // 7. Build displacement
    let displacement: THREE.Vector3;
    if (this.movementMode === 'flying') {
      displacement = new THREE.Vector3(moveVel.x * dt, moveVel.y * dt, moveVel.z * dt);
    } else if (this.movementMode === 'swimming') {
      displacement = new THREE.Vector3(moveVel.x * dt, (moveVel.y + this.velocity.y) * dt, moveVel.z * dt);
    } else {
      displacement = new THREE.Vector3(moveVel.x * dt, this.velocity.y * dt, moveVel.z * dt);
    }

    return displacement;
  }

  // ----------------------------------------------------------------
  //  Ground result callback (called after physics step)
  // ----------------------------------------------------------------

  onGroundResult(grounded: boolean, runInput: boolean): void {
    this.isGrounded = grounded;

    if (this.movementMode === 'flying' || this.movementMode === 'swimming') {
      this.isFalling = false;
      return;
    }

    if (grounded) {
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (this.isJumping) this.isJumping = false;
      this.isFalling = false;
      if (!this.isCrouching) {
        this.movementMode = runInput && this.config.canRun ? 'running' : 'walking';
      }
    } else {
      this.isFalling = this.velocity.y < 0;
      if (!this.isJumping) this.movementMode = 'falling';
    }
  }

  // ----------------------------------------------------------------
  //  Speed
  // ----------------------------------------------------------------

  getSpeed(): number {
    return this._currentSpeed(false);
  }

  private _currentSpeed(runInput: boolean): number {
    const m = this.config;
    if (this.movementMode === 'flying') return m.flySpeed;
    if (this.movementMode === 'swimming') return m.swimSpeed;
    if (this.isCrouching) return m.crouchSpeed;
    if (runInput && m.canRun) return m.runSpeed;
    return m.walkSpeed;
  }

  // ----------------------------------------------------------------
  //  Gravity & buoyancy
  // ----------------------------------------------------------------

  private _applyGravity(dt: number): void {
    if (!this.isGrounded) {
      this.velocity.y += this.config.gravity * dt;
    }
  }

  private _applyBuoyancy(dt: number): void {
    const m = this.config;
    const buoyancyForce = -m.gravity * m.buoyancy;
    this.velocity.y += (m.gravity + buoyancyForce) * dt;
    this.velocity.y *= 0.95;
  }

  // ----------------------------------------------------------------
  //  Movement actions
  // ----------------------------------------------------------------

  jump(): void {
    if (this.isGrounded && this.config.canJump) {
      this.velocity.y = this.config.jumpVelocity;
      this.isJumping = true;
      this.isGrounded = false;
      this.movementMode = 'jumping';
    }
  }

  stopJumping(): void {
    if (this.isJumping && this.velocity.y > 0) {
      this.velocity.y = 0;
    }
  }

  crouch(): void {
    if (this.config.canCrouch) this.isCrouching = true;
  }

  uncrouch(): void {
    this.isCrouching = false;
  }

  startFlying(): void {
    if (!this.config.canFly) return;
    this.movementMode = 'flying';
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.isJumping = false;
    this.isCrouching = false;
    this.isFalling = false;
  }

  stopFlying(): void {
    if (this.movementMode !== 'flying') return;
    this.movementMode = 'falling';
  }

  startSwimming(): void {
    if (!this.config.canSwim) return;
    this.movementMode = 'swimming';
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.isJumping = false;
    this.isCrouching = false;
    this.isFalling = false;
  }

  stopSwimming(): void {
    if (this.movementMode !== 'swimming') return;
    this.movementMode = 'falling';
  }

  setMovementMode(mode: MovementMode): void {
    this.movementMode = mode;
  }

  setMaxWalkSpeed(speed: number): void {
    this.config.walkSpeed = speed;
  }

  launch(launchVelocity: { x: number; y: number; z: number }, overrideXY: boolean, overrideZ: boolean): void {
    if (overrideXY) {
      this.velocity.x = launchVelocity.x;
      this.velocity.z = launchVelocity.z;
    } else {
      this.velocity.x += launchVelocity.x;
      this.velocity.z += launchVelocity.z;
    }
    if (overrideZ) {
      this.velocity.y = launchVelocity.y;
    } else {
      this.velocity.y += launchVelocity.y;
    }
    this.isGrounded = false;
    this.movementMode = this.velocity.y > 0 ? 'jumping' : 'falling';
  }
}
