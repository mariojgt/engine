// ============================================================
//  SpriteAnimationEditor — Dedicated sprite animation building tool
//  Opens as a modal overlay.  Workflow:
//    1. Select a sprite sheet (or import a Sprite texture)
//    2. Choose a grid cell size → frames are outlined on the sheet
//    3. Click frames to add them to the timeline
//    4. Reorder / remove / duplicate frames by drag or buttons
//    5. Set name, FPS, loop and Save → stored in SpriteSheetAsset.animations[]
// ============================================================

import { iconHTML, Icons, ICON_COLORS } from './icons';

import type { SpriteSheetAsset, SpriteAnimationDef, SpriteData } from '../engine/SpriteRenderer';
import type { Scene2DManager } from './Scene2DManager';
import { TextureLibrary } from './TextureLibrary';
import type { TextureAssetData } from './TextureLibrary';

// ---- UID helper ----
let _uid = 0;
function uid(): string { return 'sa_' + Date.now().toString(36) + '_' + (++_uid).toString(36); }

export interface SavedAnimationRef {
  sheetId: string;
  sheetName: string;
  animName: string;
  fps: number;
  frameCount: number;
}

// ============================================================

export class SpriteAnimationEditor {
  private _overlay: HTMLElement;
  private _scene2D: Scene2DManager;
  private _onSaved: ((ref: SavedAnimationRef) => void) | null = null;

  // Selected sheet + grid state
  private _sheet: SpriteSheetAsset | null = null;
  private _gridW = 32;
  private _gridH = 32;
  private _sheetImage: HTMLImageElement | null = null;

  // Sheet canvas
  private _sheetCanvas!: HTMLCanvasElement;
  private _sheetCtx!: CanvasRenderingContext2D;
  private _sheetScale = 1;
  private _sheetOffX = 0;
  private _sheetOffY = 0;

  // Timeline state: list of frame indices (row*cols + col)
  private _timelineFrames: number[] = [];
  private _dragSrcIndex = -1;

  // Preview state
  private _previewCanvas!: HTMLCanvasElement;
  private _previewCtx!: CanvasRenderingContext2D;
  private _previewRafId: number | null = null;
  private _previewFrameIndex = 0;
  private _previewTimer = 0;
  private _previewLastTime = 0;
  private _previewPlaying = false;

  // Editor settings
  private _animName = 'NewAnimation';
  private _fps = 12;
  private _loop = true;
  private _editingAnim: SpriteAnimationDef | null = null; // if editing existing

  // DOM refs that need rebuilding
  private _timelineContainer!: HTMLElement;
  private _animInfoRow!: HTMLElement;
  private _sheetDropdown!: HTMLSelectElement;

  // ============================================================
  //  Static factory
  // ============================================================

  /** Open the editor as a fullscreen modal overlay */
  static open(
    scene2DManager: Scene2DManager,
    onSaved?: (ref: SavedAnimationRef) => void,
    initialSheetId?: string,
    existingAnim?: SpriteAnimationDef,
  ): SpriteAnimationEditor {
    const ed = new SpriteAnimationEditor(scene2DManager);
    ed._onSaved = onSaved ?? null;
    if (existingAnim) {
      ed._editingAnim = existingAnim;
      ed._animName = existingAnim.animName;
      ed._fps = existingAnim.fps;
      ed._loop = existingAnim.loop;
    }
    ed._build();
    // After building, select initial sheet
    setTimeout(() => {
      if (initialSheetId) {
        ed._selectSheetById(initialSheetId);
      } else {
        // Auto-select first available sheet
        const first = Array.from(scene2DManager.spriteSheets.keys())[0];
        if (first) ed._selectSheetById(first);
        else {
          const texLib = TextureLibrary.instance;
          const sprites = texLib?.getTexturesByCategory('Sprite') ?? [];
          if (sprites.length > 0) ed._importAndSelectTexture(sprites[0]);
        }
      }
      // Load existing frames into timeline
      if (existingAnim && ed._sheet) {
        const grid = ed._computeGrid();
        if (grid) {
          ed._timelineFrames = existingAnim.frames.map(fid => {
            const idx = ed._sheet!.sprites.findIndex(s => s.spriteId === fid);
            return idx >= 0 ? idx : -1;
          }).filter(i => i >= 0);
          ed._rebuildTimeline();
          ed._drawSheet();
        }
      }
    }, 50);
    return ed;
  }

  private constructor(scene2D: Scene2DManager) {
    this._scene2D = scene2D;
    this._overlay = document.createElement('div');
  }

  // ============================================================
  //  Build UI
  // ============================================================

  private _build(): void {
    Object.assign(this._overlay.style, {
      position: 'fixed', inset: '0', zIndex: '9500',
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui,sans-serif',
    });

    const win = document.createElement('div');
    Object.assign(win.style, {
      background: '#13131f',
      border: '1px solid #2e2e4a',
      borderRadius: '10px',
      width: 'min(1200px,95vw)',
      height: 'min(760px,92vh)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
      color: '#dde',
    });

    // ── Title bar ──
    const titleBar = document.createElement('div');
    Object.assign(titleBar.style, {
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 16px', borderBottom: '1px solid #2a2a42',
      background: '#0e0e1c', flexShrink: '0',
    });
    const title = document.createElement('span');
    title.style.cssText = 'font-weight:700;font-size:14px;color:#c8d8ff;flex:1;';
    title.innerHTML = iconHTML(Icons.Clapperboard, 'sm', ICON_COLORS.secondary) + ' Sprite Animation Editor';
    titleBar.appendChild(title);

    // Sheet selector in title bar
    const sheetLabel = document.createElement('span');
    sheetLabel.style.cssText = 'font-size:11px;color:#64748b;';
    sheetLabel.textContent = 'Sprite Sheet:';
    titleBar.appendChild(sheetLabel);

    this._sheetDropdown = document.createElement('select');
    Object.assign(this._sheetDropdown.style, {
      background: '#1e1e32', color: '#dde', border: '1px solid #3a3a56',
      borderRadius: '4px', padding: '3px 8px', fontSize: '12px',
      minWidth: '180px',
    });
    this._populateSheetDropdown();
    this._sheetDropdown.addEventListener('change', () => {
      const v = this._sheetDropdown.value;
      if (v.startsWith('tex:')) {
        const texId = v.slice(4);
        const tex = TextureLibrary.instance?.getAsset(texId);
        if (tex) this._importAndSelectTexture(tex);
      } else {
        this._selectSheetById(v);
      }
    });
    titleBar.appendChild(this._sheetDropdown);

    // Close button
    const closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      background: 'none', border: 'none', color: '#888',
      fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: '1',
    });
    closeBtn.innerHTML = iconHTML(Icons.X, 'sm', '#888');
    closeBtn.title = 'Close editor';
    closeBtn.addEventListener('click', () => this._close());
    titleBar.appendChild(closeBtn);
    win.appendChild(titleBar);

    // ── Main body: left (sheet) + right (timeline + preview) ──
    const body = document.createElement('div');
    Object.assign(body.style, {
      display: 'flex', flex: '1', overflow: 'hidden', gap: '0',
    });

    // Left panel — sheet viewer
    const leftPanel = this._buildLeftPanel();
    body.appendChild(leftPanel);

    // Right panel — preview + timeline + controls
    const rightPanel = this._buildRightPanel();
    body.appendChild(rightPanel);

    win.appendChild(body);
    this._overlay.appendChild(win);
    document.body.appendChild(this._overlay);

    // Click outside to close
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._close();
    });
  }

  // ---- Left panel: sheet canvas + grid controls ----

  private _buildLeftPanel(): HTMLElement {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: '480px', minWidth: '320px', display: 'flex',
      flexDirection: 'column', borderRight: '1px solid #2a2a42',
    });

    // Grid controls header
    const controls = document.createElement('div');
    Object.assign(controls.style, {
      padding: '8px 12px', background: '#0f0f1e',
      borderBottom: '1px solid #1e1e36', flexShrink: '0',
      display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
    });

    const gridLabel = document.createElement('span');
    gridLabel.style.cssText = 'font-size:11px;color:#64748b;';
    gridLabel.textContent = 'Frame size:';
    controls.appendChild(gridLabel);

    // Preset buttons
    const presets = [16, 32, 48, 64, 128];
    for (const p of presets) {
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.style.cssText += p === 32 ? 'background:#3b4fc8;' : '';
      btn.textContent = String(p);
      btn.title = `${p}×${p} grid`;
      btn.addEventListener('click', () => {
        this._gridW = p; this._gridH = p;
        wInp.value = String(p); hInp.value = String(p);
        this._drawSheet(); this._rebuildTimeline();
        controls.querySelectorAll('.preset-active').forEach(e => (e as HTMLElement).style.background = '');
        btn.style.background = '#3b4fc8'; btn.classList.add('preset-active');
      });
      controls.appendChild(btn);
    }

    const sep = document.createElement('span');
    sep.style.cssText = 'color:#3a3a52;';
    sep.textContent = '|';
    controls.appendChild(sep);

    const wLabel = document.createElement('span');
    wLabel.style.cssText = 'font-size:11px;color:#64748b;';
    wLabel.textContent = 'W:';
    controls.appendChild(wLabel);

    const wInp = document.createElement('input');
    wInp.type = 'number'; wInp.min = '1'; wInp.value = String(this._gridW);
    Object.assign(wInp.style, { width: '48px', background: '#1e1e32', color: '#dde', border: '1px solid #3a3a56', borderRadius: '3px', padding: '2px 5px', fontSize: '11px' });
    wInp.addEventListener('change', () => {
      const v = parseInt(wInp.value) || 32;
      this._gridW = v; this._drawSheet(); this._rebuildTimeline();
    });
    controls.appendChild(wInp);

    const hLabel = document.createElement('span');
    hLabel.style.cssText = 'font-size:11px;color:#64748b;';
    hLabel.textContent = 'H:';
    controls.appendChild(hLabel);

    const hInp = document.createElement('input');
    hInp.type = 'number'; hInp.min = '1'; hInp.value = String(this._gridH);
    Object.assign(hInp.style, { width: '48px', background: '#1e1e32', color: '#dde', border: '1px solid #3a3a56', borderRadius: '3px', padding: '2px 5px', fontSize: '11px' });
    hInp.addEventListener('change', () => {
      const v = parseInt(hInp.value) || 32;
      this._gridH = v; this._drawSheet(); this._rebuildTimeline();
    });
    controls.appendChild(hInp);

    const helpTip = document.createElement('span');
    helpTip.style.cssText = 'font-size:10px;color:#414168;margin-left:auto;';
    helpTip.textContent = 'Click frame → adds to timeline';
    controls.appendChild(helpTip);

    panel.appendChild(controls);

    // Sheet canvas wrapper (scrollable)
    const canvasWrap = document.createElement('div');
    Object.assign(canvasWrap.style, {
      flex: '1', overflow: 'auto', background: '#0a0a14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '12px',
    });

    this._sheetCanvas = document.createElement('canvas');
    this._sheetCanvas.style.cssText = 'cursor:crosshair;image-rendering:pixelated;display:block;';
    this._sheetCanvas.addEventListener('click', (e) => this._handleSheetClick(e));
    canvasWrap.appendChild(this._sheetCanvas);
    this._sheetCtx = this._sheetCanvas.getContext('2d')!;
    this._sheetCtx.imageSmoothingEnabled = false;

    const placeholder = document.createElement('div');
    placeholder.id = 'sheet-placeholder';
    Object.assign(placeholder.style, {
      color: '#3a3a52', fontSize: '13px', textAlign: 'center', lineHeight: '1.8',
    });
    placeholder.innerHTML = 'Select a sprite sheet above<br>or import a Sprite-category texture<br>in the Content Browser';
    canvasWrap.appendChild(placeholder);

    panel.appendChild(canvasWrap);
    return panel;
  }

  // ---- Right panel: preview + timeline + save ----

  private _buildRightPanel(): HTMLElement {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    });

    // Preview row
    const previewRow = document.createElement('div');
    Object.assign(previewRow.style, {
      display: 'flex', gap: '14px', padding: '12px 16px',
      borderBottom: '1px solid #1e1e36', flexShrink: '0',
      alignItems: 'flex-start',
    });

    // Preview canvas
    this._previewCanvas = document.createElement('canvas');
    this._previewCanvas.width = 128; this._previewCanvas.height = 128;
    Object.assign(this._previewCanvas.style, {
      width: '128px', height: '128px',
      background: '#0a0a16', border: '1px solid #2a2a42',
      borderRadius: '4px', imageRendering: 'pixelated', flexShrink: '0',
    });
    this._previewCtx = this._previewCanvas.getContext('2d')!;
    this._previewCtx.imageSmoothingEnabled = false;
    previewRow.appendChild(this._previewCanvas);

    // Preview controls column
    const previewCtrls = document.createElement('div');
    Object.assign(previewCtrls.style, {
      display: 'flex', flexDirection: 'column', gap: '8px', flex: '1',
    });

    const previewTitle = document.createElement('div');
    previewTitle.style.cssText = 'font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.05em;';
    previewTitle.textContent = 'LIVE PREVIEW';
    previewCtrls.appendChild(previewTitle);

    // FPS row
    const fpsRow = document.createElement('div');
    fpsRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const fpsLabel = document.createElement('label');
    fpsLabel.style.cssText = 'font-size:11px;color:#94a3b8;';
    fpsLabel.textContent = 'FPS:';
    fpsRow.appendChild(fpsLabel);
    const fpsInp = document.createElement('input');
    fpsInp.type = 'number'; fpsInp.min = '1'; fpsInp.max = '120'; fpsInp.value = String(this._fps);
    Object.assign(fpsInp.style, { width: '52px', background: '#1e1e32', color: '#dde', border: '1px solid #3a3a56', borderRadius: '3px', padding: '2px 5px', fontSize: '12px' });
    fpsInp.addEventListener('change', () => { this._fps = parseInt(fpsInp.value) || 12; });
    fpsRow.appendChild(fpsInp);
    previewCtrls.appendChild(fpsRow);

    // Loop row
    const loopRow = document.createElement('div');
    loopRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const loopCb = document.createElement('input');
    loopCb.type = 'checkbox'; loopCb.checked = this._loop;
    loopCb.addEventListener('change', () => { this._loop = loopCb.checked; });
    const loopLabel = document.createElement('label');
    loopLabel.style.cssText = 'font-size:11px;color:#94a3b8;cursor:pointer;';
    loopLabel.textContent = 'Loop';
    loopRow.appendChild(loopCb); loopRow.appendChild(loopLabel);
    previewCtrls.appendChild(loopRow);

    // Play/Stop buttons
    const playBtnRow = document.createElement('div');
    playBtnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = 'toolbar-btn';
      b.innerHTML = label;
      b.addEventListener('click', onClick);
      return b;
    };

    const playBtn = mkBtn(iconHTML(Icons.Play, 'xs') + ' Play', () => {
      if (this._previewPlaying) {
        this._stopPreview();
        playBtn.innerHTML = iconHTML(Icons.Play, 'xs') + ' Play';
      } else {
        playBtn.innerHTML = iconHTML(Icons.Square, 'xs') + ' Stop';
        this._startPreview();
      }
    });
    playBtnRow.appendChild(playBtn);
    playBtnRow.appendChild(mkBtn(iconHTML(Icons.RotateCcw, 'xs') + ' Restart', () => {
      this._previewFrameIndex = 0;
      this._drawPreviewFrame();
    }));
    previewCtrls.appendChild(playBtnRow);

    // Frame count info
    this._animInfoRow = document.createElement('div');
    this._animInfoRow.style.cssText = 'font-size:10px;color:#414168;';
    this._animInfoRow.textContent = '0 frames';
    previewCtrls.appendChild(this._animInfoRow);

    previewRow.appendChild(previewCtrls);
    panel.appendChild(previewRow);

    // Timeline section
    const timelineHeader = document.createElement('div');
    Object.assign(timelineHeader.style, {
      padding: '6px 12px 4px', background: '#0f0f1c',
      borderBottom: '1px solid #1e1e36', flexShrink: '0',
      display: 'flex', alignItems: 'center', gap: '8px',
    });
    const tlTitle = document.createElement('span');
    tlTitle.style.cssText = 'font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.05em;flex:1;';
    tlTitle.textContent = 'ANIMATION TIMELINE';
    timelineHeader.appendChild(tlTitle);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'toolbar-btn';
    clearBtn.innerHTML = iconHTML(Icons.X, 'xs', ICON_COLORS.muted) + ' Clear All';
    clearBtn.addEventListener('click', () => {
      this._timelineFrames = [];
      this._rebuildTimeline();
      this._updateAnimInfo();
      this._drawPreviewFrame();
    });
    timelineHeader.appendChild(clearBtn);
    panel.appendChild(timelineHeader);

    this._timelineContainer = document.createElement('div');
    Object.assign(this._timelineContainer.style, {
      flex: '1', overflowX: 'auto', overflowY: 'hidden',
      display: 'flex', alignItems: 'center',
      padding: '10px 12px', gap: '6px',
      background: '#0c0c18', minHeight: '0',
    });
    this._timelineContainer.textContent = '';
    panel.appendChild(this._timelineContainer);

    // Save row
    const saveRow = document.createElement('div');
    Object.assign(saveRow.style, {
      padding: '10px 16px', background: '#0f0f1c',
      borderTop: '1px solid #1e1e36', flexShrink: '0',
      display: 'flex', gap: '10px', alignItems: 'center',
    });

    const nameLabel = document.createElement('label');
    nameLabel.style.cssText = 'font-size:11px;color:#94a3b8;white-space:nowrap;';
    nameLabel.textContent = 'Animation Name:';
    saveRow.appendChild(nameLabel);

    const nameInp = document.createElement('input');
    nameInp.type = 'text'; nameInp.value = this._animName;
    Object.assign(nameInp.style, {
      flex: '1', background: '#1e1e32', color: '#dde',
      border: '1px solid #3a3a56', borderRadius: '4px',
      padding: '4px 8px', fontSize: '12px',
    });
    nameInp.placeholder = 'e.g. Idle, Run, Jump, Attack';
    nameInp.addEventListener('change', () => { this._animName = nameInp.value.trim() || this._animName; });
    saveRow.appendChild(nameInp);

    const saveBtn = document.createElement('button');
    Object.assign(saveBtn.style, {
      background: '#16a34a', color: '#fff', border: 'none',
      borderRadius: '5px', padding: '5px 18px', fontSize: '12px',
      fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
    });
    saveBtn.innerHTML = iconHTML(Icons.Save, 'xs', '#fff') + ' Save Animation';
    saveBtn.addEventListener('click', () => this._saveAnimation(nameInp.value.trim() || this._animName));
    saveRow.appendChild(saveBtn);

    panel.appendChild(saveRow);
    return panel;
  }

  // ============================================================
  //  Sheet loading
  // ============================================================

  private _populateSheetDropdown(): void {
    this._sheetDropdown.innerHTML = '';

    const noneOpt = document.createElement('option');
    noneOpt.value = ''; noneOpt.textContent = '-- Select sprite sheet --';
    this._sheetDropdown.appendChild(noneOpt);

    for (const [id, sheet] of this._scene2D.spriteSheets) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${sheet.assetName} (${sheet.textureWidth}×${sheet.textureHeight})`;
      this._sheetDropdown.appendChild(opt);
    }

    const texLib = TextureLibrary.instance;
    if (texLib) {
      const existingSourceTex = new Set(Array.from(this._scene2D.spriteSheets.values()).map(s => s.sourceTexture));
      const sprites = texLib.getTexturesByCategory('Sprite').filter(t => !existingSourceTex.has(t.assetId));
      if (sprites.length > 0) {
        const grp = document.createElement('optgroup');
        grp.label = 'Convert Texture to Sheet';
        for (const tex of sprites) {
          const opt = document.createElement('option');
          opt.value = 'tex:' + tex.assetId;
          opt.textContent = tex.assetName + ' (convert)';
          grp.appendChild(opt);
        }
        this._sheetDropdown.appendChild(grp);
      }
    }
  }

  private _selectSheetById(id: string): void {
    const sheet = this._scene2D.spriteSheets.get(id);
    if (!sheet) return;
    this._sheet = sheet;
    this._sheetDropdown.value = id;

    if (sheet.image && sheet.image.complete && sheet.image.naturalWidth > 0) {
      this._sheetImage = sheet.image;
      this._drawSheet();
    } else if (sheet.imageDataUrl) {
      const img = new Image();
      img.onload = () => {
        sheet.image = img;
        this._sheetImage = img;
        this._drawSheet();
      };
      img.src = sheet.imageDataUrl;
    } else {
      this._sheetImage = null;
      this._drawSheet();
    }
  }

  private _importAndSelectTexture(tex: TextureAssetData): void {
    const sheetUid = uid();
    const spriteId = 'spr_' + sheetUid;
    const w = tex.metadata.width || 64;
    const h = tex.metadata.height || 64;
    const sheet: SpriteSheetAsset = {
      assetId: sheetUid,
      assetType: 'spriteSheet',
      assetName: tex.assetName,
      sourceTexture: tex.assetId,
      textureWidth: w,
      textureHeight: h,
      pixelsPerUnit: 100,
      filterMode: 'point',
      sprites: [{ spriteId, name: 'sprite_0', x: 0, y: 0, width: w, height: h, pivot: { x: 0.5, y: 0.5 } }],
      animations: [],
      imageDataUrl: tex.storedData,
    };
    const img = new Image();
    img.onload = () => {
      sheet.image = img;
      sheet.textureWidth = img.naturalWidth || w;
      sheet.textureHeight = img.naturalHeight || h;
      this._sheetImage = img;
      this._scene2D.addSpriteSheet(sheet);
      this._sheet = sheet;
      this._populateSheetDropdown();
      this._sheetDropdown.value = sheetUid;
      this._drawSheet();
    };
    img.src = tex.storedData;
    this._sheet = sheet;
  }

  // ============================================================
  //  Sheet canvas rendering + grid
  // ============================================================

  private _computeGrid(): { cols: number; rows: number; cellW: number; cellH: number } | null {
    if (!this._sheetImage || !this._sheet) return null;
    const cellW = this._gridW;
    const cellH = this._gridH;
    const cols = Math.max(1, Math.floor(this._sheet.textureWidth / cellW));
    const rows = Math.max(1, Math.floor(this._sheet.textureHeight / cellH));
    return { cols, rows, cellW, cellH };
  }

  private _drawSheet(): void {
    const ph = document.getElementById('sheet-placeholder');

    if (!this._sheetImage || !this._sheet) {
      if (ph) ph.style.display = '';
      this._sheetCanvas.style.display = 'none';
      return;
    }
    if (ph) ph.style.display = 'none';
    this._sheetCanvas.style.display = 'block';

    const sw = this._sheet.textureWidth;
    const sh = this._sheet.textureHeight;

    // Scale to fit within 440×500
    const maxW = 440; const maxH = 500;
    const scale = Math.min(maxW / sw, maxH / sh, 3);
    this._sheetScale = scale;
    this._sheetOffX = 0; this._sheetOffY = 0;

    this._sheetCanvas.width = Math.round(sw * scale);
    this._sheetCanvas.height = Math.round(sh * scale);

    const ctx = this._sheetCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this._sheetCanvas.width, this._sheetCanvas.height);

    // Checkerboard background
    const cs = 8;
    for (let cy = 0; cy < this._sheetCanvas.height; cy += cs) {
      for (let cx = 0; cx < this._sheetCanvas.width; cx += cs) {
        ctx.fillStyle = (Math.floor(cx / cs) + Math.floor(cy / cs)) % 2 === 0 ? '#1a1a22' : '#111118';
        ctx.fillRect(cx, cy, cs, cs);
      }
    }

    ctx.drawImage(this._sheetImage, 0, 0, this._sheetCanvas.width, this._sheetCanvas.height);

    const grid = this._computeGrid();
    if (!grid) return;

    const { cols, rows, cellW, cellH } = grid;
    const cw = cellW * scale;
    const ch = cellH * scale;

    // Highlight already-in-timeline frames
    const inTimeline = new Set(this._timelineFrames);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (inTimeline.has(idx)) {
          ctx.fillStyle = 'rgba(59,130,246,0.35)';
          ctx.fillRect(col * cw, row * ch, cw, ch);
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(180,210,255,0.5)';
    ctx.lineWidth = 1;
    for (let col = 0; col <= cols; col++) {
      ctx.beginPath();
      ctx.moveTo(col * cw, 0);
      ctx.lineTo(col * cw, rows * ch);
      ctx.stroke();
    }
    for (let row = 0; row <= rows; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * ch);
      ctx.lineTo(cols * cw, row * ch);
      ctx.stroke();
    }

    // Frame index labels (small)
    if (cw >= 16 && ch >= 16) {
      ctx.fillStyle = 'rgba(180,210,255,0.55)';
      ctx.font = `${Math.min(11, cw * 0.28)}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.fillText(String(row * cols + col), col * cw + 2, row * ch + 2);
        }
      }
    }
  }

  private _handleSheetClick(e: MouseEvent): void {
    const grid = this._computeGrid();
    if (!grid || !this._sheet) return;

    const rect = this._sheetCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { cols, rows, cellW, cellH } = grid;
    const cw = cellW * this._sheetScale;
    const ch = cellH * this._sheetScale;

    const col = Math.floor(mx / cw);
    const row = Math.floor(my / ch);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;

    const frameIdx = row * cols + col;
    this._timelineFrames.push(frameIdx);
    this._rebuildTimeline();
    this._updateAnimInfo();
    this._drawSheet();
    this._drawPreviewFrame();
  }

  // ============================================================
  //  Grid → SpriteData sync
  //  Ensures the SpriteSheetAsset.sprites array matches the current grid
  // ============================================================

  private _syncSprites(): SpriteData[] {
    if (!this._sheet) return [];
    const grid = this._computeGrid();
    if (!grid) return this._sheet.sprites;

    const { cols, rows, cellW, cellH } = grid;
    const total = cols * rows;
    const existingById = new Map<string, SpriteData>();
    for (const s of this._sheet.sprites) existingById.set(s.spriteId, s);

    const synced: SpriteData[] = [];
    for (let i = 0; i < total; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const existingAtPos = this._sheet.sprites.find(
        s => s.x === col * cellW && s.y === row * cellH && s.width === cellW && s.height === cellH
      );
      if (existingAtPos) {
        synced.push(existingAtPos);
      } else {
        synced.push({
          spriteId: uid(),
          name: `sprite_${i}`,
          x: col * cellW,
          y: row * cellH,
          width: cellW,
          height: cellH,
          pivot: { x: 0.5, y: 0.5 },
        });
      }
    }
    this._sheet.sprites = synced;
    return synced;
  }

  // ============================================================
  //  Timeline
  // ============================================================

  private _rebuildTimeline(): void {
    if (!this._timelineContainer) return;
    this._timelineContainer.innerHTML = '';

    if (this._timelineFrames.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        color: '#3a3a52', fontSize: '12px', padding: '0 12px',
        userSelect: 'none', whiteSpace: 'nowrap',
      });
      empty.textContent = 'Click frames on the sprite sheet above to add them here…';
      this._timelineContainer.appendChild(empty);
      return;
    }

    const grid = this._computeGrid();
    const thumbSize = 56;

    this._timelineFrames.forEach((frameIdx, tlIdx) => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        position: 'relative', flexShrink: '0', width: thumbSize + 'px',
        background: '#1a1a2e', border: '1px solid #2e2e4a',
        borderRadius: '5px', overflow: 'visible', cursor: 'grab',
        userSelect: 'none',
      });
      card.draggable = true;
      card.dataset.idx = String(tlIdx);

      // Drag and drop reorder
      card.addEventListener('dragstart', (e) => {
        this._dragSrcIndex = tlIdx;
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        card.style.opacity = '0.4';
      });
      card.addEventListener('dragend', () => { card.style.opacity = '1'; });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        card.style.borderColor = '#3b82f6';
      });
      card.addEventListener('dragleave', () => { card.style.borderColor = '#2e2e4a'; });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.style.borderColor = '#2e2e4a';
        const dest = parseInt(card.dataset.idx ?? '0');
        if (this._dragSrcIndex === dest) return;
        const moved = this._timelineFrames.splice(this._dragSrcIndex, 1)[0];
        this._timelineFrames.splice(dest, 0, moved);
        this._rebuildTimeline();
        this._drawSheet();
        this._drawPreviewFrame();
      });

      // Thumbnail canvas
      const thumb = document.createElement('canvas');
      thumb.width = thumbSize; thumb.height = thumbSize;
      Object.assign(thumb.style, {
        display: 'block', imageRendering: 'pixelated',
        borderRadius: '4px 4px 0 0', background: '#0a0a14',
      });
      const tCtx = thumb.getContext('2d')!;
      tCtx.imageSmoothingEnabled = false;
      this._drawThumb(tCtx, frameIdx, thumbSize, thumbSize, grid);
      card.appendChild(thumb);

      // Frame number label
      const label = document.createElement('div');
      Object.assign(label.style, {
        fontSize: '9px', textAlign: 'center', color: '#64748b',
        padding: '1px 0 2px', background: '#111120',
        borderRadius: '0 0 4px 4px',
      });
      label.textContent = `f${frameIdx}`;
      card.appendChild(label);

      // Remove button
      const del = document.createElement('div');
      Object.assign(del.style, {
        position: 'absolute', top: '-7px', right: '-7px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: '#ef4444', color: '#fff', fontSize: '10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', lineHeight: '1', fontWeight: '700',
        boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      });
      del.innerHTML = iconHTML(Icons.X, 10, '#fff');
      del.title = 'Remove frame';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this._timelineFrames.splice(tlIdx, 1);
        this._rebuildTimeline();
        this._updateAnimInfo();
        this._drawSheet();
        this._drawPreviewFrame();
      });
      card.appendChild(del);

      // Duplicate button
      const dup = document.createElement('div');
      Object.assign(dup.style, {
        position: 'absolute', top: '-7px', left: '-7px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: '#2563eb', color: '#fff', fontSize: '11px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', lineHeight: '1',
        boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      });
      dup.textContent = '+';
      dup.title = 'Duplicate frame';
      dup.addEventListener('click', (e) => {
        e.stopPropagation();
        this._timelineFrames.splice(tlIdx + 1, 0, frameIdx);
        this._rebuildTimeline();
        this._updateAnimInfo();
        this._drawSheet();
      });
      card.appendChild(dup);

      this._timelineContainer.appendChild(card);
    });

    // "+" add marker at end
    const addMarker = document.createElement('div');
    Object.assign(addMarker.style, {
      flexShrink: '0', width: '32px', height: thumbSize + 'px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '2px dashed #2e2e4a', borderRadius: '5px',
      color: '#3a3a52', fontSize: '20px', cursor: 'default',
    });
    addMarker.textContent = '+';
    this._timelineContainer.appendChild(addMarker);
  }

  private _drawThumb(
    ctx: CanvasRenderingContext2D,
    frameIdx: number,
    tw: number,
    th: number,
    grid: { cols: number; rows: number; cellW: number; cellH: number } | null,
  ): void {
    ctx.clearRect(0, 0, tw, th);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, tw, th);

    if (!this._sheetImage || !grid) return;
    const col = frameIdx % grid.cols;
    const row = Math.floor(frameIdx / grid.cols);
    const sx = col * grid.cellW;
    const sy = row * grid.cellH;
    const scale = Math.min(tw / grid.cellW, th / grid.cellH);
    const dw = grid.cellW * scale;
    const dh = grid.cellH * scale;
    ctx.drawImage(
      this._sheetImage,
      sx, sy, grid.cellW, grid.cellH,
      (tw - dw) / 2, (th - dh) / 2, dw, dh,
    );
  }

  private _updateAnimInfo(): void {
    if (this._animInfoRow) {
      this._animInfoRow.textContent = `${this._timelineFrames.length} frame${this._timelineFrames.length !== 1 ? 's' : ''} · ${this._fps} fps`;
    }
  }

  // ============================================================
  //  Live preview
  // ============================================================

  private _drawPreviewFrame(): void {
    const ctx = this._previewCtx;
    const cv = this._previewCanvas;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(0, 0, cv.width, cv.height);

    const grid = this._computeGrid();
    if (!this._sheetImage || !grid || this._timelineFrames.length === 0) return;

    const idx = this._previewFrameIndex % Math.max(1, this._timelineFrames.length);
    const frameIdx = this._timelineFrames[idx];
    if (frameIdx === undefined) return;

    const col = frameIdx % grid.cols;
    const row = Math.floor(frameIdx / grid.cols);
    const sx = col * grid.cellW;
    const sy = row * grid.cellH;
    const scale = Math.min(cv.width / grid.cellW, cv.height / grid.cellH);
    const dw = grid.cellW * scale;
    const dh = grid.cellH * scale;
    ctx.drawImage(
      this._sheetImage,
      sx, sy, grid.cellW, grid.cellH,
      (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh,
    );
  }

  private _startPreview(): void {
    this._stopPreview();
    if (this._timelineFrames.length === 0) return;
    this._previewPlaying = true;
    this._previewFrameIndex = 0;
    this._previewLastTime = performance.now();
    this._previewTimer = 0;

    const tick = (ts: number) => {
      if (!this._previewPlaying) return;
      const dt = (ts - this._previewLastTime) / 1000;
      this._previewLastTime = ts;
      this._previewTimer += dt;

      const frameDur = 1 / Math.max(1, this._fps);
      while (this._previewTimer >= frameDur) {
        this._previewTimer -= frameDur;
        this._previewFrameIndex++;
        if (this._previewFrameIndex >= this._timelineFrames.length) {
          if (this._loop) this._previewFrameIndex = 0;
          else { this._stopPreview(); return; }
        }
      }
      this._drawPreviewFrame();
      this._previewRafId = requestAnimationFrame(tick);
    };
    this._previewRafId = requestAnimationFrame(tick);
  }

  private _stopPreview(): void {
    this._previewPlaying = false;
    if (this._previewRafId !== null) {
      cancelAnimationFrame(this._previewRafId);
      this._previewRafId = null;
    }
  }

  // ============================================================
  //  Save animation
  // ============================================================

  private _saveAnimation(name: string): void {
    if (!this._sheet) {
      alert('Please select a sprite sheet first.');
      return;
    }
    if (this._timelineFrames.length === 0) {
      alert('Please add at least one frame to the timeline.');
      return;
    }
    if (!name) { alert('Please enter an animation name.'); return; }

    // Sync the sprite grid with the sheet
    const sprites = this._syncSprites();
    const grid = this._computeGrid()!;

    // Build frame sprite IDs from timeline
    const frameIds = this._timelineFrames.map(fi => {
      const s = sprites[fi];
      return s ? s.spriteId : '';
    }).filter(Boolean);

    // Find or create the animation on the sheet
    const existing = this._sheet.animations.find(a => a.animName === name);
    if (existing) {
      existing.frames = frameIds;
      existing.fps = this._fps;
      existing.loop = this._loop;
    } else {
      this._sheet.animations.push({
        animId: uid(),
        animName: name,
        frames: frameIds,
        fps: this._fps,
        loop: this._loop,
        events: [],
      });
    }

    // Notify scene manager to persist
    this._scene2D.addSpriteSheet(this._sheet);

    if (this._onSaved) {
      this._onSaved({
        sheetId: this._sheet.assetId,
        sheetName: this._sheet.assetName,
        animName: name,
        fps: this._fps,
        frameCount: frameIds.length,
      });
    }

    // Visual feedback
    const saveBtn = this._overlay.querySelector('button[data-saved]') as HTMLElement | null;
    // flash the overlay briefly
    this._overlay.style.borderColor = '#16a34a';
    setTimeout(() => { this._overlay.style.borderColor = ''; }, 300);

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed', bottom: '32px', right: '32px', zIndex: '10001',
      background: '#16a34a', color: '#fff', padding: '8px 18px',
      borderRadius: '6px', fontWeight: '600', fontSize: '13px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', pointerEvents: 'none',
    });
    toast.innerHTML = iconHTML(Icons.Check, 'xs', '#fff') + ` Saved "${name}" (${frameIds.length} frames)`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // ============================================================
  //  Close
  // ============================================================

  private _close(): void {
    this._stopPreview();
    this._overlay.remove();
  }
}
