// ============================================================
//  WidgetAnimationTimeline — UE-style Animation Timeline Editor
//  Provides a visual timeline with tracks, keyframes, scrubber,
//  playback controls, and curve editing for widget animations.
// ============================================================

import type {
  WidgetBlueprintAsset,
  WidgetAnimation,
  WidgetAnimationTrack,
  WidgetAnimationKey,
} from './WidgetBlueprintData';
import { defaultWidgetAnimation } from './WidgetBlueprintData';
import { iconHTML, Icons, ICON_COLORS } from './icons';

// ============================================================
//  Types
// ============================================================

export type TimelinePlaybackState = 'stopped' | 'playing' | 'paused';

export interface TimelineKeyframeSelection {
  trackIndex: number;
  keyIndex: number;
}

const EASING_TYPES = ['Linear', 'EaseIn', 'EaseOut', 'EaseInOut'] as const;

/** Animatable property definitions */
const ANIMATABLE_PROPERTIES = [
  { path: 'renderOpacity',       label: 'Opacity',       min: 0, max: 1, step: 0.01 },
  { path: 'slot.offsetX',        label: 'Position X',    min: -9999, max: 9999, step: 1 },
  { path: 'slot.offsetY',        label: 'Position Y',    min: -9999, max: 9999, step: 1 },
  { path: 'slot.sizeX',          label: 'Size X',        min: 0, max: 9999, step: 1 },
  { path: 'slot.sizeY',          label: 'Size Y',        min: 0, max: 9999, step: 1 },
  { path: 'renderTranslation.x', label: 'Translate X',   min: -9999, max: 9999, step: 1 },
  { path: 'renderTranslation.y', label: 'Translate Y',   min: -9999, max: 9999, step: 1 },
  { path: 'renderAngle',         label: 'Rotation',      min: -360, max: 360, step: 1 },
  { path: 'renderScale.x',       label: 'Scale X',       min: 0.01, max: 10, step: 0.01 },
  { path: 'renderScale.y',       label: 'Scale Y',       min: 0.01, max: 10, step: 0.01 },
] as const;

// ============================================================
//  WidgetAnimationTimeline
// ============================================================

export class WidgetAnimationTimeline {
  private _container: HTMLElement;
  private _asset: WidgetBlueprintAsset;
  private _onDirty: () => void;

  // State
  private _currentAnimIndex = 0;
  private _currentTime = 0;
  private _playbackState: TimelinePlaybackState = 'stopped';
  private _playbackSpeed = 1.0;
  private _lastFrameTime = 0;
  private _animFrameId = 0;

  // Selection
  private _selectedKeyframe: TimelineKeyframeSelection | null = null;
  private _selectedTrackIndex = -1;

  // UI elements
  private _timelineCanvas!: HTMLCanvasElement;
  private _timelineCtx!: CanvasRenderingContext2D;
  private _trackListEl!: HTMLElement;
  private _controlsEl!: HTMLElement;
  private _timeDisplay!: HTMLElement;
  private _animSelector!: HTMLSelectElement;
  private _keyframePropsEl!: HTMLElement;

  // View params
  private _timeScale = 200; // pixels per second
  private _scrollX = 0;
  private _trackHeight = 28;
  private _headerHeight = 30;

  constructor(container: HTMLElement, asset: WidgetBlueprintAsset, onDirty: () => void) {
    this._container = container;
    this._asset = asset;
    this._onDirty = onDirty;
    this._build();
  }

  dispose(): void {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = 0;
    }
  }

  /** Get current time */
  get currentTime(): number { return this._currentTime; }

  /** Get playback state */
  get playbackState(): TimelinePlaybackState { return this._playbackState; }

  /** Get current animation */
  get currentAnimation(): WidgetAnimation | null {
    return this._asset.animations[this._currentAnimIndex] ?? null;
  }

  // ============================================================
  //  Build UI
  // ============================================================

  private _build(): void {
    this._container.innerHTML = '';
    this._container.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#111;color:#ddd;font-size:11px;overflow:hidden;';

    // Top bar: animation selector + playback controls
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 8px;background:#1a1a2e;border-bottom:1px solid #333;flex-shrink:0;';

    // Animation selector
    this._animSelector = document.createElement('select');
    this._animSelector.style.cssText = 'background:#111;border:1px solid #333;color:#ddd;padding:2px 6px;border-radius:3px;font-size:11px;min-width:120px;';
    this._rebuildAnimSelector();
    this._animSelector.addEventListener('change', () => {
      this._currentAnimIndex = parseInt(this._animSelector.value, 10);
      this._currentTime = 0;
      this._stop();
      this._refresh();
    });
    topBar.appendChild(this._animSelector);

    // New animation button
    const newBtn = document.createElement('button');
    newBtn.style.cssText = 'background:#2a5db0;color:#fff;border:none;border-radius:3px;padding:2px 8px;font-size:10px;cursor:pointer;';
    newBtn.textContent = '+ New';
    newBtn.title = 'Create new animation';
    newBtn.addEventListener('click', () => this._createAnimation());
    topBar.appendChild(newBtn);

    // Delete animation
    const delBtn = document.createElement('button');
    delBtn.style.cssText = 'background:#444;color:#ccc;border:none;border-radius:3px;padding:2px 6px;font-size:10px;cursor:pointer;';
    delBtn.innerHTML = iconHTML(Icons.X, 'xs');
    delBtn.title = 'Delete animation';
    delBtn.addEventListener('click', () => this._deleteAnimation());
    topBar.appendChild(delBtn);

    // Spacer
    const spacer1 = document.createElement('div');
    spacer1.style.flex = '1';
    topBar.appendChild(spacer1);

    // Playback controls
    this._controlsEl = document.createElement('div');
    this._controlsEl.style.cssText = 'display:flex;align-items:center;gap:2px;';
    this._buildPlaybackControls();
    topBar.appendChild(this._controlsEl);

    // Speed control
    const speedLabel = document.createElement('span');
    speedLabel.style.cssText = 'color:#888;font-size:10px;margin-left:8px;';
    speedLabel.textContent = 'Speed:';
    topBar.appendChild(speedLabel);

    const speedSel = document.createElement('select');
    speedSel.style.cssText = 'background:#111;border:1px solid #333;color:#ddd;padding:1px 4px;border-radius:3px;font-size:10px;';
    for (const s of [0.25, 0.5, 1.0, 2.0, 4.0]) {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = `${s}x`;
      if (s === this._playbackSpeed) opt.selected = true;
      speedSel.appendChild(opt);
    }
    speedSel.addEventListener('change', () => { this._playbackSpeed = parseFloat(speedSel.value); });
    topBar.appendChild(speedSel);

    // Time display
    this._timeDisplay = document.createElement('span');
    this._timeDisplay.style.cssText = 'font-family:monospace;font-size:11px;color:#ffb400;margin-left:8px;min-width:60px;text-align:right;';
    this._updateTimeDisplay();
    topBar.appendChild(this._timeDisplay);

    this._container.appendChild(topBar);

    // Main content: track list + timeline canvas
    const mainContent = document.createElement('div');
    mainContent.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    // Left: Track list
    const trackPanel = document.createElement('div');
    trackPanel.style.cssText = 'width:180px;min-width:140px;background:#151520;border-right:1px solid #333;display:flex;flex-direction:column;overflow:hidden;';

    // Track list header
    const trackHeader = document.createElement('div');
    trackHeader.style.cssText = `height:${this._headerHeight}px;display:flex;align-items:center;justify-content:space-between;padding:0 8px;border-bottom:1px solid #333;background:#1a1a2e;`;
    trackHeader.innerHTML = `<span style="font-size:10px;color:#888;">TRACKS</span>`;

    const addTrackBtn = document.createElement('button');
    addTrackBtn.style.cssText = 'background:#2a5db0;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;';
    addTrackBtn.textContent = '+';
    addTrackBtn.title = 'Add track';
    addTrackBtn.addEventListener('click', () => this._showAddTrackMenu());
    trackHeader.appendChild(addTrackBtn);
    trackPanel.appendChild(trackHeader);

    this._trackListEl = document.createElement('div');
    this._trackListEl.style.cssText = 'flex:1;overflow-y:auto;';
    trackPanel.appendChild(this._trackListEl);

    // Right: Timeline canvas
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = 'flex:1;position:relative;overflow:hidden;';

    this._timelineCanvas = document.createElement('canvas');
    this._timelineCanvas.style.cssText = 'width:100%;height:100%;cursor:crosshair;';
    canvasContainer.appendChild(this._timelineCanvas);

    // Canvas resize observer
    const resizeObs = new ResizeObserver(() => this._resizeCanvas());
    resizeObs.observe(canvasContainer);

    // Canvas mouse events
    this._timelineCanvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
    this._timelineCanvas.addEventListener('dblclick', (e) => this._onCanvasDoubleClick(e));
    this._timelineCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        // Zoom
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this._timeScale = Math.max(50, Math.min(2000, this._timeScale * factor));
      } else {
        // Scroll
        this._scrollX = Math.max(0, this._scrollX + e.deltaY * 0.5);
      }
      this._renderTimeline();
    });

    mainContent.appendChild(trackPanel);
    mainContent.appendChild(canvasContainer);
    this._container.appendChild(mainContent);

    // Bottom: keyframe properties
    this._keyframePropsEl = document.createElement('div');
    this._keyframePropsEl.style.cssText = 'border-top:1px solid #333;background:#151520;padding:4px 8px;min-height:32px;display:flex;align-items:center;gap:8px;flex-shrink:0;font-size:10px;';
    this._keyframePropsEl.innerHTML = '<span style="color:#666;">Select a keyframe to edit its properties.</span>';
    this._container.appendChild(this._keyframePropsEl);

    this._refresh();
  }

  private _buildPlaybackControls(): void {
    this._controlsEl.innerHTML = '';
    const btnStyle = 'background:#222;color:#ddd;border:1px solid #444;border-radius:3px;width:24px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;';

    // Rewind
    const rewindBtn = document.createElement('button');
    rewindBtn.style.cssText = btnStyle;
    rewindBtn.innerHTML = iconHTML(Icons.SkipBack, 'xs');
    rewindBtn.title = 'Rewind to start';
    rewindBtn.addEventListener('click', () => { this._currentTime = 0; this._renderTimeline(); this._updateTimeDisplay(); this._applyCurrentTime(); });
    this._controlsEl.appendChild(rewindBtn);

    // Play/Pause
    const playBtn = document.createElement('button');
    playBtn.style.cssText = btnStyle + (this._playbackState === 'playing' ? 'background:#2a5db0;' : '');
    playBtn.innerHTML = this._playbackState === 'playing' ? iconHTML(Icons.Pause, 'xs') : iconHTML(Icons.Play, 'xs');
    playBtn.title = this._playbackState === 'playing' ? 'Pause' : 'Play';
    playBtn.addEventListener('click', () => {
      if (this._playbackState === 'playing') {
        this._pause();
      } else {
        this._play();
      }
    });
    this._controlsEl.appendChild(playBtn);

    // Stop
    const stopBtn = document.createElement('button');
    stopBtn.style.cssText = btnStyle;
    stopBtn.innerHTML = iconHTML(Icons.Square, 'xs');
    stopBtn.title = 'Stop';
    stopBtn.addEventListener('click', () => this._stop());
    this._controlsEl.appendChild(stopBtn);

    // Forward to end
    const fwdBtn = document.createElement('button');
    fwdBtn.style.cssText = btnStyle;
    fwdBtn.innerHTML = iconHTML(Icons.SkipForward, 'xs');
    fwdBtn.title = 'Jump to end';
    fwdBtn.addEventListener('click', () => {
      const anim = this.currentAnimation;
      if (anim) {
        this._currentTime = anim.duration;
        this._renderTimeline();
        this._updateTimeDisplay();
        this._applyCurrentTime();
      }
    });
    this._controlsEl.appendChild(fwdBtn);

    // Loop toggle
    const loopBtn = document.createElement('button');
    const anim = this.currentAnimation;
    const isLooping = anim?.isLooping ?? false;
    loopBtn.style.cssText = btnStyle + (isLooping ? 'background:#2a5db0;' : '');
    loopBtn.innerHTML = iconHTML(Icons.Repeat, 'xs');
    loopBtn.title = 'Toggle loop';
    loopBtn.addEventListener('click', () => {
      const a = this.currentAnimation;
      if (a) {
        a.isLooping = !a.isLooping;
        this._onDirty();
        this._buildPlaybackControls();
      }
    });
    this._controlsEl.appendChild(loopBtn);
  }

  // ============================================================
  //  Animation Management
  // ============================================================

  private _rebuildAnimSelector(): void {
    this._animSelector.innerHTML = '';
    if (this._asset.animations.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '(No Animations)';
      opt.disabled = true;
      this._animSelector.appendChild(opt);
    } else {
      for (let i = 0; i < this._asset.animations.length; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = this._asset.animations[i].name;
        if (i === this._currentAnimIndex) opt.selected = true;
        this._animSelector.appendChild(opt);
      }
    }
  }

  private _createAnimation(): void {
    const name = prompt('Animation name:', `Anim_${this._asset.animations.length + 1}`);
    if (!name) return;
    const anim = defaultWidgetAnimation(name);
    this._asset.animations.push(anim);
    this._currentAnimIndex = this._asset.animations.length - 1;
    this._onDirty();
    this._rebuildAnimSelector();
    this._refresh();
  }

  private _deleteAnimation(): void {
    if (this._asset.animations.length === 0) return;
    if (!confirm('Delete this animation?')) return;
    this._asset.animations.splice(this._currentAnimIndex, 1);
    this._currentAnimIndex = Math.min(this._currentAnimIndex, this._asset.animations.length - 1);
    this._onDirty();
    this._rebuildAnimSelector();
    this._refresh();
  }

  // ============================================================
  //  Track Management
  // ============================================================

  private _showAddTrackMenu(): void {
    const anim = this.currentAnimation;
    if (!anim) {
      alert('Create an animation first.');
      return;
    }

    // Show a popup with available widgets and properties
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1e1e2e;border:1px solid #444;border-radius:6px;padding:16px;min-width:280px;max-height:400px;display:flex;flex-direction:column;gap:8px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px;font-weight:bold;color:#ddd;';
    title.textContent = 'Add Animation Track';
    dialog.appendChild(title);

    // Widget selector
    const widgetSelLabel = document.createElement('div');
    widgetSelLabel.style.cssText = 'font-size:10px;color:#888;';
    widgetSelLabel.textContent = 'Target Widget:';
    dialog.appendChild(widgetSelLabel);

    const widgetSel = document.createElement('select');
    widgetSel.style.cssText = 'background:#111;border:1px solid #333;color:#ddd;padding:4px;border-radius:3px;font-size:11px;';
    for (const [id, w] of this._asset.widgets) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${w.name} (${w.type})`;
      widgetSel.appendChild(opt);
    }
    dialog.appendChild(widgetSel);

    // Property selector
    const propSelLabel = document.createElement('div');
    propSelLabel.style.cssText = 'font-size:10px;color:#888;margin-top:4px;';
    propSelLabel.textContent = 'Property:';
    dialog.appendChild(propSelLabel);

    const propSel = document.createElement('select');
    propSel.style.cssText = 'background:#111;border:1px solid #333;color:#ddd;padding:4px;border-radius:3px;font-size:11px;';
    for (const p of ANIMATABLE_PROPERTIES) {
      const opt = document.createElement('option');
      opt.value = p.path;
      opt.textContent = p.label;
      propSel.appendChild(opt);
    }
    dialog.appendChild(propSel);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'background:#333;color:#ccc;border:none;border-radius:4px;padding:4px 12px;font-size:11px;cursor:pointer;';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const addBtn = document.createElement('button');
    addBtn.style.cssText = 'background:#2a5db0;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:11px;cursor:pointer;';
    addBtn.textContent = 'Add Track';
    addBtn.addEventListener('click', () => {
      const widgetId = widgetSel.value;
      const propPath = propSel.value;
      if (!widgetId || !propPath) return;

      // Get current value for the first keyframe
      const widget = this._asset.getWidget(widgetId);
      const currentVal = widget ? this._getPropertyValue(widget, propPath) : 0;

      const track: WidgetAnimationTrack = {
        targetWidgetId: widgetId,
        propertyPath: propPath,
        keys: [
          { time: 0, value: currentVal, easing: 'Linear' },
          { time: anim.duration, value: currentVal, easing: 'Linear' },
        ],
      };
      anim.tracks.push(track);
      this._onDirty();
      overlay.remove();
      this._refresh();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(addBtn);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /** Get a property value from a widget using a dot-notation path */
  private _getPropertyValue(widget: any, path: string): number {
    const parts = path.split('.');
    let obj = widget;
    for (const part of parts) {
      obj = obj?.[part];
      if (obj === undefined) return 0;
    }
    return typeof obj === 'number' ? obj : 0;
  }

  /** Set a property value on a widget using a dot-notation path */
  private _setPropertyValue(widget: any, path: string, value: number): void {
    const parts = path.split('.');
    let obj = widget;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj?.[parts[i]];
      if (!obj) return;
    }
    obj[parts[parts.length - 1]] = value;
  }

  // ============================================================
  //  Playback
  // ============================================================

  private _play(): void {
    if (this._playbackState === 'playing') return;
    const anim = this.currentAnimation;
    if (!anim || anim.tracks.length === 0) return;

    this._playbackState = 'playing';
    this._lastFrameTime = performance.now();
    this._buildPlaybackControls();

    const tick = () => {
      if (this._playbackState !== 'playing') return;

      const now = performance.now();
      const dt = (now - this._lastFrameTime) / 1000 * this._playbackSpeed;
      this._lastFrameTime = now;

      this._currentTime += dt;

      if (this._currentTime >= anim.duration) {
        if (anim.isLooping) {
          this._currentTime = this._currentTime % anim.duration;
        } else {
          this._currentTime = anim.duration;
          this._stop();
          return;
        }
      }

      this._applyCurrentTime();
      this._updateTimeDisplay();
      this._renderTimeline();
      this._animFrameId = requestAnimationFrame(tick);
    };

    this._animFrameId = requestAnimationFrame(tick);
  }

  private _pause(): void {
    this._playbackState = 'paused';
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = 0;
    }
    this._buildPlaybackControls();
  }

  private _stop(): void {
    this._playbackState = 'stopped';
    this._currentTime = 0;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = 0;
    }
    this._buildPlaybackControls();
    this._updateTimeDisplay();
    this._renderTimeline();
    this._applyCurrentTime();
  }

  /** Apply the current animation time to widget properties */
  private _applyCurrentTime(): void {
    const anim = this.currentAnimation;
    if (!anim) return;

    for (const track of anim.tracks) {
      const widget = this._asset.getWidget(track.targetWidgetId);
      if (!widget) continue;

      const value = this._evaluateTrack(track, this._currentTime);
      this._setPropertyValue(widget, track.propertyPath, value);
    }
  }

  /** Evaluate a track at a given time, interpolating between keyframes */
  private _evaluateTrack(track: WidgetAnimationTrack, time: number): number {
    if (track.keys.length === 0) return 0;
    if (track.keys.length === 1) return track.keys[0].value;

    // Sort keys by time
    const sorted = [...track.keys].sort((a, b) => a.time - b.time);

    // Before first key
    if (time <= sorted[0].time) return sorted[0].value;
    // After last key
    if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

    // Find surrounding keys
    for (let i = 0; i < sorted.length - 1; i++) {
      const k0 = sorted[i];
      const k1 = sorted[i + 1];
      if (time >= k0.time && time <= k1.time) {
        const range = k1.time - k0.time;
        if (range <= 0) return k0.value;
        let t = (time - k0.time) / range;
        t = this._applyEasing(t, k0.easing);
        return k0.value + (k1.value - k0.value) * t;
      }
    }

    return sorted[sorted.length - 1].value;
  }

  private _applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'EaseIn': return t * t;
      case 'EaseOut': return t * (2 - t);
      case 'EaseInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default: return t; // Linear
    }
  }

  // ============================================================
  //  Refresh & Render
  // ============================================================

  private _refresh(): void {
    this._rebuildTrackList();
    this._resizeCanvas();
    this._renderTimeline();
    this._updateKeyframeProps();
  }

  private _updateTimeDisplay(): void {
    if (!this._timeDisplay) return;
    const t = this._currentTime;
    const m = Math.floor(t / 60);
    const s = t % 60;
    this._timeDisplay.textContent = `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }

  private _rebuildTrackList(): void {
    if (!this._trackListEl) return;
    this._trackListEl.innerHTML = '';
    const anim = this.currentAnimation;
    if (!anim) return;

    for (let i = 0; i < anim.tracks.length; i++) {
      const track = anim.tracks[i];
      const widget = this._asset.getWidget(track.targetWidgetId);
      const propDef = ANIMATABLE_PROPERTIES.find(p => p.path === track.propertyPath);
      const label = `${widget?.name ?? '?'}.${propDef?.label ?? track.propertyPath}`;

      const row = document.createElement('div');
      const isSelected = i === this._selectedTrackIndex;
      row.style.cssText = `height:${this._trackHeight}px;display:flex;align-items:center;padding:0 8px;cursor:pointer;border-bottom:1px solid #222;background:${isSelected ? '#1a2a4a' : 'transparent'};font-size:10px;color:#ccc;gap:4px;`;

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameSpan.textContent = label;
      nameSpan.title = label;

      const delBtn = document.createElement('button');
      delBtn.style.cssText = 'background:none;border:none;color:#666;font-size:10px;cursor:pointer;padding:0 2px;';
      delBtn.innerHTML = iconHTML(Icons.X, 'xs');
      delBtn.title = 'Remove track';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        anim.tracks.splice(i, 1);
        this._selectedTrackIndex = -1;
        this._selectedKeyframe = null;
        this._onDirty();
        this._refresh();
      });

      row.appendChild(nameSpan);
      row.appendChild(delBtn);

      row.addEventListener('click', () => {
        this._selectedTrackIndex = i;
        this._selectedKeyframe = null;
        this._rebuildTrackList();
        this._renderTimeline();
      });

      this._trackListEl.appendChild(row);
    }
  }

  private _resizeCanvas(): void {
    if (!this._timelineCanvas) return;
    const rect = this._timelineCanvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    this._timelineCanvas.width = rect.width * dpr;
    this._timelineCanvas.height = rect.height * dpr;
    this._timelineCtx = this._timelineCanvas.getContext('2d')!;
    this._renderTimeline();
  }

  // ============================================================
  //  Timeline Canvas Rendering
  // ============================================================

  private _renderTimeline(): void {
    const ctx = this._timelineCtx;
    if (!ctx) return;
    const w = this._timelineCanvas.width;
    const h = this._timelineCanvas.height;
    const dpr = window.devicePixelRatio;
    const anim = this.currentAnimation;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, w, h);

    // Time header background
    const headerH = this._headerHeight * dpr;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, headerH);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(w, headerH);
    ctx.stroke();

    if (!anim) {
      ctx.fillStyle = '#666';
      ctx.font = `${12 * dpr}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('No animation selected', w / 2, h / 2);
      return;
    }

    const timePerPx = 1 / (this._timeScale * dpr);
    const startTime = this._scrollX * timePerPx;
    const endTime = startTime + w * timePerPx;

    // Time ruler ticks
    const majorStep = this._computeMajorStep();
    const minorStep = majorStep / 5;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = `${9 * dpr}px 'Segoe UI', sans-serif`;

    for (let t = Math.floor(startTime / minorStep) * minorStep; t <= endTime; t += minorStep) {
      const px = (t / timePerPx) - this._scrollX;
      if (px < 0) continue;
      const isMajor = Math.abs(t % majorStep) < 0.0001;

      ctx.strokeStyle = isMajor ? '#555' : '#333';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(px, isMajor ? 0 : headerH * 0.6);
      ctx.lineTo(px, headerH);
      ctx.stroke();

      // Vertical grid line through tracks
      if (isMajor) {
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(px, headerH);
        ctx.lineTo(px, h);
        ctx.stroke();
      }

      if (isMajor) {
        ctx.fillStyle = '#888';
        ctx.fillText(t.toFixed(2) + 's', px, headerH - 4 * dpr);
      }
    }

    // Duration marker
    const durPx = (anim.duration / timePerPx) - this._scrollX;
    if (durPx > 0 && durPx < w) {
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(durPx, 0);
      ctx.lineTo(durPx, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Track rows and keyframes
    const trackH = this._trackHeight * dpr;
    for (let i = 0; i < anim.tracks.length; i++) {
      const track = anim.tracks[i];
      const rowY = headerH + i * trackH;

      // Alternating row background
      if (i % 2 === 0) {
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, rowY, w, trackH);
      }

      // Selected track highlight
      if (i === this._selectedTrackIndex) {
        ctx.fillStyle = 'rgba(42, 93, 176, 0.15)';
        ctx.fillRect(0, rowY, w, trackH);
      }

      // Track separator
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rowY + trackH);
      ctx.lineTo(w, rowY + trackH);
      ctx.stroke();

      // Draw keyframe connections (interpolation line)
      if (track.keys.length >= 2) {
        ctx.strokeStyle = 'rgba(255, 180, 0, 0.3)';
        ctx.lineWidth = 1;
        const sortedKeys = [...track.keys].sort((a, b) => a.time - b.time);
        ctx.beginPath();
        for (let k = 0; k < sortedKeys.length; k++) {
          const kx = (sortedKeys[k].time / timePerPx) - this._scrollX;
          const ky = rowY + trackH / 2;
          if (k === 0) ctx.moveTo(kx, ky);
          else ctx.lineTo(kx, ky);
        }
        ctx.stroke();
      }

      // Draw keyframes
      for (let k = 0; k < track.keys.length; k++) {
        const key = track.keys[k];
        const kx = (key.time / timePerPx) - this._scrollX;
        const ky = rowY + trackH / 2;

        if (kx < -10 || kx > w + 10) continue;

        const isSelectedKey = this._selectedKeyframe?.trackIndex === i && this._selectedKeyframe?.keyIndex === k;
        const diamondSize = (isSelectedKey ? 7 : 5) * dpr;

        // Keyframe diamond
        ctx.fillStyle = isSelectedKey ? '#ff4' : '#ffb400';
        ctx.beginPath();
        ctx.moveTo(kx, ky - diamondSize);
        ctx.lineTo(kx + diamondSize, ky);
        ctx.lineTo(kx, ky + diamondSize);
        ctx.lineTo(kx - diamondSize, ky);
        ctx.closePath();
        ctx.fill();

        // Outline
        ctx.strokeStyle = isSelectedKey ? '#fff' : '#000';
        ctx.lineWidth = isSelectedKey ? 2 : 1;
        ctx.stroke();
      }
    }

    // Scrubber (playhead)
    const scrubberPx = (this._currentTime / timePerPx) - this._scrollX;
    if (scrubberPx >= 0 && scrubberPx <= w) {
      // Playhead line
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scrubberPx, 0);
      ctx.lineTo(scrubberPx, h);
      ctx.stroke();

      // Playhead triangle at top
      ctx.fillStyle = '#4a9eff';
      ctx.beginPath();
      ctx.moveTo(scrubberPx - 6 * dpr, 0);
      ctx.lineTo(scrubberPx + 6 * dpr, 0);
      ctx.lineTo(scrubberPx, 10 * dpr);
      ctx.closePath();
      ctx.fill();
    }
  }

  private _computeMajorStep(): number {
    const dpr = window.devicePixelRatio;
    const pxPerSecond = this._timeScale * dpr;
    const idealTickPx = 80;
    const steps = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
    for (const s of steps) {
      if (s * pxPerSecond >= idealTickPx) return s;
    }
    return 60;
  }

  // ============================================================
  //  Canvas Mouse Interaction
  // ============================================================

  private _onCanvasMouseDown(e: MouseEvent): void {
    const rect = this._timelineCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;
    const headerH = this._headerHeight * dpr;

    const anim = this.currentAnimation;
    if (!anim) return;

    const timePerPx = 1 / (this._timeScale * dpr);

    // Click in header — scrub
    if (my < headerH) {
      const clickTime = Math.max(0, (mx + this._scrollX) * timePerPx);
      this._currentTime = Math.min(clickTime, anim.duration);
      this._updateTimeDisplay();
      this._applyCurrentTime();
      this._renderTimeline();

      // Drag scrub
      const onMove = (me: MouseEvent) => {
        const mex = (me.clientX - rect.left) * dpr;
        const t = Math.max(0, Math.min(anim.duration, (mex + this._scrollX) * timePerPx));
        this._currentTime = t;
        this._updateTimeDisplay();
        this._applyCurrentTime();
        this._renderTimeline();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    // Click on track area — check keyframe hit
    const trackH = this._trackHeight * dpr;
    const trackIdx = Math.floor((my - headerH) / trackH);
    if (trackIdx < 0 || trackIdx >= anim.tracks.length) {
      this._selectedKeyframe = null;
      this._updateKeyframeProps();
      this._renderTimeline();
      return;
    }

    const track = anim.tracks[trackIdx];
    const clickTime = (mx + this._scrollX) * timePerPx;

    // Check if clicked near a keyframe
    const hitRadius = 8 * dpr;
    let hitKey = -1;
    for (let k = 0; k < track.keys.length; k++) {
      const kx = (track.keys[k].time / timePerPx) - this._scrollX;
      if (Math.abs(mx - kx) < hitRadius) {
        hitKey = k;
        break;
      }
    }

    if (hitKey >= 0) {
      this._selectedKeyframe = { trackIndex: trackIdx, keyIndex: hitKey };
      this._selectedTrackIndex = trackIdx;
      this._updateKeyframeProps();
      this._rebuildTrackList();
      this._renderTimeline();

      // Drag keyframe
      const key = track.keys[hitKey];
      const startTime = key.time;
      const startMx = mx;

      const onMove = (me: MouseEvent) => {
        const mex = (me.clientX - rect.left) * dpr;
        const dt = (mex - startMx) * timePerPx;
        key.time = Math.max(0, Math.min(anim.duration, startTime + dt));
        this._onDirty();
        this._renderTimeline();
        this._updateKeyframeProps();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } else {
      this._selectedKeyframe = null;
      this._selectedTrackIndex = trackIdx;
      // Set scrubber to clicked position
      this._currentTime = Math.max(0, Math.min(anim.duration, clickTime));
      this._updateTimeDisplay();
      this._applyCurrentTime();
      this._updateKeyframeProps();
      this._rebuildTrackList();
      this._renderTimeline();
    }
  }

  /** Double-click to add a keyframe */
  private _onCanvasDoubleClick(e: MouseEvent): void {
    const rect = this._timelineCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;
    const headerH = this._headerHeight * dpr;
    const trackH = this._trackHeight * dpr;

    const anim = this.currentAnimation;
    if (!anim) return;

    const trackIdx = Math.floor((my - headerH) / trackH);
    if (trackIdx < 0 || trackIdx >= anim.tracks.length) return;

    const timePerPx = 1 / (this._timeScale * dpr);
    const clickTime = Math.max(0, Math.min(anim.duration, (mx + this._scrollX) * timePerPx));

    const track = anim.tracks[trackIdx];

    // Get interpolated value at this time
    const value = this._evaluateTrack(track, clickTime);

    // Add keyframe
    track.keys.push({
      time: Math.round(clickTime * 100) / 100,
      value,
      easing: 'Linear',
    });

    // Select the new keyframe
    this._selectedKeyframe = { trackIndex: trackIdx, keyIndex: track.keys.length - 1 };
    this._onDirty();
    this._refresh();
  }

  // ============================================================
  //  Keyframe Properties Panel
  // ============================================================

  private _updateKeyframeProps(): void {
    if (!this._keyframePropsEl) return;
    this._keyframePropsEl.innerHTML = '';

    if (!this._selectedKeyframe) {
      const hint = document.createElement('span');
      hint.style.color = '#666';
      hint.textContent = 'Select a keyframe to edit. Double-click on a track to add one.';
      this._keyframePropsEl.appendChild(hint);
      return;
    }

    const anim = this.currentAnimation;
    if (!anim) return;

    const { trackIndex, keyIndex } = this._selectedKeyframe;
    const track = anim.tracks[trackIndex];
    if (!track || !track.keys[keyIndex]) return;

    const key = track.keys[keyIndex];

    // Time
    const timeLabel = document.createElement('span');
    timeLabel.style.cssText = 'color:#888;';
    timeLabel.textContent = 'Time:';
    this._keyframePropsEl.appendChild(timeLabel);

    const timeInput = document.createElement('input');
    timeInput.type = 'number';
    timeInput.value = key.time.toFixed(3);
    timeInput.step = '0.01';
    timeInput.min = '0';
    timeInput.max = String(anim.duration);
    timeInput.style.cssText = 'width:60px;background:#111;border:1px solid #333;color:#ddd;padding:1px 4px;border-radius:3px;font-size:10px;';
    timeInput.addEventListener('change', () => {
      key.time = Math.max(0, Math.min(anim.duration, parseFloat(timeInput.value) || 0));
      this._onDirty();
      this._renderTimeline();
    });
    this._keyframePropsEl.appendChild(timeInput);

    // Value
    const valLabel = document.createElement('span');
    valLabel.style.cssText = 'color:#888;margin-left:8px;';
    valLabel.textContent = 'Value:';
    this._keyframePropsEl.appendChild(valLabel);

    const propDef = ANIMATABLE_PROPERTIES.find(p => p.path === track.propertyPath);
    const valInput = document.createElement('input');
    valInput.type = 'number';
    valInput.value = key.value.toFixed(3);
    valInput.step = String(propDef?.step ?? 0.1);
    valInput.min = String(propDef?.min ?? -9999);
    valInput.max = String(propDef?.max ?? 9999);
    valInput.style.cssText = 'width:70px;background:#111;border:1px solid #333;color:#ddd;padding:1px 4px;border-radius:3px;font-size:10px;';
    valInput.addEventListener('change', () => {
      key.value = parseFloat(valInput.value) || 0;
      this._onDirty();
      this._applyCurrentTime();
    });
    this._keyframePropsEl.appendChild(valInput);

    // Easing
    const easLabel = document.createElement('span');
    easLabel.style.cssText = 'color:#888;margin-left:8px;';
    easLabel.textContent = 'Easing:';
    this._keyframePropsEl.appendChild(easLabel);

    const easSel = document.createElement('select');
    easSel.style.cssText = 'background:#111;border:1px solid #333;color:#ddd;padding:1px 4px;border-radius:3px;font-size:10px;';
    for (const e of EASING_TYPES) {
      const opt = document.createElement('option');
      opt.value = e;
      opt.textContent = e;
      if (e === key.easing) opt.selected = true;
      easSel.appendChild(opt);
    }
    easSel.addEventListener('change', () => {
      key.easing = easSel.value as any;
      this._onDirty();
    });
    this._keyframePropsEl.appendChild(easSel);

    // Delete keyframe
    const delBtn = document.createElement('button');
    delBtn.style.cssText = 'background:#444;color:#ccc;border:none;border-radius:3px;padding:1px 8px;font-size:10px;cursor:pointer;margin-left:auto;';
    delBtn.innerHTML = `${iconHTML(Icons.Trash2, 'xs')} Delete`;
    delBtn.addEventListener('click', () => {
      track.keys.splice(keyIndex, 1);
      this._selectedKeyframe = null;
      this._onDirty();
      this._refresh();
    });
    this._keyframePropsEl.appendChild(delBtn);
  }
}
