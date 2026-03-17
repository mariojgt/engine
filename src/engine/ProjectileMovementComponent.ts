// ============================================================
//  ProjectileMovementComponent — UE-style projectile system.
//
//  Handles projectile motion with:
//    - Initial speed & max speed
//    - Custom gravity scale (independent of rigid body)
//    - Homing toward a target actor
//    - Bounce with friction/restitution
//    - Lifetime auto-destroy
//    - Optional physics body integration
//
//  Can operate in two modes:
//    1. Kinematic — moves the actor directly (no rigid body needed)
//    2. Physics — applies forces to an existing rigid body
//
//  Usage from blueprint scripts:
//    const proj = __engine.projectile.create(gameObject, config);
//    // Automatically ticks each frame via update()
// ============================================================

import * as THREE from 'three';
import type { Scene } from './Scene';
import type { GameObject } from './GameObject';
import type { PhysicsWorld } from './PhysicsWorld';

// ── Configuration ───────────────────────────────────────────

export interface ProjectileConfig {
  /** Initial speed in units/second */
  initialSpeed: number;
  /** Maximum speed cap (0 = no cap) */
  maxSpeed: number;
  /** Direction of launch (normalized automatically) */
  direction: { x: number; y: number; z: number };
  /** Gravity multiplier (0 = no gravity, 1 = world gravity, 2 = double) */
  gravityScale: number;
  /** If true, projectile bounces off surfaces instead of stopping */
  shouldBounce: boolean;
  /** Bounciness factor (0-1, how much velocity is retained per bounce) */
  bounciness: number;
  /** Friction applied when bouncing */
  friction: number;
  /** Maximum number of bounces before stopping (-1 = infinite) */
  maxBounces: number;
  /** Auto-destroy after this many seconds (0 = never) */
  lifetime: number;
  /** Homing target actor ID (-1 = no homing) */
  homingTargetId: number;
  /** Homing acceleration magnitude (how fast it turns toward target) */
  homingAcceleration: number;
  /** If true, uses physics body for movement; if false, kinematic */
  usePhysics: boolean;
  /** If true, stops at first hit (non-bounce mode) */
  stopOnHit: boolean;
  /** Callback fired when the projectile hits something */
  onHit?: (hitInfo: ProjectileHitInfo) => void;
  /** Callback fired when the projectile bounces */
  onBounce?: (bounceInfo: ProjectileHitInfo) => void;
  /** Callback fired when the projectile is destroyed (lifetime or bounces exhausted) */
  onDestroyed?: () => void;
}

export interface ProjectileHitInfo {
  /** Position of impact */
  impactPoint: { x: number; y: number; z: number };
  /** Normal of the surface hit */
  impactNormal: { x: number; y: number; z: number };
  /** ID of the actor hit (-1 if none) */
  hitActorId: number;
  /** Name of the actor hit */
  hitActorName: string;
  /** Current velocity at time of impact */
  velocity: { x: number; y: number; z: number };
}

export function defaultProjectileConfig(): ProjectileConfig {
  return {
    initialSpeed: 20,
    maxSpeed: 50,
    direction: { x: 1, y: 0, z: 0 },
    gravityScale: 1,
    shouldBounce: false,
    bounciness: 0.6,
    friction: 0.2,
    maxBounces: 3,
    lifetime: 5,
    homingTargetId: -1,
    homingAcceleration: 10,
    usePhysics: false,
    stopOnHit: true,
    onHit: undefined,
    onBounce: undefined,
    onDestroyed: undefined,
  };
}

// ── Active Projectile Entry ─────────────────────────────────

interface ActiveProjectile {
  id: number;
  gameObject: GameObject;
  config: ProjectileConfig;
  velocity: { x: number; y: number; z: number };
  elapsed: number;
  bounceCount: number;
  alive: boolean;
}

// ============================================================
//  ProjectileMovementSystem
// ============================================================

export class ProjectileMovementSystem {
  private _projectiles: ActiveProjectile[] = [];
  private _nextId = 1;

  /** Temporary Three.js vectors for calculations */
  private _tmpVec = new THREE.Vector3();
  private _tmpNorm = new THREE.Vector3();
  private _tmpDir = new THREE.Vector3();

  /**
   * Create and launch a projectile from a GameObject.
   * Returns the projectile ID for later reference.
   */
  create(go: GameObject, config: Partial<ProjectileConfig>): number {
    const cfg: ProjectileConfig = { ...defaultProjectileConfig(), ...config };

    // Normalize direction
    const len = Math.sqrt(cfg.direction.x ** 2 + cfg.direction.y ** 2 + cfg.direction.z ** 2);
    if (len > 1e-6) {
      cfg.direction.x /= len;
      cfg.direction.y /= len;
      cfg.direction.z /= len;
    } else {
      cfg.direction = { x: 1, y: 0, z: 0 };
    }

    const velocity = {
      x: cfg.direction.x * cfg.initialSpeed,
      y: cfg.direction.y * cfg.initialSpeed,
      z: cfg.direction.z * cfg.initialSpeed,
    };

    const id = this._nextId++;
    this._projectiles.push({
      id,
      gameObject: go,
      config: cfg,
      velocity,
      elapsed: 0,
      bounceCount: 0,
      alive: true,
    });

    // If using physics, apply initial velocity to the rigid body
    if (cfg.usePhysics && go.rigidBody) {
      go.rigidBody.setLinvel(velocity, true);
      go.rigidBody.setGravityScale(cfg.gravityScale, true);
    }

    console.log(
      `[Projectile] Created #${id} on "${go.name}" speed=${cfg.initialSpeed} ` +
      `dir=(${cfg.direction.x.toFixed(2)},${cfg.direction.y.toFixed(2)},${cfg.direction.z.toFixed(2)}) ` +
      `physics=${cfg.usePhysics} homing=${cfg.homingTargetId >= 0}`,
    );

    return id;
  }

  /**
   * Update all active projectiles. Called once per frame.
   */
  update(dt: number, scene: Scene, physics: PhysicsWorld): void {
    const gravity = physics.settings?.gravity ?? { x: 0, y: -9.81, z: 0 };

    for (const proj of this._projectiles) {
      if (!proj.alive) continue;

      proj.elapsed += dt;

      // Check lifetime
      if (proj.config.lifetime > 0 && proj.elapsed >= proj.config.lifetime) {
        this._destroyProjectile(proj);
        continue;
      }

      if (proj.config.usePhysics) {
        // Physics mode — homing only (velocity is managed by Rapier)
        this._updatePhysicsProjectile(proj, dt, scene, physics, gravity);
      } else {
        // Kinematic mode — full movement simulation
        this._updateKinematicProjectile(proj, dt, scene, physics, gravity);
      }
    }

    // Cleanup dead projectiles
    this._projectiles = this._projectiles.filter(p => p.alive);
  }

  /**
   * Get a projectile entry by ID.
   */
  getProjectile(id: number): ActiveProjectile | undefined {
    return this._projectiles.find(p => p.id === id && p.alive);
  }

  /**
   * Manually destroy a projectile by ID.
   */
  destroy(id: number): void {
    const proj = this._projectiles.find(p => p.id === id);
    if (proj) this._destroyProjectile(proj);
  }

  /**
   * Set a new homing target for a projectile.
   */
  setHomingTarget(projectileId: number, targetActorId: number): void {
    const proj = this._projectiles.find(p => p.id === projectileId);
    if (proj) proj.config.homingTargetId = targetActorId;
  }

  /**
   * Get current velocity of a projectile.
   */
  getVelocity(projectileId: number): { x: number; y: number; z: number } | null {
    const proj = this._projectiles.find(p => p.id === projectileId);
    if (!proj) return null;
    return { ...proj.velocity };
  }

  /**
   * Reset all projectiles (called on stop).
   */
  reset(): void {
    this._projectiles = [];
    this._nextId = 1;
  }

  /**
   * Get count of active projectiles.
   */
  getActiveCount(): number {
    return this._projectiles.filter(p => p.alive).length;
  }

  // ── Private ──────────────────────────────────────────────

  private _updateKinematicProjectile(
    proj: ActiveProjectile, dt: number,
    scene: Scene, physics: PhysicsWorld,
    gravity: { x: number; y: number; z: number },
  ): void {
    const cfg = proj.config;
    const vel = proj.velocity;

    // Apply gravity
    vel.x += gravity.x * cfg.gravityScale * dt;
    vel.y += gravity.y * cfg.gravityScale * dt;
    vel.z += gravity.z * cfg.gravityScale * dt;

    // Apply homing
    if (cfg.homingTargetId >= 0) {
      this._applyHoming(proj, dt, scene);
    }

    // Clamp speed
    if (cfg.maxSpeed > 0) {
      const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
      if (speed > cfg.maxSpeed) {
        const s = cfg.maxSpeed / speed;
        vel.x *= s; vel.y *= s; vel.z *= s;
      }
    }

    // Compute movement delta
    const dx = vel.x * dt;
    const dy = vel.y * dt;
    const dz = vel.z * dt;

    const pos = proj.gameObject.mesh.position;
    const start = { x: pos.x, y: pos.y, z: pos.z };
    const end = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };

    // Cast a ray to detect collisions along the path
    const hit = physics.lineTraceSingle(start, end, undefined, scene);

    if (hit.hit) {
      const hitInfo: ProjectileHitInfo = {
        impactPoint: hit.point,
        impactNormal: hit.normal,
        hitActorId: hit.hitActor?.id ?? -1,
        hitActorName: hit.hitActor?.name ?? '',
        velocity: { ...vel },
      };

      if (cfg.shouldBounce && (cfg.maxBounces < 0 || proj.bounceCount < cfg.maxBounces)) {
        // Bounce
        this._bounce(proj, hit.point, hit.normal);
        proj.bounceCount++;
        if (cfg.onBounce) cfg.onBounce(hitInfo);
      } else {
        // Stop at hit
        pos.set(hit.point.x, hit.point.y, hit.point.z);
        if (cfg.onHit) cfg.onHit(hitInfo);
        if (cfg.stopOnHit) {
          this._destroyProjectile(proj);
        }
        return;
      }
    } else {
      // No collision — move freely
      pos.set(end.x, end.y, end.z);
    }

    // Orient projectile to face movement direction
    const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
    if (speed > 0.01) {
      this._tmpDir.set(vel.x, vel.y, vel.z).normalize();
      const target = this._tmpVec.copy(pos as any).add(this._tmpDir);
      proj.gameObject.mesh.lookAt(target);
    }
  }

  private _updatePhysicsProjectile(
    proj: ActiveProjectile, dt: number,
    scene: Scene, _physics: PhysicsWorld,
    _gravity: { x: number; y: number; z: number },
  ): void {
    if (!proj.gameObject.rigidBody) return;

    const cfg = proj.config;
    const rb = proj.gameObject.rigidBody;

    // Apply homing via forces
    if (cfg.homingTargetId >= 0) {
      const target = scene.gameObjects.find(g => g.id === cfg.homingTargetId);
      if (target) {
        const pos = rb.translation();
        const tpos = target.mesh.position;
        const dx = tpos.x - pos.x;
        const dy = tpos.y - pos.y;
        const dz = tpos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 0.1) {
          const acc = cfg.homingAcceleration;
          rb.applyForce({
            x: (dx / dist) * acc,
            y: (dy / dist) * acc,
            z: (dz / dist) * acc,
          }, true);
        }
      }
    }

    // Clamp speed
    if (cfg.maxSpeed > 0) {
      const v = rb.linvel();
      const speed = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
      if (speed > cfg.maxSpeed) {
        const s = cfg.maxSpeed / speed;
        rb.setLinvel({ x: v.x * s, y: v.y * s, z: v.z * s }, true);
      }
    }

    // Update tracked velocity for callbacks
    const v = rb.linvel();
    proj.velocity = { x: v.x, y: v.y, z: v.z };
  }

  private _applyHoming(proj: ActiveProjectile, dt: number, scene: Scene): void {
    const target = scene.gameObjects.find(g => g.id === proj.config.homingTargetId);
    if (!target) return;

    const pos = proj.gameObject.mesh.position;
    const tpos = target.mesh.position;
    const dx = tpos.x - pos.x;
    const dy = tpos.y - pos.y;
    const dz = tpos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.1) return;

    // Desired direction toward target
    const desX = dx / dist, desY = dy / dist, desZ = dz / dist;

    // Current direction
    const vel = proj.velocity;
    const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
    if (speed < 0.01) return;
    const curX = vel.x / speed, curY = vel.y / speed, curZ = vel.z / speed;

    // Interpolate direction using homingAcceleration * dt
    const t = Math.min(proj.config.homingAcceleration * dt / speed, 1);
    const newDirX = curX + (desX - curX) * t;
    const newDirY = curY + (desY - curY) * t;
    const newDirZ = curZ + (desZ - curZ) * t;
    const newLen = Math.sqrt(newDirX ** 2 + newDirY ** 2 + newDirZ ** 2);
    if (newLen > 0.001) {
      vel.x = (newDirX / newLen) * speed;
      vel.y = (newDirY / newLen) * speed;
      vel.z = (newDirZ / newLen) * speed;
    }
  }

  private _bounce(
    proj: ActiveProjectile,
    hitPoint: { x: number; y: number; z: number },
    hitNormal: { x: number; y: number; z: number },
  ): void {
    const vel = proj.velocity;
    const cfg = proj.config;

    // Reflect velocity: v' = v - 2(v·n)n
    const dot = vel.x * hitNormal.x + vel.y * hitNormal.y + vel.z * hitNormal.z;
    vel.x = vel.x - 2 * dot * hitNormal.x;
    vel.y = vel.y - 2 * dot * hitNormal.y;
    vel.z = vel.z - 2 * dot * hitNormal.z;

    // Apply bounciness (scale reflected velocity)
    vel.x *= cfg.bounciness;
    vel.y *= cfg.bounciness;
    vel.z *= cfg.bounciness;

    // Apply friction (reduce tangential component)
    if (cfg.friction > 0) {
      // Decompose into normal and tangential
      const normalDot = vel.x * hitNormal.x + vel.y * hitNormal.y + vel.z * hitNormal.z;
      const normalX = hitNormal.x * normalDot;
      const normalY = hitNormal.y * normalDot;
      const normalZ = hitNormal.z * normalDot;
      const tanX = vel.x - normalX;
      const tanY = vel.y - normalY;
      const tanZ = vel.z - normalZ;
      const fricScale = Math.max(0, 1 - cfg.friction);
      vel.x = normalX + tanX * fricScale;
      vel.y = normalY + tanY * fricScale;
      vel.z = normalZ + tanZ * fricScale;
    }

    // Move to hit point + slight offset along normal to avoid re-collision
    const pos = proj.gameObject.mesh.position;
    pos.set(
      hitPoint.x + hitNormal.x * 0.01,
      hitPoint.y + hitNormal.y * 0.01,
      hitPoint.z + hitNormal.z * 0.01,
    );
  }

  private _destroyProjectile(proj: ActiveProjectile): void {
    proj.alive = false;
    if (proj.config.onDestroyed) {
      try { proj.config.onDestroyed(); } catch (e) { console.error('[Projectile] onDestroyed error:', e); }
    }
  }
}
