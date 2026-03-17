// ============================================================
//  TerrainShaderMaterial — Custom Three.js ShaderMaterial
//  for multi-layer splatmap-based terrain rendering.
//
//  Supports up to 8 texture layers (2 RGBA splatmap textures).
//  Each layer can have an albedo + normal map with independent
//  tiling, roughness, and metalness values.
//
//  Receives scene lighting via Three.js lights uniform injection.
// ============================================================

import * as THREE from 'three';
import type { TerrainLayerDef } from './TerrainData';

// ============================================================
//  Vertex Shader
// ============================================================

const terrainVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// ============================================================
//  Fragment Shader — Multi-layer splatmap blending
// ============================================================

const terrainFragmentShader = /* glsl */ `
  // Scene lighting (injected by Three.js or set manually)
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;

  // Splatmap textures (up to 2 for 8 layers)
  uniform sampler2D uSplatMap0;
  uniform sampler2D uSplatMap1;
  uniform bool uHasSplatMap1;

  // Layer textures — albedo (up to 8)
  uniform sampler2D uAlbedo0;
  uniform sampler2D uAlbedo1;
  uniform sampler2D uAlbedo2;
  uniform sampler2D uAlbedo3;
  uniform sampler2D uAlbedo4;
  uniform sampler2D uAlbedo5;
  uniform sampler2D uAlbedo6;
  uniform sampler2D uAlbedo7;

  // Layer tiling (vec2 per layer — u,v)
  uniform vec2 uTiling0;
  uniform vec2 uTiling1;
  uniform vec2 uTiling2;
  uniform vec2 uTiling3;
  uniform vec2 uTiling4;
  uniform vec2 uTiling5;
  uniform vec2 uTiling6;
  uniform vec2 uTiling7;

  // Layer PBR
  uniform float uRoughness0;
  uniform float uRoughness1;
  uniform float uRoughness2;
  uniform float uRoughness3;
  uniform float uRoughness4;
  uniform float uRoughness5;
  uniform float uRoughness6;
  uniform float uRoughness7;

  // Number of active layers
  uniform int uLayerCount;

  // Brush overlay
  uniform bool uShowBrush;
  uniform vec3 uBrushCenter;
  uniform float uBrushRadius;
  uniform vec3 uBrushColor;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  vec3 sampleLayer(int idx, vec2 uv) {
    if (idx == 0) return texture2D(uAlbedo0, uv * uTiling0).rgb;
    if (idx == 1) return texture2D(uAlbedo1, uv * uTiling1).rgb;
    if (idx == 2) return texture2D(uAlbedo2, uv * uTiling2).rgb;
    if (idx == 3) return texture2D(uAlbedo3, uv * uTiling3).rgb;
    if (idx == 4) return texture2D(uAlbedo4, uv * uTiling4).rgb;
    if (idx == 5) return texture2D(uAlbedo5, uv * uTiling5).rgb;
    if (idx == 6) return texture2D(uAlbedo6, uv * uTiling6).rgb;
    if (idx == 7) return texture2D(uAlbedo7, uv * uTiling7).rgb;
    return vec3(0.5);
  }

  float getLayerRoughness(int idx) {
    if (idx == 0) return uRoughness0;
    if (idx == 1) return uRoughness1;
    if (idx == 2) return uRoughness2;
    if (idx == 3) return uRoughness3;
    if (idx == 4) return uRoughness4;
    if (idx == 5) return uRoughness5;
    if (idx == 6) return uRoughness6;
    if (idx == 7) return uRoughness7;
    return 0.8;
  }

  void main() {
    // Sample splatmaps
    vec4 splat0 = texture2D(uSplatMap0, vUv);
    vec4 splat1 = uHasSplatMap1 ? texture2D(uSplatMap1, vUv) : vec4(0.0);

    // Weights array
    float weights[8];
    weights[0] = splat0.r;
    weights[1] = splat0.g;
    weights[2] = splat0.b;
    weights[3] = splat0.a;
    weights[4] = splat1.r;
    weights[5] = splat1.g;
    weights[6] = splat1.b;
    weights[7] = splat1.a;

    // Blend layers
    vec3 albedo = vec3(0.0);
    float roughness = 0.0;
    float totalWeight = 0.0;

    for (int i = 0; i < 8; i++) {
      if (i >= uLayerCount) break;
      float w = weights[i];
      if (w < 0.001) continue;
      albedo += sampleLayer(i, vUv) * w;
      roughness += getLayerRoughness(i) * w;
      totalWeight += w;
    }

    // Normalize
    if (totalWeight > 0.001) {
      albedo /= totalWeight;
      roughness /= totalWeight;
    } else {
      albedo = vec3(0.3, 0.5, 0.2); // Default green
      roughness = 0.85;
    }

    // Simple directional lighting
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uSunDirection);
    float NdotL = max(dot(N, L), 0.0);

    vec3 diffuse = albedo * uSunColor * uSunIntensity * NdotL;
    vec3 ambient = albedo * uAmbientColor * uAmbientIntensity;

    // Simple roughness-based specular falloff
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), mix(4.0, 64.0, 1.0 - roughness));
    vec3 specular = uSunColor * spec * 0.2 * (1.0 - roughness);

    vec3 color = diffuse + ambient + specular;

    // Brush overlay
    if (uShowBrush) {
      float dist = length(vWorldPosition.xz - uBrushCenter.xz);
      float brushEdge = smoothstep(uBrushRadius, uBrushRadius - 0.3, dist);
      float brushRing = smoothstep(uBrushRadius - 0.15, uBrushRadius, dist) * brushEdge;
      color = mix(color, uBrushColor, brushRing * 0.6);
      color = mix(color, uBrushColor, brushEdge * 0.08);
    }

    // Gamma-ish output
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================
//  Material Class
// ============================================================

/** 1×1 white pixel texture (placeholder for empty layer slots) */
function createWhiteTexture(): THREE.DataTexture {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/** 64×64 gray checkerboard texture — used as the default terrain appearance */
export function createDefaultGrayTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const lightGray = 140;
  const darkGray = 100;
  const squareSize = 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / squareSize);
      const cy = Math.floor(y / squareSize);
      const bright = (cx + cy) % 2 === 0 ? lightGray : darkGray;
      const idx = (y * size + x) * 4;
      data[idx] = bright;
      data[idx + 1] = bright;
      data[idx + 2] = bright;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export class TerrainShaderMaterial extends THREE.ShaderMaterial {
  private _whiteTex: THREE.DataTexture;
  private _splatTex0: THREE.DataTexture | null = null;
  private _splatTex1: THREE.DataTexture | null = null;
  private _layerTextures: (THREE.Texture | null)[] = new Array(8).fill(null);
  private _resolution: number;

  constructor(resolution: number) {
    const whiteTex = createWhiteTexture();

    super({
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      uniforms: {
        // Lighting
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.95, 0.9) },
        uSunIntensity: { value: 1.2 },
        uAmbientColor: { value: new THREE.Color(0.6, 0.7, 0.9) },
        uAmbientIntensity: { value: 0.4 },

        // Splatmaps
        uSplatMap0: { value: null },
        uSplatMap1: { value: null },
        uHasSplatMap1: { value: false },

        // Albedo layers
        uAlbedo0: { value: whiteTex },
        uAlbedo1: { value: whiteTex },
        uAlbedo2: { value: whiteTex },
        uAlbedo3: { value: whiteTex },
        uAlbedo4: { value: whiteTex },
        uAlbedo5: { value: whiteTex },
        uAlbedo6: { value: whiteTex },
        uAlbedo7: { value: whiteTex },

        // Tiling
        uTiling0: { value: new THREE.Vector2(10, 10) },
        uTiling1: { value: new THREE.Vector2(10, 10) },
        uTiling2: { value: new THREE.Vector2(10, 10) },
        uTiling3: { value: new THREE.Vector2(10, 10) },
        uTiling4: { value: new THREE.Vector2(10, 10) },
        uTiling5: { value: new THREE.Vector2(10, 10) },
        uTiling6: { value: new THREE.Vector2(10, 10) },
        uTiling7: { value: new THREE.Vector2(10, 10) },

        // Roughness
        uRoughness0: { value: 0.85 },
        uRoughness1: { value: 0.85 },
        uRoughness2: { value: 0.85 },
        uRoughness3: { value: 0.85 },
        uRoughness4: { value: 0.85 },
        uRoughness5: { value: 0.85 },
        uRoughness6: { value: 0.85 },
        uRoughness7: { value: 0.85 },

        // Layer count
        uLayerCount: { value: 1 },

        // Brush
        uShowBrush: { value: false },
        uBrushCenter: { value: new THREE.Vector3(0, 0, 0) },
        uBrushRadius: { value: 5.0 },
        uBrushColor: { value: new THREE.Color(0.2, 1.0, 0.4) },
      },
      side: THREE.FrontSide,
    });

    this._whiteTex = whiteTex;
    this._resolution = resolution;
  }

  // ---- Splatmap upload ----

  /** Upload splatmap data (RGBA Uint8Array) to the GPU */
  uploadSplatmap(index: 0 | 1, data: Uint8Array, resolution: number): void {
    const existing = index === 0 ? this._splatTex0 : this._splatTex1;
    if (existing) {
      // Update in place
      existing.image.data.set(data);
      existing.needsUpdate = true;
    } else {
      const tex = new THREE.DataTexture(
        data.slice(), // clone to avoid shared buffer issues
        resolution,
        resolution,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      // flipY = true so data row 0 (gz=0, worldZ=-halfZ) maps to the
      // top of the texture (v=1), matching the PlaneGeometry UV layout
      // where vertex row 0 has UV.y = 1.
      tex.flipY = true;
      tex.needsUpdate = true;

      if (index === 0) {
        this._splatTex0 = tex;
        this.uniforms.uSplatMap0.value = tex;
      } else {
        this._splatTex1 = tex;
        this.uniforms.uSplatMap1.value = tex;
        this.uniforms.uHasSplatMap1.value = true;
      }
    }
  }

  /** Quick re-upload of dirty splatmap region (just marks needsUpdate) */
  markSplatmapDirty(index: 0 | 1): void {
    const tex = index === 0 ? this._splatTex0 : this._splatTex1;
    if (tex) tex.needsUpdate = true;
  }

  // ---- Layer configuration ----

  /** Update layer count and per-layer uniforms from layer definitions */
  setLayers(layers: TerrainLayerDef[], textureCache: Map<string, THREE.Texture>): void {
    this.uniforms.uLayerCount.value = layers.length;

    for (let i = 0; i < 8; i++) {
      const layer = layers[i];
      const tilingKey = `uTiling${i}` as keyof typeof this.uniforms;
      const roughnessKey = `uRoughness${i}` as keyof typeof this.uniforms;
      const albedoKey = `uAlbedo${i}` as keyof typeof this.uniforms;

      if (layer) {
        (this.uniforms as any)[tilingKey].value.set(layer.tilingU, layer.tilingV);
        (this.uniforms as any)[roughnessKey].value = layer.roughness;

        // Set albedo texture
        const tex = layer.albedoTextureId ? textureCache.get(layer.albedoTextureId) : null;
        (this.uniforms as any)[albedoKey].value = tex || this._whiteTex;
        this._layerTextures[i] = tex || null;
      } else {
        (this.uniforms as any)[albedoKey].value = this._whiteTex;
        this._layerTextures[i] = null;
      }
    }
  }

  /** Update a single layer's albedo texture */
  setLayerTexture(index: number, texture: THREE.Texture | null): void {
    if (index < 0 || index > 7) return;
    const key = `uAlbedo${index}`;
    (this.uniforms as any)[key].value = texture || this._whiteTex;
    this._layerTextures[index] = texture;
  }

  // ---- Lighting sync ----

  /** Sync sun direction/color from the scene's directional light */
  setSunLight(direction: THREE.Vector3, color: THREE.Color, intensity: number): void {
    this.uniforms.uSunDirection.value.copy(direction);
    this.uniforms.uSunColor.value.copy(color);
    this.uniforms.uSunIntensity.value = intensity;
  }

  setAmbientLight(color: THREE.Color, intensity: number): void {
    this.uniforms.uAmbientColor.value.copy(color);
    this.uniforms.uAmbientIntensity.value = intensity;
  }

  // ---- Brush overlay ----

  showBrush(center: THREE.Vector3, radius: number, color?: THREE.Color): void {
    this.uniforms.uShowBrush.value = true;
    this.uniforms.uBrushCenter.value.copy(center);
    this.uniforms.uBrushRadius.value = radius;
    if (color) this.uniforms.uBrushColor.value.copy(color);
  }

  hideBrush(): void {
    this.uniforms.uShowBrush.value = false;
  }

  // ---- Cleanup ----

  dispose(): void {
    this._whiteTex.dispose();
    this._splatTex0?.dispose();
    this._splatTex1?.dispose();
    super.dispose();
  }
}
