// ============================================================
//  EditorPlatformAdapter — PlatformAdapter for Editor Play Mode
//
//  Used when running the game inside the editor's viewport.
//  This is just another platform — the runtime doesn't know
//  it's running inside an editor.
// ============================================================

import type {
  PlatformAdapter,
  InputEventHandler,
  StorageAdapter,
  LogLevel,
} from './PlatformAdapter';

export class EditorPlatformAdapter implements PlatformAdapter {
  readonly platformName = 'Editor';

  private _canvas: HTMLCanvasElement;
  private _inputHandler: InputEventHandler | null = null;
  private _resizeCallbacks: ((w: number, h: number) => void)[] = [];
  private _resizeObserver: ResizeObserver | null = null;
  private _projectPath: string;
  private _printFn: (...args: any[]) => void;
  private _audioContext: AudioContext | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    projectPath: string,
    printFn?: (...args: any[]) => void,
  ) {
    this._canvas = canvas;
    this._projectPath = projectPath;
    this._printFn = printFn ?? console.log;
  }

  // ── File System ──

  async loadFileText(path: string): Promise<string> {
    // In the editor, we use Tauri's invoke to read files
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string>('read_file', { path: `${this._projectPath}/${path}` });
  }

  async loadFileBinary(path: string): Promise<ArrayBuffer> {
    const { invoke } = await import('@tauri-apps/api/core');
    const bytes: number[] = await invoke('read_binary_file', {
      path: `${this._projectPath}/${path}`,
    });
    const buffer = new ArrayBuffer(bytes.length);
    new Uint8Array(buffer).set(bytes);
    return buffer;
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke<boolean>('file_exists', {
        path: `${this._projectPath}/${path}`,
      });
    } catch {
      return false;
    }
  }

  async listFiles(directory: string): Promise<string[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke<string[]>('list_dir_files', {
        path: `${this._projectPath}/${directory}`,
      });
    } catch {
      return [];
    }
  }

  // ── Display ──

  getViewportSize(): { width: number; height: number } {
    return {
      width: this._canvas.clientWidth,
      height: this._canvas.clientHeight,
    };
  }

  onViewportResize(callback: (w: number, h: number) => void): void {
    this._resizeCallbacks.push(callback);

    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        const { width, height } = this.getViewportSize();
        for (const cb of this._resizeCallbacks) {
          cb(width, height);
        }
      });
      this._resizeObserver.observe(this._canvas);
    }
  }

  getDevicePixelRatio(): number {
    return window.devicePixelRatio;
  }

  // ── Input ──

  registerInputSource(handler: InputEventHandler): void {
    this._inputHandler = handler;
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
    // In the editor, the user has already interacted, so audio context
    // is typically in running state. Handle edge case anyway.
    if (this._audioContext?.state === 'suspended') {
      this._audioContext.resume();
    }
  }

  // ── Render Surface ──

  getRenderSurface(): HTMLCanvasElement {
    return this._canvas;
  }

  // ── Storage ──

  getStorageAdapter(): StorageAdapter {
    return new EditorStorageAdapter(this._projectPath);
  }

  // ── Logging ──

  log(level: LogLevel, message: string): void {
    switch (level) {
      case 'debug': console.debug(message); break;
      case 'info': this._printFn(message); break;
      case 'warn': console.warn(message); break;
      case 'error': console.error(message); break;
    }
  }

  // ── Lifecycle ──

  shutdown(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this._resizeCallbacks = [];
    this._inputHandler = null;
    if (this._audioContext) {
      this._audioContext.close();
      this._audioContext = null;
    }
  }

  quit(): void {
    // In the editor, quit means stop play mode — not exit the app
    // The editor handles this via the Stop button
  }
}

// ── Editor Storage (Tauri file system) ──

class EditorStorageAdapter implements StorageAdapter {
  private _basePath: string;

  constructor(projectPath: string) {
    this._basePath = `${projectPath}/SaveGames`;
  }

  async saveData(key: string, data: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_file', {
      path: `${this._basePath}/${key}.sav`,
      contents: data,
    });
  }

  async loadData(key: string): Promise<string | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('read_file', {
        path: `${this._basePath}/${key}.sav`,
      });
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('file_exists', {
        path: `${this._basePath}/${key}.sav`,
      });
    } catch {
      return false;
    }
  }

  async deleteData(key: string): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_file', {
        path: `${this._basePath}/${key}.sav`,
      });
    } catch { /* ignore */ }
  }

  async listKeys(prefix?: string): Promise<string[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const files: string[] = await invoke('list_dir_files', {
        path: this._basePath,
      });
      const keys = files
        .filter(f => f.endsWith('.sav'))
        .map(f => f.replace(/\.sav$/, ''));
      if (prefix) return keys.filter(k => k.startsWith(prefix));
      return keys;
    } catch {
      return [];
    }
  }
}
