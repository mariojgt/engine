// ============================================================
//  EngineDeps — Dependency Injection Interface for Engine
//
//  Engine modules previously imported singletons directly from
//  editor modules (MeshAssetManager, TextureLibrary, etc.).
//  This interface abstracts those dependencies so the engine
//  can run standalone without any editor imports.
//
//  In editor Play mode: wired to real editor singletons.
//  In exported builds: wired to asset-source-backed adapters.
// ============================================================

// ────────────────────────────────────────────────────────────
//  Mesh/Material Dependencies
// ────────────────────────────────────────────────────────────

/** Minimal interface for mesh asset lookup (replaces MeshAssetManager) */
export interface IMeshAssetProvider {
  /** Get a mesh asset by ID */
  getAsset(id: string): any | null;
  /** Get a mesh asset by name */
  getAssetByName?(name: string): any | null;
  /** Get a material by ID */
  getMaterial?(id: string): any | null;
  /** Get a texture by ID */
  getTexture?(id: string): any | null;
  /** Get all animations for a mesh */
  getAnimationsForMesh?(meshAssetId: string): any[];
  /** All loaded mesh assets */
  readonly assets?: any[];
}

/** Function type for loading a mesh from a GLB asset */
export type LoadMeshFn = (asset: { glbDataBase64: string }) => Promise<{
  scene: any; // THREE.Group
  animations: any[]; // THREE.AnimationClip[]
}>;

/** Function type for building a Three.js material from an asset */
export type BuildMaterialFn = (matAsset: any, provider: IMeshAssetProvider) => any; // THREE.Material

// ────────────────────────────────────────────────────────────
//  Actor/Blueprint Dependencies
// ────────────────────────────────────────────────────────────

/** Minimal interface for actor asset lookup (replaces ActorAssetManager) */
export interface IActorAssetProvider {
  /** Get an actor asset by ID */
  getAsset(id: string): any | null;
  /** All loaded actor assets */
  readonly assets?: any[];
}

/** Minimal interface for animation blueprint lookup (replaces AnimBlueprintManager) */
export interface IAnimBlueprintProvider {
  /** Get an animation blueprint asset by ID */
  getAsset(id: string): any | null;
}

/** Minimal interface for AI asset lookup (replaces AIAssetManager) */
export interface IAIAssetProvider {
  /** Get a behavior tree by ID */
  getBehaviorTree?(id: string): any | null;
  /** Get a blackboard by ID */
  getBlackboard?(id: string): any | null;
}

// ────────────────────────────────────────────────────────────
//  Texture/Font Dependencies
// ────────────────────────────────────────────────────────────

/** Minimal interface for texture lookup (replaces TextureLibrary) */
export interface ITextureProvider {
  /** Get a texture asset by ID */
  getAsset?(assetId: string): any | null;
  /** Get an HTMLImageElement for a texture */
  getImage?(assetId: string): HTMLImageElement | null;
  /** Get a THREE.Texture for a texture */
  getThreeTexture?(assetId: string): any | null;
  /** Find texture by name */
  findByName?(name: string): any | null;
}

/** Minimal interface for font lookup (replaces FontLibrary) */
export interface IFontProvider {
  /** Get a font by name */
  getFont?(name: string): any | null;
  /** All available font names */
  getFontNames?(): string[];
  /** Get CSS font-face declarations */
  getFontFaceCSS?(): string;
}

// ────────────────────────────────────────────────────────────
//  Game Instance Dependencies
// ────────────────────────────────────────────────────────────

/** Minimal interface for game instance blueprint asset */
export interface IGameInstanceAsset {
  id: string;
  name: string;
  compiledCode: string;
  blueprintData?: any;
  eventGraph?: any;
}

/** Minimal interface for game instance manager */
export interface IGameInstanceManager {
  getAsset?(): IGameInstanceAsset | null;
  readonly assets?: IGameInstanceAsset[];
}

// ────────────────────────────────────────────────────────────
//  BlueprintData Dependencies
// ────────────────────────────────────────────────────────────

/** Minimal interface matching the BlueprintData class's shape */
export interface IBlueprintData {
  variables: any[];
  functions: any[];
  macros: any[];
  customEvents: any[];
  structs: any[];
  eventGraph: any;
  addVariable?(name: string, type: string): any;
  removeVariable?(id: string): void;
  getVariable?(id: string): any;
  getVariableByName?(name: string): any;
  addFunction?(name: string): any;
  removeFunction?(id: string): void;
  addCustomEvent?(name: string): any;
  removeCustomEvent?(id: string): void;
}

// ────────────────────────────────────────────────────────────
//  Project Manager Dependencies
// ────────────────────────────────────────────────────────────

/** Minimal interface for project manager (used by ScriptContext) */
export interface IProjectManager {
  /** Absolute path to the current project */
  readonly projectPath?: string;
  /** All available data tables */
  getDataTables?(): any[];
  /** Get a data table by name */
  getDataTable?(name: string): any | null;
  /** All available save game assets */
  getSaveGameAssets?(): any[];
  /** Get enumeration definitions */
  getEnumAssets?(): any[];
  /** Get event/delegate assets */
  getEventAssets?(): any[];
}

// ────────────────────────────────────────────────────────────
//  Combined Engine Dependencies
// ────────────────────────────────────────────────────────────

/**
 * All external dependencies that engine modules need.
 * Replaces direct singleton imports from editor modules.
 *
 * Set once at initialization time via `setEngineDeps()` —
 * by the editor for Play mode, by FeatherRuntime for exports.
 */
export interface EngineDeps {
  // Asset providers
  meshAssets: IMeshAssetProvider;
  actorAssets: IActorAssetProvider;
  animBlueprints: IAnimBlueprintProvider;
  aiAssets: IAIAssetProvider;
  textures: ITextureProvider;
  fonts: IFontProvider;

  // Functions
  loadMeshFromAsset: LoadMeshFn;
  buildMaterialFromAsset: BuildMaterialFn;

  // Game systems
  gameInstanceManager: IGameInstanceManager;
  projectManager: IProjectManager;
}

// ────────────────────────────────────────────────────────────
//  Global Accessor
// ────────────────────────────────────────────────────────────

let _engineDeps: EngineDeps | null = null;

/** Initialize engine dependencies. Must be called before any engine module runs. */
export function setEngineDeps(deps: EngineDeps): void {
  _engineDeps = deps;
}

/** Get current engine dependencies. Throws if not initialized. */
export function getEngineDeps(): EngineDeps {
  if (!_engineDeps) {
    throw new Error(
      '[EngineDeps] Dependencies not initialized. Call setEngineDeps() before using engine modules.',
    );
  }
  return _engineDeps;
}

/** Get current engine dependencies or null if not yet initialized. */
export function tryGetEngineDeps(): EngineDeps | null {
  return _engineDeps;
}

/** Reset engine dependencies (for testing or shutdown). */
export function resetEngineDeps(): void {
  _engineDeps = null;
}
