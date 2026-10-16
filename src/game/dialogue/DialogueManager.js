const priorities = Object.freeze({ ambient: 0, introduction: 10, contextual: 20, important: 30, urgent: 40 });

/** One visible line and one protected discovery; true pauses preserve both. */
export class DialogueManager {
  constructor({ container, speaker, text }) {
    Object.assign(this, { container, speaker, text });
    this.remaining = 0;
    this.active = false;
    this.acknowledged = new Set();
    this.clear();
  }

  show({ speaker, text, sourceId = null, duration = 6, manual = false, kind = 'ambient', id = null, validWhile = null }) {
    if (!speaker?.trim() || !text?.trim() || !Number.isFinite(duration) || duration <= 0 ||
        !Object.hasOwn(priorities, kind) || (validWhile !== null && typeof validWhile !== 'function')) return false;
    if (id && (this.current?.id === id || this.suspended?.id === id || this.acknowledged.has(id))) return false;
    if (kind === 'important' && this.suspended) return false;
    if (this.current && !manual && (kind !== 'urgent' || priorities[kind] <= priorities[this.current.kind])) return false;
    this.interrupt();
    this.current = { speaker, text, sourceId, duration, kind, id, validWhile };
    this.remaining = duration;
    this.render();
    return true;
  }

  setActive(active, { reason = 'pause' } = {}) {
    if (reason === 'terminal') this.clear();
    else if (!active && reason === 'repair') this.interrupt();
    this.active = !!active;
    this.render();
  }

  /** Irrelevance advances with simulation even when a repair hides the panel. */
  reconcile(context, { chatterBlocked = false, importantBlocked = false } = {}) {
    const line = this.current;
    if (line?.kind === 'important') {
      if (importantBlocked) this.interrupt();
    } else if (line && ((line.validWhile && !line.validWhile(context)) || (chatterBlocked && line.kind !== 'urgent'))) {
      this.current = null;
      this.remaining = 0;
    }
    if (this.active && !importantBlocked && !this.current && this.suspended) {
      this.current = this.suspended;
      this.suspended = null;
      this.remaining = this.current.duration;
    }
    this.render();
  }

  interrupt() {
    if (this.current?.kind === 'important') this.suspended = this.current;
    this.current = null;
    this.remaining = 0;
    this.render();
  }

  acknowledge() {
    if (!this.active || this.current?.kind !== 'important') return false;
    if (this.current.id) this.acknowledged.add(this.current.id);
    this.current = null;
    this.remaining = 0;
    this.render();
    return true;
  }

  update(delta) {
    if (!this.active || !Number.isFinite(delta) || delta < 0 || this.remaining <= 0) return;
    if (this.current?.kind === 'important') return;
    this.remaining = Math.max(0, this.remaining - delta);
    if (this.remaining === 0) { this.current = null; this.render(); }
  }

  render() {
    this.sourceId = this.current?.sourceId ?? null;
    this.container.hidden = !this.active || !this.current;
    const speaker = this.current?.speaker ?? '';
    const text = this.current ? this.current.text + (this.current.kind === 'important' ? ' [Enter to dismiss]' : '') : '';
    if (this.speaker.textContent !== speaker) this.speaker.textContent = speaker;
    if (this.text.textContent !== text) this.text.textContent = text;
  }

  clear() {
    this.current = null;
    this.suspended = null;
    this.remaining = 0;
    this.render();
  }

  reset() {
    this.clear();
    this.acknowledged.clear();
  }
}
