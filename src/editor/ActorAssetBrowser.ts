// ============================================================
//  ActorAssetBrowser — UE5-style Content Browser
//  Complete overhaul with:
//    - Toolbar with navigation, breadcrumbs, import/new, view toggles
//    - Search, filter, sort
//    - Resizable folder tree with chevrons and badges
//    - Unified asset grid with type-color borders
//    - List view with sortable columns
//    - Multi-selection (Ctrl/Shift/Ctrl+A)
//    - Hover preview
//    - Keyboard shortcuts
//    - Status bar with thumbnail slider
// ============================================================

import { ActorAssetManager, type ActorAsset, type ActorType } from './ActorAsset';
import { StructureAssetManager, type StructureAsset, type EnumAsset } from './StructureAsset';
import { MeshAssetManager, type MeshAsset, type MaterialAssetJSON, isImportableFile } from './MeshAsset';
import { AnimBlueprintManager, type AnimBlueprintAsset } from './AnimBlueprintData';
import { WidgetBlueprintManager, type WidgetBlueprintAsset } from './WidgetBlueprintData';
import { GameInstanceBlueprintManager, type GameInstanceBlueprintAsset } from './GameInstanceData';
import { SaveGameAssetManager, type SaveGameAsset } from './SaveGameAsset';
import { ContentFolderManager, type AssetType, type FolderNode } from './ContentFolderManager';
import { importMeshFile, detectFileContent } from './MeshImporter';
import { showImportDialog, showImportProgress, showTextureImportDialog } from './ImportDialog';
import { TextureLibrary } from './TextureLibrary';
import { SoundLibrary, type SoundCueData, type SoundAssetData } from './SoundLibrary';
import { ClassInheritanceSystem } from './ClassInheritanceSystem';
import { createParentSelector } from './InheritanceDialogsUI';
import { iconHTML, Icons, ICON_COLORS, createIcon } from './icons';

// ── Type exports (preserved) ──

export type AssetDropCallback = (asset: ActorAsset, mouseX: number, mouseY: number) => void;
export type MeshDropCallback = (meshAsset: MeshAsset, mouseX: number, mouseY: number) => void;
export type ContentBrowserTab = 'Actors' | 'Structures' | 'Enums' | 'Meshes' | 'AnimBP' | 'Widgets' | 'Materials' | 'Textures';

// ── Asset metadata constants ──

const ASSET_TYPE_META: Record<AssetType, { color: string; icon: any[]; label: string }> = {
  actor:        { color: '#60a5fa', icon: Icons.Box,          label: 'Blueprint' },
  structure:    { color: '#a78bfa', icon: Icons.FileText,     label: 'Structure' },
  enum:         { color: '#a1a1aa', icon: Icons.List,         label: 'Enum' },
  mesh:         { color: '#60a5fa', icon: Icons.Box,          label: 'Static Mesh' },
  material:     { color: '#c084fc', icon: Icons.CircleDot,    label: 'Material' },
  animBP:       { color: '#fbbf24', icon: Icons.Clapperboard, label: 'Anim Blueprint' },
  widget:       { color: '#67e8f9', icon: Icons.Palette,      label: 'Widget' },
  gameInstance: { color: '#c084fc', icon: Icons.Circle,       label: 'Game Instance' },
  saveGame:     { color: '#FF7043', icon: Icons.Save,         label: 'Save Game' },
  texture:      { color: '#4ade80', icon: Icons.Image,        label: 'Texture' },
  animation:    { color: '#fbbf24', icon: Icons.Play,         label: 'Animation' },
  sound:        { color: '#E91E63', icon: Icons.Volume2,      label: 'Sound' },
  soundCue:     { color: '#FF5722', icon: Icons.Volume2,      label: 'Sound Cue' },
};

function escapeCtxHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface AssetCardInfo {
  id: string;
  name: string;
  type: AssetType;
  typeColor: string;
  typeLabel: string;
  icon: any[];
  iconColor: string;
  thumbnail: string | null;
  subtitle: string;
  onOpen: () => void;
  onContextMenu: (e: MouseEvent) => void;
  dragKind: 'actor' | 'mesh' | null;
  dragPayload: any;
  /** Extra thumbnail element (e.g. material swatch) */
  customThumb?: HTMLElement;
}

// ============================================================

export class ActorAssetBrowser {
  public container: HTMLElement;

  // ── Managers (preserved) ──
  private _manager: ActorAssetManager;
  private _structManager: StructureAssetManager | null = null;
  private _meshManager: MeshAssetManager | null = null;
  private _animBPManager: AnimBlueprintManager | null = null;
  private _widgetBPManager: WidgetBlueprintManager | null = null;
  private _gameInstanceManager: GameInstanceBlueprintManager | null = null;
  private _saveGameManager: SaveGameAssetManager | null = null;
  private _folderManager: ContentFolderManager;

  // ── Callbacks (preserved) ──
  private _onOpenAsset: (asset: ActorAsset) => void;
  private _onOpenStructure: ((asset: StructureAsset) => void) | null = null;
  private _onOpenEnum: ((asset: EnumAsset) => void) | null = null;
  private _onOpenAnimBP: ((asset: AnimBlueprintAsset) => void) | null = null;
  private _onOpenWidgetBP: ((asset: WidgetBlueprintAsset) => void) | null = null;
  private _onOpenGameInstance: ((asset: GameInstanceBlueprintAsset) => void) | null = null;
  private _onOpenSaveGame: ((asset: SaveGameAsset) => void) | null = null;
  private _onOpenMaterial: ((material: MaterialAssetJSON) => void) | null = null;
  private _onOpenSoundCue: ((cue: SoundCueData) => void) | null = null;
  private _onDrop: AssetDropCallback;
  private _onMeshDrop: MeshDropCallback | null = null;
  private _onShowInHierarchy: ((id: string, kind: 'actor' | 'widget') => void) | null = null;

  // ── Drag system (preserved — no HTML5 DnD) ──
  private _dragAsset: ActorAsset | null = null;
  private _dragMeshAsset: MeshAsset | null = null;
  private _dragGhost: HTMLElement | null = null;
  private _dragStarted = false;
  private _startX = 0;
  private _startY = 0;

  // ── Selection ──
  private _selectedIds: Set<string> = new Set();
  private _lastClickedId: string | null = null;

  // ── View state ──
  private _viewMode: 'grid' | 'list' = 'grid';
  private _thumbnailSize: number = 80;
  private _searchQuery: string = '';
  private _activeFilters: Set<AssetType> = new Set();
  private _sortBy: 'name' | 'type' | 'date' = 'name';
  private _sortAsc: boolean = true;

  // ── Navigation history ──
  private _navHistory: string[] = ['root'];
  private _navIndex: number = 0;
  private _isNavigating = false;

  // ── Folder state ──
  private _currentFolderId: string = 'root';
  private _expandedFolders: Set<string> = new Set(['root']);
  private _treeWidth: number = 200;

  // ── DOM refs ──
  private _treeEl!: HTMLElement;
  private _gridEl!: HTMLElement;
  private _breadcrumbEl!: HTMLElement;
  private _searchInput!: HTMLInputElement;
  private _filterBar!: HTMLElement;
  private _statusBar!: HTMLElement;
  private _toolbarEl!: HTMLElement;
  private _backBtn!: HTMLElement;
  private _fwdBtn!: HTMLElement;
  private _contextMenu: HTMLElement | null = null;

  // ── Hover preview ──
  private _previewTimer: ReturnType<typeof setTimeout> | null = null;
  private _previewEl: HTMLElement | null = null;
  private _previewPinned = false;

  // ── Filtered/sorted asset cache (refreshed each render) ──
  private _visibleAssets: { assetId: string; assetType: AssetType }[] = [];

  // ============================================================
  //  Constructor (preserved signature)
  // ============================================================

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

  // ============================================================
  //  Public API (preserved)
  // ============================================================

  public getFolderManager(): ContentFolderManager {
    return this._folderManager;
  }

  public setShowInHierarchyCallback(cb: (id: string, kind: 'actor' | 'widget') => void): void {
    this._onShowInHierarchy = cb;
  }

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

  public setMeshManager(mgr: MeshAssetManager, onMeshDrop?: MeshDropCallback, onOpenMaterial?: (material: MaterialAssetJSON) => void): void {
    this._meshManager = mgr;
    this._onMeshDrop = onMeshDrop ?? null;
    this._onOpenMaterial = onOpenMaterial ?? null;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  public setAnimBPManager(mgr: AnimBlueprintManager, onOpenAnimBP: (asset: AnimBlueprintAsset) => void): void {
    this._animBPManager = mgr;
    this._onOpenAnimBP = onOpenAnimBP;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  public setWidgetBPManager(mgr: WidgetBlueprintManager, onOpenWidgetBP: (asset: WidgetBlueprintAsset) => void): void {
    this._widgetBPManager = mgr;
    this._onOpenWidgetBP = onOpenWidgetBP;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  public setGameInstanceManager(mgr: GameInstanceBlueprintManager, onOpenGameInstance: (asset: GameInstanceBlueprintAsset) => void): void {
    this._gameInstanceManager = mgr;
    this._onOpenGameInstance = onOpenGameInstance;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  public setSaveGameManager(mgr: SaveGameAssetManager, onOpenSaveGame: (asset: SaveGameAsset) => void): void {
    this._saveGameManager = mgr;
    this._onOpenSaveGame = onOpenSaveGame;
    mgr.onChanged(() => this._refreshGrid());
    this._refreshGrid();
  }

  public setSoundLibraryCallbacks(onOpenSoundCue: (cue: SoundCueData) => void): void {
    this._onOpenSoundCue = onOpenSoundCue;
    const soundLib = SoundLibrary.instance;
    if (soundLib) {
      soundLib.onChanged(() => this._refreshGrid());
    }
    this._refreshGrid();
  }

  // ============================================================
  //  Drag System (preserved — custom, no HTML5 DnD)
  // ============================================================

  private _onMouseMove = (e: MouseEvent) => {
    if (!this._dragAsset && !this._dragMeshAsset) return;
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
    if (this._dragGhost) { this._dragGhost.remove(); this._dragGhost = null; }
    if (started) {
      if (asset) this._onDrop(asset, e.clientX, e.clientY);
      if (meshAsset && this._onMeshDrop) this._onMeshDrop(meshAsset, e.clientX, e.clientY);
    }
  };

  // ============================================================
  //  Build Layout
  // ============================================================

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'cb-root';
    this.container.setAttribute('tabindex', '0');

    // Toolbar row
    this._toolbarEl = this._buildToolbar();
    this.container.appendChild(this._toolbarEl);

    // Filter bar row
    this._filterBar = this._buildFilterBar();
    this.container.appendChild(this._filterBar);

    // Body: tree + resizer + asset area
    const body = document.createElement('div');
    body.className = 'cb-body';

    this._treeEl = document.createElement('div');
    this._treeEl.className = 'cb-tree';
    this._treeEl.style.width = this._treeWidth + 'px';
    body.appendChild(this._treeEl);

    const resizer = document.createElement('div');
    resizer.className = 'cb-tree-resizer';
    this._setupTreeResize(resizer);
    body.appendChild(resizer);

    this._gridEl = document.createElement('div');
    this._gridEl.className = 'cb-assets';
    this._gridEl.style.setProperty('--cb-thumb-size', this._thumbnailSize + 'px');
    body.appendChild(this._gridEl);

    this.container.appendChild(body);

    // Status bar
    this._statusBar = this._buildStatusBar();
    this.container.appendChild(this._statusBar);

    // Wire file drop on asset area
    this._setupFileDrop();

    // Right-click on empty space
    this._gridEl.addEventListener('contextmenu', (e) => {
      // Only fire if clicking on the grid background, not a card
      if ((e.target as HTMLElement).closest('.cb-card, .cb-list-row')) return;
      e.preventDefault();
      e.stopPropagation();
      this._showEmptyContextMenu(e);
    });

    // Click empty space to deselect
    this._gridEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.cb-card, .cb-list-row')) return;
      this._selectedIds.clear();
      this._lastClickedId = null;
      this._refreshGrid();
    });

    // Keyboard shortcuts
    this.container.addEventListener('keydown', this._onKeyDown);

    // Close context menu on any click
    document.addEventListener('click', () => this._closeContextMenu());

    this._refreshTree();
    this._refreshGrid();
  }

  // ============================================================
  //  Toolbar
  // ============================================================

  private _buildToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'cb-toolbar';

    // Navigation buttons
    const navGroup = document.createElement('div');
    navGroup.className = 'cb-toolbar-group';

    this._backBtn = this._makeToolbarBtn(Icons.ArrowLeft, 'Back (Alt+←)', () => this._goBack());
    this._fwdBtn = this._makeToolbarBtn(Icons.ArrowRight, 'Forward (Alt+→)', () => this._goForward());
    const upBtn = this._makeToolbarBtn(Icons.ArrowUp, 'Up (Backspace)', () => this._goUp());
    navGroup.append(this._backBtn, this._fwdBtn, upBtn);
    bar.appendChild(navGroup);

    // Separator
    bar.appendChild(this._makeSep());

    // Breadcrumbs
    this._breadcrumbEl = document.createElement('div');
    this._breadcrumbEl.className = 'cb-breadcrumbs';
    bar.appendChild(this._breadcrumbEl);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Import button
    const importBtn = document.createElement('div');
    importBtn.className = 'cb-toolbar-action';
    importBtn.innerHTML = `${iconHTML(Icons.Upload, 12, ICON_COLORS.muted)} Import`;
    importBtn.title = 'Import assets';
    importBtn.addEventListener('click', (e) => { e.stopPropagation(); this._showImportMenu(e); });
    bar.appendChild(importBtn);

    // + New button
    const newBtn = document.createElement('div');
    newBtn.className = 'cb-toolbar-action cb-toolbar-action-primary';
    newBtn.innerHTML = `${iconHTML(Icons.Plus, 12)} New`;
    newBtn.title = 'Create new asset (Ctrl+N)';
    newBtn.addEventListener('click', (e) => { e.stopPropagation(); this._showEmptyContextMenu(e); });
    bar.appendChild(newBtn);

    bar.appendChild(this._makeSep());

    // View toggles
    const viewGroup = document.createElement('div');
    viewGroup.className = 'cb-toolbar-group';

    const gridBtn = this._makeToolbarBtn(Icons.Grid2x2, 'Grid view', () => { this._viewMode = 'grid'; this._refreshGrid(); });
    const listBtn = this._makeToolbarBtn(Icons.List, 'List view', () => { this._viewMode = 'list'; this._refreshGrid(); });
    viewGroup.append(gridBtn, listBtn);
    bar.appendChild(viewGroup);

    return bar;
  }

  private _makeToolbarBtn(icon: any[], tooltip: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('div');
    btn.className = 'cb-nav-btn';
    btn.title = tooltip;
    btn.appendChild(createIcon(icon, 14, 'var(--color-text-secondary)'));
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  private _makeSep(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'cb-toolbar-sep';
    return sep;
  }

  // ============================================================
  //  Filter Bar
  // ============================================================

  private _buildFilterBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'cb-filter-bar';

    // Search input
    const searchWrap = document.createElement('div');
    searchWrap.className = 'cb-search-wrap';
    searchWrap.innerHTML = iconHTML(Icons.Search, 12, 'var(--color-text-muted)');
    this._searchInput = document.createElement('input');
    this._searchInput.type = 'text';
    this._searchInput.className = 'cb-search-input';
    this._searchInput.placeholder = 'Search assets… (Ctrl+F)';
    this._searchInput.addEventListener('input', () => {
      this._searchQuery = this._searchInput.value;
      this._refreshGrid();
    });
    searchWrap.appendChild(this._searchInput);

    // Clear button for search
    const clearBtn = document.createElement('div');
    clearBtn.className = 'cb-search-clear';
    clearBtn.innerHTML = iconHTML(Icons.X, 10, 'var(--color-text-muted)');
    clearBtn.addEventListener('click', () => {
      this._searchInput.value = '';
      this._searchQuery = '';
      this._refreshGrid();
    });
    searchWrap.appendChild(clearBtn);
    bar.appendChild(searchWrap);

    // Type filter dropdown
    const filterBtn = document.createElement('div');
    filterBtn.className = 'cb-filter-btn';
    filterBtn.innerHTML = `${iconHTML(Icons.Filter, 12, 'var(--color-text-muted)')} Filters`;
    filterBtn.addEventListener('click', (e) => { e.stopPropagation(); this._showFilterDropdown(e); });
    bar.appendChild(filterBtn);

    // Sort dropdown
    const sortBtn = document.createElement('div');
    sortBtn.className = 'cb-filter-btn';
    sortBtn.innerHTML = `${iconHTML(Icons.ChevronsUpDown, 12, 'var(--color-text-muted)')} Sort`;
    sortBtn.addEventListener('click', (e) => { e.stopPropagation(); this._showSortDropdown(e); });
    bar.appendChild(sortBtn);

    // Filter pills container
    const pills = document.createElement('div');
    pills.className = 'cb-filter-pills';
    pills.id = 'cb-filter-pills';
    bar.appendChild(pills);

    return bar;
  }

  private _showFilterDropdown(e: MouseEvent | Event): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu cb-filter-dropdown';
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = rect.bottom + 2 + 'px';

    const allTypes: AssetType[] = ['actor', 'structure', 'enum', 'mesh', 'material', 'animBP', 'widget', 'gameInstance', 'texture'];
    for (const t of allTypes) {
      const meta = ASSET_TYPE_META[t];
      const item = document.createElement('div');
      item.className = 'context-menu-item cb-filter-check-item';
      const checked = this._activeFilters.has(t);
      item.innerHTML = `<span class="cb-filter-check">${checked ? iconHTML(Icons.Check, 'xs', ICON_COLORS.success) : ''}</span>
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${meta.color};margin-right:6px;"></span>
        ${meta.label}`;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (this._activeFilters.has(t)) this._activeFilters.delete(t);
        else this._activeFilters.add(t);
        this._updateFilterPills();
        this._refreshGrid();
        // Refresh the dropdown in-place
        this._showFilterDropdown(e);
      });
      menu.appendChild(item);
    }

    // Clear all
    if (this._activeFilters.size > 0) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      this._addMenuItem(menu, 'Clear All Filters', () => {
        this._activeFilters.clear();
        this._updateFilterPills();
        this._refreshGrid();
      });
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _showSortDropdown(e: MouseEvent | Event): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = rect.bottom + 2 + 'px';

    const options: { key: 'name' | 'type' | 'date'; label: string }[] = [
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type' },
    ];
    for (const opt of options) {
      const active = this._sortBy === opt.key;
      const arrow = active ? (this._sortAsc ? ' ' + iconHTML(Icons.ChevronUp, 'xs', ICON_COLORS.secondary) : ' ' + iconHTML(Icons.ChevronDown, 'xs', ICON_COLORS.secondary)) : '';
      this._addMenuItem(menu, (active ? '● ' : '○ ') + opt.label + arrow, () => {
        if (this._sortBy === opt.key) this._sortAsc = !this._sortAsc;
        else { this._sortBy = opt.key; this._sortAsc = true; }
        this._refreshGrid();
      });
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _updateFilterPills(): void {
    const container = this._filterBar.querySelector('#cb-filter-pills');
    if (!container) return;
    container.innerHTML = '';
    for (const t of this._activeFilters) {
      const meta = ASSET_TYPE_META[t];
      const pill = document.createElement('span');
      pill.className = 'cb-filter-pill';
      pill.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${meta.color};"></span> ${meta.label} <span class="cb-pill-x">×</span>`;
      pill.querySelector('.cb-pill-x')!.addEventListener('click', () => {
        this._activeFilters.delete(t);
        this._updateFilterPills();
        this._refreshGrid();
      });
      container.appendChild(pill);
    }
  }

  // ============================================================
  //  Status Bar
  // ============================================================

  private _buildStatusBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'cb-status-bar';

    const left = document.createElement('div');
    left.className = 'cb-status-left';
    left.id = 'cb-status-text';
    bar.appendChild(left);

    const right = document.createElement('div');
    right.className = 'cb-status-right';

    // Thumbnail slider
    const sliderLabel = document.createElement('span');
    sliderLabel.className = 'cb-status-label';
    sliderLabel.textContent = 'Size';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'cb-thumb-slider';
    slider.min = '48';
    slider.max = '160';
    slider.value = String(this._thumbnailSize);
    slider.addEventListener('input', () => {
      this._thumbnailSize = parseInt(slider.value);
      this._gridEl.style.setProperty('--cb-thumb-size', this._thumbnailSize + 'px');
      this._refreshGrid();
    });

    right.append(sliderLabel, slider);
    bar.appendChild(right);
    return bar;
  }

  private _updateStatusBar(): void {
    const el = this._statusBar.querySelector('#cb-status-text');
    if (!el) return;
    const total = this._visibleAssets.length;
    const sel = this._selectedIds.size;
    const path = this._folderManager.getFolderPath(this._currentFolderId);
    let text = `${total} item${total !== 1 ? 's' : ''}`;
    if (sel > 0) text += ` · ${sel} selected`;
    text += `  ·  ${path}`;
    el.textContent = text;
  }

  // ============================================================
  //  Tree Resize
  // ============================================================

  private _setupTreeResize(resizer: HTMLElement): void {
    let startX: number;
    let startW: number;
    const onMove = (e: MouseEvent) => {
      const w = Math.max(140, Math.min(360, startW + (e.clientX - startX)));
      this._treeWidth = w;
      this._treeEl.style.width = w + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = this._treeWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ============================================================
  //  File Drop (preserved logic)
  // ============================================================

  private _setupFileDrop(): void {
    this._gridEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._gridEl.classList.add('cb-drag-over');
    });
    this._gridEl.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this._gridEl.classList.remove('cb-drag-over');
    });
    this._gridEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._gridEl.classList.remove('cb-drag-over');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        this._handleFileDrop(e.dataTransfer.files);
      }
    });
  }

  // ============================================================
  //  Navigation
  // ============================================================

  private _navigateTo(folderId: string, pushHistory = true): void {
    this._currentFolderId = folderId;
    if (pushHistory && !this._isNavigating) {
      // Truncate forward history
      this._navHistory.splice(this._navIndex + 1);
      this._navHistory.push(folderId);
      this._navIndex = this._navHistory.length - 1;
    }
    this._updateNavButtons();
    this._updateBreadcrumbs();
    this._refreshTree();
    this._refreshGrid();
  }

  private _goBack(): void {
    if (this._navIndex <= 0) return;
    this._isNavigating = true;
    this._navIndex--;
    this._navigateTo(this._navHistory[this._navIndex], false);
    this._isNavigating = false;
  }

  private _goForward(): void {
    if (this._navIndex >= this._navHistory.length - 1) return;
    this._isNavigating = true;
    this._navIndex++;
    this._navigateTo(this._navHistory[this._navIndex], false);
    this._isNavigating = false;
  }

  private _goUp(): void {
    const folder = this._folderManager.getFolder(this._currentFolderId);
    if (folder && folder.parentId) {
      this._navigateTo(folder.parentId);
    }
  }

  private _updateNavButtons(): void {
    if (this._backBtn) {
      this._backBtn.classList.toggle('cb-nav-disabled', this._navIndex <= 0);
    }
    if (this._fwdBtn) {
      this._fwdBtn.classList.toggle('cb-nav-disabled', this._navIndex >= this._navHistory.length - 1);
    }
  }

  private _updateBreadcrumbs(): void {
    if (!this._breadcrumbEl) return;
    this._breadcrumbEl.innerHTML = '';
    // Build path segments from root to current
    const segments: { id: string; name: string }[] = [];
    let folderId: string | null = this._currentFolderId;
    while (folderId) {
      const folder = this._folderManager.getFolder(folderId);
      if (!folder) break;
      segments.unshift({ id: folder.id, name: folder.name });
      folderId = folder.parentId;
    }
    segments.forEach((seg, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'cb-breadcrumb-sep';
        sep.textContent = '/';
        this._breadcrumbEl.appendChild(sep);
      }
      const span = document.createElement('span');
      span.className = 'cb-breadcrumb-item';
      if (i === segments.length - 1) span.classList.add('cb-breadcrumb-current');
      span.textContent = seg.name;
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        this._navigateTo(seg.id);
      });
      this._breadcrumbEl.appendChild(span);
    });
  }

  // ============================================================
  //  Folder Tree
  // ============================================================

  private _refreshTree(): void {
    this._treeEl.innerHTML = '';
    const root = this._folderManager.getFolder(this._folderManager.getRootFolderId());
    if (root) this._renderFolderNode(root, 0);
  }

  private _renderFolderNode(folder: FolderNode, depth: number): void {
    const isExpanded = this._expandedFolders.has(folder.id);
    const isSelected = this._currentFolderId === folder.id;
    const children = this._folderManager.getChildFolders(folder.id);
    const hasChildren = children.length > 0;
    const assetCount = this._folderManager.getAssetsInFolder(folder.id).length;

    const item = document.createElement('div');
    item.className = 'cb-tree-item' + (isSelected ? ' selected' : '');
    item.style.paddingLeft = `${depth * 16 + 4}px`;

    // Chevron
    const chevron = document.createElement('span');
    chevron.className = 'cb-tree-chevron';
    if (hasChildren) {
      chevron.innerHTML = iconHTML(Icons.ChevronRight, 10, 'var(--color-text-muted)');
      if (isExpanded) chevron.classList.add('cb-tree-chevron-open');
    }
    item.appendChild(chevron);

    // Folder icon
    const fIcon = document.createElement('span');
    fIcon.className = 'cb-tree-icon';
    fIcon.innerHTML = isExpanded && hasChildren
      ? iconHTML(Icons.FolderOpen, 14, ICON_COLORS.folder)
      : iconHTML(Icons.Folder, 14, ICON_COLORS.folder);
    item.appendChild(fIcon);

    // Label
    const label = document.createElement('span');
    label.className = 'cb-tree-label';
    label.textContent = folder.name;
    item.appendChild(label);

    // Badge (asset count)
    if (assetCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'cb-tree-badge';
      badge.textContent = String(assetCount);
      item.appendChild(badge);
    }

    // Click: select folder + toggle expand
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasChildren) {
        if (isExpanded) this._expandedFolders.delete(folder.id);
        else this._expandedFolders.add(folder.id);
      }
      this._navigateTo(folder.id);
    });

    // Right-click: folder context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showFolderContextMenu(e, folder);
    });

    this._treeEl.appendChild(item);

    // Children
    if (isExpanded) {
      for (const child of children) {
        this._renderFolderNode(child, depth + 1);
      }
    }
  }

  // ============================================================
  //  Asset Grid / List Refresh
  // ============================================================

  private _refreshGrid(): void {
    this._gridEl.innerHTML = '';

    // Get filtered + sorted assets
    this._visibleAssets = this._getFilteredSortedAssets();

    if (this._viewMode === 'grid') {
      this._renderGridView();
    } else {
      this._renderListView();
    }

    // Drop zone hint when empty
    if (this._visibleAssets.length === 0 && !this._searchQuery && this._activeFilters.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'cb-empty-state';
      empty.innerHTML = `
        <div class="cb-empty-icon">${iconHTML(Icons.FolderOpen, 32, 'var(--color-text-muted)')}</div>
        <div class="cb-empty-text">Empty folder</div>
        <div class="cb-empty-hint">Right-click to create assets, or drag files here to import</div>
      `;
      this._gridEl.appendChild(empty);
    } else if (this._visibleAssets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cb-empty-state';
      empty.innerHTML = `
        <div class="cb-empty-icon">${iconHTML(Icons.Search, 32, 'var(--color-text-muted)')}</div>
        <div class="cb-empty-text">No matching assets</div>
        <div class="cb-empty-hint">Try adjusting your search or filters</div>
      `;
      this._gridEl.appendChild(empty);
    }

    this._updateStatusBar();
  }

  private _renderGridView(): void {
    this._gridEl.classList.add('cb-grid-view');
    this._gridEl.classList.remove('cb-list-view');
    for (const loc of this._visibleAssets) {
      const info = this._resolveAssetInfo(loc.assetId, loc.assetType);
      if (info) this._renderGridCard(info);
    }
  }

  private _renderListView(): void {
    this._gridEl.classList.add('cb-list-view');
    this._gridEl.classList.remove('cb-grid-view');

    // List header
    const header = document.createElement('div');
    header.className = 'cb-list-header';
    const cols = [
      { key: '', label: '', width: '26px' },
      { key: 'name', label: 'Name', width: '1fr' },
      { key: 'type', label: 'Type', width: '120px' },
      { key: '', label: 'Details', width: '140px' },
    ];
    for (const col of cols) {
      const cell = document.createElement('div');
      cell.className = 'cb-list-header-cell';
      cell.textContent = col.label;
      if (col.key === 'name' || col.key === 'type') {
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', () => {
          const k = col.key as 'name' | 'type';
          if (this._sortBy === k) this._sortAsc = !this._sortAsc;
          else { this._sortBy = k; this._sortAsc = true; }
          this._refreshGrid();
        });
        if (this._sortBy === col.key) {
          cell.innerHTML = cell.textContent + (this._sortAsc ? ' ' + iconHTML(Icons.ChevronUp, 'xs', ICON_COLORS.secondary) : ' ' + iconHTML(Icons.ChevronDown, 'xs', ICON_COLORS.secondary));
        }
      }
      header.appendChild(cell);
    }
    this._gridEl.appendChild(header);

    // Rows
    for (let i = 0; i < this._visibleAssets.length; i++) {
      const loc = this._visibleAssets[i];
      const info = this._resolveAssetInfo(loc.assetId, loc.assetType);
      if (info) this._renderListRow(info, i);
    }
  }

  // ============================================================
  //  Grid Card Renderer
  // ============================================================

  private _renderGridCard(info: AssetCardInfo): void {
    const card = document.createElement('div');
    card.className = 'cb-card';
    card.dataset.assetId = info.id;
    if (this._selectedIds.has(info.id)) card.classList.add('selected');
    card.style.setProperty('--card-type-color', info.typeColor);

    // Thumbnail area
    const thumb = document.createElement('div');
    thumb.className = 'cb-card-thumb';
    if (info.customThumb) {
      thumb.appendChild(info.customThumb);
    } else if (info.thumbnail) {
      thumb.style.backgroundImage = `url(${info.thumbnail})`;
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
    } else {
      thumb.appendChild(createIcon(info.icon, 28, info.iconColor));
    }
    card.appendChild(thumb);

    // Name (with search highlight)
    const nameEl = document.createElement('div');
    nameEl.className = 'cb-card-name';
    if (this._searchQuery) {
      nameEl.innerHTML = this._highlightMatch(info.name, this._searchQuery);
    } else {
      nameEl.textContent = info.name;
    }
    nameEl.title = `${info.name} — ${info.typeLabel}`;
    card.appendChild(nameEl);

    // Subtitle
    if (info.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'cb-card-subtitle';
      sub.textContent = info.subtitle;
      card.appendChild(sub);
    }

    // Events
    this._wireCardEvents(card, info);

    // Hover preview
    card.addEventListener('mouseenter', (e) => this._startHoverPreview(info, e));
    card.addEventListener('mouseleave', () => this._cancelHoverPreview());

    this._gridEl.appendChild(card);
  }

  // ============================================================
  //  List Row Renderer
  // ============================================================

  private _renderListRow(info: AssetCardInfo, index: number): void {
    const row = document.createElement('div');
    row.className = 'cb-list-row';
    row.dataset.assetId = info.id;
    if (this._selectedIds.has(info.id)) row.classList.add('selected');
    if (index % 2 === 1) row.classList.add('cb-list-alt');

    // Type icon cell
    const iconCell = document.createElement('div');
    iconCell.className = 'cb-list-cell cb-list-icon-cell';
    iconCell.style.borderLeft = `3px solid ${info.typeColor}`;
    iconCell.appendChild(createIcon(info.icon, 14, info.iconColor));
    row.appendChild(iconCell);

    // Name cell
    const nameCell = document.createElement('div');
    nameCell.className = 'cb-list-cell cb-list-name-cell';
    if (this._searchQuery) {
      nameCell.innerHTML = this._highlightMatch(info.name, this._searchQuery);
    } else {
      nameCell.textContent = info.name;
    }
    row.appendChild(nameCell);

    // Type cell
    const typeCell = document.createElement('div');
    typeCell.className = 'cb-list-cell cb-list-type-cell';
    typeCell.textContent = info.typeLabel;
    row.appendChild(typeCell);

    // Details cell
    const detailCell = document.createElement('div');
    detailCell.className = 'cb-list-cell cb-list-detail-cell';
    detailCell.textContent = info.subtitle;
    row.appendChild(detailCell);

    this._wireCardEvents(row, info);
    row.addEventListener('mouseenter', (e) => this._startHoverPreview(info, e));
    row.addEventListener('mouseleave', () => this._cancelHoverPreview());

    this._gridEl.appendChild(row);
  }

  // ============================================================
  //  Card Event Wiring (shared between grid & list)
  // ============================================================

  private _wireCardEvents(el: HTMLElement, info: AssetCardInfo): void {
    // Click — selection with Ctrl/Shift support
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this._handleAssetClick(info.id, e);
    });

    // Double-click — open
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      info.onOpen();
    });

    // Context menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Ensure right-clicked asset is selected
      if (!this._selectedIds.has(info.id)) {
        this._selectedIds.clear();
        this._selectedIds.add(info.id);
        this._lastClickedId = info.id;
        this._refreshGrid();
      }
      info.onContextMenu(e);
    });

    // Drag (actor/mesh only)
    if (info.dragKind) {
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (info.dragKind === 'actor') this._dragAsset = info.dragPayload;
        else if (info.dragKind === 'mesh') this._dragMeshAsset = info.dragPayload;
        this._dragStarted = false;
        this._startX = e.clientX;
        this._startY = e.clientY;
      });
    }
  }

  // ============================================================
  //  Selection
  // ============================================================

  private _handleAssetClick(id: string, e: MouseEvent): void {
    if (e.ctrlKey || e.metaKey) {
      // Toggle single
      if (this._selectedIds.has(id)) this._selectedIds.delete(id);
      else this._selectedIds.add(id);
      this._lastClickedId = id;
    } else if (e.shiftKey && this._lastClickedId) {
      // Range select
      const ids = this._visibleAssets.map(a => a.assetId);
      const from = ids.indexOf(this._lastClickedId);
      const to = ids.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        for (let i = lo; i <= hi; i++) this._selectedIds.add(ids[i]);
      }
    } else {
      // Single select
      this._selectedIds.clear();
      this._selectedIds.add(id);
      this._lastClickedId = id;
    }
    this._refreshGrid();
  }

  private _selectAll(): void {
    this._selectedIds.clear();
    for (const a of this._visibleAssets) this._selectedIds.add(a.assetId);
    this._refreshGrid();
  }

  // ============================================================
  //  Asset Info Resolver — single point of truth for all types
  // ============================================================

  private _resolveAssetInfo(assetId: string, assetType: AssetType): AssetCardInfo | null {
    const meta = ASSET_TYPE_META[assetType];

    switch (assetType) {
      case 'actor': {
        const a = this._manager.getAsset(assetId);
        if (!a) return null;
        let icon = meta.icon;
        let iconColor = meta.color;
        if (a.actorType === 'characterPawn') { icon = Icons.PersonStanding; iconColor = ICON_COLORS.actor; }
        else if (a.actorType === 'playerController') { icon = Icons.Gamepad2; iconColor = ICON_COLORS.actor; }
        else if (a.actorType === 'aiController') { icon = Icons.Camera; iconColor = ICON_COLORS.actor; }
        return {
          id: a.id, name: a.name, type: assetType,
          typeColor: meta.color, typeLabel: this._getActorTypeLabel(a.actorType),
          icon, iconColor, thumbnail: null,
          subtitle: this._getActorTypeLabel(a.actorType),
          onOpen: () => this._onOpenAsset(a),
          onContextMenu: (e) => this._showAssetContextMenu(e, a),
          dragKind: 'actor', dragPayload: a,
        };
      }
      case 'structure': {
        if (!this._structManager) return null;
        const s = this._structManager.getStructure(assetId);
        if (!s) return null;
        return {
          id: s.id, name: s.name, type: assetType,
          typeColor: meta.color, typeLabel: 'Structure',
          icon: meta.icon, iconColor: meta.color, thumbnail: null,
          subtitle: `${s.fields.length} fields`,
          onOpen: () => this._onOpenStructure?.(s),
          onContextMenu: (e) => this._showStructContextMenu(e, s),
          dragKind: null, dragPayload: null,
        };
      }
      case 'enum': {
        if (!this._structManager) return null;
        const en = this._structManager.getEnum(assetId);
        if (!en) return null;
        return {
          id: en.id, name: en.name, type: assetType,
          typeColor: meta.color, typeLabel: 'Enum',
          icon: meta.icon, iconColor: meta.color, thumbnail: null,
          subtitle: `${en.values.length} values`,
          onOpen: () => this._onOpenEnum?.(en),
          onContextMenu: (e) => this._showEnumContextMenu(e, en),
          dragKind: null, dragPayload: null,
        };
      }
      case 'mesh': {
        if (!this._meshManager) return null;
        const m = this._meshManager.getAsset(assetId);
        if (!m) return null;
        const verts = m.meshData.vertexCount.toLocaleString();
        const tris = m.meshData.triangleCount.toLocaleString();
        return {
          id: m.id, name: m.name, type: assetType,
          typeColor: meta.color, typeLabel: 'Static Mesh',
          icon: meta.icon, iconColor: meta.color,
          thumbnail: m.thumbnail || null,
          subtitle: `${verts} verts · ${tris} tris`,
          onOpen: () => {},
          onContextMenu: (e) => this._showMeshContextMenu(e, m),
          dragKind: 'mesh', dragPayload: m,
        };
      }
      case 'material': {
        if (!this._meshManager) return null;
        const mat = this._meshManager.getMaterial(assetId);
        if (!mat) return null;
        // Custom swatch thumbnail
        const swatch = document.createElement('div');
        swatch.style.cssText = `width:36px;height:36px;border-radius:50%;border:2px solid var(--border);background:${mat.materialData.baseColor};`;
        if (mat.materialData.metalness > 0.5) {
          swatch.style.background = `linear-gradient(135deg, ${mat.materialData.baseColor}, #888)`;
        }
        return {
          id: mat.assetId, name: mat.assetName, type: assetType,
          typeColor: meta.color, typeLabel: 'Material',
          icon: meta.icon, iconColor: meta.color, thumbnail: null,
          subtitle: mat.materialData.type,
          onOpen: () => this._onOpenMaterial?.(mat),
          onContextMenu: (e) => this._showMaterialContextMenu(e, mat),
          dragKind: null, dragPayload: null,
          customThumb: swatch,
        };
      }
      case 'animBP': {
        if (!this._animBPManager) return null;
        const abp = this._animBPManager.getAsset(assetId);
        if (!abp) return null;
        const is2D = abp.is2D;
        return {
          id: abp.id, name: abp.name, type: assetType,
          typeColor: is2D ? '#34d399' : meta.color,
          typeLabel: is2D ? 'Anim BP 2D' : 'Anim Blueprint',
          icon: meta.icon,
          iconColor: is2D ? '#34d399' : meta.color,
          thumbnail: null,
          subtitle: is2D
            ? `2D · ${abp.stateMachine.states.length} states`
            : `${abp.stateMachine.states.length} states`,
          onOpen: () => this._onOpenAnimBP?.(abp),
          onContextMenu: (e) => this._showAnimBPContextMenu(e, abp),
          dragKind: null, dragPayload: null,
        };
      }
      case 'widget': {
        if (!this._widgetBPManager) return null;
        const w = this._widgetBPManager.getAsset(assetId);
        if (!w) return null;
        const wc = w.widgets.size;
        return {
          id: w.id, name: w.name, type: assetType,
          typeColor: meta.color, typeLabel: 'Widget',
          icon: meta.icon, iconColor: meta.color, thumbnail: null,
          subtitle: `${wc} widget${wc !== 1 ? 's' : ''}`,
          onOpen: () => this._onOpenWidgetBP?.(w),
          onContextMenu: (e) => this._showWidgetBPContextMenu(e, w),
          dragKind: null, dragPayload: null,
        };
      }
      case 'gameInstance': {
        if (!this._gameInstanceManager) return null;
        const gi = this._gameInstanceManager.getAsset(assetId);
        if (!gi) return null;
        const vc = gi.blueprintData.variables.length;
        return {
          id: gi.id, name: gi.name, type: assetType,
          typeColor: meta.color, typeLabel: 'Game Instance',
          icon: meta.icon, iconColor: meta.color, thumbnail: null,
          subtitle: `${vc} var${vc !== 1 ? 's' : ''}`,
          onOpen: () => this._onOpenGameInstance?.(gi),
          onContextMenu: (e) => this._showGameInstanceContextMenu(e, gi),
          dragKind: null, dragPayload: null,
        };
      }
      case 'saveGame': {
        if (!this._saveGameManager) return null;
        const sg = this._saveGameManager.getAsset(assetId);
        if (!sg) return null;
        const fc = sg.fields.length;
        return {
          id: sg.id, name: sg.name, type: assetType,
          typeColor: meta.color, typeLabel: 'Save Game',
          icon: meta.icon, iconColor: meta.color, thumbnail: null,
          subtitle: `${fc} field${fc !== 1 ? 's' : ''}`,
          onOpen: () => this._onOpenSaveGame?.(sg),
          onContextMenu: (e) => this._showSaveGameContextMenu(e, sg),
          dragKind: null, dragPayload: null,
        };
      }
      case 'texture': {
        const texLib = TextureLibrary.instance;
        if (!texLib) return null;
        const tex = texLib.getAsset(assetId);
        if (!tex) return null;
        const dims = tex.metadata ? `${tex.metadata.width}×${tex.metadata.height}` : '';
        return {
          id: tex.assetId, name: tex.assetName, type: assetType,
          typeColor: meta.color, typeLabel: 'Texture',
          icon: meta.icon, iconColor: meta.color,
          thumbnail: tex.thumbnail || null,
          subtitle: dims,
          onOpen: () => {},
          onContextMenu: (e) => this._showTextureContextMenu(e, tex),
          dragKind: null, dragPayload: null,
        };
      }
      case 'sound': {
        const sndLib = SoundLibrary.instance;
        if (!sndLib) return null;
        const snd = sndLib.getSound(assetId);
        if (!snd) return null;
        const dur = SoundLibrary.formatDuration(snd.metadata.duration);
        return {
          id: snd.assetId, name: snd.assetName, type: assetType,
          typeColor: meta.color, typeLabel: 'Sound',
          icon: meta.icon, iconColor: meta.color,
          thumbnail: snd.thumbnail || null,
          subtitle: `${dur} · ${snd.metadata.format.toUpperCase()} · ${snd.category}`,
          onOpen: () => {},
          onContextMenu: (e) => this._showSoundContextMenu(e, snd),
          dragKind: null, dragPayload: null,
        };
      }
      case 'soundCue': {
        const sndLib = SoundLibrary.instance;
        if (!sndLib) return null;
        const cue = sndLib.getCue(assetId);
        if (!cue) return null;
        const wpCount = (cue.nodes || []).filter((n: any) => n.type === 'wavePlayer').length;
        const nodeCount = (cue.nodes || []).length;
        return {
          id: cue.assetId, name: cue.assetName, type: assetType,
          typeColor: meta.color, typeLabel: 'Sound Cue',
          icon: meta.icon, iconColor: meta.color,
          thumbnail: null,
          subtitle: `${wpCount} sound${wpCount !== 1 ? 's' : ''} · ${nodeCount} nodes`,
          onOpen: () => this._onOpenSoundCue?.(cue),
          onContextMenu: (e) => this._showSoundCueContextMenu(e, cue),
          dragKind: null, dragPayload: null,
        };
      }
      default:
        return null;
    }
  }

  private _getActorTypeLabel(t: ActorType | string): string {
    switch (t) {
      case 'characterPawn': return 'Character Pawn';
      case 'playerController': return 'Player Controller';
      case 'aiController': return 'AI Controller';
      default: return 'Actor Blueprint';
    }
  }

  // ============================================================
  //  Filter / Sort Logic
  // ============================================================

  private _getFilteredSortedAssets(): { assetId: string; assetType: AssetType }[] {
    let assets = this._folderManager.getAssetsInFolder(this._currentFolderId);

    // Type filter
    if (this._activeFilters.size > 0) {
      assets = assets.filter(a => this._activeFilters.has(a.assetType));
    }

    // Search filter
    if (this._searchQuery.trim()) {
      const q = this._searchQuery.trim().toLowerCase();
      assets = assets.filter(a => {
        const info = this._resolveAssetInfo(a.assetId, a.assetType);
        return info ? info.name.toLowerCase().includes(q) : false;
      });
    }

    // Sort
    assets.sort((a, b) => {
      const infoA = this._resolveAssetInfo(a.assetId, a.assetType);
      const infoB = this._resolveAssetInfo(b.assetId, b.assetType);
      if (!infoA || !infoB) return 0;
      let cmp = 0;
      if (this._sortBy === 'name') {
        cmp = infoA.name.localeCompare(infoB.name);
      } else if (this._sortBy === 'type') {
        cmp = infoA.typeLabel.localeCompare(infoB.typeLabel) || infoA.name.localeCompare(infoB.name);
      }
      return this._sortAsc ? cmp : -cmp;
    });

    return assets;
  }

  // ============================================================
  //  Search Highlight
  // ============================================================

  private _highlightMatch(text: string, query: string): string {
    if (!query) return this._escapeHtml(text);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return this._escapeHtml(text);
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return `${this._escapeHtml(before)}<mark class="cb-highlight">${this._escapeHtml(match)}</mark>${this._escapeHtml(after)}`;
  }

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ============================================================
  //  Hover Preview
  // ============================================================

  private _startHoverPreview(info: AssetCardInfo, e: MouseEvent): void {
    if (this._previewPinned) return;
    this._cancelHoverPreview();
    this._previewTimer = setTimeout(() => {
      this._showPreview(info, e.clientX, e.clientY);
    }, 600);
  }

  private _cancelHoverPreview(): void {
    if (this._previewTimer) { clearTimeout(this._previewTimer); this._previewTimer = null; }
    if (!this._previewPinned && this._previewEl) { this._previewEl.remove(); this._previewEl = null; }
  }

  private _showPreview(info: AssetCardInfo, x: number, y: number): void {
    if (this._previewEl) this._previewEl.remove();
    const el = document.createElement('div');
    el.className = 'cb-preview-tooltip';
    // Position near mouse
    el.style.left = (x + 20) + 'px';
    el.style.top = (y - 80) + 'px';

    // Preview content
    if (info.thumbnail) {
      const img = document.createElement('div');
      img.className = 'cb-preview-image';
      img.style.backgroundImage = `url(${info.thumbnail})`;
      el.appendChild(img);
    } else if (info.customThumb) {
      const clone = info.customThumb.cloneNode(true) as HTMLElement;
      clone.style.width = '80px';
      clone.style.height = '80px';
      el.appendChild(clone);
    } else {
      const iconWrap = document.createElement('div');
      iconWrap.className = 'cb-preview-icon';
      iconWrap.appendChild(createIcon(info.icon, 48, info.iconColor));
      el.appendChild(iconWrap);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'cb-preview-name';
    nameEl.textContent = info.name;
    el.appendChild(nameEl);

    const typeEl = document.createElement('div');
    typeEl.className = 'cb-preview-type';
    typeEl.textContent = info.typeLabel;
    typeEl.style.color = info.typeColor;
    el.appendChild(typeEl);

    if (info.subtitle) {
      const detEl = document.createElement('div');
      detEl.className = 'cb-preview-detail';
      detEl.textContent = info.subtitle;
      el.appendChild(detEl);
    }

    document.body.appendChild(el);
    this._previewEl = el;

    // Keep within viewport
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = (x - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) el.style.top = (window.innerHeight - rect.height - 10) + 'px';
    if (rect.top < 0) el.style.top = '10px';
  }

  // ============================================================
  //  Keyboard Shortcuts
  // ============================================================

  private _onKeyDown = (e: KeyboardEvent): void => {
    // Ctrl+F — focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      this._searchInput.focus();
      this._searchInput.select();
      return;
    }

    // Ctrl+A — select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      this._selectAll();
      return;
    }

    // Ctrl+N — new asset
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      this._createNewAsset();
      return;
    }

    // Ctrl+D — duplicate selected
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      this._duplicateSelected();
      return;
    }

    // Delete — delete selected
    if (e.key === 'Delete') {
      e.preventDefault();
      this._deleteSelected();
      return;
    }

    // F2 — rename selected
    if (e.key === 'F2') {
      e.preventDefault();
      this._renameSelected();
      return;
    }

    // Enter — open selected
    if (e.key === 'Enter') {
      e.preventDefault();
      this._openSelected();
      return;
    }

    // Backspace — go up
    if (e.key === 'Backspace' && document.activeElement !== this._searchInput) {
      e.preventDefault();
      this._goUp();
      return;
    }

    // Alt+← — back
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      this._goBack();
      return;
    }

    // Alt+→ — forward
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      this._goForward();
      return;
    }

    // F5 — refresh
    if (e.key === 'F5') {
      e.preventDefault();
      this._refreshTree();
      this._refreshGrid();
      return;
    }

    // Escape — clear selection or search
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this._previewPinned) {
        this._previewPinned = false;
        this._cancelHoverPreview();
      } else if (this._searchQuery) {
        this._searchInput.value = '';
        this._searchQuery = '';
        this._refreshGrid();
      } else {
        this._selectedIds.clear();
        this._refreshGrid();
      }
      return;
    }

    // Space — pin hover preview
    if (e.key === ' ' && document.activeElement !== this._searchInput) {
      if (this._previewEl) {
        e.preventDefault();
        this._previewPinned = !this._previewPinned;
      }
      return;
    }

    // + / - — adjust thumbnail size
    if (e.key === '+' || e.key === '=') {
      this._thumbnailSize = Math.min(160, this._thumbnailSize + 16);
      this._gridEl.style.setProperty('--cb-thumb-size', this._thumbnailSize + 'px');
      this._refreshGrid();
      return;
    }
    if (e.key === '-') {
      this._thumbnailSize = Math.max(48, this._thumbnailSize - 16);
      this._gridEl.style.setProperty('--cb-thumb-size', this._thumbnailSize + 'px');
      this._refreshGrid();
      return;
    }
  };

  // Bulk operations triggered by keyboard
  private _duplicateSelected(): void {
    if (this._selectedIds.size !== 1) return;
    const id = [...this._selectedIds][0];
    // Only actors support duplicate currently
    const asset = this._manager.getAsset(id);
    if (!asset) return;
    const dup = this._manager.createAsset(asset.name + '_Copy', asset.actorType);
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
    if (asset.characterPawnConfig) dup.characterPawnConfig = structuredClone(asset.characterPawnConfig);
    this._folderManager.setAssetLocation(dup.id, 'actor', this._currentFolderId);
    this._manager.notifyAssetChanged(dup.id);
    this._selectedIds.clear();
    this._selectedIds.add(dup.id);
    this._refreshGrid();
  }

  private _deleteSelected(): void {
    if (this._selectedIds.size === 0) return;
    const count = this._selectedIds.size;
    if (!confirm(`Delete ${count} selected asset${count > 1 ? 's' : ''}?`)) return;

    for (const id of [...this._selectedIds]) {
      // Try each manager
      const asset = this._manager.getAsset(id);
      if (asset) {
        const inh = ClassInheritanceSystem.instance;
        inh.unregisterActor(asset.id);
        this._manager.removeAsset(asset.id);
        continue;
      }
      if (this._structManager) {
        const s = this._structManager.getStructure(id);
        if (s) { this._structManager.removeStructure(id); continue; }
        const en = this._structManager.getEnum(id);
        if (en) { this._structManager.removeEnum(id); continue; }
      }
      if (this._meshManager) {
        const m = this._meshManager.getAsset(id);
        if (m) { this._meshManager.removeAsset(id); continue; }
        const matIdx = this._meshManager.allMaterials.findIndex(mat => mat.assetId === id);
        if (matIdx >= 0) {
          this._meshManager.allMaterials.splice(matIdx, 1);
          this._folderManager.removeAssetLocation(id, 'material');
          continue;
        }
      }
      if (this._animBPManager) {
        const abp = this._animBPManager.getAsset(id);
        if (abp) { this._animBPManager.removeAsset(id); continue; }
      }
      if (this._widgetBPManager) {
        const w = this._widgetBPManager.getAsset(id);
        if (w) {
          ClassInheritanceSystem.instance.unregisterWidget(w.id);
          this._widgetBPManager.removeAsset(id);
          continue;
        }
      }
      if (this._gameInstanceManager) {
        const gi = this._gameInstanceManager.getAsset(id);
        if (gi) {
          this._gameInstanceManager.removeAsset(id);
          this._folderManager.removeAssetLocation(id, 'gameInstance');
          continue;
        }
      }
      const texLib = TextureLibrary.instance;
      if (texLib) {
        texLib.removeTexture(id);
        this._folderManager.removeAssetLocation(id, 'texture');
      }
    }
    this._selectedIds.clear();
    this._lastClickedId = null;
    this._refreshGrid();
  }

  private _renameSelected(): void {
    if (this._selectedIds.size !== 1) return;
    const id = [...this._selectedIds][0];
    // Find which type and show rename dialog
    const asset = this._manager.getAsset(id);
    if (asset) {
      this._showNameDialog('Rename Actor', asset.name).then(n => { if (n) this._manager.renameAsset(id, n); });
      return;
    }
    if (this._structManager) {
      const s = this._structManager.getStructure(id);
      if (s) { this._showNameDialog('Rename Structure', s.name).then(n => { if (n) this._structManager!.renameStructure(id, n); }); return; }
      const en = this._structManager.getEnum(id);
      if (en) { this._showNameDialog('Rename Enum', en.name).then(n => { if (n) this._structManager!.renameEnum(id, n); }); return; }
    }
    if (this._meshManager) {
      const m = this._meshManager.getAsset(id);
      if (m) { this._showNameDialog('Rename Mesh', m.name).then(n => { if (n) this._meshManager!.renameAsset(id, n); }); return; }
      const mat = this._meshManager.getMaterial(id);
      if (mat) { this._showNameDialog('Rename Material', mat.assetName).then(n => { if (n) { mat.assetName = n; this._refreshGrid(); } }); return; }
    }
    if (this._animBPManager) {
      const abp = this._animBPManager.getAsset(id);
      if (abp) { this._showNameDialog('Rename Anim BP', abp.name).then(n => { if (n) this._animBPManager!.renameAsset(id, n); }); return; }
    }
    if (this._widgetBPManager) {
      const w = this._widgetBPManager.getAsset(id);
      if (w) { this._showNameDialog('Rename Widget', w.name).then(n => { if (n) this._widgetBPManager!.renameAsset(id, n); }); return; }
    }
    if (this._gameInstanceManager) {
      const gi = this._gameInstanceManager.getAsset(id);
      if (gi) { this._showNameDialog('Rename Game Instance', gi.name).then(n => { if (n) this._gameInstanceManager!.renameAsset(id, n); }); return; }
    }
    const texLib = TextureLibrary.instance;
    if (texLib) {
      const tex = texLib.getAsset(id);
      if (tex) { this._showNameDialog('Rename Texture', tex.assetName).then(n => { if (n) { tex.assetName = n; this._refreshGrid(); } }); return; }
    }
  }

  private _openSelected(): void {
    if (this._selectedIds.size !== 1) return;
    const id = [...this._selectedIds][0];
    // Find the asset and open it
    const loc = this._visibleAssets.find(a => a.assetId === id);
    if (!loc) return;
    const info = this._resolveAssetInfo(loc.assetId, loc.assetType);
    if (info) info.onOpen();
  }

  // ============================================================
  //  Context Menus
  // ============================================================

  // ── Empty space menu (Create New + Import) — Unreal-style with search & submenus ──
  private _showEmptyContextMenu(e: MouseEvent | Event): void {
    this._closeContextMenu();

    // ── Collect all menu items into categories ──
    interface CbMenuItem { icon: string; label: string; action: () => void; keywords?: string }
    interface CbMenuCategory { id: string; label: string; icon: string; color: string; items: CbMenuItem[] }

    const categories: CbMenuCategory[] = [];

    // Blueprints
    const bpItems: CbMenuItem[] = [
      { icon: iconHTML(Icons.GitBranch, 12, ICON_COLORS.blueprint), label: 'Actor Blueprint', action: () => this._createNewAsset(), keywords: 'actor bp blueprint class' },
      { icon: iconHTML(Icons.PersonStanding, 12, ICON_COLORS.actor), label: 'Character Pawn', action: () => this._createNewAsset('characterPawn'), keywords: 'character pawn player' },
      { icon: iconHTML(Icons.Gamepad2, 12, ICON_COLORS.actor), label: 'Player Controller', action: () => this._createNewAsset('playerController'), keywords: 'player controller input' },
      { icon: iconHTML(Icons.Camera, 12, ICON_COLORS.actor), label: 'AI Controller', action: () => this._createNewAsset('aiController'), keywords: 'ai controller npc' },
    ];
    if (this._widgetBPManager) {
      bpItems.push({
        icon: iconHTML(Icons.Palette, 12, ICON_COLORS.widget), label: 'Widget Blueprint', keywords: 'widget ui umg hud',
        action: async () => {
          const name = await this._showNameDialog('New Widget Blueprint', 'WBP_NewWidget');
          if (name) {
            const wbp = this._widgetBPManager!.createAsset(name);
            this._folderManager.setAssetLocation(wbp.id, 'widget', this._currentFolderId);
            this._selectedIds.clear(); this._selectedIds.add(wbp.id);
            if (this._onOpenWidgetBP) this._onOpenWidgetBP(wbp);
          }
        }
      });
    }
    if (this._animBPManager) {
      bpItems.push({
        icon: iconHTML(Icons.Clapperboard, 12, ICON_COLORS.light), label: 'Animation Blueprint (3D)', keywords: 'animation 3d anim bp',
        action: async () => {
          const name = await this._showNameDialog('New Animation Blueprint', 'ABP_NewAnimBP');
          if (name) {
            const abp = this._animBPManager!.createAsset(name);
            this._folderManager.setAssetLocation(abp.id, 'animBP', this._currentFolderId);
            this._selectedIds.clear(); this._selectedIds.add(abp.id);
            if (this._onOpenAnimBP) this._onOpenAnimBP(abp);
          }
        }
      });
      bpItems.push({
        icon: iconHTML(Icons.Clapperboard, 12, '#34d399'), label: 'Animation Blueprint (2D)', keywords: 'animation 2d anim bp sprite',
        action: async () => {
          const name = await this._showNameDialog('New 2D Animation Blueprint', 'ABP2D_NewAnimBP');
          if (name) {
            const abp = this._animBPManager!.createAsset2D(name);
            this._folderManager.setAssetLocation(abp.id, 'animBP', this._currentFolderId);
            this._selectedIds.clear(); this._selectedIds.add(abp.id);
            if (this._onOpenAnimBP) this._onOpenAnimBP(abp);
          }
        }
      });
    }
    if (this._gameInstanceManager) {
      bpItems.push({
        icon: iconHTML(Icons.Circle, 12, ICON_COLORS.blueprint), label: 'Game Instance', keywords: 'game instance global singleton',
        action: async () => {
          const name = await this._showNameDialog('New Game Instance', 'GI_Default');
          if (name) {
            const gi = this._gameInstanceManager!.createAsset(name);
            this._folderManager.setAssetLocation(gi.id, 'gameInstance', this._currentFolderId);
            this._selectedIds.clear(); this._selectedIds.add(gi.id);
            if (this._onOpenGameInstance) this._onOpenGameInstance(gi);
          }
        }
      });
    }
    categories.push({ id: 'blueprints', label: 'Blueprints', icon: iconHTML(Icons.GitBranch, 12, ICON_COLORS.blueprint), color: ICON_COLORS.blueprint, items: bpItems });

    // Data
    const dataItems: CbMenuItem[] = [];
    if (this._structManager) {
      dataItems.push({
        icon: iconHTML(Icons.FileText, 12, '#a78bfa'), label: 'Structure', keywords: 'struct data type',
        action: async () => {
          const name = await this._showNameDialog('New Structure', 'F_NewStruct');
          if (name) {
            const sa = this._structManager!.createStructure(name);
            this._folderManager.setAssetLocation(sa.id, 'structure', this._currentFolderId);
            this._selectedIds.clear(); this._selectedIds.add(sa.id);
            if (this._onOpenStructure) this._onOpenStructure(sa);
          }
        }
      });
      dataItems.push({
        icon: iconHTML(Icons.List, 12, ICON_COLORS.muted), label: 'Enumeration', keywords: 'enum list values',
        action: async () => {
          const name = await this._showNameDialog('New Enum', 'E_NewEnum');
          if (name) {
            const ea = this._structManager!.createEnum(name);
            this._folderManager.setAssetLocation(ea.id, 'enum', this._currentFolderId);
            this._selectedIds.clear(); this._selectedIds.add(ea.id);
            if (this._onOpenEnum) this._onOpenEnum(ea);
          }
        }
      });
    }
    if (this._saveGameManager) {
      dataItems.push({
        icon: iconHTML(Icons.Save, 12, '#FF7043'), label: 'Save Game Object', keywords: 'save game persist storage',
        action: async () => {
          const name = await this._showNameDialog('New Save Game', 'SG_NewSaveGame');
          if (name) {
            const sg = this._saveGameManager!.createAsset(name);
            this._folderManager.setAssetLocation(sg.id, 'saveGame', this._currentFolderId);
            this._selectedIds.clear(); this._selectedIds.add(sg.id);
            if (this._onOpenSaveGame) this._onOpenSaveGame(sg);
          }
        }
      });
    }
    if (dataItems.length > 0) {
      categories.push({ id: 'data', label: 'Data', icon: iconHTML(Icons.FileText, 12, '#a78bfa'), color: '#a78bfa', items: dataItems });
    }

    // Materials
    if (this._meshManager) {
      categories.push({
        id: 'materials', label: 'Materials', icon: iconHTML(Icons.CircleDot, 12, ICON_COLORS.material), color: ICON_COLORS.material,
        items: [{
          icon: iconHTML(Icons.CircleDot, 12, ICON_COLORS.material), label: 'Material', keywords: 'material shader pbr',
          action: async () => {
            const name = await this._showNameDialog('New Material', 'M_NewMaterial');
            if (name) {
              const matId = `mat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
              const newMat: MaterialAssetJSON = {
                assetId: matId, assetName: name, meshAssetId: '',
                materialData: {
                  type: 'PBR', baseColor: '#808080', metalness: 0, roughness: 0.8,
                  emissive: '#000000', emissiveIntensity: 0, opacity: 1, doubleSided: false,
                  alphaMode: 'OPAQUE', baseColorMap: null, normalMap: null,
                  metallicRoughnessMap: null, emissiveMap: null, occlusionMap: null,
                },
              };
              this._meshManager!.allMaterials.push(newMat);
              this._folderManager.setAssetLocation(matId, 'material', this._currentFolderId);
              this._selectedIds.clear(); this._selectedIds.add(matId);
              this._refreshGrid();
              this._onOpenMaterial?.(newMat);
            }
          }
        }]
      });
    }

    // 2D Assets
    categories.push({
      id: '2d', label: '2D Assets', icon: iconHTML(Icons.Image, 12, '#4fc3f7'), color: '#4fc3f7',
      items: [
        { icon: iconHTML(Icons.Image, 12, '#4fc3f7'), label: 'Sprite Actor', action: () => this._createNewAsset('spriteActor'), keywords: 'sprite 2d actor' },
        { icon: iconHTML(Icons.PersonStanding, 12, '#66bb6a'), label: 'Character Pawn 2D', action: () => this._createNewAsset('characterPawn2D'), keywords: 'character 2d pawn' },
        { icon: iconHTML(Icons.Layers, 12, '#8d6e63'), label: 'Tilemap Actor', action: () => this._createNewAsset('tilemapActor'), keywords: 'tilemap tile map' },
        { icon: iconHTML(Icons.Layers, 12, '#7e57c2'), label: 'Parallax Layer', action: () => this._createNewAsset('parallaxLayer'), keywords: 'parallax layer scroll' },
      ]
    });

    // Audio
    const audioItems: CbMenuItem[] = [];
    const soundLib = SoundLibrary.instance;
    if (soundLib) {
      audioItems.push({
        icon: iconHTML(Icons.Volume2, 12, '#FF5722'), label: 'Sound Cue', keywords: 'sound cue audio music sfx',
        action: async () => {
          const name = await this._showNameDialog('New Sound Cue', 'SC_NewSoundCue');
          if (name) {
            const cue = soundLib.createCue(name);
            this._folderManager.setAssetLocation(cue.assetId, 'soundCue', this._currentFolderId);
            this._selectedIds.clear(); this._selectedIds.add(cue.assetId);
            this._refreshGrid();
            this._onOpenSoundCue?.(cue);
          }
        }
      });
    }
    if (audioItems.length > 0) {
      categories.push({ id: 'audio', label: 'Audio', icon: iconHTML(Icons.Volume2, 12, '#FF5722'), color: '#FF5722', items: audioItems });
    }

    // Import
    const importItems: CbMenuItem[] = [];
    if (this._meshManager) {
      importItems.push({ icon: iconHTML(Icons.Upload, 12, ICON_COLORS.muted), label: 'Import Mesh…', action: () => this._triggerMeshFileImport(), keywords: 'import mesh fbx obj 3d' });
    }
    importItems.push({ icon: iconHTML(Icons.Image, 12, '#4ade80'), label: 'Import Texture…', action: () => this._triggerTextureImport(), keywords: 'import texture image png' });
    importItems.push({ icon: iconHTML(Icons.Volume2, 12, '#E91E63'), label: 'Import Audio…', action: () => this._triggerAudioImport(), keywords: 'import audio sound wav mp3' });
    categories.push({ id: 'import', label: 'Import', icon: iconHTML(Icons.Upload, 12, ICON_COLORS.muted), color: ICON_COLORS.muted, items: importItems });

    // ── Build the menu DOM ──
    const menu = document.createElement('div');
    menu.className = 'cb-ctx-menu';
    if (e instanceof MouseEvent) {
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
    } else {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = rect.bottom + 2 + 'px';
    }

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'cb-ctx-search-wrap';
    const searchIcon = document.createElement('span');
    searchIcon.className = 'cb-ctx-search-icon';
    searchIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
    const searchInput = document.createElement('input');
    searchInput.className = 'cb-ctx-search';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search actions…';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);
    menu.appendChild(searchWrap);

    // Body area (scrollable)
    const body = document.createElement('div');
    body.className = 'cb-ctx-body';
    menu.appendChild(body);

    // Active submenu tracking
    let activeSubmenu: HTMLElement | null = null;
    let activeCatId: string | null = null;
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearSubmenu = () => {
      if (activeSubmenu) { activeSubmenu.remove(); activeSubmenu = null; }
      activeCatId = null;
      body.querySelectorAll('.cb-ctx-cat--active').forEach(el => el.classList.remove('cb-ctx-cat--active'));
    };

    // ── Render default (category) view ──
    const renderCategories = () => {
      body.innerHTML = '';
      clearSubmenu();

      // New Folder — always at top
      const folderItem = document.createElement('div');
      folderItem.className = 'cb-ctx-item';
      folderItem.innerHTML = `${iconHTML(Icons.FolderPlus, 12, ICON_COLORS.folder)} <span>New Folder</span>`;
      folderItem.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        this._closeContextMenu();
        const name = await this._showNameDialog('New Folder', 'NewFolder');
        if (name) {
          this._folderManager.createFolder(name, this._currentFolderId);
          this._expandedFolders.add(this._currentFolderId);
        }
      });
      body.appendChild(folderItem);

      const sep = document.createElement('div');
      sep.className = 'cb-ctx-sep';
      body.appendChild(sep);

      // Category rows with submenus
      for (const cat of categories) {
        const row = document.createElement('div');
        row.className = 'cb-ctx-cat';
        row.setAttribute('data-cat', cat.id);

        const left = document.createElement('div');
        left.className = 'cb-ctx-cat-left';
        left.innerHTML = `<span class="cb-ctx-cat-dot" style="background:${cat.color}"></span> <span>${cat.label}</span>`;

        const arrow = document.createElement('span');
        arrow.className = 'cb-ctx-cat-arrow';
        arrow.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;

        const badge = document.createElement('span');
        badge.className = 'cb-ctx-cat-badge';
        badge.textContent = String(cat.items.length);

        row.appendChild(left);
        row.appendChild(badge);
        row.appendChild(arrow);

        // Show submenu on hover
        row.addEventListener('mouseenter', () => {
          if (hoverTimeout) clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            if (activeCatId === cat.id) return;
            clearSubmenu();
            activeCatId = cat.id;
            row.classList.add('cb-ctx-cat--active');
            showSubmenu(cat, row);
          }, 80);
        });

        // Click also opens submenu immediately
        row.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (hoverTimeout) clearTimeout(hoverTimeout);
          if (activeCatId === cat.id) return;
          clearSubmenu();
          activeCatId = cat.id;
          row.classList.add('cb-ctx-cat--active');
          showSubmenu(cat, row);
        });

        body.appendChild(row);
      }
    };

    // ── Show a flyout submenu ──
    const showSubmenu = (cat: CbMenuCategory, anchor: HTMLElement) => {
      const sub = document.createElement('div');
      sub.className = 'cb-ctx-submenu';

      const subHeader = document.createElement('div');
      subHeader.className = 'cb-ctx-sub-header';
      subHeader.innerHTML = `<span class="cb-ctx-cat-dot" style="background:${cat.color}"></span> ${cat.label}`;
      sub.appendChild(subHeader);

      for (const item of cat.items) {
        const row = document.createElement('div');
        row.className = 'cb-ctx-item';
        row.innerHTML = `${item.icon} <span>${item.label}</span>`;
        row.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._closeContextMenu();
          item.action();
        });
        sub.appendChild(row);
      }

      // Position submenu to the right of the anchor
      menu.appendChild(sub);
      activeSubmenu = sub;

      requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const subRect = sub.getBoundingClientRect();

        // Vertical: align top with the category row
        let top = anchorRect.top - menuRect.top - 4;
        // Keep within viewport
        if (anchorRect.top + subRect.height > window.innerHeight - 8) {
          top = Math.max(0, window.innerHeight - 8 - subRect.height - menuRect.top);
        }
        sub.style.top = top + 'px';

        // Horizontal: to the right, or flip left if no space
        if (menuRect.right + subRect.width + 4 > window.innerWidth) {
          sub.style.right = '100%';
          sub.style.left = 'auto';
          sub.style.marginRight = '2px';
        } else {
          sub.style.left = '100%';
          sub.style.right = 'auto';
          sub.style.marginLeft = '2px';
        }
      });

      // Keep submenu alive when hovering it
      sub.addEventListener('mouseenter', () => {
        if (hoverTimeout) clearTimeout(hoverTimeout);
      });
      sub.addEventListener('mouseleave', () => {
        hoverTimeout = setTimeout(() => clearSubmenu(), 200);
      });
    };

    // ── Search filtering ──
    const renderSearchResults = (query: string) => {
      body.innerHTML = '';
      clearSubmenu();
      const lc = query.toLowerCase();
      let count = 0;

      for (const cat of categories) {
        const matches = cat.items.filter(it =>
          it.label.toLowerCase().includes(lc) ||
          (it.keywords && it.keywords.toLowerCase().includes(lc)) ||
          cat.label.toLowerCase().includes(lc)
        );
        if (matches.length === 0) continue;

        // Category label
        const header = document.createElement('div');
        header.className = 'cb-ctx-search-cat';
        header.innerHTML = `<span class="cb-ctx-cat-dot" style="background:${cat.color}"></span> ${cat.label}`;
        body.appendChild(header);

        for (const item of matches) {
          const row = document.createElement('div');
          row.className = 'cb-ctx-item';

          // Highlight matched text in label
          const idx = item.label.toLowerCase().indexOf(lc);
          let labelHtml = item.label;
          if (idx >= 0) {
            labelHtml = escapeCtxHtml(item.label.slice(0, idx))
              + `<mark class="cb-ctx-match">${escapeCtxHtml(item.label.slice(idx, idx + lc.length))}</mark>`
              + escapeCtxHtml(item.label.slice(idx + lc.length));
          } else {
            labelHtml = escapeCtxHtml(item.label);
          }
          row.innerHTML = `${item.icon} <span>${labelHtml}</span>`;

          row.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this._closeContextMenu();
            item.action();
          });
          body.appendChild(row);
          count++;
        }
      }

      // Also show "New Folder" if it matches
      if ('new folder'.includes(lc) || 'folder'.includes(lc)) {
        const row = document.createElement('div');
        row.className = 'cb-ctx-item';
        row.innerHTML = `${iconHTML(Icons.FolderPlus, 12, ICON_COLORS.folder)} <span>New Folder</span>`;
        row.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          this._closeContextMenu();
          const name = await this._showNameDialog('New Folder', 'NewFolder');
          if (name) {
            this._folderManager.createFolder(name, this._currentFolderId);
            this._expandedFolders.add(this._currentFolderId);
          }
        });
        body.insertBefore(row, body.firstChild);
        count++;
      }

      if (count === 0) {
        const empty = document.createElement('div');
        empty.className = 'cb-ctx-empty';
        empty.textContent = 'No matching actions';
        body.appendChild(empty);
      }
    };

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      if (q.length === 0) renderCategories();
      else renderSearchResults(q);
    });
    searchInput.addEventListener('mousedown', (ev) => ev.stopPropagation());

    // Initial render
    renderCategories();

    // ── Keyboard navigation ──
    let hlIdx = -1;
    const getItems = () => Array.from(body.querySelectorAll('.cb-ctx-item, .cb-ctx-cat')) as HTMLElement[];

    const setHl = (idx: number) => {
      const items = getItems();
      items.forEach(el => el.classList.remove('cb-ctx-hl'));
      if (idx >= 0 && idx < items.length) {
        hlIdx = idx;
        items[idx].classList.add('cb-ctx-hl');
        items[idx].scrollIntoView({ block: 'nearest' });
      }
    };

    menu.addEventListener('keydown', (ev) => {
      const items = getItems();
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        setHl(Math.min(hlIdx + 1, items.length - 1));
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        setHl(Math.max(hlIdx - 1, 0));
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (hlIdx >= 0 && hlIdx < items.length) items[hlIdx].click();
      } else if (ev.key === 'ArrowRight') {
        // Open submenu for highlighted category
        if (hlIdx >= 0 && hlIdx < items.length && items[hlIdx].classList.contains('cb-ctx-cat')) {
          items[hlIdx].click();
        }
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        this._closeContextMenu();
      }
    });

    // Prevent menu from closing when interacting with it
    menu.addEventListener('mousedown', (ev) => ev.stopPropagation());

    // ── Position & show ──
    document.body.appendChild(menu);
    this._contextMenu = menu;

    // Keep within viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        menu.style.left = Math.max(8, window.innerWidth - rect.width - 8) + 'px';
      }
      if (rect.bottom > window.innerHeight - 8) {
        menu.style.top = Math.max(8, window.innerHeight - rect.height - 8) + 'px';
      }
      searchInput.focus();
    });
  }

  // ── Actor context menu ──
  private _showAssetContextMenu(e: MouseEvent, asset: ActorAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => this._onOpenAsset(asset));

    this._addMenuSeparator(menu);

    // Inheritance
    this._addMenuItem(menu, iconHTML(Icons.PlusCircle, 12, ICON_COLORS.blue) + ' Create Child Class', async () => {
      const inh = ClassInheritanceSystem.instance;
      const name = await this._showNameDialog(`Create Child of ${asset.name}`, `${asset.name}_Child`);
      if (name) {
        const child = inh.createChildActor(asset.id, name);
        if (child) {
          this._folderManager.setAssetLocation(child.id, 'actor', this._currentFolderId);
          this._selectedIds.clear();
          this._selectedIds.add(child.id);
          this._refreshGrid();
        }
      }
    });

    this._addMenuItem(menu, iconHTML(Icons.GitBranch, 12, ICON_COLORS.muted) + ' Show in Hierarchy', () => {
      this._onShowInHierarchy?.(asset.id, 'actor');
    });

    const inh = ClassInheritanceSystem.instance;
    const childCount = inh.getActorChildren(asset.id).length;
    if (childCount > 0) {
      this._addMenuItem(menu, iconHTML(Icons.ChevronsDownUp, 12, ICON_COLORS.muted) + ` Show Children (${childCount})`, () => {
        this._onShowInHierarchy?.(asset.id, 'actor');
      });
    }

    const entry = inh.getActorEntry(asset.id);
    if (entry) {
      this._addMenuItem(menu, iconHTML(Icons.RefreshCw, 12, ICON_COLORS.muted) + ' Change Parent Class', async () => {
        const allActors = this._manager.assets.filter(a => a.id !== asset.id);
        const parentOptions = allActors.map(a => ({ id: a.id, name: a.name }));
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

    this._addMenuSeparator(menu);

    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename    <span class="cb-shortcut">F2</span>', async () => {
      const newName = await this._showNameDialog('Rename Actor', asset.name);
      if (newName) this._manager.renameAsset(asset.id, newName);
    });

    this._addMenuItem(menu, iconHTML(Icons.Copy, 12, ICON_COLORS.muted) + ' Duplicate    <span class="cb-shortcut">Ctrl+D</span>', () => {
      this._selectedIds.clear();
      this._selectedIds.add(asset.id);
      this._duplicateSelected();
    });

    this._addMenuSeparator(menu);

    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete    <span class="cb-shortcut">Del</span>', () => {
      const inh2 = ClassInheritanceSystem.instance;
      const children = inh2.getActorChildren(asset.id);
      const msg = children.length > 0
        ? `Delete actor "${asset.name}"? This is a parent class with ${children.length} child(ren). Children will be orphaned.`
        : `Delete actor "${asset.name}"?`;
      if (confirm(msg)) {
        inh2.unregisterActor(asset.id);
        this._manager.removeAsset(asset.id);
        this._selectedIds.delete(asset.id);
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Widget BP context menu ──
  private _showWidgetBPContextMenu(e: MouseEvent, wbp: WidgetBlueprintAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => this._onOpenWidgetBP?.(wbp));

    this._addMenuSeparator(menu);

    this._addMenuItem(menu, iconHTML(Icons.PlusCircle, 12, ICON_COLORS.blue) + ' Create Child Class', async () => {
      const inh = ClassInheritanceSystem.instance;
      const name = await this._showNameDialog(`Create Child of ${wbp.name}`, `${wbp.name}_Child`);
      if (name) {
        const child = inh.createChildWidget(wbp.id, name);
        if (child) {
          this._folderManager.setAssetLocation(child.id, 'widget', this._currentFolderId);
          this._selectedIds.clear();
          this._selectedIds.add(child.id);
          this._refreshGrid();
        }
      }
    });

    this._addMenuItem(menu, iconHTML(Icons.GitBranch, 12, ICON_COLORS.muted) + ' Show in Hierarchy', () => {
      this._onShowInHierarchy?.(wbp.id, 'widget');
    });

    const inh = ClassInheritanceSystem.instance;
    const childCount = inh.getWidgetChildren(wbp.id).length;
    if (childCount > 0) {
      this._addMenuItem(menu, iconHTML(Icons.ChevronsDownUp, 12, ICON_COLORS.muted) + ` Show Children (${childCount})`, () => {
        this._onShowInHierarchy?.(wbp.id, 'widget');
      });
    }

    this._addMenuSeparator(menu);

    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Widget Blueprint', wbp.name);
      if (newName) this._widgetBPManager!.renameAsset(wbp.id, newName);
    });

    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      const inh2 = ClassInheritanceSystem.instance;
      const children = inh2.getWidgetChildren(wbp.id);
      const msg = children.length > 0
        ? `Delete widget "${wbp.name}"? This is a parent class with ${children.length} child(ren). Children will be orphaned.`
        : `Delete widget blueprint "${wbp.name}"?`;
      if (confirm(msg)) {
        inh2.unregisterWidget(wbp.id);
        this._widgetBPManager!.removeAsset(wbp.id);
        this._selectedIds.delete(wbp.id);
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Structure context menu ──
  private _showStructContextMenu(e: MouseEvent, sa: StructureAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => this._onOpenStructure?.(sa));
    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Structure', sa.name);
      if (newName) this._structManager!.renameStructure(sa.id, newName);
    });
    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete structure "${sa.name}"?`)) {
        this._structManager!.removeStructure(sa.id);
        this._selectedIds.delete(sa.id);
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Enum context menu ──
  private _showEnumContextMenu(e: MouseEvent, ea: EnumAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => this._onOpenEnum?.(ea));
    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Enum', ea.name);
      if (newName) this._structManager!.renameEnum(ea.id, newName);
    });
    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete enum "${ea.name}"?`)) {
        this._structManager!.removeEnum(ea.id);
        this._selectedIds.delete(ea.id);
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Mesh context menu ──
  private _showMeshContextMenu(e: MouseEvent, meshAsset: MeshAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Mesh Asset', meshAsset.name);
      if (newName) this._meshManager!.renameAsset(meshAsset.id, newName);
    });

    // Info
    const infoItem = document.createElement('div');
    infoItem.className = 'context-menu-item cb-info-row';
    infoItem.textContent = `${meshAsset.assetType} · ${meshAsset.sourceFile}`;
    menu.appendChild(infoItem);

    this._addMenuSeparator(menu);

    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete mesh asset "${meshAsset.name}"?`)) {
        this._meshManager!.removeAsset(meshAsset.id);
        this._selectedIds.delete(meshAsset.id);
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Material context menu ──
  private _showMaterialContextMenu(e: MouseEvent, mat: MaterialAssetJSON): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => this._onOpenMaterial?.(mat));
    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Material', mat.assetName);
      if (newName) { mat.assetName = newName; this._refreshGrid(); }
    });

    // Info
    const infoItem = document.createElement('div');
    infoItem.className = 'context-menu-item cb-info-row';
    infoItem.textContent = `${mat.materialData.type} · ${mat.materialData.baseColor}`;
    menu.appendChild(infoItem);

    this._addMenuSeparator(menu);

    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete material "${mat.assetName}"?`)) {
        const idx = this._meshManager!.allMaterials.findIndex(m => m.assetId === mat.assetId);
        if (idx >= 0) this._meshManager!.allMaterials.splice(idx, 1);
        this._folderManager.removeAssetLocation(mat.assetId, 'material');
        this._selectedIds.delete(mat.assetId);
        this._refreshGrid();
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Anim BP context menu ──
  private _showAnimBPContextMenu(e: MouseEvent, abp: AnimBlueprintAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => this._onOpenAnimBP?.(abp));
    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Animation Blueprint', abp.name);
      if (newName) this._animBPManager!.renameAsset(abp.id, newName);
    });
    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete animation blueprint "${abp.name}"?`)) {
        this._animBPManager!.removeAsset(abp.id);
        this._selectedIds.delete(abp.id);
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Game Instance context menu ──
  private _showGameInstanceContextMenu(e: MouseEvent, gi: GameInstanceBlueprintAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => this._onOpenGameInstance?.(gi));
    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Game Instance', gi.name);
      if (newName && newName !== gi.name) this._gameInstanceManager!.renameAsset(gi.id, newName);
    });
    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete game instance "${gi.name}"?`)) {
        this._gameInstanceManager!.removeAsset(gi.id);
        this._folderManager.removeAssetLocation(gi.id, 'gameInstance');
        this._selectedIds.delete(gi.id);
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Save Game context menu ──
  private _showSaveGameContextMenu(e: MouseEvent, sg: SaveGameAsset): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => this._onOpenSaveGame?.(sg));
    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Save Game', sg.name);
      if (newName && newName !== sg.name) this._saveGameManager!.renameAsset(sg.id, newName);
    });
    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete save game class "${sg.name}"?`)) {
        this._saveGameManager!.removeAsset(sg.id);
        this._folderManager.removeAssetLocation(sg.id, 'saveGame');
        this._selectedIds.delete(sg.id);
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Texture context menu ──
  private _showTextureContextMenu(e: MouseEvent, tex: import('./TextureLibrary').TextureAssetData): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Texture', tex.assetName);
      if (newName) { tex.assetName = newName; this._refreshGrid(); }
    });
    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete texture "${tex.assetName}"?`)) {
        TextureLibrary.instance?.removeTexture(tex.assetId);
        this._folderManager.removeAssetLocation(tex.assetId, 'texture');
        this._selectedIds.delete(tex.assetId);
        this._refreshGrid();
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Folder context menu ──
  private _showFolderContextMenu(e: MouseEvent, folder: FolderNode): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FolderPlus, 12, ICON_COLORS.folder) + ' New Folder', async () => {
      const name = await this._showNameDialog('New Folder', 'NewFolder');
      if (name) {
        this._folderManager.createFolder(name, folder.id);
        this._expandedFolders.add(folder.id);
      }
    });

    if (folder.id !== this._folderManager.getRootFolderId()) {
      this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
        const name = await this._showNameDialog('Rename Folder', folder.name);
        if (name) this._folderManager.renameFolder(folder.id, name);
      });

      const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete Folder', () => {
        if (confirm(`Delete folder "${folder.name}"?`)) {
          this._folderManager.deleteFolder(folder.id);
          if (this._currentFolderId === folder.id) {
            this._currentFolderId = folder.parentId || this._folderManager.getRootFolderId();
            this._navigateTo(this._currentFolderId);
          }
        }
      });
      delItem.style.color = 'var(--danger, #f87171)';
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ── Import submenu ──
  private _showImportMenu(e: MouseEvent | Event): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    if (e instanceof MouseEvent) {
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
    } else {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = rect.bottom + 2 + 'px';
    }

    const header = document.createElement('div');
    header.className = 'context-menu-header';
    header.textContent = 'IMPORT';
    menu.appendChild(header);

    this._addMenuItem(menu, iconHTML(Icons.Box, 12, ICON_COLORS.mesh) + ' Import Mesh…', () => this._triggerMeshFileImport());
    this._addMenuItem(menu, iconHTML(Icons.Image, 12, '#4ade80') + ' Import Texture…', () => this._triggerTextureImport());
    this._addMenuItem(menu, iconHTML(Icons.Volume2, 12, '#E91E63') + ' Import Audio…', () => this._triggerAudioImport());

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ============================================================
  //  Import Pipeline (preserved logic)
  // ============================================================

  private async _triggerTextureImport(): Promise<void> {
    const result = await showTextureImportDialog();
    if (result.cancelled || result.textureIds.length === 0) return;
    for (const texId of result.textureIds) {
      this._folderManager.setAssetLocation(texId, 'texture', this._currentFolderId);
    }
    this._selectedIds.clear();
    this._selectedIds.add(result.textureIds[0]);
    this._refreshGrid();
  }

  private _handleFileDrop(fileList: FileList): void {
    const meshFiles: File[] = [];
    const imageFiles: File[] = [];
    const audioFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (this._isImageFile(f.name)) imageFiles.push(f);
      else if (this._isAudioFile(f.name)) audioFiles.push(f);
      else meshFiles.push(f);
    }
    if (meshFiles.length > 0) {
      const dt = new DataTransfer();
      for (const f of meshFiles) dt.items.add(f);
      this._handleMeshFileDrop(dt.files);
    }
    if (imageFiles.length > 0) this._handleTextureFileDrop(imageFiles);
    if (audioFiles.length > 0) this._handleAudioFileDrop(audioFiles);
  }

  private _isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tga', 'tiff', 'tif', 'ico'].includes(ext);
  }

  private _isAudioFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['mp3', 'wav', 'ogg', 'flac', 'webm', 'aac', 'm4a', 'wma'].includes(ext);
  }

  private async _handleTextureFileDrop(files: File[]): Promise<void> {
    const result = await showTextureImportDialog(files);
    if (result.cancelled || result.textureIds.length === 0) return;
    for (const texId of result.textureIds) {
      this._folderManager.setAssetLocation(texId, 'texture', this._currentFolderId);
    }
    this._selectedIds.clear();
    this._selectedIds.add(result.textureIds[0]);
    this._refreshGrid();
  }

  private _triggerMeshFileImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gltf,.glb,.fbx,.obj,.dae,.stl,.ply';
    input.multiple = true;
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) this._handleMeshFileDrop(input.files);
      input.remove();
    });
    const cleanup = () => {
      setTimeout(() => {
        if (input.parentNode && (!input.files || input.files.length === 0)) input.remove();
      }, 300);
      window.removeEventListener('focus', cleanup);
    };
    window.addEventListener('focus', cleanup);
    input.click();
  }

  private async _handleMeshFileDrop(fileList: FileList): Promise<void> {
    if (!this._meshManager) return;
    const importables: File[] = [];
    const extras = new Map<string, File>();
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (isImportableFile(file.name)) importables.push(file);
      else extras.set(file.name, file);
    }
    if (importables.length === 0) return;

    for (const file of importables) {
      let detectedInfo;
      try {
        detectedInfo = await detectFileContent(file, extras.size > 0 ? extras : undefined);
      } catch (err) {
        console.warn('[Import] File detection failed for', file.name, err);
      }

      const dialogResult = await showImportDialog(file, detectedInfo);
      if (dialogResult.cancelled) continue;

      const progress = showImportProgress();
      try {
        const result = await importMeshFile(
          file, dialogResult.settings,
          extras.size > 0 ? extras : undefined,
          (msg) => progress.update(msg),
          (step, totalSteps, msg) => {
            const pct = Math.round((step / totalSteps) * 100);
            progress.update(msg, pct);
          },
        );
        if (result.report.warnings.length > 0) console.warn('[MeshImport] Warnings:', result.report.warnings);
        this._meshManager.addImportedAsset(result.meshAsset, result.materials, result.textures, result.animations);
        this._folderManager.setAssetLocation(result.meshAsset.assetId, 'mesh', this._currentFolderId);
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

  // ============================================================
  //  Asset Creation (preserved logic)
  // ============================================================

  private async _createNewAsset(actorType: ActorType = 'actor'): Promise<void> {
    // For Character Pawn 2D, show a preset selection dialog first
    let preset2D: 'platformer' | 'topdown' | 'blank' | undefined;
    if (actorType === 'characterPawn2D') {
      const choice = await this._showPresetDialog();
      if (!choice) return;               // user cancelled
      preset2D = choice;
    }

    const defaultNames: Record<string, string> = {
      actor: 'BP_NewActor',
      characterPawn: 'BP_CharacterPawn',
      playerController: 'BP_PlayerController',
      aiController: 'BP_AIController',
      spriteActor: 'BP_SpriteActor',
      characterPawn2D: 'BP_CharacterPawn2D',
      tilemapActor: 'BP_TilemapActor',
      parallaxLayer: 'BP_ParallaxLayer',
    };
    const titles: Record<string, string> = {
      actor: 'New Actor Asset',
      characterPawn: 'New Character Pawn',
      playerController: 'New Player Controller',
      aiController: 'New AI Controller',
      spriteActor: 'New Sprite Actor',
      characterPawn2D: 'New Character Pawn 2D',
      tilemapActor: 'New Tilemap Actor',
      parallaxLayer: 'New Parallax Layer',
    };
    const defaultName = defaultNames[actorType] || 'BP_NewActor';
    const title = titles[actorType] || 'New Actor Asset';
    const name = await this._showNameDialog(title, defaultName);
    if (!name) return;
    const asset = this._manager.createAsset(name, actorType, preset2D);
    this._folderManager.setAssetLocation(asset.id, 'actor', this._currentFolderId);
    this._selectedIds.clear();
    this._selectedIds.add(asset.id);
  }

  // ============================================================
  //  Character Pawn 2D Preset Dialog
  // ============================================================

  private _showPresetDialog(): Promise<'platformer' | 'topdown' | 'blank' | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'cb-dialog-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'cb-dialog';
      dialog.style.minWidth = '520px';

      const titleEl = document.createElement('div');
      titleEl.className = 'cb-dialog-title';
      titleEl.textContent = 'Create Character Pawn 2D';

      const subtitle = document.createElement('div');
      subtitle.className = 'cb-preset-subtitle';
      subtitle.textContent = 'Choose a preset to start with. This will set up physics and blueprint nodes for you.';

      // ── Preset cards ──
      const cards = document.createElement('div');
      cards.className = 'cb-preset-cards';

      type Preset = { key: 'platformer' | 'topdown' | 'blank'; icon: string; title: string; desc: string };
      const presets: Preset[] = [
        { key: 'platformer', icon: iconHTML(Icons.PersonStanding, 'lg', ICON_COLORS.actor), title: 'Platformer', desc: 'Side-scrolling movement with gravity, jump, and left/right controls.' },
        { key: 'topdown',    icon: iconHTML(Icons.Target, 'lg', ICON_COLORS.secondary), title: 'Top-Down',   desc: '4-directional movement with no gravity. WASD controls.' },
        { key: 'blank',      icon: iconHTML(Icons.FileText, 'lg', ICON_COLORS.muted), title: 'Blank',      desc: 'Empty blueprint with just BeginPlay and Tick events.' },
      ];

      let selected: Preset['key'] = 'platformer';

      const cardEls: HTMLElement[] = [];
      for (const preset of presets) {
        const card = document.createElement('div');
        card.className = 'cb-preset-card' + (preset.key === selected ? ' selected' : '');

        const icon = document.createElement('div');
        icon.className = 'cb-preset-card-icon';
        icon.innerHTML = preset.icon;

        const ti = document.createElement('div');
        ti.className = 'cb-preset-card-title';
        ti.textContent = preset.title;

        const de = document.createElement('div');
        de.className = 'cb-preset-card-desc';
        de.textContent = preset.desc;

        card.append(icon, ti, de);
        card.addEventListener('click', () => {
          selected = preset.key;
          cardEls.forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        });

        // Double-click to confirm immediately
        card.addEventListener('dblclick', () => {
          selected = preset.key;
          finish(selected);
        });

        cards.appendChild(card);
        cardEls.push(card);
      }

      // ── Buttons ──
      const buttons = document.createElement('div');
      buttons.className = 'cb-dialog-buttons';

      const btnCancel = document.createElement('button');
      btnCancel.textContent = 'Cancel';
      btnCancel.className = 'cb-dialog-btn';

      const btnOk = document.createElement('button');
      btnOk.textContent = 'Create';
      btnOk.className = 'cb-dialog-btn cb-dialog-btn-primary';

      buttons.append(btnCancel, btnOk);
      dialog.append(titleEl, subtitle, cards, buttons);
      overlay.appendChild(dialog);

      const finish = (value: Preset['key'] | null) => {
        overlay.remove();
        resolve(value);
      };

      btnOk.addEventListener('click', () => finish(selected));
      btnCancel.addEventListener('click', () => finish(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') finish(null);
        if (e.key === 'Enter') finish(selected);
      });

      document.body.appendChild(overlay);
      // Focus overlay so keyboard events work immediately
      overlay.tabIndex = -1;
      overlay.focus();
    });
  }

  // ============================================================
  //  Name Dialog (preserved)
  // ============================================================

  private _showNameDialog(title: string, defaultValue: string): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'cb-dialog-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'cb-dialog';

      const titleEl = document.createElement('div');
      titleEl.className = 'cb-dialog-title';
      titleEl.textContent = title;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = defaultValue;
      input.className = 'cb-dialog-input';

      const buttons = document.createElement('div');
      buttons.className = 'cb-dialog-buttons';

      const btnCancel = document.createElement('button');
      btnCancel.textContent = 'Cancel';
      btnCancel.className = 'cb-dialog-btn';

      const btnOk = document.createElement('button');
      btnOk.textContent = 'OK';
      btnOk.className = 'cb-dialog-btn cb-dialog-btn-primary';

      buttons.appendChild(btnCancel);
      buttons.appendChild(btnOk);
      dialog.append(titleEl, input, buttons);
      overlay.appendChild(dialog);

      const finish = (value: string | null) => {
        overlay.remove();
        resolve(value && value.trim() ? value.trim() : null);
      };

      btnOk.addEventListener('click', () => finish(input.value));
      btnCancel.addEventListener('click', () => finish(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(input.value);
        if (e.key === 'Escape') finish(null);
      });

      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  // ============================================================
  //  Audio Import Pipeline
  // ============================================================

  private _triggerAudioImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav,.ogg,.flac,.webm,.aac,.m4a';
    input.multiple = true;
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        const files: File[] = [];
        for (let i = 0; i < input.files.length; i++) files.push(input.files[i]);
        this._handleAudioFileDrop(files);
      }
      input.remove();
    });
    const cleanup = () => {
      setTimeout(() => {
        if (input.parentNode && (!input.files || input.files.length === 0)) input.remove();
      }, 300);
      window.removeEventListener('focus', cleanup);
    };
    window.addEventListener('focus', cleanup);
    input.click();
  }

  private async _handleAudioFileDrop(files: File[]): Promise<void> {
    const soundLib = SoundLibrary.instance;
    if (!soundLib) return;

    for (const file of files) {
      try {
        const asset = await soundLib.importFromFile(file);
        this._folderManager.setAssetLocation(asset.assetId, 'sound', this._currentFolderId);
        this._selectedIds.clear();
        this._selectedIds.add(asset.assetId);
      } catch (err) {
        console.error(`[ContentBrowser] Failed to import audio file: ${file.name}`, err);
      }
    }
    this._refreshGrid();
  }

  // ============================================================
  //  Sound / Sound Cue Context Menus
  // ============================================================

  private _showSoundContextMenu(e: MouseEvent, sound: SoundAssetData): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.Play, 12, '#60a5fa') + ' Preview', () => {
      const audio = new Audio(sound.storedData);
      audio.volume = sound.settings.defaultVolume;
      audio.play().catch(() => {});
    });

    this._addMenuItem(menu, iconHTML(Icons.Volume2, 12, '#FF5722') + ' Create Sound Cue from This', async () => {
      const soundLib = SoundLibrary.instance;
      if (!soundLib) return;
      const name = await this._showNameDialog('New Sound Cue', `SC_${sound.assetName}`);
      if (name) {
        const cue = soundLib.createCue(name);
        // Add a Wave Player node for this sound, wired to the output
        const wpId = 'scn_' + Date.now().toString(36) + '_wp';
        cue.nodes.push({
          id: wpId, type: 'wavePlayer' as const,
          x: 150, y: 200,
          soundAssetId: sound.assetId,
          volume: 1.0, pitchMin: 1.0, pitchMax: 1.0,
        });
        const outNode = cue.nodes.find(n => n.type === 'output');
        if (outNode) {
          cue.connections.push({
            id: 'scc_' + Date.now().toString(36) + '_c',
            fromNodeId: wpId, toNodeId: outNode.id, toInputIndex: 0,
          });
        }
        soundLib.updateCue(cue);
        this._folderManager.setAssetLocation(cue.assetId, 'soundCue', this._currentFolderId);
        this._selectedIds.clear();
        this._selectedIds.add(cue.assetId);
        this._refreshGrid();
        this._onOpenSoundCue?.(cue);
      }
    });

    this._addMenuSeparator(menu);

    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Sound', sound.assetName);
      if (newName) {
        sound.assetName = newName;
        this._refreshGrid();
      }
    });

    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete sound "${sound.assetName}"?`)) {
        const soundLib = SoundLibrary.instance;
        soundLib?.removeSound(sound.assetId);
        this._folderManager.removeAssetLocation(sound.assetId, 'sound');
        this._selectedIds.delete(sound.assetId);
        this._refreshGrid();
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _showSoundCueContextMenu(e: MouseEvent, cue: SoundCueData): void {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    this._addMenuItem(menu, iconHTML(Icons.FileText, 12, ICON_COLORS.muted) + ' Open Editor', () => {
      this._onOpenSoundCue?.(cue);
    });

    this._addMenuItem(menu, iconHTML(Icons.Play, 12, '#60a5fa') + ' Preview', () => {
      const soundLib = SoundLibrary.instance;
      if (!soundLib) return;
      const resolved = soundLib.resolveCueToSoundURL(cue.assetId);
      if (resolved) {
        const audio = new Audio(resolved.url);
        audio.volume = Math.min(1, resolved.volume);
        audio.playbackRate = resolved.pitch;
        audio.play().catch(() => {});
      }
    });

    this._addMenuSeparator(menu);

    this._addMenuItem(menu, iconHTML(Icons.Pencil, 12, ICON_COLORS.muted) + ' Rename', async () => {
      const newName = await this._showNameDialog('Rename Sound Cue', cue.assetName);
      if (newName) {
        cue.assetName = newName;
        SoundLibrary.instance?.updateCue(cue);
        this._refreshGrid();
      }
    });

    this._addMenuItem(menu, iconHTML(Icons.Copy, 12, ICON_COLORS.muted) + ' Duplicate', () => {
      const soundLib = SoundLibrary.instance;
      if (!soundLib) return;
      const dup = soundLib.createCue(cue.assetName + '_Copy');
      // Deep-clone the node graph
      dup.nodes = JSON.parse(JSON.stringify(cue.nodes || []));
      dup.connections = JSON.parse(JSON.stringify(cue.connections || []));
      soundLib.updateCue(dup);
      this._folderManager.setAssetLocation(dup.assetId, 'soundCue', this._currentFolderId);
      this._refreshGrid();
    });

    const delItem = this._addMenuItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete', () => {
      if (confirm(`Delete sound cue "${cue.assetName}"?`)) {
        SoundLibrary.instance?.deleteCue(cue.assetId);
        this._folderManager.removeAssetLocation(cue.assetId, 'soundCue');
        this._selectedIds.delete(cue.assetId);
        this._refreshGrid();
      }
    });
    delItem.style.color = 'var(--danger, #f87171)';

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  // ============================================================
  //  Menu Utilities
  // ============================================================

  private _addMenuItem(menu: HTMLElement, text: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.innerHTML = text;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._closeContextMenu();
      onClick();
    });
    menu.appendChild(item);
    return item;
  }

  private _addMenuSeparator(menu: HTMLElement): void {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    menu.appendChild(sep);
  }

  private _closeContextMenu(): void {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }
}
