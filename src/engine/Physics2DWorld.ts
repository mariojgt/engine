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
  /** Maps collider handle → component name so selfComponentName can be included in events */
  colliderNames: Map<number, string>;
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

    // Free the old Rapier world before creating a new one.
    // Without this, every play session leaks the previous world's WASM memory,
    // and any stale rigid-body handles still in bodyMap would cause WASM panics
    // when syncToThreeJS() tries to call .isDynamic() on them.
    if (this.world) {
      try { this.world.free(); } catch (_) { /* ignore if already freed */ }
      this.world = null;
    }
    if (this.eventQueue) {
      try { this.eventQueue.free(); } catch (_) { /* ignore */ }
      this.eventQueue = null;
    }

    this.world = new this._rapier.World(
      new this._rapier.Vector2(gx / this.pixelsPerUnit, gy / this.pixelsPerUnit)
    );
    this.eventQueue = new this._rapier.EventQueue(true);
    this._initialized = true;
    this._accumulator = 0;
    // Clear ALL maps — every entry from the previous play session is now invalid
    // because the Rapier world (and all its handles) was just replaced.
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
    if (!this.world) return;

    this.world.forEachActiveRigidBody((rigidBody: any) => {
      const entry = this.bodyMap.get(rigidBody.handle);
      if (!entry) return;

      const { actor } = entry;
      if (!rigidBody.isDynamic() && !rigidBody.isKinematic()) return;
      // Guard against stale WASM handles — should not happen if removeActorBody is
      // called correctly, but a try-catch prevents a freed body from crashing the loop.
      let pos: { x: number; y: number };
      try {
        pos = rigidBody.translation();
      } catch (err) {
        console.warn('[Physics2DWorld] syncToThreeJS: stale rigid body handle for "' + actor.name + '" — skipping. Did you forget removeActorBody()?', err);
        return;
      }
      actor.group.position.x = pos.x;
      actor.group.position.y = pos.y;
      actor.group.position.z = 0; // LOCK to 2D plane — prevent Z drift from any source
      actor.group.rotation.z = rigidBody.rotation();
      // Update transform2D if present
      if (actor.transform2D) {
        actor.transform2D.position.x = pos.x;
        actor.transform2D.position.y = pos.y;
        actor.transform2D.rotation = rigidBody.rotation() * (180 / Math.PI);
      }
      // Update ground check for RigidBody2D components
      if (actor.getComponent) {
        const rb2dComp = actor.getComponent('RigidBody2D');
        if (rb2dComp) {
          rb2dComp._isGroundedByPhysics = this._checkActorGrounded(rigidBody);
          rb2dComp.isGrounded = rb2dComp._isGroundedByPhysics;
        }
      }
    });
  }

  /** Check if a body is grounded by casting a ray from the centre downward past its feet.
   *  We derive the correct cast distance from the body's first tracked collider so the
   *  ray always extends to (collider bottom + skin) regardless of character size.
   */
  private _checkActorGrounded(rigidBody: any): boolean {
    if (!this.world || !this._rapier) return false;
    const pos = rigidBody.translation();

    // Determine cast length: half-height of the first collider + a small ground-detection skin.
    // Without this the ray (from the body CENTRE) would stop before reaching the character's
    // own feet and therefore never detect a tile floor beneath them.
    let maxToi = 0.6; // safe fallback — covers characters up to ~1.1 units tall
    const entry = this.bodyMap.get(rigidBody.handle);
    if (entry && entry.colliders.length > 0) {
      try {
        const col = entry.colliders[0];
        // Cuboid collider exposes halfExtents(); capsule exposes halfHeight()
        if (typeof col.halfExtents === 'function') {
          maxToi = col.halfExtents().y + 0.08;
        } else if (typeof col.halfHeight === 'function') {
          maxToi = col.halfHeight() + col.radius() + 0.08;
        }
      } catch (_e) { /* fall through to default */ }
    }

    const origin = new this._rapier.Vector2(pos.x, pos.y);
    const dir    = new this._rapier.Vector2(0, -1);
    const ray    = new this._rapier.Ray(origin, dir);
    const hit    = this.world.castRay(ray, maxToi, true, undefined, undefined, undefined, rigidBody);
    return hit !== null;
  }

  /** Diagnostic: count all rigid bodies and colliders in the Rapier world */
  getWorldStats(): { bodies: number; dynamicBodies: number; fixedBodies: number; colliders: number } {
    if (!this.world) return { bodies: 0, dynamicBodies: 0, fixedBodies: 0, colliders: 0 };
    let bodies = 0, dynamicBodies = 0, fixedBodies = 0, colliders = 0;
    this.world.forEachRigidBody((rb: any) => {
      bodies++;
      if (rb.isDynamic()) dynamicBodies++;
      if (rb.isFixed()) fixedBodies++;
    });
    this.world.forEachCollider(() => { colliders++; });
    return { bodies, dynamicBodies, fixedBodies, colliders };
  }

  processEvents(): void {
    if (!this.eventQueue) return;

    this.eventQueue.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
      // Resolve collider handles to actors
      const collider1 = this.world?.getCollider(handle1);
      const collider2 = this.world?.getCollider(handle2);
      if (!collider1 || !collider2) return;

      const rb1 = collider1.parent();
      const rb2 = collider2.parent();
      if (!rb1 || !rb2) return;

      const entry1 = this.bodyMap.get(rb1.handle);
      const entry2 = this.bodyMap.get(rb2.handle);

      const isTrigger1 = collider1.isSensor();
      const isTrigger2 = collider2.isSensor();
      const isTrigger = isTrigger1 || isTrigger2;

      if (entry1?.actor?.emit && entry2?.actor) {
        const eventType = isTrigger
          ? (started ? 'triggerBegin2D' : 'triggerEnd2D')
          : (started ? 'collisionBegin2D' : 'collisionEnd2D');
        const selfName1 = entry1.colliderNames?.get(handle1) ?? '';
        try {
          entry1.actor.emit(eventType, { otherActor: entry2.actor, otherName: entry2.actor.name, selfComponentName: selfName1 });
        } catch (err) {
          console.error('[Physics2DWorld] Error in collision event handler for "' + entry1.actor.name + '":', err);
        }
      }
      if (entry2?.actor?.emit && entry1?.actor) {
        const eventType = isTrigger
          ? (started ? 'triggerBegin2D' : 'triggerEnd2D')
          : (started ? 'collisionBegin2D' : 'collisionEnd2D');
        const selfName2 = entry2.colliderNames?.get(handle2) ?? '';
        try {
          entry2.actor.emit(eventType, { otherActor: entry1.actor, otherName: entry1.actor.name, selfComponentName: selfName2 });
        } catch (err) {
          console.error('[Physics2DWorld] Error in collision event handler for "' + entry2.actor.name + '":', err);
        }
      }
    });

    this.eventQueue.drainContactForceEvents((event: any) => {
      // Contact force events — dispatch to actors for damage/impact calculations
      const collider1 = this.world?.getCollider(event.collider1());
      const collider2 = this.world?.getCollider(event.collider2());
      if (!collider1 || !collider2) return;
      const rb1 = collider1.parent();
      const rb2 = collider2.parent();
      if (!rb1 || !rb2) return;
      const entry1 = this.bodyMap.get(rb1.handle);
      const entry2 = this.bodyMap.get(rb2.handle);
      if (entry1?.actor?.emit) {
        entry1.actor.emit('contactForce2D', { otherActor: entry2?.actor, maxForce: event.maxForceMagnitude() });
      }
      if (entry2?.actor?.emit) {
        entry2.actor.emit('contactForce2D', { otherActor: entry1?.actor, maxForce: event.maxForceMagnitude() });
      }
    });
  }

  // ---- Body Management ----

  addDynamicBody(actor: any, x: number, y: number, options: {
    gravityScale?: number;
    linearDamping?: number;
    angularDamping?: number;
    mass?: number;
    freezeRotation?: boolean;
    ccdEnabled?: boolean;
  } = {}): any {
    if (!this.world || !this._rapier) return null;

    const rbDesc = this._rapier.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setGravityScale(options.gravityScale ?? 1.0)
      .setLinearDamping(options.linearDamping ?? 0.0)
      .setAngularDamping(options.angularDamping ?? 0.05);

    if (options.ccdEnabled) rbDesc.setCcdEnabled(true);

    const rigidBody = this.world.createRigidBody(rbDesc);

    // Apply mass if specified (setAdditionalMass adds on top of collider-computed mass;
    // we use it here as the primary mass setter before colliders are added).
    if (options.mass !== undefined && options.mass > 0) {
      try { rigidBody.setAdditionalMass(options.mass, true); } catch (_) {
        // Some Rapier builds use setMass instead
        try { (rigidBody as any).setMass(options.mass, true); } catch (_2) { /* ignore */ }
      }
    }

    if (options.freezeRotation) {
      rigidBody.lockRotations(true, true);
    }

    const entry: BodyEntry2D = { rigidBody, actor, colliders: [], colliderNames: new Map() };
    this.bodyMap.set(rigidBody.handle, entry);
    return rigidBody;
  }

  addStaticBody(x: number, y: number, actor?: any): any {
    if (!this.world || !this._rapier) return null;
    const rbDesc = this._rapier.RigidBodyDesc.fixed().setTranslation(x, y);
    const rigidBody = this.world.createRigidBody(rbDesc);
    // Register in bodyMap when an actor is provided so processEvents can resolve the actor
    if (actor !== undefined && actor !== null) {
      const entry: BodyEntry2D = { rigidBody, actor, colliders: [], colliderNames: new Map() };
      this.bodyMap.set(rigidBody.handle, entry);
    }
    return rigidBody;
  }

  addKinematicBody(actor: any, x: number, y: number): any {
    if (!this.world || !this._rapier) return null;
    const rbDesc = this._rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y);
    const rigidBody = this.world.createRigidBody(rbDesc);
    const entry: BodyEntry2D = { rigidBody, actor, colliders: [], colliderNames: new Map() };
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
    name?: string;
  } = {}): any {
    if (!this.world || !this._rapier) return null;
    const desc = this._rapier.ColliderDesc.cuboid(halfW, halfH)
      .setFriction(options.friction ?? 0.5)
      .setRestitution(options.restitution ?? 0.1) // reduced from 0.3 — prevents unnatural bouncing on landing
      .setActiveEvents(this._rapier.ActiveEvents.COLLISION_EVENTS);
    if (options.isTrigger) desc.setSensor(true);
    if (options.offsetX || options.offsetY) {
      desc.setTranslation(options.offsetX ?? 0, options.offsetY ?? 0);
    }
    const collider = this.world.createCollider(desc, rigidBody);
    // Track the collider in the body's BodyEntry so _checkActorGrounded can
    // read the half-extents and produce a correctly-sized ground-check ray.
    const entry = this.bodyMap.get(rigidBody.handle);
    if (entry) {
      entry.colliders.push(collider);
      if (options.name) entry.colliderNames.set(collider.handle, options.name);
    }
    return collider;
  }

  addCircleCollider(rigidBody: any, radius: number, options: {
    isTrigger?: boolean;
    friction?: number;
    restitution?: number;
    offsetX?: number;
    offsetY?: number;
    name?: string;
  } = {}): any {
    if (!this.world || !this._rapier) return null;
    const desc = this._rapier.ColliderDesc.ball(radius)
      .setFriction(options.friction ?? 0.5)
      .setRestitution(options.restitution ?? 0.1)
      .setActiveEvents(this._rapier.ActiveEvents.COLLISION_EVENTS);
    if (options.isTrigger) desc.setSensor(true);
    if (options.offsetX || options.offsetY) {
      desc.setTranslation(options.offsetX ?? 0, options.offsetY ?? 0);
    }
    const collider = this.world.createCollider(desc, rigidBody);
    const entry = this.bodyMap.get(rigidBody.handle);
    if (entry) {
      entry.colliders.push(collider);
      if (options.name) entry.colliderNames.set(collider.handle, options.name);
    }
    return collider;
  }

  addCapsuleCollider(rigidBody: any, halfHeight: number, radius: number, options: {
    isTrigger?: boolean;
    friction?: number;
    restitution?: number;
    offsetX?: number;
    offsetY?: number;
    name?: string;
  } = {}): any {
    if (!this.world || !this._rapier) return null;
    const desc = this._rapier.ColliderDesc.capsule(halfHeight, radius)
      .setFriction(options.friction ?? 0.5)
      .setRestitution(options.restitution ?? 0.1)
      .setActiveEvents(this._rapier.ActiveEvents.COLLISION_EVENTS);
    if (options.isTrigger) desc.setSensor(true);
    if (options.offsetX || options.offsetY) {
      desc.setTranslation(options.offsetX ?? 0, options.offsetY ?? 0);
    }
    const collider = this.world.createCollider(desc, rigidBody);
    const entry = this.bodyMap.get(rigidBody.handle);
    if (entry) {
      entry.colliders.push(collider);
      if (options.name) entry.colliderNames.set(collider.handle, options.name);
    }
    return collider;
  }

  // ---- Tilemap helper: static box for merged collision rects ----

  addStaticBox(layerId: string, cx: number, cy: number, w: number, h: number): void {
    if (!this.world || !this._rapier) {
      console.warn('[Physics2DWorld] addStaticBox skipped — world=%s rapier=%s', !!this.world, !!this._rapier);
      return;
    }
    const rb = this.addStaticBody(cx, cy);
    if (!rb) {
      console.warn('[Physics2DWorld] addStaticBox — addStaticBody returned null at (%s,%s)', cx, cy);
      return;
    }
    const col = this.addBoxCollider(rb, w / 2, h / 2);
    if (!col) {
      console.warn('[Physics2DWorld] addStaticBox — addBoxCollider returned null for (%s,%s) half=(%s,%s)', cx, cy, w/2, h/2);
    }
    if (!this._layerBodies.has(layerId)) this._layerBodies.set(layerId, []);
    this._layerBodies.get(layerId)!.push(rb);
  }

  // ---- Tilemap helper: static triangle for slope tiles ----

  /**
   * Emit a static triangle collider at the three given world-space vertices.
   * Used by TilemapCollisionBuilder for slope-left / slope-right tiles.
   * Vertices should be wound counter-clockwise viewed from +Z (standard for Rapier2D).
   */
  addStaticTriangle(
    layerId: string,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
  ): void {
    if (!this.world || !this._rapier) {
      console.warn('[Physics2DWorld] addStaticTriangle skipped — world=%s rapier=%s', !!this.world, !!this._rapier);
      return;
    }

    // Rapier triangle vertices must be in the body's LOCAL space.
    // Place the body at the centroid, then express each vertex relative to it.
    const cx = (x1 + x2 + x3) / 3;
    const cy = (y1 + y2 + y3) / 3;

    const rb = this.addStaticBody(cx, cy);
    if (!rb) return;

    const V = this._rapier.Vector2;
    const desc = this._rapier.ColliderDesc.triangle(
      new V(x1 - cx, y1 - cy),
      new V(x2 - cx, y2 - cy),
      new V(x3 - cx, y3 - cy),
    )
      .setFriction(0.5)
      .setRestitution(0.05)
      .setActiveEvents(this._rapier.ActiveEvents.COLLISION_EVENTS);

    this.world.createCollider(desc, rb);

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

  /**
   * Properly remove a runtime actor's physics body.
   * Removes the rigid body from the Rapier world AND from bodyMap so that
   * syncToThreeJS() never calls .translation() on a freed WASM handle.
   * Always use this instead of calling physics.world.removeRigidBody() directly.
   */
  removeActorBody(actor: any): void {
    if (!this.world) return;
    for (const [handle, entry] of this.bodyMap) {
      if (entry.actor === actor) {
        try {
          this.world.removeRigidBody(entry.rigidBody);
        } catch (err) {
          console.warn('[Physics2DWorld] removeActorBody: error removing rigid body for "' + actor.name + '":', err);
        }
        this.bodyMap.delete(handle);
        // An actor normally has only one rigid body; break after the first match.
        break;
      }
    }
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

    // castRay returns { collider, toi } or null
    const hit = this.world.castRay(ray, maxToi, true);
    if (hit) {
      const toi = hit.toi;
      const hitPoint = { x: startX + dir.x * toi, y: startY + dir.y * toi };
      // Get the normal at the hit point
      const hitCollider = hit.collider;
      let normal = { x: 0, y: 1 };
      if (hitCollider) {
        const normalResult = hitCollider.castRayAndGetNormal(ray, maxToi, true);
        if (normalResult && normalResult.normal) {
          normal = { x: normalResult.normal.x, y: normalResult.normal.y };
        }
      }
      return {
        hit: true,
        point: hitPoint,
        normal,
        distance: toi,
        handle: hitCollider?.handle,
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
