// ============================================================
//  ActorEditorPanel — UE-style Blueprint Actor Editor
//  Tabs: Viewport (components + 3D preview) | Event Graph (node editor)
//  The Viewport tab has a Components tree on the left and a
//  mini Three.js scene on the right with transform gizmos.
// ============================================================

import type { ActorAsset, ActorComponentData } from './ActorAsset';
import { ActorPreviewViewport } from './ActorPreviewViewport';
import { mountNodeEditorForAsset } from './NodeEditorPanel';
import type { MeshType } from '../engine/Scene';

let _compNextId = 1;
function compUid(): string {
  return 'comp_' + (_compNextId++) + '_' + Math.random().toString(36).slice(2, 6);
}

export class ActorEditorPanel {
  public container: HTMLElement;
  private _asset: ActorAsset;
  private _onCompile: (code: string) => void;

  // Top-level DOM
  private _tabBar!: HTMLElement;
  private _tabContentArea!: HTMLElement;

  // Viewport tab
  private _viewportTabEl: HTMLElement | null = null;
  private _preview: ActorPreviewViewport | null = null;
  private _componentsListEl: HTMLElement | null = null;
  private _componentPropsEl: HTMLElement | null = null;
  private _selectedComponentId: string | null = null; // null | '__root__' | comp.id

  // Event Graph tab
  private _graphTabEl: HTMLElement | null = null;
  private _nodeEditorCleanup: (() => void) | null = null;

  private _activeTab: 'viewport' | 'graph' = 'viewport';

  constructor(
    container: HTMLElement,
    asset: ActorAsset,
    onCompile: (code: string) => void,
  ) {
    this.container = container;
    this._asset = asset;
    this._onCompile = onCompile;
    this._build();
  }

  // ---- Build ----

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'actor-editor-root';

    // Tab bar
    this._tabBar = document.createElement('div');
    this._tabBar.className = 'actor-editor-tab-bar';
    this.container.appendChild(this._tabBar);

    // Content area
    this._tabContentArea = document.createElement('div');
    this._tabContentArea.className = 'actor-editor-content';
    this.container.appendChild(this._tabContentArea);

    // Build tabs
    this._buildTabBar();
    this._switchTab('viewport');
  }

  private _buildTabBar(): void {
    this._tabBar.innerHTML = '';

    const makeTab = (label: string, id: 'viewport' | 'graph') => {
      const tab = document.createElement('div');
      tab.className = 'graph-tab' + (this._activeTab === id ? ' active' : '');
      tab.textContent = label;
      tab.addEventListener('click', () => this._switchTab(id));
      this._tabBar.appendChild(tab);
    };

    makeTab('🎮 Viewport', 'viewport');
    makeTab('⬡ Event Graph', 'graph');
  }

  private _switchTab(tab: 'viewport' | 'graph'): void {
    this._activeTab = tab;
    this._buildTabBar();
    this._tabContentArea.innerHTML = '';

    // Cleanup previous
    if (tab !== 'viewport') this._disposeViewportTab();
    if (tab !== 'graph') this._disposeGraphTab();

    if (tab === 'viewport') {
      this._buildViewportTab();
    } else {
      this._buildGraphTab();
    }
  }

  // ================================================================
  //  VIEWPORT TAB — Components tree + mini 3D preview + properties
  // ================================================================

  private _buildViewportTab(): void {
    const wrap = document.createElement('div');
    wrap.className = 'actor-viewport-tab';
    this._tabContentArea.appendChild(wrap);
    this._viewportTabEl = wrap;

    // Left panel: Components tree
    const leftPanel = document.createElement('div');
    leftPanel.className = 'actor-components-panel';
    wrap.appendChild(leftPanel);

    const headerEl = document.createElement('div');
    headerEl.className = 'panel-header';
    headerEl.innerHTML = `
      <span>Components</span>
      <div class="content-browser-add actor-comp-add-btn">+ Add</div>
    `;
    leftPanel.appendChild(headerEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'panel-body';
    leftPanel.appendChild(bodyEl);

    this._componentsListEl = document.createElement('div');
    this._componentsListEl.className = 'actor-comp-list';
    bodyEl.appendChild(this._componentsListEl);

    // Component properties below the tree
    this._componentPropsEl = document.createElement('div');
    this._componentPropsEl.className = 'actor-comp-props';
    bodyEl.appendChild(this._componentPropsEl);

    // Add button handler
    headerEl.querySelector('.actor-comp-add-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showAddComponentMenu(e as MouseEvent);
    });

    // Right panel: Mini viewport
    const rightPanel = document.createElement('div');
    rightPanel.className = 'actor-preview-area';
    wrap.appendChild(rightPanel);

    this._preview = new ActorPreviewViewport(rightPanel, this._asset);
    this._preview.onSelectionChanged = (sel) => {
      if (!sel) {
        this._selectedComponentId = null;
      } else if (sel.type === 'root') {
        this._selectedComponentId = '__root__';
      } else {
        this._selectedComponentId = sel.id;
      }
      this._refreshComponentsList();
      this._refreshComponentProps();
    };

    this._refreshComponentsList();
    this._refreshComponentProps();
  }

  private _disposeViewportTab(): void {
    if (this._preview) {
      this._preview.dispose();
      this._preview = null;
    }
    this._viewportTabEl = null;
    this._componentsListEl = null;
    this._componentPropsEl = null;
  }

  // ---- Components tree ----

  private _refreshComponentsList(): void {
    if (!this._componentsListEl) return;
    this._componentsListEl.innerHTML = '';

    // Root component (always present)
    this._componentsListEl.appendChild(
      this._makeComponentItem('DefaultSceneRoot (' + this._asset.rootMeshType + ')', '__root__', '📦'),
    );

    // Child components
    for (const comp of this._asset.components) {
      this._componentsListEl.appendChild(
        this._makeComponentItem(comp.name, comp.id, '🔹'),
      );
    }
  }

  private _makeComponentItem(label: string, id: string, icon: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'actor-comp-item' + (this._selectedComponentId === id ? ' selected' : '');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'actor-comp-item-icon';
    iconSpan.textContent = icon;
    item.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'actor-comp-item-name';
    nameSpan.textContent = label;
    item.appendChild(nameSpan);

    // Select
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this._selectedComponentId = id;
      this._refreshComponentsList();
      this._refreshComponentProps();
      if (this._preview) this._preview.selectById(id);
    });

    // Delete button (not for root)
    if (id !== '__root__') {
      const actions = document.createElement('span');
      actions.className = 'actor-comp-item-actions';

      const delBtn = document.createElement('span');
      delBtn.className = 'mybp-delete';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove component';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._asset.components = this._asset.components.filter(c => c.id !== id);
        this._asset.touch();
        if (this._selectedComponentId === id) this._selectedComponentId = null;
        if (this._preview) this._preview.rebuild();
        this._refreshComponentsList();
        this._refreshComponentProps();
      });
      actions.appendChild(delBtn);
      item.appendChild(actions);
    }

    return item;
  }

  // ---- Component properties panel ----

  private _refreshComponentProps(): void {
    if (!this._componentPropsEl) return;
    this._componentPropsEl.innerHTML = '';

    if (!this._selectedComponentId) {
      this._componentPropsEl.innerHTML = '<div class="prop-empty" style="padding:8px;font-size:11px;">Select a component</div>';
      return;
    }

    if (this._selectedComponentId === '__root__') {
      this._buildRootProps();
    } else {
      const comp = this._asset.components.find(c => c.id === this._selectedComponentId);
      if (comp) this._buildChildProps(comp);
    }
  }

  private _buildRootProps(): void {
    const container = this._componentPropsEl!;

    // Title
    const title = document.createElement('div');
    title.className = 'actor-comp-props-title';
    title.textContent = 'Root Component';
    container.appendChild(title);

    // Mesh type dropdown
    container.appendChild(this._makeDropdownRow('Mesh', this._asset.rootMeshType, ['cube', 'sphere', 'cylinder', 'plane'], (v) => {
      this._asset.rootMeshType = v as MeshType;
      this._asset.touch();
      if (this._preview) this._preview.rebuild();
    }));
  }

  private _buildChildProps(comp: ActorComponentData): void {
    const container = this._componentPropsEl!;

    // Title
    const title = document.createElement('div');
    title.className = 'actor-comp-props-title';
    title.textContent = comp.name;
    container.appendChild(title);

    // Name
    container.appendChild(this._makeTextRow('Name', comp.name, (v) => {
      comp.name = v;
      this._asset.touch();
      this._refreshComponentsList();
    }));

    // Mesh type
    container.appendChild(this._makeDropdownRow('Mesh', comp.meshType, ['cube', 'sphere', 'cylinder', 'plane'], (v) => {
      comp.meshType = v as MeshType;
      this._asset.touch();
      if (this._preview) this._preview.rebuild();
    }));

    // Offset
    container.appendChild(this._makeVec3Row('Offset', comp.offset, () => {
      this._asset.touch();
      if (this._preview) this._preview.rebuild();
    }));

    // Rotation
    container.appendChild(this._makeVec3Row('Rotation', comp.rotation, () => {
      this._asset.touch();
      if (this._preview) this._preview.rebuild();
    }));

    // Scale
    container.appendChild(this._makeVec3Row('Scale', comp.scale, () => {
      this._asset.touch();
      if (this._preview) this._preview.rebuild();
    }));
  }

  // ---- Add Component context menu ----

  private _showAddComponentMenu(e: MouseEvent): void {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const types: { label: string; type: MeshType }[] = [
      { label: 'Cube Mesh', type: 'cube' },
      { label: 'Sphere Mesh', type: 'sphere' },
      { label: 'Cylinder Mesh', type: 'cylinder' },
      { label: 'Plane Mesh', type: 'plane' },
    ];

    for (const t of types) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = t.label;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        this._addComponent(t.type);
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);

    const cleanup = () => {
      menu.remove();
      document.removeEventListener('click', cleanup);
    };
    setTimeout(() => document.addEventListener('click', cleanup), 0);
  }

  private _addComponent(meshType: MeshType): void {
    const name = meshType.charAt(0).toUpperCase() + meshType.slice(1) + '_' + this._asset.components.length;
    const comp: ActorComponentData = {
      id: compUid(),
      type: 'mesh',
      meshType,
      name,
      offset: { x: 0, y: 1.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
  }

  // ================================================================
  //  EVENT GRAPH TAB — Full node editor
  // ================================================================

  private _buildGraphTab(): void {
    const wrap = document.createElement('div');
    wrap.className = 'node-editor-container';
    this._tabContentArea.appendChild(wrap);
    this._graphTabEl = wrap;

    this._nodeEditorCleanup = mountNodeEditorForAsset(
      wrap,
      this._asset.blueprintData,
      this._asset.name,
      this._onCompile,
    );
  }

  private _disposeGraphTab(): void {
    if (this._nodeEditorCleanup) {
      this._nodeEditorCleanup();
      this._nodeEditorCleanup = null;
    }
    this._graphTabEl = null;
  }

  // ================================================================
  //  Helper UI builders
  // ================================================================

  private _makeTextRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _makeDropdownRow(label: string, value: string, options: string[], onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const select = document.createElement('select');
    select.className = 'prop-input';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o.charAt(0).toUpperCase() + o.slice(1);
      if (o === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => onChange(select.value));
    row.appendChild(lbl);
    row.appendChild(select);
    return row;
  }

  private _makeVec3Row(label: string, vec: { x: number; y: number; z: number }, onChange: () => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    for (const axis of ['x', 'y', 'z'] as const) {
      const axisLabel = document.createElement('span');
      axisLabel.className = `prop-xyz-label ${axis}`;
      axisLabel.textContent = axis.toUpperCase();

      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.className = 'prop-input prop-input-sm';
      input.value = (vec[axis] ?? 0).toFixed(2);
      input.addEventListener('change', () => {
        (vec as any)[axis] = parseFloat(input.value) || 0;
        onChange();
      });
      row.appendChild(axisLabel);
      row.appendChild(input);
    }

    return row;
  }

  // ---- Cleanup ----

  dispose(): void {
    this._disposeViewportTab();
    this._disposeGraphTab();
  }
}
