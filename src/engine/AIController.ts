// ============================================================
//  AIController — UE-style AI Controller
//  Extends Controller base class. Drives NPC pawn movement
//  without player input.
//
//  Supports:
//  - MoveTo(location) — navigate to a world position
//  - StopMovement() — halt navigation
//  - SetFocalPoint() — look at a position
//  - Patrol paths — cycle through waypoints
//  - Follow another actor
//  - Simple state machine for AI behavior
//
//  Movement is performed by issuing addMovementInput() to the
//  possessed CharacterController each frame.
//
//  UE parity:
//  - pawn.getController() → this AIController
//  - controller.getPawn() → the pawn
//  - Assigned via `controllerClass` on the actor asset
// ============================================================

import * as THREE from 'three';
import type { GameObject } from './GameObject';
import { Controller, type Pawn, type ControllerType } from './Controller';
import type { CharacterController } from './CharacterController';

// ---- AI State ----

export type AIState = 'idle' | 'movingTo' | 'patrolling' | 'following' | 'custom';

// ---- AI Controller Config ----

export interface AIControllerConfig {
  /** Acceptance radius for MoveTo (how close = "arrived") */
  acceptanceRadius: number;
  /** Movement speed multiplier (scales AddMovementInput) */
  moveScale: number;
  /** Whether the AI can strafe or must face movement direction */
  canStrafe: boolean;
  /** Rotation speed when turning to face target (degrees/sec) */
  rotationSpeed: number;
}

export function defaultAIControllerConfig(): AIControllerConfig {
  return {
    acceptanceRadius: 0.5,
    moveScale: 1.0,
    canStrafe: false,
    rotationSpeed: 360,
  };
}

// ---- Patrol Path ----

export interface PatrolPoint {
  x: number;
  y: number;
  z: number;
  /** Optional wait time at this point (seconds) */
  waitTime: number;
}

// ============================================================
//  AIController class
// ============================================================

export class AIController extends Controller {
  public readonly controllerType: ControllerType = 'AIController';

  public config: AIControllerConfig;

  // ---- State ----
  public state: AIState = 'idle';
  public moveTarget: THREE.Vector3 | null = null;
  public focalPoint: THREE.Vector3 | null = null;

  // ---- Patrol ----
  public patrolPoints: PatrolPoint[] = [];
  public patrolIndex: number = 0;
  public patrolLoop: boolean = true;
  private _patrolWaitTimer: number = 0;

  // ---- Follow ----
  public followTarget: GameObject | null = null;
  public followDistance: number = 3;

  // ---- Callbacks ----
  private _onArrived: (() => void) | null = null;

  constructor(config?: AIControllerConfig) {
    super();
    this.config = config ?? defaultAIControllerConfig();
  }

  /** Convenience getter — returns the possessed pawn's GameObject (or a dummy) */
  get gameObject(): GameObject {
    return this._pawn!.gameObject;
  }

  // ---- Navigation API ----

  /**
   * Move to a world position. The AI will navigate each frame
   * until it arrives within acceptanceRadius.
   */
  moveTo(x: number, y: number, z: number, onArrived?: () => void): void {
    this.moveTarget = new THREE.Vector3(x, y, z);
    this.state = 'movingTo';
    this._onArrived = onArrived ?? null;
  }

  /** Stop all movement */
  stopMovement(): void {
    this.moveTarget = null;
    this.state = 'idle';
    this._onArrived = null;
  }

  /** Set a point to look at (independent of movement) */
  setFocalPoint(x: number, y: number, z: number): void {
    this.focalPoint = new THREE.Vector3(x, y, z);
  }

  /** Clear focal point */
  clearFocalPoint(): void {
    this.focalPoint = null;
  }

  // ---- Patrol API ----

  /**
   * Set patrol path and start patrolling.
   * @param points Array of {x, y, z, waitTime} waypoints
   * @param loop Whether to cycle or stop at the end
   */
  startPatrol(points: PatrolPoint[], loop: boolean = true): void {
    this.patrolPoints = points;
    this.patrolLoop = loop;
    this.patrolIndex = 0;
    this._patrolWaitTimer = 0;
    if (points.length > 0) {
      const p = points[0];
      this.moveTarget = new THREE.Vector3(p.x, p.y, p.z);
      this.state = 'patrolling';
    }
  }

  /** Stop patrolling */
  stopPatrol(): void {
    this.patrolPoints = [];
    this.state = 'idle';
    this.moveTarget = null;
  }

  // ---- Follow API ----

  /** Follow another GameObject, maintaining distance */
  startFollowing(target: GameObject, distance: number = 3): void {
    this.followTarget = target;
    this.followDistance = distance;
    this.state = 'following';
  }

  /** Stop following */
  stopFollowing(): void {
    this.followTarget = null;
    this.state = 'idle';
  }

  // ---- Per-frame update ----

  update(dt: number): void {
    const pawn = this._pawn;
    if (!pawn) return;
    const go = pawn.gameObject;
    const cc = go.characterController as CharacterController | null;
    if (!cc) return;

    switch (this.state) {
      case 'idle':
        break;

      case 'movingTo':
        this._updateMoveTo(dt, cc);
        break;

      case 'patrolling':
        this._updatePatrol(dt, cc);
        break;

      case 'following':
        this._updateFollow(dt, cc);
        break;
    }

    // Apply focal point rotation (look at target)
    if (this.focalPoint) {
      this._lookAt(this.focalPoint, dt, cc);
    }
  }

  // ---- Internal movement logic ----

  private _updateMoveTo(dt: number, cc: CharacterController): void {
    if (!this.moveTarget) {
      this.state = 'idle';
      return;
    }

    const pos = this.gameObject.mesh.position;
    const toTarget = new THREE.Vector3(
      this.moveTarget.x - pos.x,
      0, // Ignore Y for ground movement
      this.moveTarget.z - pos.z,
    );
    const dist = toTarget.length();

    if (dist <= this.config.acceptanceRadius) {
      // Arrived!
      this.state = 'idle';
      this.moveTarget = null;
      if (this._onArrived) {
        const cb = this._onArrived;
        this._onArrived = null;
        cb();
      }
      return;
    }

    // Navigate toward target
    toTarget.normalize();
    cc.addMovementInput(
      { x: toTarget.x, y: 0, z: -toTarget.z },
      this.config.moveScale,
    );
  }

  private _updatePatrol(dt: number, cc: CharacterController): void {
    if (this.patrolPoints.length === 0) {
      this.state = 'idle';
      return;
    }

    // Check if waiting at current waypoint
    if (this._patrolWaitTimer > 0) {
      this._patrolWaitTimer -= dt;
      return;
    }

    if (!this.moveTarget) {
      // Advance to next waypoint
      this.patrolIndex++;
      if (this.patrolIndex >= this.patrolPoints.length) {
        if (this.patrolLoop) {
          this.patrolIndex = 0;
        } else {
          this.state = 'idle';
          return;
        }
      }
      const p = this.patrolPoints[this.patrolIndex];
      this.moveTarget = new THREE.Vector3(p.x, p.y, p.z);
    }

    // Move toward current waypoint
    const pos = this.gameObject.mesh.position;
    const toTarget = new THREE.Vector3(
      this.moveTarget!.x - pos.x,
      0,
      this.moveTarget!.z - pos.z,
    );
    const dist = toTarget.length();

    if (dist <= this.config.acceptanceRadius) {
      // Arrived at waypoint
      const wp = this.patrolPoints[this.patrolIndex];
      if (wp.waitTime > 0) {
        this._patrolWaitTimer = wp.waitTime;
      }
      this.moveTarget = null; // Will advance next frame
      return;
    }

    toTarget.normalize();
    cc.addMovementInput(
      { x: toTarget.x, y: 0, z: -toTarget.z },
      this.config.moveScale,
    );
  }

  private _updateFollow(dt: number, cc: CharacterController): void {
    if (!this.followTarget) {
      this.state = 'idle';
      return;
    }

    const pos = this.gameObject.mesh.position;
    const targetPos = this.followTarget.mesh.position;
    const toTarget = new THREE.Vector3(
      targetPos.x - pos.x,
      0,
      targetPos.z - pos.z,
    );
    const dist = toTarget.length();

    // Only move if beyond follow distance
    if (dist > this.followDistance) {
      toTarget.normalize();
      cc.addMovementInput(
        { x: toTarget.x, y: 0, z: -toTarget.z },
        this.config.moveScale,
      );
    }
  }

  private _lookAt(target: THREE.Vector3, _dt: number, cc: CharacterController): void {
    const pos = this.gameObject.mesh.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      const targetYaw = Math.atan2(dx, dz);
      this.gameObject.mesh.rotation.y = targetYaw;
    }
  }

  // ---- Query API ----

  getState(): AIState {
    return this.state;
  }

  hasReachedTarget(): boolean {
    return this.state === 'idle' && this.moveTarget === null;
  }

  getDistanceToTarget(): number {
    if (!this.moveTarget) return 0;
    const pos = this.gameObject.mesh.position;
    return new THREE.Vector3(
      this.moveTarget.x - pos.x,
      0,
      this.moveTarget.z - pos.z,
    ).length();
  }

  // ---- Cleanup ----

  destroy(): void {
    super.destroy(); // unpossess pawn
    this.moveTarget = null;
    this.focalPoint = null;
    this.followTarget = null;
    this.patrolPoints = [];
    this._onArrived = null;
    this.state = 'idle';
  }
}

// ============================================================
//  AIControllerManager — Manages all AI controllers
// ============================================================

export class AIControllerManager {
  public controllers: AIController[] = [];

  /**
   * Create an AI controller and possess the given pawn.
   * The pawn's `controller` field is set automatically via possess().
   */
  createController(go: GameObject, config?: AIControllerConfig): AIController {
    const ctrl = new AIController(config);

    // The AI controller needs a Pawn to possess.
    // Use the CharacterController (or the go itself as a minimal pawn).
    const pawn = go.characterController as (import('./Controller').Pawn | null);
    if (pawn) {
      ctrl.possess(pawn);
    }

    go.aiController = ctrl;
    this.controllers.push(ctrl);
    return ctrl;
  }

  /** Register an externally-created AI controller for update management */
  register(ctrl: AIController): void {
    if (!this.controllers.includes(ctrl)) {
      this.controllers.push(ctrl);
    }
  }

  update(dt: number): void {
    for (const ctrl of this.controllers) {
      ctrl.update(dt);
    }
  }

  destroyAll(): void {
    for (const ctrl of this.controllers) {
      ctrl.destroy();
    }
    this.controllers = [];
  }
}
