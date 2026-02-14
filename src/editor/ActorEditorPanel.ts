// ============================================================
//  ActorEditorPanel — UE-style Blueprint Actor Editor
//  Tabs: Viewport (components + 3D preview) | Event Graph (node editor)
//  The Viewport tab has a Components tree on the left and a
//  mini Three.js scene on the right with transform gizmos.
// ============================================================

import type { ActorAsset, ActorComponentData, PhysicsConfig, CollisionChannel } from './ActorAsset';
import { defaultPhysicsConfig } from './ActorAsset';
import type { CollisionConfig, CollisionShapeType, CollisionMode, CollisionResponse, CollisionChannelName, BoxShapeDimensions, SphereShapeDimensions, CapsuleShapeDimensions } from '../engine/CollisionTypes';
import { defaultCollisionConfig, defaultDimensionsForShape } from '../engine/CollisionTypes';
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
  private _onAssetChanged: () => void;

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
    onAssetChanged?: () => void,
  ) {
    this.container = container;
    this._asset = asset;
    this._onCompile = onCompile;
    this._onAssetChanged = onAssetChanged ?? (() => {});
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
      const icon = comp.type === 'trigger' ? '⚡' : '🔹';
      this._componentsListEl.appendChild(
        this._makeComponentItem(comp.name, comp.id, icon),
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
        this._onAssetChanged();
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
      this._onAssetChanged();
    }));

    // Physics section for root component
    this._buildPhysicsSection(container, this._asset.rootPhysics);
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
      this._onAssetChanged();
    }));

    if (comp.type === 'trigger') {
      // ---- Trigger component properties ----
      // Offset
      container.appendChild(this._makeVec3Row('Offset', comp.offset, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Collision settings section
      if (!comp.collision) comp.collision = defaultCollisionConfig();
      this._buildCollisionSection(container, comp.collision);
    } else {
      // ---- Mesh component properties ----
      // Mesh type
      container.appendChild(this._makeDropdownRow('Mesh', comp.meshType, ['cube', 'sphere', 'cylinder', 'plane'], (v) => {
        comp.meshType = v as MeshType;
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Offset
      container.appendChild(this._makeVec3Row('Offset', comp.offset, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Rotation
      container.appendChild(this._makeVec3Row('Rotation', comp.rotation, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Scale
      container.appendChild(this._makeVec3Row('Scale', comp.scale, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Physics section for mesh child component
      if (!comp.physics) comp.physics = defaultPhysicsConfig();
      this._buildPhysicsSection(container, comp.physics);
    }
  }

  // ---- Add Component context menu ----

  private _showAddComponentMenu(e: MouseEvent): void {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    // ---- Mesh sub-header ----
    const meshHeader = document.createElement('div');
    meshHeader.className = 'context-menu-header';
    meshHeader.textContent = '📦 Mesh';
    menu.appendChild(meshHeader);

    const meshTypes: { label: string; type: MeshType }[] = [
      { label: 'Cube Mesh', type: 'cube' },
      { label: 'Sphere Mesh', type: 'sphere' },
      { label: 'Cylinder Mesh', type: 'cylinder' },
      { label: 'Plane Mesh', type: 'plane' },
    ];

    for (const t of meshTypes) {
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

    // ---- Trigger sub-header ----
    const triggerHeader = document.createElement('div');
    triggerHeader.className = 'context-menu-header';
    triggerHeader.textContent = '⚡ Collision';
    menu.appendChild(triggerHeader);

    const triggerTypes: { label: string; shape: CollisionShapeType }[] = [
      { label: 'Box Trigger', shape: 'box' },
      { label: 'Sphere Trigger', shape: 'sphere' },
      { label: 'Capsule Trigger', shape: 'capsule' },
    ];

    for (const t of triggerTypes) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = t.label;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        this._addTriggerComponent(t.shape);
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
    this._onAssetChanged();
  }

  private _addTriggerComponent(shape: CollisionShapeType): void {
    const label = shape.charAt(0).toUpperCase() + shape.slice(1);
    const name = label + 'Trigger_' + this._asset.components.length;
    const collision = defaultCollisionConfig();
    collision.shape = shape;
    collision.dimensions = defaultDimensionsForShape(shape);
    collision.collisionMode = 'trigger';
    collision.generateOverlapEvents = true;

    const comp: ActorComponentData = {
      id: compUid(),
      type: 'trigger',
      meshType: 'cube',           // placeholder — not rendered as mesh
      name,
      offset: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      collision,
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
    this._onAssetChanged();
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
      this._asset.components,
      this._asset.rootMeshType,
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
  //  Collision / Trigger Settings Section builder
  // ================================================================

  private _buildCollisionSection(container: HTMLElement, col: CollisionConfig): void {
    const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };

    const section = document.createElement('div');
    section.className = 'physics-section';

    // Section header
    const header = document.createElement('div');
    header.className = 'physics-section-header';
    header.textContent = '⚡ Collision Settings';
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'physics-section-body';
    section.appendChild(body);

    // -- Enabled toggle --
    body.appendChild(this._makeCheckboxRow('Enabled', col.enabled, (v) => {
      col.enabled = v;
      notifyChanged();
    }));

    // -- Shape dropdown --
    body.appendChild(this._makeDropdownRow('Shape', col.shape, ['box', 'sphere', 'capsule'], (v) => {
      col.shape = v as CollisionShapeType;
      col.dimensions = defaultDimensionsForShape(col.shape);
      notifyChanged();
      this._refreshComponentProps();
    }));

    // -- Shape dimensions (context-sensitive) --
    const dimHeader = document.createElement('div');
    dimHeader.className = 'physics-subsection-header';
    dimHeader.textContent = 'Dimensions';
    body.appendChild(dimHeader);

    if (col.shape === 'box') {
      const dim = col.dimensions as BoxShapeDimensions;
      body.appendChild(this._makeNumberRow('Width', dim.width, 0.1, 0.01, 1000, (v) => {
        dim.width = v; notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Height', dim.height, 0.1, 0.01, 1000, (v) => {
        dim.height = v; notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Depth', dim.depth, 0.1, 0.01, 1000, (v) => {
        dim.depth = v; notifyChanged();
      }));
    } else if (col.shape === 'sphere') {
      const dim = col.dimensions as SphereShapeDimensions;
      body.appendChild(this._makeNumberRow('Radius', dim.radius, 0.1, 0.01, 1000, (v) => {
        dim.radius = v; notifyChanged();
      }));
    } else if (col.shape === 'capsule') {
      const dim = col.dimensions as CapsuleShapeDimensions;
      body.appendChild(this._makeNumberRow('Radius', dim.radius, 0.1, 0.01, 1000, (v) => {
        dim.radius = v; notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Height', dim.height, 0.1, 0.01, 1000, (v) => {
        dim.height = v; notifyChanged();
      }));
    }

    // -- Collision Mode --
    const modeHeader = document.createElement('div');
    modeHeader.className = 'physics-subsection-header';
    modeHeader.textContent = 'Mode';
    body.appendChild(modeHeader);

    body.appendChild(this._makeDropdownRow('Collision Mode', col.collisionMode, ['none', 'trigger', 'physics'], (v) => {
      col.collisionMode = v as CollisionMode;
      notifyChanged();
      this._refreshComponentProps();
    }));

    // -- Events --
    const evtHeader = document.createElement('div');
    evtHeader.className = 'physics-subsection-header';
    evtHeader.textContent = 'Events';
    body.appendChild(evtHeader);

    body.appendChild(this._makeCheckboxRow('Generate Overlap Events', col.generateOverlapEvents, (v) => {
      col.generateOverlapEvents = v;
      notifyChanged();
    }));
    body.appendChild(this._makeCheckboxRow('Generate Hit Events', col.generateHitEvents, (v) => {
      col.generateHitEvents = v;
      notifyChanged();
    }));

    // -- Channel Responses --
    const chHeader = document.createElement('div');
    chHeader.className = 'physics-subsection-header';
    chHeader.textContent = 'Channel Responses';
    body.appendChild(chHeader);

    const channelNames: CollisionChannelName[] = ['WorldStatic', 'WorldDynamic', 'Pawn', 'Player', 'Projectile', 'Trigger'];
    const responses: CollisionResponse[] = ['block', 'overlap', 'ignore'];
    for (const ch of channelNames) {
      const current = col.channelResponses[ch] ?? 'overlap';
      body.appendChild(this._makeDropdownRow(ch, current, responses, (v) => {
        col.channelResponses[ch] = v as CollisionResponse;
        notifyChanged();
      }));
    }

    // -- Editor Visualization --
    body.appendChild(this._makeCheckboxRow('Show in Editor', col.showInEditor, (v) => {
      col.showInEditor = v;
      notifyChanged();
      if (this._preview) this._preview.rebuild();
    }));

    container.appendChild(section);
  }

  // ================================================================
  //  Physics Properties Section builder
  // ================================================================

  private _buildPhysicsSection(container: HTMLElement, phys: PhysicsConfig): void {
    const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };

    const section = document.createElement('div');
    section.className = 'physics-section';

    // Section header
    const header = document.createElement('div');
    header.className = 'physics-section-header';
    header.textContent = '⚛ Physics Settings';
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'physics-section-body';
    section.appendChild(body);

    // -- Simulate Physics (master toggle) --
    body.appendChild(this._makeCheckboxRow('Simulate Physics', phys.simulatePhysics, (v) => {
      phys.simulatePhysics = v;
      phys.enabled = v;
      notifyChanged();
      // Refresh to show/hide dependent fields
      this._refreshComponentProps();
    }));

    if (phys.simulatePhysics) {
      // -- Mass --
      body.appendChild(this._makeNumberRow('Mass (kg)', phys.mass, 0.1, 0, 100000, (v) => {
        phys.mass = v;
        notifyChanged();
      }));

      // -- Gravity sub-section --
      const gravHeader = document.createElement('div');
      gravHeader.className = 'physics-subsection-header';
      gravHeader.textContent = 'Gravity';
      body.appendChild(gravHeader);

      body.appendChild(this._makeCheckboxRow('Enable Gravity', phys.gravityEnabled, (v) => {
        phys.gravityEnabled = v;
        notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Gravity Scale', phys.gravityScale, 0.1, -10, 10, (v) => {
        phys.gravityScale = v;
        notifyChanged();
      }));

      // -- Damping sub-section --
      const dampHeader = document.createElement('div');
      dampHeader.className = 'physics-subsection-header';
      dampHeader.textContent = 'Damping';
      body.appendChild(dampHeader);

      body.appendChild(this._makeNumberRow('Linear Damping', phys.linearDamping, 0.01, 0, 100, (v) => {
        phys.linearDamping = v;
        notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Angular Damping', phys.angularDamping, 0.01, 0, 100, (v) => {
        phys.angularDamping = v;
        notifyChanged();
      }));

      // -- Material sub-section --
      const matHeader = document.createElement('div');
      matHeader.className = 'physics-subsection-header';
      matHeader.textContent = 'Material';
      body.appendChild(matHeader);

      body.appendChild(this._makeNumberRow('Friction', phys.friction, 0.05, 0, 2, (v) => {
        phys.friction = v;
        notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Restitution', phys.restitution, 0.05, 0, 2, (v) => {
        phys.restitution = v;
        notifyChanged();
      }));

      // -- Constraints sub-section --
      const conHeader = document.createElement('div');
      conHeader.className = 'physics-subsection-header';
      conHeader.textContent = 'Constraints';
      body.appendChild(conHeader);

      body.appendChild(this._makeAxisLockRow('Lock Position',
        phys.lockPositionX, phys.lockPositionY, phys.lockPositionZ,
        (x, y, z) => { phys.lockPositionX = x; phys.lockPositionY = y; phys.lockPositionZ = z; notifyChanged(); },
      ));
      body.appendChild(this._makeAxisLockRow('Lock Rotation',
        phys.lockRotationX, phys.lockRotationY, phys.lockRotationZ,
        (x, y, z) => { phys.lockRotationX = x; phys.lockRotationY = y; phys.lockRotationZ = z; notifyChanged(); },
      ));

      // -- Collision sub-section --
      const colHeader = document.createElement('div');
      colHeader.className = 'physics-subsection-header';
      colHeader.textContent = 'Collision';
      body.appendChild(colHeader);

      body.appendChild(this._makeCheckboxRow('Collision Enabled', phys.collisionEnabled, (v) => {
        phys.collisionEnabled = v;
        notifyChanged();
      }));

      const channels: CollisionChannel[] = ['WorldStatic', 'WorldDynamic', 'Pawn', 'PhysicsBody', 'Trigger', 'Custom'];
      body.appendChild(this._makeDropdownRow('Collision Channel', phys.collisionChannel, channels, (v) => {
        phys.collisionChannel = v as CollisionChannel;
        notifyChanged();
      }));
    }

    container.appendChild(section);
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

  private _makeCheckboxRow(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'prop-checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    row.appendChild(lbl);
    row.appendChild(cb);
    return row;
  }

  private _makeNumberRow(label: string, value: number, step: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'prop-input';
    input.step = String(step);
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener('change', () => onChange(parseFloat(input.value) || 0));
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _makeAxisLockRow(
    label: string,
    x: boolean, y: boolean, z: boolean,
    onChange: (x: boolean, y: boolean, z: boolean) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    let cx = x, cy = y, cz = z;
    for (const [axisLabel, getter, setter] of [
      ['X', () => cx, (v: boolean) => { cx = v; }],
      ['Y', () => cy, (v: boolean) => { cy = v; }],
      ['Z', () => cz, (v: boolean) => { cz = v; }],
    ] as [string, () => boolean, (v: boolean) => void][]) {
      const axLbl = document.createElement('span');
      axLbl.className = `prop-xyz-label ${axisLabel.toLowerCase()}`;
      axLbl.textContent = axisLabel;
      row.appendChild(axLbl);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'prop-checkbox';
      cb.checked = getter();
      cb.addEventListener('change', () => {
        setter(cb.checked);
        onChange(cx, cy, cz);
      });
      row.appendChild(cb);
    }
    return row;
  }

  // ---- Cleanup ----

  dispose(): void {
    this._disposeViewportTab();
    this._disposeGraphTab();
  }
}
