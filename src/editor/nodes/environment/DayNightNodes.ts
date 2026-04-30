// ============================================================
//  DayNightNodes — Blueprint nodes for the DayNight cycle.
//
//  All nodes are UI-only definitions. Code generation lives in
//  nodeEditor/codeGen.ts under the matching `case` labels.
//
//  Quickstart: drop an "Enable Day/Night Cycle" node onto an
//  Event BeginPlay graph, then read "Get Daylight" anywhere
//  you need the current intensity.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  numSocket,
  boolSocket,
  registerNode,
} from '../sockets';

// ── Enable / Disable ──────────────────────────────────────────

export class EnableDayNightCycleNode extends ClassicPreset.Node {
  constructor() {
    super('Enable Day/Night Cycle');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('cycleSeconds', new ClassicPreset.Input(numSocket, 'Cycle Seconds'));
    this.addInput('startPhase', new ClassicPreset.Input(numSocket, 'Start Phase'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Enable Day/Night Cycle', 'Environment', () => new EnableDayNightCycleNode());

export class DisableDayNightCycleNode extends ClassicPreset.Node {
  constructor() {
    super('Disable Day/Night Cycle');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Disable Day/Night Cycle', 'Environment', () => new DisableDayNightCycleNode());

// ── Control ───────────────────────────────────────────────────

export class SetTimeOfDayNode extends ClassicPreset.Node {
  constructor() {
    super('Set Time of Day');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('phase', new ClassicPreset.Input(numSocket, 'Phase (0..1)'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Time of Day', 'Environment', () => new SetTimeOfDayNode());

export class PauseDayNightNode extends ClassicPreset.Node {
  constructor() {
    super('Pause Day/Night');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Pause Day/Night', 'Environment', () => new PauseDayNightNode());

export class ResumeDayNightNode extends ClassicPreset.Node {
  constructor() {
    super('Resume Day/Night');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Resume Day/Night', 'Environment', () => new ResumeDayNightNode());

// ── Read (pure value) ─────────────────────────────────────────

export class GetDayNightPhaseNode extends ClassicPreset.Node {
  constructor() {
    super('Get Day/Night Phase');
    this.addOutput('phase', new ClassicPreset.Output(numSocket, 'Phase'));
  }
}
registerNode('Get Day/Night Phase', 'Environment', () => new GetDayNightPhaseNode());

export class GetDaylightNode extends ClassicPreset.Node {
  constructor() {
    super('Get Daylight');
    this.addOutput('daylight', new ClassicPreset.Output(numSocket, 'Daylight'));
  }
}
registerNode('Get Daylight', 'Environment', () => new GetDaylightNode());

export class IsDayNode extends ClassicPreset.Node {
  constructor() {
    super('Is Day');
    this.addOutput('isDay', new ClassicPreset.Output(boolSocket, 'Is Day'));
  }
}
registerNode('Is Day', 'Environment', () => new IsDayNode());
