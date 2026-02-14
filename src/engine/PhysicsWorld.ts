import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Scene } from './Scene';
import type { GameObject } from './GameObject';
import type { PhysicsConfig } from '../editor/ActorAsset';
import { defaultPhysicsConfig } from '../editor/ActorAsset';
import { CollisionSystem } from './CollisionSystem';

export class PhysicsWorld {
  public world: RAPIER.World | null = null;
  public isPlaying: boolean = false;
  public collision: CollisionSystem = new CollisionSystem();
  private _initialized = false;

  /** Map Rapier collider handle → GameObject id (for contact/intersection queries) */
  private _colliderToGoId = new Map<number, number>();

  async init(): Promise<void> {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this._initialized = true;

    // Create ground plane collider
    const groundDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0)
      .setTranslation(0, -0.1, 0);
    this.world.createCollider(groundDesc);
  }

  addPhysicsBody(go: GameObject): void {
    if (!this.world || !this._initialized) return;

    // Remove existing if any
    this.removePhysicsBody(go);

    const cfg: PhysicsConfig = go.physicsConfig ?? defaultPhysicsConfig();
    if (!cfg.enabled || !cfg.simulatePhysics) return;

    const pos = go.mesh.position;
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setGravityScale(cfg.gravityEnabled ? cfg.gravityScale : 0)
      .setLinearDamping(cfg.linearDamping)
      .setAngularDamping(cfg.angularDamping);

    const rigidBody = this.world.createRigidBody(rbDesc);

    // Mass — Rapier sets mass via additionalMass (on top of collider density)
    rigidBody.setAdditionalMass(Math.max(0, cfg.mass - 1), true);

    // Axis constraints
    rigidBody.setEnabledTranslations(
      !cfg.lockPositionX,
      !cfg.lockPositionY,
      !cfg.lockPositionZ,
      true,
    );
    rigidBody.setEnabledRotations(
      !cfg.lockRotationX,
      !cfg.lockRotationY,
      !cfg.lockRotationZ,
      true,
    );

    // Root collider
    const rootColDesc = this._colliderDescFromGeometry(go.mesh.geometry);
    rootColDesc.setFriction(cfg.friction);
    rootColDesc.setRestitution(cfg.restitution);
    if (!cfg.collisionEnabled) rootColDesc.setSensor(true);

    const collider = this.world.createCollider(rootColDesc, rigidBody);
    go.rigidBody = rigidBody;
    go.collider = collider;
    go.hasPhysics = true;

    // Register in collider→gameObject lookup
    this._colliderToGoId.set(collider.handle, go.id);

    // Compound colliders for child component meshes
    for (const child of go.mesh.children) {
      if (!(child as any).isMesh) continue;
      const mesh = child as THREE.Mesh;
      const childColDesc = this._colliderDescFromGeometry(mesh.geometry);
      // Offset the child collider relative to the root body
      childColDesc.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z);
      if (mesh.quaternion) {
        childColDesc.setRotation({ x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w });
      }
      childColDesc.setFriction(cfg.friction);
      childColDesc.setRestitution(cfg.restitution);
      if (!cfg.collisionEnabled) childColDesc.setSensor(true);
      const childCol = this.world.createCollider(childColDesc, rigidBody);
      this._colliderToGoId.set(childCol.handle, go.id);
    }
  }

  /** Build a RAPIER.ColliderDesc from a Three.js geometry */
  private _colliderDescFromGeometry(geo: THREE.BufferGeometry): RAPIER.ColliderDesc {
    if (geo.type === 'BoxGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.cuboid(
        params.width / 2,
        params.height / 2,
        params.depth / 2,
      );
    } else if (geo.type === 'SphereGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.ball(params.radius);
    } else if (geo.type === 'CylinderGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.cylinder(params.height / 2, params.radiusTop);
    }
    return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
  }

  removePhysicsBody(go: GameObject): void {
    if (!this.world) return;
    if (go.rigidBody) {
      this.world.removeRigidBody(go.rigidBody);
      go.rigidBody = null;
      go.collider = null;
      go.hasPhysics = false;
    }
  }

  step(scene: Scene): void {
    if (!this.world || !this.isPlaying) return;

    // Sync trigger sensor positions before the physics step
    this.collision.syncSensorPositions(scene, this);

    this.world.step();

    // Sync physics → Three.js
    for (const go of scene.gameObjects) {
      if (go.rigidBody) {
        const pos = go.rigidBody.translation();
        const rot = go.rigidBody.rotation();
        go.mesh.position.set(pos.x, pos.y, pos.z);
        go.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      }
    }

    // Process collision / overlap events after step
    this.collision.processEvents(scene, this);
  }

  play(scene: Scene): void {
    if (!this.world) return;

    // Create rigid bodies for objects whose PhysicsConfig has simulate enabled
    // Skip CharacterPawn and SpectatorPawn actors — they have their own controllers
    for (const go of scene.gameObjects) {
      if (go.actorType === 'characterPawn' || go.actorType === 'spectatorPawn') continue;
      const cfg = go.physicsConfig;
      if (cfg && cfg.enabled && cfg.simulatePhysics && !go.rigidBody) {
        this.addPhysicsBody(go);
      }
    }

    // Create sensor colliders for all trigger components
    this.collision.createSensors(scene, this);

    this.isPlaying = true;
  }

  stop(scene: Scene): void {
    this.isPlaying = false;

    // Reset collision system
    this.collision.reset();
    this._colliderToGoId.clear();

    // Clear all physics body references from game objects
    for (const go of scene.gameObjects) {
      go.rigidBody = null;
      go.collider = null;
      go.hasPhysics = false;
      // Clean up trigger body references
      (go as any)._triggerBodies = undefined;
    }

    // Recreate a fresh physics world
    if (this.world) {
      this.world.free();
      const gravity = { x: 0.0, y: -9.81, z: 0.0 };
      this.world = new RAPIER.World(gravity);

      // Recreate ground plane
      const groundDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0)
        .setTranslation(0, -0.1, 0);
      this.world.createCollider(groundDesc);
    }
  }
}
