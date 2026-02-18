// ============================================================
//  World Outliner Panel — Lists all scene composition actors
//  and game objects in a tree view similar to UE5's World Outliner.
// ============================================================

import type { Engine } from '../engine/Engine';
import type { GameObject } from '../engine/GameObject';
import type { SceneCompositionManager } from './scene/SceneCompositionManager';
import type { SceneActorType } from './scene/SceneActors';
import { createIcon, iconHTML, Icons, ICON_COLORS } from './icons';

export class WorldOutlinerPanel {
  public container: HTMLElement;
  private _engine: Engine;
  private _composition: SceneCompositionManager;
  private _onOpenNodeEditor: (go: GameObject) => void;
  private _onSelectActor: (actorId: string | null) => void;
  private _bodyEl!: HTMLElement;
  private _searchInput!: HTMLInputElement;
  private _selectedActorId: string | null = null;
  private _selectedGoId: number | null = null;
  private _collapsedCategories = new Set<string>();
  private _searchQuery = '';
  private _contextMenuEl: HTMLDivElement | null = null;

  constructor(
    container: HTMLElement,
    engine: Engine,
    composition: SceneCompositionManager,
    onOpenNodeEditor: (go: GameObject) => void,
    onSelectActor: (actorId: string | null) => void,
  ) {
    this.container = container;
    this._engine = engine;
    this._composition = composition;
    this._onOpenNodeEditor = onOpenNodeEditor;
    this._onSelectActor = onSelectActor;

    this._build();
    this._renderList();

    // Listen for composition changes
    this._composition.on('changed', () => this._renderList());
    this._composition.on('actorSelected', (id: string | null) => {
      this._selectedActorId = id;
      this._selectedGoId = null;
      // Route to properties panel so it shows the selected actor's properties
      this._onSelectActor(id);
      this._renderList();
    });

    // Listen for scene changes (game objects added/removed)
    this._engine.scene.onChanged(() => this._renderList());
    this._engine.scene.onSelectionChanged((go) => {
      if (go) {
        this._selectedGoId = go.id;
        this._selectedActorId = null;
        this._onSelectActor(null);
      } else {
        this._selectedGoId = null;
      }
      this._renderList();
    });
  }

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = '<span>World Outliner</span>';
    this.container.appendChild(header);

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'outliner-search';
    this._searchInput = document.createElement('input');
    this._searchInput.className = 'outliner-search-input';
    this._searchInput.placeholder = 'Search...';
    this._searchInput.addEventListener('input', () => {
      this._searchQuery = this._searchInput.value.toLowerCase();
      this._renderList();
    });
    searchWrap.appendChild(this._searchInput);
    this.container.appendChild(searchWrap);

    // Body / list container
    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'panel-body outliner-list';
    this.container.appendChild(this._bodyEl);
  }

  private _renderList(): void {
    this._bodyEl.innerHTML = '';

    // ---- Composition actors (World Settings) ----
    const outlinerData = this._composition.getOutlinerData();
    for (const category of outlinerData) {
      const isCollapsed = this._collapsedCategories.has(category.category);

      // Filter actors by search
      const filteredActors = this._searchQuery
        ? category.actors.filter((a) =>
            a.name.toLowerCase().includes(this._searchQuery) ||
            a.type.toLowerCase().includes(this._searchQuery))
        : category.actors;

      // Category header
      const catHeader = document.createElement('div');
      catHeader.className = 'outliner-category-header';

      const collapseIcon = document.createElement('span');
      collapseIcon.className = 'outliner-collapse-icon';
      collapseIcon.appendChild(createIcon(isCollapsed ? Icons.ChevronRight : Icons.ChevronDown, 10, ICON_COLORS.muted));
      catHeader.appendChild(collapseIcon);

      const catIcon = document.createElement('span');
      catIcon.className = 'outliner-category-icon';
      catIcon.appendChild(createIcon(Icons.Layers, 12, ICON_COLORS.secondary));
      catHeader.appendChild(catIcon);

      const catName = document.createElement('span');
      catName.className = 'outliner-category-name';
      catName.textContent = category.category;
      catHeader.appendChild(catName);

      const catCount = document.createElement('span');
      catCount.className = 'outliner-category-count';
      catCount.textContent = `(${filteredActors.length})`;
      catHeader.appendChild(catCount);

      catHeader.addEventListener('click', () => {
        if (this._collapsedCategories.has(category.category)) {
          this._collapsedCategories.delete(category.category);
        } else {
          this._collapsedCategories.add(category.category);
        }
        this._renderList();
      });

      // Right-click on World Settings header → Add Actor context menu
      catHeader.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showAddActorMenu(e.clientX, e.clientY);
      });

      this._bodyEl.appendChild(catHeader);

      // Actor items
      if (!isCollapsed) {
        for (const actor of filteredActors) {
          const item = this._createActorItem(actor);
          this._bodyEl.appendChild(item);
        }
      }
    }

    // ---- Game Objects ----
    const gameObjects = this._engine.scene.gameObjects;
    if (gameObjects.length > 0) {
      const goCollapsed = this._collapsedCategories.has('Game Objects');

      const filteredGOs = this._searchQuery
        ? gameObjects.filter((go) => go.name.toLowerCase().includes(this._searchQuery))
        : gameObjects;

      // Game Objects category header
      const goCatHeader = document.createElement('div');
      goCatHeader.className = 'outliner-category-header';

      const goCollapseIcon = document.createElement('span');
      goCollapseIcon.className = 'outliner-collapse-icon';
      goCollapseIcon.appendChild(createIcon(goCollapsed ? Icons.ChevronRight : Icons.ChevronDown, 10, ICON_COLORS.muted));
      goCatHeader.appendChild(goCollapseIcon);

      const goCatIcon = document.createElement('span');
      goCatIcon.className = 'outliner-category-icon';
      goCatIcon.appendChild(createIcon(Icons.Box, 12, ICON_COLORS.actor));
      goCatHeader.appendChild(goCatIcon);

      const goCatName = document.createElement('span');
      goCatName.className = 'outliner-category-name';
      goCatName.textContent = 'Game Objects';
      goCatHeader.appendChild(goCatName);

      const goCatCount = document.createElement('span');
      goCatCount.className = 'outliner-category-count';
      goCatCount.textContent = `(${filteredGOs.length})`;
      goCatHeader.appendChild(goCatCount);

      goCatHeader.addEventListener('click', () => {
        if (this._collapsedCategories.has('Game Objects')) {
          this._collapsedCategories.delete('Game Objects');
        } else {
          this._collapsedCategories.add('Game Objects');
        }
        this._renderList();
      });

      this._bodyEl.appendChild(goCatHeader);

      if (!goCollapsed) {
        for (const go of filteredGOs) {
          const item = this._createGameObjectItem(go);
          this._bodyEl.appendChild(item);
        }
      }
    }
  }

  private _createActorItem(actor: {
    id: string;
    name: string;
    type: string;
    visible: boolean;
    locked: boolean;
    icon: string;
  }): HTMLElement {
    const item = document.createElement('div');
    item.className = 'outliner-item';
    if (actor.id === this._selectedActorId) {
      item.classList.add('selected');
    }

    // Icon
    const icon = document.createElement('span');
    icon.className = 'outliner-item-icon';
    icon.textContent = actor.icon;
    item.appendChild(icon);

    // Name
    const nameWrap = document.createElement('span');
    nameWrap.className = 'outliner-item-name';

    const label = document.createElement('span');
    label.className = 'outliner-item-label';
    label.textContent = actor.name;
    nameWrap.appendChild(label);
    item.appendChild(nameWrap);

    // Controls (visibility + lock)
    const controls = document.createElement('span');
    controls.className = 'outliner-item-controls';

    // Visibility button
    const visBtn = document.createElement('button');
    visBtn.className = `outliner-toggle-btn ${actor.visible ? 'active' : 'inactive'}`;
    visBtn.appendChild(createIcon(actor.visible ? Icons.Eye : Icons.EyeOff, 12, actor.visible ? ICON_COLORS.secondary : ICON_COLORS.muted));
    visBtn.title = actor.visible ? 'Hide' : 'Show';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._composition.toggleActorVisibility(actor.id);
    });
    controls.appendChild(visBtn);

    // Lock button
    const lockBtn = document.createElement('button');
    lockBtn.className = `outliner-toggle-btn ${actor.locked ? 'locked' : ''}`;
    lockBtn.appendChild(createIcon(actor.locked ? Icons.Lock : Icons.Unlock, 12, actor.locked ? ICON_COLORS.warning : ICON_COLORS.muted));
    lockBtn.title = actor.locked ? 'Unlock' : 'Lock';
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._composition.toggleActorLock(actor.id);
    });
    controls.appendChild(lockBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'outliner-toggle-btn outliner-delete-btn';
    deleteBtn.appendChild(createIcon(Icons.Trash2, 12, ICON_COLORS.muted));
    deleteBtn.title = 'Delete Actor';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._composition.deleteActor(actor.id);
    });
    controls.appendChild(deleteBtn);

    item.appendChild(controls);

    // Click to select
    item.addEventListener('click', () => {
      this._selectedActorId = actor.id;
      this._selectedGoId = null;
      this._composition.selectActor(actor.id);
      this._engine.scene.selectObject(null);  // Clear game object selection first
      // NOTE: _onSelectActor is called via the 'actorSelected' event listener above
      this._renderList();
    });

    // Double-click to rename
    item.addEventListener('dblclick', () => {
      if (actor.locked) return;
      this._startRename(item, label, actor.id);
    });

    // Right-click context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showActorContextMenu(e.clientX, e.clientY, actor.id);
    });

    return item;
  }

  private _createGameObjectItem(go: GameObject): HTMLElement {
    const item = document.createElement('div');
    item.className = 'outliner-go-item';
    if (go.id === this._selectedGoId) {
      item.classList.add('selected');
    }

    // Icon
    const icon = document.createElement('span');
    icon.className = 'outliner-item-icon';
    icon.appendChild(createIcon(Icons.Box, 12, ICON_COLORS.actor));
    item.appendChild(icon);

    // Name
    const label = document.createElement('span');
    label.className = 'outliner-item-label';
    label.textContent = go.name;
    item.appendChild(label);

    // Controls (visibility + delete)
    const controls = document.createElement('span');
    controls.className = 'outliner-item-controls';

    // Visibility toggle
    const visBtn = document.createElement('button');
    visBtn.className = `outliner-toggle-btn ${go.mesh.visible ? 'active' : 'inactive'}`;
    visBtn.appendChild(createIcon(go.mesh.visible ? Icons.Eye : Icons.EyeOff, 12, go.mesh.visible ? ICON_COLORS.secondary : ICON_COLORS.muted));
    visBtn.title = go.mesh.visible ? 'Hide' : 'Show';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      go.mesh.visible = !go.mesh.visible;
      this._renderList();
    });
    controls.appendChild(visBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'outliner-toggle-btn outliner-delete-btn';
    deleteBtn.appendChild(createIcon(Icons.Trash2, 12, ICON_COLORS.muted));
    deleteBtn.title = 'Delete Game Object';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._deleteGameObject(go);
    });
    controls.appendChild(deleteBtn);

    item.appendChild(controls);

    // Click to select the game object
    item.addEventListener('click', () => {
      this._selectedGoId = go.id;
      this._selectedActorId = null;
      this._composition.selectActor(null);
      this._onSelectActor(null);
      this._engine.scene.selectObject(go);
      this._renderList();
    });

    // Double-click opens blueprint/node editor
    item.addEventListener('dblclick', () => {
      this._onOpenNodeEditor(go);
    });

    // Right-click context menu for game objects
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showGameObjectContextMenu(e.clientX, e.clientY, go);
    });

    return item;
  }

  private _startRename(row: HTMLElement, labelEl: HTMLElement, actorId: string): void {
    const currentName = labelEl.textContent || '';
    const input = document.createElement('input');
    input.className = 'outliner-rename-input';
    input.value = currentName;

    labelEl.textContent = '';
    labelEl.appendChild(input);
    input.focus();
    input.select();

    const finish = () => {
      const newName = input.value.trim() || currentName;
      this._composition.renameActor(actorId, newName);
      labelEl.textContent = newName;
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { finish(); input.blur(); }
      if (e.key === 'Escape') { labelEl.textContent = currentName; }
    });
  }

  // ---- Context Menus ----

  private _dismissContextMenu(): void {
    if (this._contextMenuEl) {
      this._contextMenuEl.remove();
      this._contextMenuEl = null;
    }
  }

  /** Show "Add Actor" context menu (right-click on World Settings header) */
  private _showAddActorMenu(x: number, y: number): void {
    this._dismissContextMenu();

    const menu = document.createElement('div');
    menu.className = 'outliner-context-menu context-menu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:100000;`;

    // Header
    const header = document.createElement('div');
    header.className = 'context-menu-header';
    header.style.cssText = 'padding:4px 12px;color:var(--color-text-muted);font-size:11px;border-bottom:1px solid var(--color-border);margin-bottom:2px;';
    header.textContent = 'Add Actor';
    menu.appendChild(header);

    // Actor type options
    const types = this._composition.getAddableActorTypes();
    for (const t of types) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.innerHTML = `<span>${t.icon}</span><span>${t.label}</span>`;
      item.addEventListener('click', () => {
        this._composition.addNewActor(t.type as SceneActorType);
        this._dismissContextMenu();
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    this._contextMenuEl = menu;

    // Close on click outside
    const onClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this._dismissContextMenu();
        document.removeEventListener('mousedown', onClickOutside);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);
  }

  /** Show actor context menu (right-click on actor item) */
  private _showActorContextMenu(x: number, y: number, actorId: string): void {
    this._dismissContextMenu();

    const menu = document.createElement('div');
    menu.className = 'outliner-context-menu context-menu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:100000;`;

    const items: { label: string; iconEl: string; action: () => void }[] = [
      { label: 'Delete', iconEl: iconHTML(Icons.Trash2, 12, ICON_COLORS.error), action: () => this._composition.deleteActor(actorId) },
      { label: 'Toggle Visibility', iconEl: iconHTML(Icons.Eye, 12, ICON_COLORS.secondary), action: () => this._composition.toggleActorVisibility(actorId) },
      { label: 'Toggle Lock', iconEl: iconHTML(Icons.Lock, 12, ICON_COLORS.warning), action: () => this._composition.toggleActorLock(actorId) },
    ];

    for (const entry of items) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.innerHTML = `${entry.iconEl}<span>${entry.label}</span>`;
      item.addEventListener('click', () => {
        entry.action();
        this._dismissContextMenu();
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    this._contextMenuEl = menu;

    const onClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this._dismissContextMenu();
        document.removeEventListener('mousedown', onClickOutside);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);
  }

  /** Delete a game object from the scene (with outliner + viewport sync) */
  private _deleteGameObject(go: GameObject): void {
    this._engine.scene.removeGameObject(go);

    // Clear selection if the deleted object was selected
    if (this._selectedGoId === go.id) {
      this._selectedGoId = null;
      this._onSelectActor(null);
    }

    this._renderList();
  }

  /** Show context menu for a game object (right-click on GO item) */
  private _showGameObjectContextMenu(x: number, y: number, go: GameObject): void {
    this._dismissContextMenu();

    const menu = document.createElement('div');
    menu.className = 'outliner-context-menu context-menu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:100000;`;

    const items: { label: string; iconEl: string; action: () => void }[] = [
      {
        label: 'Delete',
        iconEl: iconHTML(Icons.Trash2, 12, ICON_COLORS.error),
        action: () => this._deleteGameObject(go),
      },
      {
        label: go.mesh.visible ? 'Hide' : 'Show',
        iconEl: iconHTML(go.mesh.visible ? Icons.Eye : Icons.EyeOff, 12, ICON_COLORS.secondary),
        action: () => { go.mesh.visible = !go.mesh.visible; this._renderList(); },
      },
      {
        label: 'Open Blueprint',
        iconEl: iconHTML(Icons.GitBranch, 12, ICON_COLORS.blueprint),
        action: () => this._onOpenNodeEditor(go),
      },
    ];

    for (const entry of items) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.innerHTML = `${entry.iconEl}<span>${entry.label}</span>`;
      item.addEventListener('click', () => {
        entry.action();
        this._dismissContextMenu();
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    this._contextMenuEl = menu;

    const onClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this._dismissContextMenu();
        document.removeEventListener('mousedown', onClickOutside);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);
  }
}
