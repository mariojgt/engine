// ============================================================
//  SceneSerializer — Serializes/deserializes the full scene
//  Converts GameObjects → JSON and JSON → GameObjects
// ============================================================

import * as THREE from 'three';
import type { Scene, MeshType } from '../engine/Scene';
import type { GameObject } from '../engine/GameObject';
import type { ActorAssetManager } from './ActorAsset';
import { MeshAssetManager, buildThreeMaterialFromAsset } from './MeshAsset';
import type { BlueprintData } from './BlueprintData';
import type { PhysicsConfig, ActorType } from './ActorAsset';
import type { ControllerType } from '../engine/Controller';
import type { BufferGeometry } from 'three';

// ---- Serialized shape ----

/** Per-mesh material override saved in the scene */
export interface MeshMaterialOverrideJSON {
  /** Index within the mesh-child list (0 for root / single-mesh objects) */
  index: number;
  /** Material asset ID (empty string = default / no override) */
  materialAssetId: string;
  /** Color hex, e.g. "#ff0000" */
  color?: string;
  /** PBR metalness override (0-1) */
  metalness?: number;
  /** PBR roughness override (0-1) */
  roughness?: number;
}

export interface GameObjectJSON {
  name: string;
  meshType: MeshType;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  hasPhysics: boolean;
  /** If spawned from an actor asset, the asset ID */
  actorAssetId: string | null;
  /** If using an imported mesh asset, the mesh asset ID */
  customMeshAssetId?: string | null;
  /** For standalone (non-actor) game objects, store their blueprint data */
  blueprintData?: any;
  /** Per-object physics configuration */
  physicsConfig?: PhysicsConfig | null;
  /** Per-instance visual material overrides (set in Properties Panel) */
  materialOverrides?: MeshMaterialOverrideJSON[];
  /** Actor type ('actor', 'characterPawn', etc.) */
  actorType?: ActorType;
  /** Controller class for this pawn */
  controllerClass?: ControllerType;
  /** Controller blueprint asset ID */
  controllerBlueprintId?: string;
  /** Gameplay tags */
  tags?: string[];
}

export interface CameraStateJSON {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export interface SceneJSON {
  /** Schema version — bump when breaking changes are made to the format */
  schemaVersion?: number;
  name: string;
  gameObjects: GameObjectJSON[];
  camera?: CameraStateJSON;
}

/** Current scene schema version. Increment when making breaking format changes. */
export const SCENE_SCHEMA_VERSION = 1;

// ---- Helpers ----

function meshTypeFromGeometry(geo: BufferGeometry | undefined): MeshType {
  if (!geo) return 'cube'; // Groups (imported meshes) have no geometry
  switch (geo.type) {
    case 'BoxGeometry': return 'cube';
    case 'SphereGeometry': return 'sphere';
    case 'CylinderGeometry': return 'cylinder';
    case 'PlaneGeometry': return 'plane';
    default: return 'cube';
  }
}

function serializeBlueprintData(bp: BlueprintData): any {
  return {
    variables: structuredClone(bp.variables),
    functions: bp.functions.map(f => ({
      ...structuredClone(f),
      graph: { nodeData: f.graph.nodeData ?? null },
    })),
    macros: structuredClone(bp.macros),
    customEvents: structuredClone(bp.customEvents),
    structs: structuredClone(bp.structs),
    eventGraph: { nodeData: bp.eventGraph.nodeData ?? null },
  };
}

/**
 * Collect per-mesh material overrides from a game object's mesh tree.
 * Returns an array of overrides for meshes that have been customised
 * (via the Properties Panel material dropdown, colour picker, etc.).
 */
function collectMaterialOverrides(rootMesh: THREE.Object3D): MeshMaterialOverrideJSON[] {
  const overrides: MeshMaterialOverrideJSON[] = [];
  const meshes: THREE.Mesh[] = [];

  // Gather meshes in the same order as PropertiesPanel._buildMaterialSection
  const collect = (obj: THREE.Object3D) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshes.push(obj as THREE.Mesh);
    }
    for (const child of obj.children) {
      if (child.userData?.__isTriggerHelper) continue;
      if (child.userData?.__isLightHelper) continue;
      if (child.userData?.__isComponentHelper) continue;
      collect(child);
    }
  };
  collect(rootMesh);

  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    const matId = (m.userData?.__assignedMaterialId as string) || '';
    const mat = m.material as THREE.MeshStandardMaterial | undefined;

    // Only save an override entry when something was customised
    const hasMatId = matId !== '';
    const hasColor = mat && 'color' in mat;

    if (hasMatId || hasColor) {
      const entry: MeshMaterialOverrideJSON = {
        index: i,
        materialAssetId: matId,
      };
      if (mat && 'color' in mat) {
        entry.color = '#' + mat.color.getHexString();
      }
      if (mat && 'metalness' in mat) {
        entry.metalness = mat.metalness;
      }
      if (mat && 'roughness' in mat) {
        entry.roughness = mat.roughness;
      }
      overrides.push(entry);
    }
  }
  return overrides;
}

/**
 * Apply saved material overrides back to a game object's mesh tree.
 */
function applyMaterialOverrides(
  rootMesh: THREE.Object3D,
  overrides: MeshMaterialOverrideJSON[],
): void {
  if (!overrides || overrides.length === 0) return;

  const meshes: THREE.Mesh[] = [];
  const collect = (obj: THREE.Object3D) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshes.push(obj as THREE.Mesh);
    }
    for (const child of obj.children) {
      if (child.userData?.__isTriggerHelper) continue;
      if (child.userData?.__isLightHelper) continue;
      if (child.userData?.__isComponentHelper) continue;
      collect(child);
    }
  };
  collect(rootMesh);

  const mgr = MeshAssetManager.getInstance();

  for (const ov of overrides) {
    if (ov.index < 0 || ov.index >= meshes.length) continue;
    const m = meshes[ov.index];

    // Restore material asset if one was assigned
    if (ov.materialAssetId && mgr) {
      const matAsset = mgr.getMaterial(ov.materialAssetId);
      if (matAsset) {
        m.material = buildThreeMaterialFromAsset(matAsset, mgr);
        m.userData.__assignedMaterialId = ov.materialAssetId;
      }
    }

    // Apply colour / PBR overrides on top
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat && 'color' in mat) {
      if (ov.color) mat.color.set(ov.color);
      if (ov.metalness != null) mat.metalness = ov.metalness;
      if (ov.roughness != null) mat.roughness = ov.roughness;
    }
  }
}

// ---- Serialization ----

export function serializeScene(
  scene: Scene,
  sceneName: string,
  cameraState?: CameraStateJSON,
): SceneJSON {
  const gameObjects: GameObjectJSON[] = [];

  console.log(`[SceneSerializer] Serializing scene "${sceneName}" — ${scene.gameObjects.length} game objects`);

  for (const go of scene.gameObjects) {
    const obj: GameObjectJSON = {
      name: go.name,
      meshType: meshTypeFromGeometry((go.mesh as any).geometry),
      position: {
        x: go.mesh.position.x,
        y: go.mesh.position.y,
        z: go.mesh.position.z,
      },
      rotation: {
        x: go.mesh.rotation.x,
        y: go.mesh.rotation.y,
        z: go.mesh.rotation.z,
      },
      scale: {
        x: go.mesh.scale.x,
        y: go.mesh.scale.y,
        z: go.mesh.scale.z,
      },
      hasPhysics: go.hasPhysics,
      actorAssetId: go.actorAssetId,
      customMeshAssetId: go.customMeshAssetId || null,
      physicsConfig: go.physicsConfig ? structuredClone(go.physicsConfig) : null,
    };

    // Per-instance material overrides (material asset, colour, metalness, roughness)
    const matOverrides = collectMaterialOverrides(go.mesh);
    if (matOverrides.length > 0) {
      obj.materialOverrides = matOverrides;
    }

    // Actor type / controller / tags (per-instance values)
    if (go.actorType && go.actorType !== 'actor') {
      obj.actorType = go.actorType;
    }
    if (go.controllerClass && go.controllerClass !== 'None') {
      obj.controllerClass = go.controllerClass;
    }
    if (go.controllerBlueprintId) {
      obj.controllerBlueprintId = go.controllerBlueprintId;
    }
    if (go.tags && go.tags.length > 0) {
      obj.tags = [...go.tags];
    }

    // For standalone game objects (not spawned from an actor asset),
    // save their blueprint data so we can restore it
    if (!go.actorAssetId) {
      obj.blueprintData = serializeBlueprintData(go.blueprintData);
    }

    gameObjects.push(obj);
  }

  console.log(`[SceneSerializer] Serialized ${gameObjects.length} objects for scene "${sceneName}"`);

  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    name: sceneName,
    gameObjects,
    camera: cameraState,
  };
}

// ---- Deserialization ----

export function deserializeScene(
  scene: Scene,
  data: SceneJSON,
  assetManager: ActorAssetManager,
  meshManager?: MeshAssetManager,
): void {
  console.log(`[SceneSerializer] Deserializing scene "${data.name}" — ${data.gameObjects.length} objects to restore`);

  // Log schema version mismatch warnings for future migration support
  if (data.schemaVersion && data.schemaVersion !== SCENE_SCHEMA_VERSION) {
    console.warn(`[SceneSerializer] Schema version mismatch: file=${data.schemaVersion} engine=${SCENE_SCHEMA_VERSION}. Some fields may not load correctly.`);
  } else if (!data.schemaVersion) {
    console.log(`[SceneSerializer] Scene file has no schemaVersion (pre-versioning format). Treating as v1.`);
  }

  // Clear existing game objects
  scene.clear();
  console.log(`[SceneSerializer] Scene cleared, now restoring objects...`);

  for (const goData of data.gameObjects) {
    // Check if this is a custom mesh asset instance
    if (goData.customMeshAssetId && meshManager) {
      const meshAsset = meshManager.getAsset(goData.customMeshAssetId);
      if (meshAsset) {
        // Load mesh asynchronously — fire and forget (async scene loading)
        scene.addGameObjectFromMeshAsset(meshAsset, goData.position).then((go) => {
          go.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
          go.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
          go.hasPhysics = goData.hasPhysics;
          if (goData.physicsConfig) go.physicsConfig = structuredClone(goData.physicsConfig);
          restoreInstanceProps(go, goData);
        });
        continue;
      }
    }

    if (goData.actorAssetId) {
      // This is an actor asset instance — restore from the asset
      const asset = assetManager.getAsset(goData.actorAssetId);
      if (asset) {
        const go = scene.addGameObjectFromAsset(
          asset.id,
          goData.name,
          asset.rootMeshType,
          asset.blueprintData,
          goData.position,
          asset.components,
          asset.compiledCode,
          asset.rootPhysics,
          asset.actorType,
          asset.characterPawnConfig,
          asset.controllerClass,
          asset.controllerBlueprintId,
          asset.rootMaterialOverrides,
        );
        // Apply saved transform (overrides default asset position)
        go.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
        go.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
        go.hasPhysics = goData.hasPhysics;
        if (goData.physicsConfig) go.physicsConfig = structuredClone(goData.physicsConfig);
        restoreInstanceProps(go, goData);
      } else {
        // Asset not found — create a standalone placeholder
        console.warn(`Actor asset ${goData.actorAssetId} not found, creating standalone object`);
        const go = scene.addGameObject(goData.name, goData.meshType);
        go.mesh.position.set(goData.position.x, goData.position.y, goData.position.z);
        go.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
        go.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
        go.hasPhysics = goData.hasPhysics;
        if (goData.physicsConfig) go.physicsConfig = structuredClone(goData.physicsConfig);
        restoreInstanceProps(go, goData);
      }
    } else {
      // Standalone game object
      const go = scene.addGameObject(goData.name, goData.meshType);
      go.mesh.position.set(goData.position.x, goData.position.y, goData.position.z);
      go.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
      go.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
      go.hasPhysics = goData.hasPhysics;
      if (goData.physicsConfig) go.physicsConfig = structuredClone(goData.physicsConfig);

      // Restore blueprint data
      if (goData.blueprintData) {
        const bp = go.blueprintData;
        const src = goData.blueprintData;
        bp.variables = src.variables || [];
        bp.functions = (src.functions || []).map((f: any) => ({
          ...f,
          localVariables: f.localVariables || [],
          graph: { nodeData: f.graph?.nodeData ?? null },
        }));
        bp.macros = src.macros || [];
        bp.customEvents = (src.customEvents || []).map((e: any) => ({
          ...e,
          params: e.params || [],
        }));
        bp.structs = src.structs || [];
        bp.eventGraph = { nodeData: src.eventGraph?.nodeData ?? null };
      }

      restoreInstanceProps(go, goData);
    }
  }
}

/**
 * Restore per-instance properties that are stored alongside every
 * game object type (asset-based, custom-mesh, or standalone).
 */
function restoreInstanceProps(go: GameObject, goData: GameObjectJSON): void {
  // Material overrides (per-instance visual customisation)
  if (goData.materialOverrides && goData.materialOverrides.length > 0) {
    applyMaterialOverrides(go.mesh, goData.materialOverrides);
  }

  // Actor type (override only if saved — missing means 'actor' default)
  if (goData.actorType) go.actorType = goData.actorType;

  // Controller settings
  if (goData.controllerClass) go.controllerClass = goData.controllerClass;
  if (goData.controllerBlueprintId) go.controllerBlueprintId = goData.controllerBlueprintId;

  // Gameplay tags
  if (goData.tags && goData.tags.length > 0) go.tags = [...goData.tags];
}
