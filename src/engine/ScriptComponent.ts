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
export class ScriptComponent {
  public code: string = '';
  public nodeData: any = null;

  private _beginPlayFn: ((ctx: ScriptContext) => void) | null = null;
  private _tickFn: ((ctx: ScriptContext) => void) | null = null;
  private _onDestroyFn: ((ctx: ScriptContext) => void) | null = null;
  public getVars: (() => Record<string, any>) | null = null;
  private _hasStarted = false;

  /** Consecutive tick error counter — script is disabled after MAX_CONSECUTIVE_ERRORS */
  private _consecutiveErrors = 0;
  /** Whether this script has been disabled due to repeated errors */
  public disabled = false;
  /** Max consecutive tick errors before the script is auto-disabled */
  static readonly MAX_CONSECUTIVE_ERRORS = 5;

  compile(): boolean {
    try {
      const code = this.code || '';

      // Split code into preamble (variable/function declarations) and lifecycle blocks
      const beginPlayCode = this._extractBlock(code, '__beginPlay__') || '';
      const tickCode = this._extractBlock(code, '__tick__') || '';
      const destroyCode = this._extractBlock(code, '__onDestroy__') || '';

      const hasSections = beginPlayCode || tickCode || destroyCode;

      // Preamble = everything before the first lifecycle marker
      const preamble = this._extractPreamble(code);

      console.log(`[Script] compile: hasSections=${!!hasSections}, beginPlay=${!!beginPlayCode}, tick=${!!tickCode}, onDestroy=${!!destroyCode}, preamble=${!!preamble}`);

      if (!hasSections && !preamble) {
        // Legacy: treat entire code as tick
        this._beginPlayFn = null;
        this._tickFn = this._compileSingleFn(code);
        this._onDestroyFn = null;
        this.getVars = null;
      } else {
        // Compile as a single closure that shares variable scope
        const compiled = this._compileShared(preamble, beginPlayCode, tickCode, destroyCode);
        this._beginPlayFn = compiled.beginPlay;
        this._tickFn = compiled.tick;
        this._onDestroyFn = compiled.onDestroy;
        this.getVars = compiled.getVars;
      }

      this._hasStarted = false;
      return true;
    } catch (e) {
      console.error('Script compile error:', e);
      this._beginPlayFn = null;
      this._tickFn = null;
      this._onDestroyFn = null;
      return false;
    }
  }

  /**
   * Compile all lifecycle blocks in a single closure so they share
   * variable and function declarations from the preamble.
   */
  private _compileShared(
    preamble: string,
    beginPlay: string,
    tick: string,
    onDestroy: string,
  ): {
    beginPlay: ((ctx: ScriptContext) => void) | null;
    tick: ((ctx: ScriptContext) => void) | null;
    onDestroy: ((ctx: ScriptContext) => void) | null;
    getVars: (() => Record<string, any>) | null;
  } {
    // We build a factory function that returns { beginPlay, tick, onDestroy } closures.
    // The preamble runs once at compile time (declares shared variables/functions).
    // Shared context variables are declared at factory scope so that
    // user-defined functions in the preamble can access them.  Each
    // lifecycle closure assigns (not var-declares) to update them.
    const factoryBody = `
  var gameObject, deltaTime, elapsedTime, print, __physics, __scene, __uiManager, __animInstance, __meshAssetManager, __loadMeshFromAsset, __buildThreeMaterialFromAsset, __engine, __gameInstance, __projectManager, __actorAssetManager, __ctx, __pTrack;

${preamble}

var __bp = null;
var __tk = null;
var __od = null;

${beginPlay.trim() ? `__bp = function(ctx) {
  __ctx = ctx;
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
  __pTrack = ctx.__pTrack || null;
  ${beginPlay}
};` : ''}

${tick.trim() ? `__tk = function(ctx) {
  __ctx = ctx;
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
  __pTrack = ctx.__pTrack || null;
  ${tick}
};` : ''}

${onDestroy.trim() ? `__od = function(ctx) {
  __ctx = ctx;
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
  __pTrack = ctx.__pTrack || null;
  ${onDestroy}
};` : ''}

return { beginPlay: __bp, tick: __tk, onDestroy: __od, getVars: typeof __getVars !== 'undefined' ? __getVars : null };
`;

    const factory = new Function(factoryBody) as () => {
      beginPlay: ((ctx: ScriptContext) => void) | null;
      tick: ((ctx: ScriptContext) => void) | null;
      onDestroy: ((ctx: ScriptContext) => void) | null;
      getVars: (() => Record<string, any>) | null;
    };

    return factory();
  }

  private _compileSingleFn(body: string): ((ctx: ScriptContext) => void) | null {
    if (!body.trim()) return null;
    return new Function(
      'ctx',
      `const __ctx = ctx;\nconst { gameObject, deltaTime, elapsedTime, print } = ctx;\nconst __physics = ctx.physics || null;\nconst __scene = ctx.scene || null;\nconst __uiManager = ctx.uiManager || null;\nconst __animInstance = ctx.animInstance || null;\nconst __meshAssetManager = ctx.meshAssetManager || null;\nconst __loadMeshFromAsset = ctx.loadMeshFromAsset || null;\nconst __buildThreeMaterialFromAsset = ctx.buildThreeMaterialFromAsset || null;\nconst __engine = ctx.engine || null;\nconst __gameInstance = ctx.gameInstance || null;\nconst __projectManager = ctx.projectManager || null;\nconst __actorAssetManager = ctx.actorAssetManager || null;\nconst __pTrack = ctx.__pTrack || null;\n${body}`
    ) as (ctx: ScriptContext) => void;
  }

  /** Extract everything before the first lifecycle marker */
  private _extractPreamble(code: string): string {
    const markers = ['// __beginPlay__', '// __tick__', '// __onDestroy__'];
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

    const nextMarkers = ['// __beginPlay__', '// __tick__', '// __onDestroy__'];
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
    if (!this._beginPlayFn) {
      console.log('[Script] beginPlay: no _beginPlayFn');
      return;
    }
    try {
      console.log('[Script] beginPlay: executing for', ctx.gameObject?.name);
      this._beginPlayFn(ctx);
    } catch (e) {
      console.error('BeginPlay error:', e);
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
      if (this._consecutiveErrors >= ScriptComponent.MAX_CONSECUTIVE_ERRORS) {
        this.disabled = true;
        console.error(
          `[Script] DISABLED "${ctx.gameObject?.name}" after ${this._consecutiveErrors} consecutive tick errors. Last error:`, e
        );
      } else {
        console.error(`[Script] Tick error (${this._consecutiveErrors}/${ScriptComponent.MAX_CONSECUTIVE_ERRORS}) on "${ctx.gameObject?.name}":`, e);
      }
    }
  }

  onDestroy(ctx: ScriptContext): void {
    if (!this._onDestroyFn) {
      console.log('[Script] onDestroy: no _onDestroyFn');
      return;
    }
    try {
      console.log('[Script] onDestroy: executing for', ctx.gameObject?.name);
      this._onDestroyFn(ctx);
    } catch (e) {
      console.error('OnDestroy error:', e);
    }
    this._hasStarted = false;
  }

  reset(): void {
    this._hasStarted = false;
    this._consecutiveErrors = 0;
    this.disabled = false;
  }
}
