import type { GameObject } from './GameObject';

export interface ScriptContext {
  gameObject: GameObject;
  deltaTime: number;
  elapsedTime: number;
  print: (value: any) => void;
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
  private _hasStarted = false;

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

      if (!hasSections && !preamble) {
        // Legacy: treat entire code as tick
        this._beginPlayFn = null;
        this._tickFn = this._compileSingleFn(code);
        this._onDestroyFn = null;
      } else {
        // Compile as a single closure that shares variable scope
        const compiled = this._compileShared(preamble, beginPlayCode, tickCode, destroyCode);
        this._beginPlayFn = compiled.beginPlay;
        this._tickFn = compiled.tick;
        this._onDestroyFn = compiled.onDestroy;
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
  } {
    // We build a factory function that returns { beginPlay, tick, onDestroy } closures.
    // The preamble runs once at compile time (declares shared variables/functions).
    // Shared context variables are declared at factory scope so that
    // user-defined functions in the preamble can access them.  Each
    // lifecycle closure assigns (not var-declares) to update them.
    const factoryBody = `
var gameObject, deltaTime, elapsedTime, print;

${preamble}

var __bp = null;
var __tk = null;
var __od = null;

${beginPlay.trim() ? `__bp = function(ctx) {
  gameObject = ctx.gameObject;
  deltaTime = ctx.deltaTime;
  elapsedTime = ctx.elapsedTime;
  print = ctx.print;
  ${beginPlay}
};` : ''}

${tick.trim() ? `__tk = function(ctx) {
  gameObject = ctx.gameObject;
  deltaTime = ctx.deltaTime;
  elapsedTime = ctx.elapsedTime;
  print = ctx.print;
  ${tick}
};` : ''}

${onDestroy.trim() ? `__od = function(ctx) {
  gameObject = ctx.gameObject;
  deltaTime = ctx.deltaTime;
  elapsedTime = ctx.elapsedTime;
  print = ctx.print;
  ${onDestroy}
};` : ''}

return { beginPlay: __bp, tick: __tk, onDestroy: __od };
`;

    const factory = new Function(factoryBody) as () => {
      beginPlay: ((ctx: ScriptContext) => void) | null;
      tick: ((ctx: ScriptContext) => void) | null;
      onDestroy: ((ctx: ScriptContext) => void) | null;
    };

    return factory();
  }

  private _compileSingleFn(body: string): ((ctx: ScriptContext) => void) | null {
    if (!body.trim()) return null;
    return new Function(
      'ctx',
      `const { gameObject, deltaTime, elapsedTime, print } = ctx;\n${body}`
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
    if (!this._beginPlayFn) return;
    try {
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
    if (!this._tickFn) return;
    try {
      this._tickFn(ctx);
    } catch (e) {
      console.error('Tick error:', e);
    }
  }

  onDestroy(ctx: ScriptContext): void {
    if (!this._onDestroyFn) return;
    try {
      this._onDestroyFn(ctx);
    } catch (e) {
      console.error('OnDestroy error:', e);
    }
    this._hasStarted = false;
  }

  reset(): void {
    this._hasStarted = false;
  }
}
