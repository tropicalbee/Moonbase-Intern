import * as THREE from 'three';

/** Cache a local anchor once; rigid moving props then only need projection. */
export function speakerAnchor(object) {
  const box = new THREE.Box3().setFromObject(object);
  const height = box.max.y - box.min.y;
  const point = box.getCenter(new THREE.Vector3());
  // Tall equipment uses its upper body so the label stays visible at ordinary
  // conversational distances; small props get an anchor above their top.
  point.y = height > 2 ? box.min.y + height * .72 : box.max.y + .18;
  return object.worldToLocal(point);
}

export class SpeakerMarker {
  constructor(element = { hidden: true, style: {}, textContent: '' }) {
    // The game uses this lightweight projection state, not a second nameplate.
    this.element = element;
    this.source = null;
    this.world = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.clear();
  }

  select({ object, anchor, anchors = null, label }) {
    this.source = { object, anchor, anchors };
    this.element.textContent = label;
  }

  update(camera, width, height, visible = true, focusPoint = null) {
    const source = this.source;
    if (!source || !visible || width <= 0 || height <= 0) { this.element.hidden = true; return; }
    for (let object = source.object; object; object = object.parent) {
      if (!object.visible) { this.element.hidden = true; return; }
    }
    source.object.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    const candidate = source.anchors?.choose(camera, focusPoint);
    if (source.anchors && !candidate) { this.element.hidden = true; return; }
    this.world.copy(candidate?.point ?? source.anchor).applyMatrix4(source.object.matrixWorld);
    this.view.copy(this.world).applyMatrix4(camera.matrixWorldInverse);
    this.projected.copy(this.world).project(camera);
    const { x, y, z } = this.projected;
    if (![x,y,z,this.view.z].every(Number.isFinite) || this.view.z >= 0 || z < -1 || z > 1 || Math.abs(x) > 1 || Math.abs(y) > 1) {
      this.element.hidden = true;
      return;
    }
    this.element.hidden = false;
    this.element.style.left = `${(x * .5 + .5) * width}px`;
    this.element.style.top = `${(-y * .5 + .5) * height}px`;
  }

  clear() { this.source = null; this.element.hidden = true; this.element.textContent = ''; }
}
