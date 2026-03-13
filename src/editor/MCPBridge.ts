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

/** Handler for bridge request messages from MCP server */
export type BridgeRequestHandler = (request: MCPEvent) => Promise<Record<string, unknown> | null>;

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

  /** Auto-connect WebSocket — independent of MCP toggle, reconnects forever */
  private _autoWs: WebSocket | null = null;
  private _autoWsTimer: ReturnType<typeof setTimeout> | null = null;
  private _autoWsConnected = false;
  private _autoWsInterval = 5000;

  /** Handlers for bridge request types (screenshot, etc.) */
  private _requestHandlers = new Map<string, BridgeRequestHandler>();

  get status(): MCPStatus { return this._status; }
  get projectPath(): string | null { return this._projectPath; }
  get serverScriptPath(): string | null { return this._serverScriptPath; }
  get bridgeConnected(): boolean { return this._autoWsConnected; }

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
    this._stopBridgeListener();
    this._statusListeners = [];
    this._eventListeners = [];
  }

  /**
   * Start listening on the WebSocket bridge (port 9960) for real-time
   * change events.  Runs independently of the MCP toggle — if the MCP
   * server is running externally (e.g. VS Code SSE) this still picks up
   * asset-changed broadcasts.  Reconnects forever.
   */
  startBridgeListener(): void {
    if (this._autoWs || this._autoWsTimer) return; // already running
    this._autoWsConnect();
  }

  private _stopBridgeListener(): void {
    if (this._autoWsTimer) {
      clearTimeout(this._autoWsTimer);
      this._autoWsTimer = null;
    }
    if (this._autoWs) {
      this._autoWs.onclose = null;
      this._autoWs.onerror = null;
      this._autoWs.close();
      this._autoWs = null;
    }
    this._autoWsConnected = false;
  }

  private _autoWsConnect(): void {
    // Don't double-connect
    if (this._autoWs) return;

    try {
      this._autoWs = new WebSocket('ws://127.0.0.1:' + this._wsPort);

      this._autoWs.onopen = () => {
        this._autoWsConnected = true;
        console.log('[MCPBridge] Bridge listener connected (auto)');
      };

      this._autoWs.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'connected') {
            console.log('[MCPBridge] Bridge handshake:', data.message);
          } else if (data.type === 'bridge-request' && data.requestId) {
            // Bidirectional: MCP server is requesting data from the engine
            this._handleBridgeRequest(data);
          } else {
            this._emitEvent(data as MCPEvent);
          }
        } catch { /* ignore */ }
      };

      this._autoWs.onclose = () => {
        this._autoWs = null;
        this._autoWsConnected = false;
        // Reconnect after interval — runs forever
        this._autoWsTimer = setTimeout(() => {
          this._autoWsTimer = null;
          this._autoWsConnect();
        }, this._autoWsInterval);
      };

      this._autoWs.onerror = () => {
        // onclose fires after this
      };
    } catch {
      this._autoWsTimer = setTimeout(() => {
        this._autoWsTimer = null;
        this._autoWsConnect();
      }, this._autoWsInterval);
    }
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

  /**
   * Register a handler for a specific bridge request type.
   * Called when the MCP server sends a { type: 'bridge-request', action: '...', requestId } message.
   */
  onBridgeRequest(action: string, handler: BridgeRequestHandler): void {
    this._requestHandlers.set(action, handler);
  }

  /**
   * Handle an incoming bridge request from the MCP server.
   * Dispatches to registered handler, sends response back over WebSocket.
   */
  private async _handleBridgeRequest(data: any): Promise<void> {
    const { requestId, action } = data;
    const handler = this._requestHandlers.get(action);
    let response: Record<string, unknown>;
    if (handler) {
      try {
        const result = await handler(data);
        response = { type: 'bridge-response', requestId, success: true, ...(result || {}) };
      } catch (err: any) {
        response = { type: 'bridge-response', requestId, success: false, error: err.message || 'Handler error' };
      }
    } else {
      response = { type: 'bridge-response', requestId, success: false, error: 'Unknown action: ' + action };
    }
    // Send response back via the auto-reconnect WebSocket
    if (this._autoWs && this._autoWs.readyState === WebSocket.OPEN) {
      this._autoWs.send(JSON.stringify(response));
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