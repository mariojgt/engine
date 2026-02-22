// ============================================================
//  SpriteAnimationEditorPanel — Standalone animation editor
//  Timeline, frame strip, drag-to-reorder, frame events,
//  live preview canvas. Feeds into Animation Blueprint 2D.
// ============================================================

import type { SpriteSheetAsset, SpriteData, SpriteAnimationDef, SpriteAnimEvent } from '../engine/SpriteRenderer';
import { iconHTML, Icons, ICON_COLORS } from './icons';

export class SpriteAnimationEditorPanel {
  private _container: HTMLElement;
  private _asset: SpriteSheetAsset | null = null;
  private _selectedAnim: SpriteAnimationDef | null = null;

  // Preview
  private _previewCanvas: HTMLCanvasElement;
  private _previewCtx: CanvasRenderingContext2D;
  private _isPlaying = false;
  private _currentFrame = 0;
  private _frameTimer = 0;
  private _playbackSpeed = 1.0;
  private _lastTime = 0;
  private _animFrameId: number | null = null;

  // Sections
  private _animListEl: HTMLElement | null = null;
  private _timelineEl: HTMLElement | null = null;
  private _eventsEl: HTMLElement | null = null;
  private _previewInfoEl: HTMLElement | null = null;

  private _onSave: ((asset: SpriteSheetAsset) => void) | null = null;
  private _onChanged: (() => void) | null = null;

  constructor(container: HTMLElement, scene2D?: any) {
    this._container = container;
    this._previewCanvas = document.createElement('canvas');
    this._previewCanvas.width = 128;
    this._previewCanvas.height = 128;
    this._previewCtx = this._previewCanvas.getContext('2d')!;
    this._previewCtx.imageSmoothingEnabled = false;
    this._build();
  }

  setAsset(asset: SpriteSheetAsset): void {
    this._asset = asset;
    this._selectedAnim = asset.animations[0] ?? null;
    this._currentFrame = 0;
    this._renderAll();
  }

  onSave(cb: (asset: SpriteSheetAsset) => void): void { this._onSave = cb; }
  onChanged(cb: () => void): void { this._onChanged = cb; }

  private _build(): void {
    const root = this._container;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#1e1e2e;color:#cdd6f4;font-family:Inter,sans-serif;font-size:12px;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid #313244;gap:8px;';
    header.innerHTML = `${iconHTML(Icons.Clapperboard, 'xs', ICON_COLORS.secondary)}<span style="font-weight:600;flex:1">SPRITE ANIMATION EDITOR</span>`;
    root.appendChild(header);

    // Main split: left (anim list) | right (timeline + events + preview)
    const mainSplit = document.createElement('div');
    mainSplit.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    // Left — animation list
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'width:160px;border-right:1px solid #313244;display:flex;flex-direction:column;overflow:hidden;';

    const listHeader = document.createElement('div');
    listHeader.style.cssText = 'padding:6px 10px;font-weight:600;display:flex;align-items:center;gap:4px;border-bottom:1px solid #313244;';
    listHeader.innerHTML = `<span>ANIMATION LIST</span>`;
    const addBtn = this._makeBtn('+ New', () => this._addAnimation());
    listHeader.appendChild(addBtn);
    leftCol.appendChild(listHeader);

    this._animListEl = document.createElement('div');
    this._animListEl.style.cssText = 'flex:1;overflow-y:auto;padding:4px;';
    leftCol.appendChild(this._animListEl);
    mainSplit.appendChild(leftCol);

    // Right column
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';

    // Timeline section
    const timelineSection = document.createElement('div');
    timelineSection.style.cssText = 'padding:8px 10px;border-bottom:1px solid #313244;';
    const timelineHeader = document.createElement('div');
    timelineHeader.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    timelineHeader.innerHTML = `<span style="font-weight:600" class="timeline-title">TIMELINE</span>`;
    timelineSection.appendChild(timelineHeader);

    // FPS / Loop controls
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:6px;';
    controlsRow.innerHTML = `
      <span>FPS <input type="number" class="anim-fps" value="8" min="1" max="60" style="width:40px"></span>
      <label><input type="checkbox" class="anim-loop" checked> Loop</label>
    `;
    const previewBtn = this._makeBtn(iconHTML(Icons.Play, 'xs') + ' Preview', () => this._togglePreview());
    const stopBtn = this._makeBtn(iconHTML(Icons.Square, 'xs') + ' Stop', () => this._stopPreview());
    controlsRow.appendChild(previewBtn);
    controlsRow.appendChild(stopBtn);
    timelineSection.appendChild(controlsRow);

    // Frame strip
    this._timelineEl = document.createElement('div');
    this._timelineEl.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;min-height:50px;padding:4px;background:#11111b;border-radius:4px;';
    timelineSection.appendChild(this._timelineEl);

    // Add frame button
    const addFrameRow = document.createElement('div');
    addFrameRow.style.cssText = 'margin-top:4px;';
    const addFrameBtn = this._makeBtn('+ Add Frame', () => this._addFrame());
    addFrameRow.appendChild(addFrameBtn);
    timelineSection.appendChild(addFrameRow);

    rightCol.appendChild(timelineSection);

    // Frame events section
    const eventsSection = document.createElement('div');
    eventsSection.style.cssText = 'padding:8px 10px;border-bottom:1px solid #313244;min-height:60px;';
    eventsSection.innerHTML = `<div style="font-weight:600;margin-bottom:4px">FRAME EVENTS</div>`;
    this._eventsEl = document.createElement('div');
    eventsSection.appendChild(this._eventsEl);
    rightCol.appendChild(eventsSection);

    // Live preview section
    const previewSection = document.createElement('div');
    previewSection.style.cssText = 'padding:8px 10px;display:flex;gap:10px;align-items:flex-start;';
    this._previewCanvas.style.cssText = 'border:1px solid #45475a;background:#11111b;image-rendering:pixelated;';
    previewSection.appendChild(this._previewCanvas);

    this._previewInfoEl = document.createElement('div');
    this._previewInfoEl.style.cssText = 'flex:1;';
    previewSection.appendChild(this._previewInfoEl);

    // Playback controls
    const playRow = document.createElement('div');
    playRow.style.cssText = 'display:flex;gap:4px;margin-top:6px;';
    playRow.appendChild(this._makeBtn(iconHTML(Icons.SkipBack, 'xs', ICON_COLORS.secondary), () => { this._currentFrame = 0; this._renderPreview(); }));
    playRow.appendChild(this._makeBtn(iconHTML(Icons.ChevronLeft, 'xs', ICON_COLORS.secondary), () => { if (this._currentFrame > 0) this._currentFrame--; this._renderPreview(); }));
    playRow.appendChild(this._makeBtn(iconHTML(Icons.Play, 'xs') + ' Play', () => this._togglePreview()));
    playRow.appendChild(this._makeBtn(iconHTML(Icons.ChevronRight, 'xs', ICON_COLORS.secondary), () => { this._advanceFrame(); }));
    playRow.appendChild(this._makeBtn(iconHTML(Icons.SkipForward, 'xs', ICON_COLORS.secondary), () => {
      if (this._selectedAnim) { this._currentFrame = this._selectedAnim.frames.length - 1; this._renderPreview(); }
    }));
    previewSection.appendChild(playRow);

    rightCol.appendChild(previewSection);
    mainSplit.appendChild(rightCol);
    root.appendChild(mainSplit);

    // Wire fps/loop inputs
    const fpsInput = root.querySelector('.anim-fps') as HTMLInputElement;
    const loopInput = root.querySelector('.anim-loop') as HTMLInputElement;
    if (fpsInput) fpsInput.onchange = () => {
      if (this._selectedAnim) { this._selectedAnim.fps = parseInt(fpsInput.value) || 8; this._onChanged?.(); }
    };
    if (loopInput) loopInput.onchange = () => {
      if (this._selectedAnim) { this._selectedAnim.loop = loopInput.checked; this._onChanged?.(); }
    };
  }

  private _renderAll(): void {
    this._renderAnimList();
    this._renderTimeline();
    this._renderEvents();
    this._renderPreview();
  }

  private _renderAnimList(): void {
    if (!this._animListEl || !this._asset) return;
    this._animListEl.innerHTML = '';
    for (const anim of this._asset.animations) {
      const row = document.createElement('div');
      const isActive = anim === this._selectedAnim;
      row.style.cssText = `padding:4px 6px;border-radius:3px;cursor:pointer;display:flex;align-items:center;gap:4px;${isActive ? 'background:#45475a;' : ''}`;
      row.innerHTML = `${iconHTML(Icons.Play, 'xs', '#3b82f6')}<span style="flex:1">${anim.animName}</span>`;
      row.onclick = () => {
        this._selectedAnim = anim;
        this._currentFrame = 0;
        this._renderAll();
      };

      const delBtn = document.createElement('button');
      delBtn.innerHTML = iconHTML(Icons.Trash2, 'xs', ICON_COLORS.red);
      delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#f38ba8;font-size:11px;padding:2px;';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        this._asset!.animations = this._asset!.animations.filter(a => a !== anim);
        if (this._selectedAnim === anim) this._selectedAnim = this._asset!.animations[0] ?? null;
        this._renderAll();
        this._onChanged?.();
      };
      row.appendChild(delBtn);
      this._animListEl.appendChild(row);
    }
  }

  private _renderTimeline(): void {
    if (!this._timelineEl || !this._selectedAnim || !this._asset) return;
    this._timelineEl.innerHTML = '';

    // Update fps/loop inputs
    const fpsInput = this._container.querySelector('.anim-fps') as HTMLInputElement;
    const loopInput = this._container.querySelector('.anim-loop') as HTMLInputElement;
    if (fpsInput) fpsInput.value = String(this._selectedAnim.fps);
    if (loopInput) loopInput.checked = this._selectedAnim.loop;

    // Title
    const titleEl = this._container.querySelector('.timeline-title');
    if (titleEl) titleEl.textContent = `TIMELINE — ${this._selectedAnim.animName}`;

    this._selectedAnim.frames.forEach((frameId, idx) => {
      const sprite = this._asset!.sprites.find(s => s.spriteId === frameId);
      const cell = document.createElement('div');
      cell.style.cssText = `width:48px;height:48px;border:1px solid ${idx === this._currentFrame ? '#89b4fa' : '#45475a'};border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;background:#181825;position:relative;`;
      cell.draggable = true;
      cell.dataset.frameIndex = String(idx);

      // Frame number
      const numLabel = document.createElement('span');
      numLabel.textContent = String(idx);
      numLabel.style.cssText = 'font-size:9px;opacity:0.5;position:absolute;top:1px;left:3px;';
      cell.appendChild(numLabel);

      // Sprite name preview
      const nameLabel = document.createElement('span');
      nameLabel.textContent = sprite?.name?.slice(0, 6) ?? '?';
      nameLabel.style.cssText = 'font-size:9px;';
      cell.appendChild(nameLabel);

      // Click to select frame
      cell.onclick = () => {
        this._currentFrame = idx;
        this._renderAll();
      };

      // Drag to reorder
      cell.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('text/plain', String(idx));
        cell.style.opacity = '0.5';
      });
      cell.addEventListener('dragend', () => { cell.style.opacity = '1'; });
      cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.style.borderColor = '#89b4fa'; });
      cell.addEventListener('dragleave', () => { cell.style.borderColor = idx === this._currentFrame ? '#89b4fa' : '#45475a'; });
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer!.getData('text/plain'));
        if (fromIdx !== idx && this._selectedAnim) {
          const frames = this._selectedAnim.frames;
          const [moved] = frames.splice(fromIdx, 1);
          frames.splice(idx, 0, moved);
          this._renderAll();
          this._onChanged?.();
        }
      });

      // Remove frame button
      const removeBtn = document.createElement('span');
      removeBtn.innerHTML = iconHTML(Icons.X, 'xs');
      removeBtn.style.cssText = 'position:absolute;top:0;right:2px;cursor:pointer;color:#f38ba8;font-size:10px;';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this._selectedAnim!.frames.splice(idx, 1);
        if (this._currentFrame >= this._selectedAnim!.frames.length) this._currentFrame = Math.max(0, this._selectedAnim!.frames.length - 1);
        this._renderAll();
        this._onChanged?.();
      };
      cell.appendChild(removeBtn);

      this._timelineEl!.appendChild(cell);
    });
  }

  private _renderEvents(): void {
    if (!this._eventsEl || !this._selectedAnim) { if (this._eventsEl) this._eventsEl.innerHTML = ''; return; }
    this._eventsEl.innerHTML = '';

    const events = this._selectedAnim.events || [];
    for (const ev of events) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:3px;';
      row.innerHTML = `<span>Frame ${ev.frame}:</span><input type="text" value="${ev.name}" style="flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:2px 4px;font-size:11px;">`;

      const input = row.querySelector('input')!;
      input.onchange = () => { ev.name = input.value; this._onChanged?.(); };

      const delBtn = this._makeBtn(iconHTML(Icons.Trash2, 'xs', ICON_COLORS.red), () => {
        this._selectedAnim!.events = this._selectedAnim!.events.filter(e => e !== ev);
        this._renderEvents();
        this._onChanged?.();
      });
      delBtn.style.color = '#f38ba8';
      row.appendChild(delBtn);
      this._eventsEl.appendChild(row);
    }

    const addEventBtn = this._makeBtn('+ Add Event', () => {
      if (!this._selectedAnim) return;
      if (!this._selectedAnim.events) this._selectedAnim.events = [];
      this._selectedAnim.events.push({ frame: this._currentFrame, name: 'NewEvent' });
      this._renderEvents();
      this._onChanged?.();
    });
    this._eventsEl.appendChild(addEventBtn);
  }

  private _renderPreview(): void {
    const ctx = this._previewCtx;
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, 128, 128);

    if (!this._selectedAnim || !this._asset?.image || this._selectedAnim.frames.length === 0) {
      this._updatePreviewInfo();
      return;
    }

    const frameId = this._selectedAnim.frames[this._currentFrame];
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
    if (!this._selectedAnim || this._selectedAnim.frames.length === 0) {
      this._previewInfoEl.innerHTML = '<span style="opacity:0.5">No frames</span>';
      return;
    }
    this._previewInfoEl.innerHTML = `
      <div>Animation: <strong>${this._selectedAnim.animName}</strong></div>
      <div>Frame: ${this._currentFrame + 1}/${this._selectedAnim.frames.length}</div>
      <div>FPS: ${this._selectedAnim.fps}</div>
    `;
  }

  // ---- Preview playback ----

  private _togglePreview(): void {
    this._isPlaying ? this._stopPreview() : this._startPreview();
  }

  private _startPreview(): void {
    if (!this._selectedAnim || this._selectedAnim.frames.length === 0) return;
    this._isPlaying = true;
    this._lastTime = performance.now();
    this._frameTimer = 0;
    this._tick(performance.now());
  }

  private _stopPreview(): void {
    this._isPlaying = false;
    if (this._animFrameId !== null) cancelAnimationFrame(this._animFrameId);
  }

  private _tick(timestamp: number): void {
    if (!this._isPlaying || !this._selectedAnim) return;
    const dt = (timestamp - this._lastTime) / 1000;
    this._lastTime = timestamp;
    this._frameTimer += dt * this._playbackSpeed;

    const frameDuration = 1.0 / this._selectedAnim.fps;
    while (this._frameTimer >= frameDuration) {
      this._frameTimer -= frameDuration;
      this._currentFrame++;
      if (this._currentFrame >= this._selectedAnim.frames.length) {
        if (this._selectedAnim.loop) this._currentFrame = 0;
        else { this._currentFrame = this._selectedAnim.frames.length - 1; this._stopPreview(); return; }
      }
    }
    this._renderPreview();
    this._renderTimeline(); // Highlight current frame
    this._animFrameId = requestAnimationFrame(t => this._tick(t));
  }

  private _advanceFrame(): void {
    if (!this._selectedAnim || this._selectedAnim.frames.length === 0) return;
    this._currentFrame = (this._currentFrame + 1) % this._selectedAnim.frames.length;
    this._renderPreview();
    this._renderTimeline();
  }

  // ---- Actions ----

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
    this._currentFrame = 0;
    this._renderAll();
    this._onChanged?.();
  }

  private _addFrame(): void {
    if (!this._selectedAnim || !this._asset) return;
    // Show sprite selection prompt
    if (this._asset.sprites.length === 0) {
      alert('No sprites defined. Slice the sprite sheet first.');
      return;
    }
    // Add all sprites as frames (user can remove unneeded ones)
    const idx = prompt(`Enter sprite index (0-${this._asset.sprites.length - 1}) or "all":`, '0');
    if (idx === null) return;
    if (idx.toLowerCase() === 'all') {
      this._selectedAnim.frames.push(...this._asset.sprites.map(s => s.spriteId));
    } else {
      const i = parseInt(idx);
      if (i >= 0 && i < this._asset.sprites.length) {
        this._selectedAnim.frames.push(this._asset.sprites[i].spriteId);
      }
    }
    this._renderAll();
    this._onChanged?.();
  }

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
