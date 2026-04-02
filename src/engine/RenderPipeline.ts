import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';

export interface PostProcessSettings {
  ssaoEnabled: boolean;
  ssaoRadius: number;
  ssaoIntensity: number;
  ssaoBias: number;
  ssaoKernelSize: number;
  bloomEnabled: boolean;
  bloomIntensity: number;
  bloomThreshold: number;
  bloomRadius: number;
  saturation: number;
  contrast: number;
  gamma: number;
  temperature: number;
  tint: number;
  vignetteEnabled: boolean;
  vignetteIntensity: number;
  chromaticAberrationEnabled: boolean;
  chromaticAberrationIntensity: number;
  filmGrainEnabled: boolean;
  filmGrainIntensity: number;
  godRaysEnabled: boolean;
  godRaysIntensity: number;
  godRaysDensity: number;
  godRaysDecay: number;
  godRaysExposure: number;
  godRaysWeight: number;
  godRaysSamples: number;
}

export const defaultPostProcessSettings: PostProcessSettings = {
  ssaoEnabled: false,
  ssaoRadius: 0.5,
  ssaoIntensity: 1.0,
  ssaoBias: 0.025,
  ssaoKernelSize: 16,
  bloomEnabled: true,
  bloomIntensity: 0.15,
  bloomThreshold: 0.85,
  bloomRadius: 0.4,
  saturation: 1.0,
  contrast: 1.0,
  gamma: 1.0,
  temperature: 6500,
  tint: 0.0,
  vignetteEnabled: false,
  vignetteIntensity: 0.4,
  chromaticAberrationEnabled: false,
  chromaticAberrationIntensity: 0.5,
  filmGrainEnabled: false,
  filmGrainIntensity: 0.1,
  godRaysEnabled: false,
  godRaysIntensity: 0.65,
  godRaysDensity: 0.96,
  godRaysDecay: 0.97,
  godRaysExposure: 0.22,
  godRaysWeight: 0.6,
  godRaysSamples: 60,
};

export class RenderPipeline {
  public composer: EffectComposer;
  public renderPass: RenderPass;
  public ssaoPass: SSAOPass;
  public bloomPass: UnrealBloomPass;
  public godRaysPass: ShaderPass;
  public colorGradingPass: ShaderPass;
  public vignettePass: ShaderPass;
  public chromaticAberrationPass: ShaderPass;
  public filmGrainPass: ShaderPass;
  public gammaCorrectionPass: ShaderPass;

  private _settings: PostProcessSettings = { ...defaultPostProcessSettings };

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = new THREE.Vector2();
    renderer.getSize(size);

    this.composer = new EffectComposer(renderer);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // ── SSAO (Screen-Space Ambient Occlusion) ──
    this.ssaoPass = new SSAOPass(scene, camera, size.x, size.y);
    this.ssaoPass.kernelRadius = this._settings.ssaoRadius;
    this.ssaoPass.minDistance = this._settings.ssaoBias;
    this.ssaoPass.maxDistance = this._settings.ssaoRadius * 2;
    this.ssaoPass.output = SSAOPass.OUTPUT.Default;
    this.ssaoPass.enabled = this._settings.ssaoEnabled;
    this.composer.addPass(this.ssaoPass);

    // ── Bloom ──
    this.bloomPass = new UnrealBloomPass(
      size,
      this._settings.bloomIntensity,
      this._settings.bloomRadius,
      this._settings.bloomThreshold,
    );
    this.bloomPass.enabled = this._settings.bloomEnabled;
    this.composer.addPass(this.bloomPass);

    // ── God Rays ──
    this.godRaysPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        sunPosition: { value: new THREE.Vector2(0.5, 0.5) },
        density: { value: 0.96 },
        weight: { value: 0.6 },
        decay: { value: 0.97 },
        exposure: { value: 0.22 },
        numSamples: { value: 60.0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 sunPosition;
        uniform float density;
        uniform float weight;
        uniform float decay;
        uniform float exposure;
        uniform float numSamples;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          vec2 deltaUV = (vUv - sunPosition) * (1.0 / numSamples) * density;
          vec2 uv = vUv;
          float illumination = 1.0;
          vec3 rays = vec3(0.0);
          for (int i = 0; i < 100; i++) {
            if (float(i) >= numSamples) break;
            uv -= deltaUV;
            vec4 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
            float lum = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
            float t = smoothstep(0.25, 1.0, lum);
            rays += s.rgb * t * illumination * weight;
            illumination *= decay;
          }
          color.rgb += rays * exposure;
          gl_FragColor = color;
        }
      `,
    });
    this.godRaysPass.enabled = this._settings.godRaysEnabled;
    this.composer.addPass(this.godRaysPass);

    // ── Color Grading ──
    this.colorGradingPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        saturation: { value: 1.0 },
        contrast: { value: 1.0 },
        gamma: { value: 1.0 },
        temperature: { value: 6500.0 },
        tint: { value: 0.0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float saturation;
        uniform float contrast;
        uniform float gamma;
        uniform float temperature;
        uniform float tint;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(tDiffuse, vUv);
          vec3 c = tex.rgb;
          // Saturation
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(lum), c, saturation);
          // Contrast
          c = (c - 0.5) * contrast + 0.5;
          // Gamma
          c = pow(max(c, vec3(0.0)), vec3(1.0 / gamma));
          // Temperature (simple Kelvin-based tinting)
          float tempOffset = (temperature - 6500.0) / 13000.0;
          c.r += tempOffset * 0.1;
          c.b -= tempOffset * 0.1;
          // Tint (green-magenta)
          c.g += tint * 0.05;
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
        }
      `,
    });
    this.composer.addPass(this.colorGradingPass);

    // ── Vignette ──
    this.vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.4 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(tDiffuse, vUv);
          vec2 uv = vUv * (1.0 - vUv);
          float v = uv.x * uv.y * 15.0;
          v = pow(v, intensity);
          gl_FragColor = vec4(tex.rgb * v, tex.a);
        }
      `,
    });
    this.vignettePass.enabled = this._settings.vignetteEnabled;
    this.composer.addPass(this.vignettePass);

    // ── Chromatic Aberration ──
    this.chromaticAberrationPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.5 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        varying vec2 vUv;
        void main() {
          vec2 dir = vUv - vec2(0.5);
          float dist = length(dir);
          vec2 offset = dir * dist * intensity * 0.01;
          float r = texture2D(tDiffuse, vUv + offset).r;
          float g = texture2D(tDiffuse, vUv).g;
          float b = texture2D(tDiffuse, vUv - offset).b;
          float a = texture2D(tDiffuse, vUv).a;
          gl_FragColor = vec4(r, g, b, a);
        }
      `,
    });
    this.chromaticAberrationPass.enabled = this._settings.chromaticAberrationEnabled;
    this.composer.addPass(this.chromaticAberrationPass);

    // ── Film Grain ──
    this.filmGrainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        intensity: { value: 0.1 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;
        float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          float noise = (rand(vUv + time) - 0.5) * intensity;
          gl_FragColor = vec4(color.rgb + noise, color.a);
        }
      `,
    });
    this.filmGrainPass.enabled = this._settings.filmGrainEnabled;
    this.composer.addPass(this.filmGrainPass);

    // ── Gamma Correction (Final Pass) ──
    this.gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
    this.composer.addPass(this.gammaCorrectionPass);
  }

  public updateSettings(settings: Partial<PostProcessSettings>): void {
    this._settings = { ...this._settings, ...settings };

    this.ssaoPass.enabled = this._settings.ssaoEnabled;
    this.ssaoPass.kernelRadius = this._settings.ssaoRadius;
    this.ssaoPass.minDistance = this._settings.ssaoBias;
    this.ssaoPass.maxDistance = this._settings.ssaoRadius * 2;

    this.bloomPass.enabled = this._settings.bloomEnabled;
    this.bloomPass.strength = this._settings.bloomIntensity;
    this.bloomPass.threshold = this._settings.bloomThreshold;
    this.bloomPass.radius = this._settings.bloomRadius;

    this.godRaysPass.enabled = this._settings.godRaysEnabled;
    this.godRaysPass.uniforms.density.value = this._settings.godRaysDensity;
    this.godRaysPass.uniforms.weight.value = this._settings.godRaysWeight;
    this.godRaysPass.uniforms.decay.value = this._settings.godRaysDecay;
    this.godRaysPass.uniforms.exposure.value = this._settings.godRaysExposure;
    this.godRaysPass.uniforms.numSamples.value = this._settings.godRaysSamples;

    this.colorGradingPass.uniforms.saturation.value = this._settings.saturation;
    this.colorGradingPass.uniforms.contrast.value = this._settings.contrast;
    this.colorGradingPass.uniforms.gamma.value = this._settings.gamma;
    this.colorGradingPass.uniforms.temperature.value = this._settings.temperature;
    this.colorGradingPass.uniforms.tint.value = this._settings.tint;

    this.vignettePass.enabled = this._settings.vignetteEnabled;
    this.vignettePass.uniforms.intensity.value = this._settings.vignetteIntensity;

    this.chromaticAberrationPass.enabled = this._settings.chromaticAberrationEnabled;
    this.chromaticAberrationPass.uniforms.intensity.value = this._settings.chromaticAberrationIntensity;

    this.filmGrainPass.enabled = this._settings.filmGrainEnabled;
    this.filmGrainPass.uniforms.intensity.value = this._settings.filmGrainIntensity;
  }

  public setSunScreenPosition(x: number, y: number): void {
    this.godRaysPass.uniforms.sunPosition.value.set(x, y);
  }

  public updateTime(time: number): void {
    this.filmGrainPass.uniforms.time.value = time;
  }

  public resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  public render(): void {
    this.composer.render();
  }

  public dispose(): void {
    this.composer.dispose();
  }
}
