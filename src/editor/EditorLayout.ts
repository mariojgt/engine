import {
  DockviewComponent,
  type DockviewApi,
  type IContentRenderer,
  type GroupPanelPartInitParameters,
  type DockviewGroupPanel,
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
import { AnimBlueprintManager, type AnimBlueprintAsset } from './AnimBlueprintData';
import { AnimBlueprintEditorPanel } from './AnimBlueprintEditorPanel';
import { WidgetBlueprintManager, type WidgetBlueprintAsset } from './WidgetBlueprintData';
import { WidgetBlueprintEditorPanel } from './WidgetBlueprintEditorPanel';
import { GameInstanceBlueprintManager, type GameInstanceBlueprintAsset } from './GameInstanceData';
import { GameInstanceEditorPanel } from './GameInstanceEditorPanel';
import type { StructureAssetManager, StructureAsset, EnumAsset } from './StructureAsset';
import type { MeshAssetManager, MaterialAssetJSON } from './MeshAsset';
import type { MeshAsset } from './MeshAsset';
import { StructureEditorPanel } from './StructureEditorPanel';
import { InputMappingEditorPanel } from './InputMappingEditorPanel';
import { SaveGameAssetManager, type SaveGameAsset } from './SaveGameAsset';
import { SaveGameEditorPanel } from './SaveGameEditorPanel';
import { DataTableAssetManager, type DataTableAsset } from './DataTableAsset';
import { DataTableEditorPanel } from './DataTableEditorPanel';
import { EventAssetManager, type EventAsset } from './EventAsset';
import { EnumEditorPanel } from './EnumEditorPanel';
import { MaterialEditorPanel } from './MaterialEditorPanel';
import { PhysicsSettingsPanel } from './PhysicsSettingsPanel';
import { ProjectSettingsPanel } from './ProjectSettingsPanel';
import type { CameraStateJSON } from './SceneSerializer';
import { SceneCompositionManager } from './scene/SceneCompositionManager';
import { WorldOutlinerPanel } from './WorldOutlinerPanel';
import { ClassInheritanceSystem } from './ClassInheritanceSystem';
import { ClassHierarchyPanel } from './ClassHierarchyPanel';
import { InheritanceDialogsUI } from './InheritanceDialogsUI';
import { SoundLibrary, type SoundCueData } from './SoundLibrary';
import { ParticleEditorPanel } from './ParticleEditorPanel';
import { ParticleSystemManager } from '../engine/ParticleSystem';
import { SoundCueEditorPanel } from './SoundCueEditorPanel';
import { ShaderGraphEditorPanel } from './ShaderGraphEditorPanel';
import { DockingManager, GroupHeaderActions } from './DockingManager';
import { Scene2DManager, type SceneMode } from './Scene2DManager';
import { AnimBlueprint2DEditorPanel } from './AnimBlueprint2DEditorPanel';
import { TileEditorPanel } from './TileEditorPanel';

import { TilemapRenderer } from './TilemapRenderer';
import type { TilesetAsset } from '../engine/TilemapData';
import { createIconSpan, Icons, ICON_COLORS } from './icons';
import { ProfilerPanel } from './profiler/ProfilerPanel';
import { ProfilerOverlay } from './profiler/ProfilerOverlay';
import { installProfilerHooks, uninstallProfilerHooks } from './profiler/ProfilerHooks';
import { AIAssetManager, type BehaviorTreeAsset, type BlackboardAsset, type BTTaskAsset, type BTDecoratorAsset, type BTServiceAsset, type AIControllerAsset } from './ai/AIAssetManager';
import { BlackboardEditorPanel } from './ai/BlackboardEditorPanel';
import { BehaviorTreeEditorPanel } from './ai/BehaviorTreeEditorPanel';
import { AIBlueprintEditorPanel } from './ai/AIBlueprintEditorPanel';
import { NavMeshPanel } from './NavMeshPanel';

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
  private _dockingManager!: DockingManager;
  private _viewport: ViewportPanel | null = null;
  private _properties: PropertiesPanel | null = null;
  private _particleEditor?: ParticleEditorPanel;
  private _physicsSettings: PhysicsSettingsPanel | null = null;
  private _navMeshPanel: NavMeshPanel | null = null;
  private _projectSettings: ProjectSettingsPanel | null = null;
  private _nodeEditorCleanup: (() => void) | null = null;
  private _actorEditor: ActorEditorPanel | null = null;
  private _animBPEditor: AnimBlueprintEditorPanel | null = null;
  private _animBP2DEditor: AnimBlueprint2DEditorPanel | null = null;
  private _widgetBPEditor: WidgetBlueprintEditorPanel | null = null;
  private _assetBrowser: ActorAssetBrowser | null = null;
  private _structManager: StructureAssetManager | null = null;
  private _meshManager: MeshAssetManager | null = null;
  private _animBPManager: AnimBlueprintManager | null = null;
  private _widgetBPManager: WidgetBlueprintManager | null = null;
  private _gameInstanceManager: GameInstanceBlueprintManager | null = null;
  private _gameInstanceEditor: GameInstanceEditorPanel | null = null;
  private _saveGameManager: SaveGameAssetManager | null = null;
  private _dataTableManager: DataTableAssetManager | null = null;
  private _inputMappingManager: import('./InputMappingAsset').InputMappingAssetManager | null = null;
  private _eventManager: EventAssetManager | null = null;
  private _materialEditor: MaterialEditorPanel | null = null;
  private _shaderGraphEditor: ShaderGraphEditorPanel | null = null;
  private _soundCueEditor: SoundCueEditorPanel | null = null;

  // ── AI ──
  private _aiManager: AIAssetManager | null = null;
  private _bbEditor: BlackboardEditorPanel | null = null;
  private _btEditor: BehaviorTreeEditorPanel | null = null;
  private _aiBPEditor: AIBlueprintEditorPanel | null = null;

  /** Profiler panel and viewport overlay */
  private _profilerPanel: ProfilerPanel | null = null;
  private _profilerOverlay: ProfilerOverlay | null = null;

  /** Scene composition manager — environment actors (lights, sky, fog, etc.) */
  public composition: SceneCompositionManager;

  /** World Outliner panel reference */
  private _outliner: WorldOutlinerPanel | null = null;

  /** Class Hierarchy panel reference */
  private _hierarchyPanel: ClassHierarchyPanel | null = null;

  /** Inheritance system instance */
  public inheritance: ClassInheritanceSystem;

  /** 2D Scene Manager — orchestrates 2D mode, camera, physics, assets */
  public scene2DManager: Scene2DManager;

  /* 2D editor panels */
  private _tileEditorPanel: TileEditorPanel | null = null;
  private _tilemapRenderer: TilemapRenderer | null = null;
  private _current2DMode: SceneMode = '3D';

  /** Shared actor asset manager — stores all actor blueprints in memory */
  public assetManager: ActorAssetManager;

  /** Callback for saving the project — wired by main.ts */
  private _onSave: (() => void) | null = null;

  constructor(container: HTMLElement, engine: Engine) {
    this._engine = engine;
    this.assetManager = new ActorAssetManager();
    this.composition = new SceneCompositionManager(engine.scene.threeScene);

    // Initialize class inheritance system
    this.inheritance = ClassInheritanceSystem.instance;
    this.inheritance.setActorManager(this.assetManager);
    this.inheritance.setDialogs(new InheritanceDialogsUI());

    // Initialize 2D Scene Manager
    this.scene2DManager = new Scene2DManager();
    this.scene2DManager.engine = this._engine;

    // Listen for cross-panel navigation events (fired by editor info bars)
    document.addEventListener('open-actor-editor', ((e: CustomEvent) => {
      const assetId = e.detail?.assetId;
      if (assetId) {
        const asset = this.assetManager.getAsset(assetId);
        if (asset) this._openActorEditor(asset);
      }
    }) as EventListener);

    document.addEventListener('open-widget-editor', ((e: CustomEvent) => {
      const assetId = e.detail?.assetId;
      if (assetId && this._widgetBPManager) {
        const asset = this._widgetBPManager.getAsset(assetId);
        if (asset) this._openWidgetBlueprintEditor(asset);
      }
    }) as EventListener);

    document.addEventListener('show-in-hierarchy', ((e: CustomEvent) => {
      const { id, kind } = e.detail ?? {};
      if (id) this.showClassHierarchy(id);
    }) as EventListener);

    this._init(container);
  }

  private _init(container: HTMLElement): void {
    this._dockview = new DockviewComponent(container, {
      createComponent: (options) => {
        return new PanelRenderer(options.id);
      },
      disableFloatingGroups: false,
      floatingGroupBounds: {
        minimumHeightWithinViewport: 0,
        minimumWidthWithinViewport: 0,
      },
      createRightHeaderActionComponent: (_group: DockviewGroupPanel) => {
        return new GroupHeaderActions();
      },
    });

    this._api = this._dockview.api;

    // ── Allow floating panels to escape the editor container ────
    // Dockview uses `contain: layout` and `overflow: hidden` on internal
    // containers which visually clips floating groups to the editor area.
    // We override those styles so panels can be dragged across monitors.
    this._removeFloatingClipping(container);

    // Initialize docking manager for detachable/floating panels
    this._dockingManager = new DockingManager(this._api, container);

    // Add default panels
    this._addDefaultLayout();
  }

  /**
   * Remove CSS properties that clip floating groups to the editor
   * container, so panels can freely overflow onto other monitors.
   */
  private _removeFloatingClipping(container: HTMLElement): void {
    // The DockviewComponent root `.dv-dockview`
    const dvRoot = container.querySelector<HTMLElement>('.dv-dockview');
    if (dvRoot) {
      dvRoot.style.contain = 'none';
      dvRoot.style.overflow = 'visible';
    }

    // The gridview element that parents floating overlays
    const gridview = container.querySelector<HTMLElement>('.dv-gridview');
    if (gridview) {
      gridview.style.overflow = 'visible';
    }
  }

  private _addDefaultLayout(): void {
    // 1. Viewport (center)
    const viewportPanel = this._api.addPanel({
      id: 'viewport',
      title: '3D Viewport',
      component: 'default',
    });

    // 2. World Outliner (left — replaces old Scene panel)
    const contentPanel = this._api.addPanel({
      id: 'world-outliner',
      title: 'World Outliner',
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
        referencePanel: 'world-outliner',
      },
    });

    // 3b. Class Hierarchy (tab in the same group as World Outliner)
    this._api.addPanel({
      id: 'class-hierarchy',
      title: 'Class Hierarchy',
      component: 'default',
      position: {
        referencePanel: 'world-outliner',
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
    this._initWorldOutliner('world-outliner');
    this._initClassHierarchy('class-hierarchy');
    this._initAssetBrowser('asset-browser');
    this._initProperties('properties');

    // 4.5 Particle Editor (tab alongside Properties)
    this._api.addPanel({
        id: 'particle-editor',
        title: 'VFX',
        component: 'default',
        position: {
            referencePanel: 'properties',
        },
    });
    this._initParticleEditor('particle-editor');

    // 5. Physics Settings (tab alongside Properties)
    this._api.addPanel({
      id: 'physics-settings',
      title: 'Physics',
      component: 'default',
      position: {
        referencePanel: 'properties',
      },
    });
    this._initPhysicsSettings('physics-settings');

    // 5b. Navigation Mesh (tab alongside Physics)
    this._api.addPanel({
      id: 'navmesh-panel',
      title: 'NavMesh',
      component: 'default',
      position: {
        referencePanel: 'physics-settings',
      },
    });
    this._initNavMeshPanel('navmesh-panel');

    // 6. Project Settings (tab alongside Physics)
    this._api.addPanel({
      id: 'project-settings',
      title: 'Project Settings',
      component: 'default',
      position: {
        referencePanel: 'physics-settings',
      },
    });
    this._initProjectSettings('project-settings');
  }

  private _initViewport(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.className = 'viewport-container';
    el.appendChild(wrapper);

    this._viewport = new ViewportPanel(wrapper, this._engine);

    // Provide the viewport's WebGL renderer and camera to the composition manager
    // so that PostProcessVolume can set up its composer pipeline.
    if (this._viewport) {
      const renderer = this._viewport.getRenderer();
      const camera = this._viewport.getCamera();
      if (renderer) this.composition.setRenderer(renderer);
      if (camera) this.composition.setCamera(camera);

      // Connect composition manager to viewport for actor gizmo + post-process support
      this._viewport.setCompositionManager(this.composition);
    }
  }

  private _initWorldOutliner(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;

    this._outliner = new WorldOutlinerPanel(
      el,
      this._engine,
      this.composition,
      (go: GameObject) => {
        this._openNodeEditor(go);
      },
      (actorId: string | null) => {
        // When a composition actor is selected, show its properties
        if (this._properties) {
          this._properties.showCompositionActor(actorId);
        }
      },
      this._viewport?.groupSystem ?? null,
    );
  }

  private _initClassHierarchy(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;

    this._hierarchyPanel = new ClassHierarchyPanel(el, (action) => {
      switch (action.type) {
        case 'open':
          if (action.kind === 'actor') {
            const asset = this.assetManager.getAsset(action.id);
            if (asset) this._openActorEditor(asset);
          } else if (action.kind === 'widget' && this._widgetBPManager) {
            const asset = this._widgetBPManager.getAsset(action.id);
            if (asset) this._openWidgetBlueprintEditor(asset);
          }
          break;
        case 'create-child':
          if (action.kind === 'actor') {
            const parentActor = this.assetManager.getAsset(action.id);
            const childName = parentActor ? `${parentActor.name}_Child` : 'ChildActor';
            const child = this.inheritance.createChildActor(action.id, childName);
            if (child) this._openActorEditor(child);
          } else if (action.kind === 'widget') {
            const parentWidget = this._widgetBPManager?.getAsset(action.id);
            const childName = parentWidget ? `${parentWidget.name}_Child` : 'ChildWidget';
            const child = this.inheritance.createChildWidget(action.id, childName);
            if (child) this._openWidgetBlueprintEditor(child);
          }
          break;
        case 'show-parent': {
          const chain = this.inheritance.getAncestryChain(action.id);
          if (chain.length > 1) this._hierarchyPanel?.highlightClass(chain[1]);
          break;
        }
        case 'show-children':
          // highlightClass already expands children
          this._hierarchyPanel?.highlightClass(action.id);
          break;
        case 'change-parent': {
          const newParentName = prompt('Enter new parent class name:');
          if (!newParentName) break;
          const allActors = this.assetManager.assets;
          const found = allActors.find(a => a.name === newParentName);
          if (found) {
            this.inheritance.reparentActor(action.id, found.id);
          } else {
            alert(`No actor class found with name "${newParentName}"`);
          }
          break;
        }
        default:
          break;
      }
    });

    this._hierarchyPanel.setActorManager(this.assetManager);
    
    // Listen for Shader Graph requests from Material Editor
    window.addEventListener('open-shader-graph', ((e: CustomEvent) => {
        const matId = e.detail.materialId;
        const mat = this._meshManager?.allMaterials.find(m => m.assetId === matId);
        if (mat) {
             this._openShaderGraph(mat);
        }
    }) as EventListener);
  }

  private _openShaderGraph(mat: MaterialAssetJSON): void {
      // Create or focus panel
      let panel = this._api.getPanel('shader_graph');
      if (!panel) {
          this._api.addPanel({
              id: 'shader_graph',
              title: 'Shader Graph',
              component: 'default',
              position: { referencePanel: 'viewport', direction: 'below' } // Dock below viewport
          });
          
          this._initShaderGraph('shader_graph');
          panel = this._api.getPanel('shader_graph');
      }
      
      panel?.api.setActive();
      if (this._shaderGraphEditor) {
          this._shaderGraphEditor.setMaterial(mat);
          try { panel?.setTitle(`Graph: ${mat.assetName}`); } catch (_e) {}
      }
  }

  private _initShaderGraph(panelId: string): void {
      const renderer = rendererMap.get(panelId);
      if (!renderer) {
          // If renderer not set (auto-creation via addPanel might not set renderer if not in map?)
          // We need a renderer.
           // this._docking.rendererMap.set(panelId, { element: document.createElement('div', {}) } as any);
      }
      const r = rendererMap.get(panelId);
      if(r) {
        this._shaderGraphEditor = new ShaderGraphEditorPanel(r.element, this._engine, this._meshManager);
      }
  }

  private _initAssetBrowser(panelId: string): void{
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
          asset.rootMaterialOverrides,
        );
      },
    );

    // Wire "Show in Hierarchy" callback from content browser to hierarchy panel
    this._assetBrowser.setShowInHierarchyCallback((id, kind) => {
      this._showClassHierarchyPanel();
      this._hierarchyPanel?.highlightClass(id);
    });
  }

  private _initProperties(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    this._properties = new PropertiesPanel(el, this._engine);
    this._properties.setCompositionManager(this.composition);
  }

  private _initParticleEditor(panelId: string): void {
      const renderer = rendererMap.get(panelId);
      if (!renderer) return;
      this._particleEditor = new ParticleEditorPanel(renderer.element, this._engine);
  }

  private _initPhysicsSettings(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    this._physicsSettings = new PhysicsSettingsPanel(el, this._engine);
  }

  private _initNavMeshPanel(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    this._navMeshPanel = new NavMeshPanel(el, this._engine);
    this._navMeshPanel.setScene2DManager(this.scene2DManager);
  }

  private _initProjectSettings(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    this._projectSettings = new ProjectSettingsPanel(el, this._engine);
    // Wire managers that are already available
    if (this._gameInstanceManager) {
      this._projectSettings.setGameInstanceManager(this._gameInstanceManager);
    }
  }

  /**
   * Inject a Lucide SVG icon into a dockview panel tab.
   * Since SVG elements contribute no textContent, dockview's change-detection
   * in DefaultTab.render() won't overwrite the injected icon.
   */
  private _injectTabIcon(panelId: string, icon: any[], color?: string): void {
    requestAnimationFrame(() => {
      const panel = this._api.getPanel(panelId) as any;
      const tabEl = panel?.view?.tab?.element as HTMLElement | undefined;
      if (!tabEl) return;
      const tabContent = tabEl.querySelector('.dv-default-tab-content') as HTMLElement | null;
      if (!tabContent) return;
      // Remove any previously injected icon
      tabContent.querySelector('.dv-tab-icon')?.remove();
      const iconEl = createIconSpan(icon, 'xs', color);
      iconEl.classList.add('dv-tab-icon');
      iconEl.style.marginRight = '4px';
      tabContent.insertBefore(iconEl, tabContent.firstChild);
    });
  }

  private _openNodeEditor(go: GameObject): void {
    // Close existing editors
    this._closeNodeEditor();
    this._closeActorEditor();

    const panelId = 'node-editor-' + go.id;

    // Add a new panel for the node editor below the viewport
    this._api.addPanel({
      id: panelId,
      title: `Blueprint: ${go.name}`,
      component: 'default',
      position: {
        direction: 'below',
        referencePanel: 'viewport',
      },
    });
    this._injectTabIcon(panelId, Icons.Hexagon, ICON_COLORS.blueprint);

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

    const titleLabel = asset.actorType === 'playerController' ? 'PlayerController'
      : asset.actorType === 'aiController' ? 'AIController'
      : 'Actor';

    const actorIcon = asset.actorType === 'playerController' ? Icons.Gamepad2
      : asset.actorType === 'aiController' ? Icons.Bot
      : Icons.Hexagon;
    const actorColor = asset.actorType === 'playerController' ? ICON_COLORS.actor
      : asset.actorType === 'aiController' ? ICON_COLORS.blueprint
      : ICON_COLORS.blueprint;

    this._api.addPanel({
      id: panelId,
      title: `${titleLabel}: ${asset.name}`,
      component: 'default',
      position: {
        direction: 'below',
        referencePanel: 'viewport',
      },
    });
    this._injectTabIcon(panelId, actorIcon, actorColor);

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
        asset.rootMaterialOverrides,
      );

      // Propagate changes to all children if this is a parent class (silently, no dialog)
      this.inheritance.propagateActorChanges(asset.id, false);
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
    // Wire up AI asset manager for AI controller picker in controller dropdown
    if (this._aiManager) {
      this._actorEditor.setAIManager(this._aiManager);
    }
    // Wire up mesh manager for skeletal mesh picker
    if (this._meshManager) {
      this._actorEditor.setMeshManager(this._meshManager);
    }
    // Wire up animation blueprint manager for anim BP picker
    if (this._animBPManager) {
      this._actorEditor.setAnimBPManager(this._animBPManager);
    }
    // Wire up Scene2DManager for 2D sprite sheet / anim blueprint pickers
    this._actorEditor.setScene2DManager(this.scene2DManager);
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

  /** Wire up the MeshAssetManager for the content browser */
  setMeshManager(mgr: MeshAssetManager): void {
    this._meshManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setMeshManager(
        mgr,
        (meshAsset: MeshAsset, mx: number, my: number) => {
          // Mesh drop: check if the mouse is over the viewport
          if (!this._viewport) return;
          const rect = this._viewport.container.getBoundingClientRect();
          if (mx < rect.left || mx > rect.right || my < rect.top || my > rect.bottom) return;

          // Place the imported mesh in the scene
          this._engine.scene.addGameObjectFromMeshAsset(meshAsset, { x: 0, y: 3, z: 0 });
        },
        (mat: MaterialAssetJSON) => this._openMaterialEditor(mat),
      );
    }
  }

  /** Wire up the AnimBlueprintManager for the content browser */
  setAnimBPManager(mgr: AnimBlueprintManager): void {
    this._animBPManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setAnimBPManager(mgr, (asset: AnimBlueprintAsset) => {
        if (asset.is2D) {
          this._openAnimBlueprint2DEditor(asset);
        } else {
          this._openAnimBlueprintEditor(asset);
        }
      });
    }
  }

  /** Read-only access for play mode to pass the manager to Scene2DManager */
  get animBPManager(): AnimBlueprintManager | null {
    return this._animBPManager;
  }

  /** Wire up the WidgetBlueprintManager for the content browser */
  setWidgetBPManager(mgr: WidgetBlueprintManager): void {
    this._widgetBPManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setWidgetBPManager(mgr, (asset: WidgetBlueprintAsset) => this._openWidgetBlueprintEditor(asset));
    }
    // Wire widget manager into inheritance system & hierarchy panel
    this.inheritance.setWidgetManager(mgr);
    if (this._hierarchyPanel) {
      this._hierarchyPanel.setWidgetManager(mgr);
    }
  }

  /** Wire up the GameInstanceBlueprintManager for the content browser */
  setGameInstanceManager(mgr: GameInstanceBlueprintManager): void {
    this._gameInstanceManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setGameInstanceManager(mgr, (asset: GameInstanceBlueprintAsset) => this._openGameInstanceEditor(asset));
    }
    // Also wire into Project Settings panel for Game Instance Class dropdown
    if (this._projectSettings) {
      this._projectSettings.setGameInstanceManager(mgr);
    }
  }

  /** Wire up the SaveGameAssetManager for the content browser and editors */
  setSaveGameManager(mgr: SaveGameAssetManager): void {
    this._saveGameManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setSaveGameManager(mgr, (asset: SaveGameAsset) => this._openSaveGameEditor(asset));
    }
  }

  /** Wire up the DataTableAssetManager for the content browser and editors */
  setDataTableManager(mgr: DataTableAssetManager): void {
    this._dataTableManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setDataTableManager(mgr, (asset: DataTableAsset) => this._openDataTableEditor(asset));
    }
  }

  /** Wire up the InputMappingAssetManager for the content browser and editors */
  setInputMappingManager(mgr: import('./InputMappingAsset').InputMappingAssetManager): void {
    this._inputMappingManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setInputMappingManager(mgr, (asset: import('./InputMappingAsset').InputMappingAsset) => this._openInputMappingEditor(asset));
    }
  }

  /** Wire up the EventAssetManager for the content browser and editors */
  setEventManager(mgr: EventAssetManager): void {
    this._eventManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setEventManager(mgr, (asset: EventAsset) => this._openEventEditor(asset));
    }
  }

  /** Wire up the SoundLibrary callbacks for the content browser */
  setSoundLibraryCallbacks(): void {
    if (this._assetBrowser) {
      this._assetBrowser.setSoundLibraryCallbacks((cue: SoundCueData) => this._openSoundCueEditor(cue));
    }
  }

  /** Wire up the AIAssetManager for content browser and AI editors */
  setAIManager(mgr: AIAssetManager): void {
    this._aiManager = mgr;
    if (this._assetBrowser) {
      this._assetBrowser.setAIManager(mgr, {
        onOpenBehaviorTree: (asset: BehaviorTreeAsset) => this._openBehaviorTreeEditor(asset),
        onOpenBlackboard: (asset: BlackboardAsset) => this._openBlackboardEditor(asset),
        onOpenBTTask: (asset: BTTaskAsset) => this._openBTTaskEditor(asset),
        onOpenBTDecorator: (asset: BTDecoratorAsset) => this._openBTDecoratorEditor(asset),
        onOpenBTService: (asset: BTServiceAsset) => this._openBTServiceEditor(asset),
        onOpenAIController: (asset: AIControllerAsset) => this._openAIControllerEditor(asset),
      });
    }
  }

  /** Open a Sound Cue editor panel */
  private _openSoundCueEditor(cue: SoundCueData): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'sound-cue-editor-' + cue.assetId;
    this._api.addPanel({
      id: panelId,
      title: `Sound Cue: ${cue.assetName}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });

    const panel = this._api.getPanel(panelId);
    if (panel) {
      const renderer = rendererMap.get(panelId);
      if (renderer) {
        this._soundCueEditor = new SoundCueEditorPanel(
          renderer.element,
          cue,
          () => {
            if (this._assetBrowser) this._assetBrowser.refresh();
          }
        );
      }
    }
  }

  /** Open a game instance blueprint editor panel */
  private _openGameInstanceEditor(asset: GameInstanceBlueprintAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'game-instance-editor-' + asset.id;
    this._api.addPanel({
      id: panelId,
      title: `GameInstance: ${asset.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Globe, ICON_COLORS.secondary);

    try {
      this._api.getPanel('viewport')?.group.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer) return;

    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._gameInstanceEditor = new GameInstanceEditorPanel(
      wrapper,
      asset,
      this._onSave ?? undefined,
    );
  }

  /** Open an animation blueprint editor panel */
  private _openAnimBlueprintEditor(asset: AnimBlueprintAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'anim-bp-editor-' + asset.id;
    this._api.addPanel({
      id: panelId,
      title: `AnimBP: ${asset.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Clapperboard, ICON_COLORS.secondary);

    try {
      this._api.getPanel('viewport')?.group.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer) return;

    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._animBPEditor = new AnimBlueprintEditorPanel(
      wrapper,
      asset,
      this._onSave ?? undefined,
    );
    if (this._meshManager) this._animBPEditor.setMeshManager(this._meshManager);
  }

  /** Open a 2D animation blueprint editor panel */
  private _openAnimBlueprint2DEditor(asset: AnimBlueprintAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'anim-bp-2d-editor-' + asset.id;
    this._api.addPanel({
      id: panelId,
      title: `AnimBP 2D: ${asset.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Film, ICON_COLORS.secondary);

    try {
      this._api.getPanel('viewport')?.group.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer) return;

    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._animBP2DEditor = new AnimBlueprint2DEditorPanel(
      wrapper,
      asset,
      this._onSave ?? undefined,
    );
    this._animBP2DEditor.setScene2DManager(this.scene2DManager);
  }

  /** Open a widget blueprint editor panel */
  private _openWidgetBlueprintEditor(asset: WidgetBlueprintAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'widget-bp-editor-' + asset.id;
    this._api.addPanel({
      id: panelId,
      title: `Widget: ${asset.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Palette, ICON_COLORS.widget);

    try {
      this._api.getPanel('viewport')?.group.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer) return;

    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._widgetBPEditor = new WidgetBlueprintEditorPanel(
      wrapper,
      asset,
      (code: string) => {
        asset.compiledCode = code;
        asset.touch();
        // Propagate changes to all children if this is a parent widget (silently)
        this.inheritance.propagateWidgetChanges(asset.id, false);
      },
      this._onSave ?? undefined,
    );
  }

  /** Open an input mapping editor panel */
  private _openInputMappingEditor(im: import('./InputMappingAsset').InputMappingAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'input-mapping-editor-' + im.id;
    this._api.addPanel({
      id: panelId,
      title: `Input: ${im.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Gamepad2, '#4CAF50');

    try {
      const vpGroup = this._api.getPanel('viewport')?.group;
      if (vpGroup) vpGroup.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._inputMappingManager) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    el.appendChild(wrapper);

    new InputMappingEditorPanel(wrapper, im.id);
  }

  /** Open a structure editor panel */
  private _openStructureEditor(sa: StructureAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'struct-editor-' + sa.id;
    this._api.addPanel({
      id: panelId,
      title: `Struct: ${sa.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Diamond, ICON_COLORS.blue);

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
        try { panel.setTitle(`Struct: ${sa.name}`); } catch (_e) {}
        this._injectTabIcon(panelId, Icons.Diamond, ICON_COLORS.blue);
      }
    });
  }

  /** Open a save game editor panel */
  private _openSaveGameEditor(sg: SaveGameAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'savegame-editor-' + sg.id;
    this._api.addPanel({
      id: panelId,
      title: `SaveGame: ${sg.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Save, '#FF7043');

    try {
      const vpGroup = this._api.getPanel('viewport')?.group;
      if (vpGroup) vpGroup.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._saveGameManager) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    el.appendChild(wrapper);

    new SaveGameEditorPanel(wrapper, sg, this._saveGameManager, this._structManager ?? null, () => {
      const panel = this._api.getPanel(panelId);
      if (panel) {
        try { panel.setTitle(`SaveGame: ${sg.name}`); } catch (_e) {}
        this._injectTabIcon(panelId, Icons.Save, '#FF7043');
      }
    });
  }

  /** Open a data table editor panel */
  private _openDataTableEditor(dt: DataTableAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'datatable-editor-' + dt.id;
    this._api.addPanel({
      id: panelId,
      title: `DataTable: ${dt.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Table2, '#14b8a6');

    try {
      const vpGroup = this._api.getPanel('viewport')?.group;
      if (vpGroup) vpGroup.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._dataTableManager || !this._structManager) return;
    const el = renderer.element;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    el.appendChild(wrapper);

    new DataTableEditorPanel(wrapper, dt, this._dataTableManager, this._structManager, () => {
      const panel = this._api.getPanel(panelId);
      if (panel) {
        try { panel.setTitle(`DataTable: ${dt.name}`); } catch (_e) {}
        this._injectTabIcon(panelId, Icons.Table2, '#14b8a6');
      }
    });
  }

  /** Open an event editor panel (just a name dialog for now) */
  private _openEventEditor(ev: EventAsset): void {
    // Events are lightweight assets — just show in the content browser for now
    console.log(`[EditorLayout] Event selected: ${ev.name} (${ev.id})`);
  }

  /** Open an enum editor panel */
  private _openEnumEditor(ea: EnumAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'enum-editor-' + ea.id;
    this._api.addPanel({
      id: panelId,
      title: `Enum: ${ea.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.ClipboardList, ICON_COLORS.secondary);

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
        try { panel.setTitle(`Enum: ${ea.name}`); } catch (_e) {}
        this._injectTabIcon(panelId, Icons.ClipboardList, ICON_COLORS.secondary);
      }
    });
  }

  /** Open a material editor panel */
  private _openMaterialEditor(mat: MaterialAssetJSON): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'material-editor-' + mat.assetId;
    this._api.addPanel({
      id: panelId,
      title: `Material: ${mat.assetName}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Palette, ICON_COLORS.material);

    try {
      this._api.getPanel('viewport')?.group.api.setSize({ height: 300 });
    } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._meshManager) return;

    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._materialEditor = new MaterialEditorPanel(
      wrapper,
      mat,
      this._meshManager,
      () => {
        // Update panel title when name changes
        const panel = this._api.getPanel(panelId);
        if (panel) {
          try { panel.setTitle(`Material: ${mat.assetName}`); } catch (_e) {}
          this._injectTabIcon(panelId, Icons.Palette, ICON_COLORS.material);
        }

        // Update all instances of this material in the scene
        this._engine.scene.updateMaterialInScene(mat.assetId);

        // Sync all scene instances whose material overrides reference this material
        for (const asset of this.assetManager.assets) {
          const rootUsed = Object.values(asset.rootMaterialOverrides).includes(mat.assetId);
          const compUsed = asset.components.some(c =>
            c.materialOverrides && Object.values(c.materialOverrides).includes(mat.assetId),
          );
          if (rootUsed || compUsed) {
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
              asset.rootMaterialOverrides,
            );
          }
        }
      },
    );
  }

  // ============================================================
  //  AI Editor Open Methods
  // ============================================================

  /** Open a Behavior Tree editor panel */
  private _openBehaviorTreeEditor(bt: BehaviorTreeAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'ai-bt-editor-' + bt.id;
    this._api.addPanel({
      id: panelId,
      title: `BT: ${bt.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Bot, '#1565C0');

    try { this._api.getPanel('viewport')?.group.api.setSize({ height: 300 }); } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._aiManager) return;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._btEditor = new BehaviorTreeEditorPanel(wrapper, bt, this._aiManager, () => {
      const panel = this._api.getPanel(panelId);
      if (panel) {
        try { panel.setTitle(`BT: ${bt.name}`); } catch (_e) {}
        this._injectTabIcon(panelId, Icons.Bot, '#1565C0');
      }
    });

    // Wire create callbacks so new tasks/decorators/services can be created from BT canvas
    this._btEditor.setCreateCallbacks({
      onCreateTask: (name: string) => {
        if (!this._aiManager) return;
        const task = this._aiManager.createTask(name);
        const fm = this._assetBrowser?.getFolderManager();
        if (fm) fm.setAssetLocation(task.id, 'btTask', 'root');
      },
      onCreateDecorator: (name: string) => {
        if (!this._aiManager) return;
        const dec = this._aiManager.createDecorator(name);
        const fm = this._assetBrowser?.getFolderManager();
        if (fm) fm.setAssetLocation(dec.id, 'btDecorator', 'root');
      },
      onCreateService: (name: string) => {
        if (!this._aiManager) return;
        const svc = this._aiManager.createService(name);
        const fm = this._assetBrowser?.getFolderManager();
        if (fm) fm.setAssetLocation(svc.id, 'btService', 'root');
      },
      onOpenTask: (id: string) => {
        const task = this._aiManager?.getTask(id);
        if (task) this._openBTTaskEditor(task);
      },
      onOpenDecorator: (id: string) => {
        const dec = this._aiManager?.getDecorator(id);
        if (dec) this._openBTDecoratorEditor(dec);
      },
      onOpenService: (id: string) => {
        const svc = this._aiManager?.getService(id);
        if (svc) this._openBTServiceEditor(svc);
      },
    });
  }

  /** Open a Blackboard editor panel */
  private _openBlackboardEditor(bb: BlackboardAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'ai-bb-editor-' + bb.id;
    this._api.addPanel({
      id: panelId,
      title: `BB: ${bb.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.ClipboardList, '#2E7D32');

    try { this._api.getPanel('viewport')?.group.api.setSize({ height: 300 }); } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._aiManager) return;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._bbEditor = new BlackboardEditorPanel(wrapper, bb, this._aiManager, () => {
      const panel = this._api.getPanel(panelId);
      if (panel) {
        try { panel.setTitle(`BB: ${bb.name}`); } catch (_e) {}
        this._injectTabIcon(panelId, Icons.ClipboardList, '#2E7D32');
      }
    });
  }

  /** Open a BT Task blueprint editor panel */
  private _openBTTaskEditor(task: BTTaskAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'ai-task-editor-' + task.id;
    this._api.addPanel({
      id: panelId,
      title: `Task: ${task.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Zap, '#E65100');

    try { this._api.getPanel('viewport')?.group.api.setSize({ height: 300 }); } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._aiManager) return;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._aiBPEditor = new AIBlueprintEditorPanel(wrapper, task, 'btTask', this._aiManager);
  }

  /** Open a BT Decorator blueprint editor panel */
  private _openBTDecoratorEditor(dec: BTDecoratorAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'ai-dec-editor-' + dec.id;
    this._api.addPanel({
      id: panelId,
      title: `Decorator: ${dec.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Shield, '#6A1B9A');

    try { this._api.getPanel('viewport')?.group.api.setSize({ height: 300 }); } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._aiManager) return;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._aiBPEditor = new AIBlueprintEditorPanel(wrapper, dec, 'btDecorator', this._aiManager);
  }

  /** Open a BT Service blueprint editor panel */
  private _openBTServiceEditor(svc: BTServiceAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'ai-svc-editor-' + svc.id;
    this._api.addPanel({
      id: panelId,
      title: `Service: ${svc.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Activity, '#00838F');

    try { this._api.getPanel('viewport')?.group.api.setSize({ height: 300 }); } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._aiManager) return;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._aiBPEditor = new AIBlueprintEditorPanel(wrapper, svc, 'btService', this._aiManager);
  }

  /** Open an AI Controller blueprint editor panel */
  private _openAIControllerEditor(aic: AIControllerAsset): void {
    this._closeNodeEditor();
    this._closeActorEditor();
    this._closeTypeEditor();

    const panelId = 'ai-ctrl-editor-' + aic.id;
    this._api.addPanel({
      id: panelId,
      title: `AI Ctrl: ${aic.name}`,
      component: 'default',
      position: { direction: 'below', referencePanel: 'viewport' },
    });
    this._injectTabIcon(panelId, Icons.Bot, '#1565C0');

    try { this._api.getPanel('viewport')?.group.api.setSize({ height: 300 }); } catch (_e) {}

    const renderer = rendererMap.get(panelId);
    if (!renderer || !this._aiManager) return;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    renderer.element.appendChild(wrapper);

    this._aiBPEditor = new AIBlueprintEditorPanel(wrapper, aic, 'aiController', this._aiManager);
  }

  private _closeTypeEditor(): void {
    if (this._animBPEditor) {
      this._animBPEditor.dispose();
      this._animBPEditor = null;
    }
    if (this._widgetBPEditor) {
      this._widgetBPEditor.dispose();
      this._widgetBPEditor = null;
    }
    if (this._materialEditor) {
      this._materialEditor.dispose();
      this._materialEditor = null;
    }
    if (this._shaderGraphEditor) {
      // this._shaderGraphEditor.dispose(); 
      this._shaderGraphEditor = null;
    }
    if (this._soundCueEditor) {
      this._soundCueEditor.dispose();
      this._soundCueEditor = null;
    }
    if (this._bbEditor) {
      this._bbEditor.dispose();
      this._bbEditor = null;
    }
    if (this._btEditor) {
      this._btEditor.dispose();
      this._btEditor = null;
    }
    if (this._aiBPEditor) {
      this._aiBPEditor.dispose();
      this._aiBPEditor = null;
    }

    const panels = this._api.panels;
    for (const p of panels) {
      if (p.id.startsWith('struct-editor-') || p.id.startsWith('enum-editor-') || p.id.startsWith('anim-bp-editor-') || p.id.startsWith('widget-bp-editor-') || p.id.startsWith('material-editor-') || p.id.startsWith('sound-cue-editor-') || p.id.startsWith('savegame-editor-') || p.id.startsWith('ai-bt-editor-') || p.id.startsWith('ai-bb-editor-') || p.id.startsWith('ai-task-editor-') || p.id.startsWith('ai-dec-editor-') || p.id.startsWith('ai-svc-editor-') || p.id.startsWith('ai-ctrl-editor-')) {
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

  /** Wire up project manager with folder manager and project settings */
  setProjectManager(mgr: any): void {
    if (this._assetBrowser) {
      mgr.setFolderManager(this._assetBrowser.getFolderManager());
    }
    // Wire into Project Settings panel so it can read/write project-level settings
    if (this._projectSettings) {
      this._projectSettings.setProjectManager(mgr);
    }
  }

  /** Set or clear the play-mode camera (character pawn) */
  setPlayCamera(cam: THREE.PerspectiveCamera | null): void {
    if (this._viewport) this._viewport.setPlayCamera(cam);
  }

  /** Enable / disable 2D play mode (blocks editing, keeps 2D render active) */
  set2DPlayMode(playing: boolean): void {
    if (this._viewport) this._viewport.set2DPlayMode(playing);
  }

  /** Switch to the Class Hierarchy tab */
  private _showClassHierarchyPanel(): void {
    try {
      const panel = this._api.getPanel('class-hierarchy');
      if (panel) panel.api.setActive();
    } catch (_e) { /* ignore */ }
  }

  /** Public: show and highlight a class in the hierarchy panel */
  showClassHierarchy(id?: string): void {
    this._showClassHierarchyPanel();
    if (id) this._hierarchyPanel?.highlightClass(id);
  }

  /** Get the hierarchy panel (for project manager or external wiring) */
  getHierarchyPanel(): ClassHierarchyPanel | null {
    return this._hierarchyPanel;
  }

  /** Get the docking manager (for Window menu integration) */
  getDockingManager(): DockingManager {
    return this._dockingManager;
  }

  /** Get the dockview API (for advanced docking operations) */
  getDockviewApi(): DockviewApi {
    return this._api;
  }

  /* ==================================================================
   *  2D MODE — panel management & viewport switching
   * ================================================================== */

  /** Switch between 2D and 3D scene modes. Opens/closes 2D-specific panels. */
  switchSceneMode(mode: SceneMode): void {
    if (mode === this._current2DMode) return;
    this._current2DMode = mode;

    if (mode === '2D') {
      this._open2DPanels();
      // Switch viewport to 2D rendering
      if (this._viewport) {
        this._viewport.set2DMode(true, this.scene2DManager);
      }
      // Update viewport title
      try {
        const vp = this._api.getPanel('viewport');
        if (vp) vp.setTitle('2D Viewport');
      } catch (_e) {}
    } else {
      this._close2DPanels();
      // Switch viewport back to 3D rendering
      if (this._viewport) {
        this._viewport.set2DMode(false);
      }
      try {
        const vp = this._api.getPanel('viewport');
        if (vp) vp.setTitle('3D Viewport');
      } catch (_e) {}
    }

    // Refresh NavMeshPanel so it shows 2D/3D-specific controls
    if (this._navMeshPanel) {
      this._navMeshPanel.refresh();
    }
  }

  /** Open all 2D-specific panels as tabs in the Properties group */
  private _open2DPanels(): void {
    // Tile Editor (tab in content area)
    try {
      this._api.addPanel({
        id: 'tile-editor-2d',
        title: 'Tile Editor',
        component: 'default',
        position: { referencePanel: 'asset-browser' },
      });
      this._injectTabIcon('tile-editor-2d', Icons.Grid, ICON_COLORS.muted);
      this._initTileEditorPanel('tile-editor-2d');
    } catch (_e) {}

  }

  /** Close all 2D-specific panels */
  private _close2DPanels(): void {
    const ids2D = [
      'tile-editor-2d',
    ];
    for (const id of ids2D) {
      try {
        const panel = this._api.getPanel(id);
        if (panel) this._api.removePanel(panel);
      } catch (_e) {}
    }
    this._tileEditorPanel = null;
    // Disconnect tile editor from viewport
    if (this._viewport) this._viewport.setTileEditorPanel(null);
    // Dispose tilemap renderer
    if (this._tilemapRenderer) {
      this._tilemapRenderer.dispose();
      this._tilemapRenderer = null;
    }
  }
  private _initTileEditorPanel(panelId: string): void {
    const renderer = rendererMap.get(panelId);
    if (!renderer) return;
    const el = renderer.element;
    this._tileEditorPanel = new TileEditorPanel(el, this.scene2DManager);

    // ── Wire tilemap/tileset data from Scene2DManager ──
    const sm = this.scene2DManager;

    // Feed current data
    this._tileEditorPanel.setTilesets(Array.from(sm.tilesets.values()));
    this._tileEditorPanel.setTilemaps(Array.from(sm.tilemaps.values()));
    this._tileEditorPanel.setScene2DManager(sm);

    // Connect physics world if available
    if (sm.physics2D) {
      this._tileEditorPanel.setPhysics2DWorld(sm.physics2D);
    }

    // Create tilemap renderer (adds THREE.js meshes to scene)
    this._tilemapRenderer = new TilemapRenderer(sm.root2D);

    // Helper: push ALL tilemaps + tilesets to the renderer so every
    // tileset's tiles are visible simultaneously — not just the active one.
    const syncAllTilemaps = () => {
      if (!this._tilemapRenderer) return;

      // Build a merged tileset map that guarantees every tileset has its
      // .image if ANY source (SM, panel, or activeTileset) has one.
      // This prevents tiles from vanishing when the SM copy is out-of-sync
      // with the panel copy after rapid import / switch operations.
      const mergedTilesets = new Map<string, TilesetAsset>();

      // 1) Start with SM's tilesets as the base
      for (const [id, ts] of sm.tilesets) mergedTilesets.set(id, ts);

      // 2) Overlay panel-held tilesets — prefer whichever copy has .image
      if (this._tileEditorPanel) {
        for (const pts of this._tileEditorPanel.allTilesets) {
          const existing = mergedTilesets.get(pts.assetId);
          if (!existing) {
            mergedTilesets.set(pts.assetId, pts);
          } else if (!existing.image && pts.image) {
            mergedTilesets.set(pts.assetId, pts);
          }
        }
        // 3) Also check activeTileset (may not be in allTilesets yet during import)
        const active = this._tileEditorPanel.activeTileset;
        if (active?.image) {
          const existing = mergedTilesets.get(active.assetId);
          if (!existing || !existing.image) {
            mergedTilesets.set(active.assetId, active);
          }
        }
      }

      // Sync the merged (image-bearing) tilesets back to SM for persistence
      for (const [id, ts] of mergedTilesets) {
        if (ts.image) sm.tilesets.set(id, ts);
      }

      const allTilemaps = Array.from(sm.tilemaps.values());
      const allTilesets = Array.from(mergedTilesets.values());

      // Diagnostic: log what we're sending to the renderer
      const tsReport = allTilesets.map(t => `"${t.assetName}"(img=${!!t.image})`).join(', ');
      const tmReport = allTilemaps.map(t => {
        const totalTiles = t.layers.reduce((s, l) => s + Object.keys(l.tiles).length, 0);
        return `"${t.assetName}"(tsId=${t.tilesetId.slice(0, 8)}, layers=${t.layers.length}, tiles=${totalTiles})`;
      }).join(', ');
      console.log('[syncAllTilemaps]  tilesets=[%s]  tilemaps=[%s]', tsReport, tmReport);

      this._tilemapRenderer.setAllTilemaps(allTilemaps, allTilesets);
    };

    // Initial sync — render everything currently registered
    syncAllTilemaps();

    // When tilemap data changes (layer added, tiles modified, etc.)  → full sync
    // Always do a full rebuild so ALL tilemaps remain visible (not just
    // the active one).  syncAllTilemaps merges tilesets from SM + panel
    // + activeTileset so every tileset's .image is available.
    this._tileEditorPanel.onTilemapChanged((_tilemap) => {
      if (this._tilemapRenderer) {
        syncAllTilemaps();
      }
      // Notify Scene2DManager so the project is marked dirty (triggers save)
      sm.addTilemap(_tilemap);
    });

    // When a specific layer is painted → rebuild only that layer for perf
    this._tileEditorPanel.onLayerPainted((tilemapId, layerId) => {
      if (this._tilemapRenderer) {
        this._tilemapRenderer.rebuildLayer(layerId, tilemapId);
      }
      // Mark scene dirty so tile painting is saved
      const tm = sm.tilemaps.get(tilemapId);
      if (tm) sm.addTilemap(tm);
    });

    // When pixel-perfect mode is toggled → rebuild all layers with new PPU
    this._tileEditorPanel.onPixelPerfectChanged((_enabled, _tileset) => {
      // The PPU may have changed — need a full rebuild so tile geometry
      // uses the correct world-unit sizes.
      syncAllTilemaps();
    });

    // Listen for Scene2DManager changes (new tilemaps / tilesets added externally)
    sm.onChange(() => {
      if (this._tileEditorPanel) {
        this._tileEditorPanel.setTilesets(Array.from(sm.tilesets.values()));
        this._tileEditorPanel.setTilemaps(Array.from(sm.tilemaps.values()));
        if (sm.physics2D) this._tileEditorPanel.setPhysics2DWorld(sm.physics2D);

        // Rebuild all tilemaps when tileset images become available
        // (e.g. after fromJSON restores data URLs → images load asynchronously)
        syncAllTilemaps();
      }
    });

    // Connect tile editor to viewport for painting
    if (this._viewport) {
      this._viewport.setTileEditorPanel(this._tileEditorPanel);
      this._viewport.setTilemapRenderer(this._tilemapRenderer);
    }
  }

  /** Get the current scene mode */
  getSceneMode(): SceneMode { return this._current2DMode; }

  // ═══════════════════════════════════════════════════════════
  //  PROFILER — Open / Close / Hook lifecycle
  // ═══════════════════════════════════════════════════════════

  /** Open the profiler as a docked panel below the viewport */
  openProfiler(): void {
    // Close existing profiler if open
    this.closeProfiler();

    const panelId = 'profiler';
    this._api.addPanel({
      id: panelId,
      title: 'Profiler',
      component: 'default',
      position: {
        direction: 'below',
        referencePanel: 'viewport',
      },
    });
    this._injectTabIcon(panelId, Icons.Activity, '#e74c3c');

    // Give the profiler good vertical space
    try {
      const vpGroup = this._api.getPanel('viewport')?.group;
      if (vpGroup) vpGroup.api.setSize({ height: 300 });
    } catch (_e) { /* not critical */ }

    const renderer = rendererMap.get(panelId);
    if (renderer) {
      const wrapper = document.createElement('div');
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      renderer.element.appendChild(wrapper);

      this._profilerPanel = new ProfilerPanel(wrapper);

      // Install engine instrumentation hooks
      installProfilerHooks(this._engine);

      // Wire viewport overlay
      if (this._viewport) {
        const viewportEl = this._viewport.getCanvas()?.parentElement;
        if (viewportEl) {
          this._profilerOverlay = new ProfilerOverlay(viewportEl);
          const cam = this._viewport.getCamera();
          if (cam) this._profilerOverlay.setCamera(cam);
          this._profilerOverlay.setScene(this._engine.scene.threeScene);
          this._profilerOverlay.show();

          // Sync actor selection between profiler panel and viewport overlay
          this._profilerPanel.onActorSelect((actorId) => {
            if (this._profilerOverlay) {
              this._profilerOverlay.setSelectedActor(actorId);
            }
          });
          this._profilerOverlay.onActorClick((actorId) => {
            if (this._profilerPanel) {
              this._profilerPanel.selectActor(actorId);
            }
          });
        }
      }
    }
  }

  /** Close the profiler panel and clean up hooks */
  closeProfiler(): void {
    try {
      const panel = this._api.getPanel('profiler');
      if (panel) this._api.removePanel(panel);
    } catch (_e) { /* ignore */ }

    if (this._profilerOverlay) {
      this._profilerOverlay.destroy();
      this._profilerOverlay = null;
    }
    if (this._profilerPanel) {
      this._profilerPanel.destroy();
      this._profilerPanel = null;
    }
    uninstallProfilerHooks();
  }

  /** Notify the profiler that play mode started (does NOT auto-start recording) */
  notifyPlayStarted(sceneName: string): void {
    if (this._profilerPanel) {
      // Just save the scene name so the manual Record button uses it
      this._profilerPanel.setPlaySceneName(sceneName);
    }
    // Update overlay camera if the play camera changed
    if (this._profilerOverlay && this._viewport) {
      const cam = this._viewport.getCamera();
      if (cam) this._profilerOverlay.setCamera(cam);
    }
  }

  /** Notify the profiler that play mode stopped */
  notifyPlayStopped(): void {
    if (this._profilerPanel) {
      this._profilerPanel.onPlayStopped();
    }
  }

  /** Get the profiler panel (for external access) */
  getProfilerPanel(): ProfilerPanel | null {
    return this._profilerPanel;
  }
}
