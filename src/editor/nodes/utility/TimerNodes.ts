// ============================================================
//  TimerNodes — UE5-style timer and delay management
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, registerNode } from '../sockets';

// ── Set Timer by Function Name ──────────────────────────────
export class SetTimerByFunctionNode extends ClassicPreset.Node {
  constructor() {
    super('Set Timer by Function Name');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('functionName', new ClassicPreset.Input(strSocket, 'Function Name'));
    this.addInput('time', new ClassicPreset.Input(numSocket, 'Time'));
    this.addInput('looping', new ClassicPreset.Input(boolSocket, 'Looping'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('handle', new ClassicPreset.Output(numSocket, 'Timer Handle'));
  }
}
registerNode('Set Timer by Function Name', 'Timer', () => new SetTimerByFunctionNode());

// ── Set Timer by Event ──────────────────────────────────────
export class SetTimerByEventNode extends ClassicPreset.Node {
  constructor() {
    super('Set Timer by Event');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('time', new ClassicPreset.Input(numSocket, 'Time'));
    this.addInput('looping', new ClassicPreset.Input(boolSocket, 'Looping'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('event', new ClassicPreset.Output(execSocket, 'Event'));
    this.addOutput('handle', new ClassicPreset.Output(numSocket, 'Timer Handle'));
  }
}
registerNode('Set Timer by Event', 'Timer', () => new SetTimerByEventNode());

// ── Clear Timer ─────────────────────────────────────────────
export class ClearTimerNode extends ClassicPreset.Node {
  constructor() {
    super('Clear Timer');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('handle', new ClassicPreset.Input(numSocket, 'Timer Handle'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Clear Timer', 'Timer', () => new ClearTimerNode());

// ── Clear All Timers ────────────────────────────────────────
export class ClearAllTimersNode extends ClassicPreset.Node {
  constructor() {
    super('Clear All Timers');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Clear All Timers', 'Timer', () => new ClearAllTimersNode());

// ── Pause Timer ─────────────────────────────────────────────
export class PauseTimerNode extends ClassicPreset.Node {
  constructor() {
    super('Pause Timer');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('handle', new ClassicPreset.Input(numSocket, 'Timer Handle'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Pause Timer', 'Timer', () => new PauseTimerNode());

// ── Unpause Timer ───────────────────────────────────────────
export class UnpauseTimerNode extends ClassicPreset.Node {
  constructor() {
    super('Unpause Timer');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('handle', new ClassicPreset.Input(numSocket, 'Timer Handle'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Unpause Timer', 'Timer', () => new UnpauseTimerNode());

// ── Timer queries ───────────────────────────────────────────
export class IsTimerActiveNode extends ClassicPreset.Node {
  constructor() {
    super('Is Timer Active');
    this.addInput('handle', new ClassicPreset.Input(numSocket, 'Timer Handle'));
    this.addOutput('active', new ClassicPreset.Output(boolSocket, 'Active'));
  }
}
registerNode('Is Timer Active', 'Timer', () => new IsTimerActiveNode());

export class IsTimerPausedNode extends ClassicPreset.Node {
  constructor() {
    super('Is Timer Paused');
    this.addInput('handle', new ClassicPreset.Input(numSocket, 'Timer Handle'));
    this.addOutput('paused', new ClassicPreset.Output(boolSocket, 'Paused'));
  }
}
registerNode('Is Timer Paused', 'Timer', () => new IsTimerPausedNode());

export class GetTimerRemainingTimeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Timer Remaining Time');
    this.addInput('handle', new ClassicPreset.Input(numSocket, 'Timer Handle'));
    this.addOutput('time', new ClassicPreset.Output(numSocket, 'Remaining'));
  }
}
registerNode('Get Timer Remaining Time', 'Timer', () => new GetTimerRemainingTimeNode());

export class GetTimerElapsedTimeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Timer Elapsed Time');
    this.addInput('handle', new ClassicPreset.Input(numSocket, 'Timer Handle'));
    this.addOutput('time', new ClassicPreset.Output(numSocket, 'Elapsed'));
  }
}
registerNode('Get Timer Elapsed Time', 'Timer', () => new GetTimerElapsedTimeNode());

// ── Retriggerable Delay ─────────────────────────────────────
export class RetriggerableDelayNode extends ClassicPreset.Node {
  constructor() {
    super('Retriggerable Delay');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('duration', new ClassicPreset.Input(numSocket, 'Duration'));
    this.addOutput('completed', new ClassicPreset.Output(execSocket, 'Completed'));
  }
}
registerNode('Retriggerable Delay', 'Flow Control', () => new RetriggerableDelayNode());
