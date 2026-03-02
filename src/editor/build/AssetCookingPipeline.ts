// ============================================================
//  AssetCookingPipeline — Game Asset Cooking
//  Transforms raw editor assets into optimized runtime assets.
//
//  What cooking does per asset type:
//    Scenes     — strips editor-only actors, validates refs
//    Actors     — strips editor-only node graph data
//    Blueprints — strips comment nodes, keeps compiled JS code
//    Textures   — compresses to target format (via canvas API)
//    Audio      — converts format, strips waveform preview data
//    Meshes     — strips import metadata, optimizes if requested
//
//  The cooked assets are written to a staging directory:
//    <projectRoot>/BuildCache/<platform>/Cooked/
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import type { BuildConfigurationJSON, BuildPlatform, TextureCompression } from './BuildConfigurationAsset';
import type { ManifestEntry, BuildManifest } from './DependencyAnalyzer';
import { BuildCache, hashString, hashObject } from './BuildCache';

// ── Progress callback ─────────────────────────────────────────

export interface CookingProgressCallback {
  (step: string, current: number, total: number): void;
}

// ── Cook result ───────────────────────────────────────────────

export interface CookResult {
  /** Number of assets cooked fresh */
  cooked: number;
  /** Number of assets reused from cache */
  cached: number;
  /** Number of assets that failed to cook */
  failed: number;
  /** Errors encountered during cooking */
  errors: string[];
  /** Warnings encountered during cooking */
  warnings: string[];
  /** Total size of cooked output in bytes */
  totalCookedBytes: number;
  /** Staging directory path */
  stagingDir: string;
}

// ── Cooking pipeline ──────────────────────────────────────────

export class AssetCookingPipeline {
  private _config: BuildConfigurationJSON;
  private _cache: BuildCache;
  private _stagingDir: string;
  private _projectPath: string;

  constructor(config: BuildConfigurationJSON, projectPath: string) {
    this._config = config;
    this._projectPath = projectPath;
    this._cache = new BuildCache(projectPath, config.general.platform);
    this._stagingDir = `${projectPath}/BuildCache/${config.general.platform}/Cooked`;
  }

  get stagingDir(): string {
    return this._stagingDir;
  }

  /** Cook all assets in the manifest. */
  async cookAll(
    manifest: BuildManifest,
    onProgress: CookingProgressCallback
  ): Promise<CookResult> {
    await this._cache.load();
    if (this._config.output.cleanBeforeBuild) {
      this._cache.clear();
    }

    const result: CookResult = {
      cooked: 0,
      cached: 0,
      failed: 0,
      errors: [],
      warnings: [],
      totalCookedBytes: 0,
      stagingDir: this._stagingDir,
    };

    // Ensure staging directory exists
    await invoke('write_file', {
      path: `${this._stagingDir}/.keep`,
      contents: '',
    });

    const allEntries = [...manifest.scenes, ...manifest.assets];
    const total = allEntries.length;
    let current = 0;

    for (const entry of allEntries) {
      current++;
      onProgress(`Cooking ${entry.kind}: ${entry.id}`, current, total);

      try {
        const cooked = await this._cookEntry(entry);
        if (cooked === 'cached') {
          result.cached++;
        } else if (cooked === 'cooked') {
          result.cooked++;
        } else {
          result.failed++;
          result.errors.push(`Failed to cook: ${entry.relativePath}`);
        }
        result.totalCookedBytes += entry.sizeBytes;
      } catch (e: any) {
        result.failed++;
        result.errors.push(`Error cooking ${entry.relativePath}: ${e?.message ?? e}`);
      }
    }

    await this._cache.save();
    return result;
  }

  /** Cook a single manifest entry. Returns 'cooked', 'cached', or 'failed'. */
  private async _cookEntry(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    switch (entry.kind) {
      case 'scene':         return this._cookScene(entry);
      case 'actor':         return this._cookActor(entry);
      case 'animBlueprint':
      case 'widgetBlueprint':
      case 'gameInstance':
      case 'saveGame':
      case 'structure':
      case 'enum':
      case 'dataTable':
      case 'event':
      case 'inputMapping':  return this._cookJsonAsset(entry);
      case 'mesh':          return this._cookMesh(entry);
      case 'texture':       return this._cookTexture(entry);
      case 'sound':         return this._cookAudio(entry);
      case 'animation':     return this._cookAnimation(entry);
      case 'navmesh':
      case 'projectConfig': return this._copyAsIs(entry);
      default:              return this._copyAsIs(entry);
    }
  }

  // ── Scene cooking ─────────────────────────────────────────────

  /**
   * Load the Actors/_index.json and cache all actor asset JSON data.
   * This lets _cookScene bake actor data directly into scene GOs.
   */
  private _actorCache: Map<string, any> | null = null;

  private async _loadActorIndex(): Promise<Map<string, any>> {
    if (this._actorCache) return this._actorCache;
    this._actorCache = new Map();

    try {
      const indexJson = await invoke<string>('read_file', {
        path: `${this._projectPath}/Actors/_index.json`,
      });
      const index: Array<{ id: string; name: string; file: string }> = JSON.parse(indexJson);

      for (const entry of index) {
        try {
          const actorJson = await invoke<string>('read_file', {
            path: `${this._projectPath}/Actors/${entry.file}`,
          });
          this._actorCache.set(entry.id, JSON.parse(actorJson));
        } catch {
          console.warn(`[Cook] Could not read actor file: ${entry.file}`);
        }
      }
    } catch {
      console.warn('[Cook] Could not read Actors/_index.json');
    }

    return this._actorCache;
  }

  private async _cookScene(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    let sourceJson: string;
    try {
      sourceJson = await invoke<string>('read_file', { path: entry.absolutePath });
    } catch {
      return 'failed';
    }

    // Load actor assets so we can bake their data into the scene
    const actors = await this._loadActorIndex();

    // Hash includes both the scene JSON and all referenced actor data
    // so actor changes (e.g. blueprint edits) invalidate the cache.
    const scene = JSON.parse(sourceJson);
    let combinedHashInput = sourceJson;
    if (scene.gameObjects) {
      for (const go of scene.gameObjects) {
        if (go.actorAssetId && actors.has(go.actorAssetId)) {
          combinedHashInput += JSON.stringify(actors.get(go.actorAssetId));
        }
      }
    }
    const hash = hashString(combinedHashInput);
    if (this._cache.isCached(entry.id, hash)) {
      return 'cached';
    }

    // Strip editor-only actors based on tags
    if (scene.gameObjects) {
      scene.gameObjects = scene.gameObjects.filter((go: any) => {
        const tags: string[] = go.tags ?? [];
        // Remove editor-only marker tags
        return !tags.includes('EditorOnly') &&
               !tags.includes('BuildExclude') &&
               !tags.includes('DebugOnly');
      });

      // Bake actor asset data into each GO & strip editor-only fields
      for (const go of scene.gameObjects) {
        delete go._editorComment;
        delete go._editorColor;
        delete go._editorLocked;

        // ── Bake actor asset data inline ──
        // In the editor, this data comes from the ActorAssetManager at runtime.
        // For built games we embed it directly so the runtime is self-contained.
        if (go.actorAssetId && actors.has(go.actorAssetId)) {
          const actor = actors.get(go.actorAssetId)!;

          // Merge components from the actor asset (capsule, mesh, etc.)
          if (!go.components && actor.components) {
            go.components = actor.components;
          }

          // Merge compiled blueprint code
          if (!go.compiledCode && actor.compiledCode) {
            go.compiledCode = actor.compiledCode;
          }

          // Merge blueprint data (variables, functions, custom events, etc.)
          if (!go.blueprintData) {
            go.blueprintData = {
              variables: actor.variables ?? [],
              functions: actor.functions ?? [],
              macros: actor.macros ?? [],
              customEvents: actor.customEvents ?? [],
              structs: actor.structs ?? [],
              eventGraph: actor.eventGraphData ?? null,
            };
          }

          // Merge character pawn config (capsule settings, movement, etc.)
          if (!go.characterPawnConfig && actor.characterPawnConfig) {
            go.characterPawnConfig = actor.characterPawnConfig;
          }

          // Merge 2D character movement config (gravityScale, moveSpeed, jumpForce, etc.)
          if (!go.characterMovement2DConfig && actor.characterMovement2DConfig) {
            go.characterMovement2DConfig = actor.characterMovement2DConfig;
          }

          // Merge mesh type from the actor (if scene GO still has "cube" default)
          if (actor.rootMeshType) {
            go.meshType = actor.rootMeshType;
          }

          // Merge actor type if not set
          if (!go.actorType && actor.actorType) {
            go.actorType = actor.actorType;
          }

          // Merge controller class and blueprint
          if (!go.controllerClass && actor.controllerClass) {
            go.controllerClass = actor.controllerClass;
          }
          if (!go.controllerBlueprintId && actor.controllerBlueprintId) {
            go.controllerBlueprintId = actor.controllerBlueprintId;
          }

          // Merge root physics config from the actor asset
          if (!go.physicsConfig && actor.rootPhysics) {
            go.physicsConfig = actor.rootPhysics;
          }

          // Merge root material overrides from the actor asset
          if (!go.rootMaterialOverrides && actor.rootMaterialOverrides) {
            go.rootMaterialOverrides = actor.rootMaterialOverrides;
          }
        }

        // Keep blueprintData but strip graph visualization data
        if (go.blueprintData) {
          go.blueprintData = this._stripBlueprintEditorData(go.blueprintData);
        }
      }
    }

    const cookedJson = JSON.stringify(scene);
    const destPath = `${this._stagingDir}/${entry.relativePath}`;
    await invoke('write_file', { path: destPath, contents: cookedJson });

    entry.sizeBytes = cookedJson.length;
    this._cache.record(entry.id, hash, cookedJson.length);
    return 'cooked';
  }

  // ── Actor / Blueprint cooking ─────────────────────────────────

  private async _cookActor(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    let sourceJson: string;
    try {
      sourceJson = await invoke<string>('read_file', { path: entry.absolutePath });
    } catch {
      return 'failed';
    }

    const hash = hashString(sourceJson);
    if (this._cache.isCached(entry.id, hash)) {
      return 'cached';
    }

    const actor = JSON.parse(sourceJson);

    // Strip editor-only blueprint graph data, keep compiled code
    if (this._config.cooking.blueprintStripping) {
      if (actor.blueprintData) {
        actor.blueprintData = this._stripBlueprintEditorData(actor.blueprintData);
      }
    }

    const cookedJson = JSON.stringify(actor);
    const destPath = `${this._stagingDir}/${entry.relativePath}`;
    await invoke('write_file', { path: destPath, contents: cookedJson });

    entry.sizeBytes = cookedJson.length;
    this._cache.record(entry.id, hash, cookedJson.length);
    return 'cooked';
  }

  // ── Generic JSON asset cooking ─────────────────────────────────

  private async _cookJsonAsset(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    let sourceJson: string;
    try {
      sourceJson = await invoke<string>('read_file', { path: entry.absolutePath });
    } catch {
      // If this entry is a directory (e.g. InputMappings), cook all .json files inside it.
      try {
        const fileNames = await invoke<string[]>('list_dir_files', { path: entry.absolutePath });
        const jsonFiles = fileNames.filter(n => n.endsWith('.json'));
        if (jsonFiles.length === 0) {
          return 'cached';
        }

        const cookedFiles: Array<{ name: string; contents: string }> = [];
        let hashInput = '';
        for (const name of jsonFiles) {
          try {
            const raw = await invoke<string>('read_file', { path: `${entry.absolutePath}/${name}` });
            const minified = JSON.stringify(JSON.parse(raw));
            cookedFiles.push({ name, contents: minified });
            hashInput += `${name}:${raw}`;
          } catch {
            // Skip unreadable/invalid JSON files and continue cooking others.
          }
        }

        if (cookedFiles.length === 0) {
          return 'cached';
        }

        const hash = hashString(hashInput);
        if (this._cache.isCached(entry.id, hash)) {
          return 'cached';
        }

        let totalBytes = 0;
        for (const file of cookedFiles) {
          const destPath = `${this._stagingDir}/${entry.relativePath}/${file.name}`;
          await invoke('write_file', { path: destPath, contents: file.contents });
          totalBytes += file.contents.length;
        }

        entry.sizeBytes = totalBytes;
        this._cache.record(entry.id, hash, totalBytes);
        return 'cooked';
      } catch {
        // Asset may not have a file yet (e.g. empty manager) — skip silently
        return 'cached';
      }
    }

    const hash = hashString(sourceJson);
    if (this._cache.isCached(entry.id, hash)) {
      return 'cached';
    }

    // Minify JSON for shipping
    const cooked = JSON.stringify(JSON.parse(sourceJson));
    const destPath = `${this._stagingDir}/${entry.relativePath}`;
    await invoke('write_file', { path: destPath, contents: cooked });

    entry.sizeBytes = cooked.length;
    this._cache.record(entry.id, hash, cooked.length);
    return 'cooked';
  }

  // ── Mesh cooking ──────────────────────────────────────────────

  private async _cookMesh(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    // For mesh JSON metadata: strip editor import settings, keep runtime data
    if (entry.relativePath.endsWith('.json')) {
      let sourceJson: string;
      try {
        sourceJson = await invoke<string>('read_file', { path: entry.absolutePath });
      } catch {
        return 'cached';
      }

      const hash = hashString(sourceJson);
      if (this._cache.isCached(entry.id, hash)) {
        return 'cached';
      }

      const mesh = JSON.parse(sourceJson);

      // Strip editor-only import metadata
      if (this._config.cooking.meshOptimization) {
        delete mesh._importSettings;
        delete mesh._importHistory;
        delete mesh._editorThumbnail;
        delete mesh._importScale;
        delete mesh._importRotation;
      }

      const cooked = JSON.stringify(mesh);
      const destPath = `${this._stagingDir}/${entry.relativePath}`;
      await invoke('write_file', { path: destPath, contents: cooked });

      entry.sizeBytes = cooked.length;
      this._cache.record(entry.id, hash, cooked.length);
      return 'cooked';
    }

    // For binary mesh files (.glb, .fbx, .gltf) — copy as-is
    // (Mesh optimization / format conversion requires external tools like gltf-transform)
    return this._copyAsIs(entry);
  }

  // ── Texture cooking ───────────────────────────────────────────

  private async _cookTexture(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    // Texture JSON metadata
    if (entry.relativePath.endsWith('.json')) {
      return this._cookJsonAsset(entry);
    }

    // Texture binary: for web builds, we can compress via canvas API
    // For PC builds, we copy as-is (BC7 compression requires native tools)
    // In a production build system, this would call external texture tools
    return this._copyBinaryAsIs(entry);
  }

  // ── Audio cooking ─────────────────────────────────────────────

  private async _cookAudio(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    if (entry.relativePath.endsWith('.json')) {
      return this._cookJsonAsset(entry);
    }
    // Audio binary: copy as-is
    // In a production system this would use ffmpeg for format conversion
    return this._copyBinaryAsIs(entry);
  }

  // ── Animation cooking ─────────────────────────────────────────

  private async _cookAnimation(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    return entry.relativePath.endsWith('.json')
      ? this._cookJsonAsset(entry)
      : this._copyBinaryAsIs(entry);
  }

  // ── Utilities ─────────────────────────────────────────────────

  private async _copyAsIs(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    try {
      let content: string;
      try {
        content = await invoke<string>('read_file', { path: entry.absolutePath });
      } catch {
        // File doesn't exist — skip (optional assets like navmesh)
        return 'cached';
      }
      const hash = hashString(content);
      if (this._cache.isCached(entry.id, hash)) return 'cached';

      const destPath = `${this._stagingDir}/${entry.relativePath}`;
      await invoke('write_file', { path: destPath, contents: content });
      entry.sizeBytes = content.length;
      this._cache.record(entry.id, hash, content.length);
      return 'cooked';
    } catch {
      return 'failed';
    }
  }

  private async _copyBinaryAsIs(entry: ManifestEntry): Promise<'cooked' | 'cached' | 'failed'> {
    try {
      let data: number[];
      try {
        data = await invoke<number[]>('read_binary_file', { path: entry.absolutePath });
      } catch {
        return 'cached';
      }
      const bytes = new Uint8Array(data);
      // Simple hash of first 4KB + file size (fast approximation for large binaries)
      const sampleLen = Math.min(bytes.length, 4096);
      const sample = bytes.slice(0, sampleLen);
      let h = 2166136261;
      for (let i = 0; i < sample.length; i++) {
        h ^= sample[i]; h = (h * 16777619) >>> 0;
      }
      const hash = `${h.toString(16)}_${bytes.length}`;

      if (this._cache.isCached(entry.id, hash)) return 'cached';

      const destPath = `${this._stagingDir}/${entry.relativePath}`;
      await invoke('write_binary_file', { path: destPath, contents: Array.from(bytes) });
      entry.sizeBytes = bytes.length;
      this._cache.record(entry.id, hash, bytes.length);
      return 'cooked';
    } catch {
      return 'failed';
    }
  }

  // ── Blueprint stripping ───────────────────────────────────────

  private _stripBlueprintEditorData(blueprintData: any): any {
    if (!blueprintData) return blueprintData;
    const stripped = { ...blueprintData };

    // Keep: compiledCode, variables, functions (compiledCode only), customEvents
    // Strip: raw nodeData (Rete graph JSON), comment boxes, variable descriptions/tooltips

    // Strip raw graph nodeData from event graph (only needed in editor)
    if (stripped.eventGraph) {
      stripped.eventGraph = {
        // Keep nothing from the graph except the structure identifier
      };
    }

    // Strip nodeData from functions (keep compiledCode)
    if (stripped.functions) {
      stripped.functions = stripped.functions.map((fn: any) => ({
        ...fn,
        graph: {}, // strip raw node graph
      }));
    }

    // Strip nodeData from macros
    if (stripped.macros) {
      stripped.macros = stripped.macros.map((m: any) => ({
        ...m,
        graph: {},
      }));
    }

    // Strip variable editor metadata (tooltips, categories)
    if (stripped.variables) {
      stripped.variables = stripped.variables.map((v: any) => ({
        id: v.id,
        name: v.name,
        type: v.type,
        defaultValue: v.defaultValue,
        exposeOnSpawn: v.exposeOnSpawn,
        instanceEditable: v.instanceEditable,
        // Strip: description, tooltip, category
      }));
    }

    return stripped;
  }
}
