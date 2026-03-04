/**
 * ProjectSettingsPanel
 * ────────────────────
 * UE-style Project Settings panel.
 * Configures project-level settings including Game Instance Class,
 * similar to Unreal Engine's Project Settings → Maps & Modes → Game Instance Class.
 *
 * Registered as a dockview panel tab alongside Properties / Physics.
 */
import type { Engine } from '../engine/Engine';
import type { ProjectManager } from './ProjectManager';
import type { GameInstanceBlueprintManager } from './GameInstanceData';
import { iconHTML, Icons } from './icons';

export class ProjectSettingsPanel {
  public container: HTMLElement;
  private _engine: Engine;
  private _projectManager: ProjectManager | null = null;
  private _gameInstanceManager: GameInstanceBlueprintManager | null = null;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this._engine = engine;
    this._build();
  }

  /** Wire up the project manager (needed to read/write project settings) */
  setProjectManager(mgr: ProjectManager): void {
    this._projectManager = mgr;
    this._build();
  }

  /** Wire up the Game Instance blueprint manager (for the class selector dropdown) */
  setGameInstanceManager(mgr: GameInstanceBlueprintManager): void {
    this._gameInstanceManager = mgr;
    // Rebuild whenever game instance assets change (e.g. after project load, add, delete)
    mgr.onChanged(() => this._build());
    this._build();
  }

  /** Rebuild UI (call when settings change externally or project loads) */
  refresh(): void {
    this._build();
  }

  // ─── Build ─────────────────────────────────────────────────────

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel project-settings-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'Project Settings';
    this.container.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'panel-body';
    body.style.overflowY = 'auto';
    body.style.padding = '6px';
    this.container.appendChild(body);

    if (!this._projectManager) {
      const hint = document.createElement('div');
      hint.style.padding = '12px';
      hint.style.color = '#888';
      hint.style.fontSize = '11px';
      hint.textContent = 'Open or create a project to see settings.';
      body.appendChild(hint);
      return;
    }

    // ── Game Instance Class (Maps & Modes style) ────────────────
    body.appendChild(this._group('Maps & Modes', [
      this._gameInstanceClassRow(),
    ]));

    // ── General ─────────────────────────────────────────────────
    body.appendChild(this._group('General', [
      this._readonlyRow('Project Name', this._projectManager.projectName),
      this._readonlyRow('Engine Version', '0.1.0'),
    ]));

    // ── AI / Sprite Maker ───────────────────────────────────────
    body.appendChild(this._group('AI — Sprite Maker', [
      this._openaiApiKeyRow(),
    ]));
  }

  // ─── Game Instance Class Dropdown ──────────────────────────────

  private _gameInstanceClassRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '3px 0';
    row.style.fontSize = '11px';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = 'Game Instance Class';
    lbl.title = 'Which Game Instance blueprint to auto-create when Play starts.\nLike UE\'s Project Settings → Maps & Modes → Game Instance Class.';
    lbl.style.color = '#aaa';
    lbl.style.flex = '0 0 140px';

    const select = document.createElement('select');
    select.style.flex = '1';
    select.style.background = '#2a2a2a';
    select.style.border = '1px solid #555';
    select.style.borderRadius = '3px';
    select.style.color = '#ddd';
    select.style.padding = '3px 6px';
    select.style.fontSize = '11px';
    select.style.cursor = 'pointer';

    // (None) option — no game instance
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(None)';
    select.appendChild(noneOpt);

    // Populate from game instance manager
    const currentId = this._projectManager?.gameInstanceClassId ?? '';
    if (this._gameInstanceManager) {
      for (const asset of this._gameInstanceManager.assets) {
        const opt = document.createElement('option');
        opt.value = asset.id;
        opt.textContent = asset.name;
        if (asset.id === currentId) opt.selected = true;
        select.appendChild(opt);
      }
    }

    if (!currentId) {
      noneOpt.selected = true;
    }

    select.addEventListener('change', () => {
      const val = select.value || undefined;
      if (this._projectManager) {
        this._projectManager.setGameInstanceClassId(val);
        console.log(`[ProjectSettings] Game Instance Class set to: ${val ? select.options[select.selectedIndex].textContent : '(None)'}`);
      }
    });

    row.appendChild(lbl);
    row.appendChild(select);
    return row;
  }

  // ─── OpenAI API Key Input ────────────────────────────────────

  private _openaiApiKeyRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '3px 0';
    row.style.fontSize = '11px';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = 'OpenAI API Key';
    lbl.title = 'Your OpenAI API key for AI-powered features like Sprite Maker.\nStored in project.json — keep it private.';
    lbl.style.color = '#aaa';
    lbl.style.flex = '0 0 140px';

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'sk-...';
    input.value = this._projectManager?.openaiApiKey ?? '';
    input.style.flex = '1';
    input.style.background = '#2a2a2a';
    input.style.border = '1px solid #555';
    input.style.borderRadius = '3px';
    input.style.color = '#ddd';
    input.style.padding = '3px 6px';
    input.style.fontSize = '11px';
    input.style.fontFamily = 'monospace';

    input.addEventListener('change', () => {
      const val = input.value.trim() || undefined;
      if (this._projectManager) {
        this._projectManager.setOpenaiApiKey(val);
        console.log('[ProjectSettings] OpenAI API Key updated');
      }
    });

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '👁';
    toggleBtn.title = 'Show/Hide key';
    toggleBtn.style.cssText = 'margin-left:4px;background:none;border:1px solid #555;border-radius:3px;color:#aaa;cursor:pointer;padding:2px 6px;font-size:11px;';
    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(toggleBtn);
    return row;
  }

  // ─── UI Helpers ────────────────────────────────────────────────

  private _group(title: string, rows: HTMLElement[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'prop-group';
    wrapper.style.marginBottom = '8px';

    const hdr = document.createElement('div');
    hdr.className = 'prop-group-header';
    hdr.style.cursor = 'pointer';
    hdr.style.fontWeight = 'bold';
    hdr.style.fontSize = '11px';
    hdr.style.padding = '4px 0';
    hdr.style.color = '#ccc';
    hdr.style.userSelect = 'none';
    hdr.innerHTML = `${iconHTML(Icons.ChevronDown, 'xs')} ${title}`;

    const content = document.createElement('div');
    content.className = 'prop-group-content';
    content.style.paddingLeft = '4px';
    for (const r of rows) content.appendChild(r);

    let collapsed = false;
    hdr.addEventListener('click', () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? 'none' : '';
      hdr.innerHTML = `${collapsed ? iconHTML(Icons.ChevronRight, 'xs') : iconHTML(Icons.ChevronDown, 'xs')} ${title}`;
    });

    wrapper.appendChild(hdr);
    wrapper.appendChild(content);
    return wrapper;
  }

  private _readonlyRow(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '2px 0';
    row.style.fontSize = '11px';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    lbl.style.color = '#aaa';
    lbl.style.flex = '0 0 140px';

    const val = document.createElement('span');
    val.textContent = value;
    val.style.color = '#888';
    val.style.fontSize = '11px';

    row.appendChild(lbl);
    row.appendChild(val);
    return row;
  }
}
