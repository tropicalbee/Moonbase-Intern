import * as THREE from 'three';
import { circleOverlapsBox } from './DoorCollision.js';

export function createRoverCollision(rover) {
  rover.updateWorldMatrix(true, true);
  const inverse = rover.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  const relativeMatrix = new THREE.Matrix4();
  rover.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    relativeMatrix.multiplyMatrices(inverse, object.matrixWorld);
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(relativeMatrix));
  });
  if (bounds.isEmpty()) throw new Error('Cannot create rover collision without mesh bounds');
  const collision = {
    centerX: (bounds.min.x + bounds.max.x) / 2,
    centerZ: (bounds.min.z + bounds.max.z) / 2,
    halfX: (bounds.max.x - bounds.min.x) / 2,
    halfZ: (bounds.max.z - bounds.min.z) / 2,
    box: {},
  };
  writeBox(rover, collision, rover.position.x, rover.position.z, rover.rotation.y);
  return collision;
}

function writeBox(rover, collision, x, z, heading) {
  const box = collision.box;
  const offsetX = collision.centerX * rover.scale.x;
  const offsetZ = collision.centerZ * rover.scale.z;
  box.cos = Math.cos(heading);
  box.sin = Math.sin(heading);
  box.x = x + box.cos * offsetX + box.sin * offsetZ;
  box.z = z - box.sin * offsetX + box.cos * offsetZ;
  box.halfX = collision.halfX * Math.abs(rover.scale.x);
  box.halfZ = collision.halfZ * Math.abs(rover.scale.z);
}

export function moveRoverSafely(rover, collision, position, heading, visitor, visitorRadius) {
  if (![position.x, position.y, position.z, heading].every(Number.isFinite)) return false;
  const startX = rover.position.x;
  const startZ = rover.position.z;
  const startHeading = rover.rotation.y;
  const turn = Math.atan2(Math.sin(heading - startHeading), Math.cos(heading - startHeading));
  const travel = Math.hypot(position.x - startX, position.z - startZ);
  const cornerRadius = Math.hypot(collision.box.halfX, collision.box.halfZ);
  // Check the swept footprint, including turns: a clear endpoint alone could
  // allow the vehicle to cross a stationary player during a delayed frame.
  const steps = Math.max(1, Math.ceil((travel + cornerRadius * Math.abs(turn)) / .1));
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    writeBox(rover, collision,
      startX + (position.x - startX) * progress,
      startZ + (position.z - startZ) * progress,
      startHeading + turn * progress);
    if (visitor && circleOverlapsBox(visitor.x, visitor.z, visitorRadius, collision.box)) {
      writeBox(rover, collision, startX, startZ, startHeading);
      return false;
    }
  }
  rover.position.copy(position);
  rover.rotation.y = heading;
  return true;
}
