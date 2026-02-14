import {
  DockviewComponent,
  type DockviewApi,
  type IContentRenderer,
  type GroupPanelPartInitParameters,
} from 'dockview-core';
import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { GameObject } from '../engine/GameObject';
import { ViewportPanel } from './ViewportPanel';
import { ContentBrowserPanel } from './ContentBrowserPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { mountNodeEditor } from './NodeEditorPanel';
import { ActorAssetManager, type ActorAsset } from './ActorAsset';
import { ActorAssetBrowser } from './ActorAssetBrowser';
import { ActorEditorPanel } from './ActorEditorPanel';
import type { StructureAssetManager, StructureAsset, EnumAsset } from './StructureAsset';
import { StructureEditorPanel } from './StructureEditorPanel';
import { EnumEditorPanel } from './EnumEditorPanel';
import type { CameraStateJSON } from './SceneSerializer';

// Store renderers by panel id for reliable element access
const rendererMap = new Map<string, PanelRenderer>();

// Panel content renderer class
class PanelRenderer implements IContentRenderer {
  private _element: HTMLElement;
  private _id: string;

  get element() {
    return this._element;
  }

  constructor(id: string) {
    this._id = id;
    this._element = document.createElement('div');
    this._element.style.width = '100%';
    this._element.style.height = '100%';
    this._element.style.overflow = 'hidden';
    rendererMap.set(id, this);
  }

  init(_params: GroupPanelPartInitParameters): void {
    // Content is set externally after panel is created
  }

  update(): void {}

  dispose(): void {
    this._element.innerHTML = '';
    rendererMap.delete(this._id);
  }
}

export class EditorLayout {
  private _dockview!: DockviewComponent;
  private _api!: DockviewApi;
  private _engine: Engine;
  private _viewport: ViewportPanel | null = null;
  private _properties: PropertiesPanel | null = null;
  private _nodeEditorCleanup: (() => void) | null = null;
  private _actorEditor: ActorEditorPanel | null = null;
  private _assetBrowser: ActorAssetBrowser | null = null;
  private _structManager: StructureAssetManager | null = null;

  /** Shared actor asset manager — stores all actor blueprints in memory */
  public assetManager: ActorAssetManager;

  /** Callback for saving the project — wired by main.ts */
  private _onSave: (() => void) | null = null;

  constructor(container: HTMLElement, engine: Engine) {
    this._engine = engine;
    this.assetManager = new ActorAssetManager();
    this._init(container);
  }

  private _init(container: HTMLElement): void {
    this._dockview = new DockviewComponent(container, {
      createComponent: (options) => {
        return new PanelRenderer(options.id);
      },
      disableFloatingGroups: true,
    });

    this._api = this._dockview.api;

    // Add default panels
    this._addDefaultLayout();
  }

  private _addDefaultLayout(): void {
    // 1. Viewport (center)
    const viewportPanel = this._api.addPanel({
      id: 'viewport',
      title: '3D Viewport',
      component: 'default',
    });

    // 2. Scene panel (left)
    const contentPanel = this._api.addPanel({
      id: 'content-browser',
      title: 'Scene',
      component: 'default',
      position: {
        direction: 'left',
        referencePanel: 'viewport',
      },
    });

    // 3. Content Browser (below scene, same left group)
    const assetBrowserPanel = this._api.addPanel({
      id: 'asset-browser',
      title: 'Content Browser',
      component: 'default',
      position: {
        direction: 'below',
        referencePanel: 'content-browser',
      },
    });

    // 4. Properties (right)
    const propertiesPanel = this._api.addPanel({
      id: 'properties',
      title: 'Properties',
      component: 'default',
      position: {
        direction: 'right',
        referencePanel: 'viewport',
      },
    });

    // Set sizes: ~20% left, ~60% center, ~20% right
    try {
      contentPanel.group.api.setSize({ width: 220 });
      propertiesPanel.group.api.setSize({ width: 260 });
    } catch (_e) {
      // Ignore if groups not ready
    }

    // Initialize panel contents using renderer map
    this._initViewport('viewport');
    this._initContentBrowser('content-browser');
    this._initAssetBrowser('asset-browser');
    this._initProperties('properties');
  }

  private _initViewport(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.className = 'viewport-container';
    el.appendChild(wrapper);

    this._viewport = new ViewportPanel(wrapper, this._engine);
  }

  private _initContentBrowser(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;

    new ContentBrowserPanel(el, this._engine, (go: GameObject) => {
      this._openNodeEditor(go);
    });
  }

  private _initAssetBrowser(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;

    this._assetBrowser = new ActorAssetBrowser(
      el,
      this.assetManager,
      (asset: ActorAsset) => this._openActorEditor(asset),
      (asset, mx, my) => {
        // Controller blueprints are not droppable into the scene
        if (asset.actorType === 'playerController' || asset.actorType === 'aiController') return;

        // Custom drop: check if the mouse is over the viewport
        if (!this._viewport) return;
        const rect = this._viewport.container.getBoundingClientRect();
        if (mx < rect.left || mx > rect.right || my < rect.top || my > rect.bottom) return;

        this._engine.scene.addGameObjectFromAsset(
          asset.id,
          asset.name,
          asset.rootMeshType,
          asset.blueprintData,
          { x: 0, y: 3, z: 0 },
          asset.components,
          asset.compiledCode,
          asset.rootPhysics,
          asset.actorType,
          asset.characterPawnConfig,
          asset.controllerClass,
          asset.controllerBlueprintId,
        );
      },
    );
  }

  private _initProperties(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    this._properties = new PropertiesPanel(el, this._engine);
  }

  private _openNodeEditor(go: GameObject): void {
    // Close existing editors
    this._closeNodeEditor();
    this._closeActorEditor();

    const panelId = 'node-editor-' + go.id;

    // Add a new panel for the node editor below the viewport
    this._api.addPanel({
      id: panelId,
      title: `⬡ Blueprint: ${go.name}`,
      component: 'default',
      position: {
        direction: 'below',
        referencePanel: 'viewport',
      },
    });

    // Give the blueprint editor 55% of vertical space
    try {
      const vpGroup = this._api.getPanel('viewport')?.group;
      if (vpGroup) vpGroup.api.setSize({ height: 300 });
    } catch (_e) { /* not critical */ }

    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.className = 'node-editor-container';
    el.appendChild(wrapper);

    this._nodeEditorCleanup = mountNodeEditor(wrapper, go);
  }

  /** Open the full actor editor for an ActorAsset */
  private _openActorEditor(asset: ActorAsset): void {
    // Close existing editors
    this._closeNodeEditor();
    this._closeActorEditor();

    const panelId = 'actor-editor-' + asset.id;

    const titleIcon = asset.actorType === 'playerController' ? '🎮'
      : asset.actorType === 'aiController' ? '🤖'
      : '⬡';
    const titleLabel = asset.actorType === 'playerController' ? 'PlayerController'
      : asset.actorType === 'aiController' ? 'AIController'
      : 'Actor';

    this._api.addPanel({
      id: panelId,
      title: `${titleIcon} ${titleLabel}: ${asset.name}`,
      component: 'default',
      position: {
        direction: 'below',
        referencePanel: 'viewport',
      },
    });

    try {
      const vpGroup = this._api.getPanel('viewport')?.group;
      if (vpGroup) vpGroup.api.setSize({ height: 300 });
    } catch (_e) { /* not critical */ }

    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    el.appendChild(wrapper);

    // Full sync: push every aspect of the asset into existing scene instances
    const syncInstances = () => {
      this.assetManager.notifyAssetChanged(asset.id);
      this._engine.scene.syncActorAssetInstances(
        asset.id,
        asset.name,
        asset.rootMeshType,
        asset.blueprintData,
        asset.compiledCode,
        asset.components,
        asset.rootPhysics,
        asset.actorType,
        asset.characterPawnConfig,
        asset.controllerClass,
        asset.controllerBlueprintId,
      );
    };

    // When the asset's blueprint is compiled, save code then sync
    const onCompile = (code: string) => {
      asset.compiledCode = code;
      asset.touch();
      syncInstances();
    };

    // When viewport-level properties change (mesh type, components, transforms)
    const onAssetChanged = () => {
      syncInstances();
    };

    this._actorEditor = new ActorEditorPanel(wrapper, asset, onCompile, onAssetChanged, this.assetManager, this._onSave ?? undefined);
  }

  /** Wire up the StructureAssetManager for the content browser and editors */
  setStructureManager(mgr: StructureAssetManager): void {
    this._structManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setStructureManager(
        mgr,
        (sa: StructureAsset) => this._openStructureEditor(sa),
        (ea: EnumAsset) => this._openEnumEditor(ea),
      );
    }
  }

  /** Open a structure editor panel */
  private _openStructureEditor(sa: StructureAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'struct-editor-' + sa.id;
    this._api.addPanel({
      id: panelId,
      title: `🔷 Struct: ${sa.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });

    try {
      const vpGroup = this._api.getPanel('viewport')?.group;
      if (vpGroup) vpGroup.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._structManager) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    el.appendChild(wrapper);

    new StructureEditorPanel(wrapper, sa, this._structManager, () => {
      // Update panel title when name changes
      const panel = this._api.getPanel(panelId);
      if (panel) {
        try { panel.setTitle(`🔷 Struct: ${sa.name}`); } catch (_e) {}
      }
    });
  }

  /** Open an enum editor panel */
  private _openEnumEditor(ea: EnumAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'enum-editor-' + ea.id;
    this._api.addPanel({
      id: panelId,
      title: `📋 Enum: ${ea.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });

    try {
      const vpGroup = this._api.getPanel('viewport')?.group;
      if (vpGroup) vpGroup.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._structManager) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    el.appendChild(wrapper);

    new EnumEditorPanel(wrapper, ea, this._structManager, () => {
      const panel = this._api.getPanel(panelId);
      if (panel) {
        try { panel.setTitle(`📋 Enum: ${ea.name}`); } catch (_e) {}
      }
    });
  }

  private _closeTypeEditor(): void {
    const panels = this._api.panels;
    for (const p of panels) {
      if (p.id.startsWith('struct-editor-') || p.id.startsWith('enum-editor-')) {
        this._api.removePanel(p);
      }
    }
  }

  private _closeNodeEditor(): void {
    if (this._nodeEditorCleanup) {
      this._nodeEditorCleanup();
      this._nodeEditorCleanup = null;
    }

    // Remove all node editor panels
    const panels = this._api.panels;
    for (const p of panels) {
      if (p.id.startsWith('node-editor-')) {
        this._api.removePanel(p);
      }
    }
  }

  private _closeActorEditor(): void {
    if (this._actorEditor) {
      this._actorEditor.dispose();
      this._actorEditor = null;
    }

    const panels = this._api.panels;
    for (const p of panels) {
      if (p.id.startsWith('actor-editor-')) {
        this._api.removePanel(p);
      }
    }
  }

  // Called every frame from main loop
  render(): void {
    if (this._viewport) {
      this._viewport.render();
    }
  }

  // Refresh properties during play mode
  refreshProperties(): void {
    if (this._properties) {
      this._properties.refresh();
    }
  }

  /** Set the save handler (called when user clicks Save in blueprint editor) */
  setSaveHandler(onSave: () => void): void {
    this._onSave = onSave;
  }

  // ---- Camera state for project save/load ----

  getCameraState(): CameraStateJSON | undefined {
    if (!this._viewport) return undefined;
    return this._viewport.getCameraState();
  }

  applyCameraState(state: CameraStateJSON): void {
    if (this._viewport) {
      this._viewport.applyCameraState(state);
    }
  }

  /** Get the viewport canvas for pointer lock / character controller */
  getCanvas(): HTMLCanvasElement | null {
    return this._viewport?.getCanvas() ?? null;
  }

  /** Set or clear the play-mode camera (character pawn) */
  setPlayCamera(cam: THREE.PerspectiveCamera | null): void {
    if (this._viewport) this._viewport.setPlayCamera(cam);
  }
}
