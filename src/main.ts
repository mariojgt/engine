import './styles.css';
import 'dockview-core/dist/styles/dockview.css';
import { Engine } from './engine';
import { EditorLayout } from './editor/EditorLayout';
import { OutputLog } from './editor/OutputLog';
import { ScriptComponent } from './engine/ScriptComponent';
import { ProjectManager } from './editor/ProjectManager';
import { showProjectDialog } from './editor/ProjectDialog';
import { StructureAssetManager } from './editor/StructureAsset';
import { MeshAssetManager } from './editor/MeshAsset';
import { AnimBlueprintManager } from './editor/AnimBlueprintData';
import { WidgetBlueprintManager } from './editor/WidgetBlueprintData';
import { TextureLibrary } from './editor/TextureLibrary';
import { FontLibrary } from './editor/FontLibrary';
import { setStructureAssetManager, setActorAssetManager, setWidgetBPManager } from './editor/NodeEditorPanel';

async function main() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  // Create engine
  const engine = new Engine();
  await engine.init();

  // Build toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  toolbar.innerHTML = `
    <span class="toolbar-title">🪶 Feather Engine</span>
    <div class="toolbar-separator"></div>
    <div class="toolbar-dropdown" id="file-menu">
      <button class="toolbar-btn" id="btn-file">File ▾</button>
      <div class="toolbar-dropdown-content" id="file-dropdown">
        <div class="toolbar-dropdown-item" id="menu-new-project">New Project…</div>
        <div class="toolbar-dropdown-item" id="menu-open-project">Open Project…</div>
        <div class="toolbar-dropdown-divider"></div>
        <div class="toolbar-dropdown-item" id="menu-save"><span>Save</span><span class="shortcut">Ctrl+S</span></div>
      </div>
    </div>
    <div class="toolbar-separator"></div>
    <button class="toolbar-btn play" id="btn-play">▶ Play</button>
    <button class="toolbar-btn stop" id="btn-stop" style="display:none">■ Stop</button>
    <div class="toolbar-separator"></div>
    <button class="toolbar-btn" id="btn-add-cube">+ Cube</button>
    <button class="toolbar-btn" id="btn-add-sphere">+ Sphere</button>
    <div class="toolbar-spacer"></div>
    <span class="toolbar-project-name" id="toolbar-project-name"></span>
  `;
  app.appendChild(toolbar);

  // Editor container
  const editorContainer = document.createElement('div');
  editorContainer.className = 'editor-container dockview-theme-dark';
  app.appendChild(editorContainer);

  // Create editor layout (dockview)
  const editor = new EditorLayout(editorContainer, engine);

  // Wire asset manager into the engine for controller blueprint resolution
  engine.assetManager = editor.assetManager;

  // Create texture and font libraries (singletons used by widget editor)
  new TextureLibrary();
  new FontLibrary();

  // Create project manager
  const projectManager = new ProjectManager(engine, editor.assetManager);

  // Create structure/enum asset manager (project-level types)
  const structManager = new StructureAssetManager();
  projectManager.setStructureManager(structManager);
  setStructureAssetManager(structManager);

  // Wire actor asset manager into node editor for Cast To context menu entries
  setActorAssetManager(editor.assetManager);

  // Wire structure manager into content browser
  editor.setStructureManager(structManager);

  // Create mesh asset manager (imported 3D meshes)
  const meshManager = new MeshAssetManager();
  projectManager.setMeshManager(meshManager);
  editor.setMeshManager(meshManager);

  // Create animation blueprint asset manager
  const animBPManager = new AnimBlueprintManager();
  projectManager.setAnimBPManager(animBPManager);
  editor.setAnimBPManager(animBPManager);

  // Create widget blueprint asset manager
  const widgetBPManager = new WidgetBlueprintManager();
  projectManager.setWidgetBPManager(widgetBPManager);
  editor.setWidgetBPManager(widgetBPManager);

  // Wire up folder manager with project manager
  editor.setProjectManager(projectManager);

  // Wire widget BP manager into node editor for Create Widget picker
  setWidgetBPManager(widgetBPManager);

  // Wire widget blueprint resolver so UIManager can create widgets at runtime
  engine.uiManager.setBlueprintResolver((id: string) => {
    const asset = widgetBPManager.getAsset(id);
    if (!asset) return null;
    const json = asset.toJSON();
    return {
      id: asset.id,
      name: asset.name,
      rootWidgetId: json.rootWidgetId,
      widgets: json.widgets,
      compiledCode: json.compiledCode, // CRITICAL: Include compiled code for event handlers!
    };
  });

  // Wire camera state callbacks
  projectManager.getCameraState = () => editor.getCameraState();
  projectManager.applyCameraState = (state) => editor.applyCameraState(state);

  // Wire auto-save: mark dirty when scene or assets change
  engine.scene.onChanged(() => projectManager.markDirty());
  editor.assetManager.onChanged(() => projectManager.markDirty());
  structManager.onChanged(() => projectManager.markDirty());
  meshManager.onChanged(() => projectManager.markDirty());
  animBPManager.onChanged(() => projectManager.markDirty());
  widgetBPManager.onChanged(() => projectManager.markDirty());

  // Output log for Print String nodes
  const outputLog = new OutputLog(app);
  engine.onPrint = (value: any) => {
    console.log('[Print]', value);
    outputLog.log(value);
  };

  // Wire UIManager to use the same print function for widget blueprint Print String nodes
  engine.uiManager.setPrintFunction(engine.onPrint);

  // Update toolbar project name
  const projectNameEl = document.getElementById('toolbar-project-name')!;
  function updateProjectName() {
    if (projectManager.isProjectOpen) {
      projectNameEl.textContent = `📁 ${projectManager.projectName}`;
    } else {
      projectNameEl.textContent = '';
    }
  }

  // Wire save handler for blueprint editor Compile/Save buttons
  editor.setSaveHandler(async () => {
    if (projectManager.isProjectOpen) {
      await projectManager.saveProject();
      projectNameEl.textContent = `💾 Saved!`;
      setTimeout(updateProjectName, 1500);
    }
  });

  // --- File menu dropdown ---
  const fileBtn = document.getElementById('btn-file')!;
  const fileDropdown = document.getElementById('file-dropdown')!;

  fileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileDropdown.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    fileDropdown.classList.remove('show');
  });

  document.getElementById('menu-new-project')!.addEventListener('click', async () => {
    fileDropdown.classList.remove('show');
    const result = await showProjectDialog(app, projectManager);
    if (result.action !== 'cancelled') {
      updateProjectName();
    }
  });

  document.getElementById('menu-open-project')!.addEventListener('click', async () => {
    fileDropdown.classList.remove('show');
    const ok = await projectManager.openProject();
    if (ok) updateProjectName();
  });

  document.getElementById('menu-save')!.addEventListener('click', async () => {
    fileDropdown.classList.remove('show');
    if (projectManager.isProjectOpen) {
      await projectManager.saveProject();
    }
  });

  // --- Ctrl+S shortcut ---
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (projectManager.isProjectOpen) {
        await projectManager.saveProject();
        // Brief visual feedback
        projectNameEl.textContent = `💾 Saved!`;
        setTimeout(updateProjectName, 1500);
      }
    }
  });

  // --- Toolbar button handlers ---
  const playBtn = document.getElementById('btn-play')!;
  const stopBtn = document.getElementById('btn-stop')!;

  // Track gameplay window
  let gameplayWindow: any = null;

  playBtn.addEventListener('click', async () => {
    // ── 1. Fully re-sync all actor-asset instances from their latest asset ──
    // This ensures any blueprint edits (code, components, physics, mesh type)
    // are pushed into scene instances BEFORE we snapshot state.
    const syncedAssets = new Set<string>();
    for (const go of engine.scene.gameObjects) {
      if (!go.actorAssetId || syncedAssets.has(go.actorAssetId)) continue;
      const asset = editor.assetManager.getAsset(go.actorAssetId);
      if (!asset) continue;
      syncedAssets.add(asset.id);
      engine.scene.syncActorAssetInstances(
        asset.id,
        asset.name,
        asset.rootMeshType,
        asset.blueprintData,
        asset.compiledCode,
        asset.components,
        asset.rootPhysics,
        asset.actorType,
        asset.characterPawnConfig,
        asset.controllerClass,
        asset.controllerBlueprintId,
        asset.rootMaterialOverrides,
      );
    }

    // ── 2. Save FULL state snapshot before play ──
    for (const go of engine.scene.gameObjects) {
      (go as any)._savedPos = go.mesh.position.clone();
      (go as any)._savedRot = go.mesh.rotation.clone();
      (go as any)._savedScl = go.mesh.scale.clone();
      (go as any)._savedName = go.name;
      (go as any)._savedVisible = go.mesh.visible; // Save visibility for character pawns
      (go as any)._savedPhysicsCfg = go.physicsConfig
        ? structuredClone(go.physicsConfig)
        : null;
      // Save child mesh transforms so script-driven component moves are restored
      const childSnaps: Array<{ pos: any; rot: any; scl: any }> = [];
      for (const child of go.mesh.children) {
        childSnaps.push({
          pos: (child as any).position.clone(),
          rot: (child as any).rotation.clone(),
          scl: (child as any).scale.clone(),
        });
      }
      (go as any)._savedChildren = childSnaps;
    }

    // ── 3. Ensure compiled code is up-to-date ──
    for (const go of engine.scene.gameObjects) {
      if (go.actorAssetId) {
        const asset = editor.assetManager.getAsset(go.actorAssetId);
        if (asset && asset.compiledCode) {
          if (go.scripts.length === 0) {
            go.scripts.push(new ScriptComponent());
          }
          go.scripts[0].code = asset.compiledCode;
          go.scripts[0].compile();
        }
      }
    }

    // Clear & show the output log BEFORE firing lifecycle events
    // so that BeginPlay print output is visible
    outputLog.clear();
    outputLog.show();

    // ── 4. Check if we're in Tauri environment ──
    // Multiple checks for Tauri (different Tauri versions use different globals)
    const isTauri = '__TAURI__' in window ||
                    '__TAURI_INTERNALS__' in window ||
                    'ipc' in window ||
                    navigator.userAgent.includes('Tauri');

    console.log('[Editor] Running in Tauri:', isTauri);
    console.log('[Editor] __TAURI__ exists:', '__TAURI__' in window);
    console.log('[Editor] __TAURI_INTERNALS__ exists:', '__TAURI_INTERNALS__' in window);
    console.log('[Editor] window.ipc exists:', 'ipc' in window);
    console.log('[Editor] User agent:', navigator.userAgent);

    // Try to create gameplay window if in Tauri, fallback to in-editor if it fails
    // DISABLED: Gameplay window needs better architecture to preserve Engine state
    if (false && isTauri) {
      // ── Gameplay window mode (UE-style "Play in Window") ──
      try {
        console.log('[Editor] Attempting to import Tauri APIs...');

        // Import Tauri v2 APIs
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const { emit } = await import('@tauri-apps/api/event');

        console.log('[Editor] Tauri APIs imported successfully');
        console.log('[Editor] Creating gameplay window...');

        // Create gameplay window
        gameplayWindow = new WebviewWindow('gameplay', {
          url: '/gameplay.html',
          title: 'Feather Engine - Play Mode',
          width: 1280,
          height: 720,
          center: true,
          resizable: true,
          focus: true,
        });

        console.log('[Editor] WebviewWindow instantiated:', gameplayWindow);

        // Wait for window to be ready
        await gameplayWindow.once('tauri://created', async () => {
          console.log('[Editor] Gameplay window created, waiting for initialization...');

          // Give the gameplay window time to load and set up event listeners
          // This ensures the listener is ready before we emit the event
          await new Promise(resolve => setTimeout(resolve, 500));

          console.log('[Editor] Serializing scene data...');

          // Serialize scene data to send to gameplay window
          // Send the GameObject data directly from the editor scene
          const sceneData = {
            gameObjects: engine.scene.gameObjects.map((go: any) => {
              const actorAsset = go.actorAssetId ? editor.assetManager.getAsset(go.actorAssetId) : null;
              return {
                id: go.id,
                name: go.name,
                position: go.mesh.position.toArray(),
                rotation: go.mesh.rotation.toArray(),
                scale: go.mesh.scale.toArray(),
                actorAssetId: go.actorAssetId,
                actorType: go.actorType,
                // Serialize blueprint data
                blueprintData: {
                  variables: go.blueprintData.variables,
                  functions: go.blueprintData.functions,
                  macros: go.blueprintData.macros,
                  customEvents: go.blueprintData.customEvents,
                  structs: go.blueprintData.structs,
                  eventGraph: go.blueprintData.eventGraph,
                  functionGraphs: go.blueprintData.functionGraphs,
                },
                // Serialize component and physics data
                components: actorAsset?.components || [],
                compiledCode: go.scripts[0]?.code || '',
                physicsConfig: go.physicsConfig,
                characterPawnConfig: go.characterPawnConfig,
                controllerClass: go.controllerClass,
                controllerBlueprintId: go.controllerBlueprintId,
                // Serialize mesh type
                meshType: actorAsset?.rootMeshType || 'cube',
              };
            }),
          };

          console.log('[Editor] Sending', sceneData.gameObjects.length, 'game objects to gameplay window');

          // Send scene data to gameplay window
          await emit('gameplay:start', sceneData);

          console.log('[Editor] Scene data sent, event emitted');

          playBtn.style.display = 'none';
          stopBtn.style.display = '';
        });

        // Handle window close
        await gameplayWindow.once('tauri://destroyed', () => {
          console.log('[Editor] Gameplay window closed');
          gameplayWindow = null;
          stopBtn.click();
        });

      } catch (err) {
        console.error('[Editor] Failed to create gameplay window:', err);
        console.error('[Editor] Error details:', err);
        console.log('[Editor] Falling back to in-editor play mode');

        // Fallback to in-editor mode
        engine.physics.play(engine.scene);
        const canvas = editor.getCanvas();
        engine.onPlayStarted(canvas ?? undefined);

        const pawnCam = engine.characterControllers.getActiveCamera()
          ?? engine.spectatorControllers.getActiveCamera();
        if (pawnCam) {
          editor.setPlayCamera(pawnCam);
        }

        engine.scene.setTriggerHelpersVisible(false);
        engine.scene.setLightHelpersVisible(false);
        engine.scene.setComponentHelpersVisible(false);
        playBtn.style.display = 'none';
        stopBtn.style.display = '';
      }
    } else {
      // ── In-editor play mode (for browser/non-Tauri) ──
      console.log('[Editor] Starting in-editor play mode (not in Tauri)');

      engine.physics.play(engine.scene);
      const canvas = editor.getCanvas();
      engine.onPlayStarted(canvas ?? undefined);

      const pawnCam = engine.characterControllers.getActiveCamera()
        ?? engine.spectatorControllers.getActiveCamera();
      if (pawnCam) {
        editor.setPlayCamera(pawnCam);
      }

      engine.scene.setTriggerHelpersVisible(false);
      engine.scene.setLightHelpersVisible(false);
      engine.scene.setComponentHelpersVisible(false);
      playBtn.style.display = 'none';
      stopBtn.style.display = '';
    }
  });

  stopBtn.addEventListener('click', async () => {
    console.log('[Editor] Stop button clicked');

    // Close gameplay window if it exists
    if (gameplayWindow) {
      try {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('gameplay:stop');
        gameplayWindow = null;
      } catch (err) {
        console.error('[Editor] Failed to close gameplay window:', err);
      }
    }

    // Always run stop sequence (works for both in-editor and gameplay window modes)
    engine.onPlayStopped();
    engine.physics.stop(engine.scene);

    // Restore editor camera
    editor.setPlayCamera(null);

    engine.scene.setTriggerHelpersVisible(true);  // restore debug wireframes
    engine.scene.setLightHelpersVisible(true);     // restore light editor helpers
    engine.scene.setComponentHelpersVisible(true); // restore component helpers

    // Delay hiding the output log so OnDestroy print output is visible
    setTimeout(() => outputLog.hide(), 500);

    // ── Restore FULL saved state ──
    for (const go of engine.scene.gameObjects) {
      // Position, rotation, scale
      if ((go as any)._savedPos) go.mesh.position.copy((go as any)._savedPos);
      if ((go as any)._savedRot) go.mesh.rotation.copy((go as any)._savedRot);
      if ((go as any)._savedScl) go.mesh.scale.copy((go as any)._savedScl);

      // Name
      if ((go as any)._savedName !== undefined) go.name = (go as any)._savedName;

      // Restore mesh visibility (character pawn may have hidden it)
      if ((go as any)._savedVisible !== undefined) go.mesh.visible = (go as any)._savedVisible;

      // Physics config
      if ((go as any)._savedPhysicsCfg !== undefined) {
        go.physicsConfig = (go as any)._savedPhysicsCfg;
      }

      // Child mesh transforms
      const childSnaps = (go as any)._savedChildren as Array<{ pos: any; rot: any; scl: any }> | undefined;
      if (childSnaps) {
        for (let i = 0; i < Math.min(childSnaps.length, go.mesh.children.length); i++) {
          go.mesh.children[i].position.copy(childSnaps[i].pos);
          go.mesh.children[i].rotation.copy(childSnaps[i].rot);
          go.mesh.children[i].scale.copy(childSnaps[i].scl);
        }
      }

      // Clean up snapshot data
      delete (go as any)._savedPos;
      delete (go as any)._savedRot;
      delete (go as any)._savedScl;
      delete (go as any)._savedName;
      delete (go as any)._savedVisible;
      delete (go as any)._savedPhysicsCfg;
      delete (go as any)._savedChildren;
    }

    // Re-sync from assets so the editor-side state is authoritative
    for (const go of engine.scene.gameObjects) {
      if (!go.actorAssetId) continue;
      const asset = editor.assetManager.getAsset(go.actorAssetId);
      if (!asset) continue;
      // Re-apply compiled code so next Play uses latest
      if (asset.compiledCode) {
        if (go.scripts.length === 0) go.scripts.push(new ScriptComponent());
        go.scripts[0].code = asset.compiledCode;
        go.scripts[0].compile();
      }
    }

    playBtn.style.display = '';
    stopBtn.style.display = 'none';
  });

  document.getElementById('btn-add-cube')!.addEventListener('click', () => {
    const count = engine.scene.gameObjects.filter(
      (o) => o.mesh.geometry.type === 'BoxGeometry'
    ).length;
    engine.scene.addGameObject(`Cube${count > 0 ? '_' + count : ''}`, 'cube');
  });

  document.getElementById('btn-add-sphere')!.addEventListener('click', () => {
    const count = engine.scene.gameObjects.filter(
      (o) => o.mesh.geometry.type === 'SphereGeometry'
    ).length;
    engine.scene.addGameObject(`Sphere${count > 0 ? '_' + count : ''}`, 'sphere');
  });

  // --- Main loop ---
  function loop() {
    engine.update();
    editor.render();
    if (engine.physics.isPlaying) {
      editor.refreshProperties();
    }
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // --- Show project dialog on startup ---
  const result = await showProjectDialog(app, projectManager);
  if (result.action === 'cancelled') {
    // User skipped — add a default cube so the scene isn't empty
    engine.scene.addGameObject('Cube', 'cube');
  }
  updateProjectName();

  console.log('Feather Engine ready');
}

main().catch((err) => {
  console.error('Feather Engine failed to start:', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div style="color:#f55;padding:20px;font-family:monospace;">
      <h2>Feather Engine Error</h2>
      <pre>${err?.message || err}\n${err?.stack || ''}</pre>
    </div>`;
  }
});
