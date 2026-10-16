import * as THREE from 'three';

const equipmentHeights = Object.freeze({ 'command-pod': 1.45, pod: 1.35, console: 1.2, 'power-cell': 1.4, dish: 1.4, 'solar-panel': 1.35 });

/** Bounds in the source's own frame, including fitted/rotated GLB children. */
function localBounds(object) {
  object.updateWorldMatrix(true, true);
  const inverse = object.matrixWorld.clone().invert(), bounds = new THREE.Box3(), matrix = new THREE.Matrix4();
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
  });
  return bounds;
}

/** Cached body or service-face points; no new scene geometry or transforms. */
export class DialogueAnchors {
  constructor(object, id, { serviceHeight = equipmentHeights[id] } = {}) {
    this.object = object;
    this.bounds = localBounds(object);
    this.candidates = [];
    this.selected = null;
    this.epoch = -1;
    this.world = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.cameraWorld = new THREE.Vector3();
    if (this.bounds.isEmpty()) return;
    const size = this.bounds.getSize(new THREE.Vector3()), center = this.bounds.getCenter(new THREE.Vector3());
    const scale = new THREE.Vector3().setFromMatrixScale(object.matrixWorld);
    const height = size.y * scale.y;
    const localHeight = worldHeight => this.bounds.min.y + Math.min(size.y * .85, worldHeight / (scale.y || 1));
    const body = center.clone(); body.y = localHeight(Math.min(height * .55, 1.55));
    if (serviceHeight) {
      // These GLBs have no separate named panel nodes. Sample their real hull at
      // a configured service/communication height, never their roof or center.
      const ray = new THREE.Raycaster(), target = center.clone(); target.y = localHeight(serviceHeight);
      for (const [name, axis, sign] of [['front','z',1],['right','x',1],['left','x',-1],['rear','z',-1]]) {
        const origin = target.clone(); origin[axis] += sign * (size[axis] + 1);
        origin.applyMatrix4(object.matrixWorld);
        const destination = target.clone().applyMatrix4(object.matrixWorld);
        ray.set(origin, destination.sub(origin).normalize());
        const hit = ray.intersectObject(object, true)[0];
        if (!hit) continue;
        const point = object.worldToLocal(hit.point.clone().addScaledVector(ray.ray.direction, -.025));
        this.candidates.push({ id: name, point, inside: false, visible: false, priority: name === 'front' ? .08 : 0 });
      }
    } else {
      const head = center.clone(); head.y = this.bounds.min.y + size.y * .9;
      this.candidates.push({ id: 'head', point: head, inside: true, visible: false, priority: .12 });
      this.candidates.push({ id: 'body', point: body, inside: true, visible: false, priority: 0 });
    }
    // A sparse/irregular equipment mesh can have no surface at service height.
    // It has no suitable local anchor in that case; do not invent a roof point.
  }

  refresh(camera, epoch, canSee) {
    if (this.epoch === epoch) return;
    this.epoch = epoch;
    this.object.updateWorldMatrix(true, false);
    for (const candidate of this.candidates) {
      this.world.copy(candidate.point).applyMatrix4(this.object.matrixWorld);
      candidate.visible = !!canSee(this.world, candidate.inside);
    }
  }

  choose(camera, focusPoint = null) {
    this.object.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    this.cameraWorld.setFromMatrixPosition(camera.matrixWorld);
    let best = null, bestScore = Infinity, selectedScore = Infinity;
    for (const candidate of this.candidates) {
      if (!candidate.visible) continue;
      this.world.copy(candidate.point).applyMatrix4(this.object.matrixWorld);
      this.view.copy(this.world).applyMatrix4(camera.matrixWorldInverse);
      this.projected.copy(this.world).project(camera);
      const { x, y, z } = this.projected;
      // Entry inset plus sticky selection avoids edge flicker without keeping
      // a point that has actually left the view or moved behind the camera.
      const limit = candidate === this.selected ? 1 : .985;
      if (![x,y,z,this.view.z].every(Number.isFinite) || this.view.z >= 0 || z < -1 || z > 1 || Math.abs(x) > limit || Math.abs(y) > limit) continue;
      const focus = focusPoint ? Math.min(2, this.world.distanceTo(focusPoint)) * .3 : 0;
      const score = Math.abs(x) * .2 + Math.abs(y) * .35 + this.world.distanceTo(this.cameraWorld) * .025 + focus - candidate.priority;
      if (candidate === this.selected) selectedScore = score;
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    if (this.selected && Number.isFinite(selectedScore) && bestScore + .18 >= selectedScore) return this.selected;
    this.selected = best;
    return best;
  }

  reset() { this.selected = null; this.epoch = -1; for (const candidate of this.candidates) candidate.visible = false; }
}
