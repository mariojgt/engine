// ============================================================
//  PlatformAdapter — Abstraction layer for platform-specific APIs
//
//  Each delivery context (Editor Play Mode, Desktop, Web, Mobile)
//  provides its own implementation of this interface. The runtime
//  never calls platform APIs directly — always through the adapter.
//
//  This is the ONLY place where platform differences are allowed.
//  FeatherRuntime is completely platform-agnostic — it consumes
//  this interface without knowing which implementation backs it.
// ============================================================

// ── Log Levels ──────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ── Input Event Types ───────────────────────────────────────

export interface InputEventHandler {
  onKeyDown(key: string): void;
  onKeyUp(key: string): void;
  onMouseDown(button: number, x: number, y: number): void;
  onMouseUp(button: number, x: number, y: number): void;
  onMouseMove(x: number, y: number, dx: number, dy: number): void;
  onWheel(deltaY: number): void;
  onTouchStart(touches: { id: number; x: number; y: number }[]): void;
  onTouchEnd(touches: { id: number; x: number; y: number }[]): void;
  onTouchMove(touches: { id: number; x: number; y: number }[]): void;
  onGamepadConnected(index: number): void;
  onGamepadDisconnected(index: number): void;
}

// ── Save/Load Abstraction ───────────────────────────────────

export interface StorageAdapter {
  /** Write data to a named slot */
  saveData(key: string, data: string): Promise<void>;
  /** Read data from a named slot; returns null if not found */
  loadData(key: string): Promise<string | null>;
  /** Check if a named slot exists */
  exists(key: string): Promise<boolean>;
  /** Delete a named slot */
  deleteData(key: string): Promise<void>;
  /** List all slot keys matching an optional prefix */
  listKeys(prefix?: string): Promise<string[]>;
}

// ── Platform Adapter Interface ──────────────────────────────

export interface PlatformAdapter {
  /** Human-readable platform name (e.g. 'Windows', 'Web', 'Editor') */
  readonly platformName: string;

  // ── File System / Asset Loading ──
  /** Load a file as text from the asset storage (project-data, pak, etc.) */
  loadFileText(path: string): Promise<string>;
  /** Load a file as binary from the asset storage */
  loadFileBinary(path: string): Promise<ArrayBuffer>;
  /** Check if a file exists in the asset storage */
  fileExists(path: string): Promise<boolean>;
  /** List files in a directory (returns filenames, not full paths) */
  listFiles(directory: string): Promise<string[]>;

  // ── Window / Display ──
  /** Get the current viewport size in CSS pixels */
  getViewportSize(): { width: number; height: number };
  /** Register a callback for viewport resize events */
  onViewportResize(callback: (width: number, height: number) => void): void;
  /** Get the device pixel ratio for HiDPI rendering */
  getDevicePixelRatio(): number;

  // ── Input ──
  /** Register input event handlers with the platform input source */
  registerInputSource(handler: InputEventHandler): void;
  /** Unregister input event handlers */
  unregisterInputSource(): void;

  // ── Audio ──
  /** Create or get the audio context — handles autoplay policy if needed */
  getAudioContext(): AudioContext;
  /** Resume audio context after user interaction (for web autoplay policy) */
  resumeAudioOnInteraction(): void;

  // ── Render Surface ──
  /** Get the canvas element for WebGL/WebGPU rendering */
  getRenderSurface(): HTMLCanvasElement;

  // ── Storage (Save/Load) ──
  /** Get the storage adapter for save/load operations */
  getStorageAdapter(): StorageAdapter;

  // ── Logging ──
  /** Log a message at the specified level */
  log(level: LogLevel, message: string): void;

  // ── Lifecycle ──
  /** Called when the runtime is shutting down — release platform resources */
  shutdown(): void;

  /** Request the application to quit/close */
  quit(): void;
}
