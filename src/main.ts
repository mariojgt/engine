import './styles.css';
import 'dockview-core/dist/styles/dockview.css';
import { Engine } from './engine';
import { EditorLayout } from './editor/EditorLayout';
import { OutputLog } from './editor/OutputLog';
import { ScriptComponent } from './engine/ScriptComponent';
import { ProjectManager } from './editor/ProjectManager';
import { showProjectDialog } from './editor/ProjectDialog';

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

  // Create project manager
  const projectManager = new ProjectManager(engine, editor.assetManager);

  // Wire camera state callbacks
  projectManager.getCameraState = () => editor.getCameraState();
  projectManager.applyCameraState = (state) => editor.applyCameraState(state);

  // Wire auto-save: mark dirty when scene or assets change
  engine.scene.onChanged(() => projectManager.markDirty());
  editor.assetManager.onChanged(() => projectManager.markDirty());

  // Output log for Print String nodes
  const outputLog = new OutputLog(app);
  engine.onPrint = (value: any) => {
    console.log('[Print]', value);
    outputLog.log(value);
  };

  // Update toolbar project name
  const projectNameEl = document.getElementById('toolbar-project-name')!;
  function updateProjectName() {
    if (projectManager.isProjectOpen) {
      projectNameEl.textContent = `📁 ${projectManager.projectName}`;
    } else {
      projectNameEl.textContent = '';
    }
  }

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

  playBtn.addEventListener('click', () => {
    // Save positions before play
    for (const go of engine.scene.gameObjects) {
      (go as any)._savedPos = go.mesh.position.clone();
      (go as any)._savedRot = go.mesh.rotation.clone();
    }

    // Pre-compile actor-asset instances: copy latest compiled code from asset
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

    engine.physics.play(engine.scene);
    engine.onPlayStarted();
    outputLog.clear();
    outputLog.show();
    playBtn.style.display = 'none';
    stopBtn.style.display = '';
  });

  stopBtn.addEventListener('click', () => {
    engine.onPlayStopped();
    engine.physics.stop(engine.scene);
    outputLog.hide();
    // Restore saved positions
    for (const go of engine.scene.gameObjects) {
      if ((go as any)._savedPos) {
        go.mesh.position.copy((go as any)._savedPos);
        go.mesh.rotation.copy((go as any)._savedRot);
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
