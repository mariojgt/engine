import type { GameObject } from './GameObject';

export interface ScriptContext {
  gameObject: GameObject;
  deltaTime: number;
  elapsedTime: number;
  print: (value: any) => void;
  /** PhysicsWorld reference so blueprint nodes can add/remove physics at runtime */
  physics?: any;
  /** Scene reference so casting/reference nodes can query actors at runtime */
  scene?: any;
  /** UIManager reference so widget blueprint nodes can create/mutate UI at runtime */
  uiManager?: any;
  /** AnimationInstance reference for AnimBP event graphs */
  animInstance?: any;
  /** MeshAssetManager singleton for runtime mesh/material swapping */
  meshAssetManager?: any;
  /** loadMeshFromAsset helper for runtime mesh loading */
  loadMeshFromAsset?: any;
  /** buildThreeMaterialFromAsset helper for runtime material building */
  buildThreeMaterialFromAsset?: any;
  /** Engine reference for player controllers, camera, etc. */
  engine?: any;
  /** Input manager reference for handling player input */
  input?: any;
  /** GameInstance reference for cross-level persistent state */
  gameInstance?: any;
  /** ProjectManager reference */
  projectManager?: any;
  /** ActorAssetManager for class hierarchy queries (Get Parent Class, Is Child Of, etc.) */
  actorAssetManager?: any;
  /** Profiler tracking callback — null/undefined when profiler is inactive.
   *  Signature: (nodeLabel, nodeId, category?) => void
   *  The 3rd arg is baked at codegen from NODE_PALETTE category. */
  __pTrack?: ((label: string, id: string, category?: string) => void) | null;
}

/**
 * ScriptComponent with UE-style lifecycle events.
 * The code generator produces:
 *   - Top-level variable/function declarations (shared state)
 *   - Lifecycle blocks wrapped in markers:
 *       // __beginPlay__ ...
 *       // __tick__ ...
 *       // __onDestroy__ ...
 *
 * All code is compiled into a single closure so variables and
 * user-defined functions are shared across lifecycle events.
 */
type CompiledClosures = {
  beginPlay: ((ctx: ScriptContext) => void) | null;
  tick: ((ctx: ScriptContext) => void) | null;
  onDestroy: ((ctx: ScriptContext) => void) | null;
  onOverlap: ((ctx: ScriptContext, other: any) => void) | null;
  onMessage: ((ctx: ScriptContext, msg: any) => void) | null;
  getVars: (() => Record<string, any>) | null;
  setVar: ((name: string, value: any) => boolean) | null;
};

export interface ScriptCompileError {
  message: string;
  line?: number;
  column?: number;
}

export class ScriptComponent {
  public code: string = '';
  public nodeData: any = null;
  /**
   * When true, this script was authored in the Code Editor.
   * The Blueprint node compiler must NOT overwrite `code` while this flag is set.
   */
  public codeMode: boolean = false;
  /** Used as the sourceURL label in devtools; usually the script asset / actor name. */
  public scriptName: string = '';
  /** Last compile error, cleared on successful compile. */
  public lastError: ScriptCompileError | null = null;

  private _beginPlayFn: ((ctx: ScriptContext) => void) | null = null;
  private _tickFn: ((ctx: ScriptContext) => void) | null = null;
  private _onDestroyFn: ((ctx: ScriptContext) => void) | null = null;
  private _onOverlapFn: ((ctx: ScriptContext, other: any) => void) | null = null;
  private _onMessageFn: ((ctx: ScriptContext, msg: any) => void) | null = null;
  public getVars: (() => Record<string, any>) | null = null;
  /** Mutates a runtime blueprint variable. Returns true if the variable existed. */
  public setVar: ((name: string, value: any) => boolean) | null = null;
  private _hasStarted = false;

  /** Consecutive tick error counter — script is disabled after MAX_CONSECUTIVE_ERRORS */
  private _consecutiveErrors = 0;
  /** Whether this script has been disabled due to repeated errors */
  public disabled = false;
  /** Max consecutive tick errors before the script is auto-disabled */
  static readonly MAX_CONSECUTIVE_ERRORS = 5;

  /**
   * Cache of parsed factory functions keyed by `scriptName + code`.
   * Avoids re-parsing JS for every actor that shares the same script —
   * `new Function()` is the expensive part; calling the function is cheap.
   * Stores either a factory `() => CompiledClosures` (shared mode)
   * or the legacy single-tick fn `(ctx) => void`. Each lookup site knows
   * which kind it expects.
   */
  private static _factoryCache = new Map<string, Function>();
  private static readonly _CACHE_LIMIT = 256;

  /** Drop the compile cache (e.g. after a project unload). */
  static clearCompileCache(): void {
    ScriptComponent._factoryCache.clear();
  }

  compile(): boolean {
    try {
      const code = this.code || '';

      // Split code into preamble (variable/function declarations) and lifecycle blocks
      const beginPlayCode = this._extractBlock(code, '__beginPlay__') || '';
      const tickCode = this._extractBlock(code, '__tick__') || '';
      const destroyCode = this._extractBlock(code, '__onDestroy__') || '';
      const overlapCode = this._extractBlock(code, '__onOverlap__') || '';
      const messageCode = this._extractBlock(code, '__onMessage__') || '';

      const hasSections = beginPlayCode || tickCode || destroyCode || overlapCode || messageCode;

      // Preamble = everything before the first lifecycle marker
      const preamble = this._extractPreamble(code);

      let compiled: CompiledClosures;
      if (!hasSections && !preamble) {
        // Legacy: treat entire code as tick
        compiled = {
          beginPlay: null,
          tick: this._compileSingleFn(code),
          onDestroy: null,
          onOverlap: null,
          onMessage: null,
          getVars: null,
          setVar: null,
        };
      } else {
        compiled = this._compileShared(preamble, beginPlayCode, tickCode, destroyCode, overlapCode, messageCode);
      }

      this._beginPlayFn = compiled.beginPlay;
      this._tickFn = compiled.tick;
      this._onDestroyFn = compiled.onDestroy;
      this._onOverlapFn = compiled.onOverlap;
      this._onMessageFn = compiled.onMessage;
      this.getVars = compiled.getVars;
      this.setVar = compiled.setVar;

      this._hasStarted = false;
      this.lastError = null;
      return true;
    } catch (e) {
      this._beginPlayFn = null;
      this._tickFn = null;
      this._onDestroyFn = null;
      this._onOverlapFn = null;
      this._onMessageFn = null;
      this.lastError = parseCompileError(e);
      console.error(`[Script] compile error in "${this.scriptName || 'unnamed'}":`, this.lastError.message);
      return false;
    }
  }

  /**
   * Compile all lifecycle blocks in a single closure so they share
   * variable and function declarations from the preamble.
   *
   * The factory function (the expensive `new Function()` parse) is cached
   * by script name + code, so N actors sharing one script only parse once.
   * Each call to compile still invokes factory() to get a fresh closure
   * (so per-instance state is isolated).
   */
  private _compileShared(
    preamble: string,
    beginPlay: string,
    tick: string,
    onDestroy: string,
    onOverlap: string = '',
    onMessage: string = '',
  ): CompiledClosures {
    const factory = ScriptComponent._getOrBuildSharedFactory(
      this.scriptName,
      this.code,
      preamble,
      beginPlay,
      tick,
      onDestroy,
      onOverlap,
      onMessage,
    );
    return factory();
  }

  private static _getOrBuildSharedFactory(
    scriptName: string,
    fullCode: string,
    preamble: string,
    beginPlay: string,
    tick: string,
    onDestroy: string,
    onOverlap: string,
    onMessage: string,
  ): () => CompiledClosures {
    const cacheKey = 'shared|' + (scriptName || '') + '|' + fullCode;
    const cached = ScriptComponent._factoryCache.get(cacheKey);
    if (cached) return cached as () => CompiledClosures;

    const sourceURL = makeSourceURL(scriptName);

    const factoryBody = `
${CTX_VAR_DECLS}

function __unpack(ctx) {
${CTX_UNPACK_BODY}
}

${preamble}

var __bp = null, __tk = null, __od = null, __ol = null, __om = null;

${beginPlay.trim() ? `__bp = function(ctx) { __unpack(ctx); ${beginPlay} };` : ''}
${tick.trim() ? `__tk = function(ctx) { __unpack(ctx); ${tick} };` : ''}
${onDestroy.trim() ? `__od = function(ctx) { __unpack(ctx); ${onDestroy} };` : ''}
${onOverlap.trim() ? `__ol = function(ctx, other) { __unpack(ctx); ${onOverlap} };` : ''}
${onMessage.trim() ? `__om = function(ctx, msg) { __unpack(ctx); ${onMessage} };` : ''}

return {
  beginPlay: __bp,
  tick: __tk,
  onDestroy: __od,
  onOverlap: __ol,
  onMessage: __om,
  getVars: typeof __getVars !== 'undefined' ? __getVars : null,
  setVar:  typeof __setVar  !== 'undefined' ? __setVar  : null
};
//# sourceURL=${sourceURL}
`;

    const factory = new Function(factoryBody) as () => CompiledClosures;
    ScriptComponent._cachePut(cacheKey, factory);
    return factory;
  }

  private _compileSingleFn(body: string): ((ctx: ScriptContext) => void) | null {
    if (!body.trim()) return null;
    const cacheKey = 'single|' + (this.scriptName || '') + '|' + body;
    const cached = ScriptComponent._factoryCache.get(cacheKey);
    if (cached) return cached as (ctx: ScriptContext) => void;

    const sourceURL = makeSourceURL(this.scriptName);
    const fn = new Function(
      'ctx',
      `${LEGACY_CTX_DECLS}\n${body}\n//# sourceURL=${sourceURL}`,
    ) as (ctx: ScriptContext) => void;
    ScriptComponent._cachePut(cacheKey, fn);
    return fn;
  }

  private static _cachePut(key: string, value: Function): void {
    if (ScriptComponent._factoryCache.size >= ScriptComponent._CACHE_LIMIT) {
      // Simple eviction — drop everything. Cache will rebuild on next compile.
      ScriptComponent._factoryCache.clear();
    }
    ScriptComponent._factoryCache.set(key, value);
  }

  /** Extract everything before the first lifecycle marker */
  private _extractPreamble(code: string): string {
    const markers = ['// __beginPlay__', '// __tick__', '// __onDestroy__', '// __onOverlap__', '// __onMessage__'];
    let first = code.length;
    for (const m of markers) {
      const idx = code.indexOf(m);
      if (idx !== -1 && idx < first) first = idx;
    }
    return code.slice(0, first).trim();
  }

  private _extractBlock(code: string, label: string): string | null {
    const marker = `// ${label}`;
    const idx = code.indexOf(marker);
    if (idx === -1) return null;

    const nextMarkers = ['// __beginPlay__', '// __tick__', '// __onDestroy__', '// __onOverlap__', '// __onMessage__'];
    let end = code.length;
    for (const m of nextMarkers) {
      if (m === marker) continue;
      const mIdx = code.indexOf(m, idx + marker.length);
      if (mIdx !== -1 && mIdx < end) end = mIdx;
    }

    return code.slice(idx + marker.length, end).trim();
  }

  /** Called once when Play starts */
  beginPlay(ctx: ScriptContext): void {
    if (this._hasStarted) return;
    this._hasStarted = true;
    if (!this._beginPlayFn) return;
    try {
      this._beginPlayFn(ctx);
    } catch (e) {
      console.error(`[Script] beginPlay error in "${ctx.gameObject?.name}":`, e);
    }
  }

  /** Called every frame while playing (legacy execute alias) */
  execute(ctx: ScriptContext): void {
    this.tick(ctx);
  }

  tick(ctx: ScriptContext): void {
    if (!this._tickFn || this.disabled) return;
    try {
      this._tickFn(ctx);
      this._consecutiveErrors = 0; // Reset on success
    } catch (e) {
      this._consecutiveErrors++;
      const actor = ctx.gameObject?.name;
      if (this._consecutiveErrors >= ScriptComponent.MAX_CONSECUTIVE_ERRORS) {
        this.disabled = true;
        const msg = `[Script] DISABLED "${actor}" after ${this._consecutiveErrors} consecutive tick errors. Last error: ${(e as any)?.message ?? e}`;
        console.error(msg, e);
        try { (ctx.engine as any)?.onError?.(msg); } catch { /* ignore */ }
      } else {
        const msg = `[Script] Tick error (${this._consecutiveErrors}/${ScriptComponent.MAX_CONSECUTIVE_ERRORS}) on "${actor}": ${(e as any)?.message ?? e}`;
        console.error(msg, e);
        try { (ctx.engine as any)?.onError?.(msg); } catch { /* ignore */ }
      }
    }
  }

  onDestroy(ctx: ScriptContext): void {
    if (!this._onDestroyFn) {
      this._hasStarted = false;
      return;
    }
    try {
      this._onDestroyFn(ctx);
    } catch (e) {
      console.error(`[Script] onDestroy error in "${ctx.gameObject?.name}":`, e);
    }
    this._hasStarted = false;
  }

  onOverlap(ctx: ScriptContext, other: any): void {
    if (!this._onOverlapFn) return;
    try {
      this._onOverlapFn(ctx, other);
    } catch (e) {
      console.error('OnOverlap error:', e);
    }
  }

  onMessage(ctx: ScriptContext, msg: any): void {
    if (!this._onMessageFn) return;
    try {
      this._onMessageFn(ctx, msg);
    } catch (e) {
      console.error('OnMessage error:', e);
    }
  }

  reset(): void {
    this._hasStarted = false;
    this._consecutiveErrors = 0;
    this.disabled = false;
  }
}

// ── Shared compile constants ──────────────────────────────────

const CTX_VAR_DECLS = `var gameObject, deltaTime, elapsedTime, print,
    __physics, __scene, __uiManager, __animInstance,
    __meshAssetManager, __loadMeshFromAsset, __buildThreeMaterialFromAsset,
    __engine, __gameInstance, __projectManager, __actorAssetManager,
    __ctx, __pTrack;`;

const CTX_UNPACK_BODY = `  __ctx = ctx;
  gameObject = ctx.gameObject;
  deltaTime = ctx.deltaTime;
  elapsedTime = ctx.elapsedTime;
  print = ctx.print;
  __physics = ctx.physics || null;
  __scene = ctx.scene || null;
  __uiManager = ctx.uiManager || null;
  __animInstance = ctx.animInstance || null;
  __meshAssetManager = ctx.meshAssetManager || null;
  __loadMeshFromAsset = ctx.loadMeshFromAsset || null;
  __buildThreeMaterialFromAsset = ctx.buildThreeMaterialFromAsset || null;
  __engine = ctx.engine || null;
  __gameInstance = ctx.gameInstance || null;
  __projectManager = ctx.projectManager || null;
  __actorAssetManager = ctx.actorAssetManager || null;
  __pTrack = ctx.__pTrack || null;`;

const LEGACY_CTX_DECLS = `const __ctx = ctx;
const { gameObject, deltaTime, elapsedTime, print } = ctx;
const __physics = ctx.physics || null;
const __scene = ctx.scene || null;
const __uiManager = ctx.uiManager || null;
const __animInstance = ctx.animInstance || null;
const __meshAssetManager = ctx.meshAssetManager || null;
const __loadMeshFromAsset = ctx.loadMeshFromAsset || null;
const __buildThreeMaterialFromAsset = ctx.buildThreeMaterialFromAsset || null;
const __engine = ctx.engine || null;
const __gameInstance = ctx.gameInstance || null;
const __projectManager = ctx.projectManager || null;
const __actorAssetManager = ctx.actorAssetManager || null;
const __pTrack = ctx.__pTrack || null;`;

function makeSourceURL(scriptName: string): string {
  const safe = (scriptName || 'unnamed').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `script_${safe}.js`;
}

/**
 * Best-effort line/column extraction from a `new Function()` SyntaxError.
 * V8 stacks contain `<anonymous>:LINE:COL` for Function-constructed code;
 * other engines vary. Falls back to message-only when unparseable.
 */
function parseCompileError(e: unknown): ScriptCompileError {
  const message = (e as any)?.message ?? String(e);
  const stack = (e as any)?.stack ?? '';
  const match = /<anonymous>:(\d+):(\d+)/.exec(stack);
  if (match) {
    return {
      message,
      line: Number(match[1]),
      column: Number(match[2]),
    };
  }
  return { message };
}
