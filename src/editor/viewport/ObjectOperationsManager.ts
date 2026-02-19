/**
 * Object operations — delete, duplicate, copy/paste, group/ungroup.
 * All operations go through HistoryManager for undo/redo support.
 *
 * Copy/paste and duplicate faithfully recreate actor assets, custom mesh
 * assets, and standalone primitive objects (cube, sphere, cylinder, plane).
 *
 * Group/ungroup uses a *logical* grouping approach — objects keep their
 * position in the scene graph (so raycasting / selection keep working) and
 * are linked via a shared `userData.groupId`.
 */

import * as THREE from 'three';
import type { HistoryManager } from './HistoryManager';
import type { SelectionManager } from './SelectionManager';
import type { Scene, RootMeshType } from '../../engine/Scene';
import type { GameObject } from '../../engine/GameObject';
import type { ActorAssetManager } from '../ActorAsset';
import type { ActorGroupSystem } from './ActorGroupSystem';
import { MeshAssetManager } from '../MeshAsset';

/** Notification type */
export interface ViewportNotification {
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: number;
}

export class ObjectOperationsManager {
  private _scene: Scene;
  private _selection: SelectionManager;
  private _history: HistoryManager;
  private _actorAssetManager: ActorAssetManager;
  private _groupSystem: ActorGroupSystem;

  private _clipboard: ClipboardEntry[] = [];
  /** @deprecated — use ActorGroupSystem instead. Kept for backward compat read paths. */
  private _groups = new Map<string, Set<number>>();
  private _hiddenObjects = new Set<THREE.Object3D>();

  private _onNotification: ((notification: ViewportNotification) => void) | null = null;

  constructor(
    scene: Scene,
    selection: SelectionManager,
    history: HistoryManager,
    actorAssetManager: ActorAssetManager,
    groupSystem: ActorGroupSystem,
  ) {
    this._scene = scene;
    this._selection = selection;
    this._history = history;
    this._actorAssetManager = actorAssetManager;
    this._groupSystem = groupSystem;
  }

  set onNotification(fn: ((notification: ViewportNotification) => void) | null) {
    this._onNotification = fn;
  }

  /* ====================================================================
   *  Helpers — detect mesh type & faithful duplication
   * ==================================================================== */

  /** Detect root mesh type from an existing game object's geometry */
  private _detectMeshType(go: GameObject): RootMeshType {
    const mesh = go.mesh;
    if (mesh instanceof THREE.Group) return 'none';

    const geo = (mesh as THREE.Mesh).geometry;
    if (!geo) return 'cube';

    const geoType = geo.type;
    if (geoType === 'SphereGeometry') return 'sphere';
    if (geoType === 'CylinderGeometry') return 'cylinder';
    if (geoType === 'PlaneGeometry') return 'plane';
    if (geoType === 'BoxGeometry') {
      // Invisible placeholder (none) or actual cube?
      const mat = (mesh as THREE.Mesh).material;
      if (mat && !Array.isArray(mat) && (mat as any).visible === false) return 'none';
      return 'cube';
    }
    return 'cube';
  }

  /**
   * Faithfully duplicate a single game object:
   *  - Actor asset → re-create via addGameObjectFromAsset with full asset data
   *  - Custom mesh → re-create via addGameObjectFromMeshAsset
   *  - Standalone primitive → addGameObject with correct mesh type
   *
   * Returns the new GameObject (or a Promise for mesh assets).
   */
  private _duplicateGameObject(
    go: GameObject,
    positionOffset: THREE.Vector3,
  ): GameObject | Promise<GameObject> {
    const pos = {
      x: go.mesh.position.x + positionOffset.x,
      y: go.mesh.position.y + positionOffset.y,
      z: go.mesh.position.z + positionOffset.z,
    };

    // ---- Actor asset ----
    if (go.actorAssetId) {
      const asset = this._actorAssetManager.getAsset(go.actorAssetId);
      if (asset) {
        const newGO = this._scene.addGameObjectFromAsset(
          asset.id,
          asset.name,
          asset.rootMeshType,
          asset.blueprintData,
          pos,
          asset.components,
          asset.compiledCode,
          asset.rootPhysics,
          asset.actorType,
          asset.characterPawnConfig,
          asset.controllerClass,
          asset.controllerBlueprintId,
          asset.rootMaterialOverrides,
        );
        newGO.mesh.rotation.copy(go.mesh.rotation);
        newGO.mesh.scale.copy(go.mesh.scale);
        return newGO;
      }
    }

    // ---- Custom mesh asset ----
    if (go.customMeshAssetId) {
      const meshManager = MeshAssetManager.getInstance();
      const meshAsset = meshManager?.getAsset(go.customMeshAssetId);
      if (meshAsset) {
        const promise = this._scene.addGameObjectFromMeshAsset(meshAsset, pos);
        return promise.then((newGO) => {
          newGO.mesh.rotation.copy(go.mesh.rotation);
          newGO.mesh.scale.copy(go.mesh.scale);
          return newGO;
        });
      }
    }

    // ---- Standalone primitive ----
    const meshType = this._detectMeshType(go);
    const newGO = this._scene.addGameObject(go.name + '_Copy', meshType);
    newGO.mesh.position.set(pos.x, pos.y, pos.z);
    newGO.mesh.rotation.copy(go.mesh.rotation);
    newGO.mesh.scale.copy(go.mesh.scale);

    // Copy physics config if present
    if (go.physicsConfig) {
      newGO.physicsConfig = structuredClone(go.physicsConfig);
      newGO.hasPhysics = go.hasPhysics;
    }

    return newGO;
  }

  /* -------- Delete -------- */

  deleteSelected(): void {
    const selected = this._selection.selectedObjects;
    if (selected.length === 0) return;

    // Find corresponding GameObjects
    const goMap = this._mapSelectedToGameObjects(selected);
    if (goMap.length === 0) return;

    const removedGOs = goMap.map((m) => m.go);
    const removedData = goMap.map((m) => ({
      go: m.go,
      mesh: m.mesh,
      index: this._scene.gameObjects.indexOf(m.go),
    }));

    this._history.execute({
      name: `Delete ${removedGOs.length} object(s)`,
      execute: () => {
        removedGOs.forEach((go) => {
          this._scene.removeGameObject(go);
          this._groupSystem.onObjectRemoved(go.id);
        });
        this._selection.clearSelection();
      },
      undo: () => {
        removedData.forEach((data) => {
          // Re-add to scene
          this._scene.threeScene.add(data.go.mesh);
          this._scene.gameObjects.splice(data.index, 0, data.go);
        });
        this._scene.selectObject(null);
        this._notify(`Undo: Restored ${removedGOs.length} object(s)`, 'info');
      },
    });

    this._notify(`Deleted ${removedGOs.length} object(s) — Ctrl+Z to undo`, 'info');
  }

  /* -------- Duplicate -------- */

  duplicateSelected(): void {
    const selected = this._selection.selectedObjects;
    if (selected.length === 0) return;

    const goMap = this._mapSelectedToGameObjects(selected);
    if (goMap.length === 0) return;

    const offset = new THREE.Vector3(1, 0, 1);
    const syncDuplicates: GameObject[] = [];
    const asyncPromises: Promise<GameObject>[] = [];

    goMap.forEach(({ go }) => {
      const result = this._duplicateGameObject(go, offset);
      if (result instanceof Promise) {
        asyncPromises.push(result);
      } else {
        syncDuplicates.push(result);
      }
    });

    // Select new objects immediately for sync results
    this._selection.clearSelection();
    syncDuplicates.forEach((d) => this._selection.addToSelection(d.mesh));

    // Handle async mesh asset duplicates
    if (asyncPromises.length > 0) {
      Promise.all(asyncPromises).then((asyncDuplicates) => {
        asyncDuplicates.forEach((d) => this._selection.addToSelection(d.mesh));
      });
    }

    this._notify(
      `Duplicated ${goMap.length} object(s)`,
      'info',
    );
  }

  /* -------- Copy / Paste -------- */

  copySelected(): void {
    const selected = this._selection.selectedObjects;
    if (selected.length === 0) return;

    const goMap = this._mapSelectedToGameObjects(selected);
    this._clipboard = goMap.map(({ go }) => ({
      name: go.name,
      position: go.mesh.position.clone(),
      rotation: go.mesh.rotation.clone(),
      scale: go.mesh.scale.clone(),
      actorAssetId: go.actorAssetId,
      customMeshAssetId: go.customMeshAssetId,
      meshType: this._detectMeshType(go),
      physicsConfig: go.physicsConfig ? structuredClone(go.physicsConfig) : null,
      hasPhysics: go.hasPhysics,
    }));

    this._notify(`Copied ${this._clipboard.length} object(s)`, 'info');
  }

  paste(): void {
    if (this._clipboard.length === 0) return;

    const offset = new THREE.Vector3(1, 0, 1);
    const syncPasted: GameObject[] = [];
    const asyncPromises: Promise<GameObject>[] = [];

    this._clipboard.forEach((entry) => {
      // ---- Actor asset ----
      if (entry.actorAssetId) {
        const asset = this._actorAssetManager.getAsset(entry.actorAssetId);
        if (asset) {
          const pos = {
            x: entry.position.x + offset.x,
            y: entry.position.y + offset.y,
            z: entry.position.z + offset.z,
          };
          const go = this._scene.addGameObjectFromAsset(
            asset.id,
            asset.name,
            asset.rootMeshType,
            asset.blueprintData,
            pos,
            asset.components,
            asset.compiledCode,
            asset.rootPhysics,
            asset.actorType,
            asset.characterPawnConfig,
            asset.controllerClass,
            asset.controllerBlueprintId,
            asset.rootMaterialOverrides,
          );
          go.mesh.rotation.copy(entry.rotation);
          go.mesh.scale.copy(entry.scale);
          syncPasted.push(go);
          return;
        }
      }

      // ---- Custom mesh asset ----
      if (entry.customMeshAssetId) {
        const meshManager = MeshAssetManager.getInstance();
        const meshAsset = meshManager?.getAsset(entry.customMeshAssetId);
        if (meshAsset) {
          const pos = {
            x: entry.position.x + offset.x,
            y: entry.position.y + offset.y,
            z: entry.position.z + offset.z,
          };
          const p = this._scene.addGameObjectFromMeshAsset(meshAsset, pos).then((go) => {
            go.mesh.rotation.copy(entry.rotation);
            go.mesh.scale.copy(entry.scale);
            return go;
          });
          asyncPromises.push(p);
          return;
        }
      }

      // ---- Standalone primitive ----
      const go = this._scene.addGameObject(
        entry.name + '_Pasted',
        entry.meshType,
      );
      go.mesh.position.copy(entry.position).add(offset);
      go.mesh.rotation.copy(entry.rotation);
      go.mesh.scale.copy(entry.scale);
      if (entry.physicsConfig) {
        go.physicsConfig = structuredClone(entry.physicsConfig);
        go.hasPhysics = entry.hasPhysics;
      }
      syncPasted.push(go);
    });

    this._selection.clearSelection();
    syncPasted.forEach((go) => this._selection.addToSelection(go.mesh));

    if (asyncPromises.length > 0) {
      Promise.all(asyncPromises).then((asyncPasted) => {
        asyncPasted.forEach((go) => this._selection.addToSelection(go.mesh));
      });
    }

    this._notify(`Pasted ${this._clipboard.length} object(s)`, 'info');
  }

  /* -------- Group / Ungroup (delegates to ActorGroupSystem) -------- */

  groupSelected(): void {
    const selected = this._selection.selectedObjects;
    if (selected.length < 2) {
      this._notify('Select at least 2 objects to group', 'warning');
      return;
    }

    const goMap = this._mapSelectedToGameObjects(selected);
    if (goMap.length < 2) {
      this._notify('Select at least 2 objects to group', 'warning');
      return;
    }

    const memberIds = goMap.map(({ go }) => go.id);
    const groupId = this._groupSystem.createGroup(memberIds);
    if (groupId) {
      this._notify(`Grouped ${goMap.length} objects`, 'info');
    }
  }

  ungroupSelected(): void {
    const selected = this._selection.selectedObjects;
    if (selected.length === 0) {
      this._notify('No objects selected', 'warning');
      return;
    }

    const goMap = this._mapSelectedToGameObjects(selected);
    const memberIds = goMap.map(({ go }) => go.id);
    const count = this._groupSystem.ungroupByMemberIds(memberIds);
    if (count > 0) {
      this._notify(`Ungrouped ${count} group(s)`, 'info');
    } else {
      this._notify('Selected objects are not in a group', 'warning');
    }
  }

  /**
   * Public accessor: get all objects in the same group as the given object.
   * Used by the selection manager to "select group" on click.
   */
  getGroupMembers(obj: THREE.Object3D): THREE.Object3D[] {
    return this._groupSystem.expandSelectionToGroup(obj);
  }

  /* -------- Visibility -------- */

  hideSelected(): void {
    const selected = this._selection.selectedObjects;
    selected.forEach((obj) => {
      obj.visible = false;
      this._hiddenObjects.add(obj);
    });
    this._selection.clearSelection();
    this._notify(`Hidden ${selected.length} object(s) — Ctrl+H to show all`, 'info');
  }

  showAll(): void {
    this._hiddenObjects.forEach((obj) => {
      obj.visible = true;
    });
    const count = this._hiddenObjects.size;
    this._hiddenObjects.clear();
    this._notify(`Shown ${count} hidden object(s)`, 'info');
  }

  hideUnselected(): void {
    const selectedSet = new Set(this._selection.selectedObjects);
    this._scene.gameObjects.forEach((go) => {
      if (!selectedSet.has(go.mesh)) {
        go.mesh.visible = false;
        this._hiddenObjects.add(go.mesh);
      }
    });
    this._notify('Hidden unselected objects', 'info');
  }

  /* -------- Transform reset -------- */

  resetLocation(): void {
    const selected = this._selection.selectedObjects;
    selected.forEach((obj) => obj.position.set(0, 0, 0));
    this._notify('Reset location', 'info');
  }

  resetRotation(): void {
    const selected = this._selection.selectedObjects;
    selected.forEach((obj) => obj.rotation.set(0, 0, 0));
    this._notify('Reset rotation', 'info');
  }

  resetScale(): void {
    const selected = this._selection.selectedObjects;
    selected.forEach((obj) => obj.scale.set(1, 1, 1));
    this._notify('Reset scale', 'info');
  }

  resetAllTransforms(): void {
    const selected = this._selection.selectedObjects;
    selected.forEach((obj) => {
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(1, 1, 1);
    });
    this._notify('Reset all transforms', 'info');
  }

  /* -------- Helpers -------- */

  private _mapSelectedToGameObjects(selected: THREE.Object3D[]): { go: GameObject; mesh: THREE.Object3D }[] {
    const result: { go: GameObject; mesh: THREE.Object3D }[] = [];
    selected.forEach((obj) => {
      const id = obj.userData.gameObjectId;
      if (id != null) {
        const go = this._scene.findById(id);
        if (go) result.push({ go, mesh: obj });
      }
    });
    return result;
  }

  private _notify(message: string, type: 'info' | 'warning' | 'error'): void {
    this._onNotification?.({
      message,
      type,
      timestamp: Date.now(),
    });
  }
}

interface ClipboardEntry {
  name: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  actorAssetId: string | null;
  customMeshAssetId: string | null;
  meshType: RootMeshType;
  physicsConfig: import('../ActorAsset').PhysicsConfig | null;
  hasPhysics: boolean;
}
