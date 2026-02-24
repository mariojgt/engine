export interface ActionMapping {
  name: string;
  keys: string[];
}

export interface AxisMapping {
  name: string;
  key: string;
  scale: number;
}

export interface InputMappingAssetJSON {
  id: string;
  name: string;
  actionMappings: ActionMapping[];
  axisMappings: AxisMapping[];
}

export class InputMappingAsset {
  public id: string;
  public name: string;
  public actionMappings: ActionMapping[];
  public axisMappings: AxisMapping[];

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.actionMappings = [];
    this.axisMappings = [];
  }

  toJSON(): InputMappingAssetJSON {
    return {
      id: this.id,
      name: this.name,
      actionMappings: JSON.parse(JSON.stringify(this.actionMappings)),
      axisMappings: JSON.parse(JSON.stringify(this.axisMappings)),
    };
  }

  static fromJSON(json: InputMappingAssetJSON): InputMappingAsset {
    const asset = new InputMappingAsset(json.id, json.name);
    asset.actionMappings = json.actionMappings || [];
    asset.axisMappings = json.axisMappings || [];
    return asset;
  }
}

export class InputMappingAssetManager {
  private static _instance: InputMappingAssetManager | null = null;
  private _assets: Map<string, InputMappingAsset> = new Map();
  private _onChanged: (() => void)[] = [];

  private constructor() {}

  static getInstance(): InputMappingAssetManager {
    if (!this._instance) {
      this._instance = new InputMappingAssetManager();
    }
    return this._instance;
  }

  get assets(): InputMappingAsset[] {
    return Array.from(this._assets.values());
  }

  getAsset(id: string): InputMappingAsset | undefined {
    return this._assets.get(id);
  }

  createAsset(name: string): InputMappingAsset {
    const id = 'inputmapping_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
    const asset = new InputMappingAsset(id, name);
    this._assets.set(id, asset);
    this._emitChanged();
    return asset;
  }

  deleteAsset(id: string): void {
    if (this._assets.delete(id)) {
      this._emitChanged();
    }
  }

  renameAsset(id: string, newName: string): void {
    const asset = this._assets.get(id);
    if (asset) {
      asset.name = newName;
      this._emitChanged();
    }
  }

  notifyChanged(): void {
    this._emitChanged();
  }

  onChanged(cb: () => void): void {
    this._onChanged.push(cb);
  }

  exportAll(): InputMappingAssetJSON[] {
    return this.assets.map(a => a.toJSON());
  }

  importAll(data: InputMappingAssetJSON[]): void {
    this._assets.clear();
    for (const json of data) {
      const asset = InputMappingAsset.fromJSON(json);
      this._assets.set(asset.id, asset);
    }
    this._emitChanged();
  }

  private _emitChanged(): void {
    for (const cb of this._onChanged) cb();
  }
}
