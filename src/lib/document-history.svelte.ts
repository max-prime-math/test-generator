/** Bounded JSON history for document-sized state that is already serialized for recovery. */
export class JsonHistory {
  #undo: string[] = [];
  #redo: string[] = [];
  #current = '';
  #lastGroup = '';
  #lastGroupedAt = 0;
  revision = $state(0);

  constructor(private readonly limit = 100, private readonly maxBytes = 8 * 1024 * 1024) {}

  get canUndo(): boolean { this.revision; return this.#undo.length > 0; }
  get canRedo(): boolean { this.revision; return this.#redo.length > 0; }

  reset(serialized: string): void {
    this.#undo = [];
    this.#redo = [];
    this.#current = serialized;
    this.#lastGroup = '';
    this.#lastGroupedAt = 0;
    this.revision++;
  }

  /** Record the new state. Consecutive typing in one control is one undo step. */
  observe(serialized: string, group = ''): void {
    if (!this.#current) { this.reset(serialized); return; }
    if (serialized === this.#current) return;
    const now = Date.now();
    const coalesce = Boolean(group && group === this.#lastGroup && now - this.#lastGroupedAt < 1_000 && this.#undo.length);
    if (!coalesce) this.#push(this.#undo, this.#current);
    this.#redo = [];
    this.#current = serialized;
    this.#lastGroup = group;
    this.#lastGroupedAt = group ? now : 0;
    this.#trim();
    this.revision++;
  }

  undo(current = this.#current): string | null {
    this.observe(current);
    const restored = this.#undo.pop();
    if (restored === undefined) return null;
    this.#push(this.#redo, this.#current);
    this.#current = restored;
    this.#lastGroup = '';
    this.#lastGroupedAt = 0;
    this.revision++;
    return restored;
  }

  redo(current = this.#current): string | null {
    this.observe(current);
    const restored = this.#redo.pop();
    if (restored === undefined) return null;
    this.#push(this.#undo, this.#current);
    this.#current = restored;
    this.#lastGroup = '';
    this.#lastGroupedAt = 0;
    this.revision++;
    return restored;
  }

  #push(stack: string[], serialized: string): void {
    if (stack.at(-1) !== serialized) stack.push(serialized);
  }

  #trim(): void {
    while (this.#undo.length > this.limit) this.#undo.shift();
    while (this.#redo.length > this.limit) this.#redo.shift();
    let bytes = [...this.#undo, ...this.#redo].reduce((sum, value) => sum + value.length * 2, 0);
    while (bytes > this.maxBytes && this.#undo.length > 1) bytes -= this.#undo.shift()!.length * 2;
    while (bytes > this.maxBytes && this.#redo.length > 1) bytes -= this.#redo.shift()!.length * 2;
  }
}

const elementIds = new WeakMap<Element, number>();
let nextElementId = 1;

export function isTextEditingTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLElement && element.isContentEditable) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type);
}

/** Stable key used only to coalesce a burst of typing in the same control. */
export function activeHistoryGroup(): string {
  const element = typeof document === 'undefined' ? null : document.activeElement;
  if (!isTextEditingTarget(element) || !element) return '';
  let id = elementIds.get(element);
  if (!id) { id = nextElementId++; elementIds.set(element, id); }
  return `field:${id}`;
}

export function undoDirection(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'y') return 'redo';
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  return null;
}
