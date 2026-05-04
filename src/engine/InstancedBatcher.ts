// ============================================================
//  InstancedBatcher — collapses many GameObjects sharing the
//  same geometry + material into a single THREE.InstancedMesh
//  draw call.
//
//  Activates only between Engine.onPlayStarted() and
//  Engine.onPlayStopped() — the editor view is untouched, so
//  selection/picking/transform gizmos all keep working.
//
//  Opt-in per GameObject via `go.instanced = true`.
//
//  v1 limitations:
//    - Root mesh must be a non-skinned THREE.Mesh (Groups skipped).
//    - Material arrays skipped.
//    - Members must share THREE refs (same geometry/material objects)
//      to be batched. Two actors loaded from the same asset get
//      separate refs today, so users currently get the win when
//      they explicitly point actors at shared geometry/material —
//      a future MeshAssetManager dedup pass will widen the net.
// ============================================================

import * as THREE from 'three';
import type { GameObject } from './GameObject';

interface Batch {
  instMesh: THREE.InstancedMesh;
  members: GameObject[];
  /** Cached for restore on dispose. */
  prevVisible: boolean[];
}

const DUMMY = new THREE.Object3D();

export class InstancedBatcher {
  private _batches: Batch[] = [];
  private _active = false;

  /** Quick stats for profiler / overlay. */
  public stats = { batches: 0, instances: 0, skipped: 0 };

  isActive(): boolean { return this._active; }

  /**
   * Group instanced GameObjects by (geometry.uuid|material.uuid),
   * create one InstancedMesh per group of 2+, hide originals.
   * Idempotent — calling on an already-active batcher rebuilds.
   */
  build(scene: THREE.Scene, gameObjects: GameObject[]): void {
    if (this._active) this.dispose(scene);

    const groups = new Map<string, GameObject[]>();
    let skipped = 0;

    for (const go of gameObjects) {
      if (!go.instanced || go.isDestroyed) continue;

      const mesh = go.mesh as THREE.Mesh | undefined;
      if (!mesh || !(mesh as any).isMesh) { skipped++; continue; }
      if ((mesh as any).isSkinnedMesh) { skipped++; continue; }
      if (Array.isArray(mesh.material)) { skipped++; continue; }
      if (!mesh.geometry || !mesh.material) { skipped++; continue; }

      const key = mesh.geometry.uuid + '|' + (mesh.material as THREE.Material).uuid;
      let bucket = groups.get(key);
      if (!bucket) { bucket = []; groups.set(key, bucket); }
      bucket.push(go);
    }

    for (const [, members] of groups) {
      if (members.length < 2) continue; // not worth batching one
      const proto = members[0].mesh as THREE.Mesh;
      const geom = proto.geometry;
      const mat = proto.material as THREE.Material;
      const inst = new THREE.InstancedMesh(geom, mat, members.length);
      inst.frustumCulled = false; // bounding box of batch container is meaningless once members spread out
      inst.castShadow = proto.castShadow;
      inst.receiveShadow = proto.receiveShadow;
      inst.userData.__instancedBatch = true;

      const prevVisible: boolean[] = new Array(members.length);
      for (let i = 0; i < members.length; i++) {
        const m = members[i].mesh;
        m.updateMatrixWorld(true);
        inst.setMatrixAt(i, m.matrixWorld);
        prevVisible[i] = m.visible;
        m.visible = false;
      }
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);

      this._batches.push({ instMesh: inst, members, prevVisible });
    }

    this._active = true;
    this.stats.batches = this._batches.length;
    this.stats.instances = this._batches.reduce((n, b) => n + b.members.length, 0);
    this.stats.skipped = skipped;
  }

  /**
   * Sync each member's world matrix into its instance slot.
   * Called once per frame from Engine.update().
   */
  update(): void {
    if (!this._active) return;
    for (const batch of this._batches) {
      let dirty = false;
      const inst = batch.instMesh;
      for (let i = 0; i < batch.members.length; i++) {
        const go = batch.members[i];
        if (go.isDestroyed) {
          // Collapse this slot — write a zero-scale matrix so it doesn't render.
          DUMMY.position.set(0, 0, 0);
          DUMMY.scale.setScalar(0);
          DUMMY.updateMatrix();
          inst.setMatrixAt(i, DUMMY.matrix);
          dirty = true;
          continue;
        }
        const m = go.mesh;
        m.updateMatrixWorld();
        inst.setMatrixAt(i, m.matrixWorld);
        dirty = true;
      }
      if (dirty) inst.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Remove all batched InstancedMeshes from the scene and restore the
   * original meshes' visibility. Geometry/material are NOT disposed —
   * they are shared with the originals.
   */
  dispose(scene: THREE.Scene): void {
    for (const batch of this._batches) {
      scene.remove(batch.instMesh);
      // Don't dispose batch.instMesh.geometry / .material — shared with originals.
      for (let i = 0; i < batch.members.length; i++) {
        batch.members[i].mesh.visible = batch.prevVisible[i];
      }
    }
    this._batches = [];
    this._active = false;
    this.stats = { batches: 0, instances: 0, skipped: 0 };
  }
}
