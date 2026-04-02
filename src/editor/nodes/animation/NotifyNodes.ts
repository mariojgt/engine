// ============================================================
//  NotifyNodes — Blueprint nodes for Animation Notify system
//
//  Notifies fire callbacks when animation playback crosses a
//  specific time marker. Used for footsteps, attack windows,
//  VFX spawning, and sound cues tied to animation.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, strSocket, registerNode } from '../sockets';

// ============================================================
//  Add Anim Notify — register a notify marker on a clip
// ============================================================
export class AddAnimNotifyNode extends ClassicPreset.Node {
  constructor() {
    super('Add Anim Notify');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('notifyName', new ClassicPreset.Input(strSocket, 'Notify Name'));
    this.addInput('time', new ClassicPreset.Input(numSocket, 'Time (sec)'));
    this.addInput('clipName', new ClassicPreset.Input(strSocket, 'Clip Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Anim Notify', 'Animation', () => new AddAnimNotifyNode());

// ============================================================
//  Remove Anim Notify — remove all notifies with a given name
// ============================================================
export class RemoveAnimNotifyNode extends ClassicPreset.Node {
  constructor() {
    super('Remove Anim Notify');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('notifyName', new ClassicPreset.Input(strSocket, 'Notify Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Remove Anim Notify', 'Animation', () => new RemoveAnimNotifyNode());

// ============================================================
//  On Anim Notify — event fires when a named notify is crossed
//  This is a latent node — registers a callback during BeginPlay
//  that fires the exec output whenever the notify triggers.
// ============================================================
export class OnAnimNotifyNode extends ClassicPreset.Node {
  public notifyName: string;

  constructor(notifyName = 'Footstep') {
    super(`On Anim Notify: ${notifyName}`);
    this.notifyName = notifyName;
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('notifyName', new ClassicPreset.Output(strSocket, 'Notify Name'));
  }
}
registerNode('On Anim Notify', 'Animation', () => new OnAnimNotifyNode());
