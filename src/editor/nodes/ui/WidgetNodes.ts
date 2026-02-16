// ============================================================
//  Widget Blueprint Nodes — Rete nodes for Widget/UI operations
//  Mirrors UE UMG blueprint nodes: Create Widget, Add to
//  Viewport, Remove from Parent, Set Text, Set Visibility,
//  Set Color, Get/Set Progress Bar percent, etc.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  strSocket,
  numSocket,
  boolSocket,
  colorSocket,
  registerNode,
} from '../sockets';

// ── Widget Blueprint Select Control ─────────────────────────
/**
 * Custom Rete control that stores a widget blueprint ID + display name.
 * Rendered as a searchable dropdown in the node editor React preset.
 */
export class WidgetBPSelectControl extends ClassicPreset.Control {
  public value: string;       // widget blueprint ID
  public displayName: string; // human-readable name

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

// ── Widget Selector Control (for selecting specific widgets) ───
/**
 * Custom control for selecting a specific widget within a Widget Blueprint.
 * Shows a dropdown filtered by widget type (e.g., only Buttons for button events).
 * Context-aware: populated from the current Widget Blueprint being edited.
 */
export class WidgetSelectorControl extends ClassicPreset.Control {
  public value: string;         // widget name (e.g., "PlayButton", "TextBox1")
  public widgetType: string;    // filter by type (e.g., "Button", "TextBox", or "" for all)
  public availableWidgets: Array<{ name: string; type: string }> = [];

  constructor(initialValue: string = '', filterType: string = '') {
    super();
    this.value = initialValue;
    this.widgetType = filterType;
  }

  setValue(widgetName: string) {
    this.value = widgetName;
  }

  /**
   * Update available widgets from Widget Blueprint context.
   * Called by the node editor when rendering.
   */
  setAvailableWidgets(widgets: Array<{ name: string; type: string }>) {
    if (this.widgetType) {
      // Filter by widget type
      this.availableWidgets = widgets.filter(w => w.type === this.widgetType);
    } else {
      // Show all widgets
      this.availableWidgets = widgets;
    }
  }
}

// ── Create Widget ───────────────────────────────────────────
export class CreateWidgetNode extends ClassicPreset.Node {
  public widgetBPId: string;
  public widgetBPName: string;

  constructor(bpId: string = '', bpName: string = '(none)') {
    super('Create Widget');
    this.widgetBPId = bpId;
    this.widgetBPName = bpName;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    const selectCtrl = new WidgetBPSelectControl(bpId, bpName);
    // Keep a back-reference so the renderer can sync fields
    (selectCtrl as any)._parentNode = this;
    this.addControl('widgetBP', selectCtrl);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('widget', new ClassicPreset.Output(strSocket, 'Widget'));
  }
}
registerNode('Create Widget', 'UI', () => new CreateWidgetNode());

// ── Add to Viewport ─────────────────────────────────────────
export class AddToViewportNode extends ClassicPreset.Node {
  constructor() {
    super('Add to Viewport');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add to Viewport', 'UI', () => new AddToViewportNode());

// ── Remove from Viewport ────────────────────────────────────
export class RemoveFromViewportNode extends ClassicPreset.Node {
  constructor() {
    super('Remove from Viewport');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Remove from Viewport', 'UI', () => new RemoveFromViewportNode());

// ── Set Widget Text ─────────────────────────────────────────
export class SetWidgetTextNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Text');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('text', new ClassicPreset.Input(strSocket, 'Text'));
    // Widget selector dropdown - filters to Text widgets only
    this.widgetSelector = new WidgetSelectorControl('', 'Text');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Set Widget Text', 'UI', () => new SetWidgetTextNode());

// ── Get Widget Text ─────────────────────────────────────────
export class GetWidgetTextNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Widget Text');
    // Widget selector dropdown - filters to Text widgets only
    this.widgetSelector = new WidgetSelectorControl('', 'Text');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('text', new ClassicPreset.Output(strSocket, 'Text'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Get Widget Text', 'UI', () => new GetWidgetTextNode());

// ── Set Widget Visibility ───────────────────────────────────
export class SetWidgetVisibilityNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Visibility');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('visible', new ClassicPreset.Input(boolSocket, 'Visible'));
    // Widget selector dropdown - shows all widgets
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Set Widget Visibility', 'UI', () => new SetWidgetVisibilityNode());

// ── Set Widget Color ────────────────────────────────────────
export class SetWidgetColorNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Color');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Color'));
    // Widget selector dropdown - filters to Text widgets (they have color)
    this.widgetSelector = new WidgetSelectorControl('', 'Text');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Set Widget Color', 'UI', () => new SetWidgetColorNode());

// ── Set Widget Opacity ──────────────────────────────────────
export class SetWidgetOpacityNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Opacity');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('opacity', new ClassicPreset.Input(numSocket, 'Opacity'));
    // Widget selector dropdown - shows all widgets
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Set Widget Opacity', 'UI', () => new SetWidgetOpacityNode());

// ── Set Progress Bar Percent ────────────────────────────────
export class SetProgressBarPercentNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Progress Bar Percent');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('percent', new ClassicPreset.Input(numSocket, 'Percent'));
    // Widget selector dropdown - filters to ProgressBar widgets only
    this.widgetSelector = new WidgetSelectorControl('', 'ProgressBar');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Set Progress Bar Percent', 'UI', () => new SetProgressBarPercentNode());

// ── Get Progress Bar Percent ────────────────────────────────
export class GetProgressBarPercentNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Progress Bar Percent');
    // Widget selector dropdown - filters to ProgressBar widgets only
    this.widgetSelector = new WidgetSelectorControl('', 'ProgressBar');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('percent', new ClassicPreset.Output(numSocket, 'Percent'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Get Progress Bar Percent', 'UI', () => new GetProgressBarPercentNode());

// ── Set Slider Value ────────────────────────────────────────
export class SetSliderValueNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Slider Value');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    // Widget selector dropdown - filters to Slider widgets only
    this.widgetSelector = new WidgetSelectorControl('', 'Slider');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Set Slider Value', 'UI', () => new SetSliderValueNode());

// ── Get Slider Value ────────────────────────────────────────
export class GetSliderValueNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Slider Value');
    // Widget selector dropdown - filters to Slider widgets only
    this.widgetSelector = new WidgetSelectorControl('', 'Slider');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Get Slider Value', 'UI', () => new GetSliderValueNode());

// ── Set CheckBox State ──────────────────────────────────────
export class SetCheckBoxStateNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set CheckBox State');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('checked', new ClassicPreset.Input(boolSocket, 'Checked'));
    // Widget selector dropdown - filters to CheckBox widgets only
    this.widgetSelector = new WidgetSelectorControl('', 'CheckBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Set CheckBox State', 'UI', () => new SetCheckBoxStateNode());

// ── Get CheckBox State ──────────────────────────────────────
export class GetCheckBoxStateNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get CheckBox State');
    // Widget selector dropdown - filters to CheckBox widgets only
    this.widgetSelector = new WidgetSelectorControl('', 'CheckBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('checked', new ClassicPreset.Output(boolSocket, 'Checked'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Get CheckBox State', 'UI', () => new GetCheckBoxStateNode());

// ── Is Widget Visible ───────────────────────────────────────
export class IsWidgetVisibleNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Is Widget Visible');
    // Widget selector dropdown - shows all widgets
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('visible', new ClassicPreset.Output(boolSocket, 'Visible'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Is Widget Visible', 'UI', () => new IsWidgetVisibleNode());

// ── Play Widget Animation ───────────────────────────────────
export class PlayWidgetAnimationNode extends ClassicPreset.Node {
  constructor() {
    super('Play Widget Animation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addControl('fallbackAnim', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Play Widget Animation', 'UI', () => new PlayWidgetAnimationNode());

// ── Set Input Mode ──────────────────────────────────────────
export class SetInputModeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Input Mode');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('uiOnly', new ClassicPreset.Input(boolSocket, 'UI Only'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Input Mode', 'UI', () => new SetInputModeNode());

// ── Show Mouse Cursor ───────────────────────────────────────
export class ShowMouseCursorNode extends ClassicPreset.Node {
  constructor() {
    super('Show Mouse Cursor');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('show', new ClassicPreset.Input(boolSocket, 'Show'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Show Mouse Cursor', 'UI', () => new ShowMouseCursorNode());

// ============================================================
//  WIDGET EVENT NODES — UE-style widget event handlers
//  These allow visual programming of widget interactions
// ============================================================

// ── Button OnClicked ────────────────────────────────────────
export class ButtonOnClickedNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('Button OnClicked');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'Button');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Button OnClicked', 'UI Events', () => new ButtonOnClickedNode());

// ── Button OnPressed ────────────────────────────────────────
export class ButtonOnPressedNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('Button OnPressed');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'Button');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Button OnPressed', 'UI Events', () => new ButtonOnPressedNode());

// ── Button OnReleased ───────────────────────────────────────
export class ButtonOnReleasedNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('Button OnReleased');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'Button');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Button OnReleased', 'UI Events', () => new ButtonOnReleasedNode());

// ── Button OnHovered ────────────────────────────────────────
export class ButtonOnHoveredNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('Button OnHovered');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'Button');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Button OnHovered', 'UI Events', () => new ButtonOnHoveredNode());

// ── Button OnUnhovered ──────────────────────────────────────
export class ButtonOnUnhoveredNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('Button OnUnhovered');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'Button');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Button OnUnhovered', 'UI Events', () => new ButtonOnUnhoveredNode());

// ── TextBox OnTextChanged ───────────────────────────────────
export class TextBoxOnTextChangedNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('TextBox OnTextChanged');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'TextBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('text', new ClassicPreset.Output(strSocket, 'Text'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('TextBox OnTextChanged', 'UI Events', () => new TextBoxOnTextChangedNode());

// ── TextBox OnTextCommitted ─────────────────────────────────
export class TextBoxOnTextCommittedNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('TextBox OnTextCommitted');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'TextBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('text', new ClassicPreset.Output(strSocket, 'Text'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('TextBox OnTextCommitted', 'UI Events', () => new TextBoxOnTextCommittedNode());

// ── Slider OnValueChanged ───────────────────────────────────
export class SliderOnValueChangedNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('Slider OnValueChanged');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'Slider');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('Slider OnValueChanged', 'UI Events', () => new SliderOnValueChangedNode());

// ── CheckBox OnCheckStateChanged ────────────────────────────
export class CheckBoxOnCheckStateChangedNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor(initialWidget: string = '') {
    super('CheckBox OnCheckStateChanged');
    this.widgetSelector = new WidgetSelectorControl(initialWidget, 'CheckBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('isChecked', new ClassicPreset.Output(boolSocket, 'Is Checked'));
  }

  getWidgetName(): string {
    return this.widgetSelector.value;
  }
}
registerNode('CheckBox OnCheckStateChanged', 'UI Events', () => new CheckBoxOnCheckStateChangedNode());

// ============================================================
//  Widget Instance Interaction Nodes (for Actor Blueprints)
//  These nodes allow actor blueprints to access widget variables,
//  call widget functions, and interact with widget instances.
// ============================================================

// ── Get Widget Variable ─────────────────────────────────────
export class GetWidgetVariableNode extends ClassicPreset.Node {
  public variableName: ClassicPreset.InputControl<'text'>;

  constructor(varName: string = '') {
    super('Get Widget Variable');
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.variableName = new ClassicPreset.InputControl('text', { initial: varName });
    this.addControl('variableName', this.variableName);
    this.addOutput('value', new ClassicPreset.Output(strSocket, 'Value')); // Generic output
  }

  getVariableName(): string {
    return this.variableName.value || '';
  }
}
registerNode('Get Widget Variable', 'UI', () => new GetWidgetVariableNode());

// ── Set Widget Variable ─────────────────────────────────────
export class SetWidgetVariableNode extends ClassicPreset.Node {
  public variableName: ClassicPreset.InputControl<'text'>;

  constructor(varName: string = '') {
    super('Set Widget Variable');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.variableName = new ClassicPreset.InputControl('text', { initial: varName });
    this.addControl('variableName', this.variableName);
    this.addInput('value', new ClassicPreset.Input(strSocket, 'Value')); // Generic input
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getVariableName(): string {
    return this.variableName.value || '';
  }
}
registerNode('Set Widget Variable', 'UI', () => new SetWidgetVariableNode());

// ── Call Widget Function ────────────────────────────────────
export class CallWidgetFunctionNode extends ClassicPreset.Node {
  public functionName: ClassicPreset.InputControl<'text'>;

  constructor(funcName: string = '') {
    super('Call Widget Function');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.functionName = new ClassicPreset.InputControl('text', { initial: funcName });
    this.addControl('functionName', this.functionName);
    // Generic inputs for function parameters (user can connect any type)
    this.addInput('param1', new ClassicPreset.Input(strSocket, 'Param 1', true)); // optional
    this.addInput('param2', new ClassicPreset.Input(strSocket, 'Param 2', true)); // optional
    this.addInput('param3', new ClassicPreset.Input(strSocket, 'Param 3', true)); // optional
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getFunctionName(): string {
    return this.functionName.value || '';
  }
}
registerNode('Call Widget Function', 'UI', () => new CallWidgetFunctionNode());
