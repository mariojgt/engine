/**
 * DockingManager — manages detachable / floating panels
 *
 * Provides docking modes per panel group:
 *  1. **Docked**   – standard grid layout (default dockview behaviour)
 *  2. **Floating** – draggable overlay within the editor viewport
 *  3. **Popout**   – large floating overlay that also expands the Tauri
 *                    window to span all monitors so the panel can be
 *                    dragged freely across screens.
 *
 * Also adds Unreal-Engine-style dock-zone overlays: when the user drags a
 * floating panel near the edges of the editor area, translucent zone
 * highlights appear. Releasing the pointer inside a zone re-docks the panel
 * at that position (left / right / top / bottom / center).
 */

import type {
  DockviewApi,
  DockviewGroupPanel,
  IHeaderActionsRenderer,
  IDockviewGroupPanel,
  IDockviewPanel,
} from 'dockview-core';

/* ────────────────────────────────────────────────────────────────────
 *  Types
 * ──────────────────────────────────────────────────────────────────── */

export interface DetachedPanelInfo {
  panelId: string;
  title: string;
  mode: 'floating' | 'popout';
}

/** Which edge / zone the pointer is over */
type DockZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null;

/* ────────────────────────────────────────────────────────────────────
 *  GroupHeaderActions  —  ⊞  ⧉  ▌  buttons on every tab bar
 * ──────────────────────────────────────────────────────────────────── */

export class GroupHeaderActions implements IHeaderActionsRenderer {
  readonly element: HTMLElement;
  private _api!: DockviewApi;
  private _group!: IDockviewGroupPanel;
  private _dm!: DockingManager;
  private _floatBtn!: HTMLButtonElement;
  private _popoutBtn!: HTMLButtonElement;
  private _dockWrap!: HTMLElement;
  private _dockMenu!: HTMLElement;
  private _disposables: Array<() => void> = [];
  private _closeMenuHandler: ((e: MouseEvent) => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'docking-header-actions';
    this._build();
  }

  init(params: { api: any; containerApi: DockviewApi; group: IDockviewGroupPanel }): void {
    this._api = params.containerApi;
    this._group = params.group;
    this._dm = DockingManager.instance!;
    this._syncVis();
    const gApi = (this._group as any).api;
    if (gApi?.onDidLocationChange) {
      const d = gApi.onDidLocationChange(() => this._syncVis());
      if (d?.dispose) this._disposables.push(() => d.dispose());
    }
  }

  dispose(): void {
    this._disposables.forEach((d) => d());
    this._disposables.length = 0;
    if (this._closeMenuHandler) document.removeEventListener('click', this._closeMenuHandler, true);
    this.element.innerHTML = '';
  }

  /* ── build ─────────────────────────────────────────────────────── */

  private _build(): void {
    this._floatBtn = this._btn(
      'Detach (Float)',
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M15 3v6h6"/><path d="M9 21v-6H3"/></svg>`,
      () => { const p = this._activePanel(); if (p) this._dm.floatPanel(p); },
    );
    this._popoutBtn = this._btn(
      'Pop Out (New Window)',
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
      () => { const p = this._activePanel(); if (p) this._dm.popoutPanel(p); },
    );
    // Dock button with position picker dropdown
    this._dockWrap = document.createElement('div');
    this._dockWrap.className = 'dock-btn-wrapper';

    const dockTrigger = this._btn(
      'Dock Back (click to choose position)',
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="9" y1="2" x2="9" y2="22"/></svg>`,
      (e) => { e.stopPropagation(); this._toggleDockMenu(); },
    );

    this._dockMenu = document.createElement('div');
    this._dockMenu.className = 'dock-position-menu';
    this._dockMenu.style.display = 'none';
    this._dockMenu.innerHTML = `
      <div class="dock-menu-title">Dock to…</div>
      <div class="dock-menu-grid">
        <button class="dock-menu-item" data-zone="top" title="Dock Top">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="3" y="3" width="18" height="8" rx="1" fill="rgba(59,130,246,0.25)" stroke="rgba(59,130,246,0.6)"/></svg>
          <span>Top</span>
        </button>
        <button class="dock-menu-item" data-zone="bottom" title="Dock Bottom">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="3" y="13" width="18" height="8" rx="1" fill="rgba(59,130,246,0.25)" stroke="rgba(59,130,246,0.6)"/></svg>
          <span>Bottom</span>
        </button>
        <button class="dock-menu-item" data-zone="left" title="Dock Left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="3" y="3" width="8" height="18" rx="1" fill="rgba(59,130,246,0.25)" stroke="rgba(59,130,246,0.6)"/></svg>
          <span>Left</span>
        </button>
        <button class="dock-menu-item" data-zone="right" title="Dock Right">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="13" y="3" width="8" height="18" rx="1" fill="rgba(59,130,246,0.25)" stroke="rgba(59,130,246,0.6)"/></svg>
          <span>Right</span>
        </button>
        <button class="dock-menu-item dock-menu-item-wide" data-zone="center" title="Dock as Tab (Center)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="3" y="3" width="18" height="18" rx="1" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.4)"/></svg>
          <span>As Tab</span>
        </button>
      </div>
    `;

    // Handle menu item clicks
    this._dockMenu.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.dock-menu-item') as HTMLElement | null;
      if (!item) return;
      e.stopPropagation();
      const zone = item.dataset.zone as DockZone;
      const p = this._activePanel();
      if (p && zone) this._dm.dockPanel(p, zone);
      this._hideDockMenu();
    });

    // Close menu when clicking outside
    this._closeMenuHandler = (e: MouseEvent) => {
      if (!this._dockWrap.contains(e.target as Node)) this._hideDockMenu();
    };
    document.addEventListener('click', this._closeMenuHandler, true);

    this._dockWrap.append(dockTrigger, this._dockMenu);
    this.element.append(this._floatBtn, this._popoutBtn, this._dockWrap);
  }

  private _toggleDockMenu(): void {
    const showing = this._dockMenu.style.display !== 'none';
    this._dockMenu.style.display = showing ? 'none' : '';
  }

  private _hideDockMenu(): void {
    this._dockMenu.style.display = 'none';
  }

  private _btn(title: string, svg: string, fn: (e: MouseEvent) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'docking-action-btn';
    b.title = title;
    b.innerHTML = svg;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
    return b;
  }

  private _activePanel(): IDockviewPanel | null {
    return (this._group as DockviewGroupPanel).activePanel ?? null;
  }

  private _syncVis(): void {
    const loc = (this._group as DockviewGroupPanel)?.model?.location;
    const grid = !loc || loc.type === 'grid';
    const detached = loc?.type === 'floating' || loc?.type === 'popout';
    this._floatBtn.style.display = grid ? '' : 'none';
    this._popoutBtn.style.display = grid ? '' : 'none';
    this._dockWrap.style.display = detached ? '' : 'none';
    if (!detached) this._hideDockMenu();
  }
}

/* ────────────────────────────────────────────────────────────────────
 *  DockZoneOverlay — translucent edge zones for drag-to-dock
 * ──────────────────────────────────────────────────────────────────── */

class DockZoneOverlay {
  private _root: HTMLElement;
  private _overlay: HTMLElement;
  private _zones = new Map<DockZone, HTMLElement>();
  private _active: DockZone = null;
  private _showing = false;

  constructor(root: HTMLElement) {
    this._root = root;
    this._overlay = document.createElement('div');
    this._overlay.className = 'dock-zone-overlay';
    this._overlay.style.cssText =
      'position:absolute;inset:0;z-index:9999;pointer-events:none;display:none;';
    for (const z of ['left', 'right', 'top', 'bottom', 'center'] as DockZone[]) {
      const el = document.createElement('div');
      el.className = `dock-zone dock-zone-${z}`;
      el.dataset.zone = z!;
      this._overlay.appendChild(el);
      this._zones.set(z, el);
    }
    this._root.style.position = 'relative';
    this._root.appendChild(this._overlay);
  }

  show(): void  { if (!this._showing) { this._showing = true;  this._overlay.style.display = ''; } }
  hide(): void  { if (this._showing)  { this._showing = false; this._overlay.style.display = 'none'; this._clear(); } }

  /** Returns the zone under the given page-coordinate pointer, updating highlights */
  hitTest(pageX: number, pageY: number): DockZone {
    if (!this._showing) return null;
    const r = this._root.getBoundingClientRect();
    const x = pageX - r.left, y = pageY - r.top, w = r.width, h = r.height;
    const edge = 0.18;
    let zone: DockZone = null;
    if      (x < w * edge)         zone = 'left';
    else if (x > w * (1 - edge))   zone = 'right';
    else if (y < h * edge)         zone = 'top';
    else if (y > h * (1 - edge))   zone = 'bottom';
    else if (x > w * 0.3 && x < w * 0.7 && y > h * 0.25 && y < h * 0.75)
                                    zone = 'center';
    if (zone !== this._active) { this._clear(); this._active = zone; this._zones.get(zone)?.classList.add('active'); }
    return zone;
  }

  private _clear(): void { this._zones.forEach((el) => el.classList.remove('active')); this._active = null; }
  dispose(): void { this._overlay.remove(); }
}

/* ────────────────────────────────────────────────────────────────────
 *  DockingManager  —  singleton wired from EditorLayout
 * ──────────────────────────────────────────────────────────────────── */

export class DockingManager {
  static instance: DockingManager | null = null;

  private _api: DockviewApi;
  private _container: HTMLElement;
  private _detached = new Map<string, DetachedPanelInfo>();
  private _listeners: Array<() => void> = [];
  private _zones: DockZoneOverlay;

  /** Saved main-window bounds before we expand for multi-monitor */
  private _savedBounds: { x: number; y: number; w: number; h: number } | null = null;
  /** Whether the window is currently expanded across all monitors */
  private _isExpanded = false;

  constructor(api: DockviewApi, container: HTMLElement) {
    this._api = api;
    this._container = container;
    this._zones = new DockZoneOverlay(container);
    DockingManager.instance = this;
    this._watchFloatingDrags();
  }

  /* ══════════════════════════════════════════════════════════════════
   *  PUBLIC
   * ══════════════════════════════════════════════════════════════════ */

  /** Detach into a floating overlay inside the editor */
  floatPanel(panel: IDockviewPanel): void {
    try {
      const r = this._container.getBoundingClientRect();
      const w = Math.min(800, r.width * 0.55);
      const h = Math.min(600, r.height * 0.50);
      this._api.addFloatingGroup(panel, {
        x: (r.width - w) / 2,
        y: (r.height - h) / 2,
        width: w,
        height: h,
      });
      this._track(panel, 'floating');
      this._nudgeResize(panel);
    } catch (e) { console.warn('[Docking] float failed', e); }
  }

  /**
   * Pop out a panel as a large floating overlay.
   * In Tauri the main window is also expanded to span all monitors so
   * the floating panel can be freely dragged to any screen — while
   * still sharing the same DOM / JS runtime, so all edits stay live.
   */
  popoutPanel(panel: IDockviewPanel): void {
    try {
      const r = this._container.getBoundingClientRect();
      const w = Math.min(1200, r.width * 0.85);
      const h = Math.min(900, r.height * 0.88);
      this._api.addFloatingGroup(panel, {
        x: (r.width - w) / 2,
        y: Math.max(4, (r.height - h) / 2),
        width: w,
        height: h,
      });
      this._track(panel, 'popout');
      this._nudgeResize(panel);

      // Expand Tauri window to cover all monitors so the floating panel
      // can be dragged to other screens
      this._expandToAllMonitors();
    } catch (e) { console.warn('[Docking] popout failed', e); }
  }

  /**
   * Re-dock a floating / popout panel back into the grid.
   * If `zone` is supplied the panel is docked at that edge relative to the
   * viewport; otherwise it becomes a tab in the viewport group.
   */
  dockPanel(panel: IDockviewPanel, zone?: DockZone): void {
    try {
      const pos = zone ?? 'center';

      if (pos === 'center') {
        // Dock as a tab inside the viewport (or any grid group)
        const target = this._gridGroup('viewport') ?? this._anyGridGroup();
        if (target) {
          panel.api.moveTo({ group: target, position: 'center' });
        }
      } else {
        // Map zone names to dockview Direction values ('above'/'below')
        const dirMap: Record<string, 'left' | 'right' | 'above' | 'below'> = {
          left: 'left', right: 'right', top: 'above', bottom: 'below',
        };
        const direction = dirMap[pos];
        if (!direction) {
          // fallback: dock as tab
          const target = this._gridGroup('viewport') ?? this._anyGridGroup();
          if (target) panel.api.moveTo({ group: target, position: 'center' });
        } else {
          // Find a reference group in the grid to position relative to
          const refGroup = this._gridGroup('viewport') ?? this._anyGridGroup();
          if (refGroup) {
            // Create a new grid group at the desired edge of the reference
            const newGroup = this._api.addGroup({
              referenceGroup: refGroup,
              direction,
              skipSetActive: true,
            });
            // Move the panel from its floating group into the new grid group
            panel.api.moveTo({ group: newGroup, position: 'center' });
          }
        }
      }
      this._detached.delete(panel.id);
      this._notify();

      // If no more floating/popout panels remain, restore window size
      if (this._detached.size === 0) {
        this._restoreWindowSize();
      }
    } catch (e) { console.warn('[Docking] dock failed', e); }
  }

  /** Re-dock every detached panel */
  dockAll(): void {
    for (const id of [...this._detached.keys()]) {
      try { const p = this._api.getPanel(id); if (p) this.dockPanel(p); } catch (_) {}
    }
    // Always restore window after docking all
    this._restoreWindowSize();
  }

  getDetachedPanels(): DetachedPanelInfo[] { return [...this._detached.values()]; }
  onChange(cb: () => void): void { this._listeners.push(cb); }

  /* ══════════════════════════════════════════════════════════════════
   *  INTERNALS
   * ══════════════════════════════════════════════════════════════════ */

  private _track(panel: IDockviewPanel, mode: 'floating' | 'popout'): void {
    this._detached.set(panel.id, { panelId: panel.id, title: (panel as any).title ?? panel.id, mode });
    this._notify();
  }
  private _notify(): void { for (const cb of this._listeners) try { cb(); } catch (_) {} }

  /**
   * After a panel is floated, its DOM element is reparented which can
   * cause Three.js canvases (and other size-dependent content) to lose
   * their dimensions.  We fire a global resize event and also toggle a
   * tiny style change to force ResizeObservers to re-measure.
   */
  private _nudgeResize(panel: IDockviewPanel): void {
    const el = (panel as any).view?.content?.element as HTMLElement | undefined;
    // Schedule multiple resize nudges to cover timing variations
    const kick = () => {
      window.dispatchEvent(new Event('resize'));
      if (el) {
        // Briefly change a layout-affecting property so ResizeObserver fires
        const prev = el.style.minHeight;
        el.style.minHeight = '1px';
        requestAnimationFrame(() => { el.style.minHeight = prev; });
      }
    };
    // Immediate + staggered nudges
    requestAnimationFrame(kick);
    setTimeout(kick, 60);
    setTimeout(kick, 200);
  }

  /* ── Multi-monitor window expansion ────────────────────────────
   *
   * When a panel is popped out we expand the Tauri window to span
   * ALL monitors.  Since the floating panel lives in the same DOM
   * it can then be dragged to any screen.  The main editor content
   * remains in its original position — only the OS window gets bigger.
   * When all panels are docked back we restore the original size.
   * ─────────────────────────────────────────────────────────────── */

  private _expandToAllMonitors(): void {
    if (this._isExpanded) return;
    const isTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
    if (!isTauri) return;

    import('@tauri-apps/api/window').then(async ({ getCurrentWindow, availableMonitors, PhysicalPosition, PhysicalSize }) => {
      try {
        const win = getCurrentWindow();

        // Save current bounds so we can restore later
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        this._savedBounds = { x: pos.x, y: pos.y, w: size.width, h: size.height };

        // Compute bounding box of all monitors
        const monitors = await availableMonitors();
        if (monitors.length <= 1) {
          // Single monitor — just maximise, no expansion needed
          this._isExpanded = true;
          return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of monitors) {
          const mx = m.position.x;
          const my = m.position.y;
          minX = Math.min(minX, mx);
          minY = Math.min(minY, my);
          maxX = Math.max(maxX, mx + m.size.width);
          maxY = Math.max(maxY, my + m.size.height);
        }

        // Expand window to cover all monitors
        await win.setPosition(new PhysicalPosition(minX, minY));
        await win.setSize(new PhysicalSize(maxX - minX, maxY - minY));
        this._isExpanded = true;

        // Nudge resize so dockview and Three.js recalculate
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);

        console.log(`[Docking] Window expanded to span ${monitors.length} monitors: (${minX},${minY})→(${maxX},${maxY})`);
      } catch (err) {
        console.warn('[Docking] Failed to expand window', err);
      }
    }).catch(() => { /* Tauri not available */ });
  }

  private _restoreWindowSize(): void {
    if (!this._isExpanded || !this._savedBounds) return;
    const isTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
    if (!isTauri) return;

    const { x, y, w, h } = this._savedBounds;
    this._savedBounds = null;
    this._isExpanded = false;

    import('@tauri-apps/api/window').then(async ({ getCurrentWindow, PhysicalPosition, PhysicalSize }) => {
      try {
        const win = getCurrentWindow();
        await win.setPosition(new PhysicalPosition(x, y));
        await win.setSize(new PhysicalSize(w, h));
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        console.log('[Docking] Window restored to original size');
      } catch (err) {
        console.warn('[Docking] Failed to restore window', err);
      }
    }).catch(() => { /* Tauri not available */ });
  }

  private _gridGroup(panelId: string): DockviewGroupPanel | null {
    try {
      const p = this._api.getPanel(panelId);
      if (!p) return null;
      const loc = (p.group as any)?.model?.location;
      if (!loc || loc.type === 'grid') return p.group as DockviewGroupPanel;
    } catch (_) {}
    return null;
  }

  private _anyGridGroup(): DockviewGroupPanel | null {
    for (const g of this._api.groups) {
      const loc = (g as any).model?.location;
      if (!loc || loc.type === 'grid') return g;
    }
    return null;
  }

  /* ── Floating-drag → dock-zone watcher ─────────────────────────
   *
   * Dockview's built-in HTML5 drag-and-drop works when you drag a
   * *tab* from a floating group.  But moving the floating overlay
   * itself (pointer-based drag on the header void area) does NOT
   * trigger HTML5 DnD and therefore shows no drop indicators.
   *
   * Here we listen in the *capture* phase for pointerdown inside a
   * floating group's header area, then track pointermove/pointerup
   * globally to show / resolve our custom dock-zone overlay.
   * ─────────────────────────────────────────────────────────────── */

  private _watchFloatingDrags(): void {
    const container = this._container;
    let dragGroup: DockviewGroupPanel | null = null;

    container.addEventListener('pointerdown', (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      // Must be inside a floating overlay
      const floatEl = t.closest('.dv-floating-groupview');
      if (!floatEl) return;
      // Must be in the tab-bar / header, not the content
      const header = t.closest('.tabs-and-actions-container');
      if (!header) return;
      // Don't interfere with our own buttons or tab DnD
      if (t.closest('.docking-action-btn') || t.closest('.tab')) return;

      dragGroup = this._groupForElement(floatEl as HTMLElement);
      if (!dragGroup) return;
      this._zones.show();

      const onMove = (ev: PointerEvent) => void this._zones.hitTest(ev.pageX, ev.pageY);

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        const zone = this._zones.hitTest(ev.pageX, ev.pageY);
        this._zones.hide();
        if (zone && dragGroup) {
          const p = dragGroup.activePanel;
          if (p) requestAnimationFrame(() => this.dockPanel(p as IDockviewPanel, zone));
        }
        dragGroup = null;
      };

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    }, true);
  }

  private _groupForElement(el: HTMLElement): DockviewGroupPanel | null {
    for (const g of this._api.groups) {
      const ge = (g as any).element as HTMLElement | undefined;
      if (ge && (ge === el || el.contains(ge))) return g;
    }
    return null;
  }

}
