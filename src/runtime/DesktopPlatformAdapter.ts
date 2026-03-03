// ============================================================
//  DesktopPlatformAdapter — PlatformAdapter for Desktop Exports
//  (Windows, macOS, Linux via Tauri)
//
//  Uses Tauri's native APIs for file system access, window
//  management, etc. Also works for Mobile via Tauri Mobile.
// ============================================================

import type {
  PlatformAdapter,
  InputEventHandler,
  StorageAdapter,
  LogLevel,
} from './PlatformAdapter';

export class DesktopPlatformAdapter implements PlatformAdapter {
  readonly platformName: string;

  private _canvas: HTMLCanvasElement;
  private _inputHandler: InputEventHandler | null = null;
  private _resizeCallbacks: ((w: number, h: number) => void)[] = [];
  private _projectDataPath: string;
  private _audioContext: AudioContext | null = null;
  private _boundResizeHandler: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    projectDataPath: string = '/project-data',
    platformName: string = 'Desktop',
  ) {
    this._canvas = canvas;
    this._projectDataPath = projectDataPath.replace(/\/+$/, '');
    this.platformName = platformName;
  }

  // ── File System (Tauri invoke) ──

  async loadFileText(path: string): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('read_file', {
        path: `${this._projectDataPath}/${path}`,
      });
    } catch {
      // Fallback to fetch (for Vite dev server during Tauri dev)
      const res = await fetch(`${this._projectDataPath}/${path}`);
      if (!res.ok) throw new Error(`File not found: ${path}`);
      return res.text();
    }
  }

  async loadFileBinary(path: string): Promise<ArrayBuffer> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const bytes: number[] = await invoke('read_binary_file', {
        path: `${this._projectDataPath}/${path}`,
      });
      const buffer = new ArrayBuffer(bytes.length);
      new Uint8Array(buffer).set(bytes);
      return buffer;
    } catch {
      const res = await fetch(`${this._projectDataPath}/${path}`);
      if (!res.ok) throw new Error(`File not found: ${path}`);
      return res.arrayBuffer();
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('file_exists', {
        path: `${this._projectDataPath}/${path}`,
      });
    } catch {
      try {
        const res = await fetch(`${this._projectDataPath}/${path}`, { method: 'HEAD' });
        return res.ok;
      } catch {
        return false;
      }
    }
  }

  async listFiles(directory: string): Promise<string[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string[]>('list_dir_files', {
        path: `${this._projectDataPath}/${directory}`,
      });
    } catch {
      return [];
    }
  }

  // ── Display ──

  getViewportSize(): { width: number; height: number } {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
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
    // Desktop apps don't have autoplay restrictions, but handle edge case
    if (this._audioContext?.state === 'suspended') {
      this._audioContext.resume();
    }
  }

  // ── Render Surface ──

  getRenderSurface(): HTMLCanvasElement {
    return this._canvas;
  }

  // ── Storage (Tauri file system) ──

  getStorageAdapter(): StorageAdapter {
    return new DesktopStorageAdapter();
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

  async quit(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:process|exit', { code: 0 });
    } catch {
      window.close();
    }
  }
}

// ── Desktop Storage (Tauri file system) ──

class DesktopStorageAdapter implements StorageAdapter {
  private _basePath = 'SaveGames';

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
