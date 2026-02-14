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

/** Callback fired when the user releases the mouse after dragging an asset card */
export type AssetDropCallback = (asset: ActorAsset, mouseX: number, mouseY: number) => void;

export type ContentBrowserTab = 'Actors' | 'Structures' | 'Enums';

export class ActorAssetBrowser {
  public container: HTMLElement;
  private _manager: ActorAssetManager;
  private _structManager: StructureAssetManager | null = null;
  private _gridEl!: HTMLElement;
  private _contextMenu: HTMLElement | null = null;
  private _onOpenAsset: (asset: ActorAsset) => void;
  private _onOpenStructure: ((asset: StructureAsset) => void) | null = null;
  private _onOpenEnum: ((asset: EnumAsset) => void) | null = null;
  private _onDrop: AssetDropCallback;
  private _selectedAssetId: string | null = null;
  private _activeTab: ContentBrowserTab = 'Actors';
  private _tabBarEl!: HTMLElement;

  // Custom mouse-drag state (no HTML5 DnD)
  private _dragAsset: ActorAsset | null = null;
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
    this._onOpenAsset = onOpenAsset;
    this._onDrop = onDrop;
    this._build();
    this._manager.onChanged(() => this._refreshGrid());

    // Global mouse handlers for custom drag
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
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
    this._rebuildHeader();
    this._refreshGrid();
  }

  private _onMouseMove = (e: MouseEvent) => {
    if (!this._dragAsset) return;
    // Only start showing ghost after 5px movement (avoids accidental drags)
    const dx = e.clientX - this._startX;
    const dy = e.clientY - this._startY;
    if (!this._dragStarted && Math.abs(dx) + Math.abs(dy) < 5) return;
    this._dragStarted = true;

    if (!this._dragGhost) {
      this._dragGhost = document.createElement('div');
      this._dragGhost.className = 'asset-drag-ghost';
      this._dragGhost.textContent = this._dragAsset.name;
      document.body.appendChild(this._dragGhost);
    }
    this._dragGhost.style.left = e.clientX + 12 + 'px';
    this._dragGhost.style.top = e.clientY + 4 + 'px';
  };

  private _onMouseUp = (e: MouseEvent) => {
    if (!this._dragAsset) return;
    const asset = this._dragAsset;
    const started = this._dragStarted;
    this._dragAsset = null;
    this._dragStarted = false;
    if (this._dragGhost) {
      this._dragGhost.remove();
      this._dragGhost = null;
    }
    if (started) {
      this._onDrop(asset, e.clientX, e.clientY);
    }
  };

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.id = 'ab-header';
    this.container.appendChild(header);
    this._rebuildHeader();

    // Tab bar (shows when struct manager is available)
    this._tabBarEl = document.createElement('div');
    this._tabBarEl.className = 'content-browser-tab-bar';
    this._tabBarEl.style.display = this._structManager ? 'flex' : 'none';
    this.container.appendChild(this._tabBarEl);
    this._rebuildTabBar();

    // Body
    const body = document.createElement('div');
    body.className = 'panel-body';

    this._gridEl = document.createElement('div');
    this._gridEl.className = 'asset-grid';
    body.appendChild(this._gridEl);
    this.container.appendChild(body);

    // Right-click on empty space → create new
    body.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showEmptyContextMenu(e);
    });

    // Close context menu on any click
    document.addEventListener('click', () => this._closeContextMenu());

    this._refreshGrid();
  }

  private _rebuildHeader(): void {
    const header = this.container.querySelector('#ab-header');
    if (!header) return;
    header.innerHTML = `
      <span>Content Browser</span>
      <div class="content-browser-add" id="ab-add-btn">+ New</div>
    `;
    header.querySelector('#ab-add-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this._createNewForActiveTab();
    });
  }

  private _rebuildTabBar(): void {
    this._tabBarEl.innerHTML = '';
    if (!this._structManager) {
      this._tabBarEl.style.display = 'none';
      return;
    }
    this._tabBarEl.style.display = 'flex';
    const tabs: ContentBrowserTab[] = ['Actors', 'Structures', 'Enums'];
    const icons: Record<ContentBrowserTab, string> = { Actors: '⬡', Structures: '🔷', Enums: '📋' };
    for (const tab of tabs) {
      const btn = document.createElement('div');
      btn.className = `content-browser-tab${this._activeTab === tab ? ' active' : ''}`;
      btn.textContent = `${icons[tab]} ${tab}`;
      btn.addEventListener('click', () => {
        this._activeTab = tab;
        this._selectedAssetId = null;
        this._rebuildTabBar();
        this._refreshGrid();
      });
      this._tabBarEl.appendChild(btn);
    }
  }

  private _createNewForActiveTab(): void {
    if (this._activeTab === 'Actors') {
      this._createNewAsset();
    } else if (this._activeTab === 'Structures' && this._structManager) {
      const name = this._showNameDialog('New Structure', 'F_NewStruct');
      if (!name) return;
      const sa = this._structManager.createStructure(name);
      this._selectedAssetId = sa.id;
      if (this._onOpenStructure) this._onOpenStructure(sa);
    } else if (this._activeTab === 'Enums' && this._structManager) {
      const name = this._showNameDialog('New Enum', 'E_NewEnum');
      if (!name) return;
      const ea = this._structManager.createEnum(name);
      this._selectedAssetId = ea.id;
      if (this._onOpenEnum) this._onOpenEnum(ea);
    }
  }

  private _refreshGrid(): void {
    this._gridEl.innerHTML = '';

    if (this._activeTab === 'Actors') {
      this._renderActorGrid();
    } else if (this._activeTab === 'Structures') {
      this._renderStructureGrid();
    } else if (this._activeTab === 'Enums') {
      this._renderEnumGrid();
    }
  }

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
    this._addMenuItem(menu, '✏ Rename', () => {
      const newName = this._showNameDialog('Rename Structure', sa.name);
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
    this._addMenuItem(menu, '✏ Rename', () => {
      const newName = this._showNameDialog('Rename Enum', ea.name);
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

  private _createNewAsset(actorType: ActorType = 'actor'): void {
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
    const name = this._promptName(title, defaultName);
    if (!name) return;
    const asset = this._manager.createAsset(name, actorType);
    this._selectedAssetId = asset.id;
  }

  private _promptName(title: string, defaultValue: string): string | null {
    // Use a simple overlay dialog
    return this._showNameDialog(title, defaultValue);
  }

  private _showNameDialog(title: string, defaultValue: string): string | null {
    // Synchronous prompt for simplicity — can be replaced with async dialog later
    const result = prompt(title, defaultValue);
    return result && result.trim() ? result.trim() : null;
  }

  // ---- Context Menus ----

  private _showEmptyContextMenu(e: MouseEvent): void {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    // Always show actor creation
    this._addMenuItem(menu, '⬡ New Actor Blueprint', () => {
      this._activeTab = 'Actors';
      this._rebuildTabBar();
      this._createNewAsset();
    });

    this._addMenuItem(menu, '🏃 New Character Pawn', () => {
      this._activeTab = 'Actors';
      this._rebuildTabBar();
      this._createNewAsset('characterPawn');
    });

    // ── Controller blueprints ──
    const sep0 = document.createElement('div');
    sep0.className = 'context-menu-separator';
    menu.appendChild(sep0);

    this._addMenuItem(menu, '🎮 New Player Controller', () => {
      this._activeTab = 'Actors';
      this._rebuildTabBar();
      this._createNewAsset('playerController');
    });

    this._addMenuItem(menu, '🤖 New AI Controller', () => {
      this._activeTab = 'Actors';
      this._rebuildTabBar();
      this._createNewAsset('aiController');
    });

    // Structure/Enum creation when manager is available
    if (this._structManager) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);

      this._addMenuItem(menu, '🔷 New Structure', () => {
        this._activeTab = 'Structures';
        this._rebuildTabBar();
        const name = this._showNameDialog('New Structure', 'F_NewStruct');
        if (name) {
          const sa = this._structManager!.createStructure(name);
          this._selectedAssetId = sa.id;
          this._onOpenStructure?.(sa);
        }
        this._refreshGrid();
      });

      this._addMenuItem(menu, '📋 New Enumeration', () => {
        this._activeTab = 'Enums';
        this._rebuildTabBar();
        const name = this._showNameDialog('New Enum', 'E_NewEnum');
        if (name) {
          const ea = this._structManager!.createEnum(name);
          this._selectedAssetId = ea.id;
          this._onOpenEnum?.(ea);
        }
        this._refreshGrid();
      });
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

    this._addMenuItem(menu, '✏ Rename', () => {
      const newName = this._showNameDialog('Rename Actor', asset.name);
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
      if (confirm(`Delete actor "${asset.name}"?`)) {
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
