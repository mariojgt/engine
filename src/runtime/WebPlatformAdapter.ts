// ============================================================
//  WebPlatformAdapter — PlatformAdapter for Web (HTML5) Exports
//
//  Used for standalone web builds served from a web server.
//  Handles browser-specific concerns like:
//  - Audio autoplay policy
//  - fetch()-based asset loading
//  - Canvas focus management
//  - localStorage save/load
// ============================================================

import type {
  PlatformAdapter,
  InputEventHandler,
  StorageAdapter,
  LogLevel,
} from './PlatformAdapter';

export class WebPlatformAdapter implements PlatformAdapter {
  readonly platformName = 'Web';

  private _canvas: HTMLCanvasElement;
  private _inputHandler: InputEventHandler | null = null;
  private _resizeCallbacks: ((w: number, h: number) => void)[] = [];
  private _basePath: string;
  private _audioContext: AudioContext | null = null;
  private _audioResumed = false;
  private _maxPixelRatio: number;
  private _boundResizeHandler: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    basePath: string = '/project-data',
    maxPixelRatio: number = 2,
  ) {
    this._canvas = canvas;
    this._basePath = basePath.replace(/\/+$/, '');
    this._maxPixelRatio = maxPixelRatio;
  }

  // ── File System (fetch-based) ──

  async loadFileText(path: string): Promise<string> {
    const url = `${this._basePath}/${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`File not found: ${url} (${res.status})`);
    return res.text();
  }

  async loadFileBinary(path: string): Promise<ArrayBuffer> {
    const url = `${this._basePath}/${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`File not found: ${url} (${res.status})`);
    return res.arrayBuffer();
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const url = `${this._basePath}/${path}`;
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listFiles(directory: string): Promise<string[]> {
    // Web servers don't support directory listing via fetch
    // The export pipeline should generate manifest files for this
    return [];
  }

  // ── Display ──

  getViewportSize(): { width: number; height: number } {
    return {
      width: this._canvas.clientWidth || window.innerWidth,
      height: this._canvas.clientHeight || window.innerHeight,
    };
  }

  onViewportResize(callback: (w: number, h: number) => void): void {
    this._resizeCallbacks.push(callback);

    if (!this._boundResizeHandler) {
      this._boundResizeHandler = () => {
        const { width, height } = this.getViewportSize();
        for (const cb of this._resizeCallbacks) {
          cb(width, height);
        }
      };
      window.addEventListener('resize', this._boundResizeHandler);
    }
  }

  getDevicePixelRatio(): number {
    return Math.min(window.devicePixelRatio, this._maxPixelRatio);
  }

  // ── Input ──

  registerInputSource(handler: InputEventHandler): void {
    this._inputHandler = handler;

    // Ensure canvas can receive keyboard focus
    this._canvas.tabIndex = 0;
    this._canvas.style.outline = 'none';

    // Auto-focus canvas on click to prevent keyboard focus loss
    this._canvas.addEventListener('click', () => {
      this._canvas.focus();
    });

    // Prevent Tab from leaving the canvas
    this._canvas.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
      }
    });
  }

  unregisterInputSource(): void {
    this._inputHandler = null;
  }

  // ── Audio ──

  getAudioContext(): AudioContext {
    if (!this._audioContext) {
      this._audioContext = new AudioContext();
    }
    return this._audioContext;
  }

  resumeAudioOnInteraction(): void {
    if (this._audioResumed) return;

    const resumeAudio = () => {
      if (this._audioContext?.state === 'suspended') {
        this._audioContext.resume().then(() => {
          console.log('[WebPlatform] AudioContext resumed after user interaction');
        });
      }
      this._audioResumed = true;
      // Remove listeners after first interaction
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('touchstart', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };

    document.addEventListener('click', resumeAudio, { once: true });
    document.addEventListener('touchstart', resumeAudio, { once: true });
    document.addEventListener('keydown', resumeAudio, { once: true });
  }

  // ── Render Surface ──

  getRenderSurface(): HTMLCanvasElement {
    return this._canvas;
  }

  // ── Storage (localStorage) ──

  getStorageAdapter(): StorageAdapter {
    return new WebStorageAdapter();
  }

  // ── Logging ──

  log(level: LogLevel, message: string): void {
    switch (level) {
      case 'debug': console.debug(message); break;
      case 'info': console.log(message); break;
      case 'warn': console.warn(message); break;
      case 'error': console.error(message); break;
    }
  }

  // ── Lifecycle ──

  shutdown(): void {
    if (this._boundResizeHandler) {
      window.removeEventListener('resize', this._boundResizeHandler);
      this._boundResizeHandler = null;
    }
    this._resizeCallbacks = [];
    this._inputHandler = null;
    if (this._audioContext) {
      this._audioContext.close();
      this._audioContext = null;
    }
  }

  quit(): void {
    window.close();
  }
}

// ── Web Storage (localStorage) ──

class WebStorageAdapter implements StorageAdapter {
  private _prefix = 'feather_save_';

  async saveData(key: string, data: string): Promise<void> {
    try {
      localStorage.setItem(this._prefix + key, data);
    } catch (e: any) {
      // localStorage may be full
      console.warn(`[WebStorage] Save failed for "${key}": ${e?.message}`);
      throw new Error(`Save failed: storage quota exceeded`);
    }
  }

  async loadData(key: string): Promise<string | null> {
    return localStorage.getItem(this._prefix + key);
  }

  async exists(key: string): Promise<boolean> {
    return localStorage.getItem(this._prefix + key) !== null;
  }

  async deleteData(key: string): Promise<void> {
    localStorage.removeItem(this._prefix + key);
  }

  async listKeys(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this._prefix)) {
        const stripped = key.slice(this._prefix.length);
        if (!prefix || stripped.startsWith(prefix)) {
          keys.push(stripped);
        }
      }
    }
    return keys;
  }
}
