// ============================================================
//  SaveLoadSystem - UE-style file-based save/load for Feather Engine
//
//  Architecture modeled after Unreal Engine's save system:
//  * SaveGameObject         - data container (like USaveGame)
//  * createSaveGameObject() - factory
//  * saveGameToSlot()       - sync via in-memory cache + async disk write
//  * loadGameFromSlot()     - sync read from cache
//  * asyncSaveGameToSlot()  - explicit async (waits for disk)
//  * asyncLoadGameFromSlot()- explicit async (reads from disk)
//  * doesSaveGameExist()    - cache lookup
//  * deleteSaveGameInSlot() - cache + disk delete
//
//  Save files: {ProjectRoot}/SaveGames/{SlotName}_{UserIndex}.sav
//  Format: JSON - no size limit (file-based, not localStorage).
//
//  Runs at runtime during Play mode.
//  Blueprint nodes call via __engine.saveLoad.
// ============================================================

// -- Tauri invoke singleton -----------------------------------

let _tauriInvoke: ((cmd: string, args: Record<string, unknown>) => Promise<any>) | null = null;

async function getTauriInvoke(): Promise<(cmd: string, args: Record<string, unknown>) => Promise<any>> {
  if (_tauriInvoke) return _tauriInvoke;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    _tauriInvoke = (cmd, args) => invoke(cmd, args);
    return _tauriInvoke;
  } catch {
    throw new Error('[SaveLoad] Tauri not available - file-based save/load requires Tauri runtime');
  }
}

// -- Sanitization (strips non-serializable values) ------------

function sanitizeValue(v: any): any {
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return v;
  if (Array.isArray(v)) return v.map(item => sanitizeValue(item));
  if (t === 'object') {
    // Three.js vectors, colors, quaternions
    if (v.constructor && v.constructor.name !== 'Object') {
      if ('x' in v && 'y' in v && 'z' in v && 'w' in v) return { x: v.x, y: v.y, z: v.z, w: v.w };
      if ('x' in v && 'y' in v && 'z' in v) return { x: v.x, y: v.y, z: v.z };
      if ('x' in v && 'y' in v) return { x: v.x, y: v.y };
      if ('r' in v && 'g' in v && 'b' in v) return { r: v.r, g: v.g, b: v.b };
      return undefined;
    }
    const result: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      const sv = sanitizeValue(val);
      if (sv !== undefined) result[k] = sv;
    }
    return result;
  }
  return undefined; // functions, symbols, etc.
}

function sanitize(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const sv = sanitizeValue(v);
    if (sv !== undefined) result[k] = sv;
  }
  return result;
}

// -- SaveGameObject -------------------------------------------

/**
 * Runtime data container for save game state - equivalent to
 * Unreal Engine's USaveGame.
 *
 * Users set/get variables on this object, then pass it to
 * saveGameToSlot() to persist.  loadGameFromSlot() returns
 * a populated SaveGameObject back.
 *
 * Supports typed getters (getString, getInt, getFloat, getBool,
 * getVector) for blueprint convenience.
 */
export class SaveGameObject {
  private _variables: Record<string, any> = {};

  // -- Setters -----------------------------------------------

  /** Set a named variable (any serializable type) */
  setVariable(name: string, value: any): void {
    this._variables[name] = value;
  }

  // -- Generic getter ----------------------------------------

  /** Get a variable by name with optional fallback */
  getVariable(name: string, defaultValue: any = undefined): any {
    return name in this._variables ? this._variables[name] : defaultValue;
  }

  // -- Typed getters -----------------------------------------

  getString(name: string, defaultValue: string = ''): string {
    const v = this._variables[name];
    return v !== undefined ? String(v) : defaultValue;
  }

  getInt(name: string, defaultValue: number = 0): number {
    const v = this._variables[name];
    return v !== undefined ? Math.round(Number(v)) : defaultValue;
  }

  getFloat(name: string, defaultValue: number = 0): number {
    const v = this._variables[name];
    return v !== undefined ? Number(v) : defaultValue;
  }

  getBool(name: string, defaultValue: boolean = false): boolean {
    const v = this._variables[name];
    return v !== undefined ? Boolean(v) : defaultValue;
  }

  getVector(name: string): { x: number; y: number; z: number } {
    const v = this._variables[name];
    if (v && typeof v === 'object' && 'x' in v) {
      return { x: Number(v.x) || 0, y: Number(v.y) || 0, z: Number(v.z) || 0 };
    }
    return { x: 0, y: 0, z: 0 };
  }

  // -- Utilities ---------------------------------------------

  hasVariable(name: string): boolean { return name in this._variables; }
  removeVariable(name: string): void { delete this._variables[name]; }
  clearVariables(): void { this._variables = {}; }
  getVariableNames(): string[] { return Object.keys(this._variables); }
  getAllVariables(): Record<string, any> { return { ...this._variables }; }

  // -- Serialization -----------------------------------------

  /** Serialize to a JSON-safe plain object */
  toJSON(): Record<string, any> { return sanitize(this._variables); }

  /** Populate from a plain object (deserialization) */
  fromJSON(data: Record<string, any>): void { this._variables = { ...data }; }
}

// -- Interfaces -----------------------------------------------

/** Metadata written into every .sav file */
export interface SaveSlotInfo {
  slotName: string;
  userIndex: number;
  timestamp: string;
  displayName: string;
  sceneId: string;
  playTime: number;
}

/** Full on-disk save file structure (.sav JSON) */
export interface SaveFileData {
  /** Schema version - bump when format changes */
  version: number;
  /** Slot metadata */
  info: SaveSlotInfo;
  /** SaveGameObject variables (the user's data) */
  saveGameData: Record<string, any>;
  /** Auto-captured GameInstance variables snapshot */
  gameInstanceVars: Record<string, any>;
  /** Per-actor custom variables (actorName -> vars) */
  actorVars: Record<string, Record<string, any>>;
  /** Extra key/value data that blueprints can store */
  customData: Record<string, any>;
}

// -- SaveLoadSystem -------------------------------------------

/**
 * UE-style save/load manager.
 *
 * Lifecycle:
 *   engine.saveLoad.initialize(projectPath) - editor calls before play
 *   engine.saveLoad.shutdown()              - editor calls on play stop
 *
 * Blueprint usage (via code gen):
 *   const obj = __engine.saveLoad.createSaveGameObject();
 *   obj.setVariable('health', 100);
 *   __engine.saveLoad.saveGameToSlot(obj, 'Slot1', 0);
 *
 *   const loaded = __engine.saveLoad.loadGameFromSlot('Slot1', 0);
 *   const hp = loaded.getFloat('health', 100);
 */
export class SaveLoadSystem {
  /** In-memory cache: slotKey -> SaveFileData */
  private _cache: Map<string, SaveFileData> = new Map();

  /** Project root path (forward-slash normalized) */
  private _projectPath: string = '';

  /** SaveGames directory (under project root) */
  private _savesDir: string = '';

  /** Has the initial disk scan completed? */
  private _initialized: boolean = false;

  /** Queue of pending async disk operations */
  private _pendingIO: Promise<void>[] = [];

  // -- Key / path helpers ------------------------------------

  private _slotKey(slotName: string, userIndex: number = 0): string {
    return `${slotName}_${userIndex}`;
  }

  private _filePath(slotName: string, userIndex: number = 0): string {
    return `${this._savesDir}/${this._slotKey(slotName, userIndex)}.sav`;
  }

  // -- Lifecycle ---------------------------------------------

  /**
   * Scan {ProjectRoot}/SaveGames/ and load all .sav files
   * into the in-memory cache.  After this resolves every
   * sync method (loadGameFromSlot, doesSaveGameExist, etc.)
   * returns correct results immediately.
   */
  async initialize(projectPath: string): Promise<void> {
    if (!projectPath) {
      console.warn('[SaveLoad] No project path - save system in memory-only mode');
      this._initialized = true;
      return;
    }

    this._projectPath = projectPath.replace(/\\/g, '/');
    this._savesDir = `${this._projectPath}/SaveGames`;
    this._cache.clear();

    try {
      const invoke = await getTauriInvoke();

      // Ensure SaveGames directory exists (write_file creates parents)
      const markerPath = `${this._savesDir}/.saves`;
      const markerExists = await invoke('file_exists', { path: markerPath }) as boolean;
      if (!markerExists) {
        await invoke('write_file', { path: markerPath, contents: '{}' });
      }

      // List all .sav files
      const files = await invoke('list_dir_files', {
        path: this._savesDir,
        extension: '.sav',
      }) as string[];

      // Parse each into cache
      for (const fileName of files) {
        try {
          const filePath = `${this._savesDir}/${fileName}`;
          const json = await invoke('read_file', { path: filePath }) as string;
          const data: SaveFileData = JSON.parse(json);
          const key = fileName.replace(/\.sav$/i, '');
          this._cache.set(key, data);
        } catch (e) {
          console.warn(`[SaveLoad] Skipping corrupted save: ${fileName}`, e);
        }
      }

      console.log(`[SaveLoad] Initialized - ${this._cache.size} save(s) from ${this._savesDir}`);
    } catch (e) {
      console.warn('[SaveLoad] File I/O unavailable - memory-only mode:', e);
    }

    this._initialized = true;
  }

  /**
   * Flush all pending disk writes and clear the cache.
   * Called by Engine when play stops.
   */
  async shutdown(): Promise<void> {
    if (this._pendingIO.length > 0) {
      await Promise.allSettled(this._pendingIO);
      this._pendingIO = [];
    }
    this._cache.clear();
    this._initialized = false;
    console.log('[SaveLoad] Shutdown');
  }

  // -- Factory -----------------------------------------------

  /**
   * Create a new empty SaveGameObject.
   * Equivalent to UGameplayStatics::CreateSaveGameObject.
   */
  createSaveGameObject(): SaveGameObject {
    return new SaveGameObject();
  }

  // -- Sync save / load (cache-backed) -----------------------
  //
  // Save writes to cache immediately and fires an async
  // disk write in the background (fire-and-forget).
  // Load reads from cache (data populated in initialize()).

  /**
   * Save a SaveGameObject to a named slot.
   * Equivalent to UGameplayStatics::SaveGameToSlot.
   *
   * @returns true on success
   */
  saveGameToSlot(
    saveObject: SaveGameObject,
    slotName: string,
    userIndex: number = 0,
    displayName?: string,
    sceneId?: string,
    playTime?: number,
    gameInstanceVars?: Record<string, any>,
    actorVars?: Record<string, Record<string, any>>,
  ): boolean {
    try {
      const data: SaveFileData = {
        version: 1,
        info: {
          slotName,
          userIndex,
          timestamp: new Date().toISOString(),
          displayName: displayName || slotName,
          sceneId: sceneId || '',
          playTime: playTime || 0,
        },
        saveGameData: saveObject.toJSON(),
        gameInstanceVars: gameInstanceVars ? sanitize(gameInstanceVars) : {},
        actorVars: actorVars
          ? Object.fromEntries(Object.entries(actorVars).map(([k, v]) => [k, sanitize(v)]))
          : {},
        customData: {},
      };

      // Sync - update cache
      const key = this._slotKey(slotName, userIndex);
      this._cache.set(key, data);

      // Async - persist to disk (fire-and-forget)
      this._enqueueDiskWrite(slotName, userIndex, data);

      console.log(`[SaveLoad] Saved slot "${slotName}" user=${userIndex}`);
      return true;
    } catch (e) {
      console.error(`[SaveLoad] Save failed for slot "${slotName}":`, e);
      return false;
    }
  }

  /**
   * Load a SaveGameObject from a named slot.
   * Equivalent to UGameplayStatics::LoadGameFromSlot.
   *
   * @returns populated SaveGameObject or null
   */
  loadGameFromSlot(slotName: string, userIndex: number = 0): SaveGameObject | null {
    const key = this._slotKey(slotName, userIndex);
    const data = this._cache.get(key);
    if (!data) {
      console.warn(`[SaveLoad] Slot "${slotName}" user=${userIndex} not found`);
      return null;
    }
    const obj = new SaveGameObject();
    obj.fromJSON(data.saveGameData || {});
    console.log(`[SaveLoad] Loaded slot "${slotName}" user=${userIndex}`);
    return obj;
  }

  // -- Async save / load (disk-awaited) ----------------------

  /**
   * Save and await disk persistence.
   * Equivalent to UGameplayStatics::AsyncSaveGameToSlot.
   */
  async asyncSaveGameToSlot(
    saveObject: SaveGameObject,
    slotName: string,
    userIndex: number = 0,
    displayName?: string,
    sceneId?: string,
    playTime?: number,
    gameInstanceVars?: Record<string, any>,
    actorVars?: Record<string, Record<string, any>>,
  ): Promise<boolean> {
    const ok = this.saveGameToSlot(
      saveObject, slotName, userIndex,
      displayName, sceneId, playTime,
      gameInstanceVars, actorVars,
    );
    if (!ok) return false;
    await Promise.allSettled(this._pendingIO);
    this._pendingIO = [];
    return true;
  }

  /**
   * Load directly from disk (bypasses/refreshes cache).
   * Equivalent to UGameplayStatics::AsyncLoadGameFromSlot.
   */
  async asyncLoadGameFromSlot(slotName: string, userIndex: number = 0): Promise<SaveGameObject | null> {
    try {
      const invoke = await getTauriInvoke();
      const filePath = this._filePath(slotName, userIndex);
      const json = await invoke('read_file', { path: filePath }) as string;
      const data: SaveFileData = JSON.parse(json);

      // Refresh cache
      const key = this._slotKey(slotName, userIndex);
      this._cache.set(key, data);

      const obj = new SaveGameObject();
      obj.fromJSON(data.saveGameData || {});
      return obj;
    } catch {
      return this.loadGameFromSlot(slotName, userIndex);
    }
  }

  // -- Slot queries ------------------------------------------

  /**
   * Check whether a save exists in the given slot.
   * Equivalent to UGameplayStatics::DoesSaveGameExist.
   */
  doesSaveGameExist(slotName: string, userIndex: number = 0): boolean {
    return this._cache.has(this._slotKey(slotName, userIndex));
  }

  /**
   * Delete a save game from a slot (cache + disk).
   * Equivalent to UGameplayStatics::DeleteGameInSlot.
   */
  deleteSaveGameInSlot(slotName: string, userIndex: number = 0): boolean {
    const key = this._slotKey(slotName, userIndex);
    this._cache.delete(key);
    this._enqueueDiskDelete(slotName, userIndex);
    console.log(`[SaveLoad] Deleted slot "${slotName}" user=${userIndex}`);
    return true;
  }

  /** Get metadata for every cached save slot (sorted newest-first) */
  getAllSaveSlotInfos(): SaveSlotInfo[] {
    const infos: SaveSlotInfo[] = [];
    for (const data of this._cache.values()) infos.push({ ...data.info });
    infos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return infos;
  }

  /** Get metadata for a single slot */
  getSaveSlotInfo(slotName: string, userIndex: number = 0): SaveSlotInfo | null {
    const data = this._cache.get(this._slotKey(slotName, userIndex));
    return data ? { ...data.info } : null;
  }

  /** Number of cached save slots */
  getSaveSlotCount(): number { return this._cache.size; }

  /** Get the full SaveFileData for a slot (to restore game instance vars etc.) */
  getFullSaveData(slotName: string, userIndex: number = 0): SaveFileData | null {
    return this._cache.get(this._slotKey(slotName, userIndex)) || null;
  }

  // -- Internal disk I/O -------------------------------------

  private _enqueueDiskWrite(slotName: string, userIndex: number, data: SaveFileData): void {
    const p = (async () => {
      try {
        const invoke = await getTauriInvoke();
        const filePath = this._filePath(slotName, userIndex);
        const json = JSON.stringify(data, null, 2);
        await invoke('write_file', { path: filePath, contents: json });
      } catch (e) {
        console.warn(`[SaveLoad] Disk write failed for "${slotName}":`, e);
      }
    })();
    this._pendingIO.push(p);
  }

  private _enqueueDiskDelete(slotName: string, userIndex: number): void {
    const p = (async () => {
      try {
        const invoke = await getTauriInvoke();
        const filePath = this._filePath(slotName, userIndex);
        await invoke('delete_file', { path: filePath });
      } catch (e) {
        console.warn(`[SaveLoad] Disk delete failed for "${slotName}":`, e);
      }
    })();
    this._pendingIO.push(p);
  }
}
