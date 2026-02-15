// ============================================================
//  MeshImporter — Core 3D mesh import system
//  Loads GLTF/GLB/FBX/OBJ/DAE/STL/PLY files using Three.js
//  loaders, extracts meshes, materials, textures, skeleton,
//  and animations, then converts to serializable asset data.
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
  BoundingBoxData, ImportMeshFormat,
} from './MeshAsset';
import { getImportFormat, defaultImportSettings } from './MeshAsset';

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

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// ── Helper: THREE.js color → hex string ──

function colorToHex(c: THREE.Color): string {
  return '#' + c.getHexString();
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

async function exportToGLBBase64(scene: THREE.Object3D, animations: THREE.AnimationClip[]): Promise<string> {
  const exporter = new GLTFExporter();
  const glb: ArrayBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      (error) => reject(error),
      { binary: true, animations },
    );
  });
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
        // Find in texture map by Three.js texture uuid
        for (const [, texAsset] of textures) {
          if (texAsset.assetName === tex.name || texAsset.assetId === (tex as any).__importTexId) {
            return texAsset.assetId;
          }
        }
        return null;
      };

      materials.push({
        assetId: matId,
        assetName: mat.name || `Material_${materials.length}`,
        meshAssetId,
        materialData: {
          type: 'PBR',
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

function extractTextures(scene: THREE.Object3D, meshAssetId: string): TextureAssetJSON[] {
  const textures: TextureAssetJSON[] = [];
  const seen = new Set<number>(); // texture.id

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of mats) {
      const stdMat = mat as THREE.MeshStandardMaterial;
      const allTextures = [
        stdMat.map, stdMat.normalMap, stdMat.metalnessMap,
        stdMat.roughnessMap, stdMat.emissiveMap, stdMat.aoMap,
        stdMat.alphaMap, stdMat.bumpMap,
      ];

      for (const tex of allTextures) {
        if (!tex || seen.has(tex.id)) continue;
        seen.add(tex.id);

        const texId = genId('tex');
        (tex as any).__importTexId = texId;

        // Try to extract image data
        let dataUrl = '';
        let width = 0;
        let height = 0;

        if (tex.image) {
          if (tex.image instanceof HTMLImageElement || tex.image instanceof HTMLCanvasElement) {
            const canvas = document.createElement('canvas');
            canvas.width = tex.image.width || 256;
            canvas.height = tex.image.height || 256;
            width = canvas.width;
            height = canvas.height;
            const ctx2d = canvas.getContext('2d')!;
            ctx2d.drawImage(tex.image, 0, 0);
            dataUrl = canvas.toDataURL('image/png');
          } else if (tex.image instanceof ImageBitmap) {
            const canvas = document.createElement('canvas');
            canvas.width = tex.image.width;
            canvas.height = tex.image.height;
            width = canvas.width;
            height = canvas.height;
            const ctx2d = canvas.getContext('2d')!;
            ctx2d.drawImage(tex.image, 0, 0);
            dataUrl = canvas.toDataURL('image/png');
          }
        }

        textures.push({
          assetId: texId,
          assetName: tex.name || `Texture_${textures.length}`,
          meshAssetId,
          dataUrl,
          textureData: { width, height, format: 'RGBA' },
        });
      }
    }
  });

  return textures;
}

// ── Extract skeleton ──

function extractSkeleton(scene: THREE.Object3D): SkeletonAssetJSON | null {
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
    bones.push({
      name: bone.name || `Bone_${i}`,
      parentIndex,
      position: { x: bone.position.x, y: bone.position.y, z: bone.position.z },
      rotation: { x: bone.quaternion.x, y: bone.quaternion.y, z: bone.quaternion.z, w: bone.quaternion.w },
      scale: { x: bone.scale.x, y: bone.scale.y, z: bone.scale.z },
    });
  }

  return {
    assetId: genId('skel'),
    assetName: 'Skeleton',
    bones,
    boneCount: bones.length,
  };
}

// ── Extract animations ──

function extractAnimations(
  clips: THREE.AnimationClip[],
  meshAssetId: string,
  skeletonId: string | null,
): AnimationAssetJSON[] {
  return clips.map((clip) => {
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

      tracks.push({
        boneName,
        type,
        times: Array.from(track.times),
        values: Array.from(track.values),
      });
    }

    const fps = clip.tracks.length > 0 && clip.tracks[0].times.length > 1
      ? Math.round(clip.tracks[0].times.length / clip.duration)
      : 30;

    return {
      assetId: genId('anim'),
      assetName: clip.name || `Animation_${clips.indexOf(clip)}`,
      meshAssetId,
      skeletonId,
      duration: clip.duration,
      fps,
      loop: true,
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
  if (settings.scale !== 1.0) {
    scene.scale.multiplyScalar(settings.scale);
  }
  if (settings.positionOffset.x || settings.positionOffset.y || settings.positionOffset.z) {
    scene.position.set(settings.positionOffset.x, settings.positionOffset.y, settings.positionOffset.z);
  }
  if (settings.rotationOffset.x || settings.rotationOffset.y || settings.rotationOffset.z) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    scene.rotation.set(toRad(settings.rotationOffset.x), toRad(settings.rotationOffset.y), toRad(settings.rotationOffset.z));
  }
}

// ── Main Loader Dispatcher ──

async function loadFile(file: File, extraFiles?: Map<string, File>): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const buffer = await readFileAsArrayBuffer(file);

  switch (ext) {
    case '.gltf': {
      const text = await readFileAsText(file);
      const loader = new GLTFLoader();
      // For .gltf with external references we need a special setup
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
      // Check for MTL file
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
//  Public API — importMeshFile
// ============================================================

/**
 * Import a 3D mesh file and extract all assets.
 * Returns the full ImportResult with all extracted data.
 */
export async function importMeshFile(
  file: File,
  settings: MeshImportSettings,
  extraFiles?: Map<string, File>,
  onProgress?: (msg: string) => void,
): Promise<ImportResult> {
  const format = getImportFormat(file.name);
  const meshAssetId = genId('mesh');

  onProgress?.('Loading file...');

  // Load the 3D file
  const { scene, animations } = await loadFile(file, extraFiles);

  onProgress?.('Processing mesh...');

  // Apply import transforms
  applyImportTransform(scene, settings);

  // Update scene matrix
  scene.updateMatrixWorld(true);

  // Detect asset type
  const assetType = detectAssetType(scene, animations, settings.importAs);

  // Extract textures first (needed for material texture references)
  onProgress?.('Extracting textures...');
  const textureMap = new Map<string, TextureAssetJSON>();
  let textures: TextureAssetJSON[] = [];
  if (settings.importTextures) {
    textures = extractTextures(scene, meshAssetId);
    for (const tex of textures) {
      textureMap.set(tex.assetId, tex);
    }
  }

  // Extract materials
  onProgress?.('Extracting materials...');
  let materials: MaterialAssetJSON[] = [];
  if (settings.importMaterials) {
    materials = extractMaterials(scene, meshAssetId, textureMap);
  }

  // Extract skeleton
  onProgress?.('Extracting skeleton...');
  let skeleton: SkeletonAssetJSON | null = null;
  if (settings.importSkeleton) {
    skeleton = extractSkeleton(scene);
    if (skeleton) {
      skeleton.assetName = `${settings.assetName}_Skeleton`;
    }
  }

  // Extract animations
  onProgress?.('Extracting animations...');
  let animAssets: AnimationAssetJSON[] = [];
  if (settings.importAnimations && animations.length > 0) {
    animAssets = extractAnimations(animations, meshAssetId, skeleton?.assetId || null);
    // Prefix animation names with asset name
    for (const anim of animAssets) {
      if (!anim.assetName.startsWith(settings.assetName)) {
        anim.assetName = `${settings.assetName}_${anim.assetName}`;
      }
    }
  }

  // Compute mesh data
  onProgress?.('Computing mesh data...');
  const meshData = computeMeshData(scene, format);

  // Generate thumbnail
  onProgress?.('Generating thumbnail...');
  const thumbnail = generateThumbnail(scene);

  // Export to GLB for runtime loading
  onProgress?.('Packaging GLB...');
  const glbDataBase64 = await exportToGLBBase64(scene, animations);

  // Build the mesh asset
  const meshAsset: MeshAssetJSON = {
    assetId: meshAssetId,
    assetType: assetType,
    assetName: settings.assetName,
    sourceFile: file.name,
    importDate: new Date().toISOString(),
    importSettings: { ...settings },
    meshData,
    materials: materials.map(m => m.assetId),
    textures: textures.map(t => t.assetId),
    animations: animAssets.map(a => a.assetId),
    skeleton,
    glbDataBase64,
    thumbnail,
  };

  onProgress?.('Import complete!');

  return {
    meshAsset,
    materials,
    textures,
    animations: animAssets,
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

  return {
    scene: gltf.scene,
    animations: gltf.animations || [],
  };
}
