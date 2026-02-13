/**
 * OutputLog — a visible on-screen log panel for Print String output.
 * Shows a scrollable, time-stamped list of messages that appears at the
 * bottom of the editor when Play is active.
 */
export class OutputLog {
  private _container: HTMLElement;
  private _list: HTMLElement;
  private _header: HTMLElement;
  private _count = 0;

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

  /** Append a message to the log (called by Engine.onPrint) */
  log(value: any): void {
    this._count++;
    const entry = document.createElement('div');
    entry.className = 'output-log-entry';

    const ts = document.createElement('span');
    ts.className = 'output-log-ts';
    const now = new Date();
    ts.textContent = `[${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}]`;

    const msg = document.createElement('span');
    msg.className = 'output-log-msg';
    msg.textContent = String(value);

    entry.appendChild(ts);
    entry.appendChild(msg);
    this._list.appendChild(entry);

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

  /** Remove all log entries */
  clear(): void {
    this._list.innerHTML = '';
    this._count = 0;
  }

  /** Show / hide the log panel */
  show(): void {
    this._container.classList.add('visible');
  }

  hide(): void {
    this._container.classList.remove('visible');
  }
}
