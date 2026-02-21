// ============================================================
//  AnimBlueprint2DEditorPanel — Visual editor for 2D Sprite Animation Blueprints
//  Mirrors the 3D AnimBlueprintEditorPanel but purpose-built for 2D sprites.
//  Tabs: Animation Graph (state machine canvas) | Event Graph (Rete) | Sprites
//  State machine: canvas-based node/edge graph with drag/drop
//  Transitions: same rule-group condition editor as 3D
//  State properties: sprite sheet picker, animation picker, FPS, loop, live preview
// ============================================================

import { iconHTML, Icons, ICON_COLORS } from './icons';
import type {
  AnimBlueprintAsset,
  AnimStateData,
  AnimTransitionData,
  AnimStateMachineData,
  AnimTransitionRuleGroup,
  AnimTransitionRule,
  TransitionBlendProfile,
} from './AnimBlueprintData';
import {
  defaultAnimState,
  defaultTransition,
} from './AnimBlueprintData';
import type { BlueprintVariable, VarType } from './BlueprintData';
import type { SpriteSheetAsset, SpriteAnimationDef } from '../engine/SpriteRenderer';
import { mountNodeEditorForAsset } from './NodeEditorPanel';
import { TextureLibrary } from './TextureLibrary';
import type { TextureAssetData } from './TextureLibrary';
import type { Scene2DManager } from './Scene2DManager';
import { SpriteAnimationEditor } from './SpriteAnimationEditor';
import type { SavedAnimationRef } from './SpriteAnimationEditor';

type EditorTab2D = 'animGraph' | 'eventGraph' | 'sprites';

// ---- Local rule UID ----
let _ruleUid = 0;
function ruleId(): string { return 'r2d_' + (++_ruleUid).toString(36); }

// ============================================================

export class AnimBlueprint2DEditorPanel {
  private _container: HTMLElement;
  private _asset: AnimBlueprintAsset;
  private _onSave?: () => void;

  /** Sprite sheet collection provided by the Scene2DManager */
  private _spriteSheets: Map<string, SpriteSheetAsset> = new Map();
  private _scene2DManager: Scene2DManager | null = null;

  private _tabBar!: HTMLElement;
  private _contentArea!: HTMLElement;
  private _activeTab: EditorTab2D = 'animGraph';

  // --- State Machine Graph ---
  private _canvas!: HTMLCanvasElement;
  private _ctx!: CanvasRenderingContext2D;
  private _panX = 0;
  private _panY = 0;
  private _zoom = 1;
  private _isPanning = false;
  private _panStartX = 0;
  private _panStartY = 0;

  // State node drag
  private _dragState: AnimStateData | null = null;
  private _dragOffsetX = 0;
  private _dragOffsetY = 0;

  // Transition creation mode
  private _linkingFrom: AnimStateData | null = null;
  private _linkCursorX = 0;
  private _linkCursorY = 0;

  // Selected items
  private _selectedStateId: string | null = null;
  private _selectedTransitionId: string | null = null;

  // Properties panel (right side)
  private _propsPanel!: HTMLElement;

  // State preview canvas
  private _previewCanvas!: HTMLCanvasElement;
  private _previewCtx!: CanvasRenderingContext2D;
  private _previewFrameIndex = 0;
  private _previewTimer = 0;
  private _previewLastTime = 0;
  private _previewAnimId: number | null = null;
  private _previewIsPlaying = false;

  // Batched rendering
  private _graphDirty = false;
  private _graphRafId = 0;
  private _propsDirty = false;
  private _propsRafId = 0;
  private _transitionBundleCache: Map<string, { index: number; total: number }> | null = null;
  private _transitionBundleCacheKey = '';

  // Event graph cleanup
  private _eventGraphCleanup: (() => void) | null = null;
  private _eventGraphCompile: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    asset: AnimBlueprintAsset,
    onSave?: () => void,
  ) {
    this._container = container;
    this._asset = asset;
    this._onSave = onSave;

    this._previewCanvas = document.createElement('canvas');
    this._previewCanvas.width = 192;
    this._previewCanvas.height = 192;
    this._previewCtx = this._previewCanvas.getContext('2d')!;
    this._previewCtx.imageSmoothingEnabled = false;

    this._build();
  }

  /** Feed the Scene2DManager reference — gives access to sprite sheets and lets us auto-create new ones */
  setScene2DManager(mgr: Scene2DManager): void {
    this._scene2DManager = mgr;
    this._spriteSheets = mgr.spriteSheets;
    if (this._activeTab === 'animGraph' && this._selectedStateId) {
      this._schedulePropsRender();
    }
  }

  /** Legacy alias kept for backward compat */
  setSpriteSheets(sheets: Map<string, SpriteSheetAsset>): void {
    this._spriteSheets = sheets;
  }

  // ---- Sprite sheet helpers ----

  /** Returns all SpriteSheetAssets: existing ones + TextureLibrary 'Sprite' textures not yet promoted */
  private _getMergedSheets(): Array<{ id: string; name: string; sheet: SpriteSheetAsset | null; tex: TextureAssetData | null }> {
    const result: Array<{ id: string; name: string; sheet: SpriteSheetAsset | null; tex: TextureAssetData | null }> = [];
    // Existing sprite sheet assets
    for (const [id, sheet] of this._spriteSheets) {
      result.push({ id, name: sheet.assetName, sheet, tex: null });
    }
    // TextureLibrary 'Sprite' textures not already promoted to a sheet
    const existingSourceTextures = new Set(Array.from(this._spriteSheets.values()).map(s => s.sourceTexture));
    const texLib = TextureLibrary.instance;
    if (texLib) {
      for (const tex of texLib.getTexturesByCategory('Sprite')) {
        if (!existingSourceTextures.has(tex.assetId)) {
          result.push({ id: 'tex:' + tex.assetId, name: tex.assetName + ' ↑ Convert', sheet: null, tex });
        }
      }
    }
    return result;
  }

  /**
   * Auto-create a basic SpriteSheetAsset from a TextureLibrary sprite texture.
   * Adds it to scene2DManager so it persists. Returns the new sheet.
   */
  private _autoCreateSheet(tex: TextureAssetData): SpriteSheetAsset {
    const uid = 'ss_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const spriteId = 'spr_' + uid;
    const w = tex.metadata.width || 64;
    const h = tex.metadata.height || 64;
    const sheet: SpriteSheetAsset = {
      assetId: uid,
      assetType: 'spriteSheet',
      assetName: tex.assetName,
      sourceTexture: tex.assetId,
      textureWidth: w,
      textureHeight: h,
      pixelsPerUnit: 100,
      filterMode: 'point',
      sprites: [{ spriteId, name: 'sprite_0', x: 0, y: 0, width: w, height: h, pivot: { x: 0.5, y: 0.5 } }],
      animations: [{ animId: 'anim_' + uid, animName: 'Idle', frames: [spriteId], fps: 12, loop: true, events: [] }],
      imageDataUrl: tex.storedData,
    };
    // Load the HTMLImageElement for live preview
    const img = new Image();
    img.src = tex.storedData;
    sheet.image = img;
    // Register in scene manager
    if (this._scene2DManager) {
      this._scene2DManager.addSpriteSheet(sheet);
    } else {
      this._spriteSheets.set(uid, sheet);
    }
    this._onSave?.();
    return sheet;
  }

  /** Build a sprite-sheet <select> element for use in property rows.
   *  When a TextureLibrary sprite is picked it is auto-promoted to a SpriteSheetAsset.
   *  onChange receives the final SpriteSheetAsset id (always a real sheet id, never the tex: prefix).
   */
  private _buildSheetSelect(currentSheetId: string, onChange: (sheetId: string) => void): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.className = 'prop-input';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '-- None --';
    sel.appendChild(noneOpt);

    const merged = this._getMergedSheets();
    if (merged.length === 0) {
      noneOpt.textContent = '-- Import a Sprite texture first --';
    }

    for (const entry of merged) {
      const opt = document.createElement('option');
      opt.value = entry.id;
      opt.textContent = entry.name;
      if (entry.sheet && entry.sheet.assetId === currentSheetId) opt.selected = true;
      sel.appendChild(opt);
    }

    sel.addEventListener('change', () => {
      const val = sel.value;
      if (!val) { onChange(''); return; }

      if (val.startsWith('tex:')) {
        // Auto-promote the texture to a SpriteSheetAsset
        const texId = val.slice(4);
        const texLib = TextureLibrary.instance;
        const tex = texLib?.getAsset(texId);
        if (!tex) return;
        const sheet = this._autoCreateSheet(tex);
        // Update the option value in the select so it reflects the real sheet id
        const opt = Array.from(sel.options).find(o => o.value === val);
        if (opt) { opt.value = sheet.assetId; opt.textContent = sheet.assetName; opt.selected = true; }
        onChange(sheet.assetId);
      } else {
        onChange(val);
      }
    });
    return sel;
  }

  /** Returns a flat list of all named animations across every sprite sheet. */
  private _getAllAnimations(): SavedAnimationRef[] {
    const results: SavedAnimationRef[] = [];
    for (const [id, sheet] of this._spriteSheets) {
      for (const anim of sheet.animations) {
        results.push({
          sheetId: id,
          sheetName: sheet.assetName,
          animName: anim.animName,
          fps: anim.fps,
          frameCount: anim.frames.length,
        });
      }
    }
    return results;
  }

  dispose(): void {
    this._stopPreview();
    if (this._graphRafId) cancelAnimationFrame(this._graphRafId);
    if (this._propsRafId) cancelAnimationFrame(this._propsRafId);
    this._graphRafId = 0;
    this._propsRafId = 0;
    if (this._eventGraphCleanup) {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
    }
    this._eventGraphCompile = null;
  }

  // ============================================================
  //  Build UI
  // ============================================================

  private _build(): void {
    this._container.innerHTML = '';
    this._container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    // Tab bar
    this._tabBar = document.createElement('div');
    this._tabBar.className = 'anim-bp-tab-bar';
    this._container.appendChild(this._tabBar);

    // Content area
    this._contentArea = document.createElement('div');
    this._contentArea.className = 'anim-bp-content';
    this._contentArea.style.cssText = 'flex:1;display:flex;overflow:hidden;';
    this._container.appendChild(this._contentArea);

    this._rebuildTabBar();
    this._switchTab(this._activeTab);
  }

  private _rebuildTabBar(): void {
    this._tabBar.innerHTML = '';

    const tabs: Array<{ key: EditorTab2D; label: string; icon: string }> = [
      { key: 'animGraph', label: 'Animation Graph', icon: '▸' },
      { key: 'eventGraph', label: 'Event Variables', icon: '▪' },
      { key: 'sprites', label: 'Sprites', icon: '🖼' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('div');
      btn.className = `anim-bp-tab${this._activeTab === tab.key ? ' active' : ''}`;
      btn.textContent = `${tab.icon} ${tab.label}`;
      btn.addEventListener('click', () => {
        this._activeTab = tab.key;
        this._rebuildTabBar();
        this._switchTab(tab.key);
      });
      this._tabBar.appendChild(btn);
    }

    // Toolbar area
    const toolbar = document.createElement('div');
    toolbar.className = 'anim-bp-toolbar';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'toolbar-btn';
    saveBtn.innerHTML = iconHTML(Icons.Save, 12, ICON_COLORS.blue) + ' Save';
    saveBtn.addEventListener('click', () => {
      this._asset.touch();
      this._onSave?.();
    });
    toolbar.appendChild(saveBtn);

    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:10px;background:#3b82f6;color:#fff;margin-left:6px;';
    badge.textContent = '2D';
    toolbar.appendChild(badge);

    // Open Sprite Animation Editor
    const animEdBtn = document.createElement('button');
    animEdBtn.className = 'toolbar-btn';
    animEdBtn.innerHTML = '🎬 Animations';
    animEdBtn.title = 'Open the Sprite Animation Editor to create or edit named animations';
    animEdBtn.addEventListener('click', () => {
      if (!this._scene2DManager) {
        alert('No active Scene2DManager — open a 2D scene first.');
        return;
      }
      SpriteAnimationEditor.open(
        this._scene2DManager,
        (ref: SavedAnimationRef) => {
          // Sync sheets back then refresh props panel
          if (this._scene2DManager) {
            this._spriteSheets = new Map(this._scene2DManager.spriteSheets);
          }
          this._renderProps();
        },
        this._asset.targetSpriteSheetId || undefined,
      );
    });
    toolbar.appendChild(animEdBtn);

    this._tabBar.appendChild(toolbar);
  }

  private _switchTab(tab: EditorTab2D): void {
    this._contentArea.innerHTML = '';
    this._stopPreview();

    if (this._eventGraphCleanup && tab !== 'eventGraph') {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
    }

    switch (tab) {
      case 'animGraph': this._buildAnimGraphTab(); break;
      case 'eventGraph': this._buildEventGraphTab(); break;
      case 'sprites': this._buildSpritesTab(); break;
    }
  }

  // ============================================================
  //  Animation Graph Tab — 2D State Machine Visual Editor
  // ============================================================

  private _buildAnimGraphTab(): void {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    // Left: Canvas
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = 'flex:1;position:relative;overflow:hidden;';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'anim-graph-canvas';
    canvasContainer.appendChild(this._canvas);
    wrapper.appendChild(canvasContainer);

    // Right: Properties panel
    this._propsPanel = document.createElement('div');
    this._propsPanel.className = 'anim-graph-props';
    this._propsPanel.style.cssText = 'width:280px;min-width:240px;overflow-y:auto;border-left:1px solid #2a2a3a;';
    wrapper.appendChild(this._propsPanel);

    this._contentArea.appendChild(wrapper);

    this._setupCanvasEvents(canvasContainer);
    this._resizeCanvas(canvasContainer);
    const ro = new ResizeObserver(() => this._resizeCanvas(canvasContainer));
    ro.observe(canvasContainer);

    this._renderGraph();
    this._renderProps();
  }

  private _resizeCanvas(container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._canvas.style.width = rect.width + 'px';
    this._canvas.style.height = rect.height + 'px';
    this._ctx = this._canvas.getContext('2d')!;
    this._ctx.scale(dpr, dpr);
    this._renderGraph();
  }

  private _setupCanvasEvents(container: HTMLElement): void {
    const canvas = this._canvas;

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pos = this._canvasToWorld(e.offsetX, e.offsetY);
      this._showCanvasContextMenu(e.clientX, e.clientY, pos.x, pos.y);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this._isPanning = true;
        this._panStartX = e.offsetX - this._panX;
        this._panStartY = e.offsetY - this._panY;
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.button !== 0) return;

      const pos = this._canvasToWorld(e.offsetX, e.offsetY);
      const hit = this._hitTestState(pos.x, pos.y);

      if (e.shiftKey && hit) {
        this._linkingFrom = hit;
        return;
      }

      if (hit) {
        this._selectedStateId = hit.id;
        this._selectedTransitionId = null;
        this._dragState = hit;
        this._dragOffsetX = pos.x - hit.posX;
        this._dragOffsetY = pos.y - hit.posY;
        this._scheduleGraphRender();
        this._schedulePropsRender();
        return;
      }

      const tHit = this._hitTestTransition(pos.x, pos.y);
      if (tHit) {
        this._selectedTransitionId = tHit.id;
        this._selectedStateId = null;
        this._scheduleGraphRender();
        this._schedulePropsRender();
        return;
      }

      this._selectedStateId = null;
      this._selectedTransitionId = null;
      this._scheduleGraphRender();
      this._schedulePropsRender();
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this._isPanning) {
        this._panX = e.offsetX - this._panStartX;
        this._panY = e.offsetY - this._panStartY;
        this._scheduleGraphRender();
        return;
      }

      if (this._dragState) {
        const pos = this._canvasToWorld(e.offsetX, e.offsetY);
        this._dragState.posX = pos.x - this._dragOffsetX;
        this._dragState.posY = pos.y - this._dragOffsetY;
        this._asset.touch();
        this._invalidateBundleCache();
        this._scheduleGraphRender();
        return;
      }

      if (this._linkingFrom) {
        this._linkCursorX = e.offsetX;
        this._linkCursorY = e.offsetY;
        if (this._graphRafId) { cancelAnimationFrame(this._graphRafId); this._graphRafId = 0; this._graphDirty = false; }
        this._renderGraphImmediate();
        // Draw temp link line
        const from = this._linkingFrom;
        const fromScreen = this._worldToCanvas(from.posX + 80, from.posY + 22);
        const ctx = this._ctx;
        ctx.beginPath();
        ctx.moveTo(fromScreen.x, fromScreen.y);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (this._isPanning) {
        this._isPanning = false;
        canvas.style.cursor = 'default';
        return;
      }

      if (this._linkingFrom) {
        const pos = this._canvasToWorld(e.offsetX, e.offsetY);
        const target = this._hitTestState(pos.x, pos.y);
        if (target && target.id !== this._linkingFrom.id) {
          const t = defaultTransition(this._linkingFrom.id, target.id, '');
          this._asset.stateMachine.transitions.push(t);
          this._selectedTransitionId = t.id;
          this._selectedStateId = null;
          this._asset.touch();
          this._invalidateBundleCache();
        }
        this._linkingFrom = null;
        this._renderGraph();
        this._renderProps();
        return;
      }

      this._dragState = null;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const oldZoom = this._zoom;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this._zoom = Math.max(0.2, Math.min(3, this._zoom * delta));
      const mx = e.offsetX;
      const my = e.offsetY;
      this._panX = mx - (mx - this._panX) * (this._zoom / oldZoom);
      this._panY = my - (my - this._panY) * (this._zoom / oldZoom);
      this._scheduleGraphRender();
    });

    canvas.addEventListener('dblclick', (e) => {
      const pos = this._canvasToWorld(e.offsetX, e.offsetY);
      const hit = this._hitTestState(pos.x, pos.y);
      if (hit) {
        this._selectedStateId = hit.id;
        this._selectedTransitionId = null;
        this._renderGraph();
        this._renderProps();
      }
    });
  }

  // ---- Coordinate helpers ----

  private _canvasToWorld(cx: number, cy: number): { x: number; y: number } {
    return { x: (cx - this._panX) / this._zoom, y: (cy - this._panY) / this._zoom };
  }

  private _worldToCanvas(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this._zoom + this._panX, y: wy * this._zoom + this._panY };
  }

  // ---- Hit test ----

  private _hitTestState(wx: number, wy: number): AnimStateData | null {
    const W = 160, H = 44;
    for (const s of this._asset.stateMachine.states) {
      if (wx >= s.posX && wx <= s.posX + W && wy >= s.posY && wy <= s.posY + H) return s;
    }
    return null;
  }

  private _hitTestTransition(wx: number, wy: number): AnimTransitionData | null {
    const sm = this._asset.stateMachine;
    const stateMap = new Map<string, AnimStateData>();
    for (const s of sm.states) stateMap.set(s.id, s);

    for (const t of sm.transitions) {
      const from = stateMap.get(t.fromStateId);
      const to = stateMap.get(t.toStateId);
      if (!from || !to) continue;

      const { fx, fy, tx, ty } = this._getTransitionAnchors(from, to);
      const bundle = this._getTransitionBundle(sm, t);
      const canonFlip = t.fromStateId > t.toStateId ? -1 : 1;
      const dx = tx - fx; const dy = ty - fy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = (-dy / len) * canonFlip; const ny = (dx / len) * canonFlip;
      const offset = (bundle.index - (bundle.total - 1) / 2) * 16;
      const ofx = fx + nx * offset; const ofy = fy + ny * offset;
      const otx = tx + nx * offset; const oty = ty + ny * offset;

      // Circle hit at midpoint
      const mpx = (ofx + otx) / 2; const mpy = (ofy + oty) / 2;
      const dxi = wx - mpx; const dyi = wy - mpy;
      if (dxi * dxi + dyi * dyi < 169) return t; // r=13

      // Line hit
      const hr = 10 / Math.max(0.25, this._zoom);
      const ldx = otx - ofx; const ldy = oty - ofy;
      const ll = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
      const tp = Math.max(0, Math.min(1, ((wx - ofx) * ldx + (wy - ofy) * ldy) / (ll * ll)));
      const cx = ofx + tp * ldx; const cy = ofy + tp * ldy;
      const dsq = (wx - cx) * (wx - cx) + (wy - cy) * (wy - cy);
      if (dsq < hr * hr) return t;
    }
    return null;
  }

  // ---- Batched render scheduling ----

  private _scheduleGraphRender(): void {
    if (this._graphDirty) return;
    this._graphDirty = true;
    this._graphRafId = requestAnimationFrame(() => {
      this._graphDirty = false;
      this._graphRafId = 0;
      this._renderGraphImmediate();
    });
  }

  private _schedulePropsRender(): void {
    if (this._propsDirty) return;
    this._propsDirty = true;
    this._propsRafId = requestAnimationFrame(() => {
      this._propsDirty = false;
      this._propsRafId = 0;
      this._renderProps();
    });
  }

  private _invalidateBundleCache(): void {
    this._transitionBundleCache = null;
  }

  private _ensureBundleCache(): void {
    const sm = this._asset.stateMachine;
    const key = sm.transitions.map(t => t.id).join(',') + '|' + sm.states.map(s => s.id).join(',');
    if (this._transitionBundleCache && this._transitionBundleCacheKey === key) return;
    this._transitionBundleCacheKey = key;
    this._transitionBundleCache = new Map();

    const pairMap = new Map<string, AnimTransitionData[]>();
    for (const t of sm.transitions) {
      const k = t.fromStateId < t.toStateId ? `${t.fromStateId}|${t.toStateId}` : `${t.toStateId}|${t.fromStateId}`;
      let list = pairMap.get(k);
      if (!list) { list = []; pairMap.set(k, list); }
      list.push(t);
    }
    for (const list of pairMap.values()) {
      for (let i = 0; i < list.length; i++) {
        this._transitionBundleCache.set(list[i].id, { index: i, total: list.length });
      }
    }
  }

  private _getTransitionBundle(sm: AnimStateMachineData, t: AnimTransitionData): { index: number; total: number } {
    if (this._transitionBundleCache) {
      const cached = this._transitionBundleCache.get(t.id);
      if (cached) return cached;
    }
    const list = sm.transitions.filter(x =>
      (x.fromStateId === t.fromStateId && x.toStateId === t.toStateId) ||
      (x.fromStateId === t.toStateId && x.toStateId === t.fromStateId),
    );
    return { index: Math.max(0, list.findIndex(x => x.id === t.id)), total: Math.max(1, list.length) };
  }

  // ============================================================
  //  Graph Rendering
  // ============================================================

  private _renderGraph(): void {
    this._renderGraphImmediate();
  }

  private _renderGraphImmediate(): void {
    const ctx = this._ctx;
    if (!ctx) return;
    const w = this._canvas.width / (window.devicePixelRatio || 1);
    const h = this._canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#181824';
    ctx.fillRect(0, 0, w, h);
    this._drawGrid(ctx, w, h);

    // Watermark
    ctx.save();
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = 'rgba(99,179,237,0.045)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ANIMATION 2D', w - 24, h - 16);
    ctx.restore();

    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    const sm = this._asset.stateMachine;
    this._ensureBundleCache();

    this._drawEntryNode(ctx, sm);

    for (const t of sm.transitions) this._drawTransition(ctx, t, sm);
    for (const s of sm.states) this._drawStateNode(ctx, s, sm);

    ctx.restore();

    if (this._linkingFrom) {
      ctx.fillStyle = 'rgba(250,204,21,0.9)';
      ctx.font = '11px sans-serif';
      ctx.fillText('Shift-drag to target state to create a transition…', 10, h - 10);
    }
  }

  private _drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const stepSmall = 20 * this._zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    let offX = this._panX % stepSmall; let offY = this._panY % stepSmall;
    for (let x = offX; x < w; x += stepSmall) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = offY; y < h; y += stepSmall) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const stepLarge = 100 * this._zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    offX = this._panX % stepLarge; offY = this._panY % stepLarge;
    for (let x = offX; x < w; x += stepLarge) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = offY; y < h; y += stepLarge) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }

  private _drawEntryNode(ctx: CanvasRenderingContext2D, sm: AnimStateMachineData): void {
    const entryState = sm.states.find(s => s.id === sm.entryStateId);
    if (!entryState) return;

    const ex = entryState.posX - 90;
    const ey = entryState.posY + 11;
    const ew = 66; const eh = 22; const r = 4;

    this._rrect(ctx, ex, ey, ew, eh, r);
    ctx.fillStyle = '#252540';
    ctx.fill();
    ctx.strokeStyle = '#4a4a70';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#99c4f4';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Entry', ex + 6, ey + eh / 2);

    // Arrow to entry state
    const arrowFromX = ex + ew + 2; const arrowFromY = ey + eh / 2;
    const arrowToX = entryState.posX - 2; const arrowToY = entryState.posY + 22;
    ctx.beginPath(); ctx.moveTo(arrowFromX, arrowFromY); ctx.lineTo(arrowToX, arrowToY);
    ctx.strokeStyle = '#6688aa'; ctx.lineWidth = 1.5; ctx.stroke();

    const angle = Math.atan2(arrowToY - arrowFromY, arrowToX - arrowFromX);
    const hl = 8;
    ctx.beginPath();
    ctx.moveTo(arrowToX, arrowToY);
    ctx.lineTo(arrowToX - hl * Math.cos(angle - 0.4), arrowToY - hl * Math.sin(angle - 0.4));
    ctx.lineTo(arrowToX - hl * Math.cos(angle + 0.4), arrowToY - hl * Math.sin(angle + 0.4));
    ctx.closePath(); ctx.fillStyle = '#6688aa'; ctx.fill();

    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  private _drawStateNode(ctx: CanvasRenderingContext2D, state: AnimStateData, sm: AnimStateMachineData): void {
    const x = state.posX; const y = state.posY;
    const w = 160; const h = 44; const r = 5;
    const topH = 5;
    const isEntry = sm.entryStateId === state.id;
    const isSelected = this._selectedStateId === state.id;

    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    this._rrect(ctx, x, y, w, h, r);
    ctx.fillStyle = '#2b2d40';
    ctx.fill();
    ctx.restore();

    // Top color bar
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + topH);
    ctx.lineTo(x, y + topH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = isSelected ? '#3b82f6' : isEntry ? '#22c55e' : '#4f46e5';
    ctx.fill();
    ctx.restore();

    // Border
    this._rrect(ctx, x, y, w, h, r);
    ctx.strokeStyle = isSelected ? '#60a5fa' : '#3d3f5a';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    // 2D Sprite icon (simple grid/sprite icon)
    const ix = x + 10; const iy = y + topH + (h - topH) / 2 - 6;
    ctx.strokeStyle = isSelected ? '#93c5fd' : '#6c7aad';
    ctx.lineWidth = 1;
    ctx.strokeRect(ix, iy, 12, 12);
    // Cross dividers to suggest sprite grid
    ctx.beginPath();
    ctx.moveTo(ix + 6, iy); ctx.lineTo(ix + 6, iy + 12);
    ctx.moveTo(ix, iy + 6); ctx.lineTo(ix + 12, iy + 6);
    ctx.stroke();

    // State name
    ctx.fillStyle = '#e2e8f0';
    ctx.font = isEntry ? 'bold 12px sans-serif' : '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const nameY = y + topH + (h - topH) / 2;
    ctx.fillText(state.name, x + 28, nameY, w - 36);

    // Sprite animation subtitle
    if (state.spriteAnimationName) {
      const sheet = state.spriteSheetId ? this._spriteSheets.get(state.spriteSheetId) : null;
      const subtitle = sheet ? `${sheet.assetName} · ${state.spriteAnimationName}` : state.spriteAnimationName;
      ctx.fillStyle = '#6880aa';
      ctx.font = '9px sans-serif';
      ctx.fillText(subtitle, x + 28, nameY + 11, w - 36);
    }

    // Entry badge
    if (isEntry) {
      ctx.save();
      ctx.font = '9px sans-serif';
      const bw = 36; const bh = 12;
      const bx = x + w - bw - 4; const by = y + topH + 3;
      this._rrect(ctx, bx, by, bw, bh, 3);
      ctx.fillStyle = 'rgba(34,197,94,0.25)';
      ctx.fill();
      ctx.fillStyle = '#86efac';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ENTRY', bx + bw / 2, by + bh / 2);
      ctx.restore();
    }

    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  private _drawTransition(ctx: CanvasRenderingContext2D, t: AnimTransitionData, sm: AnimStateMachineData): void {
    const from = sm.states.find(s => s.id === t.fromStateId);
    const to = sm.states.find(s => s.id === t.toStateId);
    if (!from || !to) return;

    const { fx, fy, tx, ty } = this._getTransitionAnchors(from, to);
    const isSelected = this._selectedTransitionId === t.id;
    const bundle = this._getTransitionBundle(sm, t);

    const canonFlip = t.fromStateId > t.toStateId ? -1 : 1;
    const dx = tx - fx; const dy = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / len) * canonFlip; const ny = (dx / len) * canonFlip;
    const offset = (bundle.index - (bundle.total - 1) / 2) * 16;
    const ofx = fx + nx * offset; const ofy = fy + ny * offset;
    const otx = tx + nx * offset; const oty = ty + ny * offset;

    ctx.beginPath();
    ctx.moveTo(ofx, ofy);
    ctx.lineTo(otx, oty);
    ctx.strokeStyle = isSelected ? '#facc15' : 'rgba(180,190,220,0.55)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    // Arrowhead
    const arrowT = 0.82;
    const apx = ofx + (otx - ofx) * arrowT; const apy = ofy + (oty - ofy) * arrowT;
    const lineAngle = Math.atan2(oty - ofy, otx - ofx); const hl = 7;
    ctx.beginPath();
    ctx.moveTo(apx + hl * Math.cos(lineAngle), apy + hl * Math.sin(lineAngle));
    ctx.lineTo(apx - hl * Math.cos(lineAngle - 0.45), apy - hl * Math.sin(lineAngle - 0.45));
    ctx.lineTo(apx - hl * Math.cos(lineAngle + 0.45), apy - hl * Math.sin(lineAngle + 0.45));
    ctx.closePath();
    ctx.fillStyle = isSelected ? '#facc15' : 'rgba(180,190,220,0.55)';
    ctx.fill();

    // Condition circle at midpoint
    const mx = (ofx + otx) / 2; const my = (ofy + oty) / 2;
    ctx.beginPath();
    ctx.arc(mx, my, 10, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#facc15' : '#282840';
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#fde68a' : '#55567a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = isSelected ? '#181a2e' : '#8890b0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx - 4, my); ctx.lineTo(mx + 4, my);
    ctx.stroke();

    if (isSelected) {
      const label = this._getTransitionLabel(t);
      if (label) {
        ctx.font = '10px sans-serif';
        const lw = Math.min(200, ctx.measureText(label).width + 14);
        const lh = 16; const lx = mx - lw / 2; const ly = my - 10 - lh - 6;
        this._rrect(ctx, lx, ly, lw, lh, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fill();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, ly + lh / 2, 190);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    }
  }

  private _getTransitionLabel(t: AnimTransitionData): string {
    if (!t.rules || t.rules.length === 0) return '';
    const parts: string[] = [];
    for (const group of t.rules) {
      const ruleStrs = group.rules.map(r => {
        if (r.kind === 'expr') return r.expr;
        return `${r.varName} ${r.op} ${r.value}`;
      });
      if (ruleStrs.length > 0) parts.push('(' + ruleStrs.join(` ${group.op} `) + ')');
    }
    return parts.join(` ${t.ruleLogic || 'AND'} `).slice(0, 80);
  }

  private _getTransitionAnchors(from: AnimStateData, to: AnimStateData): { fx: number; fy: number; tx: number; ty: number } {
    const W = 160; const H = 44;
    const fromCx = from.posX + W / 2; const fromCy = from.posY + H / 2;
    const toCx = to.posX + W / 2; const toCy = to.posY + H / 2;
    const f = this._clipToRect(fromCx, fromCy, toCx, toCy, from.posX, from.posY, W, H);
    const t2 = this._clipToRect(toCx, toCy, fromCx, fromCy, to.posX, to.posY, W, H);
    return { fx: f.x, fy: f.y, tx: t2.x, ty: t2.y };
  }

  private _clipToRect(cx: number, cy: number, tx: number, ty: number, rx: number, ry: number, rw: number, rh: number): { x: number; y: number } {
    const dx = tx - cx; const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const hw = rw / 2; const hh = rh / 2;
    let tMin = Infinity;
    if (dx !== 0) { const tR = hw / Math.abs(dx); if (tR < tMin) tMin = tR; }
    if (dy !== 0) { const tB = hh / Math.abs(dy); if (tB < tMin) tMin = tB; }
    if (tMin === Infinity) tMin = 0;
    return { x: cx + dx * tMin, y: cy + dy * tMin };
  }

  private _rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---- Context menu ----

  private _showCanvasContextMenu(clientX: number, clientY: number, worldX: number, worldY: number): void {
    document.querySelectorAll('.anim2d-ctx-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu anim2d-ctx-menu';
    menu.style.left = clientX + 'px';
    menu.style.top = clientY + 'px';

    const hitState = this._hitTestState(worldX, worldY);

    if (hitState) {
      this._addMenuItem(menu, '⭐ Set as Entry State', () => {
        this._asset.stateMachine.entryStateId = hitState.id;
        this._asset.touch();
        this._renderGraph();
      });

      this._addMenuItem(menu, '→ Add Transition From Here', () => {
        this._linkingFrom = hitState;
      });

      menu.appendChild(this._menuSep());

      const del = this._addMenuItem(menu, '🗑 Delete State', () => {
        const sm = this._asset.stateMachine;
        sm.states = sm.states.filter(s => s.id !== hitState.id);
        sm.transitions = sm.transitions.filter(t => t.fromStateId !== hitState.id && t.toStateId !== hitState.id);
        if (sm.entryStateId === hitState.id) sm.entryStateId = sm.states[0]?.id ?? '';
        if (this._selectedStateId === hitState.id) this._selectedStateId = null;
        this._asset.touch();
        this._invalidateBundleCache();
        this._renderGraph();
        this._renderProps();
      });
      del.style.color = '#f87171';
    } else {
      this._addMenuItem(menu, '+ Add State', () => {
        this._showPrompt('New State Name', 'NewState', (name) => {
          if (!name) return;
          const state = defaultAnimState(name, worldX, worldY);
          state.outputType = 'spriteAnimation';
          this._asset.stateMachine.states.push(state);
          if (this._asset.stateMachine.states.length === 1) {
            this._asset.stateMachine.entryStateId = state.id;
          }
          this._asset.touch();
          this._invalidateBundleCache();
          this._renderGraph();
        });
      });

      this._addMenuItem(menu, '⭐ Add Wildcard Transition', () => {
        const targets = this._asset.stateMachine.states;
        if (targets.length === 0) return;
        this._showSelect('Target State', targets.map(s => s.name), (name) => {
          if (!name) return;
          const target = targets.find(s => s.name === name);
          if (!target) return;
          const t = defaultTransition('*', target.id, '');
          t.priority = 100;
          this._asset.stateMachine.transitions.push(t);
          this._asset.touch();
          this._invalidateBundleCache();
          this._renderGraph();
        });
      });
    }

    const hitTrans = this._hitTestTransition(worldX, worldY);
    if (hitTrans && !hitState) {
      menu.appendChild(this._menuSep());
      const del = this._addMenuItem(menu, '🗑 Delete Transition', () => {
        this._asset.stateMachine.transitions = this._asset.stateMachine.transitions.filter(t => t.id !== hitTrans.id);
        if (this._selectedTransitionId === hitTrans.id) this._selectedTransitionId = null;
        this._asset.touch();
        this._invalidateBundleCache();
        this._renderGraph();
        this._renderProps();
      });
      del.style.color = '#f87171';
    }

    document.body.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  private _addMenuItem(menu: HTMLElement, text: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.innerHTML = text;
    item.addEventListener('click', (e) => { e.stopPropagation(); menu.remove(); onClick(); });
    menu.appendChild(item);
    return item;
  }

  private _menuSep(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    return sep;
  }

  // ============================================================
  //  Properties Panel (right side of Anim Graph)
  // ============================================================

  private _renderProps(): void {
    if (!this._propsPanel) return;
    this._stopPreview();
    this._propsPanel.innerHTML = '';

    // Top toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'anim-props-toolbar';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'toolbar-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => { this._asset.touch(); this._onSave?.(); });
    toolbar.appendChild(saveBtn);
    this._propsPanel.appendChild(toolbar);

    if (this._selectedStateId) {
      const state = this._asset.stateMachine.states.find(s => s.id === this._selectedStateId);
      if (state) this._renderStateProps(state);
    } else if (this._selectedTransitionId) {
      const t = this._asset.stateMachine.transitions.find(t => t.id === this._selectedTransitionId);
      if (t) this._renderTransitionProps(t);
    } else {
      this._renderBlueprintProps();
    }
  }

  // ---- Blueprint-level properties ----

  private _renderBlueprintProps(): void {
    const p = this._propsPanel;

    const header = document.createElement('div');
    header.className = 'anim-props-header';
    header.textContent = '2D Animation Blueprint';
    p.appendChild(header);

    // Target Sprite Sheet
    this._addPropRow(p, 'Default Sprite Sheet', () => {
      const sel = this._buildSheetSelect(this._asset.targetSpriteSheetId || '', (sheetId) => {
        this._asset.targetSpriteSheetId = sheetId;
        this._asset.touch();
      });
      return sel;
    });

    // Stats
    const sm = this._asset.stateMachine;
    const stats = document.createElement('div');
    stats.className = 'anim-props-stats';
    stats.innerHTML = `
      <div>${sm.states.length} states</div>
      <div>${sm.transitions.length} transitions</div>
      <div>${this._asset.blueprintData.variables.length} variables</div>
    `;
    p.appendChild(stats);

    const help = document.createElement('div');
    help.className = 'anim-props-help';
    help.innerHTML = `
      <b>Controls:</b><br>
      • Right-click → Add State<br>
      • Shift+drag → Create Transition<br>
      • Alt+drag / Middle mouse → Pan<br>
      • Scroll → Zoom<br>
      • Click state/transition → Select
    `;
    p.appendChild(help);
  }

  // ---- State properties ----

  private _renderStateProps(state: AnimStateData): void {
    const p = this._propsPanel;

    const header = document.createElement('div');
    header.className = 'anim-props-header';
    header.textContent = `State: ${state.name}`;
    p.appendChild(header);

    // Name
    this._addPropRow(p, 'Name', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.value = state.name;
      inp.addEventListener('change', () => {
        state.name = inp.value.trim() || state.name;
        this._asset.touch();
        this._renderGraph();
        this._renderProps();
      });
      return inp;
    });

    // ── Flat animation picker (all animations across all sheets) ──
    const allAnims = this._getAllAnimations();

    this._addPropRow(p, 'Animation', () => {
      const sel = document.createElement('select');
      sel.className = 'prop-input';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = allAnims.length === 0 ? '-- Create an animation first --' : '-- None --';
      noneOpt.selected = !state.spriteSheetId && !state.spriteAnimationName;
      sel.appendChild(noneOpt);

      // Group by sheet using <optgroup>
      const bySheet = new Map<string, SavedAnimationRef[]>();
      for (const ref of allAnims) {
        if (!bySheet.has(ref.sheetId)) bySheet.set(ref.sheetId, []);
        bySheet.get(ref.sheetId)!.push(ref);
      }
      for (const [sheetId, refs] of bySheet) {
        const grp = document.createElement('optgroup');
        grp.label = refs[0].sheetName;
        for (const ref of refs) {
          const opt = document.createElement('option');
          opt.value = sheetId + '|' + ref.animName;
          opt.textContent = `${ref.animName}  (${ref.frameCount}fr @ ${ref.fps}fps)`;
          if (state.spriteSheetId === sheetId && state.spriteAnimationName === ref.animName) {
            opt.selected = true;
          }
          grp.appendChild(opt);
        }
        sel.appendChild(grp);
      }

      sel.addEventListener('change', () => {
        const [sid, aName] = sel.value ? sel.value.split('|') : ['', ''];
        state.spriteSheetId = sid || '';
        state.spriteAnimationName = aName || '';
        this._asset.touch();
        this._renderGraph();
        this._schedulePropsRender();
      });
      return sel;
    });

    // Edit / New animation buttons
    const animBtnRow = document.createElement('div');
    animBtnRow.style.cssText = 'display:flex;gap:6px;padding:4px 10px 6px;flex-wrap:wrap;';

    const openEditor = (sheetId?: string, animName?: string) => {
      if (!this._scene2DManager) {
        alert('No active Scene2DManager — open a 2D scene first.');
        return;
      }
      const existingSheet = sheetId ? this._scene2DManager.spriteSheets.get(sheetId) : undefined;
      const existingAnim = existingSheet?.animations.find(a => a.animName === animName);
      SpriteAnimationEditor.open(
        this._scene2DManager,
        (ref: SavedAnimationRef) => {
          // Sync sheets back, auto-apply to this state, refresh props
          if (this._scene2DManager) {
            this._spriteSheets = new Map(this._scene2DManager.spriteSheets);
          }
          state.spriteSheetId = ref.sheetId;
          state.spriteAnimationName = ref.animName;
          this._asset.touch();
          this._renderGraph();
          this._renderProps();
        },
        sheetId,
        existingAnim,
      );
    };

    if (state.spriteSheetId && state.spriteAnimationName) {
      const editBtn = document.createElement('button');
      editBtn.className = 'toolbar-btn';
      editBtn.innerHTML = '✏️ Edit Animation';
      editBtn.title = `Edit "${state.spriteAnimationName}"`;
      editBtn.addEventListener('click', () => openEditor(state.spriteSheetId, state.spriteAnimationName));
      animBtnRow.appendChild(editBtn);
    }

    const newBtn = document.createElement('button');
    newBtn.className = 'toolbar-btn';
    newBtn.innerHTML = '🎬 New Animation';
    newBtn.title = 'Open the Sprite Animation Editor to create a new animation';
    newBtn.addEventListener('click', () => openEditor());
    animBtnRow.appendChild(newBtn);

    p.appendChild(animBtnRow);

    if (allAnims.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'anim-props-hint';
      hint.style.cssText = 'color:#fb923c;padding:0 10px 6px;font-size:11px;';
      hint.textContent = 'No animations yet. Click "🎬 New Animation" to create one.';
      p.appendChild(hint);
    }

    // Resolve selected sheet (needed for _buildStatePreview)
    const resolvedSheetId = state.spriteSheetId || this._asset.targetSpriteSheetId || '';
    const selectedSheet = resolvedSheetId ? (this._spriteSheets.get(resolvedSheetId) ?? null) : null;

    // FPS override
    this._addPropRow(p, 'Play Rate', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.type = 'number';
      inp.step = '0.1';
      inp.min = '0';
      inp.max = '100';
      inp.title = 'Playback speed multiplier (1 = normal, 2 = double speed)';
      inp.placeholder = '1.0';
      inp.value = String(state.spriteAnimFPS ?? 1);
      inp.addEventListener('change', () => {
        state.spriteAnimFPS = parseFloat(inp.value) || 1;
        this._asset.touch();
      });
      return inp;
    });

    // Loop
    this._addPropRow(p, 'Loop', () => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.spriteAnimLoop ?? true;
      cb.addEventListener('change', () => {
        state.spriteAnimLoop = cb.checked;
        this._asset.touch();
      });
      return cb;
    });

    // Set as entry
    const setEntryBtn = document.createElement('button');
    setEntryBtn.className = 'toolbar-btn';
    setEntryBtn.style.margin = '6px 10px';
    setEntryBtn.textContent = this._asset.stateMachine.entryStateId === state.id ? '⭐ Entry State' : 'Set as Entry State';
    setEntryBtn.disabled = this._asset.stateMachine.entryStateId === state.id;
    setEntryBtn.addEventListener('click', () => {
      this._asset.stateMachine.entryStateId = state.id;
      this._asset.touch();
      this._renderGraph();
      this._renderProps();
    });
    p.appendChild(setEntryBtn);

    // Live preview
    this._buildStatePreview(p, state, selectedSheet);
  }

  // ---- Transition properties ----

  private _renderTransitionProps(t: AnimTransitionData): void {
    const p = this._propsPanel;
    const sm = this._asset.stateMachine;
    const fromState = sm.states.find(s => s.id === t.fromStateId);
    const toState = sm.states.find(s => s.id === t.toStateId);
    const fromName = t.fromStateId === '*' ? '* (Any)' : (fromState?.name ?? '???');
    const toName = toState?.name ?? '???';

    const header = document.createElement('div');
    header.className = 'anim-props-header';
    header.textContent = 'Transition';
    p.appendChild(header);

    const subtitle = document.createElement('div');
    subtitle.className = 'anim-props-subtitle';
    subtitle.textContent = `${fromName} → ${toName}`;
    p.appendChild(subtitle);

    // Ensure rule arrays exist
    if (!t.rules) t.rules = [{ id: ruleId(), op: 'AND', rules: [] }];
    if (!t.ruleLogic) t.ruleLogic = 'AND';
    if (!t.blendProfile) t.blendProfile = { time: t.blendTime ?? 0, curve: 'linear' };

    const vars = this._getEventGraphVars();
    const groups = t.rules;

    const rulesHeader = document.createElement('div');
    rulesHeader.className = 'anim-props-hint';
    rulesHeader.textContent = 'Transition Rules:';
    p.appendChild(rulesHeader);

    if (groups.length > 1) {
      this._addPropRow(p, 'Group Logic', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        for (const op of ['AND', 'OR'] as const) {
          const opt = document.createElement('option');
          opt.value = op; opt.textContent = op;
          if ((t.ruleLogic || 'AND') === op) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          t.ruleLogic = sel.value as 'AND' | 'OR';
          this._asset.touch();
          this._renderGraph();
        });
        return sel;
      });
    }

    const buildRuleRow = (group: AnimTransitionRuleGroup, rule: AnimTransitionRule): HTMLElement => {
      const row = document.createElement('div');
      row.className = 'anim-rule-row';

      if (rule.kind === 'expr') {
        const exprInput = document.createElement('input');
        exprInput.className = 'prop-input';
        exprInput.placeholder = 'JS expression';
        exprInput.value = rule.expr;
        exprInput.addEventListener('change', () => {
          rule.expr = exprInput.value;
          this._asset.touch();
          this._renderGraph();
        });
        row.appendChild(exprInput);
      } else {
        const varSel = document.createElement('select');
        varSel.className = 'prop-input';
        varSel.style.maxWidth = '110px';
        if (vars.length === 0) {
          const opt = document.createElement('option');
          opt.textContent = '(no vars)';
          varSel.appendChild(opt);
        }
        for (const v of vars) {
          const opt = document.createElement('option');
          opt.value = v.name; opt.textContent = v.name;
          if (v.name === rule.varName) opt.selected = true;
          varSel.appendChild(opt);
        }
        varSel.addEventListener('change', () => {
          const v = vars.find(x => x.name === varSel.value);
          if (!v) return;
          rule.varName = v.name;
          rule.valueType = v.type as 'Float' | 'Boolean' | 'String';
          rule.value = rule.valueType === 'Boolean' ? false : rule.valueType === 'String' ? '' : 0;
          this._asset.touch();
          this._renderProps();
          this._renderGraph();
        });
        row.appendChild(varSel);

        const opSel = document.createElement('select');
        opSel.className = 'prop-input';
        opSel.style.maxWidth = '75px';
        const ops: string[] = rule.valueType === 'Boolean' ? ['==', '!=']
          : rule.valueType === 'String' ? ['==', '!=', 'contains']
          : ['==', '!=', '>', '<', '>=', '<='];
        for (const op of ops) {
          const opt = document.createElement('option');
          opt.value = op; opt.textContent = op;
          if (op === rule.op) opt.selected = true;
          opSel.appendChild(opt);
        }
        opSel.addEventListener('change', () => {
          rule.op = opSel.value as any;
          this._asset.touch();
          this._renderGraph();
        });
        row.appendChild(opSel);

        if (rule.valueType === 'Boolean') {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = !!rule.value;
          cb.addEventListener('change', () => {
            rule.value = cb.checked;
            this._asset.touch();
            this._renderGraph();
          });
          row.appendChild(cb);
        } else {
          const valInput = document.createElement('input');
          valInput.className = 'prop-input';
          valInput.style.maxWidth = '80px';
          valInput.type = rule.valueType === 'Float' ? 'number' : 'text';
          valInput.value = rule.valueType === 'Float' ? String(rule.value ?? 0) : String(rule.value ?? '');
          valInput.addEventListener('change', () => {
            rule.value = rule.valueType === 'Float' ? (parseFloat(valInput.value) || 0) : valInput.value;
            this._asset.touch();
            this._renderGraph();
          });
          row.appendChild(valInput);
        }
      }

      const del = document.createElement('button');
      del.className = 'prop-btn-danger';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        group.rules = group.rules.filter(r => r.id !== rule.id);
        this._asset.touch();
        this._renderProps();
        this._renderGraph();
      });
      row.appendChild(del);
      return row;
    };

    for (const group of groups) {
      const groupBox = document.createElement('div');
      groupBox.className = 'anim-rule-group';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'anim-rule-group-header';
      groupHeader.textContent = 'Rule Group';

      const groupOp = document.createElement('select');
      groupOp.className = 'prop-input';
      groupOp.style.maxWidth = '70px';
      for (const op of ['AND', 'OR'] as const) {
        const opt = document.createElement('option');
        opt.value = op; opt.textContent = op;
        if (group.op === op) opt.selected = true;
        groupOp.appendChild(opt);
      }
      groupOp.addEventListener('change', () => {
        group.op = groupOp.value as 'AND' | 'OR';
        this._asset.touch();
        this._renderGraph();
      });
      groupHeader.appendChild(groupOp);
      groupBox.appendChild(groupHeader);

      for (const rule of group.rules) groupBox.appendChild(buildRuleRow(group, rule));

      const addRuleBtn = document.createElement('button');
      addRuleBtn.className = 'toolbar-btn';
      addRuleBtn.textContent = '+ Add Rule';
      addRuleBtn.addEventListener('click', () => {
        if (vars.length === 0) {
          group.rules.push({ id: ruleId(), kind: 'expr', expr: 'true' });
        } else {
          const v = vars[0];
          group.rules.push({ id: ruleId(), kind: 'compare', varName: v.name, op: '==',
            value: v.type === 'Boolean' ? false : v.type === 'String' ? '' : 0,
            valueType: v.type as 'Float' | 'Boolean' | 'String' });
        }
        this._asset.touch();
        this._renderProps();
        this._renderGraph();
      });
      groupBox.appendChild(addRuleBtn);
      p.appendChild(groupBox);
    }

    const addGroupBtn = document.createElement('button');
    addGroupBtn.className = 'toolbar-btn';
    addGroupBtn.textContent = '+ Add Group';
    addGroupBtn.addEventListener('click', () => {
      t.rules!.push({ id: ruleId(), op: 'AND', rules: [] });
      this._asset.touch();
      this._renderProps();
      this._renderGraph();
    });
    p.appendChild(addGroupBtn);

    // Blend / timing
    const timingSec = document.createElement('div');
    timingSec.className = 'anim-props-header';
    timingSec.style.marginTop = '10px';
    timingSec.textContent = 'Timing';
    p.appendChild(timingSec);

    this._addPropRow(p, 'Blend Time (s)', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.type = 'number';
      inp.step = '0.05';
      inp.min = '0';
      inp.value = String(t.blendProfile?.time ?? 0);
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value) || 0;
        if (!t.blendProfile) t.blendProfile = { time: v, curve: 'linear' };
        t.blendProfile.time = v;
        t.blendTime = v;
        this._asset.touch();
      });
      return inp;
    });

    this._addPropRow(p, 'Priority', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.type = 'number';
      inp.step = '1';
      inp.value = String(t.priority ?? 0);
      inp.addEventListener('change', () => {
        t.priority = parseInt(inp.value) || 0;
        this._asset.touch();
      });
      return inp;
    });
  }

  // ---- State preview canvas ----

  private _buildStatePreview(container: HTMLElement, state: AnimStateData, sheet: SpriteSheetAsset | null): void {
    const sec = document.createElement('div');
    sec.className = 'anim-props-sect';
    sec.style.cssText = 'padding:10px;border-top:1px solid #2a2a3a;';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600;font-size:11px;color:#94a3b8;margin-bottom:6px;letter-spacing:0.05em;';
    title.textContent = 'LIVE PREVIEW';
    sec.appendChild(title);

    // Animation info
    if (!sheet || !state.spriteAnimationName) {
      const hint = document.createElement('div');
      hint.className = 'anim-props-hint';
      hint.textContent = sheet ? 'Select an animation above to preview.' : 'Assign a sprite sheet and animation to preview.';
      sec.appendChild(hint);
      container.appendChild(sec);
      return;
    }

    const anim = sheet.animations.find(a => a.animName === state.spriteAnimationName);
    if (!anim || anim.frames.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'anim-props-hint';
      hint.textContent = `Animation "${state.spriteAnimationName}" has no frames.`;
      sec.appendChild(hint);
      container.appendChild(sec);
      return;
    }

    // Canvas row
    const canvasRow = document.createElement('div');
    canvasRow.style.cssText = 'display:flex;gap:10px;align-items:flex-start;';

    this._previewCanvas.width = 128;
    this._previewCanvas.height = 128;
    this._previewCtx.imageSmoothingEnabled = false;
    this._previewCanvas.style.cssText = 'border:1px solid #3a3a50;background:#0f0f1a;image-rendering:pixelated;border-radius:4px;';
    this._previewFrameIndex = 0;
    canvasRow.appendChild(this._previewCanvas);

    // Info column
    const infoCol = document.createElement('div');
    infoCol.style.cssText = 'flex:1;font-size:11px;color:#94a3b8;line-height:1.6;';

    const playRate = state.spriteAnimFPS ?? 1;
    const fps = anim.fps * playRate;
    infoCol.innerHTML = `
      <div><span style="color:#64748b">Anim:</span> <b>${anim.animName}</b></div>
      <div><span style="color:#64748b">Frames:</span> ${anim.frames.length}</div>
      <div><span style="color:#64748b">FPS:</span> ${fps.toFixed(1)}</div>
      <div><span style="color:#64748b">Loop:</span> ${state.spriteAnimLoop ?? anim.loop ? 'Yes' : 'No'}</div>
    `;
    canvasRow.appendChild(infoCol);
    sec.appendChild(canvasRow);

    // Frame scrubber
    const scrubRow = document.createElement('div');
    scrubRow.style.cssText = 'margin-top:8px;display:flex;gap:6px;align-items:center;';
    const scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.min = '0';
    scrub.max = String(anim.frames.length - 1);
    scrub.value = '0';
    scrub.style.cssText = 'flex:1;accent-color:#3b82f6;';
    const frameLabel = document.createElement('span');
    frameLabel.style.cssText = 'font-size:10px;color:#64748b;min-width:36px;text-align:center;';
    frameLabel.textContent = `1/${anim.frames.length}`;
    scrub.addEventListener('input', () => {
      this._previewFrameIndex = parseInt(scrub.value);
      frameLabel.textContent = `${this._previewFrameIndex + 1}/${anim.frames.length}`;
      this._drawPreviewFrame(sheet, anim, this._previewFrameIndex);
    });
    scrubRow.appendChild(scrub);
    scrubRow.appendChild(frameLabel);
    sec.appendChild(scrubRow);

    // Playback controls
    const ctrlRow = document.createElement('div');
    ctrlRow.style.cssText = 'display:flex;gap:4px;margin-top:6px;';
    const mkBtn = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.className = 'toolbar-btn';
      b.textContent = label;
      b.style.cssText += 'padding:2px 7px;font-size:11px;';
      b.addEventListener('click', onClick);
      return b;
    };

    ctrlRow.appendChild(mkBtn('◀◀', () => {
      this._stopPreview();
      this._previewFrameIndex = 0;
      scrub.value = '0';
      frameLabel.textContent = `1/${anim.frames.length}`;
      this._drawPreviewFrame(sheet, anim, 0);
    }));
    ctrlRow.appendChild(mkBtn('◀', () => {
      this._stopPreview();
      this._previewFrameIndex = Math.max(0, this._previewFrameIndex - 1);
      scrub.value = String(this._previewFrameIndex);
      frameLabel.textContent = `${this._previewFrameIndex + 1}/${anim.frames.length}`;
      this._drawPreviewFrame(sheet, anim, this._previewFrameIndex);
    }));

    const playBtn = mkBtn('▶ Play', () => {
      if (this._previewIsPlaying) {
        this._stopPreview();
        playBtn.textContent = '▶ Play';
      } else {
        playBtn.textContent = '⏹ Stop';
        this._startPreview(sheet, anim, state, scrub, frameLabel);
      }
    });
    ctrlRow.appendChild(playBtn);

    ctrlRow.appendChild(mkBtn('▶', () => {
      this._stopPreview();
      this._previewFrameIndex = (this._previewFrameIndex + 1) % anim.frames.length;
      scrub.value = String(this._previewFrameIndex);
      frameLabel.textContent = `${this._previewFrameIndex + 1}/${anim.frames.length}`;
      this._drawPreviewFrame(sheet, anim, this._previewFrameIndex);
    }));
    ctrlRow.appendChild(mkBtn('▶▶', () => {
      this._stopPreview();
      this._previewFrameIndex = anim.frames.length - 1;
      scrub.value = String(this._previewFrameIndex);
      frameLabel.textContent = `${anim.frames.length}/${anim.frames.length}`;
      this._drawPreviewFrame(sheet, anim, this._previewFrameIndex);
    }));
    sec.appendChild(ctrlRow);

    container.appendChild(sec);

    // Draw first frame immediately
    this._drawPreviewFrame(sheet, anim, 0);
  }

  private _drawPreviewFrame(sheet: SpriteSheetAsset, anim: SpriteAnimationDef, frameIndex: number): void {
    const ctx = this._previewCtx;
    const cv = this._previewCanvas;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, cv.width, cv.height);

    if (!sheet.image || frameIndex >= anim.frames.length) return;

    const spriteId = anim.frames[frameIndex];
    const sprite = sheet.sprites.find(s => s.spriteId === spriteId);
    if (!sprite) return;

    const scale = Math.min(cv.width / sprite.width, cv.height / sprite.height);
    const dw = sprite.width * scale;
    const dh = sprite.height * scale;
    ctx.drawImage(
      sheet.image,
      sprite.x, sprite.y, sprite.width, sprite.height,
      (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh,
    );
  }

  private _startPreview(sheet: SpriteSheetAsset, anim: SpriteAnimationDef, state: AnimStateData, scrub: HTMLInputElement, label: HTMLElement): void {
    this._stopPreview();
    if (!sheet.image || anim.frames.length === 0) return;
    this._previewIsPlaying = true;
    this._previewLastTime = performance.now();
    this._previewTimer = 0;

    const playRate = state.spriteAnimFPS ?? 1;
    const fps = anim.fps * playRate;
    const loop = state.spriteAnimLoop ?? anim.loop;

    const tick = (ts: number) => {
      if (!this._previewIsPlaying) return;
      const dt = (ts - this._previewLastTime) / 1000;
      this._previewLastTime = ts;
      this._previewTimer += dt;

      const frameDur = 1 / Math.max(1, fps);
      while (this._previewTimer >= frameDur) {
        this._previewTimer -= frameDur;
        this._previewFrameIndex++;
        if (this._previewFrameIndex >= anim.frames.length) {
          if (loop) this._previewFrameIndex = 0;
          else { this._previewFrameIndex = anim.frames.length - 1; this._stopPreview(); return; }
        }
      }
      scrub.value = String(this._previewFrameIndex);
      label.textContent = `${this._previewFrameIndex + 1}/${anim.frames.length}`;
      this._drawPreviewFrame(sheet, anim, this._previewFrameIndex);
      this._previewAnimId = requestAnimationFrame(tick);
    };

    this._previewAnimId = requestAnimationFrame(tick);
  }

  private _stopPreview(): void {
    this._previewIsPlaying = false;
    if (this._previewAnimId !== null) {
      cancelAnimationFrame(this._previewAnimId);
      this._previewAnimId = null;
    }
  }

  // ---- Prop row helper ----

  private _addPropRow(container: HTMLElement, label: string, createWidget: () => HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'anim-prop-row';
    const lbl = document.createElement('label');
    lbl.className = 'anim-prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(createWidget());
    container.appendChild(row);
  }

  private _getEventGraphVars(): BlueprintVariable[] {
    return this._asset.blueprintData.variables.filter(v =>
      v.type === 'Float' || v.type === 'Boolean' || v.type === 'String',
    );
  }

  // ============================================================
  //  Event Graph Tab
  // ============================================================

  private _buildEventGraphTab(): void {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    // Left: variable panel
    const varPanel = document.createElement('div');
    varPanel.style.cssText = 'width:240px;min-width:200px;border-right:1px solid #2a2a3a;overflow-y:auto;padding:12px;background:#14142a;';

    const header = document.createElement('div');
    header.className = 'anim-props-header';
    header.textContent = 'Event Graph Variables';
    varPanel.appendChild(header);

    const desc = document.createElement('div');
    desc.className = 'anim-props-help';
    desc.style.fontSize = '11px';
    desc.style.marginBottom = '8px';
    desc.innerHTML = `Define variables here, then use <b>Set / Get Anim Var</b> nodes in the event graph to drive them. Transition conditions read these variables.`;
    varPanel.appendChild(desc);

    const addBtn = document.createElement('button');
    addBtn.className = 'toolbar-btn';
    addBtn.textContent = '+ Add Variable';
    addBtn.style.marginBottom = '8px';
    addBtn.addEventListener('click', () => {
      this._showPrompt('Variable Name', 'myVar', (name) => {
        if (!name) return;
        this._asset.blueprintData.addVariable(name.trim(), 'Float');
        this._asset.touch();
        this._buildVarList(varTable);
      });
    });
    varPanel.appendChild(addBtn);

    const compileBtn = document.createElement('button');
    compileBtn.className = 'toolbar-btn';
    compileBtn.textContent = 'Compile Graph';
    compileBtn.style.marginBottom = '8px';
    compileBtn.addEventListener('click', () => {
      if (this._eventGraphCompile) this._eventGraphCompile();
    });
    varPanel.appendChild(compileBtn);

    const varTable = document.createElement('div');
    varTable.className = 'anim-var-table';
    varPanel.appendChild(varTable);
    this._buildVarList(varTable);
    wrapper.appendChild(varPanel);

    // Right: Rete editor
    const editorContainer = document.createElement('div');
    editorContainer.style.cssText = 'flex:1;position:relative;overflow:hidden;min-height:300px;';
    wrapper.appendChild(editorContainer);
    this._contentArea.appendChild(wrapper);

    const bp = this._asset.blueprintData;
    this._eventGraphCleanup = mountNodeEditorForAsset(
      editorContainer,
      bp,
      `${this._asset.name} Event Graph`,
      (code: string) => {
        this._asset.compiledCode = code;
        this._asset.touch();
        this._onSave?.();
      },
      undefined,
      undefined,
      undefined,
      true, // isAnimBlueprint
    );

    setTimeout(() => {
      const compileFn = (editorContainer as any).__compileAndSave as (() => void) | undefined;
      if (compileFn) {
        this._eventGraphCompile = compileFn;
        compileFn();
      }
    }, 100);
  }

  private _buildVarList(container: HTMLElement): void {
    container.innerHTML = '';
    const vars = this._getEventGraphVars();
    for (const v of vars) {
      const row = document.createElement('div');
      row.className = 'anim-var-row';

      const nameInp = document.createElement('input');
      nameInp.className = 'prop-input';
      nameInp.value = v.name;
      nameInp.style.flex = '1';
      nameInp.addEventListener('change', () => { v.name = nameInp.value.trim() || v.name; this._asset.touch(); });
      row.appendChild(nameInp);

      const typeSel = document.createElement('select');
      typeSel.className = 'prop-input';
      typeSel.style.width = '80px';
      for (const t of ['Float', 'Boolean', 'String'] as const) {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        if (t === v.type) opt.selected = true;
        typeSel.appendChild(opt);
      }
      typeSel.addEventListener('change', () => {
        v.type = typeSel.value as VarType;
        v.defaultValue = v.type === 'Float' ? 0 : v.type === 'Boolean' ? false : '';
        this._asset.touch();
        this._buildVarList(container);
      });
      row.appendChild(typeSel);

      if (v.type === 'Boolean') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!v.defaultValue;
        cb.addEventListener('change', () => { v.defaultValue = cb.checked; this._asset.touch(); });
        row.appendChild(cb);
      } else {
        const defInp = document.createElement('input');
        defInp.className = 'prop-input';
        defInp.style.width = '58px';
        defInp.type = v.type === 'Float' ? 'number' : 'text';
        defInp.value = String(v.defaultValue);
        defInp.addEventListener('change', () => {
          v.defaultValue = v.type === 'Float' ? parseFloat(defInp.value) || 0 : defInp.value;
          this._asset.touch();
        });
        row.appendChild(defInp);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'prop-btn-danger';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        this._asset.blueprintData.removeVariable(v.id);
        this._asset.touch();
        this._buildVarList(container);
      });
      row.appendChild(delBtn);
      container.appendChild(row);
    }
  }

  // ============================================================
  //  Sprites Tab — Sprite Sheet Reference Browser
  // ============================================================

  private _buildSpritesTab(): void {
    const root = document.createElement('div');
    root.style.cssText = 'flex:1;display:flex;overflow:hidden;height:100%;';

    const sheets = Array.from(this._spriteSheets.values());

    if (sheets.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#64748b;';
      empty.innerHTML = `
        <div style="font-size:48px;opacity:0.3">🖼</div>
        <div style="font-weight:600;">No Sprite Sheets Available</div>
        <div style="font-size:12px;text-align:center;max-width:320px;">
          Import sprite sheets in the editor (use File → Import or the Content Browser),
          or ensure the project is in 2D mode with sprite sheets loaded.
        </div>
      `;
      root.appendChild(empty);
      this._contentArea.appendChild(root);
      return;
    }

    // Left: sheet list
    const sheetList = document.createElement('div');
    sheetList.style.cssText = 'width:200px;border-right:1px solid #2a2a3a;overflow-y:auto;background:#14142a;';

    const listHeader = document.createElement('div');
    listHeader.style.cssText = 'padding:8px 10px;font-size:11px;font-weight:600;color:#94a3b8;border-bottom:1px solid #2a2a3a;letter-spacing:0.05em;';
    listHeader.textContent = 'SPRITE SHEETS';
    sheetList.appendChild(listHeader);

    // Right: sheet detail
    const sheetDetail = document.createElement('div');
    sheetDetail.style.cssText = 'flex:1;overflow-y:auto;padding:12px;';

    let activeSheet = sheets[0];

    const renderDetail = (sheet: SpriteSheetAsset) => {
      activeSheet = sheet;
      sheetDetail.innerHTML = '';

      const header = document.createElement('div');
      header.style.cssText = 'font-weight:600;font-size:13px;color:#e2e8f0;margin-bottom:8px;';
      header.textContent = sheet.assetName;
      sheetDetail.appendChild(header);

      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:11px;color:#64748b;margin-bottom:12px;';
      meta.innerHTML = `${sheet.sprites.length} sprites · ${sheet.animations.length} animations · ${sheet.textureWidth}×${sheet.textureHeight}px`;
      sheetDetail.appendChild(meta);

      // Texture preview
      if (sheet.image) {
        const texWrap = document.createElement('div');
        texWrap.style.cssText = 'border:1px solid #2a2a3a;border-radius:4px;overflow:auto;margin-bottom:12px;background:#0f0f1a;max-height:240px;';
        const texCanvas = document.createElement('canvas');
        const scale = Math.min(1, 400 / Math.max(sheet.textureWidth, 1));
        texCanvas.width = sheet.textureWidth * scale;
        texCanvas.height = sheet.textureHeight * scale;
        texCanvas.style.cssText = 'image-rendering:pixelated;display:block;';
        const tCtx = texCanvas.getContext('2d')!;
        tCtx.imageSmoothingEnabled = false;
        tCtx.drawImage(sheet.image, 0, 0, texCanvas.width, texCanvas.height);

        // Overlay sprite rects
        tCtx.strokeStyle = 'rgba(99,179,237,0.5)';
        tCtx.lineWidth = 1;
        for (const sprite of sheet.sprites) {
          tCtx.strokeRect(sprite.x * scale, sprite.y * scale, sprite.width * scale, sprite.height * scale);
        }
        texWrap.appendChild(texCanvas);
        sheetDetail.appendChild(texWrap);
      }

      // Animations
      if (sheet.animations.length > 0) {
        const animHeader = document.createElement('div');
        animHeader.style.cssText = 'font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.05em;margin-bottom:6px;';
        animHeader.textContent = 'ANIMATIONS';
        sheetDetail.appendChild(animHeader);

        for (const anim of sheet.animations) {
          const animRow = document.createElement('div');
          animRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px;cursor:pointer;margin-bottom:2px;background:#1a1a2e;';
          animRow.innerHTML = `
            <span style="color:#3b82f6;font-size:13px;">▶</span>
            <span style="flex:1;font-size:12px;">${anim.animName}</span>
            <span style="font-size:10px;color:#64748b;">${anim.frames.length}fr · ${anim.fps}fps</span>
          `;
          animRow.addEventListener('mouseenter', () => { animRow.style.background = '#252545'; });
          animRow.addEventListener('mouseleave', () => { animRow.style.background = '#1a1a2e'; });
          sheetDetail.appendChild(animRow);
        }
      }
    };

    // Build sheet list
    for (const sheet of sheets) {
      const item = document.createElement('div');
      item.style.cssText = 'padding:6px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid #1e1e30;';
      item.textContent = sheet.assetName;
      item.addEventListener('mouseenter', () => { if (activeSheet !== sheet) item.style.background = '#1e1e32'; });
      item.addEventListener('mouseleave', () => { if (activeSheet !== sheet) item.style.background = ''; });
      item.addEventListener('click', () => {
        sheetList.querySelectorAll('.spr-active').forEach(e => (e as HTMLElement).style.background = '');
        item.style.background = '#252545';
        item.classList.add('spr-active');
        renderDetail(sheet);
      });
      sheetList.appendChild(item);
    }

    root.appendChild(sheetList);
    root.appendChild(sheetDetail);
    this._contentArea.appendChild(root);

    if (sheets.length > 0) {
      const firstItem = sheetList.children[0] as HTMLElement;
      if (firstItem) { firstItem.style.background = '#252545'; firstItem.classList.add('spr-active'); }
      renderDetail(sheets[0]);
    }
  }

  // ============================================================
  //  Inline prompt / select helpers (Tauri-safe, no window.prompt)
  // ============================================================

  private _showPrompt(title: string, defaultVal: string, onConfirm: (val: string | null) => void): void {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '10000', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    const dialog = document.createElement('div');
    Object.assign(dialog.style, { background: 'var(--bg-panel,#1e2028)', border: '1px solid #444', borderRadius: '6px', padding: '16px 20px', minWidth: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', color: '#ddd', fontFamily: 'inherit' });

    const lbl = document.createElement('div');
    lbl.textContent = title;
    Object.assign(lbl.style, { marginBottom: '10px', fontWeight: '600', fontSize: '13px' });
    dialog.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultVal;
    input.className = 'prop-input';
    Object.assign(input.style, { width: '100%', boxSizing: 'border-box', marginBottom: '12px', fontSize: '13px', padding: '5px 8px' });
    dialog.appendChild(input);

    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'toolbar-btn'; cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overlay.remove(); onConfirm(null); });

    const okBtn = document.createElement('button');
    okBtn.className = 'toolbar-btn'; okBtn.textContent = 'OK';
    okBtn.style.background = 'var(--accent,#4a9eff)'; okBtn.style.color = '#fff';
    okBtn.addEventListener('click', () => { overlay.remove(); onConfirm(input.value.trim() || null); });

    btnRow.append(cancelBtn, okBtn);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { input.focus(); input.select(); });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
    });
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cancelBtn.click(); });
  }

  private _showSelect(title: string, options: string[], onSelect: (val: string | null) => void): void {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '10000', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    const dialog = document.createElement('div');
    Object.assign(dialog.style, { background: 'var(--bg-panel,#1e2028)', border: '1px solid #444', borderRadius: '6px', padding: '16px 20px', minWidth: '260px', maxHeight: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', color: '#ddd', fontFamily: 'inherit', display: 'flex', flexDirection: 'column' });

    const lbl = document.createElement('div');
    lbl.textContent = title;
    Object.assign(lbl.style, { marginBottom: '10px', fontWeight: '600', fontSize: '13px' });
    dialog.appendChild(lbl);

    const list = document.createElement('div');
    Object.assign(list.style, { overflowY: 'auto', maxHeight: '260px', marginBottom: '12px' });
    for (const opt of options) {
      const item = document.createElement('div');
      item.textContent = opt;
      Object.assign(item.style, { padding: '6px 10px', cursor: 'pointer', borderRadius: '3px', fontSize: '13px' });
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--accent,#4a9eff)'; item.style.color = '#fff'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; item.style.color = '#ddd'; });
      item.addEventListener('click', () => { overlay.remove(); onSelect(opt); });
      list.appendChild(item);
    }
    dialog.appendChild(list);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'toolbar-btn'; cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overlay.remove(); onSelect(null); });
    dialog.appendChild(cancelBtn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cancelBtn.click(); });
  }
}
