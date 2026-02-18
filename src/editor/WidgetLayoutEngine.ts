// ============================================================
//  WidgetLayoutEngine — Computes layout for all container types
//  Supports: VerticalBox, HorizontalBox, CanvasPanel, GridPanel,
//  Overlay, SizeBox, ScaleBox, ScrollBox, WrapBox, NamedSlot
//
//  Each container type has its own layout algorithm that computes
//  child rects based on parent rect and slot properties.
// ============================================================

import type {
  WidgetNodeJSON,
  WidgetSlot,
  WidgetAnchor,
  WidgetPadding,
  SizeMode,
} from './WidgetBlueprintData';

// ============================================================
//  Computed Layout Rect
// ============================================================

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Horizontal alignment for box children */
export type HAlign = 'Left' | 'Center' | 'Right' | 'Fill';

/** Vertical alignment for box children */
export type VAlign = 'Top' | 'Center' | 'Bottom' | 'Fill';

/** Scale box stretch modes */
export type ScaleBoxStretch =
  | 'None'
  | 'Fill'
  | 'ScaleToFit'
  | 'ScaleToFitX'
  | 'ScaleToFitY'
  | 'ScaleToFill'
  | 'UserSpecified';

// ============================================================
//  Layout Engine
// ============================================================

export class WidgetLayoutEngine {
  /** Cache of computed rects (widget ID -> rect in absolute coords) */
  private _rectCache: Map<string, LayoutRect> = new Map();

  /** Widget lookup callback */
  private _getWidget: (id: string) => WidgetNodeJSON | undefined;

  constructor(getWidget: (id: string) => WidgetNodeJSON | undefined) {
    this._getWidget = getWidget;
  }

  /** Clear the layout cache (call when widgets change) */
  clearCache(): void {
    this._rectCache.clear();
  }

  /** Compute the full layout tree starting from root */
  computeLayout(rootId: string, canvasWidth: number, canvasHeight: number): void {
    this._rectCache.clear();
    const rootRect: LayoutRect = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    this._rectCache.set(rootId, rootRect);
    this._layoutChildren(rootId, rootRect);
  }

  /** Get computed rect for a widget */
  getRect(widgetId: string): LayoutRect | undefined {
    return this._rectCache.get(widgetId);
  }

  /** Get all computed rects */
  getAllRects(): Map<string, LayoutRect> {
    return this._rectCache;
  }

  // ============================================================
  //  Layout Children by Container Type
  // ============================================================

  private _layoutChildren(parentId: string, parentRect: LayoutRect): void {
    const parent = this._getWidget(parentId);
    if (!parent) return;
    if (parent.children.length === 0) return;

    switch (parent.type) {
      case 'CanvasPanel':
        this._layoutCanvasPanel(parent, parentRect);
        break;
      case 'VerticalBox':
        this._layoutVerticalBox(parent, parentRect);
        break;
      case 'HorizontalBox':
        this._layoutHorizontalBox(parent, parentRect);
        break;
      case 'Overlay':
        this._layoutOverlay(parent, parentRect);
        break;
      case 'GridPanel':
        this._layoutGridPanel(parent, parentRect);
        break;
      case 'SizeBox':
        this._layoutSizeBox(parent, parentRect);
        break;
      case 'ScaleBox':
        this._layoutScaleBox(parent, parentRect);
        break;
      case 'ScrollBox':
        this._layoutScrollBox(parent, parentRect);
        break;
      case 'WrapBox':
        this._layoutWrapBox(parent, parentRect);
        break;
      case 'NamedSlot':
        this._layoutNamedSlot(parent, parentRect);
        break;
      case 'Border':
      case 'Button':
        // Single-child containers — child fills parent with padding
        this._layoutSingleChild(parent, parentRect);
        break;
      case 'WidgetSwitcher':
        this._layoutWidgetSwitcher(parent, parentRect);
        break;
      default:
        // Unknown container — use canvas panel layout as fallback
        this._layoutCanvasPanel(parent, parentRect);
        break;
    }
  }

  // ---- Canvas Panel ---- (anchor-based free-form positioning)
  private _layoutCanvasPanel(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    for (const childId of parent.children) {
      const child = this._getWidget(childId);
      if (!child || child.visibility === 'Collapsed') continue;

      const slot = child.slot;
      const anchor = slot.anchor;
      const pad = slot.padding;

      // Compute anchor reference points
      const anchorMinX = parentRect.x + anchor.minX * parentRect.width;
      const anchorMinY = parentRect.y + anchor.minY * parentRect.height;
      const anchorMaxX = parentRect.x + anchor.maxX * parentRect.width;
      const anchorMaxY = parentRect.y + anchor.maxY * parentRect.height;

      let x: number, y: number, w: number, h: number;

      // Horizontal: point anchor or stretch anchor?
      if (anchor.minX === anchor.maxX) {
        // Point anchor: position is offset from anchor, size is fixed
        w = slot.sizeX;
        x = anchorMinX + slot.offsetX - slot.alignment.x * w;
      } else {
        // Stretch anchor: offsets are distances from anchor edges
        x = anchorMinX + slot.offsetX;
        w = anchorMaxX - anchorMinX - slot.offsetX - (slot.sizeX || 0);
        if (w < 0) w = 0;
      }

      // Vertical: point anchor or stretch anchor?
      if (anchor.minY === anchor.maxY) {
        h = slot.sizeY;
        y = anchorMinY + slot.offsetY - slot.alignment.y * h;
      } else {
        y = anchorMinY + slot.offsetY;
        h = anchorMaxY - anchorMinY - slot.offsetY - (slot.sizeY || 0);
        if (h < 0) h = 0;
      }

      // Apply padding
      x += pad.left;
      y += pad.top;
      w -= pad.left + pad.right;
      h -= pad.top + pad.bottom;

      const rect: LayoutRect = { x, y, width: Math.max(0, w), height: Math.max(0, h) };
      this._rectCache.set(childId, rect);
      this._layoutChildren(childId, rect);
    }
  }

  // ---- Vertical Box ---- (stacks children vertically)
  private _layoutVerticalBox(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    const children = parent.children
      .map(id => this._getWidget(id))
      .filter((c): c is WidgetNodeJSON => !!c && c.visibility !== 'Collapsed');

    if (children.length === 0) return;

    // First pass: compute auto-size and fill-weight totals
    let totalAuto = 0;
    let totalFillWeight = 0;

    for (const child of children) {
      const slot = child.slot;
      const pad = slot.padding;
      const vertPad = pad.top + pad.bottom;

      if (slot.sizeMode === 'Fill') {
        totalFillWeight += slot.fillWeight || 1;
      } else {
        // Auto or Custom: use sizeY
        totalAuto += slot.sizeY + vertPad;
      }
    }

    const availableForFill = Math.max(0, parentRect.height - totalAuto);
    let curY = parentRect.y;

    for (const child of children) {
      const slot = child.slot;
      const pad = slot.padding;
      const hAlign = this._getHAlign(slot);

      let childH: number;
      if (slot.sizeMode === 'Fill') {
        const weight = slot.fillWeight || 1;
        childH = totalFillWeight > 0 ? (availableForFill * weight) / totalFillWeight : 0;
      } else {
        childH = slot.sizeY;
      }

      curY += pad.top;

      // Horizontal alignment within parent
      let childX = parentRect.x + pad.left;
      let childW = slot.sizeX;
      const maxW = parentRect.width - pad.left - pad.right;

      switch (hAlign) {
        case 'Fill':
          childW = maxW;
          break;
        case 'Center':
          childX = parentRect.x + (parentRect.width - childW) / 2;
          break;
        case 'Right':
          childX = parentRect.x + parentRect.width - childW - pad.right;
          break;
        default: // Left
          break;
      }

      const rect: LayoutRect = {
        x: childX,
        y: curY,
        width: Math.max(0, childW),
        height: Math.max(0, childH),
      };
      this._rectCache.set(child.id, rect);
      this._layoutChildren(child.id, rect);

      curY += childH + pad.bottom;
    }
  }

  // ---- Horizontal Box ---- (stacks children horizontally)
  private _layoutHorizontalBox(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    const children = parent.children
      .map(id => this._getWidget(id))
      .filter((c): c is WidgetNodeJSON => !!c && c.visibility !== 'Collapsed');

    if (children.length === 0) return;

    let totalAuto = 0;
    let totalFillWeight = 0;

    for (const child of children) {
      const slot = child.slot;
      const pad = slot.padding;
      const horzPad = pad.left + pad.right;

      if (slot.sizeMode === 'Fill') {
        totalFillWeight += slot.fillWeight || 1;
      } else {
        totalAuto += slot.sizeX + horzPad;
      }
    }

    const availableForFill = Math.max(0, parentRect.width - totalAuto);
    let curX = parentRect.x;

    for (const child of children) {
      const slot = child.slot;
      const pad = slot.padding;
      const vAlign = this._getVAlign(slot);

      let childW: number;
      if (slot.sizeMode === 'Fill') {
        const weight = slot.fillWeight || 1;
        childW = totalFillWeight > 0 ? (availableForFill * weight) / totalFillWeight : 0;
      } else {
        childW = slot.sizeX;
      }

      curX += pad.left;

      // Vertical alignment within parent
      let childY = parentRect.y + pad.top;
      let childH = slot.sizeY;
      const maxH = parentRect.height - pad.top - pad.bottom;

      switch (vAlign) {
        case 'Fill':
          childH = maxH;
          break;
        case 'Center':
          childY = parentRect.y + (parentRect.height - childH) / 2;
          break;
        case 'Bottom':
          childY = parentRect.y + parentRect.height - childH - pad.bottom;
          break;
        default: // Top
          break;
      }

      const rect: LayoutRect = {
        x: curX,
        y: childY,
        width: Math.max(0, childW),
        height: Math.max(0, childH),
      };
      this._rectCache.set(child.id, rect);
      this._layoutChildren(child.id, rect);

      curX += childW + pad.right;
    }
  }

  // ---- Overlay ---- (stacks children on top of each other)
  private _layoutOverlay(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    for (const childId of parent.children) {
      const child = this._getWidget(childId);
      if (!child || child.visibility === 'Collapsed') continue;

      const slot = child.slot;
      const pad = slot.padding;
      const hAlign = this._getHAlign(slot);
      const vAlign = this._getVAlign(slot);

      let x = parentRect.x + pad.left;
      let y = parentRect.y + pad.top;
      let w = slot.sizeX;
      let h = slot.sizeY;
      const maxW = parentRect.width - pad.left - pad.right;
      const maxH = parentRect.height - pad.top - pad.bottom;

      // Horizontal alignment
      switch (hAlign) {
        case 'Fill': w = maxW; break;
        case 'Center': x = parentRect.x + (parentRect.width - w) / 2; break;
        case 'Right': x = parentRect.x + parentRect.width - w - pad.right; break;
      }

      // Vertical alignment
      switch (vAlign) {
        case 'Fill': h = maxH; break;
        case 'Center': y = parentRect.y + (parentRect.height - h) / 2; break;
        case 'Bottom': y = parentRect.y + parentRect.height - h - pad.bottom; break;
      }

      const rect: LayoutRect = { x, y, width: Math.max(0, w), height: Math.max(0, h) };
      this._rectCache.set(childId, rect);
      this._layoutChildren(childId, rect);
    }
  }

  // ---- Grid Panel ---- (rows and columns)
  private _layoutGridPanel(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    const children = parent.children
      .map(id => this._getWidget(id))
      .filter((c): c is WidgetNodeJSON => !!c && c.visibility !== 'Collapsed');

    if (children.length === 0) return;

    // Determine grid dimensions from child slot gridRow/gridCol properties
    let maxRow = 0;
    let maxCol = 0;
    for (const child of children) {
      const gp = (child.slot as any).gridRow ?? 0;
      const gc = (child.slot as any).gridCol ?? 0;
      const rs = (child.slot as any).gridRowSpan ?? 1;
      const cs = (child.slot as any).gridColSpan ?? 1;
      maxRow = Math.max(maxRow, gp + rs);
      maxCol = Math.max(maxCol, gc + cs);
    }

    if (maxRow === 0) maxRow = 1;
    if (maxCol === 0) maxCol = 1;

    const cellW = parentRect.width / maxCol;
    const cellH = parentRect.height / maxRow;

    for (const child of children) {
      const slot = child.slot;
      const row = (slot as any).gridRow ?? 0;
      const col = (slot as any).gridCol ?? 0;
      const rowSpan = (slot as any).gridRowSpan ?? 1;
      const colSpan = (slot as any).gridColSpan ?? 1;
      const pad = slot.padding;

      const rect: LayoutRect = {
        x: parentRect.x + col * cellW + pad.left,
        y: parentRect.y + row * cellH + pad.top,
        width: Math.max(0, cellW * colSpan - pad.left - pad.right),
        height: Math.max(0, cellH * rowSpan - pad.top - pad.bottom),
      };
      this._rectCache.set(child.id, rect);
      this._layoutChildren(child.id, rect);
    }
  }

  // ---- Size Box ---- (enforces fixed width/height on single child)
  private _layoutSizeBox(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    if (parent.children.length === 0) return;
    const child = this._getWidget(parent.children[0]);
    if (!child || child.visibility === 'Collapsed') return;

    const sb = parent.sizeBoxProps;
    let w = parentRect.width;
    let h = parentRect.height;

    if (sb) {
      if (sb.widthOverride > 0) w = sb.widthOverride;
      if (sb.heightOverride > 0) h = sb.heightOverride;
      if (sb.minDesiredWidth > 0) w = Math.max(w, sb.minDesiredWidth);
      if (sb.minDesiredHeight > 0) h = Math.max(h, sb.minDesiredHeight);
      if (sb.maxDesiredWidth > 0) w = Math.min(w, sb.maxDesiredWidth);
      if (sb.maxDesiredHeight > 0) h = Math.min(h, sb.maxDesiredHeight);
    }

    const rect: LayoutRect = {
      x: parentRect.x,
      y: parentRect.y,
      width: w,
      height: h,
    };
    this._rectCache.set(child.id, rect);
    this._layoutChildren(child.id, rect);
  }

  // ---- Scale Box ---- (scales child to fit/fill the available space)
  private _layoutScaleBox(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    if (parent.children.length === 0) return;
    const child = this._getWidget(parent.children[0]);
    if (!child || child.visibility === 'Collapsed') return;

    const stretch: ScaleBoxStretch = (parent as any).scaleBoxProps?.stretch ?? 'ScaleToFit';
    const childDesiredW = child.slot.sizeX || 100;
    const childDesiredH = child.slot.sizeY || 100;

    let w = parentRect.width;
    let h = parentRect.height;

    switch (stretch) {
      case 'None':
        w = childDesiredW;
        h = childDesiredH;
        break;
      case 'Fill':
        // Use parent size
        break;
      case 'ScaleToFit': {
        const scaleX = parentRect.width / childDesiredW;
        const scaleY = parentRect.height / childDesiredH;
        const scale = Math.min(scaleX, scaleY);
        w = childDesiredW * scale;
        h = childDesiredH * scale;
        break;
      }
      case 'ScaleToFitX': {
        const scale = parentRect.width / childDesiredW;
        w = childDesiredW * scale;
        h = childDesiredH * scale;
        break;
      }
      case 'ScaleToFitY': {
        const scale = parentRect.height / childDesiredH;
        w = childDesiredW * scale;
        h = childDesiredH * scale;
        break;
      }
      case 'ScaleToFill': {
        const scaleX = parentRect.width / childDesiredW;
        const scaleY = parentRect.height / childDesiredH;
        const scale = Math.max(scaleX, scaleY);
        w = childDesiredW * scale;
        h = childDesiredH * scale;
        break;
      }
      case 'UserSpecified': {
        const userScale = (parent as any).scaleBoxProps?.userSpecifiedScale ?? 1;
        w = childDesiredW * userScale;
        h = childDesiredH * userScale;
        break;
      }
    }

    // Center within parent
    const x = parentRect.x + (parentRect.width - w) / 2;
    const y = parentRect.y + (parentRect.height - h) / 2;

    const rect: LayoutRect = { x, y, width: Math.max(0, w), height: Math.max(0, h) };
    this._rectCache.set(child.id, rect);
    this._layoutChildren(child.id, rect);
  }

  // ---- Scroll Box ---- (clips children and allows scrolling)
  private _layoutScrollBox(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    const sbProps = parent.scrollBoxProps;
    const orientation = sbProps?.orientation ?? 'Vertical';
    const scrollOffset = (parent as any)._scrollOffset ?? { x: 0, y: 0 };

    // Layout children in a virtual container
    const children = parent.children
      .map(id => this._getWidget(id))
      .filter((c): c is WidgetNodeJSON => !!c && c.visibility !== 'Collapsed');

    if (children.length === 0) return;

    let curY = parentRect.y - scrollOffset.y;
    let curX = parentRect.x - scrollOffset.x;

    for (const child of children) {
      const slot = child.slot;
      const pad = slot.padding;

      let rect: LayoutRect;
      if (orientation === 'Horizontal') {
        rect = {
          x: curX + pad.left,
          y: parentRect.y + pad.top,
          width: slot.sizeX,
          height: parentRect.height - pad.top - pad.bottom,
        };
        curX += slot.sizeX + pad.left + pad.right;
      } else {
        rect = {
          x: parentRect.x + pad.left,
          y: curY + pad.top,
          width: parentRect.width - pad.left - pad.right,
          height: slot.sizeY,
        };
        curY += slot.sizeY + pad.top + pad.bottom;
      }

      this._rectCache.set(child.id, rect);
      this._layoutChildren(child.id, rect);
    }

    // Store total content size for scrollbar calculation
    if (orientation === 'Horizontal') {
      (parent as any)._contentWidth = curX - parentRect.x + scrollOffset.x;
      (parent as any)._contentHeight = parentRect.height;
    } else {
      (parent as any)._contentWidth = parentRect.width;
      (parent as any)._contentHeight = curY - parentRect.y + scrollOffset.y;
    }
  }

  // ---- Wrap Box ---- (wraps children to new rows/columns)
  private _layoutWrapBox(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    const children = parent.children
      .map(id => this._getWidget(id))
      .filter((c): c is WidgetNodeJSON => !!c && c.visibility !== 'Collapsed');

    if (children.length === 0) return;

    let curX = parentRect.x;
    let curY = parentRect.y;
    let rowHeight = 0;

    for (const child of children) {
      const slot = child.slot;
      const pad = slot.padding;
      const w = slot.sizeX + pad.left + pad.right;
      const h = slot.sizeY + pad.top + pad.bottom;

      // Wrap to next row if exceeds parent width
      if (curX + w > parentRect.x + parentRect.width && curX > parentRect.x) {
        curX = parentRect.x;
        curY += rowHeight;
        rowHeight = 0;
      }

      const rect: LayoutRect = {
        x: curX + pad.left,
        y: curY + pad.top,
        width: slot.sizeX,
        height: slot.sizeY,
      };
      this._rectCache.set(child.id, rect);
      this._layoutChildren(child.id, rect);

      curX += w;
      rowHeight = Math.max(rowHeight, h);
    }
  }

  // ---- Named Slot ---- (placeholder — child fills the slot)
  private _layoutNamedSlot(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    for (const childId of parent.children) {
      const child = this._getWidget(childId);
      if (!child || child.visibility === 'Collapsed') continue;

      const pad = child.slot.padding;
      const rect: LayoutRect = {
        x: parentRect.x + pad.left,
        y: parentRect.y + pad.top,
        width: parentRect.width - pad.left - pad.right,
        height: parentRect.height - pad.top - pad.bottom,
      };
      this._rectCache.set(childId, rect);
      this._layoutChildren(childId, rect);
    }
  }

  // ---- Single Child (Border, Button) ---- child fills parent
  private _layoutSingleChild(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    if (parent.children.length === 0) return;
    const child = this._getWidget(parent.children[0]);
    if (!child || child.visibility === 'Collapsed') return;

    const pad = child.slot.padding;
    const hAlign = this._getHAlign(child.slot);
    const vAlign = this._getVAlign(child.slot);

    let x = parentRect.x + pad.left;
    let y = parentRect.y + pad.top;
    let w = child.slot.sizeX;
    let h = child.slot.sizeY;
    const maxW = parentRect.width - pad.left - pad.right;
    const maxH = parentRect.height - pad.top - pad.bottom;

    switch (hAlign) {
      case 'Fill': w = maxW; break;
      case 'Center': x = parentRect.x + (parentRect.width - w) / 2; break;
      case 'Right': x = parentRect.x + parentRect.width - w - pad.right; break;
    }
    switch (vAlign) {
      case 'Fill': h = maxH; break;
      case 'Center': y = parentRect.y + (parentRect.height - h) / 2; break;
      case 'Bottom': y = parentRect.y + parentRect.height - h - pad.bottom; break;
    }

    const rect: LayoutRect = { x, y, width: Math.max(0, w), height: Math.max(0, h) };
    this._rectCache.set(child.id, rect);
    this._layoutChildren(child.id, rect);
  }

  // ---- Widget Switcher ---- (only first visible child shown)
  private _layoutWidgetSwitcher(parent: WidgetNodeJSON, parentRect: LayoutRect): void {
    const activeIdx = (parent as any).activeSwitcherIndex ?? 0;
    for (let i = 0; i < parent.children.length; i++) {
      const child = this._getWidget(parent.children[i]);
      if (!child) continue;
      if (i === activeIdx) {
        const rect: LayoutRect = { ...parentRect };
        this._rectCache.set(child.id, rect);
        this._layoutChildren(child.id, rect);
      }
      // Non-active children get zero rect (hidden)
    }
  }

  // ============================================================
  //  Helper: Extract Alignment from Slot
  // ============================================================

  private _getHAlign(slot: WidgetSlot): HAlign {
    // Use alignment.x to determine horizontal alignment
    // 0 = Left, 0.5 = Center, 1 = Right
    // sizeMode 'Fill' means fill horizontally
    const hAlignProp = (slot as any).hAlign as HAlign | undefined;
    if (hAlignProp) return hAlignProp;

    if (slot.sizeMode === 'Fill') return 'Fill';
    if (slot.alignment.x <= 0.25) return 'Left';
    if (slot.alignment.x >= 0.75) return 'Right';
    return 'Center';
  }

  private _getVAlign(slot: WidgetSlot): VAlign {
    const vAlignProp = (slot as any).vAlign as VAlign | undefined;
    if (vAlignProp) return vAlignProp;

    if (slot.sizeMode === 'Fill') return 'Fill';
    if (slot.alignment.y <= 0.25) return 'Top';
    if (slot.alignment.y >= 0.75) return 'Bottom';
    return 'Center';
  }
}
