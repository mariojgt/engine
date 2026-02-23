// ============================================================
//  SoundLibrary — Audio asset import, storage, and management
//  Supports MP3, WAV, OGG, FLAC, WEBM, AAC audio files.
//  Features: waveform thumbnails, metadata extraction, caching.
// ============================================================

// ---- Unique ID helper ----
let _sndUid = 0;
function sndUid(): string {
  return 'snd_' + Date.now().toString(36) + '_' + (++_sndUid).toString(36);
}

// ============================================================
//  Sound Asset Interfaces
// ============================================================

export type SoundCategory = 'SFX' | 'Music' | 'Ambient' | 'UI' | 'Voice';

export interface SoundSettings {
  /** Default volume (0–1) */
  defaultVolume: number;
  /** Default pitch multiplier */
  defaultPitch: number;
  /** Whether the sound loops by default */
  loop: boolean;
  /** Audio bus name (SFX, Music, Ambient, UI, Master) */
  bus: string;
}

export interface SoundMetadata {
  duration: number;       // seconds
  sampleRate: number;
  numberOfChannels: number;
  fileSize: number;       // bytes
  format: string;         // mp3, wav, ogg, etc.
}

export interface SoundAssetData {
  assetId: string;
  assetType: 'sound';
  assetName: string;
  sourceFile: string;
  category: SoundCategory;
  settings: SoundSettings;
  metadata: SoundMetadata;
  thumbnail: string;      // waveform data URL
  storedData: string;     // audio data URL
}

export function defaultSoundSettings(): SoundSettings {
  return {
    defaultVolume: 1.0,
    defaultPitch: 1.0,
    loop: false,
    bus: 'SFX',
  };
}

// ============================================================
//  Sound Cue Interfaces — Unreal Engine-style Sound Cue system
// ============================================================

export type SoundCuePlayMode = 'single' | 'random' | 'sequence' | 'shuffle';

export interface SoundCueEntry {
  /** Reference to a SoundAssetData.assetId */
  soundAssetId: string;
  /** Weight for random selection (0–1) */
  weight: number;
  /** Volume override (multiplied with sound default) */
  volumeMultiplier: number;
  /** Pitch override range — random between min and max */
  pitchMin: number;
  pitchMax: number;
}

// ============================================================
//  Sound Cue Node Graph — visual node-based audio graph
// ============================================================

export type SCNodeType = 'output' | 'wavePlayer' | 'random' | 'modulator' | 'mixer';

export interface SCNodeBase {
  id: string;
  type: SCNodeType;
  x: number;
  y: number;
}

export interface SCWavePlayerNode extends SCNodeBase {
  type: 'wavePlayer';
  soundAssetId: string;
  volume: number;
  pitchMin: number;
  pitchMax: number;
}

export interface SCRandomNode extends SCNodeBase {
  type: 'random';
  weights: number[];
}

export interface SCModulatorNode extends SCNodeBase {
  type: 'modulator';
  volumeMin: number;
  volumeMax: number;
  pitchMin: number;
  pitchMax: number;
}

export interface SCMixerNode extends SCNodeBase {
  type: 'mixer';
}

export interface SCOutputNode extends SCNodeBase {
  type: 'output';
  bus: string;
  volume: number;
  pitch: number;
  loop: boolean;
  maxConcurrency: number;
  fadeIn: number;
  fadeOut: number;
}

export type SCNode = SCWavePlayerNode | SCRandomNode | SCModulatorNode | SCMixerNode | SCOutputNode;

export interface SCConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  toInputIndex: number;
}

export interface SoundCueData {
  assetId: string;
  assetType: 'soundCue';
  assetName: string;
  /** Node graph */
  nodes: SCNode[];
  connections: SCConnection[];
  // ── Legacy fields (kept for migration / backward compat) ──
  playMode?: SoundCuePlayMode;
  entries?: SoundCueEntry[];
  volumeMultiplier?: number;
  pitchMultiplier?: number;
  bus?: string;
  attenuation?: { enabled: boolean; maxDistance: number; rolloffFactor: number };
  loop?: boolean;
  maxConcurrency?: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  _sequenceIndex?: number;
  _shuffleOrder?: number[];
}

export function defaultSoundCueData(name: string): SoundCueData {
  return {
    assetId: sndUid().replace('snd_', 'cue_'),
    assetType: 'soundCue',
    assetName: name,
    nodes: [{
      id: sndUid().replace('snd_', 'scn_'),
      type: 'output' as const,
      x: 600,
      y: 200,
      bus: 'SFX',
      volume: 1.0,
      pitch: 1.0,
      loop: false,
      maxConcurrency: 0,
      fadeIn: 0,
      fadeOut: 0,
    }],
    connections: [],
  };
}

/** Migrate a legacy Sound Cue (flat entries list) to node graph format */
export function migrateLegacyCue(cue: SoundCueData): void {
  if (cue.nodes && cue.nodes.length > 0) return; // already has graph
  const entries = cue.entries || [];
  const playMode = cue.playMode || 'single';

  // Create output node
  const outputNode: SCOutputNode = {
    id: sndUid().replace('snd_', 'scn_'),
    type: 'output',
    x: 600,
    y: 200,
    bus: cue.bus || 'SFX',
    volume: cue.volumeMultiplier ?? 1,
    pitch: cue.pitchMultiplier ?? 1,
    loop: cue.loop ?? false,
    maxConcurrency: cue.maxConcurrency ?? 0,
    fadeIn: cue.fadeInDuration ?? 0,
    fadeOut: cue.fadeOutDuration ?? 0,
  };
  const nodes: SCNode[] = [outputNode];
  const connections: SCConnection[] = [];

  if (entries.length === 0) {
    cue.nodes = nodes;
    cue.connections = connections;
    return;
  }

  // Create Wave Player nodes
  const wpNodes: SCWavePlayerNode[] = entries.map((e, i) => ({
    id: sndUid().replace('snd_', 'scn_'),
    type: 'wavePlayer' as const,
    x: 50,
    y: 80 + i * 130,
    soundAssetId: e.soundAssetId,
    volume: e.volumeMultiplier,
    pitchMin: e.pitchMin,
    pitchMax: e.pitchMax,
  }));
  nodes.push(...wpNodes);

  if (entries.length === 1 || playMode === 'single') {
    // Wire first WP directly to output
    connections.push({
      id: sndUid().replace('snd_', 'scc_'),
      fromNodeId: wpNodes[0].id,
      toNodeId: outputNode.id,
      toInputIndex: 0,
    });
  } else {
    // Create a Random node
    const randomNode: SCRandomNode = {
      id: sndUid().replace('snd_', 'scn_'),
      type: 'random',
      x: 340,
      y: 200,
      weights: entries.map(e => e.weight),
    };
    nodes.push(randomNode);
    wpNodes.forEach((wp, i) => {
      connections.push({
        id: sndUid().replace('snd_', 'scc_'),
        fromNodeId: wp.id,
        toNodeId: randomNode.id,
        toInputIndex: i,
      });
    });
    connections.push({
      id: sndUid().replace('snd_', 'scc_'),
      fromNodeId: randomNode.id,
      toNodeId: outputNode.id,
      toInputIndex: 0,
    });
  }

  cue.nodes = nodes;
  cue.connections = connections;
}

// ============================================================
//  SoundLibrary — Singleton manager for imported audio assets
// ============================================================

export class SoundLibrary {
  private _sounds: Map<string, SoundAssetData> = new Map();
  private _cues: Map<string, SoundCueData> = new Map();
  private _listeners: Array<() => void> = [];
  private _audioCtx: AudioContext | null = null;

  private static _instance: SoundLibrary | null = null;

  constructor() {
    SoundLibrary._instance = this;
  }

  static get instance(): SoundLibrary | null {
    return SoundLibrary._instance;
  }

  private _getAudioContext(): AudioContext {
    if (!this._audioCtx) {
      this._audioCtx = new AudioContext();
    }
    return this._audioCtx;
  }

  // ============================================================
  //  Sound Import
  // ============================================================

  async importFromFile(file: File, settings: Partial<SoundSettings> = {}): Promise<SoundAssetData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (event) => {
        const dataURL = event.target!.result as string;

        try {
          // Decode audio to get metadata
          const arrayBuffer = await this._dataURLToArrayBuffer(dataURL);
          const audioBuffer = await this._getAudioContext().decodeAudioData(arrayBuffer);

          const mergedSettings: SoundSettings = {
            ...defaultSoundSettings(),
            ...settings,
          };

          const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';

          const asset: SoundAssetData = {
            assetId: sndUid(),
            assetType: 'sound',
            assetName: this._cleanName(file.name),
            sourceFile: file.name,
            category: (settings as any).category || 'SFX',
            settings: mergedSettings,
            metadata: {
              duration: audioBuffer.duration,
              sampleRate: audioBuffer.sampleRate,
              numberOfChannels: audioBuffer.numberOfChannels,
              fileSize: file.size,
              format: ext,
            },
            thumbnail: this._generateWaveformThumbnail(audioBuffer),
            storedData: dataURL,
          };

          this._sounds.set(asset.assetId, asset);
          this._notify();
          resolve(asset);
        } catch (err) {
          reject(new Error(`Failed to decode audio: ${file.name} — ${err}`));
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /** Import from an existing data URL (e.g., from saved project) */
  async importFromDataURL(
    dataURL: string,
    name: string,
    existingId?: string,
    settings?: Partial<SoundSettings>,
    category?: SoundCategory,
    metadata?: SoundMetadata,
    thumbnail?: string,
  ): Promise<SoundAssetData> {
    let meta = metadata;
    let thumb = thumbnail;

    if (!meta || !thumb) {
      try {
        const arrayBuffer = await this._dataURLToArrayBuffer(dataURL);
        const audioBuffer = await this._getAudioContext().decodeAudioData(arrayBuffer);
        if (!meta) {
          meta = {
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            numberOfChannels: audioBuffer.numberOfChannels,
            fileSize: dataURL.length,
            format: 'unknown',
          };
        }
        if (!thumb) {
          thumb = this._generateWaveformThumbnail(audioBuffer);
        }
      } catch {
        meta = meta || { duration: 0, sampleRate: 44100, numberOfChannels: 2, fileSize: dataURL.length, format: 'unknown' };
        thumb = thumb || '';
      }
    }

    const asset: SoundAssetData = {
      assetId: existingId || sndUid(),
      assetType: 'sound',
      assetName: name,
      sourceFile: name,
      category: category || 'SFX',
      settings: { ...defaultSoundSettings(), ...settings },
      metadata: meta,
      thumbnail: thumb,
      storedData: dataURL,
    };

    this._sounds.set(asset.assetId, asset);
    this._notify();
    return asset;
  }

  // ============================================================
  //  Sound Cue Management
  // ============================================================

  createCue(name: string): SoundCueData {
    const cue = defaultSoundCueData(name);
    this._cues.set(cue.assetId, cue);
    this._notify();
    return cue;
  }

  getCue(assetId: string): SoundCueData | undefined {
    return this._cues.get(assetId);
  }

  updateCue(cue: SoundCueData): void {
    this._cues.set(cue.assetId, cue);
    this._notify();
  }

  deleteCue(assetId: string): void {
    this._cues.delete(assetId);
    this._notify();
  }

  get allCues(): SoundCueData[] {
    return Array.from(this._cues.values());
  }

  /** Walk a Sound Cue node graph starting from the given node */
  private _resolveNode(cue: SoundCueData, nodeId: string, depth = 0): { url: string; volume: number; pitch: number } | null {
    if (depth > 20) return null; // prevent cycles
    const node = cue.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    switch (node.type) {
      case 'wavePlayer': {
        const n = node as SCWavePlayerNode;
        const sound = this._sounds.get(n.soundAssetId);
        if (!sound) return null;
        const pitch = n.pitchMin + Math.random() * (n.pitchMax - n.pitchMin);
        return { url: sound.storedData, volume: n.volume, pitch };
      }
      case 'random': {
        const n = node as SCRandomNode;
        const inputConns = cue.connections.filter(c => c.toNodeId === nodeId)
          .sort((a, b) => a.toInputIndex - b.toInputIndex);
        if (inputConns.length === 0) return null;
        const weights = inputConns.map((_, i) => n.weights[i] ?? 1);
        const totalW = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalW;
        let picked = inputConns[0];
        for (let i = 0; i < inputConns.length; i++) {
          r -= weights[i];
          if (r <= 0) { picked = inputConns[i]; break; }
        }
        return this._resolveNode(cue, picked.fromNodeId, depth + 1);
      }
      case 'modulator': {
        const n = node as SCModulatorNode;
        const conn = cue.connections.find(c => c.toNodeId === nodeId);
        if (!conn) return null;
        const result = this._resolveNode(cue, conn.fromNodeId, depth + 1);
        if (!result) return null;
        result.volume *= n.volumeMin + Math.random() * (n.volumeMax - n.volumeMin);
        result.pitch *= n.pitchMin + Math.random() * (n.pitchMax - n.pitchMin);
        return result;
      }
      case 'mixer': {
        const inputConns = cue.connections.filter(c => c.toNodeId === nodeId);
        if (inputConns.length === 0) return null;
        // Pick a random connected input (true mixing requires multiple sources)
        const idx = Math.floor(Math.random() * inputConns.length);
        return this._resolveNode(cue, inputConns[idx].fromNodeId, depth + 1);
      }
      case 'output': {
        const n = node as SCOutputNode;
        const conn = cue.connections.find(c => c.toNodeId === nodeId);
        if (!conn) return null;
        const result = this._resolveNode(cue, conn.fromNodeId, depth + 1);
        if (!result) return null;
        result.volume *= n.volume;
        result.pitch *= n.pitch;
        return result;
      }
      default:
        return null;
    }
  }

  /** Resolve a Sound Cue to an actual sound asset URL (for runtime).
   *  Walks the node graph from the Output node backward. */
  resolveCueToSoundURL(cueId: string): { url: string; volume: number; pitch: number } | null {
    const cue = this._cues.get(cueId);
    if (!cue) return null;

    // Legacy format: flat entries list (auto-migrate)
    if (!cue.nodes || cue.nodes.length === 0) {
      migrateLegacyCue(cue);
    }

    const outputNode = cue.nodes.find(n => n.type === 'output');
    if (!outputNode) return null;
    return this._resolveNode(cue, outputNode.id);
  }

  // ============================================================
  //  Sound Access
  // ============================================================

  getSound(assetId: string): SoundAssetData | undefined {
    return this._sounds.get(assetId);
  }

  get allSounds(): SoundAssetData[] {
    return Array.from(this._sounds.values());
  }

  getSoundsByCategory(category: SoundCategory): SoundAssetData[] {
    return this.allSounds.filter(s => s.category === category);
  }

  findByName(name: string): SoundAssetData | undefined {
    const lower = name.toLowerCase();
    return this.allSounds.find(s =>
      s.assetName.toLowerCase().includes(lower) ||
      s.sourceFile.toLowerCase().includes(lower)
    );
  }

  // ============================================================
  //  Remove
  // ============================================================

  removeSound(assetId: string): void {
    this._sounds.delete(assetId);
    // Clear references in node graphs
    for (const cue of this._cues.values()) {
      if (cue.nodes) {
        for (const node of cue.nodes) {
          if (node.type === 'wavePlayer' && (node as SCWavePlayerNode).soundAssetId === assetId) {
            (node as SCWavePlayerNode).soundAssetId = '';
          }
        }
      }
      // Legacy entries
      if (cue.entries) cue.entries = cue.entries.filter(e => e.soundAssetId !== assetId);
    }
    this._notify();
  }

  // ============================================================
  //  Serialization
  // ============================================================

  exportAllSounds(): SoundAssetData[] {
    return Array.from(this._sounds.values());
  }

  exportAllCues(): SoundCueData[] {
    return Array.from(this._cues.values()).map(cue => {
      // Strip runtime state
      const { _sequenceIndex, _shuffleOrder, ...clean } = cue;
      return clean as SoundCueData;
    });
  }

  async importAllSounds(assets: SoundAssetData[]): Promise<void> {
    this._sounds.clear();
    for (const asset of assets) {
      this._sounds.set(asset.assetId, asset);
    }
    this._notify();
  }

  importAllCues(cues: SoundCueData[]): void {
    this._cues.clear();
    for (const cue of cues) {
      migrateLegacyCue(cue);
      this._cues.set(cue.assetId, cue);
    }
    this._notify();
  }

  clear(): void {
    this._sounds.clear();
    this._cues.clear();
    this._notify();
  }

  // ============================================================
  //  Change listeners
  // ============================================================

  onChanged(cb: () => void): void {
    this._listeners.push(cb);
  }

  removeListener(cb: () => void): void {
    this._listeners = this._listeners.filter(l => l !== cb);
  }

  // ============================================================
  //  Private helpers
  // ============================================================

  private _generateWaveformThumbnail(audioBuffer: AudioBuffer, width = 128, height = 64): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;

    for (let i = 0; i < width; i++) {
      let min = 1.0, max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum === undefined) break;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }

    ctx.stroke();

    // Center line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    return canvas.toDataURL('image/png');
  }

  private async _dataURLToArrayBuffer(dataURL: string): Promise<ArrayBuffer> {
    const response = await fetch(dataURL);
    return response.arrayBuffer();
  }

  private _cleanName(filename: string): string {
    return 'S_' + filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9]/g, '_');
  }

  private _notify(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[SoundLibrary] listener error:', e); }
    }
  }

  /** Format duration as M:SS */
  static formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
