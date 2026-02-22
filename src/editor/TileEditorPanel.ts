// ============================================================
//  TileEditorPanel — Dockable panel for tile painting
//  Target tilemap, layer, tileset selection. Paint/Erase/Fill/
//  Rectangle/Line/Pick tools. Real-time collision rebuild.
// ============================================================

import type { TilemapAsset, TilemapLayer, TilesetAsset, AnimatedTileDef } from '../engine/TilemapData';
import { TilemapCollisionBuilder, createDefaultTilemap, createTilesetFromImage, encodeAnimatedTileId, decodeAnimatedTileIndex, isAnimatedTileId } from '../engine/TilemapData';
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

  // Animated tile painting mode
  // When >= 0, the user is painting an animated tile instead of a normal tile.
  private _activeAnimTileIndex = -1;

  // Palette canvas
  private _paletteCanvas: HTMLCanvasElement;
  private _palCtx: CanvasRenderingContext2D;
  private _palZoom = 2;

  // Palette tab: 'tileset' shows the raw tileset atlas, 'animated' shows animated tile thumbnails
  private _paletteTab: 'tileset' | 'animated' = 'tileset';
  /** Timer for cycling animated tile thumbnails on the Animated palette tab. */
  private _animPaletteTimer: ReturnType<typeof setInterval> | null = null;
  private _animPaletteFrame = 0;

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
  private _animTilesListEl: HTMLElement | null = null;

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

    // Tab buttons: Tileset | Animated
    const tabRow = document.createElement('span');
    tabRow.className = 'pal-tab-row';
    tabRow.style.cssText = 'display:inline-flex;gap:2px;margin-left:4px;';
    for (const tab of ['tileset', 'animated'] as const) {
      const tBtn = document.createElement('button');
      tBtn.textContent = tab === 'tileset' ? 'Tileset' : 'Animated';
      tBtn.className = `pal-tab-btn pal-tab-${tab}`;
      tBtn.style.cssText = 'background:#313244;color:#cdd6f4;border:none;border-radius:3px;padding:1px 7px;cursor:pointer;font-size:10px;';
      tBtn.onclick = () => { this._paletteTab = tab; this._renderPalette(); this._renderPaletteTabButtons(); };
      tabRow.appendChild(tBtn);
    }
    paletteLabel.appendChild(tabRow);

    // Zoom buttons (shown for both tabs)
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

    // Animated Tiles section
    const animSection = document.createElement('div');
    animSection.style.cssText = 'border-top:1px solid #313244;padding:6px 10px;';
    const animHeader = document.createElement('div');
    animHeader.style.cssText = 'font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:4px;';
    animHeader.innerHTML = `<span>ANIMATED TILES</span><span style="flex:1"></span>`;
    const addAnimBtn = document.createElement('button');
    addAnimBtn.textContent = '+ Animated Tile';
    addAnimBtn.style.cssText = 'background:#45475a;color:#cdd6f4;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:10px;';
    addAnimBtn.onclick = () => this._showAnimatedTileDialog();
    animHeader.appendChild(addAnimBtn);
    animSection.appendChild(animHeader);
    this._animTilesListEl = document.createElement('div');
    animSection.appendChild(this._animTilesListEl);
    root.appendChild(animSection);

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
    this._renderAnimatedTilesList();
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

  /** Update the active/inactive styling on the Tileset / Animated tab buttons. */
  private _renderPaletteTabButtons(): void {
    const tsBtn = this._container.querySelector('.pal-tab-tileset') as HTMLElement | null;
    const anBtn = this._container.querySelector('.pal-tab-animated') as HTMLElement | null;
    const activeCss = 'background:#585b70;color:#cdd6f4;border:1px solid #89b4fa;border-radius:3px;padding:1px 7px;cursor:pointer;font-size:10px;';
    const inactiveCss = 'background:#313244;color:#cdd6f4;border:1px solid transparent;border-radius:3px;padding:1px 7px;cursor:pointer;font-size:10px;';
    if (tsBtn) tsBtn.style.cssText = this._paletteTab === 'tileset' ? activeCss : inactiveCss;
    if (anBtn) anBtn.style.cssText = this._paletteTab === 'animated' ? activeCss : inactiveCss;
  }

  private _renderPalette(): void {
    // Stop any running animated-palette cycling timer
    if (this._animPaletteTimer) { clearInterval(this._animPaletteTimer); this._animPaletteTimer = null; }

    this._renderPaletteTabButtons();

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

    // Dispatch to the correct tab renderer
    if (this._paletteTab === 'animated') {
      this._renderAnimatedPalette();
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

  // ---- Animated Palette tab ----

  /**
   * Render the "Animated" palette view.
   * Shows each animated tile definition as a large thumbnail that cycles frames.
   * Clicking one selects it for painting.
   */
  private _renderAnimatedPalette(): void {
    const ts = this._activeTileset;
    if (!ts?.image) {
      this._paletteCanvas.width = 256;
      this._paletteCanvas.height = 64;
      this._palCtx.fillStyle = '#181825';
      this._palCtx.fillRect(0, 0, 256, 64);
      this._palCtx.fillStyle = '#6c7086';
      this._palCtx.font = '12px Inter, sans-serif';
      this._palCtx.textAlign = 'center';
      this._palCtx.fillText('No tileset image loaded', 128, 36);
      return;
    }

    const anims = ts.animatedTiles ?? [];
    if (anims.length === 0) {
      this._paletteCanvas.width = 256;
      this._paletteCanvas.height = 64;
      this._palCtx.fillStyle = '#181825';
      this._palCtx.fillRect(0, 0, 256, 64);
      this._palCtx.fillStyle = '#6c7086';
      this._palCtx.font = '12px Inter, sans-serif';
      this._palCtx.textAlign = 'center';
      this._palCtx.fillText('No animated tiles defined', 128, 36);
      return;
    }

    const z = this._palZoom;
    // Each animated tile gets drawn as a tile-sized thumbnail in a grid layout
    const thumbW = ts.tileWidth * z;
    const thumbH = ts.tileHeight * z;
    const padding = 4;
    const labelH = 14; // height for the name label below each thumbnail
    const cellW = thumbW + padding;
    const cellH = thumbH + labelH + padding;

    // Calculate grid layout
    const canvasW = Math.max(256, this._paletteCanvas.parentElement?.clientWidth ?? 256);
    const cols = Math.max(1, Math.floor(canvasW / cellW));
    const rows = Math.ceil(anims.length / cols);

    this._paletteCanvas.width = cols * cellW;
    this._paletteCanvas.height = rows * cellH + padding;
    this._palCtx.imageSmoothingEnabled = false;

    // Fill background
    this._palCtx.fillStyle = '#181825';
    this._palCtx.fillRect(0, 0, this._paletteCanvas.width, this._paletteCanvas.height);

    // Draw each animated tile
    for (let i = 0; i < anims.length; i++) {
      const anim = anims[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + padding / 2;
      const y = row * cellH + padding / 2;

      // Determine current display frame (cycles via timer)
      const frameIdx = anim.frames.length > 0
        ? this._animPaletteFrame % anim.frames.length
        : 0;
      const tileId = anim.frames[frameIdx] ?? 0;
      const tileCol = tileId % ts.columns;
      const tileRow = Math.floor(tileId / ts.columns);

      // Background cell
      const isSelected = this._activeAnimTileIndex === i;
      this._palCtx.fillStyle = isSelected ? '#45475a' : '#1e1e2e';
      this._palCtx.fillRect(x - 1, y - 1, thumbW + 2, thumbH + labelH + 4);

      // Draw the tile frame
      this._palCtx.drawImage(
        ts.image!,
        tileCol * ts.tileWidth, tileRow * ts.tileHeight,
        ts.tileWidth, ts.tileHeight,
        x, y, thumbW, thumbH,
      );

      // Border
      this._palCtx.strokeStyle = isSelected ? '#89b4fa' : '#45475a';
      this._palCtx.lineWidth = isSelected ? 2 : 1;
      this._palCtx.strokeRect(x, y, thumbW, thumbH);

      // Name label
      this._palCtx.fillStyle = '#a6adc8';
      this._palCtx.font = `${Math.max(9, Math.min(11, thumbW / 6))}px Inter, sans-serif`;
      this._palCtx.textAlign = 'center';
      this._palCtx.textBaseline = 'top';
      const maxTextW = thumbW;
      const label = anim.name.length > 12 ? anim.name.slice(0, 11) + '…' : anim.name;
      this._palCtx.fillText(label, x + thumbW / 2, y + thumbH + 2, maxTextW);

      // Frame count badge
      this._palCtx.fillStyle = 'rgba(0,0,0,0.5)';
      const badgeText = `${anim.frames.length}f`;
      const badgeW = this._palCtx.measureText(badgeText).width + 6;
      this._palCtx.fillRect(x + thumbW - badgeW, y, badgeW, 12);
      this._palCtx.fillStyle = '#cdd6f4';
      this._palCtx.font = '9px Inter, sans-serif';
      this._palCtx.textAlign = 'right';
      this._palCtx.textBaseline = 'top';
      this._palCtx.fillText(badgeText, x + thumbW - 3, y + 1);
    }

    // Start animation cycling timer
    // Use the fastest frame duration among all anims, clamped to ≥50ms
    const minDur = Math.max(50, Math.min(...anims.map(a => a.frameDurationMs)));
    this._animPaletteTimer = setInterval(() => {
      this._animPaletteFrame++;
      // Direct re-paint of animated palette (don't go through _renderPalette
      // which would clear + recreate the timer every tick)
      this._repaintAnimatedPaletteFrame();
    }, minDur);
  }

  /**
   * Lightweight re-paint of just the animated tile frames on the canvas.
   * Called by the cycling timer — does NOT touch the timer itself.
   */
  private _repaintAnimatedPaletteFrame(): void {
    const ts = this._activeTileset;
    if (!ts?.image) return;
    const anims = ts.animatedTiles ?? [];
    if (anims.length === 0) return;

    const z = this._palZoom;
    const thumbW = ts.tileWidth * z;
    const thumbH = ts.tileHeight * z;
    const padding = 4;
    const labelH = 14;
    const cellW = thumbW + padding;
    const cellH = thumbH + labelH + padding;
    const cols = Math.max(1, Math.floor(this._paletteCanvas.width / cellW));

    this._palCtx.imageSmoothingEnabled = false;

    for (let i = 0; i < anims.length; i++) {
      const anim = anims[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + padding / 2;
      const y = row * cellH + padding / 2;

      const frameIdx = anim.frames.length > 0
        ? this._animPaletteFrame % anim.frames.length
        : 0;
      const tileId = anim.frames[frameIdx] ?? 0;
      const tileCol = tileId % ts.columns;
      const tileRow = Math.floor(tileId / ts.columns);

      // Clear just the thumbnail area and redraw
      const isSelected = this._activeAnimTileIndex === i;
      this._palCtx.fillStyle = isSelected ? '#45475a' : '#1e1e2e';
      this._palCtx.fillRect(x, y, thumbW, thumbH);

      this._palCtx.drawImage(
        ts.image!,
        tileCol * ts.tileWidth, tileRow * ts.tileHeight,
        ts.tileWidth, ts.tileHeight,
        x, y, thumbW, thumbH,
      );

      // Re-draw border
      this._palCtx.strokeStyle = isSelected ? '#89b4fa' : '#45475a';
      this._palCtx.lineWidth = isSelected ? 2 : 1;
      this._palCtx.strokeRect(x, y, thumbW, thumbH);

      // Re-draw frame badge
      this._palCtx.fillStyle = 'rgba(0,0,0,0.5)';
      const badgeText = `${anim.frames.length}f`;
      const badgeW = this._palCtx.measureText(badgeText).width + 6;
      this._palCtx.fillRect(x + thumbW - badgeW, y, badgeW, 12);
      this._palCtx.fillStyle = '#cdd6f4';
      this._palCtx.font = '9px Inter, sans-serif';
      this._palCtx.textAlign = 'right';
      this._palCtx.textBaseline = 'top';
      this._palCtx.fillText(badgeText, x + thumbW - 3, y + 1);
    }
  }

  /** Handle click on the animated palette to select/deselect animated tiles. */
  private _onAnimatedPaletteClick(e: MouseEvent): void {
    if (this._paletteTab !== 'animated' || !this._activeTileset) return;
    const ts = this._activeTileset;
    const anims = ts.animatedTiles ?? [];
    if (anims.length === 0) return;

    const z = this._palZoom;
    const thumbW = ts.tileWidth * z;
    const thumbH = ts.tileHeight * z;
    const padding = 4;
    const labelH = 14;
    const cellW = thumbW + padding;
    const cellH = thumbH + labelH + padding;
    const cols = Math.max(1, Math.floor(this._paletteCanvas.width / cellW));

    const rect = this._paletteCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const col = Math.floor(mx / cellW);
    const row = Math.floor(my / cellH);
    const idx = row * cols + col;

    if (idx < 0 || idx >= anims.length) return;

    // Toggle selection
    if (this._activeAnimTileIndex === idx) {
      this._activeAnimTileIndex = -1;
    } else {
      this._activeAnimTileIndex = idx;
    }
    this._renderAnimatedTilesList();
    this._renderTileInfo();
    this._renderPalette(); // re-render to highlight
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

    // Animated tile selected — show that instead of normal tile info
    if (this._activeAnimTileIndex >= 0) {
      const anim = ts.animatedTiles?.[this._activeAnimTileIndex];
      if (anim) {
        this._tileInfoEl.innerHTML = `<span style="color:#89b4fa">Animated:</span> "${anim.name}" — ${anim.frames.length} frames [${anim.frames.join(', ')}] · ${anim.frameDurationMs}ms`;
        return;
      }
    }

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
    // If on the animated tab, route to animated palette click handler
    if (this._paletteTab === 'animated') {
      this._onAnimatedPaletteClick(e);
      return;
    }
    const cell = this._paletteEventToCell(e);
    if (!cell) return;
    this._palDragStart = cell;
    this._palDragging = true;
    // Deselect any animated tile when user picks from the palette
    if (this._activeAnimTileIndex >= 0) {
      this._activeAnimTileIndex = -1;
      this._renderAnimatedTilesList();
    }
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

    const stamp = this.getEffectiveStamp();
    const stampH = stamp.length;
    const stampW = stamp[0]?.length ?? 1;

    console.log(`[TileEditor.paintAt] world=(${worldX.toFixed(3)}, ${worldY.toFixed(3)}) cell=(${cellX}, ${cellY}) stamp=${stampW}×${stampH} tool=${this._activeTool} ppu=${ppu} animIdx=${this._activeAnimTileIndex}`);

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
    const fillId = this.getEffectivePaintTileId();
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

    const stamp = this.getEffectiveStamp();
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

    const stamp = this.getEffectiveStamp();
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

    // ── Tile Grid Size (manual resize) ──
    const gridHeader = document.createElement('div');
    gridHeader.style.cssText = 'font-weight:600;margin-top:8px;margin-bottom:4px;display:flex;align-items:center;gap:6px;';
    gridHeader.innerHTML = `<span>TILE GRID</span><span style="opacity:0.4;font-size:10px;font-weight:normal">${ts.columns}×${ts.rows} = ${ts.columns * ts.rows} tiles</span>`;
    section.appendChild(gridHeader);

    // Tile Width
    const twRow = document.createElement('div');
    twRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    twRow.innerHTML = `<span style="font-size:11px;opacity:0.7;width:90px">Tile Width</span>`;
    const twInput = document.createElement('input');
    twInput.type = 'number';
    twInput.value = String(ts.tileWidth);
    twInput.min = '1';
    twInput.max = '1024';
    twInput.style.cssText = inputStyle;
    twRow.appendChild(twInput);
    const twPx = document.createElement('span');
    twPx.textContent = 'px';
    twPx.style.cssText = 'font-size:10px;opacity:0.5;';
    twRow.appendChild(twPx);
    section.appendChild(twRow);

    // Tile Height
    const thRow = document.createElement('div');
    thRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    thRow.innerHTML = `<span style="font-size:11px;opacity:0.7;width:90px">Tile Height</span>`;
    const thInput = document.createElement('input');
    thInput.type = 'number';
    thInput.value = String(ts.tileHeight);
    thInput.min = '1';
    thInput.max = '1024';
    thInput.style.cssText = inputStyle;
    thRow.appendChild(thInput);
    const thPx = document.createElement('span');
    thPx.textContent = 'px';
    thPx.style.cssText = 'font-size:10px;opacity:0.5;';
    thRow.appendChild(thPx);
    section.appendChild(thRow);

    // Apply handler for both inputs
    const applyGridResize = () => {
      const newW = Math.max(1, parseInt(twInput.value) || ts.tileWidth);
      const newH = Math.max(1, parseInt(thInput.value) || ts.tileHeight);
      if (newW === ts.tileWidth && newH === ts.tileHeight) return;

      const imgW = ts.image?.naturalWidth ?? ts.textureWidth;
      const imgH = ts.image?.naturalHeight ?? ts.textureHeight;
      const newCols = Math.max(1, Math.floor(imgW / newW));
      const newRows = Math.max(1, Math.floor(imgH / newH));
      const newTotal = newCols * newRows;

      ts.tileWidth = newW;
      ts.tileHeight = newH;
      ts.columns = newCols;
      ts.rows = newRows;

      // Rebuild TileDefData array to match the new grid
      const newTiles: { tileId: number; tags: string[]; collision: 'none' | 'full' | 'top' | 'bottom' | 'left' | 'right' }[] = [];
      for (let i = 0; i < newTotal; i++) {
        // Preserve existing tile data where possible
        const existing = ts.tiles[i];
        newTiles.push(existing ?? { tileId: i, tags: [], collision: 'none' as const });
      }
      ts.tiles = newTiles;

      // Clamp selection to new bounds
      if (this._selectedTileId >= newTotal) this._selectedTileId = 0;
      this._selectionRect = { col: 0, row: 0, w: 1, h: 1 };

      // Rebuild pixel-perfect grid if active
      if (this._pixelPerfect) this._applyPixelPerfect();

      this._renderTileScaleSettings();
      this._renderPalette();
      this._renderTileInfo();
      this._emitChanged();
      this._onLayerPainted?.(this._activeTilemap?.assetId ?? '', this._activeLayer?.layerId ?? '');
      console.log(`[TileEditor] Grid resized to ${newW}×${newH}px → ${newCols}×${newRows} = ${newTotal} tiles`);
    };

    twInput.onchange = applyGridResize;
    thInput.onchange = applyGridResize;

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
  /** Index of the animated tile currently selected for painting (-1 = none). */
  get activeAnimatedTileIndex(): number { return this._activeAnimTileIndex; }

  // ---- Animated Tiles ----

  /** Get the animated tiles array from the active tileset (creates if needed). */
  private _getAnimatedTiles(): AnimatedTileDef[] {
    if (!this._activeTileset) return [];
    if (!this._activeTileset.animatedTiles) this._activeTileset.animatedTiles = [];
    return this._activeTileset.animatedTiles;
  }

  /** Render the list of animated tiles in the panel. */
  private _renderAnimatedTilesList(): void {
    if (!this._animTilesListEl) return;
    this._animTilesListEl.innerHTML = '';

    const anims = this._activeTileset?.animatedTiles ?? [];
    if (anims.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = 'opacity:0.4;font-size:10px;padding:4px 0;';
      hint.textContent = 'No animated tiles defined. Select tiles and click "+ Animated Tile".';
      this._animTilesListEl.appendChild(hint);
      return;
    }

    for (let i = 0; i < anims.length; i++) {
      const anim = anims[i];
      const row = document.createElement('div');
      const isActive = this._activeAnimTileIndex === i;
      row.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:11px;margin-bottom:2px;${isActive ? 'background:#45475a;border:1px solid #89b4fa;' : 'background:#313244;border:1px solid transparent;'}`;

      // Thumbnail: draw first frame of the animation
      const thumb = document.createElement('canvas');
      thumb.width = 24;
      thumb.height = 24;
      thumb.style.cssText = 'image-rendering:pixelated;border:1px solid #585b70;border-radius:2px;flex-shrink:0;';
      this._drawTileThumbnail(thumb, anim.frames[0] ?? 0);
      row.appendChild(thumb);

      // Name + frame count
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;overflow:hidden;';
      info.innerHTML = `<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${anim.name}</div>
        <div style="opacity:0.5;font-size:10px;">${anim.frames.length} frames · ${anim.frameDurationMs}ms</div>`;
      row.appendChild(info);

      // Select for painting
      row.onclick = () => {
        if (this._activeAnimTileIndex === i) {
          this._activeAnimTileIndex = -1; // deselect
        } else {
          this._activeAnimTileIndex = i;
        }
        this._renderAnimatedTilesList();
        this._renderTileInfo();
      };

      // Edit button
      const editBtn = document.createElement('button');
      editBtn.innerHTML = iconHTML(Icons.Settings, 'xs', ICON_COLORS.muted);
      editBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px;';
      editBtn.title = 'Edit animated tile';
      editBtn.onclick = (e) => { e.stopPropagation(); this._showAnimatedTileDialog(i); };
      row.appendChild(editBtn);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.innerHTML = iconHTML(Icons.Trash2, 'xs', '#f38ba8');
      delBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px;';
      delBtn.title = 'Delete animated tile';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Delete animated tile "${anim.name}"?`)) return;
        this._deleteAnimatedTile(i);
      };
      row.appendChild(delBtn);

      this._animTilesListEl.appendChild(row);
    }
  }

  /** Draw a single tile thumbnail on a small canvas. */
  private _drawTileThumbnail(canvas: HTMLCanvasElement, tileId: number): void {
    const ts = this._activeTileset;
    if (!ts?.image) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const col = tileId % ts.columns;
    const row = Math.floor(tileId / ts.columns);
    ctx.drawImage(ts.image, col * ts.tileWidth, row * ts.tileHeight, ts.tileWidth, ts.tileHeight, 0, 0, canvas.width, canvas.height);
  }

  /** Delete an animated tile definition and fixup layer references. */
  private _deleteAnimatedTile(index: number): void {
    const anims = this._getAnimatedTiles();
    if (index < 0 || index >= anims.length) return;

    // Remove references from all tilemap layers that used this animated tile
    const encodedId = encodeAnimatedTileId(index);
    for (const tm of this._tilemaps) {
      if (tm.tilesetId !== this._activeTileset?.assetId) continue;
      for (const layer of tm.layers) {
        for (const key of Object.keys(layer.tiles)) {
          const val = layer.tiles[key];
          if (val === encodedId) {
            // Replace with first frame so the tile doesn't disappear
            layer.tiles[key] = anims[index].frames[0] ?? 0;
          } else if (isAnimatedTileId(val)) {
            // Shift down indices above the removed one
            const ai = decodeAnimatedTileIndex(val);
            if (ai > index) {
              layer.tiles[key] = encodeAnimatedTileId(ai - 1);
            }
          }
        }
      }
    }

    anims.splice(index, 1);
    if (this._activeAnimTileIndex >= anims.length) this._activeAnimTileIndex = -1;
    if (this._activeAnimTileIndex === index) this._activeAnimTileIndex = -1;
    this._renderAnimatedTilesList();
    this._emitChanged();
  }

  /**
   * Show a dialog to create or edit an animated tile.
   * If editIndex is provided, edits the existing entry; otherwise creates a new one.
   */
  private _showAnimatedTileDialog(editIndex?: number): void {
    const ts = this._activeTileset;
    if (!ts) { alert('Import a tileset first.'); return; }

    const existing = editIndex !== undefined ? (ts.animatedTiles?.[editIndex] ?? null) : null;

    // Default frames: use current palette selection if creating new
    let initialFrames: number[] = [];
    if (existing) {
      initialFrames = [...existing.frames];
    } else {
      // Use current multi-tile selection as starting frames
      const stamp = this.getSelectionStamp();
      for (const row of stamp) {
        for (const id of row) {
          if (id >= 0) initialFrames.push(id);
        }
      }
    }

    // Create modal
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1e1e2e;border:1px solid #45475a;border-radius:8px;padding:24px;min-width:520px;max-width:680px;color:#cdd6f4;font-family:Inter,sans-serif;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-height:85vh;overflow-y:auto;';

    const inputStyle = 'background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:4px 8px;font-size:12px;';
    const labelStyle = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;';

    dialog.innerHTML = `
      <div style="font-weight:600;font-size:14px;margin-bottom:12px">${existing ? 'Edit' : 'New'} Animated Tile</div>
      <div style="${labelStyle}">
        <span>Name</span>
        <input class="at-name" value="${existing?.name ?? 'AnimTile_' + Date.now().toString(36)}" style="${inputStyle}width:200px;">
      </div>
      <div style="${labelStyle}">
        <span>Frame Duration (ms)</span>
        <input class="at-dur" type="number" value="${existing?.frameDurationMs ?? 200}" min="16" max="10000" style="${inputStyle}width:80px;">
      </div>
      <div style="${labelStyle}">
        <span>Loop</span>
        <input class="at-loop" type="checkbox" ${existing?.loop !== false ? 'checked' : ''} style="accent-color:#89b4fa;">
      </div>
      <div style="font-weight:600;margin-bottom:4px;margin-top:8px;">Frames (tile IDs — drag to reorder)</div>
      <div style="font-size:10px;opacity:0.5;margin-bottom:6px;">Click a tile in the mini-palette below to add it. Right-click a frame to remove it.</div>
      <div class="at-frames" style="display:flex;flex-wrap:wrap;gap:4px;min-height:40px;background:#313244;border:1px solid #45475a;border-radius:4px;padding:6px;margin-bottom:10px;"></div>
      <div style="font-weight:600;margin-bottom:4px;">Tile Palette <span style="opacity:0.5;font-size:10px;">(click to add frame)</span></div>
      <div class="at-palette-wrap" style="max-height:320px;overflow:auto;border:1px solid #45475a;border-radius:4px;margin-bottom:14px;"></div>
      <div class="at-preview" style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
        <span style="font-weight:600;">Preview:</span>
        <canvas class="at-preview-canvas" width="48" height="48" style="image-rendering:pixelated;border:1px solid #45475a;border-radius:4px;"></canvas>
        <button class="at-preview-btn" style="background:#45475a;color:#cdd6f4;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px;">▶ Play</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="at-cancel" style="background:#45475a;color:#cdd6f4;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:12px;">Cancel</button>
        <button class="at-ok" style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:600;">${existing ? 'Save' : 'Create'}</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const nameInput = dialog.querySelector('.at-name') as HTMLInputElement;
    const durInput = dialog.querySelector('.at-dur') as HTMLInputElement;
    const loopInput = dialog.querySelector('.at-loop') as HTMLInputElement;
    const framesContainer = dialog.querySelector('.at-frames') as HTMLElement;
    const paletteWrap = dialog.querySelector('.at-palette-wrap') as HTMLElement;
    const previewCanvas = dialog.querySelector('.at-preview-canvas') as HTMLCanvasElement;
    const previewBtn = dialog.querySelector('.at-preview-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('.at-cancel') as HTMLButtonElement;
    const okBtn = dialog.querySelector('.at-ok') as HTMLButtonElement;

    let frames = [...initialFrames];
    let previewTimer: ReturnType<typeof setInterval> | null = null;
    let previewFrame = 0;
    let previewPlaying = false;

    // ── Render frame thumbnails ──
    const renderFrames = () => {
      framesContainer.innerHTML = '';
      if (frames.length === 0) {
        framesContainer.innerHTML = '<div style="opacity:0.4;font-size:11px;">No frames added yet</div>';
        return;
      }
      frames.forEach((tileId, idx) => {
        const thumb = document.createElement('canvas');
        thumb.width = 32;
        thumb.height = 32;
        thumb.style.cssText = 'image-rendering:pixelated;border:1px solid #585b70;border-radius:3px;cursor:grab;background:#1e1e2e;';
        thumb.title = `Frame ${idx + 1}: Tile #${tileId} (right-click to remove)`;
        this._drawTileThumbnail(thumb, tileId);

        // Right-click to remove
        thumb.oncontextmenu = (e) => {
          e.preventDefault();
          frames.splice(idx, 1);
          renderFrames();
        };

        // Drag reorder
        thumb.draggable = true;
        thumb.ondragstart = (e) => {
          e.dataTransfer!.setData('text/plain', String(idx));
          thumb.style.opacity = '0.4';
        };
        thumb.ondragend = () => { thumb.style.opacity = '1'; };
        thumb.ondragover = (e) => { e.preventDefault(); thumb.style.borderColor = '#89b4fa'; };
        thumb.ondragleave = () => { thumb.style.borderColor = '#585b70'; };
        thumb.ondrop = (e) => {
          e.preventDefault();
          thumb.style.borderColor = '#585b70';
          const fromIdx = parseInt(e.dataTransfer!.getData('text/plain'));
          if (isNaN(fromIdx) || fromIdx === idx) return;
          const [moved] = frames.splice(fromIdx, 1);
          frames.splice(idx, 0, moved);
          renderFrames();
        };

        framesContainer.appendChild(thumb);
      });
    };
    renderFrames();

    // ── Mini palette ──
    const miniPal = document.createElement('canvas');
    miniPal.style.cssText = 'image-rendering:pixelated;cursor:pointer;display:block;';
    if (ts.image) {
      const zoom = 2;
      miniPal.width = ts.image.naturalWidth * zoom;
      miniPal.height = ts.image.naturalHeight * zoom;
      const ctx = miniPal.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ts.image, 0, 0, miniPal.width, miniPal.height);

      // Draw grid
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= ts.columns; c++) {
        const x = c * ts.tileWidth * zoom;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, miniPal.height); ctx.stroke();
      }
      for (let r = 0; r <= ts.rows; r++) {
        const y = r * ts.tileHeight * zoom;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(miniPal.width, y); ctx.stroke();
      }

      miniPal.onclick = (e) => {
        const rect = miniPal.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const col = Math.floor(mx / (ts.tileWidth * zoom));
        const row = Math.floor(my / (ts.tileHeight * zoom));
        if (col < 0 || col >= ts.columns || row < 0 || row >= ts.rows) return;
        const tileId = row * ts.columns + col;
        frames.push(tileId);
        renderFrames();
      };
    }
    paletteWrap.appendChild(miniPal);

    // ── Preview animation ──
    const drawPreview = () => {
      if (frames.length === 0) return;
      const ctx = previewCanvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 48, 48);
      const tileId = frames[previewFrame % frames.length];
      if (ts.image) {
        const col = tileId % ts.columns;
        const row = Math.floor(tileId / ts.columns);
        ctx.drawImage(ts.image, col * ts.tileWidth, row * ts.tileHeight, ts.tileWidth, ts.tileHeight, 0, 0, 48, 48);
      }
    };
    drawPreview();

    previewBtn.onclick = () => {
      if (previewPlaying) {
        if (previewTimer) clearInterval(previewTimer);
        previewTimer = null;
        previewPlaying = false;
        previewBtn.textContent = '▶ Play';
      } else {
        previewPlaying = true;
        previewBtn.textContent = '⏸ Pause';
        previewFrame = 0;
        drawPreview();
        previewTimer = setInterval(() => {
          previewFrame = (previewFrame + 1) % Math.max(1, frames.length);
          drawPreview();
        }, parseInt(durInput.value) || 200);
      }
    };

    // Close handlers
    const close = () => {
      if (previewTimer) clearInterval(previewTimer);
      document.body.removeChild(overlay);
    };
    cancelBtn.onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    okBtn.onclick = () => {
      const name = nameInput.value.trim() || 'AnimTile';
      const dur = parseInt(durInput.value) || 200;
      const loop = loopInput.checked;

      if (frames.length < 2) {
        alert('An animated tile needs at least 2 frames.');
        return;
      }

      const animDef: AnimatedTileDef = { name, frames: [...frames], frameDurationMs: dur, loop };

      if (!this._activeTileset!.animatedTiles) this._activeTileset!.animatedTiles = [];

      if (editIndex !== undefined) {
        this._activeTileset!.animatedTiles![editIndex] = animDef;
      } else {
        this._activeTileset!.animatedTiles!.push(animDef);
        // Auto-select the new animated tile for painting
        this._activeAnimTileIndex = this._activeTileset!.animatedTiles!.length - 1;
      }

      this._renderAnimatedTilesList();
      this._renderTileInfo();
      this._emitChanged();
      close();
      console.log(`[TileEditor] ${existing ? 'Updated' : 'Created'} animated tile "${name}" — ${frames.length} frames, ${dur}ms, loop=${loop}`);
    };
  }

  /**
   * Returns the tile ID to stamp for painting.
   * If an animated tile is selected, returns the encoded animated tile ID.
   * Otherwise returns the normal selectedTileId.
   */
  getEffectivePaintTileId(): number {
    if (this._activeAnimTileIndex >= 0) {
      const anims = this._activeTileset?.animatedTiles ?? [];
      if (this._activeAnimTileIndex < anims.length) {
        return encodeAnimatedTileId(this._activeAnimTileIndex);
      }
    }
    return this._selectedTileId;
  }

  /**
   * Returns the effective stamp for painting.
   * If an animated tile is selected, returns a 1×1 stamp with the encoded ID.
   * Otherwise delegates to getSelectionStamp().
   */
  getEffectiveStamp(): number[][] {
    if (this._activeAnimTileIndex >= 0) {
      const anims = this._activeTileset?.animatedTiles ?? [];
      if (this._activeAnimTileIndex < anims.length) {
        return [[encodeAnimatedTileId(this._activeAnimTileIndex)]];
      }
    }
    return this.getSelectionStamp();
  }

  dispose(): void {
    if (this._collisionRebuildTimer) clearTimeout(this._collisionRebuildTimer);
    if (this._animPaletteTimer) clearInterval(this._animPaletteTimer);
    this._container.innerHTML = '';
  }
}
