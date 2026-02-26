// ============================================================
//  ProfilerOverlay — Renders lightweight, non-intrusive
//  actor labels directly in the scene viewport while the
//  profiler is open and recording. Labels show actor name,
//  class, and status with a color-coded dot.
//
//  Projects 3D world positions → 2D screen coordinates
//  using the active camera and viewport dimensions.
// ============================================================

import * as THREE from 'three';
import { ProfilerStore, STATUS_COLORS, type ActorSnapshot } from './ProfilerStore';
import { injectProfilerStyles } from './ProfilerStyles';

export class ProfilerOverlay {
  private _container: HTMLElement;
  private _overlayDiv: HTMLElement;
  private _store: ProfilerStore;
  private _camera: THREE.Camera | null = null;
  private _scene: THREE.Scene | null = null;
  private _unsub: (() => void) | null = null;
  private _raf: number | null = null;
  private _active = false;
  private _selectedActorId: number | null = null;

  // Callbacks
  private _onActorClick: ((actorId: number) => void) | null = null;

  constructor(viewportContainer: HTMLElement) {
    injectProfilerStyles();
    this._container = viewportContainer;
    this._store = ProfilerStore.getInstance();

    this._overlayDiv = document.createElement('div');
    this._overlayDiv.className = 'profiler-overlay-container';
    this._overlayDiv.style.display = 'none';
    this._container.appendChild(this._overlayDiv);
  }

  /** Set camera and scene references for 3D projection */
  setCamera(camera: THREE.Camera): void { this._camera = camera; }
  setScene(scene: THREE.Scene): void { this._scene = scene; }

  /** Callback when an actor label is clicked in the viewport */
  onActorClick(cb: (actorId: number) => void): void { this._onActorClick = cb; }

  /** Highlight a specific actor (from profiler panel interaction) */
  setSelectedActor(actorId: number | null): void {
    this._selectedActorId = actorId;
  }

  /** Show the overlay and start updating */
  show(): void {
    if (this._active) return;
    this._active = true;
    this._overlayDiv.style.display = 'block';
    this._unsub = this._store.subscribe(() => { /* UI synced via RAF */ });
    this._tick();
  }

  /** Hide the overlay and stop updating */
  hide(): void {
    this._active = false;
    this._overlayDiv.style.display = 'none';
    if (this._unsub) { this._unsub(); this._unsub = null; }
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._overlayDiv.innerHTML = '';
  }

  /** Full cleanup */
  destroy(): void {
    this.hide();
    this._overlayDiv.remove();
  }

  // ─────────────────────────────────────────────────────
  //  Frame Update Loop
  // ─────────────────────────────────────────────────────

  private _tick = (): void => {
    if (!this._active) return;
    this._render();
    this._raf = requestAnimationFrame(this._tick);
  };

  // ─────────────────────────────────────────────────────
  //  Render Labels
  // ─────────────────────────────────────────────────────

  private _render(): void {
    const store = this._store;
    if (!store.isRecording && !store.isReplaying) {
      this._overlayDiv.innerHTML = '';
      return;
    }

    const camera = this._camera;
    if (!camera) {
      this._overlayDiv.innerHTML = '';
      return;
    }

    const rect = this._container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    // Build a map of existing label elements for reuse
    const existingLabels = new Map<number, HTMLElement>();
    for (const child of Array.from(this._overlayDiv.children)) {
      const el = child as HTMLElement;
      const id = Number(el.dataset.actorId);
      if (!isNaN(id)) existingLabels.set(id, el);
    }

    const usedIds = new Set<number>();
    const tempVec = new THREE.Vector3();

    for (const [actorId, actor] of store.actors) {
      usedIds.add(actorId);

      // Project 3D → 2D
      tempVec.set(actor.position.x, actor.position.y, actor.position.z);
      tempVec.project(camera);

      // Check if behind camera
      if (tempVec.z > 1) {
        const existing = existingLabels.get(actorId);
        if (existing) existing.style.display = 'none';
        continue;
      }

      const screenX = (tempVec.x * 0.5 + 0.5) * w;
      const screenY = (-tempVec.y * 0.5 + 0.5) * h;

      // Skip if out of bounds (with margin)
      if (screenX < -50 || screenX > w + 50 || screenY < -30 || screenY > h + 30) {
        const existing = existingLabels.get(actorId);
        if (existing) existing.style.display = 'none';
        continue;
      }

      let label = existingLabels.get(actorId);
      if (!label) {
        label = document.createElement('div');
        label.className = 'profiler-actor-label';
        label.dataset.actorId = String(actorId);
        label.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._onActorClick) this._onActorClick(actorId);
        });
        this._overlayDiv.appendChild(label);
      }

      const statusColor = STATUS_COLORS[actor.status] || '#95a5a6';
      const isSelected = this._selectedActorId === actorId;
      const isNew = store.newlySpawnedIds.has(actorId);

      label.style.display = 'flex';
      label.style.left = `${Math.round(screenX)}px`;
      label.style.top = `${Math.round(screenY)}px`;
      label.style.transform = 'translate(-50%, -100%) translateY(-8px)';
      label.style.borderColor = isSelected ? '#3498db' : (isNew ? '#2ecc71' : '#333');

      label.innerHTML = `
        <span class="status-dot" style="background:${statusColor}"></span>
        <span class="actor-name">${this._escapeHTML(actor.name)}</span>
        <span class="actor-class">${this._escapeHTML(actor.className)}</span>
      `;
    }

    // Remove labels for actors that no longer exist
    for (const [id, el] of existingLabels) {
      if (!usedIds.has(id)) {
        el.remove();
      }
    }
  }

  private _escapeHTML(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}
