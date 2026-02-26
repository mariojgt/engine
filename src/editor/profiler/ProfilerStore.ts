// ============================================================
//  ProfilerStore — Central data hub for the profiling system.
//  Collects, aggregates, and serves all profiling data.
//  All instrumentation hooks push data here; all UI panels
//  subscribe to updates emitted from here.
// ============================================================

export interface ActorSnapshot {
  id: number;
  name: string;
  className: string;
  actorAssetId: string | null;
  componentCount: number;
  components: string[];
  tags: string[];
  position: { x: number; y: number; z: number };
  parentId: number | null;
  childIds: number[];
  status: 'ACTIVE' | 'IDLE' | 'SPAWNING' | 'DESTROYING';
  tickTimeMs: number;
  drawCalls: number;
  memoryKB: number;
  lastEvent: string;
  spawnedAtFrame: number;
  spawnedAtTime: number;
  trackedSince: number;
  tickEnabled: boolean;
}

export interface ClassRecord {
  className: string;
  classId: string;
  instances: number;
  instanceActorIds: number[];
  firstCalledFrame: number;
  firstCalledTime: number;
  calledBy: string;
  totalCalls: number;
  totalExecTimeMs: number;
  avgExecTimeMs: number;
}

export interface NodeExecRecord {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  ownerActorId: number;
  ownerActorName: string;
  ownerGraph: string;
  execCount: number;
  totalTimeMs: number;
  avgTimeMs: number;
  lastCalledFrame: number;
  triggeredBy: string;
  lastInputs: Record<string, any>;
  lastOutputs: Record<string, any>;
  callChain: string[];
}

export interface EventRecord {
  id: number;
  type: string;
  sourceActorId: number | null;
  sourceActorName: string;
  targetActorId: number | null;
  targetActorName: string;
  frame: number;
  time: number;
  triggeredNodeCount: number;
  detail: string;
  payload: Record<string, any>;
  color: string;
}

export interface FrameSnapshot {
  frame: number;
  time: number;
  fps: number;
  cpuFrameTimeMs: number;
  gpuFrameTimeMs: number;
  memoryMB: number;
  activeActorCount: number;
  nodeExecsThisFrame: number;
  eventsFiredThisFrame: number;
}

export interface ProfilerSessionData {
  id: string;
  name: string;
  sceneName: string;
  startTime: number;
  endTime: number;
  duration: number;
  totalFrames: number;
  engineVersion: string;
  actors: Map<number, ActorSnapshot>;
  destroyedActors: ActorSnapshot[];
  classes: Map<string, ClassRecord>;
  nodeExecs: Map<string, NodeExecRecord>;
  events: EventRecord[];
  frameSnapshots: FrameSnapshot[];
}

export type ProfilerUpdateCallback = () => void;

// ── Event-type color coding ────────────────────────────────
const EVENT_COLORS: Record<string, string> = {
  Collision:  '#e74c3c',
  Trigger:    '#e67e22',
  Input:      '#3498db',
  Spawn:      '#2ecc71',
  Destroy:    '#e74c3c',
  Audio:      '#9b59b6',
  Animation:  '#1abc9c',
  Timer:      '#f1c40f',
  Custom:     '#95a5a6',
  default:    '#7f8c8d',
};

export function getEventColor(type: string): string {
  return EVENT_COLORS[type] || EVENT_COLORS.default;
}

// ── Status colors ──────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  ACTIVE:     '#2ecc71',
  IDLE:       '#95a5a6',
  SPAWNING:   '#f39c12',
  DESTROYING: '#e74c3c',
};

// ── Warning / Critical thresholds ──────────────────────────
export const THRESHOLDS = {
  fps:     { warn: 45, critical: 30 },
  cpuMs:   { warn: 22, critical: 33 },
  gpuMs:   { warn: 16, critical: 25 },
  memMB:   { warn: 512, critical: 1024 },
};

let _nextEventId = 1;

export class ProfilerStore {
  // ── Singleton ─────────────────────────────────────────
  private static _instance: ProfilerStore | null = null;
  static getInstance(): ProfilerStore {
    if (!ProfilerStore._instance) {
      ProfilerStore._instance = new ProfilerStore();
    }
    return ProfilerStore._instance;
  }

  // ── State flags ───────────────────────────────────────
  private _recording = false;
  private _replaying = false;

  // ── Session data (live) ───────────────────────────────
  private _sessionId = '';
  private _sessionName = '';
  private _sceneName = '';
  private _startTime = 0;
  private _frameCount = 0;
  private _lastFrameTime = 0;

  // ── Live data collections ─────────────────────────────
  actors: Map<number, ActorSnapshot> = new Map();
  destroyedActors: ActorSnapshot[] = [];
  classes: Map<string, ClassRecord> = new Map();
  nodeExecs: Map<string, NodeExecRecord> = new Map();
  events: EventRecord[] = [];
  frameSnapshots: FrameSnapshot[] = [];

  // ── Limits ────────────────────────────────────────────
  private readonly MAX_FRAMES = 10000;
  private readonly MAX_EVENTS = 50000;
  private readonly MAX_DESTROYED_ACTORS = 5000;

  // ── Frame-local accumulators (reset each frame) ───────
  private _nodeExecsThisFrame = 0;
  private _eventsFiredThisFrame = 0;
  private _lastGpuTimeMs: number | null = null;

  // ── Sparkline history (last 120 samples) ──────────────
  fpsHistory: number[] = [];
  cpuMsHistory: number[] = [];
  gpuMsHistory: number[] = [];
  memMBHistory: number[] = [];
  actorCountHistory: number[] = [];
  nodeExecHistory: number[] = [];
  eventHistory: number[] = [];

  // ── Subscribers ───────────────────────────────────────
  private _listeners: Set<ProfilerUpdateCallback> = new Set();

  // ── Replay session ────────────────────────────────────
  private _replaySession: ProfilerSessionData | null = null;

  // ── Saved sessions list ───────────────────────────────
  savedSessions: { id: string; name: string; sceneName: string; date: number; duration: number; frames: number }[] = [];

  // ── Live Variable Fetcher (injected by ProfilerHooks) ──
  fetchActorVariables: ((actorId: number) => Record<string, any> | null) | null = null;

  // ── Update timer ──────────────────────────────────────
  private _uiUpdateTimer: ReturnType<typeof setInterval> | null = null;

  // ── Newly spawned actor IDs (for flash highlight) ─────
  newlySpawnedIds: Set<number> = new Set();
  private _spawnFlashTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  private constructor() {
    this._loadSessionList();
  }

  // ═══════════════════════════════════════════════════════
  //  Public API — Recording
  // ═══════════════════════════════════════════════════════

  get isRecording(): boolean { return this._recording; }
  get isReplaying(): boolean { return this._replaying; }
  get currentFrame(): number { return this._frameCount; }
  get elapsedTime(): number { return this._startTime > 0 ? (performance.now() - this._startTime) / 1000 : 0; }
  get sessionName(): string { return this._sessionName; }
  get sceneName(): string { return this._sceneName; }

  startRecording(sceneName: string): void {
    if (this._recording) return;
    this._recording = true;
    this._replaying = false;
    this._replaySession = null;
    this._sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this._sessionName = `Session ${new Date().toLocaleTimeString()}`;
    this._sceneName = sceneName;
    this._startTime = performance.now();
    this._frameCount = 0;
    this._lastFrameTime = performance.now();

    // Reset collections
    this.actors.clear();
    this.destroyedActors = [];
    this.classes.clear();
    this.nodeExecs.clear();
    this.events = [];
    this.frameSnapshots = [];
    this.newlySpawnedIds.clear();
    for (const t of this._spawnFlashTimers.values()) clearTimeout(t);
    this._spawnFlashTimers.clear();

    // Reset sparklines
    this.fpsHistory = [];
    this.cpuMsHistory = [];
    this.gpuMsHistory = [];
    this.memMBHistory = [];
    this.actorCountHistory = [];
    this.nodeExecHistory = [];
    this.eventHistory = [];

    _nextEventId = 1;

    // Start UI update timer (200ms)
    this._uiUpdateTimer = setInterval(() => this._emitUpdate(), 200);

    this._emitUpdate();
  }

  stopRecording(): ProfilerSessionData {
    this._recording = false;
    if (this._uiUpdateTimer) {
      clearInterval(this._uiUpdateTimer);
      this._uiUpdateTimer = null;
    }

    const endTime = performance.now();
    const session: ProfilerSessionData = {
      id: this._sessionId,
      name: this._sessionName,
      sceneName: this._sceneName,
      startTime: this._startTime,
      endTime,
      duration: (endTime - this._startTime) / 1000,
      totalFrames: this._frameCount,
      engineVersion: '1.0.0',
      actors: new Map(this.actors),
      destroyedActors: [...this.destroyedActors],
      classes: new Map(this.classes),
      nodeExecs: new Map(this.nodeExecs),
      events: [...this.events],
      frameSnapshots: [...this.frameSnapshots],
    };

    // Save
    this._saveSession(session);
    this._emitUpdate();
    return session;
  }

  // ═══════════════════════════════════════════════════════
  //  Public API — Replay
  // ═══════════════════════════════════════════════════════

  loadSession(sessionId: string): boolean {
    const json = localStorage.getItem(`profiler_session_${sessionId}`);
    if (!json) return false;
    try {
      const raw = JSON.parse(json);
      const session: ProfilerSessionData = {
        ...raw,
        actors: new Map(Object.entries(raw.actors || {}).map(([k, v]: [string, any]) => [Number(k), v])),
        classes: new Map(Object.entries(raw.classes || {})),
        nodeExecs: new Map(Object.entries(raw.nodeExecs || {})),
      };

      this._replaying = true;
      this._recording = false;
      this._replaySession = session;

      // Copy replay data into live fields so UI renders it
      this.actors = session.actors;
      this.destroyedActors = session.destroyedActors;
      this.classes = session.classes;
      this.nodeExecs = session.nodeExecs;
      this.events = session.events;
      this.frameSnapshots = session.frameSnapshots;
      this._sessionName = session.name;
      this._sceneName = session.sceneName;
      this._frameCount = session.totalFrames;

      // Rebuild sparklines from frame snapshots
      const maxSamples = 120;
      const step = Math.max(1, Math.floor(session.frameSnapshots.length / maxSamples));
      this.fpsHistory = [];
      this.cpuMsHistory = [];
      this.memMBHistory = [];
      this.actorCountHistory = [];
      this.nodeExecHistory = [];
      this.eventHistory = [];
      for (let i = 0; i < session.frameSnapshots.length; i += step) {
        const f = session.frameSnapshots[i];
        this.fpsHistory.push(f.fps);
        this.cpuMsHistory.push(f.cpuFrameTimeMs);
        this.memMBHistory.push(f.memoryMB);
        this.actorCountHistory.push(f.activeActorCount);
        this.nodeExecHistory.push(f.nodeExecsThisFrame);
        this.eventHistory.push(f.eventsFiredThisFrame);
      }

      this._emitUpdate();
      return true;
    } catch (e) {
      console.error('[ProfilerStore] Failed to load session:', e);
      return false;
    }
  }

  exitReplay(): void {
    this._replaying = false;
    this._replaySession = null;
    this.actors.clear();
    this.destroyedActors = [];
    this.classes.clear();
    this.nodeExecs.clear();
    this.events = [];
    this.frameSnapshots = [];
    this._emitUpdate();
  }

  deleteSession(sessionId: string): void {
    localStorage.removeItem(`profiler_session_${sessionId}`);
    this.savedSessions = this.savedSessions.filter(s => s.id !== sessionId);
    this._saveSessionList();
    this._emitUpdate();
  }

  exportSessionJSON(sessionId: string): string | null {
    const json = localStorage.getItem(`profiler_session_${sessionId}`);
    return json || null;
  }

  exportChromeTracingJSON(sessionId: string): string | null {
    const json = localStorage.getItem(`profiler_session_${sessionId}`);
    if (!json) return null;
    try {
      const raw = JSON.parse(json);
      const session: ProfilerSessionData = {
        ...raw,
        actors: new Map(Object.entries(raw.actors || {}).map(([k, v]: [string, any]) => [Number(k), v])),
        classes: new Map(Object.entries(raw.classes || {})),
        nodeExecs: new Map(Object.entries(raw.nodeExecs || {})),
      };

      const traceEvents: any[] = [];
      const pid = 1;
      const tid = 1;

      // Add frame snapshots as counters
      for (const f of session.frameSnapshots) {
        const ts = f.time * 1000000; // seconds to microseconds
        traceEvents.push({
          name: "FPS", ph: "C", ts, pid, tid,
          args: { fps: f.fps }
        });
        traceEvents.push({
          name: "CPU Time", ph: "C", ts, pid, tid,
          args: { ms: f.cpuFrameTimeMs }
        });
        traceEvents.push({
          name: "GPU Time", ph: "C", ts, pid, tid,
          args: { ms: f.gpuFrameTimeMs }
        });
        traceEvents.push({
          name: "Memory", ph: "C", ts, pid, tid,
          args: { MB: f.memoryMB }
        });
      }

      // Add events as instant events
      for (const e of session.events) {
        const ts = e.time * 1000000;
        traceEvents.push({
          name: e.type, cat: "event", ph: "i", ts, pid, tid, s: "g",
          args: { detail: e.detail, source: e.sourceActorName, target: e.targetActorName }
        });
      }

      return JSON.stringify({ traceEvents });
    } catch (e) {
      console.error('[ProfilerStore] Failed to export Chrome Tracing:', e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Data Ingestion — Called by Instrumentation Hooks
  // ═══════════════════════════════════════════════════════

  /** Record actual GPU frame time from WebGL/WebGPU timer queries */
  recordGpuTime(ms: number): void {
    this._lastGpuTimeMs = ms;
  }

  /** Called once per engine frame to advance frame counter and capture metrics */
  onFrame(dt: number, actorCount: number): void {
    if (!this._recording) return;
    this._frameCount++;
    const now = performance.now();
    const cpuMs = now - this._lastFrameTime;
    this._lastFrameTime = now;
    const fps = dt > 0 ? 1 / dt : 0;

    const snap: FrameSnapshot = {
      frame: this._frameCount,
      time: (now - this._startTime) / 1000,
      fps: Math.round(fps),
      cpuFrameTimeMs: Math.round(cpuMs * 100) / 100,
      gpuFrameTimeMs: this._lastGpuTimeMs !== null ? Math.round(this._lastGpuTimeMs * 100) / 100 : Math.round(cpuMs * 0.6 * 100) / 100, // estimate if no real data
      memoryMB: (performance as any).memory
        ? Math.round(((performance as any).memory.usedJSHeapSize / (1024 * 1024)) * 100) / 100
        : 0,
      activeActorCount: actorCount,
      nodeExecsThisFrame: this._nodeExecsThisFrame,
      eventsFiredThisFrame: this._eventsFiredThisFrame,
    };
    this.frameSnapshots.push(snap);
    if (this.frameSnapshots.length > this.MAX_FRAMES) {
      this.frameSnapshots.shift();
    }

    // Push to sparklines (cap at 120)
    this._pushSparkline(this.fpsHistory, snap.fps);
    this._pushSparkline(this.cpuMsHistory, snap.cpuFrameTimeMs);
    this._pushSparkline(this.gpuMsHistory, snap.gpuFrameTimeMs);
    this._pushSparkline(this.memMBHistory, snap.memoryMB);
    this._pushSparkline(this.actorCountHistory, snap.activeActorCount);
    this._pushSparkline(this.nodeExecHistory, snap.nodeExecsThisFrame);
    this._pushSparkline(this.eventHistory, snap.eventsFiredThisFrame);

    // Reset per-frame accumulators
    this._nodeExecsThisFrame = 0;
    this._eventsFiredThisFrame = 0;
    this._lastGpuTimeMs = null;
  }

  /** Register an actor that's in the scene */
  trackActor(
    id: number,
    name: string,
    className: string,
    assetId: string | null,
    components: string[],
    tags: string[],
    position: { x: number; y: number; z: number },
    tickEnabled: boolean,
    isNewSpawn: boolean,
  ): void {
    if (!this._recording) return;

    const existing = this.actors.get(id);
    if (existing) {
      // Update dynamic fields
      existing.position = { ...position };
      existing.tickEnabled = tickEnabled;
      existing.status = tickEnabled ? 'ACTIVE' : 'IDLE';
      existing.componentCount = components.length;
      existing.components = components;
      return;
    }

    const snap: ActorSnapshot = {
      id,
      name,
      className,
      actorAssetId: assetId,
      componentCount: components.length,
      components,
      tags,
      position: { ...position },
      parentId: null,
      childIds: [],
      status: isNewSpawn ? 'SPAWNING' : (tickEnabled ? 'ACTIVE' : 'IDLE'),
      tickTimeMs: 0,
      drawCalls: 0,
      memoryKB: 0,
      lastEvent: '',
      spawnedAtFrame: this._frameCount,
      spawnedAtTime: (performance.now() - this._startTime) / 1000,
      trackedSince: (performance.now() - this._startTime) / 1000,
      tickEnabled,
    };
    this.actors.set(id, snap);

    if (isNewSpawn) {
      this.newlySpawnedIds.add(id);
      // Clear flash after 2 seconds
      const timer = setTimeout(() => {
        this.newlySpawnedIds.delete(id);
        this._spawnFlashTimers.delete(id);
      }, 2000);
      this._spawnFlashTimers.set(id, timer);

      // Transition to ACTIVE status after brief SPAWNING period
      setTimeout(() => {
        const a = this.actors.get(id);
        if (a && a.status === 'SPAWNING') {
          a.status = tickEnabled ? 'ACTIVE' : 'IDLE';
        }
      }, 500);
    }
  }

  /** Mark actor tick duration for this frame */
  recordActorTick(actorId: number, durationMs: number): void {
    if (!this._recording) return;
    const a = this.actors.get(actorId);
    if (a) {
      a.tickTimeMs = Math.round(durationMs * 1000) / 1000;
    }
  }

  /** Actor destroyed */
  onActorDestroyed(actorId: number): void {
    if (!this._recording) return;
    const a = this.actors.get(actorId);
    if (a) {
      a.status = 'DESTROYING';
      this.destroyedActors.push({ ...a });
      if (this.destroyedActors.length > this.MAX_DESTROYED_ACTORS) {
        this.destroyedActors.shift();
      }
      this.actors.delete(actorId);

      this.logEvent({
        type: 'Destroy',
        sourceActorId: actorId,
        sourceActorName: a.name,
        targetActorId: null,
        targetActorName: '',
        detail: `Actor "${a.name}" (${a.className}) destroyed`,
        payload: { actorId, className: a.className },
        triggeredNodeCount: 0,
      });
    }
  }

  /** Actor spawned mid-session */
  onActorSpawned(
    id: number,
    name: string,
    className: string,
    assetId: string | null,
    components: string[],
    position: { x: number; y: number; z: number },
  ): void {
    if (!this._recording) return;
    this.trackActor(id, name, className, assetId, components, [], position, true, true);

    this.logEvent({
      type: 'Spawn',
      sourceActorId: id,
      sourceActorName: name,
      targetActorId: null,
      targetActorName: '',
      detail: `Actor "${name}" (${className}) spawned`,
      payload: { actorId: id, className, position },
      triggeredNodeCount: 0,
    });
  }

  /** Record a class instantiation */
  recordClassInstantiation(className: string, classId: string, actorId: number, calledBy: string): void {
    if (!this._recording) return;
    const existing = this.classes.get(classId);
    if (existing) {
      existing.instances++;
      existing.totalCalls++;
      if (!existing.instanceActorIds.includes(actorId)) {
        existing.instanceActorIds.push(actorId);
      }
    } else {
      this.classes.set(classId, {
        className,
        classId,
        instances: 1,
        instanceActorIds: [actorId],
        firstCalledFrame: this._frameCount,
        firstCalledTime: (performance.now() - this._startTime) / 1000,
        calledBy,
        totalCalls: 1,
        totalExecTimeMs: 0,
        avgExecTimeMs: 0,
      });
    }
  }

  /** Record a node execution */
  recordNodeExec(
    nodeKey: string,
    nodeName: string,
    nodeType: string,
    ownerActorId: number,
    ownerActorName: string,
    ownerGraph: string,
    durationMs: number,
    triggeredBy: string,
    inputs: Record<string, any>,
    outputs: Record<string, any>,
  ): void {
    if (!this._recording) return;
    this._nodeExecsThisFrame++;

    const existing = this.nodeExecs.get(nodeKey);
    if (existing) {
      existing.execCount++;
      existing.totalTimeMs += durationMs;
      existing.avgTimeMs = existing.totalTimeMs / existing.execCount;
      existing.lastCalledFrame = this._frameCount;
      existing.triggeredBy = triggeredBy;
      existing.lastInputs = inputs;
      existing.lastOutputs = outputs;
    } else {
      this.nodeExecs.set(nodeKey, {
        nodeId: nodeKey,
        nodeName,
        nodeType,
        ownerActorId,
        ownerActorName,
        ownerGraph,
        execCount: 1,
        totalTimeMs: durationMs,
        avgTimeMs: durationMs,
        lastCalledFrame: this._frameCount,
        triggeredBy,
        lastInputs: inputs,
        lastOutputs: outputs,
        callChain: triggeredBy ? [triggeredBy] : [],
      });
    }
  }

  /** Log an event */
  logEvent(ev: Omit<EventRecord, 'id' | 'frame' | 'time' | 'color'>): void {
    if (!this._recording) return;
    this._eventsFiredThisFrame++;

    const record: EventRecord = {
      id: _nextEventId++,
      frame: this._frameCount,
      time: Math.round(((performance.now() - this._startTime) / 1000) * 1000) / 1000,
      color: getEventColor(ev.type),
      ...ev,
    };
    this.events.push(record);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.shift();
    }

    // Update actor's last event
    if (ev.sourceActorId != null) {
      const a = this.actors.get(ev.sourceActorId);
      if (a) a.lastEvent = ev.type;
    }
    if (ev.targetActorId != null) {
      const a = this.actors.get(ev.targetActorId);
      if (a) a.lastEvent = ev.type;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Subscribers
  // ═══════════════════════════════════════════════════════

  subscribe(cb: ProfilerUpdateCallback): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  private _emitUpdate(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[ProfilerStore] listener error:', e); }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Internal Helpers
  // ═══════════════════════════════════════════════════════

  private _pushSparkline(arr: number[], val: number): void {
    arr.push(val);
    if (arr.length > 120) arr.shift();
  }

  private _saveSession(session: ProfilerSessionData): void {
    try {
      const serializable = {
        ...session,
        actors: Object.fromEntries(session.actors),
        classes: Object.fromEntries(session.classes),
        nodeExecs: Object.fromEntries(session.nodeExecs),
      };
      localStorage.setItem(`profiler_session_${session.id}`, JSON.stringify(serializable));

      this.savedSessions.push({
        id: session.id,
        name: session.name,
        sceneName: session.sceneName,
        date: Date.now(),
        duration: session.duration,
        frames: session.totalFrames,
      });
      this._saveSessionList();
    } catch (e) {
      console.error('[ProfilerStore] Failed to save session:', e);
    }
  }

  private _saveSessionList(): void {
    try {
      localStorage.setItem('profiler_sessions', JSON.stringify(this.savedSessions));
    } catch { /* quota exceeded */ }
  }

  private _loadSessionList(): void {
    try {
      const json = localStorage.getItem('profiler_sessions');
      if (json) this.savedSessions = JSON.parse(json);
    } catch { /* corrupted */ }
  }

  /** Full reset (useful when profiler panel closes) */
  reset(): void {
    this._recording = false;
    this._replaying = false;
    if (this._uiUpdateTimer) {
      clearInterval(this._uiUpdateTimer);
      this._uiUpdateTimer = null;
    }
    this.actors.clear();
    this.destroyedActors = [];
    this.classes.clear();
    this.nodeExecs.clear();
    this.events = [];
    this.frameSnapshots = [];
    this.newlySpawnedIds.clear();
    for (const t of this._spawnFlashTimers.values()) clearTimeout(t);
    this._spawnFlashTimers.clear();
    this._emitUpdate();
  }
}
