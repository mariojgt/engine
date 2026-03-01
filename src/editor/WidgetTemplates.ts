// ============================================================
//  WidgetTemplates
//  Factory functions that build complete, hierarchical WidgetNodeJSON
//  trees for common game UI patterns.
//
//  Every factory returns a WidgetTemplate containing:
//    rootId     — the ID to use as the root of this widget tree
//    widgets    — flat Record<id, WidgetNodeJSON> of all nodes
//    namedSlots — key widget IDs for runtime access (e.g. 'artImage', 'nameText')
//
//  Usage:
//    const tpl = createCardTemplate({ width: 200, height: 280 });
//    // Merge into your WidgetBlueprintAsset:
//    for (const [id, w] of Object.entries(tpl.widgets)) {
//      asset.widgets.set(id, w);
//    }
//    asset.rootWidgetId = tpl.rootId;
//
//  Template catalogue:
//    createCardTemplate        — Trading card (art, cost, name, type, text, stats)
//    createHealthBar           — HP/resource bar with icon and value label
//    createDialogBox           — Modal dialog (title, body, confirm/cancel buttons)
//    createTooltip             — Popover tooltip with header and description
//    createInventorySlot       — Item slot with icon, quantity badge, cooldown overlay
//    createAbilityIcon         — Circular ability button with cooldown & key hint
//    createHUDFrame            — Full-screen outer HUD container with edge panels
//    createMinimapFrame        — Bordered minimap frame with optional compass overlay
//    createFloatingLabel       — Floating damage/XP/crit text widget
//    createQuestEntry          — Single quest line item (checkbox + label + reward)
//    createNotificationToast   — Slide-in notification banner
//    createResourcePip         — Icon + numeric value label (mana, gold, ammo...)
//    createStatusEffect        — Status effect icon with countdown overlay
// ============================================================

import {
  createWidgetNode,
  defaultSlot,
  AnchorPresets,
  type WidgetNodeJSON,
} from './WidgetBlueprintData';

// ============================================================
//  Core Types
// ============================================================

/** Output of every template factory. */
export interface WidgetTemplate {
  /** ID of the root widget. Use as WidgetBlueprintAsset.rootWidgetId. */
  rootId: string;
  /**
   * All widget nodes, flat-mapped by ID.
   * Merge into WidgetBlueprintAsset.widgets.
   */
  widgets: Record<string, WidgetNodeJSON>;
  /**
   * Semantic names → widget IDs for important sub-widgets.
   * Access them by name instead of hard-coding IDs.
   * e.g. tpl.namedSlots['artImage']
   */
  namedSlots: Record<string, string>;
}

// ============================================================
//  Internal helpers
// ============================================================

/** Wire parent.children = [child, ...] and return parent. */
function wire(parent: WidgetNodeJSON, ...children: WidgetNodeJSON[]): WidgetNodeJSON {
  parent.children = children.map(c => c.id);
  return parent;
}

/** Build the flat widget record from a tree (parent + all descendants). */
function flatten(...nodes: WidgetNodeJSON[]): Record<string, WidgetNodeJSON> {
  const result: Record<string, WidgetNodeJSON> = {};
  function visit(n: WidgetNodeJSON): void {
    result[n.id] = n;
  }
  nodes.forEach(visit);
  return result;
}

/** Shorthand: create + set slot geometry. */
function node(
  type: Parameters<typeof createWidgetNode>[0],
  name: string,
  x: number, y: number, w: number, h: number,
): WidgetNodeJSON {
  const n = createWidgetNode(type, name);
  n.slot = {
    ...defaultSlot(),
    anchor: AnchorPresets.TopLeft,
    offsetX: x,
    offsetY: y,
    sizeX: w,
    sizeY: h,
  };
  return n;
}

/** Anchor a node to fill its parent. */
function fillParent(n: WidgetNodeJSON, pad = 0): WidgetNodeJSON {
  n.slot = {
    ...defaultSlot(),
    anchor: AnchorPresets.StretchFull,
    offsetX: pad,
    offsetY: pad,
    sizeX: -pad * 2,
    sizeY: -pad * 2,
  };
  return n;
}

// ============================================================
//  1. createCardTemplate
//  A fully-formed trading-card widget with art window, cost area,
//  name bar, type line, effect text body, and power/toughness stats.
//
//  Also useful as a generic "item card" in inventory screens,
//  character selection panels, ability cards, etc.
// ============================================================

export interface CardTemplateOptions {
  /** Card width in pixels. Default 200. */
  width?: number;
  /** Card height in pixels. Default 280. */
  height?: number;
  /** Card frame border color. Default '#b8a070' (gold). */
  frameColor?: string;
  /** Art area height as a fraction of total height. Default 0.45. */
  artHeightRatio?: number;
  /** Background dark fill. Default '#1a1018'. */
  backgroundColor?: string;
  /** Corner radius. Default 10. */
  borderRadius?: number;
  /** Show power/toughness stat bar. Default true. */
  showStats?: boolean;
  /** Show cost pip row. Default true. */
  showCost?: boolean;
}

export function createCardTemplate(opts: CardTemplateOptions = {}): WidgetTemplate {
  const {
    width = 200,
    height = 280,
    frameColor = '#b8a070',
    artHeightRatio = 0.45,
    backgroundColor = '#1a1018',
    borderRadius = 10,
    showStats = true,
    showCost = true,
  } = opts;

  const artH = Math.round(height * artHeightRatio);
  const nameBarH = 28;
  const typeLineH = 18;
  const statsBarH = showStats ? 32 : 0;
  const bodyH = height - artH - nameBarH - typeLineH - statsBarH - 4;

  // ---- Root card frame ----
  const root = createWidgetNode('Border', 'CardFrame');
  root.slot = { ...defaultSlot(), anchor: AnchorPresets.TopLeft, offsetX: 0, offsetY: 0, sizeX: width, sizeY: height };
  root.borderProps = {
    backgroundColor,
    backgroundImage: '',
    borderColor: frameColor,
    borderWidth: 2,
    borderRadius,
    gradient: {
      enabled: true,
      type: 'linear',
      angle: 175,
      stops: [
        { position: 0, color: '#2a1e2e' },
        { position: 1, color: '#0e0c14' },
      ],
    },
  };

  // ---- Art window (top portion) ----
  const artCanvas = createWidgetNode('CanvasPanel', 'ArtCanvas');
  artCanvas.slot = { ...defaultSlot(), anchor: AnchorPresets.TopLeft, offsetX: 2, offsetY: 2, sizeX: width - 4, sizeY: artH };

  const artImage = createWidgetNode('Image', 'ArtImage');
  artImage.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 0, offsetY: 0, sizeX: 0, sizeY: 0 };
  artImage.imageProps = { imageSource: '', tintColor: '#ffffff', stretch: 'ScaleToFill' };
  artCanvas.children = [artImage.id];

  // ---- Cost area (overlaid top-right of art) ----
  const costCanvas = createWidgetNode('CanvasPanel', 'CostCanvas');
  costCanvas.slot = { ...defaultSlot(), anchor: AnchorPresets.TopRight, offsetX: -(showCost ? 5 + 22 * 3 : 0), offsetY: 5, sizeX: 22 * 3, sizeY: 26 };
  costCanvas.visibility = showCost ? 'Visible' : 'Collapsed';

  const costPipsBox = createWidgetNode('HorizontalBox', 'CostPips');
  costPipsBox.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 0, offsetY: 0, sizeX: 0, sizeY: 0 };
  costCanvas.children = [costPipsBox.id];

  // ---- Name bar ----
  const nameBar = createWidgetNode('Border', 'NameBar');
  nameBar.slot = { ...defaultSlot(), anchor: AnchorPresets.TopLeft, offsetX: 0, offsetY: artH + 2, sizeX: width, sizeY: nameBarH };
  nameBar.borderProps = {
    backgroundColor: '#1a1018cc',
    backgroundImage: '',
    borderColor: frameColor,
    borderWidth: 1,
    borderRadius: 0,
  };

  const nameText = createWidgetNode('Text', 'NameText');
  nameText.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 6, offsetY: 0, sizeX: -12, sizeY: 0, sizeMode: 'Fill' };
  nameText.textProps = {
    text: 'Card Name',
    fontSize: 13,
    fontFamily: 'Georgia, serif',
    color: '#f0e6c8',
    justification: 'Left',
    isBold: true,
    isItalic: false,
    shadowColor: '#00000088',
    shadowOffset: { x: 1, y: 1 },
    autoWrap: false,
  };
  nameBar.children = [nameText.id];

  // ---- Type line ----
  const typeText = createWidgetNode('Text', 'TypeText');
  typeText.slot = { ...defaultSlot(), anchor: AnchorPresets.TopLeft, offsetX: 6, offsetY: artH + nameBarH + 4, sizeX: width - 12, sizeY: typeLineH };
  typeText.textProps = {
    text: 'Creature — Human',
    fontSize: 10,
    fontFamily: 'Arial, sans-serif',
    color: '#b0a080',
    justification: 'Left',
    isBold: false,
    isItalic: true,
    shadowColor: '',
    shadowOffset: { x: 0, y: 0 },
    autoWrap: false,
  };

  // ---- Effect text body ----
  const bodyBorder = createWidgetNode('Border', 'BodyBorder');
  bodyBorder.slot = { ...defaultSlot(), anchor: AnchorPresets.TopLeft, offsetX: 4, offsetY: artH + nameBarH + typeLineH + 4, sizeX: width - 8, sizeY: bodyH };
  bodyBorder.borderProps = {
    backgroundColor: '#0d0b1240',
    backgroundImage: '',
    borderColor: '#3a2e1a',
    borderWidth: 1,
    borderRadius: 4,
  };

  const bodyScroll = createWidgetNode('ScrollBox', 'BodyScroll');
  bodyScroll.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 4, offsetY: 4, sizeX: -8, sizeY: -8, sizeMode: 'Fill' };
  bodyScroll.scrollBoxProps = { orientation: 'Vertical', showScrollbar: false, scrollbarThickness: 4 };

  const bodyText = createWidgetNode('Text', 'BodyText');
  bodyText.slot = { ...defaultSlot(), sizeX: width - 24, sizeY: bodyH - 8, sizeMode: 'Fill' };
  bodyText.textProps = {
    text: 'Effect text goes here. Describe the card\'s abilities and flavor.',
    fontSize: 10,
    fontFamily: 'Arial, sans-serif',
    color: '#ddd0b8',
    justification: 'Left',
    isBold: false,
    isItalic: false,
    shadowColor: '',
    shadowOffset: { x: 0, y: 0 },
    autoWrap: true,
  };
  bodyScroll.children = [bodyText.id];
  bodyBorder.children = [bodyScroll.id];

  // ---- Stats bar (Power / Toughness) ----
  const statsBar = createWidgetNode('HorizontalBox', 'StatsBar');
  statsBar.slot = { ...defaultSlot(), anchor: AnchorPresets.TopLeft, offsetX: 0, offsetY: height - statsBarH, sizeX: width, sizeY: statsBarH };
  statsBar.visibility = showStats ? 'Visible' : 'Collapsed';

  const statsBg = createWidgetNode('Border', 'StatsBg');
  statsBg.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 0, offsetY: 0, sizeX: 0, sizeY: 0, sizeMode: 'Fill' };
  statsBg.borderProps = {
    backgroundColor: '#100e1a',
    backgroundImage: '',
    borderColor: frameColor,
    borderWidth: 1,
    borderRadius: 0,
  };

  // Power pip (bottom-left)
  const powerPip = createWidgetNode('Border', 'PowerPip');
  powerPip.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 6, offsetY: 4, sizeX: 36, sizeY: 24 };
  powerPip.borderProps = { backgroundColor: '#1a3050', backgroundImage: '', borderColor: '#4488cc', borderWidth: 1, borderRadius: 4 };
  const powerText = createWidgetNode('Text', 'PowerText');
  powerText.slot = { ...defaultSlot(), sizeX: 36, sizeY: 24, sizeMode: 'Fill' };
  powerText.textProps = { text: '2', fontSize: 14, fontFamily: 'Georgia, serif', color: '#88ccff', justification: 'Center', isBold: true, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };
  powerPip.children = [powerText.id];

  // Slash separator
  const slashText = createWidgetNode('Text', 'SlashText');
  slashText.slot = { ...defaultSlot(), sizeX: 16, sizeY: statsBarH, sizeMode: 'Fill' };
  slashText.textProps = { text: '/', fontSize: 14, fontFamily: 'Georgia, serif', color: '#b8a070', justification: 'Center', isBold: false, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };

  // Toughness pip (bottom-right)
  const toughnessPip = createWidgetNode('Border', 'ToughnessPip');
  toughnessPip.slot = { ...defaultSlot(), sizeX: 36, sizeY: 24 };
  toughnessPip.borderProps = { backgroundColor: '#1a2a10', backgroundImage: '', borderColor: '#44aa44', borderWidth: 1, borderRadius: 4 };
  const toughnessText = createWidgetNode('Text', 'ToughnessText');
  toughnessText.slot = { ...defaultSlot(), sizeX: 36, sizeY: 24, sizeMode: 'Fill' };
  toughnessText.textProps = { text: '3', fontSize: 14, fontFamily: 'Georgia, serif', color: '#88ee88', justification: 'Center', isBold: true, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };
  toughnessPip.children = [toughnessText.id];

  statsBar.children = [statsBg.id, powerPip.id, slashText.id, toughnessPip.id];

  // Wire root
  root.children = [artCanvas.id, costCanvas.id, nameBar.id, typeText.id, bodyBorder.id, statsBar.id];

  return {
    rootId: root.id,
    namedSlots: {
      artImage: artImage.id,
      costPips: costPipsBox.id,
      nameText: nameText.id,
      typeText: typeText.id,
      bodyText: bodyText.id,
      powerText: powerText.id,
      toughnessText: toughnessText.id,
    },
    widgets: flatten(
      root, artCanvas, artImage, costCanvas, costPipsBox,
      nameBar, nameText, typeText,
      bodyBorder, bodyScroll, bodyText,
      statsBar, statsBg, powerPip, powerText, slashText, toughnessPip, toughnessText,
    ),
  };
}

// ============================================================
//  2. createHealthBar
//  A resource bar with icon, progress fill, and numeric label.
//  Works for HP, mana, stamina, XP, fuel — any resource.
// ============================================================

export interface HealthBarOptions {
  width?: number;
  height?: number;
  /** Fill color. Default '#e74c3c' (red). */
  fillColor?: string;
  /** Background track color. Default '#2c1010'. */
  trackColor?: string;
  /** Border color. Default '#555'. */
  borderColor?: string;
  borderRadius?: number;
  /** Whether to show the icon slot on the left. Default true. */
  showIcon?: boolean;
  /** Whether to show the numeric value on the right. Default true. */
  showValue?: boolean;
  /** Label text. Default '100 / 100'. */
  valueText?: string;
}

export function createHealthBar(opts: HealthBarOptions = {}): WidgetTemplate {
  const {
    width = 300,
    height = 32,
    fillColor = '#e74c3c',
    trackColor = '#2c1010',
    borderColor = '#555555',
    borderRadius = 4,
    showIcon = true,
    showValue = true,
    valueText = '100 / 100',
  } = opts;

  const iconW = showIcon ? height : 0;
  const valueW = showValue ? 70 : 0;
  const barW = width - iconW - valueW - (showIcon ? 4 : 0) - (showValue ? 4 : 0);

  const root = createWidgetNode('HorizontalBox', 'HealthBar');
  root.slot = { ...defaultSlot(), sizeX: width, sizeY: height };

  const icon = createWidgetNode('Image', 'HPIcon');
  icon.slot = { ...defaultSlot(), sizeX: iconW, sizeY: height };
  icon.visibility = showIcon ? 'Visible' : 'Collapsed';
  icon.imageProps = { imageSource: '', tintColor: '#ff6666', stretch: 'ScaleToFit' };

  const barBorder = createWidgetNode('Border', 'BarBorder');
  barBorder.slot = { ...defaultSlot(), sizeX: barW, sizeY: height };
  barBorder.borderProps = { backgroundColor: trackColor, backgroundImage: '', borderColor, borderWidth: 1, borderRadius };

  const bar = createWidgetNode('ProgressBar', 'HPBar');
  bar.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 2, offsetY: 2, sizeX: -4, sizeY: -4, sizeMode: 'Fill' };
  bar.progressBarProps = { percent: 1.0, fillColor, backgroundColor: 'transparent', borderRadius, fillDirection: 'LeftToRight' };
  barBorder.children = [bar.id];

  const valueLabel = createWidgetNode('Text', 'HPValue');
  valueLabel.slot = { ...defaultSlot(), sizeX: valueW, sizeY: height };
  valueLabel.visibility = showValue ? 'Visible' : 'Collapsed';
  valueLabel.textProps = { text: valueText, fontSize: 12, fontFamily: 'Arial, sans-serif', color: '#ffffff', justification: 'Center', isBold: true, isItalic: false, shadowColor: '#000000', shadowOffset: { x: 1, y: 1 }, autoWrap: false };

  root.children = [icon.id, barBorder.id, valueLabel.id];

  return {
    rootId: root.id,
    namedSlots: { icon: icon.id, bar: bar.id, valueText: valueLabel.id },
    widgets: flatten(root, icon, barBorder, bar, valueLabel),
  };
}

// ============================================================
//  3. createDialogBox
//  Modal dialog with title, body text, and two action buttons.
// ============================================================

export interface DialogBoxOptions {
  width?: number;
  height?: number;
  title?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
}

export function createDialogBox(opts: DialogBoxOptions = {}): WidgetTemplate {
  const {
    width = 400,
    height = 240,
    title = 'Dialog Title',
    body = 'Dialog body text goes here.',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    backgroundColor = '#1a1a2e',
    borderColor = '#4a90d9',
    borderRadius = 8,
  } = opts;

  const root = createWidgetNode('Border', 'Dialog');
  root.slot = { ...defaultSlot(), sizeX: width, sizeY: height };
  root.borderProps = { backgroundColor, backgroundImage: '', borderColor, borderWidth: 2, borderRadius };

  const vbox = createWidgetNode('VerticalBox', 'DialogVBox');
  vbox.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 12, offsetY: 12, sizeX: -24, sizeY: -24 };

  const titleBar = createWidgetNode('Border', 'TitleBar');
  titleBar.slot = { ...defaultSlot(), sizeX: width - 24, sizeY: 40, sizeMode: 'Auto' };
  titleBar.borderProps = { backgroundColor: '#0d2040', backgroundImage: '', borderColor: borderColor, borderWidth: 0, borderRadius: 4 };

  const titleText = createWidgetNode('Text', 'DialogTitle');
  titleText.slot = { ...defaultSlot(), sizeX: width - 24, sizeY: 40, sizeMode: 'Fill', padding: { left: 10, top: 0, right: 10, bottom: 0 } };
  titleText.textProps = { text: title, fontSize: 16, fontFamily: 'Georgia, serif', color: '#e8f0ff', justification: 'Center', isBold: true, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };
  titleBar.children = [titleText.id];

  const spacer1 = createWidgetNode('Spacer', 'Spacer1');
  spacer1.slot = { ...defaultSlot(), sizeX: 1, sizeY: 8 };
  spacer1.spacerProps = { spacerWidth: 1, spacerHeight: 8 };

  const bodyText = createWidgetNode('Text', 'DialogBody');
  bodyText.slot = { ...defaultSlot(), sizeX: width - 24, sizeY: 80, sizeMode: 'Fill' };
  bodyText.textProps = { text: body, fontSize: 13, fontFamily: 'Arial, sans-serif', color: '#ccccdd', justification: 'Center', isBold: false, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: true };

  const spacer2 = createWidgetNode('Spacer', 'Spacer2');
  spacer2.slot = { ...defaultSlot(), sizeX: 1, sizeY: 12 };
  spacer2.spacerProps = { spacerWidth: 1, spacerHeight: 12 };

  const btnRow = createWidgetNode('HorizontalBox', 'BtnRow');
  btnRow.slot = { ...defaultSlot(), sizeX: width - 24, sizeY: 40, sizeMode: 'Auto' };

  const confirmBtn = createWidgetNode('Button', 'ConfirmBtn');
  confirmBtn.slot = { ...defaultSlot(), sizeX: 120, sizeY: 36 };
  confirmBtn.buttonProps = { normalColor: '#1d6fa5', hoveredColor: '#2580b8', pressedColor: '#145a8a', disabledColor: '#444', borderRadius: 5, borderWidth: 0, borderColor: '#fff' };

  const confirmLabel_ = createWidgetNode('Text', 'ConfirmLabel');
  confirmLabel_.slot = { ...defaultSlot(), sizeMode: 'Fill', sizeX: 120, sizeY: 36 };
  confirmLabel_.textProps = { text: confirmLabel, fontSize: 13, fontFamily: 'Arial, sans-serif', color: '#ffffff', justification: 'Center', isBold: true, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };
  confirmBtn.children = [confirmLabel_.id];

  const spacerMid = createWidgetNode('Spacer', 'SpacerMid');
  spacerMid.slot = { ...defaultSlot(), sizeMode: 'Fill', fillWeight: 1, sizeX: 1, sizeY: 1 };
  spacerMid.spacerProps = { spacerWidth: 0, spacerHeight: 0 };

  const cancelBtn = createWidgetNode('Button', 'CancelBtn');
  cancelBtn.slot = { ...defaultSlot(), sizeX: 100, sizeY: 36 };
  cancelBtn.buttonProps = { normalColor: '#3a3a4a', hoveredColor: '#4a4a5a', pressedColor: '#2a2a3a', disabledColor: '#444', borderRadius: 5, borderWidth: 0, borderColor: '#fff' };

  const cancelLabel_ = createWidgetNode('Text', 'CancelLabel');
  cancelLabel_.slot = { ...defaultSlot(), sizeMode: 'Fill', sizeX: 100, sizeY: 36 };
  cancelLabel_.textProps = { text: cancelLabel, fontSize: 13, fontFamily: 'Arial, sans-serif', color: '#aaaaaa', justification: 'Center', isBold: false, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };
  cancelBtn.children = [cancelLabel_.id];

  btnRow.children = [confirmBtn.id, spacerMid.id, cancelBtn.id];
  vbox.children = [titleBar.id, spacer1.id, bodyText.id, spacer2.id, btnRow.id];
  root.children = [vbox.id];

  return {
    rootId: root.id,
    namedSlots: {
      title: titleText.id,
      body: bodyText.id,
      confirmBtn: confirmBtn.id,
      cancelBtn: cancelBtn.id,
    },
    widgets: flatten(root, vbox, titleBar, titleText, spacer1, bodyText, spacer2, btnRow, confirmBtn, confirmLabel_, spacerMid, cancelBtn, cancelLabel_),
  };
}

// ============================================================
//  4. createTooltip
//  Popover tooltip panel.
// ============================================================

export interface TooltipOptions {
  width?: number;
  header?: string;
  body?: string;
  backgroundColor?: string;
  borderColor?: string;
}

export function createTooltip(opts: TooltipOptions = {}): WidgetTemplate {
  const { width = 220, header = 'Item Name', body = 'Description of the item.', backgroundColor = '#0e0e1eee', borderColor = '#6a5acd' } = opts;

  const root = createWidgetNode('Border', 'Tooltip');
  root.slot = { ...defaultSlot(), sizeX: width, sizeY: 0 };
  root.borderProps = { backgroundColor, backgroundImage: '', borderColor, borderWidth: 1, borderRadius: 6 };

  const vbox = createWidgetNode('VerticalBox', 'TooltipVBox');
  vbox.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 8, offsetY: 8, sizeX: -16, sizeY: -16 };

  const headerText = createWidgetNode('Text', 'TooltipHeader');
  headerText.slot = { ...defaultSlot(), sizeX: width - 16, sizeY: 20, sizeMode: 'Auto' };
  headerText.textProps = { text: header, fontSize: 13, fontFamily: 'Georgia, serif', color: '#e8dfc8', justification: 'Left', isBold: true, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };

  const divider = createWidgetNode('Border', 'Divider');
  divider.slot = { ...defaultSlot(), sizeX: width - 16, sizeY: 1, sizeMode: 'Auto', padding: { left: 0, top: 4, right: 0, bottom: 4 } };
  divider.borderProps = { backgroundColor: '#6a5acd55', backgroundImage: '', borderColor: 'transparent', borderWidth: 0, borderRadius: 0 };

  const bodyText = createWidgetNode('Text', 'TooltipBody');
  bodyText.slot = { ...defaultSlot(), sizeX: width - 16, sizeH: 0, sizeMode: 'Auto' } as any;
  bodyText.textProps = { text: body, fontSize: 11, fontFamily: 'Arial, sans-serif', color: '#aaaacc', justification: 'Left', isBold: false, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: true };

  vbox.children = [headerText.id, divider.id, bodyText.id];
  root.children = [vbox.id];

  return {
    rootId: root.id,
    namedSlots: { header: headerText.id, body: bodyText.id },
    widgets: flatten(root, vbox, headerText, divider, bodyText),
  };
}

// ============================================================
//  5. createInventorySlot
//  A single item slot with icon, quantity badge, and cooldown overlay.
// ============================================================

export interface InventorySlotOptions {
  /** Slot size (square). Default 64. */
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
}

export function createInventorySlot(opts: InventorySlotOptions = {}): WidgetTemplate {
  const { size = 64, backgroundColor = '#1e1e2e', borderColor = '#404060', borderRadius = 4 } = opts;

  const root = createWidgetNode('Border', 'InvSlot');
  root.slot = { ...defaultSlot(), sizeX: size, sizeY: size };
  root.borderProps = { backgroundColor, backgroundImage: '', borderColor, borderWidth: 1, borderRadius };

  const overlay = createWidgetNode('Overlay', 'SlotOverlay');
  fillParent(overlay);

  const itemIcon = createWidgetNode('Image', 'ItemIcon');
  itemIcon.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 4, offsetY: 4, sizeX: -8, sizeY: -8 };
  itemIcon.imageProps = { imageSource: '', tintColor: '#ffffff', stretch: 'ScaleToFit' };

  // Cooldown overlay (darkens item + shows radial timer)
  const cooldownOverlay = createWidgetNode('Border', 'CooldownOverlay');
  cooldownOverlay.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 0, offsetY: 0, sizeX: 0, sizeY: 0 };
  cooldownOverlay.visibility = 'Collapsed';
  cooldownOverlay.renderOpacity = 0.75;
  cooldownOverlay.borderProps = { backgroundColor: '#00000077', backgroundImage: '', borderColor: 'transparent', borderWidth: 0, borderRadius };

  const cooldownText = createWidgetNode('Text', 'CooldownText');
  cooldownText.slot = { ...defaultSlot(), anchor: AnchorPresets.Center, offsetX: -(size / 2 * 0.6) / 2, offsetY: -(size / 2 * 0.6) / 2, sizeX: size * 0.6, sizeY: size * 0.6, alignment: { x: 0.5, y: 0.5 } };
  cooldownText.visibility = 'Collapsed';
  cooldownText.textProps = { text: '3', fontSize: 20, fontFamily: 'Arial, sans-serif', color: '#ffffff', justification: 'Center', isBold: true, isItalic: false, shadowColor: '#000000', shadowOffset: { x: 1, y: 1 }, autoWrap: false };

  // Quantity badge (bottom right)
  const qtyBadge = createWidgetNode('Border', 'QtyBadge');
  qtyBadge.slot = { ...defaultSlot(), anchor: AnchorPresets.BottomRight, offsetX: -(size * 0.3), offsetY: -(size * 0.26), sizeX: size * 0.3, sizeY: size * 0.26, alignment: { x: 0, y: 0 } };
  qtyBadge.borderProps = { backgroundColor: '#000000aa', backgroundImage: '', borderColor: 'transparent', borderWidth: 0, borderRadius: 2 };

  const qtyText = createWidgetNode('Text', 'QtyText');
  qtyText.slot = { ...defaultSlot(), sizeMode: 'Fill', sizeX: size * 0.3, sizeY: size * 0.26 };
  qtyText.textProps = { text: '1', fontSize: 10, fontFamily: 'Arial, sans-serif', color: '#ffffff', justification: 'Right', isBold: true, isItalic: false, shadowColor: '#000', shadowOffset: { x: 1, y: 1 }, autoWrap: false };
  qtyBadge.children = [qtyText.id];

  // Hover highlight
  const highlight = createWidgetNode('Border', 'SlotHighlight');
  highlight.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 0, offsetY: 0, sizeX: 0, sizeY: 0 };
  highlight.visibility = 'Collapsed';
  highlight.borderProps = { backgroundColor: 'transparent', backgroundImage: '', borderColor: '#88aaff', borderWidth: 2, borderRadius };

  overlay.children = [itemIcon.id, cooldownOverlay.id, cooldownText.id, qtyBadge.id, highlight.id];
  root.children = [overlay.id];

  return {
    rootId: root.id,
    namedSlots: { itemIcon: itemIcon.id, cooldownOverlay: cooldownOverlay.id, cooldownText: cooldownText.id, qtyText: qtyText.id, highlight: highlight.id },
    widgets: flatten(root, overlay, itemIcon, cooldownOverlay, cooldownText, qtyBadge, qtyText, highlight),
  };
}

// ============================================================
//  6. createAbilityIcon
//  Circular ability button with cooldown arc and key-bind hint.
// ============================================================

export interface AbilityIconOptions {
  size?: number;
  borderColor?: string;
  keyHint?: string;
}

export function createAbilityIcon(opts: AbilityIconOptions = {}): WidgetTemplate {
  const { size = 56, borderColor = '#4488cc', keyHint = 'Q' } = opts;

  const root = createWidgetNode('Border', 'AbilityIcon');
  root.slot = { ...defaultSlot(), sizeX: size, sizeY: size };
  root.borderProps = { backgroundColor: '#0a0a18', backgroundImage: '', borderColor, borderWidth: 2, borderRadius: size / 2 };

  const overlay = createWidgetNode('Overlay', 'AbilityOverlay');
  fillParent(overlay);

  const icon = createWidgetNode('Image', 'AbilityImg');
  icon.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 4, offsetY: 4, sizeX: -8, sizeY: -8 };
  icon.imageProps = { imageSource: '', tintColor: '#ffffff', stretch: 'ScaleToFit' };

  const cooldownOverlay = createWidgetNode('Border', 'CDOverlay');
  cooldownOverlay.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 0, offsetY: 0, sizeX: 0, sizeY: 0 };
  cooldownOverlay.visibility = 'Collapsed';
  cooldownOverlay.renderOpacity = 0.7;
  cooldownOverlay.borderProps = { backgroundColor: '#00000099', backgroundImage: '', borderColor: 'transparent', borderWidth: 0, borderRadius: size / 2 };

  const cdText = createWidgetNode('Text', 'CDText');
  cdText.slot = { ...defaultSlot(), anchor: AnchorPresets.Center, offsetX: -size * 0.3, offsetY: -size * 0.3, sizeX: size * 0.6, sizeY: size * 0.6, alignment: { x: 0.5, y: 0.5 } };
  cdText.visibility = 'Collapsed';
  cdText.textProps = { text: '3', fontSize: 16, fontFamily: 'Arial, sans-serif', color: '#ffffff', justification: 'Center', isBold: true, isItalic: false, shadowColor: '#000', shadowOffset: { x: 1, y: 1 }, autoWrap: false };

  const keyBadge = createWidgetNode('Border', 'KeyBadge');
  const kSize = Math.round(size * 0.32);
  keyBadge.slot = { ...defaultSlot(), anchor: AnchorPresets.BottomRight, offsetX: -(kSize), offsetY: -(kSize), sizeX: kSize, sizeY: kSize, alignment: { x: 0, y: 0 } };
  keyBadge.borderProps = { backgroundColor: '#000000cc', backgroundImage: '', borderColor: '#888888', borderWidth: 1, borderRadius: 2 };

  const keyText = createWidgetNode('Text', 'KeyText');
  keyText.slot = { ...defaultSlot(), sizeMode: 'Fill', sizeX: kSize, sizeY: kSize };
  keyText.textProps = { text: keyHint, fontSize: 10, fontFamily: 'Arial, sans-serif', color: '#cccccc', justification: 'Center', isBold: true, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };
  keyBadge.children = [keyText.id];

  const readyGlow = createWidgetNode('Border', 'ReadyGlow');
  readyGlow.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: -3, offsetY: -3, sizeX: 6, sizeY: 6 };
  readyGlow.visibility = 'Collapsed';
  readyGlow.borderProps = { backgroundColor: 'transparent', backgroundImage: '', borderColor: '#88ffcc', borderWidth: 3, borderRadius: size / 2 + 3 };

  overlay.children = [icon.id, cooldownOverlay.id, cdText.id, keyBadge.id, readyGlow.id];
  root.children = [overlay.id];

  return {
    rootId: root.id,
    namedSlots: { icon: icon.id, cooldownOverlay: cooldownOverlay.id, cdText: cdText.id, keyText: keyText.id, readyGlow: readyGlow.id },
    widgets: flatten(root, overlay, icon, cooldownOverlay, cdText, keyBadge, keyText, readyGlow),
  };
}

// ============================================================
//  7. createHUDFrame
//  Full-screen outer HUD container with four edge panels and a center slot.
// ============================================================

export interface HUDFrameOptions {
  canvasWidth?: number;
  canvasHeight?: number;
  edgeThickness?: number;
  edgeColor?: string;
}

export function createHUDFrame(opts: HUDFrameOptions = {}): WidgetTemplate {
  const { canvasWidth = 1920, canvasHeight = 1080, edgeThickness = 80, edgeColor = '#0a0a1888' } = opts;

  const root = createWidgetNode('CanvasPanel', 'HUDRoot');
  root.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 0, offsetY: 0, sizeX: 0, sizeY: 0 };

  const top = createWidgetNode('Border', 'HUDTop');
  top.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchTop, offsetX: 0, offsetY: 0, sizeX: 0, sizeY: edgeThickness };
  top.borderProps = { backgroundColor: edgeColor, backgroundImage: '', borderColor: 'transparent', borderWidth: 0, borderRadius: 0 };

  const bottom = createWidgetNode('Border', 'HUDBottom');
  bottom.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchBottom, offsetX: 0, offsetY: -edgeThickness, sizeX: 0, sizeY: edgeThickness };
  bottom.borderProps = { ...top.borderProps! };

  const left = createWidgetNode('Border', 'HUDLeft');
  left.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchLeft, offsetX: 0, offsetY: edgeThickness, sizeX: edgeThickness, sizeY: -(edgeThickness * 2) };
  left.borderProps = { ...top.borderProps! };

  const right = createWidgetNode('Border', 'HUDRight');
  right.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchRight, offsetX: -edgeThickness, offsetY: edgeThickness, sizeX: edgeThickness, sizeY: -(edgeThickness * 2) };
  right.borderProps = { ...top.borderProps! };

  const center = createWidgetNode('NamedSlot', 'HUDCenter');
  center.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: edgeThickness, offsetY: edgeThickness, sizeX: -(edgeThickness * 2), sizeY: -(edgeThickness * 2) };
  center.namedSlotProps = { slotName: 'Center', isExposed: true };

  root.children = [top.id, bottom.id, left.id, right.id, center.id];

  return {
    rootId: root.id,
    namedSlots: { top: top.id, bottom: bottom.id, left: left.id, right: right.id, center: center.id },
    widgets: flatten(root, top, bottom, left, right, center),
  };
}

// ============================================================
//  8. createMinimapFrame
//  Bordered minimap panel with optional compass overlay.
// ============================================================

export interface MinimapFrameOptions {
  size?: number;
  borderColor?: string;
  borderWidth?: number;
  backgroundColor?: string;
}

export function createMinimapFrame(opts: MinimapFrameOptions = {}): WidgetTemplate {
  const { size = 200, borderColor = '#556677', borderWidth = 3, backgroundColor = '#0a1020cc' } = opts;

  const root = createWidgetNode('Border', 'Minimap');
  root.slot = { ...defaultSlot(), sizeX: size, sizeY: size };
  root.borderProps = { backgroundColor, backgroundImage: '', borderColor, borderWidth, borderRadius: size / 2 };

  const overlay = createWidgetNode('Overlay', 'MapOverlay');
  fillParent(overlay);

  const mapContent = createWidgetNode('NamedSlot', 'MapContent');
  mapContent.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: borderWidth, offsetY: borderWidth, sizeX: -(borderWidth * 2), sizeY: -(borderWidth * 2) };
  mapContent.namedSlotProps = { slotName: 'MapContent', isExposed: true };

  const compassOverlay = createWidgetNode('Image', 'CompassOverlay');
  compassOverlay.slot = { ...defaultSlot(), anchor: AnchorPresets.TopCenter, offsetX: -(12), offsetY: 4, sizeX: 24, sizeY: 24, alignment: { x: 0.5, y: 0 } };
  compassOverlay.renderOpacity = 0.8;
  compassOverlay.imageProps = { imageSource: '', tintColor: '#ff6644', stretch: 'ScaleToFit' };

  const frameOverlay = createWidgetNode('Image', 'FrameOverlay');
  fillParent(frameOverlay);
  frameOverlay.imageProps = { imageSource: '', tintColor: '#ffffff88', stretch: 'ScaleToFill' };

  overlay.children = [mapContent.id, compassOverlay.id, frameOverlay.id];
  root.children = [overlay.id];

  return {
    rootId: root.id,
    namedSlots: { mapContent: mapContent.id, compassOverlay: compassOverlay.id, frameOverlay: frameOverlay.id },
    widgets: flatten(root, overlay, mapContent, compassOverlay, frameOverlay),
  };
}

// ============================================================
//  9. createFloatingLabel
//  Floating text widget for damage numbers, XP, crit labels.
//  Typically used with arcFly or slideOut animation presets.
// ============================================================

export interface FloatingLabelOptions {
  text?: string;
  color?: string;
  fontSize?: number;
  bold?: boolean;
}

export function createFloatingLabel(opts: FloatingLabelOptions = {}): WidgetTemplate {
  const { text = '+250', color = '#ffdd44', fontSize = 24, bold = true } = opts;

  const root = createWidgetNode('Text', 'FloatingLabel');
  root.slot = { ...defaultSlot(), sizeX: 120, sizeY: 40, autoSize: true };
  root.textProps = {
    text, fontSize, fontFamily: 'Georgia, serif', color,
    justification: 'Center', isBold: bold, isItalic: false,
    shadowColor: '#000000', shadowOffset: { x: 2, y: 2 }, autoWrap: false,
    outline: { enabled: true, color: '#000000', width: 1 },
  };

  return {
    rootId: root.id,
    namedSlots: { label: root.id },
    widgets: flatten(root),
  };
}

// ============================================================
//  10. createQuestEntry
//  A single quest item in a quest log list.
// ============================================================

export interface QuestEntryOptions {
  label?: string;
  reward?: string;
  width?: number;
}

export function createQuestEntry(opts: QuestEntryOptions = {}): WidgetTemplate {
  const { label = 'Collect 10 herbs', reward = '50 XP', width = 300 } = opts;

  const root = createWidgetNode('HorizontalBox', 'QuestEntry');
  root.slot = { ...defaultSlot(), sizeX: width, sizeY: 28 };

  const checkbox = createWidgetNode('CheckBox', 'QuestCheck');
  checkbox.slot = { ...defaultSlot(), sizeX: 20, sizeY: 20, padding: { left: 0, top: 4, right: 6, bottom: 4 } };
  checkbox.checkBoxProps = { isChecked: false, checkedColor: '#44cc44', uncheckedColor: '#888888', checkSize: 16 };

  const nameText = createWidgetNode('Text', 'QuestName');
  nameText.slot = { ...defaultSlot(), sizeX: width - 100, sizeY: 28, sizeMode: 'Fill', fillWeight: 1 };
  nameText.textProps = { text: label, fontSize: 12, fontFamily: 'Arial, sans-serif', color: '#ddeedd', justification: 'Left', isBold: false, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };

  const rewardText = createWidgetNode('Text', 'QuestReward');
  rewardText.slot = { ...defaultSlot(), sizeX: 80, sizeY: 28 };
  rewardText.textProps = { text: reward, fontSize: 11, fontFamily: 'Arial, sans-serif', color: '#ffcc44', justification: 'Right', isBold: false, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };

  root.children = [checkbox.id, nameText.id, rewardText.id];

  return {
    rootId: root.id,
    namedSlots: { checkbox: checkbox.id, nameText: nameText.id, rewardText: rewardText.id },
    widgets: flatten(root, checkbox, nameText, rewardText),
  };
}

// ============================================================
//  11. createNotificationToast
//  Slide-in notification banner (use with slideIn/slideOut presets).
// ============================================================

export interface NotificationToastOptions {
  width?: number;
  height?: number;
  title?: string;
  body?: string;
  backgroundColor?: string;
  accentColor?: string;
}

export function createNotificationToast(opts: NotificationToastOptions = {}): WidgetTemplate {
  const { width = 360, height = 72, title = 'Achievement Unlocked', body = 'You completed something great!', backgroundColor = '#181828ee', accentColor = '#9b59b6' } = opts;

  const root = createWidgetNode('Border', 'Toast');
  root.slot = { ...defaultSlot(), sizeX: width, sizeY: height };
  root.visibility = 'Collapsed';
  root.borderProps = { backgroundColor, backgroundImage: '', borderColor: accentColor, borderWidth: 2, borderRadius: 6 };

  const hbox = createWidgetNode('HorizontalBox', 'ToastHBox');
  hbox.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 8, offsetY: 8, sizeX: -16, sizeY: -16 };

  const icon = createWidgetNode('Image', 'ToastIcon');
  icon.slot = { ...defaultSlot(), sizeX: height - 16, sizeY: height - 16 };
  icon.imageProps = { imageSource: '', tintColor: accentColor, stretch: 'ScaleToFit' };

  const textVBox = createWidgetNode('VerticalBox', 'ToastTextVBox');
  textVBox.slot = { ...defaultSlot(), sizeX: width - height - 40, sizeY: height - 16, sizeMode: 'Fill', fillWeight: 1, padding: { left: 8, top: 0, right: 0, bottom: 0 } };

  const titleText = createWidgetNode('Text', 'ToastTitle');
  titleText.slot = { ...defaultSlot(), sizeX: width - height - 40, sizeY: 22, sizeMode: 'Auto' };
  titleText.textProps = { text: title, fontSize: 13, fontFamily: 'Georgia, serif', color: '#eeeeff', justification: 'Left', isBold: true, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };

  const bodyText = createWidgetNode('Text', 'ToastBody');
  bodyText.slot = { ...defaultSlot(), sizeX: width - height - 40, sizeY: 16, sizeMode: 'Auto' };
  bodyText.textProps = { text: body, fontSize: 11, fontFamily: 'Arial, sans-serif', color: '#aaaacc', justification: 'Left', isBold: false, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };

  textVBox.children = [titleText.id, bodyText.id];

  const closeBtn = createWidgetNode('Button', 'ToastClose');
  closeBtn.slot = { ...defaultSlot(), sizeX: 24, sizeY: 24, alignment: { x: 0.5, y: 0.5 } };
  closeBtn.buttonProps = { normalColor: 'transparent', hoveredColor: '#ffffff22', pressedColor: '#ffffff44', disabledColor: '#444', borderRadius: 12, borderWidth: 0, borderColor: 'transparent' };
  const closeLabel = createWidgetNode('Text', 'CloseX');
  closeLabel.slot = { ...defaultSlot(), sizeMode: 'Fill', sizeX: 24, sizeY: 24 };
  closeLabel.textProps = { text: '✕', fontSize: 12, fontFamily: 'Arial', color: '#888888', justification: 'Center', isBold: false, isItalic: false, shadowColor: '', shadowOffset: { x: 0, y: 0 }, autoWrap: false };
  closeBtn.children = [closeLabel.id];

  hbox.children = [icon.id, textVBox.id, closeBtn.id];
  root.children = [hbox.id];

  return {
    rootId: root.id,
    namedSlots: { icon: icon.id, title: titleText.id, body: bodyText.id, closeBtn: closeBtn.id },
    widgets: flatten(root, hbox, icon, textVBox, titleText, bodyText, closeBtn, closeLabel),
  };
}

// ============================================================
//  12. createResourcePip
//  A small icon + numeric label for resources (mana, gold, ammo...).
// ============================================================

export interface ResourcePipOptions {
  height?: number;
  value?: string;
  iconTint?: string;
}

export function createResourcePip(opts: ResourcePipOptions = {}): WidgetTemplate {
  const { height = 28, value = '99', iconTint = '#4488ff' } = opts;

  const root = createWidgetNode('HorizontalBox', 'ResourcePip');
  root.slot = { ...defaultSlot(), sizeX: 70, sizeY: height };

  const icon = createWidgetNode('Image', 'PipIcon');
  icon.slot = { ...defaultSlot(), sizeX: height, sizeY: height };
  icon.imageProps = { imageSource: '', tintColor: iconTint, stretch: 'ScaleToFit' };

  const valueText = createWidgetNode('Text', 'PipValue');
  valueText.slot = { ...defaultSlot(), sizeX: 40, sizeY: height, sizeMode: 'Fill', fillWeight: 1, padding: { left: 4, top: 0, right: 0, bottom: 0 } };
  valueText.textProps = { text: value, fontSize: 14, fontFamily: 'Arial, sans-serif', color: '#ffffff', justification: 'Left', isBold: true, isItalic: false, shadowColor: '#000000', shadowOffset: { x: 1, y: 1 }, autoWrap: false };

  root.children = [icon.id, valueText.id];

  return {
    rootId: root.id,
    namedSlots: { icon: icon.id, value: valueText.id },
    widgets: flatten(root, icon, valueText),
  };
}

// ============================================================
//  13. createStatusEffect
//  Status effect icon with countdown progress overlay.
// ============================================================

export interface StatusEffectOptions {
  size?: number;
  borderColor?: string;
}

export function createStatusEffect(opts: StatusEffectOptions = {}): WidgetTemplate {
  const { size = 40, borderColor = '#cc4444' } = opts;

  const root = createWidgetNode('Border', 'StatusEffect');
  root.slot = { ...defaultSlot(), sizeX: size, sizeY: size };
  root.borderProps = { backgroundColor: '#1a0a0a', backgroundImage: '', borderColor, borderWidth: 2, borderRadius: 4 };

  const overlay = createWidgetNode('Overlay', 'StatusOverlay');
  fillParent(overlay);

  const icon = createWidgetNode('Image', 'StatusIcon');
  icon.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchFull, offsetX: 3, offsetY: 3, sizeX: -6, sizeY: -6 };
  icon.imageProps = { imageSource: '', tintColor: '#ffffff', stretch: 'ScaleToFit' };

  const timerBar = createWidgetNode('ProgressBar', 'StatusTimer');
  timerBar.slot = { ...defaultSlot(), anchor: AnchorPresets.StretchBottom, offsetX: 0, offsetY: -(size * 0.22), sizeX: 0, sizeY: size * 0.22 };
  timerBar.renderOpacity = 0.85;
  timerBar.progressBarProps = { percent: 1, fillColor: borderColor, backgroundColor: '#00000055', borderRadius: 0, fillDirection: 'LeftToRight' };

  const timerText = createWidgetNode('Text', 'StatusTimerText');
  timerText.slot = { ...defaultSlot(), anchor: AnchorPresets.Center, offsetX: -(size * 0.4) / 2, offsetY: -(size * 0.35) / 2, sizeX: size * 0.4, sizeY: size * 0.35, alignment: { x: 0.5, y: 0.5 } };
  timerText.textProps = { text: '5', fontSize: 10, fontFamily: 'Arial, sans-serif', color: '#ffffff', justification: 'Center', isBold: true, isItalic: false, shadowColor: '#000', shadowOffset: { x: 1, y: 1 }, autoWrap: false };

  overlay.children = [icon.id, timerBar.id, timerText.id];
  root.children = [overlay.id];

  return {
    rootId: root.id,
    namedSlots: { icon: icon.id, timerBar: timerBar.id, timerText: timerText.id },
    widgets: flatten(root, overlay, icon, timerBar, timerText),
  };
}

// ============================================================
//  Utility: mergeTemplateIntoAsset
//  Convenience helper — imports all template widgets into an
//  existing WidgetBlueprintAsset's widget map.
// ============================================================

import type { WidgetBlueprintAsset } from './WidgetBlueprintData';

/**
 * Adds all nodes from a WidgetTemplate into the given asset's widget map.
 * Does NOT set the rootWidgetId — the caller decides where to attach the template root.
 */
export function mergeTemplateIntoAsset(template: WidgetTemplate, asset: WidgetBlueprintAsset): void {
  for (const [id, w] of Object.entries(template.widgets)) {
    asset.widgets.set(id, w);
  }
}

/**
 * Adds a template as a child of an existing parent widget in an asset.
 * The template root is pushed onto parent.children.
 */
export function attachTemplateToParent(
  template: WidgetTemplate,
  parentId: string,
  asset: WidgetBlueprintAsset,
): void {
  mergeTemplateIntoAsset(template, asset);
  const parent = asset.widgets.get(parentId);
  if (parent) {
    parent.children.push(template.rootId);
  }
}
