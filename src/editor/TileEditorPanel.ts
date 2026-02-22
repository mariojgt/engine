// ============================================================
//  TileEditorPanel — Dockable panel for tile painting
//  Target tilemap, layer, tileset selection. Paint/Erase/Fill/
//  Rectangle/Line/Pick tools. Real-time collision rebuild.
// ============================================================

import type { TilemapAsset, TilemapLayer, TilesetAsset } from '../engine/TilemapData';
import { TilemapCollisionBuilder, createDefaultTilemap, createTilesetFromImage } from '../engine/TilemapData';
import { iconHTML, Icons, ICON_COLORS } from './icons';

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

  // Multi-tile palette selection (rectangular region)
  // When the user drags on the palette, this stores the top-left tile column/row
  // and the width/height of the selection in tiles.  A 1×1 selection is identical
  // to the old single-tile behaviour.  _selectedTileId always tracks the
  // top-left tile of the selection.
  private _selectionRect = { col: 0, row: 0, w: 1, h: 1 };
  private _palDragStart: { col: number; row: number } | null = null;
  private _palDragging = false;

  // Palette canvas
  private _paletteCanvas: HTMLCanvasElement;
  private _palCtx: CanvasRenderingContext2D;
  private _palZoom = 2;

  /** Whether the tile editor panel is currently visible (active tab in dockview) */
  get isVisible(): boolean {
    // Dockview hides inactive tabs via display:none on the .dv-view ancestor.
    // offsetParent is null when the element (or an ancestor) has display:none.
    return this._container.offsetParent !== null;
  }

  // Collision builder
  private _collisionBuilder = new TilemapCollisionBuilder();
  private _collisionRebuildTimer: ReturnType<typeof setTimeout> | null = null;

  // Undo stack
  private _undoStack: { layerId: string; tiles: Record<string, number> }[] = [];
  private _redoStack: { layerId: string; tiles: Record<string, number> }[] = [];

  // Pixel-perfect mode
  private _pixelPerfect = false;

  // Callbacks
  private _onTilemapChanged: ((tilemap: TilemapAsset) => void) | null = null;
  private _onLayerPainted: ((tilemapId: string, layerId: string) => void) | null = null;
  private _onPixelPerfectChanged: ((enabled: boolean, tileset: TilesetAsset | null) => void) | null = null;
  private _physics2DWorld: any = null;
  private _scene2D: any = null;

  // Sections
  private _layerListEl: HTMLElement | null = null;
  private _toolbarEl: HTMLElement | null = null;
  private _brushOptionsEl: HTMLElement | null = null;
  private _tileInfoEl: HTMLElement | null = null;
  private _actionBarEl: HTMLElement | null = null;
  private _emptyStateEl: HTMLElement | null = null;

  constructor(container: HTMLElement, scene2D?: any) {
    this._container = container;
    if (scene2D) this._scene2D = scene2D;
    this._paletteCanvas = document.createElement('canvas');
    this._paletteCanvas.width = 256;
    this._paletteCanvas.height = 256;
    this._palCtx = this._paletteCanvas.getContext('2d')!;
    this._palCtx.imageSmoothingEnabled = false;
    this._build();
  }

  setTilemaps(tilemaps: TilemapAsset[]): void {
    this._tilemaps = tilemaps;
    // Auto-select the first tilemap if none is selected yet
    if (!this._activeTilemap && tilemaps.length > 0) {
      this.selectTilemap(tilemaps[0].assetId);
    } else {
      this._renderDropdowns();
      this._renderActionBar();
      this._renderEmptyState();
    }
  }

  setTilesets(tilesets: TilesetAsset[]): void {
    this._tilesets = tilesets;
    // If we have an active tilemap, try to resolve its tileset
    if (this._activeTilemap && !this._activeTileset) {
      this._activeTileset = tilesets.find(t => t.assetId === this._activeTilemap!.tilesetId) ?? null;
    }
    this._renderDropdowns();
    this._renderActionBar();
    this._renderEmptyState();
    this._renderPalette();
  }

  setPhysics2DWorld(world: any): void { this._physics2DWorld = world; }
  setScene2DManager(scene2D: any): void { this._scene2D = scene2D; }
  onTilemapChanged(cb: (tilemap: TilemapAsset) => void): void { this._onTilemapChanged = cb; }
  onLayerPainted(cb: (tilemapId: string, layerId: string) => void): void { this._onLayerPainted = cb; }
  onPixelPerfectChanged(cb: (enabled: boolean, tileset: TilesetAsset | null) => void): void { this._onPixelPerfectChanged = cb; }

  selectTilemap(tilemapId: string): void {
    this._activeTilemap = this._tilemaps.find(t => t.assetId === tilemapId) ?? null;
    if (this._activeTilemap) {
      this._activeLayer = this._activeTilemap.layers[0] ?? null;
      this._activeTileset = this._tilesets.find(t => t.assetId === this._activeTilemap!.tilesetId) ?? null;
    }
    this._renderAll();
    // Notify the renderer so it switches to the newly-selected tilemap + tileset
    this._emitChanged();
  }

  private _build(): void {
    const root = this._container;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#1e1e2e;color:#cdd6f4;font-family:Inter,sans-serif;font-size:12px;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid #313244;gap:8px;';
    header.innerHTML = `${iconHTML(Icons.Grid, 'xs', ICON_COLORS.muted)}<span style="font-weight:600;flex:1">TILE EDITOR</span>`;
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = iconHTML(Icons.Settings, 'xs', ICON_COLORS.muted);
    settingsBtn.style.cssText = 'background:none;border:none;color:#cdd6f4;cursor:pointer;';
    header.appendChild(settingsBtn);
    root.appendChild(header);

    // Dropdowns section
    const dropdownSection = document.createElement('div');
    dropdownSection.className = 'tile-dropdowns';
    dropdownSection.style.cssText = 'padding:6px 10px;border-bottom:1px solid #313244;';
    root.appendChild(dropdownSection);

    // Action bar (Import Tileset / New Tilemap)
    this._actionBarEl = document.createElement('div');
    this._actionBarEl.style.cssText = 'display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid #313244;flex-wrap:wrap;';
    root.appendChild(this._actionBarEl);

    // Empty state overlay (shown when no tilesets or tilemaps)
    this._emptyStateEl = document.createElement('div');
    this._emptyStateEl.style.cssText = 'display:none;padding:20px 14px;text-align:center;';
    root.appendChild(this._emptyStateEl);

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
    this._paletteCanvas.addEventListener('mousedown', (e) => this._onPaletteMouseDown(e));
    this._paletteCanvas.addEventListener('mousemove', (e) => this._onPaletteMouseMove(e));
    window.addEventListener('mouseup', (e) => this._onPaletteMouseUp(e));
    paletteSection.appendChild(this._paletteCanvas);

    this._tileInfoEl = document.createElement('div');
    this._tileInfoEl.style.cssText = 'margin-top:4px;opacity:0.7;font-size:11px;';
    paletteSection.appendChild(this._tileInfoEl);
    root.appendChild(paletteSection);

    // Tile scale settings (PPU matching)
    const tileScaleSection = document.createElement('div');
    tileScaleSection.className = 'tile-scale-section';
    tileScaleSection.style.cssText = 'padding:6px 10px;border-top:1px solid #313244;';
    root.appendChild(tileScaleSection);

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
    this._renderActionBar();
    this._renderEmptyState();
  }

  private _renderAll(): void {
    this._renderDropdowns();
    this._renderActionBar();
    this._renderPalette();
    this._renderLayerList();
    this._renderTileInfo();
    this._renderEmptyState();
    this._renderTileScaleSettings();
  }

  private _renderDropdowns(): void {
    const section = this._container.querySelector('.tile-dropdowns');
    if (!section) return;
    section.innerHTML = '';

    // Tilemap dropdown
    const tmOptions = this._tilemaps.map(t => ({ id: t.assetId, label: t.assetName }));
    const tmRow = this._makeDropdownRow('TARGET TILEMAP', tmOptions,
      this._activeTilemap?.assetId ?? '', (id) => this.selectTilemap(id),
      tmOptions.length === 0 ? '— No Tilemaps —' : undefined);
    section.appendChild(tmRow);

    // Layer dropdown
    if (this._activeTilemap) {
      const layerOptions = this._activeTilemap.layers.map(l => ({ id: l.layerId, label: l.name }));
      const layerRow = this._makeDropdownRow('LAYER', layerOptions,
        this._activeLayer?.layerId ?? '', (id) => {
          this._activeLayer = this._activeTilemap!.layers.find(l => l.layerId === id) ?? null;
          this._renderLayerList();
        },
        layerOptions.length === 0 ? '— No Layers —' : undefined);
      section.appendChild(layerRow);
    } else {
      // Show disabled layer dropdown when no tilemap selected
      const layerRow = this._makeDropdownRow('LAYER', [],
        '', () => {}, '— Select a Tilemap —');
      section.appendChild(layerRow);
    }

    // Tileset dropdown
    const tsOptions = this._tilesets.map(t => ({ id: t.assetId, label: t.assetName }));
    const tsRow = this._makeDropdownRow('TILESET', tsOptions,
      this._activeTileset?.assetId ?? '', (id) => {
        this._activeTileset = this._tilesets.find(t => t.assetId === id) ?? null;
        if (this._activeTileset) {
          // Find a tilemap that uses this tileset, or auto-create one
          const matchingTm = this._tilemaps.find(tm => tm.tilesetId === this._activeTileset!.assetId);
          if (matchingTm) {
            this.selectTilemap(matchingTm.assetId);
          } else {
            this._createTilemapSilent(this._activeTileset.assetId);
            this._renderAll();
          }
        } else {
          this._renderPalette();
        }
      },
      tsOptions.length === 0 ? '— No Tilesets —' : undefined);
    section.appendChild(tsRow);
  }

  private _renderToolbar(): void {
    if (!this._toolbarEl) return;
    this._toolbarEl.innerHTML = '';

    const tools: { id: TileTool; icon: string; label: string }[] = [
      { id: 'paint', icon: iconHTML(Icons.Paintbrush, 'xs'), label: 'Paint' },
      { id: 'erase', icon: iconHTML(Icons.Eraser, 'xs'), label: 'Erase' },
      { id: 'fill', icon: iconHTML(Icons.PaintBucket, 'xs'), label: 'Fill' },
      { id: 'select', icon: iconHTML(Icons.SquareDashed, 'xs'), label: 'Select' },
      { id: 'rect', icon: iconHTML(Icons.RectangleHorizontal, 'xs'), label: 'Rect' },
      { id: 'line', icon: iconHTML(Icons.Minus, 'xs'), label: 'Line' },
      { id: 'pick', icon: iconHTML(Icons.Eye, 'xs'), label: 'Pick' },
      { id: 'moveLayer', icon: iconHTML(Icons.Move, 'xs'), label: 'Move' },
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
    if (!this._activeTileset) {
      // Clear palette and show hint
      this._paletteCanvas.width = 256;
      this._paletteCanvas.height = 64;
      this._palCtx.fillStyle = '#181825';
      this._palCtx.fillRect(0, 0, 256, 64);
      this._palCtx.fillStyle = '#6c7086';
      this._palCtx.font = '12px Inter, sans-serif';
      this._palCtx.textAlign = 'center';
      this._palCtx.fillText('Import a tileset to see tiles', 128, 36);
      return;
    }
    if (!this._activeTileset.image) {
      // Tileset exists but image not loaded
      this._paletteCanvas.width = 256;
      this._paletteCanvas.height = 64;
      this._palCtx.fillStyle = '#181825';
      this._palCtx.fillRect(0, 0, 256, 64);
      this._palCtx.fillStyle = '#6c7086';
      this._palCtx.font = '12px Inter, sans-serif';
      this._palCtx.textAlign = 'center';
      this._palCtx.fillText('Tileset image not loaded', 128, 36);
      return;
    }
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

    // Highlight selected tile region
    const { col: selCol, row: selRow, w: selW, h: selH } = this._selectionRect;
    this._palCtx.strokeStyle = '#89b4fa';
    this._palCtx.lineWidth = 2;
    this._palCtx.strokeRect(
      selCol * ts.tileWidth * z,
      selRow * ts.tileHeight * z,
      selW * ts.tileWidth * z,
      selH * ts.tileHeight * z,
    );
    // Dimmed overlay on each selected sub-tile for clarity
    if (selW > 1 || selH > 1) {
      this._palCtx.fillStyle = 'rgba(137, 180, 250, 0.12)';
      this._palCtx.fillRect(
        selCol * ts.tileWidth * z,
        selRow * ts.tileHeight * z,
        selW * ts.tileWidth * z,
        selH * ts.tileHeight * z,
      );
    }
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
      visBtn.innerHTML = layer.visible ? iconHTML(Icons.Eye, 'xs', ICON_COLORS.muted) : iconHTML(Icons.EyeOff, 'xs', ICON_COLORS.muted);
      visBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;padding:1px;';
      visBtn.onclick = (e) => { e.stopPropagation(); layer.visible = !layer.visible; this._renderLayerList(); this._emitChanged(); };
      row.appendChild(visBtn);

      // Lock
      const lockBtn = document.createElement('button');
      lockBtn.innerHTML = layer.locked ? iconHTML(Icons.Lock, 'xs', ICON_COLORS.muted) : iconHTML(Icons.Unlock, 'xs', ICON_COLORS.muted);
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

      // Collision toggle (always visible so users can enable/disable)
      const colBtn = document.createElement('button');
      colBtn.innerHTML = layer.hasCollision ? iconHTML(Icons.Shield, 'xs', ICON_COLORS.success) : iconHTML(Icons.Shield, 'xs', ICON_COLORS.muted);
      colBtn.title = layer.hasCollision ? 'Collision ON – click to disable' : 'Collision OFF – click to enable';
      colBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;padding:1px;';
      colBtn.onclick = (e) => {
        e.stopPropagation();
        layer.hasCollision = !layer.hasCollision;
        // NOTE: Do NOT mutate TileDefData.collision here.
        // TilemapCollisionBuilder.rebuild() uses forceFullCollision=true whenever
        // layer.hasCollision is set, so all placed tiles are treated as solid
        // regardless of their individual TileDefData.collision value.
        // Mutating every tileDef would corrupt per-tile rules (one-way platforms etc.)
        this._renderLayerList();
        this._scheduleCollisionRebuild(layer);
      };
      row.appendChild(colBtn);

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
    const { col: selCol, row: selRow, w: selW, h: selH } = this._selectionRect;
    if (selW > 1 || selH > 1) {
      // Multi-tile selection
      this._tileInfoEl.innerHTML = `Selected: ${selW}×${selH} tiles (${selCol},${selRow}) → (${selCol + selW - 1},${selRow + selH - 1})`;
      return;
    }
    // Single tile — show full details
    const tileDef = ts.tiles[this._selectedTileId];
    const col = this._selectedTileId % ts.columns;
    const row = Math.floor(this._selectedTileId / ts.columns);
    this._tileInfoEl.innerHTML = `Selected: tile ${this._selectedTileId} (${col},${row})`;
    if (tileDef) {
      this._tileInfoEl.innerHTML += ` | Tags: ${tileDef.tags.join(', ') || 'none'}`;
      // Per-tile collision dropdown
      const colLabel = document.createElement('span');
      colLabel.textContent = ' | Collision: ';
      this._tileInfoEl.appendChild(colLabel);
      const sel = document.createElement('select');
      sel.style.cssText = 'font-size:10px;background:#313244;color:#cdd6f4;border:1px solid #585b70;border-radius:3px;padding:1px 2px;';
      for (const opt of ['none', 'full', 'top', 'bottom', 'left', 'right'] as const) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (tileDef.collision === opt) o.selected = true;
        sel.appendChild(o);
      }
      sel.onchange = () => {
        tileDef.collision = sel.value as any;
        // Rebuild collision for active layers that have collision enabled
        if (this._activeTilemap) {
          for (const layer of this._activeTilemap.layers) {
            if (layer.hasCollision) this._scheduleCollisionRebuild(layer);
          }
        }
        this._emitChanged();
      };
      this._tileInfoEl.appendChild(sel);
    }
  }

  // ---- Palette interaction (multi-tile drag selection) ----

  /** Convert a mouse event on the palette canvas to a tile column/row. */
  private _paletteEventToCell(e: MouseEvent): { col: number; row: number } | null {
    if (!this._activeTileset) return null;
    const rect = this._paletteCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this._palZoom;
    const y = (e.clientY - rect.top) / this._palZoom;
    const col = Math.min(Math.max(Math.floor(x / this._activeTileset.tileWidth), 0), this._activeTileset.columns - 1);
    const row = Math.min(Math.max(Math.floor(y / this._activeTileset.tileHeight), 0), this._activeTileset.rows - 1);
    return { col, row };
  }

  private _onPaletteMouseDown(e: MouseEvent): void {
    const cell = this._paletteEventToCell(e);
    if (!cell) return;
    this._palDragStart = cell;
    this._palDragging = true;
    // Immediately set a 1×1 selection at the click point
    this._selectionRect = { col: cell.col, row: cell.row, w: 1, h: 1 };
    this._selectedTileId = cell.row * this._activeTileset!.columns + cell.col;
    this._renderPalette();
    this._renderTileInfo();
  }

  private _onPaletteMouseMove(e: MouseEvent): void {
    if (!this._palDragging || !this._palDragStart || !this._activeTileset) return;
    const cell = this._paletteEventToCell(e);
    if (!cell) return;
    const minCol = Math.min(this._palDragStart.col, cell.col);
    const maxCol = Math.max(this._palDragStart.col, cell.col);
    const minRow = Math.min(this._palDragStart.row, cell.row);
    const maxRow = Math.max(this._palDragStart.row, cell.row);
    this._selectionRect = { col: minCol, row: minRow, w: maxCol - minCol + 1, h: maxRow - minRow + 1 };
    // _selectedTileId stays as top-left tile of selection
    this._selectedTileId = minRow * this._activeTileset.columns + minCol;
    this._renderPalette();
    this._renderTileInfo();
  }

  private _onPaletteMouseUp(_e: MouseEvent): void {
    if (!this._palDragging) return;
    this._palDragging = false;
    this._palDragStart = null;
  }

  /**
   * Returns the 2D array of tile IDs for the current palette selection.
   * The array is indexed [row][col] relative to the selection top-left.
   * For a 1×1 selection this returns [[selectedTileId]].
   */
  getSelectionStamp(): number[][] {
    if (!this._activeTileset) return [[this._selectedTileId]];
    const { col, row, w, h } = this._selectionRect;
    const cols = this._activeTileset.columns;
    const stamp: number[][] = [];
    for (let dy = 0; dy < h; dy++) {
      const rowArr: number[] = [];
      for (let dx = 0; dx < w; dx++) {
        rowArr.push((row + dy) * cols + (col + dx));
      }
      stamp.push(rowArr);
    }
    return stamp;
  }

  // ---- Paint operations (called by viewport when in 2D tile-paint mode) ----

  paintAt(worldX: number, worldY: number): void {
    if (!this._activeTilemap || !this._activeLayer || !this._activeTileset) {
      console.warn('[TileEditor.paintAt] Aborted: tilemap=%s layer=%s tileset=%s',
        !!this._activeTilemap, !!this._activeLayer, !!this._activeTileset);
      return;
    }
    if (this._activeLayer.locked) {
      console.warn('[TileEditor.paintAt] Layer is locked');
      return;
    }

    this._pushUndo();
    const ppu = this._activeTileset.pixelsPerUnit;
    const cellX = Math.floor(worldX / (this._activeTileset.tileWidth / ppu));
    const cellY = Math.floor(worldY / (this._activeTileset.tileHeight / ppu));

    const stamp = this.getSelectionStamp();
    const stampH = stamp.length;
    const stampW = stamp[0]?.length ?? 1;

    console.log(`[TileEditor.paintAt] world=(${worldX.toFixed(3)}, ${worldY.toFixed(3)}) cell=(${cellX}, ${cellY}) stamp=${stampW}×${stampH} tool=${this._activeTool} ppu=${ppu}`);

    for (let dy = 0; dy < stampH; dy++) {
      for (let dx = 0; dx < stampW; dx++) {
        const key = `${cellX + dx},${cellY + dy}`;
        if (this._activeTool === 'paint') {
          this._activeLayer.tiles[key] = stamp[dy][dx];
        } else if (this._activeTool === 'erase') {
          delete this._activeLayer.tiles[key];
        }
      }
    }

    // When erasing, also remove overlapping tiles from ALL other tilemaps
    // that share the same layer name, so the user doesn't have to switch
    // tilesets to erase each tilemap's tiles individually.
    if (this._activeTool === 'erase') {
      const tileW = this._activeTileset.tileWidth / ppu;
      const tileH = this._activeTileset.tileHeight / ppu;
      this._eraseWorldAreaFromOtherTilemaps(
        cellX * tileW, cellY * tileH,
        (cellX + stampW) * tileW, (cellY + stampH) * tileH,
      );
    }

    this._scheduleCollisionRebuild(this._activeLayer);
    this._onLayerPainted?.(this._activeTilemap!.assetId, this._activeLayer.layerId);
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
    // Prevent runaway fills — limit to 500-cell radius from origin
    const MAX_FILL = 250_000; // 500x500 area
    const RADIUS = 500;

    while (queue.length > 0 && visited.size < MAX_FILL) {
      const { x, y } = queue.shift()!;
      // Boundary guard: skip cells too far from origin
      if (Math.abs(x - cellX) > RADIUS || Math.abs(y - cellY) > RADIUS) continue;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      const currentId = layer.tiles[key] ?? null;
      if (currentId !== targetId) continue;
      visited.add(key);
      layer.tiles[key] = fillId;
      queue.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
    }

    this._scheduleCollisionRebuild(this._activeLayer);
    // Only rebuild the affected layer, not the entire tilemap (same fix as paintAt)
    this._onLayerPainted?.(this._activeTilemap!.assetId, this._activeLayer.layerId);
  }

  /** Paint a filled rectangle of tiles between two world positions */
  paintRect(x1: number, y1: number, x2: number, y2: number): void {
    if (!this._activeTilemap || !this._activeLayer || !this._activeTileset) return;
    if (this._activeLayer.locked) return;

    this._pushUndo();
    const ppu = this._activeTileset.pixelsPerUnit;
    const tileWorldW = this._activeTileset.tileWidth / ppu;
    const tileWorldH = this._activeTileset.tileHeight / ppu;

    const startCX = Math.floor(x1 / tileWorldW);
    const startCY = Math.floor(y1 / tileWorldH);
    const endCX = Math.floor(x2 / tileWorldW);
    const endCY = Math.floor(y2 / tileWorldH);
    const minCX = Math.min(startCX, endCX);
    const maxCX = Math.max(startCX, endCX);
    const minCY = Math.min(startCY, endCY);
    const maxCY = Math.max(startCY, endCY);

    const stamp = this.getSelectionStamp();
    const stampH = stamp.length;
    const stampW = stamp[0]?.length ?? 1;

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = `${cx},${cy}`;
        if (this._activeTool === 'erase') {
          delete this._activeLayer.tiles[key];
        } else {
          // Tile the stamp across the rectangle
          const sx = ((cx - minCX) % stampW + stampW) % stampW;
          const sy = ((cy - minCY) % stampH + stampH) % stampH;
          this._activeLayer.tiles[key] = stamp[sy][sx];
        }
      }
    }

    // When erasing, also clear overlapping tiles from other tilemaps
    if (this._activeTool === 'erase') {
      this._eraseWorldAreaFromOtherTilemaps(
        minCX * tileWorldW, minCY * tileWorldH,
        (maxCX + 1) * tileWorldW, (maxCY + 1) * tileWorldH,
      );
    }

    this._scheduleCollisionRebuild(this._activeLayer);
    this._onLayerPainted?.(this._activeTilemap!.assetId, this._activeLayer.layerId);
  }

  /** Paint a line of tiles between two world positions (Bresenham) */
  paintLine(x1: number, y1: number, x2: number, y2: number): void {
    if (!this._activeTilemap || !this._activeLayer || !this._activeTileset) return;
    if (this._activeLayer.locked) return;

    this._pushUndo();
    const ppu = this._activeTileset.pixelsPerUnit;
    const tileWorldW = this._activeTileset.tileWidth / ppu;
    const tileWorldH = this._activeTileset.tileHeight / ppu;

    let cx = Math.floor(x1 / tileWorldW);
    let cy = Math.floor(y1 / tileWorldH);
    const ex = Math.floor(x2 / tileWorldW);
    const ey = Math.floor(y2 / tileWorldH);

    const stamp = this.getSelectionStamp();
    const stampH = stamp.length;
    const stampW = stamp[0]?.length ?? 1;

    const dx = Math.abs(ex - cx);
    const dy = Math.abs(ey - cy);
    const sx = cx < ex ? 1 : -1;
    const sy = cy < ey ? 1 : -1;
    let err = dx - dy;

    const erasedLineCells: Array<[number, number]> = [];

    while (true) {
      if (this._activeTool === 'erase') {
        const key = `${cx},${cy}`;
        delete this._activeLayer.tiles[key];
        erasedLineCells.push([cx, cy]);
      } else {
        // Stamp the full selection centered on the line point
        for (let sdy = 0; sdy < stampH; sdy++) {
          for (let sdx = 0; sdx < stampW; sdx++) {
            const key = `${cx + sdx},${cy + sdy}`;
            this._activeLayer.tiles[key] = stamp[sdy][sdx];
          }
        }
      }
      if (cx === ex && cy === ey) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }

    // When erasing, also clear overlapping tiles from other tilemaps
    if (this._activeTool === 'erase' && erasedLineCells.length > 0) {
      for (const [ecx, ecy] of erasedLineCells) {
        this._eraseWorldAreaFromOtherTilemaps(
          ecx * tileWorldW, ecy * tileWorldH,
          (ecx + 1) * tileWorldW, (ecy + 1) * tileWorldH,
        );
      }
    }

    this._scheduleCollisionRebuild(this._activeLayer);
    this._onLayerPainted?.(this._activeTilemap!.assetId, this._activeLayer.layerId);
  }

  /** Pick the tile under cursor and set it as the active tile */
  pickAt(worldX: number, worldY: number): void {
    if (!this._activeTilemap || !this._activeLayer || !this._activeTileset) return;

    const ppu = this._activeTileset.pixelsPerUnit;
    const cellX = Math.floor(worldX / (this._activeTileset.tileWidth / ppu));
    const cellY = Math.floor(worldY / (this._activeTileset.tileHeight / ppu));
    const key = `${cellX},${cellY}`;
    const tileId = this._activeLayer.tiles[key];

    if (tileId !== undefined) {
      this._selectedTileId = tileId;
      const col = tileId % this._activeTileset.columns;
      const row = Math.floor(tileId / this._activeTileset.columns);
      this._selectionRect = { col, row, w: 1, h: 1 };
      this._activeTool = 'paint'; // Switch back to paint tool after picking
      this._renderPalette();
      this._renderTileInfo();
      this._renderToolbar();
      console.log(`[TileEditor.pickAt] Picked tile ${tileId} at cell (${cellX}, ${cellY})`);
    }
  }

  // ---- Cross-tilemap erase ----

  /**
   * When erasing, also remove overlapping tiles from ALL other tilemaps
   * that have a layer with the same name as the active layer.  This lets
   * the user erase visible tiles regardless of which tileset they belong
   * to, without switching tilesets manually.
   */
  private _eraseWorldAreaFromOtherTilemaps(
    worldMinX: number, worldMinY: number,
    worldMaxX: number, worldMaxY: number,
  ): void {
    if (!this._activeLayer || !this._activeTilemap) return;
    const activeLayerName = this._activeLayer.name;
    const activeTilemapId = this._activeTilemap.assetId;

    for (const tilemap of this._tilemaps) {
      if (tilemap.assetId === activeTilemapId) continue; // Already handled by caller

      const layer = tilemap.layers.find(l => l.name === activeLayerName);
      if (!layer || layer.locked) continue;

      const tileset = this._tilesets.find(t => t.assetId === tilemap.tilesetId);
      if (!tileset) continue;

      const ppu = tileset.pixelsPerUnit || 100;
      const tileW = tileset.tileWidth / ppu;
      const tileH = tileset.tileHeight / ppu;

      // Find all cells of this tilemap that overlap the erased world area
      const minCX = Math.floor(worldMinX / tileW);
      const minCY = Math.floor(worldMinY / tileH);
      const maxCX = Math.floor((worldMaxX - 0.0001) / tileW);
      const maxCY = Math.floor((worldMaxY - 0.0001) / tileH);

      let changed = false;
      for (let cy = minCY; cy <= maxCY; cy++) {
        for (let cx = minCX; cx <= maxCX; cx++) {
          const key = `${cx},${cy}`;
          if (key in layer.tiles) {
            delete layer.tiles[key];
            changed = true;
          }
        }
      }

      if (changed) {
        this._scheduleCollisionRebuild(layer);
        this._onLayerPainted?.(tilemap.assetId, layer.layerId);
      }
    }
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
    if (!this._activeTilemap) {
      // If no tilemap, try to create one automatically
      if (this._tilesets.length > 0 && this._scene2D) {
        const newTm = createDefaultTilemap('Tilemap_' + Date.now().toString(36), this._tilesets[0].assetId);
        this._scene2D.addTilemap(newTm);
        this._tilemaps = Array.from(this._scene2D.tilemaps.values());
        this.selectTilemap(newTm.assetId);
      }
      return;
    }
    const name = prompt('Layer name:', 'NewLayer');
    if (!name?.trim()) return;
    const maxZ = Math.max(...this._activeTilemap.layers.map(l => l.z), 0);
    const newLayer = {
      layerId: `layer-${Date.now().toString(36)}`,
      name: name.trim(),
      z: maxZ + 5,
      visible: true,
      locked: false,
      hasCollision: false,
      tiles: {},
    };
    this._activeTilemap.layers.push(newLayer);
    // Auto-select the new layer
    this._activeLayer = newLayer;
    this._renderLayerList();
    this._renderDropdowns();
    this._emitChanged();
  }

  private _emitChanged(): void {
    if (this._activeTilemap) this._onTilemapChanged?.(this._activeTilemap);
  }

  // ---- Action bar & empty state ----

  private _renderActionBar(): void {
    if (!this._actionBarEl) return;
    this._actionBarEl.innerHTML = '';

    const btnStyle = 'background:#45475a;color:#cdd6f4;border:1px solid #585b70;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px;white-space:nowrap;';

    const importBtn = document.createElement('button');
    importBtn.innerHTML = iconHTML(Icons.Folder, 'xs', ICON_COLORS.folder) + ' Import Tileset';
    importBtn.style.cssText = btnStyle;
    importBtn.onclick = () => this._importTileset();
    this._actionBarEl.appendChild(importBtn);

    const newTmBtn = document.createElement('button');
    newTmBtn.innerHTML = iconHTML(Icons.Plus, 'xs', ICON_COLORS.blue) + ' New Tilemap';
    newTmBtn.style.cssText = btnStyle;
    newTmBtn.disabled = this._tilesets.length === 0;
    if (this._tilesets.length === 0) {
      newTmBtn.style.cssText += 'opacity:0.4;cursor:not-allowed;';
      newTmBtn.title = 'Import a tileset first';
    }
    newTmBtn.onclick = () => this._createTilemap();
    this._actionBarEl.appendChild(newTmBtn);
  }

  private _renderEmptyState(): void {
    if (!this._emptyStateEl) return;
    const hasTilesets = this._tilesets.length > 0;
    const hasTilemaps = this._tilemaps.length > 0;

    if (hasTilesets && hasTilemaps) {
      this._emptyStateEl.style.display = 'none';
      return;
    }

    this._emptyStateEl.style.display = 'block';
    if (!hasTilesets) {
      this._emptyStateEl.innerHTML = `
        <div style="margin-bottom:8px;opacity:0.3">${iconHTML(Icons.Image, 32, ICON_COLORS.muted)}</div>
        <div style="font-weight:600;margin-bottom:6px">No Tilesets</div>
        <div style="opacity:0.7;font-size:11px;margin-bottom:12px">
          Import a tileset image (PNG) to get started.<br>
          The image will be divided into a grid of tiles.
        </div>
        <button id="__tile_empty_import" style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:12px;font-weight:600;">
          ${iconHTML(Icons.Folder, 'xs', '#1e1e2e')} Import Tileset Image
        </button>
      `;
      this._emptyStateEl.querySelector('#__tile_empty_import')!.addEventListener('click', () => this._importTileset());
    } else if (!hasTilemaps) {
      this._emptyStateEl.innerHTML = `
        <div style="margin-bottom:8px;opacity:0.3">${iconHTML(Icons.Map, 32, ICON_COLORS.muted)}</div>
        <div style="font-weight:600;margin-bottom:6px">No Tilemaps</div>
        <div style="opacity:0.7;font-size:11px;margin-bottom:12px">
          Create a tilemap to start painting tiles.
        </div>
        <button id="__tile_empty_create" style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:12px;font-weight:600;">
          ${iconHTML(Icons.Plus, 'xs', '#1e1e2e')} Create Tilemap
        </button>
      `;
      this._emptyStateEl.querySelector('#__tile_empty_create')!.addEventListener('click', () => this._createTilemap());
    }
  }

  // ---- Tile scale settings (Pixel-Perfect) ----

  private _getScenePPU(): number {
    return this._scene2D?.config?.renderSettings?.pixelsPerUnit ?? 100;
  }

  /**
   * Automatically sync the scene PPU, camera, and grid to match the
   * active tileset so that 1 tile-pixel = 1 screen-pixel at zoom 1×.
   */
  private _applyPixelPerfect(): void {
    const ts = this._activeTileset;
    if (!ts || !this._scene2D) return;

    // 1. Set the scene PPU to the tileset's PPU  →  tile world-sizes match the camera's unit scale
    this._scene2D.setPixelsPerUnit(ts.pixelsPerUnit);

    // 2. Enable pixel-perfect zoom snapping on the camera
    if (this._scene2D.camera2D) {
      this._scene2D.camera2D.setPixelPerfect(true);
    }

    // 3. Build a tile-aligned grid overlay
    const tileWorldW = ts.tileWidth / ts.pixelsPerUnit;
    const tileWorldH = ts.tileHeight / ts.pixelsPerUnit;
    this._scene2D.rebuildTileGrid(tileWorldW, tileWorldH, true);

    // 4. Notify listeners (EditorLayout wires renderer rebuild)
    this._onPixelPerfectChanged?.(true, ts);

    // 5. Rebuild layers so geometry uses the correct PPU
    this._emitChanged();

    console.log(`[TileEditor] Pixel-perfect ON — scene PPU set to ${ts.pixelsPerUnit}, tile grid ${tileWorldW.toFixed(3)}×${tileWorldH.toFixed(3)} wu`);
  }

  private _disablePixelPerfect(): void {
    if (this._scene2D?.camera2D) {
      this._scene2D.camera2D.setPixelPerfect(false);
    }
    if (this._scene2D) {
      this._scene2D.setTileGridVisible(false);
    }
    this._onPixelPerfectChanged?.(false, null);
    console.log('[TileEditor] Pixel-perfect OFF');
  }

  private _renderTileScaleSettings(): void {
    const section = this._container.querySelector('.tile-scale-section');
    if (!section) return;
    section.innerHTML = '';

    if (!this._activeTileset) return;

    const ts = this._activeTileset;
    const scenePPU = this._getScenePPU();
    const tileWorldW = (ts.tileWidth / ts.pixelsPerUnit).toFixed(3);
    const tileWorldH = (ts.tileHeight / ts.pixelsPerUnit).toFixed(3);
    const ppuMatch = ts.pixelsPerUnit === scenePPU;

    const inputStyle = 'background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:2px 6px;font-size:11px;width:55px;';

    // ── Pixel-perfect toggle row ──
    const ppRow = document.createElement('div');
    ppRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:4px 0;';

    const ppToggle = document.createElement('input');
    ppToggle.type = 'checkbox';
    ppToggle.checked = this._pixelPerfect;
    ppToggle.id = '__tile_pp_toggle';
    ppToggle.style.cssText = 'accent-color:#89b4fa;cursor:pointer;';

    const ppLabel = document.createElement('label');
    ppLabel.htmlFor = '__tile_pp_toggle';
    ppLabel.style.cssText = 'font-weight:600;font-size:11px;cursor:pointer;user-select:none;';
    ppLabel.textContent = 'Pixel-Perfect Mode';

    ppToggle.onchange = () => {
      this._pixelPerfect = ppToggle.checked;
      if (this._pixelPerfect) {
        this._applyPixelPerfect();
      } else {
        this._disablePixelPerfect();
      }
      this._renderTileScaleSettings();  // re-render to update status badges
    };

    ppRow.appendChild(ppToggle);
    ppRow.appendChild(ppLabel);

    if (this._pixelPerfect) {
      const badge = document.createElement('span');
      badge.innerHTML = iconHTML(Icons.Check, 'xs', '#a6e3a1') + ' active';
      badge.style.cssText = 'color:#a6e3a1;font-size:10px;margin-left:auto;';
      ppRow.appendChild(badge);
    }
    section.appendChild(ppRow);

    // ── Pixel-perfect info box (shown when enabled) ──
    if (this._pixelPerfect) {
      const infoBox = document.createElement('div');
      infoBox.style.cssText = 'background:#313244;border:1px solid #45475a;border-radius:4px;padding:6px 8px;margin-bottom:6px;font-size:10px;line-height:1.6;';
      infoBox.innerHTML = `
        <div><span style="color:#89b4fa">Scene PPU:</span> ${scenePPU} ${ppuMatch ? '<span style="color:#a6e3a1">' + iconHTML(Icons.Check, 'xs', '#a6e3a1') + ' synced</span>' : '<span style="color:#f9e2af">' + iconHTML(Icons.AlertTriangle, 'xs', '#f9e2af') + ' mismatch — toggle off/on to resync</span>'}</div>
        <div><span style="color:#89b4fa">Tile:</span> ${ts.tileWidth}×${ts.tileHeight}px → ${tileWorldW}×${tileWorldH} world units</div>
        <div><span style="color:#89b4fa">Zoom:</span> snapped to integer multiples (1 tile-px = N screen-px)</div>
        <div><span style="color:#89b4fa">Grid:</span> tile-aligned overlay ON</div>
      `;
      section.appendChild(infoBox);
    }

    // ── Header ──
    const header = document.createElement('div');
    header.style.cssText = 'font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:6px;';
    header.innerHTML = `<span>TILE SCALE</span>`;
    if (!ppuMatch && !this._pixelPerfect) {
      const warn = document.createElement('span');
      warn.innerHTML = iconHTML(Icons.AlertTriangle, 'xs', '#f9e2af') + ' PPU mismatch';
      warn.style.cssText = 'color:#f9e2af;font-size:10px;font-weight:normal;';
      header.appendChild(warn);
    }
    section.appendChild(header);

    // ── PPU row ──
    const ppuRow = document.createElement('div');
    ppuRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;';
    ppuRow.innerHTML = `<span style="font-size:11px;opacity:0.7;width:90px">Tileset PPU</span>`;
    const ppuInput = document.createElement('input');
    ppuInput.type = 'number';
    ppuInput.value = String(ts.pixelsPerUnit);
    ppuInput.min = '1';
    ppuInput.max = '1000';
    ppuInput.style.cssText = inputStyle;
    ppuInput.onchange = () => {
      const newPPU = parseInt(ppuInput.value) || 100;
      ts.pixelsPerUnit = newPPU;
      if (this._pixelPerfect) {
        // Re-apply pixel-perfect with the new PPU
        this._applyPixelPerfect();
      }
      this._renderTileScaleSettings();
      this._emitChanged();
      this._onLayerPainted?.(this._activeTilemap?.assetId ?? '', this._activeLayer?.layerId ?? '');
    };
    ppuRow.appendChild(ppuInput);

    // Match scene button (manual — only shown when pixel-perfect is OFF)
    if (!ppuMatch && !this._pixelPerfect) {
      const matchBtn = document.createElement('button');
      matchBtn.textContent = `Match Scene (${scenePPU})`;
      matchBtn.style.cssText = 'background:#89b4fa;color:#1e1e2e;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:10px;font-weight:600;';
      matchBtn.onclick = () => {
        ts.pixelsPerUnit = scenePPU;
        ppuInput.value = String(scenePPU);
        this._renderTileScaleSettings();
        this._emitChanged();
        this._onLayerPainted?.(this._activeTilemap?.assetId ?? '', this._activeLayer?.layerId ?? '');
      };
      ppuRow.appendChild(matchBtn);
    } else if (ppuMatch) {
      const ok = document.createElement('span');
      ok.innerHTML = iconHTML(Icons.Check, 'xs', '#a6e3a1') + ' matched';
      ok.style.cssText = 'color:#a6e3a1;font-size:10px;';
      ppuRow.appendChild(ok);
    }
    section.appendChild(ppuRow);

    // ── Info row ──
    const infoRow = document.createElement('div');
    infoRow.style.cssText = 'font-size:10px;opacity:0.6;';
    infoRow.textContent = `Tile size: ${ts.tileWidth}×${ts.tileHeight}px → ${tileWorldW}×${tileWorldH} world units | Scene PPU: ${scenePPU}`;
    section.appendChild(infoRow);
  }

  // ---- Import tileset from image file ----

  private _importTileset(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      this._showTilesetConfigDialog(file);
    };
    input.click();
  }

  private _showTilesetConfigDialog(file: File): void {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1e1e2e;border:1px solid #45475a;border-radius:8px;padding:20px;min-width:340px;max-width:420px;color:#cdd6f4;font-family:Inter,sans-serif;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    const imgPreview = document.createElement('img');
    imgPreview.style.cssText = 'max-width:100%;max-height:150px;border:1px solid #45475a;border-radius:4px;margin-bottom:10px;image-rendering:pixelated;display:block;';

    const reader = new FileReader();
    reader.onload = () => {
      imgPreview.src = reader.result as string;
    };
    reader.readAsDataURL(file);

    const inputStyle = 'background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:4px 8px;font-size:12px;width:60px;';
    const labelStyle = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;';

    dialog.innerHTML = `
      <div style="font-weight:600;font-size:14px;margin-bottom:12px">Import Tileset</div>
    `;
    dialog.appendChild(imgPreview);
    dialog.innerHTML += `
      <div style="${labelStyle}">
        <span>Name</span>
        <input class="ts-name" value="${file.name.replace(/\.[^.]+$/, '')}" style="${inputStyle}width:160px;">
      </div>
      <div style="${labelStyle}">
        <span>Tile Width (px)</span>
        <input class="ts-tw" type="number" value="32" min="4" max="256" style="${inputStyle}">
      </div>
      <div style="${labelStyle}">
        <span>Tile Height (px)</span>
        <input class="ts-th" type="number" value="32" min="4" max="256" style="${inputStyle}">
      </div>
      <div style="${labelStyle}">
        <span>Pixels Per Unit</span>
        <input class="ts-ppu" type="number" value="${this._getScenePPU()}" min="1" max="1000" style="${inputStyle}">
      </div>
      <div style="opacity:0.5;font-size:10px;margin-bottom:4px">
        Scene PPU: ${this._getScenePPU()} — matching ensures correct tile scale
      </div>
      <div class="ts-info" style="opacity:0.6;font-size:11px;margin:8px 0"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="ts-cancel" style="background:#45475a;color:#cdd6f4;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:12px;">Cancel</button>
        <button class="ts-ok" style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:600;">Import</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const nameInput = dialog.querySelector('.ts-name') as HTMLInputElement;
    const twInput = dialog.querySelector('.ts-tw') as HTMLInputElement;
    const thInput = dialog.querySelector('.ts-th') as HTMLInputElement;
    const ppuInput = dialog.querySelector('.ts-ppu') as HTMLInputElement;
    const infoDiv = dialog.querySelector('.ts-info') as HTMLElement;
    const cancelBtn = dialog.querySelector('.ts-cancel') as HTMLButtonElement;
    const okBtn = dialog.querySelector('.ts-ok') as HTMLButtonElement;

    // Update info when image loads or tile size changes
    const updateInfo = () => {
      if (!imgPreview.naturalWidth) return;
      const tw = parseInt(twInput.value) || 16;
      const th = parseInt(thInput.value) || 16;
      const cols = Math.floor(imgPreview.naturalWidth / tw);
      const rows = Math.floor(imgPreview.naturalHeight / th);
      infoDiv.textContent = `Image: ${imgPreview.naturalWidth}×${imgPreview.naturalHeight}px → ${cols}×${rows} = ${cols * rows} tiles`;
    };
    imgPreview.onload = updateInfo;
    twInput.oninput = updateInfo;
    thInput.oninput = updateInfo;

    cancelBtn.onclick = () => document.body.removeChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };

    okBtn.onclick = () => {
      const name = nameInput.value.trim() || 'Tileset';
      const tw = parseInt(twInput.value) || 16;
      const th = parseInt(thInput.value) || 16;
      const ppu = parseInt(ppuInput.value) || 100;

      // Create HTMLImageElement for the tileset
      const img = new Image();
      img.onload = () => {
        const tileset = createTilesetFromImage(name, img, tw, th, ppu);
        // Persist the data URL so the tileset survives save/load
        tileset.imageDataUrl = imgPreview.src;

        // Register with Scene2DManager
        if (this._scene2D) {
          this._scene2D.addTileset(tileset);
          this._tilesets = Array.from(this._scene2D.tilesets.values());
        } else {
          this._tilesets.push(tileset);
        }

        // Auto-select this tileset
        this._activeTileset = tileset;

        // Auto-create a tilemap for this tileset if none references it yet
        const existingTm = this._tilemaps.find(tm => tm.tilesetId === tileset.assetId);
        if (!existingTm) {
          this._createTilemapSilent(tileset.assetId);
        } else {
          // A tilemap already references this tileset — just switch to it
          this.selectTilemap(existingTm.assetId);
        }

        this._renderAll();
        document.body.removeChild(overlay);
        console.log(`[TileEditor] Imported tileset "${name}" — ${tileset.columns}×${tileset.rows} tiles (${tileset.tileWidth}×${tileset.tileHeight}px)`);
      };
      img.src = imgPreview.src;
    };
  }

  // ---- Create tilemap ----

  private _createTilemap(): void {
    if (this._tilesets.length === 0) return;

    const name = prompt('Tilemap name:', 'Tilemap');
    if (!name?.trim()) return;

    const tilesetId = this._activeTileset?.assetId ?? this._tilesets[0].assetId;
    this._createTilemapSilent(tilesetId, name.trim());
    this._renderAll();
  }

  /** Create a tilemap without prompting — used for auto-creation after tileset import */
  private _createTilemapSilent(tilesetId: string, name?: string): void {
    const safeName = name ?? 'Tilemap';
    const tm = createDefaultTilemap(safeName, tilesetId);

    if (this._scene2D) {
      this._scene2D.addTilemap(tm);
      this._tilemaps = Array.from(this._scene2D.tilemaps.values());
    } else {
      this._tilemaps.push(tm);
    }

    // Auto-select
    this._activeTilemap = tm;
    this._activeLayer = tm.layers[0] ?? null;
    if (!this._activeTileset) {
      this._activeTileset = this._tilesets.find(t => t.assetId === tilesetId) ?? null;
    }
    this._emitChanged();
  }

  // ---- Utilities ----

  private _makeDropdownRow(label: string, options: { id: string; label: string }[], activeId: string, onChange: (id: string) => void, placeholder?: string): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'width:100px;font-size:11px;opacity:0.7;';
    row.appendChild(labelEl);

    const select = document.createElement('select');
    select.style.cssText = 'flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:3px 6px;font-size:11px;';

    // Add placeholder option if no items or explicitly requested
    if (placeholder || options.length === 0) {
      const placeholderOpt = document.createElement('option');
      placeholderOpt.value = '';
      placeholderOpt.textContent = placeholder ?? '— None —';
      placeholderOpt.disabled = true;
      placeholderOpt.selected = !activeId;
      select.appendChild(placeholderOpt);
    }

    for (const opt of options) {
      const optEl = document.createElement('option');
      optEl.value = opt.id;
      optEl.textContent = opt.label;
      if (opt.id === activeId) optEl.selected = true;
      select.appendChild(optEl);
    }
    select.onchange = () => {
      if (select.value) onChange(select.value);
    };
    if (options.length === 0) select.disabled = true;
    row.appendChild(select);
    return row;
  }

  get activeTool(): TileTool { return this._activeTool; }
  get activeTilemap(): TilemapAsset | null { return this._activeTilemap; }
  get activeTileset(): TilesetAsset | null { return this._activeTileset; }
  get activeLayer(): TilemapLayer | null { return this._activeLayer; }
  get isPixelPerfect(): boolean { return this._pixelPerfect; }
  get selectedTileId(): number { return this._selectedTileId; }
  get selectionRect(): { col: number; row: number; w: number; h: number } { return this._selectionRect; }
  /** All tilesets known to this panel (for image sync). */
  get allTilesets(): readonly TilesetAsset[] { return this._tilesets; }

  dispose(): void {
    if (this._collisionRebuildTimer) clearTimeout(this._collisionRebuildTimer);
    this._container.innerHTML = '';
  }
}
