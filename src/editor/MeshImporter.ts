// ============================================================
//  MeshImporter — Core 3D mesh import pipeline
//  Professional-grade import system matching Unreal Engine's
//  asset import pipeline, optimized for Three.js best practices.
//
//  Pipeline: Load → Validate → Transform → Geometry →
//    Skeleton → Sockets → Animations → LODs →
//    Collision → Materials/Textures → Package
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type {
  MeshAssetJSON, MeshAssetType, MeshImportSettings, MeshDataJSON,
  MaterialAssetJSON, TextureAssetJSON, AnimationAssetJSON,
  SkeletonAssetJSON, BoneData, AnimationTrackData,
  BoundingBoxData, ImportMeshFormat, FileDetectionResult,
  ImportReportJSON, LODDataJSON, CollisionDataJSON,
  SocketDefinition,
} from './MeshAsset';
import { getImportFormat, defaultImportSettings, suggestPreset, suggestPrefix } from './MeshAsset';
import { generateLODs } from './LODGenerator';
import { generateCollision } from './CollisionGenerator';

// ── ID generation ──
let _importCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_importCounter).toString(36)}`;
}

// ── Result of a full import ──

export interface ImportResult {
  meshAsset: MeshAssetJSON;
  materials: MaterialAssetJSON[];
  textures: TextureAssetJSON[];
  animations: AnimationAssetJSON[];
  report: ImportReportJSON;
}

// ── Progress callback ──

export interface ImportProgress {
  (step: number, totalSteps: number, message: string): void;
}

// ── Helper: Read File as ArrayBuffer ──

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

// ── Helper: THREE.js color → hex string ──

function colorToHex(c: THREE.Color): string {
  return '#' + c.getHexString();
}

// ── Helper: check power of two ──

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// ── Helper: generate thumbnail from Three.js scene ──

function generateThumbnail(scene: THREE.Object3D, size = 256): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x1a1a2e, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const thumbScene = new THREE.Scene();
  thumbScene.background = new THREE.Color(0x1a1a2e);

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  thumbScene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(3, 5, 4);
  thumbScene.add(dir);
  const back = new THREE.DirectionalLight(0x6688cc, 0.3);
  back.position.set(-2, 3, -3);
  thumbScene.add(back);

  // Clone the imported scene to avoid modifying the original
  const clone = scene.clone();
  thumbScene.add(clone);

  // Compute bounding box to center & fit
  const box = new THREE.Box3().setFromObject(clone);
  const center = box.getCenter(new THREE.Vector3());
  const bSize = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(bSize.x, bSize.y, bSize.z) || 1;

  // Center the object
  clone.position.sub(center);

  // Camera setup — orthographic-like perspective
  const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  const dist = maxDim * 1.8;
  cam.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
  cam.lookAt(0, 0, 0);

  renderer.render(thumbScene, cam);

  const dataUrl = renderer.domElement.toDataURL('image/png');

  // Cleanup
  renderer.dispose();

  return dataUrl;
}

// ── Helper: export Three.js scene to GLB binary (base64) ──

/**
 * Convert a raw-data texture image ({ data, width, height } from FBXLoader)
 * into a canvas element that GLTFExporter can handle.
 * Returns the canvas, or null if conversion failed.
 */
function rawTextureToCanvas(img: any): HTMLCanvasElement | null {
  try {
    const w: number = img.width;
    const h: number = img.height;
    if (!w || !h || !img.data) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let pixelData: Uint8ClampedArray;
    if (img.data instanceof Uint8ClampedArray) {
      pixelData = img.data;
    } else {
      pixelData = new Uint8ClampedArray(img.data as ArrayLike<number>);
    }

    // Expand RGB → RGBA if needed
    if (pixelData.length === w * h * 3) {
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let px = 0; px < w * h; px++) {
        rgba[px * 4]     = pixelData[px * 3];
        rgba[px * 4 + 1] = pixelData[px * 3 + 1];
        rgba[px * 4 + 2] = pixelData[px * 3 + 2];
        rgba[px * 4 + 3] = 255;
      }
      pixelData = rgba;
    }

    // Ensure we have exactly RGBA (4 channels)
    if (pixelData.length !== w * h * 4) return null;

    const imgData = new ImageData(pixelData as unknown as Uint8ClampedArray<ArrayBuffer>, w, h);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  } catch (_e) {
    return null;
  }
}

/**
 * All known texture slot names across every THREE.js material type:
 * MeshStandardMaterial, MeshPhongMaterial, MeshLambertMaterial,
 * MeshBasicMaterial, MeshPhysicalMaterial, MeshToonMaterial, etc.
 */
const ALL_TEXTURE_SLOTS = [
  'map', 'normalMap', 'metalnessMap', 'roughnessMap',
  'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap',
  'displacementMap', 'envMap', 'lightMap', 'specularMap',
  'gradientMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap',
  'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap',
  'specularIntensityMap', 'specularColorMap',
];

/**
 * Convert raw-data textures (from FBXLoader/etc) to canvas-backed textures
 * that GLTFExporter can process without crashing.
 *
 * Scans ALL known texture slots plus any own properties, covering every
 * material type (MeshPhongMaterial, MeshStandardMaterial, etc.).
 */
function sanitizeTexturesForExport(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of mats) {
      // Combine explicit known slots + own property keys for maximum coverage
      const keysToCheck = new Set<string>(ALL_TEXTURE_SLOTS);
      for (const k of Object.keys(mat)) keysToCheck.add(k);

      for (const key of keysToCheck) {
        const val = (mat as any)[key];
        if (!val) continue;
        // Check if this property is a THREE.Texture (has isTexture flag)
        if (!val.isTexture) continue;

        const tex = val as THREE.Texture;
        if (!tex.image) {
          // Texture with no image at all — remove it to prevent GLTFExporter crash
          console.warn(`[MeshImport] Texture on "${key}" has null image, removing`);
          (mat as any)[key] = null;
          continue;
        }

        const img = tex.image as any;

        // Already a valid image source for GLTFExporter
        if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || img instanceof ImageBitmap || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)) continue;

        // Raw data texture (e.g. from FBXLoader) — convert to canvas
        const canvas = rawTextureToCanvas(img);
        if (canvas) {
          tex.image = canvas;
          tex.needsUpdate = true;
        } else {
          // Conversion failed — remove the texture to prevent GLTFExporter crash
          console.warn(`[MeshImport] Could not convert raw texture on "${key}", removing`);
          (mat as any)[key] = null;
        }
      }
    }
  });
}

async function exportToGLBBase64(scene: THREE.Object3D, animations: THREE.AnimationClip[]): Promise<string> {
  // Sanitize textures so GLTFExporter doesn't crash on raw data textures
  sanitizeTexturesForExport(scene);

  const exporter = new GLTFExporter();

  const doExport = (): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => resolve(result as ArrayBuffer),
        (error) => reject(error),
        { binary: true, animations },
      );
    });
  };

  let glb: ArrayBuffer;
  try {
    glb = await doExport();
  } catch (err: any) {
    // If the export fails due to texture issues, strip ALL textures and retry
    const msg = err?.message ?? String(err);
    if (msg.includes('image') || msg.includes('texture') || msg.includes('Texture')) {
      console.warn('[MeshImport] GLTFExporter failed with texture error, stripping all textures and retrying:', msg);
      scene.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const keysToCheck = new Set<string>(ALL_TEXTURE_SLOTS);
          for (const k of Object.keys(mat)) keysToCheck.add(k);
          for (const key of keysToCheck) {
            const val = (mat as any)[key];
            if (val && val.isTexture) {
              (mat as any)[key] = null;
            }
          }
        }
      });
      glb = await doExport();
    } else {
      throw err;
    }
  }

  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(glb);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Extract materials from Three.js scene ──

function extractMaterials(
  scene: THREE.Object3D,
  meshAssetId: string,
  textures: Map<string, TextureAssetJSON>,
  settings: MeshImportSettings,
): MaterialAssetJSON[] {
  const materials: MaterialAssetJSON[] = [];
  const seen = new Set<string | number>(); // material uuid

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of mats) {
      const matUuid = (mat as any).uuid ?? (mat as any).id ?? materials.length;
      if (seen.has(matUuid)) continue;
      seen.add(matUuid);

      const matId = genId('mat');
      const stdMat = mat as THREE.MeshStandardMaterial;

      const getTexId = (tex: THREE.Texture | null): string | null => {
        if (!tex) return null;
        for (const [, texAsset] of textures) {
          if (texAsset.assetName === tex.name || texAsset.assetId === (tex as any).__importTexId) {
            return texAsset.assetId;
          }
        }
        return null;
      };

      // Determine material type string
      let matType: 'PBR' | 'Basic' | 'Phong' = 'PBR';
      if (settings.materialWorkflow === 'legacy') matType = 'Phong';

      const matName = mat.name || `Material_${materials.length}`;
      const prefix = settings.autoGenerateSubNames ? 'M_' : '';

      materials.push({
        assetId: matId,
        assetName: prefix + matName,
        meshAssetId,
        materialData: {
          type: matType,
          baseColor: stdMat.color ? colorToHex(stdMat.color) : '#ffffff',
          metalness: stdMat.metalness ?? 0,
          roughness: stdMat.roughness ?? 0.8,
          emissive: stdMat.emissive ? colorToHex(stdMat.emissive) : '#000000',
          emissiveIntensity: stdMat.emissiveIntensity ?? 0,
          opacity: stdMat.opacity ?? 1,
          doubleSided: stdMat.side === THREE.DoubleSide,
          alphaMode: stdMat.transparent ? 'BLEND' : 'OPAQUE',
          baseColorMap: getTexId(stdMat.map),
          normalMap: getTexId(stdMat.normalMap),
          metallicRoughnessMap: getTexId(stdMat.metalnessMap || stdMat.roughnessMap),
          emissiveMap: getTexId(stdMat.emissiveMap),
          occlusionMap: getTexId(stdMat.aoMap),
        },
      });
    }
  });

  return materials;
}

// ── Extract textures from Three.js scene ──

function extractTextures(
  scene: THREE.Object3D,
  meshAssetId: string,
  settings: MeshImportSettings,
): TextureAssetJSON[] {
  const textures: TextureAssetJSON[] = [];
  const seen = new Set<number>(); // texture.id

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of mats) {
      // Scan ALL material properties for textures (works with Phong, Lambert, Standard, etc.)
      for (const key of Object.keys(mat)) {
        const tex = (mat as any)[key] as THREE.Texture | null;
        if (!tex || !tex.isTexture || seen.has(tex.id)) continue;
        seen.add(tex.id);

        const texId = genId('tex');
        (tex as any).__importTexId = texId;

        // Try to extract image data
        let dataUrl = '';
        let width = 0;
        let height = 0;

        if (tex.image) {
          const imgSource = tex.image as any;
          let srcWidth = 0;
          let srcHeight = 0;
          let drawable: CanvasImageSource | null = null;

          if (imgSource instanceof HTMLImageElement || imgSource instanceof HTMLCanvasElement || imgSource instanceof ImageBitmap) {
            srcWidth = imgSource.width || 256;
            srcHeight = imgSource.height || 256;
            drawable = imgSource;
          } else {
            // Try raw data texture conversion (FBX / DataTexture)
            const rawCanvas = rawTextureToCanvas(imgSource);
            if (rawCanvas) {
              srcWidth = rawCanvas.width;
              srcHeight = rawCanvas.height;
              drawable = rawCanvas;
            }
          }

          if (drawable && srcWidth > 0 && srcHeight > 0) {
            // Apply texture resolution setting
            let targetWidth = srcWidth;
            let targetHeight = srcHeight;
            if (settings.textureResolution !== 'original') {
              const maxRes = parseInt(settings.textureResolution);
              targetWidth = Math.min(srcWidth, maxRes);
              targetHeight = Math.min(srcHeight, maxRes);
            }

            // Convert to power of two if needed
            if (settings.convertPowerOfTwo) {
              targetWidth = nearestPowerOfTwo(targetWidth);
              targetHeight = nearestPowerOfTwo(targetHeight);
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            width = targetWidth;
            height = targetHeight;
            const ctx2d = canvas.getContext('2d')!;
            ctx2d.drawImage(drawable, 0, 0, targetWidth, targetHeight);
            dataUrl = canvas.toDataURL('image/png');
          }
        }

        const texName = tex.name || `Texture_${textures.length}`;
        const prefix = settings.autoGenerateSubNames ? 'T_' : '';

        textures.push({
          assetId: texId,
          assetName: prefix + texName,
          meshAssetId,
          dataUrl,
          textureData: { width, height, format: 'RGBA' },
        });
      }
    }
  });

  return textures;
}

function nearestPowerOfTwo(n: number): number {
  return Math.pow(2, Math.round(Math.log2(n)));
}

// ── Extract skeleton ──

function extractSkeleton(
  scene: THREE.Object3D,
  settings: MeshImportSettings,
): SkeletonAssetJSON | null {
  let foundSkeleton: THREE.Skeleton | null = null;

  scene.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh && !foundSkeleton) {
      foundSkeleton = (child as THREE.SkinnedMesh).skeleton;
    }
  });

  if (!foundSkeleton) return null;

  const skel = foundSkeleton as THREE.Skeleton;
  const bones: BoneData[] = [];
  for (let i = 0; i < skel.bones.length; i++) {
    const bone = skel.bones[i];
    const parentIndex = bone.parent ? skel.bones.indexOf(bone.parent as THREE.Bone) : -1;

    let boneName = bone.name || `Bone_${i}`;
    // Convert bone names if setting is enabled
    if (settings.convertBoneNames) {
      boneName = boneName.replace(/\s+/g, '_');
    }

    // Skip end/leaf bones if setting is enabled
    if (settings.removeEndBones) {
      const hasChildren = skel.bones.some(b => b.parent === bone);
      if (!hasChildren && boneName.toLowerCase().includes('end')) continue;
    }

    bones.push({
      name: boneName,
      parentIndex,
      position: { x: bone.position.x, y: bone.position.y, z: bone.position.z },
      rotation: { x: bone.quaternion.x, y: bone.quaternion.y, z: bone.quaternion.z, w: bone.quaternion.w },
      scale: { x: bone.scale.x, y: bone.scale.y, z: bone.scale.z },
    });
  }

  // Auto-detect sockets
  let sockets: SocketDefinition[] | undefined;
  if (settings.sockets.autoDetectSockets) {
    sockets = autoDetectSockets(bones, settings);
  }

  return {
    assetId: genId('skel'),
    assetName: `${settings.assetName}_Skeleton`,
    bones,
    boneCount: bones.length,
    sockets,
  };
}

// ── Socket auto-detection ──

const SOCKET_PATTERNS: Record<string, string[]> = {
  'weapon_socket_r': ['hand_r', 'hand.r', 'righthand', 'right_hand', 'rhand'],
  'weapon_socket_l': ['hand_l', 'hand.l', 'lefthand', 'left_hand', 'lhand'],
  'head_socket': ['head', 'skull', 'cranium'],
  'spine_socket': ['spine', 'spine_01', 'spine1'],
  'foot_socket_r': ['foot_r', 'foot.r', 'rightfoot', 'right_foot', 'rfoot'],
  'foot_socket_l': ['foot_l', 'foot.l', 'leftfoot', 'left_foot', 'lfoot'],
  'back_socket': ['spine_03', 'spine3', 'upper_back', 'upperback'],
  'pelvis_socket': ['pelvis', 'hips', 'root'],
};

function autoDetectSockets(bones: BoneData[], settings: MeshImportSettings): SocketDefinition[] {
  const sockets: SocketDefinition[] = [];
  const usedBones = new Set<string>();

  for (const [socketName, patterns] of Object.entries(SOCKET_PATTERNS)) {
    for (const bone of bones) {
      const boneLower = bone.name.toLowerCase();
      if (patterns.some(p => boneLower.includes(p)) && !usedBones.has(bone.name)) {
        usedBones.add(bone.name);
        sockets.push({
          name: socketName,
          boneName: bone.name,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        });
        break;
      }
    }
  }

  // Add any custom sockets from settings
  for (const custom of settings.sockets.customSockets) {
    if (!sockets.find(s => s.name === custom.name)) {
      sockets.push(custom);
    }
  }

  return sockets;
}

// ── Extract animations ──

function extractAnimations(
  clips: THREE.AnimationClip[],
  meshAssetId: string,
  skeletonId: string | null,
  settings: MeshImportSettings,
): AnimationAssetJSON[] {
  return clips.filter(clip => {
    // Check animation overrides
    const override = settings.animation.animationOverrides[clip.name];
    if (override && !override.import) return false;
    return true;
  }).map((clip) => {
    const tracks: AnimationTrackData[] = [];

    for (const track of clip.tracks) {
      // Track names are like "BoneName.position", "BoneName.quaternion", "BoneName.scale"
      const parts = track.name.split('.');
      const boneName = parts.slice(0, -1).join('.');
      const propName = parts[parts.length - 1];

      let type: 'position' | 'rotation' | 'scale';
      if (propName === 'position') type = 'position';
      else if (propName === 'quaternion') type = 'rotation';
      else if (propName === 'scale') type = 'scale';
      else continue; // Skip unsupported tracks like morph targets for now

      let times = Array.from(track.times);
      let values = Array.from(track.values);

      // Remove redundant keys if setting is enabled
      if (settings.animation.removeRedundantKeys && times.length > 2) {
        const tolerance = settings.animation.redundantKeyTolerance;
        const filteredTimes: number[] = [times[0]];
        const valuesPerKey = type === 'rotation' ? 4 : 3;
        const filteredValues: number[] = values.slice(0, valuesPerKey);

        for (let k = 1; k < times.length - 1; k++) {
          let isRedundant = true;
          for (let v = 0; v < valuesPerKey; v++) {
            const prev = values[(k - 1) * valuesPerKey + v];
            const curr = values[k * valuesPerKey + v];
            const next = values[(k + 1) * valuesPerKey + v];
            // Check if this key is on the linear interpolation between prev and next
            const t = (times[k] - times[k - 1]) / (times[k + 1] - times[k - 1]);
            const interpolated = prev + (next - prev) * t;
            if (Math.abs(curr - interpolated) > tolerance) {
              isRedundant = false;
              break;
            }
          }
          if (!isRedundant) {
            filteredTimes.push(times[k]);
            filteredValues.push(...values.slice(k * valuesPerKey, (k + 1) * valuesPerKey));
          }
        }

        // Always keep last key
        filteredTimes.push(times[times.length - 1]);
        filteredValues.push(...values.slice((times.length - 1) * valuesPerKey));

        times = filteredTimes;
        values = filteredValues;
      }

      tracks.push({ boneName, type, times, values });
    }

    const fps = clip.tracks.length > 0 && clip.tracks[0].times.length > 1
      ? Math.round(clip.tracks[0].times.length / clip.duration)
      : 30;

    // Determine loop from overrides or auto-detect
    const override = settings.animation.animationOverrides[clip.name];
    const isLoop = override?.loop ??
      (clip.name.toLowerCase().includes('idle') ||
       clip.name.toLowerCase().includes('walk') ||
       clip.name.toLowerCase().includes('run'));

    const animName = settings.autoGenerateSubNames
      ? `Anim_${settings.assetName}_${clip.name || `Animation_${clips.indexOf(clip)}`}`
      : clip.name || `Animation_${clips.indexOf(clip)}`;

    return {
      assetId: genId('anim'),
      assetName: animName,
      meshAssetId,
      skeletonId,
      duration: clip.duration,
      fps,
      loop: isLoop,
      tracks,
    };
  });
}

// ── Compute mesh data stats ──

function computeMeshData(scene: THREE.Object3D, format: ImportMeshFormat): MeshDataJSON {
  let vertexCount = 0;
  let triangleCount = 0;
  let hasUVs = false;
  let hasNormals = false;
  let hasTangents = false;
  let hasVertexColors = false;
  let hasSkin = false;
  const morphTargets: string[] = [];

  const box = new THREE.Box3().setFromObject(scene);

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geo = mesh.geometry;

    if (geo.attributes.position) vertexCount += geo.attributes.position.count;
    if (geo.index) triangleCount += geo.index.count / 3;
    else if (geo.attributes.position) triangleCount += geo.attributes.position.count / 3;

    if (geo.attributes.uv) hasUVs = true;
    if (geo.attributes.normal) hasNormals = true;
    if (geo.attributes.tangent) hasTangents = true;
    if (geo.attributes.color) hasVertexColors = true;
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true;

    if (geo.morphAttributes) {
      for (const name of Object.keys(geo.morphAttributes)) {
        if (!morphTargets.includes(name)) morphTargets.push(name);
      }
    }
  });

  const bbMin = box.min.x === Infinity ? { x: 0, y: 0, z: 0 } : { x: box.min.x, y: box.min.y, z: box.min.z };
  const bbMax = box.max.x === -Infinity ? { x: 0, y: 0, z: 0 } : { x: box.max.x, y: box.max.y, z: box.max.z };

  return {
    format,
    vertexCount,
    triangleCount: Math.floor(triangleCount),
    boundingBox: { min: bbMin, max: bbMax },
    hasUVs,
    hasNormals,
    hasTangents,
    hasVertexColors,
    hasSkin,
    morphTargets,
  };
}

// ── Detect asset type (static vs skeletal) ──

function detectAssetType(scene: THREE.Object3D, animations: THREE.AnimationClip[], setting: 'auto' | 'staticMesh' | 'skeletalMesh'): MeshAssetType {
  if (setting === 'staticMesh') return 'staticMesh';
  if (setting === 'skeletalMesh') return 'skeletalMesh';

  // Auto-detect
  let hasSkin = false;
  scene.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true;
  });

  if (hasSkin || animations.length > 0) return 'skeletalMesh';
  return 'staticMesh';
}

// ── Apply import settings (scale, offset, rotation) ──

function applyImportTransform(scene: THREE.Object3D, settings: MeshImportSettings): void {
  // Apply unit conversion
  let scaleFactor = settings.scale;
  switch (settings.unit) {
    case 'centimeters': scaleFactor *= 0.01; break;
    case 'millimeters': scaleFactor *= 0.001; break;
  }

  if (scaleFactor !== 1.0) {
    scene.scale.multiplyScalar(scaleFactor);
  }
  if (settings.positionOffset.x || settings.positionOffset.y || settings.positionOffset.z) {
    scene.position.set(settings.positionOffset.x, settings.positionOffset.y, settings.positionOffset.z);
  }
  if (settings.rotationOffset.x || settings.rotationOffset.y || settings.rotationOffset.z) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    scene.rotation.set(toRad(settings.rotationOffset.x), toRad(settings.rotationOffset.y), toRad(settings.rotationOffset.z));
  }

  // Convert coordinate system if needed
  if (settings.convertToYUp) {
    // Z-up to Y-up rotation: rotate -90 degrees around X
    const rotMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    scene.applyMatrix4(rotMatrix);
  }
}

// ── Geometry optimization ──

function optimizeGeometry(scene: THREE.Object3D, settings: MeshImportSettings): void {
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geo = mesh.geometry;

    // Ensure we're using BufferGeometry (Three.js r125+ only has BufferGeometry)
    // Recompute normals if requested
    if (settings.normalsMode === 'recomputeFlat') {
      geo.computeVertexNormals();
      // Flat shading by removing normal attribute entirely and letting flat shading kick in
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) mat.flatShading = true;
    } else if (settings.normalsMode === 'recomputeSmooth' || settings.normalsMode === 'weightedByArea') {
      geo.computeVertexNormals();
    }

    // Recompute tangents for normal mapping
    if (settings.recomputeTangents && geo.attributes.normal && geo.attributes.uv) {
      geo.computeTangents();
    }

    // Remove vertex colors if not importing
    if (!settings.importVertexColors && geo.attributes.color) {
      geo.deleteAttribute('color');
    }

    // Optimize: make indexed if not already
    if (!geo.index && settings.optimizeVertexOrder) {
      // Three.js BufferGeometry.toNonIndexed() exists, but not toIndexed
      // We'll leave it as is — indexed geometries are typically created by loaders
    }
  });
}

// ── Validation ──

function validateImport(
  scene: THREE.Object3D,
  animations: THREE.AnimationClip[],
  file: File,
  settings: MeshImportSettings,
): { isValid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!settings.validation.checkErrors) {
    return { isValid: true, warnings, errors };
  }

  // Count vertices
  let totalVerts = 0;
  let totalTris = 0;
  let meshCount = 0;
  let hasSkin = false;

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    meshCount++;
    const geo = (child as THREE.Mesh).geometry;
    if (geo.attributes.position) totalVerts += geo.attributes.position.count;
    if (geo.index) totalTris += geo.index.count / 3;
    else if (geo.attributes.position) totalTris += geo.attributes.position.count / 3;
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true;
  });

  if (meshCount === 0) {
    errors.push('No mesh geometry found in file.');
  }

  // Check file size
  if (settings.validation.warnLargeFileSize && file.size > settings.validation.fileSizeThreshold) {
    warnings.push(`Large file size: ${(file.size / (1024 * 1024)).toFixed(1)} MB. Consider optimizing.`);
  }

  // Check vertex count
  if (settings.validation.warnHighPolyCount && totalVerts > settings.validation.polyCountThreshold) {
    warnings.push(`High vertex count: ${totalVerts.toLocaleString()}. Consider using LODs.`);
  }

  // Check poly count for mobile
  if (settings.targetPlatform === 'mobile' && totalVerts > 50000) {
    warnings.push(`Vertex count (${totalVerts.toLocaleString()}) may be too high for mobile.`);
  }

  // Check bone count
  let boneCount = 0;
  scene.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      const skel = (child as THREE.SkinnedMesh).skeleton;
      if (skel) boneCount = Math.max(boneCount, skel.bones.length);
    }
  });

  if (boneCount > 75) {
    warnings.push(`High bone count: ${boneCount}. Mobile devices may struggle (limit: ~50).`);
  }

  if (boneCount > 0 && settings.maxBoneInfluences > 4 && settings.targetPlatform === 'mobile') {
    warnings.push('Max bone influences > 4 not recommended for mobile. Set to 4.');
  }

  // Check texture sizes
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mats = Array.isArray((child as THREE.Mesh).material)
      ? (child as THREE.Mesh).material as THREE.Material[]
      : [(child as THREE.Mesh).material];

    for (const mat of mats) {
      const stdMat = mat as THREE.MeshStandardMaterial;
      const textures = [stdMat.map, stdMat.normalMap, stdMat.metalnessMap, stdMat.roughnessMap, stdMat.emissiveMap, stdMat.aoMap];
      for (const tex of textures) {
        if (!tex?.image) continue;
        const img = tex.image as { width?: number; height?: number };
        const w = img.width || 0;
        const h = img.height || 0;
        if (w > 2048 || h > 2048) {
          warnings.push(`Large texture: ${tex.name || 'unnamed'} (${w}x${h}). Consider compression.`);
        }
        if (!isPowerOfTwo(w) || !isPowerOfTwo(h)) {
          warnings.push(`Non-power-of-2 texture: ${tex.name || 'unnamed'} (${w}x${h}). Will be resized.`);
        }
      }
    }
  });

  // Validate skeleton for animations
  if (animations.length > 0 && !hasSkin && settings.validation.validateSkeletonHierarchy) {
    warnings.push('Animations detected but no skinned mesh found. Animations may not play correctly.');
  }

  return { isValid: errors.length === 0, warnings, errors };
}

// ── Main Loader Dispatcher ──

async function loadFile(file: File, extraFiles?: Map<string, File>): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const buffer = await readFileAsArrayBuffer(file);

  switch (ext) {
    case '.gltf': {
      const text = await readFileAsText(file);
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.parse(text, '', resolve, reject);
      });
      return { scene: gltf.scene, animations: gltf.animations || [] };
    }
    case '.glb': {
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.parse(buffer, '', resolve, reject);
      });
      return { scene: gltf.scene, animations: gltf.animations || [] };
    }
    case '.fbx': {
      const loader = new FBXLoader();
      const fbx = loader.parse(buffer, '');
      return { scene: fbx, animations: fbx.animations || [] };
    }
    case '.obj': {
      const text = new TextDecoder().decode(buffer);
      const loader = new OBJLoader();
      if (extraFiles) {
        const mtlName = file.name.replace(/\.obj$/i, '.mtl');
        const mtlFile = extraFiles.get(mtlName) || extraFiles.get(mtlName.toLowerCase());
        if (mtlFile) {
          // MTL loading could be added here
        }
      }
      const obj = loader.parse(text);
      return { scene: obj, animations: [] };
    }
    case '.dae': {
      const text = new TextDecoder().decode(buffer);
      const loader = new ColladaLoader();
      const dae = loader.parse(text, '');
      return { scene: dae.scene, animations: dae.scene.animations || [] };
    }
    case '.stl': {
      const loader = new STLLoader();
      const geometry = loader.parse(buffer);
      const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.2 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = file.name.replace(/\.[^.]+$/, '');
      const group = new THREE.Group();
      group.add(mesh);
      return { scene: group, animations: [] };
    }
    case '.ply': {
      const loader = new PLYLoader();
      const geometry = loader.parse(buffer);
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.2 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = file.name.replace(/\.[^.]+$/, '');
      const group = new THREE.Group();
      group.add(mesh);
      return { scene: group, animations: [] };
    }
    default:
      throw new Error(`Unsupported format: ${ext}`);
  }
}

// ============================================================
//  File Detection — Pre-import analysis
// ============================================================

/**
 * Quickly analyze a file before showing the import dialog.
 * Provides file complexity, suggested preset, and warnings.
 */
export async function detectFileContent(
  file: File,
  extraFiles?: Map<string, File>,
): Promise<FileDetectionResult> {
  const format = getImportFormat(file.name);
  const warnings: string[] = [];

  try {
    const { scene, animations } = await loadFile(file, extraFiles);

    // Analyze scene contents
    let meshCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;
    let boneCount = 0;
    let materialCount = 0;
    let textureCount = 0;
    let hasSkeletalData = false;
    let hasMorphTargets = false;
    const materialSet = new Set<string>();
    const textureSet = new Set<number>();

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        const geo = (child as THREE.Mesh).geometry;
        if (geo.attributes.position) vertexCount += geo.attributes.position.count;
        if (geo.index) triangleCount += geo.index.count / 3;
        else if (geo.attributes.position) triangleCount += geo.attributes.position.count / 3;

        if (geo.morphAttributes && Object.keys(geo.morphAttributes).length > 0) {
          hasMorphTargets = true;
        }

        // Count materials
        const mats = Array.isArray((child as THREE.Mesh).material)
          ? (child as THREE.Mesh).material as THREE.Material[]
          : [(child as THREE.Mesh).material];
        for (const m of mats) {
          materialSet.add((m as any).uuid);
          const sm = m as THREE.MeshStandardMaterial;
          const texes = [sm.map, sm.normalMap, sm.metalnessMap, sm.roughnessMap, sm.emissiveMap, sm.aoMap];
          for (const t of texes) {
            if (t) textureSet.add(t.id);
          }
        }
      }
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        hasSkeletalData = true;
        const skel = (child as THREE.SkinnedMesh).skeleton;
        if (skel) boneCount = Math.max(boneCount, skel.bones.length);
      }
    });

    materialCount = materialSet.size;
    textureCount = textureSet.size;
    triangleCount = Math.floor(triangleCount);

    // Generate warnings
    if (vertexCount > 100000) {
      warnings.push(`High vertex count: ${vertexCount.toLocaleString()}. Consider LOD generation.`);
    }
    if (boneCount > 75) {
      warnings.push(`High bone count: ${boneCount}. Mobile devices may struggle.`);
    }
    if (file.size > 50 * 1024 * 1024) {
      warnings.push(`Large file size: ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
    }

    // Detect animation clips
    const detectedAnimations = animations.map(clip => ({
      name: clip.name || 'Unnamed',
      duration: clip.duration,
      frameCount: clip.tracks.length > 0 ? clip.tracks[0].times.length : 0,
    }));

    const preset = suggestPreset({
      hasSkeleton: hasSkeletalData,
      animCount: animations.length,
      vertexCount,
    });

    return {
      fileType: format,
      fileSize: file.size,
      complexity: {
        meshCount,
        vertexCount,
        triangleCount,
        boneCount,
        animationCount: animations.length,
        materialCount,
        textureCount,
      },
      hasSkeletalData,
      hasAnimations: animations.length > 0,
      hasMorphTargets,
      suggestedImportType: hasSkeletalData || animations.length > 0 ? 'skeletalMesh' : 'staticMesh',
      suggestedPreset: preset,
      warnings,
      recommendations: {
        generateLODs: vertexCount > 10000,
        compressTextures: textureCount > 2,
        optimizeGeometry: vertexCount > 50000,
        targetPlatform: 'web',
      },
      detectedAnimations,
    };
  } catch (error: any) {
    // If detection fails, return basic info
    return {
      fileType: format,
      fileSize: file.size,
      complexity: {
        meshCount: 0,
        vertexCount: 0,
        triangleCount: 0,
        boneCount: 0,
        animationCount: 0,
        materialCount: 0,
        textureCount: 0,
      },
      hasSkeletalData: false,
      hasAnimations: false,
      hasMorphTargets: false,
      suggestedImportType: 'staticMesh',
      suggestedPreset: 'prop',
      warnings: [`Could not fully analyze file: ${error.message}`],
      recommendations: {
        generateLODs: false,
        compressTextures: false,
        optimizeGeometry: false,
        targetPlatform: 'web',
      },
      detectedAnimations: [],
    };
  }
}

// ============================================================
//  Public API — importMeshFile (Enhanced Pipeline)
// ============================================================

const TOTAL_STEPS = 12;

/**
 * Import a 3D mesh file using the full professional pipeline.
 * 12-step process: Load → Validate → Transform → Optimize →
 * Skeleton → Sockets → Animations → LODs → Collision →
 * Materials → Package → Report
 */
export async function importMeshFile(
  file: File,
  settings: MeshImportSettings,
  extraFiles?: Map<string, File>,
  onProgress?: (msg: string) => void,
  onStepProgress?: ImportProgress,
): Promise<ImportResult> {
  const startTime = performance.now();
  const format = getImportFormat(file.name);
  const meshAssetId = genId('mesh');
  const warnings: string[] = [];
  const errors: string[] = [];
  const log = settings.verboseLogging ? console.log.bind(console, '[MeshImport]') : () => {};

  // ── Step 1: Load File ──
  onStepProgress?.(1, TOTAL_STEPS, 'Loading file...');
  onProgress?.('Loading file...');
  log(`Loading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);

  const { scene, animations } = await loadFile(file, extraFiles);

  // ── Step 2: Validate ──
  onStepProgress?.(2, TOTAL_STEPS, 'Validating...');
  onProgress?.('Validating...');

  const validation = validateImport(scene, animations, file, settings);
  warnings.push(...validation.warnings);
  errors.push(...validation.errors);

  if (!validation.isValid) {
    throw new Error(`Import validation failed:\n${errors.join('\n')}`);
  }

  // ── Step 3: Apply Transform ──
  onStepProgress?.(3, TOTAL_STEPS, 'Applying transforms...');
  onProgress?.('Applying transforms...');

  applyImportTransform(scene, settings);
  scene.updateMatrixWorld(true);

  // ── Step 4: Optimize Geometry ──
  onStepProgress?.(4, TOTAL_STEPS, 'Optimizing geometry...');
  onProgress?.('Optimizing geometry...');

  optimizeGeometry(scene, settings);

  // Detect asset type
  const assetType = detectAssetType(scene, animations, settings.importAs);

  // ── Step 5: Extract Skeleton ──
  onStepProgress?.(5, TOTAL_STEPS, 'Processing skeleton...');
  onProgress?.('Processing skeleton...');

  let skeleton: SkeletonAssetJSON | null = null;
  if (settings.importSkeleton) {
    skeleton = extractSkeleton(scene, settings);
    if (skeleton) {
      log(`Extracted skeleton: ${skeleton.boneCount} bones, ${skeleton.sockets?.length || 0} sockets`);
    }
  }

  // ── Step 6: Socket Detection ──
  onStepProgress?.(6, TOTAL_STEPS, 'Detecting sockets...');
  onProgress?.('Detecting sockets...');

  // Sockets are already handled in extractSkeleton
  const socketCount = skeleton?.sockets?.length || 0;
  if (socketCount > 0) {
    log(`Auto-detected ${socketCount} sockets`);
  }

  // ── Step 7: Extract Animations ──
  onStepProgress?.(7, TOTAL_STEPS, 'Processing animations...');
  onProgress?.('Processing animations...');

  let animAssets: AnimationAssetJSON[] = [];
  if (settings.animation.importAnimations && animations.length > 0) {
    animAssets = extractAnimations(animations, meshAssetId, skeleton?.assetId || null, settings);
    log(`Extracted ${animAssets.length} animation(s)`);
  }

  // ── Step 8: Generate LODs ──
  onStepProgress?.(8, TOTAL_STEPS, 'Generating LODs...');
  onProgress?.('Generating LODs...');

  let lods: LODDataJSON[] = [];
  if (settings.lod.generateLODs) {
    try {
      lods = await generateLODs(scene, settings.lod, (msg) => {
        onProgress?.(msg);
        log(msg);
      });
      log(`Generated ${lods.length} LOD level(s)`);
    } catch (err: any) {
      warnings.push(`LOD generation failed: ${err.message}`);
      log(`LOD generation error: ${err.message}`);
    }
  }

  // ── Step 9: Generate Collision ──
  onStepProgress?.(9, TOTAL_STEPS, 'Generating collision...');
  onProgress?.('Generating collision...');

  let collisionData: CollisionDataJSON | null = null;
  if (settings.collision.generateCollision) {
    try {
      collisionData = generateCollision(scene, settings.collision, (msg) => {
        onProgress?.(msg);
        log(msg);
      });
      if (collisionData) {
        log(`Generated collision: ${collisionData.hullCount} hull(s), type: ${collisionData.collisionType}`);
      }
    } catch (err: any) {
      warnings.push(`Collision generation failed: ${err.message}`);
      log(`Collision generation error: ${err.message}`);
    }
  }

  // ── Step 10: Extract Textures & Materials ──
  onStepProgress?.(10, TOTAL_STEPS, 'Processing materials & textures...');
  onProgress?.('Processing materials & textures...');

  const textureMap = new Map<string, TextureAssetJSON>();
  let textures: TextureAssetJSON[] = [];
  if (settings.importTextures) {
    textures = extractTextures(scene, meshAssetId, settings);
    for (const tex of textures) {
      textureMap.set(tex.assetId, tex);
    }
    log(`Extracted ${textures.length} texture(s)`);
  }

  let materials: MaterialAssetJSON[] = [];
  if (settings.importMaterials) {
    materials = extractMaterials(scene, meshAssetId, textureMap, settings);
    log(`Extracted ${materials.length} material(s)`);
  }

  // ── Step 11: Package GLB ──
  onStepProgress?.(11, TOTAL_STEPS, 'Packaging GLB...');
  onProgress?.('Packaging GLB...');

  // Compute mesh data
  const meshData = computeMeshData(scene, format);

  // Generate thumbnail
  let thumbnail = '';
  if (settings.generateThumbnails) {
    thumbnail = generateThumbnail(scene);
  }

  // Export to GLB for runtime loading
  const glbDataBase64 = await exportToGLBBase64(scene, animations);
  log(`GLB package size: ${(glbDataBase64.length / 1024).toFixed(1)} KB`);

  // ── Step 12: Generate Report ──
  onStepProgress?.(12, TOTAL_STEPS, 'Finalizing...');
  onProgress?.('Finalizing...');

  const duration = performance.now() - startTime;

  // Build asset name with prefix/suffix
  const fullAssetName = `${settings.prefix}${settings.assetName}${settings.suffix}`;

  const report: ImportReportJSON = {
    success: true,
    importDate: new Date().toISOString(),
    duration: Math.round(duration),
    warnings,
    errors,
    stats: {
      fileSize: file.size,
      vertexCount: meshData.vertexCount,
      triangleCount: meshData.triangleCount,
      boneCount: skeleton?.boneCount || 0,
      animationCount: animAssets.length,
      materialCount: materials.length,
      textureCount: textures.length,
      lodCount: lods.length,
      collisionHulls: collisionData?.hullCount || 0,
      socketCount,
    },
  };

  // Build the mesh asset
  const meshAsset: MeshAssetJSON = {
    assetId: meshAssetId,
    assetType: assetType,
    assetName: fullAssetName,
    sourceFile: file.name,
    importDate: new Date().toISOString(),
    importSettings: { ...settings },
    meshData,
    materials: materials.map(m => m.assetId),
    textures: textures.map(t => t.assetId),
    animations: animAssets.map(a => a.assetId),
    skeleton,
    lods,
    collisionData,
    importReport: settings.generateImportReport ? report : null,
    glbDataBase64,
    thumbnail,
  };

  log(`Import complete in ${(duration / 1000).toFixed(2)}s`);
  log(`Assets created: ${1 + materials.length + textures.length + animAssets.length + (skeleton ? 1 : 0)}`);

  onProgress?.('Import complete!');

  return {
    meshAsset,
    materials,
    textures,
    animations: animAssets,
    report,
  };
}

// ============================================================
//  Runtime: Load GLB from base64 back to Three.js scene
// ============================================================

/** Load a Three.js scene & animations from the stored GLB base64 data */
export async function loadMeshFromAsset(asset: { glbDataBase64: string }): Promise<{
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}> {
  // Decode base64 to ArrayBuffer
  const binary = atob(asset.glbDataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.parse(bytes.buffer, '', resolve, reject);
  });

  const scene = gltf.scene as THREE.Group;

  // ── Normalize root transform ──
  scene.position.set(0, 0, 0);
  scene.rotation.set(0, 0, 0);
  scene.scale.set(1, 1, 1);
  scene.updateMatrixWorld(true);

  // ── Ensure all meshes have proper settings ──
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      // Fix frustum culling issues with skinned meshes
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        (child as THREE.SkinnedMesh).frustumCulled = false;
      }
    }
  });

  return {
    scene,
    animations: gltf.animations || [],
  };
}
