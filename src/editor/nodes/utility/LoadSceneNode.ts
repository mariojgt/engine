import { ClassicPreset } from 'rete';
import { execSocket, registerNode } from '../sockets';
import { SceneSelectControl } from '../utility/OpenSceneNode';

// ── Load Scene Node ─────────────────────────────────────────
// Runtime node that loads a scene and transfers the player character
// to the new scene. The Game Instance persists across the transition.
export class LoadSceneNode extends ClassicPreset.Node {
  constructor() {
    super('Load Scene');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addControl('scene', new SceneSelectControl(''));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Load Scene', 'Utility', () => new LoadSceneNode());
