// ============================================================
//  GameInstance Blueprint Nodes — Typed variable access,
//  function calls, and event triggers for Game Instance.
//  Mirrors the Widget interaction node pattern: a GI blueprint
//  selector dropdown auto-populates variable / function / event
//  dropdowns with types and dynamic pins.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  objectSocket,
  execSocket,
  strSocket,
  registerNode,
} from '../sockets';
import { socketForType } from '../variables/VariableNodes';
import type { VarType } from '../../BlueprintData';

// ── Get Game Instance Node ──────────────────────────────────
// Returns the persistent Game Instance object.
export class GetGameInstanceNode extends ClassicPreset.Node {
  constructor() {
    super('Get Game Instance');
    this.addOutput('instance', new ClassicPreset.Output(objectSocket, 'Instance'));
  }
}
registerNode('Get Game Instance', 'Casting', () => new GetGameInstanceNode());

// ============================================================
//  Controls — reusable Rete controls for GI nodes
// ============================================================

/** Legacy control kept for backwards compat during deserialization */
export class GameInstanceVarNameControl extends ClassicPreset.Control {
  public value: string;
  constructor(initial = '') {
    super();
    this.value = initial;
  }
  setValue(v: string) { this.value = v; }
}

/** Dropdown control for selecting a Game Instance blueprint. */
export class GIBPSelectControl extends ClassicPreset.Control {
  public value: string;        // GI blueprint ID
  public displayName: string;  // human-readable name
  constructor(initialId: string = '', initialName: string = '(none)') {
    super();
    this.value = initialId;
    this.displayName = initialName;
  }
  setValue(id: string, name: string) {
    this.value = id;
    this.displayName = name;
  }
}

/** Dropdown control for selecting a variable from a GI blueprint. */
export class GIVariableSelectorControl extends ClassicPreset.Control {
  public value: string;
  public availableVariables: Array<{ name: string; type: string }> = [];
  constructor(initialValue: string = '') {
    super();
    this.value = initialValue;
  }
  setValue(varName: string) { this.value = varName; }
  setAvailableVariables(vars: Array<{ name: string; type: string }>) {
    this.availableVariables = vars;
  }
}

/** Dropdown control for selecting a function from a GI blueprint. */
export class GIFunctionSelectorControl extends ClassicPreset.Control {
  public value: string;
  public availableFunctions: Array<{ name: string; inputs: any[]; outputs: any[] }> = [];
  constructor(initialValue: string = '') {
    super();
    this.value = initialValue;
  }
  setValue(funcName: string) { this.value = funcName; }
  setAvailableFunctions(fns: Array<{ name: string; inputs: any[]; outputs: any[] }>) {
    this.availableFunctions = fns;
  }
}

/** Dropdown control for selecting a custom event from a GI blueprint. */
export class GIEventSelectorControl extends ClassicPreset.Control {
  public value: string;
  public availableEvents: Array<{ name: string; params: any[] }> = [];
  constructor(initialValue: string = '') {
    super();
    this.value = initialValue;
  }
  setValue(eventName: string) { this.value = eventName; }
  setAvailableEvents(evts: Array<{ name: string; params: any[] }>) {
    this.availableEvents = evts;
  }
}

// ============================================================
//  Get Game Instance Variable (Typed)
// ============================================================
export class GetGameInstanceVariableNode extends ClassicPreset.Node {
  public giBPId: string;
  public giBPName: string;
  public giBPControl: GIBPSelectControl;
  public variableControl: GIVariableSelectorControl;
  public selectedVarType: VarType = 'String';

  constructor(bpId: string = '', bpName: string = '(none)', varName: string = '') {
    super('Get Game Instance Variable');
    this.giBPId = bpId;
    this.giBPName = bpName;

    this.giBPControl = new GIBPSelectControl(bpId, bpName);
    (this.giBPControl as any)._parentNode = this;
    this.addControl('giBP', this.giBPControl);

    this.variableControl = new GIVariableSelectorControl(varName);
    (this.variableControl as any)._parentNode = this;
    this.addControl('variable', this.variableControl);

    this.addOutput('value', new ClassicPreset.Output(strSocket, 'Value'));
  }

  getVariableName(): string { return this.variableControl.value || ''; }

  /** Rebuild output pin to match the selected variable's type */
  rebuildOutputPin(type: VarType): void {
    this.selectedVarType = type;
    try { this.removeOutput('value'); } catch { /* noop */ }
    this.addOutput('value', new ClassicPreset.Output(socketForType(type), 'Value'));
  }
}
registerNode('Get Game Instance Variable', 'Casting', () => new GetGameInstanceVariableNode());

// ============================================================
//  Set Game Instance Variable (Typed)
// ============================================================
export class SetGameInstanceVariableNode extends ClassicPreset.Node {
  public giBPId: string;
  public giBPName: string;
  public giBPControl: GIBPSelectControl;
  public variableControl: GIVariableSelectorControl;
  public selectedVarType: VarType = 'String';

  constructor(bpId: string = '', bpName: string = '(none)', varName: string = '') {
    super('Set Game Instance Variable');
    this.giBPId = bpId;
    this.giBPName = bpName;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));

    this.giBPControl = new GIBPSelectControl(bpId, bpName);
    (this.giBPControl as any)._parentNode = this;
    this.addControl('giBP', this.giBPControl);

    this.variableControl = new GIVariableSelectorControl(varName);
    (this.variableControl as any)._parentNode = this;
    this.addControl('variable', this.variableControl);

    this.addInput('value', new ClassicPreset.Input(strSocket, 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getVariableName(): string { return this.variableControl.value || ''; }

  /** Rebuild input pin to match the selected variable's type */
  rebuildValuePin(type: VarType): void {
    this.selectedVarType = type;
    try { this.removeInput('value'); } catch { /* noop */ }
    this.addInput('value', new ClassicPreset.Input(socketForType(type), 'Value'));
  }
}
registerNode('Set Game Instance Variable', 'Casting', () => new SetGameInstanceVariableNode());

// ============================================================
//  Call Game Instance Function (Dynamic Pins)
// ============================================================
export class CallGameInstanceFunctionNode extends ClassicPreset.Node {
  public giBPId: string;
  public giBPName: string;
  public giBPControl: GIBPSelectControl;
  public functionControl: GIFunctionSelectorControl;
  public functionInputs: Array<{ name: string; type: VarType }>;
  public functionOutputs: Array<{ name: string; type: VarType }>;

  constructor(
    bpId: string = '',
    bpName: string = '(none)',
    funcName: string = '',
    functionInputs: Array<{ name: string; type: VarType }> = [],
    functionOutputs: Array<{ name: string; type: VarType }> = [],
  ) {
    super('Call Game Instance Function');
    this.giBPId = bpId;
    this.giBPName = bpName;
    this.functionInputs = functionInputs;
    this.functionOutputs = functionOutputs;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));

    this.giBPControl = new GIBPSelectControl(bpId, bpName);
    (this.giBPControl as any)._parentNode = this;
    this.addControl('giBP', this.giBPControl);

    this.functionControl = new GIFunctionSelectorControl(funcName);
    (this.functionControl as any)._parentNode = this;
    this.addControl('function', this.functionControl);

    for (const input of functionInputs) {
      this.addInput(`in_${input.name}`, new ClassicPreset.Input(socketForType(input.type), input.name));
    }

    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getFunctionName(): string { return this.functionControl.value || ''; }

  rebuildPins(
    functionInputs: Array<{ name: string; type: VarType }>,
    functionOutputs: Array<{ name: string; type: VarType }>,
  ) {
    for (const key of Object.keys(this.inputs)) {
      if (key.startsWith('in_')) this.removeInput(key);
    }
    for (const key of Object.keys(this.outputs)) {
      if (key.startsWith('out_')) this.removeOutput(key);
    }
    this.functionInputs = functionInputs;
    this.functionOutputs = functionOutputs;
    for (const input of functionInputs) {
      this.addInput(`in_${input.name}`, new ClassicPreset.Input(socketForType(input.type), input.name));
    }
    for (const output of functionOutputs) {
      this.addOutput(`out_${output.name}`, new ClassicPreset.Output(socketForType(output.type), output.name));
    }
  }
}
registerNode('Call Game Instance Function', 'Casting', () => new CallGameInstanceFunctionNode());

// ============================================================
//  Call Game Instance Event (Dynamic Pins)
// ============================================================
export class CallGameInstanceEventNode extends ClassicPreset.Node {
  public giBPId: string;
  public giBPName: string;
  public giBPControl: GIBPSelectControl;
  public eventControl: GIEventSelectorControl;
  public eventParams: Array<{ name: string; type: VarType }>;

  constructor(
    bpId: string = '',
    bpName: string = '(none)',
    eventName: string = '',
    eventParams: Array<{ name: string; type: VarType }> = [],
  ) {
    super('Call Game Instance Event');
    this.giBPId = bpId;
    this.giBPName = bpName;
    this.eventParams = eventParams;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));

    this.giBPControl = new GIBPSelectControl(bpId, bpName);
    (this.giBPControl as any)._parentNode = this;
    this.addControl('giBP', this.giBPControl);

    this.eventControl = new GIEventSelectorControl(eventName);
    (this.eventControl as any)._parentNode = this;
    this.addControl('event', this.eventControl);

    for (const param of eventParams) {
      this.addInput(`param_${param.name}`, new ClassicPreset.Input(socketForType(param.type), param.name));
    }

    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getEventName(): string { return this.eventControl.value || ''; }

  rebuildPins(eventParams: Array<{ name: string; type: VarType }>) {
    for (const key of Object.keys(this.inputs)) {
      if (key.startsWith('param_')) this.removeInput(key);
    }
    this.eventParams = eventParams;
    for (const param of eventParams) {
      this.addInput(`param_${param.name}`, new ClassicPreset.Input(socketForType(param.type), param.name));
    }
  }
}
registerNode('Call Game Instance Event', 'Casting', () => new CallGameInstanceEventNode());
