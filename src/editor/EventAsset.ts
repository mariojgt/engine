export interface EventAssetJSON {
  id: string;
  name: string;
  description: string;
  category: string;
  payloadFields: EventPayloadField[];
  createdAt: number;
  modifiedAt: number;
}

export interface EventPayloadField {
  name: string;
  type: string;
  defaultValue?: any;
}

let _nextEventId = 1;
function eventUid(): string {
  return 'event_' + (_nextEventId++) + '_' + Date.now().toString(36);
}

export class EventAsset {
  public id: string;
  public name: string;
  public description: string;
  public category: string;
  public payloadFields: EventPayloadField[];
  public createdAt: number;
  public modifiedAt: number;

  constructor(json?: EventAssetJSON) {
    if (json) {
      this.id = json.id;
      this.name = json.name;
      this.description = json.description || '';
      this.category = json.category || 'Default';
      this.payloadFields = json.payloadFields || [];
      this.createdAt = json.createdAt || Date.now();
      this.modifiedAt = json.modifiedAt || Date.now();
    } else {
      this.id = eventUid();
      this.name = 'NewEvent';
      this.description = '';
      this.category = 'Default';
      this.payloadFields = [];
      this.createdAt = Date.now();
      this.modifiedAt = Date.now();
    }
  }

  toJSON(): EventAssetJSON {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      payloadFields: this.payloadFields,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }
}

export class EventAssetManager {
  private static _instance: EventAssetManager | null = null;
  private _assets: EventAsset[] = [];
  private _changeCallbacks: (() => void)[] = [];

  constructor() {
    EventAssetManager._instance = this;
  }

  static getInstance(): EventAssetManager | null {
    return EventAssetManager._instance;
  }

  get assets(): EventAsset[] {
    return this._assets;
  }

  onChanged(cb: () => void): void {
    this._changeCallbacks.push(cb);
  }

  private _notifyChanged(): void {
    for (const cb of this._changeCallbacks) cb();
  }

  getAsset(id: string): EventAsset | undefined {
    return this._assets.find(a => a.id === id);
  }

  createAsset(name: string): EventAsset {
    const asset = new EventAsset();
    asset.name = name;
    this._assets.push(asset);
    this._notifyChanged();
    return asset;
  }

  renameAsset(id: string, newName: string): void {
    const asset = this.getAsset(id);
    if (asset) {
      asset.name = newName;
      asset.modifiedAt = Date.now();
      this._notifyChanged();
    }
  }

  updateAsset(id: string, changes: Partial<Pick<EventAsset, 'name' | 'description' | 'payloadFields' | 'category'>>): void {
    const asset = this.getAsset(id);
    if (!asset) return;
    if (changes.name !== undefined) asset.name = changes.name;
    if (changes.description !== undefined) asset.description = changes.description;
    if (changes.payloadFields !== undefined) asset.payloadFields = changes.payloadFields;
    if (changes.category !== undefined) asset.category = changes.category;
    asset.modifiedAt = Date.now();
    this._notifyChanged();
  }

  removeAsset(id: string): void {
    this._assets = this._assets.filter(a => a.id !== id);
    this._notifyChanged();
  }

  deleteAsset(id: string): void {
    this.removeAsset(id);
  }

  exportAll(): EventAssetJSON[] {
    return this._assets.map(a => a.toJSON());
  }

  importAll(data: EventAssetJSON[]): void {
    this._assets = data.map(json => new EventAsset(json));
    this._notifyChanged();
  }

  clear(): void {
    this._assets = [];
    this._notifyChanged();
  }
}
