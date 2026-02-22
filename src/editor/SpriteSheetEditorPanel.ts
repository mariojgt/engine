// ============================================================
//  SpriteSheetEditorPanel — Visual editor for sprite sheets
//  Double-click a sprite sheet in Content Browser to open.
//  Shows texture view, sprite list, animation list, live preview.
// ============================================================

import type { SpriteSheetAsset, SpriteData, SpriteAnimationDef, SpriteAnimEvent } from '../engine/SpriteRenderer';
import type { Scene2DManager } from './Scene2DManager';
import { iconHTML, Icons, ICON_COLORS } from './icons';

export class SpriteSheetEditorPanel {
  private _container: HTMLElement;
  private _scene2D: Scene2DManager | null = null;
  private _asset: SpriteSheetAsset | null = null;
  private _selectedSprite: SpriteData | null = null;
  private _selectedAnim: SpriteAnimationDef | null = null;

  // Preview canvas
  private _previewCanvas: HTMLCanvasElement;
  private _previewCtx: CanvasRenderingContext2D;
  private _isPreviewPlaying = false;
  private _previewFrame = 0;
  private _previewTimer = 0;
  private _previewSpeed = 1.0;
  private _lastPreviewTime = 0;
  private _previewAnimId: number | null = null;

  // Texture canvas
  private _texCanvas: HTMLCanvasElement;
  private _texCtx: CanvasRenderingContext2D;
  private _texZoom = 1;

  // Sections
  private _spriteListEl: HTMLElement | null = null;
  private _animListEl: HTMLElement | null = null;
  private _selectedInfoEl: HTMLElement | null = null;
  private _previewInfoEl: HTMLElement | null = null;

  private _onSave: ((asset: SpriteSheetAsset) => void) | null = null;
  private _onAssetChanged: (() => void) | null = null;

  constructor(container: HTMLElement, scene2D?: Scene2DManager) {
    this._container = container;
    this._scene2D = scene2D ?? null;
    this._previewCanvas = document.createElement('canvas');
    this._previewCanvas.width = 128;
    this._previewCanvas.height = 128;
    this._previewCtx = this._previewCanvas.getContext('2d')!;
    this._previewCtx.imageSmoothingEnabled = false;

    this._texCanvas = document.createElement('canvas');
    this._texCanvas.width = 512;
    this._texCanvas.height = 256;
    this._texCtx = this._texCanvas.getContext('2d')!;
    this._texCtx.imageSmoothingEnabled = false;

    this._build();
  }

  setAsset(asset: SpriteSheetAsset): void {
    this._asset = asset;
    this._selectedSprite = asset.sprites[0] ?? null;
    this._selectedAnim = asset.animations[0] ?? null;
    this._renderAll();
  }

  onSave(cb: (asset: SpriteSheetAsset) => void): void { this._onSave = cb; }
  onAssetChanged(cb: () => void): void { this._onAssetChanged = cb; }

  private _build(): void {
    const root = this._container;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#1e1e2e;color:#cdd6f4;font-family:Inter,sans-serif;font-size:12px;';

    // Header bar
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid #313244;gap:8px;';
    header.innerHTML = `${iconHTML(Icons.Clapperboard, 'xs', ICON_COLORS.secondary)}<span class="ss-title" style="font-weight:600;flex:1">Sprite Sheet</span>`;

    const saveBtn = this._makeBtn('Save', () => { if (this._asset) this._onSave?.(this._asset); });
    const revertBtn = this._makeBtn('Revert', () => { /* TODO */ });
    header.appendChild(saveBtn);
    header.appendChild(revertBtn);
    root.appendChild(header);

    // Main split: left (texture + selected) | right (sprite list + animations + preview)
    const mainSplit = document.createElement('div');
    mainSplit.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    // Left column
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'flex:1;display:flex;flex-direction:column;border-right:1px solid #313244;overflow:hidden;';

    // Texture view section
    const texSection = document.createElement('div');
    texSection.style.cssText = 'flex:1;overflow:auto;padding:8px;position:relative;';
    this._texCanvas.style.cssText = 'border:1px solid #45475a;cursor:crosshair;image-rendering:pixelated;';
    this._texCanvas.onclick = (e) => this._onTexCanvasClick(e);
    texSection.appendChild(this._texCanvas);

    const zoomRow = document.createElement('div');
    zoomRow.style.cssText = 'margin-top:4px;display:flex;gap:4px;align-items:center;';
    zoomRow.innerHTML = `<span style="opacity:0.5">Zoom</span>`;
    for (const z of [1, 2, 4]) {
      const zBtn = this._makeBtn(`${z}×`, () => { this._texZoom = z; this._renderTexture(); });
      zoomRow.appendChild(zBtn);
    }
    texSection.appendChild(zoomRow);
    leftCol.appendChild(texSection);

    // Selected sprite info
    this._selectedInfoEl = document.createElement('div');
    this._selectedInfoEl.style.cssText = 'padding:8px 10px;border-top:1px solid #313244;min-height:80px;';
    leftCol.appendChild(this._selectedInfoEl);

    mainSplit.appendChild(leftCol);

    // Right column
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'width:320px;display:flex;flex-direction:column;overflow:hidden;';

    // Sprites list
    const spriteSection = document.createElement('div');
    spriteSection.style.cssText = 'flex:1;overflow:auto;border-bottom:1px solid #313244;';
    const spriteHeader = document.createElement('div');
    spriteHeader.style.cssText = 'padding:6px 10px;font-weight:600;display:flex;align-items:center;gap:6px;border-bottom:1px solid #313244;';
    spriteHeader.innerHTML = `<span>SPRITES</span><span style="flex:1"></span>`;

    const sliceGridBtn = this._makeBtn('Slice Grid', () => this._sliceGrid());
    const sliceAutoBtn = this._makeBtn('Slice Auto', () => this._sliceAuto());
    const addSpriteBtn = this._makeBtn('+ Add', () => this._addSprite());
    spriteHeader.appendChild(sliceGridBtn);
    spriteHeader.appendChild(sliceAutoBtn);
    spriteHeader.appendChild(addSpriteBtn);
    spriteSection.appendChild(spriteHeader);

    this._spriteListEl = document.createElement('div');
    this._spriteListEl.style.cssText = 'padding:4px;';
    spriteSection.appendChild(this._spriteListEl);
    rightCol.appendChild(spriteSection);

    // Animations section
    const animSection = document.createElement('div');
    animSection.style.cssText = 'flex:1;overflow:auto;';
    const animHeader = document.createElement('div');
    animHeader.style.cssText = 'padding:6px 10px;font-weight:600;display:flex;align-items:center;gap:6px;border-bottom:1px solid #313244;';
    animHeader.innerHTML = `<span>ANIMATIONS</span><span style="flex:1"></span>`;

    const addAnimBtn = this._makeBtn('+ New Animation', () => this._addAnimation());
    animHeader.appendChild(addAnimBtn);
    animSection.appendChild(animHeader);

    this._animListEl = document.createElement('div');
    this._animListEl.style.cssText = 'padding:4px;';
    animSection.appendChild(this._animListEl);
    rightCol.appendChild(animSection);

    // Preview section
    const previewSection = document.createElement('div');
    previewSection.style.cssText = 'padding:8px 10px;border-top:1px solid #313244;min-height:160px;';
    const previewLabel = document.createElement('div');
    previewLabel.style.cssText = 'font-weight:600;margin-bottom:6px;';
    previewLabel.textContent = 'PREVIEW';
    previewSection.appendChild(previewLabel);

    const previewRow = document.createElement('div');
    previewRow.style.cssText = 'display:flex;gap:10px;align-items:flex-start;';
    this._previewCanvas.style.cssText = 'border:1px solid #45475a;background:#11111b;image-rendering:pixelated;';
    previewRow.appendChild(this._previewCanvas);

    this._previewInfoEl = document.createElement('div');
    this._previewInfoEl.style.cssText = 'flex:1;';
    previewRow.appendChild(this._previewInfoEl);
    previewSection.appendChild(previewRow);

    // Controls
    const controlRow = document.createElement('div');
    controlRow.style.cssText = 'display:flex;gap:4px;margin-top:6px;align-items:center;';
    controlRow.appendChild(this._makeBtn(iconHTML(Icons.SkipBack, 'xs', ICON_COLORS.secondary), () => { this._previewFrame = 0; this._renderPreviewFrame(); }));
    controlRow.appendChild(this._makeBtn(iconHTML(Icons.ChevronLeft, 'xs', ICON_COLORS.secondary), () => { if (this._previewFrame > 0) this._previewFrame--; this._renderPreviewFrame(); }));
    controlRow.appendChild(this._makeBtn(iconHTML(Icons.Play, 'xs') + ' Play', () => this._togglePreview()));
    controlRow.appendChild(this._makeBtn(iconHTML(Icons.ChevronRight, 'xs', ICON_COLORS.secondary), () => this._advancePreviewFrame()));
    controlRow.appendChild(this._makeBtn(iconHTML(Icons.SkipForward, 'xs', ICON_COLORS.secondary), () => {
      if (this._selectedAnim) { this._previewFrame = this._selectedAnim.frames.length - 1; this._renderPreviewFrame(); }
    }));
    const speedLabel = document.createElement('span');
    speedLabel.style.cssText = 'margin-left:8px;opacity:0.5;';
    speedLabel.textContent = 'Speed';
    controlRow.appendChild(speedLabel);
    const speedInput = document.createElement('input');
    speedInput.type = 'number';
    speedInput.value = '1.0';
    speedInput.step = '0.1';
    speedInput.min = '0.1';
    speedInput.max = '5.0';
    speedInput.style.cssText = 'width:50px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:2px 4px;font-size:11px;';
    speedInput.onchange = () => { this._previewSpeed = parseFloat(speedInput.value) || 1.0; };
    controlRow.appendChild(speedInput);
    previewSection.appendChild(controlRow);

    rightCol.appendChild(previewSection);
    mainSplit.appendChild(rightCol);
    root.appendChild(mainSplit);
  }

  private _renderAll(): void {
    this._renderTexture();
    this._renderSpriteList();
    this._renderAnimList();
    this._renderSelectedInfo();
    this._renderPreviewFrame();
    // Update title
    const titleEl = this._container.querySelector('.ss-title');
    if (titleEl && this._asset) titleEl.textContent = this._asset.assetName;
  }

  private _renderTexture(): void {
    if (!this._asset?.image) return;
    const img = this._asset.image;
    const z = this._texZoom;
    this._texCanvas.width = img.width * z;
    this._texCanvas.height = img.height * z;
    this._texCtx.imageSmoothingEnabled = false;
    this._texCtx.clearRect(0, 0, this._texCanvas.width, this._texCanvas.height);
    this._texCtx.drawImage(img, 0, 0, img.width * z, img.height * z);

    // Draw sprite rectangles
    for (const sprite of this._asset.sprites) {
      this._texCtx.strokeStyle = sprite === this._selectedSprite ? '#89b4fa' : '#f5c2e7';
      this._texCtx.lineWidth = sprite === this._selectedSprite ? 2 : 1;
      this._texCtx.strokeRect(sprite.x * z, sprite.y * z, sprite.width * z, sprite.height * z);
    }
  }

  private _renderSpriteList(): void {
    if (!this._spriteListEl || !this._asset) return;
    this._spriteListEl.innerHTML = '';
    for (const sprite of this._asset.sprites) {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:3px;cursor:pointer;${sprite === this._selectedSprite ? 'background:#45475a;' : ''}`;
      row.innerHTML = `<span style="flex:1">${sprite.name}</span><span style="opacity:0.5;font-size:10px">x:${sprite.x} y:${sprite.y} ${sprite.width}×${sprite.height}</span>`;
      row.onclick = () => { this._selectedSprite = sprite; this._renderAll(); };
      this._spriteListEl.appendChild(row);
    }
  }

  private _renderAnimList(): void {
    if (!this._animListEl || !this._asset) return;
    this._animListEl.innerHTML = '';
    for (const anim of this._asset.animations) {
      const row = document.createElement('div');
      const isActive = anim === this._selectedAnim;
      row.style.cssText = `display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:3px;cursor:pointer;${isActive ? 'background:#45475a;' : ''}`;
      row.innerHTML = `${iconHTML(Icons.Play, 'xs', '#3b82f6')}<span style="flex:1">${anim.animName}</span><span style="opacity:0.5;font-size:10px">${anim.frames.length}fr ${anim.fps}fps${anim.loop ? ' loop' : ''}</span>`;
      row.onclick = () => {
        this._selectedAnim = anim;
        this._previewFrame = 0;
        this._renderAll();
      };

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.innerHTML = iconHTML(Icons.Trash2, 'xs', ICON_COLORS.red);
      delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#f38ba8;font-size:11px;padding:2px;';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        this._asset!.animations = this._asset!.animations.filter(a => a !== anim);
        if (this._selectedAnim === anim) this._selectedAnim = this._asset!.animations[0] ?? null;
        this._renderAll();
        this._onAssetChanged?.();
      };
      row.appendChild(delBtn);
      this._animListEl.appendChild(row);
    }
  }

  private _renderSelectedInfo(): void {
    if (!this._selectedInfoEl) return;
    if (!this._selectedSprite) {
      this._selectedInfoEl.innerHTML = '<span style="opacity:0.5">No sprite selected</span>';
      return;
    }
    const s = this._selectedSprite;
    this._selectedInfoEl.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px">SELECTED SPRITE: ${s.name}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <span>X <input type="number" value="${s.x}" style="width:50px" data-field="x"></span>
        <span>Y <input type="number" value="${s.y}" style="width:50px" data-field="y"></span>
        <span>W <input type="number" value="${s.width}" style="width:50px" data-field="width"></span>
        <span>H <input type="number" value="${s.height}" style="width:50px" data-field="height"></span>
      </div>
      <div style="display:flex;gap:12px;margin-top:4px">
        <span>Pivot X <input type="number" value="${s.pivot.x}" step="0.1" style="width:50px" data-field="pivotX"></span>
        <span>Pivot Y <input type="number" value="${s.pivot.y}" step="0.1" style="width:50px" data-field="pivotY"></span>
      </div>
      <div style="margin-top:4px">Name <input type="text" value="${s.name}" style="width:120px" data-field="name"></div>
    `;

    // Style all inputs
    this._selectedInfoEl.querySelectorAll('input').forEach(inp => {
      inp.style.cssText = 'background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:2px 4px;font-size:11px;';
      inp.onchange = () => {
        const field = inp.dataset.field!;
        if (field === 'name') s.name = inp.value;
        else if (field === 'pivotX') s.pivot.x = parseFloat(inp.value);
        else if (field === 'pivotY') s.pivot.y = parseFloat(inp.value);
        else (s as any)[field] = parseInt(inp.value);
        this._renderAll();
        this._onAssetChanged?.();
      };
    });
  }

  // ---- Preview ----

  private _togglePreview(): void {
    if (this._isPreviewPlaying) {
      this._stopPreview();
    } else {
      this._startPreview();
    }
  }

  private _startPreview(): void {
    if (!this._selectedAnim) return;
    this._isPreviewPlaying = true;
    this._lastPreviewTime = performance.now();
    this._previewTimer = 0;
    this._tickPreview(performance.now());
  }

  private _stopPreview(): void {
    this._isPreviewPlaying = false;
    if (this._previewAnimId !== null) cancelAnimationFrame(this._previewAnimId);
  }

  private _tickPreview(timestamp: number): void {
    if (!this._isPreviewPlaying || !this._selectedAnim) return;

    const dt = (timestamp - this._lastPreviewTime) / 1000;
    this._lastPreviewTime = timestamp;
    this._previewTimer += dt * this._previewSpeed;

    const frameDuration = 1.0 / this._selectedAnim.fps;
    while (this._previewTimer >= frameDuration) {
      this._previewTimer -= frameDuration;
      this._previewFrame++;
      if (this._previewFrame >= this._selectedAnim.frames.length) {
        if (this._selectedAnim.loop) {
          this._previewFrame = 0;
        } else {
          this._previewFrame = this._selectedAnim.frames.length - 1;
          this._stopPreview();
          return;
        }
      }
    }

    this._renderPreviewFrame();
    this._previewAnimId = requestAnimationFrame(t => this._tickPreview(t));
  }

  private _advancePreviewFrame(): void {
    if (!this._selectedAnim) return;
    this._previewFrame++;
    if (this._previewFrame >= this._selectedAnim.frames.length) this._previewFrame = 0;
    this._renderPreviewFrame();
  }

  private _renderPreviewFrame(): void {
    const ctx = this._previewCtx;
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, 128, 128);

    if (!this._selectedAnim || !this._asset?.image) {
      this._updatePreviewInfo();
      return;
    }

    const frameId = this._selectedAnim.frames[this._previewFrame];
    const sprite = this._asset.sprites.find(s => s.spriteId === frameId);
    if (!sprite) { this._updatePreviewInfo(); return; }

    const img = this._asset.image;
    const scale = Math.min(128 / sprite.width, 128 / sprite.height);
    const dw = sprite.width * scale;
    const dh = sprite.height * scale;
    ctx.drawImage(img, sprite.x, sprite.y, sprite.width, sprite.height,
      (128 - dw) / 2, (128 - dh) / 2, dw, dh);

    this._updatePreviewInfo();
  }

  private _updatePreviewInfo(): void {
    if (!this._previewInfoEl) return;
    if (!this._selectedAnim) {
      this._previewInfoEl.innerHTML = '<span style="opacity:0.5">No animation selected</span>';
      return;
    }
    const a = this._selectedAnim;
    this._previewInfoEl.innerHTML = `
      <div>Animation: <strong>${a.animName}</strong></div>
      <div>Frame: ${this._previewFrame + 1}/${a.frames.length}</div>
      <div>FPS: ${a.fps}</div>
      <div>${a.loop ? iconHTML(Icons.Repeat, 'xs', ICON_COLORS.muted) + ' Loop' : iconHTML(Icons.ArrowRight, 'xs', ICON_COLORS.muted) + ' Once'}</div>
    `;
  }

  // ---- Texture canvas interaction ----

  private _onTexCanvasClick(e: MouseEvent): void {
    if (!this._asset) return;
    const rect = this._texCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this._texZoom;
    const y = (e.clientY - rect.top) / this._texZoom;

    // Find clicked sprite
    for (const sprite of this._asset.sprites) {
      if (x >= sprite.x && x < sprite.x + sprite.width && y >= sprite.y && y < sprite.y + sprite.height) {
        this._selectedSprite = sprite;
        this._renderAll();
        return;
      }
    }
  }

  // ---- Actions ----

  private _sliceGrid(): void {
    if (!this._asset) return;
    const wStr = prompt('Cell width:', '64');
    const hStr = prompt('Cell height:', '64');
    if (!wStr || !hStr) return;
    const cellW = parseInt(wStr);
    const cellH = parseInt(hStr);
    if (cellW <= 0 || cellH <= 0) return;

    this._asset.sprites = [];
    let idx = 0;
    for (let y = 0; y < this._asset.textureHeight; y += cellH) {
      for (let x = 0; x < this._asset.textureWidth; x += cellW) {
        const w = Math.min(cellW, this._asset.textureWidth - x);
        const h = Math.min(cellH, this._asset.textureHeight - y);
        this._asset.sprites.push({
          spriteId: `sprite-${idx}`,
          name: `Sprite_${idx}`,
          x, y, width: w, height: h,
          pivot: { x: 0.5, y: 0.0 },
        });
        idx++;
      }
    }
    this._selectedSprite = this._asset.sprites[0] ?? null;
    this._renderAll();
    this._onAssetChanged?.();
  }

  private _sliceAuto(): void {
    // TODO: Implement auto-detection of non-transparent regions
    alert('Auto-slice not yet implemented. Use Grid slice.');
  }

  private _addSprite(): void {
    if (!this._asset) return;
    const idx = this._asset.sprites.length;
    const sprite: SpriteData = {
      spriteId: `sprite-${idx}-${Date.now().toString(36)}`,
      name: `NewSprite_${idx}`,
      x: 0, y: 0, width: 64, height: 64,
      pivot: { x: 0.5, y: 0.0 },
    };
    this._asset.sprites.push(sprite);
    this._selectedSprite = sprite;
    this._renderAll();
    this._onAssetChanged?.();
  }

  private _addAnimation(): void {
    if (!this._asset) return;
    const name = prompt('Animation name:', 'NewAnim');
    if (!name?.trim()) return;
    const anim: SpriteAnimationDef = {
      animId: `anim-${Date.now().toString(36)}`,
      animName: name.trim(),
      frames: [],
      fps: 8,
      loop: true,
      events: [],
    };
    this._asset.animations.push(anim);
    this._selectedAnim = anim;
    this._renderAll();
    this._onAssetChanged?.();
  }

  // ---- Utilities ----

  private _makeBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.style.cssText = 'background:#45475a;color:#cdd6f4;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;';
    btn.onmouseenter = () => { btn.style.background = '#585b70'; };
    btn.onmouseleave = () => { btn.style.background = '#45475a'; };
    btn.onclick = onClick;
    return btn;
  }

  dispose(): void {
    this._stopPreview();
    this._container.innerHTML = '';
  }
}
