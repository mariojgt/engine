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

async function fsRead(path: string): Promise<string> {
  return await invoke<string>('read_file', { path });
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
const CONFIG_DIR = 'Config';
const EDITOR_STATE_FILE = 'Config/editor.json';
const DEFAULT_SCENE = 'DefaultScene';

export class ProjectManager {
  private _projectPath: string | null = null;
  private _meta: ProjectMeta | null = null;
  private _engine: Engine;
  private _assetManager: ActorAssetManager;
  private _structManager: StructureAssetManager | null = null;
  private _meshManager: MeshAssetManager | null = null;
  private _dirty = false;
  private _autoSaveTimer: number | null = null;

  /** Callback to obtain camera state from the viewport */
  public getCameraState: (() => CameraStateJSON | undefined) | null = null;
  /** Callback to apply camera state to the viewport */
  public applyCameraState: ((state: CameraStateJSON) => void) | null = null;

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

      // Load structures and enums first (actors may reference them)
      await this._loadStructures();
      await this._loadEnums();

      // Load mesh assets
      await this._loadMeshes();

      // Load actors first (scenes reference them)
      await this._loadActors();

      // Load active scene
      await this._loadScene(meta.activeScene);

      // Load editor state (camera, etc.)
      await this._loadEditorState();

      this._dirty = false;
      this._startAutoSave();
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
    if (!this._projectPath || !this._meta) return;

    try {
      // Update modified timestamp
      this._meta.modifiedAt = Date.now();

      // Save project.json
      await fsWrite(
        `${this._projectPath}/${PROJECT_FILE}`,
        JSON.stringify(this._meta, null, 2),
      );

      // Save actors
      await this._saveActors();

      // Save structures and enums
      await this._saveStructures();
      await this._saveEnums();

      // Save mesh assets
      await this._saveMeshes();

      // Save active scene
      await this._saveScene(this._meta.activeScene);

      // Save editor state
      await this._saveEditorState();

      this._dirty = false;
      console.log(`[ProjectManager] Project saved: ${this._meta.name}`);
    } catch (err) {
      console.error('[ProjectManager] Failed to save project:', err);
    }
  }

  // ============================================================
  //  Save/Load Scene
  // ============================================================

  private async _saveScene(sceneName: string): Promise<void> {
    if (!this._projectPath) return;

    const camera = this.getCameraState?.();
    const sceneData = serializeScene(
      this._engine.scene,
      sceneName,
      camera,
    );

    await fsWrite(
      `${this._projectPath}/${SCENES_DIR}/${sceneName}.json`,
      JSON.stringify(sceneData, null, 2),
    );
  }

  private async _loadScene(sceneName: string): Promise<void> {
    if (!this._projectPath) return;

    const filePath = `${this._projectPath}/${SCENES_DIR}/${sceneName}.json`;
    const fileFound = await fsExists(filePath);
    if (!fileFound) {
      console.warn(`Scene file not found: ${filePath}`);
      return;
    }

    const raw = await fsRead(filePath);
    const sceneData: SceneJSON = JSON.parse(raw);

    deserializeScene(this._engine.scene, sceneData, this._assetManager, this._meshManager ?? undefined);

    // Apply camera state if available
    if (sceneData.camera && this.applyCameraState) {
      this.applyCameraState(sceneData.camera);
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

    if (allMeshAssets.length > 0) {
      this._meshManager.importAll({
        meshAssets: allMeshAssets,
        materials: allMaterials,
        textures: allTextures,
        animations: allAnimations,
      });
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
  //  Helpers
  // ============================================================

  private _clearScene(): void {
    const scene = this._engine.scene;
    while (scene.gameObjects.length > 0) {
      scene.removeGameObject(scene.gameObjects[0]);
    }
  }

  dispose(): void {
    this._stopAutoSave();
  }
}
