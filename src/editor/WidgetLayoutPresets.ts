// ============================================================
//  WidgetLayoutPresets
//  Generic, game-agnostic layout strategies for groups of widgets.
//
//  Each preset is a pure function that takes a list of widget IDs
//  and options, and returns an ItemTransform[] describing where each
//  widget should be positioned/rotated/scaled.
//
//  Callers apply the transforms to WidgetNodeJSON render properties:
//    widget.renderTranslation = { x: t.x, y: t.y }
//    widget.renderAngle       = t.angle
//    widget.renderScale       = { x: t.scale, y: t.scale }
//
//  Works with WidgetAnimationSystem for smooth interpolation:
//    animSys.animateVector2(id, 'renderTranslation', from, to, duration)
//    animSys.animateFloat(id, 'renderAngle', fromAngle, toAngle, duration)
//
//  Supported layouts:
//    FanLayout       — arc spread (hand of cards, radial abilities, item fan)
//    RadialLayout    — equal-spaced ring (wheel menus, skill circles, team HUD)
//    StackLayout     — overlapping deck (card pile, document stack, layered panels)
//    GridSnapLayout  — drag-and-drop snapped grid (inventory, hotbar, tileset picker)
//    TimelineLayout  — horizontal scrolling track (turn order, timeline HUD, quest log)
//    SpiralLayout    — expanding outward spiral (loot explosion, scatter effects)
//    ConveyorLayout  — looping horizontal carousel (news ticker, map selector)
//    BezierPathLayout— distribute items along a bezier curve (cinematic paths, tutorials)
// ============================================================

// ============================================================
//  Core Transform Type
// ============================================================

/** The transform output of any layout preset. */
export interface ItemTransform {
  /** Widget ID */
  id: string;
  /** X position (canvas-space pixels) */
  x: number;
  /** Y position (canvas-space pixels) */
  y: number;
  /** Rotation in degrees (applied around renderPivot) */
  angle: number;
  /** Uniform scale applied to renderScale */
  scale: number;
  /** Z-order override (higher = in front) */
  zOrder: number;
}

// ============================================================
//  Utility helpers
// ============================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ============================================================
//  1. FanLayout
//  Arranges items in an arc (curved fan).
//  Perfect for: hand of cards, radial abilities, item fans, bottom HUD rows.
// ============================================================

export interface FanLayoutOptions {
  /** Center X of the fan origin (arc center is usually below items) */
  originX: number;
  /** Center Y of the fan origin (typically below the viewport) */
  originY: number;
  /**
   * Radius: distance from origin to each item center.
   * Larger = flatter fan.
   */
  radius: number;
  /**
   * Total arc angle in degrees spanned by all items.
   * e.g. 60 = items span ±30° from center.
   */
  spreadAngle: number;
  /**
   * Angle offset of the fan arc midpoint from straight-up (–90°).
   * 0 = fan opens upward. 90 = opens to the right.
   */
  arcMidAngle?: number;
  /**
   * Whether hovered/active item index is elevated.
   * -1 = no emphasis.
   */
  hoveredIndex?: number;
  /** How much to lift the hovered item (pixels upward). Default 20. */
  hoverLiftPx?: number;
  /** Whether items rotate to follow the arc tangent. Default true. */
  rotateWithArc?: boolean;
  /** Extra rotation applied to every item (degrees). */
  baseRotation?: number;
  /** Scale applied to every item. Default 1. */
  baseScale?: number;
  /** Scale of the hovered item. Default 1.1. */
  hoverScale?: number;
  /** Item width (used for spacing clamping). 0 = ignore. */
  itemWidth?: number;
  /** Maximum pixels between item centers (limits crowding). 0 = no limit. */
  maxSpacing?: number;
}

export function FanLayout(ids: string[], opts: FanLayoutOptions): ItemTransform[] {
  const count = ids.length;
  if (count === 0) return [];

  const {
    originX,
    originY,
    radius,
    spreadAngle,
    arcMidAngle = -90,
    hoveredIndex = -1,
    hoverLiftPx = 20,
    rotateWithArc = true,
    baseRotation = 0,
    baseScale = 1,
    hoverScale = 1.1,
  } = opts;

  const halfSpread = count === 1 ? 0 : spreadAngle / 2;
  const results: ItemTransform[] = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1); // 0…1

    // Angle along the arc
    const arcDeg = arcMidAngle + lerp(-halfSpread, halfSpread, t);
    const arcRad = degToRad(arcDeg);

    // Position on circle
    let x = originX + Math.cos(arcRad) * radius;
    let y = originY + Math.sin(arcRad) * radius;

    const isHovered = i === hoveredIndex;

    // Lift hovered item perpendicular to arc
    if (isHovered && hoverLiftPx !== 0) {
      // Move toward arc center (inward = up for bottom-anchored fan)
      const liftAngle = arcRad - Math.PI; // opposite direction from origin
      x += Math.cos(liftAngle) * hoverLiftPx;
      y += Math.sin(liftAngle) * hoverLiftPx;
    }

    const angle = rotateWithArc ? arcDeg + 90 + baseRotation : baseRotation;
    const scale = isHovered ? hoverScale : baseScale;

    results.push({ id: ids[i], x, y, angle, scale, zOrder: isHovered ? count + 1 : i });

  }

  return results;
}

// ============================================================
//  2. RadialLayout
//  Places items equally around a circle or arc.
//  Perfect for: wheel menus, skill rings, player circles, pip indicators.
// ============================================================

export interface RadialLayoutOptions {
  /** Center X */
  cx: number;
  /** Center Y */
  cy: number;
  /** Radius in pixels */
  radius: number;
  /** Start angle in degrees (0 = right, -90 = top). Default -90. */
  startAngle?: number;
  /** Total sweep angle in degrees. 360 = full circle. Default 360. */
  sweepAngle?: number;
  /** Whether items rotate to face outward. Default false. */
  rotateToFaceOut?: boolean;
  /** Base scale. Default 1. */
  baseScale?: number;
}

export function RadialLayout(ids: string[], opts: RadialLayoutOptions): ItemTransform[] {
  const count = ids.length;
  if (count === 0) return [];

  const {
    cx,
    cy,
    radius,
    startAngle = -90,
    sweepAngle = 360,
    rotateToFaceOut = false,
    baseScale = 1,
  } = opts;

  const fullCircle = sweepAngle >= 360;
  const step = fullCircle ? sweepAngle / count : sweepAngle / Math.max(count - 1, 1);

  return ids.map((id, i) => {
    const deg = startAngle + i * step;
    const rad = degToRad(deg);
    return {
      id,
      x: cx + Math.cos(rad) * radius,
      y: cy + Math.sin(rad) * radius,
      angle: rotateToFaceOut ? deg + 90 : 0,
      scale: baseScale,
      zOrder: i,
    };
  });
}

// ============================================================
//  3. StackLayout
//  Overlapping stack with configurable offset and angle wobble.
//  Perfect for: card piles, document stacks, layered panels, graveyard.
// ============================================================

export interface StackLayoutOptions {
  /** X of the bottom (first) item */
  baseX: number;
  /** Y of the bottom (first) item */
  baseY: number;
  /** X pixel offset per item up the stack. Default 1. */
  offsetX?: number;
  /** Y pixel offset per item up the stack. Default -2. */
  offsetY?: number;
  /** Angle wobble: ± degrees per item (adds visual messiness). Default 0. */
  angleWobble?: number;
  /** Random seed for consistent angle wobble. Default 42. */
  wobbleSeed?: number;
  /** Base scale. Default 1. */
  baseScale?: number;
  /** Whether the top of the stack is the last item (topmost = front). Default true. */
  topIsLast?: boolean;
}

export function StackLayout(ids: string[], opts: StackLayoutOptions): ItemTransform[] {
  const {
    baseX,
    baseY,
    offsetX = 1,
    offsetY = -2,
    angleWobble = 0,
    wobbleSeed = 42,
    baseScale = 1,
    topIsLast = true,
  } = opts;

  // Simple seeded pseudo-random (deterministic for consistent layout)
  function seededRand(index: number): number {
    const x = Math.sin(wobbleSeed + index * 127.1) * 43758.5453;
    return x - Math.floor(x); // 0..1
  }

  return ids.map((id, i) => {
    const stackPos = topIsLast ? i : ids.length - 1 - i;
    const wobble = angleWobble > 0
      ? (seededRand(i) * 2 - 1) * angleWobble
      : 0;
    return {
      id,
      x: baseX + stackPos * offsetX,
      y: baseY + stackPos * offsetY,
      angle: wobble,
      scale: baseScale,
      zOrder: stackPos,
    };
  });
}

// ============================================================
//  4. GridSnapLayout
//  Snapped grid with configurable slot size and gap.
//  Perfect for: inventory grids, hotbars, tileset pickers, card collections.
// ============================================================

export interface GridSnapLayoutOptions {
  /** Top-left X of the grid */
  originX: number;
  /** Top-left Y of the grid */
  originY: number;
  /** Number of columns */
  columns: number;
  /** Width of each cell */
  cellWidth: number;
  /** Height of each cell */
  cellHeight: number;
  /** Gap between cells (pixels). Default 4. */
  gap?: number;
  /** Base scale. Default 1. */
  baseScale?: number;
  /** Whether items are centered within cells. Default true. */
  centerInCell?: boolean;
}

export function GridSnapLayout(ids: string[], opts: GridSnapLayoutOptions): ItemTransform[] {
  const {
    originX,
    originY,
    columns,
    cellWidth,
    cellHeight,
    gap = 4,
    baseScale = 1,
    centerInCell = true,
  } = opts;

  const stride = cellWidth + gap;
  const rowStride = cellHeight + gap;
  const centerOffsetX = centerInCell ? cellWidth / 2 : 0;
  const centerOffsetY = centerInCell ? cellHeight / 2 : 0;

  return ids.map((id, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    return {
      id,
      x: originX + col * stride + centerOffsetX,
      y: originY + row * rowStride + centerOffsetY,
      angle: 0,
      scale: baseScale,
      zOrder: i,
    };
  });
}

// ============================================================
//  5. TimelineLayout
//  Positions items along a horizontal axis with zoom support.
//  Perfect for: turn-order trackers, history logs, timeline HUDs, quest markers.
// ============================================================

export interface TimelineLayoutOptions {
  /** X origin of the timeline */
  originX: number;
  /** Y position (all items share this Y) */
  originY: number;
  /** Pixel width of the full timeline */
  totalWidth: number;
  /**
   * Normalized positions (0..1) for each item along the timeline.
   * Must have the same length as ids. If omitted, items are evenly distributed.
   */
  positions?: number[];
  /** Zoom factor (1 = no zoom, 2 = doubled spacing). Default 1. */
  zoom?: number;
  /** Scroll offset in pixels. Default 0. */
  scrollX?: number;
  /** Base scale. Default 1. */
  baseScale?: number;
  /** Index of the emphasized (current) item. -1 = none. */
  activeIndex?: number;
  /** Scale of active item. Default 1.2. */
  activeScale?: number;
}

export function TimelineLayout(ids: string[], opts: TimelineLayoutOptions): ItemTransform[] {
  const {
    originX,
    originY,
    totalWidth,
    positions,
    zoom = 1,
    scrollX = 0,
    baseScale = 1,
    activeIndex = -1,
    activeScale = 1.2,
  } = opts;

  const count = ids.length;
  if (count === 0) return [];

  const effectiveWidth = totalWidth * zoom;

  return ids.map((id, i) => {
    const norm = positions ? positions[i] ?? (i / Math.max(count - 1, 1)) : i / Math.max(count - 1, 1);
    const rawX = originX + norm * effectiveWidth - scrollX;
    const isActive = i === activeIndex;
    return {
      id,
      x: rawX,
      y: originY,
      angle: 0,
      scale: isActive ? activeScale : baseScale,
      zOrder: isActive ? count + 1 : i,
    };
  });
}

// ============================================================
//  6. SpiralLayout
//  Expands items outward along an Archimedean spiral.
//  Perfect for: loot explosions, scatter effects, ability spread indicators.
// ============================================================

export interface SpiralLayoutOptions {
  /** Center X */
  cx: number;
  /** Center Y */
  cy: number;
  /** Radius step per full turn in pixels. Default 40. */
  radiusStep?: number;
  /** Angle step per item in degrees. Default 137.5 (golden angle). */
  angleStep?: number;
  /** Starting radius (inner gap). Default 10. */
  innerRadius?: number;
  /** Base scale per item. Default 1. */
  baseScale?: number;
  /** Whether items rotate to follow the spiral. Default false. */
  rotateWithSpiral?: boolean;
}

export function SpiralLayout(ids: string[], opts: SpiralLayoutOptions): ItemTransform[] {
  const {
    cx,
    cy,
    radiusStep = 40,
    angleStep = 137.5,
    innerRadius = 10,
    baseScale = 1,
    rotateWithSpiral = false,
  } = opts;

  return ids.map((id, i) => {
    const angle = i * angleStep;
    const radius = innerRadius + (i * radiusStep) / (2 * Math.PI);
    const rad = degToRad(angle);
    return {
      id,
      x: cx + Math.cos(rad) * radius,
      y: cy + Math.sin(rad) * radius,
      angle: rotateWithSpiral ? angle : 0,
      scale: baseScale,
      zOrder: i,
    };
  });
}

// ============================================================
//  7. ConveyorLayout
//  Looping horizontal carousel — items wrap around at both ends.
//  Perfect for: news tickers, map selectors, class pickers, infinite scroll.
// ============================================================

export interface ConveyorLayoutOptions {
  /** Center X of the visible area */
  centerX: number;
  /** Y position */
  centerY: number;
  /** Width of each item */
  itemWidth: number;
  /** Gap between items */
  gap?: number;
  /**
   * Current scroll position in item units (can be fractional for smooth scrolling).
   * 0 = first item is centered, 1 = second item is centered, etc.
   */
  scrollPos: number;
  /** Number of items visible on each side of center. Default 2. */
  visibleSideCount?: number;
  /** Scale falloff: items further from center scale down by this per slot. Default 0.08. */
  scaleFalloff?: number;
  /** Opacity falloff per slot. Default 0.15. */
  opacityFalloff?: number;
}

export interface ConveyorTransform extends ItemTransform {
  /** Opacity for this item (0-1). Apply to renderOpacity. */
  opacity: number;
  /** Distance from center in item-slot units */
  distFromCenter: number;
}

export function ConveyorLayout(ids: string[], opts: ConveyorLayoutOptions): ConveyorTransform[] {
  const {
    centerX,
    centerY,
    itemWidth,
    gap = 8,
    scrollPos,
    visibleSideCount = 2,
    scaleFalloff = 0.08,
    opacityFalloff = 0.15,
  } = opts;

  const stride = itemWidth + gap;
  const count = ids.length;
  const results: ConveyorTransform[] = [];

  for (let i = 0; i < count; i++) {
    // Distance from scroll position (wrapping)
    let raw = i - scrollPos;
    // Wrap to range [-count/2, count/2]
    while (raw > count / 2) raw -= count;
    while (raw < -count / 2) raw += count;

    const dist = Math.abs(raw);
    const visible = dist <= visibleSideCount + 1;

    const x = centerX + raw * stride;
    const y = centerY;
    const scale = Math.max(0.3, 1 - dist * scaleFalloff);
    const opacity = Math.max(0, 1 - dist * opacityFalloff);
    const zOrder = Math.round((visibleSideCount + 1 - dist) * 10);

    results.push({
      id: ids[i],
      x,
      y,
      angle: 0,
      scale,
      zOrder: Math.max(0, zOrder),
      opacity,
      distFromCenter: raw,
    });
  }

  return results;
}

// ============================================================
//  8. BezierPathLayout
//  Distributes items along a cubic bezier path.
//  Perfect for: tutorial arrow trails, cutscene paths, narrative flows.
// ============================================================

export interface BezierPoint {
  x: number;
  y: number;
}

export interface BezierPathLayoutOptions {
  /** Bezier start point */
  p0: BezierPoint;
  /** Control point 1 */
  p1: BezierPoint;
  /** Control point 2 */
  p2: BezierPoint;
  /** Bezier end point */
  p3: BezierPoint;
  /**
   * Normalized positions along the curve (0..1) per item.
   * If omitted, items are evenly spaced.
   */
  positions?: number[];
  /** Whether items rotate to follow the curve tangent. Default true. */
  rotateToCurve?: boolean;
  /** Base scale. Default 1. */
  baseScale?: number;
}

function cubicBezier(p0: BezierPoint, p1: BezierPoint, p2: BezierPoint, p3: BezierPoint, t: number): BezierPoint {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  };
}

function cubicBezierTangent(p0: BezierPoint, p1: BezierPoint, p2: BezierPoint, p3: BezierPoint, t: number): BezierPoint {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

export function BezierPathLayout(ids: string[], opts: BezierPathLayoutOptions): ItemTransform[] {
  const {
    p0, p1, p2, p3,
    positions,
    rotateToCurve = true,
    baseScale = 1,
  } = opts;

  const count = ids.length;
  if (count === 0) return [];

  return ids.map((id, i) => {
    const norm = positions ? (positions[i] ?? (i / Math.max(count - 1, 1))) : i / Math.max(count - 1, 1);
    const pos = cubicBezier(p0, p1, p2, p3, norm);
    let angle = 0;
    if (rotateToCurve) {
      const tangent = cubicBezierTangent(p0, p1, p2, p3, Math.min(norm + 0.001, 1));
      angle = Math.atan2(tangent.y, tangent.x) * (180 / Math.PI);
    }
    return {
      id,
      x: pos.x,
      y: pos.y,
      angle,
      scale: baseScale,
      zOrder: i,
    };
  });
}

// ============================================================
//  Utility: applyTransforms
//  Convenience helper — applies ItemTransform[] to a widget map.
//  Useful for instant (non-animated) layout application.
// ============================================================

import type { WidgetNodeJSON } from './WidgetBlueprintData';

/**
 * Instantly applies an array of ItemTransforms to their corresponding
 * widgets in the provided widget map.
 *
 * For animated transitions, instead use WidgetAnimationSystem:
 *   animSys.animateVector2(id, 'renderTranslation', from, to, duration)
 */
export function applyTransforms(
  transforms: ItemTransform[],
  widgets: Map<string, WidgetNodeJSON> | Record<string, WidgetNodeJSON>,
): void {
  const get = widgets instanceof Map
    ? (id: string) => (widgets as Map<string, WidgetNodeJSON>).get(id)
    : (id: string) => (widgets as Record<string, WidgetNodeJSON>)[id];

  for (const t of transforms) {
    const w = get(t.id);
    if (!w) continue;
    w.renderTranslation = { x: t.x, y: t.y };
    w.renderAngle = t.angle;
    w.renderScale = { x: t.scale, y: t.scale };
    w.slot.zOrder = t.zOrder;
  }
}

/**
 * Returns the previous transforms for a list of widgets (used as `from` values
 * when building animated transitions via WidgetAnimationSystem).
 */
export function captureTransforms(
  ids: string[],
  widgets: Map<string, WidgetNodeJSON> | Record<string, WidgetNodeJSON>,
): ItemTransform[] {
  const get = widgets instanceof Map
    ? (id: string) => (widgets as Map<string, WidgetNodeJSON>).get(id)
    : (id: string) => (widgets as Record<string, WidgetNodeJSON>)[id];

  return ids.map((id, i) => {
    const w = get(id);
    if (!w) return { id, x: 0, y: 0, angle: 0, scale: 1, zOrder: i };
    return {
      id,
      x: w.renderTranslation?.x ?? 0,
      y: w.renderTranslation?.y ?? 0,
      angle: w.renderAngle ?? 0,
      scale: w.renderScale?.x ?? 1,
      zOrder: w.slot?.zOrder ?? i,
    };
  });
}
