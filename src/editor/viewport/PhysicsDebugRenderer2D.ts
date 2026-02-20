/**
 * PhysicsDebugRenderer2D
 * ──────────────────────
 * Renders Rapier2D's debug wireframes as a Three.js LineSegments overlay
 * for the 2D viewport. Draws collider outlines and velocity vectors
 * on a flat XY plane (z = high renderOrder).
 */
import * as THREE from 'three';
import type { Physics2DWorld } from '../../engine/Physics2DWorld';

export class PhysicsDebugRenderer2D {
  public enabled = false;

  private _physics2D: Physics2DWorld;
  private _scene3: THREE.Scene;
  private _debugLines: THREE.LineSegments;
  private _velocityLines: THREE.LineSegments;
  private _geometry: THREE.BufferGeometry;
  private _velGeometry: THREE.BufferGeometry;
  private _added = false;

  constructor(physics2D: Physics2DWorld, scene3: THREE.Scene) {
    this._physics2D = physics2D;
    this._scene3 = scene3;

    // --- Rapier2D debug wireframe overlay ---
    this._geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    this._debugLines = new THREE.LineSegments(this._geometry, material);
    this._debugLines.frustumCulled = false;
    this._debugLines.renderOrder = 999;
    this._debugLines.visible = false;

    // --- Velocity vector overlay ---
    this._velGeometry = new THREE.BufferGeometry();
    const velMat = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      depthTest: false,
      transparent: true,
      opacity: 0.6,
    });
    this._velocityLines = new THREE.LineSegments(this._velGeometry, velMat);
    this._velocityLines.frustumCulled = false;
    this._velocityLines.renderOrder = 998;
    this._velocityLines.visible = false;
  }

  /** Toggle physics debug overlay */
  toggle(): void {
    this.enabled = !this.enabled;
    this._debugLines.visible = this.enabled;
    this._velocityLines.visible = this.enabled;

    if (this.enabled && !this._added) {
      this._scene3.add(this._debugLines);
      this._scene3.add(this._velocityLines);
      this._added = true;
    }
  }

  /** Called every frame from the viewport render loop */
  update(): void {
    if (!this.enabled) return;

    if (!this._added) {
      this._scene3.add(this._debugLines);
      this._scene3.add(this._velocityLines);
      this._added = true;
    }

    this._updateRapier2DDebugLines();
    this._updateVelocityVectors();
  }

  /** Pull Rapier2D's debug render buffers into Three.js LineSegments.
   *  Rapier2D debugRender returns 2D vertices (x,y pairs); we place them at z=0.
   */
  private _updateRapier2DDebugLines(): void {
    const world = this._physics2D.world;
    if (!world) {
      this._geometry.deleteAttribute('position');
      this._geometry.deleteAttribute('color');
      this._debugLines.visible = false;
      return;
    }

    let buffers: { vertices: Float32Array; colors: Float32Array };
    try {
      buffers = world.debugRender();
    } catch {
      this._debugLines.visible = false;
      return;
    }

    const { vertices: verts2D, colors: colors4 } = buffers;
    if (verts2D.length === 0) {
      this._debugLines.visible = false;
      return;
    }
    this._debugLines.visible = true;

    // Convert 2D vertices (x,y pairs) → 3D (x,y,0)
    const vertCount = verts2D.length / 2;
    const positions = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      positions[i * 3] = verts2D[i * 2];
      positions[i * 3 + 1] = verts2D[i * 2 + 1];
      positions[i * 3 + 2] = 0; // flat on XY plane
    }

    this._geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this._geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors4, 4));
    this._geometry.attributes.position.needsUpdate = true;
    this._geometry.attributes.color.needsUpdate = true;
  }

  /** Draw velocity vectors for each 2D physics body */
  private _updateVelocityVectors(): void {
    const world = this._physics2D.world;
    if (!world) {
      this._velocityLines.visible = false;
      return;
    }

    const positions: number[] = [];
    const ppu = this._physics2D.settings.pixelsPerUnit || 100;

    // Iterate bodies
    for (const entry of this._physics2D.bodies) {
      const rb = entry.rigidBody;
      if (!rb.isDynamic()) continue;

      const t = rb.translation();
      const v = rb.linvel();
      const speed = Math.sqrt(v.x * v.x + v.y * v.y);
      if (speed < 0.01) continue;

      // Scale vector for visibility
      const scale = Math.min(3 / speed, 1);
      positions.push(t.x / ppu, t.y / ppu, 0);
      positions.push(t.x / ppu + (v.x * scale) / ppu, t.y / ppu + (v.y * scale) / ppu, 0);
    }

    if (positions.length === 0) {
      this._velocityLines.visible = false;
      return;
    }
    this._velocityLines.visible = true;

    this._velGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
    );
    this._velGeometry.attributes.position.needsUpdate = true;
  }

  /** Clean up Three.js objects */
  dispose(): void {
    if (this._added) {
      this._scene3.remove(this._debugLines);
      this._scene3.remove(this._velocityLines);
    }
    this._geometry.dispose();
    this._velGeometry.dispose();
    (this._debugLines.material as THREE.Material).dispose();
    (this._velocityLines.material as THREE.Material).dispose();
  }
}
