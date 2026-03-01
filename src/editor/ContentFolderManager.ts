// ============================================================
//  ContentFolderManager — UE-style folder structure for Content Browser
//  Manages hierarchical folder organization for all asset types
// ============================================================

export type AssetType = 'actor' | 'structure' | 'enum' | 'event' | 'mesh' | 'animBP' | 'widget' | 'material' | 'texture' | 'animation' | 'gameInstance' | 'saveGame' | 'sound' | 'soundCue' | 'inputMapping' | 'behaviorTree' | 'blackboard' | 'btTask' | 'btDecorator' | 'btService' | 'aiController' | 'perceptionConfig' | 'eqs' | 'dataTable';

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;  // null = root folder
  children: string[];       // child folder IDs
}

export interface AssetLocation {
  assetId: string;
  assetType: AssetType;
  folderId: string;
}

export interface ContentFolderJSON {
  folders: Record<string, FolderNode>;
  assetLocations: AssetLocation[];
  version: number;
}

export class ContentFolderManager {
  private _folders: Map<string, FolderNode> = new Map();
  private _assetLocations: Map<string, AssetLocation> = new Map();
  private _rootFolderId: string = 'root';
  private _changeCallbacks: Array<() => void> = [];

  constructor() {
    // Create default root folder
    this._folders.set(this._rootFolderId, {
      id: this._rootFolderId,
      name: 'Content',
      parentId: null,
      children: [],
    });
  }

  /** Subscribe to folder structure changes */
  onChanged(callback: () => void): void {
    this._changeCallbacks.push(callback);
  }

  private _notifyChanged(): void {
    for (const cb of this._changeCallbacks) cb();
  }

  // ---- Folder Management ----

  /** Create a new folder */
  createFolder(name: string, parentId: string = 'root'): FolderNode {
    const id = 'folder_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const folder: FolderNode = {
      id,
      name,
      parentId,
      children: [],
    };
    this._folders.set(id, folder);

    // Add to parent's children
    const parent = this._folders.get(parentId);
    if (parent) {
      parent.children.push(id);
    }

    this._notifyChanged();
    return folder;
  }

  /** Rename a folder */
  renameFolder(folderId: string, newName: string): void {
    const folder = this._folders.get(folderId);
    if (folder) {
      folder.name = newName;
      this._notifyChanged();
    }
  }

  /** Delete a folder (moves all assets to parent folder) */
  deleteFolder(folderId: string): void {
    if (folderId === this._rootFolderId) return; // can't delete root

    const folder = this._folders.get(folderId);
    if (!folder) return;

    const parentId = folder.parentId || this._rootFolderId;

    // Move all assets in this folder to parent
    for (const [assetKey, location] of this._assetLocations.entries()) {
      if (location.folderId === folderId) {
        location.folderId = parentId;
      }
    }

    // Move all child folders to parent
    for (const childId of folder.children) {
      const child = this._folders.get(childId);
      if (child) {
        child.parentId = parentId;
        const parent = this._folders.get(parentId);
        if (parent) {
          parent.children.push(childId);
        }
      }
    }

    // Remove from parent's children list
    if (folder.parentId) {
      const parent = this._folders.get(folder.parentId);
      if (parent) {
        parent.children = parent.children.filter(id => id !== folderId);
      }
    }

    this._folders.delete(folderId);
    this._notifyChanged();
  }

  /** Move a folder to a new parent */
  moveFolder(folderId: string, newParentId: string): void {
    if (folderId === this._rootFolderId) return;
    if (folderId === newParentId) return; // can't move to self
    if (this._isDescendantOf(newParentId, folderId)) return; // can't move to own child

    const folder = this._folders.get(folderId);
    if (!folder) return;

    // Remove from old parent
    if (folder.parentId) {
      const oldParent = this._folders.get(folder.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter(id => id !== folderId);
      }
    }

    // Add to new parent
    folder.parentId = newParentId;
    const newParent = this._folders.get(newParentId);
    if (newParent) {
      newParent.children.push(folderId);
    }

    this._notifyChanged();
  }

  /** Check if folderId is a descendant of ancestorId */
  private _isDescendantOf(folderId: string, ancestorId: string): boolean {
    let current = this._folders.get(folderId);
    while (current) {
      if (current.id === ancestorId) return true;
      if (!current.parentId) break;
      current = this._folders.get(current.parentId);
    }
    return false;
  }

  // ---- Asset Location Management ----

  /** Set the folder location for an asset */
  setAssetLocation(assetId: string, assetType: AssetType, folderId: string): void {
    const key = `${assetType}:${assetId}`;
    this._assetLocations.set(key, { assetId, assetType, folderId });
    this._notifyChanged();
  }

  /** Get the folder ID for an asset (returns 'root' if not set) */
  getAssetFolder(assetId: string, assetType: AssetType): string {
    const key = `${assetType}:${assetId}`;
    return this._assetLocations.get(key)?.folderId || this._rootFolderId;
  }

  /** Get all assets in a specific folder */
  getAssetsInFolder(folderId: string): AssetLocation[] {
    const assets: AssetLocation[] = [];
    for (const location of this._assetLocations.values()) {
      if (location.folderId === folderId) {
        assets.push(location);
      }
    }
    return assets;
  }

  /** Remove an asset location (when asset is deleted) */
  removeAssetLocation(assetId: string, assetType: AssetType): void {
    const key = `${assetType}:${assetId}`;
    this._assetLocations.delete(key);
    this._notifyChanged();
  }

  // ---- Queries ----

  /** Get all folders */
  getAllFolders(): FolderNode[] {
    return Array.from(this._folders.values());
  }

  /** Get a folder by ID */
  getFolder(folderId: string): FolderNode | undefined {
    return this._folders.get(folderId);
  }

  /** Get root folder ID */
  getRootFolderId(): string {
    return this._rootFolderId;
  }

  /** Get children folders of a parent */
  getChildFolders(parentId: string): FolderNode[] {
    const parent = this._folders.get(parentId);
    if (!parent) return [];
    return parent.children.map(id => this._folders.get(id)!).filter(Boolean);
  }

  /** Get full path of a folder (e.g., "Content/Meshes/Characters") */
  getFolderPath(folderId: string): string {
    const parts: string[] = [];
    let current = this._folders.get(folderId);
    while (current) {
      parts.unshift(current.name);
      if (!current.parentId) break;
      current = this._folders.get(current.parentId);
    }
    return parts.join('/');
  }

  // ---- Serialization ----

  toJSON(): ContentFolderJSON {
    const folders: Record<string, FolderNode> = {};
    for (const [id, folder] of this._folders.entries()) {
      folders[id] = folder;
    }
    return {
      folders,
      assetLocations: Array.from(this._assetLocations.values()),
      version: 1,
    };
  }

  fromJSON(data: ContentFolderJSON): void {
    this._folders.clear();
    this._assetLocations.clear();

    // Load folders
    for (const [id, folder] of Object.entries(data.folders)) {
      this._folders.set(id, folder);
    }

    // Load asset locations
    for (const location of data.assetLocations) {
      const key = `${location.assetType}:${location.assetId}`;
      this._assetLocations.set(key, location);
    }

    // Ensure root folder exists
    if (!this._folders.has(this._rootFolderId)) {
      this._folders.set(this._rootFolderId, {
        id: this._rootFolderId,
        name: 'Content',
        parentId: null,
        children: [],
      });
    }

    this._notifyChanged();
  }

  /** Create default folder structure for new projects */
  createDefaultFolders(): void {
    this.createFolder('Blueprints', this._rootFolderId);
    this.createFolder('Meshes', this._rootFolderId);
    this.createFolder('Widgets', this._rootFolderId);
    this.createFolder('Animations', this._rootFolderId);
    this.createFolder('Materials', this._rootFolderId);
    this.createFolder('Audio', this._rootFolderId);
  }
}
