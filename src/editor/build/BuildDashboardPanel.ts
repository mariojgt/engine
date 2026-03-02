// ============================================================
//  BuildDashboardPanel
//  Main docked panel listing all build configurations.
//  Lists configs, shows last-build status, and runs builds.
// ============================================================

import { iconHTML, Icons, ICON_COLORS } from '../icons';
import type { ProjectManager } from '../ProjectManager';
import type {
  BuildConfigurationJSON,
  BuildConfigurationManager,
  BuildPlatform,
} from './BuildConfigurationAsset';
import { defaultBuildConfiguration } from './BuildConfigurationAsset';
import { BuildRunner } from './BuildRunner';
import type { BuildEvent, BuildRunResult } from './BuildRunner';
import { BuildConfigurationEditorPanel } from './BuildConfigurationEditorPanel';
import type { DependencyAnalyzerContext } from './DependencyAnalyzer';
import { invoke } from '@tauri-apps/api/core';

const PLATFORM_ICONS: Record<BuildPlatform, string> = {
  windows: '🪟',
  macos: '🍎',
  linux: '🐧',
  web: '🌐',
  android: '🤖',
  ios: '📱',
  ps5: '🎮',
  xbox: '🎮',
  switch: '🎮',
};

const BUILD_TYPE_COLORS: Record<string, string> = {
  debug: '#6b7280',
  development: '#d97706',
  shipping: '#16a34a',
};

interface ActiveBuild {
  configId: string;
  runner: BuildRunner;
  logs: BuildEvent[];
  progress: number;
  currentStep: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
}

export class BuildDashboardPanel {
  public container: HTMLElement;
  public readonly panelId = 'build-dashboard';

  private _manager: BuildConfigurationManager | null = null;
  private _projectManager: ProjectManager | null = null;
  private _analyzerCtxProvider: (() => DependencyAnalyzerContext) | null = null;
  private _openEditorCallback: ((configId: string) => void) | null = null;

  private _selectedConfigId: string | null = null;
  private _activeBuilds: Map<string, ActiveBuild> = new Map();

  // DOM regions
  private _tableBody: HTMLElement | null = null;
  private _progressSection: HTMLElement | null = null;
  private _logArea: HTMLElement | null = null;
  private _statusBar: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this._build();
  }

  setManagers(
    manager: BuildConfigurationManager,
    projectManager: ProjectManager,
  ): void {
    this._manager = manager;
    this._projectManager = projectManager;
    this._refresh();
  }

  setAnalyzerContextProvider(fn: () => DependencyAnalyzerContext): void {
    this._analyzerCtxProvider = fn;
  }

  setOpenEditorCallback(cb: (configId: string) => void): void {
    this._openEditorCallback = cb;
  }

  // Called externally to refresh the panel list (e.g. after import or rename)
  refreshList(): void {
    this._refresh();
  }

  // ── Build the full panel UI ──────────────────────────────────

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel build-dashboard-panel';
    this.container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;font-size:11px;';

    // ── Toolbar ──────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'panel-header';
    toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;flex-shrink:0;flex-wrap:wrap;';

    const title = document.createElement('span');
    title.style.cssText = 'font-weight:bold;font-size:12px;margin-right:4px;display:flex;align-items:center;gap:4px;';
    title.innerHTML = `${iconHTML(Icons.Hammer, 'sm', ICON_COLORS.blue)} Build Dashboard`;
    toolbar.appendChild(title);

    const sep = () => {
      const s = document.createElement('div');
      s.style.cssText = 'width:1px;height:18px;background:#444;margin:0 2px;';
      return s;
    };

    toolbar.appendChild(this._btn('+ New', () => this._newConfig(), Icons.Plus, '#1e6b3c', '#2d9c5e'));
    toolbar.appendChild(sep());
    toolbar.appendChild(this._btn('▶ Build', () => this._buildSelected(), Icons.Play));
    toolbar.appendChild(this._btn('Build All', () => this._buildAll(), Icons.Layers));
    toolbar.appendChild(sep());
    toolbar.appendChild(this._btn('Open Output', () => this._openOutputFolder(), Icons.FolderOpen));
    toolbar.appendChild(this._btn('Edit', () => this._editSelected(), Icons.Pencil));
    toolbar.appendChild(sep());

    const refreshBtn = this._btn('', () => this._refresh(), Icons.RefreshCw);
    refreshBtn.title = 'Refresh';
    toolbar.appendChild(refreshBtn);

    this.container.appendChild(toolbar);

    // ── Config table ─────────────────────────────────────────────
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'flex:0 0 auto;overflow-y:auto;max-height:260px;border-bottom:1px solid #333;';

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr style="background:#1e1e1e;color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">
        <th style="padding:5px 10px;text-align:left;border-bottom:1px solid #333;font-weight:500;">Name</th>
        <th style="padding:5px 8px;text-align:left;border-bottom:1px solid #333;font-weight:500;">Platform</th>
        <th style="padding:5px 8px;text-align:left;border-bottom:1px solid #333;font-weight:500;">Type</th>
        <th style="padding:5px 8px;text-align:left;border-bottom:1px solid #333;font-weight:500;">Last Build</th>
        <th style="padding:5px 8px;text-align:left;border-bottom:1px solid #333;font-weight:500;">Status</th>
        <th style="padding:5px 8px;text-align:center;border-bottom:1px solid #333;font-weight:500;">Actions</th>
      </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    this._tableBody = tbody;
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    this.container.appendChild(tableWrap);

    // ── Active build progress ─────────────────────────────────────
    const progressSection = document.createElement('div');
    progressSection.style.cssText = 'flex:0 0 auto;padding:0;overflow:hidden;transition:max-height 0.2s;';
    progressSection.style.maxHeight = '0';
    this._progressSection = progressSection;
    this.container.appendChild(progressSection);

    // ── Build log ─────────────────────────────────────────────────
    const logWrap = document.createElement('div');
    logWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;border-top:1px solid #333;';

    const logHeader = document.createElement('div');
    logHeader.style.cssText = 'padding:4px 10px;font-size:10px;color:#888;background:#1a1a1a;border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    logHeader.innerHTML = `<span>${iconHTML(Icons.Terminal, 'xs')} Build Output</span>`;

    const clearBtn = this._btn('Clear', () => { if (this._logArea) this._logArea.innerHTML = ''; }, Icons.Trash2);
    clearBtn.style.cssText += 'font-size:10px;padding:2px 6px;';
    logHeader.appendChild(clearBtn);

    const logArea = document.createElement('div');
    logArea.style.cssText = 'flex:1;overflow-y:auto;padding:6px 10px;font-family:monospace;font-size:11px;line-height:1.5;background:#121212;';
    logArea.textContent = 'No builds have been run yet.';
    this._logArea = logArea;

    logWrap.appendChild(logHeader);
    logWrap.appendChild(logArea);
    this.container.appendChild(logWrap);

    // ── Status bar ────────────────────────────────────────────────
    const statusBar = document.createElement('div');
    statusBar.style.cssText = 'flex-shrink:0;padding:3px 10px;font-size:10px;color:#666;background:#161616;border-top:1px solid #2a2a2a;display:flex;align-items:center;gap:8px;';
    statusBar.textContent = 'Ready';
    this._statusBar = statusBar;
    this.container.appendChild(statusBar);

    this._refresh();
  }

  // ── Refresh config list ───────────────────────────────────────

  private _refresh(): void {
    if (!this._tableBody) return;
    this._tableBody.innerHTML = '';
    const configs = this._manager?.getAll() ?? [];

    if (configs.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="6" style="padding:16px;text-align:center;color:#555;font-style:italic;">No build configurations. Click "+ New" to create one.</td>`;
      this._tableBody.appendChild(row);
      return;
    }

    for (const cfg of configs) this._appendConfigRow(cfg);
    this._updateStatusBar();
  }

  private _appendConfigRow(cfg: BuildConfigurationJSON): void {
    if (!this._tableBody) return;
    const active = this._activeBuilds.get(cfg.id);
    const isSelected = cfg.id === this._selectedConfigId;
    const isRunning = active?.status === 'running';

    const tr = document.createElement('tr');
    tr.style.cssText = `cursor:pointer;border-bottom:1px solid #2a2a2a;${isSelected ? 'background:#1e2d40;' : ''}`;
    tr.title = 'Click to select, double-click to edit';

    let lastBuildText = '—';
    if (cfg.lastBuiltAt) {
      const dt = new Date(cfg.lastBuiltAt);
      if (!isNaN(dt.getTime())) lastBuildText = dt.toLocaleString();
    }

    const statusText = isRunning
      ? `<span style="color:#f59e0b;">⏳ Building…</span>`
      : active?.status === 'success'
        ? `<span style="color:#22c55e;">✅ OK</span>`
        : active?.status === 'failed'
          ? `<span style="color:#ef4444;">❌ Failed</span>`
          : cfg.lastBuildStatus === 'success'
            ? `<span style="color:#22c55e;">✅ OK</span>`
            : cfg.lastBuildStatus === 'failed'
              ? `<span style="color:#ef4444;">❌ Failed</span>`
              : cfg.lastBuildStatus === 'warning'
                ? `<span style="color:#f59e0b;">⚠️ Warning</span>`
                : `<span style="color:#555;">—</span>`;

    const typeColor = BUILD_TYPE_COLORS[cfg.general.buildType] ?? '#888';

    tr.innerHTML = `
      <td style="padding:6px 10px;color:#ddd;font-weight:${isSelected ? 'bold' : 'normal'};">
        ${PLATFORM_ICONS[cfg.general.platform]} ${cfg.name}
      </td>
      <td style="padding:6px 8px;color:#aaa;">${cfg.general.platform}</td>
      <td style="padding:6px 8px;"><span style="color:${typeColor};">${cfg.general.buildType}</span></td>
      <td style="padding:6px 8px;color:#666;">${lastBuildText}</td>
      <td style="padding:6px 8px;">${statusText}</td>
      <td style="padding:6px 8px;text-align:center;display:flex;gap:4px;justify-content:center;"></td>
    `;

    const actionCell = tr.querySelector('td:last-child') as HTMLElement;
    actionCell.appendChild(this._iconBtn(Icons.Play, '#22c55e', () => this._buildConfig(cfg.id), 'Build'));
    actionCell.appendChild(this._iconBtn(Icons.Pencil, '#60a5fa', () => { this._openEditorCallback?.(cfg.id); }, 'Edit'));
    actionCell.appendChild(this._iconBtn(Icons.Trash2, '#ef4444', () => this._deleteConfig(cfg.id), 'Delete'));

    tr.addEventListener('click', () => {
      this._selectedConfigId = cfg.id;
      this._refresh();
      // Show this config's log if it has one
      if (active && this._logArea) {
        this._logArea.innerHTML = '';
        for (const e of active.logs) this._appendLog(e);
      }
    });

    tr.addEventListener('dblclick', () => {
      this._openEditorCallback?.(cfg.id);
    });

    this._tableBody!.appendChild(tr);

    // Inline progress bar
    if (isRunning && active) {
      const pTr = document.createElement('tr');
      pTr.style.background = '#151515';
      const pTd = document.createElement('td');
      pTd.colSpan = 6;
      pTd.style.padding = '0 10px 6px';
      const bar = document.createElement('div');
      bar.style.cssText = 'width:100%;height:4px;background:#333;border-radius:2px;overflow:hidden;';
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;background:#3b82f6;border-radius:2px;width:${Math.round((active.progress ?? 0) * 100)}%;transition:width 0.3s;`;
      bar.appendChild(fill);
      const stepLbl = document.createElement('div');
      stepLbl.style.cssText = 'font-size:10px;color:#888;margin-top:2px;';
      stepLbl.textContent = active.currentStep;
      pTd.appendChild(bar);
      pTd.appendChild(stepLbl);
      pTr.appendChild(pTd);
      this._tableBody!.appendChild(pTr);
    }
  }

  // ── Actions ───────────────────────────────────────────────────

  private _newConfig(): void {
    if (!this._manager) return;
    this._showInlinePrompt('Build configuration name:', 'Shipping Build', (name) => {
      if (!name || !this._manager) return;
      const cfg = defaultBuildConfiguration(name);
      this._manager.add(cfg);
      this._selectedConfigId = cfg.id;
      this._refresh();
      this._openEditorCallback?.(cfg.id);
      this._log('info', `Created build configuration: ${name}`);
    });
  }

  private _buildSelected(): void {
    if (!this._selectedConfigId) {
      this._log('warn', 'No configuration selected.');
      return;
    }
    this._buildConfig(this._selectedConfigId);
  }

  private async _buildAll(): Promise<void> {
    const configs = this._manager?.getAll() ?? [];
    for (const cfg of configs) await this._buildConfig(cfg.id);
  }

  private async _buildConfig(configId: string): Promise<void> {
    if (!this._manager || !this._projectManager) {
      this._log('error', 'Build system not initialized — no project is open. Open a project first.');
      return;
    }
    if (!this._analyzerCtxProvider) {
      this._log('error', 'Build system context not available. Try closing and re-opening the Build Dashboard.');
      return;
    }
    if (this._activeBuilds.get(configId)?.status === 'running') {
      this._log('warn', `Build for ${configId} is already running.`);
      return;
    }

    const cfg = this._manager.get(configId);
    if (!cfg) { this._log('error', `Config ${configId} not found.`); return; }

    const projectRoot = this._projectManager.projectPath ?? '';
    if (!projectRoot) { this._log('error', 'No project is open.'); return; }

    // ── Save the current project/scene to disk before building ──
    // This ensures the build reads the latest in-memory scene data.
    this._log('info', 'Saving project before build...');
    try {
      await this._projectManager.saveProject();
    } catch (saveErr: any) {
      this._log('warn', `Warning: could not auto-save project: ${saveErr?.message ?? saveErr}`);
    }

    // ── Auto-populate scenes list if empty ──
    // If the build config has no scenes, discover all project scenes
    // and include them so the build doesn't export an empty game.
    if (cfg.scenes.length === 0) {
      try {
        const allScenes = await this._projectManager.listScenes();
        for (const s of allScenes) {
          cfg.scenes.push({ sceneName: s, included: true });
        }
        this._log('info', `Auto-included ${allScenes.length} scene(s): ${allScenes.join(', ')}`);
      } catch (e: any) {
        this._log('warn', `Could not auto-discover scenes: ${e?.message ?? e}`);
      }
    }

    // If no start scene configured, default to first included scene or activeScene
    if (!cfg.entryPoint.startScene) {
      const firstIncluded = cfg.scenes.find(s => s.included);
      cfg.entryPoint.startScene = firstIncluded?.sceneName
        ?? this._projectManager.activeSceneName
        ?? 'DefaultScene';
      this._log('info', `Auto-set start scene: ${cfg.entryPoint.startScene}`);
    }

    // Clear log for this build
    if (this._logArea) this._logArea.innerHTML = '';

    let ctx: DependencyAnalyzerContext;
    try {
      ctx = this._analyzerCtxProvider();
    } catch (e: any) {
      this._log('error', `Failed to create build context: ${e?.message ?? e}`);
      return;
    }

    const runner = new BuildRunner(cfg, projectRoot, ctx);
    const active: ActiveBuild = {
      configId,
      runner,
      logs: [],
      progress: 0,
      currentStep: 'Initializing…',
      status: 'running',
    };
    this._activeBuilds.set(configId, active);
    this._selectedConfigId = configId;
    this._showProgress(true);
    this._refresh();

    const buildStart = Date.now();
    runner.onEvent(e => {
      if (e.type === 'log' || e.type === 'step-started' || e.type === 'step-completed' || e.type === 'progress' || e.type === 'build-complete' || e.type === 'build-failed' || e.type === 'validation-result' || e.type === 'cook-progress') {
        active.logs.push(e);
        if (this._selectedConfigId === configId) this._appendLog(e);
      }
      if (e.type === 'step-started') {
        active.currentStep = e.message ?? '';
        active.progress = e.overallProgress ?? 0;
        this._refreshRow(configId, active);
      }
      if (e.type === 'step-completed' || e.type === 'progress') {
        active.progress = e.overallProgress ?? 0;
        this._refreshRow(configId, active);
      }
      if (e.type === 'build-complete') {
        const result = e.data as BuildRunResult | undefined;
        active.status = result?.success ? 'success' : 'failed';
        active.progress = 1;
        const durationMs = Date.now() - buildStart;
        const status: 'success' | 'failed' = result?.success ? 'success' : 'failed';
        this._manager?.recordBuildResult(configId, status, durationMs, result?.stats?.totalSizeBytes ?? 0);
        this._refresh();
        this._updateStatusBar();
      }
      if (e.type === 'build-failed') {
        active.status = 'failed';
        const durationMs = Date.now() - buildStart;
        this._manager?.recordBuildResult(configId, 'failed', durationMs, 0);
        this._refresh();
        this._updateStatusBar();
      }
      if (e.type === 'cancelled') {
        active.status = 'cancelled';
        this._refresh();
        this._updateStatusBar();
      }
    });

    this._log('info', `▶ Starting build: ${cfg.name} [${cfg.general.platform} / ${cfg.general.buildType}]`);

    try {
      const result = await runner.run();
      if (!result.success && active.status === 'running') {
        active.status = 'failed';
        this._refresh();
      }
    } catch (e: any) {
      active.status = 'failed';
      this._log('error', `Build crashed: ${e?.message ?? String(e)}`);
      this._manager?.recordBuildResult(configId, 'failed', Date.now() - buildStart, 0);
      this._refresh();
    } finally {
      this._showProgress(false);
      this._updateStatusBar();
    }
  }

  private _editSelected(): void {
    if (!this._selectedConfigId) {
      this._log('warn', 'No configuration selected.');
      return;
    }
    this._openEditorCallback?.(this._selectedConfigId);
  }

  private async _openOutputFolder(): Promise<void> {
    const cfg = this._selectedConfigId ? this._manager?.get(this._selectedConfigId) : null;
    const outPath = cfg?.output.outputDirectory?.length
      ? cfg.output.outputDirectory
      : '';

    if (!outPath) {
      this._log('warn', 'No output folder available for selected config.');
      return;
    }
    try {
      await invoke('show_in_folder', { path: outPath });
    } catch {
      this._log('warn', `Cannot open folder: ${outPath}`);
    }
  }

  private _deleteConfig(configId: string): void {
    const cfg = this._manager?.get(configId);
    if (!cfg) return;
    this._showInlineConfirm(`Delete build configuration "${cfg.name}"?`, () => {
      this._manager?.remove(configId);
      if (this._selectedConfigId === configId) this._selectedConfigId = null;
      this._refresh();
    });
  }

  // ── Log helpers ───────────────────────────────────────────────

  private _appendLog(e: BuildEvent): void {
    if (!this._logArea) return;
    const line = document.createElement('div');
    const d = new Date(e.timestamp);
    const time = (isNaN(d.getTime())) ? new Date().toLocaleTimeString('en-US', { hour12: false }) : d.toLocaleTimeString('en-US', { hour12: false });

    const colors: Record<string, string> = {
      log: '#ddd',
      'step-started': '#60a5fa',
      'step-completed': '#22c55e',
      'step-failed': '#ef4444',
      'build-complete': '#22c55e',
      'build-failed': '#ef4444',
      validation: '#f59e0b',
    };

    line.style.cssText = `color:${colors[e.type] ?? '#ddd'};white-space:pre-wrap;padding:1px 0;`;
    const ts = `<span style="color:#555;user-select:none;">[${time}]</span> `;
    const prefix = e.type === 'step-started' ? '→ '
      : e.type === 'step-completed' ? '✓ '
      : e.type === 'step-failed' || e.type === 'build-failed' ? '✗ '
      : e.type === 'build-complete' ? '✅ '
      : '';
    
    let html = `${ts}${prefix}${this._escHtml(e.message ?? '')}`;

    // If validation failed, log the specific reasons
    if (e.type === 'validation-result' && e.data && Array.isArray(e.data.errors) && e.data.errors.length > 0) {
      const errList = e.data.errors.map((err: any) => `  • <span style="color:#ef4444;">[${this._escHtml(err.code || 'ERROR')}]</span> ${this._escHtml(err.message)}`);
      html += `\n${errList.join('\n')}`;
    }

    line.innerHTML = html;
    this._logArea.appendChild(line);
    this._logArea.scrollTop = this._logArea.scrollHeight;
  }

  private _log(level: 'info' | 'warn' | 'error', msg: string): void {
    if (!this._logArea) return;
    const line = document.createElement('div');
    const colors = { info: '#ddd', warn: '#f59e0b', error: '#ef4444' };
    const time = new Date().toLocaleTimeString();
    line.style.cssText = `color:${colors[level]};white-space:pre-wrap;padding:1px 0;`;
    line.innerHTML = `<span style="color:#555;">[${time}]</span> ${this._escHtml(msg)}`;
    this._logArea.appendChild(line);
    this._logArea.scrollTop = this._logArea.scrollHeight;
  }

  private _escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── UI helpers ────────────────────────────────────────────────

  private _refreshRow(configId: string, _active: ActiveBuild): void {
    // Lightweight partial refresh — just re-render table rows
    this._refresh();
  }

  private _showProgress(visible: boolean): void {
    if (this._progressSection) {
      this._progressSection.style.maxHeight = visible ? '60px' : '0';
      this._progressSection.style.padding = visible ? '8px 10px' : '0';
    }
  }

  private _updateStatusBar(): void {
    if (!this._statusBar || !this._manager) return;
    const all = this._manager.getAll();
    const running = [...this._activeBuilds.values()].filter(a => a.status === 'running').length;
    this._statusBar.textContent = running > 0
      ? `⏳ ${running} build(s) running…`
      : `${all.length} configuration(s) — Ready`;
  }

  private _btn(label: string, onClick: () => void, icon?: any, bg?: string, borderColor?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.style.cssText = `background:${bg ?? '#2a2a2a'};border:1px solid ${borderColor ?? '#555'};border-radius:3px;color:#ddd;padding:3px 8px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap;`;
    if (icon) btn.innerHTML = `${iconHTML(icon, 'xs')} ${label}`;
    else btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private _iconBtn(icon: any, color: string, onClick: () => void, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.title = title;
    btn.style.cssText = `background:transparent;border:none;cursor:pointer;padding:2px;color:${color};display:flex;align-items:center;`;
    btn.innerHTML = iconHTML(icon, 'xs');
    btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return btn;
  }

  // ── Inline dialogs (window.prompt/confirm unavailable in macOS Tauri WKWebView) ──

  private _showInlinePrompt(title: string, defaultValue: string, onConfirm: (value: string | null) => void): void {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    });
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background: '#1e1e2e', border: '1px solid #45475a',
      borderRadius: '6px', padding: '16px 20px', minWidth: '300px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', color: '#cdd6f4', fontFamily: 'inherit',
    });
    const label = document.createElement('div');
    label.textContent = title;
    Object.assign(label.style, { marginBottom: '10px', fontWeight: '600', fontSize: '13px' });
    dialog.appendChild(label);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    Object.assign(input.style, {
      width: '100%', boxSizing: 'border-box', marginBottom: '12px',
      fontSize: '13px', padding: '6px 8px', background: '#313244',
      color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '4px', outline: 'none',
    });
    dialog.appendChild(input);
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
      background: '#45475a', color: '#cdd6f4', border: 'none',
      borderRadius: '4px', padding: '5px 14px', cursor: 'pointer', fontSize: '12px',
    });
    cancelBtn.onclick = () => { overlay.remove(); onConfirm(null); };
    btnRow.appendChild(cancelBtn);
    const okBtn = document.createElement('button');
    okBtn.textContent = 'Create';
    Object.assign(okBtn.style, {
      background: '#22c55e', color: '#fff', border: 'none',
      borderRadius: '4px', padding: '5px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
    });
    okBtn.onclick = () => { overlay.remove(); onConfirm(input.value.trim() || null); };
    btnRow.appendChild(okBtn);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { input.focus(); input.select(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
    });
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) cancelBtn.click();
    });
  }

  private _showInlineConfirm(message: string, onConfirm: () => void): void {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    });
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background: '#1e1e2e', border: '1px solid #45475a',
      borderRadius: '6px', padding: '16px 20px', minWidth: '280px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', color: '#cdd6f4', fontFamily: 'inherit',
    });
    const label = document.createElement('div');
    label.textContent = message;
    Object.assign(label.style, { marginBottom: '14px', fontSize: '13px', lineHeight: '1.4' });
    dialog.appendChild(label);
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
      background: '#45475a', color: '#cdd6f4', border: 'none',
      borderRadius: '4px', padding: '5px 14px', cursor: 'pointer', fontSize: '12px',
    });
    cancelBtn.onclick = () => { overlay.remove(); };
    btnRow.appendChild(cancelBtn);
    const okBtn = document.createElement('button');
    okBtn.textContent = 'Delete';
    Object.assign(okBtn.style, {
      background: '#ef4444', color: '#fff', border: 'none',
      borderRadius: '4px', padding: '5px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
    });
    okBtn.onclick = () => { overlay.remove(); onConfirm(); };
    btnRow.appendChild(okBtn);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => okBtn.focus());
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancelBtn.click();
      if (e.key === 'Enter') okBtn.click();
    });
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) cancelBtn.click();
    });
  }
}

// Re-export for external use
export type { BuildEvent };
