// ============================================================
//  ProjectDialog — UE-style Welcome / Project Browser
//  Shows on startup when no project is loaded.
//  Allows creating a new project or opening an existing one.
// ============================================================

import type { ProjectManager } from './ProjectManager';
import { iconHTML, Icons, ICON_COLORS } from './icons';

export type ProjectDialogResult =
  | { action: 'created' }
  | { action: 'opened' }
  | { action: 'cancelled' };

/**
 * Shows a full-screen project dialog overlay.
 * Returns a promise that resolves when the user makes a selection.
 */
export function showProjectDialog(
  container: HTMLElement,
  projectManager: ProjectManager,
): Promise<ProjectDialogResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'project-dialog-overlay';

    overlay.innerHTML = `
      <div class="project-dialog">
        <button class="project-dialog-close-btn" id="pd-close" title="Close">&times;</button>
        <div class="project-dialog-header">
          <div class="project-dialog-logo">${iconHTML(Icons.Feather, 'xl', ICON_COLORS.blue)}</div>
          <h1 class="project-dialog-title">Feather Engine</h1>
          <p class="project-dialog-subtitle">Project Browser</p>
        </div>

        <div class="project-dialog-body">
          <!-- New Project Section -->
          <div class="project-dialog-section">
            <h2 class="project-dialog-section-title">New Project</h2>
            <div class="project-dialog-new">
              <label class="project-dialog-label">Project Name</label>
              <input
                type="text"
                class="project-dialog-input"
                id="pd-project-name"
                placeholder="MyProject"
                value="MyProject"
              />
              <button class="project-dialog-btn primary" id="pd-create">
                Create Project
              </button>
            </div>
          </div>

          <!-- Divider -->
          <div class="project-dialog-divider">
            <span>or</span>
          </div>

          <!-- Open Project Section -->
          <div class="project-dialog-section">
            <h2 class="project-dialog-section-title">Open Existing</h2>
            <button class="project-dialog-btn secondary" id="pd-open">
              Browse for Project…
            </button>
          </div>

          <!-- Recent Projects (placeholder for future) -->
          <div class="project-dialog-section" id="pd-recent-section" style="display:none;">
            <h2 class="project-dialog-section-title">Recent Projects</h2>
            <div class="project-dialog-recent" id="pd-recent-list"></div>
          </div>
        </div>

        <div class="project-dialog-footer">
          <button class="project-dialog-btn text" id="pd-skip">
            Skip — Start Empty
          </button>
        </div>
      </div>
    `;

    container.appendChild(overlay);

    const nameInput = overlay.querySelector('#pd-project-name') as HTMLInputElement;
    const createBtn = overlay.querySelector('#pd-create') as HTMLButtonElement;
    const openBtn = overlay.querySelector('#pd-open') as HTMLButtonElement;
    const skipBtn = overlay.querySelector('#pd-skip') as HTMLButtonElement;
    const closeBtn = overlay.querySelector('#pd-close') as HTMLButtonElement;

    // Focus the name input
    setTimeout(() => nameInput.focus(), 100);

    // Enter key on name input triggers create
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createBtn.click();
    });

    const cleanup = () => {
      document.removeEventListener('keydown', onEscKey);
      overlay.remove();
    };

    // --- Close on Escape key ---
    const onEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve({ action: 'cancelled' });
      }
    };
    document.addEventListener('keydown', onEscKey);

    // --- Close on overlay (outside dialog) click ---
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve({ action: 'cancelled' });
      }
    });

    // --- Close button (X) ---
    closeBtn.addEventListener('click', () => {
      cleanup();
      resolve({ action: 'cancelled' });
    });

    // --- Create Project ---
    createBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.style.borderColor = 'var(--danger)';
        nameInput.focus();
        return;
      }

      createBtn.textContent = 'Creating…';
      createBtn.disabled = true;

      try {
        const ok = await projectManager.createProject(name);
        if (ok) {
          cleanup();
          resolve({ action: 'created' });
        } else {
          createBtn.textContent = 'Create Project';
          createBtn.disabled = false;
        }
      } catch (err) {
        console.error('Failed to create project:', err);
        createBtn.textContent = 'Create Project';
        createBtn.disabled = false;
      }
    });

    // --- Open Project ---
    openBtn.addEventListener('click', async () => {
      openBtn.textContent = 'Opening…';
      openBtn.disabled = true;

      try {
        const ok = await projectManager.openProject();
        if (ok) {
          cleanup();
          resolve({ action: 'opened' });
        } else {
          openBtn.textContent = 'Browse for Project…';
          openBtn.disabled = false;
        }
      } catch (err) {
        console.error('Failed to open project:', err);
        openBtn.textContent = 'Browse for Project…';
        openBtn.disabled = false;
      }
    });

    // --- Skip ---
    skipBtn.addEventListener('click', () => {
      cleanup();
      resolve({ action: 'cancelled' });
    });
  });
}
