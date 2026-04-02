// ============================================================
//  MontageNodes — Blueprint nodes for Animation Montage system
//
//  Montages are one-shot animations that play on top of the
//  state machine (attack, reload, hit reaction, etc.).
//  When a montage finishes it crossfades back to the state machine.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, registerNode } from '../sockets';

// ============================================================
//  Play Montage — play a one-shot animation over the state machine
// ============================================================
export class PlayMontageNode extends ClassicPreset.Node {
  constructor() {
    super('Play Montage');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('clipName', new ClassicPreset.Input(strSocket, 'Clip Name'));
    this.addInput('blendIn', new ClassicPreset.Input(numSocket, 'Blend In'));
    this.addInput('blendOut', new ClassicPreset.Input(numSocket, 'Blend Out'));
    this.addInput('playRate', new ClassicPreset.Input(numSocket, 'Play Rate'));
    this.addInput('startTime', new ClassicPreset.Input(numSocket, 'Start Time'));
    this.addInput('loop', new ClassicPreset.Input(boolSocket, 'Loop'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Play Montage', 'Animation', () => new PlayMontageNode());

// ============================================================
//  Stop Montage — stop the active montage with blend-out
// ============================================================
export class StopMontageNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Montage');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('blendOut', new ClassicPreset.Input(numSocket, 'Blend Out'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Stop Montage', 'Animation', () => new StopMontageNode());

// ============================================================
//  Is Montage Playing — check if a montage is currently active
// ============================================================
export class IsMontagePlayingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Montage Playing');
    this.addOutput('isPlaying', new ClassicPreset.Output(boolSocket, 'Is Playing'));
    this.addOutput('clipName', new ClassicPreset.Output(strSocket, 'Clip Name'));
  }
}
registerNode('Is Montage Playing', 'Animation', () => new IsMontagePlayingNode());

// ============================================================
//  On Montage Ended — event fires when the active montage finishes
//  Has two exec outputs: Completed (natural end) and Interrupted
// ============================================================
export class OnMontageEndedNode extends ClassicPreset.Node {
  constructor() {
    super('On Montage Ended');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('clipName', new ClassicPreset.Input(strSocket, 'Clip Name'));
    this.addInput('blendIn', new ClassicPreset.Input(numSocket, 'Blend In'));
    this.addInput('blendOut', new ClassicPreset.Input(numSocket, 'Blend Out'));
    this.addInput('playRate', new ClassicPreset.Input(numSocket, 'Play Rate'));
    this.addInput('startTime', new ClassicPreset.Input(numSocket, 'Start Time'));
    this.addInput('loop', new ClassicPreset.Input(boolSocket, 'Loop'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('onCompleted', new ClassicPreset.Output(execSocket, 'On Completed'));
    this.addOutput('onInterrupted', new ClassicPreset.Output(execSocket, 'On Interrupted'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Play Montage and Wait', 'Animation', () => new OnMontageEndedNode());
