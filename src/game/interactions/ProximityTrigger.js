import * as THREE from 'three';

/** Enter/exit transitions with cooldown measured in active simulation seconds. */
export class ProximityTrigger {
  constructor({ object, radius = 3, cooldown = 10, onEnter, onExit = () => {} }) {
    if (!object?.isObject3D || !Number.isFinite(radius) || radius <= 0 ||
        !Number.isFinite(cooldown) || cooldown < 0 || typeof onEnter !== 'function') {
      throw new Error('Invalid proximity trigger');
    }
    Object.assign(this, { object, radius, cooldown, onEnter, onExit });
    this.center = new THREE.Vector3();
    this.inside = false;
    this.remaining = 0;
  }

  update(position, delta) {
    if (!Number.isFinite(delta) || delta < 0 || !position?.toArray().every(Number.isFinite)) return;
    this.remaining = Math.max(0, this.remaining - delta);
    this.object.getWorldPosition(this.center);
    let visible = true;
    for (let ancestor = this.object; ancestor; ancestor = ancestor.parent) visible &&= ancestor.visible;
    const inside = visible && position.distanceToSquared(this.center) <= this.radius ** 2;
    if (inside && !this.inside && this.remaining === 0) {
      this.remaining = this.cooldown;
      this.onEnter();
    }
    if (!inside && this.inside) this.onExit();
    this.inside = inside;
  }

  reset() { this.inside = false; this.remaining = 0; }
}
