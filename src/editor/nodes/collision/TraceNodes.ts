// ============================================================
//  TraceNodes — UE5-style Line/Sphere/Box trace nodes
//  for collision detection and raycasting.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, objectSocket, registerNode } from '../sockets';

// ── Line Trace by Channel ───────────────────────────────────
export class LineTraceByChannelNode extends ClassicPreset.Node {
  constructor() {
    super('Line Trace by Channel');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('startX', new ClassicPreset.Input(numSocket, 'Start X'));
    this.addInput('startY', new ClassicPreset.Input(numSocket, 'Start Y'));
    this.addInput('startZ', new ClassicPreset.Input(numSocket, 'Start Z'));
    this.addInput('endX', new ClassicPreset.Input(numSocket, 'End X'));
    this.addInput('endY', new ClassicPreset.Input(numSocket, 'End Y'));
    this.addInput('endZ', new ClassicPreset.Input(numSocket, 'End Z'));
    this.addInput('drawDebug', new ClassicPreset.Input(boolSocket, 'Draw Debug'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Hit'));
    // Hit result outputs
    this.addOutput('hitX', new ClassicPreset.Output(numSocket, 'Location X'));
    this.addOutput('hitY', new ClassicPreset.Output(numSocket, 'Location Y'));
    this.addOutput('hitZ', new ClassicPreset.Output(numSocket, 'Location Z'));
    this.addOutput('normalX', new ClassicPreset.Output(numSocket, 'Normal X'));
    this.addOutput('normalY', new ClassicPreset.Output(numSocket, 'Normal Y'));
    this.addOutput('normalZ', new ClassicPreset.Output(numSocket, 'Normal Z'));
    this.addOutput('hitActor', new ClassicPreset.Output(objectSocket, 'Hit Actor'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
  }
}
registerNode('Line Trace by Channel', 'Collision', () => new LineTraceByChannelNode());

// ── Sphere Trace by Channel ─────────────────────────────────
export class SphereTraceByChannelNode extends ClassicPreset.Node {
  constructor() {
    super('Sphere Trace by Channel');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('startX', new ClassicPreset.Input(numSocket, 'Start X'));
    this.addInput('startY', new ClassicPreset.Input(numSocket, 'Start Y'));
    this.addInput('startZ', new ClassicPreset.Input(numSocket, 'Start Z'));
    this.addInput('endX', new ClassicPreset.Input(numSocket, 'End X'));
    this.addInput('endY', new ClassicPreset.Input(numSocket, 'End Y'));
    this.addInput('endZ', new ClassicPreset.Input(numSocket, 'End Z'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addInput('drawDebug', new ClassicPreset.Input(boolSocket, 'Draw Debug'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Hit'));
    this.addOutput('hitX', new ClassicPreset.Output(numSocket, 'Location X'));
    this.addOutput('hitY', new ClassicPreset.Output(numSocket, 'Location Y'));
    this.addOutput('hitZ', new ClassicPreset.Output(numSocket, 'Location Z'));
    this.addOutput('normalX', new ClassicPreset.Output(numSocket, 'Normal X'));
    this.addOutput('normalY', new ClassicPreset.Output(numSocket, 'Normal Y'));
    this.addOutput('normalZ', new ClassicPreset.Output(numSocket, 'Normal Z'));
    this.addOutput('hitActor', new ClassicPreset.Output(objectSocket, 'Hit Actor'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
  }
}
registerNode('Sphere Trace by Channel', 'Collision', () => new SphereTraceByChannelNode());

// ── Box Trace ───────────────────────────────────────────────
export class BoxTraceNode extends ClassicPreset.Node {
  constructor() {
    super('Box Trace');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('startX', new ClassicPreset.Input(numSocket, 'Start X'));
    this.addInput('startY', new ClassicPreset.Input(numSocket, 'Start Y'));
    this.addInput('startZ', new ClassicPreset.Input(numSocket, 'Start Z'));
    this.addInput('endX', new ClassicPreset.Input(numSocket, 'End X'));
    this.addInput('endY', new ClassicPreset.Input(numSocket, 'End Y'));
    this.addInput('endZ', new ClassicPreset.Input(numSocket, 'End Z'));
    this.addInput('halfX', new ClassicPreset.Input(numSocket, 'Half Size X'));
    this.addInput('halfY', new ClassicPreset.Input(numSocket, 'Half Size Y'));
    this.addInput('halfZ', new ClassicPreset.Input(numSocket, 'Half Size Z'));
    this.addInput('drawDebug', new ClassicPreset.Input(boolSocket, 'Draw Debug'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Hit'));
    this.addOutput('hitX', new ClassicPreset.Output(numSocket, 'Location X'));
    this.addOutput('hitY', new ClassicPreset.Output(numSocket, 'Location Y'));
    this.addOutput('hitZ', new ClassicPreset.Output(numSocket, 'Location Z'));
    this.addOutput('hitActor', new ClassicPreset.Output(objectSocket, 'Hit Actor'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
  }
}
registerNode('Box Trace', 'Collision', () => new BoxTraceNode());

// ── Break Hit Result ────────────────────────────────────────
export class BreakHitResultNode extends ClassicPreset.Node {
  constructor() {
    super('Break Hit Result');
    this.addInput('hitResult', new ClassicPreset.Input(objectSocket, 'Hit Result'));
    this.addOutput('locationX', new ClassicPreset.Output(numSocket, 'Location X'));
    this.addOutput('locationY', new ClassicPreset.Output(numSocket, 'Location Y'));
    this.addOutput('locationZ', new ClassicPreset.Output(numSocket, 'Location Z'));
    this.addOutput('normalX', new ClassicPreset.Output(numSocket, 'Normal X'));
    this.addOutput('normalY', new ClassicPreset.Output(numSocket, 'Normal Y'));
    this.addOutput('normalZ', new ClassicPreset.Output(numSocket, 'Normal Z'));
    this.addOutput('impactX', new ClassicPreset.Output(numSocket, 'Impact X'));
    this.addOutput('impactY', new ClassicPreset.Output(numSocket, 'Impact Y'));
    this.addOutput('impactZ', new ClassicPreset.Output(numSocket, 'Impact Z'));
    this.addOutput('hitActor', new ClassicPreset.Output(objectSocket, 'Hit Actor'));
    this.addOutput('hitComponent', new ClassicPreset.Output(objectSocket, 'Hit Component'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
    this.addOutput('boneName', new ClassicPreset.Output(strSocket, 'Bone Name'));
  }
}
registerNode('Break Hit Result', 'Collision', () => new BreakHitResultNode());
