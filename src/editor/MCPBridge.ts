// ~~ MCPBridge ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Frontend bridge between the Feather Engine UI and the MCP server.
// Communicates with the Tauri backend to manage the MCP server process
// and connects via WebSocket to receive real-time change events.
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

import { invoke } from '@tauri-apps/api/core';

export type MCPStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface MCPEvent {
  type: string;
  assetType?: string;
  name?: string;
  assetId?: string;
  path?: string;
  message?: string;
  [key: string]: unknown;
}

export class MCPBridge {
  private _status: MCPStatus = 'stopped';
  private _ws: WebSocket | null = null;
  private _statusListeners: Array<(status: MCPStatus) => void> = [];
  private _eventListeners: Array<(event: MCPEvent) => void> = [];
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _startupTimer: ReturnType<typeof setTimeout> | null = null;
  private _serverScriptPath: string | null = null;
  private _projectPath: string | null = null;
  private _wsPort = 9960;
  private _ssePort = 9961;
  private _wsRetries = 0;
  private _maxWsRetries = 10;

  get status(): MCPStatus { return this._status; }
  get projectPath(): string | null { return this._projectPath; }
  get serverScriptPath(): string | null { return this._serverScriptPath; }

  // ~~ Public API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  /** Toggle the MCP server on/off */
  async toggle(): Promise<void> {
    if (this._status === 'running' || this._status === 'starting') {
      await this.stop();
    } else {
      await this.start();
    }
  }

  /** Start the MCP server process */
  async start(): Promise<void> {
    if (this._status === 'running' || this._status === 'starting') return;
    this._setStatus('starting');
    this._wsRetries = 0;

    try {
      // Resolve the MCP server script path
      if (!this._serverScriptPath) {
        this._serverScriptPath = await this._resolveServerPath();
      }

      // Start the node process via Tauri
      await invoke('start_mcp_server', { serverScript: this._serverScriptPath });

      // Start polling for process status
      this._startStatusPolling();

      // Connect WebSocket after a short delay for server startup
      this._startupTimer = setTimeout(() => {
        this._startupTimer = null;
        this._connectWebSocket();
      }, 800);
    } catch (err: any) {
      console.error('[MCPBridge] Failed to start:', err);
      this._setStatus('error');
      this._serverScriptPath = null;
    }
  }

  /** Resolve the MCP server script path using engine root */
  private async _resolveServerPath(): Promise<string> {
    try {
      const engineRoot = await invoke<string>('get_engine_root');
      const candidate = engineRoot + '/mcp-server/dist/bundle.cjs';
      const exists = await invoke<boolean>('file_exists', { path: candidate });
      if (exists) return candidate;
    } catch (e) {
      console.warn('[MCPBridge] get_engine_root failed:', e);
    }

    if (this._projectPath) {
      try {
        const normalized = this._projectPath.replace(/\\/g, '/');
        const parts = normalized.split('/');
        for (let i = parts.length; i >= Math.max(1, parts.length - 5); i--) {
          const base = parts.slice(0, i).join('/');
          const candidate = base + '/mcp-server/dist/bundle.cjs';
          const exists = await invoke<boolean>('file_exists', { path: candidate });
          if (exists) return candidate;
        }
      } catch (e) {
        console.warn('[MCPBridge] project path fallback failed:', e);
      }
    }

    throw new Error(
      'Could not find MCP server script (bundle.cjs). ' +
      'Please rebuild the MCP server: cd mcp-server && npm run build'
    );
  }

  /** Stop the MCP server process */
  async stop(): Promise<void> {
    this._stopStatusPolling();
    this._clearStartupTimer();
    this._disconnectWebSocket();

    try {
      await invoke('stop_mcp_server');
    } catch (err: any) {
      console.error('[MCPBridge] Failed to stop:', err);
    }

    this._setStatus('stopped');
  }

  /** Register a status-change listener */
  onStatusChange(cb: (status: MCPStatus) => void): void {
    this._statusListeners.push(cb);
    cb(this._status);
  }

  /** Register a MCP event listener (asset changes, etc.) */
  onEvent(cb: (event: MCPEvent) => void): void {
    this._eventListeners.push(cb);
  }

  /** Set the project path so MCP tools know where to operate */
  setProjectPath(projectPath: string): void {
    this._projectPath = projectPath;
  }

  /** Get MCP connection configuration for external tools */
  getConnectionConfig(): {
    claudeDesktop: string;
    vscodeSettings: string;
    generic: string;
  } {
    const sseUrl = 'http://127.0.0.1:' + this._ssePort + '/sse';
    return {
      claudeDesktop: JSON.stringify({
        mcpServers: {
          'feather-engine': {
            url: sseUrl,
          }
        }
      }, null, 2),
      vscodeSettings: JSON.stringify({
        servers: {
          'feather-engine': {
            url: sseUrl,
          }
        }
      }, null, 2),
      generic: 'SSE URL: ' + sseUrl + '\nTransport: sse\nBridge WebSocket: ws://127.0.0.1:' + this._wsPort,
    };
  }

  /** Cleanup resources */
  destroy(): void {
    this._stopStatusPolling();
    this._clearStartupTimer();
    this._disconnectWebSocket();
    this._statusListeners = [];
    this._eventListeners = [];
  }

  // ~~ Internal ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  private _setStatus(status: MCPStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const cb of this._statusListeners) {
      try { cb(status); } catch (e) { console.error('[MCPBridge] Status listener error:', e); }
    }
  }

  private _emitEvent(event: MCPEvent): void {
    for (const cb of this._eventListeners) {
      try { cb(event); } catch (e) { console.error('[MCPBridge] Event listener error:', e); }
    }
  }

  private _startStatusPolling(): void {
    this._stopStatusPolling();
    this._pollTimer = setInterval(async () => {
      try {
        const result = await invoke<string>('mcp_server_status');
        if (result.startsWith('running:')) {
          if (this._status !== 'running') this._setStatus('running');
        } else if (result.startsWith('exited:') || result === 'stopped') {
          this._setStatus('stopped');
          this._stopStatusPolling();
          this._clearStartupTimer();
          this._disconnectWebSocket();
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);
  }

  private _stopStatusPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _clearStartupTimer(): void {
    if (this._startupTimer) {
      clearTimeout(this._startupTimer);
      this._startupTimer = null;
    }
  }

  private _connectWebSocket(): void {
    if (this._status !== 'starting' && this._status !== 'running') return;

    if (this._wsRetries >= this._maxWsRetries) {
      console.error('[MCPBridge] WebSocket failed after ' + this._wsRetries + ' retries, giving up');
      this._setStatus('error');
      return;
    }

    this._disconnectWebSocket();

    try {
      this._ws = new WebSocket('ws://127.0.0.1:' + this._wsPort);

      this._ws.onopen = () => {
        console.log('[MCPBridge] WebSocket connected');
        this._wsRetries = 0;
        if (this._status === 'starting') this._setStatus('running');
      };

      this._ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'connected') {
            console.log('[MCPBridge] Bridge confirmed:', data.message);
          } else {
            this._emitEvent(data as MCPEvent);
          }
        } catch {
          // ignore malformed messages
        }
      };

      this._ws.onclose = () => {
        this._ws = null;
        if (this._status === 'running' || this._status === 'starting') {
          this._wsRetries++;
          this._reconnectTimer = setTimeout(() => this._connectWebSocket(), 2000);
        }
      };

      this._ws.onerror = () => {
        // onclose will fire after this, triggering reconnect
      };
    } catch {
      // Will retry via reconnect timer
    }
  }

  private _disconnectWebSocket(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.close();
      this._ws = null;
    }
  }
}