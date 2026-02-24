export type EventHandler = (...args: any[]) => void;

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, Set<EventHandler>> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  public off(event: string, handler: EventHandler): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(handler);
      if (this.listeners.get(event)!.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public emit(event: string, ...args: any[]): void {
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)!) {
        handler(...args);
      }
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
