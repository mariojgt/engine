/**
 * Object selection system — UE-style single/multi/box select with visual feedback.
 *
 * Features:
 *  - Single click select (raycast)
 *  - Ctrl+Click multi-select
 *  - Box/marquee select (drag)
 *  - Select All (Ctrl+A)
 *  - Deselect (Escape)
 *  - Invert selection (Ctrl+Shift+I)
 *  - Hover highlighting
 *  - Orange selection outline via outline post-processing
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import type { GameObject } from '../../engine/GameObject';

export type SelectionEvent = 'selectionChanged';

export class SelectionManager {
  private _scene: THREE.Scene;
  private _camera: THREE.PerspectiveCamera;
  private _renderer: THREE.WebGLRenderer;
  private _domElement: HTMLElement;

  private _selected = new Set<THREE.Object3D>();
  private _primarySelection: THREE.Object3D | null = null;
  private _hoveredObject: THREE.Object3D | null = null;

  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();

  /* Box select */
  private _boxSelectActive = false;
  private _boxSelectDragging = false;
  private _boxStartX = 0;
  private _boxStartY = 0;
  private _boxEl: HTMLDivElement;

  /* Post-processing outline */
  composer: EffectComposer;
  private _renderPass: RenderPass;
  private _outlineSelected: OutlinePass;
  private _outlineHover: OutlinePass;

  /* Post-processing effects */
  private _bloomPass: UnrealBloomPass;
  private _colorGradingPass: ShaderPass;
  private _vignettePass: ShaderPass;
  private _filmGrainPass: ShaderPass;
  private _godRaysPass: ShaderPass;
  private _chromaticAberrationPass: ShaderPass;

  /* Post-process settings (driven by PostProcessVolumeActor) */
  private _ppSettings = {
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

  /* Callbacks */
  private _findGameObjectRoot: (obj: THREE.Object3D) => THREE.Object3D | null;
  private _getSelectableObjects: () => THREE.Object3D[];
  private _getGroupMembers: ((obj: THREE.Object3D) => THREE.Object3D[]) | null = null;
  private _listeners: Map<SelectionEvent, Array<(selected: THREE.Object3D[]) => void>> = new Map();

  /* Track if we're navigating → suppress click selection */
  private _navigationActive = false;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    findGameObjectRoot: (obj: THREE.Object3D) => THREE.Object3D | null,
    getSelectableObjects: () => THREE.Object3D[],
  ) {
    this._scene = scene;
    this._camera = camera;
    this._renderer = renderer;
    this._domElement = renderer.domElement;
    this._findGameObjectRoot = findGameObjectRoot;
    this._getSelectableObjects = getSelectableObjects;

    // Box select element — UE5-style blue selection rectangle
    this._boxEl = document.createElement('div');
    this._boxEl.style.cssText = `
      position: fixed;
      border: 1px solid #3b82f6;
      background: rgba(59, 130, 246, 0.08);
      pointer-events: none;
      display: none;
      z-index: 10000;
    `;
    document.body.appendChild(this._boxEl);

    // Post-processing
    const size = new THREE.Vector2();
    renderer.getSize(size);

    this.composer = new EffectComposer(renderer);

    this._renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this._renderPass);

    // Outline for selected objects (UE5-style blue)
    this._outlineSelected = new OutlinePass(size, scene, camera);
    this._outlineSelected.edgeStrength = 3.0;
    this._outlineSelected.edgeGlow = 0.2;
    this._outlineSelected.edgeThickness = 1.5;
    this._outlineSelected.visibleEdgeColor.set('#3b82f6');
    this._outlineSelected.hiddenEdgeColor.set('#1e40af');
    this._outlineSelected.pulsePeriod = 0;
    this.composer.addPass(this._outlineSelected);

    // Outline for hovered object (white @ 40% opacity effect via reduced strength)
    this._outlineHover = new OutlinePass(size, scene, camera);
    this._outlineHover.edgeStrength = 1.5;
    this._outlineHover.edgeGlow = 0.0;
    this._outlineHover.edgeThickness = 1.0;
    this._outlineHover.visibleEdgeColor.set('#ffffff');
    this._outlineHover.hiddenEdgeColor.set('#999999');
    this._outlineHover.pulsePeriod = 0;
    this.composer.addPass(this._outlineHover);

    // ── Bloom (Unreal-style) ──
    this._bloomPass = new UnrealBloomPass(
      size,
      this._ppSettings.bloomIntensity,
      this._ppSettings.bloomRadius,
      this._ppSettings.bloomThreshold,
    );
    this._bloomPass.enabled = this._ppSettings.bloomEnabled;
    this.composer.addPass(this._bloomPass);

    // ── God Rays (Volumetric Light Scattering) ──
    this._godRaysPass = new ShaderPass({
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
    this._godRaysPass.enabled = this._ppSettings.godRaysEnabled;
    this.composer.addPass(this._godRaysPass);

    // ── Chromatic Aberration ──
    this._chromaticAberrationPass = new ShaderPass({
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
    this._chromaticAberrationPass.enabled = this._ppSettings.chromaticAberrationEnabled;
    this.composer.addPass(this._chromaticAberrationPass);

    // ── Color Grading (saturation, contrast, gamma, temperature, tint) ──
    this._colorGradingPass = new ShaderPass({
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
    this.composer.addPass(this._colorGradingPass);

    // ── Vignette ──
    this._vignettePass = new ShaderPass({
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
    this._vignettePass.enabled = this._ppSettings.vignetteEnabled;
    this.composer.addPass(this._vignettePass);

    // ── Film Grain ──
    this._filmGrainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.1 },
        time: { value: 0.0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform float time;
        varying vec2 vUv;
        float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec4 tex = texture2D(tDiffuse, vUv);
          float noise = rand(vUv + time) * 2.0 - 1.0;
          tex.rgb += noise * intensity;
          gl_FragColor = tex;
        }
      `,
    });
    this._filmGrainPass.enabled = this._ppSettings.filmGrainEnabled;
    this.composer.addPass(this._filmGrainPass);

    // Gamma correction (ACES filmic needs it)
    const gammaPass = new ShaderPass(GammaCorrectionShader);
    this.composer.addPass(gammaPass);
  }

  /* -------- public API -------- */

  set navigationActive(v: boolean) {
    this._navigationActive = v;
    if (v) {
      this._boxSelectActive = false;
      this._boxSelectDragging = false;
      this._boxEl.style.display = 'none';
    }
  }

  /** Set the group-members callback so clicking a grouped object selects the whole group */
  set groupMembersProvider(fn: ((obj: THREE.Object3D) => THREE.Object3D[]) | null) {
    this._getGroupMembers = fn;
  }

  get selectedObjects(): THREE.Object3D[] {
    return [...this._selected];
  }

  get primarySelection(): THREE.Object3D | null {
    return this._primarySelection;
  }

  get selectedCount(): number {
    return this._selected.size;
  }

  on(event: SelectionEvent, cb: (selected: THREE.Object3D[]) => void): void {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(cb);
  }

  off(event: SelectionEvent, cb: (selected: THREE.Object3D[]) => void): void {
    const arr = this._listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(cb);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  /** Handle mousedown — begins box select tracking */
  onMouseDown(e: MouseEvent, isNavigating: boolean): void {
    if (isNavigating) return;
    if (e.button !== 0) return;

    // Start tracking potential box select
    this._boxSelectActive = true;
    this._boxSelectDragging = false;
    this._boxStartX = e.clientX;
    this._boxStartY = e.clientY;
  }

  /** Handle mousemove — updates hover or box select visual */
  onMouseMove(e: MouseEvent, isNavigating: boolean): void {
    if (isNavigating) {
      this._boxSelectActive = false;
      this._boxSelectDragging = false;
      this._boxEl.style.display = 'none';
      return;
    }

    if (this._boxSelectActive) {
      const dx = Math.abs(e.clientX - this._boxStartX);
      const dy = Math.abs(e.clientY - this._boxStartY);

      if (dx > 5 || dy > 5) {
        this._boxSelectDragging = true;
        this._updateBoxVisual(e.clientX, e.clientY);
      }
      return;
    }

    // Hover detection
    this._updateHover(e);
  }

  /** Handle mouseup — perform click or box select */
  onMouseUp(e: MouseEvent, isNavigating: boolean): void {
    if (e.button !== 0) return;

    if (isNavigating || this._navigationActive) {
      this._boxSelectActive = false;
      this._boxSelectDragging = false;
      this._boxEl.style.display = 'none';
      return;
    }

    if (this._boxSelectDragging) {
      this._performBoxSelect(e);
    } else if (this._boxSelectActive) {
      this._performClick(e);
    }

    this._boxSelectActive = false;
    this._boxSelectDragging = false;
    this._boxEl.style.display = 'none';
  }

  addToSelection(obj: THREE.Object3D): void {
    this._selected.add(obj);
    if (!this._primarySelection) this._primarySelection = obj;
    this._updateOutlines();
    this._emit();
  }

  removeFromSelection(obj: THREE.Object3D): void {
    this._selected.delete(obj);
    if (this._primarySelection === obj) {
      this._primarySelection = this._selected.size > 0 ? [...this._selected][0] : null;
    }
    this._updateOutlines();
    this._emit();
  }

  toggleSelection(obj: THREE.Object3D): void {
    if (this._selected.has(obj)) {
      this.removeFromSelection(obj);
    } else {
      this.addToSelection(obj);
    }
  }

  clearSelection(): void {
    this._selected.clear();
    this._primarySelection = null;
    this._updateOutlines();
    this._emit();
  }

  selectAll(): void {
    const objects = this._getSelectableObjects();
    objects.forEach((obj) => {
      const root = this._findGameObjectRoot(obj);
      if (root) this._selected.add(root);
    });
    if (this._selected.size > 0 && !this._primarySelection) {
      this._primarySelection = [...this._selected][0];
    }
    this._updateOutlines();
    this._emit();
  }

  invertSelection(): void {
    const all = this._getSelectableObjects();
    const roots = new Set<THREE.Object3D>();
    all.forEach((obj) => {
      const root = this._findGameObjectRoot(obj);
      if (root) roots.add(root);
    });

    const newSelection = new Set<THREE.Object3D>();
    roots.forEach((r) => {
      if (!this._selected.has(r)) newSelection.add(r);
    });

    this._selected = newSelection;
    this._primarySelection = this._selected.size > 0 ? [...this._selected][0] : null;
    this._updateOutlines();
    this._emit();
  }

  isSelected(obj: THREE.Object3D): boolean {
    return this._selected.has(obj);
  }

  /** Swap the active camera used by the composer (for play mode) */
  setCamera(camera: THREE.PerspectiveCamera): void {
    this._camera = camera;
    this._renderPass.camera = camera;
    this._outlineSelected.renderCamera = camera;
    this._outlineHover.renderCamera = camera;
  }

  /** Resize composer buffers */
  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this._outlineSelected.resolution.set(width, height);
    this._outlineHover.resolution.set(width, height);
  }

  /** Render with post-processing (outlines + effects) */
  render(): void {
    // Update film grain time uniform
    if (this._filmGrainPass.enabled) {
      (this._filmGrainPass.uniforms as any).time.value = performance.now() * 0.001;
    }
    this.composer.render();
  }

  /** Update post-processing settings from a PostProcessVolumeActor */
  updatePostProcessSettings(settings: Record<string, any>): void {
    Object.assign(this._ppSettings, settings);

    // Bloom
    this._bloomPass.enabled = this._ppSettings.bloomEnabled;
    this._bloomPass.strength = this._ppSettings.bloomIntensity;
    this._bloomPass.threshold = this._ppSettings.bloomThreshold;
    this._bloomPass.radius = this._ppSettings.bloomRadius;

    // Color grading
    const cgU = this._colorGradingPass.uniforms as any;
    cgU.saturation.value = this._ppSettings.saturation;
    cgU.contrast.value = this._ppSettings.contrast;
    cgU.gamma.value = this._ppSettings.gamma;
    cgU.temperature.value = this._ppSettings.temperature;
    cgU.tint.value = this._ppSettings.tint;

    // Vignette
    this._vignettePass.enabled = this._ppSettings.vignetteEnabled;
    (this._vignettePass.uniforms as any).intensity.value = this._ppSettings.vignetteIntensity;

    // Film grain
    this._filmGrainPass.enabled = this._ppSettings.filmGrainEnabled;
    (this._filmGrainPass.uniforms as any).intensity.value = this._ppSettings.filmGrainIntensity;

    // God rays
    this._godRaysPass.enabled = this._ppSettings.godRaysEnabled;
    const grU = this._godRaysPass.uniforms as any;
    grU.density.value = this._ppSettings.godRaysDensity;
    grU.weight.value = this._ppSettings.godRaysWeight;
    grU.decay.value = this._ppSettings.godRaysDecay;
    grU.exposure.value = this._ppSettings.godRaysExposure;
    grU.numSamples.value = this._ppSettings.godRaysSamples;

    // Chromatic aberration
    this._chromaticAberrationPass.enabled = this._ppSettings.chromaticAberrationEnabled;
    (this._chromaticAberrationPass.uniforms as any).intensity.value = this._ppSettings.chromaticAberrationIntensity;
  }

  /** Update sun screen-space position for god rays */
  setSunScreenPosition(x: number, y: number): void {
    (this._godRaysPass.uniforms as any).sunPosition.value.set(x, y);
  }

  dispose(): void {
    if (this._boxEl.parentElement) this._boxEl.parentElement.removeChild(this._boxEl);
    this.composer.dispose();
  }

  /* -------- private -------- */

  private _performClick(e: MouseEvent): void {
    const rect = this._domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);

    const objects = this._getSelectableObjects();
    const hits = this._raycaster.intersectObjects(objects, true);

    if (hits.length > 0) {
      const root = this._findGameObjectRoot(hits[0].object);
      if (root) {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+click: toggle individual object (ignores grouping)
          this.toggleSelection(root);
        } else if (e.shiftKey) {
          // Shift+click: add to existing selection (ignores grouping)
          this.addToSelection(root);
        } else {
          // Plain click: select whole group (if grouped)
          this.clearSelection();
          const groupMembers = this._getGroupMembers?.(root) ?? [];
          if (groupMembers.length > 0) {
            for (const member of groupMembers) this.addToSelection(member);
          } else {
            this.addToSelection(root);
          }
        }
        return;
      }
    }

    // Click on empty space
    if (!e.ctrlKey && !e.metaKey) {
      this.clearSelection();
    }
  }

  private _performBoxSelect(e: MouseEvent): void {
    const rect = this._domElement.getBoundingClientRect();

    const selRect = {
      left: Math.min(this._boxStartX, e.clientX),
      right: Math.max(this._boxStartX, e.clientX),
      top: Math.min(this._boxStartY, e.clientY),
      bottom: Math.max(this._boxStartY, e.clientY),
    };

    const objects = this._getSelectableObjects();
    const newlySelected = new Set<THREE.Object3D>();

    objects.forEach((obj) => {
      if (this._isObjectInRect(obj, selRect, rect)) {
        const root = this._findGameObjectRoot(obj);
        if (root) newlySelected.add(root);
      }
    });

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+drag: toggle — remove if already selected, add if not
      newlySelected.forEach((obj) => {
        if (this._selected.has(obj)) {
          this._selected.delete(obj);
          if (this._primarySelection === obj) this._primarySelection = null;
        } else {
          this._selected.add(obj);
        }
      });
    } else if (e.shiftKey) {
      // Shift+drag: additive — keep existing, add new
      newlySelected.forEach((obj) => this._selected.add(obj));
    } else {
      // Plain drag: replace selection
      this._selected.clear();
      this._primarySelection = null;
      newlySelected.forEach((obj) => this._selected.add(obj));
    }

    if (this._selected.size > 0 && !this._primarySelection) {
      this._primarySelection = [...this._selected][0];
    }

    this._updateOutlines();
    this._emit();
  }

  private _isObjectInRect(
    object: THREE.Object3D,
    selRect: { left: number; right: number; top: number; bottom: number },
    canvasRect: DOMRect,
  ): boolean {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return false;

    const corners: THREE.Vector3[] = [];
    const min = box.min;
    const max = box.max;
    corners.push(
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z),
      new THREE.Vector3(min.x, max.y, min.z),
      new THREE.Vector3(min.x, max.y, max.z),
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(max.x, max.y, min.z),
      new THREE.Vector3(max.x, max.y, max.z),
    );

    // Check if any corner projects into the selection rect
    return corners.some((corner) => {
      corner.project(this._camera);
      const sx = ((corner.x + 1) / 2) * canvasRect.width + canvasRect.left;
      const sy = ((-corner.y + 1) / 2) * canvasRect.height + canvasRect.top;

      return sx >= selRect.left && sx <= selRect.right && sy >= selRect.top && sy <= selRect.bottom;
    });
  }

  private _updateHover(e: MouseEvent): void {
    const rect = this._domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);

    const objects = this._getSelectableObjects();
    const hits = this._raycaster.intersectObjects(objects, true);

    const newHover = hits.length > 0 ? this._findGameObjectRoot(hits[0].object) : null;

    if (newHover !== this._hoveredObject) {
      this._hoveredObject = newHover;
      this._updateOutlines();
    }
  }

  private _updateOutlines(): void {
    // Selected outline — all selected objects
    const selArr: THREE.Object3D[] = [];
    this._selected.forEach((obj) => selArr.push(obj));
    this._outlineSelected.selectedObjects = selArr;

    // Hover outline — only if not already selected
    if (this._hoveredObject && !this._selected.has(this._hoveredObject)) {
      this._outlineHover.selectedObjects = [this._hoveredObject];
    } else {
      this._outlineHover.selectedObjects = [];
    }
  }

  private _updateBoxVisual(endX: number, endY: number): void {
    const left = Math.min(this._boxStartX, endX);
    const top = Math.min(this._boxStartY, endY);
    const width = Math.abs(endX - this._boxStartX);
    const height = Math.abs(endY - this._boxStartY);

    this._boxEl.style.display = 'block';
    this._boxEl.style.left = `${left}px`;
    this._boxEl.style.top = `${top}px`;
    this._boxEl.style.width = `${width}px`;
    this._boxEl.style.height = `${height}px`;
  }

  private _emit(): void {
    const arr = [...this._selected];
    const cbs = this._listeners.get('selectionChanged');
    if (cbs) cbs.forEach((cb) => cb(arr));
  }
}
