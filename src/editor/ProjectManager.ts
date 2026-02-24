// ============================================================
//  ProjectManager — UE-style project persistence
//  Creates folder structures, saves/loads scenes & actors,
//  manages project.json metadata.
//
//  All file I/O goes through Rust commands (invoke) for
//  cross-platform reliability — no FS plugin scope issues.
// ============================================================

import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import type { Engine } from '../engine/Engine';
import type { ActorAssetManager, ActorAssetJSON } from './ActorAsset';
import type { StructureAssetManager, StructureAssetJSON, EnumAssetJSON } from './StructureAsset';
import type { MeshAssetManager, MeshAssetJSON, MaterialAssetJSON, TextureAssetJSON, AnimationAssetJSON } from './MeshAsset';
import type { AnimBlueprintManager, AnimBlueprintJSON } from './AnimBlueprintData';
import type { WidgetBlueprintManager, WidgetBlueprintJSON } from './WidgetBlueprintData';
import type { GameInstanceBlueprintManager, GameInstanceBlueprintJSON } from './GameInstanceData';
import type { SaveGameAssetManager, SaveGameAssetJSON } from './SaveGameAsset';
import type { EventAssetManager, EventAssetJSON } from './EventAsset';
import type { ContentFolderManager } from './ContentFolderManager';
import { ClassInheritanceSystem } from './ClassInheritanceSystem';
import type { SceneCompositionManager, SceneCompositionJSON } from './scene/SceneCompositionManager';
import { TextureLibrary } from './TextureLibrary';
import { FontLibrary } from './FontLibrary';
import { SoundLibrary } from './SoundLibrary';
import {
  serializeScene,
  deserializeScene,
  type SceneJSON,
  type CameraStateJSON,
} from './SceneSerializer';

// ---- Thin wrappers around Rust commands ----

async function fsWrite(path: string, contents: string): Promise<void> {
  await invoke('write_file', { path, contents });
}

async function fsWriteBinary(path: string, contents: Uint8Array): Promise<void> {
  await invoke('write_binary_file', { path, contents: Array.from(contents) });
}

async function fsRead(path: string): Promise<string> {
  return await invoke<string>('read_file', { path });
}

async function fsReadBinary(path: string): Promise<Uint8Array> {
  const data = await invoke<number[]>('read_binary_file', { path });
  return new Uint8Array(data);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64.split(',')[1]);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function fsExists(path: string): Promise<boolean> {
  return await invoke<boolean>('file_exists', { path });
}

async function fsListDir(path: string, extension: string = '.json'): Promise<string[]> {
  return await invoke<string[]>('list_dir_files', { path, extension });
}

async function fsCreateProjectDirs(basePath: string, name: string): Promise<string> {
  return await invoke<string>('create_project_structure', { basePath, name });
}

// ---- Project metadata stored in project.json ----

export interface ProjectMeta {
  name: string;
  version: string;
  engineVersion: string;
  createdAt: number;
  modifiedAt: number;
  /** Active scene file (relative path within Scenes/) */
  activeScene: string;
  /** Game Instance class ID — which Game Instance blueprint to auto-create at runtime (like UE Project Settings → Game Instance Class) */
  gameInstanceClassId?: string;
}

// ---- Project folder structure ----
//  <projectRoot>/
//    project.json          — metadata
//    Scenes/
//      DefaultScene.json   — scene data
//    Actors/
//      *.json              — actor assets
//    Config/
//      editor.json         — editor state (camera, layout, etc.)

const ENGINE_VERSION = '0.1.0';
const PROJECT_FILE = 'project.json';
const SCENES_DIR = 'Scenes';
const ACTORS_DIR = 'Actors';
const STRUCTURES_DIR = 'Structures';
const ENUMS_DIR = 'Enums';
const MESHES_DIR = 'Meshes';
const ANIM_BLUEPRINTS_DIR = 'AnimBlueprints';
const WIDGET_BLUEPRINTS_DIR = 'Widgets';
const GAME_INSTANCES_DIR = 'GameInstances';
const SAVE_GAME_CLASSES_DIR = 'SaveGameClasses';
const EVENTS_DIR = 'Events';
const TEXTURES_DIR = 'Textures';
const FONTS_DIR = 'Fonts';
const SOUNDS_DIR = 'Sounds';
const SOUND_CUES_DIR = 'SoundCues';
const CONFIG_DIR = 'Config';
const EDITOR_STATE_FILE = 'Config/editor.json';
const FOLDER_STRUCTURE_FILE = 'Config/folders.json';
const DEFAULT_SCENE = 'DefaultScene';

export class ProjectManager {
  private _projectPath: string | null = null;
  private _meta: ProjectMeta | null = null;
  private _engine: Engine;
  private _assetManager: ActorAssetManager;
  private _structManager: StructureAssetManager | null = null;
  private _meshManager: MeshAssetManager | null = null;
  private _animBPManager: AnimBlueprintManager | null = null;
  private _widgetBPManager: WidgetBlueprintManager | null = null;
  private _gameInstanceManager: GameInstanceBlueprintManager | null = null;
  private _saveGameManager: SaveGameAssetManager | null = null;
  private _eventManager: EventAssetManager | null = null;
  private _folderManager: ContentFolderManager | null = null;
  private _compositionManager: SceneCompositionManager | null = null;
  private _dirty = false;
  private _autoSaveTimer: number | null = null;

  /** Scene that was active when the user pressed Play — used to restore on Stop */
  private _prePlaySceneName: string | null = null;
  /** Whether a runtime scene load happened during the current play session */
  private _runtimeSceneChanged = false;

  /** Callback to obtain camera state from the viewport */
  public getCameraState: (() => CameraStateJSON | undefined) | null = null;
  /** Callback to apply camera state to the viewport */
  public applyCameraState: ((state: CameraStateJSON) => void) | null = null;
  /** Callback fired when the active scene changes (name) */
  public onSceneChanged: ((sceneName: string) => void) | null = null;
  /** Callback fired when a scene's mode is known after loading */
  public onSceneModeDetected: ((mode: '2D' | '3D') => void | Promise<void>) | null = null;
  /** Callback to obtain the current scene mode from the editor */
  public getSceneMode: (() => '2D' | '3D') | null = null;
  /** Callback to obtain serialized 2D scene data (tilemaps, tilesets, config) */
  public getScene2DData: (() => any) | null = null;
  /** Callback to restore 2D scene data after deserialization */
  public setScene2DData: ((data: any) => void) | null = null;
  /** Callback to get the live Scene2DManager instance */
  public getScene2DManager: (() => any) | null = null;

  get isProjectOpen(): boolean {
    return this._projectPath !== null;
  }

  get projectName(): string {
    return this._meta?.name ?? 'Untitled';
  }

  get projectPath(): string | null {
    return this._projectPath;
  }

  constructor(engine: Engine, assetManager: ActorAssetManager) {
    this._engine = engine;
    this._assetManager = assetManager;
  }

  /** Wire up the StructureAssetManager for saving/loading structures and enums */
  setStructureManager(mgr: StructureAssetManager): void {
    this._structManager = mgr;
  }

  /** Wire up the MeshAssetManager for saving/loading imported mesh assets */
  setMeshManager(mgr: MeshAssetManager): void {
    this._meshManager = mgr;
  }

  /** Wire up the AnimBlueprintManager for saving/loading animation blueprints */
  setAnimBPManager(mgr: AnimBlueprintManager): void {
    this._animBPManager = mgr;
  }

  /** Wire up the WidgetBlueprintManager for saving/loading widget blueprints */
  setWidgetBPManager(mgr: WidgetBlueprintManager): void {
    this._widgetBPManager = mgr;
  }

  /** Wire up the GameInstanceBlueprintManager for saving/loading game instances */
  setGameInstanceManager(mgr: GameInstanceBlueprintManager): void {
    this._gameInstanceManager = mgr;
  }

  /** Wire up the SaveGameAssetManager for saving/loading save game class definitions */
  setSaveGameManager(mgr: SaveGameAssetManager): void {
    this._saveGameManager = mgr;
  }

  /** Wire up the EventAssetManager for saving/loading event definitions */
  setEventManager(mgr: EventAssetManager): void {
    this._eventManager = mgr;
  }

  /** Get the configured Game Instance class ID (from Project Settings) */
  get gameInstanceClassId(): string | undefined {
    return this._meta?.gameInstanceClassId;
  }

  /** Set the Game Instance class ID (Project Settings → Game Instance Class) and sync to engine */
  setGameInstanceClassId(id: string | undefined): void {
    if (!this._meta) return;
    this._meta.gameInstanceClassId = id;
    this._engine.gameInstanceClassId = id ?? null;
    this._dirty = true;
  }

  /** Wire up the ContentFolderManager for saving/loading folder structure */
  setFolderManager(mgr: ContentFolderManager): void {
    this._folderManager = mgr;
  }

  /** Wire up the SceneCompositionManager for saving/loading environment actors */
  setCompositionManager(mgr: SceneCompositionManager): void {
    this._compositionManager = mgr;
  }

  // ============================================================
  //  Create New Project
  // ============================================================

  async createProject(name: string): Promise<boolean> {
    // Open native folder picker
    const rawFolder = await open({
      directory: true,
      multiple: false,
      title: 'Select Project Folder',
    });

    if (!rawFolder) return false;

    const basePath = typeof rawFolder === 'string' ? rawFolder : String(rawFolder);

    try {
      // Rust creates all directories and returns canonical path
      const projectRoot = await fsCreateProjectDirs(basePath, name);

      // Create project.json
      const meta: ProjectMeta = {
        name,
        version: '1.0.0',
        engineVersion: ENGINE_VERSION,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        activeScene: DEFAULT_SCENE,
      };

      await fsWrite(
        `${projectRoot}/${PROJECT_FILE}`,
        JSON.stringify(meta, null, 2),
      );

      // Create default scene with a starter cube
      const defaultScene: SceneJSON = {
        name: DEFAULT_SCENE,
        gameObjects: [
          {
            name: 'Cube',
            meshType: 'cube',
            position: { x: 0, y: 3, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            hasPhysics: false,
            actorAssetId: null,
          },
        ],
      };
      await fsWrite(
        `${projectRoot}/${SCENES_DIR}/${DEFAULT_SCENE}.json`,
        JSON.stringify(defaultScene, null, 2),
      );

      // Create empty editor state
      await fsWrite(
        `${projectRoot}/${EDITOR_STATE_FILE}`,
        JSON.stringify({ camera: null }, null, 2),
      );

      // Set as active project
      this._projectPath = projectRoot;
      this._meta = meta;
      this._dirty = false;

      // Clear existing scene and load the fresh project
      this._clearScene();
      await this._loadScene(DEFAULT_SCENE);

      // Save the initial composition so lights/sky are persisted from the start
      await this._saveComposition();

      this._startAutoSave();
      console.log(`[ProjectManager] Created project: ${name} at ${projectRoot}`);
      return true;
    } catch (err) {
      console.error('[ProjectManager] Failed to create project:', err);
      return false;
    }
  }

  // ============================================================
  //  Open Existing Project
  // ============================================================

  async openProject(): Promise<boolean> {
    const rawFolder = await open({
      directory: true,
      multiple: false,
      title: 'Open Project Folder',
    });

    if (!rawFolder) return false;

    const folder = typeof rawFolder === 'string' ? rawFolder : String(rawFolder);
    return this.openProjectFromPath(folder);
  }

  async openProjectFromPath(projectRoot: string): Promise<boolean> {
    try {
      // Verify project.json exists
      const projFilePath = `${projectRoot}/${PROJECT_FILE}`;
      const hasProjectFile = await fsExists(projFilePath);
      if (!hasProjectFile) {
        // Also try with backslashes (Windows native path)
        const altPath = `${projectRoot}\\${PROJECT_FILE}`;
        const hasAlt = await fsExists(altPath);
        if (!hasAlt) {
          console.error('Not a valid project folder: missing project.json');
          return false;
        }
      }

      // Read project metadata
      const metaRaw = await fsRead(projFilePath);
      const meta: ProjectMeta = JSON.parse(metaRaw);

      this._projectPath = projectRoot;
      this._meta = meta;

      // Sync Game Instance class ID to engine
      this._engine.gameInstanceClassId = meta.gameInstanceClassId ?? null;

      console.log(`[ProjectManager] ▶ Opening project "${meta.name}" at ${projectRoot}`);
      console.log(`[ProjectManager]   Active scene: ${meta.activeScene}`);
      console.log(`[ProjectManager]   Composition manager wired: ${!!this._compositionManager}`);

      // Load structures and enums first (actors may reference them)
      await this._loadStructures();
      await this._loadEnums();

      // Load mesh assets
      await this._loadMeshes();

      // Load animation blueprints
      await this._loadAnimBlueprints();

      // Load widget blueprints
      await this._loadWidgetBlueprints();

      // Load game instances
      await this._loadGameInstances();

      // Load save game class definitions
      await this._loadSaveGameClasses();

      // Load event definitions
      await this._loadEvents();

      // Load texture library
      await this._loadTextures();

      // Load font library
      await this._loadFonts();

      // Load sound library (imported audio + sound cues)
      await this._loadSounds();

      // Load actors first (scenes reference them)
      await this._loadActors();

      // Register all actors & widgets in the inheritance system
      // and load saved inheritance relationships
      await this._loadInheritanceData();

      // Load composition (environment actors)
      await this._loadComposition();

      // Load active scene
      await this._loadScene(meta.activeScene);

      // Load editor state (camera, etc.)
      await this._loadEditorState();

      // Load folder structure
      await this._loadFolderStructure();

      this._dirty = false;
      this._startAutoSave();
      console.log(`[ProjectManager] Project opened successfully: ${meta.name}`);
      return true;
    } catch (err) {
      console.error('[ProjectManager] Failed to open project:', err);
      return false;
    }
  }

  // ============================================================
  //  Save Project
  // ============================================================

  async saveProject(): Promise<void> {
    if (!this._projectPath || !this._meta) {
      console.warn('[ProjectManager] saveProject skipped — no project open', { path: this._projectPath, meta: !!this._meta });
      return;
    }

    try {
      console.log(`[ProjectManager] ▶ Saving project "${this._meta.name}" at ${this._projectPath}`);
      console.log(`[ProjectManager]   Active scene: ${this._meta.activeScene}`);
      console.log(`[ProjectManager]   Scene game objects: ${this._engine.scene.gameObjects.length}`);
      console.log(`[ProjectManager]   Composition manager wired: ${!!this._compositionManager}`);

      // Update modified timestamp
      this._meta.modifiedAt = Date.now();

      // Save project.json
      await fsWrite(
        `${this._projectPath}/${PROJECT_FILE}`,
        JSON.stringify(this._meta, null, 2),
      );
      console.log('[ProjectManager]   ✓ project.json');

      // Save actors
      await this._saveActors();
      console.log(`[ProjectManager]   ✓ actors (${this._assetManager.assets.length})`);

      // Save structures and enums
      await this._saveStructures();
      await this._saveEnums();
      console.log('[ProjectManager]   ✓ structures & enums');

      // Save mesh assets
      await this._saveMeshes();
      console.log('[ProjectManager]   ✓ meshes');

      // Save animation blueprints
      await this._saveAnimBlueprints();
      console.log('[ProjectManager]   ✓ anim blueprints');

      // Save widget blueprints
      await this._saveWidgetBlueprints();
      console.log('[ProjectManager]   ✓ widget blueprints');

      // Save game instances
      await this._saveGameInstances();
      console.log('[ProjectManager]   ✓ game instances');

      // Save save game class definitions
      await this._saveSaveGameClasses();
      console.log('[ProjectManager]   ✓ save game classes');

      // Save event definitions
      await this._saveEvents();
      console.log('[ProjectManager]   ✓ events');

      // Save texture library
      await this._saveTextures();
      console.log('[ProjectManager]   ✓ textures');

      // Save font library
      await this._saveFonts();
      console.log('[ProjectManager]   ✓ fonts');

      // Save sound library (imported audio + sound cues)
      await this._saveSounds();
      console.log('[ProjectManager]   ✓ sounds & sound cues');

      // Save folder structure
      await this._saveFolderStructure();
      console.log('[ProjectManager]   ✓ folder structure');

      // Save composition (environment actors)
      await this._saveComposition();

      // Save active scene
      await this._saveScene(this._meta.activeScene);

      // Save inheritance data
      await this._saveInheritanceData();
      console.log('[ProjectManager]   ✓ inheritance data');

      // Save editor state
      await this._saveEditorState();
      console.log('[ProjectManager]   ✓ editor state');

      this._dirty = false;
      console.log(`[ProjectManager] Project saved successfully: ${this._meta.name}`);
    } catch (err) {
      console.error('[ProjectManager] Failed to save project:', err);
    }
  }

  // ============================================================
  //  Save/Load Scene
  // ============================================================

  private async _saveScene(sceneName: string): Promise<void> {
    if (!this._projectPath) {
      console.warn('[ProjectManager] _saveScene skipped — no project path');
      return;
    }

    const camera = this.getCameraState?.();
    const sceneData = serializeScene(
      this._engine.scene,
      sceneName,
      camera,
    );

    // Persist 2D/3D scene mode so it survives save/load
    const currentMode = this.getSceneMode?.() ?? '3D';
    sceneData.sceneMode = currentMode;

    // Persist 2D scene data (tilemaps, tilesets, sprite sheets, config)
    if (currentMode === '2D') {
      const scene2DData = this.getScene2DData?.();
      if (scene2DData) {
        // Extract images and save them as separate files
        const texDir = `${this._projectPath}/${TEXTURES_DIR}`;
        
        if (scene2DData.spriteSheets) {
          for (const sheet of scene2DData.spriteSheets) {
            if (sheet.imageDataUrl && sheet.imageDataUrl.startsWith('data:image')) {
              const safeName = sheet.assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
              const fileName = `${safeName}_${sheet.assetId}.png`;
              const filePath = `${texDir}/${fileName}`;
              try {
                await fsWriteBinary(filePath, base64ToUint8Array(sheet.imageDataUrl));
                sheet.imagePath = `${TEXTURES_DIR}/${fileName}`;
                sheet.imageDataUrl = undefined; // Remove base64 from JSON
                
                // Update live Scene2DManager to free memory and prevent re-saving
                const liveSheet = this.getScene2DManager?.()?.spriteSheets.get(sheet.assetId);
                if (liveSheet) {
                  liveSheet.imagePath = sheet.imagePath;
                  liveSheet.imageDataUrl = undefined;
                }
              } catch (e) {
                console.error(`Failed to save sprite sheet image ${fileName}:`, e);
              }
            }
          }
        }

        if (scene2DData.tilesets) {
          for (const ts of scene2DData.tilesets) {
            if (ts.imageDataUrl && ts.imageDataUrl.startsWith('data:image')) {
              const safeName = ts.assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
              const fileName = `${safeName}_${ts.assetId}.png`;
              const filePath = `${texDir}/${fileName}`;
              try {
                await fsWriteBinary(filePath, base64ToUint8Array(ts.imageDataUrl));
                ts.imagePath = `${TEXTURES_DIR}/${fileName}`;
                ts.imageDataUrl = undefined; // Remove base64 from JSON
                
                // Update live Scene2DManager to free memory and prevent re-saving
                const liveTs = this.getScene2DManager?.()?.tilesets.get(ts.assetId);
                if (liveTs) {
                  liveTs.imagePath = ts.imagePath;
                  liveTs.imageDataUrl = undefined;
                }
              } catch (e) {
                console.error(`Failed to save tileset image ${fileName}:`, e);
              }
            }
          }
        }

        sceneData.scene2DConfig = scene2DData;
      }
    }

    const scenePath = `${this._projectPath}/${SCENES_DIR}/${sceneName}.json`;
    const json = JSON.stringify(sceneData, null, 2);
    console.log(`[ProjectManager]   ✓ scene "${sceneName}" (${sceneData.gameObjects.length} objects, ${json.length} bytes, camera: ${!!camera}, mode: ${currentMode}, has2DConfig: ${!!sceneData.scene2DConfig}, tilesets: ${sceneData.scene2DConfig?.tilesets?.length ?? 0}, tilemaps: ${sceneData.scene2DConfig?.tilemaps?.length ?? 0})`);

    await fsWrite(scenePath, json);
  }

  private async _loadScene(sceneName: string): Promise<void> {
    if (!this._projectPath) {
      console.warn('[ProjectManager] _loadScene skipped — no project path');
      return;
    }

    const filePath = `${this._projectPath}/${SCENES_DIR}/${sceneName}.json`;
    const fileFound = await fsExists(filePath);
    if (!fileFound) {
      console.warn(`[ProjectManager] Scene file not found: ${filePath}`);
      return;
    }

    const raw = await fsRead(filePath);
    const sceneData: SceneJSON = JSON.parse(raw);
    console.log(`[ProjectManager] Loading scene "${sceneName}": ${sceneData.gameObjects.length} objects`);

    for (const go of sceneData.gameObjects) {
      console.log(`[ProjectManager]   → Object "${go.name}" type=${go.meshType} actorAssetId=${go.actorAssetId ?? 'none'} meshAssetId=${go.customMeshAssetId ?? 'none'}`);
    }

    deserializeScene(this._engine.scene, sceneData, this._assetManager, this._meshManager ?? undefined);
    console.log(`[ProjectManager] Scene deserialized — engine now has ${this._engine.scene.gameObjects.length} game objects`);

    // Restore 2D scene data (tilemaps, tilesets, sprite sheets, config) before mode switch
    const mode = sceneData.sceneMode ?? '3D';
    console.log(`[ProjectManager]   Scene mode: ${mode}, has scene2DConfig: ${!!sceneData.scene2DConfig}, has setScene2DData: ${!!this.setScene2DData}`);
    if (sceneData.scene2DConfig) {
      console.log(`[ProjectManager]   scene2DConfig: tilesets=${sceneData.scene2DConfig.tilesets?.length ?? 0}, tilemaps=${sceneData.scene2DConfig.tilemaps?.length ?? 0}, spriteSheets=${sceneData.scene2DConfig.spriteSheets?.length ?? 0}`);
      
      // Load images from separate files
      if (sceneData.scene2DConfig.spriteSheets) {
        for (const sheet of sceneData.scene2DConfig.spriteSheets) {
          if (sheet.imagePath) {
            try {
              const filePath = `${this._projectPath}/${sheet.imagePath}`;
              const data = await fsReadBinary(filePath);
              const blob = new Blob([data as any], { type: 'image/png' });
              sheet.imageDataUrl = URL.createObjectURL(blob);
            } catch (e) {
              console.error(`Failed to load sprite sheet image ${sheet.imagePath}:`, e);
            }
          }
        }
      }

      if (sceneData.scene2DConfig.tilesets) {
        for (const ts of sceneData.scene2DConfig.tilesets) {
          if (ts.imagePath) {
            try {
              const filePath = `${this._projectPath}/${ts.imagePath}`;
              const data = await fsReadBinary(filePath);
              const blob = new Blob([data as any], { type: 'image/png' });
              ts.imageDataUrl = URL.createObjectURL(blob);
            } catch (e) {
              console.error(`Failed to load tileset image ${ts.imagePath}:`, e);
            }
          }
        }
      }
    }
    if (mode === '2D' && sceneData.scene2DConfig && this.setScene2DData) {
      this.setScene2DData(sceneData.scene2DConfig);
      console.log('[ProjectManager]   2D scene data restored');
    }

    // Notify scene mode (2D or 3D) — MUST be awaited so panels are created
    // before the load function completes
    await this.onSceneModeDetected?.(mode);

    // Apply camera state if available
    if (sceneData.camera && this.applyCameraState) {
      this.applyCameraState(sceneData.camera);
      console.log('[ProjectManager]   Camera state restored');
    }
  }

  // ============================================================
  //  Save/Load Composition (Environment Actors)
  // ============================================================

  private async _saveComposition(): Promise<void> {
    if (!this._projectPath) {
      console.warn('[ProjectManager] _saveComposition skipped — no project path');
      return;
    }
    if (!this._compositionManager) {
      console.warn('[ProjectManager] _saveComposition skipped — compositionManager not wired! Lights/sky/fog will NOT be saved.');
      return;
    }

    const data = this._compositionManager.serialize();
    const json = JSON.stringify(data, null, 2);
    console.log(`[ProjectManager]   ✓ composition (${data.actors.length} actors, ${json.length} bytes)`);
    for (const a of data.actors) {
      console.log(`[ProjectManager]       actor: "${a.actorName}" type=${a.actorType} visible=${a.visible}`);
    }
    await fsWrite(
      `${this._projectPath}/${CONFIG_DIR}/composition.json`,
      json,
    );
  }

  private async _loadComposition(): Promise<void> {
    if (!this._projectPath) {
      console.warn('[ProjectManager] _loadComposition skipped — no project path');
      return;
    }
    if (!this._compositionManager) {
      console.warn('[ProjectManager] _loadComposition skipped — compositionManager not wired! Lights/sky/fog will NOT load.');
      return;
    }

    const filePath = `${this._projectPath}/${CONFIG_DIR}/composition.json`;
    const exists = await fsExists(filePath);
    if (!exists) {
      console.log('[ProjectManager] No composition.json found — using defaults');
      return;
    }

    try {
      const raw = await fsRead(filePath);
      const data: SceneCompositionJSON = JSON.parse(raw);
      console.log(`[ProjectManager] Loading composition: ${data.actors.length} actors`);
      for (const a of data.actors) {
        console.log(`[ProjectManager]   → actor "${a.actorName}" type=${a.actorType} visible=${a.visible}`);
      }
      this._compositionManager.deserialize(data);
      console.log('[ProjectManager] Composition deserialized successfully');
    } catch (err) {
      console.warn('[ProjectManager] Failed to load composition:', err);
    }
  }

  // ============================================================
  //  Save/Load Actors
  // ============================================================

  private async _saveActors(): Promise<void> {
    if (!this._projectPath) return;

    const actorsDir = `${this._projectPath}/${ACTORS_DIR}`;

    // Export each actor as an individual file
    const actors = this._assetManager.exportAll();
    for (const actorJSON of actors) {
      const safeName = actorJSON.actorName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${actorsDir}/${safeName}_${actorJSON.actorId}.json`,
        JSON.stringify(actorJSON, null, 2),
      );
    }

    // Write an index file for fast loading
    const index = actors.map(a => ({
      id: a.actorId,
      name: a.actorName,
      file: `${a.actorName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${a.actorId}.json`,
    }));
    await fsWrite(
      `${actorsDir}/_index.json`,
      JSON.stringify(index, null, 2),
    );
  }

  private async _loadActors(): Promise<void> {
    if (!this._projectPath) return;

    const actorsDir = `${this._projectPath}/${ACTORS_DIR}`;
    const dirFound = await fsExists(actorsDir);
    if (!dirFound) return;

    const allActors: ActorAssetJSON[] = [];

    // Try loading from index first
    const indexPath = `${actorsDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);

      for (const entry of index) {
        try {
          const raw = await fsRead(`${actorsDir}/${entry.file}`);
          allActors.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load actor ${entry.name}:`, e);
        }
      }
    } else {
      // Fallback: scan directory for .json files
      const fileNames = await fsListDir(actorsDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${actorsDir}/${name}`);
          allActors.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load actor file ${name}:`, e);
        }
      }
    }

    if (allActors.length > 0) {
      this._assetManager.importAll(allActors);
    }
  }

  // ============================================================
  //  Save/Load Structures
  // ============================================================

  private async _saveStructures(): Promise<void> {
    if (!this._projectPath || !this._structManager) return;

    const structDir = `${this._projectPath}/${STRUCTURES_DIR}`;
    const structs = this._structManager.exportStructures();

    for (const json of structs) {
      const safeName = json.structureName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${structDir}/${safeName}_${json.structureId}.json`,
        JSON.stringify(json, null, 2),
      );
    }

    // Index file
    const index = structs.map(s => ({
      id: s.structureId,
      name: s.structureName,
      file: `${s.structureName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${s.structureId}.json`,
    }));
    await fsWrite(`${structDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadStructures(): Promise<void> {
    if (!this._projectPath || !this._structManager) return;

    const structDir = `${this._projectPath}/${STRUCTURES_DIR}`;
    const dirFound = await fsExists(structDir);
    if (!dirFound) return;

    const allStructs: StructureAssetJSON[] = [];
    const indexPath = `${structDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${structDir}/${entry.file}`);
          allStructs.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load structure ${entry.name}:`, e);
        }
      }
    } else {
      const fileNames = await fsListDir(structDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${structDir}/${name}`);
          allStructs.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load structure file ${name}:`, e);
        }
      }
    }

    if (allStructs.length > 0) {
      this._structManager.importStructures(allStructs);
    }
  }

  // ============================================================
  //  Save/Load Enums
  // ============================================================

  private async _saveEnums(): Promise<void> {
    if (!this._projectPath || !this._structManager) return;

    const enumDir = `${this._projectPath}/${ENUMS_DIR}`;
    const enums = this._structManager.exportEnums();

    for (const json of enums) {
      const safeName = json.enumName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${enumDir}/${safeName}_${json.enumId}.json`,
        JSON.stringify(json, null, 2),
      );
    }

    // Index file
    const index = enums.map(e => ({
      id: e.enumId,
      name: e.enumName,
      file: `${e.enumName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${e.enumId}.json`,
    }));
    await fsWrite(`${enumDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadEnums(): Promise<void> {
    if (!this._projectPath || !this._structManager) return;

    const enumDir = `${this._projectPath}/${ENUMS_DIR}`;
    const dirFound = await fsExists(enumDir);
    if (!dirFound) return;

    const allEnums: EnumAssetJSON[] = [];
    const indexPath = `${enumDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${enumDir}/${entry.file}`);
          allEnums.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load enum ${entry.name}:`, e);
        }
      }
    } else {
      const fileNames = await fsListDir(enumDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${enumDir}/${name}`);
          allEnums.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load enum file ${name}:`, e);
        }
      }
    }

    if (allEnums.length > 0) {
      this._structManager.importEnums(allEnums);
    }
  }

  // ============================================================
  //  Save/Load Mesh Assets
  // ============================================================

  private async _saveMeshes(): Promise<void> {
    if (!this._projectPath || !this._meshManager) return;

    const meshDir = `${this._projectPath}/${MESHES_DIR}`;
    const exported = this._meshManager.exportAll();

    // Save each mesh asset bundle (mesh + its sub-assets together)
    for (const meshJson of exported.meshAssets) {
      const safeName = meshJson.assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const bundle = {
        meshAsset: meshJson,
        materials: exported.materials.filter(m => meshJson.materials.includes(m.assetId)),
        textures: exported.textures.filter(t => meshJson.textures.includes(t.assetId)),
        animations: exported.animations.filter(a => meshJson.animations.includes(a.assetId)),
      };
      await fsWrite(
        `${meshDir}/${safeName}_${meshJson.assetId}.json`,
        JSON.stringify(bundle, null, 2),
      );
    }

    // Index file
    const index = exported.meshAssets.map(m => ({
      id: m.assetId,
      name: m.assetName,
      file: `${m.assetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${m.assetId}.json`,
    }));
    await fsWrite(`${meshDir}/_index.json`, JSON.stringify(index, null, 2));

    // Save standalone materials & textures not belonging to any mesh asset
    const meshMatIds = new Set(exported.meshAssets.flatMap(m => m.materials));
    const meshTexIds = new Set(exported.meshAssets.flatMap(m => m.textures));
    const standaloneMats = exported.materials.filter(m => !meshMatIds.has(m.assetId));
    const standaloneTex = exported.textures.filter(t => !meshTexIds.has(t.assetId));
    if (standaloneMats.length > 0 || standaloneTex.length > 0) {
      await fsWrite(
        `${meshDir}/_standalone_materials.json`,
        JSON.stringify({ materials: standaloneMats, textures: standaloneTex }, null, 2),
      );
    } else {
      // Clean up old file if no standalone materials remain
      try { await fsWrite(`${meshDir}/_standalone_materials.json`, '{}'); } catch (_e) {}
    }
  }

  private async _loadMeshes(): Promise<void> {
    if (!this._projectPath || !this._meshManager) return;

    const meshDir = `${this._projectPath}/${MESHES_DIR}`;
    const dirFound = await fsExists(meshDir);
    if (!dirFound) return;

    const allMeshAssets: MeshAssetJSON[] = [];
    const allMaterials: MaterialAssetJSON[] = [];
    const allTextures: TextureAssetJSON[] = [];
    const allAnimations: AnimationAssetJSON[] = [];

    const indexPath = `${meshDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    const fileNames: string[] = [];

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        fileNames.push(entry.file);
      }
    } else {
      const names = await fsListDir(meshDir, '.json');
      for (const name of names) {
        if (name === '_index.json') continue;
        fileNames.push(name);
      }
    }

    for (const file of fileNames) {
      try {
        const raw = await fsRead(`${meshDir}/${file}`);
        const bundle = JSON.parse(raw);
        if (bundle.meshAsset) {
          allMeshAssets.push(bundle.meshAsset);
          if (bundle.materials) allMaterials.push(...bundle.materials);
          if (bundle.textures) allTextures.push(...bundle.textures);
          if (bundle.animations) allAnimations.push(...bundle.animations);
        }
      } catch (e) {
        console.warn(`Failed to load mesh asset file ${file}:`, e);
      }
    }

    // Load standalone materials & textures (not tied to any mesh asset)
    const standaloneFile = `${meshDir}/_standalone_materials.json`;
    try {
      if (await fsExists(standaloneFile)) {
        const raw = await fsRead(standaloneFile);
        const standalone = JSON.parse(raw);
        if (standalone.materials) allMaterials.push(...standalone.materials);
        if (standalone.textures) allTextures.push(...standalone.textures);
      }
    } catch (_e) {
      // standalone materials file not found or invalid — skip
    }

    if (allMeshAssets.length > 0 || allMaterials.length > 0) {
      this._meshManager.importAll({
        meshAssets: allMeshAssets,
        materials: allMaterials,
        textures: allTextures,
        animations: allAnimations,
      });
    }
  }

  // ============================================================
  //  Save/Load Animation Blueprints
  // ============================================================

  private async _saveAnimBlueprints(): Promise<void> {
    if (!this._projectPath || !this._animBPManager) return;
    const abpDir = `${this._projectPath}/${ANIM_BLUEPRINTS_DIR}`;
    const animBPs = this._animBPManager.exportAll();
    for (const json of animBPs) {
      const safeName = json.animBlueprintName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${abpDir}/${safeName}_${json.animBlueprintId}.json`,
        JSON.stringify(json, null, 2),
      );
    }
    const index = animBPs.map(a => ({
      id: a.animBlueprintId,
      name: a.animBlueprintName,
      file: `${a.animBlueprintName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${a.animBlueprintId}.json`,
    }));
    await fsWrite(`${abpDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadAnimBlueprints(): Promise<void> {
    if (!this._projectPath || !this._animBPManager) return;
    const abpDir = `${this._projectPath}/${ANIM_BLUEPRINTS_DIR}`;
    if (!(await fsExists(abpDir))) return;

    const allAnimBPs: AnimBlueprintJSON[] = [];
    const indexPath = `${abpDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${abpDir}/${entry.file}`);
          allAnimBPs.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load animation blueprint ${entry.name}:`, e);
        }
      }
    } else {
      const fileNames = await fsListDir(abpDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${abpDir}/${name}`);
          allAnimBPs.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load animation blueprint file ${name}:`, e);
        }
      }
    }

    if (allAnimBPs.length > 0) {
      this._animBPManager.importAll(allAnimBPs);
    }
  }

  // ============================================================
  //  Save/Load Widget Blueprints
  // ============================================================

  private async _saveWidgetBlueprints(): Promise<void> {
    if (!this._projectPath || !this._widgetBPManager) return;
    const wbpDir = `${this._projectPath}/${WIDGET_BLUEPRINTS_DIR}`;
    const widgetBPs = this._widgetBPManager.exportAll();
    for (const json of widgetBPs) {
      const safeName = json.widgetBlueprintName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${wbpDir}/${safeName}_${json.widgetBlueprintId}.json`,
        JSON.stringify(json, null, 2),
      );
    }
    const index = widgetBPs.map(w => ({
      id: w.widgetBlueprintId,
      name: w.widgetBlueprintName,
      file: `${w.widgetBlueprintName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${w.widgetBlueprintId}.json`,
    }));
    await fsWrite(`${wbpDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadWidgetBlueprints(): Promise<void> {
    if (!this._projectPath || !this._widgetBPManager) return;
    const wbpDir = `${this._projectPath}/${WIDGET_BLUEPRINTS_DIR}`;
    if (!(await fsExists(wbpDir))) return;

    const allWidgetBPs: WidgetBlueprintJSON[] = [];
    const indexPath = `${wbpDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${wbpDir}/${entry.file}`);
          allWidgetBPs.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load widget blueprint ${entry.name}:`, e);
        }
      }
    } else {
      const fileNames = await fsListDir(wbpDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${wbpDir}/${name}`);
          allWidgetBPs.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load widget blueprint file ${name}:`, e);
        }
      }
    }

    if (allWidgetBPs.length > 0) {
      this._widgetBPManager.importAll(allWidgetBPs);
    }
  }

  // ============================================================
  //  Save/Load Game Instances
  // ============================================================

  private async _saveGameInstances(): Promise<void> {
    if (!this._projectPath || !this._gameInstanceManager) return;
    const giDir = `${this._projectPath}/${GAME_INSTANCES_DIR}`;
    const gameInstances = this._gameInstanceManager.exportAll();
    for (const json of gameInstances) {
      const safeName = json.gameInstanceName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${giDir}/${safeName}_${json.gameInstanceId}.json`,
        JSON.stringify(json, null, 2),
      );
    }
    const index = gameInstances.map(gi => ({
      id: gi.gameInstanceId,
      name: gi.gameInstanceName,
      file: `${gi.gameInstanceName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${gi.gameInstanceId}.json`,
    }));
    await fsWrite(`${giDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadGameInstances(): Promise<void> {
    if (!this._projectPath || !this._gameInstanceManager) return;
    const giDir = `${this._projectPath}/${GAME_INSTANCES_DIR}`;
    if (!(await fsExists(giDir))) return;

    const allGameInstances: GameInstanceBlueprintJSON[] = [];
    const indexPath = `${giDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${giDir}/${entry.file}`);
          allGameInstances.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load game instance ${entry.name}:`, e);
        }
      }
    } else {
      const fileNames = await fsListDir(giDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${giDir}/${name}`);
          allGameInstances.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load game instance file ${name}:`, e);
        }
      }
    }

    if (allGameInstances.length > 0) {
      this._gameInstanceManager.importAll(allGameInstances);
    }
  }

  // ============================================================
  //  Save/Load Save Game Classes
  // ============================================================

  private async _saveSaveGameClasses(): Promise<void> {
    if (!this._projectPath || !this._saveGameManager) return;
    const sgDir = `${this._projectPath}/${SAVE_GAME_CLASSES_DIR}`;
    const allSG = this._saveGameManager.exportAll();
    for (const json of allSG) {
      const safeName = json.saveGameName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${sgDir}/${safeName}_${json.saveGameId}.json`,
        JSON.stringify(json, null, 2),
      );
    }
    const index = allSG.map(sg => ({
      id: sg.saveGameId,
      name: sg.saveGameName,
      file: `${sg.saveGameName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${sg.saveGameId}.json`,
    }));
    await fsWrite(`${sgDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadSaveGameClasses(): Promise<void> {
    if (!this._projectPath || !this._saveGameManager) return;
    const sgDir = `${this._projectPath}/${SAVE_GAME_CLASSES_DIR}`;
    if (!(await fsExists(sgDir))) return;

    const allSG: SaveGameAssetJSON[] = [];
    const indexPath = `${sgDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${sgDir}/${entry.file}`);
          allSG.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load save game class ${entry.name}:`, e);
        }
      }
    } else {
      const fileNames = await fsListDir(sgDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${sgDir}/${name}`);
          allSG.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load save game class file ${name}:`, e);
        }
      }
    }

    if (allSG.length > 0) {
      this._saveGameManager.importAll(allSG);
    }
  }

  // ============================================================
  //  Save/Load Events
  // ============================================================

  private async _saveEvents(): Promise<void> {
    if (!this._projectPath || !this._eventManager) return;
    const evDir = `${this._projectPath}/${EVENTS_DIR}`;

    const allEvents = this._eventManager.exportAll();
    for (const json of allEvents) {
      const safeName = json.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${evDir}/${safeName}_${json.id}.json`,
        JSON.stringify(json, null, 2),
      );
    }
    const index = allEvents.map(ev => ({
      id: ev.id,
      name: ev.name,
      file: `${ev.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${ev.id}.json`,
    }));
    await fsWrite(`${evDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadEvents(): Promise<void> {
    if (!this._projectPath || !this._eventManager) return;
    const evDir = `${this._projectPath}/${EVENTS_DIR}`;
    if (!(await fsExists(evDir))) return;

    const allEvents: EventAssetJSON[] = [];
    const indexPath = `${evDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${evDir}/${entry.file}`);
          allEvents.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load event ${entry.name}:`, e);
        }
      }
    } else {
      const fileNames = await fsListDir(evDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${evDir}/${name}`);
          allEvents.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load event file ${name}:`, e);
        }
      }
    }

    if (allEvents.length > 0) {
      this._eventManager.importAll(allEvents);
    }
  }

  // ============================================================
  //  Save/Load Textures
  // ============================================================

  private async _saveTextures(): Promise<void> {
    if (!this._projectPath) return;
    const texLib = TextureLibrary.instance;
    if (!texLib) return;

    const texDir = `${this._projectPath}/${TEXTURES_DIR}`;
    const assets = texLib.exportAll();

    // Save each texture as individual files for better diff/version control
    for (const asset of assets) {
      const safeName = asset.assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${texDir}/${safeName}_${asset.assetId}.json`,
        JSON.stringify(asset, null, 2),
      );
    }

    // Save index
    const index = assets.map(a => ({
      id: a.assetId,
      name: a.assetName,
      file: `${a.assetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${a.assetId}.json`,
    }));
    await fsWrite(`${texDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadTextures(): Promise<void> {
    if (!this._projectPath) return;
    const texLib = TextureLibrary.instance;
    if (!texLib) return;

    const texDir = `${this._projectPath}/${TEXTURES_DIR}`;
    if (!(await fsExists(texDir))) return;

    const indexPath = `${texDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    const allTextures: any[] = [];

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${texDir}/${entry.file}`);
          allTextures.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load texture ${entry.name}:`, e);
        }
      }
    } else {
      // Fallback: scan directory
      const fileNames = await fsListDir(texDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${texDir}/${name}`);
          allTextures.push(JSON.parse(raw));
        } catch (e) {
          console.warn(`Failed to load texture file ${name}:`, e);
        }
      }
    }

    if (allTextures.length > 0) {
      await texLib.importAll(allTextures);
    }
  }

  // ============================================================
  //  Save/Load Sounds & Sound Cues
  // ============================================================

  private async _saveSounds(): Promise<void> {
    if (!this._projectPath) return;
    const soundLib = SoundLibrary.instance;
    if (!soundLib) return;

    // Save imported sound assets
    const soundDir = `${this._projectPath}/${SOUNDS_DIR}`;
    const sounds = soundLib.exportAllSounds();
    for (const asset of sounds) {
      const safeName = asset.assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${soundDir}/${safeName}_${asset.assetId}.json`,
        JSON.stringify(asset, null, 2),
      );
    }
    const soundIndex = sounds.map(a => ({
      id: a.assetId,
      name: a.assetName,
      file: `${a.assetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${a.assetId}.json`,
    }));
    await fsWrite(`${soundDir}/_index.json`, JSON.stringify(soundIndex, null, 2));

    // Save sound cues
    const cueDir = `${this._projectPath}/${SOUND_CUES_DIR}`;
    const cues = soundLib.exportAllCues();
    for (const cue of cues) {
      const safeName = cue.assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${cueDir}/${safeName}_${cue.assetId}.json`,
        JSON.stringify(cue, null, 2),
      );
    }
    const cueIndex = cues.map(c => ({
      id: c.assetId,
      name: c.assetName,
      file: `${c.assetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${c.assetId}.json`,
    }));
    await fsWrite(`${cueDir}/_index.json`, JSON.stringify(cueIndex, null, 2));
  }

  private async _loadSounds(): Promise<void> {
    if (!this._projectPath) return;
    const soundLib = SoundLibrary.instance;
    if (!soundLib) return;

    // Load imported sound assets
    const soundDir = `${this._projectPath}/${SOUNDS_DIR}`;
    if (await fsExists(soundDir)) {
      const indexPath = `${soundDir}/_index.json`;
      const allSounds: any[] = [];

      if (await fsExists(indexPath)) {
        const indexRaw = await fsRead(indexPath);
        const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
        for (const entry of index) {
          try {
            const raw = await fsRead(`${soundDir}/${entry.file}`);
            allSounds.push(JSON.parse(raw));
          } catch (e) {
            console.warn(`Failed to load sound ${entry.name}:`, e);
          }
        }
      } else {
        const fileNames = await fsListDir(soundDir, '.json');
        for (const name of fileNames) {
          if (name === '_index.json') continue;
          try {
            const raw = await fsRead(`${soundDir}/${name}`);
            allSounds.push(JSON.parse(raw));
          } catch (e) {
            console.warn(`Failed to load sound file ${name}:`, e);
          }
        }
      }

      if (allSounds.length > 0) {
        await soundLib.importAllSounds(allSounds);
      }
    }

    // Load sound cues
    const cueDir = `${this._projectPath}/${SOUND_CUES_DIR}`;
    if (await fsExists(cueDir)) {
      const indexPath = `${cueDir}/_index.json`;
      const allCues: any[] = [];

      if (await fsExists(indexPath)) {
        const indexRaw = await fsRead(indexPath);
        const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
        for (const entry of index) {
          try {
            const raw = await fsRead(`${cueDir}/${entry.file}`);
            allCues.push(JSON.parse(raw));
          } catch (e) {
            console.warn(`Failed to load sound cue ${entry.name}:`, e);
          }
        }
      } else {
        const fileNames = await fsListDir(cueDir, '.json');
        for (const name of fileNames) {
          if (name === '_index.json') continue;
          try {
            const raw = await fsRead(`${cueDir}/${name}`);
            allCues.push(JSON.parse(raw));
          } catch (e) {
            console.warn(`Failed to load sound cue file ${name}:`, e);
          }
        }
      }

      if (allCues.length > 0) {
        soundLib.importAllCues(allCues);
      }
    }
  }

  // ============================================================
  //  Save/Load Fonts
  // ============================================================

  private async _saveFonts(): Promise<void> {
    if (!this._projectPath) return;
    const fontLib = FontLibrary.instance;
    if (!fontLib) return;

    const fontDir = `${this._projectPath}/${FONTS_DIR}`;
    const assets = fontLib.exportAll();

    for (const asset of assets) {
      const safeName = asset.assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fsWrite(
        `${fontDir}/${safeName}_${asset.assetId}.json`,
        JSON.stringify(asset, null, 2),
      );
    }

    const index = assets.map(a => ({
      id: a.assetId,
      name: a.assetName,
      file: `${a.assetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${a.assetId}.json`,
    }));
    await fsWrite(`${fontDir}/_index.json`, JSON.stringify(index, null, 2));
  }

  private async _loadFonts(): Promise<void> {
    if (!this._projectPath) return;
    const fontLib = FontLibrary.instance;
    if (!fontLib) return;

    const fontDir = `${this._projectPath}/${FONTS_DIR}`;
    if (!(await fsExists(fontDir))) return;

    const indexPath = `${fontDir}/_index.json`;
    const hasIndex = await fsExists(indexPath);

    if (hasIndex) {
      const indexRaw = await fsRead(indexPath);
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexRaw);
      for (const entry of index) {
        try {
          const raw = await fsRead(`${fontDir}/${entry.file}`);
          const asset = JSON.parse(raw);
          await fontLib.loadFromAsset(asset);
        } catch (e) {
          console.warn(`Failed to load font ${entry.name}:`, e);
        }
      }
    } else {
      const fileNames = await fsListDir(fontDir, '.json');
      for (const name of fileNames) {
        if (name === '_index.json') continue;
        try {
          const raw = await fsRead(`${fontDir}/${name}`);
          const asset = JSON.parse(raw);
          await fontLib.loadFromAsset(asset);
        } catch (e) {
          console.warn(`Failed to load font file ${name}:`, e);
        }
      }
    }
  }

  // ============================================================
  //  Editor State (camera position, etc.)
  // ============================================================

  private async _saveEditorState(): Promise<void> {
    if (!this._projectPath) return;

    const camera = this.getCameraState?.();
    const state = {
      camera: camera ?? null,
    };

    await fsWrite(
      `${this._projectPath}/${EDITOR_STATE_FILE}`,
      JSON.stringify(state, null, 2),
    );
  }

  private async _loadEditorState(): Promise<void> {
    if (!this._projectPath) return;

    const filePath = `${this._projectPath}/${EDITOR_STATE_FILE}`;
    const fileFound = await fsExists(filePath);
    if (!fileFound) return;

    try {
      const raw = await fsRead(filePath);
      const state = JSON.parse(raw);

      if (state.camera && this.applyCameraState) {
        this.applyCameraState(state.camera);
      }
    } catch (e) {
      console.warn('Failed to load editor state:', e);
    }
  }

  // ============================================================
  //  Folder Structure
  // ============================================================

  private async _saveFolderStructure(): Promise<void> {
    if (!this._projectPath || !this._folderManager) return;

    const folderData = this._folderManager.toJSON();
    await fsWrite(
      `${this._projectPath}/${FOLDER_STRUCTURE_FILE}`,
      JSON.stringify(folderData, null, 2),
    );
  }

  private async _loadFolderStructure(): Promise<void> {
    if (!this._projectPath || !this._folderManager) return;

    const filePath = `${this._projectPath}/${FOLDER_STRUCTURE_FILE}`;
    const fileFound = await fsExists(filePath);
    if (!fileFound) {
      // First time - create default folders
      this._folderManager.createDefaultFolders();
      return;
    }

    try {
      const raw = await fsRead(filePath);
      const folderData = JSON.parse(raw);
      this._folderManager.fromJSON(folderData);
    } catch (e) {
      console.warn('Failed to load folder structure:', e);
      // Fallback to default folders
      this._folderManager.createDefaultFolders();
    }
  }

  // ============================================================
  //  Save/Load Inheritance Data
  // ============================================================

  private async _saveInheritanceData(): Promise<void> {
    if (!this._projectPath) return;

    const inh = ClassInheritanceSystem.instance;
    const data: Record<string, any> = {
      actors: inh.exportActorInheritance(),
      widgets: inh.exportWidgetInheritance(),
    };

    const filePath = `${this._projectPath}/${CONFIG_DIR}/inheritance.json`;
    await fsWrite(filePath, JSON.stringify(data, null, 2));
  }

  private async _loadInheritanceData(): Promise<void> {
    if (!this._projectPath) return;

    const inh = ClassInheritanceSystem.instance;

    // First, register all existing actors and widgets in the system
    inh.registerAllActors(this._assetManager);
    if (this._widgetBPManager) {
      inh.registerAllWidgets(this._widgetBPManager);
    }

    // Then load saved inheritance relationships
    const filePath = `${this._projectPath}/${CONFIG_DIR}/inheritance.json`;
    const fileFound = await fsExists(filePath);
    if (!fileFound) return;

    try {
      const raw = await fsRead(filePath);
      const data = JSON.parse(raw);

      if (data.actors) {
        inh.importActorInheritance(data.actors);
      }
      if (data.widgets) {
        inh.importWidgetInheritance(data.widgets);
      }

      console.log('[ProjectManager]   ✓ inheritance data loaded');
    } catch (e) {
      console.warn('Failed to load inheritance data:', e);
    }
  }

  // ============================================================
  //  Auto-Save
  // ============================================================

  markDirty(): void {
    this._dirty = true;
  }

  private _startAutoSave(): void {
    this._stopAutoSave();
    // Auto-save every 30 seconds if dirty
    this._autoSaveTimer = window.setInterval(async () => {
      if (this._dirty && this._projectPath) {
        await this.saveProject();
      }
    }, 30_000);
  }

  private _stopAutoSave(): void {
    if (this._autoSaveTimer !== null) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  // ============================================================
  //  Public Scene Management API
  // ============================================================

  /** Get the name of the currently active scene */
  get activeSceneName(): string {
    return this._meta?.activeScene ?? DEFAULT_SCENE;
  }

  /**
   * List all scene files in the project's Scenes/ directory.
   * Returns an array of scene names (without .json extension).
   */
  async listScenes(): Promise<string[]> {
    if (!this._projectPath) return [];

    const scenesDir = `${this._projectPath}/${SCENES_DIR}`;
    const dirExists = await fsExists(scenesDir);
    if (!dirExists) return [];

    try {
      const fileNames = await fsListDir(scenesDir, '.json');
      return fileNames
        .map(f => f.replace(/\.json$/i, ''))
        .filter(n => n.length > 0);
    } catch (err) {
      console.warn('[ProjectManager] Failed to list scenes:', err);
      return [];
    }
  }

  /**
   * Create a new scene with the given name and switch to it.
   * Saves the current scene first so nothing is lost.
   * Returns true on success.
   */
  async createScene(name: string, sceneMode: '2D' | '3D' = '3D'): Promise<boolean> {
    if (!this._projectPath || !this._meta) return false;

    // Sanitise scene name
    const safeName = name.trim().replace(/[^a-zA-Z0-9_ -]/g, '');
    if (!safeName) return false;

    // Check if it already exists
    const filePath = `${this._projectPath}/${SCENES_DIR}/${safeName}.json`;
    if (await fsExists(filePath)) {
      console.warn(`[ProjectManager] Scene "${safeName}" already exists.`);
      return false;
    }

    try {
      // 1. Save the current scene & editor state before switching
      await this._saveScene(this._meta.activeScene);
      await this._saveEditorState();

      // 2. Create the new scene file with an empty scene
      const newScene: SceneJSON = {
        name: safeName,
        gameObjects: [],
        sceneMode,
      };
      await fsWrite(filePath, JSON.stringify(newScene, null, 2));

      // 3. Clear the editor scene (including 2D data)
      this._clearScene();

      // 4. Notify scene mode so panels update (e.g. 2D panels are created/destroyed)
      await this.onSceneModeDetected?.(sceneMode);

      // 5. Update active scene metadata
      this._meta.activeScene = safeName;
      this._meta.modifiedAt = Date.now();
      await fsWrite(
        `${this._projectPath}/${PROJECT_FILE}`,
        JSON.stringify(this._meta, null, 2),
      );

      // 6. Notify listeners
      this.onSceneChanged?.(safeName);

      console.log(`[ProjectManager] Created and switched to scene: ${safeName}`);
      return true;
    } catch (err) {
      console.error('[ProjectManager] Failed to create scene:', err);
      return false;
    }
  }

  /**
   * Open (switch to) an existing scene by name.
   * Saves the current scene first so nothing is lost.
   * Returns true on success.
   */
  async openScene(sceneName: string): Promise<boolean> {
    if (!this._projectPath || !this._meta) return false;
    if (sceneName === this._meta.activeScene) return true; // already open

    const filePath = `${this._projectPath}/${SCENES_DIR}/${sceneName}.json`;
    if (!(await fsExists(filePath))) {
      console.warn(`[ProjectManager] Scene file not found: ${filePath}`);
      return false;
    }

    try {
      // 1. Save the current scene & editor state
      await this._saveScene(this._meta.activeScene);
      await this._saveEditorState();

      // 2. Clear current scene
      this._clearScene();

      // 3. Load the new scene
      await this._loadScene(sceneName);

      // 4. Update active scene metadata & persist
      this._meta.activeScene = sceneName;
      this._meta.modifiedAt = Date.now();
      await fsWrite(
        `${this._projectPath}/${PROJECT_FILE}`,
        JSON.stringify(this._meta, null, 2),
      );

      // 5. Notify listeners
      this.onSceneChanged?.(sceneName);

      console.log(`[ProjectManager] Switched to scene: ${sceneName}`);
      return true;
    } catch (err) {
      console.error('[ProjectManager] Failed to open scene:', err);
      return false;
    }
  }

  // ============================================================
  //  Play / Stop scene restoration
  // ============================================================

  /**
   * Call BEFORE entering play mode.
   * Saves the current scene to disk and remembers its name so we can
   * restore it when the user presses Stop.
   */
  async savePrePlaySnapshot(): Promise<void> {
    this._prePlaySceneName = this.activeSceneName;
    this._runtimeSceneChanged = false;

    // Persist the current scene to disk so restorePrePlayScene can reload it
    await this._saveScene(this._prePlaySceneName);
    console.log(`[ProjectManager] Pre-play snapshot saved — scene: ${this._prePlaySceneName}`);
  }

  /**
   * Call AFTER exiting play mode.
   * If a runtime scene load occurred, clears the scene and reloads the
   * original scene that was active when the user pressed Play.
   * Returns true if a scene restore was performed.
   */
  async restorePrePlayScene(): Promise<boolean> {
    if (!this._prePlaySceneName || !this._runtimeSceneChanged) {
      // No runtime scene change happened — the per-GO transform restore
      // in main.ts is sufficient.
      this._prePlaySceneName = null;
      this._runtimeSceneChanged = false;
      return false;
    }

    console.log(`[ProjectManager] Restoring pre-play scene: ${this._prePlaySceneName}`);
    this._clearScene();
    await this._loadScene(this._prePlaySceneName);

    // Restore active scene metadata in case loadSceneRuntime changed it implicitly
    if (this._meta) {
      this._meta.activeScene = this._prePlaySceneName;
    }

    this._prePlaySceneName = null;
    this._runtimeSceneChanged = false;
    return true;
  }

  /** True if a Load Scene node changed the scene during the current play session */
  get didRuntimeSceneChange(): boolean {
    return this._runtimeSceneChanged;
  }

  /**
   * Runtime scene load — clears the current scene objects and loads a new
   * scene's game objects WITHOUT saving editor state or disrupting the
   * Game Instance (which must persist across scene transitions).
   */
  async loadSceneRuntime(sceneName: string): Promise<boolean> {
    if (!this._projectPath) return false;

    const filePath = `${this._projectPath}/${SCENES_DIR}/${sceneName}.json`;
    if (!(await fsExists(filePath))) {
      console.warn(`[ProjectManager] loadSceneRuntime — scene not found: ${filePath}`);
      return false;
    }

    try {
      // Mark that a runtime scene transition happened
      this._runtimeSceneChanged = true;

      // 1. Clear current scene objects
      this._clearScene();

      // 2. Load & deserialize scene data
      const raw = await fsRead(filePath);
      const sceneData: SceneJSON = JSON.parse(raw);
      deserializeScene(this._engine.scene, sceneData, this._assetManager, this._meshManager ?? undefined);
      console.log(`[ProjectManager] loadSceneRuntime — loaded "${sceneName}" (${sceneData.gameObjects.length} objects)`);

      // 3. Re-compile scripts so the new actors start running
      if ((this._engine as any).recompileScripts) {
        (this._engine as any).recompileScripts();
      }

      return true;
    } catch (err) {
      console.error('[ProjectManager] loadSceneRuntime failed:', err);
      return false;
    }
  }

  /**
   * Delete a scene by name. Cannot delete the currently active scene.
   * Returns true on success.
   */
  async deleteScene(sceneName: string): Promise<boolean> {
    if (!this._projectPath || !this._meta) return false;
    if (sceneName === this._meta.activeScene) {
      console.warn('[ProjectManager] Cannot delete the active scene.');
      return false;
    }

    try {
      // Overwrite the file with an empty object to "delete" it
      // (Tauri invoke-based FS doesn't have a delete command, so we write empty)
      const filePath = `${this._projectPath}/${SCENES_DIR}/${sceneName}.json`;
      await fsWrite(filePath, '');
      console.log(`[ProjectManager] Deleted scene: ${sceneName}`);
      return true;
    } catch (err) {
      console.error('[ProjectManager] Failed to delete scene:', err);
      return false;
    }
  }

  /**
   * Duplicate the currently active scene under a new name.
   * Returns true on success.
   */
  async duplicateScene(newName: string): Promise<boolean> {
    if (!this._projectPath || !this._meta) return false;

    const safeName = newName.trim().replace(/[^a-zA-Z0-9_ -]/g, '');
    if (!safeName) return false;

    const destPath = `${this._projectPath}/${SCENES_DIR}/${safeName}.json`;
    if (await fsExists(destPath)) {
      console.warn(`[ProjectManager] Scene "${safeName}" already exists.`);
      return false;
    }

    try {
      // Save current scene under the new name
      await this._saveScene(safeName);

      console.log(`[ProjectManager] Duplicated scene as: ${safeName}`);
      return true;
    } catch (err) {
      console.error('[ProjectManager] Failed to duplicate scene:', err);
      return false;
    }
  }

  // ============================================================
  //  Helpers
  // ============================================================

  private _clearScene(): void {
    const scene = this._engine.scene;
    while (scene.gameObjects.length > 0) {
      scene.removeGameObject(scene.gameObjects[0]);
    }

    // Also clear 2D scene data (tilemaps, tilesets, sprite sheets, actors)
    // so stale content from the previous scene does not bleed through.
    const scene2D = this.getScene2DManager?.();
    if (scene2D) {
      scene2D.clearSceneData();
    }
  }

  dispose(): void {
    this._stopAutoSave();
  }
}
