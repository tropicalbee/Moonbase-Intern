import { ProximityTrigger } from '../interactions/ProximityTrigger.js';

/** Enter, linger, speak once. Leaving and returning rearms after cooldown. */
export class AutomaticDialogue {
  constructor({ canSee, dwell = .6, cooldown = 30 }) {
    Object.assign(this, { canSee, dwell, cooldown });
    this.entries = [];
  }

  register({ id, object, radius, speak, cooldown=this.cooldown, waitForCooldown=false }) {
    if(!Number.isFinite(cooldown)||cooldown<0)throw new Error('Invalid dialogue cooldown');
    const entry = { id, object, speak, cooldown, remaining: 0, pending: false, linger: 0 };
    entry.trigger = new ProximityTrigger({ object, radius, cooldown: 0,
      onEnter: () => { entry.pending = waitForCooldown||entry.remaining === 0; entry.linger = 0; },
      onExit: () => { entry.pending = false; entry.linger = 0; } });
    this.entries.push(entry);
  }

  update(position, delta) {
    if (!Number.isFinite(delta) || delta < 0 || !position?.toArray().every(Number.isFinite)) return;
    for (const entry of this.entries) {
      entry.remaining = Math.max(0, entry.remaining - delta);
      entry.trigger.update(position, delta);
      if (!entry.pending) continue;
      if (!this.canSee(entry.id)) { entry.linger = 0; continue; }
      entry.linger += delta;
    }
    // Nearby objects don't interrupt each other. Failed speech requests remain
    // pending only while the player is still close enough to hear them.
    const ready = this.entries.filter(entry => entry.pending && entry.remaining === 0 && entry.linger >= this.dwell)
      .sort((a, b) => position.distanceToSquared(a.trigger.center) - position.distanceToSquared(b.trigger.center));
    for (const entry of ready) if (entry.speak()) {
      entry.pending = false; entry.remaining = entry.cooldown; entry.linger = 0;
      break;
    }
  }

  reset() {
    for (const entry of this.entries) {
      entry.remaining = 0; entry.pending = false; entry.linger = 0; entry.trigger.reset();
    }
  }
}
