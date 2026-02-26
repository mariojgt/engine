
import * as THREE from 'three';
import { GameObject } from '../engine/GameObject';
import { ActorAssetManager, type ActorAsset } from './ActorAsset';
import { Scene } from '../engine/Scene';
import type { BlueprintData } from './BlueprintData';
import { ScriptComponent } from '../engine/ScriptComponent';

/**
 * Applies Master Asset data to a specific GameObject instance 
 * while PRESERVING instance-specific overrides.
 */
export function applyAssetToInstance(
  instance: GameObject, 
  asset: ActorAsset, 
  assetManager: ActorAssetManager
): void {
  // 1. Core properties
  // Note: We do NOT overwrite name, position, rotation, scale as they are instance-specific.
  instance.actorAssetId = asset.id;
  instance.actorType = asset.actorType;
  
  // 2. Physics & Transforms
  // Apply the Prefab's physics config. 
  // Ideally we would only apply if not overridden, but for now we enforce the Prefab's structure.
  if (asset.rootPhysics) {
      instance.physicsConfig = JSON.parse(JSON.stringify(asset.rootPhysics));
      instance.hasPhysics = asset.rootPhysics.enabled && asset.rootPhysics.simulatePhysics;
  }

  // 3. Components
  // TODO: Full component hierarchy sync. 
  // Currently, the engine's Scene.ts handles component creation on spawn.
  // For a live update, we should ideally diff the components or reconstruct them.
  // Implementing full reconstruction is risky for running games, but fine for Editor time.
  // For now, we will assume components are static structure and only update properties if we could match IDs.
  // (Limitation: Adding a component in BP editor won't show up in instances until reload/start).

  // 4. Blueprint Data (Variable values)
  const instanceBP = instance.blueprintData || {};
  const assetBP = asset.blueprintData;
  const newBP = JSON.parse(JSON.stringify(assetBP));

  // Merge Variables: Keep instance values if they exist and match type
  if (instanceBP.variables && newBP.variables) {
    for (const newVar of newBP.variables) {
      const oldVar = instanceBP.variables.find((v: any) => v.name === newVar.name && v.type === newVar.type);
      if (oldVar) {
        // If the instance has a value, we preserve it as an override.
        newVar.defaultValue = oldVar.defaultValue; 
      }
    }
  }
  instance.blueprintData = newBP;
  
  // 5. Code / Logic
  // Update the scripting component with new compiled code from asset
  if (asset.compiledCode) {
    // Find existing ScriptComponent or add new one
    let scriptComp = instance.scripts.find(s => s instanceof ScriptComponent);
    if (!scriptComp) {
      scriptComp = new ScriptComponent();
      instance.scripts.push(scriptComp);
    }
    scriptComp.code = asset.compiledCode;
    // We do NOT call compile() here immediately to avoid crashing active game loop 
    // with potentially incomplete code. It will be compiled on next play/restart.
  }

  // 6. Visuals (Mesh)
  // If the asset defines a mesh, we update the reference.
  // Note: This does not instantly reload the geometry in the view (requires Scene/MeshManager interaction).
  if (asset.rootCustomMeshAssetId) {
     instance.customMeshAssetId = asset.rootCustomMeshAssetId;
  }
  // Root material overrides
  if (asset.rootMaterialOverrides) {
     // Apply asset overrides, but respect instance overrides? 
     // For now, let's merge them or just re-apply asset one.
     // Real implementation would need to know which ones are instance-specific.
  }
}

/**
 * Scans the scene for any GameObjects linked to the modified assetId 
 * and re-applies the asset template to them.
 */
export function refreshInstancesOfAsset(scene: Scene, assetId: string, assetManager: ActorAssetManager): void {
  const asset = assetManager.getAsset(assetId);
  if (!asset) return;

  scene.gameObjects.forEach(go => {
    if (go.actorAssetId === assetId) {
       // Save transform before applying prefab
       const position = go.mesh.position.clone();
       const rotation = go.mesh.rotation.clone();
       const scale = go.mesh.scale.clone();
       
       applyAssetToInstance(go, asset, assetManager);

       // Restore transform
       go.mesh.position.copy(position);
       go.mesh.rotation.copy(rotation);
       go.mesh.scale.copy(scale);
       
       console.log(`[PrefabSystem] Refreshed instance ${go.name} from asset ${asset.name}`);
    }
  });
}
