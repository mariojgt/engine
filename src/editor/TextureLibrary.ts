// ============================================================
//  TextureLibrary — Texture asset import, storage, and management
//  for widgets and UI elements. Supports PNG, JPG, SVG, WEBP, GIF.
//  Features: 9-slice, tinting, thumbnails, caching, Three.js integration.
// ============================================================

import * as THREE from 'three';

// ---- Unique ID helper ----
let _texUid = 0;
function texUid(): string {
  return 'tex_' + Date.now().toString(36) + '_' + (++_texUid).toString(36);
}

// ============================================================
//  Texture Asset Interfaces
// ============================================================

export type TextureCategory = 'UI' | 'Sprite' | 'NormalMap' | 'RenderTarget';
export type TextureFilter = 'linear' | 'nearest' | 'anisotropic';
export type TextureWrap = 'clamp' | 'repeat' | 'mirror';
export type TextureCompression = 'none' | 'low' | 'medium' | 'high';

export interface NineSliceMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TextureSettings {
  filter: TextureFilter;
  wrap: TextureWrap;
  generateMipmaps: boolean;
  sRGB: boolean;
  premultipliedAlpha: boolean;
  compression: TextureCompression;
  isNineSlice: boolean;
  nineSliceMargins: NineSliceMargins;
}

export interface TextureMetadata {
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  fileSize: number;
}

export interface TextureAssetData {
  assetId: string;
  assetType: 'texture';
  assetName: string;
  sourceFile: string;
  category: TextureCategory;
  settings: TextureSettings;
  metadata: TextureMetadata;
  thumbnail: string;
  storedData: string; // data URL
}

export function defaultTextureSettings(): TextureSettings {
  return {
    filter: 'linear',
    wrap: 'clamp',
    generateMipmaps: false,
    sRGB: true,
    premultipliedAlpha: false,
    compression: 'none',
    isNineSlice: false,
    nineSliceMargins: { top: 10, right: 10, bottom: 10, left: 10 },
  };
}

// ============================================================
//  TextureLibrary — Singleton manager
// ============================================================

export class TextureLibrary {
  private _textures: Map<string, TextureAssetData> = new Map();
  private _loadedImages: Map<string, HTMLImageElement> = new Map();
  private _threeTextures: Map<string, THREE.Texture> = new Map();
  private _listeners: Array<() => void> = [];
  private _loader = new THREE.TextureLoader();

  private static _instance: TextureLibrary | null = null;

  constructor() {
    TextureLibrary._instance = this;
  }

  static get instance(): TextureLibrary | null {
    return TextureLibrary._instance;
  }

  // ---- Import ----

  async importFromFile(file: File, settings: Partial<TextureSettings> = {}): Promise<TextureAssetData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const dataURL = event.target!.result as string;
        const img = new Image();

        img.onload = () => {
          const mergedSettings: TextureSettings = {
            ...defaultTextureSettings(),
            ...settings,
          };

          const asset: TextureAssetData = {
            assetId: texUid(),
            assetType: 'texture',
            assetName: this._cleanName(file.name),
            sourceFile: file.name,
            category: (settings as any).category || 'UI',
            settings: mergedSettings,
            metadata: {
              width: img.width,
              height: img.height,
              format: file.type.split('/')[1] || 'png',
              hasAlpha: this._detectAlpha(img),
              fileSize: file.size,
            },
            thumbnail: this._generateThumbnail(img),
            storedData: dataURL,
          };

          // Cache the image element
          this._loadedImages.set(asset.assetId, img);

          // Store in library
          this._textures.set(asset.assetId, asset);

          // Create Three.js texture
          this._createThreeTexture(asset);

          this._notify();
          resolve(asset);
        };

        img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
        img.src = dataURL;
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /** Import from an existing data URL (e.g., from saved project) */
  async importFromDataURL(
    dataURL: string,
    name: string,
    existingId?: string,
    settings?: Partial<TextureSettings>,
    category?: TextureCategory,
  ): Promise<TextureAssetData> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const mergedSettings: TextureSettings = {
          ...defaultTextureSettings(),
          ...settings,
        };

        const asset: TextureAssetData = {
          assetId: existingId || texUid(),
          assetType: 'texture',
          assetName: name,
          sourceFile: name,
          category: category || 'UI',
          settings: mergedSettings,
          metadata: {
            width: img.width,
            height: img.height,
            format: 'png',
            hasAlpha: this._detectAlpha(img),
            fileSize: dataURL.length,
          },
          thumbnail: this._generateThumbnail(img),
          storedData: dataURL,
        };

        this._loadedImages.set(asset.assetId, img);
        this._textures.set(asset.assetId, asset);
        this._createThreeTexture(asset);
        this._notify();
        resolve(asset);
      };

      img.onerror = () => reject(new Error(`Failed to load image data for: ${name}`));
      img.src = dataURL;
    });
  }

  // ---- Access ----

  getAsset(assetId: string): TextureAssetData | undefined {
    return this._textures.get(assetId);
  }

  getImage(assetId: string): HTMLImageElement | null {
    // Return from cache
    if (this._loadedImages.has(assetId)) {
      return this._loadedImages.get(assetId)!;
    }

    // Lazy-load from stored data
    const asset = this._textures.get(assetId);
    if (!asset?.storedData) return null;

    const img = new Image();
    img.src = asset.storedData;
    this._loadedImages.set(assetId, img);

    return img;
  }

  getThreeTexture(assetId: string): THREE.Texture | undefined {
    return this._threeTextures.get(assetId);
  }

  get allTextures(): TextureAssetData[] {
    return Array.from(this._textures.values());
  }

  getTexturesByCategory(category: TextureCategory): TextureAssetData[] {
    return this.allTextures.filter(t => t.category === category);
  }

  /** Find texture by name (partial match) */
  findByName(name: string): TextureAssetData | undefined {
    const lower = name.toLowerCase();
    return this.allTextures.find(t =>
      t.assetName.toLowerCase().includes(lower) ||
      t.sourceFile.toLowerCase().includes(lower)
    );
  }

  // ---- Remove ----

  removeTexture(assetId: string): void {
    this._textures.delete(assetId);
    this._loadedImages.delete(assetId);
    const threeTex = this._threeTextures.get(assetId);
    if (threeTex) {
      threeTex.dispose();
      this._threeTextures.delete(assetId);
    }
    this._notify();
  }

  // ---- Update settings ----

  updateSettings(assetId: string, settings: Partial<TextureSettings>): void {
    const asset = this._textures.get(assetId);
    if (!asset) return;
    Object.assign(asset.settings, settings);

    // Recreate Three.js texture with new settings
    const oldTex = this._threeTextures.get(assetId);
    if (oldTex) oldTex.dispose();
    this._createThreeTexture(asset);

    this._notify();
  }

  // ---- Serialization ----

  exportAll(): TextureAssetData[] {
    return Array.from(this._textures.values());
  }

  async importAll(assets: TextureAssetData[]): Promise<void> {
    this._textures.clear();
    this._loadedImages.clear();
    for (const tex of this._threeTextures.values()) tex.dispose();
    this._threeTextures.clear();

    for (const asset of assets) {
      this._textures.set(asset.assetId, asset);
      // Lazy-load images when needed
    }
    this._notify();
  }

  clear(): void {
    this._textures.clear();
    this._loadedImages.clear();
    for (const tex of this._threeTextures.values()) tex.dispose();
    this._threeTextures.clear();
    this._notify();
  }

  // ---- Change listeners ----

  onChanged(cb: () => void): void {
    this._listeners.push(cb);
  }

  removeListener(cb: () => void): void {
    this._listeners = this._listeners.filter(l => l !== cb);
  }

  // ---- Private helpers ----

  private _createThreeTexture(asset: TextureAssetData): void {
    const texture = new THREE.Texture();
    const img = this.getImage(asset.assetId);
    if (img && img.complete) {
      texture.image = img;
    } else if (img) {
      img.onload = () => {
        texture.image = img;
        texture.needsUpdate = true;
      };
    }

    // Apply settings
    texture.generateMipmaps = asset.settings.generateMipmaps;
    texture.colorSpace = asset.settings.sRGB
      ? THREE.SRGBColorSpace
      : THREE.LinearSRGBColorSpace;

    switch (asset.settings.filter) {
      case 'nearest':
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        break;
      case 'linear':
      default:
        texture.minFilter = asset.settings.generateMipmaps
          ? THREE.LinearMipmapLinearFilter
          : THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        break;
    }

    switch (asset.settings.wrap) {
      case 'repeat':
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        break;
      case 'mirror':
        texture.wrapS = THREE.MirroredRepeatWrapping;
        texture.wrapT = THREE.MirroredRepeatWrapping;
        break;
      default:
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
    }

    texture.needsUpdate = true;
    this._threeTextures.set(asset.assetId, texture);
  }

  private _generateThumbnail(img: HTMLImageElement, size = 64): string {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Checkered background for transparency
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#aaa';
    for (let x = 0; x < size; x += 8) {
      for (let y = 0; y < size; y += 8) {
        if ((x + y) % 16 === 0) ctx.fillRect(x, y, 8, 8);
      }
    }

    // Draw image
    const aspect = img.width / img.height;
    let dw = size, dh = size;
    if (aspect > 1) dh = size / aspect;
    else dw = size * aspect;

    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return canvas.toDataURL('image/png');
  }

  private _detectAlpha(img: HTMLImageElement): boolean {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(img.width, 64);
      canvas.height = Math.min(img.height, 64);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private _cleanName(filename: string): string {
    return 'T_' + filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9]/g, '_');
  }

  private _notify(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[TextureLibrary] listener error:', e); }
    }
  }
}
