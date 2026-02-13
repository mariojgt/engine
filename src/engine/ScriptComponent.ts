import type { GameObject } from './GameObject';

export interface ScriptContext {
  gameObject: GameObject;
  deltaTime: number;
  elapsedTime: number;
  print: (value: any) => void;
}

/**
 * ScriptComponent with UE-style lifecycle events.
 * The code generator produces blocks wrapped in labeled sections:
 *   __beginPlay__: { ... }
 *   __tick__: { ... }
 *   __onDestroy__: { ... }
 */
export class ScriptComponent {
  public code: string = '';
  public nodeData: any = null; // Rete.js serialized graph

  private _beginPlayFn: ((ctx: ScriptContext) => void) | null = null;
  private _tickFn: ((ctx: ScriptContext) => void) | null = null;
  private _onDestroyFn: ((ctx: ScriptContext) => void) | null = null;
  private _hasStarted = false;

  compile(): boolean {
    try {
      const code = this.code || '';

      // Extract lifecycle blocks from generated code
      const beginPlayCode = this._extractBlock(code, '__beginPlay__');
      const tickCode = this._extractBlock(code, '__tick__');
      const destroyCode = this._extractBlock(code, '__onDestroy__');

      // If no lifecycle blocks found, treat entire code as tick
      const hasSections = beginPlayCode !== null || tickCode !== null || destroyCode !== null;
      const fallbackTick = hasSections ? '' : code;

      this._beginPlayFn = this._compileFn(beginPlayCode || '');
      this._tickFn = this._compileFn(tickCode || fallbackTick);
      this._onDestroyFn = this._compileFn(destroyCode || '');
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

  private _compileFn(body: string): ((ctx: ScriptContext) => void) | null {
    if (!body.trim()) return null;
    return new Function(
      'ctx',
      `const { gameObject, deltaTime, elapsedTime, print } = ctx;\n${body}`
    ) as (ctx: ScriptContext) => void;
  }

  private _extractBlock(code: string, label: string): string | null {
    const marker = `// ${label}`;
    const idx = code.indexOf(marker);
    if (idx === -1) return null;

    // Find the next lifecycle marker or end of string
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
