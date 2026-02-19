/**
 * PhysicsDebugRenderer
 * ────────────────────
 * Renders Rapier's built-in debug wireframes (collider outlines, contacts,
 * axes) as a Three.js LineSegments overlay.  Toggled via the viewport
 * "Show ▸ Physics Debug" menu item.
 *
 * Also draws optional velocity vectors and contact-point markers.
 */
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';

export class PhysicsDebugRenderer {
  public enabled = false;

  private _engine: Engine;
  private _scene3: THREE.Scene;
  private _debugLines: THREE.LineSegments;
  private _velocityLines: THREE.LineSegments;
  private _geometry: THREE.BufferGeometry;
  private _velGeometry: THREE.BufferGeometry;
  private _added = false;

  constructor(engine: Engine) {
    this._engine = engine;
    this._scene3 = engine.scene.threeScene;

    // --- Rapier debug wireframe overlay ---
    this._geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    });
    this._debugLines = new THREE.LineSegments(this._geometry, material);
    this._debugLines.frustumCulled = false;
    this._debugLines.renderOrder = 999;
    this._debugLines.visible = false;

    // --- Velocity vector overlay ---
    this._velGeometry = new THREE.BufferGeometry();
    const velMat = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      depthTest: false,
      transparent: true,
      opacity: 0.6,
    });
    this._velocityLines = new THREE.LineSegments(this._velGeometry, velMat);
    this._velocityLines.frustumCulled = false;
    this._velocityLines.renderOrder = 998;
    this._velocityLines.visible = false;
  }

  /** Toggle physics debug overlay on / off */
  toggle(): void {
    this.enabled = !this.enabled;
    this._debugLines.visible = this.enabled;
    this._velocityLines.visible = this.enabled;
    this._engine.physics.settings.debugDraw = this.enabled;

    if (this.enabled && !this._added) {
      this._scene3.add(this._debugLines);
      this._scene3.add(this._velocityLines);
      this._added = true;
    }
  }

  /** Called every frame from ViewportPanel.render() */
  update(): void {
    if (!this.enabled) return;

    // Ensure we're added to the scene
    if (!this._added) {
      this._scene3.add(this._debugLines);
      this._scene3.add(this._velocityLines);
      this._added = true;
    }

    this._updateRapierDebugLines();
    this._updateVelocityVectors();
  }

  /** Pull Rapier's built-in debug render buffers into our LineSegments */
  private _updateRapierDebugLines(): void {
    const world = this._engine.physics.world;
    if (!world) {
      this._geometry.deleteAttribute('position');
      this._geometry.deleteAttribute('color');
      return;
    }

    const buffers = world.debugRender();
    const { vertices, colors } = buffers;

    if (vertices.length === 0) {
      this._debugLines.visible = false;
      return;
    }
    this._debugLines.visible = true;

    // Rapier gives us Float32Array directly
    this._geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    this._geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    this._geometry.attributes.position.needsUpdate = true;
    this._geometry.attributes.color.needsUpdate = true;
  }

  /** Draw velocity vectors for each active physics body */
  private _updateVelocityVectors(): void {
    const physics = this._engine.physics;
    if (!physics.world || !physics.isPlaying) {
      this._velocityLines.visible = false;
      return;
    }

    const gos = this._engine.scene.gameObjects;
    const positions: number[] = [];

    for (const go of gos) {
      if (!go.rigidBody) continue;
      const t = go.rigidBody.translation();
      const v = go.rigidBody.linvel();

      // Only draw if velocity is meaningful
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      if (speed < 0.01) continue;

      // Scale vector for visibility (cap at 5 units visual length)
      const scale = Math.min(5 / speed, 1);
      positions.push(t.x, t.y, t.z);
      positions.push(t.x + v.x * scale, t.y + v.y * scale, t.z + v.z * scale);
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
