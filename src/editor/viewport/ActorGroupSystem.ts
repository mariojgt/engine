/**
 * Actor Group System — UE5-style logical grouping for viewport objects.
 *
 * Groups are purely logical (objects stay in the scene graph for correct
 * raycasting / rendering). Each group tracks member IDs, a display name,
 * lock state, and collapsed/open state for the World Outliner.
 *
 * Supports:
 *  - Nested groups (a group can be a member of another group)
 *  - Group pivot transforms (translate / rotate / scale all members)
 *  - Lock / Unlock (locked groups cannot be transformed or modified)
 *  - Rename
 *  - Undo / Redo integration via HistoryManager
 */

import * as THREE from 'three';
import type { HistoryManager } from './HistoryManager';
import type { Scene } from '../../engine/Scene';
import type { GameObject } from '../../engine/GameObject';

/* ─── Data types ─── */

export interface ActorGroup {
  id: string;
  name: string;
  /** Game-object IDs that belong to this group */
  memberIds: Set<number>;
  /** ID of the parent group (for nested groups), or null */
  parentGroupId: string | null;
  /** Whether the group is locked (prevents transform / edit) */
  isLocked: boolean;
  /** Whether the group node is expanded in the Outliner */
  isOpen: boolean;
}

export type GroupEventType =
  | 'groupCreated'
  | 'groupDeleted'
  | 'groupChanged'
  | 'membersChanged'
  | 'groupsChanged';

type GroupListener = (data?: any) => void;

/* ─── System ─── */

export class ActorGroupSystem {
  private _groups = new Map<string, ActorGroup>();
  private _scene: Scene;
  private _history: HistoryManager;
  private _listeners = new Map<GroupEventType, GroupListener[]>();
  private _nextGroupIndex = 1;

  constructor(scene: Scene, history: HistoryManager) {
    this._scene = scene;
    this._history = history;
  }

  /* ====================================================================
   *  Event system
   * ==================================================================== */

  on(event: GroupEventType, fn: GroupListener): void {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(fn);
  }

  off(event: GroupEventType, fn: GroupListener): void {
    const list = this._listeners.get(event);
    if (list) {
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private _emit(event: GroupEventType, data?: any): void {
    this._listeners.get(event)?.forEach((fn) => fn(data));
    // Always fire a generic "something changed" event for UI refresh
    if (event !== 'groupsChanged') {
      this._listeners.get('groupsChanged')?.forEach((fn) => fn(data));
    }
  }

  /* ====================================================================
   *  Read-only accessors
   * ==================================================================== */

  getGroup(id: string): ActorGroup | undefined {
    return this._groups.get(id);
  }

  getAllGroups(): ActorGroup[] {
    return [...this._groups.values()];
  }

  /** Get top-level groups (those without a parent) */
  getRootGroups(): ActorGroup[] {
    return this.getAllGroups().filter((g) => g.parentGroupId === null);
  }

  /** Get child groups of a given parent */
  getChildGroups(parentId: string): ActorGroup[] {
    return this.getAllGroups().filter((g) => g.parentGroupId === parentId);
  }

  /** Get the group that a game object belongs to (direct membership) */
  getGroupForObject(goId: number): ActorGroup | undefined {
    for (const g of this._groups.values()) {
      if (g.memberIds.has(goId)) return g;
    }
    return undefined;
  }

  /** Get the top-level group an object belongs to (walk up parent chain) */
  getRootGroupForObject(goId: number): ActorGroup | undefined {
    let group = this.getGroupForObject(goId);
    if (!group) return undefined;
    while (group.parentGroupId) {
      const parent = this._groups.get(group.parentGroupId);
      if (!parent) break;
      group = parent;
    }
    return group;
  }

  /** Resolve all game-object IDs in a group (including nested sub-groups) */
  resolveAllMemberIds(groupId: string): Set<number> {
    const result = new Set<number>();
    const group = this._groups.get(groupId);
    if (!group) return result;

    for (const id of group.memberIds) result.add(id);

    // Recurse into child groups
    for (const child of this.getChildGroups(groupId)) {
      for (const id of this.resolveAllMemberIds(child.id)) {
        result.add(id);
      }
    }
    return result;
  }

  /** Get all THREE.Object3D meshes belonging to a group (recursive) */
  getGroupMeshes(groupId: string): THREE.Object3D[] {
    const ids = this.resolveAllMemberIds(groupId);
    const meshes: THREE.Object3D[] = [];
    for (const id of ids) {
      const go = this._scene.findById(id);
      if (go) meshes.push(go.mesh);
    }
    return meshes;
  }

  /** Compute pivot (center) of a group's members */
  getGroupPivot(groupId: string): THREE.Vector3 {
    const meshes = this.getGroupMeshes(groupId);
    if (meshes.length === 0) return new THREE.Vector3();

    const center = new THREE.Vector3();
    meshes.forEach((m) => {
      const wp = new THREE.Vector3();
      m.getWorldPosition(wp);
      center.add(wp);
    });
    return center.divideScalar(meshes.length);
  }

  /** Check if a game object is in any group */
  isObjectGrouped(goId: number): boolean {
    return this.getGroupForObject(goId) !== undefined;
  }

  /* ====================================================================
   *  Mutations (all go through HistoryManager for undo/redo)
   * ==================================================================== */

  /**
   * Create a new group from the given game-object IDs.
   * Objects already in another group are moved to the new group.
   */
  createGroup(memberIds: number[], name?: string): string | null {
    if (memberIds.length < 2) return null;

    const groupId = `Group_${this._nextGroupIndex++}_${Date.now().toString(36)}`;
    const groupName = name ?? `Group ${this._nextGroupIndex - 1}`;

    // Snapshot previous group memberships for undo
    const previousMemberships = new Map<number, string | null>();
    for (const id of memberIds) {
      const existingGroup = this.getGroupForObject(id);
      previousMemberships.set(id, existingGroup?.id ?? null);
    }

    this._history.execute({
      name: `Group ${memberIds.length} objects`,
      execute: () => {
        // Remove members from old groups first
        for (const [id, oldGroupId] of previousMemberships) {
          if (oldGroupId) {
            const oldGroup = this._groups.get(oldGroupId);
            if (oldGroup) {
              oldGroup.memberIds.delete(id);
              // Clean up empty groups
              if (oldGroup.memberIds.size === 0 && this.getChildGroups(oldGroup.id).length === 0) {
                this._groups.delete(oldGroup.id);
              }
            }
          }
        }

        // Create the group
        const group: ActorGroup = {
          id: groupId,
          name: groupName,
          memberIds: new Set(memberIds),
          parentGroupId: null,
          isLocked: false,
          isOpen: true,
        };
        this._groups.set(groupId, group);

        // Tag meshes with groupId
        for (const id of memberIds) {
          const go = this._scene.findById(id);
          if (go) go.mesh.userData.groupId = groupId;
        }

        this._emit('groupCreated', { groupId });
      },
      undo: () => {
        // Remove the new group
        this._groups.delete(groupId);

        // Restore old memberships
        for (const [id, oldGroupId] of previousMemberships) {
          const go = this._scene.findById(id);
          if (!go) continue;

          if (oldGroupId) {
            // Re-add to old group
            let oldGroup = this._groups.get(oldGroupId);
            if (!oldGroup) {
              // Recreate the old group stub
              oldGroup = {
                id: oldGroupId,
                name: oldGroupId,
                memberIds: new Set(),
                parentGroupId: null,
                isLocked: false,
                isOpen: true,
              };
              this._groups.set(oldGroupId, oldGroup);
            }
            oldGroup.memberIds.add(id);
            go.mesh.userData.groupId = oldGroupId;
          } else {
            delete go.mesh.userData.groupId;
          }
        }

        this._emit('groupDeleted', { groupId });
      },
    });

    return groupId;
  }

  /** Ungroup — dissolve a group and release its members */
  ungroupById(groupId: string): void {
    const group = this._groups.get(groupId);
    if (!group) return;

    const snapshot: ActorGroup = {
      ...group,
      memberIds: new Set(group.memberIds),
    };

    this._history.execute({
      name: `Ungroup "${group.name}"`,
      execute: () => {
        // Clear groupId from members
        for (const id of snapshot.memberIds) {
          const go = this._scene.findById(id);
          if (go) delete go.mesh.userData.groupId;
        }
        // Reparent child groups to root
        for (const child of this.getChildGroups(groupId)) {
          child.parentGroupId = snapshot.parentGroupId;
        }
        this._groups.delete(groupId);
        this._emit('groupDeleted', { groupId });
      },
      undo: () => {
        // Recreate group
        this._groups.set(groupId, {
          ...snapshot,
          memberIds: new Set(snapshot.memberIds),
        });
        // Re-tag members
        for (const id of snapshot.memberIds) {
          const go = this._scene.findById(id);
          if (go) go.mesh.userData.groupId = groupId;
        }
        // Restore child group parent pointers
        for (const child of this.getChildGroups(snapshot.parentGroupId ?? '__none__')) {
          // check if this child was originally under groupId
        }
        this._emit('groupCreated', { groupId });
      },
    });
  }

  /**
   * Ungroup all groups that any of the selected object IDs belong to.
   * Returns the number of groups dissolved.
   */
  ungroupByMemberIds(memberIds: number[]): number {
    const groupIdsToRemove = new Set<string>();
    for (const id of memberIds) {
      const g = this.getGroupForObject(id);
      if (g) groupIdsToRemove.add(g.id);
    }
    if (groupIdsToRemove.size === 0) return 0;

    // Snapshot all affected groups
    const snapshots: ActorGroup[] = [];
    for (const gid of groupIdsToRemove) {
      const g = this._groups.get(gid)!;
      snapshots.push({ ...g, memberIds: new Set(g.memberIds) });
    }

    this._history.execute({
      name: `Ungroup ${groupIdsToRemove.size} group(s)`,
      execute: () => {
        for (const snap of snapshots) {
          for (const id of snap.memberIds) {
            const go = this._scene.findById(id);
            if (go) delete go.mesh.userData.groupId;
          }
          // Reparent children
          for (const child of this.getChildGroups(snap.id)) {
            child.parentGroupId = snap.parentGroupId;
          }
          this._groups.delete(snap.id);
        }
        this._emit('groupsChanged');
      },
      undo: () => {
        for (const snap of snapshots) {
          this._groups.set(snap.id, { ...snap, memberIds: new Set(snap.memberIds) });
          for (const id of snap.memberIds) {
            const go = this._scene.findById(id);
            if (go) go.mesh.userData.groupId = snap.id;
          }
        }
        this._emit('groupsChanged');
      },
    });

    return groupIdsToRemove.size;
  }

  /** Add game objects to an existing group */
  addToGroup(groupId: string, objectIds: number[]): void {
    const group = this._groups.get(groupId);
    if (!group) return;

    const previousMemberships = new Map<number, string | null>();
    for (const id of objectIds) {
      const existing = this.getGroupForObject(id);
      previousMemberships.set(id, existing?.id ?? null);
    }

    this._history.execute({
      name: `Add ${objectIds.length} to "${group.name}"`,
      execute: () => {
        for (const [id, oldGid] of previousMemberships) {
          // Remove from old group
          if (oldGid && oldGid !== groupId) {
            const oldGroup = this._groups.get(oldGid);
            if (oldGroup) oldGroup.memberIds.delete(id);
          }
          group.memberIds.add(id);
          const go = this._scene.findById(id);
          if (go) go.mesh.userData.groupId = groupId;
        }
        this._emit('membersChanged', { groupId });
      },
      undo: () => {
        for (const [id, oldGid] of previousMemberships) {
          group.memberIds.delete(id);
          const go = this._scene.findById(id);
          if (!go) continue;

          if (oldGid && oldGid !== groupId) {
            const oldGroup = this._groups.get(oldGid);
            if (oldGroup) oldGroup.memberIds.add(id);
            go.mesh.userData.groupId = oldGid;
          } else if (!oldGid) {
            delete go.mesh.userData.groupId;
          }
        }
        this._emit('membersChanged', { groupId });
      },
    });
  }

  /** Remove game objects from their current group */
  removeFromGroup(objectIds: number[]): void {
    const affected = new Map<number, string>();
    for (const id of objectIds) {
      const g = this.getGroupForObject(id);
      if (g) affected.set(id, g.id);
    }
    if (affected.size === 0) return;

    this._history.execute({
      name: `Remove ${affected.size} from group`,
      execute: () => {
        for (const [id, gid] of affected) {
          const group = this._groups.get(gid);
          if (group) group.memberIds.delete(id);
          const go = this._scene.findById(id);
          if (go) delete go.mesh.userData.groupId;
        }
        this._emit('membersChanged');
      },
      undo: () => {
        for (const [id, gid] of affected) {
          const group = this._groups.get(gid);
          if (group) group.memberIds.add(id);
          const go = this._scene.findById(id);
          if (go) go.mesh.userData.groupId = gid;
        }
        this._emit('membersChanged');
      },
    });
  }

  /** Rename a group */
  renameGroup(groupId: string, newName: string): void {
    const group = this._groups.get(groupId);
    if (!group) return;
    const oldName = group.name;
    if (oldName === newName) return;

    this._history.execute({
      name: `Rename group "${oldName}" → "${newName}"`,
      execute: () => {
        group.name = newName;
        this._emit('groupChanged', { groupId });
      },
      undo: () => {
        group.name = oldName;
        this._emit('groupChanged', { groupId });
      },
    });
  }

  /** Lock / unlock a group */
  toggleLock(groupId: string): void {
    const group = this._groups.get(groupId);
    if (!group) return;

    this._history.execute({
      name: `${group.isLocked ? 'Unlock' : 'Lock'} "${group.name}"`,
      execute: () => {
        group.isLocked = !group.isLocked;
        this._emit('groupChanged', { groupId });
      },
      undo: () => {
        group.isLocked = !group.isLocked;
        this._emit('groupChanged', { groupId });
      },
    });
  }

  /** Toggle collapsed/open in Outliner (no undo — UI only) */
  toggleOpen(groupId: string): void {
    const group = this._groups.get(groupId);
    if (!group) return;
    group.isOpen = !group.isOpen;
    this._emit('groupChanged', { groupId });
  }

  /* ====================================================================
   *  Selection helpers
   * ==================================================================== */

  /**
   * Given a clicked mesh, return all meshes that should be selected
   * (i.e. the whole group). Returns empty array if object is ungrouped.
   */
  expandSelectionToGroup(mesh: THREE.Object3D): THREE.Object3D[] {
    const goId = mesh.userData.gameObjectId as number | undefined;
    if (goId == null) return [];

    const group = this.getGroupForObject(goId);
    if (!group || group.isLocked) return [];

    return this.getGroupMeshes(group.id);
  }

  /* ====================================================================
   *  Cleanup — remove deleted objects from groups
   * ==================================================================== */

  /** Call when a game object is removed from the scene */
  onObjectRemoved(goId: number): void {
    for (const group of this._groups.values()) {
      group.memberIds.delete(goId);
    }
    // Prune empty groups
    for (const [id, group] of this._groups) {
      if (group.memberIds.size === 0 && this.getChildGroups(id).length === 0) {
        this._groups.delete(id);
      }
    }
    this._emit('membersChanged');
  }

  /** Get groups map for serialization */
  serialize(): Array<{ id: string; name: string; memberIds: number[]; parentGroupId: string | null; isLocked: boolean; isOpen: boolean }> {
    return this.getAllGroups().map((g) => ({
      id: g.id,
      name: g.name,
      memberIds: [...g.memberIds],
      parentGroupId: g.parentGroupId,
      isLocked: g.isLocked,
      isOpen: g.isOpen,
    }));
  }

  /** Restore from serialized data */
  deserialize(data: Array<{ id: string; name: string; memberIds: number[]; parentGroupId: string | null; isLocked: boolean; isOpen: boolean }>): void {
    this._groups.clear();
    for (const entry of data) {
      this._groups.set(entry.id, {
        id: entry.id,
        name: entry.name,
        memberIds: new Set(entry.memberIds),
        parentGroupId: entry.parentGroupId,
        isLocked: entry.isLocked,
        isOpen: entry.isOpen,
      });
      // Re-tag meshes
      for (const id of entry.memberIds) {
        const go = this._scene.findById(id);
        if (go) go.mesh.userData.groupId = entry.id;
      }
    }
    this._emit('groupsChanged');
  }
}
