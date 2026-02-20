// ============================================================
//  SortingLayers — Manages 2D rendering order (z-depth layers)
// ============================================================

export interface SortingLayerData {
  name: string;
  z: number;
  visible: boolean;
  locked: boolean;
}

export const DEFAULT_SORTING_LAYERS: SortingLayerData[] = [
  { name: 'Background', z: 0, visible: true, locked: false },
  { name: 'Ground', z: 10, visible: true, locked: false },
  { name: 'Default', z: 20, visible: true, locked: false },
  { name: 'Characters', z: 30, visible: true, locked: false },
  { name: 'UI', z: 90, visible: true, locked: false },
];

export class SortingLayerManager {
  private _layers: SortingLayerData[] = [];
  private _onChange: (() => void)[] = [];

  constructor(layers?: SortingLayerData[]) {
    this._layers = layers ? structuredClone(layers) : structuredClone(DEFAULT_SORTING_LAYERS);
  }

  get layers(): SortingLayerData[] {
    return this._layers;
  }

  getZ(layerName: string): number | undefined {
    return this._layers.find(l => l.name === layerName)?.z;
  }

  getLayer(name: string): SortingLayerData | undefined {
    return this._layers.find(l => l.name === name);
  }

  addLayer(name: string): void {
    if (this._layers.find(l => l.name === name)) return;
    const maxZ = Math.max(...this._layers.map(l => l.z), 0);
    this._layers.push({ name, z: maxZ + 10, visible: true, locked: false });
    this._emit();
  }

  removeLayer(name: string): void {
    if (name === 'Default') return; // Cannot remove Default
    this._layers = this._layers.filter(l => l.name !== name);
    this._emit();
  }

  renameLayer(oldName: string, newName: string): void {
    const layer = this._layers.find(l => l.name === oldName);
    if (layer) {
      layer.name = newName;
      this._emit();
    }
  }

  reorder(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this._layers.length) return;
    if (toIndex < 0 || toIndex >= this._layers.length) return;
    const [moved] = this._layers.splice(fromIndex, 1);
    this._layers.splice(toIndex, 0, moved);
    // Redistribute Z values
    this._layers.forEach((l, i) => { l.z = i * 10; });
    this._emit();
  }

  toggleVisibility(name: string): void {
    const layer = this._layers.find(l => l.name === name);
    if (layer) { layer.visible = !layer.visible; this._emit(); }
  }

  toggleLock(name: string): void {
    const layer = this._layers.find(l => l.name === name);
    if (layer) { layer.locked = !layer.locked; this._emit(); }
  }

  setLayers(layers: SortingLayerData[]): void {
    this._layers = structuredClone(layers);
    this._emit();
  }

  onChange(cb: () => void): void {
    this._onChange.push(cb);
  }

  toJSON(): SortingLayerData[] {
    return structuredClone(this._layers);
  }

  private _emit(): void {
    for (const cb of this._onChange) cb();
  }
}
