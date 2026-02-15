// ============================================================
//  MeshAsset — Asset types for imported 3D meshes
//  Supports static meshes, skeletal meshes, skeletons,
//  animations, materials, and textures.
//  All data is JSON-serializable for project persistence.
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

// ── Import Settings ──

export interface MeshImportSettings {
  importAs: 'auto' | 'staticMesh' | 'skeletalMesh';
  assetName: string;
  scale: number;
  importMesh: boolean;
  combineMeshes: boolean;
  importMaterials: boolean;
  importTextures: boolean;
  importSkeleton: boolean;
  importAnimations: boolean;
  generateNormals: boolean;
  generateTangents: boolean;
  optimizeMesh: boolean;
  /** Position offset to apply */
  positionOffset: { x: number; y: number; z: number };
  /** Rotation offset in degrees */
  rotationOffset: { x: number; y: number; z: number };
}

export function defaultImportSettings(filename: string): MeshImportSettings {
  const name = filename.replace(/\.[^.]+$/, ''); // strip extension
  return {
    importAs: 'auto',
    assetName: name,
    scale: 1.0,
    importMesh: true,
    combineMeshes: false,
    importMaterials: true,
    importTextures: true,
    importSkeleton: true,
    importAnimations: true,
    generateNormals: true,
    generateTangents: true,
    optimizeMesh: true,
    positionOffset: { x: 0, y: 0, z: 0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
  };
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
