// ============================================================
//  ActorAssetBrowser — UE-style Content Browser for Actor Assets
//  Shows all actor assets in a grid view. Supports:
//    - Right-click → Create New Actor
//    - Double-click → Open Actor Editor
//    - Drag → Drop into scene to create instance
//    - Right-click asset → Rename / Duplicate / Delete
// ============================================================

import { ActorAssetManager, type ActorAsset, type ActorType } from './ActorAsset';
import { StructureAssetManager, type StructureAsset, type EnumAsset } from './StructureAsset';
import { MeshAssetManager, type MeshAsset, type MaterialAssetJSON, isImportableFile } from './MeshAsset';
import { AnimBlueprintManager, type AnimBlueprintAsset } from './AnimBlueprintData';
import { WidgetBlueprintManager, type WidgetBlueprintAsset } from './WidgetBlueprintData';
import { GameInstanceBlueprintManager, type GameInstanceBlueprintAsset } from './GameInstanceData';
import { ContentFolderManager, type AssetType, type FolderNode } from './ContentFolderManager';
import { importMeshFile, detectFileContent } from './MeshImporter';
import { showImportDialog, showImportProgress } from './ImportDialog';
import { ClassInheritanceSystem } from './ClassInheritanceSystem';
import { createParentSelector } from './InheritanceDialogsUI';

/** Callback fired when the user releases the mouse after dragging an asset card */
export type AssetDropCallback = (asset: ActorAsset, mouseX: number, mouseY: number) => void;

/** Callback fired when a mesh asset is dropped onto the viewport */
export type MeshDropCallback = (meshAsset: MeshAsset, mouseX: number, mouseY: number) => void;

export type ContentBrowserTab = 'Actors' | 'Structures' | 'Enums' | 'Meshes' | 'AnimBP' | 'Widgets' | 'Materials';

export class ActorAssetBrowser {
  public container: HTMLElement;
  private _manager: ActorAssetManager;
  private _structManager: StructureAssetManager | null = null;
  private _meshManager: MeshAssetManager | null = null;
  private _animBPManager: AnimBlueprintManager | null = null;
  private _widgetBPManager: WidgetBlueprintManager | null = null;
  private _gameInstanceManager: GameInstanceBlueprintManager | null = null;
  private _folderManager: ContentFolderManager;
  private _treeEl!: HTMLElement;
  private _gridEl!: HTMLElement;
  private _contextMenu: HTMLElement | null = null;
  private _onOpenAsset: (asset: ActorAsset) => void;
  private _onOpenStructure: ((asset: StructureAsset) => void) | null = null;
  private _onOpenEnum: ((asset: EnumAsset) => void) | null = null;
  private _onOpenAnimBP: ((asset: AnimBlueprintAsset) => void) | null = null;
  private _onOpenWidgetBP: ((asset: WidgetBlueprintAsset) => void) | null = null;
  private _onOpenGameInstance: ((asset: GameInstanceBlueprintAsset) => void) | null = null;
  private _onOpenMaterial: ((material: MaterialAssetJSON) => void) | null = null;
  private _onDrop: AssetDropCallback;
  private _onMeshDrop: MeshDropCallback | null = null;
  private _selectedAssetId: string | null = null;
  private _currentFolderId: string = 'root';
  private _expandedFolders: Set<string> = new Set(['root']);

  /** Callback to highlight a class in the ClassHierarchyPanel */
  private _onShowInHierarchy: ((id: string, kind: 'actor' | 'widget') => void) | null = null;

  // Custom mouse-drag state (no HTML5 DnD)
  private _dragAsset: ActorAsset | null = null;
  private _dragMeshAsset: MeshAsset | null = null;
  private _dragGhost: HTMLElement | null = null;
  private _dragStarted = false;
  private _startX = 0;
  private _startY = 0;

  constructor(
    container: HTMLElement,
    manager: ActorAssetManager,
    onOpenAsset: (asset: ActorAsset) => void,
    onDrop: AssetDropCallback,
  ) {
    this.container = container;
    this._manager = manager;
    this._folderManager = new ContentFolderManager();
    this._onOpenAsset = onOpenAsset;
    this._onDrop = onDrop;
    this._build();
    this._manager.onChanged(() => this._refreshGrid());
    this._folderManager.onChanged(() => {
      this._refreshTree();
      this._refreshGrid();
    });

    // Global mouse handlers for custom drag
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  /** Get the folder manager (for project save/load) */
  public getFolderManager(): ContentFolderManager {
    return this._folderManager;
  }

  /** Set callback to show an asset in the Class Hierarchy panel */
  public setShowInHierarchyCallback(cb: (id: string, kind: 'actor' | 'widget') => void): void {
    this._onShowInHierarchy = cb;
  }

  /** Wire up StructureAssetManager + callbacks for opening struct/enum editors */
  public setStructureManager(
    mgr: StructureAssetManager,
    onOpenStructure: (asset: StructureAsset) => void,
    onOpenEnum: (asset: EnumAsset) => void,
  ): void {
    this._structManager = mgr;
    this._onOpenStructure = onOpenStructure;
    this._onOpenEnum = onOpenEnum;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  /** Wire up MeshAssetManager + drop callback + material open callback */
  public setMeshManager(mgr: MeshAssetManager, onMeshDrop?: MeshDropCallback, onOpenMaterial?: (material: MaterialAssetJSON) => void): void {
    this._meshManager = mgr;
    this._onMeshDrop = onMeshDrop ?? null;
    this._onOpenMaterial = onOpenMaterial ?? null;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  /** Wire up AnimBlueprintManager + open callback */
  public setAnimBPManager(mgr: AnimBlueprintManager, onOpenAnimBP: (asset: AnimBlueprintAsset) => void): void {
    this._animBPManager = mgr;
    this._onOpenAnimBP = onOpenAnimBP;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  /** Wire up WidgetBlueprintManager + open callback */
  public setWidgetBPManager(mgr: WidgetBlueprintManager, onOpenWidgetBP: (asset: WidgetBlueprintAsset) => void): void {
    this._widgetBPManager = mgr;
    this._onOpenWidgetBP = onOpenWidgetBP;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  /** Wire up GameInstanceBlueprintManager + open callback */
  public setGameInstanceManager(mgr: GameInstanceBlueprintManager, onOpenGameInstance: (asset: GameInstanceBlueprintAsset) => void): void {
    this._gameInstanceManager = mgr;
    this._onOpenGameInstance = onOpenGameInstance;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  private _onMouseMove = (e: MouseEvent) => {
    if (!this._dragAsset && !this._dragMeshAsset) return;
    // Only start showing ghost after 5px movement (avoids accidental drags)
    const dx = e.clientX - this._startX;
    const dy = e.clientY - this._startY;
    if (!this._dragStarted && Math.abs(dx) + Math.abs(dy) < 5) return;
    this._dragStarted = true;

    if (!this._dragGhost) {
      this._dragGhost = document.createElement('div');
      this._dragGhost.className = 'asset-drag-ghost';
      this._dragGhost.textContent = this._dragAsset?.name ?? this._dragMeshAsset?.name ?? '';
      document.body.appendChild(this._dragGhost);
    }
    this._dragGhost.style.left = e.clientX + 12 + 'px';
    this._dragGhost.style.top = e.clientY + 4 + 'px';
  };

  private _onMouseUp = (e: MouseEvent) => {
    if (!this._dragAsset && !this._dragMeshAsset) return;
    const asset = this._dragAsset;
    const meshAsset = this._dragMeshAsset;
    const started = this._dragStarted;
    this._dragAsset = null;
    this._dragMeshAsset = null;
    this._dragStarted = false;
    if (this._dragGhost) {
      this._dragGhost.remove();
      this._dragGhost = null;
    }
    if (started) {
      if (asset) this._onDrop(asset, e.clientX, e.clientY);
      if (meshAsset && this._onMeshDrop) this._onMeshDrop(meshAsset, e.clientX, e.clientY);
    }
  };

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <span>Content Browser</span>
      <div style="display:flex;gap:4px;">
        <div class="content-browser-add" id="ab-import-btn">📦 Import</div>
        <div class="content-browser-add" id="ab-add-btn">+ New</div>
      </div>
    `;
    this.container.appendChild(header);

    // Import button
    header.querySelector('#ab-import-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this._triggerMeshFileImport();
    });

    // New button
    header.querySelector('#ab-add-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showEmptyContextMenu(e as MouseEvent);
    });

    // Body with split layout: tree (left) + grid (right)
    const body = document.createElement('div');
    body.className = 'panel-body content-browser-body';

    // Folder tree (left sidebar)
    this._treeEl = document.createElement('div');
    this._treeEl.className = 'content-browser-tree';
    body.appendChild(this._treeEl);

    // Asset grid (right)
    this._gridEl = document.createElement('div');
    this._gridEl.className = 'asset-grid';
    body.appendChild(this._gridEl);

    this.container.appendChild(body);

    // Drag-and-drop mesh files onto the grid
    this._gridEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._gridEl.classList.add('drag-over');
    });
    this._gridEl.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this._gridEl.classList.remove('drag-over');
    });
    this._gridEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._gridEl.classList.remove('drag-over');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        this._handleMeshFileDrop(e.dataTransfer.files);
      }
    });

    // Right-click on empty space in grid → create new
    this._gridEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showEmptyContextMenu(e);
    });

    // Close context menu on any click
    document.addEventListener('click', () => this._closeContextMenu());

    this._refreshTree();
    this._refreshGrid();
  }

  // ============================================================
  //  Folder Tree Rendering
  // ============================================================

  private _refreshTree(): void {
    this._treeEl.innerHTML = '';
    const rootFolder = this._folderManager.getFolder(this._folderManager.getRootFolderId());
    if (rootFolder) {
      this._renderFolderNode(rootFolder, 0);
    }
  }

  private _renderFolderNode(folder: FolderNode, depth: number): void {
    const isExpanded = this._expandedFolders.has(folder.id);
    const isSelected = this._currentFolderId === folder.id;

    const item = document.createElement('div');
    item.className = 'folder-tree-item' + (isSelected ? ' selected' : '');
    item.style.paddingLeft = `${depth * 16 + 4}px`;

    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.textContent = folder.children.length > 0 ? (isExpanded ? '📂' : '📁') : '📁';

    const label = document.createElement('span');
    label.textContent = folder.name;

    item.appendChild(icon);
    item.appendChild(label);

    // Click = select folder
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (folder.children.length > 0) {
        if (isExpanded) {
          this._expandedFolders.delete(folder.id);
        } else {
          this._expandedFolders.add(folder.id);
        }
      }
      this._currentFolderId = folder.id;
      this._refreshTree();
      this._refreshGrid();
    });

    // Right-click = folder context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showFolderContextMenu(e, folder);
    });

    this._treeEl.appendChild(item);

    // Render children if expanded
    if (isExpanded) {
      const children = this._folderManager.getChildFolders(folder.id);
      for (const child of children) {
        this._renderFolderNode(child, depth + 1);
      }
    }
  }

  // ============================================================
  //  Asset Grid Rendering (Unified, filtered by folder)
  // ============================================================

  private _refreshGrid(): void {
    this._gridEl.innerHTML = '';

    const assetsInFolder = this._folderManager.getAssetsInFolder(this._currentFolderId);

    // Show breadcrumb path
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'content-browser-breadcrumb';
    breadcrumb.textContent = this._folderManager.getFolderPath(this._currentFolderId);
    this._gridEl.appendChild(breadcrumb);

    // Render all asset types in this folder
    for (const location of assetsInFolder) {
      this._renderAssetCard(location.assetId, location.assetType);
    }

    // Empty state
    if (assetsInFolder.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'Empty folder. Right-click to create assets.';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
    }
  }

  private _renderAssetCard(assetId: string, assetType: AssetType): void {
    if (assetType === 'actor') this._renderActorCard(assetId);
    else if (assetType === 'structure') this._renderStructureCard(assetId);
    else if (assetType === 'enum') this._renderEnumCard(assetId);
    else if (assetType === 'mesh') this._renderMeshCard(assetId);
    else if (assetType === 'material') this._renderMaterialCard(assetId);
    else if (assetType === 'animBP') this._renderAnimBPCard(assetId);
    else if (assetType === 'widget') this._renderWidgetCard(assetId);
    else if (assetType === 'gameInstance') this._renderGameInstanceCard(assetId);
  }

  private _renderActorCard(assetId: string): void {
    const asset = this._manager.getAsset(assetId);
    if (!asset) return;

    const card = document.createElement('div');
    card.className = 'asset-card';
    if (this._selectedAssetId === asset.id) card.classList.add('selected');

    const icon = document.createElement('div');
    icon.className = 'asset-card-icon';
    if (asset.actorType === 'characterPawn') {
      icon.innerHTML = '<span style="font-size:28px;">🏃</span>';
    } else if (asset.actorType === 'playerController') {
      icon.innerHTML = '<span style="font-size:28px;">🎮</span>';
    } else if (asset.actorType === 'aiController') {
      icon.innerHTML = '<span style="font-size:28px;">🤖</span>';
    } else {
      icon.innerHTML = this._getMeshIcon(asset.rootMeshType);
    }
    card.appendChild(icon);

    const label = document.createElement('div');
    label.className = 'asset-card-name';
    label.textContent = asset.name;
    card.appendChild(label);

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      this._selectedAssetId = asset.id;
      this._refreshGrid();
    });
    card.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this._onOpenAsset(asset);
    });
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._dragAsset = asset;
      this._dragStarted = false;
      this._startX = e.clientX;
      this._startY = e.clientY;
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._selectedAssetId = asset.id;
      this._refreshGrid();
      this._showAssetContextMenu(e, asset);
    });

    this._gridEl.appendChild(card);
  }

  private _renderStructureCard(assetId: string): void {
    if (!this._structManager) return;
    const sa = this._structManager.getStructure(assetId);
    if (!sa) return;
    const card = this._createTypeCard(
      sa.id, sa.name, '🔷', `${sa.fields.length} fields`,
      () => this._onOpenStructure?.(sa),
      (e) => this._showStructContextMenu(e, sa),
    );
    this._gridEl.appendChild(card);
  }

  private _renderEnumCard(assetId: string): void {
    if (!this._structManager) return;
    const ea = this._structManager.getEnum(assetId);
    if (!ea) return;
    const card = this._createTypeCard(
      ea.id, ea.name, '📋', `${ea.values.length} values`,
      () => this._onOpenEnum?.(ea),
      (e) => this._showEnumContextMenu(e, ea),
    );
    this._gridEl.appendChild(card);
  }

  private _renderMeshCard(assetId: string): void {
    if (!this._meshManager) return;
    const meshAsset = this._meshManager.getAsset(assetId);
    if (!meshAsset) return;

    const card = document.createElement('div');
    card.className = 'asset-card mesh-asset-card';
    if (this._selectedAssetId === meshAsset.id) card.classList.add('selected');

    const thumbEl = document.createElement('div');
    thumbEl.className = 'asset-card-icon mesh-thumbnail';
    if (meshAsset.thumbnail) {
      thumbEl.style.backgroundImage = `url(${meshAsset.thumbnail})`;
      thumbEl.style.backgroundSize = 'cover';
      thumbEl.style.backgroundPosition = 'center';
    } else {
      thumbEl.innerHTML = '<span style="font-size:28px;">📦</span>';
    }
    card.appendChild(thumbEl);

    const label = document.createElement('div');
    label.className = 'asset-card-name';
    label.textContent = meshAsset.name;
    card.appendChild(label);

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      this._selectedAssetId = meshAsset.id;
      this._refreshGrid();
    });
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._dragMeshAsset = meshAsset;
      this._dragStarted = false;
      this._startX = e.clientX;
      this._startY = e.clientY;
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._selectedAssetId = meshAsset.id;
      this._refreshGrid();
      this._showMeshContextMenu(e, meshAsset);
    });

    this._gridEl.appendChild(card);
  }

  private _renderAnimBPCard(assetId: string): void {
    if (!this._animBPManager) return;
    const abp = this._animBPManager.getAsset(assetId);
    if (!abp) return;
    const card = this._createTypeCard(
      abp.id, abp.name, '🎬', `${abp.stateMachine.states.length} states`,
      () => this._onOpenAnimBP?.(abp),
      (e) => this._showAnimBPContextMenu(e, abp),
    );
    this._gridEl.appendChild(card);
  }

  private _renderWidgetCard(assetId: string): void {
    if (!this._widgetBPManager) return;
    const wbp = this._widgetBPManager.getAsset(assetId);
    if (!wbp) return;
    const widgetCount = wbp.widgets.size;
    const card = this._createTypeCard(
      wbp.id, wbp.name, '🎨', `${widgetCount} widget${widgetCount !== 1 ? 's' : ''}`,
      () => this._onOpenWidgetBP?.(wbp),
      (e) => this._showWidgetBPContextMenu(e, wbp),
    );
    this._gridEl.appendChild(card);
  }

  private _renderGameInstanceCard(assetId: string): void {
    if (!this._gameInstanceManager) return;
    const gi = this._gameInstanceManager.getAsset(assetId);
    if (!gi) return;
    const varCount = gi.blueprintData.variables.length;
    const card = this._createTypeCard(
      gi.id, gi.name, '🌐', `${varCount} var${varCount !== 1 ? 's' : ''}`,
      () => this._onOpenGameInstance?.(gi),
      (e) => this._showGameInstanceContextMenu(e, gi),
    );
    this._gridEl.appendChild(card);
  }

  private _showGameInstanceContextMenu(e: MouseEvent, gi: GameInstanceBlueprintAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📝 Open Editor', () => this._onOpenGameInstance?.(gi));
    this._addMenuItem(menu, '✏ Rename', async () => {
      const newName = await this._showNameDialog('Rename Game Instance', gi.name);
      if (newName && newName !== gi.name) {
        this._gameInstanceManager!.renameAsset(gi.id, newName);
      }
    });
    this._addMenuItem(menu, '🗑 Delete', () => {
      if (confirm(`Delete game instance "${gi.name}"?`)) {
        this._gameInstanceManager!.removeAsset(gi.id);
        this._folderManager.removeAsset(gi.id);
      }
    });

    document.body.appendChild(menu);
    this._contextMenu = menu;
    const close = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        this._closeContextMenu();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  private _renderMaterialCard(assetId: string): void {
    if (!this._meshManager) return;
    const mat = this._meshManager.getMaterial(assetId);
    if (!mat) return;

    const card = document.createElement('div');
    card.className = 'asset-card material-asset-card';
    if (this._selectedAssetId === mat.assetId) card.classList.add('selected');

    const iconEl = document.createElement('div');
    iconEl.className = 'asset-card-icon';
    // Show a color preview swatch
    const swatch = document.createElement('div');
    swatch.style.cssText = `width:36px;height:36px;border-radius:50%;border:2px solid var(--border);background:${mat.materialData.baseColor};`;
    if (mat.materialData.metalness > 0.5) {
      swatch.style.background = `linear-gradient(135deg, ${mat.materialData.baseColor}, #888)`;
    }
    iconEl.appendChild(swatch);
    card.appendChild(iconEl);

    const label = document.createElement('div');
    label.className = 'asset-card-name';
    label.textContent = mat.assetName;
    card.appendChild(label);

    const sub = document.createElement('div');
    sub.className = 'asset-card-subtitle';
    sub.textContent = mat.materialData.type;
    card.appendChild(sub);

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      this._selectedAssetId = mat.assetId;
      this._refreshGrid();
    });
    card.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this._onOpenMaterial?.(mat);
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._selectedAssetId = mat.assetId;
      this._refreshGrid();
      this._showMaterialContextMenu(e, mat);
    });

    this._gridEl.appendChild(card);
  }

  // ============================================================
  //  Folder Context Menu
  // ============================================================

  private _showFolderContextMenu(e: MouseEvent, folder: FolderNode): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📁 New Folder', async () => {
      const name = await this._showNameDialog('New Folder', 'NewFolder');
      if (name) {
        this._folderManager.createFolder(name, folder.id);
        this._expandedFolders.add(folder.id);
      }
    });

    if (folder.id !== this._folderManager.getRootFolderId()) {
      this._addMenuItem(menu, '✏ Rename', async () => {
        const name = await this._showNameDialog('Rename Folder', folder.name);
        if (name) this._folderManager.renameFolder(folder.id, name);
      });

      const delItem = this._addMenuItem(menu, '🗑 Delete Folder', () => {
        if (confirm(`Delete folder "${folder.name}"?`)) {
          this._folderManager.deleteFolder(folder.id);
          if (this._currentFolderId === folder.id) {
            this._currentFolderId = folder.parentId || this._folderManager.getRootFolderId();
          }
        }
      });
      delItem.style.color = 'var(--danger)';
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ============================================================
  //  Legacy Grid Methods (kept for reference, can be removed)
  // ============================================================

  private _renderActorGrid(): void {
    const assets = this._manager.assets;

    if (assets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'No actor assets. Click + New';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
      return;
    }

    for (const asset of assets) {
      const card = document.createElement('div');
      card.className = 'asset-card';
      if (this._selectedAssetId === asset.id) {
        card.classList.add('selected');
      }

      // Icon area
      const icon = document.createElement('div');
      icon.className = 'asset-card-icon';
      if (asset.actorType === 'characterPawn') {
        icon.innerHTML = '<span style="font-size:28px;">🏃</span>';
      } else if (asset.actorType === 'playerController') {
        icon.innerHTML = '<span style="font-size:28px;">🎮</span>';
      } else if (asset.actorType === 'aiController') {
        icon.innerHTML = '<span style="font-size:28px;">🤖</span>';
      } else {
        icon.innerHTML = this._getMeshIcon(asset.rootMeshType);
      }
      card.appendChild(icon);

      // Name label
      const label = document.createElement('div');
      label.className = 'asset-card-name';
      label.textContent = asset.name;
      label.title = asset.name;
      card.appendChild(label);

      // Single click → select
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectedAssetId = asset.id;
        this._refreshGrid();
      });

      // Double click → open editor
      card.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._onOpenAsset(asset);
      });

      // Custom mouse-drag (no HTML5 DnD — avoids dockview interference)
      card.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left button only
        this._dragAsset = asset;
        this._dragStarted = false;
        this._startX = e.clientX;
        this._startY = e.clientY;
      });

      // Right-click → context menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._selectedAssetId = asset.id;
        this._refreshGrid();
        this._showAssetContextMenu(e, asset);
      });

      this._gridEl.appendChild(card);
    }
  }

  private _renderStructureGrid(): void {
    if (!this._structManager) return;
    const structs = this._structManager.structures;

    if (structs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'No structures. Click + New to create one.';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
      return;
    }

    for (const sa of structs) {
      const card = this._createTypeCard(
        sa.id, sa.name, '🔷', `${sa.fields.length} fields`,
        () => this._onOpenStructure?.(sa),
        (e) => this._showStructContextMenu(e, sa),
      );
      this._gridEl.appendChild(card);
    }
  }

  private _renderEnumGrid(): void {
    if (!this._structManager) return;
    const enums = this._structManager.enums;

    if (enums.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'No enums. Click + New to create one.';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
      return;
    }

    for (const ea of enums) {
      const card = this._createTypeCard(
        ea.id, ea.name, '📋', `${ea.values.length} values`,
        () => this._onOpenEnum?.(ea),
        (e) => this._showEnumContextMenu(e, ea),
      );
      this._gridEl.appendChild(card);
    }
  }

  // ---- Mesh Grid ----

  private _renderMeshGrid(): void {
    if (!this._meshManager) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'Mesh manager not initialized.';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
      return;
    }

    // Drop zone hint
    const dropZone = document.createElement('div');
    dropZone.className = 'mesh-drop-zone';
    dropZone.innerHTML = '<span>📦 Drag & drop mesh files here<br>or click <b>Import</b></span>';

    // File drag-and-drop support
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer?.files) {
        this._handleMeshFileDrop(e.dataTransfer.files);
      }
    });

    // Also allow drop on the entire grid
    this._gridEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this._gridEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.files) {
        this._handleMeshFileDrop(e.dataTransfer.files);
      }
    });

    const assets = this._meshManager.assets;

    if (assets.length === 0) {
      this._gridEl.appendChild(dropZone);
      return;
    }

    // Show mesh asset cards
    for (const meshAsset of assets) {
      const card = document.createElement('div');
      card.className = 'asset-card mesh-asset-card';
      if (this._selectedAssetId === meshAsset.id) card.classList.add('selected');

      // Thumbnail
      const thumbEl = document.createElement('div');
      thumbEl.className = 'asset-card-icon mesh-thumbnail';
      if (meshAsset.thumbnail) {
        thumbEl.style.backgroundImage = `url(${meshAsset.thumbnail})`;
        thumbEl.style.backgroundSize = 'cover';
        thumbEl.style.backgroundPosition = 'center';
      } else {
        thumbEl.innerHTML = '<span style="font-size:28px;">📦</span>';
      }
      card.appendChild(thumbEl);

      // Name
      const label = document.createElement('div');
      label.className = 'asset-card-name';
      label.textContent = meshAsset.name;
      label.title = meshAsset.name;
      card.appendChild(label);

      // Subtitle (vertex/tri count)
      const sub = document.createElement('div');
      sub.className = 'asset-card-subtitle';
      const verts = meshAsset.meshData.vertexCount.toLocaleString();
      const tris = meshAsset.meshData.triangleCount.toLocaleString();
      sub.textContent = `${verts} verts · ${tris} tris`;
      card.appendChild(sub);

      // Click → select
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectedAssetId = meshAsset.id;
        this._refreshGrid();
      });

      // Mouse drag → drop into scene
      card.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        this._dragMeshAsset = meshAsset;
        this._dragStarted = false;
        this._startX = e.clientX;
        this._startY = e.clientY;
      });

      // Right-click → context menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._selectedAssetId = meshAsset.id;
        this._refreshGrid();
        this._showMeshContextMenu(e, meshAsset);
      });

      this._gridEl.appendChild(card);
    }

    // Append drop zone at end (smaller when assets exist)
    dropZone.classList.add('compact');
    this._gridEl.appendChild(dropZone);
  }

  // ---- Animation Blueprint Grid ----

  private _renderAnimBPGrid(): void {
    if (!this._animBPManager) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'Animation Blueprint manager not initialized.';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
      return;
    }

    const assets = this._animBPManager.assets;

    if (assets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'No animation blueprints. Click + New to create one.';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
      return;
    }

    for (const abp of assets) {
      const card = this._createTypeCard(
        abp.id,
        abp.name,
        '🎬',
        `${abp.stateMachine.states.length} states`,
        () => this._onOpenAnimBP?.(abp),
        (e) => this._showAnimBPContextMenu(e, abp),
      );
      this._gridEl.appendChild(card);
    }
  }

  private _showAnimBPContextMenu(e: MouseEvent, abp: AnimBlueprintAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📝 Open Editor', () => this._onOpenAnimBP?.(abp));
    this._addMenuItem(menu, '✏ Rename', async () => {
      const newName = await this._showNameDialog('Rename Animation Blueprint', abp.name);
      if (newName) this._animBPManager!.renameAsset(abp.id, newName);
    });
    const delItem = this._addMenuItem(menu, '🗑 Delete', () => {
      if (confirm(`Delete animation blueprint "${abp.name}"?`)) {
        this._animBPManager!.removeAsset(abp.id);
        if (this._selectedAssetId === abp.id) this._selectedAssetId = null;
      }
    });
    delItem.style.color = 'var(--danger)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ---- Widget Blueprints Grid ----

  private _renderWidgetBPGrid(): void {
    if (!this._widgetBPManager) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'Widget Blueprint manager not initialized.';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
      return;
    }

    const assets = this._widgetBPManager.assets;

    if (assets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'No widget blueprints. Click + New to create one.';
      empty.style.height = '60px';
      this._gridEl.appendChild(empty);
      return;
    }

    for (const wbp of assets) {
      const widgetCount = wbp.widgets.size;
      const card = this._createTypeCard(
        wbp.id,
        wbp.name,
        '🎨',
        `${widgetCount} widget${widgetCount !== 1 ? 's' : ''}`,
        () => this._onOpenWidgetBP?.(wbp),
        (e) => this._showWidgetBPContextMenu(e, wbp),
      );
      this._gridEl.appendChild(card);
    }
  }

  private _showWidgetBPContextMenu(e: MouseEvent, wbp: WidgetBlueprintAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📝 Open Editor', () => this._onOpenWidgetBP?.(wbp));

    // ── Inheritance: Create Child Widget Class ──
    this._addMenuItem(menu, '➕ Create Child Class', async () => {
      const inh = ClassInheritanceSystem.instance;
      const name = await this._showNameDialog(`Create Child of ${wbp.name}`, `${wbp.name}_Child`);
      if (name) {
        const child = inh.createChildWidget(wbp.id, name);
        if (child) {
          this._folderManager.setAssetLocation(child.id, 'widget', this._currentFolderId);
          this._selectedAssetId = child.id;
          this._refreshGrid();
        }
      }
    });

    // ── Inheritance: Show in Hierarchy ──
    this._addMenuItem(menu, '🌳 Show in Hierarchy', () => {
      (this as any)._onShowInHierarchy?.(wbp.id, 'widget');
    });

    // ── Inheritance: Show Children ──
    const inh = ClassInheritanceSystem.instance;
    const childCount = inh.getWidgetChildren(wbp.id).length;
    if (childCount > 0) {
      this._addMenuItem(menu, `👶 Show Children (${childCount})`, () => {
        (this as any)._onShowInHierarchy?.(wbp.id, 'widget');
      });
    }

    const sep2 = document.createElement('div');
    sep2.className = 'context-menu-separator';
    menu.appendChild(sep2);

    this._addMenuItem(menu, '✏ Rename', async () => {
      const newName = await this._showNameDialog('Rename Widget Blueprint', wbp.name);
      if (newName) this._widgetBPManager!.renameAsset(wbp.id, newName);
    });
    const delItem = this._addMenuItem(menu, '🗑 Delete', () => {
      const inh2 = ClassInheritanceSystem.instance;
      const children = inh2.getWidgetChildren(wbp.id);
      const msg = children.length > 0
        ? `Delete widget "${wbp.name}"? This is a parent class with ${children.length} child(ren). Children will be orphaned.`
        : `Delete widget blueprint "${wbp.name}"?`;
      if (confirm(msg)) {
        inh2.unregisterWidget(wbp.id);
        this._widgetBPManager!.removeAsset(wbp.id);
        if (this._selectedAssetId === wbp.id) this._selectedAssetId = null;
      }
    });
    delItem.style.color = 'var(--danger)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ---- Mesh Import ----

  private _triggerMeshFileImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gltf,.glb,.fbx,.obj,.dae,.stl,.ply';
    input.multiple = true;
    // Must be in the DOM for Tauri WebView to reliably fire the change event
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        this._handleMeshFileDrop(input.files);
      }
      // Clean up — remove from DOM after the event fires
      input.remove();
    });
    // Also clean up if user cancels the picker (no change event fires)
    // Use a focus-back heuristic: when the window regains focus after the picker
    // closes, if the input is still in the DOM with no files, remove it.
    const cleanup = () => {
      setTimeout(() => {
        if (input.parentNode && (!input.files || input.files.length === 0)) {
          input.remove();
        }
      }, 300);
      window.removeEventListener('focus', cleanup);
    };
    window.addEventListener('focus', cleanup);
    input.click();
  }

  private async _handleMeshFileDrop(fileList: FileList): Promise<void> {
    if (!this._meshManager) return;

    // Collect importable files and extra files (like .mtl)
    const importables: File[] = [];
    const extras = new Map<string, File>();

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (isImportableFile(file.name)) {
        importables.push(file);
      } else {
        extras.set(file.name, file);
      }
    }

    if (importables.length === 0) return;

    for (const file of importables) {
      // Pre-scan file to detect content and get recommendations
      let detectedInfo;
      try {
        detectedInfo = await detectFileContent(file, extras.size > 0 ? extras : undefined);
      } catch (err) {
        console.warn('[Import] File detection failed for', file.name, err);
        // Proceed without detection info — dialog will still show
      }

      // Show import dialog with detection info
      const dialogResult = await showImportDialog(file, detectedInfo);
      if (dialogResult.cancelled) continue;

      // Show progress with step tracking
      const progress = showImportProgress();

      try {
        const result = await importMeshFile(
          file,
          dialogResult.settings,
          extras.size > 0 ? extras : undefined,
          (msg) => progress.update(msg),
          (step, totalSteps, msg) => {
            const pct = Math.round((step / totalSteps) * 100);
            progress.update(msg, pct);
          },
        );

        // Show warnings from import report
        if (result.report.warnings.length > 0) {
          console.warn('[MeshImport] Warnings:', result.report.warnings);
        }

        // Add to mesh manager
        this._meshManager.addImportedAsset(
          result.meshAsset,
          result.materials,
          result.textures,
          result.animations,
        );

        // Register in folder manager
        this._folderManager.setAssetLocation(result.meshAsset.assetId, 'mesh', this._currentFolderId);

        // Auto-register imported materials in folder (UE-style: materials are first-class assets)
        for (const mat of result.materials) {
          this._folderManager.setAssetLocation(mat.assetId, 'material', this._currentFolderId);
        }

        const duration = (result.report.duration / 1000).toFixed(1);
        progress.update(`Import complete in ${duration}s!`, 100);
        setTimeout(() => progress.close(), 1200);
      } catch (err: any) {
        progress.close();
        console.error('[MeshImport] Failed:', err);
        alert(`Failed to import ${file.name}:\n${err.message || err}`);
      }
    }

    this._refreshGrid();
  }

  private _showMeshContextMenu(e: MouseEvent, meshAsset: MeshAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '✏ Rename', async () => {
      const newName = await this._showNameDialog('Rename Mesh Asset', meshAsset.name);
      if (newName) this._meshManager!.renameAsset(meshAsset.id, newName);
    });

    // Info row
    const infoItem = document.createElement('div');
    infoItem.className = 'context-menu-item';
    infoItem.style.opacity = '0.6';
    infoItem.style.fontSize = '11px';
    infoItem.style.cursor = 'default';
    infoItem.textContent = `${meshAsset.assetType} · ${meshAsset.sourceFile}`;
    menu.appendChild(infoItem);

    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    menu.appendChild(sep);

    const delItem = this._addMenuItem(menu, '🗑 Delete', () => {
      if (confirm(`Delete mesh asset "${meshAsset.name}"?`)) {
        this._meshManager!.removeAsset(meshAsset.id);
        if (this._selectedAssetId === meshAsset.id) this._selectedAssetId = null;
      }
    });
    delItem.style.color = 'var(--danger)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _showMaterialContextMenu(e: MouseEvent, mat: MaterialAssetJSON): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📝 Open Editor', () => {
      this._onOpenMaterial?.(mat);
    });

    this._addMenuItem(menu, '✏ Rename', async () => {
      const newName = await this._showNameDialog('Rename Material', mat.assetName);
      if (newName) {
        mat.assetName = newName;
        this._refreshGrid();
      }
    });

    // Info row
    const infoItem = document.createElement('div');
    infoItem.className = 'context-menu-item';
    infoItem.style.opacity = '0.6';
    infoItem.style.fontSize = '11px';
    infoItem.style.cursor = 'default';
    infoItem.textContent = `${mat.materialData.type} · ${mat.materialData.baseColor}`;
    menu.appendChild(infoItem);

    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    menu.appendChild(sep);

    const delItem = this._addMenuItem(menu, '🗑 Delete', () => {
      if (confirm(`Delete material "${mat.assetName}"?`)) {
        const idx = this._meshManager!.allMaterials.findIndex(m => m.assetId === mat.assetId);
        if (idx >= 0) this._meshManager!.allMaterials.splice(idx, 1);
        this._folderManager.removeAssetLocation(mat.assetId, 'material');
        if (this._selectedAssetId === mat.assetId) this._selectedAssetId = null;
        this._refreshGrid();
      }
    });
    delItem.style.color = 'var(--danger)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _createTypeCard(
    id: string, name: string, icon: string, subtitle: string,
    onOpen: () => void, onContextMenu: (e: MouseEvent) => void,
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'asset-card';
    if (this._selectedAssetId === id) card.classList.add('selected');

    const iconEl = document.createElement('div');
    iconEl.className = 'asset-card-icon';
    iconEl.innerHTML = `<span class="asset-icon-glyph">${icon}</span>`;
    card.appendChild(iconEl);

    const labelEl = document.createElement('div');
    labelEl.className = 'asset-card-name';
    labelEl.textContent = name;
    labelEl.title = `${name} — ${subtitle}`;
    card.appendChild(labelEl);

    const subEl = document.createElement('div');
    subEl.className = 'asset-card-subtitle';
    subEl.textContent = subtitle;
    card.appendChild(subEl);

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      this._selectedAssetId = id;
      this._refreshGrid();
    });
    card.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      onOpen();
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._selectedAssetId = id;
      this._refreshGrid();
      onContextMenu(e);
    });

    return card;
  }

  // ---- Structure/Enum Context Menus ----

  private _showStructContextMenu(e: MouseEvent, sa: StructureAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📝 Open Editor', () => this._onOpenStructure?.(sa));
    this._addMenuItem(menu, '✏ Rename', async () => {
      const newName = await this._showNameDialog('Rename Structure', sa.name);
      if (newName) this._structManager!.renameStructure(sa.id, newName);
    });
    const delItem = this._addMenuItem(menu, '🗑 Delete', () => {
      if (confirm(`Delete structure "${sa.name}"?`)) {
        this._structManager!.removeStructure(sa.id);
        if (this._selectedAssetId === sa.id) this._selectedAssetId = null;
      }
    });
    delItem.style.color = 'var(--danger)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _showEnumContextMenu(e: MouseEvent, ea: EnumAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📝 Open Editor', () => this._onOpenEnum?.(ea));
    this._addMenuItem(menu, '✏ Rename', async () => {
      const newName = await this._showNameDialog('Rename Enum', ea.name);
      if (newName) this._structManager!.renameEnum(ea.id, newName);
    });
    const delItem = this._addMenuItem(menu, '🗑 Delete', () => {
      if (confirm(`Delete enum "${ea.name}"?`)) {
        this._structManager!.removeEnum(ea.id);
        if (this._selectedAssetId === ea.id) this._selectedAssetId = null;
      }
    });
    delItem.style.color = 'var(--danger)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _getMeshIcon(meshType: string): string {
    switch (meshType) {
      case 'cube': return '<span class="asset-icon-glyph">⬡</span>';
      case 'sphere': return '<span class="asset-icon-glyph">●</span>';
      case 'cylinder': return '<span class="asset-icon-glyph">◎</span>';
      case 'plane': return '<span class="asset-icon-glyph">▬</span>';
      default: return '<span class="asset-icon-glyph">⬡</span>';
    }
  }

  private async _createNewAsset(actorType: ActorType = 'actor'): Promise<void> {
    const defaultNames: Record<string, string> = {
      actor: 'BP_NewActor',
      characterPawn: 'BP_CharacterPawn',
      playerController: 'BP_PlayerController',
      aiController: 'BP_AIController',
    };
    const titles: Record<string, string> = {
      actor: 'New Actor Asset',
      characterPawn: 'New Character Pawn',
      playerController: 'New Player Controller',
      aiController: 'New AI Controller',
    };
    const defaultName = defaultNames[actorType] || 'BP_NewActor';
    const title = titles[actorType] || 'New Actor Asset';
    const name = await this._promptName(title, defaultName);
    if (!name) return;
    const asset = this._manager.createAsset(name, actorType);
    this._folderManager.setAssetLocation(asset.id, 'actor', this._currentFolderId);
    this._selectedAssetId = asset.id;
  }

  private async _promptName(title: string, defaultValue: string): Promise<string | null> {
    // Use a simple overlay dialog
    return await this._showNameDialog(title, defaultValue);
  }

  private _showNameDialog(title: string, defaultValue: string): Promise<string | null> {
    return new Promise((resolve) => {
      // Create custom dialog overlay (works reliably on macOS in Tauri)
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: var(--bg-secondary, #1e1e1e);
        border: 1px solid var(--border, #444);
        border-radius: 6px;
        padding: 20px;
        min-width: 400px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      `;

      const titleEl = document.createElement('div');
      titleEl.textContent = title;
      titleEl.style.cssText = `
        font-size: 14px;
        margin-bottom: 12px;
        color: var(--text, #fff);
      `;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = defaultValue;
      input.style.cssText = `
        width: 100%;
        padding: 8px;
        font-size: 13px;
        background: var(--bg-primary, #252525);
        border: 1px solid var(--border, #444);
        border-radius: 4px;
        color: var(--text, #fff);
        outline: none;
        box-sizing: border-box;
      `;

      const buttons = document.createElement('div');
      buttons.style.cssText = `
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 16px;
      `;

      const btnCancel = document.createElement('button');
      btnCancel.textContent = 'Cancel';
      btnCancel.style.cssText = `
        padding: 6px 16px;
        background: transparent;
        border: 1px solid var(--border, #444);
        border-radius: 4px;
        color: var(--text, #fff);
        cursor: pointer;
        font-size: 13px;
      `;

      const btnOk = document.createElement('button');
      btnOk.textContent = 'OK';
      btnOk.style.cssText = `
        padding: 6px 16px;
        background: var(--accent, #007acc);
        border: none;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        font-size: 13px;
      `;

      buttons.appendChild(btnCancel);
      buttons.appendChild(btnOk);

      dialog.appendChild(titleEl);
      dialog.appendChild(input);
      dialog.appendChild(buttons);
      overlay.appendChild(dialog);

      const finish = (value: string | null) => {
        overlay.remove();
        const result = value && value.trim() ? value.trim() : null;
        resolve(result);
      };

      btnOk.addEventListener('click', () => finish(input.value));
      btnCancel.addEventListener('click', () => finish(null));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(null);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(input.value);
        if (e.key === 'Escape') finish(null);
      });

      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  // ---- Context Menus ----

  private _showEmptyContextMenu(e: MouseEvent): void {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📁 New Folder', async () => {
      const name = await this._showNameDialog('New Folder', 'NewFolder');
      if (name) {
        this._folderManager.createFolder(name, this._currentFolderId);
        this._expandedFolders.add(this._currentFolderId);
      }
    });

    const sep0 = document.createElement('div');
    sep0.className = 'context-menu-separator';
    menu.appendChild(sep0);

    this._addMenuItem(menu, '⬡ New Actor Blueprint', () => this._createNewAsset());
    this._addMenuItem(menu, '🏃 New Character Pawn', () => this._createNewAsset('characterPawn'));
    this._addMenuItem(menu, '🎮 New Player Controller', () => this._createNewAsset('playerController'));
    this._addMenuItem(menu, '🤖 New AI Controller', () => this._createNewAsset('aiController'));

    if (this._structManager) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);

      this._addMenuItem(menu, '🔷 New Structure', async () => {
        const name = await this._showNameDialog('New Structure', 'F_NewStruct');
        if (name) {
          const sa = this._structManager!.createStructure(name);
          this._folderManager.setAssetLocation(sa.id, 'structure', this._currentFolderId);
          this._selectedAssetId = sa.id;
          if (this._onOpenStructure) this._onOpenStructure(sa);
        }
      });

      this._addMenuItem(menu, '📋 New Enumeration', async () => {
        const name = await this._showNameDialog('New Enum', 'E_NewEnum');
        if (name) {
          const ea = this._structManager!.createEnum(name);
          this._folderManager.setAssetLocation(ea.id, 'enum', this._currentFolderId);
          this._selectedAssetId = ea.id;
          if (this._onOpenEnum) this._onOpenEnum(ea);
        }
      });
    }

    if (this._animBPManager) {
      const sepAnimBP = document.createElement('div');
      sepAnimBP.className = 'context-menu-separator';
      menu.appendChild(sepAnimBP);

      this._addMenuItem(menu, '🎬 New Animation Blueprint', async () => {
        const name = await this._showNameDialog('New Animation Blueprint', 'ABP_NewAnimBP');
        if (name) {
          const abp = this._animBPManager!.createAsset(name);
          this._folderManager.setAssetLocation(abp.id, 'animBP', this._currentFolderId);
          this._selectedAssetId = abp.id;
          if (this._onOpenAnimBP) this._onOpenAnimBP(abp);
        }
      });
    }

    if (this._widgetBPManager) {
      this._addMenuItem(menu, '🎨 New Widget Blueprint', async () => {
        const name = await this._showNameDialog('New Widget Blueprint', 'WBP_NewWidget');
        if (name) {
          const wbp = this._widgetBPManager!.createAsset(name);
          this._folderManager.setAssetLocation(wbp.id, 'widget', this._currentFolderId);
          this._selectedAssetId = wbp.id;
          if (this._onOpenWidgetBP) this._onOpenWidgetBP(wbp);
        }
      });
    }

    if (this._gameInstanceManager) {
      const sepGI = document.createElement('div');
      sepGI.className = 'context-menu-separator';
      menu.appendChild(sepGI);

      this._addMenuItem(menu, '🌐 New Game Instance', async () => {
        const name = await this._showNameDialog('New Game Instance', 'GI_Default');
        if (name) {
          const gi = this._gameInstanceManager!.createAsset(name);
          this._folderManager.setAssetLocation(gi.id, 'gameInstance', this._currentFolderId);
          this._selectedAssetId = gi.id;
          if (this._onOpenGameInstance) this._onOpenGameInstance(gi);
        }
      });
    }

    if (this._meshManager) {
      const sepMesh = document.createElement('div');
      sepMesh.className = 'context-menu-separator';
      menu.appendChild(sepMesh);

      this._addMenuItem(menu, '🎨 New Material', async () => {
        const name = await this._showNameDialog('New Material', 'M_NewMaterial');
        if (name) {
          const matId = `mat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const newMat: MaterialAssetJSON = {
            assetId: matId,
            assetName: name,
            meshAssetId: '',
            materialData: {
              type: 'PBR',
              baseColor: '#808080',
              metalness: 0,
              roughness: 0.8,
              emissive: '#000000',
              emissiveIntensity: 0,
              opacity: 1,
              doubleSided: false,
              alphaMode: 'OPAQUE',
              baseColorMap: null,
              normalMap: null,
              metallicRoughnessMap: null,
              emissiveMap: null,
              occlusionMap: null,
            },
          };
          this._meshManager!.allMaterials.push(newMat);
          this._folderManager.setAssetLocation(matId, 'material', this._currentFolderId);
          this._selectedAssetId = matId;
          this._refreshGrid();
          this._onOpenMaterial?.(newMat);
        }
      });

      this._addMenuItem(menu, '📦 Import Mesh…', () => this._triggerMeshFileImport());
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _showAssetContextMenu(e: MouseEvent, asset: ActorAsset): void {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, '📝 Open Editor', () => {
      this._onOpenAsset(asset);
    });

    // ── Inheritance: Create Child Class ──
    this._addMenuItem(menu, '➕ Create Child Class', async () => {
      const inh = ClassInheritanceSystem.instance;
      const name = await this._showNameDialog(`Create Child of ${asset.name}`, `${asset.name}_Child`);
      if (name) {
        const child = inh.createChildActor(asset.id, name);
        if (child) {
          this._folderManager.setAssetLocation(child.id, 'actor', this._currentFolderId);
          this._selectedAssetId = child.id;
          this._refreshGrid();
        }
      }
    });

    // ── Inheritance: Show in Hierarchy ──
    this._addMenuItem(menu, '🌳 Show in Hierarchy', () => {
      (this as any)._onShowInHierarchy?.(asset.id, 'actor');
    });

    // ── Inheritance: Show Children ──
    const inh = ClassInheritanceSystem.instance;
    const childCount = inh.getActorChildren(asset.id).length;
    if (childCount > 0) {
      this._addMenuItem(menu, `👶 Show Children (${childCount})`, () => {
        (this as any)._onShowInHierarchy?.(asset.id, 'actor');
      });
    }

    // ── Inheritance: Change Parent Class ──
    const entry = inh.getActorEntry(asset.id);
    if (entry) {
      this._addMenuItem(menu, '🔄 Change Parent Class', async () => {
        const allActors = this._manager.assets.filter(a => a.id !== asset.id);
        const parentOptions = allActors.map(a => ({ id: a.id, name: a.name }));
        // Simple prompt-based reparent
        const parentNames = ['None', ...parentOptions.map(p => p.name)];
        const choice = prompt(`Reparent "${asset.name}" to:\n${parentNames.map((n,i) => `${i}. ${n}`).join('\n')}\n\nEnter number:`);
        if (choice !== null) {
          const idx = parseInt(choice);
          const newParentId = idx === 0 ? null : parentOptions[idx - 1]?.id ?? null;
          await inh.reparentActor(asset.id, newParentId);
          this._refreshGrid();
        }
      });
    }

    const sep2 = document.createElement('div');
    sep2.className = 'context-menu-separator';
    menu.appendChild(sep2);

    this._addMenuItem(menu, '✏ Rename', async () => {
      const newName = await this._showNameDialog('Rename Actor', asset.name);
      if (newName) {
        this._manager.renameAsset(asset.id, newName);
      }
    });

    this._addMenuItem(menu, '📋 Duplicate', () => {
      const json = asset.toJSON();
      const dup = this._manager.createAsset(asset.name + '_Copy', asset.actorType);
      // Copy blueprint data
      const src = asset.blueprintData;
      const dst = dup.blueprintData;
      dst.variables = structuredClone(src.variables);
      dst.functions = structuredClone(src.functions);
      dst.macros = structuredClone(src.macros);
      dst.customEvents = structuredClone(src.customEvents);
      dst.structs = structuredClone(src.structs);
      dup.rootMeshType = asset.rootMeshType;
      dup.components = structuredClone(asset.components);
      dup.controllerClass = asset.controllerClass;
      dup.controllerBlueprintId = asset.controllerBlueprintId;
      if (asset.characterPawnConfig) {
        dup.characterPawnConfig = structuredClone(asset.characterPawnConfig);
      }
      this._manager.notifyAssetChanged(dup.id);
    });

    const delItem = this._addMenuItem(menu, '🗑 Delete', () => {
      const inh2 = ClassInheritanceSystem.instance;
      const children = inh2.getActorChildren(asset.id);
      const msg = children.length > 0
        ? `Delete actor "${asset.name}"? This is a parent class with ${children.length} child(ren). Children will be orphaned.`
        : `Delete actor "${asset.name}"?`;
      if (confirm(msg)) {
        inh2.unregisterActor(asset.id);
        this._manager.removeAsset(asset.id);
        if (this._selectedAssetId === asset.id) {
          this._selectedAssetId = null;
        }
      }
    });
    delItem.style.color = 'var(--danger)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _addMenuItem(menu: HTMLElement, text: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = text;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._closeContextMenu();
      onClick();
    });
    menu.appendChild(item);
    return item;
  }

  private _closeContextMenu(): void {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }
}
