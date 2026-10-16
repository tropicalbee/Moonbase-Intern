import * as THREE from 'three';
import {MeshRayBounds,prepareRayBounds} from './MeshRayBounds.js';

function visible(object) {
  for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible || ancestor.userData?.presentationOnly) return false;
  }
  const material = object.material;
  return Array.isArray(material) ? material.some(item => item?.visible !== false) : material?.visible !== false;
}

// Sparse meshes can have empty space at their center. Use actual triangle
// interiors as fallback sight points, spread across the mesh's three axes.
function surfaceSightPoints(geometry) {
  const positions = geometry.getAttribute('position'), indices = geometry.index;
  const count = indices?.count ?? positions?.count ?? 0;
  const points = Array(6).fill(null);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (let i = 0; i + 2 < count; i += 3) {
    a.fromBufferAttribute(positions, indices ? indices.getX(i) : i);
    b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1);
    c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2);
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    for (let axis = 0; axis < 3; axis++) {
      const low = axis * 2, high = low + 1, value = center.getComponent(axis);
      if (!points[low] || value < points[low].getComponent(axis)) points[low] = center.clone();
      if (!points[high] || value > points[high].getComponent(axis)) points[high] = center.clone();
    }
  }
  return points.filter(Boolean);
}

/** Cached mesh registry; no scene traversal during gameplay updates. */
export class InteractionManager {
  constructor({ maxRange = 3.5, onFocus = () => {} } = {}) {
    if (!Number.isFinite(maxRange) || maxRange <= 0) throw new Error('Invalid interaction range');
    this.maxRange = maxRange;
    this.onFocus = onFocus;
    this.targets = new Map();
    this.owners = new Map();
    this.occluders = new Set();
    this.focus = null;
    this.focusPoint = null;
    this.focusWorld = new THREE.Vector3();
    this.enabled = false;
    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2();
    this.sphere = new THREE.Sphere();
    this.offset = new THREE.Vector3();
    this.hits = [];
    this.blockerHits = [];
    this.surfacePoints = new WeakMap();
    this.sightPoint = new THREE.Vector3();
    this.sightMeshes = [];
    this.meshBounds = new MeshRayBounds();
  }

  register(object, { id, label, action = 'Inspect', range = this.maxRange, onInteract }) {
    if (!object?.isObject3D || !id || !label || typeof onInteract !== 'function' ||
        !Number.isFinite(range) || range <= 0 || range > this.maxRange) throw new Error('Invalid interactable');
    if (this.targets.has(id)) throw new Error(`Duplicate interactable: ${id}`);
    const meshes = [];
    object.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (this.owners.has(mesh)) throw new Error('Mesh already registered');
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      meshes.push(mesh);
    });
    if (!meshes.length) throw new Error('Interactable has no meshes');
    const target = { id, label, action, range, object, meshes, onInteract };
    this.targets.set(id, target);
    for (const mesh of meshes) this.owners.set(mesh, target);
    return () => this.unregister(id);
  }

  unregister(id) {
    const target = this.targets.get(id);
    if (!target) return;
    for (const mesh of target.meshes) this.owners.delete(mesh);
    this.targets.delete(id);
    if (this.focus?.id === id) this.setFocus(null);
  }

  setOccluders(roots) {
    this.occluders.clear();
    for (const root of roots) root.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      prepareRayBounds(mesh.geometry);
      this.occluders.add(mesh);
    });
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) this.setFocus(null);
  }

  setFocus(target) {
    if (!target) this.focusPoint = null;
    if (this.focus === target) return;
    this.focus = target;
    this.onFocus(target ? { id: target.id, label: target.label, action: target.action } : null);
  }

  intersectsRange(mesh, range = this.maxRange) {
    if (!visible(mesh)) return false;
    mesh.updateWorldMatrix(true, false);
    this.sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
    this.offset.subVectors(this.sphere.center, this.raycaster.ray.origin);
    const distance = this.offset.dot(this.raycaster.ray.direction);
    return distance + this.sphere.radius >= 0 && distance - this.sphere.radius <= range &&
      this.raycaster.ray.distanceSqToPoint(this.sphere.center) <= this.sphere.radius ** 2 &&
      this.meshBounds.mayHit(mesh, this.raycaster.ray, range);
  }

  update(camera) {
    if (!this.enabled) return;
    camera.updateWorldMatrix(true, false);
    if (!camera.matrixWorld.elements.every(Number.isFinite)) { this.setFocus(null); return; }
    this.raycaster.setFromCamera(this.center, camera);
    this.raycaster.near = 0;
    this.raycaster.far = this.maxRange;
    const target = this.resolveRay();
    this.setFocus(target);
    if (target) { this.focusWorld.copy(this.hits[0].point); this.focusPoint = this.focusWorld; }
  }

  resolveRay(source = null) {
    // Bounds alone are not a hit: hollow or out-of-reach targets must not
    // trigger a full station raycast for every fallback sight point.
    this.hits.length = 0;
    for (const mesh of source ? source.meshes : this.owners.keys()) {
      if (this.intersectsRange(mesh, this.raycaster.far)) this.raycaster.intersectObject(mesh, false, this.hits);
    }
    this.hits.sort((a, b) => a.distance - b.distance);
    const hit = this.hits[0], target = hit && this.owners.get(hit.object);
    if (!target || hit.distance > target.range) return null;
    const far = this.raycaster.far;
    this.raycaster.far = hit.distance;
    try {
      // Target-specific dialogue still respects other registered objects,
      // including those not explicitly supplied to setOccluders().
      if (source) for (const [mesh, owner] of this.owners) {
        if (owner !== source && this.occludesRay(mesh, hit.distance)) return null;
      }
      for (const mesh of this.occluders) {
        if (!this.owners.has(mesh) && this.occludesRay(mesh, hit.distance)) return null;
      }
      return target;
    } finally { this.raycaster.far = far; }
  }

  occludesRay(mesh, distance) {
    if (!this.intersectsRange(mesh, distance)) return false;
    // Raycaster sorts its result array: keep blockers separate so they cannot
    // reorder the saved target hit used to project the interaction prompt.
    this.blockerHits.length = 0;
    this.raycaster.intersectObject(mesh, false, this.blockerHits);
    return this.blockerHits.length > 0 && this.blockerHits[0].distance < distance;
  }

  canSee(id, camera) {
    const target = this.targets.get(id);
    if (!this.enabled || !target) return false;
    camera.updateWorldMatrix(true, false);
    if (!camera.matrixWorld.elements.every(Number.isFinite)) return false;
    this.raycaster.near = 0; this.raycaster.far = target.range;
    this.raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
    this.sightMeshes.length = 0;
    for (const mesh of target.meshes) {
      if (!visible(mesh)) continue;
      mesh.updateWorldMatrix(true, false);
      this.sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      const reach = target.range + this.sphere.radius;
      if (this.sphere.center.distanceToSquared(this.raycaster.ray.origin) <= reach * reach) this.sightMeshes.push(mesh);
    }
    // Proximity dialogue doesn't require crosshair aim, but still respects
    // range and actual wall/glass geometry. Try the target's cached mesh centers.
    for (const mesh of this.sightMeshes) {
      this.sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      this.raycaster.ray.direction.copy(this.sphere.center).sub(this.raycaster.ray.origin).normalize();
      if (this.resolveRay(target)?.id === id) return true;
    }
    // A center ray can pass between visible stems or flowers. Keep the same
    // range and blocker checks, but also aim at real mesh surfaces.
    for (const mesh of this.sightMeshes) {
      let points = this.surfacePoints.get(mesh.geometry);
      if (!points) {
        points = surfaceSightPoints(mesh.geometry);
        this.surfacePoints.set(mesh.geometry, points);
      }
      for (const point of points) {
        this.sightPoint.copy(point).applyMatrix4(mesh.matrixWorld);
        this.raycaster.ray.direction.copy(this.sightPoint).sub(this.raycaster.ray.origin).normalize();
        if (this.resolveRay(target)?.id === id) return true;
      }
    }
    return false;
  }

  /** Presentation query only. It neither changes focus nor permits actions. */
  canSeeAnchor(id, camera, point, inside = false) {
    const target = this.targets.get(id);
    if (!this.enabled || !target || !point?.toArray().every(Number.isFinite)) return false;
    if (!target.meshes.some(mesh => visible(mesh))) return false;
    camera.updateWorldMatrix(true, false);
    if (!camera.matrixWorld.elements.every(Number.isFinite)) return false;
    this.raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
    const distance = this.raycaster.ray.origin.distanceTo(point);
    if (distance < 1e-6) return false;
    this.raycaster.ray.direction.copy(point).sub(this.raycaster.ray.origin).normalize();
    this.raycaster.near = 0; this.raycaster.far = distance + .06;
    this.hits.length = 0;
    for (const mesh of target.meshes) {
      if (this.intersectsRange(mesh, this.raycaster.far)) this.raycaster.intersectObject(mesh, false, this.hits);
    }
    const hit = this.hits[0];
    if (hit && hit.distance < distance - .06 && !inside) return false;
    // Back faces already hidden by the source need no world scan. For a valid
    // source point, only geometry before the first source surface can hide it.
    const limit = Math.min(distance, hit?.distance ?? distance), far = this.raycaster.far;
    this.raycaster.far = limit;
    try {
      for (const mesh of this.occluders) {
        if (this.owners.get(mesh) !== target && this.occludesRay(mesh, limit)) return false;
      }
      return true;
    } finally { this.raycaster.far = far; }
  }

  interact(camera) {
    if (!this.enabled) return false;
    // Revalidate on E: a rover or door may have moved since the last frame.
    this.update(camera);
    if (!this.focus) return false;
    this.focus.onInteract({ id: this.focus.id, object: this.focus.object });
    return true;
  }
}
