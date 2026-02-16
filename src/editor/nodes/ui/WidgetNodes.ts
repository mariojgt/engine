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
  constructor() {
    super('Set Widget Text');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addInput('text', new ClassicPreset.Input(strSocket, 'Text'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addControl('fallbackText', new ClassicPreset.InputControl('text', { initial: 'Hello' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Widget Text', 'UI', () => new SetWidgetTextNode());

// ── Get Widget Text ─────────────────────────────────────────
export class GetWidgetTextNode extends ClassicPreset.Node {
  constructor() {
    super('Get Widget Text');
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('text', new ClassicPreset.Output(strSocket, 'Text'));
  }
}
registerNode('Get Widget Text', 'UI', () => new GetWidgetTextNode());

// ── Set Widget Visibility ───────────────────────────────────
export class SetWidgetVisibilityNode extends ClassicPreset.Node {
  constructor() {
    super('Set Widget Visibility');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addInput('visible', new ClassicPreset.Input(boolSocket, 'Visible'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Widget Visibility', 'UI', () => new SetWidgetVisibilityNode());

// ── Set Widget Color ────────────────────────────────────────
export class SetWidgetColorNode extends ClassicPreset.Node {
  constructor() {
    super('Set Widget Color');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Color'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Widget Color', 'UI', () => new SetWidgetColorNode());

// ── Set Widget Opacity ──────────────────────────────────────
export class SetWidgetOpacityNode extends ClassicPreset.Node {
  constructor() {
    super('Set Widget Opacity');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addInput('opacity', new ClassicPreset.Input(numSocket, 'Opacity'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Widget Opacity', 'UI', () => new SetWidgetOpacityNode());

// ── Set Progress Bar Percent ────────────────────────────────
export class SetProgressBarPercentNode extends ClassicPreset.Node {
  constructor() {
    super('Set Progress Bar Percent');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addInput('percent', new ClassicPreset.Input(numSocket, 'Percent'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Progress Bar Percent', 'UI', () => new SetProgressBarPercentNode());

// ── Get Progress Bar Percent ────────────────────────────────
export class GetProgressBarPercentNode extends ClassicPreset.Node {
  constructor() {
    super('Get Progress Bar Percent');
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('percent', new ClassicPreset.Output(numSocket, 'Percent'));
  }
}
registerNode('Get Progress Bar Percent', 'UI', () => new GetProgressBarPercentNode());

// ── Set Slider Value ────────────────────────────────────────
export class SetSliderValueNode extends ClassicPreset.Node {
  constructor() {
    super('Set Slider Value');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Slider Value', 'UI', () => new SetSliderValueNode());

// ── Get Slider Value ────────────────────────────────────────
export class GetSliderValueNode extends ClassicPreset.Node {
  constructor() {
    super('Get Slider Value');
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}
registerNode('Get Slider Value', 'UI', () => new GetSliderValueNode());

// ── Set CheckBox State ──────────────────────────────────────
export class SetCheckBoxStateNode extends ClassicPreset.Node {
  constructor() {
    super('Set CheckBox State');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addInput('checked', new ClassicPreset.Input(boolSocket, 'Checked'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set CheckBox State', 'UI', () => new SetCheckBoxStateNode());

// ── Get CheckBox State ──────────────────────────────────────
export class GetCheckBoxStateNode extends ClassicPreset.Node {
  constructor() {
    super('Get CheckBox State');
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('checked', new ClassicPreset.Output(boolSocket, 'Checked'));
  }
}
registerNode('Get CheckBox State', 'UI', () => new GetCheckBoxStateNode());

// ── Is Widget Visible ───────────────────────────────────────
export class IsWidgetVisibleNode extends ClassicPreset.Node {
  constructor() {
    super('Is Widget Visible');
    this.addInput('widget', new ClassicPreset.Input(strSocket, 'Widget'));
    this.addInput('widgetName', new ClassicPreset.Input(strSocket, 'Widget Name'));
    this.addControl('fallbackName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('visible', new ClassicPreset.Output(boolSocket, 'Visible'));
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
