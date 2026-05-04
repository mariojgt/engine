// ============================================================
//  ScriptCodeAsset — a first-class content-browser asset that
//  contains hand-written JS code for a game actor.
//
//  Supports single-level parent inheritance:
//    - child script can call super.beginPlay(ctx) etc.
//    - EditorLayout builds the merged code before assigning it
//      to scripts[0].code at play time.
// ============================================================

// ── UID helper ────────────────────────────────────────────────

let _nextId = 1;
function uid(): string {
  return 'sc_' + (_nextId++) + '_' + Date.now().toString(36);
}

// ── Persisted shape ───────────────────────────────────────────

export interface ScriptCodeAssetJSON {
  id: string;
  name: string;
  /** Raw user-friendly source (function beginPlay / tick / onDestroy blocks) */
  source: string;
  /** Optional parent script asset ID */
  parentId: string | null;
  createdAt: number;
  modifiedAt: number;
}

// ── Runtime class ─────────────────────────────────────────────

export class ScriptCodeAsset {
  public id: string;
  public name: string;
  /** User-friendly source shown in the Code Editor */
  public source: string;
  /** Parent asset ID for single-level inheritance */
  public parentId: string | null;
  public createdAt: number;
  public modifiedAt: number;

  constructor(name: string, id?: string) {
    this.id = id ?? uid();
    this.name = name;
    this.source = DEFAULT_SOURCE;
    this.parentId = null;
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
  }

  touch(): void { this.modifiedAt = Date.now(); }

  toJSON(): ScriptCodeAssetJSON {
    return {
      id: this.id,
      name: this.name,
      source: this.source,
      parentId: this.parentId,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }

  static fromJSON(j: ScriptCodeAssetJSON): ScriptCodeAsset {
    const a = new ScriptCodeAsset(j.name, j.id);
    a.source = j.source ?? DEFAULT_SOURCE;
    a.parentId = j.parentId ?? null;
    a.createdAt = j.createdAt ?? Date.now();
    a.modifiedAt = j.modifiedAt ?? Date.now();
    return a;
  }
}

// ── Default template (mirrors CodeEditorPanel but with more hooks) ─

export const DEFAULT_SOURCE = `// Shared variables and helpers declared here are available to all lifecycle functions.
// ctx exposes: gameObject, deltaTime, elapsedTime, print,
//              physics, scene, uiManager, engine, input, gameInstance

function beginPlay(ctx) {
  // Called once when Play starts
}

function tick(ctx, dt) {
  // Called every frame while playing
}

function onDestroy(ctx) {
  // Called when the actor is destroyed
}

function onOverlap(ctx, other) {
  // Called when this actor overlaps another (physics trigger/overlap)
}

function onMessage(ctx, msg) {
  // Called when this actor receives a message via SendMessage
  // msg: { type: string, payload: any }
}
`;

// ── Manager ───────────────────────────────────────────────────

export class ScriptCodeAssetManager {
  private _assets: Map<string, ScriptCodeAsset> = new Map();
  private _listeners: Array<() => void> = [];

  on(_event: 'changed', cb: () => void): void {
    this._listeners.push(cb);
  }

  private _emit(): void {
    for (const cb of this._listeners) cb();
  }

  getAll(): ScriptCodeAsset[] {
    return Array.from(this._assets.values());
  }

  getAsset(id: string): ScriptCodeAsset | null {
    return this._assets.get(id) ?? null;
  }

  createAsset(name: string): ScriptCodeAsset {
    const a = new ScriptCodeAsset(name);
    this._assets.set(a.id, a);
    this._emit();
    return a;
  }

  renameAsset(id: string, name: string): void {
    const a = this._assets.get(id);
    if (a) { a.name = name; a.touch(); this._emit(); }
  }

  duplicateAsset(id: string, newName: string): ScriptCodeAsset | null {
    const src = this._assets.get(id);
    if (!src) return null;
    const dup = new ScriptCodeAsset(newName);
    dup.source = src.source;
    dup.parentId = src.parentId;
    this._assets.set(dup.id, dup);
    this._emit();
    return dup;
  }

  removeAsset(id: string): void {
    if (this._assets.delete(id)) this._emit();
  }

  exportAll(): ScriptCodeAssetJSON[] {
    return this.getAll().map(a => a.toJSON());
  }

  importAll(jsons: ScriptCodeAssetJSON[]): void {
    for (const j of jsons) {
      const a = ScriptCodeAsset.fromJSON(j);
      this._assets.set(a.id, a);
    }
    this._emit();
  }

  /**
   * Build the merged runtime code for an asset, applying parent inheritance.
   * Parent lifecycle bodies run first; child overrides can call super explicitly
   * (the generated code exposes super_beginPlay / super_tick etc. as shims).
   */
  buildMergedCode(assetId: string): string {
    const asset = this._assets.get(assetId);
    if (!asset) return '';

    const parent = asset.parentId ? this._assets.get(asset.parentId) : null;

    if (!parent) {
      return sourceToMarkerCode(asset.source);
    }

    // Merge: parent body runs first, child body runs after. super_* shims are
    // injected into the preamble so child code can call them explicitly.
    const parentParsed = parseUserSource(parent.source);
    const childParsed  = parseUserSource(asset.source);

    const preamble = [
      `// -- parent: ${parent.name} --`,
      parentParsed.preamble,
      '',
      `// -- child: ${asset.name} --`,
      childParsed.preamble,
      '',
      // Expose parent bodies as super_* helpers for explicit calls
      `function super_beginPlay(ctx) { ${parentParsed.beginPlay} }`,
      `function super_tick(ctx, dt)   { ${parentParsed.tick} }`,
      `function super_onDestroy(ctx)  { ${parentParsed.onDestroy} }`,
      `function super_onOverlap(ctx, other) { ${parentParsed.onOverlap} }`,
      `function super_onMessage(ctx, msg)   { ${parentParsed.onMessage} }`,
    ].join('\n').trim();

    const merged = `${preamble}

// __beginPlay__
${parentParsed.beginPlay}
${childParsed.beginPlay}

// __tick__
${parentParsed.tick}
${childParsed.tick}

// __onDestroy__
${parentParsed.onDestroy}
${childParsed.onDestroy}

// __onOverlap__
${parentParsed.onOverlap}
${childParsed.onOverlap}

// __onMessage__
${parentParsed.onMessage}
${childParsed.onMessage}
`;
    return merged;
  }
}

// ── Shared parse helpers (used by manager + CodeEditorPanel) ──

export interface ParsedSource {
  preamble: string;
  beginPlay: string;
  tick: string;
  onDestroy: string;
  onOverlap: string;
  onMessage: string;
}

export function parseUserSource(src: string): ParsedSource {
  const extract = (fnName: string, src: string): { body: string; remaining: string } => {
    const re = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{`);
    const m = re.exec(src);
    if (!m) return { body: '', remaining: src };

    let depth = 0;
    const start = m.index + m[0].length - 1;
    let end = start;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    const body = src.slice(start + 1, end).trim();
    const fullMatch = src.slice(m.index, end + 1);
    return { body, remaining: src.replace(fullMatch, '') };
  };

  let rem = src;
  const r1 = extract('beginPlay', rem);   rem = r1.remaining;
  const r2 = extract('tick', rem);        rem = r2.remaining;
  const r3 = extract('onDestroy', rem);   rem = r3.remaining;
  const r4 = extract('onOverlap', rem);   rem = r4.remaining;
  const r5 = extract('onMessage', rem);   rem = r5.remaining;

  return {
    preamble: rem.trim(),
    beginPlay: r1.body,
    tick: r2.body,
    onDestroy: r3.body,
    onOverlap: r4.body,
    onMessage: r5.body,
  };
}

/** Wrap user-friendly source into the // __marker__ format ScriptComponent expects */
export function sourceToMarkerCode(src: string): string {
  const { preamble, beginPlay, tick, onDestroy, onOverlap, onMessage } = parseUserSource(src);
  const parts: string[] = [];
  if (preamble) parts.push(preamble);
  parts.push(`// __beginPlay__\n${beginPlay}`);
  parts.push(`// __tick__\n${tick}`);
  parts.push(`// __onDestroy__\n${onDestroy}`);
  if (onOverlap.trim()) parts.push(`// __onOverlap__\n${onOverlap}`);
  if (onMessage.trim()) parts.push(`// __onMessage__\n${onMessage}`);
  return parts.join('\n\n');
}

/** Reverse: convert marker code back to user-friendly function syntax */
export function markerCodeToSource(code: string): string {
  const extractMarker = (src: string, label: string): string => {
    const marker = `// __${label}__`;
    const idx = src.indexOf(marker);
    if (idx === -1) return '';
    const allMarkers = ['// __beginPlay__', '// __tick__', '// __onDestroy__', '// __onOverlap__', '// __onMessage__'];
    let end = src.length;
    for (const m of allMarkers) {
      if (m === marker) continue;
      const i = src.indexOf(m, idx + marker.length);
      if (i !== -1 && i < end) end = i;
    }
    return src.slice(idx + marker.length, end).trim();
  };

  const preamble = (() => {
    const markers = ['// __beginPlay__', '// __tick__', '// __onDestroy__', '// __onOverlap__', '// __onMessage__'];
    let first = code.length;
    for (const m of markers) {
      const i = code.indexOf(m);
      if (i !== -1 && i < first) first = i;
    }
    return code.slice(0, first).trim();
  })();

  const bp = extractMarker(code, 'beginPlay');
  const tk = extractMarker(code, 'tick');
  const od = extractMarker(code, 'onDestroy');
  const ov = extractMarker(code, 'onOverlap');
  const om = extractMarker(code, 'onMessage');

  const indent = (body: string) => body.split('\n').map(l => '  ' + l).join('\n');

  const lines: string[] = [];
  if (preamble) { lines.push(preamble); lines.push(''); }
  lines.push(`function beginPlay(ctx) {\n${indent(bp)}\n}`);
  lines.push('');
  lines.push(`function tick(ctx, dt) {\n${indent(tk)}\n}`);
  lines.push('');
  lines.push(`function onDestroy(ctx) {\n${indent(od)}\n}`);
  lines.push('');
  lines.push(`function onOverlap(ctx, other) {\n${indent(ov)}\n}`);
  lines.push('');
  lines.push(`function onMessage(ctx, msg) {\n${indent(om)}\n}`);
  return lines.join('\n');
}
