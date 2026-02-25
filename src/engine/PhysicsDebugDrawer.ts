
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Scene } from './Scene';
import type { PhysicsWorld } from './PhysicsWorld';

export class PhysicsDebugDrawer {
  private _scene: THREE.Scene;
  private _physicsWorld: PhysicsWorld;
  private _lines: THREE.LineSegments;
  private _enabled: boolean = false;

  constructor(scene: THREE.Scene, physicsWorld: PhysicsWorld) {
    this._scene = scene;
    this._physicsWorld = physicsWorld;

    // Create a buffer geometry for lines
    const material = new THREE.LineBasicMaterial({ 
        color: 0x00ff00, 
        vertexColors: false,
        depthTest: false, // Always visible on top
        transparent: true,
        opacity: 0.7
    });
    const geometry = new THREE.BufferGeometry();
    this._lines = new THREE.LineSegments(geometry, material);
    this._lines.frustumCulled = false; // Always draw
    this._lines.name = "PhysicsDebugLines";
    this._lines.visible = false;
    
    this._scene.add(this._lines);
  }

  toggle(enable: boolean) {
    this._enabled = enable;
    this._lines.visible = enable;
  }

  update() {
    if (!this._enabled || !this._physicsWorld.world) return;
    
    const world = this._physicsWorld.world;
    const { vertices, colors } = world.debugRender();

    const geometry = this._lines.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    // Rapier colors are RGBA floats
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this._lines.visible = false;
    this._lines.geometry.dispose();
    (this._lines.material as THREE.Material).dispose();
    this._scene.remove(this._lines);
  }
}
