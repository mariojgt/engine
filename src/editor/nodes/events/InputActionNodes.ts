import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, registerNode } from '../sockets';

export class ActionMappingSelectControl extends ClassicPreset.Control {
  public value: string;

  constructor(initial: string = '') {
    super();
    this.value = initial;
  }

  setValue(v: string) {
    this.value = v;
  }
}

export class AxisMappingSelectControl extends ClassicPreset.Control {
  public value: string;

  constructor(initial: string = '') {
    super();
    this.value = initial;
  }

  setValue(v: string) {
    this.value = v;
  }
}

export class InputActionMappingEventNode extends ClassicPreset.Node {
  public selectedAction: string;

  constructor(action: string = '') {
    super('Input Action Event');
    this.selectedAction = action;
    this.addControl('action', new ActionMappingSelectControl(action));
    this.addOutput('pressed', new ClassicPreset.Output(execSocket, 'Pressed'));
    this.addOutput('released', new ClassicPreset.Output(execSocket, 'Released'));
  }
}

export class InputAxisMappingEventNode extends ClassicPreset.Node {
  public selectedAxis: string;

  constructor(axis: string = '') {
    super('Input Axis Event');
    this.selectedAxis = axis;
    this.addControl('axis', new AxisMappingSelectControl(axis));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Axis Value'));
  }
}

export class GetInputActionNode extends ClassicPreset.Node {
  public selectedAction: string;

  constructor(action: string = '') {
    super('Get Input Action');
    this.selectedAction = action;
    this.addControl('action', new ActionMappingSelectControl(action));
    this.addOutput('value', new ClassicPreset.Output(boolSocket, 'Is Down'));
  }
}

export class GetInputAxisNode extends ClassicPreset.Node {
  public selectedAxis: string;

  constructor(axis: string = '') {
    super('Get Input Axis');
    this.selectedAxis = axis;
    this.addControl('axis', new AxisMappingSelectControl(axis));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Axis Value'));
  }
}

export class AddActionMappingKeyNode extends ClassicPreset.Node {
  public selectedAction: string;

  constructor(action: string = '') {
    super('Add Action Mapping Key');
    this.selectedAction = action;
    this.addInput('exec', new ClassicPreset.Input(execSocket, 'Exec'));
    this.addControl('action', new ActionMappingSelectControl(action));
    this.addInput('key', new ClassicPreset.Input(strSocket, 'Key'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
  }
}

export class RemoveActionMappingKeyNode extends ClassicPreset.Node {
  public selectedAction: string;

  constructor(action: string = '') {
    super('Remove Action Mapping Key');
    this.selectedAction = action;
    this.addInput('exec', new ClassicPreset.Input(execSocket, 'Exec'));
    this.addControl('action', new ActionMappingSelectControl(action));
    this.addInput('key', new ClassicPreset.Input(strSocket, 'Key'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
  }
}

export class ClearActionMappingNode extends ClassicPreset.Node {
  public selectedAction: string;

  constructor(action: string = '') {
    super('Clear Action Mapping');
    this.selectedAction = action;
    this.addInput('exec', new ClassicPreset.Input(execSocket, 'Exec'));
    this.addControl('action', new ActionMappingSelectControl(action));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
  }
}

export class AddAxisMappingKeyNode extends ClassicPreset.Node {
  public selectedAxis: string;

  constructor(axis: string = '') {
    super('Add Axis Mapping Key');
    this.selectedAxis = axis;
    this.addInput('exec', new ClassicPreset.Input(execSocket, 'Exec'));
    this.addControl('axis', new AxisMappingSelectControl(axis));
    this.addInput('key', new ClassicPreset.Input(strSocket, 'Key'));
    this.addInput('scale', new ClassicPreset.Input(numSocket, 'Scale'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
  }
}

export class RemoveAxisMappingKeyNode extends ClassicPreset.Node {
  public selectedAxis: string;

  constructor(axis: string = '') {
    super('Remove Axis Mapping Key');
    this.selectedAxis = axis;
    this.addInput('exec', new ClassicPreset.Input(execSocket, 'Exec'));
    this.addControl('axis', new AxisMappingSelectControl(axis));
    this.addInput('key', new ClassicPreset.Input(strSocket, 'Key'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
  }
}

export class ClearAxisMappingNode extends ClassicPreset.Node {
  public selectedAxis: string;

  constructor(axis: string = '') {
    super('Clear Axis Mapping');
    this.selectedAxis = axis;
    this.addInput('exec', new ClassicPreset.Input(execSocket, 'Exec'));
    this.addControl('axis', new AxisMappingSelectControl(axis));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
  }
}

registerNode('Input Action Event', 'Events', () => new InputActionMappingEventNode());
registerNode('Input Axis Event', 'Events', () => new InputAxisMappingEventNode());
registerNode('Get Input Action', 'Input', () => new GetInputActionNode());
registerNode('Get Input Axis', 'Input', () => new GetInputAxisNode());
registerNode('Add Action Mapping Key', 'Input', () => new AddActionMappingKeyNode());
registerNode('Remove Action Mapping Key', 'Input', () => new RemoveActionMappingKeyNode());
registerNode('Clear Action Mapping', 'Input', () => new ClearActionMappingNode());
registerNode('Add Axis Mapping Key', 'Input', () => new AddAxisMappingKeyNode());
registerNode('Remove Axis Mapping Key', 'Input', () => new RemoveAxisMappingKeyNode());
registerNode('Clear Axis Mapping', 'Input', () => new ClearAxisMappingNode());
