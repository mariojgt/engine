// ============================================================
//  Scene Composition Actors — Three.js wrappers for scene
//  environment elements (lights, sky, fog, post-process, grid)
//
//  Every actor exposes a selectable THREE.Group so the gizmo
//  system can attach translate / rotate / scale controls.
// ============================================================

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import {
  type TerrainData,
  type TerrainLayer,
  TerrainMeshBuilder,
  SculptBrush,
  PaintBrush,
  createDefaultTerrainData,
} from '../TerrainEditorPanel';
import { MeshAssetManager } from '../MeshAsset';

// ---- Shared types ----

export interface SceneActorJSON {
  actorId: string;
  actorName: string;
  actorType: SceneActorType;
  category: string;
  locked: boolean;
  visible: boolean;
  transform?: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  };
  properties: Record<string, any>;
}

export type SceneActorType =
  | 'DirectionalLight'
  | 'SkyAtmosphere'
  | 'SkyLight'
  | 'ExponentialHeightFog'
  | 'PostProcessVolume'
  | 'WorldGrid'
  | 'DevGroundPlane'
  | 'Terrain'
  | 'PlayerStart';

/** Allowed gizmo modes per actor type */
export type GizmoCapability = 'translate' | 'rotate' | 'scale';

export interface SceneActorEntry {
  id: string;
  name: string;
  type: SceneActorType;
  category: string;
  visible: boolean;
  locked: boolean;
  actor: BaseSceneActor;
}

// ---- Property descriptor for the UI ----

export interface PropertyDescriptor {
  key: string;
  label: string;
  group: string;
  type: 'number' | 'color' | 'boolean' | 'select' | 'vec3' | 'text' | 'file' | 'texture';
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: any }[];
  placeholder?: string;
  fileFilters?: { name: string; extensions: string[] }[];
  /** Accepted MIME types for texture slots (default: image/*) */
  textureAccept?: string;
  value: any;
}

// ---- Base class ----

export abstract class BaseSceneActor {
  abstract readonly type: SceneActorType;
  public id: string;
  public name: string;
  public properties: Record<string, any> = {};

  /**
   * The selectable THREE.Group added to the scene.
   * TransformControls can attach to this for gizmo interaction.
   */
  public group: THREE.Group;

  /**
   * Invisible hit mesh for raycast selection in the viewport.
   * Actors whose visual children disable raycast need this so
   * they can still be clicked / box-selected.
   */
  protected _hitMesh: THREE.Mesh | null = null;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.group = new THREE.Group();
    this.group.userData.__sceneActorId = id;
    this.group.userData.isSceneActor = true;
    this.group.userData.selectable = true;
  }

  /**
   * Create an invisible hit mesh so the actor can be selected via
   * viewport raycasting.  Call once at the end of the subclass
   * constructor (after visual children are added).
   */
  protected _createHitMesh(size = 1.0, offsetY = 0.5): void {
    const geo = new THREE.SphereGeometry(size, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    this._hitMesh = new THREE.Mesh(geo, mat);
    this._hitMesh.position.y = offsetY;
    this._hitMesh.userData.__isSceneCompositionHelper = true;
    // Do NOT disable raycast — this mesh exists so the actor can be clicked
    this.group.add(this._hitMesh);
  }

  /** Which gizmo modes are allowed for this actor */
  abstract getGizmoCapabilities(): GizmoCapability[];

  abstract addToScene(scene: THREE.Scene): void;
  abstract removeFromScene(scene: THREE.Scene): void;
  abstract setVisible(visible: boolean): void;
  abstract updateProperty(key: string, value: any): void;
  abstract getPropertyDescriptors(): PropertyDescriptor[];
  abstract dispose(): void;

  /** Called when the group transform is changed by a gizmo drag */
  onTransformChanged(): void {
    // Override in subclasses to sync internal objects
  }

  /** Hide editor-only visuals during play mode */
  setEditorVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  serialize(): SceneActorJSON {
    return {
      actorId: this.id,
      actorName: this.name,
      actorType: this.type,
      category: 'WorldSettings',
      locked: false,
      visible: true,
      transform: {
        position: {
          x: this.group.position.x,
          y: this.group.position.y,
          z: this.group.position.z,
        },
        rotation: {
          x: THREE.MathUtils.radToDeg(this.group.rotation.x),
          y: THREE.MathUtils.radToDeg(this.group.rotation.y),
          z: THREE.MathUtils.radToDeg(this.group.rotation.z),
        },
        scale: {
          x: this.group.scale.x,
          y: this.group.scale.y,
          z: this.group.scale.z,
        },
      },
      properties: structuredClone(this.properties),
    };
  }

  /** Restore group transform from JSON */
  applyTransform(t: SceneActorJSON['transform']): void {
    if (!t) return;
    this.group.position.set(t.position.x, t.position.y, t.position.z);
    this.group.rotation.set(
      THREE.MathUtils.degToRad(t.rotation.x),
      THREE.MathUtils.degToRad(t.rotation.y),
      THREE.MathUtils.degToRad(t.rotation.z),
    );
    this.group.scale.set(t.scale.x, t.scale.y, t.scale.z);
    this.onTransformChanged();
  }
}

// ============================================================
//  1. DIRECTIONAL LIGHT (SUN)
// ============================================================

export class DirectionalLightActor extends BaseSceneActor {
  readonly type: SceneActorType = 'DirectionalLight';
  public light: THREE.DirectionalLight;
  public helper: THREE.DirectionalLightHelper;
  /** Arrow showing light direction — visible when selected */
  public directionArrow: THREE.ArrowHelper;

  /* Dust mote particle system */
  private _dustParticles: THREE.Points | null = null;
  private _dustPhases: Float32Array | null = null;
  private _dustCount = 0;

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'DirectionalLight';

    this.properties = {
      color: props.color ?? '#FFF8F0',
      intensity: props.intensity ?? 1.5,
      castShadows: props.castShadows ?? true,
      shadowQuality: props.shadowQuality ?? 2048,
      shadowBias: props.shadowBias ?? -0.0001,
      shadowNormalBias: props.shadowNormalBias ?? 0.02,
      shadowRadius: props.shadowRadius ?? 4,
      dynamicShadowDistance: props.dynamicShadowDistance ?? 120,
      atmosphereAffected: props.atmosphereAffected ?? true,
      dustParticlesEnabled: props.dustParticlesEnabled ?? false,
      dustParticleCount: props.dustParticleCount ?? 3000,
      dustParticleSize: props.dustParticleSize ?? 0.05,
      dustParticleOpacity: props.dustParticleOpacity ?? 0.25,
      dustParticleSpread: props.dustParticleSpread ?? 60,
      dustParticleColor: props.dustParticleColor ?? '#FFF5E0',
      godRaysEnabled: props.godRaysEnabled ?? false,
    };

    // ── Light ──
    this.light = new THREE.DirectionalLight(this.properties.color, this.properties.intensity);
    this.light.castShadow = this.properties.castShadows;
    this.light.shadow.mapSize.width = this.properties.shadowQuality;
    this.light.shadow.mapSize.height = this.properties.shadowQuality;
    this.light.shadow.camera.near = 0.5;
    this.light.shadow.camera.far = this.properties.dynamicShadowDistance;
    const d = this.properties.dynamicShadowDistance / 2;
    this.light.shadow.camera.left = -d;
    this.light.shadow.camera.right = d;
    this.light.shadow.camera.top = d;
    this.light.shadow.camera.bottom = -d;
    this.light.shadow.bias = this.properties.shadowBias;
    this.light.shadow.normalBias = this.properties.shadowNormalBias;
    this.light.shadow.radius = this.properties.shadowRadius;

    // Light positioned relative to group — The group's rotation drives the
    // light direction. Light sits "above" in local space and targets origin.
    this.light.position.set(0, 10, 0);
    this.light.target.position.set(0, 0, 0);

    // ── Helper ──
    this.helper = new THREE.DirectionalLightHelper(this.light, 2, 0xffcc00);
    this.helper.userData.__isSceneCompositionHelper = true;
    this.helper.raycast = () => {};

    // ── Direction arrow ──
    this.directionArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 0),
      5, 0xffdd44, 0.8, 0.4,
    );
    this.directionArrow.userData.__isSceneCompositionHelper = true;
    this.directionArrow.raycast = () => {};
    this.directionArrow.visible = false; // shown when selected

    // Assemble group
    this.group.add(this.light);
    this.group.add(this.light.target);
    this.group.add(this.helper);
    this.group.add(this.directionArrow);

    // Create dust motes
    this._createDustParticles();

    // Invisible hit mesh for viewport selection
    this._createHitMesh(1.5, 0);

    // Set initial rotation from pitch/yaw if provided
    if (props.pitch != null || props.yaw != null) {
      const pitch = THREE.MathUtils.degToRad(props.pitch ?? -45);
      const yaw = THREE.MathUtils.degToRad(props.yaw ?? 30);
      this.group.rotation.set(pitch, yaw, 0, 'YXZ');
    }

    this._syncLightFromGroup();
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return ['rotate'];
  }

  /** Keep light positioned above the group so rotation drives direction */
  private _syncLightFromGroup(): void {
    const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(this.group.quaternion);
    this.directionArrow.setDirection(dir);
    this.helper.update();
  }

  /** Create floating dust mote particles */
  private _createDustParticles(): void {
    const count = this.properties.dustParticleCount;
    const spread = this.properties.dustParticleSpread;
    this._dustCount = count;

    const positions = new Float32Array(count * 3);
    this._dustPhases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = Math.random() * spread * 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      this._dustPhases[i] = Math.random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: this.properties.dustParticleColor,
      size: this.properties.dustParticleSize,
      transparent: true,
      opacity: this.properties.dustParticleOpacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._dustParticles = new THREE.Points(geo, mat);
    this._dustParticles.visible = this.properties.dustParticlesEnabled;
    this._dustParticles.userData.__isSceneCompositionHelper = true;
    this._dustParticles.raycast = () => {};
    this._dustParticles.frustumCulled = false;
    this.group.add(this._dustParticles);
  }

  /** Rebuild particles when count/spread changes */
  private _rebuildDustParticles(): void {
    if (this._dustParticles) {
      this.group.remove(this._dustParticles);
      this._dustParticles.geometry.dispose();
      (this._dustParticles.material as THREE.Material).dispose();
      this._dustParticles = null;
    }
    this._createDustParticles();
  }

  /** Animate dust motes — call each frame */
  update(time: number): void {
    if (!this._dustParticles || !this.properties.dustParticlesEnabled || !this._dustPhases) return;

    const positions = this._dustParticles.geometry.attributes.position;
    const arr = positions.array as Float32Array;
    const spread = this.properties.dustParticleSpread;
    const halfSpread = spread / 2;
    const vSpread = spread * 0.5;

    for (let i = 0; i < this._dustCount; i++) {
      const idx = i * 3;
      const phase = this._dustPhases[i];

      arr[idx] += Math.sin(time * 0.2 + phase) * 0.003;
      arr[idx + 1] += Math.cos(time * 0.35 + phase * 1.3) * 0.0015;
      arr[idx + 2] += Math.sin(time * 0.25 + phase * 0.7) * 0.003;

      // Wrap around bounds
      if (arr[idx] > halfSpread) arr[idx] = -halfSpread;
      if (arr[idx] < -halfSpread) arr[idx] = halfSpread;
      if (arr[idx + 1] > vSpread) arr[idx + 1] = 0;
      if (arr[idx + 1] < 0) arr[idx + 1] = vSpread;
      if (arr[idx + 2] > halfSpread) arr[idx + 2] = -halfSpread;
      if (arr[idx + 2] < -halfSpread) arr[idx + 2] = halfSpread;
    }

    positions.needsUpdate = true;
  }

  /** Get the light's world direction for screen-space projection */
  getLightDirection(): THREE.Vector3 {
    return new THREE.Vector3(0, -1, 0).applyQuaternion(this.group.quaternion).normalize();
  }

  onTransformChanged(): void {
    this._syncLightFromGroup();
  }

  addToScene(scene: THREE.Scene): void { scene.add(this.group); }
  removeFromScene(scene: THREE.Scene): void { scene.remove(this.group); }

  setVisible(visible: boolean): void { this.group.visible = visible; }

  /** Hide only editor helpers during play — keep the light itself active */
  setEditorVisible(visible: boolean): void {
    this.helper.visible = visible;
    this.directionArrow.visible = visible && this.directionArrow.visible;
    if (this._dustParticles) this._dustParticles.visible = visible && this.properties.dustParticlesEnabled;
    // Do NOT hide the group or the light — they must remain functional
  }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;
    switch (key) {
      case 'color':
        this.light.color.set(value);
        this.helper.color = new THREE.Color(value);
        this.helper.update();
        break;
      case 'intensity':
        this.light.intensity = value;
        break;
      case 'castShadows':
        this.light.castShadow = value;
        break;
      case 'shadowQuality':
        this.light.shadow.mapSize.width = value;
        this.light.shadow.mapSize.height = value;
        this.light.shadow.map?.dispose();
        (this.light.shadow as any).map = null;
        break;
      case 'shadowBias':
        this.light.shadow.bias = value;
        break;
      case 'shadowNormalBias':
        this.light.shadow.normalBias = value;
        break;
      case 'shadowRadius':
        this.light.shadow.radius = value;
        break;
      case 'dynamicShadowDistance': {
        this.light.shadow.camera.far = value;
        const half = value / 2;
        this.light.shadow.camera.left = -half;
        this.light.shadow.camera.right = half;
        this.light.shadow.camera.top = half;
        this.light.shadow.camera.bottom = -half;
        this.light.shadow.camera.updateProjectionMatrix();
        break;
      }
      case 'dustParticlesEnabled':
        if (this._dustParticles) this._dustParticles.visible = value;
        break;
      case 'dustParticleCount':
      case 'dustParticleSpread':
        this._rebuildDustParticles();
        break;
      case 'dustParticleSize':
        if (this._dustParticles) (this._dustParticles.material as THREE.PointsMaterial).size = value;
        break;
      case 'dustParticleOpacity':
        if (this._dustParticles) (this._dustParticles.material as THREE.PointsMaterial).opacity = value;
        break;
      case 'dustParticleColor':
        if (this._dustParticles) (this._dustParticles.material as THREE.PointsMaterial).color.set(value);
        break;
    }
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'color', label: 'Color', group: 'Light', type: 'color', value: this.properties.color },
      { key: 'intensity', label: 'Intensity', group: 'Light', type: 'number', min: 0, max: 10, step: 0.1, value: this.properties.intensity },
      { key: 'castShadows', label: 'Cast Shadows', group: 'Light', type: 'boolean', value: this.properties.castShadows },
      { key: 'atmosphereAffected', label: 'Atmosphere Affected', group: 'Light', type: 'boolean', value: this.properties.atmosphereAffected },
      { key: 'shadowQuality', label: 'Shadow Map Size', group: 'Shadows', type: 'select', value: this.properties.shadowQuality, options: [
        { label: '512', value: 512 }, { label: '1024', value: 1024 },
        { label: '2048 (Default)', value: 2048 }, { label: '4096', value: 4096 },
      ]},
      { key: 'shadowBias', label: 'Shadow Bias', group: 'Shadows', type: 'number', min: -0.01, max: 0.01, step: 0.0001, value: this.properties.shadowBias },
      { key: 'shadowNormalBias', label: 'Normal Bias', group: 'Shadows', type: 'number', min: 0, max: 0.2, step: 0.005, value: this.properties.shadowNormalBias },
      { key: 'shadowRadius', label: 'Shadow Softness', group: 'Shadows', type: 'number', min: 0, max: 25, step: 0.5, value: this.properties.shadowRadius },
      { key: 'dynamicShadowDistance', label: 'Shadow Distance', group: 'Shadows', type: 'number', min: 5, max: 500, step: 5, value: this.properties.dynamicShadowDistance },
      { key: 'dustParticlesEnabled', label: 'Dust Particles', group: 'Volumetric', type: 'boolean', value: this.properties.dustParticlesEnabled },
      { key: 'dustParticleCount', label: 'Particle Count', group: 'Volumetric', type: 'select', value: this.properties.dustParticleCount, options: [
        { label: '1000', value: 1000 }, { label: '3000 (Default)', value: 3000 },
        { label: '5000', value: 5000 }, { label: '8000', value: 8000 },
      ]},
      { key: 'dustParticleSize', label: 'Particle Size', group: 'Volumetric', type: 'number', min: 0.01, max: 0.3, step: 0.005, value: this.properties.dustParticleSize },
      { key: 'dustParticleOpacity', label: 'Particle Opacity', group: 'Volumetric', type: 'number', min: 0, max: 1, step: 0.05, value: this.properties.dustParticleOpacity },
      { key: 'dustParticleSpread', label: 'Spread', group: 'Volumetric', type: 'number', min: 10, max: 200, step: 5, value: this.properties.dustParticleSpread },
      { key: 'dustParticleColor', label: 'Particle Color', group: 'Volumetric', type: 'color', value: this.properties.dustParticleColor },
      { key: 'godRaysEnabled', label: 'God Rays', group: 'Volumetric', type: 'boolean', value: this.properties.godRaysEnabled },
    ];
  }

  dispose(): void {
    this.helper.dispose();
    this.directionArrow.dispose();
    this.light.shadow.map?.dispose();
    if (this._dustParticles) {
      this._dustParticles.geometry.dispose();
      (this._dustParticles.material as THREE.Material).dispose();
    }
  }
}

// ============================================================
//  2. SKY ATMOSPHERE
// ============================================================

export type SkyPreset = 'default' | 'sunset' | 'dawn' | 'overcast' | 'night';

const SKY_PRESETS: Record<SkyPreset, Record<string, any>> = {
  default: { skyType: 'atmosphere', turbidity: 0.8, rayleigh: 1.0, mieCoefficient: 0.003, mieDirectionalG: 0.7, elevation: 35, azimuth: 180 },
  sunset:  { skyType: 'atmosphere', turbidity: 2.0, rayleigh: 0.8, mieCoefficient: 0.01, mieDirectionalG: 0.85, elevation: 1.5, azimuth: 90 },
  dawn:    { skyType: 'atmosphere', turbidity: 1.2, rayleigh: 0.6, mieCoefficient: 0.005, mieDirectionalG: 0.75, elevation: 3, azimuth: 270 },
  overcast:{ skyType: 'gradient',   topColor: '#8A98A8', bottomColor: '#C0C8D0', gradientExponent: 0.4 },
  night:   { skyType: 'gradient',   topColor: '#020B18', bottomColor: '#080818', gradientExponent: 0.6 },
};

export class SkyAtmosphereActor extends BaseSceneActor {
  readonly type: SceneActorType = 'SkyAtmosphere';
  public sky: Sky | null = null;
  private _gradientMesh: THREE.Mesh | null = null;
  private _skySphereMesh: THREE.Mesh | null = null;
  private _cloudMesh: THREE.Mesh | null = null;
  private _sunPosition = new THREE.Vector3();
  private _sunLight: DirectionalLightActor | null = null;
  private _scene: THREE.Scene | null = null;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _pmremGenerator: THREE.PMREMGenerator | null = null;
  private _envTexture: THREE.Texture | null = null;

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'SkyAtmosphere';

    this.properties = {
      skyType: props.skyType ?? 'atmosphere',
      preset: props.preset ?? 'default',
      turbidity: props.turbidity ?? 0.8,
      rayleigh: props.rayleigh ?? 1.0,
      mieCoefficient: props.mieCoefficient ?? 0.003,
      mieDirectionalG: props.mieDirectionalG ?? 0.7,
      elevation: props.elevation ?? 35,
      azimuth: props.azimuth ?? 180,
      topColor: props.topColor ?? '#87CEEB',
      bottomColor: props.bottomColor ?? '#FFFFFF',
      gradientExponent: props.gradientExponent ?? 0.6,
      solidColor: props.solidColor ?? '#87CEEB',
      hdriTextureId: props.hdriTextureId ?? '',
      hdriDataUrl: props.hdriDataUrl ?? '',
      hdriTextureName: props.hdriTextureName ?? '',
      hdriIntensity: props.hdriIntensity ?? 1.0,
      hdriRotation: props.hdriRotation ?? 0,
      hdriMapping: props.hdriMapping ?? 'sphere',
      generateEnvMap: props.generateEnvMap ?? true,
      skyIntensity: props.skyIntensity ?? 0.5,
      cloudsEnabled: props.cloudsEnabled ?? true,
      cloudCoverage: props.cloudCoverage ?? 0.45,
      cloudSpeed: props.cloudSpeed ?? 0.003,
      cloudOpacity: props.cloudOpacity ?? 0.9,
      cloudColor: props.cloudColor ?? '#FFFFFF',
      cloudHeight: props.cloudHeight ?? 0.25,
    };
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return ['rotate'];
  }

  setSunLight(light: DirectionalLightActor | null): void {
    this._sunLight = light;
    this._updateSunPosition();
  }

  /** Set renderer for HDRI loading & environment map generation */
  setRenderer(renderer: THREE.WebGLRenderer): void {
    this._renderer = renderer;
    this._pmremGenerator = new THREE.PMREMGenerator(renderer);
    this._pmremGenerator.compileEquirectangularShader();
  }

  /**
   * Called after deserialization to finalize setup when scene and renderer are ready.
   * Re-applies sky type so HDRI textures can load with PMREM support.
   */
  finishInitialization(): void {
    // Re-apply the sky type now that renderer is set up (for HDRI loading)
    console.log('[Sky] finishInitialization - skyType:', this.properties.skyType, 'hdriDataUrl:', this.properties.hdriDataUrl ? 'SET' : 'EMPTY');
    this._applySkyType();
  }

  private _createAtmosphericSky(): void {
    console.log('[Sky] _createAtmosphericSky - creating sky mesh');
    this._removeExisting();
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    this.sky.userData.__sceneActorId = this.id;
    this.sky.userData.__isSceneCompositionHelper = true;
    this.sky.raycast = () => {};
    this._scene?.add(this.sky);
    console.log('[Sky] _createAtmosphericSky - sky added to scene, visible:', this.sky.visible);
    this._applyUniforms();
    this._updateSunPosition();
    // Apply background intensity to avoid a blinding sky
    if (this._scene) {
      this._scene.backgroundIntensity = this.properties.skyIntensity;
      this._scene.environmentIntensity = this.properties.skyIntensity;
    }
    this._generateEnvMapFromSky();
    // Create cloud layer
    if (this.properties.cloudsEnabled) {
      this._createCloudLayer();
    }
  }

  /** Create a procedural volumetric-looking cloud dome using fbm noise shader */
  private _createCloudLayer(): void {
    this._removeCloudLayer();
    if (!this._scene) return;

    const cloudGeo = new THREE.SphereGeometry(8000, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.45);
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uSunPosition: { value: this._sunPosition.clone() },
        uCloudColor: { value: new THREE.Color(this.properties.cloudColor) },
        uCoverage: { value: this.properties.cloudCoverage },
        uOpacity: { value: this.properties.cloudOpacity },
        uCloudHeight: { value: this.properties.cloudHeight },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunPosition;
        uniform vec3 uCloudColor;
        uniform float uCoverage;
        uniform float uOpacity;
        uniform float uCloudHeight;
        varying vec3 vWorldPosition;
        varying vec2 vUv;

        // Hash & noise functions for procedural clouds
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          vec2 shift = vec2(100.0);
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          for (int i = 0; i < 6; i++) {
            v += a * noise(p);
            p = rot * p * 2.0 + shift;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          // Project world position onto a flat plane for cloud UVs
          vec2 cloudUV = vWorldPosition.xz * 0.0003;
          float t = uTime;

          // Animate clouds
          vec2 uv1 = cloudUV + vec2(t * 0.3, t * 0.1);
          vec2 uv2 = cloudUV * 1.5 + vec2(-t * 0.2, t * 0.15);

          float n1 = fbm(uv1 * 4.0);
          float n2 = fbm(uv2 * 4.0);
          float cloudDensity = (n1 + n2) * 0.5;

          // Coverage threshold
          float coverageThreshold = 1.0 - uCoverage;
          cloudDensity = smoothstep(coverageThreshold, coverageThreshold + 0.3, cloudDensity);

          // Fade at horizon to blend with sky
          float horizonFade = smoothstep(0.0, 0.15, vUv.y);
          // Also fade at top to avoid hard caps
          float topFade = 1.0 - smoothstep(0.7, 1.0, vUv.y);
          cloudDensity *= horizonFade * topFade;

          // Sun-facing highlight: brighter where sun illuminates
          vec3 sunDir = normalize(uSunPosition);
          vec3 viewDir = normalize(vWorldPosition);
          float sunDot = max(dot(viewDir, sunDir), 0.0);
          float sunHighlight = pow(sunDot, 8.0) * 0.3;

          // Cloud shading — darker underside for depth
          float n3 = fbm(uv1 * 8.0 + 5.0);
          float shadow = smoothstep(0.3, 0.7, n3) * 0.25;

          vec3 litColor = uCloudColor + sunHighlight;
          vec3 shadedColor = uCloudColor * 0.65;
          vec3 finalColor = mix(shadedColor, litColor, 1.0 - shadow);

          float alpha = cloudDensity * uOpacity;
          if (alpha < 0.01) discard;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });

    this._cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this._cloudMesh.userData.__isSceneCompositionHelper = true;
    this._cloudMesh.userData.__sceneActorId = this.id;
    this._cloudMesh.raycast = () => {};
    this._cloudMesh.frustumCulled = false;
    this._cloudMesh.renderOrder = -999;
    this._scene.add(this._cloudMesh);
  }

  /** Remove cloud layer mesh */
  private _removeCloudLayer(): void {
    if (this._cloudMesh && this._scene) {
      this._scene.remove(this._cloudMesh);
      this._cloudMesh.geometry.dispose();
      (this._cloudMesh.material as THREE.Material).dispose();
      this._cloudMesh = null;
    }
  }

  /** Animate clouds — call per frame */
  updateClouds(time: number): void {
    if (!this._cloudMesh) return;
    const mat = this._cloudMesh.material as THREE.ShaderMaterial;
    mat.uniforms['uTime'].value = time * this.properties.cloudSpeed;
  }

  private _createGradientSky(): void {
    console.log('[Sky] _createGradientSky - creating gradient mesh');
    this._removeExisting();
    const geo = new THREE.SphereGeometry(450000, 32, 15);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(this.properties.topColor) },
        bottomColor: { value: new THREE.Color(this.properties.bottomColor) },
        offset: { value: 400 },
        exponent: { value: this.properties.gradientExponent },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this._gradientMesh = new THREE.Mesh(geo, mat);
    this._gradientMesh.userData.__sceneActorId = this.id;
    this._gradientMesh.userData.__isSceneCompositionHelper = true;
    this._gradientMesh.raycast = () => {};
    this._scene?.add(this._gradientMesh);
  }

  private _removeExisting(): void {
    if (this.sky && this._scene) {
      this._scene.remove(this.sky);
      this.sky.geometry.dispose();
      (this.sky.material as THREE.Material).dispose();
      this.sky = null;
    }
    this._removeCloudLayer();
    if (this._gradientMesh && this._scene) {
      this._scene.remove(this._gradientMesh);
      this._gradientMesh.geometry.dispose();
      (this._gradientMesh.material as THREE.Material).dispose();
      this._gradientMesh = null;
    }
    if (this._skySphereMesh && this._scene) {
      this._scene.remove(this._skySphereMesh);
      const mat = this._skySphereMesh.material as THREE.MeshBasicMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
      this._skySphereMesh.geometry.dispose();
      this._skySphereMesh = null;
    }
    // Clean up HDRI background texture if it's a Texture (not a Color)
    if (this._scene && this._scene.background && (this._scene.background as THREE.Texture).isTexture) {
      (this._scene.background as THREE.Texture).dispose();
      this._scene.background = null;
    }
    if (this._envTexture) {
      this._envTexture.dispose();
      this._envTexture = null;
    }
    // Clear scene-level environment references so stale state doesn't persist
    if (this._scene) {
      this._scene.environment = null;
      this._scene.backgroundIntensity = 1;
      this._scene.environmentIntensity = 1;
    }
  }

  private _applySkyType(): void {
    if (!this._scene) {
      console.log('[Sky] _applySkyType - no scene available!');
      return;
    }
    console.log('[Sky] _applySkyType - applying:', this.properties.skyType);
    switch (this.properties.skyType) {
      case 'atmosphere':
        this._createAtmosphericSky();
        break;
      case 'gradient':
        this._createGradientSky();
        this._scene.background = null;
        break;
      case 'color':
        this._removeExisting();
        this._scene.background = new THREE.Color(this.properties.solidColor);
        break;
      case 'hdri':
        this._loadHDRI();
        break;
    }
  }

  private _applyUniforms(): void {
    if (!this.sky) return;
    const u = this.sky.material.uniforms;
    u['turbidity'].value = this.properties.turbidity;
    u['rayleigh'].value = this.properties.rayleigh;
    u['mieCoefficient'].value = this.properties.mieCoefficient;
    u['mieDirectionalG'].value = this.properties.mieDirectionalG;
  }

  /** Generate IBL environment map from atmospheric sky for PBR reflections */
  private _generateEnvMapFromSky(): void {
    if (!this.sky || !this._scene || !this._pmremGenerator || !this.properties.generateEnvMap) return;
    // Render sky into a small render target to generate env map
    const skyScene = new THREE.Scene();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(450000);
    const u = skyCopy.material.uniforms;
    u['turbidity'].value = this.properties.turbidity;
    u['rayleigh'].value = this.properties.rayleigh;
    u['mieCoefficient'].value = this.properties.mieCoefficient;
    u['mieDirectionalG'].value = this.properties.mieDirectionalG;
    u['sunPosition'].value.copy(this._sunPosition);
    skyScene.add(skyCopy);

    if (this._envTexture) this._envTexture.dispose();
    this._envTexture = this._pmremGenerator.fromScene(skyScene, 0, 0.1, 1000).texture;
    this._scene.environment = this._envTexture;

    skyCopy.geometry.dispose();
    (skyCopy.material as THREE.Material).dispose();
  }

  /** Load a sky texture from a base64 dataUrl and use it as sky background + environment map */
  private async _loadHDRI(): Promise<void> {
    console.log('[Sky] _loadHDRI - checking setup: scene:', !!this._scene, 'renderer:', !!this._renderer, 'pmrem:', !!this._pmremGenerator);
    this._removeExisting();
    if (!this._scene || !this._renderer || !this._pmremGenerator) {
      console.log('[Sky] _loadHDRI - EARLY EXIT: missing dependencies');
      return;
    }

    const dataUrl = this.properties.hdriDataUrl;
    if (!dataUrl) {
      // No texture set — show placeholder color
      console.log('[Sky] _loadHDRI - no dataUrl, showing placeholder color');
      this._scene.background = new THREE.Color(0x222233);
      return;
    }

    const mapping = this.properties.hdriMapping || 'sphere';

    // Load the image as a Three.js texture from the base64 dataUrl
    const loader = new THREE.TextureLoader();
    loader.load(
      dataUrl,
      (texture) => {
        console.log('[Sky] HDRI texture loaded, mapping:', this.properties.hdriMapping);
        if (!this._scene || !this._pmremGenerator) return;
        texture.colorSpace = THREE.SRGBColorSpace;

        if (mapping === 'equirectangular') {
          // ── Equirectangular mode: use scene.background (for proper 360° panoramas) ──
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const rotation = THREE.MathUtils.degToRad(this.properties.hdriRotation);
          texture.offset.x = rotation / (Math.PI * 2);
          texture.wrapS = THREE.RepeatWrapping;

          this._scene.background = texture;
          this._scene.backgroundIntensity = this.properties.hdriIntensity;

          // Generate env map for PBR reflections
          if (this._envTexture) this._envTexture.dispose();
          this._envTexture = this._pmremGenerator.fromEquirectangular(texture).texture;
          this._scene.environment = this._envTexture;
        } else {
          // ── Sky Sphere mode (default): works with any image ──
          // Radius must be inside the camera far plane (editor cam far = 10000)
          const radius = 9000;
          const geo = new THREE.SphereGeometry(radius, 64, 32);
          const mat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false,
          });

          this._skySphereMesh = new THREE.Mesh(geo, mat);
          this._skySphereMesh.userData.__isSceneCompositionHelper = true;
          this._skySphereMesh.userData.__sceneActorId = this.id;
          this._skySphereMesh.raycast = () => {};
          this._skySphereMesh.renderOrder = -1000;
          // Ensure it's not affected by frustum culling
          this._skySphereMesh.frustumCulled = false;

          // Apply rotation
          this._skySphereMesh.rotation.y = THREE.MathUtils.degToRad(this.properties.hdriRotation);

          this._scene.add(this._skySphereMesh);
          console.log('[Sky] Sky sphere mesh added to scene, visible:', this._skySphereMesh.visible, 'radius: 9000, side: BackSide');
          console.log('[Sky] Scene background BEFORE sphere add:', this._scene.background ? 'SET' : 'null');

          // Clear scene.background so the sphere is visible
          this._scene.background = null;
          console.log('[Sky] Scene background AFTER setting to null:', this._scene.background);

          // Generate env map for PBR reflections from the sphere
          // Use a temporary equirectangular setup for the PMREM generator
          const envTex = texture.clone();
          envTex.mapping = THREE.EquirectangularReflectionMapping;
          envTex.needsUpdate = true;
          if (this._envTexture) this._envTexture.dispose();
          this._envTexture = this._pmremGenerator.fromEquirectangular(envTex).texture;
          this._scene.environment = this._envTexture;
          envTex.dispose();
        }
      },
      undefined,
      (err) => {
        console.warn('[SkyAtmosphere] Failed to load sky texture:', err);
        if (this._scene) this._scene.background = new THREE.Color(0x222233);
      },
    );
  }

  private _updateSunPosition(): void {
    const phi = THREE.MathUtils.degToRad(90 - this.properties.elevation);
    const theta = THREE.MathUtils.degToRad(this.properties.azimuth);
    this._sunPosition.setFromSphericalCoords(1, phi, theta);

    if (this.sky) {
      this.sky.material.uniforms['sunPosition'].value.copy(this._sunPosition);
    }

    if (this._sunLight) {
      const pitch = THREE.MathUtils.degToRad(-this.properties.elevation);
      const yaw = THREE.MathUtils.degToRad(this.properties.azimuth - 180);
      this._sunLight.group.rotation.set(pitch, yaw, 0, 'YXZ');
      this._sunLight.onTransformChanged();
    }

    // Regenerate environment map when sun position changes
    this._generateEnvMapFromSky();

    // Update cloud sun direction
    if (this._cloudMesh) {
      (this._cloudMesh.material as THREE.ShaderMaterial).uniforms['uSunPosition'].value.copy(this._sunPosition);
    }
  }

  applyPreset(presetName: SkyPreset): void {
    const preset = SKY_PRESETS[presetName];
    if (!preset) return;
    this.properties.preset = presetName;
    for (const [k, v] of Object.entries(preset)) {
      this.properties[k] = v;
    }
    this._applySkyType();
    if (this.properties.skyType === 'atmosphere') {
      this._applyUniforms();
      this._updateSunPosition();
    }
  }

  addToScene(scene: THREE.Scene): void {
    console.log('[Sky] addToScene - skyType:', this.properties.skyType);
    console.log('[Sky] addToScene - scene UUID:', scene.uuid, 'scene children before:', scene.children.length);
    this._scene = scene;
    scene.add(this.group);
    console.log('[Sky] addToScene - scene children after:', scene.children.length);
    this._applySkyType();
  }

  removeFromScene(scene: THREE.Scene): void {
    console.log('[Sky] removeFromScene called - removing sky meshes from scene');
    this._removeExisting();
    scene.remove(this.group);
    this._scene = null;
  }

  /** Sky visuals must remain active during play — nothing to hide */
  setEditorVisible(_visible: boolean): void {
    console.log('[Sky] setEditorVisible called with:', _visible, '(should be no-op)');
    // No-op: sky meshes are added directly to the scene (not the group),
    // and they must stay visible during play mode.
  }

  setVisible(visible: boolean): void {
    console.log('[Sky] setVisible:', visible, '- sky:', !!this.sky, 'gradient:', !!this._gradientMesh, 'sphere:', !!this._skySphereMesh);
    if (this.sky) {
      console.log('[Sky] - setting sky.visible to:', visible, '(was:', this.sky.visible, ')');
      this.sky.visible = visible;
    }
    if (this._gradientMesh) {
      console.log('[Sky] - setting gradientMesh.visible to:', visible, '(was:', this._gradientMesh.visible, ')');
      this._gradientMesh.visible = visible;
    }
    if (this._skySphereMesh) {
      console.log('[Sky] - setting skySphereMesh.visible to:', visible, '(was:', this._skySphereMesh.visible, ')');
      this._skySphereMesh.visible = visible;
    }
    if (this._cloudMesh) {
      this._cloudMesh.visible = visible && this.properties.cloudsEnabled;
    }

    // Also toggle environment map and scene intensity when hiding/showing sky
    if (this._scene) {
      if (!visible) {
        this._scene.environment = null;
        this._scene.backgroundIntensity = 0;
        this._scene.environmentIntensity = 0;
      } else {
        this._scene.backgroundIntensity = this.properties.skyIntensity;
        this._scene.environmentIntensity = this.properties.skyIntensity;
        if (this._envTexture) {
          this._scene.environment = this._envTexture;
        }
      }
    }
  }

  updateProperty(key: string, value: any): void {
    console.log('[Sky] updateProperty:', key, '=', typeof value === 'string' ? (value.substring(0, 20) + (value.length > 20 ? '...' : '')) : value);
    this.properties[key] = value;
    switch (key) {
      case 'skyType':
        this._applySkyType();
        break;
      case 'preset':
        if (value in SKY_PRESETS) this.applyPreset(value as SkyPreset);
        break;
      case 'turbidity':
      case 'rayleigh':
      case 'mieCoefficient':
      case 'mieDirectionalG':
        this._applyUniforms();
        break;
      case 'elevation':
      case 'azimuth':
        this._updateSunPosition();
        break;
      case 'topColor':
      case 'bottomColor':
      case 'gradientExponent':
        if (this._gradientMesh) {
          const u = (this._gradientMesh.material as THREE.ShaderMaterial).uniforms;
          if (key === 'topColor') u['topColor'].value.set(value);
          else if (key === 'bottomColor') u['bottomColor'].value.set(value);
          else u['exponent'].value = value;
        }
        break;
      case 'solidColor':
        if (this._scene && this.properties.skyType === 'color') {
          this._scene.background = new THREE.Color(value);
        }
        break;
      case 'hdriDataUrl':
        // Only trigger load on dataUrl change (the actual texture data)
        // hdriTextureId and hdriTextureName are metadata — no reload needed
        if (this.properties.skyType === 'hdri') this._loadHDRI();
        break;
      case 'hdriTextureId':
      case 'hdriTextureName':
        // Metadata only — no reload
        break;
      case 'hdriMapping':
        // Re-load with the new mapping mode
        if (this.properties.skyType === 'hdri' && this.properties.hdriDataUrl) this._loadHDRI();
        break;
      case 'hdriIntensity':
        if (this._skySphereMesh) {
          // In sphere mode, adjust material color to simulate intensity
          const mat = this._skySphereMesh.material as THREE.MeshBasicMaterial;
          const c = new THREE.Color(value, value, value);
          mat.color = c;
        } else if (this._scene) {
          this._scene.backgroundIntensity = value;
        }
        break;
      case 'hdriRotation':
        if (this._skySphereMesh) {
          // In sphere mode, just rotate the mesh
          this._skySphereMesh.rotation.y = THREE.MathUtils.degToRad(value);
        } else if (this.properties.skyType === 'hdri') {
          // In equirectangular mode, need to reload
          this._loadHDRI();
        }
        break;
      case 'generateEnvMap':
        if (value && this.properties.skyType === 'atmosphere') this._generateEnvMapFromSky();
        else if (!value && this._scene) {
          this._scene.environment = null;
          if (this._envTexture) { this._envTexture.dispose(); this._envTexture = null; }
        }
        break;
      case 'skyIntensity':
        if (this._scene) {
          this._scene.backgroundIntensity = value;
          this._scene.environmentIntensity = value;
        }
        break;
      case 'cloudsEnabled':
        if (value && this.properties.skyType === 'atmosphere') {
          this._createCloudLayer();
        } else {
          this._removeCloudLayer();
        }
        break;
      case 'cloudCoverage':
        if (this._cloudMesh) (this._cloudMesh.material as THREE.ShaderMaterial).uniforms['uCoverage'].value = value;
        break;
      case 'cloudOpacity':
        if (this._cloudMesh) (this._cloudMesh.material as THREE.ShaderMaterial).uniforms['uOpacity'].value = value;
        break;
      case 'cloudColor':
        if (this._cloudMesh) (this._cloudMesh.material as THREE.ShaderMaterial).uniforms['uCloudColor'].value.set(value);
        break;
      case 'cloudSpeed':
      case 'cloudHeight':
        // These are read from properties directly
        break;
    }
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'skyType', label: 'Sky Type', group: 'Sky', type: 'select', value: this.properties.skyType, options: [
        { label: 'Atmospheric Scattering', value: 'atmosphere' },
        { label: 'HDRI Texture', value: 'hdri' },
        { label: 'Gradient', value: 'gradient' },
        { label: 'Solid Color', value: 'color' },
      ]},
      { key: 'preset', label: 'Preset', group: 'Sky', type: 'select', value: this.properties.preset, options: [
        { label: 'Sunny Day', value: 'default' },
        { label: 'Sunset', value: 'sunset' },
        { label: 'Dawn', value: 'dawn' },
        { label: 'Overcast', value: 'overcast' },
        { label: 'Night', value: 'night' },
      ]},
      { key: 'skyIntensity', label: 'Sky Intensity', group: 'Sky', type: 'number', min: 0, max: 2, step: 0.05, value: this.properties.skyIntensity },
      { key: 'generateEnvMap', label: 'Environment Map', group: 'Sky', type: 'boolean', value: this.properties.generateEnvMap },
      { key: 'turbidity', label: 'Turbidity', group: 'Atmosphere', type: 'number', min: 0, max: 20, step: 0.1, value: this.properties.turbidity },
      { key: 'rayleigh', label: 'Rayleigh', group: 'Atmosphere', type: 'number', min: 0, max: 4, step: 0.05, value: this.properties.rayleigh },
      { key: 'mieCoefficient', label: 'Mie Coefficient', group: 'Atmosphere', type: 'number', min: 0, max: 0.1, step: 0.001, value: this.properties.mieCoefficient },
      { key: 'mieDirectionalG', label: 'Mie Directional G', group: 'Atmosphere', type: 'number', min: 0, max: 1, step: 0.01, value: this.properties.mieDirectionalG },
      { key: 'elevation', label: 'Sun Elevation', group: 'Sun Position', type: 'number', min: -5, max: 90, step: 0.5, value: this.properties.elevation },
      { key: 'azimuth', label: 'Sun Azimuth', group: 'Sun Position', type: 'number', min: 0, max: 360, step: 1, value: this.properties.azimuth },
      { key: 'hdriTextureId', label: 'Sky Texture', group: 'HDRI', type: 'texture', value: {
        textureId: this.properties.hdriTextureId,
        dataUrl: this.properties.hdriDataUrl,
        textureName: this.properties.hdriTextureName,
      }, placeholder: 'Drop image here or browse...' },
      { key: 'hdriMapping', label: 'Mapping', group: 'HDRI', type: 'select', value: this.properties.hdriMapping, options: [
        { label: 'Sky Sphere', value: 'sphere' },
        { label: 'Equirectangular (360°)', value: 'equirectangular' },
      ]},
      { key: 'hdriIntensity', label: 'HDRI Intensity', group: 'HDRI', type: 'number', min: 0, max: 5, step: 0.05, value: this.properties.hdriIntensity },
      { key: 'hdriRotation', label: 'HDRI Rotation', group: 'HDRI', type: 'number', min: 0, max: 360, step: 1, value: this.properties.hdriRotation },
      { key: 'topColor', label: 'Top Color', group: 'Gradient', type: 'color', value: this.properties.topColor },
      { key: 'bottomColor', label: 'Bottom Color', group: 'Gradient', type: 'color', value: this.properties.bottomColor },
      { key: 'gradientExponent', label: 'Exponent', group: 'Gradient', type: 'number', min: 0.1, max: 5, step: 0.05, value: this.properties.gradientExponent },
      { key: 'solidColor', label: 'Sky Color', group: 'Color', type: 'color', value: this.properties.solidColor },
      { key: 'cloudsEnabled', label: 'Clouds', group: 'Clouds', type: 'boolean', value: this.properties.cloudsEnabled },
      { key: 'cloudCoverage', label: 'Coverage', group: 'Clouds', type: 'number', min: 0, max: 1, step: 0.05, value: this.properties.cloudCoverage },
      { key: 'cloudOpacity', label: 'Opacity', group: 'Clouds', type: 'number', min: 0, max: 1, step: 0.05, value: this.properties.cloudOpacity },
      { key: 'cloudSpeed', label: 'Speed', group: 'Clouds', type: 'number', min: 0, max: 0.02, step: 0.001, value: this.properties.cloudSpeed },
      { key: 'cloudColor', label: 'Color', group: 'Clouds', type: 'color', value: this.properties.cloudColor },
    ];
  }

  dispose(): void {
    this._removeExisting();
    this._removeCloudLayer();
    if (this._pmremGenerator) {
      this._pmremGenerator.dispose();
      this._pmremGenerator = null;
    }
  }
}

// ============================================================
//  3. SKY LIGHT (Hemisphere Light)
// ============================================================

export class SkyLightActor extends BaseSceneActor {
  readonly type: SceneActorType = 'SkyLight';
  public hemiLight: THREE.HemisphereLight;

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'SkyLight';

    this.properties = {
      intensity: props.intensity ?? 0.8,
      skyColor: props.skyColor ?? '#B4D4F0',
      groundColor: props.groundColor ?? '#AB8860',
    };

    this.hemiLight = new THREE.HemisphereLight(
      this.properties.skyColor,
      this.properties.groundColor,
      this.properties.intensity,
    );
    this.hemiLight.userData.__sceneActorId = id;
    this.group.add(this.hemiLight);

    // Invisible hit mesh for viewport selection
    this._createHitMesh(1.0, 0);
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return [];
  }

  addToScene(scene: THREE.Scene): void { scene.add(this.group); }
  removeFromScene(scene: THREE.Scene): void { scene.remove(this.group); }
  setVisible(visible: boolean): void { this.hemiLight.visible = visible; }

  /** Keep the hemisphere light active during play — no editor helpers to hide */
  setEditorVisible(_visible: boolean): void {
    // SkyLight has no editor-only visuals; the light must remain active during play
  }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;
    switch (key) {
      case 'intensity': this.hemiLight.intensity = value; break;
      case 'skyColor': this.hemiLight.color.set(value); break;
      case 'groundColor': this.hemiLight.groundColor.set(value); break;
    }
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'intensity', label: 'Intensity', group: 'Light', type: 'number', min: 0, max: 5, step: 0.05, value: this.properties.intensity },
      { key: 'skyColor', label: 'Sky Color', group: 'Light', type: 'color', value: this.properties.skyColor },
      { key: 'groundColor', label: 'Ground Color', group: 'Light', type: 'color', value: this.properties.groundColor },
    ];
  }

  dispose(): void { this.hemiLight.dispose(); }
}

// ============================================================
//  4. EXPONENTIAL HEIGHT FOG
// ============================================================

export class ExponentialHeightFogActor extends BaseSceneActor {
  readonly type: SceneActorType = 'ExponentialHeightFog';
  private _scene: THREE.Scene | null = null;
  private _volumeHelper: THREE.Mesh | null = null;

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'ExponentialHeightFog';

    this.properties = {
      enabled: props.enabled ?? false,
      fogDensity: props.fogDensity ?? 0.00025,
      fogColor: props.fogColor ?? '#C8D8FF',
      fogMaxOpacity: props.fogMaxOpacity ?? 1.0,
      nearDistance: props.nearDistance ?? 1,
      farDistance: props.farDistance ?? 5000,
      fogType: props.fogType ?? 'exponential',
      heightFalloff: props.heightFalloff ?? 0.2,
      inscatteringColor: props.inscatteringColor ?? '#FFE4B5',
      startDistance: props.startDistance ?? 0,
    };

    const geo = new THREE.BoxGeometry(4, 2, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x88aaff, wireframe: true, transparent: true, opacity: 0.35 });
    this._volumeHelper = new THREE.Mesh(geo, mat);
    this._volumeHelper.userData.__isSceneCompositionHelper = true;
    this._volumeHelper.raycast = () => {};
    this.group.add(this._volumeHelper);

    // Invisible hit mesh for viewport selection
    this._createHitMesh(2.0, 1.0);
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return ['translate'];
  }

  addToScene(scene: THREE.Scene): void {
    this._scene = scene;
    scene.add(this.group);
    if (this.properties.enabled) this._applyFog();
  }

  removeFromScene(scene: THREE.Scene): void {
    scene.fog = null;
    scene.remove(this.group);
    this._scene = null;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (this._scene) {
      if (visible && this.properties.enabled) this._applyFog();
      else this._scene.fog = null;
    }
  }

  /** Hide only the volume helper during play — fog effect remains active */
  setEditorVisible(visible: boolean): void {
    if (this._volumeHelper) this._volumeHelper.visible = visible;
    // Fog is applied to the scene itself, not a visual — it stays active
  }

  private _applyFog(): void {
    if (!this._scene) return;
    if (this.properties.fogType === 'linear') {
      this._scene.fog = new THREE.Fog(this.properties.fogColor, this.properties.nearDistance, this.properties.farDistance);
    } else {
      this._scene.fog = new THREE.FogExp2(this.properties.fogColor, this.properties.fogDensity);
    }
  }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;
    switch (key) {
      case 'enabled':
        if (this._scene) {
          if (value) this._applyFog();
          else this._scene.fog = null;
        }
        break;
      case 'fogDensity':
        if (this._scene?.fog && 'density' in this._scene.fog) (this._scene.fog as THREE.FogExp2).density = value;
        break;
      case 'fogColor':
        if (this._scene?.fog) this._scene.fog.color.set(value);
        break;
      case 'nearDistance':
      case 'farDistance':
      case 'fogType':
      case 'startDistance':
        if (this.properties.enabled) this._applyFog();
        break;
    }
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'enabled', label: 'Enabled', group: 'Fog', type: 'boolean', value: this.properties.enabled },
      { key: 'fogType', label: 'Fog Type', group: 'Fog', type: 'select', value: this.properties.fogType, options: [
        { label: 'Exponential', value: 'exponential' }, { label: 'Linear', value: 'linear' },
      ]},
      { key: 'fogDensity', label: 'Density', group: 'Fog', type: 'number', min: 0, max: 0.01, step: 0.0001, value: this.properties.fogDensity },
      { key: 'fogColor', label: 'Fog Color', group: 'Fog', type: 'color', value: this.properties.fogColor },
      { key: 'fogMaxOpacity', label: 'Max Opacity', group: 'Fog', type: 'number', min: 0, max: 1, step: 0.05, value: this.properties.fogMaxOpacity },
      { key: 'nearDistance', label: 'Near Distance', group: 'Linear Fog', type: 'number', min: 0, max: 10000, step: 10, value: this.properties.nearDistance },
      { key: 'farDistance', label: 'Far Distance', group: 'Linear Fog', type: 'number', min: 0, max: 50000, step: 100, value: this.properties.farDistance },
      { key: 'heightFalloff', label: 'Height Falloff', group: 'Height', type: 'number', min: 0, max: 2, step: 0.01, value: this.properties.heightFalloff },
      { key: 'inscatteringColor', label: 'Inscattering Color', group: 'Volumetric', type: 'color', value: this.properties.inscatteringColor },
      { key: 'startDistance', label: 'Start Distance', group: 'Fog', type: 'number', min: 0, max: 5000, step: 10, value: this.properties.startDistance },
    ];
  }

  dispose(): void {
    if (this._scene) this._scene.fog = null;
    if (this._volumeHelper) {
      this._volumeHelper.geometry.dispose();
      (this._volumeHelper.material as THREE.Material).dispose();
    }
  }
}

// ============================================================
//  5. POST PROCESS VOLUME
// ============================================================

export class PostProcessVolumeActor extends BaseSceneActor {
  readonly type: SceneActorType = 'PostProcessVolume';
  private _renderer: THREE.WebGLRenderer | null = null;
  private _boxHelper: THREE.Mesh | null = null;

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'PostProcessVolume';

    this.properties = {
      isUnbound: props.isUnbound ?? true,
      priority: props.priority ?? 0,
      toneMappingType: props.toneMappingType ?? 'ACES',
      exposure: props.exposure ?? 1.0,
      bloomEnabled: props.bloomEnabled ?? true,
      bloomIntensity: props.bloomIntensity ?? 0.15,
      bloomThreshold: props.bloomThreshold ?? 0.85,
      bloomRadius: props.bloomRadius ?? 0.4,
      saturation: props.saturation ?? 1.0,
      contrast: props.contrast ?? 1.0,
      gamma: props.gamma ?? 1.0,
      temperature: props.temperature ?? 6500,
      tint: props.tint ?? 0.0,
      vignetteEnabled: props.vignetteEnabled ?? false,
      vignetteIntensity: props.vignetteIntensity ?? 0.4,
      chromaticAberrationEnabled: props.chromaticAberrationEnabled ?? false,
      chromaticAberrationIntensity: props.chromaticAberrationIntensity ?? 0.5,
      filmGrainEnabled: props.filmGrainEnabled ?? false,
      filmGrainIntensity: props.filmGrainIntensity ?? 0.1,
      godRaysEnabled: props.godRaysEnabled ?? false,
      godRaysIntensity: props.godRaysIntensity ?? 0.65,
      godRaysDensity: props.godRaysDensity ?? 0.96,
      godRaysDecay: props.godRaysDecay ?? 0.97,
      godRaysExposure: props.godRaysExposure ?? 0.22,
      godRaysWeight: props.godRaysWeight ?? 0.6,
      godRaysSamples: props.godRaysSamples ?? 60,
    };

    const boxGeo = new THREE.BoxGeometry(10, 10, 10);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0x44aaff, wireframe: true, transparent: true, opacity: 0.3 });
    this._boxHelper = new THREE.Mesh(boxGeo, boxMat);
    this._boxHelper.userData.__isSceneCompositionHelper = true;
    this._boxHelper.raycast = () => {};
    this._boxHelper.visible = !this.properties.isUnbound;
    this.group.add(this._boxHelper);

    // Invisible hit mesh for viewport selection
    this._createHitMesh(2.0, 0);
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return this.properties.isUnbound ? [] : ['translate', 'scale'];
  }

  /** Set up the renderer-level tone mapping. This is backward-compatible
   *  with SceneCompositionManager's `setupComposer` calls. */
  setupComposer(renderer: THREE.WebGLRenderer, _scene: THREE.Scene, _camera: THREE.Camera): void {
    this._renderer = renderer;
    this._applyToRenderer();
  }

  setRenderer(renderer: THREE.WebGLRenderer): void {
    this._renderer = renderer;
    this._applyToRenderer();
  }

  private _applyToRenderer(): void {
    if (!this._renderer) return;
    switch (this.properties.toneMappingType) {
      case 'None': this._renderer.toneMapping = THREE.NoToneMapping; break;
      case 'Linear': this._renderer.toneMapping = THREE.LinearToneMapping; break;
      case 'Reinhard': this._renderer.toneMapping = THREE.ReinhardToneMapping; break;
      case 'ACES': this._renderer.toneMapping = THREE.ACESFilmicToneMapping; break;
      case 'AgX': this._renderer.toneMapping = THREE.AgXToneMapping; break;
      default: this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    this._renderer.toneMappingExposure = this.properties.exposure;
  }

  addToScene(scene: THREE.Scene): void { scene.add(this.group); }

  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group);
    // Reset renderer tone mapping so stale settings don't persist after deletion
    if (this._renderer) {
      this._renderer.toneMapping = THREE.NoToneMapping;
      this._renderer.toneMappingExposure = 1.0;
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (!visible && this._renderer) {
      this._renderer.toneMapping = THREE.NoToneMapping;
      this._renderer.toneMappingExposure = 1.0;
    } else {
      this._applyToRenderer();
    }
  }

  /** Hide only the bounding-box helper during play — tone mapping remains active */
  setEditorVisible(visible: boolean): void {
    if (this._boxHelper) this._boxHelper.visible = visible;
    // Tone mapping is a renderer-level setting, not visual — it stays active
  }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;
    switch (key) {
      case 'toneMappingType':
      case 'exposure':
        this._applyToRenderer();
        break;
      case 'isUnbound':
        if (this._boxHelper) this._boxHelper.visible = !value;
        break;
    }
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'isUnbound', label: 'Infinite Extent (Unbound)', group: 'Volume', type: 'boolean', value: this.properties.isUnbound },
      { key: 'priority', label: 'Priority', group: 'Volume', type: 'number', min: -10, max: 10, step: 1, value: this.properties.priority },
      { key: 'toneMappingType', label: 'Tone Mapping', group: 'Tone Mapping', type: 'select', value: this.properties.toneMappingType, options: [
        { label: 'None', value: 'None' }, { label: 'Linear', value: 'Linear' },
        { label: 'Reinhard', value: 'Reinhard' }, { label: 'ACES Filmic (Default)', value: 'ACES' },
        { label: 'AgX', value: 'AgX' },
      ]},
      { key: 'exposure', label: 'Exposure', group: 'Tone Mapping', type: 'number', min: 0, max: 5, step: 0.05, value: this.properties.exposure },
      { key: 'bloomEnabled', label: 'Bloom', group: 'Bloom', type: 'boolean', value: this.properties.bloomEnabled },
      { key: 'bloomIntensity', label: 'Intensity', group: 'Bloom', type: 'number', min: 0, max: 3, step: 0.025, value: this.properties.bloomIntensity },
      { key: 'bloomThreshold', label: 'Threshold', group: 'Bloom', type: 'number', min: 0, max: 2, step: 0.05, value: this.properties.bloomThreshold },
      { key: 'bloomRadius', label: 'Radius', group: 'Bloom', type: 'number', min: 0, max: 2, step: 0.05, value: this.properties.bloomRadius },
      { key: 'saturation', label: 'Saturation', group: 'Color Grading', type: 'number', min: 0, max: 3, step: 0.05, value: this.properties.saturation },
      { key: 'contrast', label: 'Contrast', group: 'Color Grading', type: 'number', min: 0, max: 3, step: 0.05, value: this.properties.contrast },
      { key: 'gamma', label: 'Gamma', group: 'Color Grading', type: 'number', min: 0.1, max: 3, step: 0.05, value: this.properties.gamma },
      { key: 'temperature', label: 'Temperature', group: 'Color Grading', type: 'number', min: 1500, max: 15000, step: 100, value: this.properties.temperature },
      { key: 'tint', label: 'Tint', group: 'Color Grading', type: 'number', min: -1, max: 1, step: 0.05, value: this.properties.tint },
      { key: 'vignetteEnabled', label: 'Vignette', group: 'Lens Effects', type: 'boolean', value: this.properties.vignetteEnabled },
      { key: 'vignetteIntensity', label: 'Vignette Intensity', group: 'Lens Effects', type: 'number', min: 0, max: 2, step: 0.05, value: this.properties.vignetteIntensity },
      { key: 'chromaticAberrationEnabled', label: 'Chromatic Aberration', group: 'Lens Effects', type: 'boolean', value: this.properties.chromaticAberrationEnabled },
      { key: 'chromaticAberrationIntensity', label: 'CA Intensity', group: 'Lens Effects', type: 'number', min: 0, max: 5, step: 0.1, value: this.properties.chromaticAberrationIntensity },
      { key: 'filmGrainEnabled', label: 'Film Grain', group: 'Lens Effects', type: 'boolean', value: this.properties.filmGrainEnabled },
      { key: 'filmGrainIntensity', label: 'Grain Intensity', group: 'Lens Effects', type: 'number', min: 0, max: 1, step: 0.01, value: this.properties.filmGrainIntensity },
      { key: 'godRaysEnabled', label: 'God Rays', group: 'God Rays', type: 'boolean', value: this.properties.godRaysEnabled },
      { key: 'godRaysExposure', label: 'Exposure', group: 'God Rays', type: 'number', min: 0, max: 1, step: 0.01, value: this.properties.godRaysExposure },
      { key: 'godRaysWeight', label: 'Weight', group: 'God Rays', type: 'number', min: 0, max: 2, step: 0.05, value: this.properties.godRaysWeight },
      { key: 'godRaysDensity', label: 'Density', group: 'God Rays', type: 'number', min: 0.5, max: 1, step: 0.01, value: this.properties.godRaysDensity },
      { key: 'godRaysDecay', label: 'Decay', group: 'God Rays', type: 'number', min: 0.9, max: 1, step: 0.005, value: this.properties.godRaysDecay },
      { key: 'godRaysSamples', label: 'Samples', group: 'God Rays', type: 'select', value: this.properties.godRaysSamples, options: [
        { label: '30 (Fast)', value: 30 }, { label: '60 (Default)', value: 60 },
        { label: '80 (Quality)', value: 80 }, { label: '100 (Ultra)', value: 100 },
      ]},
    ];
  }

  dispose(): void {
    // Reset renderer tone mapping on disposal
    if (this._renderer) {
      this._renderer.toneMapping = THREE.NoToneMapping;
      this._renderer.toneMappingExposure = 1.0;
    }
    if (this._boxHelper) {
      this._boxHelper.geometry.dispose();
      (this._boxHelper.material as THREE.Material).dispose();
    }
  }
}

// ============================================================
//  6. WORLD GRID
// ============================================================

export class WorldGridActor extends BaseSceneActor {
  readonly type: SceneActorType = 'WorldGrid';
  private _gridHelper: THREE.GridHelper | null = null;
  private _axisHelper: THREE.AxesHelper | null = null;
  private _originMarker: THREE.Mesh | null = null;
  private _shadowGround: THREE.Mesh | null = null;
  private _scene: THREE.Scene | null = null;

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'WorldGrid';

    this.properties = {
      gridSize: props.gridSize ?? 200,
      gridDivisions: props.gridDivisions ?? 200,
      primaryColor: props.primaryColor ?? '#333355',
      secondaryColor: props.secondaryColor ?? '#222244',
      showAxes: props.showAxes ?? true,
      showOriginMarker: props.showOriginMarker ?? true,
      gridFloorHeight: props.gridFloorHeight ?? 0,
    };
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return [];
  }

  addToScene(scene: THREE.Scene): void {
    this._scene = scene;
    scene.add(this.group);
    this._create();
  }

  removeFromScene(scene: THREE.Scene): void {
    this._dispose();
    scene.remove(this.group);
    this._scene = null;
  }

  setVisible(visible: boolean): void {
    if (this._gridHelper) this._gridHelper.visible = visible;
    if (this._axisHelper) this._axisHelper.visible = visible && this.properties.showAxes;
    if (this._originMarker) this._originMarker.visible = visible && this.properties.showOriginMarker;
    if (this._shadowGround) this._shadowGround.visible = visible;
  }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;
    switch (key) {
      case 'showAxes':
        if (this._axisHelper) this._axisHelper.visible = value;
        break;
      case 'showOriginMarker':
        if (this._originMarker) this._originMarker.visible = value;
        break;
      case 'gridFloorHeight':
        if (this._gridHelper) this._gridHelper.position.y = value;
        if (this._axisHelper) this._axisHelper.position.y = value;
        if (this._originMarker) this._originMarker.position.y = value;
        if (this._shadowGround) this._shadowGround.position.y = value - 0.01;
        break;
      case 'primaryColor':
      case 'secondaryColor':
      case 'gridSize':
      case 'gridDivisions':
        this._rebuild();
        break;
    }
  }

  private _create(): void {
    if (!this._scene) return;
    const { gridSize, gridDivisions, primaryColor, secondaryColor, gridFloorHeight } = this.properties;

    this._gridHelper = new THREE.GridHelper(gridSize, gridDivisions, primaryColor, secondaryColor);
    this._gridHelper.position.y = gridFloorHeight;
    this._gridHelper.userData.__isSceneCompositionHelper = true;
    this._gridHelper.raycast = () => {};
    this._scene.add(this._gridHelper);

    this._axisHelper = new THREE.AxesHelper(50);
    this._axisHelper.visible = this.properties.showAxes;
    this._axisHelper.position.y = gridFloorHeight;
    this._axisHelper.userData.__isSceneCompositionHelper = true;
    this._axisHelper.raycast = () => {};
    this._scene.add(this._axisHelper);

    const geo = new THREE.SphereGeometry(0.08, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this._originMarker = new THREE.Mesh(geo, mat);
    this._originMarker.position.y = gridFloorHeight;
    this._originMarker.visible = this.properties.showOriginMarker;
    this._originMarker.userData.__isSceneCompositionHelper = true;
    this._originMarker.raycast = () => {};
    this._scene.add(this._originMarker);

    const groundGeo = new THREE.PlaneGeometry(gridSize * 2, gridSize * 2);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    this._shadowGround = new THREE.Mesh(groundGeo, groundMat);
    this._shadowGround.rotation.x = -Math.PI / 2;
    this._shadowGround.position.y = gridFloorHeight - 0.01;
    this._shadowGround.receiveShadow = true;
    this._shadowGround.userData.__isSceneCompositionHelper = true;
    this._shadowGround.raycast = () => {};
    this._scene.add(this._shadowGround);
  }

  private _rebuild(): void { this._dispose(); this._create(); }

  private _dispose(): void {
    if (!this._scene) return;
    for (const obj of [this._gridHelper, this._axisHelper, this._originMarker, this._shadowGround]) {
      if (!obj) continue;
      this._scene.remove(obj);
      if ('dispose' in obj) (obj as any).dispose();
      if ('geometry' in obj) (obj as any).geometry?.dispose();
      if ('material' in obj) (obj as any).material?.dispose?.();
    }
    this._gridHelper = null;
    this._axisHelper = null;
    this._originMarker = null;
    this._shadowGround = null;
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'gridSize', label: 'Grid Size', group: 'Grid', type: 'number', min: 10, max: 10000, step: 10, value: this.properties.gridSize },
      { key: 'gridDivisions', label: 'Divisions', group: 'Grid', type: 'number', min: 10, max: 1000, step: 10, value: this.properties.gridDivisions },
      { key: 'primaryColor', label: 'Primary Color', group: 'Grid', type: 'color', value: this.properties.primaryColor },
      { key: 'secondaryColor', label: 'Secondary Color', group: 'Grid', type: 'color', value: this.properties.secondaryColor },
      { key: 'showAxes', label: 'Show Axes', group: 'Display', type: 'boolean', value: this.properties.showAxes },
      { key: 'showOriginMarker', label: 'Show Origin', group: 'Display', type: 'boolean', value: this.properties.showOriginMarker },
      { key: 'gridFloorHeight', label: 'Floor Height', group: 'Display', type: 'number', min: -100, max: 100, step: 0.1, value: this.properties.gridFloorHeight },
    ];
  }

  dispose(): void { this._dispose(); }
}

// ============================================================
//  6b. DEV GROUND PLANE — textured walkable floor (like UE5)
// ============================================================

export class DevGroundPlaneActor extends BaseSceneActor {
  readonly type: SceneActorType = 'DevGroundPlane';
  private _planeMesh: THREE.Mesh | null = null;
  private _gridOverlay: THREE.GridHelper | null = null;
  private _scene: THREE.Scene | null = null;
  private _devTexture: THREE.CanvasTexture | null = null;

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'DevGroundPlane';

    this.properties = {
      planeSize: props.planeSize ?? 200,
      textureScale: props.textureScale ?? 40,
      primaryColor: props.primaryColor ?? '#8a8a9a',
      secondaryColor: props.secondaryColor ?? '#707080',
      lineColor: props.lineColor ?? '#9595a8',
      showGridOverlay: props.showGridOverlay ?? true,
      gridOverlayDivisions: props.gridOverlayDivisions ?? 100,
      gridOverlayColor: props.gridOverlayColor ?? '#666680',
      hasCollision: props.hasCollision ?? true,
    };

    // Apply initial position
    if (props.positionY != null) this.group.position.y = props.positionY;
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return ['translate', 'scale'];
  }

  addToScene(scene: THREE.Scene): void {
    this._scene = scene;
    scene.add(this.group);
    this._create();
  }

  removeFromScene(scene: THREE.Scene): void {
    this._dispose();
    scene.remove(this.group);
    this._scene = null;
  }

  setVisible(visible: boolean): void {
    if (this._planeMesh) this._planeMesh.visible = visible;
    if (this._gridOverlay) this._gridOverlay.visible = visible && this.properties.showGridOverlay;
  }

  /** Hide only the grid overlay during play — the ground plane mesh remains visible */
  setEditorVisible(visible: boolean): void {
    if (this._gridOverlay) this._gridOverlay.visible = visible;
    // Keep the ground plane mesh itself visible so the player can walk on it
  }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;
    switch (key) {
      case 'showGridOverlay':
        if (this._gridOverlay) this._gridOverlay.visible = value;
        break;
      case 'planeSize':
      case 'textureScale':
      case 'primaryColor':
      case 'secondaryColor':
      case 'lineColor':
      case 'gridOverlayDivisions':
      case 'gridOverlayColor':
        this._rebuild();
        break;
    }
  }

  /** Generate a UE5-style dev checker texture on a canvas */
  private _generateDevTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const primary = this.properties.primaryColor;
    const secondary = this.properties.secondaryColor;
    const lineCol = this.properties.lineColor;
    const tileCount = 8; // 8×8 checker grid per texture tile
    const tileSize = size / tileCount;

    // Draw checker pattern
    for (let y = 0; y < tileCount; y++) {
      for (let x = 0; x < tileCount; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? primary : secondary;
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }

    // Draw grid lines
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1;
    for (let i = 0; i <= tileCount; i++) {
      const pos = i * tileSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Draw center cross (subtle, thicker lines)
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    const half = size / 2;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, half);
    ctx.lineTo(size, half);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(this.properties.textureScale, this.properties.textureScale);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private _create(): void {
    if (!this._scene) return;

    const planeSize = this.properties.planeSize;

    // Generate dev texture
    if (this._devTexture) this._devTexture.dispose();
    this._devTexture = this._generateDevTexture();

    // Create plane mesh
    const geo = new THREE.PlaneGeometry(planeSize, planeSize);
    const mat = new THREE.MeshStandardMaterial({
      map: this._devTexture,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    this._planeMesh = new THREE.Mesh(geo, mat);
    this._planeMesh.rotation.x = -Math.PI / 2;
    this._planeMesh.receiveShadow = true;
    this._planeMesh.userData.__isSceneCompositionHelper = true;
    this._planeMesh.userData.__isDevGroundPlane = true;
    this.group.add(this._planeMesh);

    // Optional wireframe grid overlay
    if (this.properties.showGridOverlay) {
      this._gridOverlay = new THREE.GridHelper(
        planeSize,
        this.properties.gridOverlayDivisions,
        this.properties.gridOverlayColor,
        this.properties.gridOverlayColor,
      );
      this._gridOverlay.position.y = 0.01; // Slight offset to avoid z-fighting
      this._gridOverlay.material.opacity = 0.15;
      (this._gridOverlay.material as THREE.Material).transparent = true;
      this._gridOverlay.userData.__isSceneCompositionHelper = true;
      this._gridOverlay.raycast = () => {};
      this.group.add(this._gridOverlay);
    }
  }

  private _rebuild(): void { this._dispose(); this._create(); }

  private _dispose(): void {
    if (this._planeMesh) {
      this.group.remove(this._planeMesh);
      this._planeMesh.geometry.dispose();
      (this._planeMesh.material as THREE.Material).dispose();
      this._planeMesh = null;
    }
    if (this._gridOverlay) {
      this.group.remove(this._gridOverlay);
      this._gridOverlay.geometry.dispose();
      (this._gridOverlay.material as THREE.Material).dispose();
      this._gridOverlay = null;
    }
    if (this._devTexture) {
      this._devTexture.dispose();
      this._devTexture = null;
    }
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'planeSize', label: 'Plane Size', group: 'Ground Plane', type: 'number', min: 1, max: 10000, step: 1, value: this.properties.planeSize },
      { key: 'textureScale', label: 'Texture Tiling', group: 'Ground Plane', type: 'number', min: 1, max: 200, step: 1, value: this.properties.textureScale },
      { key: 'primaryColor', label: 'Primary Color', group: 'Ground Plane', type: 'color', value: this.properties.primaryColor },
      { key: 'secondaryColor', label: 'Secondary Color', group: 'Ground Plane', type: 'color', value: this.properties.secondaryColor },
      { key: 'lineColor', label: 'Line Color', group: 'Ground Plane', type: 'color', value: this.properties.lineColor },
      { key: 'showGridOverlay', label: 'Grid Overlay', group: 'Display', type: 'boolean', value: this.properties.showGridOverlay },
      { key: 'gridOverlayDivisions', label: 'Grid Divisions', group: 'Display', type: 'number', min: 5, max: 200, step: 5, value: this.properties.gridOverlayDivisions },
      { key: 'gridOverlayColor', label: 'Grid Color', group: 'Display', type: 'color', value: this.properties.gridOverlayColor },
      { key: 'hasCollision', label: 'Has Collision', group: 'Physics', type: 'boolean', value: this.properties.hasCollision },
    ];
  }

  dispose(): void { this._dispose(); }
}

// ============================================================
//  6c. TERRAIN — Heightmap-based landscape with splatmap materials
// ============================================================

export class TerrainActor extends BaseSceneActor {
  readonly type: SceneActorType = 'Terrain';
  private _terrainMesh: THREE.Mesh | null = null;
  private _brushIndicator: THREE.Mesh | null = null;
  private _scene: THREE.Scene | null = null;
  private _terrainData: TerrainData;
  private _devTexture: THREE.CanvasTexture | null = null;

  /** Expose terrain data for the editor panel and external systems */
  get terrainData(): TerrainData { return this._terrainData; }
  get terrainMesh(): THREE.Mesh | null { return this._terrainMesh; }

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'Terrain';

    // Deserialize or create default terrain data
    if (props._terrainData) {
      this._terrainData = TerrainActor._deserializeTerrainData(props._terrainData);
    } else {
      this._terrainData = createDefaultTerrainData();
      if (props.sizeX != null) this._terrainData.sizeX = props.sizeX;
      if (props.sizeZ != null) this._terrainData.sizeZ = props.sizeZ;
      if (props.maxHeight != null) this._terrainData.maxHeight = props.maxHeight;
      if (props.resolution != null) this._terrainData.resolution = props.resolution;
      if (props.hasCollision != null) this._terrainData.hasCollision = props.hasCollision;
    }

    this.properties = {
      sizeX: this._terrainData.sizeX,
      sizeZ: this._terrainData.sizeZ,
      maxHeight: this._terrainData.maxHeight,
      resolution: this._terrainData.resolution,
      hasCollision: this._terrainData.hasCollision,
      layerCount: this._terrainData.layers.length,
    };

    if (props.positionY != null) this.group.position.y = props.positionY;
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return ['translate'];
  }

  addToScene(scene: THREE.Scene): void {
    this._scene = scene;
    scene.add(this.group);
    this._createMesh();
    this._createBrushIndicator();
  }

  removeFromScene(scene: THREE.Scene): void {
    this._disposeMesh();
    this._disposeBrushIndicator();
    scene.remove(this.group);
    this._scene = null;
  }

  setVisible(visible: boolean): void {
    if (this._terrainMesh) this._terrainMesh.visible = visible;
  }

  setEditorVisible(visible: boolean): void {
    // Brush indicator is editor-only
    if (this._brushIndicator) this._brushIndicator.visible = visible;
  }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;

    switch (key) {
      case 'sizeX':
        this._terrainData.sizeX = value;
        this._rebuildMesh();
        break;
      case 'sizeZ':
        this._terrainData.sizeZ = value;
        this._rebuildMesh();
        break;
      case 'maxHeight':
        this._terrainData.maxHeight = value;
        this._updateHeights();
        break;
      case 'resolution':
        this._terrainData.resolution = value;
        this._rebuildMesh();
        break;
      case 'hasCollision':
        this._terrainData.hasCollision = value;
        break;
    }
  }

  /** Apply a sculpt brush stroke — called from the viewport mouse handler */
  applySculpt(
    tool: import('../TerrainEditorPanel').SculptTool,
    worldPos: THREE.Vector3,
    radius: number,
    strength: number,
    dt: number,
  ): void {
    // Convert world position to terrain-local
    const local = this.group.worldToLocal(worldPos.clone());
    SculptBrush.apply(this._terrainData, tool, local.x, local.z, radius, strength, dt);
    this._updateHeights();
  }

  /** Apply a paint brush stroke */
  applyPaint(
    layerId: string,
    worldPos: THREE.Vector3,
    radius: number,
    strength: number,
    erase: boolean,
    dt: number,
  ): void {
    const local = this.group.worldToLocal(worldPos.clone());
    PaintBrush.apply(this._terrainData, layerId, local.x, local.z, radius, strength, erase, dt);
    // Update the splatmap DataTexture so changes are visible immediately
    if (this._terrainMesh) {
      TerrainMeshBuilder.updateSplatmapTexture(this._terrainMesh.material as THREE.Material, this._terrainData);
    }
  }

  /** Show brush indicator at world position */
  showBrush(worldPos: THREE.Vector3, radius: number): void {
    if (!this._brushIndicator) return;
    const local = this.group.worldToLocal(worldPos.clone());
    this._brushIndicator.position.set(local.x, local.y + 0.15, local.z);
    this._brushIndicator.scale.set(radius * 2, radius * 2, radius * 2);
    this._brushIndicator.visible = true;
  }

  /** Hide brush indicator */
  hideBrush(): void {
    if (this._brushIndicator) this._brushIndicator.visible = false;
  }

  /** Rebuild the entire terrain mesh (after resolution/size change) */
  rebuildMesh(): void {
    this._rebuildMesh();
  }

  /** Update only vertex heights (fast path for sculpting) */
  refreshHeights(): void {
    this._updateHeights();
  }

  /** Get flat vertex/index arrays for physics trimesh collider */
  getCollisionGeometry(): { vertices: Float32Array; indices: Uint32Array } | null {
    if (!this._terrainMesh) return null;
    const geo = this._terrainMesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    if (!pos) return null;

    const vertices = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      vertices[i * 3] = pos.getX(i) + this.group.position.x;
      vertices[i * 3 + 1] = pos.getY(i) + this.group.position.y;
      vertices[i * 3 + 2] = pos.getZ(i) + this.group.position.z;
    }

    let indices: Uint32Array;
    if (geo.index) {
      indices = new Uint32Array(geo.index.array);
    } else {
      indices = new Uint32Array(pos.count);
      for (let i = 0; i < pos.count; i++) indices[i] = i;
    }

    return { vertices, indices };
  }

  /** Serialize terrain data for saving */
  override serialize(): SceneActorJSON {
    const base = super.serialize();
    // Embed terrain data in properties
    base.properties._terrainData = TerrainActor._serializeTerrainData(this._terrainData);
    return base;
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'sizeX', label: 'Size X', group: 'Terrain', type: 'number', min: 10, max: 10000, step: 10, value: this._terrainData.sizeX },
      { key: 'sizeZ', label: 'Size Z', group: 'Terrain', type: 'number', min: 10, max: 10000, step: 10, value: this._terrainData.sizeZ },
      { key: 'maxHeight', label: 'Max Height', group: 'Terrain', type: 'number', min: 1, max: 5000, step: 1, value: this._terrainData.maxHeight },
      { key: 'resolution', label: 'Resolution', group: 'Terrain', type: 'number', min: 17, max: 513, step: 16, value: this._terrainData.resolution },
      { key: 'hasCollision', label: 'Has Collision', group: 'Physics', type: 'boolean', value: this._terrainData.hasCollision },
      { key: 'layerCount', label: 'Layers', group: 'Materials', type: 'number', min: 0, max: 4, step: 1, value: this._terrainData.layers.length },
    ];
  }

  dispose(): void {
    this._disposeMesh();
    this._disposeBrushIndicator();
  }

  // ---- Internal ----

  private _createMesh(): void {
    if (!this._scene) return;

    const geo = TerrainMeshBuilder.buildGeometry(this._terrainData);

    // Provide texture resolver so splatmap material can load real textures
    const resolveTexture = (materialAssetId: string): THREE.Texture | null => {
      const mgr = MeshAssetManager.getInstance();
      if (!mgr) return null;
      const matAsset = mgr.getMaterial(materialAssetId);
      if (!matAsset) return null;
      const texId = matAsset.materialData.baseColorMap;
      if (!texId) {
        // No texture — generate a solid-color texture from baseColor
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = matAsset.materialData.baseColor || '#888';
        ctx.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
      }
      const texAsset = mgr.getTexture(texId);
      if (!texAsset || !texAsset.dataUrl) return null;
      const loader = new THREE.TextureLoader();
      const tex = loader.load(texAsset.dataUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };

    const mat = TerrainMeshBuilder.buildSplatMaterial(this._terrainData, resolveTexture);

    this._terrainMesh = new THREE.Mesh(geo, mat);
    this._terrainMesh.receiveShadow = true;
    this._terrainMesh.castShadow = true;
    this._terrainMesh.userData.__isSceneCompositionHelper = true;
    this._terrainMesh.userData.__isTerrainMesh = true;
    this.group.add(this._terrainMesh);
  }

  private _createBrushIndicator(): void {
    const geo = new THREE.RingGeometry(0.45, 0.5, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });
    this._brushIndicator = new THREE.Mesh(geo, mat);
    this._brushIndicator.rotation.x = -Math.PI / 2;
    this._brushIndicator.visible = false;
    this._brushIndicator.renderOrder = 999;
    this._brushIndicator.userData.__isSceneCompositionHelper = true;
    this._brushIndicator.raycast = () => {};
    this.group.add(this._brushIndicator);
  }

  private _updateHeights(): void {
    if (!this._terrainMesh) return;
    TerrainMeshBuilder.updateHeights(this._terrainMesh.geometry, this._terrainData);
    this._terrainMesh.geometry.attributes.position.needsUpdate = true;
    this._terrainMesh.geometry.computeVertexNormals();
    this._terrainMesh.geometry.computeBoundingBox();
    this._terrainMesh.geometry.computeBoundingSphere();

    // Update properties
    this.properties.sizeX = this._terrainData.sizeX;
    this.properties.sizeZ = this._terrainData.sizeZ;
    this.properties.maxHeight = this._terrainData.maxHeight;
    this.properties.resolution = this._terrainData.resolution;
  }

  private _rebuildMesh(): void {
    this._disposeMesh();
    this._createMesh();
  }

  private _disposeMesh(): void {
    if (this._terrainMesh) {
      this.group.remove(this._terrainMesh);
      this._terrainMesh.geometry.dispose();
      if (Array.isArray(this._terrainMesh.material)) {
        this._terrainMesh.material.forEach(m => m.dispose());
      } else {
        (this._terrainMesh.material as THREE.Material).dispose();
      }
      this._terrainMesh = null;
    }
    if (this._devTexture) {
      this._devTexture.dispose();
      this._devTexture = null;
    }
  }

  private _disposeBrushIndicator(): void {
    if (this._brushIndicator) {
      this.group.remove(this._brushIndicator);
      this._brushIndicator.geometry.dispose();
      (this._brushIndicator.material as THREE.Material).dispose();
      this._brushIndicator = null;
    }
  }

  // ---- Serialization helpers ----

  private static _serializeTerrainData(data: TerrainData): any {
    const splatmaps: Record<string, number[]> = {};
    for (const [id, arr] of data.splatmaps) {
      splatmaps[id] = Array.from(arr);
    }
    return {
      resolution: data.resolution,
      sizeX: data.sizeX,
      sizeZ: data.sizeZ,
      maxHeight: data.maxHeight,
      heightmap: Array.from(data.heightmap),
      splatmaps,
      layers: data.layers,
      hasCollision: data.hasCollision,
    };
  }

  private static _deserializeTerrainData(raw: any): TerrainData {
    const resolution = raw.resolution ?? 129;
    const heightmap = new Float32Array(raw.heightmap ?? new Array(resolution * resolution).fill(0));

    const splatmaps = new Map<string, Float32Array>();
    if (raw.splatmaps) {
      for (const [id, arr] of Object.entries(raw.splatmaps)) {
        splatmaps.set(id, new Float32Array(arr as number[]));
      }
    }

    return {
      resolution,
      sizeX: raw.sizeX ?? 200,
      sizeZ: raw.sizeZ ?? 200,
      maxHeight: raw.maxHeight ?? 100,
      heightmap,
      splatmaps,
      layers: raw.layers ?? [],
      hasCollision: raw.hasCollision ?? true,
    };
  }
}

// ============================================================
//  7. PLAYER START
// ============================================================

export class PlayerStartActor extends BaseSceneActor {
  readonly type: SceneActorType = 'PlayerStart';
  private _editorVisuals: THREE.Object3D[] = [];

  constructor(id: string, name: string, props: Record<string, any> = {}) {
    super(id, name);
    this.group.userData.__sceneActorType = 'PlayerStart';
    this.group.userData.actorType = 'PlayerStart';

    this.properties = {
      playerTag: props.playerTag ?? 'default',
      isDefault: props.isDefault ?? true,
    };

    // Apply initial position from legacy props
    if (props.positionX != null) this.group.position.x = props.positionX;
    if (props.positionY != null) this.group.position.y = props.positionY;
    if (props.positionZ != null) this.group.position.z = props.positionZ;
    if (props.yaw != null) this.group.rotation.y = THREE.MathUtils.degToRad(props.yaw);

    this._createVisuals();
  }

  getGizmoCapabilities(): GizmoCapability[] {
    return ['translate', 'rotate'];
  }

  private _createVisuals(): void {
    const capsuleGeo = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
    const capsuleMat = new THREE.MeshBasicMaterial({ color: 0x00cc66, transparent: true, opacity: 0.35, wireframe: true });
    const capsule = new THREE.Mesh(capsuleGeo, capsuleMat);
    capsule.position.y = 0.7;
    capsule.raycast = () => {};
    this.group.add(capsule);
    this._editorVisuals.push(capsule);

    const ringGeo = new THREE.RingGeometry(0.35, 0.45, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    ring.raycast = () => {};
    this.group.add(ring);
    this._editorVisuals.push(ring);

    const arrowDir = new THREE.Vector3(0, 0, 1);
    const arrowOrigin = new THREE.Vector3(0, 0.7, 0);
    const arrow = new THREE.ArrowHelper(arrowDir, arrowOrigin, 1.2, 0x00ff88, 0.25, 0.15);
    arrow.raycast = () => {};
    this.group.add(arrow);
    this._editorVisuals.push(arrow);

    const upArrowGeo = new THREE.ConeGeometry(0.12, 0.35, 8);
    const upArrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.8 });
    const upArrow = new THREE.Mesh(upArrowGeo, upArrowMat);
    upArrow.position.y = 1.4;
    upArrow.raycast = () => {};
    this.group.add(upArrow);
    this._editorVisuals.push(upArrow);

    this.group.traverse((child) => {
      child.userData.__isSceneCompositionHelper = true;
    });

    // Invisible hit mesh for viewport selection
    this._createHitMesh(0.8, 0.7);
  }

  setEditorVisible(visible: boolean): void {
    for (const v of this._editorVisuals) v.visible = visible;
  }

  getSpawnTransform(): { position: THREE.Vector3; rotationY: number } {
    return {
      position: this.group.position.clone(),
      rotationY: this.group.rotation.y,
    };
  }

  addToScene(scene: THREE.Scene): void { scene.add(this.group); }
  removeFromScene(scene: THREE.Scene): void { scene.remove(this.group); }
  setVisible(visible: boolean): void { this.group.visible = visible; }

  updateProperty(key: string, value: any): void {
    this.properties[key] = value;
  }

  getPropertyDescriptors(): PropertyDescriptor[] {
    return [
      { key: 'playerTag', label: 'Player Tag', group: 'Spawn', type: 'select', value: this.properties.playerTag, options: [
        { label: 'Default', value: 'default' },
        { label: 'Player 1', value: 'player1' },
        { label: 'Player 2', value: 'player2' },
      ]},
      { key: 'isDefault', label: 'Is Default', group: 'Spawn', type: 'boolean', value: this.properties.isDefault },
    ];
  }

  dispose(): void {
    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).geometry?.dispose();
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      }
    });
  }
}

// ---- Icon mapping utility ----

export function getSceneActorIcon(type: SceneActorType | string): string {
  const icons: Record<string, string> = {
    DirectionalLight: '\u{1F4A1}',
    SkyAtmosphere: '\u{1F30C}',
    SkyLight: '\u{1F324}',
    ExponentialHeightFog: '\u{1F32B}',
    PostProcessVolume: '\u{1F4F7}',
    WorldGrid: '\u{1F532}',
    DevGroundPlane: '\u{1F7EB}',
    Terrain: '\u{26F0}',
    PlayerStart: '\u{1F680}',
  };
  return icons[type] || '\u{1F4E6}';
}
