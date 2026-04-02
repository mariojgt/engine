// ============================================================
//  AudioSystem — Web Audio API wrapper for the Feather Engine
//
//  Provides:
//  • AudioEngine  — singleton managing the AudioContext, listener,
//                   mixer buses, and all active AudioSource instances
//  • AudioSource  — an individual sound (2D or 3D spatial)
//  • AudioBus     — a mixer group (SFX, Music, Ambient, UI)
//
//  Designed for runtime use during Play mode.  The editor never
//  touches this — it only wires up blueprint nodes that call into
//  AudioEngine methods.
// ============================================================

// ── Types ────────────────────────────────────────────────────

export interface AudioPlayOptions {
  /** Volume 0–1 (default 1) */
  volume?: number;
  /** Pitch / playback-rate multiplier (default 1) */
  pitch?: number;
  /** Start time in seconds into the clip (default 0) */
  startTime?: number;
  /** Loop the sound (default false) */
  loop?: boolean;
  /** Mixer bus name (default 'SFX') */
  bus?: string;
  /** If true, apply 3D spatial panning at the given position */
  spatial?: boolean;
  /** World position for spatial sounds */
  position?: { x: number; y: number; z: number };
  /** Max distance for spatial falloff (default 50) */
  maxDistance?: number;
  /** Rolloff factor (default 1) */
  rolloffFactor?: number;
  /** Fade-in duration in seconds (default 0) */
  fadeInDuration?: number;
}

// ── AudioBus (mixer group) ──────────────────────────────────

export class AudioBus {
  public readonly name: string;
  public readonly gainNode: GainNode;

  private _volume = 1;
  private _muted = false;

  constructor(ctx: AudioContext, name: string, destination: AudioNode) {
    this.name = name;
    this.gainNode = ctx.createGain();
    this.gainNode.connect(destination);
  }

  get volume(): number { return this._volume; }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(v, 2));
    if (!this._muted) {
      this.gainNode.gain.setTargetAtTime(this._volume, this.gainNode.context.currentTime, 0.02);
    }
  }

  get muted(): boolean { return this._muted; }
  set muted(m: boolean) {
    this._muted = m;
    this.gainNode.gain.setTargetAtTime(
      m ? 0 : this._volume,
      this.gainNode.context.currentTime,
      0.02,
    );
  }
}

// ── AudioSource (one playing sound) ─────────────────────────

export class AudioSource {
  public readonly id: number;
  public readonly url: string;
  public loop: boolean;

  private _ctx: AudioContext;
  private _buffer: AudioBuffer | null = null;
  private _sourceNode: AudioBufferSourceNode | null = null;
  private _gainNode: GainNode;
  private _pannerNode: PannerNode | null = null;
  private _bus: AudioBus;
  private _volume = 1;
  private _pitch = 1;
  private _playing = false;
  private _startedAt = 0;
  private _pausedAt = 0;

  /** Callbacks for when the sound finishes naturally */
  public onFinished: (() => void) | null = null;

  constructor(
    id: number,
    ctx: AudioContext,
    url: string,
    bus: AudioBus,
    options: AudioPlayOptions = {},
  ) {
    this.id = id;
    this.url = url;
    this._ctx = ctx;
    this._bus = bus;
    this.loop = options.loop ?? false;

    // Per-source gain
    this._gainNode = ctx.createGain();

    // Spatial panner (optional)
    if (options.spatial) {
      this._pannerNode = ctx.createPanner();
      this._pannerNode.panningModel = 'HRTF';
      this._pannerNode.distanceModel = 'inverse';
      this._pannerNode.maxDistance = options.maxDistance ?? 50;
      this._pannerNode.rolloffFactor = options.rolloffFactor ?? 1;
      this._pannerNode.refDistance = 1;
      if (options.position) {
        this._pannerNode.positionX.value = options.position.x;
        this._pannerNode.positionY.value = options.position.y;
        this._pannerNode.positionZ.value = options.position.z;
      }
      this._gainNode.connect(this._pannerNode);
      this._pannerNode.connect(bus.gainNode);
    } else {
      this._gainNode.connect(bus.gainNode);
    }

    this._volume = options.volume ?? 1;
    this._pitch = options.pitch ?? 1;
    this._gainNode.gain.value = this._volume;
  }

  get volume(): number { return this._volume; }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(v, 2));
    this._gainNode.gain.setTargetAtTime(this._volume, this._ctx.currentTime, 0.02);
  }

  get pitch(): number { return this._pitch; }
  set pitch(p: number) {
    this._pitch = Math.max(0.1, Math.min(p, 4));
    if (this._sourceNode) {
      this._sourceNode.playbackRate.setTargetAtTime(this._pitch, this._ctx.currentTime, 0.02);
    }
  }

  get playing(): boolean { return this._playing; }

  /** Set the 3D world position (only meaningful for spatial sources) */
  setPosition(x: number, y: number, z: number): void {
    if (!this._pannerNode) return;
    this._pannerNode.positionX.value = x;
    this._pannerNode.positionY.value = y;
    this._pannerNode.positionZ.value = z;
  }

  /** Start playback (called internally by AudioEngine after buffer is loaded) */
  _play(buffer: AudioBuffer, startTime: number, fadeIn: number): void {
    this._buffer = buffer;
    this._sourceNode = this._ctx.createBufferSource();
    this._sourceNode.buffer = buffer;
    this._sourceNode.loop = this.loop;
    this._sourceNode.playbackRate.value = this._pitch;
    this._sourceNode.connect(this._gainNode);

    // Fade-in
    if (fadeIn > 0) {
      this._gainNode.gain.setValueAtTime(0, this._ctx.currentTime);
      this._gainNode.gain.linearRampToValueAtTime(this._volume, this._ctx.currentTime + fadeIn);
    }

    this._sourceNode.onended = () => {
      if (this._playing) {
        this._playing = false;
        if (this.onFinished) this.onFinished();
      }
    };

    this._sourceNode.start(0, startTime);
    this._startedAt = this._ctx.currentTime - startTime;
    this._pausedAt = 0;
    this._playing = true;
  }

  /** Pause playback */
  pause(): void {
    if (!this._playing || !this._sourceNode) return;
    this._pausedAt = this._ctx.currentTime - this._startedAt;
    this._sourceNode.onended = null;
    this._sourceNode.stop();
    this._sourceNode.disconnect();
    this._sourceNode = null;
    this._playing = false;
  }

  /** Resume from where we paused */
  resume(): void {
    if (this._playing || !this._buffer || this._pausedAt === 0) return;
    this._play(this._buffer, this._pausedAt, 0);
  }

  /** Stop playback completely */
  stop(fadeOut = 0): void {
    if (!this._sourceNode) {
      this._playing = false;
      return;
    }
    if (fadeOut > 0) {
      this._gainNode.gain.setTargetAtTime(0, this._ctx.currentTime, fadeOut / 3);
      setTimeout(() => this._hardStop(), fadeOut * 1000);
    } else {
      this._hardStop();
    }
  }

  private _hardStop(): void {
    if (this._sourceNode) {
      this._sourceNode.onended = null;
      try { this._sourceNode.stop(); } catch { /* already stopped */ }
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }
    const wasPlaying = this._playing;
    this._playing = false;
    this._pausedAt = 0;
    // Fire onFinished so callers (e.g. AudioEngine.stopSource with fadeOut) can clean up
    if (wasPlaying && this.onFinished) this.onFinished();
  }

  /** Clean up all Web Audio nodes */
  dispose(): void {
    this._hardStop();
    this._gainNode.disconnect();
    if (this._pannerNode) this._pannerNode.disconnect();
  }
}

// ── AudioEngine (singleton) ─────────────────────────────────

export class AudioEngine {
  private _ctx: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _buses: Map<string, AudioBus> = new Map();
  private _sources: Map<number, AudioSource> = new Map();
  private _bufferCache: Map<string, AudioBuffer> = new Map();
  private static readonly MAX_BUFFER_CACHE = 128;
  private _nextSourceId = 1;
  private _masterVolume = 1;
  private _initialized = false;

  // ── Lifecycle ───────────────────────────────────────────

  /** Initialize the audio context. Must be called after a user gesture. */
  init(): void {
    if (this._initialized) return;
    try {
      this._ctx = new AudioContext();
      this._masterGain = this._ctx.createGain();
      this._masterGain.connect(this._ctx.destination);

      // Create default buses
      this._createBus('Master');
      this._createBus('SFX');
      this._createBus('Music');
      this._createBus('Ambient');
      this._createBus('UI');

      this._initialized = true;
      console.log('[AudioEngine] Initialized — sample rate:', this._ctx.sampleRate);
    } catch (e) {
      console.error('[AudioEngine] Failed to initialize:', e);
    }
  }

  /** Destroy all sources, buses, and close the context */
  destroy(): void {
    this.stopAll();
    for (const [, src] of this._sources) {
      src.dispose();
    }
    this._sources.clear();
    this._buses.clear();
    this._bufferCache.clear();
    if (this._ctx && this._ctx.state !== 'closed') {
      this._ctx.close().catch(() => {});
    }
    this._ctx = null;
    this._masterGain = null;
    this._initialized = false;
    this._nextSourceId = 1;
    console.log('[AudioEngine] Destroyed');
  }

  get initialized(): boolean { return this._initialized; }

  // ── Resume context (required after user gesture on some browsers) ──

  /** Resume a suspended AudioContext (call on first user interaction) */
  async resume(): Promise<void> {
    if (this._ctx && this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  // ── Master Volume ─────────────────────────────────────────

  get masterVolume(): number { return this._masterVolume; }
  set masterVolume(v: number) {
    this._masterVolume = Math.max(0, Math.min(v, 2));
    if (this._masterGain && this._ctx) {
      this._masterGain.gain.setTargetAtTime(this._masterVolume, this._ctx.currentTime, 0.02);
    }
  }

  // ── Bus Management ────────────────────────────────────────

  private _createBus(name: string): AudioBus {
    if (!this._ctx || !this._masterGain) throw new Error('AudioEngine not initialized');
    const bus = new AudioBus(this._ctx, name, this._masterGain);
    this._buses.set(name, bus);
    return bus;
  }

  getBus(name: string): AudioBus | undefined {
    return this._buses.get(name);
  }

  setBusVolume(busName: string, volume: number): void {
    const bus = this._buses.get(busName);
    if (bus) bus.volume = volume;
  }

  setBusMuted(busName: string, muted: boolean): void {
    const bus = this._buses.get(busName);
    if (bus) bus.muted = muted;
  }

  // ── Listener (3D audio) ───────────────────────────────────

  /** Update the listener position (typically called from camera each frame) */
  setListenerPosition(x: number, y: number, z: number): void {
    if (!this._ctx) return;
    const l = this._ctx.listener;
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
    }
  }

  /** Update the listener orientation */
  setListenerOrientation(
    forwardX: number, forwardY: number, forwardZ: number,
    upX: number, upY: number, upZ: number,
  ): void {
    if (!this._ctx) return;
    const l = this._ctx.listener;
    if (l.forwardX) {
      l.forwardX.value = forwardX;
      l.forwardY.value = forwardY;
      l.forwardZ.value = forwardZ;
      l.upX.value = upX;
      l.upY.value = upY;
      l.upZ.value = upZ;
    }
  }

  // ── Buffer Loading ────────────────────────────────────────

  /** Load (or retrieve cached) an AudioBuffer from a URL / data URI */
  private async _loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this._ctx) return null;

    // Check cache
    const cached = this._bufferCache.get(url);
    if (cached) return cached;

    try {
      let arrayBuffer: ArrayBuffer;

      if (url.startsWith('data:')) {
        // Data URI — decode from base64
        const base64 = url.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        arrayBuffer = bytes.buffer;
      } else {
        // Fetch from URL
        const resp = await fetch(url);
        if (!resp.ok) {
          console.warn(`[AudioEngine] Failed to fetch "${url}": ${resp.status}`);
          return null;
        }
        arrayBuffer = await resp.arrayBuffer();
      }

      const buffer = await this._ctx.decodeAudioData(arrayBuffer);
      // Evict oldest entry if cache is full (Map iterates in insertion order)
      if (this._bufferCache.size >= AudioEngine.MAX_BUFFER_CACHE) {
        const oldestKey = this._bufferCache.keys().next().value!;
        this._bufferCache.delete(oldestKey);
      }
      this._bufferCache.set(url, buffer);
      return buffer;
    } catch (e) {
      console.error(`[AudioEngine] Failed to load audio "${url}":`, e);
      return null;
    }
  }

  // ── Play / Spawn ──────────────────────────────────────────

  /**
   * Play a 2D (non-spatial) sound.
   * Returns the AudioSource id, or -1 on failure.
   */
  async playSound2D(url: string, options: AudioPlayOptions = {}): Promise<number> {
    if (!this._ctx || !this._initialized) return -1;
    await this.resume();

    const buffer = await this._loadBuffer(url);
    if (!buffer) return -1;

    const busName = options.bus ?? 'SFX';
    let bus = this._buses.get(busName);
    if (!bus) bus = this._buses.get('SFX')!;

    const id = this._nextSourceId++;
    const src = new AudioSource(id, this._ctx, url, bus, { ...options, spatial: false });
    this._sources.set(id, src);

    src.onFinished = () => {
      this._sources.delete(id);
      src.dispose();
    };

    src._play(buffer, options.startTime ?? 0, options.fadeInDuration ?? 0);
    return id;
  }

  /**
   * Play a 3D spatial sound at a world position.
   * Returns the AudioSource id, or -1 on failure.
   */
  async playSoundAtLocation(
    url: string,
    position: { x: number; y: number; z: number },
    options: AudioPlayOptions = {},
  ): Promise<number> {
    if (!this._ctx || !this._initialized) return -1;
    await this.resume();

    const buffer = await this._loadBuffer(url);
    if (!buffer) return -1;

    const busName = options.bus ?? 'SFX';
    let bus = this._buses.get(busName);
    if (!bus) bus = this._buses.get('SFX')!;

    const id = this._nextSourceId++;
    const src = new AudioSource(id, this._ctx, url, bus, {
      ...options,
      spatial: true,
      position,
    });
    this._sources.set(id, src);

    src.onFinished = () => {
      this._sources.delete(id);
      src.dispose();
    };

    src._play(buffer, options.startTime ?? 0, options.fadeInDuration ?? 0);
    return id;
  }

  // ── Source Control ────────────────────────────────────────

  /** Get an active AudioSource by id */
  getSource(id: number): AudioSource | undefined {
    return this._sources.get(id);
  }

  /** Stop a specific source by id */
  stopSource(id: number, fadeOut = 0): void {
    const src = this._sources.get(id);
    if (!src) return;
    if (fadeOut > 0) {
      // Clean up after fade completes so the source doesn't leak in the map
      const prevOnFinished = src.onFinished;
      src.onFinished = () => {
        prevOnFinished?.();
        this._sources.delete(id);
        src.dispose();
      };
      src.stop(fadeOut);
    } else {
      src.stop(0);
      this._sources.delete(id);
      src.dispose();
    }
  }

  /** Pause a specific source */
  pauseSource(id: number): void {
    const src = this._sources.get(id);
    if (src) src.pause();
  }

  /** Resume a specific source */
  resumeSource(id: number): void {
    const src = this._sources.get(id);
    if (src) src.resume();
  }

  /** Set volume on a specific source */
  setSourceVolume(id: number, volume: number): void {
    const src = this._sources.get(id);
    if (src) src.volume = volume;
  }

  /** Set pitch on a specific source */
  setSourcePitch(id: number, pitch: number): void {
    const src = this._sources.get(id);
    if (src) src.pitch = pitch;
  }

  /** Set 3D position of a specific source */
  setSourcePosition(id: number, x: number, y: number, z: number): void {
    const src = this._sources.get(id);
    if (src) src.setPosition(x, y, z);
  }

  /** Check if a source is currently playing */
  isPlaying(id: number): boolean {
    const src = this._sources.get(id);
    return src ? src.playing : false;
  }

  // ── Bulk Control ──────────────────────────────────────────

  /** Stop all currently playing sounds */
  stopAll(fadeOut = 0): void {
    for (const [id, src] of this._sources) {
      if (fadeOut > 0) {
        src.onFinished = () => {
          this._sources.delete(id);
          src.dispose();
        };
        src.stop(fadeOut);
      } else {
        src.stop(0);
        src.dispose();
      }
    }
    if (fadeOut <= 0) {
      this._sources.clear();
    }
  }

  /** Pause all currently playing sounds */
  pauseAll(): void {
    for (const [, src] of this._sources) {
      src.pause();
    }
  }

  /** Resume all paused sounds */
  resumeAll(): void {
    for (const [, src] of this._sources) {
      src.resume();
    }
  }

  /** Get the count of currently active sources */
  get activeSourceCount(): number {
    return this._sources.size;
  }

  // ── Sound Cue Resolution ──
  // At runtime, the SoundLibrary resolves a Sound Cue ID to a URL + overrides.
  // This bridge is set by the editor when starting gameplay.

  private _soundCueResolver: ((cueId: string) => { url: string; volume: number; pitch: number } | null) | null = null;

  /** Set the Sound Cue resolver (called by editor before gameplay starts) */
  setSoundCueResolver(resolver: (cueId: string) => { url: string; volume: number; pitch: number } | null): void {
    this._soundCueResolver = resolver;
  }

  /** Resolve a Sound Cue ID to a playable result. Returns raw URL if not a cue ID. */
  resolveSoundCue(cueIdOrUrl: string): { url: string; volume: number; pitch: number } {
    // If it looks like a cue ID and the resolver is set, try to resolve
    if (this._soundCueResolver && cueIdOrUrl.startsWith('cue_')) {
      const resolved = this._soundCueResolver(cueIdOrUrl);
      if (resolved) return resolved;
    }
    // Fallback: treat as raw URL (backward compat)
    return { url: cueIdOrUrl, volume: 1, pitch: 1 };
  }

  /** Play a Sound Cue (or raw URL) as a 2D sound */
  async playSoundCue2D(cueIdOrUrl: string, options?: Partial<AudioPlayOptions>): Promise<number> {
    const resolved = this.resolveSoundCue(cueIdOrUrl);
    const mergedOptions: Partial<AudioPlayOptions> = {
      ...options,
      volume: (options?.volume ?? 1) * resolved.volume,
      pitch: (options?.pitch ?? 1) * resolved.pitch,
    };
    return this.playSound2D(resolved.url, mergedOptions);
  }

  /** Play a Sound Cue (or raw URL) at a spatial location */
  async playSoundCueAtLocation(
    cueIdOrUrl: string,
    position: { x: number; y: number; z: number },
    options?: Partial<AudioPlayOptions>,
  ): Promise<number> {
    const resolved = this.resolveSoundCue(cueIdOrUrl);
    const mergedOptions: Partial<AudioPlayOptions> = {
      ...options,
      volume: (options?.volume ?? 1) * resolved.volume,
      pitch: (options?.pitch ?? 1) * resolved.pitch,
    };
    return this.playSoundAtLocation(resolved.url, position, mergedOptions);
  }
}
