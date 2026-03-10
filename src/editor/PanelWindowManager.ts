/**
 * PanelWindowManager — creates / destroys real Tauri WebviewWindows
 * for panels that are "popped out" of the main editor.
 *
 * Each popped-out panel becomes its own native OS window, freely
 * draggable across monitors — exactly like Unreal Engine's detachable
 * panels.
 *
 * Communication uses Tauri's cross-window event system so the panel
 * content stays synchronised with the main editor.
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { availableMonitors, primaryMonitor } from '@tauri-apps/api/window';

/* ────────────────────────────────────────────────────────────────────
 *  Types
 * ──────────────────────────────────────────────────────────────────── */

export interface PopoutWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PopoutPanelEntry {
  panelId: string;
  title: string;
  window: WebviewWindow;
  unlisteners: UnlistenFn[];
  /** The hidden DOM element in the main window that still renders panel content */
  sourceEl: HTMLElement | null;
  /** Interval id for content sync */
  syncInterval: ReturnType<typeof setInterval> | null;
}

/* ────────────────────────────────────────────────────────────────────
 *  PanelWindowManager  (singleton)
 * ──────────────────────────────────────────────────────────────────── */

export class PanelWindowManager {
  static instance: PanelWindowManager | null = null;

  /** panelId → window entry */
  private _windows = new Map<string, PopoutPanelEntry>();

  /** persisted positions & sizes */
  private _savedStates: Record<string, PopoutWindowState> = {};

  /** Listeners for popout lifecycle changes */
  private _changeListeners: Array<() => void> = [];

  constructor() {
    PanelWindowManager.instance = this;
    this._loadSavedStates();
  }

  /* ══════════════════════════════════════════════════════════════
   *  Create a native popout window for a panel
   * ══════════════════════════════════════════════════════════════ */

  async popout(
    panelId: string,
    title: string,
    sourceEl: HTMLElement | null,
  ): Promise<WebviewWindow | null> {
    // Already popped out — just focus
    if (this._windows.has(panelId)) {
      const entry = this._windows.get(panelId)!;
      try { await entry.window.setFocus(); } catch (_) {}
      return entry.window;
    }

    // Determine position / size
    const saved = this._savedStates[panelId];
    const pos = saved
      ? await this._validatePosition(saved)
      : this._smartDefault();
    const size = saved
      ? { width: saved.width, height: saved.height }
      : { width: 900, height: 650 };

    // Determine the URL for the popout page.
    // In dev mode Vite serves from localhost; in production it's a
    // relative file path.  The popout.html is a separate Vite entry
    // point so it has its own URL.
    const isDev = import.meta.env?.DEV ?? false;
    const popoutUrl = isDev
      ? `/popout.html?panelId=${encodeURIComponent(panelId)}`
      : `popout.html?panelId=${encodeURIComponent(panelId)}`;

    const label = `panel-${panelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    let panelWindow: WebviewWindow;
    try {
      panelWindow = new WebviewWindow(label, {
        url: popoutUrl,
        title,
        width: size.width,
        height: size.height,
        x: pos.x,
        y: pos.y,
        resizable: true,
        decorations: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        visible: false,   // show after content is ready
        focus: true,
        center: !saved,   // center on primary if no saved position
      });
    } catch (err) {
      console.error('[PanelWindowManager] Failed to create WebviewWindow', err);
      return null;
    }

    const unlisteners: UnlistenFn[] = [];
    const entry: PopoutPanelEntry = {
      panelId,
      title,
      window: panelWindow,
      unlisteners,
      sourceEl,
      syncInterval: null,
    };

    // ── Window lifecycle events ────────────────────────────────

    // When the window is created, send initial content and show it
    const createdUnsub = await panelWindow.once('tauri://created', async () => {
      // Small delay to let the popout page's JS initialise
      setTimeout(async () => {
        // Send initial content
        this._sendContent(entry);
        // Start periodic content sync
        entry.syncInterval = setInterval(() => this._sendContent(entry), 500);
        // Show the window
        try { await panelWindow.show(); } catch (_) {}
      }, 200);
    });
    unlisteners.push(createdUnsub);

    // Track position / size changes
    const moveUnsub = await panelWindow.listen('tauri://move', async () => {
      await this._persistWindowState(panelId, panelWindow);
    });
    unlisteners.push(moveUnsub);

    const resizeUnsub = await panelWindow.listen('tauri://resize', async () => {
      await this._persistWindowState(panelId, panelWindow);
    });
    unlisteners.push(resizeUnsub);

    // Handle window close (OS close button) → re-dock
    const closeUnsub = await panelWindow.listen('tauri://close-requested', async () => {
      // Signal the main window to re-dock this panel
      await emit('panel-close-requested', { panelId });
    });
    unlisteners.push(closeUnsub);

    // Listen for re-dock request from the popout window
    const redockUnsub = await listen(`panel-redock-${panelId}`, async () => {
      await emit('panel-close-requested', { panelId });
    });
    unlisteners.push(redockUnsub);

    // Listen for forwarded input events from the popout window
    const inputUnsub = await listen(`panel-input-${panelId}`, (event: any) => {
      this._handleForwardedInput(entry, event.payload);
    });
    unlisteners.push(inputUnsub);

    this._windows.set(panelId, entry);
    this._notifyChange();
    return panelWindow;
  }

  /* ══════════════════════════════════════════════════════════════
   *  Destroy a popout window (called when re-docking)
   * ══════════════════════════════════════════════════════════════ */

  async destroy(panelId: string): Promise<void> {
    const entry = this._windows.get(panelId);
    if (!entry) return;

    // Stop content sync
    if (entry.syncInterval) clearInterval(entry.syncInterval);

    // Remove event listeners
    for (const unsub of entry.unlisteners) {
      try { unsub(); } catch (_) {}
    }

    // Close the window
    try { await entry.window.destroy(); } catch (_) {}

    this._windows.delete(panelId);
    this._notifyChange();
  }

  /* ══════════════════════════════════════════════════════════════
   *  Focus a popout window
   * ══════════════════════════════════════════════════════════════ */

  async focus(panelId: string): Promise<void> {
    const entry = this._windows.get(panelId);
    if (entry) {
      try { await entry.window.setFocus(); } catch (_) {}
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  Query
   * ══════════════════════════════════════════════════════════════ */

  has(panelId: string): boolean {
    return this._windows.has(panelId);
  }

  getPopoutPanelIds(): string[] {
    return [...this._windows.keys()];
  }

  onChange(cb: () => void): void {
    this._changeListeners.push(cb);
  }

  /* ══════════════════════════════════════════════════════════════
   *  Close all popout windows (editor is shutting down)
   * ══════════════════════════════════════════════════════════════ */

  async destroyAll(): Promise<void> {
    for (const panelId of [...this._windows.keys()]) {
      await this.destroy(panelId);
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  INTERNALS
   * ══════════════════════════════════════════════════════════════ */

  /** Send the panel's current rendered HTML to the popout window.
   *  Canvas/WebGL-based panels (viewport, shader graph, etc.) cannot
   *  be serialised to innerHTML — we detect those and send a helpful
   *  indicator instead of broken/empty markup. */
  private _sendContent(entry: PopoutPanelEntry): void {
    if (!entry.sourceEl) return;

    // Detect canvas-heavy panels that can't be mirrored
    const canvases = entry.sourceEl.querySelectorAll('canvas');
    const hasWebGL = Array.from(canvases).some((c) => {
      try {
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
      } catch (_) {
        return c.width > 0 && c.height > 0;
      }
    });

    let html: string;
    if (hasWebGL || canvases.length > 0) {
      // For canvas panels, send a styled indicator instead of
      // broken innerHTML.  The real rendering stays in the main
      // window where the WebGL context is alive.
      html = `
        <div style="display:flex;flex-direction:column;align-items:center;
                    justify-content:center;height:100%;color:#888;
                    font-family:Inter,system-ui,sans-serif;gap:12px;
                    text-align:center;padding:24px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          <div style="font-size:14px;font-weight:500;">
            ${entry.title ?? entry.panelId} — Live in Main Window
          </div>
          <div style="font-size:12px;max-width:320px;opacity:0.7;">
            This panel uses a GPU-accelerated canvas and must remain
            in the main editor window.  Switch back to the main window
            to interact with it.
          </div>
        </div>`;
    } else {
      html = entry.sourceEl.innerHTML;
    }

    // Only send if content actually changed
    const key = `__lastSentHtml_${entry.panelId}`;
    if ((this as any)[key] === html) return;
    (this as any)[key] = html;

    emit(`panel-content-${entry.panelId}`, {
      html,
      title: entry.title,
    }).catch(() => {});
  }

  /** Forward an input event from the popout to the real panel DOM */
  private _handleForwardedInput(
    entry: PopoutPanelEntry,
    payload: { type: string; selector: string; value?: string },
  ): void {
    if (!entry.sourceEl) return;
    const target = entry.sourceEl.querySelector(payload.selector) as HTMLElement | null;
    if (!target) return;

    switch (payload.type) {
      case 'click':
        target.click();
        break;
      case 'input':
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          target.value = payload.value ?? '';
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;
    }
  }

  /** Persist window position/size to localStorage */
  private async _persistWindowState(panelId: string, win: WebviewWindow): Promise<void> {
    try {
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      this._savedStates[panelId] = {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      };
      this._saveSavedStates();
    } catch (_) {}
  }

  /** Validate that a saved position is still on an available monitor */
  private async _validatePosition(
    state: PopoutWindowState,
  ): Promise<{ x: number; y: number }> {
    try {
      const monitors = await availableMonitors();
      const onAMonitor = monitors.some((m) => {
        const mx = m.position.x;
        const my = m.position.y;
        const mw = m.size.width;
        const mh = m.size.height;
        // At least the top-left 100×100 region must be on screen
        return (
          state.x + 100 >= mx &&
          state.y + 50 >= my &&
          state.x < mx + mw &&
          state.y < my + mh
        );
      });

      if (onAMonitor) return { x: state.x, y: state.y };

      // Fallback to primary monitor
      const primary = await primaryMonitor();
      if (primary) {
        return { x: primary.position.x + 120, y: primary.position.y + 120 };
      }
    } catch (_) {}
    return { x: 200, y: 200 };
  }

  /** Smart default position that staggers windows */
  private _smartDefault(): { x: number; y: number } {
    const count = this._windows.size;
    return { x: 180 + count * 32, y: 140 + count * 32 };
  }

  private _notifyChange(): void {
    for (const cb of this._changeListeners) {
      try { cb(); } catch (_) {}
    }
  }

  /* ── Persistence ───────────────────────────────────────────── */

  private _saveSavedStates(): void {
    try {
      localStorage.setItem(
        'feather-popout-window-states',
        JSON.stringify(this._savedStates),
      );
    } catch (_) {}
  }

  private _loadSavedStates(): void {
    try {
      const raw = localStorage.getItem('feather-popout-window-states');
      if (raw) this._savedStates = JSON.parse(raw);
    } catch (_) {
      this._savedStates = {};
    }
  }
}
