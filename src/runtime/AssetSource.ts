// ============================================================
//  AssetSource — Abstraction layer for asset loading
//
//  Play mode uses EditorAssetSource (loads from in-memory managers)
//  Export uses FileAssetSource (loads from cooked files via fetch/fs)
//
//  The AssetLoader in FeatherRuntime uses this interface exclusively
//  — it never knows or cares where assets come from.
// ============================================================

// ── Asset Type Discriminators ───────────────────────────────

export type AssetCategory =
  | 'Actors'
  | 'Scenes'
  | 'Meshes'
  | 'Textures'
  | 'Sounds'
  | 'SoundCues'
  | 'Widgets'
  | 'AnimBlueprints'
  | 'GameInstances'
  | 'InputMappings'
  | 'DataTables'
  | 'Structures'
  | 'Enums'
  | 'Events'
  | 'SaveGameClasses'
  | 'SpriteSheets'
  | 'Fonts'
  | 'Config';

// ── Asset Index Entry ───────────────────────────────────────

export interface AssetIndexEntry {
  id: string;
  name: string;
  file: string;
  [key: string]: any;
}

// ── Asset Source Interface ───────────────────────────────────

export interface AssetSource {
  /**
   * Load the index for an asset category.
   * Returns the array of index entries (from _index.json or memory).
   */
  loadIndex(category: AssetCategory): Promise<AssetIndexEntry[]>;

  /**
   * Load a single asset by category and filename.
   * Returns the parsed JSON data for the asset.
   */
  loadAsset(category: AssetCategory, filename: string): Promise<any>;

  /**
   * Load a single asset by category and asset ID.
   * Resolves the ID to a filename via the index, then loads.
   */
  loadAssetById(category: AssetCategory, id: string): Promise<any>;

  /**
   * Check if an asset exists in the specified category.
   */
  assetExists(category: AssetCategory, filename: string): Promise<boolean>;

  /**
   * Load raw binary data (for GLB meshes, audio files, etc.)
   */
  loadBinary(category: AssetCategory, filename: string): Promise<ArrayBuffer>;

  /**
   * Load a texture as an HTMLImageElement.
   * Handles both data URL (editor) and file path (export) sources.
   */
  loadImage(src: string): Promise<HTMLImageElement>;

  /**
   * Load a config file (composition.json, project.json, etc.)
   */
  loadConfig(filename: string): Promise<any>;
}

// ── File-based Asset Source (for exported builds) ────────────

export class FileAssetSource implements AssetSource {
  private _basePath: string;
  private _indexCache = new Map<AssetCategory, AssetIndexEntry[]>();
  private _loadFile: (path: string) => Promise<string>;
  private _loadBinaryFile: (path: string) => Promise<ArrayBuffer>;
  private _fileExists: (path: string) => Promise<boolean>;

  constructor(
    basePath: string,
    loadFile: (path: string) => Promise<string>,
    loadBinaryFile: (path: string) => Promise<ArrayBuffer>,
    fileExists: (path: string) => Promise<boolean>,
  ) {
    this._basePath = basePath.replace(/\/+$/, '');
    this._loadFile = loadFile;
    this._loadBinaryFile = loadBinaryFile;
    this._fileExists = fileExists;
  }

  async loadIndex(category: AssetCategory): Promise<AssetIndexEntry[]> {
    if (this._indexCache.has(category)) {
      return this._indexCache.get(category)!;
    }
    try {
      const path = `${this._basePath}/${category}/_index.json`;
      const text = await this._loadFile(path);
      const entries: AssetIndexEntry[] = JSON.parse(text);
      this._indexCache.set(category, entries);
      return entries;
    } catch {
      this._indexCache.set(category, []);
      return [];
    }
  }

  async loadAsset(category: AssetCategory, filename: string): Promise<any> {
    const path = `${this._basePath}/${category}/${filename}`;
    const text = await this._loadFile(path);
    return JSON.parse(text);
  }

  async loadAssetById(category: AssetCategory, id: string): Promise<any> {
    const index = await this.loadIndex(category);
    const entry = index.find(e => e.id === id);
    if (!entry) throw new Error(`Asset not found: ${category}/${id}`);
    return this.loadAsset(category, entry.file);
  }

  async assetExists(category: AssetCategory, filename: string): Promise<boolean> {
    const path = `${this._basePath}/${category}/${filename}`;
    return this._fileExists(path);
  }

  async loadBinary(category: AssetCategory, filename: string): Promise<ArrayBuffer> {
    const path = `${this._basePath}/${category}/${filename}`;
    return this._loadBinaryFile(path);
  }

  async loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      // If it's a data URL, use directly; otherwise, prepend base path
      if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) {
        img.src = src;
      } else {
        img.src = `${this._basePath}/${src}`;
      }
    });
  }

  async loadConfig(filename: string): Promise<any> {
    const path = `${this._basePath}/Config/${filename}`;
    const text = await this._loadFile(path);
    return JSON.parse(text);
  }
}

// ── Editor Asset Source (for Play mode — wraps live managers) ─

export class EditorAssetSource implements AssetSource {
  private _managers: Map<AssetCategory, any> = new Map();
  private _projectPath: string;
  private _loadFile: (path: string) => Promise<string>;

  constructor(
    projectPath: string,
    loadFile: (path: string) => Promise<string>,
  ) {
    this._projectPath = projectPath.replace(/\/+$/, '');
    this._loadFile = loadFile;
  }

  /**
   * Register an editor asset manager for a category.
   * The manager must have at minimum:
   * - An iterable collection of assets (exportAll() or similar)
   * - getAsset(id) method
   */
  registerManager(category: AssetCategory, manager: any): void {
    this._managers.set(category, manager);
  }

  async loadIndex(category: AssetCategory): Promise<AssetIndexEntry[]> {
    const mgr = this._managers.get(category);
    if (!mgr) {
      // Fallback: load from project files
      try {
        const path = `${this._projectPath}/${category}/_index.json`;
        const text = await this._loadFile(path);
        return JSON.parse(text);
      } catch {
        return [];
      }
    }
    // Use the manager's export to generate index entries
    if (typeof mgr.exportAll === 'function') {
      const exported = mgr.exportAll();
      if (Array.isArray(exported)) {
        return exported.map((a: any) => ({
          id: a.id ?? a.actorAssetId ?? a.gameInstanceId ?? '',
          name: a.name ?? a.actorName ?? a.gameInstanceName ?? '',
          file: `${a.id ?? a.actorAssetId ?? ''}.json`,
        }));
      }
    }
    return [];
  }

  async loadAsset(category: AssetCategory, filename: string): Promise<any> {
    // Try manager first
    const mgr = this._managers.get(category);
    if (mgr) {
      const id = filename.replace(/\.json$/, '');
      const asset = typeof mgr.getAsset === 'function' ? mgr.getAsset(id) : null;
      if (asset) {
        return typeof asset.toJSON === 'function' ? asset.toJSON() : asset;
      }
    }
    // Fallback: load from file
    const path = `${this._projectPath}/${category}/${filename}`;
    const text = await this._loadFile(path);
    return JSON.parse(text);
  }

  async loadAssetById(category: AssetCategory, id: string): Promise<any> {
    const mgr = this._managers.get(category);
    if (mgr) {
      const asset = typeof mgr.getAsset === 'function' ? mgr.getAsset(id) : null;
      if (asset) {
        return typeof asset.toJSON === 'function' ? asset.toJSON() : asset;
      }
    }
    // Fallback: load from index
    const index = await this.loadIndex(category);
    const entry = index.find(e => e.id === id);
    if (!entry) throw new Error(`Asset not found: ${category}/${id}`);
    return this.loadAsset(category, entry.file);
  }

  async assetExists(category: AssetCategory, filename: string): Promise<boolean> {
    const mgr = this._managers.get(category);
    if (mgr) {
      const id = filename.replace(/\.json$/, '');
      return typeof mgr.getAsset === 'function' ? mgr.getAsset(id) != null : false;
    }
    return false;
  }

  async loadBinary(category: AssetCategory, filename: string): Promise<ArrayBuffer> {
    const path = `${this._projectPath}/${category}/${filename}`;
    const text = await this._loadFile(path);
    // Convert base64 to ArrayBuffer
    const binary = atob(text);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i);
    }
    return buffer;
  }

  async loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  async loadConfig(filename: string): Promise<any> {
    const path = `${this._projectPath}/Config/${filename}`;
    const text = await this._loadFile(path);
    return JSON.parse(text);
  }
}
