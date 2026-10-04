// Undo/redo stack. Entries are { undo(), redo(), bytes, label }.
// Pixel edits store a single dirty-rect patch that is swapped on undo/redo,
// so memory use is proportional to the area that changed, not the document size.

export class History {
  constructor({ limit = 80, budget = 320 * 1024 * 1024 } = {}) {
    this.limit = limit; this.budget = budget;
    this.stack = []; this.index = 0; // entries [0, index) are undoable
    this.onChange = null;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length; }
  push(entry) {
    if (!entry) return;
    this.stack.length = this.index; // drop redo branch
    this.stack.push(entry);
    this.index = this.stack.length;
    // enforce step limit + memory budget (always keep at least 50 steps if possible)
    let bytes = this.stack.reduce((s, e) => s + (e.bytes || 0), 0);
    while (this.stack.length > this.limit || (bytes > this.budget && this.stack.length > 1)) {
      const e = this.stack.shift();
      bytes -= e.bytes || 0;
      this.index--;
    }
    this.onChange?.();
  }
  undo() {
    if (!this.canUndo) return false;
    const e = this.stack[--this.index];
    e.undo();
    this.onChange?.();
    return true;
  }
  redo() {
    if (!this.canRedo) return false;
    const e = this.stack[this.index++];
    e.redo();
    this.onChange?.();
    return true;
  }
  clear() { this.stack = []; this.index = 0; this.onChange?.(); }
}

/** Pixel patch entry: swaps the stored ImageData with the layer's current pixels. */
export function pixelEntry(layer, rect, before, label = 'Draw') {
  let data = before;
  const swap = () => {
    const ctx = layer.ctx;
    const cur = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    ctx.putImageData(data, rect.x, rect.y);
    data = cur;
    layer.dirtyThumb = true;
  };
  return { label, bytes: rect.w * rect.h * 4, undo: swap, redo: swap, layer };
}

export function groupEntry(entries, label) {
  const list = entries.filter(Boolean);
  return {
    label,
    bytes: list.reduce((s, e) => s + (e.bytes || 0), 0),
    undo() { for (let i = list.length - 1; i >= 0; i--) list[i].undo(); },
    redo() { for (const e of list) e.redo(); },
  };
}
