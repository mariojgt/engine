// ============================================================
//  FontLibrary — Font asset import, storage, and management
//  Supports TTF, OTF, WOFF, WOFF2 font files.
//  Registers @font-face for Canvas/CSS rendering.
// ============================================================

// ---- Unique ID helper ----
let _fontUid = 0;
function fontUid(): string {
  return 'font_' + Date.now().toString(36) + '_' + (++_fontUid).toString(36);
}

// ============================================================
//  Font Asset Interfaces
// ============================================================

export type FontFormat = 'truetype' | 'opentype' | 'woff' | 'woff2';

export interface FontAssetData {
  assetId: string;
  assetType: 'font';
  assetName: string;
  displayName: string;
  sourceFile: string;
  format: FontFormat;
  fallback: string;
  cssFamily: string;
  data: string; // data URL
  thumbnail: string;
}

export interface SystemFont {
  name: string;
  family: string;
}

export interface FontListEntry {
  id: string;
  name: string;
  family: string;
  isSystem: boolean;
}

// ============================================================
//  FontLibrary — Singleton manager
// ============================================================

export class FontLibrary {
  private _fonts: Map<string, FontAssetData> = new Map();
  private _loadedFaces: Map<string, FontFace> = new Map();
  private _listeners: Array<() => void> = [];

  private static _instance: FontLibrary | null = null;

  /** Predefined system fonts */
  public readonly systemFonts: SystemFont[] = [
    { name: 'Arial', family: 'Arial, sans-serif' },
    { name: 'Georgia', family: 'Georgia, serif' },
    { name: 'Courier New', family: '"Courier New", monospace' },
    { name: 'Verdana', family: 'Verdana, sans-serif' },
    { name: 'Impact', family: 'Impact, sans-serif' },
    { name: 'Times New Roman', family: '"Times New Roman", serif' },
    { name: 'Comic Sans MS', family: '"Comic Sans MS", cursive' },
    { name: 'Trebuchet MS', family: '"Trebuchet MS", sans-serif' },
    { name: 'Lucida Console', family: '"Lucida Console", monospace' },
  ];

  constructor() {
    FontLibrary._instance = this;
  }

  static get instance(): FontLibrary | null {
    return FontLibrary._instance;
  }

  // ---- Import ----

  async importFont(file: File, displayName?: string): Promise<FontAssetData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (event) => {
        const dataURL = event.target!.result as string;
        const fontName = this._cleanFontName(file.name);
        const dName = displayName || fontName;

        try {
          // Create and load @font-face
          const fontFace = new FontFace(dName, `url(${dataURL})`);
          await fontFace.load();
          document.fonts.add(fontFace);

          const asset: FontAssetData = {
            assetId: fontUid(),
            assetType: 'font',
            assetName: `F_${fontName}`,
            displayName: dName,
            sourceFile: file.name,
            format: this._getFontFormat(file.name),
            fallback: 'Arial, sans-serif',
            cssFamily: `"${dName}", Arial, sans-serif`,
            data: dataURL,
            thumbnail: this._generateFontThumbnail(dName),
          };

          this._fonts.set(asset.assetId, asset);
          this._loadedFaces.set(asset.assetId, fontFace);
          this._notify();
          resolve(asset);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /** Load font from saved project data */
  async loadFromAsset(asset: FontAssetData): Promise<void> {
    try {
      const fontFace = new FontFace(asset.displayName, `url(${asset.data})`);
      await fontFace.load();
      document.fonts.add(fontFace);

      this._fonts.set(asset.assetId, asset);
      this._loadedFaces.set(asset.assetId, fontFace);
    } catch (error) {
      console.warn(`[FontLibrary] Failed to load font: ${asset.displayName}`, error);
    }
  }

  // ---- Access ----

  getAsset(assetId: string): FontAssetData | undefined {
    return this._fonts.get(assetId);
  }

  getCSSFamily(fontAssetId: string): string {
    const asset = this._fonts.get(fontAssetId);
    if (!asset) return 'Arial, sans-serif';
    return asset.cssFamily;
  }

  /** Get CSS family for either a system font name or an asset ID */
  resolveFontFamily(fontRef: string): string {
    // Check if it's an asset ID first
    const asset = this._fonts.get(fontRef);
    if (asset) return asset.cssFamily;

    // Check system fonts
    const sys = this.systemFonts.find(f => f.name === fontRef);
    if (sys) return sys.family;

    // Treat as raw CSS font family
    return fontRef || 'Arial, sans-serif';
  }

  get allFonts(): FontAssetData[] {
    return Array.from(this._fonts.values());
  }

  /** Get unified list of system + imported fonts */
  getAllFontEntries(): FontListEntry[] {
    const systemEntries: FontListEntry[] = this.systemFonts.map(f => ({
      id: f.name,
      name: f.name,
      family: f.family,
      isSystem: true,
    }));

    const importedEntries: FontListEntry[] = [...this._fonts.values()].map(f => ({
      id: f.assetId,
      name: f.displayName,
      family: f.cssFamily,
      isSystem: false,
    }));

    return [...systemEntries, ...importedEntries];
  }

  // ---- Remove ----

  removeFont(assetId: string): void {
    const face = this._loadedFaces.get(assetId);
    if (face) {
      document.fonts.delete(face);
      this._loadedFaces.delete(assetId);
    }
    this._fonts.delete(assetId);
    this._notify();
  }

  // ---- Serialization ----

  exportAll(): FontAssetData[] {
    return Array.from(this._fonts.values());
  }

  async importAll(assets: FontAssetData[]): Promise<void> {
    // Clear existing
    for (const face of this._loadedFaces.values()) {
      document.fonts.delete(face);
    }
    this._fonts.clear();
    this._loadedFaces.clear();

    // Load all fonts
    for (const asset of assets) {
      await this.loadFromAsset(asset);
    }
    this._notify();
  }

  clear(): void {
    for (const face of this._loadedFaces.values()) {
      document.fonts.delete(face);
    }
    this._fonts.clear();
    this._loadedFaces.clear();
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

  private _generateFontThumbnail(fontName: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(0, 0, 128, 64);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `24px "${fontName}", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Ag', 64, 32);

    return canvas.toDataURL('image/png');
  }

  private _getFontFormat(filename: string): FontFormat {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const formats: Record<string, FontFormat> = {
      ttf: 'truetype',
      otf: 'opentype',
      woff: 'woff',
      woff2: 'woff2',
    };
    return formats[ext] || 'truetype';
  }

  private _cleanFontName(filename: string): string {
    return filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9]/g, '_');
  }

  private _notify(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[FontLibrary] listener error:', e); }
    }
  }
}
