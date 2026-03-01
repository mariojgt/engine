// ============================================================
//  SceneCompositionManager — Manages scene composition actors
//  (lights, sky, fog, post-processing, grid, player start)
//  Provides a complete scene environment system like UE5's
//  World Settings + World Outliner for environment actors.
// ============================================================

import * as THREE from 'three';
import {
  type SceneActorEntry,
  type SceneActorJSON,
  type SceneActorType,
  type BaseSceneActor,
  type PropertyDescriptor,
  type GizmoCapability,
  DirectionalLightActor,
  SkyAtmosphereActor,
  SkyLightActor,
  ExponentialHeightFogActor,
  PostProcessVolumeActor,
  WorldGridActor,
  DevGroundPlaneActor,
  PlayerStartActor,
  getSceneActorIcon,
} from './SceneActors';

// ---- Serialized composition data ----

export interface SceneCompositionJSON {
  worldSettings: {
    gravity: number;
    killZVolume: number;
  };
  actors: SceneActorJSON[];
}

// ---- Event types ----

type CompositionEventType = 'changed' | 'actorSelected' | 'actorPropertyChanged';
type CompositionListener = (...args: any[]) => void;

// ============================================================

export class SceneCompositionManager {
  private _threeScene: THREE.Scene;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _camera: THREE.Camera | null = null;

  /** All managed composition actors */
  private _actors = new Map<string, SceneActorEntry>();

  /** Callbacks */
  private _listeners = new Map<CompositionEventType, CompositionListener[]>();

  /** Selected composition actor id */
  private _selectedActorId: string | null = null;

  /** World settings (non-actor data) */
  public worldSettings = {
    gravity: -980,
    killZVolume: -500,
  };

  constructor(threeScene: THREE.Scene) {
    this._threeScene = threeScene;
  }

  // ---- Event system ----

  on(event: CompositionEventType, listener: CompositionListener): void {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(listener);
  }

  private _emit(event: CompositionEventType, ...args: any[]): void {
    const listeners = this._listeners.get(event);
    if (listeners) for (const cb of listeners) cb(...args);
  }

  // ---- Public API ----

  setRenderer(renderer: THREE.WebGLRenderer): void {
    this._renderer = renderer;
  }

  setCamera(camera: THREE.Camera): void {
    this._camera = camera;
  }

  get actors(): Map<string, SceneActorEntry> {
    return this._actors;
  }

  get selectedActorId(): string | null {
    return this._selectedActorId;
  }

  selectActor(id: string | null): void {
    this._selectedActorId = id;
    this._emit('actorSelected', id);
  }

  getActor(id: string): SceneActorEntry | undefined {
    return this._actors.get(id);
  }

  getActorByName(name: string): SceneActorEntry | undefined {
    for (const entry of this._actors.values()) {
      if (entry.name === name) return entry;
    }
    return undefined;
  }

  getSelectedActor(): SceneActorEntry | undefined {
    if (!this._selectedActorId) return undefined;
    return this._actors.get(this._selectedActorId);
  }

  // ---- Create default scene composition ----

  createDefaultComposition(): void {
    // Remove any existing scene lights/grid that Scene constructor added
    this._removeDefaultSceneObjects();

    // 1. Directional Light (Sun)
    this._addActor(new DirectionalLightActor('default-sun', 'DirectionalLight_Sun', {
      color: '#FFF8F0',
      intensity: 1.0,
      castShadows: true,
      shadowQuality: 2048,
      pitch: -50,
      yaw: 30,
    }), true);

    // 2. Sky Atmosphere
    const skyActor = new SkyAtmosphereActor('default-skyatmosphere', 'SkyAtmosphere', {
      turbidity: 0.3,
      rayleigh: 0.2,
      elevation: 45,
      azimuth: 180,
      generateEnvMap: true,
    });
    // Link sky to sun and renderer
    const sunEntry = this._actors.get('default-sun');
    if (sunEntry) {
      skyActor.setSunLight(sunEntry.actor as DirectionalLightActor);
    }
    if (this._renderer) {
      skyActor.setRenderer(this._renderer);
    }
    this._addActor(skyActor, true);

    // 3. Sky Light (Hemisphere)
    this._addActor(new SkyLightActor('default-skylight', 'SkyLight', {
      intensity: 0.4,
      skyColor: '#B4D4F0',
      groundColor: '#AB8860',
    }), true);

    // 4. Exponential Height Fog (disabled by default)
    this._addActor(new ExponentialHeightFogActor('default-fog', 'ExponentialHeightFog', {
      enabled: false,
      fogDensity: 0.015,
      fogColor: '#b9d5ff',
    }), false);

    // 5. Post Process Volume
    const ppActor = new PostProcessVolumeActor('default-postprocess', 'PostProcessVolume', {
      isUnbound: true,
      toneMappingType: 'ACES',
      exposure: 1.0,
      bloomEnabled: true,
      bloomIntensity: 0.15,
      bloomThreshold: 0.85,
      bloomRadius: 0.4,
    });
    if (this._renderer) {
      ppActor.setRenderer(this._renderer);
    }
    this._addActor(ppActor, false);

    // NOTE: Grid is handled by the ViewportGrid sub-system (viewport tool, not
    // a scene composition actor — same as UE5 where grid is in Viewport > Show,
    // not in the World Outliner).

    // 6. Dev Ground Plane (textured walkable floor)
    this._addActor(new DevGroundPlaneActor('default-devground', 'DevGroundPlane', {
      planeSize: 100,
      textureScale: 20,
      showGridOverlay: true,
    }), false);

    // 7. Player Start
    this._addActor(new PlayerStartActor('default-playerstart', 'PlayerStart', {
      positionX: 0,
      positionY: 0,
      positionZ: 0,
    }), false);

    // Set background to the sky color (will be overridden by SkyAtmosphere)
    this._threeScene.background = new THREE.Color(0x1a1a2e);

    this._emit('changed');
  }

  // ---- Remove defaults that Scene constructor adds ----

  private _removeDefaultSceneObjects(): void {
    const toRemove: THREE.Object3D[] = [];
    this._threeScene.children.forEach((child) => {
      // Remove old lights, grid helpers, and ground planes added by Scene constructor
      if (child instanceof THREE.AmbientLight ||
          child instanceof THREE.DirectionalLight ||
          child instanceof THREE.GridHelper ||
          child instanceof THREE.AxesHelper) {
        // Check it's not one of our composition actors
        if (!child.userData.__sceneActorId && !child.userData.__isViewportHelper && !child.userData.__isSceneCompositionHelper) {
          toRemove.push(child);
        }
      }
      // Remove shadow ground plane
      if ((child as any).isMesh && (child as THREE.Mesh).material instanceof THREE.ShadowMaterial) {
        if (!child.userData.__isSceneCompositionHelper) {
          toRemove.push(child);
        }
      }
    });
    toRemove.forEach((obj) => this._threeScene.remove(obj));
  }

  // ---- Actor management ----

  private _addActor(actor: BaseSceneActor, locked: boolean): void {
    const entry: SceneActorEntry = {
      id: actor.id,
      name: actor.name,
      type: actor.type,
      category: 'WorldSettings',
      visible: true,
      locked,
      actor,
    };

    this._actors.set(actor.id, entry);
    actor.addToScene(this._threeScene);
  }

  toggleActorVisibility(id: string): void {
    const entry = this._actors.get(id);
    if (!entry) return;

    entry.visible = !entry.visible;
    entry.actor.setVisible(entry.visible);
    this._emit('changed');
  }

  toggleActorLock(id: string): void {
    const entry = this._actors.get(id);
    if (!entry) return;

    entry.locked = !entry.locked;
    this._emit('changed');
  }

  updateActorProperty(actorId: string, key: string, value: any): void {
    const entry = this._actors.get(actorId);
    if (!entry) return;

    entry.actor.updateProperty(key, value);
    this._emit('actorPropertyChanged', actorId, key, value);
    this._emit('changed');
  }

  renameActor(id: string, newName: string): void {
    const entry = this._actors.get(id);
    if (!entry) return;
    entry.name = newName;
    entry.actor.name = newName;
    this._emit('changed');
  }

  /** Delete a scene composition actor (like UE5 outliner delete) */
  deleteActor(id: string): void {
    const entry = this._actors.get(id);
    if (!entry) return;

    // Clear selection FIRST so listeners can access actor data before removal
    if (this._selectedActorId === id) {
      this._selectedActorId = null;
      this._emit('actorSelected', null);
    }

    // Remove from scene
    entry.actor.removeFromScene(this._threeScene);
    entry.actor.dispose();
    this._actors.delete(id);

    this._emit('changed');
  }

  /** Add a new scene composition actor by type (like UE5 "Add Actor" menu) */
  addNewActor(type: SceneActorType, props: Record<string, any> = {}): string {
    const id = `${type.toLowerCase()}-${Date.now().toString(36)}`;
    const name = type;

    let actor: BaseSceneActor;
    switch (type) {
      case 'DirectionalLight':
        actor = new DirectionalLightActor(id, name, props);
        break;
      case 'SkyAtmosphere':
        actor = new SkyAtmosphereActor(id, name, props);
        if (this._renderer) (actor as SkyAtmosphereActor).setRenderer(this._renderer);
        // Link to sun if available
        for (const entry of this._actors.values()) {
          if (entry.type === 'DirectionalLight') {
            (actor as SkyAtmosphereActor).setSunLight(entry.actor as DirectionalLightActor);
            break;
          }
        }
        break;
      case 'SkyLight':
        actor = new SkyLightActor(id, name, props);
        break;
      case 'ExponentialHeightFog':
        actor = new ExponentialHeightFogActor(id, name, props);
        break;
      case 'PostProcessVolume':
        actor = new PostProcessVolumeActor(id, name, props);
        if (this._renderer) (actor as PostProcessVolumeActor).setRenderer(this._renderer);
        break;
      case 'DevGroundPlane':
        actor = new DevGroundPlaneActor(id, name, props);
        break;
      case 'PlayerStart':
        actor = new PlayerStartActor(id, name, props);
        break;
      default:
        console.warn(`[SceneComposition] Cannot create actor of type: ${type}`);
        return '';
    }

    this._addActor(actor, false);
    this._emit('changed');
    return id;
  }

  /** Get available actor types that can be added */
  getAddableActorTypes(): { type: SceneActorType; label: string; icon: string }[] {
    return [
      { type: 'DirectionalLight', label: 'Directional Light', icon: getSceneActorIcon('DirectionalLight') },
      { type: 'SkyAtmosphere', label: 'Sky Atmosphere', icon: getSceneActorIcon('SkyAtmosphere') },
      { type: 'SkyLight', label: 'Sky Light', icon: getSceneActorIcon('SkyLight') },
      { type: 'ExponentialHeightFog', label: 'Exponential Height Fog', icon: getSceneActorIcon('ExponentialHeightFog') },
      { type: 'PostProcessVolume', label: 'Post Process Volume', icon: getSceneActorIcon('PostProcessVolume') },
      { type: 'DevGroundPlane', label: 'Dev Ground Plane', icon: getSceneActorIcon('DevGroundPlane') },
      { type: 'PlayerStart', label: 'Player Start', icon: getSceneActorIcon('PlayerStart') },
    ];
  }

  /** Get the property descriptors for a given actor */
  getActorPropertyDescriptors(id: string): PropertyDescriptor[] {
    const entry = this._actors.get(id);
    if (!entry) return [];
    return entry.actor.getPropertyDescriptors();
  }

  /** Get categorized outliner data */
  getOutlinerData(): { category: string; actors: Array<{ id: string; name: string; type: SceneActorType; visible: boolean; locked: boolean; icon: string }> }[] {
    const worldActors: Array<{ id: string; name: string; type: SceneActorType; visible: boolean; locked: boolean; icon: string }> = [];

    this._actors.forEach((entry) => {
      worldActors.push({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        visible: entry.visible,
        locked: entry.locked,
        icon: getSceneActorIcon(entry.type),
      });
    });

    return [
      { category: 'World Settings', actors: worldActors },
    ];
  }

  // ---- Serialization ----

  serialize(): SceneCompositionJSON {
    const actors: SceneActorJSON[] = [];

    this._actors.forEach((entry) => {
      const json = entry.actor.serialize();
      json.locked = entry.locked;
      json.visible = entry.visible;
      actors.push(json);
    });

    return {
      worldSettings: { ...this.worldSettings },
      actors,
    };
  }

  deserialize(data: SceneCompositionJSON): void {
    // Clear existing
    this.clearAll();

    if (data.worldSettings) {
      this.worldSettings = { ...this.worldSettings, ...data.worldSettings };
    }

    // Recreate actors from JSON (but don't add to scene yet)
    for (const actorJSON of data.actors) {
      const actor = this._createActorFromJSON(actorJSON);
      if (!actor) continue;

      const entry: SceneActorEntry = {
        id: actorJSON.actorId,
        name: actorJSON.actorName,
        type: actorJSON.actorType,
        category: actorJSON.category,
        visible: actorJSON.visible,
        locked: actorJSON.locked,
        actor,
      };

      this._actors.set(actorJSON.actorId, entry);
    }

    // Link sky to sun and renderer BEFORE adding to scene
    // This ensures HDRI loading has the necessary dependencies
    const skyEntry = this._actors.get('default-skyatmosphere');
    const sunEntry = this._actors.get('default-sun');
    if (skyEntry && sunEntry) {
      (skyEntry.actor as SkyAtmosphereActor).setSunLight(sunEntry.actor as DirectionalLightActor);
    }
    if (skyEntry && this._renderer) {
      (skyEntry.actor as SkyAtmosphereActor).setRenderer(this._renderer);
    }

    // Setup post-process renderer
    const ppEntry = this._actors.get('default-postprocess');
    if (ppEntry && this._renderer) {
      (ppEntry.actor as PostProcessVolumeActor).setRenderer(this._renderer);
    }

    // NOW add all actors to scene (after setup)
    for (const actorJSON of data.actors) {
      const entry = this._actors.get(actorJSON.actorId);
      if (entry) {
        entry.actor.addToScene(this._threeScene);

        if (!actorJSON.visible) {
          entry.actor.setVisible(false);
        }
      }
    }

    // Finalize sky actor initialization after scene and renderer are ready
    if (skyEntry) {
      (skyEntry.actor as SkyAtmosphereActor).finishInitialization();
    }

    // Apply saved transforms
    for (const actorJSON of data.actors) {
      const entry = this._actors.get(actorJSON.actorId);
      if (entry && actorJSON.transform) {
        entry.actor.applyTransform(actorJSON.transform);
      }
    }

    this._emit('changed');
  }

  private _createActorFromJSON(json: SceneActorJSON): BaseSceneActor | null {
    switch (json.actorType) {
      case 'DirectionalLight':
        return new DirectionalLightActor(json.actorId, json.actorName, json.properties);
      case 'SkyAtmosphere':
        return new SkyAtmosphereActor(json.actorId, json.actorName, json.properties);
      case 'SkyLight':
        return new SkyLightActor(json.actorId, json.actorName, json.properties);
      case 'ExponentialHeightFog':
        return new ExponentialHeightFogActor(json.actorId, json.actorName, json.properties);
      case 'PostProcessVolume':
        return new PostProcessVolumeActor(json.actorId, json.actorName, json.properties);
      case 'WorldGrid':
        return new WorldGridActor(json.actorId, json.actorName, json.properties);
      case 'DevGroundPlane':
        return new DevGroundPlaneActor(json.actorId, json.actorName, json.properties);
      case 'PlayerStart':
        return new PlayerStartActor(json.actorId, json.actorName, json.properties);
      default:
        console.warn(`[SceneComposition] Unknown actor type: ${json.actorType}`);
        return null;
    }
  }

  /** Get the spawn transform from the default PlayerStart actor */
  getPlayerStartTransform(): { position: { x: number; y: number; z: number }; rotationY: number } | null {
    for (const entry of this._actors.values()) {
      if (entry.actor instanceof PlayerStartActor) {
        const t = entry.actor.getSpawnTransform();
        return {
          position: { x: t.position.x, y: t.position.y, z: t.position.z },
          rotationY: t.rotationY,
        };
      }
    }
    return null;
  }

  /** Get gizmo capabilities for a given actor */
  getActorGizmoCapabilities(id: string): GizmoCapability[] {
    const entry = this._actors.get(id);
    if (!entry) return [];
    return entry.actor.getGizmoCapabilities();
  }

  /** Get the DevGroundPlane collision settings for the physics system */
  getGroundPlaneSettings(): { hasCollision: boolean; halfExtent: number } {
    for (const entry of this._actors.values()) {
      if (entry.actor instanceof DevGroundPlaneActor) {
        return {
          hasCollision: entry.actor.properties.hasCollision !== false && entry.visible,
          halfExtent: (entry.actor.properties.planeSize ?? 100) / 2,
        };
      }
    }
    return { hasCollision: true, halfExtent: 100 };
  }

  /** Get the selectable group for a given actor (for gizmo attachment) */
  getActorGroup(id: string): THREE.Group | null {
    const entry = this._actors.get(id);
    return entry?.actor.group ?? null;
  }

  /** Notify actor that its transform was changed by a gizmo */
  notifyActorTransformChanged(id: string): void {
    const entry = this._actors.get(id);
    if (entry) entry.actor.onTransformChanged();
  }

  /** Get composition data needed for gameplay (PlayerStart, lights, etc.) */
  getCompositionDataForGameplay(): Record<string, any> {
    return {
      playerStart: this.getPlayerStartTransform(),
      composition: this.serialize(),
    };
  }

  /** Hide editor-only visuals during play mode */
  setPlayMode(playing: boolean): void {
    this._actors.forEach((entry) => {
      entry.actor.setEditorVisible(!playing);
    });
  }

  clearAll(): void {
    this._actors.forEach((entry) => {
      entry.actor.removeFromScene(this._threeScene);
      entry.actor.dispose();
    });
    this._actors.clear();
    this._selectedActorId = null;
  }

  dispose(): void {
    this.clearAll();
    this._listeners.clear();
  }
}
