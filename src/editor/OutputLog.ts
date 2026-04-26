/**
 * OutputLog — a visible on-screen log panel for Print String output.
 * Shows a scrollable, time-stamped list of messages that appears at the
 * bottom of the editor when Play is active.
 *
 * Also keeps a ring-buffered structured backlog (level + timestamp +
 * message) so external tools (MCP bridge, profiler, etc.) can read
 * recent print output and runtime errors without scraping the DOM.
 */

export type OutputLogLevel = 'info' | 'warn' | 'error';

export interface OutputLogEntry {
  level: OutputLogLevel;
  timestamp: number;
  message: string;
}

export class OutputLog {
  private _container: HTMLElement;
  private _list: HTMLElement;
  private _header: HTMLElement;
  private _count = 0;

  /** Ring buffer of recent log entries (newest last). */
  private _entries: OutputLogEntry[] = [];
  /** Subset of entries with level 'error' (newest last). */
  private _errors: OutputLogEntry[] = [];
  private static readonly MAX_BUFFERED = 1000;
  private static readonly MAX_BUFFERED_ERRORS = 200;

  constructor(parent: HTMLElement) {
    this._container = document.createElement('div');
    this._container.className = 'output-log';

    // Header bar
    this._header = document.createElement('div');
    this._header.className = 'output-log-header';
    this._header.innerHTML = `<span>Output Log</span><button class="output-log-clear" title="Clear">✕</button>`;
    this._container.appendChild(this._header);

    // Scrollable message list
    this._list = document.createElement('div');
    this._list.className = 'output-log-list';
    this._container.appendChild(this._list);

    parent.appendChild(this._container);

    // Clear button
    this._header.querySelector('.output-log-clear')!
      .addEventListener('click', () => this.clear());
  }

  /** Append a message to the log (called by Engine.onPrint). */
  log(value: any): void {
    this._appendEntry('info', String(value));
  }

  /** Append a warning. */
  warn(value: any): void {
    this._appendEntry('warn', String(value));
  }

  /** Append an error message. Goes into both the main buffer and the error backlog. */
  error(value: any): void {
    this._appendEntry('error', String(value));
  }

  private _appendEntry(level: OutputLogLevel, message: string): void {
    const entry: OutputLogEntry = { level, timestamp: Date.now(), message };
    this._entries.push(entry);
    if (this._entries.length > OutputLog.MAX_BUFFERED) this._entries.shift();
    if (level === 'error') {
      this._errors.push(entry);
      if (this._errors.length > OutputLog.MAX_BUFFERED_ERRORS) this._errors.shift();
    }

    this._count++;
    const dom = document.createElement('div');
    dom.className = 'output-log-entry output-log-' + level;

    const ts = document.createElement('span');
    ts.className = 'output-log-ts';
    const now = new Date(entry.timestamp);
    ts.textContent = `[${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}]`;

    const msg = document.createElement('span');
    msg.className = 'output-log-msg';
    msg.textContent = message;

    dom.appendChild(ts);
    dom.appendChild(msg);
    this._list.appendChild(dom);

    // Auto-scroll to bottom
    this._list.scrollTop = this._list.scrollHeight;

    // Limit to 200 visible entries to keep perf
    if (this._count > 200) {
      const first = this._list.firstElementChild;
      if (first) first.remove();
    }

    // Show the panel
    this._container.classList.add('visible');
  }

  /** Read the recent log entries (most recent N, optionally filtered by level). */
  getEntries(limit = 100, level?: OutputLogLevel): OutputLogEntry[] {
    const src = level ? this._entries.filter(e => e.level === level) : this._entries;
    if (limit <= 0 || limit >= src.length) return src.slice();
    return src.slice(src.length - limit);
  }

  /** Read the recent error entries (most recent N). */
  getErrors(limit = 100): OutputLogEntry[] {
    if (limit <= 0 || limit >= this._errors.length) return this._errors.slice();
    return this._errors.slice(this._errors.length - limit);
  }

  /** Remove all log entries (DOM + buffers). */
  clear(): void {
    this._list.innerHTML = '';
    this._count = 0;
    this._entries = [];
    this._errors = [];
  }

  /** Show / hide the log panel */
  show(): void {
    this._container.classList.add('visible');
  }

  hide(): void {
    this._container.classList.remove('visible');
  }
}
