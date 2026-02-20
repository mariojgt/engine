// ============================================================
//  Physics2DWorld — Wraps @dimforge/rapier2d-compat
//  Separate from PhysicsWorld (Rapier3D). Never both active at once.
// ============================================================

import * as THREE from 'three';

// We use dynamic import to avoid loading rapier2d when in 3D mode
let RAPIER2D: any;

export interface Physics2DSettings {
  gravity?: { x: number; y: number };
  pixelsPerUnit?: number;
}

export interface BodyEntry2D {
  rigidBody: any; // RAPIER2D.RigidBody
  actor: any;
  colliders: any[];
}

export class Physics2DWorld {
  public world: any = null; // RAPIER2D.World
  public isPlaying = false;
  public pixelsPerUnit = 100;
  public bodyMap = new Map<number, BodyEntry2D>();
  public eventQueue: any = null;

  private _initialized = false;
  private _accumulator = 0;
  private _fixedStep = 1 / 60;
  private _rapier: any = null;
  private _layerBodies = new Map<string, any[]>(); // layerId → rigidBody[]

  async init(settings: Physics2DSettings = {}): Promise<void> {
    // Dynamic import rapier2d-compat
    if (!this._rapier) {
      const mod = await import('@dimforge/rapier2d-compat');
      await mod.default.init();
      this._rapier = mod.default;
      RAPIER2D = mod.default;
    }

    const gx = settings.gravity?.x ?? 0;
    const gy = settings.gravity?.y ?? -980;
    this.pixelsPerUnit = settings.pixelsPerUnit ?? 100;

    this.world = new this._rapier.World(
      new this._rapier.Vector2(gx / this.pixelsPerUnit, gy / this.pixelsPerUnit)
    );
    this.eventQueue = new this._rapier.EventQueue(true);
    this._initialized = true;
    this._accumulator = 0;
    this.bodyMap.clear();
    this._layerBodies.clear();
  }

  get rapier() { return this._rapier; }

  /** Iterable accessor for all body entries (for debug rendering) */
  get bodies(): IterableIterator<BodyEntry2D> { return this.bodyMap.values(); }

  /** Current physics settings */
  get settings(): { pixelsPerUnit: number } {
    return { pixelsPerUnit: this.pixelsPerUnit };
  }

  // ---- Stepping ----

  step(deltaTime: number): void {
    if (!this.world || !this._initialized || !this.isPlaying) return;

    this._accumulator += Math.min(deltaTime, 0.1);
    let steps = 0;
    while (this._accumulator >= this._fixedStep && steps < 8) {
      this.world.step(this.eventQueue);
      this._accumulator -= this._fixedStep;
      steps++;
    }
    this.syncToThreeJS();
    this.processEvents();
  }

  syncToThreeJS(): void {
    this.bodyMap.forEach(({ rigidBody, actor }) => {
      if (!rigidBody.isDynamic() && !rigidBody.isKinematic()) return;
      const pos = rigidBody.translation();
      actor.group.position.x = pos.x;
      actor.group.position.y = pos.y;
      actor.group.rotation.z = rigidBody.rotation();
      // Also update transform2D if present
      if (actor.transform2D) {
        actor.transform2D.position.x = pos.x;
        actor.transform2D.position.y = pos.y;
        actor.transform2D.rotation = rigidBody.rotation();
      }
    });
  }

  processEvents(): void {
    if (!this.eventQueue) return;
    this.eventQueue.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
      // TODO: dispatch overlap/hit events to actors
    });
    this.eventQueue.drainContactForceEvents((_event: any) => {
      // TODO: dispatch contact force events
    });
  }

  // ---- Body Management ----

  addDynamicBody(actor: any, x: number, y: number, options: {
    gravityScale?: number;
    linearDamping?: number;
    freezeRotation?: boolean;
    ccdEnabled?: boolean;
  } = {}): any {
    if (!this.world || !this._rapier) return null;

    const rbDesc = this._rapier.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setGravityScale(options.gravityScale ?? 1.0)
      .setLinearDamping(options.linearDamping ?? 0.0);

    if (options.ccdEnabled) rbDesc.setCcdEnabled(true);

    const rigidBody = this.world.createRigidBody(rbDesc);

    if (options.freezeRotation) {
      rigidBody.setEnabledRotations(false, true);
    }

    const entry: BodyEntry2D = { rigidBody, actor, colliders: [] };
    this.bodyMap.set(rigidBody.handle, entry);
    return rigidBody;
  }

  addStaticBody(x: number, y: number): any {
    if (!this.world || !this._rapier) return null;
    const rbDesc = this._rapier.RigidBodyDesc.fixed().setTranslation(x, y);
    return this.world.createRigidBody(rbDesc);
  }

  addKinematicBody(actor: any, x: number, y: number): any {
    if (!this.world || !this._rapier) return null;
    const rbDesc = this._rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y);
    const rigidBody = this.world.createRigidBody(rbDesc);
    const entry: BodyEntry2D = { rigidBody, actor, colliders: [] };
    this.bodyMap.set(rigidBody.handle, entry);
    return rigidBody;
  }

  // ---- Collider helpers ----

  addBoxCollider(rigidBody: any, halfW: number, halfH: number, options: {
    isTrigger?: boolean;
    friction?: number;
    restitution?: number;
    offsetX?: number;
    offsetY?: number;
  } = {}): any {
    if (!this.world || !this._rapier) return null;
    const desc = this._rapier.ColliderDesc.cuboid(halfW, halfH)
      .setFriction(options.friction ?? 0.5)
      .setRestitution(options.restitution ?? 0.3);
    if (options.isTrigger) desc.setSensor(true);
    if (options.offsetX || options.offsetY) {
      desc.setTranslation(options.offsetX ?? 0, options.offsetY ?? 0);
    }
    return this.world.createCollider(desc, rigidBody);
  }

  addCircleCollider(rigidBody: any, radius: number, options: {
    isTrigger?: boolean;
    friction?: number;
    restitution?: number;
    offsetX?: number;
    offsetY?: number;
  } = {}): any {
    if (!this.world || !this._rapier) return null;
    const desc = this._rapier.ColliderDesc.ball(radius)
      .setFriction(options.friction ?? 0.5)
      .setRestitution(options.restitution ?? 0.3);
    if (options.isTrigger) desc.setSensor(true);
    if (options.offsetX || options.offsetY) {
      desc.setTranslation(options.offsetX ?? 0, options.offsetY ?? 0);
    }
    return this.world.createCollider(desc, rigidBody);
  }

  addCapsuleCollider(rigidBody: any, halfHeight: number, radius: number, options: {
    isTrigger?: boolean;
    friction?: number;
    restitution?: number;
    offsetX?: number;
    offsetY?: number;
  } = {}): any {
    if (!this.world || !this._rapier) return null;
    const desc = this._rapier.ColliderDesc.capsule(halfHeight, radius)
      .setFriction(options.friction ?? 0.5)
      .setRestitution(options.restitution ?? 0.3);
    if (options.isTrigger) desc.setSensor(true);
    if (options.offsetX || options.offsetY) {
      desc.setTranslation(options.offsetX ?? 0, options.offsetY ?? 0);
    }
    return this.world.createCollider(desc, rigidBody);
  }

  // ---- Tilemap helper: static box for merged collision rects ----

  addStaticBox(layerId: string, cx: number, cy: number, w: number, h: number): void {
    if (!this.world || !this._rapier) return;
    const rb = this.addStaticBody(cx, cy);
    const col = this.addBoxCollider(rb, w / 2, h / 2);
    if (!this._layerBodies.has(layerId)) this._layerBodies.set(layerId, []);
    this._layerBodies.get(layerId)!.push(rb);
  }

  removeLayerBodies(layerId: string): void {
    const bodies = this._layerBodies.get(layerId);
    if (!bodies || !this.world) return;
    for (const rb of bodies) {
      this.world.removeRigidBody(rb);
    }
    this._layerBodies.delete(layerId);
  }

  // ---- Query helpers ----

  lineTrace(startX: number, startY: number, endX: number, endY: number): {
    hit: boolean;
    point?: { x: number; y: number };
    normal?: { x: number; y: number };
    distance?: number;
    handle?: number;
  } {
    if (!this.world || !this._rapier) return { hit: false };

    const origin = new this._rapier.Vector2(startX, startY);
    const dx = endX - startX;
    const dy = endY - startY;
    const maxToi = Math.sqrt(dx * dx + dy * dy);
    if (maxToi < 0.0001) return { hit: false };
    const dir = new this._rapier.Vector2(dx / maxToi, dy / maxToi);
    const ray = new this._rapier.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxToi, true);
    if (hit) {
      const point = ray.pointAt(hit.timeOfImpact);
      const normal = hit.normal;
      return {
        hit: true,
        point: { x: point.x, y: point.y },
        normal: normal ? { x: normal.x, y: normal.y } : { x: 0, y: 1 },
        distance: hit.timeOfImpact,
        handle: hit.collider?.handle,
      };
    }
    return { hit: false };
  }

  // ---- Play / Stop ----

  play(): void {
    this.isPlaying = true;
    this._accumulator = 0;
  }

  stop(): void {
    this.isPlaying = false;
    this._accumulator = 0;
  }

  // ---- Cleanup ----

  cleanup(): void {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.bodyMap.clear();
    this._layerBodies.clear();
    this._initialized = false;
    this.isPlaying = false;
  }
}
