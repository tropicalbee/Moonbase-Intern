import * as THREE from 'three';

/** Temporary material copies affect only the active speaker, never shared props. */
export class SpeakerHighlight {
  constructor() { this.object = null; this.meshes = []; this.materials = new Set(); this.visible = false; }

  select(object) {
    if (this.object === object) return;
    this.clear(); this.object = object;
    const copies = new Map(), accent = new THREE.Color(0xb3c4d1), glow = accent.clone().multiplyScalar(.12);
    const copy = material => {
      if (copies.has(material)) return copies.get(material);
      const highlighted = material.clone();
      // Three.js clones omit shader hooks. Keep the room's lighting treatment
      // while a temporary speaker material is displayed.
      highlighted.onBeforeCompile = material.onBeforeCompile;
      highlighted.customProgramCacheKey = material.customProgramCacheKey;
      if (highlighted.emissive) { highlighted.emissive.copy(material.emissive).multiplyScalar(material.emissiveIntensity ?? 1).add(glow); highlighted.emissiveIntensity = 1; }
      else if (highlighted.color) highlighted.color.lerp(accent,.12);
      copies.set(material,highlighted); this.materials.add(highlighted); return highlighted;
    };
    object.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      const highlighted = Array.isArray(original) ? original.map(copy) : copy(original);
      this.meshes.push({ mesh, original, highlighted });
    });
  }

  setVisible(visible) {
    visible = !!visible;
    if (visible === this.visible) return;
    this.visible = visible;
    for (const { mesh, original, highlighted } of this.meshes) {
      if (visible && mesh.material === original) mesh.material = highlighted;
      else if (!visible && mesh.material === highlighted) mesh.material = original;
    }
  }

  clear() {
    this.setVisible(false);
    for (const material of this.materials) material.dispose();
    this.materials.clear(); this.meshes = []; this.object = null;
  }
}
