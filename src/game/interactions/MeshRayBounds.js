import * as THREE from 'three';

const cached = new WeakMap(), chunkSize = 48;

/** CPU-only bounds for consecutive groups of 16 triangles; geometry stays intact. */
export function prepareRayBounds(geometry) {
  const position = geometry.getAttribute('position'), index = geometry.index;
  const count = index?.count ?? position?.count ?? 0;
  if (!position || count < 1536 || count % 3 || geometry.morphAttributes.position?.length) return null;
  const positionVersion = position.isInterleavedBufferAttribute ? position.data.version : position.version;
  let entry = cached.get(geometry);
  if (entry?.position === position && entry.index === index && entry.positionVersion === positionVersion && entry.indexVersion === index?.version) return entry.boxes;
  const boxes = [], point = new THREE.Vector3();
  for (let start = 0; start < count; start += chunkSize) {
    const box = new THREE.Box3();
    for (let offset = start; offset < Math.min(count, start + chunkSize); offset++) {
      point.fromBufferAttribute(position, index ? index.getX(offset) : offset);box.expandByPoint(point);
    }
    boxes.push(box.expandByScalar(1e-6));
  }
  entry = {position,index,positionVersion,indexVersion:index?.version,boxes};
  cached.set(geometry, entry);
  return boxes;
}

export class MeshRayBounds {
  constructor(){this.inverse = new THREE.Matrix4();this.ray = new THREE.Ray();this.end = new THREE.Vector3();this.hit = new THREE.Vector3();}

  mayHit(mesh, ray, far) {
    // Deformed, instanced, or custom raycasts own their own spatial rules.
    if (mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.raycast !== THREE.Mesh.prototype.raycast || !Number.isFinite(far)) return true;
    const geometry = mesh.geometry;
    if (geometry.drawRange.start % 3 || geometry.groups.some(group => group.start % 3)) return true;
    const boxes = prepareRayBounds(geometry);if (!boxes) return true;
    if (mesh.matrixWorld.determinant() === 0) return true;
    this.inverse.copy(mesh.matrixWorld).invert();
    this.ray.copy(ray).applyMatrix4(this.inverse);
    ray.at(far, this.end).applyMatrix4(this.inverse);
    const reach = this.ray.origin.distanceToSquared(this.end) + 1e-8;
    for (const box of boxes) {
      if (box.containsPoint(this.ray.origin)) return true;
      if (this.ray.intersectBox(box, this.hit) && this.ray.origin.distanceToSquared(this.hit) <= reach) return true;
    }
    return false;
  }
}
