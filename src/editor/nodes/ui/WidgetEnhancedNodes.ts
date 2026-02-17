// ============================================================
//  WidgetEnhancedNodes — Extended widget manipulation nodes
//  for real-time control: textures, tinting, fonts, transforms,
//  animation curves, and widget property manipulation.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  strSocket,
  numSocket,
  boolSocket,
  colorSocket,
  vec3Socket,
  widgetSocket,
  registerNode,
} from '../sockets';
import { WidgetSelectorControl } from './WidgetNodes';

// ============================================================
//  IMAGE NODES
// ============================================================

// ── Set Image Texture ───────────────────────────────────────
export class SetImageTextureNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Image Texture');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Image');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('texture', new ClassicPreset.Input(strSocket, 'Texture ID'));
    this.addInput('blendTime', new ClassicPreset.Input(numSocket, 'Blend Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Image Texture', 'UI - Image', () => new SetImageTextureNode());

// ── Set Image Tint ──────────────────────────────────────────
export class SetImageTintNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Image Tint');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Image');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Tint Color'));
    this.addInput('strength', new ClassicPreset.Input(numSocket, 'Strength'));
    this.addInput('blendTime', new ClassicPreset.Input(numSocket, 'Blend Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Image Tint', 'UI - Image', () => new SetImageTintNode());

// ── Set Image UV Rect ───────────────────────────────────────
export class SetImageUVRectNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Image UV Rect');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Image');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('u', new ClassicPreset.Input(numSocket, 'U'));
    this.addInput('v', new ClassicPreset.Input(numSocket, 'V'));
    this.addInput('uWidth', new ClassicPreset.Input(numSocket, 'U Width'));
    this.addInput('vHeight', new ClassicPreset.Input(numSocket, 'V Height'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Image UV Rect', 'UI - Image', () => new SetImageUVRectNode());

// ── Play Image Flip Book ────────────────────────────────────
export class PlayImageFlipBookNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Play Image Flip Book');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Image');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('spriteSheet', new ClassicPreset.Input(strSocket, 'Sprite Sheet'));
    this.addInput('frameWidth', new ClassicPreset.Input(numSocket, 'Frame Width'));
    this.addInput('frameHeight', new ClassicPreset.Input(numSocket, 'Frame Height'));
    this.addInput('fps', new ClassicPreset.Input(numSocket, 'FPS'));
    this.addInput('loop', new ClassicPreset.Input(boolSocket, 'Loop'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Play Image Flip Book', 'UI - Image', () => new PlayImageFlipBookNode());

// ============================================================
//  TEXT NODES (Enhanced)
// ============================================================

// ── Set Text Color (Enhanced) ───────────────────────────────
export class SetTextColorNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Text Color');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Text');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Color'));
    this.addInput('blendTime', new ClassicPreset.Input(numSocket, 'Blend Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Text Color', 'UI - Text', () => new SetTextColorNode());

// ── Set Font ────────────────────────────────────────────────
export class SetFontNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Font');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Text');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('fontId', new ClassicPreset.Input(strSocket, 'Font Asset ID'));
    this.addInput('size', new ClassicPreset.Input(numSocket, 'Size'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Font', 'UI - Text', () => new SetFontNode());

// ── Set Text Gradient ───────────────────────────────────────
export class SetTextGradientNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Text Gradient');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Text');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('startColor', new ClassicPreset.Input(colorSocket, 'Start Color'));
    this.addInput('endColor', new ClassicPreset.Input(colorSocket, 'End Color'));
    this.addInput('angle', new ClassicPreset.Input(numSocket, 'Angle'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Text Gradient', 'UI - Text', () => new SetTextGradientNode());

// ── Set Text Shadow ─────────────────────────────────────────
export class SetTextShadowNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Text Shadow');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Text');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Color'));
    this.addInput('offsetX', new ClassicPreset.Input(numSocket, 'Offset X'));
    this.addInput('offsetY', new ClassicPreset.Input(numSocket, 'Offset Y'));
    this.addInput('blur', new ClassicPreset.Input(numSocket, 'Blur'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Text Shadow', 'UI - Text', () => new SetTextShadowNode());

// ============================================================
//  BUTTON NODES (Enhanced)
// ============================================================

// ── Set Button Texture ──────────────────────────────────────
export class SetButtonTextureNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Button Texture');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Button');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('state', new ClassicPreset.Input(strSocket, 'State'));
    this.addInput('texture', new ClassicPreset.Input(strSocket, 'Texture ID'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Button Texture', 'UI - Button', () => new SetButtonTextureNode());

// ── Set Button Tint ─────────────────────────────────────────
export class SetButtonTintNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Button Tint');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Button');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('state', new ClassicPreset.Input(strSocket, 'State'));
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Tint Color'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Button Tint', 'UI - Button', () => new SetButtonTintNode());

// ── Set Button Enabled ──────────────────────────────────────
export class SetButtonEnabledNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Button Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', 'Button');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Button Enabled', 'UI - Button', () => new SetButtonEnabledNode());

// ============================================================
//  TRANSFORM NODES
// ============================================================

// ── Set Widget Position ─────────────────────────────────────
export class SetWidgetPositionNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Position');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('blendTime', new ClassicPreset.Input(numSocket, 'Blend Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Widget Position', 'UI - Transform', () => new SetWidgetPositionNode());

// ── Set Widget Size ─────────────────────────────────────────
export class SetWidgetSizeNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Size');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('width', new ClassicPreset.Input(numSocket, 'Width'));
    this.addInput('height', new ClassicPreset.Input(numSocket, 'Height'));
    this.addInput('blendTime', new ClassicPreset.Input(numSocket, 'Blend Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Widget Size', 'UI - Transform', () => new SetWidgetSizeNode());

// ── Set Widget Scale ────────────────────────────────────────
export class SetWidgetScaleNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Scale');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('scaleX', new ClassicPreset.Input(numSocket, 'Scale X'));
    this.addInput('scaleY', new ClassicPreset.Input(numSocket, 'Scale Y'));
    this.addInput('blendTime', new ClassicPreset.Input(numSocket, 'Blend Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Widget Scale', 'UI - Transform', () => new SetWidgetScaleNode());

// ── Set Widget Rotation ─────────────────────────────────────
export class SetWidgetRotationNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Rotation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('angle', new ClassicPreset.Input(numSocket, 'Angle'));
    this.addInput('blendTime', new ClassicPreset.Input(numSocket, 'Blend Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Widget Rotation', 'UI - Transform', () => new SetWidgetRotationNode());

// ── Get Widget Position ─────────────────────────────────────
export class GetWidgetPositionNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Widget Position');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Widget Position', 'UI - Transform', () => new GetWidgetPositionNode());

// ── Get Widget Size ─────────────────────────────────────────
export class GetWidgetSizeNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Get Widget Size');
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('width', new ClassicPreset.Output(numSocket, 'Width'));
    this.addOutput('height', new ClassicPreset.Output(numSocket, 'Height'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Get Widget Size', 'UI - Transform', () => new GetWidgetSizeNode());

// ============================================================
//  ANIMATION NODES
// ============================================================

// ── Animate Widget Float ────────────────────────────────────
export class AnimateWidgetFloatNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Animate Widget Float');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('property', new ClassicPreset.Input(strSocket, 'Property'));
    this.addInput('from', new ClassicPreset.Input(numSocket, 'From'));
    this.addInput('to', new ClassicPreset.Input(numSocket, 'To'));
    this.addInput('duration', new ClassicPreset.Input(numSocket, 'Duration'));
    this.addInput('easing', new ClassicPreset.Input(strSocket, 'Easing'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('onComplete', new ClassicPreset.Output(execSocket, 'On Complete'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Animate Widget Float', 'UI - Animation', () => new AnimateWidgetFloatNode());

// ── Animate Widget Color ────────────────────────────────────
export class AnimateWidgetColorNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Animate Widget Color');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('property', new ClassicPreset.Input(strSocket, 'Property'));
    this.addInput('fromColor', new ClassicPreset.Input(colorSocket, 'From'));
    this.addInput('toColor', new ClassicPreset.Input(colorSocket, 'To'));
    this.addInput('duration', new ClassicPreset.Input(numSocket, 'Duration'));
    this.addInput('easing', new ClassicPreset.Input(strSocket, 'Easing'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('onComplete', new ClassicPreset.Output(execSocket, 'On Complete'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Animate Widget Color', 'UI - Animation', () => new AnimateWidgetColorNode());

// ── Stop Widget Animation ───────────────────────────────────
export class StopWidgetAnimationNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Stop Widget Animation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Stop Widget Animation', 'UI - Animation', () => new StopWidgetAnimationNode());

// ── Pause Widget Animation ──────────────────────────────────
export class PauseWidgetAnimationNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Pause Widget Animation');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Pause Widget Animation', 'UI - Animation', () => new PauseWidgetAnimationNode());

// ── Set Widget Gradient ─────────────────────────────────────
export class SetWidgetGradientNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Gradient');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('startColor', new ClassicPreset.Input(colorSocket, 'Start Color'));
    this.addInput('endColor', new ClassicPreset.Input(colorSocket, 'End Color'));
    this.addInput('angle', new ClassicPreset.Input(numSocket, 'Angle'));
    this.addInput('type', new ClassicPreset.Input(strSocket, 'Type'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Widget Gradient', 'UI - Style', () => new SetWidgetGradientNode());

// ── Set Widget Nine Slice ───────────────────────────────────
export class SetWidgetNineSliceNode extends ClassicPreset.Node {
  public widgetSelector: WidgetSelectorControl;

  constructor() {
    super('Set Widget Nine Slice');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.widgetSelector = new WidgetSelectorControl('', '');
    this.addControl('widgetSelector', this.widgetSelector);
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enable'));
    this.addInput('top', new ClassicPreset.Input(numSocket, 'Top'));
    this.addInput('right', new ClassicPreset.Input(numSocket, 'Right'));
    this.addInput('bottom', new ClassicPreset.Input(numSocket, 'Bottom'));
    this.addInput('left', new ClassicPreset.Input(numSocket, 'Left'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }

  getWidgetName(): string { return this.widgetSelector.value; }
}
registerNode('Set Widget Nine Slice', 'UI - Style', () => new SetWidgetNineSliceNode());
