// ============================================================
//  SceneSerializer — Serializes/deserializes the full scene
//  Converts GameObjects → JSON and JSON → GameObjects
// ============================================================

import type { Scene, MeshType } from '../engine/Scene';
import type { GameObject } from '../engine/GameObject';
import type { ActorAssetManager } from './ActorAsset';
import type { BlueprintData } from './BlueprintData';
import type { PhysicsConfig } from './ActorAsset';
import type { BufferGeometry } from 'three';

// ---- Serialized shape ----

export interface GameObjectJSON {
  name: string;
  meshType: MeshType;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  hasPhysics: boolean;
  /** If spawned from an actor asset, the asset ID */
  actorAssetId: string | null;
  /** For standalone (non-actor) game objects, store their blueprint data */
  blueprintData?: any;
  /** Per-object physics configuration */
  physicsConfig?: PhysicsConfig | null;
}

export interface CameraStateJSON {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export interface SceneJSON {
  name: string;
  gameObjects: GameObjectJSON[];
  camera?: CameraStateJSON;
}

// ---- Helpers ----

function meshTypeFromGeometry(geo: BufferGeometry): MeshType {
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

// ---- Serialization ----

export function serializeScene(
  scene: Scene,
  sceneName: string,
  cameraState?: CameraStateJSON,
): SceneJSON {
  const gameObjects: GameObjectJSON[] = [];

  for (const go of scene.gameObjects) {
    const obj: GameObjectJSON = {
      name: go.name,
      meshType: meshTypeFromGeometry(go.mesh.geometry),
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
      physicsConfig: go.physicsConfig ? structuredClone(go.physicsConfig) : null,
    };

    // For standalone game objects (not spawned from an actor asset),
    // save their blueprint data so we can restore it
    if (!go.actorAssetId) {
      obj.blueprintData = serializeBlueprintData(go.blueprintData);
    }

    gameObjects.push(obj);
  }

  return {
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
): void {
  // Clear existing game objects
  while (scene.gameObjects.length > 0) {
    scene.removeGameObject(scene.gameObjects[0]);
  }

  for (const goData of data.gameObjects) {
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
        );
        // Apply saved transform (overrides default asset position)
        go.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
        go.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
        go.hasPhysics = goData.hasPhysics;
        if (goData.physicsConfig) go.physicsConfig = structuredClone(goData.physicsConfig);
      } else {
        // Asset not found — create a standalone placeholder
        console.warn(`Actor asset ${goData.actorAssetId} not found, creating standalone object`);
        const go = scene.addGameObject(goData.name, goData.meshType);
        go.mesh.position.set(goData.position.x, goData.position.y, goData.position.z);
        go.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
        go.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
        go.hasPhysics = goData.hasPhysics;
        if (goData.physicsConfig) go.physicsConfig = structuredClone(goData.physicsConfig);
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
    }
  }
}
