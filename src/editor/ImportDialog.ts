// ============================================================
//  ImportDialog — UE-style mesh import settings dialog
//  Shows detected file info, import options for mesh,
//  materials, textures, skeleton, animations, and transform.
// ============================================================

import {
  type MeshImportSettings,
  defaultImportSettings,
  getImportFormat,
  type ImportMeshFormat,
} from './MeshAsset';

export interface ImportDialogResult {
  settings: MeshImportSettings;
  cancelled: boolean;
}

/**
 * Show a UE-style import settings dialog overlay.
 * Returns a Promise that resolves when the user clicks Import or Cancel.
 */
export function showImportDialog(
  file: File,
  detectedInfo?: { hasSkeleton: boolean; animationCount: number; meshCount: number },
): Promise<ImportDialogResult> {
  return new Promise((resolve) => {
    const settings = defaultImportSettings(file.name);
    const format = getImportFormat(file.name);
    const supportsAnimation = ['gltf', 'glb', 'fbx', 'dae'].includes(format);
    const supportsMaterials = ['gltf', 'glb', 'fbx', 'obj', 'dae'].includes(format);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'import-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'import-dialog';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'import-dialog-header';
    header.innerHTML = `
      <span class="import-dialog-title">📦 Import Mesh: ${file.name}</span>
      <span class="import-dialog-subtitle">${formatLabel(format)} · ${formatSize(file.size)}</span>
    `;
    dialog.appendChild(header);

    // ── Body (scrollable) ──
    const body = document.createElement('div');
    body.className = 'import-dialog-body';

    // General section
    body.appendChild(createSection('General', [
      createSelectRow('Import As', settings.importAs, ['auto', 'staticMesh', 'skeletalMesh'],
        ['Auto-detect', 'Static Mesh', 'Skeletal Mesh'],
        (v) => { settings.importAs = v as any; }),
      createTextRow('Asset Name', settings.assetName, (v) => { settings.assetName = v; }),
    ]));

    // Mesh section
    body.appendChild(createSection('Mesh', [
      createCheckRow('Import Mesh', settings.importMesh, (v) => { settings.importMesh = v; }),
      createNumberRow('Scale', settings.scale, 0.01, 100, 0.1, (v) => { settings.scale = v; }),
      createCheckRow('Combine Meshes', settings.combineMeshes, (v) => { settings.combineMeshes = v; }),
    ]));

    // Materials section
    if (supportsMaterials) {
      body.appendChild(createSection('Materials', [
        createCheckRow('Import Materials', settings.importMaterials, (v) => { settings.importMaterials = v; }),
        createCheckRow('Import Textures', settings.importTextures, (v) => { settings.importTextures = v; }),
      ]));
    }

    // Skeleton & Animation section
    if (supportsAnimation) {
      body.appendChild(createSection('Skeleton & Animation', [
        createCheckRow('Import Skeleton', settings.importSkeleton, (v) => { settings.importSkeleton = v; }),
        createCheckRow('Import Animations', settings.importAnimations, (v) => { settings.importAnimations = v; }),
      ]));
    }

    // Transform section
    body.appendChild(createSection('Transform', [
      createVec3Row('Position Offset', settings.positionOffset, (v) => { settings.positionOffset = v; }),
      createVec3Row('Rotation Offset', settings.rotationOffset, (v) => { settings.rotationOffset = v; }),
    ]));

    // Advanced section
    body.appendChild(createSection('Advanced', [
      createCheckRow('Generate Normals', settings.generateNormals, (v) => { settings.generateNormals = v; }),
      createCheckRow('Generate Tangents', settings.generateTangents, (v) => { settings.generateTangents = v; }),
      createCheckRow('Optimize Mesh', settings.optimizeMesh, (v) => { settings.optimizeMesh = v; }),
    ]));

    dialog.appendChild(body);

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = 'import-dialog-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'import-dialog-btn import-dialog-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve({ settings, cancelled: true });
    });

    const importBtn = document.createElement('button');
    importBtn.className = 'import-dialog-btn import-dialog-btn-import';
    importBtn.textContent = '📦 Import';
    importBtn.addEventListener('click', () => {
      overlay.remove();
      resolve({ settings, cancelled: false });
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(importBtn);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus Import button
    importBtn.focus();

    // ESC to cancel
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', keyHandler);
        resolve({ settings, cancelled: true });
      } else if (e.key === 'Enter') {
        overlay.remove();
        document.removeEventListener('keydown', keyHandler);
        resolve({ settings, cancelled: false });
      }
    };
    document.addEventListener('keydown', keyHandler);
  });
}

/**
 * Show a progress overlay for import operations.
 * Returns an object with update(msg) and close() methods.
 */
export function showImportProgress(): { update: (msg: string, pct?: number) => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'import-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'import-progress-dialog';

  dialog.innerHTML = `
    <div class="import-progress-title">📦 Importing Asset...</div>
    <div class="import-progress-bar-bg">
      <div class="import-progress-bar" id="__imp_bar"></div>
    </div>
    <div class="import-progress-msg" id="__imp_msg">Starting...</div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const bar = dialog.querySelector('#__imp_bar') as HTMLElement;
  const msg = dialog.querySelector('#__imp_msg') as HTMLElement;

  return {
    update(message: string, pct?: number) {
      msg.textContent = message;
      if (pct !== undefined) {
        bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
      }
    },
    close() {
      overlay.remove();
    },
  };
}

// ── Helper builders ──

function createSection(title: string, rows: HTMLElement[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'import-section';

  const header = document.createElement('div');
  header.className = 'import-section-header';
  header.textContent = title;
  // Collapsible toggle
  let collapsed = false;
  const contentDiv = document.createElement('div');
  contentDiv.className = 'import-section-content';
  for (const r of rows) contentDiv.appendChild(r);

  header.addEventListener('click', () => {
    collapsed = !collapsed;
    contentDiv.style.display = collapsed ? 'none' : 'block';
    header.classList.toggle('collapsed', collapsed);
  });

  section.appendChild(header);
  section.appendChild(contentDiv);
  return section;
}

function createTextRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row';
  row.innerHTML = `<label class="import-row-label">${label}</label>`;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'import-row-input';
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  row.appendChild(input);
  return row;
}

function createNumberRow(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row';
  row.innerHTML = `<label class="import-row-label">${label}</label>`;
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'import-row-input import-row-number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => onChange(parseFloat(input.value) || value));
  row.appendChild(input);
  return row;
}

function createCheckRow(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row';
  const lbl = document.createElement('label');
  lbl.className = 'import-row-label import-row-check-label';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.className = 'import-row-checkbox';
  cb.addEventListener('change', () => onChange(cb.checked));
  lbl.appendChild(cb);
  lbl.appendChild(document.createTextNode(' ' + label));
  row.appendChild(lbl);
  return row;
}

function createSelectRow(label: string, value: string, options: string[], labels: string[], onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row';
  row.innerHTML = `<label class="import-row-label">${label}</label>`;
  const sel = document.createElement('select');
  sel.className = 'import-row-select';
  for (let i = 0; i < options.length; i++) {
    const opt = document.createElement('option');
    opt.value = options[i];
    opt.textContent = labels[i] || options[i];
    if (options[i] === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  row.appendChild(sel);
  return row;
}

function createVec3Row(label: string, value: { x: number; y: number; z: number }, onChange: (v: { x: number; y: number; z: number }) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row import-row-vec3';
  row.innerHTML = `<label class="import-row-label">${label}</label>`;
  const container = document.createElement('div');
  container.className = 'import-vec3-inputs';

  for (const axis of ['x', 'y', 'z'] as const) {
    const lbl = document.createElement('span');
    lbl.className = 'import-vec3-axis';
    lbl.textContent = axis.toUpperCase();
    container.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'import-row-input import-vec3-input';
    input.value = String(value[axis]);
    input.step = '0.1';
    input.addEventListener('change', () => {
      value[axis] = parseFloat(input.value) || 0;
      onChange({ ...value });
    });
    container.appendChild(input);
  }

  row.appendChild(container);
  return row;
}

function formatLabel(format: ImportMeshFormat): string {
  const labels: Record<ImportMeshFormat, string> = {
    gltf: 'glTF Text',
    glb: 'glTF Binary',
    fbx: 'Autodesk FBX',
    obj: 'Wavefront OBJ',
    dae: 'Collada DAE',
    stl: 'STL',
    ply: 'PLY',
  };
  return labels[format] || format.toUpperCase();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
