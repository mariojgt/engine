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
import { EventBus } from './EventBus';
import type { GameObject } from './GameObject';
import { Controller, type Pawn, type ControllerType } from './Controller';
import type { CharacterController } from './CharacterController';
import type { CharacterMovement2D } from './CharacterMovement2D';
import type { NavMeshSystem, NavMeshAgentConfig } from './ai/NavMeshSystem';
import { BehaviorTree, type BTContext } from './ai/BehaviorTree';

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

  // ---- 2D / 3D mode ----
  /** When true, movement uses XY plane + CharacterMovement2D instead of XZ + CharacterController */
  public is2D: boolean = false;

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

  // ---- Blackboard (key-value store) ----
  /** Blackboard storage — like UE's Blackboard for BT data sharing */
  public blackboard: Map<string, any> = new Map();

  // ---- Behavior Tree ----
  /** The currently running Behavior Tree */
  public behaviorTree: BehaviorTree | null = null;

  /** Get a blackboard value by key */
  getBlackboardValue(key: string): any {
    return this.blackboard.get(key) ?? null;
  }

  /** Set a blackboard value */
  setBlackboardValue(key: string, value: any): void {
    console.log(`[AIController.setBlackboardValue] key="${key}" value=`, value, `| BB has ${this.blackboard.size} entries`);
    this.blackboard.set(key, value);
    EventBus.getInstance().emit(`AI_Blackboard_Set`, this.gameObject?.id, this.gameObject?.name, key, value);
  }

  /**
   * Seed the blackboard with default values from a BlackboardAsset.
   * Only sets keys that are not already present, preserving any values written
   * before or during the current play session.
   */
  initBlackboardDefaults(defaults: Array<{ name: string; defaultValue: any }>): void {
    for (const entry of defaults) {
      if (!this.blackboard.has(entry.name)) {
        this.blackboard.set(entry.name, entry.defaultValue ?? null);
      }
    }
  }

  /** Clear (remove) a blackboard value */
  clearBlackboardValue(key: string): void {
    this.blackboard.delete(key);
    EventBus.getInstance().emit(`AI_Blackboard_Clear`, this.gameObject?.id, this.gameObject?.name, key);
  }

  // ---- NavMesh Pathfinding ----
  /** Reference to the shared NavMeshSystem (set by Engine at play start) */
  public navMeshSystem: NavMeshSystem | null = null;
  /** Whether to use NavMesh pathfinding (false = direct movement, legacy) */
  public useNavMesh: boolean = true;
  /** Crowd agent ID for this controller */
  private _navAgentId: string | null = null;
  /** Pre-computed path waypoints (used when crowd is not available) */
  private _pathWaypoints: THREE.Vector3[] = [];
  /** Current waypoint index along the path */
  private _pathIndex: number = 0;

  constructor(config?: AIControllerConfig) {
    super();
    this.config = config ?? defaultAIControllerConfig();
  }

  /** Convenience getter — returns the possessed pawn's GameObject (or a dummy) */
  get gameObject(): GameObject {
    return this._pawn!.gameObject;
  }

  /** Get the actor position in a 2D/3D agnostic way */
  private _getActorPosition(): THREE.Vector3 {
    const go = this.gameObject as any;
    if (this.is2D) {
      // SpriteActor: position is in group.position (XY plane, z=0)
      const gp = go.group?.position ?? go.mesh?.position ?? { x: 0, y: 0, z: 0 };
      return new THREE.Vector3(gp.x, gp.y, 0);
    }
    return go.mesh?.position ?? new THREE.Vector3();
  }

  /** Set the actor position in a 2D/3D agnostic way */
  private _setActorPosition(x: number, y: number, z: number = 0): void {
    const go = this.gameObject as any;
    if (this.is2D) {
      if (typeof go.setPosition === 'function') {
        go.setPosition(x, y);  // SpriteActor.setPosition(x, y)
      } else if (go.group) {
        go.group.position.set(x, y, 0);
      }
      if (go.transform2D) {
        go.transform2D.position.x = x;
        go.transform2D.position.y = y;
      }
    } else {
      go.mesh.position.set(x, y, z);
    }
  }

  // ---- Navigation API ----

  /**
   * Move to a world position. When NavMesh is available, uses
   * Detour Crowd pathfinding. Otherwise falls back to direct movement.
   */
  moveTo(x: number, y: number, z: number, onArrived?: () => void): void {
    this.moveTarget = new THREE.Vector3(x, y, z);
    this.state = 'movingTo';
    this._onArrived = onArrived ?? null;

    console.log(`[AIController.moveTo] target=(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) useNavMesh=${this.useNavMesh} navMeshReady=${this.navMeshSystem?.isReady} is2D=${this.is2D} hasCC=${!!((this.gameObject as any).characterController)} hasCM2D=${!!((this.gameObject as any).characterMovement2D)}`);

    // ── NavMesh path ──
    if (this.useNavMesh && this.navMeshSystem && this.navMeshSystem.isReady) {
      // Convert to NavMesh coordinates if 2D
      const navTarget = this.is2D
        ? this.navMeshSystem.to3DPosition(x, y)
        : this.moveTarget;

      // If agent is registered with the crowd, use crowd pathfinding
      if (this._navAgentId) {
        this.navMeshSystem.requestMoveTarget(this._navAgentId, navTarget);
        return;
      }

      // Otherwise compute a path and follow waypoints
      const startPos = this._getActorPosition();
      const navStart = this.is2D
        ? this.navMeshSystem.to3DPosition(startPos.x, startPos.y)
        : startPos;
      const path = this.navMeshSystem.findPath(navStart, navTarget);
      if (path && path.length > 0) {
        // Convert path waypoints back to 2D coordinates if needed
        if (this.is2D) {
          this._pathWaypoints = path.map(p => {
            const p2d = this.navMeshSystem!.to2DPosition(p);
            return new THREE.Vector3(p2d.x, p2d.y, 0);
          });
        } else {
          this._pathWaypoints = path;
        }
        this._pathIndex = 0;
      } else {
        this._pathWaypoints = [];
        this._pathIndex = 0;
      }
    } else {
      this._pathWaypoints = [];
      this._pathIndex = 0;
    }
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

  // ---- Behavior Tree API ----

  /**
   * Start running a Behavior Tree.
   * @param tree The BehaviorTree instance to run
   */
  runBehaviorTree(tree: BehaviorTree): void {
    if (this.behaviorTree) {
      this.behaviorTree.abort({
        aiController: this,
        gameObject: this.gameObject,
        blackboard: this.blackboard,
        deltaTime: 0,
      });
    }
    this.behaviorTree = tree;
  }

  /**
   * Stop the currently running Behavior Tree.
   */
  stopBehaviorTree(): void {
    if (this.behaviorTree) {
      this.behaviorTree.abort({
        aiController: this,
        gameObject: this.gameObject,
        blackboard: this.blackboard,
        deltaTime: 0,
      });
      this.behaviorTree = null;
    }
  }

  // ---- Per-frame update ----

  update(dt: number): void {
    const pawn = this._pawn;
    if (!pawn) return;

    // Tick Behavior Tree if active
    if (this.behaviorTree) {
      this.behaviorTree.tick({
        aiController: this,
        gameObject: this.gameObject,
        blackboard: this.blackboard,
        deltaTime: dt,
      });
    }

    const go = pawn.gameObject as any;

    if (this.is2D) {
      // ── 2D mode: drive CharacterMovement2D ──
      const cm2d: CharacterMovement2D | null = go.characterMovement2D ?? null;
      if (!cm2d) return;

      switch (this.state) {
        case 'idle':
          cm2d.decelerate(dt);
          if (typeof cm2d.decelerateVertical === 'function') cm2d.decelerateVertical(dt);
          break;
        case 'movingTo':  this._updateMoveTo2D(dt, cm2d); break;
        case 'patrolling': this._updatePatrol2D(dt, cm2d); break;
        case 'following':  this._updateFollow2D(dt, cm2d); break;
      }
      // Apply focal point (face direction)
      if (this.focalPoint) this._lookAt2D(this.focalPoint);
    } else {
      // ── 3D mode: drive CharacterController (or fallback to direct movement) ──
      const cc = go.characterController as CharacterController | null;

      switch (this.state) {
        case 'idle':       break;
        case 'movingTo':
          if (cc) { this._updateMoveTo(dt, cc); }
          else    { this._updateMoveToFallback3D(dt); }
          break;
        case 'patrolling':
          if (cc) this._updatePatrol(dt, cc);
          else    this._updatePatrolFallback3D(dt);
          break;
        case 'following':
          if (cc) this._updateFollow(dt, cc);
          break;
      }
      if (this.focalPoint && cc) this._lookAt(this.focalPoint, dt, cc);
    }
  }

  // ---- Internal movement logic ----

  // ============================================================
  //  2D Movement Helpers
  // ============================================================

  private _updateMoveTo2D(dt: number, cm2d: CharacterMovement2D): void {
    if (!this.moveTarget) { this.state = 'idle'; return; }
    const pos = this._getActorPosition();
    const dx = this.moveTarget.x - pos.x;
    const dy = this.moveTarget.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= this.config.acceptanceRadius) {
      this.state = 'idle';
      this.moveTarget = null;
      cm2d.decelerate(dt);
      if (typeof cm2d.decelerateVertical === 'function') cm2d.decelerateVertical(dt);
      if (this._onArrived) { const cb = this._onArrived; this._onArrived = null; cb(); }
      return;
    }

    const dirX = dx / dist;
    const dirY = dy / dist;
    cm2d.moveHorizontal(dirX * this.config.moveScale, dt);
    if (typeof cm2d.moveVertical === 'function') cm2d.moveVertical(dirY * this.config.moveScale, dt);
  }

  private _updatePatrol2D(dt: number, cm2d: CharacterMovement2D): void {
    if (this.patrolPoints.length === 0) { this.state = 'idle'; return; }
    if (this._patrolWaitTimer > 0) { this._patrolWaitTimer -= dt; cm2d.decelerate(dt); return; }
    if (!this.moveTarget) {
      this.patrolIndex++;
      if (this.patrolIndex >= this.patrolPoints.length) {
        if (this.patrolLoop) this.patrolIndex = 0; else { this.state = 'idle'; return; }
      }
      const p = this.patrolPoints[this.patrolIndex];
      this.moveTarget = new THREE.Vector3(p.x, p.y, 0);
    }
    const pos = this._getActorPosition();
    const dx = this.moveTarget!.x - pos.x;
    const dy = this.moveTarget!.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= this.config.acceptanceRadius) {
      const wp = this.patrolPoints[this.patrolIndex];
      if (wp.waitTime > 0) this._patrolWaitTimer = wp.waitTime;
      this.moveTarget = null;
      return;
    }
    const dirX = dx / dist;
    const dirY = dy / dist;
    cm2d.moveHorizontal(dirX * this.config.moveScale, dt);
    if (typeof cm2d.moveVertical === 'function') cm2d.moveVertical(dirY * this.config.moveScale, dt);
  }

  private _updateFollow2D(dt: number, cm2d: CharacterMovement2D): void {
    if (!this.followTarget) { this.state = 'idle'; return; }
    const pos = this._getActorPosition();
    const tgt = this.followTarget as any;
    const tPos = tgt.group?.position ?? tgt.mesh?.position ?? { x: 0, y: 0 };
    const dx = tPos.x - pos.x;
    const dy = tPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.followDistance) {
      const dirX = dx / dist;
      const dirY = dy / dist;
      cm2d.moveHorizontal(dirX * this.config.moveScale, dt);
      if (typeof cm2d.moveVertical === 'function') cm2d.moveVertical(dirY * this.config.moveScale, dt);
    } else {
      cm2d.decelerate(dt);
      if (typeof cm2d.decelerateVertical === 'function') cm2d.decelerateVertical(dt);
    }
  }

  private _lookAt2D(target: THREE.Vector3): void {
    const go = this.gameObject as any;
    const pos = this._getActorPosition();
    const dx = target.x - pos.x;
    // In 2D, flip the sprite direction based on X offset
    if (Math.abs(dx) > 0.01) {
      const cm2d: CharacterMovement2D | null = go.characterMovement2D ?? null;
      if (cm2d) {
        cm2d.facingRight = dx > 0;
        const sr = go.getComponent?.('SpriteRenderer');
        sr?.setFlipX?.(!cm2d.facingRight);
      }
    }
  }

  // ============================================================
  //  3D Movement Helpers (original)
  // ============================================================

  private _updateMoveTo(dt: number, cc: CharacterController): void {
    if (!this.moveTarget) {
      this.state = 'idle';
      return;
    }

    const pos = this.gameObject.mesh.position;

    // ── Crowd-managed agent: the crowd handles movement ──
    if (this._navAgentId && this.navMeshSystem) {
      // Crowd updates position automatically via NavMeshSystem.update()
      // Check if we've arrived
      const agentPos = this.navMeshSystem.getAgentPosition(this._navAgentId);
      if (agentPos) {
        // Sync mesh position from crowd agent
        this.gameObject.mesh.position.copy(agentPos);

        // Face movement direction
        const vel = this.navMeshSystem.getAgentVelocity(this._navAgentId);
        if (vel && vel.lengthSq() > 0.01) {
          const targetYaw = Math.atan2(vel.x, vel.z);
          this.gameObject.mesh.rotation.y = targetYaw;
        }
      }

      if (this.navMeshSystem.hasAgentReachedTarget(this._navAgentId, this.config.acceptanceRadius)) {
        const toFinal = new THREE.Vector3(
          this.moveTarget.x - pos.x, 0, this.moveTarget.z - pos.z,
        );
        if (toFinal.length() <= this.config.acceptanceRadius * 2) {
          this.state = 'idle';
          this.moveTarget = null;
          if (this._onArrived) {
            const cb = this._onArrived;
            this._onArrived = null;
            cb();
          }
        }
      }
      return;
    }

    // ── NavMesh waypoint-following (no crowd) ──
    if (this._pathWaypoints.length > 0) {
      const waypoint = this._pathWaypoints[this._pathIndex];
      const toWP = new THREE.Vector3(
        waypoint.x - pos.x,
        0,
        waypoint.z - pos.z,
      );
      const distToWP = toWP.length();

      if (distToWP <= this.config.acceptanceRadius) {
        // Reached this waypoint — advance
        this._pathIndex++;
        if (this._pathIndex >= this._pathWaypoints.length) {
          // Reached final waypoint → arrived!
          this.state = 'idle';
          this.moveTarget = null;
          this._pathWaypoints = [];
          this._pathIndex = 0;
          if (this._onArrived) {
            const cb = this._onArrived;
            this._onArrived = null;
            cb();
          }
          return;
        }
      }

      // Move toward current waypoint
      const currentWP = this._pathWaypoints[this._pathIndex];
      const toNext = new THREE.Vector3(
        currentWP.x - pos.x, 0, currentWP.z - pos.z,
      ).normalize();
      // addWorldMovementInput: world-space, no camera-yaw rotation
      cc.addWorldMovementInput(
        { x: toNext.x, y: 0, z: toNext.z },
        this.config.moveScale,
      );
      return;
    }

    // ── Direct movement fallback (no NavMesh) ──
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
    // addWorldMovementInput: world-space, no camera-yaw rotation
    cc.addWorldMovementInput(
      { x: toTarget.x, y: 0, z: toTarget.z },
      this.config.moveScale,
    );
  }

  // ============================================================
  //  3D Fallback — direct mesh position movement (no CharacterController)
  // ============================================================

  /**
   * Move the pawn toward the target by directly updating mesh.position.
   * Used when there is no CharacterController attached to the pawn.
   */
  private _updateMoveToFallback3D(dt: number): void {
    if (!this.moveTarget) {
      this.state = 'idle';
      return;
    }

    // Helper — keep Rapier rigid body in sync when we move the mesh directly.
    // PhysicsWorld.step() syncs rigidBody → mesh every frame, which would
    // overwrite our mesh position changes unless we also move the rigid body.
    const syncRigidBody = (nx: number, ny: number, nz: number): void => {
      const rb = (this.gameObject as any).rigidBody;
      if (!rb) return;
      if (typeof rb.setNextKinematicTranslation === 'function') {
        rb.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
      } else if (typeof rb.setTranslation === 'function') {
        rb.setTranslation({ x: nx, y: ny, z: nz }, true);
      }
    };

    // ── NavMesh waypoint-following (no crowd, no CharacterController) ──
    if (this._pathWaypoints.length > 0) {
      const waypoint = this._pathWaypoints[this._pathIndex];
      const pos = this.gameObject.mesh.position;
      const dx = waypoint.x - pos.x;
      const dz = waypoint.z - pos.z;
      const distToWP = Math.sqrt(dx * dx + dz * dz);

      if (distToWP <= this.config.acceptanceRadius) {
        this._pathIndex++;
        if (this._pathIndex >= this._pathWaypoints.length) {
          this.state = 'idle';
          this.moveTarget = null;
          this._pathWaypoints = [];
          this._pathIndex = 0;
          if (this._onArrived) { const cb = this._onArrived; this._onArrived = null; cb(); }
          return;
        }
      }
      const wp = this._pathWaypoints[this._pathIndex];
      const toWP = new THREE.Vector3(wp.x - pos.x, 0, wp.z - pos.z);
      const dWP = toWP.length();
      if (dWP > 0.001) {
        toWP.normalize();
        const speed = 200 * this.config.moveScale * dt;
        const step = Math.min(speed, dWP);
        pos.x += toWP.x * step;
        pos.z += toWP.z * step;
        syncRigidBody(pos.x, pos.y, pos.z);
        // Face movement direction
        this.gameObject.mesh.rotation.y = Math.atan2(toWP.x, toWP.z);
      }
      return;
    }

    // ── Direct movement (no NavMesh, no CharacterController) ──
    const pos = this.gameObject.mesh.position;
    const dx = this.moveTarget.x - pos.x;
    const dz = this.moveTarget.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= this.config.acceptanceRadius) {
      this.state = 'idle';
      this.moveTarget = null;
      if (this._onArrived) { const cb = this._onArrived; this._onArrived = null; cb(); }
      return;
    }

    const speed = 200 * this.config.moveScale * dt;
    const step = Math.min(speed, dist);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    syncRigidBody(pos.x, pos.y, pos.z);
    // Face movement direction
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      this.gameObject.mesh.rotation.y = Math.atan2(dx / dist, dz / dist);
    }
  }

  /**
   * Patrol the pawn through waypoints by directly updating mesh.position.
   * Used when there is no CharacterController attached to the pawn.
   */
  private _updatePatrolFallback3D(dt: number): void {
    if (this.patrolPoints.length === 0) { this.state = 'idle'; return; }
    if (this._patrolWaitTimer > 0) { this._patrolWaitTimer -= dt; return; }

    if (!this.moveTarget) {
      this.patrolIndex++;
      if (this.patrolIndex >= this.patrolPoints.length) {
        if (this.patrolLoop) this.patrolIndex = 0;
        else { this.state = 'idle'; return; }
      }
      const p = this.patrolPoints[this.patrolIndex];
      this.moveTarget = new THREE.Vector3(p.x, p.y, p.z);
    }

    const pos = this.gameObject.mesh.position;
    const dx = this.moveTarget!.x - pos.x;
    const dz = this.moveTarget!.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= this.config.acceptanceRadius) {
      const wp = this.patrolPoints[this.patrolIndex];
      if (wp.waitTime > 0) this._patrolWaitTimer = wp.waitTime;
      this.moveTarget = null;
      return;
    }

    const speed = 200 * this.config.moveScale * dt;
    const step = Math.min(speed, dist);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      this.gameObject.mesh.rotation.y = Math.atan2(dx / dist, dz / dist);
    }
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
    const pos = this._getActorPosition();
    if (this.is2D) {
      const dx = this.moveTarget.x - pos.x;
      const dy = this.moveTarget.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    return new THREE.Vector3(
      this.moveTarget.x - pos.x,
      0,
      this.moveTarget.z - pos.z,
    ).length();
  }

  // ---- NavMesh Agent ----

  /**
   * Register this controller's pawn as a crowd agent in the NavMesh system.
   * Called automatically by Engine.onPlayStarted() when NavMesh is available.
   */
  registerNavMeshAgent(navMesh: NavMeshSystem, agentConfig?: Partial<NavMeshAgentConfig>): void {
    this.navMeshSystem = navMesh;
    if (!navMesh.isReady) return;

    // Pawns with a CharacterController are driven by Rapier physics.
    // Registering a crowd agent would conflict: NavMeshSystem.update() sets the
    // mesh position from the crowd, but CharacterController.update() immediately
    // overwrites it from the Rapier rigid body every frame, so the crowd never
    // visually moves the character.  Instead, set navMeshSystem so that moveTo()
    // can use NavMesh path-finding (waypoints + addMovementInput) which feeds
    // naturally into the CharacterController's physics pipeline.
    const goAny = this.gameObject as any;
    if (!this.is2D && goAny?.characterController) {
      console.log(`[AIController] NavMesh enabled (waypoint-following) for "${goAny.name || 'actor'}"`);
      return; // _navAgentId stays null — moveTo() will use findPath() instead
    }

    // For 2D pawns or mesh-only pawns (no CharacterController), the crowd agent
    // sets the position directly — no physics conflict.
    const pos = this._getActorPosition();
    // In 2D mode, convert XY → XZ for Recast
    const navPos = this.is2D ? navMesh.to3DPosition(pos.x, pos.y) : pos;
    this._navAgentId = `ai-${this.gameObject.id}`;
    navMesh.addAgent(this._navAgentId, navPos, this.gameObject, agentConfig);
  }

  /**
   * Unregister the crowd agent from the NavMesh system.
   */
  unregisterNavMeshAgent(): void {
    if (this._navAgentId && this.navMeshSystem) {
      this.navMeshSystem.removeAgent(this._navAgentId);
    }
    this._navAgentId = null;
    this.navMeshSystem = null;
    this._pathWaypoints = [];
    this._pathIndex = 0;
  }

  // ---- Cleanup ----

  destroy(): void {
    this.unregisterNavMeshAgent();
    super.destroy(); // unpossess pawn
    this.moveTarget = null;
    this.focalPoint = null;
    this.followTarget = null;
    this.patrolPoints = [];
    this._onArrived = null;
    this._pathWaypoints = [];
    this._pathIndex = 0;
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
