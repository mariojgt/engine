// ============================================================
//  ActorAssetBrowser — UE-style Content Browser for Actor Assets
//  Shows all actor assets in a grid view. Supports:
//    - Right-click → Create New Actor
//    - Double-click → Open Actor Editor
//    - Drag → Drop into scene to create instance
//    - Right-click asset → Rename / Duplicate / Delete
// ============================================================

import { ActorAssetManager, type ActorAsset } from './ActorAsset';

/** Callback fired when the user releases the mouse after dragging an asset card */
export type AssetDropCallback = (asset: ActorAsset, mouseX: number, mouseY: number) => void;

export class ActorAssetBrowser {
  public container: HTMLElement;
  private _manager: ActorAssetManager;
  private _gridEl!: HTMLElement;
  private _contextMenu: HTMLElement | null = null;
  private _onOpenAsset: (asset: ActorAsset) => void;
  private _onDrop: AssetDropCallback;
  private _selectedAssetId: string | null = null;

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
    header.innerHTML = `
      <span>Content Browser</span>
      <div class="content-browser-add" id="ab-add-btn">+ New Actor</div>
    `;
    this.container.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'panel-body';

    this._gridEl = document.createElement('div');
    this._gridEl.className = 'asset-grid';
    body.appendChild(this._gridEl);
    this.container.appendChild(body);

    // "+ New Actor" button
    header.querySelector('#ab-add-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this._createNewAsset();
    });

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

  private _refreshGrid(): void {
    this._gridEl.innerHTML = '';
    const assets = this._manager.assets;

    if (assets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'No actor assets. Click + New Actor';
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
      icon.innerHTML = this._getMeshIcon(asset.rootMeshType);
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

  private _getMeshIcon(meshType: string): string {
    switch (meshType) {
      case 'cube': return '<span class="asset-icon-glyph">⬡</span>';
      case 'sphere': return '<span class="asset-icon-glyph">●</span>';
      case 'cylinder': return '<span class="asset-icon-glyph">◎</span>';
      case 'plane': return '<span class="asset-icon-glyph">▬</span>';
      default: return '<span class="asset-icon-glyph">⬡</span>';
    }
  }

  private _createNewAsset(): void {
    const name = this._promptName('New Actor Asset', 'BP_NewActor');
    if (!name) return;
    const asset = this._manager.createAsset(name);
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

    this._addMenuItem(menu, '⬡ New Actor Blueprint', () => {
      this._createNewAsset();
    });

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
      const dup = this._manager.createAsset(asset.name + '_Copy');
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
