// ============================================================
//  TileEditorPanel — Dockable panel for tile painting
//  Target tilemap, layer, tileset selection. Paint/Erase/Fill/
//  Rectangle/Line/Pick tools. Real-time collision rebuild.
// ============================================================

import type { TilemapAsset, TilemapLayer, TilesetAsset } from '../engine/TilemapData';
import { TilemapCollisionBuilder } from '../engine/TilemapData';

export type TileTool = 'paint' | 'erase' | 'fill' | 'select' | 'rect' | 'line' | 'pick' | 'moveLayer';

export class TileEditorPanel {
  private _container: HTMLElement;
  private _tilemaps: TilemapAsset[] = [];
  private _tilesets: TilesetAsset[] = [];
  private _activeTilemap: TilemapAsset | null = null;
  private _activeLayer: TilemapLayer | null = null;
  private _activeTileset: TilesetAsset | null = null;
  private _activeTool: TileTool = 'paint';
  private _selectedTileId: number = 0;
  private _brushSize = { w: 1, h: 1 };
  private _flipX = false;
  private _flipY = false;
  private _rotation = 0;

  // Palette canvas
  private _paletteCanvas: HTMLCanvasElement;
  private _palCtx: CanvasRenderingContext2D;
  private _palZoom = 2;

  // Collision builder
  private _collisionBuilder = new TilemapCollisionBuilder();
  private _collisionRebuildTimer: ReturnType<typeof setTimeout> | null = null;

  // Undo stack
  private _undoStack: { layerId: string; tiles: Record<string, number> }[] = [];
  private _redoStack: { layerId: string; tiles: Record<string, number> }[] = [];

  // Callbacks
  private _onTilemapChanged: ((tilemap: TilemapAsset) => void) | null = null;
  private _physics2DWorld: any = null;

  // Sections
  private _layerListEl: HTMLElement | null = null;
  private _toolbarEl: HTMLElement | null = null;
  private _brushOptionsEl: HTMLElement | null = null;
  private _tileInfoEl: HTMLElement | null = null;

  constructor(container: HTMLElement, scene2D?: any) {
    this._container = container;
    this._paletteCanvas = document.createElement('canvas');
    this._paletteCanvas.width = 256;
    this._paletteCanvas.height = 256;
    this._palCtx = this._paletteCanvas.getContext('2d')!;
    this._palCtx.imageSmoothingEnabled = false;
    this._build();
  }

  setTilemaps(tilemaps: TilemapAsset[]): void { this._tilemaps = tilemaps; this._renderDropdowns(); }
  setTilesets(tilesets: TilesetAsset[]): void { this._tilesets = tilesets; this._renderDropdowns(); }
  setPhysics2DWorld(world: any): void { this._physics2DWorld = world; }
  onTilemapChanged(cb: (tilemap: TilemapAsset) => void): void { this._onTilemapChanged = cb; }

  selectTilemap(tilemapId: string): void {
    this._activeTilemap = this._tilemaps.find(t => t.assetId === tilemapId) ?? null;
    if (this._activeTilemap) {
      this._activeLayer = this._activeTilemap.layers[0] ?? null;
      this._activeTileset = this._tilesets.find(t => t.assetId === this._activeTilemap!.tilesetId) ?? null;
    }
    this._renderAll();
  }

  private _build(): void {
    const root = this._container;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#1e1e2e;color:#cdd6f4;font-family:Inter,sans-serif;font-size:12px;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid #313244;gap:8px;';
    header.innerHTML = `<span style="opacity:0.6">▦</span><span style="font-weight:600;flex:1">TILE EDITOR</span>`;
    const settingsBtn = document.createElement('button');
    settingsBtn.textContent = '⚙';
    settingsBtn.style.cssText = 'background:none;border:none;color:#cdd6f4;cursor:pointer;';
    header.appendChild(settingsBtn);
    root.appendChild(header);

    // Dropdowns section
    const dropdownSection = document.createElement('div');
    dropdownSection.className = 'tile-dropdowns';
    dropdownSection.style.cssText = 'padding:6px 10px;border-bottom:1px solid #313244;';
    root.appendChild(dropdownSection);

    // Tools toolbar
    this._toolbarEl = document.createElement('div');
    this._toolbarEl.style.cssText = 'display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid #313244;flex-wrap:wrap;';
    root.appendChild(this._toolbarEl);
    this._renderToolbar();

    // Tile palette
    const paletteSection = document.createElement('div');
    paletteSection.style.cssText = 'flex:1;overflow:auto;padding:8px 10px;';
    const paletteLabel = document.createElement('div');
    paletteLabel.style.cssText = 'font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:8px;';
    paletteLabel.innerHTML = `<span>TILE PALETTE</span>`;
    const zoomRow = document.createElement('span');
    zoomRow.style.cssText = 'opacity:0.5;font-size:10px;';
    for (const z of [1, 2, 4]) {
      const zBtn = document.createElement('button');
      zBtn.textContent = `${z}×`;
      zBtn.style.cssText = 'background:#313244;color:#cdd6f4;border:none;border-radius:3px;padding:1px 5px;cursor:pointer;font-size:10px;margin-left:3px;';
      zBtn.onclick = () => { this._palZoom = z; this._renderPalette(); };
      zoomRow.appendChild(zBtn);
    }
    paletteLabel.appendChild(zoomRow);
    paletteSection.appendChild(paletteLabel);

    this._paletteCanvas.style.cssText = 'border:1px solid #45475a;cursor:pointer;image-rendering:pixelated;';
    this._paletteCanvas.onclick = (e) => this._onPaletteClick(e);
    paletteSection.appendChild(this._paletteCanvas);

    this._tileInfoEl = document.createElement('div');
    this._tileInfoEl.style.cssText = 'margin-top:4px;opacity:0.7;font-size:11px;';
    paletteSection.appendChild(this._tileInfoEl);
    root.appendChild(paletteSection);

    // Brush options
    this._brushOptionsEl = document.createElement('div');
    this._brushOptionsEl.style.cssText = 'padding:6px 10px;border-top:1px solid #313244;';
    root.appendChild(this._brushOptionsEl);
    this._renderBrushOptions();

    // Layers section
    const layerSection = document.createElement('div');
    layerSection.style.cssText = 'border-top:1px solid #313244;padding:6px 10px;';
    const layerHeader = document.createElement('div');
    layerHeader.style.cssText = 'font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:4px;';
    layerHeader.innerHTML = `<span>LAYERS</span><span style="flex:1"></span>`;
    const addLayerBtn = document.createElement('button');
    addLayerBtn.textContent = '+ Layer';
    addLayerBtn.style.cssText = 'background:#45475a;color:#cdd6f4;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:10px;';
    addLayerBtn.onclick = () => this._addLayer();
    layerHeader.appendChild(addLayerBtn);
    layerSection.appendChild(layerHeader);

    this._layerListEl = document.createElement('div');
    layerSection.appendChild(this._layerListEl);
    root.appendChild(layerSection);

    this._renderDropdowns();
  }

  private _renderAll(): void {
    this._renderDropdowns();
    this._renderPalette();
    this._renderLayerList();
    this._renderTileInfo();
  }

  private _renderDropdowns(): void {
    const section = this._container.querySelector('.tile-dropdowns');
    if (!section) return;
    section.innerHTML = '';

    // Tilemap dropdown
    const tmRow = this._makeDropdownRow('TARGET TILEMAP', this._tilemaps.map(t => ({ id: t.assetId, label: t.assetName })),
      this._activeTilemap?.assetId ?? '', (id) => this.selectTilemap(id));
    section.appendChild(tmRow);

    // Layer dropdown
    if (this._activeTilemap) {
      const layerRow = this._makeDropdownRow('LAYER', this._activeTilemap.layers.map(l => ({ id: l.layerId, label: l.name })),
        this._activeLayer?.layerId ?? '', (id) => {
          this._activeLayer = this._activeTilemap!.layers.find(l => l.layerId === id) ?? null;
          this._renderLayerList();
        });
      section.appendChild(layerRow);
    }

    // Tileset dropdown
    const tsRow = this._makeDropdownRow('TILESET', this._tilesets.map(t => ({ id: t.assetId, label: t.assetName })),
      this._activeTileset?.assetId ?? '', (id) => {
        this._activeTileset = this._tilesets.find(t => t.assetId === id) ?? null;
        this._renderPalette();
      });
    section.appendChild(tsRow);
  }

  private _renderToolbar(): void {
    if (!this._toolbarEl) return;
    this._toolbarEl.innerHTML = '';

    const tools: { id: TileTool; icon: string; label: string }[] = [
      { id: 'paint', icon: '🖌', label: 'Paint' },
      { id: 'erase', icon: '⌫', label: 'Erase' },
      { id: 'fill', icon: '◻', label: 'Fill' },
      { id: 'select', icon: '⬚', label: 'Select' },
      { id: 'rect', icon: '▭', label: 'Rect' },
      { id: 'line', icon: '╱', label: 'Line' },
      { id: 'pick', icon: '👁', label: 'Pick' },
      { id: 'moveLayer', icon: '✥', label: 'Move' },
    ];

    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.innerHTML = `${tool.icon} ${tool.label}`;
      const isActive = this._activeTool === tool.id;
      btn.style.cssText = `background:${isActive ? '#585b70' : '#45475a'};color:#cdd6f4;border:${isActive ? '1px solid #89b4fa' : 'none'};border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;`;
      btn.onclick = () => { this._activeTool = tool.id; this._renderToolbar(); };
      this._toolbarEl.appendChild(btn);
    }
  }

  private _renderPalette(): void {
    if (!this._activeTileset?.image) return;
    const ts = this._activeTileset;
    const z = this._palZoom;
    this._paletteCanvas.width = ts.textureWidth * z;
    this._paletteCanvas.height = ts.textureHeight * z;
    this._palCtx.imageSmoothingEnabled = false;
    this._palCtx.clearRect(0, 0, this._paletteCanvas.width, this._paletteCanvas.height);
    this._palCtx.drawImage(ts.image!, 0, 0, ts.textureWidth * z, ts.textureHeight * z);

    // Draw grid
    this._palCtx.strokeStyle = 'rgba(255,255,255,0.15)';
    this._palCtx.lineWidth = 1;
    for (let x = 0; x <= ts.columns; x++) {
      this._palCtx.beginPath();
      this._palCtx.moveTo(x * ts.tileWidth * z, 0);
      this._palCtx.lineTo(x * ts.tileWidth * z, this._paletteCanvas.height);
      this._palCtx.stroke();
    }
    for (let y = 0; y <= ts.rows; y++) {
      this._palCtx.beginPath();
      this._palCtx.moveTo(0, y * ts.tileHeight * z);
      this._palCtx.lineTo(this._paletteCanvas.width, y * ts.tileHeight * z);
      this._palCtx.stroke();
    }

    // Highlight selected tile
    const col = this._selectedTileId % ts.columns;
    const row = Math.floor(this._selectedTileId / ts.columns);
    this._palCtx.strokeStyle = '#89b4fa';
    this._palCtx.lineWidth = 2;
    this._palCtx.strokeRect(col * ts.tileWidth * z, row * ts.tileHeight * z, ts.tileWidth * z, ts.tileHeight * z);
  }

  private _renderLayerList(): void {
    if (!this._layerListEl || !this._activeTilemap) return;
    this._layerListEl.innerHTML = '';

    for (const layer of this._activeTilemap.layers) {
      const row = document.createElement('div');
      const isActive = layer === this._activeLayer;
      row.style.cssText = `display:flex;align-items:center;gap:4px;padding:3px 6px;border-radius:3px;cursor:pointer;${isActive ? 'background:#45475a;' : ''}`;
      row.onclick = () => { this._activeLayer = layer; this._renderLayerList(); };

      // Visibility
      const visBtn = document.createElement('button');
      visBtn.textContent = layer.visible ? '👁' : '🚫';
      visBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;padding:1px;';
      visBtn.onclick = (e) => { e.stopPropagation(); layer.visible = !layer.visible; this._renderLayerList(); this._emitChanged(); };
      row.appendChild(visBtn);

      // Lock
      const lockBtn = document.createElement('button');
      lockBtn.textContent = layer.locked ? '🔒' : '🔓';
      lockBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;padding:1px;';
      lockBtn.onclick = (e) => { e.stopPropagation(); layer.locked = !layer.locked; this._renderLayerList(); };
      row.appendChild(lockBtn);

      // Name
      const nameSpan = document.createElement('span');
      nameSpan.textContent = layer.name;
      nameSpan.style.cssText = 'flex:1;';
      row.appendChild(nameSpan);

      // Z
      const zSpan = document.createElement('span');
      zSpan.textContent = `Z:${layer.z}`;
      zSpan.style.cssText = 'opacity:0.5;font-size:10px;';
      row.appendChild(zSpan);

      // Collision badge
      if (layer.hasCollision) {
        const colBadge = document.createElement('span');
        colBadge.textContent = '🔲';
        colBadge.title = 'Has collision';
        colBadge.style.cssText = 'font-size:10px;cursor:pointer;';
        colBadge.onclick = (e) => { e.stopPropagation(); layer.hasCollision = false; this._renderLayerList(); this._scheduleCollisionRebuild(layer); };
        row.appendChild(colBadge);
      }

      this._layerListEl.appendChild(row);
    }
  }

  private _renderBrushOptions(): void {
    if (!this._brushOptionsEl) return;
    this._brushOptionsEl.innerHTML = `
      <div style="font-weight:600;margin-bottom:3px">BRUSH OPTIONS</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span>Size <input type="number" value="${this._brushSize.w}" min="1" max="10" style="width:35px" class="brush-w">×<input type="number" value="${this._brushSize.h}" min="1" max="10" style="width:35px" class="brush-h"></span>
        <label><input type="checkbox" class="flip-x" ${this._flipX ? 'checked' : ''}> Flip X</label>
        <label><input type="checkbox" class="flip-y" ${this._flipY ? 'checked' : ''}> Flip Y</label>
        <span>Rotation <select class="rotation"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></span>
      </div>
    `;
    // Style inputs
    this._brushOptionsEl.querySelectorAll('input, select').forEach(el => {
      (el as HTMLElement).style.cssText = 'background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:2px 4px;font-size:11px;';
    });

    const bw = this._brushOptionsEl.querySelector('.brush-w') as HTMLInputElement;
    const bh = this._brushOptionsEl.querySelector('.brush-h') as HTMLInputElement;
    const fx = this._brushOptionsEl.querySelector('.flip-x') as HTMLInputElement;
    const fy = this._brushOptionsEl.querySelector('.flip-y') as HTMLInputElement;
    const rot = this._brushOptionsEl.querySelector('.rotation') as HTMLSelectElement;

    if (bw) bw.onchange = () => { this._brushSize.w = parseInt(bw.value) || 1; };
    if (bh) bh.onchange = () => { this._brushSize.h = parseInt(bh.value) || 1; };
    if (fx) fx.onchange = () => { this._flipX = fx.checked; };
    if (fy) fy.onchange = () => { this._flipY = fy.checked; };
    if (rot) {
      rot.value = String(this._rotation);
      rot.onchange = () => { this._rotation = parseInt(rot.value); };
    }
  }

  private _renderTileInfo(): void {
    if (!this._tileInfoEl || !this._activeTileset) return;
    const ts = this._activeTileset;
    const tileDef = ts.tiles[this._selectedTileId];
    const col = this._selectedTileId % ts.columns;
    const row = Math.floor(this._selectedTileId / ts.columns);
    this._tileInfoEl.innerHTML = `Selected: tile ${this._selectedTileId} (${col},${row})`;
    if (tileDef) {
      this._tileInfoEl.innerHTML += ` | Tags: ${tileDef.tags.join(', ') || 'none'} | Collision: ${tileDef.collision}`;
    }
  }

  // ---- Palette interaction ----

  private _onPaletteClick(e: MouseEvent): void {
    if (!this._activeTileset) return;
    const rect = this._paletteCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this._palZoom;
    const y = (e.clientY - rect.top) / this._palZoom;
    const col = Math.floor(x / this._activeTileset.tileWidth);
    const row = Math.floor(y / this._activeTileset.tileHeight);
    this._selectedTileId = row * this._activeTileset.columns + col;
    this._renderPalette();
    this._renderTileInfo();
  }

  // ---- Paint operations (called by viewport when in 2D tile-paint mode) ----

  paintAt(worldX: number, worldY: number): void {
    if (!this._activeTilemap || !this._activeLayer || !this._activeTileset) return;
    if (this._activeLayer.locked) return;

    this._pushUndo();
    const ppu = this._activeTileset.pixelsPerUnit;
    const cellX = Math.floor(worldX / (this._activeTileset.tileWidth / ppu));
    const cellY = Math.floor(worldY / (this._activeTileset.tileHeight / ppu));

    for (let dy = 0; dy < this._brushSize.h; dy++) {
      for (let dx = 0; dx < this._brushSize.w; dx++) {
        const key = `${cellX + dx},${cellY + dy}`;
        if (this._activeTool === 'paint') {
          this._activeLayer.tiles[key] = this._selectedTileId;
        } else if (this._activeTool === 'erase') {
          delete this._activeLayer.tiles[key];
        }
      }
    }

    this._scheduleCollisionRebuild(this._activeLayer);
    this._emitChanged();
  }

  fillAt(worldX: number, worldY: number): void {
    if (!this._activeTilemap || !this._activeLayer || !this._activeTileset) return;
    if (this._activeLayer.locked) return;

    this._pushUndo();
    const ppu = this._activeTileset.pixelsPerUnit;
    const cellX = Math.floor(worldX / (this._activeTileset.tileWidth / ppu));
    const cellY = Math.floor(worldY / (this._activeTileset.tileHeight / ppu));
    const startKey = `${cellX},${cellY}`;
    const targetId = this._activeLayer.tiles[startKey] ?? null;
    const fillId = this._selectedTileId;
    if (targetId === fillId) return;

    const layer = this._activeLayer;
    const queue = [{ x: cellX, y: cellY }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      const currentId = layer.tiles[key] ?? null;
      if (currentId !== targetId) continue;
      visited.add(key);
      layer.tiles[key] = fillId;
      queue.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
    }

    this._scheduleCollisionRebuild(this._activeLayer);
    this._emitChanged();
  }

  // ---- Undo / Redo ----

  private _pushUndo(): void {
    if (!this._activeLayer) return;
    this._undoStack.push({ layerId: this._activeLayer.layerId, tiles: { ...this._activeLayer.tiles } });
    this._redoStack = [];
    if (this._undoStack.length > 100) this._undoStack.shift();
  }

  undo(): void {
    if (this._undoStack.length === 0 || !this._activeTilemap) return;
    const snapshot = this._undoStack.pop()!;
    const layer = this._activeTilemap.layers.find(l => l.layerId === snapshot.layerId);
    if (!layer) return;
    this._redoStack.push({ layerId: layer.layerId, tiles: { ...layer.tiles } });
    layer.tiles = snapshot.tiles;
    this._scheduleCollisionRebuild(layer);
    this._emitChanged();
  }

  redo(): void {
    if (this._redoStack.length === 0 || !this._activeTilemap) return;
    const snapshot = this._redoStack.pop()!;
    const layer = this._activeTilemap.layers.find(l => l.layerId === snapshot.layerId);
    if (!layer) return;
    this._undoStack.push({ layerId: layer.layerId, tiles: { ...layer.tiles } });
    layer.tiles = snapshot.tiles;
    this._scheduleCollisionRebuild(layer);
    this._emitChanged();
  }

  // ---- Collision rebuild (debounced 200ms) ----

  private _scheduleCollisionRebuild(layer: TilemapLayer): void {
    if (this._collisionRebuildTimer) clearTimeout(this._collisionRebuildTimer);
    this._collisionRebuildTimer = setTimeout(() => {
      if (this._activeTileset && this._physics2DWorld) {
        this._collisionBuilder.rebuild(layer, this._physics2DWorld, this._activeTileset);
      }
    }, 200);
  }

  // ---- Layer management ----

  private _addLayer(): void {
    if (!this._activeTilemap) return;
    const name = prompt('Layer name:', 'NewLayer');
    if (!name?.trim()) return;
    const maxZ = Math.max(...this._activeTilemap.layers.map(l => l.z), 0);
    this._activeTilemap.layers.push({
      layerId: `layer-${Date.now().toString(36)}`,
      name: name.trim(),
      z: maxZ + 5,
      visible: true,
      locked: false,
      hasCollision: false,
      tiles: {},
    });
    this._renderLayerList();
    this._emitChanged();
  }

  private _emitChanged(): void {
    if (this._activeTilemap) this._onTilemapChanged?.(this._activeTilemap);
  }

  // ---- Utilities ----

  private _makeDropdownRow(label: string, options: { id: string; label: string }[], activeId: string, onChange: (id: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'width:100px;font-size:11px;opacity:0.7;';
    row.appendChild(labelEl);

    const select = document.createElement('select');
    select.style.cssText = 'flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:3px 6px;font-size:11px;';
    for (const opt of options) {
      const optEl = document.createElement('option');
      optEl.value = opt.id;
      optEl.textContent = opt.label;
      if (opt.id === activeId) optEl.selected = true;
      select.appendChild(optEl);
    }
    select.onchange = () => onChange(select.value);
    row.appendChild(select);
    return row;
  }

  get activeTool(): TileTool { return this._activeTool; }
  get activeTilemap(): TilemapAsset | null { return this._activeTilemap; }
  get activeLayer(): TilemapLayer | null { return this._activeLayer; }

  dispose(): void {
    if (this._collisionRebuildTimer) clearTimeout(this._collisionRebuildTimer);
    this._container.innerHTML = '';
  }
}
