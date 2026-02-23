// ============================================================
//  ForEachLoopNode — Iterates over an array of objects (actors)
//  Similar to Unreal Engine's ForEachLoop node.
//
//  Inputs:
//    ▶ exec — execution flow in
//    Array  — objectSocket array (e.g. from GetSelectedActors)
//
//  Outputs:
//    Loop Body ▶ — fires for each element
//    Element      — the current element (ObjectRef)
//    Index        — the current loop index (Number)
//    Completed ▶  — fires after all elements processed
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, objectSocket, registerNode } from '../sockets';

export class ForEachLoopNode extends ClassicPreset.Node {
  constructor() {
    super('For Each Loop');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('array', new ClassicPreset.Input(objectSocket, 'Array'));
    this.addOutput('body', new ClassicPreset.Output(execSocket, 'Loop Body'));
    this.addOutput('element', new ClassicPreset.Output(objectSocket, 'Element'));
    this.addOutput('index', new ClassicPreset.Output(numSocket, 'Index'));
    this.addOutput('done', new ClassicPreset.Output(execSocket, 'Completed'));
  }
}
registerNode('For Each Loop', 'Flow Control', () => new ForEachLoopNode());

// ============================================================
//  ForEachLoopWithBreakNode — Same as above but with a Break pin
// ============================================================
export class ForEachLoopWithBreakNode extends ClassicPreset.Node {
  constructor() {
    super('For Each Loop with Break');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('array', new ClassicPreset.Input(objectSocket, 'Array'));
    this.addOutput('body', new ClassicPreset.Output(execSocket, 'Loop Body'));
    this.addOutput('element', new ClassicPreset.Output(objectSocket, 'Element'));
    this.addOutput('index', new ClassicPreset.Output(numSocket, 'Index'));
    this.addInput('break', new ClassicPreset.Input(execSocket, 'Break'));
    this.addOutput('done', new ClassicPreset.Output(execSocket, 'Completed'));
  }
}
registerNode('For Each Loop with Break', 'Flow Control', () => new ForEachLoopWithBreakNode());
