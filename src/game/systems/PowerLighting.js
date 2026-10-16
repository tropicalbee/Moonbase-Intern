import * as THREE from 'three';
import { LabSurfaceLighting } from './LabSurfaceLighting.js';

/** Lab fixtures and local surface fill; global daylight and material colors stay intact. */
export class PowerLighting {
  constructor(scene, { reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.factor = 1;
    this.faultTime = 0;
    this.fluctuation = 1;
    this.lights = [];
    this.fixtures = [];
    const copies = new Map();
    this.fixtureMaterials = copies;
    scene.traverse(object => {
      if (['Lab control light', 'Lab sample light'].includes(object.name)) this.lights.push({ object, intensity: object.intensity });
      if (object.name !== 'Lab ceiling fixture') return;
      const original = object.material;
      if (!copies.has(original)) copies.set(original, original.clone());
      object.material = copies.get(original);
      this.fixtures.push({ object, original, material:object.material, color: original.color.clone() });
    });
    this.surfaces = new LabSurfaceLighting(scene);
  }

  update(power, delta) {
    if (!Number.isFinite(delta) || delta < 0) return;
    const goal = power.needsRepair ? .12 + .88 * power.health / 100 : 1;
    this.factor = THREE.MathUtils.damp(this.factor, goal, 1.8, delta);
    // A slow brownout pulse, not a full-screen flash. Emergency supply stays steady.
    this.faultTime = power.needsRepair ? (this.faultTime + delta) % 20 : 0;
    const unstable = !this.reducedMotion && power.needsRepair && power.health > 0;
    const dip = .5 - .5 * Math.cos(this.faultTime * Math.PI * 1.4);
    this.fluctuation = unstable ? 1 - .55 * dip : 1;
    this.apply();
  }

  apply() {
    const output = Math.max(.12, this.factor * this.fluctuation);
    for (const { object, intensity } of this.lights) object.intensity = intensity * output;
    for (const { object, color } of this.fixtures) object.material.color.copy(color).multiplyScalar(output);
    this.surfaces.setOutput(output);
  }

  setReducedMotion(reduced) {
    this.reducedMotion = !!reduced;
    if (this.reducedMotion) this.fluctuation = 1;
    this.apply();
  }

  reset() { this.factor = 1; this.faultTime = 0; this.fluctuation = 1; this.apply(); }

  dispose() {
    this.reset(); this.surfaces.dispose();
    for(const {object,original,material} of this.fixtures)if(object.material===material)object.material=original;
    for(const material of this.fixtureMaterials.values())material.dispose();
    this.fixtureMaterials.clear();this.fixtures=[];this.lights=[];
  }
}
