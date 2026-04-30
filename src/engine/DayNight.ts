import * as THREE from 'three';

/**
 * Wall-clock day/night cycle. Drives sun position + color, ambient strength,
 * and an optional scene-background tint. Other systems (Sky, gameplay code)
 * read `phase()` / `daylight()` to stay in sync without coupling.
 *
 *   phase()    — 0..1 around the clock (0 = midnight, 0.25 = sunrise,
 *                0.5 = noon, 0.75 = sunset).
 *   daylight() — eased intensity 0..1 (0 at midnight, 1 at noon).
 *
 * Ported from the Factory game (src/game/DayNight.js) with the same numeric
 * behaviour, plus setPhase() / pause()/resume() so blueprint nodes can scrub
 * time of day directly.
 */
export interface DayNightOptions {
  /** Optional THREE scene whose background colour gets lerped. Pass null to skip. */
  scene?: THREE.Scene | null;
  /** Optional directional light used as the sun (positioned + tinted each tick). */
  sun?: THREE.DirectionalLight | null;
  /** Optional ambient light intensity ramps with daylight. */
  ambient?: THREE.AmbientLight | null;
  /** Seconds for one full revolution. Default 90s like Factory. */
  cycleSeconds?: number;
  /** Starting phase 0..1. Default 0.25 (mid-morning). */
  startPhase?: number;
}

export class DayNight {
  public scene: THREE.Scene | null;
  public sun: THREE.DirectionalLight | null;
  public ambient: THREE.AmbientLight | null;
  public cycleSeconds: number;
  public paused: boolean = false;

  /** Internal time accumulator — wraps at cycleSeconds. */
  private _t: number;

  private readonly _dayColor = new THREE.Color(0x0e1116);
  private readonly _nightColor = new THREE.Color(0x05080d);
  private readonly _tmpColor = new THREE.Color();

  constructor(opts: DayNightOptions = {}) {
    this.scene = opts.scene ?? null;
    this.sun = opts.sun ?? null;
    this.ambient = opts.ambient ?? null;
    this.cycleSeconds = Math.max(0.001, opts.cycleSeconds ?? 90);
    const start = opts.startPhase ?? 0.25;
    this._t = (start % 1) * this.cycleSeconds;
  }

  /** 0..1 around the clock. */
  phase(): number {
    return (this._t / this.cycleSeconds) % 1;
  }

  /** Eased daylight intensity, 0 at midnight peaking at 1 at noon. */
  daylight(): number {
    const p = this.phase();
    return Math.max(0, Math.sin(p * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);
  }

  isDay(): boolean {
    return this.daylight() > 0.05;
  }

  /** Pin the cycle to a specific phase (0..1). Useful for scripted moments. */
  setPhase(p: number): void {
    const wrapped = ((p % 1) + 1) % 1;
    this._t = wrapped * this.cycleSeconds;
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  /** Advance the clock and refresh sun/ambient/background. */
  update(dt: number): void {
    if (!this.paused) {
      this._t = (this._t + dt) % this.cycleSeconds;
    }

    const d = this.daylight();
    const p = this.phase();

    if (this.sun) {
      this.sun.intensity = 0.15 + d * 0.95;
      // East -> overhead -> west arc.
      const angle = (p - 0.5) * Math.PI;
      const r = 22;
      this.sun.position.set(Math.sin(angle) * r, 8 + Math.cos(angle) * 18, 6);
      this.sun.color.setHSL(0.08 + (1 - d) * 0.02, 0.4 + d * 0.3, 0.35 + d * 0.55);
    }
    if (this.ambient) {
      this.ambient.intensity = 0.18 + d * 0.45;
    }

    const bg = this.scene?.background as THREE.Color | undefined;
    if (bg && (bg as any).lerpColors) {
      bg.lerpColors(this._nightColor, this._dayColor, d);
    } else if (bg && (bg as any).copy) {
      this._tmpColor.copy(this._nightColor).lerp(this._dayColor, d);
      bg.copy(this._tmpColor);
    }

    // Fog colour follows the background — only when Sky isn't driving it
    // (Sky takes over fog when scene.background has been cleared to null).
    if (this.scene?.fog && bg && (bg as any).r !== undefined) {
      (this.scene.fog as THREE.Fog).color.copy(bg);
    }
  }
}
