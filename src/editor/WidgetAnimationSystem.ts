// ============================================================
//  WidgetAnimationSystem — Easing-driven property animation
//  for widgets. Supports float, color, and vector2 interpolation
//  with multiple easing curves (ease, bounce, spring, etc.).
// ============================================================

import * as THREE from 'three';
import type { WidgetNodeJSON } from './WidgetBlueprintData';

// ---- Unique ID helper ----
let _animUid = 0;
function animUid(): string {
  return 'wanim_' + Date.now().toString(36) + '_' + (++_animUid).toString(36);
}

// ============================================================
//  Types
// ============================================================

export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'bounce'
  | 'spring'
  | 'elastic';

export type AnimationType = 'float' | 'color' | 'vector2';

export interface ActiveAnimation {
  id: string;
  widgetId: string;
  property: string;
  type: AnimationType;
  from: any;
  to: any;
  duration: number;
  elapsed: number;
  easing: EasingType;
  onComplete?: () => void;
  loop?: boolean;
  pingPong?: boolean;
  _direction?: 1 | -1;
}

export interface AnimationCallback {
  markDirty: (widgetId: string) => void;
  getWidget: (widgetId: string) => WidgetNodeJSON | undefined;
}

// ============================================================
//  Easing Functions
// ============================================================

const EASING: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  bounce: (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    else if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    else if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    else return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  spring: (t) => {
    return 1 - Math.cos(t * Math.PI * 4) * Math.pow(1 - t, 3);
  },
  elastic: (t) => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
  },
};

// ============================================================
//  WidgetAnimationSystem
// ============================================================

export class WidgetAnimationSystem {
  private _activeAnimations: Map<string, ActiveAnimation> = new Map();
  private _callbacks: AnimationCallback;

  private static _instance: WidgetAnimationSystem | null = null;

  constructor(callbacks: AnimationCallback) {
    this._callbacks = callbacks;
    WidgetAnimationSystem._instance = this;
  }

  static get instance(): WidgetAnimationSystem | null {
    return WidgetAnimationSystem._instance;
  }

  // ---- Create animations ----

  animateFloat(
    widgetId: string,
    property: string,
    from: number,
    to: number,
    duration: number,
    easing: EasingType = 'easeOut',
    onComplete?: () => void,
  ): string {
    const id = animUid();
    this._activeAnimations.set(id, {
      id,
      widgetId,
      property,
      type: 'float',
      from,
      to,
      duration,
      elapsed: 0,
      easing,
      onComplete,
    });
    return id;
  }

  animateColor(
    widgetId: string,
    property: string,
    fromColor: string,
    toColor: string,
    duration: number,
    easing: EasingType = 'easeOut',
    onComplete?: () => void,
  ): string {
    const id = animUid();
    this._activeAnimations.set(id, {
      id,
      widgetId,
      property,
      type: 'color',
      from: new THREE.Color(fromColor),
      to: new THREE.Color(toColor),
      duration,
      elapsed: 0,
      easing,
      onComplete,
    });
    return id;
  }

  animateVector2(
    widgetId: string,
    property: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration: number,
    easing: EasingType = 'easeOut',
    onComplete?: () => void,
  ): string {
    const id = animUid();
    this._activeAnimations.set(id, {
      id,
      widgetId,
      property,
      type: 'vector2',
      from: { ...from },
      to: { ...to },
      duration,
      elapsed: 0,
      easing,
      onComplete,
    });
    return id;
  }

  // ---- Stop animations ----

  stopAnimation(animId: string): void {
    this._activeAnimations.delete(animId);
  }

  stopAllAnimations(widgetId: string): void {
    for (const [id, anim] of this._activeAnimations) {
      if (anim.widgetId === widgetId) {
        this._activeAnimations.delete(id);
      }
    }
  }

  stopAll(): void {
    this._activeAnimations.clear();
  }

  pauseAnimation(animId: string): void {
    const anim = this._activeAnimations.get(animId);
    if (anim) {
      (anim as any)._paused = true;
    }
  }

  resumeAnimation(animId: string): void {
    const anim = this._activeAnimations.get(animId);
    if (anim) {
      (anim as any)._paused = false;
    }
  }

  // ---- Check state ----

  isAnimating(widgetId: string): boolean {
    for (const anim of this._activeAnimations.values()) {
      if (anim.widgetId === widgetId) return true;
    }
    return false;
  }

  get activeCount(): number {
    return this._activeAnimations.size;
  }

  // ---- Update (call every frame with deltaTime in seconds) ----

  update(deltaTime: number): void {
    if (this._activeAnimations.size === 0) return;

    const toRemove: string[] = [];

    for (const [id, anim] of this._activeAnimations) {
      if ((anim as any)._paused) continue;

      anim.elapsed += deltaTime;
      let t = Math.min(anim.elapsed / anim.duration, 1.0);

      // Apply easing
      const easeFn = EASING[anim.easing] || EASING.linear;
      const easedT = easeFn(t);

      // Get widget
      const widget = this._callbacks.getWidget(anim.widgetId);
      if (!widget) {
        toRemove.push(id);
        continue;
      }

      // Interpolate value
      switch (anim.type) {
        case 'float': {
          const value = anim.from + (anim.to - anim.from) * easedT;
          this._setProperty(widget, anim.property, value);
          break;
        }
        case 'color': {
          const color = (anim.from as THREE.Color).clone().lerp(anim.to as THREE.Color, easedT);
          this._setProperty(widget, anim.property, '#' + color.getHexString());
          break;
        }
        case 'vector2': {
          const value = {
            x: anim.from.x + (anim.to.x - anim.from.x) * easedT,
            y: anim.from.y + (anim.to.y - anim.from.y) * easedT,
          };
          this._setProperty(widget, anim.property, value);
          break;
        }
      }

      this._callbacks.markDirty(anim.widgetId);

      // Check completion
      if (t >= 1.0) {
        if (anim.loop) {
          anim.elapsed = 0;
          if (anim.pingPong) {
            // Swap from/to for ping-pong
            const tmp = anim.from;
            anim.from = anim.to;
            anim.to = tmp;
          }
        } else {
          anim.onComplete?.();
          toRemove.push(id);
        }
      }
    }

    for (const id of toRemove) {
      this._activeAnimations.delete(id);
    }
  }

  // ---- Property access ----

  private _setProperty(widget: WidgetNodeJSON, path: string, value: any): void {
    const parts = path.split('.');
    let obj: any = widget;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
      if (!obj) return;
    }
    obj[parts[parts.length - 1]] = value;
  }

  static getProperty(widget: WidgetNodeJSON, path: string): any {
    const parts = path.split('.');
    let obj: any = widget;
    for (const part of parts) {
      obj = obj?.[part];
      if (obj === undefined) return undefined;
    }
    return obj;
  }

  // ---- Available easing names ----

  static get easingNames(): EasingType[] {
    return Object.keys(EASING) as EasingType[];
  }
}
