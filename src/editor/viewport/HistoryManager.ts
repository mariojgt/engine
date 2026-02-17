/**
 * Undo/Redo history system — command pattern implementation.
 * Each action is recorded as an execute/undo pair.
 */

export interface HistoryCommand {
  name: string;
  execute: () => void;
  undo: () => void;
}

type HistoryEventType = 'historyChanged';

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
}

export class HistoryManager {
  private _history: HistoryCommand[] = [];
  private _currentIndex = -1;
  private _maxHistory: number;
  private _listeners: Map<HistoryEventType, Array<(state: HistoryState) => void>> = new Map();

  constructor(maxHistory = 100) {
    this._maxHistory = maxHistory;
  }

  execute(command: HistoryCommand): void {
    // Remove any future history (after current index)
    this._history = this._history.slice(0, this._currentIndex + 1);

    // Execute the command
    command.execute();

    // Add to history
    this._history.push(command);
    this._currentIndex++;

    // Limit history size
    if (this._history.length > this._maxHistory) {
      this._history.shift();
      this._currentIndex--;
    }

    this._emit();
  }

  undo(): void {
    if (!this.canUndo()) return;

    const command = this._history[this._currentIndex];
    command.undo();
    this._currentIndex--;

    this._emit();
  }

  redo(): void {
    if (!this.canRedo()) return;

    this._currentIndex++;
    const command = this._history[this._currentIndex];
    command.execute();

    this._emit();
  }

  canUndo(): boolean {
    return this._currentIndex >= 0;
  }

  canRedo(): boolean {
    return this._currentIndex < this._history.length - 1;
  }

  getUndoName(): string | null {
    return this.canUndo() ? this._history[this._currentIndex].name : null;
  }

  getRedoName(): string | null {
    return this.canRedo() ? this._history[this._currentIndex + 1].name : null;
  }

  clear(): void {
    this._history = [];
    this._currentIndex = -1;
    this._emit();
  }

  on(event: HistoryEventType, cb: (state: HistoryState) => void): void {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(cb);
  }

  off(event: HistoryEventType, cb: (state: HistoryState) => void): void {
    const cbs = this._listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(cb);
      if (idx >= 0) cbs.splice(idx, 1);
    }
  }

  private _emit(): void {
    const state: HistoryState = {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoName: this.getUndoName(),
      redoName: this.getRedoName(),
    };
    const cbs = this._listeners.get('historyChanged');
    if (cbs) cbs.forEach((cb) => cb(state));
  }
}
