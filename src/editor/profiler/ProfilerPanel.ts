// ============================================================
//  ProfilerPanel — Complete profiler UI with all tabs, metrics
//  bar, session sidebar, detail panels, and search.
//  Follows the same panel-creation pattern as other editor
//  panels (ClassHierarchyPanel, OutputLog, etc.)
// ============================================================

import {
  ProfilerStore,
  STATUS_COLORS,
  THRESHOLDS,
  getEventColor,
  type ActorSnapshot,
  type ClassRecord,
  type NodeExecRecord,
  type EventRecord,
} from './ProfilerStore';
import { injectProfilerStyles } from './ProfilerStyles';

// ── Helpers ────────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtMs(ms: number): string {
  return ms < 0.01 ? '<0.01' : ms.toFixed(2);
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function highlightText(text: string, query: string): string {
  if (!query) return esc(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  return esc(text).replace(re, '<span class="profiler-highlight">$1</span>');
}

function buildSparklineSVG(data: number[], color: string, maxVal?: number): string {
  if (data.length < 2) return '';
  const w = 100;
  const h = 18;
  const max = maxVal ?? Math.max(...data, 1);
  const step = w / (data.length - 1);
  let pathD = '';
  for (let i = 0; i < data.length; i++) {
    const x = i * step;
    const y = h - (data[i] / max) * h;
    pathD += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  }
  // Fill area
  const fillD = `${pathD} L${(data.length - 1) * step},${h} L0,${h} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${fillD}" fill="${color}" opacity="0.15"/>
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1" opacity="0.5"/>
  </svg>`;
}

function buildMiniBar(values: number[], color: string): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const recent = values.slice(-8);
  let html = '<span class="profiler-mini-bar">';
  for (const v of recent) {
    const h = Math.max(1, Math.round((v / max) * 14));
    html += `<span class="profiler-mini-bar-seg" style="height:${h}px;background:${color}"></span>`;
  }
  html += '</span>';
  return html;
}

function statusBadge(status: string): string {
  const cls = status.toLowerCase();
  return `<span class="profiler-badge ${cls}">${status}</span>`;
}

function nodeTypeBadge(type: string): string {
  const cls = type.toLowerCase();
  return `<span class="profiler-node-type ${cls}">${esc(type)}</span>`;
}

function eventBadge(type: string): string {
  const color = getEventColor(type);
  return `<span class="profiler-event-badge" style="background:${color}20;color:${color}">${esc(type)}</span>`;
}

// ── Sort helpers ──────────────────────────────────────────

type SortDir = 'asc' | 'desc';

function sortCompare(a: any, b: any, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === 'asc' ? -1 : 1;
  if (b == null) return dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a;
  }
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
}

// ── Types ────────────────────────────────────────────────

type TabId = 'scene' | 'classes' | 'nodes' | 'events' | 'ai';

interface TabSort {
  column: string;
  dir: SortDir;
}

// ═══════════════════════════════════════════════════════════
//  ProfilerPanel Class
// ═══════════════════════════════════════════════════════════

export class ProfilerPanel {
  private _container: HTMLElement;
  private _el: HTMLElement;
  private _store: ProfilerStore;
  private _unsub: (() => void) | null = null;

  // UI elements
  private _metricsBar!: HTMLElement;
  private _tabContent!: HTMLElement;
  private _detailPanel!: HTMLElement;
  private _detailBody!: HTMLElement;
  private _detailTitle!: HTMLElement;
  private _sidebarList!: HTMLElement;
  private _replayBanner!: HTMLElement;
  private _tabSearchInput!: HTMLInputElement;
  private _globalSearchInput!: HTMLInputElement;

  // State
  private _activeTab: TabId = 'scene';
  private _tabSearch: string = '';
  private _globalSearch: string = '';
  private _detailOpen = false;
  private _detailType: 'actor' | 'node' | 'event' | 'class' | null = null;
  private _detailId: string | number | null = null;
  private _tabSorts: Record<TabId, TabSort> = {
    scene: { column: 'name', dir: 'asc' },
    classes: { column: 'instances', dir: 'desc' },
    nodes: { column: 'execCount', dir: 'desc' },
    events: { column: 'id', dir: 'desc' },
    ai: { column: 'id', dir: 'desc' },
  };

  // Callback for viewport overlay sync
  private _onActorSelect: ((actorId: number | null) => void) | null = null;

  constructor(container: HTMLElement) {
    injectProfilerStyles();
    this._container = container;
    this._store = ProfilerStore.getInstance();

    this._el = document.createElement('div');
    this._el.className = 'profiler-root';
    container.appendChild(this._el);

    this._buildUI();
    this._unsub = this._store.subscribe(() => this._onStoreUpdate());
    this._onStoreUpdate();
  }

  destroy(): void {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    this._el.remove();
  }

  /** Set callback for when an actor is clicked in the profiler */
  onActorSelect(cb: (actorId: number | null) => void): void {
    this._onActorSelect = cb;
  }

  /** Programmatically select an actor (e.g. from viewport overlay click) */
  selectActor(actorId: number): void {
    this._openDetail('actor', actorId);
    this._renderTabContent();
  }

  // ─────────────────────────────────────────────────────
  //  Build UI Structure
  // ─────────────────────────────────────────────────────

  private _buildUI(): void {
    // Top bar
    const topbar = document.createElement('div');
    topbar.className = 'profiler-topbar';
    topbar.innerHTML = `
      <span class="profiler-topbar-title">⚡ PROFILER</span>
      <button class="profiler-rec-btn" data-action="toggle-rec">
        <span class="rec-icon">●</span>
        <span class="rec-text">Record</span>
      </button>
      <span class="profiler-session-label" data-el="session-label"></span>
      <div class="profiler-global-search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input type="text" placeholder="Search all tabs…" data-el="global-search"/>
      </div>
    `;
    this._el.appendChild(topbar);

    // Record button
    const recBtn = topbar.querySelector('[data-action="toggle-rec"]') as HTMLButtonElement;
    recBtn.addEventListener('click', () => this._toggleRecording());
    this._globalSearchInput = topbar.querySelector('[data-el="global-search"]') as HTMLInputElement;
    this._globalSearchInput.addEventListener('input', () => {
      this._globalSearch = this._globalSearchInput.value;
      this._renderTabContent();
    });

    // Replay banner (hidden by default)
    this._replayBanner = document.createElement('div');
    this._replayBanner.className = 'profiler-replay-banner';
    this._replayBanner.style.display = 'none';
    this._el.appendChild(this._replayBanner);

    // Metrics bar
    this._metricsBar = document.createElement('div');
    this._metricsBar.className = 'profiler-metrics-bar';
    this._el.appendChild(this._metricsBar);

    // Body (sidebar + main)
    const body = document.createElement('div');
    body.className = 'profiler-body';
    this._el.appendChild(body);

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'profiler-sidebar';
    sidebar.innerHTML = `
      <div class="profiler-sidebar-header">Sessions</div>
      <div class="profiler-sidebar-list" data-el="sidebar-list"></div>
    `;
    body.appendChild(sidebar);
    this._sidebarList = sidebar.querySelector('[data-el="sidebar-list"]') as HTMLElement;

    // Resize handle
    const resize = document.createElement('div');
    resize.className = 'profiler-resize-handle';
    body.appendChild(resize);
    this._setupResize(resize, sidebar);

    // Main area
    const main = document.createElement('div');
    main.className = 'profiler-main';
    body.appendChild(main);

    // Tabs strip
    const tabs = document.createElement('div');
    tabs.className = 'profiler-tabs';
    const tabDefs: { id: TabId; label: string }[] = [
      { id: 'scene', label: 'Scene Objects' },
      { id: 'classes', label: 'Classes & Components' },
      { id: 'nodes', label: 'Node Execution' },
      { id: 'events', label: 'Events Log' },
      { id: 'ai', label: 'AI & Blackboard' },
    ];
    for (const t of tabDefs) {
      const tab = document.createElement('div');
      tab.className = `profiler-tab${t.id === this._activeTab ? ' active' : ''}`;
      tab.textContent = t.label;
      tab.dataset.tab = t.id;
      tab.addEventListener('click', () => {
        this._activeTab = t.id;
        tabs.querySelectorAll('.profiler-tab').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        this._tabSearch = '';
        this._tabSearchInput.value = '';
        this._renderTabContent();
      });
      tabs.appendChild(tab);
    }
    main.appendChild(tabs);

    // Tab search
    const tabSearch = document.createElement('div');
    tabSearch.className = 'profiler-tab-search';
    tabSearch.innerHTML = `<input type="text" placeholder="Filter this tab…" data-el="tab-search"/>`;
    main.appendChild(tabSearch);
    this._tabSearchInput = tabSearch.querySelector('[data-el="tab-search"]') as HTMLInputElement;
    this._tabSearchInput.addEventListener('input', () => {
      this._tabSearch = this._tabSearchInput.value;
      this._renderTabContent();
    });

    // Tab content
    this._tabContent = document.createElement('div');
    this._tabContent.className = 'profiler-tab-content';
    main.appendChild(this._tabContent);

    // Detail panel (slides in from right)
    this._detailPanel = document.createElement('div');
    this._detailPanel.className = 'profiler-detail-panel';
    this._detailPanel.innerHTML = `
      <div class="profiler-detail-header">
        <span class="profiler-detail-title" data-el="detail-title"></span>
        <button class="profiler-detail-close" data-action="close-detail">✕</button>
      </div>
      <div class="profiler-detail-body" data-el="detail-body"></div>
    `;
    main.appendChild(this._detailPanel);
    this._detailTitle = this._detailPanel.querySelector('[data-el="detail-title"]') as HTMLElement;
    this._detailBody = this._detailPanel.querySelector('[data-el="detail-body"]') as HTMLElement;
    this._detailPanel.querySelector('[data-action="close-detail"]')!.addEventListener('click', () => {
      this._closeDetail();
    });
  }

  // ─────────────────────────────────────────────────────
  //  Recording
  // ─────────────────────────────────────────────────────

  /** The scene name to use when the user manually presses Record */
  private _playSceneName: string = 'Untitled Scene';

  private _toggleRecording(): void {
    const store = this._store;
    if (store.isRecording) {
      store.stopRecording();
    } else {
      if (store.isReplaying) store.exitReplay();
      store.startRecording(this._playSceneName);
    }
    this._onStoreUpdate();
  }

  /** Called by EditorLayout when play starts — save the scene name (does NOT auto-start) */
  setPlaySceneName(sceneName: string): void {
    this._playSceneName = sceneName;
  }

  /** Called by EditorLayout when play stops */
  onPlayStopped(): void {
    if (this._store.isRecording) {
      this._store.stopRecording();
      this._onStoreUpdate();
    }
  }

  /** Legacy: start recording programmatically */
  startRecording(sceneName: string): void {
    if (!this._store.isRecording) {
      if (this._store.isReplaying) this._store.exitReplay();
      this._store.startRecording(sceneName);
      this._onStoreUpdate();
    }
  }

  /** Legacy: stop recording programmatically */
  stopRecording(): void {
    if (this._store.isRecording) {
      this._store.stopRecording();
      this._onStoreUpdate();
    }
  }

  // ─────────────────────────────────────────────────────
  //  Store Update Handler
  // ─────────────────────────────────────────────────────

  private _onStoreUpdate(): void {
    this._renderTopbar();
    this._renderMetrics();
    this._renderSidebar();
    this._renderReplayBanner();
    this._renderTabContent();
    if (this._detailOpen) this._renderDetail();
  }

  // ─────────────────────────────────────────────────────
  //  Render: Top Bar
  // ─────────────────────────────────────────────────────

  private _renderTopbar(): void {
    const btn = this._el.querySelector('[data-action="toggle-rec"]') as HTMLButtonElement;
    const label = this._el.querySelector('[data-el="session-label"]') as HTMLElement;
    const store = this._store;

    if (store.isRecording) {
      btn.classList.add('recording');
      btn.innerHTML = '<span class="profiler-rec-dot"></span><span class="rec-text">Stop</span>';
      label.textContent = `Recording: ${store.sessionName} — ${fmtTime(store.elapsedTime)}`;
    } else {
      btn.classList.remove('recording');
      btn.innerHTML = '<span class="rec-icon">●</span><span class="rec-text">Record</span>';
      label.textContent = store.isReplaying ? `Viewing: ${store.sessionName}` : '';
    }
  }

  // ─────────────────────────────────────────────────────
  //  Render: Replay Banner
  // ─────────────────────────────────────────────────────

  private _renderReplayBanner(): void {
    if (this._store.isReplaying) {
      this._replayBanner.style.display = 'flex';
      this._replayBanner.innerHTML = `
        <span>📋 Viewing saved session: <strong>${esc(this._store.sessionName)}</strong>
          — ${this._store.currentFrame} frames, ${fmtTime(this._store.frameSnapshots.length > 0 ? this._store.frameSnapshots[this._store.frameSnapshots.length - 1].time : 0)}</span>
        <button data-action="exit-replay">Exit Replay</button>
      `;
      this._replayBanner.querySelector('[data-action="exit-replay"]')!.addEventListener('click', () => {
        this._store.exitReplay();
      });
    } else {
      this._replayBanner.style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────────────
  //  Render: Metrics Bar
  // ─────────────────────────────────────────────────────

  private _renderMetrics(): void {
    const store = this._store;
    const last = store.frameSnapshots.length > 0
      ? store.frameSnapshots[store.frameSnapshots.length - 1]
      : null;

    const metrics = [
      {
        label: 'FPS', value: last ? `${last.fps}` : '--',
        spark: store.fpsHistory, color: '#2ecc71',
        level: last ? (last.fps < THRESHOLDS.fps.critical ? 'critical' : last.fps < THRESHOLDS.fps.warn ? 'warn' : '') : '',
      },
      {
        label: 'CPU ms', value: last ? fmtMs(last.cpuFrameTimeMs) : '--',
        spark: store.cpuMsHistory, color: '#3498db',
        level: last ? (last.cpuFrameTimeMs > THRESHOLDS.cpuMs.critical ? 'critical' : last.cpuFrameTimeMs > THRESHOLDS.cpuMs.warn ? 'warn' : '') : '',
      },
      {
        label: 'GPU ms', value: last ? fmtMs(last.gpuFrameTimeMs) : '--',
        spark: store.gpuMsHistory, color: '#9b59b6',
        level: last ? (last.gpuFrameTimeMs > THRESHOLDS.gpuMs.critical ? 'critical' : last.gpuFrameTimeMs > THRESHOLDS.gpuMs.warn ? 'warn' : '') : '',
      },
      {
        label: 'Memory MB', value: last ? last.memoryMB.toFixed(1) : '--',
        spark: store.memMBHistory, color: '#e67e22',
        level: last ? (last.memoryMB > THRESHOLDS.memMB.critical ? 'critical' : last.memoryMB > THRESHOLDS.memMB.warn ? 'warn' : '') : '',
      },
      {
        label: 'Actors', value: last ? `${last.activeActorCount}` : '--',
        spark: store.actorCountHistory, color: '#1abc9c',
        level: '',
      },
      {
        label: 'Node Execs', value: last ? `${last.nodeExecsThisFrame}` : '--',
        spark: store.nodeExecHistory, color: '#f39c12',
        level: '',
      },
      {
        label: 'Events', value: last ? `${last.eventsFiredThisFrame}` : '--',
        spark: store.eventHistory, color: '#e74c3c',
        level: '',
      },
    ];

    let html = '';
    for (const m of metrics) {
      html += `<div class="profiler-metric-card ${m.level}">
        <span class="profiler-metric-label">${m.label}</span>
        <span class="profiler-metric-value">${m.value}</span>
        <div class="profiler-sparkline">${buildSparklineSVG(m.spark, m.color)}</div>
      </div>`;
    }
    this._metricsBar.innerHTML = html;
  }

  // ─────────────────────────────────────────────────────
  //  Render: Sessions Sidebar
  // ─────────────────────────────────────────────────────

  private _renderSidebar(): void {
    const store = this._store;
    if (store.savedSessions.length === 0) {
      this._sidebarList.innerHTML = '<div class="profiler-empty"><span class="profiler-empty-icon">📂</span><span>No saved sessions</span></div>';
      return;
    }

    let html = '';
    const sorted = [...store.savedSessions].sort((a, b) => b.date - a.date);
    for (const s of sorted) {
      const isActive = store.isReplaying && store.sessionName === s.name;
      html += `<div class="profiler-session-item ${isActive ? 'active' : ''}" data-session="${esc(s.id)}">
        <span class="profiler-session-item-name">${esc(s.name)}</span>
        <span class="profiler-session-item-meta">${esc(s.sceneName)} — ${s.frames} frames, ${fmtTime(s.duration)}</span>
        <div class="profiler-session-actions">
          <button data-action="load" data-sid="${esc(s.id)}">Load</button>
          <button data-action="export" data-sid="${esc(s.id)}">Export</button>
          <button data-action="export-trace" data-sid="${esc(s.id)}">Trace</button>
          <button class="delete" data-action="delete" data-sid="${esc(s.id)}">Delete</button>
        </div>
      </div>`;
    }
    this._sidebarList.innerHTML = html;

    // Wire events
    this._sidebarList.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action;
        const sid = (btn as HTMLElement).dataset.sid;
        if (!sid) return;
        if (action === 'load') this._store.loadSession(sid);
        else if (action === 'export') this._exportSession(sid);
        else if (action === 'export-trace') this._exportTrace(sid);
        else if (action === 'delete') this._store.deleteSession(sid);
      });
    });
  }

  private _exportSession(sid: string): void {
    const json = this._store.exportSessionJSON(sid);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profiler_${sid}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _exportTrace(sid: string): void {
    const json = this._store.exportChromeTracingJSON(sid);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace_${sid}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────
  //  Render: Tab Content
  // ─────────────────────────────────────────────────────

  private _renderTabContent(): void {
    const search = (this._globalSearch || this._tabSearch).toLowerCase();

    switch (this._activeTab) {
      case 'scene': this._renderSceneTab(search); break;
      case 'classes': this._renderClassesTab(search); break;
      case 'nodes': this._renderNodesTab(search); break;
      case 'events': this._renderEventsTab(search); break;
      case 'ai': this._renderAITab(search); break;
    }
  }

  // ── Tab 1: Scene Objects ───────────────────────────

  private _renderSceneTab(search: string): void {
    const store = this._store;
    let actors = Array.from(store.actors.values());

    // Filter
    if (search) {
      actors = actors.filter(a =>
        a.name.toLowerCase().includes(search) ||
        a.className.toLowerCase().includes(search) ||
        a.status.toLowerCase().includes(search) ||
        a.tags.some(t => t.toLowerCase().includes(search))
      );
    }

    // Sort
    const sort = this._tabSorts.scene;
    actors.sort((a: any, b: any) => sortCompare(a[sort.column], b[sort.column], sort.dir));

    if (actors.length === 0) {
      if (!store.isRecording && !store.isReplaying) {
        this._tabContent.innerHTML = '<div class="profiler-empty"><span class="profiler-empty-icon">🎬</span><span>Press Play, then press ● Record to start profiling</span></div>';
      } else if (store.isRecording) {
        this._tabContent.innerHTML = '<div class="profiler-empty"><span class="profiler-empty-icon">⏳</span><span>Recording… waiting for actors in scene</span></div>';
      } else {
        this._tabContent.innerHTML = '<div class="profiler-empty"><span class="profiler-empty-icon">📂</span><span>No actors found in this session</span></div>';
      }
      return;
    }

    const q = this._globalSearch || this._tabSearch;
    const cols = [
      { key: 'name', label: 'Name' },
      { key: 'className', label: 'Class' },
      { key: 'componentCount', label: 'Components' },
      { key: 'tickTimeMs', label: 'Tick ms' },
      { key: 'memoryKB', label: 'Memory KB' },
      { key: 'status', label: 'Status' },
      { key: 'lastEvent', label: 'Last Event' },
      { key: 'spawnedAtFrame', label: 'Spawned At' },
    ];

    let html = '<table class="profiler-table"><thead><tr>';
    for (const c of cols) {
      const isSorted = sort.column === c.key;
      const arrow = isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : '';
      html += `<th class="${isSorted ? 'sorted' : ''}" data-sort="${c.key}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
    }
    html += '</tr></thead><tbody>';

    const MAX_ROWS = 200;
    const displayActors = actors.slice(0, MAX_ROWS);

    for (const a of displayActors) {
      const isNew = store.newlySpawnedIds.has(a.id);
      const isSelected = this._detailOpen && this._detailType === 'actor' && this._detailId === a.id;
      html += `<tr class="${isNew ? 'newly-spawned' : ''} ${isSelected ? 'selected' : ''}" data-actor-id="${a.id}">
        <td>${highlightText(a.name, q)}</td>
        <td>${highlightText(a.className, q)}</td>
        <td>${a.componentCount} <span style="color:#555">${a.components.slice(0, 2).join(', ')}${a.components.length > 2 ? '…' : ''}</span></td>
        <td>${fmtMs(a.tickTimeMs)}${buildMiniBar(store.frameSnapshots.slice(-8).map(() => a.tickTimeMs), '#3498db')}</td>
        <td>${a.memoryKB > 0 ? a.memoryKB.toFixed(1) : '—'}</td>
        <td>${statusBadge(a.status)}</td>
        <td>${a.lastEvent ? eventBadge(a.lastEvent) : '<span style="color:#444">—</span>'}</td>
        <td><span style="color:#555">F${a.spawnedAtFrame}</span> ${fmtTime(a.spawnedAtTime)}</td>
      </tr>`;
    }
    
    if (actors.length > MAX_ROWS) {
      html += `<tr><td colspan="${cols.length}" style="text-align:center; color:#888; padding: 8px;">Showing ${MAX_ROWS} of ${actors.length} actors. Use search to filter.</td></tr>`;
    }
    
    html += '</tbody></table>';
    this._tabContent.innerHTML = html;

    // Wire table events
    this._wireTableSort('scene');
    this._tabContent.querySelectorAll('tr[data-actor-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = Number((row as HTMLElement).dataset.actorId);
        this._openDetail('actor', id);
        if (this._onActorSelect) this._onActorSelect(id);
        this._renderTabContent();
      });
    });
  }

  // ── Tab 2: Classes & Components ────────────────────

  private _renderClassesTab(search: string): void {
    const store = this._store;
    let classes = Array.from(store.classes.values());

    if (search) {
      classes = classes.filter(c =>
        c.className.toLowerCase().includes(search) ||
        c.calledBy.toLowerCase().includes(search)
      );
    }

    const sort = this._tabSorts.classes;
    classes.sort((a: any, b: any) => sortCompare(a[sort.column], b[sort.column], sort.dir));

    if (classes.length === 0) {
      const msg = store.isRecording
        ? 'Recording… classes will appear when actors are tracked'
        : store.isReplaying
        ? 'No class data in this session'
        : 'Press Play, then ● Record to track classes';
      this._tabContent.innerHTML = `<div class="profiler-empty"><span class="profiler-empty-icon">📦</span><span>${msg}</span></div>`;
      return;
    }

    const q = this._globalSearch || this._tabSearch;
    const cols = [
      { key: 'className', label: 'Class Name' },
      { key: 'instances', label: 'Instances' },
      { key: 'firstCalledFrame', label: 'First Called' },
      { key: 'calledBy', label: 'Called By' },
      { key: 'totalCalls', label: 'Total Calls' },
      { key: 'avgExecTimeMs', label: 'Avg Exec ms' },
    ];

    let html = '<table class="profiler-table"><thead><tr>';
    for (const c of cols) {
      const isSorted = sort.column === c.key;
      const arrow = isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : '';
      html += `<th class="${isSorted ? 'sorted' : ''}" data-sort="${c.key}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
    }
    html += '</tr></thead><tbody>';

    const MAX_ROWS = 200;
    const displayClasses = classes.slice(0, MAX_ROWS);

    for (const c of displayClasses) {
      const isSelected = this._detailOpen && this._detailType === 'class' && this._detailId === c.classId;
      html += `<tr class="${isSelected ? 'selected' : ''}" data-class-id="${esc(c.classId)}">
        <td>${highlightText(c.className, q)}</td>
        <td>${c.instances}</td>
        <td><span style="color:#555">F${c.firstCalledFrame}</span> ${fmtTime(c.firstCalledTime)}</td>
        <td>${highlightText(c.calledBy, q)}</td>
        <td>${c.totalCalls}</td>
        <td>${fmtMs(c.avgExecTimeMs)}</td>
      </tr>`;
    }
    
    if (classes.length > MAX_ROWS) {
      html += `<tr><td colspan="${cols.length}" style="text-align:center; color:#888; padding: 8px;">Showing ${MAX_ROWS} of ${classes.length} classes. Use search to filter.</td></tr>`;
    }
    
    html += '</tbody></table>';
    this._tabContent.innerHTML = html;

    this._wireTableSort('classes');
    this._tabContent.querySelectorAll('tr[data-class-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = (row as HTMLElement).dataset.classId!;
        this._openDetail('class', id);
        this._renderTabContent();
      });
    });
  }

  // ── Tab 3: Node Execution ──────────────────────────

  private _renderNodesTab(search: string): void {
    const store = this._store;
    let nodes = Array.from(store.nodeExecs.values());

    if (search) {
      nodes = nodes.filter(n =>
        n.nodeName.toLowerCase().includes(search) ||
        n.nodeType.toLowerCase().includes(search) ||
        n.ownerActorName.toLowerCase().includes(search) ||
        n.ownerGraph.toLowerCase().includes(search)
      );
    }

    const sort = this._tabSorts.nodes;
    nodes.sort((a: any, b: any) => sortCompare(a[sort.column], b[sort.column], sort.dir));

    if (nodes.length === 0) {
      const msg = store.isRecording
        ? 'Recording… node executions will appear when actors tick'
        : store.isReplaying
        ? 'No node execution data in this session'
        : 'Press Play, then ● Record to track node executions';
      this._tabContent.innerHTML = `<div class="profiler-empty"><span class="profiler-empty-icon">⚡</span><span>${msg}</span></div>`;
      return;
    }

    const q = this._globalSearch || this._tabSearch;
    const cols = [
      { key: 'nodeName', label: 'Node Name' },
      { key: 'nodeType', label: 'Type' },
      { key: 'ownerActorName', label: 'Owner Actor' },
      { key: 'ownerGraph', label: 'Owner Graph' },
      { key: 'execCount', label: 'Exec Count' },
      { key: 'avgTimeMs', label: 'Avg Time ms' },
      { key: 'lastCalledFrame', label: 'Last Called' },
      { key: 'triggeredBy', label: 'Triggered By' },
    ];

    let html = '<table class="profiler-table"><thead><tr>';
    for (const c of cols) {
      const isSorted = sort.column === c.key;
      const arrow = isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : '';
      html += `<th class="${isSorted ? 'sorted' : ''}" data-sort="${c.key}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
    }
    html += '</tr></thead><tbody>';

    const MAX_ROWS = 200;
    const displayNodes = nodes.slice(0, MAX_ROWS);

    for (const n of displayNodes) {
      const isSelected = this._detailOpen && this._detailType === 'node' && this._detailId === n.nodeId;
      html += `<tr class="${isSelected ? 'selected' : ''}" data-node-id="${esc(n.nodeId)}">
        <td>${highlightText(n.nodeName, q)}</td>
        <td>${nodeTypeBadge(n.nodeType)}</td>
        <td>${highlightText(n.ownerActorName, q)}</td>
        <td>${highlightText(n.ownerGraph, q)}</td>
        <td>${n.execCount}${buildMiniBar(Array(Math.min(n.execCount, 8)).fill(n.avgTimeMs), '#f39c12')}</td>
        <td>${fmtMs(n.avgTimeMs)}</td>
        <td><span style="color:#555">F${n.lastCalledFrame}</span></td>
        <td>${highlightText(n.triggeredBy, q)}</td>
      </tr>`;
    }
    
    if (nodes.length > MAX_ROWS) {
      html += `<tr><td colspan="${cols.length}" style="text-align:center; color:#888; padding: 8px;">Showing ${MAX_ROWS} of ${nodes.length} nodes. Use search to filter.</td></tr>`;
    }
    
    html += '</tbody></table>';
    this._tabContent.innerHTML = html;

    this._wireTableSort('nodes');
    this._tabContent.querySelectorAll('tr[data-node-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = (row as HTMLElement).dataset.nodeId!;
        this._openDetail('node', id);
        this._renderTabContent();
      });
    });
  }

  // ── Tab 4: Events Log ─────────────────────────────

  private _renderEventsTab(search: string): void {
    const store = this._store;
    let events = [...store.events];

    if (search) {
      events = events.filter(e =>
        e.type.toLowerCase().includes(search) ||
        e.sourceActorName.toLowerCase().includes(search) ||
        e.targetActorName.toLowerCase().includes(search) ||
        e.detail.toLowerCase().includes(search)
      );
    }

    const sort = this._tabSorts.events;
    events.sort((a: any, b: any) => sortCompare(a[sort.column], b[sort.column], sort.dir));

    if (events.length === 0) {
      const msg = store.isRecording
        ? 'Recording… events will appear as they fire'
        : store.isReplaying
        ? 'No events in this session'
        : 'Press Play, then ● Record to track events';
      this._tabContent.innerHTML = `<div class="profiler-empty"><span class="profiler-empty-icon">📋</span><span>${msg}</span></div>`;
      return;
    }

    const q = this._globalSearch || this._tabSearch;
    const cols = [
      { key: 'type', label: 'Type' },
      { key: 'sourceActorName', label: 'Source Actor' },
      { key: 'targetActorName', label: 'Target Actor' },
      { key: 'frame', label: 'Frame' },
      { key: 'time', label: 'Time' },
      { key: 'triggeredNodeCount', label: 'Triggered Nodes' },
      { key: 'detail', label: 'Detail' },
    ];

    let html = '<table class="profiler-table"><thead><tr>';
    for (const c of cols) {
      const isSorted = sort.column === c.key;
      const arrow = isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : '';
      html += `<th class="${isSorted ? 'sorted' : ''}" data-sort="${c.key}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
    }
    html += '</tr></thead><tbody>';

    const MAX_ROWS = 500;
    const displayEvents = events.slice(0, MAX_ROWS);

    for (const e of displayEvents) {
      const isSelected = this._detailOpen && this._detailType === 'event' && this._detailId === e.id;
      html += `<tr class="${isSelected ? 'selected' : ''}" data-event-id="${e.id}" style="border-left:3px solid ${e.color}">
        <td>${eventBadge(e.type)}</td>
        <td>${highlightText(e.sourceActorName || '—', q)}</td>
        <td>${highlightText(e.targetActorName || '—', q)}</td>
        <td><span style="color:#555">F${e.frame}</span></td>
        <td>${fmtTime(e.time)}</td>
        <td>${e.triggeredNodeCount > 0 ? e.triggeredNodeCount : '<span style="color:#444">—</span>'}</td>
        <td style="max-width:300px">${highlightText(e.detail, q)}</td>
      </tr>`;
    }
    
    if (events.length > MAX_ROWS) {
      html += `<tr><td colspan="${cols.length}" style="text-align:center; color:#888; padding: 8px;">Showing ${MAX_ROWS} of ${events.length} events. Use search to filter.</td></tr>`;
    }
    
    html += '</tbody></table>';
    this._tabContent.innerHTML = html;

    this._wireTableSort('events');
    this._tabContent.querySelectorAll('tr[data-event-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = Number((row as HTMLElement).dataset.eventId);
        this._openDetail('event', id);
        this._renderTabContent();
      });
    });
  }

  // ── Tab 5: AI & Blackboard ─────────────────────────────

  private _renderAITab(search: string): void {
    const store = this._store;
    // We filter for AI Blackboard specific events
    let aiEvents = store.events.filter(e => e.type === 'AI_Blackboard_Set' || e.type === 'AI_Blackboard_Clear');

    if (search) {
      aiEvents = aiEvents.filter(e =>
        e.sourceActorName.toLowerCase().includes(search) ||
        e.detail.toLowerCase().includes(search)
      );
    }

    const sort = this._tabSorts.ai;
    aiEvents.sort((a: any, b: any) => sortCompare(a[sort.column], b[sort.column], sort.dir));

    if (aiEvents.length === 0) {
      const msg = store.isRecording
        ? 'Recording… AI actions will appear as they fire'
        : store.isReplaying
        ? 'No AI actions in this session'
        : 'Press Play, then ● Record to track AI';
      this._tabContent.innerHTML = `<div class="profiler-empty"><span class="profiler-empty-icon">🤖</span><span>${msg}</span></div>`;
      return;
    }

    const q = this._globalSearch || this._tabSearch;
    const highlight = (text: string) => {
      if (!q) return text;
      const regex = new RegExp(`(${q})`, 'gi');
      return text.replace(regex, '<mark>$1</mark>');
    };

    let html = '<table class="profiler-table"><thead><tr>';
    html += '<th data-sort="frame">Frame</th>';
    html += '<th data-sort="time">Time</th>';
    html += '<th data-sort="sourceActorName">Actor</th>';
    html += '<th data-sort="detail">Action</th>';
    html += '</tr></thead><tbody>';

    for (const ev of aiEvents) {
      html += `<tr data-event-id="${ev.id}" style="cursor:pointer;">
        <td style="width: 80px;">${ev.frame}</td>
        <td style="width: 80px;">${ev.time.toFixed(2)}s</td>
        <td style="width: 150px;">${highlight(ev.sourceActorName)}</td>
        <td><div style="display:flex; align-items:center; gap:6px;">
          ${highlight(ev.detail)}
        </div></td>
      </tr>`;
    }
    html += '</tbody></table>';
    this._tabContent.innerHTML = html;

    // Wire table sorting & clicking
    this._wireTableSort('ai');
    this._tabContent.querySelectorAll('tr[data-event-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = Number((row as HTMLElement).dataset.eventId);
        this._openDetail('event', id);
        this._renderTabContent();
      });
    });
  }

  // ─────────────────────────────────────────────────────
  //  Table Sorting
  // ─────────────────────────────────────────────────────

  private _wireTableSort(tabId: TabId): void {
    this._tabContent.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = (th as HTMLElement).dataset.sort!;
        const current = this._tabSorts[tabId];
        if (current.column === col) {
          current.dir = current.dir === 'asc' ? 'desc' : 'asc';
        } else {
          this._tabSorts[tabId] = { column: col, dir: 'desc' };
        }
        this._renderTabContent();
      });
    });
  }

  // ─────────────────────────────────────────────────────
  //  Detail Panel
  // ─────────────────────────────────────────────────────

  private _openDetail(type: 'actor' | 'node' | 'event' | 'class', id: string | number): void {
    this._detailType = type;
    this._detailId = id;
    this._detailOpen = true;
    this._detailPanel.classList.add('open');
    this._renderDetail();
  }

  private _closeDetail(): void {
    this._detailOpen = false;
    this._detailType = null;
    this._detailId = null;
    this._detailPanel.classList.remove('open');
    if (this._onActorSelect) this._onActorSelect(null);
    this._renderTabContent();
  }

  private _renderDetail(): void {
    switch (this._detailType) {
      case 'actor': this._renderActorDetail(); break;
      case 'class': this._renderClassDetail(); break;
      case 'node': this._renderNodeDetail(); break;
      case 'event': this._renderEventDetail(); break;
    }
  }

  private _renderActorDetail(): void {
    const actor = this._store.actors.get(this._detailId as number)
      || this._store.destroyedActors.find(a => a.id === this._detailId);
    if (!actor) {
      this._detailTitle.textContent = 'Actor Not Found';
      this._detailBody.innerHTML = '<div class="profiler-empty"><span>Actor data unavailable</span></div>';
      return;
    }

    this._detailTitle.textContent = actor.name;
    let html = '';

    // General info
    html += `<div class="profiler-detail-section">
      <div class="profiler-detail-section-title">Actor Info</div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">ID</span><span class="profiler-detail-row-value">${actor.id}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Name</span><span class="profiler-detail-row-value">${esc(actor.name)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Class</span><span class="profiler-detail-row-value">${esc(actor.className)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Status</span><span class="profiler-detail-row-value">${statusBadge(actor.status)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Position</span><span class="profiler-detail-row-value">(${actor.position.x.toFixed(2)}, ${actor.position.y.toFixed(2)}, ${actor.position.z.toFixed(2)})</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Tick Enabled</span><span class="profiler-detail-row-value">${actor.tickEnabled ? '✓' : '✕'}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Tick Time</span><span class="profiler-detail-row-value">${fmtMs(actor.tickTimeMs)} ms</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Spawned At</span><span class="profiler-detail-row-value">Frame ${actor.spawnedAtFrame} (${fmtTime(actor.spawnedAtTime)})</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Tags</span><span class="profiler-detail-row-value">${actor.tags.length > 0 ? actor.tags.map(t => esc(t)).join(', ') : '—'}</span></div>
    </div>`;

    // Component tree
    html += `<div class="profiler-detail-section">
      <div class="profiler-detail-section-title">Components (${actor.components.length})</div>
      <ul class="profiler-comp-tree">`;
    for (const comp of actor.components) {
      const [type, name] = comp.includes(':') ? comp.split(':') : ['Component', comp];
      let iconColor = '#95a5a6';
      if (type === 'Script') iconColor = '#e74c3c';
      else if (type === 'Mesh') iconColor = '#3498db';
      else if (type === 'Trigger') iconColor = '#2ecc71';
      else if (type === 'Light') iconColor = '#f1c40f';
      html += `<li class="profiler-comp-tree-item"><span class="profiler-comp-tree-icon" style="background:${iconColor}"></span>${esc(name || comp)}</li>`;
    }
    html += '</ul></div>';

    // Live Variables
    if (this._store.fetchActorVariables && actor.status !== 'DESTROYING') {
      const vars = this._store.fetchActorVariables(actor.id);
      if (vars && Object.keys(vars).length > 0) {
        html += `<div class="profiler-detail-section">
          <div class="profiler-detail-section-title" style="color: #2ecc71;">Live Variables (Watch)</div>`;
        for (const [key, val] of Object.entries(vars)) {
          let displayVal = String(val);
          if (typeof val === 'object' && val !== null) {
            if (val.x !== undefined && val.y !== undefined) {
              displayVal = `(${val.x.toFixed(2)}, ${val.y.toFixed(2)}${val.z !== undefined ? `, ${val.z.toFixed(2)}` : ''})`;
            } else {
              displayVal = JSON.stringify(val);
            }
          }
          html += `<div class="profiler-detail-row">
            <span class="profiler-detail-row-label">${esc(key)}</span>
            <span class="profiler-detail-row-value" style="font-family: monospace; color: #f1c40f;">${esc(displayVal)}</span>
          </div>`;
        }
        html += '</div>';
      }
    }

    // Related events
    const actorEvents = this._store.events.filter(
      e => e.sourceActorId === actor.id || e.targetActorId === actor.id
    ).slice(-20);
    if (actorEvents.length > 0) {
      html += `<div class="profiler-detail-section">
        <div class="profiler-detail-section-title">Recent Events (${actorEvents.length})</div>`;
      for (const e of actorEvents) {
        html += `<div class="profiler-detail-row" style="cursor:pointer" data-event-link="${e.id}">
          <span class="profiler-detail-row-label">${eventBadge(e.type)}</span>
          <span class="profiler-detail-row-value" style="font-size:10px">${esc(e.detail)}</span>
        </div>`;
      }
      html += '</div>';
    }

    // Related node executions
    const actorNodes = Array.from(this._store.nodeExecs.values()).filter(n => n.ownerActorId === actor.id);
    if (actorNodes.length > 0) {
      html += `<div class="profiler-detail-section">
        <div class="profiler-detail-section-title">Node Executions (${actorNodes.length})</div>`;
      for (const n of actorNodes.slice(0, 20)) {
        html += `<div class="profiler-detail-row" style="cursor:pointer" data-node-link="${esc(n.nodeId)}">
          <span class="profiler-detail-row-label">${esc(n.nodeName)}</span>
          <span class="profiler-detail-row-value">×${n.execCount} (${fmtMs(n.avgTimeMs)}ms avg)</span>
        </div>`;
      }
      html += '</div>';
    }

    const prevScroll = this._detailBody.scrollTop;
    this._detailBody.innerHTML = html;
    this._detailBody.scrollTop = prevScroll;

    // Wire detail links
    this._detailBody.querySelectorAll('[data-event-link]').forEach(el => {
      el.addEventListener('click', () => {
        const id = Number((el as HTMLElement).dataset.eventLink);
        this._openDetail('event', id);
      });
    });
    this._detailBody.querySelectorAll('[data-node-link]').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.nodeLink!;
        this._openDetail('node', id);
      });
    });
  }

  private _renderClassDetail(): void {
    const cls = this._store.classes.get(this._detailId as string);
    if (!cls) {
      this._detailTitle.textContent = 'Class Not Found';
      this._detailBody.innerHTML = '<div class="profiler-empty"><span>Class data unavailable</span></div>';
      return;
    }

    this._detailTitle.textContent = cls.className;
    let html = `<div class="profiler-detail-section">
      <div class="profiler-detail-section-title">Class Info</div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Name</span><span class="profiler-detail-row-value">${esc(cls.className)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Instances</span><span class="profiler-detail-row-value">${cls.instances}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">First Called</span><span class="profiler-detail-row-value">Frame ${cls.firstCalledFrame} (${fmtTime(cls.firstCalledTime)})</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Called By</span><span class="profiler-detail-row-value">${esc(cls.calledBy)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Total Calls</span><span class="profiler-detail-row-value">${cls.totalCalls}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Avg Exec Time</span><span class="profiler-detail-row-value">${fmtMs(cls.avgExecTimeMs)} ms</span></div>
    </div>`;

    // List actors using this class
    html += `<div class="profiler-detail-section">
      <div class="profiler-detail-section-title">Actor Instances (${cls.instanceActorIds.length})</div>`;
    for (const actorId of cls.instanceActorIds) {
      const actor = this._store.actors.get(actorId);
      html += `<div class="profiler-detail-row" style="cursor:pointer" data-actor-link="${actorId}">
        <span class="profiler-detail-row-label">${actor ? esc(actor.name) : `Actor #${actorId}`}</span>
        <span class="profiler-detail-row-value">${actor ? statusBadge(actor.status) : '<span style="color:#e74c3c">destroyed</span>'}</span>
      </div>`;
    }
    html += '</div>';

    const prevScroll = this._detailBody.scrollTop;
    this._detailBody.innerHTML = html;
    this._detailBody.scrollTop = prevScroll;
    this._detailBody.querySelectorAll('[data-actor-link]').forEach(el => {
      el.addEventListener('click', () => {
        const id = Number((el as HTMLElement).dataset.actorLink);
        this._openDetail('actor', id);
      });
    });
  }

  private _renderNodeDetail(): void {
    const node = this._store.nodeExecs.get(this._detailId as string);
    if (!node) {
      this._detailTitle.textContent = 'Node Not Found';
      this._detailBody.innerHTML = '<div class="profiler-empty"><span>Node data unavailable</span></div>';
      return;
    }

    this._detailTitle.textContent = node.nodeName;
    let html = `<div class="profiler-detail-section">
      <div class="profiler-detail-section-title">Node Info</div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Name</span><span class="profiler-detail-row-value">${esc(node.nodeName)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Type</span><span class="profiler-detail-row-value">${nodeTypeBadge(node.nodeType)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Owner Actor</span><span class="profiler-detail-row-value" style="cursor:pointer;color:#3498db" data-actor-link="${node.ownerActorId}">${esc(node.ownerActorName)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Owner Graph</span><span class="profiler-detail-row-value">${esc(node.ownerGraph)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Exec Count</span><span class="profiler-detail-row-value">${node.execCount}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Total Time</span><span class="profiler-detail-row-value">${fmtMs(node.totalTimeMs)} ms</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Avg Time</span><span class="profiler-detail-row-value">${fmtMs(node.avgTimeMs)} ms</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Last Called</span><span class="profiler-detail-row-value">Frame ${node.lastCalledFrame}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Triggered By</span><span class="profiler-detail-row-value">${esc(node.triggeredBy || '—')}</span></div>
    </div>`;

    // Last inputs
    const inputKeys = Object.keys(node.lastInputs);
    if (inputKeys.length > 0) {
      html += `<div class="profiler-detail-section">
        <div class="profiler-detail-section-title">Last Inputs</div>`;
      for (const key of inputKeys) {
        const val = node.lastInputs[key];
        html += `<div class="profiler-detail-row">
          <span class="profiler-detail-row-label">${esc(key)}</span>
          <span class="profiler-detail-row-value">${esc(typeof val === 'object' ? JSON.stringify(val) : String(val))}</span>
        </div>`;
      }
      html += '</div>';
    }

    // Last outputs
    const outputKeys = Object.keys(node.lastOutputs);
    if (outputKeys.length > 0) {
      html += `<div class="profiler-detail-section">
        <div class="profiler-detail-section-title">Last Outputs</div>`;
      for (const key of outputKeys) {
        const val = node.lastOutputs[key];
        html += `<div class="profiler-detail-row">
          <span class="profiler-detail-row-label">${esc(key)}</span>
          <span class="profiler-detail-row-value">${esc(typeof val === 'object' ? JSON.stringify(val) : String(val))}</span>
        </div>`;
      }
      html += '</div>';
    }

    // Call chain
    if (node.callChain.length > 0) {
      html += `<div class="profiler-detail-section">
        <div class="profiler-detail-section-title">Call Chain</div>
        <ul class="profiler-call-chain">`;
      for (const c of node.callChain) {
        html += `<li class="profiler-call-chain-item">${esc(c)}</li>`;
      }
      html += '</ul></div>';
    }

    const prevScroll = this._detailBody.scrollTop;
    this._detailBody.innerHTML = html;
    this._detailBody.scrollTop = prevScroll;
    this._detailBody.querySelectorAll('[data-actor-link]').forEach(el => {
      el.addEventListener('click', () => {
        const id = Number((el as HTMLElement).dataset.actorLink);
        this._openDetail('actor', id);
      });
    });
  }

  private _renderEventDetail(): void {
    const evt = this._store.events.find(e => e.id === this._detailId);
    if (!evt) {
      this._detailTitle.textContent = 'Event Not Found';
      this._detailBody.innerHTML = '<div class="profiler-empty"><span>Event data unavailable</span></div>';
      return;
    }

    this._detailTitle.textContent = `Event: ${evt.type}`;
    let html = `<div class="profiler-detail-section">
      <div class="profiler-detail-section-title">Event Info</div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Type</span><span class="profiler-detail-row-value">${eventBadge(evt.type)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Source</span><span class="profiler-detail-row-value" ${evt.sourceActorId ? `style="cursor:pointer;color:#3498db" data-actor-link="${evt.sourceActorId}"` : ''}>${esc(evt.sourceActorName || '—')}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Target</span><span class="profiler-detail-row-value" ${evt.targetActorId ? `style="cursor:pointer;color:#3498db" data-actor-link="${evt.targetActorId}"` : ''}>${esc(evt.targetActorName || '—')}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Frame</span><span class="profiler-detail-row-value">${evt.frame}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Time</span><span class="profiler-detail-row-value">${fmtTime(evt.time)}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Triggered Nodes</span><span class="profiler-detail-row-value">${evt.triggeredNodeCount}</span></div>
      <div class="profiler-detail-row"><span class="profiler-detail-row-label">Detail</span><span class="profiler-detail-row-value">${esc(evt.detail)}</span></div>
    </div>`;

    // Payload
    const payloadKeys = Object.keys(evt.payload);
    if (payloadKeys.length > 0) {
      html += `<div class="profiler-detail-section">
        <div class="profiler-detail-section-title">Payload</div>`;
      for (const key of payloadKeys) {
        const val = evt.payload[key];
        let display: string;
        if (val === null || val === undefined) display = 'null';
        else if (typeof val === 'object') display = JSON.stringify(val);
        else display = String(val);
        html += `<div class="profiler-detail-row">
          <span class="profiler-detail-row-label">${esc(key)}</span>
          <span class="profiler-detail-row-value" style="word-break:break-all;white-space:normal;max-width:200px">${esc(display)}</span>
        </div>`;
      }
      html += '</div>';
    }

    const prevScroll = this._detailBody.scrollTop;
    this._detailBody.innerHTML = html;
    this._detailBody.scrollTop = prevScroll;
    this._detailBody.querySelectorAll('[data-actor-link]').forEach(el => {
      el.addEventListener('click', () => {
        const id = Number((el as HTMLElement).dataset.actorLink);
        this._openDetail('actor', id);
      });
    });
  }

  // ─────────────────────────────────────────────────────
  //  Sidebar Resize
  // ─────────────────────────────────────────────────────

  private _setupResize(handle: HTMLElement, sidebar: HTMLElement): void {
    let dragging = false;
    let startX = 0;
    let startW = 0;

    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const newW = Math.max(120, Math.min(400, startW + dx));
      sidebar.style.width = `${newW}px`;
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        document.body.style.cursor = '';
      }
    });
  }
}
