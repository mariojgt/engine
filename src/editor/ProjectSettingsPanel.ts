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
import { MCPBridge, type MCPStatus } from './MCPBridge';
import { iconHTML, Icons } from './icons';

export class ProjectSettingsPanel {
  public container: HTMLElement;
  private _engine: Engine;
  private _projectManager: ProjectManager | null = null;
  private _gameInstanceManager: GameInstanceBlueprintManager | null = null;
  private _mcpBridge: MCPBridge | null = null;

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

  /** Wire up the MCP bridge for server controls in project settings */
  setMCPBridge(bridge: MCPBridge): void {
    this._mcpBridge = bridge;
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

    // ── MCP Server ───────────────────────────────────────────────
    body.appendChild(this._group('MCP Server', this._mcpServerRows()));
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

  // ─── MCP Server Controls ──────────────────────────────────────

  private _mcpServerRows(): HTMLElement[] {
    const rows: HTMLElement[] = [];

    // Status + Toggle button
    const statusRow = document.createElement('div');
    statusRow.className = 'prop-row';
    statusRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:11px;';

    const statusLbl = document.createElement('span');
    statusLbl.className = 'prop-label';
    statusLbl.textContent = 'Server Status';
    statusLbl.style.cssText = 'color:#aaa;flex:0 0 140px;';

    const statusWrap = document.createElement('div');
    statusWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;';

    const statusDot = document.createElement('span');
    statusDot.style.cssText = 'width:8px;height:8px;border-radius:50%;display:inline-block;';

    const statusText = document.createElement('span');
    statusText.style.cssText = 'font-size:11px;color:#ccc;';

    const toggleBtn = document.createElement('button');
    toggleBtn.style.cssText = 'margin-left:auto;background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;cursor:pointer;padding:3px 12px;font-size:11px;';

    const updateStatus = (status: MCPStatus) => {
      statusDot.style.background = status === 'running' ? '#4ade80' : status === 'starting' ? '#fbbf24' : status === 'error' ? '#ef4444' : '#666';
      statusText.textContent = status === 'running' ? 'Running' : status === 'starting' ? 'Starting...' : status === 'error' ? 'Error' : 'Stopped';
      toggleBtn.textContent = (status === 'running' || status === 'starting') ? 'Stop Server' : 'Start Server';
      toggleBtn.style.borderColor = status === 'running' ? '#4ade80' : '#555';
    };

    // Auto-create bridge if not yet wired (handles timing/init-order issues)
    if (!this._mcpBridge) {
      this._mcpBridge = new MCPBridge();
    }
    updateStatus(this._mcpBridge.status);
    this._mcpBridge.onStatusChange(updateStatus);
    toggleBtn.addEventListener('click', () => this._mcpBridge?.toggle());

    statusWrap.append(statusDot, statusText, toggleBtn);
    statusRow.append(statusLbl, statusWrap);
    rows.push(statusRow);

    // Project path info
    if (this._projectManager) {
      rows.push(this._readonlyRow('Project Path', this._projectManager.projectPath || '(none)'));
    }

    // WebSocket port
    rows.push(this._readonlyRow('Bridge Port', '9960'));

    // ── Connection Instructions ──────────────────────────────
    const instrRow = document.createElement('div');
    instrRow.style.cssText = 'margin-top:8px;';

    const instrTitle = document.createElement('div');
    instrTitle.style.cssText = 'font-size:11px;font-weight:bold;color:#ccc;margin-bottom:6px;';
    instrTitle.textContent = 'LLM Connection Setup';
    instrRow.appendChild(instrTitle);

    const configs = this._mcpBridge?.getConnectionConfig() ?? {
      claudeDesktop: '{ "mcpServers": { "feather-engine": { "url": "http://127.0.0.1:9961/sse" } } }',
      vscodeSettings: '{ "servers": { "feather-engine": { "url": "http://127.0.0.1:9961/sse" } } }',
      generic: 'SSE URL: http://127.0.0.1:9961/sse\nTransport: sse\nBridge WebSocket: ws://127.0.0.1:9960',
    };

    const tabs: { label: string; content: string; desc: string }[] = [
      { label: 'VS Code', content: configs.vscodeSettings, desc: 'Add to .vscode/mcp.json or your VS Code MCP settings:' },
      { label: 'Claude Desktop', content: configs.claudeDesktop, desc: 'Add to your claude_desktop_config.json:' },
      { label: 'Generic / Other', content: configs.generic, desc: 'Configuration for any MCP-compatible LLM client:' },
    ];

    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:2px;margin-bottom:4px;';

    const codePanel = document.createElement('div');
    codePanel.style.cssText = 'margin-bottom:4px;';

    const descEl = document.createElement('div');
    descEl.style.cssText = 'font-size:10px;color:#888;margin-bottom:4px;';

    const codeBlock = document.createElement('pre');
    codeBlock.style.cssText = 'background:#1a1a2e;border:1px solid #333;border-radius:4px;padding:8px;font-size:10px;color:#c4b5fd;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:0;font-family:monospace;max-height:200px;overflow-y:auto;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = 'margin-top:4px;background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;cursor:pointer;padding:2px 10px;font-size:10px;';

    let activeTab = 0;

    const renderTab = (idx: number) => {
      activeTab = idx;
      descEl.textContent = tabs[idx].desc;
      codeBlock.textContent = tabs[idx].content;
      tabBar.querySelectorAll('button').forEach((b, i) => {
        (b as HTMLButtonElement).style.borderBottom = i === idx ? '2px solid #c4b5fd' : '2px solid transparent';
        (b as HTMLButtonElement).style.color = i === idx ? '#c4b5fd' : '#888';
      });
    };

    for (let i = 0; i < tabs.length; i++) {
      const tab = document.createElement('button');
      tab.textContent = tabs[i].label;
      tab.style.cssText = 'background:none;border:none;border-bottom:2px solid transparent;color:#888;cursor:pointer;padding:3px 8px;font-size:10px;';
      tab.addEventListener('click', () => renderTab(i));
      tabBar.appendChild(tab);
    }

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(tabs[activeTab].content).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });

    codePanel.append(descEl, codeBlock, copyBtn);
    instrRow.append(tabBar, codePanel);
    rows.push(instrRow);

    renderTab(0);

    // ── Help text ──────────────────────────────────────────────
    const helpRow = document.createElement('div');
    helpRow.style.cssText = 'font-size:10px;color:#666;margin-top:6px;line-height:1.5;';
    helpRow.innerHTML =
      `${iconHTML(Icons.Info, 'xs')} The MCP server allows AI assistants to control Feather Engine — ` +
      `creating actors, sprites, animations, scenes, and more. ` +
      `Start the server above, then configure your LLM client using the JSON snippet. ` +
      `The server exposes an <b>SSE</b> endpoint on <b>http://127.0.0.1:9961/sse</b> for LLM clients and broadcasts real-time changes via WebSocket on port <b>9960</b>.`;
    rows.push(helpRow);

    return rows;
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
