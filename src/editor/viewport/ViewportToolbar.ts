/**
 * Viewport toolbar and HUD overlays — UE-style.
 *
 * Top bar: Transform mode buttons, Space toggle, Snap toggle, View mode dropdown, Show dropdown
 * Top-right corner: Stats overlay (FPS, objects, triangles, etc.)
 * Bottom-left: Notification toasts
 */

import type { TransformMode, TransformSpace } from './TransformGizmoSystem';
import type { CameraViewMode } from './ViewportCameraController';
import type { ViewportNotification } from './ObjectOperationsManager';

export type ViewportDisplayMode = 'lit' | 'unlit' | 'wireframe' | 'detail-lighting';

export interface ViewportToolbarCallbacks {
  onTransformMode: (mode: TransformMode) => void;
  onSpaceToggle: () => void;
  onSnapToggle: () => void;
  onViewMode: (mode: CameraViewMode) => void;
  onDisplayMode: (mode: ViewportDisplayMode) => void;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleCollision: () => void;
  onToggleBounds: () => void;
  onToggleStats: () => void;
  onTogglePhysicsDebug: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
}

export class ViewportToolbar {
  private _container: HTMLElement;
  private _toolbarEl: HTMLDivElement;
  private _statsEl: HTMLDivElement;
  private _notificationEl: HTMLDivElement;
  private _speedEl: HTMLDivElement;
  private _callbacks: ViewportToolbarCallbacks;

  /* State trackers for visual updates */
  private _currentMode: TransformMode = 'translate';
  private _currentSpace: TransformSpace = 'world';
  private _snapEnabled = false;
  private _displayMode: ViewportDisplayMode = 'lit';
  private _gridVisible = true;
  private _axesVisible = true;
  private _collisionVisible = false;
  private _boundsVisible = false;
  private _statsVisible = true;

  /* Stats */
  private _fps = 0;
  private _frameCount = 0;
  private _lastFpsTime = 0;
  private _objectCount = 0;
  private _selectedCount = 0;
  private _triangleCount = 0;

  /* Notifications */
  private _notifications: ViewportNotification[] = [];

  constructor(container: HTMLElement, callbacks: ViewportToolbarCallbacks) {
    this._container = container;
    this._callbacks = callbacks;

    // Toolbar
    this._toolbarEl = document.createElement('div');
    this._toolbarEl.className = 'viewport-toolbar';
    container.appendChild(this._toolbarEl);

    // Stats overlay
    this._statsEl = document.createElement('div');
    this._statsEl.className = 'viewport-stats';
    container.appendChild(this._statsEl);

    // Notification area
    this._notificationEl = document.createElement('div');
    this._notificationEl.className = 'viewport-notifications';
    container.appendChild(this._notificationEl);

    // Camera speed indicator
    this._speedEl = document.createElement('div');
    this._speedEl.className = 'viewport-speed';
    this._speedEl.style.display = 'none';
    container.appendChild(this._speedEl);

    this._buildToolbar();
    this._buildStats();
  }

  /* -------- public API -------- */

  updateMode(mode: TransformMode): void {
    this._currentMode = mode;
    this._refreshToolbarHighlights();
  }

  updateSpace(space: TransformSpace): void {
    this._currentSpace = space;
    this._refreshToolbarHighlights();
  }

  updateSnap(enabled: boolean): void {
    this._snapEnabled = enabled;
    this._refreshToolbarHighlights();
  }

  updateStats(objectCount: number, selectedCount: number, triangleCount: number): void {
    this._objectCount = objectCount;
    this._selectedCount = selectedCount;
    this._triangleCount = triangleCount;
  }

  showCameraSpeed(speed: number): void {
    this._speedEl.style.display = 'block';
    this._speedEl.textContent = `Speed: ${speed.toFixed(1)}`;
  }

  hideCameraSpeed(): void {
    this._speedEl.style.display = 'none';
  }

  pushNotification(notification: ViewportNotification): void {
    this._notifications.push(notification);
    this._renderNotifications();

    // Auto-remove after 3 seconds
    setTimeout(() => {
      const idx = this._notifications.indexOf(notification);
      if (idx >= 0) {
        this._notifications.splice(idx, 1);
        this._renderNotifications();
      }
    }, 3000);
  }

  /** Call per frame to update FPS counter */
  tick(): void {
    this._frameCount++;
    const now = performance.now();
    if (now - this._lastFpsTime >= 1000) {
      this._fps = Math.round((this._frameCount * 1000) / (now - this._lastFpsTime));
      this._frameCount = 0;
      this._lastFpsTime = now;
      this._renderStats();
    }
  }

  dispose(): void {
    this._toolbarEl.remove();
    this._statsEl.remove();
    this._notificationEl.remove();
    this._speedEl.remove();
  }

  /* -------- private: build -------- */

  private _buildToolbar(): void {
    this._toolbarEl.innerHTML = `
      <div class="vp-toolbar-group vp-toolbar-transform">
        <button class="vp-tb-btn vp-active" data-mode="translate" title="Translate (W)">
          <span class="vp-tb-icon">✥</span>
        </button>
        <button class="vp-tb-btn" data-mode="rotate" title="Rotate (E)">
          <span class="vp-tb-icon">↻</span>
        </button>
        <button class="vp-tb-btn" data-mode="scale" title="Scale (R)">
          <span class="vp-tb-icon">⤡</span>
        </button>
      </div>

      <div class="vp-toolbar-sep"></div>

      <div class="vp-toolbar-group">
        <button class="vp-tb-btn" id="vp-space-btn" title="World/Local Space">
          World
        </button>
        <button class="vp-tb-btn" id="vp-snap-btn" title="Toggle Snap">
          Snap: OFF
        </button>
      </div>

      <div class="vp-toolbar-sep"></div>

      <div class="vp-toolbar-group">
        <button class="vp-tb-btn" id="vp-group-btn" title="Group Selected (Ctrl+G)">
          <span class="vp-tb-icon">▦</span> Group
        </button>
        <button class="vp-tb-btn" id="vp-ungroup-btn" title="Ungroup (Ctrl+Shift+G)">
          <span class="vp-tb-icon">▤</span> Ungroup
        </button>
      </div>

      <div class="vp-toolbar-sep"></div>

      <div class="vp-toolbar-group">
        <div class="vp-tb-dropdown">
          <button class="vp-tb-btn" id="vp-display-btn">Lit ▾</button>
          <div class="vp-tb-dropdown-content" id="vp-display-menu">
            <div class="vp-tb-dd-item vp-active" data-display="lit">Lit</div>
            <div class="vp-tb-dd-item" data-display="unlit">Unlit</div>
            <div class="vp-tb-dd-item" data-display="wireframe">Wireframe</div>
            <div class="vp-tb-dd-item" data-display="detail-lighting">Detail Lighting</div>
          </div>
        </div>

        <div class="vp-tb-dropdown">
          <button class="vp-tb-btn" id="vp-view-btn">Perspective ▾</button>
          <div class="vp-tb-dropdown-content" id="vp-view-menu">
            <div class="vp-tb-dd-item vp-active" data-view="perspective">Perspective</div>
            <div class="vp-tb-dd-item" data-view="top">Top</div>
            <div class="vp-tb-dd-item" data-view="bottom">Bottom</div>
            <div class="vp-tb-dd-item" data-view="front">Front</div>
            <div class="vp-tb-dd-item" data-view="back">Back</div>
            <div class="vp-tb-dd-item" data-view="left">Left</div>
            <div class="vp-tb-dd-item" data-view="right">Right</div>
          </div>
        </div>

        <div class="vp-tb-dropdown">
          <button class="vp-tb-btn" id="vp-show-btn">Show ▾</button>
          <div class="vp-tb-dropdown-content" id="vp-show-menu">
            <div class="vp-tb-dd-item vp-check vp-checked" data-show="grid">Grid</div>
            <div class="vp-tb-dd-item vp-check vp-checked" data-show="axes">Axes</div>
            <div class="vp-tb-dd-item vp-check" data-show="collision">Collision</div>
            <div class="vp-tb-dd-item vp-check" data-show="physics">Physics Debug</div>
            <div class="vp-tb-dd-item vp-check" data-show="bounds">Bounds</div>
            <div class="vp-tb-dd-item vp-check vp-checked" data-show="stats">Stats</div>
          </div>
        </div>
      </div>
    `;

    // Wire up events
    // Transform mode buttons
    this._toolbarEl.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as TransformMode;
        this._callbacks.onTransformMode(mode);
      });
    });

    // Space toggle
    this._toolbarEl.querySelector('#vp-space-btn')?.addEventListener('click', () => {
      this._callbacks.onSpaceToggle();
    });

    // Snap toggle
    this._toolbarEl.querySelector('#vp-snap-btn')?.addEventListener('click', () => {
      this._callbacks.onSnapToggle();
    });

    // Group / Ungroup buttons
    this._toolbarEl.querySelector('#vp-group-btn')?.addEventListener('click', () => {
      this._callbacks.onGroup?.();
    });
    this._toolbarEl.querySelector('#vp-ungroup-btn')?.addEventListener('click', () => {
      this._callbacks.onUngroup?.();
    });

    // Display mode
    this._toolbarEl.querySelectorAll('[data-display]').forEach((item) => {
      item.addEventListener('click', () => {
        const mode = (item as HTMLElement).dataset.display as ViewportDisplayMode;
        this._displayMode = mode;
        this._callbacks.onDisplayMode(mode);
        this._refreshDisplayMenu();
      });
    });

    // View mode
    this._toolbarEl.querySelectorAll('[data-view]').forEach((item) => {
      item.addEventListener('click', () => {
        const mode = (item as HTMLElement).dataset.view as CameraViewMode;
        this._callbacks.onViewMode(mode);
        this._refreshViewMenu(mode);
      });
    });

    // Show toggles
    this._toolbarEl.querySelectorAll('[data-show]').forEach((item) => {
      item.addEventListener('click', () => {
        const key = (item as HTMLElement).dataset.show!;
        item.classList.toggle('vp-checked');
        switch (key) {
          case 'grid': this._gridVisible = item.classList.contains('vp-checked'); this._callbacks.onToggleGrid(); break;
          case 'axes': this._axesVisible = item.classList.contains('vp-checked'); this._callbacks.onToggleAxes(); break;
          case 'collision': this._collisionVisible = item.classList.contains('vp-checked'); this._callbacks.onToggleCollision(); break;
          case 'physics': this._callbacks.onTogglePhysicsDebug(); break;
          case 'bounds': this._boundsVisible = item.classList.contains('vp-checked'); this._callbacks.onToggleBounds(); break;
          case 'stats': this._statsVisible = item.classList.contains('vp-checked'); this._callbacks.onToggleStats(); break;
        }
      });
    });
  }

  private _buildStats(): void {
    this._renderStats();
  }

  private _renderStats(): void {
    if (!this._statsVisible) {
      this._statsEl.style.display = 'none';
      return;
    }
    this._statsEl.style.display = 'block';
    this._statsEl.innerHTML = `
      <div class="vp-stat-line">Objects: ${this._objectCount}</div>
      <div class="vp-stat-line">Selected: ${this._selectedCount}</div>
      <div class="vp-stat-line">FPS: ${this._fps}</div>
      <div class="vp-stat-line">Mode: ${this._currentMode}</div>
      <div class="vp-stat-line">Space: ${this._currentSpace}</div>
      <div class="vp-stat-line">Snap: ${this._snapEnabled ? 'ON' : 'OFF'}</div>
    `;
  }

  private _renderNotifications(): void {
    this._notificationEl.innerHTML = '';
    // Show last 3 notifications
    const recent = this._notifications.slice(-3);
    recent.forEach((n) => {
      const div = document.createElement('div');
      div.className = `vp-notification vp-notif-${n.type}`;
      const icon = n.type === 'info' ? '✅' : n.type === 'warning' ? '⚠️' : '❌';
      div.textContent = `${icon} ${n.message}`;
      this._notificationEl.appendChild(div);
    });
  }

  private _refreshToolbarHighlights(): void {
    // Transform mode
    this._toolbarEl.querySelectorAll('[data-mode]').forEach((btn) => {
      const mode = (btn as HTMLElement).dataset.mode;
      btn.classList.toggle('vp-active', mode === this._currentMode);
    });

    // Space button
    const spaceBtn = this._toolbarEl.querySelector('#vp-space-btn');
    if (spaceBtn) spaceBtn.textContent = this._currentSpace === 'world' ? 'World' : 'Local';

    // Snap button
    const snapBtn = this._toolbarEl.querySelector('#vp-snap-btn');
    if (snapBtn) snapBtn.textContent = `Snap: ${this._snapEnabled ? 'ON' : 'OFF'}`;
  }

  private _refreshDisplayMenu(): void {
    const labels: Record<ViewportDisplayMode, string> = {
      lit: 'Lit',
      unlit: 'Unlit',
      wireframe: 'Wireframe',
      'detail-lighting': 'Detail Lighting',
    };

    const btn = this._toolbarEl.querySelector('#vp-display-btn');
    if (btn) btn.textContent = `${labels[this._displayMode]} ▾`;

    this._toolbarEl.querySelectorAll('[data-display]').forEach((item) => {
      const mode = (item as HTMLElement).dataset.display;
      item.classList.toggle('vp-active', mode === this._displayMode);
    });
  }

  private _refreshViewMenu(mode: CameraViewMode): void {
    const labels: Record<CameraViewMode, string> = {
      perspective: 'Perspective',
      top: 'Top',
      bottom: 'Bottom',
      front: 'Front',
      back: 'Back',
      left: 'Left',
      right: 'Right',
    };

    const btn = this._toolbarEl.querySelector('#vp-view-btn');
    if (btn) btn.textContent = `${labels[mode]} ▾`;

    this._toolbarEl.querySelectorAll('[data-view]').forEach((item) => {
      const m = (item as HTMLElement).dataset.view;
      item.classList.toggle('vp-active', m === mode);
    });
  }
}
