// ============================================================
//  SkyNodes — Blueprint nodes for the procedural Sky.
//
//  All nodes are UI-only definitions. Code generation lives in
//  nodeEditor/codeGen.ts under the matching `case` labels.
//
//  Quickstart: drop "Enable Sky" onto Event BeginPlay. Pair with
//  "Enable Day/Night Cycle" so colours animate over time.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  numSocket,
  strSocket,
  registerNode,
} from '../sockets';

export class EnableSkyNode extends ClassicPreset.Node {
  constructor() {
    super('Enable Sky');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addInput('dayTexUrl', new ClassicPreset.Input(strSocket, 'Day Texture URL'));
    this.addInput('nightTexUrl', new ClassicPreset.Input(strSocket, 'Night Texture URL'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Enable Sky', 'Environment', () => new EnableSkyNode());

export class DisableSkyNode extends ClassicPreset.Node {
  constructor() {
    super('Disable Sky');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Disable Sky', 'Environment', () => new DisableSkyNode());
