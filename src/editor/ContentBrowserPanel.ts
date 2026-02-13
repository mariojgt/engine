import type { Engine } from '../engine/Engine';
import type { GameObject } from '../engine/GameObject';
import type { MeshType } from '../engine/Scene';

export class ContentBrowserPanel {
  public container: HTMLElement;
  private _engine: Engine;
  private _listEl!: HTMLElement;
  private _contextMenu: HTMLElement | null = null;
  private _onDoubleClick: (go: GameObject) => void;

  constructor(
    container: HTMLElement,
    engine: Engine,
    onDoubleClick: (go: GameObject) => void
  ) {
    this.container = container;
    this._engine = engine;
    this._onDoubleClick = onDoubleClick;
    this._build();
    this._engine.scene.onChanged(() => this._refreshList());
    this._engine.scene.onSelectionChanged(() => this._refreshList());
  }

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <span>Scene</span>
      <div class="content-browser-add" id="cb-add-btn">+ Add</div>
    `;
    this.container.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'panel-body';
    this._listEl = document.createElement('div');
    body.appendChild(this._listEl);
    this.container.appendChild(body);

    // Add button handler
    header.querySelector('#cb-add-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showAddMenu(e as MouseEvent);
    });

    // Close context menu on any click
    document.addEventListener('click', () => this._closeContextMenu());

    this._refreshList();
  }

  private _refreshList(): void {
    this._listEl.innerHTML = '';
    const objects = this._engine.scene.gameObjects;

    if (objects.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'No objects. Click + Add';
      empty.style.height = '60px';
      this._listEl.appendChild(empty);
      return;
    }

    for (const go of objects) {
      const item = document.createElement('div');
      item.className = 'content-browser-item';
      if (this._engine.scene.selectedObject?.id === go.id) {
        item.classList.add('selected');
      }

      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = this._getIcon(go);

      const name = document.createElement('span');
      name.textContent = go.name;

      item.appendChild(icon);
      item.appendChild(name);

      // Single click = select
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._engine.scene.selectObject(go);
      });

      // Double click = open node editor
      item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._onDoubleClick(go);
      });

      // Right-click = context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showObjectMenu(e, go);
      });

      this._listEl.appendChild(item);
    }
  }

  private _getIcon(go: GameObject): string {
    const geoType = go.mesh.geometry.type;
    if (geoType === 'BoxGeometry') return '◻';
    if (geoType === 'SphereGeometry') return '●';
    if (geoType === 'CylinderGeometry') return '◎';
    if (geoType === 'PlaneGeometry') return '▬';
    return '◇';
  }

  private _showAddMenu(e: MouseEvent): void {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const types: { label: string; type: MeshType }[] = [
      { label: 'Cube', type: 'cube' },
      { label: 'Sphere', type: 'sphere' },
      { label: 'Cylinder', type: 'cylinder' },
      { label: 'Plane', type: 'plane' },
    ];

    for (const t of types) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = t.label;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const count = this._engine.scene.gameObjects.filter(
          (o) => o.mesh.geometry.type.toLowerCase().includes(t.type)
        ).length;
        const name = `${t.label}${count > 0 ? '_' + count : ''}`;
        this._engine.scene.addGameObject(name, t.type);
        this._closeContextMenu();
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _showObjectMenu(e: MouseEvent, go: GameObject): void {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item';
    deleteItem.textContent = 'Delete';
    deleteItem.style.color = 'var(--danger)';
    deleteItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._engine.scene.removeGameObject(go);
      this._closeContextMenu();
    });

    const editItem = document.createElement('div');
    editItem.className = 'context-menu-item';
    editItem.textContent = 'Edit Script';
    editItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._onDoubleClick(go);
      this._closeContextMenu();
    });

    menu.appendChild(editItem);
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  private _closeContextMenu(): void {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }
}
