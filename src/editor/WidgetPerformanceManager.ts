// ============================================================
//  WidgetPerformanceManager — Performance optimization for
//  widget rendering: static caching, dirty tracking, update
//  frequency control, and render batching.
// ============================================================

import type { WidgetRenderer } from './WidgetRenderer';

// ============================================================
//  WidgetPerformanceManager
// ============================================================

export class WidgetPerformanceManager {
  private _renderer: WidgetRenderer;

  /** Cached offscreen canvases for static widgets */
  private _widgetCache: Map<string, {
    canvas: OffscreenCanvas;
    rect: { x: number; y: number; width: number; height: number };
    dirty: boolean;
  }> = new Map();

  /** Widget IDs that are considered static (rarely change) */
  private _staticWidgets: Set<string> = new Set();

  /** Widget IDs that are dynamic (frequently change) */
  private _dynamicWidgets: Set<string> = new Set();

  /** Per-widget update frequency in Hz */
  private _updateFrequency: Map<string, number> = new Map();

  /** Frame counter for frequency-based updates */
  private _frameCount = 0;

  /** Performance stats */
  private _stats = {
    lastRenderTime: 0,
    avgRenderTime: 0,
    renderCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  private static _instance: WidgetPerformanceManager | null = null;

  constructor(renderer: WidgetRenderer) {
    this._renderer = renderer;
    WidgetPerformanceManager._instance = this;
  }

  static get instance(): WidgetPerformanceManager | null {
    return WidgetPerformanceManager._instance;
  }

  // ---- Classification ----

  /** Mark a widget as static (will be cached after first render) */
  markStatic(widgetId: string): void {
    this._staticWidgets.add(widgetId);
    this._dynamicWidgets.delete(widgetId);
    this._renderer.markStatic(widgetId);
  }

  /** Mark a widget as dynamic (rendered every frame if dirty) */
  markDynamic(widgetId: string, updateHz: number = 60): void {
    this._dynamicWidgets.add(widgetId);
    this._staticWidgets.delete(widgetId);
    this._updateFrequency.set(widgetId, updateHz);
    this._renderer.markDynamic(widgetId);
    this._widgetCache.delete(widgetId);
  }

  // ---- Update ----

  /** Call once per frame to update counters */
  update(): void {
    this._frameCount++;
  }

  /** Check if a widget should be updated this frame */
  shouldUpdate(widgetId: string): boolean {
    if (this._dynamicWidgets.has(widgetId)) return true;

    const freq = this._updateFrequency.get(widgetId) || 60;
    if (freq >= 60) return true;

    return this._frameCount % Math.max(1, Math.floor(60 / freq)) === 0;
  }

  // ---- Caching ----

  /** Try to draw widget from cache. Returns true if cache hit. */
  drawCached(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, widgetId: string): boolean {
    const cache = this._widgetCache.get(widgetId);
    if (!cache || cache.dirty) {
      this._stats.cacheMisses++;
      return false;
    }

    ctx.drawImage(cache.canvas, cache.rect.x, cache.rect.y);
    this._stats.cacheHits++;
    return true;
  }

  /** Store a rendered widget in cache */
  cacheWidget(
    widgetId: string,
    canvas: OffscreenCanvas,
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    this._widgetCache.set(widgetId, { canvas, rect, dirty: false });
  }

  /** Invalidate a cached widget */
  invalidateCache(widgetId: string): void {
    const cache = this._widgetCache.get(widgetId);
    if (cache) cache.dirty = true;
  }

  /** Invalidate all caches */
  invalidateAll(): void {
    for (const cache of this._widgetCache.values()) {
      cache.dirty = true;
    }
  }

  /** Clear all caches */
  clearCache(): void {
    this._widgetCache.clear();
  }

  // ---- Stats ----

  /** Record render time for performance tracking */
  recordRenderTime(ms: number): void {
    this._stats.lastRenderTime = ms;
    this._stats.renderCount++;
    this._stats.avgRenderTime =
      this._stats.avgRenderTime * 0.9 + ms * 0.1;
  }

  get stats() {
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats.cacheHits = 0;
    this._stats.cacheMisses = 0;
    this._stats.renderCount = 0;
  }

  // ---- Batch optimization ----

  /** Group widgets by their z-order for efficient batch rendering */
  getZOrderBatches(widgetIds: string[]): Map<number, string[]> {
    const batches = new Map<number, string[]>();

    for (const id of widgetIds) {
      const widget = this._renderer.getWidget(id);
      if (!widget) continue;
      const z = widget.slot.zOrder || 0;
      if (!batches.has(z)) batches.set(z, []);
      batches.get(z)!.push(id);
    }

    return batches;
  }

  // ---- Cleanup ----

  destroy(): void {
    this._widgetCache.clear();
    this._staticWidgets.clear();
    this._dynamicWidgets.clear();
    this._updateFrequency.clear();
  }
}
