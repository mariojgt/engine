// ============================================================
//  WidgetAnimationPresets
//  Ready-to-use named animation presets built on WidgetAnimationSystem.
//
//  All presets are pure functions that accept a WidgetAnimationSystem
//  instance plus options and immediately queue animation(s).
//  Every preset is game-agnostic and works on any WidgetNodeJSON.
//
//  Preset catalogue:
//    arcFly        — parabolic arc A→B (item pickup, card play, projectile)
//    hoverLift     — scale up + lift (hover state enter)
//    hoverDrop     — reverse hoverLift (hover state exit)
//    flipReveal    — scaleX collapse + swap + expand (card/panel flip)
//    popIn         — elastic scale 0→1 (item appear)
//    popOut        — scale 1→0 (item disappear)
//    slideIn       — fly in from edge (panel, toast, notification)
//    slideOut      — fly out to edge
//    shake         — horizontal oscillation (damage, error, warning)
//    pulse         — looping scale breathe (highlight, active item)
//    bounceIn      — drop + bounce settle (reward, dialog appear)
//    fadeIn        — opacity 0→1
//    fadeOut       — opacity 1→0
//    wobble        — rotation oscillation (confused, hit stun)
//    flashColor    — flash image/border to color and back (hit flash, heal)
//    countUp       — animated integer counter in a Text widget
//    screenShake   — translate widget origin (camera shake via UI layer)
//    stampIn       — fast scale overshoot → settle (achievement, new item badge)
//    sway          — gentle looping side-to-side rotation (idle, idle breathing)
//    typewriterGo  — start typewriter reveal on a Text widget
// ============================================================

import { WidgetAnimationSystem, type EasingType } from './WidgetAnimationSystem';
import type { WidgetNodeJSON } from './WidgetBlueprintData';

// ============================================================
//  Shared helpers
// ============================================================

/** Run a fixed-step discrete sequence of animation calls. */
function sequence(steps: Array<() => void | (() => void)>): void {
  // Executes immediately, each step supplies the `onComplete` of the previous.
  // Callers bake the chaining via onComplete callbacks in the step closures.
  steps.forEach(s => s());
}

// ============================================================
//  1. arcFly
//  Flies a widget along a parabolic arc from (fromX,fromY) to (toX,toY).
//  The apex is lifted midway. X animates linearly; Y uses a split easing
//  (easeOut up, easeIn down) to create the arc effect.
//
//  Returns the two animation IDs [xAnimId, yAnimId].
// ============================================================

export interface ArcFlyOptions {
  /** Source position */
  fromX: number;
  fromY: number;
  /** Destination position */
  toX: number;
  toY: number;
  /** How high above the midpoint the arc peaks (pixels). Default 120. */
  arcHeight?: number;
  /** Total duration in seconds. Default 0.55. */
  duration?: number;
  /** Easing applied to horizontal movement. Default 'linear'. */
  xEasing?: EasingType;
  onComplete?: () => void;
}

export function arcFly(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: ArcFlyOptions,
): string[] {
  const { fromX, fromY, toX, toY, arcHeight = 120, duration = 0.55, xEasing = 'linear', onComplete } = opts;
  const apexY = Math.min(fromY, toY) - arcHeight;
  const half = duration / 2;

  // Immediately set start position
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  if (w) w.renderTranslation = { x: fromX, y: fromY };

  // X: straight line over full duration
  const xId = sys.animateVector2(widgetId, 'renderTranslation', { x: fromX, y: fromY }, { x: toX, y: fromY }, duration, xEasing);

  // Y: two-leg arc — up to apex, then down to destination
  const yId = sys.animateFloat(widgetId, 'renderTranslation.y', fromY, apexY, half, 'easeOut', () => {
    sys.animateFloat(widgetId, 'renderTranslation.y', apexY, toY, half, 'easeIn', onComplete);
  });

  return [xId, yId];
}

// ============================================================
//  2. hoverLift
//  Scales the widget up and nudges it upward (enter hover).
// ============================================================

export interface HoverLiftOptions {
  /** How much to scale up. Default 1.08. */
  scaleTo?: number;
  /** Pixels to lift upward. Default 8. */
  liftY?: number;
  /** Duration in seconds. Default 0.15. */
  duration?: number;
  easing?: EasingType;
}

export function hoverLift(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: HoverLiftOptions = {},
): string[] {
  const { scaleTo = 1.08, liftY = 8, duration = 0.15, easing = 'easeOut' } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  const curY = w?.renderTranslation?.y ?? 0;
  const curSX = w?.renderScale?.x ?? 1;
  const curSY = w?.renderScale?.y ?? 1;

  const s1 = sys.animateFloat(widgetId, 'renderScale.x', curSX, scaleTo, duration, easing);
  const s2 = sys.animateFloat(widgetId, 'renderScale.y', curSY, scaleTo, duration, easing);
  const s3 = sys.animateFloat(widgetId, 'renderTranslation.y', curY, curY - liftY, duration, easing);
  return [s1, s2, s3];
}

// ============================================================
//  3. hoverDrop
//  Reverses hoverLift (exit hover).
// ============================================================

export interface HoverDropOptions {
  /** Scale to restore to. Default 1.0. */
  scaleFrom?: number;
  scaleTo?: number;
  /** Pixels to drop from current lifted position. Default 8. */
  dropY?: number;
  duration?: number;
  easing?: EasingType;
}

export function hoverDrop(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: HoverDropOptions = {},
): string[] {
  const { scaleTo = 1.0, dropY = 8, duration = 0.12, easing = 'easeIn' } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  const curY = w?.renderTranslation?.y ?? 0;
  const curSX = w?.renderScale?.x ?? 1;
  const curSY = w?.renderScale?.y ?? 1;

  const s1 = sys.animateFloat(widgetId, 'renderScale.x', curSX, scaleTo, duration, easing);
  const s2 = sys.animateFloat(widgetId, 'renderScale.y', curSY, scaleTo, duration, easing);
  const s3 = sys.animateFloat(widgetId, 'renderTranslation.y', curY, curY + dropY, duration, easing);
  return [s1, s2, s3];
}

// ============================================================
//  4. flipReveal
//  Collapses scaleX to 0, calls a midpoint callback (swap content),
//  then expands back to 1. Classic card flip / panel reveal.
// ============================================================

export interface FlipRevealOptions {
  /** Called at the midpoint when scaleX is 0 (swap artwork/content here). */
  onMidFlip?: () => void;
  /** Duration of each half. Default 0.18. */
  halfDuration?: number;
  easingIn?: EasingType;
  easingOut?: EasingType;
  onComplete?: () => void;
}

export function flipReveal(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: FlipRevealOptions = {},
): void {
  const { onMidFlip, halfDuration = 0.18, easingIn = 'easeIn', easingOut = 'easeOut', onComplete } = opts;

  sys.animateFloat(widgetId, 'renderScale.x', 1, 0, halfDuration, easingIn, () => {
    onMidFlip?.();
    sys.animateFloat(widgetId, 'renderScale.x', 0, 1, halfDuration, easingOut, onComplete);
  });
}

// ============================================================
//  5. popIn
//  Elastic scale 0→1 (item/widget appear from nothing).
// ============================================================

export interface PopInOptions {
  duration?: number;
  easing?: EasingType;
  onComplete?: () => void;
}

export function popIn(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: PopInOptions = {},
): string[] {
  const { duration = 0.35, easing = 'elastic', onComplete } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  if (w) {
    w.renderScale = { x: 0, y: 0 };
    w.visibility = 'Visible';
  }
  const s1 = sys.animateFloat(widgetId, 'renderScale.x', 0, 1, duration, easing, onComplete);
  const s2 = sys.animateFloat(widgetId, 'renderScale.y', 0, 1, duration, easing);
  return [s1, s2];
}

// ============================================================
//  6. popOut
//  Scale 1→0 then hide (item/widget disappear).
// ============================================================

export interface PopOutOptions {
  duration?: number;
  easing?: EasingType;
  onComplete?: () => void;
}

export function popOut(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: PopOutOptions = {},
): string[] {
  const { duration = 0.2, easing = 'easeIn', onComplete } = opts;
  const s1 = sys.animateFloat(widgetId, 'renderScale.x', 1, 0, duration, easing, () => {
    const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
    if (w) w.visibility = 'Collapsed';
    onComplete?.();
  });
  const s2 = sys.animateFloat(widgetId, 'renderScale.y', 1, 0, duration, easing);
  return [s1, s2];
}

// ============================================================
//  7. slideIn
//  Slides a widget in from an edge of its container.
// ============================================================

export type SlideDirection = 'left' | 'right' | 'top' | 'bottom';

export interface SlideInOptions {
  direction?: SlideDirection;
  /** Pixels to travel from (travel distance). Default 300. */
  distance?: number;
  duration?: number;
  easing?: EasingType;
  onComplete?: () => void;
}

export function slideIn(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: SlideInOptions = {},
): string {
  const { direction = 'bottom', distance = 300, duration = 0.35, easing = 'easeOut', onComplete } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  const destX = w?.renderTranslation?.x ?? 0;
  const destY = w?.renderTranslation?.y ?? 0;

  let startX = destX;
  let startY = destY;

  switch (direction) {
    case 'left':   startX = destX - distance; break;
    case 'right':  startX = destX + distance; break;
    case 'top':    startY = destY - distance; break;
    case 'bottom': startY = destY + distance; break;
  }

  if (w) { w.renderTranslation = { x: startX, y: startY }; w.visibility = 'Visible'; }

  return sys.animateVector2(widgetId, 'renderTranslation', { x: startX, y: startY }, { x: destX, y: destY }, duration, easing, onComplete);
}

// ============================================================
//  8. slideOut
//  Slides a widget out toward an edge, then collapses it.
// ============================================================

export interface SlideOutOptions {
  direction?: SlideDirection;
  distance?: number;
  duration?: number;
  easing?: EasingType;
  onComplete?: () => void;
}

export function slideOut(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: SlideOutOptions = {},
): string {
  const { direction = 'bottom', distance = 300, duration = 0.3, easing = 'easeIn', onComplete } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  const startX = w?.renderTranslation?.x ?? 0;
  const startY = w?.renderTranslation?.y ?? 0;

  let endX = startX;
  let endY = startY;

  switch (direction) {
    case 'left':   endX = startX - distance; break;
    case 'right':  endX = startX + distance; break;
    case 'top':    endY = startY - distance; break;
    case 'bottom': endY = startY + distance; break;
  }

  return sys.animateVector2(widgetId, 'renderTranslation', { x: startX, y: startY }, { x: endX, y: endY }, duration, easing, () => {
    const w2 = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
    if (w2) w2.visibility = 'Collapsed';
    onComplete?.();
  });
}

// ============================================================
//  9. shake
//  Rapid horizontal (or vertical) oscillation.
//  Damage indicator, error state, locked door.
// ============================================================

export interface ShakeOptions {
  /** Shake amplitude in pixels. Default 8. */
  amplitude?: number;
  /** Number of shake cycles. Default 4. */
  cycles?: number;
  /** Duration per half cycle (seconds). Default 0.05. */
  halfPeriod?: number;
  axis?: 'x' | 'y';
  onComplete?: () => void;
}

export function shake(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: ShakeOptions = {},
): void {
  const { amplitude = 8, cycles = 4, halfPeriod = 0.05, axis = 'x', onComplete } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  const originX = w?.renderTranslation?.x ?? 0;
  const originY = w?.renderTranslation?.y ?? 0;

  const prop = axis === 'x' ? 'renderTranslation.x' : 'renderTranslation.y';
  const origin = axis === 'x' ? originX : originY;

  let step = 0;
  const totalSteps = cycles * 2;

  function doStep(): void {
    if (step >= totalSteps) {
      // Restore
      sys.animateFloat(widgetId, prop, undefined as any, origin, halfPeriod, 'easeOut', onComplete);
      return;
    }
    const dir = step % 2 === 0 ? 1 : -1;
    const decay = 1 - step / totalSteps;
    sys.animateFloat(widgetId, prop, undefined as any, origin + dir * amplitude * decay, halfPeriod, 'linear', () => {
      step++;
      doStep();
    });
  }

  doStep();
}

// ============================================================
//  10. pulse
//  Looping scale breathe. Highlight active item, boss healthbar, etc.
//  Returns the animation ID; call sys.stopAnimation(id) to cancel.
// ============================================================

export interface PulseOptions {
  /** Minimum scale (exhale). Default 0.97. */
  scaleMin?: number;
  /** Maximum scale (inhale). Default 1.04. */
  scaleMax?: number;
  /** Period of one full pulse cycle (seconds). Default 1.2. */
  period?: number;
  easing?: EasingType;
}

export function pulse(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: PulseOptions = {},
): string[] {
  const { scaleMin = 0.97, scaleMax = 1.04, period = 1.2, easing = 'easeInOut' } = opts;
  const sx = sys.animateFloat(widgetId, 'renderScale.x', scaleMin, scaleMax, period / 2, easing);
  const sy = sys.animateFloat(widgetId, 'renderScale.y', scaleMin, scaleMax, period / 2, easing);

  // Ping-pong is handled by WidgetAnimationSystem's loop+pingPong flags
  const anim = (sys as any)._activeAnimations?.get(sx);
  if (anim) { anim.loop = true; anim.pingPong = true; }
  const animY = (sys as any)._activeAnimations?.get(sy);
  if (animY) { animY.loop = true; animY.pingPong = true; }

  return [sx, sy];
}

// ============================================================
//  11. bounceIn
//  Drops widget from above with a bounce settle.
// ============================================================

export interface BounceInOptions {
  /** Distance to drop from (pixels above final position). Default 200. */
  dropDistance?: number;
  /** Duration of the initial drop (seconds). Default 0.4. */
  duration?: number;
  onComplete?: () => void;
}

export function bounceIn(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: BounceInOptions = {},
): string {
  const { dropDistance = 200, duration = 0.4, onComplete } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  const destY = w?.renderTranslation?.y ?? 0;
  if (w) { w.renderTranslation = { x: w.renderTranslation?.x ?? 0, y: destY - dropDistance }; w.visibility = 'Visible'; }

  return sys.animateFloat(widgetId, 'renderTranslation.y', destY - dropDistance, destY, duration, 'bounce', onComplete);
}

// ============================================================
//  12. fadeIn
// ============================================================

export interface FadeInOptions {
  duration?: number;
  easing?: EasingType;
  onComplete?: () => void;
}

export function fadeIn(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: FadeInOptions = {},
): string {
  const { duration = 0.3, easing = 'easeOut', onComplete } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  if (w) { w.renderOpacity = 0; w.visibility = 'Visible'; }
  return sys.animateFloat(widgetId, 'renderOpacity', 0, 1, duration, easing, onComplete);
}

// ============================================================
//  13. fadeOut
// ============================================================

export interface FadeOutOptions {
  duration?: number;
  easing?: EasingType;
  onComplete?: () => void;
}

export function fadeOut(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: FadeOutOptions = {},
): string {
  const { duration = 0.3, easing = 'easeIn', onComplete } = opts;
  return sys.animateFloat(widgetId, 'renderOpacity', 1, 0, duration, easing, () => {
    const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
    if (w) w.visibility = 'Collapsed';
    onComplete?.();
  });
}

// ============================================================
//  14. wobble
//  Rotation oscillation (confused, hit stun, drunk).
// ============================================================

export interface WobbleOptions {
  /** Maximum rotation angle in degrees. Default 12. */
  amplitude?: number;
  /** Cycles to wobble. Default 3. */
  cycles?: number;
  /** Duration per half cycle. Default 0.08. */
  halfPeriod?: number;
  onComplete?: () => void;
}

export function wobble(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: WobbleOptions = {},
): void {
  const { amplitude = 12, cycles = 3, halfPeriod = 0.08, onComplete } = opts;
  let step = 0;
  const totalSteps = cycles * 2;

  function doStep(): void {
    if (step >= totalSteps) {
      sys.animateFloat(widgetId, 'renderAngle', undefined as any, 0, halfPeriod, 'easeOut', onComplete);
      return;
    }
    const dir = step % 2 === 0 ? 1 : -1;
    const decay = 1 - step / totalSteps;
    sys.animateFloat(widgetId, 'renderAngle', undefined as any, dir * amplitude * decay, halfPeriod, 'linear', () => {
      step++;
      doStep();
    });
  }

  doStep();
}

// ============================================================
//  15. flashColor
//  Flash a color property to a target color then back.
//  Works on imageProps.tintColor, borderProps.backgroundColor, etc.
// ============================================================

export interface FlashColorOptions {
  /** Property path relative to widget (dot notation). e.g. 'imageProps.tintColor'. */
  property: string;
  /** Base/restore color (hex). */
  fromColor: string;
  /** Flash-to color (hex). */
  toColor: string;
  /** Duration of flash-to phase. Default 0.08. */
  flashDuration?: number;
  /** Duration of restore phase. Default 0.2. */
  restoreDuration?: number;
  onComplete?: () => void;
}

export function flashColor(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: FlashColorOptions,
): void {
  const { property, fromColor, toColor, flashDuration = 0.08, restoreDuration = 0.2, onComplete } = opts;
  sys.animateColor(widgetId, property, fromColor, toColor, flashDuration, 'easeOut', () => {
    sys.animateColor(widgetId, property, toColor, fromColor, restoreDuration, 'easeOut', onComplete);
  });
}

// ============================================================
//  16. countUp
//  Animates a number from `from` to `to` in a Text widget.
//  Calls a formatter function to build the display string.
// ============================================================

export interface CountUpOptions {
  from?: number;
  to: number;
  duration?: number;
  easing?: EasingType;
  /** Format the raw numeric value to a display string. Default: Math.round. */
  format?: (n: number) => string;
  onComplete?: () => void;
}

export function countUp(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: CountUpOptions,
): string {
  const { from = 0, to, duration = 0.6, easing = 'easeOut', format = n => String(Math.round(n)), onComplete } = opts;

  // Drive a "virtual" float property and use a custom updater approach:
  // We animate a scratch property 'renderAngle' — no. Better: use a
  // per-frame callback bridged through a tiny update loop.
  // Actually let's use a custom hidden property path 'textCounterValue'
  // and override animateFloat to write the result to textProps.text.

  // We'll use a one-off approach: animate using a fake property and intercept
  // via the WidgetAnimationSystem's onComplete/per-tick. Simplest: directly
  // write textProps.text each frame via a custom float anim + postprocess hook.

  // Since WidgetAnimationSystem._setProperty only sets the property path on the widget,
  // animating a custom path like '_counter' will set widget['_counter'] = value.
  // Then we need a per-frame hook to read it and apply to textProps.text.
  // Instead, animate directly on textProps.text via a custom property driver.

  // Cleanest approach given existing API: create a wrapper that polls.
  let cancelled = false;
  const startTime = performance.now();

  const EASING_MAP: Record<string, (t: number) => number> = {
    linear: t => t,
    easeOut: t => t * (2 - t),
    easeIn: t => t * t,
    easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  };
  const easeFn = EASING_MAP[easing] ?? EASING_MAP.easeOut;
  const durationMs = duration * 1000;

  const progressId = 'countup_' + widgetId;

  function tick(): void {
    if (cancelled) return;
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    const easedT = easeFn(t);
    const val = from + (to - from) * easedT;

    const callbacks = (sys as any)._callbacks;
    if (callbacks) {
      const w = callbacks.getWidget(widgetId) as WidgetNodeJSON | undefined;
      if (w?.textProps) {
        w.textProps.text = format(val);
        callbacks.markDirty(widgetId);
      }
    }

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      onComplete?.();
    }
  }

  requestAnimationFrame(tick);

  return progressId;
}

// ============================================================
//  17. screenShake
//  Oscillates a parent/HUD widget's translation (UI camera shake).
// ============================================================

export interface ScreenShakeOptions {
  amplitude?: number;
  cycles?: number;
  halfPeriod?: number;
  onComplete?: () => void;
}

export function screenShake(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: ScreenShakeOptions = {},
): void {
  const { amplitude = 10, cycles = 5, halfPeriod = 0.04, onComplete } = opts;

  let step = 0;
  const totalSteps = cycles * 2;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  const originX = w?.renderTranslation?.x ?? 0;
  const originY = w?.renderTranslation?.y ?? 0;

  function doStep(): void {
    if (step >= totalSteps) {
      sys.animateVector2(widgetId, 'renderTranslation', { x: undefined as any, y: undefined as any }, { x: originX, y: originY }, halfPeriod, 'easeOut', onComplete);
      return;
    }
    const angle = (step / totalSteps) * Math.PI * cycles * 2;
    const decay = 1 - step / totalSteps;
    const offX = Math.cos(angle) * amplitude * decay;
    const offY = Math.sin(angle * 0.7) * amplitude * 0.5 * decay;
    sys.animateVector2(widgetId, 'renderTranslation', { x: undefined as any, y: undefined as any }, { x: originX + offX, y: originY + offY }, halfPeriod, 'linear', () => {
      step++;
      doStep();
    });
  }

  doStep();
}

// ============================================================
//  18. stampIn
//  Fast scale overshoot then settle — achievement badge, popup reward.
// ============================================================

export interface StampInOptions {
  /** Scale during the overshoot moment. Default 1.25. */
  overshootScale?: number;
  /** Duration of the scale-up phase. Default 0.08. */
  overshootDuration?: number;
  /** Duration of the settle phase. Default 0.15. */
  settleDuration?: number;
  onComplete?: () => void;
}

export function stampIn(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: StampInOptions = {},
): void {
  const { overshootScale = 1.25, overshootDuration = 0.08, settleDuration = 0.15, onComplete } = opts;
  const w = (sys as any)._callbacks?.getWidget(widgetId) as WidgetNodeJSON | undefined;
  if (w) { w.renderScale = { x: 0, y: 0 }; w.visibility = 'Visible'; }

  sys.animateFloat(widgetId, 'renderScale.x', 0, overshootScale, overshootDuration, 'easeOut', () => {
    sys.animateFloat(widgetId, 'renderScale.x', overshootScale, 1, settleDuration, 'easeIn', onComplete);
  });
  sys.animateFloat(widgetId, 'renderScale.y', 0, overshootScale, overshootDuration, 'easeOut', () => {
    sys.animateFloat(widgetId, 'renderScale.y', overshootScale, 1, settleDuration, 'easeIn');
  });
}

// ============================================================
//  19. sway
//  Gentle looping side-to-side rotation (idle breathing, ambient).
//  Returns animation IDs; stop with sys.stopAnimation(id).
// ============================================================

export interface SwayOptions {
  /** Max angle in degrees. Default 3. */
  angle?: number;
  /** Period of one full sway cycle (seconds). Default 2.5. */
  period?: number;
}

export function sway(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: SwayOptions = {},
): string {
  const { angle = 3, period = 2.5 } = opts;
  const id = sys.animateFloat(widgetId, 'renderAngle', -angle, angle, period / 2, 'easeInOut');
  const anim = (sys as any)._activeAnimations?.get(id);
  if (anim) { anim.loop = true; anim.pingPong = true; }
  return id;
}

// ============================================================
//  20. typewriterGo
//  Triggers the typewriter text animation on a Text widget
//  by toggling the animated.enabled flag and marking it dirty.
// ============================================================

export interface TypewriterGoOptions {
  /** Characters per second. Default 30. */
  speed?: number;
  onComplete?: () => void;
}

export function typewriterGo(
  widgetId: string,
  sys: WidgetAnimationSystem,
  opts: TypewriterGoOptions = {},
): void {
  const { speed = 30, onComplete } = opts;
  const callbacks = (sys as any)._callbacks;
  if (!callbacks) return;

  const w = callbacks.getWidget(widgetId) as WidgetNodeJSON | undefined;
  if (!w?.textProps) return;

  const fullText = w.textProps.text;
  if (!fullText) return;

  w.textProps.text = '';
  const chars = Array.from(fullText);
  let idx = 0;
  const intervalMs = 1000 / speed;

  const interval = setInterval(() => {
    if (idx >= chars.length) {
      clearInterval(interval);
      w.textProps!.text = fullText;
      callbacks.markDirty(widgetId);
      onComplete?.();
      return;
    }
    w.textProps!.text += chars[idx];
    idx++;
    callbacks.markDirty(widgetId);
  }, intervalMs);
}

// ============================================================
//  Convenience: runSequence
//  Chains multiple AnimationPreset calls with delays between them.
//  Each entry is { fn: (onDone) => void, delay?: number }.
// ============================================================

export interface SequenceEntry {
  /** The preset call. Receive `onDone` and invoke it when finished. */
  fn: (onDone: () => void) => void;
  /** Delay before this step fires (seconds). Default 0. */
  delay?: number;
}

export function runSequence(steps: SequenceEntry[], onAllDone?: () => void): void {
  let i = 0;

  function next(): void {
    if (i >= steps.length) {
      onAllDone?.();
      return;
    }
    const step = steps[i++];
    const delay = (step.delay ?? 0) * 1000;
    setTimeout(() => step.fn(next), delay);
  }

  next();
}
