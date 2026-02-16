// ============================================================
//  MeshAsset — Asset types for imported 3D meshes
//  Supports static meshes, skeletal meshes, skeletons,
//  animations, materials, textures, LODs, and collision.
//  All data is JSON-serializable for project persistence.
//  Designed to mirror Unreal Engine's import pipeline,
//  optimized for Three.js best practices.
// ============================================================

// ── Enums & Literals ──

export type MeshAssetType = 'staticMesh' | 'skeletalMesh';
export type ImportMeshFormat = 'gltf' | 'glb' | 'fbx' | 'obj' | 'dae' | 'stl' | 'ply';

/** All file extensions we can import */
export const IMPORTABLE_EXTENSIONS = [
  '.gltf', '.glb', '.fbx', '.obj', '.dae', '.stl', '.ply',
] as const;

export type ImportableExtension = typeof IMPORTABLE_EXTENSIONS[number];

export function isImportableFile(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return (IMPORTABLE_EXTENSIONS as readonly string[]).includes(ext);
}

export function getImportFormat(filename: string): ImportMeshFormat {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.gltf': return 'gltf';
    case '.glb':  return 'glb';
    case '.fbx':  return 'fbx';
    case '.obj':  return 'obj';
    case '.dae':  return 'dae';
    case '.stl':  return 'stl';
    case '.ply':  return 'ply';
    default: return 'gltf';
  }
}

// ── Bounding Box ──

export interface BoundingBoxData {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

// ── Import Presets ──

export type ImportPreset = 'character' | 'prop' | 'environment' | 'simple' | 'custom';

// ── Normals Mode ──

export type NormalsMode = 'useExisting' | 'recomputeFlat' | 'recomputeSmooth' | 'weightedByArea';

// ── Material Workflow ──

export type MaterialWorkflow = 'pbrMetallicRoughness' | 'pbrSpecularGlossiness' | 'legacy';
export type MaterialType = 'MeshStandardMaterial' | 'MeshPhysicalMaterial' | 'MeshBasicMaterial' | 'MeshLambertMaterial';

// ── Texture Settings ──

export type TextureResolution = 'original' | '4096' | '2048' | '1024' | '512' | '256';
export type TextureFilter = 'Nearest' | 'Linear' | 'LinearMipmapLinear' | 'LinearMipmapNearest';
export type TextureWrap = 'Repeat' | 'ClampToEdge' | 'MirroredRepeat';

// ── LOD Settings ──

export type LODAlgorithm = 'quadricError' | 'edgeCollapse' | 'vertexClustering';
export type LODStrategy = 'screenSize' | 'distance' | 'manual';

export interface LODLevelSettings {
  level: number;
  reductionPercent: number;   // 0-1, e.g. 0.5 = 50% of previous LOD
  screenSize: number;         // 0-1, screen percentage
  maxDeviation: number;       // maximum geometric error
}

export interface LODSettings {
  generateLODs: boolean;
  lodCount: number;           // 1-4
  strategy: LODStrategy;
  algorithm: LODAlgorithm;
  preserveBoundaries: boolean;
  preserveUVs: boolean;
  preserveNormals: boolean;
  levels: LODLevelSettings[];
}

// ── Collision Settings ──

export type CollisionType = 'box' | 'sphere' | 'capsule' | 'convexHull' | 'autoConvex' | 'none';
export type CollisionComplexity = 'simple' | 'complex' | 'useMesh';

export interface CollisionSettings {
  generateCollision: boolean;
  complexity: CollisionComplexity;
  collisionType: CollisionType;
  maxConvexHulls: number;
  maxHullVertices: number;
  concavity: number;
  resolution: number;
  simulatePhysics: boolean;
}

// ── Socket Settings ──

export interface SocketDefinition {
  name: string;
  boneName: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

export interface SocketSettings {
  autoDetectSockets: boolean;
  createFromBoneNames: boolean;
  customSockets: SocketDefinition[];
}

// ── Animation Settings ──

export type AnimSampleRate = 24 | 30 | 60 | 'original';
export type AnimCompression = 'none' | 'low' | 'medium' | 'high';

export interface AnimationImportSettings {
  importAnimations: boolean;
  importMode: 'all' | 'selected' | 'separateFiles';
  sampleRate: AnimSampleRate;
  resample: boolean;
  removeRedundantKeys: boolean;
  redundantKeyTolerance: number;
  enableRootMotion: boolean;
  lockRootRotation: boolean;
  lockRootHeight: boolean;
  compression: AnimCompression;
  maxError: number;
  splitByName: boolean;
  /** Per-animation overrides: animName → { import, loop } */
  animationOverrides: Record<string, { import: boolean; loop: boolean }>;
}

// ── Validation Settings ──

export interface ValidationSettings {
  checkErrors: boolean;
  warnLargeFileSize: boolean;
  fileSizeThreshold: number;           // bytes
  warnHighPolyCount: boolean;
  polyCountThreshold: number;
  validateSkeletonHierarchy: boolean;
}

// ── Target Platform ──

export type TargetPlatform = 'web' | 'desktop' | 'mobile';
export type OptimizationLevel = 'none' | 'low' | 'medium' | 'high';

// ── Import Settings (Enhanced) ──

export interface MeshImportSettings {
  // ── General ──
  importAs: 'auto' | 'staticMesh' | 'skeletalMesh';
  assetName: string;
  prefix: string;                      // e.g. 'SK_', 'SM_'
  suffix: string;
  autoGenerateSubNames: boolean;
  scale: number;
  unit: 'meters' | 'centimeters' | 'millimeters';
  convertToYUp: boolean;
  forwardAxis: 'X' | 'Y' | 'Z';
  upAxis: 'X' | 'Y' | 'Z';
  openAfterImport: boolean;
  generateThumbnails: boolean;
  suggestedPreset: ImportPreset;

  // ── Mesh ──
  importMesh: boolean;
  combineMeshes: boolean;
  splitByMaterials: boolean;
  weldVertices: boolean;
  weldThreshold: number;
  removeDegenerateTriangles: boolean;
  optimizeVertexOrder: boolean;
  normalsMode: NormalsMode;
  importTangents: boolean;
  recomputeTangents: boolean;
  importUVs: boolean;
  generateLightmapUVs: boolean;
  lightmapResolution: number;
  importVertexColors: boolean;
  targetPlatform: TargetPlatform;
  useDracoCompression: boolean;
  dracoCompressionLevel: number;       // 0-10

  // ── Skeleton ──
  importSkeleton: boolean;
  createNewSkeleton: boolean;
  existingSkeletonId: string | null;
  maxBoneInfluences: number;           // 4 or 8
  boneWeightThreshold: number;
  normalizeBoneWeights: boolean;
  removeEndBones: boolean;
  convertBoneNames: boolean;

  // ── Sockets ──
  sockets: SocketSettings;

  // ── Animations ──
  animation: AnimationImportSettings;

  // ── Materials ──
  importMaterials: boolean;
  importTextures: boolean;
  materialWorkflow: MaterialWorkflow;
  materialType: MaterialType;
  textureResolution: TextureResolution;
  generateMipmaps: boolean;
  compressTextures: boolean;
  convertPowerOfTwo: boolean;
  textureMinFilter: TextureFilter;
  textureMagFilter: TextureFilter;
  textureWrapS: TextureWrap;
  textureWrapT: TextureWrap;
  createMaterialInstances: boolean;

  // ── LODs ──
  lod: LODSettings;

  // ── Collision ──
  collision: CollisionSettings;

  // ── Advanced ──
  preserveHierarchy: boolean;
  importMetadata: boolean;
  importMorphTargets: boolean;
  validation: ValidationSettings;
  optimizationLevel: OptimizationLevel;
  /** Position offset to apply */
  positionOffset: { x: number; y: number; z: number };
  /** Rotation offset in degrees */
  rotationOffset: { x: number; y: number; z: number };
  verboseLogging: boolean;
  generateImportReport: boolean;
}

/** Suggest a prefix based on asset type */
export function suggestPrefix(importAs: 'auto' | 'staticMesh' | 'skeletalMesh', hasSkeleton: boolean): string {
  if (importAs === 'skeletalMesh' || (importAs === 'auto' && hasSkeleton)) return 'SK_';
  return 'SM_';
}

/** Suggest a preset based on file content analysis */
export function suggestPreset(info: { hasSkeleton: boolean; animCount: number; vertexCount: number }): ImportPreset {
  if (info.hasSkeleton && info.animCount > 0) return 'character';
  if (info.vertexCount > 50000) return 'environment';
  if (info.vertexCount < 500) return 'simple';
  return 'prop';
}

export function defaultImportSettings(filename: string): MeshImportSettings {
  const name = filename.replace(/\.[^.]+$/, ''); // strip extension
  return {
    // General
    importAs: 'auto',
    assetName: name,
    prefix: '',
    suffix: '',
    autoGenerateSubNames: true,
    scale: 1.0,
    unit: 'meters',
    convertToYUp: false,
    forwardAxis: 'Y',
    upAxis: 'Z',
    openAfterImport: true,
    generateThumbnails: true,
    suggestedPreset: 'custom',

    // Mesh
    importMesh: true,
    combineMeshes: false,
    splitByMaterials: false,
    weldVertices: true,
    weldThreshold: 0.0001,
    removeDegenerateTriangles: true,
    optimizeVertexOrder: true,
    normalsMode: 'useExisting',
    importTangents: true,
    recomputeTangents: false,
    importUVs: true,
    generateLightmapUVs: false,
    lightmapResolution: 512,
    importVertexColors: true,
    targetPlatform: 'web',
    useDracoCompression: false,
    dracoCompressionLevel: 7,

    // Skeleton
    importSkeleton: true,
    createNewSkeleton: true,
    existingSkeletonId: null,
    maxBoneInfluences: 4,
    boneWeightThreshold: 0.01,
    normalizeBoneWeights: true,
    removeEndBones: false,
    convertBoneNames: true,

    // Sockets
    sockets: {
      autoDetectSockets: true,
      createFromBoneNames: true,
      customSockets: [],
    },

    // Animations
    animation: {
      importAnimations: true,
      importMode: 'all',
      sampleRate: 30,
      resample: true,
      removeRedundantKeys: true,
      redundantKeyTolerance: 0.001,
      enableRootMotion: false,
      lockRootRotation: false,
      lockRootHeight: false,
      compression: 'medium',
      maxError: 0.01,
      splitByName: true,
      animationOverrides: {},
    },

    // Materials
    importMaterials: true,
    importTextures: true,
    materialWorkflow: 'pbrMetallicRoughness',
    materialType: 'MeshStandardMaterial',
    textureResolution: 'original',
    generateMipmaps: true,
    compressTextures: false,
    convertPowerOfTwo: true,
    textureMinFilter: 'LinearMipmapLinear',
    textureMagFilter: 'Linear',
    textureWrapS: 'Repeat',
    textureWrapT: 'Repeat',
    createMaterialInstances: true,

    // LODs
    lod: {
      generateLODs: false,
      lodCount: 3,
      strategy: 'screenSize',
      algorithm: 'quadricError',
      preserveBoundaries: true,
      preserveUVs: true,
      preserveNormals: true,
      levels: [
        { level: 1, reductionPercent: 0.5, screenSize: 0.5, maxDeviation: 1.0 },
        { level: 2, reductionPercent: 0.5, screenSize: 0.25, maxDeviation: 2.0 },
        { level: 3, reductionPercent: 0.5, screenSize: 0.125, maxDeviation: 4.0 },
      ],
    },

    // Collision
    collision: {
      generateCollision: false,
      complexity: 'simple',
      collisionType: 'autoConvex',
      maxConvexHulls: 4,
      maxHullVertices: 32,
      concavity: 0.001,
      resolution: 100000,
      simulatePhysics: false,
    },

    // Advanced
    preserveHierarchy: true,
    importMetadata: true,
    importMorphTargets: true,
    validation: {
      checkErrors: true,
      warnLargeFileSize: true,
      fileSizeThreshold: 50 * 1024 * 1024, // 50 MB
      warnHighPolyCount: true,
      polyCountThreshold: 100000,
      validateSkeletonHierarchy: true,
    },
    optimizationLevel: 'medium',
    positionOffset: { x: 0, y: 0, z: 0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
    verboseLogging: false,
    generateImportReport: false,
  };
}

/** Apply a named preset to settings */
export function applyPreset(settings: MeshImportSettings, preset: ImportPreset): void {
  settings.suggestedPreset = preset;
  switch (preset) {
    case 'character':
      settings.importAs = 'skeletalMesh';
      settings.prefix = 'SK_';
      settings.importSkeleton = true;
      settings.animation.importAnimations = true;
      settings.sockets.autoDetectSockets = true;
      settings.lod.generateLODs = true;
      settings.lod.lodCount = 2;
      settings.collision.generateCollision = true;
      settings.collision.collisionType = 'capsule';
      settings.maxBoneInfluences = 4;
      break;
    case 'prop':
      settings.importAs = 'staticMesh';
      settings.prefix = 'SM_';
      settings.importSkeleton = false;
      settings.animation.importAnimations = false;
      settings.lod.generateLODs = true;
      settings.lod.lodCount = 3;
      settings.collision.generateCollision = true;
      settings.collision.collisionType = 'autoConvex';
      break;
    case 'environment':
      settings.importAs = 'staticMesh';
      settings.prefix = 'SM_';
      settings.importSkeleton = false;
      settings.animation.importAnimations = false;
      settings.lod.generateLODs = true;
      settings.lod.lodCount = 3;
      settings.collision.generateCollision = true;
      settings.collision.collisionType = 'autoConvex';
      settings.collision.maxConvexHulls = 8;
      settings.optimizationLevel = 'high';
      break;
    case 'simple':
      settings.importAs = 'staticMesh';
      settings.prefix = 'SM_';
      settings.importSkeleton = false;
      settings.animation.importAnimations = false;
      settings.lod.generateLODs = false;
      settings.collision.generateCollision = true;
      settings.collision.collisionType = 'convexHull';
      settings.optimizationLevel = 'low';
      break;
  }
}

// ── Mesh Data ──

export interface MeshDataJSON {
  format: ImportMeshFormat;
  vertexCount: number;
  triangleCount: number;
  boundingBox: BoundingBoxData;
  hasUVs: boolean;
  hasNormals: boolean;
  hasTangents: boolean;
  hasVertexColors: boolean;
  hasSkin: boolean;
  morphTargets: string[];
}

// ── LOD Data ──

export interface LODDataJSON {
  level: number;
  vertexCount: number;
  triangleCount: number;
  reductionPercent: number;
  screenSize: number;
  /** Base64-encoded GLB for this LOD level */
  glbDataBase64: string;
}

// ── Collision Data ──

export interface CollisionHullData {
  type: CollisionType;
  vertexCount: number;
  /** Serialized vertices: [x,y,z, x,y,z, ...] */
  vertices: number[];
  /** Serialized indices (triangles): [i0,i1,i2, ...] */
  indices: number[];
  /** Center of the hull */
  center: { x: number; y: number; z: number };
  /** Half-extents (for box) or radius (for sphere/capsule) */
  halfExtents?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
}

export interface CollisionDataJSON {
  hulls: CollisionHullData[];
  hullCount: number;
  collisionType: CollisionType;
}

// ── Bone/Skeleton ──

export interface BoneData {
  name: string;
  parentIndex: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

export interface SkeletonAssetJSON {
  assetId: string;
  assetName: string;
  bones: BoneData[];
  boneCount: number;
  sockets?: SocketDefinition[];
}

// ── Animation ──

export interface AnimationTrackData {
  boneName: string;
  type: 'position' | 'rotation' | 'scale';
  /** Flat array of key times */
  times: number[];
  /** Flat array of values (3 per position/scale keyframe, 4 per rotation keyframe) */
  values: number[];
}

export interface AnimationAssetJSON {
  assetId: string;
  assetName: string;
  /** The parent mesh asset this animation belongs to */
  meshAssetId: string;
  skeletonId: string | null;
  duration: number;
  /** Estimated FPS from track data */
  fps: number;
  loop: boolean;
  tracks: AnimationTrackData[];
}

// ── Material ──

export interface MaterialAssetJSON {
  assetId: string;
  assetName: string;
  meshAssetId: string;
  materialData: {
    type: 'PBR' | 'Basic' | 'Phong';
    baseColor: string; // hex
    metalness: number;
    roughness: number;
    emissive: string;
    emissiveIntensity: number;
    opacity: number;
    doubleSided: boolean;
    alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
    // Texture asset references
    baseColorMap: string | null;
    normalMap: string | null;
    metallicRoughnessMap: string | null;
    emissiveMap: string | null;
    occlusionMap: string | null;
  };
}

// ── Texture ──

export interface TextureAssetJSON {
  assetId: string;
  assetName: string;
  meshAssetId: string;
  /** Base64-encoded image data (PNG/JPEG) */
  dataUrl: string;
  textureData: {
    width: number;
    height: number;
    format: string;
  };
}

// ── Import Report ──

export interface ImportReportJSON {
  success: boolean;
  importDate: string;
  duration: number;           // ms
  warnings: string[];
  errors: string[];
  stats: {
    fileSize: number;
    vertexCount: number;
    triangleCount: number;
    boneCount: number;
    animationCount: number;
    materialCount: number;
    textureCount: number;
    lodCount: number;
    collisionHulls: number;
    socketCount: number;
  };
}

// ── File Detection Result ──

export interface FileDetectionResult {
  fileType: ImportMeshFormat;
  fileSize: number;
  complexity: {
    meshCount: number;
    vertexCount: number;
    triangleCount: number;
    boneCount: number;
    animationCount: number;
    materialCount: number;
    textureCount: number;
  };
  hasSkeletalData: boolean;
  hasAnimations: boolean;
  hasMorphTargets: boolean;
  suggestedImportType: MeshAssetType;
  suggestedPreset: ImportPreset;
  warnings: string[];
  recommendations: {
    generateLODs: boolean;
    compressTextures: boolean;
    optimizeGeometry: boolean;
    targetPlatform: TargetPlatform;
  };
  /** Detected animation clip names and durations */
  detectedAnimations: { name: string; duration: number; frameCount: number }[];
}

// ── Mesh Asset (top-level) ──

export interface MeshAssetJSON {
  assetId: string;
  assetType: MeshAssetType;
  assetName: string;
  sourceFile: string;
  importDate: string;
  importSettings: MeshImportSettings;
  meshData: MeshDataJSON;
  /** References to child material assets */
  materials: string[];
  /** References to child texture assets */
  textures: string[];
  /** References to child animation assets */
  animations: string[];
  /** Skeleton data (inline for simplicity) */
  skeleton: SkeletonAssetJSON | null;
  /** LOD data (generated) */
  lods: LODDataJSON[];
  /** Collision data (generated) */
  collisionData: CollisionDataJSON | null;
  /** Import report */
  importReport: ImportReportJSON | null;
  /** Base64-encoded GLB binary for runtime loading */
  glbDataBase64: string;
  /** Thumbnail as data URL */
  thumbnail: string;
}

// ── Runtime In-Memory Asset ──

export class MeshAsset {
  public id: string;
  public name: string;
  public assetType: MeshAssetType;
  public sourceFile: string;
  public importDate: string;
  public importSettings: MeshImportSettings;
  public meshData: MeshDataJSON;
  public materials: MaterialAssetJSON[];
  public textures: TextureAssetJSON[];
  public animations: AnimationAssetJSON[];
  public skeleton: SkeletonAssetJSON | null;
  public lods: LODDataJSON[];
  public collisionData: CollisionDataJSON | null;
  public importReport: ImportReportJSON | null;
  /** Base64-encoded GLB for runtime reconstruction */
  public glbDataBase64: string;
  public thumbnail: string;

  constructor(json: MeshAssetJSON, materials: MaterialAssetJSON[], textures: TextureAssetJSON[], animations: AnimationAssetJSON[]) {
    this.id = json.assetId;
    this.name = json.assetName;
    this.assetType = json.assetType;
    this.sourceFile = json.sourceFile;
    this.importDate = json.importDate;
    this.importSettings = json.importSettings;
    this.meshData = json.meshData;
    this.materials = materials;
    this.textures = textures;
    this.animations = animations;
    this.skeleton = json.skeleton;
    this.lods = json.lods || [];
    this.collisionData = json.collisionData || null;
    this.importReport = json.importReport || null;
    this.glbDataBase64 = json.glbDataBase64;
    this.thumbnail = json.thumbnail;
  }

  toJSON(): MeshAssetJSON {
    return {
      assetId: this.id,
      assetType: this.assetType,
      assetName: this.name,
      sourceFile: this.sourceFile,
      importDate: this.importDate,
      importSettings: this.importSettings,
      meshData: this.meshData,
      materials: this.materials.map(m => m.assetId),
      textures: this.textures.map(t => t.assetId),
      animations: this.animations.map(a => a.assetId),
      skeleton: this.skeleton,
      lods: this.lods,
      collisionData: this.collisionData,
      importReport: this.importReport,
      glbDataBase64: this.glbDataBase64,
      thumbnail: this.thumbnail,
    };
  }
}

// ── Mesh Asset Manager ──

export class MeshAssetManager {
  /** Global singleton instance for static access */
  private static _instance: MeshAssetManager | null = null;

  private _assets: MeshAsset[] = [];
  private _materials: MaterialAssetJSON[] = [];
  private _textures: TextureAssetJSON[] = [];
  private _animations: AnimationAssetJSON[] = [];
  private _changeCallbacks: (() => void)[] = [];

  constructor() {
    // Set this as the singleton instance
    MeshAssetManager._instance = this;
  }

  /** Get the global mesh asset manager instance */
  static getInstance(): MeshAssetManager | null {
    return MeshAssetManager._instance;
  }

  /** Static helper to get an asset by ID */
  static getAsset(id: string): MeshAsset | undefined {
    return MeshAssetManager._instance?.getAsset(id);
  }

  get assets(): MeshAsset[] { return this._assets; }
  get allMaterials(): MaterialAssetJSON[] { return this._materials; }
  get allTextures(): TextureAssetJSON[] { return this._textures; }
  get allAnimations(): AnimationAssetJSON[] { return this._animations; }

  onChanged(cb: () => void): void {
    this._changeCallbacks.push(cb);
  }

  private _notifyChanged(): void {
    for (const cb of this._changeCallbacks) cb();
  }

  getAsset(id: string): MeshAsset | undefined {
    return this._assets.find(a => a.id === id);
  }

  getAssetByName(name: string): MeshAsset | undefined {
    return this._assets.find(a => a.name === name);
  }

  getMaterial(id: string): MaterialAssetJSON | undefined {
    return this._materials.find(m => m.assetId === id);
  }

  getTexture(id: string): TextureAssetJSON | undefined {
    return this._textures.find(t => t.assetId === id);
  }

  getAnimation(id: string): AnimationAssetJSON | undefined {
    return this._animations.find(a => a.assetId === id);
  }

  getAnimationsForMesh(meshAssetId: string): AnimationAssetJSON[] {
    return this._animations.filter(a => a.meshAssetId === meshAssetId);
  }

  /** Add a fully imported mesh asset with all its sub-assets */
  addImportedAsset(
    meshJson: MeshAssetJSON,
    materials: MaterialAssetJSON[],
    textures: TextureAssetJSON[],
    animations: AnimationAssetJSON[],
  ): MeshAsset {
    // Add sub-assets
    this._materials.push(...materials);
    this._textures.push(...textures);
    this._animations.push(...animations);

    const asset = new MeshAsset(meshJson, materials, textures, animations);
    this._assets.push(asset);
    this._notifyChanged();
    return asset;
  }

  removeAsset(id: string): void {
    const asset = this._assets.find(a => a.id === id);
    if (!asset) return;
    // Remove sub-assets
    this._materials = this._materials.filter(m => m.meshAssetId !== id);
    this._textures = this._textures.filter(t => t.meshAssetId !== id);
    this._animations = this._animations.filter(a => a.meshAssetId !== id);
    this._assets = this._assets.filter(a => a.id !== id);
    this._notifyChanged();
  }

  renameAsset(id: string, newName: string): void {
    const asset = this._assets.find(a => a.id === id);
    if (asset) {
      asset.name = newName;
      this._notifyChanged();
    }
  }

  /** Export all data for project save */
  exportAll(): {
    meshAssets: MeshAssetJSON[];
    materials: MaterialAssetJSON[];
    textures: TextureAssetJSON[];
    animations: AnimationAssetJSON[];
  } {
    return {
      meshAssets: this._assets.map(a => a.toJSON()),
      materials: [...this._materials],
      textures: [...this._textures],
      animations: [...this._animations],
    };
  }

  /** Import all data from project load */
  importAll(data: {
    meshAssets?: MeshAssetJSON[];
    materials?: MaterialAssetJSON[];
    textures?: TextureAssetJSON[];
    animations?: AnimationAssetJSON[];
  }): void {
    this._assets = [];
    this._materials = data.materials || [];
    this._textures = data.textures || [];
    this._animations = data.animations || [];

    for (const json of (data.meshAssets || [])) {
      const mats = this._materials.filter(m => json.materials.includes(m.assetId));
      const texs = this._textures.filter(t => json.textures.includes(t.assetId));
      const anims = this._animations.filter(a => json.animations.includes(a.assetId));
      this._assets.push(new MeshAsset(json, mats, texs, anims));
    }
    this._notifyChanged();
  }

  /** Clear all assets */
  clear(): void {
    this._assets = [];
    this._materials = [];
    this._textures = [];
    this._animations = [];
    this._notifyChanged();
  }
}
