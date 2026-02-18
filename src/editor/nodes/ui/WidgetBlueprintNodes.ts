// ============================================================
//  WidgetBlueprintNodes — Additional UMG-style nodes for
//  Widget Blueprints: lifecycle events, hierarchy/slot
//  management, canvas slot positioning, utility, scrollbox,
//  and named animation control.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  strSocket,
  numSocket,
  boolSocket,
  widgetSocket,
  registerNode,
} from '../sockets';
import { WidgetSelectorControl } from './WidgetNodes';

// ============================================================
//  LIFECYCLE EVENT NODES
// ============================================================

// ── Event Pre Construct ─────────────────────────────────────
/** Fires before the widget tree is built (design-time & runtime). */
export class EventPreConstructNode extends ClassicPreset.Node {
  constructor() {
    super('Event Pre Construct');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('isDesignTime', new ClassicPreset.Output(boolSocket, 'Is Design Time'));
  }
}
registerNode('Event Pre Construct', 'UI Lifecycle', () => new EventPreConstructNode());

// ── Event Construct ─────────────────────────────────────────
/** Fires when the widget is constructed and added to the viewport. */
export class EventConstructNode extends ClassicPreset.Node {
  constructor() {
    super('Event Construct');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Event Construct', 'UI Lifecycle', () => new EventConstructNode());

// ── Event Destruct ──────────────────────────────────────────
/** Fires when the widget is removed from the viewport / destroyed. */
export class EventDestructNode extends ClassicPreset.Node {
  constructor() {
    super('Event Destruct');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Event Destruct', 'UI Lifecycle', () => new EventDestructNode());

// ── Event Widget Tick ───────────────────────────────────────
/** Fires every frame while the widget is in the viewport. */
export class EventWidgetTickNode extends ClassicPreset.Node {
  constructor() {
    super('Event Widget Tick');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('deltaTime', new ClassicPreset.Output(numSocket, 'Delta Time'));
  }
}
registerNode('Event Widget Tick', 'UI Lifecycle', () => new EventWidgetTickNode());

// ── Event On Initialized ────────────────────────────────────
/** Fires after all properties have been deserialized. */
export class EventOnInitializedNode extends ClassicPreset.Node {
  constructor() {
    super('Event On Initialized');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Event On Initialized', 'UI Lifecycle', () => new EventOnInitializedNode());


// ============================================================
//  HIERARCHY / SLOT MANAGEMENT NODES
// ============================================================

// ── Add Child to Vertical Box ───────────────────────────────
export class AddChildToVerticalBoxNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Add Child to Vertical Box');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'VerticalBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('child', new ClassicPreset.Input(widgetSocket, 'Child Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Add Child to Vertical Box', 'UI Hierarchy', () => new AddChildToVerticalBoxNode());

// ── Add Child to Horizontal Box ─────────────────────────────
export class AddChildToHorizontalBoxNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Add Child to Horizontal Box');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'HorizontalBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('child', new ClassicPreset.Input(widgetSocket, 'Child Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Add Child to Horizontal Box', 'UI Hierarchy', () => new AddChildToHorizontalBoxNode());

// ── Add Child to Canvas Panel ───────────────────────────────
export class AddChildToCanvasPanelNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Add Child to Canvas Panel');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'CanvasPanel');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('child', new ClassicPreset.Input(widgetSocket, 'Child Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Add Child to Canvas Panel', 'UI Hierarchy', () => new AddChildToCanvasPanelNode());

// ── Add Child to Overlay ────────────────────────────────────
export class AddChildToOverlayNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Add Child to Overlay');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Overlay');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('child', new ClassicPreset.Input(widgetSocket, 'Child Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Add Child to Overlay', 'UI Hierarchy', () => new AddChildToOverlayNode());

// ── Add Child to Grid Panel ─────────────────────────────────
export class AddChildToGridPanelNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Add Child to Grid Panel');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'GridPanel');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('child', new ClassicPreset.Input(widgetSocket, 'Child Widget'));
    this.addInput('row', new ClassicPreset.Input(numSocket, 'Row'));
    this.addInput('col', new ClassicPreset.Input(numSocket, 'Column'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Add Child to Grid Panel', 'UI Hierarchy', () => new AddChildToGridPanelNode());

// ── Remove Child ────────────────────────────────────────────
export class RemoveChildNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Remove Child');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('child', new ClassicPreset.Input(widgetSocket, 'Child Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('removed', new ClassicPreset.Output(boolSocket, 'Success'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Remove Child', 'UI Hierarchy', () => new RemoveChildNode());

// ── Remove from Parent ──────────────────────────────────────
export class RemoveFromParentNode extends ClassicPreset.Node {
  constructor() {
    super('Remove from Parent');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Remove from Parent', 'UI Hierarchy', () => new RemoveFromParentNode());

// ── Clear Children ──────────────────────────────────────────
export class ClearChildrenNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Clear Children');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Clear Children', 'UI Hierarchy', () => new ClearChildrenNode());

// ── Get Child At ────────────────────────────────────────────
export class GetChildAtNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Child At');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('index', new ClassicPreset.Input(numSocket, 'Index'));
    this.addOutput('child', new ClassicPreset.Output(widgetSocket, 'Child'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Is Valid'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Child At', 'UI Hierarchy', () => new GetChildAtNode());

// ── Get Child Count ─────────────────────────────────────────
export class GetChildCountNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Child Count');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Child Count', 'UI Hierarchy', () => new GetChildCountNode());

// ── Get Widget from Name ────────────────────────────────────
export class GetWidgetFromNameNode extends ClassicPreset.Node {
  constructor() {
    super('Get Widget from Name');
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Root Widget'));
    this.addInput('name', new ClassicPreset.Input(strSocket, 'Name'));
    this.addOutput('found', new ClassicPreset.Output(widgetSocket, 'Found Widget'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Is Valid'));
  }
}
registerNode('Get Widget from Name', 'UI Hierarchy', () => new GetWidgetFromNameNode());

// ── Get Parent Widget ───────────────────────────────────────
export class GetParentWidgetNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Parent Widget');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('parent', new ClassicPreset.Output(widgetSocket, 'Parent'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Is Valid'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Parent Widget', 'UI Hierarchy', () => new GetParentWidgetNode());


// ============================================================
//  CANVAS SLOT POSITIONING NODES
// ============================================================

// ── Set Canvas Slot Position ────────────────────────────────
export class SetCanvasSlotPositionNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Canvas Slot Position');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Canvas Slot Position', 'UI Slot', () => new SetCanvasSlotPositionNode());

// ── Get Canvas Slot Position ────────────────────────────────
export class GetCanvasSlotPositionNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Canvas Slot Position');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Canvas Slot Position', 'UI Slot', () => new GetCanvasSlotPositionNode());

// ── Set Canvas Slot Size ────────────────────────────────────
export class SetCanvasSlotSizeNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Canvas Slot Size');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('width', new ClassicPreset.Input(numSocket, 'Width'));
    this.addInput('height', new ClassicPreset.Input(numSocket, 'Height'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Canvas Slot Size', 'UI Slot', () => new SetCanvasSlotSizeNode());

// ── Get Canvas Slot Size ────────────────────────────────────
export class GetCanvasSlotSizeNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Canvas Slot Size');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('width', new ClassicPreset.Output(numSocket, 'Width'));
    this.addOutput('height', new ClassicPreset.Output(numSocket, 'Height'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Canvas Slot Size', 'UI Slot', () => new GetCanvasSlotSizeNode());

// ── Set Canvas Slot Anchors ─────────────────────────────────
export class SetCanvasSlotAnchorsNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Canvas Slot Anchors');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('minX', new ClassicPreset.Input(numSocket, 'Min X'));
    this.addInput('minY', new ClassicPreset.Input(numSocket, 'Min Y'));
    this.addInput('maxX', new ClassicPreset.Input(numSocket, 'Max X'));
    this.addInput('maxY', new ClassicPreset.Input(numSocket, 'Max Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Canvas Slot Anchors', 'UI Slot', () => new SetCanvasSlotAnchorsNode());

// ── Get Canvas Slot Anchors ─────────────────────────────────
export class GetCanvasSlotAnchorsNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Canvas Slot Anchors');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('minX', new ClassicPreset.Output(numSocket, 'Min X'));
    this.addOutput('minY', new ClassicPreset.Output(numSocket, 'Min Y'));
    this.addOutput('maxX', new ClassicPreset.Output(numSocket, 'Max X'));
    this.addOutput('maxY', new ClassicPreset.Output(numSocket, 'Max Y'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Canvas Slot Anchors', 'UI Slot', () => new GetCanvasSlotAnchorsNode());

// ── Set Canvas Slot Alignment ───────────────────────────────
export class SetCanvasSlotAlignmentNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Canvas Slot Alignment');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('x', new ClassicPreset.Input(numSocket, 'Alignment X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Alignment Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Canvas Slot Alignment', 'UI Slot', () => new SetCanvasSlotAlignmentNode());

// ── Set Slot Padding ────────────────────────────────────────
export class SetSlotPaddingNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Slot Padding');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('top', new ClassicPreset.Input(numSocket, 'Top'));
    this.addInput('right', new ClassicPreset.Input(numSocket, 'Right'));
    this.addInput('bottom', new ClassicPreset.Input(numSocket, 'Bottom'));
    this.addInput('left', new ClassicPreset.Input(numSocket, 'Left'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Slot Padding', 'UI Slot', () => new SetSlotPaddingNode());


// ============================================================
//  UTILITY NODES
// ============================================================

// ── Is In Viewport ──────────────────────────────────────────
export class IsInViewportNode extends ClassicPreset.Node {
  constructor() {
    super('Is In Viewport');
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Is In Viewport'));
  }
}
registerNode('Is In Viewport', 'UI Utility', () => new IsInViewportNode());

// ── Set Is Enabled ──────────────────────────────────────────
export class SetIsEnabledNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Is Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Is Enabled', 'UI Utility', () => new SetIsEnabledNode());

// ── Get Is Enabled ──────────────────────────────────────────
export class GetIsEnabledNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Is Enabled');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('enabled', new ClassicPreset.Output(boolSocket, 'Enabled'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Is Enabled', 'UI Utility', () => new GetIsEnabledNode());

// ── Set Keyboard Focus ──────────────────────────────────────
export class SetKeyboardFocusNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Keyboard Focus');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Keyboard Focus', 'UI Utility', () => new SetKeyboardFocusNode());

// ── Set Render Translation ──────────────────────────────────
export class SetRenderTranslationNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Render Translation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Render Translation', 'UI Utility', () => new SetRenderTranslationNode());

// ── Set Render Angle ────────────────────────────────────────
export class SetRenderAngleNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Render Angle');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('angle', new ClassicPreset.Input(numSocket, 'Angle (Deg)'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Render Angle', 'UI Utility', () => new SetRenderAngleNode());

// ── Set Render Scale ────────────────────────────────────────
export class SetRenderScaleNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Render Scale');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('scaleX', new ClassicPreset.Input(numSocket, 'Scale X'));
    this.addInput('scaleY', new ClassicPreset.Input(numSocket, 'Scale Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Render Scale', 'UI Utility', () => new SetRenderScaleNode());

// ── Set Render Opacity ──────────────────────────────────────
export class SetRenderOpacityNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Render Opacity');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('opacity', new ClassicPreset.Input(numSocket, 'Opacity'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Render Opacity', 'UI Utility', () => new SetRenderOpacityNode());

// ── Set Widget Tooltip ──────────────────────────────────────
export class SetWidgetTooltipNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Tooltip');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('text', new ClassicPreset.Input(strSocket, 'Tooltip Text'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Widget Tooltip', 'UI Utility', () => new SetWidgetTooltipNode());

// ── Set Cursor Type ─────────────────────────────────────────
export class SetCursorTypeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Cursor Type');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('cursor', new ClassicPreset.Input(strSocket, 'Cursor'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Cursor Type', 'UI Utility', () => new SetCursorTypeNode());

// ── Force Layout Prepass ────────────────────────────────────
/** Forces a layout recalculation — useful after dynamically adding children. */
export class ForceLayoutPrepassNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Force Layout Prepass');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Force Layout Prepass', 'UI Utility', () => new ForceLayoutPrepassNode());

// ── Invalidate Layout ───────────────────────────────────────
export class InvalidateLayoutNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Invalidate Layout');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Invalidate Layout', 'UI Utility', () => new InvalidateLayoutNode());


// ============================================================
//  SCROLLBOX NODES
// ============================================================

// ── Scroll to Start ─────────────────────────────────────────
export class ScrollToStartNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Scroll to Start');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'ScrollBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('animate', new ClassicPreset.Input(boolSocket, 'Animate'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Scroll to Start', 'UI Scroll', () => new ScrollToStartNode());

// ── Scroll to End ───────────────────────────────────────────
export class ScrollToEndNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Scroll to End');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'ScrollBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('animate', new ClassicPreset.Input(boolSocket, 'Animate'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Scroll to End', 'UI Scroll', () => new ScrollToEndNode());

// ── Set Scroll Offset ───────────────────────────────────────
export class SetScrollOffsetNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Scroll Offset');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'ScrollBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('offset', new ClassicPreset.Input(numSocket, 'Offset'));
    this.addInput('animate', new ClassicPreset.Input(boolSocket, 'Animate'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Scroll Offset', 'UI Scroll', () => new SetScrollOffsetNode());

// ── Get Scroll Offset ───────────────────────────────────────
export class GetScrollOffsetNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Scroll Offset');
    this.widgetSelector = new WidgetSelectorControl('', 'ScrollBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('offset', new ClassicPreset.Output(numSocket, 'Offset'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Scroll Offset', 'UI Scroll', () => new GetScrollOffsetNode());

// ── Get Scroll Offset of End ────────────────────────────────
export class GetScrollOffsetOfEndNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Scroll Offset of End');
    this.widgetSelector = new WidgetSelectorControl('', 'ScrollBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('offset', new ClassicPreset.Output(numSocket, 'Offset of End'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Scroll Offset of End', 'UI Scroll', () => new GetScrollOffsetOfEndNode());

// ── Scroll Widget Into View ─────────────────────────────────
export class ScrollWidgetIntoViewNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Scroll Widget Into View');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'ScrollBox');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('child', new ClassicPreset.Input(widgetSocket, 'Child Widget'));
    this.addInput('animate', new ClassicPreset.Input(boolSocket, 'Animate'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Scroll Widget Into View', 'UI Scroll', () => new ScrollWidgetIntoViewNode());


// ============================================================
//  NAMED ANIMATION CONTROL NODES
// ============================================================

// ── Stop Widget Anim by Name ────────────────────────────────
export class StopWidgetAnimByNameNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Anim by Name');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Stop Anim by Name', 'UI Animation', () => new StopWidgetAnimByNameNode());

// ── Pause Widget Anim by Name ───────────────────────────────
export class PauseWidgetAnimByNameNode extends ClassicPreset.Node {
  constructor() {
    super('Pause Anim by Name');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Pause Anim by Name', 'UI Animation', () => new PauseWidgetAnimByNameNode());

// ── Reverse Widget Animation ────────────────────────────────
export class ReverseWidgetAnimationNode extends ClassicPreset.Node {
  constructor() {
    super('Reverse Widget Animation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Reverse Widget Animation', 'UI Animation', () => new ReverseWidgetAnimationNode());

// ── Is Widget Anim Playing ──────────────────────────────────
export class IsWidgetAnimPlayingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Anim Playing');
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addOutput('playing', new ClassicPreset.Output(boolSocket, 'Is Playing'));
  }
}
registerNode('Is Anim Playing', 'UI Animation', () => new IsWidgetAnimPlayingNode());

// ── Get Widget Anim Current Time ────────────────────────────
export class GetWidgetAnimTimeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Anim Time');
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addOutput('time', new ClassicPreset.Output(numSocket, 'Current Time'));
    this.addOutput('duration', new ClassicPreset.Output(numSocket, 'Duration'));
    this.addOutput('normalised', new ClassicPreset.Output(numSocket, 'Normalised (0-1)'));
  }
}
registerNode('Get Anim Time', 'UI Animation', () => new GetWidgetAnimTimeNode());

// ── Set Widget Anim Current Time ────────────────────────────
export class SetWidgetAnimTimeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Anim Time');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addInput('time', new ClassicPreset.Input(numSocket, 'Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Anim Time', 'UI Animation', () => new SetWidgetAnimTimeNode());

// ── Set Anim Play Rate ──────────────────────────────────────
export class SetAnimPlayRateNode extends ClassicPreset.Node {
  constructor() {
    super('Set Anim Play Rate');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addInput('rate', new ClassicPreset.Input(numSocket, 'Play Rate'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Anim Play Rate', 'UI Animation', () => new SetAnimPlayRateNode());

// ── On Anim Finished ────────────────────────────────────────
/** Event node that fires when a named animation completes. */
export class OnAnimFinishedNode extends ClassicPreset.Node {
  constructor() {
    super('On Anim Finished');
    this.addInput('widget', new ClassicPreset.Input(widgetSocket, 'Widget'));
    this.addControl('animName', new ClassicPreset.InputControl('text', { initial: '' }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('animName', new ClassicPreset.Output(strSocket, 'Anim Name'));
  }
}
registerNode('On Anim Finished', 'UI Animation', () => new OnAnimFinishedNode());


// ============================================================
//  WIDGET SWITCHER NODES
// ============================================================

// ── Set Active Widget Index ─────────────────────────────────
export class SetActiveWidgetIndexNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Active Widget Index');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'WidgetSwitcher');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('index', new ClassicPreset.Input(numSocket, 'Index'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Active Widget Index', 'UI Switcher', () => new SetActiveWidgetIndexNode());

// ── Get Active Widget Index ─────────────────────────────────
export class GetActiveWidgetIndexNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Active Widget Index');
    this.widgetSelector = new WidgetSelectorControl('', 'WidgetSwitcher');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('index', new ClassicPreset.Output(numSocket, 'Index'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Active Widget Index', 'UI Switcher', () => new GetActiveWidgetIndexNode());

// ── Set Active Widget ───────────────────────────────────────
export class SetActiveWidgetNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Active Widget');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'WidgetSwitcher');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('child', new ClassicPreset.Input(widgetSocket, 'Child Widget'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Active Widget', 'UI Switcher', () => new SetActiveWidgetNode());

// ── Get Active Widget ───────────────────────────────────────
export class GetActiveWidgetNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Active Widget');
    this.widgetSelector = new WidgetSelectorControl('', 'WidgetSwitcher');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('widget', new ClassicPreset.Output(widgetSocket, 'Active Widget'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Active Widget', 'UI Switcher', () => new GetActiveWidgetNode());
