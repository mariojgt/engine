import * as THREE from 'three';

/**
 * Procedural stylised skybox. A big inverted sphere drawn with a custom
 * shader that paints zenith→horizon→ground bands, a soft sun disc + halo,
 * and sprinkled stars at night. Optional day/night equirect panoramas
 * crossfade on top of the procedural base.
 *
 * Decoupled from any time-of-day source — call `update({ phase, daylight })`
 * yourself, or use Engine.enableSky() which auto-feeds it from DayNight.
 *
 * Ported from the Factory game (src/engine/Sky.js).
 */

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float sunSize;
  uniform float sunSoft;
  uniform float haloPow;
  uniform float haloStrength;
  uniform float bandPow;
  uniform float starAmount;
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform float texAmount;
  uniform float daylight;

  #define PI 3.141592653589793

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);

    float h = d.y;
    vec3 col;
    if (h >= 0.0) {
      float t = pow(h, 1.0 / max(bandPow, 0.001));
      col = mix(horizon, zenith, t);
    } else {
      float gt = clamp(-h * 1.3, 0.0, 1.0);
      col = mix(horizon, ground, gt);
    }

    vec3 sd = normalize(sunDir);
    float c = dot(d, sd);
    float disc = smoothstep(sunSize - sunSoft, sunSize, c);
    float halo = pow(max(c, 0.0), haloPow) * haloStrength;
    col += sunColor * halo;
    col = mix(col, sunColor, disc);

    if (h > 0.0 && starAmount > 0.001) {
      float n = hash3(floor(d * 80.0));
      float star = smoothstep(0.992, 0.998, n) * starAmount;
      col += vec3(0.95, 0.97, 1.0) * star * 1.4;
    }

    if (texAmount > 0.001) {
      float skyAmount = smoothstep(-0.02, 0.06, d.y);
      if (skyAmount > 0.0) {
        float u = atan(d.x, d.z) / (2.0 * PI) + 0.5;
        float v = clamp(d.y, 0.0, 1.0);
        vec2 uv = vec2(u, v);
        vec3 dayCol   = texture2D(dayTex,   uv).rgb;
        vec3 nightCol = texture2D(nightTex, uv).rgb;
        vec3 texCol = mix(nightCol, dayCol, clamp(daylight, 0.0, 1.0));
        texCol += sunColor * halo * 0.5;
        col = mix(col, texCol, texAmount * skyAmount);
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

interface PaletteStop {
  p: number;
  zenith: number;
  horizon: number;
  ground: number;
  sun: number;
}

// Phase 0..1 (0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset).
const STOPS: PaletteStop[] = [
  { p: 0.00, zenith: 0x0a0d1a, horizon: 0x12172a, ground: 0x080b15, sun: 0xb9c7ff },
  { p: 0.20, zenith: 0x1f1f3a, horizon: 0x4a3155, ground: 0x100c1c, sun: 0xffb27a },
  { p: 0.25, zenith: 0x33345e, horizon: 0xff8a4a, ground: 0x171425, sun: 0xffd49a },
  { p: 0.32, zenith: 0x3f6ea8, horizon: 0xffc283, ground: 0x1a2230, sun: 0xfff0c2 },
  { p: 0.50, zenith: 0x3a76b8, horizon: 0xa6d0ee, ground: 0x1c2028, sun: 0xffeec2 },
  { p: 0.68, zenith: 0x3f6ea8, horizon: 0xffbb78, ground: 0x1a2230, sun: 0xfff0c2 },
  { p: 0.75, zenith: 0x33345e, horizon: 0xff7a4a, ground: 0x171425, sun: 0xffb874 },
  { p: 0.82, zenith: 0x1c1a36, horizon: 0x3a2342, ground: 0x100c1c, sun: 0x9aa9ff },
  { p: 1.00, zenith: 0x0a0d1a, horizon: 0x12172a, ground: 0x080b15, sun: 0xb9c7ff },
];

export interface SkyOptions {
  scene: THREE.Scene;
  /** Sphere radius — make sure it's > camera far is not required, just larger than visible scene. */
  radius?: number;
  /** Optional equirect URLs. The procedural sky shows immediately; textures fade in once loaded. */
  dayTexUrl?: string | null;
  nightTexUrl?: string | null;
  /** If true, clears scene.background so the sky alone draws it (Factory default). */
  clearSceneBackground?: boolean;
}

export interface SkyUpdateInput {
  /** 0..1 around the clock. */
  phase: number;
  /** 0..1 daylight intensity. */
  daylight: number;
  /** Optional explicit sun direction. If omitted, it's synthesised from phase. */
  sunDir?: THREE.Vector3 | { x: number; y: number; z: number };
}

export class Sky {
  public scene: THREE.Scene;
  public material: THREE.ShaderMaterial;
  public mesh: THREE.Mesh;

  private _texTarget = 0;
  private _loadedCount = 0;
  private _texNeeded = 0;
  private readonly _tmpDir = new THREE.Vector3();

  constructor(opts: SkyOptions) {
    const { scene, radius = 240, dayTexUrl = null, nightTexUrl = null, clearSceneBackground = true } = opts;
    this.scene = scene;

    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    blank.needsUpdate = true;

    const geom = new THREE.SphereGeometry(radius, 40, 24);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        zenith:       { value: new THREE.Color(0x3a76b8) },
        horizon:      { value: new THREE.Color(0xa6d0ee) },
        ground:       { value: new THREE.Color(0x1c2028) },
        sunDir:       { value: new THREE.Vector3(0, 1, 0) },
        sunColor:     { value: new THREE.Color(0xffeec2) },
        sunSize:      { value: 0.9985 },
        sunSoft:      { value: 0.001 },
        haloPow:      { value: 12.0 },
        haloStrength: { value: 0.18 },
        bandPow:      { value: 2.2 },
        starAmount:   { value: 0.0 },
        dayTex:       { value: blank },
        nightTex:     { value: blank },
        texAmount:    { value: 0.0 },
        daylight:     { value: 0.5 },
      },
    });

    if (dayTexUrl)   this._loadTexture(dayTexUrl,   'dayTex');
    if (nightTexUrl) this._loadTexture(nightTexUrl, 'nightTex');
    this._texNeeded = (dayTexUrl ? 1 : 0) + (nightTexUrl ? 1 : 0);

    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    if (clearSceneBackground) {
      scene.background = null;
    }
  }

  private _loadTexture(url: string, uniformName: 'dayTex' | 'nightTex'): void {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.colorSpace = THREE.SRGBColorSpace;
        const u = this.material.uniforms[uniformName];
        if (u) u.value = tex;
        this._loadedCount++;
        if (this._loadedCount >= this._texNeeded) {
          this._texTarget = 1.0;
        }
      },
      undefined,
      (err) => {
        console.warn(`[Sky] failed to load ${url}`, err);
      },
    );
  }

  private _samplePalette(p: number): { a: PaletteStop; b: PaletteStop; t: number } {
    let i = 0;
    while (i < STOPS.length - 1 && STOPS[i + 1].p <= p) i++;
    const a = STOPS[i];
    const b = STOPS[Math.min(i + 1, STOPS.length - 1)];
    const span = Math.max(0.0001, b.p - a.p);
    const t = (p - a.p) / span;
    return { a, b, t };
  }

  /**
   * Refresh sky uniforms from a phase + daylight pair. Caller picks the
   * source — typically a DayNight instance, but any 0..1 phase works.
   */
  update(input: SkyUpdateInput): void {
    const u = this.material.uniforms;
    const { phase, daylight } = input;
    const { a, b, t } = this._samplePalette(phase);

    u.zenith.value.set(a.zenith).lerp(new THREE.Color(b.zenith), t);
    u.horizon.value.set(a.horizon).lerp(new THREE.Color(b.horizon), t);
    u.ground.value.set(a.ground).lerp(new THREE.Color(b.ground), t);
    u.sunColor.value.set(a.sun).lerp(new THREE.Color(b.sun), t);

    if (input.sunDir) {
      this._tmpDir.set(input.sunDir.x, input.sunDir.y, input.sunDir.z).normalize();
    } else {
      const a2 = (phase - 0.5) * Math.PI * 2.0;
      this._tmpDir.set(Math.sin(a2), Math.cos(a2), 0.3).normalize();
    }
    u.sunDir.value.copy(this._tmpDir);

    const golden = 1.0 - Math.abs(daylight - 0.5) * 2.0;
    u.haloStrength.value = 0.10 + 0.45 * Math.max(0.0, golden) * Math.max(0.15, daylight);
    u.haloPow.value = 6.0 + 14.0 * (1.0 - golden);
    u.sunSize.value = daylight > 0.05 ? 0.9985 : 0.999;

    const starHide = u.texAmount.value;
    u.starAmount.value = Math.pow(1.0 - Math.min(1.0, daylight / 0.3), 1.5) * (1.0 - starHide);

    u.daylight.value = daylight;
    u.texAmount.value += (this._texTarget - u.texAmount.value) * 0.06;

    if (this.scene?.fog) {
      (this.scene.fog as THREE.Fog).color.copy(u.horizon.value);
    }
  }

  dispose(): void {
    (this.mesh.geometry as THREE.BufferGeometry).dispose();
    this.material.dispose();
    this.scene?.remove(this.mesh);
  }
}
