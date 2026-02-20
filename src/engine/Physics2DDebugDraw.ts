// ============================================================
//  Physics2DDebugDraw — Renders Rapier2D collider wireframes
//  as a Three.js overlay. depthTest: false, rebuild only when
//  colliders change (dirty flag).
// ============================================================

import * as THREE from 'three';
import type { Physics2DWorld, BodyEntry2D } from './Physics2DWorld';

const DEBUG_COLOR_DYNAMIC = 0x22c55e;  // green
const DEBUG_COLOR_STATIC  = 0x3b82f6;  // blue
const DEBUG_COLOR_KINEMATIC = 0xa855f7; // purple
const DEBUG_COLOR_TRIGGER = 0xfbbf24;  // amber/yellow
const DEBUG_LINE_COLOR    = 0xef4444;  // red (for line traces)
const DEBUG_CIRCLE_COLOR  = 0x22c55e;  // green (for hit points)

export class Physics2DDebugDraw {
  public enabled = false;
  public group: THREE.Group;

  private _physics: Physics2DWorld | null = null;
  private _dirty = true;
  private _lastBodyCount = -1;
  private _material: THREE.LineBasicMaterial;
  private _triggerMaterial: THREE.LineBasicMaterial;
  private _tempLines: THREE.Object3D[] = []; // ephemeral debug lines (line traces, circles)
  private _tempLifetimes: number[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Physics2DDebugOverlay';
    this.group.renderOrder = 9999;

    this._material = new THREE.LineBasicMaterial({
      color: DEBUG_COLOR_DYNAMIC,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.7,
    });

    this._triggerMaterial = new THREE.LineBasicMaterial({
      color: DEBUG_COLOR_TRIGGER,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.5,
    });
  }

  attach(physics: Physics2DWorld): void {
    this._physics = physics;
    this._dirty = true;
  }

  detach(): void {
    this._physics = null;
    this.clear();
  }

  markDirty(): void {
    this._dirty = true;
  }

  /** Call every frame — rebuilds wireframes only when dirty */
  update(deltaTime: number): void {
    if (!this.enabled || !this._physics?.world) {
      if (this.group.children.length > 0) this.clear();
      return;
    }

    // Check if body count changed → mark dirty
    const currentCount = this._physics.bodyMap.size;
    if (currentCount !== this._lastBodyCount) {
      this._dirty = true;
      this._lastBodyCount = currentCount;
    }

    // Rebuild collider wireframes when dirty
    if (this._dirty) {
      this._rebuildWireframes();
      this._dirty = false;
    }

    // Update dynamic/kinematic positions every frame
    this._updatePositions();

    // Update temp lines lifetimes
    this._updateTempLines(deltaTime);
  }

  clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.Line || child instanceof THREE.LineLoop) {
        (child.geometry as THREE.BufferGeometry)?.dispose();
      }
    }
    this._tempLines = [];
    this._tempLifetimes = [];
  }

  // ---- Ephemeral debug drawing (for line traces, etc.) ----

  drawLine(
    start: { x: number; y: number },
    end: { x: number; y: number },
    color: string | number = DEBUG_LINE_COLOR,
    duration = 0.1,
  ): void {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, start.y, 0),
      new THREE.Vector3(end.x, end.y, 0),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: typeof color === 'string' ? new THREE.Color(color) : color,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 10000;
    this.group.add(line);
    this._tempLines.push(line);
    this._tempLifetimes.push(duration);
  }

  drawCircle(
    center: { x: number; y: number },
    radius: number,
    color: string | number = DEBUG_CIRCLE_COLOR,
    duration = 0.1,
  ): void {
    const segments = 24;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
        0,
      ));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: typeof color === 'string' ? new THREE.Color(color) : color,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.LineLoop(geom, mat);
    line.renderOrder = 10000;
    this.group.add(line);
    this._tempLines.push(line);
    this._tempLifetimes.push(duration);
  }

  // ---- Internal ----

  private _rebuildWireframes(): void {
    // Remove old wireframe children (but keep temp lines)
    const toRemove: THREE.Object3D[] = [];
    for (const child of this.group.children) {
      if (!this._tempLines.includes(child)) {
        toRemove.push(child);
      }
    }
    for (const obj of toRemove) {
      this.group.remove(obj);
      if (obj instanceof THREE.Line || obj instanceof THREE.LineLoop) {
        (obj.geometry as THREE.BufferGeometry)?.dispose();
      }
    }

    if (!this._physics?.world) return;
    const rapier = this._physics.rapier;
    if (!rapier) return;

    // Iterate all colliders in the world
    this._physics.world.forEachCollider((collider: any) => {
      const wireframe = this._createColliderWireframe(collider, rapier);
      if (wireframe) {
        // Tag with collider handle for position updates
        wireframe.userData.colliderHandle = collider.handle;
        wireframe.userData.isDebugWireframe = true;
        this.group.add(wireframe);
      }
    });
  }

  private _createColliderWireframe(collider: any, rapier: any): THREE.Object3D | null {
    const shapeType = collider.shapeType();
    const isSensor = collider.isSensor();
    const rbParent = collider.parent();

    // Choose color based on body type
    let color = DEBUG_COLOR_STATIC;
    if (rbParent) {
      if (rbParent.isDynamic()) color = DEBUG_COLOR_DYNAMIC;
      else if (rbParent.isKinematic()) color = DEBUG_COLOR_KINEMATIC;
    }
    if (isSensor) color = DEBUG_COLOR_TRIGGER;

    const mat = new THREE.LineBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: isSensor ? 0.5 : 0.7,
    });

    let geom: THREE.BufferGeometry | null = null;

    // Rapier2D shape types
    if (shapeType === rapier.ShapeType.Cuboid) {
      const halfExtents = collider.halfExtents();
      const hw = halfExtents.x;
      const hh = halfExtents.y;
      const points = [
        new THREE.Vector3(-hw, -hh, 0),
        new THREE.Vector3( hw, -hh, 0),
        new THREE.Vector3( hw,  hh, 0),
        new THREE.Vector3(-hw,  hh, 0),
        new THREE.Vector3(-hw, -hh, 0), // close loop
      ];
      geom = new THREE.BufferGeometry().setFromPoints(points);
    } else if (shapeType === rapier.ShapeType.Ball) {
      const radius = collider.radius();
      const segments = 32;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
      }
      geom = new THREE.BufferGeometry().setFromPoints(points);
    } else if (shapeType === rapier.ShapeType.Capsule) {
      const halfHeight = collider.halfHeight();
      const radius = collider.radius();
      const segments = 16;
      const points: THREE.Vector3[] = [];

      // Top semicircle
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          halfHeight + Math.sin(angle) * radius,
          0,
        ));
      }
      // Bottom semicircle
      for (let i = 0; i <= segments; i++) {
        const angle = Math.PI + (i / segments) * Math.PI;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          -halfHeight + Math.sin(angle) * radius,
          0,
        ));
      }
      // Close
      points.push(points[0].clone());
      geom = new THREE.BufferGeometry().setFromPoints(points);
    } else if (shapeType === rapier.ShapeType.ConvexPolygon) {
      // Get vertices from convex polygon
      const vertices = collider.vertices();
      if (vertices && vertices.length >= 4) {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < vertices.length; i += 2) {
          points.push(new THREE.Vector3(vertices[i], vertices[i + 1], 0));
        }
        points.push(points[0].clone()); // close
        geom = new THREE.BufferGeometry().setFromPoints(points);
      }
    } else if (shapeType === rapier.ShapeType.HeightField) {
      // Heightfield — skip for now, not commonly used in 2D
      return null;
    } else if (shapeType === rapier.ShapeType.Segment) {
      const a = collider.segment?.();
      if (a) {
        geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a.a.x, a.a.y, 0),
          new THREE.Vector3(a.b.x, a.b.y, 0),
        ]);
      }
    }

    if (!geom) return null;

    const line = new THREE.Line(geom, mat);
    line.renderOrder = 9999;

    // Position the wireframe at collider's world position
    const pos = collider.translation();
    const rot = collider.rotation();
    line.position.set(pos.x, pos.y, 0);
    line.rotation.z = rot;

    return line;
  }

  private _updatePositions(): void {
    if (!this._physics?.world) return;

    for (const child of this.group.children) {
      if (!child.userData.isDebugWireframe) continue;
      const handle = child.userData.colliderHandle;
      if (handle == null) continue;

      try {
        const collider = this._physics.world.getCollider(handle);
        if (!collider) continue;
        const pos = collider.translation();
        const rot = collider.rotation();
        child.position.set(pos.x, pos.y, 0);
        child.rotation.z = rot;
      } catch {
        // Collider was removed — mark dirty for next rebuild
        this._dirty = true;
      }
    }
  }

  private _updateTempLines(deltaTime: number): void {
    const toRemove: number[] = [];
    for (let i = this._tempLifetimes.length - 1; i >= 0; i--) {
      this._tempLifetimes[i] -= deltaTime;
      if (this._tempLifetimes[i] <= 0) {
        const obj = this._tempLines[i];
        this.group.remove(obj);
        if (obj instanceof THREE.Line || obj instanceof THREE.LineLoop) {
          (obj.geometry as THREE.BufferGeometry)?.dispose();
          ((obj as THREE.Line).material as THREE.Material)?.dispose();
        }
        this._tempLines.splice(i, 1);
        this._tempLifetimes.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.clear();
    this._material.dispose();
    this._triggerMaterial.dispose();
    this._physics = null;
  }
}
