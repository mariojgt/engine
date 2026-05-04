// ============================================================
//  CodeEditorPanel — Monaco-based JS code editor.
//
//  Supports two modes:
//   1. GameObject mode (go != null):  edits go.scripts[0].code directly.
//   2. Asset mode (go == null):       edits a ScriptCodeAsset's source.
//
//  Lifecycle functions exposed to user:
//    beginPlay(ctx), tick(ctx, dt), onDestroy(ctx),
//    onOverlap(ctx, other), onMessage(ctx, msg)
//
//  Monaco IntelliSense: a TypeScript declaration for ScriptContext
//  and the helper functions is injected before the editor opens.
// ============================================================

import type { GameObject } from '../engine/GameObject';
import { ScriptComponent } from '../engine/ScriptComponent';
import type { ScriptCodeAsset } from './ScriptCodeAsset';
import type { ScriptCodeAssetManager } from './ScriptCodeAsset';
import { markerCodeToSource, sourceToMarkerCode } from './ScriptCodeAsset';
import { Icons, iconHTML, ICON_COLORS } from './icons';
// Vite ?worker imports — bundled as separate chunks so they resolve correctly
// in both dev (Vite dev server) and production (Tauri custom protocol).
import EditorWorker from '../workers/monaco-editor.worker?worker';
import TsWorker from '../workers/monaco-ts.worker?worker';

// ── Monaco worker setup ────────────────────────────────────────

(self as any).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'javascript' || label === 'typescript') {
      return new TsWorker();
    }
    return new EditorWorker();
  },
};

type MonacoEditor = typeof import('monaco-editor');
let _monacoPromise: Promise<MonacoEditor> | null = null;
function getMonaco(): Promise<MonacoEditor> {
  if (!_monacoPromise) _monacoPromise = import('monaco-editor');
  return _monacoPromise;
}

// ── ScriptContext type declarations for IntelliSense ──────────

const SCRIPT_CONTEXT_DTS = `
declare interface GameObject {
  name: string;
  id: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale:    { x: number; y: number; z: number };
  visible: boolean;
  tags: string[];
  scripts: any[];
  [key: string]: any;
}

declare interface ScriptContext {
  /** The owning game object */
  gameObject: GameObject;
  /** Seconds since last frame */
  deltaTime: number;
  /** Total elapsed play time in seconds */
  elapsedTime: number;
  /** Write a value to the Output Log */
  print(value: any): void;
  /** Physics world */
  physics: any;
  /** Scene — use to spawn / destroy actors, find actors by name/tag */
  scene: {
    spawnActor(name: string, meshType?: string): GameObject;
    destroyActor(go: GameObject): void;
    findActorByName(name: string): GameObject | null;
    findActorsByTag(tag: string): GameObject[];
    getAllActors(): GameObject[];
  };
  /** UI manager for creating/updating widgets */
  uiManager: any;
  /** Animation instance (AnimBP only) */
  animInstance: any;
  /** Mesh asset manager */
  meshAssetManager: any;
  /** Engine reference */
  engine: {
    /** Stop play mode */
    stopPlay(): void;
    /** Current FPS */
    fps: number;
    /** Error callback */
    onError?: (msg: string) => void;
  };
  /** Input manager */
  input: {
    isKeyDown(key: string): boolean;
    isKeyPressed(key: string): boolean;
    isKeyReleased(key: string): boolean;
    getAxis(name: string): number;
    isActionDown(name: string): boolean;
    getMousePosition(): { x: number; y: number };
  };
  /** Persistent game instance state */
  gameInstance: any;
  /** Project manager */
  projectManager: any;
  /** Actor asset manager */
  actorAssetManager: any;
}

declare interface OverlapOther {
  gameObject: GameObject;
  [key: string]: any;
}

declare interface Message {
  type: string;
  payload: any;
}

/**
 * Called once when Play starts.
 * @param ctx Script execution context
 */
declare function beginPlay(ctx: ScriptContext): void;

/**
 * Called every frame.
 * @param ctx Script execution context
 * @param dt  Delta time in seconds
 */
declare function tick(ctx: ScriptContext, dt: number): void;

/**
 * Called when the actor is destroyed.
 * @param ctx Script execution context
 */
declare function onDestroy(ctx: ScriptContext): void;

/**
 * Called when this actor overlaps another physics trigger.
 * @param ctx   Script execution context
 * @param other The overlapping actor info
 */
declare function onOverlap(ctx: ScriptContext, other: OverlapOther): void;

/**
 * Called when this actor receives a message (via SendMessage node).
 * @param ctx Script execution context
 * @param msg The message object
 */
declare function onMessage(ctx: ScriptContext, msg: Message): void;

/**
 * Call parent class beginPlay (available when script has a parent).
 */
declare function super_beginPlay(ctx: ScriptContext): void;
declare function super_tick(ctx: ScriptContext, dt: number): void;
declare function super_onDestroy(ctx: ScriptContext): void;
declare function super_onOverlap(ctx: ScriptContext, other: OverlapOther): void;
declare function super_onMessage(ctx: ScriptContext, msg: Message): void;
`;

let _intellisenseRegistered = false;
async function registerIntelliSense(monaco: MonacoEditor): Promise<void> {
  if (_intellisenseRegistered) return;
  _intellisenseRegistered = true;
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    SCRIPT_CONTEXT_DTS,
    'ts:filename/script-context.d.ts',
  );
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    checkJs: true,
    strict: false,
  });
}

// ── Default template ──────────────────────────────────────────

const TEMPLATE = `// Shared variables declared here are available to all lifecycle functions.
// Use ctx.print(), ctx.scene, ctx.input, etc.

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
  // Called when this actor overlaps another (physics trigger)
}

function onMessage(ctx, msg) {
  // Called when SendMessage targets this actor
  // msg.type, msg.payload
}
`;

// ── Public API ────────────────────────────────────────────────

export interface CodeEditorPanelOptions {
  /** Asset-mode: the script asset being edited */
  scriptAsset?: ScriptCodeAsset;
  /** Asset-mode: manager used for parent-class label refresh */
  scriptCodeManager?: ScriptCodeAssetManager;
  /** Called after every successful compile */
  onCompiled?: (go: GameObject | null) => void;
}

/**
 * Mount the Code Editor into `container`.
 * Pass `go` for game-object mode, or null + `options.scriptAsset` for asset mode.
 * Returns a cleanup function.
 */
export function mountCodeEditor(
  container: HTMLElement,
  go: GameObject | null,
  options: CodeEditorPanelOptions = {},
): () => void {
  container.innerHTML = '';
  container.className = 'code-editor-panel';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--color-bg,#1e1e1e);';

  const { scriptAsset, scriptCodeManager } = options;
  const assetMode = go === null && scriptAsset != null;
  const label = assetMode ? scriptAsset!.name : (go?.name ?? 'Script');
  const parentLabel = assetMode && scriptAsset!.parentId
    ? (scriptCodeManager?.getAsset(scriptAsset!.parentId)?.name ?? 'Unknown')
    : null;

  // ---- toolbar ----
  const toolbar = document.createElement('div');
  toolbar.style.cssText = [
    'display:flex;align-items:center;gap:6px;',
    'padding:4px 8px;',
    'background:var(--color-panel-header,#252526);',
    'border-bottom:1px solid var(--color-border,#3c3c3c);',
    'flex-shrink:0;',
  ].join('');

  const titleLabel = document.createElement('span');
  titleLabel.style.cssText = 'font-size:12px;color:var(--color-text,#ccc);margin-right:auto;display:flex;align-items:center;gap:4px;';
  titleLabel.innerHTML = `${iconHTML(Icons.Code, 14, ICON_COLORS.blueprint)}<span>${label}</span>${
    parentLabel ? `<span style="font-size:10px;color:var(--color-text-muted,#888);">extends ${parentLabel}</span>` : ''
  }`;
  toolbar.appendChild(titleLabel);

  const statusEl = document.createElement('span');
  statusEl.style.cssText = 'font-size:11px;color:var(--color-text-muted,#888);';
  toolbar.appendChild(statusEl);

  const compileBtn = document.createElement('button');
  compileBtn.className = 'btn btn-primary btn-sm';
  compileBtn.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;padding:3px 10px;';
  compileBtn.innerHTML = `${iconHTML(Icons.Play, 12, '#fff')}<span>Compile</span>`;
  compileBtn.title = 'Compile script (Ctrl+S)';
  toolbar.appendChild(compileBtn);

  container.appendChild(toolbar);

  const editorEl = document.createElement('div');
  editorEl.style.cssText = 'flex:1;overflow:hidden;';
  container.appendChild(editorEl);

  // ---- initial source ----
  let initialSource: string;
  if (assetMode) {
    initialSource = scriptAsset!.source || TEMPLATE;
  } else if (go!.scripts.length > 0 && go!.scripts[0].codeMode && go!.scripts[0].code.trim()) {
    initialSource = markerCodeToSource(go!.scripts[0].code);
  } else {
    initialSource = TEMPLATE;
  }

  // ---- compile ----
  let editorInstance: import('monaco-editor').editor.IStandaloneCodeEditor | null = null;
  let monacoRef: MonacoEditor | null = null;
  const MARKER_OWNER = 'thedev-script-compile';

  const setMarkers = (err: { message: string; line?: number; column?: number } | null) => {
    if (!editorInstance || !monacoRef) return;
    const model = editorInstance.getModel();
    if (!model) return;
    if (!err) {
      monacoRef.editor.setModelMarkers(model, MARKER_OWNER, []);
      return;
    }
    const line = Math.max(1, Math.min(err.line ?? 1, model.getLineCount()));
    const col = Math.max(1, err.column ?? 1);
    const lineLen = model.getLineLength(line) || 1;
    monacoRef.editor.setModelMarkers(model, MARKER_OWNER, [{
      severity: monacoRef.MarkerSeverity.Error,
      message: err.message,
      startLineNumber: line,
      startColumn: col,
      endLineNumber: line,
      endColumn: lineLen + 1,
      source: 'compile',
    }]);
  };

  const doCompile = () => {
    if (!editorInstance) return;
    const src = editorInstance.getValue();

    let component: ScriptComponent;
    if (assetMode) {
      // Asset mode: save source, build merged code, compile a temp ScriptComponent for validation
      scriptAsset!.source = src;
      scriptAsset!.touch();
      const code = scriptCodeManager
        ? scriptCodeManager.buildMergedCode(scriptAsset!.id)
        : sourceToMarkerCode(src);
      component = new ScriptComponent();
      component.scriptName = scriptAsset!.name;
      component.code = code;
    } else {
      // GO mode: write merged code directly to scripts[0]
      const code = sourceToMarkerCode(src);
      if (go!.scripts.length === 0) go!.scripts.push(new ScriptComponent());
      go!.scripts[0].code = code;
      go!.scripts[0].codeMode = true;
      go!.scripts[0].scriptName = go!.name;
      component = go!.scripts[0];
    }

    const ok = component.compile();
    setStatus(ok, component.lastError);
    setMarkers(ok ? null : component.lastError);
    options.onCompiled?.(assetMode ? null : go);
  };

  const setStatus = (ok: boolean, err: { message: string } | null) => {
    if (ok) {
      statusEl.textContent = 'Compiled \u2713';
      statusEl.style.color = 'var(--color-success,#4ec9b0)';
      statusEl.title = '';
    } else {
      const msg = err?.message ?? 'unknown error';
      statusEl.textContent = `Compile error: ${msg.length > 60 ? msg.slice(0, 60) + '\u2026' : msg}`;
      statusEl.style.color = 'var(--color-error,#f44747)';
      statusEl.title = msg;
    }
  };

  compileBtn.addEventListener('click', doCompile);

  // ---- load Monaco ----
  getMonaco().then((monaco) => {
    monacoRef = monaco;
    registerIntelliSense(monaco);

    monaco.editor.defineTheme('engine-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: { 'editor.background': '#1e1e1e' },
    });

    editorInstance = monaco.editor.create(editorEl, {
      value: initialSource,
      language: 'javascript',
      theme: 'engine-dark',
      fontSize: 13,
      fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",Menlo,monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      lineNumbers: 'on',
    } as any);

    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      doCompile,
    );

    editorInstance.onDidChangeModelContent(() => {
      statusEl.textContent = '\u25cf unsaved';
      statusEl.style.color = 'var(--color-warning,#cca700)';
    });
  }).catch((err) => {
    editorEl.innerHTML = `<div style="color:#f44747;padding:16px;font-size:12px;">Failed to load Monaco editor: ${err?.message ?? err}</div>`;
  });

  return () => {
    editorInstance?.dispose();
    editorInstance = null;
  };
}

