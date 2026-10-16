import { deriveEmergencyState } from './EmergencyState.js';

/** One owner in the existing loop; adapters never write simulation values. */
export class EmergencyPresentation {
  constructor({ getContext, adapters = [] }) {
    this.getContext = getContext; this.adapters = adapters;
    this.generation = 0; this.identities = new Map(); this.serials = new Map();
    this.live = new Set();
    this.events = []; this.bindings = []; this.active = false; this.terminal = false;
    this.snapshot = deriveEmergencyState();
  }

  attach(systems) {
    for (const [system, controller] of Object.entries(systems)) {
      if (!controller) continue;
      const model = controller.model, original = model.onEvent;
      const callback = event => { this.collect(system,event); original.call(model,event); };
      model.onEvent = callback; controller.presentation = this;
      this.bindings.push({ controller, model, original, callback });
    }
  }

  collect(system, event, generation = this.generation) {
    if (generation !== this.generation || this.terminal || this.disposed) return;
    if (system === 'shift') {
      if (event.type === 'shift-event' && event.triggered) {
        const old = this.identities.get(event.event.system), id = `${generation}/${event.event.system}/${event.event.id}`;
        this.identities.set(event.event.system,id);
        for (const queued of this.events) if (queued.id === old) queued.id = id;
      }
      return;
    }
    if (!/-(fault|critical|blackout|lost|stalled|restored)$/.test(event.type)) return;
    if (event.type.endsWith('-fault')) {
      if(this.live.has(system))return;
      this.live.add(system);
      const serial = (this.serials.get(system) ?? 0) + 1;
      this.serials.set(system,serial); this.identities.set(system,`${generation}/${system}/${serial}`);
    }
    const id = this.identities.get(system) ?? `${generation}/${system}/state`;
    if(event.type.endsWith('-restored'))this.live.delete(system);
    if (!this.events.some(e => e.id === id && e.type === event.type)) this.events.push({ system, id, type:event.type, generation,at:this.getContext().shift?.elapsed??0 });
    if (this.events.length > 64) this.events.splice(0,this.events.length-64);
  }

  setActive(active) {
    active = !!active && !this.terminal && !this.disposed;
    if (this.active === active) return;
    this.active = active;
    // Resume derives present state. Old onset cues never queue during pause.
    this.events = [];
    this.snapshot = deriveEmergencyState({ ...this.getContext(), identities:this.identities, generation:this.generation, previous:this.snapshot });
    for (const adapter of this.adapters) adapter.setActive?.(active,this.snapshot);
  }

  update(delta) {
    if (!this.active || !Number.isFinite(delta) || delta < 0) return this.snapshot;
    const context = this.getContext();
    this.snapshot = deriveEmergencyState({ ...context, identities:this.identities, generation:this.generation, previous:this.snapshot });
    if (this.snapshot.category === 'TERMINAL') { this.terminate(); return this.snapshot; }
    // A stalled frame may cross several thresholds. Emit only the final useful cue per incident.
    const latest = new Map();
    for (const event of this.events) {
      if (event.id !== this.identities.get(event.system)) continue;
      const incident = this.snapshot.incidents.find(i => i.id === event.id);
      if (event.type.endsWith('-restored') || incident) latest.set(event.id,event);
    }
    this.events = [];
    const events = [...latest.values()];
    for (const adapter of this.adapters) adapter.update?.(this.snapshot,delta,events,context);
    return this.snapshot;
  }

  configure(settings) { for (const adapter of this.adapters) adapter.configure?.(settings); }

  terminate() {
    this.snapshot=deriveEmergencyState({...this.getContext(),identities:this.identities,generation:this.generation,previous:this.snapshot});
    this.terminal = true; this.active = false; this.events = [];
    for (const adapter of this.adapters) adapter.terminate?.();
  }

  reset() {
    this.generation++; this.identities.clear(); this.serials.clear(); this.live.clear(); this.events = [];
    this.terminal = false; this.active = false; this.snapshot = deriveEmergencyState({ generation:this.generation });
    for (const adapter of this.adapters) adapter.reset?.();
  }

  dispose() {
    if(this.disposed)return;
    this.reset();
    this.disposed=true;
    for (const {controller,model,original,callback} of this.bindings) {
      if (model.onEvent === callback) model.onEvent = original;
      if (controller.presentation === this) controller.presentation = null;
    }
    this.bindings = [];
    for (const adapter of this.adapters) adapter.dispose?.();
  }
}
