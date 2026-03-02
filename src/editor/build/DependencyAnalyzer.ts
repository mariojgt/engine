// ============================================================
//  DependencyAnalyzer — Asset Dependency Walker
//  Recursively finds every asset referenced by a set of scenes
//  and produces a complete BuildManifest for the cooking step.
//
//  Walk order:
//    Included scenes
//      → GameObjects in each scene
//        → Actor assets referenced by each GO
//          → Mesh/texture/material/anim assets on each actor
//            → (recursive until no new deps found)
// ============================================================

import type { SceneJSON, GameObjectJSON } from '../SceneSerializer';
import type { ActorAssetManager, ActorAsset } from '../ActorAsset';
import type { MeshAssetManager, MeshAsset } from '../MeshAsset';
import type { AnimBlueprintManager, AnimBlueprintAsset } from '../AnimBlueprintData';
import type { WidgetBlueprintManager } from '../WidgetBlueprintData';
import type { GameInstanceBlueprintManager } from '../GameInstanceData';
import type { SaveGameAssetManager } from '../SaveGameAsset';
import type { DataTableAssetManager } from '../DataTableAsset';
import type { EventAssetManager } from '../EventAsset';
import type { StructureAssetManager } from '../StructureAsset';
import type { AIAssetManager } from '../ai/AIAssetManager';
import type { TextureLibrary } from '../TextureLibrary';
import type { SoundLibrary } from '../SoundLibrary';

// ── Manifest types ────────────────────────────────────────────

export type AssetKind =
  | 'scene'
  | 'actor'
  | 'mesh'
  | 'texture'
  | 'material'
  | 'animation'
  | 'animBlueprint'
  | 'widgetBlueprint'
  | 'gameInstance'
  | 'saveGame'
  | 'structure'
  | 'enum'
  | 'dataTable'
  | 'event'
  | 'sound'
  | 'soundCue'
  | 'inputMapping'
  | 'behaviorTree'
  | 'blackboard'
  | 'btTask'
  | 'btDecorator'
  | 'btService'
  | 'aiController'
  | 'navmesh'
  | 'font'
  | 'projectConfig';

export interface ManifestEntry {
  id: string;
  kind: AssetKind;
  /** Relative path within project root */
  relativePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** Size in bytes (filled during cooking phase) */
  sizeBytes: number;
  /** SHA-256 hash of source file (for build cache) */
  sourceHash: string;
}

export interface BuildManifest {
  /** All scenes included in this build (in load order) */
  scenes: ManifestEntry[];
  /** All other unique assets required by those scenes */
  assets: ManifestEntry[];
  /** Validation issues found during analysis */
  issues: DependencyIssue[];
}

export interface DependencyIssue {
  severity: 'error' | 'warning';
  message: string;
  assetId?: string;
  assetKind?: AssetKind;
  sceneName?: string;
}

// ── Dependency analyzer context ───────────────────────────────

export interface DependencyAnalyzerContext {
  projectPath: string;
  actorManager: ActorAssetManager;
  meshManager: MeshAssetManager | null;
  animBPManager: AnimBlueprintManager | null;
  widgetBPManager: WidgetBlueprintManager | null;
  gameInstanceManager: GameInstanceBlueprintManager | null;
  saveGameManager: SaveGameAssetManager | null;
  dataTableManager: DataTableAssetManager | null;
  eventManager: EventAssetManager | null;
  structManager: StructureAssetManager | null;
  aiManager: AIAssetManager | null;
  textureLibrary: TextureLibrary | null;
  soundLibrary: SoundLibrary | null;
}

// ── Analyzer ─────────────────────────────────────────────────

export class DependencyAnalyzer {
  private _ctx: DependencyAnalyzerContext;
  private _walkSeen: Set<string> = new Set();
  private _manifestSeen: Set<string> = new Set();
  private _assets: ManifestEntry[] = [];
  private _issues: DependencyIssue[] = [];

  constructor(ctx: DependencyAnalyzerContext) {
    this._ctx = ctx;
  }

  /**
   * Analyze a set of scenes and return the complete BuildManifest.
   * @param includedScenes Array of scene names (without extension)
   * @param sceneDataMap   Map of sceneName → SceneJSON (already loaded)
   */
  analyze(
    includedScenes: string[],
    sceneDataMap: Map<string, SceneJSON>
  ): BuildManifest {
    this._walkSeen.clear();
    this._manifestSeen.clear();
    this._assets = [];
    this._issues = [];

    const sceneEntries: ManifestEntry[] = [];

    // Walk each included scene
    for (const sceneName of includedScenes) {
      const sceneData = sceneDataMap.get(sceneName);
      if (!sceneData) {
        this._issues.push({
          severity: 'error',
          message: `Scene "${sceneName}" is included in the build but could not be loaded`,
          sceneName,
        });
        continue;
      }

      const sceneEntry: ManifestEntry = {
        id: sceneName,
        kind: 'scene',
        relativePath: `Scenes/${sceneName}.json`,
        absolutePath: `${this._ctx.projectPath}/Scenes/${sceneName}.json`,
        sizeBytes: 0,
        sourceHash: '',
      };
      sceneEntries.push(sceneEntry);

      // Walk scene game objects
      for (const go of sceneData.gameObjects) {
        this._walkGameObject(go, sceneName);
      }

      // Walk 2D scene assets (tileset/spritesheet images)
      if ((sceneData as any).scene2DConfig) {
        this._walkScene2DConfig((sceneData as any).scene2DConfig, sceneName);
      }
    }

    // Always include the project config, navmesh, composition, and input mappings
    this._addOnce('__project_config__', 'projectConfig',
      'project.json', `${this._ctx.projectPath}/project.json`);
    this._addOnce('__navmesh__', 'navmesh',
      'Config/navmesh.bin', `${this._ctx.projectPath}/Config/navmesh.bin`);
    this._addOnce('__navmesh_config__', 'navmesh',
      'Config/navmesh_config.json', `${this._ctx.projectPath}/Config/navmesh_config.json`);
    this._addOnce('__composition__', 'projectConfig',
      'Config/composition.json', `${this._ctx.projectPath}/Config/composition.json`);
    this._addOnce('__input_mappings__', 'inputMapping',
      'InputMappings', `${this._ctx.projectPath}/InputMappings`);

    // Runtime loaders fetch many assets via _index.json files.
    // Always include indices so exported runtime can resolve referenced files.
    this._addOnce('__actors_index__', 'actor',
      'Actors/_index.json', `${this._ctx.projectPath}/Actors/_index.json`);
    this._addOnce('__meshes_index__', 'mesh',
      'Meshes/_index.json', `${this._ctx.projectPath}/Meshes/_index.json`);
    this._addOnce('__textures_index__', 'texture',
      'Textures/_index.json', `${this._ctx.projectPath}/Textures/_index.json`);
    this._addOnce('__sounds_index__', 'sound',
      'Sounds/_index.json', `${this._ctx.projectPath}/Sounds/_index.json`);
    this._addOnce('__sound_cues_index__', 'soundCue',
      'SoundCues/_index.json', `${this._ctx.projectPath}/SoundCues/_index.json`);
    this._addOnce('__animbp_index__', 'animBlueprint',
      'AnimBlueprints/_index.json', `${this._ctx.projectPath}/AnimBlueprints/_index.json`);
    this._addOnce('__widgets_index__', 'widgetBlueprint',
      'Widgets/_index.json', `${this._ctx.projectPath}/Widgets/_index.json`);
    this._addOnce('__game_instances_index__', 'gameInstance',
      'GameInstances/_index.json', `${this._ctx.projectPath}/GameInstances/_index.json`);
    this._addOnce('__save_game_index__', 'saveGame',
      'SaveGameClasses/_index.json', `${this._ctx.projectPath}/SaveGameClasses/_index.json`);
    this._addOnce('__data_tables_index__', 'dataTable',
      'DataTables/_index.json', `${this._ctx.projectPath}/DataTables/_index.json`);
    this._addOnce('__events_index__', 'event',
      'Events/_index.json', `${this._ctx.projectPath}/Events/_index.json`);
    this._addOnce('__structures_index__', 'structure',
      'Structures/_index.json', `${this._ctx.projectPath}/Structures/_index.json`);
    this._addOnce('__enums_index__', 'enum',
      'Enums/_index.json', `${this._ctx.projectPath}/Enums/_index.json`);
    this._addOnce('__ai_assets__', 'aiController',
      'AI/ai_assets.json', `${this._ctx.projectPath}/AI/ai_assets.json`);

    // Include ALL structures/enums (needed for blueprint type system at runtime)
    this._walkAllStructures();

    // Include Game Instance blueprint (always needed at runtime)
    this._walkAllGameInstances();

    // Include all save game classes (needed for SaveGame nodes)
    this._walkAllSaveGameClasses();

    // Include all events (needed for EventBus nodes)
    this._walkAllEvents();

    // Include all data tables referenced by blueprints
    this._walkAllDataTables();

    return {
      scenes: sceneEntries,
      assets: this._assets,
      issues: this._issues,
    };
  }

  private _safeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private _namedJsonFile(name: string | undefined, id: string): string {
    const base = this._safeName(name?.trim() ? name : id);
    return `${base}_${id}.json`;
  }

  // ── Private walk methods ─────────────────────────────────────

  private _walkGameObject(go: GameObjectJSON, sceneName: string): void {
    // Actor asset
    if (go.actorAssetId) {
      this._walkActorAsset(go.actorAssetId, sceneName);
    }

    // Standalone blueprint data in the GO
    if (go.blueprintData) {
      this._walkBlueprintData(go.blueprintData, sceneName);
    }

    // Mesh asset
    if (go.customMeshAssetId) {
      this._walkMeshAsset(go.customMeshAssetId, sceneName);
    }

    // Sprite sheet
    if (go.spriteSheetId) {
      this._addTextureById(go.spriteSheetId, sceneName);
    }

    // Controller blueprint
    if (go.controllerBlueprintId) {
      this._walkActorAsset(go.controllerBlueprintId, sceneName);
    }
  }

  private _walkActorAsset(actorAssetId: string, sceneName: string): void {
    if (this._walkSeen.has(`actor:${actorAssetId}`)) return;
    this._walkSeen.add(`actor:${actorAssetId}`);

    const asset = this._ctx.actorManager.getAsset(actorAssetId);
    if (!asset) {
      this._issues.push({
        severity: 'error',
        message: `Actor asset "${actorAssetId}" is referenced in scene "${sceneName}" but does not exist`,
        assetId: actorAssetId,
        assetKind: 'actor',
        sceneName,
      });
      return;
    }

    // Actor files are named <Name>_<Id>.json on disk (e.g. BP_CharacterPawn_actor_1_mm8wowws.json)
    const assetName = (asset as any).name ?? (asset as any).actorName ?? actorAssetId;
    const actorFileName = this._namedJsonFile(assetName, actorAssetId);

    this._addOnce(`actor:${actorAssetId}`, 'actor',
      `Actors/${actorFileName}`,
      `${this._ctx.projectPath}/Actors/${actorFileName}`);

    // Walk actor components for asset references
    const json = asset.toJSON ? asset.toJSON() : (asset as any);
    this._walkBlueprintData(json.blueprintData, sceneName);

    if (json.components) {
      for (const comp of json.components) {
        if (comp.meshAssetId) this._walkMeshAsset(comp.meshAssetId, sceneName);
        if (comp.textureId) this._addTextureById(comp.textureId, sceneName);
        if (comp.animBlueprintId) this._walkAnimBlueprint(comp.animBlueprintId, sceneName);
        if (comp.spriteSheetId) this._addTextureById(comp.spriteSheetId, sceneName);
        if (comp.soundAssetId) this._walkSoundAsset(comp.soundAssetId, sceneName);
        if (comp.widgetBlueprintId) this._walkWidgetBlueprint(comp.widgetBlueprintId, sceneName);
      }
    }

    // Walk parent class hierarchy
    if (json.parentClassId) {
      this._walkActorAsset(json.parentClassId, sceneName);
    }
  }

  private _walkBlueprintData(bpData: any, sceneName: string): void {
    if (!bpData) return;
    // Walk compiled code for references — patterns we look for:
    //   assetId: "...", meshAssetId: "...", textureId: "...", soundId: "..."
    // This is a best-effort scan of the compiled JS code
    const code: string = bpData.compiledCode || '';
    if (code) {
      this._scanCodeForAssetRefs(code, sceneName);
    }
    // Walk event graph nodeData for explicit asset picker node values
    if (bpData.eventGraph?.nodeData?.nodes) {
      this._scanNodeDataForAssetRefs(bpData.eventGraph.nodeData.nodes, sceneName);
    }
    if (bpData.functions) {
      for (const fn of bpData.functions) {
        if (fn.graph?.nodeData?.nodes) {
          this._scanNodeDataForAssetRefs(fn.graph.nodeData.nodes, sceneName);
        }
      }
    }
  }

  private _walkMeshAsset(meshAssetId: string, sceneName: string): void {
    if (this._walkSeen.has(`mesh:${meshAssetId}`)) return;
    this._walkSeen.add(`mesh:${meshAssetId}`);

    const asset = this._ctx.meshManager?.getAsset(meshAssetId);
    if (!asset) {
      this._issues.push({
        severity: 'warning',
        message: `Mesh asset "${meshAssetId}" referenced in scene "${sceneName}" but not found`,
        assetId: meshAssetId,
        assetKind: 'mesh',
        sceneName,
      });
      return;
    }

    // Mesh bundles are saved as Meshes/<safeName>_<id>.json (bundle with materials/textures/animations)
    const assetName = (asset as any).name ?? meshAssetId;
    const meshFileName = this._namedJsonFile(assetName, meshAssetId);

    this._addOnce(`mesh:${meshAssetId}`, 'mesh',
      `Meshes/${meshFileName}`,
      `${this._ctx.projectPath}/Meshes/${meshFileName}`);

    // Include the mesh index file (used by runtime to discover available mesh assets)
    this._addOnce('__mesh_index__', 'mesh',
      'Meshes/_index.json',
      `${this._ctx.projectPath}/Meshes/_index.json`);

    // Include standalone materials index (materials not tied to any mesh asset)
    this._addOnce('__standalone_materials__', 'material',
      'Meshes/_standalone_materials.json',
      `${this._ctx.projectPath}/Meshes/_standalone_materials.json`);

    // Materials, textures, and animations are embedded in the mesh bundle file.
    // Walk material texture references from the in-memory MeshAsset object
    // (not the serialized JSON which only has string IDs).
    const meshAssetObj = asset as any;
    if (meshAssetObj.materials && Array.isArray(meshAssetObj.materials)) {
      for (const matAsset of meshAssetObj.materials) {
        // matAsset is MaterialAssetJSON when accessed from MeshAsset object
        const matData = matAsset.materialData;
        if (matData) {
          // Walk texture references in material data for the TextureLibrary textures
          const texSlots = [
            matData.baseColorMap, matData.normalMap, matData.metallicRoughnessMap,
            matData.roughnessMap, matData.emissiveMap, matData.occlusionMap,
            matData.displacementMap, matData.clearcoatNormalMap, matData.sheenColorMap,
            matData.anisotropyMap, matData.iridescenceMap, matData.transmissionMap,
            matData.thicknessMap,
          ];
          for (const texId of texSlots) {
            if (texId) this._addTextureById(texId, sceneName);
          }
        }
      }
    }
  }

  private _walkAnimBlueprint(animBPId: string, sceneName: string): void {
    if (this._walkSeen.has(`animBP:${animBPId}`)) return;
    this._walkSeen.add(`animBP:${animBPId}`);

    const asset = this._ctx.animBPManager?.getAsset(animBPId);
    if (!asset) {
      this._issues.push({
        severity: 'warning',
        message: `AnimBlueprint "${animBPId}" referenced in scene "${sceneName}" but not found`,
        assetId: animBPId,
        assetKind: 'animBlueprint',
        sceneName,
      });
      return;
    }

    const fileName = this._namedJsonFile(
      (asset as any).animBlueprintName ?? (asset as any).name ?? animBPId,
      (asset as any).animBlueprintId ?? (asset as any).id ?? animBPId,
    );
    this._addOnce(`animBP:${animBPId}`, 'animBlueprint',
      `AnimBlueprints/${fileName}`,
      `${this._ctx.projectPath}/AnimBlueprints/${fileName}`);
  }

  private _walkWidgetBlueprint(widgetBPId: string, sceneName: string): void {
    if (this._walkSeen.has(`widget:${widgetBPId}`)) return;
    this._walkSeen.add(`widget:${widgetBPId}`);

    const asset = this._ctx.widgetBPManager?.getAsset(widgetBPId);
    if (!asset) {
      this._issues.push({
        severity: 'warning',
        message: `WidgetBlueprint "${widgetBPId}" referenced in scene "${sceneName}" but not found`,
        assetId: widgetBPId,
        assetKind: 'widgetBlueprint',
        sceneName,
      });
      return;
    }

    const fileName = this._namedJsonFile(
      (asset as any).widgetBlueprintName ?? (asset as any).name ?? widgetBPId,
      (asset as any).widgetBlueprintId ?? (asset as any).id ?? widgetBPId,
    );
    this._addOnce(`widget:${widgetBPId}`, 'widgetBlueprint',
      `Widgets/${fileName}`,
      `${this._ctx.projectPath}/Widgets/${fileName}`);
  }

  private _addTextureById(textureId: string, sceneName: string): void {
    if (!textureId || this._walkSeen.has(`texture:${textureId}`)) return;
    this._walkSeen.add(`texture:${textureId}`);

    const lib = this._ctx.textureLibrary;
    const tex = lib ? (lib as any).getAsset?.(textureId) : null;

    const textureFileName = this._namedJsonFile(
      (tex as any)?.assetName ?? textureId,
      (tex as any)?.assetId ?? textureId,
    );

    this._addOnce(`texture:${textureId}`, 'texture',
      `Textures/${textureFileName}`,
      `${this._ctx.projectPath}/Textures/${textureFileName}`);

    // Also add the actual image file
    if (tex) {
      const filePath: string = (tex as any).filePath || (tex as any).fileUrl || '';
      if (filePath && !filePath.startsWith('blob:') && !filePath.startsWith('data:')) {
        this._addOnce(`texturefile:${textureId}`, 'texture',
          filePath.replace(this._ctx.projectPath + '/', ''),
          filePath);
      }
    }
  }

  private _walkSoundAsset(soundId: string, sceneName: string): void {
    if (!soundId || this._walkSeen.has(`sound:${soundId}`)) return;
    this._walkSeen.add(`sound:${soundId}`);

    const snd = this._ctx.soundLibrary ? (this._ctx.soundLibrary as any).getSound?.(soundId) : null;
    const soundFileName = this._namedJsonFile(
      (snd as any)?.assetName ?? soundId,
      (snd as any)?.assetId ?? soundId,
    );

    this._addOnce(`sound:${soundId}`, 'sound',
      `Sounds/${soundFileName}`,
      `${this._ctx.projectPath}/Sounds/${soundFileName}`);
  }

  private _walkAllStructures(): void {
    try {
      const structs = (this._ctx.structManager as any).getAllStructures?.() ?? [];
      for (const s of structs) {
        const id = s.id ?? s.structureId;
        const name = s.name ?? s.structureName ?? id;
        this._addOnce(`struct:${id}`, 'structure',
          `Structures/${this._namedJsonFile(name, id)}`,
          `${this._ctx.projectPath}/Structures/${this._namedJsonFile(name, id)}`);
      }
      const enums = (this._ctx.structManager as any).getAllEnums?.() ?? [];
      for (const e of enums) {
        const id = e.id ?? e.enumId;
        const name = e.name ?? e.enumName ?? id;
        this._addOnce(`enum:${id}`, 'enum',
          `Enums/${this._namedJsonFile(name, id)}`,
          `${this._ctx.projectPath}/Enums/${this._namedJsonFile(name, id)}`);
      }
    } catch {
      // Manager may not have getAllStructures if not wired — safe to skip
    }
  }

  private _walkAllGameInstances(): void {
    try {
      const assets = (this._ctx.gameInstanceManager as any).getAll?.() ?? [];
      for (const gi of assets) {
        const id = gi.id ?? gi.gameInstanceId;
        const name = gi.name ?? gi.gameInstanceName ?? id;
        this._addOnce(`gi:${id}`, 'gameInstance',
          `GameInstances/${this._namedJsonFile(name, id)}`,
          `${this._ctx.projectPath}/GameInstances/${this._namedJsonFile(name, id)}`);
      }
    } catch { /* noop */ }
  }

  private _walkAllSaveGameClasses(): void {
    try {
      const assets = (this._ctx.saveGameManager as any).getAll?.() ?? [];
      for (const sg of assets) {
        const id = sg.id ?? sg.saveGameId;
        const name = sg.name ?? sg.saveGameName ?? id;
        this._addOnce(`sg:${id}`, 'saveGame',
          `SaveGameClasses/${this._namedJsonFile(name, id)}`,
          `${this._ctx.projectPath}/SaveGameClasses/${this._namedJsonFile(name, id)}`);
      }
    } catch { /* noop */ }
  }

  private _walkAllEvents(): void {
    try {
      const assets = (this._ctx.eventManager as any).getAll?.() ?? [];
      for (const ev of assets) {
        const id = ev.id;
        const name = ev.name ?? id;
        this._addOnce(`ev:${id}`, 'event',
          `Events/${this._namedJsonFile(name, id)}`,
          `${this._ctx.projectPath}/Events/${this._namedJsonFile(name, id)}`);
      }
    } catch { /* noop */ }
  }

  private _walkAllDataTables(): void {
    try {
      const assets = (this._ctx.dataTableManager as any).getAll?.() ?? [];
      for (const dt of assets) {
        const id = dt.id ?? dt.dataTableId;
        const name = dt.name ?? dt.dataTableName ?? id;
        this._addOnce(`dt:${id}`, 'dataTable',
          `DataTables/${this._namedJsonFile(name, id)}`,
          `${this._ctx.projectPath}/DataTables/${this._namedJsonFile(name, id)}`);
      }
    } catch { /* noop */ }
  }

  private _scanCodeForAssetRefs(code: string, sceneName: string): void {
    // Scan known asset ID patterns in compiled blueprint code
    const patterns = [
      { prefix: 'actorAssetId', kind: 'actor' as AssetKind },
      { prefix: 'meshAssetId', kind: 'mesh' as AssetKind },
      { prefix: 'textureId', kind: 'texture' as AssetKind },
      { prefix: 'soundId', kind: 'sound' as AssetKind },
      { prefix: 'widgetBlueprintId', kind: 'widgetBlueprint' as AssetKind },
      { prefix: 'animBlueprintId', kind: 'animBlueprint' as AssetKind },
      { prefix: 'dataTableId', kind: 'dataTable' as AssetKind },
    ];

    for (const { prefix, kind } of patterns) {
      const regex = new RegExp(`["']${prefix}["']\\s*:\\s*["']([^"']+)["']`, 'g');
      let m: RegExpExecArray | null;
      while ((m = regex.exec(code)) !== null) {
        const id = m[1];
        switch (kind) {
          case 'actor': this._walkActorAsset(id, sceneName); break;
          case 'mesh': this._walkMeshAsset(id, sceneName); break;
          case 'texture': this._addTextureById(id, sceneName); break;
          case 'sound': this._walkSoundAsset(id, sceneName); break;
          case 'widgetBlueprint': this._walkWidgetBlueprint(id, sceneName); break;
          case 'animBlueprint': this._walkAnimBlueprint(id, sceneName); break;
        }
      }
    }
  }

  private _scanNodeDataForAssetRefs(nodes: any, sceneName: string): void {
    if (!nodes) return;
    for (const node of Object.values(nodes) as any[]) {
      const controls = node.inputs || {};
      for (const [key, input] of Object.entries(controls) as any[]) {
        const val = input?.connections?.[0]?.data ?? input?.data ?? null;
        if (typeof val === 'string' && val.length > 8) {
          // Heuristic: long string values in nodes are likely asset IDs
          if (key === 'actorClass' || key === 'actorAssetId') this._walkActorAsset(val, sceneName);
          if (key === 'meshAssetId') this._walkMeshAsset(val, sceneName);
          if (key === 'textureId') this._addTextureById(val, sceneName);
          if (key === 'soundId') this._walkSoundAsset(val, sceneName);
          if (key === 'widgetBlueprintId') this._walkWidgetBlueprint(val, sceneName);
        }
      }
    }
  }

  /**
   * Walk 2D scene config assets — tileset images and spritesheet images.
   * These are stored as PNG files in the project's Textures/ folder and
   * referenced by imagePath in the scene2DConfig.
   */
  private _walkScene2DConfig(config2D: any, sceneName: string): void {
    // Tileset images
    if (config2D.tilesets && Array.isArray(config2D.tilesets)) {
      for (const ts of config2D.tilesets) {
        if (ts.imagePath) {
          const key = `tileset_img:${ts.assetId}`;
          this._addOnce(key, 'texture',
            ts.imagePath,
            `${this._ctx.projectPath}/${ts.imagePath}`);
        }
      }
    }

    // Sprite sheet images
    if (config2D.spriteSheets && Array.isArray(config2D.spriteSheets)) {
      for (const ss of config2D.spriteSheets) {
        if (ss.imagePath) {
          const key = `spritesheet_img:${ss.assetId}`;
          this._addOnce(key, 'texture',
            ss.imagePath,
            `${this._ctx.projectPath}/${ss.imagePath}`);
        }
      }
    }
  }

  private _addOnce(
    uniqueKey: string,
    kind: AssetKind,
    relativePath: string,
    absolutePath: string
  ): void {
    if (this._manifestSeen.has(uniqueKey)) return;
    this._manifestSeen.add(uniqueKey);
    this._assets.push({
      id: uniqueKey,
      kind,
      relativePath,
      absolutePath,
      sizeBytes: 0,
      sourceHash: '',
    });
  }
}
