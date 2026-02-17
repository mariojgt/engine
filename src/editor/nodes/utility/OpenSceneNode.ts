import { ClassicPreset } from 'rete';
import { execSocket, registerNode } from '../sockets';

// ── Module-level scene list provider ────────────────────────
// Set from main.ts at startup so the dropdown can enumerate scenes.
let _sceneListProvider: (() => Promise<string[]>) | null = null;

/** Call once at startup to provide the scene list resolver */
export function setSceneListProvider(provider: () => Promise<string[]>): void {
  _sceneListProvider = provider;
}

/** Returns the current provider (used by the control renderer) */
export function getSceneListProvider(): (() => Promise<string[]>) | null {
  return _sceneListProvider;
}

// ── Scene Select Control ────────────────────────────────────
export class SceneSelectControl extends ClassicPreset.Control {
  public value: string;
  constructor(initial = '') {
    super();
    this.value = initial;
  }
  setValue(v: string) {
    this.value = v;
  }
}

// ── Open Scene Node ─────────────────────────────────────────
export class OpenSceneNode extends ClassicPreset.Node {
  constructor() {
    super('Open Scene');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addControl('scene', new SceneSelectControl(''));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Open Scene', 'Utility', () => new OpenSceneNode());
