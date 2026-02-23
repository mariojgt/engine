import './styles.css';
import 'dockview-core/dist/styles/dockview.css';
import { initFeatherSelect } from './editor/FeatherSelect';
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
import { GameInstanceBlueprintManager } from './editor/GameInstanceData';
import { SaveGameAssetManager } from './editor/SaveGameAsset';
import { TextureLibrary } from './editor/TextureLibrary';
import { SoundLibrary } from './editor/SoundLibrary';
import { FontLibrary } from './editor/FontLibrary';
import { setStructureAssetManager, setActorAssetManager, setWidgetBPManager, setGameInstanceBPManager } from './editor/NodeEditorPanel';
import { SceneJSON, serializeScene, deserializeScene } from './editor/SceneSerializer';
import { setSceneListProvider } from './editor/nodes/utility/OpenSceneNode';
import { iconHTML, Icons, ICON_COLORS } from './editor/icons';

async function main() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  // Initialize custom select dropdowns (auto-upgrades all <select> elements)
  initFeatherSelect();

  // Scene state backup for play mode isolation
  let prePlaySceneState: SceneJSON | null = null;

  // Create engine
  const engine = new Engine();
  await engine.init();

  // Build toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  toolbar.innerHTML = `
    <span class="toolbar-title">${iconHTML(Icons.Feather, 'md', ICON_COLORS.blue)} Feather Engine</span>
    <div class="toolbar-separator"></div>
    <div class="toolbar-dropdown" id="file-menu">
      <button class="toolbar-btn" id="btn-file">File ${iconHTML(Icons.ChevronDown, 'xs')}</button>
      <div class="toolbar-dropdown-content" id="file-dropdown">
        <div class="toolbar-dropdown-item" id="menu-new-project">New Project…</div>
        <div class="toolbar-dropdown-item" id="menu-open-project">Open Project…</div>
        <div class="toolbar-dropdown-divider"></div>
        <div class="toolbar-dropdown-item" id="menu-new-scene">New Scene…</div>
        <div class="toolbar-dropdown-item" id="menu-open-scene">Open Scene…</div>
        <div class="toolbar-dropdown-item" id="menu-duplicate-scene">Duplicate Scene…</div>
        <div class="toolbar-dropdown-divider"></div>
        <div class="toolbar-dropdown-item" id="menu-save"><span>Save</span><span class="shortcut">Ctrl+S</span></div>
      </div>
    </div>
    <div class="toolbar-dropdown" id="window-menu">
      <button class="toolbar-btn" id="btn-window">Window ${iconHTML(Icons.ChevronDown, 'xs')}</button>
      <div class="toolbar-dropdown-content" id="window-dropdown">
        <div class="toolbar-dropdown-item" id="menu-dock-all">Dock All Panels</div>
        <div class="toolbar-dropdown-item" id="menu-reset-layout">Reset Layout</div>
        <div class="toolbar-dropdown-divider"></div>
        <div class="toolbar-dropdown-item disabled" id="menu-detached-header" style="opacity:0.5;pointer-events:none;font-style:italic;">Detached Panels</div>
        <div id="detached-panels-list"></div>
      </div>
    </div>
    <div class="toolbar-separator"></div>
    <button class="toolbar-btn play" id="btn-play">${iconHTML(Icons.Play, 'xs')} Play</button>
    <button class="toolbar-btn stop" id="btn-stop" style="display:none">${iconHTML(Icons.Square, 'xs')} Stop</button>
    <div class="toolbar-separator"></div>
    <button class="toolbar-btn" id="btn-add-cube">+ Cube</button>
    <button class="toolbar-btn" id="btn-add-sphere">+ Sphere</button>
    <div class="toolbar-spacer"></div>
    <span class="toolbar-scene-name" id="toolbar-scene-name"></span>
    <div class="toolbar-separator"></div>
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
  // Also wire into the scene so runtime spawnActorFromClass can look up actor assets
  engine.scene.assetManager = editor.assetManager;

  // Create texture and font libraries (singletons used by widget editor)
  new TextureLibrary();
  new FontLibrary();

  // Create sound library (singletons for audio asset management)
  new SoundLibrary();

  // Wire Sound Cue resolver into the audio engine so blueprint nodes
  // that reference cue IDs get resolved to actual sound URLs at runtime.
  engine.audio.setSoundCueResolver((cueId: string) => {
    const lib = SoundLibrary.instance;
    if (!lib) return null;
    return lib.resolveCueToSoundURL(cueId);
  });

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

  // Create game instance blueprint manager
  const gameInstanceManager = new GameInstanceBlueprintManager();
  projectManager.setGameInstanceManager(gameInstanceManager);
  editor.setGameInstanceManager(gameInstanceManager);
  engine.gameInstanceManager = gameInstanceManager;

  // Create save game asset manager (save game class definitions)
  const saveGameManager = new SaveGameAssetManager();
  projectManager.setSaveGameManager(saveGameManager);
  editor.setSaveGameManager(saveGameManager);

  // Wire up sound library callbacks into content browser
  editor.setSoundLibraryCallbacks();

  // Wire up folder manager with project manager
  editor.setProjectManager(projectManager);

  // Wire widget BP manager into node editor for Create Widget picker
  setWidgetBPManager(widgetBPManager);

  // Wire game instance BP manager into node editor for GI dropdowns
  setGameInstanceBPManager(gameInstanceManager);

  // Wire project manager into the engine so blueprint nodes can switch scenes at runtime
  engine.projectManager = projectManager;

  // Wire scene list provider so Open Scene node dropdown can list available scenes
  setSceneListProvider(() => projectManager.listScenes());

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

  // Wire 2D scene mode callbacks so scene mode survives save/load
  projectManager.getSceneMode = () => editor.getSceneMode();
  projectManager.getScene2DData = () => editor.scene2DManager.toJSON();
  projectManager.setScene2DData = (data: any) => editor.scene2DManager.fromJSON(data);
  projectManager.getScene2DManager = () => editor.scene2DManager;
  // Wire scene2DManager into the Engine so Camera 2D blueprint nodes
  // (which use __engine.scene2DManager.camera2D) resolve at runtime
  // from both actor-blueprint and AnimBP2D script contexts.
  engine.scene2DManager = editor.scene2DManager;

  // Wire composition manager so environment actors (lights, sky, fog, etc.) are saved/loaded
  projectManager.setCompositionManager(editor.composition);

  // Wire auto-save: mark dirty when scene or assets change
  engine.scene.onChanged(() => projectManager.markDirty());
  editor.scene2DManager.onChange(() => projectManager.markDirty());
  // Refresh edit-mode sprite previews whenever 2D scene data changes (debounced 300 ms)
  let _editPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  editor.scene2DManager.onChange(() => {
    if (_editPreviewTimer) clearTimeout(_editPreviewTimer);
    _editPreviewTimer = setTimeout(() => {
      _editPreviewTimer = null;
      if (!editor.scene2DManager.isPlaying && editor.scene2DManager.sceneMode === '2D') {
        editor.scene2DManager.setupEditPreviews(engine.scene.gameObjects, editor.assetManager);
      }
    }, 300);
  });
  editor.assetManager.onChanged(() => projectManager.markDirty());
  structManager.onChanged(() => projectManager.markDirty());
  meshManager.onChanged(() => projectManager.markDirty());
  animBPManager.onChanged(() => projectManager.markDirty());
  widgetBPManager.onChanged(() => projectManager.markDirty());
  gameInstanceManager.onChanged(() => projectManager.markDirty());

  // Output log for Print String nodes
  const outputLog = new OutputLog(app);
  engine.onPrint = (value: any) => {
    console.log('[Print]', value);
    outputLog.log(value);
  };

  // Wire the same print function into the 2D Scene Manager so that
  // Print String nodes inside AnimBP 2D Event Graphs appear in the Output Log.
  editor.scene2DManager.printFn = engine.onPrint;

  // Wire UIManager to use the same print function for widget blueprint Print String nodes
  engine.uiManager.setPrintFunction(engine.onPrint);

  // Update toolbar project name
  const projectNameEl = document.getElementById('toolbar-project-name')!;
  const sceneNameEl = document.getElementById('toolbar-scene-name')!;
  function updateProjectName() {
    if (projectManager.isProjectOpen) {
      projectNameEl.innerHTML = `${iconHTML(Icons.Folder, 'sm', ICON_COLORS.folder)} ${projectManager.projectName}`;
      sceneNameEl.innerHTML = `${iconHTML(Icons.Clapperboard, 'sm', ICON_COLORS.secondary)} ${projectManager.activeSceneName}`;
    } else {
      projectNameEl.innerHTML = '';
      sceneNameEl.innerHTML = '';
    }
  }

  // Keep scene name in sync when ProjectManager switches scenes
  projectManager.onSceneChanged = (name: string) => {
    sceneNameEl.innerHTML = `${iconHTML(Icons.Clapperboard, 'sm', ICON_COLORS.secondary)} ${name}`;
  };

  // Listen for 2D/3D scene mode detection on scene load
  projectManager.onSceneModeDetected = async (mode: '2D' | '3D') => {
    if (mode === '2D') {
      await editor.scene2DManager.switchTo2D(engine.scene.threeScene, editorContainer);
      editor.switchSceneMode('2D');
      console.log('[Editor] Switched to 2D mode');
      // Spawn edit-mode sprite previews so 2D pawns show their sprite instead of a black box
      editor.scene2DManager.setupEditPreviews(engine.scene.gameObjects, editor.assetManager);
    } else {
      editor.scene2DManager.switchTo3D(engine.scene.threeScene);
      editor.switchSceneMode('3D');
      console.log('[Editor] Switched to 3D mode');
    }
  };

  // Wire save handler for blueprint editor Compile/Save buttons
  editor.setSaveHandler(async () => {
    if (projectManager.isProjectOpen) {
      await projectManager.saveProject();
      projectNameEl.innerHTML = `${iconHTML(Icons.Save, 'sm', ICON_COLORS.green)} Saved!`;
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
    windowDropdown.classList.remove('show');
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

  // --- New Scene ---
  document.getElementById('menu-new-scene')!.addEventListener('click', async () => {
    fileDropdown.classList.remove('show');
    if (!projectManager.isProjectOpen) return;

    // Ask for scene mode (2D or 3D)
    const sceneMode = await showSceneModeDialog(app);
    if (!sceneMode) return;

    const name = await showSceneNameDialog(app, 'New Scene', 'Enter a name for the new scene:');
    if (!name) return;
    const ok = await projectManager.createScene(name, sceneMode as '2D' | '3D');
    if (ok) {
      // If 2D mode, initialize the Scene2DManager
      if (sceneMode === '2D') {
        await editor.scene2DManager.switchTo2D(engine.scene.threeScene, editorContainer);
        editor.switchSceneMode('2D');
      } else {
        editor.scene2DManager.switchTo3D(engine.scene.threeScene);
        editor.switchSceneMode('3D');
      }
      updateProjectName();
      projectNameEl.innerHTML = `${iconHTML(Icons.Clapperboard, 'sm', ICON_COLORS.green)} Scene created! (${sceneMode})`;
      setTimeout(updateProjectName, 1500);
    }
  });

  // --- Open Scene ---
  document.getElementById('menu-open-scene')!.addEventListener('click', async () => {
    fileDropdown.classList.remove('show');
    if (!projectManager.isProjectOpen) return;
    const scenes = await projectManager.listScenes();
    if (scenes.length === 0) return;
    const chosen = await showScenePickerDialog(app, scenes, projectManager.activeSceneName);
    if (!chosen || chosen === projectManager.activeSceneName) return;
    const ok = await projectManager.openScene(chosen);
    if (ok) {
      updateProjectName();
    }
  });

  // --- Duplicate Scene ---
  document.getElementById('menu-duplicate-scene')!.addEventListener('click', async () => {
    fileDropdown.classList.remove('show');
    if (!projectManager.isProjectOpen) return;
    const defaultName = `${projectManager.activeSceneName}_Copy`;
    const name = await showSceneNameDialog(app, 'Duplicate Scene', 'Enter a name for the duplicated scene:', defaultName);
    if (!name) return;
    const ok = await projectManager.duplicateScene(name);
    if (ok) {
      // Switch to the duplicate
      await projectManager.openScene(name);
      updateProjectName();
    }
  });

  // --- Ctrl+S shortcut ---
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (projectManager.isProjectOpen) {
        await projectManager.saveProject();
        // Brief visual feedback
        projectNameEl.innerHTML = `${iconHTML(Icons.Save, 'sm', ICON_COLORS.green)} Saved!`;
        setTimeout(updateProjectName, 1500);
      }
    }
  });

  // --- Window menu dropdown ---
  const windowBtn = document.getElementById('btn-window')!;
  const windowDropdown = document.getElementById('window-dropdown')!;
  const detachedListEl = document.getElementById('detached-panels-list')!;
  const dockingMgr = editor.getDockingManager();

  windowBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    windowDropdown.classList.toggle('show');
    fileDropdown.classList.remove('show');
    _refreshDetachedList();
  });

  // Close Window dropdown when another dropdown opens
  fileBtn.addEventListener('click', () => {
    windowDropdown.classList.remove('show');
  });

  document.getElementById('menu-dock-all')!.addEventListener('click', () => {
    windowDropdown.classList.remove('show');
    dockingMgr.dockAll();
  });

  document.getElementById('menu-reset-layout')!.addEventListener('click', () => {
    windowDropdown.classList.remove('show');
    // Dock all floating panels first, then let user refresh if needed
    dockingMgr.dockAll();
  });

  function _refreshDetachedList() {
    detachedListEl.innerHTML = '';
    const panels = dockingMgr.getDetachedPanels();
    if (panels.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'toolbar-dropdown-item disabled';
      empty.style.opacity = '0.4';
      empty.style.pointerEvents = 'none';
      empty.style.fontStyle = 'italic';
      empty.textContent = 'No detached panels';
      detachedListEl.appendChild(empty);
      return;
    }
    for (const info of panels) {
      const item = document.createElement('div');
      item.className = 'toolbar-dropdown-item';
      const modeIcon = info.mode === 'floating' ? '⊞' : '⧉';
      item.innerHTML = `<span>${modeIcon} ${info.title}</span><span class="shortcut" style="font-size:10px;opacity:0.6;">Dock</span>`;
      item.addEventListener('click', () => {
        windowDropdown.classList.remove('show');
        const panel = editor.getDockviewApi().getPanel(info.panelId);
        if (panel) dockingMgr.dockPanel(panel);
      });
      detachedListEl.appendChild(item);
    }
  }

  // Keep the list updated when panels are docked/undocked
  dockingMgr.onChange(() => _refreshDetachedList());

  // --- Toolbar button handlers ---
  const playBtn = document.getElementById('btn-play')!;
  const stopBtn = document.getElementById('btn-stop')!;

  // Track gameplay window
  let gameplayWindow: any = null;

  // Track which GOs existed before play so we can remove runtime-spawned ones on stop
  let prePlayGameObjectIds = new Set<number>();

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

    // ── 2a. Save pre-play scene snapshot to disk so Stop can restore it ──
    await projectManager.savePrePlaySnapshot();

    // ── 2b. Save FULL state snapshot before play ──
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

    // ── 2c. Record which GOs exist pre-play so we can cleanup runtime-spawned actors on Stop ──
    prePlayGameObjectIds = new Set(engine.scene.gameObjects.map(go => go.id));

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
            // Include Sound Cue + Sound data so the gameplay window can resolve cue IDs
            soundData: {
              sounds: SoundLibrary.instance?.exportAllSounds() ?? [],
              cues: SoundLibrary.instance?.exportAllCues() ?? [],
            },
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

      // Serialize scene before play starts
      console.log('[Editor] Creating isolated scene backup...');
      prePlaySceneState = serializeScene(engine.scene, projectManager.activeSceneName || 'Untitled');

      const is2DMode = editor.getSceneMode() === '2D';

      if (is2DMode) {
        // ── 2D Play Mode ──
        console.log('[Editor] 2D play mode — spawning 2D actors');

        // Enable 3D physics isPlaying so the script tick loop runs
        engine.physics.play(engine.scene);
        const canvas = editor.getCanvas();
        engine.onPlayStarted(canvas ?? undefined);

        // Also start 2D physics (async — reinitialises Rapier world for clean state)
        await editor.scene2DManager.startPlay();

        // Spawn SpriteActors for all characterPawn2D game objects
        let firstPawnActor: any = null;
        for (const go of engine.scene.gameObjects) {
          if (go.actorType === 'characterPawn2D') {
            const movConfig = (() => {
              if (!go.actorAssetId) return undefined;
              const asset = editor.assetManager.getAsset(go.actorAssetId);
              return asset?.characterMovement2DConfig ?? undefined;
            })();
            const actor = editor.scene2DManager.spawnCharacterPawn2D(go, movConfig, editor.assetManager, editor.animBPManager);
            if (actor && !firstPawnActor) {
              firstPawnActor = actor;
              // Apply Camera2D config: prefer the Camera2D component on the asset,
              // fall back to characterMovement2DConfig.camera2D for legacy assets.
              const pawnAsset = go.actorAssetId ? editor.assetManager.getAsset(go.actorAssetId) : null;
              const cam2dComp = pawnAsset?.components?.find((c: any) => c.type === 'camera2d');
              const camCfg = cam2dComp?.camera2dConfig ?? movConfig?.camera2D;
              if (editor.scene2DManager.camera2D && camCfg) {
                if ((camCfg.pixelsPerUnit ?? 0) > 0) {
                  editor.scene2DManager.camera2D.setPixelsPerUnit(camCfg.pixelsPerUnit);
                }
                editor.scene2DManager.camera2D.setPixelPerfect(camCfg.pixelPerfect ?? false);
                editor.scene2DManager.camera2D.setZoom(camCfg.defaultZoom ?? 1.0);
              }
            }
          }
        }

        // Spawn SpriteActors for all spriteActor game objects (simple 2D sprites
        // with optional physics/collision but without character movement).
        for (const go of engine.scene.gameObjects) {
          if (go.actorType === 'spriteActor') {
            editor.scene2DManager.spawnSpriteActor2D(go, editor.assetManager, editor.animBPManager);
          }
        }

        // Camera follows the first character pawn using config smoothing / dead zone
        if (firstPawnActor && editor.scene2DManager.camera2D) {
          const firstPawnGO = engine.scene.gameObjects.find(
            g => g.actorType === 'characterPawn2D' && g.actorAssetId
          );
          const firstPawnAsset = firstPawnGO ? editor.assetManager.getAsset(firstPawnGO.actorAssetId!) : null;
          const cam2dComp = firstPawnAsset?.components?.find((c: any) => c.type === 'camera2d');
          const camCfg = cam2dComp?.camera2dConfig
            ?? firstPawnAsset?.characterMovement2DConfig?.camera2D;
          const smoothing  = camCfg?.followSmoothing ?? 0.15;
          const deadZoneX  = camCfg?.deadZoneX       ?? 0.5;
          const deadZoneY  = camCfg?.deadZoneY       ?? 0.5;
          editor.scene2DManager.camera2D.follow(firstPawnActor, smoothing, { x: deadZoneX, y: deadZoneY });
        }

        // Log final physics world stats for debugging
        if (editor.scene2DManager.physics2D) {
          const stats = editor.scene2DManager.physics2D.getWorldStats();
          console.log('[Editor] 2D Play — Rapier world stats: bodies=%d (dynamic=%d, fixed=%d), colliders=%d',
            stats.bodies, stats.dynamicBodies, stats.fixedBodies, stats.colliders);
          if (stats.fixedBodies === 0) {
            console.warn('[Editor] ⚠ NO FIXED (TILE) BODIES in Rapier world! Tile collision will not work.');
          }
          if (stats.colliders === 0) {
            console.warn('[Editor] ⚠ NO COLLIDERS in Rapier world! Nothing will collide.');
          }
        }

        // Don't set a 3D _playCamera — let 2D render continue
        editor.set2DPlayMode(true);
      } else {
        // ── 3D Play Mode ──
        engine.physics.play(engine.scene);
        const canvas = editor.getCanvas();
        engine.onPlayStarted(canvas ?? undefined);

        const pawnCam = engine.characterControllers.getActiveCamera()
          ?? engine.spectatorControllers.getActiveCamera();
        if (pawnCam) {
          editor.setPlayCamera(pawnCam);
        }
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
    // Use try-finally so the play/stop button state ALWAYS resets even if
    // an error occurs mid-cleanup (otherwise the UI gets permanently locked).
    try {

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

    // Stop 2D play mode (cleans up sprite actors, physics, camera follow)
    let was2DPlaying = false;
    if (editor.scene2DManager.isPlaying) {
      was2DPlaying = true;
      // Clean runtime component refs from game objects so they don't leak
      for (const go of engine.scene.gameObjects) {
        go._runtimeComponents.clear();
      }
      editor.scene2DManager.stopPlay();
      editor.set2DPlayMode(false);
    }

    // Restore editor camera
    editor.setPlayCamera(null);

    engine.scene.setTriggerHelpersVisible(true);  // restore debug wireframes
    engine.scene.setLightHelpersVisible(true);     // restore light editor helpers
    engine.scene.setComponentHelpersVisible(true); // restore component helpers

    // Delay hiding the output log so OnDestroy print output is visible
    setTimeout(() => outputLog.hide(), 500);

    // ── Restore the filtered original scene ──
    // In 2D mode the original GameObjects are untouched (only sprite actors
    // were added to root2D and already cleaned up), so skip deserializing
    // which would call scene.clear() and destroy tilesets / 2D state.
    if (was2DPlaying) {
      console.log('[Editor] 2D play stopped — skipping 3D scene restore (2D state preserved)');
      prePlaySceneState = null;
      // Restore GO mesh positions/rotations/scales to their pre-play state.
      // 3D physics (which runs alongside 2D play) can move go.mesh, so we
      // must reset before re-spawning edit previews (which read go.mesh.position).
      for (const go of engine.scene.gameObjects) {
        if ((go as any)._savedPos) { go.mesh.position.copy((go as any)._savedPos); (go as any)._savedPos = null; }
        if ((go as any)._savedRot) { go.mesh.rotation.copy((go as any)._savedRot); (go as any)._savedRot = null; }
        if ((go as any)._savedScl) { go.mesh.scale.copy((go as any)._savedScl); (go as any)._savedScl = null; }
        if ((go as any)._savedVisible !== undefined) {
          go.mesh.visible = (go as any)._savedVisible;
          (go as any)._savedVisible = undefined;
        }
      }
      // Re-spawn edit-mode sprite previews now that play actors are gone
      editor.scene2DManager.setupEditPreviews(engine.scene.gameObjects, editor.assetManager);
    } else if (prePlaySceneState) {
      console.log('[Editor] Restoring isolated scene state...');
      deserializeScene(engine.scene, prePlaySceneState, editor.assetManager, meshManager);
      prePlaySceneState = null;
    } else {
      // Fallback relative restoration
      console.warn('[Editor] No pre-play state found, attempting partial restore...');
      const sceneWasRestored = await projectManager.restorePrePlayScene();

      if (sceneWasRestored) {
        (engine.scene as any)._runtimeDestroyedGOs = [];
      } else {
        if (typeof (engine.scene as any).restoreRuntimeDestroyedActors === 'function') {
          (engine.scene as any).restoreRuntimeDestroyedActors();
        }
        // Remove runtime-spawned actors
        const spawnedAtRuntime = engine.scene.gameObjects.filter(go => !prePlayGameObjectIds.has(go.id));
        for (const go of spawnedAtRuntime) {
          engine.scene.removeGameObject(go);
        }
      }
    }

    } finally {
      playBtn.style.display = '';
      stopBtn.style.display = 'none';
    }
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
    try {
      engine.update();
      editor.render();
      if (engine.physics.isPlaying) {
        editor.refreshProperties();
      }
    } catch (err) {
      // Log but never let an exception kill the RAF loop — a crashed loop is
      // unrecoverable (game freezes and Stop/Play buttons stop working).
      console.error('[Loop] Uncaught error in game loop — continuing:', err);
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

// ============================================================
//  Scene Name Dialog — prompts user for a scene name
// ============================================================

// ============================================================
//  Scene Mode Dialog — ask user for 2D or 3D
// ============================================================

function showSceneModeDialog(parentEl: HTMLElement): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scene-dialog-overlay';

    overlay.innerHTML = `
      <div class="scene-dialog" style="max-width:420px;">
        <div class="scene-dialog-title">New Scene</div>
        <label class="scene-dialog-label">Choose scene mode:</label>
        <div style="display:flex;gap:12px;margin:12px 0;">
          <button class="scene-dialog-btn confirm mode-btn" data-mode="3D" style="flex:1;padding:18px 0;font-size:16px;">
            ${iconHTML(Icons.Box, 'lg', ICON_COLORS.blue)} 3D
          </button>
          <button class="scene-dialog-btn confirm mode-btn" data-mode="2D" style="flex:1;padding:18px 0;font-size:16px;">
            ${iconHTML(Icons.Palette, 'lg', ICON_COLORS.blue)} 2D
          </button>
        </div>
        <div class="template-section" style="display:none;margin-top:8px;">
          <label class="scene-dialog-label" style="margin-bottom:6px;">2D Template:</label>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <label class="template-option" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid #333;background:#1a1a2e;">
              <input type="radio" name="template2d" value="blank" checked style="accent-color:#4fc3f7;" />
              <div><strong>Blank 2D</strong><br/><span style="color:#888;font-size:11px;">Empty scene with grid</span></div>
            </label>
            <label class="template-option" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid #333;background:#1a1a2e;">
              <input type="radio" name="template2d" value="platformer" style="accent-color:#4fc3f7;" />
              <div><strong>Platformer</strong><br/><span style="color:#888;font-size:11px;">Side-scroll with gravity &amp; parallax</span></div>
            </label>
            <label class="template-option" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid #333;background:#1a1a2e;">
              <input type="radio" name="template2d" value="topdown" style="accent-color:#4fc3f7;" />
              <div><strong>Top-Down</strong><br/><span style="color:#888;font-size:11px;">Overhead view, no gravity (RPG/action)</span></div>
            </label>
          </div>
        </div>
        <div class="scene-dialog-actions">
          <button class="scene-dialog-btn cancel">Cancel</button>
        </div>
      </div>
    `;

    parentEl.appendChild(overlay);

    const templateSection = overlay.querySelector('.template-section') as HTMLElement;
    let selectedMode: string | null = null;

    const close = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode ?? null;
        if (mode === '2D') {
          // Show template selection, highlight the button
          selectedMode = '2D';
          templateSection.style.display = 'block';
          overlay.querySelectorAll('.mode-btn').forEach(b => {
            (b as HTMLElement).style.opacity = b === btn ? '1' : '0.4';
          });
        } else {
          // 3D selected — resolve immediately
          close('3D');
        }
      });
    });

    // Clicking a template option also confirms 2D choice
    overlay.querySelectorAll('.template-option').forEach(opt => {
      opt.addEventListener('dblclick', () => {
        if (selectedMode === '2D') close('2D');
      });
    });

    // Add a "Create" button that appears once 2D is selected
    const actionsDiv = overlay.querySelector('.scene-dialog-actions')!;
    const createBtn = document.createElement('button');
    createBtn.className = 'scene-dialog-btn confirm';
    createBtn.textContent = 'Create 2D Scene';
    createBtn.style.display = 'none';
    actionsDiv.insertBefore(createBtn, actionsDiv.firstChild);

    // Observer: show create button once 2D is selected
    const observer = new MutationObserver(() => {
      if (templateSection.style.display !== 'none') {
        createBtn.style.display = '';
      }
    });
    observer.observe(templateSection, { attributes: true, attributeFilter: ['style'] });

    // Also show it immediately on mode-btn click
    overlay.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if ((btn as HTMLElement).dataset.mode === '2D') {
          createBtn.style.display = '';
        }
      });
    });

    createBtn.addEventListener('click', () => close('2D'));

    overlay.querySelector('.cancel')!.addEventListener('click', () => close(null));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    overlay.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') close(null);
    });
  });
}

// ============================================================
//  Scene Name Dialog — used for New / Duplicate scene
// ============================================================

function showSceneNameDialog(
  parentEl: HTMLElement,
  title: string,
  label: string,
  defaultValue: string = '',
): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scene-dialog-overlay';

    overlay.innerHTML = `
      <div class="scene-dialog">
        <div class="scene-dialog-title">${title}</div>
        <label class="scene-dialog-label">${label}</label>
        <input class="scene-dialog-input" type="text" value="${defaultValue}" placeholder="MyScene" maxlength="64" />
        <div class="scene-dialog-actions">
          <button class="scene-dialog-btn cancel">Cancel</button>
          <button class="scene-dialog-btn confirm">Create</button>
        </div>
      </div>
    `;

    parentEl.appendChild(overlay);

    const input = overlay.querySelector('.scene-dialog-input') as HTMLInputElement;
    const confirmBtn = overlay.querySelector('.scene-dialog-btn.confirm') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('.scene-dialog-btn.cancel') as HTMLButtonElement;

    input.focus();
    input.select();

    const close = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };

    confirmBtn.addEventListener('click', () => {
      const val = input.value.trim();
      close(val || null);
    });

    cancelBtn.addEventListener('click', () => close(null));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        close(val || null);
      } else if (e.key === 'Escape') {
        close(null);
      }
    });
  });
}

// ============================================================
//  Scene Picker Dialog — shows list of scenes to open
// ============================================================

function showScenePickerDialog(
  parentEl: HTMLElement,
  scenes: string[],
  activeScene: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scene-dialog-overlay';

    const sceneItems = scenes.map(s => {
      const isActive = s === activeScene;
      return `
        <div class="scene-picker-item ${isActive ? 'active' : ''}" data-scene="${s}">
          <span class="scene-picker-icon">${isActive ? iconHTML(Icons.Clapperboard, 'sm', ICON_COLORS.blue) : iconHTML(Icons.FileText, 'sm', ICON_COLORS.muted)}</span>
          <span class="scene-picker-name">${s}</span>
          ${isActive ? '<span class="scene-picker-badge">Current</span>' : ''}
        </div>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="scene-dialog scene-picker">
        <div class="scene-dialog-title">Open Scene</div>
        <div class="scene-dialog-label">Select a scene to open:</div>
        <div class="scene-picker-list">
          ${sceneItems}
        </div>
        <div class="scene-dialog-actions">
          <button class="scene-dialog-btn cancel">Cancel</button>
        </div>
      </div>
    `;

    parentEl.appendChild(overlay);

    const close = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };

    // Scene item click
    overlay.querySelectorAll('.scene-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = (item as HTMLElement).dataset.scene;
        close(name ?? null);
      });
    });

    // Cancel
    overlay.querySelector('.scene-dialog-btn.cancel')!.addEventListener('click', () => close(null));

    // Overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    // Escape key
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler);
        close(null);
      }
    };
    document.addEventListener('keydown', keyHandler);
  });
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

// ============================================================
//  Scene Name Dialog — prompts user for a scene name
// ============================================================
