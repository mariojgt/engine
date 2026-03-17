// ============================================================
//  PhysicsJoints — Runtime joint/constraint system.
//
//  Wraps Rapier's joint types to provide UE-style physics
//  constraints between rigid bodies:
//    - Fixed Joint (weld two bodies together)
//    - Ball Socket (spherical joint — free rotation, constrained position)
//    - Hinge / Revolute (rotate around a single axis)
//    - Prismatic / Slider (translate along a single axis)
//    - Spring / Rope (distance constraint with optional spring)
//
//  Joints are created between two GameObjects that both have
//  rigid bodies.  The system manages joint lifecycle and cleanup.
// ============================================================

import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './PhysicsWorld';
import type { GameObject } from './GameObject';

// ── Joint Type Definitions ──────────────────────────────────

export type JointType = 'fixed' | 'ballSocket' | 'hinge' | 'prismatic' | 'spring';

export interface JointAnchor {
  /** Local-space anchor point on body A */
  anchorA: { x: number; y: number; z: number };
  /** Local-space anchor point on body B */
  anchorB: { x: number; y: number; z: number };
}

export interface FixedJointConfig extends JointAnchor {
  type: 'fixed';
}

export interface BallSocketJointConfig extends JointAnchor {
  type: 'ballSocket';
}

export interface HingeJointConfig extends JointAnchor {
  type: 'hinge';
  /** Hinge axis in local space of body A */
  axisA: { x: number; y: number; z: number };
  /** Hinge axis in local space of body B */
  axisB: { x: number; y: number; z: number };
  /** Optional angle limits in radians [min, max] */
  limits?: [number, number];
  /** Optional motor target velocity (rad/s) */
  motorTargetVelocity?: number;
  /** Optional motor max force */
  motorMaxForce?: number;
}

export interface PrismaticJointConfig extends JointAnchor {
  type: 'prismatic';
  /** Slide axis in local space of body A */
  axisA: { x: number; y: number; z: number };
  /** Slide axis in local space of body B */
  axisB: { x: number; y: number; z: number };
  /** Optional distance limits [min, max] */
  limits?: [number, number];
}

export interface SpringJointConfig extends JointAnchor {
  type: 'spring';
  /** Rest length of the spring */
  restLength: number;
  /** Spring stiffness coefficient */
  stiffness: number;
  /** Spring damping coefficient */
  damping: number;
}

export type JointConfig =
  | FixedJointConfig
  | BallSocketJointConfig
  | HingeJointConfig
  | PrismaticJointConfig
  | SpringJointConfig;

// ── Joint Handle Entry ──────────────────────────────────────

interface JointEntry {
  id: number;
  type: JointType;
  goIdA: number;
  goIdB: number;
  rapierJoint: RAPIER.ImpulseJoint;
  config: JointConfig;
}

// ============================================================
//  PhysicsJoints System
// ============================================================

export class PhysicsJoints {
  private _joints: JointEntry[] = [];
  private _nextId = 1;

  /**
   * Create a joint between two GameObjects.
   * Both must have rigid bodies (go.rigidBody !== null).
   * Returns the joint ID, or -1 if creation failed.
   */
  createJoint(
    physics: PhysicsWorld,
    goA: GameObject,
    goB: GameObject,
    config: JointConfig,
  ): number {
    if (!physics.world) return -1;
    if (!goA.rigidBody || !goB.rigidBody) {
      console.warn('[PhysicsJoints] Both GameObjects must have rigid bodies to create a joint.');
      return -1;
    }

    let jointData: RAPIER.JointData;
    const aa = config.anchorA;
    const ab = config.anchorB;

    switch (config.type) {
      case 'fixed': {
        jointData = RAPIER.JointData.fixed(
          { x: aa.x, y: aa.y, z: aa.z },
          { x: 0, y: 0, z: 0, w: 1 }, // identity rotation for anchor frame A
          { x: ab.x, y: ab.y, z: ab.z },
          { x: 0, y: 0, z: 0, w: 1 }, // identity rotation for anchor frame B
        );
        break;
      }

      case 'ballSocket': {
        jointData = RAPIER.JointData.spherical(
          { x: aa.x, y: aa.y, z: aa.z },
          { x: ab.x, y: ab.y, z: ab.z },
        );
        break;
      }

      case 'hinge': {
        const hcfg = config as HingeJointConfig;
        jointData = RAPIER.JointData.revolute(
          { x: aa.x, y: aa.y, z: aa.z },
          { x: ab.x, y: ab.y, z: ab.z },
          { x: hcfg.axisA.x, y: hcfg.axisA.y, z: hcfg.axisA.z },
        );
        break;
      }

      case 'prismatic': {
        const pcfg = config as PrismaticJointConfig;
        jointData = RAPIER.JointData.prismatic(
          { x: aa.x, y: aa.y, z: aa.z },
          { x: ab.x, y: ab.y, z: ab.z },
          { x: pcfg.axisA.x, y: pcfg.axisA.y, z: pcfg.axisA.z },
        );
        break;
      }

      case 'spring': {
        const scfg = config as SpringJointConfig;
        jointData = RAPIER.JointData.spring(
          scfg.restLength,
          scfg.stiffness,
          scfg.damping,
          { x: aa.x, y: aa.y, z: aa.z },
          { x: ab.x, y: ab.y, z: ab.z },
        );
        break;
      }

      default:
        console.warn(`[PhysicsJoints] Unknown joint type: ${(config as any).type}`);
        return -1;
    }

    const rapierJoint = physics.world.createImpulseJoint(
      jointData,
      goA.rigidBody,
      goB.rigidBody,
      true, // wake up bodies
    );

    // Apply limits for hinge/prismatic joints after creation
    if (config.type === 'hinge') {
      const hcfg = config as HingeJointConfig;
      const revolute = rapierJoint as RAPIER.RevoluteImpulseJoint;
      if (hcfg.limits) {
        revolute.setLimits(hcfg.limits[0], hcfg.limits[1]);
      }
      if (hcfg.motorTargetVelocity !== undefined) {
        revolute.configureMotorVelocity(
          hcfg.motorTargetVelocity,
          hcfg.motorMaxForce ?? 1.0,
        );
      }
    }

    if (config.type === 'prismatic') {
      const pcfg = config as PrismaticJointConfig;
      const prismatic = rapierJoint as RAPIER.PrismaticImpulseJoint;
      if (pcfg.limits) {
        prismatic.setLimits(pcfg.limits[0], pcfg.limits[1]);
      }
    }

    const id = this._nextId++;
    this._joints.push({
      id,
      type: config.type,
      goIdA: goA.id,
      goIdB: goB.id,
      rapierJoint,
      config,
    });

    console.log(
      `[PhysicsJoints] Created ${config.type} joint #${id} between "${goA.name}" and "${goB.name}"`,
    );

    return id;
  }

  /**
   * Remove a joint by its ID.
   */
  removeJoint(physics: PhysicsWorld, jointId: number): boolean {
    if (!physics.world) return false;
    const idx = this._joints.findIndex(j => j.id === jointId);
    if (idx === -1) return false;

    const entry = this._joints[idx];
    physics.world.removeImpulseJoint(entry.rapierJoint, true);
    this._joints.splice(idx, 1);
    return true;
  }

  /**
   * Remove all joints involving a specific GameObject.
   */
  removeJointsForGameObject(physics: PhysicsWorld, goId: number): void {
    if (!physics.world) return;
    const toRemove = this._joints.filter(j => j.goIdA === goId || j.goIdB === goId);
    for (const entry of toRemove) {
      physics.world.removeImpulseJoint(entry.rapierJoint, true);
    }
    this._joints = this._joints.filter(j => j.goIdA !== goId && j.goIdB !== goId);
  }

  /**
   * Get all joints.
   */
  getJoints(): ReadonlyArray<{ id: number; type: JointType; goIdA: number; goIdB: number }> {
    return this._joints;
  }

  /**
   * Get a specific joint entry by ID.
   */
  getJoint(jointId: number): JointEntry | undefined {
    return this._joints.find(j => j.id === jointId);
  }

  /**
   * Set the motor target velocity on a hinge joint.
   */
  setHingeMotor(jointId: number, targetVelocity: number, maxForce: number): void {
    const entry = this._joints.find(j => j.id === jointId);
    if (!entry || entry.type !== 'hinge') return;
    const revolute = entry.rapierJoint as RAPIER.RevoluteImpulseJoint;
    revolute.configureMotorVelocity(targetVelocity, maxForce);
  }

  /**
   * Set the motor target position on a hinge joint.
   */
  setHingeMotorPosition(jointId: number, targetAngle: number, stiffness: number, damping: number): void {
    const entry = this._joints.find(j => j.id === jointId);
    if (!entry || entry.type !== 'hinge') return;
    const revolute = entry.rapierJoint as RAPIER.RevoluteImpulseJoint;
    revolute.configureMotorPosition(targetAngle, stiffness, damping);
  }

  /**
   * Update hinge joint limits.
   */
  setHingeLimits(jointId: number, min: number, max: number): void {
    const entry = this._joints.find(j => j.id === jointId);
    if (!entry || entry.type !== 'hinge') return;
    const revolute = entry.rapierJoint as RAPIER.RevoluteImpulseJoint;
    revolute.setLimits(min, max);
  }

  /**
   * Update prismatic joint limits.
   */
  setPrismaticLimits(jointId: number, min: number, max: number): void {
    const entry = this._joints.find(j => j.id === jointId);
    if (!entry || entry.type !== 'prismatic') return;
    const prismatic = entry.rapierJoint as RAPIER.PrismaticImpulseJoint;
    prismatic.setLimits(min, max);
  }

  /**
   * Remove all joints and reset state.
   */
  reset(physics: PhysicsWorld): void {
    if (physics.world) {
      for (const entry of this._joints) {
        try { physics.world.removeImpulseJoint(entry.rapierJoint, false); } catch { /* already freed */ }
      }
    }
    this._joints = [];
    this._nextId = 1;
  }
}
